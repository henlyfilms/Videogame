/**
 * Front-end menus: title, join (big keypad + paste), room browser, settings,
 * profile/stats and how-to-play. Rendered over either the 2D or the 3D
 * backdrop depending on the player's view preference.
 */
import { useEffect, useMemo, useState } from 'react';
import { MODE_LIST } from '../core/modes';
import { ROLES } from '../core/roles';
import { CODE_ALPHABET, CODE_LENGTH, normalizeCode } from '../net/protocol';
import type { RoleId, ViewMode } from '../core/types';
import { DEFAULT_KEYS, type Keybinds, type Prefs } from '../client/prefs';
import { useMystery } from '../client/store';
import { availableMaps } from '../core/maps';
import { BerryAvatar, MIcon, Modal, teamColors } from './common';

export function ViewPicker({ value, onChange, compact = false }: { value: ViewMode; onChange(v: ViewMode): void; compact?: boolean }) {
  const opts: { v: ViewMode; label: string; sub: string; icon: string }[] = [
    { v: '3d-tp', label: '3D Third Person', sub: 'Over the shoulder', icon: 'users' },
    { v: '3d-fp', label: '3D First Person', sub: 'Through their eyes', icon: 'eye' },
    { v: '2d', label: '2D Simplified', sub: 'Top-down & light', icon: 'map' },
  ];
  return (
    <div role="radiogroup" aria-label="View mode" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
      {opts.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          className="mm-btn"
          onClick={() => onChange(o.v)}
          style={{
            flexDirection: 'column',
            padding: compact ? '8px 6px' : '12px 8px',
            gap: 4,
            borderColor: value === o.v ? 'var(--mm-accent2)' : undefined,
            background: value === o.v ? 'rgba(47,111,237,0.25)' : undefined,
            boxShadow: value === o.v ? '0 0 0 1px var(--mm-accent2), 0 0 24px rgba(47,111,237,0.35)' : undefined,
          }}
        >
          <MIcon name={o.icon} size={compact ? 18 : 22} />
          <span style={{ fontSize: compact ? '0.78em' : '0.86em' }}>{o.label}</span>
          {!compact && <span className="mm-muted" style={{ fontSize: '0.72em', fontWeight: 500 }}>{o.sub}</span>}
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
    <div className="mm-safe" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto' }}>
      <div style={{ width: 'min(980px, 100%)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, alignItems: 'center' }}>
        <div className="mm-anim-rise" style={{ textAlign: 'center' }}>
          <div className="mm-chip" style={{ marginBottom: 10 }}>
            <MIcon name="berry" size={14} /> Marion HQ Arcade
          </div>
          <h1 className="mm-title" style={{ fontSize: 'clamp(44px, 9vw, 84px)', lineHeight: 0.92, margin: '6px 0 10px' }}>
            Marion
            <br />
            Mystery
          </h1>
          <p className="mm-muted" style={{ margin: '0 auto 16px', maxWidth: 360 }}>
            Tasks, sabotage, flashlights and one very suspicious berry. 4–20 players, humans and Marion agents.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', animation: 'mm-float 3.2s ease-in-out infinite' }}>
            <BerryAvatar cosmetics={prefs.cosmetics} size={150} />
          </div>
          <button className="mm-btn" style={{ marginTop: 6 }} onClick={() => setScreen('wardrobe')}>
            <MIcon name="shirt" /> Customize
          </button>
        </div>
        <div className="mm-panel mm-anim-rise" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, animationDelay: '80ms' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="mm-muted" style={{ fontSize: '0.8em', fontWeight: 700, letterSpacing: '0.06em' }}>
              YOUR NAME
            </span>
            <input className="mm-input" value={name} maxLength={16} placeholder="Berry" onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && commitName()} aria-label="Your name" />
          </label>
          <div>
            <div className="mm-muted" style={{ fontSize: '0.8em', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 6 }}>
              VIEW (CHOOSE BEFORE THE MATCH)
            </div>
            <ViewPicker value={prefs.view} onChange={(v) => setPrefs({ view: v })} />
          </div>
          <button
            className="mm-btn mm-btn-primary"
            style={{ minHeight: 56, fontSize: '1.05em' }}
            onClick={() => {
              commitName();
              startSolo();
            }}
          >
            <MIcon name="play" /> Quick Play vs Marion Bots
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
            <button className="mm-btn" onClick={() => setScreen('browse')}>
              <MIcon name="globe" /> Browse Rooms
            </button>
            <button className="mm-btn" onClick={() => setScreen('howto')}>
              <MIcon name="help" /> How to Play
            </button>
            <button className="mm-btn" onClick={() => setScreen('profile')}>
              <MIcon name="stats" /> Stats
            </button>
            <button className="mm-btn" onClick={() => setScreen('settings')}>
              <MIcon name="gear" /> Settings
            </button>
          </div>
          {conn === 'reconnecting' && <div className="mm-chip" style={{ color: 'var(--mm-gold)' }}>Connecting to the game server…</div>}
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
    <div className="mm-safe" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="mm-panel mm-anim-pop" style={{ padding: 18, width: 'min(520px, 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button className="mm-btn" aria-label="Back" onClick={() => setScreen('title')} style={{ padding: 8 }}>
            <MIcon name="back" />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.3em', fontWeight: 850 }}>Join a room</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '8px 0 14px' }} aria-label="Room code" aria-live="polite">
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <div
              key={i}
              style={{
                width: 'clamp(40px, 12vw, 56px)',
                height: 'clamp(52px, 15vw, 68px)',
                borderRadius: 14,
                border: `2px solid ${i === code.length ? 'var(--mm-accent2)' : 'var(--mm-line)'}`,
                background: 'rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'clamp(24px, 7vw, 34px)',
                fontWeight: 900,
                fontFamily: 'ui-monospace, Menlo, monospace',
              }}
            >
              {code[i] ?? ''}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6 }}>
          {keys.map((k) => (
            <button key={k} className="mm-btn" style={{ minHeight: 46, padding: 0, fontSize: '1.05em', fontFamily: 'ui-monospace, Menlo, monospace' }} onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <button className="mm-btn" style={{ minHeight: 46, padding: 0, gridColumn: 'span 2' }} onClick={() => setCode((c) => c.slice(0, -1))} aria-label="Delete">
            ⌫
          </button>
          <button className="mm-btn" style={{ minHeight: 46, padding: 0, gridColumn: 'span 2' }} onClick={() => setCode('')}>
            Clear
          </button>
        </div>
        {error && (
          <div role="alert" style={{ color: 'var(--mm-red)', marginTop: 10, textAlign: 'center' }}>
            {error}
          </div>
        )}
        <button className="mm-btn mm-btn-primary" style={{ width: '100%', marginTop: 14, minHeight: 52 }} disabled={code.length !== CODE_LENGTH} onClick={() => joinRoom(code)}>
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
    <div className="mm-safe" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="mm-panel mm-anim-pop" style={{ padding: 18, width: 'min(680px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button className="mm-btn" aria-label="Back" onClick={() => setScreen('title')} style={{ padding: 8 }}>
            <MIcon name="back" />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.3em', fontWeight: 850, flex: 1 }}>Public & LAN rooms</h2>
          <span className="mm-chip">
            <MIcon name="wifi" size={14} /> {conn}
          </span>
        </div>
        <div className="mm-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 }}>
          {listing.length === 0 && (
            <div className="mm-muted" style={{ textAlign: 'center', padding: 30 }}>
              No open rooms yet. Create one and share the code!
            </div>
          )}
          {listing.map((r) => (
            <button key={r.code} className="mm-btn" style={{ justifyContent: 'space-between', padding: '12px 14px' }} disabled={r.stage !== 'lobby' || r.players >= r.max} onClick={() => joinRoom(r.code)}>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <b>{r.host}&rsquo;s room</b>
                <span className="mm-muted" style={{ fontSize: '0.8em', fontWeight: 500 }}>
                  {MODE_LIST.find((m) => m.id === r.mode)?.name} · {maps[r.map] ?? r.map} · {r.privacy === 'lan' ? 'LAN' : 'Public'}
                </span>
              </span>
              <span className="mm-chip">
                {r.players}/{r.max} {r.stage !== 'lobby' ? '· playing' : ''}
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
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', cursor: 'pointer' }}>
      <span style={{ flex: 1 }}>
        {label}
        {hint && (
          <span className="mm-muted" style={{ display: 'block', fontSize: '0.78em' }}>
            {hint}
          </span>
        )}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} style={{ width: 22, height: 22, accentColor: '#2f6fed' }} />
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void; fmt?: (v: number) => string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
      <span style={{ flex: 1 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 150, accentColor: '#2f6fed' }} />
      <span className="mm-muted" style={{ width: 44, textAlign: 'right' }}>
        {fmt ? fmt(value) : value}
      </span>
    </label>
  );
}

export function SettingsScreen() {
  const prefs = useMystery((s) => s.prefs);
  const setPrefs = useMystery((s) => s.setPrefs);
  const setScreen = useMystery((s) => s.setScreen);
  const [rebind, setRebind] = useState<keyof Keybinds | null>(null);
  useEffect(() => {
    if (!rebind) return;
    const k = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== 'Escape') setPrefs({ keys: { ...prefs.keys, [rebind]: e.code } });
      setRebind(null);
    };
    window.addEventListener('keydown', k, { once: true });
    return () => window.removeEventListener('keydown', k);
  }, [rebind, prefs.keys, setPrefs]);
  const set = <K extends keyof Prefs>(k: K) => (v: Prefs[K]) => setPrefs({ [k]: v } as Partial<Prefs>);
  return (
    <Modal title="Settings" onClose={() => setScreen('title')} wide>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        <section>
          <h3 className="mm-muted" style={{ fontSize: '0.8em', letterSpacing: '0.08em' }}>
            VIEW & GRAPHICS
          </h3>
          <ViewPicker value={prefs.view} onChange={set('view')} compact />
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
            <span style={{ flex: 1 }}>Quality</span>
            <select className="mm-input" style={{ width: 150 }} value={prefs.quality} onChange={(e) => set('quality')(e.target.value as Prefs['quality'])}>
              <option value="auto">Auto</option>
              <option value="low">Low (battery saver)</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <Slider label="Mouse / touch look sensitivity" value={prefs.sensitivity} min={0.3} max={2.5} step={0.1} onChange={set('sensitivity')} fmt={(v) => `${v.toFixed(1)}×`} />
          <Toggle label="Invert look Y" value={prefs.invertY} onChange={set('invertY')} />
          <h3 className="mm-muted" style={{ fontSize: '0.8em', letterSpacing: '0.08em', marginTop: 14 }}>
            AUDIO
          </h3>
          <Toggle label="Mute everything" value={prefs.muted} onChange={set('muted')} />
          <Slider label="Effects volume" value={prefs.volume} min={0} max={1} step={0.05} onChange={set('volume')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Music & ambience" value={prefs.music} min={0} max={1} step={0.05} onChange={set('music')} fmt={(v) => `${Math.round(v * 100)}%`} />
        </section>
        <section>
          <h3 className="mm-muted" style={{ fontSize: '0.8em', letterSpacing: '0.08em' }}>
            ACCESSIBILITY
          </h3>
          <Toggle label="Reduced motion" hint="No camera shake, flashes or flicker" value={prefs.reducedMotion} onChange={set('reducedMotion')} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
            <span style={{ flex: 1 }}>Colour-blind friendly colours</span>
            <select className="mm-input" style={{ width: 150 }} value={prefs.colorblind} onChange={(e) => set('colorblind')(e.target.value as Prefs['colorblind'])}>
              <option value="none">Off</option>
              <option value="protan">Protanopia</option>
              <option value="deutan">Deuteranopia</option>
              <option value="tritan">Tritanopia</option>
            </select>
          </label>
          <Slider label="Text size" value={prefs.textScale} min={0.85} max={1.4} step={0.05} onChange={set('textScale')} fmt={(v) => `${Math.round(v * 100)}%`} />
          <Toggle label="Captions for sounds" value={prefs.captions} onChange={set('captions')} />
          <Toggle label="Lights Out high-visibility assist" hint="Lifts the darkness a little" value={prefs.highVisibility} onChange={set('highVisibility')} />
          <Toggle label="Chat profanity filter" value={prefs.profanityFilter} onChange={set('profanityFilter')} />
          <h3 className="mm-muted" style={{ fontSize: '0.8em', letterSpacing: '0.08em', marginTop: 14 }}>
            KEYS (CLICK TO REBIND)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(Object.keys(DEFAULT_KEYS) as (keyof Keybinds)[]).map((k) => (
              <button key={k} className="mm-btn" style={{ justifyContent: 'space-between', minHeight: 38, padding: '6px 10px', fontSize: '0.85em' }} onClick={() => setRebind(k)}>
                <span style={{ textTransform: 'capitalize' }}>{k}</span>
                <span className="mm-chip">{rebind === k ? 'press…' : prefs.keys[k].replace('Key', '')}</span>
              </button>
            ))}
          </div>
          <button className="mm-btn" style={{ marginTop: 8 }} onClick={() => setPrefs({ keys: { ...DEFAULT_KEYS } })}>
            Reset keys
          </button>
          <h3 className="mm-muted" style={{ fontSize: '0.8em', letterSpacing: '0.08em', marginTop: 14 }}>
            SERVER
          </h3>
          <input className="mm-input" placeholder="Auto (this host)  ·  ws://192.168.1.20:8787/mystery" value={prefs.serverUrl} onChange={(e) => set('serverUrl')(e.target.value.trim())} aria-label="Server URL" />
        </section>
      </div>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['modes', 'roles', 'controls'] as const).map((t) => (
          <button key={t} className={`mm-btn ${tab === t ? 'mm-btn-primary' : ''}`} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'modes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {MODE_LIST.map((m) => (
            <div key={m.id} className="mm-panel-solid" style={{ padding: 16, background: `linear-gradient(160deg, ${m.colors[0]}55, transparent 60%), var(--mm-panel-solid)` }}>
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
