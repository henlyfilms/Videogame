/**
 * The authoritative match rules. `createMatch` builds state, `applyAction`
 * validates and applies one player action, `tick` advances time. Everything is
 * deterministic for a given seed + input stream (the RNG state lives in the
 * match state), so the same code runs on the server, in local play and in tests.
 */
import { MODES, type ModeCtx } from './modes';
import { dist, distanceField, INTERACT_RANGE, lineOfSight, moveCircle, nearestFree, roomAt, type CompiledMap } from './map';
import { assignRoles, ROLES, teamOf } from './roles';
import { Rng } from './rng';
import { BASE_SPEED, KILL_RANGE, type Settings } from './settings';
import { makeTaskAssigner, TASK_BY_ID } from './tasks';
import type {
  Body,
  ChatMsg,
  Cosmetics,
  DeathCause,
  EjectResult,
  FacilityKind,
  MatchEvent,
  MatchState,
  PlayerKind,
  PlayerState,
  Platform,
  RoleId,
  SabotageId,
  Team,
  Vec2,
  WinReason,
} from './types';
import { closedDoors } from './vision';
import { QUICK_CHAT } from './quickchat';

export interface MatchCtx extends ModeCtx {
  map: CompiledMap;
  settings: Settings;
}

export interface PlayerSeed {
  id: string;
  name: string;
  kind: PlayerKind;
  platform: Platform;
  cosmetics: Cosmetics;
}

export type Action =
  | { a: 'move'; x: number; y: number; facing: number; seq: number }
  | { a: 'task.open'; station: string }
  | { a: 'task.close' }
  | { a: 'task.done'; station: string }
  | { a: 'kill'; target: string }
  | { a: 'throw'; dir: number }
  | { a: 'shoot'; target: string }
  | { a: 'poison'; target: string }
  | { a: 'report'; body: string }
  | { a: 'emergency' }
  | { a: 'vent.enter'; vent: string }
  | { a: 'vent.move'; vent: string }
  | { a: 'vent.exit' }
  | { a: 'sabotage'; kind: SabotageId; room?: string }
  | { a: 'fix'; station: string; on: boolean }
  | { a: 'fix.done'; station: string }
  | { a: 'remotefix' }
  | { a: 'use'; facility: FacilityKind | null }
  | { a: 'vote'; target: string }
  | { a: 'chat'; text: string }
  | { a: 'quick'; id: string; target?: string }
  | { a: 'shield'; target: string }
  | { a: 'track'; target: string }
  | { a: 'inspect'; body: string }
  | { a: 'camera' }
  | { a: 'vitals' }
  | { a: 'blackout' }
  | { a: 'mayor.reveal' }
  | { a: 'flashlight'; on: boolean }
  | { a: 'gun.pickup' }
  | { a: 'battery.pickup'; id: string }
  | { a: 'emote'; id: string };

export type ActionResult = { ok: true } | { ok: false; reason: string };

const OK: ActionResult = { ok: true };
const no = (reason: string): ActionResult => ({ ok: false, reason });

export const INTRO_SECONDS = 6;
export const EJECT_SECONDS = 7;
export const REVEAL_SECONDS = 4;
export const DOOR_SECONDS = 10;
export const BLACKOUT_SECONDS = 8;
export const THROW_SPEED = 16;
export const THROW_RANGE = 10;
export const GUN_RANGE = 7;
export const REPORT_RANGE = 2.6;
export const VENT_RANGE = 1.3;
export const SEEKER_COOLDOWN = 2.5;

function emptyStats() {
  return {
    kills: 0,
    tasksDone: 0,
    meetingsCalled: 0,
    bodiesReported: 0,
    votesCast: 0,
    correctVotes: 0,
    sabotages: 0,
    fixes: 0,
    distance: 0,
    shots: 0,
    shotsHit: 0,
    ventUses: 0,
    survivedTo: 0,
  };
}

export function makePlayer(seed: PlayerSeed, pos: Vec2): PlayerState {
  return {
    id: seed.id,
    name: seed.name,
    kind: seed.kind,
    platform: seed.platform,
    cosmetics: seed.cosmetics,
    pos: { ...pos },
    facing: Math.PI / 2,
    moving: false,
    input: { x: 0, y: 0 },
    inputSeq: 0,
    alive: true,
    connected: true,
    role: 'crewmate',
    team: 'crew',
    tasks: [],
    activeTask: null,
    killCd: 0,
    gunCd: 0,
    abilityCd: 0,
    hasGun: false,
    isHero: false,
    shots: 0,
    inVent: null,
    ventCd: 0,
    emergencyLeft: 0,
    flashlightOn: true,
    battery: 1,
    blackoutUntil: 0,
    shieldTarget: null,
    shieldedBy: null,
    poisonedAt: null,
    poisonedBy: null,
    trackTarget: null,
    trackUntil: 0,
    mayorRevealed: false,
    remoteFixUsed: false,
    portableCam: null,
    inspected: [],
    clues: [],
    vitalsUntil: 0,
    using: null,
    fixing: null,
    fixingAt: 0,
    emote: null,
    lastRoom: null,
    diedAt: null,
    ejected: false,
    moveBudget: 0,
    corrected: 0,
    roundAbilityUsed: false,
    ventUses: 0,
    stats: emptyStats(),
  };
}

export function speedOf(st: MatchState, ctx: MatchCtx, p: PlayerState): number {
  let s = BASE_SPEED * ctx.settings.playerSpeed;
  if (!p.alive) s *= 1.25; // ghosts float a bit faster
  if (st.hns && p.role === 'seeker') s *= st.hns.finalAt ? ctx.settings.hnsSeekerBoost : 1.1;
  return s;
}

/** Spawn positions in a ring around the map's spawn point. */
function spawnRing(m: CompiledMap, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const r = n > 10 ? 2.8 : 2;
    out.push(nearestFree(m, { x: m.def.spawn.x + Math.cos(a) * r, y: m.def.spawn.y + Math.sin(a) * r }));
  }
  return out;
}

export function createMatch(players: PlayerSeed[], ctx: MatchCtx, seed: number): MatchState {
  const { settings, map } = ctx;
  const mode = MODES[settings.mode];
  const spawns = spawnRing(map, players.length);
  const st: MatchState = {
    seed,
    rngState: seed >>> 0,
    mapId: settings.map,
    modeId: settings.mode,
    phase: 'intro',
    t: 0,
    phaseEnds: INTRO_SECONDS,
    players: {},
    order: players.map((p) => p.id),
    bodies: [],
    projectiles: [],
    gunDrop: null,
    meeting: null,
    lastEject: null,
    sabotage: { active: null, startedAt: 0, timer: 0, progress: 0, cooldown: 10, closedDoors: {}, doorCd: 10 },
    chat: [],
    chatSeq: 0,
    events: [],
    pending: [],
    doorLog: [],
    result: null,
    timeLimit: settings.mode === 'hideseek' ? 0 : settings.durationMin * 60,
    emergencyReadyAt: settings.emergencyCooldown,
    batteries: [],
    hns: null,
    idSeq: 0,
    heat: {},
    meetingsHeld: 0,
    lastMeetingAt: -1,
    taskBarAtMeeting: 0,
    litLanterns: [],
    fixHold: 0,
    jesterWin: null,
  };
  const roles = assignRoles(
    players.map((p) => p.id),
    settings.roles,
    settings.mode,
    seed,
    { seekers: settings.hnsSeekers },
  );
  const assignTasks = makeTaskAssigner(
    map,
    settings.mode,
    { common: settings.tasksCommon, short: settings.tasksShort, long: settings.tasksLong },
    seed,
  );
  players.forEach((seedP, i) => {
    const p = makePlayer(seedP, spawns[i] ?? map.def.spawn);
    p.role = roles[p.id] ?? 'crewmate';
    p.team = teamOf(p.role);
    p.tasks = assignTasks(i);
    p.emergencyLeft = settings.emergencyMeetings;
    p.killCd = p.role === 'seeker' ? 0 : Math.min(10, settings.killCooldown);
    p.gunCd = 10;
    p.abilityCd = 10;
    p.hasGun = p.role === 'sheriff';
    p.flashlightOn = mode.flashlights && p.team !== 'murderers';
    p.battery = 1;
    p.facing = Math.atan2(map.def.spawn.y - p.pos.y, map.def.spawn.x - p.pos.x) + Math.PI;
    st.players[p.id] = p;
    st.heat[p.id] = [];
  });
  if (mode.flashlights && settings.batteryPickups > 0) {
    const rng = new Rng(seed ^ 0xbadcafe);
    const spots = rng.shuffle(map.def.stations.filter((s) => s.kind !== 'emergency').map((s) => ({ x: s.x, y: s.y })));
    st.batteries = spots.slice(0, settings.batteryPickups).map((s, i) => ({ id: `bat${i}`, pos: nearestFree(map, { x: s.x + 1.2, y: s.y + 0.6 }) }));
  }
  mode.setup?.(st, ctx);
  return st;
}

function emit(st: MatchState, ev: MatchEvent): void {
  st.pending.push(ev);
  st.events.push(ev);
  if (st.events.length > 2000) st.events.splice(0, st.events.length - 2000);
}

function nid(st: MatchState, prefix: string): string {
  st.idSeq++;
  return `${prefix}${st.idSeq}`;
}

export function alivePlayers(st: MatchState): PlayerState[] {
  return st.order.map((id) => st.players[id]!).filter((p) => p.alive);
}

function stationNear(ctx: MatchCtx, p: PlayerState, stationId: string, range = INTERACT_RANGE): boolean {
  const s = ctx.map.stationById.get(stationId);
  return !!s && dist(p.pos, s) <= range;
}

function nearestStationOfKind(ctx: MatchCtx, p: PlayerState, kind: string, range = INTERACT_RANGE) {
  let best = null as null | { id: string; d: number };
  for (const s of ctx.map.def.stations) {
    if (s.kind !== kind) continue;
    const d = dist(p.pos, s);
    if (d <= range && (!best || d < best.d)) best = { id: s.id, d };
  }
  return best;
}

const floorCache = new WeakMap<CompiledMap, number>();
/** Minimum critical countdown for a map: ~1.25x the walk from spawn to its farthest corner. */
export function criticalFloor(m: CompiledMap): number {
  let v = floorCache.get(m);
  if (v === undefined) {
    const d = distanceField(m, m.def.spawn);
    let max = 0;
    for (let i = 0; i < d.length; i++) if (d[i]! > max) max = d[i]!;
    v = Math.round((max / BASE_SPEED) * 1.25);
    floorCache.set(m, v);
  }
  return v;
}

export function isCritical(k: SabotageId | null): k is 'meltdown' | 'pressure' {
  return k === 'meltdown' || k === 'pressure';
}

/** Kill/eliminate a player. Leaves a body unless ejected. */
export function killPlayer(
  st: MatchState,
  ctx: MatchCtx,
  victim: PlayerState,
  cause: DeathCause,
  killerId: string | null,
  leaveBody = true,
): void {
  if (!victim.alive) return;
  victim.alive = false;
  victim.diedAt = st.t;
  victim.stats.survivedTo = st.t;
  victim.inVent = null;
  victim.activeTask = null;
  victim.using = null;
  victim.fixing = null;
  victim.poisonedAt = null;
  victim.flashlightOn = false;
  if (cause === 'ejected') victim.ejected = true;
  if (leaveBody && cause !== 'ejected' && cause !== 'disconnect') {
    const body: Body = {
      id: nid(st, 'b'),
      playerId: victim.id,
      pos: { ...victim.pos },
      diedAt: st.t,
      cause,
      killerId,
      room: roomAt(ctx.map, victim.pos),
    };
    st.bodies.push(body);
  }
  if (victim.hasGun) {
    victim.hasGun = false;
    if (ctx.settings.gunDrop && cause !== 'ejected') {
      st.gunDrop = { ...victim.pos };
      emit(st, { t: st.t, type: 'gun.drop', actor: victim.id, pos: { ...victim.pos } });
    }
  }
  // A medic's shield fades with them.
  if (victim.role === 'medic' && victim.shieldTarget) {
    const t = st.players[victim.shieldTarget];
    if (t && t.shieldedBy === victim.id) t.shieldedBy = null;
  }
  if (ctx.settings.killFlicker && MODES[st.modeId].flashlights && killerId && cause !== 'ejected') {
    emit(st, { t: st.t, type: 'flicker', pos: { ...victim.pos } });
  }
}

function tryShield(st: MatchState, attacker: PlayerState, target: PlayerState): boolean {
  if (!target.shieldedBy) return false;
  const medic = st.players[target.shieldedBy];
  target.shieldedBy = null;
  emit(st, { t: st.t, type: 'shield.hit', actor: attacker.id, target: target.id, data: { medic: medic?.id ?? null }, pos: { ...target.pos } });
  return true;
}

function canAct(st: MatchState, p: PlayerState): boolean {
  return st.phase === 'play' && p.alive && !p.inVent;
}

function frozenSeeker(st: MatchState, p: PlayerState): boolean {
  return !!st.hns && p.role === 'seeker' && st.t < st.hns.hideUntil;
}

// ---------------------------------------------------------------------------
// Meetings

function startMeeting(st: MatchState, ctx: MatchCtx, caller: PlayerState, bodyId: string | null): void {
  const s = ctx.settings;
  const body = bodyId ? st.bodies.find((b) => b.id === bodyId) : null;
  // Poison resolves as the meeting begins.
  for (const p of Object.values(st.players)) {
    if (p.alive && p.poisonedAt !== null) killPlayer(st, ctx, p, 'poison', p.poisonedBy, false);
  }
  st.phase = 'meeting';
  st.meetingsHeld++;
  st.lastMeetingAt = st.t;
  st.taskBarAtMeeting = taskProgress(st, ctx).value;
  st.meeting = {
    callerId: caller.id,
    bodyId: body?.id ?? null,
    victimId: body?.playerId ?? null,
    stage: s.discussionTime > 0 ? 'discuss' : 'vote',
    stageEnds: st.t + (s.discussionTime > 0 ? s.discussionTime : s.votingTime),
    votes: {},
    startedAt: st.t,
  };
  st.phaseEnds = st.meeting.stageEnds;
  st.bodies = [];
  st.projectiles = [];
  // All sabotage is cancelled by a meeting.
  st.sabotage.active = null;
  st.sabotage.closedDoors = {};
  st.sabotage.progress = 0;
  st.fixHold = 0;
  const seats = ctx.map.meetingSeats;
  st.order.forEach((id, i) => {
    const p = st.players[id]!;
    p.inVent = null;
    p.activeTask = null;
    p.using = null;
    p.fixing = null;
    p.moving = false;
    const seat = seats[i % Math.max(1, seats.length)] ?? ctx.map.def.spawn;
    p.pos = { ...seat };
    p.corrected = p.inputSeq + 1;
    if (ctx.map.emergency) p.facing = Math.atan2(ctx.map.emergency.y - seat.y, ctx.map.emergency.x - seat.x);
  });
  emit(st, {
    t: st.t,
    type: bodyId ? 'report' : 'emergency',
    actor: caller.id,
    target: body?.playerId,
    data: { room: body?.room ?? null },
  });
  emit(st, { t: st.t, type: 'meeting', actor: caller.id });
  pushSystemChat(st, bodyId ? `${caller.name} reported a body.` : `${caller.name} called an emergency meeting.`);
}

function voteWeight(_st: MatchState, ctx: MatchCtx, p: PlayerState): number {
  if (p.role !== 'mayor') return 1;
  return p.mayorRevealed && ctx.settings.mayorReveal ? 3 : 2;
}

function resolveVotes(st: MatchState, ctx: MatchCtx): void {
  const m = st.meeting!;
  const tally: Record<string, number> = {};
  for (const [voter, target] of Object.entries(m.votes)) {
    const p = st.players[voter];
    if (!p || !p.alive) continue;
    tally[target] = (tally[target] ?? 0) + voteWeight(st, ctx, p);
  }
  let top: string | null = null;
  let topN = 0;
  let tie = false;
  for (const [k, n] of Object.entries(tally)) {
    if (n > topN) {
      top = k;
      topN = n;
      tie = false;
    } else if (n === topN) tie = true;
  }
  const skipped = !top || top === 'skip';
  const ejected = !tie && !skipped && top ? st.players[top] ?? null : null;
  const res: EjectResult = {
    ejectedId: ejected?.id ?? null,
    tie,
    skipped: !tie && skipped,
    role: ejected && ctx.settings.confirmEjects ? ejected.role : null,
    team: ejected && ctx.settings.confirmEjects ? ejected.team : null,
    tally,
    votes: ctx.settings.anonymousVotes ? null : { ...m.votes },
  };
  // Vote accuracy stats.
  for (const [voter, target] of Object.entries(m.votes)) {
    const v = st.players[voter];
    const t = st.players[target];
    if (!v) continue;
    v.stats.votesCast++;
    if (v.team === 'crew' && t && t.team === 'murderers') v.stats.correctVotes++;
  }
  st.lastEject = res;
  if (ejected) {
    killPlayer(st, ctx, ejected, 'ejected', null, false);
    if (ejected.role === 'jester') st.jesterWin = ejected.id;
  }
  emit(st, { t: st.t, type: 'eject', target: ejected?.id, data: { tie, skipped: res.skipped } });
  st.meeting = null;
  st.phase = 'eject';
  st.phaseEnds = st.t + EJECT_SECONDS;
}

function endEject(st: MatchState, ctx: MatchCtx): void {
  st.phase = 'play';
  st.lastEject = null;
  st.emergencyReadyAt = st.t + ctx.settings.emergencyCooldown;
  for (const p of Object.values(st.players)) {
    p.killCd = p.role === 'seeker' ? SEEKER_COOLDOWN : ctx.settings.killCooldown;
    p.gunCd = Math.max(p.gunCd, 8);
    p.roundAbilityUsed = false;
    if (p.role === 'medic') {
      if (p.shieldTarget) {
        const t = st.players[p.shieldTarget];
        if (t && t.shieldedBy === p.id) t.shieldedBy = null;
      }
      p.shieldTarget = null;
    }
    if (p.role === 'tracker') p.abilityCd = Math.min(p.abilityCd, 5);
  }
  st.sabotage.cooldown = Math.max(st.sabotage.cooldown, 10);
}

export function pushSystemChat(st: MatchState, text: string): void {
  const msg: ChatMsg = { id: ++st.chatSeq, from: 'system', text, t: st.t, ghost: false };
  st.chat.push(msg);
  if (st.chat.length > 200) st.chat.splice(0, st.chat.length - 200);
}

// ---------------------------------------------------------------------------
// Tasks

export interface TaskProgress {
  value: number; // 0..1
  done: number;
  total: number;
  byLength: Record<'common' | 'short' | 'long', { done: number; total: number }>;
  byRoom: Record<string, { done: number; total: number }>;
}

/** Players whose tasks count toward the crew bar. */
function countsForBar(ctx: MatchCtx, p: PlayerState): boolean {
  if (p.team !== 'crew') return false;
  if (!p.alive && !ctx.settings.ghostTasks) return false;
  if (!p.connected && p.kind === 'human' && !p.alive) return false;
  return true;
}

export function taskProgress(st: MatchState, ctx: MatchCtx): TaskProgress {
  const out: TaskProgress = {
    value: 0,
    done: 0,
    total: 0,
    byLength: { common: { done: 0, total: 0 }, short: { done: 0, total: 0 }, long: { done: 0, total: 0 } },
    byRoom: {},
  };
  for (const p of Object.values(st.players)) {
    if (!countsForBar(ctx, p)) continue;
    for (const t of p.tasks) {
      const def = TASK_BY_ID[t.taskId];
      if (!def) continue;
      const steps = t.stations.length;
      out.total += steps;
      out.done += t.step;
      const bl = out.byLength[def.length];
      bl.total += steps;
      bl.done += t.step;
      t.stations.forEach((sid, i) => {
        const room = ctx.map.stationById.get(sid)?.room ?? 'unknown';
        const r = (out.byRoom[room] ??= { done: 0, total: 0 });
        r.total++;
        if (i < t.step) r.done++;
      });
    }
  }
  out.value = out.total ? out.done / out.total : 0;
  return out;
}

function nextStation(p: PlayerState, stationId: string) {
  return p.tasks.find((t) => !t.done && t.stations[t.step] === stationId) ?? null;
}

// ---------------------------------------------------------------------------
// Actions

export function applyAction(st: MatchState, ctx: MatchCtx, pid: string, act: Action): ActionResult {
  const p = st.players[pid];
  if (!p) return no('unknown player');
  const s = ctx.settings;
  const mode = MODES[st.modeId];
  if (st.phase === 'ended') return no('match over');
  switch (act.a) {
    case 'move': {
      if (!Number.isFinite(act.x) || !Number.isFinite(act.y) || !Number.isFinite(act.facing)) return no('bad move');
      if (act.seq <= p.inputSeq && p.inputSeq - act.seq < 1e6) return no('stale');
      p.inputSeq = act.seq;
      p.facing = act.facing;
      if (st.phase !== 'play' || p.inVent || frozenSeeker(st, p)) {
        p.moving = false;
        if (dist(act, p.pos) > 0.05) p.corrected = act.seq;
        return OK;
      }
      const dx = act.x - p.pos.x;
      const dy = act.y - p.pos.y;
      const want = Math.hypot(dx, dy);
      const allow = Math.min(want, p.moveBudget);
      const k = want > 0 ? allow / want : 0;
      // Ghosts pass through furniture but not out of the map.
      const next = moveCircle(ctx.map, p.pos, dx * k, dy * k, p.alive ? undefined : 0.05, p.alive ? closedDoors(st) : undefined);
      const moved = dist(next, p.pos);
      p.moveBudget -= moved;
      p.stats.distance += moved;
      p.moving = moved > 0.001;
      p.pos = next;
      if (dist(next, act) > 0.08) p.corrected = act.seq;
      if (p.using) {
        const near = nearestStationOfKind(ctx, p, p.using, INTERACT_RANGE + 0.6);
        if (!near && !(p.using === 'vitals' && p.vitalsUntil > st.t)) p.using = null;
      }
      if (p.fixing && !stationNear(ctx, p, p.fixing, INTERACT_RANGE + 0.6)) p.fixing = null;
      if (moved > 0.01) p.emote = null;
      return OK;
    }
    case 'task.open': {
      if (st.phase !== 'play') return no('not now');
      if (!p.alive && !s.ghostTasks) return no('ghost tasks off');
      if (p.inVent) return no('in vent');
      if (!stationNear(ctx, p, act.station)) return no('too far');
      const t = nextStation(p, act.station);
      if (!t) return no('no task here');
      p.activeTask = { stationId: act.station, openedAt: st.t };
      return OK;
    }
    case 'task.close':
      p.activeTask = null;
      return OK;
    case 'task.done': {
      if (st.phase !== 'play') return no('not now');
      if (!p.activeTask || p.activeTask.stationId !== act.station) return no('task not open');
      const t = nextStation(p, act.station);
      if (!t) return no('no task here');
      const def = TASK_BY_ID[t.taskId];
      if (!def) return no('unknown task');
      if (st.t - p.activeTask.openedAt < def.minTime) return no('too fast');
      if (!stationNear(ctx, p, act.station, INTERACT_RANGE + 0.6)) return no('too far');
      p.activeTask = null;
      if (p.team !== 'crew') return OK; // fake task: no effect
      t.step++;
      if (t.step >= t.stations.length) {
        t.done = true;
        p.stats.tasksDone++;
        if (st.hns && p.role === 'hider') st.hns.timer = Math.max(0, st.hns.timer - s.hnsTaskBonus);
      }
      const station = ctx.map.stationById.get(act.station);
      if (station?.kind === 'lightLantern' && !st.litLanterns.includes(act.station)) st.litLanterns.push(act.station);
      emit(st, {
        t: st.t,
        type: def.visual && s.visualTasks ? 'visual' : 'task',
        actor: p.id,
        pos: { ...p.pos },
        data: { task: def.id, done: t.done, station: act.station },
      });
      return OK;
    }
    case 'kill': {
      if (!canAct(st, p)) return no('cannot act');
      const role = ROLES[p.role];
      if (!role.canKill || p.role === 'poisoner') return no('cannot kill');
      if (frozenSeeker(st, p)) return no('still counting');
      if (p.killCd > 0) return no('cooldown');
      const t = st.players[act.target];
      if (!t || !t.alive || t.id === p.id || t.inVent) return no('bad target');
      if (t.team === 'murderers') return no('teammate');
      const range = st.hns ? 1.4 : KILL_RANGE[s.killDistance];
      if (dist(p.pos, t.pos) > range) return no('out of range');
      if (!lineOfSight(ctx.map, p.pos, t.pos, closedDoors(st))) return no('no line of sight');
      p.killCd = p.role === 'seeker' ? SEEKER_COOLDOWN : s.killCooldown;
      if (tryShield(st, p, t)) return OK;
      killPlayer(st, ctx, t, st.hns ? 'seeker' : 'knife', p.id, !st.hns);
      p.stats.kills++;
      if (!st.hns) {
        p.pos = { ...t.pos };
        p.corrected = p.inputSeq + 1;
      }
      emit(st, { t: st.t, type: 'kill', actor: p.id, target: t.id, pos: { ...t.pos }, data: { weapon: st.hns ? 'tag' : 'knife' } });
      return OK;
    }
    case 'throw': {
      if (!canAct(st, p)) return no('cannot act');
      if (p.role !== 'murderer' || !s.knifeThrow) return no('cannot throw');
      if (p.killCd > 0) return no('cooldown');
      if (!Number.isFinite(act.dir)) return no('bad dir');
      p.killCd = s.killCooldown;
      st.projectiles.push({
        id: nid(st, 'k'),
        ownerId: p.id,
        pos: { x: p.pos.x + Math.cos(act.dir) * 0.5, y: p.pos.y + Math.sin(act.dir) * 0.5 },
        dir: { x: Math.cos(act.dir), y: Math.sin(act.dir) },
        travelled: 0,
      });
      emit(st, { t: st.t, type: 'shot', actor: p.id, pos: { ...p.pos }, data: { weapon: 'throw', dir: act.dir } });
      return OK;
    }
    case 'shoot': {
      if (!canAct(st, p)) return no('cannot act');
      if (!p.hasGun) return no('no gun');
      if (p.gunCd > 0) return no('cooldown');
      const t = st.players[act.target];
      if (!t || !t.alive || t.id === p.id || t.inVent) return no('bad target');
      if (dist(p.pos, t.pos) > GUN_RANGE) return no('out of range');
      if (!lineOfSight(ctx.map, p.pos, t.pos, closedDoors(st))) return no('no line of sight');
      p.gunCd = s.gunCooldown;
      p.stats.shots++;
      emit(st, { t: st.t, type: 'shot', actor: p.id, target: t.id, pos: { ...p.pos }, data: { weapon: 'gun', dir: Math.atan2(t.pos.y - p.pos.y, t.pos.x - p.pos.x) } });
      if (tryShield(st, p, t)) return OK;
      if (t.team === 'murderers') {
        p.stats.shotsHit++;
        killPlayer(st, ctx, t, 'gun', p.id);
        emit(st, { t: st.t, type: 'kill', actor: p.id, target: t.id, pos: { ...t.pos }, data: { weapon: 'gun' } });
      } else {
        emit(st, { t: st.t, type: 'misfire', actor: p.id, target: t.id, pos: { ...p.pos }, data: { rule: s.misfire } });
        if (s.misfire === 'loseGun') {
          p.hasGun = false;
        } else {
          if (s.misfire === 'bothDie') {
            killPlayer(st, ctx, t, 'gun', p.id);
            emit(st, { t: st.t, type: 'kill', actor: p.id, target: t.id, pos: { ...t.pos }, data: { weapon: 'gun' } });
          }
          // Misfire: the gun is lost with the shooter (no drop).
          p.hasGun = false;
          killPlayer(st, ctx, p, 'misfire', null);
        }
      }
      return OK;
    }
    case 'poison': {
      if (!canAct(st, p)) return no('cannot act');
      if (p.role !== 'poisoner') return no('cannot poison');
      if (p.killCd > 0) return no('cooldown');
      const t = st.players[act.target];
      if (!t || !t.alive || t.team === 'murderers' || t.poisonedAt !== null) return no('bad target');
      if (dist(p.pos, t.pos) > KILL_RANGE[s.killDistance]) return no('out of range');
      p.killCd = s.killCooldown;
      if (tryShield(st, p, t)) return OK;
      t.poisonedAt = st.t;
      t.poisonedBy = p.id;
      emit(st, { t: st.t, type: 'poison', actor: p.id, target: t.id, pos: { ...t.pos } });
      return OK;
    }
    case 'report': {
      if (!canAct(st, p)) return no('cannot act');
      if (!mode.reports) return no('no reports in this mode');
      const b = st.bodies.find((x) => x.id === act.body);
      if (!b) return no('no body');
      if (dist(p.pos, b.pos) > REPORT_RANGE) return no('too far');
      if (!lineOfSight(ctx.map, p.pos, b.pos, closedDoors(st))) return no('no line of sight');
      p.stats.bodiesReported++;
      startMeeting(st, ctx, p, b.id);
      return OK;
    }
    case 'emergency': {
      if (!canAct(st, p)) return no('cannot act');
      if (!mode.meetings) return no('no meetings in this mode');
      if (p.emergencyLeft <= 0) return no('no meetings left');
      if (st.t < st.emergencyReadyAt) return no('button cooling down');
      if (isCritical(st.sabotage.active)) return no('emergency in progress');
      if (!nearestStationOfKind(ctx, p, 'emergency', INTERACT_RANGE * 1.4)) return no('too far');
      p.emergencyLeft--;
      p.stats.meetingsCalled++;
      startMeeting(st, ctx, p, null);
      return OK;
    }
    case 'vent.enter': {
      if (!canAct(st, p)) return no('cannot act');
      const role = ROLES[p.role];
      if (!role.canVent) return no('cannot vent');
      if (p.role === 'hider' && p.ventUses <= 0) return no('no vent uses left');
      if (p.ventCd > 0) return no('cooldown');
      const v = ctx.map.ventById.get(act.vent);
      if (!v || dist(p.pos, v) > VENT_RANGE) return no('too far');
      p.inVent = v.id;
      p.pos = { x: v.x, y: v.y };
      p.corrected = p.inputSeq + 1;
      p.activeTask = null;
      p.using = null;
      p.stats.ventUses++;
      if (p.role === 'hider') p.ventUses--;
      emit(st, { t: st.t, type: 'vent', actor: p.id, pos: { x: v.x, y: v.y }, data: { dir: 'in' } });
      return OK;
    }
    case 'vent.move': {
      if (st.phase !== 'play' || !p.alive || !p.inVent) return no('not in vent');
      const cur = ctx.map.ventById.get(p.inVent);
      if (!cur || !cur.links.includes(act.vent)) return no('not linked');
      const v = ctx.map.ventById.get(act.vent)!;
      p.inVent = v.id;
      p.pos = { x: v.x, y: v.y };
      p.corrected = p.inputSeq + 1;
      return OK;
    }
    case 'vent.exit': {
      if (!p.inVent) return no('not in vent');
      const v = ctx.map.ventById.get(p.inVent);
      p.inVent = null;
      p.ventCd = p.role === 'engineer' ? 6 : p.role === 'hider' ? 8 : 1.5;
      emit(st, { t: st.t, type: 'vent', actor: p.id, pos: v ? { x: v.x, y: v.y } : { ...p.pos }, data: { dir: 'out' } });
      return OK;
    }
    case 'sabotage': {
      if (st.phase !== 'play') return no('not now');
      if (!mode.sabotage) return no('no sabotage in this mode');
      if (!ROLES[p.role].canSabotage) return no('cannot sabotage');
      if (act.kind === 'doors') {
        if (!s.sabDoors) return no('disabled');
        if (st.sabotage.doorCd > 0) return no('cooldown');
        const doors = ctx.map.def.doors.filter((d) => d.room === act.room);
        if (!doors.length) return no('no doors');
        for (const d of doors) st.sabotage.closedDoors[d.id] = st.t + DOOR_SECONDS;
        st.sabotage.doorCd = 20;
        p.stats.sabotages++;
        emit(st, { t: st.t, type: 'sabotage', actor: p.id, data: { kind: 'doors', room: act.room ?? null } });
        return OK;
      }
      const enabled: Record<string, boolean> = {
        lights: s.sabLights,
        comms: s.sabComms,
        meltdown: s.sabMeltdown,
        pressure: s.sabPressure,
      };
      if (!enabled[act.kind]) return no('disabled');
      if (st.sabotage.active) return no('sabotage already active');
      if (st.sabotage.cooldown > 0) return no('cooldown');
      const need =
        act.kind === 'lights' ? ['lightsPanel'] : act.kind === 'comms' ? ['commsPanel'] : act.kind === 'meltdown' ? ['meltdownA', 'meltdownB'] : ['pressureA', 'pressureB'];
      if (!need.every((k) => ctx.map.def.stations.some((x) => x.kind === k))) return no('not on this map');
      st.sabotage.active = act.kind;
      st.sabotage.startedAt = st.t;
      st.sabotage.timer = isCritical(act.kind) ? Math.max(s.criticalTimer, criticalFloor(ctx.map)) : 0;
      st.sabotage.progress = 0;
      st.sabotage.cooldown = s.sabotageCooldown;
      st.fixHold = 0;
      p.stats.sabotages++;
      emit(st, { t: st.t, type: 'sabotage', actor: p.id, data: { kind: act.kind } });
      return OK;
    }
    case 'fix': {
      if (st.phase !== 'play' || !p.alive) return no('not now');
      const station = ctx.map.stationById.get(act.station);
      if (!station) return no('no station');
      if (!act.on) {
        if (p.fixing === act.station) p.fixing = null;
        return OK;
      }
      const kind = station.kind;
      const a = st.sabotage.active;
      const matches = (a === 'meltdown' && (kind === 'meltdownA' || kind === 'meltdownB')) || (a === 'pressure' && (kind === 'pressureA' || kind === 'pressureB'));
      if (!matches) return no('nothing to fix');
      if (!stationNear(ctx, p, act.station)) return no('too far');
      p.fixing = act.station;
      p.fixingAt = st.t;
      return OK;
    }
    case 'fix.done': {
      if (st.phase !== 'play' || !p.alive) return no('not now');
      const station = ctx.map.stationById.get(act.station);
      if (!station || !stationNear(ctx, p, act.station, INTERACT_RANGE + 0.6)) return no('too far');
      const a = st.sabotage.active;
      if ((a === 'lights' && station.kind === 'lightsPanel') || (a === 'comms' && station.kind === 'commsPanel')) {
        fixSabotage(st, p);
        return OK;
      }
      return no('nothing to fix');
    }
    case 'remotefix': {
      if (!canAct(st, p) || p.role !== 'engineer') return no('cannot');
      if (p.remoteFixUsed) return no('already used');
      if (!st.sabotage.active) return no('nothing to fix');
      p.remoteFixUsed = true;
      fixSabotage(st, p);
      return OK;
    }
    case 'use': {
      if (act.facility === null) {
        p.using = null;
        return OK;
      }
      if (st.phase !== 'play') return no('not now');
      const allowed: FacilityKind[] = ['admin', 'cams', 'vitals', 'doorlog'];
      if (!allowed.includes(act.facility)) return no('bad facility');
      if (!nearestStationOfKind(ctx, p, act.facility)) return no('too far');
      p.using = act.facility;
      return OK;
    }
    case 'vote': {
      if (st.phase !== 'meeting' || !st.meeting || st.meeting.stage !== 'vote') return no('not voting');
      if (!p.alive) return no('ghosts cannot vote');
      if (st.meeting.votes[p.id]) return no('already voted');
      if (act.target === 'skip') {
        if (!s.allowSkip) return no('skip disabled');
      } else {
        const t = st.players[act.target];
        if (!t || !t.alive) return no('bad target');
      }
      st.meeting.votes[p.id] = act.target;
      const voters = alivePlayers(st).filter((x) => x.connected || x.kind !== 'human');
      if (voters.every((v) => st.meeting!.votes[v.id])) {
        st.meeting.stage = 'reveal';
        st.meeting.stageEnds = st.t + REVEAL_SECONDS;
        st.phaseEnds = st.meeting.stageEnds;
      }
      return OK;
    }
    case 'chat':
    case 'quick': {
      let text: string;
      let quick: string | undefined;
      if (act.a === 'chat') {
        if (!s.chat) return no('chat off');
        text = sanitizeChat(act.text);
        if (!text) return no('empty');
      } else {
        if (!s.quickChat) return no('quick chat off');
        const q = QUICK_CHAT.find((x) => x.id === act.id);
        if (!q) return no('bad quick chat');
        const target = act.target ? st.players[act.target] : null;
        text = q.text.replace('{p}', target ? target.name : 'someone');
        quick = q.id;
      }
      const ghost = !p.alive;
      if (ghost && !s.ghostChat) return no('ghost chat off');
      let to: string[] | undefined;
      if (!ghost && st.phase === 'play') {
        if (!s.proximityChat) return no('no chat during play');
        to = alivePlayers(st)
          .filter((o) => dist(o.pos, p.pos) <= 8)
          .map((o) => o.id);
      } else if (!ghost && st.phase !== 'meeting') return no('not now');
      const msg: ChatMsg = { id: ++st.chatSeq, from: p.id, text, t: st.t, ghost, quick, to };
      st.chat.push(msg);
      if (st.chat.length > 200) st.chat.splice(0, st.chat.length - 200);
      return OK;
    }
    case 'shield': {
      if (!canAct(st, p) || p.role !== 'medic') return no('cannot');
      if (p.shieldTarget) return no('already shielded this round');
      const t = st.players[act.target];
      if (!t || !t.alive || t.id === p.id) return no('bad target');
      if (dist(p.pos, t.pos) > 3) return no('out of range');
      p.shieldTarget = t.id;
      t.shieldedBy = p.id;
      return OK;
    }
    case 'track': {
      if (!canAct(st, p) || p.role !== 'tracker') return no('cannot');
      if (p.abilityCd > 0) return no('cooldown');
      const t = st.players[act.target];
      if (!t || !t.alive || t.id === p.id) return no('bad target');
      if (dist(p.pos, t.pos) > 3) return no('out of range');
      p.trackTarget = t.id;
      p.trackUntil = st.t + s.trackerSeconds;
      p.abilityCd = s.trackerSeconds + 15;
      emit(st, { t: st.t, type: 'track', actor: p.id, target: t.id });
      return OK;
    }
    case 'inspect': {
      if (!canAct(st, p) || p.role !== 'detective') return no('cannot');
      const b = st.bodies.find((x) => x.id === act.body);
      if (!b || dist(p.pos, b.pos) > REPORT_RANGE) return no('too far');
      if (p.inspected.includes(b.id)) return no('already inspected');
      p.inspected.push(b.id);
      const killer = b.killerId ? st.players[b.killerId] : null;
      const hint = killer
        ? s.detectiveClue === 'berry'
          ? killer.cosmetics.berry
          : colorFamily(killer.cosmetics.color)
        : 'unknown';
      p.clues.push({
        bodyId: b.id,
        victimId: b.playerId,
        secondsSinceDeath: Math.round(st.t - b.diedAt),
        killerHint: hint,
        hintKind: s.detectiveClue,
      });
      emit(st, { t: st.t, type: 'inspect', actor: p.id, target: b.playerId });
      return OK;
    }
    case 'camera': {
      if (!canAct(st, p) || p.role !== 'lookout') return no('cannot');
      if (p.portableCam) return no('already placed');
      p.portableCam = { ...p.pos };
      return OK;
    }
    case 'vitals': {
      if (!canAct(st, p) || p.role !== 'medic') return no('cannot');
      if (p.roundAbilityUsed || s.medicVitalsSeconds <= 0) return no('used this round');
      p.roundAbilityUsed = true;
      p.vitalsUntil = st.t + s.medicVitalsSeconds;
      p.using = 'vitals';
      return OK;
    }
    case 'blackout': {
      if (!canAct(st, p) || !mode.flashlights || !ROLES[p.role].canSabotage) return no('cannot');
      if (p.abilityCd > 0) return no('cooldown');
      const room = roomAt(ctx.map, p.pos);
      p.abilityCd = s.blackoutCooldown;
      for (const o of Object.values(st.players)) {
        if (!o.alive) continue;
        const r = roomAt(ctx.map, o.pos);
        if ((room && r === room) || (!room && dist(o.pos, p.pos) < 6)) o.blackoutUntil = st.t + BLACKOUT_SECONDS;
      }
      emit(st, { t: st.t, type: 'blackout', actor: p.id, pos: { ...p.pos }, data: { room } });
      return OK;
    }
    case 'mayor.reveal': {
      if (st.phase !== 'meeting' || p.role !== 'mayor' || !p.alive || !s.mayorReveal) return no('cannot');
      if (p.mayorRevealed) return no('already revealed');
      p.mayorRevealed = true;
      pushSystemChat(st, `${p.name} is the Mayor!`);
      return OK;
    }
    case 'flashlight': {
      if (!mode.flashlights || p.team === 'murderers') return no('no flashlight');
      p.flashlightOn = !!act.on;
      return OK;
    }
    case 'gun.pickup': {
      if (!canAct(st, p) || !st.gunDrop) return no('no gun');
      if (p.team !== 'crew' || p.hasGun) return no('cannot pick up');
      if (dist(p.pos, st.gunDrop) > 1.6) return no('too far');
      p.hasGun = true;
      p.isHero = p.role !== 'sheriff';
      p.gunCd = 3;
      emit(st, { t: st.t, type: 'gun.pickup', actor: p.id, pos: { ...st.gunDrop } });
      st.gunDrop = null;
      return OK;
    }
    case 'battery.pickup': {
      if (!canAct(st, p)) return no('cannot');
      const i = st.batteries.findIndex((b) => b.id === act.id);
      if (i < 0) return no('gone');
      if (dist(p.pos, st.batteries[i]!.pos) > 1.6) return no('too far');
      st.batteries.splice(i, 1);
      p.battery = Math.min(1, p.battery + 0.5);
      return OK;
    }
    case 'emote': {
      if (typeof act.id !== 'string' || act.id.length > 24) return no('bad emote');
      p.emote = { id: act.id, at: st.t };
      return OK;
    }
  }
  return no('unknown action');
}

function fixSabotage(st: MatchState, p: PlayerState): void {
  const kind = st.sabotage.active;
  st.sabotage.active = null;
  st.sabotage.progress = 0;
  st.sabotage.timer = 0;
  st.fixHold = 0;
  for (const o of Object.values(st.players)) o.fixing = null;
  p.stats.fixes++;
  emit(st, { t: st.t, type: 'fixed', actor: p.id, data: { kind } });
}

const COLOR_FAMILIES = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'dark', 'light'];
/** Palette index → colour family name (palette is grouped in pairs). */
export function colorFamily(color: number): string {
  return COLOR_FAMILIES[Math.floor(Math.abs(color) / 2) % COLOR_FAMILIES.length]!;
}

export function sanitizeChat(text: unknown): string {
  if (typeof text !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 160);
}

// ---------------------------------------------------------------------------
// Tick

export function tick(st: MatchState, ctx: MatchCtx, dt: number): void {
  if (st.phase === 'ended' || st.phase === 'lobby') return;
  const s = ctx.settings;
  const mode = MODES[st.modeId];
  st.t += dt;
  if (st.phase === 'intro') {
    if (st.t >= st.phaseEnds) {
      st.phase = 'play';
      st.phaseEnds = 0;
      if (st.hns) st.hns.hideUntil = st.t + s.hnsHideTime;
    }
    return;
  }
  if (st.phase === 'meeting' && st.meeting) {
    const m = st.meeting;
    if (st.t >= m.stageEnds) {
      if (m.stage === 'discuss') {
        m.stage = 'vote';
        m.stageEnds = st.t + s.votingTime;
        st.phaseEnds = m.stageEnds;
      } else if (m.stage === 'vote') {
        m.stage = 'reveal';
        m.stageEnds = st.t + REVEAL_SECONDS;
        st.phaseEnds = m.stageEnds;
      } else {
        resolveVotes(st, ctx);
        checkWin(st, ctx);
      }
    }
    return;
  }
  if (st.phase === 'eject') {
    if (st.t >= st.phaseEnds) {
      endEject(st, ctx);
      checkWin(st, ctx);
    }
    return;
  }
  // --- play ---
  const sab = st.sabotage;
  sab.cooldown = Math.max(0, sab.cooldown - dt);
  sab.doorCd = Math.max(0, sab.doorCd - dt);
  for (const [id, until] of Object.entries(sab.closedDoors)) if (until <= st.t) delete sab.closedDoors[id];
  const lights = mode.flashlights;
  const sample = Math.floor(st.t) !== Math.floor(st.t - dt);
  for (const id of st.order) {
    const p = st.players[id]!;
    const speed = speedOf(st, ctx, p);
    p.moveBudget = Math.min(p.moveBudget + speed * dt * 1.15, speed * 0.6 + 0.3);
    p.killCd = Math.max(0, p.killCd - dt);
    p.gunCd = Math.max(0, p.gunCd - dt);
    p.abilityCd = Math.max(0, p.abilityCd - dt);
    p.ventCd = Math.max(0, p.ventCd - dt);
    if (p.trackTarget && st.t > p.trackUntil) p.trackTarget = null;
    if (p.using === 'vitals' && p.vitalsUntil && st.t > p.vitalsUntil && !nearestStationOfKind(ctx, p, 'vitals', INTERACT_RANGE + 0.6)) {
      p.using = null;
      p.vitalsUntil = 0;
    }
    if (p.emote && st.t - p.emote.at > 4) p.emote = null;
    if (!p.alive) continue;
    // Poison.
    if (p.poisonedAt !== null && st.t - p.poisonedAt >= s.poisonDelay) {
      const by = p.poisonedBy;
      killPlayer(st, ctx, p, 'poison', by);
      if (by && st.players[by]) st.players[by]!.stats.kills++;
      emit(st, { t: st.t, type: 'kill', actor: by ?? undefined, target: p.id, pos: { ...p.pos }, data: { weapon: 'poison' } });
      continue;
    }
    // Flashlight battery.
    if (lights && p.team !== 'murderers') {
      const nearRecharge = ctx.map.def.stations.some((x) => x.kind === 'recharge' && dist(x, p.pos) <= 2.2);
      if (nearRecharge) p.battery = Math.min(1, p.battery + s.rechargeRate * dt);
      else if (p.flashlightOn && st.t >= p.blackoutUntil) p.battery = Math.max(0, p.battery - dt / s.batterySeconds);
    }
    // Door log sensors + heat.
    const room = roomAt(ctx.map, p.pos);
    if (room !== p.lastRoom) {
      for (const sen of ctx.map.def.sensors) {
        const [x, y, w, h] = sen.rect;
        if (p.pos.x >= x && p.pos.x <= x + w && p.pos.y >= y && p.pos.y <= y + h) {
          st.doorLog.push({ t: st.t, playerId: p.id, sensor: sen.id });
          if (st.doorLog.length > 60) st.doorLog.shift();
          break;
        }
      }
      p.lastRoom = room;
    }
    if (sample) {
      const h = st.heat[p.id];
      if (h && h.length < 900) h.push(Math.floor(p.pos.y / 2) * 1000 + Math.floor(p.pos.x / 2));
    }
  }
  // Projectiles.
  const closed = closedDoors(st);
  for (const pr of [...st.projectiles]) {
    const step = THROW_SPEED * dt;
    const steps = Math.ceil(step / 0.25);
    let hit = false;
    for (let i = 0; i < steps && !hit; i++) {
      pr.pos.x += (pr.dir.x * step) / steps;
      pr.pos.y += (pr.dir.y * step) / steps;
      pr.travelled += step / steps;
      const tx = Math.floor(pr.pos.x);
      const ty = Math.floor(pr.pos.y);
      if (tx < 0 || ty < 0 || tx >= ctx.map.w || ty >= ctx.map.h || ctx.map.opaque[ty * ctx.map.w + tx] || closed.has(ctx.map.doorAt.get(ty * ctx.map.w + tx) ?? '')) {
        hit = true;
        break;
      }
      for (const o of Object.values(st.players)) {
        if (!o.alive || o.inVent || o.id === pr.ownerId || o.team === 'murderers') continue;
        if (dist(o.pos, pr.pos) < 0.5) {
          const owner = st.players[pr.ownerId];
          hit = true;
          if (owner && tryShield(st, owner, o)) break;
          killPlayer(st, ctx, o, 'thrown', pr.ownerId);
          if (owner) owner.stats.kills++;
          emit(st, { t: st.t, type: 'kill', actor: pr.ownerId, target: o.id, pos: { ...o.pos }, data: { weapon: 'throw' } });
          break;
        }
      }
    }
    if (hit || pr.travelled >= THROW_RANGE) st.projectiles.splice(st.projectiles.indexOf(pr), 1);
  }
  // Sabotage: critical countdown + two-person fixes.
  if (isCritical(sab.active)) {
    sab.timer = Math.max(0, sab.timer - dt);
    const a = sab.active === 'meltdown' ? 'meltdownA' : 'pressureA';
    const b = sab.active === 'meltdown' ? 'meltdownB' : 'pressureB';
    const holding = (kind: string) =>
      Object.values(st.players).some((p) => {
        if (!p.alive || !p.fixing) return false;
        const stn = ctx.map.stationById.get(p.fixing);
        return !!stn && stn.kind === kind && dist(p.pos, stn) <= INTERACT_RANGE + 0.6;
      });
    const ha = holding(a);
    const hb = holding(b);
    sab.progress = (ha ? 0.5 : 0) + (hb ? 0.5 : 0);
    if (ha && hb) {
      st.fixHold += dt;
      if (st.fixHold >= 1) {
        const fixer = Object.values(st.players).find((p) => p.fixing) ?? Object.values(st.players)[0]!;
        fixSabotage(st, fixer);
      }
    } else st.fixHold = 0;
  }
  mode.tick?.(st, ctx, dt);
  // Time limit.
  if (st.timeLimit > 0 && st.t >= st.timeLimit) {
    const team = s.timerOutcome === 'draw' ? 'draw' : s.timerOutcome === 'crew' ? 'crew' : 'murderers';
    endMatch(st, ctx, team, 'timer');
    return;
  }
  checkWin(st, ctx);
}

// ---------------------------------------------------------------------------
// Win conditions + results

export function checkWin(st: MatchState, ctx: MatchCtx): boolean {
  if (st.phase === 'ended') return true;
  const mode = MODES[st.modeId];
  if (st.jesterWin) {
    endMatch(st, ctx, 'neutral', 'jester');
    return true;
  }
  const special = mode.checkWin?.(st, ctx);
  if (special) {
    endMatch(st, ctx, special.team, special.reason);
    return true;
  }
  if (!mode.sharedWins) return false;
  if (st.phase === 'meeting' || st.phase === 'eject') return false;
  const alive = alivePlayers(st);
  const killers = alive.filter((p) => ROLES[p.role].killer);
  const murderTeam = alive.filter((p) => p.team === 'murderers');
  const others = alive.length - murderTeam.length;
  if (killers.length === 0) {
    endMatch(st, ctx, 'crew', 'murderers-eliminated');
    return true;
  }
  if (murderTeam.length >= others) {
    endMatch(st, ctx, 'murderers', 'parity');
    return true;
  }
  if (isCritical(st.sabotage.active) && st.sabotage.timer <= 0) {
    endMatch(st, ctx, 'murderers', 'critical');
    return true;
  }
  const tp = taskProgress(st, ctx);
  if (tp.total > 0 && tp.done >= tp.total) {
    endMatch(st, ctx, 'crew', 'tasks');
    return true;
  }
  return false;
}

export const AWARDS: { id: string; title: string }[] = [
  { id: 'mvp', title: 'MVP' },
  { id: 'speedrunner', title: 'Speedrunner' },
  { id: 'sus', title: 'Most Sus' },
  { id: 'fixer', title: 'Lights Fixer' },
  { id: 'clutch', title: 'Clutch Sheriff' },
  { id: 'detective', title: 'Sharp Eye' },
  { id: 'marathon', title: 'Marathon Berry' },
  { id: 'reaper', title: 'Grim Reaper' },
];

export function endMatch(st: MatchState, _ctx: MatchCtx, team: Team | 'draw', reason: WinReason): void {
  if (st.phase === 'ended') return;
  st.phase = 'ended';
  const players = st.order.map((id) => st.players[id]!);
  for (const p of players) if (p.alive) p.stats.survivedTo = st.t;
  const winners = new Set<string>();
  if (team === 'neutral' && st.jesterWin) winners.add(st.jesterWin);
  else if (team !== 'draw') for (const p of players) if (p.team === team) winners.add(p.id);
  for (const p of players) if (p.role === 'survivor' && p.alive) winners.add(p.id);
  // Awards.
  const awards: { id: string; title: string; playerId: string }[] = [];
  const best = (score: (p: PlayerState) => number, min = 1) => {
    let top: PlayerState | null = null;
    let s = min - 1e-9;
    for (const p of players) {
      const v = score(p);
      if (v > s) {
        s = v;
        top = p;
      }
    }
    return top;
  };
  const score = (p: PlayerState) =>
    (winners.has(p.id) ? 4 : 0) + p.stats.kills * 3 + p.stats.tasksDone * 1.2 + p.stats.correctVotes * 2 + p.stats.fixes * 1.5 + p.stats.shotsHit * 4 + p.stats.bodiesReported + (p.alive ? 1 : 0);
  const mvp = best(score, 0);
  if (mvp) awards.push({ id: 'mvp', title: 'MVP', playerId: mvp.id });
  const add = (id: string, p: PlayerState | null) => {
    if (p) awards.push({ id, title: AWARDS.find((a) => a.id === id)!.title, playerId: p.id });
  };
  add('speedrunner', best((p) => (p.team === 'crew' ? p.stats.tasksDone : 0)));
  const votesAgainst: Record<string, number> = {};
  for (const ev of st.events) if (ev.type === 'eject' && ev.target) votesAgainst[ev.target] = (votesAgainst[ev.target] ?? 0) + 1;
  add('sus', best((p) => votesAgainst[p.id] ?? 0));
  add('fixer', best((p) => p.stats.fixes));
  add('clutch', best((p) => p.stats.shotsHit));
  add('detective', best((p) => p.stats.correctVotes, 2));
  add('marathon', best((p) => p.stats.distance, 50));
  add('reaper', best((p) => p.stats.kills, 2));
  st.result = { winningTeam: team, reason, winners: [...winners], mvp: mvp?.id ?? null, awards, endedAt: st.t };
  emit(st, { t: st.t, type: 'end', data: { team, reason } });
}

/** Remove/handle a player who disconnected for good mid-match. */
export function dropPlayer(st: MatchState, ctx: MatchCtx, pid: string): void {
  const p = st.players[pid];
  if (!p) return;
  p.connected = false;
  if (p.alive && st.phase !== 'ended') {
    killPlayer(st, ctx, p, 'disconnect', null, false);
    emit(st, { t: st.t, type: 'leave', actor: p.id });
    checkWin(st, ctx);
  }
}

export function roleRevealedTo(st: MatchState, ctx: MatchCtx, viewer: PlayerState, target: PlayerState): RoleId | null {
  if (viewer.id === target.id || st.phase === 'ended') return target.role;
  if (target.role === 'seeker') return 'seeker';
  if (target.role === 'mayor' && target.mayorRevealed) return 'mayor';
  if (!viewer.alive && ctx.settings.ghostsSeeRoles) return target.role;
  if (viewer.team === 'murderers' && target.team === 'murderers') {
    if (viewer.role === 'accomplice' && !ctx.settings.accompliceKnows) return null;
    if (target.role === 'accomplice' && !ctx.settings.accompliceKnows) return null;
    return target.role;
  }
  if (target.ejected && ctx.settings.confirmEjects) return target.role;
  return null;
}
