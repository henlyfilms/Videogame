import { describe, expect, it } from 'vitest';
import { BOT_SHAPES, CORE_BOTS } from '../src/data/bots';
import { makeEvent } from '../src/adapters/events';
import { Camera } from '../src/engine/camera';
import { Simulation } from '../src/engine/sim';
import { WORLD_H, WORLD_W } from '../src/engine/world';
import { cacheScaleFor, drawStaticWorld, pickBot, Renderer, MAX_CACHE_PIXELS } from '../src/render/renderer';
import { drawBotSprite, hexA, traceShape } from '../src/render/sprites';
import { emptyView } from '../src/render/view';
import { THEMES, THEME_ORDER } from '../src/theme/tokens';
import { makeMockContext } from './canvasMock';

const opts = { selectedBot: 'kanye', selectedRoom: 'mail' as const, hoverRoom: 'life' as const, hoverHotspot: { roomId: 'mail' as const, propId: 'stamp' }, showNames: true };

function busySim() {
  const sim = new Simulation({ random: () => 0.5 });
  for (const b of CORE_BOTS) sim.addBot(b);
  sim.apply(makeEvent('bot.delegate', { from: 'daniel', to: 'kanye', task: 'Ship' }));
  sim.apply(makeEvent('dictation.wave', { active: true, source: 'bridge' }));
  sim.apply(makeEvent('bot.tool_call', { botId: 'kanye', tool: 'relay', model: 'gemini' }));
  sim.apply(makeEvent('mail.sent', { draftId: 'd' }));
  sim.apply(makeEvent('bot.message', { botId: 'moose', text: 'hello there', to: 'barry' }));
  for (let i = 0; i < 30; i++) sim.update(1 / 60);
  return sim;
}

describe('renderer', () => {
  it('renders every theme without throwing and caches the static layer', () => {
    const canvas = document.createElement('canvas');
    const r = new Renderer(canvas);
    r.resize(1280, 800, 2);
    const cam = new Camera(WORLD_W, WORLD_H);
    const sim = busySim();
    for (const theme of THEME_ORDER) {
      const view = emptyView(theme);
      view.mail.pending = 2;
      view.mail.draftWords = 120;
      view.cutting.render = 0.6;
      view.life.cards = [{ lane: 'work', done: true }, { lane: 'ai', done: false }];
      view.life.dictating = true;
      view.foundry.skills = ['prompt-craft'];
      r.render(sim, cam, view, 0.5, opts);
      r.render(sim, cam, view, 0.5, opts);
    }
    expect(r.stats.staticBuilds).toBe(3);
    expect(r.stats.frames).toBe(6);
    expect(r.stats.botsDrawn).toBeGreaterThan(0);
    expect(canvas.width).toBe(2560);
  });

  it('chooses a bounded cache scale', () => {
    expect(cacheScaleFor(0.5, 1)).toBe(1);
    const s = cacheScaleFor(2, 2);
    expect(WORLD_W * s * WORLD_H * s).toBeLessThanOrEqual(MAX_CACHE_PIXELS + 1);
  });

  it('draws the static world and every bot shape', () => {
    const ctx = makeMockContext();
    expect(() => drawStaticWorld(ctx, THEMES.dark)).not.toThrow();
    for (const shape of BOT_SHAPES) {
      expect(() => traceShape(ctx, shape, 10, 1)).not.toThrow();
      expect(() =>
        drawBotSprite(ctx, 0, 0, { shape, color: '#000000', glowColor: '#6ea1ff', starred: true, state: 'needs_input', time: 1, phase: 0, facing: -1, theme: THEMES.light, carry: 'box', buffed: true, selected: true }),
      ).not.toThrow();
    }
  });

  it('picks the bot under the cursor', () => {
    const sim = busySim();
    const k = sim.getBot('kanye')!;
    expect(pickBot(sim, { x: k.x + 3, y: k.y - 2 })?.def.id).toBe('kanye');
    expect(pickBot(sim, { x: -500, y: -500 })).toBeNull();
  });

  it('hexA converts colors', () => {
    expect(hexA('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.500)');
  });
});
