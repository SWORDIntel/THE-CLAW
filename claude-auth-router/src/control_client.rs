use crate::config::ControlBrowserConfig;
use reqwest::Url;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ControlClientError {
    #[error("http error: {0}")]
    Http(String),
    #[error("invalid url: {0}")]
    Url(String),
}

#[derive(Clone)]
pub struct ControlClient {
    base_url: String,
    http: reqwest::Client,
}

impl ControlClient {
    pub fn new(cfg: ControlBrowserConfig) -> Self {
        Self {
            base_url: cfg.base_url,
            http: reqwest::Client::new(),
        }
    }

    pub async fn open_auth(
        &self,
        account_id: u32,
        auth_url: &str,
    ) -> Result<(), ControlClientError> {
        let mut url =
            Url::parse(&self.base_url).map_err(|e| ControlClientError::Url(e.to_string()))?;

        url.set_path("/open-auth");
        url.query_pairs_mut()
            .append_pair("account_id", &account_id.to_string())
            .append_pair("auth_url", auth_url);

        self.http
            .get(url)
            .send()
            .await
            .map_err(|e| ControlClientError::Http(e.to_string()))?
            .error_for_status()
            .map_err(|e| ControlClientError::Http(e.to_string()))?;

        Ok(())
    }
}
