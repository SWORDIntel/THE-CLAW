use crate::config::OAuthConfig;
use crate::models::TokenBundle;
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use url::Url;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum OAuthError {
    #[error("invalid url: {0}")]
    Url(String),
    #[error("http error: {0}")]
    Http(String),
    #[error("token exchange failed: {0}")]
    Exchange(String),
}

#[derive(Debug, Clone)]
pub struct OAuthClient {
    cfg: OAuthConfig,
    http: reqwest::Client,
}

impl OAuthClient {
    pub fn new(cfg: OAuthConfig) -> Self {
        Self {
            cfg,
            http: reqwest::Client::new(),
        }
    }

    pub fn build_auth_url(&self, state: &Uuid, scopes: &[String]) -> Result<String, OAuthError> {
        let mut url = Url::parse(&self.cfg.auth_url).map_err(|e| OAuthError::Url(e.to_string()))?;
        let scope = scopes.join(" ");

        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", &self.cfg.client_id)
            .append_pair("redirect_uri", &self.cfg.redirect_uri)
            .append_pair("scope", &scope)
            .append_pair("state", &state.to_string());

        Ok(url.to_string())
    }

    pub async fn exchange_code(&self, code: &str) -> Result<TokenBundle, OAuthError> {
        #[derive(Serialize)]
        struct TokenRequest<'a> {
            grant_type: &'a str,
            code: &'a str,
            client_id: &'a str,
            client_secret: &'a str,
            redirect_uri: &'a str,
        }

        #[derive(Deserialize)]
        struct TokenResponse {
            access_token: String,
            #[serde(default)]
            refresh_token: Option<String>,
            #[serde(default)]
            expires_in: Option<i64>,
            #[serde(default = "default_token_type")]
            token_type: String,
            #[serde(default)]
            scope: Option<String>,
        }

        let req_body = TokenRequest {
            grant_type: "authorization_code",
            code,
            client_id: &self.cfg.client_id,
            client_secret: &self.cfg.client_secret,
            redirect_uri: &self.cfg.redirect_uri,
        };

        let resp = self
            .http
            .post(&self.cfg.token_url)
            .form(&req_body)
            .send()
            .await
            .map_err(|e| OAuthError::Http(e.to_string()))?
            .error_for_status()
            .map_err(|e| OAuthError::Exchange(e.to_string()))?;

        let token: TokenResponse = resp
            .json()
            .await
            .map_err(|e| OAuthError::Exchange(e.to_string()))?;

        let expires_at = token
            .expires_in
            .map(|secs| Utc::now() + Duration::seconds(secs));

        Ok(TokenBundle {
            access_token: token.access_token,
            refresh_token: token.refresh_token,
            expires_at,
            token_type: token.token_type,
            scope: token.scope,
        })
    }
}

fn default_token_type() -> String {
    "Bearer".to_string()
}
