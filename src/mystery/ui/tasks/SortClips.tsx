import { useMemo, useRef, useState } from 'react';
import { Berry, Burst, C, Caption, GameShell, Meter, Stage, Toast, capture, svgPoint, tsfx, useBump, useFinish, useIds, useTimers, type Ids, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export type ClipDefect = 'blur' | 'tilt' | 'over' | 'cap' | 'thumb';
export interface Clip {
  keep: boolean;
  defect: ClipDefect | null;
  take: number;
  sky: number;
  caption: string;
}

const KEEP_CAPTIONS = ['crisp take', 'golden hour', 'nailed it', 'clean audio', 'perfect framing', 'hero shot'];
const DEFECT_CAPTION: Record<ClipDefect, string> = {
  blur: 'out of focus',
  tilt: 'dutch angle (oops)',
  over: 'blown out',
  cap: 'lens cap on',
  thumb: 'thumb in shot',
};

export function genSortClips(seed: number): Clip[] {
  const r = makeRng(seed, 202);
  const n = 6;
  const keepCount = 2 + r.int(3);
  const flags = r.shuffle(Array.from({ length: n }, (_, i) => i < keepCount));
  const defects = r.shuffle<ClipDefect>(['blur', 'tilt', 'over', 'cap', 'thumb']);
  const caps = r.shuffle([...KEEP_CAPTIONS]);
  let d = 0;
  return flags.map((keep, i) => {
    const defect = keep ? null : (defects[d++ % defects.length] as ClipDefect);
    return { keep, defect, take: 1 + i + r.int(3) * 7, sky: r.int(3), caption: keep ? (caps[i % caps.length] as string) : DEFECT_CAPTION[defect as ClipDefect] };
  });
}

const SKIES = [
  ['#7dd3fc', '#c4b5fd'],
  ['#fda4af', '#fcd34d'],
  ['#93c5fd', '#5eead4'],
] as const;

export default function SortClips({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const clips = useMemo(() => genSortClips(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [idx, setIdx] = useState(0);
  const [fly, setFly] = useState<null | 0 | 1>(null);
  const [drag, setDrag] = useState<{ x0: number; dx: number } | null>(null);
  const [shake, bumpShake] = useBump();
  const [toast, setToast] = useState({ k: 0, text: '' });
  const [burst, setBurst] = useState({ k: 0, side: 0 });
  const [counts, setCounts] = useState<[number, number]>([0, 0]);
  const clip = clips[idx];
  const busy = fly !== null || done;

  const choose = (side: 0 | 1) => {
    if (busy || !clip) return;
    setDrag(null);
    if ((side === 0) !== clip.keep) {
      tsfx('bad');
      bumpShake();
      setToast((t) => ({ k: t.k + 1, text: side === 0 ? `Greek: "${clip.caption}"? Outtake!` : 'Greek: that one is a keeper!' }));
      return;
    }
    setFly(side);
    tsfx(side === 0 ? 'good' : 'drop', (idx + 1) / clips.length);
    setBurst((b) => ({ k: b.k + 1, side }));
    setCounts((c) => (side === 0 ? [c[0] + 1, c[1]] : [c[0], c[1] + 1]));
    later(() => {
      setFly(null);
      const n = idx + 1;
      setIdx(n);
      if (n >= clips.length) finish(300);
    }, 380);
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || k.repeat) return;
    if (k.dir === 'left') choose(0);
    else if (k.dir === 'right') choose(1);
  };

  const dx = drag?.dx ?? 0;
  const tf = fly === 0 ? 'translate(70px,200px) scale(0.28) rotate(-12deg)' : fly === 1 ? 'translate(410px,200px) scale(0.28) rotate(12deg)' : `translate(${240 + dx}px,168px) rotate(${dx * 0.06}deg)`;

  return (
    <GameShell kind={kind} label="Sort clips: keepers left, outtakes right" reducedMotion={reducedMotion} onKey={onKey} status={clip ? `Take ${clip.take}: ${clip.caption}` : 'Sorted'}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.marion}
        tone2={C.berry}
        onPointerMove={(e) => {
          if (!drag) return;
          const p = svgPoint(svg.current, e);
          setDrag({ x0: drag.x0, dx: Math.max(-170, Math.min(170, p.x - drag.x0)) });
        }}
        onPointerUp={() => {
          if (!drag) return;
          if (drag.dx < -70) choose(0);
          else if (drag.dx > 70) choose(1);
          setDrag(null);
        }}
      >
        <Caption text="GREEK'S CUTTING ROOM" tone={C.marionHi} />
        <Bin x={14} label="KEEPERS" sub="← swipe" color={C.tealHi} count={counts[0]} glow={dx < -40} onPress={() => choose(0)} />
        <Bin x={356} label="OUTTAKES" sub="swipe →" color={C.berryHi} count={counts[1]} glow={dx > 40} onPress={() => choose(1)} />
        {clip && (
          <g key={`${idx}-${shake}`} className={shake ? 'mmg-shake' : undefined}>
            <g className={drag ? undefined : 'mmg-ease'} style={{ transform: tf, opacity: fly !== null ? 0.25 : 1 }}>
              <g
                className="mmg-grab"
                onPointerDown={(e) => {
                  if (busy) return;
                  capture(e);
                  const p = svgPoint(svg.current, e);
                  setDrag({ x0: p.x, dx: 0 });
                }}
              >
                <g className="mmg-pop">
                  <ClipCard clip={clip} ids={ids} />
                </g>
              </g>
            </g>
          </g>
        )}
        {burst.k > 0 && <Burst k={burst.k} x={burst.side === 0 ? 70 : 410} y={200} color={burst.side === 0 ? C.tealHi : C.berryHi} />}
        <Meter x={150} y={318} w={180} value={idx / clips.length} ids={ids} color={C.marionHi} label={`RENDER ${Math.round((idx / clips.length) * 100)}%`} />
        <Toast k={toast.k} text={toast.text} tone={C.berryHi} y={58} />
      </Stage>
    </GameShell>
  );
}

function Bin({ x, label, sub, color, count, glow, onPress }: { x: number; label: string; sub: string; color: string; count: number; glow: boolean; onPress: () => void }) {
  return (
    <g className="mmg-hit" onPointerDown={onPress}>
      <rect x={x} y={92} width={110} height={190} rx={14} fill={color} opacity={glow ? 0.2 : 0.07} className="mmg-fill-t" />
      <rect x={x} y={92} width={110} height={190} rx={14} fill="none" stroke={color} strokeOpacity={glow ? 0.95 : 0.45} strokeWidth={2} strokeDasharray="6 5" />
      {/* film canisters stacked */}
      {Array.from({ length: Math.min(count, 4) }, (_, i) => (
        <g key={i} transform={`translate(${x + 55} ${262 - i * 16})`}>
          <ellipse rx={30} ry={7} fill="#1f2937" stroke={color} strokeOpacity={0.6} />
          <rect x={-30} y={-10} width={60} height={10} fill="#111827" />
          <ellipse cy={-10} rx={30} ry={7} fill="#374151" stroke={color} strokeOpacity={0.7} />
        </g>
      ))}
      <text x={x + 55} y={122} textAnchor="middle" fontSize={13} fontWeight={900} fill={color} letterSpacing={1.2}>
        {label}
      </text>
      <text x={x + 55} y={140} textAnchor="middle" fontSize={10} fontWeight={600} fill={C.muted}>
        {sub}
      </text>
      <text x={x + 55} y={190} textAnchor="middle" fontSize={30} fontWeight={900} fill={color} opacity={0.85}>
        {count}
      </text>
    </g>
  );
}

function ClipCard({ clip, ids }: { clip: Clip; ids: Ids }) {
  const sky = SKIES[clip.sky] ?? SKIES[0];
  const fid = ids.id(`clipblur`);
  const cid = ids.id(`clipclip`);
  const gid = ids.id(`sky${clip.sky}`);
  const scene = (
    <g>
      <rect x={-86} y={-52} width={172} height={98} fill={`url(#${gid})`} />
      <circle cx={52} cy={-26} r={14} fill="#fff7cc" opacity={0.95} />
      <path d="M-86 22 Q-40 -8 0 14 T86 8 V46 H-86Z" fill="#22c55e" />
      <path d="M-86 32 Q-30 14 30 30 T86 26 V46 H-86Z" fill="#15803d" />
      <Berry kind="rasp" r={15} face x={-18} y={8} />
      <Berry kind="blue" r={10} face x={16} y={20} />
    </g>
  );
  return (
    <g filter={ids.url('shadow')}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
        <filter id={fid}>
          <feGaussianBlur stdDeviation="3.4" />
        </filter>
        <clipPath id={cid}>
          <rect x={-86} y={-52} width={172} height={98} rx={4} />
        </clipPath>
      </defs>
      <rect x={-102} y={-78} width={204} height={156} rx={10} fill="#0b0f1a" stroke="#4b5b85" strokeWidth={1.5} />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <rect x={-94 + i * 22} y={-73} width={12} height={8} rx={2} fill="#1f2a44" />
          <rect x={-94 + i * 22} y={50} width={12} height={8} rx={2} fill="#1f2a44" />
        </g>
      ))}
      <g clipPath={`url(#${cid})`}>
        {clip.defect === 'blur' ? (
          <g filter={`url(#${fid})`}>{scene}</g>
        ) : clip.defect === 'tilt' ? (
          <g transform="rotate(-17) scale(1.25)">{scene}</g>
        ) : clip.defect === 'cap' ? (
          <g>
            <rect x={-86} y={-52} width={172} height={98} fill="#05070c" />
            <text x={0} y={2} textAnchor="middle" fontSize={11} fill="#334155" fontWeight={700}>
              ...hello?
            </text>
          </g>
        ) : (
          scene
        )}
        {clip.defect === 'over' && <rect x={-86} y={-52} width={172} height={98} fill="#fff" opacity={0.8} />}
        {clip.defect === 'thumb' && <ellipse cx={-62} cy={30} rx={46} ry={60} fill="#f4a6a6" stroke="#e78b8b" strokeWidth={2} transform="rotate(-25 -62 30)" />}
        <rect x={-80} y={-46} width={30} height={12} rx={3} fill="#000" opacity={0.45} />
        <circle cx={-74} cy={-40} r={2.6} fill="#ef4444" className="mmg-blink" />
        <text x={-68} y={-37} fontSize={7.5} fontWeight={800} fill="#fff">
          REC
        </text>
      </g>
      <rect x={-86} y={-52} width={172} height={98} rx={4} fill="none" stroke="#fff" strokeOpacity={0.15} />
      <text x={-86} y={72} fontSize={10.5} fontWeight={800} fill="#cbd5e1" letterSpacing={0.6}>
        TAKE {clip.take}
      </text>
      <text x={86} y={72} textAnchor="end" fontSize={10.5} fontWeight={700} fill="#e2e8f0" fontStyle="italic">
        {clip.caption}
      </text>
    </g>
  );
}
