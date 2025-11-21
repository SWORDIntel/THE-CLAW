use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct OAuthConfig {
    pub client_id: String,
    pub client_secret: String,
    pub auth_url: String,
    pub token_url: String,
    pub redirect_uri: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ControlBrowserConfig {
    pub base_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RouterConfig {
    pub bind_addr: String,
    pub oauth: OAuthConfig,
    pub control_browser: ControlBrowserConfig,
}

impl RouterConfig {
    pub fn from_env() -> Self {
        Self {
            bind_addr: std::env::var("ROUTER_BIND_ADDR")
                .unwrap_or_else(|_| "127.0.0.1:7777".into()),
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
