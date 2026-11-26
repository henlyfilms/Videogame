// @vitest-environment node
/**
 * Marion Mystery rules engine: roles, abilities and their edge cases, meetings
 * and votes, sabotage, every win condition, settings, hidden-information
 * projection, and fuzzed invariants.
 */
import { describe, expect, it } from 'vitest';
import { getMap } from '../../src/mystery/core/maps';
import { applyAction, createMatch, criticalFloor, taskProgress, tick, type Action, type MatchCtx, type PlayerSeed } from '../../src/mystery/core/match';
import { project } from '../../src/mystery/core/project';
import { assignRoles, maxMurderers, validateRoles } from '../../src/mystery/core/roles';
import { Rng } from '../../src/mystery/core/rng';
import { BASE_SPEED, decodeSettings, defaultSettings, encodeSettings, migrateSettings, PRESETS, sanitizeSettings, validateSettings, type Settings } from '../../src/mystery/core/settings';
import type { MatchState, RoleId } from '../../src/mystery/core/types';
import { randomCosmetics } from '../../src/mystery/characters/catalog';

function seeds(n: number): PlayerSeed[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, kind: 'bot', platform: 'bot', cosmetics: randomCosmetics(i + 1) }));
}

function setup(n: number, roles: Partial<Record<string, RoleId>>, over: Partial<Settings> = {}) {
  const settings = sanitizeSettings({ ...defaultSettings(), ...over });
  const ctx: MatchCtx = { map: getMap(settings.map), settings };
  const st = createMatch(seeds(n), ctx, 1234);
  // Force roles for deterministic scenarios.
  for (const p of Object.values(st.players)) {
    const r = roles[p.id] ?? 'crewmate';
    p.role = r;
    p.team = r === 'murderer' || r === 'accomplice' || r === 'poisoner' || r === 'seeker' ? 'murderers' : r === 'jester' || r === 'survivor' ? 'neutral' : 'crew';
    p.hasGun = r === 'sheriff';
    p.killCd = 0;
    p.gunCd = 0;
    p.abilityCd = 0;
  }
  // Skip intro and the start-of-match cooldowns.
  tick(st, ctx, 7);
  st.emergencyReadyAt = 0;
  st.sabotage.cooldown = 0;
  st.sabotage.doorCd = 0;
  expect(st.phase).toBe('play');
  return { st, ctx };
}

function place(st: MatchState, id: string, x: number, y: number) {
  st.players[id]!.pos = { x, y };
}

const ok = (st: MatchState, ctx: MatchCtx, id: string, a: Action) => {
  const r = applyAction(st, ctx, id, a);
  if (!r.ok) throw new Error(`${a.a} failed: ${r.reason}`);
};

describe('settings', () => {
  it('sanitizes hostile input, clamps numbers and enums', () => {
    const s = sanitizeSettings({ killCooldown: 9999, mode: 'nope', map: 'manor', roles: { murderer: { count: 99 } }, evil: 1, chat: 'yes' });
    expect(s.killCooldown).toBe(60);
    expect(s.mode).toBe('classic');
    expect(s.map).toBe('manor');
    expect(s.roles.murderer.count).toBe(10);
    expect((s as unknown as Record<string, unknown>).evil).toBeUndefined();
    expect(s.chat).toBe(true);
  });
  it('round-trips share codes and migrates v1', () => {
    const s = { ...defaultSettings(), killCooldown: 30, mode: 'lightsout' as const };
    expect(decodeSettings(encodeSettings(s))).toEqual(s);
    expect(decodeSettings('garbage!!')).toBeNull();
    const m = migrateSettings({ v: 1, sabCritical: false, sheriffMisfireDies: false });
    expect(m.sabMeltdown).toBe(false);
    expect(m.misfire).toBe('loseGun');
  });
  it('every preset produces valid settings for 12 players', () => {
    for (const p of PRESETS) {
      const s = sanitizeSettings(p.apply(defaultSettings()));
      expect(validateSettings(s, 12).ok, p.id).toBe(true);
    }
  });
});

describe('role assignment', () => {
  it('respects counts and the murderer cap for every lobby size 4–20 (fuzzed)', () => {
    const rng = new Rng(99);
    for (let n = 4; n <= 20; n++) {
      for (let trial = 0; trial < 25; trial++) {
        const s = defaultSettings();
        for (const r of Object.keys(s.roles) as RoleId[]) s.roles[r] = { count: rng.int(3), chance: rng.pick([0, 50, 100]) };
        s.roles.murderer.count = 1 + rng.int(4);
        const ids = Array.from({ length: n }, (_, i) => `x${i}`);
        const out = assignRoles(ids, s.roles, 'classic', trial * 31 + n);
        expect(Object.keys(out)).toHaveLength(n);
        const team = Object.values(out).filter((r) => r === 'murderer' || r === 'poisoner' || r === 'accomplice').length;
        expect(team).toBeLessThanOrEqual(maxMurderers(n));
        expect(Object.values(out).some((r) => r === 'murderer' || r === 'poisoner')).toBe(true);
        // Deterministic per seed.
        expect(assignRoles(ids, s.roles, 'classic', trial * 31 + n)).toEqual(out);
      }
    }
  });
  it('validation flags impossible tables', () => {
    const s = defaultSettings();
    s.roles.murderer.count = 5;
    expect(validateRoles(s.roles, 6, 'classic').ok).toBe(false);
    expect(validateRoles(s.roles, 3, 'classic').errors.join()).toMatch(/4 players/);
  });
  it('hide & seek assigns seekers and hiders', () => {
    const out = assignRoles(['a', 'b', 'c', 'd', 'e', 'f'], defaultSettings().roles, 'hideseek', 3, { seekers: 2 });
    expect(Object.values(out).filter((r) => r === 'seeker')).toHaveLength(2);
    expect(Object.values(out).filter((r) => r === 'hider')).toHaveLength(4);
  });
});

describe('combat', () => {
  it('knife kill leaves a body, snaps the killer and respects cooldown/range/teammates', () => {
    const { st, ctx } = setup(6, { p0: 'murderer', p1: 'murderer' });
    place(st, 'p0', 62, 38);
    place(st, 'p2', 63, 38);
    place(st, 'p1', 61, 38);
    expect(applyAction(st, ctx, 'p0', { a: 'kill', target: 'p1' }).ok).toBe(false); // teammate
    ok(st, ctx, 'p0', { a: 'kill', target: 'p2' });
    expect(st.players.p2!.alive).toBe(false);
    expect(st.bodies).toHaveLength(1);
    expect(st.players.p0!.pos).toEqual({ x: 63, y: 38 });
    place(st, 'p3', 63.5, 38);
    expect(applyAction(st, ctx, 'p0', { a: 'kill', target: 'p3' })).toMatchObject({ ok: false, reason: 'cooldown' });
    st.players.p0!.killCd = 0;
    place(st, 'p3', 70, 38);
    expect(applyAction(st, ctx, 'p0', { a: 'kill', target: 'p3' })).toMatchObject({ ok: false, reason: 'out of range' });
  });
  it('medic shield blocks a knife and a gun, then breaks', () => {
    const { st, ctx } = setup(7, { p0: 'murderer', p1: 'medic', p2: 'sheriff' });
    place(st, 'p1', 62, 38);
    place(st, 'p3', 63, 38);
    ok(st, ctx, 'p1', { a: 'shield', target: 'p3' });
    place(st, 'p0', 62.5, 38.5);
    ok(st, ctx, 'p0', { a: 'kill', target: 'p3' });
    expect(st.players.p3!.alive).toBe(true);
    expect(st.pending.some((e) => e.type === 'shield.hit')).toBe(true);
    // Shield is gone now; a second attempt (after cooldown) kills.
    st.players.p0!.killCd = 0;
    ok(st, ctx, 'p0', { a: 'kill', target: 'p3' });
    expect(st.players.p3!.alive).toBe(false);
  });
  it('sheriff hit kills a murderer; misfire rules: sheriffDies / bothDie / loseGun', () => {
    for (const misfire of ['sheriffDies', 'bothDie', 'loseGun'] as const) {
      const { st, ctx } = setup(8, { p0: 'murderer', p1: 'sheriff' }, { misfire });
      place(st, 'p1', 62, 38);
      place(st, 'p3', 64, 38);
      ok(st, ctx, 'p1', { a: 'shoot', target: 'p3' });
      if (misfire === 'sheriffDies') expect([st.players.p1!.alive, st.players.p3!.alive]).toEqual([false, true]);
      if (misfire === 'bothDie') expect([st.players.p1!.alive, st.players.p3!.alive]).toEqual([false, false]);
      if (misfire === 'loseGun') expect([st.players.p1!.alive, st.players.p1!.hasGun]).toEqual([true, false]);
    }
    const { st, ctx } = setup(8, { p0: 'murderer', p1: 'sheriff' });
    place(st, 'p1', 62, 38);
    place(st, 'p0', 65, 38);
    ok(st, ctx, 'p1', { a: 'shoot', target: 'p0' });
    expect(st.players.p0!.alive).toBe(false);
  });
  it('sheriff death drops the gun; a crewmate picks it up as Hero; murderers cannot', () => {
    const { st, ctx } = setup(8, { p0: 'murderer', p1: 'sheriff' });
    place(st, 'p0', 62, 38);
    place(st, 'p1', 63, 38);
    ok(st, ctx, 'p0', { a: 'kill', target: 'p1' });
    expect(st.gunDrop).not.toBeNull();
    expect(applyAction(st, ctx, 'p0', { a: 'gun.pickup' }).ok).toBe(false);
    place(st, 'p4', st.gunDrop!.x + 0.5, st.gunDrop!.y);
    ok(st, ctx, 'p4', { a: 'gun.pickup' });
    expect(st.players.p4!.hasGun && st.players.p4!.isHero).toBe(true);
    expect(st.gunDrop).toBeNull();
  });
  it('poison kills after the delay — or as a meeting begins', () => {
    const { st, ctx } = setup(8, { p0: 'poisoner' }, { poisonDelay: 5 });
    place(st, 'p0', 62, 38);
    place(st, 'p2', 63, 38);
    place(st, 'p3', 63, 39);
    ok(st, ctx, 'p0', { a: 'poison', target: 'p2' });
    tick(st, ctx, 2);
    expect(st.players.p2!.alive).toBe(true);
    tick(st, ctx, 3.5);
    expect(st.players.p2!.alive).toBe(false);
    st.players.p0!.killCd = 0;
    place(st, 'p0', 62, 39);
    ok(st, ctx, 'p0', { a: 'poison', target: 'p3' });
    const e = ctx.map.emergency!;
    place(st, 'p5', e.x + 1, e.y);
    ok(st, ctx, 'p5', { a: 'emergency' });
    expect(st.phase).toBe('meeting');
    expect(st.players.p3!.alive).toBe(false);
  });
  it('a thrown knife flies and hits the first crewmate in line', () => {
    const { st, ctx } = setup(8, { p0: 'murderer' });
    place(st, 'p0', 56, 40);
    place(st, 'p2', 60, 40);
    ok(st, ctx, 'p0', { a: 'throw', dir: 0 });
    for (let i = 0; i < 20; i++) tick(st, ctx, 1 / 30);
    expect(st.players.p2!.alive).toBe(false);
  });
});

describe('meetings and votes', () => {
  function toVote(n: number, roles: Partial<Record<string, RoleId>>, over: Partial<Settings> = {}) {
    const r = setup(n, roles, { discussionTime: 0, ...over });
    const e = r.ctx.map.emergency!;
    place(r.st, 'p3', e.x + 1, e.y);
    ok(r.st, r.ctx, 'p3', { a: 'emergency' });
    expect(r.st.meeting!.stage).toBe('vote');
    return r;
  }
  it('majority ejects; confirm ejects reveals the role; votes are hidden until reveal', () => {
    const { st, ctx } = toVote(10, { p0: 'murderer', p1: 'murderer' });
    for (let i = 2; i < 10; i++) ok(st, ctx, `p${i}`, { a: 'vote', target: 'p0' });
    const mid = project(st, ctx, 'p5', { chatSince: 0 });
    expect(mid.meeting!.votes).toBeNull();
    ok(st, ctx, 'p0', { a: 'vote', target: 'skip' });
    ok(st, ctx, 'p1', { a: 'vote', target: 'skip' });
    expect(st.meeting!.stage).toBe('reveal');
    tick(st, ctx, 5);
    expect(st.phase).toBe('eject');
    expect(st.lastEject!.ejectedId).toBe('p0');
    expect(st.lastEject!.role).toBe('murderer');
  });
  it('ties and skips eject nobody; ghosts cannot vote', () => {
    const { st, ctx } = toVote(6, { p0: 'murderer' });
    st.players.p5!.alive = false;
    expect(applyAction(st, ctx, 'p5', { a: 'vote', target: 'p0' }).ok).toBe(false);
    ok(st, ctx, 'p0', { a: 'vote', target: 'p1' });
    ok(st, ctx, 'p1', { a: 'vote', target: 'p0' });
    ok(st, ctx, 'p2', { a: 'vote', target: 'skip' });
    ok(st, ctx, 'p3', { a: 'vote', target: 'skip' });
    ok(st, ctx, 'p4', { a: 'vote', target: 'p0' });
    tick(st, ctx, 0.1);
    tick(st, ctx, 5);
    expect(st.lastEject!.ejectedId).toBeNull();
    expect(st.lastEject!.tie).toBe(true);
  });
  it('mayor vote counts double, triple after reveal', () => {
    const { st, ctx } = toVote(6, { p0: 'murderer', p1: 'mayor' });
    ok(st, ctx, 'p1', { a: 'mayor.reveal' });
    ok(st, ctx, 'p1', { a: 'vote', target: 'p0' });
    ok(st, ctx, 'p2', { a: 'vote', target: 'p3' });
    ok(st, ctx, 'p3', { a: 'vote', target: 'p2' });
    for (const id of ['p0', 'p4']) ok(st, ctx, id, { a: 'vote', target: 'skip' });
    ok(st, ctx, 'p5', { a: 'vote', target: 'p2' });
    tick(st, ctx, 5);
    expect(st.lastEject!.tally.p0).toBe(3);
    expect(st.lastEject!.ejectedId).toBe('p0');
  });
  it('the Jester wins when voted out', () => {
    const { st, ctx } = toVote(8, { p0: 'murderer', p1: 'jester' });
    for (let i = 0; i < 8; i++) ok(st, ctx, `p${i}`, { a: 'vote', target: i === 1 ? 'skip' : 'p1' });
    tick(st, ctx, 5);
    expect(st.phase).toBe('ended');
    expect(st.result!.reason).toBe('jester');
    expect(st.result!.winners).toEqual(['p1']);
  });
  it('emergency button respects uses, cooldown and critical sabotage', () => {
    const { st, ctx } = setup(6, { p0: 'murderer' }, { emergencyMeetings: 1 });
    const e = ctx.map.emergency!;
    place(st, 'p0', 10, 10);
    ok(st, ctx, 'p0', { a: 'sabotage', kind: 'meltdown' });
    place(st, 'p2', e.x + 1, e.y);
    expect(applyAction(st, ctx, 'p2', { a: 'emergency' })).toMatchObject({ ok: false, reason: 'emergency in progress' });
  });
});

describe('sabotage', () => {
  it('lights dims crew vision but not murderers; fixing restores it', () => {
    const { st, ctx } = setup(6, { p0: 'murderer' });
    ok(st, ctx, 'p0', { a: 'sabotage', kind: 'lights' });
    const crew = project(st, ctx, 'p2', { chatSince: 0 });
    expect(crew.sabotage.active).toBe('lights');
    expect(crew.sabotage.cooldown).toBeUndefined(); // crew never sees cooldowns
    const panel = ctx.map.def.stations.find((s) => s.kind === 'lightsPanel')!;
    place(st, 'p2', panel.x + 0.8, panel.y);
    ok(st, ctx, 'p2', { a: 'fix.done', station: panel.id });
    expect(st.sabotage.active).toBeNull();
  });
  it('critical needs two holders at once, otherwise murderers win when the timer ends', () => {
    const { st, ctx } = setup(8, { p0: 'murderer' });
    ok(st, ctx, 'p0', { a: 'sabotage', kind: 'meltdown' });
    expect(st.sabotage.timer).toBeGreaterThanOrEqual(criticalFloor(ctx.map));
    const a = ctx.map.def.stations.find((s) => s.kind === 'meltdownA')!;
    const b = ctx.map.def.stations.find((s) => s.kind === 'meltdownB')!;
    place(st, 'p2', a.x + 0.8, a.y);
    place(st, 'p3', b.x + 0.8, b.y);
    ok(st, ctx, 'p2', { a: 'fix', station: a.id, on: true });
    tick(st, ctx, 2);
    expect(st.sabotage.active).toBe('meltdown');
    ok(st, ctx, 'p3', { a: 'fix', station: b.id, on: true });
    tick(st, ctx, 1.2);
    expect(st.sabotage.active).toBeNull();
    // Unfixed critical → murderers win.
    st.sabotage.cooldown = 0;
    ok(st, ctx, 'p0', { a: 'sabotage', kind: 'pressure' });
    for (let i = 0; i < 200 && st.phase !== 'ended'; i++) tick(st, ctx, 1);
    expect(st.result!.reason).toBe('critical');
  });
  it('a critical countdown leaves time to walk from one of its stations to the other', () => {
    for (const id of ['hq', 'greenhouse', 'express', 'manor'] as const) {
      const m = getMap(id);
      for (const kind of ['meltdown', 'pressure'] as const) {
        const a = m.def.stations.find((s) => s.kind === `${kind}A`)!;
        const b = m.def.stations.find((s) => s.kind === `${kind}B`)!;
        expect(criticalFloor(m, kind)).toBeGreaterThanOrEqual(criticalFloor(m));
        // Straight-line distance is a lower bound on the walk.
        expect(criticalFloor(m, kind)).toBeGreaterThan(Math.hypot(a.x - b.x, a.y - b.y) / BASE_SPEED);
      }
    }
  });
  it('doors close for a while and block movement', () => {
    const { st, ctx } = setup(6, { p0: 'murderer' });
    ok(st, ctx, 'p0', { a: 'sabotage', kind: 'doors', room: 'command' });
    expect(Object.keys(st.sabotage.closedDoors).length).toBeGreaterThan(0);
    tick(st, ctx, 11);
    expect(Object.keys(st.sabotage.closedDoors)).toHaveLength(0);
  });
});

describe('tasks and win conditions', () => {
  it('server rejects too-fast or far task completions; finishing all tasks wins for crew', () => {
    const { st, ctx } = setup(5, { p0: 'murderer' }, { tasksCommon: 0, tasksShort: 1, tasksLong: 0 });
    const p = st.players.p1!;
    const sid = p.tasks[0]!.stations[0]!;
    const stn = ctx.map.stationById.get(sid)!;
    place(st, 'p1', stn.x + 0.6, stn.y);
    ok(st, ctx, 'p1', { a: 'task.open', station: sid });
    expect(applyAction(st, ctx, 'p1', { a: 'task.done', station: sid })).toMatchObject({ ok: false, reason: 'too fast' });
    tick(st, ctx, 7);
    ok(st, ctx, 'p1', { a: 'task.done', station: sid });
    expect(p.tasks[0]!.done).toBe(true);
    for (const id of ['p2', 'p3', 'p4']) for (const t of st.players[id]!.tasks) {
      t.step = t.stations.length;
      t.done = true;
    }
    tick(st, ctx, 0.1);
    expect(st.result?.reason).toBe('tasks');
  });
  it('murderers win at parity; crew wins when every killer is gone', () => {
    const a = setup(4, { p0: 'murderer' });
    a.st.players.p1!.alive = false;
    a.st.players.p2!.alive = false;
    tick(a.st, a.ctx, 0.1);
    expect(a.st.result?.reason).toBe('parity');
    const b = setup(6, { p0: 'murderer', p1: 'accomplice' });
    b.st.players.p0!.alive = false;
    tick(b.st, b.ctx, 0.1);
    expect(b.st.result?.reason).toBe('murderers-eliminated');
  });
  it('timer outcomes: murderers / crew / draw', () => {
    for (const timerOutcome of ['murderers', 'crew', 'draw'] as const) {
      const { st, ctx } = setup(6, { p0: 'murderer' }, { durationMin: 1, timerOutcome });
      for (let i = 0; i < 70 && st.phase !== 'ended'; i++) tick(st, ctx, 1);
      expect(st.result!.reason).toBe('timer');
      expect(st.result!.winningTeam).toBe(timerOutcome === 'draw' ? 'draw' : timerOutcome);
    }
  });
  it('survivor wins alongside whoever wins if alive', () => {
    const { st, ctx } = setup(6, { p0: 'murderer', p5: 'survivor' });
    st.players.p0!.alive = false;
    tick(st, ctx, 0.1);
    expect(st.result!.winners).toContain('p5');
  });
  it('task bar ignores murderer fake tasks and respects ghost tasks', () => {
    const { st, ctx } = setup(6, { p0: 'murderer' }, { ghostTasks: false });
    const before = taskProgress(st, ctx).total;
    st.players.p2!.alive = false;
    expect(taskProgress(st, ctx).total).toBeLessThan(before);
  });
});

describe('modes', () => {
  it('Lights Out: flashlight battery drains, recharges at stations; blackout kills beams in a room', () => {
    const { st, ctx } = setup(6, { p0: 'murderer' }, { mode: 'lightsout', batterySeconds: 30 });
    place(st, 'p2', 40, 25);
    tick(st, ctx, 10);
    expect(st.players.p2!.battery).toBeLessThan(0.8);
    const r = ctx.map.def.stations.find((s) => s.kind === 'recharge')!;
    place(st, 'p2', r.x + 0.5, r.y);
    const b = st.players.p2!.battery;
    tick(st, ctx, 2);
    expect(st.players.p2!.battery).toBeGreaterThan(b);
    place(st, 'p0', 62, 40);
    place(st, 'p3', 63, 40);
    ok(st, ctx, 'p0', { a: 'blackout' });
    expect(st.players.p3!.blackoutUntil).toBeGreaterThan(st.t);
  });
  it('Lights Out hides players outside the beam even nearby; dread rises near a killer', () => {
    const { st, ctx } = setup(6, { p0: 'murderer' }, { mode: 'lightsout' });
    place(st, 'p2', 53, 38);
    st.players.p2!.facing = 0; // beam points +x
    place(st, 'p3', 53, 41.5); // 3.5 m to the side, out of the beam and outside ambient radius
    st.players.p3!.flashlightOn = false;
    for (const id of ['p0', 'p1', 'p4', 'p5']) place(st, id, 110, 80);
    const s = project(st, ctx, 'p2', { chatSince: 0 });
    expect(s.players.find((p) => p.id === 'p3')!.pos).toBeUndefined();
    place(st, 'p3', 57, 38); // in the beam
    expect(project(st, ctx, 'p2', { chatSince: 0 }).players.find((p) => p.id === 'p3')!.pos).toBeDefined();
    place(st, 'p0', 53, 35.5);
    expect(project(st, ctx, 'p2', { chatSince: 0 }).you.dread).toBeGreaterThan(0.3);
  });
  it('Hide & Seek: seeker frozen during hide time; tasks shorten the clock; hiders win at zero', () => {
    const settings = sanitizeSettings({ ...defaultSettings(), mode: 'hideseek', durationMin: 1, hnsHideTime: 10 });
    const ctx: MatchCtx = { map: getMap('hq'), settings };
    const st = createMatch(seeds(6), ctx, 5);
    tick(st, ctx, 7);
    const seeker = Object.values(st.players).find((p) => p.role === 'seeker')!;
    const hider = Object.values(st.players).find((p) => p.role === 'hider')!;
    hider.pos = { x: seeker.pos.x + 0.8, y: seeker.pos.y };
    expect(applyAction(st, ctx, seeker.id, { a: 'kill', target: hider.id }).ok).toBe(false);
    const roles = project(st, ctx, hider.id, { chatSince: 0 }).players.find((p) => p.id === seeker.id)!.role;
    expect(roles).toBe('seeker');
    for (let i = 0; i < 80 && st.phase !== 'ended'; i++) tick(st, ctx, 1);
    expect(st.result!.reason).toBe('hiders-survived');
  });
});

describe('hidden information', () => {
  it('crew never sees roles, far positions, cooldowns or private events', () => {
    const { st, ctx } = setup(10, { p0: 'murderer', p1: 'murderer', p2: 'medic' });
    place(st, 'p3', 10, 10);
    place(st, 'p0', 110, 80);
    const s = project(st, ctx, 'p3', { chatSince: 0 });
    for (const p of s.players) if (p.id !== 'p3') expect(p.role).toBeUndefined();
    expect(s.players.find((p) => p.id === 'p0')!.pos).toBeUndefined();
    expect(s.stats.murderers).toBeUndefined();
    const m = project(st, ctx, 'p0', { chatSince: 0 });
    expect(m.players.find((p) => p.id === 'p1')!.role).toBe('murderer');
    expect(m.stats.murderers).toBeDefined();
    expect(m.stats.crew).toBeUndefined();
  });
  it('dead players look alive to the living until discovered', () => {
    const { st, ctx } = setup(8, { p0: 'murderer' });
    place(st, 'p0', 62, 38);
    place(st, 'p2', 63, 38);
    ok(st, ctx, 'p0', { a: 'kill', target: 'p2' });
    st.pending = [];
    place(st, 'p5', 10, 10);
    const far = project(st, ctx, 'p5', { chatSince: 0 });
    expect(far.players.find((p) => p.id === 'p2')!.alive).toBe(true);
  });
  it('agents and ghosts: ghosts see everything; ghost chat is hidden from the living', () => {
    const { st, ctx } = setup(6, { p0: 'murderer' });
    st.players.p4!.alive = false;
    const g = project(st, ctx, 'p4', { chatSince: 0 });
    expect(g.players.every((p) => p.pos)).toBe(true);
    ok(st, ctx, 'p4', { a: 'chat', text: 'boo' });
    expect(project(st, ctx, 'p2', { chatSince: 0 }).chat.some((c) => c.text === 'boo')).toBe(false);
    expect(project(st, ctx, 'p4', { chatSince: 0 }).chat.some((c) => c.text === 'boo')).toBe(true);
  });
});

describe('fuzz: random action streams keep invariants', () => {
  it('dead players cannot act, cooldowns hold, the match ends with exactly one result', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rng = new Rng(seed);
      const settings = sanitizeSettings({ ...defaultSettings(), mode: rng.pick(['classic', 'lightsout']), map: rng.pick(['hq', 'greenhouse', 'express', 'manor']), durationMin: 3 });
      const ctx: MatchCtx = { map: getMap(settings.map), settings };
      const n = 4 + rng.int(17);
      const st = createMatch(seeds(n), ctx, seed);
      const ids = Object.keys(st.players);
      const kinds = ['move', 'kill', 'shoot', 'report', 'emergency', 'vote', 'sabotage', 'vent.enter', 'chat', 'task.open', 'shield', 'flashlight'];
      for (let step = 0; step < 6000 && st.phase !== 'ended'; step++) {
        const id = rng.pick(ids);
        const p = st.players[id]!;
        const wasAlive = p.alive;
        const target = rng.pick(ids);
        const k = rng.pick(kinds);
        const act: Action =
          k === 'move'
            ? { a: 'move', x: p.pos.x + (rng.next() - 0.5) * 4, y: p.pos.y + (rng.next() - 0.5) * 4, facing: rng.next() * 6, seq: step + 1 }
            : k === 'vote'
              ? { a: 'vote', target: rng.next() < 0.3 ? 'skip' : target }
              : k === 'sabotage'
                ? { a: 'sabotage', kind: rng.pick(['lights', 'comms', 'meltdown', 'pressure', 'doors'] as const), room: 'command' }
                : k === 'chat'
                  ? { a: 'chat', text: 'hi' }
                  : k === 'task.open'
                    ? { a: 'task.open', station: rng.pick(ctx.map.def.stations).id }
                    : k === 'vent.enter'
                      ? { a: 'vent.enter', vent: rng.pick(ctx.map.def.vents).id }
                      : k === 'flashlight'
                        ? { a: 'flashlight', on: rng.next() < 0.5 }
                        : ({ a: k, target, body: st.bodies[0]?.id ?? 'x' } as unknown as Action);
        const cdBefore = p.killCd;
        const r = applyAction(st, ctx, id, act);
        if (!wasAlive && (k === 'kill' || k === 'shoot' || k === 'emergency' || k === 'report' || k === 'vote')) expect(r.ok).toBe(false);
        if (k === 'kill' && r.ok) expect(cdBefore).toBeLessThanOrEqual(0);
        tick(st, ctx, 1 / 10);
      }
      for (let i = 0; i < 400 && st.phase !== 'ended'; i++) tick(st, ctx, 1);
      expect(st.phase).toBe('ended');
      expect(st.result).not.toBeNull();
      const ends = st.events.filter((e) => e.type === 'end');
      expect(ends).toHaveLength(1);
    }
  });
});
