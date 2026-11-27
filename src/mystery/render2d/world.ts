/**
 * Map analysis + baked painters for the cel-shaded world look: wall
 * classification (incl. stepped 45° corners drawn as clean diagonals),
 * exterior zones (purple rock, snow, lava cracks), riveted teal walls with
 * beige wallpaper and a dusty pink stripe, corridor guide stripes and light
 * strips, room names painted on the floor. Everything is drawn in tile units
 * × `s` and stroked with thick ink lines.
 */
import { Cell, type CompiledMap, type FloorStyle, type RoomDef } from '../core/map';
import { hash2, mix, paintWorldFloor, rgba, WORLD, worldFloorBase } from './paint';

/** Screen height of a wall face in the top-down (2.5D) view, in tiles. */
export const WALL_H = 0.72;

/** Diagonal (stepped 45° corner) codes: which half of the tile is floor. */
export const enum Diag {
  None = 0,
  SE = 1,
  SW = 2,
  NE = 3,
  NW = 4,
}

export interface WorldInfo {
  /** 1 for wall tiles (void touching floor). */
  wall: Uint8Array;
  /** Diagonal code for wall tiles that are part of a 45° staircase. */
  diag: Uint8Array;
  /** Room index the wall belongs to (-1 hall / none). */
  wallRoom: Int16Array;
  /** 1 when a wall borders an exterior zone (rock instead of panels). */
  wallExt: Uint8Array;
  /** Exterior floor tiles = 1. */
  extFloor: Uint8Array;
  /** Void tiles: distance (tiles) to the nearest exterior floor, 255 = far. */
  extDist: Uint8Array;
}

const cache = new WeakMap<CompiledMap, WorldInfo>();

export function roomIsExterior(room: RoomDef | undefined): boolean {
  return !!room?.outdoor;
}

function hallStyleAt(map: CompiledMap, x: number, y: number): FloorStyle {
  for (const h of map.def.halls) {
    const [hx, hy, hw, hh] = h.rect;
    if (x >= hx && y >= hy && x < hx + hw && y < hy + hh) return h.floor ?? 'tile';
  }
  return 'tile';
}

/** Floor style + accent at a floor tile. */
export function floorAt(map: CompiledMap, x: number, y: number): { style: FloorStyle; accent: string; room: number } {
  const ri = map.roomIdx[y * map.w + x]!;
  if (ri >= 0) {
    const r = map.def.rooms[ri]!;
    return { style: r.floor, accent: r.color, room: ri };
  }
  return { style: hallStyleAt(map, x, y), accent: map.def.theme.hall, room: -1 };
}

export function worldInfo(map: CompiledMap): WorldInfo {
  const hit = cache.get(map);
  if (hit) return hit;
  const { w, h, cells } = map;
  const n = w * h;
  const wall = new Uint8Array(n);
  for (const i of map.walls) wall[i] = 1;
  const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && cells[y * w + x] !== Cell.Void;
  const extFloor = new Uint8Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (cells[i] === Cell.Void) continue;
      const ri = map.roomIdx[i]!;
      if (ri >= 0) extFloor[i] = roomIsExterior(map.def.rooms[ri]) ? 1 : 0;
      else {
        const st = hallStyleAt(map, x, y);
        extFloor[i] = st === 'snow' || st === 'grass' ? 1 : 0;
      }
    }
  // Candidate diagonals: exactly two perpendicular orthogonal floor neighbours
  // (plus the diagonal between them), nothing on the opposite side.
  const cand = new Uint8Array(n);
  for (const i of map.walls) {
    const x = i % w;
    const y = (i / w) | 0;
    const N = floor(x, y - 1);
    const S = floor(x, y + 1);
    const E = floor(x + 1, y);
    const W = floor(x - 1, y);
    if (S && E && !N && !W && floor(x + 1, y + 1) && !floor(x - 1, y - 1)) cand[i] = Diag.SE;
    else if (S && W && !N && !E && floor(x - 1, y + 1) && !floor(x + 1, y - 1)) cand[i] = Diag.SW;
    else if (N && E && !S && !W && floor(x + 1, y - 1) && !floor(x - 1, y + 1)) cand[i] = Diag.NE;
    else if (N && W && !S && !E && floor(x - 1, y - 1) && !floor(x + 1, y + 1)) cand[i] = Diag.NW;
  }
  // Keep only staircases: a neighbour along the 45° line has the same code.
  const diag = new Uint8Array(n);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? cand[y * w + x]! : 0);
  for (const i of map.walls) {
    const c = cand[i]!;
    if (!c) continue;
    const x = i % w;
    const y = (i / w) | 0;
    const along = c === Diag.SE || c === Diag.NW ? [[1, -1], [-1, 1]] : [[1, 1], [-1, -1]];
    if (along.some(([dx, dy]) => at(x + dx!, y + dy!) === c)) diag[i] = c;
  }
  // Which room each wall belongs to, and whether it borders the exterior.
  const wallRoom = new Int16Array(n).fill(-1);
  const wallExt = new Uint8Array(n);
  for (const i of map.walls) {
    const x = i % w;
    const y = (i / w) | 0;
    let room = -1;
    let ext = 0;
    let intr = 0;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!floor(nx, ny)) continue;
      const j = ny * w + nx;
      if (extFloor[j]) ext++;
      else intr++;
      const ri = map.roomIdx[j]!;
      if (room < 0 && ri >= 0) room = ri;
    }
    wallRoom[i] = room;
    wallExt[i] = ext > 0 && intr === 0 ? 1 : 0;
  }
  // Exterior distance field over void (BFS, capped).
  const extDist = new Uint8Array(n).fill(255);
  const q: number[] = [];
  for (let i = 0; i < n; i++)
    if (extFloor[i]) {
      extDist[i] = 0;
      q.push(i);
    }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]!;
    const d = extDist[i]!;
    if (d >= 7) continue;
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (cells[j] !== Cell.Void || extDist[j]! <= d + 1) continue;
      extDist[j] = d + 1;
      q.push(j);
    }
  }
  const info: WorldInfo = { wall, diag, wallRoom, wallExt, extFloor, extDist };
  cache.set(map, info);
  return info;
}

/** Smooth value noise in [0,1] (lava cracks, rock shading). */
export function vnoise(x: number, y: number, cell = 4): number {
  const gx = x / cell;
  const gy = y / cell;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** True where a lava crack runs through exterior void. */
export function lavaAt(x: number, y: number): boolean {
  return Math.abs(vnoise(x + 0.5, y + 0.5, 6) - 0.5) < 0.045;
}

const dimmer = (night: boolean) => (c: string, k = 0.55) => (night ? mix(c, '#0b1022', k) : c);

/** Void: deep space far from the base, purple rock (with lava) near exteriors. */
export function paintVoidTile(g: CanvasRenderingContext2D, info: WorldInfo, map: CompiledMap, tx: number, ty: number, s: number, night: boolean): void {
  const i = ty * map.w + tx;
  const d = info.extDist[i]!;
  const x = tx * s;
  const y = ty * s;
  const dim = dimmer(night);
  if (d <= 7) {
    const nv = vnoise(tx, ty, 3);
    g.fillStyle = dim(nv > 0.55 ? WORLD.rock : WORLD.rockDark, 0.5);
    g.fillRect(x, y, s + 0.5, s + 0.5);
    const r = hash2(tx * 3, ty * 5);
    if (r > 0.6) {
      g.fillStyle = dim(nv > 0.55 ? WORLD.rockHi : WORLD.rock, 0.5);
      g.beginPath();
      g.moveTo(x + s * 0.2, y + s * 0.8);
      g.lineTo(x + s * (0.35 + r * 0.2), y + s * 0.25);
      g.lineTo(x + s * 0.85, y + s * 0.7);
      g.closePath();
      g.fill();
    }
    if (d >= 2 && lavaAt(tx, ty)) {
      g.fillStyle = WORLD.lava;
      g.fillRect(x, y, s + 0.5, s + 0.5);
      g.fillStyle = WORLD.lavaHot;
      g.beginPath();
      g.ellipse(x + s * 0.5, y + s * 0.5, s * 0.3, s * 0.18, hash2(tx, ty) * 3, 0, Math.PI * 2);
      g.fill();
    } else if (d <= 2 && r < 0.18) {
      g.fillStyle = dim(WORLD.snow, 0.4);
      g.beginPath();
      g.ellipse(x + s * 0.5, y + s * 0.5, s * 0.35, s * 0.18, 0, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  g.fillStyle = night ? '#05070f' : WORLD.void;
  g.fillRect(x, y, s + 0.5, s + 0.5);
  const r = hash2(tx * 7 + 1, ty * 13 + 2);
  if (r > 0.82) {
    g.fillStyle = `rgba(220,230,255,${0.2 + hash2(tx, ty) * 0.4})`;
    const k = r > 0.97 ? 0.07 : 0.04;
    g.fillRect(x + hash2(tx, ty * 3) * s, y + hash2(tx * 5, ty) * s, s * k, s * k);
  }
}

/** Lava glow pass (drawn additively after the void). */
export function paintLavaGlow(g: CanvasRenderingContext2D, info: WorldInfo, map: CompiledMap, x0: number, y0: number, x1: number, y1: number, s: number): void {
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let ty = Math.max(0, y0); ty < Math.min(map.h, y1); ty++)
    for (let tx = Math.max(0, x0); tx < Math.min(map.w, x1); tx++) {
      const i = ty * map.w + tx;
      if (map.cells[i] !== Cell.Void || info.wall[i] || info.extDist[i]! < 2 || info.extDist[i]! > 7 || !lavaAt(tx, ty)) continue;
      const gr = g.createRadialGradient((tx + 0.5) * s, (ty + 0.5) * s, 0, (tx + 0.5) * s, (ty + 0.5) * s, s * 1.6);
      gr.addColorStop(0, 'rgba(255,120,30,0.28)');
      gr.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = gr;
      g.fillRect((tx - 1.2) * s, (ty - 1.2) * s, s * 3.4, s * 3.4);
    }
  g.restore();
}

/** Floor triangle under a diagonal wall tile (so steps read as a 45° edge). */
export function paintDiagFloor(g: CanvasRenderingContext2D, map: CompiledMap, code: number, tx: number, ty: number, s: number, night: boolean): void {
  const ny = code === Diag.SE || code === Diag.SW ? ty + 1 : ty - 1;
  const f = floorAt(map, tx, ny);
  const x = tx * s;
  const y = ty * s;
  g.save();
  g.beginPath();
  if (code === Diag.SE) (g.moveTo(x + s, y), g.lineTo(x + s, y + s), g.lineTo(x, y + s));
  else if (code === Diag.SW) (g.moveTo(x, y), g.lineTo(x + s, y + s), g.lineTo(x, y + s));
  else if (code === Diag.NE) (g.moveTo(x, y), g.lineTo(x + s, y), g.lineTo(x + s, y + s));
  else (g.moveTo(x, y), g.lineTo(x + s, y), g.lineTo(x, y + s));
  g.closePath();
  g.clip();
  paintWorldFloor(g, f.style, tx, ty, s, worldFloorBase(f.style, f.accent, night));
  g.restore();
}

export type WallKind = 'room' | 'hall' | 'ext';

/** One wall face, drawn in a local frame: x ∈ [0, s], y ∈ [0, H]. Also bakes the 3D wall textures. */
export function paintFace(g: CanvasRenderingContext2D, kind: WallKind, tx: number, s: number, accent: string, night: boolean, H = WALL_H * s): void {
  const dim = dimmer(night);
  const band = (a: number, b: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(0, a * H, s + 0.6, (b - a) * H + 0.5);
  };
  if (kind === 'ext') {
    band(0, 1, dim(WORLD.rock));
    band(0, 0.16, dim(WORLD.snow, 0.45));
    g.fillStyle = dim(WORLD.rockDark);
    for (let k = 0; k < 3; k++) {
      const yy = (0.38 + k * 0.2 + hash2(tx, k) * 0.06) * H;
      g.fillRect(0, yy, s + 0.6, Math.max(1, s * 0.035));
    }
    // Icicles hanging off the snow lip.
    g.fillStyle = dim('#e6ecff', 0.45);
    for (let k = 0; k < 2; k++) {
      const ix = (0.2 + k * 0.5 + hash2(tx * 3, k) * 0.2) * s;
      const len = (0.18 + hash2(tx, k * 7) * 0.2) * H;
      g.beginPath();
      g.moveTo(ix - s * 0.05, 0.15 * H);
      g.lineTo(ix + s * 0.05, 0.15 * H);
      g.lineTo(ix, 0.15 * H + len);
      g.fill();
    }
    return;
  }
  band(0, 0.08, dim('#22303c'));
  if (kind === 'room') {
    band(0.08, 0.52, dim(WORLD.paper));
    g.fillStyle = dim(WORLD.paperStripe);
    for (let k = 0; k < 4; k++) g.fillRect((k + 0.25) * (s / 4), 0.08 * H, s * 0.07, 0.44 * H);
    band(0.52, 0.6, dim(WORLD.pink));
    band(0.6, 0.9, dim(WORLD.panel));
    g.fillStyle = dim(WORLD.rivet);
    for (const fx of [0.22, 0.78]) {
      g.beginPath();
      g.arc(fx * s, 0.75 * H, Math.max(0.8, s * 0.028), 0, Math.PI * 2);
      g.fill();
    }
    band(0.9, 1, dim(mix(accent, '#1e2a36', 0.45)));
  } else {
    band(0.08, 0.92, dim(WORLD.panel));
    band(0.08, 0.14, dim(WORLD.panelHi));
    band(0.3, 0.4, dim(WORLD.guideYellow, 0.6));
    band(0.56, 0.61, dim(WORLD.guidePink, 0.6));
    g.fillStyle = dim(WORLD.rivet);
    for (const fy of [0.22, 0.75]) {
      g.beginPath();
      g.arc(0.1 * s, fy * H, Math.max(0.8, s * 0.025), 0, Math.PI * 2);
      g.arc(0.9 * s, fy * H, Math.max(0.8, s * 0.025), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = dim(WORLD.panelDark);
    g.fillRect(s - Math.max(1, s * 0.03), 0.08 * H, Math.max(1, s * 0.03), 0.84 * H);
    band(0.92, 1, dim('#1e2a36'));
  }
}

/**
 * Walls for tiles in [x0,x1)×[y0,y1): faces, caps and one ink pass that
 * outlines the wall mass (outer edges, cap/face creases, floor contact).
 */
export function paintWalls(g: CanvasRenderingContext2D, info: WorldInfo, map: CompiledMap, x0: number, y0: number, x1: number, y1: number, s: number, night: boolean): void {
  const { w, h } = map;
  const H = WALL_H;
  const dim = dimmer(night);
  const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && map.cells[y * w + x] !== Cell.Void;
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && info.wall[y * w + x] === 1;
  const straightFace = (x: number, y: number) => isWall(x, y) && !info.diag[y * w + x] && isFloor(x, y + 1);
  const kindOf = (i: number): 'room' | 'hall' | 'ext' => (info.wallExt[i] ? 'ext' : info.wallRoom[i]! >= 0 ? 'room' : 'hall');
  const accentOf = (i: number) => (info.wallRoom[i]! >= 0 ? map.def.rooms[info.wallRoom[i]!]!.color : map.def.theme.trim);
  const ink: number[] = [];
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    ink.push(ax * s, ay * s, bx * s, by * s);
  };
  const tiles: number[] = [];
  for (let ty = Math.max(0, y0); ty < Math.min(h, y1); ty++)
    for (let tx = Math.max(0, x0); tx < Math.min(w, x1); tx++) if (info.wall[ty * w + tx]) tiles.push(ty * w + tx);
  // Faces first (they sit in the lower part of the tile).
  for (const i of tiles) {
    const tx = i % w;
    const ty = (i / w) | 0;
    const d = info.diag[i]!;
    if (d === Diag.SE || d === Diag.SW) {
      g.save();
      if (d === Diag.SE) {
        g.translate(tx * s, (ty + 1 - H) * s);
        g.transform(1, -1, 0, 1, 0, 0);
      } else {
        g.translate(tx * s, (ty - H) * s);
        g.transform(1, 1, 0, 1, 0, 0);
      }
      g.beginPath();
      g.rect(0, 0, s, H * s);
      g.clip();
      paintFace(g, kindOf(i), tx, s, accentOf(i), night);
      g.restore();
      if (d === Diag.SE) {
        seg(tx, ty + 1, tx + 1, ty);
        seg(tx, ty + 1 - H, tx, ty + 1);
      } else {
        seg(tx, ty, tx + 1, ty + 1);
        seg(tx + 1, ty + 1 - H, tx + 1, ty + 1);
      }
      continue;
    }
    if (d || !isFloor(tx, ty + 1)) continue;
    g.save();
    g.translate(tx * s, (ty + 1 - H) * s);
    paintFace(g, kindOf(i), tx, s, accentOf(i), night);
    g.restore();
    seg(tx, ty + 1, tx + 1, ty + 1);
    if (!straightFace(tx - 1, ty)) seg(tx, ty + 1 - H, tx, ty + 1);
    if (!straightFace(tx + 1, ty)) seg(tx + 1, ty + 1 - H, tx + 1, ty + 1);
  }
  // Caps (lifted by H).
  for (const i of tiles) {
    const tx = i % w;
    const ty = (i / w) | 0;
    const d = info.diag[i]!;
    const ext = info.wallExt[i] === 1;
    const top = ext ? dim(WORLD.rockDark) : dim(WORLD.capTop);
    const hi = ext ? dim(WORLD.snow, 0.45) : dim(WORLD.capHi);
    const X = tx;
    const Y = ty - H;
    g.fillStyle = top;
    g.beginPath();
    if (d === Diag.SE) (g.moveTo(X * s, Y * s), g.lineTo((X + 1) * s, Y * s), g.lineTo(X * s, (Y + 1) * s));
    else if (d === Diag.SW) (g.moveTo(X * s, Y * s), g.lineTo((X + 1) * s, Y * s), g.lineTo((X + 1) * s, (Y + 1) * s));
    else if (d === Diag.NE) (g.moveTo(X * s, Y * s), g.lineTo(X * s, (Y + 1) * s), g.lineTo((X + 1) * s, (Y + 1) * s));
    else if (d === Diag.NW) (g.moveTo((X + 1) * s, Y * s), g.lineTo((X + 1) * s, (Y + 1) * s), g.lineTo(X * s, (Y + 1) * s));
    else g.rect(X * s, Y * s, s + 0.6, s + 0.6);
    g.closePath();
    g.fill();
    // Lit rim along edges that face the floor (thin highlight / snow lip).
    g.fillStyle = hi;
    const rim = Math.max(1, s * (ext ? 0.16 : 0.07));
    if (!d) {
      if (isFloor(tx, ty + 1)) g.fillRect(X * s, (Y + 1) * s - rim, s + 0.6, rim);
      if (isFloor(tx, ty - 1)) g.fillRect(X * s, Y * s, s + 0.6, rim);
      if (isFloor(tx + 1, ty)) g.fillRect((X + 1) * s - rim, Y * s, rim, s + 0.6);
      if (isFloor(tx - 1, ty)) g.fillRect(X * s, Y * s, rim, s + 0.6);
    }
    // Ink: cap edges where the neighbour isn't wall.
    if (d) {
      if (d === Diag.SE) seg(X, Y + 1, X + 1, Y);
      if (d === Diag.SW) seg(X, Y, X + 1, Y + 1);
      if (d === Diag.NE) seg(X, Y, X + 1, Y + 1);
      if (d === Diag.NW) seg(X + 1, Y, X, Y + 1);
      const north = d === Diag.SE || d === Diag.SW;
      const west = d === Diag.SE || d === Diag.NE;
      if (north && !isWall(tx, ty - 1)) seg(X, Y, X + 1, Y);
      if (!north && !isWall(tx, ty + 1)) seg(X, Y + 1, X + 1, Y + 1);
      if (west && !isWall(tx - 1, ty)) seg(X, Y, X, Y + 1);
      if (!west && !isWall(tx + 1, ty)) seg(X + 1, Y, X + 1, Y + 1);
      continue;
    }
    if (!isWall(tx, ty - 1)) seg(X, Y, X + 1, Y);
    if (!isWall(tx, ty + 1)) seg(X, Y + 1, X + 1, Y + 1);
    if (!isWall(tx - 1, ty)) seg(X, Y, X, Y + 1);
    if (!isWall(tx + 1, ty)) seg(X + 1, Y, X + 1, Y + 1);
  }
  g.save();
  g.strokeStyle = night ? '#05070d' : WORLD.ink;
  g.lineWidth = Math.max(1.5, s * 0.075);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  for (let k = 0; k < ink.length; k += 4) {
    g.moveTo(ink[k]!, ink[k + 1]!);
    g.lineTo(ink[k + 2]!, ink[k + 3]!);
  }
  g.stroke();
  g.restore();
}

/** Corridor floors: dashed light strips + yellow/pink guide stripes along the edges (ref 33). */
export function paintHallEdges(g: CanvasRenderingContext2D, info: WorldInfo, map: CompiledMap, x0: number, y0: number, x1: number, y1: number, s: number, night: boolean): void {
  const { w, h } = map;
  const solid = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || map.cells[y * w + x] === Cell.Void;
  const yel = night ? rgba(WORLD.guideYellow, 0.5) : rgba(WORLD.guideYellow, 0.85);
  const pnk = night ? rgba(WORLD.guidePink, 0.45) : rgba(WORLD.guidePink, 0.8);
  const lit = night ? 'rgba(190,240,255,0.9)' : 'rgba(235,250,255,0.95)';
  const t = Math.max(1, s * 0.055);
  for (let ty = Math.max(0, y0); ty < Math.min(h, y1); ty++)
    for (let tx = Math.max(0, x0); tx < Math.min(w, x1); tx++) {
      const i = ty * w + tx;
      if (map.cells[i] === Cell.Void || map.roomIdx[i]! >= 0 || info.extFloor[i]) continue;
      const x = tx * s;
      const y = ty * s;
      // [dx, dy, inset origin]: lines run along the edge, offset inward.
      const edges: [boolean, (inset: number, th: number) => [number, number, number, number]][] = [
        [solid(tx, ty - 1), (k, th) => [x, y + k * s, s, th]],
        [solid(tx, ty + 1), (k, th) => [x, y + (1 - WALL_H - k) * s - th, s, th]],
        [solid(tx - 1, ty), (k, th) => [x + k * s, y, th, s]],
        [solid(tx + 1, ty), (k, th) => [x + (1 - k) * s - th, y, th, s]],
      ];
      for (const [on, rect] of edges) {
        if (!on) continue;
        g.fillStyle = yel;
        g.fillRect(...rect(0.24, t));
        g.fillStyle = pnk;
        g.fillRect(...rect(0.34, t * 0.7));
        // Dashed light strip right at the wall base.
        const [rx, ry, rw, rh] = rect(0.07, t * 1.3);
        g.fillStyle = 'rgba(20,26,40,0.45)';
        g.fillRect(rx - (rw > rh ? 0 : t * 0.3), ry - (rw > rh ? t * 0.3 : 0), rw + (rw > rh ? 0 : t * 0.6), rh + (rw > rh ? t * 0.6 : 0));
        g.fillStyle = lit;
        const horiz = rw > rh;
        for (let k = 0; k < 2; k++) {
          const a = (k * 0.5 + 0.08) * s;
          const len = s * 0.3;
          if (horiz) g.fillRect(rx + a, ry, len, rh);
          else g.fillRect(rx, ry + a, rw, len);
        }
      }
    }
}

/** Soft contact shadow on floors along walls. */
export function paintWallShadows(g: CanvasRenderingContext2D, map: CompiledMap, x0: number, y0: number, x1: number, y1: number, s: number): void {
  const { w, h } = map;
  for (let ty = Math.max(0, y0); ty < Math.min(h, y1); ty++)
    for (let tx = Math.max(0, x0); tx < Math.min(w, x1); tx++) {
      const i = ty * w + tx;
      if (map.cells[i] === Cell.Void) continue;
      if (ty > 0 && map.cells[i - w] === Cell.Void) {
        const gr = g.createLinearGradient(0, ty * s, 0, ty * s + s * 0.55);
        gr.addColorStop(0, 'rgba(12,14,30,0.32)');
        gr.addColorStop(1, 'rgba(12,14,30,0)');
        g.fillStyle = gr;
        g.fillRect(tx * s, ty * s, s, s * 0.55);
      }
      if (tx > 0 && map.cells[i - 1] === Cell.Void) {
        g.fillStyle = 'rgba(12,14,30,0.14)';
        g.fillRect(tx * s, ty * s, s * 0.22, s);
      }
      if (tx + 1 < w && map.cells[i + 1] === Cell.Void) {
        g.fillStyle = 'rgba(12,14,30,0.1)';
        g.fillRect(tx * s + s * 0.84, ty * s, s * 0.16, s);
      }
    }
}

/** Layout of a room's floor legend (big faded caps). */
export function roomLabel(room: RoomDef): { text: string; x: number; y: number; size: number; width: number } {
  const [rx, ry, rw, rh] = room.rect;
  const text = room.name.toUpperCase();
  // Rough width estimate: 0.68 em per glyph (heavy caps + tracking).
  const em = Math.min(rh * 0.3, 2.2, (rw * 0.84) / Math.max(1, text.length * 0.68));
  return { text, x: rx + rw / 2, y: ry + rh / 2, size: Math.max(0.5, em), width: text.length * 0.68 * em };
}

export function paintRoomNames(g: CanvasRenderingContext2D, map: CompiledMap, x0: number, y0: number, x1: number, y1: number, s: number, night: boolean): void {
  for (const room of map.def.rooms) {
    const L = roomLabel(room);
    // Cull on the room width (the tracked text can run wider than the estimate), so
    // every chunk the name crosses paints its part and the name never looks cut.
    const half = Math.max(L.width, room.rect[2]) / 2 + 1;
    if (L.x + half < x0 || L.x - half > x1 || L.y + L.size < y0 || L.y - L.size > y1) continue;
    g.save();
    // Measure the real (tracked) width and shrink to fit the room.
    let fs = L.size * s;
    const fit = room.rect[2] * s * 0.88;
    for (let k = 0; k < 3; k++) {
      g.font = `900 ${fs}px ui-sans-serif, system-ui, "Arial Black", sans-serif`;
      (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${fs * 0.08}px`;
      const tw = g.measureText(L.text).width;
      if (tw <= fit || tw <= 0) break;
      fs *= fit / tw;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const ext = roomIsExterior(room);
    g.fillStyle = night ? rgba(mix(room.color, '#ffffff', 0.3), 0.12) : ext ? 'rgba(40,30,60,0.13)' : rgba(mix(room.color, WORLD.ink, 0.7), 0.15);
    g.fillText(L.text, L.x * s, L.y * s);
    g.restore();
  }
}

/** Door thresholds: hazard-striped jamb plates on the floor. */
export function paintDoorSills(g: CanvasRenderingContext2D, map: CompiledMap, x0: number, y0: number, x1: number, y1: number, s: number, night: boolean): void {
  for (const d of map.def.doors) {
    const [x, y, w, h] = d.rect;
    if (x + w < x0 || x > x1 || y + h < y0 || y > y1) continue;
    const vertical = h >= w; // passage runs north–south
    g.save();
    g.fillStyle = 'rgba(20,26,40,0.12)';
    g.fillRect(x * s, y * s, w * s, h * s);
    const t = 0.16;
    const strips: [number, number, number, number][] = vertical
      ? [
          [x, y, t, h],
          [x + w - t, y, t, h],
        ]
      : [
          [x, y, w, t],
          [x, y + h - t, w, t],
        ];
    for (const [sx, sy, sw, sh] of strips) {
      g.save();
      g.beginPath();
      g.rect(sx * s, sy * s, sw * s, sh * s);
      g.clip();
      g.fillStyle = night ? '#6e5a1c' : WORLD.guideYellow;
      g.fillRect(sx * s, sy * s, sw * s, sh * s);
      g.fillStyle = night ? '#0b0d14' : WORLD.ink;
      const len = Math.max(sw, sh);
      for (let k = -1; k < len / 0.3 + 1; k++) {
        const o = k * 0.3;
        g.beginPath();
        if (vertical) {
          g.moveTo(sx * s, (sy + o) * s);
          g.lineTo((sx + sw) * s, (sy + o - sw) * s);
          g.lineTo((sx + sw) * s, (sy + o - sw + 0.14) * s);
          g.lineTo(sx * s, (sy + o + 0.14) * s);
        } else {
          g.moveTo((sx + o) * s, sy * s);
          g.lineTo((sx + o + sh) * s, (sy + sh) * s);
          g.lineTo((sx + o + sh + 0.14) * s, (sy + sh) * s);
          g.lineTo((sx + o + 0.14) * s, sy * s);
        }
        g.fill();
      }
      g.restore();
    }
    g.restore();
  }
}
