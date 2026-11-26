/**
 * Freeplay & tutorial: practise any map / mode / role alone against dummies
 * that stand still, with a coach that ticks off goals as you complete them.
 */
import { useEffect, useRef, useState } from 'react';
import { availableMaps, getMap } from '../core/maps';
import { ROLES } from '../core/roles';
import type { MapId, ModeId, RoleId } from '../core/types';
import { runtime } from '../client/runtime';
import { useMystery } from '../client/store';
import { MIcon, Modal } from './common';
import { MapThumb } from './MapThumb';

const PRACTICE_ROLES: RoleId[] = ['crewmate', 'murderer', 'sheriff', 'detective', 'medic', 'engineer', 'poisoner', 'tracker', 'lookout'];

export function FreeplayScreen() {
  const setScreen = useMystery((s) => s.setScreen);
  const startFreeplay = useMystery((s) => s.startFreeplay);
  const [map, setMap] = useState<MapId>('hq');
  const [mode, setMode] = useState<ModeId>('classic');
  const [role, setRole] = useState<RoleId>('crewmate');
  return (
    <Modal title="Freeplay & tutorial" onClose={() => setScreen('title')} wide>
      <p className="mm-muted" style={{ marginTop: 0 }}>
        Walk any map alone, try every task, and practise a role on dummies that stand still. A coach walks you through the basics. Nothing here counts toward your stats.
      </p>
      <h4 className="mm-muted" style={{ fontSize: '0.78em', letterSpacing: '0.08em' }}>
        MAP
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {availableMaps().map((m) => (
          <button key={m.id} className="mm-btn" onClick={() => setMap(m.id as MapId)} style={{ flexDirection: 'column', padding: 8, borderColor: map === m.id ? 'var(--mm-accent2)' : undefined }}>
            <MapThumb map={getMap(m.id as MapId)} height={70} />
            <b>{m.name}</b>
          </button>
        ))}
      </div>
      <h4 className="mm-muted" style={{ fontSize: '0.78em', letterSpacing: '0.08em' }}>
        LIGHTING
      </h4>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['classic', 'lightsout'] as ModeId[]).map((m) => (
          <button key={m} className={`mm-btn ${mode === m ? 'mm-btn-primary' : ''}`} onClick={() => setMode(m)}>
            {m === 'classic' ? 'Bright (Classic)' : 'Dark (Lights Out)'}
          </button>
        ))}
      </div>
      <h4 className="mm-muted" style={{ fontSize: '0.78em', letterSpacing: '0.08em' }}>
        ROLE TO PRACTISE
      </h4>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRACTICE_ROLES.map((r) => (
          <button key={r} className={`mm-btn ${role === r ? 'mm-btn-primary' : ''}`} onClick={() => setRole(r)} style={{ color: role === r ? undefined : ROLES[r].color }}>
            {ROLES[r].name}
          </button>
        ))}
      </div>
      <div className="mm-muted" style={{ margin: '8px 0 12px' }}>
        {ROLES[role].help}
      </div>
      <button className="mm-btn mm-btn-primary" style={{ width: '100%', minHeight: 52 }} onClick={() => startFreeplay({ map, mode, role })}>
        <MIcon name="play" /> Start practice
      </button>
    </Modal>
  );
}

interface Step {
  id: string;
  text: string;
}

function stepsFor(role: RoleId, mode: ModeId): Step[] {
  const s: Step[] = [
    { id: 'move', text: 'Walk around — WASD / arrows, or the left-thumb joystick' },
    { id: 'map', text: 'Open the map (Tab or the map icon) to find your yellow task markers' },
    { id: 'task', text: 'Walk to a glowing task and press E (or Use) — finish the mini-game' },
  ];
  if (mode === 'lightsout' && ROLES[role].team !== 'murderers') {
    s.push({ id: 'flash', text: 'Toggle your flashlight with F — watch the battery!' });
    s.push({ id: 'recharge', text: 'Stand at a glowing yellow recharge station to refill the battery' });
  }
  if (role === 'murderer' || role === 'poisoner') {
    s.push({ id: 'kill', text: role === 'poisoner' ? 'Poison a dummy (Q) — they drop a few seconds later' : 'Eliminate a dummy with your knife (Q)' });
    s.push({ id: 'vent', text: 'Hop into a vent (V), travel, and climb out' });
    s.push({ id: 'sabotage', text: 'Open the sabotage map (X) and cut the lights' });
  } else if (role === 'engineer') {
    s.push({ id: 'vent', text: 'Engineers can vent too — try one (V)' });
  } else if (role === 'detective') {
    s.push({ id: 'meeting', text: 'Press the red emergency button in the meeting room' });
  } else if (role === 'medic') {
    s.push({ id: 'shield', text: 'Shield a dummy with your ability button' });
  } else if (role === 'tracker') {
    s.push({ id: 'track', text: 'Tag a dummy with Track and follow the arrow' });
  } else if (role === 'lookout') {
    s.push({ id: 'cam', text: 'Place your portable camera somewhere sneaky' });
  } else {
    s.push({ id: 'meeting', text: 'Press the red emergency button in the meeting room to call a meeting' });
  }
  return s;
}

export function TutorialCoach() {
  const room = useMystery((s) => s.room);
  const snap = useMystery((s) => s.snap);
  const showMap = useMystery((s) => s.showMap);
  const leave = useMystery((s) => s.leave);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(true);
  const walked = useRef(0);
  const last = useRef<{ x: number; y: number } | null>(null);
  const role = room?.practice ?? 'crewmate';
  const mode = room?.settings.mode ?? 'classic';
  const steps = stepsFor(role, mode);
  const mark = (id: string) => setDone((d) => (d.has(id) ? d : new Set(d).add(id)));
  useEffect(() => {
    const t = setInterval(() => {
      const p = runtime.local.pos;
      if (last.current) walked.current += Math.hypot(p.x - last.current.x, p.y - last.current.y);
      last.current = { ...p };
      if (walked.current > 5) mark('move');
    }, 200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (showMap) mark('map');
  }, [showMap]);
  useEffect(() => {
    if (!snap) return;
    const y = snap.you;
    if (y.tasks.some((t) => t.step > 0)) mark('task');
    if (!y.flashlightOn) mark('flash');
    if (y.battery > 0.999 && done.has('flash')) mark('recharge');
    if ((snap.stats.murderers?.myKills ?? 0) > 0 || snap.events.some((e) => e.type === 'poison' && e.actor === y.id)) mark('kill');
    if (y.inVent) mark('vent');
    if (snap.sabotage.active) mark('sabotage');
    if (snap.phase === 'meeting') mark('meeting');
    if (y.shieldTarget) mark('shield');
    if (y.trackTarget) mark('track');
    if (y.portableCam) mark('cam');
  }, [snap, done]);
  if (!room?.practice) return null;
  const all = steps.every((s) => done.has(s.id));
  return (
    <div className="mm-safe" style={{ position: 'absolute', left: 0, top: 'max(250px, 32vh)', zIndex: 12, pointerEvents: 'none', maxWidth: 'min(360px, 92vw)' }}>
      <div className="mm-panel mm-anim-rise" style={{ padding: 12, pointerEvents: 'auto', marginBottom: 'max(0px, calc(env(safe-area-inset-bottom)))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ flex: 1 }}>
            🎓 Practice: {ROLES[role].name} ({steps.filter((st) => done.has(st.id)).length}/{steps.length})
          </b>
          <button className="mm-btn" style={{ minHeight: 32, padding: '2px 10px' }} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
        {open && (
          <ol style={{ margin: '8px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.88em' }}>
            {steps.map((s) => (
              <li key={s.id} style={{ opacity: done.has(s.id) ? 0.55 : 1, textDecoration: done.has(s.id) ? 'line-through' : undefined }}>
                {done.has(s.id) ? '✓ ' : ''}
                {s.text}
              </li>
            ))}
          </ol>
        )}
        {all && <div style={{ marginTop: 8, color: '#4ade80', fontWeight: 800 }}>All done — you’re ready for a real match!</div>}
        <button className="mm-btn" style={{ marginTop: 8, minHeight: 36, width: '100%' }} onClick={leave}>
          End practice
        </button>
      </div>
    </div>
  );
}
