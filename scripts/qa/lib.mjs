// Shared helpers for the Marion Mystery interaction QA scripts (Playwright).
//   npx vite --port 5177 --host 127.0.0.1   (dev server)  then  node scripts/qa/<script>.mjs
// Playwright is resolved from the local install or the global one.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const req = createRequire(import.meta.url);
let pw;
for (const m of ['playwright', '/opt/node-tools/node_modules/playwright']) {
  try {
    pw = req(m);
    break;
  } catch {}
}
if (!pw) throw new Error('playwright not found');
export const { chromium, devices } = pw;

export const BASE = process.env.QA_BASE ?? 'http://127.0.0.1:5177';
export const SHOTS = process.env.QA_SHOTS ?? '/tmp/qa-interact';
mkdirSync(SHOTS, { recursive: true });

const IGNORE = [/GL Driver Message/, /GPU stall/, /Failed to load resource.*favicon/, /\[vite\]/, /Download the React DevTools/];

export async function launch(opts = {}) {
  const args = ['--autoplay-policy=no-user-gesture-required'];
  if (opts.gl) args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  return chromium.launch({ args });
}

/** New page with prefs, error capture and the debug hook. */
export async function openMystery(browser, { device, viewport = { width: 1280, height: 800 }, prefs = {}, label = 'page', query = '' } = {}) {
  const vpo = process.env.QA_VIEWPORT ? { width: +process.env.QA_VIEWPORT.split('x')[0], height: +process.env.QA_VIEWPORT.split('x')[1] } : null;
  const ctx = await browser.newContext(device ? { ...devices[device], ...(vpo ? { viewport: vpo, screen: vpo } : {}) } : { viewport: vpo ?? viewport });
  await ctx.addInitScript((p) => {
    const cur = JSON.parse(localStorage.getItem('marion-mystery:v1') || '{}');
    localStorage.setItem('marion-mystery:v1', JSON.stringify({ onboarded: true, view: '2d', quality: 'low', name: 'QA', ...cur, ...p }));
  }, { ...(process.env.QA_VIEW ? { view: process.env.QA_VIEW } : {}), ...prefs });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !IGNORE.some((r) => r.test(m.text()))) errors.push(`${label} ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
  await page.goto(`${BASE}/?mystery&debug=1${query}`);
  await page.waitForFunction(() => !!window.__mm && !!window.__mmSfx, null, { timeout: 30000 });
  // Unlock audio with a harmless gesture.
  await page.mouse.click(2, 2);
  return { ctx, page, errors };
}

export async function freeplay(page, { map = 'hq', mode = 'classic', role = 'crewmate' } = {}) {
  await page.evaluate((o) => window.__mm.store.getState().startFreeplay(o), { map, mode, role });
  await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'play', null, { timeout: 30000 });
  await page.waitForTimeout(300);
}

/** Run `src` (a function body) with (room, m, me, pid, a) on the local server's match. */
export async function srv(page, src, arg) {
  return page.evaluate(
    async ([body, a]) => {
      const room = window.__mm.server.rooms.values().next().value;
      const m = room.match;
      const pid = window.__mm.store.getState().pid;
      const st = m && (m.state ?? m.st ?? m);
      const me = st && st.players ? st.players[pid] : undefined;
      const AsyncFn = Object.getPrototypeOf(async () => {}).constructor;
      const imp = (u) => import(u);
      return await new AsyncFn('room', 'm', 'me', 'pid', 'a', 'st', 'imp', body)(room, m, me, pid, a, st, imp);
    },
    [src, arg],
  );
}

export const traceMark = (page) => page.evaluate(() => window.__mmSfx.trace.length);
export const traceSince = (page, n) => page.evaluate((k) => window.__mmSfx.trace.slice(k), n);
export const uniq = (a) => [...new Set(a)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
