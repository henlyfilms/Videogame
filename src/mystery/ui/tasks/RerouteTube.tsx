import { useMemo, useState } from 'react';
import { Burst, C, Caption, FocusRing, GameShell, Stage, gridMove, useFinish, useIds, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

// Openings bitmask: N=1, E=2, S=4, W=8. Rotating clockwise shifts N->E->S->W.
export const N = 1;
export const E = 2;
export const S = 4;
export const Wd = 8;
export type TileType = 'straight' | 'elbow';
const BASE: Record<TileType, number> = { straight: N | S, elbow: N | E };

export function rotMask(m: number, r: number): number {
  let v = m;
  for (let i = 0; i < ((r % 4) + 4) % 4; i++) v = ((v << 1) | (v >> 3)) & 15;
  return v;
}
export const tileMask = (t: { type: TileType; rot: number }): number => rotMask(BASE[t.type], t.rot);

export interface TubeGame {
  cols: number;
  rows: number;
  inRow: number;
  outRow: number;
  tiles: { type: TileType; rot: number }[];
  /** Cells on the generated route with the mask they need. */
  need: { cell: number; mask: number }[];
}

const COLS = 6;
const ROWS = 4;

export function genRerouteTube(seed: number): TubeGame {
  const r = makeRng(seed, 505);
  for (let attempt = 0; attempt < 50; attempt++) {
    const inRow = r.int(ROWS);
    const outRow = r.int(ROWS);
    // randomised DFS from (0,inRow) to exit east from (COLS-1,outRow)
    const path: number[] = [];
    const seen = new Set<number>();
    let budget = 3000;
    const dfs = (c: number, rw: number): boolean => {
      if (--budget < 0) return false;
      const id = rw * COLS + c;
      seen.add(id);
      path.push(id);
      if (c === COLS - 1 && rw === outRow && path.length >= 7) return true;
      const dirs = r.shuffle([
        [1, 0],
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]);
      for (const [dc, dr] of dirs) {
        const nc = c + (dc as number);
        const nr = rw + (dr as number);
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || seen.has(nr * COLS + nc)) continue;
        if (dfs(nc, nr)) return true;
      }
      path.pop();
      return false;
    };
    if (!dfs(0, inRow) || path.length > 14) continue;
    const dirTo = (a: number, b: number) => (b === a - COLS ? N : b === a + 1 ? E : b === a + COLS ? S : Wd);
    const need = path.map((cell, i) => {
      const prev = i === 0 ? -1 : (path[i - 1] as number);
      const next = i === path.length - 1 ? -2 : (path[i + 1] as number);
      const a = prev === -1 ? Wd : dirTo(cell, prev);
      const b = next === -2 ? E : dirTo(cell, next);
      return { cell, mask: a | b };
    });
    const tiles: TubeGame['tiles'] = Array.from({ length: COLS * ROWS }, () => ({ type: r.chance(0.5) ? 'straight' : 'elbow', rot: r.int(4) }));
    for (const n of need) {
      const straight = n.mask === (N | S) || n.mask === (E | Wd);
      tiles[n.cell] = { type: straight ? 'straight' : 'elbow', rot: r.int(4) };
    }
    // make sure plenty of route tiles start wrong
    let wrong = need.filter((n) => tileMask(tiles[n.cell]!) !== n.mask).length;
    for (const n of need) {
      if (wrong >= Math.ceil(need.length * 0.6)) break;
      const t = tiles[n.cell]!;
      if (tileMask(t) === n.mask) {
        t.rot = (t.rot + 1) % 4;
        wrong++;
      }
    }
    const game = { cols: COLS, rows: ROWS, inRow, outRow, tiles, need };
    if (traceRoute(game, tiles).ok) continue;
    return game;
  }
  // deterministic fallback: straight row
  const tiles: TubeGame['tiles'] = Array.from({ length: COLS * ROWS }, (_, i) => ({ type: 'straight', rot: i % 2 ? 0 : 1 }));
  return { cols: COLS, rows: ROWS, inRow: 0, outRow: 0, tiles, need: Array.from({ length: COLS }, (_, c) => ({ cell: c, mask: E | Wd })) };
}

/** Follow the capsule from the inlet; returns lit cells and whether it reaches the port. */
export function traceRoute(g: Pick<TubeGame, 'cols' | 'rows' | 'inRow' | 'outRow'>, tiles: { type: TileType; rot: number }[]): { cells: number[]; ok: boolean } {
  const cells: number[] = [];
  let c = 0;
  let rw = g.inRow;
  let from = Wd;
  for (let guard = 0; guard < g.cols * g.rows + 2; guard++) {
    const id = rw * g.cols + c;
    const t = tiles[id];
    if (!t) break;
    const m = tileMask(t);
    if (!(m & from)) break;
    cells.push(id);
    const out = m & ~from;
    if (out === E && c === g.cols - 1) return { cells, ok: rw === g.outRow };
    if (out === N) {
      rw--;
      from = S;
    } else if (out === S) {
      rw++;
      from = N;
    } else if (out === E) {
      c++;
      from = Wd;
    } else if (out === Wd) {
      c--;
      from = E;
    } else break;
    if (c < 0 || rw < 0 || c >= g.cols || rw >= g.rows) break;
  }
  return { cells, ok: false };
}

const T = 56;
const GX = 240 - (COLS * T) / 2;
const GY = 78;

export default function RerouteTube({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genRerouteTube(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [tiles, setTiles] = useState(() => g.tiles.map((t) => ({ ...t })));
  const [cursor, setCursor] = useState(g.inRow * COLS);
  const [ship, setShip] = useState(-1);
  const [burst, setBurst] = useState(0);
  const route = useMemo(() => traceRoute(g, tiles), [g, tiles]);
  const lit = new Set(route.cells);

  const rotate = (i: number) => {
    if (done) return;
    setCursor(i);
    const next = tiles.map((t, j) => (j === i ? { ...t, rot: t.rot + 1 } : t));
    setTiles(next);
    const tr = traceRoute(g, next);
    if (tr.ok) {
      finish(1000);
      tr.cells.forEach((_, k) => later(() => setShip(k), 260 + k * 70));
      later(() => setBurst(1), 260 + tr.cells.length * 70);
    }
  };

  const onKey = (k: KeyInput) => {
    if (!k.down) return;
    if (k.dir) setCursor((c) => gridMove(c, k.dir!, COLS, COLS * g.rows));
    else if (k.action) rotate(cursor);
  };

  const shipCell = ship >= 0 ? route.cells[Math.min(ship, route.cells.length - 1)] : undefined;
  const cc = (id: number) => ({ x: GX + (id % COLS) * T + T / 2, y: GY + Math.floor(id / COLS) * T + T / 2 });
  const inY = GY + g.inRow * T + T / 2;
  const outY = GY + g.outRow * T + T / 2;
  const shipPos = shipCell !== undefined ? cc(shipCell) : { x: GX - 30, y: inY };
  const shipFinal = burst ? { x: GX + COLS * T + 34, y: outY } : shipPos;

  return (
    <GameShell kind={kind} label="Re-route the pneumatic tube" reducedMotion={reducedMotion} onKey={onKey} status={route.ok ? 'Route connected' : `${route.cells.length} tubes connected from the inlet`}>
      <Stage ids={ids} tone={C.cobalt} tone2={C.teal}>
        <Caption text="PNEUMATIC TUBES" />
        <text x={466} y={30} textAnchor="end" fontSize={11} fontWeight={700} fill={C.muted}>
          tap a pipe to rotate
        </text>
        {/* board */}
        <rect x={GX - 8} y={GY - 8} width={COLS * T + 16} height={g.rows * T + 16} rx={14} fill="#0a1222" stroke="#2a3a62" strokeWidth={1.5} />
        {/* inlet */}
        <g>
          <rect x={6} y={inY - 22} width={GX - 14} height={44} rx={10} fill={ids.url('metal')} stroke="#5d77b0" />
          <rect x={GX - 26} y={inY - 13} width={22} height={26} fill="#1e2b49" />
          <path d={`M${GX - 26} ${inY - 9} h26 M${GX - 26} ${inY + 9} h26`} stroke={C.tealHi} strokeOpacity={0.6} strokeWidth={2} />
          <text x={GX / 2 - 2} y={inY + 4} textAnchor="middle" fontSize={8.5} fontWeight={800} fill={C.tealHi}>
            IN
          </text>
        </g>
        {/* port */}
        <g>
          <rect x={GX + COLS * T + 8} y={outY - 24} width={480 - (GX + COLS * T) - 14} height={48} rx={10} fill={route.ok ? '#134e4a' : ids.url('metal')} stroke={route.ok ? C.tealHi : C.warn} strokeWidth={route.ok ? 2 : 1.5} className={route.ok ? undefined : 'mmg-pulse'} />
          <text x={GX + COLS * T + 8 + (480 - (GX + COLS * T) - 14) / 2} y={outY - 4} textAnchor="middle" fontSize={8} fontWeight={900} fill={route.ok ? C.tealHi : C.warn}>
            PORT
          </text>
          <text x={GX + COLS * T + 8 + (480 - (GX + COLS * T) - 14) / 2} y={outY + 9} textAnchor="middle" fontSize={8} fontWeight={800} fill={C.muted}>
            VAULT
          </text>
        </g>
        {tiles.map((t, i) => {
          const x = GX + (i % COLS) * T;
          const y = GY + Math.floor(i / COLS) * T;
          const on = lit.has(i);
          return (
            <g key={i} className="mmg-hit" onPointerDown={() => rotate(i)}>
              <rect x={x + 2} y={y + 2} width={T - 4} height={T - 4} rx={9} fill={on ? '#0f2a3a' : '#121b30'} stroke={on ? '#2dd4bf' : '#223052'} strokeOpacity={on ? 0.6 : 1} className="mmg-fill-t" />
              <g transform={`translate(${x + T / 2} ${y + T / 2})`}>
                <g className="mmg-spring" style={{ transform: `rotate(${t.rot * 90}deg)` }}>
                  <Pipe type={t.type} on={on} />
                </g>
              </g>
            </g>
          );
        })}
        <FocusRing x={GX + (cursor % COLS) * T + 2} y={GY + Math.floor(cursor / COLS) * T + 2} w={T - 4} h={T - 4} r={9} show={!done} />
        {/* capsule */}
        {(ship >= 0 || burst > 0) && (
          <g className="mmg-ease" style={{ transform: `translate(${shipFinal.x}px,${shipFinal.y}px)`, transition: 'transform 90ms linear' }}>
            <rect x={-12} y={-8} width={24} height={16} rx={8} fill="#e2e8f0" stroke={C.tealHi} strokeWidth={2} filter={ids.url('glow')} />
            <rect x={-4} y={-8} width={8} height={16} fill={C.berry} />
          </g>
        )}
        {burst > 0 && <Burst k={burst} x={GX + COLS * T + 34} y={outY} color={C.tealHi} />}
      </Stage>
    </GameShell>
  );
}

function Pipe({ type, on }: { type: TileType; on: boolean }) {
  const h = T / 2;
  const d = type === 'straight' ? `M0 ${-h} V${h}` : `M0 ${-h} V-8 Q0 0 8 0 H${h}`;
  const glass = on ? '#5eead4' : '#5b6f9c';
  return (
    <g>
      <path d={d} stroke="#05080f" strokeWidth={22} fill="none" />
      <path d={d} stroke={glass} strokeOpacity={on ? 0.85 : 0.55} strokeWidth={17} fill="none" />
      <path d={d} stroke={on ? '#ccfbf1' : '#94a3c8'} strokeOpacity={on ? 0.9 : 0.35} strokeWidth={4} fill="none" />
      {/* brass collars */}
      <rect x={-12} y={-h} width={24} height={5} rx={1.5} fill="#b8862f" />
      {type === 'straight' ? <rect x={-12} y={h - 5} width={24} height={5} rx={1.5} fill="#b8862f" /> : <rect x={h - 5} y={-12} width={5} height={24} rx={1.5} fill="#b8862f" />}
    </g>
  );
}
