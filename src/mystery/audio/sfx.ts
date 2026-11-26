/**
 * Marion Mystery sound design: every interaction makes a sound. UI (buttons,
 * hovers, toggles, sliders, panels), footsteps per floor material, wall
 * bumps, flashlight clicks and low-battery buzz, task interactions, world
 * events (kills, shots, vents, doors, sabotage…) panned and attenuated by
 * where they happen, per-map ambience beds, stingers, and automatic music
 * selection by scene / mode / map / phase. Muted until the first gesture.
 */
import { roomAt, type FloorStyle } from '../core/map';
import type { MatchEvent, Vec2 } from '../core/types';
import { runtime } from '../client/runtime';
import { useMystery } from '../client/store';
import { engine, hz } from './engine';
import { music, stinger, TRACK_BY_ID } from './music';

export type Scene = 'menu' | 'lobby' | 'match' | 'night';
type CaptionFn = (text: string) => void;

const FLOOR_SOUND: Record<FloorStyle, { freq: number; q: number; dur: number; vol: number; type: BiquadFilterType; tone?: number }> = {
  tile: { freq: 2600, q: 1.2, dur: 0.06, vol: 0.16, type: 'bandpass', tone: 340 },
  checker: { freq: 2400, q: 1.2, dur: 0.06, vol: 0.16, type: 'bandpass', tone: 320 },
  wood: { freq: 900, q: 1.4, dur: 0.09, vol: 0.2, type: 'bandpass', tone: 170 },
  carpet: { freq: 700, q: 0.6, dur: 0.07, vol: 0.09, type: 'lowpass' },
  rug: { freq: 650, q: 0.6, dur: 0.07, vol: 0.09, type: 'lowpass' },
  metal: { freq: 3200, q: 3, dur: 0.12, vol: 0.14, type: 'bandpass', tone: 520 },
  grass: { freq: 4200, q: 0.5, dur: 0.11, vol: 0.12, type: 'highpass' },
  snow: { freq: 1800, q: 0.4, dur: 0.16, vol: 0.14, type: 'lowpass' },
  stone: { freq: 1600, q: 1.6, dur: 0.07, vol: 0.17, type: 'bandpass', tone: 230 },
};

class Sfx {
  private muted = false;
  private volume = 0.8;
  private musicVol = 0.5;
  private captions = new Set<CaptionFn>();
  private bound = false;
  private alarmTimer: ReturnType<typeof setInterval> | null = null;
  private ambStop: (() => void) | null = null;
  private ambKey = '';
  private ambTimer: ReturnType<typeof setInterval> | null = null;
  private lastStep = 0;
  private stepSide = 1;
  private heart = 0;
  private lastBump = 0;
  private lastBuzz = 0;
  private lastHover = 0;
  private menuTrack = 'title';

  configure(o: { muted: boolean; volume: number; music: number; menuTrack?: string }) {
    this.muted = o.muted;
    this.volume = o.volume;
    this.musicVol = o.music;
    if (o.menuTrack) this.menuTrack = o.menuTrack;
    this.apply();
  }

  private apply() {
    const b = engine.buses;
    const ctx = engine.ctx;
    if (!b || !ctx) return;
    const t = ctx.currentTime;
    b.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.05);
    b.sfx.gain.setTargetAtTime(this.volume, t, 0.05);
    b.ui.gain.setTargetAtTime(this.volume * 0.7, t, 0.05);
    b.amb.gain.setTargetAtTime(this.musicVol * 0.9, t, 0.2);
    b.music.gain.setTargetAtTime(this.musicVol * 0.75, t, 0.2);
  }

  unlock() {
    const fresh = !engine.ctx;
    if (!engine.unlock()) return;
    this.apply();
    if (fresh) {
      music.resume();
      this.ambKey = '';
      this.refreshScene();
    }
  }

  onCaption(fn: CaptionFn): () => void {
    this.captions.add(fn);
    return () => this.captions.delete(fn);
  }

  private caption(text: string) {
    for (const c of this.captions) c(text);
  }

  /** Pan/volume for a world position relative to the listener. */
  private spatial(pos?: Vec2): { pan: number; vol: number } {
    if (!pos) return { pan: 0, vol: 1 };
    const me = runtime.local.pos;
    const dx = pos.x - me.x;
    const dy = pos.y - me.y;
    const d = Math.hypot(dx, dy);
    return { pan: Math.max(-0.85, Math.min(0.85, dx / 9)), vol: Math.max(0.12, 1 - d / 18) };
  }

  // -------------------------------------------------------------------------
  play(name: string, pos?: Vec2) {
    const b = engine.buses;
    const ctx = engine.ctx;
    if (!b || !ctx) return;
    const t = ctx.currentTime + 0.005;
    const { pan, vol } = this.spatial(pos);
    const out = b.sfx;
    const ui = b.ui;
    switch (name) {
      // ---- UI ----
      case 'ui.click':
        engine.tone(ui, 1320, t, 0.045, 0.1, 'triangle', 1100);
        engine.noiseHit(ui, t, 0.02, 0.05, 5000, 'highpass');
        break;
      case 'ui.primary':
        engine.tone(ui, 880, t, 0.06, 0.1, 'triangle', 1320);
        engine.tone(ui, 1320, t + 0.05, 0.09, 0.08, 'sine');
        break;
      case 'ui.back':
        engine.tone(ui, 990, t, 0.07, 0.08, 'triangle', 660);
        break;
      case 'ui.hover':
        engine.tone(ui, 2200, t, 0.025, 0.025, 'sine');
        break;
      case 'ui.toggle':
        engine.noiseHit(ui, t, 0.025, 0.12, 3000, 'bandpass', 2);
        engine.tone(ui, 700, t, 0.05, 0.06, 'square', 900);
        break;
      case 'ui.slide':
        engine.tone(ui, 1600 + Math.random() * 300, t, 0.02, 0.025, 'sine');
        break;
      case 'ui.open':
        engine.noiseHit(ui, t, 0.18, 0.06, 800, 'bandpass', 0.8, 0.1, 3000);
        engine.tone(ui, 660, t, 0.12, 0.05, 'sine', 990, 0, 0.2);
        break;
      case 'ui.close':
        engine.noiseHit(ui, t, 0.14, 0.05, 3000, 'bandpass', 0.8, 0.1, 700);
        break;
      case 'ui.type':
        engine.noiseHit(ui, t, 0.02, 0.05, 4000 + Math.random() * 2000, 'bandpass', 3);
        break;
      case 'ui.error':
        engine.tone(ui, 220, t, 0.12, 0.1, 'square', 180);
        engine.tone(ui, 196, t + 0.1, 0.16, 0.1, 'square', 150);
        break;
      case 'ui.countdown':
        engine.bell(ui, 880, t, 0.3, { kind: 'marimba' });
        break;
      case 'ui.go':
        engine.bell(ui, 1320, t, 0.4, { kind: 'bell', rev: 0.4 });
        break;
      case 'ui.chat':
        engine.tone(ui, 1500, t, 0.05, 0.06, 'sine', 2000);
        engine.tone(ui, 2000, t + 0.05, 0.06, 0.05, 'sine');
        break;
      case 'ui.equip':
        engine.bell(ui, hz('E6'), t, 0.25, { kind: 'marimba' });
        engine.noiseHit(ui, t, 0.12, 0.05, 6000, 'highpass');
        break;
      // ---- movement ----
      case 'wall':
        engine.noiseHit(out, t, 0.09, 0.22, 260, 'lowpass', 0.8, 0.05);
        engine.tone(out, 95, t, 0.11, 0.25, 'sine', 60);
        this.caption('Bonk — wall');
        break;
      // ---- tasks ----
      case 'task.open':
        engine.tone(ui, 520, t, 0.08, 0.09, 'triangle', 780);
        engine.noiseHit(ui, t, 0.12, 0.05, 2000, 'bandpass', 1, 0, 6000);
        break;
      case 'task.tick':
        engine.tone(ui, 1100 + Math.random() * 500, t, 0.03, 0.05, 'triangle');
        engine.noiseHit(ui, t, 0.015, 0.04, 6000, 'highpass');
        break;
      case 'task.close':
        engine.tone(ui, 780, t, 0.08, 0.07, 'triangle', 520);
        break;
      case 'taskDone':
        [523, 659, 784, 1047].forEach((f, i) => engine.bell(out, f, t + i * 0.06, 0.28, { kind: 'marimba', rev: 0.25 }));
        engine.noiseHit(out, t + 0.2, 0.4, 0.05, 9000, 'highpass', 0.6, 0.3);
        this.caption('Task complete chime');
        break;
      // ---- world ----
      case 'kill':
        engine.noiseHit(out, t, 0.08, 0.5 * vol, 3000, 'highpass', 0.6, 0, 0, pan); // slash
        engine.noiseHit(out, t + 0.05, 0.35, 0.45 * vol, 700, 'lowpass', 0.8, 0.2, 180, pan); // squish
        engine.tone(out, 160, t + 0.04, 0.3, 0.25 * vol, 'sawtooth', 55, pan);
        engine.pluck(out, hz('C#6'), t + 0.02, 0.25 * vol, { len: 0.8, bright: 0.9, pan });
        this.caption('Squelch! Someone was eliminated');
        break;
      case 'shot':
        engine.noiseHit(out, t, 0.25, 0.7 * vol, 2500, 'highpass', 0.6, 0.35, 400, pan);
        engine.tone(out, 110, t, 0.3, 0.5 * vol, 'sine', 40, pan);
        engine.noiseHit(out, t + 0.12, 0.6, 0.08 * vol, 1200, 'bandpass', 0.8, 0.5, 300, pan);
        this.caption('Gunshot');
        break;
      case 'throw':
        engine.noiseHit(out, t, 0.35, 0.25 * vol, 1500, 'bandpass', 2, 0, 5000, pan);
        this.caption('Knife whoosh');
        break;
      case 'misfire':
        engine.tone(out, 300, t, 0.6, 0.2 * vol, 'sawtooth', 80, pan, 0.3);
        engine.noiseHit(out, t, 0.5, 0.2 * vol, 500, 'lowpass', 0.6, 0.3, 0, pan);
        this.caption('Misfire!');
        break;
      case 'vent':
        engine.noiseHit(out, t, 0.3, 0.3 * vol, 600, 'bandpass', 2, 0.2, 150, pan);
        engine.tone(out, 230, t, 0.18, 0.15 * vol, 'square', 140, pan);
        engine.tone(out, 1900, t + 0.02, 0.25, 0.05 * vol, 'triangle', 1700, pan, 0.3);
        this.caption('Vent clang');
        break;
      case 'door':
        engine.noiseHit(out, t, 0.25, 0.45 * vol, 220, 'lowpass', 1, 0.3, 0, pan);
        engine.tone(out, 70, t, 0.3, 0.35 * vol, 'sine', 45, pan);
        engine.noiseHit(out, t + 0.05, 0.4, 0.1 * vol, 3000, 'bandpass', 4, 0.2, 2000, pan);
        this.caption('Doors slam shut');
        break;
      case 'sabotage':
        engine.tone(out, 330, t, 0.9, 0.12, 'sawtooth', 110, 0, 0.3);
        engine.noiseHit(out, t, 0.9, 0.12, 4000, 'bandpass', 1, 0.3, 300);
        this.caption('Sabotage! Power fluctuates');
        break;
      case 'lightsDown':
        engine.tone(out, 520, t, 1.1, 0.12, 'sawtooth', 70, 0, 0.3);
        engine.noiseHit(out, t + 0.8, 0.15, 0.3, 300, 'lowpass');
        this.caption('Lights power down');
        break;
      case 'fixed':
        engine.tone(out, 110, t, 0.8, 0.12, 'sawtooth', 440, 0, 0.3);
        engine.bell(out, 880, t + 0.6, 0.3, { kind: 'glass', rev: 0.4 });
        this.caption('Power restored');
        break;
      case 'button':
        engine.noiseHit(out, t, 0.06, 0.4, 900, 'bandpass', 1.5);
        engine.tone(out, 180, t, 0.12, 0.3, 'square', 120);
        break;
      case 'shield':
        engine.bell(out, hz('A5'), t, 0.4 * vol, { kind: 'glass', pan, rev: 0.5 });
        engine.tone(out, 300, t, 0.5, 0.1 * vol, 'sine', 1200, pan, 0.4);
        this.caption('Shield shimmer');
        break;
      case 'pickup':
        engine.bell(out, hz('E6'), t, 0.3, { kind: 'marimba' });
        engine.bell(out, hz('B6'), t + 0.07, 0.3, { kind: 'marimba' });
        break;
      case 'hero':
        ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => engine.bell(out, hz(n), t + i * 0.07, 0.3, { kind: 'bell', rev: 0.4 }));
        this.caption('The gun was picked up — a Hero rises');
        break;
      case 'poison':
        for (let i = 0; i < 6; i++) engine.tone(out, 300 + Math.random() * 400, t + i * 0.06, 0.06, 0.06, 'sine', 900);
        this.caption('Bubbling vial');
        break;
      case 'track':
        engine.tone(out, 1200, t, 0.08, 0.1, 'sine');
        engine.tone(out, 1800, t + 0.12, 0.12, 0.08, 'sine', 0, 0, 0.3);
        this.caption('Tracker ping');
        break;
      case 'camera':
        engine.noiseHit(out, t, 0.05, 0.3, 5000, 'highpass');
        engine.tone(out, 1700, t + 0.05, 0.06, 0.06, 'square');
        break;
      case 'blackout':
        engine.tone(out, 400, t, 0.7, 0.18, 'sawtooth', 60, 0, 0.3);
        engine.noiseHit(out, t + 0.1, 0.4, 0.2, 2000, 'bandpass', 0.8, 0.3, 200);
        this.caption('Power cut — flashlights die');
        break;
      case 'flashlight.on':
        engine.noiseHit(out, t, 0.025, 0.4, 3500, 'bandpass', 2);
        engine.tone(out, 4000, t + 0.01, 0.15, 0.02, 'sine');
        break;
      case 'flashlight.off':
        engine.noiseHit(out, t, 0.025, 0.35, 2500, 'bandpass', 2);
        break;
      case 'buzz':
        engine.tone(out, 110, t, 0.35, 0.05, 'sawtooth', 100);
        engine.noiseHit(out, t, 0.3, 0.04, 4000, 'bandpass', 4);
        this.caption('Battery buzzing — recharge!');
        break;
      case 'heartbeat':
        engine.kick(out, t, 0.55, 0.5);
        engine.kick(out, t + 0.18, 0.4, 0.48);
        break;
      case 'creak':
        engine.tone(out, 140 + Math.random() * 80, t, 0.5, 0.04, 'sawtooth', 100, (Math.random() - 0.5) * 1.4, 0.4);
        this.caption('Floorboard creak');
        break;
      case 'vote':
        engine.noiseHit(out, t, 0.08, 0.6, 400, 'lowpass', 1);
        engine.tone(out, 140, t, 0.14, 0.4, 'sine', 70);
        engine.bell(out, hz('G6'), t + 0.02, 0.12, { kind: 'bell' });
        this.caption('Brass stamp — vote cast');
        break;
      case 'drumroll':
        for (let i = 0; i < 28; i++) engine.snare(out, t + i * 0.055, 0.15 + i * 0.012);
        engine.kick(out, t + 1.6, 0.9);
        engine.noiseHit(out, t + 1.6, 1.2, 0.15, 8000, 'highpass', 0.6, 0.4);
        this.caption('Drumroll');
        break;
      case 'emote':
        engine.pluck(out, hz('G5'), t, 0.25 * vol, { len: 0.5, pan });
        engine.pluck(out, hz('C6'), t + 0.08, 0.25 * vol, { len: 0.5, pan });
        break;
      case 'step':
        break;
    }
  }

  footstep(style: FloorStyle, vol = 1, pan = 0) {
    const b = engine.buses;
    const ctx = engine.ctx;
    if (!b || !ctx) return;
    const t = ctx.currentTime + 0.005;
    const f = FLOOR_SOUND[style] ?? FLOOR_SOUND.tile;
    const v = f.vol * vol * (0.8 + Math.random() * 0.4);
    this.stepSide = -this.stepSide;
    const p = Math.max(-1, Math.min(1, pan + this.stepSide * 0.08));
    engine.noiseHit(b.sfx, t, f.dur, v, f.freq * (0.9 + Math.random() * 0.2), f.type, f.q, 0.04, 0, p);
    if (f.tone) engine.tone(b.sfx, f.tone * (0.9 + Math.random() * 0.2), t, f.dur * 0.8, v * 0.6, 'sine', f.tone * 0.7, p);
    if (style === 'snow') engine.noiseHit(b.sfx, t + 0.03, 0.12, v * 0.5, 5000, 'highpass', 0.5, 0, 0, p);
  }

  // -------------------------------------------------------------------------
  private startAlarm() {
    if (this.alarmTimer) return;
    const b = engine.buses;
    if (!b) return;
    let hi = true;
    this.alarmTimer = setInterval(() => {
      const ctx = engine.ctx;
      if (!ctx || !engine.buses) return;
      engine.tone(engine.buses.sfx, hi ? 740 : 620, ctx.currentTime, 0.32, 0.07, 'square', 0, 0, 0.2);
      hi = !hi;
    }, 420);
    this.caption('Critical alarm');
  }

  private stopAlarm() {
    if (this.alarmTimer) clearInterval(this.alarmTimer);
    this.alarmTimer = null;
  }

  /** Per-map ambience bed + occasional one-shots. */
  private ambience(key: string) {
    if (key === this.ambKey) return;
    this.ambKey = key;
    this.ambStop?.();
    this.ambStop = null;
    if (this.ambTimer) clearInterval(this.ambTimer);
    this.ambTimer = null;
    const b = engine.buses;
    if (!b || !key) return;
    const [map, night] = key.split(':');
    const stops: (() => void)[] = [];
    const amb = b.amb;
    if (map === 'hq') stops.push(engine.noiseBed(amb, 0.03, 140, 'lowpass', 0.7, 0.03, 0.2));
    if (map === 'greenhouse') {
      stops.push(engine.noiseBed(amb, 0.025, 5000, 'highpass', 0.5, 0.05, 0.3));
      stops.push(engine.noiseBed(amb, 0.03, 90, 'lowpass', 0.7, 0.02, 0.1));
    }
    if (map === 'express') stops.push(engine.noiseBed(amb, 0.05, 110, 'lowpass', 0.8, 0.4, 0.3));
    if (map === 'manor') stops.push(engine.noiseBed(amb, 0.035, 500, 'bandpass', 0.8, 0.06, 0.7));
    if (map === 'lobby') stops.push(engine.noiseBed(amb, 0.015, 200, 'lowpass', 0.7, 0.03, 0.2));
    if (night === 'night') stops.push(engine.noiseBed(amb, 0.03, 320, 'bandpass', 0.6, 0.05, 0.6));
    this.ambStop = () => stops.forEach((s) => s());
    let n = 0;
    this.ambTimer = setInterval(() => {
      const ctx = engine.ctx;
      if (!ctx || !engine.buses) return;
      const t = ctx.currentTime;
      const a = engine.buses.amb;
      n++;
      if (map === 'express' && n % 2 === 0) {
        engine.noiseHit(a, t, 0.06, 0.14, 1200, 'bandpass', 2);
        engine.noiseHit(a, t + 0.18, 0.06, 0.12, 1100, 'bandpass', 2);
      }
      if (map === 'manor' && n % 4 === 0) engine.rim(a, t, 0.08); // grandfather clock
      if (map === 'greenhouse' && Math.random() < 0.25) engine.tone(a, 900 + Math.random() * 900, t, 0.08, 0.03, 'sine', 400); // drip
      if (map === 'hq' && Math.random() < 0.12) engine.bell(a, hz('A6'), t, 0.05, { kind: 'glass', rev: 0.5 }); // distant notification
      if (night === 'night' && Math.random() < 0.08) this.play('creak');
    }, 1000);
  }

  private pickTrack(): string {
    const s = useMystery.getState();
    const room = s.room;
    if (!room) return TRACK_BY_ID[this.menuTrack] ? this.menuTrack : 'title';
    if (room.stage === 'lobby' || room.stage === 'countdown') return room.practice ? 'freeplay' : 'lobby';
    const snap = s.snap;
    if (!snap) return 'lobby';
    if (room.practice) return 'freeplay';
    if (snap.phase === 'meeting' || snap.phase === 'eject') return 'meeting';
    if (snap.phase === 'ended') return 'results';
    if (snap.mode === 'lightsout') return 'lightsout';
    if (snap.mode === 'hideseek') return snap.hns?.final ? 'hideseek-final' : 'hideseek';
    return `match-${snap.map}`;
  }

  private refreshScene() {
    if (!engine.ctx) return;
    music.play(this.pickTrack());
    const s = useMystery.getState();
    const room = s.room;
    const inMatch = room?.stage === 'match' && s.snap;
    const lobby = room && (room.stage === 'lobby' || room.stage === 'countdown');
    this.ambience(inMatch ? `${s.snap!.map}:${s.snap!.mode === 'lightsout' ? 'night' : 'day'}` : lobby ? 'lobby:day' : '');
  }

  /** Kept for API compatibility (scenes are derived from state now). */
  setScene(_scene: Scene) {
    this.refreshScene();
  }

  // -------------------------------------------------------------------------
  bind(): () => void {
    if (this.bound) return () => {};
    this.bound = true;
    const offEv = runtime.on((ev: MatchEvent, snap) => {
      const me = snap.you.id;
      const p = ev.pos;
      switch (ev.type) {
        case 'kill':
          this.play('kill', p);
          if (ev.target === me) setTimeout(() => stinger('ghost'), 900);
          break;
        case 'shot':
          this.play(ev.data?.weapon === 'throw' ? 'throw' : 'shot', p);
          break;
        case 'misfire':
          this.play('misfire', p);
          break;
        case 'vent':
          this.play('vent', p);
          break;
        case 'sabotage':
          if (ev.data?.kind === 'doors') this.play('door');
          else if (ev.data?.kind === 'lights') this.play('lightsDown');
          else this.play('sabotage');
          break;
        case 'fixed':
          this.play('fixed');
          break;
        case 'task':
        case 'visual':
          if (ev.actor === me) this.play('taskDone');
          break;
        case 'shield.hit':
          this.play('shield', p);
          break;
        case 'gun.pickup':
          this.play('hero', p);
          break;
        case 'poison':
          this.play('poison', p);
          break;
        case 'track':
          this.play('track');
          break;
        case 'blackout':
          this.play('blackout', p);
          break;
        case 'final':
          stinger('final');
          break;
      }
    });
    let prev = useMystery.getState();
    const unsub = useMystery.subscribe((s) => {
      const a = prev.snap;
      const b = s.snap;
      if (prev.screen !== s.screen || prev.room?.stage !== s.room?.stage || a?.phase !== b?.phase || a?.mode !== b?.mode || !!a?.hns?.final !== !!b?.hns?.final || prev.room?.practice !== s.room?.practice) this.refreshScene();
      if (b && a) {
        if (a.phase !== b.phase) {
          if (b.phase === 'intro') stinger(b.you.team === 'murderers' ? 'reveal-murderer' : b.you.team === 'neutral' ? 'reveal-neutral' : 'reveal-crew');
          if (b.phase === 'meeting') stinger(b.meeting?.victimId ? 'report' : 'emergency');
          if (b.phase === 'eject') stinger('eject');
          if (b.phase === 'ended' && b.result) stinger(b.result.winners.includes(s.pid) ? 'victory' : 'defeat');
        }
        if (a.meeting && b.meeting && a.meeting.voted.length < b.meeting.voted.length) this.play('vote');
        if (a.meeting?.stage === 'vote' && b.meeting?.stage === 'reveal') this.play('drumroll');
        const crit = b.sabotage.active === 'meltdown' || b.sabotage.active === 'pressure';
        if (crit && b.phase === 'play') this.startAlarm();
        else this.stopAlarm();
        if (a.you.flashlightOn !== b.you.flashlightOn) this.play(b.you.flashlightOn ? 'flashlight.on' : 'flashlight.off');
        if (b.you.battery > a.you.battery + 0.3) this.play('pickup');
        if (b.you.inVent !== a.you.inVent && b.you.inVent && a.you.inVent) this.play('vent');
        if (!a.you.portableCam && b.you.portableCam) this.play('camera');
        if (b.phase === 'meeting' && b.chat.length) this.play('ui.chat');
        if (a.you.activeTask !== b.you.activeTask && b.you.activeTask) this.play('task.open');
        music.intensity = Math.max(b.you.dread, crit ? 0.6 : 0, b.hns?.final ? 1 : 0, b.sabotage.active === 'lights' ? 0.4 : 0);
      } else if (!b) {
        this.stopAlarm();
        music.intensity = 0;
      }
      // Lobby countdown ticks.
      if (s.room?.stage === 'countdown' && prev.room?.stage !== 'countdown') {
        const ends = s.room.countdownEnds! - s.room.now;
        for (let i = Math.ceil(ends) - 1; i >= 0; i--) setTimeout(() => this.play(i === 0 ? 'ui.go' : 'ui.countdown'), (ends - i) * 1000);
      }
      if (s.toasts.length > prev.toasts.length && s.toasts[s.toasts.length - 1]?.tone === 'bad') this.play('ui.error');
      if (prev.showMap !== s.showMap || prev.showStats !== s.showStats) this.play(s.showMap || s.showStats ? 'ui.open' : 'ui.close');
      if (prev.taskStation && !s.taskStation) this.play('task.close');
      prev = s;
    });
    // Global UI sounds: every button, toggle, slider and text field.
    const onDown = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], select, label');
      if (!el || !(el as HTMLElement).closest('.mm-root')) return;
      if ((el as HTMLButtonElement).disabled) return;
      const cls = (el as HTMLElement).className || '';
      const aria = (el as HTMLElement).getAttribute('aria-label') ?? '';
      this.play(/primary|gold/.test(cls) ? 'ui.primary' : /back|close|leave/i.test(aria) ? 'ui.back' : 'ui.click');
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as HTMLElement | null)?.closest?.('.mm-btn, .mm-action');
      if (!el) return;
      const now = performance.now();
      if (now - this.lastHover < 60) return;
      this.lastHover = now;
      this.play('ui.hover');
    };
    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (!el.closest?.('.mm-root')) return;
      if (el.type === 'checkbox') this.play('ui.toggle');
      else if (el.type === 'range') this.play('ui.slide');
      else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') this.play('ui.type');
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('input', onInput, true);
    // Footsteps, wall bumps, heartbeat, low-battery buzz, others' footsteps.
    const others = new Map<string, number>();
    const iv = setInterval(() => {
      const st = useMystery.getState();
      if (!engine.ctx || !st.room) return;
      const now = performance.now();
      const map = runtime.map();
      const floorAt = (p: Vec2): FloorStyle => {
        const r = roomAt(map, p);
        return (r ? map.roomById.get(r)?.floor : undefined) ?? 'tile';
      };
      const ghost = st.snap ? !st.snap.you.alive : false;
      if (runtime.local.moving && !ghost && now - this.lastStep > 300) {
        this.lastStep = now;
        this.footstep(floorAt(runtime.local.pos));
      }
      if (runtime.bumpAt > this.lastBump && now - runtime.bumpAt < 120 && now - this.lastBump > 450) {
        this.lastBump = now;
        this.play('wall');
      }
      const snap = st.snap;
      if (snap && snap.phase === 'play') {
        const d = snap.you.dread;
        if (d > 0.2 && now - this.heart > 1150 - d * 650) {
          this.heart = now;
          this.play('heartbeat');
        }
        if (snap.mode === 'lightsout' && snap.you.flashlightOn && snap.you.battery > 0 && snap.you.battery < 0.15 && now - this.lastBuzz > 3500) {
          this.lastBuzz = now;
          this.play('buzz');
        }
        let n = 0;
        for (const p of snap.players) {
          if (p.id === snap.you.id || !p.pos || !p.moving || p.ghost || n >= 3) continue;
          const r = runtime.remote(p.id);
          if (!r) continue;
          const dist = Math.hypot(r.pos.x - runtime.local.pos.x, r.pos.y - runtime.local.pos.y);
          if (dist > 9) continue;
          n++;
          if (now - (others.get(p.id) ?? 0) > 340) {
            others.set(p.id, now);
            const sp = this.spatial(r.pos);
            this.footstep(floorAt(r.pos), sp.vol * 0.45, sp.pan);
          }
        }
      }
    }, 50);
    return () => {
      this.bound = false;
      offEv();
      unsub();
      clearInterval(iv);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('input', onInput, true);
      this.stopAlarm();
    };
  }
}

export const sfx = new Sfx();
