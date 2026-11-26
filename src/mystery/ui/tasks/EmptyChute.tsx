import { useMemo, useRef, useState } from 'react';
import { Burst, C, Caption, FocusRing, GameShell, Stage, useFinish, useHold, useIds, useRaf, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const CHUTE_RATE = 0.42;

type Junk = { kind: 'paper' | 'pit' | 'tape' | 'cup' | 'stem'; x: number; y: number; rot: number; color: string };

export function genEmptyChute(seed: number): Junk[] {
  const r = makeRng(seed, 2020);
  const kinds: Junk['kind'][] = ['paper', 'pit', 'tape', 'cup', 'stem'];
  const colors = ['#e2e8f0', C.berry, C.warn, '#94a3b8', C.leaf, C.marionHi, '#f8fafc'];
  return Array.from({ length: 14 }, (_, i) => ({
    kind: r.pick(kinds),
    // stacked from the bottom of the chute up
    x: 176 + r.range(-34, 34),
    y: 226 - Math.floor(i / 3) * 34 + r.range(-6, 6),
    rot: r.range(0, 360),
    color: r.pick(colors),
  }));
}

export default function EmptyChute({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const junk = useMemo(() => genEmptyChute(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const [p, setP] = useState(0);
  const pRef = useRef(0);
  const hold = useHold(!done, ['down']);
  const [burst, setBurst] = useState(0);

  useRaf((dt) => {
    if (!hold.ref.current || done) return;
    const v = Math.min(1, pRef.current + CHUTE_RATE * dt);
    pRef.current = v;
    setP(v);
    if (v >= 1) {
      setBurst(1);
      finish(450);
    }
  });

  const open = hold.holding && !done;
  const fallen = Math.floor(p * junk.length + 0.0001);

  return (
    <GameShell kind={kind} label="Empty the chute: hold the lever" reducedMotion={reducedMotion} onKey={(k: KeyInput) => hold.key(k)} status={`${Math.round(p * 100)} percent emptied`}>
      <Stage ids={ids} tone={C.cobalt} tone2={C.berry}>
        <Caption text="STORAGE · TRASH CHUTE" />
        {/* chute body */}
        <rect x={118} y={46} width={116} height={212} rx={10} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={2} />
        <rect x={128} y={56} width={96} height={192} rx={6} fill="#060a14" />
        {/* junk inside / falling */}
        {junk.map((j, i) => {
          // the bottom-most items fall first
          const out = i < fallen;
          const landX = 156 + (i % 5) * 16;
          const landY = 316 - Math.floor(i / 5) * 9;
          return (
            <g key={i} className="mmg-ease" style={{ transform: out ? `translate(${landX}px,${landY}px) rotate(${j.rot + 90}deg) scale(0.62)` : `translate(${j.x}px,${j.y + (Math.floor(i / 3) - Math.floor((i - fallen) / 3)) * 34}px) rotate(${j.rot}deg)`, transition: out ? 'transform 420ms cubic-bezier(.55,0,1,.45)' : undefined }}>
              <JunkArt j={j} />
            </g>
          );
        })}
        <rect x={128} y={56} width={96} height={192} rx={6} fill={ids.url('glass')} pointerEvents="none" />
        {/* hatch */}
        <g transform="translate(118 258)">
          <g className="mmg-spring" style={{ transform: `rotate(${open ? 70 : 0}deg)` }}>
            <rect x={0} y={-6} width={116} height={12} rx={4} fill="#475569" stroke="#64748b" />
            <rect x={6} y={-3} width={104} height={3} fill={C.warn} opacity={0.6} />
          </g>
        </g>
        {/* cart */}
        <path d="M120 296 h112 l-10 46 h-92 Z" fill="#1e293b" stroke="#475569" strokeWidth={2} />
        <circle cx={140} cy={346} r={6} fill="#334155" />
        <circle cx={212} cy={346} r={6} fill="#334155" />
        {/* fill gauge */}
        <g transform="translate(270 40)">
          <rect width={20} height={220} rx={10} fill="#0a1020" stroke="#2a3a62" />
          <rect x={3} y={3 + 214 * p} width={14} height={214 * (1 - p)} rx={7} fill={p > 0.75 ? C.good : C.warn} filter={ids.url('glow')} />
          <text x={10} y={240} textAnchor="middle" fontSize={10} fontWeight={900} fill={C.muted}>
            {Math.round((1 - p) * 100)}%
          </text>
          <text x={10} y={254} textAnchor="middle" fontSize={8} fontWeight={800} fill={C.muted}>
            FULL
          </text>
        </g>
        {burst > 0 && <Burst k={burst} x={176} y={300} color={C.tealHi} />}
        {/* lever */}
        <g className={done ? undefined : 'mmg-grab'} {...hold.pointer}>
          <rect x={318} y={44} width={150} height={262} rx={16} fill="transparent" />
          <rect x={360} y={64} width={64} height={226} rx={14} fill={ids.url('metal')} stroke="#4a5d8a" />
          <rect x={386} y={80} width={12} height={194} rx={6} fill="#04070d" />
          <g className="mmg-spring" style={{ transform: `translateY(${open || done ? 160 : 0}px)` }}>
            <rect x={366} y={76} width={52} height={30} rx={10} fill={open ? C.berry : C.cobalt} stroke="#fff" strokeOpacity={0.4} filter={ids.url('glow')} className="mmg-fill-t" />
            <rect x={372} y={80} width={40} height={8} rx={4} fill="#fff" opacity={0.25} />
          </g>
          <text x={392} y={326} textAnchor="middle" fontSize={11} fontWeight={900} fill={open ? C.berryHi : C.muted} letterSpacing={0.6}>
            {done ? 'ALL CLEAR' : open ? 'DUMPING…' : 'HOLD LEVER ↓'}
          </text>
          <FocusRing x={360} y={64} w={64} h={226} r={14} show={!done} />
        </g>
      </Stage>
    </GameShell>
  );
}

function JunkArt({ j }: { j: Junk }) {
  switch (j.kind) {
    case 'paper':
      return <path d="M-14 -10 L2 -15 L14 -6 L12 10 L-2 14 L-14 6 Z" fill={j.color} stroke="#64748b" strokeWidth={1} />;
    case 'pit':
      return <ellipse rx={9} ry={12} fill="#7c2d12" stroke="#431407" />;
    case 'tape':
      return (
        <g>
          <circle r={12} fill="none" stroke={j.color} strokeWidth={6} />
          <circle r={5} fill="#1f2937" />
        </g>
      );
    case 'cup':
      return (
        <g>
          <path d="M-10 -12 h20 l-3 24 h-14 Z" fill="#f8fafc" stroke="#94a3b8" />
          <rect x={-10} y={-3} width={20} height={6} fill={C.berry} />
        </g>
      );
    case 'stem':
      return <path d="M-12 8 Q0 -4 12 -10 M12 -10 l-6 -6 M12 -10 l4 -7" stroke={C.leaf} strokeWidth={4} strokeLinecap="round" fill="none" />;
  }
}
