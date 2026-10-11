use crate::error::{AppError, Result};
use crate::models::{AppConfig, BackupInfo, RestoreReport};
use chrono::{DateTime, Duration, Utc};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

pub fn create_backup(base: &Path) -> Result<PathBuf> {
    let backups_dir = base.join("backups");
    fs::create_dir_all(&backups_dir)?;

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_filename = format!("backup_{}.zip", timestamp);
    let backup_path = backups_dir.join(&backup_filename);

    let file = File::create(&backup_path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let include_dirs = ["notes", "attachments", "drafts", ".noteflow"];

    for dir_name in &include_dirs {
        let dir_path = base.join(dir_name);
        if !dir_path.exists() {
            continue;
        }

        for entry in WalkDir::new(&dir_path).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            let rel_path = path.strip_prefix(base).unwrap_or(path);
            let name_str = rel_path.to_string_lossy().replace('\\', "/");

            if path.is_dir() {
                zip.add_directory(format!("{}/", name_str), options)?;
            } else if path.is_file() {
                zip.start_file(name_str, options)?;
                let mut f = File::open(path)?;
                let mut buffer = Vec::new();
                f.read_to_end(&mut buffer)?;
                zip.write_all(&buffer)?;
            }
        }
    }

    zip.finish()?;
    Ok(backup_path)
}

pub fn restore_backup(base: &Path, backup_path: &Path) -> Result<RestoreReport> {
    if !backup_path.exists() {
        return Err(AppError::NotFound(format!("Backup archive not found: {}", backup_path.display())));
    }

    let file = File::open(backup_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut restored_notes = 0;
    let mut restored_attachments = 0;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let raw_name = file.name();

        // Security check against directory traversal
        let normalized = raw_name.replace('\\', "/");
        if normalized.contains("..") {
            continue;
        }

        let outpath = base.join(&normalized);

        if file.is_dir() {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                fs::create_dir_all(p)?;
            }
            let mut outfile = File::create(&outpath)?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer)?;
            outfile.write_all(&buffer)?;

            if normalized.starts_with("notes/") && normalized.ends_with(".md") {
                restored_notes += 1;
            } else if normalized.starts_with("attachments/") {
                restored_attachments += 1;
            }
        }
    }

    Ok(RestoreReport {
        restored_notes,
        restored_attachments,
        message: format!("Successfully restored {} notes and {} attachments.", restored_notes, restored_attachments),
    })
}

pub fn list_backups(base: &Path) -> Result<Vec<BackupInfo>> {
    let backups_dir = base.join("backups");
    if !backups_dir.exists() {
        return Ok(Vec::new());
    }

    let mut backups = Vec::new();
    for entry in fs::read_dir(backups_dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("zip") {
            let metadata = entry.metadata()?;
            let created: DateTime<Utc> = metadata
                .created()
                .or_else(|_| metadata.modified())
                .map(DateTime::<Utc>::from)
                .unwrap_or_else(|_| Utc::now());

            backups.push(BackupInfo {
                filename: entry.file_name().to_string_lossy().to_string(),
                size: metadata.len(),
                created_at: created,
            });
        }
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

pub fn auto_backup_if_needed(base: &Path, config: &AppConfig) -> Result<Option<PathBuf>> {
    if !config.auto_backup {
        return Ok(None);
    }

    let backups = list_backups(base)?;
    let should_backup = match backups.first() {
        None => true,
        Some(latest) => {
            let hours_ago = Utc::now() - latest.created_at;
            hours_ago >= Duration::hours(config.backup_interval_hours as i64)
        }
    };

    if should_backup {
        let path = create_backup(base)?;

        // Prune old backups if count > max_backups
        let updated_backups = list_backups(base)?;
        if updated_backups.len() > config.max_backups as usize {
            for old in &updated_backups[config.max_backups as usize..] {
                let old_path = base.join("backups").join(&old.filename);
                let _ = fs::remove_file(old_path);
            }
        }

        Ok(Some(path))
    } else {
        Ok(None)
    }
}
