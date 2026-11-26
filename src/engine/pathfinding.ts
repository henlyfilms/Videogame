/**
 * Grid A* (8-directional, no corner cutting, octile heuristic) with a binary
 * heap open set, an LRU path cache, and optional crowding costs.
 */
import { isWalkable, type Grid, type Point } from './world';

const SQRT2 = Math.SQRT2;

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, priority: number): void {
    this.items.push(item);
    this.prio.push(priority);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastI = this.items.pop()!;
    const lastP = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastI;
      this.prio[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.items.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

export interface FindPathOptions {
  /** Extra cost for stepping onto a tile (e.g. crowding). Disables caching. */
  extraCost?: (x: number, y: number) => number;
  /** Hard cap on expanded nodes. */
  maxExpansions?: number;
}

/** Returns the tile path from start to goal inclusive, or null when unreachable. */
export function findPath(grid: Grid, start: Point, goal: Point, opts: FindPathOptions = {}): Point[] | null {
  if (!isWalkable(grid, goal.x, goal.y) || !isWalkable(grid, start.x, start.y)) return null;
  if (start.x === goal.x && start.y === goal.y) return [{ ...start }];
  const W = grid.w;
  const N = grid.w * grid.h;
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = new MinHeap();
  const s = start.y * W + start.x;
  const goalI = goal.y * W + goal.x;
  g[s] = 0;
  open.push(s, octile(start.x, start.y, goal.x, goal.y));
  const max = opts.maxExpansions ?? N;
  let expansions = 0;
  while (open.size > 0) {
    const cur = open.pop()!;
    if (cur === goalI) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expansions > max) return null;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isWalkable(grid, nx, ny)) continue;
        const diag = dx !== 0 && dy !== 0;
        // No corner cutting.
        if (diag && (!isWalkable(grid, cx + dx, cy) || !isWalkable(grid, cx, cy + dy))) continue;
        const ni = ny * W + nx;
        if (closed[ni]) continue;
        const step = (diag ? SQRT2 : 1) + (opts.extraCost ? opts.extraCost(nx, ny) : 0);
        const ng = g[cur]! + step;
        if (ng < g[ni]!) {
          g[ni] = ng;
          came[ni] = cur;
          open.push(ni, ng + octile(nx, ny, goal.x, goal.y));
        }
      }
    }
  }
  if (came[goalI] === -1) return null;
  const path: Point[] = [];
  for (let i = goalI; i !== -1; i = came[i]!) {
    const x = i % W;
    path.push({ x, y: (i - x) / W });
    if (i === s) break;
  }
  path.reverse();
  return path;
}

/** Remove collinear intermediate points so walkers move in long straight segments. */
export function simplifyPath(path: Point[]): Point[] {
  if (path.length <= 2) return path.slice();
  const out: Point[] = [path[0]!];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = path[i]!;
    const c = path[i + 1]!;
    const d1x = Math.sign(b.x - a.x);
    const d1y = Math.sign(b.y - a.y);
    const d2x = Math.sign(c.x - b.x);
    const d2y = Math.sign(c.y - b.y);
    if (d1x !== d2x || d1y !== d2y) out.push(b);
  }
  out.push(path[path.length - 1]!);
  return out;
}

/**
 * Pathfinder with an LRU cache keyed by start→goal. Paths returned are copies so
 * callers may mutate them.
 */
export class Pathfinder {
  private cache = new Map<string, Point[] | null>();
  hits = 0;
  misses = 0;
  constructor(
    private grid: Grid,
    private capacity = 512,
  ) {}

  find(start: Point, goal: Point, opts: FindPathOptions = {}): Point[] | null {
    if (opts.extraCost) return findPath(this.grid, start, goal, opts);
    const key = `${start.x},${start.y}>${goal.x},${goal.y}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.hits++;
      // Refresh LRU order.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached ? cached.map((q) => ({ ...q })) : null;
    }
    this.misses++;
    const path = findPath(this.grid, start, goal, opts);
    this.cache.set(key, path);
    if (this.cache.size > this.capacity) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return path ? path.map((q) => ({ ...q })) : null;
  }

  invalidate(): void {
    this.cache.clear();
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  /**
   * Nearest walkable tile to `target` that isn't in `taken` (BFS by ring).
   * Used for crowding avoidance: bots never stand on the same tile.
   */
  nearestFree(target: Point, taken: (x: number, y: number) => boolean, maxRadius = 6): Point | null {
    if (isWalkable(this.grid, target.x, target.y) && !taken(target.x, target.y)) return { ...target };
    for (let r = 1; r <= maxRadius; r++) {
      let best: Point | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = target.x + dx;
          const y = target.y + dy;
          if (!isWalkable(this.grid, x, y) || taken(x, y)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }
}
