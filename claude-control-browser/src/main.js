const { app, BrowserWindow, session } = require("electron");
const http = require("http");
const https = require("https");
const {
  ACCOUNTS,
  VERIFICATION_VIEW_ID,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MAX_TIMER_WINDOW_DAYS,
  DEFAULT_PUSHBULLET_TOKEN,
  TEMPEST_DARK_THEME_CSS,
  MAIL_POPUP_URL,
  MAIL_POPUP_PARTITION,
  EMAIL_LOGIN_SELECTORS,
  EMAIL_LOGIN_TEXT_MATCHES,
  CHROME_USER_AGENT
} = require("./config");
const { createAccountViews, layoutViewsInGrid, getViewByAccountId } = require("./layout");

app.commandLine.appendSwitch("enable-features", "WaylandWindowDecorations");
app.commandLine.appendSwitch("ozone-platform-hint", "auto");
app.commandLine.appendSwitch("enable-wayland-ime");

let mainWindow;
let mailWindow;
let views = [];
const timers = new Map();

function attachTempestTheme(webContents) {
  if (typeof webContents.setColorScheme === "function") {
    try {
      webContents.setColorScheme("dark");
    } catch (_) {}
  }
  if (TEMPEST_DARK_THEME_CSS) {
    webContents.insertCSS(TEMPEST_DARK_THEME_CSS).catch(() => {});
  }
}

function injectEmailLoginHelper(webContents) {
  const selectors = JSON.stringify(EMAIL_LOGIN_SELECTORS || []);
  const textMatches = JSON.stringify((EMAIL_LOGIN_TEXT_MATCHES || []).map((t) => t.toLowerCase()));
  const mailUrl = MAIL_POPUP_URL;
  const script = `(function(){
    if (window.__claw_email_helper_installed) return;
    window.__claw_email_helper_installed = true;
    const selectors = ${selectors};
    const textMatches = ${textMatches};
    function matchesTarget(el){
      if(!el) return false;
      if (selectors.some((sel) => { try { return el.closest(sel); } catch (_) { return false; } })) return true;
      const btn = el.closest('button, a, input[type="button"], input[type="submit"]');
      if(!btn) return false;
      const txt = (btn.innerText || btn.textContent || '').toLowerCase();
      return textMatches.some((needle) => txt.includes(needle));
    }
    function handleClick(ev){
      const target = ev.target;
      if (matchesTarget(target)) {
        window.open('${mailUrl}', '_blank', 'noopener');
      }
    }
    document.addEventListener('click', handleClick, true);
  })();`;
  webContents.executeJavaScript(script).catch(() => {});
}

function attachContentHelpers(webContents) {
  const applyHelpers = () => {
    attachTempestTheme(webContents);
    injectEmailLoginHelper(webContents);
  };
  webContents.on("did-finish-load", applyHelpers);
}

function ensureMailPopup(targetUrl) {
  const normalized = safeNormalizeUrl(targetUrl) || MAIL_POPUP_URL;
  if (mailWindow && !mailWindow.isDestroyed()) {
    mailWindow.loadURL(normalized);
    mailWindow.show();
    mailWindow.focus();
    return mailWindow;
  }

  mailWindow = new BrowserWindow({
    width: 960,
    height: 720,
    title: "Mail Login",
    autoHideMenuBar: true,
    webPreferences: {
      session: session.fromPartition(MAIL_POPUP_PARTITION)
    }
  });

  if (CHROME_USER_AGENT) {
    mailWindow.webContents.setUserAgent(CHROME_USER_AGENT);
  }
  attachContentHelpers(mailWindow.webContents);
  mailWindow.loadURL(normalized);
  mailWindow.on("closed", () => {
    mailWindow = null;
  });
  return mailWindow;
}

function bindWindowOpenHandler(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    if (url && url.startsWith(MAIL_POPUP_URL)) {
      ensureMailPopup(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: "Claude Control Browser",
    autoHideMenuBar: true
  });

  views = createAccountViews();
  views.forEach(({ view }) => {
    attachContentHelpers(view.webContents);
    bindWindowOpenHandler(view.webContents);
  });
  layoutViewsInGrid(mainWindow, views);

  mainWindow.on("resize", () => {
    layoutViewsInGrid(mainWindow, views);
  });
}

function safeNormalizeUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    return parsed.toString();
  } catch (err) {
    return null;
  }
}

function openUrlInView(accountId, targetUrl) {
  const target = getViewByAccountId(views, accountId);
  if (!target) {
    return { ok: false, status: 404, body: { status: "not_found" } };
  }

  const normalized = safeNormalizeUrl(targetUrl);
  if (!normalized) {
    return { ok: false, status: 400, body: { status: "invalid_url" } };
  }

  target.view.webContents.loadURL(normalized);
  return { ok: true, status: 200, body: { status: "ok", accountId, url: normalized } };
}

function navigateHistory(accountId, direction) {
  const target = getViewByAccountId(views, accountId);
  if (!target) {
    return { ok: false, status: 404, body: { status: "not_found" } };
  }

  const contents = target.view.webContents;
  if (direction === "back") {
    if (!contents.canGoBack()) {
      return { ok: false, status: 409, body: { status: "cannot_go_back" } };
    }
    contents.goBack();
    return { ok: true, status: 200, body: { status: "ok", action: "back", accountId } };
  }

  if (direction === "forward") {
    if (!contents.canGoForward()) {
      return { ok: false, status: 409, body: { status: "cannot_go_forward" } };
    }
    contents.goForward();
    return { ok: true, status: 200, body: { status: "ok", action: "forward", accountId } };
  }

  if (direction === "reload") {
    contents.reload();
    return { ok: true, status: 200, body: { status: "ok", action: "reload", accountId } };
  }

  return { ok: false, status: 400, body: { status: "invalid_action" } };
}

function renderTimerOverlay(accountId, display, flashing) {
  const target = getViewByAccountId(views, accountId);
  if (!target) return;
  const safeDisplay = JSON.stringify(display || "");
  const flashingLiteral = flashing ? "true" : "false";
  const script = `(function(){
    const existing = document.getElementById('__claw_timer_overlay');
    const styleId = '__claw_timer_overlay_style';
    if(!document.getElementById(styleId)){
      const st = document.createElement('style');
      st.id = styleId;
      st.textContent = '@keyframes claw-timer-flash { from { opacity: 1; } 50% { opacity: 0.3; } to { opacity: 1; } } ' +
        '#__claw_timer_overlay.claw-flash { animation: claw-timer-flash 0.9s ease-in-out infinite; }';
      document.head.appendChild(st);
    }
    const root = existing || document.createElement('div');
    root.id = '__claw_timer_overlay';
    root.style.position = 'fixed';
    root.style.top = '12px';
    root.style.right = '12px';
    root.style.padding = '10px 14px';
    root.style.background = 'rgba(0, 0, 0, 0.75)';
    root.style.color = '#0ff';
    root.style.fontFamily = 'monospace';
    root.style.fontSize = '18px';
    root.style.fontWeight = '700';
    root.style.border = '2px solid #0ff';
    root.style.borderRadius = '10px';
    root.style.zIndex = 2147483647;
    root.style.cursor = 'move';
    root.textContent = 'Timer: ' + ${safeDisplay};
    if (${flashingLiteral}) { root.classList.add('claw-flash'); } else { root.classList.remove('claw-flash'); }

    if (!existing) {
      let isDown = false;
      let offset = { x: 0, y: 0 };
      root.addEventListener('mousedown', (e) => {
        isDown = true;
        offset = { x: root.offsetLeft - e.clientX, y: root.offsetTop - e.clientY };
      });
      document.addEventListener('mouseup', () => { isDown = false; });
      document.addEventListener('mousemove', (event) => {
        event.preventDefault();
        if (!isDown) return;
        root.style.left = event.clientX + offset.x + 'px';
        root.style.top = event.clientY + offset.y + 'px';
        root.style.right = 'auto';
      });
      root.addEventListener('dragstart', (e) => e.preventDefault());
    }

    if (!existing) {
      root.addEventListener('mousedown', (e) => {
        let startX = e.clientX;
        let startY = e.clientY;
        const rect = root.getBoundingClientRect();
        const origLeft = rect.left;
        const origTop = rect.top;
        function move(ev){
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          root.style.left = origLeft + dx + 'px';
          root.style.top = origTop + dy + 'px';
          root.style.right = 'auto';
        }
        function up(){
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        }
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });
      document.body.appendChild(root);
    }
  })();`;
  target.view.webContents.executeJavaScript(script).catch(() => {});
}



function clearTimerOverlay(accountId) {
  const target = getViewByAccountId(views, accountId);
  if (!target) return;
  const script = `(function(){
    const el = document.getElementById('__claw_timer_overlay');
    if (el && el.parentElement) { el.parentElement.removeChild(el); }
  })();`;
  target.view.webContents.executeJavaScript(script).catch(() => {});
}

function formatRemaining(ms) {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (days > 0) {
    return `${days}d ${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}:${ss}`;
}

function getPositionLabel(accountId) {
  const index = ACCOUNTS.findIndex((acc) => acc.id === accountId);
  const labels = [
    "top-left",
    "top-center-left",
    "top-center-right",
    "top-right",
    "bottom-left",
    "bottom-center-left",
    "bottom-center-right",
    "bottom-right"
  ];
  if (index >= 0 && index < labels.length) {
    return labels[index];
  }
  return `pane ${accountId}`;
}

function sendAvailabilityPush(accountId) {
  const token = DEFAULT_PUSHBULLET_TOKEN;
  if (!token) {
    console.warn("Pushbullet token missing; skipping alert");
    return Promise.resolve({ ok: false, reason: "missing_token" });
  }

  const account = ACCOUNTS.find((acc) => acc.id === accountId);
  const title = `${account ? account.name : `Pane ${accountId}`}`;
  const position = getPositionLabel(accountId);
  const body = `${title} (${position}) is AVAILABLE`;
  const payload = JSON.stringify({ type: "note", title: "X IS AVAILABLE", body });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.pushbullet.com",
        path: "/v2/pushes",
        method: "POST",
        headers: {
          "Access-Token": token,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          resolve({ ok: true, statusCode: res.statusCode });
        });
      }
    );

    req.on("error", (err) => {
      console.error("Pushbullet error", err);
      resolve({ ok: false, reason: "request_error" });
    });

    req.write(payload);
    req.end();
  });
}

function stopTimer(accountId, removeOverlay = true) {
  const existing = timers.get(accountId);
  if (existing && existing.interval) {
    clearInterval(existing.interval);
  }
  if (removeOverlay) {
    clearTimerOverlay(accountId);
  }
  timers.delete(accountId);
}

function updateTimer(accountId) {
  const entry = timers.get(accountId);
  if (!entry) return;
  const remaining = entry.target - Date.now();
  const display = formatRemaining(remaining);
  const flashing = remaining <= 0 || remaining <= 10000;

  renderTimerOverlay(accountId, display, flashing);

  if (remaining <= 0 && !entry.notified) {
    entry.notified = true;
    sendAvailabilityPush(accountId).finally(() => {});
    stopTimer(accountId, true);
  }
}

function setTimer(accountId, targetTimeIso) {
  const targetView = getViewByAccountId(views, accountId);
  if (!targetView) {
    return { ok: false, status: 404, body: { status: "not_found" } };
  }
  const targetDate = new Date(targetTimeIso);
  if (isNaN(targetDate.getTime())) {
    return { ok: false, status: 400, body: { status: "invalid_time" } };
  }

  const now = Date.now();
  const maxFuture = now + MAX_TIMER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const targetMs = targetDate.getTime();

  if (targetMs <= now || targetMs > maxFuture) {
    return { ok: false, status: 400, body: { status: "out_of_range" } };
  }

  stopTimer(accountId);
  const interval = setInterval(() => updateTimer(accountId), 1000);
  timers.set(accountId, { target: targetMs, interval, notified: false });
  updateTimer(accountId);
  return {
    ok: true,
    status: 200,
    body: { status: "ok", accountId, target: new Date(targetMs).toISOString() }
  };
}

function renderControlPage() {
  const options = ACCOUNTS.map((acc) => `<option value="${acc.id}">${acc.name}</option>`).join("");
  const maxDate = new Date(Date.now() + MAX_TIMER_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const minDate = new Date().toISOString().slice(0, 16);
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Claude Control Browser</title>
      <style>
        body { font-family: sans-serif; padding: 2rem; max-width: 860px; }
        label { display: block; margin-top: 1rem; font-weight: 600; }
        input, select { width: 100%; padding: 0.5rem; margin-top: 0.25rem; }
        button { margin-top: 1rem; padding: 0.75rem 1rem; font-weight: 700; }
        .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.75rem; }
        .hint { color: #444; font-size: 0.9rem; margin-top: 0.5rem; }
        .card { border: 1px solid #ccc; border-radius: 10px; padding: 1rem; margin-top: 1.5rem; }
      </style>
    </head>
    <body>
      <h1>Claude Control Browser</h1>
      <p>Eight panes in a 4x2 grid: 5 Claude sessions (3 Code, 2 Workspace), 2 ChatGPT sessions, and 1 Gemini session for diversified AI access and verification.</p>
      <form id="nav-form" class="card">
        <h2>Navigation</h2>
        <label for="account">Target pane</label>
        <select id="account" name="account">${options}</select>

        <label for="url">URL to open</label>
        <input id="url" name="url" type="url" placeholder="https://example.com" required />
        <div class="hint">History controls work per pane. Each pane maintains separate cookies/tokens for independent sessions.</div>

        <button type="submit">Open URL</button>
      </form>

      <div class="card">
        <h2>History controls</h2>
        <div class="actions">
          <button type="button" data-action="back">◀️ Back</button>
          <button type="button" data-action="forward">▶️ Forward</button>
          <button type="button" data-action="reload">🔄 Reload</button>
        </div>
      </div>

      <form id="timer-form" class="card">
        <h2>Countdown timer (up to ${MAX_TIMER_WINDOW_DAYS} days)</h2>
        <label for="timer-account">Target pane</label>
        <select id="timer-account" name="account">${options}</select>

        <label for="target-time">Target time (24h)</label>
        <input id="target-time" name="target_time" type="datetime-local" min="${minDate}" max="${maxDate}" required />
        <div class="hint">Sets a digital countdown overlay in the selected pane. It flashes near zero and on expiry sends Pushbullet with the pane label and screen position.</div>

        <div class="actions">
          <button type="submit">Start countdown</button>
          <button type="button" id="cancel-timer">Stop & hide timer</button>
        </div>
      </form>

      <div class="card">
        <h2>Login with email helper</h2>
        <p>When a page shows a "login with email" or configured selector, a dedicated mail pop-up opens to ${MAIL_POPUP_URL} for one-click verification.</p>
        <div class="hint">Adjust selectors via EMAIL_LOGIN_SELECTORS or EMAIL_LOGIN_TEXT_MATCHES environment variables if sites use custom markup.</div>
      </div>

      <script>
        const form = document.getElementById('nav-form');
        const buttons = document.querySelectorAll('button[data-action]');
        const timerForm = document.getElementById('timer-form');
        const cancelTimerBtn = document.getElementById('cancel-timer');

        async function callEndpoint(path, params) {
          const qs = new URLSearchParams(params);
          const res = await fetch(path + '?' + qs.toString());
          const data = await res.json();
          alert('Response: ' + JSON.stringify(data));
          return data;
        }

        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const accountId = form.account.value;
          const url = form.url.value;
          await callEndpoint('/open-url', { account_id: accountId, target_url: url });
        });

        buttons.forEach((btn) => {
          btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            const accountId = form.account.value;
            await callEndpoint('/navigate', { account_id: accountId, action });
          });
        });

        timerForm.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const accountId = timerForm['timer-account'].value;
          const targetTime = timerForm['target-time'].value;
          await callEndpoint('/set-timer', { account_id: accountId, target_time: targetTime });
        });

        cancelTimerBtn.addEventListener('click', async () => {
          const accountId = timerForm['timer-account'].value;
          await callEndpoint('/cancel-timer', { account_id: accountId });
        });
      </script>
    </body>
  </html>`;
}

function startControlServer() {
  const controlPage = renderControlPage();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(controlPage);
      return;
    }

    if (url.pathname === "/open-auth") {
      const accountId = parseInt(url.searchParams.get("account_id"), 10);
      const authUrl = url.searchParams.get("auth_url");

      const result = openUrlInView(accountId, authUrl);
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
      return;
    }

    if (url.pathname === "/open-url") {
      const accountId = parseInt(url.searchParams.get("account_id"), 10);
      const targetUrl = url.searchParams.get("target_url");
      const result = openUrlInView(accountId, targetUrl);
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
      return;
    }

    if (url.pathname === "/open-verification") {
      const targetUrl = url.searchParams.get("auth_url") || url.searchParams.get("target_url");
      const result = openUrlInView(VERIFICATION_VIEW_ID, targetUrl);
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
      return;
    }

    if (url.pathname === "/navigate") {
      const accountId = parseInt(url.searchParams.get("account_id"), 10);
      const action = url.searchParams.get("action");
      const result = navigateHistory(accountId, action);
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
      return;
    }

    if (url.pathname === "/set-timer") {
      const accountId = parseInt(url.searchParams.get("account_id"), 10);
      const targetTime = url.searchParams.get("target_time");
      const result = setTimer(accountId, targetTime);
      res.writeHead(result.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result.body));
      return;
    }

    if (url.pathname === "/cancel-timer") {
      const accountId = parseInt(url.searchParams.get("account_id"), 10);
      stopTimer(accountId);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", accountId }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "not_found" }));
  });

  const port = 7780;
  server.listen(port, "127.0.0.1", () => {
    console.log(`Control server listening on http://127.0.0.1:${port}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  startControlServer();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
