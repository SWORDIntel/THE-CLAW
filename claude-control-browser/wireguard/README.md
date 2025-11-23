# WireGuard Configuration Directory

Place your WireGuard configuration files in this directory.

## Naming Convention

- UK nodes: `uk-node-1.conf`, `uk-node-2.conf`, `uk-node-3.conf`, etc.
- US nodes: `us-node-1.conf`, `us-node-2.conf`, `us-node-3.conf`, etc.

## Example Configuration

Create configuration files with the following structure:

```ini
[Interface]
PrivateKey = YOUR_PRIVATE_KEY_HERE
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]
PublicKey = SERVER_PUBLIC_KEY_HERE
Endpoint = server.example.com:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

## Node Binding

The application automatically assigns and persists WireGuard nodes to browser panes:
- Once a pane is assigned a node, it remains bound to that node
- Bindings are stored in `node-bindings.json`
- The app alternates between UK and US nodes when assigning

## Security Notes

⚠️ **IMPORTANT**:
- Never commit actual `.conf` files to version control
- These files contain sensitive keys and credentials
- The `.gitignore` is configured to exclude `*.conf` and `*.key` files
- Keep backups of your configurations in a secure location

## Manual Connection (requires root)

To manually connect to a WireGuard node:

```bash
sudo wg-quick up /path/to/wireguard/uk-node-1.conf
```

To disconnect:

```bash
sudo wg-quick down uk-node-1
```

## Status Check

Check active WireGuard connections:

```bash
sudo wg show
```
