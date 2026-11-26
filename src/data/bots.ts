/**
 * The Marion bot roster. Every bot glows (glow: true is part of the type, not optional).
 */
export type BotShape = 'funkyberry' | 'marionberry' | 'heart' | 'gem' | 'star' | 'blueberry' | 'cloud';

export const BOT_SHAPES: readonly BotShape[] = [
  'funkyberry',
  'marionberry',
  'heart',
  'gem',
  'star',
  'blueberry',
  'cloud',
] as const;

export type RoomId =
  | 'command'
  | 'huddle'
  | 'engine'
  | 'bridge'
  | 'life'
  | 'media'
  | 'cutting'
  | 'mail'
  | 'foundry';

export interface BotDef {
  id: string;
  name: string;
  role: string;
  /** Named color from the spec (for docs + inspector). */
  colorName: string;
  /** Fill color used by the renderer. */
  color: string;
  /** Glow / rim color. For dark bodies (Barry) this is a bright rim. */
  glowColor: string;
  shape: BotShape;
  glow: true;
  starred: boolean;
  home: RoomId;
  /** Hotkey 1–8 for the core roster. */
  hotkey?: number;
  custom?: boolean;
  /** For custom bots: the 1-line job card. */
  job?: string;
}

export const CORE_BOTS: readonly BotDef[] = [
  {
    id: 'daniel',
    name: 'Daniel',
    role: 'Chief Executor',
    colorName: 'white',
    color: '#ffffff',
    glowColor: '#dbe7ff',
    shape: 'funkyberry',
    glow: true,
    starred: true,
    home: 'command',
    hotkey: 1,
  },
  {
    id: 'moose',
    name: 'Moose',
    role: 'Co-Pilot',
    colorName: 'violet',
    color: '#8b5cf6',
    glowColor: '#a78bfa',
    shape: 'marionberry',
    glow: true,
    starred: false,
    home: 'bridge',
    hotkey: 2,
  },
  {
    id: 'kanye',
    name: 'Kanye',
    role: 'Marion Agent',
    colorName: 'red',
    color: '#ef4444',
    glowColor: '#f87171',
    shape: 'heart',
    glow: true,
    starred: false,
    home: 'engine',
    hotkey: 3,
  },
  {
    id: 'barry',
    name: 'Barry',
    role: 'Marion Life',
    colorName: 'black',
    color: '#0a0a0f',
    glowColor: '#6ea1ff',
    shape: 'gem',
    glow: true,
    starred: false,
    home: 'life',
    hotkey: 4,
  },
  {
    id: 'greek',
    name: 'Greek',
    role: 'Marion Engine',
    colorName: 'magenta',
    color: '#d946ef',
    glowColor: '#e879f9',
    shape: 'star',
    glow: true,
    starred: false,
    home: 'cutting',
    hotkey: 5,
  },
  {
    id: 'quill',
    name: 'Quill',
    role: 'Email',
    colorName: 'blue',
    color: '#2f6fed',
    glowColor: '#6ea1ff',
    shape: 'blueberry',
    glow: true,
    starred: false,
    home: 'mail',
    hotkey: 6,
  },
  {
    id: 'sift',
    name: 'Sift',
    role: 'Sift Dev',
    colorName: 'cyan',
    color: '#06b6d4',
    glowColor: '#22d3ee',
    shape: 'blueberry',
    glow: true,
    starred: false,
    home: 'media',
    hotkey: 7,
  },
  {
    id: 'builder',
    name: 'Bot Builder',
    role: 'Foundry',
    colorName: 'orange',
    color: '#f97316',
    glowColor: '#fb923c',
    shape: 'cloud',
    glow: true,
    starred: true,
    home: 'foundry',
    hotkey: 8,
  },
];

export const MAX_CUSTOM_BOTS = 4;

/** Palette offered by the Foundry's Berry & Aura Bench. */
export const FOUNDRY_COLORS: readonly { name: string; color: string; glow: string }[] = [
  { name: 'lime', color: '#84cc16', glow: '#a3e635' },
  { name: 'amber', color: '#f59e0b', glow: '#fbbf24' },
  { name: 'rose', color: '#f43f5e', glow: '#fb7185' },
  { name: 'emerald', color: '#10b981', glow: '#34d399' },
  { name: 'sky', color: '#0ea5e9', glow: '#38bdf8' },
  { name: 'indigo', color: '#6366f1', glow: '#818cf8' },
];

/** Retired bots resting in the Foundry's 30-Day Vault. */
export const RETIRED_BOTS: readonly { name: string; role: string; daysLeft: number; color: string; shape: BotShape }[] = [
  { name: 'Gauge', role: 'Metrics', daysLeft: 23, color: '#94a3b8', shape: 'gem' },
  { name: 'Forge', role: 'Builds', daysLeft: 11, color: '#a8a29e', shape: 'cloud' },
];

export function makeCustomBot(input: {
  id: string;
  name: string;
  job: string;
  shape: BotShape;
  color: string;
  glowColor: string;
}): BotDef {
  const name = input.name.trim().split(/\s+/)[0]?.slice(0, 12) || 'Sprout';
  const role = input.job.trim().split(/\s+/).slice(0, 2).join(' ').slice(0, 20) || 'Specialist';
  return {
    id: input.id,
    name,
    role,
    colorName: 'custom',
    color: input.color,
    glowColor: input.glowColor,
    shape: input.shape,
    glow: true,
    starred: false,
    home: 'foundry',
    custom: true,
    job: input.job.trim().slice(0, 80),
  };
}
