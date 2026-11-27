/**
 * Builds the static 3D map: floors (textures painted with the same 2D floor
 * painters), instanced walls with trim caps, toon-shaded instanced props,
 * stations, vents and lamp glows. World (x, y) maps to three (x, 0, y).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CompiledMap, FloorStyle, PropDef, PropKind, Rect } from '../core/map';
import { rectsOf } from '../core/map';
import { hash2, mix, paintWorldFloor, stationStyle, WORLD, worldFloorBase } from '../render2d/paint';
import { Diag, worldInfo, type WallKind } from '../render2d/world';
import { addHull, occluderFade, cornerPoints, diagPrisms, groundTexture, hallStrips, hullMaterial, inkLines, roomNameDecals, solidRingTexture, ventGlowTexture, ventTexture, wallBoundary, wallTexture } from './worldkit';

export type Quality = 'low' | 'medium' | 'high';

let gradientMap: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export function toon(color: string | THREE.Color, extra: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

const floorTexCache = new Map<string, THREE.CanvasTexture>();
function floorTexture(style: FloorStyle, night: boolean, quality: Quality): THREE.CanvasTexture {
  // 128 px per tile on high quality: first person looks at floor tiles up close.
  const s = quality === 'high' ? 128 : 64;
  const key = `${style}:${night}:${s}`;
  const hit = floorTexCache.get(key);
  if (hit) return hit;
  const n = 4;
  const c = document.createElement('canvas');
  c.width = c.height = s * n;
  const g = c.getContext('2d')!;
  // Cel floor colours; the room accent is applied (subtly) with vertex colours.
  const base = worldFloorBase(style, '#8f99a5', false);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) paintWorldFloor(g, style, x, y, s, base);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  floorTexCache.set(key, tex);
  return tex;
}

function planeForRect(r: Rect, y: number, color: THREE.Color): THREE.BufferGeometry {
  const [x, z, w, h] = r;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x + w / 2, y, z + h / 2);
  // UVs in world units / 4 tiles per texture repeat.
  const pos = geo.attributes.position!;
  const uv = geo.attributes.uv!;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / 4, -pos.getZ(i) / 4);
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function tint(accent: string, style: FloorStyle): THREE.Color {
  // Vertex colour nudges the cel texture toward the room accent (subtle).
  const t = style === 'grass' || style === 'snow' || style === 'stone' ? 0.06 : 0.16;
  return new THREE.Color(mix('#ffffff', accent, t));
}

function triForDiag(x: number, z: number, code: number, color: THREE.Color): THREE.BufferGeometry {
  const pts: Record<number, [number, number][]> = {
    [Diag.SE]: [[x + 1, z], [x, z + 1], [x + 1, z + 1]],
    [Diag.SW]: [[x, z], [x, z + 1], [x + 1, z + 1]],
    [Diag.NE]: [[x, z], [x + 1, z + 1], [x + 1, z]],
    [Diag.NW]: [[x, z], [x, z + 1], [x + 1, z]],
  };
  const tri = pts[code]!;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  for (const [px, pz] of tri) {
    pos.push(px, 0, pz);
    uv.push(px / 4, -pz / 4);
    col.push(color.r, color.g, color.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([0, 1, 2]);
  return g;
}

// ---------------------------------------------------------------------------
// Prop geometry library (unit-sized, scaled per instance).

interface PropShape {
  parts: { geo: THREE.BufferGeometry; color: string; emissive?: string; height: number }[];
}

const shapeCache = new Map<PropKind, PropShape>();

function rbox(w: number, h: number, d: number, r = 0.08, y = 0): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
  g.translate(0, y + h / 2, 0);
  return g;
}
function cyl(rt: number, rb: number, h: number, y = 0, seg = 16): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(0, y + h / 2, 0);
  return g;
}
function sph(r: number, y: number, sx = 1, sy = 1, sz = 1, x = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 14, 10);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}
const merge = (gs: THREE.BufferGeometry[]) => {
  const ni = gs.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of ni) {
    g.deleteAttribute('uv');
    if (!g.attributes.normal) g.computeVertexNormals();
  }
  return mergeGeometries(ni)!;
};

function shapeFor(kind: PropKind): PropShape {
  const hit = shapeCache.get(kind);
  if (hit) return hit;
  let s: PropShape;
  switch (kind) {
    case 'table':
    case 'desk':
    case 'counter':
      s = {
        parts: [
          { geo: rbox(1, 0.08, 1, 0.03, 0.72), color: kind === 'counter' ? '#a9b5c3' : '#c99b6e', height: 0.8 },
          { geo: merge([cyl(0.04, 0.04, 0.72, 0, 6).translate(-0.4, 0, -0.4), cyl(0.04, 0.04, 0.72, 0, 6).translate(0.4, 0, -0.4), cyl(0.04, 0.04, 0.72, 0, 6).translate(-0.4, 0, 0.4), cyl(0.04, 0.04, 0.72, 0, 6).translate(0.4, 0, 0.4)]), color: '#5b4636', height: 0.72 },
          ...(kind === 'desk' ? [{ geo: rbox(0.55, 0.36, 0.06, 0.03, 0.82).translate(0, 0, -0.25), color: '#1d2635', emissive: '#7fe3c4', height: 1.2 }] : []),
        ],
      };
      break;
    case 'roundTable':
      s = { parts: [{ geo: cyl(0.5, 0.5, 0.08, 0.72, 28), color: '#4f9cb8', height: 0.8 }, { geo: cyl(0.12, 0.2, 0.72, 0, 12), color: '#3d4b5c', height: 0.72 }] };
      break;
    case 'chair':
    case 'seat':
      s = { parts: [{ geo: merge([rbox(0.5, 0.08, 0.5, 0.03, 0.42), rbox(0.5, 0.5, 0.08, 0.03, 0.46).translate(0, 0, -0.22), cyl(0.05, 0.05, 0.42, 0, 6)]), color: '#46566a', height: 0.95 }] };
      break;
    case 'sofa':
    case 'bench':
      s = { parts: [{ geo: merge([rbox(1, 0.4, 1, 0.12, 0), rbox(1, 0.45, 0.28, 0.12, 0.35).translate(0, 0, -0.36)]), color: kind === 'sofa' ? '#b39a7c' : '#8a6446', height: 0.8 }] };
      break;
    case 'bed':
      s = { parts: [{ geo: rbox(1, 0.45, 1, 0.1), color: '#e9e4dc', height: 0.45 }, { geo: rbox(0.98, 0.12, 0.65, 0.06, 0.42).translate(0, 0, 0.17), color: '#7d8fb8', height: 0.55 }] };
      break;
    case 'shelf':
    case 'bookshelf':
      s = {
        parts: [
          { geo: rbox(1, 2, 1, 0.04), color: '#5c3d2a', height: 2 },
          { geo: merge([0.35, 0.85, 1.35].map((y) => rbox(0.9, 0.36, 0.9, 0.02, y))), color: '#c9637f', height: 1.8 },
        ],
      };
      break;
    case 'crate':
    case 'cart':
      s = { parts: [{ geo: rbox(0.9, 0.9, 0.9, 0.06), color: '#b0804f', height: 0.9 }] };
      break;
    case 'barrel':
      s = { parts: [{ geo: cyl(0.42, 0.42, 0.95, 0, 14), color: '#8b5a2b', height: 0.95 }] };
      break;
    case 'plant':
      s = { parts: [{ geo: cyl(0.22, 0.17, 0.4, 0, 10), color: '#8a5a3c', height: 0.4 }, { geo: merge([sph(0.32, 0.75), sph(0.22, 0.95, 1, 1, 1, 0.15, 0.1), sph(0.2, 0.9, 1, 1, 1, -0.15, -0.05)]), color: '#4fa06d', height: 1.1 }] };
      break;
    case 'planter':
      s = { parts: [{ geo: rbox(1, 0.45, 1, 0.08), color: '#a16207', height: 0.45 }, { geo: merge([sph(0.3, 0.6, 1.5, 0.8, 1), sph(0.24, 0.7, 1, 1, 1, 0.3, 0.1)]), color: '#3c8a5e', height: 0.9 }] };
      break;
    case 'tree':
      s = { parts: [{ geo: cyl(0.12, 0.18, 1.6, 0, 8), color: '#7c4a26', height: 1.6 }, { geo: merge([sph(0.7, 2, 1, 0.9, 1), sph(0.5, 2.4, 1, 1, 1, 0.3, 0.2), sph(0.45, 2.3, 1, 1, 1, -0.35, -0.1)]), color: '#3a7d5c', height: 3 }] };
      break;
    case 'hedge':
      s = { parts: [{ geo: rbox(1, 1.6, 1, 0.25), color: '#2f6b4f', height: 1.6 }] };
      break;
    case 'console':
      s = { parts: [{ geo: rbox(1, 0.9, 0.7, 0.08), color: '#3a4a5c', height: 0.9 }, { geo: rbox(0.9, 0.04, 0.55, 0.02, 0.9).rotateX(-0.25), color: '#0f172a', emissive: '#6fd9b6', height: 1 }] };
      break;
    case 'screen':
    case 'window':
    case 'poster':
      s = { parts: [{ geo: rbox(1, 0.9, 0.08, 0.03, 1.1), color: kind === 'poster' ? '#2f6fed' : '#0f172a', emissive: kind === 'screen' ? '#79c7dd' : kind === 'window' ? '#93c5fd' : undefined, height: 2 }] };
      break;
    case 'server':
      s = { parts: [{ geo: rbox(0.9, 2, 0.9, 0.05), color: '#28313f', height: 2 }, { geo: merge([0.4, 0.8, 1.2, 1.6].map((y) => rbox(0.6, 0.05, 0.02, 0.01, y).translate(0, 0, 0.46))), color: '#0f172a', emissive: '#22d3ee', height: 1.7 }] };
      break;
    case 'locker':
    case 'fridge':
      s = { parts: [{ geo: rbox(0.9, 1.9, 0.9, 0.05), color: kind === 'fridge' ? '#e6e8ee' : '#5a8a86', height: 1.9 }] };
      break;
    case 'stove':
    case 'generator':
    case 'engine':
      s = { parts: [{ geo: rbox(1, 1, 1, 0.12), color: '#4a5868', height: 1 }, { geo: rbox(0.6, 0.4, 0.06, 0.04, 0.35).translate(0, 0, 0.5), color: '#7c2d12', emissive: kind === 'engine' ? '#f97316' : kind === 'stove' ? '#ef4444' : '#facc15', height: 0.8 }] };
      break;
    case 'tank':
      s = { parts: [{ geo: cyl(0.48, 0.48, 1.4, 0, 18), color: '#5fc9a0', height: 1.4 }, { geo: sph(0.48, 1.4, 1, 0.5, 1), color: '#5e6c7c', height: 1.6 }] };
      break;
    case 'pillar':
      s = { parts: [{ geo: cyl(0.4, 0.45, 2.6, 0, 16), color: '#5d7480', height: 2.6 }] };
      break;
    case 'statue':
      s = { parts: [{ geo: rbox(0.9, 0.5, 0.9, 0.06), color: '#cbd5e1', height: 0.5 }, { geo: merge([sph(0.36, 1.0, 1, 1.15, 1), sph(0.12, 1.5)]), color: '#2f6fed', emissive: '#1d4ed8', height: 1.6 }] };
      break;
    case 'fountain':
      s = { parts: [{ geo: cyl(0.5, 0.5, 0.4, 0, 24), color: '#cbd5e1', height: 0.4 }, { geo: cyl(0.42, 0.42, 0.05, 0.36, 24), color: '#38bdf8', emissive: '#0ea5e9', height: 0.42 }] };
      break;
    case 'rock':
      s = { parts: [{ geo: sph(0.5, 0.25, 1, 0.6, 0.9), color: '#6c5b80', height: 0.55 }] };
      break;
    case 'snowpile':
      s = { parts: [{ geo: sph(0.5, 0.1, 1, 0.5, 1), color: '#f8fafc', height: 0.35 }] };
      break;
    case 'rug':
      s = { parts: [{ geo: rbox(1, 0.02, 1, 0.01, 0.01), color: '#ec4899', height: 0.03 }] };
      break;
    case 'arcade':
      s = { parts: [{ geo: rbox(0.8, 1.7, 0.8, 0.08), color: '#6c4bb8', height: 1.7 }, { geo: rbox(0.6, 0.45, 0.04, 0.03, 1.05).translate(0, 0, 0.41), color: '#111827', emissive: '#e879f9', height: 1.5 }] };
      break;
    case 'piano':
      s = { parts: [{ geo: rbox(1, 1, 1, 0.08), color: '#111827', height: 1 }, { geo: rbox(0.9, 0.04, 0.2, 0.02, 0.75).translate(0, 0, 0.45), color: '#f8fafc', height: 0.8 }] };
      break;
    case 'clock':
      s = { parts: [{ geo: rbox(0.5, 2, 0.4, 0.06), color: '#5c3d2a', height: 2 }, { geo: cyl(0.18, 0.18, 0.04, 0, 20).rotateX(Math.PI / 2).translate(0, 1.6, 0.21), color: '#fef3c7', height: 1.8 }] };
      break;
    case 'fireplace':
      s = { parts: [{ geo: rbox(1, 1.3, 0.6, 0.06), color: '#78350f', height: 1.3 }, { geo: rbox(0.55, 0.45, 0.05, 0.04, 0.15).translate(0, 0, 0.3), color: '#7c2d12', emissive: '#fb923c', height: 0.6 }] };
      break;
    case 'telescope':
    case 'dish':
      s = { parts: [{ geo: cyl(0.1, 0.25, 1, 0, 10), color: '#64748b', height: 1 }, { geo: sph(0.55, 1.2, 1, 0.35, 1).rotateX(-0.6), color: '#e2e8f0', height: 1.5 }] };
      break;
    case 'turntable':
      s = { parts: [{ geo: rbox(1, 0.7, 1, 0.06), color: '#1f2937', height: 0.7 }, { geo: cyl(0.38, 0.38, 0.03, 0.7, 24), color: '#111827', emissive: '#a78bfa', height: 0.75 }] };
      break;
    case 'mailbox':
      s = { parts: [{ geo: rbox(0.8, 1.1, 0.6, 0.12), color: '#2563eb', height: 1.1 }] };
      break;
    case 'tube':
    case 'pipe':
      s = { parts: [{ geo: cyl(0.22, 0.22, 2.4, 0, 12), color: '#94a3b8', emissive: '#1e3a8a', height: 2.4 }] };
      break;
    case 'lamp':
      s = { parts: [{ geo: cyl(0.04, 0.08, 1.4, 0, 8), color: '#334155', height: 1.4 }, { geo: sph(0.22, 1.5), color: '#fde68a', emissive: '#fbbf24', height: 1.7 }] };
      break;
    default:
      s = { parts: [{ geo: rbox(0.9, 0.9, 0.9, 0.1), color: '#94a3b8', height: 0.9 }] };
  }
  shapeCache.set(kind, s);
  return s;
}

export interface MapScene {
  group: THREE.Group;
  stationMeshes: Map<string, THREE.Object3D>;
  highlight: THREE.Mesh;
  doorMeshes: Map<string, THREE.Mesh>;
  lanterns: Map<string, THREE.Mesh>;
  /** Vent lids + their (hidden) orange highlight hulls. */
  vents: Map<string, { mesh: THREE.Mesh; glow: THREE.Mesh }>;
  wallHeight: number;
  /** Ceiling slabs + lit strips over indoor floors (shown in first person only). */
  ceiling: THREE.Group;
  lamps: { pos: THREE.Vector3; color: THREE.Color; r: number }[];
  dispose(): void;
}

export function buildMapScene(map: CompiledMap, quality: Quality, night: boolean): MapScene {
  const group = new THREE.Group();
  const info = worldInfo(map);
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const inkOn = quality !== 'low';
  // Map ink (props, stations, doors) takes part in the third-person occluder fade.
  const ink = hullMaterial(night ? '#04060c' : WORLD.ink, 0.04, true, undefined, true);
  const inkThin = hullMaterial(night ? '#04060c' : WORLD.ink, 0.028, true, undefined, true);
  // Floors: one merged mesh per floor style.
  const byStyle = new Map<FloorStyle, THREE.BufferGeometry[]>();
  const add = (style: FloorStyle, geo: THREE.BufferGeometry) => {
    let arr = byStyle.get(style);
    if (!arr) byStyle.set(style, (arr = []));
    arr.push(geo);
  };
  for (const room of map.def.rooms) for (const r of rectsOf(room)) add(room.floor, planeForRect(r, 0, tint(room.color, room.floor)));
  for (const h of map.def.halls) add(h.floor ?? 'tile', planeForRect(h.rect, -0.004, new THREE.Color('#ffffff')));
  // Floor halves under 45° staircase walls.
  for (const i of map.walls) {
    const d = info.diag[i]!;
    if (!d) continue;
    const x = i % map.w;
    const z = (i / map.w) | 0;
    const nz = d === Diag.SE || d === Diag.SW ? z + 1 : z - 1;
    const ri = map.roomIdx[nz * map.w + x]!;
    const room = ri >= 0 ? map.def.rooms[ri]! : null;
    add(room?.floor ?? 'tile', triForDiag(x, z, d, room ? tint(room.color, room.floor) : new THREE.Color('#ffffff')));
  }
  for (const [style, geos] of byStyle) {
    const geo = track(mergeGeometries(geos)!);
    const mat = track(
      new THREE.MeshToonMaterial({
        map: floorTexture(style, night, quality),
        vertexColors: true,
        gradientMap: toonGradient(),
        side: THREE.DoubleSide,
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = quality === 'high';
    group.add(mesh);
  }
  // Ground below everything: deep void far out, purple rock + lava near exteriors.
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(map.w * 3, map.h * 3)), track(new THREE.MeshBasicMaterial({ color: night ? '#04060d' : '#121a2c' })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.w / 2, -0.06, map.h / 2);
  group.add(ground);
  const gt = groundTexture(map, info, night);
  track(gt.tex);
  const terrain = new THREE.Mesh(track(new THREE.PlaneGeometry(map.w, map.h)), track(new THREE.MeshBasicMaterial({ map: gt.tex })));
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.set(map.w / 2, -0.03, map.h / 2);
  group.add(terrain);
  // Walls: textured instanced boxes per kind (room / corridor / exterior rock).
  const wallH = 2.3;
  const kindOf = (i: number): WallKind => (info.wallExt[i] ? 'ext' : info.wallRoom[i]! >= 0 ? 'room' : 'hall');
  const byKind = new Map<WallKind, number[]>();
  for (const wi of map.walls) {
    if (info.diag[wi]) continue;
    const k = kindOf(wi);
    let arr = byKind.get(k);
    if (!arr) byKind.set(k, (arr = []));
    arr.push(wi);
  }
  const wallGeo = track(new THREE.BoxGeometry(1, wallH, 1));
  wallGeo.translate(0, wallH / 2, 0);
  const capGeo = track(new THREE.BoxGeometry(1, 0.08, 1));
  capGeo.translate(0, wallH + 0.04, 0);
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Color();
  const wallMats = new Map<WallKind, THREE.Material>();
  const wallMat = (k: WallKind) => {
    let m = wallMats.get(k);
    if (!m) {
      const t = track(wallTexture(k, wallH));
      m = track(toon(night ? '#7d8597' : '#ffffff', { map: t }));
      wallMats.set(k, m);
    }
    return m;
  };
  const capCol = (k: WallKind) => (k === 'ext' ? (night ? mix(WORLD.snow, '#0b1022', 0.5) : WORLD.snow) : night ? mix(WORLD.capTop, '#0b1022', 0.4) : WORLD.capTop);
  for (const [k, list] of byKind) {
    const wm = new THREE.InstancedMesh(wallGeo, wallMat(k), list.length);
    const cm = new THREE.InstancedMesh(capGeo, track(toon(capCol(k))), list.length);
    list.forEach((wi, i) => {
      m4.makeTranslation((wi % map.w) + 0.5, 0, Math.floor(wi / map.w) + 0.5);
      wm.setMatrixAt(i, m4);
      cm.setMatrixAt(i, m4);
      const ri = info.wallRoom[wi]!;
      tmp.set('#ffffff');
      if (k === 'room' && ri >= 0) tmp.lerp(new THREE.Color(map.def.rooms[ri]!.color), 0.1);
      wm.setColorAt(i, tmp);
    });
    if (wm.instanceColor) wm.instanceColor.needsUpdate = true;
    wm.castShadow = quality === 'high';
    wm.receiveShadow = quality === 'high';
    group.add(wm, cm);
  }
  for (const [k, geo] of diagPrisms(map, info, wallH, kindOf)) {
    track(geo);
    const m = new THREE.Mesh(geo, wallMat(k));
    (m.material as THREE.Material).side = THREE.DoubleSide;
    m.castShadow = quality === 'high';
    group.add(m);
  }
  // Ink edge lines along the wall mass: floor contact, top edge, corners.
  {
    const { floorSide, outer } = wallBoundary(map, info);
    const inkMat = track(new THREE.MeshBasicMaterial({ color: night ? '#04060c' : WORLD.ink }));
    const lw = 0.055;
    const corners = cornerPoints(floorSide);
    group.add(inkLines(floorSide, 0.015, lw, corners, wallH + 0.08, inkMat));
    group.add(inkLines([...floorSide, ...outer], wallH + 0.08, lw, [], 0, inkMat));
    group.add(inkLines(floorSide, wallH, lw * 0.8, [], 0, inkMat));
  }
  // Corridor dressing: guide stripes + dashed light strips.
  const strips = hallStrips(map, info);
  if (strips) {
    track(strips);
    group.add(new THREE.Mesh(strips, track(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))));
  }
  // Room names painted on the floor.
  group.add(roomNameDecals(map, night, track));
  // Props (instanced by kind/part), each part with an ink hull.
  const propsByKind = new Map<PropKind, PropDef[]>();
  for (const p of map.def.props) {
    let arr = propsByKind.get(p.kind);
    if (!arr) propsByKind.set(p.kind, (arr = []));
    arr.push(p);
  }
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  for (const [kind, props] of propsByKind) {
    const shape = shapeFor(kind);
    shape.parts.forEach((part, pi) => {
      const mat = track(
        occluderFade(toon(night ? mix(part.color, '#0b1022', 0.35) : part.color, part.emissive ? { emissive: new THREE.Color(part.emissive), emissiveIntensity: night ? 1.2 : 0.6 } : {})),
      );
      const inst = new THREE.InstancedMesh(part.geo, mat, props.length);
      props.forEach((p, i) => {
        const w = p.w ?? 1;
        const h = p.h ?? 1;
        const flat = kind === 'screen' || kind === 'window' || kind === 'poster';
        // Thin wall-mounted things face the room: orient along their longer side.
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(p.rot ?? 0) + (flat && h > w ? Math.PI / 2 : 0));
        sc.set(flat ? Math.max(w, h) : w, 1, flat ? 1 : h);
        pos.set(p.x, 0, p.y);
        m4.compose(pos, q, sc);
        inst.setMatrixAt(i, m4);
        if (pi === 0 && (p.color || kind === 'sofa' || kind === 'rug'))
          inst.setColorAt(i, new THREE.Color(kind === 'roundTable' ? mix(p.color ?? '#4f9cb8', '#3f8fb3', 0.65) : mix(p.color ?? (kind === 'rug' ? '#9a7280' : '#b39a7c'), '#9a8a7a', 0.25)));
      });
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.castShadow = quality === 'high' && part.height > 0.5;
      group.add(inst);
      if (inkOn && part.height > 0.12) group.add(addHull(inst, part.height > 1.2 ? ink : inkThin));
    });
  }
  // Outdoor ground dressing: grass tufts + wildflowers, snow mounds, pebbles.
  if (quality !== 'low') group.add(outdoorDressing(map, info, night, track));
  // Stations: themed consoles with glowing screens.
  const stationMeshes = new Map<string, THREE.Object3D>();
  const stBase = track(rbox(0.6, 1, 0.45, 0.08));
  const stScreen = track(rbox(0.48, 0.32, 0.04, 0.03, 0.62).translate(0, 0, 0.22));
  const btnBase = track(cyl(0.38, 0.44, 0.9, 0, 20));
  const btnDome = track(sph(0.26, 0.92, 1, 0.6, 1));
  const stBaseMat = track(toon(night ? '#243040' : '#3d4b5c'));
  for (const st of map.def.stations) {
    const style = stationStyle(st.kind);
    const g = new THREE.Group();
    let body: THREE.Mesh;
    if (style.icon === 'button') {
      body = new THREE.Mesh(btnBase, track(toon(WORLD.guideYellow)));
      g.add(body);
      g.add(new THREE.Mesh(btnDome, track(toon('#e8364a', { emissive: new THREE.Color('#ef4444'), emissiveIntensity: 0.5 }))));
    } else if (style.icon === 'mirror') {
      body = new THREE.Mesh(track(rbox(0.9, 1.8, 0.12, 0.3)), track(occluderFade(toon(WORLD.pink))));
      g.add(body);
      g.add(new THREE.Mesh(track(rbox(0.7, 1.5, 0.04, 0.25, 0.15).translate(0, 0, 0.07)), track(new THREE.MeshStandardMaterial({ color: '#dbeafe', metalness: 0.9, roughness: 0.1 }))));
    } else {
      body = new THREE.Mesh(stBase, stBaseMat);
      g.add(body);
      const scr = style.icon === 'task' ? '#7fe3c4' : style.color;
      g.add(new THREE.Mesh(stScreen, track(toon('#0f172a', { emissive: new THREE.Color(scr), emissiveIntensity: 0.9 }))));
    }
    if (inkOn) g.add(addHull(body, ink));
    g.position.set(st.x, 0, st.y);
    // Face the nearest open floor direction (towards the room centre).
    const room = map.roomById.get(st.room);
    if (room) {
      const cx = room.rect[0] + room.rect[2] / 2;
      const cz = room.rect[1] + room.rect[3] / 2;
      g.rotation.y = Math.atan2(cx - st.x, cz - st.y);
    }
    group.add(g);
    stationMeshes.set(st.id, g);
  }
  // Lanterns (Lights Out task) get a bulb we can light.
  const lanterns = new Map<string, THREE.Mesh>();
  for (const st of map.def.stations) {
    if (st.kind !== 'lightLantern') continue;
    const bulb = new THREE.Mesh(track(sph(0.16, 1.4)), track(new THREE.MeshBasicMaterial({ color: '#57534e' })));
    bulb.position.set(st.x, 0, st.y);
    group.add(bulb);
    lanterns.set(st.id, bulb);
  }
  // Vents: textured lids with an ink hull and a hidden orange highlight hull.
  const ventGeo = track(new THREE.BoxGeometry(1, 0.07, 0.72));
  ventGeo.translate(0, 0.035, 0);
  const ventMat = track(toon(night ? '#8a90a0' : '#ffffff', { map: track(ventTexture()) }));
  const glowTexV = track(ventGlowTexture());
  const glowGeo = track(new THREE.PlaneGeometry(1.36, 1.08).rotateX(-Math.PI / 2));
  const vents = new Map<string, { mesh: THREE.Mesh; glow: THREE.Mesh }>();
  for (const v of map.def.vents) {
    const m = new THREE.Mesh(ventGeo, ventMat);
    m.position.set(v.x, 0, v.y);
    group.add(m);
    // Orange outline decal (shown when the vent is in reach / occupied).
    const glow = new THREE.Mesh(glowGeo, track(new THREE.MeshBasicMaterial({ map: glowTexV, transparent: true, depthWrite: false })));
    glow.position.set(v.x, 0.075, v.y);
    glow.renderOrder = 3;
    glow.visible = false;
    group.add(glow);
    vents.set(v.id, { mesh: m, glow });
  }
  // Door shutters (hidden until closed): hazard-yellow with ink.
  const doorMeshes = new Map<string, THREE.Mesh>();
  const shutterMat = track(toon(WORLD.guideYellow, { emissive: new THREE.Color('#ff4d5e'), emissiveIntensity: 0.12 }));
  for (const d of map.def.doors) {
    const [x, z, w, h] = d.rect;
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, wallH, h)), shutterMat);
    m.position.set(x + w / 2, wallH / 2, z + h / 2);
    m.visible = false;
    if (inkOn) m.add(addHull(new THREE.Mesh(m.geometry), ink));
    group.add(m);
    doorMeshes.set(d.id, m);
  }
  // Highlight ring for the interactable in reach (solid ring decal).
  const highlight = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2)),
    track(new THREE.MeshBasicMaterial({ map: track(solidRingTexture(WORLD.task)), transparent: true, depthWrite: false, opacity: 1 })),
  );
  highlight.visible = false;
  highlight.renderOrder = 2;
  group.add(highlight);
  // Lamp glows (cheap additive sprites).
  const lamps = map.def.lamps.map((l) => ({ pos: new THREE.Vector3(l.x, 2.1, l.y), color: new THREE.Color(l.color), r: l.r }));
  const glowTex = track(radialTexture());
  // Indoor lamps hang from the ceiling (first person only: with no ceiling they would float);
  // outdoor lamps stand on an inked post so they are anchored in every view.
  const ceilingLamps = new THREE.Group();
  const fixtureGeo = track(cyl(0.25, 0.32, 0.1, 0, 12));
  const fixtureMat = track(occluderFade(new THREE.MeshBasicMaterial({ color: night ? '#fde68a' : '#fffbeb' })));
  const postGeo = track(cyl(0.05, 0.07, wallH - 0.05, 0, 8));
  const postMat = track(occluderFade(toon(night ? '#1c2433' : '#2b3c4a')));
  const headGeo = track(sph(0.16, wallH - 0.02));
  for (const l of map.def.lamps) {
    const tx = Math.floor(l.x);
    const ty = Math.floor(l.y);
    const outside = tx >= 0 && ty >= 0 && tx < map.w && ty < map.h && info.extFloor[ty * map.w + tx] === 1;
    const spr = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: l.color, transparent: true, opacity: night ? 0.55 : 0.25, depthWrite: false, blending: THREE.AdditiveBlending })));
    spr.position.set(l.x, outside ? wallH - 0.02 : 2.25, l.y);
    spr.scale.setScalar(night ? 1.6 : 1.2);
    group.add(spr);
    if (outside) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(l.x, 0, l.y);
      if (inkOn) post.add(addHull(new THREE.Mesh(postGeo), inkThin));
      const head = new THREE.Mesh(headGeo, fixtureMat);
      head.position.set(l.x, 0, l.y);
      if (inkOn) head.add(addHull(new THREE.Mesh(headGeo), inkThin));
      group.add(post, head);
    } else {
      const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
      fixture.position.set(l.x, wallH - 0.05, l.y);
      ceilingLamps.add(fixture);
    }
  }
  // Ceiling (first person): dark slabs over indoor rooms and halls, with
  // dashed light lightStrips down corridors and panel lights in rooms.
  const ceiling = new THREE.Group();
  ceiling.visible = false;
  const OPEN: ReadonlySet<FloorStyle> = new Set<FloorStyle>(['grass', 'snow', 'stone']);
  const slabs: THREE.BufferGeometry[] = [];
  const lightStrips: THREE.BufferGeometry[] = [];
  const slab = (r: Rect) => {
    const [x, z, w, h] = r;
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateX(Math.PI / 2); // faces down
    g.translate(x + w / 2, wallH, z + h / 2);
    slabs.push(g);
  };
  const lightStrip = (x: number, z: number, w: number, h: number) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateX(Math.PI / 2);
    g.translate(x, wallH - 0.02, z);
    lightStrips.push(g);
  };
  for (const room of map.def.rooms) {
    if (room.outdoor) continue;
    for (const r of rectsOf(room)) {
      slab(r);
      const [x, z, w, h] = r;
      for (let px = x + 2; px < x + w - 1; px += 4) for (let pz = z + 2; pz < z + h - 1; pz += 4) lightStrip(px, pz, 1.4, 0.5);
    }
  }
  for (const hl of map.def.halls) {
    if (hl.floor && OPEN.has(hl.floor)) continue;
    slab(hl.rect);
    const [x, z, w, h] = hl.rect;
    if (w >= h) for (let px = x + 0.6; px < x + w - 0.4; px += 1.6) lightStrip(px + 0.45, z + h / 2, 0.9, 0.16);
    else for (let pz = z + 0.6; pz < z + h - 0.4; pz += 1.6) lightStrip(x + w / 2, pz + 0.45, 0.16, 0.9);
  }
  if (slabs.length) {
    const sm = new THREE.Mesh(track(mergeGeometries(slabs)!), track(new THREE.MeshBasicMaterial({ color: night ? '#10151f' : '#5a6880' })));
    ceiling.add(sm);
    for (const g of slabs) g.dispose();
  }
  if (lightStrips.length) {
    const lm = new THREE.Mesh(track(mergeGeometries(lightStrips)!), track(new THREE.MeshBasicMaterial({ color: night ? '#5b6478' : '#f4f7ff' })));
    ceiling.add(lm);
    for (const g of lightStrips) g.dispose();
  }
  ceiling.add(ceilingLamps);
  group.add(ceiling);
  return {
    group,
    ceiling,
    stationMeshes,
    highlight,
    doorMeshes,
    lanterns,
    vents,
    wallHeight: wallH,
    lamps,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * Small instanced details scattered over outdoor floors (seeded per tile), kept
 * clear of stations, vents and props so prompts stay readable. Purely visual.
 */
function outdoorDressing(map: CompiledMap, info: ReturnType<typeof worldInfo>, night: boolean, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const grp = new THREE.Group();
  const keepOut: { x: number; y: number; r: number }[] = [
    ...map.def.stations.map((st) => ({ x: st.x, y: st.y, r: 1.3 })),
    ...map.def.vents.map((v) => ({ x: v.x, y: v.y, r: 1.1 })),
    ...map.def.props.map((p) => ({ x: p.x, y: p.y, r: Math.max(p.w ?? 1, p.h ?? 1) / 2 + 0.4 })),
  ];
  const clear = (x: number, y: number) => keepOut.every((k) => (k.x - x) ** 2 + (k.y - y) ** 2 > k.r * k.r);
  const spots: Record<'tuft' | 'flower' | 'mound' | 'pebble', { x: number; y: number; r: number; s: number }[]> = { tuft: [], flower: [], mound: [], pebble: [] };
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!info.extFloor[i] || map.cells[i] !== 1) continue;
      const ri = map.roomIdx[i]!;
      const style: FloorStyle = ri >= 0 ? map.def.rooms[ri]!.floor : 'grass';
      const r = hash2(x * 3 + 17, y * 5 + 3);
      const px = x + 0.2 + hash2(x + 7, y) * 0.6;
      const py = y + 0.2 + hash2(x, y + 7) * 0.6;
      if (!clear(px, py)) continue;
      const rot = hash2(x + 1, y + 2) * Math.PI * 2;
      const sc = 0.75 + hash2(x + 3, y + 4) * 0.5;
      if (style === 'grass') {
        if (r < 0.05) spots.flower.push({ x: px, y: py, r: rot, s: sc });
        if (r < 0.26) spots.tuft.push({ x: px, y: py, r: rot, s: sc });
      } else if (style === 'snow') {
        if (r < 0.12) spots.mound.push({ x: px, y: py, r: rot, s: sc });
        else if (r < 0.16) spots.pebble.push({ x: px, y: py, r: rot, s: sc });
      } else if (r < 0.1) spots.pebble.push({ x: px, y: py, r: rot, s: sc });
    }
  const blade = (h: number, lean: number, ang: number) => {
    const g = new THREE.ConeGeometry(0.035, h, 4);
    g.translate(0, h / 2, 0);
    g.rotateZ(lean);
    g.rotateY(ang);
    return g;
  };
  const shapes = {
    tuft: { geo: () => merge([blade(0.26, 0.25, 0), blade(0.2, -0.35, 1.1), blade(0.22, 0.4, 2.3), blade(0.17, -0.2, 3.7)]), color: night ? '#26443a' : '#4f8f62' },
    flower: { geo: () => merge([sph(0.055, 0.27, 1, 0.7, 1, 0.03, 0), sph(0.045, 0.22, 1, 0.7, 1, -0.07, 0.05)]), color: night ? '#5a4060' : '#ffffff' },
    mound: { geo: () => sph(0.3, 0, 1.4, 0.35, 1), color: night ? mix(WORLD.snow, '#0b1022', 0.5) : WORLD.snow },
    pebble: { geo: () => sph(0.09, 0.02, 1.3, 0.6, 1), color: night ? mix(WORLD.rockDark, '#0b1022', 0.4) : WORLD.rockHi },
  } as const;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sv = new THREE.Vector3();
  const pv = new THREE.Vector3();
  for (const kind of ['tuft', 'flower', 'mound', 'pebble'] as const) {
    const list = spots[kind];
    if (!list.length) continue;
    const geo = track(shapes[kind].geo());
    const inst = new THREE.InstancedMesh(geo, track(toon(shapes[kind].color)), list.length);
    list.forEach((p, k) => {
      q.setFromAxisAngle(up, p.r);
      inst.setMatrixAt(k, m4.compose(pv.set(p.x, 0, p.y), q, sv.setScalar(p.s)));
      if (kind === 'flower' && !night) inst.setColorAt(k, new THREE.Color(k % 2 ? WORLD.guideYellow : '#e98fb0'));
    });
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    grp.add(inst);
  }
  return grp;
}

export function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
