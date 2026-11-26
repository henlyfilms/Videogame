/**
 * Marion Mystery procedural audio (Web Audio, no assets). The AudioContext is
 * created on the first user gesture (iOS rule). Every effect has a caption
 * for the accessibility captions overlay.
 */
import type { MatchEvent } from '../core/types';
import { runtime } from '../client/runtime';
import { useMystery } from '../client/store';

export type Scene = 'menu' | 'lobby' | 'match' | 'night';

type CaptionFn = (text: string) => void;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambience: { stop(): void } | null = null;
  private scene: Scene = 'menu';
  private muted = false;
  private volume = 0.8;
  private music = 0.5;
  private captions = new Set<CaptionFn>();
  private lastStep = 0;
  private alarm: { stop(): void } | null = null;
  private heart = 0;
  private bound = false;

  configure(o: { muted: boolean; volume: number; music: number }) {
    this.muted = o.muted;
    this.volume = o.volume;
    this.music = o.music;
    this.apply();
  }

  private apply() {
    if (!this.ctx || !this.master || !this.fxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    this.fxBus.gain.setTargetAtTime(this.volume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.music * 0.6, t, 0.2);
  }

  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.fxBus = this.ctx.createGain();
    this.fxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.apply();
    this.setScene(this.scene, true);
  }

  onCaption(fn: CaptionFn): () => void {
    this.captions.add(fn);
    return () => this.captions.delete(fn);
  }

  private caption(text: string) {
    for (const c of this.captions) c(text);
  }

  // --- primitives -----------------------------------------------------------
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0, slide = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.fxBus) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.fxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol = 0.2, freq = 1200, q = 1, delay = 0, type: BiquadFilterType = 'bandpass', sweepTo = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.fxBus) return;
    const t = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.fxBus);
    src.start(t);
  }

  // --- effects --------------------------------------------------------------
  play(name: string) {
    switch (name) {
      case 'click':
        this.tone(880, 0.06, 'triangle', 0.12);
        break;
      case 'task':
        this.tone(660, 0.08, 'triangle', 0.18);
        this.tone(990, 0.12, 'triangle', 0.15, 0.07);
        break;
      case 'taskDone':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, i * 0.07));
        this.caption('Task complete chime');
        break;
      case 'kill':
        this.noise(0.25, 0.5, 900, 0.8, 0, 'bandpass', 200);
        this.tone(140, 0.5, 'sawtooth', 0.25, 0, 0.4);
        this.tone(1760, 0.6, 'square', 0.06, 0.02, 0.5);
        this.caption('Squelch! Someone was eliminated');
        break;
      case 'shot':
        this.noise(0.18, 0.6, 2500, 0.6, 0, 'highpass');
        this.tone(90, 0.25, 'sine', 0.4, 0, 0.5);
        this.caption('Gunshot');
        break;
      case 'meeting':
        for (let i = 0; i < 3; i++) {
          this.tone(880, 0.22, 'square', 0.14, i * 0.42);
          this.tone(660, 0.22, 'square', 0.14, i * 0.42 + 0.21);
        }
        this.caption('Meeting alarm');
        break;
      case 'report':
        this.tone(330, 0.5, 'sawtooth', 0.18, 0, 0.6);
        this.tone(220, 0.7, 'sawtooth', 0.15, 0.15, 0.5);
        this.caption('Body reported!');
        break;
      case 'vote':
        this.noise(0.08, 0.5, 300, 1.2, 0, 'lowpass');
        this.tone(120, 0.12, 'sine', 0.3);
        this.caption('Vote stamped');
        break;
      case 'drumroll':
        for (let i = 0; i < 24; i++) this.noise(0.05, 0.18 + i * 0.006, 400, 1, i * 0.06, 'lowpass');
        this.tone(98, 0.6, 'sine', 0.3, 1.45);
        this.caption('Drumroll');
        break;
      case 'eject':
        this.noise(1.6, 0.35, 400, 0.7, 0, 'bandpass', 3000);
        this.caption('Whoosh — ejected');
        break;
      case 'vent':
        this.noise(0.3, 0.3, 600, 2, 0, 'bandpass', 150);
        this.tone(200, 0.12, 'square', 0.08);
        this.caption('Vent clang');
        break;
      case 'sabotage':
        this.tone(220, 0.6, 'sawtooth', 0.15, 0, 1.5);
        this.caption('Sabotage!');
        break;
      case 'fixed':
        this.tone(523, 0.12, 'triangle', 0.16);
        this.tone(784, 0.25, 'triangle', 0.16, 0.1);
        this.caption('Fixed');
        break;
      case 'flashlight':
        this.noise(0.03, 0.4, 3000, 2, 0, 'highpass');
        break;
      case 'step':
        this.noise(0.05, 0.05, 500 + Math.random() * 300, 1.5, 0, 'lowpass');
        break;
      case 'reveal':
        [196, 247, 294, 392].forEach((f, i) => this.tone(f, 0.9, 'sine', 0.12, i * 0.12));
        this.tone(98, 1.6, 'triangle', 0.15);
        break;
      case 'victory':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.18, i * 0.12));
        this.caption('Victory fanfare');
        break;
      case 'defeat':
        [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.45, 'sine', 0.16, i * 0.18));
        this.caption('Defeat');
        break;
      case 'heartbeat':
        this.tone(60, 0.12, 'sine', 0.5);
        this.tone(55, 0.14, 'sine', 0.45, 0.18);
        break;
      case 'creak':
        this.tone(140 + Math.random() * 80, 0.5, 'sawtooth', 0.04, 0, 0.7);
        this.caption('Floorboard creak');
        break;
      case 'pickup':
        this.tone(988, 0.08, 'square', 0.12);
        this.tone(1319, 0.14, 'square', 0.12, 0.08);
        break;
      case 'blackout':
        this.tone(400, 0.6, 'sawtooth', 0.15, 0, 0.2);
        this.caption('Power cut');
        break;
    }
  }

  private startAlarm() {
    if (this.alarm || !this.ctx || !this.fxBus) return;
    let on = true;
    const iv = setInterval(() => on && this.tone(740, 0.25, 'square', 0.06), 700);
    this.alarm = {
      stop: () => {
        on = false;
        clearInterval(iv);
      },
    };
    this.caption('Critical alarm');
  }

  private stopAlarm() {
    this.alarm?.stop();
    this.alarm = null;
  }

  // --- ambience ---------------------------------------------------------------
  setScene(scene: Scene, force = false) {
    if (scene === this.scene && !force) return;
    this.scene = scene;
    this.ambience?.stop();
    this.ambience = null;
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 1);
    out.connect(this.musicBus);
    const nodes: AudioScheduledSourceNode[] = [];
    const pad = (freqs: number[], type: OscillatorType, vol: number, lfo = 0.08) => {
      for (const f of freqs) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = vol;
        const l = ctx.createOscillator();
        l.frequency.value = lfo + Math.random() * 0.05;
        const lg = ctx.createGain();
        lg.gain.value = vol * 0.6;
        l.connect(lg).connect(g.gain);
        o.connect(g).connect(out);
        o.start();
        l.start();
        nodes.push(o, l);
      }
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    if (scene === 'menu') {
      pad([130.8, 196, 261.6, 329.6], 'sine', 0.025);
      // Gentle arpeggio (Marion lo-fi, Fmaj7 → Em7).
      const notes = [349, 440, 523, 659, 330, 392, 494, 587];
      let i = 0;
      timer = setInterval(() => {
        if (this.scene !== 'menu' || this.music <= 0) return;
        this.musicNote(notes[i++ % notes.length]!, 0.035);
      }, 420);
    } else if (scene === 'lobby') {
      pad([174.6, 220, 261.6, 329.6], 'triangle', 0.018, 0.12);
      const chords = [
        [349, 440, 523, 659],
        [330, 392, 494, 587],
        [294, 349, 440, 523],
        [262, 330, 392, 494],
      ];
      let c = 0;
      timer = setInterval(() => {
        if (this.scene !== 'lobby' || this.music <= 0) return;
        const ch = chords[c++ % chords.length]!;
        ch.forEach((f, k) => this.musicNote(f, 0.02, k * 0.08));
      }, 1660);
    } else if (scene === 'match') {
      pad([55, 82.4, 110], 'sine', 0.03, 0.05);
    } else if (scene === 'night') {
      pad([41.2, 61.7, 87.3], 'sawtooth', 0.008, 0.03);
      pad([46.2], 'sine', 0.04, 0.02);
      timer = setInterval(() => {
        if (this.scene === 'night' && Math.random() < 0.18) this.play('creak');
      }, 2500);
    }
    this.ambience = {
      stop: () => {
        if (timer) clearInterval(timer);
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        setTimeout(() => {
          for (const n of nodes) {
            try {
              n.stop();
            } catch {
              /* already stopped */
            }
          }
          out.disconnect();
        }, 1500);
      },
    };
  }

  private musicNote(f: number, vol: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 1.3);
  }

  /** Subscribe to game events + state transitions. */
  bind(): () => void {
    if (this.bound) return () => {};
    this.bound = true;
    const offEv = runtime.on((ev: MatchEvent) => {
      const map: Partial<Record<MatchEvent['type'], string>> = {
        kill: 'kill',
        shot: 'shot',
        vent: 'vent',
        sabotage: 'sabotage',
        fixed: 'fixed',
        'gun.pickup': 'pickup',
        blackout: 'blackout',
        task: 'taskDone',
        visual: 'taskDone',
      };
      const n = map[ev.type];
      if (n) this.play(n);
    });
    let prev = useMystery.getState();
    const unsub = useMystery.subscribe((s) => {
      const a = prev.snap;
      const b = s.snap;
      if (b && a) {
        if (a.phase !== b.phase) {
          if (b.phase === 'intro') this.play('reveal');
          if (b.phase === 'meeting') this.play(b.meeting?.victimId ? 'report' : 'meeting');
          if (b.phase === 'eject') this.play('eject');
          if (b.phase === 'ended' && b.result) this.play(b.result.winners.includes(s.pid) ? 'victory' : 'defeat');
        }
        if (a.meeting && b.meeting && a.meeting.voted.length < b.meeting.voted.length) this.play('vote');
        if (a.meeting?.stage === 'vote' && b.meeting?.stage === 'reveal') this.play('drumroll');
        const crit = b.sabotage.active === 'meltdown' || b.sabotage.active === 'pressure';
        if (crit && b.phase === 'play') this.startAlarm();
        else this.stopAlarm();
        if (a.you.flashlightOn !== b.you.flashlightOn) this.play('flashlight');
      } else if (!b) this.stopAlarm();
      prev = s;
    });
    // Footsteps + dread heartbeat.
    const iv = setInterval(() => {
      const now = performance.now();
      if (runtime.local.moving && now - this.lastStep > 330) {
        this.lastStep = now;
        this.play('step');
      }
      const d = useMystery.getState().snap?.you.dread ?? 0;
      if (d > 0.2 && now - this.heart > 1100 - d * 600) {
        this.heart = now;
        this.play('heartbeat');
      }
    }, 60);
    return () => {
      this.bound = false;
      offEv();
      unsub();
      clearInterval(iv);
      this.stopAlarm();
    };
  }
}

export const sfx = new Sfx();
