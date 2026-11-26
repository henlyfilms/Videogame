import { TASKS } from '../../core/tasks';
import type { MiniGameKind } from './types';

/** Sabotage fix panels have no task entry; give them a sensible floor. */
const FIX_MIN_SECONDS: Partial<Record<MiniGameKind, number>> = { lightsPanel: 1.5, commsPanel: 1.5 };

/**
 * Minimum time (ms) a mini-game must stay open before it may report success.
 * Mirrors the server's `minTime` (the strictest task that uses the station),
 * plus a small safety margin for clock skew.
 */
export function minTimeMs(kind: MiniGameKind): number {
  let s = FIX_MIN_SECONDS[kind] ?? 0;
  for (const t of TASKS) if ((t.steps as string[]).includes(kind)) s = Math.max(s, t.minTime);
  return Math.round(s * 1000) + 250;
}
