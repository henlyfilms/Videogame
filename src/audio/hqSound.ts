/**
 * Marion HQ soundscape on the Marion Mystery audio engine: a music track per
 * season by day plus a night lo-fi, seasonal ambience (spring birds, summer
 * cicadas and crickets, autumn wind and rustling leaves, winter wind and
 * sleigh bells, owls at night), and UI sounds for every HQ button, toggle,
 * slider and canvas pick. The older effects engine keeps the sim effects
 * (chimes, tube whooshes, stamps).
 *
 * Audio starts on the first tap/click/key (required by iOS and browsers) and
 * yields to Marion Mystery while an Arcade game is on screen.
 */
import { useArcade } from '../arcade/state';
import { engine, hz } from '../mystery/audio/engine';
import { music } from '../mystery/audio/music';
import { sfx } from '../mystery/audio/sfx';
import type { HQ } from '../game/hq';
import { nightFactor } from '../render/daylight';
import { useGame, type GameState } from '../store/gameStore';
import { seasonFor, type Season } from '../theme/environment';
import { audio as legacy, audioGestureSeen } from './audio';

/** The HQ music track for a season and time of day. */
export function hqTrackFor(season: Season, night: boolean): string {
  return night ? 'hq-night' : `hq-${season}`;
}

/** Ambience key (season + day/night) — pure for tests. */
export function hqAmbienceFor(season: Season, night: boolean): string {
  return `${season}:${night ? 'night' : 'day'}`;
}

let uiActive = false;

/** Play an HQ UI sound from components (popovers closing on an outside tap or Esc); no-op while muted or in the Arcade. */
export function hqUiSound(id: 'ui.open' | 'ui.close' | 'ui.click' | 'ui.toggle'): void {
  if (uiActive) sfx.play(id);
}

export interface HqSoundState {
  active: boolean;
  track: string | null;
  ambience: string;
}

export function wireHqSound(hq: HQ, store = useGame): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const state: HqSoundState = { active: false, track: null, ambience: '' };
  let unlocked = false;
  let ambStop: (() => void) | null = null;
  let ambTimer: ReturnType<typeof setInterval> | null = null;

  const env = (s: GameState) => {
    const season = s.season === 'auto' ? seasonFor() : s.season;
    const night = nightFactor(hq.hour()) > 0.5;
    return { season, night };
  };

  const stopAmbience = () => {
    ambStop?.();
    ambStop = null;
    if (ambTimer) clearInterval(ambTimer);
    ambTimer = null;
    state.ambience = '';
  };

  const startAmbience = (season: Season, night: boolean) => {
    const key = hqAmbienceFor(season, night);
    if (key === state.ambience) return;
    stopAmbience();
    const b = engine.buses;
    if (!b) return;
    state.ambience = key;
    const amb = b.amb;
    const stops: (() => void)[] = [];
    // Bed: soft air everywhere, plus a seasonal layer.
    stops.push(engine.noiseBed(amb, 0.018, 260, 'lowpass', 0.7, 0.05, 0.4));
    if (season === 'fall' || season === 'winter') stops.push(engine.noiseBed(amb, season === 'winter' ? 0.05 : 0.035, season === 'winter' ? 420 : 700, 'bandpass', 0.9, 0.07, 0.75)); // wind
    if (season === 'summer' && !night) stops.push(engine.noiseBed(amb, 0.012, 5200, 'bandpass', 3, 0.3, 0.6)); // cicadas
    ambStop = () => stops.forEach((s) => s());
    let n = 0;
    ambTimer = setInterval(() => {
      const ctx = engine.ctx;
      if (!ctx || !engine.buses || !state.active) return;
      const t = ctx.currentTime;
      const a = engine.buses.amb;
      n++;
      const pan = Math.random() * 1.6 - 0.8;
      if (!night) {
        if ((season === 'spring' || season === 'summer') && Math.random() < 0.55) {
          // Bird: a few quick up-chirps.
          const base = 2600 + Math.random() * 1400;
          const k = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < k; i++) engine.tone(a, base, t + i * 0.11, 0.07, 0.035, 'sine', base * 1.35, pan, 0.3);
        }
        if (season === 'fall' && Math.random() < 0.35) engine.noiseHit(a, t, 0.5, 0.05, 3800, 'highpass', 0.8, 0.2, 0, pan); // leaves skittering
        if (season === 'winter' && n % 9 === 0) for (let i = 0; i < 6; i++) engine.bell(a, hz(['E7', 'G7', 'B6'][i % 3]!), t + i * 0.09, 0.025, { kind: 'glass', rev: 0.6, pan }); // sleigh bells far off
      } else {
        if (season !== 'winter' && Math.random() < 0.8) {
          // Crickets: short trills.
          for (let i = 0; i < 4; i++) engine.tone(a, 4400 + (n % 3) * 120, t + i * 0.045, 0.025, 0.018, 'sine', 0, pan);
        }
        if (n % 14 === 0) {
          // Owl: two soft hoots.
          engine.tone(a, 392, t, 0.32, 0.04, 'sine', 370, pan, 0.5);
          engine.tone(a, 392, t + 0.5, 0.5, 0.035, 'sine', 360, pan, 0.5);
        }
        if (season === 'winter' && Math.random() < 0.2) engine.noiseHit(a, t, 1.2, 0.03, 600, 'bandpass', 1.5, 0.4, 900, pan); // gust
      }
    }, 1100);
  };

  const sync = () => {
    const s = store.getState();
    const arcade = useArcade.getState().open;
    const active = unlocked && !s.muted && !arcade;
    const { season, night } = env(s);
    if (active) {
      sfx.configure({ muted: false, volume: 0.85, music: 0.75 });
      const track = s.turntable ? hqTrackFor(season, night) : null;
      if (music.trackId !== track) music.play(track, 2.2);
      state.track = track;
      startAmbience(season, night);
    } else if (state.active) {
      // Hand the engine back (Mystery drives it while an Arcade game is open).
      if (!arcade) {
        music.play(null, 0.8);
        sfx.configure({ muted: true, volume: 0.85, music: 0.75 });
      }
      state.track = null;
      stopAmbience();
    }
    state.active = active;
    uiActive = active;
  };

  // First gesture unlocks audio (iOS / autoplay policies). iOS only counts
  // touchend / click as a gesture, so keep listening until the context runs.
  const unlock = () => {
    if (unlocked && engine.ctx?.state === 'running') return;
    if (!audioGestureSeen()) return;
    if (!engine.unlock()) return;
    legacy.resume();
    if (unlocked) return;
    unlocked = true;
    sync();
  };
  const onGesture = () => unlock();
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
  for (const g of GESTURES) window.addEventListener(g, onGesture, true);

  // UI sounds for HQ controls (Marion Mystery has its own inside .mm-root).
  const outsideMystery = (el: Element | null) => !!el && !el.closest('.mm-root');
  let lastHover = 0;
  const onDown = (e: PointerEvent) => {
    if (!state.active) return;
    const el = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], [role="radio"], [role="tab"], select, a[href], summary');
    if (!outsideMystery(el ?? null) || (el as HTMLButtonElement).disabled) return;
    const aria = el!.getAttribute('aria-label') ?? '';
    const cls = el!.className?.toString?.() ?? '';
    const role = el!.getAttribute('role');
    if (role === 'radio' || role === 'tab' || el!.hasAttribute('aria-pressed')) sfx.play('ui.toggle');
    else if (el!.hasAttribute('aria-expanded')) sfx.play(el!.getAttribute('aria-expanded') === 'true' ? 'ui.close' : 'ui.open');
    else if (/close|back|cancel/i.test(aria)) sfx.play('ui.back');
    else if (/primary/.test(cls)) sfx.play('ui.primary');
    else sfx.play('ui.click');
  };
  const onOver = (e: PointerEvent) => {
    if (!state.active || e.pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement | null)?.closest?.('button, [role="button"], [role="radio"]');
    if (!outsideMystery(el ?? null)) return;
    const now = performance.now();
    if (now - lastHover < 70) return;
    lastHover = now;
    sfx.play('ui.hover');
  };
  const onInput = (e: Event) => {
    if (!state.active) return;
    const el = e.target as HTMLInputElement;
    if (!outsideMystery(el)) return;
    if (el.type === 'checkbox') sfx.play('ui.toggle');
    else if (el.type === 'range') sfx.play('ui.slide');
    else if (el.tagName === 'SELECT') sfx.play('ui.toggle');
    else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') sfx.play('ui.type');
  };
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('pointerover', onOver, true);
  document.addEventListener('input', onInput, true);

  // Store-driven sounds: picking bots/rooms, panels, view/season/time switches.
  let prev = store.getState();
  const unsub = store.subscribe((s) => {
    const p = prev;
    prev = s;
    if (state.active) {
      if (s.selectedBot && s.selectedBot !== p.selectedBot) sfx.play('ui.equip');
      else if (s.selectedRoom && s.selectedRoom !== p.selectedRoom) sfx.play('ui.open');
      else if ((!s.selectedBot && p.selectedBot) || (!s.selectedRoom && p.selectedRoom)) sfx.play('ui.close');
      if (s.hqView !== p.hqView) sfx.play('ui.go');
      if (s.paused !== p.paused) sfx.play(s.paused ? 'ui.back' : 'ui.go');
      // Palette and help also open/close from the keyboard (⌘K, ?, Esc).
      if (s.paletteOpen !== p.paletteOpen || s.helpOpen !== p.helpOpen) sfx.play(s.paletteOpen || s.helpOpen ? 'ui.open' : 'ui.close');
    }
    if (s.muted !== p.muted || s.turntable !== p.turntable || s.season !== p.season || s.timeMode !== p.timeMode) {
      if (!s.muted) unlock();
      sync();
      // Sound coming back on confirms itself.
      if (s.muted !== p.muted && !s.muted && state.active) sfx.play('ui.toggle');
    }
  });
  // Re-sync after the Arcade overlay has unmounted (Mystery hands music back then).
  const unArcade = useArcade.subscribe(() => {
    sync();
    setTimeout(sync, 400);
  });
  // Auto season / time of day can change while the page is open.
  const clock = setInterval(sync, 5000);

  return () => {
    for (const g of GESTURES) window.removeEventListener(g, onGesture, true);
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('pointerover', onOver, true);
    document.removeEventListener('input', onInput, true);
    unsub();
    unArcade();
    clearInterval(clock);
    stopAmbience();
    if (state.active) music.play(null, 0.5);
  };
}
