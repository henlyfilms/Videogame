import { useMemo, useRef, useState } from 'react';
import { Berry, C, Caption, FocusRing, GameShell, Stage, capture, clamp, now, svgPoint, tsfx, useFinish, useHold, useIds, useRaf, useTimers, type BerryKind, type KeyInput } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

/** Seconds for the keyboard speed meter to charge from 0 to 1. */
export const CHARGE_S = 1.4;
export const ZONE_W = 0.2;
const SWIPE_MIN = 0.32;
const SWIPE_MAX = 1.1;

const NAMES = ['Daniel', 'Moose', 'Kanye', 'Barry', 'Greek', 'Quill', 'Sift', 'Gauge'];

export function genSwipeBadge(seed: number) {
  const r = makeRng(seed, 1212);
  return { zone: 0.46 + r.range(0, 0.18), name: r.pick(NAMES), berry: r.pick<BerryKind>(['rasp', 'blue', 'marion', 'straw']), id: 1000 + r.int(8999) };
}

const READER = { x0: 60, x1: 420, y: 171 };
type Msg = 'idle' | 'fast' | 'slow' | 'ok' | 'reading';

export default function SwipeBadge({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genSwipeBadge(seed), [seed]);
  const ids = useIds();
  const svg = useRef<SVGSVGElement>(null);
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [msg, setMsg] = useState<Msg>('idle');
  const [charge, setCharge] = useState(0);
  const chargeRef = useRef(0);
  const [bx, setBx] = useState<number | null>(null); // badge x when in the slot
  const [anim, setAnim] = useState<{ ms: number } | null>(null);
  const drag = useRef<{ t0: number | null; last: number } | null>(null);
  const hold = useHold(!done && anim === null, [], 'charge');

  const result = (speed: 'fast' | 'slow' | 'ok') => {
    setMsg(speed);
    if (speed === 'ok') {
      tsfx('good', 1);
      finish(500);
    } else tsfx('bad');
  };

  useRaf(
    (dt) => {
      if (!hold.ref.current) return;
      chargeRef.current = Math.min(1.15, chargeRef.current + dt / CHARGE_S);
      setCharge(chargeRef.current);
    },
    !done && anim === null,
  );

  const release = () => {
    const c = chargeRef.current;
    if (c <= 0.02) return;
    chargeRef.current = 0;
    const verdict = c < g.zone - ZONE_W / 2 ? 'slow' : c > g.zone + ZONE_W / 2 ? 'fast' : 'ok';
    const ms = verdict === 'fast' ? 220 : verdict === 'slow' ? 1300 : 560;
    setMsg('reading');
    tsfx('grab');
    setBx(READER.x0);
    setAnim({ ms: 0 });
    later(() => {
      setAnim({ ms });
      setBx(READER.x1);
    }, 30);
    later(() => {
      setAnim(null);
      result(verdict);
      if (verdict !== 'ok') {
        setBx(null);
        setCharge(0);
      }
    }, ms + 60);
  };

  const onKey = (k: KeyInput) => {
    if (done || anim) return;
    if (k.action || k.dir === 'right') {
      if (k.down && !k.repeat) {
        chargeRef.current = 0;
        setCharge(0);
        setMsg('idle');
      }
      if (!k.down && hold.ref.current) {
        hold.set(false);
        release();
        return true;
      }
      hold.key({ ...k, action: true });
      return true;
    }
  };

  const text = { idle: 'PLEASE SWIPE CARD', fast: 'TOO FAST. TRY AGAIN.', slow: 'TOO SLOW. TRY AGAIN.', ok: 'ACCEPTED. THANK YOU.', reading: 'READING…' }[msg];
  const led = msg === 'ok' ? C.good : msg === 'fast' || msg === 'slow' ? C.bad : msg === 'reading' ? C.warn : '#334155';
  const inSlot = bx !== null;
  const cardX = inSlot ? bx : 130;
  const cardY = inSlot ? READER.y - 30 : 86;

  return (
    <GameShell kind={kind} label="Swipe your badge at the right speed" reducedMotion={reducedMotion} onKey={onKey} status={text}>
      <Stage
        ids={ids}
        svgRef={svg}
        tone={C.cobalt}
        tone2={C.teal}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || done) return;
          const p = svgPoint(svg.current, e);
          const x = clamp(p.x, READER.x0 - 40, READER.x1 + 10);
          if (d.t0 === null && x > READER.x0 + 10) {
            d.t0 = now();
            tsfx('grab'); // the stripe meets the reader
          }
          if (x < d.last - 30) d.t0 = null; // went backwards: restart timing
          d.last = x;
          setBx(x);
          if (x >= READER.x1 && d.t0 !== null) {
            const s = (now() - d.t0) / 1000;
            drag.current = null;
            const v = s < SWIPE_MIN ? 'fast' : s > SWIPE_MAX ? 'slow' : 'ok';
            result(v);
            if (v !== 'ok') later(() => setBx(null), 350);
          }
        }}
        onPointerUp={() => {
          if (!drag.current) return;
          drag.current = null;
          if (!done) setBx(null);
        }}
      >
        <Caption text="SECURITY · BADGE READER" />
        {/* reader body */}
        <rect x={30} y={146} width={420} height={112} rx={18} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={2} />
        <rect x={50} y={168} width={380} height={14} rx={7} fill="#04070d" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M${130 + i * 44} 171 l6 4 l-6 4`} stroke={C.cobaltHi} strokeOpacity={0.55} strokeWidth={2} fill="none" className="mmg-twinkle" style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1.2s' }} />
        ))}
        {/* display */}
        <rect x={140} y={202} width={200} height={38} rx={7} fill="#04130e" stroke="#14532d" />
        <text x={240} y={226} textAnchor="middle" fontSize={13} fontWeight={800} className="mmg-mono" fill={msg === 'fast' || msg === 'slow' ? '#fca5a5' : '#86efac'}>
          {text}
        </text>
        <circle cx={392} cy={221} r={10} fill={led} filter={ids.url('glow')} className={msg === 'reading' ? 'mmg-pulse-fast' : undefined} />
        <circle cx={84} cy={221} r={7} fill="#1e293b" />
        <circle cx={108} cy={221} r={7} fill="#1e293b" />
        {/* badge card */}
        <g
          className="mmg-grab"
          style={{ transform: `translate(${cardX}px,${cardY}px)`, transition: anim ? `transform ${anim.ms}ms linear` : drag.current ? undefined : 'transform 300ms cubic-bezier(.34,1.56,.64,1)' }}
          onPointerDown={(e) => {
            if (done || anim) return;
            capture(e);
            drag.current = { t0: null, last: READER.x0 - 40 };
            setMsg('idle');
            setBx(READER.x0 - 40);
          }}
        >
          <rect x={-70} y={-48} width={140} height={92} fill="transparent" />
          <g filter={ids.url('shadow')}>
            <rect x={-62} y={-40} width={124} height={78} rx={9} fill="#f8fafc" />
            <rect x={-62} y={-40} width={124} height={20} rx={9} fill={C.cobalt} />
            <rect x={-62} y={-28} width={124} height={8} fill={C.cobalt} />
          </g>
          <text x={-54} y={-26} fontSize={8.5} fontWeight={900} fill="#fff" letterSpacing={1}>
            MARION HQ · CREW
          </text>
          <rect x={-54} y={-14} width={34} height={40} rx={4} fill="#dbeafe" />
          <g transform="translate(-37 7)">
            <Berry kind={g.berry} r={12} face />
          </g>
          <text x={-14} y={-2} fontSize={11} fontWeight={900} fill="#0f172a">
            {g.name}
          </text>
          <text x={-14} y={10} fontSize={7.5} fontWeight={700} fill="#64748b">
            ID #{g.id}
          </text>
          {Array.from({ length: 16 }, (_, i) => (
            <rect key={i} x={-14 + i * 4.3} y={16} width={i % 3 ? 2 : 3} height={10} fill="#0f172a" />
          ))}
          <rect x={-62} y={30} width={124} height={8} fill="#111827" opacity={0.85} />
        </g>
        {/* speed meter (keyboard / gamepad) */}
        <g transform="translate(60 296)">
          <text x={0} y={-12} fontSize={9.5} fontWeight={800} fill={C.muted} letterSpacing={1}>
            SWIPE SPEED
          </text>
          <text x={360} y={-12} textAnchor="end" fontSize={9.5} fontWeight={700} fill={C.muted}>
            slow · just right · fast
          </text>
          <rect width={360} height={16} rx={8} fill="#0a1020" stroke="#2a3a62" />
          <rect x={360 * (g.zone - ZONE_W / 2)} y={1} width={360 * ZONE_W} height={14} rx={6} fill={C.good} opacity={0.35} />
          <rect x={360 * (g.zone - ZONE_W / 2)} y={1} width={360 * ZONE_W} height={14} rx={6} fill="none" stroke={C.good} />
          <rect x={2} y={3} width={Math.max(0, Math.min(356, 356 * charge))} height={10} rx={5} fill={charge > g.zone + ZONE_W / 2 ? C.bad : charge >= g.zone - ZONE_W / 2 ? C.good : C.cobaltHi} />
          <FocusRing x={0} y={0} w={360} h={16} r={8} show={!done} />
        </g>
        <text x={466} y={30} textAnchor="end" fontSize={10.5} fill={C.muted}>
          drag the badge through →
        </text>
      </Stage>
    </GameShell>
  );
}
