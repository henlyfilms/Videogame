/**
 * The slice of game state the renderer reads each frame. Kept as a plain
 * interface so the renderer never imports the store (and tests can fake it).
 */
import type { RelayModel, SkillId } from '../adapters/events';
import type { ThemeName } from '../theme/tokens';

export interface PlannerCardView {
  lane: 'work' | 'ai';
  done: boolean;
}

export interface RenderView {
  theme: ThemeName;
  mail: { action: number; fyi: number; noise: number; incoming: number; pending: number; draftWords: number; draftTarget: number };
  media: { queued: number; insights: number; llm: 'local' | 'cloud'; distilling: boolean };
  cutting: { queued: number; keepers: number; outtakes: number; render: number; green: boolean };
  life: {
    cards: PlannerCardView[];
    streak: number;
    polish: number;
    vault: number;
    archived: number;
    dictating: boolean;
    turntable: boolean;
  };
  engine: { queue: number; polaroids: number; activeModels: RelayModel[] };
  foundry: { skills: SkillId[]; custom: number };
  command: { releases: number; brain: number; huddling: boolean };
}

export function emptyView(theme: ThemeName = 'light'): RenderView {
  return {
    theme,
    mail: { action: 0, fyi: 0, noise: 0, incoming: 0, pending: 0, draftWords: 0, draftTarget: 0 },
    media: { queued: 0, insights: 0, llm: 'local', distilling: false },
    cutting: { queued: 0, keepers: 0, outtakes: 0, render: 0, green: false },
    life: { cards: [], streak: 0, polish: 0, vault: 0, archived: 0, dictating: false, turntable: false },
    engine: { queue: 0, polaroids: 0, activeModels: [] },
    foundry: { skills: [], custom: 0 },
    command: { releases: 0, brain: 0, huddling: false },
  };
}

export const MODEL_COLORS: Record<RelayModel, string> = {
  'claude-opus-auto': '#f59e0b',
  codex: '#22c55e',
  gemini: '#6ea1ff',
};

export const MODEL_LABELS: Record<RelayModel, string> = {
  'claude-opus-auto': 'Claude Opus · auto',
  codex: 'Codex',
  gemini: 'Gemini',
};

export const SKILL_LABELS: Record<SkillId, string> = {
  'token-optimizer': 'Token Optimizer',
  'claude-auto-mode': 'Claude Auto Mode',
  'prompt-craft': 'Prompt Craft',
  'zero-fluff-comms': 'Zero-Fluff Comms',
};

export const SKILL_COLORS: Record<SkillId, string> = {
  'token-optimizer': '#22d3ee',
  'claude-auto-mode': '#f59e0b',
  'prompt-craft': '#a78bfa',
  'zero-fluff-comms': '#4ade80',
};
