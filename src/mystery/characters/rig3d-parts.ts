/**
 * Procedural geometry for the 3D berry rig: a tiny primitive DSL that bakes
 * colours into vertex colours so each accessory merges into one draw call,
 * plus builders for hats, hair, face gear, outfits, back items, held props
 * and pets. Everything is built in metres; no external assets.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BerryType } from '../core/types';
import { BERRY_BY_ID, OUTFIT_BY_ID } from './catalog';
import { berryProfile, faceLine, mix } from './shape';

export type V3 = readonly [number, number, number];
export type Geo = THREE.BufferGeometry;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Detail level for primitive tessellation (set per build). */
let SEG = 1;
export function setDetail(level: 'low' | 'medium' | 'high'): void {
  SEG = level === 'low' ? 0.6 : level === 'medium' ? 1 : 1.4;
}
const seg = (n: number): number => Math.max(3, Math.round(n * SEG));

export function finish(geo: Geo, color: string, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale: V3 | number = 1): Geo {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const sc = typeof scale === 'number' ? [scale, scale, scale] : scale;
  _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(sc[0]!, sc[1]!, sc[2]!));
  g.applyMatrix4(_m);
  const n = g.attributes.position!.count;
  const col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Primitive shorthands -------------------------------------------------------
export const P = {
  sphere: (r: number, col: string, pos?: V3, scale?: V3 | number, rot?: V3, w = 12, h = 8): Geo =>
    finish(new THREE.SphereGeometry(r, seg(w), seg(h)), col, pos, rot, scale),
  dome: (r: number, hgt: number, col: string, y = 0, w = 18): Geo =>
    finish(new THREE.SphereGeometry(r, seg(w), seg(8), 0, Math.PI * 2, 0, Math.PI / 2), col, [0, y, 0], [0, 0, 0], [1, hgt / r, 1]),
  cyl: (rt: number, rb: number, h: number, col: string, pos?: V3, rot?: V3, scale?: V3 | number, w = 16, open = false, t0 = 0, tl = Math.PI * 2): Geo =>
    finish(new THREE.CylinderGeometry(rt, rb, h, seg(w), 1, open, t0, tl), col, pos, rot, scale),
  cone: (r: number, h: number, col: string, pos?: V3, rot?: V3, scale?: V3 | number, w = 12): Geo =>
    finish(new THREE.ConeGeometry(r, h, seg(w)), col, pos, rot, scale),
  torus: (R: number, tube: number, col: string, pos?: V3, rot?: V3, arc = Math.PI * 2, scale?: V3 | number): Geo =>
    finish(new THREE.TorusGeometry(R, tube, seg(6), seg(20), arc), col, pos, rot, scale),
  box: (w: number, h: number, d: number, col: string, pos?: V3, rot?: V3): Geo => finish(new THREE.BoxGeometry(w, h, d), col, pos, rot),
  capsule: (r: number, len: number, col: string, pos?: V3, rot?: V3, scale?: V3 | number): Geo =>
    finish(new THREE.CapsuleGeometry(r, len, seg(3), seg(10)), col, pos, rot, scale),
  oct: (r: number, col: string, pos?: V3, scale?: V3 | number, rot?: V3): Geo => finish(new THREE.OctahedronGeometry(r, 0), col, pos, rot, scale),
  shape: (shape: THREE.Shape, depth: number, col: string, pos?: V3, rot?: V3, scale?: V3 | number): Geo =>
    finish(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.3, bevelSegments: 1, curveSegments: seg(8) }), col, pos, rot, scale),
  tube: (pts: V3[], r: number, col: string, segs = 12): Geo =>
    finish(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))), seg(segs), r, seg(6), false), col),
};

export function starShape(r: number, inner = 0.48, n = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) {
    const a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * inner;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return s;
}

export function heartShape(s: number): THREE.Shape {
  const h = new THREE.Shape();
  h.moveTo(0, -s * 0.9);
  h.bezierCurveTo(-s * 1.3, -s * 0.05, -s * 0.75, s * 1.05, 0, s * 0.35);
  h.bezierCurveTo(s * 0.75, s * 1.05, s * 1.3, -s * 0.05, 0, -s * 0.9);
  return h;
}

export function merge(list: Geo[]): Geo | null {
  if (list.length === 0) return null;
  const out = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return out;
}

// ---------------------------------------------------------------------------
// Berry body dimensions (shared with the rig)

export const HIP = 0.17;

export interface BodyDims {
  berry: BerryType;
  R: number;
  H: number;
  y0: number;
  top: number;
  /** Radius at normalised height t. */
  rAt(t: number): number;
  /** Outer radius for accessories (clears drupelet bumps). */
  sAt(t: number): number;
  /** Extra clearance for bumpy (drupelet) berries. */
  bump: number;
  yAt(t: number): number;
  tf: number;
}

const dimsCache = new Map<BerryType, BodyDims>();
export function bodyDims(berry: BerryType): BodyDims {
  const hit = dimsCache.get(berry);
  if (hit) return hit;
  const def = BERRY_BY_ID[berry];
  const R = 0.35 * def.width;
  const H = 0.7 * def.aspect;
  const y0 = 0.13;
  const bump = def.surface === 'drupelets' || def.surface === 'glossy-drupelets' || def.surface === 'cluster' ? 0.032 : 0;
  const d: BodyDims = {
    berry,
    R,
    H,
    y0,
    top: y0 + H,
    bump,
    rAt: (t) => berryProfile(berry, t) * R,
    sAt: (t) => berryProfile(berry, t) * R + bump,
    yAt: (t) => y0 + t * H,
    tf: faceLine(berry),
  };
  dimsCache.set(berry, d);
  return d;
}

/** Lathe points for the body profile between t0..t1 (inflated). */
export function profilePoints(d: BodyDims, t0: number, t1: number, n: number, inflate = 1, pad = 0): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    // Cosine spacing for rounder ends.
    const u = t0 + (t1 - t0) * (0.5 - 0.5 * Math.cos((i / n) * Math.PI));
    let x = d.rAt(u) * inflate;
    let y = d.yAt(u);
    if (pad) {
      // Offset along the outward profile normal.
      const e = 0.002;
      const dr = d.rAt(Math.min(1, u + e)) - d.rAt(Math.max(0, u - e));
      const dy = d.yAt(Math.min(1, u + e)) - d.yAt(Math.max(0, u - e));
      const len = Math.hypot(dr, dy) || 1;
      x += (dy / len) * pad;
      y += (-dr / len) * pad;
    }
    pts.push(new THREE.Vector2(Math.max(0.0005, x), y));
  }
  return pts;
}

// Face mapping (shared with the face texture) --------------------------------
export const FACE_PHI = 1.05;
export const FACE_T0 = -0.4; // relative to tf
export const FACE_T1 = 0.32;
export const FACE_TEX = 256;

export interface FaceMap {
  /** Canvas px per 2D face unit, horizontally / vertically. */
  kx: number;
  ky: number;
  /** Canvas y (px) of the eye line. */
  cy: number;
}

const faceMapCache = new Map<BerryType, FaceMap>();
/** Square-pixel mapping so 2D face units keep their proportions on the curved patch. */
export function faceMap(d: BodyDims): FaceMap {
  const hit = faceMapCache.get(d.berry);
  if (hit) return hit;
  const unitM = (0.7 * BERRY_BY_ID[d.berry].width) / 33;
  const pxPerMH = FACE_TEX / (2 * FACE_PHI * d.rAt(d.tf));
  const pxPerMV = FACE_TEX / ((FACE_T1 - FACE_T0) * d.H);
  const m: FaceMap = { kx: unitM * pxPerMH * 1.12, ky: unitM * pxPerMV * 1.12, cy: (FACE_T1 / (FACE_T1 - FACE_T0)) * FACE_TEX };
  faceMapCache.set(d.berry, m);
  return m;
}

/** 3D point on the body surface for 2D face coords (fx right, fy down). */
export function facePoint(d: BodyDims, fx: number, fy: number, lift = 0.01): THREE.Vector3 {
  const m = faceMap(d);
  const u = 0.5 + (fx * m.kx) / FACE_TEX;
  const v = (m.cy + fy * m.ky) / FACE_TEX;
  const phi = (u - 0.5) * 2 * FACE_PHI;
  const t = d.tf + FACE_T1 - v * (FACE_T1 - FACE_T0);
  const r = d.rAt(t) + lift;
  return new THREE.Vector3(Math.sin(phi) * r, d.yAt(t), Math.cos(phi) * r);
}

// ---------------------------------------------------------------------------
// Hats (origin = top of head, +Z front)

export interface AnimPart {
  geos: Geo[];
  pivot: V3;
  update: (o: THREE.Object3D, t: number, moving: boolean) => void;
}

export interface PartSet {
  solid: Geo[];
  glass?: Geo[];
  anim?: AnimPart[];
}

const GOLD = '#ffcc3d';

export function buildHat(id: string, hairColor: string, bodyDark: string): PartSet {
  const s: Geo[] = [];
  const anim: AnimPart[] = [];
  const glass: Geo[] = [];
  switch (id) {
    case 'beanie':
      s.push(P.dome(0.27, 0.24, '#e8484f', -0.07), P.cyl(0.282, 0.29, 0.075, '#c22f3c', [0, -0.05, 0]), P.sphere(0.075, '#fff3dc', [0, 0.18, 0]));
      break;
    case 'cap':
    case 'backcap': {
      const r = id === 'cap' ? 0 : Math.PI;
      s.push(P.dome(0.27, 0.21, '#2f6fed', -0.06));
      s.push(P.cyl(0.2, 0.2, 0.016, '#1a43a6', [Math.sin(r) * 0.2, -0.055, Math.cos(r) * 0.2], [0.12 * Math.cos(r), 0, 0], [1, 1, 0.75], 16, false, r - Math.PI / 2, Math.PI));
      s.push(P.sphere(0.025, '#1a43a6', [0, 0.15, 0]), P.cyl(0.05, 0.05, 0.01, '#14b8a6', [0, 0.05, 0.22 * Math.cos(r)], [Math.PI / 2 - 0.5 * Math.cos(r), 0, 0]));
      break;
    }
    case 'tophat':
      s.push(P.cyl(0.34, 0.34, 0.02, '#232633', [0, -0.03, 0]), P.cyl(0.19, 0.18, 0.32, '#2b2f3f', [0, 0.14, 0]), P.cyl(0.187, 0.185, 0.06, '#e23d4b', [0, 0.02, 0]));
      break;
    case 'crown':
    case 'gemcrown': {
      const metal = id === 'crown' ? GOLD : '#d7dfee';
      s.push(P.cyl(0.21, 0.22, 0.09, metal, [0, -0.01, 0], [0, 0, 0], 1, 18, true));
      s.push(P.cyl(0.2, 0.21, 0.09, metal, [0, -0.01, 0], [Math.PI, 0, 0], 1, 18, true));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        s.push(P.cone(0.045, 0.1, metal, [Math.sin(a) * 0.205, 0.08, Math.cos(a) * 0.205]));
        s.push(P.sphere(0.02, id === 'crown' ? '#fff2b0' : '#9ee7ff', [Math.sin(a) * 0.205, 0.135, Math.cos(a) * 0.205]));
      }
      s.push(P.sphere(0.03, '#e8484f', [0, -0.01, 0.22]));
      if (id === 'gemcrown') s.push(P.oct(0.075, '#6ea1ff', [0, 0.1, 0.19], [1, 1.35, 0.7]));
      break;
    }
    case 'tiara':
      s.push(P.torus(0.24, 0.012, '#e9ecf5', [0, -0.03, 0.02], [Math.PI / 2 - 0.25, 0, Math.PI * 0.1], Math.PI * 0.8));
      s.push(P.shape(heartShape(0.035), 0.012, '#ff6fae', [0, 0.04, 0.22], [-0.3, 0, 0]));
      break;
    case 'cowboy':
      s.push(P.cyl(0.42, 0.42, 0.02, '#a86b3a', [0, -0.03, 0], [0, 0, 0], [1, 1, 0.85]));
      s.push(P.torus(0.4, 0.03, '#a86b3a', [0, -0.01, 0], [Math.PI / 2, 0, 0], Math.PI * 2, [1, 0.85, 1]));
      s.push(P.cyl(0.18, 0.22, 0.2, '#c58a4f', [0, 0.08, 0]), P.cyl(0.222, 0.222, 0.04, '#5a3d22', [0, 0.0, 0]));
      s.push(P.sphere(0.12, '#c58a4f', [0, 0.17, 0], [1.5, 0.45, 1.2]));
      break;
    case 'chef':
      s.push(P.cyl(0.22, 0.22, 0.13, '#f7f8fb', [0, 0.02, 0]));
      for (const [x, y, z, r] of [[-0.1, 0.17, 0, 0.13], [0.1, 0.17, 0, 0.13], [0, 0.22, 0.04, 0.14], [0, 0.18, -0.09, 0.12]] as const) s.push(P.sphere(r, '#ffffff', [x, y, z]));
      break;
    case 'party':
      s.push(P.cone(0.15, 0.38, '#ff86bf', [0.02, 0.17, 0], [0, 0, -0.15]));
      for (let i = 0; i < 3; i++) s.push(P.torus(0.13 - i * 0.035, 0.012, ['#ffd257', '#2f6fed', '#14b8a6'][i]!, [0.02 + i * 0.012, 0.06 + i * 0.09, 0], [Math.PI / 2, 0.15, 0]));
      s.push(P.sphere(0.045, '#ffd257', [0.07, 0.36, 0]));
      break;
    case 'headphones':
      s.push(P.torus(0.29, 0.025, '#3a4256', [0, -0.12, 0], [0, 0, 0], Math.PI));
      for (const x of [-0.3, 0.3]) {
        s.push(P.cyl(0.085, 0.085, 0.07, '#2f6fed', [x, -0.15, 0], [0, 0, Math.PI / 2]));
        s.push(P.cyl(0.06, 0.06, 0.02, '#14b8a6', [x * 1.13, -0.15, 0], [0, 0, Math.PI / 2]));
      }
      break;
    case 'halo':
      anim.push({ geos: [P.torus(0.2, 0.025, GOLD, [0, 0, 0], [Math.PI / 2, 0, 0])], pivot: [0, 0.17, 0], update: (o, t) => { o.position.y = 0.17 + Math.sin(t * 2.4) * 0.025; o.rotation.y = t * 0.6; } });
      break;
    case 'flowercrown': {
      const cols = ['#ff86bf', '#ffd257', '#ffffff', '#c084fc', '#ff7a59'];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const x = Math.sin(a) * 0.24;
        const z = Math.cos(a) * 0.24;
        s.push(P.sphere(0.028, i % 2 ? '#ff9f1c' : '#ffe066', [x, -0.02, z]));
        for (let p = 0; p < 5; p++) {
          const b = (p / 5) * Math.PI * 2;
          s.push(P.sphere(0.024, cols[i % cols.length]!, [x + Math.cos(b) * 0.035 * Math.cos(a), -0.02 + Math.sin(b) * 0.035, z - Math.cos(b) * 0.035 * Math.sin(a)], 1, undefined, 6, 4));
        }
        s.push(P.sphere(0.03, '#3fae4b', [Math.sin(a + 0.35) * 0.25, -0.03, Math.cos(a + 0.35) * 0.25], [1, 0.4, 1.6], [0, a, 0], 6, 4));
      }
      break;
    }
    case 'cloud': {
      const puffs: Geo[] = [];
      for (const [x, y, z, r] of [[-0.14, 0.04, 0, 0.14], [0.14, 0.04, 0, 0.14], [0, 0.1, 0.05, 0.17], [0, 0.07, -0.12, 0.14], [0.02, 0.18, -0.02, 0.12]] as const) puffs.push(P.sphere(r, '#f2f6ff', [x, y, z]));
      puffs.push(P.sphere(0.012, '#211a2e', [-0.05, 0.12, 0.21]), P.sphere(0.012, '#211a2e', [0.05, 0.12, 0.21]));
      anim.push({ geos: puffs, pivot: [0, 0, 0], update: (o, t) => { o.position.y = Math.sin(t * 1.8) * 0.02; } });
      break;
    }
    case 'propeller':
      s.push(P.dome(0.27, 0.22, '#e8484f', -0.06), P.cyl(0.18, 0.18, 0.016, '#2f6fed', [0, -0.055, 0.2], [0.12, 0, 0], [1, 1, 0.7], 16, false, -Math.PI / 2, Math.PI));
      s.push(P.cyl(0.012, 0.012, 0.1, '#211a2e', [0, 0.2, 0]));
      for (const [i, c] of ['#ffd257', '#2f6fed', '#1f8a4c'].entries()) s.push(P.dome(0.272, 0.222, c, -0.059).rotateY((i + 1) * 0.6));
      anim.push({ geos: [P.box(0.4, 0.012, 0.05, '#ff7a59'), P.sphere(0.03, '#e8484f')], pivot: [0, 0.25, 0], update: (o, t, mv) => { o.rotation.y = t * (mv ? 30 : 10); } });
      break;
    case 'deerstalker':
      s.push(P.dome(0.27, 0.22, '#a5845a', -0.06));
      for (const r of [0, Math.PI]) s.push(P.cyl(0.13, 0.13, 0.014, '#8a6a43', [0, -0.06, Math.cos(r) * 0.24], [0.15 * Math.cos(r), 0, 0], [1, 1, 0.8], 12, false, r - Math.PI / 2, Math.PI));
      s.push(P.sphere(0.03, '#5a3d22', [0, 0.16, 0]));
      for (let i = 0; i < 4; i++) s.push(P.torus(0.272 - i * 0.04, 0.006, '#7a5a35', [0, -0.03 + i * 0.05, 0], [Math.PI / 2, 0, 0]));
      break;
    case 'wizard': {
      s.push(P.cyl(0.38, 0.38, 0.02, '#3b2a8a', [0, -0.03, 0]), P.cyl(0.22, 0.24, 0.05, GOLD, [0, 0.0, 0]));
      anim.push({
        geos: [P.cone(0.22, 0.5, '#5b45d6', [0, 0.25, 0]), P.cone(0.07, 0.18, '#5b45d6', [0, 0.56, -0.05], [-0.7, 0, 0]), P.shape(starShape(0.05), 0.01, '#ffe66e', [0.05, 0.18, 0.15], [-0.4, 0, 0])],
        pivot: [0, 0, 0],
        update: (o, t) => { o.rotation.x = -0.12 + Math.sin(t * 1.5) * 0.05; },
      });
      break;
    }
    case 'bucket':
      s.push(P.cyl(0.2, 0.25, 0.16, '#efe2bd', [0, 0.04, 0]), P.cyl(0.25, 0.37, 0.06, '#d8c696', [0, -0.05, 0], [0, 0, 0], 1, 18, true), P.dome(0.2, 0.05, '#efe2bd', 0.12));
      break;
    case 'beret':
      s.push(P.sphere(0.29, '#d6334f', [0.02, 0.0, -0.02], [1, 0.32, 1], [0.1, 0, -0.2]), P.cyl(0.015, 0.015, 0.05, '#211a2e', [0.03, 0.1, 0]));
      break;
    case 'viking':
      s.push(P.dome(0.27, 0.23, '#9aa3b8', -0.07), P.cyl(0.28, 0.28, 0.06, '#c48a12', [0, -0.05, 0]));
      for (const d of [-1, 1]) s.push(P.tube([[d * 0.24, -0.02, 0], [d * 0.36, 0.04, 0], [d * 0.38, 0.2, 0.02], [d * 0.33, 0.3, 0.03]], 0.035, '#fff1d6', 8), P.cone(0.035, 0.07, '#fff1d6', [d * 0.33, 0.33, 0.03], [0, 0, d * 0.4]));
      break;
    case 'spacehelmet':
      glass.push(P.sphere(0.48, '#bfe3ff', [0, -0.25, 0], 1, undefined, 24, 16));
      s.push(P.torus(0.4, 0.035, '#b8c1d1', [0, -0.55, 0], [Math.PI / 2, 0, 0]), P.cyl(0.01, 0.01, 0.14, '#9aa3b8', [0, 0.28, 0]), P.sphere(0.03, '#ff4d6d', [0, 0.36, 0]));
      break;
    case 'sprout':
      anim.push({
        geos: [P.cyl(0.012, 0.016, 0.14, '#25763a', [0, 0.06, 0]), P.sphere(0.07, '#5ccf5f', [0.07, 0.15, 0], [1, 0.3, 0.55], [0, 0, 0.4]), P.sphere(0.07, '#3fae4b', [-0.07, 0.15, 0], [1, 0.3, 0.55], [0, 0, -0.4])],
        pivot: [0, -0.02, 0],
        update: (o, t) => { o.rotation.z = Math.sin(t * 2.2) * 0.15; },
      });
      break;
    case 'bunny':
      for (const d of [-1, 1]) {
        anim.push({
          geos: [P.sphere(0.07, '#ffffff', [0, 0.17, 0], [0.8, 2.6, 0.45]), P.sphere(0.04, '#ffb3cf', [0, 0.17, 0.025], [0.8, 3.4, 0.3])],
          pivot: [d * 0.1, 0, 0],
          update: (o, t) => { o.rotation.z = -d * 0.2 + (d > 0 ? Math.sin(t * 2.6) * 0.15 - 0.25 : 0); },
        });
      }
      break;
    case 'catears': {
      const c = hairColor || bodyDark;
      for (const d of [-1, 1]) s.push(P.cone(0.075, 0.14, c, [d * 0.14, 0.04, 0], [0, 0, -d * 0.35], [1, 1, 0.45], 4), P.cone(0.04, 0.08, '#ffb3cf', [d * 0.135, 0.035, 0.03], [0, 0, -d * 0.35], [1, 1, 0.3], 4));
      break;
    }
    case 'pirate':
      s.push(P.cyl(0.36, 0.36, 0.03, '#20232e', [0, -0.03, 0], [0, 0, 0], [1, 1, 0.8], 3), P.cyl(0.2, 0.24, 0.16, '#20232e', [0, 0.05, 0]));
      s.push(P.torus(0.35, 0.012, GOLD, [0, -0.015, 0], [Math.PI / 2, 0, 0], Math.PI * 2, [1, 0.8, 1]), P.sphere(0.05, '#ffffff', [0, 0.06, 0.23], [1, 1, 0.4]));
      break;
    case 'fez':
      s.push(P.cyl(0.13, 0.17, 0.2, '#c22f3c', [0, 0.06, 0]));
      anim.push({ geos: [P.cyl(0.004, 0.004, 0.14, '#211a2e', [0, -0.07, 0]), P.sphere(0.022, GOLD, [0, -0.15, 0], [1, 1.6, 1])], pivot: [0, 0.16, 0], update: (o, t, mv) => { o.rotation.x = 0.9 + Math.sin(t * 3) * 0.2 + (mv ? 0.5 : 0); } });
      break;
    case 'grad':
      s.push(P.dome(0.24, 0.14, '#20232e', -0.04), P.box(0.48, 0.025, 0.48, '#2b2f3f', [0, 0.11, 0], [0, Math.PI / 4, 0]), P.sphere(0.02, GOLD, [0, 0.13, 0]));
      anim.push({ geos: [P.cyl(0.005, 0.005, 0.14, GOLD, [0, -0.07, 0]), P.cyl(0.018, 0.012, 0.05, GOLD, [0, -0.15, 0])], pivot: [0.2, 0.12, 0.05], update: (o, t) => { o.rotation.z = Math.sin(t * 2) * 0.12; } });
      break;
    case 'hardhat':
      s.push(P.dome(0.27, 0.25, '#ffd23f', -0.07), P.cyl(0.33, 0.33, 0.02, '#e0a100', [0, -0.05, 0.03]), P.box(0.06, 0.04, 0.5, '#ffe066', [0, 0.16, 0], [0, 0, 0]).scale(1, 1, 0.9), P.sphere(0.04, '#ff7a1a', [0.12, 0.05, 0.2], [1, 1, 0.4]));
      break;
    case 'bow':
      s.push(P.sphere(0.035, '#e03d87', [0.12, 0.02, 0.1]));
      for (const d of [-1, 1]) s.push(P.cone(0.07, 0.14, '#ff5fa2', [0.12 + d * 0.07, 0.02, 0.1], [0, 0, d * Math.PI / 2], [1, 1, 0.5]));
      break;
    case 'boppers':
      s.push(P.torus(0.27, 0.014, '#8b5cf6', [0, -0.1, 0], [0, 0, 0], Math.PI));
      for (const d of [-1, 1]) {
        anim.push({
          geos: [P.cyl(0.006, 0.006, 0.2, '#211a2e', [0, 0.1, 0]), P.sphere(0.04, d < 0 ? '#5cf2a0' : '#ff7ad9', [0, 0.21, 0])],
          pivot: [d * 0.12, 0.05, 0],
          update: (o, t) => { o.rotation.z = -d * 0.3 + Math.sin(t * 5 + d) * 0.2; o.rotation.x = Math.cos(t * 6 + d) * 0.1; },
        });
      }
      break;
    case 'mushroom':
      s.push(P.dome(0.38, 0.27, '#d6283a', -0.05), P.cyl(0.36, 0.3, 0.04, '#f6e7cf', [0, -0.065, 0]));
      for (const [a, b, r] of [[0.3, 0.5, 0.06], [1.6, 0.35, 0.05], [2.9, 0.6, 0.055], [4.2, 0.4, 0.05], [5.3, 0.7, 0.045], [0, 1.4, 0.05]] as const) {
        const rr = 0.36;
        s.push(P.sphere(r, '#ffffff', [Math.sin(a) * Math.cos(b) * rr, -0.05 + Math.sin(b) * 0.26, Math.cos(a) * Math.cos(b) * rr], [1, 0.5, 1], [0, a, 0]));
      }
      break;
    case 'aviator':
      s.push(P.dome(0.275, 0.23, '#8a5a35', -0.08));
      for (const d of [-1, 1]) s.push(P.sphere(0.09, '#7a4c2a', [d * 0.25, -0.16, 0], [0.4, 1, 0.8]));
      s.push(P.torus(0.28, 0.012, '#5a3d22', [0, -0.02, 0], [Math.PI / 2 - 0.15, 0, 0]));
      for (const d of [-1, 1]) {
        s.push(P.torus(0.055, 0.018, '#c9ced8', [d * 0.075, 0.01, 0.235], [-0.3, 0, 0]));
        s.push(P.cyl(0.05, 0.05, 0.02, '#ffb347', [d * 0.075, 0.01, 0.235], [Math.PI / 2 - 0.3, 0, 0]));
      }
      break;
    case 'froghat':
      s.push(P.dome(0.27, 0.22, '#5ccf5f', -0.06));
      for (const d of [-1, 1]) s.push(P.sphere(0.07, '#5ccf5f', [d * 0.1, 0.13, 0.08]), P.sphere(0.045, '#ffffff', [d * 0.1, 0.14, 0.13]), P.sphere(0.022, '#211a2e', [d * 0.1, 0.14, 0.17]));
      break;
    case 'starclip':
      anim.push({
        geos: [P.cyl(0.006, 0.006, 0.18, '#9aa3b8', [0, 0.09, 0]), P.shape(starShape(0.08), 0.02, '#ffd23f', [0, 0.2, -0.01])],
        pivot: [0.08, 0.0, 0.1],
        update: (o, t) => { o.rotation.z = -0.3 + Math.sin(t * 4) * 0.2; o.rotation.x = Math.cos(t * 5) * 0.1; },
      });
      break;
    default:
      break;
  }
  return { solid: s, glass: glass.length ? glass : undefined, anim: anim.length ? anim : undefined };
}

// ---------------------------------------------------------------------------
// Hair (cap in head-top space; tail in its own pivot space)

export interface HairParts {
  cap: Geo[];
  /** Hanging part on a spring pivot (pivot position in head-top space). */
  tail?: { geos: Geo[]; pivot: V3; stiffness: number };
}

function capLathe(d: BodyDims, t0: number, inflate: number, col: string, phiStart = 0, phiLen = Math.PI * 2): Geo {
  const pts = profilePoints(d, t0, 1, 10, 1, (inflate - 1) * 0.33 + d.bump).map((v) => new THREE.Vector2(v.x, v.y - d.top));
  return finish(new THREE.LatheGeometry(pts, seg(28), phiStart, phiLen), col);
}

export function buildHair(id: string, d: BodyDims, col: string, covered: boolean): HairParts {
  const cap: Geo[] = [];
  const R = d.R;
  const dk = mix(col, '#120c1c', 0.3);
  const lt = mix(col, '#ffffff', 0.25);
  const backCap = (tBack: number, tFront: number): void => {
    cap.push(capLathe(d, tFront, 1.05, col));
    // Back drape: everything except a ~120° window at the front.
    cap.push(capLathe(d, tBack, 1.045, col, Math.PI * 0.36, Math.PI * 1.28));
  };
  const sheet = (len: number, flare: number, wave = 0): Geo[] => {
    const g = new THREE.CylinderGeometry(R * 1.02, R * (1.02 + flare), len, seg(20), seg(6), true, Math.PI - 1.45, 2.9);
    if (wave) {
      const p = g.attributes.position!;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const k = 1 + Math.sin((y / len) * 14) * wave;
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
      }
    }
    return [finish(g, col, [0, -len / 2, 0.02])];
  };
  switch (id) {
    case 'none':
      return { cap };
    case 'tuft':
      if (!covered) cap.push(P.tube([[0, -0.02, 0], [-0.03, 0.06, 0.02], [0.02, 0.1, 0.03], [0.04, 0.07, 0.04]], 0.025, col, 8));
      return { cap };
    case 'long':
    case 'wavy':
      backCap(0.56, 0.86);
      for (const dx of [-1, 1]) cap.push(P.capsule(0.04, d.H * 0.32, col, [dx * d.sAt(0.75) * 0.95, -d.H * 0.33, 0.12], [0.15, 0, dx * 0.12]));
      return { cap, tail: { geos: sheet(d.H * 0.78, 0.18, id === 'wavy' ? 0.05 : 0), pivot: [0, -0.06, -0.02], stiffness: 26 } };
    case 'ponytail':
      backCap(0.62, 0.87);
      return { cap, tail: { geos: [P.sphere(0.03, '#ff86bf', [0, 0, 0]), P.sphere(0.075, col, [0, -0.16, -0.02], [0.8, 2, 0.8]), P.cone(0.05, 0.1, lt, [0, -0.32, -0.02], [Math.PI, 0, 0])], pivot: [0, -0.07, -d.sAt(0.85) - 0.02], stiffness: 18 } };
    case 'braids': {
      backCap(0.62, 0.88);
      const geos: Geo[] = [];
      for (const dx of [-0.09, 0.09]) {
        for (let i = 0; i < 6; i++) geos.push(P.sphere(0.042 - i * 0.002, i % 2 ? col : lt, [dx, -0.04 - i * 0.065, 0]));
        geos.push(P.sphere(0.03, '#ff86bf', [dx, -0.43, 0]));
      }
      return { cap, tail: { geos, pivot: [0, -0.12, -d.sAt(0.75) - 0.02], stiffness: 16 } };
    }
    case 'pigtails': {
      backCap(0.66, 0.87);
      const geos: Geo[] = [];
      for (const dx of [-1, 1]) geos.push(P.sphere(0.03, '#14b8a6', [dx * (R * 0.85), 0, 0]), P.sphere(0.07, col, [dx * (R * 0.85 + 0.05), -0.12, 0], [0.8, 1.8, 0.8], [0, 0, dx * 0.35]));
      return { cap, tail: { geos, pivot: [0, -0.06, -0.04], stiffness: 20 } };
    }
    case 'curls':
      backCap(0.64, 0.86);
      if (!covered) for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        cap.push(P.sphere(0.065, i % 2 ? col : lt, [Math.sin(a) * R * 0.62, -0.03 + (i % 3) * 0.015, Math.cos(a) * R * 0.62 - 0.02], 1, undefined, 8, 6));
      }
      return { cap };
    case 'afro':
      if (covered) cap.push(capLathe(d, 0.7, 1.08, col));
      else cap.push(P.sphere(R * 1.08, col, [0, -0.06, -0.1], [1, 0.9, 1], undefined, 18, 12), capLathe(d, 0.78, 1.04, col));
      return { cap };
    case 'mohawk':
      if (!covered) for (let i = 0; i < 5; i++) cap.push(P.cone(0.045, 0.16, i % 2 ? col : lt, [0, 0.03, 0.16 - i * 0.08], [-0.5 + i * 0.25, 0, 0], [0.5, 1, 1.2], 6));
      cap.push(capLathe(d, 0.88, 1.03, dk));
      return { cap };
    case 'buns':
      backCap(0.64, 0.87);
      if (!covered) for (const dx of [-1, 1]) cap.push(P.sphere(0.09, col, [dx * 0.15, 0.04, -0.03]), P.torus(0.06, 0.012, lt, [dx * 0.15, 0.04, -0.03], [Math.PI / 2, 0, 0]));
      return { cap };
    case 'bob':
      backCap(0.42, 0.85);
      return { cap };
    case 'leafy':
      if (!covered) for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        cap.push(P.sphere(0.1, i % 2 ? mix(col, '#3fae4b', 0.4) : mix(col, '#5ccf5f', 0.4), [Math.sin(a) * 0.06, 0.08, Math.cos(a) * 0.06], [0.45, 1.3, 0.2], [Math.cos(a) * 0.5, a, -Math.sin(a) * 0.5]));
      }
      return { cap };
    case 'spiky':
      backCap(0.64, 0.86);
      if (!covered) for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        cap.push(P.cone(0.06, 0.18, i % 2 ? col : lt, [Math.sin(a) * 0.12, 0.05, Math.cos(a) * 0.12 - 0.03], [Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7], 1, 6));
      }
      return { cap };
    case 'sideswept':
      backCap(0.64, 0.86);
      cap.push(P.sphere(0.16, col, [0.06, 0.0, 0.12], [1.3, 0.45, 0.9], [0.3, 0.4, -0.25]));
      return { cap };
    case 'mullet':
      backCap(0.62, 0.86);
      return { cap, tail: { geos: sheet(d.H * 0.42, 0.12), pivot: [0, -0.08, -0.02], stiffness: 30 } };
    case 'pompadour':
      backCap(0.64, 0.87);
      if (!covered) cap.push(P.sphere(0.16, col, [0, 0.05, 0.1], [1.15, 0.75, 1.1]), P.sphere(0.1, lt, [0, 0.1, 0.16], [1, 0.6, 1]));
      return { cap };
    case 'bowl':
      cap.push(capLathe(d, 0.78, 1.05, col));
      return { cap };
    case 'topknot':
      backCap(0.64, 0.87);
      if (!covered) cap.push(P.sphere(0.09, col, [0, 0.07, -0.02]), P.torus(0.05, 0.015, '#ff86bf', [0, 0.0, -0.02], [Math.PI / 2, 0, 0]));
      return { cap };
    case 'fringe':
      cap.push(capLathe(d, 0.8, 1.05, col), capLathe(d, 0.55, 1.045, col, Math.PI * 0.4, Math.PI * 1.2));
      return { cap };
    case 'locs': {
      backCap(0.64, 0.87);
      const geos: Geo[] = [];
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (i - 3) * 0.32;
        geos.push(P.capsule(0.03, d.H * 0.45, i % 2 ? col : lt, [Math.sin(a) * R * 0.95, -d.H * 0.25, Math.cos(a) * R * 0.95 + 0.04]));
      }
      return { cap, tail: { geos, pivot: [0, -0.06, 0], stiffness: 22 } };
    }
    case 'emo':
      backCap(0.62, 0.86);
      cap.push(P.sphere(0.14, col, [-0.08, -0.06, 0.16], [0.9, 1.1, 0.6], [0.4, -0.3, 0.3]));
      return { cap };
    case 'pixie':
      backCap(0.68, 0.86);
      return { cap };
    default:
      return { cap };
  }
}

// ---------------------------------------------------------------------------
// Face gear as geometry (glasses etc.). Others are painted into the face texture.

export const GEOM_FACE = new Set(['roundglasses', 'nerdglasses', 'shades', 'starglasses', 'heartglasses', '3dglasses', 'monocle', 'goggles', 'visor', 'vr', 'clownnose']);

export function buildFaceGear(id: string, d: BodyDims): PartSet {
  const s: Geo[] = [];
  const glass: Geo[] = [];
  if (!GEOM_FACE.has(id)) return { solid: s };
  const eyes = [facePoint(d, -5.2, 0, 0.03), facePoint(d, 5.2, 0, 0.03)];
  const yaw = (p: THREE.Vector3): number => Math.atan2(p.x, p.z);
  const lens = (p: THREE.Vector3, frame: string, kind: 'round' | 'square' | 'star' | 'heart' | 'shade', tint: string | null): void => {
    const rot: V3 = [0, yaw(p), 0];
    if (kind === 'round') s.push(P.torus(0.062, 0.011, frame, [p.x, p.y, p.z], rot));
    if (kind === 'square') s.push(P.torus(0.066, 0.02, frame, [p.x, p.y, p.z], rot, Math.PI * 2, [1.1, 0.9, 1]));
    if (kind === 'shade') s.push(P.sphere(0.075, '#141622', [p.x, p.y, p.z], [1, 0.75, 0.25], rot));
    if (kind === 'star') s.push(P.shape(starShape(0.085, 0.55), 0.012, frame, [p.x, p.y, p.z], rot));
    if (kind === 'heart') s.push(P.shape(heartShape(0.07), 0.012, frame, [p.x, p.y - 0.005, p.z], rot));
    if (tint) glass.push(P.cyl(0.058, 0.058, 0.004, tint, [0, 0, 0], [Math.PI / 2, 0, 0], 1, 16).rotateY(yaw(p)).translate(p.x, p.y, p.z));
  };
  const bridge = (col: string): void => {
    const a = eyes[0]!;
    const b = eyes[1]!;
    s.push(P.tube([[a.x + 0.05, a.y + 0.01, a.z + 0.005], [0, a.y + 0.025, Math.max(a.z, b.z) + 0.02], [b.x - 0.05, b.y + 0.01, b.z + 0.005]], 0.008, col, 6));
    for (const e of eyes) {
      const side = Math.sign(e.x);
      s.push(P.tube([[e.x + side * 0.06, e.y + 0.01, e.z - 0.01], [e.x + side * 0.11, e.y + 0.02, e.z - 0.1], [e.x + side * 0.12, e.y + 0.02, e.z - 0.2]], 0.007, col, 6));
    }
  };
  switch (id) {
    case 'roundglasses':
      eyes.forEach((e) => lens(e, '#3a2c22', 'round', '#cfe8ff'));
      bridge('#3a2c22');
      break;
    case 'nerdglasses':
      eyes.forEach((e) => lens(e, '#211a2e', 'square', '#cfe8ff'));
      bridge('#211a2e');
      break;
    case 'shades':
      eyes.forEach((e) => lens(e, '#141622', 'shade', null));
      bridge('#141622');
      break;
    case 'starglasses':
      eyes.forEach((e) => lens(e, '#ff4fb5', 'star', null));
      bridge('#ff4fb5');
      break;
    case 'heartglasses':
      eyes.forEach((e) => lens(e, '#e0234e', 'heart', null));
      bridge('#c8103c');
      break;
    case '3dglasses':
      eyes.forEach((e, i) => {
        s.push(P.box(0.13, 0.1, 0.012, '#f5f5f5', [e.x, e.y, e.z], [0, yaw(e), 0]));
        s.push(P.box(0.1, 0.07, 0.014, i === 0 ? '#ff3246' : '#28c8ff', [e.x, e.y, e.z + 0.002], [0, yaw(e), 0]));
      });
      bridge('#f5f5f5');
      break;
    case 'monocle': {
      const e = eyes[1]!;
      lens(e, '#d9a514', 'round', '#e8f4ff');
      s.push(P.tube([[e.x + 0.03, e.y - 0.06, e.z], [e.x + 0.06, e.y - 0.14, e.z - 0.02], [e.x + 0.02, e.y - 0.22, e.z - 0.03]], 0.004, '#d9a514', 6));
      break;
    }
    case 'goggles': {
      eyes.forEach((e) => {
        s.push(P.torus(0.068, 0.02, '#7c8496', [e.x, e.y, e.z], [0, yaw(e), 0]));
        glass.push(P.sphere(0.06, '#aaffd2', [e.x, e.y, e.z], [1, 1, 0.3], [0, yaw(e), 0]));
      });
      const y = eyes[0]!.y;
      s.push(P.torus(d.sAt(d.tf) + 0.02, 0.016, '#5a3d22', [0, y, 0], [Math.PI / 2, 0, 0]));
      break;
    }
    case 'visor': {
      const y = eyes[0]!.y;
      const r = d.sAt(d.tf) + 0.035;
      s.push(P.cyl(r, r, 0.1, '#6ea1ff', [0, y, 0], [0, 0, 0], 1, 24, true, -1.25, 2.5));
      glass.push(P.cyl(r + 0.004, r + 0.004, 0.08, '#c084fc', [0, y, 0], [0, 0, 0], 1, 24, true, -1.2, 2.4));
      break;
    }
    case 'vr': {
      const y = eyes[0]!.y;
      const r = d.sAt(d.tf);
      s.push(P.box(0.36, 0.15, 0.12, '#eef1f6', [0, y, r + 0.04]), P.box(0.3, 0.09, 0.02, '#1c2233', [0, y, r + 0.105]), P.torus(r + 0.01, 0.015, '#2a2f45', [0, y, 0], [Math.PI / 2, 0, 0]));
      s.push(P.sphere(0.015, '#5cf2ff', [0.12, y, r + 0.12]));
      break;
    }
    case 'clownnose': {
      const p = facePoint(d, 0, 4, 0.035);
      s.push(P.sphere(0.045, '#e0283e', [p.x, p.y, p.z]));
      break;
    }
  }
  return { solid: s, glass: glass.length ? glass : undefined };
}

// ---------------------------------------------------------------------------
// Outfits

export function buildOutfit(id: string, d: BodyDims): Geo[] {
  const o = OUTFIT_BY_ID.get(id);
  if (!o || id === 'none') return [];
  const out: Geo[] = [];
  const tNeck = 0.31;
  const shell = (col: string, t1 = tNeck, inflate = 1.03): Geo =>
    finish(new THREE.LatheGeometry(profilePoints(d, 0.02, t1, 8, 1, (inflate - 1) * 0.35 + d.bump), seg(28)), col);
  const front = (t: number, lift = 0.02): THREE.Vector3 => new THREE.Vector3(0, d.yAt(t), d.sAt(t) + lift);
  const neck = front(tNeck, 0.03);
  const collar = (col: string, tube = 0.03): void => {
    out.push(P.torus(d.sAt(tNeck) * 1.02, tube, col, [0, d.yAt(tNeck), 0], [Math.PI / 2, 0, 0]));
  };
  switch (id) {
    case 'tee':
      out.push(shell(o.main));
      collar(mix(o.main, '#000', 0.1), 0.018);
      out.push(P.sphere(0.04, o.accent, [neck.x, neck.y - 0.08, neck.z - 0.005], [1, 1, 0.3]));
      break;
    case 'heartpin':
      out.push(shell(o.main));
      collar(mix(o.main, '#000', 0.1), 0.018);
      out.push(P.shape(heartShape(0.035), 0.012, o.accent, [neck.x + 0.08, neck.y - 0.06, neck.z - 0.03], [0, 0.25, 0]));
      break;
    case 'jersey':
    case 'hawaiian':
    case 'sweater':
    case 'spacesuit':
    case 'raincoat':
    case 'hoodie':
    case 'puffer':
    case 'varsity':
      out.push(shell(o.main));
      if (id === 'puffer') for (let i = 0; i < 3; i++) out.push(P.torus(d.sAt(0.08 + i * 0.09) * 1.04, 0.02, o.main, [0, d.yAt(0.08 + i * 0.09), 0], [Math.PI / 2, 0, 0]));
      if (id === 'jersey') out.push(P.torus(d.sAt(0.06) * 1.04, 0.015, o.accent, [0, d.yAt(0.06), 0], [Math.PI / 2, 0, 0]));
      if (id === 'sweater') out.push(P.torus(d.sAt(0.17) * 1.04, 0.012, o.accent, [0, d.yAt(0.17), 0], [Math.PI / 2, 0, 0]));
      if (id === 'spacesuit') out.push(P.box(0.12, 0.07, 0.02, '#d3d9e4', [neck.x, neck.y - 0.09, neck.z - 0.02]), P.sphere(0.012, '#ff4d6d', [neck.x - 0.03, neck.y - 0.09, neck.z]), P.sphere(0.012, '#14b8a6', [neck.x + 0.03, neck.y - 0.09, neck.z]));
      if (id === 'hawaiian') for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const t = 0.1 + (i % 2) * 0.1;
        out.push(P.sphere(0.035, i % 2 ? o.accent : '#ff86bf', [Math.sin(a) * d.sAt(t) * 1.04, d.yAt(t), Math.cos(a) * d.sAt(t) * 1.04], [1, 1, 0.3], [0, a, 0], 6, 4));
      }
      if (id === 'varsity') out.push(P.box(0.08, 0.08, 0.01, o.accent, [neck.x - 0.08, neck.y - 0.07, neck.z - 0.03], [0, -0.25, 0]));
      if (id === 'hoodie') {
        out.push(P.sphere(d.R * 0.7, mix(o.main, '#000', 0.1), [0, d.yAt(tNeck) + 0.03, -d.sAt(tNeck) * 0.75], [1.1, 0.55, 0.7]));
        for (const dx of [-0.04, 0.04]) out.push(P.cyl(0.006, 0.006, 0.09, '#f2f4f8', [dx, neck.y - 0.05, neck.z]));
        out.push(P.box(0.18, 0.06, 0.02, mix(o.main, '#fff', 0.08), [0, d.yAt(0.12), d.sAt(0.12) + 0.02]));
      }
      collar(id === 'spacesuit' ? '#b8c1d1' : mix(o.main, '#000', 0.12), id === 'spacesuit' ? 0.035 : 0.022);
      break;
    case 'suit':
    case 'tux':
    case 'labcoat':
    case 'trench':
    case 'vest':
      out.push(shell(o.main));
      out.push(P.cone(0.07, 0.12, id === 'vest' ? '#f7f4ee' : '#ffffff', [neck.x, neck.y - 0.05, neck.z - 0.025], [Math.PI, 0, 0], [1, 1, 0.25], 3));
      if (id === 'suit') out.push(P.box(0.03, 0.12, 0.012, o.accent, [neck.x, neck.y - 0.07, neck.z - 0.0]));
      if (id === 'tux') out.push(P.sphere(0.03, '#11131a', [neck.x - 0.03, neck.y - 0.01, neck.z], [1.2, 0.8, 0.5]), P.sphere(0.03, '#11131a', [neck.x + 0.03, neck.y - 0.01, neck.z], [1.2, 0.8, 0.5]));
      if (id === 'trench') out.push(P.torus(d.sAt(0.14) * 1.05, 0.016, o.accent, [0, d.yAt(0.14), 0], [Math.PI / 2, 0, 0]));
      if (id === 'labcoat') out.push(P.box(0.07, 0.06, 0.01, '#f7f8fb', [-0.12, d.yAt(0.18), d.sAt(0.18) - 0.005], [0, -0.35, 0]), P.cyl(0.006, 0.006, 0.06, '#2f6fed', [-0.12, d.yAt(0.22), d.sAt(0.2)], [0, 0, 0]));
      collar(mix(o.main, '#000', 0.12), 0.02);
      break;
    case 'overalls':
      out.push(shell(o.main, 0.16));
      out.push(P.box(0.2, 0.12, 0.03, o.main, [0, d.yAt(0.22), d.sAt(0.22) - 0.01], [-0.25, 0, 0]));
      for (const dx of [-0.07, 0.07]) out.push(P.sphere(0.015, o.accent, [dx, d.yAt(0.27), d.sAt(0.27) + 0.012]));
      break;
    case 'apron':
      out.push(P.box(0.26, d.H * 0.32, 0.02, o.main, [0, d.yAt(0.16), d.sAt(0.16) + 0.01], [-0.12, 0, 0]), P.box(0.09, 0.05, 0.024, o.accent, [0, d.yAt(0.15), d.sAt(0.15) + 0.025]));
      out.push(P.torus(d.sAt(0.2) * 1.02, 0.01, o.accent, [0, d.yAt(0.2), 0], [Math.PI / 2, 0, 0]));
      break;
    case 'scarf':
      out.push(P.torus(d.sAt(tNeck) * 1.0, 0.05, o.main, [0, d.yAt(tNeck), 0], [Math.PI / 2, 0, 0], Math.PI * 2, [1, 1, 0.8]));
      out.push(P.box(0.08, 0.2, 0.03, o.main, [0.1, d.yAt(tNeck) - 0.1, d.sAt(tNeck) + 0.04], [0.15, 0, 0.1]));
      for (let i = 0; i < 3; i++) out.push(P.box(0.082, 0.015, 0.032, o.accent, [0.1 + i * 0.002, d.yAt(tNeck) - 0.04 - i * 0.05, d.sAt(tNeck) + 0.045], [0.15, 0, 0.1]));
      break;
    case 'cape':
      out.push(finish(new THREE.LatheGeometry(profilePoints(d, tNeck - 0.12, tNeck + 0.04, 6, 1, 0.03 + d.bump), seg(28)), o.main));
      out.push(P.sphere(0.035, o.accent, [0, d.yAt(tNeck), d.sAt(tNeck) + 0.05]));
      break;
    case 'bowtie':
      out.push(P.cone(0.05, 0.08, o.main, [-0.04, d.yAt(tNeck), d.sAt(tNeck) + 0.03], [0, 0, -Math.PI / 2], [1, 1, 0.5]), P.cone(0.05, 0.08, o.main, [0.04, d.yAt(tNeck), d.sAt(tNeck) + 0.03], [0, 0, Math.PI / 2], [1, 1, 0.5]), P.sphere(0.022, o.accent, [0, d.yAt(tNeck), d.sAt(tNeck) + 0.04]));
      break;
  }
  return out;
}

/** Sleeve colour for arms (null = berry colour). */
export function sleeveFor(id: string): string | null {
  const o = OUTFIT_BY_ID.get(id);
  if (!o) return null;
  if (['none', 'scarf', 'overalls', 'apron', 'vest', 'bowtie', 'cape'].includes(id)) return null;
  return id === 'varsity' ? o.accent : o.main;
}

// ---------------------------------------------------------------------------
// Back items (in body space, behind the body at -Z)

export function buildBack(id: string, d: BodyDims): PartSet {
  const s: Geo[] = [];
  const anim: AnimPart[] = [];
  const glass: Geo[] = [];
  const ys = d.yAt(0.42);
  const zb = -d.sAt(0.42);
  switch (id) {
    case 'backpack':
      s.push(P.capsule(0.12, 0.12, '#f08a3c', [0, ys, zb - 0.07], [0, 0, 0], [1.2, 1, 0.65]), P.box(0.18, 0.1, 0.06, '#ffb46b', [0, ys - 0.06, zb - 0.15]));
      for (const dx of [-0.1, 0.1]) s.push(P.torus(d.sAt(0.45) * 0.98, 0.012, '#8a3f10', [dx, ys, 0], [0, Math.PI / 2, 0], Math.PI, [1, 0.9, 1]));
      break;
    case 'jetpack':
      for (const dx of [-0.08, 0.08]) {
        s.push(P.capsule(0.06, 0.18, '#d8dee8', [dx, ys, zb - 0.07]), P.cyl(0.05, 0.065, 0.05, '#e8484f', [dx, ys + 0.15, zb - 0.07]));
        anim.push({ geos: [P.cone(0.045, 0.16, '#ffb347', [0, -0.08, 0], [Math.PI, 0, 0]), P.cone(0.025, 0.1, '#fff3a3', [0, -0.05, 0], [Math.PI, 0, 0])], pivot: [dx, ys - 0.16, zb - 0.07], update: (o, t, mv) => { const k = (mv ? 1.3 : 0.6) + Math.sin(t * 40 + dx * 10) * 0.2; o.scale.set(1, k, 1); } });
      }
      break;
    case 'wings':
    case 'fairywings':
      for (const dx of [-1, 1]) {
        const g = id === 'wings' ? [P.sphere(0.2, '#ffffff', [dx * 0.2, 0.06, 0], [1, 0.55, 0.12], [0, 0, dx * 0.4]), P.sphere(0.14, '#e6ebf5', [dx * 0.17, -0.06, 0], [1, 0.5, 0.12], [0, 0, dx * 0.2])] : [];
        if (id === 'fairywings') glass.push(P.sphere(0.18, '#a6f0ff', [dx * 0.2, ys + 0.08, zb - 0.06], [1, 0.6, 0.05], [0, 0, dx * 0.5]), P.sphere(0.12, '#ffaaf0', [dx * 0.16, ys - 0.06, zb - 0.06], [1, 0.6, 0.05], [0, 0, -dx * 0.3]));
        else anim.push({ geos: g, pivot: [dx * 0.06, ys + 0.05, zb - 0.05], update: (o, t, mv) => { o.rotation.y = dx * (0.35 + Math.sin(t * (mv ? 9 : 3)) * 0.3); } });
      }
      break;
    case 'guitar':
      s.push(P.sphere(0.13, '#e0a100', [0.05, ys - 0.06, zb - 0.07], [1, 1, 0.35]), P.sphere(0.1, '#e0a100', [0.0, ys + 0.07, zb - 0.07], [1, 1, 0.35]), P.cyl(0.035, 0.035, 0.012, '#2b1d14', [0.02, ys, zb - 0.115], [Math.PI / 2, 0, 0]));
      s.push(P.box(0.05, 0.42, 0.03, '#5a3d22', [-0.1, ys + 0.3, zb - 0.07], [0, 0, 0.45]), P.box(0.07, 0.08, 0.035, '#2b1d14', [-0.2, ys + 0.5, zb - 0.07], [0, 0, 0.45]));
      s.push(P.torus(d.sAt(0.45), 0.012, '#2b1d14', [0, ys, 0], [0.5, Math.PI / 2, 0], Math.PI));
      break;
    case 'cape': {
      const len = d.H * 0.62;
      const g = new THREE.CylinderGeometry(d.R * 0.75, d.R * 1.15, len, seg(16), seg(4), true, Math.PI - 1.1, 2.2);
      anim.push({ geos: [finish(g, '#d1303f', [0, -len / 2, 0])], pivot: [0, d.yAt(0.33), -0.03], update: (o, t, mv) => { o.rotation.x = (mv ? 0.45 : 0.05) + Math.sin(t * (mv ? 11 : 2)) * (mv ? 0.08 : 0.03); } });
      break;
    }
    case 'quiver':
      s.push(P.cyl(0.07, 0.06, 0.3, '#7a4c2a', [0.04, ys + 0.03, zb - 0.07], [0, 0, -0.35]), P.torus(0.07, 0.012, '#ffcc3d', [0.07, ys + 0.12, zb - 0.07], [Math.PI / 2, 0, -0.35]));
      s.push(P.cyl(0.025, 0.025, 0.14, '#f6efe3', [0.11, ys + 0.24, zb - 0.06], [0, 0, -0.35]), P.cone(0.025, 0.2, '#6ea1ff', [0.06, ys + 0.28, zb - 0.09], [0, 0, -0.25], [0.5, 1, 1]), P.cone(0.022, 0.18, '#14b8a6', [0.14, ys + 0.26, zb - 0.1], [0, 0, -0.5], [0.5, 1, 1]));
      break;
    case 'scuba':
      s.push(P.capsule(0.08, 0.24, '#f2c400', [0, ys, zb - 0.08]), P.cyl(0.025, 0.025, 0.05, '#9aa3b8', [0, ys + 0.22, zb - 0.08]));
      break;
    case 'balloon':
      anim.push({
        geos: [P.cyl(0.003, 0.003, 0.5, '#6c7487', [0, 0.25, 0]), P.sphere(0.13, '#e8484f', [0, 0.58, 0], [1, 1.15, 1]), P.cone(0.025, 0.04, '#c22f3c', [0, 0.44, 0])],
        pivot: [-0.1, ys, zb - 0.02],
        update: (o, t, mv) => { o.rotation.x = -0.35 - (mv ? 0.4 : 0) + Math.sin(t * 1.7) * 0.06; o.rotation.z = Math.sin(t * 1.3) * 0.1; },
      });
      break;
    case 'shell':
      s.push(P.sphere(0.17, '#d9925a', [0, ys - 0.02, zb - 0.06], [1, 1, 0.6]), P.torus(0.1, 0.035, '#a8622a', [0, ys - 0.02, zb - 0.14], [0, 0, 0]), P.torus(0.045, 0.02, '#8a4a1c', [0.02, ys - 0.01, zb - 0.17]));
      break;
    case 'teddy':
      s.push(P.box(0.2, 0.2, 0.1, '#2f6fed', [0, ys - 0.05, zb - 0.06]), P.sphere(0.08, '#c08a5f', [0.02, ys + 0.1, zb - 0.06]), P.sphere(0.03, '#b07a55', [-0.05, ys + 0.17, zb - 0.06]), P.sphere(0.03, '#b07a55', [0.09, ys + 0.17, zb - 0.06]), P.sphere(0.03, '#f1d3b0', [0.02, ys + 0.09, zb - 0.0]));
      break;
    case 'surfboard':
      s.push(P.capsule(0.09, 0.6, '#3fd6e8', [0, ys + 0.1, zb - 0.07], [0, 0, 0.25], [1, 1, 0.22]), P.box(0.02, 0.7, 0.04, '#ffffff', [0, ys + 0.1, zb - 0.08], [0, 0, 0.25]));
      break;
  }
  return { solid: s, glass: glass.length ? glass : undefined, anim: anim.length ? anim : undefined };
}

// ---------------------------------------------------------------------------
// Top decoration (calyx / leaves / stem), in body space.

export function buildTop(d: BodyDims, leafCol = '#3fae4b'): Geo[] {
  const def = BERRY_BY_ID[d.berry];
  const out: Geo[] = [];
  const y = d.top + d.bump * 0.8;
  switch (def.top) {
    case 'leafy':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        out.push(P.sphere(0.11, i % 2 ? leafCol : '#5ccf5f', [Math.sin(a) * 0.1, y - 0.01, Math.cos(a) * 0.1], [0.45, 0.12, 1.1], [0.35, a, 0]));
      }
      out.push(P.cyl(0.016, 0.02, 0.07, '#25763a', [0, y + 0.03, 0]));
      break;
    case 'crown':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        out.push(P.cone(0.025, 0.05, '#2a1c40', [Math.sin(a) * 0.04, y + 0.005, Math.cos(a) * 0.04], [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5], 1, 4));
      }
      break;
    case 'calyx':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        out.push(P.sphere(0.06, leafCol, [Math.sin(a) * 0.05, y - 0.005, Math.cos(a) * 0.05], [0.35, 0.12, 1], [0.5, a, 0]));
      }
      out.push(P.cyl(0.012, 0.016, 0.06, '#25763a', [0, y + 0.025, 0]));
      break;
    case 'stem':
      out.push(P.tube([[0, y - 0.03, 0], [0.01, y + 0.08, 0], [0.06, y + 0.18, -0.02]], 0.012, '#6a8f2c', 8), P.sphere(0.06, leafCol, [0.11, y + 0.15, -0.02], [1, 0.2, 0.45], [0, 0, -0.4]));
      break;
    case 'curl':
      out.push(P.cyl(0.014, 0.018, 0.06, '#25763a', [0, y + 0.025, 0]), P.sphere(0.06, leafCol, [0.06, y + 0.04, 0], [1, 0.2, 0.5], [0, 0, -0.3]), P.torus(0.025, 0.006, '#25763a', [-0.04, y + 0.06, 0], [0, 0, 0]));
      break;
    case 'nub':
      out.push(P.cyl(0.014, 0.018, 0.04, '#6b4a2b', [0, y + 0.01, 0]));
      break;
    case 'tuft':
      for (let i = 0; i < 5; i++) out.push(P.cone(0.006, 0.05, '#8a6a43', [Math.sin(i) * 0.01, y + 0.02, Math.cos(i) * 0.01], [Math.cos(i * 1.3) * 0.4, 0, Math.sin(i * 1.3) * 0.4], 1, 3));
      break;
    case 'twig':
      out.push(P.cyl(0.01, 0.012, 0.1, '#a0522d', [0, y + 0.04, 0]), P.cyl(0.008, 0.008, 0.08, '#a0522d', [0.03, y + 0.06, 0], [0, 0, -0.7]), P.cyl(0.008, 0.008, 0.08, '#a0522d', [-0.03, y + 0.07, 0], [0, 0, 0.7]));
      break;
    case 'husk':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        out.push(P.sphere(0.09, i % 2 ? '#e8cf9a' : '#d9b77c', [Math.sin(a) * 0.07, y + 0.01, Math.cos(a) * 0.07], [0.5, 0.15, 1], [-0.6, a, 0]));
      }
      break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Held props (in hand space: hand at origin, pointing +Z forward)

export function buildProp(id: 'gun' | 'knife' | 'flashlight' | 'magnifier'): PartSet {
  const s: Geo[] = [];
  const glass: Geo[] = [];
  switch (id) {
    case 'gun':
      s.push(P.box(0.06, 0.07, 0.2, '#4a5068', [0, 0.03, 0.08]), P.box(0.05, 0.1, 0.05, '#2f3446', [0, -0.03, 0.0], [0.3, 0, 0]), P.cyl(0.03, 0.03, 0.04, '#ff7a1a', [0, 0.035, 0.19], [Math.PI / 2, 0, 0]), P.sphere(0.015, '#14b8a6', [0.032, 0.04, 0.08]));
      break;
    case 'knife':
      s.push(P.cyl(0.02, 0.02, 0.09, '#7a4c2a', [0, 0, 0.01], [Math.PI / 2, 0, 0]), P.box(0.012, 0.05, 0.17, '#dfe6f0', [0, 0.01, 0.14]));
      break;
    case 'flashlight':
      s.push(P.cyl(0.028, 0.028, 0.16, '#3a4256', [0, 0, 0.06], [Math.PI / 2, 0, 0]), P.cyl(0.045, 0.03, 0.05, '#ffd23f', [0, 0, 0.16], [Math.PI / 2, 0, 0]), P.cyl(0.04, 0.04, 0.01, '#fffbe0', [0, 0, 0.19], [Math.PI / 2, 0, 0]));
      break;
    case 'magnifier':
      s.push(P.cyl(0.015, 0.015, 0.12, '#7a4c2a', [0, 0.02, 0.0], [0.4, 0, 0]), P.torus(0.07, 0.012, '#ffcc3d', [0, 0.13, 0.05], [0, 0, 0]));
      glass.push(P.cyl(0.068, 0.068, 0.006, '#cfe8ff', [0, 0.13, 0.05], [Math.PI / 2, 0, 0]));
      break;
  }
  return { solid: s, glass: glass.length ? glass : undefined };
}

// ---------------------------------------------------------------------------
// Pets (origin = ground under the pet, facing +Z)

export interface PetParts {
  body: Geo[];
  anim?: AnimPart[];
  glass?: Geo[];
  motion: 'hop' | 'hover' | 'walk' | 'crawl';
}

function petEyes(x: number, y: number, z: number, gap: number, r = 0.012): Geo[] {
  return [P.sphere(r, '#1f1730', [x - gap / 2, y, z], 1, undefined, 6, 4), P.sphere(r, '#1f1730', [x + gap / 2, y, z], 1, undefined, 6, 4)];
}

export function buildPet(id: string): PetParts | null {
  switch (id) {
    case 'miniberry':
      return {
        body: [P.sphere(0.08, '#ef4444', [0, 0.08, 0], [1, 1.05, 1]), P.sphere(0.05, '#3fae4b', [0, 0.16, 0], [1, 0.25, 1]), ...petEyes(0, 0.1, 0.075, 0.05)],
        motion: 'hop',
      };
    case 'drone':
      return {
        body: [P.capsule(0.05, 0.08, '#e8edf5', [0, 0.32, 0], [0, 0, Math.PI / 2]), P.box(0.1, 0.04, 0.02, '#1c2233', [0, 0.33, 0.05]), P.sphere(0.012, '#5cf2ff', [-0.02, 0.33, 0.062]), P.sphere(0.012, '#5cf2ff', [0.02, 0.33, 0.062])],
        anim: [-1, 1].map((dx) => ({ geos: [P.box(0.12, 0.004, 0.02, '#c9ced8')], pivot: [dx * 0.1, 0.37, 0] as V3, update: (o: THREE.Object3D, t: number) => { o.rotation.y = t * 40; } })),
        motion: 'hover',
      };
    case 'cat':
      return {
        body: [P.capsule(0.055, 0.1, '#f0a640', [0, 0.09, 0], [Math.PI / 2, 0, 0]), P.sphere(0.07, '#f0a640', [0, 0.16, 0.08]), P.cone(0.025, 0.05, '#f0a640', [-0.04, 0.23, 0.08], [0, 0, 0.3], 1, 4), P.cone(0.025, 0.05, '#f0a640', [0.04, 0.23, 0.08], [0, 0, -0.3], 1, 4), ...petEyes(0, 0.17, 0.145, 0.05), P.sphere(0.008, '#ff86bf', [0, 0.15, 0.15])],
        anim: [{ geos: [P.capsule(0.015, 0.12, '#f0a640', [0, 0.07, 0])], pivot: [0, 0.1, -0.1], update: (o, t) => { o.rotation.x = -0.6; o.rotation.z = Math.sin(t * 3) * 0.4; } }],
        motion: 'walk',
      };
    case 'duckling':
      return {
        body: [P.sphere(0.07, '#ffe066', [0, 0.07, 0], [1, 0.9, 1.15]), P.sphere(0.05, '#ffe066', [0, 0.15, 0.04]), P.cone(0.02, 0.04, '#ff9f1c', [0, 0.145, 0.1], [Math.PI / 2, 0, 0], [1.4, 1, 0.6]), ...petEyes(0, 0.165, 0.08, 0.05, 0.01)],
        motion: 'walk',
      };
    case 'snail':
      return {
        body: [P.capsule(0.03, 0.14, '#b8e1a8', [0, 0.03, 0], [Math.PI / 2, 0, 0]), P.sphere(0.07, '#c58a4f', [0, 0.09, -0.02]), P.torus(0.04, 0.015, '#7a4c2a', [0.07, 0.09, -0.02], [0, Math.PI / 2, 0]), P.cyl(0.004, 0.004, 0.06, '#211a2e', [-0.015, 0.09, 0.09], [0.3, 0, 0]), P.cyl(0.004, 0.004, 0.06, '#211a2e', [0.015, 0.09, 0.09], [0.3, 0, 0]), ...petEyes(0, 0.12, 0.1, 0.03, 0.009)],
        motion: 'crawl',
      };
    case 'cloud':
      return {
        body: [P.sphere(0.08, '#f4f7ff', [-0.06, 0.45, 0]), P.sphere(0.1, '#f4f7ff', [0.02, 0.48, 0]), P.sphere(0.07, '#f4f7ff', [0.09, 0.45, 0]), ...petEyes(0.01, 0.47, 0.095, 0.05)],
        motion: 'hover',
      };
    case 'ghosty':
      return {
        body: [P.sphere(0.08, '#f4f1ff', [0, 0.4, 0]), P.cone(0.08, 0.12, '#f4f1ff', [0, 0.3, 0], [Math.PI, 0, 0]), ...petEyes(0, 0.41, 0.075, 0.045, 0.012)],
        motion: 'hover',
      };
    case 'robodog':
      return {
        body: [P.box(0.18, 0.08, 0.1, '#e8edf5', [0, 0.1, 0]).rotateY(Math.PI / 2), P.box(0.1, 0.09, 0.1, '#e8edf5', [0, 0.17, 0.11]), P.box(0.08, 0.035, 0.01, '#1c2233', [0, 0.18, 0.165]), P.sphere(0.01, '#5cf2ff', [-0.02, 0.18, 0.172]), P.sphere(0.01, '#5cf2ff', [0.02, 0.18, 0.172]), P.cone(0.02, 0.05, '#2f6fed', [-0.04, 0.24, 0.1], [0, 0, 0.3], 1, 4), P.cone(0.02, 0.05, '#2f6fed', [0.04, 0.24, 0.1], [0, 0, -0.3], 1, 4), ...[-0.06, 0.06].flatMap((x) => [P.box(0.025, 0.07, 0.025, '#8b95a9', [x, 0.035, 0.06]), P.box(0.025, 0.07, 0.025, '#8b95a9', [x, 0.035, -0.06])])],
        motion: 'walk',
      };
    case 'frog':
      return {
        body: [P.sphere(0.08, '#5ccf5f', [0, 0.06, 0], [1.1, 0.75, 1]), P.sphere(0.03, '#5ccf5f', [-0.035, 0.12, 0.04]), P.sphere(0.03, '#5ccf5f', [0.035, 0.12, 0.04]), ...petEyes(0, 0.13, 0.065, 0.07, 0.014), P.sphere(0.06, '#c6f5b0', [0, 0.045, 0.03], [1, 0.6, 1])],
        motion: 'hop',
      };
    case 'bee':
      return {
        body: [P.sphere(0.06, '#ffd23f', [0, 0.4, 0], [0.9, 0.9, 1.2]), P.torus(0.055, 0.012, '#211a2e', [0, 0.4, -0.01], [0, 0, 0]), P.torus(0.045, 0.012, '#211a2e', [0, 0.4, -0.05], [0, 0, 0]), ...petEyes(0, 0.42, 0.065, 0.04)],
        anim: [-1, 1].map((dx) => ({ geos: [P.sphere(0.045, '#e2f2ff', [dx * 0.04, 0, 0], [1, 0.15, 0.6])], pivot: [dx * 0.03, 0.46, 0] as V3, update: (o: THREE.Object3D, t: number) => { o.rotation.z = dx * Math.sin(t * 50) * 0.6; } })),
        motion: 'hover',
      };
    case 'axolotl':
      return {
        body: [P.capsule(0.045, 0.12, '#ffb3cf', [0, 0.06, 0], [Math.PI / 2, 0, 0]), P.sphere(0.065, '#ffb3cf', [0, 0.09, 0.1]), ...[-1, 1].flatMap((dx) => [0, 1, 2].map((i) => P.cone(0.012, 0.06, '#ff5fa2', [dx * 0.07, 0.1 + i * 0.025, 0.08], [0, 0, dx * (1.2 - i * 0.3)], 1, 4))), ...petEyes(0, 0.1, 0.16, 0.06)],
        anim: [{ geos: [P.sphere(0.04, '#ffb3cf', [0, 0, -0.06], [0.4, 0.8, 1.5])], pivot: [0, 0.06, -0.1], update: (o, t) => { o.rotation.y = Math.sin(t * 4) * 0.4; } }],
        motion: 'walk',
      };
    default:
      return null;
  }
}
