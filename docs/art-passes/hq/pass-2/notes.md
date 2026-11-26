# HQ art pass 2: lighting, materials and colour

Same capture set as pass 1. Every lighting element added here is **baked** into the static layer and chunk cache, so per-frame cost is unchanged. The PNGs above 390 KB were posterized to 7 bits per channel, which is visually identical.

## Changes
- **Depth through soft drop shadows** (`src/render/lighting.ts`):
  - The building slab (core block plus the Arcade ring) now casts a wide, soft shadow onto the ground and terrace.
  - Each room casts a short shadow onto the corridor, so rooms read as one step up.
  - Each blocking prop casts a contact shadow shaped to its footprint: a pill for the huddle table, circles for the pod, brain and plants. Wall-mounted bits like the mic and dimmer cast none.
  - The shadows are layered translucent strokes, not `shadowBlur`. `shadowBlur` cost grows with device-pixel area, which is huge for the building at 3–5× chunk scale, and its radius ignores the transform. That would have produced seams between cache scales.
- **Ambient occlusion along walls:** gradient bands darken the floor where it meets the walls. The band under the top wall is deepest (26 px) because it faces away from the top-left key light; the sides are 16 px and the bottom 10 px. The dark-floored rooms get a stronger pass.
- **Materials:**
  - Floors get a faint radial key light toward the upper-left middle, so they no longer read as flat fills. The Arcade's key light is tinted pink.
  - Walls have a two-tone bevel: a darker outer face plus a lit inner lip, which reads as thickness in plan view.
  - Room accent strips spill coloured light onto the floor. The spill is strongest in Dark (0.16) and barely there in Light (0.07).
- **Colour:**
  - Room accent washes are a little stronger (0.035 → 0.045).
  - The tube glass is thinner and lighter in Light, so the cobalt lines no longer dominate the overview.
  - The Dark terrace grass is lifted off the void colour so the garden reads as a separate surface.

## Critique of the pass-2 shots
- **Silhouette readability:** better than pass 1. Furniture now separates from the floor through its contact shadow rather than its outline alone, which matters most for the pale props in Light. Shadows are still subtle on dark floors, as they should be.
- **Colour harmony:** the warm shadow ink in Soft (`#3a2c14`) and cool ink in Light (`#1e2a44`) keep the palettes clean, with no grey mud. The Arcade's pink key light ties the cabinets' light spill to the carpet.
- **Contrast/accessibility:** the AO bands lower floor brightness near walls by at most 8–10%. Nothing interactive sits in those bands, and the props there (planners, sorting wall) keep at least 3:1 outlines.
- **Hierarchy:** the building now reads as one object on the ground plane, with the Arcade annex attached below. The garden falls back visually, as intended.
- **Consistency:** the same light direction (top-left) drives the building, room and prop shadows and the wall bevels.
- **Does it feel alive?** The light is still static: the same noon in every theme. The bots' idle motion is only a slight vertical bob. The High Scores board is blank until a match ends; pass 3 fills it in the capture script.

Left for pass 3: bot animation (squash and stretch, blinks, glow pulse, play/cheer/sulk poses), richer prop detail (couch cushions, cabinet joysticks), a clock-driven day→night cycle with window glows and lamp pools, and spring-damped camera easing.
