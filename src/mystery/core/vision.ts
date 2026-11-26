/**
 * Who can see what. Used by the server projection (hidden-information
 * enforcement), by bots (fair play) and by renderers (fog of war shape).
 */
import { MODES } from './modes';
import { dist, lineOfSight, roomAt, type CompiledMap } from './map';
import { BASE_VISION, type Settings } from './settings';
import type { MatchState, PlayerState, Vec2 } from './types';

export interface VisionShape {
  /** Omni-directional radius (m). */
  radius: number;
  /** Flashlight cone, if on. */
  cone: { dir: number; halfAngle: number; range: number } | null;
  /** Ghosts and end-of-match viewers see everything. */
  all: boolean;
}

export function closedDoors(st: MatchState): Set<string> {
  const s = new Set<string>();
  for (const [id, until] of Object.entries(st.sabotage.closedDoors)) if (until > st.t) s.add(id);
  return s;
}

export function flashlightLit(st: MatchState, p: PlayerState): boolean {
  return MODES[st.modeId].flashlights && p.team !== 'murderers' && p.alive && p.flashlightOn && p.battery > 0 && st.t >= p.blackoutUntil;
}

export function visionShape(st: MatchState, s: Settings, p: PlayerState): VisionShape {
  if (!p.alive || st.phase === 'ended' || st.phase === 'lobby') return { radius: 999, cone: null, all: true };
  const mode = MODES[st.modeId];
  const killerTeam = p.team === 'murderers';
  if (mode.flashlights) {
    const radius = killerTeam ? s.darkVision : 1.4;
    const cone = flashlightLit(st, p)
      ? { dir: p.facing, halfAngle: ((s.flashlightAngle / 2) * Math.PI) / 180, range: s.flashlightRange }
      : null;
    return { radius, cone, all: false };
  }
  let radius = BASE_VISION * (killerTeam ? s.murdererVision : s.crewVision);
  if (st.sabotage.active === 'lights' && !killerTeam) radius *= s.lightsVision;
  if (st.modeId === 'hideseek' && p.role === 'seeker' && st.hns && st.t < st.hns.hideUntil) radius = 0.01;
  return { radius, cone: null, all: false };
}

function inCone(from: Vec2, cone: NonNullable<VisionShape['cone']>, to: Vec2): boolean {
  const d = dist(from, to);
  if (d > cone.range) return false;
  if (d < 0.5) return true;
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  let diff = Math.abs(a - cone.dir) % (Math.PI * 2);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  return diff <= cone.halfAngle;
}

/** Lit radius of a lamp in Lights Out (small pools, not whole rooms). */
export function lampPool(r: number): number {
  return Math.min(r * 0.25, 3);
}

/** Light sources other than flashlights that reveal a point in Lights Out. */
function litByWorld(st: MatchState, m: CompiledMap, to: Vec2): boolean {
  for (const l of m.def.lamps) {
    if (dist(l, to) <= lampPool(l.r)) return true;
  }
  for (const id of st.litLanterns) {
    const s = m.stationById.get(id);
    if (s && dist(s, to) <= 3.2) return true;
  }
  for (const s of m.def.stations) if (s.kind === 'recharge' && dist(s, to) <= 2.2) return true;
  return false;
}

/**
 * Can `viewer` see the point `to`? `target` (optional) lets a lit flashlight
 * give its carrier away from further off.
 */
export function canSee(
  st: MatchState,
  s: Settings,
  m: CompiledMap,
  viewer: PlayerState,
  to: Vec2,
  target?: PlayerState,
  closed: ReadonlySet<string> = closedDoors(st),
): boolean {
  const v = visionShape(st, s, viewer);
  if (v.all) return true;
  const d = dist(viewer.pos, to);
  const night = MODES[st.modeId].flashlights;
  let candidate = d <= v.radius;
  if (!candidate && v.cone) candidate = inCone(viewer.pos, v.cone, to);
  if (!candidate && night) {
    const far = BASE_VISION * 1.6;
    if (d <= far && target && flashlightLit(st, target)) candidate = true;
    else if (d <= BASE_VISION && litByWorld(st, m, to)) candidate = true;
  }
  if (!candidate) return false;
  return lineOfSight(m, viewer.pos, to, closed);
}

/** Positions visible through security cameras (+ a lookout's portable cam). */
export function camerasSee(_st: MatchState, m: CompiledMap, to: Vec2, portable: Vec2 | null, closed: ReadonlySet<string>): boolean {
  const range = 7;
  for (const c of m.def.cameras) if (dist(c, to) <= range && lineOfSight(m, c, to, closed)) return true;
  if (portable && dist(portable, to) <= range && lineOfSight(m, portable, to, closed)) return true;
  return false;
}

export function roomOf(m: CompiledMap, p: Vec2): string | null {
  return roomAt(m, p);
}
