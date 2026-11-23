# Ahwoo Racing

Browser arcade racer. Four circuits, four hover hypercars, a Grand Prix cup, procedural
worlds and synthesised engine audio — no backend, no API keys, no network calls at runtime.

Built with Vite 8, React 19, three.js 0.187 and Tailwind v4.

## Run

```bash
bun install
bun run dev        # http://localhost:3000
```

## Build and deploy

```bash
bun run build      # -> dist/
bun run preview    # serve the production build locally
```

`dist/` is a static site. Upload it to any static host (Cloudflare Pages, Netlify, S3,
Nginx). There is nothing to configure: no environment variables, no server, no database.

Serve it from a **domain root**. Asset URLs are root-absolute (`/assets/...`), so a
sub-path deploy (`example.com/games/ahwoo/`) needs `base` set in `vite.config.ts`.

## Controls

| Input | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake |
| `A` `D` / `←` `→` | Steer |
| `Space` | Overdrive boost |
| `C` | Replay camera |
| `V` | Cycle weather phase |
| `R` | Race radio |
| `M` | Mute |
| `1`–`4` | Jump to circuit |
| `Esc` | Pause |
| `Enter` | Start / confirm |

Keyboard only. There is no touch or gamepad input yet, so the game is desktop-oriented.

## Project layout

```
src/game/
  engine.ts      renderer, post stack, camera, race sim, HUD snapshot
  worlds.ts      the four world builders, road/kerb/barrier/deck geometry, dressing
  tracks.ts      level definitions, feature planning, elevation, track audit
  textures.ts    every texture in the game, generated on canvas
  weather.ts     per-level weather phases and particles
  weatherHazards.ts  debris, fog banks, solar surges
  vehicles.ts    procedural hover cars and paint/neon/rim customisation
  audio.ts       fully synthesised WebAudio engine and SFX
src/components/  React overlays: title, garage, circuit select, HUD, results, radio
public/assets/   title reel + poster (everything else is generated at runtime)
```

## Performance notes

- Pixel ratio is capped at 2; post-processing (bloom, cyber pass) is disabled when a
  software GL renderer is detected.
- Shadows are off by design; the look comes from emissive trim, bloom and image-based
  lighting.
- The road is a tiling, metre-scaled surface map plus an additive markings decal; the
  markings are the only self-lit part of the deck.

## Licence

Proprietary, all rights reserved — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
