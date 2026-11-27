// World interactions in Freeplay, driven through the real HUD / keys, with the
// sounds each one makes (from the sfx QA trace) and console errors.
//   node scripts/qa/interactions.mjs [scenario ...]
// Scenarios: crew, murderer, sheriff, roles, lightsout, hideseek, ghost, meeting
import { launch, openMystery, freeplay, srv, traceMark, traceSince, SHOTS, sleep } from './lib.mjs';

const want = process.argv.slice(2);
const browser = await launch();
const rows = [];
let page;
let errors;

async function fresh(opts) {
  if (page) await page.context().close();
  ({ page, errors } = await openMystery(browser, { label: opts.role }));
  await freeplay(page, opts);
}
/** Teleport (server + client prediction) next to a point. */
async function goTo(x, y) {
  const p = await srv(
    page,
    `const { nearestFree } = await imp('/src/mystery/core/map.ts');
     const p = nearestFree(room.ctx.map, { x: a.x, y: a.y });
     window.__mm.runtime.local.pos = { ...p };
     me.pos = p; me.corrected = me.inputSeq + 1; me.moving = false; return p;`,
    { x, y },
  );
  await sleep(350);
  return p;
}
const stationPos = (kind) => srv(page, `const s = room.ctx.map.def.stations.find((s) => s.kind === a); return s && { x: s.x, y: s.y, id: s.id };`, kind);
const bots = () => srv(page, `return Object.values(st.players).filter((p) => p.id !== pid).map((p) => ({ id: p.id, name: p.name, alive: p.alive, pos: p.pos, role: p.role }));`);
/** Put bot `id` right next to the player (server side). */
const botNextToMe = (id, dx = 0.9) => srv(page, `const b = st.players[a.id]; b.pos = { x: me.pos.x + a.dx, y: me.pos.y }; return b.pos;`, { id, dx });
const act = (a) => page.evaluate((x) => window.__mm.store.getState().act(x), a);
const snap = () => page.evaluate(() => window.__mm.store.getState().snap);

async function step(name, fn, expect = [], settle = 700) {
  const n = await traceMark(page);
  const e0 = errors.length;
  let err = '';
  try {
    await fn();
  } catch (e) {
    err = String(e.message ?? e).split('\n')[0];
  }
  await sleep(settle);
  const tr = (await traceSince(page, n)).filter((s) => !s.startsWith('step.') || name.includes('walk'));
  const uniqS = [...new Set(tr)];
  const cnt = (x) => tr.filter((y) => y === x).length;
  const shown = uniqS.map((x) => (cnt(x) > 1 ? `${x}x${cnt(x)}` : x));
  const missing = expect.filter((x) => !uniqS.some((s) => s === x || s.startsWith(x)));
  const ok = !err && missing.length === 0 && errors.length === e0;
  rows.push({ name, ok, sounds: uniqS, missing, err, errs: errors.slice(e0) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(42)} ${shown.join(' ')}${missing.length ? `  MISSING: ${missing.join(',')}` : ''}${err ? `  ERR: ${err}` : ''}${errors.length > e0 ? `  CONSOLE: ${errors.slice(e0).join(' | ')}` : ''}`);
}
const key = (k) => page.keyboard.press(k);
async function holdKey(k, ms) {
  await page.keyboard.down(k);
  await sleep(ms);
  await page.keyboard.up(k);
}
const run = (s) => !want.length || want.includes(s);

// ---------------------------------------------------------------- crewmate
if (run('crew')) {
  await fresh({ map: 'hq', mode: 'classic', role: 'crewmate' });
  await step('walk (footsteps)', () => holdKey('KeyD', 1200), ['step.']);
  await step('walk into a wall (bump)', async () => {
    // Stand one tile right of a west wall in the player's room, then walk left into it.
    const w = await srv(page, `const cm = room.ctx.map; const tx = Math.floor(me.pos.x), ty = Math.floor(me.pos.y);
      for (let x = tx; x > 0; x--) if (cm.cells[ty * cm.w + x - 1] !== cm.cells[ty * cm.w + tx]) return { x: x + 0.6, y: ty + 0.5 };
      return null;`);
    if (w) await goTo(w.x, w.y);
    await holdKey('KeyA', 1500);
  }, ['wall']);
  await step('ping: Z key', () => key('KeyZ'), ['ping']);
  await sleep(3200);
  await step('ping: middle click', async () => {
    await page.mouse.move(640, 300);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.up({ button: 'middle' });
  }, ['ping']);
  await sleep(3200);
  await step('ping: Ping button', () => page.locator('.mmh-actions button', { hasText: 'Ping' }).first().click(), ['ping']);
  await step('tablet open (Tab)', () => key('Tab'), ['ui.open']);
  await step('tablet close (Esc)', () => key('Escape'), ['ui.close']);
  await step('task list / stats (G)', () => key('KeyG'), ['ui.open']);
  await step('stats close (Esc)', () => key('Escape'), ['ui.close']);
  await step('settings menu (Esc) open', () => key('Escape'), ['ui.open']);
  await step('settings menu close', () => key('Escape'), ['ui.close']);
  await step('emote (T)', () => key('KeyT'), ['emote']);
  await step('task: open + close mid-task (Esc)', async () => {
    const t = (await snap()).you.tasks[0];
    const s = await srv(page, `const s = room.ctx.map.stationById.get(a); return { x: s.x, y: s.y };`, t.stations[t.step]);
    await goTo(s.x + 0.8, s.y);
    await key('KeyE');
    await page.waitForSelector('[data-task-modal]', { timeout: 3000 });
    await sleep(500);
    await key('Escape');
    await page.waitForSelector('[data-task-modal]', { state: 'detached', timeout: 3000 });
  }, ['task.open', 'task.close']);
  await step('task: close button (X)', async () => {
    await key('KeyE');
    await page.waitForSelector('[data-task-modal]', { timeout: 3000 });
    await sleep(400);
    await page.click('.mmg-close');
    await page.waitForSelector('[data-task-modal]', { state: 'detached', timeout: 3000 });
  }, ['task.open', 'task.close']);
  await step('task: backdrop click closes', async () => {
    await key('KeyE');
    await page.waitForSelector('[data-task-modal]', { timeout: 3000 });
    await sleep(400);
    await page.mouse.click(5, 795);
    await page.waitForSelector('[data-task-modal]', { state: 'detached', timeout: 3000 });
  }, ['task.close']);
  await step('emergency button → meeting', async () => {
    const e = await stationPos('emergency');
    await goTo(e.x + 0.9, e.y);
    await srv(page, `st.emergencyReadyAt = 0;`);
    await key('KeyE');
    await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'meeting', null, { timeout: 5000 });
  }, ['button', 'stinger.emergency'], 2500);
  await page.screenshot({ path: `${SHOTS}/int-meeting.png` });
  await step('meeting: wait for voting, pick + cancel', async () => {
    await srv(page, `st.meeting.stage = 'vote'; st.meeting.stageEnds = st.t + 60; st.phaseEnds = st.meeting.stageEnds;`);
    await sleep(600);
    const row = page.locator('.mmm-row:not([data-you="true"]):not([disabled])').first();
    await row.click();
    await page.click('button[aria-label="Cancel vote"]');
  }, ['ui.click', 'ui.back']);
  await step('meeting: chat message', async () => {
    await page.fill('input[aria-label="Meeting chat"]', 'hi');
    await page.click('button[aria-label="Send"]');
  }, ['ui.type', 'ui.chat']);
  await step('meeting: vote a player + stamp', async () => {
    await page.locator('.mmm-row:not([data-you="true"]):not([disabled])').first().click();
    await page.locator('.mmm-confirm button.mm-btn-gold').click();
  }, ['vote']);
  await step('meeting: others vote → reveal drumroll', async () => {
    // Bots (idle in practice) all vote for the same target to force an ejection.
    await srv(page, `const t = st.meeting.votes[pid]; for (const p of Object.values(st.players)) if (p.alive && !st.meeting.votes[p.id]) st.meeting.votes[p.id] = t; st.meeting.stage = 'reveal'; st.meeting.stageEnds = st.t + 3; st.phaseEnds = st.meeting.stageEnds;`);
  }, ['drumroll'], 1200);
  await step('ejection', () => page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'eject', null, { timeout: 8000 }), ['stinger.eject'], 1500);
  await page.screenshot({ path: `${SHOTS}/int-eject.png` });
  await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'play', null, { timeout: 20000 });
  await step('report a body', async () => {
    const b = (await bots()).find((x) => x.alive);
    await botNextToMe(b.id);
    await srv(page, `const { killPlayer } = await imp('/src/mystery/core/match.ts'); killPlayer(st, room.ctx, st.players[a], 'knife', null, true);`, b.id);
    await sleep(500);
    await key('KeyR');
    await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'meeting', null, { timeout: 5000 });
  }, ['stinger.report'], 2500);
  await step('meeting: skip vote + stamp', async () => {
    await srv(page, `st.meeting.stage = 'vote'; st.meeting.stageEnds = st.t + 60; st.phaseEnds = st.meeting.stageEnds;`);
    await sleep(600);
    await page.click('.mmm-skip');
    await page.locator('.mmm-confirm button.mm-btn-gold').click();
  }, ['vote']);
  await step('meeting: tie → no ejection', async () => {
    await srv(page, `const al = Object.values(st.players).filter((p) => p.alive && p.id !== pid); if (al[0]) st.meeting.votes[al[0].id] = al[1]?.id ?? 'skip'; if (al[1]) st.meeting.votes[al[1].id] = al[0].id; for (const p of al.slice(2)) st.meeting.votes[p.id] = 'skip'; st.meeting.stage = 'reveal'; st.meeting.stageEnds = st.t + 2; st.phaseEnds = st.meeting.stageEnds;`);
    await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'eject', null, { timeout: 8000 });
  }, ['drumroll', 'stinger.eject'], 1500);
  await page.screenshot({ path: `${SHOTS}/int-eject-tie.png` });
  await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'play', null, { timeout: 20000 });
}

// ---------------------------------------------------------------- murderer
if (run('murderer')) {
  await fresh({ map: 'hq', mode: 'classic', role: 'murderer' });
  await srv(page, `me.killCd = 0; st.sabotage.cooldown = 0;`);
  await step('kill (Q)', async () => {
    const b = (await bots()).find((x) => x.alive);
    await botNextToMe(b.id);
    await sleep(400);
    await key('KeyQ');
  }, ['kill']);
  await step('vent enter (V)', async () => {
    const v = await srv(page, `const v = room.ctx.map.def.vents[0]; me.ventCd = 0; return { x: v.x, y: v.y, id: v.id, links: v.links };`);
    await goTo(v.x + 0.6, v.y);
    await key('KeyV');
    await page.waitForFunction(() => window.__mm.store.getState().snap?.you.inVent, null, { timeout: 3000 });
  }, ['vent']);
  await step('vent move to linked vent', async () => {
    const v = await srv(page, `const cur = room.ctx.map.ventById.get(me.inVent); return cur.links[0];`);
    // In-vent arrows: the HUD/renderer offers them; drive the action directly if no button.
    const btn = page.locator('[aria-label^="Vent to"], [data-vent-link]').first();
    if (await btn.count()) await btn.click();
    else await act({ a: 'vent.move', vent: v });
  }, ['vent']);
  await step('vent exit (V)', () => key('KeyV'), ['vent']);
  await step('vent cooldown blocks re-entry', async () => {
    await key('KeyV');
    await sleep(300);
    const s = await snap();
    if (s.you.inVent) throw new Error('re-entered during cooldown');
  }, []);
  await step('sabotage map open (X)', () => key('KeyX'), ['ui.open']);
  await step('sabotage lights (card)', async () => {
    await page.locator('.mmh-sabcard', { hasText: /light/i }).first().click();
  }, ['lightsDown']);
  await step('fix lights (panel game)', async () => {
    const s = await stationPos('lightsPanel');
    await goTo(s.x + 0.8, s.y);
    await key('KeyE');
    await page.waitForSelector('[data-task-modal="lightsPanel"]', { timeout: 3000 });
    const seed = Number(await page.getAttribute('[data-task-modal]', 'data-task-seed'));
    const sw = await page.evaluate(async (sd) => (await import('/src/mystery/ui/tasks/LightsPanel.tsx')).genLightsPanel(sd), seed);
    let cur = 0;
    for (let i = 0; i < sw.length; i++) {
      if (sw[i]) continue;
      for (; cur < i; cur++) await key('ArrowRight');
      await key('Enter');
    }
    await page.waitForFunction(() => !window.__mm.store.getState().snap?.sabotage.active, null, { timeout: 8000 });
  }, ['task.good', 'task.solve', 'fixed']);
  await srv(page, `st.sabotage.cooldown = 0;`);
  await step('sabotage comms', async () => {
    await key('KeyX');
    await sleep(400);
    await page.locator('.mmh-sabcard', { hasText: /comm/i }).first().click();
  }, ['sabotage']);
  await srv(page, `st.sabotage.active = null; st.sabotage.cooldown = 0;`);
  await sleep(400);
  await step('sabotage critical (meltdown) + alarm', async () => {
    await key('KeyX');
    await sleep(400);
    await page.locator('.mmh-sabcard.crit').first().click();
    await sleep(1500);
  }, ['sabotage', 'alarm']);
  await page.screenshot({ path: `${SHOTS}/int-critical.png` });
  await step('critical: two-person fix (hold E + bot at B)', async () => {
    const kind = (await snap()).sabotage.active;
    const [A, B] = kind === 'meltdown' ? ['meltdownA', 'meltdownB'] : ['pressureA', 'pressureB'];
    const b = await stationPos(B);
    const bot = (await bots()).find((x) => x.alive);
    await srv(page, `const s = room.ctx.map.def.stations.find((x) => x.kind === a.B); const bt = st.players[a.bot]; const { nearestFree } = await imp('/src/mystery/core/map.ts'); bt.pos = nearestFree(room.ctx.map, { x: s.x + 0.6, y: s.y }); bt.fixing = s.id; bt.fixingAt = st.t;`, { B, bot: bot.id });
    const a = await stationPos(A);
    await goTo(a.x + 0.8, a.y);
    await page.keyboard.down('KeyE');
    await page.waitForFunction(() => !window.__mm.store.getState().snap?.sabotage.active, null, { timeout: 12000 });
    await page.keyboard.up('KeyE');
  }, ['fixed']);
  await srv(page, `st.sabotage.doorCd = 0;`);
  await step('sabotage doors (sabotage map room)', async () => {
    await key('KeyX');
    await sleep(400);
    const d = page.locator('.mmh-sabdoor, [aria-label^="Close doors"], button:has-text("Doors")').first();
    if (await d.count()) await d.click();
    else {
      const room = await srv(page, `return room.ctx.map.def.doors[0]?.room;`);
      await key('Escape');
      await act({ a: 'sabotage', kind: 'doors', room });
    }
  }, ['door']);
  await page.screenshot({ path: `${SHOTS}/int-doors.png` });
  await step('fake task (murderer)', async () => {
    const t = (await snap()).you.tasks.find((x) => !x.done);
    const s = await srv(page, `const s = room.ctx.map.stationById.get(a); return { x: s.x, y: s.y, kind: s.kind };`, t.stations[t.step]);
    await goTo(s.x + 0.8, s.y);
    await key('KeyE');
    await page.waitForSelector('[data-task-modal]', { timeout: 3000 });
    if (!(await page.locator('.mmg-chip-fake').count())) throw new Error('no FAKING chip');
    const { keyboardSolvers } = await import('./solvers.mjs');
    const seed = Number(await page.getAttribute('[data-task-modal]', 'data-task-seed'));
    await keyboardSolvers(page)[s.kind](seed);
    await page.waitForSelector('[data-task-modal]', { state: 'detached', timeout: 12000 });
  }, ['task.open', 'task.solve', 'taskDone']);
}

// ---------------------------------------------------------------- sheriff
if (run('sheriff')) {
  await fresh({ map: 'hq', mode: 'classic', role: 'sheriff' });
  const bs = await bots();
  await srv(page, `st.players[a].role = 'murderer'; st.players[a].team = 'murderers'; me.gunCd = 0; me.hasGun = true;`, bs[0].id);
  await step('sheriff shoots a murderer', async () => {
    await botNextToMe(bs[0].id, 2);
    await sleep(400);
    await page.locator('.mmh-actions button', { hasText: 'Shoot' }).first().click();
  }, ['shot', 'kill']);
  await srv(page, `me.gunCd = 0;`);
  await step('sheriff misfire on crew', async () => {
    await botNextToMe(bs[1].id, 2);
    await sleep(400);
    await page.locator('.mmh-actions button', { hasText: 'Shoot' }).first().click();
  }, ['shot', 'misfire']);
}

// ---------------------------------------------------------------- abilities
if (run('roles')) {
  await fresh({ map: 'hq', mode: 'classic', role: 'medic' });
  let bs = await bots();
  await step('medic shield', async () => {
    await botNextToMe(bs[0].id);
    await sleep(400);
    await page.locator('.mmh-actions button', { hasText: 'Shield' }).first().click();
  }, ['shield']);
  await step('medic vitals', () => page.locator('.mmh-actions button', { hasText: 'Vitals' }).first().click(), ['vitals']);
  await step('shield blocks a kill (shield.hit)', async () => {
    await srv(page, `const { applyAction } = await imp('/src/mystery/core/match.ts'); const k = st.players[a.k]; k.role = 'murderer'; k.team = 'murderers'; k.killCd = 0; k.pos = { x: st.players[a.t].pos.x + 0.5, y: st.players[a.t].pos.y }; return applyAction(st, room.ctx, a.k, { a: 'kill', target: a.t });`, { k: bs[1].id, t: bs[0].id });
  }, ['shield']);

  await fresh({ map: 'hq', mode: 'classic', role: 'tracker' });
  bs = await bots();
  await step('tracker track', async () => {
    await srv(page, `me.abilityCd = 0;`);
    await botNextToMe(bs[0].id);
    await sleep(400);
    await page.locator('.mmh-actions button', { hasText: 'Track' }).first().click();
  }, ['track']);

  await fresh({ map: 'hq', mode: 'classic', role: 'lookout' });
  await step('lookout place camera', () => page.locator('.mmh-actions button', { hasText: 'Place cam' }).first().click(), ['camera']);

  await fresh({ map: 'hq', mode: 'classic', role: 'engineer' });
  await step('engineer vent', async () => {
    const v = await srv(page, `const v = room.ctx.map.def.vents[0]; me.ventCd = 0; return { x: v.x, y: v.y };`);
    await goTo(v.x + 0.6, v.y);
    await key('KeyV');
    await sleep(500);
    await key('KeyV');
  }, ['vent']);
  await step('engineer remote fix', async () => {
    await srv(page, `st.sabotage.active = 'lights'; st.sabotage.startedAt = st.t;`);
    await sleep(500);
    await page.locator('.mmh-actions button', { hasText: 'Remote fix' }).first().click();
  }, ['fixed']);

  await fresh({ map: 'hq', mode: 'classic', role: 'poisoner' });
  bs = await bots();
  await step('poisoner poison', async () => {
    await srv(page, `me.killCd = 0;`);
    await botNextToMe(bs[0].id);
    await sleep(400);
    await key('KeyQ');
  }, ['poison']);

  await fresh({ map: 'hq', mode: 'classic', role: 'detective' });
  bs = await bots();
  await step('detective inspect body', async () => {
    await botNextToMe(bs[0].id);
    await srv(page, `const { killPlayer } = await imp('/src/mystery/core/match.ts'); killPlayer(st, room.ctx, st.players[a], 'knife', null, true);`, bs[0].id);
    await sleep(500);
    await key('KeyR');
  }, ['inspect']);

  await fresh({ map: 'hq', mode: 'classic', role: 'mayor' });
  await step('mayor reveal in meeting (double vote)', async () => {
    const e = await stationPos('emergency');
    await goTo(e.x + 0.9, e.y);
    await srv(page, `st.emergencyReadyAt = 0;`);
    await key('KeyE');
    await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'meeting', null, { timeout: 5000 });
    await sleep(1500);
    await page.locator('button', { hasText: 'Reveal yourself as Mayor' }).click();
  }, ['ui.click']);
}

// ---------------------------------------------------------------- lights out
if (run('lightsout')) {
  await fresh({ map: 'manor', mode: 'lightsout', role: 'crewmate' });
  await step('flashlight toggle (F)', () => key('KeyF'), ['flashlight.']);
  await step('flashlight toggle back (F)', () => key('KeyF'), ['flashlight.']);
  await step('battery pickup', async () => {
    const b = await srv(page, `if (!st.batteries.length) st.batteries.push({ id: 'qa-bat', pos: { ...me.pos } }); me.battery = 0.2; return st.batteries[0];`);
    await goTo(b.pos.x, b.pos.y);
    await sleep(300);
    const use = await page.locator('.mmh-actions > :last-child').textContent();
    await key('KeyE');
    await sleep(500);
    const bat = (await snap()).you.battery;
    if (bat < 0.5) throw new Error(`battery ${bat}, use button: ${use}`);
  }, ['pickup']);
  await step('low battery buzz', async () => {
    await srv(page, `me.battery = 0.1; me.flashlightOn = true;`);
    await sleep(4000);
  }, ['buzz']);
  await fresh({ map: 'manor', mode: 'lightsout', role: 'murderer' });
  await srv(page, `me.abilityCd = 0;`);
  await step('murderer blackout', () => page.locator('.mmh-actions button', { hasText: 'Blackout' }).first().click(), ['blackout']);
}

// ---------------------------------------------------------------- hide & seek
if (run('hideseek')) {
  await fresh({ map: 'hq', mode: 'hideseek', role: 'hider' });
  await step('hider vent (uses left)', async () => {
    const v = await srv(page, `const v = room.ctx.map.def.vents[0]; me.ventCd = 0; return { x: v.x, y: v.y, uses: me.ventUses };`);
    await goTo(v.x + 0.6, v.y);
    await key('KeyV');
    await sleep(500);
    await key('KeyV');
  }, ['vent']);
  await fresh({ map: 'hq', mode: 'hideseek', role: 'seeker' });
  await srv(page, `if (st.hns) st.hns.hideUntil = 0; me.killCd = 0;`);
  await step('seeker tags a hider', async () => {
    const b = (await bots()).find((x) => x.alive);
    await botNextToMe(b.id, 0.7);
    await sleep(400);
    await key('KeyQ');
  }, ['kill']);
}

// ---------------------------------------------------------------- ghost tasks
if (run('ghost')) {
  await fresh({ map: 'hq', mode: 'classic', role: 'crewmate' });
  await step('you die → ghost stinger', async () => {
    await srv(page, `const { killPlayer } = await imp('/src/mystery/core/match.ts'); killPlayer(st, room.ctx, me, 'knife', null, true); const ev = { t: st.t, type: 'kill', actor: null, target: pid, pos: { ...me.pos } }; st.events.push(ev); st.pending.push(ev);`);
  }, ['stinger.ghost'], 1800);
  await step('ghost finishes a task', async () => {
    const t = (await snap()).you.tasks.find((x) => !x.done);
    const s = await srv(page, `const s = room.ctx.map.stationById.get(a); return { x: s.x, y: s.y, kind: s.kind };`, t.stations[t.step]);
    await goTo(s.x + 0.8, s.y);
    await key('KeyE');
    await page.waitForSelector('[data-task-modal]', { timeout: 3000 });
    const { keyboardSolvers } = await import('./solvers.mjs');
    const seed = Number(await page.getAttribute('[data-task-modal]', 'data-task-seed'));
    await keyboardSolvers(page)[s.kind](seed);
    await page.waitForSelector('[data-task-modal]', { state: 'detached', timeout: 12000 });
  }, ['task.solve', 'task']);
}

const bad = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - bad.length}/${rows.length} passed; console errors: ${errors?.length ?? 0}`);
await browser.close();
