// Marion Mystery in-world QA matrix: modes × maps × views × devices × roles.
// Starts a Practice match per combination, teleports the player through rooms
// (indoor + outdoor), a corridor and a vent, walks a little at each stop, and
// saves a screenshot per stop plus every console error / warning / pageerror.
//
//   npx vite --port 5175 --host 127.0.0.1 &
//   node scripts/qa/matrix.mjs --base http://127.0.0.1:5175 --out /tmp/qa \
//     [--views 2d,3d-tp,3d-fp] [--maps hq,greenhouse,express,manor] [--modes classic,lightsout,hideseek]
//     [--devices desktop,iphone,iphone844] [--stops 6] [--plan full|smoke|all] [--quality high] [--sheet]
//     [--only 3d-fp_classic_manor_murderer_desktop,...] [--reduced]
//
// --plan full  = every mode × map × role in 2D on the first device plus one run on another device;
//                every mode × map once in each 3D view, rotating role and device.
// --plan smoke = one combination per view per device.
// --plan all   = everything on every device (slow in 3D).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const next = argv[i + 1];
  args[a.slice(2)] = next && !next.startsWith('--') ? next : '1';
}
const BASE = args.base ?? 'http://127.0.0.1:5175';
const OUT = args.out ?? '/tmp/mystery-qa';
const list = (k, d) => (args[k] ? args[k].split(',') : d);
const VIEWS = list('views', ['2d', '3d-tp', '3d-fp']);
const MAPS = list('maps', ['hq', 'greenhouse', 'express', 'manor']);
const MODES = list('modes', ['classic', 'lightsout', 'hideseek']);
const DEVICES = list('devices', ['desktop', 'iphone', 'iphone844']);
const ROLES = args.roles ? args.roles.split(',') : null;
const STOPS = Number(args.stops ?? 6);
const PLAN = args.plan ?? 'full';
const QUALITY = args.quality ?? 'high';
const REDUCED = !!args.reduced;
const IGNORE = [/GL Driver Message/, /GPU stall/, /texImage3D/, /favicon/, /\[vite\]/, /Download the React DevTools/];

const DEVICE_OPTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  desktop2x: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  iphone: { ...devices['iPhone 13 landscape'] },
  iphone844: { ...devices['iPhone 13 landscape'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 } },
};
const rolesFor = (mode) => ROLES ?? (mode === 'hideseek' ? ['hider', 'seeker'] : ['crewmate', 'murderer']);

function plan() {
  const combos = [];
  let rot = 0;
  for (const view of VIEWS)
    for (const mode of MODES)
      for (const map of MAPS) {
        const roles = rolesFor(mode);
        if (PLAN === 'all') {
          for (const device of DEVICES) for (const role of roles) combos.push({ view, mode, map, role, device });
        } else if (view === '2d') {
          for (const role of roles) combos.push({ view, mode, map, role, device: DEVICES[0] });
          if (DEVICES.length > 1) combos.push({ view, mode, map, role: roles[rot % roles.length], device: DEVICES[1 + (rot % (DEVICES.length - 1))] });
          rot++;
        } else {
          combos.push({ view, mode, map, role: roles[rot % roles.length], device: DEVICES[rot % DEVICES.length] });
          rot++;
        }
      }
  if (PLAN === 'smoke') {
    const seen = new Set();
    return combos.filter((c) => {
      const k = `${c.view}-${c.device}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return combos;
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
mkdirSync(OUT, { recursive: true });
const report = [];
// --only view_mode_map_role_device[,...] reruns just those combinations (e.g. ones that timed out).
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const combos = plan().filter((c) => !ONLY || ONLY.has(`${c.view}_${c.mode}_${c.map}_${c.role}_${c.device}`));
console.log(`${combos.length} combinations`);

for (const [i, c] of combos.entries()) {
  const tag = `${c.view}_${c.mode}_${c.map}_${c.role}_${c.device}`;
  const dir = join(OUT, tag);
  mkdirSync(dir, { recursive: true });
  const msgs = [];
  const t0 = Date.now();
  const is3d = c.view !== '2d';
  const ctx = await browser.newContext({ ...DEVICE_OPTS[c.device], reducedMotion: REDUCED ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(
    (o) => {
      let prev = {};
      try {
        prev = JSON.parse(localStorage.getItem('marion-mystery:v1') || '{}');
      } catch {}
      localStorage.setItem('marion-mystery:v1', JSON.stringify({ ...prev, view: o.view, quality: o.q, name: 'QA', tutorialDone: true, muted: true }));
    },
    { view: c.view, q: QUALITY },
  );
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (!['error', 'warning'].includes(m.type())) return;
    if (IGNORE.some((r) => r.test(m.text()))) return;
    msgs.push(`${m.type()}: ${m.text().slice(0, 400)}`);
  });
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  const shots = [];
  try {
    await page.goto(`${BASE}/?mystery&debug=1`);
    await page.waitForFunction(() => !!window.__mm, null, { timeout: 30000 });
    await page.evaluate((c) => window.__mm.store.getState().startFreeplay({ map: c.map, mode: c.mode, role: c.role }), c);
    await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'play' && !!window.__mm.view, null, { timeout: 300000 });
    await sleep(is3d ? 4000 : 1200);
    // Stops: rooms (outdoor first), one hall, one vent; nearest free floor cell to each.
    const stops = await page.evaluate((n) => {
      const room = window.__mm.server.rooms.values().next().value;
      const map = room.ctx.map;
      const def = map.def;
      const free = (x, y) => {
        let best = null;
        let bd = 1e9;
        for (let yy = Math.max(0, Math.floor(y) - 6); yy < Math.min(map.h, Math.floor(y) + 7); yy++)
          for (let xx = Math.max(0, Math.floor(x) - 6); xx < Math.min(map.w, Math.floor(x) + 7); xx++) {
            if (map.cells[yy * map.w + xx] !== 1) continue;
            const d = (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2;
            if (d < bd) {
              bd = d;
              best = { x: xx + 0.5, y: yy + 0.5 };
            }
          }
        return best;
      };
      const out = [];
      const outdoor = def.rooms.filter((r) => r.outdoor);
      const indoor = def.rooms.filter((r) => !r.outdoor);
      const want = Math.max(1, n - 2);
      const step = Math.max(1, Math.floor(indoor.length / Math.max(1, want - Math.min(2, outdoor.length))));
      const pick = [...outdoor.slice(0, 2), ...indoor.filter((_, k) => k % step === 0)].slice(0, want);
      for (const r of pick) {
        const p = free(r.rect[0] + r.rect[2] / 2, r.rect[1] + r.rect[3] / 2);
        if (p) out.push({ ...p, label: r.id + (r.outdoor ? '-out' : '') });
      }
      const h = def.halls[Math.floor(def.halls.length / 2)];
      if (h) {
        const p = free(h.rect[0] + h.rect[2] / 2, h.rect[1] + h.rect[3] / 2);
        if (p) out.push({ ...p, label: 'hall' });
      }
      const v = def.vents[0];
      if (v) {
        const p = free(v.x + 0.5, v.y + 0.5);
        if (p) out.push({ ...p, label: 'vent-' + v.id, vent: v.id });
      }
      return out;
    }, STOPS);
    let k = 0;
    for (const s of stops) {
      await page.evaluate((s) => {
        const room = window.__mm.server.rooms.values().next().value;
        const pid = window.__mm.store.getState().pid;
        const p = room.match.players[pid];
        p.pos = { x: s.x, y: s.y };
        p.corrected = p.inputSeq + 1;
      }, s);
      await sleep(is3d ? 1500 : 500);
      // Walk a bit: right then down (not at the vent stop, which must stay in reach).
      if (!s.vent) {
        await page.keyboard.down('KeyD');
        await sleep(is3d ? 1200 : 500);
        await page.keyboard.up('KeyD');
        await page.keyboard.down('KeyS');
        await sleep(is3d ? 900 : 400);
        await page.keyboard.up('KeyS');
      }
      if (k === 0 && c.mode === 'lightsout') await page.evaluate(() => window.__mm.store.getState().act({ a: 'flashlight', on: true }));
      if (k === 1) await page.keyboard.press('KeyZ'); // ping
      if (k === 2 && c.role === 'murderer') await page.evaluate(() => window.__mm.store.getState().act({ a: 'sabotage', kind: 'meltdown' }));
      if (s.vent && c.role === 'murderer') await page.evaluate((v) => window.__mm.store.getState().act({ a: 'vent.enter', vent: v }), s.vent);
      await sleep(is3d ? 2500 : 500);
      const file = join(dir, `${String(k).padStart(2, '0')}-${s.label}.png`);
      await page.screenshot({ path: file, timeout: 120000 });
      shots.push(file);
      k++;
    }
    const perf = await page.evaluate(() => {
      const cv = document.querySelector('canvas[aria-label="Game view"]');
      return { frameMs: window.__mm.view?.frameMs ?? null, dpr: devicePixelRatio, canvas: cv ? [cv.width, cv.height] : null };
    });
    report.push({ ...c, tag, ok: true, msgs, shots: shots.length, perf, secs: Math.round((Date.now() - t0) / 1000) });
  } catch (e) {
    await page.screenshot({ path: join(dir, 'fail.png') }).catch(() => {});
    report.push({ ...c, tag, ok: false, error: String(e).slice(0, 300), msgs, shots: shots.length, secs: Math.round((Date.now() - t0) / 1000) });
  }
  const r = report[report.length - 1];
  const perf = r.perf ? ` frameMs=${r.perf.frameMs?.toFixed?.(1) ?? '-'} canvas=${r.perf.canvas}` : '';
  console.log(`[${i + 1}/${combos.length}] ${r.ok ? 'ok ' : 'ERR'} ${tag} ${r.secs}s msgs=${msgs.length}${r.error ? ' ' + r.error : ''}${perf}`);
  for (const m of msgs.slice(0, 5)) console.log('   ' + m.split('\n')[0]);
  await ctx.close();
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

// Contact sheets: one per combination.
if (args.sheet) {
  const sheetCtx = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
  const sp = await sheetCtx.newPage();
  for (const r of report) {
    const dir = join(OUT, r.tag);
    const files = readdirSync(dir).filter((f) => f.endsWith('.png'));
    if (!files.length) continue;
    const figs = files.map((f) => `<figure style="margin:0"><img src="file://${join(dir, f)}" style="width:100%"><figcaption>${r.tag} ${f}</figcaption></figure>`).join('');
    writeFileSync(join(dir, 'sheet.html'), `<body style="margin:0;background:#111;color:#eee;font:12px sans-serif;display:grid;grid-template-columns:repeat(3,1fr);gap:4px">${figs}</body>`);
    await sp.goto('file://' + join(dir, 'sheet.html'));
    await sp.waitForLoadState('load');
    await sp.screenshot({ path: join(OUT, `sheet_${r.tag}.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
  }
  await sheetCtx.close();
}
await browser.close();
const bad = report.filter((r) => !r.ok || r.msgs.length);
console.log(`done: ${report.length} runs, ${report.filter((r) => !r.ok).length} failed, ${bad.length} with console output → ${join(OUT, 'report.json')}`);
