// Logical accounts (employees) mapped to Electron session partitions
const DEFAULT_TARGET_URL = "https://claude.ai";
const CLAUDE_CODE_URL = "https://claude.ai/new?mode=code";
const CHATGPT_URL = "https://chatgpt.com";
const GEMINI_URL = "https://gemini.google.com";
const MAIL_POPUP_URL = process.env.MAIL_POPUP_URL || "https://mail.google.com/";
const MAIL_POPUP_PARTITION = "persist:mail-login";

const CHROME_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const ACCOUNTS = [
  { id: 1, name: "Claude Code #1", partition: "persist:claude-code-1", startupUrl: CLAUDE_CODE_URL },
  { id: 2, name: "Claude Code #2", partition: "persist:claude-code-2", startupUrl: CLAUDE_CODE_URL },
  { id: 3, name: "Claude Code #3", partition: "persist:claude-code-3", startupUrl: CLAUDE_CODE_URL },
  { id: 4, name: "Claude Code #4", partition: "persist:claude-code-4", startupUrl: CLAUDE_CODE_URL },
  { id: 5, name: "Claude Workspace #5", partition: "persist:claude-workspace-5", startupUrl: DEFAULT_TARGET_URL },
  { id: 6, name: "Claude Workspace #6", partition: "persist:claude-workspace-6", startupUrl: DEFAULT_TARGET_URL },
  { id: 7, name: "Claude Workspace #7", partition: "persist:claude-workspace-7", startupUrl: DEFAULT_TARGET_URL },
  { id: 8, name: "ChatGPT #8", partition: "persist:chatgpt-8", startupUrl: CHATGPT_URL }
];

const VERIFICATION_VIEW_ID = 8;

const MIN_WINDOW_WIDTH = 1128;
const MIN_WINDOW_HEIGHT = 1024;
const MAX_TIMER_WINDOW_DAYS = 6;

const DEFAULT_PUSHBULLET_TOKEN =
  process.env.PUSHBULLET_TOKEN || "o.q2iuHoAeK4X4rpkZ9itrsFoKUy3XFxn2";

const EMAIL_LOGIN_SELECTORS = (process.env.EMAIL_LOGIN_SELECTORS
  ? process.env.EMAIL_LOGIN_SELECTORS.split(",").map((s) => s.trim()).filter(Boolean)
  : [
      "button[data-testid='login-with-email']",
      "button[data-qa='email-login']",
      "button[name='email']",
      "button.email-login",
      "a[href*='email']",
      "button[href*='email']"
    ]);

const EMAIL_LOGIN_TEXT_MATCHES = (process.env.EMAIL_LOGIN_TEXT_MATCHES
  ? process.env.EMAIL_LOGIN_TEXT_MATCHES.split(",").map((s) => s.trim()).filter(Boolean)
  : [
      "login with email",
      "log in with email",
      "sign in with email",
      "continue with email",
      "email login",
      "login via email"
    ]);

const TEMPEST_DARK_THEME_CSS = `
  :root {
    color-scheme: dark;
  }
  html, body {
    background: #05060a !important;
    color: #e6eef6 !important;
  }
  body, input, button, select, textarea {
    font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif !important;
    background-color: #0a0c12 !important;
    color: #e6eef6 !important;
  }
  input, button, select, textarea {
    border: 1px solid #1e2a3a !important;
    border-radius: 8px !important;
    box-shadow: none !important;
  }
  button, input[type='submit'], input[type='button'] {
    background: linear-gradient(135deg, #111827, #0b1220) !important;
    color: #d8e5ff !important;
  }
  a, a:visited {
    color: #6bc1ff !important;
  }
  ::selection {
    background: #1b3558;
    color: #eaf4ff;
  }
  [role='dialog'], .modal, .popup, .popover, dialog {
    background: #0c1018 !important;
    color: #e6eef6 !important;
  }
  table, th, td {
    background: transparent !important;
    color: #d9e4f5 !important;
  }
  input:focus, select:focus, textarea:focus, button:focus {
    outline: 2px solid #4fa3ff !important;
    outline-offset: 2px !important;
  }
`;

module.exports = {
  ACCOUNTS,
  DEFAULT_TARGET_URL,
  VERIFICATION_VIEW_ID,
  CLAUDE_CODE_URL,
  CHATGPT_URL,
  GEMINI_URL,
  CHROME_USER_AGENT,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MAX_TIMER_WINDOW_DAYS,
  DEFAULT_PUSHBULLET_TOKEN,
  TEMPEST_DARK_THEME_CSS,
  MAIL_POPUP_URL,
  MAIL_POPUP_PARTITION,
  EMAIL_LOGIN_SELECTORS,
  EMAIL_LOGIN_TEXT_MATCHES
};
