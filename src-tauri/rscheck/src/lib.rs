extern crate self as noteflow_app_lib;
#[path = "../../src/error.rs"]
pub mod error;
#[path = "../../src/models.rs"]
pub mod models;
#[path = "../../src/storage.rs"]
pub mod storage;
#[path = "../../src/database.rs"]
pub mod database;
#[path = "../../src/attachments.rs"]
pub mod attachments;
#[path = "../../src/backup.rs"]
pub mod backup;
#[path = "../../src/config.rs"]
pub mod config;
#[path = "../../src/import_export.rs"]
pub mod import_export;
#[path = "../../src/query.rs"]
pub mod query;
#[path = "../../src/watcher.rs"]
pub mod watcher;
#[path = "../../src/commands.rs"]
pub mod commands;

#[path = "../../src/tests.rs"]
mod tests;
