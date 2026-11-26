import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCADE_EVENT_TYPES, eventRoom, makeEvent, parseMarionEvent, type EventPayloads, type MarionEvent } from '../src/adapters/events';
import { LiveSimAdapter } from '../src/adapters/liveSim';
import { createArcadeBridge, type MysteryStoreLike, type MysteryViewLike } from '../src/arcade/bridge';
import { planBotMatch } from '../src/arcade/botMatch';
import { ARCADE_GAMES } from '../src/arcade/registry';
import { useArcade } from '../src/arcade/state';
import { CORE_BOTS } from '../src/data/bots';
import { Simulation } from '../src/engine/sim';
import { buildGrid, isTerrace, isWalkable, MAP_W, ROOM_BY_ID, spotTile, Tile } from '../src/engine/world';
import { describeEvent } from '../src/game/describe';
import { mulberry32 } from '../src/game/content';
import { hq } from '../src/game/hq';
import { ARCADE_RECENT, arcadeRanking, initialMechanics, reduceMechanics, type MechanicsState } from '../src/game/mechanics';
import { buildCommands, sampleArcadeEvent } from '../src/ui/CommandPalette';
import { botName, loadPersisted, persistedFrom, startPersistence, STORAGE_KEY, useGame } from '../src/store/gameStore';

// The real game is heavy (Three.js etc.); the HQ only needs to prove it mounts it lazily.
vi.mock('../src/mystery/ui/MysteryApp', () => {
  const Fake = ({ onExit }: { onExit?: () => void }) => (
    <div data-testid="mystery-app">
      Marion Mystery title
      <button onClick={onExit}>Marion HQ</button>
    </div>
  );
  return { default: Fake, MysteryApp: Fake };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ended = (over: Partial<EventPayloads['arcade.match_ended']> = {}): EventPayloads['arcade.match_ended'] => ({
  matchId: 'm1',
  mode: 'classic',
  map: 'greenhouse',
  winningTeam: 'crew',
  reason: 'tasks',
  mvp: 'sift',
  results: [
    { botId: 'sift', won: true, role: 'crewmate' },
    { botId: 'kanye', won: false, role: 'murderer' },
    { botId: 'you', won: true, role: 'sheriff' },
  ],
  ...over,
});

describe('arcade.* event schema', () => {
  it('validates the three arcade events', () => {
    const started = makeEvent('arcade.match_started', { mode: 'lightsout', map: 'manor', players: 8, bots: ['kanye', 'sift'] });
    const joined = makeEvent('arcade.player_joined', { botId: 'moose', name: 'Moose' });
    const done = makeEvent('arcade.match_ended', ended());
    for (const ev of [started, joined, done]) expect(parseMarionEvent(JSON.parse(JSON.stringify(ev))), ev.type).toEqual(ev);
    expect(ARCADE_EVENT_TYPES).toEqual(['arcade.match_started', 'arcade.player_joined', 'arcade.match_ended']);
    expect(eventRoom(done)).toBe('arcade');
  });

  it('rejects malformed payloads and strips unknown keys (also inside result rows)', () => {
    expect(parseMarionEvent({ type: 'arcade.match_started', payload: { mode: 'chess', map: 'hq', players: 4, bots: [] } })).toBeNull();
    expect(parseMarionEvent({ type: 'arcade.match_started', payload: { mode: 'classic', map: 'hq', players: -1, bots: [] } })).toBeNull();
    expect(parseMarionEvent({ type: 'arcade.match_started', payload: { mode: 'classic', map: 'hq', players: 4, bots: [1] } })).toBeNull();
    expect(parseMarionEvent({ type: 'arcade.player_joined', payload: { botId: 'kanye' } })).toBeNull();
    expect(parseMarionEvent({ type: 'arcade.match_ended', payload: { ...ended(), results: [{ botId: 'a', won: 'yes', role: 'x' }] } })).toBeNull();
    expect(parseMarionEvent({ type: 'arcade.match_ended', payload: { ...ended(), results: 'nope' } })).toBeNull();
    expect(parseMarionEvent({ type: 'arcade.match_ended', payload: { ...ended(), winningTeam: 'aliens' } })).toBeNull();
    const ev = parseMarionEvent({ type: 'arcade.match_ended', payload: { ...ended(), extra: 1, results: [{ botId: 'sift', won: true, role: 'crewmate', hax: true }] } });
    expect(ev).not.toBeNull();
    const p = ev!.payload as Record<string, unknown>;
    expect(p.extra).toBeUndefined();
    expect(p.results).toEqual([{ botId: 'sift', won: true, role: 'crewmate' }]);
  });

  it('describes arcade events for the activity feed', () => {
    expect(describeEvent(makeEvent('arcade.player_joined', { botId: 'kanye', name: 'Kanye' }), botName)).toContain('Kanye');
    expect(describeEvent(makeEvent('arcade.match_started', { mode: 'hideseek', map: 'express', players: 6, bots: ['sift'] }), botName)).toContain('Hide & Seek');
    expect(describeEvent(makeEvent('arcade.match_ended', ended()), botName)).toMatch(/Crew win.*Sift.*MVP Sift/);
  });
});

describe('arcade reducer', () => {
  it('tracks live match, leaderboard (wins/games/MVPs per bot + you) and recent results', () => {
    let s: MechanicsState = initialMechanics();
    s = reduceMechanics(s, makeEvent('arcade.player_joined', { botId: 'kanye', name: 'Kanye' }));
    s = reduceMechanics(s, makeEvent('arcade.match_started', { matchId: 'm1', mode: 'classic', map: 'hq', players: 6, bots: ['kanye', 'sift'] }));
    expect(s.arcade.live?.id).toBe('m1');
    expect(s.arcade.players).toEqual(['kanye', 'sift']);
    s = reduceMechanics(s, makeEvent('arcade.match_ended', ended()));
    expect(s.arcade.live).toBeNull();
    expect(s.arcade.players).toEqual([]);
    expect(s.arcade.leaderboard.sift).toEqual({ wins: 1, games: 1, mvps: 1 });
    expect(s.arcade.leaderboard.kanye).toEqual({ wins: 0, games: 1, mvps: 0 });
    expect(s.arcade.leaderboard.you).toEqual({ wins: 1, games: 1, mvps: 0 });
    // The same match reported twice only counts once.
    const again = reduceMechanics(s, makeEvent('arcade.match_ended', ended()));
    expect(again).toBe(s);
    s = reduceMechanics(s, makeEvent('arcade.match_ended', ended({ matchId: 'm2', winningTeam: 'murderers', mvp: 'kanye', results: [{ botId: 'kanye', won: true, role: 'murderer' }, { botId: 'sift', won: false, role: 'crewmate' }] })));
    expect(arcadeRanking(s.arcade).map((r) => r.id)).toEqual(['you', 'kanye', 'sift']);
    for (let i = 0; i < 15; i++) s = reduceMechanics(s, makeEvent('arcade.match_ended', ended({ matchId: `x${i}` })));
    expect(s.arcade.recent).toHaveLength(ARCADE_RECENT);
    expect(s.arcade.recent.at(-1)!.id).toBe('x14');
    expect(s.arcade.leaderboard.sift!.games).toBe(17);
  });

  it('a bots-only match ending does not clear a different live match', () => {
    let s = initialMechanics();
    s = reduceMechanics(s, makeEvent('arcade.match_started', { matchId: 'yours', mode: 'classic', map: 'hq', players: 8, bots: [] }));
    s = reduceMechanics(s, makeEvent('arcade.match_ended', ended({ matchId: 'bots' })));
    expect(s.arcade.live?.id).toBe('yours');
  });
});

describe('arcade persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useGame.getState().resetMechanics(false);
    useGame.getState().setAdapter('live');
  });

  it('round-trips the leaderboard and recent results through localStorage', () => {
    const stop = startPersistence();
    useGame.getState().ingest(makeEvent('arcade.match_started', { matchId: 'm1', mode: 'classic', map: 'hq', players: 6, bots: ['sift'] }));
    useGame.getState().ingest(makeEvent('arcade.match_ended', ended()));
    stop();
    const saved = loadPersisted();
    expect(saved.arcade?.leaderboard.sift).toEqual({ wins: 1, games: 1, mvps: 1 });
    expect(saved.arcade?.recent).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).arcade.recent[0].id).toBe('m1');
    // Live state is session-only.
    expect((saved.arcade as Record<string, unknown>).live).toBeUndefined();

    useGame.getState().resetMechanics(false);
    expect(useGame.getState().mech.arcade.recent).toHaveLength(0);
    useGame.getState().restoreFromStorage();
    const a = useGame.getState().mech.arcade;
    expect(a.leaderboard).toEqual(saved.arcade!.leaderboard);
    expect(a.recent[0]?.results).toEqual(ended().results);
    expect(a.live).toBeNull();
  });

  it('keeps arcade progress across a soft reset and ignores corrupt arcade data', () => {
    useGame.getState().ingest(makeEvent('arcade.match_ended', ended()));
    useGame.getState().resetMechanics(true);
    expect(useGame.getState().mech.arcade.leaderboard.sift?.wins).toBe(1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...persistedFrom(useGame.getState()), arcade: { leaderboard: { sift: { wins: 'lots' } }, recent: [null, 5] } }));
    useGame.getState().restoreFromStorage();
    expect(useGame.getState().mech.arcade).toEqual({ leaderboard: {}, recent: [], live: null, players: [] });
  });
});

describe('arcade floorplan', () => {
  it('adds the Arcade as a 4th-row room with a terrace (Void) either side and a corridor ring', () => {
    const g = buildGrid();
    const a = ROOM_BY_ID.arcade;
    expect(a.y).toBeGreaterThan(ROOM_BY_ID.huddle.y);
    expect(a.x).toBe(ROOM_BY_ID.huddle.x);
    // Terrace cells are not walkable; the corridor that reaches the arcade door is.
    const midY = a.y + 5;
    expect(isTerrace(5, midY)).toBe(true);
    expect(g.tiles[midY * MAP_W + 5]).toBe(Tile.Void);
    expect(g.tiles[midY * MAP_W + (MAP_W - 6)]).toBe(Tile.Void);
    expect(isWalkable(g, a.x + 8, a.y - 1)).toBe(true); // corridor above the top door
    expect(isWalkable(g, a.x - 1, midY)).toBe(true); // ring beside the side door
    const mystery = a.props.find((p) => p.id === 'mystery')!;
    expect(mystery.kind).toBe('arcade-cabinet');
    expect(mystery.hotspot).toBe('arcade');
    expect(a.props.find((p) => p.kind === 'leaderboard')?.hotspot).toBe('leaderboard');
    expect(a.props.filter((p) => p.kind === 'arcade-cabinet').length).toBeGreaterThanOrEqual(4);
  });
});

describe('simulation reacts to arcade events', () => {
  const step = (sim: Simulation, seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) sim.update(1 / 60);
  };

  it('a joining bot walks to an Arcade cabinet and plays; match end makes winners cheer and losers sulk', () => {
    const sim = new Simulation({ random: mulberry32(4) });
    for (const b of CORE_BOTS) sim.addBot(b);
    sim.apply(makeEvent('arcade.player_joined', { botId: 'kanye', name: 'Kanye' }));
    sim.apply(makeEvent('arcade.player_joined', { botId: 'sift', name: 'Sift' }));
    const kanye = sim.getBot('kanye')!;
    expect(kanye.state).toBe('walking');
    expect(sim.bubbles.items.some((b) => b.botId === 'kanye')).toBe(true);
    step(sim, 30);
    expect(sim.botRoom(kanye)).toBe('arcade');
    expect(kanye.state).toBe('working');
    expect(kanye.mood?.kind).toBe('play');
    expect(sim.arcadePlayers().map((b) => b.def.id).sort()).toEqual(['kanye', 'sift']);
    // Two bots got two different cabinets.
    expect(sim.botTile(kanye)).not.toEqual(sim.botTile(sim.getBot('sift')!));
    const before = sim.particles.length;
    sim.apply(makeEvent('arcade.match_ended', ended()));
    expect(sim.getBot('sift')!.mood?.kind).toBe('cheer');
    expect(kanye.mood?.kind).toBe('sulk');
    expect(sim.particles.length).toBeGreaterThan(before);
    expect(sim.particles.some((p) => p.kind === 'text' && /MVP/.test(p.text ?? ''))).toBe(true);
    // They wrap up and head home afterwards.
    step(sim, 40);
    expect(sim.botRoom(kanye)).not.toBe('arcade');
  });

  it('match_started sends listed bots that are not there yet', () => {
    const sim = new Simulation({ random: mulberry32(9) });
    for (const b of CORE_BOTS) sim.addBot(b);
    sim.apply(makeEvent('arcade.match_started', { mode: 'classic', map: 'hq', players: 5, bots: ['greek', 'quill'] }));
    expect(sim.getBot('greek')!.intent?.room).toBe('arcade');
    expect(sim.getBot('quill')!.intent?.room).toBe('arcade');
  });
});

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

function fakeMysteryStore(initial: MysteryViewLike) {
  let state = initial;
  const listeners = new Set<(s: MysteryViewLike, p: MysteryViewLike) => void>();
  const store: MysteryStoreLike = {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const set = (patch: Partial<MysteryViewLike>) => {
    const prev = state;
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state, prev);
  };
  return { store, set, listeners };
}

const players = [
  { id: 'p1', name: 'Berry', kind: 'human' as const },
  { id: 'b1', name: 'Kanye', kind: 'bot' as const, look: 'kanye' },
  { id: 'b2', name: 'Sift', kind: 'bot' as const, look: 'sift' },
  { id: 'b3', name: 'Rando', kind: 'bot' as const },
];
const room = (stage: 'lobby' | 'countdown' | 'match' | 'results', ps = players) => ({ code: 'ACDEFG', stage, settings: { mode: 'lightsout', map: 'manor' }, players: ps });
const result = (endedAt: number) => ({ winningTeam: 'murderers', reason: 'parity', winners: ['b1'], mvp: 'b1', endedAt, roles: { p1: 'crewmate', b1: 'murderer', b2: 'medic', b3: 'crewmate' } });

describe('arcade bridge (Mystery store → HQ bus)', () => {
  it('publishes joined / started / ended exactly once per match', () => {
    const events: MarionEvent[] = [];
    const { store, set, listeners } = fakeMysteryStore({ pid: '', room: null, snap: null });
    const stop = createArcadeBridge(store, (ev) => events.push(ev));
    set({ pid: 'p1' });
    set({ room: room('lobby', players.slice(0, 2)) });
    set({ room: room('lobby') });
    set({ room: room('lobby') });
    set({ room: room('countdown') });
    set({ room: room('match') });
    for (let i = 0; i < 5; i++) set({ snap: { mode: 'lightsout', map: 'manor', result: null } });
    set({ snap: { mode: 'lightsout', map: 'manor', result: result(100) } });
    set({ snap: { mode: 'lightsout', map: 'manor', result: result(100) } });
    set({ room: room('results') });
    set({ snap: { mode: 'lightsout', map: 'manor', result: result(100) } });

    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === 'arcade.player_joined')).toHaveLength(2);
    expect(types.filter((t) => t === 'arcade.match_started')).toHaveLength(1);
    expect(types.filter((t) => t === 'arcade.match_ended')).toHaveLength(1);
    expect(types.indexOf('arcade.match_started')).toBeLessThan(types.indexOf('arcade.match_ended'));
    for (const ev of events) expect(parseMarionEvent(JSON.parse(JSON.stringify(ev))), ev.type).not.toBeNull();

    const started = events.find((e) => e.type === 'arcade.match_started')!.payload as EventPayloads['arcade.match_started'];
    expect(started).toMatchObject({ mode: 'lightsout', map: 'manor', players: 4, bots: ['kanye', 'sift'] });
    const end = events.find((e) => e.type === 'arcade.match_ended')!.payload as EventPayloads['arcade.match_ended'];
    expect(end.winningTeam).toBe('murderers');
    expect(end.mvp).toBe('kanye');
    expect(end.matchId).toBe(started.matchId);
    expect(end.results).toEqual([
      { botId: 'you', won: false, role: 'crewmate' },
      { botId: 'kanye', won: true, role: 'murderer' },
      { botId: 'sift', won: false, role: 'medic' },
    ]);

    // Rematch: back to the lobby, then a second match → one more of each.
    set({ room: room('lobby'), snap: null });
    set({ room: room('match') });
    set({ snap: { result: result(250) } });
    set({ snap: { result: result(250) } });
    expect(events.filter((e) => e.type === 'arcade.match_started')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'arcade.match_ended')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'arcade.player_joined')).toHaveLength(4);

    stop();
    expect(listeners.size).toBe(0);
    set({ room: room('lobby') });
    set({ room: room('match') });
    expect(events.filter((e) => e.type === 'arcade.match_started')).toHaveLength(2);
  });

  it('feeding the bridge into the HQ reducer updates the leaderboard once', () => {
    let mech = initialMechanics();
    const { store, set } = fakeMysteryStore({ pid: 'p1', room: room('lobby'), snap: null });
    createArcadeBridge(store, (ev) => (mech = reduceMechanics(mech, ev)));
    set({ room: room('match') });
    set({ snap: { result: result(9) } });
    set({ snap: { result: result(9) } });
    expect(mech.arcade.leaderboard.kanye).toEqual({ wins: 1, games: 1, mvps: 1 });
    expect(mech.arcade.leaderboard.you).toEqual({ wins: 0, games: 1, mvps: 0 });
    expect(mech.arcade.recent).toHaveLength(1);
  });
});

describe('live sim + palette presets', () => {
  it('the LiveSimAdapter occasionally runs bots-only arcade matches', () => {
    let mech = initialMechanics();
    const events: MarionEvent[] = [];
    const a = new LiveSimAdapter({ rng: mulberry32(21), seedBacklog: false });
    a.start({ emit: (ev) => (events.push(ev), (mech = reduceMechanics(mech, ev))), getMechanics: () => mech, reset: () => undefined, setStatus: () => undefined });
    for (let t = 0; t < 400_000; t += 100) a.tick(100);
    const types = events.map((e) => e.type);
    for (const t of ARCADE_EVENT_TYPES) expect(types.includes(t), t).toBe(true);
    expect(mech.arcade.recent.length).toBeGreaterThan(0);
    for (const ev of events.filter((e) => e.type.startsWith('arcade.'))) expect(parseMarionEvent(JSON.parse(JSON.stringify(ev)))).not.toBeNull();
  });

  it('bot match plans are coherent', () => {
    const plan = planBotMatch(mulberry32(5));
    expect(plan.joins.map((j) => j.botId)).toEqual(plan.started.bots);
    expect(plan.ended.results.map((r) => r.botId)).toEqual(plan.started.bots);
    expect(plan.ended.results.some((r) => r.won)).toBe(true);
  });

  it('⌘K has one-click arcade injector presets that validate', () => {
    const cmds = buildCommands(() => undefined).filter((c) => c.group === 'Arcade');
    for (const t of ARCADE_EVENT_TYPES) expect(cmds.some((c) => c.title === `Inject ${t}`)).toBe(true);
    expect(cmds.some((c) => c.title === 'Play Marion Mystery')).toBe(true);
    for (const t of ARCADE_EVENT_TYPES) expect(parseMarionEvent(JSON.parse(JSON.stringify(makeEvent(t, sampleArcadeEvent(t)))))).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UI: Arcade panel + lazy Marion Mystery overlay
// ---------------------------------------------------------------------------

describe('Arcade panel & overlay', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useArcade.getState().close();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('registry has Marion Mystery live plus coming-soon slots', () => {
    expect(ARCADE_GAMES[0]!.status).toBe('live');
    expect(ARCADE_GAMES[0]!.name).toBe('Marion Mystery');
    expect(ARCADE_GAMES.filter((g) => g.status === 'soon').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the panel (leaderboard, recent, coming soon) and Play mounts the lazy MysteryApp; exit restores the HQ', async () => {
    useGame.getState().resetMechanics(false);
    useGame.getState().ingest(makeEvent('arcade.match_ended', ended()));
    const { RoomPanelBody } = await import('../src/ui/rooms/RoomPanels');
    const { ArcadeOverlay } = await import('../src/arcade/ArcadeOverlay');
    await act(async () => {
      root.render(
        <>
          <RoomPanelBody room="arcade" />
          <ArcadeOverlay />
        </>,
      );
    });
    expect(host.textContent).toContain('Play Marion Mystery');
    expect(host.textContent).toContain('Quick Play');
    expect(host.querySelector('[aria-label="Join code"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Arcade leaderboard"]')!.textContent).toContain('Sift');
    expect(host.querySelector('[aria-label="Recent matches"]')!.textContent).toContain('Greenhouse');
    for (const g of ARCADE_GAMES.filter((x) => x.status === 'soon')) expect(host.textContent).toContain(g.name);
    expect(host.querySelector('[data-testid="mystery-app"]')).toBeNull();

    const play = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Play Marion Mystery'))!;
    await act(async () => {
      play.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(host.querySelector('[data-testid="mystery-app"]')).not.toBeNull();
    expect(host.querySelector('[data-arcade-overlay]')).not.toBeNull();
    expect(hq.renderSuspended).toBe(true);

    const exit = [...host.querySelectorAll('[data-testid="mystery-app"] button')].find((b) => b.textContent === 'Marion HQ') as HTMLButtonElement;
    await act(async () => {
      exit.click();
    });
    expect(host.querySelector('[data-testid="mystery-app"]')).toBeNull();
    expect(useArcade.getState().open).toBeNull();
    expect(hq.renderSuspended).toBe(false);
  });

  it('join by code only enables for a valid Mystery code', async () => {
    const { ArcadePanel } = await import('../src/ui/rooms/ArcadePanel');
    await act(async () => {
      root.render(<ArcadePanel />);
    });
    const input = host.querySelector('[aria-label="Join code"]') as HTMLInputElement;
    const join = host.querySelector('[aria-label="Join by code"]') as HTMLButtonElement;
    expect(join.disabled).toBe(true);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, 'acd-efg');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(input.value).toBe('ACDEFG');
    expect(join.disabled).toBe(false);
    await act(async () => {
      join.click();
    });
    expect(useArcade.getState().open).toBe('marion-mystery');
    expect(useArcade.getState().intent).toEqual({ kind: 'join', code: 'ACDEFG' });
    useArcade.getState().close();
  });
});

it('spot sanity: every arcade seat is on the arcade floor', () => {
  const g = buildGrid();
  for (const s of ROOM_BY_ID.arcade.spots) {
    const t = spotTile('arcade', s.name);
    expect(isWalkable(g, t.x, t.y), s.name).toBe(true);
  }
});
