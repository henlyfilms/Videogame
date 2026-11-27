// Scratch probe: tapping a disabled (cooling-down) HUD action should still make a sound.
import { launch, openMystery, freeplay, traceMark, traceSince } from './lib.mjs';

const browser = await launch();
for (const device of [undefined, 'iPhone 13 landscape']) {
  const { page, errors } = await openMystery(browser, { label: 'probe', device });
  await freeplay(page, { map: 'hq', role: 'murderer' });
  const n = await traceMark(page);
  const b = page.locator('.mmh-actions button[disabled]').first();
  const box = await b.boundingBox();
  if (device) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  console.log(device ?? 'desktop', 'disabled tap →', await traceSince(page, n), errors);
  await page.context().close();
}
await browser.close();
