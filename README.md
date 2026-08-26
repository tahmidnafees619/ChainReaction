# Chain Reaction — Nexus Protocol

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
- 98 hand-rolled test assertions across the engine and AI (no test framework dependency)

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

```bash
npm test              # runs both suites
npm run test:engine   # engine-only
npm run test:ai       # AI-only
```
No install step is required — the test files use only Node.js built-ins (`require`, `assert`-style helpers written in-repo).

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
│   └── ChainReactionAI.test.js
├── docs/
│   └── REQUIREMENTS.md            # Functional / non-functional requirements
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
- Google Fonts (Orbitron / Share Tech Mono / Rajdhani) via CDN `<link>` — the only external resource in the project
- Node.js (built-ins only) to run the test suites

## License

MIT — see [LICENSE](LICENSE).
