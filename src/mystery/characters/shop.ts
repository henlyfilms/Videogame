/**
 * Marion Mystery — the cosmetics shop economy (DOM-free, unit-tested).
 *
 * One place for every number:
 *  - the currency (Seeds) and what a new player starts with,
 *  - the price table: every catalog item is either free or has a rarity,
 *  - featured bundles (sets of priced items at a discount),
 *  - match earnings (what the local player gets at the end of a round),
 *  - wallet helpers: ownership, grandfathering, purchases.
 *
 * Seeds are earned only by playing. There is no real money, no way to buy
 * Seeds and no ads. Everything is stored per device in prefs.
 *
 * Ownership only limits the local player's wardrobe UI: bots
 * (`defaultCosmetics`, `randomCosmetics`, the Marion bot looks) and the
 * server's `sanitizeCosmetics` never look at it.
 */
import type { Cosmetics, PlayerStats } from '../core/types';
import { BACK, BERRIES, BROWS, defaultCosmetics, EMOTES, EYES, FACE, HAIR, HATS, MAX_EMOTES, MOUTHS, NAMEPLATES, OUTFITS, PATTERNS, PETS, VICTORY, type CatalogItem } from './catalog';

// ---------------------------------------------------------------------------
// Currency

export const CURRENCY = { name: 'Seeds', one: 'Seed' } as const;
/** A brand-new wallet (and a wallet migrated from before the shop) starts with this. */
export const STARTING_SEEDS = 60;
export const MAX_SEEDS = 99_999;

export function seedsLabel(n: number): string {
  return `${n} ${n === 1 ? CURRENCY.one : CURRENCY.name}`;
}

// ---------------------------------------------------------------------------
// Slots and the price table

/** Every cosmetic field that holds a catalog item (colours are always free). */
export type ShopSlot = 'berry' | 'pattern' | 'eyes' | 'brows' | 'mouth' | 'hair' | 'hat' | 'face' | 'outfit' | 'back' | 'pet' | 'nameplate' | 'emotes' | 'victory';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Tier = 'free' | Rarity;

export const SHOP_SLOTS: readonly ShopSlot[] = ['berry', 'pattern', 'eyes', 'brows', 'mouth', 'hair', 'hat', 'face', 'outfit', 'back', 'pet', 'nameplate', 'emotes', 'victory'];

export const SLOT_ITEMS: Record<ShopSlot, readonly CatalogItem[]> = {
  berry: BERRIES,
  pattern: PATTERNS,
  eyes: EYES,
  brows: BROWS,
  mouth: MOUTHS,
  hair: HAIR,
  hat: HATS,
  face: FACE,
  outfit: OUTFITS,
  back: BACK,
  pet: PETS,
  nameplate: NAMEPLATES,
  emotes: EMOTES,
  victory: VICTORY,
};

export const SLOT_LABEL: Record<ShopSlot, string> = {
  berry: 'Berry',
  pattern: 'Pattern',
  eyes: 'Eyes',
  brows: 'Brows',
  mouth: 'Mouth',
  hair: 'Hair',
  hat: 'Hat',
  face: 'Face accessory',
  outfit: 'Outfit',
  back: 'Back item',
  pet: 'Pet',
  nameplate: 'Nameplate',
  emotes: 'Emote',
  victory: 'Victory pose',
};

/** Seeds per rarity. */
export const RARITY_PRICE: Record<Rarity, number> = { common: 25, rare: 50, epic: 90, legendary: 150 };
export const RARITY_LABEL: Record<Tier, string> = { free: 'Free', common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };

/**
 * The price table. Each slot lists its priced items by rarity; anything not
 * listed is free. The starter look (`defaultCosmetics`) and roughly half of
 * every slot stay free (tests check both, and that every id here exists).
 */
const PRICED: Record<ShopSlot, Partial<Record<Rarity, readonly string[]>>> = {
  berry: { common: ['cranberry', 'gooseberry'], rare: ['elderberry', 'boysenberry', 'marionberry'], legendary: ['goldberry'] },
  pattern: { common: ['stars', 'hearts'], rare: ['zigzag', 'gradient'], epic: ['groovy'] },
  eyes: { common: ['cool', 'lashes', 'determined'], rare: ['sparkle', 'starry'], epic: ['cyclops'] },
  brows: { common: ['worried', 'raised'], rare: ['unibrow'] },
  mouth: { common: ['buck', 'tongue', 'gap'], rare: ['cat', 'fangs'] },
  hair: { common: ['wavy', 'braids', 'buns', 'pigtails', 'topknot', 'locs'], rare: ['mohawk', 'mullet', 'emo', 'pompadour'], epic: ['leafy'] },
  hat: {
    common: ['tophat', 'deerstalker', 'pirate', 'fez', 'aviator', 'tiara', 'froghat', 'sprout'],
    rare: ['crown', 'propeller', 'wizard', 'viking', 'starclip', 'boppers'],
    epic: ['cloud', 'spacehelmet', 'gemcrown'],
    legendary: ['halo'],
  },
  face: { common: ['goggles', 'mask', 'beard', 'clownnose'], rare: ['starglasses', 'heartglasses', '3dglasses'], epic: ['visor', 'vr'] },
  outfit: { common: ['labcoat', 'varsity', 'heartpin', 'vest', 'hawaiian'], rare: ['suit', 'puffer', 'trench', 'tux'], epic: ['spacesuit'], legendary: ['cape'] },
  back: { common: ['surfboard', 'shell', 'scuba'], rare: ['cape', 'fairywings'], epic: ['jetpack'], legendary: ['wings'] },
  pet: { common: ['frog', 'bee'], rare: ['cloud', 'robodog', 'ghosty'], epic: ['drone', 'axolotl'] },
  nameplate: { common: ['berryjam', 'leaf'], rare: ['aurora', 'neon'], epic: ['galaxy'], legendary: ['gold'] },
  emotes: { common: ['thumbsup', 'sit'], rare: ['think', 'cry'] },
  victory: { common: ['bow'], rare: ['moonwalk'], epic: ['confetti'] },
};

const TIER = new Map<string, Rarity>();
for (const slot of SHOP_SLOTS) {
  for (const [rarity, list] of Object.entries(PRICED[slot]) as [Rarity, readonly string[]][]) for (const id of list) TIER.set(itemKey(slot, id), rarity);
}

/** Stable key for an item: `slot:id` (e.g. `hat:tophat`). */
export function itemKey(slot: ShopSlot, id: string): string {
  return `${slot}:${id}`;
}

export function parseKey(key: string): { slot: ShopSlot; id: string } | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const slot = key.slice(0, i) as ShopSlot;
  const id = key.slice(i + 1);
  if (!SHOP_SLOTS.includes(slot) || !SLOT_ITEMS[slot].some((it) => it.id === id)) return null;
  return { slot, id };
}

export function tierOf(key: string): Tier {
  return TIER.get(key) ?? 'free';
}

/** Price in Seeds (0 = free). */
export function priceOf(key: string): number {
  const r = TIER.get(key);
  return r ? RARITY_PRICE[r] : 0;
}

export interface ShopItem {
  key: string;
  slot: ShopSlot;
  id: string;
  name: string;
  tier: Tier;
  price: number;
}

export function itemInfo(key: string): ShopItem | null {
  const p = parseKey(key);
  if (!p) return null;
  const it = SLOT_ITEMS[p.slot].find((x) => x.id === p.id)!;
  return { key, slot: p.slot, id: p.id, name: it.name, tier: tierOf(key), price: priceOf(key) };
}

/** Every item in a slot with its price (catalog order). */
export function slotItems(slot: ShopSlot): ShopItem[] {
  return SLOT_ITEMS[slot].map((it) => {
    const key = itemKey(slot, it.id);
    return { key, slot, id: it.id, name: it.name, tier: tierOf(key), price: priceOf(key) };
  });
}

/** Items that cost Seeds in a slot, cheapest first (shop order). */
export function shopItems(slot: ShopSlot): ShopItem[] {
  const order: Tier[] = ['common', 'rare', 'epic', 'legendary'];
  return slotItems(slot)
    .filter((i) => i.price > 0)
    .sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
}

export const ALL_PRICED_KEYS: readonly string[] = [...TIER.keys()];

// ---------------------------------------------------------------------------
// Featured bundles

export interface Bundle {
  id: string;
  name: string;
  blurb: string;
  items: readonly string[];
  /** Bundle price when nothing in it is owned yet. */
  price: number;
  /** Banner colours (gradient stops) and motif for the featured card. */
  colors: [string, string];
  motif: 'dots' | 'stripes' | 'waves' | 'stars';
}

export const BUNDLES: readonly Bundle[] = [
  { id: 'detective', name: 'Night Detective', blurb: 'For whoever is always first to the body.', items: ['hat:deerstalker', 'outfit:trench', 'pet:ghosty', 'nameplate:neon'], price: 120, colors: ['#3b2a5e', '#151a33'], motif: 'dots' },
  { id: 'pilot', name: 'Star Pilot', blurb: 'Helmet, suit, jetpack and a drone wingmate.', items: ['hat:spacehelmet', 'outfit:spacesuit', 'back:jetpack', 'pet:drone'], price: 250, colors: ['#1d5fa8', '#0b1d3a'], motif: 'stars' },
  { id: 'garden', name: 'Garden Party', blurb: 'Leafy hair, sprout hat and a bee friend.', items: ['hair:leafy', 'hat:sprout', 'back:fairywings', 'pet:bee', 'nameplate:leaf'], price: 150, colors: ['#4f9a2d', '#18451f'], motif: 'waves' },
  { id: 'royal', name: 'Royal Jam', blurb: 'Crowned, caped and golden.', items: ['hat:gemcrown', 'outfit:cape', 'nameplate:gold', 'victory:confetti'], price: 330, colors: ['#b0322f', '#4a0f22'], motif: 'stripes' },
];

export function bundleById(id: string): Bundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}

/** Sum of the bundle's items bought one by one. */
export function bundleFullPrice(b: Bundle): number {
  return b.items.reduce((s, k) => s + priceOf(k), 0);
}

const round5 = (n: number): number => Math.max(0, Math.round(n / 5) * 5);

/** What the bundle costs given what is already owned (0 = all owned). */
export function bundlePrice(b: Bundle, owned: Iterable<string>): number {
  const have = new Set(owned);
  const full = bundleFullPrice(b);
  const left = b.items.filter((k) => !have.has(k)).reduce((s, k) => s + priceOf(k), 0);
  if (left === 0) return 0;
  if (left === full) return b.price;
  return Math.max(5, round5((left * b.price) / full));
}

export function bundleDiscount(b: Bundle): number {
  return Math.round((1 - b.price / bundleFullPrice(b)) * 100);
}

// ---------------------------------------------------------------------------
// Ownership

export interface Wallet {
  seeds: number;
  /** Keys of priced items owned (free items are always owned). */
  owned: string[];
}

export function isOwned(owned: Iterable<string> | ReadonlySet<string>, key: string): boolean {
  if (priceOf(key) === 0) return true;
  if (owned instanceof Set) return owned.has(key);
  for (const k of owned) if (k === key) return true;
  return false;
}

/** Every item key the look uses (one per emote). */
export function wornKeys(c: Cosmetics): string[] {
  const out: string[] = [];
  for (const slot of SHOP_SLOTS) {
    if (slot === 'emotes') for (const e of c.emotes) out.push(itemKey('emotes', e));
    else out.push(itemKey(slot, String(c[slot])));
  }
  return out;
}

/** Clean a stored owned list: valid priced keys only, no duplicates. */
export function sanitizeOwned(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const lim = Math.min(raw.length, 1000);
  for (let i = 0; i < lim; i++) {
    const k: unknown = raw[i];
    if (typeof k === 'string' && TIER.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

export function sanitizeSeeds(raw: unknown, fallback = STARTING_SEEDS): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(MAX_SEEDS, Math.max(0, Math.floor(raw)));
}

/** Never lock what the player is wearing: priced items in the look become owned. */
export function grandfather(owned: readonly string[], c: Cosmetics): string[] {
  const out = [...owned];
  for (const k of wornKeys(c)) if (TIER.has(k) && !out.includes(k)) out.push(k);
  return out;
}

/** Equip one item on a look (try-on / after buying). Emotes join the wheel. */
export function applyItem(c: Cosmetics, key: string): Cosmetics {
  const p = parseKey(key);
  if (!p) return c;
  if (p.slot === 'emotes') {
    if (c.emotes.includes(p.id)) return c;
    const emotes = c.emotes.length < MAX_EMOTES ? [...c.emotes, p.id] : [...c.emotes.slice(0, MAX_EMOTES - 1), p.id];
    return { ...c, emotes };
  }
  return { ...c, [p.slot]: p.id } as Cosmetics;
}

export function applyItems(c: Cosmetics, keys: readonly string[]): Cosmetics {
  return keys.reduce(applyItem, c);
}

/** Swap anything locked in `c` for the fallback look's item (or the default). */
export function restrictToOwned(c: Cosmetics, owned: Iterable<string>, fallback: Cosmetics = defaultCosmetics()): Cosmetics {
  const have = new Set(owned);
  const def = defaultCosmetics();
  const out: Record<string, unknown> = { ...c };
  for (const slot of SHOP_SLOTS) {
    if (slot === 'emotes') continue;
    if (isOwned(have, itemKey(slot, String(c[slot])))) continue;
    const fb = String(fallback[slot]);
    out[slot] = isOwned(have, itemKey(slot, fb)) ? fb : def[slot];
  }
  let emotes = c.emotes.filter((e) => isOwned(have, itemKey('emotes', e)));
  if (!emotes.length) emotes = fallback.emotes.filter((e) => isOwned(have, itemKey('emotes', e)));
  if (!emotes.length) emotes = [...def.emotes];
  out.emotes = emotes;
  return out as unknown as Cosmetics;
}

export type PurchaseResult = { ok: true; wallet: Wallet; spent: number } | { ok: false; reason: 'owned' | 'funds' | 'invalid'; short?: number };

/** Spend `price` Seeds for `keys`. Never overspends; never charges for nothing. */
export function purchase(w: Wallet, keys: readonly string[], price: number): PurchaseResult {
  if (!keys.length || !Number.isFinite(price) || price < 0 || keys.some((k) => !TIER.has(k))) return { ok: false, reason: 'invalid' };
  const fresh = keys.filter((k) => !w.owned.includes(k));
  if (!fresh.length) return { ok: false, reason: 'owned' };
  if (price > w.seeds) return { ok: false, reason: 'funds', short: price - w.seeds };
  return { ok: true, spent: price, wallet: { seeds: w.seeds - price, owned: [...w.owned, ...fresh] } };
}

export function buyItem(w: Wallet, key: string): PurchaseResult {
  if (TIER.has(key) && w.owned.includes(key)) return { ok: false, reason: 'owned' };
  return purchase(w, [key], priceOf(key));
}

export function buyBundle(w: Wallet, id: string): PurchaseResult {
  const b = bundleById(id);
  if (!b) return { ok: false, reason: 'invalid' };
  return purchase(w, b.items, bundlePrice(b, w.owned));
}

// ---------------------------------------------------------------------------
// Match earnings (local player, at the end of a round)

/** Seeds per thing done in a match. Caps keep one long match from paying for everything. */
export const EARN = {
  /** For finishing a match at all. */
  played: 10,
  /** Per real task completed (fake murderer tasks don't count). */
  task: 3,
  taskCap: 10,
  /** Per elimination. */
  kill: 4,
  killCap: 5,
  /** Per body reported, sabotage fixed or correct vote. */
  assist: 2,
  assistCap: 8,
  /** Still alive when the match ended. */
  survived: 5,
  /** On the winning side. */
  win: 15,
  /** Named MVP. */
  mvp: 10,
} as const;

export interface EarnLine {
  id: 'played' | 'tasks' | 'kills' | 'assists' | 'survived' | 'win' | 'mvp';
  label: string;
  count?: number;
  amount: number;
}

export interface Earnings {
  lines: EarnLine[];
  total: number;
  /** Practice rounds pay nothing (the role is picked, so it would be farmable). */
  practice: boolean;
}

export interface EarnInput {
  stats?: Pick<PlayerStats, 'tasksDone' | 'kills' | 'bodiesReported' | 'fixes' | 'correctVotes'> & { alive?: boolean };
  won: boolean;
  mvp: boolean;
  practice?: boolean;
}

export function matchEarnings(i: EarnInput): Earnings {
  if (i.practice) return { lines: [], total: 0, practice: true };
  const s = i.stats;
  const lines: EarnLine[] = [{ id: 'played', label: 'Match played', amount: EARN.played }];
  const n = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const tasks = Math.min(EARN.taskCap, n(s?.tasksDone));
  if (tasks) lines.push({ id: 'tasks', label: 'Tasks done', count: tasks, amount: tasks * EARN.task });
  const kills = Math.min(EARN.killCap, n(s?.kills));
  if (kills) lines.push({ id: 'kills', label: 'Eliminations', count: kills, amount: kills * EARN.kill });
  const assists = Math.min(EARN.assistCap, n(s?.bodiesReported) + n(s?.fixes) + n(s?.correctVotes));
  if (assists) lines.push({ id: 'assists', label: 'Reports, fixes & good votes', count: assists, amount: assists * EARN.assist });
  if (s?.alive) lines.push({ id: 'survived', label: 'Survived', amount: EARN.survived });
  if (i.won) lines.push({ id: 'win', label: 'Victory bonus', amount: EARN.win });
  if (i.mvp) lines.push({ id: 'mvp', label: 'MVP', amount: EARN.mvp });
  return { lines, total: lines.reduce((t, l) => t + l.amount, 0), practice: false };
}

export function addSeeds(balance: number, n: number): number {
  return Math.min(MAX_SEEDS, Math.max(0, Math.floor(balance + n)));
}
