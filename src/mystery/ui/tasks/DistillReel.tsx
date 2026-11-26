import { useMemo, useRef, useState } from 'react';
import { Burst, C, Caption, FocusCircle, FocusRing, GameShell, Stage, Toast, capture, clamp, svgPoint, useBump, useFinish, useHold, useIds, useRaf, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

const REEL_COLORS = [C.berry, C.cobaltHi, C.tealHi, C.warn, C.marionHi];
const TOPICS = ['berry farming 101', 'prompt craft tips', 'lo-fi beat theory', 'render pipelines', 'zero-fluff comms', 'tube maintenance'];

export interface Reel {
  label: string;
  color: string;
  topic: string;
}

export function genDistillReel(seed: number): { reels: Reel[]; target: number } {
  const r = makeRng(seed, 303);
  const nums = r.shuffle(Array.from({ length: 40 }, (_, i) => i + 2)).slice(0, 3);
  const cols = r.shuffle([...REEL_COLORS]);
  const topics = r.shuffle([...TOPICS]);
  const reels = nums.map((n, i) => ({ label: `REEL ${String(n).padStart(2, '0')}`, color: cols[i] as string, topic: topics[i] as string }));
  return { reels, target: r.int(3) };
}

const REEL_X = [70, 160, 250];
const REEL_Y = 282;
const FUNNEL = { x: 360, y: 74 };
const LEVER = { x: 452, y: 200, top: 112, len: 150 };

type Phase = 'pick' | 'drop' | 'lever' | 'distill' | 'done';

export default function DistillReel({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genDistillReel(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [phase, setPhaseState] = useState<Phase>('pick');
  const phaseRef = useRef<Phase>('pick');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [cursor, setCursor] = useState(0);
  const [drag, setDrag] = useState<{ i: number; x: number; y: number; moved: boolean } | null>(null);
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);
  const [dragPull, setDragPull] = useState<number | null>(null);
  const [shake, setShake] = useState({ k: 0, i: -1 });
  const [toast, bumpToast] = useBump();
  const [burst, bumpBurst] = useBump();
  const [cards, setCards] = useState(0);
  const hold = useHold(phase === 'lever', ['down']);
  const target = g.reels[g.target] as Reel;

  const tryDrop = (i: number) => {
    if (phase !== 'pick') return;
    setCursor(i);
    if (i !== g.target) {
      setShake((s) => ({ k: s.k + 1, i }));
      bumpToast();
      return;
    }
    setPhase('drop');
    later(() => {
      bumpBurst();
      setPhase('lever');
    }, 620);
  };

  const pulled = () => {
    if (phaseRef.current !== 'lever') return;
    phaseRef.current = 'distill';
    setPhase('distill');
    later(() => setCards(1), 380);
    later(() => setCards(2), 700);
    later(() => setCards(3), 1020);
    later(() => {
      setPhase('done');
      finish(300);
    }, 1250);
  };

  useRaf(
    (dt) => {
      if (dragPull !== null) return;
      const p = pullRef.current;
      const v = clamp(hold.ref.current ? p + dt / 0.55 : p - dt / 0.35, 0, 1);
      if (v === p) return;
      pullRef.current = v;
      setPull(v);
      if (v >= 1) pulled();
    },
    phase === 'lever',
  );

  const onKey = (k: KeyInput) => {
    if (phase === 'pick') {
      if (!k.down) return;
      if (k.dir === 'left') setCursor((c) => Math.max(0, c - 1));
      else if (k.dir === 'right') setCursor((c) => Math.min(2, c + 1));
      else if (k.action && !k.repeat) tryDrop(cursor);
      return;
    }
    if (phase === 'lever') hold.key(k);
  };

  const pullShown = phase === 'lever' ? (dragPull ?? pull) : phase === 'pick' || phase === 'drop' ? 0 : 1;
  const hx = LEVER.x;
  const hy = LEVER.top + pullShown * LEVER.len;

  return (
    <GameShell
      kind={kind}
      label="Distill a reel"
      reducedMotion={reducedMotion}
      onKey={onKey}
      status={phase === 'pick' ? `Find ${target.label} and drop it in the chute` : phase === 'lever' ? 'Pull the lever' : phase === 'done' ? 'Distilled' : ''}
    >
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.teal}
        tone2={C.cobalt}
        defs={
          <>
            <linearGradient id={ids.id('tank')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0e7490" stopOpacity="0.25" />
              <stop offset="1" stopColor="#14b8a6" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id={ids.id('body')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#1e2b49" />
              <stop offset="0.5" stopColor="#2a3b63" />
              <stop offset="1" stopColor="#172039" />
            </linearGradient>
          </>
        }
        onPointerMove={(e) => {
          const p = svgPoint(svg.current, e);
          if (drag) setDrag({ ...drag, x: p.x, y: p.y, moved: drag.moved || Math.hypot(p.x - (REEL_X[drag.i] ?? 0), p.y - REEL_Y) > 10 });
          if (dragPull !== null) setDragPull(clamp((p.y - LEVER.top) / LEVER.len, 0, 1));
        }}
        onPointerUp={() => {
          if (drag) {
            const near = Math.hypot(drag.x - FUNNEL.x, drag.y - FUNNEL.y - 30) < 80;
            if (near || !drag.moved) tryDrop(drag.i);
            setDrag(null);
          }
          if (dragPull !== null) {
            pullRef.current = dragPull >= 0.95 ? 1 : dragPull;
            setPull(pullRef.current);
            if (dragPull >= 0.95) pulled();
            setDragPull(null);
          }
        }}
      >
        <Caption text="SIFT'S MEDIA VAULT" tone={C.tealHi} />
        {/* queue ticket */}
        <g transform="translate(20 52) rotate(-3)">
          <rect width={150} height={58} rx={6} fill="#fef3c7" />
          <rect width={150} height={12} rx={4} fill="#fbbf24" />
          <text x={10} y={28} fontSize={9.5} fontWeight={800} fill="#92400e" letterSpacing={1}>
            DISTILL QUEUE
          </text>
          <circle cx={16} cy={44} r={6} fill={target.color} stroke="#000" strokeOpacity={0.3} />
          <text x={28} y={48} fontSize={14} fontWeight={900} fill="#1f2937" className="mmg-mono">
            {target.label}
          </text>
        </g>
        <text x={95} y={130} textAnchor="middle" fontSize={9.5} fill={C.muted}>
          "{target.topic}"
        </text>

        {/* distiller machine */}
        <g>
          <path d={`M${FUNNEL.x - 62} ${FUNNEL.y} h124 l-36 46 h-52 Z`} fill={ids.url('metal')} stroke="#5d77b0" strokeWidth={1.5} />
          <path d={`M${FUNNEL.x - 50} ${FUNNEL.y + 6} h100`} stroke={C.tealHi} strokeOpacity={phase === 'pick' ? 0.9 : 0.3} strokeWidth={3} className={phase === 'pick' ? 'mmg-pulse' : undefined} />
          <rect x={298} y={120} width={124} height={150} rx={16} fill={ids.url('body')} stroke="#4a5d8a" strokeWidth={1.5} />
          <rect x={312} y={134} width={96} height={86} rx={12} fill="#06101c" stroke="#2dd4bf" strokeOpacity={0.35} />
          <rect x={314} y={220 - 84 * (phase === 'distill' || phase === 'done' ? 0.75 : phase === 'lever' ? 0.35 : 0.12)} width={92} height={84 * (phase === 'distill' || phase === 'done' ? 0.75 : phase === 'lever' ? 0.35 : 0.12)} rx={10} fill={ids.url('tank')} className="mmg-ease" />
          {(phase === 'distill' || phase === 'lever') &&
            [0, 1, 2, 3, 4].map((i) => <circle key={i} className="mmg-float" cx={326 + i * 18} cy={200 - (i % 3) * 16} r={3 + (i % 2) * 2} fill="#99f6e4" opacity={0.7} style={{ animationDelay: `${-i * 0.4}s`, animationDuration: phase === 'distill' ? '0.6s' : '2s' }} />)}
          <rect x={312} y={134} width={96} height={86} rx={12} fill={ids.url('glass')} />
          <text x={360} y={242} textAnchor="middle" fontSize={9} fontWeight={800} fill={C.tealHi} letterSpacing={1.6}>
            DISTILLER
          </text>
          <rect x={330} y={252} width={60} height={8} rx={4} fill="#06101c" />
          {/* output insight cards */}
          {Array.from({ length: cards }, (_, i) => (
            <g key={i} className="mmg-pop" transform={`translate(${300 + i * 34} ${300 - i * 4}) rotate(${(i - 1) * 8})`}>
              <rect x={-20} y={-14} width={40} height={28} rx={4} fill="#ecfeff" stroke={C.tealHi} />
              <rect x={-14} y={-8} width={22} height={3} rx={1.5} fill={C.teal} />
              <rect x={-14} y={-1} width={28} height={2.5} rx={1.2} fill="#94a3b8" />
              <rect x={-14} y={5} width={18} height={2.5} rx={1.2} fill="#94a3b8" />
            </g>
          ))}
        </g>

        {/* lever */}
        <g
          className={phase === 'lever' ? 'mmg-grab' : undefined}
          onPointerDown={(e) => {
            if (phase !== 'lever') return;
            e.stopPropagation();
            capture(e);
            setDragPull(pull);
          }}
        >
          <rect x={LEVER.x - 7} y={LEVER.top - 6} width={14} height={LEVER.len + 12} rx={7} fill="#0a1020" stroke="#2a3a62" />
          <rect x={422} y={LEVER.y - 22} width={22} height={44} rx={6} fill={ids.url('metal')} stroke="#5d77b0" />
          <line x1={LEVER.x - 8} y1={LEVER.y} x2={hx} y2={hy} stroke="#cbd5e1" strokeWidth={7} strokeLinecap="round" />
          <circle cx={hx} cy={hy} r={phase === 'lever' ? 17 : 14} fill={phase === 'lever' ? C.berry : '#64748b'} stroke="#fff" strokeOpacity={0.5} strokeWidth={2} className={phase === 'lever' ? 'mmg-pulse' : undefined} filter={phase === 'lever' ? ids.url('glow') : undefined} />
          <circle cx={LEVER.x - 8} cy={LEVER.y} r={6} fill="#94a3b8" />
          <rect x={LEVER.x - 30} y={LEVER.top - 30} width={58} height={LEVER.len + 60} fill="transparent" />
          {phase === 'lever' && <FocusCircle x={hx} y={hy} r={18} />}
          {phase === 'lever' && (
            <text x={LEVER.x - 4} y={LEVER.top - 26} textAnchor="middle" fontSize={10} fontWeight={800} fill={C.berryHi} className="mmg-pulse">
              PULL ↓
            </text>
          )}
        </g>

        {phase === 'pick' && (
          <g pointerEvents="none">
            <path d="M250 236 Q 280 120 318 104" stroke={C.tealHi} strokeOpacity={0.5} strokeWidth={2.5} strokeDasharray="6 6" fill="none" className="mmg-dash" />
            <path d="M318 104 l-12 -2 l6 10 Z" fill={C.tealHi} fillOpacity={0.7} />
            <text x={226} y={168} textAnchor="middle" fontSize={10.5} fontWeight={800} fill={C.tealHi} opacity={0.8}>
              drop it in!
            </text>
          </g>
        )}
        {/* reels on the shelf */}
        <rect x={24} y={322} width={272} height={8} rx={4} fill="#2a3b63" />
        {g.reels.map((reel, i) => {
          const isDrag = drag?.i === i && drag.moved;
          const dropped = i === g.target && phase !== 'pick';
          const x = isDrag ? drag.x : dropped ? FUNNEL.x : (REEL_X[i] as number);
          const y = isDrag ? drag.y : dropped ? (phase === 'drop' ? FUNNEL.y + 40 : FUNNEL.y + 60) : REEL_Y;
          return (
            <g key={`${i}-${shake.i === i ? shake.k : 0}`} className={shake.i === i && shake.k ? 'mmg-shake' : undefined}>
              <g
                className={isDrag ? 'mmg-grab' : 'mmg-ease mmg-grab'}
                style={{ transform: `translate(${x}px,${y}px) scale(${dropped ? 0.4 : 1})`, opacity: dropped && phase !== 'drop' ? 0 : 1, transition: dropped ? 'transform 600ms cubic-bezier(.5,-0.4,.5,1), opacity 200ms 500ms' : undefined }}
                onPointerDown={(e) => {
                  if (phase !== 'pick') return;
                  capture(e);
                  setDrag({ i, x: REEL_X[i] as number, y: REEL_Y, moved: false });
                }}
              >
                <ReelArt reel={reel} />
              </g>
            </g>
          );
        })}
        {phase === 'pick' && <FocusRing x={(REEL_X[cursor] as number) - 40} y={REEL_Y - 40} w={80} h={80} r={36} />}
        {burst > 0 && <Burst k={burst} x={FUNNEL.x} y={FUNNEL.y + 30} color={C.tealHi} />}
        <Toast k={toast} text={`Not that one — find ${target.label}`} tone={C.warn} y={150} />
      </Stage>
    </GameShell>
  );
}

function ReelArt({ reel }: { reel: Reel }) {
  return (
    <g>
      <ellipse cx={0} cy={36} rx={30} ry={5} fill="#000" opacity={0.35} />
      <circle r={34} fill="#111827" stroke={reel.color} strokeWidth={3} />
      <circle r={28} fill="#1f2937" />
      <g className="mmg-spin-slow">
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return <circle key={i} cx={Math.cos(a) * 16} cy={Math.sin(a) * 16} r={6.5} fill="#0b0f1a" />;
        })}
      </g>
      <circle r={7} fill={reel.color} />
      <circle r={2.5} fill="#0b0f1a" />
      <rect x={-26} y={-48} width={52} height={14} rx={4} fill="#0b1222" stroke={reel.color} strokeOpacity={0.6} />
      <text y={-38} textAnchor="middle" fontSize={8.5} fontWeight={800} fill={reel.color} className="mmg-mono">
        {reel.label}
      </text>
    </g>
  );
}
