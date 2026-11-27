import { useState } from 'react';
import { ARCADE_GAMES } from '../../arcade/registry';
import { launchMystery } from '../../arcade/state';
import { CORE_BOTS } from '../../data/bots';
import { ARCADE_MODE_LABEL, ARCADE_TEAM_LABEL, mapLabel } from '../../game/describe';
import { ARCADE_YOU, arcadeRanking } from '../../game/mechanics';
import { botName, useGame } from '../../store/gameStore';
import { Empty, Section, useNow } from '../common';

/** Join-code alphabet used by Marion Mystery (no confusable characters). */
const CODE_RE = /^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/;
export const normalizeJoinCode = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const isJoinCode = (code: string): boolean => CODE_RE.test(code);

const BOT_COLOR = new Map(CORE_BOTS.map((b) => [b.id, b.glowColor]));
const colorFor = (id: string) => (id === ARCADE_YOU ? '#fbbf24' : BOT_COLOR.get(id) ?? '#94a3b8');

function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ArcadePanel() {
  const arcade = useGame((s) => s.mech.arcade);
  const [code, setCode] = useState('');
  const now = useNow(15000);
  const ranking = arcadeRanking(arcade).slice(0, 8);
  const recent = arcade.recent.slice().reverse();
  const mystery = ARCADE_GAMES.find((g) => g.status === 'live');
  const soon = ARCADE_GAMES.filter((g) => g.status === 'soon');
  const codeOk = isJoinCode(code);

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-card border p-3 text-white"
        style={{ borderColor: '#e879f9aa', background: 'radial-gradient(120% 140% at 0% 0%, #4c1d95 0%, #1e1040 45%, #0b0820 100%)', boxShadow: '0 0 24px #e879f933 inset' }}
      >
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-60 blur-2xl" style={{ background: '#e879f9' }} />
        <div className="relative">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200/80">Now on cabinet 01</div>
          <div className="mt-0.5 text-lg font-extrabold leading-tight" style={{ textShadow: '0 0 12px #e879f9' }}>
            {mystery?.name ?? 'Marion Mystery'}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-white/75">{mystery?.tagline}</p>
          <button
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-card px-3 py-2.5 text-sm font-bold text-[#1a0526] transition-transform hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{ background: 'linear-gradient(180deg, #ffd1fb, #e879f9)', boxShadow: '0 0 18px #e879f988' }}
            onClick={() => (mystery?.launch ? mystery.launch() : launchMystery())}
          >
            ▶ Play Marion Mystery
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="rounded-card border border-white/25 bg-white/10 px-2 py-1.5 text-[11px] font-semibold hover:bg-white/20" onClick={() => launchMystery({ kind: 'quick' })}>
              🤖 Quick Play vs bots
            </button>
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (codeOk) launchMystery({ kind: 'join', code });
              }}
            >
              <input
                className="w-full min-w-0 rounded-card border border-white/25 bg-black/30 px-2 py-1 font-mono text-[11px] uppercase tracking-widest text-white placeholder:text-white/40 focus:border-white/60 focus:outline-none"
                value={code}
                onChange={(e) => setCode(normalizeJoinCode(e.target.value))}
                placeholder="CODE"
                aria-label="Join code"
                spellCheck={false}
              />
              <button className="shrink-0 rounded-card border border-white/25 bg-white/10 px-2 text-[11px] font-semibold hover:bg-white/20 disabled:opacity-40" type="submit" disabled={!codeOk} aria-label="Join by code">
                Join
              </button>
            </form>
          </div>
        </div>
      </div>

      {arcade.live && (
        <div className="flex items-center gap-2 rounded-card border border-line px-2.5 py-2 text-xs" role="status">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-fuchsia-500" />
          </span>
          <span className="truncate">
            <b>Live:</b> {ARCADE_MODE_LABEL[arcade.live.mode]} on {mapLabel(arcade.live.map)}
            {arcade.live.bots.length > 0 && <span className="text-muted"> · {arcade.live.bots.map(botName).join(', ')}</span>}
          </span>
        </div>
      )}

      <Section title="Arcade leaderboard" right={<span className="text-[10px] text-muted">wins · games</span>}>
        {ranking.length === 0 ? (
          <Empty>No scores yet. Play a round, or wait for the bots to sneak in a match.</Empty>
        ) : (
          <ol className="space-y-1" aria-label="Arcade leaderboard">
            {ranking.map((r, i) => (
              <li key={r.id} className={`flex items-center gap-2 rounded-card border px-2 py-1 text-xs ${r.id === ARCADE_YOU ? 'border-amber-400/60 bg-amber-400/5' : 'border-line'}`}>
                <span className={`w-4 text-center font-bold tabular-nums ${i === 0 ? 'text-amber-500' : 'text-muted'}`}>{i + 1}</span>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorFor(r.id), boxShadow: `0 0 6px ${colorFor(r.id)}` }} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {botName(r.id)}
                  {r.mvps > 0 && <span className="ml-1 text-[10px] text-amber-500">{'★'.repeat(Math.min(3, r.mvps))}</span>}
                </span>
                <span className="tabular-nums">
                  <b>{r.wins}</b>
                  <span className="text-muted"> · {r.games}</span>
                </span>
                <span className="w-9 text-right text-[10px] tabular-nums text-muted">{Math.round((r.wins / Math.max(1, r.games)) * 100)}%</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Recent matches" right={<span className="text-[10px] text-muted">last {Math.min(10, recent.length)}</span>}>
        {recent.length === 0 ? (
          <Empty>Match results land here.</Empty>
        ) : (
          <ul className="space-y-1" aria-label="Recent matches">
            {recent.map((m) => {
              const winners = m.results.filter((r) => r.won).map((r) => botName(r.botId));
              const youRow = m.results.find((r) => r.botId === ARCADE_YOU);
              return (
                <li key={m.id} className="rounded-card border border-line px-2 py-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">
                      {ARCADE_MODE_LABEL[m.mode]} · {mapLabel(m.map)}
                    </span>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold text-white"
                      style={{ background: m.winningTeam === 'crew' ? '#16a34a' : m.winningTeam === 'murderers' ? '#dc2626' : '#6b7280' }}
                    >
                      {ARCADE_TEAM_LABEL[m.winningTeam]}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-muted">
                    <span className="truncate">
                      {youRow ? <b className={youRow.won ? 'text-good' : 'text-warn'}>{youRow.won ? 'You won · ' : 'You lost · '}</b> : null}
                      {winners.length ? `Winners: ${winners.join(', ')}` : m.reason}
                      {m.mvp ? ` · MVP ${botName(m.mvp)}` : ''}
                    </span>
                    <span className="shrink-0">{ago(m.at, now)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Coming soon">
        <ul className="grid grid-cols-1 gap-1.5">
          {soon.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded-card border border-dashed border-line px-2 py-1.5 text-[11px]" aria-disabled="true">
              <span className="h-7 w-1.5 shrink-0 rounded-full" style={{ background: g.color, boxShadow: `0 0 8px ${g.color}` }} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{g.name}</span>
                <span className="block truncate text-muted">{g.tagline}</span>
              </span>
              <span className="hq-chip shrink-0">Soon</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
