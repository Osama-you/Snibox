use crate::db::models::Draft;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn save_draft(
    state: State<AppState>,
    snippet_id: Option<String>,
    title: String,
    content: String,
    tags: Vec<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let tags_json = serde_json::to_string(&tags).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO drafts (id, snippet_id, title, content, tags, saved_at)
         VALUES ('current', ?1, ?2, ?3, ?4, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            snippet_id = ?1, title = ?2, content = ?3, tags = ?4, saved_at = datetime('now')",
        rusqlite::params![snippet_id, title, content, tags_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_draft(state: State<AppState>) -> Result<Option<Draft>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT id, snippet_id, title, content, tags, saved_at FROM drafts WHERE id = 'current'",
        [],
        |row| {
            Ok(Draft {
                id: row.get(0)?,
                snippet_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                tags: row.get(4)?,
                saved_at: row.get(5)?,
            })
        },
    );

    match result {
        Ok(draft) => Ok(Some(draft)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn discard_draft(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM drafts WHERE id = 'current'", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}
