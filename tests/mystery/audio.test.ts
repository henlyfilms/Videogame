// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { engine, hz } from '../../src/mystery/audio/engine';
import { TRACKS } from '../../src/mystery/audio/music';

describe('soundtrack', () => {
  it('note names map to equal-temperament frequencies', () => {
    expect(hz('A4')).toBeCloseTo(440);
    expect(hz('A3')).toBeCloseTo(220);
    expect(hz('C4')).toBeCloseTo(261.63, 1);
    expect(hz('Bb2')).toBeCloseTo(116.54, 1);
  });

  it('every track schedules notes across multiple loops and intensities without errors', () => {
    const calls: Record<string, number> = {};
    const e = engine as unknown as Record<string, unknown>;
    const instruments = ['epiano', 'pad', 'pluck', 'bell', 'bass', 'organ', 'reed', 'kick', 'snare', 'hat', 'rim', 'shaker', 'clap', 'noiseHit', 'tone'];
    const saved: Record<string, unknown> = {};
    for (const k of instruments) {
      saved[k] = e[k];
      e[k] = (...args: unknown[]) => {
        calls[k] = (calls[k] ?? 0) + 1;
        // Frequencies must be finite and audible.
        for (const a of args) if (typeof a === 'number') expect(Number.isFinite(a)).toBe(true);
      };
    }
    try {
      expect(TRACKS.length).toBeGreaterThanOrEqual(12);
      const ids = new Set(TRACKS.map((t) => t.id));
      for (const need of ['title', 'lobby', 'match-hq', 'match-greenhouse', 'match-express', 'match-manor', 'lightsout', 'hideseek', 'hideseek-final', 'meeting', 'results', 'freeplay']) expect(ids.has(need)).toBe(true);
      for (const t of TRACKS) {
        let notes = 0;
        const before = Object.values(calls).reduce((a, b) => a + b, 0);
        for (const intensity of [0, 0.5, 1])
          for (let loop = 0; loop < 3; loop++)
            for (let step = 0; step < t.bars * 16; step++) t.step(step % 16, Math.floor(step / 16), step * 0.1, { out: {} as AudioNode, intensity, dur: 60 / t.bpm / 4, loop });
        notes = Object.values(calls).reduce((a, b) => a + b, 0) - before;
        expect(notes, t.id).toBeGreaterThan(t.bars * 4);
        expect(t.bpm).toBeGreaterThan(40);
        expect(t.bpm).toBeLessThan(200);
      }
    } finally {
      for (const k of instruments) e[k] = saved[k];
    }
  });
});
