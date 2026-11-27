import { describe, expect, it } from 'vitest';
import { makeEvent } from '../src/adapters/events';
import { hqAmbienceFor, hqTrackFor } from '../src/audio/hqSound';
import { Camera } from '../src/engine/camera';
import { MAP_H, MAP_W, ROOMS, TILE, Tile, buildGrid, doorSegment, WORLD_H, WORLD_W } from '../src/engine/world';
import { Simulation } from '../src/engine/sim';
import { HQ } from '../src/game/hq';
import { wire, populateSim } from '../src/game/wire';
import { TRACK_BY_ID } from '../src/mystery/audio/music';
import { Renderer } from '../src/render/renderer';
import { env } from '../src/render/seasonal';
import { emptyView } from '../src/render/view';
import { mergeRuns, wallSegments } from '../src/render3d/hq3d';
import { LAMPS, WINDOWS } from '../src/render/daylight';
import { loadPersisted, persistedFrom, startPersistence, useGame } from '../src/store/gameStore';
import { nightFactor, seasonFor, SEASONS, SEASON_STYLE } from '../src/theme/environment';

describe('HQ environment (seasons + day/night)', () => {
  it('derives the season from the calendar and the night factor from the mode', () => {
    expect(seasonFor(new Date(2026, 3, 10))).toBe('spring');
    expect(seasonFor(new Date(2026, 6, 10))).toBe('summer');
    expect(seasonFor(new Date(2026, 9, 10))).toBe('fall');
    expect(seasonFor(new Date(2026, 0, 10))).toBe('winter');
    expect(seasonFor(new Date(2026, 11, 25))).toBe('winter');
    expect(nightFactor('day', new Date(2026, 0, 1, 23))).toBe(0);
    expect(nightFactor('night', new Date(2026, 0, 1, 12))).toBe(1);
    expect(nightFactor('auto', new Date(2026, 0, 1, 12))).toBe(0);
    expect(nightFactor('auto', new Date(2026, 0, 1, 23))).toBe(1);
    const dusk = nightFactor('auto', new Date(2026, 0, 1, 19));
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    for (const s of SEASONS) {
      const st = SEASON_STYLE[s];
      expect(st.foliage.length).toBeGreaterThan(0);
      expect(st.particle.colors.length).toBeGreaterThan(0);
    }
  });

  it('persists view, season and time mode', () => {
    localStorage.clear();
    const stop = startPersistence();
    const s = useGame.getState();
    s.setHqView('3d');
    s.setSeason('fall');
    s.setTimeMode('night');
    stop();
    const saved = loadPersisted();
    expect(saved.hqView).toBe('3d');
    expect(saved.season).toBe('fall');
    expect(saved.timeMode).toBe('night');
    expect(persistedFrom(useGame.getState()).season).toBe('fall');
    s.setHqView('2d');
    s.setSeason('auto');
    s.setTimeMode('auto');
  });

  it('wires the store into the HQ (season, fixed day / night hour)', () => {
    const hq = new HQ(new Simulation());
    populateSim(hq);
    const unwire = wire(hq);
    const s = useGame.getState();
    s.setSeason('winter');
    s.setTimeMode('night');
    expect(hq.ui.season).toBe('winter');
    expect(hq.clockOverride).toBe(22.5);
    s.setTimeMode('day');
    expect(hq.clockOverride).toBe(12.5);
    s.setTimeMode('auto');
    expect(hq.clockOverride).toBeNull();
    s.setSeason('auto');
    expect(hq.ui.season).toBe(seasonFor());
    unwire();
  });

  it('renders the 2D view in every season, day and night, rebuilding cached layers on season change', () => {
    const canvas = document.createElement('canvas');
    const r = new Renderer(canvas);
    r.resize(1024, 700, 1);
    const cam = new Camera(WORLD_W, WORLD_H);
    const sim = new Simulation();
    const hq = new HQ(sim);
    populateSim(hq);
    sim.apply(makeEvent('bot.message', { botId: 'moose', text: 'hello', to: 'barry' }));
    for (let i = 0; i < 20; i++) sim.update(1 / 60);
    const base = { selectedBot: 'daniel', selectedRoom: null, hoverRoom: null, hoverHotspot: null, showNames: true } as const;
    let builds = 0;
    for (const season of SEASONS) {
      for (const hour of [12, 22]) r.render(sim, cam, emptyView('light'), 0.5, { ...base, season, hour });
      expect(env.season).toBe(season);
      expect(r.stats.staticBuilds + r.stats.chunkBuilds).toBeGreaterThan(builds);
      builds = r.stats.staticBuilds + r.stats.chunkBuilds;
    }
    expect(r.stats.botsDrawn).toBeGreaterThan(0);
  });

  it('merges 3D wall tiles into seamless runs that cover every wall exactly once', () => {
    const g = buildGrid();
    const isWall = (x: number, y: number) => g.tiles[y * MAP_W + x] === Tile.Wall;
    const runs = mergeRuns(isWall);
    const cover = new Uint8Array(MAP_W * MAP_H);
    for (const r of runs) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cover[y * MAP_W + x] = (cover[y * MAP_W + x] ?? 0) + 1;
    let walls = 0;
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (isWall(x, y)) {
          walls++;
          expect(cover[y * MAP_W + x]).toBe(1);
        } else expect(cover[y * MAP_W + x]).toBe(0);
      }
    expect(runs.length).toBeLessThan(walls / 3);
  });

  it('builds 3D walls along every room outline (angled runs included) with gaps at the doors', () => {
    const dist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
    };
    let angled = 0;
    for (const room of ROOMS) {
      const segs = wallSegments(room);
      expect(segs.length).toBeGreaterThanOrEqual(room.outline.length);
      angled += segs.filter((w) => w.a.x !== w.b.x && w.a.y !== w.b.y).length;
      for (const d of room.doors) {
        const s = doorSegment(room, d);
        const mid = { x: (s.a.x + s.b.x) / 2 / TILE - s.n.x * 0.18, y: (s.a.y + s.b.y) / 2 / TILE - s.n.y * 0.18 };
        for (const w of segs) expect(dist(mid, w.a, w.b), `${room.id} ${d.side} door`).toBeGreaterThan(0.5);
      }
    }
    expect(angled).toBeGreaterThan(8);
  });

  it('derives lamps from the corridors and windows from the outside walls', () => {
    const g = buildGrid();
    const corridorLamps = LAMPS.filter((l) => l.kind === 'corridor');
    expect(corridorLamps.length).toBeGreaterThan(15);
    for (const l of corridorLamps) expect(g.tiles[Math.floor(l.y / TILE) * MAP_W + Math.floor(l.x / TILE)]).toBe(Tile.Corridor);
    expect(WINDOWS.length).toBeGreaterThan(20);
    for (const w of WINDOWS) {
      // The tile just outside the pane is open ground.
      const ox = Math.floor((w.x + w.w / 2 + w.nx * 16) / TILE);
      const oy = Math.floor((w.y + w.h / 2 + w.ny * 16) / TILE);
      if (ox >= 0 && oy >= 0 && ox < MAP_W && oy < MAP_H) expect(g.tiles[oy * MAP_W + ox]).toBe(Tile.Void);
    }
  });

  it('has a music track per season, a night track, and seasonal ambience keys', () => {
    for (const s of SEASONS) {
      expect(TRACK_BY_ID[hqTrackFor(s, false)]).toBeDefined();
      expect(hqTrackFor(s, true)).toBe('hq-night');
      expect(hqAmbienceFor(s, true)).toBe(`${s}:night`);
    }
    expect(TRACK_BY_ID['hq-night']).toBeDefined();
  });
});
