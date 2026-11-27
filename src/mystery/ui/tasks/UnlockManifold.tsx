import { useMemo, useState } from 'react';
import { Burst, C, Caption, FocusRing, GameShell, Stage, Toast, gridMove, tsfx, useBump, useFinish, useIds, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const MANIFOLD_COLS = 5;

/** grid[i] = the number shown on button i (1..10). */
export function genUnlockManifold(seed: number): number[] {
  const r = makeRng(seed, 1717);
  return r.shuffle(Array.from({ length: 10 }, (_, i) => i + 1));
}

const BW = 72;
const GAP = 12;
const X0 = 240 - (MANIFOLD_COLS * BW + (MANIFOLD_COLS - 1) * GAP) / 2;
const Y0 = 150;

export default function UnlockManifold({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const grid = useMemo(() => genUnlockManifold(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const [next, setNext] = useState(1);
  const [cursor, setCursor] = useState(0);
  const [err, bumpErr] = useBump();
  const [flash, setFlash] = useState(false);
  const later = useTimers();
  const [burst, setBurst] = useState({ k: 0, x: 0, y: 0 });

  const press = (i: number) => {
    if (done) return;
    setCursor(i);
    const n = grid[i] as number;
    if (n < next) return; // already lit
    const x = X0 + (i % MANIFOLD_COLS) * (BW + GAP) + BW / 2;
    const y = Y0 + Math.floor(i / MANIFOLD_COLS) * (BW + GAP) + BW / 2;
    if (n !== next) {
      tsfx('bad');
      setNext(1);
      bumpErr();
      setFlash(true);
      later(() => setFlash(false), 520);
      return;
    }
    setBurst((b) => ({ k: b.k + 1, x, y }));
    tsfx('good', n / 10);
    setNext(n + 1);
    if (n === 10) finish(600);
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.dir) {
      const n = gridMove(cursor, k.dir, MANIFOLD_COLS, 10);
      if (n !== cursor) tsfx('move');
      setCursor(n);
    }
    else if (k.action && !k.repeat) press(cursor);
    else if (/^[0-9]$/.test(k.key) && !k.repeat) {
      const n = k.key === '0' ? 10 : Number(k.key);
      press(grid.indexOf(n));
      return true;
    }
  };

  const open = done;
  return (
    <GameShell kind={kind} label="Unlock the manifold: press 1 to 10 in order" reducedMotion={reducedMotion} onKey={onKey} status={done ? 'Unlocked' : `Next: ${next}`}>
      <Stage ids={ids} tone={C.cobalt} tone2={C.warn}>
        <Caption text="REACTOR · MANIFOLD LOCK" />
        {/* pipes */}
        <path d="M0 96 H90 q14 0 14 14 v8 M480 96 H390 q-14 0 -14 14 v8" stroke="#1e2b49" strokeWidth={18} fill="none" />
        <path d="M0 96 H90 q14 0 14 14 v8 M480 96 H390 q-14 0 -14 14 v8" stroke={open ? C.tealHi : '#2a3a62'} strokeOpacity={open ? 0.8 : 1} strokeWidth={6} fill="none" className="mmg-fill-t" />
        {/* padlock */}
        <g transform="translate(240 72)">
          <path d={open ? 'M-14 -8 V-20 a14 14 0 0 1 28 0 V-30' : 'M-14 -8 V-20 a14 14 0 0 1 28 0 V-8'} stroke="#cbd5e1" strokeWidth={6} fill="none" className="mmg-fast" />
          <rect x={-22} y={-10} width={44} height={34} rx={8} fill={open ? C.teal : ids.url('brass')} stroke="#7a5418" className="mmg-fill-t" />
          <circle cy={4} r={4.5} fill="#1f2937" />
          <rect x={-1.5} y={4} width={3} height={10} fill="#1f2937" />
        </g>
        {/* progress LEDs */}
        {Array.from({ length: 10 }, (_, i) => (
          <circle key={i} cx={240 - 4.5 * 18 + i * 18} cy={118} r={4.5} fill={i < next - 1 ? C.tealHi : '#1e293b'} filter={i < next - 1 ? ids.url('glow') : undefined} />
        ))}
        <rect x={X0 - 14} y={Y0 - 14} width={MANIFOLD_COLS * BW + (MANIFOLD_COLS - 1) * GAP + 28} height={2 * BW + GAP + 28} rx={16} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
        <g key={err} className={err ? 'mmg-shake' : undefined}>
          {grid.map((n, i) => {
            const x = X0 + (i % MANIFOLD_COLS) * (BW + GAP);
            const y = Y0 + Math.floor(i / MANIFOLD_COLS) * (BW + GAP);
            const lit = n < next;
            return (
              <g key={i} className="mmg-hit" onPointerDown={() => press(i)}>
                <rect x={x} y={y + 4} width={BW} height={BW} rx={12} fill="#000" opacity={0.4} />
                <g className="mmg-fast" style={{ transform: `translateY(${lit ? 3 : 0}px)` }}>
                  <rect x={x} y={y} width={BW} height={BW} rx={12} fill={lit ? '#0f3d3a' : '#1b2640'} stroke={lit ? C.tealHi : flash ? C.bad : '#3a4d78'} strokeWidth={lit ? 2.5 : 1.5} filter={lit ? ids.url('glow') : undefined} className="mmg-fill-t" />
                  <rect x={x + 5} y={y + 4} width={BW - 10} height={BW * 0.36} rx={8} fill="#fff" opacity={0.06} />
                  <text x={x + BW / 2} y={y + BW / 2 + 10} textAnchor="middle" fontSize={28} fontWeight={900} fill={lit ? '#ccfbf1' : '#dbe4ff'} className="mmg-mono">
                    {n}
                  </text>
                </g>
                <FocusRing x={x} y={y} w={BW} h={BW} r={12} show={cursor === i && !done} />
              </g>
            );
          })}
        </g>
        {burst.k > 0 && <Burst k={burst.k} x={burst.x} y={burst.y} color={C.tealHi} n={8} dist={34} />}
        <text x={240} y={344} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={done ? C.tealHi : C.muted}>
          {done ? 'Manifold unlocked — whoosh!' : `Press ${next}${next < 10 ? ` (then ${next + 1})` : ''}`}
        </text>
        <Toast k={err} text="Out of order — back to 1!" tone={C.bad} y={340} />
      </Stage>
    </GameShell>
  );
}
