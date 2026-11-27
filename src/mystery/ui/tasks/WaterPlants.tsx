import { useMemo, useRef, useState } from 'react';
import { Berry, Burst, C, Caption, FocusRing, GameShell, Stage, Toast, capture, tsfx, useFinish, useHold, useIds, useRaf, useTimers, type BerryKind, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const WATER_RATE = 0.5; // pot fraction per second
export const BAND_LO = 0.03;
export const BAND_HI = 0.1;

export function genWaterPlants(seed: number) {
  const r = makeRng(seed, 1313);
  const berries: BerryKind[] = r.shuffle<BerryKind>(['straw', 'blue', 'rasp', 'marion']);
  return { pots: [0, 1, 2].map((i) => ({ line: Math.round(r.range(0.45, 0.8) * 100) / 100, berry: berries[i] as BerryKind })) };
}

const POT_X = [96, 240, 384];
const POT = { top: 196, h: 116, w: 104 };

export default function WaterPlants({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genWaterPlants(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [cursor, setCursor] = useState(0);
  const cursorRef = useRef(0);
  const [levels, setLevels] = useState([0, 0, 0]);
  const lv = useRef([0, 0, 0]);
  const [ok, setOk] = useState([false, false, false]);
  const okRef = useRef([false, false, false]);
  const draining = useRef([false, false, false]);
  const [toast, setToast] = useState({ k: 0, text: '' });
  const [burst, setBurst] = useState({ k: 0, x: 0 });
  const hold = useHold(!done, [], 'pour');
  const wasHolding = useRef(false);

  const moveTo = (i: number) => {
    cursorRef.current = i;
    setCursor(i);
  };

  const settle = (i: number) => {
    const line = g.pots[i]!.line;
    const v = lv.current[i] ?? 0;
    if (okRef.current[i] || v < line - BAND_LO || v > line + BAND_HI) return;
    okRef.current = okRef.current.map((o, j) => (j === i ? true : o));
    setOk(okRef.current);
    tsfx('good', okRef.current.filter(Boolean).length / okRef.current.length);
    setBurst((b) => ({ k: b.k + 1, x: POT_X[i] as number }));
    if (okRef.current.every(Boolean)) finish(600);
    else {
      const nxt = okRef.current.findIndex((o) => !o);
      if (nxt >= 0) later(() => moveTo(nxt), 250);
    }
  };

  useRaf((dt) => {
    const i = cursorRef.current;
    const holding = hold.ref.current && !okRef.current[i] && !draining.current[i];
    if (holding) {
      const line = g.pots[i]!.line;
      const v = (lv.current[i] ?? 0) + WATER_RATE * dt;
      lv.current = lv.current.map((x, j) => (j === i ? v : x));
      if (v > line + BAND_HI) {
        draining.current = draining.current.map((d, j) => (j === i ? true : d));
        setToast((t) => ({ k: t.k + 1, text: 'Whoa — overflow! Let it drain' }));
        tsfx('bad');
        hold.set(false);
      }
    }
    // draining pots fall back below the line
    draining.current.forEach((d, j) => {
      if (!d) return;
      const target = Math.max(0, (g.pots[j]!.line ?? 0) - 0.25);
      const v = Math.max(target, (lv.current[j] ?? 0) - dt * 0.9);
      lv.current = lv.current.map((x, k) => (k === j ? v : x));
      if (v <= target) draining.current = draining.current.map((x, k) => (k === j ? false : x));
    });
    if (wasHolding.current && !hold.ref.current) settle(i);
    wasHolding.current = hold.ref.current;
    setLevels(lv.current);
  }, !done);

  const onKey = (k: KeyInput) => {
    if (done) return;
    if (k.down && (k.dir === 'left' || k.dir === 'right')) {
      if (hold.ref.current) return;
      const n = Math.max(0, Math.min(2, cursorRef.current + (k.dir === 'left' ? -1 : 1)));
      if (n !== cursorRef.current) tsfx('move');
      moveTo(n);
      return;
    }
    hold.key(k);
  };

  const pouring = hold.holding && !done;
  const canX = POT_X[cursor] as number;

  return (
    <GameShell kind={kind} label="Water plants to the line" reducedMotion={reducedMotion} onKey={onKey} status={`Pot ${cursor + 1}: ${Math.round((levels[cursor] ?? 0) * 100)} percent, line at ${Math.round(g.pots[cursor]!.line * 100)}`}>
      <Stage
        ids={ids}
        tone={C.leaf}
        tone2={C.cobalt}
        defs={
          <linearGradient id={ids.id('water')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7dd3fc" stopOpacity="0.9" />
            <stop offset="1" stopColor="#2563eb" stopOpacity="0.9" />
          </linearGradient>
        }
      >
        <Caption text="GREENHOUSE · BERRY BEDS" tone={C.leaf} />
        {/* shelf */}
        <rect x={20} y={POT.top + POT.h + 2} width={440} height={14} rx={5} fill="#3b2a1c" stroke="#7c5a3a" />
        {/* watering can */}
        <g className="mmg-ease" style={{ transform: `translate(${canX + 34}px,${92}px)` }}>
          <g className="mmg-spring" style={{ transform: `rotate(${pouring ? -32 : 0}deg)` }}>
            <path d="M-26 -18 h52 q8 0 8 8 v36 q0 8 -8 8 h-52 q-8 0 -8 -8 v-36 q0 -8 8 -8 Z" fill={C.cobalt} stroke="#1e3a8a" strokeWidth={2} />
            <path d="M-34 0 L-70 -24 L-74 -18 L-38 10 Z" fill={C.cobalt} stroke="#1e3a8a" strokeWidth={2} />
            <ellipse cx={-74} cy={-22} rx={6} ry={8} fill="#1e3a8a" transform="rotate(-50 -74 -22)" />
            <path d="M-10 -18 q10 -24 30 0" fill="none" stroke="#1e3a8a" strokeWidth={6} />
            <rect x={-20} y={-8} width={40} height={6} rx={3} fill="#fff" opacity={0.25} />
            <g transform="translate(6 12)">
              <Berry kind="blue" r={8} leaf={false} />
            </g>
          </g>
        </g>
        {pouring &&
          [0, 1, 2, 3, 4].map((i) => <circle key={i} className="mmg-drip" cx={canX - 26 + (i % 3) * 5} cy={110 + i * 10} r={2.5} fill="#7dd3fc" style={{ animationDelay: `${i * 0.08}s`, animationDuration: '0.35s' }} />)}
        {/* pots */}
        {g.pots.map((p, i) => {
          const x = POT_X[i] as number;
          const lvl = levels[i] ?? 0;
          const top = POT.top;
          const inner = POT.h - 14;
          const lineY = top + 8 + inner * (1 - p.line);
          const waterY = top + 8 + inner * (1 - Math.min(lvl, 1.05));
          const done_ = ok[i];
          return (
            <g
              key={i}
              className={done_ ? undefined : 'mmg-hit'}
              onPointerDown={(e) => {
                if (done || done_) return;
                moveTo(i);
                hold.pointer.onPointerDown(e);
                capture(e);
              }}
              onPointerUp={hold.pointer.onPointerUp}
              onPointerCancel={hold.pointer.onPointerCancel}
            >
              <rect x={x - POT.w / 2 - 6} y={top - 80} width={POT.w + 12} height={POT.h + 84} fill="transparent" />
              {/* plant */}
              <g transform={`translate(${x} ${top + 4})`}>
                <path d="M0 0 C -2 -20 -2 -30 0 -44" stroke={C.leafDark} strokeWidth={4} fill="none" />
                <ellipse cx={-14} cy={-24} rx={14} ry={6} fill={C.leaf} transform="rotate(-30 -14 -24)" />
                <ellipse cx={14} cy={-34} rx={14} ry={6} fill={C.leaf} transform="rotate(30 14 -34)" />
                {done_ ? (
                  <g className="mmg-pop">
                    <Berry kind={p.berry} r={13} face x={-2} y={-58} />
                    <Berry kind={p.berry} r={9} x={20} y={-50} leaf={false} />
                  </g>
                ) : (
                  <circle cx={0} cy={-48} r={6} fill="#bef264" />
                )}
              </g>
              {/* glass planter */}
              <path d={`M${x - POT.w / 2} ${top} h${POT.w} l-8 ${POT.h} h${-POT.w + 16} Z`} fill="#0a1424" stroke="#93c5fd" strokeOpacity={0.5} strokeWidth={2} />
              <clipPath id={ids.id(`pot${i}`)}>
                <path d={`M${x - POT.w / 2 + 3} ${top + 2} h${POT.w - 6} l-8 ${POT.h - 4} h${-POT.w + 22} Z`} />
              </clipPath>
              <g clipPath={ids.url(`pot${i}`)}>
                <rect x={x - POT.w / 2} y={top + POT.h - 26} width={POT.w} height={30} fill="#5b3a22" />
                <rect x={x - POT.w / 2} y={waterY} width={POT.w} height={POT.h} fill={ids.url('water')} opacity={0.75} />
                {lvl > 0.02 && <path d={`M${x - POT.w / 2} ${waterY} q13 -3 26 0 t26 0 t26 0 t26 0`} stroke="#e0f2fe" strokeWidth={1.5} fill="none" />}
              </g>
              <rect x={x - POT.w / 2 + 6} y={top + 6} width={8} height={POT.h - 20} rx={4} fill="#fff" opacity={0.1} />
              {/* fill line */}
              <line x1={x - POT.w / 2 - 8} x2={x + POT.w / 2 + 2} y1={lineY} y2={lineY} stroke={done_ ? C.good : C.warn} strokeWidth={2.5} strokeDasharray="6 4" />
              <path d={`M${x + POT.w / 2 + 2} ${lineY} l10 -7 v14 Z`} fill={done_ ? C.good : C.warn} />
              {done_ && (
                <text x={x} y={top + POT.h + 34} textAnchor="middle" fontSize={11} fontWeight={900} fill={C.good}>
                  ✓ perfect
                </text>
              )}
              <FocusRing x={x - POT.w / 2 - 10} y={top - 70} w={POT.w + 20} h={POT.h + 76} r={14} show={cursor === i && !done} />
            </g>
          );
        })}
        {burst.k > 0 && <Burst k={burst.k} x={burst.x} y={POT.top - 40} color={C.good} />}
        <text x={466} y={30} textAnchor="end" fontSize={10.5} fill={C.muted}>
          stop on the dashed line
        </text>
        <Toast k={toast.k} text={toast.text} tone={C.warn} y={62} />
      </Stage>
    </GameShell>
  );
}
