# HQ art pass 3: polish

Captures: noon (`?hour=12`) and night (`?hour=23`) in Light and Dark, at 1440×900 and 390×844. There is also one Soft-theme dusk shot (`desktop-overview-soft-dusk.png`, 19:00). Right before each Arcade shot, a bots-only Marion Mystery match ends. Kanye, Moose and you win; Sift and Greek lose. That way the leaderboard is filled and the celebrate/sulk reactions are on screen.

## Changes
**Bot animation** (`src/render/sprites.ts`: `botPose`, `isBlinking`, `drawGlow`)
- **Walking** is a hop. Squash and stretch pivots at the feet: wider and shorter on landing, taller at the apex. The bot leans into its direction of travel, and the ground shadow shrinks and fades while it is airborne.
- **Idle** bots breathe slowly. **Working** bots do a small typing jiggle with a forward lean. **Asleep** bots slump and lean. **Needs input** bots fidget.
- **Blinks** are natural: every 3.4–5 s per bot, phase-shifted so the crew never blinks in unison, with an occasional double blink. Eyes look in the direction of travel.
- **Glow pulse** follows activity: slow breathing when idle, quicker while working or playing, a big flare when celebrating, dimmed when asleep or sulking. The halo follows the hop.
- **Arcade moods:**
  - *play*: the bot bounces to the beat and leans into the cabinet, its eyes on the screen. Magenta and cyan screen light washes over its face and a joystick wiggles beside it.
  - *cheer*: big jumps, ^ ^ eyes, a grin and orbiting sparkle stars.
  - *sulk*: drooped and squashed, slanted eyes, and a tiny rain cloud.
- A specular glint was added to every berry body.

**Props**
- The couch now has a frame, backrest, seat cushions with seams and highlights, and armrests. The Arcade sofa is purple velvet.
- Plants are terracotta pots with a rim and soil, holding a fan of two-tone leaves with midribs.
- The huddle table now has chairs around it.
- The arcade cabinets got attract-mode mini-games on their screens (pass 0), plus a LIVE pip and a light spill that brightens while someone is playing.

**Day → night cycle** (`src/render/daylight.ts`, driven by the local clock)
- Night ramps up from 17:30 to 20:30 and down from 05:30 to 08:00, with golden-hour warmth peaking around 07:00 and 18:45.
- Night is a **light mask**: a navy multiply tint with holes punched where light falls. Lamp pools reveal the true floor colours instead of hazing them; additive glows alone looked foggy in Light (see the iteration notes below).
- Light sources:
  - 33 corridor lamps
  - two warm ceiling pools per room
  - pink, cyan and violet neon pools in the Arcade
  - garden path lights on the terrace
  - 44 facade windows whose glass turns amber and spills light outward
- Lamp fixtures and window glass are baked into the static layer, so they are visible (unlit) during the day.
- Light, Soft and Dark each have their own tint strength and lamp gain. Dark only needs a light tint because it is already dark; Light needs a deep one for the pools to read.
- `?hour=22` pins the time for demos. ⌘K has *Time of day: follow the clock / Morning / Noon / Dusk / Night*.

**Camera**
- Easing is now critically damped springs (smooth-damp) instead of exponential lerp. Moves ease in *and* out, so a new target mid-flight never causes a velocity pop.
- Zoom eases in log space, so zooming in and zooming out feel equally paced.
- Follow mode settles about 40% faster.

**Arcade reactions**
- At most two speech bubbles appear per match result, MVP and winners first. Everyone else emotes silently. The first capture showed four bubbles stacked over the Marion Mystery marquee.

## Performance
`renderer.render()` JS time, measured in headless Chromium at 1440×900 and DPR 2 over 2.5 s per case:

| | Day overview | Day Arcade | Night overview | Night Arcade |
|---|---|---|---|---|
| Light | 1.8 ms | 1.1 ms | 2.9 ms | 2.7 ms |
| Dark | 1.6 ms | 1.0 ms | 3.2 ms | 2.7 ms |

The first night build drew a full-resolution mask and cost 43–68 ms per frame. The mask is all soft gradients, so it now renders at ¼ resolution and is upscaled, which brought it down to about 3 ms. The static-layer chunk cache is unchanged.

All new static art (shadows, AO, fixtures, garden, carpet) is baked. Per frame, the only additions are the culled light sprites at night and one composite of the mask. In this headless environment, frames are still bound by the SwiftShader software rasterizer during full-screen composites; GPU canvases don't pay that cost.

## Critique of the pass-3 shots
- **Silhouette readability:** strong. Squash and stretch never changes a bot's outline enough to confuse the seven shapes, and name pills keep them identifiable at night. Mood props (sparkles, rain cloud, joystick) sit outside the silhouette, so you can read them at a glance.
- **Colour harmony:**
  - Night in Dark is the most atmospheric: warm corridor pools, amber facade windows, and the Arcade glowing in neon.
  - Night in Light is a deliberate dusky navy rather than pitch black, so the theme still feels like Light.
  - Soft at dusk reads as warm evening.
  - Remaining nit: in Light at night the room pools are close to white, because additive warm light on a white floor clips. That is acceptable, but a warmer floor tint at night would be nicer.
- **Contrast/accessibility:** HUD, room chips, name pills and bubbles are drawn after the tint, so their contrast never drops at night. Bots stay bright because they are drawn after the tint too. Nothing that conveys state relies on colour alone: moods have shape cues (eyes, cloud, sparkles), and the LIVE pip also has a text label.
- **Hierarchy:** at night the eye goes first to the Arcade (neon), then to the bots (self-lit glows), then to the corridors. That is the order we want.
- **Consistency:** one top-left key light everywhere. At night, every light source has a visible fixture by day.
- **Does it feel alive?** Yes. Bots breathe, blink, hop and react to Arcade results. Lighting follows the real clock, and the Arcade screens, neon flicker and garden lamps all move subtly.

## Ideas for later
- Draw emissive props (screens, neon, LIVE pip) after the night tint so they stay at full brightness instead of relying on the neon pools.
- Add a sunrise and sunset sweep direction for golden hour.
