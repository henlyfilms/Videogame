/**
 * Arcade overlay state: which game (if any) is open full-screen over the HQ,
 * and how it was launched. Kept separate from the HQ store so the game's
 * overlay can open and close without touching persisted HQ progress.
 */
import { create } from 'zustand';

/** How a game was launched from the Arcade. */
export type ArcadeIntent = { kind: 'menu' } | { kind: 'quick' } | { kind: 'join'; code: string };

export interface ArcadeOverlayState {
  /** Id of the open game (see ARCADE_GAMES), or null when the HQ is showing. */
  open: string | null;
  intent: ArcadeIntent;
  /** Bumped on each launch so the overlay can re-run its intent. */
  seq: number;
  launch: (gameId: string, intent?: ArcadeIntent) => void;
  close: () => void;
}

export const useArcade = create<ArcadeOverlayState>()((set, get) => ({
  open: null,
  intent: { kind: 'menu' },
  seq: 0,
  launch: (gameId, intent = { kind: 'menu' }) => set({ open: gameId, intent, seq: get().seq + 1 }),
  close: () => set({ open: null, intent: { kind: 'menu' } }),
}));

export const MYSTERY_ID = 'marion-mystery';

export function launchMystery(intent: ArcadeIntent = { kind: 'menu' }): void {
  useArcade.getState().launch(MYSTERY_ID, intent);
}
