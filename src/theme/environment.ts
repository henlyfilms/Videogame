/**
 * Marion HQ environment: seasons (spring / summer / fall / winter) and time of
 * day (auto / day / night). Shared by the 2D and 3D HQ views so both look the
 * same, in Marion Mystery's style.
 */
export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type TimeMode = 'auto' | 'day' | 'night';
export type HqView = '2d' | '3d';

export const SEASONS: readonly Season[] = ['spring', 'summer', 'fall', 'winter'] as const;

export interface SeasonStyle {
  id: Season;
  label: string;
  emoji: string;
  /** Outdoor ground around the HQ. */
  ground: string;
  groundAlt: string;
  /** Foliage colours for trees/bushes (several tones). */
  foliage: string[];
  /** Flower / accent colours scattered outdoors. */
  blooms: string[];
  /** Sky (3D background) and light. */
  skyDay: string;
  skyNight: string;
  sun: string;
  ambient: string;
  /** Falling particles. */
  particle: { kind: 'petal' | 'firefly' | 'leaf' | 'snow'; colors: string[]; rate: number; size: number; fall: number; sway: number };
  /** Room floor warmth tint applied gently (0..1 mix toward this colour). */
  warmth: string;
}

export const SEASON_STYLE: Record<Season, SeasonStyle> = {
  spring: {
    id: 'spring',
    label: 'Spring',
    emoji: '🌸',
    ground: '#9ad97f',
    groundAlt: '#86cc6c',
    foliage: ['#7fd36b', '#a3e38c', '#f5b6d1'],
    blooms: ['#f9a8d4', '#fbcfe8', '#fde68a', '#c4b5fd', '#ffffff'],
    skyDay: '#bfe3ff',
    skyNight: '#101a38',
    sun: '#fff4e6',
    ambient: '#dff3ff',
    particle: { kind: 'petal', colors: ['#fbcfe8', '#f9a8d4', '#ffffff'], rate: 10, size: 0.16, fall: 0.6, sway: 1.2 },
    warmth: '#fdf2f8',
  },
  summer: {
    id: 'summer',
    label: 'Summer',
    emoji: '☀️',
    ground: '#6cc25b',
    groundAlt: '#5bb14d',
    foliage: ['#22a35a', '#3cbf63', '#16803f'],
    blooms: ['#facc15', '#fb923c', '#f87171', '#60a5fa'],
    skyDay: '#8fd0ff',
    skyNight: '#0d1633',
    sun: '#fff1c9',
    ambient: '#e6f6ff',
    particle: { kind: 'firefly', colors: ['#fde68a', '#bef264'], rate: 6, size: 0.1, fall: -0.05, sway: 0.8 },
    warmth: '#fffbeb',
  },
  fall: {
    id: 'fall',
    label: 'Fall',
    emoji: '🍁',
    ground: '#b9a46a',
    groundAlt: '#a88f55',
    foliage: ['#ea580c', '#f59e0b', '#b91c1c', '#d97706'],
    blooms: ['#f97316', '#facc15', '#b45309', '#7c2d12'],
    skyDay: '#f6d7b0',
    skyNight: '#1a1433',
    sun: '#ffd9a1',
    ambient: '#fde7d0',
    particle: { kind: 'leaf', colors: ['#ea580c', '#f59e0b', '#b91c1c', '#ca8a04'], rate: 12, size: 0.2, fall: 0.8, sway: 1.6 },
    warmth: '#fff1e6',
  },
  winter: {
    id: 'winter',
    label: 'Winter',
    emoji: '❄️',
    ground: '#eef4fb',
    groundAlt: '#dce7f3',
    foliage: ['#1f6f4a', '#2d7d57', '#e2ecf7'],
    blooms: ['#ffffff', '#dbeafe', '#ef4444'],
    skyDay: '#d6e6f5',
    skyNight: '#0b1430',
    sun: '#f1f7ff',
    ambient: '#e3eefc',
    particle: { kind: 'snow', colors: ['#ffffff', '#e0f2fe'], rate: 26, size: 0.11, fall: 1.1, sway: 0.7 },
    warmth: '#f0f7ff',
  },
};

/** The current season for a date (northern hemisphere). */
export function seasonFor(d = new Date()): Season {
  const m = d.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
  return 'winter';
}

/**
 * Night factor 0 (full day) … 1 (full night). `auto` follows the local
 * clock with soft dawn/dusk transitions.
 */
export function nightFactor(mode: TimeMode, d = new Date()): number {
  if (mode === 'day') return 0;
  if (mode === 'night') return 1;
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 7 && h <= 18) return 0;
  if (h >= 20 || h <= 5) return 1;
  if (h > 18) return (h - 18) / 2; // dusk 18→20
  return 1 - (h - 5) / 2; // dawn 5→7
}

/** Deterministic pseudo-random for scattering decorations. */
export function scatter(i: number, salt = 1): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
