import { useMemo, useRef, useState } from 'react';
import { Burst, C, Caption, FocusCircle, GameShell, Stage, capture, spatialMove, svgPoint, useFinish, useIds, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export type DebrisKind = 'leaf' | 'seed' | 'stem' | 'twig' | 'note';
export interface Debris {
  kind: DebrisKind;
  x: number;
  y: number;
  rot: number;
}

export const GRATE = { x: 96, y: 52, w: 288, h: 268 };

export function genCleanFilter(seed: number): Debris[] {
  const r = makeRng(seed, 1414);
  const kinds: DebrisKind[] = ['leaf', 'seed', 'stem', 'leaf', 'twig', 'seed', 'note'];
  const out: Debris[] = [];
  let guard = 0;
  while (out.length < kinds.length && guard++ < 500) {
    const x = GRATE.x + 34 + r.next() * (GRATE.w - 68);
    const y = GRATE.y + 34 + r.next() * (GRATE.h - 68);
    if (out.some((d) => Math.hypot(d.x - x, d.y - y) < 62)) continue;
    out.push({ kind: kinds[out.length] as DebrisKind, x, y, rot: r.range(0, 360) });
  }
  return out;
}

const inGrate = (x: number, y: number) => x > GRATE.x - 4 && x < GRATE.x + GRATE.w + 4 && y > GRATE.y - 4 && y < GRATE.y + GRATE.h + 4;

export default function CleanFilter({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const start = useMemo(() => genCleanFilter(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [pos, setPos] = useState(() => start.map((d) => ({ x: d.x, y: d.y })));
  const [gone, setGone] = useState<boolean[]>(() => start.map(() => false));
  const goneRef = useRef(gone);
  const [flying, setFlying] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [drag, setDrag] = useState<{ i: number; dx: number; dy: number } | null>(null);
  const [burst, setBurst] = useState({ k: 0, x: 0, y: 0 });

  const remove = (i: number, to: { x: number; y: number }) => {
    if (goneRef.current[i] || done) return;
    setFlying(i);
    setPos((p) => p.map((q, j) => (j === i ? to : q)));
    const g2 = goneRef.current.map((v, j) => (j === i ? true : v));
    goneRef.current = g2;
    later(() => {
      setGone(g2);
      setFlying(null);
      setBurst((b) => ({ k: b.k + 1, x: to.x, y: to.y }));
    }, 260);
    if (g2.every(Boolean)) finish(500);
    else {
      // auto-aim the next nearest piece
      const here = pos[i] ?? to;
      let best = -1;
      let bd = Infinity;
      g2.forEach((gn, j) => {
        if (gn) return;
        const q = pos[j]!;
        const d = Math.hypot(q.x - here.x, q.y - here.y);
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      if (best >= 0) setCursor(best);
    }
  };

  const flick = (i: number) => {
    const p = pos[i]!;
    // fling toward the nearest edge vent (left or right)
    const left = p.x < 240;
    remove(i, { x: left ? 30 : 450, y: 186 });
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.dir) setCursor((c) => spatialMove(pos, c, k.dir!, (j) => goneRef.current[j] === true));
    else if (k.action && !k.repeat && flying === null) {
      if (goneRef.current[cursor]) return;
      flick(cursor);
    }
  };

  const left = gone.filter((x) => !x).length;

  return (
    <GameShell kind={kind} label="Clean the filter: drag out every leaf and seed" reducedMotion={reducedMotion} onKey={onKey} status={`${left} pieces left`}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.leaf}
        tone2={C.teal}
        defs={
          <pattern id={ids.id('mesh')} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="12" height="12" fill="#0b1424" />
            <path d="M0 6 H12 M6 0 V12" stroke="#3b5079" strokeWidth="1.6" />
          </pattern>
        }
        onPointerMove={(e) => {
          if (!drag) return;
          const p = svgPoint(svg.current, e);
          setPos((ps) => ps.map((q, j) => (j === drag.i ? { x: p.x - drag.dx, y: p.y - drag.dy } : q)));
        }}
        onPointerUp={() => {
          if (!drag) return;
          const p = pos[drag.i]!;
          if (!inGrate(p.x, p.y)) remove(drag.i, { x: p.x < 240 ? 30 : 450, y: p.y });
          setDrag(null);
        }}
      >
        <Caption text="O2 FILTER · BAY 2" tone={C.leaf} />
        {/* vents */}
        {[0, 1].map((s) => (
          <g key={s}>
            <rect x={s ? 418 : 10} y={110} width={52} height={152} rx={12} fill="#06101c" stroke={C.tealHi} strokeOpacity={0.35} />
            {[0, 1, 2, 3, 4].map((i) => (
              <rect key={i} x={s ? 426 : 18} y={124 + i * 26} width={36} height={8} rx={4} fill="#0f2230" />
            ))}
            <text x={s ? 444 : 36} y={102} textAnchor="middle" fontSize={8.5} fontWeight={900} fill={C.tealHi} opacity={0.8} letterSpacing={1}>
              {s ? 'OUT →' : '← OUT'}
            </text>
            <path d={s ? 'M396 186 l14 -10 v20 Z' : 'M84 186 l-14 -10 v20 Z'} fill={C.tealHi} fillOpacity={0.6} className="mmg-pulse" />
          </g>
        ))}
        {/* grate */}
        <rect x={GRATE.x - 10} y={GRATE.y - 10} width={GRATE.w + 20} height={GRATE.h + 20} rx={20} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={2} />
        <rect x={GRATE.x} y={GRATE.y} width={GRATE.w} height={GRATE.h} rx={14} fill={ids.url('mesh')} />
        <rect x={GRATE.x} y={GRATE.y} width={GRATE.w} height={GRATE.h} rx={14} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={6} />
        {[
          [GRATE.x + 10, GRATE.y + 10],
          [GRATE.x + GRATE.w - 10, GRATE.y + 10],
          [GRATE.x + 10, GRATE.y + GRATE.h - 10],
          [GRATE.x + GRATE.w - 10, GRATE.y + GRATE.h - 10],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} fill="#94a3b8" />
        ))}
        {left === 0 && (
          <text x={240} y={192} textAnchor="middle" fontSize={18} fontWeight={900} fill={C.tealHi} className="mmg-pop">
            Squeaky clean!
          </text>
        )}
        {start.map((d, i) => {
          if (gone[i]) return null;
          const p = pos[i]!;
          const isDrag = drag?.i === i;
          return (
            <g
              key={i}
              className={isDrag ? 'mmg-grab' : 'mmg-grab mmg-ease'}
              style={{ transform: `translate(${p.x}px,${p.y}px) scale(${flying === i ? 0.3 : 1})`, opacity: flying === i ? 0 : 1, transition: flying === i ? 'transform 260ms ease-in, opacity 260ms ease-in' : undefined }}
              onPointerDown={(e) => {
                if (done) return;
                capture(e);
                const q = svgPoint(svg.current, e);
                setCursor(i);
                setDrag({ i, dx: q.x - p.x, dy: q.y - p.y });
              }}
            >
              <circle r={30} fill="transparent" />
              <g transform={`rotate(${d.rot})`}>
                <DebrisArt kind={d.kind} />
              </g>
            </g>
          );
        })}
        {!done && !gone[cursor] && pos[cursor] && <FocusCircle x={pos[cursor]!.x} y={pos[cursor]!.y} r={28} />}
        {burst.k > 0 && <Burst k={burst.k} x={burst.x} y={burst.y} color={C.leaf} n={8} dist={30} />}
        <text x={240} y={348} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>
          {left} left · drag them off the grate
        </text>
      </Stage>
    </GameShell>
  );
}

function DebrisArt({ kind }: { kind: DebrisKind }) {
  switch (kind) {
    case 'leaf':
      return (
        <g>
          <path d="M-24 0 C -12 -18, 14 -18, 24 0 C 14 18, -12 18, -24 0 Z" fill="#65a30d" stroke="#365314" strokeWidth={1.5} />
          <path d="M-24 0 H22 M-6 0 l8 -8 M4 0 l8 -7 M-6 0 l8 8 M4 0 l8 7" stroke="#365314" strokeWidth={1.4} fill="none" />
          <path d="M-24 0 l-8 2" stroke="#78350f" strokeWidth={2.5} strokeLinecap="round" />
        </g>
      );
    case 'seed':
      return (
        <g>
          <ellipse rx={11} ry={15} fill="#a16207" stroke="#713f12" strokeWidth={1.5} />
          <path d="M0 -12 C 4 -4, 4 4, 0 12" stroke="#fde68a" strokeWidth={1.6} fill="none" opacity={0.7} />
          <ellipse cx={-4} cy={-6} rx={3} ry={5} fill="#fde68a" opacity={0.35} />
        </g>
      );
    case 'stem':
      return (
        <g>
          <path d="M-18 10 Q0 -6 16 -16" stroke="#15803d" strokeWidth={4} fill="none" strokeLinecap="round" />
          <path d="M16 -16 l-8 -6 M16 -16 l2 -10 M16 -16 l8 -4" stroke="#22c55e" strokeWidth={4} strokeLinecap="round" />
          <circle cx={-18} cy={10} r={5} fill={C.berry} />
        </g>
      );
    case 'twig':
      return (
        <g>
          <path d="M-26 6 L24 -4" stroke="#92400e" strokeWidth={5} strokeLinecap="round" />
          <path d="M0 1 L10 -12 M-12 4 L-18 -6" stroke="#92400e" strokeWidth={3.5} strokeLinecap="round" />
        </g>
      );
    case 'note':
      return (
        <g>
          <path d="M-18 -16 L14 -18 L20 14 L-14 18 Z" fill="#e2e8f0" stroke="#94a3b8" />
          <path d="M-10 -8 L10 -9 M-10 -1 L12 -2 M-9 6 L6 5" stroke="#94a3b8" strokeWidth={2} />
          <path d="M-18 -16 L-6 -2 L14 -18" fill="none" stroke="#cbd5e1" strokeWidth={1} />
        </g>
      );
  }
}
