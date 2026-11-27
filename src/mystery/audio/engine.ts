/**
 * Audio engine: one AudioContext, a mixing graph (music / sfx / ui / ambience
 * buses → master compressor + limiter), a procedurally generated stereo
 * convolution reverb, a tempo-synced delay, and the synthesized instruments
 * used by the soundtrack and effects. No audio files: everything is
 * synthesized, including Karplus–Strong plucked strings rendered into cached
 * buffers.
 */

export interface Buses {
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
  ui: GainNode;
  amb: GainNode;
  reverb: GainNode; // send
  delay: GainNode; // send
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  buses: Buses | null = null;
  private ksCache = new Map<string, AudioBuffer>();
  private noiseBuf: AudioBuffer | null = null;
  private crackleBuf: AudioBuffer | null = null;

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  unlock(): boolean {
    if (this.ctx) {
      void this.ctx.resume();
      return true;
    }
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return false;
    let ctx: AudioContext;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return false;
    }
    this.attach(ctx);
    return true;
  }

  /**
   * Build the mixing graph on a context. Also used with an OfflineAudioContext
   * to render tracks for level checks / exports.
   */
  attach(ctx: AudioContext | OfflineAudioContext): void {
    this.ctx = ctx as AudioContext;
    this.ksCache.clear();
    this.noiseBuf = null;
    this.crackleBuf = null;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    const master = ctx.createGain();
    master.connect(comp).connect(limiter).connect(ctx.destination);
    const mk = () => {
      const g = ctx.createGain();
      g.connect(master);
      return g;
    };
    // Music bus gets a 35 Hz high-pass so sub rumble never eats headroom.
    const music = ctx.createGain();
    const musicHp = ctx.createBiquadFilter();
    musicHp.type = 'highpass';
    musicHp.frequency.value = 35;
    musicHp.Q.value = 0.6;
    music.connect(musicHp).connect(master);
    const sfx = mk();
    const ui = mk();
    const amb = mk();
    // Reverb send: generated stereo impulse (2.8 s, darkening tail).
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(2.8, 2.6);
    const reverb = ctx.createGain();
    const revOut = ctx.createGain();
    revOut.gain.value = 0.9;
    const revLp = ctx.createBiquadFilter();
    revLp.type = 'lowpass';
    revLp.frequency.value = 6500;
    reverb.connect(revLp).connect(conv).connect(revOut).connect(master);
    // Ping-pong-ish delay send.
    const delay = ctx.createGain();
    const dl = ctx.createDelay(1.5);
    const dr = ctx.createDelay(1.5);
    dl.delayTime.value = 0.375;
    dr.delayTime.value = 0.5;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3200;
    const merger = ctx.createChannelMerger(2);
    delay.connect(dl);
    dl.connect(dlp).connect(dr).connect(fb).connect(dl);
    dl.connect(merger, 0, 0);
    dr.connect(merger, 0, 1);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.5;
    merger.connect(dOut).connect(master);
    dOut.connect(reverb);
    this.buses = { master, music, sfx, ui, amb, reverb, delay };
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Early reflections + diffuse tail, slowly low-passed.
        const n = Math.random() * 2 - 1;
        lp += (n - lp) * (0.9 - t * 0.75);
        const er = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.8 : 0;
        d[i] = (lp * Math.pow(1 - t, decay) + er) * 0.6;
      }
    }
    return buf;
  }

  noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    return b;
  }

  crackle(): AudioBuffer {
    if (this.crackleBuf) return this.crackleBuf;
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() < 0.0006 ? (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6) : (Math.random() * 2 - 1) * 0.012;
    this.crackleBuf = b;
    return b;
  }

  /** Karplus–Strong plucked string rendered offline and cached. */
  ks(freq: number, seconds: number, bright = 0.5, damp = 0.996): AudioBuffer {
    const ctx = this.ctx!;
    const key = `${Math.round(freq * 10)}:${seconds}:${bright}:${damp}`;
    const hit = this.ksCache.get(key);
    if (hit) return hit;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(period);
    let prev = 0;
    for (let i = 0; i < period; i++) {
      const n = Math.random() * 2 - 1;
      prev = prev + (n - prev) * (0.2 + bright * 0.8);
      ring[i] = prev;
    }
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const a = ring[idx]!;
      const b = ring[(idx + 1) % period]!;
      const v = (a + b) * 0.5 * damp;
      ring[idx] = v;
      d[i] = a;
      idx = (idx + 1) % period;
    }
    // Gentle fade-out to avoid clicks.
    const f = Math.min(len, Math.floor(sr * 0.05));
    for (let i = 0; i < f; i++) d[len - 1 - i]! *= i / f;
    if (this.ksCache.size > 400) this.ksCache.clear();
    this.ksCache.set(key, buf);
    return buf;
  }

  // -------------------------------------------------------------------------
  // Instruments. `out` is the dry destination; `send` adds reverb/delay.

  private env(g: GainNode, t: number, a: number, peak: number, d: number, s: number, r: number, dur: number) {
    const p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
    p.setTargetAtTime(0.0001, t + Math.max(a, dur), Math.max(0.01, r / 4));
  }

  private sends(node: AudioNode, rev = 0.25, del = 0) {
    const b = this.buses!;
    if (rev > 0) {
      const g = this.ctx!.createGain();
      g.gain.value = rev;
      node.connect(g).connect(b.reverb);
    }
    if (del > 0) {
      const g = this.ctx!.createGain();
      g.gain.value = del;
      node.connect(g).connect(b.delay);
    }
  }

  private panner(out: AudioNode, pan: number): AudioNode {
    if (!pan) return out;
    const p = this.ctx!.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(out);
    return p;
  }

  /** FM electric piano (Rhodes-like). */
  epiano(out: AudioNode, f: number, t: number, dur: number, vel = 0.5, opts: { rev?: number; del?: number; pan?: number; bright?: number } = {}) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modG = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * 1.0;
    const idx = f * (1.4 + (opts.bright ?? 0.5) * 2.2) * vel;
    modG.gain.setValueAtTime(idx, t);
    modG.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.08), t + 1.2);
    mod.connect(modG).connect(car.frequency);
    const tine = ctx.createOscillator();
    tine.frequency.value = f * 4.01;
    const tineG = ctx.createGain();
    tineG.gain.setValueAtTime(0.08 * vel, t);
    tineG.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0.32 * vel, 0.9, 0.35, 0.6, dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800 + vel * 2500;
    const dest = this.panner(out, opts.pan ?? 0);
    car.connect(g);
    tine.connect(tineG).connect(g);
    g.connect(lp).connect(dest);
    this.sends(lp, opts.rev ?? 0.25, opts.del ?? 0);
    const end = t + dur + 1.5;
    for (const o of [car, mod, tine]) {
      o.start(t);
      o.stop(end);
    }
  }

  /** Warm detuned pad (saws → lowpass), slow attack. */
  pad(out: AudioNode, freqs: number[], t: number, dur: number, vel = 0.3, opts: { cutoff?: number; rev?: number; attack?: number; type?: OscillatorType } = {}) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime((opts.cutoff ?? 1400) * 0.6, t);
    lp.frequency.linearRampToValueAtTime(opts.cutoff ?? 1400, t + (opts.attack ?? 1.2));
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    this.env(g, t, opts.attack ?? 1.2, vel / Math.max(1, freqs.length * 0.7), 1, 0.9, 1.6, dur);
    g.connect(lp).connect(out);
    this.sends(lp, opts.rev ?? 0.45);
    const end = t + dur + 2.5;
    for (const f of freqs) {
      for (const det of [-7, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = opts.type ?? 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det + (Math.random() - 0.5) * 3;
        const og = ctx.createGain();
        og.gain.value = 0.22;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(end);
      }
    }
  }

  /** Plucked string / harp / pizzicato / harpsichord via Karplus–Strong. */
  pluck(out: AudioNode, f: number, t: number, vel = 0.5, opts: { len?: number; bright?: number; damp?: number; rev?: number; del?: number; pan?: number; cutoff?: number } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.ks(f, opts.len ?? 1.6, opts.bright ?? 0.5, opts.damp ?? 0.996);
    const g = ctx.createGain();
    g.gain.value = 0.5 * vel;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = opts.cutoff ?? 6000;
    src.connect(g).connect(lp).connect(this.panner(out, opts.pan ?? 0));
    this.sends(lp, opts.rev ?? 0.2, opts.del ?? 0);
    src.start(t);
  }

  /** Inharmonic bell / glass / music box / marimba. */
  bell(out: AudioNode, f: number, t: number, vel = 0.4, opts: { kind?: 'bell' | 'glass' | 'marimba' | 'musicbox'; rev?: number; del?: number; pan?: number } = {}) {
    const ctx = this.ctx!;
    const kind = opts.kind ?? 'bell';
    const partials: [number, number, number][] =
      kind === 'marimba'
        ? [
            [1, 1, 0.5],
            [3.99, 0.25, 0.12],
            [10.7, 0.06, 0.05],
          ]
        : kind === 'glass'
          ? [
              [1, 1, 2.2],
              [2.32, 0.4, 1.4],
              [4.25, 0.22, 0.8],
              [6.63, 0.1, 0.5],
            ]
          : kind === 'musicbox'
            ? [
                [1, 1, 1.2],
                [3.0, 0.3, 0.4],
                [6.1, 0.12, 0.2],
              ]
            : [
                [1, 1, 2.6],
                [2.76, 0.45, 1.6],
                [5.4, 0.25, 0.9],
                [8.93, 0.12, 0.5],
              ];
    const dest = this.panner(out, opts.pan ?? 0);
    const sum = ctx.createGain();
    sum.connect(dest);
    this.sends(sum, opts.rev ?? 0.35, opts.del ?? 0);
    const nyquist = ctx.sampleRate / 2;
    for (const [ratio, amp, decay] of partials) {
      // Partials above Nyquist would alias (and warn); high notes just lose them.
      if (f * ratio >= nyquist * 0.9) continue;
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22 * vel * amp, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(sum);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  /** Round bass: triangle + sine sub with a short pluck. */
  bass(out: AudioNode, f: number, t: number, dur: number, vel = 0.5, opts: { cutoff?: number; type?: OscillatorType } = {}) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    this.env(g, t, 0.006, 0.5 * vel, 0.25, 0.55, 0.12, dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime((opts.cutoff ?? 900) * 1.6, t);
    lp.frequency.exponentialRampToValueAtTime(opts.cutoff ?? 900, t + 0.15);
    g.connect(lp).connect(out);
    for (const [type, mult, amp] of [
      [opts.type ?? 'triangle', 1, 0.7],
      ['sine', 1, 0.55],
      ['sine', 2, 0.12],
    ] as [OscillatorType, number, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.4);
    }
  }

  /** Pipe organ: additive drawbars with a soft chiff. */
  organ(out: AudioNode, f: number, t: number, dur: number, vel = 0.3) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    this.env(g, t, 0.06, 0.18 * vel, 0.3, 0.9, 0.5, dur);
    g.connect(out);
    this.sends(g, 0.6);
    for (const [r, a] of [
      [0.5, 0.6],
      [1, 1],
      [2, 0.55],
      [3, 0.25],
      [4, 0.2],
    ] as [number, number][]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * r;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.8);
    }
  }

  /** Reedy squeezebox lead (accordion-ish) with vibrato. */
  reed(out: AudioNode, f: number, t: number, dur: number, vel = 0.3) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    this.env(g, t, 0.04, 0.16 * vel, 0.2, 0.85, 0.15, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 3;
    bp.Q.value = 0.8;
    g.connect(bp).connect(out);
    this.sends(bp, 0.25);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 6;
    lfo.connect(lfoG);
    for (const [type, det] of [
      ['sawtooth', -6],
      ['square', 5],
    ] as [OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      lfoG.connect(o.detune);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.4);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.4);
  }

  // --- drums -----------------------------------------------------------------
  kick(out: AudioNode, t: number, vel = 0.8, pitch = 1) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(42 * pitch, t + 0.13);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.45);
    this.noiseHit(out, t, 0.012, 0.25 * vel, 3500, 'bandpass', 1);
  }

  snare(out: AudioNode, t: number, vel = 0.6) {
    this.noiseHit(out, t, 0.2, 0.45 * vel, 1800, 'highpass', 0.7, 0.18);
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    g.gain.setValueAtTime(0.35 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.15);
  }

  hat(out: AudioNode, t: number, vel = 0.3, open = false) {
    this.noiseHit(out, t, open ? 0.28 : 0.05, 0.22 * vel, 8000, 'highpass', 0.8);
  }

  rim(out: AudioNode, t: number, vel = 0.4) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 1750;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18 * vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1700;
    o.connect(g).connect(bp).connect(out);
    o.start(t);
    o.stop(t + 0.05);
  }

  shaker(out: AudioNode, t: number, vel = 0.25) {
    this.noiseHit(out, t, 0.07, 0.18 * vel, 6000, 'bandpass', 1.2);
  }

  clap(out: AudioNode, t: number, vel = 0.5) {
    for (let i = 0; i < 3; i++) this.noiseHit(out, t + i * 0.011, 0.06, 0.25 * vel, 1400, 'bandpass', 1.4);
    this.noiseHit(out, t + 0.03, 0.18, 0.18 * vel, 1300, 'bandpass', 1, 0.3);
  }

  /** Generic filtered noise burst. */
  noiseHit(out: AudioNode, t: number, dur: number, vol: number, freq: number, type: BiquadFilterType = 'bandpass', q = 1, rev = 0, sweepTo = 0, pan = 0) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.panner(out, pan));
    if (rev) this.sends(g, rev);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** Simple tone with pitch slide (UI blips, alarms, stingers). */
  tone(out: AudioNode, f: number, t: number, dur: number, vol = 0.2, type: OscillatorType = 'sine', slideTo = 0, pan = 0, rev = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.panner(out, pan));
    if (rev) this.sends(g, rev);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Looping filtered-noise bed (wind, hum, rain). Returns a stopper. */
  noiseBed(out: AudioNode, vol: number, freq: number, type: BiquadFilterType, q = 0.7, lfoRate = 0.08, lfoDepth = 0.4): () => void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(vol, ctx.currentTime, 1.2);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoRate;
    const lg = ctx.createGain();
    lg.gain.value = freq * lfoDepth;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
    return () => {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      setTimeout(() => {
        try {
          src.stop();
          lfo.stop();
        } catch {
          /* already stopped */
        }
        g.disconnect();
      }, 2000);
    };
  }

  crackleBed(out: AudioNode, vol = 0.5): () => void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.crackle();
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(hp).connect(g).connect(out);
    src.start();
    return () => {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
      g.disconnect();
    };
  }
}

/** Note name → frequency, e.g. 'A4', 'C#3', 'Bb2'. */
export function hz(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) return 440;
  const base: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  let n = base[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  n += (Number(m[3]) - 4) * 12;
  return 440 * Math.pow(2, n / 12);
}

export const engine = new AudioEngine();
