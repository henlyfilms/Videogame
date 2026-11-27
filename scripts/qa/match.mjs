// A real (non-practice) solo match against Marion bots, cut short, to check the
// lobby countdown, role reveal, results board and Seeds earned (with sounds).
//   node scripts/qa/match.mjs
import { launch, openMystery, srv, traceMark, traceSince, SHOTS, sleep } from './lib.mjs';

const browser = await launch();
const { page, errors } = await openMystery(browser, { label: 'match', prefs: { seeds: 100 } });
const counts = (tr) => Object.entries(tr.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).filter(([k]) => !k.startsWith('step.')).map(([k, v]) => (v > 1 ? `${k}x${v}` : k)).join(' ');
let n = await traceMark(page);
await page.evaluate(() => window.__mm.store.getState().startSolo());
await page.waitForFunction(() => window.__mm.store.getState().room?.stage === 'lobby', null, { timeout: 15000 });
await sleep(1500);
await page.evaluate(() => window.__mm.store.getState().send({ t: 'host.start' }));
await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'play', null, { timeout: 30000 });
console.log('lobby → countdown → reveal:', counts(await traceSince(page, n)));
await sleep(3000);
const seeds0 = (await page.evaluate(() => window.__mm.store.getState().prefs.seeds));
n = await traceMark(page);
// End the match: run the clock out.
await srv(page, `st.timeLimit = st.t + 1;`);
await page.waitForFunction(() => window.__mm.store.getState().snap?.phase === 'ended', null, { timeout: 20000 });
await sleep(6000);
await page.screenshot({ path: `${SHOTS}/match-results.png` });
const seeds1 = await page.evaluate(() => window.__mm.store.getState().prefs.seeds);
console.log('results:', counts(await traceSince(page, n)));
console.log(`seeds ${seeds0} → ${seeds1}`);
n = await traceMark(page);
// Back to the waiting room through the results buttons if present.
const back = page.locator('button', { hasText: /again|lobby|waiting room/i }).first();
if (await back.count()) await back.click();
await sleep(2000);
console.log('after results:', counts(await traceSince(page, n)));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
