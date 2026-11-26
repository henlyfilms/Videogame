// TEMPORARY STUB — replaced by the character-system branch on merge.
import type { Cosmetics } from '../core/types';
export interface BerryPose { time: number; moving: boolean; dir: 1 | -1; emote?: string | null; ghost?: boolean; alpha?: number; hold?: 'gun' | 'knife' | 'flashlight' | null; flashlightOn?: boolean; scared?: boolean; blink?: boolean }
const HUES = ['#ef4444', '#b91c1c', '#f97316', '#c2410c', '#facc15', '#ca8a04', '#22c55e', '#15803d', '#14b8a6', '#0f766e', '#3b82f6', '#1d4ed8', '#a855f7', '#7e22ce', '#ec4899', '#be185d', '#334155', '#0f172a', '#f1f5f9', '#cbd5e1'];
export function drawBerry(ctx: CanvasRenderingContext2D, c: Cosmetics, x: number, y: number, scale: number, pose: BerryPose): void {
  ctx.save(); ctx.globalAlpha = pose.ghost ? 0.5 : pose.alpha ?? 1; ctx.fillStyle = HUES[c.color] ?? '#3b82f6';
  const bob = pose.moving ? Math.abs(Math.sin(pose.time * 10)) * 3 * scale : 0;
  ctx.beginPath(); ctx.ellipse(x, y - 20 * scale - bob, 15 * scale, 19 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 5 * pose.dir * scale, y - 24 * scale - bob, 4 * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
export function drawBody(ctx: CanvasRenderingContext2D, c: Cosmetics, x: number, y: number, scale: number, _time: number): void {
  ctx.save(); ctx.fillStyle = HUES[c.color] ?? '#3b82f6'; ctx.beginPath(); ctx.ellipse(x, y - 5 * scale, 18 * scale, 7 * scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
export function drawPet(_ctx: CanvasRenderingContext2D, _pet: string, _x: number, _y: number, _s: number, _t: number, _d: 1 | -1): void {}
export function drawNameplate(ctx: CanvasRenderingContext2D, _plate: string, name: string, x: number, y: number, scale: number): void {
  ctx.save(); ctx.font = `${12 * scale}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(name, x, y); ctx.restore();
}
export function drawEmoteBubble(_ctx: CanvasRenderingContext2D, _emote: string, _x: number, _y: number, _s: number, _t: number): void {}
