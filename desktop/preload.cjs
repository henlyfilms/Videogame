'use strict';
// Exposes a tiny, typed-on-the-web-side bridge as `window.marionDesktop`.
// The web app shows its Update button only when this bridge exists.
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, cb) {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
}

contextBridge.exposeInMainWorld('marionDesktop', {
  platform: process.platform,
  getInfo: () => ipcRenderer.invoke('updater:info'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  updateAndRestart: (opts) => ipcRenderer.invoke('updater:update', opts),
  restart: () => ipcRenderer.invoke('updater:restart'),
  openReleases: () => ipcRenderer.invoke('updater:open-releases'),
  onProgress: (cb) => subscribe('updater:progress', cb),
  onStatus: (cb) => subscribe('updater:status', cb),
  onOpenRequest: (cb) => subscribe('updater:open', cb),
});
