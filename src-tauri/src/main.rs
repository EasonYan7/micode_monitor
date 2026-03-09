// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn redirect_to_installed_copy_if_available() -> Result<bool, String> {
    let current_exe =
        std::env::current_exe().map_err(|err| format!("Failed to resolve current exe: {err}"))?;
    let current_exe_str = current_exe.to_string_lossy().to_string();
    let Some(installed_exe) =
        micode_monitor_lib::utils::should_redirect_to_installed_executable(&current_exe_str)
    else {
        return Ok(false);
    };

    let mut command = std::process::Command::new(&installed_exe);
    for arg in std::env::args_os().skip(1) {
        command.arg(arg);
    }
    command
        .spawn()
        .map_err(|err| format!("Failed to start installed app {:?}: {err}", installed_exe))?;
    Ok(true)
}

fn main() {
    if let Err(err) = fix_path_env::fix() {
        eprintln!("Failed to sync PATH from shell: {err}");
    }

    #[cfg(target_os = "windows")]
    match redirect_to_installed_copy_if_available() {
        Ok(true) => return,
        Ok(false) => {}
        Err(err) => eprintln!("{err}"),
    }

    micode_monitor_lib::run()
}
