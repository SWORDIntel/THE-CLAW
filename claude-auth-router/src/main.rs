mod config;
mod control_client;
mod handlers;
mod models;
mod oauth;
mod store;

use axum::{
    routing::{get, post},
    Router,
};
use handlers::{create_token_request, get_status, oauth_callback, select_account, AppState};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let cfg = config::RouterConfig::from_env();
    let store = store::AuthStore::default();
    let oauth = oauth::OAuthClient::new(cfg.oauth.clone());
    let control = control_client::ControlClient::new(cfg.control_browser.clone());

    let state = AppState {
        store,
        oauth,
        control,
    };

    let app = Router::new()
        .route("/v1/token-requests", post(create_token_request))
        .route("/v1/token-requests/:id/status", get(get_status))
        .route(
            "/v1/token-requests/:id/select-account",
            post(select_account),
        )
        .route("/oauth/callback", get(oauth_callback))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&cfg.bind_addr)
        .await
        .expect("bind router");
    tracing::info!("Auth router listening on {}", cfg.bind_addr);
    axum::serve(listener, app).await.expect("server error");
}
