/**
 * Marion Mystery root: screen routing, backdrop (2D or 3D per view
 * preference), match overlays, toasts, captions and platform glue
 * (invite links, iOS background/resume, audio unlock).
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import type { StagePose } from './Stage3D';
import { MODES } from '../core/modes';
import type { MatchEvent } from '../core/types';
import { wireInput } from '../client/controls';
import { runtime } from '../client/runtime';
import { installDebugHook, useMystery } from '../client/store';
import { normalizeCode, isValidCode } from '../net/protocol';
import { sfx } from '../audio/sfx';
import { BerryAvatar, MIcon } from './common';
import { EnergySlash, starfield, useViewport } from './kit';
import { GameView } from './GameView';
import { Hud } from './Hud';
import { BrowseScreen, HowToScreen, JoinScreen, ProfileScreen, SettingsScreen, TitleScreen } from './Menus';
import { MenuBackdrop2D } from './MenuBackdrop';
import { EjectOverlay, MeetingOverlay, ResultsScreen, RoleReveal, useStage } from './Overlays';

const Stage3D = lazy(() => import('./Stage3D'));
import { WaitingRoom } from './WaitingRoom';
import { FreeplayScreen, TutorialCoach } from './Freeplay';
import { CustomizeEditor } from './CustomizeEditor';
import { SeedCounter, ShopPanel } from './Shop';
import './mystery.css';

const MenuBackdrop3D = lazy(() => import('../render3d/backdrop3d').then((m) => ({ default: m.MenuBackdrop3D })));

const DEATH_STARS = starfield(23, 110);

function DeathCinematic() {
  const pid = useMystery((s) => s.pid);
  const reduced = useMystery((s) => s.prefs.reducedMotion);
  const [ev, setEv] = useState<{ killer: string | null; weapon: string } | null>(null);
  const [out, setOut] = useState(false);
  useEffect(
    () =>
      runtime.on((e: MatchEvent) => {
        if (e.type === 'kill' && e.target === pid) {
          setOut(false);
          setEv({ killer: e.actor ?? null, weapon: String(e.data?.weapon ?? 'knife') });
          const len = reduced ? 1200 : 2600;
          setTimeout(() => setOut(true), len - 300);
          setTimeout(() => setEv(null), len);
        }
      }),
    [pid, reduced],
  );
  const snap = useMystery((s) => s.snap);
  const use3d = useStage();
  if (!ev || !snap) return null;
  const killer = ev.killer ? snap.players.find((p) => p.id === ev.killer) : null;
  const me = snap.players.find((p) => p.id === pid);
  const title = ev.weapon === 'tag' ? 'Found!' : ev.weapon === 'poison' ? 'Poisoned' : 'Eliminated';
  const sub = ev.weapon === 'tag' ? 'The seeker got you.' : 'You’re a ghost now — keep helping your team.';
  return (
    <div className="mmd" data-state={out ? 'out' : 'in'} style={{ backgroundImage: DEATH_STARS }} role="alert">
      <EnergySlash />
      {use3d && me ? (
        <div className="mmd-stage">
          <Suspense fallback={null}>
            <Stage3D
              actors={[...(killer ? [{ cosmetics: killer.cosmetics, pose: (ev.weapon === 'gun' ? 'gun-spin' : 'kill-lunge') as StagePose, x: -0.9, fromX: -6, enter: 0.6 }] : []), { cosmetics: me.cosmetics, pose: 'squish' as StagePose, x: 0.9 }]}
              width={Math.min(560, innerWidth - 24)}
              height={260}
              light="#ff8a8a"
              reducedMotion={reduced}
            />
          </Suspense>
        </div>
      ) : (
        <div className="mmd-cast">
          {killer && (
            <div className="mmd-killer">
              <BerryAvatar cosmetics={killer.cosmetics} size={180} emote={ev.weapon === 'gun' ? 'gun-spin' : 'kill-lunge'} />
            </div>
          )}
          {me && (
            <div className="mmd-victim">
              <BerryAvatar cosmetics={me.cosmetics} size={160} emote="scared" />
            </div>
          )}
        </div>
      )}
      <div className="mmd-title">{title}</div>
      <div className="mmd-sub">{sub}</div>
    </div>
  );
}

const ROTATE_STARS = starfield(41, 90);

/** Phones only (touch, short side under 520 px): the game is played sideways. */
function isPhone(vp: { w: number; h: number }): boolean {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && Math.min(vp.w, vp.h) < 520;
}

/**
 * Marion Mystery is a landscape game on phones. iOS Safari can't lock the
 * orientation from a web page, so an upright phone gets a full-screen card
 * asking to turn it sideways (the match keeps running underneath).
 */
function RotateGate() {
  const vp = useViewport();
  const reduced = useMystery((s) => s.prefs.reducedMotion);
  const show = vp.portrait && isPhone(vp);
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), reduced ? 0 : 260);
    return () => clearTimeout(t);
  }, [show, reduced]);
  useEffect(() => {
    if (show) sfx.play('ui.open');
  }, [show]);
  if (!mounted) return null;
  return (
    <div className="mm-rotate" data-state={show ? 'in' : 'out'} style={{ backgroundImage: ROTATE_STARS }} role="alertdialog" aria-modal="true" aria-labelledby="mm-rotate-title">
      <div className="mm-rotate-phone" aria-hidden>
        <svg viewBox="0 0 120 120" width="132" height="132">
          <g className="mm-rotate-device">
            <rect x="38" y="14" width="44" height="92" rx="10" fill="#13161b" stroke="#f1f3f6" strokeWidth="5" />
            <rect x="45" y="24" width="30" height="66" rx="4" fill="#2f6fed" />
            <circle cx="60" cy="98" r="3.4" fill="#f1f3f6" />
          </g>
          <path className="mm-rotate-arrow" d="M96 40a40 40 0 0 1 4 34" fill="none" stroke="#ffd23f" strokeWidth="6" strokeLinecap="round" />
          <path className="mm-rotate-arrow" d="M92 70l8 6 5-9" fill="none" stroke="#ffd23f" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="mm-rotate-title" id="mm-rotate-title">
        Turn your phone sideways
      </div>
      <div className="mm-rotate-sub">Marion Mystery is played in landscape. If the screen doesn’t turn, switch off Portrait Orientation Lock in Control Center.</div>
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
    <div className="mm-captions" aria-live="polite">
      {lines.map((l) => (
        <span key={l.id} className="mm-caption">
          [{l.text}]
        </span>
      ))}
    </div>
  );
}

function Toasts() {
  const toasts = useMystery((s) => s.toasts);
  return (
    <div className="mm-toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className="mm-toast" data-tone={t.tone}>
          <MIcon name={t.tone === 'bad' ? 'close' : t.tone === 'good' ? 'check' : 'help'} size={16} stroke={2.6} />
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
      <div className="mm-loading">
        <div className="mm-spinner" aria-hidden />
        <div className="mm-label">Shuffling roles…</div>
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
      {snap.phase === 'play' && <TutorialCoach />}
    </div>
  );
}

function Wardrobe() {
  const prefs = useMystery((s) => s.prefs);
  const setPrefs = useMystery((s) => s.setPrefs);
  const setScreen = useMystery((s) => s.setScreen);
  const [tab, setTab] = useState<'shop' | 'wardrobe'>('wardrobe');
  const [leaving, setLeaving] = useState(false);
  /** Item handed from the Wardrobe tab (a locked tile) to the Shop. */
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setScreen('title');
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [setScreen]);
  const go = (t: 'shop' | 'wardrobe') => {
    if (t === tab || leaving) return;
    if (useMystery.getState().prefs.reducedMotion) return setTab(t);
    setLeaving(true);
    setTimeout(() => {
      setTab(t);
      setLeaving(false);
    }, 150);
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const t = tab === 'shop' ? 'wardrobe' : 'shop';
    go(t);
    (document.getElementById(`mmw-tab-${t}`) as HTMLElement | null)?.focus();
  };
  const preview = prefs.view === '2d' ? '2d' : '3d';
  return (
    <div className="mm-safe mmw">
      <div className="mmw-top mm-in-down">
        <button className="mm-round" onClick={() => setScreen('title')} aria-label="Back">
          <MIcon name="back" />
        </button>
        <div className="mmw-tabs" role="tablist" aria-label="Shop and wardrobe" onKeyDown={onTabKey}>
          {(['shop', 'wardrobe'] as const).map((t) => (
            <button key={t} id={`mmw-tab-${t}`} type="button" role="tab" className="mmw-tab" data-on={tab === t} aria-selected={tab === t} aria-controls="mmw-body" tabIndex={tab === t ? 0 : -1} onClick={() => go(t)}>
              <MIcon name={t === 'shop' ? 'bag' : 'hanger'} size={18} />
              {t === 'shop' ? 'Shop' : 'Wardrobe'}
            </button>
          ))}
        </div>
        <SeedCounter value={prefs.seeds} className="mmw-wallet" />
      </div>
      <div className="mmw-body mm-in-up" id="mmw-body" role="tabpanel" aria-labelledby={`mmw-tab-${tab}`} key={tab} data-state={leaving ? 'out' : 'in'}>
        {tab === 'shop' ? (
          <ShopPanel focusKey={focus} preview={preview} />
        ) : (
          <CustomizeEditor
            value={prefs.cosmetics}
            onChange={(c) => setPrefs({ cosmetics: c })}
            name={prefs.name}
            onNameChange={(n) => setPrefs({ name: n.slice(0, 16) })}
            preview={preview}
            onDone={() => setScreen('title')}
            owned={prefs.owned}
            onLocked={(k) => {
              setFocus(k);
              go('shop');
            }}
          />
        )}
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
  useEffect(() => installDebugHook(), []);
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
    sfx.configure({ muted: prefs.muted, volume: prefs.volume, music: prefs.music, menuTrack: prefs.menuTrack });
  }, [prefs.muted, prefs.volume, prefs.music, prefs.menuTrack]);
  useEffect(() => {
    const unlock = () => {
      sfx.unlock();
      // Where the browser allows it (Android, installed app), hold landscape. iOS refuses; the rotate card covers it.
      try {
        const o = window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        if (o?.lock && isPhone({ w: innerWidth, h: innerHeight })) o.lock('landscape').catch(() => {});
      } catch {
        /* unsupported */
      }
    };
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
      {!inRoom && screen === 'freeplay' && <FreeplayScreen />}
      {!inRoom && screen === 'wardrobe' && <Wardrobe />}
      {!inRoom && screen === 'room' && (
        <div className="mm-loading mm-loading-screen" role="status">
          <div className="mm-panel mm-loadcard mm-in-pop">
            <BerryAvatar cosmetics={prefs.cosmetics} size={110} moving />
            <div className="mm-loadcard-t">Connecting…</div>
            <div className="mm-loadbar" aria-hidden>
              <i />
            </div>
            <button className="mm-btn mm-pill" onClick={() => setScreen('title')}>
              <MIcon name="close" size={16} /> Cancel
            </button>
          </div>
        </div>
      )}
      {inRoom && (stage === 'lobby' || stage === 'countdown') && <WaitingRoom />}
      {inRoom && (stage === 'match' || stage === 'results') && <MatchScreen />}
      {onExit && !inRoom && (
        <button className="mm-btn mm-exit" onClick={onExit}>
          <MIcon name="back" /> Marion HQ
        </button>
      )}
      <Toasts />
      <Captions />
      <RotateGate />
    </div>
  );
}

export default MysteryApp;
