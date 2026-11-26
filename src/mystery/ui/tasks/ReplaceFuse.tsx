import { useMemo, useRef, useState } from 'react';
import { Burst, C, Caption, GameShell, Stage, Toast, gridMove, svgPoint, useBump, useFinish, useIds, useShell, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const FUSE_COLS = 4;
export const FUSE_COUNT = 8;

export function genReplaceFuse(seed: number): { blown: number } {
  const r = makeRng(seed, 2424);
  return { blown: r.int(FUSE_COUNT) };
}

const FX0 = 96;
const FDX = 96;
const FY = [88, 222];
const fusePos = (i: number) => ({ x: FX0 + (i % FUSE_COLS) * FDX, y: FY[Math.floor(i / FUSE_COLS)] as number });

type Phase = 'find' | 'insert' | 'lit';

export default function ReplaceFuse({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genReplaceFuse(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [phase, setPhase] = useState<Phase>('find');
  const [cursor, setCursor] = useState(0);
  const [torch, setTorch] = useState(() => ({ x: fusePos(0).x, y: fusePos(0).y + 40 }));
  const [fine, setFine] = useState({ k: 0, i: -1 });
  const [toast, bumpToast] = useBump();
  const [burst, setBurst] = useState(0);

  const moveCursor = (i: number) => {
    setCursor(i);
    const p = fusePos(i);
    setTorch({ x: p.x, y: p.y + 40 });
  };

  const act = (i: number) => {
    if (done) return;
    moveCursor(i);
    if (phase === 'find') {
      if (i !== g.blown) {
        setFine((f) => ({ k: f.k + 1, i }));
        bumpToast();
        return;
      }
      setPhase('insert');
    } else if (phase === 'insert' && i === g.blown) {
      setPhase('lit');
      setBurst(1);
      later(() => finish(400), 300);
    }
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.dir) moveCursor(gridMove(cursor, k.dir, FUSE_COLS, FUSE_COUNT));
    else if (k.action && !k.repeat) act(cursor);
  };

  const lit = phase === 'lit';
  return (
    <GameShell kind={kind} label="Replace the blown fuse" reducedMotion={reducedMotion} onKey={onKey} status={phase === 'find' ? `Fuse ${cursor + 1}` : phase === 'insert' ? 'Insert the new fuse in the empty clip' : 'Power restored'}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={lit ? C.warn : '#1e293b'}
        tone2={C.cobalt}
        onPointerMove={(e) => setTorch(svgPoint(svg.current, e))}
        onPointerDown={(e) => setTorch(svgPoint(svg.current, e))}
        defs={
          <>
            <radialGradient id={ids.id('torch')}>
              <stop offset="0" stopColor="#000" stopOpacity="1" />
              <stop offset="0.55" stopColor="#000" stopOpacity="0.9" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            <mask id={ids.id('dark')} maskUnits="userSpaceOnUse" x="0" y="0" width="480" height="360">
              <rect width={480} height={360} fill="#fff" />
              <circle cx={torch.x} cy={torch.y} r={92} fill={ids.url('torch')} />
            </mask>
            <linearGradient id={ids.id('glassF')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.25" />
              <stop offset="0.5" stopColor="#e0f2fe" stopOpacity="0.08" />
              <stop offset="1" stopColor="#e0f2fe" stopOpacity="0.2" />
            </linearGradient>
          </>
        }
      >
        {/* fuse box */}
        <rect x={34} y={44} width={412} height={296} rx={18} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={2} />
        <rect x={50} y={60} width={380} height={264} rx={10} fill="#0a0f1c" />
        <text x={240} y={206} textAnchor="middle" fontSize={8.5} fontWeight={900} fill="#334155" letterSpacing={2}>
          DANGER · HIGH VOLTAGE · NO BERRIES
        </text>
        {Array.from({ length: FUSE_COUNT }, (_, i) => {
          const p = fusePos(i);
          const blown = i === g.blown;
          const empty = blown && phase === 'insert';
          const fresh = blown && phase === 'lit';
          return (
            <g key={i} className="mmg-hit" onPointerDown={() => act(i)}>
              <rect x={p.x - 40} y={p.y - 10} width={80} height={110} fill="transparent" />
              {/* clips */}
              <rect x={p.x - 16} y={p.y} width={32} height={12} rx={3} fill="#94a3b8" />
              <rect x={p.x - 16} y={p.y + 82} width={32} height={12} rx={3} fill="#94a3b8" />
              <text x={p.x} y={p.y + 110} textAnchor="middle" fontSize={8} fontWeight={800} fill="#475569">
                F{i + 1}
              </text>
              {!empty && (
                <g key={`${fine.i === i ? fine.k : 0}-${fresh ? 'n' : 'o'}`} className={fine.i === i && fine.k ? 'mmg-wobble' : fresh ? 'mmg-pop' : undefined}>
                  <rect x={p.x - 12} y={p.y + 4} width={24} height={16} rx={3} fill="#cbd5e1" />
                  <rect x={p.x - 12} y={p.y + 74} width={24} height={16} rx={3} fill="#cbd5e1" />
                  <rect x={p.x - 11} y={p.y + 18} width={22} height={58} rx={4} fill={blown && !fresh ? '#1c1917' : '#0f1a2e'} stroke="#e0f2fe" strokeOpacity={0.35} />
                  <rect x={p.x - 11} y={p.y + 18} width={22} height={58} rx={4} fill={ids.url('glassF')} />
                  {blown && !fresh ? (
                    <g>
                      <path d={`M${p.x} ${p.y + 20} l-3 12 l5 6 l-4 9`} stroke="#57534e" strokeWidth={1.6} fill="none" />
                      <path d={`M${p.x} ${p.y + 74} l2 -10 l-4 -5`} stroke="#57534e" strokeWidth={1.6} fill="none" />
                      <ellipse cx={p.x} cy={p.y + 47} rx={9} ry={14} fill="#000" opacity={0.55} />
                      <path d={`M${p.x - 9} ${p.y + 26} l7 9 l-3 5 l8 10`} stroke="#e7e5e4" strokeOpacity={0.6} strokeWidth={1} fill="none" />
                    </g>
                  ) : (
                    <path d={`M${p.x} ${p.y + 20} q-6 6 0 12 t0 12 t0 12 t0 12 t0 8`} stroke={lit || !blown ? '#fdba74' : '#fdba74'} strokeWidth={1.8} fill="none" filter={ids.url('glow')} />
                  )}
                </g>
              )}
              {empty && <rect x={p.x - 12} y={p.y + 12} width={24} height={70} rx={4} fill="none" stroke={C.warn} strokeDasharray="4 3" className="mmg-pulse-fast" />}
            </g>
          );
        })}
        {/* darkness with torch hole */}
        <rect width={480} height={360} fill="#010205" opacity={lit ? 0 : 0.94} mask={ids.url('dark')} pointerEvents="none" className="mmg-fade" style={{ transition: 'opacity 600ms ease' }} />
        {!lit && <circle cx={torch.x} cy={torch.y} r={92} fill="#fde68a" opacity={0.07} pointerEvents="none" />}
        {/* new fuse in hand */}
        {phase === 'insert' && (
          <g transform={`translate(${torch.x + 26} ${torch.y - 10}) rotate(18)`} pointerEvents="none" className="mmg-pop">
            <rect x={-12} y={-34} width={24} height={14} rx={3} fill="#e2e8f0" />
            <rect x={-12} y={22} width={24} height={14} rx={3} fill="#e2e8f0" />
            <rect x={-11} y={-22} width={22} height={46} rx={4} fill="#0f1a2e" stroke="#e0f2fe" strokeOpacity={0.5} />
            <path d="M0 -20 q-6 5 0 10 t0 10 t0 10 t0 10" stroke="#fdba74" strokeWidth={1.8} fill="none" />
          </g>
        )}
        <TorchCursor x={torch.x} y={torch.y} show={!lit} />
        {burst > 0 && <Burst k={burst} x={fusePos(g.blown).x} y={fusePos(g.blown).y + 47} color={C.warn} />}
        <Caption text={lit ? 'POWER RESTORED' : 'LIGHTS OUT · FUSE BOX'} tone={lit ? C.warn : C.muted} />
        <text x={466} y={30} textAnchor="end" fontSize={10.5} fontWeight={700} fill={phase === 'insert' ? C.warn : C.muted}>
          {phase === 'find' ? 'find the dead fuse' : phase === 'insert' ? 'pop the new one in!' : 'let there be light'}
        </text>
        <Toast k={toast} text="That one's fine — keep looking" tone={C.warn} y={352 - 20} />
      </Stage>
    </GameShell>
  );
}

function TorchCursor({ x, y, show }: { x: number; y: number; show: boolean }) {
  const { kbd } = useShell();
  if (!show) return null;
  return (
    <g pointerEvents="none" opacity={kbd ? 1 : 0.7}>
      <circle cx={x} cy={y} r={92} fill="none" stroke="#fde68a" strokeOpacity={0.25} strokeWidth={2} strokeDasharray="5 6" className="mmg-dash" />
    </g>
  );
}
