Here’s a concrete **Rust helper library** that makes the router look like a single `get_token()` call from the CLI side.

It uses **blocking HTTP** (no tokio needed in the CLI) and does:

1. **Check a local cache file** for a still-valid token.
2. If missing/expired → **talk to the router**:

   * `POST /v1/token-requests`
   * Poll `GET /v1/token-requests/{id}/status`
   * Return the token when `approved`
3. Save the token back to cache.

You can drop this into a crate like `claude-auth-client` and link from any Rust CLI.

---

## 1. `Cargo.toml` (client library)

```toml
[package]
name = "claude-auth-client"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.10", features = ["serde", "v4"] }
thiserror = "1.0"
reqwest = { version = "0.12", features = ["json", "rustls-tls", "blocking"] }
directories = "5.0"
```

---

## 2. Library Implementation (`src/lib.rs`)

```rust
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
use uuid::Uuid;

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/// Token bundle returned by the router (mirrors router's TokenBundle).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBundle {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub token_type: String,
    pub scope: Option<String>,
}

/// Errors that can occur while obtaining a token.
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
    /// Optional custom cache path. If None, XDG/Dot path is used.
    pub cache_path: Option<PathBuf>,
    /// Poll interval when waiting for approval.
    pub poll_interval: StdDuration,
    /// Max time to wait for approval before failing.
    pub max_wait: StdDuration,
}

impl ClientConfig {
    pub fn from_env_defaults() -> Result<Self, AuthClientError> {
        let router = std::env::var("CLAUDE_ROUTER_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:7777".to_string());

        let client_name = std::env::var("CLAUDE_CLIENT_NAME")
            .unwrap_or_else(|_| "default-cli".to_string());

        let hostname = std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("COMPUTERNAME"))
            .unwrap_or_else(|_| "unknown-host".to_string());

        Ok(Self {
            router_base_url: router,
            client_name,
            hostname,
            cache_path: None,
            poll_interval: StdDuration::from_secs(2),
            max_wait: StdDuration::from_secs(300), // 5 minutes
        })
    }
}

/// High-level API: obtain a valid token for the given scopes.
/// - Checks cache first
/// - If needed, goes through router and blocks until approved/denied/timeout.
pub fn get_token(
    cfg: &ClientConfig,
    scopes: &[&str],
) -> Result<TokenBundle, AuthClientError> {
    let http = Client::new();
    let scopes_vec: Vec<String> = scopes.iter().map(|s| s.to_string()).collect();

    // 1) Try cache
    if let Some(cache_path) = cache_path(cfg)? {
        if let Some(token) = load_valid_cached_token(&cache_path, &scopes_vec)? {
            return Ok(token);
        }
    }

    // 2) Request new token from router
    let token = request_new_token_from_router(&http, cfg, &scopes_vec)?;

    // 3) Save to cache
    if let Some(cache_path) = cache_path(cfg)? {
        save_token_to_cache(&cache_path, &scopes_vec, &token)?;
    }

    Ok(token)
}

// -----------------------------------------------------------------------------
// Internal types mirroring router DTOs
// -----------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct CreateTokenRequestBody {
    client_name: String,
    hostname: String,
    scopes: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CreateTokenResponse {
    request_id: String,
    status: RequestStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
struct StatusResponse {
    request_id: String,
    status: RequestStatus,
    token: Option<TokenBundle>,
    error: Option<String>,
}

// -----------------------------------------------------------------------------
// Cache handling
// -----------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
struct CachedToken {
    token: TokenBundle,
    scopes: Vec<String>, // scopes associated with this token
}

fn cache_path(cfg: &ClientConfig) -> Result<Option<PathBuf>, AuthClientError> {
    if let Some(p) = &cfg.cache_path {
        return Ok(Some(p.clone()));
    }

    let Some(proj) = ProjectDirs::from("com", "ExampleOrg", "ClaudeAuthClient") else {
        return Ok(None);
    };

    let dir = proj.config_dir();
    fs::create_dir_all(dir)
        .map_err(|e| AuthClientError::Cache(format!("create cache dir: {e}")))?;
    let mut path = dir.to_path_buf();
    path.push("token_cache.json");
    Ok(Some(path))
}

fn load_valid_cached_token(
    path: &Path,
    requested_scopes: &[String],
) -> Result<Option<TokenBundle>, AuthClientError> {
    if !path.exists() {
        return Ok(None);
    }

    let data = fs::read_to_string(path)
        .map_err(|e| AuthClientError::Cache(format!("read cache file: {e}")))?;
    let cached: CachedToken = serde_json::from_str(&data)
        .map_err(|e| AuthClientError::Cache(format!("parse cache JSON: {e}")))?;

    // Basic scope check: ensure cached scopes cover all requested scopes.
    let cache_scopes: std::collections::HashSet<_> =
        cached.scopes.iter().cloned().collect();
    let requested_set: std::collections::HashSet<_> =
        requested_scopes.iter().cloned().collect();

    if !requested_set.is_subset(&cache_scopes) {
        return Ok(None);
    }

    // Expiry check with a small safety margin.
    if let Some(expires_at) = cached.token.expires_at {
        if expires_at <= Utc::now() + Duration::seconds(30) {
            return Ok(None);
        }
    }

    Ok(Some(cached.token))
}

fn save_token_to_cache(
    path: &Path,
    scopes: &[String],
    token: &TokenBundle,
) -> Result<(), AuthClientError> {
    let cached = CachedToken {
        token: token.clone(),
        scopes: scopes.to_vec(),
    };
    let json = serde_json::to_string_pretty(&cached)
        .map_err(|e| AuthClientError::Cache(format!("serialize cache JSON: {e}")))?;

    let mut file = fs::File::create(path)
        .map_err(|e| AuthClientError::Cache(format!("create cache file: {e}")))?;
    file.write_all(json.as_bytes())
        .map_err(|e| AuthClientError::Cache(format!("write cache file: {e}")))?;
    Ok(())
}

// -----------------------------------------------------------------------------
// Router interaction
// -----------------------------------------------------------------------------

fn request_new_token_from_router(
    http: &Client,
    cfg: &ClientConfig,
    scopes: &[String],
) -> Result<TokenBundle, AuthClientError> {
    let url = format!("{}/v1/token-requests", cfg.router_base_url.trim_end_matches('/'));
    let body = CreateTokenRequestBody {
        client_name: cfg.client_name.clone(),
        hostname: cfg.hostname.clone(),
        scopes: scopes.to_vec(),
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

    let create: CreateTokenResponse = resp
        .json()
        .map_err(|e| AuthClientError::Http(format!("parse create response: {e}")))?;

    let request_id = create.request_id;
    wait_for_approval(http, cfg, &request_id)
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
                // Still waiting; sleep then poll again.
                thread::sleep(cfg.poll_interval);
            }
        }
    }
}
```

---

## 3. Example: Using `claude-auth-client` in a CLI

```rust
use claude_auth_client::{get_token, ClientConfig};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Config from env (or construct manually)
    let cfg = ClientConfig::from_env_defaults()?;

    // Scopes required by this CLI
    let scopes = ["basic", "code:read"];

    // This will:
    // - check cache
    // - if necessary, go through router flow and block until approved
    let token = get_token(&cfg, &scopes)?;

    println!("Got access token: {}", token.access_token);
    println!("Token type: {}", token.token_type);
    if let Some(expires_at) = token.expires_at {
        println!("Expires at: {}", expires_at);
    }

    // Use token against Claude/whatever API
    // ...

    Ok(())
}
```

---

If you like this shape, next step we can add:

* A small **CLI-side `--login` command** that just forces a new token (ignores cache) for debugging.
* Optional **per-account cache separation**, e.g. a `CLIENT_NAME`-derived subdirectory so different tools or users don’t collide.
