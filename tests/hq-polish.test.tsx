import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { AudioEngine, audioGestureSeen } from '../src/audio/audio';
import { ROOM_BY_ID, roomRect } from '../src/engine/world';
import { HQ } from '../src/game/hq';
import { setTopInset, topInset } from '../src/ui/layout';
import { usePresence, type Presence } from '../src/ui/motion';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('usePresence (enter / exit motion)', () => {
  it('stays mounted with the last value while closing, then unmounts', async () => {
    let seen: Presence<string> = { mounted: false, closing: false, value: null };
    function Probe({ v }: { v: string | null }) {
      seen = usePresence(v, 50);
      return null;
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(<Probe v="command" />));
    expect(seen).toEqual({ mounted: true, closing: false, value: 'command' });
    await act(async () => root.render(<Probe v={null} />));
    expect(seen).toEqual({ mounted: true, closing: true, value: 'command' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(seen.mounted).toBe(false);
    // Re-opening mid-exit cancels the exit.
    await act(async () => root.render(<Probe v="huddle" />));
    await act(async () => root.render(<Probe v={null} />));
    await act(async () => root.render(<Probe v="mail" />));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(seen).toEqual({ mounted: true, closing: false, value: 'mail' });
    act(() => root.unmount());
  });
});

describe('HUD layout', () => {
  it('the measured top bar height becomes the camera top inset and --hq-top', () => {
    setTopInset(118);
    expect(topInset()).toBe(118);
    expect(document.documentElement.style.getPropertyValue('--hq-top')).toBe('118px');
  });

  it('frames a room in the space the top bar and panel leave free', () => {
    const hq = new HQ();
    hq.camera.setViewport(390, 844);
    hq.camera.insets = { top: 118, right: 0, bottom: 0, left: 0 };
    // Phone portrait: the panel is a bottom sheet.
    const cover = hq.panelCover();
    expect(cover.right).toBe(0);
    expect(cover.bottom).toBeGreaterThan(300);
    hq.focusRoom('command');
    hq.camera.snap();
    const r = roomRect(ROOM_BY_ID.command);
    const centre = hq.camera.worldToScreen(r.x + r.w / 2, r.y + r.h / 2);
    // Centred horizontally, and vertically between the bar and the sheet.
    expect(Math.abs(centre.x - 195)).toBeLessThan(2);
    expect(Math.abs(centre.y - (118 + (844 - cover.bottom)) / 2)).toBeLessThan(2);
    // Desktop: side panel on the right.
    hq.camera.setViewport(1440, 900);
    hq.camera.insets = { top: 64, right: 0, bottom: 0, left: 0 };
    expect(hq.panelCover()).toEqual({ right: 384, bottom: 0 });
    hq.focusRoom('arcade');
    hq.camera.snap();
    const a = roomRect(ROOM_BY_ID.arcade);
    const c2 = hq.camera.worldToScreen(a.x + a.w / 2, a.y + a.h / 2);
    expect(Math.abs(c2.x - (1440 - 384) / 2)).toBeLessThan(2);
    expect(Math.abs(c2.y - (64 + 900) / 2)).toBeLessThan(2);
  });
});

describe('audio start policy', () => {
  it('waits for a user gesture before creating an AudioContext', () => {
    const nav = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } };
    const had = Object.getOwnPropertyDescriptor(nav, 'userActivation');
    const ua = { hasBeenActive: false };
    Object.defineProperty(nav, 'userActivation', { value: ua, configurable: true });
    let created = 0;
    const w = window as unknown as { AudioContext?: unknown };
    const prev = w.AudioContext;
    w.AudioContext = class {
      currentTime = 0;
      destination = {};
      sampleRate = 8000;
      constructor() {
        created++;
      }
      createGain() {
        return { gain: { value: 0, setTargetAtTime() {}, cancelScheduledValues() {} }, connect() {} };
      }
      createBiquadFilter() {
        return { type: '', frequency: { value: 0 }, connect() {} };
      }
      createBuffer() {
        return { getChannelData: () => new Float32Array(4) };
      }
      resume() {
        return Promise.resolve();
      }
    };
    try {
      expect(audioGestureSeen()).toBe(false);
      const e = new AudioEngine();
      e.update({ muted: false, turntable: false, dictating: false });
      expect(created).toBe(0);
      expect(e.enabled).toBe(false);
      ua.hasBeenActive = true;
      e.resume();
      expect(created).toBe(1);
      expect(e.enabled).toBe(true);
    } finally {
      w.AudioContext = prev;
      if (had) Object.defineProperty(nav, 'userActivation', had);
      else delete (nav as { userActivation?: unknown }).userActivation;
    }
  });
});
