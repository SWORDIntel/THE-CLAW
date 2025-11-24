# Claude Control Browser

A multi-pane Electron browser application for managing multiple AI chat sessions with WireGuard VPN support.

## Features

- **8 Independent Browser Panes** in a 4x2 grid:
  - 3 Claude Code sessions
  - 2 Claude Workspace sessions
  - 2 ChatGPT sessions
  - 1 Gemini session

- **WireGuard VPN Integration**: Each browser pane can be bound to a specific UK/US WireGuard node
- **Countdown Timers**: Set per-pane timers with visual overlays and Pushbullet notifications
- **Email Login Helper**: Auto-detects email login buttons and opens a dedicated mail window
- **Session Isolation**: Each pane maintains independent cookies and sessions
- **Dark Theme**: Tempest dark theme applied across all sessions

## Installation

```bash
npm install
```

## Configuration

### WireGuard Setup

1. Create WireGuard configuration files in the `wireguard/` directory:
   - UK nodes: `uk-node-1.conf`, `uk-node-2.conf`, etc.
   - US nodes: `us-node-1.conf`, `us-node-2.conf`, etc.

2. The application will automatically bind each browser pane to a specific WireGuard node
3. Node bindings persist across sessions

### Environment Variables

Create a `.env` file or set these environment variables:

- `PUSHBULLET_TOKEN`: Your Pushbullet API token for notifications
- `MAIL_POPUP_URL`: URL for email login popup (default: https://mail.google.com/)
- `EMAIL_LOGIN_SELECTORS`: Comma-separated CSS selectors for email login buttons
- `EMAIL_LOGIN_TEXT_MATCHES`: Comma-separated text patterns for email login buttons

## Usage

Start the application:

```bash
npm start
```

The control interface will be available at http://127.0.0.1:7780

### Control Interface Features

- **Navigation**: Open URLs in specific panes
- **History Controls**: Back, forward, and reload for each pane
- **Timer Management**: Set countdown timers (up to 6 days) with notifications
- **Email Login**: Automatic email login detection

## Architecture

```
claude-control-browser/
├── src/
│   ├── main.js           # Main Electron process
│   ├── config.js         # Configuration and constants
│   ├── layout.js         # Grid layout and view management
│   └── wireguard.js      # WireGuard VPN integration
├── wireguard/            # WireGuard configuration files
│   └── .gitkeep
├── package.json
├── .gitignore
└── README.md
```

## Security Notes

- WireGuard configuration files contain sensitive information and are excluded from version control
- Each browser pane operates in an isolated Electron session partition
- Use separate accounts/sessions for each pane to maintain security boundaries

## License

Private use only
