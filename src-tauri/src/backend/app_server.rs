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
use tokio::time::timeout;
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

    fn set_archived(&mut self, thread_id: &str, archived: bool) {
        if let Some(entry) = self
            .records
            .iter_mut()
            .find(|entry| entry.thread_id == thread_id)
        {
            entry.archived = archived;
            entry.updated_at = now_ts();
            self.persist();
        }
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
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
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

fn extract_thread_id(value: &Value) -> Option<String> {
    let params = value.get("params")?;

    params
        .get("threadId")
        .or_else(|| params.get("thread_id"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            params
                .get("thread")
                .and_then(|thread| thread.get("id"))
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        })
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
}

impl WorkspaceSession {
    async fn begin_prompt_tracking(&self, session_id: &str) {
        self.pending_prompt_streaming
            .lock()
            .await
            .insert(session_id.to_string(), false);
    }

    async fn mark_prompt_streaming(&self, session_id: &str) {
        let mut pending = self.pending_prompt_streaming.lock().await;
        if let Some(has_streaming) = pending.get_mut(session_id) {
            *has_streaming = true;
        }
    }

    async fn finish_prompt_tracking(&self, session_id: &str) -> bool {
        self.pending_prompt_streaming
            .lock()
            .await
            .remove(session_id)
            .unwrap_or(false)
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
        params
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
            .to_string()
    }

    async fn create_session_for_cwd(&self, cwd: String) -> Result<String, String> {
        let response = self
            // ACP requires mcpServers in session/new. Start with an empty override list.
            .send_acp_request("session/new", json!({ "cwd": cwd, "mcpServers": [] }))
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
                let cwd = params
                    .get("cwd")
                    .and_then(Value::as_str)
                    .unwrap_or(self.entry.path.as_str())
                    .to_string();
                let session_id = self.create_session_for_cwd(cwd).await?;
                let thread = self.create_local_thread(session_id).await;
                self.emit_event(
                    "thread/started",
                    json!({
                        "thread": {
                            "id": thread.thread_id,
                            "name": thread.title
                        }
                    }),
                );
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
                            "updatedAt": entry.updated_at
                        })
                    })
                    .collect::<Vec<_>>();
                Ok(
                    json!({ "result": { "threads": threads, "hasMore": false, "nextCursor": null } }),
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
                Ok(json!({
                    "result": {
                        "thread": { "id": thread.thread_id, "name": thread.title },
                        "items": []
                    }
                }))
            }
            "thread/archive" => {
                let thread_id = params
                    .get("threadId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "missing threadId".to_string())?;
                self.thread_store.lock().await.set_archived(thread_id, true);
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
                let thread = self.get_thread_by_id(&thread_id).await?;
                let prompt_text = Self::parse_prompt_from_turn_start(&params);
                if prompt_text.is_empty() {
                    return Err("empty user message".to_string());
                }
                let turn_id = Uuid::new_v4().to_string();
                self.emit_event(
                    "turn/started",
                    json!({
                        "threadId": thread_id,
                        "turn": { "id": turn_id, "threadId": thread.thread_id }
                    }),
                );
                let mut tracked_session_id = thread.session_id.clone();
                self.begin_prompt_tracking(&tracked_session_id).await;
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
                        let _ = self.finish_prompt_tracking(&tracked_session_id).await;
                        result?
                    }
                    Err(_) => {
                        let had_streaming = self.finish_prompt_tracking(&tracked_session_id).await;
                        if had_streaming {
                            self.thread_store.lock().await.touch_message(&thread_id);
                            let normalized_turn = json!({
                                "id": turn_id,
                                "threadId": thread.thread_id
                            });
                            self.emit_event(
                                "turn/completed",
                                json!({
                                    "threadId": thread_id,
                                    "turn": normalized_turn
                                }),
                            );
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
                    self.thread_store
                        .lock()
                        .await
                        .set_session_id(&thread_id, new_session.clone());
                    tracked_session_id = new_session.clone();
                    self.begin_prompt_tracking(&tracked_session_id).await;
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
                            let _ = self.finish_prompt_tracking(&tracked_session_id).await;
                            result?
                        }
                        Err(_) => {
                            let had_streaming =
                                self.finish_prompt_tracking(&tracked_session_id).await;
                            if had_streaming {
                                self.thread_store.lock().await.touch_message(&thread_id);
                                let normalized_turn = json!({
                                    "id": turn_id,
                                    "threadId": thread.thread_id
                                });
                                self.emit_event(
                                    "turn/completed",
                                    json!({
                                        "threadId": thread_id,
                                        "turn": normalized_turn
                                    }),
                                );
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
                    return Err(format!("turn/start failed: {error}"));
                }
                self.thread_store.lock().await.touch_message(&thread_id);
                let mut normalized_response = response.clone();
                let normalized_turn = json!({
                    "id": turn_id,
                    "threadId": thread.thread_id
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
                self.emit_event(
                    "turn/completed",
                    json!({
                        "threadId": thread_id,
                        "turn": normalized_turn
                    }),
                );
                Ok(normalized_response)
            }
            "turn/interrupt" => {
                let thread_id = params
                    .get("threadId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "missing threadId".to_string())?;
                let thread = self.get_thread_by_id(thread_id).await?;
                let response = self
                    .send_acp_request("session/cancel", json!({ "sessionId": thread.session_id }))
                    .await?;
                if let Some(error) = acp_error_message(&response) {
                    return Err(format!("turn/interrupt failed: {error}"));
                }
                Ok(response)
            }
            "model/list" => {
                Ok(json!({ "result": { "models": [{ "id": "auto", "name": "MiCode Auto" }] } }))
            }
            "account/read" => {
                Ok(json!({ "result": { "provider": "micode-acp", "authMode": "unknown" } }))
            }
            "account/rateLimits/read" => {
                Ok(json!({ "result": { "source": "synthetic", "limits": [] } }))
            }
            "skills/list" => Ok(json!({ "result": { "skills": [] } })),
            "app/list" => {
                Ok(json!({ "result": { "apps": [], "hasMore": false, "nextCursor": null } }))
            }
            _ => self.send_acp_request(method, params).await,
        }
    }

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
    thread_id: &str,
    turn_index: u64,
    update: &Value,
    workspace_id: &str,
) -> Vec<AppServerEvent> {
    let mut events = Vec::new();
    let turn_seq = turn_index.saturating_add(1);
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
                events.push(AppServerEvent {
                    workspace_id: workspace_id.to_string(),
                    message: json!({
                        "method": "item/agentMessage/delta",
                        "params": {
                            "threadId": thread_id,
                            "itemId": format!("agent-{thread_id}-{turn_seq}"),
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
                            "threadId": thread_id,
                            "itemId": format!("reasoning-{thread_id}-{turn_seq}"),
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
                        "threadId": thread_id,
                        "turnId": format!("turn-{}", Uuid::new_v4()),
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
                        "threadId": thread_id,
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
                .unwrap_or_else(|| format!("tool-{}-{turn_seq}", Uuid::new_v4()));
            let title = update
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Tool Call");
            events.push(AppServerEvent {
                workspace_id: workspace_id.to_string(),
                message: json!({
                    "method": "item/started",
                    "params": {
                        "threadId": thread_id,
                        "item": {
                            "id": item_id,
                            "type": "mcpToolCall",
                            "title": title,
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
                .unwrap_or_else(|| format!("tool-{}-{turn_seq}", Uuid::new_v4()));
            let title = update
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("Tool Call");
            events.push(AppServerEvent {
                workspace_id: workspace_id.to_string(),
                message: json!({
                    "method": "item/completed",
                    "params": {
                        "threadId": thread_id,
                        "item": {
                            "id": item_id,
                            "type": "mcpToolCall",
                            "title": title,
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
                    let thread = {
                        let store = session_clone.thread_store.lock().await;
                        store.by_session_id(&session_id)
                    };
                    if let Some(thread) = thread {
                        if let Some(update) = value.get("params").and_then(|v| v.get("update")) {
                            let update_kind = update
                                .get("sessionUpdate")
                                .and_then(Value::as_str)
                                .unwrap_or_default();
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
                            for event in translate_acp_update(
                                &thread.thread_id,
                                thread.message_index,
                                update,
                                &workspace_id,
                            ) {
                                let _ = event_tx.send(event);
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
                    let title = params
                        .get("toolCall")
                        .and_then(|v| v.get("title"))
                        .and_then(Value::as_str)
                        .unwrap_or("Approve action")
                        .to_string();
                    let _ = event_tx.send(AppServerEvent {
                        workspace_id: workspace_id.clone(),
                        message: json!({
                            "id": request_id,
                            "method": "item/tool/requestApproval",
                            "params": {
                                "threadId": thread_id,
                                "command": [title]
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
    use super::{build_initialize_params, extract_thread_id, translate_acp_update};
    use serde_json::json;

    #[test]
    fn extract_thread_id_reads_camel_case() {
        let value = json!({ "params": { "threadId": "thread-123" } });
        assert_eq!(extract_thread_id(&value), Some("thread-123".to_string()));
    }

    #[test]
    fn extract_thread_id_reads_snake_case() {
        let value = json!({ "params": { "thread_id": "thread-456" } });
        assert_eq!(extract_thread_id(&value), Some("thread-456".to_string()));
    }

    #[test]
    fn extract_thread_id_returns_none_when_missing() {
        let value = json!({ "params": {} });
        assert_eq!(extract_thread_id(&value), None);
    }

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
        let events = translate_acp_update("thread-1", 0, &update, "ws-1");
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
        let events = translate_acp_update("thread-2", 1, &update, "ws-2");
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
        let events = translate_acp_update("thread-3", 2, &update, "ws-3");
        assert_eq!(events.len(), 1);
        let method = events[0]
            .message
            .get("method")
            .and_then(|value| value.as_str());
        assert_eq!(method, Some("micode/availableCommands/updated"));
    }
}
