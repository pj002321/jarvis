const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const PORT = 3000;
const ROOT = path.join(__dirname, "..");
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

let serverProcess;

function waitForServer(url, cb) {
  http.get(url, () => cb()).on("error", () => setTimeout(() => waitForServer(url, cb), 300));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "J.A.R.V.I.S",
    autoHideMenuBar: true,
    backgroundColor: "#000000",
  });
  win.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(() => {
  serverProcess = spawn(NEXT_BIN, [app.isPackaged ? "start" : "dev"], { cwd: ROOT, stdio: "ignore" });
  waitForServer(`http://localhost:${PORT}`, createWindow);
});

app.on("window-all-closed", () => {
  serverProcess?.kill();
  app.quit();
});

app.on("before-quit", () => {
  serverProcess?.kill();
});
