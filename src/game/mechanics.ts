/**
 * Room mechanics as a pure reducer over MarionEvents. Player actions, the live
 * sim, replays and websocket streams all flow through `reduceMechanics`, which
 * keeps every mode consistent and makes the rules unit-testable.
 */
import type {
  ArcadeMode,
  ArcadeResultRow,
  ArcadeTeam,
  ClipBin,
  MailSlot,
  MarionEvent,
  PlannerLane,
  RelayModel,
  SkillId,
} from '../adapters/events';
import { PLANNER_SEED, VAULT_SEED } from './content';

export interface MailItem {
  id: string;
  from: string;
  subject: string;
  hint: MailSlot;
  slot: MailSlot | null;
}

export interface Draft {
  id: string;
  mailId: string;
  subject: string;
  words: number;
  at: number;
}

export interface Reel {
  id: string;
  title: string;
  platform: 'reel' | 'youtube';
}

export interface Insight {
  id: string;
  reelId: string;
  text: string;
  buff: 'speed' | 'accuracy';
}

export interface Clip {
  id: string;
  name: string;
  quality: 'good' | 'bad';
}

export interface PlannerCard {
  id: string;
  lane: PlannerLane;
  title: string;
  done: boolean;
}

export interface VaultItem {
  id: string;
  label: string;
  kind: 'capsule' | 'chat' | 'task';
  deleted: boolean;
  restored: boolean;
}

export interface RelayCommand {
  id: string;
  kind: 'wave' | 'polaroid';
  text: string;
  status: 'queued' | 'dispatched' | 'done';
  model?: RelayModel;
  botId?: string;
}

export interface Task {
  id: string;
  botId: string;
  title: string;
  status: 'open' | 'done';
  at: number;
}

export interface CustomBotSpec {
  botId: string;
  name: string;
  job: string;
  shape: string;
  color: string;
  glowColor: string;
}

export interface Huddle {
  id: string;
  botIds: string[];
  topic: string;
  at: number;
}

export interface ArcadeStanding {
  wins: number;
  games: number;
  mvps: number;
}

export interface ArcadeMatchResult {
  id: string;
  at: number;
  mode: ArcadeMode;
  map: string;
  winningTeam: ArcadeTeam;
  reason: string;
  mvp: string | null;
  results: ArcadeResultRow[];
}

export interface ArcadeLiveMatch {
  id: string;
  mode: ArcadeMode;
  map: string;
  players: number;
  bots: string[];
  at: number;
}

export interface ArcadeState {
  /** Wins / games / MVPs per Marion bot id (and 'you' for the player). */
  leaderboard: Record<string, ArcadeStanding>;
  /** Most recent match results, newest last (capped at ARCADE_RECENT). */
  recent: ArcadeMatchResult[];
  /** Match currently being played (not persisted). */
  live: ArcadeLiveMatch | null;
  /** Bots currently queued/playing at the cabinets (not persisted). */
  players: string[];
}

export interface MechanicsState {
  mail: {
    inbox: MailItem[];
    sorted: Record<MailSlot, MailItem[]>;
    drafts: Draft[];
    sent: number;
    cleared: number;
    misSorted: number;
  };
  media: { queue: Reel[]; insights: Insight[]; llm: 'local' | 'cloud'; distilled: number };
  cutting: { queue: Clip[]; keepers: number; outtakes: number; correct: number; wrong: number; render: number; green: boolean; greenBuilds: number };
  life: { cards: PlannerCard[]; vault: VaultItem[]; dictating: boolean; transcripts: string[] };
  engine: { commands: RelayCommand[]; polaroids: number };
  foundry: { skills: SkillId[]; customBots: CustomBotSpec[] };
  command: { releases: number; version: string; tasks: Task[]; huddles: Huddle[]; brain: number; delegations: number; completed: number };
  progress: { streak: number; lastCheckDay: string | null; checkedTotal: number; polish: number };
  arcade: ArcadeState;
}

export const MAX_QUEUE = 12;
export const MAX_INBOX = 16;
export const NOISE_PILEUP = 6;
export const MAX_CUSTOM = 4;
export const RENDER_CORRECT = 0.25;
export const RENDER_WRONG = 0.05;
export const ARCADE_RECENT = 10;
/** The id the human player uses on the arcade leaderboard. */
export const ARCADE_YOU = 'you';

export function initialArcade(): ArcadeState {
  return { leaderboard: {}, recent: [], live: null, players: [] };
}

/** Leaderboard rows sorted by wins, then win rate, then games. */
export function arcadeRanking(a: Pick<ArcadeState, 'leaderboard'>): ({ id: string } & ArcadeStanding)[] {
  return Object.entries(a.leaderboard)
    .map(([id, st]) => ({ id, ...st }))
    .sort((x, y) => y.wins - x.wins || y.wins / Math.max(1, y.games) - x.wins / Math.max(1, x.games) || y.games - x.games || x.id.localeCompare(y.id));
}

export function initialMechanics(): MechanicsState {
  return {
    mail: { inbox: [], sorted: { action: [], fyi: [], noise: [] }, drafts: [], sent: 0, cleared: 0, misSorted: 0 },
    media: { queue: [], insights: [], llm: 'local', distilled: 0 },
    cutting: { queue: [], keepers: 0, outtakes: 0, correct: 0, wrong: 0, render: 0, green: false, greenBuilds: 0 },
    life: {
      cards: PLANNER_SEED.map((c, i) => ({ id: `seed_${i}`, lane: c.lane, title: c.title, done: false })),
      vault: VAULT_SEED.map((v, i) => ({ id: `vault_seed_${i}`, label: v.label, kind: v.kind, deleted: true, restored: false })),
      dictating: false,
      transcripts: [],
    },
    engine: { commands: [], polaroids: 0 },
    foundry: { skills: [], customBots: [] },
    command: { releases: 0, version: '1.0.0', tasks: [], huddles: [], brain: 0, delegations: 0, completed: 0 },
    progress: { streak: 0, lastCheckDay: null, checkedTotal: 0, polish: 0 },
    arcade: initialArcade(),
  };
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prevDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d - 1, 12).getTime());
}

export function bumpVersion(v: string): string {
  const [a = 1, b = 0, c = 0] = v.split('.').map((x) => parseInt(x, 10) || 0);
  return `${a}.${b}.${c + 1}`;
}

/** Verified (Render Green) builds waiting to ship through the Release Chute. */
export function shippableBuilds(s: MechanicsState): number {
  return Math.max(0, s.cutting.greenBuilds - s.command.releases);
}

/** Throughput multiplier applied to the whole HQ by slotted Universal Skills. */
export function throughputFor(skills: readonly SkillId[], polish = 0): number {
  return 1 + skills.length * 0.12 + polish * 0.03;
}

const cap = <T>(arr: T[], n: number): T[] => (arr.length > n ? arr.slice(arr.length - n) : arr);

function removeMail(s: MechanicsState['mail'], id: string): { mail: MechanicsState['mail']; item: MailItem | null } {
  let item: MailItem | null = null;
  const take = (list: MailItem[]) =>
    list.filter((m) => {
      if (m.id === id) {
        item = m;
        return false;
      }
      return true;
    });
  const mail = {
    ...s,
    inbox: take(s.inbox),
    sorted: { action: take(s.sorted.action), fyi: take(s.sorted.fyi), noise: take(s.sorted.noise) },
  };
  return { mail, item };
}

export function reduceMechanics(s: MechanicsState, ev: MarionEvent): MechanicsState {
  switch (ev.type) {
    // ------------------------------------------------------------ mailroom
    case 'mail.received': {
      const p = ev.payload;
      if (s.mail.inbox.some((m) => m.id === p.mailId)) return s;
      let inbox = [...s.mail.inbox, { id: p.mailId, from: p.from, subject: p.subject, hint: p.hint, slot: null }];
      let noise = s.mail.sorted.noise;
      // Inbox pileup: oldest overflow spills into Noise.
      if (inbox.length > MAX_INBOX) {
        const spill = inbox.slice(0, inbox.length - MAX_INBOX).map((m) => ({ ...m, slot: 'noise' as const }));
        inbox = inbox.slice(inbox.length - MAX_INBOX);
        noise = [...noise, ...spill];
      }
      return { ...s, mail: { ...s.mail, inbox, sorted: { ...s.mail.sorted, noise } } };
    }
    case 'mail.sorted': {
      const { mail, item } = removeMail(s.mail, ev.payload.mailId);
      if (!item) return s;
      const slot = ev.payload.slot;
      const sorted = { ...mail.sorted, [slot]: [...mail.sorted[slot], { ...(item as MailItem), slot }] };
      const misSorted = s.mail.misSorted + ((item as MailItem).hint !== slot ? 1 : 0);
      return { ...s, mail: { ...mail, sorted, misSorted } };
    }
    case 'mail.pending_approval': {
      const p = ev.payload;
      if (s.mail.drafts.some((d) => d.id === p.draftId)) return s;
      const { mail } = removeMail(s.mail, p.mailId);
      return {
        ...s,
        mail: { ...mail, drafts: [...mail.drafts, { id: p.draftId, mailId: p.mailId, subject: p.subject, words: p.words, at: ev.ts }] },
      };
    }
    case 'mail.sent': {
      if (!s.mail.drafts.some((d) => d.id === ev.payload.draftId)) return s;
      return {
        ...s,
        mail: { ...s.mail, drafts: s.mail.drafts.filter((d) => d.id !== ev.payload.draftId), sent: s.mail.sent + 1 },
        command: { ...s.command, brain: s.command.brain + 1 },
      };
    }
    case 'mail.cleared': {
      const n = s.mail.sorted.noise.length;
      if (!n) return s;
      return { ...s, mail: { ...s.mail, sorted: { ...s.mail.sorted, noise: [] }, cleared: s.mail.cleared + n } };
    }
    // ------------------------------------------------------------ media vault
    case 'reel.received': {
      const p = ev.payload;
      if (s.media.queue.some((r) => r.id === p.reelId)) return s;
      return { ...s, media: { ...s.media, queue: cap([...s.media.queue, { id: p.reelId, title: p.title, platform: p.platform }], MAX_QUEUE) } };
    }
    case 'reel.distilled': {
      const p = ev.payload;
      return {
        ...s,
        media: {
          ...s.media,
          queue: s.media.queue.filter((r) => r.id !== p.reelId),
          insights: cap([...s.media.insights, { id: `ins_${ev.id}`, reelId: p.reelId, text: p.insight, buff: p.buff }], 30),
          distilled: s.media.distilled + 1,
        },
        command: { ...s.command, brain: s.command.brain + 1 },
      };
    }
    case 'settings.llm':
      return { ...s, media: { ...s.media, llm: ev.payload.mode } };
    // ------------------------------------------------------------ cutting room
    case 'clip.received': {
      const p = ev.payload;
      if (s.cutting.queue.some((c) => c.id === p.clipId)) return s;
      return { ...s, cutting: { ...s.cutting, queue: cap([...s.cutting.queue, { id: p.clipId, name: p.name, quality: p.quality }], MAX_QUEUE) } };
    }
    case 'clip.sorted': {
      const clip = s.cutting.queue.find((c) => c.id === ev.payload.clipId);
      if (!clip) return s;
      const bin: ClipBin = ev.payload.bin;
      const right = (bin === 'keeper') === (clip.quality === 'good');
      let render = (s.cutting.green ? 0 : s.cutting.render) + (right ? RENDER_CORRECT : RENDER_WRONG);
      let green = false;
      let greenBuilds = s.cutting.greenBuilds;
      if (render >= 1 - 1e-9) {
        render = 1;
        green = true;
        greenBuilds += 1;
      }
      return {
        ...s,
        cutting: {
          ...s.cutting,
          queue: s.cutting.queue.filter((c) => c.id !== clip.id),
          keepers: s.cutting.keepers + (bin === 'keeper' ? 1 : 0),
          outtakes: s.cutting.outtakes + (bin === 'outtake' ? 1 : 0),
          correct: s.cutting.correct + (right ? 1 : 0),
          wrong: s.cutting.wrong + (right ? 0 : 1),
          render,
          green,
          greenBuilds,
        },
      };
    }
    // ------------------------------------------------------------ life hub
    case 'planner.toggled': {
      const card = s.life.cards.find((c) => c.id === ev.payload.cardId);
      if (!card || card.done === ev.payload.done) return s;
      const cards = s.life.cards.map((c) => (c.id === card.id ? { ...c, done: ev.payload.done } : c));
      let progress = s.progress;
      if (ev.payload.done) {
        const day = dayKey(ev.ts);
        let streak = progress.streak;
        if (progress.lastCheckDay !== day) streak = progress.lastCheckDay === prevDay(day) ? streak + 1 : 1;
        const checkedTotal = progress.checkedTotal + 1;
        progress = { streak, lastCheckDay: day, checkedTotal, polish: Math.min(3, Math.floor(checkedTotal / 3)) };
      }
      return { ...s, life: { ...s.life, cards }, progress };
    }
    case 'planner.added': {
      const p = ev.payload;
      if (s.life.cards.some((c) => c.id === p.cardId)) return s;
      return { ...s, life: { ...s.life, cards: cap([...s.life.cards, { id: p.cardId, lane: p.lane, title: p.title, done: false }], 40) } };
    }
    case 'dictation.wave': {
      const p = ev.payload;
      if (p.source !== 'life') return s;
      if (p.active) return { ...s, life: { ...s.life, dictating: true } };
      let life = { ...s.life, dictating: false };
      if (p.transcript) {
        // Voice bubbles become tidy task cards.
        life = {
          ...life,
          transcripts: cap([...life.transcripts, p.transcript], 20),
          cards: cap([...life.cards, { id: `dict_${ev.id}`, lane: 'work', title: tidy(p.transcript), done: false }], 40),
        };
      }
      return { ...s, life };
    }
    case 'vault.archived': {
      const p = ev.payload;
      if (s.life.vault.some((v) => v.id === p.itemId)) return s;
      return { ...s, life: { ...s.life, vault: cap([...s.life.vault, { id: p.itemId, label: p.label, kind: p.kind, deleted: false, restored: false }], 40) } };
    }
    case 'vault.restored': {
      if (!s.life.vault.some((v) => v.id === ev.payload.itemId)) return s;
      return {
        ...s,
        life: { ...s.life, vault: s.life.vault.map((v) => (v.id === ev.payload.itemId ? { ...v, deleted: false, restored: true } : v)) },
      };
    }
    // ------------------------------------------------------------ engine & bridge
    case 'relay.queued': {
      const p = ev.payload;
      if (s.engine.commands.some((c) => c.id === p.commandId)) return s;
      return {
        ...s,
        engine: {
          commands: cap([...s.engine.commands, { id: p.commandId, kind: p.kind, text: p.text, status: 'queued' }], 30),
          polaroids: s.engine.polaroids + (p.kind === 'polaroid' ? 1 : 0),
        },
      };
    }
    case 'relay.dispatched': {
      const p = ev.payload;
      return {
        ...s,
        engine: {
          ...s.engine,
          commands: s.engine.commands.map((c) => (c.id === p.commandId ? { ...c, status: 'dispatched', model: p.model, botId: p.botId } : c)),
        },
      };
    }
    // ------------------------------------------------------------ command & tasks
    case 'task.created': {
      const p = ev.payload;
      if (s.command.tasks.some((t) => t.id === p.taskId)) return s;
      return { ...s, command: { ...s.command, tasks: cap([...s.command.tasks, { id: p.taskId, botId: p.botId, title: p.title, status: 'open', at: ev.ts }], 40) } };
    }
    case 'task.completed': {
      const p = ev.payload;
      const vault =
        p.deliverTo === 'life'
          ? cap([...s.life.vault, { id: `cap_${p.taskId}`, label: p.title, kind: 'capsule' as const, deleted: false, restored: false }], 40)
          : s.life.vault;
      return {
        ...s,
        command: {
          ...s.command,
          tasks: s.command.tasks.map((t) => (t.id === p.taskId ? { ...t, status: 'done' } : t)),
          completed: s.command.completed + 1,
          brain: s.command.brain + 1,
        },
        engine: { ...s.engine, commands: s.engine.commands.map((c) => (c.id === p.taskId ? { ...c, status: 'done' } : c)) },
        life: { ...s.life, vault },
      };
    }
    case 'bot.delegate':
      return { ...s, command: { ...s.command, delegations: s.command.delegations + 1 } };
    case 'group.huddle_start': {
      const p = ev.payload;
      if (s.command.huddles.some((h) => h.id === p.huddleId)) return s;
      return { ...s, command: { ...s.command, huddles: [...s.command.huddles, { id: p.huddleId, botIds: p.botIds, topic: p.topic, at: ev.ts }] } };
    }
    case 'group.huddle_end':
      return { ...s, command: { ...s.command, huddles: s.command.huddles.filter((h) => h.id !== ev.payload.huddleId) } };
    case 'release.shipped':
      return { ...s, command: { ...s.command, releases: s.command.releases + 1, version: ev.payload.version }, cutting: { ...s.cutting, green: false, render: s.cutting.green ? 0 : s.cutting.render } };
    // ------------------------------------------------------------ foundry
    case 'skill.slotted': {
      const { skillId, slotted } = ev.payload;
      const has = s.foundry.skills.includes(skillId);
      if (slotted === has) return s;
      return { ...s, foundry: { ...s.foundry, skills: slotted ? [...s.foundry.skills, skillId] : s.foundry.skills.filter((k) => k !== skillId) } };
    }
    case 'bot.spawned': {
      const p = ev.payload;
      if (s.foundry.customBots.length >= MAX_CUSTOM || s.foundry.customBots.some((b) => b.botId === p.botId)) return s;
      return { ...s, foundry: { ...s.foundry, customBots: [...s.foundry.customBots, { ...p }] } };
    }
    // ------------------------------------------------------------ arcade
    case 'arcade.player_joined': {
      const id = ev.payload.botId;
      if (s.arcade.players.includes(id)) return s;
      return { ...s, arcade: { ...s.arcade, players: cap([...s.arcade.players, id], 16) } };
    }
    case 'arcade.match_started': {
      const p = ev.payload;
      const players = Array.from(new Set([...s.arcade.players, ...p.bots])).slice(-16);
      return {
        ...s,
        arcade: { ...s.arcade, players, live: { id: p.matchId ?? ev.id, mode: p.mode, map: p.map, players: p.players, bots: [...p.bots], at: ev.ts } },
      };
    }
    case 'arcade.match_ended': {
      const p = ev.payload;
      const id = p.matchId ?? s.arcade.live?.id ?? ev.id;
      if (s.arcade.recent.some((r) => r.id === id)) return s; // once per match
      const leaderboard = { ...s.arcade.leaderboard };
      const seen = new Set<string>();
      for (const r of p.results) {
        if (seen.has(r.botId)) continue;
        seen.add(r.botId);
        const prev = leaderboard[r.botId] ?? { wins: 0, games: 0, mvps: 0 };
        leaderboard[r.botId] = { wins: prev.wins + (r.won ? 1 : 0), games: prev.games + 1, mvps: prev.mvps + (p.mvp === r.botId ? 1 : 0) };
      }
      const result: ArcadeMatchResult = {
        id,
        at: ev.ts,
        mode: p.mode,
        map: p.map,
        winningTeam: p.winningTeam,
        reason: p.reason,
        mvp: p.mvp ?? null,
        results: p.results.map((r) => ({ botId: r.botId, won: r.won, role: r.role })),
      };
      return {
        ...s,
        arcade: {
          leaderboard,
          recent: cap([...s.arcade.recent, result], ARCADE_RECENT),
          // Another match (e.g. yours) may still be running alongside a bots-only one.
          live: s.arcade.live && s.arcade.live.id !== id ? s.arcade.live : null,
          players: s.arcade.players.filter((b) => !seen.has(b)),
        },
      };
    }
    default:
      return s;
  }
}

/** "uh can you make the relay retry faster" → "Make the relay retry faster". */
export function tidy(text: string): string {
  const t = text
    .trim()
    .replace(/^(uh+|um+|so|okay|ok|hey)[,\s]+/i, '')
    .replace(/^(can|could) you\s+/i, '')
    .replace(/[.?!\s]+$/, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1, 60) : 'New task';
}

/** Red-pen shrink: a draft's visible word count eases toward ~45% over 8s. */
export function redPenWords(d: Pick<Draft, 'words' | 'at'>, now: number): number {
  const target = Math.max(12, Math.round(d.words * 0.45));
  const k = Math.min(1, Math.max(0, (now - d.at) / 8000));
  return Math.round(d.words - (d.words - target) * k);
}
