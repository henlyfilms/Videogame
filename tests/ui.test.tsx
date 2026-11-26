import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CORE_EVENT_TYPES, makeEvent, parseMarionEvent } from '../src/adapters/events';
import { buildCommands, fuzzyScore, sampleEvent } from '../src/ui/CommandPalette';
import { useGame } from '../src/store/gameStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('command palette logic', () => {
  it('fuzzy matches substrings and subsequences', () => {
    expect(fuzzyScore('quill', 'Go to Quill — Email')).toBeGreaterThan(0);
    expect(fuzzyScore('gtq', 'Go to Quill')).toBeGreaterThan(0);
    expect(fuzzyScore('zzz', 'Go to Quill')).toBe(-1);
    expect(fuzzyScore('stamp', 'Stamp oldest draft')).toBeGreaterThan(fuzzyScore('stamp', 'Set a timer and press'));
  });
  it('every injector sample is a schema-valid MarionEvent', () => {
    for (const type of CORE_EVENT_TYPES) {
      const ev = makeEvent(type, sampleEvent(type));
      expect(parseMarionEvent(JSON.parse(JSON.stringify(ev))), type).not.toBeNull();
    }
  });
  it('builds commands for bots, rooms, play actions, sources and injection', () => {
    const cmds = buildCommands(() => undefined);
    const groups = new Set(cmds.map((c) => c.group));
    for (const g of ['Camera', 'Bots', 'Rooms', 'Play', 'Foundry', 'View', 'Source', 'Inject']) expect(groups.has(g)).toBe(true);
    expect(cmds.filter((c) => c.group === 'Inject')).toHaveLength(13);
    expect(cmds.filter((c) => c.title.startsWith('Replay:'))).toHaveLength(3);
  });
});

describe('App smoke test (jsdom)', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeAll(async () => {
    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;
      window.cancelAnimationFrame = (id) => clearTimeout(id);
    }
    host = document.createElement('div');
    host.style.width = '1280px';
    host.style.height = '800px';
    document.body.appendChild(host);
    const { App } = await import('../src/ui/App');
    root = createRoot(host);
    await act(async () => {
      root.render(<App />);
    });
  });
  afterAll(() => {
    act(() => root.unmount());
  });

  it('renders the HUD with canvas, top bar and feed', () => {
    expect(host.querySelector('canvas')).not.toBeNull();
    expect(host.textContent).toContain('Marion HQ');
    expect(host.querySelector('[aria-label="Activity feed"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Event source"]')).not.toBeNull();
  });

  it('opens the command palette with Ctrl+K and closes with Escape', async () => {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(host.querySelector('[aria-label="Command palette"]')).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(host.querySelector('[aria-label="Command palette"]')).toBeNull();
  });

  it('Space pauses, digits select bots, 0 returns to overview', async () => {
    const paused = useGame.getState().paused;
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    });
    expect(useGame.getState().paused).toBe(!paused);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '6' }));
    });
    expect(useGame.getState().selectedBot).toBe('quill');
    expect(host.querySelector('[aria-label="Quill inspector"]')).not.toBeNull();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
    });
    expect(useGame.getState().selectedBot).toBeNull();
  });

  it('opens a room panel and plays its mechanic from the UI', async () => {
    await act(async () => {
      useGame.getState().selectRoom('mail');
    });
    const panel = host.querySelector('[aria-label="Quill\'s Mailroom controls"]');
    expect(panel).not.toBeNull();
    const plus = [...panel!.querySelectorAll('button')].find((b) => b.textContent?.includes('+ Mail'))!;
    const before = useGame.getState().mech.mail.inbox.length;
    await act(async () => {
      plus.click();
    });
    expect(useGame.getState().mech.mail.inbox.length).toBe(before + 1);
  });

  it('switches theme from the top bar', async () => {
    const dark = host.querySelector('[aria-label="Dark theme"]') as HTMLButtonElement;
    await act(async () => {
      dark.click();
    });
    expect(useGame.getState().theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
