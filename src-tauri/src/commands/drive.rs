use crate::drive;
use crate::drive::api::StorageMode;
use crate::drive::auth;
use crate::drive::sync;
use crate::drive::DriveManager;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

const CLIENT_ID: &str = env!("GOOGLE_CLIENT_ID");
const CLIENT_SECRET: &str = env!("GOOGLE_CLIENT_SECRET");

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveStatus {
    pub connected: bool,
    pub storage_mode: Option<String>,
    pub sync_status: String,
    pub last_synced: Option<String>,
    pub conflict_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthStartResult {
    pub auth_url: String,
    pub redirect_port: u16,
    pub code_verifier: String,
}

#[tauri::command]
pub async fn drive_start_auth(
    app_handle: AppHandle,
) -> Result<OAuthStartResult, String> {
    let (code_challenge, code_verifier) = auth::generate_pkce();

    let port = tauri_plugin_oauth::start_with_config(
        tauri_plugin_oauth::OauthConfig {
            ports: None,
            response: Some(std::borrow::Cow::Owned("<!DOCTYPE html><html><body><h1>Snibox</h1><p>You can close this window and return to Snibox.</p><script>window.close()</script></body></html>".to_string())),
        },
        move |url| {
            let _ = app_handle.emit("drive-oauth-callback", url);
        },
    )
    .map_err(|e| format!("Failed to start OAuth server: {}", e))?;

    let auth_helper = auth::DriveAuth::new(CLIENT_ID.to_string(), CLIENT_SECRET.to_string());
    let auth_url = auth_helper.build_auth_url(port, &code_challenge);

    Ok(OAuthStartResult {
        auth_url,
        redirect_port: port,
        code_verifier,
    })
}

#[tauri::command]
pub async fn drive_complete_auth(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    auth_code: String,
    redirect_port: u16,
    code_verifier: String,
    storage_mode: String,
) -> Result<(), String> {
    let mode = match storage_mode.as_str() {
        "folder" => StorageMode::Folder,
        _ => StorageMode::Appdata,
    };

    let params = drive::connect(
        CLIENT_ID,
        CLIENT_SECRET,
        mode,
        &auth_code,
        redirect_port,
        &code_verifier,
    )
    .await?;

    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let mode_str = match params.storage_mode {
            StorageMode::Appdata => "appdata",
            StorageMode::Folder => "folder",
        };
        sync::set_drive_state(&conn, "storage_mode", mode_str)?;
        if let Some(fid) = &params.folder_id {
            sync::set_drive_state(&conn, "folder_id", fid)?;
        }
        sync::set_drive_state(&conn, "connected", "true")?;
    }

    let mgr = DriveManager::start(
        params.auth,
        params.storage_mode,
        params.folder_id,
        app_handle.clone(),
    )?;
    mgr.enqueue_initial_sync();

    *state.drive.lock().await = Some(mgr);
    let _ = app_handle.emit("drive-sync-status", "syncing");

    Ok(())
}

#[tauri::command]
pub async fn drive_disconnect(state: State<'_, AppState>) -> Result<(), String> {
    *state.drive.lock().await = None;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    drive::disconnect(&conn)?;

    Ok(())
}

#[tauri::command]
pub async fn drive_get_status(state: State<'_, AppState>) -> Result<DriveStatus, String> {
    let drive = state.drive.lock().await;
    let worker_connected = drive.is_some();
    drop(drive);

    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let storage_mode = sync::get_drive_state(&conn, "storage_mode")?;
    let last_synced = sync::get_drive_state(&conn, "last_sync_time")?;
    let is_connected_state = sync::get_drive_state(&conn, "connected")?
        .map(|v| v == "true")
        .unwrap_or(false);

    let conflict_count = if worker_connected || is_connected_state {
        sync::get_conflict_count(&conn)?
    } else {
        0
    };

    Ok(DriveStatus {
        connected: worker_connected || is_connected_state,
        storage_mode,
        sync_status: if worker_connected {
            "idle".to_string()
        } else if is_connected_state {
            "offline".to_string()
        } else {
            "disconnected".to_string()
        },
        last_synced,
        conflict_count,
    })
}

#[tauri::command]
pub async fn drive_sync(state: State<'_, AppState>) -> Result<(), String> {
    let drive = state.drive.lock().await;
    let mgr = drive.as_ref().ok_or("Drive is not connected")?;
    mgr.enqueue_sync();
    Ok(())
}
