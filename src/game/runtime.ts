/**
 * One-time application boot: populate the sim, connect the store, persistence,
 * audio and the default LiveSimAdapter. Idempotent (safe under StrictMode).
 */
import { AdapterManager } from '../adapters/manager';
import { startPersistence, useGame } from '../store/gameStore';
import { hq } from './hq';
import { populateSim, wire } from './wire';
import { wireAudio } from './wireAudio';

export const manager = new AdapterManager(hq);
let booted = false;

export function boot(): void {
  if (booted) return;
  booted = true;
  populateSim(hq);
  wire(hq);
  startPersistence();
  wireAudio(hq);
  manager.use(useGame.getState().adapter);
  // `?hour=22` pins the day/night cycle (handy for demos and screenshots).
  if (typeof location !== 'undefined') {
    const h = Number(new URLSearchParams(location.search).get('hour'));
    if (new URLSearchParams(location.search).has('hour') && Number.isFinite(h)) hq.clockOverride = ((h % 24) + 24) % 24;
  }
  if (typeof window !== 'undefined') {
    // Handy for debugging and headless smoke tests.
    (window as unknown as { __hq: unknown }).__hq = { hq, manager, store: useGame };
  }
}
