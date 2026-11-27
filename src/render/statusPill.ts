/**
 * Marion HQ: the live agent status pill under a bot's name tag (2D floorplan
 * and the 3D diorama's overlay). Working → spinning ring; idle → hollow dot.
 */
import { liveStatusFor } from '../agents/liveStatus';
import { statusLine } from '../mystery/server/agentHub';
import { drawStatusSpinner, spinnerAngle, statusText } from '../mystery/render2d/prompts';

type Ctx = CanvasRenderingContext2D;

export interface HqStatusStyle {
  /** Font size in canvas units; the pill is ~1.45× as tall. */
  size: number;
  bg: string;
  ink: string;
  muted: string;
  /** Pill outline (optional). */
  line?: string;
  /** Spinner track ring. */
  track: string;
  /** Spinner arc. */
  spin: string;
  reduced: boolean;
}

/** The bot's live status line (null when the agent has published none). */
export function hqStatus(botId: string): { text: string; busy: boolean; detail?: string } | null {
  const st = liveStatusFor(botId);
  const line = statusLine(st);
  if (!st || !line) return null;
  return { text: statusText(line), busy: st.state === 'working', detail: st.detail };
}

/** Draw a status pill centred on `x` with its top at `y`. Returns its height. */
export function drawHqStatus(g: Ctx, botId: string, x: number, y: number, s: HqStatusStyle): number {
  const st = hqStatus(botId);
  if (!st) return 0;
  const h = Math.round(s.size * 1.45);
  g.save();
  g.font = `600 ${s.size}px ui-sans-serif, system-ui, sans-serif`;
  const tw = g.measureText(st.text).width;
  const w = tw + h * 1.35;
  const x0 = x - w / 2;
  g.beginPath();
  g.roundRect(x0, y, w, h, h / 2);
  g.fillStyle = s.bg;
  g.fill();
  if (s.line || st.busy) {
    g.save();
    g.lineWidth = 1;
    g.strokeStyle = st.busy ? s.spin : s.line!;
    if (st.busy) g.globalAlpha *= 0.6;
    g.stroke();
    g.restore();
  }
  const ix = x0 + h * 0.5;
  const iy = y + h / 2;
  const r = h * 0.22;
  if (st.busy) drawStatusSpinner(g, ix, iy, r, spinnerAngle(performance.now() / 1000, s.reduced), s.spin, s.track);
  else {
    g.beginPath();
    g.arc(ix, iy, r, 0, Math.PI * 2);
    g.lineWidth = Math.max(1, r * 0.45);
    g.strokeStyle = s.muted;
    g.stroke();
  }
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = st.busy ? s.ink : s.muted;
  g.fillText(st.text, x0 + h * 0.92, iy + 0.5);
  g.restore();
  return h;
}
