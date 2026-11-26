import { useMemo, useRef, useState } from 'react';
import { BERRY_COLORS, Berry, Burst, C, Caption, FocusRing, GameShell, Stage, Toast, capture, svgPoint, useBump, useFinish, useIds, useTimers, type BerryKind, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

/** 2 = ripe, 1 = almost, 0 = not yet. Bins left→right: ripe, almost, not yet. */
export type Ripeness = 0 | 1 | 2;
export const binOf = (r: Ripeness): number => 2 - r;

export interface BerryItem {
  kind: BerryKind;
  ripe: Ripeness;
}

export function genSortBerries(seed: number): BerryItem[] {
  const r = makeRng(seed, 707);
  const kinds: BerryKind[] = ['straw', 'blue', 'rasp', 'marion'];
  const ripes: Ripeness[] = r.shuffle<Ripeness>([0, 1, 2, r.int(3) as Ripeness, r.int(3) as Ripeness, r.int(3) as Ripeness]);
  return ripes.map((ripe) => ({ kind: r.pick(kinds), ripe }));
}

export function ripeTint(kind: BerryKind, ripe: Ripeness) {
  if (ripe === 2) return BERRY_COLORS[kind];
  if (ripe === 0) return { body: '#86d36b', hi: '#d9f99d', dark: '#3f7a2a' };
  const blush: Record<BerryKind, { body: string; hi: string; dark: string }> = {
    straw: { body: '#f59a8b', hi: '#ffd6cc', dark: '#b4533f' },
    blue: { body: '#a3a6e8', hi: '#dfe1ff', dark: '#5b5fb0' },
    rasp: { body: '#f4a3bd', hi: '#ffe0ea', dark: '#b45a78' },
    marion: { body: '#c09be0', hi: '#ecdcff', dark: '#7a4fa8' },
    cherry: { body: '#f59a8b', hi: '#ffd6cc', dark: '#b4533f' },
    goose: { body: '#c6e07a', hi: '#f0fbc8', dark: '#7a8f2a' },
  };
  return blush[kind];
}

const BINS = [
  { x: 96, label: 'RIPE', dots: 3, color: C.berryHi },
  { x: 240, label: 'ALMOST', dots: 2, color: C.warn },
  { x: 384, label: 'NOT YET', dots: 1, color: C.leaf },
];
const CLAW_Y = 138;

export default function SortBerries({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const items = useMemo(() => genSortBerries(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState(1);
  const [anim, setAnim] = useState<null | 'drop' | 'bounce'>(null);
  const [counts, setCounts] = useState([0, 0, 0]);
  const [toast, setToast] = useState({ k: 0, text: '' });
  const [burst, setBurst] = useState({ k: 0, x: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [arrive, bumpArrive] = useBump();
  const item = items[idx];
  const busy = anim !== null || done || !item;

  const drop = (bin: number) => {
    if (busy || !item) return;
    setPos(bin);
    setDrag(null);
    if (binOf(item.ripe) !== bin) {
      setAnim('bounce');
      setToast((t) => ({ k: t.k + 1, text: item.ripe === 2 ? 'This one is ripe and ready!' : item.ripe === 1 ? 'Almost there — not ripe yet' : 'Way too green for that bin' }));
      later(() => setAnim(null), 520);
      return;
    }
    setAnim('drop');
    later(() => {
      setCounts((c) => c.map((v, i) => (i === bin ? v + 1 : v)));
      setBurst((b) => ({ k: b.k + 1, x: BINS[bin]!.x }));
    }, 260);
    later(() => {
      setAnim(null);
      const n = idx + 1;
      setIdx(n);
      bumpArrive();
      if (n >= items.length) finish(350);
    }, 420);
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || busy) return;
    if (k.dir === 'left') setPos((p) => Math.max(0, p - 1));
    else if (k.dir === 'right') setPos((p) => Math.min(2, p + 1));
    else if ((k.action || k.dir === 'down') && !k.repeat) drop(pos);
  };

  const bx = drag ? drag.x : (BINS[pos]?.x ?? 240);
  const by = drag ? drag.y : anim === 'drop' ? 262 : anim === 'bounce' ? 214 : CLAW_Y + 30;

  return (
    <GameShell kind={kind} label="Sort berries by ripeness" reducedMotion={reducedMotion} onKey={onKey} status={item ? `${['Green', 'Blushing', 'Deep coloured'][item.ripe]} berry over ${BINS[pos]?.label} bin` : 'All sorted'}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.berry}
        tone2={C.leaf}
        onPointerMove={(e) => {
          if (drag) setDrag(svgPoint(svg.current, e));
        }}
        onPointerUp={() => {
          if (!drag) return;
          const nearest = BINS.reduce((b, bin, i) => (Math.abs(bin.x - drag.x) < Math.abs((BINS[b]?.x ?? 0) - drag.x) ? i : b), 0);
          if (drag.y > 190) drop(nearest);
          else {
            setPos(nearest);
            setDrag(null);
          }
        }}
      >
        <Caption text="BERRY SORTER" tone={C.berryHi} />
        {/* queue */}
        <g>
          <rect x={300} y={18} width={166} height={34} rx={17} fill="#0a1222" stroke="#2a3a62" />
          {items.slice(idx + 1, idx + 6).map((it, i) => (
            <g key={idx + 1 + i} className="mmg-ease" style={{ transform: `translate(${320 + i * 30}px,35px)` }}>
              <Berry kind={it.kind} r={10} tint={ripeTint(it.kind, it.ripe)} />
            </g>
          ))}
        </g>
        {/* claw rail */}
        <rect x={40} y={96} width={400} height={8} rx={4} fill="#1e2b49" stroke="#2a3a62" />
        <g className="mmg-ease" style={{ transform: `translate(${BINS[pos]?.x ?? 240}px,0px)` }}>
          <rect x={-16} y={90} width={32} height={18} rx={5} fill={ids.url('metal')} stroke="#5d77b0" />
          <line x1={0} y1={108} x2={0} y2={CLAW_Y - 2} stroke="#94a3b8" strokeWidth={2.5} />
          <path d={`M-16 ${CLAW_Y + 8} Q-18 ${CLAW_Y - 4} 0 ${CLAW_Y - 4} Q18 ${CLAW_Y - 4} 16 ${CLAW_Y + 8}`} fill="none" stroke="#cbd5e1" strokeWidth={4} strokeLinecap="round" style={{ transform: anim === 'drop' ? 'scaleX(1.5)' : undefined }} />
        </g>
        {/* bins */}
        {BINS.map((b, i) => (
          <g key={i} className="mmg-hit" onPointerDown={() => drop(i)}>
            <path d={`M${b.x - 62} 230 h124 l-10 100 q-1 8 -9 8 h-86 q-8 0 -9 -8 Z`} fill="#3b2a1c" stroke="#7c5a3a" strokeWidth={1.5} />
            {[0, 1, 2].map((j) => (
              <line key={j} x1={b.x - 58 + j * 2} y1={256 + j * 26} x2={b.x + 58 - j * 2} y2={256 + j * 26} stroke="#5a412a" strokeWidth={3} />
            ))}
            <rect x={b.x - 66} y={222} width={132} height={14} rx={6} fill="#5a412a" stroke={pos === i ? b.color : '#7c5a3a'} strokeWidth={pos === i ? 2 : 1} className="mmg-fill-t" />
            {/* sorted berries peeking */}
            {Array.from({ length: Math.min(counts[i] ?? 0, 4) }, (_, j) => (
              <circle key={j} cx={b.x - 30 + j * 20} cy={232} r={9} fill={i === 0 ? C.berry : i === 1 ? '#f4a3bd' : '#86d36b'} stroke="#000" strokeOpacity={0.25} />
            ))}
            <rect x={b.x - 44} y={274} width={88} height={40} rx={8} fill="#fef3c7" />
            <text x={b.x} y={292} textAnchor="middle" fontSize={11.5} fontWeight={900} fill="#78350f" letterSpacing={0.8}>
              {b.label}
            </text>
            {[0, 1, 2].map((j) => (
              <circle key={j} cx={b.x - 12 + j * 12} cy={304} r={3.6} fill={j < b.dots ? b.color : 'none'} stroke={b.color} strokeWidth={1.5} />
            ))}
          </g>
        ))}
        {/* current berry */}
        {item && (
          <g key={`${idx}-${toast.k}`} className={anim === 'bounce' ? 'mmg-shake' : undefined}>
            <g
              className={drag ? 'mmg-grab' : anim === 'bounce' ? 'mmg-spring mmg-grab' : 'mmg-ease mmg-grab'}
              style={{ transform: `translate(${bx}px,${by}px) scale(${anim === 'drop' ? 0.6 : 1})`, opacity: anim === 'drop' ? 0 : 1, transition: anim === 'drop' ? 'transform 260ms cubic-bezier(.55,0,1,.45), opacity 120ms 200ms' : undefined }}
              onPointerDown={(e) => {
                if (busy) return;
                capture(e);
                setDrag(svgPoint(svg.current, e));
              }}
            >
              <g key={arrive} className="mmg-pop">
                <circle r={34} fill="transparent" />
                <Berry kind={item.kind} r={24} face={item.ripe === 2} tint={ripeTint(item.kind, item.ripe)} />
                <g transform="translate(0 40)">
                  {[0, 1, 2].map((j) => (
                    <circle key={j} cx={-10 + j * 10} cy={0} r={3} fill={j <= item.ripe ? '#f8fafc' : 'none'} stroke="#f8fafc" strokeOpacity={0.7} strokeWidth={1.2} />
                  ))}
                </g>
              </g>
            </g>
          </g>
        )}
        {burst.k > 0 && <Burst k={burst.k} x={burst.x} y={232} color={C.berryHi} n={10} />}
        {!busy && <FocusRing x={(BINS[pos]?.x ?? 240) - 66} y={222} w={132} h={116} r={10} />}
        <Toast k={toast.k} text={toast.text} tone={C.warn} y={74} />
      </Stage>
    </GameShell>
  );
}
