use std::fs;
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime};

const RULES_DIR: &str = "rules";
const DEFAULT_RULES_FILE: &str = "default.rules";

pub(crate) fn default_rules_path(agent_home: &Path) -> PathBuf {
    agent_home.join(RULES_DIR).join(DEFAULT_RULES_FILE)
}

pub(crate) fn append_prefix_rule(path: &Path, pattern: &[String]) -> Result<(), String> {
    if pattern.is_empty() {
        return Err("empty command pattern".to_string());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let _lock = acquire_rules_lock(path)?;
    let existing = fs::read_to_string(path).unwrap_or_default();
    if rule_already_present(&existing, pattern) {
        return Ok(());
    }
    let mut updated = existing;

    if !updated.is_empty() && !updated.ends_with('\n') {
        updated.push('\n');
    }
    if !updated.is_empty() {
        updated.push('\n');
    }

    let rule = format_prefix_rule(pattern);
    updated.push_str(&rule);

    if !updated.ends_with('\n') {
        updated.push('\n');
    }

    fs::write(path, updated).map_err(|err| err.to_string())
}

pub(crate) fn list_prefix_rules(path: &Path) -> Result<Vec<Vec<String>>, String> {
    let contents = fs::read_to_string(path).unwrap_or_default();
    let lines = contents
        .lines()
        .map(|line| line.to_string())
        .collect::<Vec<_>>();
    let rules = parse_rule_blocks(&lines)
        .into_iter()
        .filter(|block| block.decision_allows)
        .filter_map(|block| block.pattern)
        .collect::<Vec<_>>();
    Ok(rules)
}

pub(crate) fn remove_prefix_rule(path: &Path, pattern: &[String]) -> Result<bool, String> {
    let normalized_target = normalize_pattern(pattern);
    if normalized_target.is_empty() {
        return Err("empty command pattern".to_string());
    }
    if !path.exists() {
        return Ok(false);
    }

    let _lock = acquire_rules_lock(path)?;
    let existing = fs::read_to_string(path).unwrap_or_default();
    let lines = existing
        .lines()
        .map(|line| line.to_string())
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return Ok(false);
    }

    let blocks = parse_rule_blocks(&lines);
    let mut keep = vec![true; lines.len()];
    let mut removed = false;

    for block in blocks {
        if !block.decision_allows {
            continue;
        }
        if block.pattern.as_deref() != Some(normalized_target.as_slice()) {
            continue;
        }
        removed = true;
        for index in block.start..=block.end {
            if index < keep.len() {
                keep[index] = false;
            }
        }
    }

    if !removed {
        return Ok(false);
    }

    let mut updated = lines
        .iter()
        .enumerate()
        .filter_map(|(index, line)| if keep[index] { Some(line.as_str()) } else { None })
        .collect::<Vec<_>>()
        .join("\n");
    if !updated.is_empty() {
        updated.push('\n');
    }
    fs::write(path, updated).map_err(|err| err.to_string())?;
    Ok(true)
}

struct RulesFileLock {
    path: PathBuf,
}

impl Drop for RulesFileLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn acquire_rules_lock(path: &Path) -> Result<RulesFileLock, String> {
    let lock_path = path.with_extension("lock");
    let deadline = Instant::now() + Duration::from_secs(2);
    let stale_after = Duration::from_secs(30);

    loop {
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
        {
            Ok(_) => return Ok(RulesFileLock { path: lock_path }),
            Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
                if is_lock_stale(&lock_path, stale_after) {
                    let _ = fs::remove_file(&lock_path);
                    continue;
                }
                if Instant::now() >= deadline {
                    return Err("timed out waiting for rules file lock".to_string());
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(err) => return Err(err.to_string()),
        }
    }
}

fn is_lock_stale(path: &Path, stale_after: Duration) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = metadata.modified() else {
        return false;
    };
    let Ok(age) = SystemTime::now().duration_since(modified) else {
        return false;
    };
    age > stale_after
}

fn format_prefix_rule(pattern: &[String]) -> String {
    let items = format_pattern_list(pattern);
    format!("prefix_rule(\n    pattern = [{items}],\n    decision = \"allow\",\n)\n")
}

fn format_pattern_list(pattern: &[String]) -> String {
    pattern
        .iter()
        .map(|item| format!("\"{}\"", escape_string(item)))
        .collect::<Vec<_>>()
        .join(", ")
}

fn rule_already_present(contents: &str, pattern: &[String]) -> bool {
    let target = normalize_pattern(pattern);
    let lines = contents
        .lines()
        .map(|line| line.to_string())
        .collect::<Vec<_>>();
    parse_rule_blocks(&lines).into_iter().any(|block| {
        block.decision_allows && block.pattern.as_deref() == Some(target.as_slice())
    })
}

fn normalize_pattern(pattern: &[String]) -> Vec<String> {
    pattern
        .iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

#[derive(Debug)]
struct ParsedRuleBlock {
    start: usize,
    end: usize,
    pattern: Option<Vec<String>>,
    decision_allows: bool,
}

fn parse_rule_blocks(lines: &[String]) -> Vec<ParsedRuleBlock> {
    let mut blocks = Vec::new();
    let mut in_rule = false;
    let mut start = 0usize;
    let mut pattern: Option<Vec<String>> = None;
    let mut decision_allows = false;

    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with("prefix_rule(") {
            in_rule = true;
            start = index;
            pattern = None;
            decision_allows = false;
            continue;
        }
        if !in_rule {
            continue;
        }
        if trimmed.starts_with("pattern") {
            if let Some((_, value)) = trimmed.split_once('=') {
                pattern = parse_pattern_list(value);
            }
        } else if trimmed.starts_with("decision") {
            if let Some((_, value)) = trimmed.split_once('=') {
                let candidate = value.trim().trim_end_matches(',');
                if candidate.contains("\"allow\"") || candidate.contains("'allow'") {
                    decision_allows = true;
                }
            }
        } else if trimmed.starts_with(')') {
            blocks.push(ParsedRuleBlock {
                start,
                end: index,
                pattern: pattern.clone(),
                decision_allows,
            });
            in_rule = false;
        }
    }

    blocks
}

fn parse_pattern_list(raw_value: &str) -> Option<Vec<String>> {
    let candidate = raw_value.trim().trim_end_matches(',').trim();
    if candidate.is_empty() {
        return None;
    }
    if let Ok(pattern) = serde_json::from_str::<Vec<String>>(candidate) {
        return Some(normalize_pattern(&pattern));
    }
    if candidate.contains('\'') {
        let replaced = candidate.replace('\'', "\"");
        if let Ok(pattern) = serde_json::from_str::<Vec<String>>(&replaced) {
            return Some(normalize_pattern(&pattern));
        }
    }
    None
}

fn escape_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}
