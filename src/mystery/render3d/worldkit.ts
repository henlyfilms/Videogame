/**
 * 3D building blocks for the cel-shaded world: inverted-hull ink outlines
 * (instancing aware), wall textures (riveted teal panels, beige wallpaper,
 * pink stripe; corridor guide stripes; exterior rock with snow), ink edge
 * lines along the wall mass, corridor light strips, floor room-name decals,
 * the exterior ground (purple rock, lava cracks) and 45° staircase prisms.
 */
import * as THREE from 'three';
import { Cell, type CompiledMap } from '../core/map';
import { mix, paintVentShape, WORLD } from '../render2d/paint';
import { Diag, lavaAt, paintFace, roomLabel, vnoise, type WallKind, type WorldInfo } from '../render2d/world';

// ---------------------------------------------------------------------------
// Inverted-hull outline material.

const hullCache = new Map<string, THREE.ShaderMaterial>();

/**
 * Back-face hull pushed out along the view-space normal (scaled by the
 * normal attribute's length, 1 for ordinary meshes). Thickness grows a
 * little with distance so lines stay readable; works with InstancedMesh and
 * scene fog. Shared per (colour, thickness). `floorY` (characters) keeps the
 * pushed hull above the floor plane, so soles don't get a ragged line where
 * the floor would clip it.
 */
export function hullMaterial(color: string, thickness = 0.03, shared = true, floorY?: number): THREE.ShaderMaterial {
  const key = `${color}|${thickness}|${floorY ?? ''}`;
  const hit = shared ? hullCache.get(key) : undefined;
  if (hit) return hit;
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uThick: { value: thickness }, uAlpha: { value: 1 }, uFloor: { value: floorY ?? -1e4 } }]),
    vertexShader: /* glsl */ `
      uniform float uThick;
      uniform float uFloor;
      #include <fog_pars_vertex>
      void main() {
        vec4 pos = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          pos = instanceMatrix * pos;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 mvPosition = modelViewMatrix * pos;
        // Unit normals push by uThick; longer ones (mitred hard corners) push further.
        vec3 vn = normalize(normalMatrix * n) * length(normal);
        float k = clamp(-mvPosition.z * 0.12, 0.7, 2.2);
        mvPosition.xyz += vn * uThick * k;
        if (uFloor > -1e3) {
          // Back to world space (the view matrix is rigid), lift to the floor, and back.
          vec3 w = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
          w.y = max(w.y, uFloor);
          mvPosition = viewMatrix * vec4(w, 1.0);
        }
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, uAlpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
    transparent: false,
  });
  if (shared) hullCache.set(key, m);
  return m;
}

/** Adds an ink hull to a mesh (or instanced mesh, sharing its matrices). */
export function addHull(mesh: THREE.Mesh, mat: THREE.Material): THREE.Mesh {
  let hull: THREE.Mesh;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const src = mesh as THREE.InstancedMesh;
    const inst = new THREE.InstancedMesh(src.geometry, mat, src.count);
    inst.instanceMatrix = src.instanceMatrix;
    hull = inst;
  } else hull = new THREE.Mesh(mesh.geometry, mat);
  hull.name = 'ink-hull';
  hull.userData.hull = true;
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.position.copy(mesh.position);
  hull.quaternion.copy(mesh.quaternion);
  hull.scale.copy(mesh.scale);
  return hull;
}

// ---------------------------------------------------------------------------
// Textures.

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function tex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Face texture for one wall tile (u across the tile, v up the wall). */
export function wallTexture(kind: WallKind, wallH: number): THREE.CanvasTexture {
  const S = 128;
  const H = Math.round(S * wallH);
  const { c, g } = canvas(S, H);
  // paintFace draws top → bottom like the 2D lifted face.
  paintFace(g, kind, 3, S, '#3a4a5a', false, H);
  if (kind !== 'ext') {
    // A thin light strip under the lip (ceiling glow line) + panel seam.
    g.fillStyle = 'rgba(223,246,255,0.9)';
    g.fillRect(0, H * 0.035, S, Math.max(2, H * 0.012));
    g.fillStyle = 'rgba(20,26,40,0.35)';
    g.fillRect(S - 2, H * 0.08, 2, H * 0.84);
  }
  return tex(c);
}

/** Vent lid texture (shared painter with 2D), with an ink rim. */
export function ventTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(128, 96);
  g.fillStyle = WORLD.ink;
  g.beginPath();
  g.roundRect(0, 0, 128, 96, 16);
  g.fill();
  g.translate(64, 48);
  g.scale(0.94, (96 / 92) * 0.94);
  paintVentShape(g, 0, 0, 128, false);
  return tex(c);
}

/** Orange outline around a vent (rounded rect with an ink edge). */
export function ventGlowTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(256, 204);
  g.beginPath();
  g.roundRect(14, 14, 228, 176, 30);
  g.lineWidth = 26;
  g.strokeStyle = WORLD.ink;
  g.stroke();
  g.lineWidth = 15;
  g.strokeStyle = WORLD.vent;
  g.stroke();
  return tex(c);
}

/** Dotted ring decal (task marker on the floor). */
export function dottedRingTexture(color: string = WORLD.task): THREE.CanvasTexture {
  const { c, g } = canvas(256, 256);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = 128 + Math.cos(a) * 100;
    const y = 128 + Math.sin(a) * 100;
    g.beginPath();
    g.arc(x, y, 15, 0, Math.PI * 2);
    g.fillStyle = WORLD.ink;
    g.fill();
    g.beginPath();
    g.arc(x, y, 10, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  }
  return tex(c);
}

/** Solid ring decal (station / vent in reach). */
export function solidRingTexture(color: string): THREE.CanvasTexture {
  const { c, g } = canvas(256, 256);
  g.lineWidth = 30;
  g.strokeStyle = WORLD.ink;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 16;
  g.strokeStyle = color;
  g.stroke();
  return tex(c);
}

/** Exterior ground under the whole map: deep void, purple rock, lava cracks. */
export function groundTexture(map: CompiledMap, info: WorldInfo, night: boolean): { tex: THREE.CanvasTexture; hasLava: boolean } {
  const P = 4;
  const { c, g } = canvas(map.w * P, map.h * P);
  let hasLava = false;
  const dim = (col: string) => (night ? mix(col, '#0b1022', 0.5) : col);
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      const d = info.extDist[i]!;
      if (d > 7 && map.cells[i] === Cell.Void) {
        g.fillStyle = night ? '#04060d' : '#121a2c';
        g.fillRect(x * P, y * P, P, P);
        continue;
      }
      const nv = vnoise(x, y, 3);
      g.fillStyle = dim(nv > 0.55 ? WORLD.rock : WORLD.rockDark);
      g.fillRect(x * P, y * P, P, P);
      if (d >= 2 && d <= 7 && lavaAt(x, y)) {
        hasLava = true;
        g.fillStyle = WORLD.lava;
        g.fillRect(x * P, y * P, P, P);
        g.fillStyle = WORLD.lavaHot;
        g.fillRect(x * P + 1, y * P + 1, P - 2, P - 2);
      } else if (d <= 2 && ((x * 7 + y * 13) % 11 === 0)) {
        g.fillStyle = dim(WORLD.snow);
        g.fillRect(x * P, y * P, P, P);
      }
    }
  const t = tex(c);
  t.magFilter = THREE.LinearFilter;
  return { tex: t, hasLava };
}

/** Big faded caps of the room name, as a floor decal texture. */
export function roomNameTexture(text: string, color: string, aspect: number): THREE.CanvasTexture {
  const W = 1024;
  const H = Math.max(64, Math.min(512, Math.round(W / aspect)));
  const { c, g } = canvas(W, H);
  let fs = H * 0.8;
  // Measure with the tracking applied, then shrink to fit (a few passes).
  for (let k = 0; k < 3; k++) {
    g.font = `900 ${fs}px ui-sans-serif, system-ui, "Arial Black", sans-serif`;
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${fs * 0.08}px`;
    const tw = g.measureText(text).width * 1.04;
    if (tw <= W * 0.94 || tw <= 0) break;
    fs *= (W * 0.94) / tw;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, W / 2, H / 2);
  return tex(c);
}

// ---------------------------------------------------------------------------
// Geometry builders.

interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Wall-mass boundary segments (floor side) incl. diagonals, plus outer tops. */
export function wallBoundary(map: CompiledMap, info: WorldInfo): { floorSide: Seg[]; outer: Seg[] } {
  const { w, h } = map;
  const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && map.cells[y * w + x] !== Cell.Void;
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && info.wall[y * w + x] === 1;
  const floorSide: Seg[] = [];
  const outer: Seg[] = [];
  for (const i of map.walls) {
    const x = i % w;
    const y = (i / w) | 0;
    const d = info.diag[i]!;
    if (d === Diag.SE || d === Diag.NW) floorSide.push({ ax: x, az: y + 1, bx: x + 1, bz: y });
    else if (d === Diag.SW || d === Diag.NE) floorSide.push({ ax: x, az: y, bx: x + 1, bz: y + 1 });
    const sides: [number, number, Seg][] = [
      [0, -1, { ax: x, az: y, bx: x + 1, bz: y }],
      [0, 1, { ax: x, az: y + 1, bx: x + 1, bz: y + 1 }],
      [-1, 0, { ax: x, az: y, bx: x, bz: y + 1 }],
      [1, 0, { ax: x + 1, az: y, bx: x + 1, bz: y + 1 }],
    ];
    for (const [dx, dy, sg] of sides) {
      const nx = x + dx;
      const ny = y + dy;
      if (isWall(nx, ny)) continue;
      if (isFloor(nx, ny)) {
        if (!d) floorSide.push(sg);
      } else outer.push(sg);
    }
  }
  return { floorSide, outer };
}

/** Vertices where boundary segments turn (vertical ink edges). */
export function cornerPoints(segs: Seg[]): { x: number; z: number }[] {
  const at = new Map<string, { x: number; z: number; dirs: [number, number][] }>();
  const add = (x: number, z: number, dx: number, dz: number) => {
    const k = `${x},${z}`;
    let e = at.get(k);
    if (!e) at.set(k, (e = { x, z, dirs: [] }));
    const l = Math.hypot(dx, dz) || 1;
    e.dirs.push([dx / l, dz / l]);
  };
  for (const s of segs) {
    add(s.ax, s.az, s.bx - s.ax, s.bz - s.az);
    add(s.bx, s.bz, s.ax - s.bx, s.az - s.bz);
  }
  const out: { x: number; z: number }[] = [];
  for (const e of at.values()) {
    if (e.dirs.length === 2) {
      const [a, b] = e.dirs as [[number, number], [number, number]];
      if (Math.abs(a[0] * b[0] + a[1] * b[1] + 1) < 1e-3) continue; // straight through
    }
    out.push({ x: e.x, z: e.z });
  }
  return out;
}

/** Instanced thin boxes along segments (ink lines). */
export function inkLines(segs: Seg[], y: number, thick: number, verticals: { x: number; z: number }[], height: number, mat: THREE.Material): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const n = segs.length + verticals.length;
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let i = 0;
  for (const s of segs) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    q.setFromAxisAngle(up, -Math.atan2(s.bz - s.az, s.bx - s.ax));
    pos.set((s.ax + s.bx) / 2, y, (s.az + s.bz) / 2);
    sc.set(len + thick, thick, thick);
    m4.compose(pos, q, sc);
    mesh.setMatrixAt(i++, m4);
  }
  q.identity();
  for (const v of verticals) {
    pos.set(v.x, height / 2, v.z);
    sc.set(thick, height, thick);
    m4.compose(pos, q, sc);
    mesh.setMatrixAt(i++, m4);
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Triangular prisms for 45° staircase wall tiles, with face UVs. */
export function diagPrisms(map: CompiledMap, info: WorldInfo, wallH: number, kindOf: (i: number) => WallKind): Map<WallKind, THREE.BufferGeometry> {
  const out = new Map<WallKind, number[][]>();
  const push = (k: WallKind, arr: number[]) => {
    let a = out.get(k);
    if (!a) out.set(k, (a = [[], [], []]));
    a[0]!.push(...arr);
  };
  const uvs = new Map<WallKind, number[]>();
  const pushUv = (k: WallKind, arr: number[]) => {
    let a = uvs.get(k);
    if (!a) uvs.set(k, (a = []));
    a.push(...arr);
  };
  for (const i of map.walls) {
    const d = info.diag[i]!;
    if (!d) continue;
    const x = i % map.w;
    const z = (i / map.w) | 0;
    // Triangle corners (wall half) in tile space.
    const corners: Record<number, [number, number][]> = {
      [Diag.SE]: [[x, z], [x + 1, z], [x, z + 1]],
      [Diag.SW]: [[x, z], [x + 1, z], [x + 1, z + 1]],
      [Diag.NE]: [[x, z], [x + 1, z + 1], [x, z + 1]],
      [Diag.NW]: [[x + 1, z], [x + 1, z + 1], [x, z + 1]],
    };
    const tri = corners[d]!;
    const k = kindOf(i);
    // Top cap.
    for (const [px, pz] of tri) push(k, [px, wallH, pz]);
    pushUv(k, [0, 1, 1, 1, 0, 1]);
    // Side quads (each edge of the triangle).
    for (let e = 0; e < 3; e++) {
      const [ax, az] = tri[e]!;
      const [bx, bz] = tri[(e + 1) % 3]!;
      push(k, [ax, 0, az, bx, 0, bz, bx, wallH, bz, ax, 0, az, bx, wallH, bz, ax, wallH, az]);
      pushUv(k, [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
    }
  }
  const res = new Map<WallKind, THREE.BufferGeometry>();
  for (const [k, arr] of out) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr[0]!, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.get(k)!, 2));
    g.computeVertexNormals();
    res.set(k, g);
  }
  return res;
}

/** Corridor edge dressing: dashed light strips + yellow / pink guide lines (vertex colours). */
export function hallStrips(map: CompiledMap, info: WorldInfo): THREE.BufferGeometry | null {
  const { w, h } = map;
  const solid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || map.cells[y * w + x] === Cell.Void;
  const pos: number[] = [];
  const col: number[] = [];
  const cY = new THREE.Color(WORLD.guideYellow);
  const cP = new THREE.Color(WORLD.guidePink);
  const cL = new THREE.Color('#e8fbff');
  const cD = new THREE.Color('#1b2230');
  const quad = (x0: number, z0: number, x1: number, z1: number, y: number, c: THREE.Color) => {
    pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
  };
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      const i = ty * w + tx;
      if (map.cells[i] === Cell.Void || map.roomIdx[i]! >= 0 || info.extFloor[i]) continue;
      const edges: [boolean, (k: number, t: number, a?: number, b?: number) => [number, number, number, number]][] = [
        [solid(tx, ty - 1), (k, t, a = 0, b = 1) => [tx + a, ty + k, tx + b, ty + k + t]],
        [solid(tx, ty + 1), (k, t, a = 0, b = 1) => [tx + a, ty + 1 - k - t, tx + b, ty + 1 - k]],
        [solid(tx - 1, ty), (k, t, a = 0, b = 1) => [tx + k, ty + a, tx + k + t, ty + b]],
        [solid(tx + 1, ty), (k, t, a = 0, b = 1) => [tx + 1 - k - t, ty + a, tx + 1 - k, ty + b]],
      ];
      for (const [on, r] of edges) {
        if (!on) continue;
        quad(...r(0.24, 0.06), 0.012, cY);
        quad(...r(0.34, 0.04), 0.012, cP);
        quad(...r(0.04, 0.12), 0.01, cD);
        quad(...r(0.06, 0.08, 0.08, 0.38), 0.016, cL);
        quad(...r(0.06, 0.08, 0.58, 0.88), 0.016, cL);
      }
    }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Room-name decals laid on the floor. */
export function roomNameDecals(map: CompiledMap, night: boolean, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const grp = new THREE.Group();
  for (const room of map.def.rooms) {
    const L = roomLabel(room);
    const wW = Math.min(room.rect[2] * 0.9, L.width * 1.1);
    const hW = L.size * 1.3;
    const color = night ? 'rgba(8,10,20,0.3)' : room.outdoor ? 'rgba(40,30,60,0.13)' : 'rgba(20,25,38,0.13)';
    const t = track(roomNameTexture(L.text, color, wW / hW));
    const mat = track(new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const geo = track(new THREE.PlaneGeometry(wW, hW));
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(L.x, 0.02, L.y);
    m.renderOrder = 1;
    grp.add(m);
  }
  return grp;
}
