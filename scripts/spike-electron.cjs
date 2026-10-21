const { app, BrowserWindow } = require("electron");
const { performance } = require("node:perf_hooks");

const started = performance.now();
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 840,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  await window.loadURL(
    `data:text/html,${encodeURIComponent(
      "<!doctype html><title>Moguri spike</title><main>" +
        Array.from({ length: 10_000 }, (_, i) => `<p>Generated timeline event ${i}</p>`).join("") +
        "</main>",
    )}`,
  );
  const coldStartMs = performance.now() - started;
  const scrollMs = await window.webContents.executeJavaScript(`(async () => {
    const started = performance.now();
    for (let i = 0; i < 30; i++) {
      scrollTo(0, i * 300);
      await new Promise(requestAnimationFrame);
    }
    return (performance.now() - started) / 30;
  })()`);
  const memoryMiB = app.getAppMetrics().reduce((sum, metric) => sum + metric.memory.workingSetSize, 0) / 1024;
  console.log(JSON.stringify({ coldStartMs, memoryMiB, scrollFrameMs: scrollMs, timelineRows: 10_000 }));
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
