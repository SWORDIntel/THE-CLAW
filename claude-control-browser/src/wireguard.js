const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

// Path to WireGuard configurations
const WIREGUARD_DIR = path.join(__dirname, "..", "wireguard");
const BINDINGS_FILE = path.join(WIREGUARD_DIR, "node-bindings.json");

/**
 * Get available WireGuard configuration files
 * @returns {Array<{name: string, path: string, region: string}>}
 */
function getAvailableNodes() {
  if (!fs.existsSync(WIREGUARD_DIR)) {
    console.warn("WireGuard directory not found:", WIREGUARD_DIR);
    return [];
  }

  try {
    const files = fs.readdirSync(WIREGUARD_DIR);
    const confFiles = files.filter((f) => f.endsWith(".conf"));

    return confFiles.map((filename) => {
      const name = filename.replace(".conf", "");
      const region = name.toLowerCase().startsWith("uk") ? "UK" :
                     name.toLowerCase().startsWith("us") ? "US" : "OTHER";
      return {
        name,
        path: path.join(WIREGUARD_DIR, filename),
        region
      };
    });
  } catch (err) {
    console.error("Error reading WireGuard directory:", err);
    return [];
  }
}

/**
 * Load existing node bindings from disk
 * @returns {Object} Map of accountId -> nodeName
 */
function loadBindings() {
  if (!fs.existsSync(BINDINGS_FILE)) {
    return {};
  }

  try {
    const content = fs.readFileSync(BINDINGS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("Error loading node bindings:", err);
    return {};
  }
}

/**
 * Save node bindings to disk
 * @param {Object} bindings - Map of accountId -> nodeName
 */
function saveBindings(bindings) {
  try {
    if (!fs.existsSync(WIREGUARD_DIR)) {
      fs.mkdirSync(WIREGUARD_DIR, { recursive: true });
    }
    fs.writeFileSync(BINDINGS_FILE, JSON.stringify(bindings, null, 2));
  } catch (err) {
    console.error("Error saving node bindings:", err);
  }
}

/**
 * Assign WireGuard nodes to accounts
 * @param {Array} accounts - Array of account objects
 * @returns {Object} Map of accountId -> {nodeName, nodeConfig, region}
 */
function assignNodesToAccounts(accounts) {
  const availableNodes = getAvailableNodes();

  if (availableNodes.length === 0) {
    console.warn("No WireGuard nodes found. VPN features disabled.");
    return {};
  }

  // Load existing bindings
  const bindings = loadBindings();
  const assignments = {};
  const usedNodes = new Set(Object.values(bindings));

  // Separate UK and US nodes
  const ukNodes = availableNodes.filter((n) => n.region === "UK");
  const usNodes = availableNodes.filter((n) => n.region === "US");

  // Pool of available nodes
  let nodePool = [...ukNodes, ...usNodes];

  accounts.forEach((account) => {
    const accountId = account.id;

    // Check if already bound
    if (bindings[accountId]) {
      const boundNode = availableNodes.find((n) => n.name === bindings[accountId]);
      if (boundNode) {
        assignments[accountId] = {
          nodeName: boundNode.name,
          nodeConfig: boundNode.path,
          region: boundNode.region
        };
        console.log(`Account ${accountId} (${account.name}) bound to existing node: ${boundNode.name} (${boundNode.region})`);
        return;
      }
    }

    // Assign a new node (prefer alternating UK/US)
    const preferRegion = accountId % 2 === 0 ? "US" : "UK";
    const preferredPool = preferRegion === "UK" ? ukNodes : usNodes;
    const fallbackPool = preferRegion === "UK" ? usNodes : ukNodes;

    let availableInPreferred = preferredPool.filter((n) => !usedNodes.has(n.name));
    if (availableInPreferred.length === 0) {
      availableInPreferred = fallbackPool.filter((n) => !usedNodes.has(n.name));
    }

    // If all nodes are used, reuse from the beginning
    if (availableInPreferred.length === 0) {
      availableInPreferred = nodePool;
    }

    const selectedNode = availableInPreferred[0];
    if (selectedNode) {
      assignments[accountId] = {
        nodeName: selectedNode.name,
        nodeConfig: selectedNode.path,
        region: selectedNode.region
      };
      bindings[accountId] = selectedNode.name;
      usedNodes.add(selectedNode.name);
      console.log(`Account ${accountId} (${account.name}) assigned new node: ${selectedNode.name} (${selectedNode.region})`);
    }
  });

  // Save updated bindings
  saveBindings(bindings);

  return assignments;
}

/**
 * Connect to a WireGuard node
 * @param {string} configPath - Path to WireGuard config file
 * @param {string} interfaceName - Name for the WireGuard interface (e.g., wg0)
 * @returns {Promise<{success: boolean, interface: string, message: string}>}
 */
async function connectToNode(configPath, interfaceName = "wg0") {
  try {
    // Check if WireGuard is installed
    try {
      execSync("which wg", { stdio: "ignore" });
    } catch (err) {
      console.warn("WireGuard (wg) not found. VPN features disabled.");
      return { success: false, interface: null, message: "WireGuard not installed" };
    }

    // Check if already connected
    try {
      execSync(`ip link show ${interfaceName}`, { stdio: "ignore" });
      console.log(`Interface ${interfaceName} already exists`);
      return { success: true, interface: interfaceName, message: "Already connected" };
    } catch (_) {
      // Interface doesn't exist, proceed to create it
    }

    // Note: Actual WireGuard connection requires root privileges
    // In production, this should be handled by a privileged helper process
    // For now, we'll just validate the config and log the connection intent

    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    console.log(`[WireGuard] Would connect to ${interfaceName} using ${configPath}`);
    console.log(`[WireGuard] Note: Actual connection requires root privileges`);
    console.log(`[WireGuard] To connect manually: sudo wg-quick up ${configPath}`);

    return {
      success: true,
      interface: interfaceName,
      message: "Config validated (manual connection required)"
    };

  } catch (err) {
    console.error("Error connecting to WireGuard node:", err);
    return { success: false, interface: null, message: err.message };
  }
}

/**
 * Disconnect from a WireGuard node
 * @param {string} interfaceName - Name of the WireGuard interface to disconnect
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function disconnectFromNode(interfaceName = "wg0") {
  try {
    console.log(`[WireGuard] Would disconnect from ${interfaceName}`);
    console.log(`[WireGuard] To disconnect manually: sudo wg-quick down ${interfaceName}`);
    return { success: true, message: "Disconnect command logged" };
  } catch (err) {
    console.error("Error disconnecting from WireGuard node:", err);
    return { success: false, message: err.message };
  }
}

module.exports = {
  getAvailableNodes,
  assignNodesToAccounts,
  connectToNode,
  disconnectFromNode,
  loadBindings,
  saveBindings
};
