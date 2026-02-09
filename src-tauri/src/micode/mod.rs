use serde_json::{json, Map, Value};
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio::time::{timeout, Instant};

pub(crate) mod args;
pub(crate) mod config;
pub(crate) mod home;

pub(crate) use crate::backend::app_server::WorkspaceSession;
use crate::backend::app_server::{
    build_micode_path_env, check_acp_handshake, check_micode_installation,
    spawn_workspace_session as spawn_workspace_session_inner,
};
use crate::backend::events::AppServerEvent;
use crate::event_sink::TauriEventSink;
use crate::remote_backend;
use crate::shared::{micode_core, workspaces_core};
use crate::shared::process_core::tokio_command;
use crate::state::AppState;
use crate::types::WorkspaceEntry;

pub(crate) async fn spawn_workspace_session(
    entry: WorkspaceEntry,
    default_micode_bin: Option<String>,
    agent_args: Option<String>,
    app_handle: AppHandle,
    agent_home: Option<PathBuf>,
) -> Result<Arc<WorkspaceSession>, String> {
    let client_version = app_handle.package_info().version.to_string();
    let event_sink = TauriEventSink::new(app_handle);
    spawn_workspace_session_inner(
        entry,
        default_micode_bin,
        agent_args,
        agent_home,
        client_version,
        event_sink,
    )
    .await
}

fn is_workspace_not_connected_error(error: &str) -> bool {
    error
        .to_ascii_lowercase()
        .contains("workspace not connected")
}

async fn collect_background_agent_text(
    rx: &mut mpsc::UnboundedReceiver<Value>,
    idle_timeout: Duration,
    max_wait: Duration,
) -> Result<String, String> {
    let started_at = Instant::now();
    let mut output = String::new();
    while started_at.elapsed() < max_wait {
        match timeout(idle_timeout, rx.recv()).await {
            Ok(Some(event)) => {
                let method = event.get("method").and_then(|m| m.as_str()).unwrap_or("");
                match method {
                    "item/agentMessage/delta" => {
                        if let Some(delta) = event
                            .get("params")
                            .and_then(|params| params.get("delta"))
                            .and_then(|d| d.as_str())
                        {
                            output.push_str(delta);
                        }
                    }
                    "turn/error" => {
                        let error_msg = event
                            .get("params")
                            .and_then(|p| p.get("error"))
                            .and_then(|e| e.as_str())
                            .unwrap_or("Unknown background generation error");
                        return Err(error_msg.to_string());
                    }
                    _ => {}
                }
            }
            Ok(None) => break,
            Err(_) => break,
        }
    }
    Ok(output)
}

async fn ensure_workspace_session_connected(
    state: &AppState,
    workspace_id: &str,
    app: &AppHandle,
) -> Result<(), String> {
    let has_session = { state.sessions.lock().await.contains_key(workspace_id) };
    if has_session {
        return Ok(());
    }
    let app_for_spawn = app.clone();
    workspaces_core::connect_workspace_core(
        workspace_id.to_string(),
        &state.workspaces,
        &state.sessions,
        &state.app_settings,
        move |entry, default_bin, agent_args, agent_home| {
            spawn_workspace_session(
                entry,
                default_bin,
                agent_args,
                app_for_spawn.clone(),
                agent_home,
            )
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn micode_doctor(
    micode_bin: Option<String>,
    micode_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let (default_bin, default_args) = {
        let settings = state.app_settings.lock().await;
        (settings.agent_bin.clone(), settings.agent_args.clone())
    };
    let resolved = micode_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let resolved_args = micode_args
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_args);
    let path_env = build_micode_path_env(resolved.as_deref());
    let version = check_micode_installation(resolved.clone()).await?;
    let app_server_ok = check_acp_handshake(resolved.clone(), resolved_args.clone()).await?;
    let (node_ok, node_version, node_details) = {
        let mut node_command = tokio_command("node");
        if let Some(ref path_env) = path_env {
            node_command.env("PATH", path_env);
        }
        node_command.arg("--version");
        node_command.stdout(std::process::Stdio::piped());
        node_command.stderr(std::process::Stdio::piped());
        match timeout(Duration::from_secs(5), node_command.output()).await {
            Ok(result) => match result {
                Ok(output) => {
                    if output.status.success() {
                        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        (
                            !version.is_empty(),
                            if version.is_empty() {
                                None
                            } else {
                                Some(version)
                            },
                            None,
                        )
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let detail = if stderr.trim().is_empty() {
                            stdout.trim()
                        } else {
                            stderr.trim()
                        };
                        (
                            false,
                            None,
                            Some(if detail.is_empty() {
                                "Node failed to start.".to_string()
                            } else {
                                detail.to_string()
                            }),
                        )
                    }
                }
                Err(err) => {
                    if err.kind() == ErrorKind::NotFound {
                        (false, None, Some("Node not found on PATH.".to_string()))
                    } else {
                        (false, None, Some(err.to_string()))
                    }
                }
            },
            Err(_) => (
                false,
                None,
                Some("Timed out while checking Node.".to_string()),
            ),
        }
    };
    let details = if app_server_ok {
        None
    } else {
        Some("Failed ACP initialize handshake (`micode --experimental-acp`).".to_string())
    };
    Ok(json!({
        "ok": version.is_some() && app_server_ok,
        "agentBin": resolved,
        "micodeBin": resolved,
        "version": version,
        "appServerOk": app_server_ok,
        "details": details,
        "path": path_env,
        "nodeOk": node_ok,
        "nodeVersion": node_version,
        "nodeDetails": node_details,
    }))
}

#[tauri::command]
pub(crate) async fn start_thread(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "start_thread",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    let result = micode_core::start_thread_core(&state.sessions, workspace_id.clone()).await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::start_thread_core(&state.sessions, workspace_id).await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn resume_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "resume_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    let result =
        micode_core::resume_thread_core(&state.sessions, workspace_id.clone(), thread_id.clone())
            .await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::resume_thread_core(&state.sessions, workspace_id, thread_id).await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn fork_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "fork_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    let result =
        micode_core::fork_thread_core(&state.sessions, workspace_id.clone(), thread_id.clone())
            .await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::fork_thread_core(&state.sessions, workspace_id, thread_id).await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn list_threads(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "list_threads",
            json!({ "workspaceId": workspace_id, "cursor": cursor, "limit": limit }),
        )
        .await;
    }

    let result = micode_core::list_threads_core(
        &state.sessions,
        workspace_id.clone(),
        cursor.clone(),
        limit,
    )
    .await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::list_threads_core(&state.sessions, workspace_id, cursor, limit).await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn list_mcp_server_status(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "list_mcp_server_status",
            json!({ "workspaceId": workspace_id, "cursor": cursor, "limit": limit }),
        )
        .await;
    }

    let result = micode_core::list_mcp_server_status_core(
        &state.sessions,
        workspace_id.clone(),
        cursor.clone(),
        limit,
    )
    .await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::list_mcp_server_status_core(&state.sessions, workspace_id, cursor, limit)
                .await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn archive_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "archive_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    let result = micode_core::archive_thread_core(
        &state.sessions,
        workspace_id.clone(),
        thread_id.clone(),
    )
    .await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::archive_thread_core(&state.sessions, workspace_id, thread_id).await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn compact_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "compact_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    let result = micode_core::compact_thread_core(
        &state.sessions,
        workspace_id.clone(),
        thread_id.clone(),
    )
    .await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::compact_thread_core(&state.sessions, workspace_id, thread_id).await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn set_thread_name(
    workspace_id: String,
    thread_id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "set_thread_name",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "name": name }),
        )
        .await;
    }

    let result = micode_core::set_thread_name_core(
        &state.sessions,
        workspace_id.clone(),
        thread_id.clone(),
        name.clone(),
    )
    .await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::set_thread_name_core(&state.sessions, workspace_id, thread_id, name)
                .await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn send_user_message(
    workspace_id: String,
    thread_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    access_mode: Option<String>,
    images: Option<Vec<String>>,
    collaboration_mode: Option<Value>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let images = images.map(|paths| {
            paths
                .into_iter()
                .map(remote_backend::normalize_path_for_remote)
                .collect::<Vec<_>>()
        });
        let mut payload = Map::new();
        payload.insert("workspaceId".to_string(), json!(workspace_id));
        payload.insert("threadId".to_string(), json!(thread_id));
        payload.insert("text".to_string(), json!(text));
        payload.insert("model".to_string(), json!(model));
        payload.insert("effort".to_string(), json!(effort));
        payload.insert("accessMode".to_string(), json!(access_mode));
        payload.insert("images".to_string(), json!(images));
        if let Some(mode) = collaboration_mode {
            if !mode.is_null() {
                payload.insert("collaborationMode".to_string(), mode);
            }
        }
        return remote_backend::call_remote(
            &*state,
            app,
            "send_user_message",
            Value::Object(payload),
        )
        .await;
    }

    let requested_model = model
        .as_ref()
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    if let Some(requested_model) = requested_model {
        let model_changed = crate::backend::app_server::set_preferred_model(&requested_model)?;
        if model_changed {
            if let Some(previous_session) = state.sessions.lock().await.remove(&workspace_id) {
                previous_session.invalidate_all_thread_sessions().await;
                let mut child = previous_session.child.lock().await;
                let _ = child.kill().await;
            }
            let app_for_spawn = app.clone();
            workspaces_core::connect_workspace_core(
                workspace_id.clone(),
                &state.workspaces,
                &state.sessions,
                &state.app_settings,
                move |entry, default_bin, agent_args, agent_home| {
                    spawn_workspace_session(
                        entry,
                        default_bin,
                        agent_args,
                        app_for_spawn.clone(),
                        agent_home,
                    )
                },
            )
            .await?;
        }
    }

    let result = micode_core::send_user_message_core(
        &state.sessions,
        workspace_id.clone(),
        thread_id.clone(),
        text.clone(),
        model.clone(),
        effort.clone(),
        access_mode.clone(),
        images.clone(),
        collaboration_mode.clone(),
    )
    .await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::send_user_message_core(
                &state.sessions,
                workspace_id,
                thread_id,
                text,
                model,
                effort,
                access_mode,
                images,
                collaboration_mode,
            )
            .await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn collaboration_mode_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "collaboration_mode_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    micode_core::collaboration_mode_list_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn turn_interrupt(
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "turn_interrupt",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "turnId": turn_id }),
        )
        .await;
    }

    let result = micode_core::turn_interrupt_core(
        &state.sessions,
        workspace_id.clone(),
        thread_id.clone(),
        turn_id.clone(),
    )
    .await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::turn_interrupt_core(&state.sessions, workspace_id, thread_id, turn_id)
                .await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn start_review(
    workspace_id: String,
    thread_id: String,
    target: Value,
    delivery: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "start_review",
            json!({
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "target": target,
                "delivery": delivery,
            }),
        )
        .await;
    }

    micode_core::start_review_core(&state.sessions, workspace_id, thread_id, target, delivery).await
}

#[tauri::command]
pub(crate) async fn model_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "model_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    micode_core::model_list_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn account_rate_limits(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "account_rate_limits",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    micode_core::account_rate_limits_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn account_read(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "account_read",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    micode_core::account_read_core(&state.sessions, &state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn micode_login(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "micode_login",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    micode_core::micode_login_core(&state.sessions, &state.micode_login_cancels, workspace_id).await
}

#[tauri::command]
pub(crate) async fn micode_login_cancel(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "micode_login_cancel",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    micode_core::micode_login_cancel_core(
        &state.sessions,
        &state.micode_login_cancels,
        workspace_id,
    )
    .await
}

#[tauri::command]
pub(crate) async fn skills_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "skills_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    let result = micode_core::skills_list_core(&state.sessions, workspace_id.clone()).await;
    match result {
        Ok(value) => Ok(value),
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            micode_core::skills_list_core(&state.sessions, workspace_id).await
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn apps_list(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "apps_list",
            json!({ "workspaceId": workspace_id, "cursor": cursor, "limit": limit }),
        )
        .await;
    }

    micode_core::apps_list_core(&state.sessions, workspace_id, cursor, limit).await
}

#[tauri::command]
pub(crate) async fn respond_to_server_request(
    workspace_id: String,
    request_id: Value,
    result: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(
            &*state,
            app,
            "respond_to_server_request",
            json!({ "workspaceId": workspace_id, "requestId": request_id, "result": result }),
        )
        .await?;
        return Ok(());
    }

    micode_core::respond_to_server_request_core(&state.sessions, workspace_id, request_id, result)
        .await
}

fn build_commit_message_prompt(diff: &str) -> String {
    format!(
        "Generate a concise git commit message for the following changes. \
Follow conventional commit format (e.g., feat:, fix:, refactor:, docs:, etc.). \
Keep the summary line under 72 characters. \
Only output the commit message, nothing else.\n\n\
Changes:\n{diff}"
    )
}

/// Gets the diff content for commit message generation
#[tauri::command]
pub(crate) async fn get_commit_message_prompt(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Get the diff from git
    let diff = crate::git::get_workspace_diff(&workspace_id, &state).await?;

    if diff.trim().is_empty() {
        return Err("No changes to generate commit message for".to_string());
    }

    let prompt = build_commit_message_prompt(&diff);

    Ok(prompt)
}

#[tauri::command]
pub(crate) async fn remember_approval_rule(
    workspace_id: String,
    command: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    micode_core::remember_approval_rule_core(&state.workspaces, workspace_id, command).await
}

#[tauri::command]
pub(crate) async fn get_config_model(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "get_config_model",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    micode_core::get_config_model_core(&state.workspaces, workspace_id).await
}

/// Generates a commit message in the background without showing in the main chat
#[tauri::command]
pub(crate) async fn generate_commit_message(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    // Get the diff from git
    let diff = crate::git::get_workspace_diff(&workspace_id, &state).await?;

    if diff.trim().is_empty() {
        return Err("No changes to generate commit message for".to_string());
    }

    let prompt = build_commit_message_prompt(&diff);

    // Get the session
    let session = {
        let sessions = state.sessions.lock().await;
        sessions
            .get(&workspace_id)
            .ok_or("workspace not connected")?
            .clone()
    };

    // Create a background thread
    let thread_params = json!({
        "cwd": session.entry.path,
        "approvalPolicy": "never",  // Never ask for approval in background
        "_background": true
    });
    let thread_result = session.send_request("thread/start", thread_params).await?;

    // Handle error response
    if let Some(error) = thread_result.get("error") {
        let error_msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error starting thread");
        return Err(error_msg.to_string());
    }

    // Extract threadId - try multiple paths since response format may vary
    let thread_id = thread_result
        .get("result")
        .and_then(|r| r.get("threadId"))
        .or_else(|| {
            thread_result
                .get("result")
                .and_then(|r| r.get("thread"))
                .and_then(|t| t.get("id"))
        })
        .or_else(|| thread_result.get("threadId"))
        .or_else(|| thread_result.get("thread").and_then(|t| t.get("id")))
        .and_then(|t| t.as_str())
        .ok_or_else(|| {
            format!(
                "Failed to get threadId from thread/start response: {:?}",
                thread_result
            )
        })?
        .to_string();

    // Hide background helper threads from the sidebar, even if a thread/started event leaked.
    let _ = app.emit(
        "app-server-event",
        AppServerEvent {
            workspace_id: workspace_id.clone(),
            message: json!({
                "method": "micode/backgroundThread",
                "params": {
                    "threadId": thread_id,
                    "action": "hide"
                }
            }),
        },
    );

    // Create channel for receiving events
    let (tx, mut rx) = mpsc::unbounded_channel::<Value>();

    // Register callback for this thread
    {
        let mut callbacks = session.background_thread_callbacks.lock().await;
        callbacks.insert(thread_id.clone(), tx);
    }

    // Start a turn with the commit message prompt
    let turn_params = json!({
        "threadId": thread_id,
        "input": [{ "type": "text", "text": prompt }],
        "cwd": session.entry.path,
        "approvalPolicy": "never",
        "sandboxPolicy": { "type": "readOnly" },
        "_background": true
    });
    let turn_result = session.send_request("turn/start", turn_params).await;
    let turn_result = match turn_result {
        Ok(result) => result,
        Err(error) => {
            // Clean up if turn fails to start
            {
                let mut callbacks = session.background_thread_callbacks.lock().await;
                callbacks.remove(&thread_id);
            }
            let archive_params = json!({ "threadId": thread_id.as_str() });
            let _ = session.send_request("thread/archive", archive_params).await;
            return Err(error);
        }
    };

    if let Some(error) = turn_result.get("error") {
        let error_msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error starting turn");
        {
            let mut callbacks = session.background_thread_callbacks.lock().await;
            callbacks.remove(&thread_id);
        }
        let archive_params = json!({ "threadId": thread_id.as_str() });
        let _ = session.send_request("thread/archive", archive_params).await;
        return Err(error_msg.to_string());
    }

    let commit_message = collect_background_agent_text(
        &mut rx,
        Duration::from_millis(200),
        Duration::from_secs(3),
    )
    .await?;

    // Unregister callback
    {
        let mut callbacks = session.background_thread_callbacks.lock().await;
        callbacks.remove(&thread_id);
    }

    // Archive the thread to clean up
    let archive_params = json!({ "threadId": thread_id });
    let _ = session.send_request("thread/archive", archive_params).await;

    let trimmed = commit_message.trim().to_string();
    if trimmed.is_empty() {
        return Err("No commit message was generated".to_string());
    }

    Ok(trimmed)
}

#[tauri::command]
pub(crate) async fn generate_run_metadata(
    workspace_id: String,
    prompt: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "generate_run_metadata",
            json!({ "workspaceId": workspace_id, "prompt": prompt }),
        )
        .await;
    }

    let cleaned_prompt = prompt.trim();
    if cleaned_prompt.is_empty() {
        return Err("Prompt is required.".to_string());
    }

    let session = {
        let sessions = state.sessions.lock().await;
        sessions
            .get(&workspace_id)
            .ok_or("workspace not connected")?
            .clone()
    };

    let title_prompt = format!(
        "You create concise run metadata for a coding task.\n\
Return ONLY a JSON object with keys:\n\
- title: short, clear, 3-7 words, Title Case\n\
- worktreeName: lower-case, kebab-case slug prefixed with one of: \
feat/, fix/, chore/, test/, docs/, refactor/, perf/, build/, ci/, style/.\n\
\n\
Choose fix/ when the task is a bug fix, error, regression, crash, or cleanup. \
Use the closest match for chores/tests/docs/refactors/perf/build/ci/style. \
Otherwise use feat/.\n\
\n\
Examples:\n\
{{\"title\":\"Fix Login Redirect Loop\",\"worktreeName\":\"fix/login-redirect-loop\"}}\n\
{{\"title\":\"Add Workspace Home View\",\"worktreeName\":\"feat/workspace-home\"}}\n\
{{\"title\":\"Update Lint Config\",\"worktreeName\":\"chore/update-lint-config\"}}\n\
{{\"title\":\"Add Coverage Tests\",\"worktreeName\":\"test/add-coverage-tests\"}}\n\
\n\
Task:\n{cleaned_prompt}"
    );

    let thread_params = json!({
        "cwd": session.entry.path,
        "approvalPolicy": "never",
        "_background": true
    });
    let thread_result = session.send_request("thread/start", thread_params).await?;

    if let Some(error) = thread_result.get("error") {
        let error_msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error starting thread");
        return Err(error_msg.to_string());
    }

    let thread_id = thread_result
        .get("result")
        .and_then(|r| r.get("threadId"))
        .or_else(|| {
            thread_result
                .get("result")
                .and_then(|r| r.get("thread"))
                .and_then(|t| t.get("id"))
        })
        .or_else(|| thread_result.get("threadId"))
        .or_else(|| thread_result.get("thread").and_then(|t| t.get("id")))
        .and_then(|t| t.as_str())
        .ok_or_else(|| {
            format!(
                "Failed to get threadId from thread/start response: {:?}",
                thread_result
            )
        })?
        .to_string();

    // Hide background helper threads from the sidebar, even if a thread/started event leaked.
    let _ = app.emit(
        "app-server-event",
        AppServerEvent {
            workspace_id: workspace_id.clone(),
            message: json!({
                "method": "micode/backgroundThread",
                "params": {
                    "threadId": thread_id,
                    "action": "hide"
                }
            }),
        },
    );

    let (tx, mut rx) = mpsc::unbounded_channel::<Value>();
    {
        let mut callbacks = session.background_thread_callbacks.lock().await;
        callbacks.insert(thread_id.clone(), tx);
    }

    let turn_params = json!({
        "threadId": thread_id,
        "input": [{ "type": "text", "text": title_prompt }],
        "cwd": session.entry.path,
        "approvalPolicy": "never",
        "sandboxPolicy": { "type": "readOnly" },
        "_background": true
    });
    let turn_result = session.send_request("turn/start", turn_params).await;
    let turn_result = match turn_result {
        Ok(result) => result,
        Err(error) => {
            {
                let mut callbacks = session.background_thread_callbacks.lock().await;
                callbacks.remove(&thread_id);
            }
            let archive_params = json!({ "threadId": thread_id.as_str() });
            let _ = session.send_request("thread/archive", archive_params).await;
            return Err(error);
        }
    };

    if let Some(error) = turn_result.get("error") {
        let error_msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error starting turn");
        {
            let mut callbacks = session.background_thread_callbacks.lock().await;
            callbacks.remove(&thread_id);
        }
        let archive_params = json!({ "threadId": thread_id.as_str() });
        let _ = session.send_request("thread/archive", archive_params).await;
        return Err(error_msg.to_string());
    }

    let response_text = collect_background_agent_text(
        &mut rx,
        Duration::from_millis(200),
        Duration::from_secs(3),
    )
    .await?;

    {
        let mut callbacks = session.background_thread_callbacks.lock().await;
        callbacks.remove(&thread_id);
    }

    let archive_params = json!({ "threadId": thread_id });
    let _ = session.send_request("thread/archive", archive_params).await;

    let trimmed = response_text.trim();
    if trimmed.is_empty() {
        return Err("No metadata was generated".to_string());
    }

    let json_value =
        extract_json_value(trimmed).ok_or_else(|| "Failed to parse metadata JSON".to_string())?;
    let title = json_value
        .get("title")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Missing title in metadata".to_string())?;
    let worktree_name = json_value
        .get("worktreeName")
        .or_else(|| json_value.get("worktree_name"))
        .and_then(|v| v.as_str())
        .map(|v| sanitize_run_worktree_name(v))
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Missing worktree name in metadata".to_string())?;

    Ok(json!({
        "title": title,
        "worktreeName": worktree_name
    }))
}

fn extract_json_value(raw: &str) -> Option<Value> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str::<Value>(&raw[start..=end]).ok()
}

fn sanitize_run_worktree_name(value: &str) -> String {
    let trimmed = value.trim().to_lowercase();
    let mut cleaned = String::new();
    let mut last_dash = false;
    for ch in trimmed.chars() {
        let next = if ch.is_ascii_alphanumeric() || ch == '/' {
            last_dash = false;
            Some(ch)
        } else if ch == '-' || ch.is_whitespace() || ch == '_' {
            if last_dash {
                None
            } else {
                last_dash = true;
                Some('-')
            }
        } else {
            None
        };
        if let Some(ch) = next {
            cleaned.push(ch);
        }
    }
    while cleaned.ends_with('-') || cleaned.ends_with('/') {
        cleaned.pop();
    }
    let allowed_prefixes = [
        "feat/",
        "fix/",
        "chore/",
        "test/",
        "docs/",
        "refactor/",
        "perf/",
        "build/",
        "ci/",
        "style/",
    ];
    if allowed_prefixes
        .iter()
        .any(|prefix| cleaned.starts_with(prefix))
    {
        return cleaned;
    }
    for prefix in allowed_prefixes.iter() {
        let dash_prefix = prefix.replace('/', "-");
        if cleaned.starts_with(&dash_prefix) {
            return cleaned.replacen(&dash_prefix, prefix, 1);
        }
    }
    format!("feat/{}", cleaned.trim_start_matches('/'))
}
