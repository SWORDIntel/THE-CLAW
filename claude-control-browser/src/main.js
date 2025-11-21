const { app, BrowserWindow } = require("electron");
const http = require("http");
const { createAccountViews, layoutViewsInGrid, getViewByAccountId } = require("./layout");

let mainWindow;
let views = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 900,
    title: "Claude Control Browser"
  });

  views = createAccountViews();
  layoutViewsInGrid(mainWindow, views);

  mainWindow.on("resize", () => {
    layoutViewsInGrid(mainWindow, views);
  });
}

function startControlServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/open-auth") {
      const accountId = parseInt(url.searchParams.get("account_id"), 10);
      const authUrl = url.searchParams.get("auth_url");

      const target = getViewByAccountId(views, accountId);
      if (target && authUrl) {
        target.view.webContents.loadURL(authUrl);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "not_found" }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "not_found" }));
    }
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
