// Keyboard solvers for every Marion Mystery mini-game, driven through real key
// events in the browser. Layouts come from each game's own generator, imported
// in the page from the dev server.

const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const DIRV = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

function gridMove(index, dir, cols, count) {
  const rows = Math.ceil(count / cols);
  let c = index % cols;
  let r = Math.floor(index / cols);
  if (dir === 'left') c = Math.max(0, c - 1);
  if (dir === 'right') c = Math.min(cols - 1, c + 1);
  if (dir === 'up') r = Math.max(0, r - 1);
  if (dir === 'down') r = Math.min(rows - 1, r + 1);
  const n = r * cols + c;
  return n < count ? n : index;
}
export function gridKeys(from, to, cols, count) {
  const keys = [];
  let cur = from;
  for (let g = 0; cur !== to && g < 50; g++) {
    const dc = (to % cols) - (cur % cols);
    const dr = Math.floor(to / cols) - Math.floor(cur / cols);
    const dir = dr > 0 ? 'down' : dr < 0 ? 'up' : dc > 0 ? 'right' : 'left';
    cur = gridMove(cur, dir, cols, count);
    keys.push(ARROW[dir]);
  }
  if (cur !== to) throw new Error(`grid path ${from}->${to} failed`);
  return keys;
}
function spatialMove(pts, from, dir) {
  const o = pts[from];
  const v = DIRV[dir];
  let best = from;
  let bestScore = Infinity;
  pts.forEach((p, i) => {
    if (i === from) return;
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const along = dx * v.x + dy * v.y;
    if (along <= 2) return;
    const side = Math.abs(dx * v.y - dy * v.x);
    const score = along + side * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
export function spatialKeys(pts, from, to) {
  const prev = new Map();
  const q = [from];
  const seen = new Set([from]);
  while (q.length) {
    const c = q.shift();
    if (c === to) break;
    for (const d of ['up', 'down', 'left', 'right']) {
      const n = spatialMove(pts, c, d);
      if (!seen.has(n)) {
        seen.add(n);
        prev.set(n, { p: c, d });
        q.push(n);
      }
    }
  }
  const keys = [];
  for (let c = to; c !== from; ) {
    const s = prev.get(c);
    if (!s) throw new Error(`unreachable ${to}`);
    keys.unshift(ARROW[s.d]);
    c = s.p;
  }
  return keys;
}

const FILE = {
  stampMail: 'StampMail', sortClips: 'SortClips', distillReel: 'DistillReel', slotCartridge: 'SlotCartridge', rerouteTube: 'RerouteTube',
  calibrateTurntable: 'CalibrateTurntable', sortBerries: 'SortBerries', juicePress: 'JuicePress', alignDish: 'AlignDish', fuelCan: 'FuelCan',
  fuelEngine: 'FuelEngine', fixWiring: 'FixWiring', swipeBadge: 'SwipeBadge', waterPlants: 'WaterPlants', cleanFilter: 'CleanFilter',
  download: 'Download', upload: 'Upload', unlockManifold: 'UnlockManifold', simonSays: 'SimonSays', keypadCode: 'KeypadCode', emptyChute: 'EmptyChute',
  medScan: 'MedScan', primeShields: 'PrimeShields', chartCourse: 'ChartCourse', replaceFuse: 'ReplaceFuse', rechargeGenerator: 'RechargeGenerator',
  lightLantern: 'LightLantern', lightsPanel: 'LightsPanel', commsPanel: 'CommsPanel',
};
export const modUrl = (kind) => `/src/mystery/ui/tasks/${FILE[kind]}.tsx`;

/** Import a task module in the page and return selected exports / generator output. */
export async function gen(page, kind, fn, seed) {
  return page.evaluate(
    async ([url, f, s]) => {
      const m = await import(url);
      const v = m[f];
      return typeof v === 'function' ? v(s) : v;
    },
    [modUrl(kind), fn, seed],
  );
}

export function keyboardSolvers(page) {
  const kb = page.keyboard;
  const wait = (ms) => page.waitForTimeout(ms);
  const press = async (k, n = 1) => {
    for (let i = 0; i < n; i++) {
      await kb.press(k);
      await wait(35);
    }
  };
  const pressAll = async (keys) => {
    for (const k of keys) await press(k);
  };
  const hold = async (k, ms) => {
    await kb.down(k);
    await wait(ms);
    await kb.up(k);
  };
  const status = () => page.evaluate(() => document.querySelector('[data-minigame] .mmg-sr')?.textContent ?? '');
  const pct = async () => {
    const t = await status();
    const m = /(\d+) percent/.exec(t) ?? /(\d+)/.exec(t);
    return m ? Number(m[1]) : 0;
  };
  const flourish = () => page.evaluate(() => !!document.querySelector('.mmg-done') || !document.querySelector('[data-minigame]'));
  /** Hold `k` until pred() (polled), at most `max` ms. Frame rate independent. */
  const holdUntil = async (k, pred, max = 15000) => {
    await kb.down(k);
    const t0 = Date.now();
    while (Date.now() - t0 < max && !(await pred())) await wait(25);
    await kb.up(k);
  };
  /** Wait for the status line to change (the game moved on to the next item). */
  const nextItem = async (prev, max = 3000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < max && (await status()) === prev) await wait(40);
    await wait(60);
  };
  return {
    stampMail: async (s) => {
      for (const l of await gen(page, 'stampMail', 'genStampMail', s)) {
        const st0 = await status();
        await press(l.good ? 'ArrowRight' : 'ArrowLeft');
        await press('Enter');
        await nextItem(st0);
      }
    },
    sortClips: async (s) => {
      for (const c of await gen(page, 'sortClips', 'genSortClips', s)) {
        const st0 = await status();
        await press(c.keep ? 'ArrowLeft' : 'ArrowRight');
        await nextItem(st0);
      }
    },
    distillReel: async (s) => {
      const g = await gen(page, 'distillReel', 'genDistillReel', s);
      await press('ArrowRight', g.target);
      await press('Enter');
      await wait(900);
      if (process.env.QA_DEBUG) console.log('distill status before pull:', await status(), await page.evaluate(() => document.activeElement?.className));
      await holdUntil(' ', flourish, 4000);
    },
    slotCartridge: async (s) => {
      const g = await gen(page, 'slotCartridge', 'genSlotCartridge', s);
      let cur = 2;
      for (const c of g.carts) {
        const t = g.slots.indexOf(c.shape);
        await pressAll(gridKeys(cur, t, 5, 5));
        await press('Enter');
        await wait(1000);
        cur = t;
      }
    },
    rerouteTube: async (s) => {
      const g = await page.evaluate(
        async ([u, seed]) => {
          const m = await import(u);
          const g = m.genRerouteTube(seed);
          return { ...g, ks: g.need.map((n) => [0, 1, 2, 3].find((r) => m.tileMask({ type: g.tiles[n.cell].type, rot: g.tiles[n.cell].rot + r }) === n.mask)) };
        },
        [modUrl('rerouteTube'), s],
      );
      let cur = g.inRow * g.cols;
      for (let i = 0; i < g.need.length; i++) {
        const n = g.need[i];
        await pressAll(gridKeys(cur, n.cell, g.cols, g.cols * g.rows));
        cur = n.cell;
        await press('Enter', g.ks[i]);
      }
    },
    calibrateTurntable: async (s) => {
      const st = await gen(page, 'calibrateTurntable', 'genTurntable', s);
      const d = 72 - st.start;
      await press(d > 0 ? 'ArrowUp' : 'ArrowDown', Math.abs(d));
      await wait(2500);
    },
    sortBerries: async (s) => {
      let pos = 1;
      const bins = await page.evaluate(async ([u, seed]) => {
        const m = await import(u);
        return m.genSortBerries(seed).map((b) => m.binOf(b.ripe));
      }, [modUrl('sortBerries'), s]);
      for (const t of bins) {
        await pressAll(gridKeys(pos, t, 3, 3));
        const st0 = await status();
        await press('Enter');
        await nextItem(st0);
        await wait(300);
        pos = t;
      }
    },
    juicePress: async () => holdUntil(' ', async () => (await pct()) >= 100 || (await flourish())),
    alignDish: async (s) => {
      const g = await gen(page, 'alignDish', 'genAlignDish', s);
      const k = (g.start - g.target) / 3;
      await press(k > 0 ? 'ArrowLeft' : 'ArrowRight', Math.abs(k));
      await wait(1500);
    },
    fuelCan: async () => holdUntil(' ', async () => (await pct()) >= 100 || (await flourish())),
    fuelEngine: async () => holdUntil(' ', async () => (await pct()) >= 100 || (await flourish())),
    fixWiring: async (s) => {
      const g = await gen(page, 'fixWiring', 'genFixWiring', s);
      for (let i = 0; i < 4; i++) {
        await press('Enter');
        const j = g.right.indexOf(g.left[i]);
        await pressAll(gridKeys(i, j, 1, 4));
        await press('Enter');
        await wait(120);
      }
    },
    swipeBadge: async () => {
      // Release while the charge bar shows green (the in-zone colour).
      await holdUntil(' ', () => page.evaluate(() => [...document.querySelectorAll('[data-minigame] rect[height="10"]')].some((r) => r.getAttribute('fill') === '#4ade80')), 6000);
    },
    waterPlants: async (s) => {
      for (const p of (await gen(page, 'waterPlants', 'genWaterPlants', s)).pots) {
        await holdUntil(' ', async () => (await pct()) >= Math.round(p.line * 100) + 3, 6000);
        await wait(900);
      }
    },
    cleanFilter: async (s) => {
      const n = (await gen(page, 'cleanFilter', 'genCleanFilter', s)).length;
      const left = () => page.evaluate(() => parseInt(document.querySelector('[data-minigame] .mmg-sr')?.textContent ?? '0', 10));
      for (let i = 0; i < n * 3 && (await left()) > 0; i++) {
        await press('Enter');
        await wait(450);
      }
    },
    download: async () => press('Enter'),
    upload: async () => press(' '),
    unlockManifold: async (s) => {
      const grid = await gen(page, 'unlockManifold', 'genUnlockManifold', s);
      let cur = 0;
      for (let n = 1; n <= 10; n++) {
        const t = grid.indexOf(n);
        await pressAll(gridKeys(cur, t, 5, 10));
        await press('Enter');
        cur = t;
      }
    },
    simonSays: async (s) => {
      const seq = await gen(page, 'simonSays', 'genSimonSays', s);
      const pb = await page.evaluate(async (u) => {
        const m = await import(u);
        return [0, 1, 2, 3, 4, 5].map((r) => m.simonPlaybackMs(r));
      }, modUrl('simonSays'));
      let cur = 4;
      for (let r = 0; r < seq.length; r++) {
        await wait((r ? 450 : 0) + pb[r] + 250);
        for (let i = 0; i <= r; i++) {
          await pressAll(gridKeys(cur, seq[i], 3, 9));
          await press('Enter');
          cur = seq[i];
        }
      }
    },
    keypadCode: async (s) => {
      let cur = 11;
      for (const d of await gen(page, 'keypadCode', 'genKeypadCode', s)) {
        const t = d === '0' ? 10 : Number(d) - 1;
        await pressAll(gridKeys(cur, t, 3, 12));
        await press('Enter');
        cur = t;
      }
      await pressAll(gridKeys(cur, 11, 3, 12));
      await press('Enter');
    },
    emptyChute: async () => holdUntil(' ', async () => (await pct()) >= 100 || (await flourish())),
    medScan: async () => {
      await press('Enter');
      await wait(7200);
    },
    primeShields: async (s) => {
      const red = await gen(page, 'primeShields', 'genPrimeShields', s);
      const hexes = await gen(page, 'primeShields', 'HEXES', 0);
      let cur = 0;
      for (let i = 0; i < red.length; i++) {
        if (!red[i]) continue;
        await pressAll(spatialKeys(hexes, cur, i));
        await press('Enter');
        cur = i;
      }
    },
    chartCourse: async () => {
      const reached = () => page.evaluate(() => parseInt(document.querySelector('[data-minigame] .mmg-sr')?.textContent ?? '0', 10));
      for (let i = 0; i < 12 && (await reached()) < 4; i++) {
        await press('Enter');
        await wait(600);
      }
    },
    replaceFuse: async (s) => {
      const { blown } = await gen(page, 'replaceFuse', 'genReplaceFuse', s);
      await pressAll(gridKeys(0, blown, 4, 8));
      await press('Enter');
      await wait(450);
      await press('Enter');
    },
    rechargeGenerator: async () => holdUntil(' ', flourish),
    lightLantern: async (s) => {
      const g = await gen(page, 'lightLantern', 'genLightLantern', s);
      for (let i = 0; i < g.strikes; i++) {
        await press(' ');
        await wait(420);
      }
      await hold(' ', 2000);
    },
    lightsPanel: async (s) => {
      let cur = 0;
      const sw = await gen(page, 'lightsPanel', 'genLightsPanel', s);
      for (let i = 0; i < sw.length; i++) {
        if (sw[i]) continue;
        await press('ArrowRight', i - cur);
        cur = i;
        await press('Enter');
      }
    },
    commsPanel: async (s) => {
      const g = await gen(page, 'commsPanel', 'genCommsPanel', s);
      const d = g.target - g.start;
      await press(d > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(d));
      await wait(1800);
    },
  };
}
