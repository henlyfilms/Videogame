// Every task mini-game, opened from the real HUD (E at the station) and solved
// with the keyboard only. Checks: opens, sounds per step, completes, credits the
// task (server step/done), closes, and no console errors. Screenshots each game.
//   node scripts/qa/tasks.mjs [kind ...]   (QA_DEVICE='iPhone 13 landscape' for phone)
import { launch, openMystery, freeplay, srv, traceMark, traceSince, SHOTS, sleep, devices } from './lib.mjs';
import { keyboardSolvers } from './solvers.mjs';
import { pointerSolvers } from './pointer.mjs';

const ALL = ['stampMail', 'sortClips', 'distillReel', 'slotCartridge', 'rerouteTube', 'calibrateTurntable', 'sortBerries', 'juicePress', 'alignDish', 'fuelCan', 'fuelEngine', 'fixWiring', 'swipeBadge', 'waterPlants', 'cleanFilter', 'download', 'upload', 'unlockManifold', 'simonSays', 'keypadCode', 'emptyChute', 'medScan', 'primeShields', 'chartCourse', 'replaceFuse', 'rechargeGenerator', 'lightLantern', 'lightsPanel', 'commsPanel'];
const kinds = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const list = kinds.length ? kinds : ALL;
const device = process.env.QA_DEVICE;
const role = process.env.QA_ROLE ?? 'crewmate';
const input = process.env.QA_INPUT ?? 'keyboard'; // keyboard | mouse | touch
const tag = (device ? `phone${process.env.QA_VIEWPORT ?? devices[device]?.viewport.width ?? ''}` : 'desk') + `-${input}` + (role === 'crewmate' ? '' : `-${role}`);

const browser = await launch({ gl: !!process.env.QA_VIEW?.startsWith('3d') });
const { page, errors } = await openMystery(browser, { device, label: tag });
await freeplay(page, { map: 'hq', mode: 'classic', role });
const solve = input === 'keyboard' ? keyboardSolvers(page) : pointerSolvers(page, input);
const rows = [];

for (const kind of list) {
  const fix = kind === 'lightsPanel' || kind === 'commsPanel';
  // Give the player exactly one task whose current step is this station kind.
  const setup = await srv(
    page,
    `
    const kind = a.kind;
    const map = room.ctx.map;
    const station = map.def.stations.find((s) => s.kind === kind);
    if (!station) return { err: 'no station' };
    st.sabotage.active = null; st.sabotage.cooldown = 0;
    if (a.fix) { st.sabotage.active = kind === 'lightsPanel' ? 'lights' : 'comms'; st.sabotage.startedAt = st.t; }
    else {
      const T = { download: ['transferData', 0], upload: ['transferData', 1], fuelCan: ['fuelEngine', 0], fuelEngine: ['fuelEngine', 1], juicePress: ['juicePress', 1], sortBerries: ['sortBerries', 0], lightLantern: ['lightLanterns', 0], rerouteTube: ['rerouteTube', 0] }[kind] ?? [kind, 0];
      const stations = T[0] === 'transferData' ? ['download-38', 'upload-42'] : T[0] === 'fuelEngine' ? ['fuelCan-27', 'fuelEngine-28'] : T[0] === 'juicePress' ? ['sortBerries-24', 'juicePress-25'] : T[0] === 'lightLanterns' ? ['lightLantern-59', 'lightLantern-60', 'lightLantern-61'] : T[0] === 'rerouteTube' ? ['rerouteTube-51', 'rerouteTube-52'] : [station.id];
      me.tasks = [{ taskId: T[0], stations, step: T[1], done: false }];
    }
    const sid = a.fix ? station.id : me.tasks[0].stations[me.tasks[0].step];
    const s2 = map.stationById.get(sid);
    // stand on the nearest free spot next to the station
    const { nearestFree } = await imp('/src/mystery/core/map.ts');
    let best = null;
    for (let k = 0; k < 8 && !best; k++) {
      const p = nearestFree(map, { x: s2.x + Math.cos(k / 8 * Math.PI * 2) * 0.9, y: s2.y + Math.sin(k / 8 * Math.PI * 2) * 0.9 });
      if (Math.hypot(p.x - s2.x, p.y - s2.y) < 1.4) best = p;
    }
    best = best ?? nearestFree(map, { x: s2.x, y: s2.y });
    // client prediction and server in the same task, so a stale move can't drag us back
    window.__mm.runtime.local.pos = { ...best };
    me.pos = best; me.corrected = me.inputSeq + 1; me.activeTask = null;
    return { sid, pos: best, d: Math.hypot(best.x - s2.x, best.y - s2.y) };
  `,
    { kind, fix },
  );
  if (setup.err) {
    rows.push({ kind, ok: false, note: setup.err });
    continue;
  }
  await sleep(600);
  const before = await srv(page, `return JSON.stringify(me.tasks[0] ?? null)`);
  const mark = await traceMark(page);
  if (input === 'touch') {
    // The big context button (bottom right) opens the task on phones.
    const b = await page.locator('.mmh-actions > :last-child').boundingBox().catch(() => null);
    if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    else await page.keyboard.press('KeyE');
  } else await page.keyboard.press('KeyE');
  let opened = await page.waitForSelector(`[data-task-modal="${kind}"]`, { timeout: 2500 }).catch(() => null);
  let retried = false;
  if (!opened) {
    retried = await page.evaluate(() => JSON.stringify({ pos: window.__mm.runtime.local.pos, at: window.__mm.store.getState().snap.you.activeTask, ts: window.__mm.store.getState().taskStation }));
    await page.keyboard.press('KeyE');
    opened = await page.waitForSelector(`[data-task-modal="${kind}"]`, { timeout: 2500 }).catch(() => null);
  }
  if (!opened) {
    const ctx = await page.evaluate(() => JSON.stringify({ ts: window.__mm.store.getState().taskStation, pos: window.__mm.runtime.local.pos, tasks: window.__mm.store.getState().snap.you.tasks, at: window.__mm.store.getState().snap.you.activeTask }));
    rows.push({ kind, ok: false, note: `did not open (taskStation ${ctx}, setup ${JSON.stringify(setup)})` });
    continue;
  }
  await sleep(450);
  const seed = Number(await opened.getAttribute('data-task-seed'));
  const box = await page.locator('.mmg-panel').boundingBox();
  const vp = page.viewportSize();
  const fits = box && box.x >= -1 && box.y >= -1 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1;
  await page.screenshot({ path: `${SHOTS}/task-${tag}-${kind}.png` });
  const posBefore = await srv(page, `return me.pos`);
  const t0 = Date.now();
  let solveErr = '';
  try {
    await solve[kind](seed);
  } catch (e) {
    solveErr = String(e.message ?? e);
  }
  const closed = await page.waitForSelector('[data-task-modal]', { state: 'detached', timeout: 12000 }).then(() => true).catch(() => false);
  await sleep(500);
  const after = await srv(page, `return JSON.stringify(me.tasks[0] ?? null)`);
  const sab = await srv(page, `return st.sabotage.active`);
  const posAfter = await srv(page, `return me.pos`);
  const trace = await traceSince(page, mark);
  const credited = fix ? sab === null : before !== after;
  const moved = Math.hypot(posAfter.x - posBefore.x, posAfter.y - posBefore.y) > 0.05;
  const counts = {};
  for (const n of trace) if (!n.startsWith('step.')) counts[n] = (counts[n] ?? 0) + 1;
  rows.push({ kind, ok: closed && credited && !solveErr && !moved && fits, seed, secs: ((Date.now() - t0) / 1000).toFixed(1), fits, credited, moved, note: solveErr + (retried ? ` (E needed twice: ${retried})` : ''), sounds: counts });
  if (!closed) {
    await page.screenshot({ path: `${SHOTS}/task-${tag}-${kind}-stuck.png` });
    await page.keyboard.press('Escape');
    await sleep(400);
  }
}

for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.kind.padEnd(19)} ${r.secs ?? ''}s fits=${r.fits} credited=${r.credited} moved=${r.moved} ${r.note ?? ''}\n      ${JSON.stringify(r.sounds ?? {})}`);
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
