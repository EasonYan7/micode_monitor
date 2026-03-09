use std::fs;
use std::path::PathBuf;

const DEFAULT_AGENTS_MD: &str = include_str!("../../AGENTS.md");
const DEFAULT_SOUL_MD: &str = include_str!("../../soul.md");
const DEFAULT_DEMO_MD: &str = include_str!("../../demo.md");

pub(crate) fn ensure_default_config_files() -> Result<(), String> {
    let home_dir = resolve_home_dir()
        .ok_or_else(|| "Unable to resolve home directory".to_string())?;
    
    let micode_home = home_dir.join(".micode");
    let codex_home = home_dir.join(".codex");
    
    if !micode_home.exists() {
        fs::create_dir_all(&micode_home)
            .map_err(|err| format!("Failed to create .micode directory: {err}"))?;
    }
    
    if !codex_home.exists() {
        fs::create_dir_all(&codex_home)
            .map_err(|err| format!("Failed to create .codex directory: {err}"))?;
    }
    
    write_if_missing(&micode_home.join("AGENTS.md"), DEFAULT_AGENTS_MD)?;
    write_if_missing(&micode_home.join("soul.md"), DEFAULT_SOUL_MD)?;
    write_if_missing(&micode_home.join("demo.md"), DEFAULT_DEMO_MD)?;
    
    write_if_missing(&codex_home.join("AGENTS.md"), DEFAULT_AGENTS_MD)?;
    write_if_missing(&codex_home.join("soul.md"), DEFAULT_SOUL_MD)?;
    write_if_missing(&codex_home.join("demo.md"), DEFAULT_DEMO_MD)?;
    
    Ok(())
}

fn write_if_missing(path: &PathBuf, content: &str) -> Result<(), String> {
    if !path.exists() {
        fs::write(path, content)
            .map_err(|err| format!("Failed to write {}: {err}", path.display()))?;
    }
    Ok(())
}

fn resolve_home_dir() -> Option<PathBuf> {
    if let Ok(value) = std::env::var("HOME") {
        if !value.trim().is_empty() {
            return Some(PathBuf::from(value));
        }
    }
    if let Ok(value) = std::env::var("USERPROFILE") {
        if !value.trim().is_empty() {
            return Some(PathBuf::from(value));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn creates_config_files_when_missing() {
        let temp_dir = env::temp_dir().join(format!("test-config-{}", uuid::Uuid::new_v4()));
        let micode_home = temp_dir.join(".micode");
        let codex_home = temp_dir.join(".codex");
        
        let prev_home = env::var("HOME").ok();
        env::set_var("HOME", temp_dir.to_string_lossy().to_string());
        
        let result = ensure_default_config_files();
        
        match prev_home {
            Some(value) => env::set_var("HOME", value),
            None => env::remove_var("HOME"),
        }
        
        assert!(result.is_ok());
        assert!(micode_home.join("AGENTS.md").exists());
        assert!(micode_home.join("soul.md").exists());
        assert!(micode_home.join("demo.md").exists());
        assert!(codex_home.join("AGENTS.md").exists());
        assert!(codex_home.join("soul.md").exists());
        assert!(codex_home.join("demo.md").exists());
        
        let _ = fs::remove_dir_all(temp_dir);
    }
    
    #[test]
    fn does_not_overwrite_existing_files() {
        let temp_dir = env::temp_dir().join(format!("test-config-{}", uuid::Uuid::new_v4()));
        let micode_home = temp_dir.join(".micode");
        fs::create_dir_all(&micode_home).expect("create dir");
        
        let agents_path = micode_home.join("AGENTS.md");
        fs::write(&agents_path, "custom content").expect("write custom");
        
        let prev_home = env::var("HOME").ok();
        env::set_var("HOME", temp_dir.to_string_lossy().to_string());
        
        let result = ensure_default_config_files();
        
        match prev_home {
            Some(value) => env::set_var("HOME", value),
            None => env::remove_var("HOME"),
        }
        
        assert!(result.is_ok());
        let content = fs::read_to_string(&agents_path).expect("read");
        assert_eq!(content, "custom content");
        
        let _ = fs::remove_dir_all(temp_dir);
    }
}
