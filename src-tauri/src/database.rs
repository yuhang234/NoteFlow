use crate::error::Result;
use crate::models::{NoteFile, NoteFilter, NoteStats, SearchResult};
use crate::storage::{extract_tags, extract_title, list_notes};
use chrono::{Duration, Utc};
use rusqlite::{params, Connection};
use std::path::Path;

/// Escape `LIKE` wildcards so user input is matched literally.
fn escape_like(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        if matches!(ch, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn find_subslice(haystack: &[char], needle: &[char]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Build a plain-text snippet with `<mark>` around the first matched term.
///
/// The caller is responsible for rendering the markers safely (never as HTML).
fn make_snippet(content: &str, terms: &[String]) -> String {
    let flat = content.replace(['\n', '\r'], " ");
    let chars: Vec<char> = flat.chars().collect();
    let lowered: Vec<char> = flat.to_lowercase().chars().collect();
    // `to_lowercase` can change the character count (e.g. `İ`), so only trust it
    // when the mapping is length preserving.
    let haystack: &[char] = if lowered.len() == chars.len() {
        &lowered
    } else {
        &chars
    };

    for term in terms {
        let needle: Vec<char> = term.to_lowercase().chars().collect();
        if let Some(pos) = find_subslice(haystack, &needle) {
            let start = pos.saturating_sub(30);
            let match_end = (pos + needle.len()).min(chars.len());
            let end = (match_end + 40).min(chars.len());

            let mut snippet = String::new();
            if start > 0 {
                snippet.push('…');
            }
            snippet.extend(&chars[start..pos]);
            snippet.push_str("<mark>");
            snippet.extend(&chars[pos..match_end]);
            snippet.push_str("</mark>");
            snippet.extend(&chars[match_end..end]);
            if end < chars.len() {
                snippet.push('…');
            }
            return snippet;
        }
    }

    let mut fallback: String = chars.iter().take(80).collect();
    if chars.len() > 80 {
        fallback.push('…');
    }
    fallback
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        let db = Database { conn };
        db.init_schema()?;
        Ok(db)
    }

    pub fn init_schema(&self) -> Result<()> {
        // Older vaults used the `unicode61` tokenizer, which indexes whole
        // Chinese sentences as single tokens. Drop such an index so it is
        // recreated with `trigram` and rebuilt from disk on startup.
        if let Some(sql) = self.fts_table_sql() {
            if !sql.to_lowercase().contains("trigram") {
                self.conn.execute_batch("DROP TABLE IF EXISTS notes_fts;")?;
            }
        }

        self.conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS notes_meta (
                id TEXT PRIMARY KEY,
                note_type TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                archived INTEGER NOT NULL DEFAULT 0,
                workspace_id TEXT,
                parent_id TEXT,
                location_name TEXT,
                latitude REAL,
                longitude REAL,
                has_tasks INTEGER NOT NULL DEFAULT 0,
                has_incomplete_tasks INTEGER NOT NULL DEFAULT 0,
                has_links INTEGER NOT NULL DEFAULT 0,
                has_code INTEGER NOT NULL DEFAULT 0,
                has_attachments INTEGER NOT NULL DEFAULT 0,
                has_location INTEGER NOT NULL DEFAULT 0,
                file_path TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tags (
                note_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY (note_id, tag)
            );
            CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags (tag);
            CREATE INDEX IF NOT EXISTS idx_notes_meta_workspace ON notes_meta (workspace_id);
            CREATE INDEX IF NOT EXISTS idx_notes_meta_created ON notes_meta (created_at);
            CREATE INDEX IF NOT EXISTS idx_notes_meta_updated ON notes_meta (updated_at);

            CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY,
                note_id TEXT,
                filename TEXT NOT NULL,
                path TEXT NOT NULL,
                size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments (note_id);

            CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
                id UNINDEXED,
                title,
                content,
                tags,
                tokenize = 'trigram'
            );
            ",
        )?;
        Ok(())
    }

    /// Current `notes_fts` definition, used to detect tokenizer changes.
    fn fts_table_sql(&self) -> Option<String> {
        self.conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'notes_fts'",
                [],
                |row| row.get::<_, Option<String>>(0),
            )
            .ok()
            .flatten()
    }

    pub fn index_note(&self, note: &NoteFile) -> Result<()> {
        let id_str = note.meta.id.to_string();
        let title = extract_title(&note.content).unwrap_or_else(|| "Untitled".to_string());
        let tags = extract_tags(&note.content);
        let tags_str = tags.join(" ");

        let has_tasks = (note.content.contains("- [ ]")
            || note.content.contains("- [x]")
            || note.content.contains("- [X]")) as i32;
        let has_incomplete_tasks = note.content.contains("- [ ]") as i32;
        let has_links = (note.content.contains("http://")
            || note.content.contains("https://")
            || note.content.contains("](")
            || !note.meta.relations.is_empty()) as i32;
        let has_code = (note.content.contains("```") || note.content.contains('`')) as i32;
        let has_attachments = note.content.contains("![") as i32;
        let has_location = note.meta.location.is_some() as i32;

        let loc_name = note.meta.location.as_ref().map(|l| l.name.clone());
        let lat = note.meta.location.as_ref().map(|l| l.latitude);
        let lon = note.meta.location.as_ref().map(|l| l.longitude);

        let created_str = note.meta.created_at.to_rfc3339();
        let updated_str = note.meta.updated_at.to_rfc3339();
        let file_path_str = note.file_path.to_string_lossy().to_string();

        self.conn.execute(
            "
            INSERT INTO notes_meta (
                id, note_type, title, created_at, updated_at, pinned, archived,
                workspace_id, parent_id, location_name, latitude, longitude,
                has_tasks, has_incomplete_tasks, has_links, has_code,
                has_attachments, has_location, file_path
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
            ON CONFLICT(id) DO UPDATE SET
                note_type = excluded.note_type,
                title = excluded.title,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                pinned = excluded.pinned,
                archived = excluded.archived,
                workspace_id = excluded.workspace_id,
                parent_id = excluded.parent_id,
                location_name = excluded.location_name,
                latitude = excluded.latitude,
                longitude = excluded.longitude,
                has_tasks = excluded.has_tasks,
                has_incomplete_tasks = excluded.has_incomplete_tasks,
                has_links = excluded.has_links,
                has_code = excluded.has_code,
                has_attachments = excluded.has_attachments,
                has_location = excluded.has_location,
                file_path = excluded.file_path
            ",
            params![
                id_str,
                note.meta.note_type,
                title,
                created_str,
                updated_str,
                note.meta.pinned as i32,
                note.meta.archived as i32,
                note.meta.workspace_id,
                note.meta.parent_id,
                loc_name,
                lat,
                lon,
                has_tasks,
                has_incomplete_tasks,
                has_links,
                has_code,
                has_attachments,
                has_location,
                file_path_str,
            ],
        )?;

        // Update tags
        self.conn.execute("DELETE FROM tags WHERE note_id = ?", params![id_str])?;
        let mut insert_tag = self.conn.prepare("INSERT OR IGNORE INTO tags (note_id, tag) VALUES (?, ?)")?;
        for tag in tags {
            insert_tag.execute(params![id_str, tag])?;
        }

        // Update FTS
        self.conn.execute("DELETE FROM notes_fts WHERE id = ?", params![id_str])?;
        self.conn.execute(
            "INSERT INTO notes_fts (id, title, content, tags) VALUES (?, ?, ?, ?)",
            params![id_str, title, note.content, tags_str],
        )?;

        Ok(())
    }

    /// Resolve the on-disk path of a note straight from the index.
    ///
    /// Note file names are timestamp based (`YYYYMMDD_HHMMSS.md`), so the path
    /// cannot be derived from the id: without this lookup every save would fall
    /// back to a full vault scan.
    pub fn note_path(&self, id: &str) -> Option<std::path::PathBuf> {
        self.conn
            .query_row(
                "SELECT file_path FROM notes_meta WHERE id = ?1",
                params![id],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .filter(|p| !p.is_empty())
            .map(std::path::PathBuf::from)
    }

    pub fn remove_note(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM notes_meta WHERE id = ?", params![id])?;
        self.conn.execute("DELETE FROM tags WHERE note_id = ?", params![id])?;
        self.conn.execute("DELETE FROM notes_fts WHERE id = ?", params![id])?;
        Ok(())
    }

    pub fn rebuild_index(&self, base: &Path) -> Result<usize> {
        let notes = list_notes(base)?;
        self.conn.execute_batch("
            DELETE FROM notes_meta;
            DELETE FROM tags;
            DELETE FROM notes_fts;
        ")?;

        let mut count = 0;
        for note in &notes {
            if self.index_note(note).is_ok() {
                count += 1;
            }
        }
        Ok(count)
    }

    /// Full-text search over titles, bodies and tags.
    ///
    /// The index uses the `trigram` tokenizer so that Chinese (and any other
    /// script without spaces) can be matched by substring. Trigrams need at
    /// least three characters, therefore shorter queries fall back to a
    /// `LIKE` scan over the index table.
    pub fn search(&self, query: &str, limit: u32, offset: u32) -> Result<Vec<SearchResult>> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let terms: Vec<String> = trimmed.split_whitespace().map(|t| t.to_string()).collect();
        let can_use_trigram = terms.iter().all(|term| term.chars().count() >= 3);

        let rows = if can_use_trigram {
            self.search_trigram(&terms, limit, offset)
                .or_else(|_| self.search_like(&terms, limit, offset))?
        } else {
            self.search_like(&terms, limit, offset)?
        };

        let mut results = Vec::with_capacity(rows.len());
        for (note_id, title, content, created_at) in rows {
            let snippet = make_snippet(&content, &terms);
            let mut tag_stmt = self
                .conn
                .prepare("SELECT tag FROM tags WHERE note_id = ? ORDER BY tag")?;
            let tags = tag_stmt
                .query_map(params![note_id], |row| row.get::<_, String>(0))?
                .filter_map(|t| t.ok())
                .collect();

            results.push(SearchResult {
                note_id,
                title,
                snippet,
                score: 0.0,
                created_at,
                tags,
            });
        }

        Ok(results)
    }

    fn search_trigram(
        &self,
        terms: &[String],
        limit: u32,
        offset: u32,
    ) -> Result<Vec<(String, String, String, String)>> {
        let fts_query = terms
            .iter()
            .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" ");

        let sql = "
            SELECT notes_fts.id, notes_fts.title, notes_fts.content, notes_meta.created_at,
                   bm25(notes_fts) AS rank
            FROM notes_fts
            JOIN notes_meta ON notes_fts.id = notes_meta.id
            WHERE notes_fts MATCH ?1
            ORDER BY rank
            LIMIT ?2 OFFSET ?3
        ";

        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params![fts_query, limit, offset], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    fn search_like(
        &self,
        terms: &[String],
        limit: u32,
        offset: u32,
    ) -> Result<Vec<(String, String, String, String)>> {
        if terms.is_empty() {
            return Ok(Vec::new());
        }

        let mut values: Vec<rusqlite::types::Value> = Vec::new();
        let mut clauses = Vec::new();
        for term in terms {
            values.push(rusqlite::types::Value::Text(format!(
                "%{}%",
                escape_like(term)
            )));
            let idx = values.len();
            clauses.push(format!(
                "(notes_fts.title LIKE ?{idx} ESCAPE '\\' OR notes_fts.content LIKE ?{idx} ESCAPE '\\' OR notes_fts.tags LIKE ?{idx} ESCAPE '\\')"
            ));
        }

        values.push(rusqlite::types::Value::Integer(limit as i64));
        let limit_idx = values.len();
        values.push(rusqlite::types::Value::Integer(offset as i64));
        let offset_idx = values.len();

        let sql = format!(
            "SELECT notes_fts.id, notes_fts.title, notes_fts.content, notes_meta.created_at
             FROM notes_fts
             JOIN notes_meta ON notes_fts.id = notes_meta.id
             WHERE {}
             ORDER BY notes_meta.updated_at DESC
             LIMIT ?{} OFFSET ?{}",
            clauses.join(" AND "),
            limit_idx,
            offset_idx
        );

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(values), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn get_all_tags(&self) -> Result<Vec<(String, u32)>> {
        let mut stmt = self.conn.prepare(
            "SELECT tag, COUNT(*) as count FROM tags GROUP BY tag ORDER BY count DESC, tag ASC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;

        let mut tags = Vec::new();
        for r in rows {
            tags.push(r?);
        }
        Ok(tags)
    }

    pub fn get_stats(&self) -> Result<NoteStats> {
        let now = Utc::now();
        let seven_days_ago = (now - Duration::days(7)).to_rfc3339();

        let total: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE archived = 0",
            [],
            |r| r.get(0),
        ).unwrap_or(0);

        let recent_created: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE created_at >= ? AND archived = 0",
            params![seven_days_ago],
            |r| r.get(0),
        ).unwrap_or(0);

        let recent_modified: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE updated_at >= ? AND archived = 0",
            params![seven_days_ago],
            |r| r.get(0),
        ).unwrap_or(0);

        let pinned: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE pinned = 1 AND archived = 0",
            [],
            |r| r.get(0),
        ).unwrap_or(0);

        let archived: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE archived = 1",
            [],
            |r| r.get(0),
        ).unwrap_or(0);

        let with_attachments: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE has_attachments = 1 AND archived = 0",
            [],
            |r| r.get(0),
        ).unwrap_or(0);

        let with_code: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE has_code = 1 AND archived = 0",
            [],
            |r| r.get(0),
        ).unwrap_or(0);

        let with_links: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE has_links = 1 AND archived = 0",
            [],
            |r| r.get(0),
        ).unwrap_or(0);

        let with_location: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE has_location = 1 AND archived = 0",
            [],
            |r| r.get(0),
        ).unwrap_or(0);

        let with_tasks: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE has_tasks = 1 AND archived = 0",
            [],
            |r| r.get(0),
        ).unwrap_or(0);

        let incomplete_tasks: u32 = self.conn.query_row(
            "SELECT COUNT(*) FROM notes_meta WHERE has_incomplete_tasks = 1 AND archived = 0",
            [],
            |r| r.get(0),
        ).unwrap_or(0);

        Ok(NoteStats {
            total,
            recent_created,
            recent_modified,
            pinned,
            archived,
            with_attachments,
            with_code,
            with_links,
            with_location,
            with_tasks,
            incomplete_tasks,
        })
    }

    pub fn get_notes_by_date(&self, date: &str) -> Result<Vec<String>> {
        let pattern = format!("{}%", date.trim());
        let mut stmt = self.conn.prepare(
            "SELECT id FROM notes_meta WHERE (created_at LIKE ?1 OR updated_at LIKE ?1) AND archived = 0 ORDER BY updated_at DESC"
        )?;
        let rows = stmt.query_map(params![pattern], |row| row.get(0))?;
        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_notes_count_by_month(&self, year: i32, month: u32) -> Result<Vec<(u32, u32)>> {
        let prefix = format!("{:04}-{:02}%", year, month);
        let mut stmt = self.conn.prepare(
            "SELECT CAST(substr(created_at, 9, 2) AS INTEGER) as day, COUNT(*) as count
             FROM notes_meta
             WHERE created_at LIKE ? AND archived = 0
             GROUP BY day
             ORDER BY day ASC"
        )?;
        let rows = stmt.query_map(params![prefix], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?;

        let mut counts = Vec::new();
        for r in rows {
            counts.push(r?);
        }
        Ok(counts)
    }

    pub fn filter_notes(&self, filter: &NoteFilter) -> Result<Vec<String>> {
        let mut query = "SELECT DISTINCT notes_meta.id FROM notes_meta".to_string();
        let mut conditions = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(ref tag) = filter.tag {
            query.push_str(" JOIN tags ON notes_meta.id = tags.note_id");
            conditions.push("tags.tag = ?");
            params_vec.push(Box::new(tag.clone()));
        }

        if let Some(ref ws) = filter.workspace_id {
            conditions.push("notes_meta.workspace_id = ?");
            params_vec.push(Box::new(ws.clone()));
        }

        if let Some(pinned) = filter.pinned {
            conditions.push("notes_meta.pinned = ?");
            params_vec.push(Box::new(pinned as i32));
        }

        if let Some(archived) = filter.archived {
            conditions.push("notes_meta.archived = ?");
            params_vec.push(Box::new(archived as i32));
        }

        if let Some(ref nt) = filter.note_type {
            conditions.push("notes_meta.note_type = ?");
            params_vec.push(Box::new(nt.clone()));
        }

        if let Some(ref st) = filter.search_text {
            conditions.push("(notes_meta.title LIKE ? OR notes_meta.id IN (SELECT id FROM notes_fts WHERE notes_fts MATCH ?))");
            let like_term = format!("%{}%", st);
            let fts_term = format!("\"{}\"*", st.replace('"', "\"\""));
            params_vec.push(Box::new(like_term));
            params_vec.push(Box::new(fts_term));
        }

        if let Some(ref df) = filter.date_from {
            conditions.push("notes_meta.created_at >= ?");
            params_vec.push(Box::new(df.clone()));
        }

        if let Some(ref dt) = filter.date_to {
            conditions.push("notes_meta.created_at <= ?");
            params_vec.push(Box::new(dt.clone()));
        }

        if let Some(tasks) = filter.has_tasks {
            conditions.push("notes_meta.has_tasks = ?");
            params_vec.push(Box::new(tasks as i32));
        }

        if let Some(inc) = filter.has_incomplete_tasks {
            conditions.push("notes_meta.has_incomplete_tasks = ?");
            params_vec.push(Box::new(inc as i32));
        }

        if let Some(loc) = filter.has_location {
            conditions.push("notes_meta.has_location = ?");
            params_vec.push(Box::new(loc as i32));
        }

        if let Some(links) = filter.has_links {
            conditions.push("notes_meta.has_links = ?");
            params_vec.push(Box::new(links as i32));
        }

        if let Some(code) = filter.has_code {
            conditions.push("notes_meta.has_code = ?");
            params_vec.push(Box::new(code as i32));
        }

        if let Some(att) = filter.has_attachments {
            conditions.push("notes_meta.has_attachments = ?");
            params_vec.push(Box::new(att as i32));
        }

        if !conditions.is_empty() {
            query.push_str(" WHERE ");
            query.push_str(&conditions.join(" AND "));
        }

        query.push_str(" ORDER BY notes_meta.pinned DESC, notes_meta.updated_at DESC");

        let mut stmt = self.conn.prepare(&query)?;
        let rusqlite_params: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(&rusqlite_params[..], |row| row.get(0))?;

        let mut ids = Vec::new();
        for r in rows {
            ids.push(r?);
        }
        Ok(ids)
    }
}
