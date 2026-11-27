import { useMemo, useState } from 'react';
import { Burst, C, Caption, FocusRing, GameShell, Stage, tsfx, useFinish, useIds, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const SWITCHES = 6;

export function genLightsPanel(seed: number): boolean[] {
  const r = makeRng(seed, 2626);
  const off = 3 + r.int(3);
  const order = r.shuffle(Array.from({ length: SWITCHES }, (_, i) => i));
  const on = Array.from({ length: SWITCHES }, () => true);
  for (const i of order.slice(0, off)) on[i] = false;
  return on;
}

const SW = 58;
const GAP = 12;
const X0 = 240 - (SWITCHES * SW + (SWITCHES - 1) * GAP) / 2;
const Y0 = 170;

export default function LightsPanel({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const start = useMemo(() => genLightsPanel(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const [on, setOn] = useState(start);
  const [cursor, setCursor] = useState(0);
  const [burst, setBurst] = useState(0);

  const set = (i: number, v?: boolean) => {
    if (done) return;
    setCursor(i);
    const next = on.map((s, j) => (j === i ? (v ?? !s) : s));
    if (next[i] !== on[i]) {
      if (next[i]) tsfx('good', next.filter(Boolean).length / SWITCHES);
      else tsfx('drop');
    }
    setOn(next);
    if (next.every(Boolean)) {
      setBurst(1);
      finish(600);
    }
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.dir === 'left' || k.dir === 'right') {
      const n = k.dir === 'left' ? Math.max(0, cursor - 1) : Math.min(SWITCHES - 1, cursor + 1);
      if (n !== cursor) tsfx('move');
      setCursor(n);
    }
    else if (k.dir === 'up' && !k.repeat) set(cursor, true);
    else if (k.dir === 'down' && !k.repeat) set(cursor, false);
    else if (k.action && !k.repeat) set(cursor);
  };

  const ratio = on.filter(Boolean).length / SWITCHES;
  return (
    <GameShell kind={kind} label="Fix lights: flip every switch on" reducedMotion={reducedMotion} onKey={onKey} status={`${on.filter(Boolean).length} of ${SWITCHES} switches on`}>
      <Stage ids={ids} tone={C.warn} tone2={C.cobalt}>
        {/* ceiling lights */}
        {Array.from({ length: 5 }, (_, i) => {
          const lit = ratio > (i + 0.5) / 5.2 || done;
          const x = 64 + i * 88;
          return (
            <g key={i}>
              <line x1={x} y1={0} x2={x} y2={40} stroke="#334155" strokeWidth={2} />
              <path d={`M${x - 22} 52 q22 -24 44 0 Z`} fill="#334155" />
              <ellipse cx={x} cy={54} rx={14} ry={7} fill={lit ? '#fef3c7' : '#1e293b'} filter={lit ? ids.url('glowBig') : undefined} className="mmg-fill-t" />
              {lit && <path d={`M${x - 16} 56 L${x - 46} 130 H${x + 46} L${x + 16} 56 Z`} fill="#fde68a" opacity={0.07} />}
            </g>
          );
        })}
        <rect width={480} height={360} fill="#010205" opacity={(1 - ratio) * 0.55} pointerEvents="none" className="mmg-fade" />
        <Caption text="ELECTRICAL · LIGHTS SABOTAGE" tone={C.warn} />
        {/* panel */}
        <rect x={X0 - 22} y={Y0 - 50} width={SWITCHES * SW + (SWITCHES - 1) * GAP + 44} height={190} rx={18} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={2} />
        <rect x={X0 - 12} y={Y0 - 40} width={SWITCHES * SW + (SWITCHES - 1) * GAP + 24} height={16} rx={4} fill="#facc15" opacity={0.85} />
        {Array.from({ length: 16 }, (_, i) => (
          <rect key={i} x={X0 - 8 + i * 27} y={Y0 - 40} width={12} height={16} fill="#0b1222" opacity={0.85} transform={`skewX(-30)`} style={{ transformBox: 'fill-box' }} />
        ))}
        {on.map((s, i) => {
          const x = X0 + i * (SW + GAP);
          return (
            <g key={i} className="mmg-hit" onPointerDown={() => set(i)}>
              <circle cx={x + SW / 2} cy={Y0 - 4} r={6} fill={s ? C.good : C.bad} filter={ids.url('glow')} className="mmg-fill-t" />
              <rect x={x} y={Y0 + 8} width={SW} height={108} rx={10} fill="#0a0f1c" stroke="#334155" />
              <rect x={x + SW / 2 - 9} y={Y0 + 22} width={18} height={80} rx={9} fill="#04070d" />
              <g className="mmg-spring" style={{ transform: `translateY(${s ? 0 : 44}px)` }}>
                <rect x={x + 8} y={Y0 + 16} width={SW - 16} height={44} rx={9} fill={s ? '#e2e8f0' : '#64748b'} stroke="#fff" strokeOpacity={0.4} filter={ids.url('shadow')} className="mmg-fill-t" />
                <rect x={x + 12} y={Y0 + 20} width={SW - 24} height={10} rx={5} fill="#fff" opacity={0.35} />
              </g>
              <text x={x + SW / 2} y={Y0 + 134} textAnchor="middle" fontSize={10} fontWeight={900} fill={s ? C.good : C.bad} letterSpacing={1}>
                {s ? 'ON' : 'OFF'}
              </text>
              <FocusRing x={x} y={Y0 + 8} w={SW} h={108} r={10} show={cursor === i && !done} />
            </g>
          );
        })}
        {burst > 0 && <Burst k={burst} x={240} y={Y0 + 60} color="#fde68a" n={14} dist={80} />}
        <text x={240} y={342} textAnchor="middle" fontSize={11.5} fontWeight={800} fill={done ? '#fde68a' : C.muted}>
          {done ? 'Lights restored!' : `${on.filter((x) => !x).length} breakers tripped`}
        </text>
      </Stage>
    </GameShell>
  );
}
