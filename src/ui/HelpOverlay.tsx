import { CORE_BOTS } from '../data/bots';
import { useGame } from '../store/gameStore';
import { Kbd } from './common';
import { Icon } from './Icon';
import { closingAttr, usePresence } from './motion';

const ROWS: [string, string][] = [
  ['Drag / WASD / Arrows', 'Pan the HQ'],
  ['Scroll / pinch', 'Zoom at cursor'],
  ['Click bot', 'Inspect & follow'],
  ['Click room / prop', 'Open room controls / play'],
  ['0', 'Overview'],
  ['Space', 'Pause / resume'],
  ['⌘K / Ctrl+K', 'Command palette & event injector'],
  ['⇧⌘S / Ctrl+Shift+S', 'Pin screenshot for Kanye'],
  ['Esc', 'Close panels'],
  ['?', 'This help'],
];

export function HelpOverlay() {
  const open = useGame((s) => s.helpOpen);
  const setHelp = useGame((s) => s.setHelp);
  const shown = usePresence(open);
  if (!shown.mounted) return null;
  return (
    <div className="hq-anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-3 backdrop-blur-[2px]" onPointerDown={() => setHelp(false)} role="presentation" {...closingAttr(shown.closing)}>
      <div className="hq-card hq-anim-dialog hq-scroll max-h-full w-full max-w-[520px] overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Controls" onPointerDown={(e) => e.stopPropagation()} {...closingAttr(shown.closing)}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Controls</h2>
          <button className="hq-btn h-7 w-7 p-0" onClick={() => setHelp(false)} aria-label="Close help">
            <Icon name="close" size={12} />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          {ROWS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <Kbd>{k}</Kbd>
              </dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <h3 className="hq-label mb-1.5 mt-4">Bots · hotkeys</h3>
        <div className="grid grid-cols-2 gap-1 text-[11px] sm:grid-cols-4">
          {CORE_BOTS.map((b) => (
            <span key={b.id} className="flex items-center gap-1.5">
              <Kbd>{b.hotkey}</Kbd>
              <span className="h-2 w-2 rounded-full" style={{ background: b.color, boxShadow: `0 0 6px ${b.glowColor}`, outline: '1px solid rgba(127,127,127,.4)' }} />
              {b.name}
            </span>
          ))}
        </div>
        <p className="mt-4 text-[11px] leading-snug text-muted">Every room is playable: Quill's brass stamp, Sift's intake chute & dimmer, Greek's timeline, Barry's planner & mic, Moose's dictation wave, Kanye's relay rack, and the Foundry pod.</p>
      </div>
    </div>
  );
}
