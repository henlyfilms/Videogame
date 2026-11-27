'use strict';
/**
 * Marion HQ for macOS — Electron main process.
 *
 * Serves the active web bundle over a private `app://hq/` origin (stable across
 * updates, so localStorage/settings survive), and wires the in-app Update button
 * and the "Check for Updates…" menu item to the updater. Installing an update
 * relaunches the app so the freshly downloaded bundle is the one that loads.
 */

const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createUpdater } = require('./updater.cjs');
const pkg = require('./package.json');

const REPO = pkg.marion.repo;
const SCHEME = 'app';
const ORIGIN = `${SCHEME}://hq`;
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const HEALTH_DELAY_MS = 5000;
const AUTO_CHECK_MS = 30 * 60 * 1000;

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const builtinDir = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, 'web');
const updater = createUpdater({
  userDataDir: app.getPath('userData'),
  builtinDir,
  repo: REPO,
  shellVersion: app.getVersion(),
  // MARION_UPDATE_API lets tests point the updater at a local fake of the GitHub API.
  apiBase: process.env.MARION_UPDATE_API || undefined,
  fetch: (url, init) => net.fetch(url, init),
});

/** Resolved once per launch — a new bundle only takes effect after a relaunch. */
let active = null;
let win = null;
let busy = false;
let lastCheck = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function progress(p) {
  send('updater:progress', p);
  if (win && !win.isDestroyed()) win.setProgressBar(p.phase === 'downloading' ? Math.max(0.01, p.fraction || 0) : p.phase === 'installing' ? 2 : -1);
}

function info() {
  return {
    shellVersion: app.getVersion(),
    bundle: active ? { ...active.info, source: active.source } : null,
    repo: REPO,
    releasesUrl: RELEASES_URL,
    busy,
    lastCheck,
  };
}

async function check() {
  lastCheck = await updater.check();
  send('updater:status', lastCheck);
  return lastCheck;
}

/** Quit and reopen the app. Used after installing, and by the "Restart" button. */
function restart() {
  app.relaunch();
  app.exit(0);
}

/** Check → download → verify → activate → relaunch. Returns the check result if nothing to do. */
async function updateAndRestart({ force = false } = {}) {
  if (busy) throw new Error('An update is already in progress.');
  busy = true;
  try {
    progress({ phase: 'checking', fraction: 0 });
    const status = await check();
    if (!status.available) {
      progress({ phase: 'idle', fraction: 0 });
      if (force) restart();
      return status;
    }
    await updater.install(status.latest, progress);
    progress({ phase: 'restarting', fraction: 1 });
    setTimeout(restart, 600);
    return { ...status, installed: true };
  } catch (err) {
    progress({ phase: 'error', fraction: 0, message: err.message });
    throw err;
  } finally {
    busy = false;
  }
}

/** Native fallback flow (menu item) that works even if the web UI is broken. */
async function menuCheckForUpdates() {
  if (!win) return;
  send('updater:open');
  try {
    const status = await check();
    if (status.available) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['Update & Restart', 'Later'],
        defaultId: 0,
        cancelId: 1,
        message: `Marion HQ build ${status.latest.build} is available`,
        detail: `You have build ${status.current ? status.current.build : '?'}. Marion HQ will download the update and restart.`,
      });
      if (response === 0) await updateAndRestart();
    } else {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: status.shellUpdate ? ['OK', 'Download New App'] : ['OK', 'Restart Anyway'],
        defaultId: 0,
        message: status.shellUpdate ? 'A new version of the Mac app is available' : 'Marion HQ is up to date',
        detail: status.reason || `You're on build ${status.current ? status.current.build : '?'}.`,
      });
      if (response === 1) status.shellUpdate ? shell.openExternal(status.latest.url || RELEASES_URL) : restart();
    }
  } catch (err) {
    dialog.showErrorBox('Update failed', err.message);
  }
}

async function menuReset() {
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Reset & Restart', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'Go back to the version built into the app?',
    detail: 'Downloaded updates are removed. Your HQ settings are kept.',
  });
  if (response === 0) {
    await updater.reset();
    restart();
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { label: 'Check for Updates…', click: menuCheckForUpdates },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { label: 'Restart Marion HQ', accelerator: 'CmdOrCtrl+Shift+R', click: restart },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        ...(isMac ? [] : [{ label: 'Check for Updates…', click: menuCheckForUpdates }]),
        { label: 'Release Notes', click: () => shell.openExternal(RELEASES_URL) },
        { label: 'Reset to Built-in Version…', click: menuReset },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Map app://hq/<path> to a file inside the active bundle (no escaping the folder). */
function serveBundle() {
  protocol.handle(SCHEME, (req) => {
    if (!active) return new Response('No web bundle found. Reinstall Marion HQ.', { status: 500 });
    const { pathname } = new URL(req.url);
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(active.dir, rel));
    if (!file.startsWith(active.dir + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString()).catch(() => new Response('Not found', { status: 404 }));
  });
}

/** After an update, make sure the new bundle actually renders; otherwise roll back. */
function watchHealth() {
  const pending = updater.loadState().pendingVerify;
  if (!pending || active.source !== 'downloaded' || active.tag !== pending) return;
  let settled = false;
  const fail = (why) => {
    if (settled) return;
    settled = true;
    console.error(`[marion] bundle ${pending} failed (${why}); rolling back`);
    updater.rollback();
    dialog.showErrorBox('Update rolled back', `Build ${active.info.build} didn't start correctly, so Marion HQ went back to the previous version.`);
    restart();
  };
  win.webContents.once('did-fail-load', (_e, code, desc) => fail(`${code} ${desc}`));
  win.webContents.once('render-process-gone', (_e, d) => fail(d.reason));
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      if (settled) return;
      try {
        const n = await win.webContents.executeJavaScript('document.getElementById("root")?.childElementCount ?? 0');
        if (n > 0) {
          settled = true;
          updater.confirmHealthy();
        } else fail('empty #root');
      } catch (e) {
        fail(e.message);
      }
    }, HEALTH_DELAY_MS);
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Marion HQ',
    backgroundColor: '#f6f7fb',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  // Links to the outside world open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.on('closed', () => (win = null));
  watchHealth();
  win.loadURL(`${ORIGIN}/index.html`);
}

ipcMain.handle('updater:info', () => info());
ipcMain.handle('updater:check', () => check());
ipcMain.handle('updater:update', (_e, opts) => updateAndRestart(opts || {}));
ipcMain.handle('updater:restart', () => restart());
ipcMain.handle('updater:open-releases', () => shell.openExternal(lastCheck?.latest?.url || RELEASES_URL));

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  active = updater.activeBundle();
  console.log(`[marion] shell ${app.getVersion()} · bundle ${active ? `${active.info.build} (${active.source})` : 'MISSING'}`);
  serveBundle();
  buildMenu();
  createWindow();
  // Quiet background checks light up the dot on the Update button.
  const quietCheck = () => check().catch((e) => console.warn('[marion] update check failed:', e.message));
  setTimeout(quietCheck, 8000);
  setInterval(quietCheck, AUTO_CHECK_MS);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => app.quit());
