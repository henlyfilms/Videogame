import { useMemo, useRef, useState } from 'react';
import { Berry, Burst, C, Caption, FocusCircle, GameShell, Stage, capture, clamp, now, svgPoint, tsfx, useFinish, useHold, useHoldSound, useIds, useRaf, type BerryKind, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

const JUICES: { name: string; kind: BerryKind; color: string; hi: string }[] = [
  { name: 'Marionberry', kind: 'marion', color: '#7c3aed', hi: '#c4b5fd' },
  { name: 'Raspberry', kind: 'rasp', color: '#e0457b', hi: '#ffb3cc' },
  { name: 'Blueberry', kind: 'blue', color: '#4f46e5', hi: '#a5b4fc' },
  { name: 'Strawberry', kind: 'straw', color: '#ef4444', hi: '#fecaca' },
];

export const PUMP = 0.07; // per tap
export const HOLD_RATE = 0.26; // per second while held
const TURN = 0.34; // per full crank revolution

export function genJuicePress(seed: number) {
  const r = makeRng(seed, 808);
  return { juice: r.pick(JUICES), berries: Array.from({ length: 7 }, () => ({ dx: r.range(-34, 34), dy: r.range(-10, 14), rot: r.range(-30, 30) })) };
}

const CRANK = { x: 392, y: 178, r: 58 };

export default function JuicePress({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genJuicePress(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const [fill, setFill] = useState(0);
  const fillRef = useRef(0);
  const [angle, setAngle] = useState(0);
  const angRef = useRef(0);
  const lastPump = useRef(-1e9);
  const [flowing, setFlowing] = useState(false);
  const [burst, setBurst] = useState(0);
  const drag = useRef<{ a: number } | null>(null);
  const hold = useHold(!done, [], 'crank');
  useHoldSound(flowing && !done, 'pour');

  const add = (v: number, spin: number) => {
    if (done) return;
    const n = clamp(fillRef.current + v, 0, 1);
    fillRef.current = n;
    setFill(n);
    angRef.current += spin;
    setAngle(angRef.current);
    lastPump.current = now();
    if (n >= 1) {
      setBurst(1);
      finish(500);
    }
  };

  useRaf((dt, t) => {
    if (hold.ref.current) add(HOLD_RATE * dt, dt * 400);
    setFlowing(t - lastPump.current < 260);
  }, !done);

  const onKey = (k: KeyInput) => {
    if (done) return;
    if (k.action) {
      if (k.down && !k.repeat) (add(PUMP, 90), tsfx('drop'));
      hold.key(k);
      return true;
    }
    if (k.down && !k.repeat && (k.dir === 'left' || k.dir === 'right' || k.dir === 'down')) (add(PUMP * 0.75, k.dir === 'left' ? -70 : 70), tsfx('drop'));
  };

  const plateY = 96 + fill * 52;
  const jarH = 96;
  const jarFill = fill * (jarH - 10);
  const cr = (angle * Math.PI) / 180;
  const hx = CRANK.x + Math.cos(cr) * (CRANK.r - 12);
  const hy = CRANK.y + Math.sin(cr) * (CRANK.r - 12);

  return (
    <GameShell kind={kind} label="Juice press" reducedMotion={reducedMotion} onKey={onKey} status={`${Math.round(fill * 100)} percent pressed`}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={g.juice.color}
        tone2={C.berry}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || done) return;
          const p = svgPoint(svg.current, e);
          const a = Math.atan2(p.y - CRANK.y, p.x - CRANK.x);
          let da = a - d.a;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          d.a = a;
          if (Math.abs(da) > 0.001) add((Math.abs(da) / (Math.PI * 2)) * TURN, (da * 180) / Math.PI);
        }}
        onPointerUp={() => {
          drag.current = null;
          hold.set(false);
        }}
        defs={
          <linearGradient id={ids.id('juice')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={g.juice.hi} />
            <stop offset="1" stopColor={g.juice.color} />
          </linearGradient>
        }
      >
        <Caption text="HQ JUICE BAR" tone={C.berryHi} />
        {/* press frame */}
        <g>
          <rect x={60} y={58} width={16} height={200} rx={6} fill={ids.url('metal')} stroke="#5d77b0" />
          <rect x={244} y={58} width={16} height={200} rx={6} fill={ids.url('metal')} stroke="#5d77b0" />
          <rect x={52} y={50} width={216} height={22} rx={8} fill={ids.url('metal')} stroke="#5d77b0" />
          {/* screw */}
          <rect x={154} y={70} width={12} height={plateY - 70} fill="#94a3b8" />
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1={154} x2={166} y1={74 + i * 7} y2={78 + i * 7} stroke="#475569" strokeWidth={2} opacity={74 + i * 7 < plateY ? 1 : 0} />
          ))}
          {/* plate */}
          <rect x={90} y={plateY} width={140} height={14} rx={5} fill={ids.url('brass')} stroke="#7a5418" className="mmg-fast" />
          {/* basket with berries */}
          <path d="M92 150 h136 l-12 70 h-112 Z" fill="#2b1d14" stroke="#7c5a3a" strokeWidth={1.5} />
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={108 + i * 26} y1={152} x2={112 + i * 24} y2={218} stroke="#7c5a3a" strokeWidth={2} />
          ))}
          <g transform={`translate(160 ${190}) scale(1 ${1 - fill * 0.6})`}>
            {g.berries.map((b, i) => (
              <g key={i} transform={`translate(${b.dx} ${b.dy - 14}) rotate(${b.rot})`}>
                <Berry kind={g.juice.kind} r={13} leaf={false} />
              </g>
            ))}
          </g>
          {/* spout */}
          <path d="M150 220 h20 l-4 22 h-12 Z" fill={ids.url('metal')} stroke="#5d77b0" />
          {flowing && <rect x={156} y={242} width={8} height={262 - 242 + (jarH - jarFill) - 8} rx={4} fill={g.juice.color} opacity={0.9} />}
          {flowing &&
            [0, 1, 2].map((i) => <circle key={i} className="mmg-drip" cx={160} cy={246 + i * 8} r={3} fill={g.juice.hi} style={{ animationDelay: `${i * 0.15}s` }} />)}
        </g>
        {/* jar */}
        <g transform="translate(160 262)">
          <rect x={-46} y={-8} width={92} height={10} rx={4} fill={done ? g.juice.color : '#334155'} stroke="#64748b" className="mmg-fill-t" />
          <rect x={-42} y={0} width={84} height={jarH - 10} rx={10} fill="#0a1222" stroke="#94a3b8" strokeOpacity={0.6} strokeWidth={2} />
          <rect x={-39} y={jarH - 13 - jarFill} width={78} height={jarFill} rx={8} fill={ids.url('juice')} />
          {jarFill > 4 && <ellipse cx={0} cy={jarH - 13 - jarFill} rx={38} ry={3} fill={g.juice.hi} opacity={0.6} />}
          <rect x={-38} y={4} width={10} height={jarH - 22} rx={5} fill="#fff" opacity={0.12} />
          <rect x={-30} y={30} width={60} height={26} rx={4} fill="#fef3c7" opacity={0.92} />
          <text y={41} textAnchor="middle" fontSize={7.5} fontWeight={900} fill="#78350f">
            {g.juice.name.toUpperCase()}
          </text>
          <text y={51} textAnchor="middle" fontSize={7} fontWeight={700} fill="#92400e">
            HQ pressed
          </text>
        </g>
        {burst > 0 && <Burst k={burst} x={160} y={300} color={g.juice.hi} />}
        {/* fill meter */}
        <g transform="translate(296 92)">
          <rect width={18} height={200} rx={9} fill="#0a1020" stroke="#2a3a62" />
          <rect x={3} y={3 + 194 * (1 - fill)} width={12} height={194 * fill} rx={6} fill={ids.url('juice')} filter={ids.url('glow')} />
          <text x={9} y={-8} textAnchor="middle" fontSize={10} fontWeight={900} fill={g.juice.hi}>
            {Math.round(fill * 100)}%
          </text>
        </g>
        {/* crank */}
        <g
          className="mmg-grab"
          onPointerDown={(e) => {
            if (done) return;
            capture(e);
            const p = svgPoint(svg.current, e);
            drag.current = { a: Math.atan2(p.y - CRANK.y, p.x - CRANK.x) };
            hold.set(true);
            add(PUMP * 0.5, 30);
          }}
        >
          <circle cx={CRANK.x} cy={CRANK.y} r={CRANK.r + 14} fill="transparent" />
          <circle cx={CRANK.x} cy={CRANK.y} r={CRANK.r} fill="#0d1526" stroke="#4a5d8a" strokeWidth={3} />
          <g transform={`translate(${CRANK.x} ${CRANK.y}) rotate(${angle})`}>
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <rect key={a} x={-4} y={-CRANK.r + 6} width={8} height={CRANK.r - 6} rx={3} fill="#334155" transform={`rotate(${a})`} />
            ))}
          </g>
          <circle cx={CRANK.x} cy={CRANK.y} r={14} fill={ids.url('brass')} />
          <line x1={CRANK.x} y1={CRANK.y} x2={hx} y2={hy} stroke="#cbd5e1" strokeWidth={7} strokeLinecap="round" />
          <circle cx={hx} cy={hy} r={13} fill={C.berry} stroke="#fff" strokeOpacity={0.6} strokeWidth={2} filter={ids.url('glow')} />
          <FocusCircle x={CRANK.x} y={CRANK.y} r={CRANK.r + 4} show={!done} />
          <text x={CRANK.x} y={CRANK.y + CRANK.r + 34} textAnchor="middle" fontSize={11} fontWeight={800} fill={C.berryHi}>
            {done ? 'Fresh!' : 'CRANK ↻'}
          </text>
        </g>
      </Stage>
    </GameShell>
  );
}
