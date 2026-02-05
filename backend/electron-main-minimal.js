const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const logFile = path.join(__dirname, "../diagnostic.log");
const diagLog = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(logFile, line);
};

diagLog("Zenith Main Process Started - MINIMAL TEST");

app.whenReady().then(() => {
  diagLog("App is ready!");

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL("http://localhost:5173");
  diagLog("Window created and loading URL");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
