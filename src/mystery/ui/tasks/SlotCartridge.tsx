import { useMemo, useState } from 'react';
import { Burst, C, Caption, FocusRing, GameShell, Stage, Toast, shapePath, useBump, useFinish, useIds, useTimers, type KeyInput, type ShapeKind } from './kit';
import { makeRng } from './rng';
import type { MiniGameProps } from './types';

const SHAPES: ShapeKind[] = ['circle', 'triangle', 'square', 'star', 'diamond', 'heart'];
const SKILLS = [
  { name: 'Token Optimizer', color: C.tealHi },
  { name: 'Claude Auto Mode', color: C.cobaltHi },
  { name: 'Prompt Craft', color: C.berryHi },
  { name: 'Zero-Fluff Comms', color: C.warn },
];

export interface CartridgeGame {
  slots: ShapeKind[];
  carts: { shape: ShapeKind; name: string; color: string }[];
}

export function genSlotCartridge(seed: number): CartridgeGame {
  const r = makeRng(seed, 404);
  const slots = r.shuffle([...SHAPES]).slice(0, 5);
  const needed = r.shuffle([...slots]).slice(0, 2);
  const skills = r.shuffle([...SKILLS]);
  return { slots, carts: needed.map((shape, i) => ({ shape, name: skills[i]!.name, color: skills[i]!.color })) };
}

const SLOT_W = 76;
const SLOT_X0 = 240 - (5 * SLOT_W + 4 * 12) / 2;
const slotX = (i: number) => SLOT_X0 + i * (SLOT_W + 12) + SLOT_W / 2;

export default function SlotCartridge({ kind, seed, onComplete, reducedMotion }: MiniGameProps) {
  const g = useMemo(() => genSlotCartridge(seed), [seed]);
  const ids = useIds();
  const { done, finish } = useFinish(kind, onComplete);
  const later = useTimers();
  const [ci, setCi] = useState(0);
  const [cursor, setCursor] = useState(2);
  const [filled, setFilled] = useState<Record<number, string>>({});
  const [anim, setAnim] = useState<null | 'in' | 'bounce'>(null);
  const [toast, setToast] = useState({ k: 0, text: '' });
  const [burst, setBurst] = useState({ k: 0, x: 0 });
  const [rise, bumpRise] = useBump();
  const cart = g.carts[ci];
  const busy = anim !== null || done || !cart;

  const insert = (i: number) => {
    if (busy || !cart) return;
    setCursor(i);
    if (filled[i] !== undefined) {
      setToast((t) => ({ k: t.k + 1, text: 'That slot is already humming' }));
      return;
    }
    if (g.slots[i] !== cart.shape) {
      setAnim('bounce');
      setToast((t) => ({ k: t.k + 1, text: `Clunk! That's a ${g.slots[i]} slot` }));
      later(() => setAnim(null), 420);
      return;
    }
    setAnim('in');
    later(() => {
      setFilled((f) => ({ ...f, [i]: cart.color }));
      setBurst((b) => ({ k: b.k + 1, x: slotX(i) }));
    }, 330);
    later(() => {
      setAnim(null);
      const n = ci + 1;
      setCi(n);
      bumpRise();
      if (n >= g.carts.length) finish(500);
    }, 760);
  };

  const onKey = (k: KeyInput) => {
    if (!k.down) return;
    if (k.dir === 'left') setCursor((c) => Math.max(0, c - 1));
    else if (k.dir === 'right') setCursor((c) => Math.min(4, c + 1));
    else if ((k.action || k.dir === 'up') && !k.repeat) insert(cursor);
  };

  const cx = slotX(cursor);
  const cy = anim === 'in' ? 150 : anim === 'bounce' ? 205 : 262;
  const throughput = Object.keys(filled).length * 12;

  return (
    <GameShell kind={kind} label="Slot the skill cartridge" reducedMotion={reducedMotion} onKey={onKey} status={cart ? `Cartridge ${cart.name}, ${cart.shape} key. Slot ${cursor + 1}: ${g.slots[cursor]}` : 'All cartridges seated'}>
      <Stage ids={ids} tone={C.warn} tone2={C.cobalt}>
        <Caption text="BOT BUILDER'S FOUNDRY" tone={C.warn} />
        <text x={466} y={30} textAnchor="end" fontSize={11} fontWeight={800} fill={throughput ? C.tealHi : C.muted}>
          HQ throughput +{throughput}%
        </text>
        {/* rack */}
        <rect x={SLOT_X0 - 16} y={54} width={5 * SLOT_W + 4 * 12 + 32} height={148} rx={16} fill={ids.url('metal')} stroke="#4a5d8a" strokeWidth={1.5} />
        {[0, 1].map((i) => (
          <circle key={i} cx={SLOT_X0 - 6 + i * (5 * SLOT_W + 4 * 12 + 12)} cy={64} r={3} fill="#64748b" />
        ))}
        {g.slots.map((s, i) => {
          const x = slotX(i);
          const f = filled[i];
          return (
            <g key={i} className="mmg-hit" onPointerDown={() => insert(i)}>
              <circle cx={x} cy={72} r={5} fill={f ?? '#1e293b'} stroke={f ? '#fff' : '#334155'} filter={f ? ids.url('glow') : undefined} className="mmg-fill-t" />
              <rect x={x - SLOT_W / 2} y={84} width={SLOT_W} height={106} rx={10} fill="#060a14" stroke={f ?? '#2a3a62'} strokeWidth={f ? 2 : 1.5} />
              <rect x={x - SLOT_W / 2 + 6} y={90} width={SLOT_W - 12} height={10} rx={3} fill="#0d1526" />
              <g transform={`translate(${x} 128)`}>
                <path d={shapePath(s, 17)} fill={f ? f : 'none'} fillOpacity={f ? 0.25 : 0} stroke={f ?? '#6b7fa8'} strokeWidth={2.5} strokeDasharray={f ? undefined : '4 3'} />
              </g>
              <text x={x} y={178} textAnchor="middle" fontSize={9} fontWeight={700} fill="#64748b" letterSpacing={0.8}>
                {s.toUpperCase()}
              </text>
              {f && (
                <g className="mmg-pop">
                  <rect x={x - 28} y={96} width={56} height={22} rx={4} fill={f} opacity={0.9} />
                  <text x={x} y={111} textAnchor="middle" fontSize={8} fontWeight={900} fill="#0b1222">
                    SEATED
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {burst.k > 0 && <Burst k={burst.k} x={burst.x} y={130} color={C.tealHi} />}
        {/* guide rail */}
        <rect x={SLOT_X0 - 6} y={300} width={5 * SLOT_W + 4 * 12 + 12} height={6} rx={3} fill="#1e2b49" />
        {/* the cartridge */}
        {cart && (
          <g key={rise} className="mmg-pop">
            <g className={anim === 'bounce' ? 'mmg-spring' : 'mmg-ease'} style={{ transform: `translate(${cx}px,${cy}px)` }}>
              <Cartridge shape={cart.shape} name={cart.name} color={cart.color} />
            </g>
          </g>
        )}
        {!done && <FocusRing x={cx - SLOT_W / 2} y={84} w={SLOT_W} h={106} r={10} color={cart?.color ?? C.cobaltHi} />}
        <text x={240} y={346} textAnchor="middle" fontSize={10.5} fill={C.muted}>
          Cartridge {Math.min(ci + 1, g.carts.length)} of {g.carts.length} · match the key shape
        </text>
        <Toast k={toast.k} text={toast.text} tone={C.warn} y={226} />
      </Stage>
    </GameShell>
  );
}

function Cartridge({ shape, name, color }: { shape: ShapeKind; name: string; color: string }) {
  return (
    <g>
      <ellipse cx={0} cy={44} rx={34} ry={5} fill="#000" opacity={0.35} />
      {/* key nub */}
      <g transform="translate(0 -46)">
        <path d={shapePath(shape, 15)} fill={color} stroke="#fff" strokeOpacity={0.7} strokeWidth={2} />
      </g>
      <rect x={-34} y={-34} width={68} height={76} rx={8} fill="#1f2937" stroke={color} strokeWidth={2} />
      <rect x={-34} y={-34} width={68} height={14} rx={6} fill={color} opacity={0.9} />
      {[-24, -14, -4, 6, 16].map((x) => (
        <rect key={x} x={x} y={-31} width={6} height={8} rx={1} fill="#0b1222" opacity={0.5} />
      ))}
      <rect x={-26} y={-14} width={52} height={36} rx={5} fill="#f8fafc" />
      <text x={0} y={-1} textAnchor="middle" fontSize={7.6} fontWeight={900} fill="#0f172a">
        {name.split(' ')[0]}
      </text>
      <text x={0} y={10} textAnchor="middle" fontSize={7.6} fontWeight={900} fill="#0f172a">
        {name.split(' ').slice(1).join(' ')}
      </text>
      <rect x={-18} y={14} width={36} height={3} rx={1.5} fill={color} />
      <rect x={-30} y={26} width={60} height={12} rx={3} fill="#111827" />
    </g>
  );
}
