/**
 * Opt-in procedural Web Audio soundscape. Muted by default; the AudioContext
 * is created lazily on the first unmute (a user gesture). Effects: chimes,
 * pneumatic whoosh, stamp thud, spawn arpeggio. A soft lo-fi turntable loop
 * ducks to silence while any dictation wave is active.
 */
import type { SimEffect } from '../engine/sim';

export interface MusicInputs {
  muted: boolean;
  turntable: boolean;
  dictating: boolean;
}

export const MUSIC_LEVEL = 0.22;
export const DUCK_LEVEL = 0;

/** Target music gain — pure so it can be unit-tested. */
export function musicGainFor(i: MusicInputs): number {
  if (i.muted || !i.turntable) return 0;
  return i.dictating ? DUCK_LEVEL : MUSIC_LEVEL;
}

/** Minimum spacing between repeats of the same effect (ms). */
export const EFFECT_COOLDOWN: Record<SimEffect, number> = {
  whoosh: 140,
  chime: 120,
  stamp: 120,
  spawn: 400,
  deliver: 200,
  pop: 80,
  sort: 90,
};

type ACtor = typeof AudioContext;

function audioCtor(): ACtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// Fmaj7 → Em7 → Dm7 → Cmaj7, voiced low and soft.
const CHORDS: readonly number[][] = [
  [53, 57, 60, 64],
  [52, 55, 59, 62],
  [50, 53, 57, 60],
  [48, 52, 55, 59],
];
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/**
 * True once the page has had a user gesture (sticky user activation), so an
 * AudioContext can start without the browser's autoplay warning. Browsers
 * without the UserActivation API (older Safari, tests) report true and rely
 * on resume() from the gesture handlers.
 */
export function audioGestureSeen(): boolean {
  const ua = typeof navigator !== 'undefined' ? (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation : undefined;
  return ua ? ua.hasBeenActive : true;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private nextBar = 0;
  private bar = 0;
  private lastPlayed = new Map<SimEffect, number>();
  private inputs: MusicInputs = { muted: true, turntable: true, dictating: false };
  played = 0;

  get enabled(): boolean {
    return this.ctx !== null;
  }

  get musicTarget(): number {
    return musicGainFor(this.inputs);
  }

  /** Create the graph (call from a user gesture). Safe to call repeatedly. */
  private ensure(): boolean {
    if (this.ctx) return true;
    if (!audioGestureSeen()) return false;
    const Ctor = audioCtor();
    if (!Ctor) return false;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.5;
      this.sfx.connect(this.master);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      this.music = ctx.createGain();
      this.music.gain.value = 0;
      this.music.connect(lp);
      lp.connect(this.master);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  /** Resume a context created before the first user gesture. */
  resume(): void {
    if (!this.ctx && !this.inputs.muted) this.update(this.inputs);
    else void this.ctx?.resume?.();
  }

  update(inputs: MusicInputs): void {
    this.inputs = inputs;
    if (!inputs.muted) {
      if (!this.ensure()) return;
      void this.ctx!.resume?.();
      this.startLoop();
    }
    if (!this.ctx || !this.music) return;
    const now = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(musicGainFor(inputs), now, inputs.dictating ? 0.08 : 0.6);
    if (this.master) this.master.gain.setTargetAtTime(inputs.muted ? 0 : 0.8, now, 0.05);
    if (inputs.muted || !inputs.turntable) this.stopLoopSoon();
  }

  play(effect: SimEffect): void {
    if (this.inputs.muted || !this.ctx || !this.sfx) return;
    const nowMs = performance.now();
    const last = this.lastPlayed.get(effect) ?? -1e9;
    if (nowMs - last < EFFECT_COOLDOWN[effect]) return;
    this.lastPlayed.set(effect, nowMs);
    this.played++;
    const t = this.ctx.currentTime;
    switch (effect) {
      case 'chime':
        this.tone(1318.5, t, 0.5, 0.18);
        this.tone(1975.5, t + 0.06, 0.6, 0.1);
        break;
      case 'deliver':
        this.tone(659.3, t, 0.25, 0.14);
        this.tone(987.8, t + 0.09, 0.35, 0.12);
        break;
      case 'whoosh':
        this.whoosh(t);
        break;
      case 'stamp':
        this.thud(t);
        break;
      case 'spawn':
        [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, t + i * 0.07, 0.35, 0.12));
        break;
      case 'pop':
      case 'sort':
        this.tone(effect === 'sort' ? 880 : 1200, t, 0.08, 0.08, 'triangle');
        break;
    }
  }

  private tone(freq: number, t: number, dur: number, vol: number, type: OscillatorType = 'sine', dest?: AudioNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest ?? this.sfx!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private whoosh(t: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfx!);
    src.start(t);
    src.stop(t + 0.4);
  }

  private thud(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g);
    g.connect(this.sfx!);
    o.start(t);
    o.stop(t + 0.3);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(ng);
    ng.connect(this.sfx!);
    src.start(t);
    src.stop(t + 0.06);
  }

  // ---------------------------------------------------------------- lo-fi loop

  private startLoop(): void {
    if (this.loopTimer || !this.ctx || !this.inputs.turntable) return;
    this.nextBar = this.ctx.currentTime + 0.1;
    const barLen = (60 / 72) * 4; // 72 bpm, 4/4
    this.loopTimer = setInterval(() => {
      if (!this.ctx || !this.music) return;
      while (this.nextBar < this.ctx.currentTime + 0.6) {
        this.scheduleBar(this.nextBar, barLen);
        this.nextBar += barLen;
        this.bar++;
      }
    }, 150);
  }

  private stopLoopSoon(): void {
    if (!this.loopTimer) return;
    clearInterval(this.loopTimer);
    this.loopTimer = null;
  }

  private scheduleBar(t: number, len: number): void {
    const chord = CHORDS[this.bar % CHORDS.length]!;
    // Soft pad.
    for (const n of chord) this.tone(midi(n), t, len * 0.95, 0.035, 'triangle', this.music!);
    // Bass on beats 1 and 3.
    this.tone(midi(chord[0]! - 12), t, len * 0.45, 0.09, 'sine', this.music!);
    this.tone(midi(chord[0]! - 12), t + len / 2, len * 0.4, 0.07, 'sine', this.music!);
    // A lazy two-note melody.
    const beat = len / 4;
    this.tone(midi(chord[3]! + 12), t + beat * 1.5, beat * 1.4, 0.02, 'sine', this.music!);
    this.tone(midi(chord[2]! + 12), t + beat * 3, beat * 0.9, 0.018, 'sine', this.music!);
    // Vinyl crackle.
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.value = 0.012;
    src.connect(hp);
    hp.connect(g);
    g.connect(this.music!);
    src.start(t);
    src.stop(t + len);
  }

  dispose(): void {
    this.stopLoopSoon();
    void this.ctx?.close?.();
    this.ctx = null;
  }
}

export const audio = new AudioEngine();
