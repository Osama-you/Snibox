use crate::drive::DriveManager;
use crate::vault::watcher::VaultWatcher;
use crate::vault::VaultManager;
use rusqlite::Connection;
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub vault: Mutex<Option<VaultManager>>,
    pub watcher: Mutex<Option<VaultWatcher>>,
    pub drive: tokio::sync::Mutex<Option<DriveManager>>,
}
