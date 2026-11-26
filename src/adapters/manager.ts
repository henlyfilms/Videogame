/**
 * AdapterManager: owns the active EventSourceAdapter, gives it a context bound
 * to the HQ + store, and drives it from the game loop.
 */
import type { HQ } from '../game/hq';
import { populateSim } from '../game/wire';
import { useGame } from '../store/gameStore';
import { LiveSimAdapter } from './liveSim';
import { ReplayAdapter } from './replay';
import type { AdapterContext, AdapterKind, EventSourceAdapter } from './types';
import { WebSocketAdapter, type WsFactory } from './websocket';

export interface ManagerOptions {
  wsFactory?: WsFactory;
  liveSeed?: boolean;
}

export class AdapterManager {
  current: EventSourceAdapter | null = null;
  private untick: (() => void) | null = null;

  constructor(
    private hq: HQ,
    private store = useGame,
    private opts: ManagerOptions = {},
  ) {}

  private context(): AdapterContext {
    return {
      emit: (ev) => this.hq.publish(ev),
      getMechanics: () => this.store.getState().mech,
      reset: () => {
        this.hq.sim.clear();
        this.store.getState().resetMechanics(false);
        populateSim(this.hq, this.store.getState());
      },
      setStatus: (status, info) => this.store.getState().setConn(status, info ?? null),
    };
  }

  get replay(): ReplayAdapter | null {
    return this.current instanceof ReplayAdapter ? this.current : null;
  }

  get ws(): WebSocketAdapter | null {
    return this.current instanceof WebSocketAdapter ? this.current : null;
  }

  use(kind: AdapterKind): EventSourceAdapter {
    const prevKind = this.current?.kind;
    this.current?.stop();
    this.untick?.();
    const state = this.store.getState();
    if (prevKind === 'replay' && kind !== 'replay') {
      // Leave the replay sandbox: restore the player's persisted HQ.
      this.hq.sim.clear();
      state.restoreFromStorage();
      populateSim(this.hq, this.store.getState());
    }
    let adapter: EventSourceAdapter;
    if (kind === 'replay') {
      const r = new ReplayAdapter(state.replay.scenario);
      r.rate = state.replay.rate;
      r.onProgress = (p) => this.store.getState().setReplay({ t: p.t, duration: p.duration, playing: p.playing, rate: p.rate, scenario: p.scenario });
      adapter = r;
    } else if (kind === 'ws') {
      adapter = new WebSocketAdapter(state.wsUrl, {
        factory: this.opts.wsFactory,
        fallback: () => new LiveSimAdapter({ seedBacklog: false }),
      });
    } else {
      adapter = new LiveSimAdapter({ seedBacklog: this.opts.liveSeed ?? true });
    }
    this.store.getState().setAdapter(kind);
    this.current = adapter;
    adapter.start(this.context());
    this.untick = this.hq.addTicker((dt) => adapter.tick(dt));
    return adapter;
  }

  stop(): void {
    this.current?.stop();
    this.untick?.();
    this.current = null;
  }
}
