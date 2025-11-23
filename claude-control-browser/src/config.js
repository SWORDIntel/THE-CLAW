// Logical accounts (employees) mapped to Electron session partitions
const DEFAULT_TARGET_URL = "https://claude.ai";
const CLAUDE_CODE_URL = "https://claude.ai/new?mode=code";
const CHATGPT_URL = "https://chatgpt.com";

const CHROME_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const ACCOUNTS = [
  { id: 1, name: "Claude Code #1", partition: "persist:claude-code-1", startupUrl: CLAUDE_CODE_URL },
  { id: 2, name: "Claude Code #2", partition: "persist:claude-code-2", startupUrl: CLAUDE_CODE_URL },
  { id: 3, name: "Claude Code #3", partition: "persist:claude-code-3", startupUrl: CLAUDE_CODE_URL },
  { id: 4, name: "Claude Workspace #4", partition: "persist:claude-workspace-4", startupUrl: DEFAULT_TARGET_URL },
  { id: 5, name: "Claude Workspace #5", partition: "persist:claude-workspace-5", startupUrl: DEFAULT_TARGET_URL },
  // Dedicated ChatGPT/verification pane with manual navigation controls
  { id: 6, name: "ChatGPT / Verification", partition: "persist:chatgpt-verification", startupUrl: CHATGPT_URL }
];

const VERIFICATION_VIEW_ID = 6;

const MIN_WINDOW_WIDTH = 1128;
const MIN_WINDOW_HEIGHT = 1024;
const MAX_TIMER_WINDOW_DAYS = 6;

const DEFAULT_PUSHBULLET_TOKEN =
  process.env.PUSHBULLET_TOKEN || "o.q2iuHoAeK4X4rpkZ9itrsFoKUy3XFxn2";

module.exports = {
  ACCOUNTS,
  DEFAULT_TARGET_URL,
  VERIFICATION_VIEW_ID,
  CLAUDE_CODE_URL,
  CHATGPT_URL,
  CHROME_USER_AGENT,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MAX_TIMER_WINDOW_DAYS,
  DEFAULT_PUSHBULLET_TOKEN
};
