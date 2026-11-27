import { useRef, useState } from 'react';
import { Berry, Burst, C, Caption, FocusRing, GameShell, Stage, useFinish, useHold, useIds, useRaf, type KeyInput } from './kit';
import type { MiniGameProps } from './types';

export const FUEL_RATE = 0.4; // fraction per second while held

export default function FuelCan({ kind, onComplete, reducedMotion }: MiniGameProps) {
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const [level, setLevel] = useState(0);
  const levelRef = useRef(0);
  const hold = useHold(!done, [], 'pour');
  const [burst, setBurst] = useState(0);
  const [t, setT] = useState(0);

  useRaf((dt, now) => {
    setT(now / 1000);
    if (!hold.ref.current || done) return;
    const v = Math.min(1, levelRef.current + FUEL_RATE * dt);
    levelRef.current = v;
    setLevel(v);
    if (v >= 1) {
      setBurst(1);
      finish(450);
    }
  });

  const onKey = (k: KeyInput) => {
    hold.key(k);
  };
  const pouring = hold.holding && !done;
  const litres = (level * 20).toFixed(1);
  const canTop = 120;
  const canH = 180;
  const liqH = level * (canH - 34);
  const wob = pouring ? Math.sin(t * 14) * 2.5 : 0;

  return (
    <GameShell kind={kind} label="Fill the fuel can" reducedMotion={reducedMotion} onKey={onKey} status={`${Math.round(level * 100)} percent full`}>
      <Stage
        ids={ids}
        tone={C.teal}
        tone2={C.warn}
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
            <clipPath id={ids.id('win')}>
              <rect x={292} y={canTop + 24} width={56} height={canH - 34} rx={8} />
            </clipPath>
          </>
        }
      >
        <Caption text="ENGINE BAY · BERRYFUEL" tone={C.tealHi} />
        {/* pump */}
        <g>
          <rect x={40} y={70} width={120} height={230} rx={16} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
          <rect x={56} y={90} width={88} height={56} rx={8} fill="#04070d" stroke="#1e3a5f" />
          <text x={136} y={112} textAnchor="end" fontSize={20} fontWeight={800} className="mmg-mono" fill={C.tealHi}>
            {litres}
          </text>
          <text x={136} y={134} textAnchor="end" fontSize={9} fontWeight={800} fill={C.muted}>
            LITRES · 20.0 MAX
          </text>
          <g transform="translate(100 196)">
            <Berry kind="rasp" r={22} face />
          </g>
          <text x={100} y={246} textAnchor="middle" fontSize={10} fontWeight={900} fill={C.berryHi} letterSpacing={1}>
            BERRYFUEL
          </text>
          <text x={100} y={262} textAnchor="middle" fontSize={8} fill={C.muted}>
            100% juice-powered
          </text>
          <rect x={52} y={300} width={96} height={14} rx={4} fill="#1e293b" />
        </g>
        {/* hose */}
        <path d={`M160 220 C 230 240, 220 ${70 + wob}, 300 ${86 + wob}`} stroke="#0b0f1a" strokeWidth={12} fill="none" strokeLinecap="round" />
        <path d={`M160 220 C 230 240, 220 ${70 + wob}, 300 ${86 + wob}`} stroke="#334155" strokeWidth={7} fill="none" strokeLinecap="round" />
        <g transform={`translate(300 ${86 + wob}) rotate(${pouring ? 28 : 15})`} className="mmg-fast">
          <rect x={-6} y={-10} width={44} height={18} rx={5} fill="#1f2937" stroke="#64748b" />
          <rect x={34} y={-3} width={22} height={7} rx={2} fill="#94a3b8" />
          <rect x={2} y={6} width={18} height={14} rx={3} fill="#475569" />
        </g>
        {pouring && <rect x={348} y={108 + wob} width={7} height={canTop - 108 + 26} rx={3.5} fill="#5eead4" opacity={0.85} filter={ids.url('glow')} />}
        {/* can */}
        <g>
          <ellipse cx={320} cy={canTop + canH + 6} rx={78} ry={10} fill="#000" opacity={0.4} />
          <path d={`M258 ${canTop + 20} q0 -20 20 -20 h48 l24 -14 h22 l6 14 q16 0 16 20 v${canH - 20} q0 10 -10 10 h-116 q-10 0 -10 -10 Z`} fill={ids.url('can')} stroke="#450a0a" strokeWidth={2} />
          <rect x={340} y={canTop - 18} width={22} height={12} rx={3} fill="#1f2937" />
          <path d={`M272 ${canTop + 6} h38 v18 h-38 z`} fill="none" stroke="#450a0a" strokeWidth={6} strokeLinejoin="round" opacity={0.5} />
          {/* window */}
          <rect x={290} y={canTop + 22} width={60} height={canH - 30} rx={10} fill="#0a0f1a" stroke="#fca5a5" strokeOpacity={0.5} />
          <g clipPath={ids.url('win')}>
            <rect x={292} y={canTop + 24 + (canH - 34) - liqH} width={56} height={liqH + 4} fill={ids.url('fuel')} />
            {level > 0.02 && <path d={`M292 ${canTop + 24 + (canH - 34) - liqH} q14 ${-4 + wob} 28 0 t28 0`} stroke="#ccfbf1" strokeWidth={2} fill="none" />}
            {pouring &&
              [0, 1, 2, 3].map((i) => <circle key={i} className="mmg-float" cx={300 + i * 13} cy={canTop + canH - 20 - i * 9} r={2 + (i % 2)} fill="#ccfbf1" opacity={0.7} style={{ animationDuration: '0.8s', animationDelay: `${i * 0.13}s` }} />)}
          </g>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={350} x2={358} y1={canTop + 24 + (canH - 34) * (1 - f)} y2={canTop + 24 + (canH - 34) * (1 - f)} stroke="#fecaca" strokeWidth={2} />
          ))}
          <text x={320} y={canTop + canH - 2} textAnchor="middle" fontSize={8} fontWeight={900} fill="#fecaca" opacity={0.8}>
            {Math.round(level * 100)}%
          </text>
        </g>
        {burst > 0 && <Burst k={burst} x={320} y={canTop + 40} color={C.tealHi} />}
        {/* hold button */}
        <g className={done ? undefined : 'mmg-hit'} {...hold.pointer}>
          <rect x={176} y={292} width={128} height={56} rx={28} fill="#000" opacity={0.35} transform="translate(0 4)" />
          <g className="mmg-fast" style={{ transform: `translateY(${pouring ? 3 : 0}px)` }}>
            <rect x={176} y={292} width={128} height={56} rx={28} fill={pouring ? C.teal : done ? '#134e4a' : C.cobalt} stroke="#fff" strokeOpacity={0.3} className="mmg-fill-t" />
            <rect x={186} y={296} width={108} height={18} rx={9} fill="#fff" opacity={0.15} />
            <text x={240} y={326} textAnchor="middle" fontSize={14} fontWeight={900} fill="#fff" letterSpacing={0.8}>
              {done ? 'FULL!' : pouring ? 'FILLING…' : 'HOLD TO FILL'}
            </text>
          </g>
          <FocusRing x={176} y={292} w={128} h={56} r={28} show={!done} />
        </g>
      </Stage>
    </GameShell>
  );
}
