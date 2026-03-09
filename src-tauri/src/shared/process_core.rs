use std::ffi::OsStr;

use tokio::process::Command;

/// On Windows, spawning a console app from a GUI subsystem app will open a new
/// console window unless we explicitly disable it.
fn hide_console_on_windows(_command: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        _command.creation_flags(CREATE_NO_WINDOW);
    }
}

#[allow(dead_code)]
pub(crate) fn std_command(program: impl AsRef<OsStr>) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    hide_console_on_windows(&mut command);
    command
}

pub(crate) fn tokio_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    hide_console_on_windows(command.as_std_mut());
    command
}
