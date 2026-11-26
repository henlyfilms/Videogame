/**
 * ReplayAdapter: deterministic scrubber over a recorded scenario. Seeking
 * resets the world and re-applies every event up to the target time.
 */
import type { MarionEvent } from './events';
import { scenarioById, type Scenario } from './scenarios';
import type { AdapterContext, EventSourceAdapter } from './types';

export const REPLAY_RATES = [0.5, 1, 2, 4] as const;
export const REPLAY_EPOCH = Date.UTC(2026, 10, 26, 9, 0, 0);

export interface ReplayProgress {
  t: number;
  duration: number;
  playing: boolean;
  rate: number;
  scenario: string;
}

export class ReplayAdapter implements EventSourceAdapter {
  readonly kind = 'replay' as const;
  private ctx: AdapterContext | null = null;
  private scenario: Scenario;
  private cursor = 0;
  t = 0;
  rate = 1;
  playing = true;
  onProgress: ((p: ReplayProgress) => void) | null = null;

  constructor(scenarioId = 'feature-sprint') {
    this.scenario = scenarioById(scenarioId);
  }

  get duration(): number {
    return this.scenario.duration;
  }

  get scenarioId(): string {
    return this.scenario.id;
  }

  start(ctx: AdapterContext): void {
    this.ctx = ctx;
    ctx.setStatus('idle', null);
    this.seek(0);
  }

  stop(): void {
    this.ctx = null;
  }

  /** The concrete event for step i (stable ids/timestamps → deterministic). */
  eventAt(i: number): MarionEvent {
    const step = this.scenario.steps[i]!;
    return { id: `${this.scenario.id}_${i}`, ts: REPLAY_EPOCH + step.at, type: step.type, payload: step.payload } as MarionEvent;
  }

  setScenario(id: string): void {
    this.scenario = scenarioById(id);
    this.playing = true;
    this.seek(0);
  }

  setRate(rate: number): void {
    this.rate = (REPLAY_RATES as readonly number[]).includes(rate) ? rate : 1;
    this.report();
  }

  setPlaying(p: boolean): void {
    this.playing = p;
    if (p && this.t >= this.duration) this.seek(0);
    this.report();
  }

  seek(ms: number): void {
    const target = Math.max(0, Math.min(this.duration, ms));
    if (!this.ctx) {
      this.t = target;
      return;
    }
    this.ctx.reset();
    this.cursor = 0;
    this.t = target;
    this.flush();
    this.report();
  }

  tick(dtMs: number): void {
    if (!this.ctx || !this.playing) return;
    this.t = Math.min(this.duration, this.t + dtMs * this.rate);
    this.flush();
    if (this.t >= this.duration) this.playing = false;
    this.report();
  }

  private flush(): void {
    const steps = this.scenario.steps;
    while (this.ctx && this.cursor < steps.length && steps[this.cursor]!.at <= this.t) {
      this.ctx.emit(this.eventAt(this.cursor));
      this.cursor++;
    }
  }

  private lastReport = -1;
  private report(): void {
    // Throttle UI updates to ~10/s.
    const bucket = Math.floor(this.t / 100);
    if (bucket === this.lastReport && this.playing) return;
    this.lastReport = bucket;
    this.onProgress?.({ t: this.t, duration: this.duration, playing: this.playing, rate: this.rate, scenario: this.scenario.id });
  }
}
