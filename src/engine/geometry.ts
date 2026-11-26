/**
 * Small polygon / tile-mask helpers for the hand-drawn HQ floorplan: room
 * outlines are polygons in tile units (axis-aligned or 45° edges), corridors
 * are unions of tile rects, and the renderers need their outlines.
 */

export interface Pt {
  x: number;
  y: number;
}

/** A rectangle in tile units. */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One corner treatment of a room outline. */
export type Corner = { chamfer: number } | { notch: [number, number] } | null;

/**
 * Outline polygon (clockwise on screen, y down) of a w×h box with per-corner
 * treatments: a 45° chamfer of `n` tiles, or a rectangular notch [dx, dy].
 */
export function boxOutline(
  w: number,
  h: number,
  c: { tl?: Corner; tr?: Corner; br?: Corner; bl?: Corner } = {},
): Pt[] {
  const P = (x: number, y: number): Pt => ({ x, y });
  const out: Pt[] = [];
  const tl = c.tl ?? null;
  const tr = c.tr ?? null;
  const br = c.br ?? null;
  const bl = c.bl ?? null;
  if (tl && 'chamfer' in tl) out.push(P(0, tl.chamfer), P(tl.chamfer, 0));
  else if (tl && 'notch' in tl) out.push(P(0, tl.notch[1]), P(tl.notch[0], tl.notch[1]), P(tl.notch[0], 0));
  else out.push(P(0, 0));
  if (tr && 'chamfer' in tr) out.push(P(w - tr.chamfer, 0), P(w, tr.chamfer));
  else if (tr && 'notch' in tr) out.push(P(w - tr.notch[0], 0), P(w - tr.notch[0], tr.notch[1]), P(w, tr.notch[1]));
  else out.push(P(w, 0));
  if (br && 'chamfer' in br) out.push(P(w, h - br.chamfer), P(w - br.chamfer, h));
  else if (br && 'notch' in br) out.push(P(w, h - br.notch[1]), P(w - br.notch[0], h - br.notch[1]), P(w - br.notch[0], h));
  else out.push(P(w, h));
  if (bl && 'chamfer' in bl) out.push(P(bl.chamfer, h), P(0, h - bl.chamfer));
  else if (bl && 'notch' in bl) out.push(P(bl.notch[0], h), P(bl.notch[0], h - bl.notch[1]), P(0, h - bl.notch[1]));
  else out.push(P(0, h));
  return out;
}

const EPS = 1e-6;

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > EPS) return false;
  return p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}

/** Point in polygon. Points exactly on an edge count as inside only when `inclusive`. */
export function pointInPoly(p: Pt, poly: readonly Pt[], inclusive = false): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (onSegment(p, a, b)) return inclusive;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Signed area (positive = clockwise on a y-down screen). */
export function polyArea(poly: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/**
 * Offset a simple polygon inward by `d` (negative = outward) with mitred
 * joins. Fine for the small offsets used to draw wall bands.
 */
export function offsetPoly(poly: readonly Pt[], d: number): Pt[] {
  if (d === 0) return poly.map((p) => ({ ...p }));
  const n = poly.length;
  const sign = polyArea(poly) > 0 ? 1 : -1;
  // Inward normal of edge i (from poly[i] to poly[i+1]).
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / len) * sign;
    const ny = ((b.x - a.x) / len) * sign;
    return { ax: a.x + nx * d, ay: a.y + ny * d, dx: b.x - a.x, dy: b.y - a.y };
  });
  return poly.map((_p, i) => {
    const L1 = lines[(i + n - 1) % n]!;
    const L2 = lines[i]!;
    const den = L1.dx * L2.dy - L1.dy * L2.dx;
    if (Math.abs(den) < EPS) return { x: L2.ax, y: L2.ay };
    const t = ((L2.ax - L1.ax) * L2.dy - (L2.ay - L1.ay) * L2.dx) / den;
    return { x: L1.ax + L1.dx * t, y: L1.ay + L1.dy * t };
  });
}

/**
 * Trace the outlines of a tile mask as closed loops of tile-corner vertices
 * (collinear points removed). Outer boundaries run clockwise on screen.
 */
export function traceMask(on: (x: number, y: number) => boolean, w: number, h: number): Pt[][] {
  // Directed boundary edges with the filled tile on the right-hand side (clockwise outer loops, y down).
  const next = new Map<string, Pt[]>();
  const key = (x: number, y: number) => `${x},${y}`;
  const add = (ax: number, ay: number, bx: number, by: number) => {
    const k = key(ax, ay);
    const list = next.get(k);
    if (list) list.push({ x: bx, y: by });
    else next.set(k, [{ x: bx, y: by }]);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      if (y === 0 || !on(x, y - 1)) add(x, y, x + 1, y);
      if (x === w - 1 || !on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (y === h - 1 || !on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (x === 0 || !on(x - 1, y)) add(x, y + 1, x, y);
    }
  const loops: Pt[][] = [];
  for (;;) {
    let startKey: string | null = null;
    for (const [k, v] of next) if (v.length) {
      startKey = k;
      break;
    }
    if (!startKey) break;
    const [sx, sy] = startKey.split(',').map(Number) as [number, number];
    const loop: Pt[] = [{ x: sx, y: sy }];
    let cur = { x: sx, y: sy };
    let prevDir = { x: 0, y: 0 };
    for (let guard = 0; guard < 100000; guard++) {
      const list = next.get(key(cur.x, cur.y));
      if (!list || !list.length) break;
      // At pinch points prefer turning right (keeps diagonal-touching tiles as separate loops).
      let pick = 0;
      if (list.length > 1) {
        const score = (q: Pt) => {
          const dx = q.x - cur.x;
          const dy = q.y - cur.y;
          return prevDir.x * dy - prevDir.y * dx; // >0 = right turn on a y-down screen
        };
        pick = list.reduce((best, q, i) => (score(q) > score(list[best]!) ? i : best), 0);
      }
      const nxt = list.splice(pick, 1)[0]!;
      prevDir = { x: nxt.x - cur.x, y: nxt.y - cur.y };
      cur = nxt;
      if (cur.x === sx && cur.y === sy) break;
      loop.push(cur);
    }
    loops.push(simplifyLoop(loop));
  }
  return loops;
}

function simplifyLoop(loop: Pt[]): Pt[] {
  const n = loop.length;
  return loop.filter((p, i) => {
    const a = loop[(i + n - 1) % n]!;
    const b = loop[(i + 1) % n]!;
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) !== 0;
  });
}

/** Trace a polygon path with rounded corners (radius clamped per corner). */
export function tracePolyPath(ctx: CanvasRenderingContext2D | Path2D, pts: readonly Pt[], radius = 0, begin = true): void {
  const n = pts.length;
  if (n < 3) return;
  if (begin && 'beginPath' in ctx) ctx.beginPath();
  if (radius <= 0) {
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
    ctx.closePath();
    return;
  }
  const first = pts[0]!;
  const last = pts[n - 1]!;
  ctx.moveTo((first.x + last.x) / 2, (first.y + last.y) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    const o = pts[(i + n - 1) % n]!;
    const r = Math.min(radius, Math.hypot(q.x - p.x, q.y - p.y) / 2, Math.hypot(o.x - p.x, o.y - p.y) / 2);
    ctx.arcTo(p.x, p.y, q.x, q.y, r);
  }
  ctx.closePath();
}
