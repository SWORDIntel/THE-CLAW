# Claude Control + Auth Router Starter

This repo wires the provided specs into runnable starter projects:

- **claude-control-browser**: Electron window with 6 isolated panes (5 Claude-ready, 1 ChatGPT/verification), plus a control server for `/open-auth` requests, manual URL launch, per-pane back/forward/reload controls, and a pane-level countdown overlay with Pushbullet alerts.
- **claude-auth-router**: Axum-based OAuth router that coordinates token requests and drives the control browser.
- **claude-auth-client**: Blocking Rust helper to call the router with per-account token caching.

## Layout

- `claude-control-browser/` — Electron app (`npm install && npm start`).
- `claude-auth-router/` — Rust crate (`cargo run -p claude-auth-router`).
- `claude-auth-client/` — Rust library for CLIs.

Pushbullet alerts default to the provided token; override by exporting `PUSHBULLET_TOKEN` before launch if you need a different account/device.

## Quick start

1. **Electron control browser**
   ```bash
   cd claude-control-browser
   npm install
   npm start
   ```
   Launches a 3x2 grid (five Claude Code/Workspace panes preloaded with Claude; sixth opens ChatGPT and keeps a clean, persistent session). A helper page lives at `http://127.0.0.1:7780/` so you can pick a pane, send any URL, drive history, or attach a timer overlay without crafting requests by hand. All panes force a TEMPEST CLASS C dark theme for better contrast and auto-open a dedicated mail pop-up to Gmail (configurable) whenever a "login with email" control is clicked.

   HTTP listener (loopback only):
   - `GET /` → simple form to open URLs and navigate history for any pane
   - `GET /open-auth?account_id=<id>&auth_url=<url>` → load provider URL in a specific pane
   - `GET /open-url?account_id=<id>&target_url=<url>` → load arbitrary URL in a specific pane
   - `GET /open-verification?target_url=<url>` → send a verification/OAuth flow to the dedicated ChatGPT pane
   - `GET /navigate?account_id=<id>&action=back|forward|reload` → drive history controls per pane
   - `GET /set-timer?account_id=<id>&target_time=<datetime-local>` → start a digital countdown overlay (up to 6 days out, 24h clock) that flashes near zero and on expiry sends Pushbullet text "X IS AVAILABLE" with the pane name/position
   - `GET /cancel-timer?account_id=<id>` → stop and hide the countdown overlay for a pane

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

- Control browser binds to loopback only and keeps each employee in an isolated `partition` session. Pane 6 starts on ChatGPT and retains its cookies/tokens until cleared. The main window enforces a minimum of 1128x1024 and the overlay timer can be dragged for comfortable viewing. All panes (and the mail pop-up) apply a TEMPEST CLASS C dark theme CSS on load.
- Email login helper: clicking a "login with email" button opens a dedicated Gmail pop-up using its own persisted partition. Override with `MAIL_POPUP_URL`, `EMAIL_LOGIN_SELECTORS`, or `EMAIL_LOGIN_TEXT_MATCHES` to target your own provider/markup.
- Router and client use JSON over HTTP with serde-friendly types.
- Token exchange currently uses the configured OAuth endpoints via `reqwest` with Rustls.
