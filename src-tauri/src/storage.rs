use crate::error::{AppError, Result};
use crate::models::{NoteFile, NoteMeta};
use regex::Regex;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub fn ensure_vault_structure(base: &Path) -> Result<()> {
    fs::create_dir_all(base)?;
    fs::create_dir_all(base.join("notes"))?;
    fs::create_dir_all(base.join("attachments"))?;
    fs::create_dir_all(base.join("drafts"))?;
    fs::create_dir_all(base.join("trash"))?;
    fs::create_dir_all(base.join("backups"))?;
    fs::create_dir_all(base.join(".noteflow"))?;
    Ok(())
}

pub fn atomic_write(path: &Path, content: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::General("Path has no parent directory".to_string()))?;
    fs::create_dir_all(parent)?;

    let mut temp_file = tempfile::NamedTempFile::new_in(parent)?;
    temp_file.write_all(content)?;
    temp_file.flush()?;
    temp_file.as_file().sync_all()?;
    temp_file.persist(path).map_err(|e| {
        AppError::General(format!("Failed to persist atomic file {}: {}", path.display(), e))
    })?;

    Ok(())
}

pub fn serialize_note(meta: &NoteMeta, body: &str) -> String {
    // Convert meta to serde_yaml::Value
    let mut yaml_val = serde_yaml::to_value(meta).unwrap_or(serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));

    // Merge any extra fields into top-level mapping and remove 'extra' key if present
    if let serde_yaml::Value::Mapping(ref mut map) = yaml_val {
        let extra_key = serde_yaml::Value::String("extra".to_string());
        if let Some(extra_val) = map.remove(&extra_key) {
            if let serde_yaml::Value::Mapping(extra_map) = extra_val {
                for (k, v) in extra_map {
                    if !map.contains_key(&k) {
                        map.insert(k, v);
                    }
                }
            }
        }
    }

    let yaml_str = match serde_yaml::to_string(&yaml_val) {
        Ok(s) => s.trim().to_string(),
        Err(_) => String::new(),
    };

    format!("---\n{}\n---\n\n{}", yaml_str, body.trim_start())
}

pub fn parse_front_matter(content: &str) -> Result<(NoteMeta, String)> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return Ok((NoteMeta::default(), content.to_string()));
    }

    let rest = &trimmed[3..];
    if let Some(end_idx) = rest.find("\n---") {
        let yaml_part = &rest[..end_idx].trim();
        let body_part = rest[end_idx + 4..].trim_start_matches(|c| c == '\r' || c == '\n').to_string();

        let yaml_val: serde_yaml::Value = serde_yaml::from_str(yaml_part)
            .map_err(|e| AppError::Validation(format!("Invalid YAML front matter: {}", e)))?;

        let mut meta: NoteMeta = serde_yaml::from_value(yaml_val.clone()).unwrap_or_default();

        // Preserve unknown fields into meta.extra
        if let serde_yaml::Value::Mapping(map) = yaml_val {
            let known_keys = [
                "id", "note_type", "created_at", "updated_at", "pinned",
                "archived", "workspace_id", "location", "relations",
                "parent_id", "reactions", "extra"
            ];
            let mut extra_map = serde_json::Map::new();

            for (k, v) in map {
                if let Some(key_str) = k.as_str() {
                    if !known_keys.contains(&key_str) {
                        if let Ok(json_val) = serde_json::to_value(&v) {
                            extra_map.insert(key_str.to_string(), json_val);
                        }
                    }
                }
            }

            if !extra_map.is_empty() {
                meta.extra = serde_json::Value::Object(extra_map);
            }
        }

        Ok((meta, body_part))
    } else {
        Ok((NoteMeta::default(), content.to_string()))
    }
}

use chrono::Local;

pub fn generate_note_filename(base: &Path, now: chrono::DateTime<Local>) -> String {
    let date_str = now.format("%Y%m%d_%H%M%S").to_string();
    let notes_dir = base.join("notes");
    let candidate = format!("{}.md", date_str);
    if !notes_dir.join(&candidate).exists() {
        return candidate;
    }

    let mut seq = 1;
    loop {
        let candidate_seq = format!("{}_{:02}.md", date_str, seq);
        if !notes_dir.join(&candidate_seq).exists() {
            return candidate_seq;
        }
        seq += 1;
    }
}

pub fn create_note(base: &Path, content: &str, meta: &NoteMeta) -> Result<PathBuf> {
    ensure_vault_structure(base)?;
    let filename = generate_note_filename(base, Local::now());
    let note_path = base.join("notes").join(filename);
    let serialized = serialize_note(meta, content);
    atomic_write(&note_path, serialized.as_bytes())?;
    Ok(note_path)
}

pub fn read_note(path: &Path) -> Result<NoteFile> {
    let raw = fs::read_to_string(path)?;
    let (meta, content) = parse_front_matter(&raw)?;
    Ok(NoteFile {
        meta,
        content,
        file_path: path.to_path_buf(),
    })
}

pub fn find_note_path_by_id(base: &Path, id: &str) -> Option<PathBuf> {
    let candidate = base.join("notes").join(format!("{}.md", id));
    if candidate.exists() {
        return Some(candidate);
    }

    // Search in notes/ directory
    for entry in WalkDir::new(base.join("notes")).into_iter().filter_map(|e| e.ok()) {
        if entry.path().extension().and_then(|ext| ext.to_str()) == Some("md") {
            if let Ok(note) = read_note(entry.path()) {
                if note.meta.id.to_string() == id {
                    return Some(entry.path().to_path_buf());
                }
            }
        }
    }
    None
}

pub fn find_trash_path_by_id(base: &Path, id: &str) -> Option<PathBuf> {
    let candidate = base.join("trash").join(format!("{}.md", id));
    if candidate.exists() {
        return Some(candidate);
    }

    for entry in WalkDir::new(base.join("trash")).into_iter().filter_map(|e| e.ok()) {
        if entry.path().extension().and_then(|ext| ext.to_str()) == Some("md") {
            if let Ok(note) = read_note(entry.path()) {
                if note.meta.id.to_string() == id {
                    return Some(entry.path().to_path_buf());
                }
            }
        }
    }
    None
}

/// Serialize `content` + `meta` into an already resolved note path.
pub fn write_note_at(path: &Path, content: &str, meta: &NoteMeta) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let serialized = serialize_note(meta, content);
    atomic_write(path, serialized.as_bytes())?;
    Ok(())
}

pub fn update_note(base: &Path, id: &str, content: &str, meta: &NoteMeta) -> Result<()> {
    let path = find_note_path_by_id(base, id)
        .unwrap_or_else(|| base.join("notes").join(format!("{}.md", id)));
    write_note_at(&path, content, meta)
}

pub fn delete_note(base: &Path, id: &str) -> Result<()> {
    let source = find_note_path_by_id(base, id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found in notes directory", id)))?;

    let dest = base.join("trash").join(source.file_name().unwrap());
    fs::create_dir_all(base.join("trash"))?;
    fs::rename(&source, &dest)?;
    Ok(())
}

pub fn restore_note(base: &Path, id: &str) -> Result<()> {
    let source = find_trash_path_by_id(base, id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found in trash directory", id)))?;

    let dest = base.join("notes").join(source.file_name().unwrap());
    fs::create_dir_all(base.join("notes"))?;
    fs::rename(&source, &dest)?;
    Ok(())
}

pub fn permanent_delete(base: &Path, id: &str) -> Result<()> {
    if let Some(path) = find_trash_path_by_id(base, id) {
        fs::remove_file(path)?;
        return Ok(());
    }
    if let Some(path) = find_note_path_by_id(base, id) {
        fs::remove_file(path)?;
        return Ok(());
    }
    Err(AppError::NotFound(format!("Note {} not found", id)))
}

pub fn list_notes(base: &Path) -> Result<Vec<NoteFile>> {
    let notes_dir = base.join("notes");
    if !notes_dir.exists() {
        return Ok(Vec::new());
    }

    let mut notes = Vec::new();
    for entry in WalkDir::new(notes_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.path().is_file() && entry.path().extension().and_then(|s| s.to_str()) == Some("md") {
            if let Ok(note) = read_note(entry.path()) {
                notes.push(note);
            }
        }
    }
    Ok(notes)
}

pub fn list_trash(base: &Path) -> Result<Vec<NoteFile>> {
    let trash_dir = base.join("trash");
    if !trash_dir.exists() {
        return Ok(Vec::new());
    }

    let mut notes = Vec::new();
    for entry in WalkDir::new(trash_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.path().is_file() && entry.path().extension().and_then(|s| s.to_str()) == Some("md") {
            if let Ok(note) = read_note(entry.path()) {
                notes.push(note);
            }
        }
    }
    Ok(notes)
}

pub fn extract_tags(content: &str) -> Vec<String> {
    // 1. Remove fenced code blocks ``` ... ```
    let code_block_re = Regex::new(r"(?s)```.*?```").unwrap();
    let without_code_blocks = code_block_re.replace_all(content, "");

    // 2. Remove inline code ` ... `
    let inline_code_re = Regex::new(r"`[^`\n]+`").unwrap();
    let without_inline = inline_code_re.replace_all(&without_code_blocks, "");

    // 3. Remove markdown links and URLs: [text](http...#tag) or http://...#tag
    let url_re = Regex::new(r"https?://[^\s)]+").unwrap();
    let without_urls = url_re.replace_all(&without_inline, "");

    // 4. Extract #tags: must start with whitespace or beginning of line,
    // followed by # and alphanumeric/underscore/hyphen/slash/unicode characters
    let tag_re = Regex::new(r"(?:^|[\s,;!?:(])#([a-zA-Z0-9_\-/\u4e00-\u9fa5]+)").unwrap();

    let mut tags = Vec::new();
    for cap in tag_re.captures_iter(&without_urls) {
        if let Some(tag_match) = cap.get(1) {
            let mut tag = tag_match.as_str().trim().to_string();
            while tag.ends_with('/') || tag.ends_with('-') || tag.ends_with('_') {
                tag.pop();
            }
            if !tag.is_empty() && !tags.contains(&tag) {
                tags.push(tag);
            }
        }
    }
    tags
}

pub fn extract_title(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            let title = trimmed[2..].trim().to_string();
            if !title.is_empty() {
                return Some(title);
            }
        }
    }
    None
}
