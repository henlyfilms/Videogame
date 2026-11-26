import { ROOM_BY_ID } from '../engine/world';
import type { RoomId } from '../data/bots';
import { ROOM_ACCENT } from '../render/props';
import { RoomPanelBody, ROOM_BLURB } from './rooms/RoomPanels';

export function RoomPopover({ room, onClose }: { room: RoomId; onClose: () => void }) {
  const def = ROOM_BY_ID[room];
  return (
    <aside
      className="hq-card pointer-events-auto flex max-h-full w-full flex-col overflow-hidden sm:w-[360px]"
      aria-label={`${def.name} controls`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ROOM_ACCENT[room], boxShadow: `0 0 8px ${ROOM_ACCENT[room]}` }} />
            <h2 className="truncate text-sm font-semibold">{def.name}</h2>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">{ROOM_BLURB[room]}</p>
        </div>
        <button className="hq-btn h-7 w-7 shrink-0 p-0" onClick={onClose} aria-label="Close room panel">
          ✕
        </button>
      </header>
      <div className="hq-scroll overflow-y-auto px-4 py-3">
        <RoomPanelBody room={room} />
      </div>
    </aside>
  );
}
