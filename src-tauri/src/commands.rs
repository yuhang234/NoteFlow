use crate::attachments;
use crate::backup;
use crate::config;
use crate::database::Database;
use crate::error::AppError;
use crate::import_export;
use crate::models::{
    AppConfig, AttachmentInfo, AttachmentStats, BackupInfo, DraftInfo, ImportReport,
    NoteFile, NoteFilter, NoteMeta, NoteMetaPatch, NoteStats, Reaction, RestoreReport,
    SavedView, SearchResult, TagSetting, Workspace,
};
use crate::query::QueryParser;
use crate::storage::{
    self, atomic_write, find_note_path_by_id, find_trash_path_by_id, read_note,
};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

pub struct AppState {
    pub db: Mutex<Database>,
    pub config: Mutex<AppConfig>,
    pub data_dir: Mutex<PathBuf>,
    /// Keeps the filesystem watcher alive; replaced when the vault changes.
    pub watcher: Mutex<Option<crate::watcher::VaultWatcher>>,
}

fn get_base_dir(state: &State<'_, AppState>) -> PathBuf {
    state.data_dir.lock().unwrap().clone()
}

/// Resolve a note path through the index first and only fall back to a vault
/// scan when the index is missing the note (e.g. freshly copied vault).
fn resolve_note_path(state: &AppState, base: &Path, id: &str) -> Option<PathBuf> {
    if let Ok(db) = state.db.lock() {
        if let Some(path) = db.note_path(id) {
            if path.is_file() {
                return Some(path);
            }
        }
    }
    find_note_path_by_id(base, id)
}

// -------------------------------------------------------------
// Note CRUD
// -------------------------------------------------------------

#[tauri::command]
fn optional_id(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "null" {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[tauri::command]
pub async fn create_note(
    state: State<'_, AppState>,
    content: String,
    meta: Option<NoteMeta>,
    workspace_id: Option<String>,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let mut note_meta = meta.unwrap_or_default();
    if note_meta.workspace_id.is_none() {
        note_meta.workspace_id = workspace_id.and_then(optional_id);
    }
    let now = Utc::now();
    note_meta.created_at = now;
    note_meta.updated_at = now;
    if note_meta.id.is_nil() {
        note_meta.id = Uuid::new_v4();
    }

    let file_path = storage::create_note(&base, &content, &note_meta)?;
    let note_file = NoteFile {
        meta: note_meta,
        content,
        file_path,
    };

    if let Ok(db) = state.db.lock() {
        let _ = db.index_note(&note_file);
    }

    Ok(note_file)
}

#[tauri::command]
pub async fn get_note(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let path = resolve_note_path(&state, &base, &id)
        .or_else(|| find_trash_path_by_id(&base, &id))
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", id)))?;

    read_note(&path)
}

#[tauri::command]
pub async fn update_note(
    state: State<'_, AppState>,
    id: String,
    content: String,
    meta: Option<NoteMetaPatch>,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let path = resolve_note_path(&state, &base, &id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", id)))?;

    let existing = read_note(&path)?;
    let mut updated_meta = existing.meta;
    if let Some(patch) = meta {
        if let Some(note_type) = patch.note_type {
            if !note_type.trim().is_empty() {
                updated_meta.note_type = note_type;
            }
        }
        if let Some(pinned) = patch.pinned {
            updated_meta.pinned = pinned;
        }
        if let Some(archived) = patch.archived {
            updated_meta.archived = archived;
        }
        if let Some(workspace_id) = patch.workspace_id {
            updated_meta.workspace_id = optional_id(workspace_id);
        }
        if let Some(location) = patch.location {
            updated_meta.location = Some(location);
        }
        if let Some(relations) = patch.relations {
            updated_meta.relations = relations;
        }
        if let Some(parent_id) = patch.parent_id {
            updated_meta.parent_id = optional_id(parent_id);
        }
        if let Some(reactions) = patch.reactions {
            updated_meta.reactions = reactions;
        }
        if let Some(extra) = patch.extra {
            updated_meta.extra = extra;
        }
    }
    updated_meta.updated_at = Utc::now();

    storage::write_note_at(&path, &content, &updated_meta)?;
    let note_file = NoteFile {
        meta: updated_meta,
        content,
        file_path: path,
    };

    if let Ok(db) = state.db.lock() {
        let _ = db.index_note(&note_file);
    }

    Ok(note_file)
}

#[tauri::command]
pub async fn delete_note(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    storage::delete_note(&base, &id)?;

    if let Ok(db) = state.db.lock() {
        let _ = db.remove_note(&id);
    }

    Ok(())
}

#[tauri::command]
pub async fn restore_note(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    storage::restore_note(&base, &id)?;

    let path = resolve_note_path(&state, &base, &id)
        .ok_or_else(|| AppError::NotFound(format!("Restored note {} not found", id)))?;

    let note_file = read_note(&path)?;
    if let Ok(db) = state.db.lock() {
        let _ = db.index_note(&note_file);
    }

    Ok(note_file)
}

#[tauri::command]
pub async fn permanent_delete_note(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    storage::permanent_delete(&base, &id)?;

    if let Ok(db) = state.db.lock() {
        let _ = db.remove_note(&id);
    }

    Ok(())
}

#[tauri::command]
pub async fn list_notes(
    state: State<'_, AppState>,
    workspace_id: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> std::result::Result<Vec<NoteFile>, AppError> {
    let base = get_base_dir(&state);
    let mut notes = storage::list_notes(&base)?;

    if let Some(workspace) = workspace_id.as_deref().and_then(|w| {
        let trimmed = w.trim();
        if trimmed.is_empty() || trimmed == "null" || trimmed == "all" {
            None
        } else {
            Some(trimmed)
        }
    }) {
        notes.retain(|note| note.meta.workspace_id.as_deref() == Some(workspace));
    }

    let sort_by = sort_by.unwrap_or_else(|| "updated_at".to_string());
    let descending = !matches!(sort_order.as_deref(), Some("asc") | Some("ascending"));
    sort_notes(&mut notes, &sort_by, descending);

    let offset = offset.unwrap_or(0) as usize;
    if offset > 0 {
        notes = notes.into_iter().skip(offset).collect();
    }
    if let Some(limit) = limit {
        if limit > 0 {
            notes.truncate(limit as usize);
        }
    }

    Ok(notes)
}

/// Sort notes with pinned entries first, then by the requested key.
pub(crate) fn sort_notes(notes: &mut [NoteFile], sort_by: &str, descending: bool) {
    notes.sort_by(|a, b| {
        let ordering = match sort_by {
            "created_at" => a.meta.created_at.cmp(&b.meta.created_at),
            "title" => note_sort_title(a)
                .to_lowercase()
                .cmp(&note_sort_title(b).to_lowercase()),
            _ => a.meta.updated_at.cmp(&b.meta.updated_at),
        };
        let ordering = if descending { ordering.reverse() } else { ordering };
        b.meta.pinned.cmp(&a.meta.pinned).then(ordering)
    });
}

fn note_sort_title(note: &NoteFile) -> String {
    storage::extract_title(&note.content).unwrap_or_else(|| {
        note.file_path
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .unwrap_or_default()
    })
}

#[tauri::command]
pub async fn list_trash(
    state: State<'_, AppState>,
) -> std::result::Result<Vec<NoteFile>, AppError> {
    let base = get_base_dir(&state);
    storage::list_trash(&base)
}

#[tauri::command]
pub async fn pin_note(
    state: State<'_, AppState>,
    id: String,
    pinned: bool,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let path = resolve_note_path(&state, &base, &id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", id)))?;

    let mut note = read_note(&path)?;
    note.meta.pinned = pinned;
    note.meta.updated_at = Utc::now();

    storage::write_note_at(&path, &note.content, &note.meta)?;
    if let Ok(db) = state.db.lock() {
        let _ = db.index_note(&note);
    }

    Ok(note)
}

#[tauri::command]
pub async fn archive_note(
    state: State<'_, AppState>,
    id: String,
    archived: bool,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let path = resolve_note_path(&state, &base, &id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", id)))?;

    let mut note = read_note(&path)?;
    note.meta.archived = archived;
    note.meta.updated_at = Utc::now();

    storage::write_note_at(&path, &note.content, &note.meta)?;
    if let Ok(db) = state.db.lock() {
        let _ = db.index_note(&note);
    }

    Ok(note)
}

#[tauri::command]
pub async fn move_note_to_workspace(
    state: State<'_, AppState>,
    id: String,
    workspace_id: Option<String>,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let path = resolve_note_path(&state, &base, &id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", id)))?;

    let mut note = read_note(&path)?;
    note.meta.workspace_id = workspace_id;
    note.meta.updated_at = Utc::now();

    storage::write_note_at(&path, &note.content, &note.meta)?;
    if let Ok(db) = state.db.lock() {
        let _ = db.index_note(&note);
    }

    Ok(note)
}

#[tauri::command]
pub async fn add_relation(
    state: State<'_, AppState>,
    id: String,
    related_id: String,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let path = resolve_note_path(&state, &base, &id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", id)))?;

    let mut note = read_note(&path)?;
    if !note.meta.relations.contains(&related_id) {
        note.meta.relations.push(related_id);
        note.meta.updated_at = Utc::now();
        storage::write_note_at(&path, &note.content, &note.meta)?;
        if let Ok(db) = state.db.lock() {
            let _ = db.index_note(&note);
        }
    }

    Ok(note)
}

#[tauri::command]
pub async fn remove_relation(
    state: State<'_, AppState>,
    id: String,
    related_id: String,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let path = resolve_note_path(&state, &base, &id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", id)))?;

    let mut note = read_note(&path)?;
    if let Some(pos) = note.meta.relations.iter().position(|x| x == &related_id) {
        note.meta.relations.remove(pos);
        note.meta.updated_at = Utc::now();
        storage::write_note_at(&path, &note.content, &note.meta)?;
        if let Ok(db) = state.db.lock() {
            let _ = db.index_note(&note);
        }
    }

    Ok(note)
}

#[tauri::command]
pub async fn add_reaction(
    state: State<'_, AppState>,
    id: String,
    emoji: String,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let path = resolve_note_path(&state, &base, &id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", id)))?;

    let mut note = read_note(&path)?;
    if let Some(r) = note.meta.reactions.iter_mut().find(|r| r.emoji == emoji) {
        r.count += 1;
    } else {
        note.meta.reactions.push(Reaction { emoji, count: 1 });
    }
    note.meta.updated_at = Utc::now();

    storage::write_note_at(&path, &note.content, &note.meta)?;
    if let Ok(db) = state.db.lock() {
        let _ = db.index_note(&note);
    }

    Ok(note)
}

#[tauri::command]
pub async fn remove_reaction(
    state: State<'_, AppState>,
    id: String,
    emoji: String,
) -> std::result::Result<NoteFile, AppError> {
    let base = get_base_dir(&state);
    let path = resolve_note_path(&state, &base, &id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", id)))?;

    let mut note = read_note(&path)?;
    if let Some(pos) = note.meta.reactions.iter().position(|r| r.emoji == emoji) {
        if note.meta.reactions[pos].count > 1 {
            note.meta.reactions[pos].count -= 1;
        } else {
            note.meta.reactions.remove(pos);
        }
        note.meta.updated_at = Utc::now();
        storage::write_note_at(&path, &note.content, &note.meta)?;
        if let Ok(db) = state.db.lock() {
            let _ = db.index_note(&note);
        }
    }

    Ok(note)
}

// -------------------------------------------------------------
// Search & Filter
// -------------------------------------------------------------

#[tauri::command]
pub async fn search_notes(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> std::result::Result<Vec<SearchResult>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::General(e.to_string()))?;
    db.search(&query, limit.unwrap_or(20), offset.unwrap_or(0))
}

#[tauri::command]
pub async fn filter_notes(
    state: State<'_, AppState>,
    filter: NoteFilter,
) -> std::result::Result<Vec<NoteFile>, AppError> {
    let base = get_base_dir(&state);
    let ids = {
        let db = state.db.lock().map_err(|e| AppError::General(e.to_string()))?;
        db.filter_notes(&filter)?
    };

    let mut list = Vec::new();
    for id in ids {
        if let Some(p) = resolve_note_path(&state, &base, &id) {
            if let Ok(n) = read_note(&p) {
                list.push(n);
            }
        }
    }
    Ok(list)
}

#[tauri::command]
pub async fn advanced_query(
    state: State<'_, AppState>,
    query: String,
) -> std::result::Result<Vec<NoteFile>, AppError> {
    let base = get_base_dir(&state);
    let parsed_expr = QueryParser::parse(&query)?;
    let all_notes = storage::list_notes(&base)?;

    let filtered = all_notes
        .into_iter()
        .filter(|note| parsed_expr.matches(note))
        .collect();

    Ok(filtered)
}

// -------------------------------------------------------------
// Tags
// -------------------------------------------------------------

#[tauri::command]
pub async fn get_all_tags(
    state: State<'_, AppState>,
) -> std::result::Result<Vec<(String, u32)>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::General(e.to_string()))?;
    db.get_all_tags()
}

#[tauri::command]
pub async fn get_tag_settings(
    state: State<'_, AppState>,
) -> std::result::Result<Vec<TagSetting>, AppError> {
    let base = get_base_dir(&state);
    config::load_tag_settings(&base)
}

#[tauri::command]
pub async fn save_tag_settings(
    state: State<'_, AppState>,
    settings: Vec<TagSetting>,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    config::save_tag_settings(&base, &settings)
}

// -------------------------------------------------------------
// Workspaces
// -------------------------------------------------------------

#[tauri::command]
pub async fn get_workspaces(
    state: State<'_, AppState>,
) -> std::result::Result<Vec<Workspace>, AppError> {
    let base = get_base_dir(&state);
    config::load_workspaces(&base)
}

#[tauri::command]
pub async fn create_workspace(
    state: State<'_, AppState>,
    mut workspace: Workspace,
) -> std::result::Result<Workspace, AppError> {
    let base = get_base_dir(&state);
    let mut workspaces = config::load_workspaces(&base)?;
    if workspace.id.is_empty() {
        workspace.id = Uuid::new_v4().to_string();
    }
    workspaces.push(workspace.clone());
    config::save_workspaces(&base, &workspaces)?;
    Ok(workspace)
}

#[tauri::command]
pub async fn update_workspace(
    state: State<'_, AppState>,
    workspace: Workspace,
) -> std::result::Result<Workspace, AppError> {
    let base = get_base_dir(&state);
    let mut workspaces = config::load_workspaces(&base)?;
    if let Some(idx) = workspaces.iter().position(|w| w.id == workspace.id) {
        workspaces[idx] = workspace.clone();
        config::save_workspaces(&base, &workspaces)?;
        Ok(workspace)
    } else {
        Err(AppError::NotFound(format!("Workspace {} not found", workspace.id)))
    }
}

#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    let mut workspaces = config::load_workspaces(&base)?;
    let initial_len = workspaces.len();
    workspaces.retain(|w| w.id != id);
    if workspaces.len() == initial_len {
        return Err(AppError::NotFound(format!("Workspace {} not found", id)));
    }
    config::save_workspaces(&base, &workspaces)?;
    Ok(())
}

// -------------------------------------------------------------
// Attachments
// -------------------------------------------------------------

#[tauri::command]
pub async fn add_attachment(
    state: State<'_, AppState>,
    note_id: String,
    source_path: String,
) -> std::result::Result<String, AppError> {
    let base = get_base_dir(&state);
    attachments::add_attachment(&base, &note_id, Path::new(&source_path))
}

#[tauri::command]
pub async fn list_attachments(
    state: State<'_, AppState>,
    note_id: String,
) -> std::result::Result<Vec<AttachmentInfo>, AppError> {
    let base = get_base_dir(&state);
    attachments::list_attachments(&base, &note_id)
}

#[tauri::command]
pub async fn delete_attachment(
    state: State<'_, AppState>,
    note_id: String,
    filename: String,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    attachments::delete_attachment(&base, &note_id, &filename)
}

#[tauri::command]
pub async fn get_unused_attachments(
    state: State<'_, AppState>,
) -> std::result::Result<Vec<AttachmentInfo>, AppError> {
    let base = get_base_dir(&state);
    attachments::get_unused_attachments(&base)
}

#[tauri::command]
pub async fn get_attachment_stats(
    state: State<'_, AppState>,
) -> std::result::Result<AttachmentStats, AppError> {
    let base = get_base_dir(&state);
    attachments::get_attachment_stats(&base)
}

#[tauri::command]
pub async fn upload_attachment(
    state: State<'_, AppState>,
    note_id: String,
    filename: String,
    data: Vec<u8>,
) -> std::result::Result<AttachmentInfo, AppError> {
    let base = get_base_dir(&state);
    let info = attachments::save_attachment_bytes(&base, &note_id, &filename, &data)?;
    Ok(info)
}

#[tauri::command]
pub async fn read_attachment_base64(
    state: State<'_, AppState>,
    relative_path: String,
) -> std::result::Result<String, AppError> {
    let base = get_base_dir(&state);
    attachments::read_attachment_base64(&base, &relative_path)
}

#[tauri::command]
pub async fn open_attachment(
    state: State<'_, AppState>,
    relative_path: String,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    attachments::open_attachment(&base, &relative_path)
}

#[tauri::command]
pub async fn open_attachment_folder(
    state: State<'_, AppState>,
    note_id: Option<String>,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    attachments::open_attachment_folder(&base, note_id.as_deref())
}

// -------------------------------------------------------------
// Saved Views
// -------------------------------------------------------------

#[tauri::command]
pub async fn get_views(
    state: State<'_, AppState>,
) -> std::result::Result<Vec<SavedView>, AppError> {
    let base = get_base_dir(&state);
    config::load_views(&base)
}

#[tauri::command]
pub async fn save_view(
    state: State<'_, AppState>,
    mut view: SavedView,
) -> std::result::Result<SavedView, AppError> {
    let base = get_base_dir(&state);
    let mut views = config::load_views(&base)?;
    if view.id.is_empty() {
        view.id = Uuid::new_v4().to_string();
    }

    if let Some(idx) = views.iter().position(|v| v.id == view.id) {
        views[idx] = view.clone();
    } else {
        views.push(view.clone());
    }

    config::save_views(&base, &views)?;
    Ok(view)
}

#[tauri::command]
pub async fn delete_view(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    let mut views = config::load_views(&base)?;
    let initial_len = views.len();
    views.retain(|v| v.id != id);
    if views.len() == initial_len {
        return Err(AppError::NotFound(format!("View {} not found", id)));
    }
    config::save_views(&base, &views)?;
    Ok(())
}

// -------------------------------------------------------------
// Calendar / Stats
// -------------------------------------------------------------

#[tauri::command]
pub async fn get_notes_by_date(
    state: State<'_, AppState>,
    date: String,
) -> std::result::Result<Vec<NoteFile>, AppError> {
    let base = get_base_dir(&state);
    let ids = {
        let db = state.db.lock().map_err(|e| AppError::General(e.to_string()))?;
        db.get_notes_by_date(&date)?
    };

    let mut list = Vec::new();
    for id in ids {
        if let Some(p) = resolve_note_path(&state, &base, &id) {
            if let Ok(n) = read_note(&p) {
                list.push(n);
            }
        }
    }
    Ok(list)
}

#[tauri::command]
pub async fn get_notes_count_by_month(
    state: State<'_, AppState>,
    year: i32,
    month: u32,
) -> std::result::Result<Vec<(u32, u32)>, AppError> {
    let db = state.db.lock().map_err(|e| AppError::General(e.to_string()))?;
    db.get_notes_count_by_month(year, month)
}

#[tauri::command]
pub async fn get_stats(
    state: State<'_, AppState>,
) -> std::result::Result<NoteStats, AppError> {
    let db = state.db.lock().map_err(|e| AppError::General(e.to_string()))?;
    db.get_stats()
}


// -------------------------------------------------------------
// Config
// -------------------------------------------------------------

#[tauri::command]
pub async fn get_config(
    state: State<'_, AppState>,
) -> std::result::Result<AppConfig, AppError> {
    let cfg = state.config.lock().map_err(|e| AppError::General(e.to_string()))?;
    Ok(cfg.clone())
}

#[tauri::command]
pub async fn save_config(
    state: State<'_, AppState>,
    config: AppConfig,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    config::save_config(&base, &config)?;
    if let Ok(mut c) = state.config.lock() {
        *c = config;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_data_dir(
    state: State<'_, AppState>,
) -> std::result::Result<String, AppError> {
    let base = get_base_dir(&state);
    Ok(base.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_data_dir(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> std::result::Result<(), AppError> {
    let new_dir = PathBuf::from(path);
    storage::ensure_vault_structure(&new_dir)?;

    // Re-open the index against the new vault and rebuild it, otherwise search
    // and path lookups would keep pointing at the previous directory.
    let db_path = new_dir.join(".noteflow").join("noteflow.db");
    let db = Database::new(&db_path)?;
    let _ = db.rebuild_index(&new_dir);
    if let Ok(mut db_guard) = state.db.lock() {
        *db_guard = db;
    }

    if let Ok(mut dir_guard) = state.data_dir.lock() {
        *dir_guard = new_dir.clone();
    }
    if let Ok(mut cfg_guard) = state.config.lock() {
        cfg_guard.data_dir = new_dir.clone();
        let _ = config::save_config(&new_dir, &cfg_guard);
    }

    // Move the file watcher over to the new vault.
    if let Ok(mut slot) = state.watcher.lock() {
        *slot = None;
        *slot = crate::watcher::watch_vault(app.clone(), &new_dir.join("notes")).ok();
    }

    Ok(())
}

// -------------------------------------------------------------
// Backup
// -------------------------------------------------------------

#[tauri::command]
pub async fn create_backup(
    state: State<'_, AppState>,
) -> std::result::Result<String, AppError> {
    let base = get_base_dir(&state);
    let path = backup::create_backup(&base)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn restore_backup(
    state: State<'_, AppState>,
    backup_path: String,
) -> std::result::Result<RestoreReport, AppError> {
    let base = get_base_dir(&state);
    let report = backup::restore_backup(&base, Path::new(&backup_path))?;

    // Rebuild index after restore
    if let Ok(db) = state.db.lock() {
        let _ = db.rebuild_index(&base);
    }

    Ok(report)
}

#[tauri::command]
pub async fn list_backups(
    state: State<'_, AppState>,
) -> std::result::Result<Vec<BackupInfo>, AppError> {
    let base = get_base_dir(&state);
    backup::list_backups(&base)
}

// -------------------------------------------------------------
// Import / Export
// -------------------------------------------------------------

#[tauri::command]
pub async fn import_markdown_folder(
    state: State<'_, AppState>,
    source_path: String,
) -> std::result::Result<ImportReport, AppError> {
    let base = get_base_dir(&state);
    let report = import_export::import_markdown_folder(&base, Path::new(&source_path))?;

    if let Ok(db) = state.db.lock() {
        let _ = db.rebuild_index(&base);
    }

    Ok(report)
}

#[tauri::command]
pub async fn export_notes_zip(
    state: State<'_, AppState>,
    note_ids: Vec<String>,
    output_path: String,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    import_export::export_notes_zip(&base, &note_ids, Path::new(&output_path))
}

#[tauri::command]
pub async fn export_note_html(
    state: State<'_, AppState>,
    note_id: String,
) -> std::result::Result<String, AppError> {
    let base = get_base_dir(&state);
    import_export::export_note_html(&base, &note_id)
}

// -------------------------------------------------------------
// Index
// -------------------------------------------------------------

#[tauri::command]
pub async fn rebuild_index(
    state: State<'_, AppState>,
) -> std::result::Result<usize, AppError> {
    let base = get_base_dir(&state);
    let db = state.db.lock().map_err(|e| AppError::General(e.to_string()))?;
    db.rebuild_index(&base)
}

// -------------------------------------------------------------
// Drafts
// -------------------------------------------------------------

#[tauri::command]
pub async fn save_draft(
    state: State<'_, AppState>,
    mut draft: DraftInfo,
) -> std::result::Result<DraftInfo, AppError> {
    let base = get_base_dir(&state);
    let drafts_dir = base.join("drafts");
    fs::create_dir_all(&drafts_dir)?;

    if draft.id.is_empty() {
        draft.id = Uuid::new_v4().to_string();
    }
    draft.updated_at = Utc::now();

    let draft_file = drafts_dir.join(format!("{}.json", draft.id));
    let content = serde_json::to_string_pretty(&draft)?;
    atomic_write(&draft_file, content.as_bytes())?;

    Ok(draft)
}

#[tauri::command]
pub async fn get_draft(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<DraftInfo, AppError> {
    let base = get_base_dir(&state);
    let draft_file = base.join("drafts").join(format!("{}.json", id));
    if !draft_file.exists() {
        return Err(AppError::NotFound(format!("Draft {} not found", id)));
    }
    let content = fs::read_to_string(draft_file)?;
    let draft: DraftInfo = serde_json::from_str(&content)?;
    Ok(draft)
}

#[tauri::command]
pub async fn list_drafts(
    state: State<'_, AppState>,
) -> std::result::Result<Vec<DraftInfo>, AppError> {
    let base = get_base_dir(&state);
    let drafts_dir = base.join("drafts");
    if !drafts_dir.exists() {
        return Ok(Vec::new());
    }

    let mut drafts = Vec::new();
    for entry in fs::read_dir(drafts_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(draft) = serde_json::from_str::<DraftInfo>(&content) {
                    drafts.push(draft);
                }
            }
        }
    }

    drafts.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(drafts)
}

#[tauri::command]
pub async fn delete_draft(
    state: State<'_, AppState>,
    id: String,
) -> std::result::Result<(), AppError> {
    let base = get_base_dir(&state);
    let draft_file = base.join("drafts").join(format!("{}.json", id));
    if draft_file.exists() {
        fs::remove_file(draft_file)?;
        Ok(())
    } else {
        Err(AppError::NotFound(format!("Draft {} not found", id)))
    }
}
