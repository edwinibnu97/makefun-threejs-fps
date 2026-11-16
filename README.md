# Emberline

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/edwinibnu97/makefun-threejs-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/edwinibnu97/makefun-threejs-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Emberline: Ashworks Yard — a round-based tactical FPS in three.js, a make.fun `threejs-fps-02` entry. Two teams of three fight short rounds on a dusk-lit foundry yard with two charge sites: Ember attacks by planting the spark charge or eliminating Slate, Slate defends, defuses, or runs the clock out. Money earned each round buys rifles, shotguns, grenades and armour in the buy menu between rounds. Single-player against bots, no build step, no network requests.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome with WebGL 2.

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

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
