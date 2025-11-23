const { BrowserView, session } = require("electron");
const { ACCOUNTS, DEFAULT_TARGET_URL, CHROME_USER_AGENT } = require("./config");

function createAccountViews() {
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
    return { account: acc, view };
  });
}

function layoutViewsInGrid(mainWindow, views) {
  const [winWidth, winHeight] = mainWindow.getContentSize();
  const cols = 4;
  const rows = 2;

  const cellW = Math.floor(winWidth / cols);
  const cellH = Math.floor(winHeight / rows);

  views.forEach((entry, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    const x = col * cellW;
    const y = row * cellH;

    entry.view.setBounds({ x, y, width: cellW, height: cellH });
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
