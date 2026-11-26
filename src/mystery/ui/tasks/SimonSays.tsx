import { useEffect, useMemo, useRef, useState } from 'react';
import { Berry, C, Caption, FocusRing, GameShell, Stage, gridMove, useFinish, useIds, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const SIMON_ROUNDS = 4;
export const SIMON_COLS = 3;
const ON_MS = 300;
const GAP_MS = 140;
const LEAD_MS = 550;

/** Final sequence; round r (0-based) shows the first r+1 pads. */
export function genSimonSays(seed: number): number[] {
  const r = makeRng(seed, 1818);
  const seq: number[] = [];
  while (seq.length < SIMON_ROUNDS) {
    const n = r.int(9);
    if (seq[seq.length - 1] !== n) seq.push(n);
  }
  return seq;
}

/** How long the playback of a round lasts (ms), for tests and pacing. */
export const simonPlaybackMs = (round: number): number => LEAD_MS + (round + 1) * (ON_MS + GAP_MS);

const PAD_COLORS = [C.berry, C.cobaltHi, C.tealHi, C.warn, C.marionHi, '#f472b6', C.leaf, '#38bdf8', C.brassHi];
const CELL = 78;
const GAP = 10;
const GX = 192;
const GY = 70;

type Phase = 'show' | 'input' | 'won' | 'oops';

export default function SimonSays({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const seq = useMemo(() => genSimonSays(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('show');
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [cursor, setCursor] = useState(4);
  const [replay, setReplay] = useState(0);
  const playId = useRef(0);

  // playback for the current round
  useEffect(() => {
    if (phase !== 'show') return;
    const id = ++playId.current;
    for (let i = 0; i <= round; i++) {
      const at = LEAD_MS + i * (ON_MS + GAP_MS);
      later(() => playId.current === id && setLit(seq[i] as number), at);
      later(() => playId.current === id && setLit(null), at + ON_MS);
    }
    later(() => {
      if (playId.current !== id) return;
      setStep(0);
      setPhase('input');
    }, simonPlaybackMs(round));
  }, [phase, round, replay, seq, later]);

  const press = (i: number) => {
    setCursor(i);
    if (phase !== 'input' || done) return;
    setLit(i);
    later(() => setLit((l) => (l === i ? null : l)), 180);
    if (seq[step] !== i) {
      setPhase('oops');
      later(() => {
        setReplay((r) => r + 1);
        setPhase('show');
      }, 900);
      return;
    }
    const s = step + 1;
    if (s > round) {
      if (round + 1 >= SIMON_ROUNDS) {
        setPhase('won');
        finish(450);
        return;
      }
      setPhase('won');
      later(() => {
        setRound(round + 1);
        setPhase('show');
      }, 450);
    } else setStep(s);
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (k.dir) setCursor((c) => gridMove(c, k.dir!, SIMON_COLS, 9));
    else if (k.action && !k.repeat) press(cursor);
    else if (/^[1-9]$/.test(k.key) && !k.repeat) {
      press(Number(k.key) - 1);
      return true;
    }
  };

  const status = phase === 'show' ? 'Watch…' : phase === 'input' ? 'Your turn' : phase === 'oops' ? 'Oops! Watch again' : round + 1 >= SIMON_ROUNDS ? 'Perfect!' : 'Nice!';
  const moodFace = phase === 'oops' ? 'sad' : phase === 'won' ? 'happy' : 'calm';

  return (
    <GameShell kind={kind} label="Repeat the light pattern" reducedMotion={reducedMotion} onKey={onKey} status={`Round ${round + 1} of ${SIMON_ROUNDS}. ${status}`}>
      <Stage ids={ids} tone={C.marion} tone2={C.cobalt}>
        <Caption text="MOOSE'S COPYCAT PANEL" tone={C.marionHi} />
        {/* left console */}
        <rect x={16} y={56} width={158} height={286} rx={16} fill="#0a1222" stroke="#2a3a62" />
        <g transform="translate(95 128)">
          <circle r={44} fill={phase === 'oops' ? C.bad : phase === 'input' ? C.teal : C.marion} fillOpacity={0.18} className="mmg-pulse" />
          <Berry kind="marion" r={30} face />
          {moodFace === 'sad' && <path d="M-10 18 q10 -8 20 0" stroke="#0b1020" strokeWidth={3} fill="none" transform="translate(0 2)" />}
        </g>
        <text x={95} y={206} textAnchor="middle" fontSize={17} fontWeight={900} fill={phase === 'oops' ? C.bad : phase === 'input' ? C.tealHi : C.marionHi}>
          {status}
        </text>
        <text x={95} y={236} textAnchor="middle" fontSize={10} fontWeight={800} fill={C.muted} letterSpacing={1.2}>
          ROUND {Math.min(round + 1, SIMON_ROUNDS)} / {SIMON_ROUNDS}
        </text>
        {Array.from({ length: SIMON_ROUNDS }, (_, i) => (
          <circle key={i} cx={95 - (SIMON_ROUNDS - 1) * 12 + i * 24} cy={260} r={7} fill={i < round || (i === round && phase === 'won') ? C.tealHi : i === round ? C.marionHi : '#1e293b'} filter={i < round ? ids.url('glow') : undefined} className="mmg-fill-t" />
        ))}
        {/* input progress dots */}
        {phase === 'input' &&
          Array.from({ length: round + 1 }, (_, i) => (
            <rect key={i} x={95 - ((round + 1) * 16) / 2 + i * 16 + 2} y={284} width={12} height={6} rx={3} fill={i < step ? C.tealHi : '#334155'} />
          ))}
        <text x={95} y={318} textAnchor="middle" fontSize={9.5} fill={C.muted}>
          {phase === 'show' ? 'memorise the glow' : 'tap the same pads'}
        </text>
        {/* pads */}
        <rect x={GX - 12} y={GY - 12} width={3 * CELL + 2 * GAP + 24} height={3 * CELL + 2 * GAP + 24} rx={20} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
        {Array.from({ length: 9 }, (_, i) => {
          const x = GX + (i % 3) * (CELL + GAP);
          const y = GY + Math.floor(i / 3) * (CELL + GAP);
          const on = lit === i;
          const col = PAD_COLORS[i] as string;
          return (
            <g key={i} className={phase === 'input' ? 'mmg-hit' : undefined} onPointerDown={() => press(i)}>
              <rect x={x} y={y} width={CELL} height={CELL} rx={14} fill={on ? col : '#121b30'} stroke={col} strokeOpacity={on ? 1 : 0.35} strokeWidth={2} filter={on ? ids.url('glowBig') : undefined} />
              <rect x={x + 6} y={y + 5} width={CELL - 12} height={CELL * 0.32} rx={9} fill="#fff" opacity={on ? 0.35 : 0.05} />
              <circle cx={x + CELL / 2} cy={y + CELL / 2} r={9} fill={col} opacity={on ? 1 : 0.35} />
              <text x={x + CELL - 10} y={y + CELL - 9} textAnchor="end" fontSize={9} fontWeight={800} fill="#64748b">
                {i + 1}
              </text>
              <FocusRing x={x} y={y} w={CELL} h={CELL} r={14} show={cursor === i && phase === 'input'} />
            </g>
          );
        })}
      </Stage>
    </GameShell>
  );
}
