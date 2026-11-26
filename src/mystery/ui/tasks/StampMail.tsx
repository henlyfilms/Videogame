import { useMemo, useState } from 'react';
import { Berry, Burst, C, Caption, FocusRing, GameShell, Stage, Toast, useBump, useFinish, useIds, useTimers, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

const GOOD = [
  ['Barry', 'Planner sync for Thursday'],
  ['Greek', 'Render Green — ship it?'],
  ['Sift', '3 fresh insight cards'],
  ['Moose', 'Co-Pilot notes, ready'],
  ['Kanye', 'Agent build passed'],
  ['Daniel', 'Delegation summary'],
  ['Bot Builder', 'New spawn spec: Gauge'],
  ['Barry', 'Vault restore request'],
] as const;
const NOISE = [
  ['W1N-BIG', 'FREE berry yacht!!! claim'],
  ['no-reply', 'Re: Fwd: Fwd: lol'],
  ['deals4u', 'Miracle juice cleanse 900%'],
  ['totally.legit', 'Your fridge has a virus'],
  ['newsletter', 'Unsubscribe to unsubscribe'],
  ['PRINCE', 'Jamland royal needs $$$'],
  ['spam-o-matic', 'You won? (you did not)'],
] as const;

export interface Letter {
  good: boolean;
  from: string;
  subject: string;
}

export function genStampMail(seed: number): Letter[] {
  const r = makeRng(seed, 101);
  const n = 5;
  const goodCount = 2 + r.int(2); // 2-3 good
  const flags = r.shuffle(Array.from({ length: n }, (_, i) => i < goodCount));
  const goods = r.shuffle([...GOOD]);
  const bads = r.shuffle([...NOISE]);
  let gi = 0;
  let bi = 0;
  return flags.map((good) => {
    const [from, subject] = good ? goods[gi++ % goods.length]! : bads[bi++ % bads.length]!;
    return { good, from, subject };
  });
}

type Anim = null | 'stamp' | 'toss';

export default function StampMail({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const letters = useMemo(() => genStampMail(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [idx, setIdx] = useState(0);
  const [cursor, setCursor] = useState<0 | 1>(1); // 0 toss, 1 stamp
  const [anim, setAnim] = useState<Anim>(null);
  const [inked, setInked] = useState(false);
  const [shake, bumpShake] = useBump();
  const [toast, setToast] = useState({ k: 0, text: '', tone: C.bad as string });
  const [burst, bumpBurst] = useBump();
  const [arrive, bumpArrive] = useBump();
  const letter = letters[idx];
  const busy = anim !== null || done;

  const act = (choice: 0 | 1) => {
    if (busy || !letter) return;
    setCursor(choice);
    const correct = (choice === 1) === letter.good;
    if (!correct) {
      bumpShake();
      setToast((t) => ({ k: t.k + 1, text: choice === 1 ? 'Noise never gets the stamp!' : 'That one is real mail!', tone: C.bad }));
      return;
    }
    setAnim(choice === 1 ? 'stamp' : 'toss');
    if (choice === 1) later(() => setInked(true), 190);
    later(() => bumpBurst(), choice === 1 ? 200 : 380);
    later(() => {
      const next = idx + 1;
      setAnim(null);
      setInked(false);
      setIdx(next);
      bumpArrive();
      if (next >= letters.length) finish(350);
    }, choice === 1 ? 720 : 520);
  };

  const onKey = (k: KeyInput) => {
    if (!k.down) return;
    if (k.dir === 'left') setCursor(0);
    else if (k.dir === 'right') setCursor(1);
    else if (k.action && !k.repeat) act(cursor);
  };

  const sent = letters.slice(0, idx).filter((l) => l.good).length;
  const lines = wrap(letter?.subject ?? '', 22);
  const flying = anim === 'stamp' && inked;
  const lt = flying ? 'translate(438px,84px) rotate(16deg) scale(0.22)' : anim === 'toss' ? 'translate(70px,215px) rotate(-200deg) scale(0.18)' : 'translate(240px,150px)';

  return (
    <GameShell kind={kind} label="Approve-stamp mail" reducedMotion={reducedMotion} onKey={onKey} status={done ? 'All mail sorted' : letter ? `${letter.from}: ${letter.subject}` : ''}>
      <Stage
        ids={ids}
        tone={C.brass}
        tone2={C.cobalt}
        defs={
          <>
            <linearGradient id={ids.id('paper')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbf6ea" />
              <stop offset="1" stopColor="#eadfc6" />
            </linearGradient>
            <linearGradient id={ids.id('tube')} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#6ea1ff" stopOpacity="0.15" />
              <stop offset="0.35" stopColor="#cfe0ff" stopOpacity="0.4" />
              <stop offset="1" stopColor="#6ea1ff" stopOpacity="0.1" />
            </linearGradient>
          </>
        }
      >
        <Caption text="QUILL'S MAILROOM" tone={C.brassHi} />
        {/* pneumatic tube in + send tube out */}
        <rect x={222} y={-4} width={36} height={52} rx={8} fill={ids.url('tube')} stroke="#9fc0ff" strokeOpacity={0.45} />
        <rect x={214} y={40} width={52} height={12} rx={4} fill={ids.url('metal')} stroke="#5d77b0" />
        <path d="M480 74 H420 q-14 0 -14 14 v6" fill="none" stroke="#9fc0ff" strokeOpacity={0.35} strokeWidth={30} strokeLinecap="round" />
        <text x={452} y={60} textAnchor="middle" fontSize={9} fontWeight={800} fill={C.tealHi} letterSpacing={1.5}>
          SEND
        </text>

        {/* noise bin */}
        <g className={busy ? undefined : 'mmg-hit'} onPointerDown={() => act(0)}>
          <ellipse cx={70} cy={262} rx={48} ry={10} fill="#000" opacity={0.35} />
          <path d="M28 182 h84 l-8 78 q-1 8 -9 8 h-50 q-8 0 -9 -8 Z" fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
          {[46, 62, 78, 94].map((x) => (
            <line key={x} x1={x} y1={192} x2={x - 1} y2={256} stroke="#0b1222" strokeOpacity={0.45} strokeWidth={3} strokeLinecap="round" />
          ))}
          <rect x={22} y={174} width={96} height={12} rx={5} fill="#3a4a6e" stroke="#5d77b0" />
          <text x={70} y={290} textAnchor="middle" fontSize={11} fontWeight={800} fill={C.muted} letterSpacing={1.4}>
            NOISE
          </text>
        </g>

        {/* the letter */}
        {letter && (
          <g key={`L${idx}-${shake}`} className={shake ? 'mmg-shake' : undefined}>
            <g
              className="mmg-ease"
              style={{
                transform: lt,
                opacity: anim === 'toss' ? 0.2 : flying ? 0.1 : 1,
                transition: flying ? 'transform 420ms 260ms cubic-bezier(.5,0,.2,1), opacity 300ms 380ms' : undefined,
              }}
            >
              <g className="mmg-pop" key={arrive}>
                <LetterCard l={letter} lines={lines} ids={ids} inked={inked} />
              </g>
            </g>
          </g>
        )}
        {/* brass approval stamp (on its stand) */}
        <g className={busy ? undefined : 'mmg-hit'} onPointerDown={() => act(1)}>
          <ellipse cx={410} cy={262} rx={50} ry={10} fill="#000" opacity={0.35} />
          <rect x={366} y={236} width={88} height={22} rx={8} fill="#3b1d2a" stroke="#7a3550" />
          <rect x={372} y={240} width={76} height={10} rx={4} fill={C.berry} opacity={0.55} />
          <g
            className={anim === 'stamp' ? undefined : 'mmg-spring'}
            style={{
              transform: anim === 'stamp' ? (inked ? 'translate(-170px,-62px)' : 'translate(-170px,-92px)') : 'translate(0,0)',
              transition: anim === 'stamp' ? (inked ? 'transform 70ms ease-in' : 'transform 190ms cubic-bezier(.3,0,.3,1)') : undefined,
            }}
          >
            <ellipse cx={410} cy={146} rx={22} ry={20} fill={ids.url('brass')} stroke="#7a5418" />
            <ellipse cx={404} cy={139} rx={8} ry={6} fill="#fff" opacity={0.45} />
            <rect x={403} y={160} width={14} height={40} rx={5} fill={ids.url('brass')} stroke="#7a5418" />
            <rect x={380} y={198} width={60} height={20} rx={5} fill={ids.url('brass')} stroke="#7a5418" />
            <rect x={384} y={216} width={52} height={8} rx={2} fill="#8f1d2c" />
          </g>
          <text x={410} y={290} textAnchor="middle" fontSize={11} fontWeight={800} fill={C.brassHi} letterSpacing={1.4}>
            APPROVE
          </text>
        </g>

        {burst > 0 && <Burst k={burst} x={anim === 'toss' ? 70 : 240} y={anim === 'toss' ? 200 : 160} color={anim === 'toss' ? C.muted : C.brassHi} />}

        {/* progress pips */}
        <g transform="translate(240 318)">
          {letters.map((l, i) => {
            const x = (i - (letters.length - 1) / 2) * 30;
            const st = i < idx ? (l.good ? 'sent' : 'tossed') : i === idx ? 'now' : 'wait';
            return (
              <g key={i} transform={`translate(${x} 0)`}>
                <rect x={-11} y={-8} width={22} height={16} rx={3} fill={st === 'sent' ? C.tealHi : st === 'tossed' ? '#334155' : st === 'now' ? '#fbf6ea' : '#1e293b'} stroke={st === 'now' ? C.brassHi : '#3a4a6e'} />
                <path d="M-11 -8 L0 1 L11 -8" fill="none" stroke={st === 'sent' ? '#064e3b' : '#64748b'} strokeWidth={1.2} />
              </g>
            );
          })}
          <text x={0} y={30} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.muted}>
            {sent} sent · {letters.length - idx} in the tube
          </text>
        </g>

        <FocusRing x={cursor === 0 ? 18 : 356} y={168} w={cursor === 0 ? 104 : 108} h={130} show={!done} />
        <Toast k={toast.k} text={toast.text} tone={toast.tone} y={70} />
      </Stage>
    </GameShell>
  );
}

function LetterCard({ l, lines, ids, inked }: { l: Letter; lines: string[]; ids: ReturnType<typeof useIds>; inked: boolean }) {
  return (
    <g>
      <g filter={ids.url('shadow')}>
        <rect x={-92} y={-66} width={184} height={132} rx={8} fill={ids.url('paper')} stroke="#c9b893" />
        <path d="M-92 -58 L0 2 L92 -58" fill="none" stroke="#d6c7a4" strokeWidth={1.5} />
      </g>
      {/* airmail stripe */}
      {[...Array(12)].map((_, i) => (
        <path key={i} d={`M${-88 + i * 15} 66 l4 -6 h7 l-4 6 Z`} fill={i % 2 ? (l.good ? C.cobalt : '#9ca3af') : C.berry} opacity={0.75} />
      ))}
      <Berry kind={l.good ? 'marion' : 'goose'} r={9} x={0} y={2} leaf={false} />
      {/* chip */}
      <rect x={-84} y={-60} width={l.good ? 84 : 56} height={17} rx={8.5} fill={l.good ? C.cobalt : '#6b7280'} />
      <text x={l.good ? -42 : -56} y={-48} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#fff" letterSpacing={0.6}>
        {l.good ? 'NEEDS ACTION' : 'NOISE'}
      </text>
      {!l.good && (
        <g fill="#f59e0b">
          <path d="M70 -52 l3 6 6 1 -5 4 1 6 -5 -3 -5 3 1 -6 -5 -4 6 -1Z" />
          <path d="M52 -40 l2 4 4 0 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 0Z" opacity={0.8} />
        </g>
      )}
      <text x={-84} y={22} fontSize={12} fontWeight={800} fill="#1f2937">
        {l.from}
      </text>
      {lines.map((s, i) => (
        <text key={i} x={-84} y={38 + i * 13} fontSize={11} fontWeight={600} fill={l.good ? '#374151' : '#b91c1c'} fontStyle={l.good ? undefined : 'italic'}>
          {s}
        </text>
      ))}
      {l.good && (
        <text x={84} y={-46} textAnchor="end" fontSize={8.5} fontWeight={700} fill="#059669">
          Quill drafted ✓
        </text>
      )}
      {inked && (
        <g className="mmg-pop" transform="rotate(-14) translate(28 -14)" opacity={0.85}>
          <circle r={30} fill="none" stroke="#b3261e" strokeWidth={3} />
          <circle r={24} fill="none" stroke="#b3261e" strokeWidth={1.2} />
          <text y={4} textAnchor="middle" fontSize={10.5} fontWeight={900} fill="#b3261e" letterSpacing={1}>
            APPROVED
          </text>
        </g>
      )}
    </g>
  );
}

function wrap(s: string, n: number): string[] {
  const words = s.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out.slice(0, 2);
}
