/**
 * Connect the audio engine to sim effects and store state (mute, turntable,
 * dictation ducking).
 */
import { useArcade } from '../arcade/state';
import { audio as defaultAudio, type AudioEngine } from '../audio/audio';
import { useGame, type GameState } from '../store/gameStore';
import type { HQ } from './hq';

export function musicInputsFrom(s: GameState) {
  return { muted: s.muted, turntable: s.turntable, dictating: s.mech.life.dictating || s.bridgeDictating };
}

/**
 * `legacyMusic: false` silences the old turntable loop (the seasonal HQ
 * soundtrack in hqSound.ts replaces it); sim effects still play here.
 */
export function wireAudio(hq: HQ, engine: AudioEngine = defaultAudio, store = useGame, opts: { legacyMusic?: boolean } = {}): () => void {
  let last = '';
  const sync = (s: GameState) => {
    const i = musicInputsFrom(s);
    // The HQ lo-fi loop stays quiet while an Arcade game is on screen.
    if (useArcade.getState().open) i.muted = true;
    if (opts.legacyMusic === false) i.turntable = false;
    const key = `${i.muted}|${i.turntable}|${i.dictating}`;
    if (key === last) return;
    last = key;
    engine.update(i);
  };
  sync(store.getState());
  const unsub = store.subscribe(sync);
  const unArcade = useArcade.subscribe(() => sync(store.getState()));
  const unfx = hq.onEffect((e) => engine.play(e));
  return () => {
    unsub();
    unArcade();
    unfx();
  };
}
