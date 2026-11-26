import { useMemo, useRef, useState } from 'react';
import { Berry, Burst, C, Caption, GameShell, Meter, Stage, SvgButton, useFinish, useIds, useRaf, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const TRANSFER_S = 4.2;

const FILES = ['planner.json', 'reel_07.mp4', 'insights.db', 'quill_drafts', 'skills.cart', 'berry_census.csv', 'vibes.txt', 'hq_map.svg'];
const QUIPS = ['Folding bytes into envelopes…', 'Asking Quill for permission…', 'Squeezing through the tube…', 'Polishing the pixels…', 'Counting berries twice…', 'Almost… almost…'];

/** Monotonic progress curve that speeds up and eases off a little for charm. */
export function transferProgress(t: number): number {
  const x = Math.min(1, Math.max(0, t / TRANSFER_S));
  return Math.min(1, Math.max(0, x - 0.06 * Math.sin(2 * Math.PI * x)));
}

export function TransferGame({ kind, seed, onComplete, reducedMotion, mode }: MiniGameProps & { mode: 'download' | 'upload' }) {
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const r = useMemo(() => makeRng(seed, mode === 'download' ? 1515 : 1616), [seed, mode]);
  const files = useMemo(() => r.shuffle([...FILES]).slice(0, 4), [r]);
  const [running, setRunning] = useState(false);
  const elapsed = useRef(0);
  const [t, setT] = useState(0);
  const [burst, setBurst] = useState(0);
  const [pressed, setPressed] = useState(false);
  const later = useTimers();

  useRaf(
    (dt) => {
      elapsed.current += dt;
      setT(elapsed.current);
      if (elapsed.current >= TRANSFER_S) {
        setBurst(1);
        finish(350);
      }
    },
    running && !done,
  );

  const start = () => {
    if (running || done) return;
    setPressed(true);
    later(() => setPressed(false), 140);
    setRunning(true);
  };
  const onKey = (k: KeyInput) => {
    if (k.down && k.action && !k.repeat) start();
  };

  const p = transferProgress(t);
  const from = mode === 'download' ? { x: 92, label: 'HQ SERVER' } : { x: 92, label: 'YOUR TABLET' };
  const to = mode === 'download' ? { x: 388, label: 'YOUR TABLET' } : { x: 388, label: 'ADMIN CLOUD' };
  const remaining = Math.max(0, TRANSFER_S - t);
  const quip = QUIPS[Math.min(QUIPS.length - 1, Math.floor(p * QUIPS.length))] as string;
  const hop = (k: number) => {
    // each file icon arcs from source to target in turn
    const phase = (t * 1.25 + k * 0.33) % 1;
    const x = from.x + (to.x - from.x) * phase;
    const y = 150 - Math.sin(phase * Math.PI) * 70;
    return { x, y, phase };
  };

  return (
    <GameShell kind={kind} label={mode === 'download' ? 'Download data' : 'Upload data'} reducedMotion={reducedMotion} onKey={onKey} status={done ? 'Transfer complete' : running ? `${Math.round(p * 100)} percent` : 'Press start'}>
      <Stage ids={ids} tone={C.cobalt} tone2={C.teal}>
        <Caption text={mode === 'download' ? 'DATA TRANSFER · STEP 1' : 'DATA TRANSFER · STEP 2'} />
        {/* dotted arc */}
        <path d={`M${from.x + 40} 140 Q240 40 ${to.x - 40} 140`} stroke={C.cobaltHi} strokeOpacity={0.35} strokeWidth={2.5} strokeDasharray="4 8" fill="none" className={running && !done ? 'mmg-dash' : undefined} />
        {mode === 'download' ? <ServerArt x={from.x} y={150} active={running && !done} ids={ids} /> : <TabletArt x={from.x} y={150} fill={1 - p} />}
        {mode === 'download' ? <TabletArt x={to.x} y={150} fill={p} /> : <CloudArt x={to.x} y={150} fill={p} ids={ids} />}
        <text x={from.x} y={232} textAnchor="middle" fontSize={10} fontWeight={900} fill={C.muted} letterSpacing={1.2}>
          {from.label}
        </text>
        <text x={to.x} y={232} textAnchor="middle" fontSize={10} fontWeight={900} fill={C.muted} letterSpacing={1.2}>
          {to.label}
        </text>
        {running &&
          !done &&
          [0, 1, 2].map((k) => {
            const h = hop(k);
            const f = files[(Math.floor(t * 1.25 + k * 0.33) + k) % files.length] as string;
            return (
              <g key={k} transform={`translate(${h.x} ${h.y}) rotate(${(h.phase - 0.5) * 30})`} opacity={Math.sin(h.phase * Math.PI) * 0.9 + 0.1}>
                <path d="M-12 -15 h16 l8 8 v22 h-24 Z" fill="#f8fafc" stroke={C.cobaltHi} strokeWidth={1.5} />
                <path d="M4 -15 v8 h8" fill="#cbd5e1" />
                <circle cx={0} cy={4} r={5} fill={k % 2 ? C.berry : C.marion} />
                <text y={30} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={C.muted} className="mmg-mono">
                  {f}
                </text>
              </g>
            );
          })}
        {burst > 0 && <Burst k={burst} x={to.x} y={150} color={C.tealHi} />}
        <Meter x={60} y={250} w={360} h={16} value={p} ids={ids} color={done ? C.tealHi : C.cobaltHi} />
        <text x={60} y={284} fontSize={11.5} fontWeight={800} fill={C.ink}>
          {done ? 'Done! ✓' : running ? `${Math.round(p * 100)}%` : 'Ready'}
        </text>
        <text x={420} y={284} textAnchor="end" fontSize={11} fill={C.muted}>
          {done ? 'All bytes accounted for' : running ? `${quip} ~${Math.ceil(remaining)} berries left` : `Estimated time: ${Math.round(TRANSFER_S)} berries`}
        </text>
        {!running && !done && <SvgButton ids={ids} x={160} y={298} w={160} h={48} label={mode === 'download' ? 'Download' : 'Upload'} onPress={start} pressed={pressed} focus />}
      </Stage>
    </GameShell>
  );
}

function ServerArt({ x, y, active, ids }: { x: number; y: number; active: boolean; ids: ReturnType<typeof useIds> }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy={66} rx={52} ry={8} fill="#000" opacity={0.35} />
      <rect x={-44} y={-66} width={88} height={130} rx={10} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={-36} y={-56 + i * 30} width={72} height={22} rx={4} fill="#0a1020" />
          {[0, 1, 2].map((j) => (
            <circle key={j} cx={-26 + j * 10} cy={-45 + i * 30} r={2.6} fill={(i + j) % 2 ? C.tealHi : C.cobaltHi} className={active ? 'mmg-blink' : undefined} style={{ animationDelay: `${(i * 3 + j) * 0.11}s`, animationDuration: '0.5s' }} />
          ))}
          <rect x={6} y={-48 + i * 30} width={24} height={5} rx={2} fill="#1e293b" />
        </g>
      ))}
    </g>
  );
}

function TabletArt({ x, y, fill }: { x: number; y: number; fill: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy={66} rx={50} ry={8} fill="#000" opacity={0.35} />
      <rect x={-46} y={-62} width={92} height={124} rx={14} fill="#111827" stroke="#64748b" strokeWidth={2} />
      <rect x={-38} y={-52} width={76} height={100} rx={6} fill="#0b1a33" />
      <rect x={-38} y={48 - 100 * fill} width={76} height={100 * fill} rx={6} fill={C.cobalt} opacity={0.35} />
      <g transform="translate(0 -6)">
        <Berry kind="blue" r={16} face />
      </g>
      <text y={34} textAnchor="middle" fontSize={11} fontWeight={900} fill="#e0e7ff" className="mmg-mono">
        {Math.round(fill * 100)}%
      </text>
      <circle cy={55} r={3} fill="#334155" />
    </g>
  );
}

function CloudArt({ x, y, fill, ids }: { x: number; y: number; fill: number; ids: ReturnType<typeof useIds> }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g filter={ids.url('glow')}>
        <path d="M-52 26 a26 26 0 0 1 6 -50 a34 34 0 0 1 62 -10 a28 28 0 0 1 36 34 a22 22 0 0 1 -6 26 Z" fill="#1e3a8a" stroke={C.cobaltHi} strokeWidth={2} />
      </g>
      <path d="M-52 26 a26 26 0 0 1 6 -50 a34 34 0 0 1 62 -10 a28 28 0 0 1 36 34 a22 22 0 0 1 -6 26 Z" fill={C.tealHi} opacity={fill * 0.45} />
      <text y={10} textAnchor="middle" fontSize={12} fontWeight={900} fill="#e0f2fe" className="mmg-mono">
        {Math.round(fill * 100)}%
      </text>
      <rect x={-30} y={34} width={60} height={26} rx={5} fill="#0a1020" stroke="#2a3a62" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={-16 + i * 16} cy={47} r={3} fill={fill > (i + 1) / 3.5 ? C.tealHi : '#1e293b'} />
      ))}
    </g>
  );
}
