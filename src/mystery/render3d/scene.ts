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
import { floorBase, mix, paintFloorTile } from '../render2d/paint';
import { stationStyle } from '../render2d/paint';

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
function floorTexture(style: FloorStyle, night: boolean): THREE.CanvasTexture {
  const key = `${style}:${night}`;
  const hit = floorTexCache.get(key);
  if (hit) return hit;
  const s = 64;
  const n = 4;
  const c = document.createElement('canvas');
  c.width = c.height = s * n;
  const g = c.getContext('2d')!;
  // Neutral-ish base: room colour is applied with vertex colours.
  const base = floorBase(style, '#ffffff', false);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) paintFloorTile(g, style, x, y, s, base);
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
  // Vertex colour multiplies the neutral texture toward the room accent.
  const t = style === 'grass' || style === 'snow' || style === 'wood' || style === 'stone' ? 0.16 : 0.32;
  return new THREE.Color(mix('#ffffff', accent, t));
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
          { geo: rbox(1, 0.08, 1, 0.03, 0.72), color: kind === 'counter' ? '#cbd5e1' : '#d29a64', height: 0.8 },
          { geo: merge([cyl(0.04, 0.04, 0.72, 0, 6).translate(-0.4, 0, -0.4), cyl(0.04, 0.04, 0.72, 0, 6).translate(0.4, 0, -0.4), cyl(0.04, 0.04, 0.72, 0, 6).translate(-0.4, 0, 0.4), cyl(0.04, 0.04, 0.72, 0, 6).translate(0.4, 0, 0.4)]), color: '#5b4636', height: 0.72 },
          ...(kind === 'desk' ? [{ geo: rbox(0.55, 0.36, 0.06, 0.03, 0.82).translate(0, 0, -0.25), color: '#1e293b', emissive: '#3b82f6', height: 1.2 }] : []),
        ],
      };
      break;
    case 'roundTable':
      s = { parts: [{ geo: cyl(0.5, 0.5, 0.08, 0.72, 28), color: '#e2e8f0', height: 0.8 }, { geo: cyl(0.12, 0.2, 0.72, 0, 12), color: '#94a3b8', height: 0.72 }] };
      break;
    case 'chair':
    case 'seat':
      s = { parts: [{ geo: merge([rbox(0.5, 0.08, 0.5, 0.03, 0.42), rbox(0.5, 0.5, 0.08, 0.03, 0.46).translate(0, 0, -0.22), cyl(0.05, 0.05, 0.42, 0, 6)]), color: '#475569', height: 0.95 }] };
      break;
    case 'sofa':
    case 'bench':
      s = { parts: [{ geo: merge([rbox(1, 0.4, 1, 0.12, 0), rbox(1, 0.45, 0.28, 0.12, 0.35).translate(0, 0, -0.36)]), color: kind === 'sofa' ? '#6366f1' : '#a16207', height: 0.8 }] };
      break;
    case 'bed':
      s = { parts: [{ geo: rbox(1, 0.45, 1, 0.1), color: '#f1f5f9', height: 0.45 }, { geo: rbox(0.98, 0.12, 0.65, 0.06, 0.42).translate(0, 0, 0.17), color: '#6366f1', height: 0.55 }] };
      break;
    case 'shelf':
    case 'bookshelf':
      s = {
        parts: [
          { geo: rbox(1, 2, 1, 0.04), color: '#7c4a26', height: 2 },
          { geo: merge([0.35, 0.85, 1.35].map((y) => rbox(0.9, 0.36, 0.9, 0.02, y))), color: '#3b82f6', height: 1.8 },
        ],
      };
      break;
    case 'crate':
    case 'cart':
      s = { parts: [{ geo: rbox(0.9, 0.9, 0.9, 0.06), color: '#b7814f', height: 0.9 }] };
      break;
    case 'barrel':
      s = { parts: [{ geo: cyl(0.42, 0.42, 0.95, 0, 14), color: '#8b5a2b', height: 0.95 }] };
      break;
    case 'plant':
      s = { parts: [{ geo: cyl(0.22, 0.17, 0.4, 0, 10), color: '#c2410c', height: 0.4 }, { geo: merge([sph(0.32, 0.75), sph(0.22, 0.95, 1, 1, 1, 0.15, 0.1), sph(0.2, 0.9, 1, 1, 1, -0.15, -0.05)]), color: '#22c55e', height: 1.1 }] };
      break;
    case 'planter':
      s = { parts: [{ geo: rbox(1, 0.45, 1, 0.08), color: '#a16207', height: 0.45 }, { geo: merge([sph(0.3, 0.6, 1.5, 0.8, 1), sph(0.24, 0.7, 1, 1, 1, 0.3, 0.1)]), color: '#16a34a', height: 0.9 }] };
      break;
    case 'tree':
      s = { parts: [{ geo: cyl(0.12, 0.18, 1.6, 0, 8), color: '#7c4a26', height: 1.6 }, { geo: merge([sph(0.7, 2, 1, 0.9, 1), sph(0.5, 2.4, 1, 1, 1, 0.3, 0.2), sph(0.45, 2.3, 1, 1, 1, -0.35, -0.1)]), color: '#15803d', height: 3 }] };
      break;
    case 'hedge':
      s = { parts: [{ geo: rbox(1, 1.6, 1, 0.25), color: '#166534', height: 1.6 }] };
      break;
    case 'console':
      s = { parts: [{ geo: rbox(1, 0.9, 0.7, 0.08), color: '#334155', height: 0.9 }, { geo: rbox(0.9, 0.04, 0.55, 0.02, 0.9).rotateX(-0.25), color: '#0f172a', emissive: '#38bdf8', height: 1 }] };
      break;
    case 'screen':
    case 'window':
    case 'poster':
      s = { parts: [{ geo: rbox(1, 0.9, 0.08, 0.03, 1.1), color: kind === 'poster' ? '#2f6fed' : '#0f172a', emissive: kind === 'screen' ? '#60a5fa' : kind === 'window' ? '#93c5fd' : undefined, height: 2 }] };
      break;
    case 'server':
      s = { parts: [{ geo: rbox(0.9, 2, 0.9, 0.05), color: '#1e293b', height: 2 }, { geo: merge([0.4, 0.8, 1.2, 1.6].map((y) => rbox(0.6, 0.05, 0.02, 0.01, y).translate(0, 0, 0.46))), color: '#0f172a', emissive: '#22d3ee', height: 1.7 }] };
      break;
    case 'locker':
    case 'fridge':
      s = { parts: [{ geo: rbox(0.9, 1.9, 0.9, 0.05), color: kind === 'fridge' ? '#e2e8f0' : '#64748b', height: 1.9 }] };
      break;
    case 'stove':
    case 'generator':
    case 'engine':
      s = { parts: [{ geo: rbox(1, 1, 1, 0.12), color: '#475569', height: 1 }, { geo: rbox(0.6, 0.4, 0.06, 0.04, 0.35).translate(0, 0, 0.5), color: '#7c2d12', emissive: kind === 'engine' ? '#f97316' : kind === 'stove' ? '#ef4444' : '#facc15', height: 0.8 }] };
      break;
    case 'tank':
      s = { parts: [{ geo: cyl(0.48, 0.48, 1.4, 0, 18), color: '#94a3b8', height: 1.4 }, { geo: sph(0.48, 1.4, 1, 0.5, 1), color: '#cbd5e1', height: 1.6 }] };
      break;
    case 'pillar':
      s = { parts: [{ geo: cyl(0.4, 0.45, 2.6, 0, 16), color: '#e2e8f0', height: 2.6 }] };
      break;
    case 'statue':
      s = { parts: [{ geo: rbox(0.9, 0.5, 0.9, 0.06), color: '#cbd5e1', height: 0.5 }, { geo: merge([sph(0.36, 1.0, 1, 1.15, 1), sph(0.12, 1.5)]), color: '#2f6fed', emissive: '#1d4ed8', height: 1.6 }] };
      break;
    case 'fountain':
      s = { parts: [{ geo: cyl(0.5, 0.5, 0.4, 0, 24), color: '#cbd5e1', height: 0.4 }, { geo: cyl(0.42, 0.42, 0.05, 0.36, 24), color: '#38bdf8', emissive: '#0ea5e9', height: 0.42 }] };
      break;
    case 'rock':
      s = { parts: [{ geo: sph(0.5, 0.25, 1, 0.6, 0.9), color: '#78716c', height: 0.55 }] };
      break;
    case 'snowpile':
      s = { parts: [{ geo: sph(0.5, 0.1, 1, 0.5, 1), color: '#f8fafc', height: 0.35 }] };
      break;
    case 'rug':
      s = { parts: [{ geo: rbox(1, 0.02, 1, 0.01, 0.01), color: '#ec4899', height: 0.03 }] };
      break;
    case 'arcade':
      s = { parts: [{ geo: rbox(0.8, 1.7, 0.8, 0.08), color: '#7c3aed', height: 1.7 }, { geo: rbox(0.6, 0.45, 0.04, 0.03, 1.05).translate(0, 0, 0.41), color: '#111827', emissive: '#e879f9', height: 1.5 }] };
      break;
    case 'piano':
      s = { parts: [{ geo: rbox(1, 1, 1, 0.08), color: '#111827', height: 1 }, { geo: rbox(0.9, 0.04, 0.2, 0.02, 0.75).translate(0, 0, 0.45), color: '#f8fafc', height: 0.8 }] };
      break;
    case 'clock':
      s = { parts: [{ geo: rbox(0.5, 2, 0.4, 0.06), color: '#7c4a26', height: 2 }, { geo: cyl(0.18, 0.18, 0.04, 0, 20).rotateX(Math.PI / 2).translate(0, 1.6, 0.21), color: '#fef3c7', height: 1.8 }] };
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
  wallHeight: number;
  lamps: { pos: THREE.Vector3; color: THREE.Color; r: number }[];
  dispose(): void;
}

export function buildMapScene(map: CompiledMap, quality: Quality, night: boolean): MapScene {
  const group = new THREE.Group();
  const theme = map.def.theme;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  // Floors: one merged mesh per floor style.
  const byStyle = new Map<FloorStyle, THREE.BufferGeometry[]>();
  const add = (style: FloorStyle, geo: THREE.BufferGeometry) => {
    let arr = byStyle.get(style);
    if (!arr) byStyle.set(style, (arr = []));
    arr.push(geo);
  };
  for (const room of map.def.rooms) for (const r of rectsOf(room)) add(room.floor, planeForRect(r, 0, tint(room.color, room.floor)));
  for (const h of map.def.halls) add(h.floor ?? 'tile', planeForRect(h.rect, -0.004, new THREE.Color(theme.hall)));
  for (const [style, geos] of byStyle) {
    const geo = track(mergeGeometries(geos)!);
    const mat = track(
      new THREE.MeshToonMaterial({
        map: floorTexture(style, night),
        vertexColors: true,
        gradientMap: toonGradient(),
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = quality === 'high';
    group.add(mesh);
  }
  // Ground plane below everything (void).
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(map.w * 3, map.h * 3)), track(new THREE.MeshBasicMaterial({ color: night ? '#04060d' : mix(theme.void, '#1b2540', 0.3) })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.w / 2, -0.05, map.h / 2);
  group.add(ground);
  // Walls.
  const wallH = 2.3;
  const walls = map.walls;
  const wallGeo = track(new THREE.BoxGeometry(1, wallH, 1));
  wallGeo.translate(0, wallH / 2, 0);
  const wallMat = track(toon('#ffffff'));
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
  const capGeo = track(new THREE.BoxGeometry(1.02, 0.12, 1.02));
  capGeo.translate(0, wallH + 0.06, 0);
  const capMat = track(toon(night ? mix(theme.wallTop, '#0b1022', 0.4) : theme.wallTop));
  const capMesh = new THREE.InstancedMesh(capGeo, capMat, walls.length);
  const trimGeo = track(new THREE.BoxGeometry(1.01, 0.12, 1.01));
  trimGeo.translate(0, 0.06, 0);
  const trimMesh = new THREE.InstancedMesh(trimGeo, track(toon('#ffffff', { emissive: new THREE.Color(night ? '#334155' : '#000000') })), walls.length);
  const m4 = new THREE.Matrix4();
  const baseWall = new THREE.Color(night ? mix(theme.wall, '#0b1022', 0.55) : theme.wall);
  const tmp = new THREE.Color();
  walls.forEach((wi, i) => {
    const wx = wi % map.w;
    const wz = Math.floor(wi / map.w);
    m4.makeTranslation(wx + 0.5, 0, wz + 0.5);
    wallMesh.setMatrixAt(i, m4);
    capMesh.setMatrixAt(i, m4);
    trimMesh.setMatrixAt(i, m4);
    // Tint each wall toward the room it faces so every room has its own colour.
    let room = -1;
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const nx = wx + dx;
      const nz = wz + dz;
      if (nx < 0 || nz < 0 || nx >= map.w || nz >= map.h) continue;
      const ri = map.roomIdx[nz * map.w + nx]!;
      if (ri >= 0) {
        room = ri;
        break;
      }
    }
    tmp.copy(baseWall);
    if (room >= 0) tmp.lerp(new THREE.Color(map.def.rooms[room]!.color), night ? 0.18 : 0.3);
    wallMesh.setColorAt(i, tmp);
    trimMesh.setColorAt(i, room >= 0 ? new THREE.Color(map.def.rooms[room]!.color) : new THREE.Color(theme.trim));
  });
  if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
  if (trimMesh.instanceColor) trimMesh.instanceColor.needsUpdate = true;
  wallMesh.castShadow = quality === 'high';
  wallMesh.receiveShadow = quality === 'high';
  group.add(wallMesh, capMesh, trimMesh);
  // Props (instanced by kind/part).
  const byKind = new Map<PropKind, PropDef[]>();
  for (const p of map.def.props) {
    let arr = byKind.get(p.kind);
    if (!arr) byKind.set(p.kind, (arr = []));
    arr.push(p);
  }
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  for (const [kind, props] of byKind) {
    const shape = shapeFor(kind);
    shape.parts.forEach((part, pi) => {
      const mat = track(
        toon(night ? mix(part.color, '#0b1022', 0.35) : part.color, part.emissive ? { emissive: new THREE.Color(part.emissive), emissiveIntensity: night ? 1.2 : 0.6 } : {}),
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
        if (pi === 0 && (p.color || kind === 'sofa' || kind === 'rug')) inst.setColorAt(i, new THREE.Color(p.color ?? (kind === 'rug' ? '#ec4899' : '#6366f1')));
      });
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.castShadow = quality === 'high' && part.height > 0.5;
      group.add(inst);
    });
  }
  // Stations: themed consoles with glowing screens.
  const stationMeshes = new Map<string, THREE.Object3D>();
  const stBase = track(rbox(0.6, 1, 0.45, 0.08));
  const stScreen = track(rbox(0.48, 0.32, 0.04, 0.03, 0.62).translate(0, 0, 0.22));
  const btnBase = track(cyl(0.38, 0.44, 0.9, 0, 20));
  const btnDome = track(sph(0.26, 0.92, 1, 0.6, 1));
  for (const st of map.def.stations) {
    const style = stationStyle(st.kind);
    const g = new THREE.Group();
    if (style.icon === 'button') {
      g.add(new THREE.Mesh(btnBase, track(toon('#334155'))));
      g.add(new THREE.Mesh(btnDome, track(toon('#ef4444', { emissive: new THREE.Color('#ef4444'), emissiveIntensity: 0.5 }))));
    } else if (style.icon === 'mirror') {
      g.add(new THREE.Mesh(track(rbox(0.9, 1.8, 0.12, 0.3)), track(toon('#f9a8d4'))));
      g.add(new THREE.Mesh(track(rbox(0.7, 1.5, 0.04, 0.25, 0.15).translate(0, 0, 0.07)), track(new THREE.MeshStandardMaterial({ color: '#dbeafe', metalness: 0.9, roughness: 0.1 }))));
    } else {
      g.add(new THREE.Mesh(stBase, track(toon(night ? '#1e293b' : '#475569'))));
      g.add(new THREE.Mesh(stScreen, track(toon('#0f172a', { emissive: new THREE.Color(style.color), emissiveIntensity: 0.9 }))));
    }
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
  // Vents.
  const ventGeo = track(rbox(0.9, 0.06, 0.65, 0.03));
  const ventMat = track(toon(night ? '#1e293b' : '#64748b'));
  for (const v of map.def.vents) {
    const m = new THREE.Mesh(ventGeo, ventMat);
    m.position.set(v.x, 0, v.y);
    group.add(m);
  }
  // Door shutters (hidden until closed).
  const doorMeshes = new Map<string, THREE.Mesh>();
  const shutterMat = track(toon('#334155', { emissive: new THREE.Color('#ff4d5e'), emissiveIntensity: 0.25 }));
  for (const d of map.def.doors) {
    const [x, z, w, h] = d.rect;
    const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, wallH, h)), shutterMat);
    m.position.set(x + w / 2, wallH / 2, z + h / 2);
    m.visible = false;
    group.add(m);
    doorMeshes.set(d.id, m);
  }
  // Highlight ring for interactables.
  const highlight = new THREE.Mesh(track(new THREE.TorusGeometry(0.55, 0.05, 8, 32)), track(new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.9 })));
  highlight.rotation.x = -Math.PI / 2;
  highlight.visible = false;
  group.add(highlight);
  // Lamp glows (cheap additive sprites).
  const lamps = map.def.lamps.map((l) => ({ pos: new THREE.Vector3(l.x, 2.1, l.y), color: new THREE.Color(l.color), r: l.r }));
  const glowTex = track(radialTexture());
  for (const l of map.def.lamps) {
    const spr = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color: l.color, transparent: true, opacity: night ? 0.55 : 0.25, depthWrite: false, blending: THREE.AdditiveBlending })));
    spr.position.set(l.x, 2.25, l.y);
    spr.scale.setScalar(night ? 1.6 : 1.2);
    group.add(spr);
    const fixture = new THREE.Mesh(track(cyl(0.25, 0.32, 0.1, 0, 12)), track(new THREE.MeshBasicMaterial({ color: night ? '#fde68a' : '#fffbeb' })));
    fixture.position.set(l.x, wallH - 0.05, l.y);
    group.add(fixture);
  }
  return {
    group,
    stationMeshes,
    highlight,
    doorMeshes,
    lanterns,
    wallHeight: wallH,
    lamps,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
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
