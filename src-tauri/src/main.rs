// Hides the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Wry};

const APP_NAME: &str = "Cue/Playlist to Text Converter";

/// Writes text to a path the user picked in the Save dialog.
#[tauri::command]
fn save_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Opens the About window, or brings it to the front if it is already open.
/// With `check_updates` the window also starts an update check as soon as it is ready.
fn show_about(app: &AppHandle, check_updates: bool) {
    if let Some(win) = app.get_webview_window("about") {
        let _ = win.show();
        let _ = win.set_focus();
        if check_updates {
            let _ = app.emit_to("about", "check-updates", ());
        }
        return;
    }

    let mut builder = WebviewWindowBuilder::new(app, "about", WebviewUrl::App("about.html".into()))
        .title(format!("About {APP_NAME}"))
        .inner_size(640.0, 780.0)
        .min_inner_size(480.0, 520.0)
        .minimizable(false)
        .maximizable(false);
    if check_updates {
        builder = builder.initialization_script("window.__CHECK_ON_OPEN = true;");
    }
    if let Err(err) = builder.build() {
        eprintln!("could not open the About window: {err}");
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let quit = MenuItemBuilder::with_id("quit", "Quit")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;
    let about = MenuItemBuilder::with_id("about", format!("About {APP_NAME}")).build(app)?;
    let updates = MenuItemBuilder::with_id("check-updates", "Check for Updates...").build(app)?;

    // On macOS the first menu becomes the application menu, so it only holds Quit.
    let file = SubmenuBuilder::new(app, "File").item(&quit).build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let help = SubmenuBuilder::new(app, "Help")
        .item(&updates)
        .separator()
        .item(&about)
        .build()?;

    MenuBuilder::new(app).item(&file).item(&edit).item(&help).build()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![save_text])
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().0.as_str() {
            "about" => show_about(app, false),
            "check-updates" => show_about(app, true),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_window_event(|window, event| {
            // Closing the main window ends the app, even if About is still open.
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
