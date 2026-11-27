import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sfx } from '../../src/mystery/audio/sfx';
import { TASKS } from '../../src/mystery/core/tasks';
import { genAlignDish, DISH_STEP } from '../../src/mystery/ui/tasks/AlignDish';
import { genTurntable, TARGET_BPM } from '../../src/mystery/ui/tasks/CalibrateTurntable';
import { genCleanFilter } from '../../src/mystery/ui/tasks/CleanFilter';
import { genCommsPanel } from '../../src/mystery/ui/tasks/CommsPanel';
import { genDistillReel } from '../../src/mystery/ui/tasks/DistillReel';
import { genFixWiring } from '../../src/mystery/ui/tasks/FixWiring';
import { genKeypadCode, OK_INDEX } from '../../src/mystery/ui/tasks/KeypadCode';
import { gridMove, spatialMove, type Dir } from '../../src/mystery/ui/tasks/kit';
import { genLightLantern } from '../../src/mystery/ui/tasks/LightLantern';
import { genLightsPanel } from '../../src/mystery/ui/tasks/LightsPanel';
import { genPrimeShields, HEXES } from '../../src/mystery/ui/tasks/PrimeShields';
import { MINI_GAMES } from '../../src/mystery/ui/tasks/registry';
import { genReplaceFuse, FUSE_COLS, FUSE_COUNT } from '../../src/mystery/ui/tasks/ReplaceFuse';
import { genRerouteTube, tileMask, traceRoute } from '../../src/mystery/ui/tasks/RerouteTube';
import { genSimonSays, simonPlaybackMs, SIMON_COLS } from '../../src/mystery/ui/tasks/SimonSays';
import { genSlotCartridge } from '../../src/mystery/ui/tasks/SlotCartridge';
import { binOf, genSortBerries } from '../../src/mystery/ui/tasks/SortBerries';
import { genSortClips } from '../../src/mystery/ui/tasks/SortClips';
import { genStampMail } from '../../src/mystery/ui/tasks/StampMail';
import { CHARGE_S, genSwipeBadge } from '../../src/mystery/ui/tasks/SwipeBadge';
import { TaskModal } from '../../src/mystery/ui/tasks/TaskModal';
import { minTimeMs } from '../../src/mystery/ui/tasks/timing';
import { MINI_GAME_KINDS, type MiniGameKind } from '../../src/mystery/ui/tasks/types';
import { genUnlockManifold, MANIFOLD_COLS } from '../../src/mystery/ui/tasks/UnlockManifold';
import { genWaterPlants, WATER_RATE } from '../../src/mystery/ui/tasks/WaterPlants';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FAKE = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] as const;

let host: HTMLDivElement;
let root: Root;
let errors: unknown[][];
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: [...FAKE] });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  errors = [];
  errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  errSpy.mockRestore();
  vi.useRealTimers();
});

interface Mounted {
  onComplete: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  t0: number;
  calledAt: number[];
}

function mount(kind: MiniGameKind, seed: number, opts: { reducedMotion?: boolean; fake?: boolean } = {}): Mounted {
  const calledAt: number[] = [];
  const onComplete = vi.fn(() => {
    calledAt.push(performance.now());
  });
  const onClose = vi.fn();
  const t0 = performance.now();
  act(() => {
    root.render(<TaskModal kind={kind} seed={seed} step="1/2" onComplete={onComplete} onClose={onClose} reducedMotion={opts.reducedMotion} fake={opts.fake} />);
  });
  return { onComplete, onClose, t0, calledAt };
}

const target = (): Element => {
  const a = document.activeElement;
  if (a && a !== document.body && host.contains(a)) return a;
  return host.querySelector('[data-minigame]') ?? host;
};
const key = (k: string, type: 'keydown' | 'keyup' = 'keydown', init: KeyboardEventInit = {}) =>
  act(() => {
    target().dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...init }));
  });
const press = (k: string, times = 1) => {
  for (let i = 0; i < times; i++) {
    key(k, 'keydown');
    key(k, 'keyup');
  }
};
/** Advance fake time in small steps so React flushes renders/effects between frames. */
const wait = (ms: number) => {
  for (let left = ms; left > 0; left -= 50) {
    act(() => {
      vi.advanceTimersByTime(Math.min(50, left));
    });
  }
};
const hold = (k: string, ms: number) => {
  key(k, 'keydown');
  wait(ms);
  key(k, 'keyup');
};

const ARROW: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/** Keys that walk a clamped grid cursor from `from` to `to`. */
function gridKeys(from: number, to: number, cols: number, count: number): string[] {
  const keys: string[] = [];
  let cur = from;
  for (let guard = 0; cur !== to && guard < 50; guard++) {
    const dc = (to % cols) - (cur % cols);
    const dr = Math.floor(to / cols) - Math.floor(cur / cols);
    const dir: Dir = dr > 0 ? 'down' : dr < 0 ? 'up' : dc > 0 ? 'right' : 'left';
    cur = gridMove(cur, dir, cols, count);
    keys.push(ARROW[dir]);
  }
  expect(cur).toBe(to);
  return keys;
}

/** BFS over the game's own spatial navigation to find a key path. */
function spatialKeys(pts: { x: number; y: number }[], from: number, to: number): string[] {
  const prev = new Map<number, { p: number; d: Dir }>();
  const q = [from];
  const seen = new Set([from]);
  while (q.length) {
    const c = q.shift() as number;
    if (c === to) break;
    for (const d of ['up', 'down', 'left', 'right'] as Dir[]) {
      const n = spatialMove(pts, c, d);
      if (!seen.has(n)) {
        seen.add(n);
        prev.set(n, { p: c, d });
        q.push(n);
      }
    }
  }
  const keys: string[] = [];
  for (let c = to; c !== from; ) {
    const s = prev.get(c);
    if (!s) throw new Error(`unreachable ${to}`);
    keys.unshift(ARROW[s.d]);
    c = s.p;
  }
  return keys;
}
const pressAll = (keys: string[]) => keys.forEach((k) => press(k));

/** Keyboard-only solutions, derived from each game's deterministic layout. */
const SOLVERS: Record<MiniGameKind, (seed: number) => void> = {
  stampMail: (s) => {
    for (const l of genStampMail(s)) {
      press(l.good ? 'ArrowRight' : 'ArrowLeft');
      press('Enter');
      wait(900);
    }
  },
  sortClips: (s) => {
    for (const c of genSortClips(s)) {
      press(c.keep ? 'ArrowLeft' : 'ArrowRight');
      wait(500);
    }
  },
  distillReel: (s) => {
    const g = genDistillReel(s);
    press('ArrowRight', g.target);
    press('Enter');
    wait(800);
    hold(' ', 1000);
  },
  slotCartridge: (s) => {
    const g = genSlotCartridge(s);
    let cur = 2;
    for (const c of g.carts) {
      const t = g.slots.indexOf(c.shape);
      pressAll(gridKeys(cur, t, 5, 5));
      press('Enter');
      wait(1000);
      cur = t;
    }
  },
  rerouteTube: (s) => {
    const g = genRerouteTube(s);
    let cur = g.inRow * g.cols;
    for (const n of g.need) {
      const t = g.tiles[n.cell]!;
      const k = [0, 1, 2, 3].find((r) => tileMask({ type: t.type, rot: t.rot + r }) === n.mask)!;
      pressAll(gridKeys(cur, n.cell, g.cols, g.cols * g.rows));
      cur = n.cell;
      press('Enter', k);
    }
  },
  calibrateTurntable: (s) => {
    const d = TARGET_BPM - genTurntable(s).start;
    press(d > 0 ? 'ArrowUp' : 'ArrowDown', Math.abs(d));
  },
  sortBerries: (s) => {
    let pos = 1;
    for (const b of genSortBerries(s)) {
      const t = binOf(b.ripe);
      pressAll(gridKeys(pos, t, 3, 3));
      press('Enter');
      wait(600);
      pos = t;
    }
  },
  juicePress: () => hold(' ', 5000),
  alignDish: (s) => {
    const g = genAlignDish(s);
    const k = (g.start - g.target) / DISH_STEP;
    press(k > 0 ? 'ArrowLeft' : 'ArrowRight', Math.abs(k));
  },
  fuelCan: () => hold(' ', 3500),
  fuelEngine: () => hold(' ', 3500),
  fixWiring: (s) => {
    const g = genFixWiring(s);
    for (let i = 0; i < 4; i++) {
      press('Enter');
      const j = g.right.indexOf(g.left[i]!);
      pressAll(gridKeys(i, j, 1, 4));
      press('Enter');
    }
  },
  swipeBadge: (s) => {
    const g = genSwipeBadge(s);
    hold(' ', g.zone * CHARGE_S * 1000);
  },
  waterPlants: (s) => {
    for (const p of genWaterPlants(s).pots) {
      hold(' ', ((p.line + 0.035) / WATER_RATE) * 1000);
      wait(400);
    }
  },
  cleanFilter: (s) => {
    for (let i = 0; i < genCleanFilter(s).length; i++) {
      press('Enter');
      wait(400);
    }
  },
  download: () => press('Enter'),
  upload: () => press(' '),
  unlockManifold: (s) => {
    const grid = genUnlockManifold(s);
    let cur = 0;
    for (let n = 1; n <= 10; n++) {
      const t = grid.indexOf(n);
      pressAll(gridKeys(cur, t, MANIFOLD_COLS, 10));
      press('Enter');
      cur = t;
    }
  },
  simonSays: (s) => {
    const seq = genSimonSays(s);
    let cur = 4;
    for (let r = 0; r < seq.length; r++) {
      wait((r ? 450 : 0) + simonPlaybackMs(r) + 60);
      for (let i = 0; i <= r; i++) {
        pressAll(gridKeys(cur, seq[i]!, SIMON_COLS, 9));
        press('Enter');
        cur = seq[i]!;
      }
    }
  },
  keypadCode: (s) => {
    let cur = OK_INDEX;
    for (const d of genKeypadCode(s)) {
      const t = d === '0' ? 10 : Number(d) - 1;
      pressAll(gridKeys(cur, t, 3, 12));
      press('Enter');
      cur = t;
    }
    pressAll(gridKeys(cur, OK_INDEX, 3, 12));
    press('Enter');
  },
  emptyChute: () => hold(' ', 3500),
  medScan: () => {
    press('Enter');
    wait(8000);
  },
  primeShields: (s) => {
    const red = genPrimeShields(s);
    let cur = 0;
    red.forEach((r, i) => {
      if (!r) return;
      pressAll(spatialKeys(HEXES, cur, i));
      press('Enter');
      cur = i;
    });
  },
  chartCourse: () => {
    for (let i = 0; i < 4; i++) {
      press('Enter');
      wait(500);
    }
  },
  replaceFuse: (s) => {
    const { blown } = genReplaceFuse(s);
    pressAll(gridKeys(0, blown, FUSE_COLS, FUSE_COUNT));
    press('Enter');
    wait(400);
    press('Enter');
  },
  rechargeGenerator: () => hold(' ', 3500),
  lightLantern: (s) => {
    const g = genLightLantern(s);
    for (let i = 0; i < g.strikes; i++) {
      press(' ');
      wait(400);
    }
    hold(' ', 1200);
  },
  lightsPanel: (s) => {
    let cur = 0;
    genLightsPanel(s).forEach((on, i) => {
      if (on) return;
      press('ArrowRight', i - cur);
      cur = i;
      press('Enter');
    });
  },
  commsPanel: (s) => {
    const g = genCommsPanel(s);
    const d = g.target - g.start;
    press(d > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(d));
  },
};

const SEEDS = [1, 42, 90210];

describe('mini-game registry', () => {
  it('has all 29 kinds with title, hint and component', () => {
    expect(MINI_GAME_KINDS).toHaveLength(29);
    expect(Object.keys(MINI_GAMES).sort()).toEqual([...MINI_GAME_KINDS].sort());
    for (const k of MINI_GAME_KINDS) {
      const e = MINI_GAMES[k];
      expect(e.title.length, k).toBeGreaterThan(2);
      expect(e.hint.length, k).toBeGreaterThan(5);
      expect(typeof e.Component, k).toBe('function');
    }
  });
  it('covers every task step station in the task catalogue', () => {
    for (const t of TASKS) for (const s of t.steps) expect(MINI_GAME_KINDS, `${t.id}:${s}`).toContain(s);
  });
  it('layouts are deterministic per seed and vary across seeds', () => {
    expect(genStampMail(5)).toEqual(genStampMail(5));
    expect(genRerouteTube(5)).toEqual(genRerouteTube(5));
    expect(genUnlockManifold(5)).toEqual(genUnlockManifold(5));
    const variety = new Set(Array.from({ length: 8 }, (_, i) => genUnlockManifold(i).join(',')));
    expect(variety.size).toBeGreaterThan(4);
  });
  it('pipe puzzles start unsolved but are solvable', () => {
    for (let s = 0; s < 40; s++) {
      const g = genRerouteTube(s);
      expect(traceRoute(g, g.tiles).ok, `seed ${s}`).toBe(false);
      const solved = g.tiles.map((t) => ({ ...t }));
      for (const n of g.need) {
        const t = solved[n.cell]!;
        t.rot += [0, 1, 2, 3].find((r) => tileMask({ type: t.type, rot: t.rot + r }) === n.mask)!;
      }
      expect(traceRoute(g, solved).ok, `seed ${s}`).toBe(true);
    }
  });
});

describe.each(MINI_GAME_KINDS.map((k) => [k]))('%s', (kind) => {
  it('renders inside TaskModal without errors', () => {
    mount(kind, 7);
    expect(host.querySelector(`[data-task-modal="${kind}"]`)).not.toBeNull();
    const game = host.querySelector(`[data-minigame="${kind}"]`);
    expect(game).not.toBeNull();
    expect(document.activeElement).toBe(game);
    expect(host.textContent).toContain(MINI_GAMES[kind].title);
    expect(host.textContent).toContain('1/2');
    wait(1000);
    expect(errors).toEqual([]);
  });

  it.each(SEEDS)('is completable by keyboard alone (seed %i), onComplete fires exactly once', (seed) => {
    const m = mount(kind, seed);
    SOLVERS[kind](seed);
    wait(10000);
    expect(m.onComplete).toHaveBeenCalledTimes(1);
    // respects the server-side minTime
    expect((m.calledAt[0] as number) - m.t0).toBeGreaterThanOrEqual(minTimeMs(kind) - 250);
    // stray input after success never fires it again
    press('Enter', 3);
    hold(' ', 2000);
    wait(5000);
    expect(m.onComplete).toHaveBeenCalledTimes(1);
    expect(m.onClose).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it('never completes without the player solving it', () => {
    const m = mount(kind, 3);
    wait(12000);
    expect(m.onComplete).not.toHaveBeenCalled();
  });

  it('Esc calls onClose', () => {
    const m = mount(kind, 11);
    key('Escape');
    expect(m.onClose).toHaveBeenCalledTimes(1);
    expect(m.onComplete).not.toHaveBeenCalled();
  });
});

describe('mini-game sounds', () => {
  it.each(MINI_GAME_KINDS.map((k) => [k]))('%s makes step sounds while solved, then the solve sparkle once', (kind) => {
    const task = vi.spyOn(sfx, 'task');
    const hold = vi.spyOn(sfx, 'hold');
    const play = vi.spyOn(sfx, 'play');
    try {
      const m = mount(kind, 42);
      SOLVERS[kind](42);
      wait(10000);
      expect(m.onComplete).toHaveBeenCalledTimes(1);
      const steps = task.mock.calls.filter(([k]) => k !== 'solve').length + hold.mock.calls.length;
      expect(steps, `${kind} step sounds`).toBeGreaterThan(0);
      expect(task.mock.calls.filter(([k]) => k === 'solve')).toHaveLength(1);
      // every key press ticks
      expect(play.mock.calls.some(([n]) => n === 'task.tick')).toBe(true);
    } finally {
      task.mockRestore();
      hold.mockRestore();
      play.mockRestore();
    }
  });

  it('a faked task plays the completion chime locally (the server stays silent)', () => {
    const play = vi.spyOn(sfx, 'play');
    try {
      const m = mount('sortClips', 9, { fake: true });
      SOLVERS.sortClips(9);
      wait(5000);
      expect(m.onComplete).toHaveBeenCalledTimes(1);
      expect(play.mock.calls.filter(([n]) => n === 'taskDone')).toHaveLength(1);
    } finally {
      play.mockRestore();
    }
  });
});

describe('TaskModal', () => {
  it('close button calls onClose', () => {
    const m = mount('primeShields', 1);
    act(() => {
      (host.querySelector('button[aria-label="Close task"]') as HTMLButtonElement).click();
    });
    expect(m.onClose).toHaveBeenCalledTimes(1);
  });

  const untilFlourish = () => {
    for (let i = 0; i < 400 && !host.querySelector('.mmg-done'); i++) wait(20);
    expect(host.querySelector('.mmg-done')).not.toBeNull();
  };

  it('shows the flourish ~600ms before onComplete, and skips it in reduced motion', () => {
    const m = mount('chartCourse', 2);
    SOLVERS.chartCourse(2);
    untilFlourish();
    expect(m.onComplete).not.toHaveBeenCalled();
    wait(540);
    expect(m.onComplete).not.toHaveBeenCalled();
    wait(100);
    expect(m.onComplete).toHaveBeenCalledTimes(1);

    act(() => root.render(<div />));
    const r = mount('chartCourse', 2, { reducedMotion: true });
    SOLVERS.chartCourse(2);
    untilFlourish();
    expect(r.onComplete).toHaveBeenCalledTimes(1);
  });

  it('Esc during the success flourish does not cancel the completion', () => {
    const m = mount('chartCourse', 4);
    SOLVERS.chartCourse(4);
    untilFlourish();
    key('Escape');
    wait(1000);
    expect(m.onClose).not.toHaveBeenCalled();
    expect(m.onComplete).toHaveBeenCalledTimes(1);
  });

  it('resets for the next step when kind/seed change on the same modal', () => {
    const onComplete = vi.fn();
    const onClose = vi.fn();
    act(() => root.render(<TaskModal kind="download" seed={1} step="1/2" onComplete={onComplete} onClose={onClose} />));
    SOLVERS.download(1);
    wait(8000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    act(() => root.render(<TaskModal kind="upload" seed={2} step="2/2" onComplete={onComplete} onClose={onClose} />));
    expect(host.querySelector('[data-minigame="upload"]')).not.toBeNull();
    expect(host.querySelector('.mmg-done')).toBeNull();
    expect(host.textContent).toContain('2/2');
    SOLVERS.upload(2);
    wait(8000);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('fake tasks play normally and are marked for the murderer', () => {
    const m = mount('sortClips', 9, { fake: true });
    expect(host.textContent).toContain('FAKING');
    SOLVERS.sortClips(9);
    wait(5000);
    expect(m.onComplete).toHaveBeenCalledTimes(1);
  });

  it('wrong answers do not complete the game', () => {
    const m = mount('keypadCode', 5);
    const code = genKeypadCode(5);
    const wrong = code.split('').map((d) => String((Number(d) + 1) % 10));
    for (const d of wrong) press(d);
    press('Enter');
    wait(5000);
    expect(m.onComplete).not.toHaveBeenCalled();
    // and typing the digits directly works too
    for (const d of code) press(d);
    press('Enter');
    wait(5000);
    expect(m.onComplete).toHaveBeenCalledTimes(1);
  });
});
