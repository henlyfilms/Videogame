/**
 * Speech bubbles: auto-fading, never overlapping. Layout is a pure function so
 * it can be unit-tested without a canvas.
 */
export interface Bubble {
  id: number;
  botId: string;
  text: string;
  /** Cross-bot messages render teal. */
  crossBot: boolean;
  age: number;
  ttl: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const BUBBLE_FADE = 0.4;

export function bubbleAlpha(b: Pick<Bubble, 'age' | 'ttl'>): number {
  if (b.age < 0.15) return b.age / 0.15;
  const left = b.ttl - b.age;
  if (left < BUBBLE_FADE) return Math.max(0, left / BUBBLE_FADE);
  return 1;
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

/**
 * Resolve overlaps by nudging bubbles upward. Input rects are the desired
 * positions (anchored above each bot). Output preserves order.
 */
export function layoutBubbles(desired: readonly Rect[], gap = 4): Rect[] {
  const order = desired.map((r, i) => ({ r, i })).sort((a, b) => b.r.y - a.r.y || a.r.x - b.r.x);
  const placed: Rect[] = [];
  const out: Rect[] = new Array(desired.length);
  for (const { r, i } of order) {
    const cur = { ...r };
    let guard = 0;
    let moved = true;
    while (moved && guard++ < 64) {
      moved = false;
      for (const q of placed) {
        if (rectsOverlap(cur, q, gap)) {
          cur.y = q.y - cur.h - gap;
          moved = true;
        }
      }
    }
    placed.push(cur);
    out[i] = cur;
  }
  return out;
}

export class BubbleSystem {
  items: Bubble[] = [];
  private seq = 0;
  /** Max bubbles a single bot may have queued at once. */
  perBot = 1;

  say(botId: string, text: string, crossBot = false, ttl?: number): Bubble {
    const clean = text.length > 64 ? `${text.slice(0, 61)}…` : text;
    // One live bubble per bot: replace the old one.
    this.items = this.items.filter((b) => b.botId !== botId);
    const b: Bubble = {
      id: ++this.seq,
      botId,
      text: clean,
      crossBot,
      age: 0,
      ttl: ttl ?? Math.min(6, 2.2 + clean.length * 0.05),
    };
    this.items.push(b);
    if (this.items.length > 24) this.items.shift();
    return b;
  }

  update(dt: number): void {
    for (const b of this.items) b.age += dt;
    this.items = this.items.filter((b) => b.age < b.ttl);
  }

  clear(): void {
    this.items = [];
  }
}
