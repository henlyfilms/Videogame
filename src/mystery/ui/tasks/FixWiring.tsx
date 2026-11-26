import { useMemo, useRef, useState } from 'react';
import { Burst, C, Caption, FocusCircle, GameShell, Stage, Toast, capture, nextOpen, shapePath, svgPoint, useFinish, useIds, type KeyInput, type ShapeKind } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const WIRES: { color: string; hi: string; shape: ShapeKind; name: string }[] = [
  { color: '#f43f5e', hi: '#fda4af', shape: 'circle', name: 'red circle' },
  { color: '#facc15', hi: '#fef08a', shape: 'triangle', name: 'yellow triangle' },
  { color: '#3b82f6', hi: '#93c5fd', shape: 'square', name: 'blue square' },
  { color: '#d946ef', hi: '#f5d0fe', shape: 'star', name: 'magenta star' },
];

/** left[i] / right[j] hold wire ids. */
export function genFixWiring(seed: number): { left: number[]; right: number[] } {
  const r = makeRng(seed, 1111);
  const left = r.shuffle([0, 1, 2, 3]);
  let right = r.shuffle([0, 1, 2, 3]);
  if (right.every((v, i) => v === left[i])) right = [...right.slice(1), right[0] as number];
  return { left, right };
}

const LX = 74;
const RX = 406;
const rowY = (i: number) => 88 + i * 66;

export default function FixWiring({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genFixWiring(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const [links, setLinks] = useState<Record<number, number>>({}); // left index -> right index
  const [side, setSide] = useState<'L' | 'R'>('L');
  const [curL, setCurL] = useState(0);
  const [curR, setCurR] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ i: number; x: number; y: number; moved: boolean } | null>(null);
  const [toast, setToast] = useState({ k: 0, text: '' });
  const [spark, setSpark] = useState({ k: 0, x: 0, y: 0, ok: true });
  const linkedR = new Set(Object.values(links));

  const connect = (li: number, ri: number) => {
    if (done) return;
    setSel(null);
    setSide('L');
    if (links[li] !== undefined || linkedR.has(ri)) return;
    const w = g.left[li] as number;
    if (g.right[ri] !== w) {
      setSpark((s) => ({ k: s.k + 1, x: RX, y: rowY(ri), ok: false }));
      setToast((t) => ({ k: t.k + 1, text: `Zap! Match the ${WIRES[w]?.shape} to its ${WIRES[w]?.shape}` }));
      return;
    }
    const next = { ...links, [li]: ri };
    setLinks(next);
    setSpark((s) => ({ k: s.k + 1, x: RX, y: rowY(ri), ok: true }));
    if (Object.keys(next).length === 4) finish(500);
    else setCurL(nextOpen(4, li, (i) => next[i] !== undefined));
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.dir === 'up' || k.dir === 'down') {
      const d = k.dir === 'up' ? -1 : 1;
      if (side === 'L') setCurL((c) => Math.max(0, Math.min(3, c + d)));
      else setCurR((c) => Math.max(0, Math.min(3, c + d)));
    } else if (k.dir === 'left' && side === 'R') {
      setSide('L');
      setSel(null);
    } else if ((k.action || k.dir === 'right') && !k.repeat) {
      if (side === 'L') {
        if (links[curL] !== undefined) return;
        setSel(curL);
        setSide('R');
        setCurR(curL);
      } else if (k.action && sel !== null) connect(sel, curR);
    }
  };

  const wire = (li: number, x2: number, y2: number, live: boolean) => {
    const w = WIRES[g.left[li] as number]!;
    const y1 = rowY(li);
    const d = `M${LX + 18} ${y1} C ${LX + 120} ${y1}, ${x2 - 120} ${y2}, ${x2} ${y2}`;
    return (
      <g key={`w${li}`} pointerEvents="none">
        <path d={d} stroke="#000" strokeOpacity={0.45} strokeWidth={16} fill="none" strokeLinecap="round" transform="translate(0 4)" />
        <path d={d} stroke={w.color} strokeWidth={12} fill="none" strokeLinecap="round" filter={live ? ids.url('glow') : undefined} />
        <path d={d} stroke={w.hi} strokeOpacity={0.7} strokeWidth={3} fill="none" strokeLinecap="round" transform="translate(0 -3)" />
        {live && <path d={d} stroke="#fff" strokeOpacity={0.8} strokeWidth={2} fill="none" strokeDasharray="4 14" className="mmg-dash" />}
      </g>
    );
  };

  return (
    <GameShell kind={kind} label="Fix wiring: connect matching colours and shapes" reducedMotion={reducedMotion} onKey={onKey} status={sel !== null ? `Holding the ${WIRES[g.left[sel] as number]?.name} wire` : `${Object.keys(links).length} of 4 wires connected`}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.warn}
        tone2={C.cobalt}
        onPointerMove={(e) => {
          if (!drag) return;
          const p = svgPoint(svg.current, e);
          setDrag({ ...drag, x: p.x, y: p.y, moved: drag.moved || Math.abs(p.x - LX) > 20 });
        }}
        onPointerUp={(e) => {
          if (!drag) return;
          const p = svgPoint(svg.current, e);
          const ri = [0, 1, 2, 3].find((j) => Math.hypot(p.x - RX, p.y - rowY(j)) < 40);
          if (ri !== undefined) connect(drag.i, ri);
          else if (!drag.moved) {
            setSel(drag.i);
            setCurL(drag.i);
          }
          setDrag(null);
        }}
      >
        <Caption text="ELECTRICAL · JUNCTION 4" tone={C.warn} />
        {/* panels */}
        <rect x={20} y={52} width={92} height={286} rx={14} fill={ids.url('metal')} stroke="#4a5d8a" />
        <rect x={368} y={52} width={92} height={286} rx={14} fill={ids.url('metal')} stroke="#4a5d8a" />
        {[0, 1].map((i) => (
          <g key={i}>
            <circle cx={30 + i * 348} cy={62} r={3} fill="#64748b" />
            <circle cx={102 + i * 348} cy={328} r={3} fill="#64748b" />
          </g>
        ))}
        <text x={240} y={338} textAnchor="middle" fontSize={10.5} fill={C.muted}>
          Colour <tspan fill={C.ink}>and</tspan> shape must match
        </text>
        {/* connected wires */}
        {Object.entries(links).map(([l, r]) => wire(Number(l), RX - 18, rowY(r), true))}
        {drag && drag.moved && wire(drag.i, drag.x, drag.y, false)}
        {sel !== null && !drag && side === 'R' && wire(sel, RX - 30, rowY(curR), false)}
        {/* left plugs */}
        {g.left.map((w, i) => {
          const wd = WIRES[w]!;
          const on = links[i] !== undefined;
          return (
            <g
              key={`l${i}`}
              className={on ? undefined : 'mmg-grab'}
              onPointerDown={(e) => {
                if (on || done) return;
                capture(e);
                const p = svgPoint(svg.current, e);
                setDrag({ i, x: p.x, y: p.y, moved: false });
                setSide('L');
              }}
            >
              <rect x={20} y={rowY(i) - 30} width={110} height={60} fill="transparent" />
              <rect x={20} y={rowY(i) - 8} width={LX - 20} height={16} fill={wd.color} />
              <circle cx={LX} cy={rowY(i)} r={22} fill="#0b1222" stroke={wd.color} strokeWidth={4} filter={sel === i || on ? ids.url('glow') : undefined} />
              <path d={shapePath(wd.shape, 11)} transform={`translate(${LX} ${rowY(i)})`} fill={wd.color} stroke="#fff" strokeWidth={1.5} />
              {side === 'L' && <FocusCircle x={LX} y={rowY(i)} r={24} show={curL === i && !done} />}
            </g>
          );
        })}
        {/* right sockets */}
        {g.right.map((w, j) => {
          const wd = WIRES[w]!;
          const on = linkedR.has(j);
          return (
            <g
              key={`r${j}`}
              className="mmg-hit"
              onPointerDown={() => {
                if (sel !== null && !drag) connect(sel, j);
              }}
            >
              <rect x={RX - 40} y={rowY(j) - 30} width={110} height={60} fill="transparent" />
              <rect x={RX} y={rowY(j) - 8} width={480 - RX - 20} height={16} fill={wd.color} opacity={0.8} />
              <circle cx={RX} cy={rowY(j)} r={22} fill={on ? wd.color : '#0b1222'} stroke={wd.color} strokeWidth={4} filter={on ? ids.url('glow') : undefined} className="mmg-fill-t" />
              <path d={shapePath(wd.shape, 11)} transform={`translate(${RX} ${rowY(j)})`} fill={on ? '#fff' : 'none'} stroke={on ? '#fff' : wd.color} strokeWidth={2.5} />
              {side === 'R' && <FocusCircle x={RX} y={rowY(j)} r={24} show={curR === j && !done} color={WIRES[g.left[sel ?? 0] as number]?.hi} />}
            </g>
          );
        })}
        {spark.k > 0 && <Burst k={spark.k} x={spark.x} y={spark.y} color={spark.ok ? C.tealHi : C.warn} n={spark.ok ? 10 : 14} dist={spark.ok ? 40 : 30} />}
        <Toast k={toast.k} text={toast.text} tone={C.warn} y={196} />
      </Stage>
    </GameShell>
  );
}
