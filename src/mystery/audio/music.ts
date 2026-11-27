/**
 * Marion Mystery soundtrack: a sample-accurate look-ahead sequencer playing
 * composed, fully synthesized tracks — one per scene, mode and map — with
 * crossfades, a live "intensity" control (dread, final countdown) and
 * one-shot stingers (role reveal, report, victory/defeat…).
 */
import { engine, hz } from './engine';

type StepFn = (step: number, bar: number, t: number, s: Ctx) => void;

interface Ctx {
  out: AudioNode;
  intensity: number;
  dur: number; // seconds per 16th
  loop: number; // loop counter
}

export interface TrackDef {
  id: string;
  name: string;
  mood: string;
  bpm: number;
  bars: number;
  swing?: number;
  step: StepFn;
  /** Optional ambience bed started with the track. */
  bed?: (out: AudioNode) => () => void;
}

// --- harmony helpers ----------------------------------------------------------
const Q: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  '7b9': [0, 4, 7, 10, 13],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  dim: [0, 3, 6],
};
function chord(sym: string, octave = 3): number[] {
  const m = /^([A-G][#b]?)(.*)$/.exec(sym)!;
  const root = hz(`${m[1]}${octave}`);
  return (Q[m[2] ?? ''] ?? Q['']!).map((i) => root * Math.pow(2, i / 12));
}
const rootOf = (sym: string, octave = 2) => hz(`${/^([A-G][#b]?)/.exec(sym)![1]}${octave}`);
type Mel = [step: number, note: string, len: number, vel?: number][];
/** Fire melody notes that start on this step (step is within the whole loop). */
function mel(m: Mel, loopStep: number, fn: (f: number, len: number, vel: number) => void) {
  for (const [s, n, l, v] of m) if (s === loopStep) fn(hz(n), l, v ?? 0.6);
}
const hit = (pattern: string, step: number) => pattern[step % pattern.length] === 'x';
const rnd = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// --- tracks -------------------------------------------------------------------

const TITLE_CHORDS = ['Dm9', 'Bbmaj7', 'Gm7', 'A7b9', 'Dm9', 'Bbmaj7', 'Gm7', 'A7'];
const TITLE_MEL: Mel = [
  [0, 'D5', 4],
  [4, 'F5', 2],
  [6, 'A5', 6],
  [16, 'G5', 3],
  [19, 'F5', 3],
  [22, 'E5', 2],
  [24, 'D5', 8],
  [32, 'Bb4', 4],
  [36, 'D5', 2],
  [38, 'G5', 6],
  [48, 'A5', 3],
  [51, 'G5', 3],
  [54, 'F5', 2],
  [56, 'E5', 6],
  [62, 'C#5', 2],
  [64, 'D5', 4],
  [68, 'F5', 2],
  [70, 'A5', 4],
  [74, 'C6', 2],
  [80, 'Bb5', 3],
  [83, 'A5', 3],
  [86, 'G5', 2],
  [88, 'F5', 8],
  [96, 'E5', 4],
  [100, 'G5', 2],
  [102, 'Bb5', 6],
  [112, 'A5', 6],
  [118, 'E5', 2],
  [120, 'D5', 8],
];

const title: TrackDef = {
  id: 'title',
  name: 'Marion Mystery (Main Theme)',
  mood: 'Mysterious, playful',
  bpm: 92,
  bars: 8,
  step(step, bar, t, s) {
    const c = TITLE_CHORDS[bar]!;
    const notes = chord(c, 3);
    if (step === 0 || step === 6 || step === 10) for (const f of notes.slice(1)) engine.epiano(s.out, f, t, s.dur * (step === 0 ? 6 : 3), step === 0 ? 0.42 : 0.3, { rev: 0.3 });
    if (step % 2 === 0) {
      const arp = chord(c, 4);
      engine.pluck(s.out, arp[(step / 2) % arp.length]!, t, 0.26, { len: 1.2, bright: 0.45, del: 0.25, pan: (step % 4 ? 0.3 : -0.3) });
    }
    if (step === 0 || step === 10) engine.bass(s.out, rootOf(c), t, s.dur * (step === 0 ? 8 : 5), 0.6);
    if (hit('x.......x.....x.', step) && (step !== 14 || bar % 2)) engine.kick(s.out, t, 0.55);
    if (step === 4 || step === 12) engine.rim(s.out, t, 0.45);
    if (step % 2 === 0) engine.hat(s.out, t, step % 4 ? 0.18 : 0.28);
    mel(TITLE_MEL, bar * 16 + step, (f, _l, v) => engine.bell(s.out, f, t, 0.32 * v + 0.1, { kind: 'bell', del: 0.2, rev: 0.4 }));
  },
};

const lobby: TrackDef = {
  id: 'lobby',
  name: 'Launch Bay Lounge',
  mood: 'Lo-fi, cozy',
  bpm: 76,
  bars: 4,
  swing: 0.2,
  bed: (out) => engine.crackleBed(out, 0.6),
  step(step, bar, t, s) {
    const c = ['Fmaj9', 'Em7', 'Dm9', 'Cmaj7'][bar]!;
    if (step === 0) for (const f of chord(c, 3)) engine.epiano(s.out, f, t, s.dur * 14, 0.3, { rev: 0.35, bright: 0.3 });
    if (step === 11) for (const f of chord(c, 3).slice(1, 4)) engine.epiano(s.out, f * 2, t, s.dur * 4, 0.16, { rev: 0.4 });
    const walk = [0, 7, 10, 12];
    if (step % 4 === 0) engine.bass(s.out, rootOf(c) * Math.pow(2, walk[step / 4]! / 12), t, s.dur * 3, 0.45, { cutoff: 650 });
    if (hit('x......x..x.....', step)) engine.kick(s.out, t, 0.45, 0.9);
    if (step === 4 || step === 12) engine.noiseHit(s.out, t, 0.18, 0.12, 2500, 'bandpass', 0.6, 0.15);
    if (step % 2 === 0) engine.shaker(s.out, t, step % 4 ? 0.12 : 0.2);
    if (rnd(s.loop * 64 + bar * 16 + step) < 0.12 && step % 2 === 0) {
      const sc = ['F5', 'A5', 'C6', 'E5', 'G5', 'D5'];
      engine.bell(s.out, hz(sc[Math.floor(rnd(step + bar + s.loop) * sc.length)]!), t, 0.18, { kind: 'marimba', del: 0.35 });
    }
  },
};

function afterHours(id: string, name: string, voice: 'epiano' | 'glass' | 'reed' | 'harpsichord', bpm: number, chords: string[]): TrackDef {
  return {
    id,
    name,
    mood: 'Light tension',
    bpm,
    bars: chords.length,
    bed: voice === 'glass' ? (out) => engine.noiseBed(out, 0.02, 600, 'lowpass', 0.5, 0.05, 0.4) : undefined,
    step(step, bar, t, s) {
      const c = chords[bar]!;
      if (step === 0) engine.pad(s.out, chord(c, 3), t, s.dur * 16, voice === 'harpsichord' ? 0.18 : 0.22, { cutoff: voice === 'glass' ? 2000 : 1100, type: voice === 'harpsichord' ? 'triangle' : 'sawtooth' });
      const arp = chord(c, voice === 'reed' ? 3 : 4);
      const pat = voice === 'reed' ? 'x.x.x.x.x.x.x.x.' : 'x..x..x...x..x..';
      if (hit(pat, step)) {
        const f = arp[(step * 3 + bar) % arp.length]!;
        if (voice === 'epiano') engine.epiano(s.out, f, t, s.dur * 2, 0.22, { del: 0.25 });
        else if (voice === 'glass') engine.bell(s.out, f, t, 0.2, { kind: 'glass', del: 0.3 });
        else if (voice === 'harpsichord') engine.pluck(s.out, f, t, 0.3, { len: 1.4, bright: 0.95, damp: 0.994, rev: 0.35 });
        else engine.pluck(s.out, f, t, 0.24, { len: 0.6, bright: 0.6, damp: 0.99 });
      }
      if (step === 0 || (step === 8 && s.intensity > 0.3)) engine.bass(s.out, rootOf(c), t, s.dur * 7, 0.45, { cutoff: 600 });
      if (voice === 'reed') {
        engine.shaker(s.out, t, step % 4 === 0 ? 0.25 : 0.12); // train chug
        if (step === 0 || step === 8) engine.kick(s.out, t, 0.35, 0.8);
        if (bar % 2 === 1 && step === 4) engine.reed(s.out, chord(c, 4)[2]!, t, s.dur * 6, 0.35);
        if (bar % 2 === 1 && step === 10) engine.reed(s.out, chord(c, 4)[1]!, t, s.dur * 5, 0.3);
      } else {
        if (step === 0) engine.kick(s.out, t, 0.3 + s.intensity * 0.3, 0.85);
        if (s.intensity > 0.4 && step % 4 === 2) engine.hat(s.out, t, 0.15);
      }
      if (voice === 'harpsichord' && step === 8 && bar % 2 === 0) engine.organ(s.out, chord(c, 2)[0]!, t, s.dur * 8, 0.25);
    },
  };
}

const lightsout: TrackDef = {
  id: 'lightsout',
  name: 'Night Shift',
  mood: 'Dark, tense, spooky-fun',
  bpm: 60,
  bars: 4,
  bed: (out) => engine.noiseBed(out, 0.035, 380, 'bandpass', 0.6, 0.06, 0.6),
  step(step, bar, t, s) {
    if (step === 0 && bar % 2 === 0) engine.pad(s.out, [hz('D2'), hz('A2'), hz(bar === 2 ? 'Bb2' : 'D3')], t, s.dur * 32, 0.3, { cutoff: 520, attack: 2.5, rev: 0.6 });
    if (rnd(s.loop * 64 + bar * 16 + step) < 0.07) {
      const sc = ['D5', 'F5', 'A5', 'C6', 'D6', 'E5'];
      engine.bell(s.out, hz(sc[Math.floor(rnd(step * 7 + bar + s.loop) * sc.length)]!), t, 0.16, { kind: 'musicbox', rev: 0.7, del: 0.35, pan: rnd(step + bar) * 1.6 - 0.8 });
    }
    // Heartbeat sub when dread rises.
    if (s.intensity > 0.25 && (step === 0 || step === 3 || (s.intensity > 0.6 && (step === 8 || step === 11)))) engine.kick(s.out, t, 0.25 + s.intensity * 0.45, 0.55);
    if (step === 8 && bar === 3) engine.noiseHit(s.out, t, 2.2, 0.05, 900, 'bandpass', 2, 0.6, 200);
  },
};

const hideseek: TrackDef = {
  id: 'hideseek',
  name: 'Ready or Not',
  mood: 'Playful chase',
  bpm: 118,
  bars: 4,
  step(step, bar, t, s) {
    const c = ['C', 'Am', 'F', 'G'][bar]!;
    const arp = chord(c, 4);
    if (hit('x.xx.x.x.xx.x.x.', step)) engine.pluck(s.out, arp[(step + bar) % arp.length]!, t, 0.32, { len: 0.35, bright: 0.7, damp: 0.985, pan: step % 2 ? 0.35 : -0.35 });
    if (step % 4 === 0) engine.bass(s.out, rootOf(c, 2) * (step % 8 ? 2 : 1), t, s.dur * 1.5, 0.5, { cutoff: 800 });
    if (step === 0 || step === 8) engine.kick(s.out, t, 0.5);
    if (step === 4 || step === 12) engine.clap(s.out, t, 0.35);
    if (step % 2 === 1) engine.hat(s.out, t, 0.12);
    if (bar === 3 && step === 12) engine.bell(s.out, hz('G5'), t, 0.25, { kind: 'marimba' });
  },
};

const hideseekFinal: TrackDef = {
  id: 'hideseek-final',
  name: 'Final Countdown (Ready or Not reprise)',
  mood: 'Frantic',
  bpm: 142,
  bars: 4,
  step(step, bar, t, s) {
    const c = ['Am', 'F', 'Dm', 'E7'][bar]!;
    const arp = chord(c, 4);
    engine.pluck(s.out, arp[(step * 2 + bar) % arp.length]! * (step % 8 < 4 ? 1 : 2), t, 0.26, { len: 0.25, bright: 0.8, damp: 0.98 });
    if (step % 2 === 0) engine.bass(s.out, rootOf(c, 2), t, s.dur * 1.2, 0.55, { cutoff: 900, type: 'sawtooth' });
    if (step % 4 === 0) engine.kick(s.out, t, 0.7);
    if (step === 4 || step === 12) engine.snare(s.out, t, 0.55);
    engine.hat(s.out, t, step % 2 ? 0.12 : 0.22);
    if (step === 0 && bar === 0) engine.tone(s.out, 880, t, 0.25, 0.08, 'square', 0, 0, 0.2);
  },
};

const meeting: TrackDef = {
  id: 'meeting',
  name: 'Round Table',
  mood: 'Tense deliberation',
  bpm: 100,
  bars: 4,
  step(step, bar, t, s) {
    const c = ['Em', 'Cmaj7', 'Am7', 'B7'][bar]!;
    if (step % 2 === 0) engine.rim(s.out, t, step % 4 ? 0.3 : 0.48); // the clock
    if (hit('x..x..x.x..x..x.', step)) engine.pluck(s.out, rootOf(c, 2) * 2 * (step % 8 === 6 ? 1.5 : 1), t, 0.6, { len: 0.8, bright: 0.45, damp: 0.992 });
    if (step === 0) engine.pad(s.out, chord(c, 3), t, s.dur * 16, 0.3, { cutoff: 1100 });
    if (step === 8 && bar === 3) engine.bell(s.out, hz('D#5'), t, 0.2, { kind: 'bell' });
  },
};

const RESULTS_MEL: Mel = [
  [0, 'B4', 4],
  [4, 'D5', 4],
  [8, 'G5', 8],
  [16, 'F#5', 4],
  [20, 'E5', 4],
  [24, 'D5', 8],
  [32, 'E5', 4],
  [36, 'G5', 4],
  [40, 'C6', 8],
  [48, 'B5', 4],
  [52, 'A5', 4],
  [56, 'D5', 8],
];
const results: TrackDef = {
  id: 'results',
  name: 'Debrief',
  mood: 'Warm, reflective',
  bpm: 90,
  bars: 4,
  step(step, bar, t, s) {
    const c = ['Gmaj7', 'Em7', 'Cmaj9', 'D6'][bar]!;
    if (step === 0 || step === 7) for (const f of chord(c, 3)) engine.epiano(s.out, f, t, s.dur * 6, 0.3, { rev: 0.3 });
    if (step === 0 || step === 10) engine.bass(s.out, rootOf(c), t, s.dur * 6, 0.5);
    if (step === 0 || step === 10) engine.kick(s.out, t, 0.4);
    if (step === 4 || step === 12) engine.rim(s.out, t, 0.3);
    if (step % 2 === 0) engine.hat(s.out, t, 0.14);
    mel(RESULTS_MEL, bar * 16 + step, (f) => engine.bell(s.out, f, t, 0.24, { kind: 'marimba', del: 0.3 }));
  },
};

const freeplay: TrackDef = {
  id: 'freeplay',
  name: 'Practice Run',
  mood: 'Bright, bouncy',
  bpm: 104,
  bars: 4,
  step(step, bar, t, s) {
    const c = ['C', 'Am', 'F', 'G'][bar]!;
    const arp = chord(c, 4);
    if (step % 2 === 0) engine.bell(s.out, arp[(step / 2 + bar) % arp.length]!, t, 0.2, { kind: 'marimba', rev: 0.2 });
    if (step === 0 || step === 6 || step === 10) engine.bass(s.out, rootOf(c), t, s.dur * 3, 0.45);
    if (step === 0 || step === 8) engine.kick(s.out, t, 0.45);
    if (step === 4 || step === 12) engine.clap(s.out, t, 0.25);
    if (step % 2 === 1) engine.shaker(s.out, t, 0.12);
  },
};

const credits: TrackDef = {
  id: 'credits',
  name: 'Berry Suspicious (Title Variation)',
  mood: 'Sneaky swing',
  bpm: 108,
  bars: 4,
  swing: 0.22,
  step(step, bar, t, s) {
    const c = ['Dm7', 'G7', 'Cmaj7', 'A7b9'][bar]!;
    if (step % 4 === 0) engine.bass(s.out, rootOf(c) * Math.pow(2, [0, 3, 7, 10][step / 4]! / 12), t, s.dur * 3, 0.5, { cutoff: 700 });
    if (step === 2 || step === 10) for (const f of chord(c, 3).slice(1)) engine.epiano(s.out, f, t, s.dur * 2, 0.26);
    if (step % 2 === 0) engine.hat(s.out, t, step % 4 ? 0.12 : 0.22);
    if (step === 4 || step === 12) engine.rim(s.out, t, 0.35);
    if (step === 0 || step === 14) engine.kick(s.out, t, 0.4);
    const motif = ['D5', 'F5', 'A5', 'G5', 'F5', 'E5', 'D5', 'C#5'];
    if (bar % 2 === 1 && step % 2 === 0) engine.pluck(s.out, hz(motif[step / 2]!), t, 0.22, { len: 0.5, bright: 0.6, del: 0.2 });
  },
};

// --- Marion HQ: one theme per season (day) + a night lo-fi ------------------

/** Spring: light bossa — e-piano comping, music-box melody, brushed rim + shaker. */
const hqSpring: TrackDef = {
  id: 'hq-spring',
  name: 'Blossom Standup (HQ · Spring)',
  mood: 'Fresh, hopeful bossa',
  bpm: 96,
  bars: 4,
  swing: 0.12,
  step(step, bar, t, s) {
    const c = ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'][bar]!;
    const notes = chord(c, 3);
    if (hit('x..x..x...x..x..', step)) for (const f of notes.slice(1)) engine.epiano(s.out, f * 2, t, s.dur * 2, 0.16, { del: 0.2, rev: 0.3 });
    if (step === 0 || step === 6 || step === 10) engine.bass(s.out, rootOf(c) * (step === 6 ? 1.5 : 1), t, s.dur * 3, 0.42, { cutoff: 700 });
    if (step % 2 === 0) engine.shaker(s.out, t, step % 4 ? 0.1 : 0.16);
    if (hit('..x...x..x....x.', step)) engine.rim(s.out, t, 0.22);
    if (step === 0) engine.kick(s.out, t, 0.32, 0.9);
    const m: Mel = [
      [0, 'A5', 2], [2, 'C6', 2], [4, 'E6', 4], [10, 'D6', 2], [12, 'C6', 4],
      [16, 'G5', 2], [18, 'B5', 2], [20, 'D6', 4], [26, 'C6', 2], [28, 'B5', 4],
      [32, 'F5', 2], [34, 'A5', 2], [36, 'C6', 4], [42, 'E6', 2], [44, 'D6', 4],
      [48, 'E5', 2], [50, 'G5', 2], [52, 'B5', 6], [60, 'C6', 4],
    ];
    if (s.loop % 2 === 1) mel(m, bar * 16 + step, (f, _len, v) => engine.bell(s.out, f, t, 0.13 * v + 0.05, { kind: 'musicbox', del: 0.25, rev: 0.4 }));
  },
};

/** Summer: sunny marimba groove with a walking bass and claps. */
const hqSummer: TrackDef = {
  id: 'hq-summer',
  name: 'Sunroof Sprint (HQ · Summer)',
  mood: 'Bright, bouncy, warm',
  bpm: 112,
  bars: 4,
  swing: 0.08,
  step(step, bar, t, s) {
    const c = ['C6', 'Am7', 'Dm7', 'G7'][bar]!;
    const notes = chord(c, 4);
    if (hit('x.x..x.x..x.x..x', step)) engine.bell(s.out, notes[(step + bar) % notes.length]!, t, 0.2, { kind: 'marimba', pan: ((step % 4) - 1.5) * 0.25 });
    if (step % 4 === 0) engine.bass(s.out, rootOf(c) * Math.pow(2, [0, 4, 7, 9][step / 4]! / 12), t, s.dur * 3, 0.45, { cutoff: 800 });
    if (step === 0 || step === 8 || step === 11) engine.kick(s.out, t, 0.42, 0.95);
    if (step === 4 || step === 12) engine.clap(s.out, t, 0.3);
    if (step % 2 === 1) engine.hat(s.out, t, 0.1);
    if (step === 0) engine.pad(s.out, chord(c, 3), t, s.dur * 16, 0.1, { cutoff: 1600, attack: 0.3 });
    if (s.loop % 2 === 1 && step % 4 === 2) engine.pluck(s.out, notes[(bar + step / 2) % notes.length]! * 2, t, 0.16, { len: 0.5, bright: 0.8, del: 0.3 });
  },
};

/** Fall: warm swung lo-fi — crackle, Rhodes, mellow reed counter-line. */
const hqFall: TrackDef = {
  id: 'hq-fall',
  name: 'Cider Commit (HQ · Fall)',
  mood: 'Cozy, nostalgic lo-fi',
  bpm: 82,
  bars: 4,
  swing: 0.24,
  bed: (out) => engine.crackleBed(out, 0.35),
  step(step, bar, t, s) {
    const c = ['Am7', 'Dm7', 'G7', 'Cmaj7'][bar]!;
    if (step === 0 || step === 7) for (const f of chord(c, 3).slice(1)) engine.epiano(s.out, f, t, s.dur * 6, 0.2, { rev: 0.35, bright: 0.4 });
    if (step === 0 || step === 10) engine.bass(s.out, rootOf(c), t, s.dur * 5, 0.5, { cutoff: 520 });
    if (step === 0 || step === 9) engine.kick(s.out, t, 0.5, 0.85);
    if (step === 4 || step === 12) engine.snare(s.out, t, 0.24);
    if (step % 2 === 0) engine.hat(s.out, t, step % 4 ? 0.08 : 0.14);
    if (bar % 2 === 1 && step === 2) engine.reed(s.out, chord(c, 4)[2]!, t, s.dur * 6, 0.18);
    if (bar % 2 === 1 && step === 9) engine.reed(s.out, chord(c, 4)[1]!, t, s.dur * 5, 0.15);
  },
};

/** Winter: gentle 3/4-feel celesta waltz over warm pads, sleigh shaker. */
const hqWinter: TrackDef = {
  id: 'hq-winter',
  name: 'Snowfall Sync (HQ · Winter)',
  mood: 'Twinkly, warm, festive',
  bpm: 92,
  bars: 4,
  step(step, bar, t, s) {
    const c = ['Gmaj7', 'Em7', 'Cmaj7', 'D7'][bar]!;
    const notes = chord(c, 4);
    if (step === 0) engine.pad(s.out, chord(c, 3), t, s.dur * 16, 0.16, { cutoff: 1200, attack: 0.5, rev: 0.5 });
    if (step === 0 || step === 6 || step === 12) engine.bass(s.out, rootOf(c), t, s.dur * 4, 0.35, { cutoff: 500 });
    if (hit('x.x.x.x.x.x.x.x.', step)) engine.bell(s.out, notes[(step / 2 + bar) % notes.length]! * (step % 6 === 0 ? 2 : 1), t, 0.12, { kind: 'musicbox', rev: 0.5, del: 0.2 });
    if (s.loop % 2 === 1 && (step === 3 || step === 11)) engine.bell(s.out, notes[3 % notes.length]! * 2, t, 0.1, { kind: 'glass', rev: 0.6 });
    if (step % 2 === 0) engine.shaker(s.out, t, step % 6 === 0 ? 0.14 : 0.07);
    if (step === 0) engine.kick(s.out, t, 0.24, 0.8);
  },
};

/** Night: slow, dusty lo-fi for late-night commits (all seasons). */
const hqNight: TrackDef = {
  id: 'hq-night',
  name: 'Night Build (HQ · Night)',
  mood: 'Mellow, sleepy lo-fi',
  bpm: 72,
  bars: 4,
  swing: 0.2,
  bed: (out) => engine.crackleBed(out, 0.45),
  step(step, bar, t, s) {
    const c = ['Dm9', 'G7', 'Cmaj9', 'Am7'][bar]!;
    if (step === 0 || step === 10) for (const f of chord(c, 3).slice(1, 5)) engine.epiano(s.out, f, t, s.dur * 8, 0.17, { rev: 0.45, bright: 0.25, del: 0.25 });
    if (step === 0 || step === 11) engine.bass(s.out, rootOf(c), t, s.dur * 6, 0.45, { cutoff: 420 });
    if (step === 0 || step === 7) engine.kick(s.out, t, 0.38, 0.8);
    if (step === 8) engine.snare(s.out, t, 0.16);
    if (step % 4 === 2) engine.hat(s.out, t, 0.07);
    if (s.loop % 2 === 1 && bar === 2 && step === 4) engine.bell(s.out, chord(c, 5)[1]!, t, 0.07, { kind: 'glass', rev: 0.7, del: 0.4 });
  },
};

export const TRACKS: TrackDef[] = [
  title,
  lobby,
  afterHours('match-hq', 'After Hours (Marion HQ)', 'epiano', 84, ['Am9', 'Fmaj7', 'Cmaj7', 'G6']),
  afterHours('match-greenhouse', 'Hydroponic Hush (Orbital Greenhouse)', 'glass', 78, ['Em9', 'Cmaj9', 'Gadd9', 'D6']),
  afterHours('match-express', 'Midnight Line (Midnight Express)', 'reed', 100, ['Dm', 'Bb', 'C', 'A7']),
  afterHours('match-manor', 'Hollowberry Waltz (Hollowberry Manor)', 'harpsichord', 72, ['Cm', 'Ab', 'Fm', 'G7']),
  lightsout,
  hideseek,
  hideseekFinal,
  meeting,
  results,
  freeplay,
  credits,
  hqSpring,
  hqSummer,
  hqFall,
  hqWinter,
  hqNight,
];
export const TRACK_BY_ID: Record<string, TrackDef> = Object.fromEntries(TRACKS.map((t) => [t.id, t]));

// --- player -------------------------------------------------------------------

class MusicPlayer {
  private current: { def: TrackDef; out: GainNode; stopBed?: () => void } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTime = 0;
  private step = 0;
  private loop = 0;
  intensity = 0;
  trackId: string | null = null;

  play(id: string | null, fade = 1.6): void {
    if (id === this.trackId) return;
    this.trackId = id;
    const ctx = engine.ctx;
    const b = engine.buses;
    if (!ctx || !b) return;
    const old = this.current;
    if (old) {
      old.out.gain.setTargetAtTime(0, ctx.currentTime, fade / 4);
      setTimeout(() => {
        old.stopBed?.();
        old.out.disconnect();
      }, fade * 1000 + 600);
    }
    this.current = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!id) return;
    const def = TRACK_BY_ID[id];
    if (!def) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, fade / 4);
    out.connect(b.music);
    this.current = { def, out, stopBed: def.bed?.(out) };
    this.step = 0;
    this.loop = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  /** Re-start the current track (e.g. after the context was created). */
  resume(): void {
    const id = this.trackId;
    this.trackId = null;
    if (id) this.play(id, 0.4);
  }

  private schedule(): void {
    const ctx = engine.ctx;
    const cur = this.current;
    if (!ctx || !cur) return;
    const def = cur.def;
    const sixteenth = 60 / def.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const bar = Math.floor(this.step / 16) % def.bars;
      const s = this.step % 16;
      const swing = def.swing && s % 2 === 1 ? sixteenth * def.swing : 0;
      try {
        def.step(s, bar, this.nextTime + swing, { out: cur.out, intensity: this.intensity, dur: sixteenth, loop: this.loop });
      } catch {
        /* never let a bad note stop the music */
      }
      this.nextTime += sixteenth;
      this.step++;
      if (this.step % (def.bars * 16) === 0) this.loop++;
    }
  }

  stop(): void {
    this.play(null);
  }
}

export const music = new MusicPlayer();

// --- stingers -----------------------------------------------------------------

export type Stinger = 'victory' | 'defeat' | 'reveal-crew' | 'reveal-murderer' | 'reveal-neutral' | 'report' | 'emergency' | 'eject' | 'ghost' | 'final';

export function stinger(kind: Stinger): void {
  const ctx = engine.ctx;
  const b = engine.buses;
  if (!ctx || !b) return;
  const t = ctx.currentTime + 0.02;
  const out = b.music;
  switch (kind) {
    case 'victory': {
      const seq = ['C5', 'E5', 'G5', 'C6', 'E6'];
      seq.forEach((n, i) => engine.bell(out, hz(n), t + i * 0.1, 0.35, { kind: 'bell', rev: 0.5 }));
      for (const f of chord('Cmaj9', 3)) engine.epiano(out, f, t + 0.5, 2.5, 0.45, { rev: 0.5 });
      engine.pad(out, chord('Cmaj7', 4), t + 0.5, 2.5, 0.25, { cutoff: 2600, attack: 0.3 });
      engine.kick(out, t + 0.5, 0.6);
      engine.noiseHit(out, t + 0.5, 1.6, 0.12, 9000, 'highpass', 0.7, 0.4);
      break;
    }
    case 'defeat': {
      ['A4', 'F4', 'D4', 'A3'].forEach((n, i) => engine.pluck(out, hz(n), t + i * 0.28, 0.45, { len: 2, bright: 0.35, rev: 0.5 }));
      engine.pad(out, chord('Dm', 3), t + 0.6, 2.6, 0.3, { cutoff: 700, attack: 0.6 });
      break;
    }
    case 'reveal-crew':
      engine.pad(out, chord('Dmaj9', 3), t, 3, 0.3, { cutoff: 2400, attack: 0.8 });
      engine.bell(out, hz('F#5'), t + 0.9, 0.35, { kind: 'glass', rev: 0.6 });
      engine.bell(out, hz('A5'), t + 1.1, 0.35, { kind: 'glass', rev: 0.6 });
      break;
    case 'reveal-murderer':
      engine.noiseHit(out, t, 1.1, 0.18, 300, 'bandpass', 1.5, 0.4, 3000); // reverse whoosh
      engine.pad(out, [hz('D2'), hz('Ab2'), hz('C#3')], t + 0.9, 3, 0.45, { cutoff: 700, attack: 0.05 });
      engine.kick(out, t + 0.9, 0.9, 0.7);
      engine.tone(out, hz('D6'), t + 0.95, 1.6, 0.05, 'sawtooth', hz('C#6'), 0, 0.5);
      break;
    case 'reveal-neutral':
      ['C5', 'D5', 'E5', 'F#5', 'G#5', 'A#5'].forEach((n, i) => engine.bell(out, hz(n), t + i * 0.08, 0.25, { kind: 'marimba' }));
      break;
    case 'report':
      engine.pad(out, [hz('C3'), hz('F#3'), hz('C4')], t, 1.5, 0.4, { cutoff: 1800, attack: 0.02 });
      engine.kick(out, t, 0.9, 0.8);
      engine.noiseHit(out, t, 0.6, 0.25, 2000, 'bandpass', 1, 0.4, 300);
      break;
    case 'emergency':
      for (let i = 0; i < 3; i++) {
        engine.tone(out, 880, t + i * 0.42, 0.2, 0.12, 'square', 0, 0, 0.3);
        engine.tone(out, 660, t + i * 0.42 + 0.21, 0.2, 0.12, 'square', 0, 0, 0.3);
      }
      break;
    case 'eject':
      engine.noiseHit(out, t, 2.2, 0.3, 300, 'bandpass', 0.8, 0.5, 4000);
      engine.tone(out, 200, t, 2, 0.08, 'sine', 60, 0, 0.5);
      break;
    case 'ghost':
      engine.pad(out, chord('Ebmaj7', 4), t, 2.4, 0.25, { cutoff: 3000, attack: 0.4, type: 'sine' });
      engine.tone(out, hz('Bb5'), t, 2, 0.05, 'sine', hz('Bb6'), 0, 0.7);
      break;
    case 'final':
      engine.tone(out, 220, t, 0.9, 0.15, 'sawtooth', 880, 0, 0.3);
      engine.kick(out, t + 0.9, 0.9);
      break;
  }
}

/**
 * Render a track offline (for automated level checks and soundtrack exports).
 * Returns the rendered stereo buffer.
 */
export async function renderTrack(id: string, seconds: number, intensity = 0, sampleRate = 44100): Promise<AudioBuffer> {
  const def = TRACK_BY_ID[id];
  if (!def) throw new Error(`no track ${id}`);
  const ctx = new OfflineAudioContext(2, Math.floor(sampleRate * seconds), sampleRate);
  engine.attach(ctx);
  const b = engine.buses!;
  b.music.gain.value = 0.75;
  const out = ctx.createGain();
  out.connect(b.music);
  const stopBed = def.bed?.(out);
  const sixteenth = 60 / def.bpm / 4;
  let t = 0.05;
  let step = 0;
  let loop = 0;
  while (t < seconds - 0.5) {
    const bar = Math.floor(step / 16) % def.bars;
    const s = step % 16;
    const swing = def.swing && s % 2 === 1 ? sixteenth * def.swing : 0;
    def.step(s, bar, t + swing, { out, intensity, dur: sixteenth, loop });
    t += sixteenth;
    step++;
    if (step % (def.bars * 16) === 0) loop++;
  }
  const buf = await ctx.startRendering();
  void stopBed;
  return buf;
}
