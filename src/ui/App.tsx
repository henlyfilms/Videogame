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
        hq.focusRoom(id, small ? 0 : undefined);
        dismissHint();
      } else hq.camera.follow = null;
    },
    [selectBot, selectRoom, small, dismissHint],
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

  return (
    <main className="relative h-full w-full overflow-hidden bg-bg text-ink">
      <GameCanvas onSelectBot={onBot} onSelectRoom={onRoom} onHotspot={onHotspot} />

      <TopBar />

      {adapter === 'replay' && (
        <div className="pointer-events-none absolute inset-x-3 top-[64px] z-10 flex justify-center max-sm:top-[104px]">
          <ReplayBar />
        </div>
      )}

      {paused && (
        <div className="pointer-events-none absolute left-1/2 top-[64px] z-10 -translate-x-1/2 max-sm:top-[104px]" style={adapter === 'replay' ? { top: 116 } : undefined}>
          <span className="hq-card px-2.5 py-1 text-[11px] font-semibold text-warn">⏸ Paused — Space to resume</span>
        </div>
      )}

      {panelOpen && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex max-h-[62vh] items-end sm:inset-x-auto sm:right-3 sm:top-16 sm:max-h-none sm:items-start">
          {selectedRoom ? (
            <RoomPopover room={selectedRoom} onClose={() => onRoom(null)} />
          ) : selectedBot ? (
            <BotInspector
              botId={selectedBot}
              onClose={() => {
                selectBot(null);
                hq.camera.follow = null;
              }}
            />
          ) : null}
        </div>
      )}

      {!(small && panelOpen) && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-h-[45vh] max-sm:right-3">
          <ActivityFeed onPanRoom={(r) => onRoom(r)} onPanBot={(id) => onBot(id)} />
        </div>
      )}

      {hint && !panelOpen && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 md:block">
          <div className="hq-card pointer-events-auto flex items-center gap-3 px-3 py-2 text-xs">
            <span>
              <b>Welcome to Marion HQ.</b> Click any room or glowing prop to play it · <span className="text-muted">1–8 bots · ⌘K commands</span>
            </span>
            <button className="hq-btn px-2 py-0.5" onClick={dismissHint}>
              Got it
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-40 -translate-x-1/2" role="status" aria-live="polite">
          <div className="hq-card px-3 py-1.5 text-xs font-medium">{toast}</div>
        </div>
      )}

      <CommandPalette toast={showToast} />
      <HelpOverlay />
      <ArcadeOverlay />
    </main>
  );
}
