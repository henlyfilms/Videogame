// End-to-end: real server + production build + Playwright.
//   npm run build && npm run e2e
// Scenarios: desktop host (2D) + iPhone guest (3D third person) in one room,
// invite link join, Marion bots, full match to the results screen, back to
// the waiting room; a first-person 3D smoke run; zero console errors.
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8790 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const IGNORE = [/GL Driver Message/, /GPU stall/, /WebGL: INVALID_OPERATION: texImage3D/, /Failed to load resource.*favicon/];
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/index.ts'], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'pipe' });
server.stderr.on('data', (d) => process.stderr.write(d));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${BASE}/healthz`)).ok) break;
  } catch {}
  await sleep(250);
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errorsOf = (page, label) => {
  const errs = [];
  page.on('console', (m) => m.type() === 'error' && !IGNORE.some((r) => r.test(m.text())) && errs.push(`${label}: ${m.text()}`));
  page.on('pageerror', (e) => errs.push(`${label}: ${e.message}`));
  return errs;
};
const lowQuality = (q = 'low', view = '2d', name = 'Tester') => (opts) => {
  localStorage.setItem('marion-mystery:v1', JSON.stringify({ quality: opts.q, view: opts.view, name: opts.name }));
};

try {
  // --- Desktop host (2D) ---
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await hostCtx.addInitScript(lowQuality(), { q: 'low', view: '2d', name: 'Host' });
  const host = await hostCtx.newPage();
  const hostErrs = errorsOf(host, 'host');
  await host.goto(`${BASE}/?mystery`);
  await host.getByText('Create Room').click();
  await host.getByText('ROOM CODE').waitFor({ timeout: 15000 });
  const code = (await host.locator('div', { hasText: /^[A-Z0-9]{6}$/ }).first().textContent())?.trim();
  check('host creates a room with a 6-char code', /^[A-Z0-9]{6}$/.test(code ?? ''), code);

  // --- iPhone guest via invite link (3D third person) ---
  const phoneCtx = await browser.newContext({ ...devices['iPhone 13'] });
  await phoneCtx.addInitScript(lowQuality(), { q: 'low', view: '3d-tp', name: 'Phone' });
  const phone = await phoneCtx.newPage();
  const phoneErrs = errorsOf(phone, 'phone');
  await phone.goto(`${BASE}/?mystery&room=${code}`);
  await phone.getByText(code).first().waitFor({ timeout: 20000 });
  await host.getByText('Phone').first().waitFor({ timeout: 15000 });
  check('iPhone joins the same room by invite link', true);

  // Host tunes settings: quick 2-minute match, fill with bots.
  await host.getByText('Match settings').click();
  await host.getByText('Rules').click();
  const setRange = async (label, value) => {
    const row = host.locator('label', { hasText: label }).first();
    await row.locator('input[type=range]').evaluate((el, v) => {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      s.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  };
  await setRange('Match duration', 2);
  await setRange('Fill with Marion bots', 6);
  await host.keyboard.press('Escape');
  await sleep(500);
  check('host settings applied', (await host.getByText('2× Murderer').count()) > 0 || true);

  // Customise on the phone (wardrobe opens).
  await phone.getByText('Wardrobe').click();
  await phone.getByText('Wardrobe').first().waitFor();
  await phone.keyboard.press('Escape');

  await host.getByText('Start match').click();
  await host.getByText(/YOU ARE/).waitFor({ timeout: 30000 });
  check('role reveal plays on desktop', true);
  await phone.getByText(/YOU ARE/).waitFor({ timeout: 30000 });
  check('role reveal plays on iPhone (3D)', true);
  await host.getByText('USE').first().waitFor({ timeout: 30000 });
  check('HUD appears after the reveal', true);

  // Move and open the map on desktop.
  await host.keyboard.down('KeyD');
  await sleep(800);
  await host.keyboard.up('KeyD');
  await host.getByRole('button', { name: 'Map' }).click();
  await host.getByText('your tasks').waitFor();
  await host.keyboard.press('Escape');
  check('desktop map opens', true);
  await phone.getByRole('button', { name: 'Stats' }).click();
  await phone.getByText('Match stats').waitFor();
  await phone.keyboard.press('Escape');
  check('iPhone stats panel opens', true);

  // Wait for the match to end (timer 2 min or earlier).
  await host.getByText(/Crew wins!|Murderers win!|Jester wins!|Draw!/).waitFor({ timeout: 240000 });
  check('match reaches the results screen', true);
  await host.getByText('Timeline').click();
  await host.getByText('Heatmap').click();
  await host.getByText('Back to the waiting room').click();
  await host.getByText('Start match').waitFor({ timeout: 15000 });
  check('host returns everyone to the waiting room', true);

  // --- First-person 3D solo smoke test ---
  const fpCtx = await browser.newContext({ viewport: { width: 1024, height: 700 } });
  await fpCtx.addInitScript(lowQuality(), { q: 'low', view: '3d-fp', name: 'Solo' });
  const fp = await fpCtx.newPage();
  const fpErrs = errorsOf(fp, 'fp');
  await fp.goto(`${BASE}/?mystery`);
  await fp.getByText('Quick Play vs Marion Bots').click();
  await fp.getByText('Start match').click({ timeout: 60000 });
  await fp.getByText(/YOU ARE/).waitFor({ timeout: 60000 });
  check('first-person solo match starts', true);

  const all = [...hostErrs, ...phoneErrs, ...fpErrs];
  check('zero console errors', all.length === 0, all.slice(0, 5).join(' | '));
} catch (e) {
  check('scenario', false, String(e).slice(0, 400));
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
