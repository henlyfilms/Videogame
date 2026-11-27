// Offline level check: render every sfx name (and each hold loop) through the
// real mixing graph (UI/SFX buses → compressor → limiter) into an
// OfflineAudioContext and print peak / RMS in dBFS. Flags anything that
// drives the limiter (peak > -1 dBFS) or is far quieter/louder than its peers.
//   node scripts/qa/levels.mjs
import { readFileSync } from 'node:fs';
import { launch, BASE } from './lib.mjs';

const src = readFileSync(new URL('../../src/mystery/audio/sfx.ts', import.meta.url), 'utf8');
const names = [...src.matchAll(/case '([a-zA-Z][\w.]*)':/g)].map((m) => m[1]).filter((n) => !['step'].includes(n) && !/^(kill|shot|misfire|vent|sabotage|fixed|task|visual|shield\.hit|gun\.pickup|poison|track|blackout|final|inspect|gun\.drop|flicker|leave)$/.test(n) || ['kill', 'shot', 'misfire', 'vent', 'sabotage', 'fixed', 'poison', 'track', 'blackout', 'inspect', 'flicker', 'leave'].includes(n));
const holds = ['pour', 'crank', 'scan', 'lever', 'charge', 'burn'];
const uniq = [...new Set(names)].filter((n) => !holds.includes(n));

const browser = await launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/?mystery&debug=1`);
await page.waitForFunction(() => !!window.__mmSfx);
const res = await page.evaluate(
  async ([names, holds]) => {
    const { engine } = await import('/src/mystery/audio/engine.ts');
    const sfx = window.__mmSfx;
    const out = [];
    const measure = async (label, fire, secs = 2) => {
      const ctx = new OfflineAudioContext(2, 48000 * secs, 48000);
      engine.attach(ctx);
      sfx.configure({ muted: false, volume: 0.8, music: 0.5 });
      // apply() uses setTargetAtTime from t=0; give the gains their values at once
      engine.buses.sfx.gain.value = 0.8;
      engine.buses.ui.gain.value = 0.56;
      engine.buses.master.gain.value = 1;
      const stop = fire();
      const buf = await ctx.startRendering();
      if (typeof stop === 'function') stop();
      let peak = 0;
      let sum = 0;
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const v = Math.abs(d[i]);
          if (v > peak) peak = v;
          sum += v * v;
        }
      }
      const rms = Math.sqrt(sum / (buf.length * 2));
      out.push({ label, peak: 20 * Math.log10(peak || 1e-9), rms: 20 * Math.log10(rms || 1e-9) });
    };
    for (const n of names) await measure(n, () => sfx.play(n, undefined));
    for (const g of [0, 0.5, 1]) await measure(`task.good(${g})`, () => sfx.task('good', g));
    // hold loops: intervals don't run in offline time, so this is the bed + first tick
    for (const h of holds) await measure(`hold.${h}`, () => sfx.hold(h), 1);
    return out;
  },
  [uniq, holds],
);
const loud = res.filter((r) => r.peak > -1);
const silent = res.filter((r) => r.peak < -60);
for (const r of res.sort((a, b) => b.peak - a.peak)) console.log(`${r.label.padEnd(18)} peak ${r.peak.toFixed(1).padStart(6)} dBFS   rms ${r.rms.toFixed(1).padStart(6)} dBFS${r.peak > -1 ? '   << limiter' : ''}${r.peak < -60 ? '   << silent' : ''}`);
console.log(`\n${res.length} sounds; hitting the limiter: ${loud.map((r) => r.label).join(', ') || 'none'}; silent: ${silent.map((r) => r.label).join(', ') || 'none'}`);
await browser.close();
