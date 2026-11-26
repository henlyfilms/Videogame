import { useMemo, useState } from 'react';
import { Burst, C, Caption, GameShell, Stage, spatialMove, useFinish, useIds, useShell, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

const R = 46;
const D = 90; // centre distance between neighbours
const CX = 240;
const CY = 192;

/** Hex centres: index 0 in the middle, 1..6 around it. */
export const HEXES: { x: number; y: number }[] = [{ x: CX, y: CY }, ...Array.from({ length: 6 }, (_, i) => ({ x: CX + Math.cos(((i * 60 - 90) * Math.PI) / 180) * D, y: CY + Math.sin(((i * 60 - 90) * Math.PI) / 180) * D }))];

export function genPrimeShields(seed: number): boolean[] {
  const r = makeRng(seed, 2222);
  const n = 3 + r.int(3);
  const order = r.shuffle([0, 1, 2, 3, 4, 5, 6]);
  const red = Array.from({ length: 7 }, () => false);
  for (const i of order.slice(0, n)) red[i] = true;
  return red;
}

const hexPath = (r: number) => Array.from({ length: 6 }, (_, i) => {
  const a = ((60 * i) * Math.PI) / 180;
  return `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
}).join(' ') + 'Z';

export default function PrimeShields({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const start = useMemo(() => genPrimeShields(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const [red, setRed] = useState(start);
  const [cursor, setCursor] = useState(0);
  const [bursts, setBursts] = useState<Record<number, number>>({});
  const [wob, setWob] = useState<Record<number, number>>({});

  const tap = (i: number) => {
    if (done) return;
    setCursor(i);
    if (!red[i]) {
      setWob((w) => ({ ...w, [i]: (w[i] ?? 0) + 1 }));
      return;
    }
    const next = red.map((v, j) => (j === i ? false : v));
    setRed(next);
    setBursts((b) => ({ ...b, [i]: (b[i] ?? 0) + 1 }));
    if (next.every((v) => !v)) finish(550);
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.dir) setCursor((c) => spatialMove(HEXES, c, k.dir!));
    else if (k.action && !k.repeat) tap(cursor);
  };

  const left = red.filter(Boolean).length;
  return (
    <GameShell kind={kind} label="Prime shields: tap every red hex" reducedMotion={reducedMotion} onKey={onKey} status={`${left} red hexes left`}>
      <Stage ids={ids} tone={left ? C.bad : C.teal} tone2={C.cobalt}>
        <Caption text="SHIELDS · PRIMING ARRAY" tone={left ? C.berryHi : C.tealHi} />
        {/* dome glow */}
        <circle cx={CX} cy={CY} r={168} fill="none" stroke={done ? C.tealHi : C.cobaltHi} strokeOpacity={done ? 0.55 : 0.15} strokeWidth={done ? 6 : 2} filter={done ? ids.url('glow') : undefined} className={done ? 'mmg-pop' : undefined} />
        {HEXES.map((h, i) => (
          <Hex key={i} i={i} x={h.x} y={h.y} red={red[i] === true} cursor={cursor === i && !done} wob={wob[i] ?? 0} onTap={() => tap(i)} glow={ids.url('glow')} />
        ))}
        {HEXES.map((h, i) => (bursts[i] ? <Burst key={`b${i}-${bursts[i]}`} k={`${i}-${bursts[i]}`} x={h.x} y={h.y} color={C.cobaltHi} n={10} dist={44} /> : null))}
        <text x={240} y={350} textAnchor="middle" fontSize={11.5} fontWeight={800} fill={left ? C.berryHi : C.tealHi}>
          {left ? `${left} unprimed` : 'Shields at 100%'}
        </text>
      </Stage>
    </GameShell>
  );
}

function Hex({ i, x, y, red, cursor, wob, onTap, glow }: { i: number; x: number; y: number; red: boolean; cursor: boolean; wob: number; onTap: () => void; glow: string }) {
  const { kbd } = useShell();
  return (
    <g transform={`translate(${x} ${y})`} className="mmg-hit" onPointerDown={onTap} aria-label={`hex ${i + 1} ${red ? 'red' : 'primed'}`}>
      <g key={wob} className={wob ? 'mmg-wobble' : undefined}>
        <path d={hexPath(R)} fill={red ? '#3a0d18' : '#0d2347'} stroke={red ? C.bad : C.cobaltHi} strokeWidth={3} filter={red ? undefined : glow} className={red ? 'mmg-pulse' : undefined} />
        <path d={hexPath(R - 10)} fill={red ? C.bad : C.cobalt} opacity={red ? 0.5 : 0.35} />
        {red ? (
          <g fill="#fecdd3">
            <rect x={-3.5} y={-18} width={7} height={22} rx={3} />
            <circle cy={13} r={4} />
          </g>
        ) : (
          <path d="M0 -18 L15 -11 V2 Q15 14 0 20 Q-15 14 -15 2 V-11 Z" fill="#dbeafe" opacity={0.9} />
        )}
      </g>
      {cursor && kbd && <path d={hexPath(R + 7)} fill="none" stroke={C.cobaltHi} strokeWidth={2.5} strokeDasharray="8 4" className="mmg-dash" />}
    </g>
  );
}
