mod commands;
mod db;
mod drive;
mod state;
mod sync_state;
mod vault;

use rusqlite::Connection;
use state::AppState;
use std::collections::HashSet;
use std::net::TcpListener;
use std::sync::Mutex;
use std::thread;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconEvent,
    Emitter, Manager,
};
#[cfg(target_os = "linux")]
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

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

fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItemBuilder::with_id("show", "Show Snibox").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))?;
        tray.on_menu_event(move |app, event| match event.id().as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        });
        tray.on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
    }

    Ok(())
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("window-shown", ());
        }
    }
}

fn start_local_toggle_listener(app: &tauri::AppHandle) {
    let app_handle = app.clone();
    thread::spawn(move || {
        let listener = match TcpListener::bind("127.0.0.1:17391") {
            Ok(listener) => listener,
            Err(e) => {
                eprintln!("[snibox] Local toggle listener unavailable on 127.0.0.1:17391: {}", e);
                return;
            }
        };

        eprintln!("[snibox] Local toggle listener ready on 127.0.0.1:17391");

        for stream in listener.incoming() {
            match stream {
                Ok(_) => {
                    let handle = app_handle.clone();
                    if let Err(e) = handle.run_on_main_thread({
                        let handle_for_ui = handle.clone();
                        move || toggle_main_window(&handle_for_ui)
                    }) {
                        eprintln!("[snibox] Failed to toggle from local listener: {}", e);
                    }
                }
                Err(e) => {
                    eprintln!("[snibox] Local toggle listener error: {}", e);
                }
            }
        }
    });
}

fn get_global_hotkey_setting(app: &tauri::App) -> Option<String> {
    let state = app.state::<AppState>();
    let conn = state.db.lock().ok()?;
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'global_hotkey'",
        [],
        |row| row.get(0),
    )
    .ok()
}

fn set_global_hotkey_setting(app: &tauri::App, value: &str) {
    let state = app.state::<AppState>();
    let conn_lock = state.db.lock();
    if let Ok(conn) = conn_lock {
        let _ = conn.execute(
            "INSERT INTO settings (key, value) VALUES ('global_hotkey', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [value],
        );
    }
}

#[cfg(target_os = "linux")]
fn is_wayland_session() -> bool {
    std::env::var("XDG_SESSION_TYPE")
        .map(|v| v.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
        || std::env::var_os("WAYLAND_DISPLAY").is_some()
}

#[cfg(target_os = "linux")]
fn is_waydroid_session() -> bool {
    std::env::vars_os().any(|(k, _)| k.to_string_lossy().starts_with("WAYDROID"))
}

#[cfg(target_os = "linux")]
fn show_wayland_hotkey_help(app: &tauri::App, registered: Option<&str>, always_show: bool) {
    let mut message = String::new();
    if let Some(shortcut) = registered {
        message.push_str(&format!(
            "Snibox registered this shortcut: {shortcut}\n\
If pressing it does not open Snibox, your compositor/session is intercepting it.\n\n"
        ));
    } else {
        message.push_str("Snibox could not register a global shortcut on your Wayland/Waydroid session.\n\n");
    }

    if always_show {
        message.push_str("Wayland/Waydroid sessions can block global shortcuts from desktop apps.\n\n");
    }

    message.push_str(
        "To fix this, free one of these shortcuts in System Settings -> Keyboard -> Keyboard Shortcuts:\n\
- Ctrl+Shift+Space\n\
- Ctrl+Space\n\
- Ctrl+Alt+S\n\
\n\
Ubuntu quick commands (run in terminal):\n\
gsettings set org.gnome.desktop.wm.keybindings switch-input-source \"[]\"\n\
gsettings set org.gnome.desktop.wm.keybindings switch-input-source-backward \"[]\"\n\
gsettings set org.freedesktop.ibus.general.hotkey trigger \"[]\"\n\
gsettings set org.freedesktop.ibus.general.hotkey triggers \"[]\"\n\
\n\
Then restart Snibox."
    );

    app.dialog()
        .message(message)
        .title("Snibox Shortcut Setup")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::Ok)
        .show(|_| {});
}

fn register_global_hotkey(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let mut shortcuts_to_try = vec!["CmdOrCtrl+Shift+Space".to_string(), "CmdOrCtrl+Space".to_string()];

    #[cfg(target_os = "linux")]
    {
        if is_wayland_session() {
            // Wayland sessions often reserve Space combinations for input-source switching.
            shortcuts_to_try = vec![
                "Ctrl+Alt+S".to_string(),
                "Super+Shift+S".to_string(),
                "Ctrl+Alt+Space".to_string(),
                "CmdOrCtrl+Space".to_string(),
                "CmdOrCtrl+Shift+Space".to_string(),
            ];
        } else {
            shortcuts_to_try.extend([
                "Ctrl+Alt+Space".to_string(),
                "Ctrl+Alt+S".to_string(),
                "Super+Shift+S".to_string(),
            ]);
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        shortcuts_to_try.push("Super+Shift+S".to_string());
    }

    if let Some(custom) = get_global_hotkey_setting(app) {
        if !custom.is_empty() {
            shortcuts_to_try.insert(0, custom);
        }
    }

    let mut registered_any = false;
    let mut first_registered: Option<String> = None;
    let mut seen = HashSet::new();

    for shortcut_str in shortcuts_to_try {
        if !seen.insert(shortcut_str.clone()) {
            continue;
        }

        match shortcut_str.parse::<Shortcut>() {
            Ok(shortcut) => {
                if app.global_shortcut().is_registered(shortcut) {
                    continue;
                }
                match app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                }) {
                    Ok(()) => {
                        eprintln!("[snibox] Global hotkey registered: {}", shortcut_str);
                        if first_registered.is_none() {
                            first_registered = Some(shortcut_str.clone());
                        }
                        registered_any = true;
                    }
                    Err(e) => {
                        eprintln!("[snibox] Failed to register {}: {}", shortcut_str, e);
                    }
                }
            }
            Err(e) => {
                eprintln!("[snibox] Failed to parse shortcut {}: {}", shortcut_str, e);
            }
        }
    }

    if !registered_any {
        eprintln!(
            "[snibox] WARNING: No global hotkey could be registered. Your desktop environment may reserve these shortcuts. Use the tray icon to toggle the window."
        );
    } else if let Some(ref registered) = first_registered {
        if get_global_hotkey_setting(app).as_deref() != Some(registered.as_str()) {
            set_global_hotkey_setting(app, registered);
            eprintln!("[snibox] Active global hotkey set to: {}", registered);
        }
    }

    #[cfg(target_os = "linux")]
    {
        let show_help_always = is_waydroid_session() || is_wayland_session();
        if show_help_always {
            show_wayland_hotkey_help(app, first_registered.as_deref(), true);
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let conn = db::init_db().expect("Failed to initialize database");

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_opener::init());

    // Only register updater in release builds — dev has no valid signing key
    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(AppState {
            db: Mutex::new(conn),
            vault: Mutex::new(None),
            watcher: Mutex::new(None),
            drive: tokio::sync::Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::window::toggle_window,
            commands::window::show_window,
            commands::window::hide_window,
            commands::window::app_ready,
            commands::window::set_window_size,
            commands::snippets::list_snippets,
            commands::snippets::get_snippet,
            commands::snippets::create_snippet,
            commands::snippets::update_snippet,
            commands::snippets::delete_snippet,
            commands::snippets::restore_snippet,
            commands::snippets::duplicate_snippet,
            commands::snippets::toggle_pin,
            commands::snippets::record_used,
            commands::clipboard::copy_to_clipboard,
            commands::clipboard::copy_and_paste,
            commands::clipboard::copy_text,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::drafts::save_draft,
            commands::drafts::get_draft,
            commands::drafts::discard_draft,
            commands::vault::get_vault_status,
            commands::vault::set_vault_folder,
            commands::vault::clear_vault_folder,
            commands::vault::export_to_vault,
            commands::vault::export_backup,
            commands::vault::import_backup,
            commands::vault::sync_vault,
            commands::drive::drive_start_auth,
            commands::drive::drive_complete_auth,
            commands::drive::drive_disconnect,
            commands::drive::drive_get_status,
            commands::drive::drive_sync,
            commands::sync::get_sync_status,
            commands::sync::retry_sync,
            commands::sync::list_sync_conflicts,
            commands::sync::get_sync_conflict,
            commands::sync::resolve_sync_conflict,
            commands::sync::list_sync_activity,
        ])
        .setup(|app| {
            setup_tray(app)?;
            start_local_toggle_listener(app.handle());
            register_global_hotkey(app)?;
            
            let app_handle = app.handle().clone();
            let state = app.state::<AppState>();
            
            if let Ok(conn) = state.db.lock() {
                if let Ok(Some(vault_path)) = get_vault_path_from_settings(&conn) {
                    if let Ok(vault_manager) = vault::VaultManager::new(&vault_path) {
                        match vault_manager.sync_with_database(&conn) {
                            Ok(stats) => eprintln!(
                                "[snibox] Startup vault sync: imported={} exported={} updated={} conflicts={}",
                                stats.imported, stats.exported, stats.updated, stats.conflicts
                            ),
                            Err(e) => eprintln!("[snibox] Startup vault sync failed: {}", e),
                        }
                        drop(conn);
                        if let Ok(watcher) = vault_manager.start_watcher(app_handle) {
                            *state.vault.lock().unwrap() = Some(vault_manager);
                            *state.watcher.lock().unwrap() = Some(watcher);
                            eprintln!("[snibox] Vault initialized at: {}", vault_path);
                        }
                    }
                }
            }

            let reconnect_params = {
                let ds = app.state::<AppState>();
                let result = if let Ok(conn) = ds.db.lock() {
                    drive::read_reconnect_params(&conn).ok().flatten()
                } else {
                    None
                };
                result
            };

            if let Some(params) = reconnect_params {
                let handle_for_drive = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match drive::reconnect(
                        env!("GOOGLE_CLIENT_ID"),
                        env!("GOOGLE_CLIENT_SECRET"),
                        params,
                        handle_for_drive.clone(),
                    )
                    .await
                    {
                        Ok(mgr) => {
                            let state = handle_for_drive.state::<AppState>();
                            *state.drive.lock().await = Some(mgr);
                            eprintln!("[snibox] Google Drive reconnected");
                        }
                        Err(e) => {
                            eprintln!("[snibox] Google Drive reconnect failed: {}", e);
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
