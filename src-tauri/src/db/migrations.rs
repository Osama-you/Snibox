use rusqlite::{Connection, Result};

pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Migrate old drive_sync table: rename etag -> version
    let has_etag: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('drive_sync') WHERE name = 'etag'")
        .and_then(|mut s| s.query_row([], |r| r.get::<_, i64>(0)))
        .unwrap_or(0)
        > 0;
    if has_etag {
        conn.execute_batch("ALTER TABLE drive_sync RENAME COLUMN etag TO version;")?;
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS snippets (
            id          TEXT PRIMARY KEY,
            title       TEXT,
            content     TEXT NOT NULL DEFAULT '',
            pinned      INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
            last_used_at TEXT,
            use_count   INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS tags (
            id   TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS snippet_tags (
            snippet_id TEXT NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
            tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (snippet_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS drafts (
            id         TEXT PRIMARY KEY DEFAULT 'current',
            snippet_id TEXT,
            title      TEXT,
            content    TEXT,
            tags       TEXT,
            saved_at   TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- FTS5 for full-text search
        CREATE VIRTUAL TABLE IF NOT EXISTS snippets_fts USING fts5(
            title,
            content,
            content='snippets',
            content_rowid='rowid'
        );

        -- Triggers to keep FTS in sync
        CREATE TRIGGER IF NOT EXISTS snippets_ai AFTER INSERT ON snippets BEGIN
            INSERT INTO snippets_fts(rowid, title, content)
            VALUES (new.rowid, new.title, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS snippets_ad AFTER DELETE ON snippets BEGIN
            INSERT INTO snippets_fts(snippets_fts, rowid, title, content)
            VALUES ('delete', old.rowid, old.title, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS snippets_au AFTER UPDATE ON snippets BEGIN
            INSERT INTO snippets_fts(snippets_fts, rowid, title, content)
            VALUES ('delete', old.rowid, old.title, old.content);
            INSERT INTO snippets_fts(rowid, title, content)
            VALUES (new.rowid, new.title, new.content);
        END;

        -- Google Drive sync mapping
        CREATE TABLE IF NOT EXISTS drive_sync (
            snippet_id    TEXT PRIMARY KEY,
            drive_file_id TEXT NOT NULL,
            modified_time TEXT NOT NULL,
            version       TEXT,
            md5_checksum  TEXT,
            synced_at     TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS drive_state (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Default settings
        INSERT OR IGNORE INTO settings (key, value) VALUES ('close_on_blur_launcher', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('close_after_copy', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('window_position_mode', 'center');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('global_hotkey', 'CmdOrCtrl+Shift+Space');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_check_updates', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('update_channel', 'stable');
        ",
    )?;

    Ok(())
}
