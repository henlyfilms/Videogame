/**
 * Marion Mystery — Three.js berry rig.
 *
 * `createBerry(c)` builds a fully procedural, animated berry character:
 * toon-shaded body (lathe of the shared berry profile + painted surface
 * texture + instanced drupelets), an expressive face texture (shared painter
 * with the 2D renderer), arms with mitten hands, stubby legs with a walk
 * cycle, squash & stretch, idle fidgets, spring-driven hair, and every hat /
 * face / outfit / back item as merged vertex-coloured meshes. Feet sit at the
 * group origin, the berry faces +Z and is ~1.05 m tall.
 *
 * Geometries and materials are shared between rigs through caches; only the
 * face texture is per rig. Runs in Node (no WebGL needed to build).
 */
import * as THREE from 'three';
import type { Cosmetics } from '../core/types';
import { BERRY_BY_ID, HAT_BY_ID, paletteColor, sanitizeCosmetics, type PaletteColor } from './catalog';
import { paintFace, type Expr, type FaceState } from './paint/face';
import { hash32, mix } from './shape';
import {
  bodyDims,
  buildBack,
  buildFaceGear,
  buildHair,
  buildHat,
  buildOutfit,
  buildPet,
  buildProp,
  buildTop,
  FACE_PHI,
  FACE_T0,
  FACE_T1,
  FACE_TEX,
  faceMap,
  finish,
  GEOM_FACE,
  HIP,
  merge,
  P,
  profilePoints,
  setDetail,
  sleeveFor,
  type AnimPart,
  type BodyDims,
  type Geo,
  type PartSet,
} from './rig3d-parts';

export type Quality = 'low' | 'medium' | 'high';
export type OneShot = 'wave' | 'celebrate' | 'sulk' | 'scared' | 'knife-twirl' | 'gun-spin' | 'magnify' | 'shrug' | 'kill-lunge' | 'squish';
export type Held = 'gun' | 'knife' | 'flashlight' | null;

export interface RigState {
  moving: boolean;
  speed?: number;
  emote?: string | null;
  ghost?: boolean;
  hold?: Held;
  scared?: boolean;
  lookYaw?: number;
}

export interface BerryRig {
  group: THREE.Group;
  height: number;
  update(dt: number, s: RigState): void;
  play(oneShot: OneShot): void;
  setCosmetics(c: Cosmetics): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Shared materials

let gradient: THREE.DataTexture | null = null;
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([92, 168, 232, 255]), 4, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

/** Fresnel-ish rim light injected into the toon shader. */
function addRim(m: THREE.MeshToonMaterial, strength = 0.42): THREE.MeshToonMaterial {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
       outgoingLight += vec3(0.62, 0.7, 1.0) * pow(rimF, 2.6) * ${strength.toFixed(2)};
       #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => `berry-rim-${strength}`;
  return m;
}

const mats = new Map<string, THREE.Material>();
function cachedMat<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}

function ghostify<T extends THREE.Material>(m: T): T {
  m.transparent = true;
  m.opacity = 0.42;
  m.depthWrite = false;
  return m;
}

type MatKind = 'vc' | 'vcd' | 'glass' | 'detail' | 'gloss' | 'shadow' | 'tail';

function kindMat(kind: MatKind, ghost: boolean): THREE.Material {
  return cachedMat(`${kind}|${ghost ? 1 : 0}`, () => {
    let m: THREE.Material;
    switch (kind) {
      case 'vc':
        m = addRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
        break;
      case 'vcd':
        m = addRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side: THREE.DoubleSide }));
        break;
      case 'glass':
        m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
        break;
      case 'detail':
        m = addRim(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGradient() }), 0.3);
        break;
      case 'gloss':
        m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
        break;
      case 'shadow':
        m = new THREE.MeshBasicMaterial({ color: 0x0a0816, transparent: true, opacity: 0.3, depthWrite: false, map: shadowTexture() });
        break;
      case 'tail':
        m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), transparent: true, opacity: 0.8, side: THREE.DoubleSide });
        break;
    }
    if (ghost && kind !== 'shadow') ghostify(m);
    return m;
  });
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  try {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  } catch {
    /* none */
  }
  return null;
}

function ctx2d(c: HTMLCanvasElement | OffscreenCanvas | null): CanvasRenderingContext2D | null {
  if (!c) return null;
  try {
    return (c.getContext('2d') as CanvasRenderingContext2D | null) ?? null;
  } catch {
    return null;
  }
}

let shadowTex: THREE.Texture | null | undefined;
function shadowTexture(): THREE.Texture | null {
  if (shadowTex !== undefined) return shadowTex;
  const cv = makeCanvas(64, 64);
  const cx = ctx2d(cv);
  if (!cv || !cx) return (shadowTex = null);
  const g = cx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(cv as HTMLCanvasElement);
  return shadowTex;
}

// ---------------------------------------------------------------------------
// Body texture (albedo + surface detail + pattern painted in lathe UV space)

function paintBodyTexture(cx: CanvasRenderingContext2D, c: Cosmetics, d: BodyDims, W: number, Ht: number, instanced: boolean): void {
  const pal = paletteColor(c.color);
  const def = BERRY_BY_ID[c.berry];
  const g = cx.createLinearGradient(0, 0, 0, Ht);
  g.addColorStop(0, mix(pal.light, pal.hex, 0.45));
  g.addColorStop(0.45, pal.hex);
  g.addColorStop(1, mix(pal.dark, pal.hex, 0.35));
  cx.fillStyle = g;
  cx.fillRect(0, 0, W, Ht);
  const rnd = mulberry(hash32(c.berry + c.pattern));
  const yOf = (t: number): number => (1 - t) * Ht;
  const inFace = (u: number, t: number, pad = 0): boolean => Math.abs(u - 0.5) < 0.12 + pad && t > d.tf - 0.22 - pad && t < d.tf + 0.14 + pad;
  // Size helpers: metres -> px at height t.
  const pu = (m: number, t: number): number => (m / (2 * Math.PI * Math.max(0.03, d.rAt(t)))) * W;
  const pv = (m: number): number => (m / d.H) * Ht;
  const dot = (u: number, t: number, rm: number, col: string, ry = rm): void => {
    cx.beginPath();
    cx.ellipse(u * W, yOf(t), Math.max(0.6, pu(rm, t)), Math.max(0.6, pv(ry)), 0, 0, Math.PI * 2);
    cx.fillStyle = col;
    cx.fill();
  };
  const rows = (spacing: number, from: number, to: number, fn: (u: number, t: number, row: number) => void): void => {
    let row = 0;
    for (let t = from; t < to; t += spacing / d.H, row++) {
      const n = Math.max(3, Math.round((2 * Math.PI * d.rAt(t)) / spacing));
      for (let i = 0; i < n; i++) fn((i + (row % 2) * 0.5) / n, t, row);
    }
  };
  switch (def.surface) {
    case 'seeds': {
      const seed = luma(pal.hex) > 0.72 ? pal.dark : '#ffe7a3';
      rows(0.06, 0.08, 0.86, (u, t) => {
        if (inFace(u, t)) return;
        dot(u, t - 0.004, 0.011, 'rgba(40,10,20,0.28)', 0.014);
        dot(u, t, 0.006, seed, 0.01);
      });
      break;
    }
    case 'bloom':
      for (let i = 0; i < 900; i++) {
        cx.fillStyle = `rgba(236,240,255,${0.08 + rnd() * 0.16})`;
        cx.fillRect(rnd() * W, rnd() * Ht, 1.2, 1.2);
      }
      cx.fillStyle = 'rgba(235,240,255,0.16)';
      cx.fillRect(0, 0, W, Ht * 0.6);
      break;
    case 'drupelets':
    case 'glossy-drupelets':
    case 'cluster': {
      const rd = d.R * def.bumpSize * (def.surface === 'cluster' ? 0.55 : 0.75);
      rows(rd * 1.7, 0.03, 0.98, (u, t) => {
        const face = inFace(u, t);
        if (instanced && !face) return;
        dot(u, t, rd * 0.95, mix(pal.dark, pal.hex, 0.4));
        dot(u - 0.002, t + 0.004, rd * 0.7, face ? pal.hex : mix(pal.light, pal.hex, 0.4));
        if (!face) dot(u - 0.004, t + 0.012, rd * 0.22, 'rgba(255,255,255,0.7)');
      });
      break;
    }
    case 'stripes': {
      const gl = cx.createLinearGradient(0, 0, W, 0);
      gl.addColorStop(0.3, 'rgba(255,255,255,0)');
      gl.addColorStop(0.5, `rgba(255,255,255,0.22)`);
      gl.addColorStop(0.7, 'rgba(255,255,255,0)');
      cx.fillStyle = gl;
      cx.fillRect(0, 0, W, Ht);
      cx.strokeStyle = mix(pal.light, '#ffffff', 0.3);
      cx.globalAlpha = 0.55;
      cx.lineWidth = 2;
      for (let k = 0; k < 12; k++) {
        const x = (k / 12) * W + W / 24;
        cx.beginPath();
        cx.moveTo(x, 0);
        cx.lineTo(x, Ht);
        cx.stroke();
      }
      cx.globalAlpha = 1;
      break;
    }
    case 'smooth':
      if (c.berry === 'cranberry')
        for (let i = 0; i < 60; i++) {
          const u = rnd();
          const t = 0.1 + rnd() * 0.8;
          if (!inFace(u, t)) dot(u, t, 0.005, 'rgba(255,220,220,0.45)');
        }
      break;
    case 'shimmer':
      cx.save();
      cx.globalAlpha = 0.18;
      cx.fillStyle = '#fff6c8';
      for (let i = -4; i < 14; i++) {
        cx.beginPath();
        cx.moveTo(i * 40, 0);
        cx.lineTo(i * 40 + 14, 0);
        cx.lineTo(i * 40 + 14 + 60, Ht);
        cx.lineTo(i * 40 + 60, Ht);
        cx.fill();
      }
      cx.restore();
      break;
  }
  // Pattern.
  const light = luma(pal.hex) > 0.8 ? pal.dark : mix(pal.light, '#ffffff', 0.3);
  switch (c.pattern) {
    case 'speckle':
      for (let i = 0; i < 160; i++) {
        const u = rnd();
        const t = 0.05 + rnd() * 0.9;
        if (!inFace(u, t)) dot(u, t, 0.006 + rnd() * 0.004, light);
      }
      break;
    case 'stripes':
      cx.save();
      cx.globalAlpha = 0.32;
      cx.fillStyle = light;
      for (let i = -6; i < 24; i++) {
        cx.beginPath();
        cx.moveTo(i * 26, 0);
        cx.lineTo(i * 26 + 10, 0);
        cx.lineTo(i * 26 + 10 + Ht * 0.6, Ht);
        cx.lineTo(i * 26 + Ht * 0.6, Ht);
        cx.fill();
      }
      cx.restore();
      break;
    case 'stars':
    case 'hearts':
      for (let i = 0; i < 26; i++) {
        const u = rnd();
        const t = 0.08 + rnd() * 0.84;
        if (inFace(u, t, 0.03)) continue;
        cx.save();
        cx.translate(u * W, yOf(t));
        cx.scale(pu(0.02, t) / 10, pv(0.02) / 10);
        cx.beginPath();
        if (c.pattern === 'stars') {
          for (let k = 0; k <= 10; k++) {
            const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
            const r = k % 2 ? 4.5 : 10;
            cx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
        } else {
          cx.moveTo(0, 9);
          cx.bezierCurveTo(-13, 0, -7, -10, 0, -3.5);
          cx.bezierCurveTo(7, -10, 13, 0, 0, 9);
        }
        cx.fillStyle = c.pattern === 'stars' ? '#fff6c2' : '#ffd1e6';
        cx.globalAlpha = 0.85;
        cx.fill();
        cx.restore();
      }
      break;
    case 'freckles':
      for (const side of [-1, 1])
        for (let i = 0; i < 6; i++) dot(0.5 + side * (0.075 + (i % 3) * 0.018), d.tf - 0.1 - Math.floor(i / 3) * 0.03, 0.005, pal.dark);
      break;
    case 'gradient': {
      const gg = cx.createLinearGradient(0, 0, 0, Ht);
      gg.addColorStop(0, 'rgba(255,255,255,0)');
      gg.addColorStop(1, mix(pal.light, '#ff9f6b', 0.55));
      cx.globalAlpha = 0.75;
      cx.fillStyle = gg;
      cx.fillRect(0, Ht * 0.3, W, Ht * 0.7);
      cx.globalAlpha = 1;
      break;
    }
    case 'spots':
      for (let i = 0; i < 16; i++) {
        const u = rnd();
        const t = 0.1 + rnd() * 0.8;
        if (!inFace(u, t, 0.05)) dot(u, t, 0.035 + rnd() * 0.02, 'rgba(20,10,30,0.3)', 0.03);
      }
      break;
    case 'zigzag':
    case 'groovy':
      cx.lineWidth = c.pattern === 'groovy' ? 8 : 5;
      for (let k = 0; k < 4; k++) {
        cx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const y = Ht * (0.15 + k * 0.22) + (c.pattern === 'groovy' ? Math.sin((x / W) * Math.PI * 8 + k) * 10 : ((x / 16) % 2 < 1 ? -6 : 6));
          cx.lineTo(x, y);
        }
        cx.strokeStyle = c.pattern === 'groovy' ? (k % 2 ? 'rgba(255,134,191,0.4)' : 'rgba(139,92,246,0.35)') : light;
        cx.globalAlpha = c.pattern === 'zigzag' ? 0.45 : 1;
        cx.stroke();
        cx.globalAlpha = 1;
      }
      break;
  }
}

function luma(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bodyMat(c: Cosmetics, d: BodyDims, q: Quality, ghost: boolean): THREE.Material {
  const instanced = q !== 'low' && hasInstancedDetail(c.berry);
  const key = `body|${c.berry}|${c.color}|${c.pattern}|${q === 'low' ? 'l' : 'h'}|${instanced ? 1 : 0}`;
  const tex = cachedTex(key, () => {
    const W = q === 'low' ? 256 : 512;
    const Ht = q === 'low' ? 128 : 256;
    const cv = makeCanvas(W, Ht);
    const cx = ctx2d(cv);
    if (!cv || !cx) return null;
    paintBodyTexture(cx, c, d, W, Ht, instanced);
    const t = new THREE.CanvasTexture(cv as HTMLCanvasElement);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  });
  return cachedMat(`${key}|${ghost ? 1 : 0}`, () => {
    const m = addRim(new THREE.MeshToonMaterial({ gradientMap: toonGradient(), map: tex ?? null, color: tex ? 0xffffff : paletteColor(c.color).hex }), 0.5);
    return ghost ? ghostify(m) : m;
  });
}

const texCache = new Map<string, THREE.Texture | null>();
function cachedTex(key: string, make: () => THREE.Texture | null): THREE.Texture | null {
  if (!texCache.has(key)) texCache.set(key, make());
  return texCache.get(key) ?? null;
}

// ---------------------------------------------------------------------------
// Shared geometry caches

const geos = new Map<string, Geo | null>();
function cachedGeo(key: string, make: () => Geo | null): Geo | null {
  if (!geos.has(key)) geos.set(key, make());
  return geos.get(key) ?? null;
}

function hasInstancedDetail(berry: Cosmetics['berry']): boolean {
  const s = BERRY_BY_ID[berry].surface;
  return s === 'drupelets' || s === 'glossy-drupelets' || s === 'cluster';
}

function bodyGeo(d: BodyDims, q: Quality, shrink: number): Geo {
  return cachedGeo(`bodygeo|${d.berry}|${q}|${shrink}`, () => {
    const n = q === 'low' ? 14 : 22;
    const segs = q === 'low' ? 18 : q === 'medium' ? 30 : 40;
    const pts = profilePoints(d, 0, 1, n, shrink);
    return new THREE.LatheGeometry(pts, segs, Math.PI, Math.PI * 2);
  })!;
}

function facePatchGeo(d: BodyDims, q: Quality): Geo {
  return cachedGeo(`face|${d.berry}|${q}`, () => {
    const pts: THREE.Vector2[] = [];
    const n = q === 'low' ? 8 : 14;
    for (let i = 0; i <= n; i++) {
      const t = d.tf + FACE_T0 + ((FACE_T1 - FACE_T0) * i) / n;
      pts.push(new THREE.Vector2(d.rAt(t) + 0.004, d.yAt(t)));
    }
    return new THREE.LatheGeometry(pts, q === 'low' ? 12 : 22, -FACE_PHI, FACE_PHI * 2);
  })!;
}

interface DetailLayout {
  matrices: Float32Array;
  count: number;
  radius: number;
}

function detailLayout(d: BodyDims, q: Quality): DetailLayout {
  const key = `detail|${d.berry}|${q}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  const def = BERRY_BY_ID[d.berry];
  const cluster = def.surface === 'cluster';
  const max = q === 'high' ? 230 : 130;
  let rd = d.R * def.bumpSize * (cluster ? 0.62 : 0.78);
  const mats: number[] = [];
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 0, 1);
  for (let attempt = 0; attempt < 4; attempt++) {
    mats.length = 0;
    let row = 0;
    for (let t = 0.04; t < 0.985; t += (rd * 1.55) / d.H, row++) {
      const r = d.rAt(t);
      const n = Math.max(3, Math.floor((2 * Math.PI * r) / (rd * 1.8)));
      for (let i = 0; i < n; i++) {
        const phi = ((i + (row % 2) * 0.5) / n) * Math.PI * 2;
        const a = Math.atan2(Math.sin(phi), Math.cos(phi));
        if (Math.abs(a) < 0.62 && t > d.tf - 0.24 && t < d.tf + 0.16) continue;
        const nrm = new THREE.Vector3(Math.sin(phi), 0.15 * (t - 0.5), Math.cos(phi)).normalize();
        pos.set(Math.sin(phi) * (r - rd * 0.25), d.yAt(t), Math.cos(phi) * (r - rd * 0.25));
        quat.setFromUnitVectors(up, nrm);
        sc.set(rd, rd, rd * 0.8);
        m.compose(pos, quat, sc);
        mats.push(...m.elements);
      }
    }
    if (mats.length / 16 <= max) break;
    rd *= 1.18;
  }
  const out = { matrices: new Float32Array(mats), count: mats.length / 16, radius: rd };
  layoutCache.set(key, out);
  return out;
}
const layoutCache = new Map<string, DetailLayout>();

function topVisible(c: Cosmetics): boolean {
  const hat = HAT_BY_ID.get(c.hat);
  if (hat?.covers) return false;
  return c.hair === 'none' || c.hair === 'tuft' || c.hair === 'leafy' || c.hair === 'afro';
}

function hatScale(d: BodyDims): number {
  return Math.min(1.25, Math.max(0.85, d.sAt(0.85) / 0.27));
}

// ---------------------------------------------------------------------------
// Pose model

interface ArmPose {
  x: number;
  z: number;
}
interface Pose3 {
  bob: number;
  squash: number;
  leanX: number;
  rollZ: number;
  yaw: number;
  fwd: number;
  armL: ArmPose;
  armR: ArmPose;
  legL: number;
  legR: number;
  liftL: number;
  liftR: number;
  sit: number;
  expr: Expr;
  lookX: number;
  lookY: number;
  talk: number;
  prop: Held | 'magnifier';
  propSpin: number;
}

const ONE_SHOT_DUR: Record<OneShot, number> = {
  wave: 1.6,
  celebrate: 1.9,
  sulk: 2.2,
  scared: 1.2,
  'knife-twirl': 1.2,
  'gun-spin': 1.2,
  magnify: 2.0,
  shrug: 1.3,
  'kill-lunge': 0.65,
  squish: 0.4,
};

const ease = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

function blinkOpen(time: number, seed: number): number {
  const period = 3.1 + (seed % 17) / 10;
  const p = (time + (seed % 97) / 13) % period;
  if (p < 0.07) return 1 - p / 0.07;
  if (p < 0.15) return (p - 0.07) / 0.08;
  return 1;
}

// ---------------------------------------------------------------------------
// Rig

interface Built {
  dims: BodyDims;
  pal: PaletteColor;
  meshes: THREE.Object3D[];
  anims: { obj: THREE.Object3D; part: AnimPart }[];
  hairTail: THREE.Object3D | null;
  hairStiff: number;
  armL: THREE.Group;
  armR: THREE.Group;
  hand: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  ghostTail: THREE.Mesh;
  shoulderY: number;
}

export function createBerry(cIn: Cosmetics, opts?: { quality?: Quality }): BerryRig {
  const quality: Quality = opts?.quality ?? 'medium';
  let c = sanitizeCosmetics(cIn);
  const group = new THREE.Group();
  group.name = 'berry';
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = HIP;
  const inner = new THREE.Group();
  inner.position.y = -HIP;
  bodyPivot.add(inner);
  group.add(bodyPivot);

  // Per-rig face texture.
  const faceCanvas = makeCanvas(FACE_TEX, FACE_TEX);
  const faceCtx = ctx2d(faceCanvas);
  const faceTex = faceCanvas ? new THREE.CanvasTexture(faceCanvas as HTMLCanvasElement) : null;
  if (faceTex) {
    faceTex.colorSpace = THREE.SRGBColorSpace;
    faceTex.anisotropy = 4;
  }
  const faceMatN = new THREE.MeshToonMaterial({ map: faceTex, transparent: true, depthWrite: false, gradientMap: toonGradient(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const faceMatG = ghostify(faceMatN.clone());
  faceMatG.opacity = 0.5;
  let faceKey = '';

  let ghost = false;
  let disposed = false;
  let time = 0;
  let walkPhase = 0;
  let mv = 0;
  let oneShot: { id: OneShot; t: number } | null = null;
  let squished = false;
  let hairAng = 0;
  let hairVel = 0;
  let hairSide = 0;
  let hairSideVel = 0;
  let lastBob = 0;
  let curProp: string | null = null;
  let propMesh: THREE.Object3D | null = null;
  const seed = hash32(`${c.berry}${c.color}${c.eyes}${c.hair}`) % 1000;

  const mesh = (geo: Geo, kind: MatKind | 'body' | 'face', parent: THREE.Object3D, name: string): THREE.Mesh => {
    const m = new THREE.Mesh(geo, kind === 'body' ? bodyMat(c, built.dims, quality, false) : kind === 'face' ? faceMatN : kindMat(kind, false));
    m.userData.matKind = kind;
    m.name = name;
    parent.add(m);
    return m;
  };

  const applyMaterials = (): void => {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      const k = m.userData?.matKind as MatKind | 'body' | 'face' | 'detailInst' | undefined;
      if (!k || !m.isMesh) return;
      if (k === 'body') m.material = bodyMat(c, built.dims, quality, ghost);
      else if (k === 'face') m.material = ghost ? faceMatG : faceMatN;
      else if (k === 'detailInst') m.material = kindMat('detail', ghost);
      else m.material = kindMat(k, ghost);
    });
  };

  let built: Built = null as unknown as Built;

  function addParts(set: PartSet, parent: THREE.Object3D, prefix: string, keyBase: string, out: THREE.Object3D[], anims: Built['anims'], skipSolid = false): void {
    if (!skipSolid) {
      const g = cachedGeo(`${keyBase}|s`, () => merge(set.solid));
      if (g) out.push(mesh(g, 'vc', parent, `${prefix}-solid`));
    }
    if (set.glass) {
      const g = cachedGeo(`${keyBase}|g`, () => merge(set.glass!));
      if (g) out.push(mesh(g, 'glass', parent, `${prefix}-glass`));
    }
    set.anim?.forEach((a, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(a.pivot[0], a.pivot[1], a.pivot[2]);
      parent.add(pivot);
      const g = cachedGeo(`${keyBase}|a${i}`, () => merge(a.geos));
      if (g) mesh(g, 'vc', pivot, `${prefix}-anim${i}`);
      out.push(pivot);
      anims.push({ obj: pivot, part: a });
    });
  }

  /** Part sets: geometry is cached per key; anim callbacks are kept alongside. */
  function partsCached(key: string, make: () => PartSet): PartSet {
    if (animOnly.has(key)) return { solid: [], ...cachedSetShape(key) };
    setDetail(quality);
    const set = make();
    animOnly.set(key, { hasGlass: !!set.glass?.length, anim: set.anim?.map((a) => ({ pivot: a.pivot, update: a.update })) ?? [] });
    return set;
  }

  function build(): void {
    // Clear previous.
    for (const ch of [...inner.children]) inner.remove(ch);
    for (const ch of [...group.children]) if (ch !== bodyPivot) group.remove(ch);
    propMesh = null;
    curProp = null;
    setDetail(quality);
    const d = bodyDims(c.berry);
    const pal = paletteColor(c.color);
    const meshes: THREE.Object3D[] = [];
    const anims: Built['anims'] = [];
    built = { dims: d } as Built;
    built.pal = pal;

    // Shadow.
    if (quality !== 'low') {
      const sg = cachedGeo('shadow', () => new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2))!;
      const sm = new THREE.Mesh(sg, kindMat('shadow', false));
      sm.position.y = 0.004;
      sm.renderOrder = -1;
      sm.name = 'shadow';
      group.add(sm);
    }

    // Body.
    const instanced = quality !== 'low' && hasInstancedDetail(c.berry);
    mesh(bodyGeo(d, quality, instanced ? 0.95 : 1), 'body', inner, 'body');
    if (instanced) {
      const lay = detailLayout(d, quality);
      const sg = cachedGeo(`drupe|${quality}`, () => new THREE.IcosahedronGeometry(1, 1))!;
      const im = new THREE.InstancedMesh(sg, kindMat('detail', false), lay.count);
      im.instanceMatrix.array.set(lay.matrices);
      im.instanceMatrix.needsUpdate = true;
      const r = mulberry(hash32(c.berry) ^ c.color);
      const col = new THREE.Color();
      const base = new THREE.Color(pal.hex);
      const lt = new THREE.Color(pal.light);
      const dk = new THREE.Color(pal.dark);
      for (let i = 0; i < lay.count; i++) {
        const k = r();
        col.copy(base).lerp(k < 0.5 ? dk : lt, Math.abs(k - 0.5) * 0.7);
        im.setColorAt(i, col);
      }
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.userData.matKind = 'detailInst';
      im.name = 'drupelets';
      inner.add(im);
    }
    // Gloss highlight.
    if (quality !== 'low') {
      const gl = 0.35 + BERRY_BY_ID[c.berry].gloss * 0.5;
      const t = 0.87;
      const phi = -0.8;
      const p = new THREE.Vector3(Math.sin(phi) * d.sAt(t), d.yAt(t) + d.bump * 0.5, Math.cos(phi) * d.sAt(t));
      const gg = cachedGeo(`gloss|${c.berry}`, () => {
        const g = new THREE.SphereGeometry(1, 12, 8);
        g.scale(0.075, 0.042, 0.02);
        g.rotateZ(0.5);
        g.lookAt(new THREE.Vector3(p.x, p.y - d.yAt(0.5), p.z));
        g.translate(p.x * 1.01, p.y, p.z * 1.01);
        return g;
      })!;
      const gm = mesh(gg, 'gloss', inner, 'gloss');
      gm.visible = gl > 0.3;
    }
    // Face patch.
    mesh(facePatchGeo(d, quality), 'face', inner, 'face');
    faceKey = '';

    // Static accessories: top decor + outfit + face gear + back solids.
    const topVis = topVisible(c);
    const statKey = `stat|${c.berry}|${c.outfit}|${c.face}|${c.back}|${topVis ? 1 : 0}|${quality}`;
    const backKey = `back|${c.berry}|${c.back}|${quality}`;
    const faceGearKey = `facegear|${c.berry}|${c.face}|${quality}`;
    const statGeo = cachedGeo(statKey, () => {
      const list: Geo[] = [];
      if (topVis) list.push(...buildTop(d));
      list.push(...buildOutfit(c.outfit, d));
      return merge(list);
    });
    if (statGeo) meshes.push(mesh(statGeo, 'vc', inner, 'accessories'));
    addParts(partsCached(faceGearKey, () => buildFaceGear(c.face, d)), inner, 'face', faceGearKey, meshes, anims);
    addParts(partsCached(backKey, () => buildBack(c.back, d)), inner, 'back', backKey, meshes, anims);

    // Headwear: hat + hair cap.
    const head = new THREE.Group();
    head.position.y = d.top + d.bump * 0.7;
    head.name = 'head';
    inner.add(head);
    const hatDef = HAT_BY_ID.get(c.hat);
    const covered = !!hatDef?.covers;
    const hk = hatScale(d);
    const hatKey = `hat|${c.hat}|${c.hairColor}|${c.color}|${c.berry}|${quality}`;
    const hatSet = partsCached(hatKey, () => {
      const s = buildHat(c.hat, c.hairColor, pal.dark);
      const sc = (g: Geo): Geo => g.scale(hk, hk, hk);
      s.solid.forEach(sc);
      s.glass?.forEach(sc);
      s.anim?.forEach((a) => a.geos.forEach(sc));
      return s;
    });
    hatSet.anim = hatSet.anim?.map((a) => ({ ...a, pivot: [a.pivot[0] * hk, a.pivot[1] * hk, a.pivot[2] * hk] as const }));
    const hairKey = `hair|${c.hair}|${c.hairColor}|${c.berry}|${covered ? 1 : 0}|${quality}`;
    let tailInfo: { pivot: readonly [number, number, number]; stiffness: number } | null = null;
    const capGeo = cachedGeo(hairKey, () => {
      setDetail(quality);
      const hp = buildHair(c.hair, d, c.hairColor, covered);
      if (hp.tail) {
        tailCache.set(hairKey, { pivot: hp.tail.pivot, stiffness: hp.tail.stiffness });
        geos.set(`${hairKey}|tail`, merge(hp.tail.geos));
      }
      return merge(hp.cap);
    });
    tailInfo = tailCache.get(hairKey) ?? null;
    // Merge hat solids + hair cap for a single headwear draw call.
    const headKey = `${hatKey}|${hairKey}|head`;
    const hatSolid = cachedGeo(`${hatKey}|s`, () => merge(hatSet.solid));
    const headGeo = cachedGeo(headKey, () => {
      const parts: Geo[] = [];
      if (hatSolid) parts.push(hatSolid.clone());
      if (capGeo) parts.push(capGeo.clone());
      return merge(parts);
    });
    if (headGeo) meshes.push(mesh(headGeo, 'vc', head, 'headwear'));
    addParts(hatSet, head, 'hat', hatKey, meshes, anims, true);
    let hairTail: THREE.Object3D | null = null;
    const tailGeo = geos.get(`${hairKey}|tail`);
    if (tailGeo && tailInfo) {
      hairTail = new THREE.Group();
      hairTail.position.set(tailInfo.pivot[0], tailInfo.pivot[1], tailInfo.pivot[2]);
      head.add(hairTail);
      mesh(tailGeo, 'vcd', hairTail, 'hair-tail');
    }

    // Arms.
    const ts = 0.31;
    const shoulderY = d.yAt(ts);
    const sx = d.sAt(ts) - 0.02;
    const sleeve = sleeveFor(c.outfit) ?? mix(pal.hex, pal.dark, 0.35);
    const mitten = mix(mix(pal.light, '#ffffff', 0.55), '#ffffff', 0.1);
    const armGeo = cachedGeo(`arm|${sleeve}|${mitten}|${quality}`, () => {
      setDetail(quality);
      return merge([P.capsule(0.036, 0.13, sleeve, [0, -0.09, 0]), P.sphere(0.058, mitten, [0, -0.2, 0], [1, 0.95, 0.9]), P.sphere(0.026, mitten, [0, -0.18, 0.05])]);
    })!;
    const mkArm = (side: 1 | -1): THREE.Group => {
      const a = new THREE.Group();
      a.position.set(side * sx, shoulderY, 0);
      inner.add(a);
      mesh(armGeo, 'vc', a, side > 0 ? 'armL' : 'armR');
      return a;
    };
    const armL = mkArm(1);
    const armR = mkArm(-1);
    const hand = new THREE.Group();
    hand.position.set(0, -0.2, 0.02);
    armR.add(hand);

    // Legs (outside the squash pivot).
    const legCol = mix(pal.dark, '#1a1424', 0.25);
    const shoe = mix(pal.dark, '#1a1424', 0.55);
    const legGeo = cachedGeo(`leg|${legCol}|${quality}`, () => {
      setDetail(quality);
      return merge([P.cyl(0.038, 0.034, 0.1, legCol, [0, -0.05, 0]), P.sphere(0.065, shoe, [0, -0.1, 0.03], [1, 0.58, 1.4]), P.sphere(0.03, mix(shoe, '#ffffff', 0.3), [0, -0.085, 0.09], [1, 0.4, 0.6])]);
    })!;
    const mkLeg = (side: 1 | -1): THREE.Group => {
      const l = new THREE.Group();
      l.position.set(side * 0.1, 0.135, 0);
      group.add(l);
      mesh(legGeo, 'vc', l, side > 0 ? 'legL' : 'legR');
      return l;
    };
    const legL = mkLeg(1);
    const legR = mkLeg(-1);

    // Ghost tail (hidden unless ghost).
    const gtGeo = cachedGeo(`ghosttail|${c.berry}|${c.color}`, () => {
      setDetail(quality);
      const g = new THREE.ConeGeometry(d.rAt(0.2) * 0.95, 0.32, 16, 3, true);
      const p = g.attributes.position!;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const k = (0.16 - y) / 0.32;
        p.setX(i, p.getX(i) + Math.sin(k * 6) * 0.03 * k);
      }
      return finish(g, pal.light, [0, d.y0 - 0.1, 0], [Math.PI, 0, 0]);
    })!;
    const ghostTail = mesh(gtGeo, 'tail', inner, 'ghost-tail');
    ghostTail.visible = false;

    built = { dims: d, pal, meshes, anims, hairTail, hairStiff: tailInfo?.stiffness ?? 20, armL, armR, hand, legL, legR, ghostTail, shoulderY };
    applyMaterials();
    paintFaceNow(1, 1, 0, 'normal', 0, true);
  }

  function paintFaceNow(open: number, lookX: number, lookY: number, expr: Expr, talk: number, force = false): void {
    if (!faceCtx || !faceTex) return;
    const googly = c.eyes === 'googly' || expr === 'scared';
    const key = `${Math.round(open * 4)}|${Math.round(lookX * 4)}|${Math.round(lookY * 3)}|${expr}|${Math.round(talk * 3)}|${googly ? Math.floor(time * 15) : 0}`;
    if (!force && key === faceKey) return;
    faceKey = key;
    const d = built.dims;
    const fm = faceMap(d);
    const pal = built.pal;
    faceCtx.setTransform(1, 0, 0, 1, 0, 0);
    faceCtx.clearRect(0, 0, FACE_TEX, FACE_TEX);
    faceCtx.setTransform(fm.kx, 0, 0, fm.ky, FACE_TEX / 2, fm.cy);
    const geomFace = GEOM_FACE.has(c.face);
    const st: FaceState = {
      time,
      open,
      lookX,
      lookY,
      expr,
      moving: mv > 0.5,
      threeQuarter: false,
      skin: pal.hex,
      skinDark: mix(pal.hex, pal.dark, 0.5),
      brow: c.hair !== 'none' ? mix(c.hairColor, '#1a1220', 0.35) : mix(pal.dark, '#120c1c', 0.45),
      hair: c.hairColor,
      talk,
      noAccessory: geomFace,
      forceHideEyes: geomFace && ['shades', 'starglasses', 'heartglasses', '3dglasses', 'visor', 'vr'].includes(c.face) ? true : undefined,
    };
    paintFace(faceCtx, c, st);
    faceTex.needsUpdate = true;
  }

  function computePose(s: RigState): Pose3 {
    const t = time;
    const ph = walkPhase;
    const p: Pose3 = {
      bob: 0,
      squash: 0,
      leanX: 0,
      rollZ: 0,
      yaw: 0,
      fwd: 0,
      armL: { x: 0, z: 0.18 },
      armR: { x: 0, z: 0.18 },
      legL: 0,
      legR: 0,
      liftL: 0,
      liftR: 0,
      sit: 0,
      expr: 'normal',
      lookX: 0,
      lookY: 0,
      talk: 0,
      prop: s.hold ?? null,
      propSpin: 0,
    };
    // Idle.
    const br = Math.sin(t * 2.3 + seed);
    p.squash = br * 0.022 * (1 - mv);
    p.bob = (br + 1) * 0.004 * (1 - mv);
    p.rollZ = Math.sin(t * 0.9 + seed) * 0.03 * (1 - mv);
    p.armL.x = Math.sin(t * 1.7 + seed) * 0.06;
    p.armR.x = -Math.sin(t * 1.7 + seed) * 0.06;
    const f = (t + (seed % 50) / 7) % 7.5;
    if (mv < 0.5) {
      if (f < 0.9) p.lookX = -0.9;
      else if (f < 1.6) p.lookX = 0.9;
      if (f > 4 && f < 4.5) {
        const k = Math.sin(((f - 4) / 0.5) * Math.PI);
        p.bob += k * 0.05;
        p.squash -= k * 0.06;
        p.armL.z += k * 0.6;
        p.armR.z += k * 0.6;
      }
    }
    // Walk (blended).
    if (mv > 0.001) {
      const sw = Math.sin(ph);
      p.legL = sw * 0.75 * mv;
      p.legR = -sw * 0.75 * mv;
      p.liftL = Math.max(0, -Math.cos(ph)) * 0.04 * mv;
      p.liftR = Math.max(0, Math.cos(ph)) * 0.04 * mv;
      p.armL.x += -p.legL * 1.05;
      p.armR.x += -p.legR * 1.05;
      p.bob += Math.abs(Math.sin(ph)) * 0.045 * mv;
      p.squash += Math.cos(ph * 2) * 0.05 * mv;
      p.leanX += 0.12 * mv;
      p.rollZ += Math.sin(ph) * 0.05 * mv;
    }
    if (s.ghost) {
      p.bob = 0.12 + Math.sin(t * 2.1 + seed) * 0.04;
      p.armL = { x: -0.3 + Math.sin(t * 1.6) * 0.2, z: 0.6 };
      p.armR = { x: -0.3 - Math.sin(t * 1.6) * 0.2, z: 0.6 };
      p.leanX = 0.1 * mv;
      p.squash = Math.sin(t * 2) * 0.03;
    }
    if (s.hold === 'gun' || s.hold === 'flashlight') p.armR = { x: -1.45, z: 0.12 };
    else if (s.hold === 'knife') p.armR = { x: -1.1 + Math.sin(t * 3) * 0.08, z: 0.25 };
    if (s.scared) {
      p.expr = 'scared';
      p.rollZ += Math.sin(t * 50) * 0.02;
      if (!s.hold) {
        p.armL = { x: -2.2, z: 0.7 };
        p.armR = { x: -2.2, z: 0.7 };
      }
    }
    const w = Math.sin(t * 9);
    switch (s.emote ?? '') {
      case 'wave':
        p.armR = { x: -0.25, z: 2.6 + w * 0.3 };
        p.expr = 'happy';
        break;
      case 'dance': {
        const dd = Math.sin(t * 7);
        p.rollZ = dd * 0.16;
        p.yaw = Math.sin(t * 3.5) * 0.4;
        p.bob = Math.abs(Math.cos(t * 7)) * 0.07;
        p.squash = Math.cos(t * 14) * 0.06;
        p.armL = { x: -0.4, z: dd > 0 ? 2.6 : 0.7 };
        p.armR = { x: -0.4, z: dd > 0 ? 0.7 : 2.6 };
        p.legL = dd * 0.3;
        p.legR = -dd * 0.3;
        p.expr = 'happy';
        break;
      }
      case 'laugh':
        p.rollZ = Math.sin(t * 30) * 0.04;
        p.squash = Math.sin(t * 18) * 0.05;
        p.leanX = -0.12;
        p.armL = { x: -0.9, z: 0.35 };
        p.armR = { x: -0.9, z: 0.35 };
        p.expr = 'happy';
        p.talk = Math.abs(Math.sin(t * 15));
        break;
      case 'shrug':
        p.armL = { x: -0.5, z: 1.3 };
        p.armR = { x: -0.5, z: 1.3 };
        p.bob = Math.abs(Math.sin(t * 3)) * 0.02;
        p.lookY = -0.6;
        p.expr = 'smug';
        break;
      case 'point':
        p.armR = { x: -1.55, z: 0.1 };
        p.leanX = 0.06;
        p.lookX = 0.3;
        break;
      case 'facepalm':
        p.armR = { x: -2.45, z: 0.6 };
        p.leanX = 0.14;
        p.expr = 'closed';
        break;
      case 'cheer':
        p.bob = Math.abs(Math.sin(t * 6)) * 0.12;
        p.squash = -Math.abs(Math.sin(t * 6)) * 0.05;
        p.armL = { x: -0.2, z: 2.8 + w * 0.1 };
        p.armR = { x: -0.2, z: 2.8 - w * 0.1 };
        p.expr = 'happy';
        break;
      case 'sit':
        p.sit = 1;
        p.armL = { x: -0.4, z: 0.3 };
        p.armR = { x: -0.4, z: 0.3 };
        p.expr = 'sleepy';
        break;
      case 'heart':
        p.armL = { x: -2.7, z: 0.55 };
        p.armR = { x: -2.7, z: 0.55 };
        p.expr = 'love';
        break;
      case 'thumbsup':
        p.armR = { x: -1.3, z: 0.3 };
        p.expr = 'happy';
        break;
      case 'cry':
        p.armL = { x: -2.2, z: 0.55 };
        p.armR = { x: -2.2, z: 0.55 };
        p.rollZ = Math.sin(t * 20) * 0.02;
        p.expr = 'sad';
        break;
      case 'think':
        p.armR = { x: -2.1, z: 0.35 };
        p.lookY = -1;
        p.lookX = 0.4;
        p.expr = 'think';
        break;
      case 'flex':
        p.armL = { x: -0.3, z: 1.6 + Math.sin(t * 6) * 0.1 };
        p.armR = { x: -0.3, z: 1.6 - Math.sin(t * 6) * 0.1 };
        p.squash = -0.04;
        p.expr = 'smug';
        break;
      case 'spin':
        p.yaw = t * 7;
        p.bob = Math.abs(Math.sin(t * 7)) * 0.04;
        p.armL = { x: 0, z: 1.5 };
        p.armR = { x: 0, z: 1.5 };
        p.expr = 'happy';
        break;
      case 'jump': {
        const j = Math.max(0, Math.sin(t * 5));
        p.bob = j * 0.3;
        p.squash = j < 0.1 ? 0.12 : -0.06;
        p.armL = { x: -0.2, z: 2.7 };
        p.armR = { x: -0.2, z: 2.7 };
        p.expr = 'happy';
        break;
      }
      case 'bow':
        p.leanX = 0.5 + Math.sin(t * 2) * 0.05;
        p.armR = { x: -1.2, z: 0.2 };
        p.armL = { x: 0.6, z: 0.2 };
        p.expr = 'closed';
        break;
      case 'confetti':
        p.armL = { x: -0.2, z: 2.8 };
        p.armR = { x: -0.2, z: 2.8 };
        p.bob = Math.abs(Math.sin(t * 4)) * 0.08;
        p.expr = 'happy';
        break;
      case 'moonwalk': {
        const m = (t * 2.2) % 1;
        p.legL = -0.5 + m;
        p.legR = 0.5 - m;
        p.liftL = m < 0.5 ? 0.03 : 0;
        p.liftR = m >= 0.5 ? 0.03 : 0;
        p.leanX = -0.15;
        p.armL = { x: -0.6, z: 0.3 };
        p.armR = { x: 0.3, z: 0.2 };
        p.expr = 'smug';
        break;
      }
      default:
        break;
    }
    // One-shots override.
    if (oneShot) {
      const dur = ONE_SHOT_DUR[oneShot.id];
      const k = oneShot.t / dur;
      const env = Math.sin(Math.min(1, k) * Math.PI);
      const tt = oneShot.t;
      switch (oneShot.id) {
        case 'wave':
          p.armR = { x: -0.25, z: 2.6 + Math.sin(tt * 10) * 0.35 };
          p.expr = 'happy';
          break;
        case 'celebrate':
          p.bob = Math.abs(Math.sin(tt * 7)) * 0.25;
          p.yaw = ease(k) * Math.PI * 2;
          p.armL = { x: -0.2, z: 2.8 };
          p.armR = { x: -0.2, z: 2.8 };
          p.expr = 'happy';
          break;
        case 'sulk':
          p.squash = 0.08 * env;
          p.leanX = 0.25 * env;
          p.armL = { x: 0.15, z: 0.05 };
          p.armR = { x: 0.15, z: 0.05 };
          p.expr = 'sad';
          p.lookY = 0.8;
          break;
        case 'scared':
          p.bob = Math.sin(Math.min(1, k * 3) * Math.PI) * 0.18;
          p.fwd = -0.12 * ease(k * 3);
          p.armL = { x: -2.3, z: 0.8 };
          p.armR = { x: -2.3, z: 0.8 };
          p.rollZ = Math.sin(tt * 50) * 0.04;
          p.expr = 'scared';
          break;
        case 'knife-twirl':
          p.prop = 'knife';
          p.armR = { x: -1.2, z: 0.35 };
          p.propSpin = ease(k) * Math.PI * 4;
          p.expr = 'smug';
          break;
        case 'gun-spin':
          p.prop = 'gun';
          p.armR = { x: -1.0, z: 0.4 };
          p.propSpin = ease(k) * Math.PI * 4;
          p.expr = 'smug';
          break;
        case 'magnify':
          p.prop = 'magnifier';
          p.armR = { x: -1.95, z: 0.45 };
          p.leanX = 0.1;
          p.expr = 'think';
          p.lookX = 0.3;
          break;
        case 'shrug':
          p.armL = { x: -0.5, z: 1.3 * env };
          p.armR = { x: -0.5, z: 1.3 * env };
          p.expr = 'smug';
          break;
        case 'kill-lunge': {
          const l = k < 0.35 ? ease(k / 0.35) : 1 - ease((k - 0.35) / 0.65);
          p.fwd = 0.2 * l;
          p.leanX = 0.4 * l;
          p.armR = { x: -1.5, z: 0.2 };
          p.prop = s.hold ?? 'knife';
          p.squash = -0.06 * l;
          p.expr = 'smug';
          break;
        }
        case 'squish':
          p.squash = 0.72 * ease(k);
          p.expr = 'dead';
          break;
      }
    }
    if (squished) {
      p.squash = 0.72;
      p.expr = 'dead';
      p.bob = 0;
      p.armL = { x: 0, z: 1.4 };
      p.armR = { x: 0, z: 1.4 };
    }
    const ly = s.lookYaw ?? 0;
    if (ly) {
      p.lookX = Math.max(-1, Math.min(1, ly / 0.6));
      p.yaw += ly * 0.25;
    }
    return p;
  }

  const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

  function setProp(id: Held | 'magnifier' | null): void {
    if (id === curProp) return;
    if (propMesh) built.hand.remove(propMesh);
    propMesh = null;
    curProp = id;
    if (!id) return;
    const key = `prop|${id}|${quality}`;
    const set = partsCached(key, () => buildProp(id));
    const holder = new THREE.Group();
    holder.name = `prop-${id}`;
    const tmp: THREE.Object3D[] = [];
    addParts(set, holder, 'prop', key, tmp, []);
    built.hand.add(holder);
    propMesh = holder;
    applyMaterials();
  }

  const rig: BerryRig = {
    group,
    height: 1.05,
    update(dt: number, s: RigState): void {
      if (disposed) return;
      dt = Math.min(0.1, Math.max(0, dt));
      time += dt;
      const speed = s.speed ?? (s.moving ? 2.4 : 0);
      mv = lerp(mv, s.moving ? 1 : 0, Math.min(1, dt * 10));
      walkPhase += dt * (5 + speed * 2.6) * (s.moving ? 1 : mv);
      const wantGhost = !!s.ghost;
      if (wantGhost !== ghost) {
        ghost = wantGhost;
        applyMaterials();
      }
      if (oneShot) {
        oneShot.t += dt;
        if (oneShot.t >= ONE_SHOT_DUR[oneShot.id]) {
          if (oneShot.id === 'squish') squished = true;
          oneShot = null;
        }
      }
      const p = computePose(s);
      const k = Math.min(1, dt * 14);
      const b = built;
      // Body.
      const sq = p.squash;
      bodyPivot.scale.set(lerp(bodyPivot.scale.x, 1 + sq * 0.9, k), lerp(bodyPivot.scale.y, 1 - sq, k), lerp(bodyPivot.scale.z, 1 + sq * 0.9, k));
      const sitDrop = p.sit * 0.08;
      bodyPivot.position.y = lerp(bodyPivot.position.y, HIP + p.bob - sitDrop, k);
      bodyPivot.position.z = lerp(bodyPivot.position.z, p.fwd, k);
      bodyPivot.rotation.x = lerp(bodyPivot.rotation.x, p.leanX, k);
      bodyPivot.rotation.z = lerp(bodyPivot.rotation.z, p.rollZ, k);
      bodyPivot.rotation.y = s.emote === 'spin' || oneShot?.id === 'celebrate' ? p.yaw : lerp(bodyPivot.rotation.y, p.yaw, k);
      // Arms.
      b.armL.rotation.x = lerp(b.armL.rotation.x, p.armL.x, k);
      b.armL.rotation.z = lerp(b.armL.rotation.z, p.armL.z, k);
      b.armR.rotation.x = lerp(b.armR.rotation.x, p.armR.x, k);
      b.armR.rotation.z = lerp(b.armR.rotation.z, -p.armR.z, k);
      // Legs.
      const legsOn = !s.ghost && !squished;
      b.legL.visible = legsOn;
      b.legR.visible = legsOn;
      b.ghostTail.visible = !!s.ghost;
      if (s.ghost) b.ghostTail.rotation.y = Math.sin(time * 2) * 0.3;
      b.legL.rotation.x = lerp(b.legL.rotation.x, p.legL - p.sit * 1.3, k);
      b.legR.rotation.x = lerp(b.legR.rotation.x, p.legR - p.sit * 1.3, k);
      b.legL.position.y = 0.135 + p.liftL - sitDrop * 0.5;
      b.legR.position.y = 0.135 + p.liftR - sitDrop * 0.5;
      b.legL.position.z = p.fwd;
      b.legR.position.z = p.fwd;
      // Hair spring.
      if (b.hairTail) {
        const bobVel = (bodyPivot.position.y - lastBob) / Math.max(dt, 1e-3);
        const target = 0.06 + mv * 0.3 * Math.min(1.4, speed / 2.4) + p.leanX * -0.6;
        const kS = b.hairStiff;
        hairVel += (kS * (target - hairAng) - 2 * Math.sqrt(kS) * 0.35 * hairVel) * dt - bobVel * 0.6 * dt;
        hairAng += hairVel * dt;
        hairAng = Math.max(-0.4, Math.min(1.2, hairAng));
        const sideTarget = -bodyPivot.rotation.z * 1.5 + Math.sin(time * 1.3 + seed) * 0.04;
        hairSideVel += (kS * (sideTarget - hairSide) - 2 * Math.sqrt(kS) * 0.3 * hairSideVel) * dt;
        hairSide += hairSideVel * dt;
        b.hairTail.rotation.x = hairAng;
        b.hairTail.rotation.z = hairSide;
      }
      lastBob = bodyPivot.position.y;
      // Accessory animations.
      for (const a of b.anims) a.part.update(a.obj, time, s.moving);
      // Prop.
      setProp(p.prop);
      if (propMesh) {
        propMesh.rotation.set(Math.PI / 2 + (p.propSpin || 0), 0, 0);
        if (curProp === 'flashlight' || curProp === 'gun') propMesh.rotation.x = Math.PI / 2 + p.propSpin;
      }
      // Face.
      const open = p.expr === 'normal' || p.expr === 'smug' || p.expr === 'think' || p.expr === 'love' ? blinkOpen(time, seed) : 1;
      paintFaceNow(open, p.lookX, p.lookY, p.expr, p.talk);
    },
    play(id: OneShot): void {
      if (disposed) return;
      if (!(id in ONE_SHOT_DUR)) return;
      squished = false;
      oneShot = { id, t: 0 };
    },
    setCosmetics(next: Cosmetics): void {
      if (disposed) return;
      c = sanitizeCosmetics(next);
      build();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      faceTex?.dispose();
      faceMatN.dispose();
      faceMatG.dispose();
    },
  };

  build();
  rig.height = built.dims.top + 0.06;
  return rig;
}

// Cached part-set shapes so anim callbacks survive geometry caching.
const animOnly = new Map<string, { hasGlass: boolean; anim: { pivot: readonly [number, number, number]; update: AnimPart['update'] }[] }>();
const tailCache = new Map<string, { pivot: readonly [number, number, number]; stiffness: number }>();
function cachedSetShape(key: string): Partial<PartSet> {
  const info = animOnly.get(key);
  if (!info) return {};
  return {
    glass: info.hasGlass ? [] : undefined,
    anim: info.anim.length ? info.anim.map((a) => ({ geos: [], pivot: a.pivot, update: a.update })) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Squished body (non-gory): deflated berry, X eyes, juice splat, seeds, wisp.

export function createBody(cIn: Cosmetics): THREE.Group {
  const c = sanitizeCosmetics(cIn);
  setDetail('medium');
  const d = bodyDims(c.berry);
  const pal = paletteColor(c.color);
  const g = new THREE.Group();
  g.name = 'berry-body';
  const body = new THREE.Mesh(bodyGeo(d, 'medium', 1), bodyMat(c, d, 'low', false));
  body.scale.set(1.35, 0.3, 1.35);
  body.position.y = -d.y0 * 0.3 + 0.01;
  g.add(body);
  // Juice splat.
  const splat = cachedGeo(`splat|${c.berry}`, () => {
    const s = new THREE.Shape();
    const n = 18;
    const r = mulberry(hash32(c.berry));
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = 0.62 * (1 + (i % 2 ? 0.16 : -0.06) + (r() - 0.5) * 0.12);
      if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const geo = new THREE.ShapeGeometry(s, 4);
    geo.rotateX(-Math.PI / 2);
    return geo;
  })!;
  const splatMat = cachedMat(`splat|${c.color}`, () => new THREE.MeshBasicMaterial({ color: mix(pal.hex, pal.dark, 0.3), transparent: true, opacity: 0.7, depthWrite: false }));
  const sm = new THREE.Mesh(splat, splatMat);
  sm.position.y = 0.006;
  g.add(sm);
  // Seeds, X eyes and tongue (one merged mesh).
  const deco = cachedGeo(`bodydeco|${c.berry}`, () => {
    const list: Geo[] = [];
    const r = mulberry(7 + hash32(c.berry));
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2;
      const rr = 0.48 + r() * 0.15;
      list.push(P.sphere(0.018, '#ffe7a3', [Math.cos(a) * rr, 0.012, Math.sin(a) * rr], [1, 0.5, 1.6], [0, a, 0], 6, 4));
    }
    const top = d.top * 0.3 - d.y0 * 0.3 + 0.01;
    const zf = d.rAt(d.tf) * 1.35 * 0.55;
    for (const dx of [-0.11, 0.11]) {
      list.push(P.box(0.11, 0.022, 0.022, '#211a2e', [dx, top - 0.005, zf], [-0.6, 0, Math.PI / 4]));
      list.push(P.box(0.11, 0.022, 0.022, '#211a2e', [dx, top - 0.005, zf], [-0.6, 0, -Math.PI / 4]));
    }
    list.push(P.sphere(0.045, '#ff6f91', [0.04, top - 0.03, zf + 0.12], [1, 0.4, 1.3]));
    return merge(list);
  });
  if (deco) g.add(new THREE.Mesh(deco, kindMat('vc', false)));
  // Ghost wisp.
  const wispGeo = cachedGeo('wisp', () => merge([P.sphere(0.07, '#f4f1ff', [0, 0.05, 0]), P.cone(0.07, 0.12, '#f4f1ff', [0, -0.04, 0], [Math.PI, 0, 0]), P.sphere(0.012, '#211a2e', [-0.025, 0.06, 0.062]), P.sphere(0.012, '#211a2e', [0.025, 0.06, 0.062])]));
  if (wispGeo) {
    const wisp = new THREE.Mesh(wispGeo, kindMat('vc', true));
    wisp.position.y = 0.45;
    wisp.name = 'wisp';
    g.add(wisp);
    let t = 0;
    g.userData.update = (dt: number): void => {
      t += dt;
      const p = (t * 0.45) % 1;
      wisp.position.set(Math.sin(t * 2.5) * 0.05, 0.3 + p * 0.5, 0);
      wisp.scale.setScalar(0.6 + Math.sin(p * Math.PI) * 0.5);
    };
  }
  return g;
}

// ---------------------------------------------------------------------------
// Pets

export function createPet(petId: string): { group: THREE.Group; update(dt: number, moving: boolean): void } {
  const group = new THREE.Group();
  group.name = `pet-${petId}`;
  const inner = new THREE.Group();
  group.add(inner);
  setDetail('medium');
  const parts = buildPet(petId);
  const anims: { obj: THREE.Object3D; part: AnimPart }[] = [];
  let motion: 'hop' | 'hover' | 'walk' | 'crawl' = 'walk';
  if (parts) {
    motion = parts.motion;
    const hit = geos.has(`pet|${petId}`);
    const g = cachedGeo(`pet|${petId}`, () => merge(parts.body));
    if (hit) {
      parts.body.forEach((x) => x.dispose());
      parts.anim?.forEach((a) => a.geos.forEach((x) => x.dispose()));
    }
    if (g) inner.add(new THREE.Mesh(g, kindMat('vc', false)));
    parts.anim?.forEach((a, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(a.pivot[0], a.pivot[1], a.pivot[2]);
      const ag = cachedGeo(`pet|${petId}|a${i}`, () => merge(a.geos));
      if (ag) pivot.add(new THREE.Mesh(ag, kindMat('vc', false)));
      inner.add(pivot);
      anims.push({ obj: pivot, part: a });
    });
    const sg = cachedGeo('petshadow', () => new THREE.CircleGeometry(0.12, 16).rotateX(-Math.PI / 2))!;
    const sh = new THREE.Mesh(sg, kindMat('shadow', false));
    sh.position.y = 0.003;
    group.add(sh);
  }
  let t = Math.random() * 10;
  return {
    group,
    update(dt: number, moving: boolean): void {
      t += Math.min(0.1, Math.max(0, dt));
      switch (motion) {
        case 'hop': {
          const h = Math.abs(Math.sin(t * (moving ? 9 : 4.5)));
          inner.position.y = h * 0.08;
          inner.scale.set(1 + (h < 0.15 ? 0.1 : 0), 1 - (h < 0.15 ? 0.12 : 0), 1);
          break;
        }
        case 'hover':
          inner.position.y = Math.sin(t * 2.4) * 0.03;
          inner.rotation.z = Math.sin(t * 1.7) * 0.1;
          inner.rotation.x = moving ? 0.25 : 0;
          break;
        case 'walk':
          inner.position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.02 : 0;
          inner.rotation.z = moving ? Math.sin(t * 12) * 0.08 : Math.sin(t * 1.5) * 0.03;
          break;
        case 'crawl':
          inner.scale.z = 1 + Math.sin(t * 3) * 0.08;
          break;
      }
      for (const a of anims) a.part.update(a.obj, t, moving);
    },
  };
}

/** Free every shared geometry, material and texture (e.g. when leaving the game). */
export function disposeBerryCaches(): void {
  for (const g of geos.values()) g?.dispose();
  geos.clear();
  for (const m of mats.values()) m.dispose();
  mats.clear();
  for (const t of texCache.values()) t?.dispose();
  texCache.clear();
  animOnly.clear();
  tailCache.clear();
  layoutCache.clear();
}

