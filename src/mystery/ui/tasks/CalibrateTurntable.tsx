import { useMemo, useRef, useState } from 'react';
import { Berry, C, Caption, FocusRing, GameShell, Stage, capture, clamp, svgPoint, useFinish, useIds, useRaf, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const TARGET_BPM = 72;
const MIN_BPM = 50;
const MAX_BPM = 94;
const LOCK_S = 1.0;
const TOL = 0.6;

export function genTurntable(seed: number): { start: number } {
  const r = makeRng(seed, 606);
  const start = r.chance(0.5) ? 56 + r.int(10) : 79 + r.int(10);
  return { start };
}

const FADER = { x: 404, top: 74, bottom: 300 };
const bpmToY = (b: number) => FADER.bottom - ((b - MIN_BPM) / (MAX_BPM - MIN_BPM)) * (FADER.bottom - FADER.top);
const yToBpm = (y: number) => MIN_BPM + ((FADER.bottom - y) / (FADER.bottom - FADER.top)) * (MAX_BPM - MIN_BPM);

export default function CalibrateTurntable({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genTurntable(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const [bpm, setBpmState] = useState(g.start);
  const bpmRef = useRef(g.start);
  const setBpm = (v: number) => {
    const n = Math.round(clamp(v, MIN_BPM, MAX_BPM) * 2) / 2;
    bpmRef.current = n;
    setBpmState(n);
  };
  const [dragging, setDragging] = useState(false);
  const [lock, setLock] = useState(0);
  const lockRef = useRef(0);
  const [beat, setBeat] = useState({ a: false, b: false });
  const phase = useRef({ a: 0, b: 0, spin: 0 });
  const [spin, setSpin] = useState(0);

  useRaf((dt) => {
    const ph = phase.current;
    ph.a = (ph.a + (dt * bpmRef.current) / 60) % 1;
    ph.b = (ph.b + (dt * TARGET_BPM) / 60) % 1;
    ph.spin = (ph.spin + dt * (bpmRef.current / TARGET_BPM) * 200) % 360;
    setSpin(ph.spin);
    setBeat({ a: ph.a < 0.18, b: ph.b < 0.18 });
    if (done) return;
    const on = Math.abs(bpmRef.current - TARGET_BPM) <= TOL && !dragging;
    const l = on ? lockRef.current + dt / LOCK_S : Math.max(0, lockRef.current - dt * 2);
    lockRef.current = Math.min(1, l);
    setLock(lockRef.current);
    if (l >= 1) finish(350);
  });

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    const step = k.shift ? 0.5 : 1;
    if (k.dir === 'up' || k.dir === 'right') setBpm(bpmRef.current + step);
    else if (k.dir === 'down' || k.dir === 'left') setBpm(bpmRef.current - step);
  };

  const diff = bpm - TARGET_BPM;
  const close = Math.abs(diff) <= TOL;
  const ky = bpmToY(bpm);

  return (
    <GameShell kind={kind} label="Calibrate the turntable to 72 bpm" reducedMotion={reducedMotion} onKey={onKey} status={`${bpm.toFixed(1)} bpm${close ? ', locked on' : ''}`}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.marion}
        tone2={C.teal}
        onPointerMove={(e) => {
          if (dragging && !done) setBpm(yToBpm(svgPoint(svg.current, e).y));
        }}
        onPointerUp={() => setDragging(false)}
        defs={
          <radialGradient id={ids.id('vinyl')} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#1f2937" />
            <stop offset="0.6" stopColor="#0b0f1a" />
            <stop offset="1" stopColor="#111827" />
          </radialGradient>
        }
      >
        <Caption text="BARRY'S LIFE HUB · TURNTABLE" tone={C.marionHi} />
        {/* deck */}
        <rect x={20} y={46} width={340} height={292} rx={18} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
        <circle cx={170} cy={196} r={124} fill="#0a0f1c" stroke="#334155" />
        {/* strobe dots on platter edge */}
        <g transform={`translate(170 196) rotate(${spin})`}>
          {Array.from({ length: 36 }, (_, i) => {
            const a = (i / 36) * Math.PI * 2;
            return <circle key={i} cx={Math.cos(a) * 118} cy={Math.sin(a) * 118} r={2.2} fill={close ? C.tealHi : '#64748b'} opacity={i % 2 ? 0.5 : 1} />;
          })}
          <circle r={110} fill={ids.url('vinyl')} />
          {[96, 84, 72, 60, 50].map((rr) => (
            <circle key={rr} r={rr} fill="none" stroke="#fff" strokeOpacity={0.05} />
          ))}
          <path d="M-100 -30 A105 105 0 0 1 -30 -100" stroke="#fff" strokeOpacity={0.12} strokeWidth={6} fill="none" />
          <circle r={38} fill={C.berry} />
          <circle r={38} fill="none" stroke="#fff" strokeOpacity={0.25} strokeDasharray="3 4" />
          <Berry kind="marion" r={14} face x={0} y={-4} />
          <text y={26} textAnchor="middle" fontSize={7} fontWeight={900} fill="#fff" letterSpacing={1}>
            LO-FI · 72
          </text>
          <circle r={3} fill="#e2e8f0" />
        </g>
        {/* tone arm */}
        <g>
          <circle cx={318} cy={84} r={16} fill="#1e293b" stroke="#64748b" />
          <path d="M318 84 L300 210 L262 248" stroke="#cbd5e1" strokeWidth={5} fill="none" strokeLinecap="round" />
          <rect x={248} y={240} width={20} height={14} rx={3} fill="#94a3b8" transform="rotate(40 258 247)" />
        </g>
        {/* beat lights */}
        <g transform="translate(40 300)">
          <circle cx={10} cy={10} r={9} fill={beat.a ? (close ? C.tealHi : C.berryHi) : '#1e293b'} filter={beat.a ? ids.url('glow') : undefined} />
          <text x={26} y={14} fontSize={9.5} fontWeight={800} fill={C.muted}>
            TRACK
          </text>
          <circle cx={84} cy={10} r={9} fill={beat.b ? C.cobaltHi : '#1e293b'} filter={beat.b ? ids.url('glow') : undefined} />
          <text x={100} y={14} fontSize={9.5} fontWeight={800} fill={C.muted}>
            HQ 72
          </text>
        </g>
        {/* readout */}
        <g transform="translate(232 290)">
          <rect width={112} height={38} rx={8} fill="#04070d" stroke={close ? C.tealHi : '#2a3a62'} />
          <text x={56} y={26} textAnchor="middle" fontSize={21} fontWeight={800} className="mmg-mono" fill={close ? C.tealHi : Math.abs(diff) < 5 ? C.warn : C.berryHi}>
            {bpm.toFixed(1)}
          </text>
          <text x={104} y={34} textAnchor="end" fontSize={6.5} fontWeight={800} fill={C.muted}>
            BPM
          </text>
        </g>
        {/* pitch fader */}
        <g>
          <rect x={372} y={50} width={92} height={290} rx={18} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
          <text x={418} y={68} textAnchor="middle" fontSize={9} fontWeight={900} fill={C.muted} letterSpacing={1.4}>
            PITCH
          </text>
          <rect x={FADER.x - 4} y={FADER.top} width={8} height={FADER.bottom - FADER.top} rx={4} fill="#04070d" />
          {Array.from({ length: 12 }, (_, i) => {
            const b = MIN_BPM + i * 4;
            const y = bpmToY(b);
            return <line key={i} x1={FADER.x + 12} x2={FADER.x + 20} y1={y} y2={y} stroke="#475569" strokeWidth={1.5} />;
          })}
          <g>
            <rect x={FADER.x + 12} y={bpmToY(TARGET_BPM) - 9} width={44} height={18} rx={9} fill={C.teal} opacity={close ? 0.9 : 0.25} className="mmg-fill-t" />
            <text x={FADER.x + 34} y={bpmToY(TARGET_BPM) + 4} textAnchor="middle" fontSize={10} fontWeight={900} fill={close ? '#042f2e' : C.tealHi}>
              72
            </text>
          </g>
          <text x={FADER.x + 34} y={FADER.top + 8} textAnchor="middle" fontSize={9} fill={C.muted}>
            +
          </text>
          <text x={FADER.x + 34} y={FADER.bottom + 2} textAnchor="middle" fontSize={11} fill={C.muted}>
            −
          </text>
          <g
            className={dragging ? 'mmg-grab' : 'mmg-grab mmg-fast'}
            style={{ transform: `translate(0px,${ky}px)` }}
            onPointerDown={(e) => {
              if (done) return;
              capture(e);
              setDragging(true);
            }}
          >
            <rect x={FADER.x - 26} y={-30} width={52} height={60} fill="transparent" />
            <rect x={FADER.x - 22} y={-13} width={44} height={26} rx={6} fill="#e2e8f0" stroke="#64748b" filter={ids.url('shadow')} />
            <rect x={FADER.x - 22} y={-1.5} width={44} height={3} fill={close ? C.teal : C.berry} />
          </g>
          <FocusRing x={FADER.x - 24} y={ky - 15} w={48} h={30} r={7} show={!done} />
        </g>
        {/* lock ring */}
        <g transform="translate(170 196)" pointerEvents="none">
          <circle r={132} fill="none" stroke={C.tealHi} strokeOpacity={0.15} strokeWidth={5} />
          <circle r={132} fill="none" stroke={C.tealHi} strokeWidth={5} strokeLinecap="round" strokeDasharray={`${lock * 829} 829`} transform="rotate(-90)" filter={ids.url('glow')} />
        </g>
        <text x={190} y={354} textAnchor="middle" fontSize={11.5} fontWeight={800} fill={close ? C.tealHi : C.muted}>
          {done ? 'Locked at 72 — smooth.' : close ? 'Hold it… locking' : diff > 0 ? 'Too fast — bring it down' : 'Too slow — bring it up'}
        </text>
      </Stage>
    </GameShell>
  );
}
