// Shop purchase flow: buy an item, buy a bundle, not enough Seeds, locked item in
// the lobby wardrobe (quick buy), with the sounds each step makes.
//   node scripts/qa/shop.mjs
import { launch, openMystery, traceMark, traceSince, SHOTS, sleep } from './lib.mjs';

const browser = await launch();
const rows = [];
async function step(page, errors, name, fn, expect = []) {
  const n = await traceMark(page);
  const e0 = errors.length;
  let err = '';
  try {
    await fn();
  } catch (e) {
    err = String(e.message ?? e).split('\n')[0];
  }
  await sleep(700);
  const s = [...new Set(await traceSince(page, n))];
  const missing = expect.filter((x) => !s.includes(x));
  const ok = !err && !missing.length && errors.length === e0;
  rows.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(40)} ${s.join(' ')}${missing.length ? `  MISSING: ${missing}` : ''}${err ? `  ERR: ${err}` : ''}${errors.length > e0 ? `  CONSOLE: ${errors.slice(e0).join(' | ')}` : ''}`);
}
const prefs = (page) => page.evaluate(() => window.__mm.store.getState().prefs);

for (const dev of [null, 'iPhone 13 landscape']) {
  const tag = dev ? 'phone' : 'desk';
  const { page, errors } = await openMystery(browser, { label: `shop-${tag}`, device: dev ?? undefined, prefs: { seeds: 400, owned: [] } });
  const click = (loc) => (dev ? loc.tap() : loc.click());
  await page.evaluate(() => window.__mm.store.getState().setScreen('wardrobe'));
  await page.waitForSelector('#mmw-tab-shop', { timeout: 8000 });
  await click(page.locator('#mmw-tab-shop'));
  await page.waitForSelector('.mmsh-purchase', { timeout: 8000 });
  await page.screenshot({ path: `${SHOTS}/shop-${tag}.png` });
  // Find the cheapest item and the priciest one that's out of reach.
  await click(page.locator('.mmce-tabs [role="tab"]').nth(1));
  await sleep(400);
  await step(page, errors, `${tag}: try on an item`, async () => {
    await click(page.locator('[data-item]:visible').nth(1));
  }, ['shop.try']);
  const before = (await prefs(page)).seeds;
  await step(page, errors, `${tag}: buy item (confirm)`, async () => {
    const items = page.locator('[data-item]:visible');
    const n = await items.count();
    let bought = false;
    for (let i = 0; i < n && !bought; i++) {
      await click(items.nth(i));
      await sleep(150);
      const b = page.locator('.mmsh-purchase[data-kind="buy"]:not([disabled])');
      if (!(await b.count())) continue;
      await click(b);
      await page.waitForSelector('.mmsh-confirm-buy', { timeout: 3000 });
      await click(page.locator('.mmsh-confirm-buy'));
      bought = true;
    }
    if (!bought) throw new Error('nothing affordable');
    await sleep(400);
    const after = await prefs(page);
    if (!(after.seeds < before) || !after.owned.length) throw new Error(`seeds ${before}→${after.seeds}, owned ${after.owned.length}`);
  }, ['ui.open', 'shop.buy']);
  await step(page, errors, `${tag}: not enough Seeds`, async () => {
    await page.evaluate(() => window.__mm.store.getState().setPrefs({ seeds: 3 }));
    await click(page.locator('.mmce-tabs [role="tab"]').nth(2));
    await sleep(300);
    const items = page.locator('[data-item]:visible');
    const n = await items.count();
    for (let i = 0; i < n; i++) {
      await click(items.nth(i));
      await sleep(120);
      if (await page.locator('.mmsh-why[data-short="true"]').count()) break;
    }
    const b = page.locator('.mmsh-purchase');
    if (await b.isDisabled()) {
      // disabled buy: the reason line must say why
      const why = await page.locator('.mmsh-why').textContent();
      if (!why || !/Seeds|more/i.test(why)) throw new Error(`no reason shown: ${why}`);
      await b.click({ force: true });
    } else {
      await click(b);
      await page.waitForSelector('.mmsh-confirm', { timeout: 3000 });
      if (!(await page.locator('.mmsh-confirm-short').count())) throw new Error('no shortfall note');
      await page.keyboard.press('Escape');
    }
  }, []);
  await step(page, errors, `${tag}: buy a bundle`, async () => {
    await page.evaluate(() => window.__mm.store.getState().setPrefs({ seeds: 99999 }));
    const tab = page.locator('.mmce-tabs [role="tab"]').first();
    await click(tab);
    const bundle = page.locator('.mmsh-bundle').first();
    await click(bundle);
    await click(page.locator('.mmsh-purchase'));
    await page.waitForSelector('.mmsh-confirm-buy', { timeout: 3000 });
    await click(page.locator('.mmsh-confirm-buy'));
  }, ['shop.try', 'shop.buy']);
  await step(page, errors, `${tag}: wardrobe tab, equip owned`, async () => {
    await click(page.locator('#mmw-tab-wardrobe'));
    await sleep(500);
    const it = page.locator('.mmce-item:not(.locked)').nth(2);
    await click(it);
  }, ['ui.equip']);
  await step(page, errors, `${tag}: wardrobe locked item → shop.locked`, async () => {
    await page.evaluate(() => window.__mm.store.getState().setPrefs({ owned: [] }));
    await sleep(300);
    const it = page.locator('.mmce-item.locked').first();
    await click(it);
  }, ['shop.locked']);
  await page.screenshot({ path: `${SHOTS}/shop-${tag}-locked.png` });
  // Lobby wardrobe quick-buy
  await page.evaluate(() => window.__mm.store.getState().setScreen('title'));
  await step(page, errors, `${tag}: lobby wardrobe locked → quick buy`, async () => {
    await page.evaluate(() => window.__mm.store.getState().setPrefs({ seeds: 99999, owned: [] }));
    await page.evaluate(() => window.__mm.store.getState().startSolo());
    await page.waitForFunction(() => window.__mm.store.getState().room?.stage === 'lobby', null, { timeout: 15000 });
    await sleep(800);
    // open the wardrobe from the lobby (W station or the button)
    const wb = page.locator('button[aria-label*="ardrobe"], button:has-text("Wardrobe")').first();
    await click(wb);
    await page.waitForSelector('.mmce-item.locked', { timeout: 5000 });
    await click(page.locator('.mmce-item.locked').first());
    await page.waitForSelector('.mmsh-confirm-buy', { timeout: 3000 });
    await click(page.locator('.mmsh-confirm-buy'));
  }, ['shop.locked', 'shop.buy']);
  await page.screenshot({ path: `${SHOTS}/shop-${tag}-quickbuy.png` });
  console.log(`${tag} console errors: ${errors.length ? errors.join('\n') : 'none'}`);
  await page.context().close();
}
console.log(`${rows.filter(Boolean).length}/${rows.length} passed`);
await browser.close();
