use crate::error::{AppError, Result};
use crate::models::{AttachmentInfo, AttachmentStats};
use crate::storage::list_notes;
use chrono::{DateTime, Utc};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

fn get_mime_type(ext: &str) -> String {
    match ext.to_lowercase().as_str() {
        "png" => "image/png".to_string(),
        "jpg" | "jpeg" => "image/jpeg".to_string(),
        "gif" => "image/gif".to_string(),
        "svg" => "image/svg+xml".to_string(),
        "webp" => "image/webp".to_string(),
        "pdf" => "application/pdf".to_string(),
        "txt" => "text/plain".to_string(),
        "md" => "text/markdown".to_string(),
        "json" => "application/json".to_string(),
        "zip" => "application/zip".to_string(),
        "mp3" => "audio/mpeg".to_string(),
        "mp4" => "video/mp4".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}

pub fn add_attachment(base: &Path, note_id: &str, source: &Path) -> Result<String> {
    if !source.exists() {
        return Err(AppError::NotFound(format!("Source attachment file not found: {}", source.display())));
    }

    let file_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::Validation("Invalid file name".to_string()))?;

    let note_att_dir = if !note_id.trim().is_empty() {
        base.join("attachments").join(note_id.trim())
    } else {
        base.join("attachments")
    };
    fs::create_dir_all(&note_att_dir)?;

    let target = note_att_dir.join(file_name);
    fs::copy(source, &target)?;

    // Return relative path
    let rel_path = if !note_id.trim().is_empty() {
        format!("attachments/{}/{}", note_id.trim(), file_name)
    } else {
        format!("attachments/{}", file_name)
    };

    Ok(rel_path)
}

pub fn list_attachments(base: &Path, note_id: &str) -> Result<Vec<AttachmentInfo>> {
    let mut list = Vec::new();
    let att_dir = if !note_id.trim().is_empty() {
        base.join("attachments").join(note_id.trim())
    } else {
        base.join("attachments")
    };

    if !att_dir.exists() {
        return Ok(list);
    }

    for entry in WalkDir::new(&att_dir).min_depth(1).into_iter().filter_map(|e| e.ok()) {
        if entry.path().is_file() {
            let path = entry.path();
            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
            let metadata = fs::metadata(path)?;
            let size = metadata.len();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            let mime_type = get_mime_type(ext);
            let created: DateTime<Utc> = metadata
                .created()
                .or_else(|_| metadata.modified())
                .map(|t| DateTime::<Utc>::from(t))
                .unwrap_or_else(|_| Utc::now());

            let rel_path = path.strip_prefix(base).unwrap_or(path).to_string_lossy().to_string();

            list.push(AttachmentInfo {
                filename,
                path: rel_path.replace('\\', "/"),
                size,
                mime_type,
                note_id: if note_id.is_empty() { None } else { Some(note_id.to_string()) },
                created,
            });
        }
    }

    Ok(list)
}

pub fn delete_attachment(base: &Path, note_id: &str, filename: &str) -> Result<()> {
    let candidate = if !note_id.trim().is_empty() {
        base.join("attachments").join(note_id.trim()).join(filename)
    } else {
        base.join("attachments").join(filename)
    };

    if candidate.exists() {
        fs::remove_file(candidate)?;
        return Ok(());
    }

    // Try finding anywhere under attachments/
    for entry in WalkDir::new(base.join("attachments")).into_iter().filter_map(|e| e.ok()) {
        if entry.path().is_file() && entry.file_name().to_string_lossy() == filename {
            fs::remove_file(entry.path())?;
            return Ok(());
        }
    }

    Err(AppError::NotFound(format!("Attachment {} not found", filename)))
}

pub fn get_unused_attachments(base: &Path) -> Result<Vec<AttachmentInfo>> {
    let attachments_dir = base.join("attachments");
    if !attachments_dir.exists() {
        return Ok(Vec::new());
    }

    let notes = list_notes(base)?;
    let mut unused = Vec::new();

    for entry in WalkDir::new(&attachments_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.path().is_file() {
            let path = entry.path();
            let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            let rel_path = path.strip_prefix(base).unwrap_or(path).to_string_lossy().replace('\\', "/");

            let is_used = notes.iter().any(|note| {
                note.content.contains(filename) || note.content.contains(&rel_path)
            });

            if !is_used {
                let metadata = fs::metadata(path)?;
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                let created: DateTime<Utc> = metadata
                    .created()
                    .or_else(|_| metadata.modified())
                    .map(|t| DateTime::<Utc>::from(t))
                    .unwrap_or_else(|_| Utc::now());

                unused.push(AttachmentInfo {
                    filename: filename.to_string(),
                    path: rel_path,
                    size: metadata.len(),
                    mime_type: get_mime_type(ext),
                    note_id: None,
                    created,
                });
            }
        }
    }

    Ok(unused)
}

pub fn get_attachment_stats(base: &Path) -> Result<AttachmentStats> {
    let attachments_dir = base.join("attachments");
    if !attachments_dir.exists() {
        return Ok(AttachmentStats::default());
    }

    let mut total_count = 0;
    let mut total_size_bytes = 0;

    for entry in WalkDir::new(attachments_dir).into_iter().filter_map(|e| e.ok()) {
        if entry.path().is_file() {
            total_count += 1;
            if let Ok(meta) = entry.metadata() {
                total_size_bytes += meta.len();
            }
        }
    }

    Ok(AttachmentStats {
        total_count,
        total_size_bytes,
    })
}

fn to_base64(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };

        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push(CHARSET[(triple >> 18) & 0x3F] as char);
        out.push(CHARSET[(triple >> 12) & 0x3F] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[(triple >> 6) & 0x3F] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[triple & 0x3F] as char);
        } else {
            out.push('=');
        }
    }
    out
}

pub fn save_attachment_bytes(
    base: &Path,
    note_id: &str,
    filename: &str,
    data: &[u8],
) -> Result<AttachmentInfo> {
    let note_att_dir = if !note_id.trim().is_empty() {
        base.join("attachments").join(note_id.trim())
    } else {
        base.join("attachments")
    };
    fs::create_dir_all(&note_att_dir)?;

    let path_obj = Path::new(filename);
    let stem = path_obj.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = path_obj.extension().and_then(|e| e.to_str()).unwrap_or("");

    let mut target_filename = filename.to_string();
    let mut target_path = note_att_dir.join(&target_filename);
    let mut counter = 1;

    while target_path.exists() {
        target_filename = if ext.is_empty() {
            format!("{}_{}", stem, counter)
        } else {
            format!("{}_{}.{}", stem, counter, ext)
        };
        target_path = note_att_dir.join(&target_filename);
        counter += 1;
    }

    fs::write(&target_path, data)?;

    let size = data.len() as u64;
    let mime_type = get_mime_type(ext);
    let created = Utc::now();
    let rel_path = target_path
        .strip_prefix(base)
        .unwrap_or(&target_path)
        .to_string_lossy()
        .replace('\\', "/");

    Ok(AttachmentInfo {
        filename: target_filename,
        path: rel_path,
        size,
        mime_type,
        note_id: if note_id.trim().is_empty() { None } else { Some(note_id.to_string()) },
        created,
    })
}

pub fn read_attachment_base64(base: &Path, rel_path: &str) -> Result<String> {
    let normalized = rel_path.trim_start_matches('/').trim_start_matches('\\');
    let full_path = base.join(normalized);

    if !full_path.exists() {
        return Err(AppError::NotFound(format!("Attachment not found at: {}", full_path.display())));
    }

    let bytes = fs::read(&full_path)?;
    let ext = full_path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let mime = get_mime_type(ext);

    Ok(format!("data:{};base64,{}", mime, to_base64(&bytes)))
}

pub fn open_attachment(base: &Path, rel_path: &str) -> Result<()> {
    let normalized = rel_path.trim_start_matches('/').trim_start_matches('\\');
    let full_path = base.join(normalized);

    if !full_path.exists() {
        return Err(AppError::NotFound(format!("Attachment not found at: {}", full_path.display())));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &full_path.to_string_lossy()])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| AppError::General(format!("Failed to open attachment: {}", e)))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(&full_path)
            .spawn()
            .map_err(|e| AppError::General(format!("Failed to open attachment: {}", e)))?;
    }

    Ok(())
}

pub fn open_attachment_folder(base: &Path, note_id: Option<&str>) -> Result<()> {
    let target_dir = match note_id {
        Some(id) if !id.trim().is_empty() => base.join("attachments").join(id.trim()),
        _ => base.join("attachments"),
    };
    fs::create_dir_all(&target_dir)?;

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| AppError::General(format!("Failed to open folder: {}", e)))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("xdg-open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| AppError::General(format!("Failed to open folder: {}", e)))?;
    }

    Ok(())
}
