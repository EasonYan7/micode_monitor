use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::Value;
use tauri::State;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedDebugEntry {
    pub(crate) id: String,
    pub(crate) timestamp: u64,
    pub(crate) source: String,
    pub(crate) label: String,
    pub(crate) payload: Option<Value>,
    pub(crate) workspace_id: Option<String>,
}

#[derive(Debug)]
struct SilverDebugEntry {
    debug_id: String,
    event_time_ms: u64,
    app_session_id: String,
    actor_id: String,
    actor_client_user: String,
    actor_lark_user_token: String,
    workspace_id: Option<String>,
    thread_id: Option<String>,
    turn_id: Option<String>,
    item_id: Option<String>,
    source: String,
    label: String,
    event_type: String,
    rpc_method: String,
    phase: String,
    status: String,
    error_code: Option<String>,
    duration_ms: Option<u64>,
    payload: Option<Value>,
}

fn sanitize_workspace_segment(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_');
    if trimmed.is_empty() {
        "unknown".to_string()
    } else {
        trimmed.to_string()
    }
}

fn extract_workspace_id_from_payload(payload: &Value) -> Option<String> {
    if let Some(value) = payload
        .get("workspaceId")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(value.to_string());
    }
    if let Some(value) = payload
        .get("workspace_id")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(value.to_string());
    }
    None
}

fn extract_string_field(payload: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(value) = payload
            .get(*key)
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Some(value.to_string());
        }
    }
    None
}

fn extract_params_object(payload: &Value) -> Option<&Value> {
    payload
        .get("message")
        .and_then(|message| message.get("params"))
        .or_else(|| payload.get("params"))
}

fn infer_event_type(label: &str) -> String {
    if label.starts_with("turn/") {
        return "turn".to_string();
    }
    if label.starts_with("thread/") {
        return "thread".to_string();
    }
    if label.starts_with("item/") {
        return "item".to_string();
    }
    if label.starts_with("workspace/") {
        return "workspace".to_string();
    }
    if label.starts_with("account/") {
        return "account".to_string();
    }
    if label.starts_with("micode/") {
        return "micode".to_string();
    }
    if label.starts_with("git/") {
        return "git".to_string();
    }
    if label.starts_with("terminal/") {
        return "terminal".to_string();
    }
    "other".to_string()
}

fn infer_method_and_phase(label: &str) -> (String, String, String) {
    let trimmed = label.trim();
    if let Some(method) = trimmed.strip_suffix(" response").map(str::trim) {
        return (method.to_string(), "response".to_string(), "ok".to_string());
    }
    if let Some(method) = trimmed.strip_suffix(" error").map(str::trim) {
        return (method.to_string(), "error".to_string(), "error".to_string());
    }
    (trimmed.to_string(), "event".to_string(), "ok".to_string())
}

fn infer_error_code(payload: Option<&Value>, phase: &str, source: &str) -> Option<String> {
    if let Some(payload_value) = payload {
        if let Some(code) = payload_value
            .get("code")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Some(code.to_string());
        }
        if let Some(code) = payload_value
            .get("error")
            .and_then(|value| value.get("code"))
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Some(code.to_string());
        }
    }
    if phase == "error" || source == "error" {
        return Some("unknown_error".to_string());
    }
    None
}

fn to_silver_entry(
    entry: PersistedDebugEntry,
    app_session_id: &str,
    actor_id: &str,
    actor_client_user: &str,
    actor_lark_user_token: &str,
) -> SilverDebugEntry {
    let payload_ref = entry.payload.as_ref();
    let params = payload_ref.and_then(extract_params_object);
    let workspace_id = resolve_workspace_id(&entry);
    let thread_id = params
        .and_then(|value| extract_string_field(value, &["threadId", "thread_id"]))
        .or_else(|| payload_ref.and_then(|value| extract_string_field(value, &["threadId", "thread_id"])));
    let turn_id = params
        .and_then(|value| extract_string_field(value, &["turnId", "turn_id"]))
        .or_else(|| payload_ref.and_then(|value| extract_string_field(value, &["turnId", "turn_id"])));
    let item_id = params
        .and_then(|value| extract_string_field(value, &["itemId", "item_id"]))
        .or_else(|| payload_ref.and_then(|value| extract_string_field(value, &["itemId", "item_id"])));
    let (rpc_method, phase, mut status) = infer_method_and_phase(&entry.label);
    if entry.source == "error" || entry.source == "stderr" {
        status = "error".to_string();
    }
    let event_type = infer_event_type(&rpc_method);
    let error_code = infer_error_code(payload_ref, &phase, &entry.source);

    SilverDebugEntry {
        debug_id: entry.id,
        event_time_ms: entry.timestamp,
        app_session_id: app_session_id.to_string(),
        actor_id: actor_id.to_string(),
        actor_client_user: actor_client_user.to_string(),
        actor_lark_user_token: actor_lark_user_token.to_string(),
        workspace_id,
        thread_id,
        turn_id,
        item_id,
        source: entry.source,
        label: entry.label,
        event_type,
        rpc_method,
        phase,
        status,
        error_code,
        duration_ms: None,
        payload: entry.payload,
    }
}

fn resolve_workspace_id(entry: &PersistedDebugEntry) -> Option<String> {
    if let Some(value) = entry
        .workspace_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Some(value.to_string());
    }
    entry
        .payload
        .as_ref()
        .and_then(extract_workspace_id_from_payload)
}

fn append_lines(path: &Path, lines: &[String]) -> Result<(), String> {
    if lines.is_empty() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|err| err.to_string())?;
    for line in lines {
        use std::io::Write;
        file.write_all(line.as_bytes()).map_err(|err| err.to_string())?;
        file.write_all(b"\n").map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn append_debug_logs(
    state: State<'_, AppState>,
    entries: Vec<PersistedDebugEntry>,
) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }

    let mut raw_global_lines = Vec::with_capacity(entries.len());
    let mut raw_by_workspace: HashMap<String, Vec<String>> = HashMap::new();
    let mut silver_global_lines = Vec::with_capacity(entries.len());
    let mut silver_by_workspace: HashMap<String, Vec<String>> = HashMap::new();
    let mut raw_workspace_ids = BTreeSet::new();

    for entry in entries {
        let silver_entry = to_silver_entry(
            entry,
            &state.app_session_id,
            &state.actor_id,
            &state.actor_client_user,
            &state.actor_lark_user_token,
        );
        let workspace_id = silver_entry.workspace_id.clone();

        let raw_record = serde_json::json!({
            "eventTimeMs": silver_entry.event_time_ms,
            "appSessionId": silver_entry.app_session_id,
            "actorId": silver_entry.actor_id,
            "actorClientUser": silver_entry.actor_client_user,
            "actorLarkUserToken": silver_entry.actor_lark_user_token,
            "id": silver_entry.debug_id,
            "source": silver_entry.source,
            "label": silver_entry.label,
            "workspaceId": workspace_id,
            "payload": silver_entry.payload,
        });
        let raw_line = serde_json::to_string(&raw_record).map_err(|err| err.to_string())?;
        raw_global_lines.push(raw_line.clone());
        if let Some(workspace_id_value) = raw_record
            .get("workspaceId")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
        {
            raw_workspace_ids.insert(workspace_id_value.clone());
            raw_by_workspace
                .entry(workspace_id_value)
                .or_default()
                .push(raw_line);
        }

        let silver_line = serde_json::to_string(&serde_json::json!({
            "id": silver_entry.debug_id,
            "eventTimeMs": silver_entry.event_time_ms,
            "appSessionId": silver_entry.app_session_id,
            "actorId": silver_entry.actor_id,
            "actorClientUser": silver_entry.actor_client_user,
            "actorLarkUserToken": silver_entry.actor_lark_user_token,
            "workspaceId": silver_entry.workspace_id,
            "threadId": silver_entry.thread_id,
            "turnId": silver_entry.turn_id,
            "itemId": silver_entry.item_id,
            "source": silver_entry.source,
            "label": silver_entry.label,
            "eventType": silver_entry.event_type,
            "rpcMethod": silver_entry.rpc_method,
            "phase": silver_entry.phase,
            "status": silver_entry.status,
            "errorCode": silver_entry.error_code,
            "durationMs": silver_entry.duration_ms,
            "payload": silver_entry.payload,
        }))
        .map_err(|err| err.to_string())?;
        silver_global_lines.push(silver_line.clone());
        if let Some(workspace_id_value) = workspace_id {
            silver_by_workspace
                .entry(workspace_id_value)
                .or_default()
                .push(silver_line);
        }
    }

    let raw_global_path = state.logs_dir.join("global").join(&state.log_session_file);
    append_lines(&raw_global_path, &raw_global_lines)?;

    for workspace_id in raw_workspace_ids {
        let safe_segment = sanitize_workspace_segment(&workspace_id);
        let workspace_path = state
            .logs_dir
            .join("workspaces")
            .join(safe_segment)
            .join(&state.log_session_file);
        if let Some(lines) = raw_by_workspace.get(&workspace_id) {
            append_lines(&workspace_path, lines)?;
        }
    }

    let silver_global_path = state
        .logs_dir
        .join("silver")
        .join("global")
        .join(&state.log_session_file);
    append_lines(&silver_global_path, &silver_global_lines)?;

    for (workspace_id, lines) in silver_by_workspace {
        let safe_segment = sanitize_workspace_segment(&workspace_id);
        let workspace_path = state
            .logs_dir
            .join("silver")
            .join("workspaces")
            .join(safe_segment)
            .join(&state.log_session_file);
        append_lines(&workspace_path, &lines)?;
    }

    Ok(())
}

pub(crate) fn build_log_session_file_name() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("session-{millis}-{}.ndjson", std::process::id())
}

pub(crate) fn build_app_session_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("app-{millis}-{}", std::process::id())
}

fn resolve_micode_home() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("CODEX_HOME") {
        let path = PathBuf::from(path);
        if !path.as_os_str().is_empty() {
            return Some(path);
        }
    }
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let mut base = PathBuf::from(home);
        base.push(".micode");
        return Some(base);
    }
    None
}

pub(crate) fn resolve_actor_identity() -> (String, String) {
    let Some(home) = resolve_micode_home() else {
        return (String::new(), String::new());
    };
    let settings_path = home.join("settings.json");
    let Ok(raw) = std::fs::read_to_string(settings_path) else {
        return (String::new(), String::new());
    };
    let Ok(json) = serde_json::from_str::<Value>(&raw) else {
        return (String::new(), String::new());
    };
    let client_user = json
        .get("client_user")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("")
        .to_string();
    let lark_user_token = json
        .get("lark")
        .and_then(|value| value.get("user_token"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("")
        .to_string();
    (client_user, lark_user_token)
}

pub(crate) fn resolve_logs_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("logs")
}
