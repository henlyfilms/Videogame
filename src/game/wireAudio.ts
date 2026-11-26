/**
 * Connect the audio engine to sim effects and store state (mute, turntable,
 * dictation ducking).
 */
import { audio as defaultAudio, type AudioEngine } from '../audio/audio';
import { useGame, type GameState } from '../store/gameStore';
import type { HQ } from './hq';

export function musicInputsFrom(s: GameState) {
  return { muted: s.muted, turntable: s.turntable, dictating: s.mech.life.dictating || s.bridgeDictating };
}

export function wireAudio(hq: HQ, engine: AudioEngine = defaultAudio, store = useGame): () => void {
  let last = '';
  const sync = (s: GameState) => {
    const i = musicInputsFrom(s);
    const key = `${i.muted}|${i.turntable}|${i.dictating}`;
    if (key === last) return;
    last = key;
    engine.update(i);
  };
  sync(store.getState());
  const unsub = store.subscribe(sync);
  const unfx = hq.onEffect((e) => engine.play(e));
  return () => {
    unsub();
    unfx();
  };
}
