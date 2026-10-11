use crate::error::{AppError, Result};
use crate::models::{ImportReport, NoteMeta};
use crate::storage::{create_note, extract_title, find_note_path_by_id, parse_front_matter, read_note};
use chrono::Utc;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

pub fn import_markdown_folder(base: &Path, source: &Path) -> Result<ImportReport> {
    if !source.exists() || !source.is_dir() {
        return Err(AppError::NotFound(format!("Import source directory not found: {}", source.display())));
    }

    let mut report = ImportReport::default();

    for entry in WalkDir::new(source).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
            match fs::read_to_string(path) {
                Ok(content) => {
                    let (mut meta, body) = match parse_front_matter(&content) {
                        Ok((m, b)) => (m, b),
                        Err(_) => (NoteMeta::default(), content.clone()),
                    };

                    // If meta id is nil/empty or already exists, generate a new id
                    if meta.id.is_nil() {
                        meta.id = Uuid::new_v4();
                    }
                    if meta.created_at == meta.updated_at && meta.created_at == Utc::now() {
                        if let Ok(metadata) = fs::metadata(path) {
                            if let Ok(created) = metadata.created().or_else(|_| metadata.modified()) {
                                meta.created_at = chrono::DateTime::<Utc>::from(created);
                                meta.updated_at = meta.created_at;
                            }
                        }
                    }

                    match create_note(base, &body, &meta) {
                        Ok(_) => report.imported_count += 1,
                        Err(e) => {
                            report.skipped_count += 1;
                            report.errors.push(format!("{}: {}", path.display(), e));
                        }
                    }
                }
                Err(e) => {
                    report.skipped_count += 1;
                    report.errors.push(format!("{}: {}", path.display(), e));
                }
            }
        }
    }

    Ok(report)
}

pub fn export_notes_zip(base: &Path, note_ids: &[String], output: &Path) -> Result<()> {
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }

    let file = File::create(output)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for id in note_ids {
        if let Some(note_path) = find_note_path_by_id(base, id) {
            let note = read_note(&note_path)?;
            let title = extract_title(&note.content)
                .unwrap_or_else(|| id.clone())
                .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");

            let filename = format!("{}_{}.md", title, id);
            zip.start_file(filename, options)?;

            let raw_content = fs::read(&note_path)?;
            zip.write_all(&raw_content)?;

            // Check if note references attachments and bundle them
            let att_dir = base.join("attachments").join(id);
            if att_dir.exists() {
                for entry in WalkDir::new(&att_dir).into_iter().filter_map(|e| e.ok()) {
                    if entry.path().is_file() {
                        let rel = entry.path().strip_prefix(base).unwrap_or(entry.path());
                        let name_in_zip = rel.to_string_lossy().replace('\\', "/");
                        zip.start_file(name_in_zip, options)?;
                        let data = fs::read(entry.path())?;
                        zip.write_all(&data)?;
                    }
                }
            }
        }
    }

    zip.finish()?;
    Ok(())
}

fn markdown_line_to_html(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.starts_with("# ") {
        format!("<h1>{}</h1>", html_escape(&trimmed[2..]))
    } else if trimmed.starts_with("## ") {
        format!("<h2>{}</h2>", html_escape(&trimmed[3..]))
    } else if trimmed.starts_with("### ") {
        format!("<h3>{}</h3>", html_escape(&trimmed[4..]))
    } else if trimmed.starts_with("- [ ] ") {
        format!("<li class=\"task\"><input type=\"checkbox\" disabled> {}</li>", html_escape(&trimmed[6..]))
    } else if trimmed.starts_with("- [x] ") || trimmed.starts_with("- [X] ") {
        format!("<li class=\"task\"><input type=\"checkbox\" checked disabled> <del>{}</del></li>", html_escape(&trimmed[6..]))
    } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
        format!("<li>{}</li>", html_escape(&trimmed[2..]))
    } else if trimmed.starts_with("> ") {
        format!("<blockquote>{}</blockquote>", html_escape(&trimmed[2..]))
    } else if trimmed.is_empty() {
        "<p></p>".to_string()
    } else {
        format!("<p>{}</p>", html_escape(line))
    }
}

fn html_escape(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub fn export_note_html(base: &Path, note_id: &str) -> Result<String> {
    let note_path = find_note_path_by_id(base, note_id)
        .ok_or_else(|| AppError::NotFound(format!("Note {} not found", note_id)))?;

    let note = read_note(&note_path)?;
    let title = extract_title(&note.content).unwrap_or_else(|| "Note".to_string());

    let mut body_html = String::new();
    let mut in_code_block = false;
    let mut code_buffer = String::new();

    for line in note.content.lines() {
        if line.trim().starts_with("```") {
            if in_code_block {
                body_html.push_str(&format!("<pre><code>{}</code></pre>\n", html_escape(&code_buffer)));
                code_buffer.clear();
                in_code_block = false;
            } else {
                in_code_block = true;
            }
            continue;
        }

        if in_code_block {
            code_buffer.push_str(line);
            code_buffer.push('\n');
        } else {
            body_html.push_str(&markdown_line_to_html(line));
            body_html.push('\n');
        }
    }

    if in_code_block && !code_buffer.is_empty() {
        body_html.push_str(&format!("<pre><code>{}</code></pre>\n", html_escape(&code_buffer)));
    }

    let html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #24292e;
            max-width: 800px;
            margin: 40px auto;
            padding: 0 20px;
        }}
        h1, h2, h3 {{ color: #1a1f2c; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }}
        blockquote {{ border-left: 4px solid #dfe2e5; color: #6a737d; padding: 0 1em; margin: 0; }}
        pre {{ background: #f6f8fa; padding: 16px; border-radius: 6px; overflow: auto; }}
        code {{ font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace; }}
        li.task {{ list-style-type: none; }}
        .meta {{ font-size: 0.85em; color: #586069; margin-bottom: 2em; }}
    </style>
</head>
<body>
    <div class="meta">
        <strong>Created:</strong> {created} | <strong>Updated:</strong> {updated}
    </div>
    {content}
</body>
</html>"#,
        title = html_escape(&title),
        created = note.meta.created_at.to_rfc3339(),
        updated = note.meta.updated_at.to_rfc3339(),
        content = body_html,
    );

    Ok(html)
}
