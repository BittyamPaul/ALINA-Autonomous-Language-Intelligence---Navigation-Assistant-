use serde::{Deserialize, Serialize};
use std::process::Command;
use super::security::{validate_app_name, sanitize_arguments, NativeAuditEvent, NativeCommandError, NativePermissionTier};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchAppPayload {
    pub app_name: String,
    pub args: Option<Vec<String>>,
    pub grant_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchAppResult {
    pub pid: u32,
    pub app_name: String,
    pub launched_at: String,
    pub audit_event: NativeAuditEvent,
}

#[tauri::command]
pub fn launch_application(payload: LaunchAppPayload) -> Result<LaunchAppResult, NativeCommandError> {
    // 1. Enforce authorization grant token check (Rule 1 & Rule 2 of AGENTS.md)
    // Spawning host processes requires explicit operator approval grant token
    match &payload.grant_token {
        Some(token) if token.trim().starts_with("grant_") || token.trim().starts_with("auth_") => {
            // Valid token format from HITL Coordinator
        }
        _ => {
            return Err(NativeCommandError {
                code: "APPROVAL_REQUIRED".into(),
                message: "Security violation: Spawning native processes requires an approved operator grant token.".into(),
            });
        }
    }

    let valid_app = validate_app_name(&payload.app_name)?;
    let args = payload.args.unwrap_or_default();
    sanitize_arguments(&args)?;

    // Additional argument validation: for explorer, prohibit URLs or switches
    if valid_app == "explorer" {
        for arg in &args {
            let lower = arg.to_lowercase();
            if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("/") || lower.starts_with("-") {
                return Err(NativeCommandError {
                    code: "INVALID_ARGUMENT".into(),
                    message: "Security violation: explorer only accepts safe local directory paths.".into(),
                });
            }
        }
    }

    let mut cmd = if valid_app == "camera" {
        #[cfg(target_os = "windows")]
        {
            let mut c = Command::new("explorer");
            c.arg("microsoft.windows.camera:");
            c
        }
        #[cfg(target_os = "macos")]
        {
            let mut c = Command::new("open");
            c.args(["-a", "Photo Booth"]);
            c
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Command::new("cheese")
        }
    } else if valid_app == "browser" || valid_app == "edge" {
        #[cfg(target_os = "windows")]
        {
            let mut c = Command::new("explorer");
            c.arg("microsoft-edge:");
            c
        }
        #[cfg(target_os = "macos")]
        {
            let mut c = Command::new("open");
            c.args(["-a", "Safari"]);
            c
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Command::new("xdg-open")
        }
    } else {
        let mut c = Command::new(&valid_app);
        for arg in &args {
            c.arg(arg);
        }
        c
    };

    match cmd.spawn() {
        Ok(child) => {
            let pid = child.id();
            let timestamp = chrono_lite_timestamp();
            let audit_event = NativeAuditEvent {
                id: format!("audit_{}", pid),
                timestamp: timestamp.clone(),
                command: format!("launch_application: {}", valid_app),
                permission_tier: NativePermissionTier::RequiresApproval,
                outcome: "success".into(),
                details: format!("Spawned PID: {}, args: {:?}", pid, args),
            };

            Ok(LaunchAppResult {
                pid,
                app_name: valid_app,
                launched_at: timestamp,
                audit_event,
            })
        }
        Err(err) => Err(NativeCommandError {
            code: "SPAWN_FAILED".into(),
            message: format!("Failed to launch application '{}': {}", valid_app, err),
        }),
    }
}

fn chrono_lite_timestamp() -> String {
    let now = std::time::SystemTime::now();
    let since_the_epoch = now
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{:03}Z", since_the_epoch.as_secs(), since_the_epoch.subsec_millis())
}
