# Project Report: Chain Reaction — Nexus Protocol

**Type:** Browser-based strategy game (client-side, pass-and-play, human + AI)
**Author:** tahmidnafees619
**License:** MIT
**Repository state at time of writing:** branch `feature/next-upgrades`, 8 commits, working tree clean

---

## 1. Executive Summary

Chain Reaction is a browser implementation of the classic orb/critical-mass strategy game, built
as a single static HTML page backed by a dependency-free JavaScript game engine. The project
demonstrates a clean separation between game logic and presentation: the engine
(`src/ChainReactionEngine.js`) is fully headless and event-driven, the AI (`src/ChainReactionAI.js`)
is a pure function over engine snapshots, and the frontend (`index.html`) owns all rendering,
audio, and input handling. The game supports 2–10 players in any mix of human and AI (three
difficulty tiers), configurable grid sizes, and a cyberpunk "Nexus Protocol" visual theme built
entirely from Canvas 2D, CSS, and procedurally synthesized Web Audio — no image, audio, or font
assets are bundled, and no build step or package install is required to run it.

The codebase is covered by 98 hand-rolled test assertions (no test framework dependency) and was
additionally verified through real headless-browser sessions (Playwright) driving actual user
flows — which is how several of the bugs documented in §7 were actually found, as opposed to only
static code review.

## 2. Objectives

1. Implement the Chain Reaction ruleset correctly, including simultaneous-wave chain reactions,
   first-round-gated elimination, and win detection.
2. Keep the rules engine headless and independently testable, decoupled from any rendering
   technology.
3. Provide a non-trivial AI opponent with meaningfully different difficulty levels, without
   requiring a game-tree search.
4. Build a distinctive, cohesive visual/audio theme without external asset or library dependencies.
5. Make the setup UI usable on touch devices, not just desktop-with-hover.

## 3. Features

- 2–10 players, any mix of Human / Bot (Easy, Medium, Hard) per slot
- Configurable grid, 3×3 up to 12×12
- Simultaneous wave-based chain reaction resolution with orb-conservation and a guaranteed
  termination bound (cascade safety cap)
- Weighted-heuristic AI: simulates each candidate move's resulting cascade and scores the outcome
  rather than following a fixed rule list
- Canvas renderer: orbiting multi-layer-gradient "fluid sphere" orbs, particle burst FX on
  explosion, hazard vibration + pulsing aura on near-critical cells, 3D-tilted arena, animated
  background grid
- Procedurally synthesized audio (Web Audio API): placement/explosion SFX, menu interaction SFX,
  ambient menu hum, victory arpeggio — all routed through a single mute-capable gain bus, with the
  mute preference persisted via `localStorage`
- In-app "How to Play" reference panel
- Player setup UI: explicit Human/Bot toggle and explicit Easy/Med/Hard selection per slot
  (deliberately not a cycling single-click control — see §7), always-tappable remove control,
  minimum-2-players guard
- Toast notifications for errors, eliminations, and cascade-cap events

## 4. System Architecture

```
                 ┌──────────────────────────┐
   user input →  │        index.html        │  ← rendering, audio, DOM, input
                 │  (menu / game / gameover  │
                 │   screens; canvas loop)   │
                 └────────────┬─────────────┘
                              │ handlePlayerClick(row, col)
                              │ game.on(event, callback)
                              ▼
                 ┌──────────────────────────┐
                 │  ChainReactionEngine.js  │  ← headless rules + state
                 │  (Cell, ChainReactionGame)│
                 └────────────┬─────────────┘
                              │ getSnapshot()
                              ▼
                 ┌──────────────────────────┐
                 │    ChainReactionAI.js    │  ← pure move selection
                 │ (simulate → score → pick)│
                 └──────────────────────────┘
```

The engine never imports or references the DOM. It exposes a small public surface
(`handlePlayerClick`, `restart`, `newGame`, `getSnapshot`, `getCell`, `on`, `isProcessing`,
`isGameOver`) and communicates state changes exclusively through events:

| Event | Payload | Fired when |
|---|---|---|
| `state_change` | full grid snapshot + metadata | after every placement and every explosion wave |
| `explosion` | `{ row, col, player }` | just before a cell explodes (per cell) |
| `turn_change` | `{ previousPlayer, currentPlayer }` | when the active player changes |
| `player_eliminated` | `{ playerId }` | when a player's orb count hits zero post-first-round |
| `game_over` | `{ winner }` | once, when a sole player remains |
| `error` | `{ message }` | on a rejected/invalid move |
| `cascade_capped` | `{ waves }` | if a single cascade exceeds the safety cap (see §7) |

The AI module takes a `ChainReactionGame` instance and a player id, reads a snapshot, and returns
`{ row, col }` or `null` — it never mutates the live engine.

## 5. Technology Stack

| Layer | Technology |
|---|---|
| Logic | Vanilla JavaScript (ES2020+ classes, `Map`/`Set`, async/await) |
| Rendering | HTML5 Canvas 2D (no WebGL, no rendering library) |
| Styling | Hand-written CSS (custom properties, `backdrop-filter`, `:has()`, flexbox) |
| Audio | Web Audio API, oscillators/gain nodes only — no audio files |
| Fonts | Google Fonts CDN (`Orbitron`, `Share Tech Mono`, `Rajdhani`) — the only external resource |
| Testing | Node.js built-ins; hand-rolled `assert`/`section` helpers (no Jest/Mocha/etc.) |
| Verification | Playwright (dev-time only, not shipped) used to drive real headless-browser sessions during development |

## 6. Module Reference

### 6.1 `src/ChainReactionEngine.js` (~870 lines)
Exports `ChainReactionGame` (plus `EMPTY` and `EXPLOSION_DELAY_MS`). Owns the grid (`Cell[][]`),
turn order, elimination/win detection, and the async wave-based cascade resolver. Capacity per
cell is derived from position (corner → 2, edge → 3, interior → 4). Config validation
(`_validateConfig`) rejects malformed grid/player/cascade-cap values with a `RangeError`.

### 6.2 `src/ChainReactionAI.js` (~274 lines)
Exports `ChainReactionAI` with a single static entry point, `getBestMove(gameInstance, aiPlayerId,
difficulty)`. For every legal move it runs `_simulateMove` — a pure, disposable re-implementation
of the cascade rules over a cloned plain-object grid, capped at 200 simulated waves purely for
performance — then scores the result via `_evaluate`/`_scoreFeatures` (orb differential, cell
control, corner value, opponent threat exposure, eliminations, an outright-win bonus) and selects
a move via `_pickByDifficulty`, whose weighting/randomness profile differs by difficulty
(`DIFFICULTIES.easy|medium|hard`).

### 6.3 `index.html` (~2250 lines)
Single-file frontend: CSS theme (`:root` custom properties for the neon/glass palette), three
screens (menu, game, game-over) plus overlays (How to Play, toasts), the `SoundFX` procedural
audio module, the canvas render loop (`requestAnimationFrame`), the particle system, and all DOM
wiring between user input and the engine's event API.

### 6.4 `tests/`
`ChainReactionEngine.test.js` (88 assertions) and `ChainReactionAI.test.js` (10 assertions), both
run directly via `node` with no framework — see §8.

## 7. Notable Bugs Found and Fixed

These were identified and resolved during development, several only surfaced by actually driving
the app in a real browser rather than by reading the code:

| # | Bug | Root cause | Fix |
|---|---|---|---|
| 1 | A pathological cascade could in principle never terminate | `_processExplosions()` looped `while(true)` with no bound | Added `maxCascadeWaves` (default 1000) with a `cascade_capped` event; any still-critical cells are picked up again on the next move (stateless rescan) |
| 2 | Bot's move wasn't awaited | `game.handlePlayerClick(...)` was fired without `await` in the `turn_change` handler, so pointer events were re-enabled before the bot's cascade actually finished | Added `await` |
| 3 | Frontend read private engine fields | `game._isProcessing` / `game._gameOver` accessed directly, breaking the "headless engine, public API only" contract | Added public `isProcessing`/`isGameOver` getters |
| 4 | Player-strip "active" highlight lagged one move behind | `_advanceTurn()` emits `turn_change` but does **not** re-emit `state_change`, so the last snapshot's `currentPlayer` was stale; the strip only listened to `state_change` | `turn_change` handler now patches `lastSnapshot.currentPlayer` and re-renders the strip immediately |
| 5 | "How to Play" close button was unclickable | The `.panel-label` div's full-width box painted above the absolutely-positioned close button (no explicit `z-index`) | Gave `.howto-close` `z-index: 2` |
| 6 | Remove (✕) button on a player slot never worked | `.token-x` had `pointer-events: none` permanently, only becoming *visible* on `:hover` — never clickable on any device, and never even visible on touch | Redesigned the operative row entirely: always-visible, always-tappable remove button; explicit Human/Bot toggle and explicit Easy/Med/Hard buttons replacing a hidden single-click cycle |
| 7 | A match froze permanently, empty board, if player 0 was bot-controlled | The frontend only ever triggers a bot's move from the `turn_change` event, but the engine never emits `turn_change` for the very first turn (nothing "changed" into it) — so a bot in slot 0 never got kicked off | Added an explicit `triggerBotTurnIfNeeded()` call right after a match starts (and after Restart/Rematch, which also reset `currentPlayer` to 0) |
| 8 | The in-game "Menu" (☰) button was completely unclickable, on every screen size | The global mute button was `position:fixed` in the same top-right corner as the HUD's own action buttons, sitting directly on top of "Menu" and capturing all its clicks | Mute button now docks inline into the HUD's own button row while in-game, and only floats in the corner on the menu screen (where nothing else occupies it) |
| 9 | Leaving mid-cascade or mid-"bot thinking" could throw `Cannot read properties of null (reading 'getSnapshot')`, or let a stray bot move land in a later match | A bot's 600ms "thinking" delay spans an `await`; if the user bailed to the menu (`game` set to `null`) or hit Restart/Rematch (the *same* engine object reset in place — an identity check alone wouldn't catch this) while that delay was in flight, the resumed callback acted on a null or stale game. Separately, `bindGameEvents()`'s listeners were never unsubscribed, so an abandoned match still mid-cascade could keep emitting into shared frontend state | Added a `gameSessionId` counter, bumped on every new match/restart/rematch and re-checked after every `await` before touching `game`; every "leave the match" path now also calls the engine's own `on()` unsubscribe handles (previously captured but never used) |

Bugs 6–9 were found only by actually driving the app end-to-end (bug 6 was reported directly by
the end user; 7–9 surfaced during a dedicated review-and-verify pass that included a bot-vs-bot
auto-played game to completion, rapid start/bail cycles, and multi-player elimination) — none of
them were visible from static code review alone.

## 8. Testing

### 8.1 Strategy
Two layers were used:
1. **Unit-style assertions** against the headless engine and AI, run under plain Node.js
   (`npm test`). These cover construction/validation, capacity math, placement, invalid-move
   rejection, single and chained explosions, ownership transfer, turn rotation, the first-round
   elimination guard, snapshot shape, restart, a full small-board game to a win, mid-cascade input
   blocking, neighbor calculation, the cascade safety cap, and the public state getters — plus AI
   legality, win-taking behavior, and no-legal-move handling.
2. **End-to-end verification** using a headless Playwright browser session against the actual
   `index.html` during development — exercising real user flows (menu configuration, starting a
   match, human + bot turns, mute toggling, panel open/close, operative add/remove/toggle) and
   checking for console/page errors. This is how bugs 4–6 in §7 were actually caught; static
   review alone did not surface them.

### 8.2 Results (at time of writing)

```
ChainReactionEngine.test.js:  88 passed, 0 failed
ChainReactionAI.test.js:      10 passed, 0 failed
Total:                        98 assertions, 0 failures
```

Run with `npm test`, or each suite individually via `npm run test:engine` / `npm run test:ai`.

## 9. Design Decisions Worth Noting

- **Wave-based (not depth-first) cascade resolution.** All currently-critical cells explode
  simultaneously per tick, matching physical board-game behavior and giving a clean animation hook
  (`EXPLOSION_DELAY_MS`) instead of an arbitrary recursive order.
- **AI as single-ply simulation, not search.** Rather than a fixed if/else rule chain or a
  multi-ply minimax, the AI simulates the immediate consequence of each legal move and scores the
  resulting position. This is materially stronger than a rule list (it "sees" actual cascade
  outcomes) while staying cheap enough (single-digit milliseconds on a 12×12 board) to run
  synchronously every bot turn.
- **Explicit controls over cycling controls.** The player-setup UI initially used a single click to
  cycle each slot through Human → Easy → Medium → Hard → Human. User feedback ("make it easier...
  don't make it one click thing") led to replacing this with two independent, always-visible
  control groups (Human/Bot, and Easy/Med/Hard) — every state is one direct tap away, and a slot's
  last-chosen difficulty is remembered across a Human→Bot round-trip.
- **Colorblind ownership glyphs, added then removed.** A per-player shape badge was added as a
  colorblind aid, then removed at the user's request as visually unwanted — a reminder that
  accessibility affordances still need to match the specific audience's taste, not just tick a box.
- **`localStorage` used narrowly.** The only persisted state is the mute preference — deliberately
  not match history, settings, or anything else, to keep the app's behavior fully predictable from
  a fresh load.

## 10. Project Structure

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
├── PROJECT_REPORT.md              # This file
├── package.json
├── LICENSE                        # MIT
├── .gitignore
└── README.md
```

## 11. Development History

| Commit | Summary |
|---|---|
| `607468b` | Initial release: headless engine core, unit test suite, Nexus Protocol UI |
| `4103d3d` | Integrate AI logic engine with heuristic decision-making |
| `a202a54` | Move AI logic to `turn_change` event for proper async handling |
| `37ef0c0` | Add player type selection (human/bot toggle), support multiple bot players |
| `af26b97` | Merge `feature/nexus-protocol-ui` — add bot players |
| `e138b85` | Add menu music, victory arpeggio, wire audio events to UI lifecycle |
| `c10e5ab` | Fix menu music initialization, add SFX for slider/player interactions |
| `287cbe1` | Weighted-heuristic AI rework + cascade safety cap (this project's largest single change) |

Beyond these commits, this working session additionally: fixed the five robustness/correctness
issues in §7 (#1–5); reworked the AI from rule-based to weighted-heuristic simulation with
difficulty tiers; added the mute system, How to Play panel, and a colorblind-glyph feature (later
removed per feedback); redesigned the player-setup UI from cramped cycling tokens to explicit,
touch-friendly controls after the remove-button bug report (#6); and restructured the repository
into `src/`/`tests/`/`docs/` with this report and the accompanying requirements/README/license/
package files.

## 12. Known Limitations

- No networked multiplayer — same-device pass-and-play only.
- No undo, no persisted match history/statistics.
- Canvas interaction is pointer/touch-driven only; no keyboard-accessible path to place an orb.
- The AI is a single-ply evaluator — strong relative to a fixed rule list, but not a full search;
  a sufficiently deep multi-ply opponent could still be constructed to beat Hard consistently.

## 13. Future Work

Candidate next steps identified during review (not yet implemented):

- **Feel/juice**: combo callout on multi-wave cascades, an expanding shockwave ring per explosion,
  cascade-scaled screen shake.
- **Clarity**: hover/ghost orb preview on desktop, at-rest capacity indicators on idle cells,
  a distinct visual for "captured" vs. "placed" cells.
- **Atmosphere**: turn-reactive background tint, idle particle leakage from critical cells, a
  short "boot sequence" transition into a match.
- **Audio**: cascade-scaled explosion sound layering, a rising "charge" tone on near-critical cells.
- **Payoff**: a post-match "mission debrief" stats panel (biggest chain, total explosions, cells
  captured), a board-flood visual beat on victory.
- Broader accessibility (keyboard-navigable board), persisted match statistics, and a lightweight
  CI workflow to run `npm test` on push are also reasonable additions beyond the visual/audio list
  above.

## 14. Conclusion

The project delivers a fully playable, correctly-implemented Chain Reaction game with no runtime
dependencies, a genuinely headless/testable rules engine, a non-trivial tiered AI opponent, and a
cohesive custom visual/audio theme. Its test suite and the development history in §7 and §11
reflect an iterative process where real end-to-end verification — not just static review — caught
issues that mattered to actual usability, which then fed back into concrete UI redesigns rather
than superficial patches.
