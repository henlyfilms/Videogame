// One-shot in-world probe: start Practice, teleport to a spot, optionally walk / act, screenshot.
//   node scripts/qa/probe.mjs --base http://127.0.0.1:5175 --map greenhouse --mode classic --role crewmate \
//     --view 2d --device desktop --at 40.5,20.5 [--walk KeyS:600,KeyD:300] [--act '{"a":"sabotage","kind":"meltdown"}']
//     [--yaw 1.57] [--pitch 0.3] [--wait 3000] [--reduced] --out /tmp/shot.png
// Several spots: --at "x,y;x,y" writes out-0.png, out-1.png ...
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const argv = process.argv.slice(2);
const a = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
const DEV = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  desktop2x: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  iphone: { ...devices['iPhone 13 landscape'] },
  iphone844: { ...devices['iPhone 13 landscape'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } },
};
const view = a.view ?? '2d';
const is3d = view !== '2d';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ...DEV[a.device ?? 'desktop'], reducedMotion: a.reduced ? 'reduce' : 'no-preference' });
await ctx.addInitScript(
  (o) => localStorage.setItem('marion-mystery:v1', JSON.stringify({ view: o.view, quality: o.q, name: 'QA', tutorialDone: true, muted: true, reducedMotion: o.rm })),
  { view, q: a.quality ?? 'high', rm: !!a.reduced },
);
const page = await ctx.newPage();
const msgs = [];
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && !/GL Driver|GPU stall|texImage3D|favicon|\[vite\]|React DevTools/.test(m.text()) && msgs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`));
await page.goto(`${a.base ?? 'http://127.0.0.1:5175'}/?mystery&debug=1`);
await page.waitForFunction(() => !!window.__mm, null, { timeout: 30000 });
await page.evaluate((c) => window.__mm.store.getState().startFreeplay(c), { map: a.map ?? 'hq', mode: a.mode ?? 'classic', role: a.role ?? 'crewmate' });
await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'play' && !!window.__mm.view, null, { timeout: 300000 });
if (a.hide) await page.getByRole('button', { name: 'HIDE' }).first().click().catch(() => {});
await sleep(is3d ? 3000 : 800);
const spots = (a.at ?? '').split(';').filter(Boolean);
const out = a.out ?? '/tmp/probe.png';
for (const [n, spot] of (spots.length ? spots : ['']).entries()) {
  if (spot) {
    const [x, y] = spot.split(',').map(Number);
    await page.evaluate(
      ({ x, y }) => {
        const room = window.__mm.server.rooms.values().next().value;
        const p = room.match.players[window.__mm.store.getState().pid];
        p.pos = { x, y };
        p.corrected = p.inputSeq + 1;
      },
      { x, y },
    );
    await sleep(is3d ? 1500 : 400);
  }
  if (a.yaw || a.pitch)
    await page.evaluate(({ yaw, pitch }) => {
      const v = window.__mm.view;
      if (yaw !== undefined) v.yaw = yaw;
      if (pitch !== undefined) v.pitch = pitch;
    }, { yaw: a.yaw !== undefined ? Number(a.yaw) : undefined, pitch: a.pitch !== undefined ? Number(a.pitch) : undefined });
  for (const step of (a.walk ?? '').split(',').filter(Boolean)) {
    const [key, ms] = step.split(':');
    await page.keyboard.down(key);
    await sleep(Number(ms));
    await page.keyboard.up(key);
  }
  if (a.act) for (const act of a.act.split('|')) await page.evaluate((x) => window.__mm.store.getState().act(JSON.parse(x)), act);
  if (a.eval) await page.evaluate(a.eval);
  await sleep(Number(a.wait ?? (is3d ? 3000 : 800)));
  const file = spots.length > 1 ? out.replace(/\.png$/, `-${n}.png`) : out;
  await page.screenshot({ path: file });
  console.log('wrote', file);
}
console.log(msgs.length ? msgs.join('\n') : 'no console errors');
await browser.close();
