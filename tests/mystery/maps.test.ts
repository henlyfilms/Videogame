import { compileMap, findPath, isFloor, nearestFree } from '../../src/mystery/core/map';
import { LOBBY_MAP, MAP_DEFS, MAP_ORDER } from '../../src/mystery/core/maps/index';
import { validateMap } from '../../src/mystery/core/maps/validate';
import { availableTasks, TASKS } from '../../src/mystery/core/tasks';
import type { StationKind } from '../../src/mystery/core/types';

const TASK_KINDS = new Set<StationKind>(TASKS.flatMap((t) => t.steps));

describe.each(MAP_ORDER)('map %s', (id) => {
  const def = MAP_DEFS[id];

  it('is registered', () => {
    expect(def).toBeDefined();
    expect(def!.id).toBe(id);
  });

  it('passes validateMap', () => {
    const rep = validateMap(def!);
    if (!rep.ok) console.error(`${id} errors:\n${rep.errors.join('\n')}`);
    expect(rep.errors).toEqual([]);
    expect(rep.ok).toBe(true);
    expect(rep.rooms).toBeGreaterThanOrEqual(14);
    expect(rep.rooms).toBeLessThanOrEqual(20);
    expect(rep.crossingSeconds).toBeGreaterThanOrEqual(45);
    expect(rep.loops).toBeGreaterThanOrEqual(3);
    expect(rep.ventNetworks).toBeGreaterThanOrEqual(2);
  });

  it('has a station for every task step so every task is available', () => {
    const kinds = new Set(def!.stations.map((s) => s.kind));
    const missing = [...TASK_KINDS].filter((k) => !kinds.has(k));
    expect(missing).toEqual([]);
    expect(def!.stations.filter((s) => s.kind === 'lightLantern').length).toBeGreaterThanOrEqual(3);
    const m = compileMap(def!);
    expect(availableTasks(m, 'classic').length).toBeGreaterThanOrEqual(20);
    expect(availableTasks(m, 'lightsout').length).toBe(TASKS.length);
  });

  it('has security coverage and spread-out facilities', () => {
    expect(def!.cameras.length).toBeGreaterThanOrEqual(3);
    expect(def!.sensors.length).toBeGreaterThanOrEqual(3);
    expect(def!.stations.filter((s) => s.kind === 'recharge').length).toBeGreaterThanOrEqual(3);
    for (const k of ['admin', 'cams', 'vitals', 'doorlog'] as StationKind[]) expect(def!.stations.some((s) => s.kind === k)).toBe(true);
    const pa = def!.stations.find((s) => s.kind === 'pressureA')!;
    const pb = def!.stations.find((s) => s.kind === 'pressureB')!;
    expect(pa.room).not.toBe(pb.room);
  });

  it('seats the meeting on the floor', () => {
    const m = compileMap(def!);
    expect(m.emergency).not.toBeNull();
    expect(m.emergency!.room).toBe(def!.meetingRoom);
    expect(m.meetingSeats.length).toBeGreaterThan(0);
    for (const p of m.meetingSeats) expect(isFloor(m, Math.floor(p.x), Math.floor(p.y))).toBe(true);
    expect(isFloor(m, Math.floor(def!.spawn.x), Math.floor(def!.spawn.y))).toBe(true);
  });

  it('keeps doorways clear and never lets door sabotage seal a sabotage-fix room', () => {
    const m = compileMap(def!);
    for (const d of def!.doors) {
      const [x, y, w, h] = d.rect;
      for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) expect(isFloor(m, tx, ty)).toBe(true);
    }
    const fixKinds = new Set<StationKind>(['emergency', 'lightsPanel', 'commsPanel', 'meltdownA', 'meltdownB', 'pressureA', 'pressureB']);
    for (const room of def!.rooms) {
      const doors = def!.doors.filter((d) => d.room === room.id).map((d) => d.id);
      if (!doors.length || !def!.stations.some((s) => s.room === room.id && fixKinds.has(s.kind))) continue;
      const [x, y, w, h] = room.rect;
      expect(findPath(m, nearestFree(m, { x: x + w / 2, y: y + h / 2 }), def!.spawn, new Set(doors), 100000), room.id).not.toBeNull();
    }
  });

  it('has bidirectional vent links', () => {
    const byId = new Map(def!.vents.map((v) => [v.id, v]));
    for (const v of def!.vents) for (const l of v.links) expect(byId.get(l)?.links).toContain(v.id);
  });
});

describe('lobby map', () => {
  it('passes validateMap in lobby mode', () => {
    const rep = validateMap(LOBBY_MAP, { lobby: true });
    if (!rep.ok) console.error(`lobby errors:\n${rep.errors.join('\n')}`);
    expect(rep.ok).toBe(true);
  });
});
