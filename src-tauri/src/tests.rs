#[cfg(test)]
mod core_verification_tests {
    use noteflow_app_lib::database::Database;
    use noteflow_app_lib::models::{NoteFile, NoteMeta};
    use noteflow_app_lib::query::QueryParser;
    use noteflow_app_lib::storage::{
        create_note, delete_note, ensure_vault_structure, extract_tags, extract_title,
        list_notes, list_trash, read_note, restore_note, update_note,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_vault_structure_initialization() {
        let dir = tempdir().expect("tempdir");
        let base = dir.path();
        ensure_vault_structure(base).expect("ensure_vault_structure");

        assert!(base.join("notes").exists());
        assert!(base.join("attachments").exists());
        assert!(base.join("drafts").exists());
        assert!(base.join("trash").exists());
        assert!(base.join("backups").exists());
        assert!(base.join(".noteflow").exists());
    }

    #[test]
    fn test_markdown_storage_and_front_matter_preservation() {
        let dir = tempdir().expect("tempdir");
        let base = dir.path();
        ensure_vault_structure(base).expect("ensure_vault_structure");

        let mut meta = NoteMeta::default();
        meta.extra = serde_json::json!({
            "custom_author": "Alice",
            "custom_rating": 5,
            "nested": {
                "key": "value"
            }
        });

        let content = "# Test Note Header\n\nThis is content with #rust and #dev tags.\n\n```rust\n# Not a tag in code block\n```\n";
        let note_path = create_note(base, content, &meta).expect("create_note");
        assert!(note_path.exists());

        // Read back and parse
        let note = read_note(&note_path).expect("read_note");
        assert_eq!(note.meta.id, meta.id);
        assert_eq!(note.content, content);

        // Verify unknown/extra fields preserved
        assert_eq!(
            note.meta.extra.get("custom_author").and_then(|v| v.as_str()),
            Some("Alice")
        );
        assert_eq!(
            note.meta.extra.get("custom_rating").and_then(|v| v.as_i64()),
            Some(5)
        );

        // Update note
        let updated_content = "# Updated Header\n\nUpdated text.";
        update_note(base, &meta.id.to_string(), updated_content, &note.meta).expect("update_note");
        let updated_note = read_note(&note_path).expect("read_note after update");
        assert_eq!(updated_note.content, updated_content);
    }

    #[test]
    fn test_tag_extraction_avoids_code_and_urls() {
        let text = r#"
# Heading
This is a note with #valid_tag and #project/nested-tag.
Here is an inline code `#inline_not_tag` and a URL: https://example.com/#section.

```python
# python comment not a tag
x = 10
```

Another line with #productivity tag.
"#;
        let tags = extract_tags(text);
        assert!(tags.contains(&"valid_tag".to_string()));
        assert!(tags.contains(&"project/nested-tag".to_string()));
        assert!(tags.contains(&"productivity".to_string()));
        assert!(!tags.contains(&"inline_not_tag".to_string()));
        assert!(!tags.contains(&"section".to_string()));
        assert!(!tags.contains(&"python".to_string()));
    }

    #[test]
    fn test_title_extraction() {
        let text = "Intro without title\n\n# Real Title\n\nBody content";
        let title = extract_title(text);
        assert_eq!(title, Some("Real Title".to_string()));
    }

    #[test]
    fn test_trash_and_restore() {
        let dir = tempdir().expect("tempdir");
        let base = dir.path();
        ensure_vault_structure(base).expect("ensure_vault_structure");

        let meta = NoteMeta::default();
        let note_path = create_note(base, "To be deleted", &meta).expect("create_note");
        assert!(note_path.exists());

        // Move to trash
        delete_note(base, &meta.id.to_string()).expect("delete_note");
        assert!(!note_path.exists());
        let trashed = list_trash(base).expect("list_trash");
        assert_eq!(trashed.len(), 1);
        assert_eq!(trashed[0].meta.id, meta.id);

        // Restore
        restore_note(base, &meta.id.to_string()).expect("restore_note");
        assert!(note_path.exists());
        let trashed_after = list_trash(base).expect("list_trash");
        assert_eq!(trashed_after.len(), 0);
    }

    #[test]
    fn test_sqlite_fts5_and_index_rebuild() {
        let dir = tempdir().expect("tempdir");
        let base = dir.path();
        ensure_vault_structure(base).expect("ensure_vault_structure");

        let db_path = base.join(".noteflow").join("index.sqlite");
        let db = Database::new(&db_path).expect("Database::new");

        // Create 3 notes
        for i in 1..=3 {
            let mut meta = NoteMeta::default();
            if i == 1 {
                meta.pinned = true;
            }
            let content = format!("# Note {}\nContent discussing rust and markdown #tag{} keyword{}", i, i, i);
            let note_path = create_note(base, &content, &meta).expect("create_note");
            let note = read_note(&note_path).expect("read_note");
            db.index_note(&note).expect("index_note");
        }

        // Full text search
        let results = db.search("discussing", 10, 0).expect("search");
        assert_eq!(results.len(), 3);

        let specific = db.search("keyword2", 10, 0).expect("search keyword2");
        assert_eq!(specific.len(), 1);

        // Test stats
        let stats = db.get_stats().expect("get_stats");
        assert_eq!(stats.total, 3);
        assert_eq!(stats.pinned, 1);

        // Now DELETE the SQLite file to test rebuilding from Markdown files
        drop(db);
        fs::remove_file(&db_path).expect("remove db");
        assert!(!db_path.exists());

        // Rebuild index from .md files
        let new_db = Database::new(&db_path).expect("Database::new fresh");
        let count = new_db.rebuild_index(base).expect("rebuild_index");
        assert_eq!(count, 3);

        // Verify search works immediately after index rebuild
        let rebuilt_results = new_db.search("discussing", 10, 0).expect("search after rebuild");
        assert_eq!(rebuilt_results.len(), 3);
    }

    #[test]
    fn test_query_expression_parser() {
        let expr = QueryParser::parse("pinned && tag in [\"work\", \"dev\"]").expect("QueryParser::parse");

        let mut meta = NoteMeta::default();
        meta.pinned = true;
        let content = "Some content with #work tag".to_string();
        let note = NoteFile {
            meta: meta.clone(),
            content,
            file_path: std::path::PathBuf::from("test.md"),
        };

        assert!(expr.matches(&note));

        let mut unpinned_meta = meta;
        unpinned_meta.pinned = false;
        let unpinned_note = NoteFile {
            meta: unpinned_meta,
            content: "Some content with #work tag".to_string(),
            file_path: std::path::PathBuf::from("test.md"),
        };

        assert!(!expr.matches(&unpinned_note));
    }

    #[test]
    fn test_backup_and_restore_vault() {
        use noteflow_app_lib::backup::{create_backup, restore_backup};

        let src_dir = tempdir().expect("tempdir");
        let base = src_dir.path();
        ensure_vault_structure(base).expect("ensure_vault_structure");

        let meta = NoteMeta::default();
        create_note(base, "# Important Note to Backup\nBack me up!", &meta).expect("create_note");

        let backup_zip = create_backup(base).expect("create_backup");
        assert!(backup_zip.exists());
        assert!(backup_zip.metadata().expect("meta").len() > 0);

        let restore_dir = tempdir().expect("tempdir");
        let restore_base = restore_dir.path();
        ensure_vault_structure(restore_base).expect("ensure_vault_structure");

        let report = restore_backup(restore_base, &backup_zip).expect("restore_backup");
        assert!(report.restored_notes >= 1);
        let restored_notes = list_notes(restore_base).expect("list_notes");
        assert_eq!(restored_notes.len(), 1);
        assert_eq!(restored_notes[0].meta.id, meta.id);
    }

    #[test]
    fn test_attachments_and_orphan_detection() {
        use noteflow_app_lib::attachments::{add_attachment, get_unused_attachments, list_attachments};
        use std::io::Write;

        let dir = tempdir().expect("tempdir");
        let base = dir.path();
        ensure_vault_structure(base).expect("ensure_vault_structure");

        // Create sample file to attach
        let sample_file_path = dir.path().join("test_image.png");
        let mut sample_file = fs::File::create(&sample_file_path).expect("create sample file");
        sample_file.write_all(b"fake_png_data").expect("write");

        let meta = NoteMeta::default();
        let rel_path = add_attachment(base, &meta.id.to_string(), &sample_file_path).expect("add_attachment");
        assert!(rel_path.starts_with("attachments/"));

        let attachments = list_attachments(base, &meta.id.to_string()).expect("list_attachments");
        assert_eq!(attachments.len(), 1);
        assert_eq!(attachments[0].filename, "test_image.png");

        // The note does not reference the attachment yet -> should be unused
        create_note(base, "# Note without image ref", &meta).expect("create_note");
        let unused = get_unused_attachments(base).expect("get_unused_attachments");
        assert_eq!(unused.len(), 1);

        // Update note to reference the image -> should no longer be unused
        let content_with_ref = format!("# Note\n![test]({})", rel_path);
        update_note(base, &meta.id.to_string(), &content_with_ref, &meta).expect("update");
        let unused_after = get_unused_attachments(base).expect("get_unused_attachments after ref");
        assert_eq!(unused_after.len(), 0);
    }

    #[test]
    fn test_import_markdown_folder() {
        use noteflow_app_lib::import_export::import_markdown_folder;
        use std::io::Write;

        let vault_dir = tempdir().expect("vault_dir");
        let base = vault_dir.path();
        ensure_vault_structure(base).expect("ensure_vault_structure");

        // Create an external folder with 2 markdown files
        let external_dir = tempdir().expect("external_dir");
        let file1 = external_dir.path().join("external_1.md");
        let mut f1 = fs::File::create(&file1).expect("create f1");
        f1.write_all(b"# Imported Note 1\nSome #imported tag").expect("write f1");

        let file2 = external_dir.path().join("external_2.md");
        let mut f2 = fs::File::create(&file2).expect("create f2");
        f2.write_all(b"# Imported Note 2\nAnother note").expect("write f2");

        let report = import_markdown_folder(base, external_dir.path()).expect("import");
        assert_eq!(report.imported_count, 2);

        let notes = list_notes(base).expect("list_notes");
        assert_eq!(notes.len(), 2);
    }
}
