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

export interface CustomizeEditorProps {
  value: Cosmetics;
  onChange(c: Cosmetics): void;
  name?: string;
  onNameChange?(n: string): void;
  preview?: '2d' | '3d';
  takenColors?: number[];
}

type TabId = 'berry' | 'colour' | 'face' | 'hair' | 'hat' | 'faceacc' | 'outfit' | 'back' | 'pet' | 'nameplate' | 'emotes' | 'victory';

const TABS: { id: TabId; label: string }[] = [
  { id: 'berry', label: 'Berry' },
  { id: 'colour', label: 'Colour' },
  { id: 'face', label: 'Face' },
  { id: 'hair', label: 'Hair' },
  { id: 'hat', label: 'Hat' },
  { id: 'faceacc', label: 'Face Acc.' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'back', label: 'Back' },
  { id: 'pet', label: 'Pet' },
  { id: 'nameplate', label: 'Nameplate' },
  { id: 'emotes', label: 'Emotes' },
  { id: 'victory', label: 'Victory' },
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
        drawBerry(ctx, c, W / 2 - 12, H * 1.32, 4.6, pose);
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
.mmce{--ce-cobalt:#2f6fed;--ce-cobalt-2:#6ea1ff;--ce-teal:#14b8a6;--ce-teal-2:#2dd4bf;--ce-ink:#e8ecf6;--ce-muted:#93a0b8;
  color:var(--ce-ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  background:linear-gradient(160deg,rgba(26,33,52,.92),rgba(12,15,26,.94));border:1px solid rgba(255,255,255,.08);
  border-radius:22px;box-shadow:0 24px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.06);
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:14px;
  width:100%;max-width:1080px;box-sizing:border-box;}
.mmce *{box-sizing:border-box}
@media(min-width:760px){.mmce{grid-template-columns:minmax(280px,360px) minmax(0,1fr);padding:18px;gap:18px}}
.mmce-stage{position:relative;border-radius:18px;overflow:hidden;min-height:250px;
  background:radial-gradient(120% 90% at 50% 15%,rgba(110,161,255,.22),rgba(20,184,166,.08) 45%,rgba(8,10,18,0) 70%),linear-gradient(180deg,#1c2540,#10141f);
  border:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column}
@media(min-width:760px){.mmce-stage{position:sticky;top:12px;min-height:420px}}
.mmce-canvas{width:100%;height:250px;display:block;flex:1}
@media(min-width:760px){.mmce-canvas{height:360px}}
.mmce-stagebar{display:flex;gap:8px;padding:10px;align-items:center;flex-wrap:wrap}
.mmce-name{flex:1;min-width:120px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.28);
  color:var(--ce-ink);padding:0 12px;font-size:15px;font-weight:600;outline:none}
.mmce-name:focus{border-color:var(--ce-teal);box-shadow:0 0 0 3px rgba(20,184,166,.25)}
.mmce-btn{min-height:44px;min-width:44px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);
  color:var(--ce-ink);font-weight:700;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:transform .12s, background .15s}
.mmce-btn:hover{background:rgba(255,255,255,.12)}.mmce-btn:active{transform:scale(.97)}
.mmce-btn:focus-visible{outline:2px solid var(--ce-teal-2);outline-offset:2px}
.mmce-btn.primary{background:linear-gradient(135deg,var(--ce-cobalt),var(--ce-teal));border-color:transparent;color:#fff;box-shadow:0 6px 18px rgba(47,111,237,.35)}
.mmce-main{min-width:0;display:flex;flex-direction:column;gap:12px}
.mmce-tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px;margin:-2px;-webkit-overflow-scrolling:touch}
.mmce-tabs::-webkit-scrollbar{display:none}
.mmce-tab{flex:0 0 auto;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);
  color:var(--ce-muted);font-weight:700;font-size:13.5px;cursor:pointer;white-space:nowrap}
.mmce-tab[aria-selected=true]{color:#fff;background:linear-gradient(135deg,rgba(47,111,237,.9),rgba(20,184,166,.85));border-color:transparent;box-shadow:0 4px 14px rgba(47,111,237,.35)}
.mmce-tab:focus-visible{outline:2px solid var(--ce-teal-2);outline-offset:2px}
.mmce-panel{display:flex;flex-direction:column;gap:14px;min-width:0}
.mmce-h{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--ce-muted);font-weight:800;margin:0 0 -4px}
.mmce-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px}
.mmce-grid.wide{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.mmce-grid.swatches{grid-template-columns:repeat(auto-fill,minmax(64px,1fr))}
.mmce-item{position:relative;min-height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.035);
  color:var(--ce-ink);cursor:pointer;padding:6px 4px 7px;display:flex;flex-direction:column;align-items:center;gap:3px;transition:transform .12s, border-color .15s, background .15s}
.mmce-item:hover{background:rgba(255,255,255,.08);transform:translateY(-1px)}
.mmce-item:focus-visible{outline:2px solid var(--ce-cobalt-2);outline-offset:2px}
.mmce-item[aria-checked=true],.mmce-item[aria-pressed=true]{border-color:var(--ce-teal-2);background:rgba(20,184,166,.14);box-shadow:0 0 0 1px var(--ce-teal-2),0 6px 18px rgba(20,184,166,.22)}
.mmce-item img{width:100%;max-width:96px;aspect-ratio:144/160;object-fit:contain;pointer-events:none;image-rendering:auto}
.mmce-item.plate img{max-width:none;aspect-ratio:220/72}
.mmce-ph{width:100%;max-width:96px;aspect-ratio:144/160;border-radius:10px;background:rgba(255,255,255,.04)}
.mmce-label{font-size:11.5px;font-weight:650;line-height:1.15;text-align:center;color:#cfd7e6;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mmce-sw{width:40px;height:40px;border-radius:50%;border:2px solid rgba(0,0,0,.35);box-shadow:inset 0 -6px 10px rgba(0,0,0,.25),inset 0 4px 8px rgba(255,255,255,.35)}
.mmce-item.taken{opacity:.42}
.mmce-badge{position:absolute;top:4px;right:5px;font-size:10px;font-weight:800;padding:1px 6px;border-radius:999px;background:rgba(0,0,0,.45);color:#fff}
.mmce-count{font-size:12px;color:var(--ce-muted);font-weight:700}
.mmce-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
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
      const s = Math.min(w / 90, h / 78);
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
  const rigRef = useRef<{ setCosmetics(c: Cosmetics): void } | null>(null);
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
        cam.position.set(0, 0.95, 3.1);
        cam.lookAt(0, 0.55, 0);
        const turn = new THREE.Group();
        scene.add(turn);
        const rig = rigMod.createBerry(valueRef.current, { quality: 'high' });
        turn.add(rig.group);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshBasicMaterial({ color: 0x6ea1ff, transparent: true, opacity: 0.16 }));
        disc.rotation.x = -Math.PI / 2;
        disc.position.y = 0.001;
        scene.add(disc);
        rigRef.current = rig;
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
      if (kind === 'face') c = { ...c, hat: 'none', hair: base.hair, face: field === 'face' ? it.id : 'none' };
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

  const onTabKey = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const i = TABS.findIndex((t) => t.id === tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
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
          <button type="button" className="mmce-btn primary" onClick={() => onChange(sanitizeCosmetics(randomCosmetics(Math.floor(Math.random() * 1e9))))}>
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
        </div>
      </section>
      <div className="mmce-main">
        <div className="mmce-tabs" role="tablist" aria-label="Wardrobe sections" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={`mmce-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="mmce-panel" tabIndex={tab === t.id ? 0 : -1} className="mmce-tab" onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="mmce-panel" id="mmce-panel" role="tabpanel" aria-labelledby={`mmce-tab-${tab}`}>
          {body}
        </div>
      </div>
    </div>
  );
}

export default CustomizeEditor;
