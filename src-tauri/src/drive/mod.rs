pub mod api;
pub mod auth;
pub mod conflict;
pub mod sync;
pub mod worker;

use api::{DriveApiClient, StorageMode};
use auth::DriveAuth;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use worker::{SyncJob, SyncWorker};

const SYNC_INTERVAL_SECS: u64 = 300;

pub struct DriveManager {
    pub auth: Arc<Mutex<DriveAuth>>,
    pub api: Arc<DriveApiClient>,
    pub storage_mode: StorageMode,
    pub folder_id: Option<String>,
    pub tx: mpsc::Sender<SyncJob>,
    _periodic_handle: tokio::task::JoinHandle<()>,
}

impl DriveManager {
    pub fn start(
        auth: DriveAuth,
        storage_mode: StorageMode,
        folder_id: Option<String>,
        app_handle: tauri::AppHandle,
    ) -> Result<Self, String> {
        let worker_conn = crate::db::open_connection()
            .map_err(|e| format!("Failed to open worker DB connection: {}", e))?;

        let auth = Arc::new(Mutex::new(auth));
        let api = Arc::new(DriveApiClient::new());
        let (tx, rx) = mpsc::channel::<SyncJob>(256);

        let worker = SyncWorker::new(
            rx,
            auth.clone(),
            api.clone(),
            worker_conn,
            storage_mode,
            folder_id.clone(),
            app_handle,
        );
        tokio::spawn(worker.run());

        let periodic_handle = worker::spawn_periodic_sync(tx.clone(), SYNC_INTERVAL_SECS);

        Ok(Self {
            auth,
            api,
            storage_mode,
            folder_id,
            tx,
            _periodic_handle: periodic_handle,
        })
    }

    pub fn enqueue_push(&self, snippet_id: &str) {
        let _ = self.tx.try_send(SyncJob::PushSnippet {
            snippet_id: snippet_id.to_string(),
        });
    }

    pub fn enqueue_delete(&self, snippet_id: &str) {
        let _ = self.tx.try_send(SyncJob::DeleteRemote {
            snippet_id: snippet_id.to_string(),
        });
    }

    pub fn enqueue_sync(&self) {
        let _ = self.tx.try_send(SyncJob::IncrementalSync);
    }

    pub fn enqueue_initial_sync(&self) {
        let _ = self.tx.try_send(SyncJob::InitialSync);
    }
}

pub struct DriveConnectParams {
    pub storage_mode: StorageMode,
    pub folder_id: Option<String>,
    pub auth: DriveAuth,
}

pub async fn connect(
    client_id: &str,
    client_secret: &str,
    storage_mode: StorageMode,
    auth_code: &str,
    redirect_port: u16,
    code_verifier: &str,
) -> Result<DriveConnectParams, String> {
    let mut auth = DriveAuth::new(client_id.to_string(), client_secret.to_string());
    auth.exchange_code(auth_code, redirect_port, code_verifier)
        .await?;

    let api = DriveApiClient::new();

    let folder_id = match storage_mode {
        StorageMode::Folder => {
            let token = auth.get_valid_token().await?;
            let folder = api.find_or_create_folder(&token, "Snibox", storage_mode).await?;
            Some(folder.id)
        }
        StorageMode::Appdata => None,
    };

    Ok(DriveConnectParams {
        storage_mode,
        folder_id,
        auth,
    })
}

pub struct DriveReconnectParams {
    pub storage_mode: StorageMode,
    pub folder_id: Option<String>,
}

pub fn read_reconnect_params(conn: &rusqlite::Connection) -> Result<Option<DriveReconnectParams>, String> {
    let connected = sync::get_drive_state(conn, "connected")?
        .map(|v| v == "true")
        .unwrap_or(false);

    if !connected {
        return Ok(None);
    }

    let mode_str = sync::get_drive_state(conn, "storage_mode")?
        .unwrap_or_else(|| "appdata".to_string());
    let storage_mode = if mode_str == "folder" {
        StorageMode::Folder
    } else {
        StorageMode::Appdata
    };
    let folder_id = sync::get_drive_state(conn, "folder_id")?;

    Ok(Some(DriveReconnectParams {
        storage_mode,
        folder_id,
    }))
}

pub async fn reconnect(
    client_id: &str,
    client_secret: &str,
    params: DriveReconnectParams,
    app_handle: tauri::AppHandle,
) -> Result<DriveManager, String> {
    let mut auth = DriveAuth::new(client_id.to_string(), client_secret.to_string());
    auth.refresh_access_token().await?;

    let mgr = DriveManager::start(auth, params.storage_mode, params.folder_id, app_handle)?;
    mgr.enqueue_sync();

    Ok(mgr)
}

pub fn disconnect(conn: &rusqlite::Connection) -> Result<(), String> {
    let mut auth = DriveAuth::new(String::new(), String::new());
    auth.clear_tokens()?;
    sync::clear_drive_tables(conn)?;
    Ok(())
}
