/**
 * Bot finite-state machine. States come from the MarionEvent contract; this
 * module owns which transitions are legal so the sim and adapters can't put a
 * bot into an impossible state (e.g. asleep → huddling without waking).
 */
import type { BotState } from '../adapters/events';

export const TRANSITIONS: Readonly<Record<BotState, readonly BotState[]>> = {
  idle: ['walking', 'working', 'huddling', 'delegating', 'needs_input', 'asleep'],
  walking: ['idle', 'walking', 'working', 'huddling', 'delegating', 'needs_input'],
  working: ['idle', 'walking', 'delegating', 'needs_input', 'asleep'],
  huddling: ['idle', 'walking'],
  delegating: ['idle', 'walking', 'working'],
  needs_input: ['idle', 'walking', 'working'],
  asleep: ['idle', 'walking'],
};

export function canTransition(from: BotState, to: BotState): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export interface HasState {
  state: BotState;
  stateTime: number;
}

/** Apply a transition if legal. Returns true when the state changed (or was already `to`). */
export function transition(bot: HasState, to: BotState): boolean {
  if (bot.state === to) return true;
  if (!canTransition(bot.state, to)) return false;
  bot.state = to;
  bot.stateTime = 0;
  return true;
}

/**
 * Force a state by routing through `idle` when a direct edge doesn't exist
 * (e.g. asleep → working becomes asleep → idle → working). Used for external
 * events that must win (a live websocket saying "working" should wake a bot).
 */
export function forceTransition(bot: HasState, to: BotState): BotState[] {
  if (transition(bot, to)) return [to];
  const hops: BotState[] = [];
  if (transition(bot, 'idle')) hops.push('idle');
  if (transition(bot, to)) hops.push(to);
  return hops;
}

export const STATE_LABEL: Readonly<Record<BotState, string>> = {
  idle: 'Idle',
  walking: 'Walking',
  working: 'Working',
  huddling: 'Huddling',
  delegating: 'Delegating',
  needs_input: 'Needs input',
  asleep: 'Asleep',
};
