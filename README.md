# Emberline

A round-based tactical FPS in three.js — a make.fun `threejs-fps-01` entry.

Two teams of three fight short rounds on the Ashworks Yard, a dusk-lit foundry
yard with two lanes and two charge sites. Ember attacks: plant the spark charge
at Site A or Site B, or eliminate the Slate defenders. Slate defends: hold the
sites, defuse a planted charge, or run the clock out. Money earned each round
buys rifles, shotguns, grenades and armour in the buy menu between rounds.

## Play

Serve `game/` with any static file server (or `node serve.ts`, then open
http://localhost:8080) and play in desktop Chrome with WebGL 2.

- **W A S D** — move, **Mouse** — look, **Click** — fire
- **R** — reload, **Ctrl / C** — crouch, **Space** — jump
- **1–5** — weapons, **4 / 5** — grenades (frag / flash), **G** — throw
- **B** — buy menu between rounds, **E** — plant / defuse the charge

## Build

`main.ts` (Node 22, standard library only) hands the entry in: it copies
`game/` and `screenshots/` to `/output` and writes `/output/dossier.json`
with `vendor/makefun-threejs.ts`.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT. three.js 0.187.0 is vendored under `game/vendor/three/` under its own
license.
