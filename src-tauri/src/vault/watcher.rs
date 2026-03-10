use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct VaultWatcher {
    _watcher: RecommendedWatcher,
}

impl VaultWatcher {
    pub fn new<P: AsRef<Path>>(vault_path: P, app_handle: AppHandle) -> Result<Self, String> {
        let (tx, rx): (
            Sender<notify::Result<Event>>,
            Receiver<notify::Result<Event>>,
        ) = channel();
        let snippets_dir = vault_path.as_ref().join("snippets");

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            let _ = tx.send(res);
        })
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        watcher
            .watch(&snippets_dir, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch directory: {}", e))?;

        let app = app_handle.clone();
        std::thread::spawn(move || {
            let mut last_event_time = std::time::Instant::now();
            let debounce_duration = Duration::from_millis(300);

            loop {
                if let Ok(Ok(event)) = rx.recv_timeout(Duration::from_millis(100)) {
                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                            last_event_time = std::time::Instant::now();
                        }
                        _ => continue,
                    }
                }

                if last_event_time.elapsed() >= debounce_duration
                    && last_event_time.elapsed() < debounce_duration + Duration::from_millis(100)
                {
                    let _ = app.emit("vault-snippets-changed", ());
                    last_event_time = std::time::Instant::now() - debounce_duration;
                }
            }
        });

        Ok(Self { _watcher: watcher })
    }
}
