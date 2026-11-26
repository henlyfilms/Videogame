/**
 * Per-device preferences + lifetime profile stats (localStorage, guarded).
 */
import { defaultCosmetics, sanitizeCosmetics } from '../characters/catalog';
import { grandfather, sanitizeOwned, sanitizeSeeds, STARTING_SEEDS } from '../characters/shop';
import type { Cosmetics, ModeId, RoleId, ViewMode } from '../core/types';

export type Quality = 'auto' | 'low' | 'medium' | 'high';
export type Colorblind = 'none' | 'protan' | 'deutan' | 'tritan';

export interface Keybinds {
  up: string;
  down: string;
  left: string;
  right: string;
  use: string;
  kill: string;
  report: string;
  vent: string;
  sabotage: string;
  map: string;
  flashlight: string;
  chat: string;
  emote: string;
  tasks: string;
}

export const DEFAULT_KEYS: Keybinds = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  use: 'KeyE',
  kill: 'KeyQ',
  report: 'KeyR',
  vent: 'KeyV',
  sabotage: 'KeyX',
  map: 'Tab',
  flashlight: 'KeyF',
  chat: 'Enter',
  emote: 'KeyT',
  tasks: 'KeyG',
};

export interface LifetimeStats {
  games: number;
  wins: number;
  byRole: Partial<Record<RoleId, { games: number; wins: number }>>;
  byMode: Partial<Record<ModeId, { games: number; wins: number }>>;
  kills: number;
  tasks: number;
  correctVotes: number;
  votes: number;
  survived: number;
  mvps: number;
}

export interface Prefs {
  name: string;
  cosmetics: Cosmetics;
  view: ViewMode;
  quality: Quality;
  reducedMotion: boolean;
  colorblind: Colorblind;
  textScale: number;
  volume: number;
  music: number;
  muted: boolean;
  captions: boolean;
  profanityFilter: boolean;
  highVisibility: boolean;
  invertY: boolean;
  sensitivity: number;
  keys: Keybinds;
  serverUrl: string;
  tutorialDone: boolean;
  /** Jukebox: track used on the menus. */
  menuTrack: string;
  stats: LifetimeStats;
  /** Shop wallet: Seeds earned by playing (see characters/shop.ts). */
  seeds: number;
  /** Priced cosmetics owned (`slot:id` keys; free items are always owned). */
  owned: string[];
}

const KEY = 'marion-mystery:v1';

export function emptyStats(): LifetimeStats {
  return { games: 0, wins: 0, byRole: {}, byMode: {}, kills: 0, tasks: 0, correctVotes: 0, votes: 0, survived: 0, mvps: 0 };
}

export function defaultPrefs(): Prefs {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    name: '',
    cosmetics: defaultCosmetics(),
    view: '3d-tp',
    quality: coarse ? 'auto' : 'auto',
    reducedMotion: reduce,
    colorblind: 'none',
    textScale: 1,
    volume: 0.8,
    music: 0.5,
    muted: false,
    captions: false,
    profanityFilter: true,
    highVisibility: false,
    invertY: false,
    sensitivity: 1,
    keys: { ...DEFAULT_KEYS },
    serverUrl: '',
    tutorialDone: false,
    menuTrack: 'title',
    stats: emptyStats(),
    seeds: STARTING_SEEDS,
    owned: [],
  };
}

export function loadPrefs(): Prefs {
  const d = defaultPrefs();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const o = JSON.parse(raw) as Partial<Prefs>;
    const cosmetics = sanitizeCosmetics(o.cosmetics ?? d.cosmetics);
    return {
      ...d,
      ...o,
      cosmetics,
      // Wallet (added with the shop): older saves get the starter Seeds, and
      // whatever the player already wears stays theirs (grandfathered).
      seeds: sanitizeSeeds(o.seeds),
      owned: grandfather(sanitizeOwned(o.owned), cosmetics),
      keys: { ...DEFAULT_KEYS, ...(o.keys ?? {}) },
      stats: { ...emptyStats(), ...(o.stats ?? {}) },
      view: o.view === '2d' || o.view === '3d-fp' || o.view === '3d-tp' ? o.view : d.view,
    };
  } catch {
    return d;
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage blocked (private mode) */
  }
}

/** Mild profanity mask for chat display (toggle in settings). */
const BAD = ['damn', 'hell', 'crap', 'shit', 'fuck', 'bitch', 'ass', 'dick', 'bastard', 'piss'];
const BAD_RE = new RegExp(`\\b(${BAD.join('|')})\\w*`, 'gi');
export function filterProfanity(text: string): string {
  return text.replace(BAD_RE, (m) => m[0] + '*'.repeat(Math.max(1, m.length - 1)));
}
