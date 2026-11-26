/**
 * Front-end menus: title, join (big keypad + paste), room browser, the tabbed
 * settings menu (Audio / Gameplay / Controls / Match — also used in-match and
 * in the waiting room), profile/stats and how-to-play. Rendered over either
 * the 2D or the 3D backdrop depending on the player's view preference.
 */
import { useEffect, useMemo, useState } from 'react';
import { MODE_LIST } from '../core/modes';
import { ROLES } from '../core/roles';
import { CODE_ALPHABET, CODE_LENGTH, normalizeCode } from '../net/protocol';
import type { RoleId, ViewMode } from '../core/types';
import { DEFAULT_KEYS, defaultPrefs, type Keybinds, type Prefs } from '../client/prefs';
import { useMystery } from '../client/store';
import { availableMaps } from '../core/maps';
import { BerryAvatar, MIcon, Modal, teamColors } from './common';
import { Hazard, keyLabel } from './kit';
import { TRACKS } from '../audio/music';
import { music } from '../audio/music';

export function ViewPicker({ value, onChange, compact = false }: { value: ViewMode; onChange(v: ViewMode): void; compact?: boolean }) {
  const opts: { v: ViewMode; label: string; sub: string; icon: string }[] = [
    { v: '3d-tp', label: '3D Third Person', sub: 'Over the shoulder', icon: 'users' },
    { v: '3d-fp', label: '3D First Person', sub: 'Through their eyes', icon: 'eye' },
    { v: '2d', label: '2D Simplified', sub: 'Top-down & light', icon: 'map' },
  ];
  return (
    <div role="radiogroup" aria-label="View mode" className={`mm-seg${compact ? ' compact' : ''}`}>
      {opts.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} className="mm-seg-opt" onClick={() => onChange(o.v)}>
          <MIcon name={o.icon} size={compact ? 18 : 22} />
          <span className="mm-seg-label">{o.label}</span>
          {!compact && <span className="mm-seg-sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function TitleScreen() {
  const prefs = useMystery((s) => s.prefs);
  const setPrefs = useMystery((s) => s.setPrefs);
  const setScreen = useMystery((s) => s.setScreen);
  const startSolo = useMystery((s) => s.startSolo);
  const createRoom = useMystery((s) => s.createRoom);
  const conn = useMystery((s) => s.conn);
  const [name, setName] = useState(prefs.name);
  useEffect(() => setName(prefs.name), [prefs.name]);
  const commitName = () => setPrefs({ name: name.trim().slice(0, 16) || 'Berry' });
  return (
    <div className="mmx mm-safe">
      <div className="mmx-grid">
        <div className="mmx-hero">
          <div className="mmx-logo mm-in-down">
            <span className="mmx-logo-top">Marion</span>
            <span className="mmx-logo-main">Mystery</span>
            <Hazard className="mmx-logo-haz" />
            <span className="mmx-logo-tag">Social deduction · 4–20 players · humans &amp; bots</span>
          </div>
          <div className="mmx-stand mm-in-up" style={{ animationDelay: '120ms' }}>
            <div className="mmx-avatar">
              <BerryAvatar cosmetics={prefs.cosmetics} size={170} />
            </div>
            <div className="mmx-pedestal" aria-hidden />
            <label className="mmx-name">
              <span className="mm-label">Your name</span>
              <input className="mm-input" value={name} maxLength={16} placeholder="Berry" onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} aria-label="Your name" />
            </label>
          </div>
        </div>
        <div className="mmx-menu mm-panel mm-in-right" style={{ animationDelay: '80ms' }}>
          <button
            className="mm-btn mm-btn-primary mm-pill mmx-play"
            onClick={() => {
              commitName();
              startSolo();
            }}
          >
            <MIcon name="play" /> Quick Play vs Marion Bots
          </button>
          <div className="mmx-row2">
            <button
              className="mm-btn"
              onClick={() => {
                commitName();
                createRoom({ privacy: 'code' });
              }}
            >
              <MIcon name="plus" /> Create Room
            </button>
            <button
              className="mm-btn"
              onClick={() => {
                commitName();
                setScreen('join');
              }}
            >
              <MIcon name="door" /> Join by Code
            </button>
          </div>
          <button className="mm-btn" onClick={() => setScreen('browse')}>
            <MIcon name="globe" /> Browse Rooms
          </button>
          <button className="mm-btn" onClick={() => setScreen('freeplay')}>
            <MIcon name="flag" /> Freeplay &amp; Tutorial
          </button>
          <button className="mm-btn" onClick={() => setScreen('howto')}>
            <MIcon name="help" /> How to Play
          </button>
          <div className="mmx-view">
            <span className="mm-label">View — choose before the match</span>
            <ViewPicker value={prefs.view} onChange={(v) => setPrefs({ view: v })} compact />
          </div>
          <div className="mmx-icons">
            <button className="mmx-icon" onClick={() => setScreen('wardrobe')} aria-label="Customize">
              <MIcon name="hanger" size={26} />
              <span>Customize</span>
            </button>
            <button className="mmx-icon" onClick={() => setScreen('profile')} aria-label="Stats">
              <MIcon name="stats" size={26} />
              <span>Stats</span>
            </button>
            <button className="mmx-icon" onClick={() => setScreen('settings')} aria-label="Settings">
              <MIcon name="gear" size={26} />
              <span>Settings</span>
            </button>
          </div>
          {conn === 'reconnecting' && <div className="mm-chip warn">Connecting to the game server…</div>}
        </div>
      </div>
    </div>
  );
}

export function JoinScreen() {
  const joinRoom = useMystery((s) => s.joinRoom);
  const setScreen = useMystery((s) => s.setScreen);
  const error = useMystery((s) => s.error);
  const [code, setCode] = useState(() => {
    try {
      return normalizeCode(new URLSearchParams(location.search).get('room') ?? '');
    } catch {
      return '';
    }
  });
  const press = (ch: string) => setCode((c) => normalizeCode(c + ch));
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
      else if (e.key === 'Enter' && code.length === CODE_LENGTH) joinRoom(code);
      else if (e.key === 'Escape') setScreen('title');
      else if (/^[a-z0-9]$/i.test(e.key)) press(e.key);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [code, joinRoom, setScreen]);
  const keys = CODE_ALPHABET.split('');
  return (
    <div className="mm-safe mm-center-screen">
      <div className="mm-panel mm-card mm-in-pop" style={{ width: 'min(540px, 100%)' }}>
        <div className="mm-card-head">
          <button className="mm-round" aria-label="Back" onClick={() => setScreen('title')}>
            <MIcon name="back" />
          </button>
          <h2>Join a room</h2>
        </div>
        <div className="mmj-slots" aria-label="Room code" aria-live="polite">
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <div key={i} className="mmj-slot" data-cur={i === code.length} data-full={!!code[i]}>
              {code[i] ? (
                <span key={code[i] + i} className="mm-bump">
                  {code[i]}
                </span>
              ) : (
                ''
              )}
            </div>
          ))}
        </div>
        <input
          className="mm-input"
          placeholder="…or paste a code / invite link"
          aria-label="Paste code"
          onChange={(e) => {
            const v = e.target.value;
            const m = v.match(/room=([A-Za-z0-9]+)/);
            setCode(normalizeCode(m ? m[1]! : v));
          }}
          style={{ marginBottom: 12, textAlign: 'center' }}
        />
        <div className="mmj-keys">
          {keys.map((k) => (
            <button key={k} className="mmj-key" onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <button className="mmj-key wide" onClick={() => setCode((c) => c.slice(0, -1))} aria-label="Delete">
            ⌫
          </button>
          <button className="mmj-key wide" onClick={() => setCode('')}>
            Clear
          </button>
        </div>
        {error && (
          <div role="alert" className="mm-error">
            {error}
          </div>
        )}
        <button className="mm-btn mm-btn-primary mm-pill" style={{ width: '100%', marginTop: 14, minHeight: 54 }} disabled={code.length !== CODE_LENGTH} onClick={() => joinRoom(code)}>
          Join {code.length === CODE_LENGTH ? code : ''}
        </button>
      </div>
    </div>
  );
}

export function BrowseScreen() {
  const listRooms = useMystery((s) => s.listRooms);
  const listing = useMystery((s) => s.listing);
  const joinRoom = useMystery((s) => s.joinRoom);
  const setScreen = useMystery((s) => s.setScreen);
  const conn = useMystery((s) => s.conn);
  useEffect(() => {
    listRooms();
    const t = setInterval(listRooms, 4000);
    return () => clearInterval(t);
  }, [listRooms]);
  const maps = useMemo(() => Object.fromEntries(availableMaps().map((m) => [m.id, m.name])), []);
  return (
    <div className="mm-safe mm-center-screen">
      <div className="mm-panel mm-card mm-in-pop" style={{ width: 'min(700px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="mm-card-head">
          <button className="mm-round" aria-label="Back" onClick={() => setScreen('title')}>
            <MIcon name="back" />
          </button>
          <h2>Public &amp; LAN rooms</h2>
          <span className="mm-chip">
            <MIcon name="wifi" size={14} /> {conn}
          </span>
        </div>
        <div className="mm-scroll mmb-list">
          {listing.length === 0 && <div className="mm-empty">No open rooms yet. Create one and share the code!</div>}
          {listing.map((r, i) => (
            <button key={r.code} className="mmb-row" style={{ ['--i' as string]: i }} disabled={r.stage !== 'lobby' || r.players >= r.max} onClick={() => joinRoom(r.code)}>
              <span className="mmb-row-main">
                <b className="mm-nocase">{r.host}&rsquo;s room</b>
                <small>
                  {MODE_LIST.find((m) => m.id === r.mode)?.name} · {maps[r.map] ?? r.map} · {r.privacy === 'lan' ? 'LAN' : 'Public'}
                </small>
              </span>
              <span className="mmb-cap">
                <MIcon name="users" size={16} /> {r.players}/{r.max} {r.stage !== 'lobby' ? '· playing' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange(v: boolean): void; hint?: string }) {
  return (
    <label className="mms-row mms-toggle">
      <span className="mms-row-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={value} onChange={(e) => onChange(e.target.checked)} className="mm-switch" />
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; fmt?: (v: number) => string }) {
  return (
    <label className="mms-row">
      <span className="mms-row-label">{label}</span>
      <input type="range" className="mm-range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--k' as string]: (value - min) / (max - min) }} />
      <span className="mms-row-val">{fmt ? fmt(value) : value}</span>
    </label>
  );
}

function Jukebox({ value, onChange }: { value: string; onChange(v: string): void }) {
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => {
    // Back to the chosen menu track when leaving settings.
    music.play(value);
  }, [value]);
  return (
    <div style={{ marginTop: 10 }}>
      <div className="mm-label" style={{ marginBottom: 6 }}>
        Jukebox — preview the soundtrack
      </div>
      <div className="mm-scroll mms-juke">
        {TRACKS.map((t) => (
          <div key={t.id} className="mms-track" data-playing={playing === t.id}>
            <button
              className="mm-round sm"
              aria-label={`${playing === t.id ? 'Stop' : 'Play'} ${t.name}`}
              onClick={() => {
                if (playing === t.id) {
                  setPlaying(null);
                  music.play(value);
                } else {
                  setPlaying(t.id);
                  music.play(t.id, 0.6);
                }
              }}
            >
              {playing === t.id ? '■' : '▶'}
            </button>
            <span style={{ flex: 1, fontSize: '0.88em' }}>
              <b>{t.name}</b>
              <span className="mm-muted"> · {t.mood}</span>
            </span>
            <label className="mm-muted mms-radio">
              <input type="radio" name="menu-track" checked={value === t.id} onChange={() => onChange(t.id)} /> menus
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

type SettingsTab = 'audio' | 'gameplay' | 'controls' | 'match';
const SETTINGS_TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'audio', label: 'Audio', icon: 'speaker' },
  { id: 'gameplay', label: 'Gameplay', icon: 'sliders' },
  { id: 'controls', label: 'Controls', icon: 'pad' },
  { id: 'match', label: 'Match', icon: 'flag' },
];

/**
 * Tabbed settings: Audio / Gameplay / Controls / Match, a "Leave game" in the
 * Match tab when in a room, and per-tab Defaults.
 */
export function SettingsMenu({ inMatch, startTab = 'audio' }: { inMatch?: { code: string; mode: string; map: string; onResume?: () => void; onLeave: () => void; extra?: React.ReactNode }; startTab?: SettingsTab }) {
  const prefs = useMystery((s) => s.prefs);
  const setPrefs = useMystery((s) => s.setPrefs);
  const [tab, setTab] = useState<SettingsTab>(startTab);
  const [rebind, setRebind] = useState<keyof Keybinds | null>(null);
  useEffect(() => {
    if (!rebind) return;
    const k = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') setPrefs({ keys: { ...prefs.keys, [rebind]: e.code } });
      setRebind(null);
    };
    window.addEventListener('keydown', k, { once: true, capture: true });
    return () => window.removeEventListener('keydown', k, { capture: true });
  }, [rebind, prefs.keys, setPrefs]);
  const set = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => setPrefs({ [k]: v } as Partial<Prefs>);
  const defaults = () => {
    const d = defaultPrefs();
    if (tab === 'audio') setPrefs({ muted: d.muted, volume: d.volume, music: d.music, captions: d.captions, menuTrack: d.menuTrack });
    else if (tab === 'gameplay') setPrefs({ view: d.view, quality: d.quality, reducedMotion: d.reducedMotion, colorblind: d.colorblind, textScale: d.textScale, highVisibility: d.highVisibility, profanityFilter: d.profanityFilter, sensitivity: d.sensitivity, invertY: d.invertY });
    else if (tab === 'controls') setPrefs({ keys: { ...DEFAULT_KEYS } });
    else setPrefs({ serverUrl: d.serverUrl });
  };
  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = SETTINGS_TABS.findIndex((t) => t.id === tab);
    const n = e.key === 'ArrowRight' ? (i + 1) % SETTINGS_TABS.length : e.key === 'ArrowLeft' ? (i + SETTINGS_TABS.length - 1) % SETTINGS_TABS.length : -1;
    if (n < 0) return;
    e.preventDefault();
    setTab(SETTINGS_TABS[n]!.id);
    (e.currentTarget.children[n] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="mms">
      <div className="mms-tabs" role="tablist" aria-label="Settings sections" onKeyDown={onTabKey}>
        {SETTINGS_TABS.map((t) => (
          <button key={t.id} role="tab" id={`mms-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="mms-panel" tabIndex={tab === t.id ? 0 : -1} className="mms-tab" onClick={() => setTab(t.id)}>
            <MIcon name={t.icon} size={18} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="mms-panel" id="mms-panel" role="tabpanel" aria-labelledby={`mms-tab-${tab}`}>
        <div key={tab} className="mms-page">
          {tab === 'audio' && (
            <>
              <Toggle label="Mute everything" value={prefs.muted} onChange={set('muted')} />
              <Slider label="Effects volume" value={prefs.volume} min={0} max={1} step={0.05} onChange={set('volume')} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Slider label="Music & ambience" value={prefs.music} min={0} max={1} step={0.05} onChange={set('music')} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Toggle label="Captions for sounds" value={prefs.captions} onChange={set('captions')} />
              <Jukebox value={prefs.menuTrack} onChange={set('menuTrack')} />
            </>
          )}
          {tab === 'gameplay' && (
            <div className="mms-cols">
              <section>
                <h3 className="mm-label">View &amp; graphics</h3>
                <ViewPicker value={prefs.view} onChange={set('view')} compact />
                <label className="mms-row">
                  <span className="mms-row-label">Quality</span>
                  <select className="mm-input mms-select" value={prefs.quality} onChange={(e) => set('quality')(e.target.value as Prefs['quality'])}>
                    <option value="auto">Auto</option>
                    <option value="low">Low (battery saver)</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <Slider label="Look sensitivity" value={prefs.sensitivity} min={0.3} max={2.5} step={0.1} onChange={set('sensitivity')} fmt={(v) => `${v.toFixed(1)}×`} />
                <Toggle label="Invert look Y" value={prefs.invertY} onChange={set('invertY')} />
              </section>
              <section>
                <h3 className="mm-label">Accessibility</h3>
                <Toggle label="Reduced motion" hint="No camera shake, flashes, sweeps or flicker" value={prefs.reducedMotion} onChange={set('reducedMotion')} />
                <label className="mms-row">
                  <span className="mms-row-label">Colour-blind friendly colours</span>
                  <select className="mm-input mms-select" value={prefs.colorblind} onChange={(e) => set('colorblind')(e.target.value as Prefs['colorblind'])}>
                    <option value="none">Off</option>
                    <option value="protan">Protanopia</option>
                    <option value="deutan">Deuteranopia</option>
                    <option value="tritan">Tritanopia</option>
                  </select>
                </label>
                <Slider label="Text size" value={prefs.textScale} min={0.85} max={1.4} step={0.05} onChange={set('textScale')} fmt={(v) => `${Math.round(v * 100)}%`} />
                <Toggle label="Lights Out high-visibility assist" hint="Lifts the darkness a little" value={prefs.highVisibility} onChange={set('highVisibility')} />
                <Toggle label="Chat profanity filter" value={prefs.profanityFilter} onChange={set('profanityFilter')} />
              </section>
            </div>
          )}
          {tab === 'controls' && (
            <>
              <h3 className="mm-label">Keys (click to rebind)</h3>
              <div className="mms-keys">
                {(Object.keys(DEFAULT_KEYS) as (keyof Keybinds)[]).map((k) => (
                  <button key={k} className="mms-key" data-wait={rebind === k} onClick={() => setRebind(k)}>
                    <span>{k}</span>
                    <kbd className="mm-kbd inline">{rebind === k ? 'press…' : keyLabel(prefs.keys[k])}</kbd>
                  </button>
                ))}
              </div>
              <div className="mms-ref">
                <div>
                  <b>Touch</b> — left thumb joystick · drag right side to look (3D) · big button = context action
                </div>
                <div>
                  <b>Controller</b> — A use · B report · X kill · Y vent · RB sabotage · LB map · LT flashlight · RT shoot
                </div>
              </div>
            </>
          )}
          {tab === 'match' && (
            <div className="mms-match">
              {inMatch ? (
                <>
                  <div className="mms-matchinfo">
                    <span className="mm-label">Room</span> <b>{inMatch.code}</b> · {inMatch.mode} · {inMatch.map}
                  </div>
                  {inMatch.extra}
                  {inMatch.onResume && (
                    <button className="mm-btn mm-btn-primary mm-pill mms-big" onClick={inMatch.onResume}>
                      <MIcon name="play" /> Resume
                    </button>
                  )}
                  <button className="mm-btn mms-big mms-leave" onClick={inMatch.onLeave}>
                    <MIcon name="door2" /> Leave game
                  </button>
                </>
              ) : (
                <>
                  <div className="mm-muted">Not in a room. Match options appear here while you play.</div>
                  <h3 className="mm-label" style={{ marginTop: 12 }}>
                    Server
                  </h3>
                  <input className="mm-input" placeholder="Auto (this host)  ·  ws://192.168.1.20:8787/mystery" value={prefs.serverUrl} onChange={(e) => set('serverUrl')(e.target.value.trim())} aria-label="Server URL" />
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mms-foot">
        <span className="mms-ver">Marion Mystery · build 1.0</span>
        <button className="mm-btn" onClick={defaults} disabled={tab === 'match' && !!inMatch}>
          Defaults
        </button>
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const setScreen = useMystery((s) => s.setScreen);
  return (
    <Modal title="Settings" onClose={() => setScreen('title')} wide>
      <SettingsMenu />
    </Modal>
  );
}

export function ProfileScreen() {
  const prefs = useMystery((s) => s.prefs);
  const setScreen = useMystery((s) => s.setScreen);
  const st = prefs.stats;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const tc = teamColors(prefs.colorblind !== 'none');
  return (
    <Modal title={`${prefs.name || 'Berry'}’s stats`} onClose={() => setScreen('title')} wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          ['Games', st.games],
          ['Wins', `${st.wins} (${pct(st.wins, st.games)})`],
          ['MVPs', st.mvps],
          ['Tasks done', st.tasks],
          ['Kills', st.kills],
          ['Survived', pct(st.survived, st.games)],
        ].map(([k, v]) => (
          <div key={k as string} className="mm-panel-solid" style={{ padding: 14 }}>
            <div className="mm-muted" style={{ fontSize: '0.75em', fontWeight: 700, letterSpacing: '0.06em' }}>
              {String(k).toUpperCase()}
            </div>
            <div style={{ fontSize: '1.6em', fontWeight: 900 }}>{v}</div>
          </div>
        ))}
      </div>
      <h3 className="mm-muted" style={{ fontSize: '0.8em', letterSpacing: '0.08em' }}>
        BY ROLE
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        {(Object.keys(ROLES) as RoleId[])
          .filter((r) => st.byRole[r])
          .map((r) => (
            <div key={r} className="mm-panel-solid" style={{ padding: 10, display: 'flex', justifyContent: 'space-between', borderColor: tc[ROLES[r].team] + '55' }}>
              <span style={{ color: tc[ROLES[r].team], fontWeight: 700 }}>{ROLES[r].name}</span>
              <span className="mm-muted">
                {st.byRole[r]!.wins}/{st.byRole[r]!.games} won
              </span>
            </div>
          ))}
        {Object.keys(st.byRole).length === 0 && <div className="mm-muted">Play a match to start tracking.</div>}
      </div>
      <h3 className="mm-muted" style={{ fontSize: '0.8em', letterSpacing: '0.08em', marginTop: 14 }}>
        BY MODE
      </h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {MODE_LIST.map((m) => (
          <span key={m.id} className="mm-chip">
            {m.name}: {st.byMode[m.id]?.wins ?? 0}/{st.byMode[m.id]?.games ?? 0}
          </span>
        ))}
      </div>
    </Modal>
  );
}

export function HowToScreen() {
  const setScreen = useMystery((s) => s.setScreen);
  const cb = useMystery((s) => s.prefs.colorblind !== 'none');
  const tc = teamColors(cb);
  const [tab, setTab] = useState<'modes' | 'roles' | 'controls'>('modes');
  return (
    <Modal title="How to play" onClose={() => setScreen('title')} wide>
      <div className="mms-tabs" role="tablist" aria-label="How to play sections" style={{ marginBottom: 14 }}>
        {(['modes', 'roles', 'controls'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="mms-tab" onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'modes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {MODE_LIST.map((m) => (
            <div key={m.id} className="mm-panel-solid" style={{ padding: 16, background: `linear-gradient(90deg, ${m.colors[1]} 0 5px, var(--mm-panel-solid) 5px)` }}>
              <div style={{ fontWeight: 900, fontSize: '1.2em' }}>{m.name}</div>
              <div style={{ color: m.colors[1], fontWeight: 700, marginBottom: 8 }}>{m.tagline}</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {m.howTo.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {tab === 'roles' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {(Object.keys(ROLES) as RoleId[]).map((r) => {
            const d = ROLES[r];
            return (
              <div key={r} className="mm-panel-solid" style={{ padding: 14, borderColor: tc[d.team] + '66' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ color: d.color }}>{d.name}</b>
                  <span className="mm-chip" style={{ color: tc[d.team] }}>
                    {d.team}
                  </span>
                </div>
                <div style={{ margin: '6px 0', fontSize: '0.92em' }}>{d.help}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {d.abilities.map((a) => (
                    <span key={a} className="mm-chip">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'controls' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {[
            ['Keyboard & mouse', ['WASD / arrows — move', 'Mouse — look (3D, click to lock)', 'E or Space — use / task', 'Q — kill / tag', 'R — report', 'V — vent', 'X — sabotage map', 'Tab — map', 'F — flashlight', 'Enter — chat (meetings)', '1–4 — emotes']],
            ['Touch (iPhone)', ['Left thumb — joystick', 'Right side drag — look (3D)', 'Big buttons — context actions', 'Tap the map icon for the map', 'Pinch disabled — no accidental zoom']],
            ['Controller', ['Left stick — move', 'Right stick — look', 'A — use', 'B — report', 'X — kill', 'Y — vent', 'RB — sabotage · LB — map', 'LT — flashlight · RT — shoot']],
          ].map(([t, items]) => (
            <div key={t as string} className="mm-panel-solid" style={{ padding: 14 }}>
              <b>{t}</b>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {(items as string[]).map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
