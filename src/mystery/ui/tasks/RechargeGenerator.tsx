import { useRef, useState } from 'react';
import { Burst, C, Caption, FocusCircle, GameShell, Stage, capture, clamp, svgPoint, useFinish, useHold, useIds, useRaf, type KeyInput } from './kit';
import type { MiniGameProps } from './types';

export const CRANK_RATE = 0.36; // charge per second while cranking
const DECAY = 0.07;
export const GREEN = 0.85;
const PER_TURN = 0.2;
const CR = { x: 368, y: 214, r: 74 };

export default function RechargeGenerator({ kind, onComplete, reducedMotion }: MiniGameProps) {
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const [charge, setCharge] = useState(0);
  const cRef = useRef(0);
  const [angle, setAngle] = useState(0);
  const aRef = useRef(0);
  const drag = useRef<{ a: number } | null>(null);
  const hold = useHold(!done);
  const [burst, setBurst] = useState(0);
  const lastSpin = useRef(0);

  const bump = (v: number) => {
    cRef.current = clamp(cRef.current + v, 0, 1);
    if (cRef.current >= GREEN && !done) {
      setBurst(1);
      finish(600);
    }
  };

  useRaf((dt, now) => {
    if (done) return;
    if (hold.ref.current) {
      bump(CRANK_RATE * dt);
      aRef.current += dt * 560;
      lastSpin.current = now;
    } else if (now - lastSpin.current > 200) cRef.current = Math.max(0, cRef.current - DECAY * dt);
    setCharge(cRef.current);
    setAngle(aRef.current);
  });

  const needle = -100 + charge * 200;
  const bulbs = 6;
  const green = charge >= GREEN || done;

  return (
    <GameShell kind={kind} label="Recharge the generator: crank until the needle is green" reducedMotion={reducedMotion} onKey={(k: KeyInput) => hold.key(k)} status={`Charge ${Math.round(charge * 100)} percent`}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={green ? C.good : C.warn}
        tone2={C.cobalt}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || done) return;
          const p = svgPoint(svg.current, e);
          const a = Math.atan2(p.y - CR.y, p.x - CR.x);
          let da = a - d.a;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          d.a = a;
          if (Math.abs(da) > 0.002) {
            bump((Math.abs(da) / (Math.PI * 2)) * PER_TURN);
            aRef.current += (da * 180) / Math.PI;
            lastSpin.current = performance.now();
          }
        }}
        onPointerUp={() => {
          drag.current = null;
          hold.set(false);
        }}
      >
        <Caption text="LIGHTS OUT · GENERATOR" tone={C.warn} />
        {/* bulb string */}
        <path d="M20 58 Q120 86 240 62 T460 58" stroke="#334155" strokeWidth={2} fill="none" />
        {Array.from({ length: bulbs }, (_, i) => {
          const on = charge > (i + 1) / (bulbs + 0.6) || done;
          const x = 50 + i * 76;
          const y = 66 + Math.sin(i * 1.3) * 6;
          return (
            <g key={i}>
              <rect x={x - 4} y={y - 8} width={8} height={8} rx={2} fill="#475569" />
              <circle cx={x} cy={y + 8} r={9} fill={on ? '#fde68a' : '#1e293b'} filter={on ? ids.url('glowBig') : undefined} className="mmg-fill-t" />
            </g>
          );
        })}
        {/* generator body */}
        <rect x={30} y={110} width={230} height={210} rx={18} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={2} />
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={46} y={250 + (i % 3) * 18} width={60} height={7} rx={3} fill="#0b1222" opacity={0.6} />
        ))}
        {/* gauge */}
        <g transform="translate(145 214)">
          <circle r={72} fill="#04070d" stroke="#334155" strokeWidth={4} />
          <path d="M-62 -22 A66 66 0 0 1 -21 -62" stroke={C.bad} strokeWidth={10} fill="none" transform="rotate(-10)" />
          <path d="M-21 -62 A66 66 0 0 1 42 -51" stroke={C.warn} strokeWidth={10} fill="none" transform="rotate(-10)" />
          <path d="M42 -51 A66 66 0 0 1 64 -14" stroke={C.good} strokeWidth={10} fill="none" transform="rotate(-10)" filter={green ? ids.url('glow') : undefined} />
          <g style={{ transform: `rotate(${needle}deg)` }} className="mmg-fast">
            <path d="M-3 4 L0 -60 L3 4 Z" fill={green ? C.good : '#f8fafc'} />
          </g>
          <circle r={8} fill="#94a3b8" />
          <text y={36} textAnchor="middle" fontSize={16} fontWeight={900} className="mmg-mono" fill={green ? C.good : C.ink}>
            {Math.round(charge * 100)}%
          </text>
          <text y={52} textAnchor="middle" fontSize={8} fontWeight={800} fill={C.muted} letterSpacing={1}>
            {green ? 'CHARGED' : 'KEEP CRANKING'}
          </text>
        </g>
        <rect x={258} y={204} width={40} height={20} rx={4} fill="#334155" />
        {/* crank */}
        <g
          className={done ? undefined : 'mmg-grab'}
          onPointerDown={(e) => {
            if (done) return;
            capture(e);
            const p = svgPoint(svg.current, e);
            drag.current = { a: Math.atan2(p.y - CR.y, p.x - CR.x) };
            hold.set(true);
          }}
        >
          <circle cx={CR.x} cy={CR.y} r={CR.r + 18} fill="transparent" />
          <circle cx={CR.x} cy={CR.y} r={CR.r} fill="#0d1526" stroke="#4a5d8a" strokeWidth={4} />
          <g transform={`translate(${CR.x} ${CR.y}) rotate(${angle})`}>
            {[0, 72, 144, 216, 288].map((a) => (
              <rect key={a} x={-5} y={-CR.r + 8} width={10} height={CR.r - 8} rx={4} fill="#334155" transform={`rotate(${a})`} />
            ))}
            <line x1={0} y1={0} x2={CR.r - 14} y2={0} stroke="#cbd5e1" strokeWidth={9} strokeLinecap="round" />
            <circle cx={CR.r - 14} cy={0} r={15} fill={C.warn} stroke="#fff" strokeOpacity={0.6} strokeWidth={2} filter={ids.url('glow')} />
          </g>
          <circle cx={CR.x} cy={CR.y} r={16} fill={ids.url('brass')} />
          <FocusCircle x={CR.x} y={CR.y} r={CR.r + 4} show={!done} />
          <text x={CR.x} y={CR.y + CR.r + 28} textAnchor="middle" fontSize={11} fontWeight={900} fill={green ? C.good : C.warn}>
            {done ? 'Lights on!' : hold.holding ? 'CRANKING…' : 'HOLD / SPIN ↻'}
          </text>
        </g>
        {burst > 0 && <Burst k={burst} x={145} y={214} color={C.good} />}
      </Stage>
    </GameShell>
  );
}
