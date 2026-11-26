/**
 * Match settings: versioned schema, defaults, validation/clamping, presets and
 * a compact share code. The server always re-validates whatever a host sends.
 */
import { CONFIGURABLE_ROLES, ROLES, validateRoles, type RoleTable, type RoleValidation } from './roles';
import type { MapId, ModeId, RoleId, ViewPolicy } from './types';

export const SETTINGS_VERSION = 2;

export type TimerOutcome = 'murderers' | 'crew' | 'draw';
export type Misfire = 'sheriffDies' | 'bothDie' | 'loseGun';
export type TaskBarMode = 'live' | 'meetings' | 'never';
export type KillDistance = 'short' | 'medium' | 'long';
export type Privacy = 'public' | 'code' | 'lan';
export type BotDifficulty = 'easy' | 'normal' | 'sharp';

export interface Settings {
  v: number;
  mode: ModeId;
  map: MapId;
  view: ViewPolicy;
  maxPlayers: number;
  durationMin: number;
  timerOutcome: TimerOutcome;
  playerSpeed: number;
  crewVision: number;
  murdererVision: number;
  lightsVision: number;
  killCooldown: number;
  killDistance: KillDistance;
  knifeThrow: boolean;
  gunCooldown: number;
  misfire: Misfire;
  gunDrop: boolean;
  tasksCommon: number;
  tasksShort: number;
  tasksLong: number;
  visualTasks: boolean;
  taskBar: TaskBarMode;
  emergencyMeetings: number;
  emergencyCooldown: number;
  discussionTime: number;
  votingTime: number;
  anonymousVotes: boolean;
  confirmEjects: boolean;
  allowSkip: boolean;
  sabLights: boolean;
  sabComms: boolean;
  sabDoors: boolean;
  sabMeltdown: boolean;
  sabPressure: boolean;
  criticalTimer: number;
  sabotageCooldown: number;
  // Lights Out
  flashlightAngle: number;
  flashlightRange: number;
  batterySeconds: number;
  rechargeRate: number;
  batteryPickups: number;
  darkVision: number;
  blackoutCooldown: number;
  killFlicker: boolean;
  // Hide & Seek
  hnsSeekers: number;
  hnsHideTime: number;
  hnsFinal: number;
  hnsSeekerBoost: number;
  hnsTaskBonus: number;
  // Ghosts / chat
  ghostTasks: boolean;
  ghostChat: boolean;
  chat: boolean;
  quickChat: boolean;
  proximityChat: boolean;
  // Bots / lobby
  bots: number;
  botDifficulty: BotDifficulty;
  privacy: Privacy;
  // Roles
  roles: RoleTable;
  accompliceKnows: boolean;
  detectiveClue: 'berry' | 'color';
  poisonDelay: number;
  trackerSeconds: number;
  medicVitalsSeconds: number;
  mayorReveal: boolean;
  ghostsSeeRoles: boolean;
}

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];

/** Numeric ranges (min, max, step) — used by validation and the settings UI. */
export const RANGES: Partial<Record<NumKey, [number, number, number]>> = {
  maxPlayers: [4, 20, 1],
  durationMin: [0, 30, 1],
  playerSpeed: [0.5, 2, 0.25],
  crewVision: [0.25, 2, 0.25],
  murdererVision: [0.25, 2.5, 0.25],
  lightsVision: [0.1, 1, 0.05],
  killCooldown: [10, 60, 2.5],
  gunCooldown: [10, 60, 2.5],
  tasksCommon: [0, 3, 1],
  tasksShort: [0, 8, 1],
  tasksLong: [0, 4, 1],
  emergencyMeetings: [0, 9, 1],
  emergencyCooldown: [0, 60, 5],
  discussionTime: [0, 120, 15],
  votingTime: [15, 300, 15],
  criticalTimer: [30, 120, 5],
  sabotageCooldown: [10, 60, 5],
  flashlightAngle: [25, 90, 5],
  flashlightRange: [4, 14, 1],
  batterySeconds: [30, 240, 10],
  rechargeRate: [0.05, 0.5, 0.05],
  batteryPickups: [0, 12, 1],
  darkVision: [0.5, 5, 0.5],
  blackoutCooldown: [20, 90, 5],
  hnsSeekers: [1, 4, 1],
  hnsHideTime: [5, 30, 5],
  hnsFinal: [20, 120, 10],
  hnsSeekerBoost: [1, 1.75, 0.05],
  hnsTaskBonus: [1, 15, 1],
  bots: [0, 19, 1],
  poisonDelay: [3, 20, 1],
  trackerSeconds: [5, 30, 5],
  medicVitalsSeconds: [0, 20, 5],
};

function roleTable(over: Partial<Record<RoleId, number>>): RoleTable {
  const t = {} as RoleTable;
  for (const r of Object.keys(ROLES) as RoleId[]) t[r] = { count: over[r] ?? 0, chance: 100 };
  return t;
}

export function defaultSettings(): Settings {
  return {
    v: SETTINGS_VERSION,
    mode: 'classic',
    map: 'hq',
    view: 'choice',
    maxPlayers: 12,
    durationMin: 0,
    timerOutcome: 'murderers',
    playerSpeed: 1,
    crewVision: 1,
    murdererVision: 1.5,
    lightsVision: 0.25,
    killCooldown: 25,
    killDistance: 'medium',
    knifeThrow: true,
    gunCooldown: 20,
    misfire: 'sheriffDies',
    gunDrop: true,
    tasksCommon: 1,
    tasksShort: 3,
    tasksLong: 1,
    visualTasks: true,
    taskBar: 'live',
    emergencyMeetings: 1,
    emergencyCooldown: 15,
    discussionTime: 30,
    votingTime: 60,
    anonymousVotes: false,
    confirmEjects: true,
    allowSkip: true,
    sabLights: true,
    sabComms: true,
    sabDoors: true,
    sabMeltdown: true,
    sabPressure: true,
    criticalTimer: 60,
    sabotageCooldown: 25,
    flashlightAngle: 50,
    flashlightRange: 9,
    batterySeconds: 120,
    rechargeRate: 0.2,
    batteryPickups: 6,
    darkVision: 2.5,
    blackoutCooldown: 40,
    killFlicker: true,
    hnsSeekers: 1,
    hnsHideTime: 10,
    hnsFinal: 60,
    hnsSeekerBoost: 1.3,
    hnsTaskBonus: 1,
    ghostTasks: true,
    ghostChat: true,
    chat: true,
    quickChat: true,
    proximityChat: false,
    bots: 0,
    botDifficulty: 'normal',
    privacy: 'code',
    roles: roleTable({ murderer: 2, sheriff: 1, detective: 1, medic: 1 }),
    accompliceKnows: true,
    detectiveClue: 'berry',
    poisonDelay: 8,
    trackerSeconds: 15,
    medicVitalsSeconds: 10,
    mayorReveal: true,
    ghostsSeeRoles: true,
  };
}

export type PresetId = 'classic' | 'lightsout' | 'hideseek' | 'chaos' | 'detective' | 'quick' | 'custom';

export const PRESETS: { id: PresetId; name: string; blurb: string; apply: (s: Settings) => Settings }[] = [
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'Bright maps, tasks, sabotage and meetings. The default.',
    apply: (s) => ({ ...defaultSettings(), map: s.map, view: s.view, bots: s.bots, maxPlayers: s.maxPlayers, privacy: s.privacy }),
  },
  {
    id: 'lightsout',
    name: 'Lights Out',
    blurb: 'Night falls. Every crewmate carries a flashlight.',
    apply: (s) => ({
      ...defaultSettings(),
      mode: 'lightsout',
      map: s.map,
      view: s.view,
      bots: s.bots,
      maxPlayers: s.maxPlayers,
      privacy: s.privacy,
      sabLights: false,
      killCooldown: 27.5,
      roles: roleTable({ murderer: 2, sheriff: 1, detective: 1, engineer: 1 }),
    }),
  },
  {
    id: 'hideseek',
    name: 'Hide & Seek',
    blurb: 'One seeker, everyone else hides. Tasks shorten the clock.',
    apply: (s) => ({ ...defaultSettings(), mode: 'hideseek', map: s.map, view: s.view, bots: s.bots, maxPlayers: s.maxPlayers, privacy: s.privacy, durationMin: 5, tasksShort: 4, tasksLong: 1 }),
  },
  {
    id: 'chaos',
    name: 'Chaos',
    blurb: 'Every role in play, short cooldowns, knives flying.',
    apply: (s) => ({
      ...s,
      mode: 'classic',
      killCooldown: 15,
      gunCooldown: 12.5,
      sabotageCooldown: 15,
      knifeThrow: true,
      roles: roleTable({ murderer: 2, poisoner: 1, sheriff: 1, detective: 1, medic: 1, engineer: 1, tracker: 1, jester: 1 }),
    }),
  },
  {
    id: 'detective',
    name: 'Detective Night',
    blurb: 'Two detectives, a poisoner and anonymous votes.',
    apply: (s) => ({
      ...s,
      anonymousVotes: true,
      confirmEjects: false,
      discussionTime: 60,
      detectiveClue: 'color',
      roles: roleTable({ murderer: 1, poisoner: 1, detective: 2, tracker: 1, mayor: 1 }),
    }),
  },
  {
    id: 'quick',
    name: 'Quick Match',
    blurb: 'Fewer tasks, shorter meetings, a 10 minute clock.',
    apply: (s) => ({
      ...s,
      durationMin: 10,
      tasksCommon: 1,
      tasksShort: 2,
      tasksLong: 0,
      discussionTime: 15,
      votingTime: 45,
      killCooldown: 20,
    }),
  },
];

const ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
  mode: ['classic', 'lightsout', 'hideseek'],
  map: ['hq', 'greenhouse', 'express', 'manor'],
  view: ['choice', '3d-fp', '3d-tp', '2d'],
  timerOutcome: ['murderers', 'crew', 'draw'],
  killDistance: ['short', 'medium', 'long'],
  misfire: ['sheriffDies', 'bothDie', 'loseGun'],
  taskBar: ['live', 'meetings', 'never'],
  botDifficulty: ['easy', 'normal', 'sharp'],
  privacy: ['public', 'code', 'lan'],
  detectiveClue: ['berry', 'color'],
};

function clampStep(v: number, [min, max, step]: [number, number, number]): number {
  if (!Number.isFinite(v)) return min;
  const c = Math.min(max, Math.max(min, v));
  const snapped = Math.round((c - min) / step) * step + min;
  return Math.round(Math.min(max, snapped) * 1000) / 1000;
}

/** Migrate older saved settings. */
export function migrateSettings(raw: unknown): Record<string, unknown> {
  const o = (raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}) as Record<string, unknown>;
  const v = typeof o.v === 'number' ? o.v : 1;
  if (v < 2) {
    // v1 had a single `sabCritical` flag and `sheriffMisfireDies` boolean.
    if (typeof o.sabCritical === 'boolean') {
      o.sabMeltdown = o.sabCritical;
      o.sabPressure = o.sabCritical;
      delete o.sabCritical;
    }
    if (typeof o.sheriffMisfireDies === 'boolean') {
      o.misfire = o.sheriffMisfireDies ? 'sheriffDies' : 'loseGun';
      delete o.sheriffMisfireDies;
    }
  }
  o.v = SETTINGS_VERSION;
  return o;
}

/**
 * Coerce arbitrary (possibly hostile) input into valid Settings. Unknown keys
 * are dropped, numbers clamped and snapped, enums checked, role counts clamped.
 */
export function sanitizeSettings(raw: unknown, base: Settings = defaultSettings()): Settings {
  const o = migrateSettings(raw);
  const out: Settings = { ...base, roles: { ...base.roles } };
  for (const key of Object.keys(base) as (keyof Settings)[]) {
    if (key === 'roles' || key === 'v') continue;
    const val = o[key];
    if (val === undefined) continue;
    const def = base[key];
    if (typeof def === 'number') {
      const range = RANGES[key as NumKey];
      if (typeof val === 'number') (out as unknown as Record<string, unknown>)[key] = range ? clampStep(val, range) : val;
    } else if (typeof def === 'boolean') {
      if (typeof val === 'boolean') (out as unknown as Record<string, unknown>)[key] = val;
    } else if (typeof def === 'string') {
      const allowed = ENUMS[key];
      if (typeof val === 'string' && (!allowed || allowed.includes(val))) (out as unknown as Record<string, unknown>)[key] = val;
    }
  }
  const rawRoles = o.roles as Record<string, unknown> | undefined;
  if (rawRoles && typeof rawRoles === 'object') {
    for (const r of CONFIGURABLE_ROLES) {
      const slot = rawRoles[r] as { count?: unknown; chance?: unknown } | undefined;
      if (!slot || typeof slot !== 'object') continue;
      const count = typeof slot.count === 'number' ? Math.max(0, Math.min(10, Math.round(slot.count))) : out.roles[r].count;
      const chance = typeof slot.chance === 'number' ? Math.max(0, Math.min(100, Math.round(slot.chance))) : out.roles[r].chance;
      out.roles[r] = { count, chance };
    }
  }
  out.v = SETTINGS_VERSION;
  return out;
}

export function validateSettings(s: Settings, players: number): RoleValidation {
  const v = validateRoles(s.roles, players, s.mode);
  if (players > s.maxPlayers) v.errors.push(`Lobby has ${players} players but the max is ${s.maxPlayers}.`);
  if (s.tasksCommon + s.tasksShort + s.tasksLong === 0 && s.mode !== 'hideseek') v.warnings.push('No tasks: the crew can only win by voting.');
  if (s.mode === 'hideseek' && s.hnsSeekers >= players) v.errors.push('Need more hiders than seekers.');
  v.ok = v.errors.length === 0;
  return v;
}

/** URL-safe share code for a settings preset. */
export function encodeSettings(s: Settings): string {
  const json = JSON.stringify(s);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSettings(code: string): Settings | null {
  try {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
    return sanitizeSettings(JSON.parse(json));
  } catch {
    return null;
  }
}

export const KILL_RANGE: Record<KillDistance, number> = { short: 1.2, medium: 1.8, long: 2.6 };
/** Base vision radius in metres for multiplier 1.0. */
export const BASE_VISION = 8;
/** Base walk speed in m/s for multiplier 1.0. */
export const BASE_SPEED = 3.3;
