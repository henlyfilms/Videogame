/**
 * Builds the per-frame render description shared by the 2D and 3D views from
 * the latest snapshot / waiting-room state plus the realtime runtime.
 */
import { MODES } from '../core/modes';
import type { CompiledMap } from '../core/map';
import type { Snapshot } from '../core/project';
import { ROLES } from '../core/roles';
import { BASE_VISION, type Settings } from '../core/settings';
import type { Vec2 } from '../core/types';
import type { VisionShape } from '../core/vision';
import type { RoomInfo } from '../net/protocol';
import { keyLabel } from '../render2d/prompts';
import type { DrawPlayer, FrameData } from '../render2d/renderer';
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
    });
  }
  const cosOf = (id: string) => s.players.find((p) => p.id === id)?.cosmetics ?? room.players.find((p) => p.id === id)?.cosmetics;
  const bodies = s.bodies.map((b) => ({ id: b.id, cosmetics: cosOf(b.playerId)!, pos: b.pos })).filter((b) => b.cosmetics);
  const crit = s.sabotage.active === 'meltdown' || s.sabotage.active === 'pressure';
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
    prompts: {
      kill: ctx.kill,
      report: ctx.report,
      vent: me.inVent ? null : ctx.vent,
      inVent: me.inVent ?? null,
      keys: promptKeys(prefs),
    },
  };
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
