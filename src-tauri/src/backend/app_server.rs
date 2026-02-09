use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{sleep, timeout};
use uuid::Uuid;

use crate::backend::events::{AppServerEvent, EventSink};
use crate::micode::args::apply_micode_args;
use crate::shared::process_core::tokio_command;
use crate::types::WorkspaceEntry;

const ACP_PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LocalThreadRecord {
    #[serde(rename = "threadId")]
    thread_id: String,
    #[serde(rename = "sessionId")]
    session_id: String,
    title: String,
    archived: bool,
    #[serde(rename = "updatedAt")]
    updated_at: i64,
    #[serde(rename = "messageIndex")]
    message_index: u64,
}

#[derive(Default)]
struct LocalThreadStore {
    path: PathBuf,
    records: Vec<LocalThreadRecord>,
}

impl LocalThreadStore {
    fn load(workspace_path: &str) -> Self {
        let path = PathBuf::from(workspace_path)
            .join(".micodemonitor")
            .join("sessions.json");
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(records) = serde_json::from_str::<Vec<LocalThreadRecord>>(&raw) {
                let mut store = Self { path, records };
                if store.repair_session_collisions() {
                    store.persist();
                }
                return store;
            }
        }
        Self {
            path,
            records: Vec::new(),
        }
    }

    fn persist(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string_pretty(&self.records) {
            let _ = std::fs::write(&self.path, raw);
        }
    }

    fn upsert(&mut self, record: LocalThreadRecord) {
        if let Some(existing) = self
            .records
            .iter_mut()
            .find(|entry| entry.thread_id == record.thread_id)
        {
            *existing = record;
        } else {
            self.records.push(record);
        }
        self.persist();
    }

    fn by_thread_id(&self, thread_id: &str) -> Option<LocalThreadRecord> {
        self.records
            .iter()
            .find(|entry| entry.thread_id == thread_id)
            .cloned()
    }

    fn by_session_id(&self, session_id: &str) -> Option<LocalThreadRecord> {
        self.records
            .iter()
            .filter(|entry| entry.session_id == session_id)
            .max_by(|a, b| {
                a.updated_at
                    .cmp(&b.updated_at)
                    .then(a.message_index.cmp(&b.message_index))
            })
            .cloned()
    }

    fn list_unarchived(&self) -> Vec<LocalThreadRecord> {
        self.records
            .iter()
            .filter(|entry| !entry.archived)
            .cloned()
            .collect()
    }

    fn delete(&mut self, thread_id: &str) -> bool {
        let before = self.records.len();
        self.records.retain(|entry| entry.thread_id != thread_id);
        let changed = self.records.len() != before;
        if changed {
            let _ = std::fs::remove_file(self.thread_items_path(thread_id));
            self.persist();
        }
        changed
    }

    fn set_title(&mut self, thread_id: &str, title: String) {
        if let Some(entry) = self
            .records
            .iter_mut()
            .find(|entry| entry.thread_id == thread_id)
        {
            entry.title = title;
            entry.updated_at = now_ts();
            self.persist();
        }
    }

    fn set_session_id(&mut self, thread_id: &str, session_id: String) {
        let mut changed = false;
        if !session_id.is_empty() {
            for entry in self.records.iter_mut() {
                if entry.thread_id != thread_id && entry.session_id == session_id {
                    entry.session_id.clear();
                    changed = true;
                }
            }
        }
        if let Some(entry) = self
            .records
            .iter_mut()
            .find(|entry| entry.thread_id == thread_id)
        {
            entry.session_id = session_id;
            entry.updated_at = now_ts();
            changed = true;
        }
        if changed {
            self.persist();
        }
    }

    fn touch_message(&mut self, thread_id: &str) {
        if let Some(entry) = self
            .records
            .iter_mut()
            .find(|entry| entry.thread_id == thread_id)
        {
            entry.message_index = entry.message_index.saturating_add(1);
            entry.updated_at = now_ts();
            self.persist();
        }
    }

    fn clear_session_ids(&mut self) {
        let mut changed = false;
        for entry in self.records.iter_mut() {
            if !entry.session_id.is_empty() {
                entry.session_id.clear();
                changed = true;
            }
        }
        if changed {
            self.persist();
        }
    }

    fn repair_session_collisions(&mut self) -> bool {
        let mut changed = false;
        let mut canonical: HashMap<String, usize> = HashMap::new();
        for idx in 0..self.records.len() {
            let session_id = self.records[idx].session_id.clone();
            if session_id.is_empty() {
                continue;
            }
            match canonical.get(&session_id).copied() {
                None => {
                    canonical.insert(session_id, idx);
                }
                Some(prev_idx) => {
                    let take_current = {
                        let prev = &self.records[prev_idx];
                        let cur = &self.records[idx];
                        (cur.updated_at, cur.message_index) > (prev.updated_at, prev.message_index)
                    };
                    if take_current {
                        self.records[prev_idx].session_id.clear();
                        canonical.insert(session_id, idx);
                    } else {
                        self.records[idx].session_id.clear();
                    }
                    changed = true;
                }
            }
        }
        changed
    }

    fn thread_items_path(&self, thread_id: &str) -> PathBuf {
        let safe_thread_id = thread_id.replace('/', "_");
        self.path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("thread-items")
            .join(format!("{safe_thread_id}.json"))
    }

    fn load_thread_items(&self, thread_id: &str) -> Vec<Value> {
        let path = self.thread_items_path(thread_id);
        let Ok(raw) = std::fs::read_to_string(path) else {
            return Vec::new();
        };
        serde_json::from_str::<Vec<Value>>(&raw).unwrap_or_default()
    }

    fn persist_thread_items(&self, thread_id: &str, items: &[Value]) {
        let path = self.thread_items_path(thread_id);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_string_pretty(items) {
            let _ = std::fs::write(path, raw);
        }
    }

    fn upsert_thread_item(&self, thread_id: &str, item: Value) {
        let mut items = self.load_thread_items(thread_id);
        let item_id = item
            .get("id")
            .and_then(Value::as_str)
            .map(|value| value.to_string());
        if let Some(item_id) = item_id {
            if let Some(index) = items.iter().position(|entry| {
                entry
                    .get("id")
                    .and_then(Value::as_str)
                    .map(|value| value == item_id)
                    .unwrap_or(false)
            }) {
                items[index] = item;
            } else {
                items.push(item);
            }
        } else {
            items.push(item);
        }
        self.persist_thread_items(thread_id, &items);
    }
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn derive_thread_title(prompt: &str) -> Option<String> {
    let first_line = prompt.lines().next().unwrap_or_default().trim();
    if first_line.is_empty() {
        return None;
    }
    let compact = first_line.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        return None;
    }
    let title = compact.chars().take(38).collect::<String>();
    Some(title)
}

fn build_user_thread_item(thread_id: &str, turn_id: &str, text: &str) -> Value {
    json!({
        "id": format!("user-{thread_id}-{turn_id}"),
        "type": "userMessage",
        "content": [
            {
                "type": "text",
                "text": text
            }
        ]
    })
}

fn build_agent_thread_item(thread_id: &str, turn_id: &str, text: &str) -> Value {
    json!({
        "id": format!("agent-{thread_id}-{turn_id}"),
        "type": "agentMessage",
        "text": text
    })
}

fn build_tool_thread_item(
    thread_id: &str,
    tool_item_id: &str,
    presentation: &ToolCallPresentation,
    status: &str,
) -> Value {
    json!({
        "id": tool_item_id,
        "type": "mcpToolCall",
        "server": presentation.server,
        "tool": presentation.tool,
        "title": tool_call_display_title(presentation),
        "arguments": presentation.arguments,
        "result": presentation.result,
        "error": presentation.error,
        "status": status,
        "threadId": thread_id
    })
}

fn acp_error_message(value: &Value) -> Option<String> {
    let error = value.get("error")?;
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("ACP error");
    let details = error
        .get("data")
        .and_then(|v| v.get("details"))
        .and_then(Value::as_str)
        .unwrap_or("");
    if details.is_empty() {
        Some(message.to_string())
    } else {
        Some(format!("{message}: {details}"))
    }
}

fn is_session_not_found_error(value: &Value) -> bool {
    acp_error_message(value)
        .map(|msg| msg.to_ascii_lowercase().contains("session not found"))
        .unwrap_or(false)
}

fn is_request_aborted_message(message: &str) -> bool {
    message
        .to_ascii_lowercase()
        .contains("request was aborted")
}

fn is_not_generating_message(message: &str) -> bool {
    message
        .to_ascii_lowercase()
        .contains("not currently generating")
}

fn split_shell_like_tokens(value: &str) -> Vec<String> {
    value
        .split_whitespace()
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn extract_command_tokens(value: Option<&Value>) -> Vec<String> {
    let Some(value) = value else {
        return Vec::new();
    };
    match value {
        Value::String(raw) => split_shell_like_tokens(raw),
        Value::Array(items) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|segment| !segment.is_empty())
            .map(ToString::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn sanitize_approval_title(raw: Option<&str>) -> Option<String> {
    let title = raw?.trim();
    if title.is_empty()
        || title == "{}"
        || title == "[]"
        || title.eq_ignore_ascii_case("null")
        || title.eq_ignore_ascii_case("undefined")
    {
        None
    } else {
        Some(title.to_string())
    }
}

fn extract_approval_command(params: &Value) -> Vec<String> {
    let tool_call = params.get("toolCall");
    let mut command = extract_command_tokens(tool_call.and_then(|value| value.get("command")));
    if command.is_empty() {
        command = extract_command_tokens(tool_call.and_then(|value| value.get("argv")));
    }
    if command.is_empty() {
        command = extract_command_tokens(tool_call.and_then(|value| value.get("args")));
    }
    if command.is_empty() {
        command = extract_command_tokens(params.get("command"));
    }
    if command.is_empty() {
        command = extract_command_tokens(params.get("argv"));
    }
    if command.is_empty() {
        command = extract_command_tokens(params.get("args"));
    }
    if command.is_empty() {
        if let Some(title) = sanitize_approval_title(
            tool_call
                .and_then(|value| value.get("title"))
                .and_then(Value::as_str),
        ) {
            command.push(title);
        }
    }
    if command.is_empty() {
        command.push("Approve action".to_string());
    }
    command
}

fn micode_settings_path() -> Option<PathBuf> {
    let micode_home = resolve_micode_home_path()?;
    Some(micode_home.join("settings.json"))
}

fn resolve_micode_home_path() -> Option<PathBuf> {
    if let Ok(raw) = env::var("MICODE_HOME") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            return Some(PathBuf::from(trimmed));
        }
    }
    let home = env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".micode"))
}

fn read_configured_mcp_servers() -> Value {
    let Some(settings_path) = micode_settings_path() else {
        return json!({});
    };
    let raw = match std::fs::read_to_string(settings_path) {
        Ok(value) => value,
        Err(_) => return json!({}),
    };
    let root: Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(_) => return json!({}),
    };
    match root.get("mcpServers") {
        Some(Value::Object(map)) => Value::Object(map.clone()),
        _ => json!({}),
    }
}

fn read_usage_number(value: Option<&Value>) -> i64 {
    match value {
        Some(raw) => raw
            .as_i64()
            .or_else(|| raw.as_u64().map(|v| v.min(i64::MAX as u64) as i64))
            .or_else(|| raw.as_str().and_then(|s| s.parse::<i64>().ok()))
            .unwrap_or(0),
        None => 0,
    }
}

fn normalize_message_token_usage(message: &Value) -> Option<(i64, i64, i64, i64, i64)> {
    let tokens = message.get("tokens")?.as_object()?;
    let input_tokens = read_usage_number(tokens.get("input"));
    let cached_input_tokens = read_usage_number(tokens.get("cached"));
    let output_tokens = read_usage_number(tokens.get("output"));
    let reasoning_output_tokens = read_usage_number(tokens.get("thoughts"));
    let tool_tokens = read_usage_number(tokens.get("tool"));
    let total_tokens = {
        let explicit = read_usage_number(tokens.get("total"));
        if explicit > 0 {
            explicit
        } else {
            input_tokens
                .saturating_add(output_tokens)
                .saturating_add(reasoning_output_tokens)
                .saturating_add(tool_tokens)
        }
    };
    Some((
        input_tokens.max(0),
        cached_input_tokens.max(0),
        output_tokens.saturating_add(tool_tokens).max(0),
        reasoning_output_tokens.max(0),
        total_tokens.max(0),
    ))
}

fn parse_thread_token_usage_from_session(value: &Value) -> Option<Value> {
    let messages = value.get("messages")?.as_array()?;
    let mut total_input = 0_i64;
    let mut total_cached_input = 0_i64;
    let mut total_output = 0_i64;
    let mut total_reasoning = 0_i64;
    let mut total_total = 0_i64;
    let mut last = None;

    for message in messages {
        let Some((input, cached, output, reasoning, total)) =
            normalize_message_token_usage(message)
        else {
            continue;
        };
        total_input = total_input.saturating_add(input);
        total_cached_input = total_cached_input.saturating_add(cached);
        total_output = total_output.saturating_add(output);
        total_reasoning = total_reasoning.saturating_add(reasoning);
        total_total = total_total.saturating_add(total);
        last = Some((input, cached, output, reasoning, total));
    }

    let Some((last_input, last_cached, last_output, last_reasoning, last_total)) = last else {
        return None;
    };

    Some(json!({
        "last": {
            "totalTokens": last_total,
            "inputTokens": last_input,
            "cachedInputTokens": last_cached,
            "outputTokens": last_output,
            "reasoningOutputTokens": last_reasoning
        },
        "total": {
            "totalTokens": total_total,
            "inputTokens": total_input,
            "cachedInputTokens": total_cached_input,
            "outputTokens": total_output,
            "reasoningOutputTokens": total_reasoning
        },
        "modelContextWindow": null
    }))
}

fn load_thread_token_usage_for_session_in_home(
    session_id: &str,
    micode_home: &Path,
) -> Option<Value> {
    let normalized_session_id = session_id.trim();
    if normalized_session_id.is_empty() {
        return None;
    }

    let tmp_root = micode_home.join("tmp");
    let project_dirs = std::fs::read_dir(&tmp_root).ok()?;
    let mut latest: Option<(SystemTime, Value)> = None;

    for project_dir in project_dirs.flatten() {
        let chats_dir = project_dir.path().join("chats");
        if !chats_dir.is_dir() {
            continue;
        }
        let chat_files = match std::fs::read_dir(chats_dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for chat_file in chat_files.flatten() {
            let path = chat_file.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let raw = match std::fs::read_to_string(&path) {
                Ok(raw) => raw,
                Err(_) => continue,
            };
            if !raw.contains(normalized_session_id) {
                continue;
            }
            let parsed: Value = match serde_json::from_str(&raw) {
                Ok(value) => value,
                Err(_) => continue,
            };
            if parsed.get("sessionId").and_then(Value::as_str) != Some(normalized_session_id) {
                continue;
            }
            let Some(token_usage) = parse_thread_token_usage_from_session(&parsed) else {
                continue;
            };
            let modified_at = std::fs::metadata(&path)
                .and_then(|meta| meta.modified())
                .unwrap_or(UNIX_EPOCH);
            let replace = latest
                .as_ref()
                .map(|(current_modified, _)| modified_at > *current_modified)
                .unwrap_or(true);
            if replace {
                latest = Some((modified_at, token_usage));
            }
        }
    }

    latest.map(|(_, usage)| usage)
}

fn load_thread_token_usage_for_session(session_id: &str) -> Option<Value> {
    let micode_home = resolve_micode_home_path()?;
    load_thread_token_usage_for_session_in_home(session_id, &micode_home)
}

fn read_selected_auth_mode() -> Option<String> {
    let settings_path = micode_settings_path()?;
    let raw = std::fs::read_to_string(settings_path).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    let selected = value
        .get("selectedAuthType")
        .and_then(Value::as_str)
        .or_else(|| {
            value
                .get("security")
                .and_then(|v| v.get("auth"))
                .and_then(|v| v.get("selectedType"))
                .and_then(Value::as_str)
        })?
        .trim()
        .to_string();
    if selected.is_empty() {
        None
    } else {
        Some(selected)
    }
}

pub(crate) fn read_preferred_model() -> Option<String> {
    let settings_path = micode_settings_path()?;
    let raw = std::fs::read_to_string(settings_path).ok()?;
    let value: Value = serde_json::from_str(&raw).ok()?;
    value
        .get("model")
        .and_then(|v| v.get("preferredModel"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToString::to_string)
}

pub(crate) fn set_preferred_model(model: &str) -> Result<bool, String> {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        return Ok(false);
    }
    let settings_path = micode_settings_path().ok_or_else(|| "missing HOME".to_string())?;
    let mut root = if settings_path.is_file() {
        let raw = std::fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    if !root.is_object() {
        root = json!({});
    }
    let current = root
        .get("model")
        .and_then(|v| v.get("preferredModel"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    if current.trim() == trimmed {
        return Ok(false);
    }
    let root_obj = root
        .as_object_mut()
        .ok_or_else(|| "invalid settings root".to_string())?;
    let model_obj = root_obj
        .entry("model".to_string())
        .or_insert_with(|| json!({}));
    if !model_obj.is_object() {
        *model_obj = json!({});
    }
    if let Some(model_map) = model_obj.as_object_mut() {
        model_map.insert(
            "preferredModel".to_string(),
            Value::String(trimmed.to_string()),
        );
    }
    if let Some(parent) = settings_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let payload = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    std::fs::write(&settings_path, payload).map_err(|e| e.to_string())?;
    Ok(true)
}

fn find_executable_on_path(name: &str) -> Option<PathBuf> {
    let path = env::var("PATH").ok()?;
    for dir in path.split(':') {
        if dir.trim().is_empty() {
            continue;
        }
        let candidate = PathBuf::from(dir).join(name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn resolve_micode_cli_bundle_path(agent_bin: Option<&str>) -> Option<PathBuf> {
    let resolved_bin = agent_bin
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| find_executable_on_path("micode"))?;
    let canonical = std::fs::canonicalize(&resolved_bin).ok()?;
    if canonical
        .file_name()
        .and_then(|v| v.to_str())
        .map(|name| name.eq_ignore_ascii_case("cli.js"))
        .unwrap_or(false)
    {
        return Some(canonical);
    }
    if let Ok(raw) = std::fs::read_to_string(&canonical) {
        if let Some(token) = raw
            .split_whitespace()
            .find(|part| part.contains("@mi/mi-code-cli/dist/cli.js"))
        {
            let cleaned = token.trim_matches(|ch| ch == '"' || ch == '\'' || ch == ';');
            let candidate = PathBuf::from(cleaned);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn parse_js_string_field(line: &str, field: &str) -> Option<String> {
    let trimmed = line.trim();
    let prefix = format!("{field}:");
    let rest = trimmed.strip_prefix(&prefix)?.trim();
    let start = rest.find('"')?;
    let quoted = &rest[start..];
    let end = quoted.rfind('"')?;
    if end == 0 {
        return None;
    }
    let literal = &quoted[..=end];
    serde_json::from_str::<String>(literal).ok()
}

fn parse_js_bool_field(line: &str, field: &str) -> Option<bool> {
    let trimmed = line.trim();
    let prefix = format!("{field}:");
    let rest = trimmed.strip_prefix(&prefix)?.trim().trim_end_matches(',');
    match rest {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

fn parse_models_from_cli_bundle(path: &Path) -> Vec<(String, String, String)> {
    let raw = match std::fs::read_to_string(path) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let mut in_models = false;
    let mut in_object = false;
    let mut brace_depth = 0_i32;
    let mut object_lines: Vec<String> = Vec::new();
    let mut models: Vec<(String, String, String)> = Vec::new();
    for line in raw.lines() {
        let trimmed = line.trim();
        if !in_models {
            if trimmed.starts_with("var AVAILABLE_MODELS = [") {
                in_models = true;
            }
            continue;
        }
        if trimmed.starts_with("function loadCustomMifyModels") {
            break;
        }
        if trimmed.starts_with("//") {
            continue;
        }
        if !in_object {
            if trimmed.starts_with('{') {
                in_object = true;
                brace_depth = 0;
                object_lines.clear();
            } else {
                continue;
            }
        }
        object_lines.push(line.to_string());
        brace_depth += trimmed.chars().filter(|ch| *ch == '{').count() as i32;
        brace_depth -= trimmed.chars().filter(|ch| *ch == '}').count() as i32;
        if in_object && brace_depth <= 0 {
            let mut id: Option<String> = None;
            let mut label: Option<String> = None;
            let mut description: Option<String> = None;
            let mut is_visible: Option<bool> = None;
            for object_line in &object_lines {
                if id.is_none() {
                    id = parse_js_string_field(object_line, "id");
                }
                if label.is_none() {
                    label = parse_js_string_field(object_line, "label");
                }
                if description.is_none() {
                    description = parse_js_string_field(object_line, "description");
                }
                if is_visible.is_none() {
                    is_visible = parse_js_bool_field(object_line, "isVisible");
                }
            }
            if is_visible != Some(false) {
                if let (Some(id), Some(label)) = (id, label) {
                    models.push((id, label.clone(), description.unwrap_or(label)));
                }
            }
            in_object = false;
            object_lines.clear();
        }
    }
    let mut deduped: Vec<(String, String, String)> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (id, label, description) in models {
        if seen.insert(id.clone()) {
            deduped.push((id, label, description));
        }
    }
    deduped
}

fn discover_micode_models(agent_bin: Option<&str>) -> Vec<(String, String, String)> {
    let Some(bundle_path) = resolve_micode_cli_bundle_path(agent_bin) else {
        return Vec::new();
    };
    parse_models_from_cli_bundle(&bundle_path)
}

fn build_initialize_params(_client_version: &str) -> Value {
    json!({
        "protocolVersion": ACP_PROTOCOL_VERSION,
        "clientCapabilities": {
            "fs": {
                "readTextFile": false,
                "writeTextFile": false
            }
        }
    })
}

#[derive(Clone)]
struct ActivePromptContext {
    thread_id: String,
    turn_id: String,
}

impl ActivePromptContext {
    fn new(thread_id: String, turn_id: String) -> Self {
        Self { thread_id, turn_id }
    }

    fn agent_item_id(&self, segment: u32) -> String {
        if segment == 0 {
            return format!("agent-{}-{}", self.thread_id, self.turn_id);
        }
        format!("agent-{}-{}-s{}", self.thread_id, self.turn_id, segment)
    }

    fn reasoning_item_id(&self) -> String {
        format!("reasoning-{}-{}", self.thread_id, self.turn_id)
    }

    fn fallback_tool_item_id(&self) -> String {
        format!("tool-{}-{}", self.thread_id, self.turn_id)
    }
}

#[derive(Debug, Clone, Default)]
struct ToolCallPresentation {
    server: Option<String>,
    tool: Option<String>,
    title: Option<String>,
    arguments: Option<Value>,
    result: Option<String>,
    error: Option<String>,
}

fn sanitize_tool_title(raw: Option<&str>) -> Option<String> {
    let title = sanitize_approval_title(raw)?;
    let trimmed = title.trim();
    if trimmed == "." || trimmed == ".." || trimmed == "/" {
        return None;
    }
    Some(trimmed.to_string())
}

fn extract_string_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
}

fn normalize_tool_name(raw: &str) -> Option<String> {
    let normalized = raw.trim().trim_matches('"').trim_matches('\'');
    if normalized.is_empty() {
        return None;
    }
    Some(normalized.to_string())
}

fn infer_tool_name_from_title(title: &str) -> Option<String> {
    let lower = title.to_ascii_lowercase();
    if lower.contains("=>") {
        return Some("edit".to_string());
    }
    if lower.contains("**/") || lower.contains("*.") {
        return Some("glob".to_string());
    }
    if lower.ends_with(".md")
        || lower.ends_with(".txt")
        || lower.ends_with(".json")
        || lower.contains(".md:")
        || lower.contains(".txt:")
        || lower.contains(".json:")
    {
        return Some("edit".to_string());
    }
    None
}

fn extract_tool_presentation_from_update(update: &Value) -> ToolCallPresentation {
    let title = sanitize_tool_title(update.get("title").and_then(Value::as_str));
    let mut tool = extract_string_field(
        update,
        &["tool", "toolName", "name", "kind", "method", "action"],
    )
    .and_then(normalize_tool_name);
    if tool.is_none() {
        tool = title
            .as_deref()
            .and_then(infer_tool_name_from_title)
            .or_else(|| {
                update
                    .get("content")
                    .and_then(|content| {
                        extract_string_field(
                            content,
                            &["tool", "toolName", "name", "kind", "method", "action"],
                        )
                    })
                    .and_then(normalize_tool_name)
            });
    }
    let mut server = extract_string_field(
        update,
        &["server", "serverName", "mcpServer", "provider", "namespace"],
    )
    .and_then(normalize_tool_name);
    if server.is_none() && tool.is_some() {
        server = Some("micode".to_string());
    }
    ToolCallPresentation {
        server,
        tool,
        title,
        arguments: update.get("arguments").cloned().or_else(|| {
            update
                .get("content")
                .and_then(Value::as_object)
                .map(|content| Value::Object(content.clone()))
        }),
        result: update
            .get("result")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        error: update
            .get("error")
            .and_then(Value::as_str)
            .map(ToString::to_string),
    }
}

fn extract_tool_presentation_from_permission(params: &Value) -> Option<(String, ToolCallPresentation)> {
    let tool_call = params.get("toolCall")?;
    let tool_call_id = tool_call.get("toolCallId").and_then(Value::as_str)?;
    let mut tool = extract_string_field(tool_call, &["tool", "toolName", "name", "kind", "method"])
        .and_then(normalize_tool_name);
    let title = sanitize_tool_title(tool_call.get("title").and_then(Value::as_str));
    if tool.is_none() {
        tool = title
            .as_deref()
            .and_then(infer_tool_name_from_title)
            .or_else(|| {
                let command = extract_approval_command(params);
                command.first().cloned()
            });
    }
    let server = Some("micode".to_string());
    Some((
        tool_call_id.to_string(),
        ToolCallPresentation {
            server,
            tool,
            title,
            arguments: tool_call.get("arguments").cloned().or_else(|| {
                let command = extract_approval_command(params);
                if command.is_empty() {
                    None
                } else {
                    Some(json!({ "command": command }))
                }
            }),
            result: tool_call
                .get("result")
                .and_then(Value::as_str)
                .map(ToString::to_string),
            error: tool_call
                .get("error")
                .and_then(Value::as_str)
                .map(ToString::to_string),
        },
    ))
}

fn merge_tool_presentation(
    current: Option<ToolCallPresentation>,
    incoming: ToolCallPresentation,
) -> ToolCallPresentation {
    let mut merged = current.unwrap_or_default();
    if merged.server.is_none() {
        merged.server = incoming.server;
    }
    if merged.tool.is_none() {
        merged.tool = incoming.tool;
    }
    if merged.title.is_none() {
        merged.title = incoming.title;
    }
    if merged.arguments.is_none() {
        merged.arguments = incoming.arguments;
    }
    if merged.result.is_none() {
        merged.result = incoming.result;
    }
    if merged.error.is_none() {
        merged.error = incoming.error;
    }
    if merged.server.is_none() && merged.tool.is_some() {
        merged.server = Some("micode".to_string());
    }
    merged
}

fn tool_call_display_title(presentation: &ToolCallPresentation) -> String {
    match (presentation.server.as_deref(), presentation.tool.as_deref()) {
        (Some(server), Some(tool)) => format!("Tool: {server} / {tool}"),
        (_, Some(tool)) => format!("Tool: {tool}"),
        _ => presentation
            .title
            .as_ref()
            .map(|title| format!("Tool: {title}"))
            .unwrap_or_else(|| "Tool Call".to_string()),
    }
}

pub(crate) struct WorkspaceSession {
    pub(crate) entry: WorkspaceEntry,
    pub(crate) child: Mutex<Child>,
    pub(crate) stdin: Mutex<ChildStdin>,
    pub(crate) pending: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    pub(crate) next_id: AtomicU64,
    pub(crate) background_thread_callbacks: Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>,
    event_tx: mpsc::UnboundedSender<AppServerEvent>,
    thread_store: Mutex<LocalThreadStore>,
    approval_requests: Mutex<HashMap<String, Value>>,
    pending_prompt_streaming: Mutex<HashMap<String, bool>>,
    pending_prompt_agent_messages: Mutex<HashMap<String, String>>,
    pending_prompt_agent_segments: Mutex<HashMap<String, u32>>,
    active_prompts: Mutex<HashMap<String, ActivePromptContext>>,
    background_threads: Mutex<HashMap<String, String>>,
    tool_call_presentations: Mutex<HashMap<String, ToolCallPresentation>>,
}

impl WorkspaceSession {
    pub(crate) async fn invalidate_all_thread_sessions(&self) {
        self.thread_store.lock().await.clear_session_ids();
        self.background_threads.lock().await.clear();
    }

    async fn begin_prompt_tracking(&self, session_id: &str) {
        self.pending_prompt_streaming
            .lock()
            .await
            .insert(session_id.to_string(), false);
        self.pending_prompt_agent_messages
            .lock()
            .await
            .remove(session_id);
        self.pending_prompt_agent_segments
            .lock()
            .await
            .insert(session_id.to_string(), 0);
    }

    async fn register_active_prompt(&self, session_id: &str, thread_id: &str, turn_id: &str) {
        self.active_prompts.lock().await.insert(
            session_id.to_string(),
            ActivePromptContext::new(thread_id.to_string(), turn_id.to_string()),
        );
    }

    async fn active_prompt(&self, session_id: &str) -> Option<ActivePromptContext> {
        self.active_prompts.lock().await.get(session_id).cloned()
    }

    async fn clear_active_prompt(&self, session_id: &str) {
        self.active_prompts.lock().await.remove(session_id);
    }

    async fn merge_tool_call_presentation(
        &self,
        tool_call_id: &str,
        incoming: ToolCallPresentation,
    ) -> (ToolCallPresentation, bool) {
        let mut cache = self.tool_call_presentations.lock().await;
        let existing = cache.get(tool_call_id).cloned();
        let was_present = existing.is_some();
        let merged = merge_tool_presentation(existing, incoming);
        cache.insert(tool_call_id.to_string(), merged.clone());
        (merged, was_present)
    }

    async fn clear_tool_call_presentation(&self, tool_call_id: &str) {
        self.tool_call_presentations.lock().await.remove(tool_call_id);
    }

    async fn mark_prompt_streaming(&self, session_id: &str) {
        let mut pending = self.pending_prompt_streaming.lock().await;
        if let Some(has_streaming) = pending.get_mut(session_id) {
            *has_streaming = true;
        }
    }

    async fn finish_prompt_tracking(&self, session_id: &str) -> bool {
        let had_streaming = self
            .pending_prompt_streaming
            .lock()
            .await
            .remove(session_id)
            .unwrap_or(false);
        self.pending_prompt_agent_segments
            .lock()
            .await
            .remove(session_id);
        had_streaming
    }

    async fn finish_prompt_lifecycle(&self, session_id: &str) -> bool {
        let had_streaming = self.finish_prompt_tracking(session_id).await;
        self.clear_active_prompt(session_id).await;
        had_streaming
    }

    async fn append_prompt_agent_delta(&self, session_id: &str, delta: &str) {
        if delta.is_empty() {
            return;
        }
        let mut messages = self.pending_prompt_agent_messages.lock().await;
        let entry = messages.entry(session_id.to_string()).or_default();
        entry.push_str(delta);
    }

    async fn current_prompt_agent_item_id(&self, session_id: &str) -> Option<String> {
        let segment = self
            .pending_prompt_agent_segments
            .lock()
            .await
            .get(session_id)
            .copied()?;
        let context = self.active_prompt(session_id).await?;
        Some(context.agent_item_id(segment))
    }

    async fn bump_prompt_agent_segment(&self, session_id: &str) {
        let mut segments = self.pending_prompt_agent_segments.lock().await;
        if let Some(segment) = segments.get_mut(session_id) {
            *segment = segment.saturating_add(1);
        }
    }

    async fn take_prompt_agent_message(&self, session_id: &str) -> Option<String> {
        self.pending_prompt_agent_messages
            .lock()
            .await
            .remove(session_id)
    }

    async fn persist_thread_item(&self, thread_id: &str, item: Value) {
        self.thread_store.lock().await.upsert_thread_item(thread_id, item);
    }

    async fn persist_prompt_agent_item(
        &self,
        thread_id: &str,
        turn_id: &str,
        session_id: &str,
    ) {
        let Some(text) = self.take_prompt_agent_message(session_id).await else {
            return;
        };
        if text.trim().is_empty() {
            return;
        }
        self.persist_thread_item(thread_id, build_agent_thread_item(thread_id, turn_id, &text))
            .await;
    }

    async fn emit_latest_thread_token_usage(&self, thread_id: &str, session_id: &str) {
        let normalized_session_id = session_id.trim();
        if normalized_session_id.is_empty() {
            return;
        }
        for _attempt in 0..3 {
            let lookup_session_id = normalized_session_id.to_string();
            let usage = tokio::task::spawn_blocking(move || {
                load_thread_token_usage_for_session(&lookup_session_id)
            })
            .await
            .ok()
            .flatten();
            if let Some(token_usage) = usage {
                self.emit_event(
                    "thread/tokenUsage/updated",
                    json!({
                        "threadId": thread_id,
                        "tokenUsage": token_usage
                    }),
                );
                return;
            }
            sleep(Duration::from_millis(120)).await;
        }
    }

    async fn write_message(&self, value: Value) -> Result<(), String> {
        let mut stdin = self.stdin.lock().await;
        let mut line = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        line.push('\n');
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| e.to_string())
    }

    async fn send_acp_request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        self.write_message(
            json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }),
        )
        .await?;
        rx.await.map_err(|_| "request canceled".to_string())
    }

    fn emit_event(&self, method: &str, params: Value) {
        let _ = self.event_tx.send(AppServerEvent {
            workspace_id: self.entry.id.clone(),
            message: json!({ "method": method, "params": params }),
        });
    }

    async fn create_local_thread(&self, session_id: String) -> LocalThreadRecord {
        let thread = LocalThreadRecord {
            thread_id: Uuid::new_v4().to_string(),
            session_id,
            title: "New Thread".to_string(),
            archived: false,
            updated_at: now_ts(),
            message_index: 0,
        };
        let mut store = self.thread_store.lock().await;
        store.upsert(thread.clone());
        store.set_session_id(&thread.thread_id, thread.session_id.clone());
        thread
    }

    async fn get_thread_by_id(&self, thread_id: &str) -> Result<LocalThreadRecord, String> {
        let store = self.thread_store.lock().await;
        store
            .by_thread_id(thread_id)
            .ok_or_else(|| format!("thread not found: {thread_id}"))
    }

    fn parse_prompt_from_turn_start(params: &Value) -> String {
        let from_input = params
            .get("input")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|item| {
                if item.get("type").and_then(Value::as_str) == Some("text") {
                    item.get("text")
                        .and_then(Value::as_str)
                        .map(|v| v.to_string())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string();
        if !from_input.is_empty() {
            return from_input;
        }
        params
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .unwrap_or_default()
    }

    async fn create_session_for_cwd(&self, cwd: String) -> Result<String, String> {
        let mcp_servers = read_configured_mcp_servers();
        let response = self
            // ACP requires mcpServers in session/new. Pass configured servers from settings.
            .send_acp_request(
                "session/new",
                json!({ "cwd": cwd, "mcpServers": mcp_servers }),
            )
            .await?;
        let result = response.get("result").cloned().ok_or_else(|| {
            acp_error_message(&response).unwrap_or_else(|| "missing ACP result".to_string())
        })?;
        result
            .get("sessionId")
            .and_then(Value::as_str)
            .map(|v| v.to_string())
            .ok_or_else(|| "missing sessionId from ACP session/new".to_string())
    }

    pub(crate) async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        match method {
            "thread/start" => {
                let is_background = params
                    .get("_background")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let cwd = params
                    .get("cwd")
                    .and_then(Value::as_str)
                    .unwrap_or(self.entry.path.as_str())
                    .to_string();
                let session_id = self.create_session_for_cwd(cwd).await?;
                let thread = if is_background {
                    let thread_id = Uuid::new_v4().to_string();
                    self.background_threads
                        .lock()
                        .await
                        .insert(thread_id.clone(), session_id);
                    LocalThreadRecord {
                        thread_id,
                        session_id: String::new(),
                        title: "Background Thread".to_string(),
                        archived: true,
                        updated_at: now_ts(),
                        message_index: 0,
                    }
                } else {
                    self.create_local_thread(session_id).await
                };
                if !is_background {
                    self.emit_event(
                        "thread/started",
                        json!({
                            "thread": {
                                "id": thread.thread_id,
                                "name": thread.title
                            }
                        }),
                    );
                }
                Ok(json!({
                    "result": {
                        "thread": {
                            "id": thread.thread_id,
                            "name": thread.title
                        }
                    }
                }))
            }
            "thread/list" => {
                let store = self.thread_store.lock().await;
                let mut data = store.list_unarchived();
                data.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
                let threads = data
                    .into_iter()
                    .map(|entry| {
                        json!({
                            "id": entry.thread_id,
                            "name": entry.title,
                            "updatedAt": entry.updated_at,
                            "updated_at": entry.updated_at,
                            "preview": entry.title,
                            "cwd": self.entry.path,
                            "createdAt": entry.updated_at,
                            "created_at": entry.updated_at
                        })
                    })
                    .collect::<Vec<_>>();
                Ok(
                    json!({
                        "result": {
                            // CodexMonitor frontend reads `result.data` and filters by `cwd`.
                            // Keep both shapes for backward compatibility.
                            "data": threads,
                            "threads": threads,
                            "hasMore": false,
                            "nextCursor": null
                        }
                    }),
                )
            }
            "thread/resume" => {
                let thread_id = params
                    .get("threadId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "missing threadId".to_string())?;
                let mut thread = self.get_thread_by_id(thread_id).await?;
                // ACP has no persistent session/load. Always create a fresh session on resume.
                let new_session = self.create_session_for_cwd(self.entry.path.clone()).await?;
                self.thread_store
                    .lock()
                    .await
                    .set_session_id(&thread.thread_id, new_session.clone());
                thread.session_id = new_session;
                let history_items = self.thread_store.lock().await.load_thread_items(thread_id);
                let turns = if history_items.is_empty() {
                    Vec::new()
                } else {
                    vec![json!({
                        "id": format!("turn-history-{}", thread.thread_id),
                        "items": history_items
                    })]
                };
                Ok(json!({
                    "result": {
                        "thread": {
                            "id": thread.thread_id,
                            "name": thread.title,
                            "turns": turns
                        },
                        "items": history_items
                    }
                }))
            }
            "thread/archive" => {
                let thread_id = params
                    .get("threadId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "missing threadId".to_string())?;
                let removed_background = self
                    .background_threads
                    .lock()
                    .await
                    .remove(thread_id)
                    .is_some();
                if !removed_background {
                    self.thread_store.lock().await.delete(thread_id);
                }
                Ok(json!({ "result": { "ok": true } }))
            }
            "thread/name/set" => {
                let thread_id = params
                    .get("threadId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "missing threadId".to_string())?;
                let name = params
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("New Thread")
                    .trim()
                    .to_string();
                self.thread_store
                    .lock()
                    .await
                    .set_title(thread_id, name.clone());
                self.emit_event(
                    "thread/name/updated",
                    json!({ "threadId": thread_id, "threadName": name }),
                );
                Ok(json!({ "result": { "ok": true } }))
            }
            "thread/compact/start" => Ok(json!({ "result": { "ok": true, "mode": "synthetic" } })),
            "turn/start" => {
                let thread_id = params
                    .get("threadId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "missing threadId".to_string())?
                    .to_string();
                let background_session = {
                    let background_threads = self.background_threads.lock().await;
                    background_threads.get(&thread_id).cloned()
                };
                let is_background_thread = self
                    .background_thread_callbacks
                    .lock()
                    .await
                    .contains_key(&thread_id)
                    || background_session.is_some();
                let thread = if background_session.is_none() {
                    Some(self.get_thread_by_id(&thread_id).await?)
                } else {
                    None
                };
                let prompt_text = Self::parse_prompt_from_turn_start(&params);
                if prompt_text.is_empty() {
                    return Err("empty user message".to_string());
                }
                if !is_background_thread {
                    if let Some(thread_entry) = thread.as_ref() {
                        if thread_entry.title.trim().eq_ignore_ascii_case("new thread") {
                            if let Some(title) = derive_thread_title(&prompt_text) {
                                self.thread_store
                                    .lock()
                                    .await
                                    .set_title(&thread_id, title.clone());
                                self.emit_event(
                                    "thread/name/updated",
                                    json!({
                                        "threadId": thread_id,
                                        "threadName": title
                                    }),
                                );
                            }
                        }
                    }
                }
                let mut session_id = background_session
                    .clone()
                    .or_else(|| thread.as_ref().map(|entry| entry.session_id.clone()))
                    .unwrap_or_default();
                let requested_model = params
                    .get("model")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string);
                if let Some(requested_model) = requested_model {
                    if let Ok(changed) = set_preferred_model(&requested_model) {
                        if changed {
                            let fresh_session =
                                self.create_session_for_cwd(self.entry.path.clone()).await?;
                            if is_background_thread {
                                self.background_threads
                                    .lock()
                                    .await
                                    .insert(thread_id.clone(), fresh_session.clone());
                            } else {
                                self.thread_store
                                    .lock()
                                    .await
                                    .set_session_id(&thread_id, fresh_session.clone());
                            }
                            session_id = fresh_session;
                        }
                    }
                }
                if session_id.trim().is_empty() {
                    // Some migrated/local records may have an empty session id.
                    // Recreate proactively to avoid one failed prompt + retry roundtrip.
                    let fresh_session = self.create_session_for_cwd(self.entry.path.clone()).await?;
                    if is_background_thread {
                        self.background_threads
                            .lock()
                            .await
                            .insert(thread_id.clone(), fresh_session.clone());
                    } else {
                        self.thread_store
                            .lock()
                            .await
                            .set_session_id(&thread_id, fresh_session.clone());
                    }
                    session_id = fresh_session;
                }
                let turn_id = Uuid::new_v4().to_string();
                if !is_background_thread {
                    self.persist_thread_item(
                        &thread_id,
                        build_user_thread_item(&thread_id, &turn_id, &prompt_text),
                    )
                    .await;
                    self.emit_event(
                        "turn/started",
                        json!({
                            "threadId": thread_id,
                            "turn": { "id": turn_id, "threadId": thread_id }
                        }),
                    );
                }
                let mut tracked_session_id = session_id.clone();
                self.begin_prompt_tracking(&tracked_session_id).await;
                self.register_active_prompt(&tracked_session_id, &thread_id, &turn_id)
                    .await;
                let response = match timeout(
                    Duration::from_secs(90),
                    self.send_acp_request(
                        "session/prompt",
                        json!({
                            "sessionId": tracked_session_id,
                            "prompt": [{ "type": "text", "text": prompt_text }]
                        }),
                    ),
                )
                .await
                {
                    Ok(result) => {
                        let _ = self.finish_prompt_lifecycle(&tracked_session_id).await;
                        result?
                    }
                    Err(_) => {
                        let had_streaming = self.finish_prompt_lifecycle(&tracked_session_id).await;
                        if had_streaming {
                            if !is_background_thread {
                                self.persist_prompt_agent_item(
                                    &thread_id,
                                    &turn_id,
                                    &tracked_session_id,
                                )
                                .await;
                                self.thread_store.lock().await.touch_message(&thread_id);
                                self.emit_latest_thread_token_usage(&thread_id, &tracked_session_id)
                                    .await;
                            }
                            let normalized_turn = json!({
                                "id": turn_id,
                                "threadId": thread_id
                            });
                            if !is_background_thread {
                                self.emit_event(
                                    "turn/completed",
                                    json!({
                                        "threadId": thread_id,
                                        "turn": normalized_turn
                                    }),
                                );
                            }
                            return Ok(json!({
                                "result": {
                                    "stopReason": "end_turn",
                                    "turn": normalized_turn
                                }
                            }));
                        }
                        return Err("turn/start timed out waiting for MiCode response".to_string());
                    }
                };
                let response = if is_session_not_found_error(&response) {
                    // Session ids are process-local. Recreate once and retry.
                    let new_session = self.create_session_for_cwd(self.entry.path.clone()).await?;
                    if is_background_thread {
                        self.background_threads
                            .lock()
                            .await
                            .insert(thread_id.clone(), new_session.clone());
                    } else {
                        self.thread_store
                            .lock()
                            .await
                            .set_session_id(&thread_id, new_session.clone());
                    }
                    tracked_session_id = new_session.clone();
                    self.begin_prompt_tracking(&tracked_session_id).await;
                    self.register_active_prompt(&tracked_session_id, &thread_id, &turn_id)
                        .await;
                    match timeout(
                        Duration::from_secs(90),
                        self.send_acp_request(
                            "session/prompt",
                            json!({
                                "sessionId": new_session,
                                "prompt": [{ "type": "text", "text": prompt_text }]
                            }),
                        ),
                    )
                    .await
                    {
                        Ok(result) => {
                            let _ = self.finish_prompt_lifecycle(&tracked_session_id).await;
                            result?
                        }
                        Err(_) => {
                            let had_streaming =
                                self.finish_prompt_lifecycle(&tracked_session_id).await;
                            if had_streaming {
                                if !is_background_thread {
                                    self.persist_prompt_agent_item(
                                        &thread_id,
                                        &turn_id,
                                        &tracked_session_id,
                                    )
                                    .await;
                                    self.thread_store.lock().await.touch_message(&thread_id);
                                    self.emit_latest_thread_token_usage(&thread_id, &tracked_session_id)
                                        .await;
                                }
                                let normalized_turn = json!({
                                    "id": turn_id,
                                    "threadId": thread_id
                                });
                                if !is_background_thread {
                                    self.emit_event(
                                        "turn/completed",
                                        json!({
                                            "threadId": thread_id,
                                            "turn": normalized_turn
                                        }),
                                    );
                                }
                                return Ok(json!({
                                    "result": {
                                        "stopReason": "end_turn",
                                        "turn": normalized_turn
                                    }
                                }));
                            }
                            return Err(
                                "turn/start timed out waiting for MiCode response after session recovery"
                                    .to_string(),
                            );
                        }
                    }
                } else {
                    response
                };
                if let Some(error) = acp_error_message(&response) {
                    if is_request_aborted_message(&error) {
                        if !is_background_thread {
                            self.persist_prompt_agent_item(
                                &thread_id,
                                &turn_id,
                                &tracked_session_id,
                            )
                            .await;
                            self.thread_store.lock().await.touch_message(&thread_id);
                            self.emit_latest_thread_token_usage(&thread_id, &tracked_session_id)
                                .await;
                        }
                        let normalized_turn = json!({
                            "id": turn_id,
                            "threadId": thread_id
                        });
                        if !is_background_thread {
                            self.emit_event(
                                "turn/completed",
                                json!({
                                    "threadId": thread_id,
                                    "turn": normalized_turn
                                }),
                            );
                        }
                        return Ok(json!({
                            "result": {
                                "stopReason": "cancelled",
                                "turn": normalized_turn
                            }
                        }));
                    }
                    return Err(format!("turn/start failed: {error}"));
                }
                if !is_background_thread {
                    self.persist_prompt_agent_item(&thread_id, &turn_id, &tracked_session_id)
                        .await;
                    self.thread_store.lock().await.touch_message(&thread_id);
                    self.emit_latest_thread_token_usage(&thread_id, &tracked_session_id)
                        .await;
                }
                let mut normalized_response = response.clone();
                let normalized_turn = json!({
                    "id": turn_id,
                    "threadId": thread_id
                });
                if let Some(result) = normalized_response
                    .get_mut("result")
                    .and_then(Value::as_object_mut)
                {
                    result
                        .entry("turn".to_string())
                        .or_insert_with(|| normalized_turn.clone());
                } else {
                    normalized_response = json!({
                        "result": {
                            "turn": normalized_turn
                        }
                    });
                }
                if !is_background_thread {
                    self.emit_event(
                        "turn/completed",
                        json!({
                            "threadId": thread_id,
                            "turn": normalized_turn
                        }),
                    );
                }
                Ok(normalized_response)
            }
            "turn/interrupt" => {
                let thread_id = params
                    .get("threadId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "missing threadId".to_string())?;
                let background_session = {
                    let background_threads = self.background_threads.lock().await;
                    background_threads.get(thread_id).cloned()
                };
                let thread_session = if let Some(session_id) = background_session {
                    session_id
                } else {
                    self.get_thread_by_id(thread_id).await?.session_id
                };
                let response = self
                    .send_acp_request("session/cancel", json!({ "sessionId": thread_session }))
                    .await?;
                if let Some(error) = acp_error_message(&response) {
                    if is_not_generating_message(&error) {
                        return Ok(json!({ "result": null }));
                    }
                    return Err(format!("turn/interrupt failed: {error}"));
                }
                Ok(response)
            }
            "model/list" => {
                let preferred = read_preferred_model();
                let mut models = discover_micode_models(self.entry.agent_bin.as_deref());
                if models.is_empty() {
                    models.push((
                        "auto".to_string(),
                        "MiCode Auto".to_string(),
                        "Use MiCode default model from local configuration".to_string(),
                    ));
                }
                let has_preferred = preferred
                    .as_ref()
                    .map(|pref| models.iter().any(|(id, _, _)| id == pref))
                    .unwrap_or(false);
                let data = models
                    .into_iter()
                    .enumerate()
                    .map(|(index, (id, label, description))| {
                        let model_id = id.clone();
                        let is_default = if let Some(pref) = preferred.as_ref() {
                            id == *pref
                        } else {
                            index == 0
                        };
                        json!({
                            "id": id,
                            "model": model_id,
                            "displayName": label,
                            "description": description,
                            "supportedReasoningEfforts": [],
                            "defaultReasoningEffort": null,
                            "isDefault": if has_preferred { is_default } else { index == 0 }
                        })
                    })
                    .collect::<Vec<_>>();
                Ok(json!({ "result": { "data": data } }))
            }
            "account/read" => {
                let auth_mode = read_selected_auth_mode()
                    .unwrap_or_else(|| "unknown".to_string())
                    .to_ascii_lowercase();
                let account_type = if auth_mode == "openai" {
                    "apikey"
                } else if auth_mode == "qwen-oauth" {
                    "chatgpt"
                } else {
                    "unknown"
                };
                Ok(json!({
                    "result": {
                        "provider": "micode-acp",
                        "authMode": auth_mode,
                        "account": {
                            "type": account_type
                        }
                    }
                }))
            }
            "account/rateLimits/read" => {
                Ok(json!({ "result": { "source": "synthetic", "limits": [] } }))
            }
            "app/list" => {
                Ok(json!({ "result": { "apps": [], "hasMore": false, "nextCursor": null } }))
            }
            "collaborationMode/list" => Ok(json!({
                "result": {
                    "data": [
                        {
                            "mode": "default",
                            "label": "Default",
                            "settings": {}
                        }
                    ]
                }
            })),
            _ => self.send_acp_request(method, params).await,
        }
    }

    #[allow(dead_code)]
    pub(crate) async fn send_notification(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<(), String> {
        let value = if let Some(params) = params {
            json!({ "jsonrpc": "2.0", "method": method, "params": params })
        } else {
            json!({ "jsonrpc": "2.0", "method": method })
        };
        self.write_message(value).await
    }

    pub(crate) async fn send_response(&self, id: Value, result: Value) -> Result<(), String> {
        let id_key = id
            .as_i64()
            .map(|v| v.to_string())
            .unwrap_or_else(|| id.to_string());
        let original = self.approval_requests.lock().await.remove(&id_key);
        if let Some(original) = original {
            let options = original
                .get("options")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let decision = result
                .get("decision")
                .and_then(Value::as_str)
                .unwrap_or("decline");
            let preferred = if decision == "accept" {
                ["allow_once", "allow_always"]
            } else {
                ["reject_once", "reject_always"]
            };
            let option_id = preferred
                .iter()
                .find_map(|kind| {
                    options.iter().find_map(|opt| {
                        if opt.get("kind").and_then(Value::as_str) == Some(*kind) {
                            opt.get("optionId")
                                .and_then(Value::as_str)
                                .map(|v| v.to_string())
                        } else {
                            None
                        }
                    })
                })
                .or_else(|| {
                    options.iter().find_map(|opt| {
                        opt.get("optionId")
                            .and_then(Value::as_str)
                            .map(|v| v.to_string())
                    })
                });
            let mapped = if let Some(option_id) = option_id {
                json!({ "outcome": { "outcome": "selected", "optionId": option_id } })
            } else {
                json!({ "outcome": { "outcome": "cancelled" } })
            };
            return self
                .write_message(json!({ "jsonrpc": "2.0", "id": id, "result": mapped }))
                .await;
        }
        self.write_message(json!({ "jsonrpc": "2.0", "id": id, "result": result }))
            .await
    }
}

pub(crate) fn build_micode_path_env(agent_bin: Option<&str>) -> Option<String> {
    let mut paths: Vec<String> = env::var("PATH")
        .unwrap_or_default()
        .split(':')
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect();
    let mut extras = vec![
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
    ]
    .into_iter()
    .map(|value| value.to_string())
    .collect::<Vec<String>>();
    if let Ok(home) = env::var("HOME") {
        extras.push(format!("{home}/.local/bin"));
        extras.push(format!("{home}/.local/share/mise/shims"));
        extras.push(format!("{home}/.cargo/bin"));
        extras.push(format!("{home}/.bun/bin"));
    }
    if let Some(bin_path) = agent_bin.filter(|value| !value.trim().is_empty()) {
        if let Some(parent) = Path::new(bin_path).parent() {
            extras.push(parent.to_string_lossy().to_string());
        }
    }
    for extra in extras {
        if !paths.contains(&extra) {
            paths.push(extra);
        }
    }
    if paths.is_empty() {
        None
    } else {
        Some(paths.join(":"))
    }
}

pub(crate) fn build_micode_command_with_bin(agent_bin: Option<String>) -> Command {
    let bin = agent_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "micode".into());
    let mut command = tokio_command(bin);
    if let Some(path_env) = build_micode_path_env(agent_bin.as_deref()) {
        command.env("PATH", path_env);
    }
    command
}

pub(crate) async fn check_micode_installation(
    agent_bin: Option<String>,
) -> Result<Option<String>, String> {
    let mut command = build_micode_command_with_bin(agent_bin);
    command.arg("--version");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "MiCode CLI not found. Install micode and ensure `micode` is on your PATH."
                    .to_string()
            } else {
                e.to_string()
            }
        })?,
        Err(_) => {
            return Err(
                "Timed out while checking MiCode CLI. Make sure `micode --version` runs in Terminal."
                    .to_string(),
            );
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        return Err(if detail.is_empty() {
            "MiCode CLI failed to start. Try running `micode --version` in Terminal.".to_string()
        } else {
            format!("MiCode CLI failed to start: {detail}")
        });
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if version.is_empty() {
        None
    } else {
        Some(version)
    })
}

pub(crate) async fn check_acp_handshake(
    agent_bin: Option<String>,
    agent_args: Option<String>,
) -> Result<bool, String> {
    let mut command = build_micode_command_with_bin(agent_bin);
    apply_micode_args(&mut command, agent_args.as_deref())?;
    command.arg("--experimental-acp");
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::null());
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let mut stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let init = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": ACP_PROTOCOL_VERSION,
            "clientCapabilities": {
                "fs": { "readTextFile": false, "writeTextFile": false }
            }
        }
    });
    let mut line = serde_json::to_string(&init).map_err(|e| e.to_string())?;
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    let mut lines = BufReader::new(stdout).lines();
    let result = timeout(Duration::from_secs(5), lines.next_line()).await;
    let _ = child.kill().await;
    match result {
        Ok(Ok(Some(line))) => Ok(line.contains("\"result\"") && line.contains("protocolVersion")),
        Ok(Ok(None)) => Ok(false),
        Ok(Err(err)) => Err(err.to_string()),
        Err(_) => Ok(false),
    }
}

fn session_id_from_notification(value: &Value) -> Option<String> {
    value
        .get("params")
        .and_then(|params| params.get("sessionId"))
        .and_then(Value::as_str)
        .map(|v| v.to_string())
}

fn translate_acp_update(
    context: &ActivePromptContext,
    update: &Value,
    workspace_id: &str,
    agent_item_id: Option<&str>,
    cached_tool: Option<&ToolCallPresentation>,
) -> Vec<AppServerEvent> {
    let mut events = Vec::new();
    let kind = update
        .get("sessionUpdate")
        .and_then(Value::as_str)
        .unwrap_or_default();

    match kind {
        "agent_message_chunk" => {
            let delta = update
                .get("content")
                .and_then(|content| content.get("text"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if !delta.is_empty() {
                let item_id = agent_item_id
                    .map(ToString::to_string)
                    .unwrap_or_else(|| context.agent_item_id(0));
                events.push(AppServerEvent {
                    workspace_id: workspace_id.to_string(),
                    message: json!({
                        "method": "item/agentMessage/delta",
                        "params": {
                            "threadId": context.thread_id,
                            "itemId": item_id,
                            "delta": delta
                        }
                    }),
                });
            }
        }
        "agent_thought_chunk" => {
            let delta = update
                .get("content")
                .and_then(|content| content.get("text"))
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if !delta.is_empty() {
                events.push(AppServerEvent {
                    workspace_id: workspace_id.to_string(),
                    message: json!({
                        "method": "item/reasoning/textDelta",
                        "params": {
                            "threadId": context.thread_id,
                            "itemId": context.reasoning_item_id(),
                            "delta": delta
                        }
                    }),
                });
            }
        }
        "plan" => {
            let plan = update.get("entries").cloned().unwrap_or_else(|| json!([]));
            events.push(AppServerEvent {
                workspace_id: workspace_id.to_string(),
                message: json!({
                    "method": "turn/plan/updated",
                    "params": {
                        "threadId": context.thread_id,
                        "turnId": context.turn_id,
                        "explanation": null,
                        "plan": plan
                    }
                }),
            });
        }
        "available_commands_update" => {
            let commands = update
                .get("availableCommands")
                .cloned()
                .unwrap_or_else(|| json!([]));
            events.push(AppServerEvent {
                workspace_id: workspace_id.to_string(),
                message: json!({
                    "method": "micode/availableCommands/updated",
                    "params": {
                        "threadId": context.thread_id,
                        "availableCommands": commands
                    }
                }),
            });
        }
        "tool_call" => {
            let item_id = update
                .get("toolCallId")
                .and_then(Value::as_str)
                .map(|value| format!("tool-{value}"))
                .unwrap_or_else(|| context.fallback_tool_item_id());
            let presentation = merge_tool_presentation(
                cached_tool.cloned(),
                extract_tool_presentation_from_update(update),
            );
            let title = tool_call_display_title(&presentation);
            events.push(AppServerEvent {
                workspace_id: workspace_id.to_string(),
                message: json!({
                    "method": "item/started",
                    "params": {
                        "threadId": context.thread_id,
                        "item": {
                            "id": item_id,
                            "type": "mcpToolCall",
                            "title": title,
                            "server": presentation.server,
                            "tool": presentation.tool,
                            "arguments": presentation.arguments,
                            "status": "in_progress"
                        }
                    }
                }),
            });
        }
        "tool_call_update" => {
            let item_id = update
                .get("toolCallId")
                .and_then(Value::as_str)
                .map(|value| format!("tool-{value}"))
                .unwrap_or_else(|| context.fallback_tool_item_id());
            let presentation = merge_tool_presentation(
                cached_tool.cloned(),
                extract_tool_presentation_from_update(update),
            );
            let title = tool_call_display_title(&presentation);
            events.push(AppServerEvent {
                workspace_id: workspace_id.to_string(),
                message: json!({
                    "method": "item/completed",
                    "params": {
                        "threadId": context.thread_id,
                        "item": {
                            "id": item_id,
                            "type": "mcpToolCall",
                            "title": title,
                            "server": presentation.server,
                            "tool": presentation.tool,
                            "arguments": presentation.arguments,
                            "result": presentation.result,
                            "error": presentation.error,
                            "status": "completed"
                        }
                    }
                }),
            });
        }
        _ => {}
    }

    events
}

pub(crate) async fn spawn_workspace_session<E: EventSink>(
    entry: WorkspaceEntry,
    default_micode_bin: Option<String>,
    agent_args: Option<String>,
    agent_home: Option<PathBuf>,
    client_version: String,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    let agent_bin = entry
        .agent_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_micode_bin);
    let _ = check_micode_installation(agent_bin.clone()).await?;

    let mut command = build_micode_command_with_bin(agent_bin);
    apply_micode_args(&mut command, agent_args.as_deref())?;
    command.current_dir(&entry.path);
    command.arg("--experimental-acp");
    // Do not inject CODEX_HOME/MICODE_HOME by default for MiCode ACP.
    // Keeping CLI runtime environment aligned with terminal `micode` avoids
    // accidental profile/auth mismatch and stalled prompts.
    let _ = agent_home;
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<AppServerEvent>();
    let sink_for_forward = event_sink.clone();
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            sink_for_forward.emit_app_server_event(event);
        }
    });

    let session = Arc::new(WorkspaceSession {
        entry: entry.clone(),
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        background_thread_callbacks: Mutex::new(HashMap::new()),
        event_tx: event_tx.clone(),
        thread_store: Mutex::new(LocalThreadStore::load(&entry.path)),
        approval_requests: Mutex::new(HashMap::new()),
        pending_prompt_streaming: Mutex::new(HashMap::new()),
        pending_prompt_agent_messages: Mutex::new(HashMap::new()),
        pending_prompt_agent_segments: Mutex::new(HashMap::new()),
        active_prompts: Mutex::new(HashMap::new()),
        background_threads: Mutex::new(HashMap::new()),
        tool_call_presentations: Mutex::new(HashMap::new()),
    });

    let session_clone = Arc::clone(&session);
    let workspace_id = entry.id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let value: Value = match serde_json::from_str(&line) {
                Ok(value) => value,
                Err(err) => {
                    let _ = event_tx.send(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "method": "micode/parseError",
                            "params": { "error": err.to_string(), "raw": line },
                        }),
                    });
                    continue;
                }
            };

            let response_id = value.get("id").and_then(|id| {
                id.as_u64()
                    .or_else(|| id.as_str().and_then(|raw| raw.parse::<u64>().ok()))
            });
            if let Some(id) = response_id {
                if value.get("result").is_some() || value.get("error").is_some() {
                    if let Some(tx) = session_clone.pending.lock().await.remove(&id) {
                        let _ = tx.send(value.clone());
                    }
                    continue;
                }
            }

            if let Some(method) = value.get("method").and_then(Value::as_str) {
                if method == "session/update" {
                    let session_id = session_id_from_notification(&value).unwrap_or_default();
                    if let Some(update) = value.get("params").and_then(|v| v.get("update")) {
                        let update_kind = update
                            .get("sessionUpdate")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let context = if let Some(active) = session_clone.active_prompt(&session_id).await
                        {
                            Some(active)
                        } else if update_kind == "available_commands_update" {
                            let thread = {
                                let store = session_clone.thread_store.lock().await;
                                store.by_session_id(&session_id)
                            };
                            thread.map(|entry| {
                                ActivePromptContext::new(
                                    entry.thread_id,
                                    "out-of-turn".to_string(),
                                )
                            })
                        } else {
                            None
                        };
                        if matches!(
                            update_kind,
                            "agent_message_chunk"
                                | "agent_thought_chunk"
                                | "tool_call"
                                | "tool_call_update"
                                | "plan"
                        ) {
                            session_clone.mark_prompt_streaming(&session_id).await;
                        }
                        if update_kind == "agent_message_chunk" {
                            let delta = update
                                .get("content")
                                .and_then(|content| content.get("text"))
                                .and_then(Value::as_str)
                                .unwrap_or_default();
                            session_clone
                                .append_prompt_agent_delta(&session_id, delta)
                                .await;
                        }
                        if let Some(context) = context {
                            let agent_item_id = if update_kind == "agent_message_chunk" {
                                session_clone.current_prompt_agent_item_id(&session_id).await
                            } else {
                                None
                            };
                            let tool_call_id = update
                                .get("toolCallId")
                                .and_then(Value::as_str)
                                .map(ToString::to_string);
                            let mut tool_presentation_was_existing = true;
                            let cached_tool = if matches!(update_kind, "tool_call" | "tool_call_update")
                            {
                                if let Some(tool_call_id) = tool_call_id.as_deref() {
                                    let (merged, existed) = session_clone
                                        .merge_tool_call_presentation(
                                            tool_call_id,
                                            extract_tool_presentation_from_update(update),
                                        )
                                        .await;
                                    tool_presentation_was_existing = existed;
                                    Some(merged)
                                } else {
                                    None
                                }
                            } else {
                                None
                            };
                            let translated = translate_acp_update(
                                &context,
                                update,
                                &workspace_id,
                                agent_item_id.as_deref(),
                                cached_tool.as_ref(),
                            );
                            let background_callback = {
                                let callbacks = session_clone.background_thread_callbacks.lock().await;
                                callbacks.get(&context.thread_id).cloned()
                            };
                            if let Some(callback) = background_callback {
                                for event in translated {
                                    let _ = callback.send(event.message);
                                }
                            } else {
                                for event in translated {
                                    let _ = event_tx.send(event);
                                }
                            }
                            if update_kind == "tool_call_update" {
                                if let Some(tool_call_id) = tool_call_id.as_deref() {
                                    session_clone.clear_tool_call_presentation(tool_call_id).await;
                                }
                            }
                            if !context.thread_id.is_empty() && matches!(update_kind, "tool_call" | "tool_call_update")
                            {
                                if let Some(tool_call_id) = tool_call_id.as_deref() {
                                    if let Some(presentation) = cached_tool.as_ref() {
                                        let status = if update_kind == "tool_call_update" {
                                            "completed"
                                        } else {
                                            "in_progress"
                                        };
                                        let tool_item_id = format!("tool-{tool_call_id}");
                                        session_clone
                                            .persist_thread_item(
                                                &context.thread_id,
                                                build_tool_thread_item(
                                                    &context.thread_id,
                                                    &tool_item_id,
                                                    presentation,
                                                    status,
                                                ),
                                            )
                                            .await;
                                    }
                                }
                            }
                            // Split assistant stream around tool boundaries.
                            // `session/request_permission` and `session/update.tool_call` ordering is not stable,
                            // so we segment on first-seen tool start and also on tool completion.
                            if update_kind == "tool_call" && !tool_presentation_was_existing {
                                session_clone.bump_prompt_agent_segment(&session_id).await;
                            }
                            if update_kind == "tool_call_update" {
                                session_clone.bump_prompt_agent_segment(&session_id).await;
                            }
                        }
                    }
                    continue;
                }

                if method == "session/request_permission" {
                    let request_id = value.get("id").cloned().unwrap_or(Value::Null);
                    let id_key = request_id
                        .as_i64()
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| request_id.to_string());
                    let params = value.get("params").cloned().unwrap_or(Value::Null);
                    session_clone
                        .approval_requests
                        .lock()
                        .await
                        .insert(id_key, params.clone());
                    let session_id = params
                        .get("sessionId")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    let thread_id = {
                        let store = session_clone.thread_store.lock().await;
                        store
                            .by_session_id(session_id)
                            .map(|entry| entry.thread_id)
                            .unwrap_or_default()
                    };
                    let command = extract_approval_command(&params);
                    if let Some((tool_call_id, tool_presentation)) =
                        extract_tool_presentation_from_permission(&params)
                    {
                        let (merged, existed) = session_clone
                            .merge_tool_call_presentation(&tool_call_id, tool_presentation)
                            .await;
                        if !existed && !thread_id.is_empty() {
                            let item_id = format!("tool-{tool_call_id}");
                            session_clone.bump_prompt_agent_segment(session_id).await;
                            session_clone
                                .persist_thread_item(
                                    &thread_id,
                                    build_tool_thread_item(
                                        &thread_id,
                                        &item_id,
                                        &merged,
                                        "in_progress",
                                    ),
                                )
                                .await;
                            let _ = event_tx.send(AppServerEvent {
                                workspace_id: workspace_id.clone(),
                                message: json!({
                                    "method": "item/started",
                                    "params": {
                                        "threadId": thread_id,
                                        "item": {
                                            "id": item_id,
                                            "type": "mcpToolCall",
                                            "title": tool_call_display_title(&merged),
                                            "server": merged.server,
                                            "tool": merged.tool,
                                            "arguments": merged.arguments,
                                            "status": "in_progress"
                                        }
                                    }
                                }),
                            });
                        }
                    }
                    let _ = event_tx.send(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "id": request_id,
                            "method": "workspace/requestApproval",
                            "params": {
                                "threadId": thread_id,
                                "command": command,
                                "raw": params
                            }
                        }),
                    });
                    continue;
                }

                let _ = event_tx.send(AppServerEvent {
                    workspace_id: workspace_id.clone(),
                    message: value,
                });
            }
        }
    });

    let workspace_id = entry.id.clone();
    let event_sink_clone = event_sink.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            event_sink_clone.emit_app_server_event(AppServerEvent {
                workspace_id: workspace_id.clone(),
                message: json!({
                    "method": "micode/stderr",
                    "params": { "message": line },
                }),
            });
        }
    });

    let init_params = build_initialize_params(&client_version);
    let init_result = timeout(
        Duration::from_secs(15),
        session.send_acp_request("initialize", init_params),
    )
    .await;
    let init_response = match init_result {
        Ok(response) => response,
        Err(_) => {
            let mut child = session.child.lock().await;
            let _ = child.kill().await;
            return Err(
                "MiCode ACP did not respond to initialize. Check that `micode --experimental-acp` works in Terminal."
                    .to_string(),
            );
        }
    };
    let init_response = init_response?;
    if init_response.get("error").is_some() {
        return Err(format!("ACP initialize failed: {init_response}"));
    }

    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: entry.id.clone(),
        message: json!({
            "method": "micode/connected",
            "params": { "workspaceId": entry.id.clone() }
        }),
    });

    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::{
        build_initialize_params, extract_approval_command,
        load_thread_token_usage_for_session_in_home, translate_acp_update, ActivePromptContext,
        ToolCallPresentation, WorkspaceSession,
    };
    use serde_json::{json, Value};
    use std::path::PathBuf;
    use uuid::Uuid;

    #[test]
    fn build_initialize_params_sets_protocol_version() {
        let params = build_initialize_params("1.2.3");
        assert_eq!(
            params
                .get("protocolVersion")
                .and_then(|value| value.as_u64()),
            Some(1)
        );
    }

    #[test]
    fn translate_agent_message_chunk_to_delta_event() {
        let update = json!({
            "sessionUpdate": "agent_message_chunk",
            "content": { "type": "text", "text": "hello" }
        });
        let context = ActivePromptContext::new("thread-1".to_string(), "turn-1".to_string());
        let events = translate_acp_update(&context, &update, "ws-1", None, None);
        assert_eq!(events.len(), 1);
        let method = events[0]
            .message
            .get("method")
            .and_then(|value| value.as_str());
        assert_eq!(method, Some("item/agentMessage/delta"));
    }

    #[test]
    fn translate_plan_to_turn_plan_updated_event() {
        let update = json!({
            "sessionUpdate": "plan",
            "entries": [
                { "content": "step1", "status": "pending", "priority": "high" }
            ]
        });
        let context = ActivePromptContext::new("thread-2".to_string(), "turn-2".to_string());
        let events = translate_acp_update(&context, &update, "ws-2", None, None);
        assert_eq!(events.len(), 1);
        let method = events[0]
            .message
            .get("method")
            .and_then(|value| value.as_str());
        assert_eq!(method, Some("turn/plan/updated"));
    }

    #[test]
    fn translate_available_commands_update_event() {
        let update = json!({
            "sessionUpdate": "available_commands_update",
            "availableCommands": [
                { "name": "status", "description": "Show status" }
            ]
        });
        let context = ActivePromptContext::new("thread-3".to_string(), "turn-3".to_string());
        let events = translate_acp_update(&context, &update, "ws-3", None, None);
        assert_eq!(events.len(), 1);
        let method = events[0]
            .message
            .get("method")
            .and_then(|value| value.as_str());
        assert_eq!(method, Some("micode/availableCommands/updated"));
    }

    #[test]
    fn translate_tool_call_event_includes_server_and_tool() {
        let update = json!({
            "sessionUpdate": "tool_call",
            "toolCallId": "call_1",
            "toolName": "glob"
        });
        let context = ActivePromptContext::new("thread-4".to_string(), "turn-4".to_string());
        let events = translate_acp_update(&context, &update, "ws-4", None, None);
        assert_eq!(events.len(), 1);
        let item = events[0]
            .message
            .get("params")
            .and_then(|value| value.get("item"))
            .cloned()
            .unwrap_or(Value::Null);
        assert_eq!(item.get("server").and_then(Value::as_str), Some("micode"));
        assert_eq!(item.get("tool").and_then(Value::as_str), Some("glob"));
    }

    #[test]
    fn translate_tool_call_update_uses_cached_tool_identity() {
        let update = json!({
            "sessionUpdate": "tool_call_update",
            "toolCallId": "call_2"
        });
        let context = ActivePromptContext::new("thread-5".to_string(), "turn-5".to_string());
        let cached = ToolCallPresentation {
            server: Some("micode".to_string()),
            tool: Some("edit".to_string()),
            title: Some("abc.md: foo => bar".to_string()),
            arguments: None,
            result: None,
            error: None,
        };
        let events = translate_acp_update(&context, &update, "ws-5", None, Some(&cached));
        assert_eq!(events.len(), 1);
        let item = events[0]
            .message
            .get("params")
            .and_then(|value| value.get("item"))
            .cloned()
            .unwrap_or(Value::Null);
        assert_eq!(item.get("server").and_then(Value::as_str), Some("micode"));
        assert_eq!(item.get("tool").and_then(Value::as_str), Some("edit"));
    }

    #[test]
    fn parse_prompt_from_turn_start_falls_back_to_text() {
        let params = json!({
            "threadId": "thread-1",
            "text": "hello from text"
        });
        let prompt = WorkspaceSession::parse_prompt_from_turn_start(&params);
        assert_eq!(prompt, "hello from text");
    }

    #[test]
    fn extract_approval_command_ignores_empty_object_title() {
        let params = json!({
            "toolCall": {
                "title": "{}"
            }
        });
        let command = extract_approval_command(&params);
        assert_eq!(command, vec!["Approve action"]);
    }

    #[test]
    fn load_thread_token_usage_reads_last_and_total_from_micode_session_file() {
        let root = std::env::temp_dir().join(format!("micode-usage-{}", Uuid::new_v4()));
        let chats = root.join("tmp").join("project-a").join("chats");
        std::fs::create_dir_all(&chats).expect("create chats dir");

        let session_id = "session-usage-1";
        let payload = json!({
            "sessionId": session_id,
            "messages": [
                { "type": "user", "content": "hello" },
                {
                    "type": "assistant",
                    "content": "first",
                    "tokens": {
                        "input": 10,
                        "cached": 3,
                        "output": 4,
                        "thoughts": 1,
                        "tool": 2,
                        "total": 17
                    }
                },
                {
                    "type": "assistant",
                    "content": "second",
                    "tokens": {
                        "input": 20,
                        "cached": 6,
                        "output": 8,
                        "thoughts": 2,
                        "tool": 1,
                        "total": 31
                    }
                }
            ]
        });
        let file = chats.join("session-usage.json");
        std::fs::write(
            &file,
            serde_json::to_string_pretty(&payload).expect("serialize payload"),
        )
        .expect("write payload");

        let usage = load_thread_token_usage_for_session_in_home(session_id, &root)
            .expect("expected token usage");
        assert_eq!(
            usage
                .get("last")
                .and_then(|v| v.get("inputTokens"))
                .and_then(|v| v.as_i64()),
            Some(20)
        );
        assert_eq!(
            usage
                .get("last")
                .and_then(|v| v.get("outputTokens"))
                .and_then(|v| v.as_i64()),
            Some(9)
        );
        assert_eq!(
            usage
                .get("total")
                .and_then(|v| v.get("totalTokens"))
                .and_then(|v| v.as_i64()),
            Some(48)
        );

        let _ = std::fs::remove_dir_all(PathBuf::from(&root));
    }

    #[test]
    fn local_thread_store_persists_and_updates_thread_items() {
        let root = std::env::temp_dir().join(format!("micode-thread-store-{}", Uuid::new_v4()));
        let workspace = root.join("workspace");
        std::fs::create_dir_all(&workspace).expect("create workspace dir");
        let workspace_path = workspace.to_string_lossy().to_string();
        let mut store = super::LocalThreadStore::load(&workspace_path);

        let thread_id = "thread-1";
        store.upsert(super::LocalThreadRecord {
            thread_id: thread_id.to_string(),
            session_id: "session-1".to_string(),
            title: "New Thread".to_string(),
            archived: false,
            updated_at: 1,
            message_index: 0,
        });

        store.upsert_thread_item(
            thread_id,
            json!({
                "id": "agent-thread-1-turn-1",
                "type": "agentMessage",
                "text": "hello"
            }),
        );
        store.upsert_thread_item(
            thread_id,
            json!({
                "id": "agent-thread-1-turn-1",
                "type": "agentMessage",
                "text": "hello world"
            }),
        );

        let loaded = store.load_thread_items(thread_id);
        assert_eq!(loaded.len(), 1);
        assert_eq!(
            loaded[0].get("text").and_then(Value::as_str),
            Some("hello world")
        );

        assert!(store.delete(thread_id));
        assert!(store.load_thread_items(thread_id).is_empty());

        let _ = std::fs::remove_dir_all(PathBuf::from(&root));
    }
}
