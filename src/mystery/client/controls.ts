/**
 * Maps input actions (keys, buttons, gamepad) to game actions using the
 * current interaction context.
 */
import { getMap } from '../core/maps';
import { PING_COOLDOWN, pingSpot } from '../core/match';
import { DEFAULT_KEYS } from './prefs';
import { computeContext, type Context } from './context';
import { Input, type InputAction } from './input';
import { runtime } from './runtime';
import { sfx } from '../audio/sfx';
import { isFixStation, useMystery } from './store';

export const input = new Input({ ...DEFAULT_KEYS });

export let currentContext: Context = computeContext(null, getMap('lobby'), null, true);

export function refreshContext(): Context {
  const st = useMystery.getState();
  const room = st.room;
  if (!room) return currentContext;
  const lobby = room.stage === 'lobby' || room.stage === 'countdown';
  currentContext = computeContext(st.snap, runtime.map(), room.settings, lobby || !st.snap);
  return currentContext;
}

type UiHooks = {
  openWardrobe(): void;
  openSettings(): void;
  openSabotage(): void;
  openChat(): void;
  openMenu(): void;
  setHolding(station: string | null): void;
};
let ui: UiHooks = {
  openWardrobe: () => {},
  openSettings: () => {},
  openSabotage: () => {},
  openChat: () => {},
  openMenu: () => {},
  setHolding: () => {},
};
export function bindUi(h: Partial<UiHooks>): void {
  ui = { ...ui, ...h };
}

/** Context "Use" — tasks, facilities, fixes, pickups, lobby stations. */
export function doUse(): void {
  const st = useMystery.getState();
  const c = currentContext;
  const u = c.use;
  if (!u) return;
  switch (u.kind) {
    case 'wardrobe':
      return ui.openWardrobe();
    case 'laptop':
      return ui.openSettings();
    case 'task':
    case 'fake':
      st.act({ a: 'task.open', station: u.id });
      st.setTask(u.id);
      return;
    case 'fix':
      st.setTask(u.id);
      return;
    case 'critical':
      st.act({ a: 'fix', station: u.id, on: true });
      ui.setHolding(u.id);
      return;
    case 'emergency':
      sfx.play('button');
      st.act({ a: 'emergency' });
      return;
    case 'facility':
      st.act({ a: 'use', facility: u.station as 'admin' | 'cams' | 'vitals' | 'doorlog' });
      return;
    case 'gun':
      st.act({ a: 'gun.pickup' });
      return;
    case 'battery':
      st.act({ a: 'battery.pickup', id: u.id });
      return;
  }
}

/** "Look here": at the mouse in 2D, else straight ahead of the camera / player. */
export function doPing(): void {
  const st = useMystery.getState();
  const snap = st.snap;
  if (!snap || snap.phase !== 'play' || snap.you.inVent) return;
  const me = snap.players.find((p) => p.id === snap.you.id);
  if (me?.ping && me.ping.age < PING_COOLDOWN) return;
  const from = runtime.local.pos;
  const yaw = runtime.cameraYaw ?? runtime.local.facing;
  const aim = runtime.cursorWorld ?? { x: from.x + Math.cos(yaw) * 5, y: from.y + Math.sin(yaw) * 5 };
  const spot = pingSpot(runtime.map(), from, aim, snap.you.alive ? new Set(snap.sabotage.closedDoors) : undefined);
  sfx.play('ping', spot);
  st.act({ a: 'ping', x: spot.x, y: spot.y });
}

export function doAction(a: InputAction): void {
  const st = useMystery.getState();
  const snap = st.snap;
  const c = currentContext;
  if (a === 'menu') return ui.openMenu();
  if (st.taskStation && !isFixStation(st.taskStation) && a !== 'use') return;
  switch (a) {
    case 'use':
      if (st.taskStation) return;
      return doUse();
    case 'kill':
      if (!snap) return;
      if (snap.you.role === 'poisoner' && c.kill) return st.act({ a: 'poison', target: c.kill });
      if (c.kill) return st.act({ a: 'kill', target: c.kill });
      if (snap.you.role === 'murderer' && st.room?.settings.knifeThrow && snap.you.killCd <= 0) return st.act({ a: 'throw', dir: runtime.local.facing });
      return;
    case 'shoot':
      if (c.shoot) st.act({ a: 'shoot', target: c.shoot });
      return;
    case 'report':
      if (c.inspect && snap?.you.role === 'detective') {
        st.act({ a: 'inspect', body: c.inspect });
        return;
      }
      if (c.report) st.act({ a: 'report', body: c.report });
      return;
    case 'vent':
      if (!snap) return;
      if (snap.you.inVent) return st.act({ a: 'vent.exit' });
      if (c.vent) st.act({ a: 'vent.enter', vent: c.vent });
      return;
    case 'sabotage':
      return ui.openSabotage();
    case 'map':
      return st.toggleMap();
    case 'tasks':
      return st.toggleStats();
    case 'flashlight':
      if (snap) st.act({ a: 'flashlight', on: !snap.you.flashlightOn });
      return;
    case 'chat':
      return ui.openChat();
    case 'ping':
      return doPing();
    case 'emote':
    case 'emote1':
    case 'emote2':
    case 'emote3':
    case 'emote4': {
      const emotes = st.prefs.cosmetics.emotes;
      const idx = a === 'emote' ? 0 : Number(a.slice(-1)) - 1;
      const id = emotes[idx] ?? emotes[0] ?? 'wave';
      sfx.play('emote');
      if (st.room?.stage === 'lobby' || st.room?.stage === 'countdown') st.send({ t: 'lobby.emote', id });
      else st.act({ a: 'emote', id });
      return;
    }
    default:
      return;
  }
}

let wired = false;
export function wireInput(): () => void {
  if (wired) return () => {};
  wired = true;
  input.keys = useMystery.getState().prefs.keys;
  const unsubPrefs = useMystery.subscribe((s) => (input.keys = s.prefs.keys));
  const detach = input.attach(window);
  const off = input.onAction(doAction);
  const keyup = (e: KeyboardEvent) => {
    if (e.code === input.keys.use || e.code === 'Space') ui.setHolding(null);
  };
  window.addEventListener('keyup', keyup);
  return () => {
    wired = false;
    unsubPrefs();
    detach();
    off();
    window.removeEventListener('keyup', keyup);
  };
}
