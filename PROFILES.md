# THE-CLAW Profile Launcher Guide

THE-CLAW supports 8 isolated profiles (panes) for managing multiple Claude and ChatGPT instances simultaneously. This guide explains how to use the profile launcher system.

## Available Profiles

| ID | Name | Type | Email | Use Case |
|---|---|---|---|---|
| 1 | Claude Code #1 | Claude Code | hacker@leantwin.org | Primary Claude development |
| 2 | Claude Code #2 | Claude Code | hacker1@leantwin.org | Secondary Claude development |
| 3 | Claude Code #3 | Claude Code | hacker3@leantwin.org | Tertiary Claude development |
| 4 | Claude Code #4 | Claude Code | (none) | Backup Claude development |
| 5 | Claude Workspace #5 | Claude Workspace | john@leantwin.org | Workspace collaboration |
| 6 | Claude Workspace #6 | Claude Workspace | hacker4@leantwin.org | Workspace collaboration |
| 7 | Claude Workspace #7 | Claude Workspace | (none) | Workspace collaboration |
| 8 | ChatGPT #8 | ChatGPT | (none) | Verification/testing |

Each profile:
- ✅ Has isolated cookies and session data
- ✅ Auto-prefills login email when applicable
- ✅ Gets assigned a dedicated WireGuard VPN node
- ✅ Can be controlled via HTTP API at `http://127.0.0.1:7780/`

---

## Quick Start

### Launch All Profiles (Full 4x2 Grid)

**Linux/macOS:**
```bash
./run start          # Foreground with logs
./run                # Background with logging
./launch.sh          # Background (alternative)
```

**Windows:**
```cmd
run.bat start        # Foreground
run.bat              # Background
launch.bat           # Background (alternative)
```

### Interactive Profile Selector

**Linux/macOS:**
```bash
./profile-selector
./run profile         # Shortcut
```

**Windows:**
```cmd
profile-selector.bat
run.bat profile      # Shortcut
```

Displays a menu to:
- Launch individual profiles (1-8)
- Launch profile groups (All, Claude-only, ChatGPT verification)
- Open the control server
- Set timers for task completion

---

## Individual Profile Launchers

Each profile has a dedicated quick launcher:

### Linux/macOS

```bash
./claw-1   # Launch Claude Code #1
./claw-2   # Launch Claude Code #2
./claw-3   # Launch Claude Code #3
./claw-4   # Launch Claude Code #4
./claw-5   # Launch Claude Workspace #5
./claw-6   # Launch Claude Workspace #6
./claw-7   # Launch Claude Workspace #7
./claw-8   # Launch ChatGPT #8
```

### Windows

```cmd
claw-1.bat   # Launch Claude Code #1
claw-2.bat   # Launch Claude Code #2
claw-3.bat   # Launch Claude Code #3
claw-4.bat   # Launch Claude Code #4
claw-5.bat   # Launch Claude Workspace #5
claw-6.bat   # Launch Claude Workspace #6
claw-7.bat   # Launch Claude Workspace #7
claw-8.bat   # Launch ChatGPT #8
```

---

## Advanced Usage

### Universal Launcher (`./run` or `run.bat`)

**Linux/macOS:**

```bash
./run                    # Launch all in background
./run start              # Launch all in foreground
./run profile            # Open profile selector
./run profile 1          # Launch profile 1 only
./run profile 1-7        # Launch profiles 1-7
./run profile claude     # Launch Claude profiles (1-7)
```

**Windows:**

```cmd
run.bat                  # Launch all in background
run.bat start            # Launch all in foreground
run.bat profile          # Open profile selector
run.bat profile 1        # Launch profile 1
run.bat profile 1-7      # Launch profiles 1-7
```

### Control Server

Access the web-based control interface at:

```
http://127.0.0.1:7780/
```

**Features:**
- 📍 Navigate to specific profiles
- 🔗 Open URLs in individual profiles
- ⏪ Back/Forward/Reload per profile
- ⏱️ Set countdown timers (up to 6 days)
- 📲 Pushbullet notifications on timer completion

**HTTP API Endpoints:**

```
GET /                                    # Web UI
GET /open-url?account_id=<id>&target_url=<url>
GET /open-auth?account_id=<id>&auth_url=<url>
GET /open-verification?target_url=<url>
GET /navigate?account_id=<id>&action=back|forward|reload
GET /set-timer?account_id=<id>&target_time=<datetime>
GET /cancel-timer?account_id=<id>
```

---

## Environment Variables

Control THE-CLAW behavior via environment variables:

```bash
# Specify which profiles to launch (space or comma separated)
export CLAW_PROFILES="1 2 3"

# Email login helper configuration
export MAIL_POPUP_URL="https://mail.google.com/"
export EMAIL_LOGIN_SELECTORS="button[data-testid='login-with-email']"
export EMAIL_LOGIN_TEXT_MATCHES="login with email"

# Pushbullet token for timer notifications
export PUSHBULLET_TOKEN="your-token-here"

# VPN node assignment
export WIREGUARD_NODES_DIR="/path/to/wireguard/configs"

# Then launch THE-CLAW:
./run                    # Will use specified CLAW_PROFILES
```

---

## Profile Grid Layout

THE-CLAW displays profiles in a 4-column × 2-row grid:

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Profile 1   │ Profile 2   │ Profile 3   │ Profile 4   │
│ Claude #1   │ Claude #2   │ Claude #3   │ Claude #4   │
├─────────────┼─────────────┼─────────────┼─────────────┤
│ Profile 5   │ Profile 6   │ Profile 7   │ Profile 8   │
│ Workspace   │ Workspace   │ Workspace   │ ChatGPT     │
└─────────────┴─────────────┴─────────────┴─────────────┘
```

---

## Workflow Examples

### Example 1: Login to Multiple Claude Accounts

```bash
# Launch all Claude profiles
./claw-1 && ./claw-2 && ./claw-3

# Or via profile selector
./profile-selector
# Select: C (Claude only)
```

### Example 2: Quick Verification with ChatGPT

```bash
# Launch only ChatGPT verification pane
./claw-8

# Or via control server
http://127.0.0.1:7780/?open-url?account_id=8&target_url=https://chatgpt.com
```

### Example 3: Set Task Completion Timer

```bash
# Via profile selector
./profile-selector
# Select: T (Timer)
# Enter target time: 2025-11-29T18:00

# Or via control server
http://127.0.0.1:7780/?set-timer?account_id=1&target_time=2025-11-29T18:00
```

### Example 4: Launch with Custom Configuration

```bash
# Custom Pushbullet token
export PUSHBULLET_TOKEN="o.your-token-here"
export MAIL_POPUP_URL="https://mail.company.com/"

# Launch all profiles
./run
```

---

## Performance Tips

- **Multi-window mode:** Each profile uses ~200-300MB RAM
- **All 8 profiles:** ~2GB+ total RAM required
- **Single profiles:** ~300-400MB RAM each
- **Performance flags:** Automatically enabled (GPU acceleration, V8 caching)
- **Logs:** Check `/tmp/claw-*.log` (Linux/macOS) or `%TEMP%\claw-logs.txt` (Windows)

---

## Troubleshooting

### Profile doesn't start

1. Check logs:
   - **Linux/macOS:** `tail -f /tmp/claw-*.log`
   - **Windows:** `type %TEMP%\claw-logs.txt`

2. Verify dependencies:
   ```bash
   ./bootstrap.sh          # Linux/macOS
   bootstrap.bat           # Windows
   ```

3. Check if port 7780 is available:
   ```bash
   lsof -i :7780           # Linux/macOS
   netstat -ano | find ":7780"  # Windows
   ```

### Email not auto-filling

- Verify `prefillEmail` in `claude-control-browser/src/config.js`
- Check email login selector CSS via browser DevTools
- Override selectors: `export EMAIL_LOGIN_SELECTORS="your-selector"`

### VPN node assignment issues

- Ensure WireGuard config files exist in `./wireguard/`
- Check `/wireguard/node-bindings.json` for assignments
- Manually edit or delete to re-run auto-assignment

### Control server not responding

- Verify server started: check logs for "Control server listening on 7780"
- Ensure port 7780 is not blocked by firewall
- Try `curl http://127.0.0.1:7780/`

---

## Desktop Integration (Linux)

THE-CLAW desktop launcher is available at `/home/user/THE-CLAW/the-claw.desktop`

To install:
```bash
cp the-claw.desktop ~/.local/share/applications/
# Now searchable in your app launcher
```

---

## Next Steps

1. **Launch your first profile:** `./run profile` → Select Option A (All)
2. **Open the control server:** `http://127.0.0.1:7780/`
3. **Set up custom profiles:** Edit `claude-control-browser/src/config.js`
4. **Configure VPN routing:** Add WireGuard configs to `./wireguard/`
5. **Set up Pushbullet alerts:** Export your token and launch with timers

---

For more information:
- **README.md** - Project overview
- **claude-control-browser/** - Electron app source
- **Control Server** - `http://127.0.0.1:7780/`
