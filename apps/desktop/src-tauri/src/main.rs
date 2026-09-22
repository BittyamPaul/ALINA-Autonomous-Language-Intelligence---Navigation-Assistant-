// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use serde::{Deserialize, Serialize};
use commands::*;
use std::io::Write;

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemStatusResponse {
    pub db_connected: bool,
    pub agent_ready: bool,
    pub active_tasks: u32,
    pub pending_approvals: u32,
    pub allowed_roots: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApprovalDecisionPayload {
    pub request_id: String,
    pub approved: bool,
    pub reviewer_note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppMetadataResponse {
    pub name: String,
    pub version: String,
    pub identifier: String,
    pub os: String,
    pub target_arch: String,
    pub is_production: bool,
}

#[tauri::command]
fn get_system_status() -> Result<SystemStatusResponse, String> {
    Ok(SystemStatusResponse {
        db_connected: false,
        agent_ready: true,
        active_tasks: 0,
        pending_approvals: 0,
        allowed_roots: vec!["./workspace".into()],
    })
}

#[tauri::command]
fn get_system_metadata() -> Result<AppMetadataResponse, String> {
    Ok(AppMetadataResponse {
        name: "ALINA".into(),
        version: "1.0.0".into(),
        identifier: "ai.alina.desktop".into(),
        os: std::env::consts::OS.into(),
        target_arch: std::env::consts::ARCH.into(),
        is_production: !cfg!(debug_assertions),
    })
}

#[tauri::command]
fn resolve_approval(decision: ApprovalDecisionPayload) -> Result<bool, String> {
    println!("[ALINA Native] Received HITL decision: {:?}", decision);
    Ok(true)
}

#[tauri::command]
fn request_app_restart(app_handle: tauri::AppHandle) -> Result<bool, String> {
    println!("[ALINA Native] Application restart triggered by user.");
    app_handle.restart();
}

#[tauri::command]
fn request_app_shutdown(app_handle: tauri::AppHandle) -> Result<bool, String> {
    println!("[ALINA Native] Application clean shutdown requested.");
    app_handle.exit(0);
    Ok(true)
}

fn setup_crash_handler() {
    std::panic::set_hook(Box::new(|panic_info| {
        let msg = match panic_info.payload().downcast_ref::<&str>() {
            Some(s) => *s,
            None => match panic_info.payload().downcast_ref::<String>() {
                Some(s) => &s[..],
                None => "Unknown panic payload",
            },
        };
        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".into());

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let log_entry = format!(
            "[ALINA CRASH] timestamp={} location={} error={}\n",
            timestamp, location, msg
        );

        eprintln!("{}", log_entry);

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let dir = std::path::Path::new(&local_app_data).join("ALINA").join("logs");
            let _ = std::fs::create_dir_all(&dir);
            let crash_file = dir.join("crash.log");
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(crash_file)
                .and_then(|mut f| f.write_all(log_entry.as_bytes()));
        }
    }));
}

fn main() {
    setup_crash_handler();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                println!(
                    "[ALINA Native] Window close requested on '{}'. Finalizing background tasks.",
                    window.label()
                );
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            get_system_metadata,
            resolve_approval,
            request_app_restart,
            request_app_shutdown,
            launch_application,
            get_native_system_info,
            capture_native_screenshot,
            controlled_keyboard_input,
            controlled_mouse_input,
            get_network_status,
            get_autostart_status,
            set_autostart,
            scan_wifi_networks,
            connect_wifi
        ])
        .run(tauri::generate_context!())
        .expect("error while running ALINA desktop application");
}
