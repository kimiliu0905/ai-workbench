const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } = require("electron");

const { toSqliteFileUrl } = require("../scripts/runtime-paths.cjs");
const { createAgentBroker } = require("./agent-broker.cjs");
const { backupDesktopData } = require("./backup.cjs");
const { readLocation, chooseDestination, migrateData, cleanupPrevious } = require("./data-location.cjs");
const { PRODUCT_NAME, USER_DATA_DIR_NAME, DESKTOP_BIND_HOST, DEFAULT_LOCK_BASE_URL } = require("./product.cjs");

app.setName(PRODUCT_NAME);
const defaultDataDir = process.env.APP_USER_DATA_DIR || path.join(app.getPath("appData"), USER_DATA_DIR_NAME);
app.setPath("userData", defaultDataDir);

const windowToken = crypto.randomBytes(32).toString("hex");

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let serverUrl = null;
let isQuitting = false;
let agentBroker = null;
let backupTimer;
let activeBackup;
let dataMoving = false;
const ownsInstance = app.requestSingleInstanceLock();

if (ownsInstance) {
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
} else {
  app.quit();
}

function getWindowIcon() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(__dirname, "../public/brand-icon.ico");
}

function getStandaloneRoot() {
  return path.resolve(__dirname, "..", ".next-desktop", "standalone");
}

function getServerEntry() {
  return path.join(getStandaloneRoot(), "server.js");
}

function getMigrationScript() {
  return path.join(getStandaloneRoot(), "scripts", "apply-prisma-migrations.cjs");
}

function getDesktopDefaultsScript() {
  return path.join(getStandaloneRoot(), "scripts", "ensure-desktop-defaults.cjs");
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureDesktopRuntimeConfig(userDataDir) {
  const prismaDir = path.join(userDataDir, "prisma");
  const storageDir = path.join(userDataDir, "storage");
  const configPath = path.join(userDataDir, "config", "runtime.json");

  await Promise.all([ensureDir(userDataDir), ensureDir(prismaDir), ensureDir(storageDir)]);

  const currentConfig = (await readJson(configPath)) ?? {};
  const appSecret =
    typeof currentConfig.appSecret === "string" && currentConfig.appSecret.length >= 12
      ? currentConfig.appSecret
      : crypto.randomBytes(32).toString("hex");

  const nextConfig = {
    appSecret,
    updatedAt: new Date().toISOString(),
  };

  await writeJson(configPath, nextConfig);
  const secretsPath = path.join(userDataDir, "config", "secrets.json");
  const secrets = (await readJson(secretsPath)) ?? {};
  const nextSecrets = {
    passwordHash: typeof secrets.passwordHash === "string" ? secrets.passwordHash : "",
    passwordVersion: Number.isInteger(secrets.passwordVersion) ? secrets.passwordVersion : 0,
    openaiApiKeyEncrypted: typeof secrets.openaiApiKeyEncrypted === "string" ? secrets.openaiApiKeyEncrypted : undefined,
    openaiApiKey: typeof secrets.openaiApiKey === "string" ? secrets.openaiApiKey : "",
    lockBaseUrl: typeof secrets.lockBaseUrl === "string" && secrets.lockBaseUrl ? secrets.lockBaseUrl : DEFAULT_LOCK_BASE_URL,
  };
  await writeJson(secretsPath, nextSecrets);
  try { await fsp.chmod(secretsPath, 0o600); } catch { /* Windows may ignore the mode. */ }

  return {
    userDataDir,
    prismaDir,
    storageDir,
    databasePath: path.join(prismaDir, "dev.db"),
    appSecret,
    secretsPath,
    secrets: nextSecrets,
  };
}

function getRuntimeEnv(runtime, port) {
  return {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: DESKTOP_BIND_HOST,
    APP_RUNTIME: "desktop",
    APP_USER_DATA_DIR: runtime.userDataDir,
    APP_DESKTOP_BACKUP_DIR: path.join(runtime.userDataDir, "desktop-backups"),
    DATABASE_URL: toSqliteFileUrl(runtime.databasePath),
    STORAGE_ROOT: runtime.storageDir,
    APP_SECRET: runtime.appSecret,
    NEXT_PUBLIC_APP_NAME: PRODUCT_NAME,
    WORKBENCH_SECRETS_PATH: runtime.secretsPath,
    WORKBENCH_WINDOW_TOKEN: windowToken,
    WORKBENCH_PASSWORD_HASH: runtime.secrets.passwordHash,
    WORKBENCH_PASSWORD_VERSION: String(runtime.secrets.passwordVersion),
    OPENAI_API_KEY: runtime.secrets.openaiApiKey || process.env.OPENAI_API_KEY || "",
    LOCK_BASE_URL: runtime.secrets.lockBaseUrl || DEFAULT_LOCK_BASE_URL,
  };
}

function spawnNodeScript(scriptPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: getStandaloneRoot(),
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `Script failed with exit code ${code}`));
      }
    });
  });
}

function findAvailablePort(preferredPort = 3000, maxAttempts = 20) {
  const tryPort = (port, remaining) =>
    new Promise((resolve, reject) => {
      const tester = net.createServer();

      tester.once("error", (error) => {
        tester.close();
        if (remaining <= 0) {
          reject(error);
          return;
        }
        resolve(tryPort(port + 1, remaining - 1));
      });

      tester.once("listening", () => {
        const address = tester.address();
        tester.close(() => {
          if (typeof address === "object" && address && typeof address.port === "number") {
            resolve(address.port);
            return;
          }
          resolve(port);
        });
      });

      tester.listen(port, DESKTOP_BIND_HOST);
    });

  return tryPort(preferredPort, maxAttempts);
}

function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, { headers: { "X-Workbench-Window": windowToken } }, (response) => {
        response.resume();

        if ([200, 307, 308].includes(response.statusCode)) {
          resolve(true);
          return;
        }

        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Server health check failed with status ${response.statusCode}`));
          return;
        }

        setTimeout(attempt, 500);
      });

      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error("Timed out waiting for local desktop server to start."));
          return;
        }

        setTimeout(attempt, 500);
      });
    };

    attempt();
  });
}

async function startNextServer(runtime) {
  const serverEntry = getServerEntry();
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Missing Next standalone server entry: ${serverEntry}`);
  }

  const port = await findAvailablePort(3000);
  const env = getRuntimeEnv(runtime, port);

  delete env.ELECTRON_RUN_AS_NODE;
  const child = utilityProcess.fork(path.join(__dirname, "server-entry.cjs"), [serverEntry], {
    cwd: getStandaloneRoot(),
    env: { ...env, WORKBENCH_DESKTOP_BROKER: "1" },
    stdio: "pipe",
    serviceName: "YezijianWorkbench",
  });
  serverProcess = child;
  agentBroker.attach({
    on: (event, listener) => child.on(event, listener),
    get connected() { return child.pid !== undefined; },
    send: message => child.postMessage(message),
  });

  let serverErrors = "";

  child.stdout.resume();
  child.stderr.on("data", (chunk) => {
    serverErrors = (serverErrors + chunk.toString()).slice(-12_000);
  });

  child.on("exit", (code) => {
    if (serverProcess === child) serverProcess = null;
    if (!isQuitting && !dataMoving && code !== 0) {
      dialog.showErrorBox(
        `${PRODUCT_NAME} 启动失败`,
        serverErrors || `内置服务异常退出，退出码：${code}`
      );
      app.quit();
    }
  });

  serverUrl = `http://${DESKTOP_BIND_HOST}:${port}`;
  await waitForServer(serverUrl);
  return serverUrl;
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 280,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    frame: false,
    show: false,
    center: true,
    backgroundColor: "#111827",
    title: PRODUCT_NAME,
    icon: getWindowIcon(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const splashHtml = `
    <!DOCTYPE html>
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'self' 'unsafe-inline' data:;"
        />
        <title>${PRODUCT_NAME}</title>
        <style>
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            font-family: "Segoe UI", Arial, sans-serif;
            background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
            color: #ffffff;
          }
          .wrap {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
          }
          .card {
            width: 100%;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.08);
            padding: 28px 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.32);
          }
          .title {
            font-size: 22px;
            font-weight: 700;
            letter-spacing: 0.2px;
            margin-bottom: 8px;
          }
          .desc {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.72);
            line-height: 1.7;
            margin-bottom: 18px;
          }
          .status {
            font-size: 13px;
            color: #93c5fd;
            margin-bottom: 14px;
            min-height: 20px;
          }
          .bar {
            width: 100%;
            height: 8px;
            border-radius: 999px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.08);
          }
          .bar > div {
            width: 42%;
            height: 100%;
            border-radius: 999px;
            background: linear-gradient(90deg, #60a5fa, #34d399);
            animation: loading 1.2s ease-in-out infinite;
          }
          .foot {
            margin-top: 14px;
            font-size: 12px;
            color: rgba(255, 255, 255, 0.48);
          }
          @keyframes loading {
            0% { transform: translateX(-110%); }
            100% { transform: translateX(260%); }
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="card">
            <div class="title">${PRODUCT_NAME}</div>
            <div class="desc">装在这台电脑上的电商图文工作台</div>
            <div class="status" id="status">正在启动应用...</div>
            <div class="bar"><div></div></div>
            <div class="foot">请稍候，正在初始化本地服务与数据环境</div>
          </div>
        </div>
      </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);

  splashWindow.once("ready-to-show", () => {
    splashWindow?.show();
  });

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function updateSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) {
    return;
  }

  const safeText = JSON.stringify(text);
  splashWindow.webContents
    .executeJavaScript(
      `(() => {
        const el = document.getElementById("status");
        if (el) el.textContent = ${safeText};
      })();`,
      true
    )
    .catch(() => {});
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 980,
    minWidth: 840,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f5f5f5",
    title: PRODUCT_NAME,
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const windowId = mainWindow.webContents.id;
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders({ urls: [`${url}/*`] }, (details, callback) => {
    if (details.webContentsId === windowId) details.requestHeaders["X-Workbench-Window"] = windowToken;
    callback({ requestHeaders: details.requestHeaders });
  });

  mainWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin !== new URL(url).origin) event.preventDefault();
  });

  return mainWindow.loadURL(url);
}

async function shutdownServerProcess() {
  const child = serverProcess;
  if (!child) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.removeListener("exit", exited);
      reject(new Error("本地服务未能关闭，请先退出应用再试。"));
    }, 10000);
    function exited() {
      clearTimeout(timer);
      resolve();
    }
    child.once("exit", exited);
    child.kill();
  });
}

function registerDataLocation(location) {
  function assertTrusted(event) {
    if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error("请从工作台设置中操作。");
    }
    const url = new URL(event.senderFrame.url);
    if (url.origin !== serverUrl || !["/settings", "/settings/data"].includes(url.pathname)) {
      throw new Error("请从工作台设置中操作。");
    }
  }
  ipcMain.handle("yezijian-data:location", event => {
    assertTrusted(event);
    return location.directory;
  });
  ipcMain.handle("yezijian-data:move", async event => {
    assertTrusted(event);
    if (dataMoving) return;
    dataMoving = true;
    let stopped = false;
    try {
      const selection = await dialog.showOpenDialog(mainWindow, {
        title: "选择工作台数据的新位置",
        properties: ["openDirectory", "createDirectory"],
      });
      if (selection.canceled) return;
      const destination = await chooseDestination(location.directory, selection.filePaths[0], [
        path.dirname(process.execPath), process.resourcesPath, defaultDataDir,
      ]);
      const decision = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "更改数据位置",
        message: "将聊天、图片、设置和备份迁到所选位置？",
        detail: `${destination}\n请等当前聊天和做图结束。迁移后会重启工作台，并在新位置成功打开后清理迁走的旧文件。`,
        buttons: ["取消", "迁移并重启"],
        cancelId: 0,
        defaultId: 0,
      });
      if (decision.response !== 1) return;
      clearInterval(backupTimer);
      await activeBackup;
      await shutdownServerProcess();
      stopped = true;
      await migrateData(defaultDataDir, location.directory, destination);
      app.relaunch();
      app.quit();
    } catch (error) {
      const message = error.code === "ENOSPC" ? "所选磁盘的可用空间不足。" : error.message;
      if (!stopped) throw new Error(message);
      await dialog.showMessageBox(mainWindow, {
        type: "error", message: "迁移未完成，原数据仍然保留。", detail: message, buttons: ["重新打开工作台"],
      });
      app.relaunch();
      app.quit();
    } finally {
      if (!stopped) dataMoving = false;
    }
  });
}

async function bootstrapDesktopApp() {
  console.time("desktop:total");
  agentBroker = createAgentBroker({ getWindow: () => mainWindow, getServerUrl: () => serverUrl });

  createSplashWindow();
  updateSplashStatus("正在准备本地运行环境...");
  console.time("desktop:runtime");
  const location = await readLocation(defaultDataDir);
  const runtime = await ensureDesktopRuntimeConfig(location.directory);
  registerDataLocation(location);
  console.timeEnd("desktop:runtime");

  updateSplashStatus("正在初始化数据库...");
  console.time("desktop:migration");
  await spawnNodeScript(getMigrationScript(), getRuntimeEnv(runtime, 3000));
  await spawnNodeScript(getDesktopDefaultsScript(), getRuntimeEnv(runtime, 3000));
  console.timeEnd("desktop:migration");

  updateSplashStatus("正在启动本地服务...");
  console.time("desktop:server");
  const url = await startNextServer(runtime);
  console.timeEnd("desktop:server");

  updateSplashStatus("正在加载界面...");
  console.time("desktop:window");
  try { await cleanupPrevious(defaultDataDir, location); }
  catch { console.warn("Previous workbench data could not be cleaned up."); }
  await createMainWindow(url);
  const backupRoot = path.join(runtime.userDataDir, "desktop-backups");
  function backup() {
    activeBackup = backupDesktopData(runtime.userDataDir, backupRoot).catch(error => {
      console.error("Local backup skipped", error instanceof Error ? error.message : error);
    });
  }
  backup();
  backupTimer = setInterval(backup, 24 * 60 * 60 * 1000);
  backupTimer.unref?.();
  console.timeEnd("desktop:window");

  console.timeEnd("desktop:total");
}

app.on("before-quit", event => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  clearInterval(backupTimer);
  void Promise.allSettled([agentBroker?.close(), shutdownServerProcess()]).then(() => app.exit(0));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (!mainWindow && serverUrl) {
    await createMainWindow(serverUrl);
  }
});

if (ownsInstance) app.whenReady().then(() => {
  bootstrapDesktopApp().catch((error) => {
    dialog.showErrorBox(
      `${PRODUCT_NAME} 启动失败`,
      error instanceof Error ? error.message : "未知错误"
    );
    app.quit();
  });
});
