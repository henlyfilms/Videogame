// Pointer solvers (mouse or real touch via CDP) for every mini-game. Stage
// coordinates (480x360 viewBox) are mapped to the screen through the SVG's
// letterboxed box, the same way the games map pointers back (kit.svgPoint).
import { gen, modUrl } from './solvers.mjs';

export function pointerSolvers(page, mode = 'mouse') {
  let cdp = null;
  const wait = (ms) => page.waitForTimeout(ms);
  let st = null;
  const stage = async () => {
    const b = await page.locator('[data-minigame] svg.mmg-svg').first().boundingBox();
    const s = Math.min(b.width / 480, b.height / 360);
    st = { x: b.x + (b.width - 480 * s) / 2, y: b.y + (b.height - 360 * s) / 2, s };
    return st;
  };
  const scr = (x, y) => ({ x: st.x + x * st.s, y: st.y + y * st.s });
  const touch = async (type, p) => {
    if (!cdp) cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] : [] });
  };
  const downAt = async (p) => (mode === 'touch' ? touch('touchStart', p) : (await page.mouse.move(p.x, p.y), page.mouse.down()));
  const moveTo = async (p) => (mode === 'touch' ? touch('touchMove', p) : page.mouse.move(p.x, p.y));
  const upAt = async () => (mode === 'touch' ? touch('touchEnd', null) : page.mouse.up());
  // stage-coordinate helpers
  const tap = async (x, y) => {
    const p = scr(x, y);
    await downAt(p);
    await wait(40);
    await upAt(p);
    await wait(60);
  };
  const hold = async (x, y, ms) => {
    const p = scr(x, y);
    await downAt(p);
    await wait(ms);
    await upAt(p);
  };
  /** Press at pts[0], glide through the rest over `ms`, release (optionally after `dwell`). */
  const drag = async (pts, ms = 400, dwell = 0) => {
    const steps = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12));
      for (let k = 1; k <= n; k++) steps.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    await downAt(scr(pts[0].x, pts[0].y));
    const dt = ms / Math.max(1, steps.length);
    for (const s of steps) {
      await moveTo(scr(s.x, s.y));
      await wait(dt);
    }
    if (dwell) await wait(dwell);
    await upAt(scr(pts[pts.length - 1].x, pts[pts.length - 1].y));
    await wait(60);
  };
  /** Centres (stage coords) of the game's clickable targets, in DOM order. */
  const hits = async (sel = '.mmg-hit') =>
    (await page.$$eval(`[data-minigame] ${sel}`, (els) => els.map((e) => ({ r: e.getBoundingClientRect(), l: e.getAttribute('aria-label') })))).map(({ r, l }) => ({
      x: (r.x + r.width / 2 - st.x) / st.s,
      y: (r.y + r.height / 2 - st.y) / st.s,
      l,
    }));
  const tapHit = async (h) => tap(h.x, h.y);
  const status = () => page.evaluate(() => document.querySelector('[data-minigame] .mmg-sr')?.textContent ?? '');
  const pct = async () => Number(/(\d+) percent/.exec(await status())?.[1] ?? 0);
  const flourish = () => page.evaluate(() => !!document.querySelector('.mmg-done') || !document.querySelector('[data-minigame]'));

  const S = {
    stampMail: async (s) => {
      const h = await hits(); // [bin, stamp]
      for (const l of await gen(page, 'stampMail', 'genStampMail', s)) {
        await tapHit(h[l.good ? 1 : 0]);
        await wait(950);
      }
    },
    sortClips: async (s) => {
      const clips = await gen(page, 'sortClips', 'genSortClips', s);
      for (let i = 0; i < clips.length; i++) {
        const keep = clips[i].keep;
        if (i % 2 === 0) await drag([{ x: 240, y: 168 }, { x: keep ? 90 : 390, y: 170 }], 260);
        else await tap(keep ? 69 : 411, 187);
        await wait(600);
      }
    },
    distillReel: async (s) => {
      const g = await gen(page, 'distillReel', 'genDistillReel', s);
      await tap([70, 160, 250][g.target], 282);
      await wait(1000);
      await drag([{ x: 452, y: 114 }, { x: 452, y: 275 }], 400);
    },
    slotCartridge: async (s) => {
      const g = await gen(page, 'slotCartridge', 'genSlotCartridge', s);
      const h = await hits();
      for (const c of g.carts) {
        await tapHit(h[g.slots.indexOf(c.shape)]);
        await wait(1050);
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
      const T = 56;
      const GX = 240 - (6 * T) / 2;
      for (let i = 0; i < g.need.length; i++) {
        const c = g.need[i].cell;
        for (let k = 0; k < g.ks[i]; k++) await tap(GX + (c % 6) * T + T / 2, 78 + Math.floor(c / 6) * T + T / 2);
      }
    },
    calibrateTurntable: async (s) => {
      const g = await gen(page, 'calibrateTurntable', 'genTurntable', s);
      const y = (b) => 300 - ((b - 50) / 44) * 226;
      await drag([{ x: 404, y: y(g.start) }, { x: 404, y: y(72) }], 500, 150);
      await wait(2600);
    },
    sortBerries: async (s) => {
      const bins = await page.evaluate(async ([u, seed]) => {
        const m = await import(u);
        return m.genSortBerries(seed).map((b) => m.binOf(b.ripe));
      }, [modUrl('sortBerries'), s]);
      const h = await hits();
      for (const b of bins) {
        await tapHit(h[b]);
        await wait(700);
      }
    },
    juicePress: async () => {
      const pts = [];
      for (let a = 0; a <= Math.PI * 2 * 4; a += 0.35) pts.push({ x: 392 + Math.cos(a) * 46, y: 178 + Math.sin(a) * 46 });
      await drag(pts, 3200);
    },
    alignDish: async (s) => {
      const g = await gen(page, 'alignDish', 'genAlignDish', s);
      const a = (g.target * Math.PI) / 180;
      const r = 90;
      await drag([{ x: 168 + Math.sin(((g.start) * Math.PI) / 180) * r, y: 268 - Math.cos(((g.start) * Math.PI) / 180) * r }, { x: 168 + Math.sin(a) * r, y: 268 - Math.cos(a) * r }], 500, 1400);
    },
    fuelCan: async () => hold(240, 320, 3300),
    fuelEngine: async () => hold(385, 155, 3400),
    fixWiring: async (s) => {
      const g = await gen(page, 'fixWiring', 'genFixWiring', s);
      for (let i = 0; i < 4; i++) {
        const j = g.right.indexOf(g.left[i]);
        await drag([{ x: 74, y: 88 + i * 66 }, { x: 240, y: 88 + (i + j) * 33 }, { x: 406, y: 88 + j * 66 }], 350);
        await wait(150);
      }
    },
    swipeBadge: async () => {
      // Wall-clock paced swipe: ~0.6 s from the reader's mouth to its end (window 0.32–1.1 s).
      for (let tries = 0; tries < 3 && !(await flourish()); tries++) {
        await downAt(scr(130, 86));
        await moveTo(scr(60, 171));
        const t0 = Date.now();
        for (;;) {
          const k = Math.min(1, (Date.now() - t0) / 600);
          await moveTo(scr(60 + 375 * k, 171));
          if (k >= 1) break;
          await wait(16);
        }
        await upAt();
        await wait(1200);
      }
    },
    waterPlants: async (s) => {
      const g = await gen(page, 'waterPlants', 'genWaterPlants', s);
      for (let i = 0; i < 3; i++) {
        // press and hold, release once the level passes the line (frame-rate independent)
        await downAt(scr([96, 240, 384][i], 262));
        const t0 = Date.now();
        while (Date.now() - t0 < 6000 && (await pct()) < Math.round(g.pots[i].line * 100) + 3) await wait(25);
        await upAt();
        await wait(900);
      }
    },
    cleanFilter: async (s) => {
      for (const d of await gen(page, 'cleanFilter', 'genCleanFilter', s)) {
        await drag([{ x: d.x, y: d.y }, { x: d.x < 240 ? 30 : 450, y: d.y }], 250);
        await wait(350);
      }
    },
    download: async () => tap(240, 322),
    upload: async () => tap(240, 322),
    unlockManifold: async (s) => {
      const grid = await gen(page, 'unlockManifold', 'genUnlockManifold', s);
      const h = await hits();
      for (let n = 1; n <= 10; n++) await tapHit(h[grid.indexOf(n)]);
    },
    simonSays: async (s) => {
      const seq = await gen(page, 'simonSays', 'genSimonSays', s);
      const pb = await page.evaluate(async (u) => {
        const m = await import(u);
        return [0, 1, 2, 3, 4, 5].map((r) => m.simonPlaybackMs(r));
      }, modUrl('simonSays'));
      const pad = (i) => ({ x: 192 + (i % 3) * 88 + 39, y: 70 + Math.floor(i / 3) * 88 + 39 });
      for (let r = 0; r < seq.length; r++) {
        await wait((r ? 450 : 0) + pb[r] + 250);
        for (let i = 0; i <= r; i++) await tap(pad(seq[i]).x, pad(seq[i]).y);
      }
    },
    keypadCode: async (s) => {
      const key = (i) => ({ x: 250 + (i % 3) * 73 + 32, y: 112 + Math.floor(i / 3) * 59 + 25 });
      for (const d of await gen(page, 'keypadCode', 'genKeypadCode', s)) {
        const k = key(d === '0' ? 10 : Number(d) - 1);
        await tap(k.x, k.y);
      }
      await tap(key(11).x, key(11).y);
    },
    emptyChute: async () => {
      const [h] = await hits('.mmg-grab');
      await hold(h.x, h.y, 3300);
    },
    medScan: async () => {
      await tap(371, 320);
      await wait(7200);
    },
    primeShields: async (s) => {
      const red = await gen(page, 'primeShields', 'genPrimeShields', s);
      const h = await hits();
      for (let i = 0; i < red.length; i++) if (red[i]) await tapHit(h.find((x) => x.l?.startsWith(`hex ${i + 1} `)));
    },
    chartCourse: async (s) => {
      const g = await gen(page, 'chartCourse', 'genChartCourse', s);
      await drag([g.start, ...g.wps], 1400);
    },
    replaceFuse: async (s) => {
      const { blown } = await gen(page, 'replaceFuse', 'genReplaceFuse', s);
      const h = await hits();
      await tapHit(h[blown]);
      await wait(450);
      await tapHit(h[blown]);
    },
    rechargeGenerator: async () => {
      const [h] = await hits('.mmg-grab');
      await hold(h.x, h.y, 3400);
    },
    lightLantern: async (s) => {
      const g = await gen(page, 'lightLantern', 'genLightLantern', s);
      for (let i = 0; i < g.strikes * 3 && /Strike/.test(await status()); i++) {
        await tap(70, 278);
        await wait(450);
      }
      await downAt(scr(150, 200));
      for (let k = 1; k <= 10; k++) await moveTo(scr(150 + 18.2 * k, 200 - 0.4 * k));
      const t0 = Date.now();
      while (Date.now() - t0 < 5000 && !(await flourish())) {
        await moveTo(scr(332 + (Date.now() % 2), 196)); // keep the match at the wick
        await wait(40);
      }
      await upAt();
    },
    lightsPanel: async (s) => {
      const sw = await gen(page, 'lightsPanel', 'genLightsPanel', s);
      const h = await hits();
      for (let i = 0; i < sw.length; i++) if (!sw[i]) await tapHit(h[i]);
    },
    commsPanel: async (s) => {
      const g = await gen(page, 'commsPanel', 'genCommsPanel', s);
      const d = g.target - g.start;
      for (let i = 0; i < Math.abs(d); i++) await tap(d > 0 ? 427 : 359, 286);
      await wait(1800);
    },
  };
  // Every solver first measures the stage.
  return Object.fromEntries(Object.entries(S).map(([k, f]) => [k, async (s) => (await stage(), f(s))]));
}
