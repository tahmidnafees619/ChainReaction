/**
 * ============================================================
 *  CHAIN REACTION GAME ENGINE
 *  Pure Vanilla JavaScript — Zero Dependencies
 * ============================================================
 *
 *  ARCHITECTURE OVERVIEW
 *  ─────────────────────
 *  This file exports a single class: ChainReactionGame.
 *
 *  The class is intentionally "headless" — it owns only data
 *  and logic, never DOM or Canvas. Your 3D frontend connects
 *  by:
 *    1. Calling `game.handlePlayerClick(row, col)` on user input.
 *    2. Subscribing to events via `game.on(eventName, callback)`
 *       to receive every state change that should be rendered.
 *
 *  EVENT CONTRACT (what the frontend will receive)
 *  ─────────────────────────────────────────────────
 *  "state_change"   – Emitted after every single explosion step
 *                     and after every valid player click.
 *                     Payload: full grid snapshot + metadata.
 *
 *  "explosion"      – Emitted just before a cell explodes.
 *                     Payload: { row, col, player }
 *                     Use this to trigger a visual burst effect.
 *
 *  "turn_change"    – Emitted when the active player changes.
 *                     Payload: { previousPlayer, currentPlayer }
 *
 *  "player_eliminated" – Emitted when a player is knocked out.
 *                        Payload: { playerId }
 *
 *  "game_over"      – Emitted once, when a winner is determined.
 *                     Payload: { winner: playerId }
 *
 *  "error"          – Invalid move attempted.
 *                     Payload: { message }
 * ============================================================
 */

'use strict';

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────

/** The delay (ms) between each explosion step in a chain reaction.
 *  This is what allows a frontend to animate cascades frame-by-frame. */
const EXPLOSION_DELAY_MS = 200;

/** Sentinel value for a cell that belongs to no player. */
const EMPTY = -1;


// ─────────────────────────────────────────────
//  CELL
// ─────────────────────────────────────────────

/**
 * Represents one cell on the grid.
 *
 * Capacity rules (critical mass):
 *   Corner cell  → 2  (has exactly 2 orthogonal neighbours)
 *   Edge cell    → 3  (has exactly 3 orthogonal neighbours)
 *   Interior cell→ 4  (has exactly 4 orthogonal neighbours)
 *
 * A cell EXPLODES the moment its orbCount reaches its capacity.
 */
class Cell {
  /**
   * @param {number} row       – Zero-based row index
   * @param {number} col       – Zero-based column index
   * @param {number} capacity  – Critical-mass threshold (2 | 3 | 4)
   */
  constructor(row, col, capacity) {
    this.row      = row;
    this.col      = col;
    this.capacity = capacity;   // Maximum orbs before explosion
    this.orbCount = 0;          // Current orb count
    this.owner    = EMPTY;      // Player ID (-1 = unoccupied)
  }

  /** True when this cell is about to explode (or is mid-explosion). */
  get isCritical() {
    return this.orbCount >= this.capacity;
  }

  /**
   * Returns a plain-object snapshot safe to hand to the frontend.
   * Never mutate this object — it is a one-way data transfer.
   */
  snapshot() {
    return {
      row:      this.row,
      col:      this.col,
      capacity: this.capacity,
      orbCount: this.orbCount,
      owner:    this.owner,
    };
  }
}


// ─────────────────────────────────────────────
//  CHAIN REACTION GAME ENGINE
// ─────────────────────────────────────────────

class ChainReactionGame {

  // ──────────────────────────────────────────
  //  CONSTRUCTION & INITIALIZATION
  // ──────────────────────────────────────────

  /**
   * @param {Object} config
   * @param {number} config.rows         – Grid row count  (≥ 2)
   * @param {number} config.cols         – Grid column count (≥ 2)
   * @param {number} config.totalPlayers – Number of players (2–10)
   */
  constructor({ rows, cols, totalPlayers }) {
    this._validateConfig(rows, cols, totalPlayers);

    /** @type {number} */
    this.rows = rows;
    /** @type {number} */
    this.cols = cols;
    /** @type {number} */
    this.totalPlayers = totalPlayers;

    // ── Event listener registry ──────────────────
    // Maps eventName → Set of callback functions.
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();

    // ── Core state (set by _resetState) ──────────
    /** @type {Cell[][]}  The 2-D grid */
    this.grid = [];

    /** @type {number}  ID of the player whose turn it is (0-indexed) */
    this.currentPlayer = 0;

    /**
     * Set of player IDs still in the game.
     * Players are only eligible for elimination once every player
     * has placed at least one orb (tracked via `_hasPlacedOrb`).
     * @type {Set<number>}
     */
    this.activePlayers = new Set();

    /**
     * Tracks whether each player has placed at least one orb.
     * Elimination is only possible after the full first round.
     * @type {boolean[]}
     */
    this._hasPlacedOrb = [];

    /**
     * Whether every player has had at least one turn.
     * Set to true once the last player in the first rotation places.
     * @type {boolean}
     */
    this._firstRoundComplete = false;

    /**
     * Set to true while processExplosions() is running.
     * Prevents the player from clicking again mid-cascade.
     * @type {boolean}
     */
    this._isProcessing = false;

    /**
     * Set to true once a winner has been declared.
     * All further input is silently ignored.
     * @type {boolean}
     */
    this._gameOver = false;

    /** @type {number|null}  Winning player's ID, or null if game is ongoing. */
    this.winner = null;

    this._resetState();
  }

  /**
   * Re-initialises all mutable state.
   * Called by the constructor and can be called again for a rematch.
   */
  _resetState() {
    this.grid             = this._buildGrid();
    this.currentPlayer    = 0;
    this.activePlayers    = new Set(
      Array.from({ length: this.totalPlayers }, (_, i) => i)
    );
    this._hasPlacedOrb    = new Array(this.totalPlayers).fill(false);
    this._firstRoundComplete = false;
    this._isProcessing    = false;
    this._gameOver        = false;
    this.winner           = null;
  }

  /**
   * Builds the 2-D Cell array and pre-computes each cell's capacity.
   * @returns {Cell[][]}
   */
  _buildGrid() {
    const grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        const capacity = this._computeCapacity(r, c);
        row.push(new Cell(r, c, capacity));
      }
      grid.push(row);
    }
    return grid;
  }

  /**
   * Dynamically computes a cell's critical-mass capacity based on
   * its position in the grid.
   *
   * The rule is simple: capacity equals the number of orthogonal
   * (top / bottom / left / right) neighbours the cell has.
   *   Corner cell  → 2 neighbours → capacity 2
   *   Edge cell    → 3 neighbours → capacity 3
   *   Interior cell→ 4 neighbours → capacity 4
   *
   * @param {number} r
   * @param {number} c
   * @returns {2|3|4}
   */
  _computeCapacity(r, c) {
    let neighbours = 4;
    if (r === 0 || r === this.rows - 1) neighbours--;
    if (c === 0 || c === this.cols - 1) neighbours--;
    return neighbours; // Always 2, 3, or 4
  }

  // ──────────────────────────────────────────
  //  EVENT SYSTEM
  // ──────────────────────────────────────────

  /**
   * Subscribe to a game event.
   *
   * @param {string}   event    – One of: state_change, explosion,
   *                              turn_change, player_eliminated,
   *                              game_over, error
   * @param {Function} callback – Receives a payload object.
   * @returns {Function}  An unsubscribe function for cleanup.
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    // Return an unsubscribe handle
    return () => this._listeners.get(event).delete(callback);
  }

  /**
   * Emit an event to all registered listeners.
   * @param {string} event
   * @param {*}      payload
   */
  _emit(event, payload) {
    const handlers = this._listeners.get(event);
    if (handlers) {
      handlers.forEach(fn => fn(payload));
    }
  }


  // ──────────────────────────────────────────
  //  PUBLIC API — GAME ACTIONS
  // ──────────────────────────────────────────

  /**
   * PRIMARY ENTRY POINT for the frontend.
   *
   * Called when the current player clicks a grid cell.
   * Validates the move, places an orb, then kicks off the
   * asynchronous explosion cascade if needed.
   *
   * @param {number} row
   * @param {number} col
   * @returns {Promise<void>}  Resolves when the full cascade settles.
   */
  async handlePlayerClick(row, col) {
    // ── Guard: game already over ──────────────
    if (this._gameOver) {
      this._emit('error', { message: 'Game is already over.' });
      return;
    }

    // ── Guard: previous cascade still running ─
    if (this._isProcessing) {
      this._emit('error', { message: 'Please wait for the current cascade to finish.' });
      return;
    }

    // ── Guard: bounds check ───────────────────
    if (!this._inBounds(row, col)) {
      this._emit('error', { message: `Cell (${row}, ${col}) is out of bounds.` });
      return;
    }

    const cell = this.grid[row][col];

    // ── Guard: cell belongs to a different player ─
    // A player may only click their own cells or empty cells.
    if (cell.owner !== EMPTY && cell.owner !== this.currentPlayer) {
      this._emit('error', {
        message: `Cell (${row}, ${col}) belongs to Player ${cell.owner}. You cannot place there.`,
      });
      return;
    }

    // ─────────────────────────────────────────
    //  VALID MOVE: place one orb
    // ─────────────────────────────────────────
    this._placeOrb(cell, this.currentPlayer);

    // Mark that this player has now placed at least once
    this._hasPlacedOrb[this.currentPlayer] = true;

    // Check if the entire first round is now complete
    if (!this._firstRoundComplete && this._hasPlacedOrb.every(Boolean)) {
      this._firstRoundComplete = true;
    }

    // Emit state immediately so the frontend can draw the placed orb
    this._emitStateChange();

    // ─────────────────────────────────────────
    //  Run explosion cascade (async, step-by-step)
    // ─────────────────────────────────────────
    this._isProcessing = true;
    await this._processExplosions();
    this._isProcessing = false;

    // ─────────────────────────────────────────
    //  Post-cascade: check win condition, advance turn
    // ─────────────────────────────────────────
    if (!this._gameOver) {
      this._advanceTurn();
    }
  }

  /**
   * Resets the game with the same configuration (rematch).
   */
  restart() {
    this._resetState();
    this._emitStateChange();
  }

  /**
   * Resets the game with a new configuration.
   * @param {Object} config – Same shape as the constructor config.
   */
  newGame(config) {
    const { rows, cols, totalPlayers } = config;
    this._validateConfig(rows, cols, totalPlayers);
    this.rows         = rows;
    this.cols         = cols;
    this.totalPlayers = totalPlayers;
    this._resetState();
    this._emitStateChange();
  }


  // ──────────────────────────────────────────
  //  CORE GAME LOGIC — ORB PLACEMENT
  // ──────────────────────────────────────────

  /**
   * Places one orb of the given player's colour onto the cell.
   * Ownership is transferred to the placing player.
   *
   * @param {Cell}   cell
   * @param {number} playerId
   */
  _placeOrb(cell, playerId) {
    cell.owner = playerId;
    cell.orbCount++;
    // Note: we do NOT check for explosion here.
    // Explosion logic lives entirely inside _processExplosions().
  }


  // ──────────────────────────────────────────
  //  CORE GAME LOGIC — ASYNC EXPLOSION ENGINE
  // ──────────────────────────────────────────

  /**
   * ASYNC CASCADE ENGINE
   * ────────────────────
   * Scans the grid for any cells that have reached or exceeded their
   * capacity. Collects all such cells into a "wave", explodes them
   * simultaneously, then waits EXPLOSION_DELAY_MS before scanning again.
   *
   * This continues until no more explosive cells remain — at which
   * point the board has "settled" and control returns to the caller.
   *
   * WHY WAVE-BASED (not recursive depth-first)?
   *   Exploding all ready cells simultaneously per tick closely
   *   matches the real board-game behaviour and avoids visual
   *   ordering artefacts. It also means the animation delay maps
   *   cleanly to a "frame" of animation.
   *
   * STATE CHANGES DURING AN EXPLOSION (per cell that explodes):
   *   1. cell.orbCount -= cell.capacity
   *      (orbs leave the exploding cell)
   *   2. If cell.orbCount === 0  →  cell.owner = EMPTY
   *      (cell becomes ownerless; may be recaptured next turn)
   *   3. For each valid neighbour of the cell:
   *        neighbour.orbCount += 1
   *        neighbour.owner     = currentPlayer   ← OWNERSHIP TRANSFER
   *      (the current player "captures" neighbours through the blast)
   *
   * After processing a wave:
   *   - Eliminated players (orbCount drops to 0, first round done) are removed.
   *   - Win condition is checked.
   *   - "state_change" event is emitted so the frontend can repaint.
   *
   * @returns {Promise<void>}
   */
  async _processExplosions() {
    // Keep looping as long as there is at least one explosive cell
    while (true) {
      // ── 1. Collect all cells that need to explode this wave ──
      const wave = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c].isCritical) {
            wave.push(this.grid[r][c]);
          }
        }
      }

      // ── 2. If no cells need to explode, the board has settled ──
      if (wave.length === 0) break;

      // ── 3. Emit one "explosion" event per cell in the wave ──
      //       The frontend uses this to show a burst visual effect.
      wave.forEach(cell => {
        this._emit('explosion', {
          row:    cell.row,
          col:    cell.col,
          player: cell.owner,   // Who caused this explosion
        });
      });

      // ── 4. Apply all explosions simultaneously ────────────────
      //
      //       We collect all neighbour increments into a pending list
      //       BEFORE applying any, so that a cell exploding in this wave
      //       does not double-count an orb from another cell in the same wave.
      //
      /** @type {Array<{cell: Cell, playerId: number}>} */
      const pendingAdds = [];

      wave.forEach(cell => {
        // The exploding cell loses exactly `capacity` orbs.
        // (If somehow orbCount > capacity due to a rapid burst, we
        //  subtract only capacity so the remainder stays put and
        //  may trigger again in the next wave.)
        cell.orbCount -= cell.capacity;

        // If the cell is now empty, release ownership.
        // It can be recaptured by the first orb that lands on it.
        if (cell.orbCount <= 0) {
          cell.orbCount = 0;
          cell.owner    = EMPTY;
        }

        // Queue one orb addition for each orthogonal neighbour
        const neighbours = this._getNeighbours(cell.row, cell.col);
        neighbours.forEach(neighbour => {
          pendingAdds.push({ cell: neighbour, playerId: this.currentPlayer });
        });
      });

      // ── 5. Apply the queued neighbour increments ──────────────
      //
      //       Ownership always transfers to `currentPlayer`.
      //       This is the "chain reaction capture" mechanic.
      pendingAdds.forEach(({ cell, playerId }) => {
        cell.orbCount++;
        cell.owner = playerId;   // ← OWNERSHIP TRANSFER
      });

      // ── 6. Handle eliminations after each wave ─────────────────
      //       A player is eliminated if:
      //         (a) the first round is complete (everyone has placed once), AND
      //         (b) they currently have zero orbs on the board.
      if (this._firstRoundComplete) {
        this._checkEliminations();
      }

      // ── 7. Check win condition ─────────────────────────────────
      //       If only one player has orbs remaining, they win.
      if (this._checkWin()) {
        this._emitStateChange();
        return; // Stop the cascade — game is over
      }

      // ── 8. Emit state so the frontend can render this wave's result ─
      this._emitStateChange();

      // ── 9. Mandatory delay — this is what separates animation frames ─
      //       The frontend renders the "state_change" event above, then
      //       200 ms later the next wave begins.
      await new Promise(resolve => setTimeout(resolve, EXPLOSION_DELAY_MS));
    }
    // Loop ends when wave === [] — board is fully settled.
  }


  // ──────────────────────────────────────────
  //  TURN MANAGEMENT
  // ──────────────────────────────────────────

  /**
   * Advances `currentPlayer` to the next active (non-eliminated) player.
   * Emits a "turn_change" event so the frontend can update the UI.
   */
  _advanceTurn() {
    const previousPlayer = this.currentPlayer;

    // Walk forward through player IDs, wrapping around, until we find
    // a player who is still active.
    let next = (this.currentPlayer + 1) % this.totalPlayers;
    let safety = 0; // Prevent infinite loop in edge cases

    while (!this.activePlayers.has(next)) {
      next = (next + 1) % this.totalPlayers;
      safety++;
      if (safety > this.totalPlayers) {
        // Theoretically impossible (game would have ended), but guard anyway
        break;
      }
    }

    this.currentPlayer = next;

    this._emit('turn_change', {
      previousPlayer,
      currentPlayer: this.currentPlayer,
    });
  }

  // ──────────────────────────────────────────
  //  ELIMINATION LOGIC
  // ──────────────────────────────────────────

  /**
   * Scans all active players and eliminates any whose total orb
   * count has dropped to zero (only valid after the first round).
   *
   * Called after every explosion wave.
   */
  _checkEliminations() {
    // Tally orbs per player across the entire grid
    const orbsPerPlayer = this._countOrbsPerPlayer();

    this.activePlayers.forEach(playerId => {
      const orbs = orbsPerPlayer.get(playerId) ?? 0;
      if (orbs === 0) {
        this.activePlayers.delete(playerId);
        this._emit('player_eliminated', { playerId });
      }
    });
  }

  /**
   * Returns a Map<playerId, totalOrbCount> for all players.
   * @returns {Map<number, number>}
   */
  _countOrbsPerPlayer() {
    const counts = new Map();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.owner !== EMPTY) {
          counts.set(cell.owner, (counts.get(cell.owner) ?? 0) + cell.orbCount);
        }
      }
    }
    return counts;
  }


  // ──────────────────────────────────────────
  //  WIN CONDITION
  // ──────────────────────────────────────────

  /**
   * Checks whether the game is over.
   *
   * Victory condition: exactly one player has orbs on the board
   * AND the first round is complete (so the board is not simply
   * "empty except for one player" at the very start).
   *
   * @returns {boolean}  True if the game has just ended.
   */
  _checkWin() {
    if (!this._firstRoundComplete) return false;

    const orbsPerPlayer = this._countOrbsPerPlayer();

    // Players with any orbs on the board
    const playersWithOrbs = [...orbsPerPlayer.entries()]
      .filter(([, count]) => count > 0)
      .map(([id]) => id);

    if (playersWithOrbs.length === 1) {
      this._gameOver = true;
      this.winner    = playersWithOrbs[0];
      this._emit('game_over', { winner: this.winner });
      return true;
    }

    return false;
  }


  // ──────────────────────────────────────────
  //  UTILITY HELPERS
  // ──────────────────────────────────────────

  /**
   * Returns all valid orthogonal (up/down/left/right) neighbours of
   * the cell at (row, col), as Cell references — not copies.
   *
   * Diagonals are NOT neighbours in Chain Reaction.
   *
   * @param {number} row
   * @param {number} col
   * @returns {Cell[]}
   */
  _getNeighbours(row, col) {
    const directions = [
      [-1,  0],  // up
      [ 1,  0],  // down
      [ 0, -1],  // left
      [ 0,  1],  // right
    ];

    return directions
      .map(([dr, dc]) => [row + dr, col + dc])
      .filter(([r, c]) => this._inBounds(r, c))
      .map(([r, c]) => this.grid[r][c]);
  }

  /**
   * Returns true if (row, col) is a valid cell coordinate.
   * @param {number} row
   * @param {number} col
   * @returns {boolean}
   */
  _inBounds(row, col) {
    return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
  }

  /**
   * Emits a full "state_change" event with a deep snapshot of the
   * current game state. The frontend should use this (not internal
   * Cell references) to update its rendering.
   */
  _emitStateChange() {
    this._emit('state_change', this.getSnapshot());
  }

  /**
   * Throws if the provided config values are invalid.
   * @param {number} rows
   * @param {number} cols
   * @param {number} totalPlayers
   */
  _validateConfig(rows, cols, totalPlayers) {
    if (!Number.isInteger(rows) || rows < 2) {
      throw new RangeError(`rows must be an integer ≥ 2, got: ${rows}`);
    }
    if (!Number.isInteger(cols) || cols < 2) {
      throw new RangeError(`cols must be an integer ≥ 2, got: ${cols}`);
    }
    if (!Number.isInteger(totalPlayers) || totalPlayers < 2 || totalPlayers > 10) {
      throw new RangeError(`totalPlayers must be an integer between 2 and 10, got: ${totalPlayers}`);
    }
  }


  // ──────────────────────────────────────────
  //  READ-ONLY QUERY API (for the frontend)
  // ──────────────────────────────────────────

  /**
   * Returns a fully serialisable snapshot of the current game state.
   * This is the canonical data shape your frontend should consume.
   *
   * @returns {{
   *   rows:                number,
   *   cols:                number,
   *   totalPlayers:        number,
   *   currentPlayer:       number,
   *   activePlayers:       number[],
   *   firstRoundComplete:  boolean,
   *   isProcessing:        boolean,
   *   gameOver:            boolean,
   *   winner:              number|null,
   *   grid:                Object[][]   ← Cell.snapshot() objects
   * }}
   */
  getSnapshot() {
    return {
      rows:               this.rows,
      cols:               this.cols,
      totalPlayers:       this.totalPlayers,
      currentPlayer:      this.currentPlayer,
      activePlayers:      [...this.activePlayers],
      firstRoundComplete: this._firstRoundComplete,
      isProcessing:       this._isProcessing,
      gameOver:           this._gameOver,
      winner:             this.winner,
      grid:               this.grid.map(row => row.map(cell => cell.snapshot())),
    };
  }

  /**
   * Returns the Cell object at (row, col).
   * Prefer getSnapshot() for read-only rendering; this is for
   * advanced use cases like AI agents that need live references.
   *
   * @param {number} row
   * @param {number} col
   * @returns {Cell}
   */
  getCell(row, col) {
    if (!this._inBounds(row, col)) {
      throw new RangeError(`(${row}, ${col}) is out of bounds.`);
    }
    return this.grid[row][col];
  }
}


// ─────────────────────────────────────────────
//  EXPORT
// ─────────────────────────────────────────────

// Supports both CommonJS (Node / bundlers) and browser globals
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChainReactionGame, EMPTY, EXPLOSION_DELAY_MS };
} else if (typeof window !== 'undefined') {
  window.ChainReactionGame    = ChainReactionGame;
  window.CHAIN_REACTION_EMPTY = EMPTY;
}


/* ============================================================
   USAGE EXAMPLE — (remove before production)
   ============================================================

  const game = new ChainReactionGame({ rows: 9, cols: 6, totalPlayers: 4 });

  // Subscribe to all relevant events
  const unsubStateChange = game.on('state_change', snapshot => {
    console.log('State updated. Current player:', snapshot.currentPlayer);
    // → redraw your canvas here
  });

  game.on('explosion', ({ row, col, player }) => {
    console.log(`💥 Player ${player}'s cell at (${row},${col}) exploded!`);
    // → trigger particle burst at (row, col)
  });

  game.on('turn_change', ({ previousPlayer, currentPlayer }) => {
    console.log(`Turn: P${previousPlayer} → P${currentPlayer}`);
    // → update turn indicator UI
  });

  game.on('player_eliminated', ({ playerId }) => {
    console.log(`Player ${playerId} has been eliminated.`);
    // → grey out that player's colour, show elimination animation
  });

  game.on('game_over', ({ winner }) => {
    console.log(`🏆 Player ${winner} wins!`);
    // → show victory screen
    unsubStateChange(); // clean up listener
  });

  game.on('error', ({ message }) => {
    console.warn('Invalid move:', message);
    // → flash an error indicator on the cell
  });

  // Simulate a move (would be called from a canvas click handler):
  await game.handlePlayerClick(0, 0);

   ============================================================ */
