/**
 * Marion Mystery — the cosmetics Shop (Wardrobe screen's first tab).
 *
 * Layout follows the reference flow (category list on the left, a 4×4 item
 * grid with prices, a big live preview on the right with a pill Purchase
 * button, a Seeds counter in the top bar, bundles as wide banner cards on
 * Featured) with original names, art and wording. Prices, bundles and the
 * wallet rules live in `characters/shop.ts`.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { sanitizeCosmetics } from '../characters/catalog';
import {
  applyItem,
  applyItems,
  BUNDLES,
  bundleDiscount,
  bundleFullPrice,
  bundlePrice,
  CURRENCY,
  isOwned,
  itemInfo,
  purchase,
  RARITY_LABEL,
  shopItems,
  SLOT_LABEL,
  type Bundle,
  type Earnings,
  type ShopSlot,
} from '../characters/shop';
import { sfx } from '../audio/sfx';
import { useMystery } from '../client/store';
import { EDITOR_CSS, Grid, PreviewCanvas, slotThumb } from './CustomizeEditor';
import { MIcon, SeedGlyph } from './common';
import { Bump, Tick } from './kit';

// ---------------------------------------------------------------------------
// Seeds counter (top bar)

export function SeedCounter({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`mmsh-wallet ${className}`} role="status" aria-label={`${value} ${CURRENCY.name}`}>
      <Bump value={value} className="mmsh-wallet-glyph">
        <SeedGlyph size={26} />
      </Bump>
      <span className="mmsh-wallet-n">
        <Tick value={value} ms={700} />
      </span>
      <span className="mmsh-wallet-unit">{CURRENCY.name}</span>
    </div>
  );
}

function Price({ value, was, short }: { value: number; was?: number; short?: boolean }) {
  return (
    <span className={`mmsh-price${short ? ' short' : ''}`}>
      <SeedGlyph size={20} />
      {was && was > value ? <s>{was}</s> : null}
      <b>{value}</b>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Buy confirmation (also used from the lobby wardrobe)

interface ConfirmProps {
  title: string;
  detail?: string;
  keys: readonly string[];
  price: number;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmBuy({ title, detail, keys, price, onConfirm, onCancel }: ConfirmProps) {
  const seeds = useMystery((s) => s.prefs.seeds);
  const look = useMystery((s) => s.prefs.cosmetics);
  const name = useMystery((s) => s.prefs.name);
  const [state, setState] = useState<'in' | 'out'>('in');
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const short = Math.max(0, price - seeds);
  const leave = useCallback((then: () => void) => {
    if (done.current) return;
    done.current = true;
    setState('out');
    setTimeout(then, 170);
  }, []);
  const cancel = useCallback(() => leave(onCancel), [leave, onCancel]);
  useEffect(() => {
    sfx.play('ui.open');
    const prev = document.activeElement as HTMLElement | null;
    const btn = box.current?.querySelector<HTMLButtonElement>('[data-autofocus]');
    btn?.focus();
    // Escape closes only this layer (lobby modal / wardrobe screen stay open).
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      cancel();
    };
    window.addEventListener('keydown', k, true);
    return () => {
      window.removeEventListener('keydown', k, true);
      sfx.play('ui.close');
      prev?.focus?.();
    };
  }, [cancel]);
  // Keep Tab inside the dialog.
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !box.current) return;
    const f = Array.from(box.current.querySelectorAll<HTMLElement>('button:not(:disabled)'));
    if (!f.length) return;
    const first = f[0]!;
    const last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="mmsh-confirm-back" data-own-escape data-state={state} onPointerDown={(e) => e.target === e.currentTarget && cancel()}>
      <div className="mmsh-confirm" ref={box} role="alertdialog" aria-modal="true" aria-labelledby="mmsh-confirm-t" aria-describedby="mmsh-confirm-d" data-state={state} onKeyDown={onKey}>
        <div className="mmsh-confirm-t" id="mmsh-confirm-t">
          {title}
        </div>
        <div className="mmsh-confirm-thumbs" aria-hidden>
          {keys.slice(0, 5).map((k, i) => {
            const it = itemInfo(k);
            const src = it ? slotThumb(it.slot, it.id, look, name) : null;
            return <span key={k} style={{ ['--i' as string]: i }}>{src ? <img src={src} alt="" /> : <SeedGlyph size={40} />}</span>;
          })}
        </div>
        <div className="mmsh-confirm-d" id="mmsh-confirm-d">
          {detail ? <p>{detail}</p> : null}
          <div className="mmsh-confirm-row">
            <span>Price</span>
            <Price value={price} />
          </div>
          <div className="mmsh-confirm-row">
            <span>{short ? 'You have' : 'Left after'}</span>
            <Price value={short ? seeds : seeds - price} short={short > 0} />
          </div>
          {short > 0 && (
            <p className="mmsh-confirm-short">
              You need {short} more {CURRENCY.name}. Play matches to earn them: tasks, wins and surviving all pay.
            </p>
          )}
        </div>
        <div className="mmsh-confirm-btns">
          <button type="button" className="mm-btn mm-pill" onClick={cancel} data-autofocus={short > 0 ? true : undefined}>
            {short > 0 ? 'OK' : 'Cancel'}
          </button>
          {short === 0 && (
            <button type="button" className="mm-btn mm-pill mm-btn-gold mmsh-confirm-buy" data-autofocus onClick={() => leave(onConfirm)}>
              <SeedGlyph size={20} /> Buy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Spend Seeds on `keys`, then wear them. Returns false (with feedback) when it can't. */
export function completePurchase(keys: readonly string[], price: number): boolean {
  const st = useMystery.getState();
  const res = purchase({ seeds: st.prefs.seeds, owned: st.prefs.owned }, keys, price);
  if (!res.ok) {
    sfx.play('ui.error');
    st.toast(res.reason === 'funds' ? `You need ${res.short ?? 0} more ${CURRENCY.name}` : res.reason === 'owned' ? 'You already own that' : 'That item isn’t for sale', 'bad');
    return false;
  }
  st.setPrefs({ seeds: res.wallet.seeds, owned: res.wallet.owned, cosmetics: sanitizeCosmetics(applyItems(st.prefs.cosmetics, keys)) });
  sfx.play('shop.buy');
  return true;
}

/** Lobby wardrobe: tapping a locked item offers to buy it on the spot. */
export function QuickBuy({ itemKey, onClose }: { itemKey: string; onClose(): void }) {
  const it = itemInfo(itemKey);
  if (!it) return null;
  return (
    <ConfirmBuy
      title={`Unlock ${it.name}?`}
      detail={`${RARITY_LABEL[it.tier]} ${SLOT_LABEL[it.slot].toLowerCase()}. It’s yours for good and goes on straight away.`}
      keys={[itemKey]}
      price={it.price}
      onCancel={onClose}
      onConfirm={() => {
        if (completePurchase([itemKey], it.price)) useMystery.getState().toast(`${it.name} unlocked`, 'good');
        onClose();
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Celebration burst over the preview

const BURST = Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * 360 + (i % 2) * 9, d: 70 + ((i * 37) % 50), s: 0.7 + ((i * 13) % 5) / 10 }));

function Celebrate({ label }: { label: string }) {
  return (
    <div className="mmsh-cele" aria-hidden>
      <span className="mmsh-cele-rays" />
      {BURST.map((b, i) => (
        <span key={i} className="mmsh-cele-seed" style={{ ['--a' as string]: `${b.a}deg`, ['--d' as string]: `${b.d}px`, ['--s' as string]: b.s, ['--i' as string]: i }}>
          <SeedGlyph size={18} />
        </span>
      ))}
      <span className="mmsh-cele-tag">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shop panel

type CatId = 'featured' | 'hat' | 'outfit' | 'faceacc' | 'back' | 'pet' | 'hair' | 'berry' | 'face' | 'nameplate' | 'emotes' | 'victory';

const CATS: { id: CatId; label: string; icon: string; slots: ShopSlot[] }[] = [
  { id: 'featured', label: 'Featured', icon: 'gift', slots: [] },
  { id: 'hat', label: 'Hats', icon: 'hat', slots: ['hat'] },
  { id: 'outfit', label: 'Outfits', icon: 'shirt', slots: ['outfit'] },
  { id: 'faceacc', label: 'Face Acc.', icon: 'glasses', slots: ['face'] },
  { id: 'back', label: 'Back', icon: 'backpack', slots: ['back'] },
  { id: 'pet', label: 'Pets', icon: 'paw', slots: ['pet'] },
  { id: 'hair', label: 'Hair', icon: 'scissors', slots: ['hair'] },
  { id: 'berry', label: 'Berries', icon: 'berry', slots: ['berry', 'pattern'] },
  { id: 'face', label: 'Faces', icon: 'emote', slots: ['eyes', 'brows', 'mouth'] },
  { id: 'nameplate', label: 'Nameplates', icon: 'tag', slots: ['nameplate'] },
  { id: 'emotes', label: 'Emotes', icon: 'sparkle', slots: ['emotes'] },
  { id: 'victory', label: 'Victory', icon: 'trophy', slots: ['victory'] },
];

const catOf = (slot: ShopSlot): CatId => CATS.find((c) => c.slots.includes(slot))?.id ?? 'featured';

type Sel = { kind: 'item'; key: string } | { kind: 'bundle'; id: string };

function firstOf(cat: CatId): Sel | null {
  if (cat === 'featured') return BUNDLES[0] ? { kind: 'bundle', id: BUNDLES[0].id } : null;
  const slot = CATS.find((c) => c.id === cat)?.slots[0];
  const it = slot ? shopItems(slot)[0] : undefined;
  return it ? { kind: 'item', key: it.key } : null;
}

function BundleCard({ b, on, owned, seeds, onPick, i }: { b: Bundle; on: boolean; owned: readonly string[]; seeds: number; onPick(): void; i: number }) {
  const look = useMystery((s) => s.prefs.cosmetics);
  const name = useMystery((s) => s.prefs.name);
  const price = bundlePrice(b, owned);
  const all = price === 0;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={on ? 0 : -1}
      className="mmsh-bundle"
      data-motif={b.motif}
      data-bundle={b.id}
      style={{ ['--b1' as string]: b.colors[0], ['--b2' as string]: b.colors[1], ['--i' as string]: i }}
      aria-label={`Bundle: ${b.name}, ${b.items.length} items, ${all ? 'owned' : `${price} ${CURRENCY.name}`}`}
      onClick={onPick}
    >
      <span className="mmsh-bundle-items" aria-hidden>
        {b.items.map((k) => {
          const it = itemInfo(k)!;
          const src = slotThumb(it.slot, it.id, look, name);
          return <span key={k} className={`mmsh-bundle-it ${it.slot}`}>{src ? <img src={src} alt="" /> : null}</span>;
        })}
      </span>
      <span className="mmsh-bundle-name">Bundle · {b.name}</span>
      <span className="mmsh-bundle-off" aria-hidden>
        −{bundleDiscount(b)}%
      </span>
      <span className="mmsh-bundle-foot">{all ? <span className="mmsh-owned-chip"><MIcon name="check" size={14} stroke={3} /> Owned</span> : <Price value={price} was={bundleFullPrice(b)} short={price > seeds} />}</span>
    </button>
  );
}

export function ShopPanel({ focusKey, preview }: { focusKey?: string | null; preview?: '2d' | '3d' }) {
  const prefs = useMystery((s) => s.prefs);
  const setPrefs = useMystery((s) => s.setPrefs);
  const { seeds, owned, cosmetics, name } = prefs;
  const ownedSet = useMemo(() => new Set(owned), [owned]);
  const focusInfo = focusKey ? itemInfo(focusKey) : null;
  const [cat, setCat] = useState<CatId>(focusInfo ? catOf(focusInfo.slot) : 'featured');
  const [sel, setSel] = useState<Sel | null>(focusInfo ? { kind: 'item', key: focusInfo.key } : firstOf('featured'));
  const [confirm, setConfirm] = useState(false);
  const [party, setParty] = useState<{ n: number; label: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Jump to an item handed over from the Wardrobe tab.
  useEffect(() => {
    const it = focusKey ? itemInfo(focusKey) : null;
    if (!it) return;
    setCat(catOf(it.slot));
    setSel({ kind: 'item', key: it.key });
  }, [focusKey]);
  useLayoutEffect(() => {
    if (sel?.kind !== 'item') return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-item="${sel.key}"]`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    // only when the category changes or an item is handed over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, focusKey]);
  useEffect(() => {
    if (!party) return;
    const t = setTimeout(() => setParty(null), 1900);
    return () => clearTimeout(t);
  }, [party]);

  const pickCat = (c: CatId) => {
    if (c === cat) return;
    setCat(c);
    setSel(firstOf(c));
  };

  // What the selection is, costs and does.
  let title = 'Pick something';
  let sub = '';
  let tier = 'free';
  let price = 0;
  let was = 0;
  let keys: string[] = [];
  let emote: string | null = null;
  if (sel?.kind === 'item') {
    const it = itemInfo(sel.key);
    if (it) {
      title = it.name;
      sub = `${RARITY_LABEL[it.tier]} · ${SLOT_LABEL[it.slot]}`;
      tier = it.tier;
      price = isOwned(ownedSet, it.key) ? 0 : it.price;
      keys = [it.key];
      if (it.slot === 'emotes' || it.slot === 'victory') emote = it.id;
    }
  } else if (sel?.kind === 'bundle') {
    const b = BUNDLES.find((x) => x.id === sel.id);
    if (b) {
      title = b.name;
      sub = `Bundle · ${b.items.length} items · save ${bundleDiscount(b)}%`;
      tier = 'bundle';
      price = bundlePrice(b, owned);
      was = bundleFullPrice(b);
      keys = [...b.items];
    }
  }
  const allOwned = keys.length > 0 && keys.every((k) => isOwned(ownedSet, k));
  const wearing = allOwned && keys.every((k) => {
    const it = itemInfo(k)!;
    return it.slot === 'emotes' ? cosmetics.emotes.includes(it.id) : String(cosmetics[it.slot]) === it.id;
  });
  const short = Math.max(0, price - seeds);
  const tryOn = useMemo(() => sanitizeCosmetics(applyItems(cosmetics, keys)), [cosmetics, keys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  let action = 'Purchase';
  let why = '';
  let disabled = false;
  if (!keys.length) {
    disabled = true;
    why = 'Pick an item to try it on';
  } else if (allOwned) {
    action = wearing ? 'Equipped' : keys.length > 1 ? 'Wear set' : 'Equip';
    disabled = wearing;
    why = wearing ? 'You’re wearing it' : 'You own this';
  } else if (short > 0) {
    disabled = true;
    why = `Need ${short} more ${CURRENCY.name} · earn them by playing`;
  } else {
    why = keys.length > 1 ? 'Everything in the set, yours for good' : 'Yours for good once bought';
  }

  const onAction = () => {
    if (disabled) return;
    if (allOwned) {
      sfx.play('ui.equip');
      setPrefs({ cosmetics: sanitizeCosmetics(keys.reduce(applyItem, cosmetics)) });
      return;
    }
    setConfirm(true);
  };
  const onBuy = () => {
    if (!completePurchase(keys, price)) return;
    setParty((p) => ({ n: (p?.n ?? 0) + 1, label: keys.length > 1 ? 'Set unlocked!' : 'Unlocked!' }));
    useMystery.getState().toast(`${title} unlocked`, 'good');
  };

  // Page arrows + dots (same feel as the wardrobe editor).
  const [pageInfo, setPageInfo] = useState({ page: 0, pages: 1 });
  const measure = useCallback(() => {
    const el = panelRef.current;
    if (!el || !el.clientHeight) return;
    const pages = Math.max(1, Math.ceil((el.scrollHeight - 4) / el.clientHeight));
    const page = Math.min(pages - 1, Math.round(el.scrollTop / el.clientHeight));
    setPageInfo((p) => (p.page === page && p.pages === pages ? p : { page, pages }));
  }, []);
  useEffect(() => {
    measure();
    const t = setTimeout(measure, 150);
    return () => clearTimeout(t);
  }, [cat, measure]);
  const turn = (d: number) => {
    const el = panelRef.current;
    if (!el) return;
    if (typeof el.scrollBy === 'function') el.scrollBy({ top: d * el.clientHeight, behavior: 'smooth' });
    else el.scrollTop += d * el.clientHeight;
  };

  const onCatKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const i = CATS.findIndex((c) => c.id === cat);
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % CATS.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + CATS.length) % CATS.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = CATS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    sfx.play('ui.hover');
    pickCat(CATS[n]!.id);
    (e.currentTarget.children[n] as HTMLElement | undefined)?.focus();
  };
  const onBundleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (sel?.kind !== 'bundle') return;
    const i = BUNDLES.findIndex((b) => b.id === sel.id);
    let n = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = Math.min(BUNDLES.length - 1, i + 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = Math.max(0, i - 1);
    if (n < 0 || n === i) return;
    e.preventDefault();
    sfx.play('shop.try');
    setSel({ kind: 'bundle', id: BUNDLES[n]!.id });
    const el = e.currentTarget.children[n] as HTMLElement | undefined;
    el?.focus();
    el?.scrollIntoView?.({ block: 'nearest' });
  };

  const tryItem = (key: string) => {
    sfx.play('shop.try');
    setSel({ kind: 'item', key });
  };

  const catDef = CATS.find((c) => c.id === cat)!;
  let body: ReactNode;
  if (cat === 'featured') {
    body = (
      <>
        <h3 className="mmce-h">Featured bundles</h3>
        <div className="mmsh-bundles" role="radiogroup" aria-label="Bundles" onKeyDown={onBundleKey}>
          {BUNDLES.map((b, i) => (
            <BundleCard key={b.id} b={b} i={i} on={sel?.kind === 'bundle' && sel.id === b.id} owned={owned} seeds={seeds} onPick={() => (sfx.play('shop.try'), setSel({ kind: 'bundle', id: b.id }))} />
          ))}
        </div>
      </>
    );
  } else {
    body = catDef.slots.map((slot) => {
      const items = shopItems(slot).map((it) => {
        const own = isOwned(ownedSet, it.key);
        return { id: it.key, label: it.name, thumb: slotThumb(slot, it.id, cosmetics, name), price: it.price, owned: own, short: !own && it.price > seeds, tier: it.tier, hideLabel: true };
      });
      return (
        <div key={slot} className="mmsh-sec">
          {catDef.slots.length > 1 && <h3 className="mmce-h">{SLOT_LABEL[slot]}</h3>}
          <Grid label={`${SLOT_LABEL[slot]} shop`} items={items} variant={slot === 'nameplate' ? 'plate' : undefined} selected={sel?.kind === 'item' ? [sel.key] : []} onSelect={tryItem} />
        </div>
      );
    });
  }
  const { page, pages } = pageInfo;

  return (
    <div className="mmce mmsh" data-testid="shop">
      <style>{EDITOR_CSS}</style>
      <section className="mmce-stage mmsh-stage" aria-label="Try-on preview">
        <div className="mmsh-canvaswrap">
          <PreviewCanvas value={tryOn} name={name} emote={emote} preview={preview} />
          {party && <Celebrate key={party.n} label={party.label} />}
        </div>
        <div className="mmsh-info" aria-live="polite">
          <div className="mmsh-name" key={title}>
            {title}
          </div>
          {sub && (
            <div className="mmsh-sub" data-tier={tier}>
              {sub}
            </div>
          )}
        </div>
        <div className="mmsh-buy">
          {!allOwned && price > 0 && (
            <div className="mmsh-buy-price" key={price}>
              <Price value={price} was={was || undefined} short={short > 0} />
            </div>
          )}
          <button type="button" className="mmsh-purchase" data-kind={allOwned ? 'equip' : 'buy'} disabled={disabled} aria-describedby="mmsh-why" onClick={onAction}>
            {action}
          </button>
          <div className="mmsh-why" id="mmsh-why" data-short={short > 0 && !allOwned}>
            {why}
          </div>
        </div>
      </section>
      <div className="mmce-tabs" role="tablist" aria-label="Shop sections" aria-orientation="vertical" onKeyDown={onCatKey}>
        {CATS.map((c) => (
          <button key={c.id} type="button" role="tab" id={`mmsh-tab-${c.id}`} aria-selected={cat === c.id} aria-controls="mmsh-panel" tabIndex={cat === c.id ? 0 : -1} className="mmce-tab" onClick={() => pickCat(c.id)}>
            <MIcon name={c.icon} size={18} />
            {c.label}
          </button>
        ))}
      </div>
      <div className="mmce-main">
        <div className="mmce-panel" id="mmsh-panel" role="tabpanel" aria-labelledby={`mmsh-tab-${cat}`} key={cat} ref={panelRef} onScroll={measure}>
          {body}
        </div>
        <div className="mmce-pager" data-single={pages <= 1}>
          <button type="button" className="mmce-arrow" aria-label="Previous page" disabled={page <= 0} onClick={() => turn(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5 21 19H3z" fill="currentColor" />
            </svg>
          </button>
          <div className="mmce-dots">
            {Array.from({ length: Math.min(pages, 6) }, (_, i) => (
              <span key={i} className="mmce-dot" data-on={i === Math.min(page, 5)} />
            ))}
          </div>
          <button type="button" className="mmce-arrow" aria-label="Next page" disabled={page >= pages - 1} onClick={() => turn(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19 3 5h18z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
      {confirm && keys.length > 0 && (
        <ConfirmBuy
          title={keys.length > 1 ? `Buy the ${title} bundle?` : `Buy ${title}?`}
          detail={keys.length > 1 ? `${keys.filter((k) => !isOwned(ownedSet, k)).length} new items, worn straight away.` : 'It’s yours for good and goes on straight away.'}
          keys={keys}
          price={price}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            onBuy();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results screen: Seeds earned this round

export function SeedsEarned({ earnings, balance }: { earnings: Earnings; balance: number }) {
  const reduced = useMystery((s) => s.prefs.reducedMotion);
  const [shown, setShown] = useState(0);
  const [lines, setLines] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (earnings.practice) return;
    const n = earnings.lines.length;
    if (reduced) {
      setLines(n);
      setShown(earnings.total);
      setDone(true);
      sfx.play('shop.earn');
      return;
    }
    // Lines drop in one by one (a coin each), then the total counts up.
    const ts: ReturnType<typeof setTimeout>[] = [];
    const start = 700;
    for (let i = 0; i < n; i++)
      ts.push(
        setTimeout(() => {
          setLines(i + 1);
          sfx.play('shop.coin');
        }, start + i * 160),
      );
    const end = start + n * 160;
    ts.push(
      setTimeout(() => {
        setShown(earnings.total);
        setDone(true);
      }, end),
    );
    ts.push(setTimeout(() => sfx.play('shop.earn'), end + 900));
    return () => ts.forEach(clearTimeout);
  }, [earnings, reduced]);
  if (earnings.practice)
    return (
      <div className="mmr-seeds" data-practice="true">
        <SeedGlyph size={26} />
        <span className="mmr-seeds-note">Practice rounds don’t earn {CURRENCY.name}. Play a real match to fill your pouch.</span>
      </div>
    );
  return (
    <div className="mmr-seeds" role="group" aria-label={`${earnings.total} ${CURRENCY.name} earned`}>
      <div className="mmr-seeds-head">
        <span className="mm-label">{CURRENCY.name} earned</span>
        <span className="mmr-seeds-total">
          <SeedGlyph size={30} />+<Tick value={shown} ms={900} />
        </span>
      </div>
      <ul className="mmr-seeds-lines">
        {earnings.lines.map((l, i) => (
          <li key={l.id} data-on={i < lines}>
            <span>
              {l.label}
              {l.count ? <small> ×{l.count}</small> : null}
            </span>
            <b>+{l.amount}</b>
          </li>
        ))}
      </ul>
      <div className="mmr-seeds-bal">
        <span>Pouch</span>
        <SeedGlyph size={18} />
        <b>
          <Tick value={done ? balance : Math.max(0, balance - earnings.total)} ms={900} />
        </b>
        <small>Spend them in the Shop</small>
      </div>
    </div>
  );
}
