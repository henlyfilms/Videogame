import { useEffect } from 'react';
import { CORE_BOTS } from '../data/bots';
import { actions } from '../game/actions';
import { hq } from '../game/hq';
import { useGame } from '../store/gameStore';

const PAN_KEYS: Record<string, string> = {
  w: 'up',
  arrowup: 'up',
  s: 'down',
  arrowdown: 'down',
  a: 'left',
  arrowleft: 'left',
  d: 'right',
  arrowright: 'right',
};

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/** Global keyboard shortcuts. */
export function useShortcuts(toast: (m: string) => void): void {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const s = useGame.getState();
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && key === 'k') {
        e.preventDefault();
        s.setPalette(!s.paletteOpen);
        return;
      }
      if (mod && e.shiftKey && key === 's') {
        e.preventDefault();
        actions.pinScreenshot();
        toast('📸 Screenshot pinned for Kanye');
        return;
      }
      if (key === 'escape') {
        if (s.paletteOpen) s.setPalette(false);
        else if (s.helpOpen) s.setHelp(false);
        else if (s.selectedBot || s.selectedRoom) {
          s.selectBot(null);
          s.selectRoom(null);
          hq.camera.follow = null;
        }
        return;
      }
      if (isTyping(e) || mod || e.altKey || s.paletteOpen) return;
      const pan = PAN_KEYS[key];
      if (pan) {
        e.preventDefault();
        hq.keys.add(pan);
        hq.camera.follow = null;
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        s.togglePause();
        return;
      }
      if (key === '?') {
        s.setHelp(!s.helpOpen);
        return;
      }
      if (key === '0') {
        s.selectBot(null);
        s.selectRoom(null);
        hq.overview();
        return;
      }
      const n = Number(key);
      if (n >= 1 && n <= 8) {
        const bot = CORE_BOTS.find((b) => b.hotkey === n);
        if (bot) {
          s.selectRoom(null);
          s.selectBot(bot.id);
          hq.focusBot(bot.id);
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const pan = PAN_KEYS[e.key.toLowerCase()];
      if (pan) hq.keys.delete(pan);
    };
    const onBlur = () => hq.keys.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [toast]);
}
