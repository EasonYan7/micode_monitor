use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

use crate::dictation::DictationState;
use crate::shared::micode_core::MiCodeLoginCancelState;
use crate::storage::{read_settings, read_workspaces};
use crate::types::{AppSettings, WorkspaceEntry};

pub(crate) struct AppState {
    pub(crate) workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    pub(crate) sessions: Mutex<HashMap<String, Arc<crate::micode::WorkspaceSession>>>,
    pub(crate) terminal_sessions: Mutex<HashMap<String, Arc<crate::terminal::TerminalSession>>>,
    pub(crate) remote_backend: Mutex<Option<crate::remote_backend::RemoteBackend>>,
    pub(crate) storage_path: PathBuf,
    pub(crate) settings_path: PathBuf,
    pub(crate) logs_dir: PathBuf,
    pub(crate) log_session_file: String,
    pub(crate) app_session_id: String,
    pub(crate) actor_id: String,
    pub(crate) actor_client_user: String,
    pub(crate) actor_lark_user_token: String,
    pub(crate) app_settings: Mutex<AppSettings>,
    pub(crate) dictation: Mutex<DictationState>,
    pub(crate) micode_login_cancels: Mutex<HashMap<String, MiCodeLoginCancelState>>,
}

impl AppState {
    pub(crate) fn load(app: &AppHandle) -> Self {
        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| ".".into()));
        let storage_path = data_dir.join("workspaces.json");
        let settings_path = data_dir.join("settings.json");
        let logs_dir = crate::debug_logs::resolve_logs_dir(&data_dir);
        let log_session_file = crate::debug_logs::build_log_session_file_name();
        let app_session_id = crate::debug_logs::build_app_session_id();
        let (actor_client_user, actor_lark_user_token) =
            crate::debug_logs::resolve_actor_identity();
        let actor_id = actor_client_user.clone();
        let workspaces = read_workspaces(&storage_path).unwrap_or_default();
        let app_settings = read_settings(&settings_path).unwrap_or_default();
        Self {
            workspaces: Mutex::new(workspaces),
            sessions: Mutex::new(HashMap::new()),
            terminal_sessions: Mutex::new(HashMap::new()),
            remote_backend: Mutex::new(None),
            storage_path,
            settings_path,
            logs_dir,
            log_session_file,
            app_session_id,
            actor_id,
            actor_client_user,
            actor_lark_user_token,
            app_settings: Mutex::new(app_settings),
            dictation: Mutex::new(DictationState::default()),
            micode_login_cancels: Mutex::new(HashMap::new()),
        }
    }
}
