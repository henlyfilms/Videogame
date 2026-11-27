/**
 * Zustand store: mechanics state (reduced from MarionEvents), the activity
 * feed, HUD settings and localStorage persistence.
 */
import { create } from 'zustand';
import type { MarionEvent } from '../adapters/events';
import { eventBot, eventRoom } from '../adapters/events';
import { CORE_BOTS, type RoomId } from '../data/bots';
import { describeEvent, isQuietEvent } from '../game/describe';
import { ARCADE_RECENT, initialMechanics, reduceMechanics, type MechanicsState } from '../game/mechanics';
import { nextTheme, type ThemeName } from '../theme/tokens';
import { SEASONS, type HqView, type Season, type TimeMode } from '../theme/environment';

import type { AdapterKind, ConnStatus } from '../adapters/types';
export type { AdapterKind, ConnStatus };

export interface FeedItem {
  id: string;
  ts: number;
  type: MarionEvent['type'];
  text: string;
  room: RoomId | null;
  botId: string | null;
  cross: boolean;
}

export interface ReplayState {
  scenario: string;
  t: number;
  duration: number;
  playing: boolean;
  rate: number;
}

export interface GameState {
  mech: MechanicsState;
  feed: FeedItem[];
  theme: ThemeName;
  /** HQ view: classic plan (2D) or the 3D diorama. */
  hqView: HqView;
  /** 'auto' follows the calendar. */
  season: Season | 'auto';
  timeMode: TimeMode;
  muted: boolean;
  showFps: boolean;
  fps: number;
  speed: number;
  paused: boolean;
  adapter: AdapterKind;
  wsUrl: string;
  conn: ConnStatus;
  connInfo: string | null;
  replay: ReplayState;
  selectedBot: string | null;
  selectedRoom: RoomId | null;
  paletteOpen: boolean;
  feedOpen: boolean;
  helpOpen: boolean;
  turntable: boolean;
  bridgeDictating: boolean;
  /** Bumped on every ingested event (cheap change signal). */
  eventCount: number;

  ingest: (ev: MarionEvent) => void;
  resetMechanics: (keepPersistent?: boolean) => void;
  restoreFromStorage: () => void;
  setTheme: (t: ThemeName) => void;
  setHqView: (v: HqView) => void;
  setSeason: (s: Season | 'auto') => void;
  setTimeMode: (t: TimeMode) => void;
  cycleTheme: () => void;
  toggleMute: () => void;
  toggleFps: () => void;
  setFps: (fps: number) => void;
  setSpeed: (s: number) => void;
  togglePause: () => void;
  setPaused: (p: boolean) => void;
  setAdapter: (a: AdapterKind) => void;
  setWsUrl: (u: string) => void;
  setConn: (c: ConnStatus, info?: string | null) => void;
  setReplay: (r: Partial<ReplayState>) => void;
  selectBot: (id: string | null) => void;
  selectRoom: (id: RoomId | null) => void;
  setPalette: (open: boolean) => void;
  toggleFeed: () => void;
  setHelp: (open: boolean) => void;
  setTurntable: (on: boolean) => void;
  setBridgeDictating: (on: boolean) => void;
}

export const STORAGE_KEY = 'marion-hq:v1';
export const FEED_LIMIT = 150;
export const SPEEDS = [0.5, 1, 2, 4] as const;

export interface Persisted {
  theme: ThemeName;
  hqView?: HqView;
  season?: Season | 'auto';
  timeMode?: TimeMode;
  muted: boolean;
  showFps: boolean;
  wsUrl: string;
  turntable: boolean;
  skills: MechanicsState['foundry']['skills'];
  customBots: MechanicsState['foundry']['customBots'];
  progress: MechanicsState['progress'];
  cards: MechanicsState['life']['cards'];
  arcade: Pick<MechanicsState['arcade'], 'leaderboard' | 'recent'>;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadPersisted(): Partial<Persisted> {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Partial<Persisted>;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function persistedFrom(s: GameState): Persisted {
  return {
    theme: s.theme,
    hqView: s.hqView,
    season: s.season,
    timeMode: s.timeMode,
    muted: s.muted,
    showFps: s.showFps,
    wsUrl: s.wsUrl,
    turntable: s.turntable,
    skills: s.mech.foundry.skills,
    customBots: s.mech.foundry.customBots,
    progress: s.mech.progress,
    cards: s.mech.life.cards,
    arcade: { leaderboard: s.mech.arcade.leaderboard, recent: s.mech.arcade.recent },
  };
}

export function savePersisted(p: Persisted): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked — persistence is best-effort */
  }
}

function hydrateMechanics(p: Partial<Persisted>): MechanicsState {
  const m = initialMechanics();
  const valid = <T>(v: unknown, check: (x: unknown) => boolean): v is T => check(v);
  if (valid<Persisted['skills']>(p.skills, Array.isArray)) m.foundry.skills = p.skills.filter((s) => typeof s === 'string').slice(0, 4);
  if (valid<Persisted['customBots']>(p.customBots, Array.isArray)) m.foundry.customBots = p.customBots.filter((b) => b && typeof b.botId === 'string').slice(0, 4);
  if (p.progress && typeof p.progress.streak === 'number') m.progress = { ...m.progress, ...p.progress };
  if (valid<Persisted['cards']>(p.cards, Array.isArray) && p.cards.length) m.life.cards = p.cards.filter((c) => c && typeof c.id === 'string');
  m.arcade = { ...m.arcade, ...hydrateArcade(p.arcade) };
  return m;
}

function hydrateArcade(raw: unknown): Persisted['arcade'] {
  const out: Persisted['arcade'] = { leaderboard: {}, recent: [] };
  if (!raw || typeof raw !== 'object') return out;
  const a = raw as Partial<Persisted['arcade']>;
  if (a.leaderboard && typeof a.leaderboard === 'object') {
    for (const [id, st] of Object.entries(a.leaderboard)) {
      if (!st || typeof st.wins !== 'number' || typeof st.games !== 'number') continue;
      out.leaderboard[id] = { wins: Math.max(0, st.wins | 0), games: Math.max(0, st.games | 0), mvps: typeof st.mvps === 'number' ? Math.max(0, st.mvps | 0) : 0 };
    }
  }
  if (Array.isArray(a.recent)) {
    out.recent = a.recent
      .filter((r) => r && typeof r.id === 'string' && typeof r.mode === 'string' && Array.isArray(r.results))
      .slice(-ARCADE_RECENT);
  }
  return out;
}

const nameCache = new Map<string, string>([...CORE_BOTS.map((b) => [b.id, b.name] as [string, string]), ['you', 'You']]);
/** Remember display names for non-HQ ids (e.g. arcade players). */
export function rememberName(id: string, name: string): void {
  if (!nameCache.has(id)) nameCache.set(id, name);
}
export function botName(id: string): string {
  return nameCache.get(id) ?? id;
}

function makeStore() {
  const p = loadPersisted();
  return create<GameState>()((set, get) => ({
    mech: hydrateMechanics(p),
    feed: [],
    theme: p.theme === 'light' || p.theme === 'soft' || p.theme === 'dark' ? p.theme : 'light',
    hqView: p.hqView === '3d' ? '3d' : '2d',
    season: p.season && (p.season === 'auto' || SEASONS.includes(p.season)) ? p.season : 'auto',
    timeMode: p.timeMode === 'day' || p.timeMode === 'night' ? p.timeMode : 'auto',
    muted: p.muted ?? false,
    showFps: p.showFps ?? false,
    fps: 60,
    speed: 1,
    paused: false,
    adapter: 'live',
    wsUrl: typeof p.wsUrl === 'string' ? p.wsUrl : 'ws://localhost:8787/marion',
    conn: 'idle',
    connInfo: null,
    replay: { scenario: 'feature-sprint', t: 0, duration: 0, playing: true, rate: 1 },
    selectedBot: null,
    selectedRoom: null,
    paletteOpen: false,
    feedOpen: typeof window === 'undefined' || !window.matchMedia ? true : !window.matchMedia('(max-width: 639px), (max-height: 500px)').matches,
    helpOpen: false,
    turntable: p.turntable ?? true,
    bridgeDictating: false,
    eventCount: 0,

    ingest: (ev) => {
      if (ev.type === 'bot.spawned') nameCache.set(ev.payload.botId, ev.payload.name);
      if (ev.type === 'arcade.player_joined') rememberName(ev.payload.botId, ev.payload.name);
      const s = get();
      const mech = reduceMechanics(s.mech, ev);
      let feed = s.feed;
      if (!isQuietEvent(ev)) {
        const item: FeedItem = {
          id: ev.id,
          ts: ev.ts,
          type: ev.type,
          text: describeEvent(ev, botName),
          room: eventRoom(ev),
          botId: eventBot(ev),
          cross: (ev.type === 'bot.message' && !!ev.payload.to) || ev.type === 'bot.delegate',
        };
        feed = [item, ...feed].slice(0, FEED_LIMIT);
      }
      const extra: Partial<GameState> = {};
      if (ev.type === 'dictation.wave' && ev.payload.source !== 'life') extra.bridgeDictating = ev.payload.active;
      set({ mech, feed, eventCount: s.eventCount + 1, ...extra });
    },
    resetMechanics: (keepPersistent = true) => {
      const s = get();
      const m = initialMechanics();
      if (keepPersistent) {
        m.foundry = s.mech.foundry;
        m.progress = s.mech.progress;
        m.arcade = { ...m.arcade, leaderboard: s.mech.arcade.leaderboard, recent: s.mech.arcade.recent };
      }
      set({ mech: m, feed: [], bridgeDictating: false });
    },
    restoreFromStorage: () => set({ mech: hydrateMechanics(loadPersisted()), feed: [], bridgeDictating: false }),
    setTheme: (theme) => set({ theme }),
    setHqView: (hqView) => set({ hqView }),
    setSeason: (season) => set({ season }),
    setTimeMode: (timeMode) => set({ timeMode }),
    cycleTheme: () => set({ theme: nextTheme(get().theme) }),
    toggleMute: () => set({ muted: !get().muted }),
    toggleFps: () => set({ showFps: !get().showFps }),
    setFps: (fps) => set({ fps }),
    setSpeed: (speed) => set({ speed }),
    togglePause: () => set({ paused: !get().paused }),
    setPaused: (paused) => set({ paused }),
    setAdapter: (adapter) => set({ adapter }),
    setWsUrl: (wsUrl) => set({ wsUrl }),
    setConn: (conn, info = null) => set({ conn, connInfo: info }),
    setReplay: (r) => set({ replay: { ...get().replay, ...r } }),
    selectBot: (selectedBot) => set({ selectedBot }),
    selectRoom: (selectedRoom) => set({ selectedRoom }),
    setPalette: (paletteOpen) => set({ paletteOpen }),
    toggleFeed: () => set({ feedOpen: !get().feedOpen }),
    setHelp: (helpOpen) => set({ helpOpen }),
    setTurntable: (turntable) => set({ turntable }),
    setBridgeDictating: (bridgeDictating) => set({ bridgeDictating }),
  }));
}

export const useGame = makeStore();

let lastSaved = '';
/** Persist relevant slices whenever they change. Returns an unsubscribe. */
export function startPersistence(): () => void {
  return useGame.subscribe((s) => {
    // Replays are deterministic sandboxes: never persist their state.
    if (s.adapter === 'replay') return;
    const json = JSON.stringify(persistedFrom(s));
    if (json !== lastSaved) {
      lastSaved = json;
      try {
        storage()?.setItem(STORAGE_KEY, json);
      } catch {
        /* best-effort */
      }
    }
  });
}
