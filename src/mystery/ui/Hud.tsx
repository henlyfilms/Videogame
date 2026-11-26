/**
 * In-match HUD: role-aware action buttons, task list + crew bar, role-filtered
 * stats, timer, sabotage alarms, minimap / sabotage map, security consoles,
 * vent navigation, Lights Out battery + dread, Hide & Seek danger meter.
 */
import { useEffect, useMemo, useState } from 'react';
import { getMap } from '../core/maps';
import { MODES } from '../core/modes';
import type { Snapshot } from '../core/project';
import { ROLES } from '../core/roles';
import { TASK_BY_ID } from '../core/tasks';
import type { Settings } from '../core/settings';
import type { SabotageId } from '../core/types';
import { bindUi, currentContext, doAction, doUse } from '../client/controls';
import { runtime } from '../client/runtime';
import { isFixStation, useMystery } from '../client/store';
import { Bar, colorHex, fmtTime, MIcon, Modal, teamColors } from './common';
import { MapThumb, type MapMarker } from './MapThumb';
import { TaskModal } from './tasks/TaskModal';
import type { MiniGameKind } from './tasks/types';
import { Joystick, TouchLook, useCoarsePointer } from './TouchControls';

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function ActionButton({ icon, label, onClick, disabled, cd, color = '#6ea1ff', hotkey, ready, big }: { icon: string; label: string; onClick: () => void; disabled?: boolean; cd?: number; color?: string; hotkey?: string; ready?: boolean; big?: boolean }) {
  const cooling = (cd ?? 0) > 0;
  return (
    <button
      className="mm-action"
      data-ready={!disabled && !cooling && ready ? 'true' : 'false'}
      disabled={disabled}
      onClick={onClick}
      style={{ ['--c' as string]: color, ...(big ? { width: 92, height: 92 } : {}) }}
      aria-label={label}
    >
      <MIcon name={icon} size={big ? 34 : 28} />
      <span>{label}</span>
      {hotkey && <span className="mm-key">{hotkey}</span>}
      {cooling && <span className="cd">{Math.ceil(cd!)}</span>}
    </button>
  );
}

const SAB_LABEL: Record<SabotageId, string> = { lights: 'Lights', comms: 'Comms', doors: 'Doors', meltdown: 'Critical A', pressure: 'Critical B' };

export function Hud({ snap, settings }: { snap: Snapshot; settings: Settings }) {
  useTick(120);
  const coarse = useCoarsePointer();
  const prefs = useMystery((s) => s.prefs);
  const act = useMystery((s) => s.act);
  const taskStation = useMystery((s) => s.taskStation);
  const setTask = useMystery((s) => s.setTask);
  const showMap = useMystery((s) => s.showMap);
  const toggleMap = useMystery((s) => s.toggleMap);
  const showStats = useMystery((s) => s.showStats);
  const toggleStats = useMystery((s) => s.toggleStats);
  const room = useMystery((s) => s.room)!;
  const leave = useMystery((s) => s.leave);
  const matchView = useMystery((s) => s.matchView);
  const [sabMap, setSabMap] = useState(false);
  const [menu, setMenu] = useState(false);
  const [holding, setHolding] = useState<string | null>(null);
  const [tasksOpen, setTasksOpen] = useState(() => typeof innerWidth !== 'number' || innerWidth > 640);
  const tc = teamColors(prefs.colorblind !== 'none');
  const map = getMap(snap.map);
  const you = snap.you;
  const role = ROLES[you.role];
  const mode = MODES[snap.mode];
  const ctx = currentContext;

  useEffect(() => {
    bindUi({
      openSabotage: () => ROLES[useMystery.getState().snap?.you.role ?? 'crewmate'].canSabotage && setSabMap((x) => !x),
      openMenu: () => {
        if (useMystery.getState().taskStation) useMystery.getState().setTask(null);
        else setMenu((m) => !m);
      },
      openChat: () => {},
      setHolding: (id) => {
        setHolding((cur) => {
          if (cur && !id) useMystery.getState().act({ a: 'fix', station: cur, on: false });
          return id;
        });
      },
    });
  }, []);
  // Release a critical hold when walking away or when fixed.
  useEffect(() => {
    if (holding && (!snap.sabotage.active || ctx.use?.id !== holding)) {
      act({ a: 'fix', station: holding, on: false });
      setHolding(null);
    }
  });

  const taskDef = (stationId: string) => {
    const t = you.tasks.find((x) => x.stations[x.step] === stationId);
    return t ? { t, def: TASK_BY_ID[t.taskId] } : null;
  };
  const openTask = taskStation ? taskDef(taskStation) : null;
  const station = taskStation ? map.stationById.get(taskStation) : null;

  const critical = snap.sabotage.active === 'meltdown' || snap.sabotage.active === 'pressure';
  const sabActive = snap.sabotage.active;
  const myTasksDone = you.tasks.filter((t) => t.done).length;
  const isGhost = !you.alive;
  const mm = snap.stats.murderers;
  const timeLeft = snap.stats.timeLeft;
  const hideLeft = snap.hns && snap.t < snap.hns.hideUntil ? snap.hns.hideUntil - snap.t : 0;

  // Role ability button.
  let ability: { icon: string; label: string; onClick: () => void; disabled?: boolean; cd?: number; color: string } | null = null;
  const nearestVisible = () => {
    let best: string | null = null;
    let bd = 3;
    for (const p of snap.players) {
      if (p.id === you.id || !p.pos || !p.alive) continue;
      const r = runtime.remote(p.id)?.pos ?? p.pos;
      const d = Math.hypot(r.x - runtime.local.pos.x, r.y - runtime.local.pos.y);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    return best;
  };
  if (you.alive && snap.phase === 'play') {
    if (you.role === 'medic') {
      const t = nearestVisible();
      ability = you.shieldTarget
        ? { icon: 'eye', label: 'Vitals', onClick: () => act({ a: 'vitals' }), disabled: you.roundAbilityUsed || settings.medicVitalsSeconds <= 0, color: '#4ade80' }
        : { icon: 'shield', label: 'Shield', onClick: () => t && act({ a: 'shield', target: t }), disabled: !t, color: '#4ade80' };
    } else if (you.role === 'tracker') {
      const t = nearestVisible();
      ability = { icon: 'arrow', label: 'Track', onClick: () => t && act({ a: 'track', target: t }), disabled: !t, cd: you.abilityCd, color: '#38bdf8' };
    } else if (you.role === 'lookout') ability = { icon: 'eye', label: 'Place cam', onClick: () => act({ a: 'camera' }), disabled: !!you.portableCam, color: '#a78bfa' };
    else if (you.role === 'engineer') ability = { icon: 'wrench', label: 'Remote fix', onClick: () => act({ a: 'remotefix' }), disabled: you.remoteFixUsed || !sabActive || sabActive === 'doors', color: '#fb923c' };
    else if (role.canSabotage && mode.flashlights) ability = { icon: 'flashlight', label: 'Blackout', onClick: () => act({ a: 'blackout' }), cd: you.abilityCd, color: '#a78bfa' };
  }

  const killLabel = you.role === 'poisoner' ? 'Poison' : you.role === 'seeker' ? 'Tag' : ctx.kill || !settings.knifeThrow || you.role !== 'murderer' ? 'Kill' : 'Throw';
  const useLabel = ctx.use?.label ?? 'Use';

  // Minimap markers.
  const markers: MapMarker[] = useMemo(() => {
    const m: MapMarker[] = [{ pos: runtime.local.pos, color: colorHex(snap.players.find((p) => p.id === you.id)?.cosmetics.color ?? 10), kind: 'you' }];
    if (!(snap.sabotage.active === 'comms' && you.team !== 'murderers'))
      for (const t of you.tasks) {
        if (t.done) continue;
        const st = map.stationById.get(t.stations[t.step] ?? '');
        if (st) m.push({ pos: st, color: '#fde047', kind: 'task' });
      }
    if (sabActive && sabActive !== 'doors') {
      const kinds = sabActive === 'lights' ? ['lightsPanel'] : sabActive === 'comms' ? ['commsPanel'] : sabActive === 'meltdown' ? ['meltdownA', 'meltdownB'] : ['pressureA', 'pressureB'];
      for (const s of map.def.stations) if (kinds.includes(s.kind)) m.push({ pos: s, color: '#ff4d5e', kind: 'alert' });
    }
    if (you.trackPos) m.push({ pos: you.trackPos, color: '#38bdf8', kind: 'ping' });
    return m;
  }, [snap, map, you]);

  const sec = snap.security;
  const ventLinks = you.inVent ? map.ventById.get(you.inVent)?.links ?? [] : [];

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {coarse && snap.phase === 'play' && !taskStation && (
        <div style={{ pointerEvents: 'auto' }}>
          <Joystick />
          {matchView !== '2d' && <TouchLook sensitivity={prefs.sensitivity} />}
        </div>
      )}
      {/* Dread vignette (Lights Out) */}
      {you.dread > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle, transparent 45%, rgba(120,0,30,${0.35 * you.dread}) 100%)`,
            animation: prefs.reducedMotion ? undefined : `mm-pulse ${Math.max(0.35, 1.2 - you.dread)}s ease-in-out infinite`,
          }}
        />
      )}
      {/* Top-left: tasks / role panel */}
      <div className="mm-safe" style={{ position: 'absolute', top: 0, left: 0, width: tasksOpen ? 'min(320px, 70vw)' : undefined, pointerEvents: 'auto', zIndex: 10 }}>
        <div className="mm-panel" style={{ padding: 10 }}>
          <button className="mm-btn" style={{ width: '100%', minHeight: 36, padding: '4px 10px', justifyContent: 'space-between', borderColor: tc[role.team] + '88' }} onClick={() => setTasksOpen((x) => !x)} aria-expanded={tasksOpen}>
            <span style={{ color: role.color, fontWeight: 850 }}>
              {isGhost ? '👻 ' : ''}
              {role.name}
              {you.isHero ? ' · Hero' : ''}
            </span>
            <span className="mm-muted" style={{ fontSize: '0.8em' }}>
              {you.team === 'crew' ? `${myTasksDone}/${you.tasks.length} tasks` : you.team === 'murderers' ? 'Fake tasks' : 'Neutral'}
            </span>
          </button>
          {snap.stats.taskBar !== null && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72em', fontWeight: 800, letterSpacing: '0.06em' }} className="mm-muted">
                <span>CREW TASKS</span>
                <span>{Math.round(snap.stats.taskBar * 100)}%</span>
              </div>
              <Bar value={snap.stats.taskBar} color={prefs.colorblind !== 'none' ? '#38bdf8' : undefined} />
            </div>
          )}
          {tasksOpen && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.86em' }}>
              {sabActive === 'comms' && you.team !== 'murderers' ? (
                <div style={{ color: 'var(--mm-red)', fontWeight: 700 }}>Comms sabotaged — tasks hidden</div>
              ) : (
                you.tasks.map((t, i) => {
                  const def = TASK_BY_ID[t.taskId];
                  const room = map.stationById.get(t.stations[Math.min(t.step, t.stations.length - 1)] ?? '')?.room;
                  return (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: t.done ? 0.5 : 1, textDecoration: t.done ? 'line-through' : undefined }}>
                      <span style={{ color: t.done ? tc.good : '#fde047' }}>{t.done ? '✓' : '•'}</span>
                      <span style={{ flex: 1 }}>
                        {def?.name}
                        {t.stations.length > 1 && ` (${t.step}/${t.stations.length})`}
                      </span>
                      <span className="mm-muted" style={{ fontSize: '0.85em' }}>
                        {room ? map.roomById.get(room)?.name.replace(/^.*?'s /, '') : ''}
                      </span>
                    </div>
                  );
                })
              )}
              {you.team === 'murderers' && mm && (
                <div style={{ marginTop: 6, padding: 8, borderRadius: 10, background: 'rgba(255,77,94,0.12)', border: `1px solid ${tc.murderers}44` }}>
                  <div>
                    Crew left: <b>{mm.crewAlive}</b> · Murderers: <b>{mm.murderersAlive}</b>
                  </div>
                  <div className="mm-muted">Kills to win: {mm.killsToWin} · Yours: {mm.myKills}</div>
                  {mm.teammates.length > 0 && (
                    <div className="mm-muted">
                      Team:{' '}
                      {mm.teammates.map((t) => (
                        <span key={t.id} style={{ color: t.alive ? tc.murderers : '#64748b', marginRight: 6 }}>
                          {snap.players.find((p) => p.id === t.id)?.name}
                          {t.alive ? '' : ' ✝'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {snap.stats.neutral && (
                <div style={{ marginTop: 6, padding: 8, borderRadius: 10, background: 'rgba(250,204,21,0.12)' }}>
                  <b>Goal:</b> {snap.stats.neutral.goal}
                  <div className="mm-muted">{snap.stats.neutral.status}</div>
                </div>
              )}
              {you.clues.length > 0 && (
                <div style={{ marginTop: 6, padding: 8, borderRadius: 10, background: 'rgba(45,212,191,0.12)' }}>
                  <b>Clues</b>
                  {you.clues.map((c) => (
                    <div key={c.bodyId} className="mm-muted">
                      {snap.players.find((p) => p.id === c.victimId)?.name}: {c.secondsSinceDeath}s ago · killer {c.hintKind === 'berry' ? 'is a' : 'wears'} <b style={{ color: '#2dd4bf' }}>{c.killerHint}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Top-right: timer, buttons */}
      <div className="mm-safe" style={{ position: 'absolute', top: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'auto', zIndex: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {timeLeft !== null && (
            <span className="mm-chip" style={{ fontSize: '1em', fontWeight: 800, color: timeLeft < 30 ? 'var(--mm-red)' : 'var(--mm-ink)', background: 'rgba(0,0,0,0.45)' }}>
              <MIcon name="timer" size={16} /> {fmtTime(timeLeft)}
            </span>
          )}
          <button className="mm-btn" style={{ padding: 8, minHeight: 44 }} onClick={() => toggleStats()} aria-label="Stats">
            <MIcon name="stats" />
          </button>
          <button className="mm-btn" style={{ padding: 8, minHeight: 44 }} onClick={() => toggleMap()} aria-label="Map">
            <MIcon name="map" />
          </button>
          <button className="mm-btn" style={{ padding: 8, minHeight: 44 }} onClick={() => setMenu(true)} aria-label="Menu">
            <MIcon name="gear" />
          </button>
        </div>
        {mode.flashlights && you.team !== 'murderers' && you.alive && (
          <div className="mm-panel" style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, width: 190 }}>
            <MIcon name="battery" size={18} />
            <div style={{ flex: 1 }}>
              <Bar value={you.battery} color={you.battery < 0.2 ? '#ff4d5e' : '#facc15'} height={8} />
            </div>
            <span style={{ fontSize: '0.75em', fontWeight: 800 }}>{Math.round(you.battery * 100)}%</span>
          </div>
        )}
        {snap.stats.hns && (
          <div className="mm-panel" style={{ padding: '8px 12px', width: 210 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
              <span>Hiders left</span>
              <span>{snap.stats.hns.hidersLeft}</span>
            </div>
            {you.role === 'hider' && you.alive && (
              <>
                <div className="mm-muted" style={{ fontSize: '0.72em', fontWeight: 800, marginTop: 4 }}>
                  DANGER
                </div>
                <Bar value={snap.stats.hns.danger} color={`hsl(${120 - snap.stats.hns.danger * 120}, 90%, 55%)`} />
              </>
            )}
            {snap.stats.hns.final && <div style={{ color: 'var(--mm-red)', fontWeight: 900, marginTop: 4, animation: 'mm-pulse 0.8s infinite' }}>FINAL COUNTDOWN</div>}
          </div>
        )}
      </div>

      {/* Center banners */}
      <div style={{ position: 'absolute', top: typeof innerWidth === 'number' && innerWidth < 700 ? 'max(170px, 22vh)' : 'max(70px, 10vh)', left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 10, pointerEvents: 'none' }}>
        {sabActive && sabActive !== 'doors' && (
          <div className="mm-panel mm-anim-pop" role="alert" style={{ padding: '8px 16px', borderColor: '#ff4d5e', background: critical ? 'rgba(127,29,29,0.85)' : 'rgba(60,20,20,0.8)', textAlign: 'center', animation: critical && !prefs.reducedMotion ? 'mm-pulse 1s infinite' : undefined }}>
            <b>
              ⚠ {sabActive === 'lights' ? 'Lights out! Fix the breaker' : sabActive === 'comms' ? 'Comms down! Fix the comms panel' : `${sabActive === 'meltdown' ? map.def.criticalNames.meltdown : map.def.criticalNames.pressure}!`}
            </b>
            {critical && (
              <div style={{ fontSize: '1.4em', fontWeight: 900 }}>
                {fmtTime(snap.sabotage.timer)} · {Math.round(snap.sabotage.progress * 2)}/2 holding
              </div>
            )}
          </div>
        )}
        {hideLeft > 0 && (
          <div className="mm-panel mm-anim-pop" style={{ padding: '10px 18px', textAlign: 'center' }}>
            <b>{you.role === 'seeker' ? 'Counting… let them hide' : 'Hide!'}</b>
            <div style={{ fontSize: '2em', fontWeight: 900 }}>{Math.ceil(hideLeft)}</div>
          </div>
        )}
        {isGhost && snap.phase === 'play' && (
          <div className="mm-chip" style={{ background: 'rgba(0,0,0,0.55)', color: '#c7d2fe' }}>
            👻 You’re a ghost{settings.ghostTasks && you.team === 'crew' ? ' — finish your tasks to help the crew!' : ''}
          </div>
        )}
        {holding && (
          <div className="mm-chip" style={{ background: 'rgba(0,0,0,0.55)', color: '#fca5a5' }}>
            Holding… {snap.sabotage.progress >= 1 ? 'fixing!' : 'waiting for a partner at the other station'}
          </div>
        )}
        {you.inVent && (
          <div className="mm-panel mm-anim-pop" style={{ padding: 10, display: 'flex', gap: 8, pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ alignSelf: 'center', fontWeight: 800 }}>In the vents:</span>
            {ventLinks.map((v) => {
              const vv = map.ventById.get(v)!;
              const rn = map.def.rooms.find((r) => vv.x >= r.rect[0] && vv.x <= r.rect[0] + r.rect[2] && vv.y >= r.rect[1] && vv.y <= r.rect[1] + r.rect[3])?.name ?? 'Hall';
              return (
                <button key={v} className="mm-btn" onClick={() => act({ a: 'vent.move', vent: v })}>
                  <MIcon name="arrow" size={16} /> {rn.replace(/^.*?'s /, '')}
                </button>
              );
            })}
            <button className="mm-btn mm-btn-primary" onClick={() => act({ a: 'vent.exit' })}>
              Climb out
            </button>
          </div>
        )}
      </div>

      {/* Security console overlay */}
      {sec && you.using && (
        <div className="mm-safe" style={{ position: 'absolute', left: 0, right: 0, bottom: coarse ? 190 : 110, display: 'flex', justifyContent: 'center', pointerEvents: 'auto', zIndex: 10 }}>
          <div className="mm-panel mm-anim-rise" style={{ padding: 12, maxWidth: 'min(720px, 96vw)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <b style={{ flex: 1 }}>{you.using === 'admin' ? 'Admin map' : you.using === 'vitals' ? 'Vitals' : you.using === 'doorlog' ? 'Door log' : 'Security cameras (live)'}</b>
              <button className="mm-btn" style={{ minHeight: 36 }} onClick={() => act({ a: 'use', facility: null })}>
                Close
              </button>
            </div>
            {sec.admin && <MapThumb map={map} height={200} labels rooms={Object.fromEntries(sec.admin.filter((a) => a.count).map((a) => [a.room, String(a.count)]))} />}
            {sec.vitals && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
                {sec.vitals.map((v) => {
                  const p = snap.players.find((x) => x.id === v.id);
                  return (
                    <div key={v.id} className="mm-chip" style={{ justifyContent: 'space-between', color: v.alive ? tc.good : tc.bad }}>
                      <span style={{ color: colorHex(p?.cosmetics.color ?? 0) }}>●</span> {p?.name} {v.alive ? '♥' : '✝'}
                    </div>
                  );
                })}
              </div>
            )}
            {sec.doorlog && (
              <div className="mm-scroll" style={{ maxHeight: 180, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.85em' }}>
                {sec.doorlog
                  .slice()
                  .reverse()
                  .map((d, i) => {
                    const p = snap.players.find((x) => x.id === d.playerId);
                    return (
                      <div key={i}>
                        {fmtTime(d.t)} <span style={{ color: colorHex(p?.cosmetics.color ?? 0) }}>■ {prefs.colorblind !== 'none' ? p?.name : `${p?.cosmetics.berry}`}</span> passed {map.def.sensors.find((s) => s.id === d.sensor)?.name}
                      </div>
                    );
                  })}
                {sec.doorlog.length === 0 && <div className="mm-muted">No one has passed a sensor yet.</div>}
              </div>
            )}
            {sec.cams && <div className="mm-muted">You can see everything the cameras see while you stay here.</div>}
          </div>
        </div>
      )}

      {/* Bottom-right: action buttons */}
      {snap.phase === 'play' && !taskStation && (
        <div className="mm-safe" style={{ position: 'absolute', right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, pointerEvents: 'auto', zIndex: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 380 }}>
            {ability && <ActionButton {...ability} />}
            {mode.flashlights && you.team !== 'murderers' && you.alive && <ActionButton icon="flashlight" label={you.flashlightOn ? 'Light off' : 'Light on'} onClick={() => doAction('flashlight')} color="#facc15" hotkey="F" />}
            {role.canSabotage && mode.sabotage && <ActionButton icon="bolt" label="Sabotage" onClick={() => setSabMap(true)} color="#ff4d5e" hotkey="X" cd={snap.sabotage.cooldown} />}
            {(role.canVent && (you.role !== 'hider' || you.ventUses > 0)) && you.alive && <ActionButton icon="vent" label={you.inVent ? 'Exit' : 'Vent'} onClick={() => doAction('vent')} disabled={!ctx.vent && !you.inVent} cd={you.inVent ? 0 : you.ventCd} color="#94a3b8" hotkey="V" ready={!!ctx.vent} />}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            {you.hasGun && you.alive && <ActionButton icon="gun" label="Shoot" onClick={() => doAction('shoot')} disabled={!ctx.shoot} cd={you.gunCd} color="#fbbf24" ready={!!ctx.shoot} />}
            {role.canKill && you.alive && <ActionButton icon={you.role === 'poisoner' ? 'vial' : 'knife'} label={killLabel} onClick={() => doAction('kill')} disabled={!ctx.kill && !(you.role === 'murderer' && settings.knifeThrow)} cd={you.killCd} color={tc.murderers} hotkey="Q" ready={!!ctx.kill} />}
            {mode.reports && you.alive && <ActionButton icon={ctx.inspect ? 'magnifier' : 'report'} label={ctx.inspect ? 'Inspect' : 'Report'} onClick={() => doAction('report')} disabled={!ctx.report} color="#f97316" hotkey="R" ready={!!ctx.report} />}
            <ActionButton icon="use" label={useLabel.length > 12 ? 'Use' : useLabel} onClick={doUse} disabled={!ctx.use} color="#fde047" hotkey="E" ready={!!ctx.use} big />
          </div>
        </div>
      )}

      {/* Task mini-game */}
      {taskStation && station && snap.phase === 'play' && (
        <div style={{ pointerEvents: 'auto' }}>
          <TaskModal
            kind={station.kind as MiniGameKind}
            seed={hashStr(station.id + you.id)}
            title={isFixStation(taskStation) ? (station.kind === 'lightsPanel' ? 'Fix the lights' : 'Fix comms') : openTask?.def?.name ?? 'Task'}
            step={openTask && openTask.t.stations.length > 1 ? `${openTask.t.step + 1}/${openTask.t.stations.length}` : undefined}
            fake={openTask?.t.fake}
            reducedMotion={prefs.reducedMotion}
            onComplete={() => {
              if (isFixStation(taskStation)) act({ a: 'fix.done', station: taskStation });
              else act({ a: 'task.done', station: taskStation });
              useMystery.setState({ taskStation: null });
            }}
            onClose={() => setTask(null)}
          />
        </div>
      )}

      {/* Map */}
      {showMap && (
        <div style={{ pointerEvents: 'auto' }}>
          <Modal title={map.def.name} onClose={() => toggleMap(false)} wide>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <MapThumb map={map} height={Math.min(520, innerHeight * 0.65)} width={Math.min(900, innerWidth * 0.88)} labels markers={markers} night={mode.flashlights} />
            </div>
            <div className="mm-muted" style={{ textAlign: 'center', marginTop: 6, fontSize: '0.85em' }}>
              ● you · ▼ your tasks · ◎ sabotage
            </div>
          </Modal>
        </div>
      )}
      {/* Sabotage map (murderer team) */}
      {sabMap && (
        <div style={{ pointerEvents: 'auto' }}>
          <Modal title="Sabotage" onClose={() => setSabMap(false)} wide>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {(['lights', 'comms', 'meltdown', 'pressure'] as SabotageId[]).map((k) => {
                const enabled = k === 'lights' ? settings.sabLights : k === 'comms' ? settings.sabComms : k === 'meltdown' ? settings.sabMeltdown : settings.sabPressure;
                if (!enabled) return null;
                const name = k === 'meltdown' ? map.def.criticalNames.meltdown : k === 'pressure' ? map.def.criticalNames.pressure : SAB_LABEL[k];
                return (
                  <button
                    key={k}
                    className={`mm-btn ${k === 'meltdown' || k === 'pressure' ? 'mm-btn-danger' : ''}`}
                    disabled={!!sabActive || snap.sabotage.cooldown! > 0}
                    onClick={() => {
                      act({ a: 'sabotage', kind: k });
                      setSabMap(false);
                    }}
                  >
                    <MIcon name="bolt" size={16} /> {name}
                  </button>
                );
              })}
              {snap.sabotage.cooldown! > 0 && <span className="mm-chip">Ready in {Math.ceil(snap.sabotage.cooldown!)}s</span>}
            </div>
            {settings.sabDoors && (
              <>
                <div className="mm-muted" style={{ fontSize: '0.85em', marginBottom: 6 }}>
                  Tap a room to slam its doors for 10s {snap.sabotage.doorCd! > 0 ? `(ready in ${Math.ceil(snap.sabotage.doorCd!)}s)` : ''}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <MapThumb
                    map={map}
                    height={Math.min(440, innerHeight * 0.55)}
                    width={Math.min(860, innerWidth * 0.86)}
                    labels
                    markers={markers}
                    highlightRooms={Object.fromEntries([...new Set(map.def.doors.map((d) => d.room))].map((r) => [r, snap.sabotage.closedDoors.some((id) => map.def.doors.find((d) => d.id === id)?.room === r) ? '#ff4d5e' : '#f97316']))}
                    onRoom={(r) => {
                      if (map.def.doors.some((d) => d.room === r)) act({ a: 'sabotage', kind: 'doors', room: r });
                    }}
                  />
                </div>
              </>
            )}
          </Modal>
        </div>
      )}
      {/* Stats */}
      {showStats && (
        <div style={{ pointerEvents: 'auto' }}>
          <Modal title="Match stats" onClose={() => toggleStats(false)}>
            <StatsBody snap={snap} />
          </Modal>
        </div>
      )}
      {menu && (
        <div style={{ pointerEvents: 'auto' }}>
          <Modal title="Paused menu (the match keeps running)" onClose={() => setMenu(false)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="mm-muted">
                Room <b>{room.code}</b> · {MODES[snap.mode].name} · {map.def.name}
              </div>
              <button className="mm-btn" onClick={() => setMenu(false)}>
                Resume
              </button>
              <button
                className="mm-btn"
                onClick={() => {
                  useMystery.getState().setPrefs({ muted: !prefs.muted });
                }}
              >
                {prefs.muted ? 'Unmute sound' : 'Mute sound'}
              </button>
              <button
                className="mm-btn"
                onClick={() => {
                  useMystery.getState().setPrefs({ reducedMotion: !prefs.reducedMotion });
                }}
              >
                Reduced motion: {prefs.reducedMotion ? 'on' : 'off'}
              </button>
              <button className="mm-btn mm-btn-danger" onClick={leave}>
                Leave match
              </button>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}

export function StatsBody({ snap }: { snap: Snapshot }) {
  const prefs = useMystery((s) => s.prefs);
  const tc = teamColors(prefs.colorblind !== 'none');
  const st = snap.stats;
  const you = snap.you;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {st.timeLeft !== null && (
        <div>
          Time left: <b>{fmtTime(st.timeLeft)}</b>
        </div>
      )}
      {st.crew && (
        <section>
          <h4 style={{ margin: '0 0 6px' }}>Your tasks</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              {st.crew.myDone}/{st.crew.myTotal} steps
            </span>
            <span className="mm-muted">Emergency meetings left: {st.crew.meetingsLeft}</span>
          </div>
          <Bar value={st.crew.myTotal ? st.crew.myDone / st.crew.myTotal : 1} color="#fde047" />
          {st.taskBar !== null && (
            <>
              <h4 style={{ margin: '12px 0 6px' }}>Crew evaluation</h4>
              <Bar value={st.taskBar} color={prefs.colorblind !== 'none' ? '#38bdf8' : undefined} height={14} />
              <div style={{ textAlign: 'right' }} className="mm-muted">
                {Math.round(st.taskBar * 100)}% complete
              </div>
            </>
          )}
          {st.crew.byLength && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
              {(['common', 'short', 'long'] as const).map((k) => (
                <div key={k}>
                  <div className="mm-muted" style={{ fontSize: '0.75em', fontWeight: 800, textTransform: 'uppercase' }}>
                    {k}
                  </div>
                  <Bar value={st.crew!.byLength![k]} height={8} />
                </div>
              ))}
            </div>
          )}
          {st.crew.byRoom && (
            <div style={{ marginTop: 10 }}>
              <div className="mm-muted" style={{ fontSize: '0.75em', fontWeight: 800 }}>
                BY AREA (LEAST DONE FIRST)
              </div>
              {st.crew.byRoom.slice(0, 8).map((r) => (
                <div key={r.room} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85em', marginTop: 3 }}>
                  <span style={{ width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <div style={{ flex: 1 }}>
                    <Bar value={r.value} height={6} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {st.murderers && (
        <section style={{ padding: 10, borderRadius: 12, background: 'rgba(255,77,94,0.1)' }}>
          <h4 style={{ margin: '0 0 6px', color: tc.murderers }}>Murderer intel</h4>
          <div>Crew still alive: {st.murderers.crewAlive}</div>
          <div>Murderers alive: {st.murderers.murderersAlive}</div>
          <div>Kills needed to win: {st.murderers.killsToWin}</div>
          <div>Your kills: {st.murderers.myKills}</div>
          <div>Kill ready in: {st.murderers.killCd > 0 ? `${Math.ceil(st.murderers.killCd)}s` : 'now'}</div>
          <div>Sabotages ready: {st.murderers.sabotagesReady.join(', ') || 'none'}</div>
          {st.taskBar !== null && (
            <>
              <div className="mm-muted" style={{ marginTop: 6 }}>
                Crew task progress (stop them!)
              </div>
              <Bar value={st.taskBar} color="#ff4d5e" />
            </>
          )}
        </section>
      )}
      {st.neutral && (
        <section>
          <b>{st.neutral.goal}</b> — {st.neutral.status}
        </section>
      )}
      {st.ghost && (
        <section className="mm-muted">
          Ghost view: crew {st.ghost.crewAlive} · murderers {st.ghost.murderersAlive} · neutral {st.ghost.neutralAlive}
        </section>
      )}
      {st.hns && (
        <section>
          Hiders left: <b>{st.hns.hidersLeft}</b> {st.hns.final ? '· final countdown!' : ''}
        </section>
      )}
      <section>
        <h4 style={{ margin: '0 0 6px' }}>Players</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
          {snap.players.map((p) => (
            <div key={p.id} className="mm-chip" style={{ justifyContent: 'space-between', opacity: p.alive ? 1 : 0.5 }}>
              <span>
                <span style={{ color: colorHex(p.cosmetics.color) }}>●</span> {p.name}
              </span>
              <span style={{ color: p.role ? ROLES[p.role].color : undefined }}>{p.role ? ROLES[p.role].name : p.alive ? '' : '✝'}</span>
            </div>
          ))}
        </div>
      </section>
      {you.role === 'mayor' && <div className="mm-muted">Your vote counts {you.mayorRevealed ? 3 : 2}×.</div>}
    </div>
  );
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
