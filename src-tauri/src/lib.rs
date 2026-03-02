mod commands;
mod db;
mod state;

use state::AppState;
use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconEvent,
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

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

fn register_global_hotkey(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut: Shortcut = "CmdOrCtrl+Shift+Space".parse()?;

    app.global_shortcut().on_shortcut(shortcut, move |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
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
    })?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let conn = db::init_db().expect("Failed to initialize database");

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init());

    // Only register updater in release builds — dev has no valid signing key
    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(AppState {
            db: Mutex::new(conn),
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
        ])
        .setup(|app| {
            setup_tray(app)?;
            register_global_hotkey(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
