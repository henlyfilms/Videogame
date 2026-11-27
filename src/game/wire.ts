/**
 * Glue between the HQ controller (sim/renderer) and the Zustand store.
 */
import { BOT_SHAPES, CORE_BOTS, makeCustomBot, type BotShape } from '../data/bots';
import type { RelayModel } from '../adapters/events';
import type { RenderView } from '../render/view';
import { applyThemeToDocument } from '../theme/tokens';
import { seasonFor } from '../theme/environment';
import { useGame, type GameState } from '../store/gameStore';
import type { HQ } from './hq';
import { arcadeRanking, redPenWords, throughputFor } from './mechanics';

export function buildView(s: GameState, now = Date.now()): RenderView {
  const m = s.mech;
  const draft = m.mail.drafts[0];
  const active = new Set<RelayModel>();
  for (const c of m.engine.commands) if (c.status === 'dispatched' && c.model) active.add(c.model);
  return {
    theme: s.theme,
    mail: {
      action: m.mail.sorted.action.length,
      fyi: m.mail.sorted.fyi.length,
      noise: m.mail.sorted.noise.length,
      incoming: m.mail.inbox.length,
      pending: m.mail.drafts.length,
      draftWords: draft ? redPenWords(draft, now) : 0,
      draftTarget: draft ? Math.round(draft.words * 0.45) : 0,
    },
    media: {
      queued: m.media.queue.length,
      insights: m.media.insights.length,
      llm: m.media.llm,
      distilling: false,
    },
    cutting: {
      queued: m.cutting.queue.length,
      keepers: m.cutting.keepers,
      outtakes: m.cutting.outtakes,
      render: m.cutting.render,
      green: m.cutting.green,
    },
    life: {
      cards: m.life.cards.map((c) => ({ lane: c.lane, done: c.done })),
      streak: m.progress.streak,
      polish: m.progress.polish,
      vault: m.life.vault.filter((v) => !v.deleted).length,
      archived: m.life.vault.filter((v) => v.deleted).length,
      dictating: m.life.dictating,
      turntable: s.turntable,
    },
    engine: {
      queue: m.engine.commands.filter((c) => c.status !== 'done').length,
      polaroids: m.engine.polaroids,
      activeModels: [...active],
    },
    foundry: { skills: m.foundry.skills, custom: m.foundry.customBots.length },
    command: {
      releases: m.command.releases,
      brain: m.command.brain,
      huddling: m.command.huddles.length > 0,
    },
    arcade: {
      top: arcadeRanking(m.arcade)
        .slice(0, 4)
        .map((r) => ({ id: r.id, wins: r.wins, games: r.games })),
      live: !!m.arcade.live,
      liveMode: m.arcade.live?.mode ?? null,
      matches: m.arcade.recent.length,
    },
  };
}

/** Add core + persisted custom bots to the sim. */
export function populateSim(hq: HQ, s: GameState = useGame.getState()): void {
  for (const b of CORE_BOTS) hq.sim.addBot(b);
  for (const c of s.mech.foundry.customBots) {
    const shape = (BOT_SHAPES as readonly string[]).includes(c.shape) ? (c.shape as BotShape) : 'blueberry';
    hq.sim.addBot(
      makeCustomBot({
        id: c.botId,
        name: c.name,
        job: c.job,
        shape,
        color: c.color,
        glowColor: c.glowColor,
      }),
    );
  }
}

/** Connect bus → store, store → sim/renderer. Returns a disposer. */
export function wire(hq: HQ, store = useGame): () => void {
  const unsubs: (() => void)[] = [];
  unsubs.push(hq.bus.subscribe((ev) => store.getState().ingest(ev)));

  let cachedFor: GameState | null = null;
  let cachedView: RenderView | null = null;
  let cachedAt = 0;
  hq.getView = () => {
    const s = store.getState();
    const now = Date.now();
    // Rebuild on state change, or 4×/s for time-based visuals (red-pen shrink).
    if (s !== cachedFor || !cachedView || now - cachedAt > 250) {
      cachedView = buildView(s, now);
      cachedFor = s;
      cachedAt = now;
    }
    return cachedView;
  };

  const sync = (s: GameState) => {
    hq.paused = s.paused;
    hq.speed = s.speed;
    hq.sim.throughput = throughputFor(s.mech.foundry.skills, s.mech.progress.polish);
    hq.ui.selectedBot = s.selectedBot;
    hq.ui.selectedRoom = s.selectedRoom;
  };
  let lastTime: string | null = null;
  const syncEnv = (s: GameState) => {
    hq.ui.season = s.season === 'auto' ? seasonFor() : s.season;
    if (s.timeMode !== lastTime) {
      // 'auto' keeps a ?hour= override from the URL until the player picks.
      if (lastTime !== null || s.timeMode !== 'auto') hq.clockOverride = s.timeMode === 'day' ? 12.5 : s.timeMode === 'night' ? 22.5 : null;
      lastTime = s.timeMode;
    }
  };
  syncEnv(store.getState());
  sync(store.getState());
  let lastTheme = store.getState().theme;
  if (typeof document !== 'undefined') applyThemeToDocument(lastTheme);
  unsubs.push(
    store.subscribe((s) => {
      sync(s);
      syncEnv(s);
      if (s.theme !== lastTheme) {
        lastTheme = s.theme;
        if (typeof document !== 'undefined') applyThemeToDocument(s.theme);
      }
    }),
  );
  unsubs.push(hq.onFps((fps) => store.getState().showFps && store.getState().setFps(Math.round(fps))));
  return () => unsubs.forEach((u) => u());
}
