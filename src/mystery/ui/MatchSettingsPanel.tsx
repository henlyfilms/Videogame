/**
 * Host match settings: game mode, map, view policy, presets (incl. share
 * codes), every rule, and the full role table with live validation.
 * Read-only for non-hosts.
 */
import { useMemo, useState } from 'react';
import { availableMaps, getMap } from '../core/maps';
import { MODE_LIST } from '../core/modes';
import { CONFIGURABLE_ROLES, ROLES } from '../core/roles';
import { decodeSettings, encodeSettings, PRESETS, RANGES, type Settings } from '../core/settings';
import type { ModeId, ViewPolicy } from '../core/types';
import type { RoomInfo } from '../net/protocol';
import { useMystery } from '../client/store';
import { MIcon, teamColors } from './common';
import { SchematicMap } from './kit';

type NumKey = { [K in keyof Settings]: Settings[K] extends number ? K : never }[keyof Settings];
type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const NUM_LABELS: Partial<Record<NumKey, [string, (v: number) => string]>> = {
  maxPlayers: ['Max players', (v) => `${v}`],
  durationMin: ['Match duration', (v) => (v ? `${v} min` : 'Off')],
  playerSpeed: ['Player speed', (v) => `${v}×`],
  crewVision: ['Crew vision', (v) => `${v}×`],
  murdererVision: ['Murderer vision', (v) => `${v}×`],
  lightsVision: ['Vision when lights are out', (v) => `${Math.round(v * 100)}%`],
  killCooldown: ['Kill cooldown', (v) => `${v}s`],
  gunCooldown: ['Gun cooldown', (v) => `${v}s`],
  tasksCommon: ['Common tasks', (v) => `${v}`],
  tasksShort: ['Short tasks', (v) => `${v}`],
  tasksLong: ['Long tasks', (v) => `${v}`],
  emergencyMeetings: ['Emergency meetings each', (v) => `${v}`],
  emergencyCooldown: ['Emergency cooldown', (v) => `${v}s`],
  discussionTime: ['Discussion time', (v) => `${v}s`],
  votingTime: ['Voting time', (v) => `${v}s`],
  criticalTimer: ['Critical sabotage timer', (v) => `${v}s`],
  sabotageCooldown: ['Sabotage cooldown', (v) => `${v}s`],
  flashlightAngle: ['Flashlight beam angle', (v) => `${v}°`],
  flashlightRange: ['Flashlight range', (v) => `${v} m`],
  batterySeconds: ['Battery life', (v) => `${v}s`],
  rechargeRate: ['Recharge rate', (v) => `${Math.round(v * 100)}%/s`],
  batteryPickups: ['Battery pickups', (v) => `${v}`],
  darkVision: ['Murderer dark vision', (v) => `${v} m`],
  blackoutCooldown: ['Blackout cooldown', (v) => `${v}s`],
  hnsSeekers: ['Seekers', (v) => `${v}`],
  hnsHideTime: ['Hide time', (v) => `${v}s`],
  hnsFinal: ['Final countdown', (v) => `${v}s`],
  hnsSeekerBoost: ['Seeker final speed', (v) => `${v}×`],
  hnsTaskBonus: ['Seconds off per task', (v) => `${v}s`],
  bots: ['Fill with Marion bots', (v) => `${v}`],
  poisonDelay: ['Poison delay', (v) => `${v}s`],
  trackerSeconds: ['Tracker duration', (v) => `${v}s`],
  medicVitalsSeconds: ['Medic portable vitals', (v) => `${v}s`],
};

const BOOL_LABELS: Partial<Record<BoolKey, string>> = {
  knifeThrow: 'Murderer can throw the knife',
  gunDrop: 'Gun drops when the Sheriff dies (Hero pickup)',
  visualTasks: 'Visual tasks',
  anonymousVotes: 'Anonymous votes',
  confirmEjects: 'Confirm ejects',
  allowSkip: 'Allow skip vote',
  sabLights: 'Sabotage: Lights',
  sabComms: 'Sabotage: Comms',
  sabDoors: 'Sabotage: Doors',
  sabMeltdown: 'Sabotage: Critical A',
  sabPressure: 'Sabotage: Critical B',
  killFlicker: 'Flicker warning when someone dies nearby',
  ghostTasks: 'Ghosts finish tasks',
  ghostChat: 'Ghost chat',
  chat: 'Text chat',
  quickChat: 'Quick chat',
  proximityChat: 'Proximity chat during play',
  accompliceKnows: 'Accomplice knows the murderers',
  mayorReveal: 'Mayor can reveal for +1 vote',
  ghostsSeeRoles: 'Ghosts see everyone’s role',
};

const GROUPS: { title: string; nums: NumKey[]; bools: BoolKey[]; enums?: (keyof Settings)[]; when?: (s: Settings) => boolean }[] = [
  { title: 'Match', nums: ['maxPlayers', 'durationMin', 'bots'], bools: [], enums: ['timerOutcome', 'botDifficulty', 'privacy'] },
  { title: 'Movement & vision', nums: ['playerSpeed', 'crewVision', 'murdererVision', 'lightsVision'], bools: [] },
  { title: 'Weapons', nums: ['killCooldown', 'gunCooldown'], bools: ['knifeThrow', 'gunDrop'], enums: ['killDistance', 'misfire'] },
  { title: 'Tasks', nums: ['tasksCommon', 'tasksShort', 'tasksLong'], bools: ['visualTasks'], enums: ['taskBar'] },
  { title: 'Meetings', nums: ['emergencyMeetings', 'emergencyCooldown', 'discussionTime', 'votingTime'], bools: ['anonymousVotes', 'confirmEjects', 'allowSkip'], when: (s) => s.mode !== 'hideseek' },
  { title: 'Sabotage', nums: ['criticalTimer', 'sabotageCooldown'], bools: ['sabLights', 'sabComms', 'sabDoors', 'sabMeltdown', 'sabPressure'], when: (s) => s.mode !== 'hideseek' },
  { title: 'Lights Out', nums: ['flashlightAngle', 'flashlightRange', 'batterySeconds', 'rechargeRate', 'batteryPickups', 'darkVision', 'blackoutCooldown'], bools: ['killFlicker'], when: (s) => s.mode === 'lightsout' },
  { title: 'Hide & Seek', nums: ['hnsSeekers', 'hnsHideTime', 'hnsFinal', 'hnsSeekerBoost', 'hnsTaskBonus'], bools: [], when: (s) => s.mode === 'hideseek' },
  { title: 'Ghosts & chat', nums: [], bools: ['ghostTasks', 'ghostChat', 'chat', 'quickChat', 'proximityChat', 'ghostsSeeRoles'] },
  { title: 'Role rules', nums: ['poisonDelay', 'trackerSeconds', 'medicVitalsSeconds'], bools: ['accompliceKnows', 'mayorReveal'], enums: ['detectiveClue'], when: (s) => s.mode !== 'hideseek' },
];

const ENUM_OPTS: Partial<Record<keyof Settings, [string, string][]>> = {
  timerOutcome: [
    ['murderers', 'Timer: murderers win'],
    ['crew', 'Timer: crew wins'],
    ['draw', 'Timer: draw'],
  ],
  botDifficulty: [
    ['easy', 'Bots: Easy'],
    ['normal', 'Bots: Normal'],
    ['sharp', 'Bots: Sharp'],
  ],
  privacy: [
    ['code', 'Private (code only)'],
    ['public', 'Public'],
    ['lan', 'LAN listing'],
  ],
  killDistance: [
    ['short', 'Kill distance: short'],
    ['medium', 'Kill distance: medium'],
    ['long', 'Kill distance: long'],
  ],
  misfire: [
    ['sheriffDies', 'Misfire: Sheriff dies'],
    ['bothDie', 'Misfire: both die'],
    ['loseGun', 'Misfire: Sheriff loses gun'],
  ],
  taskBar: [
    ['live', 'Task bar: live'],
    ['meetings', 'Task bar: at meetings'],
    ['never', 'Task bar: hidden'],
  ],
  detectiveClue: [
    ['berry', 'Detective clue: berry type'],
    ['color', 'Detective clue: colour family'],
  ],
};

export function MatchSettingsPanel({ room, isHost }: { room: RoomInfo; isHost: boolean }) {
  const send = useMystery((s) => s.send);
  const toast = useMystery((s) => s.toast);
  const cb = useMystery((s) => s.prefs.colorblind !== 'none');
  const tc = teamColors(cb);
  const s = room.settings;
  const [tab, setTab] = useState<'game' | 'roles' | 'rules'>('game');
  const [codeIn, setCodeIn] = useState('');
  const maps = useMemo(() => availableMaps(), []);
  const patch = (p: Partial<Settings>) => isHost && send({ t: 'host.settings', settings: p });
  const disabled = !isHost;
  return (
    <div>
      {!isHost && (
        <div style={{ marginBottom: 8 }}>
          <span className="mm-chip">Only the host can change settings</span>
        </div>
      )}
      <div className="mms-tabs" role="tablist" aria-label="Match settings sections" style={{ marginBottom: 12 }}>
        {(['game', 'roles', 'rules'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="mms-tab" onClick={() => setTab(t)}>
            {t === 'game' ? 'Mode & map' : t}
          </button>
        ))}
      </div>
      {tab === 'game' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <section>
            <h4 className="mm-muted" style={{ margin: '0 0 6px', fontSize: '0.78em', letterSpacing: '0.08em' }}>
              GAME MODE
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              {MODE_LIST.map((m) => (
                <button
                  key={m.id}
                  disabled={disabled}
                  className="mm-btn"
                  onClick={() => {
                    const preset = PRESETS.find((p) => p.id === (m.id as string));
                    patch(preset ? preset.apply(s) : { mode: m.id as ModeId });
                  }}
                  style={{
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    padding: 12,
                    minHeight: 86,
                    background: `linear-gradient(90deg, ${m.colors[1]} 0 6px, ${s.mode === m.id ? '#1f1c0b' : '#0b0d10'} 6px)`,
                    borderColor: s.mode === m.id ? 'var(--mm-yellow)' : undefined,
                    boxShadow: s.mode === m.id ? '0 0 0 1px var(--mm-yellow)' : undefined,
                    paddingLeft: 18,
                    opacity: 1,
                  }}
                >
                  <b style={{ fontSize: '1.05em' }}>{m.name}</b>
                  <span className="mm-muted" style={{ fontWeight: 500, fontSize: '0.82em' }}>
                    {m.tagline}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4 className="mm-muted" style={{ margin: '0 0 6px', fontSize: '0.78em', letterSpacing: '0.08em' }}>
              MAP
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
              {maps.map((m) => (
                <button key={m.id} disabled={disabled} className="mm-btn" onClick={() => patch({ map: m.id as Settings['map'] })} style={{ flexDirection: 'column', padding: 8, alignItems: 'stretch', borderColor: s.map === m.id ? 'var(--mm-accent2)' : undefined, boxShadow: s.map === m.id ? '0 0 0 1px var(--mm-accent2)' : undefined, opacity: 1 }}>
                  <span style={{ display: 'flex', justifyContent: 'center', background: '#0a0d11', borderRadius: 6 }}>
                    <SchematicMap map={getMap(m.id as Settings['map'])} width={180} height={84} theme={s.mode === 'lightsout' ? 'night' : 'crew'} />
                  </span>
                  <b style={{ marginTop: 6 }}>{m.name}</b>
                  <span className="mm-muted" style={{ fontSize: '0.76em', fontWeight: 500 }}>
                    {m.rooms.length} rooms · {m.tagline}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4 className="mm-muted" style={{ margin: '0 0 6px', fontSize: '0.78em', letterSpacing: '0.08em' }}>
              VIEW (LOCKED WHEN THE MATCH STARTS)
            </h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(
                [
                  ['choice', 'Player’s choice'],
                  ['3d-tp', 'Everyone 3D third person'],
                  ['3d-fp', 'Everyone 3D first person'],
                  ['2d', 'Everyone 2D'],
                ] as [ViewPolicy, string][]
              ).map(([v, l]) => (
                <button key={v} disabled={disabled} className={`mm-btn ${s.view === v ? 'mm-btn-primary' : ''}`} onClick={() => patch({ view: v })} style={{ minHeight: 40, opacity: 1 }}>
                  {l}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4 className="mm-muted" style={{ margin: '0 0 6px', fontSize: '0.78em', letterSpacing: '0.08em' }}>
              PRESETS
            </h4>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PRESETS.map((p) => (
                <button key={p.id} disabled={disabled} className="mm-btn" title={p.blurb} onClick={() => patch(p.apply(s))} style={{ minHeight: 40 }}>
                  {p.name}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                className="mm-btn"
                onClick={() => {
                  const code = encodeSettings(s);
                  void navigator.clipboard?.writeText(code).then(
                    () => toast('Settings code copied', 'good'),
                    () => toast('Copy failed', 'bad'),
                  );
                  try {
                    localStorage.setItem('marion-mystery:custom-preset', code);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <MIcon name="copy" size={16} /> Share settings
              </button>
              {isHost && (
                <>
                  <input className="mm-input" placeholder="Paste settings code" value={codeIn} onChange={(e) => setCodeIn(e.target.value.trim())} style={{ minHeight: 40 }} />
                  <button
                    className="mm-btn"
                    onClick={() => {
                      const saved = codeIn || (() => {
                        try {
                          return localStorage.getItem('marion-mystery:custom-preset') ?? '';
                        } catch {
                          return '';
                        }
                      })();
                      const dec = decodeSettings(saved);
                      if (dec) {
                        patch(dec);
                        toast('Settings loaded', 'good');
                      } else toast('That code didn’t work', 'bad');
                    }}
                  >
                    Load
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
      {tab === 'roles' && (
        <div>
          {s.mode === 'hideseek' ? (
            <div className="mm-muted">Hide & Seek uses Seekers and Hiders — set the seeker count under Rules.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
              {CONFIGURABLE_ROLES.map((r) => {
                const d = ROLES[r];
                const slot = s.roles[r];
                const set = (count: number, chance = slot.chance) => patch({ roles: { ...s.roles, [r]: { count: Math.max(0, Math.min(10, count)), chance } } });
                return (
                  <div key={r} className="mm-panel-solid" style={{ padding: 10, borderColor: tc[d.team] + '55' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b style={{ color: d.color, flex: 1 }}>{d.name}</b>
                      <button className="mm-btn" disabled={disabled || slot.count <= 0} style={{ minHeight: 34, padding: '2px 12px' }} onClick={() => set(slot.count - 1)} aria-label={`Fewer ${d.name}`}>
                        −
                      </button>
                      <b style={{ width: 22, textAlign: 'center' }}>{slot.count}</b>
                      <button className="mm-btn" disabled={disabled} style={{ minHeight: 34, padding: '2px 12px' }} onClick={() => set(slot.count + 1)} aria-label={`More ${d.name}`}>
                        +
                      </button>
                    </div>
                    <div className="mm-muted" style={{ fontSize: '0.78em', margin: '4px 0' }}>
                      {d.blurb}
                    </div>
                    {slot.count > 0 && r !== 'murderer' && r !== 'poisoner' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8em' }}>
                        Chance
                        <input type="range" min={0} max={100} step={10} disabled={disabled} value={slot.chance} onChange={(e) => set(slot.count, Number(e.target.value))} style={{ flex: 1, accentColor: d.color }} />
                        {slot.chance}%
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {tab === 'rules' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
          {GROUPS.filter((g) => !g.when || g.when(s)).map((g) => (
            <section key={g.title} className="mm-panel-solid" style={{ padding: 12 }}>
              <h4 style={{ margin: '0 0 6px' }}>{g.title}</h4>
              {g.nums.map((k) => {
                const range = RANGES[k];
                const lbl = NUM_LABELS[k];
                if (!range || !lbl) return null;
                return (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.9em' }}>
                    <span style={{ flex: 1 }}>{lbl[0]}</span>
                    <input type="range" min={range[0]} max={range[1]} step={range[2]} value={s[k] as number} disabled={disabled} onChange={(e) => patch({ [k]: Number(e.target.value) } as Partial<Settings>)} style={{ width: 110, accentColor: 'var(--mm-yellow)' }} />
                    <span className="mm-muted" style={{ width: 56, textAlign: 'right' }}>
                      {lbl[1](s[k] as number)}
                    </span>
                  </label>
                );
              })}
              {g.enums?.map((k) => (
                <select key={k} className="mm-input" disabled={disabled} value={String(s[k])} onChange={(e) => patch({ [k]: e.target.value } as Partial<Settings>)} style={{ marginTop: 6, minHeight: 38 }}>
                  {ENUM_OPTS[k]?.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ))}
              {g.bools.map((k) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: '0.9em', cursor: disabled ? 'default' : 'pointer' }}>
                  <span style={{ flex: 1 }}>{BOOL_LABELS[k] ?? k}</span>
                  <input type="checkbox" disabled={disabled} checked={s[k] as boolean} onChange={(e) => patch({ [k]: e.target.checked } as Partial<Settings>)} style={{ width: 20, height: 20, accentColor: 'var(--mm-yellow)' }} />
                </label>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
