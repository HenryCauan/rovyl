const os = require("os");

const isDev = process.env.NODE_ENV === "development";
const logDir = isDev
  ? path.join(__dirname, "..")
  : path.join(os.tmpdir(), "zenith-radial-menu-cache");
const logFile = path.join(logDir, "diagnostic.log");

const diagLog = (msg) => {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
  } catch (e) {
    console.error("Failed to write to diagnostic log:", e);
  }
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
