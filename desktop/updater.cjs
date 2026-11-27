'use strict';
/**
 * Marion HQ desktop updater — pure Node logic, no Electron imports, so it can be
 * unit-tested with `node --test`.
 *
 * Model: the Mac app is a thin, rarely-changing shell. The game itself (the Vite
 * build in `dist/`) is a "web bundle" that the shell serves from disk. Every push
 * to the repo's default branch publishes a GitHub Release `build-<n>` containing
 *   - marion-hq-web.zip   the web bundle (index.html, assets/, bundle.json)
 *   - manifest.json       { build, tag, commit, builtAt, shellVersion, sha256 }
 * Updating = download the zip, verify its sha256, unpack it into userData, mark it
 * active, then relaunch the app so the new bundle is what gets loaded.
 *
 * On-disk layout (inside Electron's userData):
 *   updates/state.json              { active, previous, pendingVerify, bad[] }
 *   updates/bundles/<tag>/          an unpacked web bundle
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const UA = 'MarionHQ-Desktop-Updater';

/** Read and parse a JSON file, or return `fallback` if missing/invalid. */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Compare dotted numeric versions ("1.2.10" > "1.2.9"). Returns -1, 0 or 1. */
function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** A bundle dir is usable if it has index.html and a bundle.json with a numeric build. */
function readBundle(dir) {
  if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) return null;
  const info = readJson(path.join(dir, 'bundle.json'), null);
  if (!info || !Number.isFinite(Number(info.build))) return null;
  return { dir, info: { ...info, build: Number(info.build) } };
}

/** Unpack a zip with the OS tool: `ditto` on macOS (always present), `unzip` elsewhere. */
function defaultExtract(zipFile, destDir) {
  return new Promise((resolve, reject) => {
    const [cmd, args] =
      process.platform === 'darwin' ? ['/usr/bin/ditto', ['-x', '-k', zipFile, destDir]] : ['unzip', ['-q', '-o', zipFile, '-d', destDir]];
    execFile(cmd, args, (err, _out, stderr) => (err ? reject(new Error(`Could not unpack update: ${stderr || err.message}`)) : resolve()));
  });
}

/**
 * @param {object} opts
 * @param {string} opts.userDataDir   Electron app.getPath('userData')
 * @param {string} opts.builtinDir    web bundle shipped inside the .app
 * @param {string} opts.repo          "owner/name" on GitHub
 * @param {string} opts.shellVersion  app.getVersion()
 * @param {string} [opts.apiBase]     GitHub API base (overridable for tests)
 * @param {typeof fetch} [opts.fetch]
 * @param {(zip: string, dest: string) => Promise<void>} [opts.extract]
 */
function createUpdater(opts) {
  const fetchImpl = opts.fetch || globalThis.fetch;
  const extract = opts.extract || defaultExtract;
  const apiBase = (opts.apiBase || 'https://api.github.com').replace(/\/$/, '');
  const root = path.join(opts.userDataDir, 'updates');
  const bundlesDir = path.join(root, 'bundles');
  const stateFile = path.join(root, 'state.json');

  const loadState = () => ({ active: null, previous: null, pendingVerify: null, bad: [], ...readJson(stateFile, {}) });
  const saveState = (s) => {
    fs.mkdirSync(root, { recursive: true });
    const tmp = `${stateFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, stateFile);
  };

  /**
   * Which web bundle should this launch load? A downloaded bundle wins only if it is
   * valid and at least as new as the one built into the app (so installing a newer
   * .app by hand never gets shadowed by an older download).
   */
  function activeBundle() {
    const builtin = readBundle(opts.builtinDir);
    const st = loadState();
    const dl = st.active ? readBundle(path.join(bundlesDir, st.active)) : null;
    if (dl && (!builtin || dl.info.build >= builtin.info.build)) return { ...dl, source: 'downloaded', tag: st.active };
    if (builtin) return { ...builtin, source: 'builtin', tag: builtin.info.tag || null };
    return null;
  }

  async function getJson(url) {
    const res = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA } });
    if (res.status === 404) return null;
    if (!res.ok) {
      const hint = res.status === 403 ? ' (GitHub rate limit — try again in a few minutes)' : '';
      throw new Error(`Update server answered ${res.status}${hint}`);
    }
    return res.json();
  }

  /** Look at the latest GitHub Release and say whether it is newer than what's running. */
  async function check() {
    const current = activeBundle();
    const currentBuild = current ? current.info.build : 0;
    const rel = await getJson(`${apiBase}/repos/${opts.repo}/releases/latest`);
    const base = { current: current && { ...current.info, source: current.source }, shellVersion: opts.shellVersion };
    if (!rel) return { ...base, available: false, latest: null, reason: 'No updates have been published yet.' };

    const assets = rel.assets || [];
    const manifestAsset = assets.find((a) => a.name === 'manifest.json');
    const zipAsset = assets.find((a) => a.name === 'marion-hq-web.zip');
    if (!manifestAsset || !zipAsset) return { ...base, available: false, latest: null, reason: `Release ${rel.tag_name} has no web bundle.` };

    const manifest = await getJson(manifestAsset.browser_download_url);
    if (!manifest || !Number.isFinite(Number(manifest.build))) throw new Error('The latest release has an unreadable manifest.');
    const latest = {
      build: Number(manifest.build),
      tag: rel.tag_name,
      commit: manifest.commit || null,
      builtAt: manifest.builtAt || rel.published_at || null,
      notes: rel.body || '',
      url: rel.html_url,
      shellVersion: manifest.shellVersion || null,
      sha256: manifest.sha256 || null,
      size: zipAsset.size || 0,
      zipUrl: zipAsset.browser_download_url,
    };
    const st = loadState();
    const isBad = st.bad.includes(latest.tag);
    return {
      ...base,
      latest,
      available: latest.build > currentBuild && !isBad,
      skippedBroken: isBad,
      // A new *shell* (the .app itself) can't be swapped in-place; we only point the user at it.
      shellUpdate: !!latest.shellVersion && compareVersions(latest.shellVersion, opts.shellVersion) > 0,
      reason: isBad ? `Build ${latest.build} failed to start before and was rolled back.` : null,
    };
  }

  /** Stream a URL to disk, reporting progress, and return its sha256. */
  async function download(url, file, total, onProgress) {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/octet-stream' } });
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
    const size = Number(res.headers.get('content-length')) || total || 0;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
    let got = 0;
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        got += value.length;
        if (!out.write(value)) await new Promise((r) => out.once('drain', r));
        onProgress?.({ phase: 'downloading', received: got, total: size, fraction: size ? got / size : 0 });
      }
    } finally {
      await new Promise((r) => out.end(r));
    }
    return hash.digest('hex');
  }

  /**
   * Download + verify + unpack `latest` (from check()) and make it the active bundle.
   * Nothing changes on disk until the new bundle is fully verified.
   */
  async function install(latest, onProgress) {
    if (!latest || !latest.zipUrl) throw new Error('Nothing to install.');
    fs.mkdirSync(bundlesDir, { recursive: true });
    const work = fs.mkdtempSync(path.join(root, 'incoming-'));
    try {
      const zip = path.join(work, 'web.zip');
      const sha = await download(latest.zipUrl, zip, latest.size, onProgress);
      if (latest.sha256 && sha !== latest.sha256) throw new Error('Downloaded update is corrupted (checksum mismatch). Please try again.');

      onProgress?.({ phase: 'installing', fraction: 1 });
      const unpacked = path.join(work, 'web');
      fs.mkdirSync(unpacked);
      await extract(zip, unpacked);
      const b = readBundle(unpacked);
      if (!b) throw new Error('Update package is missing index.html or bundle.json.');
      if (b.info.build !== latest.build) throw new Error(`Update package is build ${b.info.build}, expected ${latest.build}.`);

      const dest = path.join(bundlesDir, latest.tag);
      await fsp.rm(dest, { recursive: true, force: true });
      fs.renameSync(unpacked, dest);

      const st = loadState();
      const prevActive = st.active;
      saveState({ ...st, previous: prevActive && prevActive !== latest.tag ? prevActive : st.previous, active: latest.tag, pendingVerify: latest.tag });
      await prune();
      onProgress?.({ phase: 'ready', fraction: 1 });
      return { tag: latest.tag, build: latest.build };
    } finally {
      await fsp.rm(work, { recursive: true, force: true });
    }
  }

  /** Keep only the active and previous bundles on disk. */
  async function prune() {
    const st = loadState();
    const keep = new Set([st.active, st.previous].filter(Boolean));
    let entries = [];
    try {
      entries = await fsp.readdir(bundlesDir);
    } catch {
      return;
    }
    await Promise.all(entries.filter((e) => !keep.has(e)).map((e) => fsp.rm(path.join(bundlesDir, e), { recursive: true, force: true })));
  }

  /** The new bundle rendered fine: stop watching it. */
  function confirmHealthy() {
    const st = loadState();
    if (st.pendingVerify) saveState({ ...st, pendingVerify: null });
  }

  /** The new bundle failed to start: never offer it again and fall back to the previous one. */
  function rollback() {
    const st = loadState();
    const broken = st.pendingVerify || st.active;
    if (!broken) return false;
    saveState({ ...st, active: st.previous, previous: null, pendingVerify: null, bad: Array.from(new Set([...st.bad, broken])) });
    return true;
  }

  /** Forget all downloads and go back to the bundle built into the app. */
  async function reset() {
    await fsp.rm(root, { recursive: true, force: true });
  }

  return { activeBundle, check, install, confirmHealthy, rollback, reset, loadState, paths: { root, bundlesDir, stateFile } };
}

module.exports = { createUpdater, compareVersions, readBundle };
