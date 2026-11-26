/**
 * Tiny typed pub/sub for MarionEvents. Adapters and player actions publish;
 * the simulation (visuals) and the store (mechanics, feed) subscribe.
 */
import type { MarionEvent } from '../adapters/events';

export type Listener = (ev: MarionEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();
  /** Re-entrancy guard: events published while dispatching are queued. */
  private queue: MarionEvent[] = [];
  private dispatching = false;
  published = 0;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  publish(ev: MarionEvent): void {
    this.queue.push(ev);
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      while (this.queue.length) {
        const next = this.queue.shift()!;
        this.published++;
        for (const fn of [...this.listeners]) {
          try {
            fn(next);
          } catch (err) {
            console.error('[bus] listener failed', err);
          }
        }
      }
    } finally {
      this.dispatching = false;
    }
  }

  clear(): void {
    this.listeners.clear();
    this.queue = [];
  }
}
