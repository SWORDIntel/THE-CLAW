use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type RequestId = Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
    pub token: Option<TokenBundle>,
    pub error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl AuthRequest {
    pub fn new(client_name: String, hostname: String, scopes: Vec<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            client_name,
            hostname,
            scopes,
            status: RequestStatus::Pending,
            account_id: None,
            token: None,
            error: None,
            created_at: now,
            updated_at: now,
        }
    }
}
