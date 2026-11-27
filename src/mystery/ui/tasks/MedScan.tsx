import { useMemo, useRef, useState } from 'react';
import { Berry, C, Caption, GameShell, Meter, Stage, SvgButton, Toast, tsfx, useBump, useFinish, useHoldSound, useIds, useRaf, type BerryKind, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const SCAN_S = 6.3;

export function genMedScan(seed: number) {
  const r = makeRng(seed, 2121);
  const berry = r.pick<BerryKind>(['rasp', 'blue', 'marion', 'straw']);
  const juice = { rasp: 'Raspberry', blue: 'Blueberry', marion: 'Marionberry', straw: 'Strawberry', cherry: 'Cherry', goose: 'Gooseberry' }[berry];
  return {
    berry,
    lines: [
      ['ID', `crewberry #${String(r.int(900) + 100)}`],
      ['HEIGHT', `${(2 + r.next() * 2).toFixed(1)} berries`],
      ['JUICE', juice],
      ['SEEDS', String(80 + r.int(240))],
      ['VIBE', r.pick(['crisp', 'zesty', 'chill', 'jammy', 'tart'])],
      ['STATUS', 'healthy ✓'],
    ] as [string, string][],
  };
}

export default function MedScan({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genMedScan(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const [running, setRunning] = useState(false);
  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [clock, setClock] = useState(0);
  const [moved, bumpMoved] = useBump();
  const [pressed, setPressed] = useState(false);
  useHoldSound(running && !done, 'scan');

  useRaf((dt, now) => {
    setClock(now / 1000);
    if (!running || done) return;
    tRef.current = Math.min(SCAN_S, tRef.current + dt);
    setT(tRef.current);
    if (tRef.current >= SCAN_S) finish(400);
  });

  const start = () => {
    if (running || done) return;
    setPressed(true);
    tsfx('grab');
    setRunning(true);
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.action && !k.repeat && !running) start();
    else if (k.dir && running && !k.repeat) {
      // fidgeting restarts the scan
      tRef.current = 0;
      setT(0);
      tsfx('bad');
      bumpMoved();
    }
  };

  const p = t / SCAN_S;
  const sweepY = 96 + (Math.sin(clock * 2.4) * 0.5 + 0.5) * 170;
  const shown = Math.floor(p * (g.lines.length + 0.2));

  return (
    <GameShell kind={kind} label="Submit scan: stand still on the scanner" reducedMotion={reducedMotion} onKey={onKey} status={done ? 'Scan complete' : running ? `Scanning ${Math.round(p * 100)} percent` : 'Press start'}>
      <Stage ids={ids} tone={C.teal} tone2={C.cobalt}>
        <Caption text="MEDBAY · BIO SCANNER" tone={C.tealHi} />
        {/* pad */}
        <ellipse cx={150} cy={300} rx={96} ry={24} fill="#0b1f2a" stroke={C.tealHi} strokeOpacity={0.6} strokeWidth={2} />
        <ellipse cx={150} cy={300} rx={70} ry={16} fill="none" stroke={C.tealHi} strokeOpacity={0.3} strokeDasharray="4 6" className={running ? 'mmg-dash' : undefined} />
        {/* holo column */}
        <path d="M58 300 L72 70 H228 L242 300 Z" fill={C.teal} opacity={running ? 0.08 : 0.03} />
        {Array.from({ length: 9 }, (_, i) => (
          <line key={i} x1={66 + i * 21} y1={84} x2={62 + i * 22} y2={296} stroke={C.tealHi} strokeOpacity={0.07} />
        ))}
        {/* character */}
        <g key={moved} className={moved ? 'mmg-shake' : undefined}>
          <g transform="translate(150 206)">
            <ellipse cx={-18} cy={74} rx={12} ry={6} fill="#334155" />
            <ellipse cx={18} cy={74} rx={12} ry={6} fill="#334155" />
            <rect x={-22} y={44} width={8} height={30} rx={4} fill="#475569" />
            <rect x={14} y={44} width={8} height={30} rx={4} fill="#475569" />
            <path d="M-52 4 q-14 18 -6 34" stroke="#475569" strokeWidth={8} fill="none" strokeLinecap="round" />
            <path d="M52 4 q14 18 6 34" stroke="#475569" strokeWidth={8} fill="none" strokeLinecap="round" />
            <Berry kind={g.berry} r={58} face />
          </g>
        </g>
        {/* scan beam */}
        {running && !done && (
          <g pointerEvents="none">
            <rect x={60} y={sweepY - 14} width={180} height={28} fill={C.tealHi} opacity={0.12} filter={ids.url('blur')} />
            <line x1={60} y1={sweepY} x2={240} y2={sweepY} stroke="#99f6e4" strokeWidth={2.5} filter={ids.url('glow')} />
          </g>
        )}
        {done && (
          <text x={150} y={58} textAnchor="middle" fontSize={14} fontWeight={900} fill={C.tealHi} className="mmg-pop">
            All clear!
          </text>
        )}
        {/* readout */}
        <rect x={276} y={50} width={190} height={234} rx={14} fill="#04090f" stroke="#134e4a" />
        <text x={290} y={74} fontSize={10} fontWeight={900} fill={C.tealHi} letterSpacing={1.4}>
          SCAN REPORT
        </text>
        {g.lines.map(([k, v], i) => (
          <g key={k} opacity={i < shown ? 1 : 0.25}>
            <text x={290} y={104 + i * 28} fontSize={9} fontWeight={800} fill={C.muted} letterSpacing={1}>
              {k}
            </text>
            <text x={454} y={104 + i * 28} textAnchor="end" fontSize={11.5} fontWeight={800} fill={i < shown ? (k === 'STATUS' ? C.good : '#ccfbf1') : '#334155'} className="mmg-mono">
              {i < shown ? v : '······'}
            </text>
            <line x1={290} x2={454} y1={112 + i * 28} y2={112 + i * 28} stroke="#134e4a" strokeOpacity={0.6} />
          </g>
        ))}
        {running || done ? (
          <g>
            <Meter x={276} y={308} w={190} h={14} value={p} ids={ids} color={C.tealHi} />
            <text x={371} y={342} textAnchor="middle" fontSize={11} fontWeight={800} fill={done ? C.good : C.tealHi}>
              {done ? 'SCAN SUBMITTED' : `SCANNING ${Math.round(p * 100)}% · hold still`}
            </text>
          </g>
        ) : (
          <SvgButton ids={ids} x={296} y={296} w={150} h={48} label="Start scan" color={C.teal} hi={C.tealHi} onPress={start} pressed={pressed} focus />
        )}
        <Toast k={moved} text="Hold still! Restarting scan…" tone={C.warn} y={34} />
      </Stage>
    </GameShell>
  );
}
