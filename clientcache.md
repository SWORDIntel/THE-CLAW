Nice, this is an easy win and keeps the office layout clean.

Below is a **drop-in replacement** for the relevant bits of the helper lib to get **per-account cache separation** using a namespace (e.g. per employee / per CLI / per machine).

---

## 1. Updated `ClientConfig` (drop-in)

Replace your existing `ClientConfig` and `from_env_defaults()` with this:

```rust
#[derive(Debug, Clone)]
pub struct ClientConfig {
    /// Base URL of the auth router (default: "http://127.0.0.1:7777").
    pub router_base_url: String,
    /// Logical name of this client (e.g., "dsmil-cli").
    pub client_name: String,
    /// Hostname of the machine (for audit).
    pub hostname: String,
    /// Optional explicit cache path (overrides everything else).
    pub cache_path: Option<PathBuf>,
    /// Optional "account namespace" to separate tokens:
    /// e.g. "employee-1", "alice", "qa-runner".
    /// If None, falls back to CLIENT_NAME, then HOSTNAME.
    pub account_namespace: Option<String>,
    /// Poll interval when waiting for approval.
    pub poll_interval: StdDuration,
    /// Max time to wait for approval before failing.
    pub max_wait: StdDuration,
}

impl ClientConfig {
    pub fn from_env_defaults() -> Result<Self, AuthClientError> {
        let router = std::env::var("CLAUDE_ROUTER_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:7777".to_string());

        let client_name = std::env::var("CLAUDE_CLIENT_NAME")
            .unwrap_or_else(|_| "default-cli".to_string());

        let hostname = std::env::var("HOSTNAME")
            .or_else(|_| std::env::var("COMPUTERNAME"))
            .unwrap_or_else(|_| "unknown-host".to_string());

        // Optional namespace to split caches:
        //  - CLAUDE_ACCOUNT_NAMESPACE (preferred)
        //  - CLAUDE_PROFILE
        //  - fallback: None (we'll infer later)
        let account_namespace = std::env::var("CLAUDE_ACCOUNT_NAMESPACE")
            .ok()
            .or_else(|| std::env::var("CLAUDE_PROFILE").ok());

        Ok(Self {
            router_base_url: router,
            client_name,
            hostname,
            cache_path: None,
            account_namespace,
            poll_interval: StdDuration::from_secs(2),
            max_wait: StdDuration::from_secs(300), // 5 minutes
        })
    }
}
```

---

## 2. Updated `cache_path()` + helper (drop-in)

Replace your existing `cache_path` function with this version and add the helper below it.

```rust
fn cache_path(cfg: &ClientConfig) -> Result<Option<PathBuf>, AuthClientError> {
    if let Some(p) = &cfg.cache_path {
        return Ok(Some(p.clone()));
    }

    let Some(proj) = ProjectDirs::from("com", "ExampleOrg", "ClaudeAuthClient") else {
        // No standard dirs → just don't cache.
        return Ok(None);
    };

    let base_dir = proj.config_dir();

    // Decide namespace:
    //  1) explicit account_namespace
    //  2) CLIENT_NAME
    //  3) HOSTNAME
    let ns = if let Some(ns) = &cfg.account_namespace {
        ns.clone()
    } else {
        // fall back to client_name + hostname so different machines/CLIs separate
        format!("{}-{}", cfg.client_name, cfg.hostname)
    };

    let safe_ns = sanitize_component(&ns);

    // Final layout:
    //   ~/.config/ClaudeAuthClient/<safe_ns>/token_cache.json
    let dir = base_dir.join(safe_ns);
    fs::create_dir_all(&dir)
        .map_err(|e| AuthClientError::Cache(format!("create cache dir: {e}")))?;

    let path = dir.join("token_cache.json");
    Ok(Some(path))
}

/// Make a string safe for use as a single path component.
fn sanitize_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "_".to_string()
    } else {
        out
    }
}
```

---

## 3. How to use per-account separation in practice

For each *employee / account / role* you want a separate cache, just set an env var before running the CLI:

```bash
# Account 1
CLAUDE_ACCOUNT_NAMESPACE=employee-1 CLAUDE_CLIENT_NAME=dsmil-cli ./dsmil

# Account 2
CLAUDE_ACCOUNT_NAMESPACE=employee-2 CLAUDE_CLIENT_NAME=dsmil-cli ./dsmil

# Manager QA profile
CLAUDE_ACCOUNT_NAMESPACE=qa-profile CLAUDE_CLIENT_NAME=dsmil-cli ./dsmil
```

Resulting cache locations (example on Linux):

* `~/.config/ClaudeAuthClient/employee-1/token_cache.json`
* `~/.config/ClaudeAuthClient/employee-2/token_cache.json`
* `~/.config/ClaudeAuthClient/qa-profile/token_cache.json`

No collisions, no accidental token reuse across identities, and you can still override entirely with `cfg.cache_path` if you want a fixed path for a given binary.
