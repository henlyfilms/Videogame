/**
 * Fixed-timestep simulation loop decoupled from rendering. The sim always
 * advances in STEP-sized ticks; rendering happens once per animation frame with
 * an interpolation alpha. Large frame gaps (tab switches) are clamped.
 */
export const STEP = 1 / 60;
export const MAX_FRAME = 0.25;
export const MAX_STEPS = 8;

export interface StepResult {
  steps: number;
  acc: number;
  alpha: number;
}

/** Pure accumulator math — exported for tests. */
export function accumulate(acc: number, frameDt: number, step = STEP): StepResult {
  const dt = Math.min(Math.max(frameDt, 0), MAX_FRAME);
  let a = acc + dt;
  let steps = Math.floor(a / step);
  if (steps > MAX_STEPS) {
    steps = MAX_STEPS;
    a = steps * step; // drop the backlog instead of spiraling
  }
  a -= steps * step;
  return { steps, acc: a, alpha: a / step };
}

export interface LoopCallbacks {
  update: (dt: number) => void;
  render: (alpha: number, frameDt: number) => void;
}

type RAF = (cb: (t: number) => void) => number;
type CAF = (id: number) => void;

export class GameLoop {
  private acc = 0;
  private last = -1;
  private handle = 0;
  private running = false;
  /** Measured frames per second (smoothed). */
  fps = 60;

  constructor(
    private cb: LoopCallbacks,
    private raf: RAF = (f) => requestAnimationFrame(f),
    private caf: CAF = (id) => cancelAnimationFrame(id),
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = -1;
    this.handle = this.raf(this.frame);
  }

  stop(): void {
    this.running = false;
    this.caf(this.handle);
  }

  get isRunning(): boolean {
    return this.running;
  }

  private frame = (t: number): void => {
    if (!this.running) return;
    const frameDt = this.last < 0 ? STEP : (t - this.last) / 1000;
    this.last = t;
    if (frameDt > 0) this.fps = this.fps * 0.92 + (1 / Math.max(frameDt, 1e-3)) * 0.08;
    const r = accumulate(this.acc, frameDt);
    this.acc = r.acc;
    for (let i = 0; i < r.steps; i++) this.cb.update(STEP);
    this.cb.render(r.alpha, Math.min(frameDt, MAX_FRAME));
    this.handle = this.raf(this.frame);
  };
}
