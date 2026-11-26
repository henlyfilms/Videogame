/**
 * In-match HUD: role badge + team task bar and checklist (top-left), chat /
 * emote / map / stats / settings buttons (top-right), schematic minimap
 * (bottom-left), one big context action with stacked secondaries
 * (bottom-right), sabotage alarm banner + urgent arrow, security consoles,
 * vent navigation, Lights Out battery + dread, Hide & Seek danger meter, and
 * the tablet (full map) view.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getMap } from '../core/maps';
import { MODES } from '../core/modes';
import type { Snapshot } from '../core/project';
import { QUICK_CHAT } from '../core/quickchat';
import { ROLES } from '../core/roles';
import { TASK_BY_ID } from '../core/tasks';
import type { Settings } from '../core/settings';
import type { SabotageId, StationKind, Vec2 } from '../core/types';
import type { Keybinds } from '../client/prefs';
import { filterProfanity } from '../client/prefs';
import { bindUi, currentContext, doAction, doUse } from '../client/controls';
import { runtime } from '../client/runtime';
import { isFixStation, taskClosedAt, useMystery } from '../client/store';
import { Bar, BerryAvatar, colorHex, fmtTime, MIcon, Modal, readable, teamColors } from './common';
import { Kbd, Presence, SchematicMap, Siren, STATION_ICON, Tick, useBox, useSticky, useViewport, type SchematicMarker } from './kit';
import { SettingsMenu } from './Menus';
import { TaskModal } from './tasks/TaskModal';
import { sfx } from '../audio/sfx';
import type { MiniGameKind } from './tasks/types';
import { Joystick, TouchLook, useCoarsePointer } from './TouchControls';

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

type Tone = 'yellow' | 'red' | 'orange' | 'grey' | 'green' | 'blue' | 'purple' | 'gold';

interface ActionDef {
  id: string;
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  cd?: number;
  cdMax?: number;
  tone: Tone;
  hotkey?: keyof Keybinds;
  ready?: boolean;
  /** Higher wins the big slot when ready. */
  prio: number;
}

/** 12-point burst behind a ready action icon (original shape). */
function Burst() {
  const pts: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 36 : 48 + (i % 4 === 0 ? 2 : 0);
    pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
  }
  return (
    <svg className="mmh-burst" viewBox="0 0 100 100" aria-hidden>
      <polygon points={pts.join(' ')} />
    </svg>
  );
}

function CdRing({ cd, max }: { cd: number; max: number }) {
  const k = max > 0 ? Math.max(0, Math.min(1, cd / max)) : 1;
  const C = 2 * Math.PI * 46;
  return (
    <svg className="mmh-cdring" viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r="46" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - k) }} />
    </svg>
  );
}

function BigAction({ a }: { a: ActionDef }) {
  const cooling = (a.cd ?? 0) > 0;
  const live = !a.disabled && !cooling;
  return (
    <button key={a.id} className="mmh-big" data-tone={a.tone} data-live={live} data-ready={live && !!a.ready} disabled={a.disabled} onClick={a.onClick} aria-label={a.label}>
      <span className="mmh-big-disc">
        <Burst />
        <MIcon name={a.icon} size={46} stroke={2.2} />
        {cooling && <CdRing cd={a.cd!} max={a.cdMax ?? a.cd!} />}
        {cooling && <span className="mmh-cd">{Math.ceil(a.cd!)}</span>}
      </span>
      <span className="mmh-big-label">{a.label}</span>
      {a.hotkey && <Kbd k={a.hotkey} className="mmh-big-key" />}
    </button>
  );
}

function SmallAction({ a, i }: { a: ActionDef; i: number }) {
  const cooling = (a.cd ?? 0) > 0;
  const live = !a.disabled && !cooling;
  return (
    <button className="mmh-small" data-tone={a.tone} data-live={live} data-ready={live && !!a.ready} disabled={a.disabled} onClick={a.onClick} aria-label={a.label} style={{ ['--i' as string]: i }}>
      <span className="mmh-small-disc">
        <MIcon name={a.icon} size={24} stroke={2.2} />
        {cooling && <span className="mmh-cd small">{Math.ceil(a.cd!)}</span>}
      </span>
      <span className="mmh-small-label">{a.label}</span>
      {a.hotkey && <Kbd k={a.hotkey} className="mmh-small-key" />}
    </button>
  );
}

/** Square top-right button with a key badge. */
function SqButton({ icon, label, onClick, hotkey, code, active, disabled, className = '' }: { icon: string; label: string; onClick: () => void; hotkey?: keyof Keybinds; code?: string; active?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button className={`mmh-sq ${className}`} onClick={onClick} aria-label={label} title={label} data-active={!!active} disabled={disabled}>
      <MIcon name={icon} size={24} stroke={2.1} />
      {(hotkey || code) && <Kbd k={hotkey} code={code} className="mmh-sq-key" />}
    </button>
  );
}

/** Tiny heartbeat trace in the role badge. */
function Pulse({ dead }: { dead: boolean }) {
  return (
    <svg className="mmh-ecg" viewBox="0 0 120 24" aria-hidden data-dead={dead}>
      <path d={dead ? 'M0 12H120' : 'M0 12H34l5-8 6 16 5-14 4 6H120'} />
    </svg>
  );
}

const SAB_LABEL: Record<SabotageId, string> = { lights: 'Lights', comms: 'Comms', doors: 'Doors', meltdown: 'Critical A', pressure: 'Critical B' };

const FIX_KINDS: Record<string, string[]> = { lights: ['lightsPanel'], comms: ['commsPanel'], meltdown: ['meltdownA', 'meltdownB'], pressure: ['pressureA', 'pressureB'] };

function shortRoom(n: string | undefined): string {
  return (n ?? '').replace(/^.*?'s /, '');
}

export function Hud({ snap, settings }: { snap: Snapshot; settings: Settings }) {
  useTick(120);
  const coarse = useCoarsePointer();
  const vp = useViewport();
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
  const chat = useMystery((s) => s.chat);
  const [sabMap, setSabMap] = useState(false);
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState<null | 'chat' | 'emote'>(null);
  const [holding, setHolding] = useState<string | null>(null);
  const [tasksOpen, setTasksOpen] = useState(() => typeof innerWidth !== 'number' || innerWidth > 640);
  const tc = teamColors(prefs.colorblind !== 'none');
  const map = getMap(snap.map);
  const you = snap.you;
  const role = ROLES[you.role];
  const mode = MODES[snap.mode];
  const ctx = currentContext;
  const me = snap.players.find((p) => p.id === you.id);
  const killerTeam = you.team === 'murderers';
  const chatInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bindUi({
      openSabotage: () => ROLES[useMystery.getState().snap?.you.role ?? 'crewmate'].canSabotage && setSabMap((x) => !x),
      openMenu: () => {
        if (useMystery.getState().taskStation) useMystery.getState().setTask(null);
        else if (performance.now() - taskClosedAt > 300) setMenu((m) => !m);
      },
      openChat: () => {
        setDrawer('chat');
        setTimeout(() => chatInput.current?.focus(), 60);
      },
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
  const commsDown = sabActive === 'comms' && !killerTeam;

  // ---- Actions ------------------------------------------------------------
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
  const actions: ActionDef[] = [];
  if (snap.phase === 'play') {
    const useLabel = ctx.use?.label ?? 'Use';
    actions.push({ id: 'use', icon: ctx.use?.kind === 'emergency' ? 'siren' : 'use', label: useLabel.length > 12 ? 'Use' : useLabel, onClick: doUse, disabled: !ctx.use, tone: 'yellow', hotkey: 'use', ready: !!ctx.use, prio: 3 });
    if (mode.reports && you.alive) actions.push({ id: 'report', icon: ctx.inspect ? 'magnifier' : 'megaphone', label: ctx.inspect ? 'Inspect' : 'Report', onClick: () => doAction('report'), disabled: !ctx.report && !ctx.inspect, tone: 'red', hotkey: 'report', ready: !!ctx.report || !!ctx.inspect, prio: 6 });
    if (role.canKill && you.alive) {
      const killLabel = you.role === 'poisoner' ? 'Poison' : you.role === 'seeker' ? 'Tag' : ctx.kill || !settings.knifeThrow || you.role !== 'murderer' ? 'Kill' : 'Throw';
      actions.push({ id: 'kill', icon: you.role === 'poisoner' ? 'vial' : you.role === 'seeker' ? 'crosshair' : 'knife', label: killLabel, onClick: () => doAction('kill'), disabled: !ctx.kill && !(you.role === 'murderer' && settings.knifeThrow), cd: you.killCd, cdMax: settings.killCooldown, tone: 'red', hotkey: 'kill', ready: !!ctx.kill, prio: 5 });
    }
    if (you.hasGun && you.alive) actions.push({ id: 'shoot', icon: 'gun', label: 'Shoot', onClick: () => doAction('shoot'), disabled: !ctx.shoot, cd: you.gunCd, cdMax: settings.gunCooldown, tone: 'gold', ready: !!ctx.shoot, prio: 5 });
    if (role.canVent && (you.role !== 'hider' || you.ventUses > 0) && you.alive)
      actions.push({ id: 'vent', icon: 'grate', label: you.inVent ? 'Exit' : 'Vent', onClick: () => doAction('vent'), disabled: !ctx.vent && !you.inVent, cd: you.inVent ? 0 : you.ventCd, tone: 'orange', hotkey: 'vent', ready: !!ctx.vent || !!you.inVent, prio: 4 });
    if (role.canSabotage && mode.sabotage) actions.push({ id: 'sabotage', icon: 'bolt', label: 'Sabotage', onClick: () => setSabMap(true), cd: snap.sabotage.cooldown, cdMax: settings.sabotageCooldown, tone: 'red', hotkey: 'sabotage', prio: 1 });
    if (mode.flashlights && !killerTeam && you.alive) actions.push({ id: 'flash', icon: 'flashlight', label: you.flashlightOn ? 'Light off' : 'Light on', onClick: () => doAction('flashlight'), tone: 'gold', hotkey: 'flashlight', prio: 0 });
    if (you.alive) {
      if (you.role === 'medic') {
        const t = nearestVisible();
        actions.push(
          you.shieldTarget
            ? { id: 'ability', icon: 'eye', label: 'Vitals', onClick: () => act({ a: 'vitals' }), disabled: you.roundAbilityUsed || settings.medicVitalsSeconds <= 0, tone: 'green', prio: 2 }
            : { id: 'ability', icon: 'shield', label: 'Shield', onClick: () => t && act({ a: 'shield', target: t }), disabled: !t, tone: 'green', ready: !!t, prio: 2 },
        );
      } else if (you.role === 'tracker') {
        const t = nearestVisible();
        actions.push({ id: 'ability', icon: 'arrow', label: 'Track', onClick: () => t && act({ a: 'track', target: t }), disabled: !t, cd: you.abilityCd, tone: 'blue', ready: !!t, prio: 2 });
      } else if (you.role === 'lookout') actions.push({ id: 'ability', icon: 'eye', label: 'Place cam', onClick: () => act({ a: 'camera' }), disabled: !!you.portableCam, tone: 'purple', prio: 2 });
      else if (you.role === 'engineer') actions.push({ id: 'ability', icon: 'wrench', label: 'Remote fix', onClick: () => act({ a: 'remotefix' }), disabled: you.remoteFixUsed || !sabActive || sabActive === 'doors', tone: 'orange', ready: !!sabActive && sabActive !== 'doors' && !you.remoteFixUsed, prio: 2 });
      else if (role.canSabotage && mode.flashlights) actions.push({ id: 'ability', icon: 'flashlight', label: 'Blackout', onClick: () => act({ a: 'blackout' }), cd: you.abilityCd, tone: 'purple', prio: 2 });
    }
  }
  const live = (a: ActionDef) => !a.disabled && !((a.cd ?? 0) > 0);
  const readyOnes = actions.filter((a) => a.ready && live(a)).sort((a, b) => b.prio - a.prio);
  const mainId = role.canKill && you.alive ? 'kill' : 'use';
  const primary = readyOnes[0] ?? actions.find((a) => a.id === mainId) ?? actions[0];
  const secondary = actions.filter((a) => a !== primary);

  // ---- Map markers --------------------------------------------------------
  const markers: SchematicMarker[] = useMemo(() => {
    const m: SchematicMarker[] = [];
    if (!(snap.sabotage.active === 'comms' && you.team !== 'murderers'))
      for (const t of you.tasks) {
        if (t.done) continue;
        const st = map.stationById.get(t.stations[t.step] ?? '');
        if (st) m.push({ pos: st, kind: 'task' });
      }
    if (sabActive && sabActive !== 'doors') for (const s of map.def.stations) if (FIX_KINDS[sabActive]?.includes(s.kind)) m.push({ pos: s, kind: 'alert' });
    if (you.trackPos) m.push({ pos: you.trackPos, color: '#38bdf8', kind: 'ping' });
    return m;
  }, [snap, map, you]);
  const youColor = colorHex(me?.cosmetics.color ?? 10);
  const youMarker = useMemo(() => ({ get: () => ({ pos: runtime.local.pos, facing: runtime.local.facing }), color: youColor }), [youColor]);
  const mapTheme = killerTeam ? 'killer' : mode.flashlights ? 'night' : 'crew';

  // ---- Urgent arrow toward the nearest fix station -------------------------
  let arrow: { deg: number; dist: number } | null = null;
  if (sabActive && sabActive !== 'doors' && you.alive && !taskStation) {
    let best: Vec2 | null = null;
    let bd = Infinity;
    for (const s of map.def.stations) {
      if (!FIX_KINDS[sabActive]?.includes(s.kind)) continue;
      const d = Math.hypot(s.x - runtime.local.pos.x, s.y - runtime.local.pos.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best && bd > 2.2) {
      const ang = Math.atan2(best.y - runtime.local.pos.y, best.x - runtime.local.pos.x);
      const screen = matchView && matchView !== '2d' ? ang - runtime.local.facing - Math.PI / 2 : ang;
      arrow = { deg: (screen * 180) / Math.PI, dist: bd };
    }
  }

  const sec = snap.security;
  const ventLinks = you.inVent ? map.ventById.get(you.inVent)?.links ?? [] : [];
  const sabSticky = useSticky(sabActive && sabActive !== 'doors' ? sabActive : null);
  const sabName = (k: SabotageId | null) => (k === 'lights' ? 'Lights out' : k === 'comms' ? 'Comms down' : k === 'meltdown' ? map.def.criticalNames.meltdown : k === 'pressure' ? map.def.criticalNames.pressure : '');
  const canTalk = (you.alive ? settings.proximityChat : settings.ghostChat) && (settings.chat || settings.quickChat);
  const playChat = chat.filter((c) => c.t >= 0).slice(-6);
  const miniW = coarse ? Math.min(150, vp.w * 0.36) : vp.w < 900 ? 220 : 280;
  const miniH = Math.round(miniW * 0.66);

  return (
    <div className="mmh" data-team={you.team} data-ghost={isGhost}>
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
          className="mmh-dread"
          style={{
            background: `radial-gradient(circle, transparent 45%, rgba(120,0,30,${0.35 * you.dread}) 100%)`,
            animation: prefs.reducedMotion ? undefined : `mm-pulse ${Math.max(0.35, 1.2 - you.dread)}s ease-in-out infinite`,
          }}
        />
      )}
      {/* Sabotage edge glow */}
      <Presence show={!!sabActive && sabActive !== 'doors'} anim="fade" className={`mmh-alarm-edge${critical ? ' crit' : ''}`}>
        <span />
      </Presence>

      {/* ---------------- Top-left: role badge, team bar, checklist ---------------- */}
      <div className="mmh-tl mm-safe">
        <div className="mmh-role mm-in-left">
          <div className="mmh-role-av" style={{ ['--c' as string]: youColor }}>{me && <BerryAvatar cosmetics={me.cosmetics} size={56} ghost={isGhost} animate={!prefs.reducedMotion} />}</div>
          <div className="mmh-role-slab">
            <div className="mmh-role-top">
              <span className="mmh-role-name mm-nocase">{me?.name}</span>
              <Pulse dead={isGhost} />
            </div>
            <div className="mmh-role-role" style={{ color: role.color }}>
              {isGhost ? 'Ghost · ' : ''}
              {role.name}
              {you.isHero ? ' · Hero' : ''}
            </div>
          </div>
        </div>
        {snap.stats.taskBar !== null && (
          <div className="mmh-taskbar mm-in-left" style={{ animationDelay: '60ms' }}>
            <span className="mmh-taskbar-label">
              {killerTeam ? 'Crew progress' : 'Crew tasks'} <b><Tick value={Math.round(snap.stats.taskBar * 100)} />%</b>
            </span>
            <Bar value={snap.stats.taskBar} color={prefs.colorblind !== 'none' ? '#38bdf8' : killerTeam ? '#ff4040' : undefined} height={24} label="Crew task progress" />
          </div>
        )}
        <button className="mmh-collapse" onClick={() => setTasksOpen((x) => !x)} aria-expanded={tasksOpen} aria-label={tasksOpen ? 'Hide task list' : 'Show task list'}>
          <MIcon name={tasksOpen ? 'chevronUp' : 'chevronDown'} size={16} />
          <span>
            {you.team === 'crew' ? `Tasks ${myTasksDone}/${you.tasks.length}` : killerTeam ? 'Cover tasks' : 'Goal'}
          </span>
          <Kbd k="tasks" />
        </button>
        <Presence show={tasksOpen} anim="drop" exitMs={200} className="mmh-tasks-wrap">
          {commsDown ? (
            <div className="mmh-commsdown" role="status">
              <MIcon name="wifi" size={18} /> Comms jammed — task list offline
            </div>
          ) : (
            <ul className="mmh-tasks" aria-label="Task checklist">
              {you.tasks.map((t, i) => {
                const def = TASK_BY_ID[t.taskId];
                const stId = t.stations[Math.min(t.step, t.stations.length - 1)] ?? '';
                const st = map.stationById.get(stId);
                const rname = st ? shortRoom(map.roomById.get(st.room)?.name) : '';
                const icon = STATION_ICON[(st?.kind ?? '') as StationKind] ?? 'task';
                return (
                  <li key={i} className="mmh-task" data-done={t.done} data-fake={t.fake} style={{ ['--i' as string]: i }}>
                    <span className="mmh-task-ic">{t.done ? <MIcon name="check" size={20} stroke={3} /> : <MIcon name={icon} size={18} />}</span>
                    <span className="mmh-task-txt">
                      <b>{def?.name}</b>
                      <small>{rname}</small>
                    </span>
                    <span className="mmh-task-n">
                      {t.done ? t.stations.length : t.step}/{t.stations.length}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {killerTeam && mm && (
            <div className="mmh-intel">
              <div>
                Crew left <b>{mm.crewAlive}</b> · Team <b>{mm.murderersAlive}</b> · Kills to win <b>{mm.killsToWin}</b>
              </div>
              {mm.teammates.length > 0 && (
                <div className="mm-nocase">
                  {mm.teammates.map((t) => (
                    <span key={t.id} style={{ color: t.alive ? tc.murderers : '#64748b', marginRight: 8 }}>
                      {snap.players.find((p) => p.id === t.id)?.name}
                      {t.alive ? '' : ' ✝'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {snap.stats.neutral && (
            <div className="mmh-intel neutral">
              <b>Goal:</b> {snap.stats.neutral.goal}
              <div className="mm-muted">{snap.stats.neutral.status}</div>
            </div>
          )}
          {you.clues.length > 0 && (
            <div className="mmh-intel clue">
              <b>Clues</b>
              {you.clues.map((c) => (
                <div key={c.bodyId} className="mm-nocase">
                  {snap.players.find((p) => p.id === c.victimId)?.name}: {c.secondsSinceDeath}s ago · killer {c.hintKind === 'berry' ? 'is a' : 'wears'} <b style={{ color: '#2dd4bf' }}>{c.killerHint}</b>
                </div>
              ))}
            </div>
          )}
        </Presence>
      </div>

      {/* ---------------- Top-right: round buttons, timer, meters ---------------- */}
      <div className="mmh-tr mm-safe">
        <div className="mmh-sqrow mm-in-right">
          <SqButton icon="chat" label="Chat" onClick={() => setDrawer((d) => (d === 'chat' ? null : 'chat'))} hotkey="chat" active={drawer === 'chat'} />
          <SqButton icon="emote" label="Emotes" className="mmh-sq-emote" onClick={() => setDrawer((d) => (d === 'emote' ? null : 'emote'))} hotkey="emote" active={drawer === 'emote'} />
          <SqButton icon="map" label="Map" onClick={() => toggleMap()} hotkey="map" active={showMap} />
          <SqButton icon="stats" label="Stats" onClick={() => toggleStats()} hotkey="tasks" active={showStats} />
          <SqButton icon="gear" label="Menu" onClick={() => setMenu(true)} code="Escape" active={menu} />
        </div>
        {timeLeft !== null && (
          <div className="mmh-timer" data-low={timeLeft < 30}>
            <MIcon name="timer" size={18} /> <span>{fmtTime(timeLeft)}</span>
          </div>
        )}
        {mode.flashlights && !killerTeam && you.alive && (
          <div className="mmh-meter">
            <MIcon name="battery" size={18} />
            <div style={{ flex: 1 }}>
              <Bar value={you.battery} color={you.battery < 0.2 ? '#ff4040' : '#ffd426'} height={10} label="Battery" />
            </div>
            <b>{Math.round(you.battery * 100)}%</b>
          </div>
        )}
        {snap.stats.hns && (
          <div className="mmh-meter col">
            <div className="mmh-meter-row">
              <span>Hiders left</span>
              <b>{snap.stats.hns.hidersLeft}</b>
            </div>
            {you.role === 'hider' && you.alive && (
              <>
                <span className="mm-label">Danger</span>
                <Bar value={snap.stats.hns.danger} color={`hsl(${120 - snap.stats.hns.danger * 120}, 90%, 55%)`} label="Danger" />
              </>
            )}
            {snap.stats.hns.final && <div className="mmh-final">Final countdown</div>}
          </div>
        )}
        <Presence show={drawer === 'chat'} anim="drop" className="mmh-drawer" exitMs={200}>
          <div className="mmh-drawer-head">
            <span>Nearby chat</span>
            <button className="mm-round sm" onClick={() => setDrawer(null)} aria-label="Close chat">
              <MIcon name="close" size={16} />
            </button>
          </div>
          <div className="mmh-chatlog" aria-live="polite">
            {playChat.length === 0 && <div className="mm-muted">{canTalk ? 'Nobody has said anything nearby.' : 'Chat opens when a meeting is called.'}</div>}
            {playChat.map((c) => {
              const who = snap.players.find((p) => p.id === c.from);
              return (
                <div key={c.id} className="mm-nocase">
                  {who && <b style={{ color: readable(colorHex(who.cosmetics.color)) }}>{who.name}: </b>}
                  {prefs.profanityFilter ? filterProfanity(c.text) : c.text}
                </div>
              );
            })}
          </div>
          {canTalk && settings.quickChat && (
            <div className="mmh-quick">
              {QUICK_CHAT.filter((q) => !q.target)
                .slice(0, 6)
                .map((q) => (
                  <button key={q.id} className="mm-btn sm mm-nocase" onClick={() => act({ a: 'quick', id: q.id })}>
                    {q.text}
                  </button>
                ))}
            </div>
          )}
          <div className="mmh-emotes mmh-emotes-inline" aria-label="Emotes">
            {(prefs.cosmetics.emotes.length ? prefs.cosmetics.emotes : ['wave']).slice(0, 4).map((e) => (
              <button
                key={e}
                className="mm-btn sm"
                onClick={() => {
                  sfx.play('emote');
                  act({ a: 'emote', id: e });
                }}
              >
                {e}
              </button>
            ))}
          </div>
          {canTalk && settings.chat && (
            <form
              className="mmh-chatform"
              onSubmit={(e) => {
                e.preventDefault();
                const v = chatInput.current?.value.trim();
                if (v) act({ a: 'chat', text: v });
                if (chatInput.current) chatInput.current.value = '';
              }}
            >
              <input ref={chatInput} className="mm-input" maxLength={160} placeholder={you.alive ? 'Say something nearby…' : 'Ghost chat…'} aria-label="Chat message" onKeyDown={(e) => e.stopPropagation()} />
              <button className="mm-btn" type="submit" aria-label="Send">
                <MIcon name="arrow" size={18} />
              </button>
            </form>
          )}
        </Presence>
        <Presence show={drawer === 'emote'} anim="drop" className="mmh-drawer emotes" exitMs={200}>
          <div className="mmh-drawer-head">
            <span>Emotes</span>
            <button className="mm-round sm" onClick={() => setDrawer(null)} aria-label="Close emotes">
              <MIcon name="close" size={16} />
            </button>
          </div>
          <div className="mmh-emotes">
            {(prefs.cosmetics.emotes.length ? prefs.cosmetics.emotes : ['wave']).map((e, i) => (
              <button
                key={e}
                className="mm-btn sm"
                style={{ ['--i' as string]: i }}
                onClick={() => {
                  sfx.play('emote');
                  act({ a: 'emote', id: e });
                  setDrawer(null);
                }}
              >
                {i < 4 && <kbd className="mm-kbd inline">{i + 1}</kbd>}
                {e}
              </button>
            ))}
          </div>
        </Presence>
      </div>

      {/* ---------------- Center: alarms and notices ---------------- */}
      <div className={`mmh-center${vp.portrait && vp.w < 700 ? ' low' : ''}`}>
        <Presence show={!!sabActive && sabActive !== 'doors'} anim="drop" className="mmh-sab" role="alert">
          <div className="mmh-sab-siren">
            <Siren size={coarse ? 44 : 58} />
          </div>
          <div className="mmh-sab-body" data-crit={critical}>
            <span className="mmh-sab-title">{sabSticky === 'lights' || sabSticky === 'comms' ? `${sabName(sabSticky)} — repair it!` : `${sabName(sabSticky)}! Stop it!`}</span>
            {critical ? (
              <span className="mmh-sab-num">
                <span key={Math.ceil(snap.sabotage.timer)} className="mm-bump">
                  {Math.ceil(snap.sabotage.timer)}
                </span>
                <small>{Math.round(snap.sabotage.progress * 2)}/2 holding</small>
              </span>
            ) : (
              <span className="mmh-sab-sub">{sabSticky === 'lights' ? 'Find the breaker panel' : 'Reset the comms panel'}</span>
            )}
          </div>
        </Presence>
        {arrow && (
          <div className="mmh-arrow" style={{ transform: `rotate(${arrow.deg}deg)` }} aria-hidden>
            <svg viewBox="0 0 40 40">
              <path d="M6 12 L30 20 L6 28 L12 20 Z" />
            </svg>
          </div>
        )}
        <Presence show={hideLeft > 0} anim="pop" className="mmh-notice big">
          <b>{you.role === 'seeker' ? 'Counting… let them hide' : 'Hide!'}</b>
          <span className="mmh-notice-num">{Math.ceil(hideLeft)}</span>
        </Presence>
        <Presence show={isGhost && snap.phase === 'play'} anim="drop" className="mmh-notice">
          <MIcon name="ghost" size={18} /> You’re a ghost{settings.ghostTasks && you.team === 'crew' ? ' — finish your tasks to help the crew' : ''}
        </Presence>
        <Presence show={!!holding} anim="drop" className="mmh-notice warn">
          Holding… {snap.sabotage.progress >= 1 ? 'fixing!' : 'waiting for a partner at the other station'}
        </Presence>
        <Presence show={!!you.inVent} anim="pop" className="mmh-vent">
          <span className="mmh-vent-title">In the vents</span>
          <div className="mmh-vent-row">
            {ventLinks.map((v, i) => {
              const vv = map.ventById.get(v)!;
              const ti = Math.floor(vv.y) * map.w + Math.floor(vv.x);
              const ri = map.roomIdx[ti] ?? -1;
              const rn = ri >= 0 ? map.def.rooms[ri]!.name : 'Hall';
              return (
                <button key={v} className="mm-btn" style={{ ['--i' as string]: i }} onClick={() => act({ a: 'vent.move', vent: v })}>
                  <MIcon name="arrow" size={16} /> {shortRoom(rn)}
                </button>
              );
            })}
            <button className="mm-btn mm-btn-primary" onClick={() => act({ a: 'vent.exit' })}>
              Climb out
            </button>
          </div>
        </Presence>
      </div>

      {/* ---------------- Security console overlay ---------------- */}
      <Presence show={!!(sec && you.using)} anim="rise" className="mmh-console-wrap mm-safe" style={{ bottom: coarse ? 190 : 150 }}>
        {sec && you.using && (
          <div className="mmh-console">
            <div className="mmh-console-head">
              <b>{you.using === 'admin' ? 'Admin map' : you.using === 'vitals' ? 'Vitals' : you.using === 'doorlog' ? 'Door log' : 'Security cameras (live)'}</b>
              <button className="mm-btn sm" onClick={() => act({ a: 'use', facility: null })}>
                Close
              </button>
            </div>
            {sec.admin && <SchematicMap map={map} width={Math.min(620, vp.w - 60)} height={Math.min(260, vp.h * 0.35)} theme="admin" labels counts={Object.fromEntries(sec.admin.filter((a) => a.count).map((a) => [a.room, String(a.count)]))} reducedMotion={prefs.reducedMotion} />}
            {sec.vitals && (
              <div className="mmh-vitals">
                {sec.vitals.map((v, i) => {
                  const p = snap.players.find((x) => x.id === v.id);
                  return (
                    <div key={v.id} className="mmh-vital mm-nocase" data-alive={v.alive} style={{ ['--i' as string]: i }}>
                      <span className="dot" style={{ background: colorHex(p?.cosmetics.color ?? 0) }} />
                      <span className="nm">{p?.name}</span>
                      <span className="st" style={{ color: v.alive ? tc.good : tc.bad }}>{v.alive ? 'OK' : 'DEAD'}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {sec.doorlog && (
              <div className="mm-scroll mmh-doorlog">
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
        )}
      </Presence>

      {/* ---------------- Bottom-left: minimap ---------------- */}
      {snap.phase === 'play' && !taskStation && (
        <div className={`mmh-mini mm-in-up${coarse ? ' touch' : ''}`} data-alarm={!!sabActive && sabActive !== 'doors'}>
          <button className="mmh-mini-open" onClick={() => toggleMap(true)} aria-label="Open tablet">
            <MIcon name="expand" size={16} />
          </button>
          <div onClick={() => toggleMap(true)} role="presentation">
            <SchematicMap map={map} width={miniW} height={miniH} theme={commsDown ? 'night' : mapTheme} markers={markers} you={youMarker} reducedMotion={prefs.reducedMotion} ariaLabel="Minimap" />
          </div>
        </div>
      )}

      {/* ---------------- Bottom-right: context actions ---------------- */}
      {snap.phase === 'play' && !taskStation && primary && (
        <div className={`mmh-actions mm-safe${coarse ? ' touch' : ''}`}>
          <div className="mmh-sec">
            {secondary.map((a, i) => (
              <SmallAction key={a.id} a={a} i={i} />
            ))}
          </div>
          <BigAction key={primary.id} a={primary} />
        </div>
      )}

      {/* ---------------- Task mini-game ---------------- */}
      {taskStation && station && snap.phase === 'play' && (
        <div style={{ pointerEvents: 'auto' }} onPointerDownCapture={() => sfx.play('task.tick')} onKeyDownCapture={(e) => e.key !== 'Escape' && sfx.play('task.tick')}>
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

      {/* ---------------- Tablet (full map) ---------------- */}
      <Tablet
        show={showMap}
        snap={snap}
        theme={commsDown ? 'night' : mapTheme}
        markers={markers}
        you={youMarker}
        onClose={() => toggleMap(false)}
        onStats={() => {
          toggleMap(false);
          toggleStats(true);
        }}
        onSabotage={role.canSabotage && mode.sabotage ? () => {
          toggleMap(false);
          setSabMap(true);
        } : undefined}
        onMenu={() => {
          toggleMap(false);
          setMenu(true);
        }}
        commsDown={commsDown}
      />

      {/* Sabotage map (murderer team) */}
      {sabMap && (
        <div style={{ pointerEvents: 'auto' }}>
          <Modal title="Sabotage" onClose={() => setSabMap(false)} wide>
            <div className="mmh-sabgrid">
              {(['lights', 'comms', 'meltdown', 'pressure'] as SabotageId[]).map((k, i) => {
                const enabled = k === 'lights' ? settings.sabLights : k === 'comms' ? settings.sabComms : k === 'meltdown' ? settings.sabMeltdown : settings.sabPressure;
                if (!enabled) return null;
                const name = k === 'meltdown' ? map.def.criticalNames.meltdown : k === 'pressure' ? map.def.criticalNames.pressure : SAB_LABEL[k];
                const crit = k === 'meltdown' || k === 'pressure';
                return (
                  <button
                    key={k}
                    className={`mmh-sabcard${crit ? ' crit' : ''}`}
                    style={{ ['--i' as string]: i }}
                    disabled={!!sabActive || snap.sabotage.cooldown! > 0}
                    onClick={() => {
                      act({ a: 'sabotage', kind: k });
                      setSabMap(false);
                    }}
                  >
                    <MIcon name={k === 'lights' ? 'bolt' : k === 'comms' ? 'wifi' : 'siren'} size={28} />
                    <span>{name}</span>
                    <small>{crit ? 'Critical' : 'Nuisance'}</small>
                  </button>
                );
              })}
              {snap.sabotage.cooldown! > 0 && (
                <span className="mm-chip">
                  Ready in <Tick value={Math.ceil(snap.sabotage.cooldown!)} ms={300} />s
                </span>
              )}
            </div>
            {settings.sabDoors && (
              <>
                <div className="mm-label" style={{ margin: '12px 0 6px' }}>
                  Tap a room to slam its doors for 10s {snap.sabotage.doorCd! > 0 ? `(ready in ${Math.ceil(snap.sabotage.doorCd!)}s)` : ''}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <SchematicMap
                    map={map}
                    width={Math.min(860, vp.w * 0.84)}
                    height={Math.min(420, vp.h * 0.5)}
                    theme="killer"
                    labels
                    markers={markers}
                    you={youMarker}
                    reducedMotion={prefs.reducedMotion}
                    highlight={Object.fromEntries([...new Set(map.def.doors.map((d) => d.room))].map((r) => [r, snap.sabotage.closedDoors.some((id) => map.def.doors.find((d) => d.id === id)?.room === r) ? '#000000' : '#ffb020']))}
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
          <Modal title="Settings — the match keeps running" onClose={() => setMenu(false)} wide>
            <SettingsMenu
              startTab="match"
              inMatch={{
                code: room.code,
                mode: MODES[snap.mode].name,
                map: map.def.name,
                onResume: () => setMenu(false),
                onLeave: leave,
              }}
            />
          </Modal>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tablet: collapsible task list, map screen with pins + total bar, side keys.

function Tablet({ show, snap, theme, markers, you, onClose, onStats, onSabotage, onMenu, commsDown }: { show: boolean; snap: Snapshot; theme: 'crew' | 'killer' | 'night'; markers: SchematicMarker[]; you: { get(): { pos: Vec2; facing: number }; color: string }; onClose(): void; onStats(): void; onSabotage?: () => void; onMenu(): void; commsDown: boolean }) {
  const reduced = useMystery((s) => s.prefs.reducedMotion);
  const vp = useViewport();
  const [listOpen, setListOpen] = useState(true);
  const [screenRef, box] = useBox<HTMLDivElement>();
  const map = getMap(snap.map);
  useEffect(() => {
    if (!show) return;
    sfx.play('ui.open');
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [show, onClose]);
  const tb = snap.stats.taskBar;
  const you2 = snap.you;
  return (
    <Presence show={show} anim="fade" className="mmt-back" exitMs={260}>
      <div className="mmt-scrim" onPointerDown={onClose} />
      <div className="mmt" role="dialog" aria-modal aria-label={`${map.def.name} map`} data-list={listOpen}>
        <aside className="mmt-list" data-open={listOpen}>
          <div className="mmt-list-in">
            <h3>Your tasks</h3>
            {you2.team === 'murderers' && <div className="mm-muted mmt-note">Fake tasks — blend in</div>}
            {commsDown ? (
              <div className="mmt-note warn">Comms jammed</div>
            ) : (
              you2.tasks.map((t, i) => {
                const def = TASK_BY_ID[t.taskId];
                const st = map.stationById.get(t.stations[Math.min(t.step, t.stations.length - 1)] ?? '');
                return (
                  <div key={i} className="mmt-task" data-done={t.done} style={{ ['--i' as string]: i }}>
                    <span className="mmt-task-ic">{t.done ? <MIcon name="check" size={16} stroke={3} /> : <MIcon name={STATION_ICON[(st?.kind ?? '') as StationKind] ?? 'task'} size={16} />}</span>
                    <span className="mmt-task-txt">
                      <b>{def?.name}</b>
                      <small>
                        {t.stations.length > 1 ? `${t.done ? t.stations.length : t.step}/${t.stations.length} · ` : ''}
                        {shortRoom(st ? map.roomById.get(st.room)?.name : '')}
                      </small>
                    </span>
                  </div>
                );
              })
            )}
          </div>
          <button className="mmt-tab" onClick={() => setListOpen((x) => !x)} aria-expanded={listOpen} aria-label={listOpen ? 'Collapse task list' : 'Expand task list'}>
            <MIcon name="chevron" size={18} />
          </button>
        </aside>
        <div className="mmt-screen">
          <div className="mmt-head">
            <span>{map.def.name}</span>
            <span className="mmt-legend" aria-hidden>
              <i className="you" /> You <i className="task" /> Task <i className="alert" /> Alarm
            </span>
          </div>
          <div className="mmt-map" ref={screenRef}>
            {box.w > 0 && <SchematicMap map={map} width={box.w} height={box.h} theme={theme} labels markers={markers} you={you} reducedMotion={reduced} />}
          </div>
          {tb !== null && (
            <div className="mmt-total">
              <span>Total tasks completed</span>
              <Bar value={tb} color={theme === 'killer' ? '#ff4040' : undefined} height={28} label="Total tasks completed" />
            </div>
          )}
        </div>
        <nav className="mmt-side" aria-label="Tablet">
          <button className="mmt-key" onClick={onClose} aria-label="Close tablet">
            <MIcon name="close" size={20} />
          </button>
          <button className="mmt-key" onClick={onStats} aria-label="Show match statistics">
            <MIcon name="stats" size={20} />
          </button>
          {onSabotage && (
            <button className="mmt-key red" onClick={onSabotage} aria-label="Sabotage panel">
              <MIcon name="bolt" size={20} />
            </button>
          )}
          <button className="mmt-key" onClick={onMenu} aria-label="Open settings">
            <MIcon name="gear" size={20} />
          </button>
          {vp.w > 0 && <span className="mmt-led" aria-hidden />}
        </nav>
      </div>
    </Presence>
  );
}

export function StatsBody({ snap }: { snap: Snapshot }) {
  const prefs = useMystery((s) => s.prefs);
  const tc = teamColors(prefs.colorblind !== 'none');
  const st = snap.stats;
  const you = snap.you;
  return (
    <div className="mm-stats">
      {st.timeLeft !== null && (
        <div className="mm-stats-row">
          <span className="mm-label">Time left</span> <b>{fmtTime(st.timeLeft)}</b>
        </div>
      )}
      {st.crew && (
        <section>
          <h4>Your progress</h4>
          <div className="mm-stats-row">
            <span>
              {st.crew.myDone}/{st.crew.myTotal} steps
            </span>
            <span className="mm-muted">Emergency meetings left: {st.crew.meetingsLeft}</span>
          </div>
          <Bar value={st.crew.myTotal ? st.crew.myDone / st.crew.myTotal : 1} color="#ffd426" />
          {st.taskBar !== null && (
            <>
              <h4 style={{ marginTop: 12 }}>Crew evaluation</h4>
              <Bar value={st.taskBar} color={prefs.colorblind !== 'none' ? '#38bdf8' : undefined} height={14} />
              <div style={{ textAlign: 'right' }} className="mm-muted">
                <Tick value={Math.round(st.taskBar * 100)} />% complete
              </div>
            </>
          )}
          {st.crew.byLength && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
              {(['common', 'short', 'long'] as const).map((k) => (
                <div key={k}>
                  <div className="mm-label">{k}</div>
                  <Bar value={st.crew!.byLength![k]} height={8} />
                </div>
              ))}
            </div>
          )}
          {st.crew.byRoom && (
            <div style={{ marginTop: 10 }}>
              <div className="mm-label">By area (least done first)</div>
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
        <section className="mm-stats-red">
          <h4 style={{ color: tc.murderers }}>Murderer intel</h4>
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
              <Bar value={st.taskBar} color="#ff4040" />
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
        <h4>Players</h4>
        <div className="mm-stats-players">
          {snap.players.map((p, i) => (
            <div key={p.id} className="mm-stats-player mm-nocase" style={{ opacity: p.alive ? 1 : 0.5, ['--i' as string]: i }}>
              <span>
                <span className="dot" style={{ background: colorHex(p.cosmetics.color) }} /> {p.name}
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
