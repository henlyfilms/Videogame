/**
 * The EventSourceAdapter contract. Adapters are tick-driven (the game loop
 * feeds them scaled sim-time), which keeps them deterministic and testable.
 */
import type { MarionEvent } from './events';
import type { MechanicsState } from '../game/mechanics';

export type AdapterKind = 'live' | 'replay' | 'ws';
export type ConnStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'fallback' | 'closed';

export interface AdapterContext {
  emit(ev: MarionEvent): void;
  /** Read-only view of current room state (lets the live sim react to backlog). */
  getMechanics(): MechanicsState;
  /** Reset sim + mechanics (used by replay seeking). */
  reset(): void;
  setStatus(status: ConnStatus, info?: string | null): void;
}

export interface EventSourceAdapter {
  readonly kind: AdapterKind;
  start(ctx: AdapterContext): void;
  stop(): void;
  /** Advance the adapter's clock by `dtMs` of (speed-scaled) sim time. */
  tick(dtMs: number): void;
}
