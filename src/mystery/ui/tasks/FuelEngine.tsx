import { useRef, useState } from 'react';
import { Burst, C, Caption, FocusRing, GameShell, Stage, useFinish, useHold, useIds, useRaf, type KeyInput } from './kit';
import type { MiniGameProps } from './types';

export const ENGINE_RATE = 0.38;

export default function FuelEngine({ kind, onComplete, reducedMotion }: MiniGameProps) {
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);
  const hold = useHold(!done);
  const [burst, setBurst] = useState(0);
  const [t, setT] = useState(0);

  useRaf((dt, now) => {
    setT(now / 1000);
    if (!hold.ref.current || done) return;
    const v = Math.min(1, levelRef.current + ENGINE_RATE * dt);
    levelRef.current = v;
    setLevel(v);
    if (v >= 1) {
      setBurst(1);
      finish(600);
    }
  });

  const pouring = hold.holding && !done;
  const needle = -90 + level * 180;
  const shakeX = done ? Math.sin(t * 40) * 1.2 : 0;

  return (
    <GameShell kind={kind} label="Fuel the engine" reducedMotion={reducedMotion} onKey={(k: KeyInput) => hold.key(k)} status={`Tank ${Math.round(level * 100)} percent`}>
      <Stage
        ids={ids}
        tone={C.warn}
        tone2={C.teal}
        defs={
          <>
            <linearGradient id={ids.id('fuel')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#99f6e4" />
              <stop offset="1" stopColor="#0d9488" />
            </linearGradient>
            <linearGradient id={ids.id('can')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#b91c1c" />
              <stop offset="0.35" stopColor="#ef4444" />
              <stop offset="1" stopColor="#7f1d1d" />
            </linearGradient>
          </>
        }
      >
        <Caption text="LOWER ENGINE" tone={C.warn} />
        {/* engine block */}
        <g transform={`translate(${shakeX} 0)`}>
          <rect x={36} y={120} width={250} height={170} rx={18} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={2} />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x={58 + i * 54} y={92} width={40} height={36} rx={6} fill="#334155" stroke="#475569" />
              <rect x={64 + i * 54} y={84} width={28} height={10} rx={3} fill="#475569" />
            </g>
          ))}
          {Array.from({ length: 7 }, (_, i) => (
            <rect key={i} x={52} y={140 + i * 18} width={70} height={7} rx={3} fill="#0b1222" opacity={0.6} />
          ))}
          {/* fuel gauge */}
          <g transform="translate(206 210)">
            <circle r={58} fill="#04070d" stroke="#334155" strokeWidth={4} />
            <path d="M-50 0 A50 50 0 0 1 -25 -43.3" stroke={C.bad} strokeWidth={8} fill="none" />
            <path d="M-25 -43.3 A50 50 0 0 1 25 -43.3" stroke={C.warn} strokeWidth={8} fill="none" />
            <path d="M25 -43.3 A50 50 0 0 1 50 0" stroke={C.good} strokeWidth={8} fill="none" />
            <text x={-40} y={22} fontSize={11} fontWeight={900} fill={C.bad}>
              E
            </text>
            <text x={32} y={22} fontSize={11} fontWeight={900} fill={C.good}>
              F
            </text>
            <g style={{ transform: `rotate(${needle}deg)` }} className="mmg-fast">
              <path d="M-3 0 L0 -46 L3 0 Z" fill="#f8fafc" />
            </g>
            <circle r={7} fill="#94a3b8" />
            <text y={40} textAnchor="middle" fontSize={11} fontWeight={800} fill={C.ink} className="mmg-mono">
              {Math.round(level * 100)}%
            </text>
          </g>
          {/* filler neck */}
          <rect x={250} y={100} width={30} height={28} rx={6} fill="#1f2937" stroke="#64748b" />
          <ellipse cx={265} cy={100} rx={18} ry={6} fill="#0b0f1a" stroke={pouring ? C.tealHi : '#64748b'} strokeWidth={pouring ? 2 : 1} />
          {done && <ellipse cx={265} cy={96} rx={18} ry={6} fill={C.warn} className="mmg-pop" />}
          <text x={265} y={90} textAnchor="middle" fontSize={8} fontWeight={900} fill={C.warn} opacity={done ? 0 : 0.8}>
            FUEL
          </text>
          {/* status lights */}
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={64 + i * 22} cy={274} r={6} fill={level > (i + 1) / 3.2 ? C.good : '#1e293b'} filter={level > (i + 1) / 3.2 ? ids.url('glow') : undefined} />
          ))}
        </g>
        {/* exhaust puffs when done */}
        {done &&
          [0, 1, 2].map((i) => <circle key={i} className="mmg-float" cx={30 + i * 10} cy={110 - i * 14} r={10 + i * 4} fill="#94a3b8" opacity={0.25} style={{ animationDuration: '1.2s', animationDelay: `${i * 0.2}s` }} />)}
        {/* can (tilts when pouring) */}
        {/* jerry can, pivoting about its spout tip (local origin) */}
        <g transform="translate(302 84)">
          <g className="mmg-spring" style={{ transform: `rotate(${pouring ? -36 : 10}deg)` }}>
            <g transform="scale(0.8)">
              <ellipse cx={78} cy={140} rx={58} ry={8} fill="#000" opacity={pouring ? 0 : 0.35} />
              <path d="M2 -6 L30 -16 L34 2 L4 6 Z" fill="#1f2937" stroke="#64748b" strokeWidth={1.5} />
              <rect x={-4} y={-8} width={9} height={16} rx={3} fill="#475569" />
              <path d="M24 -6 q0 -16 16 -16 h52 l14 -12 h20 l6 12 q12 0 12 16 v124 q0 9 -9 9 h-102 q-9 0 -9 -9 Z" fill={ids.url('can')} stroke="#450a0a" strokeWidth={2} />
              <rect x={62} y={-14} width={40} height={12} rx={6} fill="#450a0a" opacity={0.6} />
              <path d="M36 118 l92 -92" stroke="#fff" strokeOpacity={0.1} strokeWidth={12} />
              <rect x={48} y={14} width={64} height={90} rx={10} fill="#0a0f1a" opacity={0.75} />
              <rect x={51} y={17 + 84 * level} width={58} height={84 * (1 - level)} rx={8} fill={ids.url('fuel')} />
              <text x={80} y={124} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fecaca" opacity={0.8}>
                BERRYFUEL
              </text>
            </g>
          </g>
        </g>
        {pouring && (
          <g>
            <path d={`M300 ${90} Q 284 ${86 + Math.sin(t * 20) * 2} 268 ${100}`} stroke="#5eead4" strokeWidth={6} fill="none" strokeLinecap="round" filter={ids.url('glow')} />
            {[0, 1].map((i) => (
              <circle key={i} className="mmg-drip" cx={267} cy={100 + i * 5} r={3} fill="#ccfbf1" style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </g>
        )}
        {burst > 0 && <Burst k={burst} x={265} y={98} color={C.warn} />}
        {/* hold button */}
        <g className={done ? undefined : 'mmg-hit'} {...hold.pointer}>
          <rect x={322} y={290} width={140} height={56} rx={28} fill="#000" opacity={0.35} transform="translate(0 4)" />
          <g className="mmg-fast" style={{ transform: `translateY(${pouring ? 3 : 0}px)` }}>
            <rect x={322} y={290} width={140} height={56} rx={28} fill={pouring ? C.teal : done ? '#134e4a' : C.cobalt} stroke="#fff" strokeOpacity={0.3} className="mmg-fill-t" />
            <rect x={332} y={294} width={120} height={18} rx={9} fill="#fff" opacity={0.15} />
            <text x={392} y={324} textAnchor="middle" fontSize={14} fontWeight={900} fill="#fff" letterSpacing={0.8}>
              {done ? 'VROOM!' : pouring ? 'POURING…' : 'HOLD TO POUR'}
            </text>
          </g>
          <FocusRing x={322} y={290} w={140} h={56} r={28} show={!done} />
        </g>
        <rect x={300} y={50} width={170} height={210} fill="transparent" className={done ? undefined : 'mmg-hit'} {...hold.pointer} />
      </Stage>
    </GameShell>
  );
}
