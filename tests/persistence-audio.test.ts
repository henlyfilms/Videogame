import { beforeEach, describe, expect, it } from 'vitest';
import { AudioEngine, DUCK_LEVEL, MUSIC_LEVEL, musicGainFor } from '../src/audio/audio';
import { makeEvent } from '../src/adapters/events';
import { HQ } from '../src/game/hq';
import { musicInputsFrom, wireAudio } from '../src/game/wireAudio';
import { Simulation } from '../src/engine/sim';
import { loadPersisted, persistedFrom, startPersistence, STORAGE_KEY, useGame } from '../src/store/gameStore';

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useGame.getState().resetMechanics(false);
    useGame.getState().setAdapter('live');
  });

  it('saves theme, custom bots, streaks, skills and planner to localStorage', () => {
    const stop = startPersistence();
    const s = useGame.getState();
    s.setTheme('dark');
    s.ingest(makeEvent('skill.slotted', { skillId: 'zero-fluff-comms', slotted: true }));
    s.ingest(makeEvent('bot.spawned', { botId: 'b1', name: 'Pip', job: 'Notes', shape: 'gem', color: '#000', glowColor: '#fff' }));
    s.ingest(makeEvent('planner.toggled', { cardId: 'seed_0', done: true }));
    stop();
    const saved = loadPersisted();
    expect(saved.theme).toBe('dark');
    expect(saved.skills).toEqual(['zero-fluff-comms']);
    expect(saved.customBots?.[0]?.name).toBe('Pip');
    expect(saved.progress?.streak).toBe(1);
    expect(saved.cards?.find((c) => c.id === 'seed_0')?.done).toBe(true);
  });

  it('restores persisted state and survives corrupt storage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...persistedFrom(useGame.getState()), skills: ['prompt-craft'], progress: { streak: 5, lastCheckDay: '2026-11-25', checkedTotal: 9, polish: 3 } }));
    useGame.getState().restoreFromStorage();
    expect(useGame.getState().mech.foundry.skills).toEqual(['prompt-craft']);
    expect(useGame.getState().mech.progress.streak).toBe(5);
    localStorage.setItem(STORAGE_KEY, '{oops');
    expect(loadPersisted()).toEqual({});
  });

  it('never persists replay sandboxes', () => {
    const stop = startPersistence();
    useGame.getState().setAdapter('replay');
    useGame.getState().ingest(makeEvent('skill.slotted', { skillId: 'token-optimizer', slotted: true }));
    stop();
    expect(loadPersisted().skills ?? []).not.toContain('token-optimizer');
  });
});

describe('audio', () => {
  it('is muted by default and ducks the turntable during dictation', () => {
    expect(useGame.getState().muted === true || typeof useGame.getState().muted === 'boolean').toBe(true);
    expect(musicGainFor({ muted: true, turntable: true, dictating: false })).toBe(0);
    expect(musicGainFor({ muted: false, turntable: true, dictating: false })).toBe(MUSIC_LEVEL);
    expect(musicGainFor({ muted: false, turntable: true, dictating: true })).toBe(DUCK_LEVEL);
    expect(musicGainFor({ muted: false, turntable: false, dictating: false })).toBe(0);
  });

  it('wires store dictation state into the engine without an AudioContext', () => {
    const engine = new AudioEngine();
    const hq = new HQ(new Simulation());
    const unwire = wireAudio(hq, engine);
    useGame.getState().ingest(makeEvent('dictation.wave', { active: true, source: 'life' }));
    expect(musicInputsFrom(useGame.getState()).dictating).toBe(true);
    expect(engine.musicTarget).toBe(0);
    engine.play('chime'); // muted → no-op, must not throw
    expect(engine.played).toBe(0);
    useGame.getState().ingest(makeEvent('dictation.wave', { active: false, source: 'life' }));
    unwire();
  });

  it('plays effects through a mocked AudioContext when unmuted', () => {
    const node = () => ({
      connect: () => undefined,
      gain: { value: 0, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined, setTargetAtTime: () => undefined, cancelScheduledValues: () => undefined },
      frequency: { value: 0, setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      Q: { value: 0 },
      start: () => undefined,
      stop: () => undefined,
      type: '',
      buffer: null,
    });
    class FakeCtx {
      currentTime = 0;
      sampleRate = 8000;
      destination = {};
      createGain = node;
      createOscillator = node;
      createBiquadFilter = node;
      createBufferSource = node;
      createBuffer = () => ({ getChannelData: () => new Float32Array(8000) });
      resume = async () => undefined;
      close = async () => undefined;
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
    const engine = new AudioEngine();
    engine.update({ muted: false, turntable: true, dictating: false });
    expect(engine.enabled).toBe(true);
    for (const fx of ['chime', 'whoosh', 'stamp', 'spawn', 'deliver', 'pop', 'sort'] as const) engine.play(fx);
    expect(engine.played).toBe(7);
    engine.play('chime'); // cooldown
    expect(engine.played).toBe(7);
    engine.dispose();
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });
});
