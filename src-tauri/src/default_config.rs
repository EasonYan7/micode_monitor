use std::fs;
use std::path::PathBuf;

const DEFAULT_AGENTS_MD: &str = include_str!("../../AGENTS.md");
const DEFAULT_SOUL_MD: &str = include_str!("../../soul.md");
const DEFAULT_DEMO_MD: &str = include_str!("../../demo.md");

const SKILL_WEB_INTELLIGENCE_SEARCH: &str =
    include_str!("../../skills/web-intelligence-search/SKILL.md");
const SKILL_PDF_DEEP_ANALYSIS: &str =
    include_str!("../../skills/pdf-deep-analysis/SKILL.md");
const SKILL_CORPORATE_INFO_CRAWLER: &str =
    include_str!("../../skills/corporate-info-crawler/SKILL.md");
const SKILL_OCR_DOCUMENT_PROCESSOR: &str =
    include_str!("../../skills/ocr-document-processor/SKILL.md");
const SKILL_OUTLOOK_EMAIL_MANAGER: &str =
    include_str!("../../skills/outlook-email-manager/SKILL.md");

struct SkillEntry {
    dir_name: &'static str,
    content: &'static str,
}

const DEFAULT_SKILLS: &[SkillEntry] = &[
    SkillEntry {
        dir_name: "web-intelligence-search",
        content: SKILL_WEB_INTELLIGENCE_SEARCH,
    },
    SkillEntry {
        dir_name: "pdf-deep-analysis",
        content: SKILL_PDF_DEEP_ANALYSIS,
    },
    SkillEntry {
        dir_name: "corporate-info-crawler",
        content: SKILL_CORPORATE_INFO_CRAWLER,
    },
    SkillEntry {
        dir_name: "ocr-document-processor",
        content: SKILL_OCR_DOCUMENT_PROCESSOR,
    },
    SkillEntry {
        dir_name: "outlook-email-manager",
        content: SKILL_OUTLOOK_EMAIL_MANAGER,
    },
];

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

    ensure_default_skills(&micode_home)?;
    ensure_default_skills(&codex_home)?;

    Ok(())
}

fn ensure_default_skills(home: &PathBuf) -> Result<(), String> {
    let skills_dir = home.join("skills");
    if !skills_dir.exists() {
        fs::create_dir_all(&skills_dir)
            .map_err(|err| format!("Failed to create skills directory: {err}"))?;
    }

    for skill in DEFAULT_SKILLS {
        let skill_dir = skills_dir.join(skill.dir_name);
        if !skill_dir.exists() {
            fs::create_dir_all(&skill_dir)
                .map_err(|err| format!("Failed to create skill dir {}: {err}", skill.dir_name))?;
        }
        write_if_missing(&skill_dir.join("SKILL.md"), skill.content)?;
    }

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

        assert!(micode_home.join("skills/web-intelligence-search/SKILL.md").exists());
        assert!(micode_home.join("skills/pdf-deep-analysis/SKILL.md").exists());
        assert!(micode_home.join("skills/corporate-info-crawler/SKILL.md").exists());
        assert!(micode_home.join("skills/ocr-document-processor/SKILL.md").exists());
        assert!(micode_home.join("skills/outlook-email-manager/SKILL.md").exists());
        assert!(codex_home.join("skills/web-intelligence-search/SKILL.md").exists());
        assert!(codex_home.join("skills/pdf-deep-analysis/SKILL.md").exists());
        assert!(codex_home.join("skills/corporate-info-crawler/SKILL.md").exists());
        assert!(codex_home.join("skills/ocr-document-processor/SKILL.md").exists());
        assert!(codex_home.join("skills/outlook-email-manager/SKILL.md").exists());

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
