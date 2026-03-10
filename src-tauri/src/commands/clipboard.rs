use crate::state::AppState;
use crate::sync_state;
use tauri::{Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[tauri::command]
pub fn copy_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_to_clipboard(
    app: tauri::AppHandle,
    state: State<AppState>,
    id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let (title, content): (Option<String>, String) = conn
        .query_row(
            "SELECT title, content FROM snippets WHERE id = ?1",
            rusqlite::params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let text_to_copy = if content.trim().is_empty() {
        title.unwrap_or(content)
    } else {
        content
    };

    app.clipboard()
        .write_text(&text_to_copy)
        .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE snippets SET use_count = use_count + 1, last_used_at = ?2 WHERE id = ?1",
        rusqlite::params![id, sync_state::now_timestamp()],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn copy_and_paste(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let text_to_paste: String = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;

        let (title, content): (Option<String>, String) = conn
            .query_row(
                "SELECT title, content FROM snippets WHERE id = ?1",
                rusqlite::params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE snippets SET use_count = use_count + 1, last_used_at = ?2 WHERE id = ?1",
            rusqlite::params![id, sync_state::now_timestamp()],
        )
        .map_err(|e| e.to_string())?;

        if content.trim().is_empty() {
            title.unwrap_or(content)
        } else {
            content
        }
    };

    app.clipboard()
        .write_text(&text_to_paste)
        .map_err(|e| e.to_string())?;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    tokio::time::sleep(std::time::Duration::from_millis(150)).await;

    std::thread::spawn(|| {
        use enigo::{Enigo, Key, Keyboard, Settings};
        if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
            #[cfg(target_os = "macos")]
            let modifier = Key::Meta;
            #[cfg(not(target_os = "macos"))]
            let modifier = Key::Control;

            let _ = enigo.key(modifier, enigo::Direction::Press);
            let _ = enigo.key(Key::Unicode('v'), enigo::Direction::Click);
            let _ = enigo.key(modifier, enigo::Direction::Release);
        }
    })
    .join()
    .map_err(|_| "Failed to simulate paste".to_string())?;

    Ok(())
}
