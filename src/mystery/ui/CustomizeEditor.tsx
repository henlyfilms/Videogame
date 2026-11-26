/**
 * Marion Mystery — wardrobe editor. A live animated berry preview (2D canvas,
 * or a lazy-loaded three.js turntable) plus tabbed, keyboard-navigable item
 * grids with cached thumbnails rendered by draw2d.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { Cosmetics } from '../core/types';
import {
  BACK,
  BERRIES,
  BROWS,
  defaultCosmetics,
  EMOTES,
  EYES,
  FACE,
  HAIR,
  HAIR_COLORS,
  HATS,
  MAX_EMOTES,
  MOUTHS,
  NAMEPLATES,
  OUTFITS,
  PALETTE,
  PATTERNS,
  PETS,
  randomCosmetics,
  sanitizeCosmetics,
  VICTORY,
  type CatalogItem,
} from '../characters/catalog';
import { drawBerry, drawEmoteBubble, drawNameplate, drawPet } from '../characters/draw2d';
import { MIcon } from './common';

export interface CustomizeEditorProps {
  value: Cosmetics;
  onChange(c: Cosmetics): void;
  name?: string;
  onNameChange?(n: string): void;
  preview?: '2d' | '3d';
  takenColors?: number[];
  /** Shows the big pill "Done" button. */
  onDone?(): void;
}

type TabId = 'berry' | 'colour' | 'face' | 'hair' | 'hat' | 'faceacc' | 'outfit' | 'back' | 'pet' | 'nameplate' | 'emotes' | 'victory';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'berry', label: 'Berry', icon: 'berry' },
  { id: 'colour', label: 'Colour', icon: 'palette' },
  { id: 'face', label: 'Face', icon: 'emote' },
  { id: 'hair', label: 'Hair', icon: 'scissors' },
  { id: 'hat', label: 'Hat', icon: 'hat' },
  { id: 'faceacc', label: 'Face Acc.', icon: 'glasses' },
  { id: 'outfit', label: 'Outfit', icon: 'shirt' },
  { id: 'back', label: 'Back', icon: 'backpack' },
  { id: 'pet', label: 'Pet', icon: 'paw' },
  { id: 'nameplate', label: 'Nameplate', icon: 'tag' },
  { id: 'emotes', label: 'Emotes', icon: 'sparkle' },
  { id: 'victory', label: 'Victory', icon: 'trophy' },
];

type ThumbKind = 'full' | 'face' | 'top' | 'pet' | 'plate' | 'emote' | 'pose';

// ---------------------------------------------------------------------------
// Thumbnail cache (data URLs)

const thumbCache = new Map<string, string | null>();
let thumbCanvas: HTMLCanvasElement | null = null;
const canThumb = (): boolean => typeof document !== 'undefined' && !(typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent));

function renderThumb(key: string, kind: ThumbKind, c: Cosmetics, extra: string, name: string): string | null {
  if (thumbCache.has(key)) return thumbCache.get(key) ?? null;
  if (!canThumb()) {
    thumbCache.set(key, null);
    return null;
  }
  try {
    const W = kind === 'plate' ? 220 : 144;
    const H = kind === 'plate' ? 72 : 160;
    if (!thumbCanvas) thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = W;
    thumbCanvas.height = H;
    const ctx = thumbCanvas.getContext('2d');
    if (!ctx) throw new Error('no ctx');
    ctx.clearRect(0, 0, W, H);
    const pose = { time: 0.8, moving: false, dir: 1 as const, blink: false };
    switch (kind) {
      case 'full':
        drawBerry(ctx, c, W / 2 - 4, H * 0.86, 2.55, pose);
        break;
      case 'top':
        drawBerry(ctx, c, W / 2 - 4, H * 1.08, 3.0, pose);
        break;
      case 'face':
        drawBerry(ctx, c, W / 2 - 14, H * 1.17, 4.4, pose);
        break;
      case 'pet':
        if (extra !== 'none') drawPet(ctx, extra, W / 2, H * 0.78, 5, 0.9, 1);
        break;
      case 'plate':
        drawNameplate(ctx, extra, name || 'Berry', W / 2, H / 2, 2.4);
        break;
      case 'emote':
        drawBerry(ctx, c, W / 2 - 4, H * 0.95, 2.2, { ...pose, emote: extra, time: 0.55 });
        drawEmoteBubble(ctx, extra, W / 2 + 34, H * 0.36, 1.5, 0);
        break;
      case 'pose':
        drawBerry(ctx, c, W / 2 - 4, H * 0.92, 2.3, { ...pose, emote: extra, time: 0.55 });
        break;
    }
    const url = thumbCanvas.toDataURL('image/png');
    const ok = typeof url === 'string' && url.startsWith('data:image') ? url : null;
    thumbCache.set(key, ok);
    if (thumbCache.size > 900) {
      const first = thumbCache.keys().next().value;
      if (first !== undefined) thumbCache.delete(first);
    }
    return ok;
  } catch {
    thumbCache.set(key, null);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Styles

const CSS = `
.mmce{--ce-ink:#f3f5f8;--ce-muted:#9aa3ad;--ce-line:rgba(236,240,245,.92);--ce-sel:#ffd426;--ce-tab:#3d66e0;
  color:var(--ce-ink);font-family:var(--mm-body,'Barlow',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif);
  background:#07090c;border:2px solid var(--ce-line);border-radius:14px;
  display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:12px;width:100%;max-width:1120px;box-sizing:border-box;
  grid-template-areas:"stage" "tabs" "main";}
.mmce *{box-sizing:border-box}
.mmce-stage{grid-area:stage}.mmce-tabs{grid-area:tabs}.mmce-main{grid-area:main}
@media(min-width:760px){.mmce{grid-template-columns:minmax(0,1fr) minmax(260px,320px);grid-template-areas:"tabs tabs" "main stage";padding:16px;gap:16px}}
@media(min-width:980px){.mmce{grid-template-columns:168px minmax(0,1fr) minmax(260px,320px);grid-template-areas:"tabs main stage"}}
.mmce-stage{position:relative;border-radius:12px;overflow:hidden;min-height:250px;display:flex;flex-direction:column;
  background:radial-gradient(1.2px 1.2px at 20% 30%,#fff8,transparent),radial-gradient(1.2px 1.2px at 70% 12%,#fff8,transparent),radial-gradient(1.5px 1.5px at 85% 60%,#fff9,transparent),radial-gradient(1.2px 1.2px at 35% 75%,#fff6,transparent),radial-gradient(1px 1px at 55% 45%,#fff6,transparent),#05070a;
  border:1.5px solid rgba(255,255,255,.16)}
@media(min-width:760px){.mmce-stage{position:sticky;top:0;min-height:440px}}
.mmce-canvas{width:100%;height:170px;display:block;flex:0 0 auto;animation:mmce-in .5s cubic-bezier(.2,.9,.3,1.2) both}
@media(max-width:759px){.mmce-stage{min-height:0}.mmce-stagebar{grid-template-columns:1fr auto auto;padding:8px}.mmce-stagebar .mmce-name{grid-column:auto}.mmce-done{min-height:48px;font-size:20px}.mmce-panel{max-height:46vh}}
@media(min-width:760px){.mmce-canvas{height:320px;flex:1}}
.mmce-stagebar{display:grid;grid-template-columns:1fr auto;gap:8px;padding:10px;align-items:center}
.mmce-stagebar .mmce-name,.mmce-stagebar .mmce-done{grid-column:1/-1}
.mmce-name{width:100%;min-height:44px;border-radius:8px;border:2px solid var(--ce-line);background:#0d1014;
  color:var(--ce-ink);padding:0 12px;font-size:16px;font-weight:700;outline:none;font-family:inherit}
.mmce-name:focus{border-color:var(--ce-sel)}
.mmce-btn{min-height:44px;min-width:44px;padding:0 14px;border-radius:8px;border:2px solid var(--ce-line);background:#0b0d10;
  color:var(--ce-ink);font-weight:500;font-size:15px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;
  font-family:var(--mm-display,'Oswald','Arial Narrow',sans-serif);text-transform:uppercase;letter-spacing:.05em;
  transition:transform .16s cubic-bezier(.3,1.6,.5,1),border-color .15s,background .15s}
.mmce-btn:hover{border-color:var(--ce-sel);background:#171a1f;transform:translateY(-1px)}.mmce-btn:active{transform:scale(.95)}
.mmce-btn:focus-visible{outline:3px solid var(--ce-sel);outline-offset:2px}
.mmce-done{min-height:58px;border-radius:999px;border:2px solid #b9cdff;font-size:24px;letter-spacing:.08em;color:#fff;
  background:linear-gradient(115deg,transparent 0 56%,rgba(255,255,255,.18) 56% 64%,transparent 64% 70%,rgba(255,255,255,.12) 70% 74%,transparent 74%),#3d66e0}
.mmce-done:hover{background:linear-gradient(115deg,transparent 0 56%,rgba(255,255,255,.24) 56% 64%,transparent 64% 70%,rgba(255,255,255,.16) 70% 74%,transparent 74%),#4b74ee;border-color:#fff}
.mmce-main{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:8px;align-items:stretch}
.mmce-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 4px;-webkit-overflow-scrolling:touch}
.mmce-tabs::-webkit-scrollbar{display:none}
@media(min-width:980px){.mmce-tabs{flex-direction:column;overflow:visible;padding:0}}
.mmce-tab{position:relative;flex:0 0 auto;min-height:44px;padding:0 12px 0 10px;border-radius:7px;border:2px solid rgba(255,255,255,.18);
  background:linear-gradient(110deg,transparent 0 62%,rgba(255,255,255,.14) 62% 70%,transparent 70% 76%,rgba(255,255,255,.1) 76% 80%,transparent 80%),var(--ce-tab);
  color:#fff;font-family:var(--mm-display,'Oswald','Arial Narrow',sans-serif);font-weight:500;font-size:15px;letter-spacing:.06em;text-transform:uppercase;
  cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:8px;justify-content:space-between;
  transition:transform .18s cubic-bezier(.3,1.5,.5,1),border-color .15s,filter .15s;opacity:.92}
.mmce-tab svg{flex:none;opacity:.9}
.mmce-tab:hover{transform:translateX(2px);filter:brightness(1.12);opacity:1}
.mmce-tab[aria-selected=true]{border-color:var(--ce-sel);opacity:1;box-shadow:0 0 0 1px var(--ce-sel)}
@media(min-width:980px){.mmce-tab[aria-selected=true]{transform:translateX(6px)}
  .mmce-tab[aria-selected=true]::after{content:'';position:absolute;right:-12px;top:50%;margin-top:-8px;border:8px solid transparent;border-left-color:var(--ce-sel)}}
.mmce-tab:focus-visible{outline:3px solid #fff;outline-offset:2px}
.mmce-panel{display:flex;flex-direction:column;gap:12px;min-width:0;overflow-y:auto;scroll-behavior:smooth;max-height:min(56vh,520px);padding:4px;scrollbar-width:none;
  animation:mmce-page .32s cubic-bezier(.2,.8,.2,1) both}
.mmce-panel::-webkit-scrollbar{display:none}
.mmce-pager{display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:6px;padding:4px 0}
.mmce-arrow{width:36px;height:36px;border:0;background:none;color:#fff;cursor:pointer;display:grid;place-items:center;border-radius:8px;transition:transform .15s,opacity .15s}
.mmce-arrow:hover:not(:disabled){transform:scale(1.15)}.mmce-arrow:disabled{opacity:.25;cursor:default}
.mmce-arrow:focus-visible{outline:3px solid var(--ce-sel)}
.mmce-arrow svg{width:28px;height:28px}
.mmce-dots{display:flex;flex-direction:column;gap:10px;align-items:center}
.mmce-dot{width:10px;height:10px;border-radius:50%;border:2px solid #fff;transition:background .2s,transform .2s}
.mmce-dot[data-on=true]{background:var(--ce-sel);border-color:var(--ce-sel);transform:scale(1.2)}
.mmce-h{font-family:var(--mm-display,'Oswald','Arial Narrow',sans-serif);font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--ce-muted);font-weight:500;margin:4px 0 -4px}
.mmce-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:10px}
@media(min-width:980px){.mmce-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
.mmce-grid.wide{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.mmce-grid.swatches{grid-template-columns:repeat(auto-fill,minmax(64px,1fr))}
@media(min-width:980px){.mmce-grid.swatches{grid-template-columns:repeat(5,minmax(0,1fr))}}
.mmce-item{position:relative;min-height:44px;border-radius:9px;border:2px solid rgba(236,240,245,.85);background:#2a2f38;
  color:var(--ce-ink);cursor:pointer;padding:6px 4px 7px;display:flex;flex-direction:column;align-items:center;gap:3px;
  transition:transform .18s cubic-bezier(.3,1.6,.5,1),border-color .15s,background .15s;animation:mmce-item .36s cubic-bezier(.2,.9,.3,1.2) both;animation-delay:calc(min(var(--i,0),16) * 18ms)}
.mmce-item:hover{background:#353b46;transform:translateY(-2px) scale(1.03)}
.mmce-item:active{transform:scale(.95)}
.mmce-item:focus-visible{outline:3px solid #fff;outline-offset:2px}
.mmce-item[aria-checked=true],.mmce-item[aria-pressed=true]{border-color:var(--ce-sel);background:#3b3a26;box-shadow:0 0 0 2px var(--ce-sel)}
.mmce-item img{width:100%;max-width:96px;aspect-ratio:144/160;object-fit:contain;pointer-events:none;image-rendering:auto}
.mmce-item.plate img{max-width:none;aspect-ratio:220/72}
.mmce-ph{width:100%;max-width:96px;aspect-ratio:144/160;border-radius:8px;background:rgba(255,255,255,.05)}
.mmce-label{font-size:12px;font-weight:700;line-height:1.15;text-align:center;color:#e4e8ee;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmce-sw{width:42px;height:42px;border-radius:50%;border:2px solid #0b0d10;box-shadow:inset 0 -6px 10px rgba(0,0,0,.25),inset 0 4px 8px rgba(255,255,255,.35)}
.mmce-item.taken{opacity:.42}
.mmce-badge{position:absolute;top:4px;right:5px;font-size:10px;font-weight:800;padding:1px 6px;border-radius:999px;background:#0b0d10;border:1px solid #fff;color:#fff}
.mmce-count{font-family:var(--mm-display,'Oswald','Arial Narrow',sans-serif);font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--ce-muted)}
.mmce-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@keyframes mmce-item{from{opacity:0;transform:translateY(8px) scale(.9)}to{opacity:1;transform:none}}
@keyframes mmce-page{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
@keyframes mmce-in{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.mmce *{animation:none!important;transition:none!important}}
.mm-reduced .mmce *{animation:none!important;transition:none!important}
`;

// ---------------------------------------------------------------------------
// Keyboard-navigable grid

interface GridItem {
  id: string;
  label: string;
  thumb?: string | null;
  swatch?: string;
  dim?: boolean;
  badge?: string;
}

function Grid(props: { label: string; items: GridItem[]; selected: string[]; onSelect(id: string): void; multi?: boolean; variant?: 'wide' | 'swatches' | 'plate' }): JSX.Element {
  const { items, selected, onSelect, multi, variant } = props;
  const ref = useRef<HTMLDivElement>(null);
  const firstSel = Math.max(0, items.findIndex((i) => selected.includes(i.id)));
  const [focus, setFocus] = useState(firstSel);
  useEffect(() => setFocus((f) => Math.min(f, items.length - 1)), [items.length]);
  const cols = (): number => {
    const el = ref.current;
    if (!el || el.children.length < 2) return 1;
    const kids = Array.from(el.children) as HTMLElement[];
    const top = kids[0]!.offsetTop;
    let n = 0;
    for (const k of kids) {
      if (k.offsetTop !== top) break;
      n++;
    }
    return Math.max(1, n === kids.length && top === 0 && kids[1]!.offsetLeft === 0 ? 4 : n);
  };
  const move = (to: number): void => {
    const n = Math.max(0, Math.min(items.length - 1, to));
    setFocus(n);
    const el = ref.current?.children[n] as HTMLElement | undefined;
    el?.focus();
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const c = cols();
    switch (e.key) {
      case 'ArrowRight':
        move(focus + 1);
        break;
      case 'ArrowLeft':
        move(focus - 1);
        break;
      case 'ArrowDown':
        move(focus + c);
        break;
      case 'ArrowUp':
        move(focus - c);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(items.length - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  return (
    <div
      ref={ref}
      className={`mmce-grid${variant === 'wide' || variant === 'plate' ? ' wide' : variant === 'swatches' ? ' swatches' : ''}`}
      role={multi ? 'group' : 'radiogroup'}
      aria-label={props.label}
      onKeyDown={onKey}
    >
      {items.map((it, i) => {
        const on = selected.includes(it.id);
        return (
          <button
            key={it.id}
            type="button"
            className={`mmce-item${it.dim ? ' taken' : ''}${variant === 'plate' ? ' plate' : ''}`}
            role={multi ? undefined : 'radio'}
            aria-checked={multi ? undefined : on}
            aria-pressed={multi ? on : undefined}
            aria-label={it.label + (it.badge ? ` (${it.badge})` : '')}
            data-item={it.id}
            style={{ ['--i' as string]: i } as React.CSSProperties}
            tabIndex={i === focus ? 0 : -1}
            onFocus={() => setFocus(i)}
            onClick={() => onSelect(it.id)}
          >
            {it.swatch ? <span className="mmce-sw" style={{ background: it.swatch }} /> : it.thumb ? <img src={it.thumb} alt="" draggable={false} /> : <span className="mmce-ph" />}
            <span className="mmce-label">{it.label}</span>
            {it.badge ? <span className="mmce-badge">{it.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview stage

function usePreview2D(canvas: React.RefObject<HTMLCanvasElement>, value: Cosmetics, name: string, emote: string | null, enabled: boolean): void {
  const state = useRef({ value, name, emote });
  state.current = { value, name, emote };
  useEffect(() => {
    if (!enabled) return;
    const cv = canvas.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const start = typeof performance !== 'undefined' ? performance.now() : 0;
    const raf$ = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 33) as unknown as number;
    const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (id: number) => clearTimeout(id);
    const frame = (now: number): void => {
      const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      const w = cv.clientWidth || 320;
      const h = cv.clientHeight || 250;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const t = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { value: c, name: nm, emote: em } = state.current;
      const s = Math.min(w / (c.pet !== 'none' ? 92 : 70), h / 72);
      const fx = w / 2 - (c.pet !== 'none' ? 10 * s : 0);
      const fy = h * 0.8;
      // Soft spotlight floor.
      const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, 34 * s);
      g.addColorStop(0, 'rgba(110,161,255,0.28)');
      g.addColorStop(1, 'rgba(110,161,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 34 * s, 9 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBerry(ctx, c, fx, fy, s, { time: t, moving: false, dir: 1, emote: em });
      if (c.pet !== 'none') drawPet(ctx, c.pet, fx + 30 * s, fy + 1, s * 0.95, t, -1);
      if (em && EMOTES.some((e) => e.id === em)) drawEmoteBubble(ctx, em, fx + 14 * s, fy - 52 * s, s * 0.8, t);
      drawNameplate(ctx, c.nameplate, nm || 'Berry', fx, fy + 10 * s, Math.max(1, s * 0.72));
      raf = raf$(frame);
    };
    raf = raf$(frame);
    return () => caf(raf);
  }, [canvas, enabled]);
}

function usePreview3D(canvas: React.RefObject<HTMLCanvasElement>, value: Cosmetics, emote: string | null, enabled: boolean, onFail: () => void): void {
  const rigRef = useRef<{ setCosmetics(c: Cosmetics): void; setPet(id: string): void } | null>(null);
  const emoteRef = useRef(emote);
  emoteRef.current = emote;
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const [THREE, rigMod] = await Promise.all([import('three'), import('../characters/rig3d')]);
        if (cancelled) return;
        const cv = canvas.current;
        if (!cv) return;
        const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2440, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 2.3);
        sun.position.set(-2, 4, 3.5);
        scene.add(sun);
        const rim = new THREE.DirectionalLight(0x6ea1ff, 1.2);
        rim.position.set(2, 2, -3);
        scene.add(rim);
        const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 30);
        cam.position.set(0, 1.25, 4.3);
        cam.lookAt(0, 0.58, 0);
        const turn = new THREE.Group();
        scene.add(turn);
        const rig = rigMod.createBerry(valueRef.current, { quality: 'high' });
        turn.add(rig.group);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), new THREE.MeshBasicMaterial({ color: 0x6ea1ff, transparent: true, opacity: 0.16 }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.001;
        scene.add(disc);
        let pet: ReturnType<typeof rigMod.createPet> | null = null;
        let petId = '';
        const setPet = (id: string): void => {
          if (id === petId) return;
          petId = id;
          if (pet) turn.remove(pet.group);
          pet = id !== 'none' ? rigMod.createPet(id) : null;
          if (pet) {
            pet.group.position.set(0.55, 0, 0.25);
            pet.group.rotation.y = -0.5;
            turn.add(pet.group);
          }
        };
        setPet(valueRef.current.pet);
        rigRef.current = { setCosmetics: (c) => rig.setCosmetics(c), setPet };
        let last = performance.now();
        let raf = 0;
        const frame = (now: number): void => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const w = cv.clientWidth || 320;
          const h = cv.clientHeight || 250;
          const size = renderer.getSize(new THREE.Vector2());
          if (size.x !== w || size.y !== h) {
            renderer.setSize(w, h, false);
            cam.aspect = w / h;
            cam.updateProjectionMatrix();
          }
          turn.rotation.y += dt * 0.55;
          rig.update(dt, { moving: false, emote: emoteRef.current });
          pet?.update(dt, false);
          renderer.render(scene, cam);
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        cleanup = () => {
          cancelAnimationFrame(raf);
          rig.dispose();
          disc.geometry.dispose();
          (disc.material as InstanceType<typeof THREE.Material>).dispose();
          renderer.dispose();
          rigRef.current = null;
        };
      } catch {
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [canvas, enabled, onFail]);
  useEffect(() => {
    rigRef.current?.setCosmetics(value);
    rigRef.current?.setPet(value.pet);
  }, [value]);
}

// ---------------------------------------------------------------------------
// Editor

export function CustomizeEditor(props: CustomizeEditorProps): JSX.Element {
  const { onChange, onNameChange, takenColors } = props;
  const value = useMemo(() => sanitizeCosmetics(props.value), [props.value]);
  const [tab, setTab] = useState<TabId>('berry');
  const [previewEmote, setPreviewEmote] = useState<string | null>(null);
  const [fallback2d, setFallback2d] = useState(false);
  const canvas2d = useRef<HTMLCanvasElement>(null);
  const canvas3d = useRef<HTMLCanvasElement>(null);
  const use3d = props.preview === '3d' && !fallback2d;
  const name = props.name ?? '';

  usePreview2D(canvas2d, value, name, previewEmote, !use3d);
  const onFail = useCallback(() => setFallback2d(true), []);
  usePreview3D(canvas3d, value, previewEmote, use3d, onFail);

  useEffect(() => {
    if (tab === 'victory') setPreviewEmote(value.victory);
    else if (tab !== 'emotes') setPreviewEmote(null);
  }, [tab, value.victory]);

  const set = useCallback(
    (patch: Partial<Cosmetics>) => {
      onChange(sanitizeCosmetics({ ...value, ...patch }));
    },
    [onChange, value],
  );

  const base = value;
  const thumbItems = (list: readonly CatalogItem[], field: keyof Cosmetics, kind: ThumbKind, tweak?: (c: Cosmetics) => Cosmetics): GridItem[] =>
    list.map((it) => {
      let c: Cosmetics = { ...base, [field]: it.id } as Cosmetics;
      if (kind === 'face') c = { ...c, hat: 'none', hair: 'none', back: 'none', outfit: 'none', face: field === 'face' ? it.id : 'none' };
      if (tweak) c = tweak(c);
      const key = `${kind}|${String(field)}|${it.id}|${c.berry}|${c.color}|${c.pattern}|${c.eyes}|${c.brows}|${c.mouth}|${c.hair}|${c.hairColor}|${c.hat}|${c.face}|${c.outfit}|${c.back}`;
      return { id: it.id, label: it.name, thumb: renderThumb(key, kind, c, it.id, name) };
    });

  let body: ReactNode = null;
  switch (tab) {
    case 'berry':
      body = (
        <>
          <Grid label="Berry type" items={thumbItems(BERRIES, 'berry', 'full', (c) => ({ ...c, hat: 'none', back: 'none' }))} selected={[value.berry]} onSelect={(id) => set({ berry: id as Cosmetics['berry'] })} />
          <h3 className="mmce-h">Pattern</h3>
          <Grid label="Pattern" items={thumbItems(PATTERNS, 'pattern', 'full', (c) => ({ ...c, outfit: 'none', hat: 'none', back: 'none' }))} selected={[value.pattern]} onSelect={(id) => set({ pattern: id })} />
        </>
      );
      break;
    case 'colour':
      body = (
        <Grid
          label="Colour"
          variant="swatches"
          items={PALETTE.map((p, i) => ({ id: String(i), label: p.name, swatch: `radial-gradient(circle at 35% 30%, ${p.light}, ${p.hex} 55%, ${p.dark})`, dim: !!takenColors?.includes(i) && i !== value.color, badge: takenColors?.includes(i) && i !== value.color ? 'taken' : undefined }))}
          selected={[String(value.color)]}
          onSelect={(id) => set({ color: Number(id) })}
        />
      );
      break;
    case 'face':
      body = (
        <>
          <h3 className="mmce-h">Eyes</h3>
          <Grid label="Eyes" items={thumbItems(EYES, 'eyes', 'face')} selected={[value.eyes]} onSelect={(id) => set({ eyes: id })} />
          <h3 className="mmce-h">Brows</h3>
          <Grid label="Brows" items={thumbItems(BROWS, 'brows', 'face')} selected={[value.brows]} onSelect={(id) => set({ brows: id })} />
          <h3 className="mmce-h">Mouth</h3>
          <Grid label="Mouth" items={thumbItems(MOUTHS, 'mouth', 'face')} selected={[value.mouth]} onSelect={(id) => set({ mouth: id })} />
        </>
      );
      break;
    case 'hair':
      body = (
        <>
          <Grid label="Hair style" items={thumbItems(HAIR, 'hair', 'top', (c) => ({ ...c, hat: 'none' }))} selected={[value.hair]} onSelect={(id) => set({ hair: id })} />
          <h3 className="mmce-h">Hair colour</h3>
          <Grid
            label="Hair colour"
            variant="swatches"
            items={HAIR_COLORS.map((h) => ({ id: h.hex, label: h.name, swatch: `radial-gradient(circle at 35% 30%, #ffffff55, ${h.hex} 55%)` }))}
            selected={[value.hairColor]}
            onSelect={(id) => set({ hairColor: id })}
          />
        </>
      );
      break;
    case 'hat':
      body = <Grid label="Hat" items={thumbItems(HATS, 'hat', 'top')} selected={[value.hat]} onSelect={(id) => set({ hat: id })} />;
      break;
    case 'faceacc':
      body = <Grid label="Face accessory" items={thumbItems(FACE, 'face', 'face')} selected={[value.face]} onSelect={(id) => set({ face: id })} />;
      break;
    case 'outfit':
      body = <Grid label="Outfit" items={thumbItems(OUTFITS, 'outfit', 'full', (c) => ({ ...c, back: 'none' }))} selected={[value.outfit]} onSelect={(id) => set({ outfit: id })} />;
      break;
    case 'back':
      body = <Grid label="Back item" items={thumbItems(BACK, 'back', 'full')} selected={[value.back]} onSelect={(id) => set({ back: id })} />;
      break;
    case 'pet':
      body = <Grid label="Pet" items={thumbItems(PETS, 'pet', 'pet')} selected={[value.pet]} onSelect={(id) => set({ pet: id })} />;
      break;
    case 'nameplate':
      body = <Grid label="Nameplate" variant="plate" items={thumbItems(NAMEPLATES, 'nameplate', 'plate')} selected={[value.nameplate]} onSelect={(id) => set({ nameplate: id })} />;
      break;
    case 'emotes':
      body = (
        <>
          <div className="mmce-count" aria-live="polite">
            {value.emotes.length} / {MAX_EMOTES} equipped — tap to toggle
          </div>
          <Grid
            label="Emotes"
            multi
            items={thumbItems(EMOTES, 'emotes', 'emote').map((it, i) => ({ ...it, badge: value.emotes.includes(it.id) ? String(value.emotes.indexOf(it.id) + 1) : undefined, label: EMOTES[i]!.name }))}
            selected={value.emotes}
            onSelect={(id) => {
              setPreviewEmote(id);
              const has = value.emotes.includes(id);
              if (has) {
                if (value.emotes.length > 1) set({ emotes: value.emotes.filter((e) => e !== id) });
              } else if (value.emotes.length < MAX_EMOTES) set({ emotes: [...value.emotes, id] });
              else set({ emotes: [...value.emotes.slice(1), id] });
            }}
          />
        </>
      );
      break;
    case 'victory':
      body = (
        <Grid
          label="Victory pose"
          items={thumbItems(VICTORY, 'victory', 'pose')}
          selected={[value.victory]}
          onSelect={(id) => {
            setPreviewEmote(id);
            set({ victory: id });
          }}
        />
      );
      break;
  }

  // Page arrows + dots scroll the item panel a screenful at a time.
  const panelRef = useRef<HTMLDivElement>(null);
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
    const t = setTimeout(measure, 120);
    return () => clearTimeout(t);
  }, [tab, measure]);
  const onPanelScroll = measure;
  const { page, pages } = pageInfo;
  const turn = (d: number): void => {
    const el = panelRef.current;
    if (!el) return;
    if (typeof el.scrollBy === 'function') el.scrollBy({ top: d * el.clientHeight, behavior: 'smooth' });
    else el.scrollTop += d * el.clientHeight;
  };

  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const i = TABS.findIndex((t) => t.id === tab);
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % TABS.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + TABS.length) % TABS.length;
    if (n < 0) return;
    e.preventDefault();
    setTab(TABS[n]!.id);
    const btn = (e.currentTarget.children[n] as HTMLElement | undefined) ?? null;
    btn?.focus();
  };

  return (
    <div className="mmce" data-testid="customize-editor">
      <style>{CSS}</style>
      <section className="mmce-stage" aria-label="Character preview">
        {use3d ? <canvas ref={canvas3d} className="mmce-canvas" /> : <canvas ref={canvas2d} className="mmce-canvas" role="img" aria-label={`${name || 'Your berry'} preview`} />}
        <div className="mmce-stagebar">
          {onNameChange ? (
            <input className="mmce-name" aria-label="Name" value={name} maxLength={16} placeholder="Your name" onChange={(e) => onNameChange(e.target.value.slice(0, 16))} />
          ) : null}
          <button type="button" className="mmce-btn" onClick={() => onChange(sanitizeCosmetics(randomCosmetics(Math.floor(Math.random() * 1e9))))}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
              <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
              <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
            </svg>
            Randomise
          </button>
          <button type="button" className="mmce-btn" onClick={() => onChange(defaultCosmetics())}>
            Reset
          </button>
          {props.onDone ? (
            <button type="button" className="mmce-btn mmce-done" onClick={props.onDone}>
              Done
            </button>
          ) : null}
        </div>
      </section>
      <div className="mmce-tabs" role="tablist" aria-label="Wardrobe sections" aria-orientation="vertical" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`mmce-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="mmce-panel" tabIndex={tab === t.id ? 0 : -1} className="mmce-tab" onClick={() => setTab(t.id)}>
            <MIcon name={t.icon} size={18} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="mmce-main">
        <div className="mmce-panel" id="mmce-panel" role="tabpanel" aria-labelledby={`mmce-tab-${tab}`} key={tab} ref={panelRef} onScroll={onPanelScroll}>
          {body}
        </div>
        <div className="mmce-pager" data-single={pages <= 1}>
          <button type="button" className="mmce-arrow" aria-label="Previous page" disabled={page <= 0} onClick={() => turn(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 21 19H3z" fill="currentColor" /></svg>
          </button>
          <div className="mmce-dots">
            {Array.from({ length: Math.min(pages, 6) }, (_, i) => (
              <span key={i} className="mmce-dot" data-on={i === Math.min(page, 5)} />
            ))}
          </div>
          <button type="button" className="mmce-arrow" aria-label="Next page" disabled={page >= pages - 1} onClick={() => turn(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19 3 5h18z" fill="currentColor" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomizeEditor;
