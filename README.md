# Chain Reaction — Nexus Protocol

[![Tests](https://github.com/tahmidnafees619/ChainReaction/actions/workflows/ci.yml/badge.svg)](https://github.com/tahmidnafees619/ChainReaction/actions/workflows/ci.yml)

A browser-based, pass-and-play implementation of the classic **Chain Reaction** strategy game — 2 to 10 players (any mix of humans and AI bots), a configurable grid, and a cyberpunk-themed frontend. Pure vanilla JavaScript and HTML5 Canvas, **zero runtime dependencies**.

> Place orbs, push cells past their critical mass, and trigger cascading chain reactions to capture the entire board and eliminate every other operative.

## Features

- **2–10 players**, any mix of human and AI, on a configurable grid (3×3 up to 12×12)
- **Three AI difficulty tiers** (Easy / Medium / Hard) — a weighted-heuristic bot that simulates each candidate move's cascade outcome and scores it on board control, corner value, and threat exposure, rather than a fixed rule list
- **Headless game engine** (`src/ChainReactionEngine.js`) — pure data/logic, zero DOM dependency, driven entirely by an event system (`on`/`emit`), so any frontend could be built against it
- Animated canvas rendering — orbiting "fluid sphere" orbs, particle burst effects on explosion, hazard vibration + pulsing aura on near-critical cells, 3D-tilted arena
- Procedurally synthesized audio (Web Audio API) — no audio assets — with a global mute toggle that persists across sessions
- Cascade safety cap — chain reactions are guaranteed to terminate even in pathological board states
- In-app "How to Play" reference panel
- 98 hand-rolled test assertions across the engine and AI, plus a 28-assertion browser end-to-end
  suite covering real layout/click/session behavior a unit test can't see (see Testing below)
- CI (GitHub Actions) runs the full test suite on every push

## Getting Started

This project has no build step and no npm dependencies — it's a static page.

**Option 1 — just open it:**
Open `index.html` directly in a modern browser (Chrome, Edge, or Firefox recommended for full Web Audio / backdrop-filter support).

**Option 2 — serve it locally** (recommended if your browser restricts `file://` access to scripts):
```bash
npx http-server .
# then visit the printed local URL
```

## Running the Tests

There are two tiers, deliberately kept separate:

```bash
npm test              # engine + AI — no install required, plain Node.js built-ins
npm run test:engine   # engine-only
npm run test:ai       # AI-only
```

```bash
npm install                          # one-time, pulls in Playwright (dev-only — see below)
npx playwright install chromium      # one-time, downloads a headless Chromium build
npm run test:e2e                     # drives the real page in that browser
npm run test:all                     # engine + AI + e2e, in order
```

`npm test` (the engine/AI suites) needs nothing installed — same as always. The e2e suite is the
one part of this project that isn't zero-dependency: it uses [Playwright](https://playwright.dev/)
as a **dev-only** dependency to drive a real headless browser against `index.html`, because several
real bugs in this project (a CSS stacking bug hiding a button under another one, a race condition
only reachable through actual click timing) were only ever findable that way — not from reading the
code or from a DOM-less unit test. It does not affect the shipped game: `index.html` itself still
has zero runtime dependencies, and playing it needs no install at all.

## How to Play

1. Players take turns placing one orb per turn in an empty cell, or a cell they already own.
2. Every cell has a **critical mass** based on its position: corner cells hold 2 orbs, edge cells hold 3, interior cells hold 4.
3. When a cell reaches its critical mass, it **explodes** — it empties out, and fires one orb into each orthogonally adjacent cell (never diagonally), converting those cells to the exploding player's color. This can cascade into a much larger chain reaction automatically.
4. Once every player has placed at least one orb, anyone left with zero orbs on the board is **eliminated**.
5. The last player with orbs remaining on the board **wins**.

The same rules are summarized in-app via the "❓ How to Play" panel on the menu screen.

## Project Structure

```
Chain Reaction/
├── index.html                     # Entry point — UI, canvas renderer, audio, all frontend logic
├── src/
│   ├── ChainReactionEngine.js     # Headless game engine (rules, state, event system)
│   └── ChainReactionAI.js         # Bot move selection (weighted heuristic, difficulty tiers)
├── tests/
│   ├── ChainReactionEngine.test.js
│   ├── ChainReactionAI.test.js
│   └── e2e/
│       └── game.e2e.test.js       # Browser end-to-end suite (Playwright, dev-only dependency)
├── docs/
│   └── REQUIREMENTS.md            # Functional / non-functional requirements
├── .github/workflows/ci.yml       # Runs the full test suite on every push
├── PROJECT_REPORT.md              # Full project report (architecture, design decisions, testing, etc.)
├── package.json
├── LICENSE
└── README.md
```

## Architecture at a Glance

- **`ChainReactionEngine.js`** owns all game state and rules. It never touches the DOM — a frontend subscribes to its events (`state_change`, `explosion`, `turn_change`, `player_eliminated`, `game_over`, `error`, `cascade_capped`) and calls `handlePlayerClick(row, col)` on input. Full event contract is documented at the top of the file.
- **`ChainReactionAI.js`** is a pure function of a game snapshot: for every legal move it simulates the resulting cascade on a disposable clone of the grid, scores the outcome, and picks a move according to the chosen difficulty's weighting/randomness profile. It never mutates the live game.
- **`index.html`** owns everything visual: screen management (menu / game / game-over), the canvas renderer, the particle system, procedural audio, and DOM wiring between user input and the engine's public API.

See `PROJECT_REPORT.md` for the full design rationale, including bugs found and fixed along the way.

## Tech Stack

- Vanilla JavaScript (ES2020+), no framework, no bundler
- HTML5 Canvas 2D for rendering
- Web Audio API for procedural sound
- Google Fonts (Orbitron / Share Tech Mono / Rajdhani) via CDN `<link>` — the only external resource the game itself loads
- Node.js (built-ins only) to run the engine/AI test suites
- [Playwright](https://playwright.dev/) (dev-only) to run the browser e2e suite; GitHub Actions runs everything on every push

## License

MIT — see [LICENSE](LICENSE).
