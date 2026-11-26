import { useMemo, useRef, useState } from 'react';
import { C, Caption, FocusCircle, GameShell, Stage, Twinkles, capture, clamp, svgPoint, useFinish, useIds, useRaf, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const DISH_STEP = 3;
const TOL = 4.5;
const LOCK_S = 0.8;
const PIVOT = { x: 168, y: 268 };

export function genAlignDish(seed: number): { target: number; start: number } {
  const r = makeRng(seed, 909);
  const target = (r.int(31) - 15) * DISH_STEP; // -45..45
  let k = (10 + r.int(9)) * (r.chance(0.5) ? 1 : -1);
  if (Math.abs(target + k * DISH_STEP) > 78) k = -k;
  return { target, start: target + k * DISH_STEP };
}

export const signalOf = (angle: number, target: number): number => clamp(1 - Math.abs(angle - target) / 50, 0, 1);

export default function AlignDish({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genAlignDish(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const [angle, setAngleState] = useState(g.start);
  const angleRef = useRef(g.start);
  const setAngle = (v: number) => {
    const n = clamp(v, -80, 80);
    angleRef.current = n;
    setAngleState(n);
  };
  const [drag, setDrag] = useState(false);
  const [lock, setLock] = useState(0);
  const lockRef = useRef(0);
  const [t, setT] = useState(0);

  useRaf((dt, now) => {
    setT(now / 1000);
    if (done) return;
    const on = Math.abs(angleRef.current - g.target) <= TOL;
    lockRef.current = clamp(on ? lockRef.current + dt / LOCK_S : lockRef.current - dt * 2, 0, 1);
    setLock(lockRef.current);
    if (lockRef.current >= 1) {
      setAngle(g.target);
      finish(400);
    }
  });

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.dir === 'left' || k.dir === 'down') setAngle(angleRef.current - DISH_STEP);
    else if (k.dir === 'right' || k.dir === 'up') setAngle(angleRef.current + DISH_STEP);
  };

  const sig = signalOf(angle, g.target);
  const locked = done || Math.abs(angle - g.target) <= TOL;
  const rad = (g.target * Math.PI) / 180;
  const sat = { x: PIVOT.x + Math.sin(rad) * 200, y: PIVOT.y - Math.cos(rad) * 200 };
  // oscilloscope wave
  const wave = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const x = i * (140 / 60);
      const noise = (1 - sig) * 22 * Math.sin(i * 12.9898 + t * 37) * Math.sin(i * 3.1 + t * 11);
      const y = Math.sin(i / 4 + t * 6) * 18 * (0.3 + sig * 0.7) + noise;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [sig, t]);

  return (
    <GameShell kind={kind} label="Align the satellite dish" reducedMotion={reducedMotion} onKey={onKey} status={`Signal ${Math.round(sig * 100)} percent${locked ? ', locked' : ''}`}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.marion}
        tone2={C.cobalt}
        grid={false}
        onPointerMove={(e) => {
          if (!drag || done) return;
          const p = svgPoint(svg.current, e);
          const a = (Math.atan2(p.x - PIVOT.x, PIVOT.y - p.y) * 180) / Math.PI;
          setAngle(a);
        }}
        onPointerUp={() => setDrag(false)}
        onPointerDown={(e) => {
          if (done) return;
          const p = svgPoint(svg.current, e);
          if (p.x > 330) return;
          capture(e);
          setDrag(true);
          setAngle((Math.atan2(p.x - PIVOT.x, PIVOT.y - p.y) * 180) / Math.PI);
        }}
      >
        <Twinkles seed={seed} n={40} area={{ x: 0, y: 0, w: 330, h: 220 }} />
        <Caption text="ROOF · UPLINK DISH" tone={C.marionHi} />
        {/* the satellite */}
        <g transform={`translate(${sat.x} ${sat.y})`} opacity={0.5 + sig * 0.5}>
          <circle r={24} fill={C.cobaltHi} fillOpacity={0.12 + sig * 0.25} className="mmg-pulse" />
          <rect x={-6} y={-6} width={12} height={12} rx={2} fill="#e2e8f0" transform="rotate(20)" />
          <rect x={-26} y={-4} width={16} height={8} fill={C.cobalt} transform="rotate(20)" />
          <rect x={10} y={-4} width={16} height={8} fill={C.cobalt} transform="rotate(20)" />
        </g>
        {/* beam */}
        <g transform={`translate(${PIVOT.x} ${PIVOT.y}) rotate(${angle})`}>
          <path d="M0 -40 L-34 -230 L34 -230 Z" fill={locked ? C.tealHi : C.cobaltHi} fillOpacity={0.08 + sig * 0.14} className={locked ? 'mmg-pulse' : undefined} />
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${-14 - i * 10} ${-70 - i * 30} Q0 ${-80 - i * 30} ${14 + i * 10} ${-70 - i * 30}`} stroke={locked ? C.tealHi : C.cobaltHi} strokeWidth={2.5} fill="none" strokeOpacity={0.25 + sig * 0.6} className="mmg-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </g>
        {/* rooftop */}
        <path d="M0 300 L120 290 L330 296 L330 360 L0 360 Z" fill="#141c2f" />
        <path d="M0 300 L120 290 L330 296" stroke="#2a3a62" strokeWidth={2} fill="none" />
        {[30, 70, 230, 280].map((x, i) => (
          <circle key={i} cx={x} cy={318 + (i % 2) * 14} r={6 + (i % 3) * 3} fill={i % 2 ? C.berry : C.marion} opacity={0.6} />
        ))}
        {/* dish */}
        <rect x={PIVOT.x - 10} y={PIVOT.y} width={20} height={32} fill="#334155" />
        <rect x={PIVOT.x - 30} y={PIVOT.y + 28} width={60} height={10} rx={4} fill="#475569" />
        <g transform={`translate(${PIVOT.x} ${PIVOT.y}) rotate(${angle})`} className={drag ? undefined : 'mmg-fast'}>
          <path d="M-58 -26 Q0 18 58 -26 Q0 -6 -58 -26 Z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth={2} />
          <path d="M-58 -26 Q0 18 58 -26" fill="none" stroke="#fff" strokeWidth={2} opacity={0.6} />
          <line x1={0} y1={-6} x2={0} y2={-52} stroke="#94a3b8" strokeWidth={3} />
          <circle cx={0} cy={-56} r={6} fill={locked ? C.tealHi : C.berry} filter={ids.url('glow')} />
          <circle r={8} fill="#64748b" />
        </g>
        <FocusCircle x={PIVOT.x} y={PIVOT.y - 20} r={64} show={!done} />
        {/* side console */}
        <rect x={336} y={14} width={132} height={332} rx={14} fill="#0a1222" stroke="#2a3a62" />
        <text x={402} y={38} textAnchor="middle" fontSize={10} fontWeight={900} fill={C.muted} letterSpacing={1.4}>
          SIGNAL
        </text>
        {Array.from({ length: 6 }, (_, i) => {
          const on = sig > (i + 0.5) / 6.3;
          return <rect key={i} x={356 + i * 16} y={90 - i * 8} width={11} height={14 + i * 8} rx={3} fill={on ? (locked ? C.tealHi : C.cobaltHi) : '#1e293b'} filter={on ? ids.url('glow') : undefined} />;
        })}
        <rect x={346} y={112} width={112} height={88} rx={10} fill="#04070d" stroke="#1e3a5f" />
        <g transform="translate(332 156)">
          <polyline points={wave} fill="none" stroke={locked ? C.tealHi : C.cobaltHi} strokeWidth={2} filter={ids.url('glow')} transform="translate(20 0) scale(0.75 1)" />
        </g>
        <text x={402} y={226} textAnchor="middle" fontSize={24} fontWeight={900} className="mmg-mono" fill={locked ? C.tealHi : C.ink}>
          {Math.round(sig * 100)}%
        </text>
        <text x={402} y={246} textAnchor="middle" fontSize={9.5} fill={C.muted}>
          AIM {angle >= 0 ? '+' : ''}
          {Math.round(angle)}°
        </text>
        {/* lock */}
        <g transform="translate(402 292)">
          <circle r={26} fill="none" stroke="#1e293b" strokeWidth={6} />
          <circle r={26} fill="none" stroke={C.tealHi} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${lock * 163} 163`} transform="rotate(-90)" />
          <text y={4} textAnchor="middle" fontSize={9} fontWeight={900} fill={lock > 0 ? C.tealHi : C.muted}>
            {done ? 'LOCKED' : 'LOCK'}
          </text>
        </g>
      </Stage>
    </GameShell>
  );
}
