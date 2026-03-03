use tauri::{Manager, State, Window};

use crate::shared::settings_core::{
    get_app_settings_core, get_micode_config_path_core, update_app_settings_core,
};
use crate::menu;
use crate::state::AppState;
use crate::types::AppSettings;
use crate::window;

#[tauri::command]
pub(crate) async fn get_app_settings(
    state: State<'_, AppState>,
    window: Window,
) -> Result<AppSettings, String> {
    let settings = get_app_settings_core(&state.app_settings).await;
    let _ = window::apply_window_appearance(&window, settings.theme.as_str());
    Ok(settings)
}

#[tauri::command]
pub(crate) async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
    window: Window,
) -> Result<AppSettings, String> {
    let updated =
        update_app_settings_core(settings, &state.app_settings, &state.settings_path).await?;
    let _ = window::apply_window_appearance(&window, updated.theme.as_str());
    menu::set_menu_language_zh(updated.language.trim().eq_ignore_ascii_case("zh"));
    let _ = menu::rebuild_menu(&window.app_handle());
    Ok(updated)
}

#[tauri::command]
pub(crate) async fn get_micode_config_path() -> Result<String, String> {
    get_micode_config_path_core()
}
