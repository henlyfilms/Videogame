/**
 * React-facing state for Marion Mystery (zustand). Realtime per-frame data
 * (interpolated positions, predicted local position) lives in `runtime.ts`
 * so 60 fps rendering never re-renders React.
 */
import { create } from 'zustand';
import type { Action } from '../core/match';
import type { Snapshot } from '../core/project';
import type { Settings } from '../core/settings';
import type { ChatMsg, ViewMode } from '../core/types';
import type { ClientMsg, RoomInfo, RoomListing, ServerMsg } from '../net/protocol';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { runtime } from './runtime';
import { defaultServerUrl, LocalTransport, WsTransport, type ConnState, type Transport } from './transport';

export type Screen = 'title' | 'play' | 'join' | 'browse' | 'settings' | 'profile' | 'wardrobe' | 'room' | 'howto';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

export interface MysteryState {
  screen: Screen;
  prefs: Prefs;
  conn: ConnState;
  transport: 'ws' | 'local' | null;
  pid: string;
  room: RoomInfo | null;
  /** performance.now() when the last room update arrived (for countdowns). */
  roomAt: number;
  snap: Snapshot | null;
  chat: ChatMsg[];
  listing: RoomListing[];
  toasts: Toast[];
  error: string | null;
  /** View locked at match start (host policy or player's choice). */
  matchView: ViewMode | null;
  /** UI overlays */
  taskStation: string | null;
  showMap: boolean;
  showStats: boolean;
  setScreen(s: Screen): void;
  setPrefs(p: Partial<Prefs>): void;
  connectOnline(url?: string): void;
  startSolo(): void;
  createRoom(settings?: Partial<Settings>): void;
  joinRoom(code: string): void;
  listRooms(): void;
  leave(): void;
  send(msg: ClientMsg): void;
  act(action: Action): void;
  toast(text: string, tone?: Toast['tone']): void;
  setTask(station: string | null): void;
  toggleMap(v?: boolean): void;
  toggleStats(v?: boolean): void;
}

let transport: Transport | null = null;
let toastSeq = 0;
const SESSION_KEY = 'marion-mystery:session';

function saveSession(code: string, pid: string, secret: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code, pid, secret }));
  } catch {
    /* ignore */
  }
}
function loadSession(): { code: string; pid: string; secret: string } | null {
  try {
    const s = sessionStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function detectPlatform(): 'mac' | 'windows' | 'iphone' | 'android' | 'linux' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  if (/Mac/.test(ua)) return 'mac';
  if (/Win/.test(ua)) return 'windows';
  if (/Linux/.test(ua)) return 'linux';
  return 'other';
}

export const useMystery = create<MysteryState>((set, get) => {
  let pendingAfterHello: ClientMsg[] = [];
  let currentCode = '';
  let lastWelcome: [string, string] | null = null;

  const handlers = {
    onState: (s: ConnState) => set({ conn: s }),
    onOpen: () => {
      const p = get().prefs;
      const sess = loadSession();
      transport?.send({
        t: 'hello',
        v: 1,
        name: p.name || 'Berry',
        platform: detectPlatform(),
        kind: 'human',
        cosmetics: p.cosmetics,
        view: p.view,
        resume: transport.kind === 'ws' && sess ? sess : undefined,
      });
      for (const m of pendingAfterHello.splice(0)) transport?.send(m);
    },
    onMessage: (m: ServerMsg) => onServer(m),
  };

  function onServer(m: ServerMsg) {
    switch (m.t) {
      case 'welcome':
        if (m.pid) {
          set({ pid: m.pid });
          runtime.pid = m.pid;
        }
        if (m.pid) lastWelcome = [m.pid, m.secret];
        if (m.pid && currentCode && transport?.kind === 'ws') saveSession(currentCode, m.pid, m.secret);
        break;
      case 'room': {
        const prev = get().room;
        currentCode = m.room.code;
        if (lastWelcome && transport?.kind === 'ws') saveSession(m.room.code, lastWelcome[0], lastWelcome[1]);
        const patch: Partial<MysteryState> = { room: m.room, roomAt: performance.now(), screen: 'room', error: null };
        if (m.room.stage === 'match' && prev?.stage !== 'match') {
          const pol = m.room.settings.view;
          patch.matchView = pol === 'choice' ? get().prefs.view : pol;
          patch.chat = [];
          patch.snap = null;
          runtime.resetMatch();
        }
        if (m.room.stage === 'lobby' && prev && prev.stage !== 'lobby') {
          patch.snap = null;
          patch.matchView = null;
          patch.taskStation = null;
          runtime.resetLobby();
        }
        set(patch);
        break;
      }
      case 'lobby':
        runtime.onLobby(m);
        break;
      case 'snap': {
        runtime.onSnapshot(m.s, get().pid);
        const add = m.s.chat;
        const patch: Partial<MysteryState> = { snap: m.s };
        if (add.length) patch.chat = [...get().chat, ...add].slice(-120);
        if (get().taskStation && (m.s.phase !== 'play' || (m.s.you.activeTask !== get().taskStation && !isFixStation(get().taskStation)))) {
          // Server closed our task (meeting, death...).
          if (m.s.phase !== 'play') patch.taskStation = null;
        }
        set(patch);
        if (m.s.result) recordResult(m.s);
        break;
      }
      case 'nack':
        if (['kill', 'shoot', 'report', 'emergency', 'sabotage', 'vote', 'vent.enter', 'shield', 'track', 'poison', 'throw', 'blackout'].includes(m.a))
          get().toast(prettyReason(m.reason), 'bad');
        break;
      case 'error':
        set({ error: m.msg });
        get().toast(m.msg, 'bad');
        if (m.code === 'nojoin' && !get().room) set({ screen: get().screen === 'room' ? 'play' : get().screen });
        break;
      case 'kicked':
        clearSession();
        set({ room: null, snap: null, screen: 'play', error: m.reason });
        get().toast(m.reason, 'bad');
        break;
      case 'left':
        clearSession();
        set({ room: null, snap: null });
        break;
      case 'list':
        set({ listing: m.rooms });
        break;
      case 'pong':
        runtime.onPong(m.n);
        break;
    }
  }

  let recordedFor = '';
  function recordResult(s: Snapshot) {
    const key = `${get().room?.code}-${s.result!.endedAt}`;
    if (recordedFor === key) return;
    recordedFor = key;
    const p = get().prefs;
    const st = { ...p.stats, byRole: { ...p.stats.byRole }, byMode: { ...p.stats.byMode } };
    const won = s.result!.winners.includes(get().pid);
    st.games++;
    if (won) st.wins++;
    const r = (st.byRole[s.you.role] ??= { games: 0, wins: 0 });
    st.byRole[s.you.role] = { games: r.games + 1, wins: r.wins + (won ? 1 : 0) };
    const md = st.byMode[s.mode] ?? { games: 0, wins: 0 };
    st.byMode[s.mode] = { games: md.games + 1, wins: md.wins + (won ? 1 : 0) };
    if (s.you.alive) st.survived++;
    if (s.result!.mvp === get().pid) st.mvps++;
    st.tasks += s.you.tasks.filter((t) => t.done && !t.fake).length;
    st.kills += s.stats.murderers?.myKills ?? 0;
    get().setPrefs({ stats: st });
  }

  function ensure(kind: 'ws' | 'local', url?: string) {
    if (transport && transport.kind === kind) return;
    transport?.close();
    runtime.bindSend((m) => transport?.send(m));
    if (kind === 'local') transport = new LocalTransport(handlers);
    else transport = new WsTransport(url || get().prefs.serverUrl || defaultServerUrl(), handlers);
    set({ transport: kind });
  }

  function sendOrQueue(m: ClientMsg) {
    if (!transport) return;
    if (get().conn === 'open' || get().conn === 'local') transport.send(m);
    else pendingAfterHello.push(m);
  }

  return {
    screen: 'title',
    prefs: loadPrefs(),
    conn: 'idle',
    transport: null,
    pid: '',
    room: null,
    roomAt: 0,
    snap: null,
    chat: [],
    listing: [],
    toasts: [],
    error: null,
    matchView: null,
    taskStation: null,
    showMap: false,
    showStats: false,
    setScreen: (s) => set({ screen: s, error: null }),
    setPrefs: (p) => {
      const prefs = { ...get().prefs, ...p };
      savePrefs(prefs);
      set({ prefs });
      if (get().room) {
        if (p.cosmetics) transport?.send({ t: 'lobby.cos', cosmetics: prefs.cosmetics });
        if (p.name) transport?.send({ t: 'lobby.name', name: prefs.name });
        if (p.view) transport?.send({ t: 'lobby.view', view: prefs.view });
      }
    },
    connectOnline: (url) => ensure('ws', url),
    startSolo: () => {
      ensure('local');
      pendingAfterHello = [];
      sendOrQueue({ t: 'create', settings: { bots: 7, privacy: 'code' } });
    },
    createRoom: (settings) => {
      ensure('ws');
      sendOrQueue({ t: 'create', settings });
    },
    joinRoom: (code) => {
      ensure('ws');
      currentCode = code.toUpperCase();
      sendOrQueue({ t: 'join', code });
    },
    listRooms: () => {
      ensure('ws');
      sendOrQueue({ t: 'list' });
    },
    leave: () => {
      transport?.send({ t: 'leave' });
      clearSession();
      if (transport?.kind === 'local') {
        transport.close();
        transport = null;
      }
      runtime.resetLobby();
      set({ room: null, snap: null, screen: 'title', matchView: null, taskStation: null, chat: [], transport: transport?.kind ?? null });
    },
    send: (m) => sendOrQueue(m),
    act: (action) => transport?.send({ t: 'act', action }),
    toast: (text, tone = 'info') => {
      const id = ++toastSeq;
      set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] });
      setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2600);
    },
    setTask: (station) => {
      const cur = get().taskStation;
      if (cur && !station && !isFixStation(cur)) transport?.send({ t: 'act', action: { a: 'task.close' } });
      set({ taskStation: station });
    },
    toggleMap: (v) => set({ showMap: v ?? !get().showMap }),
    toggleStats: (v) => set({ showStats: v ?? !get().showStats }),
  };
});

export function isFixStation(id: string | null): boolean {
  return !!id && (id.startsWith('lightsPanel') || id.startsWith('commsPanel'));
}

function prettyReason(r: string): string {
  const map: Record<string, string> = {
    cooldown: 'Not ready yet',
    'out of range': 'Too far away',
    'too far': 'Too far away',
    'no line of sight': 'No clear line of sight',
    'button cooling down': 'The button is cooling down',
    'no meetings left': 'No emergency meetings left',
    'emergency in progress': 'Fix the emergency first!',
    teammate: 'That’s your teammate',
    'sabotage already active': 'A sabotage is already running',
  };
  return map[r] ?? r.charAt(0).toUpperCase() + r.slice(1);
}
