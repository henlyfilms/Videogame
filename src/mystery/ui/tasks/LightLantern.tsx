import { useMemo, useRef, useState } from 'react';
import { Berry, Burst, C, Caption, FocusRing, GameShell, Stage, Toast, capture, clamp, svgPoint, useBump, useFinish, useHold, useIds, useRaf, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const WICK_S = 0.7;

export function genLightLantern(seed: number) {
  const r = makeRng(seed, 2525);
  return { strikes: 1 + r.int(3), glass: r.pick([C.warn, C.berryHi, C.tealHi, C.marionHi]) };
}

const STRIKER = { x0: 40, x1: 210, y: 286 };
const WICK = { x: 362, y: 170 };

type Phase = 'strike' | 'lit' | 'done';

export default function LightLantern({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genLightLantern(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [phase, setPhase] = useState<Phase>('strike');
  const [tries, setTries] = useState(0);
  const [striking, setStriking] = useState(false);
  const [spark, bumpSpark] = useBump();
  const [fizz, bumpFizz] = useBump();
  const [wick, setWick] = useState(0);
  const wickRef = useRef(0);
  const hold = useHold(phase === 'lit');
  const drag = useRef<{ x0: number; struck: boolean } | null>(null);
  const [burst, setBurst] = useState(0);
  const [matchPos, setMatchPos] = useState<{ x: number; y: number } | null>(null);

  const strike = () => {
    if (phase !== 'strike' || striking) return;
    setStriking(true);
    bumpSpark();
    const n = tries + 1;
    setTries(n);
    later(() => {
      setStriking(false);
      if (n >= g.strikes) setPhase('lit');
      else bumpFizz();
    }, 260);
  };

  useRaf(
    (dt) => {
      const v = clamp(wickRef.current + (hold.ref.current ? dt / WICK_S : -dt / 1.5), 0, 1);
      if (v === wickRef.current) return;
      wickRef.current = v;
      setWick(v);
      if (v >= 1) {
        setPhase('done');
        setBurst(1);
        finish(500);
      }
    },
    phase === 'lit',
  );

  const onKey = (k: KeyInput) => {
    if (phase === 'strike') {
      if (k.down && !k.repeat && (k.action || k.dir === 'right')) strike();
      return k.action || k.dir === 'right';
    }
    if (phase === 'lit') return hold.key(k);
  };

  const lit = phase !== 'strike';
  const atWick = (hold.holding && phase === 'lit') || phase === 'done';
  const restX = STRIKER.x0 + 30;
  const mx = matchPos?.x ?? (atWick ? WICK.x - 30 : striking ? STRIKER.x1 - 20 : lit ? 150 : restX);
  const my = matchPos?.y ?? (atWick ? WICK.y + 26 : striking ? STRIKER.y - 6 : lit ? 200 : STRIKER.y - 8);
  const glow = phase === 'done' ? 1 : wick * 0.5;

  return (
    <GameShell kind={kind} label="Light the lantern: strike a match, then light the wick" reducedMotion={reducedMotion} onKey={onKey} status={phase === 'strike' ? 'Strike the match' : phase === 'lit' ? 'Hold the flame to the wick' : 'Lantern lit'}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={phase === 'done' ? C.warn : '#1e293b'}
        tone2={g.glass}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const p = svgPoint(svg.current, e);
          setMatchPos(p);
          if (phase === 'strike' && !d.struck && Math.abs(p.y - STRIKER.y) < 40 && p.x - d.x0 > 70) {
            d.struck = true;
            strike();
          }
          if (phase === 'lit') {
            const near = Math.hypot(p.x - (WICK.x - 30), p.y - (WICK.y + 26)) < 60;
            hold.set(near);
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          setMatchPos(null);
          hold.set(false);
          if (d && !d.struck && phase === 'strike') strike(); // a tap strikes too
        }}
        defs={
          <radialGradient id={ids.id('warm')} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fde68a" stopOpacity="0.85" />
            <stop offset="0.4" stopColor={g.glass} stopOpacity="0.35" />
            <stop offset="1" stopColor={g.glass} stopOpacity="0" />
          </radialGradient>
        }
      >
        <rect width={480} height={360} fill="#02040a" opacity={0.55 - glow * 0.45} pointerEvents="none" />
        <circle cx={WICK.x} cy={WICK.y} r={60 + glow * 170} fill={ids.url('warm')} opacity={0.2 + glow * 0.8} pointerEvents="none" />
        <Caption text="LIGHTS OUT · LANTERN" tone={phase === 'done' ? C.warn : C.muted} />
        {/* side table + crates (cozy HQ storeroom) */}
        <rect x={258} y={232} width={208} height={12} rx={4} fill="#3b2a1c" stroke="#7c5a3a" />
        <rect x={272} y={244} width={10} height={70} fill="#2b1d14" />
        <rect x={442} y={244} width={10} height={70} fill="#2b1d14" />
        <g opacity={0.55 + glow * 0.45}>
          <rect x={292} y={262} width={64} height={50} rx={4} fill="#3b2a1c" stroke="#7c5a3a" />
          <path d="M292 287 h64" stroke="#7c5a3a" />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={306 + i * 18} cy={258} r={8} fill={i === 1 ? C.marion : C.berry} />
          ))}
        </g>
        {phase === 'lit' && !hold.holding && (
          <path d={`M180 196 Q 260 120 ${WICK.x - 46} ${WICK.y + 12}`} stroke="#fde68a" strokeOpacity={0.6} strokeWidth={2.5} strokeDasharray="6 6" fill="none" className="mmg-dash" />
        )}
        {/* lantern (press & hold it once the match is lit) */}
        <g className={phase === 'lit' ? 'mmg-hit' : undefined} {...(phase === 'lit' ? hold.pointer : {})}>
          <rect x={WICK.x - 60} y={50} width={120} height={190} fill="transparent" />
          <path d={`M${WICK.x - 22} 70 q22 -26 44 0`} stroke="#94a3b8" strokeWidth={4} fill="none" />
          <rect x={WICK.x - 44} y={70} width={88} height={16} rx={6} fill="#334155" stroke="#64748b" />
          <rect x={WICK.x - 38} y={86} width={76} height={128} rx={14} fill={g.glass} fillOpacity={0.08 + glow * 0.28} stroke={g.glass} strokeOpacity={0.5 + glow * 0.5} strokeWidth={2} />
          {[WICK.x - 38, WICK.x + 30].map((x) => (
            <rect key={x} x={x} y={86} width={8} height={128} fill="#334155" />
          ))}
          <rect x={WICK.x - 48} y={212} width={96} height={20} rx={6} fill="#334155" stroke="#64748b" />
          <rect x={WICK.x - 6} y={WICK.y} width={12} height={40} rx={3} fill="#f8fafc" opacity={0.85} />
          <path d={`M${WICK.x} ${WICK.y} v-8`} stroke="#1f2937" strokeWidth={2} />
          {/* lantern flame */}
          {(wick > 0.05 || phase === 'done') && (
            <g transform={`translate(${WICK.x} ${WICK.y - 8}) scale(${0.3 + glow * 0.7})`} className="mmg-flicker">
              <path d="M0 -40 C 16 -18 14 0 0 4 C -14 0 -16 -18 0 -40 Z" fill="#fb923c" filter={ids.url('glow')} />
              <path d="M0 -24 C 8 -12 7 -2 0 2 C -7 -2 -8 -12 0 -24 Z" fill="#fde68a" />
            </g>
          )}
          {/* tiny berry decal */}
          <g transform={`translate(${WICK.x} 226)`}>
            <Berry kind="rasp" r={6} leaf={false} />
          </g>
          {/* wick progress */}
          {phase === 'lit' && (
            <g>
              <circle cx={WICK.x} cy={WICK.y - 14} r={28} fill="none" stroke="#334155" strokeWidth={4} />
              <circle cx={WICK.x} cy={WICK.y - 14} r={28} fill="none" stroke={C.warn} strokeWidth={4} strokeDasharray={`${wick * 176} 176`} transform={`rotate(-90 ${WICK.x} ${WICK.y - 14})`} />
            </g>
          )}
        </g>
        {/* matchbox */}
        <g>
          <rect x={STRIKER.x0 - 10} y={STRIKER.y - 18} width={STRIKER.x1 - STRIKER.x0 + 20} height={70} rx={8} fill="#b91c1c" stroke="#7f1d1d" strokeWidth={2} />
          <rect x={STRIKER.x0} y={STRIKER.y - 8} width={STRIKER.x1 - STRIKER.x0} height={16} rx={4} fill="#57352a" />
          {Array.from({ length: 22 }, (_, i) => (
            <circle key={i} cx={STRIKER.x0 + 6 + i * 7.6} cy={STRIKER.y + (i % 2 ? 3 : -3)} r={1.4} fill="#2b1a14" />
          ))}
          <text x={(STRIKER.x0 + STRIKER.x1) / 2} y={STRIKER.y + 34} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fde68a" letterSpacing={1.4}>
            HQ SAFETY MATCHES
          </text>
          {phase === 'strike' && <FocusRing x={STRIKER.x0 - 10} y={STRIKER.y - 18} w={STRIKER.x1 - STRIKER.x0 + 20} h={70} r={8} />}
        </g>
        {spark > 0 && phase === 'strike' && <Burst k={spark} x={STRIKER.x1 - 30} y={STRIKER.y - 4} color="#fde68a" n={8} dist={24} size={2.5} />}
        {/* the match */}
        <g
          className="mmg-grab"
          style={{ transform: `translate(${mx}px,${my}px) rotate(${lit ? -40 : -8}deg)`, transition: matchPos ? undefined : striking ? 'transform 240ms cubic-bezier(.5,0,.5,1)' : 'transform 380ms cubic-bezier(.34,1.56,.64,1)' }}
          onPointerDown={(e) => {
            if (phase === 'done') return;
            capture(e);
            drag.current = { x0: svgPoint(svg.current, e).x, struck: false };
          }}
        >
          <rect x={-60} y={-24} width={90} height={48} fill="transparent" />
          <rect x={-56} y={-3} width={62} height={6} rx={2} fill="#f5d0a9" />
          <ellipse cx={8} cy={0} rx={8} ry={6} fill="#dc2626" />
          {lit && phase !== 'done' && (
            <g transform="translate(14 -2) rotate(40)" className="mmg-flicker">
              <path d="M0 -26 C 10 -12 9 0 0 3 C -9 0 -10 -12 0 -26 Z" fill="#fb923c" filter={ids.url('glow')} />
              <path d="M0 -15 C 5 -8 4 -1 0 1 C -4 -1 -5 -8 0 -15 Z" fill="#fde68a" />
            </g>
          )}
        </g>
        {burst > 0 && <Burst k={burst} x={WICK.x} y={WICK.y - 20} color="#fde68a" />}
        <text x={362} y={338} textAnchor="middle" fontSize={11.5} fontWeight={800} fill={phase === 'done' ? '#fde68a' : C.muted}>
          {phase === 'strike' ? `Strike the match${tries ? ` (try ${tries + 1})` : ''}` : phase === 'lit' ? 'Hold the flame to the wick' : 'Cozy. Very cozy.'}
        </text>
        <Toast k={fizz} text="Fssst… it fizzled. Strike again!" tone={C.warn} y={118} />
      </Stage>
    </GameShell>
  );
}
