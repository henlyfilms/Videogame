/**
 * Map validation: connectivity, spawn, station/vent reachability, loops,
 * crossing time and Lights Out readiness. Used by tests and the map docs.
 */
import { Cell, compileMap, distanceField, INTERACT_RANGE, isFloor, type MapDef } from '../map';
import { BASE_SPEED } from '../settings';
import type { StationKind } from '../types';

export interface MapReport {
  ok: boolean;
  errors: string[];
  rooms: number;
  floorTiles: number;
  /** Longest shortest path between two room centres (m). */
  diameter: number;
  crossingSeconds: number;
  /** Independent cycles in the room/hall graph (E - V + 1). */
  loops: number;
  ventNetworks: number;
}

export const REQUIRED_FACILITIES: StationKind[] = [
  'emergency',
  'admin',
  'cams',
  'vitals',
  'lightsPanel',
  'commsPanel',
  'meltdownA',
  'meltdownB',
  'pressureA',
  'pressureB',
  'recharge',
];

export function validateMap(def: MapDef, opts: { lobby?: boolean } = {}): MapReport {
  const errors: string[] = [];
  const m = compileMap(def);
  const field = distanceField(m, def.spawn);
  let floor = 0;
  let unreachable = 0;
  for (let i = 0; i < m.cells.length; i++) {
    if (m.cells[i] === Cell.Floor) {
      floor++;
      if (field[i] === -1) unreachable++;
    }
  }
  if (!isFloor(m, Math.floor(def.spawn.x), Math.floor(def.spawn.y))) errors.push('Spawn is not on floor.');
  if (unreachable > 0) errors.push(`${unreachable} floor tiles unreachable from spawn.`);
  const reachable = (x: number, y: number) => {
    // A point is usable if some floor tile within interact range is reachable.
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const tx = Math.floor(x + dx);
        const ty = Math.floor(y + dy);
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
        if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > INTERACT_RANGE) continue;
        if (field[ty * m.w + tx]! >= 0) return true;
      }
    return false;
  };
  const ids = new Set<string>();
  for (const s of def.stations) {
    if (ids.has(s.id)) errors.push(`Duplicate station id ${s.id}.`);
    ids.add(s.id);
    if (!reachable(s.x, s.y)) errors.push(`Station ${s.id} (${s.kind}) is not reachable.`);
    if (!m.roomById.has(s.room)) errors.push(`Station ${s.id} has unknown room ${s.room}.`);
  }
  for (const v of def.vents) {
    if (!reachable(v.x, v.y)) errors.push(`Vent ${v.id} not reachable.`);
    for (const l of v.links) {
      const o = m.ventById.get(l);
      if (!o) errors.push(`Vent ${v.id} links to missing ${l}.`);
      else if (!o.links.includes(v.id)) errors.push(`Vent link ${v.id} -> ${l} is one-way.`);
    }
  }
  for (const d of def.doors) if (!m.roomById.has(d.room)) errors.push(`Door ${d.id} has unknown room.`);
  if (!opts.lobby) {
    for (const k of REQUIRED_FACILITIES) if (!def.stations.some((s) => s.kind === k)) errors.push(`Missing facility: ${k}.`);
    if (def.rooms.length < 14 || def.rooms.length > 20) errors.push(`Rooms: ${def.rooms.length} (need 14-20).`);
  }
  // Diameter between room centres.
  let diameter = 0;
  const centres = def.rooms.map((r) => ({ x: r.rect[0] + r.rect[2] / 2, y: r.rect[1] + r.rect[3] / 2 }));
  for (const c of centres) {
    const f = distanceField(m, nearestFloor(m, c));
    for (const o of centres) {
      const p = nearestFloor(m, o);
      const d = f[Math.floor(p.y) * m.w + Math.floor(p.x)]!;
      if (d > diameter) diameter = d;
    }
  }
  const crossingSeconds = diameter / BASE_SPEED;
  // Loops: build graph of rooms + hall components by tile adjacency.
  const comp = new Int32Array(m.w * m.h).fill(-1);
  const roomCount = def.rooms.length;
  let next = roomCount;
  for (let i = 0; i < m.cells.length; i++) {
    if (m.cells[i] === Cell.Void || comp[i] !== -1) continue;
    if (m.roomIdx[i]! >= 0) {
      comp[i] = m.roomIdx[i]!;
      continue;
    }
    // flood hall component
    const id = next++;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % m.w;
      const cy = (c / m.w) | 0;
      for (const [nx, ny] of [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const ni = ny * m.w + nx;
        if (m.cells[ni] === Cell.Void || comp[ni] !== -1 || m.roomIdx[ni]! >= 0) continue;
        comp[ni] = id;
        stack.push(ni);
      }
    }
  }
  const edges = new Set<string>();
  for (let i = 0; i < m.cells.length; i++) {
    if (comp[i]! < 0) continue;
    const cx = i % m.w;
    const cy = (i / m.w) | 0;
    for (const [nx, ny] of [
      [cx + 1, cy],
      [cx, cy + 1],
    ] as const) {
      if (nx >= m.w || ny >= m.h) continue;
      const a = comp[i]!;
      const bb = comp[ny * m.w + nx]!;
      if (bb < 0 || a === bb) continue;
      edges.add(a < bb ? `${a}-${bb}` : `${bb}-${a}`);
    }
  }
  const nodes = new Set<number>();
  for (let i = 0; i < comp.length; i++) if (comp[i]! >= 0) nodes.add(comp[i]!);
  const loops = edges.size - nodes.size + 1;
  const ventNetworks = new Set(def.vents.map((v) => v.net)).size;
  if (!opts.lobby) {
    if (crossingSeconds < 45) errors.push(`Crossing time ${crossingSeconds.toFixed(1)}s < 45s.`);
    if (loops < 3) errors.push(`Only ${loops} loops (need 3+).`);
    if (ventNetworks < 2) errors.push(`Only ${ventNetworks} vent networks.`);
    if (def.cameras.length < 3) errors.push('Need at least 3 cameras.');
  }
  return { ok: errors.length === 0, errors, rooms: def.rooms.length, floorTiles: floor, diameter, crossingSeconds, loops, ventNetworks };
}

function nearestFloor(m: ReturnType<typeof compileMap>, p: { x: number; y: number }) {
  for (let r = 0; r < 10; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const tx = Math.floor(p.x) + dx;
        const ty = Math.floor(p.y) + dy;
        if (isFloor(m, tx, ty)) return { x: tx + 0.5, y: ty + 0.5 };
      }
  return p;
}
