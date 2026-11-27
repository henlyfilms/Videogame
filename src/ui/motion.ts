/**
 * Enter / exit motion helpers for the HQ UI. `usePresence` keeps an element
 * mounted for its out animation (the `.hq-anim-*[data-closing]` classes in
 * index.css), and remembers the last non-null value so a panel can animate
 * out with its old content.
 */
import { useEffect, useRef, useState } from 'react';

/** Exit animation length (ms); index.css keeps the out keyframes at or under this. */
export const EXIT_MS = 170;

export interface Presence<T> {
  /** Render while true. */
  mounted: boolean;
  /** True while playing the exit animation (set `data-closing` from it). */
  closing: boolean;
  /** The current value, or the last one while closing. */
  value: T | null;
}

/** Presence for a value that is shown while non-null (or a boolean flag). */
export function usePresence<T>(value: T | null | false | undefined, ms = EXIT_MS): Presence<T> {
  const live = value === false || value === undefined ? null : value;
  const last = useRef<T | null>(live);
  const [, bump] = useState(0);
  if (live !== null) last.current = live;
  const leaving = live === null && last.current !== null;
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      last.current = null;
      bump((n) => n + 1);
    }, ms);
    return () => clearTimeout(t);
  }, [leaving, ms]);
  return { mounted: live !== null || last.current !== null, closing: leaving, value: live ?? last.current };
}

/** `data-closing` attribute props for an animated element. */
export const closingAttr = (closing: boolean) => (closing ? { 'data-closing': '' } : {});
