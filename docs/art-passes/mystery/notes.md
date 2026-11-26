# Marion Mystery — art passes

How the captures were made: Playwright with headless Chromium. 3D was drawn by **SwiftShader**, a software GPU, at Medium quality, so the lighting is right but frame rates are *not* representative. Desktop shots are 1440×900; the iPhone ones use the iPhone 13 profile. The capture script drives the game through the opt-in `?debug=1` hook: solo room → wardrobe → settings → role reveal → play → task → map → emergency meeting → vote → ejection → results. Characters, task mini-games and the HQ had their own passes, done by their builders; see the HQ notes in `../hq/`.

## Pass 1: blockout and readability (no images kept)

- **First renders.** Characters were placeholder ellipses or spheres. Walls were flat slabs, the fog was a grey wash, and the 3D map was untextured toon geometry.
- **Problems found:**
  - In the waiting room the camera didn't follow you: the runtime didn't know your player id until the first match snapshot.
  - On iPhone, the invisible joystick zone covered the waiting room's bottom buttons, so they couldn't be tapped.
  - The bright-mode fog didn't separate seen from unseen.
- **Fixes.** All three problems above were fixed. The real berry rigs and the 2D painter were merged in.

## Pass 2: lighting, materials and colour (`pass-2/`)

- **Colour identity:**
  - Room floors are tinted toward each room's accent colour (+60 %).
  - In 3D, every wall instance takes the colour of the room it faces, and its baseboard trim uses the room accent.
  - Corridors are darker than rooms, so rooms read as destinations.
- **Fog:**
  - Deeper navy fog, from 0.72 to 0.80 alpha, and 0.92 when the lights are sabotaged.
  - A soft screen vignette.
  - Lights Out lamps make small pools (at most 3 m) instead of lighting whole rooms. This was a gameplay fix too: lamps had made darkness meaningless.
- **Detective footprints:** they were grey noise; now they are paired teal prints that fade within 4 s and are drawn only for other players.

## Pass 3: polish (`pass-3/`, contact sheets plus individual frames)

- **Waiting room:**
  - Furnished the Launch Bay: a MARION statue, launch console, screens, benches, lamps, crates and a tree.
  - Marion agents now join the solo waiting room straight away, so it never feels empty.
- **3D moments:**
  - The role reveal, death cinematic and victory lineup are now posed on a real three.js stage (`ui/Stage3D.tsx`) for 3D players: knife-twirl, gun-spin, magnify, squish and celebrate.
  - 2D players get animated 2D portraits.
- **Meetings:** bots' idle lines are now on-topic ("I was doing my tasks", "Where was the body?") instead of "GG!".
- **First person:**
  - The camera now starts level; it had inherited the third-person upward pitch.
  - Lights Out is readable in first person: more ambient light and a stronger flashlight aimed at eye level.
- **iPhone:**
  - Escape no longer double-fires (closing a panel used to open the pause menu too).
  - The Hide & Seek countdown banner moved below the top panels on narrow screens.

## Checklist (final)

| Criterion | Verdict |
| --- | --- |
| Silhouette readability | Berries are unique by berry type, hair and hat, with name tags; bodies are a distinct squashed shape with a ghost wisp. |
| Colour harmony | Cobalt/teal Marion palette for the UI; a distinct accent per room; Lights Out uses navy, warm lamp pools and yellow flashlight cones. |
| Contrast and accessibility | Text sits on dark glass panels. There is a colour-blind team palette, and berry type plus name always identify a player. Reduced motion removes shake, flashes and flicker. |
| Hierarchy | The HUD is anchored to the corners (tasks top-left, tools top-right, actions bottom-right), alerts sit top-centre, and cinematics are full screen. |
| Marion-style consistency | Glow accents, berries, HQ cameos (Daniel statue, Quill's brass stamp on votes, Marion bots as players), HQ design tokens. |
| Animation timing | Reveal is 0.9 s "SHHH" → light sweep → card. The meeting splash lasts about 2.6 s. Ejection text types at 45 ms per character. Kills burst and shake for about 0.4 s. |
| Does it feel alive? | Bots mill about, pets follow, props blink, ambient music plays, and Lights Out has creaks and a heartbeat. |

**Known rough edges:**
- The ejection is a 2D canvas cinematic in both views.
- Some 3D hair caps (bob, side-swept) read slightly helmet-like.
- Real-device frame rates are unmeasured.
