/**
 * Builds the per-frame render description shared by the 2D and 3D views from
 * the latest snapshot / waiting-room state plus the realtime runtime.
 */
import { MODES } from '../core/modes';
import type { CompiledMap } from '../core/map';
import type { Snapshot } from '../core/project';
import { ROLES } from '../core/roles';
import { BASE_VISION, type Settings } from '../core/settings';
import { PING_TTL } from '../core/match';
import { PALETTE } from '../characters/catalog';
import type { Vec2 } from '../core/types';
import type { VisionShape } from '../core/vision';
import type { LobbyPlayer, RoomInfo } from '../net/protocol';
import { statusLine } from '../server/agentHub';
import { liveStatusFor } from '../../agents/liveStatus';
import { keyLabel } from '../render2d/prompts';
import type { DrawPlayer, FrameData, PingDraw } from '../render2d/renderer';
import type { Context } from './context';
import type { Prefs } from './prefs';
import { runtime } from './runtime';

export function clientVision(snap: Snapshot, settings: Settings): VisionShape {
  const you = snap.you;
  if (!you.alive || snap.phase === 'ended') return { radius: 999, cone: null, all: true };
  const killer = you.team === 'murderers';
  if (MODES[snap.mode].flashlights) {
    const on = !killer && you.flashlightOn && you.battery > 0 && !you.blackout;
    return {
      radius: killer ? settings.darkVision : 1.4,
      cone: on ? { dir: runtime.local.facing, halfAngle: ((settings.flashlightAngle / 2) * Math.PI) / 180, range: settings.flashlightRange } : null,
      all: false,
    };
  }
  let radius = BASE_VISION * (killer ? settings.murdererVision : settings.crewVision);
  if (snap.sabotage.active === 'lights' && !killer) radius *= settings.lightsVision;
  if (snap.hns && you.role === 'seeker' && snap.t < snap.hns.hideUntil) radius = 0.6;
  return { radius, cone: null, all: false };
}

export function buildFrame(opts: {
  map: CompiledMap;
  room: RoomInfo;
  snap: Snapshot | null;
  pid: string;
  prefs: Prefs;
  ctx: Context;
  t: number;
  zoom: number;
}): FrameData {
  const { map, room, snap, pid, prefs, ctx, t } = opts;
  const lobby = !snap || room.stage === 'lobby' || room.stage === 'countdown';
  const players: DrawPlayer[] = [];
  const cb = prefs.colorblind !== 'none';
  const local = runtime.local;
  if (lobby) {
    for (const p of room.players) {
      const isMe = p.id === pid;
      const r = isMe ? { pos: local.pos, facing: local.facing, moving: local.moving } : runtime.remote(p.id);
      if (!r) continue;
      players.push({
        id: p.id,
        name: p.name,
        cosmetics: p.cosmetics,
        pos: r.pos,
        facing: r.facing,
        moving: r.moving,
        ghost: false,
        emote: runtime.lobbyEmotes.get(p.id) ?? null,
        local: isMe,
        nameColor: p.host ? '#fbbf24' : undefined,
        status: playerStatus(p),
      });
    }
    return {
      mode: 'lobby',
      map,
      t,
      focus: local.pos,
      players,
      bodies: [],
      projectiles: [],
      gunDrop: null,
      batteries: [],
      closedDoors: new Set(),
      litLanterns: new Set(),
      highlight: new Set(),
      near: ctx.near,
      vision: null,
      night: false,
      lightsSabotaged: false,
      critical: false,
      reducedMotion: prefs.reducedMotion,
      highVisibility: prefs.highVisibility,
      footprints: false,
      trackPos: null,
      zoom: opts.zoom,
      prompts: { kill: null, report: null, vent: null, inVent: null, keys: promptKeys(prefs) },
    };
  }
  const s = snap!;
  const me = s.you;
  const night = MODES[s.mode].flashlights;
  for (const p of s.players) {
    const isMe = p.id === pid;
    if (!isMe && !p.pos) continue;
    if (isMe && me.inVent) continue;
    const r = isMe ? { pos: local.pos, facing: local.facing, moving: local.moving } : runtime.remote(p.id);
    if (!r) continue;
    const teamRole = p.role ? ROLES[p.role] : null;
    const nameColor =
      teamRole && !isMe
        ? teamRole.team === 'murderers'
          ? cb
            ? '#f97316'
            : '#ff4d5e'
          : p.role === 'mayor'
            ? '#e879f9'
            : undefined
        : undefined;
    players.push({
      id: p.id,
      name: p.name,
      cosmetics: p.cosmetics,
      pos: r.pos,
      facing: r.facing,
      moving: r.moving,
      ghost: isMe ? !me.alive : !!p.ghost,
      role: p.role,
      emote: p.emote ?? null,
      hasGun: isMe ? me.hasGun : p.hasGun,
      flashlight: isMe ? night && me.team !== 'murderers' && me.flashlightOn && me.battery > 0 && !me.blackout : p.flashlight,
      nameColor,
      local: isMe,
      scared: isMe && me.dread > 0.5,
      status: playerStatus(room.players.find((q) => q.id === p.id)),
    });
  }
  const cosOf = (id: string) => s.players.find((p) => p.id === id)?.cosmetics ?? room.players.find((p) => p.id === id)?.cosmetics;
  const bodies = s.bodies.map((b) => ({ id: b.id, cosmetics: cosOf(b.playerId)!, pos: b.pos })).filter((b) => b.cosmetics);
  const crit = s.sabotage.active === 'meltdown' || s.sabotage.active === 'pressure';
  const pings: PingDraw[] = [];
  const liveKeys = new Set<string>();
  for (const p of s.players) {
    if (!p.ping) continue;
    const key = `${p.id}|${p.ping.x}|${p.ping.y}`;
    liveKeys.add(key);
    // Client clock for smooth ages, re-anchored whenever the host says the ping
    // is younger (a lagging host must not make pings vanish early).
    let t0 = pingStart.get(key);
    if (t0 === undefined || t - t0 > p.ping.age + 0.25) pingStart.set(key, (t0 = t - p.ping.age));
    const age = Math.min(t - t0, PING_TTL);
    const drawn = players.find((d) => d.id === p.id);
    pings.push({ id: p.id, from: drawn?.pos ?? null, to: { x: p.ping.x, y: p.ping.y }, age, color: pingColor(p.cosmetics.color), local: p.id === pid });
  }
  for (const k of pingStart.keys()) if (!liveKeys.has(k)) pingStart.delete(k);
  return {
    mode: 'match',
    map,
    t,
    focus: local.pos,
    players,
    bodies,
    projectiles: s.projectiles,
    gunDrop: s.gunDrop,
    batteries: s.batteries,
    closedDoors: new Set(s.sabotage.closedDoors),
    litLanterns: new Set(s.litLanterns),
    highlight: ctx.highlight,
    near: ctx.near,
    vision: clientVision(s, room.settings),
    night,
    lightsSabotaged: s.sabotage.active === 'lights' && me.team !== 'murderers',
    critical: crit,
    reducedMotion: prefs.reducedMotion,
    highVisibility: prefs.highVisibility,
    footprints: me.role === 'detective' && me.alive,
    trackPos: me.trackPos as Vec2 | null,
    zoom: opts.zoom,
    pings,
    prompts: {
      kill: ctx.kill,
      report: ctx.report,
      vent: me.inVent ? null : ctx.vent,
      inVent: me.inVent ?? null,
      keys: promptKeys(prefs),
    },
  };
}

/**
 * The live work status line under a seat's name tag: the room's status for the
 * seat (filled by the server), else the agent board polled from the local game
 * server (in-browser solo games against the built-in Marion bots).
 */
export function playerStatus(lp: Pick<LobbyPlayer, 'look' | 'status'> | undefined): DrawPlayer['status'] {
  if (!lp) return null;
  const st = lp.status ?? liveStatusFor(lp.look);
  if (!st) return null;
  const text = statusLine(st);
  return text ? { text, busy: st.state === 'working' } : null;
}

/** Client clock start per live ping (key: pinger + spot), so ages advance smoothly between snapshots. */
const pingStart = new Map<string, number>();

/** The pinger's colour, lifted so dark berries still read as a bright laser. */
function pingColor(i: number): string {
  const hex = PALETTE[i]?.hex ?? '#ff6b9a';
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 110) {
    const k = (110 - lum) / 255;
    r = Math.round(r + (255 - r) * k * 1.6);
    g = Math.round(g + (255 - g) * k * 1.6);
    b = Math.round(b + (255 - b) * k * 1.6);
  }
  const c = (v: number) => Math.min(255, v).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function promptKeys(prefs: Prefs): { use: string; kill: string; report: string; vent: string } {
  if (touchUi()) return { use: '', kill: '', report: '', vent: '' };
  return { use: keyLabel(prefs.keys.use), kill: keyLabel(prefs.keys.kill), report: keyLabel(prefs.keys.report), vent: keyLabel(prefs.keys.vent) };
}

let coarse: boolean | null = null;
function touchUi(): boolean {
  if (coarse === null) coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse;
}
