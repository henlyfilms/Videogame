/**
 * Unified input: keyboard (rebindable), touch joystick, gamepad. Produces a
 * movement intent in *view* space (x right, y toward the bottom of the
 * screen / backwards) that the active view converts to world space, plus
 * discrete action presses routed to the HUD.
 */
import type { Keybinds } from './prefs';

export type InputAction = keyof Keybinds | 'menu' | 'confirm' | 'back' | 'emote1' | 'emote2' | 'emote3' | 'emote4' | 'next' | 'prev' | 'shoot';

type ActionHandler = (a: InputAction) => void;

export class Input {
  keys: Keybinds;
  private down = new Set<string>();
  touch = { x: 0, y: 0 };
  /** Right-stick / touch-look delta for 3D cameras (consumed each frame). */
  look = { x: 0, y: 0 };
  pad = { x: 0, y: 0, lx: 0, ly: 0, connected: false };
  private padPrev: boolean[] = [];
  private handlers = new Set<ActionHandler>();
  enabled = true;
  /** When a text field / modal has focus, movement is ignored. */
  typing = false;

  constructor(keys: Keybinds) {
    this.keys = keys;
  }

  attach(target: Window = window): () => void {
    const kd = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inField = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (inField) return;
      if (e.repeat && this.down.has(e.code)) return;
      this.down.add(e.code);
      const map: [string, InputAction][] = (Object.entries(this.keys) as [keyof Keybinds, string][]).map(([k, code]) => [code, k]);
      for (const [code, act] of map) if (code === e.code && !['up', 'down', 'left', 'right'].includes(act)) this.fire(act);
      if (e.code === 'Escape') this.fire('menu');
      if (e.code === 'Space') this.fire('use');
      if (e.code === 'Digit1') this.fire('emote1');
      if (e.code === 'Digit2') this.fire('emote2');
      if (e.code === 'Digit3') this.fire('emote3');
      if (e.code === 'Digit4') this.fire('emote4');
      if (e.code === 'Tab') e.preventDefault();
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => this.down.delete(e.code);
    const blur = () => this.down.clear();
    target.addEventListener('keydown', kd);
    target.addEventListener('keyup', ku);
    target.addEventListener('blur', blur);
    return () => {
      target.removeEventListener('keydown', kd);
      target.removeEventListener('keyup', ku);
      target.removeEventListener('blur', blur);
    };
  }

  onAction(h: ActionHandler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  fire(a: InputAction): void {
    if (!this.enabled) return;
    for (const h of this.handlers) h(a);
  }

  private key(code: string): boolean {
    return this.down.has(code);
  }

  /** Poll gamepads (call every frame). */
  pollPad(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...(pads ?? [])].find((p) => p && p.connected) ?? null;
    if (!gp) {
      this.pad.connected = false;
      this.pad.x = this.pad.y = 0;
      return;
    }
    this.pad.connected = true;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    this.pad.x = dz(gp.axes[0] ?? 0);
    this.pad.y = dz(gp.axes[1] ?? 0);
    this.look.x += dz(gp.axes[2] ?? 0) * 6;
    this.look.y += dz(gp.axes[3] ?? 0) * 4;
    // Standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 8 back, 9 start, 12-15 dpad.
    const map: [number, InputAction][] = [
      [0, 'use'],
      [1, 'report'],
      [2, 'kill'],
      [3, 'vent'],
      [4, 'map'],
      [5, 'sabotage'],
      [6, 'flashlight'],
      [7, 'shoot'],
      [8, 'tasks'],
      [9, 'menu'],
      [12, 'prev'],
      [13, 'next'],
    ];
    for (const [i, act] of map) {
      const pressed = !!gp.buttons[i]?.pressed;
      if (pressed && !this.padPrev[i]) this.fire(act);
      this.padPrev[i] = pressed;
    }
  }

  /** Movement intent in view space, length <= 1. */
  axes(): { x: number; y: number } {
    if (!this.enabled || this.typing) return { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    if (this.key(this.keys.left) || this.key('ArrowLeft')) x -= 1;
    if (this.key(this.keys.right) || this.key('ArrowRight')) x += 1;
    if (this.key(this.keys.up) || this.key('ArrowUp')) y -= 1;
    if (this.key(this.keys.down) || this.key('ArrowDown')) y += 1;
    x += this.touch.x + this.pad.x;
    y += this.touch.y + this.pad.y;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  consumeLook(): { x: number; y: number } {
    const l = { ...this.look };
    this.look.x = 0;
    this.look.y = 0;
    return l;
  }
}
