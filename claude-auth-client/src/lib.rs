use chrono::{DateTime, Duration, Utc};
use directories::ProjectDirs;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration as StdDuration;
use thiserror::Error;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBundle {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub token_type: String,
    pub scope: Option<String>,
}

#[derive(Debug, Error)]
pub enum AuthClientError {
    #[error("HTTP error: {0}")]
    Http(String),

    #[error("Router returned error: {0}")]
    Router(String),

    #[error("Request was denied or cancelled by user")]
    Denied,

    #[error("Timed out waiting for authorization")]
    Timeout,

    #[error("Cache error: {0}")]
    Cache(String),

    #[error("Invalid configuration: {0}")]
    Config(String),
}

#[derive(Debug, Clone)]
pub struct ClientConfig {
    /// Base URL of the auth router (default: "http://127.0.0.1:7777").
    pub router_base_url: String,
    /// Logical name of this client (e.g., "dsmil-cli").
    pub client_name: String,
    /// Hostname of the machine (for audit).
    pub hostname: String,
    /// Optional explicit cache path (overrides everything else).
    pub cache_path: Option<PathBuf>,
    /// Optional namespace to split per-account caches.
    pub account_namespace: Option<String>,
    /// Poll interval when waiting for approval.
    pub poll_interval: StdDuration,
    /// Max time to wait for approval before failing.
    pub max_wait: StdDuration,
}

impl ClientConfig {
    pub fn from_env_defaults() -> Result<Self, AuthClientError> {
        let router = std::env::var("CLAUDE_ROUTER_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:7777".to_string());

        let client_name =
            std::env::var("CLAUDE_CLIENT_NAME").unwrap_or_else(|_| "default-cli".to_string());

        let hostname = std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("COMPUTERNAME"))
            .unwrap_or_else(|_| "unknown-host".to_string());

        let account_namespace = std::env::var("CLAUDE_ACCOUNT_NAMESPACE")
            .ok()
            .or_else(|| std::env::var("CLAUDE_PROFILE").ok());

        Ok(Self {
            router_base_url: router,
            client_name,
            hostname,
            cache_path: None,
            account_namespace,
            poll_interval: StdDuration::from_secs(2),
            max_wait: StdDuration::from_secs(300),
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum RequestStatus {
    Pending,
    InProgress,
    Approved,
    Denied,
    Cancelled,
    Error,
}

#[derive(Debug, Deserialize)]
struct CreateTokenResponse {
    request_id: String,
    status: RequestStatus,
}

#[derive(Debug, Deserialize)]
struct StatusResponse {
    request_id: String,
    status: RequestStatus,
    token: Option<TokenBundle>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateTokenBody<'a> {
    client_name: &'a str,
    hostname: &'a str,
    scopes: &'a [String],
}

/// Obtain a valid token, using cache when possible.
pub fn get_token(cfg: &ClientConfig, scopes: &[&str]) -> Result<TokenBundle, AuthClientError> {
    let scopes: Vec<String> = scopes.iter().map(|s| s.to_string()).collect();
    let http = Client::new();

    if let Some(path) = cache_path(cfg)? {
        if let Some(token) = load_cached_token(&path)? {
            if is_token_valid(&token) {
                return Ok(token);
            }
        }
    }

    let created = create_token_request(&http, cfg, &scopes)?;
    let token = wait_for_approval(&http, cfg, &created.request_id)?;

    if let Some(path) = cache_path(cfg)? {
        save_token(&path, &token)?;
    }

    Ok(token)
}

fn cache_path(cfg: &ClientConfig) -> Result<Option<PathBuf>, AuthClientError> {
    if let Some(p) = &cfg.cache_path {
        return Ok(Some(p.clone()));
    }

    let Some(proj) = ProjectDirs::from("com", "ExampleOrg", "ClaudeAuthClient") else {
        return Ok(None);
    };

    let base_dir = proj.config_dir();
    let ns = if let Some(ns) = &cfg.account_namespace {
        ns.clone()
    } else {
        format!("{}-{}", cfg.client_name, cfg.hostname)
    };

    let safe_ns = sanitize_component(&ns);
    let dir = base_dir.join(safe_ns);
    fs::create_dir_all(&dir)
        .map_err(|e| AuthClientError::Cache(format!("create cache dir: {e}")))?;

    Ok(Some(dir.join("token_cache.json")))
}

fn sanitize_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "_".to_string()
    } else {
        out
    }
}

fn load_cached_token(path: &Path) -> Result<Option<TokenBundle>, AuthClientError> {
    if !path.exists() {
        return Ok(None);
    }

    let data =
        fs::read_to_string(path).map_err(|e| AuthClientError::Cache(format!("read cache: {e}")))?;
    let token: TokenBundle = serde_json::from_str(&data)
        .map_err(|e| AuthClientError::Cache(format!("parse cache: {e}")))?;
    Ok(Some(token))
}

fn save_token(path: &Path, token: &TokenBundle) -> Result<(), AuthClientError> {
    let data = serde_json::to_string_pretty(token)
        .map_err(|e| AuthClientError::Cache(format!("serialize cache: {e}")))?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AuthClientError::Cache(format!("create cache dir: {e}")))?;
    }

    let mut file =
        fs::File::create(path).map_err(|e| AuthClientError::Cache(format!("open cache: {e}")))?;
    file.write_all(data.as_bytes())
        .map_err(|e| AuthClientError::Cache(format!("write cache: {e}")))?;
    Ok(())
}

fn is_token_valid(token: &TokenBundle) -> bool {
    match token.expires_at {
        Some(exp) => exp - Duration::seconds(30) > Utc::now(),
        None => true,
    }
}

fn create_token_request(
    http: &Client,
    cfg: &ClientConfig,
    scopes: &[String],
) -> Result<CreateTokenResponse, AuthClientError> {
    let url = format!(
        "{}/v1/token-requests",
        cfg.router_base_url.trim_end_matches('/')
    );

    let body = CreateTokenBody {
        client_name: &cfg.client_name,
        hostname: &cfg.hostname,
        scopes,
    };

    let resp = http
        .post(&url)
        .json(&body)
        .send()
        .map_err(|e| AuthClientError::Http(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(AuthClientError::Http(format!(
            "router returned {} on create",
            resp.status()
        )));
    }

    resp.json()
        .map_err(|e| AuthClientError::Http(format!("parse create response: {e}")))
}

fn wait_for_approval(
    http: &Client,
    cfg: &ClientConfig,
    request_id: &str,
) -> Result<TokenBundle, AuthClientError> {
    let status_url = format!(
        "{}/v1/token-requests/{}/status",
        cfg.router_base_url.trim_end_matches('/'),
        request_id
    );

    let start = std::time::Instant::now();

    loop {
        if start.elapsed() > cfg.max_wait {
            return Err(AuthClientError::Timeout);
        }

        let resp = http
            .get(&status_url)
            .send()
            .map_err(|e| AuthClientError::Http(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(AuthClientError::Http(format!(
                "router returned {} on status",
                resp.status()
            )));
        }

        let status: StatusResponse = resp
            .json()
            .map_err(|e| AuthClientError::Http(format!("parse status response: {e}")))?;

        match status.status {
            RequestStatus::Approved => {
                if let Some(token) = status.token {
                    return Ok(token);
                } else {
                    return Err(AuthClientError::Router(
                        "approved but no token present".into(),
                    ));
                }
            }
            RequestStatus::Denied | RequestStatus::Cancelled => {
                return Err(AuthClientError::Denied);
            }
            RequestStatus::Error => {
                return Err(AuthClientError::Router(
                    status.error.unwrap_or_else(|| "unknown error".into()),
                ));
            }
            RequestStatus::Pending | RequestStatus::InProgress => {
                thread::sleep(cfg.poll_interval);
            }
        }
    }
}
