use serde_json::{json, Map, Value};
use std::io::ErrorKind;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
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
use crate::types::{StartupEnvironmentCheck, StartupEnvironmentStatus, WorkspaceEntry};

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

fn mcp_status_has_entries(value: &Value) -> bool {
    let result = value.get("result").unwrap_or(value);
    result
        .get("data")
        .and_then(Value::as_array)
        .map(|items| !items.is_empty())
        .unwrap_or(false)
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn normalize_trimmed(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn ready_check(
    id: &str,
    label: &str,
    version: Option<String>,
    summary: String,
) -> StartupEnvironmentCheck {
    StartupEnvironmentCheck {
        id: id.to_string(),
        label: label.to_string(),
        required: true,
        status: "ready".to_string(),
        detected_version: version,
        summary,
        technical_details: None,
        recommended_action: None,
        can_auto_install: false,
    }
}

fn failed_check(
    id: &str,
    label: &str,
    summary: String,
    technical_details: Option<String>,
    recommended_action: Option<String>,
    can_auto_install: bool,
) -> StartupEnvironmentCheck {
    StartupEnvironmentCheck {
        id: id.to_string(),
        label: label.to_string(),
        required: true,
        status: "failed".to_string(),
        detected_version: None,
        summary,
        technical_details,
        recommended_action,
        can_auto_install,
    }
}

fn is_ready(check: &StartupEnvironmentCheck) -> bool {
    check.status == "ready"
}

fn build_startup_environment_status(
    checks: Vec<StartupEnvironmentCheck>,
    micode_bin: Option<String>,
    micode_args: Option<String>,
) -> StartupEnvironmentStatus {
    let can_proceed = checks.iter().filter(|check| check.required).all(is_ready);
    StartupEnvironmentStatus {
        overall_status: if can_proceed {
            "ready".to_string()
        } else {
            "manual_action_required".to_string()
        },
        can_proceed,
        blocking: !can_proceed,
        checks,
        last_checked_at: now_ts(),
        micode_bin,
        micode_args,
    }
}

async fn run_version_probe(program: &str, args: &[&str], path_env: Option<&str>) -> Result<String, String> {
    let mut command = tokio_command(program);
    if let Some(path_env) = path_env {
        command.env("PATH", path_env);
    }
    command.args(args);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    let output = timeout(Duration::from_secs(5), command.output())
        .await
        .map_err(|_| format!("Timed out while checking {program}."))?
        .map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                format!("{program} not found on PATH.")
            } else {
                error.to_string()
            }
        })?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let version = if stdout.is_empty() { stderr } else { stdout };
        if version.is_empty() {
            Err(format!("{program} returned no version output."))
        } else {
            Ok(version)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if stderr.is_empty() { stdout } else { stderr };
        Err(if detail.is_empty() {
            format!("{program} failed to start.")
        } else {
            detail
        })
    }
}

fn node_recommended_action() -> Option<String> {
    Some(if cfg!(windows) {
        "MiCodeMonitor needs Node.js before it can start MiCode CLI. Use the automatic install button, or install Node.js manually, then retry.".to_string()
    } else {
        "Install Node.js and make sure `node --version` works in Terminal, then retry.".to_string()
    })
}

fn micode_recommended_action() -> Option<String> {
    Some(if cfg!(windows) {
        "MiCode CLI is required for chat and workspace actions. Use the automatic install button, or run the official installer manually, then retry.".to_string()
    } else {
        "Install MiCode CLI and make sure `micode --version` works in Terminal, then retry.".to_string()
    })
}

fn python_recommended_action(store_alias: bool) -> Option<String> {
    Some(if cfg!(windows) {
        if store_alias {
            "Windows only found the Microsoft Store Python alias, which cannot run your tasks reliably. Use the automatic install button to install the real Python runtime, then retry.".to_string()
        } else {
            "Python is required before tasks that run Python scripts can start. Use the automatic install button, or install Python manually, then retry.".to_string()
        }
    } else {
        "Install Python and make sure `python3 --version` works in Terminal, then retry.".to_string()
    })
}

fn summarize_acp_error(detail: &str) -> (String, Option<String>) {
    let normalized = detail.to_ascii_lowercase();
    if normalized.contains("executionpolicy")
        || normalized.contains("remote signed")
        || normalized.contains("powershell")
    {
        (
            "MiCode CLI was found, but Windows blocked ACP startup because of PowerShell policy.".to_string(),
            Some(
                "Allow `micode.cmd` to run in PowerShell (for example with `Set-ExecutionPolicy RemoteSigned`), then retry.".to_string(),
            ),
        )
    } else if normalized.contains("timed out")
        || normalized.contains("did not respond to initialize")
    {
        (
            "MiCode CLI started, but its ACP app-server did not finish initialization.".to_string(),
            Some(
                "Open Terminal and verify `micode --experimental-acp` (or `micode.cmd --experimental-acp` on Windows) can start normally, then retry.".to_string(),
            ),
        )
    } else {
        (
            "MiCode CLI was found, but its ACP app-server failed to start correctly.".to_string(),
            Some(
                "Check your MiCode installation and login state, then retry. The detailed error is available below.".to_string(),
            ),
        )
    }
}

fn is_windows_store_python_detail(detail: &str) -> bool {
    let normalized = detail.to_ascii_lowercase();
    normalized.contains("microsoft store")
        || normalized.contains("app execution aliases")
        || normalized.contains("windowsapps")
}

async fn check_node_dependency(path_env: Option<String>) -> StartupEnvironmentCheck {
    match run_version_probe("node", &["--version"], path_env.as_deref()).await {
        Ok(version) => ready_check(
            "node",
            "Node.js",
            Some(version.clone()),
            format!("Node.js is available ({version})."),
        ),
        Err(detail) => failed_check(
            "node",
            "Node.js",
            "Node.js is missing or cannot start, so MiCodeMonitor cannot launch MiCode CLI.".to_string(),
            Some(detail),
            node_recommended_action(),
            cfg!(windows),
        ),
    }
}

async fn check_micode_dependency(resolved_bin: Option<String>) -> StartupEnvironmentCheck {
    match check_micode_installation(resolved_bin).await {
        Ok(Some(version)) => ready_check(
            "micode",
            "MiCode CLI",
            Some(version.clone()),
            format!("MiCode CLI is available ({version})."),
        ),
        Ok(None) => failed_check(
            "micode",
            "MiCode CLI",
            "MiCode CLI could not be verified.".to_string(),
            None,
            micode_recommended_action(),
            cfg!(windows),
        ),
        Err(detail) => failed_check(
            "micode",
            "MiCode CLI",
            "MiCode CLI is missing or cannot start, so MiCodeMonitor cannot continue.".to_string(),
            Some(detail),
            micode_recommended_action(),
            cfg!(windows),
        ),
    }
}

async fn check_app_server_dependency(
    resolved_bin: Option<String>,
    micode_args: Option<String>,
    micode_ready: bool,
) -> StartupEnvironmentCheck {
    if !micode_ready {
        return failed_check(
            "appServer",
            "ACP app-server",
            "MiCode CLI must be available before ACP app-server can be verified.".to_string(),
            None,
            micode_recommended_action(),
            false,
        );
    }

    match check_acp_handshake(resolved_bin, micode_args).await {
        Ok(true) => ready_check(
            "appServer",
            "ACP app-server",
            None,
            "MiCode ACP app-server initialized successfully.".to_string(),
        ),
        Ok(false) => failed_check(
            "appServer",
            "ACP app-server",
            "MiCode ACP app-server did not complete initialization.".to_string(),
            None,
            Some("Retry after reinstalling or repairing MiCode CLI.".to_string()),
            false,
        ),
        Err(detail) => {
            let (summary, action) = summarize_acp_error(&detail);
            failed_check(
                "appServer",
                "ACP app-server",
                summary,
                Some(detail),
                action,
                false,
            )
        }
    }
}

async fn check_python_dependency(path_env: Option<String>) -> StartupEnvironmentCheck {
    let candidates: [(&str, [&str; 2]); 3] = [
        ("python", ["--version", ""]),
        ("py", ["-3", "--version"]),
        ("python3", ["--version", ""]),
    ];

    let mut last_error: Option<String> = None;
    for (program, args) in candidates {
        let filtered_args = args.into_iter().filter(|value| !value.is_empty()).collect::<Vec<_>>();
        match run_version_probe(program, &filtered_args, path_env.as_deref()).await {
            Ok(version) => {
                return ready_check(
                    "python",
                    "Python",
                    Some(version.clone()),
                    format!("Python is available ({version})."),
                )
            }
            Err(detail) => {
                last_error = Some(detail);
            }
        }
    }

    let detail = last_error.unwrap_or_else(|| "Python was not found.".to_string());
    let store_alias = is_windows_store_python_detail(&detail);
    failed_check(
        "python",
        "Python",
        if store_alias {
            "Windows only found the Microsoft Store Python placeholder, so Python tasks would hang or fail.".to_string()
        } else {
            "Python is missing or cannot start, so Python-based tasks would fail.".to_string()
        },
        Some(detail),
        python_recommended_action(store_alias),
        cfg!(windows),
    )
}

async fn environment_check_startup_inner(
    micode_bin: Option<String>,
    micode_args: Option<String>,
    default_bin: Option<String>,
) -> StartupEnvironmentStatus {
    let resolved_bin = normalize_trimmed(micode_bin).or(default_bin);
    let resolved_args = normalize_trimmed(micode_args);
    let path_env = build_micode_path_env(resolved_bin.as_deref());

    let node = check_node_dependency(path_env.clone()).await;
    let micode = check_micode_dependency(resolved_bin.clone()).await;
    let app_server =
        check_app_server_dependency(resolved_bin.clone(), resolved_args.clone(), is_ready(&micode))
            .await;
    let python = check_python_dependency(path_env).await;

    build_startup_environment_status(
        vec![node, micode, app_server, python],
        resolved_bin,
        resolved_args,
    )
}

fn install_error(message: &str) -> String {
    format!("{message} Please complete the install manually, then click retry.")
}

fn command_exists(program: &str) -> bool {
    let checker = if cfg!(windows) { "where" } else { "which" };
    std::process::Command::new(checker)
        .arg(program)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

async fn run_install_command(program: &str, args: &[&str], timeout_secs: u64) -> Result<(), String> {
    let mut command = tokio_command(program);
    command.args(args);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    let output = timeout(Duration::from_secs(timeout_secs), command.output())
        .await
        .map_err(|_| format!("{program} install timed out."))?
        .map_err(|error| format!("Failed to run {program}: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    Err(if detail.is_empty() {
        format!("{program} install failed with exit code {}.", output.status.code().unwrap_or(-1))
    } else {
        detail
    })
}

async fn install_node_dependency() -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err(install_error("Automatic Node.js installation is currently only supported on Windows."));
    }

    #[cfg(target_os = "windows")]
    {
        if command_exists("winget") {
            run_install_command("winget", &["install", "--id", "OpenJS.NodeJS", "-e"], 900).await
        } else if command_exists("choco") {
            run_install_command("choco", &["install", "-y", "nodejs"], 900).await
        } else {
            Err(install_error(
                "Automatic Node.js installation needs winget or choco, but neither command is available.",
            ))
        }
    }
}

async fn install_python_dependency() -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err(install_error("Automatic Python installation is currently only supported on Windows."));
    }

    #[cfg(target_os = "windows")]
    {
        if command_exists("winget") {
            run_install_command("winget", &["install", "--id", "Python.Python.3.12", "-e"], 900)
                .await
        } else if command_exists("choco") {
            run_install_command("choco", &["install", "-y", "python"], 900).await
        } else {
            Err(install_error(
                "Automatic Python installation needs winget or choco, but neither command is available.",
            ))
        }
    }
}

async fn install_micode_dependency_windows_inner() -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err("MiCode auto-install is only supported on Windows.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let script = "iwr -useb https://cnbj1-fds.api.xiaomi.net/mi-code-public/install.ps1 | iex";
        let mut command = tokio_command("powershell");
        command
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-Command")
            .arg(script)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let output = timeout(Duration::from_secs(600), command.output())
            .await
            .map_err(|_| "MiCode install timed out after 10 minutes.".to_string())?
            .map_err(|err| format!("Failed to run installer: {err}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if output.status.success() {
            Ok(())
        } else {
            let detail = if stderr.trim().is_empty() {
                stdout.trim().to_string()
            } else {
                stderr.trim().to_string()
            };
            Err(if detail.is_empty() {
                format!(
                    "MiCode installer failed with exit code {}.",
                    output.status.code().unwrap_or(-1)
                )
            } else {
                detail
            })
        }
    }
}

async fn cache_environment_status(
    state: &AppState,
    status: StartupEnvironmentStatus,
) -> StartupEnvironmentStatus {
    *state.startup_environment_status.lock().await = Some(status.clone());
    status
}

#[tauri::command]
pub(crate) async fn micode_doctor(
    micode_bin: Option<String>,
    micode_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let default_bin = {
        let settings = state.app_settings.lock().await;
        settings.agent_bin.clone()
    };
    let status = environment_check_startup_inner(micode_bin.clone(), micode_args.clone(), default_bin).await;
    let path_env = build_micode_path_env(status.micode_bin.as_deref());
    let node = status.checks.iter().find(|check| check.id == "node");
    let micode = status.checks.iter().find(|check| check.id == "micode");
    let app_server = status.checks.iter().find(|check| check.id == "appServer");
    let details = status
        .checks
        .iter()
        .filter(|check| check.required && !is_ready(check))
        .find_map(|check| Some(check.summary.clone()));
    Ok(json!({
        "ok": status.can_proceed,
        "agentBin": status.micode_bin,
        "micodeBin": status.micode_bin,
        "version": micode.and_then(|check| check.detected_version.clone()),
        "appServerOk": app_server.map(is_ready).unwrap_or(false),
        "details": details,
        "path": path_env,
        "nodeOk": node.map(is_ready).unwrap_or(false),
        "nodeVersion": node.and_then(|check| check.detected_version.clone()),
        "nodeDetails": node.and_then(|check| check.technical_details.clone()),
        "overallStatus": status.overall_status,
        "canProceed": status.can_proceed,
        "blocking": status.blocking,
        "checks": status.checks,
        "lastCheckedAt": status.last_checked_at,
    }))
}

#[tauri::command]
pub(crate) async fn micode_install_windows() -> Result<Value, String> {
    install_micode_dependency_windows_inner().await?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub(crate) async fn environment_check_startup(
    micode_bin: Option<String>,
    micode_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<StartupEnvironmentStatus, String> {
    let default_bin = {
        let settings = state.app_settings.lock().await;
        settings.agent_bin.clone()
    };
    let status = environment_check_startup_inner(micode_bin, micode_args, default_bin).await;
    Ok(cache_environment_status(&state, status).await)
}

#[tauri::command]
pub(crate) async fn environment_retry_check(
    micode_bin: Option<String>,
    micode_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<StartupEnvironmentStatus, String> {
    environment_check_startup(micode_bin, micode_args, state).await
}

#[tauri::command]
pub(crate) async fn environment_get_cached_status(
    state: State<'_, AppState>,
) -> Result<Option<StartupEnvironmentStatus>, String> {
    Ok(state.startup_environment_status.lock().await.clone())
}

#[tauri::command]
pub(crate) async fn environment_install_dependency(
    dependency_id: String,
    micode_bin: Option<String>,
    micode_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<StartupEnvironmentStatus, String> {
    match dependency_id.trim() {
        "node" => install_node_dependency().await?,
        "micode" => install_micode_dependency_windows_inner().await?,
        "python" => install_python_dependency().await?,
        "appServer" => {
            return Err(
                "ACP app-server is verified automatically after MiCode CLI is installed or repaired."
                    .to_string(),
            )
        }
        _ => return Err(format!("Unsupported dependency id: {dependency_id}")),
    }

    let default_bin = {
        let settings = state.app_settings.lock().await;
        settings.agent_bin.clone()
    };
    let status = environment_check_startup_inner(micode_bin, micode_args, default_bin).await;
    Ok(cache_environment_status(&state, status).await)
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
        Ok(value) => {
            if mcp_status_has_entries(&value) {
                Ok(value)
            } else {
                micode_core::list_mcp_server_status_from_settings_core(
                    &state.workspaces,
                    workspace_id,
                )
                .await
                .or(Ok(value))
            }
        }
        Err(error) if is_workspace_not_connected_error(&error) => {
            ensure_workspace_session_connected(&state, &workspace_id, &app).await?;
            let retried = micode_core::list_mcp_server_status_core(
                &state.sessions,
                workspace_id.clone(),
                cursor,
                limit,
            )
            .await;
            match retried {
                Ok(value) => {
                    if mcp_status_has_entries(&value) {
                        Ok(value)
                    } else {
                        micode_core::list_mcp_server_status_from_settings_core(
                            &state.workspaces,
                            workspace_id,
                        )
                        .await
                        .or(Ok(value))
                    }
                }
                Err(_) => micode_core::list_mcp_server_status_from_settings_core(
                    &state.workspaces,
                    workspace_id,
                )
                .await,
            }
        }
        Err(_) => {
            micode_core::list_mcp_server_status_from_settings_core(&state.workspaces, workspace_id)
                .await
        }
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
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "remember_approval_rule",
            json!({ "workspaceId": workspace_id, "command": command }),
        )
        .await;
    }

    micode_core::remember_approval_rule_core(&state.workspaces, workspace_id, command).await
}

#[tauri::command]
pub(crate) async fn list_approval_rules(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "list_approval_rules",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    micode_core::list_approval_rules_core(&state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn remove_approval_rule(
    workspace_id: String,
    command: Vec<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "remove_approval_rule",
            json!({ "workspaceId": workspace_id, "command": command }),
        )
        .await;
    }

    micode_core::remove_approval_rule_core(&state.workspaces, workspace_id, command).await
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

#[cfg(test)]
mod tests {
    use super::{
        build_startup_environment_status, failed_check, is_windows_store_python_detail,
        ready_check, summarize_acp_error,
    };

    #[test]
    fn startup_environment_status_blocks_when_required_check_fails() {
        let status = build_startup_environment_status(
            vec![
                ready_check("node", "Node.js", Some("v22.0.0".to_string()), "ok".to_string()),
                failed_check(
                    "python",
                    "Python",
                    "Python missing".to_string(),
                    Some("python not found".to_string()),
                    Some("Install Python".to_string()),
                    true,
                ),
            ],
            None,
            None,
        );

        assert!(!status.can_proceed);
        assert!(status.blocking);
        assert_eq!(status.overall_status, "manual_action_required");
    }

    #[test]
    fn detects_windows_store_python_alias_messages() {
        assert!(is_windows_store_python_detail(
            "Python was not found; run without arguments to install from the Microsoft Store."
        ));
        assert!(is_windows_store_python_detail(
            "C:\\Users\\mi\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe"
        ));
        assert!(!is_windows_store_python_detail("python not found on PATH"));
    }

    #[test]
    fn acp_summary_mentions_powershell_policy_when_applicable() {
        let (summary, action) =
            summarize_acp_error("PowerShell blocked execution because of ExecutionPolicy");
        assert!(summary.contains("PowerShell"));
        assert!(action.unwrap_or_default().contains("RemoteSigned"));
    }
}
