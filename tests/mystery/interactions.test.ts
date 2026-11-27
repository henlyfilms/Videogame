/**
 * Interaction plumbing: an open task / fix panel owns the keyboard (no walking,
 * no stray actions), and a task the server refuses to open is closed with a
 * reason instead of being played for nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { doAction, input, wireInput } from '../../src/mystery/client/controls';
import { useMystery } from '../../src/mystery/client/store';

const key = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
const until = async (pred: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20));
  return pred();
};

describe('task panels own the keyboard', () => {
  let unwire: () => void;
  beforeAll(() => {
    unwire = wireInput();
  });
  afterAll(() => {
    unwire();
    useMystery.setState({ taskStation: null });
  });

  it('arrow keys do not walk the player while a task is open', () => {
    useMystery.setState({ taskStation: null });
    key('keydown', 'ArrowRight');
    expect(input.axes().x).toBe(1);
    useMystery.setState({ taskStation: 'stampMail-16' });
    expect(input.axes()).toEqual({ x: 0, y: 0 });
    key('keyup', 'ArrowRight');
    useMystery.setState({ taskStation: null });
    expect(input.axes()).toEqual({ x: 0, y: 0 });
  });

  it('Enter / Q / Tab do nothing behind an open fix panel (Enter is chat elsewhere)', () => {
    const before = { showMap: useMystery.getState().showMap, showStats: useMystery.getState().showStats };
    useMystery.setState({ taskStation: 'lightsPanel-6' });
    doAction('map');
    doAction('tasks');
    doAction('chat');
    expect(useMystery.getState().showMap).toBe(before.showMap);
    expect(useMystery.getState().showStats).toBe(before.showStats);
    useMystery.setState({ taskStation: null });
    doAction('map');
    expect(useMystery.getState().showMap).toBe(!before.showMap);
    doAction('map');
  });
});

describe('server refuses a task', () => {
  it('closes the panel and says why when task.open is refused', async () => {
    const s = useMystery.getState();
    s.startFreeplay({ map: 'hq', mode: 'classic', role: 'crewmate' });
    expect(await until(() => useMystery.getState().snap?.phase === 'play', 15000)).toBe(true);
    const snap = useMystery.getState().snap!;
    const t = snap.you.tasks[0]!;
    const station = t.stations[t.step]!;
    // Far from the station: the server says "too far".
    useMystery.getState().act({ a: 'task.open', station });
    useMystery.getState().setTask(station);
    expect(useMystery.getState().taskStation).toBe(station);
    expect(await until(() => useMystery.getState().taskStation === null)).toBe(true);
    expect(useMystery.getState().toasts.some((x) => x.tone === 'bad' && /task/i.test(x.text))).toBe(true);
    useMystery.getState().leave();
  }, 20000);
});
