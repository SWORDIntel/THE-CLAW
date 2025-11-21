Here’s a concrete Rust implementation spec for the auth router as an actual crate you can build on.

I’ll give you:

* Crate layout + `Cargo.toml`
* Core types + state model
* HTTP routes (handlers + signatures)
* OAuth helper spec
* How it talks to your Electron control-browser

You can turn this into working code with minimal extra glue.

---

## 1. Crate Layout

```text
claude-auth-router/
  Cargo.toml
  src/
    main.rs          # bootstrap, router wiring
    config.rs        # config loading for OAuth, ports, etc.
    models.rs        # AuthRequest, TokenBundle, enums
    store.rs         # in-memory + file-backed token store
    handlers.rs      # HTTP handlers (axum)
    oauth.rs         # OAuth URL builder + token exchange
    control_client.rs# HTTP client to Electron control server
```

Framework: **axum + tokio**.

---

## 2. Cargo.toml

```toml
[package]
name = "claude-auth-router"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1.40", features = ["macros", "rt-multi-thread"] }
axum = "0.7"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
uuid = { version = "1.10", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
thiserror = "1.0"
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
parking_lot = "0.12"
url = "2.5"
once_cell = "1.19"
```

---

## 3. Core Config (`config.rs`)

Single config struct, load from env or a simple `config.toml` later.

```rust
// src/config.rs
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct OAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub auth_url: String,      // e.g. "https://api.anthropic.com/oauth/authorize"
    pub token_url: String,     // e.g. "https://api.anthropic.com/oauth/token"
    pub redirect_uri: String,  // "http://127.0.0.1:7777/oauth/callback"
}

#[derive(Debug, Clone, Deserialize)]
pub struct ControlBrowserConfig {
    pub base_url: String, // e.g. "http://127.0.0.1:7780"
}

#[derive(Debug, Clone, Deserialize)]
pub struct RouterConfig {
    pub bind_addr: String, // "127.0.0.1:7777"
    pub oauth: OAuthConfig,
    pub control_browser: ControlBrowserConfig,
}

impl RouterConfig {
    pub fn from_env() -> Self {
        // For now just hardcode; you can extend to real env parsing.
        Self {
            bind_addr: "127.0.0.1:7777".into(),
            oauth: OAuthConfig {
                client_id: std::env::var("OAUTH_CLIENT_ID").unwrap_or_default(),
                client_secret: std::env::var("OAUTH_CLIENT_SECRET").unwrap_or_default(),
                auth_url: std::env::var("OAUTH_AUTH_URL").unwrap_or_default(),
                token_url: std::env::var("OAUTH_TOKEN_URL").unwrap_or_default(),
                redirect_uri: std::env::var("OAUTH_REDIRECT_URI")
                    .unwrap_or_else(|_| "http://127.0.0.1:7777/oauth/callback".into()),
            },
            control_browser: ControlBrowserConfig {
                base_url: std::env::var("CONTROL_BROWSER_URL")
                    .unwrap_or_else(|_| "http://127.0.0.1:7780".into()),
            },
        }
    }
}
```

---

## 4. Models & State (`models.rs`)

```rust
// src/models.rs
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type RequestId = Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestStatus {
    Pending,
    InProgress,
    Approved,
    Denied,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBundle {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub token_type: String,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    pub id: RequestId,
    pub client_name: String,
    pub hostname: String,
    pub scopes: Vec<String>,
    pub status: RequestStatus,
    pub account_id: Option<u32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub error: Option<String>,
    pub token: Option<TokenBundle>,
}
```

---

## 5. In-Memory Store (`store.rs`)

```rust
// src/store.rs
use crate::models::{AuthRequest, RequestId};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone, Default)]
pub struct AuthStore {
    inner: Arc<RwLock<HashMap<RequestId, AuthRequest>>>,
}

impl AuthStore {
    pub fn insert(&self, req: AuthRequest) {
        self.inner.write().insert(req.id, req);
    }

    pub fn get(&self, id: &RequestId) -> Option<AuthRequest> {
        self.inner.read().get(id).cloned()
    }

    pub fn update(&self, req: AuthRequest) {
        self.inner.write().insert(req.id, req);
    }
}
```

You can later add a file-backed `TokenStore` trait if you want persistence.

---

## 6. Control Browser Client (`control_client.rs`)

This is how the router tells Electron: “load auth URL in account X”.

```rust
// src/control_client.rs
use crate::config::ControlBrowserConfig;
use reqwest::Client;
use url::Url;

#[derive(Clone)]
pub struct ControlClient {
    cfg: ControlBrowserConfig,
    http: Client,
}

impl ControlClient {
    pub fn new(cfg: ControlBrowserConfig) -> Self {
        Self {
            cfg,
            http: Client::new(),
        }
    }

    pub async fn open_auth(&self, account_id: u32, auth_url: &str) -> anyhow::Result<()> {
        let mut url = Url::parse(&self.cfg.base_url)?;
        url.set_path("/open-auth");
        url.query_pairs_mut()
            .append_pair("account_id", &account_id.to_string())
            .append_pair("auth_url", auth_url);

        let resp = self.http.get(url).send().await?;
        if !resp.status().is_success() {
            anyhow::bail!("control browser returned non-200: {}", resp.status());
        }
        Ok(())
    }
}
```

---

## 7. OAuth Helper (`oauth.rs`)

Build auth URL with `state=request_id`, and exchange `code` for tokens.

```rust
// src/oauth.rs
use crate::config::OAuthConfig;
use crate::models::{TokenBundle};
use chrono::{DateTime, Duration, Utc};
use reqwest::Client;
use serde::Deserialize;
use url::Url;
use uuid::Uuid;

#[derive(Clone)]
pub struct OAuthClient {
    cfg: OAuthConfig,
    http: Client,
}

impl OAuthClient {
    pub fn new(cfg: OAuthConfig) -> Self {
        Self {
            cfg,
            http: Client::new(),
        }
    }

    pub fn build_auth_url(&self, request_id: Uuid, scopes: &[String]) -> anyhow::Result<String> {
        let mut url = Url::parse(&self.cfg.auth_url)?;
        let scope_str = scopes.join(" ");
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", &self.cfg.client_id)
            .append_pair("redirect_uri", &self.cfg.redirect_uri)
            .append_pair("scope", &scope_str)
            .append_pair("state", &request_id.to_string());
        Ok(url.to_string())
    }

    pub async fn exchange_code(&self, code: &str) -> anyhow::Result<TokenBundle> {
        #[derive(Deserialize)]
        struct RawToken {
            access_token: String,
            token_type: String,
            refresh_token: Option<String>,
            expires_in: Option<i64>,
            scope: Option<String>,
        }

        let resp = self
            .http
            .post(&self.cfg.token_url)
            .form(&[
                ("grant_type", "authorization_code"),
                ("code", code),
                ("redirect_uri", &self.cfg.redirect_uri),
                ("client_id", &self.cfg.client_id),
                ("client_secret", &self.cfg.client_secret),
            ])
            .send()
            .await?
            .error_for_status()?;

        let raw: RawToken = resp.json().await?;
        let expires_at = raw
            .expires_in
            .map(|sec| Utc::now() + Duration::seconds(sec));

        Ok(TokenBundle {
            access_token: raw.access_token,
            refresh_token: raw.refresh_token,
            expires_at,
            token_type: raw.token_type,
            scope: raw.scope,
        })
    }
}
```

---

## 8. HTTP Handlers (`handlers.rs`)

Use axum’s extractors, share state via `AppState`.

```rust
// src/handlers.rs
use crate::models::{AuthRequest, RequestId, RequestStatus};
use crate::store::AuthStore;
use crate::{oauth::OAuthClient, control_client::ControlClient};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub store: AuthStore,
    pub oauth: OAuthClient,
    pub control: ControlClient,
}

// --- DTOs ---

#[derive(Deserialize)]
pub struct CreateTokenRequest {
    pub client_name: String,
    pub hostname: String,
    pub scopes: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct CreateTokenResponse {
    pub request_id: String,
    pub status: RequestStatus,
}

pub async fn create_token_request(
    State(state): State<AppState>,
    Json(body): Json<CreateTokenRequest>,
) -> (StatusCode, Json<CreateTokenResponse>) {
    let now = Utc::now();
    let id = Uuid::new_v4();

    let req = AuthRequest {
        id,
        client_name: body.client_name,
        hostname: body.hostname,
        scopes: body.scopes,
        status: RequestStatus::Pending,
        account_id: None,
        created_at: now,
        updated_at: now,
        error: None,
        token: None,
    };

    state.store.insert(req);

    (
        StatusCode::CREATED,
        Json(CreateTokenResponse {
            request_id: id.to_string(),
            status: RequestStatus::Pending,
        }),
    )
}

#[derive(Deserialize)]
pub struct SelectAccountBody {
    pub account_id: u32,
}

#[derive(serde::Serialize)]
pub struct SelectAccountResponse {
    pub request_id: String,
    pub status: RequestStatus,
    pub account_id: u32,
}

pub async fn select_account(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SelectAccountBody>,
) -> Result<(StatusCode, Json<SelectAccountResponse>), (StatusCode, String)> {
    let req_id = parse_uuid(&id).map_err(invalid_id)?;

    let mut req = state
        .store
        .get(&req_id)
        .ok_or((StatusCode::NOT_FOUND, "request_not_found".into()))?;

    if !matches!(req.status, RequestStatus::Pending | RequestStatus::InProgress) {
        return Err((StatusCode::CONFLICT, "invalid_status_for_select".into()));
    }

    // Build auth URL
    let auth_url = state
        .oauth
        .build_auth_url(req.id, &req.scopes)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Tell Electron control browser to open auth page in account session
    if let Err(e) = state.control.open_auth(body.account_id, &auth_url).await {
        return Err((StatusCode::BAD_GATEWAY, e.to_string()));
    }

    req.account_id = Some(body.account_id);
    req.status = RequestStatus::InProgress;
    req.updated_at = Utc::now();
    state.store.update(req);

    Ok((
        StatusCode::OK,
        Json(SelectAccountResponse {
            request_id: id,
            status: RequestStatus::InProgress,
            account_id: body.account_id,
        }),
    ))
}

#[derive(serde::Serialize)]
pub struct StatusResponse {
    pub request_id: String,
    pub status: RequestStatus,
    pub token: Option<crate::models::TokenBundle>,
    pub error: Option<String>,
}

pub async fn get_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<StatusResponse>, (StatusCode, String)> {
    let req_id = parse_uuid(&id).map_err(invalid_id)?;
    let req = state
        .store
        .get(&req_id)
        .ok_or((StatusCode::NOT_FOUND, "request_not_found".into()))?;

    Ok(Json(StatusResponse {
        request_id: id,
        status: req.status,
        token: req.token,
        error: req.error,
    }))
}

// OAuth callback: GET /oauth/callback?code=...&state=<request_id>
use axum::extract::Query;
use std::collections::HashMap;

pub async fn oauth_callback(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> (StatusCode, String) {
    let code = match params.get("code") {
        Some(c) => c.clone(),
        None => return (StatusCode::BAD_REQUEST, "missing_code".into()),
    };
    let state_param = match params.get("state") {
        Some(s) => s.clone(),
        None => return (StatusCode::BAD_REQUEST, "missing_state".into()),
    };

    let req_id = match parse_uuid(&state_param) {
        Ok(v) => v,
        Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()),
    };

    let mut req = match state.store.get(&req_id) {
        Some(r) => r,
        None => return (StatusCode::NOT_FOUND, "request_not_found".into()),
    };

    // Exchange code for tokens
    match state.oauth.exchange_code(&code).await {
        Ok(token) => {
            req.token = Some(token);
            req.status = RequestStatus::Approved;
            req.updated_at = Utc::now();
            req.error = None;
            state.store.update(req);
            (StatusCode::OK, "You may close this window.".into())
        }
        Err(e) => {
            req.status = RequestStatus::Error;
            req.updated_at = Utc::now();
            req.error = Some(e.to_string());
            state.store.update(req);
            (StatusCode::INTERNAL_SERVER_ERROR, "OAuth error".into())
        }
    }
}

// Helper
fn parse_uuid(s: &str) -> Result<Uuid, uuid::Error> {
    Uuid::parse_str(s)
}

fn invalid_id<E: std::fmt::Display>(err: E) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, format!("invalid_request_id: {err}"))
}
```

You can add the `cancel` handler similarly (set status to `Cancelled`).

---

## 9. main.rs Wiring (`src/main.rs`)

```rust
// src/main.rs
mod config;
mod control_client;
mod handlers;
mod models;
mod oauth;
mod store;

use axum::{routing::{get, post}, Router};
use handlers::{
    create_token_request, get_status, oauth_callback, select_account, AppState,
};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    // logging
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let cfg = config::RouterConfig::from_env();
    let store = store::AuthStore::default();
    let oauth = oauth::OAuthClient::new(cfg.oauth.clone());
    let control = control_client::ControlClient::new(cfg.control_browser.clone());

    let state = AppState { store, oauth, control };

    let app = Router::new()
        .route("/v1/token-requests", post(create_token_request))
        .route("/v1/token-requests/:id/status", get(get_status))
        .route("/v1/token-requests/:id/select-account", post(select_account))
        .route("/oauth/callback", get(oauth_callback))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&cfg.bind_addr)
        .await
        .expect("bind router");
    tracing::info!("Auth router listening on {}", cfg.bind_addr);
    axum::serve(listener, app).await.expect("server error");
}
```

---

## 10. Integration Points

* **Electron control browser** is already exposing `GET /open-auth?account_id=&auth_url=`.
* Router calls that via `ControlClient::open_auth`.
* CLI side just needs a tiny HTTP client to:

  * `POST /v1/token-requests`
  * Poll `GET /v1/token-requests/:id/status`
  * Handle `status=approved` + tokens.

If you want, next step I can spec the **CLI helper library** in Rust (or Python) that wraps those calls into a single `get_token()` function per employee/machine.
