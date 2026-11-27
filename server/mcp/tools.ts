/**
 * The Marion Mystery MCP server: tool definitions and a transport-agnostic
 * JSON-RPC handler (stdio and Streamable HTTP both feed `McpSession.handle`).
 *
 * One session = one agent = one seat. A session can only see what its own
 * seat sees; there is no tool that reads another player's view or role.
 * Tool descriptions are deliberately short: they ride along with every model
 * request, so every word costs tokens.
 */
import type { MapId, ModeId } from '../../src/mystery/core/types';
import { fullGuide, roleGuide, CONTROLS, GAME_RULES, PLAY_STYLE } from './guide';
import { Pilot } from './pilot';

export const SERVER_INFO = { name: 'marion-mystery', title: 'Marion Mystery game controls', version: '1.0.0' };
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = `You are a Marion agent playing Marion Mystery (social deduction: crew vs murderers) as yourself. Loop: join_game → (host: start_game) → wait_for_turn → decide with 0-2 tool calls → wait_for_turn … until GAME OVER. Your character's autopilot walks, does tasks and fixes sabotages between your decisions, so only act when it matters. You only know what your own reports say. Play like a real, sharp human player; keep chat lines short and natural. Call how_to_play once if you need the rules.`;

const MODES: ModeId[] = ['classic', 'lightsout', 'hideseek'];
const MAPS: MapId[] = ['hq', 'greenhouse', 'express', 'manor'];

export interface ToolDef {
  name: string;
  title?: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
}

const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });

export const TOOLS: ToolDef[] = [
  {
    name: 'join_game',
    description: 'Join a Marion Mystery room by its 6-letter code, or create one (create: true makes you host; bots fills seats with Marion bots). With neither, joins the first open public room.',
    inputSchema: {
      type: 'object',
      properties: {
        code: str('Room code, e.g. "KQ7HXA".'),
        create: { type: 'boolean', description: 'Create a new room and host it.' },
        mode: str('New room mode.', { enum: MODES }),
        map: str('New room map.', { enum: MAPS }),
        bots: { type: 'integer', minimum: 0, maximum: 19, description: 'Built-in bots to add when starting.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'start_game',
    description: 'Host only: start the match (optionally change mode/map/bots first).',
    inputSchema: {
      type: 'object',
      properties: { mode: str('Mode.', { enum: MODES }), map: str('Map.', { enum: MAPS }), bots: { type: 'integer', minimum: 0, maximum: 19 } },
      additionalProperties: false,
    },
  },
  {
    name: 'wait_for_turn',
    description: 'Main loop. Waits until something needs your decision (match start, meeting, voting, a body, a finished order, death, game over) or max_wait passes, then returns your situation report and what happened. Call it repeatedly.',
    inputSchema: { type: 'object', properties: { max_wait: { type: 'integer', minimum: 1, maximum: 110, description: 'Seconds (default 45; use ~100 as a ghost).' } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'look',
    description: 'Your situation report right now (no waiting).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'go',
    description: 'Move your character: destination = a room name, "button", "tasks" (autopilot, the default) or "stay"; or follow = a player. The autopilot walks there and resumes after. auto_kill toggles murderers striking on their own when unseen.',
    inputSchema: {
      type: 'object',
      properties: {
        destination: str('Room name, "button", "tasks" or "stay".'),
        follow: str('Player to stick with.'),
        hold_seconds: { type: 'integer', minimum: 0, maximum: 60, description: 'Wait this long on arrival (default 8).' },
        auto_kill: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'act',
    description:
      'One game action. kill/poison/shoot <target>: strike now if in range, else hunt them and strike when safe (shoot: when in range). report (nearest body), emergency (walks to the button), sabotage kind=lights|comms|doors (+room)|meltdown|pressure, vent (+room to travel; again to exit), shield|track <target>, inspect (body), admin|cams|vitals|doorlog (console), camera, blackout, remote_fix, mayor_reveal, flashlight_on|flashlight_off, ping [target], emote kind=wave|dance|laugh|cheer.',
    inputSchema: {
      type: 'object',
      properties: {
        action: str('The action.', {
          enum: ['kill', 'poison', 'shoot', 'report', 'emergency', 'sabotage', 'vent', 'shield', 'track', 'inspect', 'admin', 'cams', 'vitals', 'doorlog', 'camera', 'blackout', 'remote_fix', 'mayor_reveal', 'flashlight_on', 'flashlight_off', 'gun_pickup', 'ping', 'emote'],
        }),
        target: str('Player name (kill/shoot/shield/track/ping).'),
        kind: str('Sabotage kind or emote id.'),
        room: str('Room (doors sabotage, vent destination).'),
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'say',
    description: 'Send a chat line (meetings; during play only players nearby hear it, if proximity chat is on). Keep it short and natural.',
    inputSchema: { type: 'object', properties: { text: str('At most ~200 characters.') }, required: ['text'], additionalProperties: false },
  },
  {
    name: 'vote',
    description: 'Vote in a meeting: a player name, or "skip".',
    inputSchema: { type: 'object', properties: { target: str('Player name or "skip".') }, required: ['target'], additionalProperties: false },
  },
  {
    name: 'set_status',
    description: 'Show what you (the real agent) are working on under your name tag in the game and in Marion HQ: state "working" (with a loading ring) + a task title or one-line summary, or "idle". Public: never put game secrets in it.',
    inputSchema: {
      type: 'object',
      properties: { state: str('working or idle.', { enum: ['working', 'idle'] }), title: str('Task title / one-line summary (max 60 chars).'), detail: str('Optional extra line (max 140 chars).') },
      required: ['state'],
      additionalProperties: false,
    },
  },
  {
    name: 'how_to_play',
    description: 'Rules, controls and the pro playbook for a role (or every role).',
    inputSchema: { type: 'object', properties: { role: str('Role id, e.g. murderer, sheriff, crewmate. Omit for everything.') }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'leave_game',
    description: 'Leave the room.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

export const PROMPTS = [
  {
    name: 'play_marion_mystery',
    title: 'Play Marion Mystery',
    description: 'Join a room and play a full match as yourself.',
    arguments: [{ name: 'code', description: 'Room code to join (omit to create a room with bots).', required: false }],
  },
];

export const RESOURCES = [{ uri: 'marion://mystery/guide', name: 'guide', title: 'Marion Mystery guide', description: 'Rules, controls and role playbooks.', mimeType: 'text/plain' }];

type Json = Record<string, unknown>;
interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Json;
}
export interface RpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function text(t: string, isError = false) {
  return { content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) };
}

const asStr = (v: unknown) => (typeof v === 'string' ? v : undefined);
const asNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const asBool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
const asMode = (v: unknown) => (MODES.includes(v as ModeId) ? (v as ModeId) : undefined);
const asMap = (v: unknown) => (MAPS.includes(v as MapId) ? (v as MapId) : undefined);

/** One MCP client ↔ one Pilot. */
export class McpSession {
  initialized = false;
  /** Tool calls served (usage readout). */
  calls = 0;

  constructor(readonly pilot: Pilot) {}

  /** Run one tool by name. Returns the MCP CallToolResult. */
  async callTool(name: string, args: Json): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
    this.calls++;
    const p = this.pilot;
    switch (name) {
      case 'join_game': {
        const create = asBool(args.create) ? { mode: asMode(args.mode), map: asMap(args.map), bots: asNum(args.bots) } : null;
        const r = await p.join(asStr(args.code), create);
        return text(r.text, !r.ok);
      }
      case 'start_game': {
        const patch: Json = {};
        if (asMode(args.mode)) patch.mode = asMode(args.mode);
        if (asMap(args.map)) patch.map = asMap(args.map);
        if (asNum(args.bots) !== undefined) patch.bots = Math.max(0, Math.min(19, Math.round(asNum(args.bots)!)));
        const r = await p.start(patch);
        return text(r.text, !r.ok);
      }
      case 'wait_for_turn': {
        const secs = Math.max(1, Math.min(110, asNum(args.max_wait) ?? 45));
        await p.waitForTurn(secs * 1000);
        const evs = p.drain();
        const happened = evs.length ? `What happened:\n${evs.map((e) => `- ${e.text}`).join('\n')}\n\n` : 'Nothing new.\n\n';
        return text(happened + p.report());
      }
      case 'look':
        return text(p.report());
      case 'go': {
        const r = p.go({ destination: asStr(args.destination), follow: asStr(args.follow), hold_seconds: asNum(args.hold_seconds), auto_kill: asBool(args.auto_kill) });
        return text(r.text, !r.ok);
      }
      case 'act': {
        const action = asStr(args.action);
        if (!action) return text('action is required.', true);
        const r = await p.act({ action, target: asStr(args.target), kind: asStr(args.kind), room: asStr(args.room) });
        return text(r.text, !r.ok);
      }
      case 'say': {
        const r = await p.say(asStr(args.text) ?? '');
        return text(r.text, !r.ok);
      }
      case 'vote': {
        const r = await p.vote(asStr(args.target) ?? '');
        return text(r.text, !r.ok);
      }
      case 'set_status': {
        const state = args.state === 'working' ? 'working' : args.state === 'idle' ? 'idle' : null;
        if (!state) return text('state must be "working" or "idle".', true);
        const r = p.setStatus(state, asStr(args.title), asStr(args.detail));
        return text(r.text, !r.ok);
      }
      case 'how_to_play': {
        const role = asStr(args.role)?.toLowerCase().trim();
        const g = role ? roleGuide(role as never) : '';
        return text(role && g ? `${g}\n\n${CONTROLS}` : role ? `Unknown role "${role}".\n\n${fullGuide()}` : fullGuide(), !!role && !g);
      }
      case 'leave_game': {
        const r = p.leave();
        return text(r.text, !r.ok);
      }
      default:
        return text(`Unknown tool ${name}.`, true);
    }
  }

  /** Handle one JSON-RPC message. Returns null for notifications. */
  async handle(msg: unknown): Promise<RpcResponse | null> {
    if (!msg || typeof msg !== 'object') return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
    const req = msg as RpcRequest;
    const id = req.id ?? null;
    const isNotification = req.id === undefined;
    if (typeof req.method !== 'string') return isNotification ? null : { jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid request' } };
    const params = (req.params ?? {}) as Json;
    const reply = (result: unknown): RpcResponse | null => (isNotification ? null : { jsonrpc: '2.0', id, result });
    const error = (code: number, message: string): RpcResponse | null => (isNotification ? null : { jsonrpc: '2.0', id, error: { code, message } });
    try {
      switch (req.method) {
        case 'initialize': {
          this.initialized = true;
          const want = asStr(params.protocolVersion);
          return reply({
            protocolVersion: want && VERSIONS.includes(want) ? want : VERSIONS[0],
            capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: INSTRUCTIONS,
          });
        }
        case 'notifications/initialized':
        case 'notifications/cancelled':
        case 'notifications/roots/list_changed':
          return null;
        case 'ping':
          return reply({});
        case 'tools/list':
          return reply({ tools: TOOLS });
        case 'tools/call': {
          const name = asStr(params.name);
          if (!name || !TOOLS.some((t) => t.name === name)) return error(-32602, `Unknown tool: ${name ?? ''}`);
          return reply(await this.callTool(name, (params.arguments as Json | undefined) ?? {}));
        }
        case 'prompts/list':
          return reply({ prompts: PROMPTS });
        case 'prompts/get': {
          if (params.name !== 'play_marion_mystery') return error(-32602, 'Unknown prompt');
          const code = asStr((params.arguments as Json | undefined)?.code);
          const start = code ? `Join room ${code} with join_game.` : 'Create a room with join_game (create: true, bots: 5), then start_game.';
          return reply({
            description: PROMPTS[0]!.description,
            messages: [{ role: 'user', content: { type: 'text', text: `${GAME_RULES}\n\n${CONTROLS}\n\n${PLAY_STYLE}\n\n${start} Then loop wait_for_turn and play the whole match to GAME OVER.` } }],
          });
        }
        case 'resources/list':
          return reply({ resources: RESOURCES });
        case 'resources/templates/list':
          return reply({ resourceTemplates: [] });
        case 'resources/read':
          if (params.uri !== RESOURCES[0]!.uri) return error(-32602, 'Unknown resource');
          return reply({ contents: [{ uri: RESOURCES[0]!.uri, mimeType: 'text/plain', text: fullGuide() }] });
        default:
          return error(-32601, `Method not found: ${req.method}`);
      }
    } catch (e) {
      return error(-32603, e instanceof Error ? e.message : 'Internal error');
    }
  }
}
