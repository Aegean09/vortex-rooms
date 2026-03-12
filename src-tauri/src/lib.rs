use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;

#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

/// Parsed deep-link route information.
enum DeepLinkRoute {
    /// An invite route: session ID and invite token.
    Invite { session_id: String, invite_token: String },
}

/// Parse a deep-link URL (e.g. `vortex://session/ABC123/invite/TOKEN456`)
/// or a web URL (e.g. `https://vortex-rooms.com/session/ABC123/invite/TOKEN456`)
/// into a structured route. Returns `None` if the URL doesn't match a known route.
fn parse_deep_link_route(raw_url: &str) -> Option<DeepLinkRoute> {
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
        Some(DeepLinkRoute::Invite {
            session_id: segments[1].to_string(),
            invite_token: segments[3].to_string(),
        })
    } else {
        None
    }
}

/// Focus the main window and navigate based on the parsed route.
/// For invite routes, stores the invite token in sessionStorage and
/// navigates directly to `/session/{id}/setup`, bypassing the invite page
/// entirely. This prevents the double-redirect loop where the invite page's
/// deep-link logic would fire again inside the Tauri WebView.
fn focus_and_navigate(app: &tauri::AppHandle, route: &DeepLinkRoute) {
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(desktop)]
        {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }

        let js = match route {
            DeepLinkRoute::Invite { session_id, invite_token } => {
                // Store the invite token in sessionStorage (same key the invite page uses),
                // then navigate directly to the setup page — skipping the invite page entirely.
                format!(
                    "sessionStorage.setItem('vortex-invite-token-{}', '{}'); window.location.href = 'https://vortex-rooms.com/session/{}/setup';",
                    session_id.replace('\'', "\\'"),
                    invite_token.replace('\'', "\\'"),
                    session_id.replace('\'', "\\'")
                )
            }
        };
        let _ = window.eval(&js);
    }
}

/// Process a list of deep-link URLs, navigating to the first valid one.
fn handle_deep_link_urls(app: &tauri::AppHandle, urls: Vec<Url>) {
    for url in urls {
        if let Some(route) = parse_deep_link_route(url.as_str()) {
            focus_and_navigate(app, &route);
            break;
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init());

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

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
            if let Some(route) = parse_deep_link_route(arg) {
                focus_and_navigate(app, &route);
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
