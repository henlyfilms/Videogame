import { useCallback, useEffect, useState } from 'react';
import { ArcadeOverlay } from '../arcade/ArcadeOverlay';
import type { RoomId } from '../data/bots';
import type { HotspotAction } from '../engine/world';
import { actions } from '../game/actions';
import { hq } from '../game/hq';
import { boot } from '../game/runtime';
import { useGame } from '../store/gameStore';
import { ActivityFeed } from './ActivityFeed';
import { BotInspector } from './BotInspector';
import { CommandPalette } from './CommandPalette';
import { GameCanvas } from './GameCanvas';
import { HelpOverlay } from './HelpOverlay';
import { useMediaQuery } from './hooks';
import { closingAttr, usePresence } from './motion';
import { ReplayBar } from './ReplayBar';
import { RoomPopover } from './RoomPopover';
import { TopBar } from './TopBar';
import { useShortcuts } from './useShortcuts';

const HINT_KEY = 'marion-hq:hinted';

export function App() {
  const selectedRoom = useGame((s) => s.selectedRoom);
  const selectedBot = useGame((s) => s.selectedBot);
  const selectRoom = useGame((s) => s.selectRoom);
  const selectBot = useGame((s) => s.selectBot);
  const paused = useGame((s) => s.paused);
  const adapter = useGame((s) => s.adapter);
  const [toast, setToast] = useState<string | null>(null);
  const [hint, setHint] = useState(false);
  const small = useMediaQuery('(max-width: 639px)');
  const touch = useMediaQuery('(pointer: coarse)');

  useEffect(() => {
    boot();
    try {
      if (!localStorage.getItem(HINT_KEY)) setHint(true);
    } catch {
      /* storage blocked */
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const dismissHint = useCallback(() => {
    setHint(false);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const showToast = useCallback((m: string) => setToast(m), []);
  useShortcuts(showToast);

  const onRoom = useCallback(
    (id: RoomId | null) => {
      selectBot(null);
      selectRoom(id);
      if (id) {
        hq.focusRoom(id);
        dismissHint();
      } else hq.camera.follow = null;
    },
    [selectBot, selectRoom, dismissHint],
  );

  const onBot = useCallback(
    (id: string | null) => {
      selectRoom(null);
      selectBot(id);
      if (id) {
        hq.focusBot(id);
        dismissHint();
      }
    },
    [selectBot, selectRoom, dismissHint],
  );

  const onHotspot = useCallback(
    (room: RoomId, action: HotspotAction) => {
      const msg = actions.hotspot(room, action);
      if (msg) setToast(msg);
      onRoom(room);
    },
    [onRoom],
  );

  const panelOpen = !!(selectedRoom || selectedBot);
  // Panels animate out with their last content; switching rooms/bots re-plays the entrance.
  const panel = usePresence<{ kind: 'room'; id: RoomId } | { kind: 'bot'; id: string }>(selectedRoom ? { kind: 'room', id: selectedRoom } : selectedBot ? { kind: 'bot', id: selectedBot } : null);
  const replayBar = usePresence(adapter === 'replay');
  const pausedPill = usePresence(paused);
  const hintCard = usePresence(hint && !panelOpen);
  const toastCard = usePresence(toast);
  const below = (extra = 0) => ({ top: `calc(var(--hq-top, 64px) + ${extra}px)` });

  return (
    <main className="relative h-full w-full overflow-hidden bg-bg text-ink">
      <GameCanvas onSelectBot={onBot} onSelectRoom={onRoom} onHotspot={onHotspot} />

      <TopBar />

      {replayBar.mounted && (
        <div className="pointer-events-none absolute inset-x-3 z-10 flex justify-center" style={below()}>
          <div className="hq-anim-pop flex w-full justify-center" {...closingAttr(replayBar.closing)}>
            <ReplayBar />
          </div>
        </div>
      )}

      {pausedPill.mounted && (
        <div className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2" style={below(adapter === 'replay' ? 52 : 0)}>
          <span className="hq-card hq-anim-pop block whitespace-nowrap px-2.5 py-1 text-[11px] font-semibold text-warn" {...closingAttr(pausedPill.closing)}>
            ⏸ Paused — {touch ? 'tap ▶ to resume' : 'Space to resume'}
          </span>
        </div>
      )}

      {panel.mounted && panel.value && (
        <div
          className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex max-h-[62vh] items-end sm:inset-x-auto sm:right-3 sm:max-h-none sm:items-start"
          style={small ? undefined : below()}
        >
          <div key={`${panel.value.kind}:${panel.value.id}`} className={`flex max-h-[62vh] w-full flex-col sm:max-h-full sm:w-auto ${small ? 'hq-anim-sheet' : 'hq-anim-side'}`} {...closingAttr(panel.closing)}>
            {panel.value.kind === 'room' ? (
              <RoomPopover room={panel.value.id} onClose={() => onRoom(null)} />
            ) : (
              <BotInspector
                botId={panel.value.id}
                onClose={() => {
                  selectBot(null);
                  hq.camera.follow = null;
                }}
              />
            )}
          </div>
        </div>
      )}

      {!(small && panelOpen) && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-h-[45vh] max-sm:right-3">
          <ActivityFeed onPanRoom={(r) => onRoom(r)} onPanBot={(id) => onBot(id)} />
        </div>
      )}

      {hintCard.mounted && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden md:block min-[1400px]:left-1/2 min-[1400px]:right-auto min-[1400px]:-translate-x-1/2">
          <div className="hq-card hq-anim-rise pointer-events-auto flex items-center gap-3 px-3 py-2 text-xs" {...closingAttr(hintCard.closing)}>
            <span>
              <b>Welcome to Marion HQ.</b> Click any room or glowing prop to play it · <span className="text-muted">1–8 bots · ⌘K commands</span>
            </span>
            <button className="hq-btn px-2 py-0.5" onClick={dismissHint}>
              Got it
            </button>
          </div>
        </div>
      )}

      {toastCard.mounted && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-40 -translate-x-1/2" role="status" aria-live="polite">
          <div className="hq-card hq-anim-rise whitespace-nowrap px-3 py-1.5 text-xs font-medium" {...closingAttr(toastCard.closing)}>
            {toastCard.value}
          </div>
        </div>
      )}

      <CommandPalette toast={showToast} />
      <HelpOverlay />
      <ArcadeOverlay />
    </main>
  );
}
