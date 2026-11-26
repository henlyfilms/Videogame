import { useEffect, useState } from 'react';
import type { BotState } from '../adapters/events';
import { hq } from '../game/hq';

export interface BotSnapshot {
  id: string;
  name: string;
  role: string;
  color: string;
  glow: string;
  shape: import('../data/bots').BotShape;
  starred: boolean;
  custom: boolean;
  job?: string;
  colorName: string;
  state: BotState;
  room: string | null;
  task: string | null;
  tether: string | null;
  buffed: boolean;
  hotkey?: number;
}

export function snapshotBots(): BotSnapshot[] {
  const sim = hq.sim;
  return [...sim.bots.values()].map((b) => ({
    id: b.def.id,
    name: b.def.name,
    role: b.def.role,
    color: b.def.color,
    glow: b.def.glowColor,
    shape: b.def.shape,
    starred: b.def.starred,
    custom: !!b.def.custom,
    job: b.def.job,
    colorName: b.def.colorName,
    state: b.state,
    room: sim.botRoom(b),
    task: b.task,
    tether: b.tether?.model ?? null,
    buffed: b.buffUntil > sim.time,
    hotkey: b.def.hotkey,
  }));
}

/** Poll the (non-React) simulation for bot state a few times per second. */
export function useBots(intervalMs = 400): BotSnapshot[] {
  const [bots, setBots] = useState<BotSnapshot[]>(() => snapshotBots());
  useEffect(() => {
    const id = setInterval(() => setBots(snapshotBots()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return bots;
}

export function countStates(bots: BotSnapshot[]): Record<BotState, number> {
  const out: Record<BotState, number> = { idle: 0, walking: 0, working: 0, huddling: 0, delegating: 0, needs_input: 0, asleep: 0 };
  for (const b of bots) out[b.state]++;
  return out;
}

export function useMediaQuery(q: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false);
  const [m, setM] = useState(get);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [q]);
  return m;
}
