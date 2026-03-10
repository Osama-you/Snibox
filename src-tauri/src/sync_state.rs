use crate::db::models::{Snippet, SnippetWithTags};
use crate::vault::format::VaultSnippet;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const PROVIDER_GOOGLE_DRIVE: &str = "google_drive";
pub const SYNC_STATUS_IDLE: &str = "idle";
pub const SYNC_STATUS_SYNCING: &str = "syncing";
pub const SYNC_STATUS_OFFLINE: &str = "offline";
pub const SYNC_STATUS_AUTH_NEEDED: &str = "auth_needed";
pub const SYNC_STATUS_ERROR: &str = "error";
pub const SYNC_STATUS_CONFLICTED: &str = "conflicted";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusPayload {
    pub provider: String,
    pub connected: bool,
    pub sync_status: String,
    pub last_synced: Option<String>,
    pub queue_depth: usize,
    pub conflict_count: usize,
    pub last_error: Option<String>,
    pub needs_reauth: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncActivityItem {
    pub id: i64,
    pub level: String,
    pub action: String,
    pub message: String,
    pub snippet_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflictRecord {
    pub id: String,
    pub snippet_id: String,
    pub reason: String,
    pub status: String,
    pub local_snippet: SnippetWithTags,
    pub remote_snippet: VaultSnippet,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct SyncQueueItem {
    pub id: i64,
    pub snippet_id: String,
    pub operation: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum ConflictResolutionStrategy {
    KeepLocal,
    KeepRemote,
    DuplicateBoth,
    MergeManual,
}

pub fn now_timestamp() -> String {
    Utc::now().to_rfc3339()
}

pub fn set_drive_state(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO drive_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_drive_state(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT value FROM drive_state WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub fn clear_drive_tables(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM drive_sync", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM drive_state", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sync_queue", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sync_conflicts", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sync_activity", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn log_activity(
    conn: &Connection,
    level: &str,
    action: &str,
    message: &str,
    snippet_id: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO sync_activity (level, action, message, snippet_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![level, action, message, snippet_id, now_timestamp()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_sync_activity(conn: &Connection, limit: i64) -> Result<Vec<SyncActivityItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, level, action, message, snippet_id, created_at
             FROM sync_activity
             ORDER BY created_at DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(SyncActivityItem {
                id: row.get(0)?,
                level: row.get(1)?,
                action: row.get(2)?,
                message: row.get(3)?,
                snippet_id: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_queue_depth(conn: &Connection) -> Result<usize, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_queue WHERE status IN ('pending', 'retrying', 'processing')",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count as usize)
}

pub fn list_pending_queue(conn: &Connection) -> Result<Vec<SyncQueueItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, snippet_id, operation
             FROM sync_queue
             WHERE status IN ('pending', 'retrying')
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SyncQueueItem {
                id: row.get(0)?,
                snippet_id: row.get(1)?,
                operation: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn queue_operation(
    conn: &Connection,
    snippet_id: &str,
    operation: &str,
    reason: &str,
) -> Result<(), String> {
    let now = now_timestamp();
    conn.execute(
        "UPDATE sync_queue
         SET status = 'superseded', updated_at = ?2
         WHERE snippet_id = ?1 AND status IN ('pending', 'retrying', 'processing')",
        params![snippet_id, now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO sync_queue (snippet_id, operation, status, reason, created_at, updated_at)
         VALUES (?1, ?2, 'pending', ?3, ?4, ?4)",
        params![snippet_id, operation, reason, now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE snippets
         SET sync_state = CASE WHEN sync_state = ?2 THEN sync_state ELSE ?1 END
         WHERE id = ?3",
        params![SYNC_STATUS_SYNCING, SYNC_STATUS_CONFLICTED, snippet_id],
    )
    .map_err(|e| e.to_string())?;

    log_activity(
        conn,
        "info",
        "queue",
        &format!("Queued {operation} for sync"),
        Some(snippet_id),
    )?;

    Ok(())
}

pub fn mark_queue_job_processing(conn: &Connection, job_id: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_queue
         SET status = 'processing',
             attempts = attempts + 1,
             updated_at = ?2
         WHERE id = ?1",
        params![job_id, now_timestamp()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn mark_queue_job_done(conn: &Connection, job_id: i64) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_queue
         SET status = 'done',
             updated_at = ?2,
             last_error = NULL
         WHERE id = ?1",
        params![job_id, now_timestamp()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn mark_queue_job_failed(conn: &Connection, job_id: i64, error: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_queue
         SET status = 'retrying',
             updated_at = ?2,
             last_error = ?3
         WHERE id = ?1",
        params![job_id, now_timestamp(), error],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_queue_for_snippet(conn: &Connection, snippet_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_queue
         SET status = 'done',
             updated_at = ?2,
             last_error = NULL
         WHERE snippet_id = ?1 AND status IN ('pending', 'retrying', 'processing')",
        params![snippet_id, now_timestamp()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn mark_snippet_deleted(conn: &Connection, snippet_id: &str) -> Result<(), String> {
    let now = now_timestamp();
    conn.execute(
        "UPDATE snippets
         SET deleted_at = ?2,
             updated_at = ?2,
             device_updated_at = ?2,
             sync_state = ?3
         WHERE id = ?1",
        params![snippet_id, now, SYNC_STATUS_SYNCING],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn restore_deleted_snippet(conn: &Connection, snippet_id: &str) -> Result<(), String> {
    let now = now_timestamp();
    conn.execute(
        "UPDATE snippets
         SET deleted_at = NULL,
             updated_at = ?2,
             device_updated_at = ?2,
             sync_state = ?3
         WHERE id = ?1",
        params![snippet_id, now, SYNC_STATUS_SYNCING],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn touch_snippet_for_sync(conn: &Connection, snippet_id: &str) -> Result<(), String> {
    let now = now_timestamp();
    conn.execute(
        "UPDATE snippets
         SET updated_at = ?2,
             device_updated_at = ?2,
             sync_state = CASE WHEN sync_state = ?3 THEN sync_state ELSE ?4 END
         WHERE id = ?1",
        params![snippet_id, now, SYNC_STATUS_CONFLICTED, SYNC_STATUS_SYNCING],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn mark_snippet_synced(
    conn: &Connection,
    snippet_id: &str,
    remote_version: Option<&str>,
) -> Result<(), String> {
    let now = now_timestamp();
    conn.execute(
        "UPDATE snippets
         SET sync_state = ?2,
             last_synced_at = ?3,
             remote_version = COALESCE(?4, remote_version)
         WHERE id = ?1",
        params![snippet_id, SYNC_STATUS_IDLE, now, remote_version],
    )
    .map_err(|e| e.to_string())?;
    clear_queue_for_snippet(conn, snippet_id)?;
    set_drive_state(conn, "last_sync_time", &now)?;
    set_drive_state(conn, "last_error", "")?;
    Ok(())
}

pub fn mark_snippet_conflicted(conn: &Connection, snippet_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE snippets SET sync_state = ?2 WHERE id = ?1",
        params![snippet_id, SYNC_STATUS_CONFLICTED],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_global_sync_status(
    conn: &Connection,
    sync_status: &str,
    last_error: Option<&str>,
    needs_reauth: bool,
) -> Result<(), String> {
    set_drive_state(conn, "sync_status", sync_status)?;
    set_drive_state(
        conn,
        "needs_reauth",
        if needs_reauth { "true" } else { "false" },
    )?;
    if let Some(error) = last_error {
        set_drive_state(conn, "last_error", error)?;
    } else {
        set_drive_state(conn, "last_error", "")?;
    }
    Ok(())
}

pub fn get_conflict_count(conn: &Connection) -> Result<usize, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sync_conflicts WHERE status = 'open'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count as usize)
}

pub fn record_conflict(
    conn: &Connection,
    snippet_id: &str,
    reason: &str,
    local_snippet: &SnippetWithTags,
    remote_snippet: &VaultSnippet,
) -> Result<String, String> {
    let conflict_id = uuid::Uuid::new_v4().to_string();
    let now = now_timestamp();
    let local_payload = serde_json::to_string(local_snippet).map_err(|e| e.to_string())?;
    let remote_payload = serde_json::to_string(remote_snippet).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE sync_conflicts SET status = 'superseded', updated_at = ?2
         WHERE snippet_id = ?1 AND status = 'open'",
        params![snippet_id, now],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO sync_conflicts (id, snippet_id, reason, local_payload, remote_payload, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?6)",
        params![conflict_id, snippet_id, reason, local_payload, remote_payload, now],
    )
    .map_err(|e| e.to_string())?;

    mark_snippet_conflicted(conn, snippet_id)?;
    log_activity(
        conn,
        "warn",
        "conflict",
        "Sync conflict requires review",
        Some(snippet_id),
    )?;

    Ok(conflict_id)
}

pub fn list_open_conflicts(conn: &Connection) -> Result<Vec<SyncConflictRecord>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, snippet_id, reason, status, local_payload, remote_payload, created_at, updated_at
             FROM sync_conflicts
             WHERE status = 'open'
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let local_payload: String = row.get(4)?;
            let remote_payload: String = row.get(5)?;
            let local_snippet: SnippetWithTags =
                serde_json::from_str(&local_payload).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        4,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;
            let remote_snippet: VaultSnippet =
                serde_json::from_str(&remote_payload).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        5,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;

            Ok(SyncConflictRecord {
                id: row.get(0)?,
                snippet_id: row.get(1)?,
                reason: row.get(2)?,
                status: row.get(3)?,
                local_snippet,
                remote_snippet,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn get_conflict(
    conn: &Connection,
    conflict_id: &str,
) -> Result<Option<SyncConflictRecord>, String> {
    let mut conflicts = conn
        .prepare(
            "SELECT id, snippet_id, reason, status, local_payload, remote_payload, created_at, updated_at
             FROM sync_conflicts
             WHERE id = ?1",
        )
        .map_err(|e| e.to_string())?;

    conflicts
        .query_row(params![conflict_id], |row| {
            let local_payload: String = row.get(4)?;
            let remote_payload: String = row.get(5)?;
            let local_snippet: SnippetWithTags =
                serde_json::from_str(&local_payload).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        4,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;
            let remote_snippet: VaultSnippet =
                serde_json::from_str(&remote_payload).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        5,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })?;

            Ok(SyncConflictRecord {
                id: row.get(0)?,
                snippet_id: row.get(1)?,
                reason: row.get(2)?,
                status: row.get(3)?,
                local_snippet,
                remote_snippet,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .optional()
        .map_err(|e| e.to_string())
}

pub fn close_conflict(conn: &Connection, conflict_id: &str, status: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE sync_conflicts SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![conflict_id, status, now_timestamp()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn insert_or_replace_snippet(conn: &Connection, snippet: &VaultSnippet) -> Result<(), String> {
    conn.execute(
        "INSERT INTO snippets (
            id, title, content, pinned, created_at, updated_at, sync_state, device_updated_at, deleted_at
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, NULL)
         ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            content = excluded.content,
            pinned = excluded.pinned,
            updated_at = excluded.updated_at,
            sync_state = excluded.sync_state,
            device_updated_at = excluded.device_updated_at,
            deleted_at = NULL",
        params![
            snippet.id,
            snippet.title,
            snippet.content,
            snippet.pinned as i64,
            snippet.created_at,
            snippet.updated_at,
            SYNC_STATUS_IDLE
        ],
    )
    .map_err(|e| e.to_string())?;
    set_tags_for_snippet(conn, &snippet.id, &snippet.tags)?;
    Ok(())
}

pub fn duplicate_remote_snippet(
    conn: &Connection,
    conflict: &SyncConflictRecord,
) -> Result<String, String> {
    let copy_id = uuid::Uuid::new_v4().to_string();
    let mut remote = conflict.remote_snippet.clone();
    remote.id = copy_id.clone();
    remote.title = Some(match remote.title {
        Some(title) => format!("{title} (remote copy)"),
        None => "Remote copy".to_string(),
    });
    remote.updated_at = now_timestamp();
    remote.created_at = remote.updated_at.clone();

    conn.execute(
        "INSERT INTO snippets (
            id, title, content, pinned, created_at, updated_at, sync_state, device_updated_at, conflict_parent_id
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, ?8)",
        params![
            remote.id,
            remote.title,
            remote.content,
            remote.pinned as i64,
            remote.created_at,
            remote.updated_at,
            SYNC_STATUS_SYNCING,
            conflict.snippet_id
        ],
    )
    .map_err(|e| e.to_string())?;
    set_tags_for_snippet(conn, &copy_id, &remote.tags)?;
    queue_operation(conn, &copy_id, "upsert", "duplicate_remote")?;
    Ok(copy_id)
}

pub fn load_snippet_with_tags(
    conn: &Connection,
    snippet_id: &str,
    include_deleted: bool,
) -> Result<Option<SnippetWithTags>, String> {
    let sql = if include_deleted {
        "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count,
                sync_state, last_synced_at, remote_version, deleted_at, conflict_parent_id, device_updated_at
         FROM snippets WHERE id = ?1"
    } else {
        "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count,
                sync_state, last_synced_at, remote_version, deleted_at, conflict_parent_id, device_updated_at
         FROM snippets WHERE id = ?1 AND deleted_at IS NULL"
    };

    conn.query_row(sql, params![snippet_id], row_to_snippet)
        .optional()
        .map_err(|e| e.to_string())?
        .map(|snippet| {
            let tags = get_tags_for_snippet(conn, &snippet.id)?;
            Ok(SnippetWithTags { snippet, tags })
        })
        .transpose()
}

pub fn row_to_snippet(row: &rusqlite::Row<'_>) -> rusqlite::Result<Snippet> {
    Ok(Snippet {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        pinned: row.get::<_, i64>(3)? != 0,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        last_used_at: row.get(6)?,
        use_count: row.get(7)?,
        sync_state: row.get(8)?,
        last_synced_at: row.get(9)?,
        remote_version: row.get(10)?,
        deleted_at: row.get(11)?,
        conflict_parent_id: row.get(12)?,
        device_updated_at: row.get(13)?,
    })
}

pub fn get_tags_for_snippet(conn: &Connection, snippet_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name
             FROM tags t
             JOIN snippet_tags st ON t.id = st.tag_id
             WHERE st.snippet_id = ?1
             ORDER BY t.name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![snippet_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())
}

pub fn set_tags_for_snippet(
    conn: &Connection,
    snippet_id: &str,
    tags: &[String],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM snippet_tags WHERE snippet_id = ?1",
        params![snippet_id],
    )
    .map_err(|e| e.to_string())?;

    for tag_name in tags {
        let tag_name = tag_name.trim().to_lowercase();
        if tag_name.is_empty() {
            continue;
        }

        let tag_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT OR IGNORE INTO tags (id, name) VALUES (?1, ?2)",
            params![tag_id, tag_name],
        )
        .map_err(|e| e.to_string())?;

        let actual_tag_id: String = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                params![tag_name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR IGNORE INTO snippet_tags (snippet_id, tag_id) VALUES (?1, ?2)",
            params![snippet_id, actual_tag_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn get_sync_status(conn: &Connection, connected: bool) -> Result<SyncStatusPayload, String> {
    let raw_status =
        get_drive_state(conn, "sync_status")?.unwrap_or_else(|| SYNC_STATUS_IDLE.to_string());
    let sync_status = if connected {
        raw_status
    } else if get_drive_state(conn, "connected")?.as_deref() == Some("true") {
        SYNC_STATUS_OFFLINE.to_string()
    } else {
        SYNC_STATUS_IDLE.to_string()
    };

    Ok(SyncStatusPayload {
        provider: get_drive_state(conn, "provider")?
            .unwrap_or_else(|| PROVIDER_GOOGLE_DRIVE.to_string()),
        connected: connected || get_drive_state(conn, "connected")?.as_deref() == Some("true"),
        sync_status,
        last_synced: get_drive_state(conn, "last_sync_time")?,
        queue_depth: get_queue_depth(conn)?,
        conflict_count: get_conflict_count(conn)?,
        last_error: get_drive_state(conn, "last_error")?.filter(|value| !value.is_empty()),
        needs_reauth: get_drive_state(conn, "needs_reauth")?.as_deref() == Some("true"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::run_migrations(&conn).unwrap();
        conn
    }

    fn insert_snippet(conn: &Connection, id: &str) {
        conn.execute(
            "INSERT INTO snippets (id, title, content, created_at, updated_at, device_updated_at)
             VALUES (?1, 'Title', 'Content', ?2, ?2, ?2)",
            params![id, now_timestamp()],
        )
        .unwrap();
    }

    #[test]
    fn queues_latest_operation_per_snippet() {
        let conn = setup_conn();
        insert_snippet(&conn, "snippet-1");

        queue_operation(&conn, "snippet-1", "upsert", "created").unwrap();
        queue_operation(&conn, "snippet-1", "delete", "deleted").unwrap();

        let jobs = list_pending_queue(&conn).unwrap();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].operation, "delete");
    }

    #[test]
    fn records_conflicts_for_review() {
        let conn = setup_conn();
        insert_snippet(&conn, "snippet-1");
        let local = load_snippet_with_tags(&conn, "snippet-1", true)
            .unwrap()
            .unwrap();
        let remote = VaultSnippet {
            id: "snippet-1".to_string(),
            title: Some("Remote".to_string()),
            content: "Remote content".to_string(),
            tags: vec!["remote".to_string()],
            pinned: false,
            created_at: now_timestamp(),
            updated_at: now_timestamp(),
        };

        let conflict_id =
            record_conflict(&conn, "snippet-1", "remote_changed", &local, &remote).unwrap();
        let conflict = get_conflict(&conn, &conflict_id).unwrap().unwrap();
        assert_eq!(conflict.reason, "remote_changed");
        assert_eq!(get_conflict_count(&conn).unwrap(), 1);
    }
}
