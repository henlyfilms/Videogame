import { useMemo, useRef, useState } from 'react';
import { C, Caption, FocusCircle, GameShell, Stage, SvgButton, capture, clamp, svgPoint, tsfx, useFinish, useIds, useRaf, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const DIAL_MAX = 100;
const LOCK_S = 0.7;
const DEG_PER_STEP = 5;

export function genCommsPanel(seed: number): { target: number; start: number } {
  const r = makeRng(seed, 2727);
  const target = 15 + r.int(71);
  let start = r.int(DIAL_MAX + 1);
  if (Math.abs(start - target) < 25) start = target > 50 ? target - 25 - r.int(10) : target + 25 + r.int(10);
  return { target, start: clamp(start, 0, DIAL_MAX) };
}

export const freqOf = (v: number): string => (88 + v * 0.2).toFixed(1);
const KNOB = { x: 393, y: 158, r: 58 };

export default function CommsPanel({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genCommsPanel(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const [v, setVState] = useState(g.start);
  const vRef = useRef(g.start);
  const setV = (n: number) => {
    const c = clamp(Math.round(n), 0, DIAL_MAX);
    vRef.current = c;
    setVState(c);
  };
  const [lock, setLock] = useState(0);
  const lockRef = useRef(0);
  const [t, setT] = useState(0);
  const drag = useRef<{ a: number; acc: number } | null>(null);
  const [pressed, setPressedState] = useState<number>(0);
  const later = useTimers();
  const setPressed = (n: number) => {
    setPressedState(n);
    later(() => setPressedState(0), 140);
  };

  useRaf((dt, now) => {
    setT(now / 1000);
    if (done) return;
    const on = vRef.current === g.target && !drag.current;
    lockRef.current = clamp(on ? lockRef.current + dt / LOCK_S : lockRef.current - dt * 3, 0, 1);
    setLock(lockRef.current);
    if (lockRef.current >= 1) finish(450);
  });

  const nudge = (d: number) => {
    if (done) return;
    const before = vRef.current;
    setV(vRef.current + d);
    if (vRef.current !== before) tsfx(vRef.current === g.target ? 'good' : 'move', 1);
  };
  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.dir === 'left' || k.dir === 'down') nudge(k.shift ? -5 : -1);
    else if (k.dir === 'right' || k.dir === 'up') nudge(k.shift ? 5 : 1);
  };

  const diff = Math.abs(v - g.target);
  const clarity = clamp(1 - diff / 30, 0, 1);
  const match = diff === 0;
  const wave = (freq: number, noise: number, phase: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 80; i++) {
      const x = i * 3;
      const n = noise * 16 * Math.sin(i * 7.31 + t * 31) * Math.cos(i * 2.17 + t * 13);
      pts.push(`${x},${(Math.sin(i * freq + phase) * 22 + n).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  const fCur = 0.12 + v * 0.0035;
  const fTgt = 0.12 + g.target * 0.0035;

  return (
    <GameShell kind={kind} label="Fix comms: tune the dial to the HQ frequency" reducedMotion={reducedMotion} onKey={onKey} status={`${freqOf(v)} megahertz, target ${freqOf(g.target)}${match ? ', locked' : ''}`}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.teal}
        tone2={C.cobalt}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || done) return;
          const p = svgPoint(svg.current, e);
          const a = Math.atan2(p.y - KNOB.y, p.x - KNOB.x);
          let da = a - d.a;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          d.a = a;
          d.acc += (da * 180) / Math.PI;
          const steps = Math.trunc(d.acc / DEG_PER_STEP);
          if (steps) {
            d.acc -= steps * DEG_PER_STEP;
            const before = vRef.current;
            setV(vRef.current + steps);
            if (vRef.current !== before) tsfx(vRef.current === g.target ? 'good' : 'move', 1);
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <Caption text="COMMS · SABOTAGE FIX" tone={C.tealHi} />
        {/* scope */}
        <rect x={16} y={52} width={290} height={196} rx={14} fill="#03080c" stroke="#134e4a" strokeWidth={2} />
        {Array.from({ length: 7 }, (_, i) => (
          <line key={`h${i}`} x1={26} x2={296} y1={70 + i * 27} y2={70 + i * 27} stroke={C.teal} strokeOpacity={0.08} />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <line key={`v${i}`} y1={60} y2={240} x1={30 + i * 29} x2={30 + i * 29} stroke={C.teal} strokeOpacity={0.08} />
        ))}
        <g transform="translate(41 150)">
          <polyline points={wave(fTgt, 0, t * 4)} fill="none" stroke={C.tealHi} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="5 4" />
          <polyline points={wave(fCur, 1 - clarity, t * 4)} fill="none" stroke={match ? C.tealHi : C.cobaltHi} strokeWidth={2.5} filter={ids.url('glow')} />
        </g>
        <text x={28} y={72} fontSize={9} fontWeight={800} fill={C.tealHi} opacity={0.8}>
          - - HQ SIGNAL
        </text>
        <text x={28} y={240} fontSize={9} fontWeight={800} fill={C.cobaltHi}>
          — YOUR RADIO
        </text>
        {/* readouts */}
        <rect x={16} y={262} width={140} height={58} rx={10} fill="#04070d" stroke={match ? C.tealHi : '#1e3a5f'} />
        <text x={28} y={280} fontSize={8.5} fontWeight={800} fill={C.muted} letterSpacing={1}>
          TUNED
        </text>
        <text x={144} y={310} textAnchor="end" fontSize={24} fontWeight={800} className="mmg-mono" fill={match ? C.tealHi : C.ink}>
          {freqOf(v)}
        </text>
        <rect x={166} y={262} width={140} height={58} rx={10} fill="#04070d" stroke="#134e4a" />
        <text x={178} y={280} fontSize={8.5} fontWeight={800} fill={C.muted} letterSpacing={1}>
          HQ COMMS
        </text>
        <text x={294} y={310} textAnchor="end" fontSize={24} fontWeight={800} className="mmg-mono" fill={C.tealHi}>
          {freqOf(g.target)}
        </text>
        <text x={161} y={340} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={match ? C.tealHi : C.muted}>
          {done ? 'Comms restored — Quill says hi ✉' : match ? 'Locking on…' : `${v < g.target ? 'tune up ▲' : 'tune down ▼'}`}
        </text>
        {/* knob */}
        <rect x={320} y={52} width={146} height={268} rx={16} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
        <g transform={`translate(${KNOB.x} ${KNOB.y})`}>
          {Array.from({ length: 21 }, (_, i) => {
            const a = ((-135 + (i / 20) * 270 - 90) * Math.PI) / 180;
            return <line key={i} x1={Math.cos(a) * (KNOB.r + 6)} y1={Math.sin(a) * (KNOB.r + 6)} x2={Math.cos(a) * (KNOB.r + (i % 5 ? 11 : 16))} y2={Math.sin(a) * (KNOB.r + (i % 5 ? 11 : 16))} stroke="#64748b" strokeWidth={1.5} />;
          })}
          {(() => {
            const a = ((-135 + (g.target / DIAL_MAX) * 270 - 90) * Math.PI) / 180;
            return <circle cx={Math.cos(a) * (KNOB.r + 20)} cy={Math.sin(a) * (KNOB.r + 20)} r={4} fill={C.tealHi} filter={ids.url('glow')} />;
          })()}
        </g>
        <g
          className={done ? undefined : 'mmg-grab'}
          onPointerDown={(e) => {
            if (done) return;
            capture(e);
            const p = svgPoint(svg.current, e);
            drag.current = { a: Math.atan2(p.y - KNOB.y, p.x - KNOB.x), acc: 0 };
          }}
        >
          <circle cx={KNOB.x} cy={KNOB.y} r={KNOB.r} fill="#1e293b" stroke="#475569" strokeWidth={3} filter={ids.url('shadow')} />
          <g transform={`translate(${KNOB.x} ${KNOB.y}) rotate(${-135 + (v / DIAL_MAX) * 270})`} className="mmg-fast">
            {Array.from({ length: 24 }, (_, i) => (
              <rect key={i} x={-2} y={-KNOB.r + 2} width={4} height={8} rx={2} fill="#334155" transform={`rotate(${i * 15})`} />
            ))}
            <circle r={KNOB.r - 14} fill="#273449" />
            <rect x={-4} y={-KNOB.r + 14} width={8} height={24} rx={4} fill={match ? C.tealHi : C.cobaltHi} filter={ids.url('glow')} />
          </g>
          <FocusCircle x={KNOB.x} y={KNOB.y} r={KNOB.r + 2} show={!done} />
        </g>
        <g transform={`translate(${KNOB.x} ${KNOB.y})`} pointerEvents="none">
          <circle r={KNOB.r + 24} fill="none" stroke={C.tealHi} strokeWidth={3} strokeDasharray={`${lock * 540} 540`} transform="rotate(-90)" opacity={lock > 0 ? 1 : 0} />
        </g>
        <SvgButton ids={ids} x={330} y={262} w={58} h={48} label="◀" onPress={() => { setPressed(-1); nudge(-1); }} pressed={pressed === -1} fontSize={18} />
        <SvgButton ids={ids} x={398} y={262} w={58} h={48} label="▶" onPress={() => { setPressed(1); nudge(1); }} pressed={pressed === 1} fontSize={18} />
        <text x={393} y={70} textAnchor="middle" fontSize={9} fontWeight={900} fill={C.muted} letterSpacing={1.4}>
          TUNING
        </text>
      </Stage>
    </GameShell>
  );
}
