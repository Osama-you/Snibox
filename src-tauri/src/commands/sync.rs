use crate::state::AppState;
use crate::sync_state::{
    self, ConflictResolutionStrategy, SyncActivityItem, SyncConflictRecord, SyncStatusPayload,
};
use crate::vault::format::VaultSnippet;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveConflictPayload {
    pub strategy: ConflictResolutionStrategy,
    pub title: Option<String>,
    pub content: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub async fn get_sync_status(state: State<'_, AppState>) -> Result<SyncStatusPayload, String> {
    let connected = state.drive.lock().await.is_some();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    sync_state::get_sync_status(&conn, connected)
}

#[tauri::command]
pub async fn retry_sync(state: State<'_, AppState>) -> Result<(), String> {
    let drive = state.drive.lock().await;
    let manager = drive
        .as_ref()
        .ok_or_else(|| "Google Drive is not connected".to_string())?;
    manager.enqueue_sync();
    Ok(())
}

#[tauri::command]
pub fn list_sync_conflicts(state: State<AppState>) -> Result<Vec<SyncConflictRecord>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    sync_state::list_open_conflicts(&conn)
}

#[tauri::command]
pub fn get_sync_conflict(
    state: State<AppState>,
    conflict_id: String,
) -> Result<Option<SyncConflictRecord>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    sync_state::get_conflict(&conn, &conflict_id)
}

#[tauri::command]
pub fn list_sync_activity(
    state: State<AppState>,
    limit: Option<i64>,
) -> Result<Vec<SyncActivityItem>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    sync_state::list_sync_activity(&conn, limit.unwrap_or(20))
}

#[tauri::command]
pub async fn resolve_sync_conflict(
    state: State<'_, AppState>,
    conflict_id: String,
    resolution: ResolveConflictPayload,
) -> Result<(), String> {
    let snippet_id = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let conflict = sync_state::get_conflict(&conn, &conflict_id)?
            .ok_or_else(|| "Conflict not found".to_string())?;

        match resolution.strategy {
            ConflictResolutionStrategy::KeepLocal => {
                sync_state::touch_snippet_for_sync(&conn, &conflict.snippet_id)?;
                sync_state::queue_operation(&conn, &conflict.snippet_id, "upsert", "resolve_keep_local")?;
                sync_state::close_conflict(&conn, &conflict_id, "resolved_keep_local")?;
                sync_state::log_activity(
                    &conn,
                    "info",
                    "conflict_resolved",
                    "Kept local version",
                    Some(&conflict.snippet_id),
                )?;
            }
            ConflictResolutionStrategy::KeepRemote => {
                sync_state::insert_or_replace_snippet(&conn, &conflict.remote_snippet)?;
                sync_state::mark_snippet_synced(&conn, &conflict.snippet_id, None)?;
                sync_state::clear_queue_for_snippet(&conn, &conflict.snippet_id)?;
                sync_state::close_conflict(&conn, &conflict_id, "resolved_keep_remote")?;
                sync_state::log_activity(
                    &conn,
                    "info",
                    "conflict_resolved",
                    "Kept remote version",
                    Some(&conflict.snippet_id),
                )?;
            }
            ConflictResolutionStrategy::DuplicateBoth => {
                sync_state::duplicate_remote_snippet(&conn, &conflict)?;
                sync_state::touch_snippet_for_sync(&conn, &conflict.snippet_id)?;
                sync_state::queue_operation(&conn, &conflict.snippet_id, "upsert", "resolve_duplicate_both")?;
                sync_state::close_conflict(&conn, &conflict_id, "resolved_duplicate_both")?;
                sync_state::log_activity(
                    &conn,
                    "info",
                    "conflict_resolved",
                    "Duplicated remote version and kept local",
                    Some(&conflict.snippet_id),
                )?;
            }
            ConflictResolutionStrategy::MergeManual => {
                let title = resolution
                    .title
                    .or(conflict.local_snippet.snippet.title.clone());
                let content = resolution
                    .content
                    .unwrap_or(conflict.local_snippet.snippet.content.clone());
                let tags = resolution.tags.unwrap_or(conflict.local_snippet.tags.clone());
                let merged = VaultSnippet {
                    id: conflict.snippet_id.clone(),
                    title,
                    content,
                    tags,
                    pinned: conflict.local_snippet.snippet.pinned,
                    created_at: conflict.local_snippet.snippet.created_at.clone(),
                    updated_at: sync_state::now_timestamp(),
                };
                sync_state::insert_or_replace_snippet(&conn, &merged)?;
                sync_state::touch_snippet_for_sync(&conn, &conflict.snippet_id)?;
                sync_state::queue_operation(&conn, &conflict.snippet_id, "upsert", "resolve_merge_manual")?;
                sync_state::close_conflict(&conn, &conflict_id, "resolved_merge_manual")?;
                sync_state::log_activity(
                    &conn,
                    "info",
                    "conflict_resolved",
                    "Merged conflict manually",
                    Some(&conflict.snippet_id),
                )?;
            }
        }

        conflict.snippet_id
    };

    if let Ok(drive) = state.drive.try_lock() {
        if let Some(manager) = drive.as_ref() {
            manager.enqueue_sync();
        }
    }

    let connected = state.drive.lock().await.is_some();
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let status = sync_state::get_sync_status(&conn, connected)?;
    if status.conflict_count == 0 {
        sync_state::log_activity(
            &conn,
            "info",
            "conflict_inbox",
            "Conflict inbox cleared",
            Some(&snippet_id),
        )?;
    }

    Ok(())
}
