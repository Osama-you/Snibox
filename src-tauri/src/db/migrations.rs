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
            use_count   INTEGER NOT NULL DEFAULT 0,
            sync_state  TEXT NOT NULL DEFAULT 'idle',
            last_synced_at TEXT,
            remote_version TEXT,
            deleted_at TEXT,
            conflict_parent_id TEXT REFERENCES snippets(id) ON DELETE SET NULL,
            device_updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

        CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            snippet_id TEXT NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
            operation TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            reason TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_snippet_active
        ON sync_queue(snippet_id)
        WHERE status IN ('pending', 'retrying');

        CREATE TABLE IF NOT EXISTS sync_conflicts (
            id TEXT PRIMARY KEY,
            snippet_id TEXT NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
            reason TEXT NOT NULL,
            local_payload TEXT NOT NULL,
            remote_payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status
        ON sync_conflicts(status, created_at DESC);

        CREATE TABLE IF NOT EXISTS sync_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT NOT NULL,
            action TEXT NOT NULL,
            message TEXT NOT NULL,
            snippet_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_sync_activity_created_at
        ON sync_activity(created_at DESC);

        -- Default settings
        INSERT OR IGNORE INTO settings (key, value) VALUES ('close_on_blur_launcher', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('close_after_copy', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('window_position_mode', 'center');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('global_hotkey', 'CmdOrCtrl+Shift+Space');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_check_updates', 'true');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('update_channel', 'stable');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('sync_onboarding_dismissed', 'false');
        ",
    )?;

    ensure_column(
        conn,
        "snippets",
        "sync_state",
        "ALTER TABLE snippets ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'idle'",
    )?;
    ensure_column(
        conn,
        "snippets",
        "last_synced_at",
        "ALTER TABLE snippets ADD COLUMN last_synced_at TEXT",
    )?;
    ensure_column(
        conn,
        "snippets",
        "remote_version",
        "ALTER TABLE snippets ADD COLUMN remote_version TEXT",
    )?;
    ensure_column(
        conn,
        "snippets",
        "deleted_at",
        "ALTER TABLE snippets ADD COLUMN deleted_at TEXT",
    )?;
    ensure_column(
        conn,
        "snippets",
        "conflict_parent_id",
        "ALTER TABLE snippets ADD COLUMN conflict_parent_id TEXT REFERENCES snippets(id) ON DELETE SET NULL",
    )?;
    ensure_column(
        conn,
        "snippets",
        "device_updated_at",
        "ALTER TABLE snippets ADD COLUMN device_updated_at TEXT",
    )?;

    conn.execute(
        "UPDATE snippets
         SET device_updated_at = COALESCE(device_updated_at, updated_at),
             sync_state = COALESCE(sync_state, 'idle')",
        [],
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO drive_state (key, value) VALUES ('provider', 'google_drive')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO drive_state (key, value) VALUES ('sync_status', 'idle')",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO drive_state (key, value) VALUES ('needs_reauth', 'false')",
        [],
    )?;

    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, ddl: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = ?1"))?;
    let exists: i64 = stmt.query_row([column], |row| row.get(0))?;
    if exists == 0 {
        conn.execute_batch(ddl)?;
    }
    Ok(())
}
