import { describe, expect, it } from 'vitest';
import { CORE_BOTS } from '../src/data/bots';
import { makeEvent } from '../src/adapters/events';
import { findPath, Pathfinder, simplifyPath } from '../src/engine/pathfinding';
import { canTransition, forceTransition, transition, TRANSITIONS } from '../src/engine/fsm';
import { accumulate, GameLoop, MAX_STEPS, STEP } from '../src/engine/loop';
import { Camera } from '../src/engine/camera';
import { BubbleSystem, bubbleAlpha, layoutBubbles, rectsOverlap } from '../src/engine/bubbles';
import { Simulation } from '../src/engine/sim';
import {
  buildGrid,
  hotspotAt,
  isWalkable,
  MAP_H,
  MAP_W,
  pointAlong,
  polylineLength,
  propRect,
  ROOMS,
  spotTile,
  Tile,
  TUBE_ROUTES,
  type Grid,
} from '../src/engine/world';

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('world / floorplan', () => {
  const grid = buildGrid();
  it('has 10 rooms: 7 wings + bridge + huddle + arcade', () => {
    expect(ROOMS).toHaveLength(10);
    expect(new Set(ROOMS.map((r) => r.id)).size).toBe(10);
  });
  it('every named spot is walkable and reachable from command', () => {
    const pf = new Pathfinder(grid);
    const from = spotTile('command', 'desk');
    for (const room of ROOMS) {
      for (const s of room.spots) {
        const t = spotTile(room.id, s.name);
        expect(isWalkable(grid, t.x, t.y), `${room.id}.${s.name}`).toBe(true);
        expect(pf.find(from, t), `${room.id}.${s.name} reachable`).not.toBeNull();
      }
    }
  });
  it('props never block door tiles and stay inside room interiors', () => {
    for (const room of ROOMS) {
      for (const p of room.props) {
        expect(p.x).toBeGreaterThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(1);
        expect(p.x + p.w).toBeLessThanOrEqual(room.w - 1);
        expect(p.y + p.h).toBeLessThanOrEqual(room.h - 1);
      }
    }
    const doors = grid.tiles.filter((t) => t === Tile.Door).length;
    expect(doors).toBe(10 * 8);
  });
  it('hotspots resolve from world coords', () => {
    const mail = ROOMS.find((r) => r.id === 'mail')!;
    const stamp = mail.props.find((p) => p.id === 'stamp')!;
    const r = propRect(mail, stamp);
    expect(hotspotAt(r.x + 5, r.y + 5)?.prop.hotspot).toBe('stamp');
  });
  it('tube routes are axis-aligned polylines with positive length', () => {
    for (const route of TUBE_ROUTES) {
      expect(polylineLength(route.points)).toBeGreaterThan(0);
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1]!;
        const b = route.points[i]!;
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
    }
  });
  it('pointAlong interpolates endpoints and midpoints', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(pointAlong(pts, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(pts, 0.5)).toEqual({ x: 10, y: 0 });
    expect(pointAlong(pts, 1)).toEqual({ x: 10, y: 10 });
  });
});

function openGrid(w: number, h: number, walls: [number, number][] = []): Grid {
  const tiles = new Uint8Array(w * h).fill(Tile.Floor);
  for (const [x, y] of walls) tiles[y * w + x] = Tile.Wall;
  return { w, h, tiles, roomIndex: new Int8Array(w * h).fill(-1) };
}

describe('A* pathfinding', () => {
  it('finds a straight diagonal on an open grid', () => {
    const g = openGrid(10, 10);
    const p = findPath(g, { x: 0, y: 0 }, { x: 5, y: 5 })!;
    expect(p).toHaveLength(6);
    expect(p[0]).toEqual({ x: 0, y: 0 });
    expect(p[5]).toEqual({ x: 5, y: 5 });
  });
  it('routes around walls and never cuts corners', () => {
    const walls: [number, number][] = [];
    for (let y = 0; y < 9; y++) walls.push([5, y]);
    const g = openGrid(10, 10, walls);
    const p = findPath(g, { x: 0, y: 0 }, { x: 9, y: 0 })!;
    expect(p).not.toBeNull();
    for (const t of p) expect(isWalkable(g, t.x, t.y)).toBe(true);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      if (a.x !== b.x && a.y !== b.y) {
        expect(isWalkable(g, b.x, a.y) && isWalkable(g, a.x, b.y)).toBe(true);
      }
    }
    expect(p.some((t) => t.y === 9)).toBe(true);
  });
  it('returns null when unreachable or goal blocked', () => {
    const walls: [number, number][] = [];
    for (let y = 0; y < 10; y++) walls.push([5, y]);
    const g = openGrid(10, 10, walls);
    expect(findPath(g, { x: 0, y: 0 }, { x: 9, y: 9 })).toBeNull();
    expect(findPath(g, { x: 0, y: 0 }, { x: 5, y: 5 })).toBeNull();
  });
  it('returns a single-node path when start equals goal', () => {
    expect(findPath(openGrid(3, 3), { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
  it('caches paths and returns independent copies', () => {
    const pf = new Pathfinder(buildGrid());
    const a = spotTile('mail', 'desk');
    const b = spotTile('life', 'desk');
    const p1 = pf.find(a, b)!;
    p1[0]!.x = -999;
    const p2 = pf.find(a, b)!;
    expect(pf.hits).toBe(1);
    expect(pf.misses).toBe(1);
    expect(p2[0]!.x).toBe(a.x);
  });
  it('evicts least-recently-used entries past capacity', () => {
    const pf = new Pathfinder(openGrid(20, 20), 2);
    pf.find({ x: 0, y: 0 }, { x: 1, y: 1 });
    pf.find({ x: 0, y: 0 }, { x: 2, y: 2 });
    pf.find({ x: 0, y: 0 }, { x: 3, y: 3 });
    expect(pf.cacheSize).toBe(2);
  });
  it('crowding cost makes paths detour around occupied tiles', () => {
    const g = openGrid(7, 3);
    const p = findPath(g, { x: 0, y: 1 }, { x: 6, y: 1 }, { extraCost: (x, y) => (x === 3 && y === 1 ? 50 : 0) })!;
    expect(p.some((t) => t.x === 3 && t.y === 1)).toBe(false);
  });
  it('nearestFree skips taken tiles', () => {
    const pf = new Pathfinder(openGrid(5, 5));
    const r = pf.nearestFree({ x: 2, y: 2 }, (x, y) => x === 2 && y === 2)!;
    expect(Math.max(Math.abs(r.x - 2), Math.abs(r.y - 2))).toBe(1);
  });
  it('simplifyPath keeps only turning points', () => {
    const s = simplifyPath([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
    expect(s).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ]);
  });
  it('performs well on the full HQ map', () => {
    const g = buildGrid();
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) findPath(g, spotTile('engine', 't1'), spotTile('foundry', 'retired'));
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(MAP_W * MAP_H).toBe(66 * 63);
  });
});

describe('bot FSM', () => {
  it('allows legal transitions and resets stateTime', () => {
    const b = { state: 'idle' as const, stateTime: 5 } as { state: import('../src/adapters/events').BotState; stateTime: number };
    expect(transition(b, 'walking')).toBe(true);
    expect(b.state).toBe('walking');
    expect(b.stateTime).toBe(0);
  });
  it('rejects illegal transitions', () => {
    const b = { state: 'asleep' as import('../src/adapters/events').BotState, stateTime: 0 };
    expect(canTransition('asleep', 'huddling')).toBe(false);
    expect(transition(b, 'huddling')).toBe(false);
    expect(b.state).toBe('asleep');
  });
  it('forceTransition wakes through idle', () => {
    const b = { state: 'asleep' as import('../src/adapters/events').BotState, stateTime: 0 };
    expect(forceTransition(b, 'working')).toEqual(['idle', 'working']);
    expect(b.state).toBe('working');
  });
  it('every state can reach idle', () => {
    for (const s of Object.keys(TRANSITIONS) as (keyof typeof TRANSITIONS)[]) {
      expect(s === 'idle' || canTransition(s, 'idle')).toBe(true);
    }
  });
});

describe('fixed-timestep loop', () => {
  it('accumulates whole steps and keeps the remainder', () => {
    const r = accumulate(0, STEP * 2.5);
    expect(r.steps).toBe(2);
    expect(r.alpha).toBeCloseTo(0.5, 5);
  });
  it('clamps huge frame gaps', () => {
    expect(accumulate(0, 10).steps).toBeLessThanOrEqual(MAX_STEPS);
  });
  it('drives update/render through an injected rAF', () => {
    let cb: ((t: number) => void) | null = null;
    let updates = 0;
    let renders = 0;
    const loop = new GameLoop(
      { update: () => updates++, render: () => renders++ },
      (f) => {
        cb = f;
        return 1;
      },
      () => undefined,
    );
    loop.start();
    cb!(0);
    cb!(1000 / 30);
    expect(renders).toBe(2);
    expect(updates).toBeGreaterThanOrEqual(2);
    loop.stop();
    expect(loop.isRunning).toBe(false);
  });
});

describe('camera', () => {
  it('round-trips screen↔world', () => {
    const c = new Camera(1000, 800);
    c.setViewport(400, 300);
    c.zoom = 1.7;
    const w = c.screenToWorld(123, 77);
    const s = c.worldToScreen(w.x, w.y);
    expect(s.x).toBeCloseTo(123);
    expect(s.y).toBeCloseTo(77);
  });
  it('zoomAt keeps the cursor point fixed', () => {
    const c = new Camera(1000, 800);
    c.setViewport(400, 300);
    const before = c.screenToWorld(300, 100);
    c.zoomAt(300, 100, 1.5);
    const after = c.screenToWorld(300, 100);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
  it('eases toward follow target', () => {
    const c = new Camera(1000, 800);
    c.follow = () => ({ x: 100, y: 100 });
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(c.x).toBeCloseTo(100, 0);
  });
});

describe('speech bubbles', () => {
  it('layout never overlaps', () => {
    const rects = Array.from({ length: 6 }, (_, i) => ({ x: 100 + i * 5, y: 100, w: 80, h: 20 }));
    const out = layoutBubbles(rects);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(rectsOverlap(out[i]!, out[j]!)).toBe(false);
  });
  it('fades in and out', () => {
    expect(bubbleAlpha({ age: 0, ttl: 3 })).toBe(0);
    expect(bubbleAlpha({ age: 1, ttl: 3 })).toBe(1);
    expect(bubbleAlpha({ age: 2.9, ttl: 3 })).toBeLessThan(0.5);
  });
  it('keeps one bubble per bot and expires them', () => {
    const s = new BubbleSystem();
    s.say('a', 'one');
    s.say('a', 'two');
    expect(s.items).toHaveLength(1);
    expect(s.items[0]?.text).toBe('two');
    s.update(10);
    expect(s.items).toHaveLength(0);
  });
});

function makeSim() {
  const sim = new Simulation({ random: seeded() });
  for (const b of CORE_BOTS) sim.addBot(b);
  return sim;
}

function run(sim: Simulation, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) sim.update(1 / 60);
}

describe('simulation', () => {
  it('spawns all bots on distinct walkable tiles', () => {
    const sim = makeSim();
    const keys = new Set<string>();
    for (const b of sim.bots.values()) {
      const t = sim.botTile(b);
      expect(isWalkable(sim.grid, t.x, t.y)).toBe(true);
      keys.add(`${t.x},${t.y}`);
    }
    expect(keys.size).toBe(8);
  });
  it('walks a bot across HQ and arrives working', () => {
    const sim = makeSim();
    expect(sim.send('quill', { room: 'life', spot: 'center', arrive: 'working' })).toBe(true);
    expect(sim.getBot('quill')!.state).toBe('walking');
    run(sim, 30);
    const q = sim.getBot('quill')!;
    expect(q.state).toBe('working');
    expect(sim.botRoom(q)).toBe('life');
  });
  it('huddle start gathers bots and huddle end sends them home', () => {
    const sim = makeSim();
    sim.apply(makeEvent('group.huddle_start', { huddleId: 'h', botIds: ['daniel', 'kanye', 'barry'], topic: 'Ship' }));
    run(sim, 30);
    for (const id of ['daniel', 'kanye', 'barry']) {
      expect(sim.getBot(id)!.state).toBe('huddling');
      expect(sim.botRoom(sim.getBot(id)!)).toBe('huddle');
    }
    sim.apply(makeEvent('group.huddle_end', { huddleId: 'h' }));
    run(sim, 30);
    expect(sim.botRoom(sim.getBot('kanye')!)).toBe('engine');
  });
  it('delegation flies a packet and the target says "Got it"', () => {
    const sim = makeSim();
    sim.apply(makeEvent('bot.delegate', { from: 'daniel', to: 'greek', task: 'Render cut' }));
    expect(sim.getBot('daniel')!.state).toBe('delegating');
    expect(sim.packets).toHaveLength(1);
    run(sim, 10);
    expect(sim.packets).toHaveLength(0);
    expect(sim.getBot('greek')!.task).toBe('Render cut');
  });
  it('task.completed walks the deliverable back to Command', () => {
    const sim = makeSim();
    sim.apply(makeEvent('task.completed', { taskId: 't', botId: 'kanye', title: 'Build', deliverTo: 'daniel' }));
    expect(sim.getBot('kanye')!.carry).toBe('box');
    let visitedCommand = false;
    for (let i = 0; i < 60 * 30; i++) {
      sim.update(1 / 60);
      if (sim.botRoom(sim.getBot('kanye')!) === 'command') visitedCommand = true;
    }
    expect(visitedCommand).toBe(true);
    expect(sim.getBot('kanye')!.carry).toBeNull();
  });
  it('mail pending approval puts Quill in needs_input until sent', () => {
    const sim = makeSim();
    sim.apply(makeEvent('mail.pending_approval', { mailId: 'm', draftId: 'd', subject: 'Hi', words: 40 }));
    expect(sim.getBot('quill')!.state).toBe('needs_input');
    sim.apply(makeEvent('mail.sent', { draftId: 'd' }));
    expect(sim.getBot('quill')!.state).toBe('working');
  });
  it('asleep status sends bots home to sleep, working wakes them', () => {
    const sim = makeSim();
    sim.apply(makeEvent('bot.status', { botId: 'sift', status: 'asleep' }));
    run(sim, 10);
    expect(sim.getBot('sift')!.state).toBe('asleep');
    sim.apply(makeEvent('bot.status', { botId: 'sift', status: 'working' }));
    run(sim, 2);
    expect(['working', 'walking']).toContain(sim.getBot('sift')!.state);
  });
  it('dictation waves start and end', () => {
    const sim = makeSim();
    sim.apply(makeEvent('dictation.wave', { active: true, source: 'bridge' }));
    expect(sim.waveActive('bridge')).toBe(true);
    sim.apply(makeEvent('dictation.wave', { active: false, source: 'bridge', transcript: 'ship it' }));
    expect(sim.waveActive('bridge')).toBe(false);
  });
  it('relay dispatch tethers the bot to a model', () => {
    const sim = makeSim();
    sim.apply(makeEvent('relay.dispatched', { commandId: 'c', model: 'codex', botId: 'kanye' }));
    run(sim, 8);
    expect(sim.getBot('kanye')!.tether?.model).toBe('codex');
  });
  it('custom bots spawn and the sim stays stable for a long run', () => {
    const sim = makeSim();
    sim.addBot({ ...CORE_BOTS[7]!, id: 'x1', name: 'Pip', custom: true, home: 'foundry' });
    run(sim, 120);
    for (const b of sim.bots.values()) {
      expect(Number.isFinite(b.x)).toBe(true);
      const t = sim.botTile(b);
      expect(isWalkable(sim.grid, t.x, t.y)).toBe(true);
    }
  });
  it('reset restores bots to home', () => {
    const sim = makeSim();
    sim.send('kanye', { room: 'mail', spot: 'center', arrive: 'idle' });
    run(sim, 20);
    sim.reset();
    expect(sim.botRoom(sim.getBot('kanye')!)).toBe('engine');
    expect(sim.time).toBe(0);
  });
});
