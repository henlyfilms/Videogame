import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MarionEvent } from '../src/adapters/events';
import { LiveSimAdapter } from '../src/adapters/liveSim';
import { AdapterManager } from '../src/adapters/manager';
import { ReplayAdapter } from '../src/adapters/replay';
import { SCENARIOS } from '../src/adapters/scenarios';
import type { AdapterContext, ConnStatus } from '../src/adapters/types';
import { backoffDelay, isValidWsUrl, WebSocketAdapter, type WsLike } from '../src/adapters/websocket';
import { mulberry32 } from '../src/game/content';
import { HQ } from '../src/game/hq';
import { initialMechanics, reduceMechanics, type MechanicsState } from '../src/game/mechanics';
import { populateSim, wire } from '../src/game/wire';
import { Simulation } from '../src/engine/sim';
import { useGame } from '../src/store/gameStore';

function harness() {
  let mech: MechanicsState = initialMechanics();
  const events: MarionEvent[] = [];
  const statuses: ConnStatus[] = [];
  let resets = 0;
  const ctx: AdapterContext = {
    emit: (ev) => {
      events.push(ev);
      mech = reduceMechanics(mech, ev);
    },
    getMechanics: () => mech,
    reset: () => {
      resets++;
      mech = initialMechanics();
      events.length = 0;
    },
    setStatus: (s) => statuses.push(s),
  };
  return { ctx, events, statuses, mech: () => mech, resets: () => resets };
}

function runTicks(a: { tick: (dt: number) => void }, seconds: number, step = 100) {
  for (let t = 0; t < seconds * 1000; t += step) a.tick(step);
}

describe('LiveSimAdapter', () => {
  it('seeds a starter backlog and keeps HQ busy', () => {
    const h = harness();
    const a = new LiveSimAdapter({ rng: mulberry32(7) });
    a.start(h.ctx);
    expect(h.mech().mail.inbox.length).toBe(3);
    expect(h.mech().cutting.queue.length).toBe(3);
    runTicks(a, 180);
    const types = new Set(h.events.map((e) => e.type));
    for (const t of ['mail.received', 'reel.received', 'clip.received', 'bot.message', 'bot.delegate', 'task.created', 'task.completed', 'group.huddle_start', 'group.huddle_end', 'dictation.wave', 'relay.queued', 'mail.pending_approval'] as const) {
      expect(types.has(t), t).toBe(true);
    }
  });
  it('bots operate rooms autonomously but NEVER press the approval stamp', () => {
    const h = harness();
    const a = new LiveSimAdapter({ rng: mulberry32(3) });
    a.start(h.ctx);
    runTicks(a, 600);
    expect(h.events.some((e) => e.type === 'mail.sorted')).toBe(true);
    expect(h.events.some((e) => e.type === 'clip.sorted')).toBe(true);
    expect(h.events.some((e) => e.type === 'reel.distilled')).toBe(true);
    expect(h.events.some((e) => e.type === 'mail.sent')).toBe(false);
    expect(h.mech().mail.drafts.length).toBeLessThanOrEqual(3);
  });
  it('is deterministic for a given seed', () => {
    const run = () => {
      const h = harness();
      const a = new LiveSimAdapter({ rng: mulberry32(11) });
      a.start(h.ctx);
      runTicks(a, 60);
      return h.events.map((e) => e.type).join(',');
    };
    expect(run()).toBe(run());
  });
  it('stops emitting after stop()', () => {
    const h = harness();
    const a = new LiveSimAdapter({ rng: mulberry32(1) });
    a.start(h.ctx);
    a.stop();
    const n = h.events.length;
    runTicks(a, 60);
    expect(h.events.length).toBe(n);
  });
});

describe('ReplayAdapter', () => {
  it('ships 3 scenarios with valid steps', () => {
    expect(SCENARIOS.map((s) => s.title)).toEqual(['Marion Agent Feature Sprint', 'Multi-Bot Orchestration', 'Morning Triage & Media Distill']);
    for (const s of SCENARIOS) {
      expect(s.steps.length).toBeGreaterThan(10);
      expect(s.duration).toBeGreaterThan(s.steps.at(-1)!.at);
    }
  });
  it('plays deterministically: identical ids, timestamps and final state', () => {
    const run = () => {
      const h = harness();
      const r = new ReplayAdapter('feature-sprint');
      r.start(h.ctx);
      runTicks(r, 60, 50);
      return { evs: JSON.stringify(h.events), mech: JSON.stringify(h.mech()) };
    };
    const a = run();
    const b = run();
    expect(a.evs).toBe(b.evs);
    expect(a.mech).toBe(b.mech);
  });
  it('rates scale playback (0.5x / 1x / 2x / 4x)', () => {
    for (const rate of [0.5, 1, 2, 4]) {
      const h = harness();
      const r = new ReplayAdapter('orchestration');
      r.start(h.ctx);
      r.setRate(rate);
      r.tick(1000);
      expect(r.t).toBe(1000 * rate);
    }
    const r = new ReplayAdapter();
    r.setRate(3);
    expect(r.rate).toBe(1);
  });
  it('seeking resets and re-applies events up to the target', () => {
    const h = harness();
    const r = new ReplayAdapter('morning-triage');
    r.start(h.ctx);
    r.seek(20_000);
    const at20 = h.events.length;
    expect(at20).toBe(SCENARIOS[2]!.steps.filter((s) => s.at <= 20_000).length);
    expect(h.mech().mail.drafts.length).toBe(2);
    r.seek(5_000);
    expect(h.events.length).toBeLessThan(at20);
    expect(h.resets()).toBe(3);
  });
  it('the feature sprint reaches Render Green and ships v1.1.0', () => {
    const h = harness();
    const r = new ReplayAdapter('feature-sprint');
    r.start(h.ctx);
    r.seek(r.duration);
    expect(h.mech().command.version).toBe('1.1.0');
    expect(h.mech().cutting.greenBuilds).toBe(1);
    expect(r.playing).toBe(true);
    r.tick(10);
    expect(r.playing).toBe(false);
  });
});

class MockWs implements WsLike {
  static instances: MockWs[] = [];
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(public url: string) {
    MockWs.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  send(data: unknown) {
    this.onmessage?.({ data });
  }
  fail() {
    this.readyState = 3;
    this.onclose?.({});
  }
  close() {
    this.closed = true;
  }
}

describe('WebSocketAdapter', () => {
  beforeEach(() => {
    MockWs.instances = [];
  });
  const make = (opts = {}) => new WebSocketAdapter('ws://localhost:9999/marion', { factory: (u) => new MockWs(u), fallback: () => new LiveSimAdapter({ rng: mulberry32(5), seedBacklog: false }), ...opts });

  it('computes exponential backoff with a cap', () => {
    expect([0, 1, 2, 3].map((n) => backoffDelay(n, 500, 15000))).toEqual([500, 1000, 2000, 4000]);
    expect(backoffDelay(20, 500, 15000)).toBe(15000);
  });
  it('validates URLs', () => {
    expect(isValidWsUrl('wss://x.dev/a')).toBe(true);
    expect(isValidWsUrl('http://x.dev')).toBe(false);
    expect(isValidWsUrl('nope')).toBe(false);
  });
  it('emits schema-valid events and rejects invalid frames', () => {
    const h = harness();
    const a = make();
    a.start(h.ctx);
    const ws = MockWs.instances[0]!;
    ws.open();
    expect(h.statuses.at(-1)).toBe('open');
    ws.send(JSON.stringify({ type: 'bot.status', payload: { botId: 'kanye', status: 'working' } }));
    ws.send(JSON.stringify([{ type: 'mail.received', payload: { mailId: 'm', from: 'a', subject: 'b', hint: 'fyi' } }, { type: 'bot.status', payload: { botId: 'x', status: 'flying' } }]));
    ws.send(JSON.stringify({ events: [{ type: 'group.huddle_end', payload: { huddleId: 'h' } }] }));
    ws.send('garbage{');
    expect(a.received).toBe(3);
    expect(a.rejected).toBe(2);
    expect(h.events.map((e) => e.type)).toEqual(['bot.status', 'mail.received', 'group.huddle_end']);
  });
  it('reconnects with backoff and falls back to the live sim, then recovers', () => {
    const h = harness();
    const a = make({ baseDelayMs: 100, fallbackAfter: 2 });
    a.start(h.ctx);
    MockWs.instances[0]!.fail();
    expect(h.statuses.at(-1)).toBe('reconnecting');
    expect(a.isFallingBack).toBe(false);
    a.tick(100);
    expect(MockWs.instances).toHaveLength(2);
    MockWs.instances[1]!.fail();
    expect(a.isFallingBack).toBe(true);
    expect(h.statuses.at(-1)).toBe('fallback');
    // Fallback keeps the HQ alive.
    runTicks(a, 30);
    expect(h.events.length).toBeGreaterThan(0);
    // Next attempt (200ms backoff) succeeds → fallback stops.
    const third = MockWs.instances.at(-1)!;
    third.open();
    expect(a.isFallingBack).toBe(false);
    expect(h.statuses.at(-1)).toBe('open');
  });
  it('invalid URLs go straight to fallback', () => {
    const h = harness();
    const a = new WebSocketAdapter('http://bad', { factory: (u) => new MockWs(u), fallback: () => new LiveSimAdapter({ seedBacklog: false }) });
    a.start(h.ctx);
    expect(MockWs.instances).toHaveLength(0);
    expect(a.isFallingBack).toBe(true);
    expect(h.statuses.at(-1)).toBe('fallback');
  });
  it('stop() closes the socket and halts retries', () => {
    const h = harness();
    const a = make();
    a.start(h.ctx);
    const ws = MockWs.instances[0]!;
    a.stop();
    expect(ws.closed).toBe(true);
    a.tick(60_000);
    expect(MockWs.instances).toHaveLength(1);
  });
});

describe('AdapterManager', () => {
  let hq: HQ;
  let unwire: () => void;
  beforeEach(() => {
    localStorage.clear();
    useGame.getState().resetMechanics(false);
    hq = new HQ(new Simulation({ random: () => 0.4 }));
    populateSim(hq);
    unwire = wire(hq);
  });
  afterEach(() => unwire());

  it('switches live → replay → live and sandboxes replay state', () => {
    const m = new AdapterManager(hq, useGame, { wsFactory: (u) => new MockWs(u) });
    m.use('live');
    expect(useGame.getState().adapter).toBe('live');
    expect(useGame.getState().mech.mail.inbox.length).toBeGreaterThan(0);
    m.use('replay');
    expect(useGame.getState().adapter).toBe('replay');
    m.replay!.seek(m.replay!.duration);
    expect(useGame.getState().mech.command.version).toBe('1.1.0');
    expect(useGame.getState().replay.duration).toBe(m.replay!.duration);
    m.use('live');
    expect(useGame.getState().mech.command.version).toBe('1.0.0');
    m.use('ws');
    expect(useGame.getState().conn).toBe('connecting');
    m.stop();
  });
  it('drives the adapter from the HQ fixed step (pausable)', () => {
    const m = new AdapterManager(hq, useGame, { liveSeed: false });
    const a = m.use('live') as LiveSimAdapter;
    hq.step(1 / 60);
    expect(a.time).toBeCloseTo(1000 / 60);
    hq.paused = true;
    hq.step(1 / 60);
    expect(a.time).toBeCloseTo(1000 / 60);
    hq.paused = false;
    hq.speed = 4;
    hq.step(1 / 60);
    expect(a.time).toBeCloseTo(5000 / 60);
    m.stop();
  });
});
