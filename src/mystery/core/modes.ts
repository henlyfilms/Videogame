/**
 * Game-mode plug-ins. Each mode declares which systems are on and can hook
 * setup / tick / win checks. New modes register here through `GameModeDef`.
 */
import type { CompiledMap } from './map';
import type { Settings } from './settings';
import type { MatchState, ModeId, Team, WinReason } from './types';

export interface ModeCtx {
  map: CompiledMap;
  settings: Settings;
}

export interface GameModeDef {
  id: ModeId;
  name: string;
  tagline: string;
  howTo: string[];
  /** Key-art colours for menus/cards. */
  colors: [string, string];
  meetings: boolean;
  reports: boolean;
  sabotage: boolean;
  flashlights: boolean;
  ambient: 'bright' | 'night';
  setup?(st: MatchState, ctx: ModeCtx): void;
  tick?(st: MatchState, ctx: ModeCtx, dt: number): void;
  /** Mode-specific win condition, checked before the shared ones. */
  checkWin?(st: MatchState, ctx: ModeCtx): { team: Team | 'draw'; reason: WinReason } | null;
  /** Whether the shared win checks (parity/tasks/elimination) apply. */
  sharedWins: boolean;
}

const classic: GameModeDef = {
  id: 'classic',
  name: 'Classic',
  tagline: 'Bright halls. Hidden knives.',
  howTo: [
    'Crew: finish tasks, report bodies and vote out the murderers.',
    'Murderers: blend in, sabotage, and eliminate the crew.',
    'The lights only go out when a murderer sabotages them. Fix the breaker!',
    'Hit the emergency button to call a meeting.',
  ],
  colors: ['#2f6fed', '#6ea1ff'],
  meetings: true,
  reports: true,
  sabotage: true,
  flashlights: false,
  ambient: 'bright',
  sharedWins: true,
};

const lightsout: GameModeDef = {
  id: 'lightsout',
  name: 'Lights Out',
  tagline: 'Night falls. Bring a flashlight.',
  howTo: [
    'The map is dark. Every crewmate carries a flashlight (F to toggle).',
    'Your beam reveals others — and gives you away. Batteries drain.',
    'Recharge at glowing stations or grab battery pickups.',
    'Murderers see a little in the dark and can Blackout every flashlight in a room.',
  ],
  colors: ['#1e1b4b', '#facc15'],
  meetings: true,
  reports: true,
  sabotage: true,
  flashlights: true,
  ambient: 'night',
  sharedWins: true,
};

const hideseek: GameModeDef = {
  id: 'hideseek',
  name: 'Hide & Seek',
  tagline: 'Run. Hide. Do your tasks.',
  howTo: [
    'The seeker is revealed to everyone and waits while you hide.',
    'Hiders: each task takes time off the clock. Survive until zero.',
    'In the final countdown the seeker speeds up and the danger meter screams.',
    'No meetings, no reports — just you and the dark corners.',
  ],
  colors: ['#ff4d5e', '#fb923c'],
  meetings: false,
  reports: false,
  sabotage: false,
  flashlights: false,
  ambient: 'bright',
  sharedWins: false,
  setup(st, { settings }) {
    const total = (settings.durationMin || 5) * 60;
    st.hns = { hideUntil: st.t + settings.hnsHideTime, finalAt: 0, timer: total };
    for (const p of Object.values(st.players)) if (p.role === 'hider') p.ventUses = 3;
  },
  tick(st, { settings }, dt) {
    const h = st.hns;
    if (!h || st.phase !== 'play') return;
    if (st.t < h.hideUntil) return;
    h.timer = Math.max(0, h.timer - dt);
    if (!h.finalAt && h.timer <= settings.hnsFinal) {
      h.finalAt = st.t;
      st.pending.push({ t: st.t, type: 'final' });
    }
  },
  checkWin(st) {
    const hiders = Object.values(st.players).filter((p) => p.role === 'hider');
    if (hiders.length && hiders.every((p) => !p.alive)) return { team: 'murderers', reason: 'all-found' };
    const seekers = Object.values(st.players).filter((p) => p.role === 'seeker' && p.alive && p.connected);
    if (!seekers.length) return { team: 'crew', reason: 'abandoned' };
    if (st.hns && st.hns.timer <= 0) return { team: 'crew', reason: 'hiders-survived' };
    return null;
  },
};

export const MODES: Record<ModeId, GameModeDef> = { classic, lightsout, hideseek };
export const MODE_LIST: GameModeDef[] = [classic, lightsout, hideseek];
