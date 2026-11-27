import { afterEach, describe, expect, it } from 'vitest';
import { defaultCosmetics, MARION_BOT_LOOKS, randomCosmetics, sanitizeCosmetics } from '../../src/mystery/characters/catalog';
import {
  ALL_PRICED_KEYS,
  applyItem,
  BUNDLES,
  bundleDiscount,
  bundleFullPrice,
  bundlePrice,
  buyBundle,
  buyItem,
  EARN,
  grandfather,
  isOwned,
  itemKey,
  matchEarnings,
  parseKey,
  priceOf,
  purchase,
  RARITY_PRICE,
  restrictToOwned,
  sanitizeOwned,
  sanitizeSeeds,
  SHOP_SLOTS,
  shopItems,
  SLOT_ITEMS,
  slotItems,
  STARTING_SEEDS,
  wornKeys,
  type Wallet,
} from '../../src/mystery/characters/shop';
import { defaultPrefs, loadPrefs, savePrefs } from '../../src/mystery/client/prefs';

describe('shop price table', () => {
  it('gives every catalog item a price or marks it free, with valid keys only', () => {
    const all = new Set<string>();
    for (const slot of SHOP_SLOTS) {
      for (const it of SLOT_ITEMS[slot]) {
        const key = itemKey(slot, it.id);
        all.add(key);
        const p = priceOf(key);
        expect(p === 0 || Object.values(RARITY_PRICE).includes(p), key).toBe(true);
        expect(parseKey(key)).toEqual({ slot, id: it.id });
      }
    }
    // Every priced key is a real catalog item.
    for (const k of ALL_PRICED_KEYS) expect(all.has(k), k).toBe(true);
    expect(parseKey('hat:nope')).toBeNull();
    expect(parseKey('nope:tophat')).toBeNull();
  });

  it('keeps the starter look free and about half of every slot free', () => {
    for (const k of wornKeys(defaultCosmetics())) expect(priceOf(k), k).toBe(0);
    for (const slot of SHOP_SLOTS) {
      const items = slotItems(slot);
      const free = items.filter((i) => i.price === 0).length;
      expect(free / items.length, slot).toBeGreaterThanOrEqual(0.4);
      expect(free / items.length, slot).toBeLessThanOrEqual(0.7);
      expect(shopItems(slot).length, slot).toBe(items.length - free);
    }
  });

  it('bundles hold only priced items and are discounted', () => {
    expect(BUNDLES.length).toBeGreaterThanOrEqual(2);
    expect(BUNDLES.length).toBeLessThanOrEqual(4);
    for (const b of BUNDLES) {
      for (const k of b.items) expect(priceOf(k), k).toBeGreaterThan(0);
      expect(b.price).toBeLessThan(bundleFullPrice(b));
      expect(bundleDiscount(b)).toBeGreaterThan(0);
      expect(bundlePrice(b, [])).toBe(b.price);
      expect(bundlePrice(b, b.items)).toBe(0);
      const partial = bundlePrice(b, [b.items[0]!]);
      expect(partial).toBeGreaterThan(0);
      expect(partial).toBeLessThan(b.price);
    }
  });

  it('bots are not limited by ownership', () => {
    // Bot looks come straight from the catalog and still sanitize to themselves.
    for (let s = 0; s < 40; s++) {
      const c = randomCosmetics(s);
      expect(sanitizeCosmetics(c)).toEqual(c);
    }
    expect(Object.values(MARION_BOT_LOOKS).some((c) => wornKeys(c).some((k) => priceOf(k) > 0))).toBe(true);
    for (const c of Object.values(MARION_BOT_LOOKS)) expect(sanitizeCosmetics(c)).toEqual(c);
  });
});

describe('match earnings', () => {
  const stats = { tasksDone: 0, kills: 0, bodiesReported: 0, fixes: 0, correctVotes: 0, alive: false };
  it('pays a base for playing', () => {
    const e = matchEarnings({ stats, won: false, mvp: false });
    expect(e.total).toBe(EARN.played);
    expect(e.lines.map((l) => l.id)).toEqual(['played']);
  });
  it('adds tasks, kills, assists, survival, win and MVP', () => {
    const e = matchEarnings({ stats: { tasksDone: 4, kills: 2, bodiesReported: 1, fixes: 1, correctVotes: 1, alive: true }, won: true, mvp: true });
    expect(e.total).toBe(EARN.played + 4 * EARN.task + 2 * EARN.kill + 3 * EARN.assist + EARN.survived + EARN.win + EARN.mvp);
    expect(e.lines.reduce((s, l) => s + l.amount, 0)).toBe(e.total);
  });
  it('caps per-match counts and ignores junk', () => {
    const e = matchEarnings({ stats: { tasksDone: 99, kills: 50, bodiesReported: 40, fixes: NaN, correctVotes: -3, alive: false }, won: false, mvp: false });
    expect(e.total).toBe(EARN.played + EARN.taskCap * EARN.task + EARN.killCap * EARN.kill + EARN.assistCap * EARN.assist);
    expect(matchEarnings({ won: false, mvp: false }).total).toBe(EARN.played);
  });
  it('practice rounds pay nothing', () => {
    const e = matchEarnings({ stats: { ...stats, tasksDone: 5, alive: true }, won: true, mvp: true, practice: true });
    expect(e).toEqual({ lines: [], total: 0, practice: true });
  });
});

describe('purchases', () => {
  const w = (seeds: number, owned: string[] = []): Wallet => ({ seeds, owned });
  it('buys an item, spends exactly its price and marks it owned', () => {
    const r = buyItem(w(100), 'hat:tophat');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spent).toBe(priceOf('hat:tophat'));
    expect(r.wallet.seeds).toBe(100 - priceOf('hat:tophat'));
    expect(isOwned(r.wallet.owned, 'hat:tophat')).toBe(true);
  });
  it('never overspends', () => {
    const r = buyItem(w(priceOf('hat:halo') - 1), 'hat:halo');
    expect(r).toEqual({ ok: false, reason: 'funds', short: 1 });
    const b = BUNDLES[0]!;
    expect(buyBundle(w(b.price - 5), b.id)).toMatchObject({ ok: false, reason: 'funds', short: 5 });
    expect(purchase(w(10), ['hat:tophat'], -5)).toEqual({ ok: false, reason: 'invalid' });
  });
  it('does not charge twice or for free/unknown items', () => {
    expect(buyItem(w(500, ['hat:tophat']), 'hat:tophat')).toEqual({ ok: false, reason: 'owned' });
    expect(buyItem(w(500), 'hat:none').ok).toBe(false);
    expect(buyItem(w(500), 'hat:bogus').ok).toBe(false);
    expect(buyBundle(w(500), 'nope').ok).toBe(false);
  });
  it('bundles charge only for what is missing', () => {
    const b = BUNDLES[0]!;
    const have = [b.items[0]!];
    const r = buyBundle(w(1000, have), b.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spent).toBe(bundlePrice(b, have));
    expect(new Set(r.wallet.owned)).toEqual(new Set(b.items));
    expect(buyBundle(r.wallet, b.id)).toEqual({ ok: false, reason: 'owned' });
  });
  it('equips items and keeps emote wheels within the limit', () => {
    const c = applyItem(defaultCosmetics(), 'hat:halo');
    expect(c.hat).toBe('halo');
    const e = applyItem(defaultCosmetics(), 'emotes:cry');
    expect(e.emotes).toContain('cry');
    expect(e.emotes.length).toBeLessThanOrEqual(8);
    expect(sanitizeCosmetics(e)).toEqual(e);
  });
  it('restricts a random look to owned items', () => {
    for (let s = 0; s < 30; s++) {
      const c = restrictToOwned(randomCosmetics(s), [], defaultCosmetics());
      for (const k of wornKeys(c)) expect(priceOf(k), k).toBe(0);
      expect(sanitizeCosmetics(c)).toEqual(c);
    }
    const kept = restrictToOwned({ ...defaultCosmetics(), hat: 'halo' }, ['hat:halo']);
    expect(kept.hat).toBe('halo');
  });
  it('grandfathers worn items and sanitizes stored lists', () => {
    const look = { ...defaultCosmetics(), hat: 'halo', emotes: ['wave', 'cry'] };
    expect(new Set(grandfather([], look))).toEqual(new Set(['hat:halo', 'emotes:cry']));
    expect(sanitizeOwned(['hat:halo', 'hat:halo', 'hat:none', 'x', 3, null])).toEqual(['hat:halo']);
    expect(sanitizeOwned('hat:halo')).toEqual([]);
    expect(sanitizeSeeds(12.9)).toBe(12);
    expect(sanitizeSeeds(-4)).toBe(0);
    expect(sanitizeSeeds('lots')).toBe(STARTING_SEEDS);
    expect(sanitizeSeeds(undefined)).toBe(STARTING_SEEDS);
  });
});

describe('prefs wallet migration', () => {
  afterEach(() => localStorage.clear());
  it('fresh prefs start with the starter Seeds and nothing priced', () => {
    localStorage.clear();
    const p = loadPrefs();
    expect(p.seeds).toBe(STARTING_SEEDS);
    expect(p.owned).toEqual([]);
  });
  it('migrates a stored object without the new fields and grandfathers what is worn', () => {
    const old = { ...defaultPrefs() } as Record<string, unknown>;
    delete old.seeds;
    delete old.owned;
    old.cosmetics = { ...defaultCosmetics(), hat: 'halo', outfit: 'cape', pet: 'drone' };
    old.name = 'Pip';
    localStorage.setItem('marion-mystery:v1', JSON.stringify(old));
    const p = loadPrefs();
    expect(p.name).toBe('Pip');
    expect(p.seeds).toBe(STARTING_SEEDS);
    expect(new Set(p.owned)).toEqual(new Set(['hat:halo', 'outfit:cape', 'pet:drone']));
    expect(p.cosmetics.hat).toBe('halo');
  });
  it('round-trips the wallet and drops junk', () => {
    const p = { ...defaultPrefs(), seeds: 321, owned: ['hat:tophat', 'pet:bee'] };
    savePrefs(p);
    const q = loadPrefs();
    expect(q.seeds).toBe(321);
    expect(q.owned).toEqual(['hat:tophat', 'pet:bee']);
    localStorage.setItem('marion-mystery:v1', JSON.stringify({ ...p, seeds: 'x', owned: [42, 'hat:fake', 'hat:halo'] }));
    const r = loadPrefs();
    expect(r.seeds).toBe(STARTING_SEEDS);
    expect(r.owned).toEqual(['hat:halo']);
  });
});
