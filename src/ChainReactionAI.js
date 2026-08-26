/**
 * ============================================================
 * NEXUS PROTOCOL — CHAIN REACTION AI ENGINE
 * ============================================================
 *
 * Weighted-heuristic move picker. For every legal move, this module
 * simulates the resulting explosion cascade on a disposable copy of the
 * board (a pure, side-effect-free re-implementation of the engine's
 * cascade rules — see `_simulateMove`), scores the resulting position
 * with a small set of features (`_evaluate`), then picks a move using a
 * difficulty-specific strategy (`_pickByDifficulty`).
 *
 * This is a single-ply evaluation — "how good is the board right after
 * my move settles" — not a multi-ply search against opponent replies.
 * It is intentionally cheap (no recursion, no opponent modelling) so it
 * stays instant even on large boards.
 */
class ChainReactionAI {

  /**
   * Analyzes the board state and returns the AI's chosen move.
   * @param {ChainReactionGame} gameInstance - The active engine instance
   * @param {number} aiPlayerId - The player ID assigned to the computer
   * @param {'easy'|'medium'|'hard'} [difficulty='medium']
   * @returns {{row: number, col: number} | null}
   */
  static getBestMove(gameInstance, aiPlayerId, difficulty = 'medium') {
    const profile = ChainReactionAI.DIFFICULTIES[difficulty] || ChainReactionAI.DIFFICULTIES.medium;
    const snapshot = gameInstance.getSnapshot();
    const { rows, cols } = snapshot;

    // 1. Compile all legal moves — empty cells or cells the AI already owns.
    const legalMoves = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = snapshot.grid[r][c];
        if (cell.owner === -1 || cell.owner === aiPlayerId) {
          legalMoves.push({ row: r, col: c });
        }
      }
    }
    if (legalMoves.length === 0) return null;

    // 2. Simulate + score every legal move.
    const scored = legalMoves.map(move => {
      const { grid: resultGrid, wavesTriggered } = ChainReactionAI._simulateMove(
        snapshot.grid, rows, cols, move.row, move.col, aiPlayerId
      );
      const features = ChainReactionAI._evaluate(resultGrid, rows, cols, aiPlayerId, snapshot.activePlayers);
      const score = ChainReactionAI._scoreFeatures(features, profile, wavesTriggered);
      return { ...move, score, isWin: features.isWin };
    });

    // 3. Pick a move using the difficulty's selection strategy.
    return ChainReactionAI._pickByDifficulty(scored, profile);
  }

  // ──────────────────────────────────────────
  //  DIFFICULTY PROFILES
  // ──────────────────────────────────────────
  //
  // `weights` tune how much each evaluation feature counts toward a
  // move's score. `randomness` controls how the final move is chosen
  // from the scored list — 0 always takes the top move, 1 ignores the
  // score entirely and picks uniformly at random. `topPoolFraction`
  // additionally limits *which* moves are eligible to be picked at
  // random (as a fraction of all legal moves, sorted best-first).
  static get DIFFICULTIES() {
    return {
      easy: {
        weights: { orbDelta: 1, cellControl: 0.4, corner: 0.5, threat: 0, eliminate: 3, chain: 0.1 },
        randomness: 0.75,
        topPoolFraction: 0.6,
      },
      medium: {
        weights: { orbDelta: 1.4, cellControl: 0.8, corner: 0.9, threat: 0.6, eliminate: 6, chain: 0.3 },
        randomness: 0.25,
        topPoolFraction: 0.3,
      },
      hard: {
        weights: { orbDelta: 1.8, cellControl: 1.1, corner: 1.1, threat: 1.4, eliminate: 9, chain: 0.5 },
        randomness: 0.05,
        topPoolFraction: 0.08,
      },
    };
  }

  /** A winning move is scored so far above everything else that it is
   *  effectively always chosen, regardless of difficulty. */
  static get WIN_SCORE_BONUS() { return 100000; }

  // ──────────────────────────────────────────
  //  MOVE SIMULATION (pure — never touches the live game)
  // ──────────────────────────────────────────

  /**
   * Simulates placing an orb for `playerId` at (row, col) on a cloned
   * plain-object grid and resolves the resulting cascade, mirroring the
   * engine's wave-based rules (orthogonal neighbours, capacity, ownership
   * transfer). Capped at a small wave limit purely to bound the cost of
   * evaluating many candidate moves per turn — this is a fixed, private
   * limit for simulation performance, unrelated to the engine's own
   * (much larger) safety cap.
   *
   * @returns {{ grid: Object[][], wavesTriggered: number }}
   */
  static _simulateMove(sourceGrid, rows, cols, row, col, playerId) {
    const grid = ChainReactionAI._cloneGrid(sourceGrid);
    const start = grid[row][col];
    start.owner = playerId;
    start.orbCount++;

    const SIMULATION_WAVE_CAP = 200;
    let wavesTriggered = 0;

    while (wavesTriggered < SIMULATION_WAVE_CAP) {
      const wave = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c].orbCount >= grid[r][c].capacity) wave.push(grid[r][c]);
        }
      }
      if (wave.length === 0) break;
      wavesTriggered++;

      const pendingAdds = [];
      wave.forEach(cell => {
        cell.orbCount -= cell.capacity;
        if (cell.orbCount <= 0) {
          cell.orbCount = 0;
          cell.owner = -1;
        }
        ChainReactionAI._neighboursOf(cell.row, cell.col, rows, cols).forEach(([nr, nc]) => {
          pendingAdds.push(grid[nr][nc]);
        });
      });
      pendingAdds.forEach(cell => {
        cell.orbCount++;
        cell.owner = playerId;
      });
    }

    return { grid, wavesTriggered };
  }

  static _cloneGrid(sourceGrid) {
    return sourceGrid.map(row => row.map(cell => ({
      row: cell.row, col: cell.col, capacity: cell.capacity,
      orbCount: cell.orbCount, owner: cell.owner,
    })));
  }

  static _neighboursOf(row, col, rows, cols) {
    const out = [];
    if (row > 0) out.push([row - 1, col]);
    if (row < rows - 1) out.push([row + 1, col]);
    if (col > 0) out.push([row, col - 1]);
    if (col < cols - 1) out.push([row, col + 1]);
    return out;
  }

  // ──────────────────────────────────────────
  //  POSITION EVALUATION
  // ──────────────────────────────────────────

  /**
   * Extracts scoring features from a (simulated) grid.
   * @returns {{orbDelta:number, cellControl:number, corner:number, threat:number, eliminatedCount:number, isWin:boolean}}
   */
  static _evaluate(grid, rows, cols, aiPlayerId, activePlayers) {
    let myOrbs = 0, oppOrbs = 0, myCells = 0, cornerCells = 0;
    const orbsByPlayer = new Map();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell.owner === -1) continue;
        orbsByPlayer.set(cell.owner, (orbsByPlayer.get(cell.owner) || 0) + cell.orbCount);
        if (cell.owner === aiPlayerId) {
          myOrbs += cell.orbCount;
          myCells++;
          const isCorner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
          if (isCorner) cornerCells++;
        } else {
          oppOrbs += cell.orbCount;
        }
      }
    }

    // Threat exposure: opponent cells one orb away from exploding that
    // are adjacent to AI-owned territory — these can flip AI cells next.
    let threat = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell.owner === -1 || cell.owner === aiPlayerId) continue;
        if (cell.orbCount >= cell.capacity - 1) {
          const touchesMine = ChainReactionAI._neighboursOf(r, c, rows, cols)
            .some(([nr, nc]) => grid[nr][nc].owner === aiPlayerId);
          if (touchesMine) threat++;
        }
      }
    }

    // Eliminated opponents (only meaningful once every player has moved
    // once — activePlayers already reflects that from the live snapshot).
    let eliminatedCount = 0;
    activePlayers.forEach(playerId => {
      if (playerId === aiPlayerId) return;
      if (!orbsByPlayer.get(playerId)) eliminatedCount++;
    });

    const remainingOwners = new Set(orbsByPlayer.keys());
    const isWin = activePlayers.length > 1 && remainingOwners.size === 1 && remainingOwners.has(aiPlayerId);

    return {
      orbDelta: myOrbs - oppOrbs,
      cellControl: myCells,
      corner: cornerCells,
      threat,
      eliminatedCount,
      isWin,
    };
  }

  static _scoreFeatures(features, profile, wavesTriggered) {
    const w = profile.weights;
    let score =
      w.orbDelta * features.orbDelta +
      w.cellControl * features.cellControl +
      w.corner * features.corner -
      w.threat * features.threat +
      w.eliminate * features.eliminatedCount +
      w.chain * wavesTriggered;

    if (features.isWin) score += ChainReactionAI.WIN_SCORE_BONUS;
    return score;
  }

  // ──────────────────────────────────────────
  //  MOVE SELECTION
  // ──────────────────────────────────────────

  /**
   * Picks a move from the scored list according to the difficulty
   * profile's randomness. A winning move is always taken immediately,
   * regardless of difficulty, so bots never "forget" to close out a win.
   */
  static _pickByDifficulty(scoredMoves, profile) {
    const winningMove = scoredMoves.find(m => m.isWin);
    if (winningMove) return { row: winningMove.row, col: winningMove.col };

    const ranked = [...scoredMoves].sort((a, b) => b.score - a.score);

    if (Math.random() < profile.randomness) {
      // Pick uniformly at random from the top pool (still biased toward
      // "not terrible" moves — even the easy bot rarely hands the board away).
      const poolSize = Math.max(1, Math.round(ranked.length * profile.topPoolFraction));
      const pool = ranked.slice(0, poolSize);
      const choice = pool[Math.floor(Math.random() * pool.length)];
      return { row: choice.row, col: choice.col };
    }

    // Otherwise take the best move, breaking exact ties randomly.
    const topScore = ranked[0].score;
    const tied = ranked.filter(m => m.score === topScore);
    const choice = tied[Math.floor(Math.random() * tied.length)];
    return { row: choice.row, col: choice.col };
  }
}

// Supports both CommonJS (Node / tests) and browser globals — mirrors the
// export pattern in ChainReactionEngine.js. Without the `window` branch,
// `ChainReactionAI` was only reachable in the browser via the shared
// top-level script scope (which is why it happened to work from
// index.html's inline script), not as a properly exposed global.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChainReactionAI };
} else if (typeof window !== 'undefined') {
  window.ChainReactionAI = ChainReactionAI;
}
