use crate::drive::api::{DriveApiClient, StorageMode};
use crate::drive::auth::DriveAuth;
use crate::drive::sync;
use rusqlite::Connection;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tokio::sync::{mpsc, Mutex};

#[derive(Debug, Clone)]
pub enum SyncJob {
    PushSnippet { snippet_id: String },
    DeleteRemote { snippet_id: String },
    IncrementalSync,
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

        let mut backoff = Duration::from_secs(1);
        let max_backoff = Duration::from_secs(300);

        loop {
            let job = match self.rx.recv().await {
                Some(job) => job,
                None => {
                    eprintln!("[drive-worker] Channel closed, shutting down");
                    return;
                }
            };

            let _ = self.app_handle.emit("drive-sync-status", "syncing");

            let result = self.process_job(&job).await;

            match result {
                Ok(()) => {
                    backoff = Duration::from_secs(1);
                    let _ = self.app_handle.emit("drive-sync-status", "idle");
                }
                Err(e) => {
                    if e.contains("revoked") || e.contains("invalid_grant") {
                        eprintln!("[drive-worker] Auth error: {}", e);
                        let _ = self.app_handle.emit("drive-sync-status", "auth_needed");
                        let _ = self.app_handle.emit("drive-auth-needed", ());
                        continue;
                    }

                    eprintln!(
                        "[drive-worker] Error processing {:?}, retrying in {:?}: {}",
                        job, backoff, e
                    );
                    let _ = self.app_handle.emit("drive-sync-status", "error");

                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(max_backoff);

                    if let Err(e) = self.process_job(&job).await {
                        eprintln!("[drive-worker] Retry also failed: {}", e);
                    } else {
                        backoff = Duration::from_secs(1);
                        let _ = self.app_handle.emit("drive-sync-status", "idle");
                    }
                }
            }
        }
    }

    async fn process_job(&self, job: &SyncJob) -> Result<(), String> {
        let mut auth = self.auth.lock().await;
        let folder_id = self.folder_id.as_deref();

        match job {
            SyncJob::PushSnippet { snippet_id } => {
                sync::push_single_snippet(
                    &mut auth,
                    &self.api,
                    &self.conn,
                    snippet_id,
                    self.storage_mode,
                    folder_id,
                )
                .await
            }
            SyncJob::DeleteRemote { snippet_id } => {
                sync::delete_remote_snippet(&mut auth, &self.api, &self.conn, snippet_id).await
            }
            SyncJob::IncrementalSync => {
                sync::incremental_sync(
                    &mut auth,
                    &self.api,
                    &self.conn,
                    self.storage_mode,
                    folder_id,
                )
                .await
                .map(|_| ())
            }
            SyncJob::InitialSync => {
                sync::initial_sync(
                    &mut auth,
                    &self.api,
                    &self.conn,
                    self.storage_mode,
                    folder_id,
                )
                .await
                .map(|stats| {
                    eprintln!(
                        "[drive] Initial sync: imported={} exported={} updated={} conflicts={}",
                        stats.imported, stats.exported, stats.updated, stats.conflicts
                    );
                })
            }
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
            if tx.try_send(SyncJob::IncrementalSync).is_err() {
                break;
            }
        }
    })
}
