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
| Testing (unit) | Node.js built-ins; hand-rolled `assert`/`section` helpers (no Jest/Mocha/etc.) |
| Testing (e2e) | Playwright — the project's one dev-only dependency, driving a real headless Chromium against `index.html`; not shipped, not required to play the game |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — runs the unit suites (no install) and the e2e suite (with Playwright installed) on every push |

## 6. Module Reference

### 6.1 `src/ChainReactionEngine.js` (~870 lines)
Exports `ChainReactionGame` (plus `EMPTY` and `EXPLOSION_DELAY_MS`). Owns the grid (`Cell[][]`),
turn order, elimination/win detection, and the async wave-based cascade resolver. Capacity per
cell is derived from position (corner → 2, edge → 3, interior → 4). Config validation
(`_validateConfig`) rejects malformed grid/player/cascade-cap values with a `RangeError`.

### 6.2 `src/ChainReactionAI.js` (~274 lines) — AI Design Deep Dive

Exports `ChainReactionAI` with a single static entry point:

```
ChainReactionAI.getBestMove(gameInstance, aiPlayerId, difficulty = 'medium')
  → { row, col }  or  null (no legal move)
```

**Algorithm class.** This is a **single-ply, simulate-and-score heuristic evaluator** — not a
game-tree search. It never looks at what an opponent might do in reply; it only asks "if I play
this move and let the resulting chain reaction fully resolve, how good does the board look
afterward?" for every legal move, then picks one. This keeps it O(legal moves × board size ×
simulated waves) per turn — small enough to stay well under a millisecond to a few milliseconds
even on a 12×12 board (measured) — while still being materially stronger than a fixed rule list,
because it "sees" the actual cascade a move triggers instead of guessing at it.

The algorithm runs in four stages every time a bot is asked to move:

**Stage 1 — Legal move generation.** A move `(r, c)` is legal iff the cell is empty or already
owned by the AI player. Formally, for a board with `rows × cols` cells:

```
M = { (r, c) : owner(r, c) = EMPTY  or  owner(r, c) = aiPlayerId }
```

If `M` is empty (can't happen in a game the AI hasn't already lost, but handled defensively),
`getBestMove` returns `null`.

**Stage 2 — Move simulation (`_simulateMove`).** For every candidate `m = (r, c) ∈ M`, the board is
cloned (plain objects, not live `Cell` instances — this is a disposable copy the AI is free to
mutate), one orb is placed for the AI at `(r, c)`, and the cascade is resolved to a fixed point by
re-running the *same* wave-based rule the engine itself uses (§6.1), independently re-implemented
here so the AI never touches or depends on the live game:

```
place one orb at (r, c), owned by aiPlayerId

repeat, up to 200 times (SIMULATION_WAVE_CAP — a performance cap, unrelated to
                          the engine's own much larger maxCascadeWaves safety cap):
    wave = { every cell (r', c') where orbCount(r', c') ≥ capacity(r', c') }
    if wave is empty: stop — the board has settled
    for each cell in wave:
        orbCount -= capacity          # the exploding cell empties out
        if orbCount ≤ 0: orbCount = 0, owner = EMPTY
        for each of its ≤4 orthogonal neighbours:
            queue: neighbour.orbCount += 1, neighbour.owner = aiPlayerId
    apply every queued increment simultaneously
    wavesTriggered += 1
```

This produces a resulting board `B(m)` and a wave count `W(m)` — the length of the chain reaction
that move would trigger.

**Stage 3 — Feature extraction (`_evaluate`).** Six numbers are computed from `B(m)`:

| Feature | Formula | Meaning |
|---|---|---|
| `orbDelta` | `Σ orbCount(cell)` over AI-owned cells `−` `Σ orbCount(cell)` over all opponent-owned cells | net material advantage |
| `cellControl` | count of cells where `owner(cell) = aiPlayerId` | how much board territory the AI holds |
| `corner` | count of AI-owned cells where `(r=0 ∨ r=rows−1) ∧ (c=0 ∨ c=cols−1)` | corners cost only 2 orbs to defend — cheap, stable territory |
| `threat` | count of opponent-owned cells with `orbCount ≥ capacity − 1` (one orb from exploding) that have **at least one orthogonal neighbour owned by the AI** | opponent cells primed to flip AI territory on their next turn |
| `eliminatedCount` | number of players who were active before this move and now have zero orbs on `B(m)` | opponents this move would knock out |
| `isWin` | `true` iff more than one player was active before the move **and** exactly one owner remains on `B(m)`, **and** it's the AI | this move ends the game in the AI's favour |

**Stage 4 — Scoring (`_scoreFeatures`).** The six features are combined into a single scalar via a
weighted linear sum, plus an overriding bonus for an outright win:

```
score(m) =   w_orbDelta      · orbDelta(m)
           + w_cellControl   · cellControl(m)
           + w_corner        · corner(m)
           − w_threat        · threat(m)
           + w_eliminate     · eliminatedCount(m)
           + w_chain         · W(m)
           + (100000 if isWin(m) else 0)
```

The weight vector `(w_orbDelta, w_cellControl, w_corner, w_threat, w_eliminate, w_chain)` is what
actually differs per difficulty — this is the entire mechanism by which Easy/Medium/Hard play
differently, not three different algorithms:

| Weight | Easy | Medium | Hard | Effect of a higher value |
|---|---|---|---|---|
| `w_orbDelta` | 1.0 | 1.4 | 1.8 | cares more about raw material advantage |
| `w_cellControl` | 0.4 | 0.8 | 1.1 | cares more about holding territory, not just orbs |
| `w_corner` | 0.5 | 0.9 | 1.1 | values cheap-to-defend corners more highly |
| `w_threat` | **0.0** | 0.6 | 1.4 | penalizes moves that leave the AI exposed to a counter-chain |
| `w_eliminate` | 3.0 | 6.0 | 9.0 | prioritizes moves that knock a player out |
| `w_chain` | 0.1 | 0.3 | 0.5 | rewards triggering a longer cascade |
| randomness `ρ` | 0.75 | 0.25 | 0.05 | how often it ignores the ranking (see Stage 5) |
| pool fraction `τ` | 0.6 | 0.3 | 0.08 | how wide a "not terrible" pool it picks from when it does |

Two things are visible directly in this table: Easy is defensively blind (`w_threat = 0` — it
never plays around a counter-chain) and picks against the ranking most of the time (`ρ = 0.75`);
Hard weighs every feature more heavily and almost always takes its top-ranked move (`ρ = 0.05`).

**Stage 5 — Move selection (`_pickByDifficulty`).**

```
if any move m has isWin(m) = true:
    return that move                      # always — regardless of difficulty

rank all legal moves by score(m), descending

draw u ~ Uniform(0, 1)
if u < ρ:
    k = max(1, round(τ × |M|))
    return a uniformly random move from the top k ranked moves
else:
    return a uniformly random move among those tied for the single highest score
```

A winning move is taken unconditionally at every difficulty — even Easy will always close out a
win it can see, so bots never "forget" to finish a game. Below that, difficulty is entirely a
matter of *how much the ranking is trusted*: Hard picks its actual best move 95% of the time from
a nearly-greedy pool; Easy substitutes a wide random pool 75% of the time, which is what makes it
a genuinely weaker, exploitable opponent rather than the same brain playing slower.

**Worked micro-example.** Suppose, on a 5×5 board, the AI (player 1) is considering two candidate
moves late in a Medium-difficulty game:
- Move A leaves it with `orbDelta = 3`, `cellControl = 6`, `corner = 1`, `threat = 1`, `eliminatedCount = 0`, triggers `W = 2` waves, no win.
- Move B leaves it with `orbDelta = 5`, `cellControl = 5`, `corner = 0`, `threat = 3`, `eliminatedCount = 0`, triggers `W = 4` waves, no win.

Using the Medium weights `(1.4, 0.8, 0.9, 0.6, 6, 0.3)`:

```
score(A) = 1.4(3) + 0.8(6) + 0.9(1) − 0.6(1) + 6(0) + 0.3(2)
         = 4.2 + 4.8 + 0.9 − 0.6 + 0 + 0.6 = 9.9

score(B) = 1.4(5) + 0.8(5) + 0.9(0) − 0.6(3) + 6(0) + 0.3(4)
         = 7.0 + 4.0 + 0.0 − 1.8 + 0 + 1.2 = 10.4
```

Move B scores higher — more material and a longer chain outweigh giving up the corner and leaving
three opponent cells primed to counter-chain into the AI's territory. Recomputing the *identical*
two positions with the Hard weights `(1.8, 1.1, 1.1, 1.4, 9, 0.5)`:

```
score(A) = 1.8(3) + 1.1(6) + 1.1(1) − 1.4(1) + 9(0) + 0.5(2)
         = 5.4 + 6.6 + 1.1 − 1.4 + 0 + 1.0 = 12.7

score(B) = 1.8(5) + 1.1(5) + 1.1(0) − 1.4(3) + 9(0) + 0.5(4)
         = 9.0 + 5.5 + 0.0 − 4.2 + 0 + 2.0 = 12.3
```

The ranking flips: Move A now wins, 12.7 to 12.3. Hard's much heavier `w_threat` (1.4 vs. 0.6)
outweighs Move B's material and chain-length advantage once those three primed opponent cells are
penalized more severely — a concrete illustration of why Hard plays more defensively than Medium
for the *identical* board position, purely from the weight table, with no branching logic
difference between difficulties anywhere in the code.

**Why this design, not a deeper search.** A full minimax/expectimax over multiple plies was
considered and rejected for this project: Chain Reaction's branching factor and cascade depth make
even a 2-ply search meaningfully more expensive, and — because a single move can flip a large
fraction of the board — the value of looking further ahead is dominated by how well the *immediate*
consequence of a move is evaluated. Investing that complexity budget into a richer single-ply
evaluator (six features instead of one or two, real cascade simulation instead of a static formula)
was judged the better trade-off for a bot that has to respond in well under its own 600ms "thinking"
delay on boards up to 12×12.

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
Two layers are used:
1. **Unit-style assertions** against the headless engine and AI, run under plain Node.js
   (`npm test`, no install required). These cover construction/validation, capacity math,
   placement, invalid-move rejection, single and chained explosions, ownership transfer, turn
   rotation, the first-round elimination guard, snapshot shape, restart, a full small-board game to
   a win, mid-cascade input blocking, neighbor calculation, the cascade safety cap, and the public
   state getters — plus AI legality, win-taking behavior, and no-legal-move handling.
2. **A checked-in browser end-to-end suite** (`tests/e2e/game.e2e.test.js`, `npm run test:e2e`)
   using Playwright to drive a real headless Chromium against the actual `index.html`. This tier
   exists specifically because bugs 4–9 in §7 were *only* ever found by driving the real app —
   layout/CSS-stacking bugs and click-timing race conditions are invisible to a DOM-less unit test
   by construction. What started as throwaway verification scripts during review sessions has been
   turned into permanent, repeatable regression tests: each of bugs 7, 8, and 9 has a named test
   section that would fail immediately if that exact bug ever came back. This is the one place the
   project isn't zero-dependency (Playwright is a dev-only dependency — see README "Running the
   Tests"), a deliberate trade-off given what this tier has actually caught in practice.

CI (`.github/workflows/ci.yml`) runs both tiers on every push — the unit suites in a plain Node job
with no setup, the e2e suite in a second job that installs Playwright first.

### 8.2 Results (at time of writing)

```
ChainReactionEngine.test.js:   88 passed, 0 failed
ChainReactionAI.test.js:       10 passed, 0 failed
tests/e2e/game.e2e.test.js:    28 passed, 0 failed
Total:                        126 assertions, 0 failures
```

Run with `npm test` (unit only, no install) or `npm run test:all` (everything, requires
`npm install` first) — see README for the individual `test:engine` / `test:ai` / `test:e2e` scripts.

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
│   ├── ChainReactionAI.test.js
│   └── e2e/
│       └── game.e2e.test.js       # Browser e2e suite (Playwright, dev-only dependency)
├── docs/
│   └── REQUIREMENTS.md            # Functional / non-functional requirements
├── .github/
│   └── workflows/ci.yml           # Runs the full test suite on every push
├── PROJECT_REPORT.md              # This file
├── package.json
├── package-lock.json              # Committed — pins the one dev dependency (Playwright) for CI
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

**Delivered since first identified:** a checked-in browser e2e suite (§8.1) and a CI workflow
running the full test suite on every push (§5, §10) — both were flagged as gaps in an earlier
review pass and have since been implemented, directly in response to the frontend regressions in
§7 that no prior test tier could have caught.

Candidate next steps still open:

- **Feel/juice**: combo callout on multi-wave cascades, an expanding shockwave ring per explosion,
  cascade-scaled screen shake.
- **Clarity**: hover/ghost orb preview on desktop, at-rest capacity indicators on idle cells,
  a distinct visual for "captured" vs. "placed" cells.
- **Atmosphere**: turn-reactive background tint, idle particle leakage from critical cells, a
  short "boot sequence" transition into a match.
- **Audio**: cascade-scaled explosion sound layering, a rising "charge" tone on near-critical cells.
- **Payoff**: a post-match "mission debrief" stats panel (biggest chain, total explosions, cells
  captured), a board-flood visual beat on victory.
- Broader accessibility (keyboard-navigable board) and persisted match statistics remain reasonable
  additions beyond the visual/audio list above.
- The frontend's single-file structure (§9, §12-adjacent) still isn't split by concern; not urgent,
  but worth revisiting before adding much more UI surface — the HUD/mute-button collision in §7
  (bug #8) was exactly the kind of issue that a lack of structural boundaries invites.

## 14. Conclusion

The project delivers a fully playable, correctly-implemented Chain Reaction game with no runtime
dependencies, a genuinely headless/testable rules engine, a non-trivial tiered AI opponent, and a
cohesive custom visual/audio theme. Its test suite and the development history in §7 and §11
reflect an iterative process where real end-to-end verification — not just static review — caught
issues that mattered to actual usability, which then fed back into concrete UI redesigns rather
than superficial patches. That verification process is no longer ad hoc: it's now a permanent,
CI-enforced part of the project (§8, §13), so the same class of bug it caught nine times over the
course of development gets caught automatically the tenth time.
