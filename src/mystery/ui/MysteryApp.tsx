/**
 * Marion Mystery root: screen routing, backdrop (2D or 3D per view
 * preference), match overlays, toasts, captions and platform glue
 * (invite links, iOS background/resume, audio unlock).
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { MODES } from '../core/modes';
import type { MatchEvent } from '../core/types';
import { wireInput } from '../client/controls';
import { runtime } from '../client/runtime';
import { useMystery } from '../client/store';
import { normalizeCode, isValidCode } from '../net/protocol';
import { sfx } from '../audio/sfx';
import { BerryAvatar, MIcon } from './common';
import { GameView } from './GameView';
import { Hud } from './Hud';
import { BrowseScreen, HowToScreen, JoinScreen, ProfileScreen, SettingsScreen, TitleScreen } from './Menus';
import { MenuBackdrop2D } from './MenuBackdrop';
import { EjectOverlay, MeetingOverlay, ResultsScreen, RoleReveal } from './Overlays';
import { WaitingRoom } from './WaitingRoom';
import { CustomizeEditor } from './CustomizeEditor';
import './mystery.css';

const MenuBackdrop3D = lazy(() => import('../render3d/backdrop3d').then((m) => ({ default: m.MenuBackdrop3D })));

function DeathCinematic() {
  const pid = useMystery((s) => s.pid);
  const reduced = useMystery((s) => s.prefs.reducedMotion);
  const [ev, setEv] = useState<{ killer: string | null; weapon: string } | null>(null);
  useEffect(
    () =>
      runtime.on((e: MatchEvent) => {
        if (e.type === 'kill' && e.target === pid) {
          setEv({ killer: e.actor ?? null, weapon: String(e.data?.weapon ?? 'knife') });
          setTimeout(() => setEv(null), reduced ? 1200 : 2600);
        }
      }),
    [pid, reduced],
  );
  const snap = useMystery((s) => s.snap);
  if (!ev || !snap) return null;
  const killer = ev.killer ? snap.players.find((p) => p.id === ev.killer) : null;
  const me = snap.players.find((p) => p.id === pid);
  return (
    <div className="mm-anim-fade" style={{ position: 'absolute', inset: 0, zIndex: 47, background: 'radial-gradient(circle, rgba(120,10,30,0.85), rgba(5,3,10,0.95))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 30, animation: reduced ? undefined : 'mm-shake 0.35s 2' }}>
        {killer && (
          <div style={{ animation: reduced ? undefined : 'mm-lunge 0.7s cubic-bezier(.2,.9,.3,1.3) both' }}>
            <BerryAvatar cosmetics={killer.cosmetics} size={170} emote={ev.weapon === 'gun' ? 'gun-spin' : 'kill-lunge'} />
          </div>
        )}
        {me && (
          <div style={{ animation: reduced ? undefined : 'mm-squish 0.9s 0.35s ease-in both' }}>
            <BerryAvatar cosmetics={me.cosmetics} size={150} emote="scared" />
          </div>
        )}
      </div>
      <style>{'@keyframes mm-lunge{from{transform:translateX(-60vw) scale(.8)}to{transform:none}} @keyframes mm-squish{0%{transform:none}50%{transform:scale(1.2,.6)}100%{transform:scale(1.5,.15) translateY(40px);opacity:.3}}'}</style>
      <div className="mm-title mm-anim-pop" style={{ fontSize: 'clamp(36px, 8vw, 72px)', background: 'linear-gradient(180deg,#fff,#ff4d5e)', WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>
        {ev.weapon === 'tag' ? 'FOUND!' : ev.weapon === 'poison' ? 'POISONED' : 'ELIMINATED'}
      </div>
      <div style={{ fontWeight: 700 }}>{ev.weapon === 'tag' ? 'The seeker got you.' : 'You’re a ghost now — keep helping your team.'}</div>
    </div>
  );
}

function Captions() {
  const on = useMystery((s) => s.prefs.captions);
  const [lines, setLines] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    if (!on) return;
    let n = 0;
    return sfx.onCaption((text) => {
      const id = ++n;
      setLines((l) => [...l.slice(-2), { id, text }]);
      setTimeout(() => setLines((l) => l.filter((x) => x.id !== id)), 2200);
    });
  }, [on]);
  if (!on || !lines.length) return null;
  return (
    <div style={{ position: 'absolute', bottom: '22%', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 70, pointerEvents: 'none' }} aria-live="polite">
      {lines.map((l) => (
        <span key={l.id} style={{ background: 'rgba(0,0,0,0.75)', padding: '3px 10px', borderRadius: 6, fontSize: '0.9em' }}>
          [{l.text}]
        </span>
      ))}
    </div>
  );
}

function Toasts() {
  const toasts = useMystery((s) => s.toasts);
  return (
    <div style={{ position: 'absolute', top: 'max(70px, 9vh)', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 80, pointerEvents: 'none' }} role="status">
      {toasts.map((t) => (
        <div key={t.id} className="mm-panel mm-anim-pop" style={{ padding: '8px 14px', borderColor: t.tone === 'bad' ? '#ff4d5e' : t.tone === 'good' ? '#4ade80' : undefined }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function MatchScreen() {
  const room = useMystery((s) => s.room)!;
  const snap = useMystery((s) => s.snap);
  const view = useMystery((s) => s.matchView) ?? '2d';
  if (!snap)
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ animation: 'mm-spin 1.2s linear infinite' }}>
          <MIcon name="berry" size={48} />
        </div>
        <div className="mm-muted">Shuffling roles…</div>
      </div>
    );
  const settings = room.settings;
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <GameView view={view} />
      {snap.phase === 'play' && <Hud snap={snap} settings={settings} />}
      {snap.phase === 'intro' && <RoleReveal snap={snap} />}
      {snap.phase === "meeting" && snap.meeting && <MeetingOverlay snap={snap} settings={settings} />}
      {snap.phase === 'eject' && snap.eject && <EjectOverlay snap={snap} settings={settings} />}
      {snap.phase === 'ended' && snap.result && <ResultsScreen snap={snap} />}
      <DeathCinematic />
    </div>
  );
}

function Wardrobe() {
  const prefs = useMystery((s) => s.prefs);
  const setPrefs = useMystery((s) => s.setPrefs);
  const setScreen = useMystery((s) => s.setScreen);
  return (
    <div className="mm-safe" style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}>
      <div className="mm-panel" style={{ maxWidth: 1000, margin: '0 auto', padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button className="mm-btn" onClick={() => setScreen('title')} aria-label="Back" style={{ padding: 8 }}>
            <MIcon name="back" />
          </button>
          <h2 style={{ margin: 0 }}>Wardrobe</h2>
        </div>
        <CustomizeEditor value={prefs.cosmetics} onChange={(c) => setPrefs({ cosmetics: c })} name={prefs.name} onNameChange={(n) => setPrefs({ name: n.slice(0, 16) })} preview={prefs.view === '2d' ? '2d' : '3d'} />
      </div>
    </div>
  );
}

export function MysteryApp({ onExit }: { onExit?: () => void }) {
  const screen = useMystery((s) => s.screen);
  const room = useMystery((s) => s.room);
  const prefs = useMystery((s) => s.prefs);
  const joinRoom = useMystery((s) => s.joinRoom);
  const setScreen = useMystery((s) => s.setScreen);

  useEffect(() => wireInput(), []);
  // Invite links: ?room=CODE jumps straight into the room.
  useEffect(() => {
    try {
      const code = normalizeCode(new URLSearchParams(location.search).get('room') ?? '');
      if (isValidCode(code)) joinRoom(code);
    } catch {
      /* ignore */
    }
  }, [joinRoom]);
  // Audio follows prefs; unlock on first gesture (iOS).
  useEffect(() => {
    sfx.configure({ muted: prefs.muted, volume: prefs.volume, music: prefs.music });
  }, [prefs.muted, prefs.volume, prefs.music]);
  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const vis = () => {
      if (document.visibilityState === 'visible') useMystery.getState().send({ t: 'ping', n: 0 });
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  useEffect(() => sfx.bind(), []);

  const inRoom = screen === 'room' && room;
  const stage = room?.stage;
  const menuView = prefs.view === '2d' ? '2d' : '3d';
  const ambience = room?.settings.mode ? MODES[room.settings.mode].ambient : 'bright';
  useEffect(() => {
    sfx.setScene(inRoom ? (stage === 'match' ? (ambience === 'night' ? 'night' : 'match') : 'lobby') : 'menu');
  }, [inRoom, stage, ambience]);

  return (
    <div className={`mm-root ${prefs.reducedMotion ? 'mm-reduced' : ''}`} style={{ ['--mm-scale' as string]: prefs.textScale }}>
      {!inRoom && (menuView === '3d' ? <Suspense fallback={<MenuBackdrop2D />}><MenuBackdrop3D /></Suspense> : <MenuBackdrop2D />)}
      {!inRoom && screen === 'title' && <TitleScreen />}
      {!inRoom && screen === 'join' && <JoinScreen />}
      {!inRoom && screen === 'browse' && <BrowseScreen />}
      {!inRoom && screen === 'settings' && <SettingsScreen />}
      {!inRoom && screen === 'profile' && <ProfileScreen />}
      {!inRoom && screen === 'howto' && <HowToScreen />}
      {!inRoom && screen === 'wardrobe' && <Wardrobe />}
      {!inRoom && screen === 'room' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <BerryAvatar cosmetics={prefs.cosmetics} size={110} moving />
          <div className="mm-muted">Connecting…</div>
          <button className="mm-btn" onClick={() => setScreen('title')}>
            Cancel
          </button>
        </div>
      )}
      {inRoom && (stage === 'lobby' || stage === 'countdown') && <WaitingRoom />}
      {inRoom && (stage === 'match' || stage === 'results') && <MatchScreen />}
      {onExit && !inRoom && (
        <button className="mm-btn" style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 'max(12px, env(safe-area-inset-left))', zIndex: 30 }} onClick={onExit}>
          <MIcon name="back" /> Marion HQ
        </button>
      )}
      <Toasts />
      <Captions />
    </div>
  );
}

export default MysteryApp;
