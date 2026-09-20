use serde::{Deserialize, Serialize};
use super::security::{NativeAuditEvent, NativeCommandError, NativePermissionTier};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardInputPayload {
    pub text: Option<String>,
    pub key_combination: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MouseInputPayload {
    pub action: String, // "move", "click", "double_click", "scroll"
    pub x: i32,
    pub y: i32,
    pub button: Option<String>, // "left", "right", "middle"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputActionResult {
    pub success: bool,
    pub action_type: String,
    pub details: String,
    pub audit_event: NativeAuditEvent,
}

const FORBIDDEN_KEY_COMBINATIONS: &[&str] = &[
    "ctrl+alt+del",
    "ctrl+alt+delete",
    "win+l", // Lock screen
];

#[tauri::command]
pub fn controlled_keyboard_input(
    payload: KeyboardInputPayload,
) -> Result<InputActionResult, NativeCommandError> {
    if let Some(combo) = &payload.key_combination {
        let normalized = combo.to_lowercase().replace(" ", "");
        for forbidden in FORBIDDEN_KEY_COMBINATIONS {
            if normalized.contains(forbidden) {
                return Err(NativeCommandError {
                    code: "FORBIDDEN_KEY_COMBINATION".into(),
                    message: format!(
                        "Security violation: Key combination '{}' is restricted for safety.",
                        combo
                    ),
                });
            }
        }
    }

    let detail = if let Some(combo) = &payload.key_combination {
        format!("Simulated key combination: {}", combo)
    } else if let Some(text) = &payload.text {
        format!("Simulated typed text: {} chars", text.len())
    } else {
        "No input payload specified".into()
    };

    let audit_event = NativeAuditEvent {
        id: format!("audit_kb_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
        timestamp: "now".into(),
        command: "controlled_keyboard_input".into(),
        permission_tier: NativePermissionTier::RequiresApproval,
        outcome: "success".into(),
        details: detail.clone(),
    };

    Ok(InputActionResult {
        success: true,
        action_type: "keyboard".into(),
        details: detail,
        audit_event,
    })
}

#[tauri::command]
pub fn controlled_mouse_input(
    payload: MouseInputPayload,
) -> Result<InputActionResult, NativeCommandError> {
    // Screen boundary validation (0 to 4096)
    if payload.x < 0 || payload.x > 4096 || payload.y < 0 || payload.y > 4096 {
        return Err(NativeCommandError {
            code: "COORDINATES_OUT_OF_BOUNDS".into(),
            message: format!(
                "Mouse coordinates ({}, {}) are outside the valid virtual display boundary (0-4096).",
                payload.x, payload.y
            ),
        });
    }

    let valid_actions = ["move", "click", "double_click", "scroll"];
    if !valid_actions.contains(&payload.action.as_str()) {
        return Err(NativeCommandError {
            code: "INVALID_MOUSE_ACTION".into(),
            message: format!(
                "Unknown mouse action '{}'. Allowed: {:?}",
                payload.action, valid_actions
            ),
        });
    }

    let detail = format!(
        "Mouse {} at ({}, {}) with button {:?}",
        payload.action, payload.x, payload.y, payload.button
    );

    let audit_event = NativeAuditEvent {
        id: format!("audit_mouse_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()),
        timestamp: "now".into(),
        command: "controlled_mouse_input".into(),
        permission_tier: NativePermissionTier::RequiresApproval,
        outcome: "success".into(),
        details: detail.clone(),
    };

    Ok(InputActionResult {
        success: true,
        action_type: "mouse".into(),
        details: detail,
        audit_event,
    })
}
