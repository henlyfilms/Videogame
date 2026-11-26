/**
 * Per-player projection of the match state — the ONLY thing the server sends.
 * This is where hidden information is enforced: roles, out-of-sight positions,
 * private ability results and role-restricted stats never leave the server
 * unless this function decides the viewer is allowed to know them.
 */
import { MODES } from './modes';
import { dist, roomAt, type CompiledMap } from './map';
import { alivePlayers, isCritical, roleRevealedTo, taskProgress, type MatchCtx } from './match';
import { ROLES } from './roles';
import type {
  AssignedTask,
  ChatMsg,
  Clue,
  Cosmetics,
  EjectResult,
  FacilityKind,
  MatchEvent,
  MatchResult,
  MatchState,
  Phase,
  PlayerKind,
  PlayerState,
  Platform,
  RoleId,
  SabotageId,
  Team,
  Vec2,
} from './types';
import { camerasSee, canSee, closedDoors } from './vision';

export interface PublicPlayer {
  id: string;
  name: string;
  kind: PlayerKind;
  platform: Platform;
  cosmetics: Cosmetics;
  connected: boolean;
  /** As known by the viewer (dead players look alive until discovered). */
  alive: boolean;
  /** Only when visible to the viewer. */
  pos?: Vec2;
  facing?: number;
  moving?: boolean;
  emote?: string | null;
  /** Live "look here" marker: world point and seconds since it was placed. */
  ping?: { x: number; y: number; age: number };
  flashlight?: boolean;
  ghost?: boolean;
  hasGun?: boolean;
  role?: RoleId;
  /** Shown during meetings. */
  voted?: boolean;
  revealedMayor?: boolean;
}

export interface YouState {
  id: string;
  role: RoleId;
  team: Team;
  alive: boolean;
  pos: Vec2;
  facing: number;
  tasks: (AssignedTask & { fake: boolean })[];
  activeTask: string | null;
  killCd: number;
  gunCd: number;
  abilityCd: number;
  ventCd: number;
  hasGun: boolean;
  isHero: boolean;
  inVent: string | null;
  emergencyLeft: number;
  flashlightOn: boolean;
  battery: number;
  blackout: boolean;
  shieldTarget: string | null;
  shielded: boolean;
  trackTarget: string | null;
  trackPos: Vec2 | null;
  portableCam: Vec2 | null;
  clues: Clue[];
  using: FacilityKind | null;
  fixing: string | null;
  remoteFixUsed: boolean;
  roundAbilityUsed: boolean;
  mayorRevealed: boolean;
  ventUses: number;
  /** Set when the server overrode the client position. */
  corrected: number;
  poisoned: boolean;
  /** Lights Out: a killer is lurking close by (flashlight flickers). */
  dread: number;
}

export interface Stats {
  timeLeft: number | null;
  taskBar: number | null;
  /** Crew-side detail. */
  crew?: {
    myDone: number;
    myTotal: number;
    byLength: Record<'common' | 'short' | 'long', number> | null;
    byRoom: { room: string; name: string; value: number }[] | null;
    meetingsLeft: number;
  };
  murderers?: {
    crewAlive: number;
    murderersAlive: number;
    killsToWin: number;
    myKills: number;
    killCd: number;
    sabotageCd: number;
    sabotagesReady: SabotageId[];
    teammates: { id: string; alive: boolean }[];
  };
  neutral?: { goal: string; status: string };
  ghost?: { crewAlive: number; murderersAlive: number; neutralAlive: number };
  hns?: { hidersLeft: number; danger: number; final: boolean; hideLeft: number };
}

export interface SecurityView {
  admin?: { room: string; name: string; count: number }[];
  vitals?: { id: string; alive: boolean }[];
  doorlog?: { t: number; playerId: string; sensor: string }[];
  /** Cams just extend what positions you receive. */
  cams?: boolean;
}

export interface Snapshot {
  t: number;
  phase: Phase;
  phaseEnds: number;
  mode: MatchState['modeId'];
  map: MatchState['mapId'];
  you: YouState;
  players: PublicPlayer[];
  bodies: { id: string; playerId: string; pos: Vec2 }[];
  projectiles: { id: string; pos: Vec2; dir: Vec2 }[];
  gunDrop: Vec2 | null;
  batteries: { id: string; pos: Vec2 }[];
  meeting: {
    callerId: string;
    victimId: string | null;
    stage: 'discuss' | 'vote' | 'reveal';
    stageEnds: number;
    voted: string[];
    myVote: string | null;
    /** Votes revealed in the reveal stage (null if anonymous). */
    votes: Record<string, string> | null;
    tally: Record<string, number> | null;
  } | null;
  eject: EjectResult | null;
  sabotage: {
    active: SabotageId | null;
    timer: number;
    progress: number;
    closedDoors: string[];
    /** Only the saboteur team learns cooldowns. */
    cooldown?: number;
    doorCd?: number;
  };
  litLanterns: string[];
  stats: Stats;
  security: SecurityView | null;
  events: MatchEvent[];
  chat: ChatMsg[];
  result: (MatchResult & { roles: Record<string, RoleId>; heat?: Record<string, number[]> }) | null;
  hns: { hideUntil: number; timer: number; final: boolean } | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const rv = (v: Vec2): Vec2 => ({ x: r2(v.x), y: r2(v.y) });

/** Has the viewer learned that `p` is dead? */
function knownDead(st: MatchState, viewer: PlayerState, p: PlayerState, witnessed: ReadonlySet<string>): boolean {
  if (p.alive) return false;
  if (!viewer.alive || st.phase === 'ended') return true;
  if (p.id === viewer.id) return true;
  if (p.ejected) return true;
  if (p.diedAt !== null && st.lastMeetingAt >= 0 && p.diedAt <= st.lastMeetingAt) return true;
  return witnessed.has(p.id);
}

/** Event visibility for a viewer. */
function eventVisible(st: MatchState, ctx: MatchCtx, viewer: PlayerState, ev: MatchEvent, closed: ReadonlySet<string>): boolean {
  switch (ev.type) {
    case 'meeting':
    case 'report':
    case 'emergency':
    case 'eject':
    case 'end':
    case 'final':
    case 'fixed':
    case 'join':
    case 'leave':
      return true;
    case 'sabotage':
      return ev.data?.kind !== 'doors' || true;
    case 'shield.hit':
      return ev.data?.medic === viewer.id || ev.target === viewer.id || ev.actor === viewer.id;
    case 'track':
    case 'inspect':
      return ev.actor === viewer.id;
    case 'poison':
      return ev.actor === viewer.id || (!viewer.alive && ctx.settings.ghostsSeeRoles);
    case 'blackout':
      return ev.actor === viewer.id || (!!ev.pos && canSee(st, ctx.settings, ctx.map, viewer, ev.pos, undefined, closed)) || viewer.blackoutUntil > st.t;
    case 'flicker':
      return !!ev.pos && viewer.alive && dist(viewer.pos, ev.pos) <= 12;
    case 'task':
      return ev.actor === viewer.id;
    default:
      if (ev.actor === viewer.id || ev.target === viewer.id) return true;
      return !!ev.pos && canSee(st, ctx.settings, ctx.map, viewer, ev.pos, undefined, closed);
  }
}

export interface ProjectOpts {
  /** Chat messages with id > this are included. */
  chatSince: number;
  /** Players the viewer witnessed dying (client keeps knowledge). */
  witnessed?: Set<string>;
  includeHeat?: boolean;
}

export function project(st: MatchState, ctx: MatchCtx, viewerId: string, opts: ProjectOpts): Snapshot {
  const viewer = st.players[viewerId];
  if (!viewer) throw new Error(`no player ${viewerId}`);
  const s = ctx.settings;
  const m = ctx.map;
  const mode = MODES[st.modeId];
  const closed = closedDoors(st);
  const witnessed = opts.witnessed ?? new Set<string>();
  const usingCams = viewer.alive && viewer.using === 'cams' && (st.sabotage.active !== 'comms' || viewer.role === 'lookout');
  const portable = viewer.role === 'lookout' ? viewer.portableCam : null;
  const sees = (pos: Vec2, target?: PlayerState) =>
    canSee(st, s, m, viewer, pos, target, closed) ||
    (usingCams && camerasSee(st, m, pos, portable, closed)) ||
    (viewer.alive && !!portable && camerasSee(st, { ...m, def: { ...m.def, cameras: [] } }, pos, portable, closed));

  // Events first so witnessed kills update knowledge this tick.
  const events = st.pending.filter((ev) => eventVisible(st, ctx, viewer, ev, closed));
  for (const ev of events) if (ev.type === 'kill' && ev.target) witnessed.add(ev.target);

  const inMeeting = st.phase === 'meeting' || st.phase === 'eject';
  const players: PublicPlayer[] = st.order.map((id) => {
    const p = st.players[id]!;
    const kd = knownDead(st, viewer, p, witnessed);
    const pub: PublicPlayer = {
      id: p.id,
      name: p.name,
      kind: p.kind,
      platform: p.platform,
      cosmetics: p.cosmetics,
      connected: p.connected,
      alive: !kd,
    };
    const role = roleRevealedTo(st, ctx, viewer, p);
    if (role) pub.role = role;
    if (p.mayorRevealed) pub.revealedMayor = true;
    if (st.meeting) pub.voted = !!st.meeting.votes[p.id];
    // Position visibility.
    let visible = false;
    if (p.id === viewer.id) visible = true;
    else if (!p.alive) visible = !viewer.alive; // ghosts only seen by ghosts
    else if (p.inVent) visible = viewer.inVent !== null && viewer.inVent === p.inVent; // vent buddies
    else if (inMeeting || st.phase === 'intro' || st.phase === 'ended') visible = true;
    else visible = sees(p.pos, p) || seekerPing(st, viewer, p);
    if (visible) {
      pub.pos = rv(p.pos);
      pub.facing = r2(p.facing);
      pub.moving = p.moving;
      pub.emote = p.emote?.id ?? null;
      if (mode.flashlights) pub.flashlight = p.alive && p.flashlightOn && p.battery > 0 && st.t >= p.blackoutUntil && p.team !== 'murderers';
      if (!p.alive) pub.ghost = true;
      if (p.hasGun && (p.id === viewer.id || st.t > 0)) pub.hasGun = p.hasGun && (role === 'sheriff' || p.isHero || p.id === viewer.id);
    }
    // Pings: seen with the pinger or at the spot itself; ghost pings stay among ghosts.
    if (p.ping && st.phase === 'play' && (p.alive || !viewer.alive) && (visible || p.id === viewer.id || sees(p.ping))) {
      const at = rv(p.ping);
      pub.ping = { x: at.x, y: at.y, age: r2(st.t - p.pingAt) };
    }
    return pub;
  });

  const bodies = st.bodies.filter((b) => sees(b.pos)).map((b) => ({ id: b.id, playerId: b.playerId, pos: rv(b.pos) }));
  const projectiles = st.projectiles.filter((p) => sees(p.pos)).map((p) => ({ id: p.id, pos: rv(p.pos), dir: p.dir }));
  const gunDrop = st.gunDrop && (sees(st.gunDrop) || viewer.role === 'sheriff') ? rv(st.gunDrop) : null;
  const batteries = mode.flashlights ? st.batteries.filter((b) => sees(b.pos) || dist(b.pos, viewer.pos) < 3).map((b) => ({ id: b.id, pos: rv(b.pos) })) : [];

  const fakeTasks = viewer.team !== 'crew';
  const commsDown = st.sabotage.active === 'comms' && viewer.team !== 'murderers';
  const trackT = viewer.trackTarget ? st.players[viewer.trackTarget] : null;
  const you: YouState = {
    id: viewer.id,
    role: viewer.role,
    team: viewer.team,
    alive: viewer.alive,
    pos: rv(viewer.pos),
    facing: r2(viewer.facing),
    tasks: commsDown ? [] : viewer.tasks.map((t) => ({ ...t, stations: [...t.stations], fake: fakeTasks })),
    activeTask: viewer.activeTask?.stationId ?? null,
    killCd: r2(viewer.killCd),
    gunCd: r2(viewer.gunCd),
    abilityCd: r2(viewer.abilityCd),
    ventCd: r2(viewer.ventCd),
    hasGun: viewer.hasGun,
    isHero: viewer.isHero,
    inVent: viewer.inVent,
    emergencyLeft: viewer.emergencyLeft,
    flashlightOn: viewer.flashlightOn,
    battery: r2(viewer.battery),
    blackout: st.t < viewer.blackoutUntil,
    shieldTarget: viewer.shieldTarget,
    shielded: false, // never told (a medic's shield is secret to the target)
    trackTarget: viewer.trackTarget,
    trackPos: trackT && trackT.alive ? rv(trackT.pos) : null,
    portableCam: viewer.portableCam,
    clues: viewer.clues,
    using: viewer.using,
    fixing: viewer.fixing,
    remoteFixUsed: viewer.remoteFixUsed,
    roundAbilityUsed: viewer.roundAbilityUsed,
    mayorRevealed: viewer.mayorRevealed,
    ventUses: viewer.ventUses,
    corrected: viewer.corrected,
    poisoned: false,
    dread: dreadFor(st, viewer),
  };

  // Meeting (votes hidden until reveal).
  let meeting: Snapshot['meeting'] = null;
  if (st.meeting) {
    const mt = st.meeting;
    const reveal = mt.stage === 'reveal';
    let tally: Record<string, number> | null = null;
    if (reveal) {
      tally = {};
      for (const [voter, target] of Object.entries(mt.votes)) {
        const vp = st.players[voter];
        tally[target] = (tally[target] ?? 0) + (vp?.role === 'mayor' ? (vp.mayorRevealed && s.mayorReveal ? 3 : 2) : 1);
      }
    }
    meeting = {
      callerId: mt.callerId,
      victimId: mt.victimId,
      stage: mt.stage,
      stageEnds: r2(mt.stageEnds),
      voted: Object.keys(mt.votes),
      myVote: mt.votes[viewer.id] ?? null,
      votes: reveal && !s.anonymousVotes ? { ...mt.votes } : null,
      tally,
    };
  }

  // Security consoles.
  let security: SecurityView | null = null;
  if (viewer.alive && viewer.using && !(st.sabotage.active === 'comms' && viewer.role !== 'lookout')) {
    security = {};
    if (viewer.using === 'admin') {
      const counts: Record<string, number> = {};
      for (const p of alivePlayers(st)) {
        if (p.inVent) continue;
        const r = roomAt(m, p.pos);
        if (r) counts[r] = (counts[r] ?? 0) + 1;
      }
      security.admin = m.def.rooms.map((r) => ({ room: r.id, name: r.name, count: counts[r.id] ?? 0 }));
    } else if (viewer.using === 'vitals') {
      security.vitals = st.order.map((id) => ({ id, alive: st.players[id]!.alive }));
    } else if (viewer.using === 'doorlog') {
      security.doorlog = st.doorLog.slice(-20);
    } else if (viewer.using === 'cams') security.cams = true;
  }

  // Stats, filtered by role.
  const tp = taskProgress(st, ctx);
  const barVisible = s.taskBar !== 'never' && !commsDown && mode.id !== 'hideseek';
  const taskBar = barVisible ? r2(s.taskBar === 'live' ? tp.value : st.taskBarAtMeeting) : null;
  const timeLeft = st.hns ? r2(st.hns.timer) : st.timeLimit > 0 ? r2(Math.max(0, st.timeLimit - st.t)) : null;
  const stats: Stats = { timeLeft, taskBar };
  const alive = alivePlayers(st);
  if (!viewer.alive) {
    stats.ghost = {
      crewAlive: alive.filter((p) => p.team === 'crew').length,
      murderersAlive: alive.filter((p) => p.team === 'murderers').length,
      neutralAlive: alive.filter((p) => p.team === 'neutral').length,
    };
  }
  if (viewer.team === 'crew') {
    const live = s.taskBar === 'live' && barVisible;
    stats.crew = {
      myDone: viewer.tasks.reduce((a, t) => a + t.step, 0),
      myTotal: viewer.tasks.reduce((a, t) => a + t.stations.length, 0),
      byLength: live
        ? {
            common: tp.byLength.common.total ? r2(tp.byLength.common.done / tp.byLength.common.total) : 1,
            short: tp.byLength.short.total ? r2(tp.byLength.short.done / tp.byLength.short.total) : 1,
            long: tp.byLength.long.total ? r2(tp.byLength.long.done / tp.byLength.long.total) : 1,
          }
        : null,
      byRoom: live
        ? Object.entries(tp.byRoom)
            .map(([room, v]) => ({ room, name: m.roomById.get(room)?.name ?? room, value: r2(v.total ? v.done / v.total : 1) }))
            .sort((a, b) => a.value - b.value)
        : null,
      meetingsLeft: viewer.emergencyLeft,
    };
  } else if (viewer.team === 'murderers') {
    const team = alive.filter((p) => p.team === 'murderers');
    const others = alive.length - team.length;
    const ready: SabotageId[] = [];
    if (mode.sabotage && !st.sabotage.active && st.sabotage.cooldown <= 0) {
      if (s.sabLights) ready.push('lights');
      if (s.sabComms) ready.push('comms');
      if (s.sabMeltdown) ready.push('meltdown');
      if (s.sabPressure) ready.push('pressure');
    }
    if (mode.sabotage && s.sabDoors && st.sabotage.doorCd <= 0) ready.push('doors');
    stats.murderers = {
      crewAlive: others,
      murderersAlive: team.length,
      killsToWin: Math.max(0, others - team.length),
      myKills: viewer.stats.kills,
      killCd: r2(viewer.killCd),
      sabotageCd: r2(st.sabotage.cooldown),
      sabotagesReady: ready,
      teammates: st.order
        .map((id) => st.players[id]!)
        .filter((p) => p.id !== viewer.id && p.team === 'murderers' && roleRevealedTo(st, ctx, viewer, p))
        .map((p) => ({ id: p.id, alive: p.alive })),
    };
  } else {
    stats.neutral =
      viewer.role === 'jester'
        ? { goal: 'Get voted out', status: `${st.meetingsHeld} meeting${st.meetingsHeld === 1 ? '' : 's'} so far` }
        : { goal: 'Be alive at the end', status: viewer.alive ? 'Alive — keep it up' : 'Out' };
  }
  if (st.hns) {
    const hiders = alive.filter((p) => p.role === 'hider');
    let danger = 0;
    if (viewer.role === 'hider' && viewer.alive) {
      for (const p of alive) if (p.role === 'seeker') danger = Math.max(danger, 1 - Math.min(1, dist(p.pos, viewer.pos) / 14));
    }
    stats.hns = { hidersLeft: hiders.length, danger: r2(danger), final: !!st.hns.finalAt, hideLeft: r2(Math.max(0, st.hns.hideUntil - st.t)) };
  }

  const chat = st.chat.filter((c) => {
    if (c.id <= opts.chatSince) return false;
    if (c.ghost && viewer.alive) return false;
    if (c.to && !c.to.includes(viewer.id) && c.from !== viewer.id && viewer.alive) return false;
    return true;
  });

  let result: Snapshot['result'] = null;
  if (st.result) {
    const roles: Record<string, RoleId> = {};
    for (const id of st.order) roles[id] = st.players[id]!.role;
    result = { ...st.result, roles, heat: opts.includeHeat ? st.heat : undefined };
  }

  return {
    t: r2(st.t),
    phase: st.phase,
    phaseEnds: r2(st.phaseEnds),
    mode: st.modeId,
    map: st.mapId,
    you,
    players,
    bodies,
    projectiles,
    gunDrop,
    batteries,
    meeting,
    eject: st.phase === 'eject' ? st.lastEject : null,
    sabotage: {
      active: st.sabotage.active,
      timer: r2(st.sabotage.timer),
      progress: st.sabotage.progress,
      closedDoors: [...closed],
      ...(viewer.team === 'murderers' && ROLES[viewer.role].canSabotage ? { cooldown: r2(st.sabotage.cooldown), doorCd: r2(st.sabotage.doorCd) } : {}),
    },
    litLanterns: [...st.litLanterns],
    stats,
    security,
    events,
    chat,
    result,
    hns: st.hns ? { hideUntil: r2(st.hns.hideUntil), timer: r2(st.hns.timer), final: !!st.hns.finalAt } : null,
  };
}

/** Lights Out dread: 0..1 as an unseen killer gets close (crew only). */
function dreadFor(st: MatchState, viewer: PlayerState): number {
  if (!MODES[st.modeId].flashlights || !viewer.alive || viewer.team === 'murderers' || st.phase !== 'play') return 0;
  let d = 0;
  for (const p of Object.values(st.players)) {
    if (!p.alive || !ROLES[p.role].killer || p.inVent) continue;
    const dd = dist(p.pos, viewer.pos);
    if (dd < 5) d = Math.max(d, 1 - dd / 5);
  }
  return Math.round(d * 100) / 100;
}

/** Hide & Seek final countdown: seekers get a brief ping of every hider every 12 s. */
export function seekerPing(st: MatchState, viewer: PlayerState, target: PlayerState): boolean {
  if (!st.hns || !st.hns.finalAt || viewer.role !== 'seeker' || target.role !== 'hider' || !target.alive) return false;
  return (st.t - st.hns.finalAt) % 12 < 1;
}

export function isCriticalActive(snap: Snapshot): boolean {
  return isCritical(snap.sabotage.active);
}

export type { CompiledMap };
