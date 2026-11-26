import { useMemo, useState } from 'react';
import { Berry, Burst, C, Caption, FocusRing, GameShell, Stage, gridMove, useBump, useFinish, useIds, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'] as const;
export const OK_INDEX = 11;

export function genKeypadCode(seed: number): string {
  const r = makeRng(seed, 1919);
  let s = '';
  while (s.length < 4) s += String(r.int(10));
  return s;
}

const KW = 64;
const KH = 50;
const GAP = 9;
const KX = 250;
const KY = 112;

export default function KeypadCode({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const code = useMemo(() => genKeypadCode(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [entry, setEntry] = useState('');
  const [cursor, setCursor] = useState(OK_INDEX);
  const [state, setState] = useState<'idle' | 'denied' | 'ok'>('idle');
  const [err, bumpErr] = useBump();
  const [pressed, setPressed] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);

  const tap = (i: number) => {
    if (done) return;
    setPressed(i);
    later(() => setPressed((p) => (p === i ? null : p)), 120);
    const key = KEYS[i];
    if (key === '⌫') {
      setEntry((e) => e.slice(0, -1));
      setState('idle');
    } else if (key === 'OK') submit();
    else if (key) {
      setState('idle');
      setEntry((e) => (e.length < 4 ? e + key : e));
    }
  };

  const submit = () => {
    if (entry === code) {
      setState('ok');
      setBurst(1);
      finish(600);
    } else {
      setState('denied');
      bumpErr();
      later(() => {
        setEntry('');
        setState('idle');
      }, 700);
    }
  };

  const onKey = (k: KeyInput) => {
    if (!k.down || done) return;
    if (/^[0-9]$/.test(k.key)) {
      tap(k.key === '0' ? 10 : Number(k.key) - 1);
      return true;
    }
    if (k.key === 'Backspace') {
      tap(9);
      return true;
    }
    if (k.dir) setCursor((c) => gridMove(c, k.dir!, 3, 12));
    else if (k.action && !k.repeat) tap(cursor);
  };

  return (
    <GameShell kind={kind} label="Enter the keypad code from the sticky note" reducedMotion={reducedMotion} onKey={onKey} status={state === 'ok' ? 'Access granted' : state === 'denied' ? 'Access denied' : `${entry.length} of 4 digits entered`}>
      <Stage ids={ids} tone={C.berry} tone2={C.cobalt}>
        <Caption text="ADMIN · DOOR KEYPAD" tone={C.berryHi} />
        {/* sticky note */}
        <g transform="translate(36 84) rotate(-6)">
          <rect x={4} y={6} width={176} height={176} fill="#000" opacity={0.3} />
          <path d="M0 0 H176 V160 L160 176 H0 Z" fill="#fde68a" />
          <path d="M176 160 L160 176 V160 Z" fill="#f59e0b" opacity={0.7} />
          <rect x={58} y={-10} width={60} height={20} fill="#fff" opacity={0.45} transform="rotate(4 88 0)" />
          <text x={88} y={40} textAnchor="middle" fontSize={13} fontWeight={700} fill="#92400e" fontStyle="italic">
            door code
          </text>
          <text x={88} y={98} textAnchor="middle" fontSize={44} fontWeight={900} fill="#1e3a8a" fontStyle="italic" letterSpacing={6} className="mmg-mono">
            {code}
          </text>
          <path d="M28 110 q60 10 120 -2" stroke="#1e3a8a" strokeWidth={2.5} fill="none" opacity={0.6} />
          <text x={88} y={140} textAnchor="middle" fontSize={11} fill="#92400e" fontStyle="italic">
            don't tell Kanye!!
          </text>
          <g transform="translate(150 140) rotate(12)">
            <Berry kind="straw" r={11} face />
          </g>
        </g>
        {/* keypad housing */}
        <rect x={KX - 16} y={34} width={3 * KW + 2 * GAP + 32} height={316} rx={18} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
        <g key={err} className={err ? 'mmg-shake' : undefined}>
          <rect x={KX} y={50} width={3 * KW + 2 * GAP} height={48} rx={8} fill={state === 'denied' ? '#2a0a12' : state === 'ok' ? '#04241c' : '#04070d'} stroke={state === 'denied' ? C.bad : state === 'ok' ? C.good : '#1e3a5f'} strokeWidth={1.5} className="mmg-fill-t" />
          {state === 'idle' ? (
            Array.from({ length: 4 }, (_, i) => (
              <g key={i}>
                <rect x={KX + 24 + i * 40} y={86} width={28} height={3} rx={1.5} fill={i === entry.length ? C.cobaltHi : '#334155'} className={i === entry.length ? 'mmg-blink' : undefined} />
                <text x={KX + 38 + i * 40} y={82} textAnchor="middle" fontSize={24} fontWeight={800} fill={C.cobaltHi} className="mmg-mono">
                  {entry[i] ?? ''}
                </text>
              </g>
            ))
          ) : (
            <text x={KX + (3 * KW + 2 * GAP) / 2} y={81} textAnchor="middle" fontSize={15} fontWeight={900} fill={state === 'ok' ? C.good : C.bad} className="mmg-mono" letterSpacing={1}>
              {state === 'ok' ? 'ACCESS GRANTED' : 'DENIED'}
            </text>
          )}
        </g>
        {KEYS.map((key, i) => {
          const x = KX + (i % 3) * (KW + GAP);
          const y = KY + Math.floor(i / 3) * (KH + GAP);
          const isOk = key === 'OK';
          const isDel = key === '⌫';
          const down = pressed === i;
          return (
            <g key={key} className="mmg-hit" onPointerDown={() => tap(i)}>
              <rect x={x} y={y + 4} width={KW} height={KH} rx={10} fill="#000" opacity={0.4} />
              <g className="mmg-fast" style={{ transform: `translateY(${down ? 3 : 0}px)` }}>
                <rect x={x} y={y} width={KW} height={KH} rx={10} fill={isOk ? C.teal : isDel ? '#3b1d2a' : '#1e2b49'} stroke={isOk ? C.tealHi : isDel ? C.berry : '#3a4d78'} />
                <rect x={x + 4} y={y + 3} width={KW - 8} height={KH * 0.36} rx={7} fill="#fff" opacity={0.08} />
                <text x={x + KW / 2} y={y + KH / 2 + 8} textAnchor="middle" fontSize={isOk ? 16 : 22} fontWeight={900} fill={isOk ? '#042f2e' : '#e0e7ff'} className={isOk ? undefined : 'mmg-mono'}>
                  {key}
                </text>
              </g>
              <FocusRing x={x} y={y} w={KW} h={KH} r={10} show={cursor === i && !done} />
            </g>
          );
        })}
        {burst > 0 && <Burst k={burst} x={KX + (3 * KW + 2 * GAP) / 2} y={74} color={C.good} />}
      </Stage>
    </GameShell>
  );
}
