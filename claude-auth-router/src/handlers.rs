use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::info;
use uuid::Uuid;

use crate::{
    control_client::ControlClient,
    models::{AuthRequest, RequestStatus, TokenBundle},
    oauth::OAuthClient,
    store::AuthStore,
};

#[derive(Clone)]
pub struct AppState {
    pub store: AuthStore,
    pub oauth: OAuthClient,
    pub control: ControlClient,
}

#[derive(Debug, Deserialize)]
pub struct CreateTokenRequest {
    pub client_name: String,
    pub hostname: String,
    #[serde(default)]
    pub scopes: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateTokenResponse {
    pub request_id: Uuid,
    pub status: RequestStatus,
}

pub async fn create_token_request(
    State(state): State<AppState>,
    Json(body): Json<CreateTokenRequest>,
) -> (StatusCode, Json<CreateTokenResponse>) {
    let mut req = AuthRequest::new(body.client_name, body.hostname, body.scopes);
    let status = req.status.clone();
    let id = req.id;
    state.store.insert(req);

    info!(%id, "created token request");

    (
        StatusCode::ACCEPTED,
        Json(CreateTokenResponse {
            request_id: id,
            status,
        }),
    )
}

#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub request_id: Uuid,
    pub status: RequestStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<TokenBundle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn get_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> (StatusCode, Json<StatusResponse>) {
    match parse_uuid(&id) {
        Ok(uuid) => match state.store.get(&uuid) {
            Some(req) => (
                StatusCode::OK,
                Json(StatusResponse {
                    request_id: req.id,
                    status: req.status,
                    token: req.token,
                    error: req.error,
                }),
            ),
            None => (
                StatusCode::NOT_FOUND,
                Json(StatusResponse {
                    request_id: uuid,
                    status: RequestStatus::Error,
                    token: None,
                    error: Some("request_not_found".into()),
                }),
            ),
        },
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(StatusResponse {
                request_id: Uuid::nil(),
                status: RequestStatus::Error,
                token: None,
                error: Some(format!("invalid_request_id: {e}")),
            }),
        ),
    }
}

#[derive(Debug, Deserialize)]
pub struct SelectAccountRequest {
    pub account_id: u32,
}

#[derive(Debug, Serialize)]
pub struct SelectAccountResponse {
    pub request_id: Uuid,
    pub status: RequestStatus,
    pub account_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn select_account(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SelectAccountRequest>,
) -> (StatusCode, Json<SelectAccountResponse>) {
    match parse_uuid(&id) {
        Ok(uuid) => match state.store.get(&uuid) {
            Some(mut req) => {
                req.status = RequestStatus::InProgress;
                req.account_id = Some(body.account_id);
                req.updated_at = chrono::Utc::now();

                let result = state
                    .oauth
                    .build_auth_url(&req.id, &req.scopes)
                    .and_then(|url| {
                        async {
                            state
                                .control
                                .open_auth(body.account_id, &url)
                                .await
                                .map_err(|e| crate::oauth::OAuthError::Exchange(e.to_string()))?;
                            Ok::<_, crate::oauth::OAuthError>(url)
                        }
                        .await
                    });

                if let Err(err) = result {
                    req.status = RequestStatus::Error;
                    req.error = Some(err.to_string());
                }

                state.store.update(req.clone());
                (
                    StatusCode::OK,
                    Json(SelectAccountResponse {
                        request_id: req.id,
                        status: req.status,
                        account_id: body.account_id,
                        error: req.error,
                    }),
                )
            }
            None => (
                StatusCode::NOT_FOUND,
                Json(SelectAccountResponse {
                    request_id: uuid,
                    status: RequestStatus::Error,
                    account_id: body.account_id,
                    error: Some("request_not_found".into()),
                }),
            ),
        },
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(SelectAccountResponse {
                request_id: Uuid::nil(),
                status: RequestStatus::Error,
                account_id: body.account_id,
                error: Some(format!("invalid_request_id: {e}")),
            }),
        ),
    }
}

pub async fn oauth_callback(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> (StatusCode, String) {
    let code = match params.get("code") {
        Some(v) => v.clone(),
        None => return (StatusCode::BAD_REQUEST, "missing_code".into()),
    };

    let state_param = match params.get("state") {
        Some(v) => v.clone(),
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

    match state.oauth.exchange_code(&code).await {
        Ok(token) => {
            req.token = Some(token);
            req.status = RequestStatus::Approved;
            req.updated_at = chrono::Utc::now();
            req.error = None;
            state.store.update(req);
            (StatusCode::OK, "You may close this window.".into())
        }
        Err(e) => {
            req.status = RequestStatus::Error;
            req.updated_at = chrono::Utc::now();
            req.error = Some(e.to_string());
            state.store.update(req);
            (StatusCode::INTERNAL_SERVER_ERROR, "OAuth error".into())
        }
    }
}

fn parse_uuid(s: &str) -> Result<Uuid, uuid::Error> {
    Uuid::parse_str(s)
}
