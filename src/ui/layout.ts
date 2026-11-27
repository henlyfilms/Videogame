/**
 * Shared HUD layout: the top bar's measured height drives where panels,
 * popovers and the replay bar sit (CSS var `--hq-top`) and the camera's top
 * inset, so nothing overlaps the bar however it wraps (phones, landscape).
 */
import { hq } from '../game/hq';

let top = 56;

export function topInset(): number {
  return top;
}

export function setTopInset(px: number): void {
  const v = Math.max(44, Math.round(px));
  if (v === top) return;
  top = v;
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--hq-top', `${v}px`);
  hq.camera.insets = { ...hq.camera.insets, top: v };
}
