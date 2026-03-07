use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

static MENU_LANGUAGE_ZH: AtomicBool = AtomicBool::new(true);

pub struct MenuItemRegistry<R: Runtime> {
    items: Mutex<HashMap<String, MenuItem<R>>>,
}

impl<R: Runtime> Default for MenuItemRegistry<R> {
    fn default() -> Self {
        Self {
            items: Mutex::new(HashMap::new()),
        }
    }
}

impl<R: Runtime> MenuItemRegistry<R> {
    fn register(&self, id: &str, item: &MenuItem<R>) {
        if let Ok(mut items) = self.items.lock() {
            items.insert(id.to_string(), item.clone());
        }
    }

    fn set_accelerator(&self, id: &str, accelerator: Option<&str>) -> tauri::Result<bool> {
        let item = match self.items.lock() {
            Ok(items) => items.get(id).cloned(),
            Err(_) => return Ok(false),
        };
        if let Some(item) = item {
            item.set_accelerator(accelerator)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct MenuAcceleratorUpdate {
    pub id: String,
    pub accelerator: Option<String>,
}

#[tauri::command]
pub fn menu_set_accelerators<R: Runtime>(
    app: tauri::AppHandle<R>,
    updates: Vec<MenuAcceleratorUpdate>,
) -> Result<(), String> {
    let registry = app.state::<MenuItemRegistry<R>>();
    for update in updates {
        registry
            .set_accelerator(&update.id, update.accelerator.as_deref())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn build_menu<R: Runtime>(handle: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let zh = MENU_LANGUAGE_ZH.load(Ordering::Relaxed);
    let text = MenuText::new(zh);
    let registry = handle.state::<MenuItemRegistry<R>>();
    let app_name = handle.package_info().name.clone();

    let about_item =
        MenuItemBuilder::with_id("about", format!("{} {app_name}", text.about_prefix))
            .build(handle)?;
    let settings_item = MenuItemBuilder::with_id("file_open_settings", text.settings)
        .accelerator("CmdOrCtrl+,")
        .build(handle)?;

    #[cfg(target_os = "macos")]
    let app_menu = Submenu::with_items(
        handle,
        app_name.clone(),
        true,
        &[
            &about_item,
            &settings_item,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::services(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::hide(handle, None)?,
            &PredefinedMenuItem::hide_others(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;

    #[cfg(not(target_os = "macos"))]
    let app_menu = Submenu::with_items(handle, app_name.clone(), true, &[&settings_item])?;

    let new_agent_item =
        MenuItemBuilder::with_id("file_new_agent", text.new_conversation).build(handle)?;
    let new_worktree_agent_item =
        MenuItemBuilder::with_id("file_new_worktree_agent", text.new_worktree_agent)
            .build(handle)?;
    let add_workspace_item =
        MenuItemBuilder::with_id("file_add_workspace", text.add_workspace).build(handle)?;

    registry.register("file_new_agent", &new_agent_item);
    registry.register("file_new_worktree_agent", &new_worktree_agent_item);

    #[cfg(target_os = "linux")]
    let file_menu = {
        let close_window_item =
            MenuItemBuilder::with_id("file_close_window", text.close_window).build(handle)?;
        let quit_item = MenuItemBuilder::with_id("file_quit", text.quit).build(handle)?;
        Submenu::with_items(
            handle,
            text.file,
            true,
            &[
                &new_agent_item,
                &new_worktree_agent_item,
                &PredefinedMenuItem::separator(handle)?,
                &add_workspace_item,
                &PredefinedMenuItem::separator(handle)?,
                &close_window_item,
                &quit_item,
            ],
        )?
    };

    #[cfg(not(target_os = "linux"))]
    let file_menu = Submenu::with_items(
        handle,
        text.file,
        true,
        &[
            &new_agent_item,
            &new_worktree_agent_item,
            &PredefinedMenuItem::separator(handle)?,
            &add_workspace_item,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::close_window(handle, None)?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        handle,
        text.edit,
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
        ],
    )?;

    let cycle_model_item =
        MenuItemBuilder::with_id("composer_cycle_model", text.cycle_model)
            .accelerator("CmdOrCtrl+Shift+M")
            .build(handle)?;
    let cycle_access_item =
        MenuItemBuilder::with_id("composer_cycle_access", text.cycle_access_mode)
            .accelerator("CmdOrCtrl+Shift+A")
            .build(handle)?;
    let cycle_reasoning_item =
        MenuItemBuilder::with_id("composer_cycle_reasoning", text.cycle_reasoning_mode)
            .accelerator("CmdOrCtrl+Shift+R")
            .build(handle)?;
    let cycle_collaboration_item = MenuItemBuilder::with_id(
        "composer_cycle_collaboration",
        text.cycle_collaboration_mode,
    )
    .accelerator("Shift+Tab")
    .build(handle)?;

    registry.register("composer_cycle_model", &cycle_model_item);
    registry.register("composer_cycle_access", &cycle_access_item);
    registry.register("composer_cycle_reasoning", &cycle_reasoning_item);
    registry.register("composer_cycle_collaboration", &cycle_collaboration_item);

    let composer_menu = Submenu::with_items(
        handle,
        text.composer,
        true,
        &[
            &cycle_model_item,
            &cycle_access_item,
            &cycle_reasoning_item,
            &cycle_collaboration_item,
        ],
    )?;

    let toggle_projects_sidebar_item = MenuItemBuilder::with_id(
        "view_toggle_projects_sidebar",
        text.toggle_projects_sidebar,
    )
    .build(handle)?;
    let toggle_git_sidebar_item =
        MenuItemBuilder::with_id("view_toggle_git_sidebar", text.toggle_git_sidebar)
            .build(handle)?;
    let toggle_debug_panel_item =
        MenuItemBuilder::with_id("view_toggle_debug_panel", text.toggle_debug_panel)
            .accelerator("CmdOrCtrl+Shift+D")
            .build(handle)?;
    let toggle_terminal_item =
        MenuItemBuilder::with_id("view_toggle_terminal", text.toggle_terminal)
            .accelerator("CmdOrCtrl+Shift+T")
            .build(handle)?;
    let next_agent_item =
        MenuItemBuilder::with_id("view_next_agent", text.next_agent).build(handle)?;
    let prev_agent_item =
        MenuItemBuilder::with_id("view_prev_agent", text.previous_agent).build(handle)?;
    let next_workspace_item =
        MenuItemBuilder::with_id("view_next_workspace", text.next_workspace).build(handle)?;
    let prev_workspace_item =
        MenuItemBuilder::with_id("view_prev_workspace", text.previous_workspace)
            .build(handle)?;

    registry.register("view_toggle_projects_sidebar", &toggle_projects_sidebar_item);
    registry.register("view_toggle_git_sidebar", &toggle_git_sidebar_item);
    registry.register("view_toggle_debug_panel", &toggle_debug_panel_item);
    registry.register("view_toggle_terminal", &toggle_terminal_item);
    registry.register("view_next_agent", &next_agent_item);
    registry.register("view_prev_agent", &prev_agent_item);
    registry.register("view_next_workspace", &next_workspace_item);
    registry.register("view_prev_workspace", &prev_workspace_item);

    #[cfg(target_os = "linux")]
    let view_menu = {
        let fullscreen_item =
            MenuItemBuilder::with_id("view_fullscreen", text.toggle_full_screen)
                .build(handle)?;
        Submenu::with_items(
            handle,
            text.view,
            true,
            &[
                &toggle_projects_sidebar_item,
                &toggle_git_sidebar_item,
                &PredefinedMenuItem::separator(handle)?,
                &toggle_debug_panel_item,
                &toggle_terminal_item,
                &PredefinedMenuItem::separator(handle)?,
                &next_agent_item,
                &prev_agent_item,
                &next_workspace_item,
                &prev_workspace_item,
                &PredefinedMenuItem::separator(handle)?,
                &fullscreen_item,
            ],
        )?
    };

    #[cfg(not(target_os = "linux"))]
    let view_menu = Submenu::with_items(
        handle,
        text.view,
        true,
        &[
            &toggle_projects_sidebar_item,
            &toggle_git_sidebar_item,
            &PredefinedMenuItem::separator(handle)?,
            &toggle_debug_panel_item,
            &toggle_terminal_item,
            &PredefinedMenuItem::separator(handle)?,
            &next_agent_item,
            &prev_agent_item,
            &next_workspace_item,
            &prev_workspace_item,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::fullscreen(handle, None)?,
        ],
    )?;

    #[cfg(target_os = "linux")]
    let window_menu = {
        let minimize_item =
            MenuItemBuilder::with_id("window_minimize", text.minimize).build(handle)?;
        let maximize_item =
            MenuItemBuilder::with_id("window_maximize", text.maximize).build(handle)?;
        let close_item =
            MenuItemBuilder::with_id("window_close", text.close_window).build(handle)?;
        Submenu::with_items(
            handle,
            text.window,
            true,
            &[
                &minimize_item,
                &maximize_item,
                &PredefinedMenuItem::separator(handle)?,
                &close_item,
            ],
        )?
    };

    #[cfg(not(target_os = "linux"))]
    let window_menu = Submenu::with_items(
        handle,
        text.window,
        true,
        &[
            &PredefinedMenuItem::minimize(handle, None)?,
            &PredefinedMenuItem::maximize(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::close_window(handle, None)?,
        ],
    )?;

    #[cfg(target_os = "linux")]
    let help_menu = {
        let help_about_item = MenuItemBuilder::with_id(
            "help_about",
            format!("{} {app_name}", text.about_prefix),
        )
        .build(handle)?;
        let help_check_updates_item =
            MenuItemBuilder::with_id("help_check_updates", text.check_for_updates).build(handle)?;
        Submenu::with_items(
            handle,
            text.help,
            true,
            &[
                &help_about_item,
                &PredefinedMenuItem::separator(handle)?,
                &help_check_updates_item,
            ],
        )?
    };

    #[cfg(target_os = "macos")]
    let help_menu = {
        let help_check_updates_item =
            MenuItemBuilder::with_id("help_check_updates", text.check_for_updates).build(handle)?;
        Submenu::with_items(handle, text.help, true, &[&help_check_updates_item])?
    };

    #[cfg(all(not(target_os = "linux"), not(target_os = "macos")))]
    let help_menu = {
        let help_check_updates_item =
            MenuItemBuilder::with_id("help_check_updates", text.check_for_updates).build(handle)?;
        Submenu::with_items(
            handle,
            text.help,
            true,
            &[
                &about_item,
                &PredefinedMenuItem::separator(handle)?,
                &help_check_updates_item,
            ],
        )?
    };

    Menu::with_items(
        handle,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &composer_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

pub(crate) fn rebuild_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    app.set_menu(menu)?;
    Ok(())
}

pub(crate) fn set_menu_language_zh(zh: bool) {
    MENU_LANGUAGE_ZH.store(zh, Ordering::Relaxed);
}

pub(crate) fn handle_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "about" | "help_about" => {
            if let Some(window) = app.get_webview_window("about") {
                let _ = window.close();
            }
            let about_width = 900.0;
            let about_height = 720.0;
            let window =
                WebviewWindowBuilder::new(app, "about", WebviewUrl::App("index.html".into()))
                    .title("关于财多多")
                    .resizable(true)
                    .maximizable(true)
                    .minimizable(true)
                    .inner_size(about_width, about_height)
                    .min_inner_size(760.0, 620.0)
                    .center()
                    .build();
            if let Ok(window) = window {
                let _ = window.set_fullscreen(false);
                let _ = window.unmaximize();
                let _ = window.set_resizable(true);
                let _ = window.set_maximizable(true);
                let _ = window.set_minimizable(true);
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                    about_width,
                    about_height,
                )));
                let _ = window.center();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "help_check_updates" => emit_menu_event(app, "updater-check"),
        "file_new_agent" => emit_menu_event(app, "menu-new-agent"),
        "file_new_worktree_agent" => emit_menu_event(app, "menu-new-worktree-agent"),
        "file_add_workspace" => emit_menu_event(app, "menu-add-workspace"),
        "file_open_settings" => emit_menu_event(app, "menu-open-settings"),
        "file_close_window" | "window_close" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.close();
            }
        }
        "file_quit" => {
            app.exit(0);
        }
        "view_fullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                let is_fullscreen = window.is_fullscreen().unwrap_or(false);
                let _ = window.set_fullscreen(!is_fullscreen);
            }
        }
        "view_toggle_projects_sidebar" => emit_menu_event(app, "menu-toggle-projects-sidebar"),
        "view_toggle_git_sidebar" => emit_menu_event(app, "menu-toggle-git-sidebar"),
        "view_toggle_debug_panel" => emit_menu_event(app, "menu-toggle-debug-panel"),
        "view_toggle_terminal" => emit_menu_event(app, "menu-toggle-terminal"),
        "view_next_agent" => emit_menu_event(app, "menu-next-agent"),
        "view_prev_agent" => emit_menu_event(app, "menu-prev-agent"),
        "view_next_workspace" => emit_menu_event(app, "menu-next-workspace"),
        "view_prev_workspace" => emit_menu_event(app, "menu-prev-workspace"),
        "composer_cycle_model" => emit_menu_event(app, "menu-composer-cycle-model"),
        "composer_cycle_access" => emit_menu_event(app, "menu-composer-cycle-access"),
        "composer_cycle_reasoning" => emit_menu_event(app, "menu-composer-cycle-reasoning"),
        "composer_cycle_collaboration" => {
            emit_menu_event(app, "menu-composer-cycle-collaboration")
        }
        "window_minimize" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.minimize();
            }
        }
        "window_maximize" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
            }
        }
        _ => {}
    }
}

#[allow(dead_code)]
struct MenuText {
    about_prefix: &'static str,
    settings: &'static str,
    new_conversation: &'static str,
    new_worktree_agent: &'static str,
    add_workspace: &'static str,
    close_window: &'static str,
    quit: &'static str,
    file: &'static str,
    edit: &'static str,
    composer: &'static str,
    cycle_model: &'static str,
    cycle_access_mode: &'static str,
    cycle_reasoning_mode: &'static str,
    cycle_collaboration_mode: &'static str,
    view: &'static str,
    toggle_projects_sidebar: &'static str,
    toggle_git_sidebar: &'static str,
    toggle_debug_panel: &'static str,
    toggle_terminal: &'static str,
    next_agent: &'static str,
    previous_agent: &'static str,
    next_workspace: &'static str,
    previous_workspace: &'static str,
    toggle_full_screen: &'static str,
    window: &'static str,
    minimize: &'static str,
    maximize: &'static str,
    help: &'static str,
    check_for_updates: &'static str,
}

impl MenuText {
    fn new(zh: bool) -> Self {
        if zh {
            Self {
                about_prefix: "关于",
                settings: "设置...",
                new_conversation: "新建会话",
                new_worktree_agent: "新建 Worktree Agent（高级）",
                add_workspace: "添加工作区...",
                close_window: "关闭窗口",
                quit: "退出",
                file: "文件",
                edit: "编辑",
                composer: "Composer",
                cycle_model: "切换模型",
                cycle_access_mode: "切换访问模式",
                cycle_reasoning_mode: "切换推理模式",
                cycle_collaboration_mode: "切换协作模式",
                view: "视图",
                toggle_projects_sidebar: "切换项目侧栏",
                toggle_git_sidebar: "切换 Git 侧栏",
                toggle_debug_panel: "切换调试面板",
                toggle_terminal: "切换终端",
                next_agent: "下一个 Agent",
                previous_agent: "上一个 Agent",
                next_workspace: "下一个工作区",
                previous_workspace: "上一个工作区",
                toggle_full_screen: "切换全屏",
                window: "窗口",
                minimize: "最小化",
                maximize: "最大化",
                help: "帮助",
                check_for_updates: "检查更新",
            }
        } else {
            Self {
                about_prefix: "About",
                settings: "Settings...",
                new_conversation: "New Conversation",
                new_worktree_agent: "New Worktree Agent (Advanced)",
                add_workspace: "Add Workspace...",
                close_window: "Close Window",
                quit: "Quit",
                file: "File",
                edit: "Edit",
                composer: "Composer",
                cycle_model: "Cycle Model",
                cycle_access_mode: "Cycle Access Mode",
                cycle_reasoning_mode: "Cycle Reasoning Mode",
                cycle_collaboration_mode: "Cycle Collaboration Mode",
                view: "View",
                toggle_projects_sidebar: "Toggle Projects Sidebar",
                toggle_git_sidebar: "Toggle Git Sidebar",
                toggle_debug_panel: "Toggle Debug Panel",
                toggle_terminal: "Toggle Terminal",
                next_agent: "Next Agent",
                previous_agent: "Previous Agent",
                next_workspace: "Next Workspace",
                previous_workspace: "Previous Workspace",
                toggle_full_screen: "Toggle Full Screen",
                window: "Window",
                minimize: "Minimize",
                maximize: "Maximize",
                help: "Help",
                check_for_updates: "Check for Updates",
            }
        }
    }
}

fn emit_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, event: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit(event, ());
    } else {
        let _ = app.emit(event, ());
    }
}



