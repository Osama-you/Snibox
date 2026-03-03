mod commands;
mod db;
mod drive;
mod state;
mod vault;

use rusqlite::Connection;
use state::AppState;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconEvent,
    Emitter, Manager,
};
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

fn register_global_hotkey(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let shortcuts_to_try = [
        "CmdOrCtrl+Shift+Space",
        "CmdOrCtrl+Space",
        "Super+Shift+S",
    ];

    for shortcut_str in &shortcuts_to_try {
        match shortcut_str.parse::<Shortcut>() {
            Ok(shortcut) => {
                match app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                }) {
                    Ok(()) => {
                        eprintln!("[snibox] Global hotkey registered: {}", shortcut_str);
                        return Ok(());
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

    eprintln!("[snibox] WARNING: No global hotkey could be registered. Use the tray icon to toggle the window.");
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
            commands::snippets::toggle_pin,
            commands::snippets::record_used,
            commands::clipboard::copy_to_clipboard,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::drafts::save_draft,
            commands::drafts::get_draft,
            commands::drafts::discard_draft,
            commands::vault::get_vault_status,
            commands::vault::set_vault_folder,
            commands::vault::clear_vault_folder,
            commands::vault::export_to_vault,
            commands::vault::sync_vault,
            commands::drive::drive_start_auth,
            commands::drive::drive_complete_auth,
            commands::drive::drive_disconnect,
            commands::drive::drive_get_status,
            commands::drive::drive_sync,
        ])
        .setup(|app| {
            setup_tray(app)?;
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
