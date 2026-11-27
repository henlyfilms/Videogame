/**
 * Marion agent runner: seats real Marion agents (daniel, moose, kanye, …) at a
 * Marion Mystery table, each with its own connection, its own fair view and
 * its own private model context, and lets Claude make their decisions
 * through the same game controls the MCP server exposes.
 *
 *   npm run agents -- --code KQ7HXA kanye moose daniel        # join a room you host in the app
 *   npm run agents -- --create --bots 4 kanye moose daniel     # agents make a room and play
 *
 * Low usage by design:
 *  - The autopilot plays between decisions, so the model is only called when
 *    something needs judgement: the match starts, a meeting opens, voting
 *    opens, someone names you, an order you gave finishes, a kill happens in
 *    front of a sheriff. Ghosts and quiet stretches cost nothing.
 *  - Every decision is a fresh, short conversation: a fixed system prompt and
 *    tool list (cached) + a few lines of memory + the situation report.
 *  - Low effort, a cap on rounds per decision, per meeting and per match.
 * Without ANTHROPIC_API_KEY (or another credential) the agents still play on
 * autopilot, including meeting chat and votes.
 *
 * Options: --server ws://localhost:8787/mystery · --token … · --model claude-opus-5-5
 *          --effort low|medium|high · --max-calls 40 (per agent per match) · --matches 1
 * Env: ANTHROPIC_API_KEY, MYSTERY_AGENT_MODEL, MYSTERY_AGENT_TOKEN, MYSTERY_SERVER.
 */
import Anthropic from '@anthropic-ai/sdk';
import { BOT_LOOKS } from '../../src/mystery/server/looks';
import { normalizeAgentId } from '../../src/mystery/server/agentHub';
import type { MapId, ModeId } from '../../src/mystery/core/types';
import { CONTROLS, GAME_RULES, PLAY_STYLE } from './guide';
import { Pilot, type PilotEvent } from './pilot';
import { reconnectingTransport, parseArgs } from './stdio';
import { McpSession, TOOLS } from './tools';

/** The tools the model gets during a match (the runner itself waits, joins and starts). */
export const DECISION_TOOLS = ['look', 'go', 'act', 'say', 'vote'];

export interface Decider {
  /** One model call. Returns the assistant content blocks and stop reason. */
  create(req: { system: Anthropic.Beta.BetaTextBlockParam[]; tools: Anthropic.Beta.BetaTool[]; messages: Anthropic.Beta.BetaMessageParam[] }): Promise<{ content: Anthropic.Beta.BetaContentBlock[]; stop_reason: string | null; usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null } }>;
}

/** Claude through the official SDK (credentials from the environment). */
export function claudeDecider(model: string, effort: 'low' | 'medium' | 'high'): Decider {
  const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return {
    create: async ({ system, tools, messages }) => {
      const res = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort },
        system,
        tools,
        messages,
      });
      return { content: res.content, stop_reason: res.stop_reason, usage: res.usage };
    },
  };
}

export function systemPrompt(agentId: string, name: string): string {
  const persona = BOT_LOOKS[agentId]?.persona ?? 'a sharp, friendly player.';
  return [
    `You are ${name}, a Marion agent (${persona}) playing Marion Mystery with friends. Play as yourself: a real, skilled player who wants to win.`,
    GAME_RULES,
    CONTROLS.replace(/- wait_for_turn:[^\n]*\n/, '').replace(/- set_status:[^\n]*\n/, ''),
    PLAY_STYLE,
    'Each message you get is one decision point with your situation report. Make 0-3 tool calls (often just say and/or vote, or nothing during play), then stop. Between decision points your autopilot keeps playing. Chat lines: under 120 characters, natural, in your own voice, no emojis spam, never mention being an AI or the autopilot.',
  ].join('\n\n');
}

interface Usage {
  calls: number;
  input: number;
  output: number;
  cached: number;
}

export class AgentRunner {
  readonly session: McpSession;
  memory: string[] = [];
  private backlog: PilotEvent[] = [];
  matchCalls = 0;
  private meetingCalls = 0;
  private meetingKey = '';
  usage: Usage = { calls: 0, input: 0, output: 0, cached: 0 };
  private stopped = false;
  private system: Anthropic.Beta.BetaTextBlockParam[];
  private tools: Anthropic.Beta.BetaTool[];

  constructor(
    readonly pilot: Pilot,
    private decider: Decider | null,
    private opts: { maxCallsPerMatch: number; log: (s: string) => void },
  ) {
    this.session = new McpSession(pilot);
    const name = pilot.agent.room?.players.find((p) => p.id === pilot.agent.pid)?.name ?? BOT_LOOKS[pilot.agentId]?.name ?? pilot.agentId;
    this.system = [{ type: 'text', text: systemPrompt(pilot.agentId, name), cache_control: { type: 'ephemeral' } }];
    this.tools = TOOLS.filter((t) => DECISION_TOOLS.includes(t.name)).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool['input_schema'] }));
    // With no model behind it, the autopilot talks and votes too.
    pilot.meetingControl = !!decider;
  }

  stop(): void {
    this.stopped = true;
  }

  /** Should this batch of events wake the model? */
  needsDecision(evs: PilotEvent[]): boolean {
    const s = this.pilot.snap;
    if (!this.decider || !s || !evs.some((e) => e.urgent)) return false;
    if (s.phase === 'ended' || !s.you.alive) return false;
    if (this.matchCalls >= this.opts.maxCallsPerMatch) return false;
    if (s.phase === 'meeting' && s.meeting) {
      const key = `${s.meeting.callerId}|${s.meeting.victimId ?? ''}`;
      if (key !== this.meetingKey) {
        this.meetingKey = key;
        this.meetingCalls = 0;
      }
      if (this.meetingCalls >= 4) return false;
      if (s.meeting.stage === 'reveal' || (s.meeting.stage === 'vote' && s.meeting.myVote)) return false;
    }
    return true;
  }

  async loop(): Promise<void> {
    while (!this.stopped) {
      await this.pilot.waitForTurn(30_000);
      const evs = this.pilot.drain();
      if (!evs.length) continue;
      for (const e of evs) {
        if (e.text.startsWith('GAME OVER')) {
          this.opts.log(`${this.pilot.agentId}: ${e.text.split(' Roles:')[0]} · model calls this match: ${this.matchCalls}`);
          this.matchCalls = 0;
          this.memory = [];
        }
        if (e.text.startsWith('MATCH STARTED')) {
          this.matchCalls = 0;
          this.memory = [];
          this.backlog = [];
        }
      }
      this.backlog.push(...evs);
      if (this.backlog.length > 14) this.backlog.splice(0, this.backlog.length - 14);
      if (!this.needsDecision(evs)) continue;
      const batch = this.backlog;
      this.backlog = [];
      try {
        await this.decide(batch);
      } catch (e) {
        this.opts.log(`${this.pilot.agentId}: model call failed (${e instanceof Error ? e.message : String(e)}); autopilot continues.`);
      }
    }
  }

  /** One decision point: a short, fresh conversation of at most 3 rounds. */
  async decide(evs: PilotEvent[]): Promise<void> {
    if (!this.decider) return;
    this.matchCalls++;
    this.meetingCalls++;
    const mem = this.memory.length ? `Your notes so far this match:\n${this.memory.slice(-10).map((m) => `- ${m}`).join('\n')}\n\n` : '';
    const happened = evs.map((e) => `- ${e.text}`).join('\n');
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: `${mem}What happened:\n${happened}\n\nNow:\n${this.pilot.report()}` }];
    for (let round = 0; round < 3; round++) {
      const res = await this.decider.create({ system: this.system, tools: this.tools, messages });
      this.usage.calls++;
      this.usage.input += res.usage?.input_tokens ?? 0;
      this.usage.output += res.usage?.output_tokens ?? 0;
      this.usage.cached += res.usage?.cache_read_input_tokens ?? 0;
      if (res.stop_reason === 'refusal') return;
      const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (!uses.length || res.stop_reason !== 'tool_use') return;
      messages.push({ role: 'assistant', content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const u of uses) {
        const args = (u.input ?? {}) as Record<string, unknown>;
        const out = DECISION_TOOLS.includes(u.name) ? await this.session.callTool(u.name, args) : { content: [{ type: 'text', text: `Tool ${u.name} is not available.` }], isError: true };
        const text = out.content.map((c) => c.text).join('\n');
        results.push({ type: 'tool_result', tool_use_id: u.id, content: text, ...(out.isError ? { is_error: true } : {}) });
        if (!out.isError) this.note(u.name, args);
      }
      messages.push({ role: 'user', content: results });
      // A spoken line or a vote usually ends the decision; don't spend another round on it.
      if (uses.every((u) => u.name === 'say' || u.name === 'vote' || u.name === 'go')) return;
    }
  }

  private note(tool: string, a: Record<string, unknown>): void {
    const t = this.pilot.snap ? `${Math.floor(this.pilot.snap.t / 60)}:${String(Math.floor(this.pilot.snap.t % 60)).padStart(2, '0')}` : '';
    if (tool === 'say') this.memory.push(`${t} you said: "${String(a.text ?? '')}"`);
    else if (tool === 'vote') this.memory.push(`${t} you voted ${String(a.target ?? '')}`);
    else if (tool === 'act') this.memory.push(`${t} you did ${String(a.action ?? '')}${a.target ? ` on ${String(a.target)}` : ''}${a.kind ? ` (${String(a.kind)})` : ''}`);
    else if (tool === 'go') this.memory.push(`${t} you went ${a.follow ? `after ${String(a.follow)}` : `to ${String(a.destination ?? '')}`}`);
    if (this.memory.length > 20) this.memory.shift();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv, ['create', 'autopilot', 'verbose']);
  const agents = (args._.length ? args._ : ['kanye', 'moose', 'daniel']).map((x) => normalizeAgentId(x)).filter(Boolean);
  const log = (s: string) => console.log(`[agents] ${s}`);
  const url = args.server ?? process.env.MYSTERY_SERVER ?? 'ws://localhost:8787/mystery';
  const token = args.token ?? process.env.MYSTERY_AGENT_TOKEN;
  const model = args.model ?? process.env.MYSTERY_AGENT_MODEL ?? 'claude-opus-5-5';
  const effort = (['low', 'medium', 'high'].includes(args.effort ?? '') ? args.effort : 'low') as 'low' | 'medium' | 'high';
  const hasCreds = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE) && args.autopilot !== 'true';
  const decider = hasCreds ? claudeDecider(model, effort) : null;
  log(decider ? `${agents.join(', ')} will play with ${model} (effort ${effort}).` : `${agents.join(', ')} will play on autopilot (no Anthropic credentials found, or --autopilot).`);

  const runners: AgentRunner[] = [];
  for (const id of agents) {
    const pilot = new Pilot({ agentId: id, transport: reconnectingTransport(url, (s) => log(`${id}: ${s}`)), token });
    runners.push(new AgentRunner(pilot, decider, { maxCallsPerMatch: Number(args['max-calls'] ?? 40), log }));
  }
  const [host, ...rest] = runners;
  if (!host) return;
  let code = args.code;
  if (args.create === 'true' || !code) {
    const r = await host.pilot.join(undefined, { mode: args.mode as ModeId | undefined, map: args.map as MapId | undefined, bots: Number(args.bots ?? 4) });
    log(r.text);
    if (!r.ok) process.exit(1);
    code = host.pilot.room!.code;
  } else {
    const r = await host.pilot.join(code, null);
    log(`${host.pilot.agentId}: ${r.text}`);
  }
  for (const r of rest) {
    const res = await r.pilot.join(code, null);
    log(`${r.pilot.agentId}: ${res.ok ? `joined ${code}` : res.text}`);
  }
  log(`Room ${code}. Open Marion Mystery → Join → ${code} to watch or play with them.`);
  if (args.create === 'true' || !args.code) {
    await new Promise((r) => setTimeout(r, 1500));
    const s = await host.pilot.start({});
    log(s.text);
  }
  // Progress: one line per agent every 20 s (--verbose), plus meetings and results always.
  if (args.verbose === 'true')
    setInterval(() => {
      for (const r of runners) {
        const s = r.pilot.snap;
        if (!s) continue;
        const crew = s.stats.crew ? ` tasks ${s.stats.crew.myDone}/${s.stats.crew.myTotal}` : '';
        log(`${r.pilot.agentId}: ${s.phase} t=${Math.round(s.t)} ${s.you.role}${s.you.alive ? '' : ' (ghost)'} at ${s.you.pos.x.toFixed(1)},${s.you.pos.y.toFixed(1)}${crew} bar ${Math.round((s.stats.taskBar ?? 0) * 100)}%`);
      }
    }, 20_000).unref();
  const matches = Number(args.matches ?? 0);
  let ended = 0;
  host.pilot.agent.on('end', () => {
    ended++;
    const total = runners.reduce((a, r) => ({ calls: a.calls + r.usage.calls, input: a.input + r.usage.input, output: a.output + r.usage.output, cached: a.cached + r.usage.cached }), { calls: 0, input: 0, output: 0, cached: 0 });
    log(`Usage so far: ${total.calls} model calls, ${total.input} input tokens (${total.cached} cached), ${total.output} output tokens.`);
    if (matches && ended >= matches) {
      for (const r of runners) r.stop();
      setTimeout(() => process.exit(0), 500);
    }
  });
  process.on('SIGINT', () => {
    for (const r of runners) {
      r.stop();
      r.pilot.close();
    }
    process.exit(0);
  });
  await Promise.all(runners.map((r) => r.loop()));
}

if (process.argv[1] && /server[\\/]mcp[\\/]agents\.[jt]s$/.test(process.argv[1])) void main();
