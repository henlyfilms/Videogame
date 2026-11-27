'use strict';
// node --test updater.test.cjs — exercises the real download/verify/unzip path
// against a local HTTP server that imitates the GitHub Releases API.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createUpdater, compareVersions } = require('./updater.cjs');

function makeBundle(dir, build, html = '<div id="root"></div>') {
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>${html}<!-- build ${build} -->`);
  fs.writeFileSync(path.join(dir, 'assets', 'app.js'), `console.log(${build})`);
  fs.writeFileSync(path.join(dir, 'bundle.json'), JSON.stringify({ build, tag: `build-${build}`, commit: `c${build}` }));
}

function zipBundle(tmp, build) {
  const src = path.join(tmp, `src-${build}`);
  makeBundle(src, build);
  const zip = path.join(tmp, `web-${build}.zip`);
  execFileSync('zip', ['-q', '-r', zip, '.'], { cwd: src });
  return zip;
}

/** Fake GitHub: /releases/latest, /dl/manifest.json, /dl/marion-hq-web.zip */
async function fakeGitHub(release) {
  const server = http.createServer((req, res) => {
    const r = release.current;
    if (req.url === '/repos/o/r/releases/latest') {
      if (!r) return res.writeHead(404).end('{}');
      const base = `http://127.0.0.1:${server.address().port}/dl`;
      return res.end(
        JSON.stringify({
          tag_name: `build-${r.build}`,
          html_url: 'https://github.com/o/r/releases/x',
          body: 'notes',
          assets: [
            { name: 'manifest.json', browser_download_url: `${base}/manifest.json` },
            { name: 'marion-hq-web.zip', browser_download_url: `${base}/marion-hq-web.zip`, size: fs.statSync(r.zip).size },
          ],
        }),
      );
    }
    if (req.url === '/dl/manifest.json') return res.end(JSON.stringify(r.manifest));
    if (req.url === '/dl/marion-hq-web.zip') {
      const buf = fs.readFileSync(r.zip);
      res.writeHead(200, { 'content-length': buf.length });
      return res.end(buf);
    }
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, apiBase: `http://127.0.0.1:${server.address().port}` };
}

function setup(t, builtinBuild = 3) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'marion-upd-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const builtinDir = path.join(tmp, 'builtin');
  makeBundle(builtinDir, builtinBuild);
  return { tmp, builtinDir, userDataDir: path.join(tmp, 'userData') };
}

function publish(release, tmp, build, extra = {}) {
  const zip = zipBundle(tmp, build);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  release.current = { build, zip, manifest: { build, tag: `build-${build}`, commit: `c${build}`, shellVersion: '1.0.0', sha256, ...extra } };
}

test('compareVersions', () => {
  assert.equal(compareVersions('1.2.10', '1.2.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
});

test('uses the built-in bundle when nothing has been downloaded', (t) => {
  const { builtinDir, userDataDir } = setup(t);
  const u = createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0' });
  const a = u.activeBundle();
  assert.equal(a.source, 'builtin');
  assert.equal(a.info.build, 3);
});

test('no releases yet → not available, with a friendly reason', async (t) => {
  const { builtinDir, userDataDir } = setup(t);
  const release = { current: null };
  const { server, apiBase } = await fakeGitHub(release);
  t.after(() => server.close());
  const u = createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0', apiBase });
  const s = await u.check();
  assert.equal(s.available, false);
  assert.match(s.reason, /No updates/);
});

test('check → install → next launch loads the downloaded bundle', async (t) => {
  const { tmp, builtinDir, userDataDir } = setup(t);
  const release = {};
  publish(release, tmp, 5);
  const { server, apiBase } = await fakeGitHub(release);
  t.after(() => server.close());
  const u = createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0', apiBase });

  const s = await u.check();
  assert.equal(s.available, true);
  assert.equal(s.latest.build, 5);
  assert.equal(s.shellUpdate, false);

  const phases = [];
  await u.install(s.latest, (p) => phases.push(p.phase));
  assert.ok(phases.includes('downloading') && phases.includes('installing') && phases.at(-1) === 'ready');

  // Simulate the relaunch: a fresh updater instance picks the new bundle.
  const after = createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0', apiBase });
  const a = after.activeBundle();
  assert.equal(a.source, 'downloaded');
  assert.equal(a.info.build, 5);
  assert.match(fs.readFileSync(path.join(a.dir, 'index.html'), 'utf8'), /build 5/);
  assert.equal(after.loadState().pendingVerify, 'build-5');
  after.confirmHealthy();
  assert.equal(after.loadState().pendingVerify, null);
  assert.equal((await after.check()).available, false);

  // A second update keeps exactly one previous bundle for rollback and prunes the rest.
  publish(release, tmp, 6);
  await after.install((await after.check()).latest);
  publish(release, tmp, 8);
  await after.install((await after.check()).latest);
  assert.deepEqual(fs.readdirSync(after.paths.bundlesDir).sort(), ['build-6', 'build-8']);
});

test('corrupted download is rejected and nothing changes', async (t) => {
  const { tmp, builtinDir, userDataDir } = setup(t);
  const release = {};
  publish(release, tmp, 9, { sha256: 'deadbeef' });
  const { server, apiBase } = await fakeGitHub(release);
  t.after(() => server.close());
  const u = createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0', apiBase });
  const s = await u.check();
  await assert.rejects(u.install(s.latest), /checksum/);
  assert.equal(u.activeBundle().source, 'builtin');
});

test('a bundle that fails to start is rolled back and never offered again', async (t) => {
  const { tmp, builtinDir, userDataDir } = setup(t);
  const release = {};
  publish(release, tmp, 10);
  const { server, apiBase } = await fakeGitHub(release);
  t.after(() => server.close());
  const u = createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0', apiBase });
  await u.install((await u.check()).latest);
  assert.equal(u.activeBundle().info.build, 10);
  assert.equal(u.rollback(), true);
  assert.equal(u.activeBundle().source, 'builtin');
  const s = await u.check();
  assert.equal(s.available, false);
  assert.equal(s.skippedBroken, true);
});

test('a newer .app install is never shadowed by an older download', async (t) => {
  const { tmp, builtinDir, userDataDir } = setup(t, 3);
  const release = {};
  publish(release, tmp, 5);
  const { server, apiBase } = await fakeGitHub(release);
  t.after(() => server.close());
  await createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0', apiBase }).install(
    (await createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0', apiBase }).check()).latest,
  );
  makeBundle(builtinDir, 12); // user dragged in a newer Marion HQ.app
  const a = createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0', apiBase }).activeBundle();
  assert.equal(a.source, 'builtin');
  assert.equal(a.info.build, 12);
});

test('flags a newer Mac app shell', async (t) => {
  const { tmp, builtinDir, userDataDir } = setup(t);
  const release = {};
  publish(release, tmp, 4, { shellVersion: '1.1.0' });
  const { server, apiBase } = await fakeGitHub(release);
  t.after(() => server.close());
  const s = await createUpdater({ userDataDir, builtinDir, repo: 'o/r', shellVersion: '1.0.0', apiBase }).check();
  assert.equal(s.shellUpdate, true);
});
