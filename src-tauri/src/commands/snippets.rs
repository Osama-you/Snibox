use crate::db::models::SnippetWithTags;
use crate::state::AppState;
use tauri::State;

fn get_tags_for_snippet(
    conn: &rusqlite::Connection,
    snippet_id: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN snippet_tags st ON t.id = st.tag_id
             WHERE st.snippet_id = ?1
             ORDER BY t.name",
        )
        .map_err(|e| e.to_string())?;

    let tags: Vec<String> = stmt
        .query_map(rusqlite::params![snippet_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

fn set_tags_for_snippet(
    conn: &rusqlite::Connection,
    snippet_id: &str,
    tags: &[String],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM snippet_tags WHERE snippet_id = ?1",
        rusqlite::params![snippet_id],
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
            rusqlite::params![tag_id, tag_name],
        )
        .map_err(|e| e.to_string())?;

        let actual_tag_id: String = conn
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                rusqlite::params![tag_name],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT OR IGNORE INTO snippet_tags (snippet_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![snippet_id, actual_tag_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn row_to_snippet(row: &rusqlite::Row) -> rusqlite::Result<crate::db::models::Snippet> {
    Ok(crate::db::models::Snippet {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        pinned: row.get::<_, i64>(3)? != 0,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        last_used_at: row.get(6)?,
        use_count: row.get(7)?,
    })
}

#[tauri::command]
pub fn list_snippets(
    state: State<AppState>,
    query: Option<String>,
    tag: Option<String>,
) -> Result<Vec<SnippetWithTags>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let has_query = query
        .as_ref()
        .map(|q| !q.trim().is_empty())
        .unwrap_or(false);
    let has_tag = tag
        .as_ref()
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false);

    let sql = if has_query && has_tag {
        "SELECT s.id, s.title, s.content, s.pinned, s.created_at, s.updated_at, s.last_used_at, s.use_count
         FROM snippets s
         JOIN snippets_fts fts ON s.rowid = fts.rowid
         WHERE fts.snippets_fts MATCH ?1
           AND s.id IN (SELECT st.snippet_id FROM snippet_tags st JOIN tags t ON st.tag_id = t.id WHERE t.name = ?2)
         ORDER BY s.pinned DESC, s.use_count DESC, s.updated_at DESC
         LIMIT 50"
            .to_string()
    } else if has_query {
        "SELECT s.id, s.title, s.content, s.pinned, s.created_at, s.updated_at, s.last_used_at, s.use_count
         FROM snippets s
         JOIN snippets_fts fts ON s.rowid = fts.rowid
         WHERE fts.snippets_fts MATCH ?1
         ORDER BY s.pinned DESC, s.use_count DESC, s.updated_at DESC
         LIMIT 50"
            .to_string()
    } else if has_tag {
        "SELECT s.id, s.title, s.content, s.pinned, s.created_at, s.updated_at, s.last_used_at, s.use_count
         FROM snippets s
         WHERE s.id IN (SELECT st.snippet_id FROM snippet_tags st JOIN tags t ON st.tag_id = t.id WHERE t.name = ?2)
         ORDER BY s.pinned DESC, s.use_count DESC, s.updated_at DESC
         LIMIT 50"
            .to_string()
    } else {
        "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count
         FROM snippets
         ORDER BY pinned DESC, use_count DESC, updated_at DESC
         LIMIT 50"
            .to_string()
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let fts_query = query
        .as_ref()
        .map(|q| {
            q.split_whitespace()
                .map(|w| format!("{}*", w))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();
    let tag_val = tag.unwrap_or_default().trim().to_lowercase();

    let rows: Vec<crate::db::models::Snippet> = if has_query && has_tag {
        stmt.query_map(rusqlite::params![fts_query, tag_val], row_to_snippet)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    } else if has_query {
        stmt.query_map(rusqlite::params![fts_query], row_to_snippet)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    } else if has_tag {
        stmt.query_map(rusqlite::params![tag_val], row_to_snippet)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    } else {
        stmt.query_map([], row_to_snippet)
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect()
    };

    let mut result = Vec::new();
    for snippet in rows {
        let tags = get_tags_for_snippet(&conn, &snippet.id)?;
        result.push(SnippetWithTags { snippet, tags });
    }

    Ok(result)
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

    let final_title = match &title {
        Some(t) if !t.trim().is_empty() => Some(t.clone()),
        _ => {
            let first_line = content.lines().next().unwrap_or("").trim();
            if first_line.is_empty() {
                None
            } else if first_line.len() > 40 {
                Some(format!("{}...", &first_line[..40]))
            } else {
                Some(first_line.to_string())
            }
        }
    };

    conn.execute(
        "INSERT INTO snippets (id, title, content) VALUES (?1, ?2, ?3)",
        rusqlite::params![id, final_title, content],
    )
    .map_err(|e| e.to_string())?;

    set_tags_for_snippet(&conn, &id, &tags)?;

    let snippet = conn
        .query_row(
            "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets WHERE id = ?1",
            rusqlite::params![id],
            row_to_snippet,
        )
        .map_err(|e| e.to_string())?;

    let tag_names = get_tags_for_snippet(&conn, &id)?;

    let result = SnippetWithTags {
        snippet,
        tags: tag_names,
    };

    drop(conn);

    if let Ok(vault) = state.vault.lock() {
        if let Some(vault_manager) = vault.as_ref() {
            let _ = vault_manager.write_snippet(&result);
        }
    }

    if let Ok(drive) = state.drive.try_lock() {
        if let Some(mgr) = drive.as_ref() {
            mgr.enqueue_push(&result.snippet.id);
        }
    }

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

    let final_title = match &title {
        Some(t) if !t.trim().is_empty() => Some(t.clone()),
        _ => {
            let first_line = content.lines().next().unwrap_or("").trim();
            if first_line.is_empty() {
                None
            } else if first_line.len() > 40 {
                Some(format!("{}...", &first_line[..40]))
            } else {
                Some(first_line.to_string())
            }
        }
    };

    conn.execute(
        "UPDATE snippets SET title = ?1, content = ?2, updated_at = datetime('now') WHERE id = ?3",
        rusqlite::params![final_title, content, id],
    )
    .map_err(|e| e.to_string())?;

    set_tags_for_snippet(&conn, &id, &tags)?;

    let snippet = conn
        .query_row(
            "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets WHERE id = ?1",
            rusqlite::params![id],
            row_to_snippet,
        )
        .map_err(|e| e.to_string())?;

    let tag_names = get_tags_for_snippet(&conn, &id)?;

    let result = SnippetWithTags {
        snippet,
        tags: tag_names,
    };

    drop(conn);

    if let Ok(vault) = state.vault.lock() {
        if let Some(vault_manager) = vault.as_ref() {
            let _ = vault_manager.write_snippet(&result);
        }
    }

    if let Ok(drive) = state.drive.try_lock() {
        if let Some(mgr) = drive.as_ref() {
            mgr.enqueue_push(&result.snippet.id);
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn delete_snippet(state: State<AppState>, id: String) -> Result<SnippetWithTags, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let snippet = conn
        .query_row(
            "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets WHERE id = ?1",
            rusqlite::params![id],
            row_to_snippet,
        )
        .map_err(|e| e.to_string())?;
    let tags = get_tags_for_snippet(&conn, &id)?;

    conn.execute("DELETE FROM snippets WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;

    let result = SnippetWithTags { snippet, tags };

    drop(conn);

    if let Ok(vault) = state.vault.lock() {
        if let Some(vault_manager) = vault.as_ref() {
            let _ = vault_manager.delete_snippet(&id);
        }
    }

    if let Ok(drive) = state.drive.try_lock() {
        if let Some(mgr) = drive.as_ref() {
            mgr.enqueue_delete(&id);
        }
    }

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

    conn.execute(
        "INSERT INTO snippets (id, title, content, pinned) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, title, content, pinned as i64],
    )
    .map_err(|e| e.to_string())?;

    set_tags_for_snippet(&conn, &id, &tags)?;

    let snippet = conn
        .query_row(
            "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets WHERE id = ?1",
            rusqlite::params![id],
            row_to_snippet,
        )
        .map_err(|e| e.to_string())?;

    let tag_names = get_tags_for_snippet(&conn, &id)?;
    let result = SnippetWithTags { snippet, tags: tag_names };

    drop(conn);

    if let Ok(vault) = state.vault.lock() {
        if let Some(vault_manager) = vault.as_ref() {
            let _ = vault_manager.write_snippet(&result);
        }
    }

    if let Ok(drive) = state.drive.try_lock() {
        if let Some(mgr) = drive.as_ref() {
            mgr.enqueue_push(&result.snippet.id);
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn toggle_pin(state: State<AppState>, id: String) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE snippets SET pinned = NOT pinned, updated_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;

    let pinned: bool = conn
        .query_row(
            "SELECT pinned FROM snippets WHERE id = ?1",
            rusqlite::params![id],
            |row| row.get::<_, i64>(0).map(|v| v != 0),
        )
        .map_err(|e| e.to_string())?;

    let snippet = conn
        .query_row(
            "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets WHERE id = ?1",
            rusqlite::params![id],
            row_to_snippet,
        )
        .map_err(|e| e.to_string())?;
    let tags = get_tags_for_snippet(&conn, &id)?;

    drop(conn);

    if let Ok(vault) = state.vault.lock() {
        if let Some(vault_manager) = vault.as_ref() {
            let snippet_with_tags = SnippetWithTags { snippet, tags };
            let _ = vault_manager.write_snippet(&snippet_with_tags);
        }
    }

    if let Ok(drive) = state.drive.try_lock() {
        if let Some(mgr) = drive.as_ref() {
            mgr.enqueue_push(&id);
        }
    }

    Ok(pinned)
}

#[tauri::command]
pub fn record_used(state: State<AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE snippets SET use_count = use_count + 1, last_used_at = datetime('now') WHERE id = ?1",
        rusqlite::params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_snippet(state: State<AppState>, id: String) -> Result<SnippetWithTags, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let snippet = conn
        .query_row(
            "SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets WHERE id = ?1",
            rusqlite::params![id],
            row_to_snippet,
        )
        .map_err(|e| e.to_string())?;

    let tags = get_tags_for_snippet(&conn, &id)?;

    Ok(SnippetWithTags { snippet, tags })
}
