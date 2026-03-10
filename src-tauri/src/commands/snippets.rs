use crate::db::models::SnippetWithTags;
use crate::state::AppState;
use crate::sync_state;
use rusqlite::params;
use tauri::State;

fn build_title(title: &Option<String>, content: &str) -> Option<String> {
    match title {
        Some(value) if !value.trim().is_empty() => Some(value.trim().to_string()),
        _ => {
            let first_line = content.lines().next().unwrap_or("").trim();
            if first_line.is_empty() {
                None
            } else {
                let truncated: String = first_line.chars().take(40).collect();
                if first_line.chars().count() > 40 {
                    Some(format!("{truncated}..."))
                } else {
                    Some(truncated)
                }
            }
        }
    }
}

fn kick_drive_sync(state: &State<AppState>) {
    if let Ok(drive) = state.drive.try_lock() {
        if let Some(manager) = drive.as_ref() {
            manager.enqueue_sync();
        }
    }
}

#[tauri::command]
pub fn list_snippets(
    state: State<AppState>,
    query: Option<String>,
    tag: Option<String>,
    pinned_only: Option<bool>,
    used_recent: Option<bool>,
    updated_today: Option<bool>,
) -> Result<Vec<SnippetWithTags>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let has_query = query
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let has_tag = tag
        .as_ref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    let mut filters = vec!["s.deleted_at IS NULL".to_string()];
    if pinned_only.unwrap_or(false) {
        filters.push("s.pinned = 1".to_string());
    }
    if used_recent.unwrap_or(false) {
        filters.push(
            "s.last_used_at IS NOT NULL AND datetime(s.last_used_at) >= datetime('now', '-7 days')"
                .to_string(),
        );
    }
    if updated_today.unwrap_or(false) {
        filters.push("date(s.updated_at) = date('now')".to_string());
    }
    if has_tag {
        let tag_param = if has_query { "?2" } else { "?1" };
        filters.push(format!(
            "s.id IN (
                    SELECT st.snippet_id
                    FROM snippet_tags st
                    JOIN tags t ON st.tag_id = t.id
                    WHERE t.name = {tag_param}
                )"
        ));
    }

    let select = if has_query {
        "SELECT s.id, s.title, s.content, s.pinned, s.created_at, s.updated_at, s.last_used_at, s.use_count,
                s.sync_state, s.last_synced_at, s.remote_version, s.deleted_at, s.conflict_parent_id, s.device_updated_at
         FROM snippets s
         JOIN snippets_fts fts ON s.rowid = fts.rowid"
            .to_string()
    } else {
        "SELECT s.id, s.title, s.content, s.pinned, s.created_at, s.updated_at, s.last_used_at, s.use_count,
                s.sync_state, s.last_synced_at, s.remote_version, s.deleted_at, s.conflict_parent_id, s.device_updated_at
         FROM snippets s"
            .to_string()
    };

    let mut sql = select;
    if has_query {
        filters.insert(0, "fts.snippets_fts MATCH ?1".to_string());
    }
    sql.push_str(" WHERE ");
    sql.push_str(&filters.join(" AND "));
    sql.push_str(" ORDER BY s.pinned DESC, s.use_count DESC, s.updated_at DESC LIMIT 75");

    let fts_query = query
        .as_ref()
        .map(|value| {
            value
                .split_whitespace()
                .map(|part| format!("{part}*"))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();
    let tag_value = tag.unwrap_or_default().trim().to_lowercase();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = if has_query && has_tag {
        stmt.query_map(params![fts_query, tag_value], sync_state::row_to_snippet)
    } else if has_query {
        stmt.query_map(params![fts_query], sync_state::row_to_snippet)
    } else if has_tag {
        stmt.query_map(params![tag_value], sync_state::row_to_snippet)
    } else {
        stmt.query_map([], sync_state::row_to_snippet)
    }
    .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        let snippet = row.map_err(|e| e.to_string())?;
        let tags = sync_state::get_tags_for_snippet(&conn, &snippet.id)?;
        results.push(SnippetWithTags { snippet, tags });
    }

    Ok(results)
}

#[tauri::command]
pub fn create_snippet(
    state: State<AppState>,
    title: Option<String>,
    content: String,
    tags: Vec<String>,
) -> Result<SnippetWithTags, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = sync_state::now_timestamp();
    let final_title = build_title(&title, &content);

    conn.execute(
        "INSERT INTO snippets (
            id, title, content, pinned, created_at, updated_at, sync_state, device_updated_at, deleted_at
         ) VALUES (?1, ?2, ?3, 0, ?4, ?4, ?5, ?4, NULL)",
        params![id, final_title, content, now, sync_state::SYNC_STATUS_SYNCING],
    )
    .map_err(|e| e.to_string())?;
    sync_state::set_tags_for_snippet(&conn, &id, &tags)?;
    sync_state::queue_operation(&conn, &id, "upsert", "create")?;

    let result = sync_state::load_snippet_with_tags(&conn, &id, true)?
        .ok_or_else(|| "Created snippet missing".to_string())?;

    drop(conn);
    kick_drive_sync(&state);

    Ok(result)
}

#[tauri::command]
pub fn update_snippet(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    content: String,
    tags: Vec<String>,
) -> Result<SnippetWithTags, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = sync_state::now_timestamp();
    let final_title = build_title(&title, &content);

    conn.execute(
        "UPDATE snippets
         SET title = ?1,
             content = ?2,
             updated_at = ?3,
             device_updated_at = ?3,
             deleted_at = NULL,
             sync_state = CASE WHEN sync_state = ?5 THEN sync_state ELSE ?4 END
         WHERE id = ?6",
        params![
            final_title,
            content,
            now,
            sync_state::SYNC_STATUS_SYNCING,
            sync_state::SYNC_STATUS_CONFLICTED,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    sync_state::set_tags_for_snippet(&conn, &id, &tags)?;
    sync_state::queue_operation(&conn, &id, "upsert", "update")?;

    let result = sync_state::load_snippet_with_tags(&conn, &id, true)?
        .ok_or_else(|| "Updated snippet missing".to_string())?;

    drop(conn);
    kick_drive_sync(&state);

    Ok(result)
}

#[tauri::command]
pub fn duplicate_snippet(state: State<AppState>, id: String) -> Result<SnippetWithTags, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let existing = sync_state::load_snippet_with_tags(&conn, &id, true)?
        .ok_or_else(|| "Snippet not found".to_string())?;
    let new_id = uuid::Uuid::new_v4().to_string();
    let now = sync_state::now_timestamp();
    let duplicate_title = match existing.snippet.title {
        Some(title) => Some(format!("{title} copy")),
        None => Some("Snippet copy".to_string()),
    };

    conn.execute(
        "INSERT INTO snippets (
            id, title, content, pinned, created_at, updated_at, sync_state, device_updated_at, deleted_at, conflict_parent_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?5, NULL, ?7)",
        params![
            new_id,
            duplicate_title,
            existing.snippet.content,
            existing.snippet.pinned as i64,
            now,
            sync_state::SYNC_STATUS_SYNCING,
            existing.snippet.id
        ],
    )
    .map_err(|e| e.to_string())?;
    sync_state::set_tags_for_snippet(&conn, &new_id, &existing.tags)?;
    sync_state::queue_operation(&conn, &new_id, "upsert", "duplicate")?;

    let result = sync_state::load_snippet_with_tags(&conn, &new_id, true)?
        .ok_or_else(|| "Duplicated snippet missing".to_string())?;

    drop(conn);
    kick_drive_sync(&state);

    Ok(result)
}

#[tauri::command]
pub fn delete_snippet(state: State<AppState>, id: String) -> Result<SnippetWithTags, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let snippet = sync_state::load_snippet_with_tags(&conn, &id, true)?
        .ok_or_else(|| "Snippet not found".to_string())?;

    sync_state::mark_snippet_deleted(&conn, &id)?;
    sync_state::queue_operation(&conn, &id, "delete", "delete")?;

    let result = sync_state::load_snippet_with_tags(&conn, &id, true)?.unwrap_or(snippet);

    drop(conn);
    kick_drive_sync(&state);

    Ok(result)
}

#[tauri::command]
pub fn restore_snippet(
    state: State<AppState>,
    id: String,
    title: Option<String>,
    content: String,
    pinned: bool,
    tags: Vec<String>,
) -> Result<SnippetWithTags, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = sync_state::now_timestamp();
    let existing = sync_state::load_snippet_with_tags(&conn, &id, true)?;

    if existing.is_some() {
        conn.execute(
            "UPDATE snippets
             SET title = ?1,
                 content = ?2,
                 pinned = ?3,
                 updated_at = ?4,
                 device_updated_at = ?4,
                 deleted_at = NULL,
                 sync_state = ?5
             WHERE id = ?6",
            params![
                title,
                content,
                pinned as i64,
                now,
                sync_state::SYNC_STATUS_SYNCING,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "INSERT INTO snippets (
                id, title, content, pinned, created_at, updated_at, sync_state, device_updated_at, deleted_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?5, NULL)",
            params![id, title, content, pinned as i64, now, sync_state::SYNC_STATUS_SYNCING],
        )
        .map_err(|e| e.to_string())?;
    }

    sync_state::set_tags_for_snippet(&conn, &id, &tags)?;
    sync_state::restore_deleted_snippet(&conn, &id)?;
    sync_state::queue_operation(&conn, &id, "upsert", "restore")?;

    let result = sync_state::load_snippet_with_tags(&conn, &id, true)?
        .ok_or_else(|| "Restored snippet missing".to_string())?;

    drop(conn);
    kick_drive_sync(&state);

    Ok(result)
}

#[tauri::command]
pub fn toggle_pin(state: State<AppState>, id: String) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = sync_state::now_timestamp();
    conn.execute(
        "UPDATE snippets
         SET pinned = NOT pinned,
             updated_at = ?2,
             device_updated_at = ?2,
             sync_state = CASE WHEN sync_state = ?4 THEN sync_state ELSE ?3 END
         WHERE id = ?1",
        params![
            id,
            now,
            sync_state::SYNC_STATUS_SYNCING,
            sync_state::SYNC_STATUS_CONFLICTED
        ],
    )
    .map_err(|e| e.to_string())?;

    sync_state::queue_operation(&conn, &id, "upsert", "toggle_pin")?;
    let pinned: bool = conn
        .query_row(
            "SELECT pinned FROM snippets WHERE id = ?1",
            params![id],
            |row| row.get::<_, i64>(0).map(|value| value != 0),
        )
        .map_err(|e| e.to_string())?;

    drop(conn);
    kick_drive_sync(&state);

    Ok(pinned)
}

#[tauri::command]
pub fn record_used(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE snippets
         SET use_count = use_count + 1,
             last_used_at = ?2
         WHERE id = ?1",
        params![id, sync_state::now_timestamp()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_snippet(state: State<AppState>, id: String) -> Result<SnippetWithTags, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    sync_state::load_snippet_with_tags(&conn, &id, true)?
        .ok_or_else(|| "Snippet not found".to_string())
}
