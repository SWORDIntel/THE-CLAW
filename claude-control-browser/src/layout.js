const { BrowserView, session } = require("electron");
const { ACCOUNTS, DEFAULT_TARGET_URL, CHROME_USER_AGENT } = require("./config");
const { assignNodesToAccounts, connectToNode } = require("./wireguard");

function createAccountViews() {
  // Assign WireGuard nodes to accounts
  const vpnAssignments = assignNodesToAccounts(ACCOUNTS);

  return ACCOUNTS.map((acc) => {
    const accSession = session.fromPartition(acc.partition);
    const view = new BrowserView({
      webPreferences: {
        session: accSession
      }
    });

    if (CHROME_USER_AGENT) {
      view.webContents.setUserAgent(CHROME_USER_AGENT);
    }

    const startUrl = acc.startupUrl || DEFAULT_TARGET_URL || "about:blank";
    view.webContents.loadURL(startUrl);

    // Store email prefill configuration
    view.webContents.prefillEmail = acc.prefillEmail || "";

    // Store VPN assignment info
    const vpnInfo = vpnAssignments[acc.id];
    if (vpnInfo) {
      console.log(`[VPN] Account ${acc.id} (${acc.name}) -> ${vpnInfo.nodeName} (${vpnInfo.region})`);
      // Note: Actual VPN connection would happen here in production
      // connectToNode(vpnInfo.nodeConfig, `wg${acc.id}`).then(result => {
      //   console.log(`[VPN] Connection result:`, result);
      // });
    }

    return { account: acc, view, vpnInfo };
  });
}

function layoutViewsInGrid(mainWindow, views) {
  const [winWidth, winHeight] = mainWindow.getContentSize();

  // 5 panels: 3 on top row, 2 on bottom row
  const topRowCount = 3;
  const bottomRowCount = 2;
  const rowHeight = Math.floor(winHeight / 2);

  views.forEach((entry, index) => {
    let x, y, width, height;

    if (index < topRowCount) {
      // Top row: 3 panels
      const cellWidth = Math.floor(winWidth / topRowCount);
      x = index * cellWidth;
      y = 0;
      width = cellWidth;
      height = rowHeight;
    } else {
      // Bottom row: 2 panels
      const cellWidth = Math.floor(winWidth / bottomRowCount);
      const bottomIndex = index - topRowCount;
      x = bottomIndex * cellWidth;
      y = rowHeight;
      width = cellWidth;
      height = rowHeight;
    }

    entry.view.setBounds({ x, y, width, height });
    entry.view.setAutoResize({ width: true, height: true });
    mainWindow.addBrowserView(entry.view);
  });
}

function getViewByAccountId(views, accountId) {
  return views.find((entry) => entry.account.id === accountId);
}

module.exports = {
  createAccountViews,
  layoutViewsInGrid,
  getViewByAccountId
};
