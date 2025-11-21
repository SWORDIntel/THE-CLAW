Cool, let’s wire this up.

I’ll give you:

1. An **Electron app skeleton** with 5 isolated Claude sessions in a grid.
2. An **Auth Router API spec** your CLIs can talk to, plus how it ties into those 5 sessions.

---

## 1. Electron “Claude Control Browser” Skeleton

### 1.1 Directory layout

```text
claude-control-browser/
  package.json
  src/
    main.js        # Electron main process
    layout.js      # BrowserView creation & layout helpers
    config.js      # Account/session mapping
```

You can add TypeScript/React later; this is a minimal JS skeleton.

### 1.2 package.json (minimal)

```json
{
  "name": "claude-control-browser",
  "version": "0.1.0",
  "private": true,
  "main": "src/main.js",
  "scripts": {
    "start": "electron ."
  },
  "dependencies": {
    "electron": "^33.0.0"
  }
}
```

Install:

```bash
npm install
npm start
```

### 1.3 src/config.js

Define the 5 accounts and their partitions:

```js
// src/config.js

// Logical accounts (employees) mapped to Electron session partitions
const ACCOUNTS = [
  { id: 1, name: "Employee 1", partition: "persist:account-1" },
  { id: 2, name: "Employee 2", partition: "persist:account-2" },
  { id: 3, name: "Employee 3", partition: "persist:account-3" },
  { id: 4, name: "Employee 4", partition: "persist:account-4" },
  { id: 5, name: "Employee 5", partition: "persist:account-5" }
];

// Target site
const TARGET_URL = "https://claude.ai";

module.exports = {
  ACCOUNTS,
  TARGET_URL
};
```

### 1.4 src/layout.js

Grid layout logic for 5 `BrowserView`s inside one window.

```js
// src/layout.js
const { BrowserView, session } = require("electron");
const { ACCOUNTS, TARGET_URL } = require("./config");

// Create views for each account
function createAccountViews() {
  return ACCOUNTS.map((acc) => {
    const accSession = session.fromPartition(acc.partition);

    const view = new BrowserView({
      webPreferences: {
        session: accSession
      }
    });

    view.webContents.loadURL(TARGET_URL);
    return { account: acc, view };
  });
}

// Simple 2x3 grid layout (5 panes + 1 empty slot)
function layoutViewsInGrid(mainWindow, views) {
  const [winWidth, winHeight] = mainWindow.getContentSize();

  const cols = 3;
  const rows = 2;

  const cellW = Math.floor(winWidth / cols);
  const cellH = Math.floor(winHeight / rows);

  views.forEach((entry, index) => {
    const col = index % cols;       // 0,1,2
    const row = Math.floor(index / cols); // 0,1

    const x = col * cellW;
    const y = row * cellH;

    entry.view.setBounds({ x, y, width: cellW, height: cellH });
    entry.view.setAutoResize({ width: true, height: true });
    mainWindow.addBrowserView(entry.view);
  });
}

// Find a view by accountId (for auth routing)
function getViewByAccountId(views, accountId) {
  return views.find((v) => v.account.id === accountId) || null;
}

module.exports = {
  createAccountViews,
  layoutViewsInGrid,
  getViewByAccountId
};
```

### 1.5 src/main.js

Main process: creates window, 5 views, and stubs out an HTTP endpoint for the auth router to tell us “open this URL in account N”.

```js
// src/main.js

const { app, BrowserWindow } = require("electron");
const http = require("http");
const url = require("url");
const { createAccountViews, layoutViewsInGrid, getViewByAccountId } = require("./layout");

let mainWindow;
let accountViews = []; // [{ account, view }, ...]

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: "Claude Control Browser",
    webPreferences: {
      // No normal renderer; just using BrowserViews
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  accountViews = createAccountViews();
  layoutViewsInGrid(mainWindow, accountViews);
}

// Local HTTP server so Auth Router (or CLI) can instruct us:
//   GET /open-auth?account_id=3&auth_url=https%3A%2F%2Fexample.com%2Foauth
function startControlServer() {
  const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === "/open-auth" && req.method === "GET") {
      const accountId = parseInt(parsed.query.account_id, 10);
      const authUrl = parsed.query.auth_url;

      const target = getViewByAccountId(accountViews, accountId);
      if (!target || !authUrl) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "invalid_account_or_url" }));
        return;
      }

      // Load auth URL in this account's session/view
      target.view.webContents.loadURL(authUrl);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not_found" }));
  });

  const PORT = 7780; // local control port
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Control server listening on http://127.0.0.1:${PORT}`);
  });
}

app.whenReady().then(() => {
  createMainWindow();
  startControlServer();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On Linux/Windows we quit when all windows are closed
  if (process.platform !== "darwin") {
    app.quit();
  }
});
```

**Result:**

* One Electron window with 5 `BrowserView`s, each logged into its own Claude account.
* A simple control HTTP API at `http://127.0.0.1:7780/open-auth?account_id=N&auth_url=...`
* Your **Auth Router** (below) will hit that endpoint whenever it wants to start an OAuth flow in a specific account.

---

## 2. Auth Router: API + Flow Spec

This is the daemon the CLIs talk to. It:

1. Accepts a “please get me a token” request from a CLI.
2. Lets the manager choose which account (1–5) to use.
3. Asks the **control browser** to open the OAuth URL in that account.
4. Receives the OAuth callback.
5. Returns tokens to the CLI.

Implementation language is up to you; spec is HTTP+JSON.

### 2.1 Entities

**AuthRequest**

```json
{
  "id": "req_01HZZ8RK9GFE...",
  "client_name": "dsmil-cli",
  "hostname": "workstation-12",
  "scopes": ["basic", "code:read"],
  "status": "pending | awaiting_user | in_progress | approved | denied | error",
  "account_id": 3,
  "created_at": "2025-11-21T13:00:00Z",
  "updated_at": "2025-11-21T13:00:10Z",
  "error": null
}
```

**TokenResponse** (what CLI ultimately wants):

```json
{
  "access_token": "abc123...",
  "refresh_token": "def456...",
  "expires_at": "2025-11-21T15:00:00Z",
  "token_type": "Bearer",
  "scope": "basic code:read"
}
```

### 2.2 Router HTTP API

Assume router listens on `http://127.0.0.1:7777`.

#### 2.2.1 `POST /v1/token-requests`

**Purpose:** CLI asks for a token. Router creates an `AuthRequest`.

**Request (from CLI):**

```http
POST /v1/token-requests HTTP/1.1
Host: 127.0.0.1:7777
Content-Type: application/json

{
  "client_name": "dsmil-cli",
  "hostname": "alice-workstation",
  "scopes": ["basic", "code:read"]
}
```

**Response:**

```json
{
  "request_id": "req_01HZZ8RK9GFE...",
  "status": "pending"
}
```

Router sets status to `pending`.

---

#### 2.2.2 Manager selection: `POST /v1/token-requests/:id/select-account`

**Purpose:** Manager (or a small admin TUI) assigns the request to an account ID 1–5.

**Request:**

```http
POST /v1/token-requests/req_01HZZ8RK9GFE.../select-account
Content-Type: application/json

{
  "account_id": 3
}
```

**Response:**

```json
{
  "request_id": "req_01HZZ8RK9GFE...",
  "status": "in_progress",
  "account_id": 3
}
```

When this happens, the router:

1. Builds the provider authorization URL (Claude OAuth) – call it `AUTH_URL`.

2. Hits your Electron control browser:

   ```http
   GET http://127.0.0.1:7780/open-auth?account_id=3&auth_url=AUTH_URL
   ```

3. Sets `status = "in_progress"`.

You can drive this selection via:

* A small web UI on the router (`GET /admin` listing pending requests).
* Or a TUI/CLI that calls this endpoint.

---

#### 2.2.3 OAuth callback: `GET /oauth/callback`

**Purpose:** OAuth redirect URI for Claude (or whatever provider).

You configure the provider to redirect to:

```
http://127.0.0.1:7777/oauth/callback
```

**Example provider redirect to router:**

```http
GET /oauth/callback?code=ABC123&state=req_01HZZ8RK9GFE... HTTP/1.1
Host: 127.0.0.1:7777
```

Router then:

1. Extracts `code` and `state` (which is `request_id`).
2. Exchanges `code` for tokens at the provider’s token endpoint.
3. Stores tokens in memory (and optionally encrypted on disk).
4. Sets `status = "approved"` for that `AuthRequest`.

Response back to browser can just be a simple “You may close this window”.

---

#### 2.2.4 CLI polling: `GET /v1/token-requests/:id/status`

**Purpose:** CLI polls until auth finished.

**Request:**

```http
GET /v1/token-requests/req_01HZZ8RK9GFE.../status
Host: 127.0.0.1:7777
```

**Response (while pending or in_progress):**

```json
{
  "request_id": "req_01HZZ8RK9GFE...",
  "status": "in_progress"
}
```

**Response (when approved):**

```json
{
  "request_id": "req_01HZZ8RK9GFE...",
  "status": "approved",
  "token": {
    "access_token": "abc123...",
    "refresh_token": "def456...",
    "expires_at": "2025-11-21T15:00:00Z",
    "token_type": "Bearer",
    "scope": "basic code:read"
  }
}
```

**Response (denied / error):**

```json
{
  "request_id": "req_01HZZ8RK9GFE...",
  "status": "denied",
  "error": "user_denied"
}
```

---

#### 2.2.5 Optional: `POST /v1/token-requests/:id/cancel`

CLI or manager can cancel a request.

```http
POST /v1/token-requests/req_01HZZ8RK9GFE.../cancel
```

Response:

```json
{
  "request_id": "req_01HZZ8RK9GFE...",
  "status": "cancelled"
}
```

---

### 2.3 Typical Flow (End to End)

1. **CLI** → `POST /v1/token-requests` → gets `request_id="req_..."`.

2. CLI starts polling `GET /v1/token-requests/:id/status`.

3. **Manager** opens router admin (web or TUI), sees pending requests.

4. Manager chooses account 3 → `POST /v1/token-requests/:id/select-account` with `{ account_id: 3 }`.

5. Router:

   * Builds `AUTH_URL`.
   * Calls Electron control browser:
     `GET http://127.0.0.1:7780/open-auth?account_id=3&auth_url=AUTH_URL`.

6. Account 3’s Claude pane shows the login/consent screen.

7. Employee (via remote desktop) approves.

8. Provider redirects to `http://127.0.0.1:7777/oauth/callback?code=...&state=req_...`.

9. Router exchanges code → tokens, marks request `approved`.

10. CLI polling sees `status="approved"` and grabs tokens.

From there, CLI uses tokens directly; router is only in the loop for renewals (you can re-use same flow or implement refresh token handling internally).

---

### 2.4 Security knobs to think about

* **Bind to loopback only**: router & control server both bound to `127.0.0.1`.
* **Auth for admin interface**: protect `/admin` or any manager endpoints (mTLS/Basic auth).
* **Per-account token store**: store tokens under e.g. `/var/lib/claude-router/account-3/tokens.json` with `chmod 600`.
* **Audit logging**:
  `account_id, request_id, client_name, hostname, time, scopes, result`.

---

If you want next, I can:

* Turn this router spec into a concrete implementation skeleton (Rust or Python).
* Or sketch the CLI-side helper library that hides all of this behind a simple `get_token()` call.
