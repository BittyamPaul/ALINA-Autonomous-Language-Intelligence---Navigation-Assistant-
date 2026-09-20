use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum NativePermissionTier {
    Safe,
    RequiresApproval,
    HighRiskBlocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeAuditEvent {
    pub id: String,
    pub timestamp: String,
    pub command: String,
    pub permission_tier: NativePermissionTier,
    pub outcome: String,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeCommandError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for NativeCommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}]: {}", self.code, self.message)
    }
}

impl std::error::Error for NativeCommandError {}

/// Whitelist of approved applications that can be launched by ALINA.
const APPROVED_APPLICATIONS: &[&str] = &[
    "calc",
    "calculator",
    "notepad",
    "code",
    "explorer",
    "terminal",
    "wt", // Windows Terminal
    "mspaint",
];

/// Dangerous argument tokens that are strictly rejected.
const DANGEROUS_TOKENS: &[&str] = &[
    "format",
    "rmdir",
    "del",
    "rm",
    "erase",
    "shutdown",
    "diskpart",
    "regedit",
    "mkfs",
    ">",
    "<",
    "|",
    "&",
    ";",
    "`",
    "$",
];

pub fn validate_app_name(app_name: &str) -> Result<String, NativeCommandError> {
    let normalized = app_name.trim().to_lowercase();
    let base_name = normalized.trim_end_matches(".exe");

    if APPROVED_APPLICATIONS.contains(&base_name) {
        Ok(base_name.to_string())
    } else {
        Err(NativeCommandError {
            code: "APP_NOT_WHITELISTED".into(),
            message: format!(
                "Application '{}' is not in ALINA's approved desktop whitelist. Approved: {:?}",
                app_name, APPROVED_APPLICATIONS
            ),
        })
    }
}

pub fn sanitize_arguments(args: &[String]) -> Result<(), NativeCommandError> {
    for arg in args {
        let lower = arg.to_lowercase();
        for token in DANGEROUS_TOKENS {
            if lower.contains(token) {
                return Err(NativeCommandError {
                    code: "DANGEROUS_ARGUMENT_DETECTED".into(),
                    message: format!(
                        "Security violation: Argument '{}' contains dangerous shell token '{}'",
                        arg, token
                    ),
                });
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_app_name_whitelisted() {
        assert_eq!(validate_app_name("calc").unwrap(), "calc");
        assert_eq!(validate_app_name("notepad.exe").unwrap(), "notepad");
        assert_eq!(validate_app_name("code").unwrap(), "code");
        assert_eq!(validate_app_name("terminal").unwrap(), "terminal");
    }

    #[test]
    fn test_validate_app_name_rejected() {
        let res = validate_app_name("cmd.exe");
        assert!(res.is_err());
        assert_eq!(res.unwrap_err().code, "APP_NOT_WHITELISTED");

        let res_ps = validate_app_name("powershell.exe");
        assert!(res_ps.is_err());
        assert_eq!(res_ps.unwrap_err().code, "APP_NOT_WHITELISTED");
    }

    #[test]
    fn test_sanitize_arguments_safe() {
        let safe_args = vec!["document.txt".to_string(), "--flag".to_string()];
        assert!(sanitize_arguments(&safe_args).is_ok());
    }

    #[test]
    fn test_sanitize_arguments_dangerous_tokens() {
        let dangerous_args = vec!["calc".to_string(), "|".to_string(), "del".to_string()];
        let res = sanitize_arguments(&dangerous_args);
        assert!(res.is_err());
        assert_eq!(res.unwrap_err().code, "DANGEROUS_ARGUMENT_DETECTED");

        let redirect_args = vec![">".to_string(), "C:\\malicious.bat".to_string()];
        assert!(sanitize_arguments(&redirect_args).is_err());
    }
}
