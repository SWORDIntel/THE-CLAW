const { app, BrowserWindow, session, Menu } = require("electron");
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

// Disable sandbox to support environments without user namespaces (e.g. some containers).
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-setuid-sandbox");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-seccomp-filter-sandbox");
app.commandLine.appendSwitch("enable-features", "WaylandWindowDecorations");
app.commandLine.appendSwitch("ozone-platform-hint", "auto");
app.commandLine.appendSwitch("enable-wayland-ime");

// Performance optimizations for 6 concurrent browser windows
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-oop-rasterization");
app.commandLine.appendSwitch("renderer-process-limit", "6");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-ipc-flooding-protection");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

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

function injectNavigationUI(webContents, accountName) {
  const script = `(function(){
    if (window.__claw_nav_ui_installed) return;
    window.__claw_nav_ui_installed = true;

    const navBar = document.createElement('div');
    navBar.id = '__claw_nav_bar';
    navBar.style.position = 'fixed';
    navBar.style.top = '0';
    navBar.style.left = '0';
    navBar.style.right = '0';
    navBar.style.height = '50px';
    navBar.style.background = 'linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)';
    navBar.style.borderBottom = '2px solid #4fa3ff';
    navBar.style.zIndex = 2147483647;
    navBar.style.display = 'flex';
    navBar.style.alignItems = 'center';
    navBar.style.justifyContent = 'space-between';
    navBar.style.padding = '0 16px';
    navBar.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
    navBar.style.fontFamily = '"Inter", "Segoe UI", system-ui, sans-serif';

    const username = document.createElement('div');
    username.textContent = ${JSON.stringify(accountName)};
    username.style.color = '#4fa3ff';
    username.style.fontSize = '16px';
    username.style.fontWeight = '700';
    username.style.letterSpacing = '0.5px';

    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';

    const usageBtn = document.createElement('button');
    usageBtn.textContent = '⚙️ Usage Settings';
    usageBtn.style.padding = '8px 16px';
    usageBtn.style.borderRadius = '8px';
    usageBtn.style.border = '2px solid #4fa3ff';
    usageBtn.style.background = 'linear-gradient(135deg, #1e3a5f 0%, #0f1f3a 100%)';
    usageBtn.style.color = '#d8e5ff';
    usageBtn.style.fontWeight = '700';
    usageBtn.style.fontSize = '14px';
    usageBtn.style.cursor = 'pointer';
    usageBtn.style.transition = 'all 0.2s ease';
    usageBtn.onmouseover = () => {
      usageBtn.style.background = 'linear-gradient(135deg, #2a4a7f 0%, #152a4a 100%)';
      usageBtn.style.transform = 'scale(1.05)';
    };
    usageBtn.onmouseout = () => {
      usageBtn.style.background = 'linear-gradient(135deg, #1e3a5f 0%, #0f1f3a 100%)';
      usageBtn.style.transform = 'scale(1)';
    };
    usageBtn.onclick = () => {
      window.location.href = 'https://claude.ai/settings/usage';
    };

    const codeBtn = document.createElement('button');
    codeBtn.textContent = '💻 Back to Code';
    codeBtn.style.padding = '8px 16px';
    codeBtn.style.borderRadius = '8px';
    codeBtn.style.border = '2px solid #00d98f';
    codeBtn.style.background = 'linear-gradient(135deg, #1e5f3a 0%, #0f3a1f 100%)';
    codeBtn.style.color = '#d8ffe5';
    codeBtn.style.fontWeight = '700';
    codeBtn.style.fontSize = '14px';
    codeBtn.style.cursor = 'pointer';
    codeBtn.style.transition = 'all 0.2s ease';
    codeBtn.onmouseover = () => {
      codeBtn.style.background = 'linear-gradient(135deg, #2a7f4a 0%, #154a2a 100%)';
      codeBtn.style.transform = 'scale(1.05)';
    };
    codeBtn.onmouseout = () => {
      codeBtn.style.background = 'linear-gradient(135deg, #1e5f3a 0%, #0f3a1f 100%)';
      codeBtn.style.transform = 'scale(1)';
    };
    codeBtn.onclick = () => {
      window.location.href = 'https://claude.ai/code';
    };

    buttonContainer.appendChild(usageBtn);
    buttonContainer.appendChild(codeBtn);

    navBar.appendChild(username);
    navBar.appendChild(buttonContainer);

    document.body.appendChild(navBar);

    // Add padding to body to prevent content from being hidden under nav bar
    const style = document.createElement('style');
    style.textContent = 'body { padding-top: 50px !important; }';
    document.head.appendChild(style);
  })();`;

  webContents.executeJavaScript(script).catch(() => {});
}

function attachContentHelpers(webContents, accountName) {
  const applyHelpers = () => {
    attachTempestTheme(webContents);
    injectEmailLoginHelper(webContents);
    if (accountName) {
      injectNavigationUI(webContents, accountName);
function injectEmailPrefill(webContents, prefillEmail) {
  if (!prefillEmail) return;
  const email = JSON.stringify(prefillEmail);
  const script = `(function(){
    if (window.__claw_email_prefill_installed) return;
    window.__claw_email_prefill_installed = true;
    const email = ${email};
    function prefillEmailFields() {
      const emailSelectors = [
        'input[type="email"]',
        'input[type="text"][name*="email" i]',
        'input[id*="email" i]',
        'input[placeholder*="email" i]',
        'input[aria-label*="email" i]'
      ];
      emailSelectors.forEach(selector => {
        const fields = document.querySelectorAll(selector);
        fields.forEach(field => {
          if (!field.value && !field.disabled) {
            field.value = email;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
    }
    prefillEmailFields();
    document.addEventListener('load', prefillEmailFields, true);
    const observer = new MutationObserver(prefillEmailFields);
    observer.observe(document.body, { childList: true, subtree: true });
  })();`;
  webContents.executeJavaScript(script).catch(() => {});
}

function attachContentHelpers(webContents, prefillEmail) {
  const applyHelpers = () => {
    attachTempestTheme(webContents);
    injectEmailLoginHelper(webContents);
    if (prefillEmail) {
      injectEmailPrefill(webContents, prefillEmail);
    }
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

function bindContextMenu(entry) {
  const { view, account } = entry;
  view.webContents.on("context-menu", (event) => {
    event.preventDefault();
    const menuTemplate = [
      { label: `Open URL in ${account.name}...`, click: () => promptAndOpenUrl(entry) },
      { label: "Toggle inline URL bar", click: () => toggleInlineUrlBar(view.webContents, account.name) }
    ];

    // Add Claude-specific menu items for all except ChatGPT (account 8)
    if (account.id !== 8) {
      menuTemplate.push(
        { type: "separator" },
        {
          label: "Go to Claude Code",
          click: () => view.webContents.loadURL("https://claude.ai/code")
        },
        {
          label: "Go to Settings/Usage",
          click: () => view.webContents.loadURL("https://claude.ai/settings/usage")
        }
      );
    }

    menuTemplate.push(
      { type: "separator" },
      { label: "Reload", click: () => view.webContents.reload() }
    );

    const menu = Menu.buildFromTemplate(menuTemplate);
    menu.popup({ window: mainWindow });
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
  views.forEach((entry) => {
    attachContentHelpers(entry.view.webContents, entry.account.name);
    attachContentHelpers(entry.view.webContents, entry.account.prefillEmail);
    bindWindowOpenHandler(entry.view.webContents);
    bindContextMenu(entry);
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

function normalizeUserUrl(rawUrl) {
  const normalized = safeNormalizeUrl(rawUrl);
  if (normalized) return normalized;
  if (!rawUrl) return null;
  try {
    return new URL(`https://${rawUrl}`).toString();
  } catch (err) {
    return null;
  }
}

async function promptAndOpenUrl(targetEntry) {
  const { view, account } = targetEntry;
  let input = null;
  try {
    input = await view.webContents.executeJavaScript(
      `window.prompt(${JSON.stringify(`Open URL in ${account.name}`)}, ${JSON.stringify(view.webContents.getURL() || "https://")})`
    );
  } catch (err) {
    return;
  }

  if (!input) return;
  const normalized = normalizeUserUrl(input);
  if (!normalized) {
    view.webContents.executeJavaScript('alert("Please enter a valid URL (example.com or https://example.com).")').catch(() => {});
    return;
  }
  view.webContents.loadURL(normalized);
}

function toggleInlineUrlBar(webContents, accountName) {
  const script = `(function(){
    const paneLabel = ${JSON.stringify(accountName || "this pane")};
    const existing = document.getElementById('__claw_url_bar');
    if (existing) { existing.remove(); return 'hidden'; }
    const wrapper = document.createElement('div');
    wrapper.id = '__claw_url_bar';
    wrapper.style.position = 'fixed';
    wrapper.style.top = '8px';
    wrapper.style.left = '50%';
    wrapper.style.transform = 'translateX(-50%)';
    wrapper.style.background = 'rgba(0,0,0,0.8)';
    wrapper.style.border = '1px solid #4fa3ff';
    wrapper.style.borderRadius = '10px';
    wrapper.style.padding = '8px';
    wrapper.style.zIndex = 2147483647;
    wrapper.style.display = 'flex';
    wrapper.style.gap = '6px';
    wrapper.style.alignItems = 'center';
    wrapper.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
    wrapper.style.backdropFilter = 'blur(6px)';
    wrapper.style.pointerEvents = 'auto';

    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.gap = '6px';
    form.style.alignItems = 'center';
    form.style.margin = '0';

    const title = document.createElement('span');
    title.textContent = "URL for " + paneLabel;
    title.style.color = '#d8e5ff';
    title.style.fontSize = '13px';
    title.style.fontWeight = '700';
    title.style.marginRight = '6px';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'https://example.com';
    input.value = window.location.href;
    input.style.width = '380px';
    input.style.maxWidth = '60vw';
    input.style.flex = '1';
    input.style.padding = '8px 10px';
    input.style.borderRadius = '6px';
    input.style.border = '1px solid #1e2a3a';
    input.style.background = '#0a0c12';
    input.style.color = '#e6eef6';
    input.style.fontSize = '14px';

    const goBtn = document.createElement('button');
    goBtn.type = 'submit';
    goBtn.textContent = 'Go';
    goBtn.style.padding = '8px 12px';
    goBtn.style.borderRadius = '6px';
    goBtn.style.border = '1px solid #1e2a3a';
    goBtn.style.background = 'linear-gradient(135deg, #111827, #0b1220)';
    goBtn.style.color = '#d8e5ff';
    goBtn.style.fontWeight = '700';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.style.padding = '8px 10px';
    closeBtn.style.borderRadius = '6px';
    closeBtn.style.border = '1px solid #1e2a3a';
    closeBtn.style.background = '#111827';
    closeBtn.style.color = '#d8e5ff';
    closeBtn.style.fontWeight = '700';

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const raw = (input.value || '').trim();
      if (!raw) return;
      let target = raw;
      try {
        target = new URL(raw).toString();
      } catch (_) {
        try {
          target = new URL('https://' + raw).toString();
        } catch (err) {
          alert('Please enter a valid URL (example.com or https://example.com).');
          return;
        }
      }
      window.location.href = target;
      wrapper.remove();
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        wrapper.remove();
      }
    });

    document.addEventListener('keydown', function handleEsc(ev) {
      if (ev.key === 'Escape') {
        wrapper.remove();
        document.removeEventListener('keydown', handleEsc);
      }
    });

    closeBtn.addEventListener('click', () => {
      wrapper.remove();
    });

    form.appendChild(title);
    form.appendChild(input);
    form.appendChild(goBtn);
    form.appendChild(closeBtn);
    wrapper.appendChild(form);
    document.body.appendChild(wrapper);
    input.focus();
    input.select();
    return 'shown';
  })();`;

  webContents.executeJavaScript(script).catch(() => {});
}

function openUrlInView(accountId, targetUrl) {
  const target = getViewByAccountId(views, accountId);
  if (!target) {
    return { ok: false, status: 404, body: { status: "not_found" } };
  }

  const normalized = normalizeUserUrl(targetUrl);
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
    "top-center",
    "top-right",
    "bottom-left",
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
      <p>Eight panes in a 4x2 grid: 7 Claude sessions (mix of Code and Workspace) plus 1 dedicated ChatGPT pane for verification and cross-checks.</p>
      <div class="hint">Right-click inside any pane to open a quick URL prompt or toggle an inline URL bar on that pane.</div>
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
