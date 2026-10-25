use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Location {
    pub name: String,
    pub latitude: f64,
    pub longitude: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Reaction {
    pub emoji: String,
    pub count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteMeta {
    #[serde(default = "Uuid::new_v4")]
    pub id: Uuid,
    #[serde(default = "default_note_type")]
    pub note_type: String,
    #[serde(default = "Utc::now")]
    pub created_at: DateTime<Utc>,
    #[serde(default = "Utc::now")]
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,
    #[serde(default)]
    pub relations: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub reactions: Vec<Reaction>,
    #[serde(default)]
    pub extra: serde_json::Value,
}

fn default_note_type() -> String {
    "markdown".to_string()
}

impl Default for NoteMeta {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            note_type: default_note_type(),
            created_at: now,
            updated_at: now,
            pinned: false,
            archived: false,
            workspace_id: None,
            location: None,
            relations: Vec::new(),
            parent_id: None,
            reactions: Vec::new(),
            extra: serde_json::Value::Object(serde_json::Map::new()),
        }
    }
}

/// Partial update payload for `update_note`.
///
/// Every field is optional so callers can patch a single attribute without
/// resetting the others (e.g. toggling a tag must not clear `pinned`).
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct NoteMetaPatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinned: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relations: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reactions: Option<Vec<Reaction>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteFile {
    pub meta: NoteMeta,
    pub content: String,
    pub file_path: PathBuf,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub order: i32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TagSetting {
    pub tag: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default)]
    pub blur: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub data_dir: PathBuf,
    pub theme: String,
    pub language: String,
    pub editor_font_size: u32,
    pub week_start_day: u8,
    pub auto_save_interval: u32,
    pub close_to_tray: bool,
    pub auto_backup: bool,
    pub backup_interval_hours: u32,
    pub max_backups: u32,
    pub file_watch_enabled: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        let default_vault = dirs::document_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("NoteFlowVault");

        Self {
            data_dir: default_vault,
            theme: "system".to_string(),
            language: "en".to_string(),
            editor_font_size: 15,
            week_start_day: 1, // Monday
            auto_save_interval: 5,
            close_to_tray: false,
            auto_backup: true,
            backup_interval_hours: 24,
            max_backups: 10,
            file_watch_enabled: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SavedView {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub filter_expression: String,
    pub description: String,
    pub sort_by: String,
    pub sort_order: String,
    pub show_in_sidebar: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchResult {
    pub note_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
    pub created_at: String,
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct NoteStats {
    pub total: u32,
    pub recent_created: u32,
    pub recent_modified: u32,
    pub pinned: u32,
    pub archived: u32,
    pub with_attachments: u32,
    pub with_code: u32,
    pub with_links: u32,
    pub with_location: u32,
    pub with_tasks: u32,
    pub incomplete_tasks: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DraftInfo {
    pub id: String,
    #[serde(default)]
    pub title: String,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default = "Utc::now")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AttachmentInfo {
    pub filename: String,
    pub path: String,
    pub size: u64,
    pub mime_type: String,
    pub note_id: Option<String>,
    pub created: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct AttachmentStats {
    pub total_count: u32,
    pub total_size_bytes: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct BackupInfo {
    pub filename: String,
    pub size: u64,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct RestoreReport {
    pub restored_notes: usize,
    pub restored_attachments: usize,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ImportReport {
    pub imported_count: usize,
    pub skipped_count: usize,
    pub errors: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct NoteFilter {
    pub workspace_id: Option<String>,
    pub tag: Option<String>,
    pub pinned: Option<bool>,
    pub archived: Option<bool>,
    pub note_type: Option<String>,
    pub search_text: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
    pub has_tasks: Option<bool>,
    pub has_incomplete_tasks: Option<bool>,
    pub has_location: Option<bool>,
    pub has_links: Option<bool>,
    pub has_code: Option<bool>,
    pub has_attachments: Option<bool>,
}
