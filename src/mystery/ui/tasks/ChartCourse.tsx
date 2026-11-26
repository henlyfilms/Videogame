import { useMemo, useRef, useState } from 'react';
import { Berry, Burst, C, Caption, FocusCircle, GameShell, Stage, Twinkles, capture, svgPoint, useFinish, useIds, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

const HIT_R = 28;

export function genChartCourse(seed: number) {
  const r = makeRng(seed, 2323);
  const start = { x: 46, y: 90 + r.range(0, 180) };
  const wps = [150, 240, 330, 426].map((x) => ({ x, y: 80 + r.range(0, 210) }));
  const planets = Array.from({ length: 3 }, () => ({ x: r.range(40, 440), y: r.range(60, 320), r: r.range(8, 18), c: r.pick([C.marionHi, C.berryHi, C.tealHi, C.warn]) }));
  return { start, wps, planets };
}

export default function ChartCourse({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genChartCourse(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [reached, setReached] = useState(0);
  const reachedRef = useRef(0);
  const [ship, setShip] = useState(g.start);
  const [gliding, setGliding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([g.start]);
  const [burst, setBurst] = useState({ k: 0, x: 0, y: 0 });

  const hit = (n: number) => {
    const wp = g.wps[n - 1]!;
    reachedRef.current = n;
    setReached(n);
    setBurst((b) => ({ k: b.k + 1, x: wp.x, y: wp.y }));
    if (n >= g.wps.length) finish(550);
  };

  const glide = () => {
    if (done || gliding) return;
    const n = reachedRef.current;
    const wp = g.wps[n];
    if (!wp) return;
    setGliding(true);
    setShip(wp);
    setTrail((t) => [...t, wp]);
    later(() => {
      setGliding(false);
      hit(n + 1);
    }, 340);
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || k.repeat) return;
    if (k.action || k.dir === 'right') glide();
  };

  const heading = (() => {
    const nxt = g.wps[Math.min(reached, g.wps.length - 1)]!;
    return (Math.atan2(nxt.y - ship.y, nxt.x - ship.x) * 180) / Math.PI;
  })();
  const route = [g.start, ...g.wps].map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <GameShell kind={kind} label="Chart the course through the waypoints" reducedMotion={reducedMotion} onKey={onKey} status={`${reached} of ${g.wps.length} waypoints`}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.marion}
        tone2={C.cobalt}
        grid={false}
        onPointerMove={(e) => {
          if (!dragging || done) return;
          const p = svgPoint(svg.current, e);
          setShip(p);
          const n = reachedRef.current;
          const wp = g.wps[n];
          if (wp && Math.hypot(p.x - wp.x, p.y - wp.y) < HIT_R) {
            setTrail((t) => [...t, wp]);
            hit(n + 1);
          }
        }}
        onPointerUp={() => {
          if (!dragging) return;
          setDragging(false);
          if (!done) setShip(reachedRef.current ? g.wps[reachedRef.current - 1]! : g.start);
        }}
      >
        <Twinkles seed={seed + 3} n={60} />
        {g.planets.map((p, i) => (
          <g key={i} opacity={0.55}>
            <circle cx={p.x} cy={p.y} r={p.r} fill={p.c} opacity={0.35} />
            <ellipse cx={p.x} cy={p.y} rx={p.r * 1.7} ry={p.r * 0.35} fill="none" stroke={p.c} strokeOpacity={0.4} transform={`rotate(-20 ${p.x} ${p.y})`} />
          </g>
        ))}
        <Caption text="NAVIGATION · CHART COURSE" tone={C.marionHi} />
        <polyline points={route} fill="none" stroke={C.cobaltHi} strokeOpacity={0.35} strokeWidth={2} strokeDasharray="3 7" />
        <polyline points={trail.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={C.tealHi} strokeWidth={3} filter={ids.url('glow')} strokeLinecap="round" strokeLinejoin="round" />
        {/* start dock */}
        <circle cx={g.start.x} cy={g.start.y} r={14} fill="none" stroke={C.tealHi} strokeOpacity={0.6} strokeDasharray="3 3" />
        {g.wps.map((w, i) => {
          const isNext = i === reached;
          const isDone = i < reached;
          const last = i === g.wps.length - 1;
          return (
            <g key={i}>
              {isNext && <circle cx={w.x} cy={w.y} r={HIT_R} fill={C.cobaltHi} fillOpacity={0.14} stroke={C.cobaltHi} strokeOpacity={0.5} strokeDasharray="4 4" className="mmg-pulse" />}
              {last ? (
                <g transform={`translate(${w.x} ${w.y})`}>
                  <circle r={20} fill={isDone ? C.teal : '#1e1b4b'} stroke={C.marionHi} strokeWidth={2} />
                  <Berry kind="marion" r={11} leaf={false} />
                  <text y={36} textAnchor="middle" fontSize={8.5} fontWeight={900} fill={C.marionHi}>
                    HQ
                  </text>
                </g>
              ) : (
                <g transform={`translate(${w.x} ${w.y})`}>
                  <path d="M0 -12 L12 0 L0 12 L-12 0 Z" fill={isDone ? C.tealHi : isNext ? C.cobaltHi : '#1e293b'} stroke={isDone ? '#ccfbf1' : C.cobaltHi} strokeWidth={2} filter={isDone || isNext ? ids.url('glow') : undefined} className="mmg-fill-t" />
                  <text y={-18} textAnchor="middle" fontSize={9} fontWeight={900} fill={isDone ? C.tealHi : C.muted}>
                    {i + 1}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {burst.k > 0 && <Burst k={burst.k} x={burst.x} y={burst.y} color={C.tealHi} n={10} dist={34} />}
        {/* ship */}
        <g
          className={dragging ? 'mmg-grab' : 'mmg-grab'}
          style={{ transform: `translate(${ship.x}px,${ship.y}px)`, transition: dragging ? undefined : 'transform 330ms cubic-bezier(.4,0,.2,1)' }}
          onPointerDown={(e) => {
            if (done) return;
            capture(e);
            setDragging(true);
          }}
        >
          <circle r={30} fill="transparent" />
          <g transform={`rotate(${heading})`}>
            <path d="M-20 -6 L-30 0 L-20 6 Z" fill={C.warn} className="mmg-pulse-fast" />
            <path d="M18 0 L-14 -13 L-8 0 L-14 13 Z" fill="#e2e8f0" stroke={C.cobaltHi} strokeWidth={2} />
            <circle cx={2} cy={0} r={4.5} fill={C.berry} />
          </g>
          <FocusCircle x={0} y={0} r={22} show={!done} />
        </g>
        <text x={240} y={350} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>
          {done ? 'Course locked in — next stop: HQ' : `Waypoint ${reached + 1} of ${g.wps.length}`}
        </text>
      </Stage>
    </GameShell>
  );
}
