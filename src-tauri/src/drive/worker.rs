use crate::drive::api::{DriveApiClient, StorageMode};
use crate::drive::auth::DriveAuth;
use crate::drive::sync;
use crate::sync_state;
use rusqlite::Connection;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tokio::sync::{mpsc, Mutex};

#[derive(Debug, Clone)]
pub enum SyncJob {
    RunSync,
    InitialSync,
}

pub struct SyncWorker {
    rx: mpsc::Receiver<SyncJob>,
    auth: Arc<Mutex<DriveAuth>>,
    api: Arc<DriveApiClient>,
    conn: Arc<StdMutex<Connection>>,
    storage_mode: StorageMode,
    folder_id: Option<String>,
    app_handle: tauri::AppHandle,
}

impl SyncWorker {
    pub fn new(
        rx: mpsc::Receiver<SyncJob>,
        auth: Arc<Mutex<DriveAuth>>,
        api: Arc<DriveApiClient>,
        conn: Connection,
        storage_mode: StorageMode,
        folder_id: Option<String>,
        app_handle: tauri::AppHandle,
    ) -> Self {
        Self {
            rx,
            auth,
            api,
            conn: Arc::new(StdMutex::new(conn)),
            storage_mode,
            folder_id,
            app_handle,
        }
    }

    pub async fn run(mut self) {
        use tauri::Emitter;

        let mut backoff = Duration::from_secs(2);
        let max_backoff = Duration::from_secs(120);

        while let Some(job) = self.rx.recv().await {
            let _ = self.app_handle.emit("drive-sync-status", sync_state::SYNC_STATUS_SYNCING);
            if let Ok(conn) = self.conn.lock() {
                let _ = sync_state::set_global_sync_status(
                    &conn,
                    sync_state::SYNC_STATUS_SYNCING,
                    None,
                    false,
                );
            }

            match self.process_job(&job).await {
                Ok(()) => {
                    backoff = Duration::from_secs(2);
                    if let Ok(conn) = self.conn.lock() {
                        let _ = sync_state::set_global_sync_status(
                            &conn,
                            sync_state::SYNC_STATUS_IDLE,
                            None,
                            false,
                        );
                    }
                    let _ = self.app_handle.emit("drive-sync-status", sync_state::SYNC_STATUS_IDLE);
                }
                Err(error) => {
                    let auth_error = error.contains("revoked") || error.contains("invalid_grant");
                    if let Ok(conn) = self.conn.lock() {
                        let _ = sync_state::set_global_sync_status(
                            &conn,
                            if auth_error {
                                sync_state::SYNC_STATUS_AUTH_NEEDED
                            } else {
                                sync_state::SYNC_STATUS_ERROR
                            },
                            Some(&error),
                            auth_error,
                        );
                        let _ = sync_state::log_activity(
                            &conn,
                            "error",
                            "worker",
                            &format!("Sync job failed: {error}"),
                            None,
                        );
                    }

                    let _ = self.app_handle.emit(
                        "drive-sync-status",
                        if auth_error {
                            sync_state::SYNC_STATUS_AUTH_NEEDED
                        } else {
                            sync_state::SYNC_STATUS_ERROR
                        },
                    );
                    if auth_error {
                        let _ = self.app_handle.emit("drive-auth-needed", ());
                        continue;
                    }

                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(max_backoff);
                }
            }
        }
    }

    async fn process_job(&self, job: &SyncJob) -> Result<(), String> {
        let mut auth = self.auth.lock().await;
        let folder_id = self.folder_id.as_deref();

        match job {
            SyncJob::InitialSync => sync::initial_sync(
                &mut auth,
                &self.api,
                &self.conn,
                self.storage_mode,
                folder_id,
            )
            .await
            .map(|_| ()),
            SyncJob::RunSync => sync::incremental_sync(
                &mut auth,
                &self.api,
                &self.conn,
                self.storage_mode,
                folder_id,
            )
            .await
            .map(|_| ()),
        }
    }
}

pub fn spawn_periodic_sync(
    tx: mpsc::Sender<SyncJob>,
    interval_secs: u64,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));
        interval.tick().await;

        loop {
            interval.tick().await;
            if tx.try_send(SyncJob::RunSync).is_err() {
                break;
            }
        }
    })
}
