use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

/// Parse a deep-link URL (e.g. `vortex://session/ABC123/invite/TOKEN456`)
/// or a web URL (e.g. `https://vortex-rooms.com/session/ABC123/invite/TOKEN456`)
/// into a relative path that the WebView can navigate to.
/// Returns `None` if the URL doesn't match a known route.
fn parse_deep_link_path(raw_url: &str) -> Option<String> {
    // Handle vortex:// scheme — url crate may not parse opaque schemes well,
    // so normalise to https:// first for reliable path parsing.
    let normalised = if raw_url.starts_with("vortex://") {
        raw_url.replacen("vortex://", "https://vortex.local/", 1)
    } else {
        raw_url.to_string()
    };

    let url = Url::parse(&normalised).ok()?;
    let path = url.path().trim_start_matches('/');

    // Only allow session invite routes for now
    // Expected format: session/{sessionId}/invite/{inviteToken}
    let segments: Vec<&str> = path.split('/').collect();
    if segments.len() == 4
        && segments[0] == "session"
        && segments[2] == "invite"
        && !segments[1].is_empty()
        && !segments[3].is_empty()
    {
        Some(format!(
            "/session/{}/invite/{}",
            segments[1], segments[3]
        ))
    } else {
        None
    }
}

/// Focus the main window and navigate to the given path.
fn focus_and_navigate(app: &tauri::AppHandle, path: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();

        let nav_url = format!("https://vortex-rooms.com{}", path);
        let js = format!(
            "window.location.href = '{}';",
            nav_url.replace('\'', "\\'")
        );
        let _ = window.eval(&js);
    }
}

/// Process a list of deep-link URLs, navigating to the first valid one.
fn handle_deep_link_urls(app: &tauri::AppHandle, urls: Vec<Url>) {
    for url in urls {
        if let Some(path) = parse_deep_link_path(url.as_str()) {
            focus_and_navigate(app, &path);
            break;
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
        // When a second instance is launched (e.g. from a deep link click),
        // the OS passes the URL as an argument. Focus the existing window
        // and navigate to the invite route if applicable.
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }

        // argv[0] is the executable path; look for a deep-link URL in remaining args
        for arg in argv.iter().skip(1) {
            if let Some(path) = parse_deep_link_path(arg) {
                focus_and_navigate(app, &path);
                break;
            }
        }
    }));

    builder
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Handle deep-link URLs received at runtime (e.g. while app is running)
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls().to_vec();
                handle_deep_link_urls(&handle, urls);
            });

            // Handle deep-link URLs that launched the app (cold start)
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                let handle = app.handle().clone();
                // Defer navigation slightly to ensure the WebView is ready
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    handle_deep_link_urls(&handle, urls);
                });
            }

            #[cfg(desktop)]
            {
                let show = MenuItem::with_id(app, "show", "Show Vortex", true, None::<&str>)?;
                let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

                let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .menu(&menu)
                    .tooltip("Vortex")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
