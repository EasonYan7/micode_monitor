use serde::Serialize;
use std::env;
use std::ffi::OsString;
use std::path::{Path, PathBuf};

#[allow(dead_code)]
pub(crate) fn normalize_git_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn find_in_path(binary: &str) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

pub(crate) fn resolve_git_binary() -> Result<PathBuf, String> {
    if let Some(path) = find_in_path("git") {
        return Ok(path);
    }
    if cfg!(windows) {
        if let Some(path) = find_in_path("git.exe") {
            return Ok(path);
        }
    }

    let candidates: &[&str] = if cfg!(windows) {
        &[
            "C:\\Program Files\\Git\\bin\\git.exe",
            "C:\\Program Files (x86)\\Git\\bin\\git.exe",
        ]
    } else {
        &[
            "/opt/homebrew/bin/git",
            "/usr/local/bin/git",
            "/usr/bin/git",
            "/opt/local/bin/git",
            "/run/current-system/sw/bin/git",
        ]
    };

    for candidate in candidates {
        let path = PathBuf::from(candidate);
        if path.exists() {
            return Ok(path);
        }
    }

    Err(format!(
        "Git not found. Install Git or ensure it is on PATH. Tried: {}",
        candidates.join(", ")
    ))
}

pub(crate) fn git_env_path() -> String {
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect())
        .unwrap_or_default();

    let defaults: &[&str] = if cfg!(windows) {
        &["C:\\Windows\\System32"]
    } else {
        &[
            "/usr/bin",
            "/bin",
            "/usr/local/bin",
            "/opt/homebrew/bin",
            "/opt/local/bin",
            "/run/current-system/sw/bin",
        ]
    };

    for candidate in defaults {
        let path = PathBuf::from(candidate);
        if !paths.contains(&path) {
            paths.push(path);
        }
    }

    let joined = env::join_paths(paths).unwrap_or_else(|_| OsString::new());
    joined.to_string_lossy().to_string()
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdaterContext {
    pub(crate) executable_path: String,
    pub(crate) is_managed_install: bool,
    pub(crate) launch_mode: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LaunchMode {
    Installed,
    Portable,
    Development,
    Unknown,
}

impl LaunchMode {
    #[allow(dead_code)]
    fn as_str(self) -> &'static str {
        match self {
            Self::Installed => "installed",
            Self::Portable => "portable",
            Self::Development => "development",
            Self::Unknown => "unknown",
        }
    }
}

#[allow(dead_code)]
fn normalize_windows_like_path(path: &str) -> String {
    path.replace('/', "\\")
        .trim_start_matches("\\\\?\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

#[allow(dead_code)]
fn path_is_within_root(path: &str, root: &str) -> bool {
    let normalized_path = normalize_windows_like_path(path);
    let normalized_root = normalize_windows_like_path(root);
    normalized_path == normalized_root
        || normalized_path.starts_with(&(normalized_root + "\\"))
}

#[allow(dead_code)]
fn executable_file_name(path: &str) -> Option<String> {
    Path::new(path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
}

#[allow(dead_code)]
fn managed_install_roots(
    local_app_data: Option<&str>,
    program_files: Option<&str>,
    program_files_x86: Option<&str>,
) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(root) = local_app_data {
        roots.push(PathBuf::from(root).join("Programs"));
        roots.push(PathBuf::from(root));
    }
    if let Some(root) = program_files {
        roots.push(PathBuf::from(root));
    }
    if let Some(root) = program_files_x86 {
        roots.push(PathBuf::from(root));
    }
    roots
}

#[allow(dead_code)]
fn looks_like_same_executable(path: &Path, file_name: &str, current_path: &str) -> bool {
    path.is_file()
        && path
            .file_name()
            .map(|value| value.to_string_lossy().eq_ignore_ascii_case(file_name))
            .unwrap_or(false)
        && !normalize_windows_like_path(&path.to_string_lossy())
            .eq(&normalize_windows_like_path(current_path))
}

#[allow(dead_code)]
fn has_windows_install_marker(executable_path: &Path) -> bool {
    let Some(parent) = executable_path.parent() else {
        return false;
    };
    [
        "uninstall.exe",
        "Uninstall.exe",
        "unins000.exe",
        "uninstall.dat",
    ]
    .iter()
    .any(|name| parent.join(name).exists())
}

#[allow(dead_code)]
fn find_installed_executable_in_root(
    root: &Path,
    file_name: &str,
    current_path: &str,
    depth_remaining: usize,
) -> Option<PathBuf> {
    if depth_remaining == 0 || !root.is_dir() {
        return None;
    }

    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if looks_like_same_executable(&path, file_name, current_path) {
            return Some(path);
        }
    }

    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) =
                find_installed_executable_in_root(&path, file_name, current_path, depth_remaining - 1)
            {
                return Some(found);
            }
        }
    }

    None
}

#[allow(dead_code)]
fn find_installed_executable_path_with_env(
    current_path: &str,
    local_app_data: Option<&str>,
    program_files: Option<&str>,
    program_files_x86: Option<&str>,
) -> Option<PathBuf> {
    let file_name = executable_file_name(current_path)?;
    let roots = managed_install_roots(local_app_data, program_files, program_files_x86);
    roots
        .iter()
        .find_map(|root| find_installed_executable_in_root(root, &file_name, current_path, 3))
}

#[allow(dead_code)]
fn detect_windows_launch_mode(
    executable_path: &str,
    local_app_data: Option<&str>,
    program_files: Option<&str>,
    program_files_x86: Option<&str>,
) -> LaunchMode {
    let normalized = normalize_windows_like_path(executable_path);
    if normalized.is_empty() {
        return LaunchMode::Unknown;
    }

    if normalized.contains("\\src-tauri\\target\\")
        || normalized.contains("\\target\\debug\\")
        || normalized.contains("\\target\\release\\")
    {
        return LaunchMode::Development;
    }

    let mut managed_roots = Vec::new();
    if let Some(root) = local_app_data {
        managed_roots.push(format!(r"{}\Programs", root.trim_end_matches(['\\', '/'])));
    }
    if let Some(root) = program_files {
        managed_roots.push(root.to_string());
    }
    if let Some(root) = program_files_x86 {
        managed_roots.push(root.to_string());
    }

    if managed_roots
        .iter()
        .any(|root| path_is_within_root(&normalized, root))
    {
        return LaunchMode::Installed;
    }

    if let Some(root) = local_app_data {
        if path_is_within_root(&normalized, root)
            && has_windows_install_marker(Path::new(executable_path))
        {
            return LaunchMode::Installed;
        }
    }

    LaunchMode::Portable
}

#[allow(dead_code)]
pub(crate) fn find_installed_executable_path(current_path: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return find_installed_executable_path_with_env(
            current_path,
            env::var("LOCALAPPDATA").ok().as_deref(),
            env::var("PROGRAMFILES").ok().as_deref(),
            env::var("PROGRAMFILES(X86)").ok().as_deref(),
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = current_path;
        None
    }
}

#[allow(dead_code)]
pub fn should_redirect_to_installed_executable(current_path: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let launch_mode = detect_windows_launch_mode(
            current_path,
            env::var("LOCALAPPDATA").ok().as_deref(),
            env::var("PROGRAMFILES").ok().as_deref(),
            env::var("PROGRAMFILES(X86)").ok().as_deref(),
        );

        if matches!(launch_mode, LaunchMode::Portable | LaunchMode::Development) {
            return find_installed_executable_path(current_path);
        }

        return None;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = current_path;
        None
    }
}

#[tauri::command]
#[allow(dead_code)]
pub(crate) fn get_updater_context() -> Result<UpdaterContext, String> {
    let executable_path = env::current_exe()
        .map_err(|err| format!("Failed to resolve current executable: {err}"))?;
    let executable_path = executable_path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    let launch_mode = detect_windows_launch_mode(
        &executable_path,
        env::var("LOCALAPPDATA").ok().as_deref(),
        env::var("PROGRAMFILES").ok().as_deref(),
        env::var("PROGRAMFILES(X86)").ok().as_deref(),
    );

    #[cfg(not(target_os = "windows"))]
    let launch_mode = LaunchMode::Installed;

    Ok(UpdaterContext {
        executable_path,
        is_managed_install: matches!(launch_mode, LaunchMode::Installed),
        launch_mode: launch_mode.as_str().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{
        detect_windows_launch_mode, find_installed_executable_path_with_env, normalize_git_path,
        LaunchMode,
    };
    use std::env;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn normalize_git_path_replaces_backslashes() {
        assert_eq!(normalize_git_path("foo\\bar\\baz"), "foo/bar/baz");
    }

    #[test]
    fn detect_windows_launch_mode_marks_local_programs_as_installed() {
        let mode = detect_windows_launch_mode(
            r"C:\Users\mi\AppData\Local\Programs\Rich\rich.exe",
            Some(r"C:\Users\mi\AppData\Local"),
            Some(r"C:\Program Files"),
            Some(r"C:\Program Files (x86)"),
        );

        assert_eq!(mode, LaunchMode::Installed);
    }

    #[test]
    fn detect_windows_launch_mode_marks_repo_target_as_development() {
        let mode = detect_windows_launch_mode(
            r"C:\Users\mi\Desktop\micode_monitor\src-tauri\target\release\micode-monitor.exe",
            Some(r"C:\Users\mi\AppData\Local"),
            Some(r"C:\Program Files"),
            Some(r"C:\Program Files (x86)"),
        );

        assert_eq!(mode, LaunchMode::Development);
    }

    #[test]
    fn detect_windows_launch_mode_marks_downloaded_exe_as_portable() {
        let mode = detect_windows_launch_mode(
            r"C:\Users\mi\Downloads\micode-monitor.exe",
            Some(r"C:\Users\mi\AppData\Local"),
            Some(r"C:\Program Files"),
            Some(r"C:\Program Files (x86)"),
        );

        assert_eq!(mode, LaunchMode::Portable);
    }

    #[test]
    fn detect_windows_launch_mode_marks_local_appdata_install_root_as_installed() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("duration")
            .as_nanos();
        let root = env::temp_dir().join(format!("micode-updater-install-{unique}"));
        let local_app_data = root.join("Local");
        let installed_dir = local_app_data.join("财多多");
        fs::create_dir_all(&installed_dir).expect("create installed dir");
        let installed_exe = installed_dir.join("micode-monitor.exe");
        fs::write(&installed_exe, b"stub").expect("write installed exe");
        fs::write(installed_dir.join("uninstall.exe"), b"stub").expect("write uninstall exe");

        let mode = detect_windows_launch_mode(
            installed_exe.to_string_lossy().as_ref(),
            Some(local_app_data.to_string_lossy().as_ref()),
            Some(r"C:\Program Files"),
            Some(r"C:\Program Files (x86)"),
        );

        assert_eq!(mode, LaunchMode::Installed);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn find_installed_executable_prefers_managed_roots() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("duration")
            .as_nanos();
        let root = env::temp_dir().join(format!("micode-updater-test-{unique}"));
        let local_app_data = root.join("Local");
        let installed_dir = local_app_data.join("Programs").join("Rich");
        fs::create_dir_all(&installed_dir).expect("create installed dir");
        let installed_exe = installed_dir.join("micode-monitor.exe");
        fs::write(&installed_exe, b"stub").expect("write installed exe");

        let found = find_installed_executable_path_with_env(
            r"C:\Users\mi\Downloads\micode-monitor.exe",
            Some(local_app_data.to_string_lossy().as_ref()),
            None,
            None,
        );

        assert_eq!(found, Some(installed_exe));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn find_installed_executable_finds_local_appdata_install_root() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("duration")
            .as_nanos();
        let root = env::temp_dir().join(format!("micode-updater-appdata-{unique}"));
        let local_app_data = root.join("Local");
        let installed_dir = local_app_data.join("财多多");
        fs::create_dir_all(&installed_dir).expect("create installed dir");
        let installed_exe = installed_dir.join("micode-monitor.exe");
        fs::write(&installed_exe, b"stub").expect("write installed exe");

        let found = find_installed_executable_path_with_env(
            r"C:\Users\mi\Downloads\micode-monitor.exe",
            Some(local_app_data.to_string_lossy().as_ref()),
            None,
            None,
        );

        assert_eq!(found, Some(installed_exe));

        let _ = fs::remove_dir_all(&root);
    }
}
