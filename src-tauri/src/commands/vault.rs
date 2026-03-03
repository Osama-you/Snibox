use crate::db::models::SnippetWithTags;
use crate::state::AppState;
use crate::vault::{VaultManager, SyncStats};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub enabled: bool,
    pub vault_folder: Option<String>,
    pub sync_status: String,
}

fn get_vault_path_from_settings(conn: &Connection) -> Result<Option<String>, String> {
    let result: Result<String, rusqlite::Error> = conn.query_row(
        "SELECT value FROM settings WHERE key = 'vault_folder'",
        [],
        |row| row.get(0),
    );

    match result {
        Ok(path) => Ok(Some(path)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn save_vault_path_to_settings(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('vault_folder', ?1)",
        rusqlite::params![path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn clear_vault_path_from_settings(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM settings WHERE key = 'vault_folder'",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_vault_status(state: State<AppState>) -> Result<VaultStatus, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let vault_path = get_vault_path_from_settings(&conn)?;
    let vault = state.vault.lock().map_err(|e| e.to_string())?;

    Ok(VaultStatus {
        enabled: vault.is_some(),
        vault_folder: vault_path,
        sync_status: if vault.is_some() {
            "idle".to_string()
        } else {
            "disabled".to_string()
        },
    })
}

#[tauri::command]
pub fn set_vault_folder(
    state: State<AppState>,
    app_handle: AppHandle,
    path: String,
) -> Result<SyncStats, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    save_vault_path_to_settings(&conn, &path)?;

    let vault_manager = VaultManager::new(&path)?;
    let stats = vault_manager.sync_with_database(&conn)?;

    drop(conn);

    let watcher = vault_manager.start_watcher(app_handle)?;

    *state.vault.lock().map_err(|e| e.to_string())? = Some(vault_manager);
    *state.watcher.lock().map_err(|e| e.to_string())? = Some(watcher);

    Ok(stats)
}

#[tauri::command]
pub fn clear_vault_folder(state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    clear_vault_path_from_settings(&conn)?;
    drop(conn);

    *state.vault.lock().map_err(|e| e.to_string())? = None;
    *state.watcher.lock().map_err(|e| e.to_string())? = None;

    Ok(())
}

#[tauri::command]
pub fn export_to_vault(state: State<AppState>) -> Result<usize, String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let vault_manager = vault
        .as_ref()
        .ok_or_else(|| "Vault is not enabled".to_string())?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, title, content, pinned, created_at, updated_at, last_used_at, use_count FROM snippets")
        .map_err(|e| e.to_string())?;

    let snippets: Vec<crate::db::models::Snippet> = stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut count = 0;
    for snippet in snippets {
        let tags = get_tags_for_snippet(&conn, &snippet.id)?;
        let snippet_with_tags = SnippetWithTags { snippet, tags };
        vault_manager.write_snippet(&snippet_with_tags)?;
        count += 1;
    }

    Ok(count)
}

#[tauri::command]
pub fn sync_vault(state: State<AppState>) -> Result<(), String> {
    let vault = state.vault.lock().map_err(|e| e.to_string())?;
    let vault_manager = vault
        .as_ref()
        .ok_or_else(|| "Vault is not enabled".to_string())?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    crate::vault::process_vault_change(&conn, vault_manager)?;

    Ok(())
}

fn get_tags_for_snippet(conn: &Connection, snippet_id: &str) -> Result<Vec<String>, String> {
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
