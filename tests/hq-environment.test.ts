import { describe, expect, it } from 'vitest';
import { makeEvent } from '../src/adapters/events';
import { hqAmbienceFor, hqTrackFor } from '../src/audio/hqSound';
import { Camera } from '../src/engine/camera';
import { MAP_H, MAP_W, Tile, buildGrid, WORLD_H, WORLD_W } from '../src/engine/world';
import { Simulation } from '../src/engine/sim';
import { HQ } from '../src/game/hq';
import { wire, populateSim } from '../src/game/wire';
import { TRACK_BY_ID } from '../src/mystery/audio/music';
import { Renderer } from '../src/render/renderer';
import { env } from '../src/render/seasonal';
import { emptyView } from '../src/render/view';
import { mergeRuns } from '../src/render3d/hq3d';
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

  it('has a music track per season, a night track, and seasonal ambience keys', () => {
    for (const s of SEASONS) {
      expect(TRACK_BY_ID[hqTrackFor(s, false)]).toBeDefined();
      expect(hqTrackFor(s, true)).toBe('hq-night');
      expect(hqAmbienceFor(s, true)).toBe(`${s}:night`);
    }
    expect(TRACK_BY_ID['hq-night']).toBeDefined();
  });
});
