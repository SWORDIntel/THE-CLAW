# Claude Control + Auth Router Starter

This repo wires the provided specs into runnable starter projects:

- **claude-control-browser**: Electron window with 5 isolated Claude sessions, plus a control server for `/open-auth` requests.
- **claude-auth-router**: Axum-based OAuth router that coordinates token requests and drives the control browser.
- **claude-auth-client**: Blocking Rust helper to call the router with per-account token caching.

## Layout

- `claude-control-browser/` — Electron app (`npm install && npm start`).
- `claude-auth-router/` — Rust crate (`cargo run -p claude-auth-router`).
- `claude-auth-client/` — Rust library for CLIs.

## Quick start

1. **Electron control browser**
   ```bash
   cd claude-control-browser
   npm install
   npm start
   ```
   Launches the 5-pane grid and an HTTP listener on `127.0.0.1:7780/open-auth` that loads provider URLs into the chosen pane.

2. **Auth router (Axum)**
   ```bash
   OAUTH_CLIENT_ID=example \
   OAUTH_CLIENT_SECRET=example \
   OAUTH_AUTH_URL=https://example.com/oauth/authorize \
   OAUTH_TOKEN_URL=https://example.com/oauth/token \
   cargo run -p claude-auth-router
   ```
   Routes:
   - `POST /v1/token-requests` → create request `{client_name, hostname, scopes}`
   - `POST /v1/token-requests/:id/select-account` → mark request and open the auth URL in the chosen pane
   - `GET /v1/token-requests/:id/status` → poll status/token
   - `GET /oauth/callback` → handles provider redirect and exchanges the code

3. **CLI helper (blocking Rust)**
   ```rust
   use claude_auth_client::{get_token, ClientConfig};

   fn main() -> Result<(), Box<dyn std::error::Error>> {
       let cfg = ClientConfig::from_env_defaults()?;
       let scopes = ["basic", "code:read"];
       let token = get_token(&cfg, &scopes)?;
       println!("access token: {}", token.access_token);
       Ok(())
   }
   ```
   `ClientConfig` supports `CLAUDE_ACCOUNT_NAMESPACE`/`CLAUDE_PROFILE` so each account/host gets its own cache at `~/.config/ClaudeAuthClient/<namespace>/token_cache.json`.

## Notes

- Control browser binds to loopback only and keeps each employee in an isolated `partition` session.
- Router and client use JSON over HTTP with serde-friendly types.
- Token exchange currently uses the configured OAuth endpoints via `reqwest` with Rustls.
