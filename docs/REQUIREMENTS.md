# Requirements Specification — Chain Reaction (Nexus Protocol)

## 1. Purpose and Scope

This document specifies the functional and non-functional requirements for the Chain Reaction
browser game. It covers the headless game engine, the AI opponent, and the frontend UI/renderer.

## 2. System Requirements

| Requirement | Detail |
|---|---|
| Runtime (play) | Any modern browser with Canvas 2D, Web Audio API, and CSS `backdrop-filter` support (Chrome, Edge, Firefox, Safari — recent versions) |
| Runtime (unit tests) | Node.js ≥ 14 (built-ins only — `npm test`, no packages to install) |
| Runtime (e2e tests) | Node.js ≥ 14 + Playwright (`npm install` + `npx playwright install chromium`, then `npm run test:e2e`) — the one dev-only dependency in the project, not required to play |
| Build step | None. Static HTML/CSS/JS, no bundler or transpiler |
| External dependencies (game) | One CDN font stylesheet (Google Fonts). No JS libraries, no package installs |
| Persistence | `localStorage` only, for the mute preference (`cr_muted`) |

## 3. Functional Requirements

### 3.1 Game Setup
- **FR-1**: The user shall be able to configure grid size independently by rows and columns, each in the range [3, 12].
- **FR-2**: The user shall be able to configure between 2 and 10 players.
- **FR-3**: Each player slot shall be independently configurable as Human or Bot.
- **FR-4**: Each Bot slot shall have an independently selectable difficulty: Easy, Medium, or Hard.
- **FR-5**: The user shall be able to add a new player slot (up to the 10-player maximum) and remove an existing one (down to the 2-player minimum), with a clear error shown if the minimum would be violated.

### 3.2 Core Gameplay
- **FR-6**: A player's turn shall consist of placing one orb into an empty cell or a cell they already own.
- **FR-7**: A move targeting a cell owned by another player shall be rejected with an error, and shall not consume the turn.
- **FR-8**: Each cell's critical mass shall be determined by its board position: 2 for corners, 3 for edges, 4 for interior cells.
- **FR-9**: When a cell's orb count reaches or exceeds its critical mass, it shall explode: it empties, and one orb is added to each orthogonally adjacent cell, transferring ownership of each such neighbor to the exploding player.
- **FR-10**: Explosions shall resolve in simultaneous waves (all currently-critical cells explode together, then the board is re-scanned), continuing until no cell is critical, or until the cascade safety cap is reached.
- **FR-11**: The engine shall guarantee that any single cascade terminates within a bounded number of waves, regardless of board state.
- **FR-12**: A player shall be eliminated once every player has placed at least one orb and that player has zero orbs remaining on the board.
- **FR-13**: The game shall end, declaring the sole remaining player the winner, once only one player has orbs on the board (checked only after the first full round).
- **FR-14**: Input shall be rejected while a cascade is actively resolving, and once the game has ended.
- **FR-15**: The user shall be able to restart the current match (same configuration) or return to setup for a new configuration.

### 3.3 AI Opponent
- **FR-16**: A Bot player's move shall be selected automatically, with a short artificial delay before it plays.
- **FR-17**: The Bot shall never select an illegal move.
- **FR-18**: If a move exists that wins the game immediately, the Bot shall take it regardless of difficulty.
- **FR-19**: Difficulty shall visibly affect play strength: Hard shall consistently outperform Easy given the same board state.

### 3.4 Frontend / UX
- **FR-20**: The current player's identity shall be visibly indicated (HUD, canvas border, per-player strip) at all times.
- **FR-21**: Explosions shall be accompanied by a visual effect and, unless muted, a sound effect.
- **FR-22**: Player elimination and invalid moves shall be surfaced via a transient on-screen notification.
- **FR-23**: The user shall be able to mute/unmute all audio via a single, always-accessible control, and this preference shall persist across page reloads.
- **FR-24**: An in-app reference of the rules shall be accessible from the setup screen without leaving it.
- **FR-25**: The game shall be playable via mouse click and touch tap.

## 4. Non-Functional Requirements

- **NFR-1 (Zero runtime dependencies)**: Playing the game shall never require an npm install,
  bundler, or external JS library. (The optional browser e2e test suite is the sole exception,
  and is dev-only tooling — it is not part of, and is never loaded by, the shipped game.)
- **NFR-2 (Determinism/testability)**: Core game rules shall be implemented in a DOM-free module so they can be unit-tested under Node.js without a browser.
- **NFR-3 (Performance)**: AI move selection shall complete in well under the bot's artificial "thinking" delay (600 ms) on boards up to 12×12.
- **NFR-4 (Responsiveness)**: The layout shall adapt to both desktop and mobile viewport sizes; touch targets (buttons, operative controls) shall be large enough to tap reliably — no control shall depend on `:hover` to become usable.
- **NFR-5 (Resilience)**: No sequence of user input shall be able to hang the engine indefinitely (see cascade safety cap, FR-11).
- **NFR-6 (Maintainability)**: Game rules, AI, and rendering shall remain in separate modules with a documented event contract between the engine and its consumers.

## 5. Constraints

- No server/backend — this is a fully client-side, local (same-device, pass-and-play) game. No network multiplayer.
- No build tooling — all source is authored directly as the files that ship.

## 6. Out of Scope (current version)

- Networked/remote multiplayer
- Persistent match history or player statistics
- Undo/redo of moves
- Localization / multi-language UI
- Full keyboard-only accessibility (canvas input is pointer-driven)

These are candidate future enhancements — see the "Future Work" section of `PROJECT_REPORT.md`.
