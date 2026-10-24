const { app, BrowserWindow } = require("electron");
const path = require("node:path");
app.setName("Generated SDK study");
app.setPath("userData", path.join(__dirname, "generated-browser-profile"));
app.disableHardwareAcceleration();
if (process.platform === "darwin") app.dock.hide();
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  const url = process.env.MOGURI_GENERATED_SDK_URL;
  if (!url || new URL(url).hostname !== "127.0.0.1") throw new Error("Generated loopback URL is required.");
  await window.loadURL(url);
}).catch((error) => { console.error("Generated hidden-browser initialization failed:", error); app.exit(1); });
app.on("window-all-closed", () => app.quit());
