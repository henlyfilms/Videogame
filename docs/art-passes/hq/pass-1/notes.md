# HQ art pass 1: readability

Screenshots are 1440×900 and 390×844, deviceScaleFactor 1, Light and Dark themes. Each viewport has an overview and the Arcade framed. Four bots were sent to the Arcade before each capture.

## What the pre-pass build looked like
- **Hierarchy:** at overview zoom (~0.4×) the baked 11 px room legends shrink to about 4 px, so no room can be identified without zooming in. The Arcade was the only room you could recognise, and only from its colour.
- **Occlusion:** the overview centred the world in the full viewport, so the Activity feed covered most of the Mailroom and the top bar clipped the first row of labels.
- **Silhouettes:** bots drew at a fixed world size, about 9 px on screen at overview, and their names were grey `label` text. That text vanished on dark floors: on the Arcade carpet and in the Cutting Room in Light theme it was about 1.6:1 against the floor.
- **Consistency:** door gaps were painted with the global floor colour (white in Light), so the two dark rooms showed bright white blocks in their walls.
- **Contrast:** in Light theme, walls (`#d4d9e3`) and prop outlines (`#b8c1d1`) on white floors were under 1.5:1, so room edges and furniture read as washed out.

## Fixes made in this pass
- Added **room name chips** in screen space. They fade in below 0.8× zoom, stay crisp at any zoom, use the room's accent dot and sit exactly over the baked legend so the two never double up. They are drawn in screen space each frame: 10 `fillText` calls, no cache invalidation.
- Overview framing now uses **HUD-safe insets**: the top bar, the feed column on screens ≥ 1100 px wide, and the phone's two-row bar and bottom sheet. On desktop the map now sits to the right of the feed.
- Bots keep a **minimum on-screen size** of up to 1.8× world size when zoomed out. Name tags are **pills** with a theme bubble background, so they read on any floor. Names are hidden below 0.55× zoom, where they were illegible anyway, except for the selected bot.
- **Door thresholds** now match the floor of their room (Arcade carpet, Cutting Room).
- Light and Soft **wall and prop-line tokens** are about 10% darker, so rooms and furniture separate from the corridor.
- Arcade details: the couch is purple velvet instead of the generic tan, and the duplicate "LIVE" text on the Marion Mystery screen is gone (the marquee pip stays).

## Critique of the pass-1 shots
- **Silhouette readability:** good at overview. Every room is labelled and the bots are visible dots. When zoomed in, cabinets, the neon sign and the leaderboard all have distinct outlines.
- **Colour harmony:** the Arcade's neon pink, cyan, amber and lime sits apart from the cobalt and teal HQ palette on purpose. The lawn greens in Light are calm. In Dark, the garden is close to the void colour and reads as flat.
- **Contrast/accessibility:** chips and name pills now have at least 7:1 text contrast. Prop interiors in Light are still low-contrast (`#eef1f6` on `#ffffff`).
- **Hierarchy:** the Arcade is now the clear focal point at the bottom of the map. Every other room has the same weight, which is intended.
- **Consistency:** everything is still flat. Rooms sit on the corridor with no depth, props have no contact shadows, and walls are a single stroke.
- **Does it feel alive?** Partly. Screens animate and bots walk, but lighting is static and nothing reacts to the time of day.

Lighting, materials and depth are left for pass 2. Animation, the day/night cycle and camera feel are left for pass 3.
