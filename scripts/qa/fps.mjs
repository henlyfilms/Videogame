// Frames per second in the menu and in a 2D match (sanity check for timing-based QA).
import { launch, openMystery, freeplay } from './lib.mjs';

const browser = await launch();
const { page } = await openMystery(browser, { label: 'fps', device: process.env.QA_DEVICE });
const fps = () =>
  page.evaluate(
    () =>
      new Promise((r) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < 2000) requestAnimationFrame(f);
          else r(n / 2);
        };
        requestAnimationFrame(f);
      }),
  );
console.log('menu fps', await fps());
await freeplay(page, { map: 'hq' });
console.log('match fps', await fps());
await browser.close();
