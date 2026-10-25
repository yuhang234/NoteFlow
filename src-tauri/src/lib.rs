pub mod attachments;
pub mod backup;
pub mod commands;
pub mod config;
pub mod database;
pub mod error;
pub mod import_export;
pub mod models;
pub mod query;
pub mod storage;
pub mod watcher;

use commands::AppState;
use database::Database;
use std::path::PathBuf;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Determine base vault data directory
    let default_vault = dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("NoteFlowVault");

    let _ = storage::ensure_vault_structure(&default_vault);
    let app_config = config::load_config(&default_vault).unwrap_or_default();
    let data_dir = if app_config.data_dir.as_os_str().is_empty() {
        default_vault
    } else {
        app_config.data_dir.clone()
    };
    let _ = storage::ensure_vault_structure(&data_dir);

    // 2. Initialize Database
    let db_path = data_dir.join(".noteflow").join("noteflow.db");
    let db = Database::new(&db_path).expect("Failed to initialize NoteFlow SQLite database");
    // The initial index rebuild runs in the background (see `setup`), so the
    // window can appear immediately even with a large vault.

    let app_state = AppState {
        db: Mutex::new(db),
        config: Mutex::new(app_config),
        data_dir: Mutex::new(data_dir),
        watcher: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Note CRUD
            commands::create_note,
            commands::get_note,
            commands::update_note,
            commands::delete_note,
            commands::restore_note,
            commands::permanent_delete_note,
            commands::list_notes,
            commands::list_trash,
            commands::pin_note,
            commands::archive_note,
            commands::move_note_to_workspace,
            commands::add_relation,
            commands::remove_relation,
            commands::add_reaction,
            commands::remove_reaction,
            // Search
            commands::search_notes,
            commands::filter_notes,
            commands::advanced_query,
            // Tags
            commands::get_all_tags,
            commands::get_tag_settings,
            commands::save_tag_settings,
            // Workspaces
            commands::get_workspaces,
            commands::create_workspace,
            commands::update_workspace,
            commands::delete_workspace,
            // Attachments
            commands::add_attachment,
            commands::upload_attachment,
            commands::read_attachment_base64,
            commands::open_attachment,
            commands::open_attachment_folder,
            commands::list_attachments,
            commands::delete_attachment,
            commands::get_unused_attachments,
            commands::get_attachment_stats,
            // Views
            commands::get_views,
            commands::save_view,
            commands::delete_view,
            // Calendar / Stats
            commands::get_notes_by_date,
            commands::get_notes_count_by_month,
            commands::get_stats,
            // Config
            commands::get_config,
            commands::save_config,
            commands::get_data_dir,
            commands::set_data_dir,
            // Backup
            commands::create_backup,
            commands::restore_backup,
            commands::list_backups,
            // Import / Export
            commands::import_markdown_folder,
            commands::export_notes_zip,
            commands::export_note_html,
            // Index
            commands::rebuild_index,
            // Draft
            commands::save_draft,
            commands::get_draft,
            commands::list_drafts,
            commands::delete_draft,
        ])
        .setup(|app| {
            // Watch the vault so edits made outside NoteFlow (another editor,
            // sync client, ...) reach the UI instead of being overwritten by
            // the next autosave.
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            let notes_dir = state
                .data_dir
                .lock()
                .map(|dir| dir.join("notes"))
                .unwrap_or_else(|_| PathBuf::from("notes"));

            match watcher::watch_vault(handle.clone(), &notes_dir) {
                Ok(vault_watcher) => {
                    if let Ok(mut slot) = state.watcher.lock() {
                        *slot = Some(vault_watcher);
                    }
                }
                Err(err) => log::warn!("File watcher disabled: {err}"),
            }

            // Index the vault without blocking window creation.
            let index_handle = handle.clone();
            std::thread::spawn(move || {
                let state = index_handle.state::<AppState>();
                let base = match state.data_dir.lock() {
                    Ok(dir) => dir.clone(),
                    Err(_) => return,
                };
                let db = match state.db.lock() {
                    Ok(db) => db,
                    Err(_) => return,
                };
                match db.rebuild_index(&base) {
                    Ok(count) => log::info!("Indexed {count} notes"),
                    Err(err) => log::warn!("Index rebuild failed: {err}"),
                }
            });

            log::info!("NoteFlow backend initialized successfully");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running NoteFlow application");
}
