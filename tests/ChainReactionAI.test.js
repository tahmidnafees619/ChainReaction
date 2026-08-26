/**
 * CHAIN REACTION AI — SMOKE TEST SUITE
 * Run with:  node tests/ChainReactionAI.test.js  (or: npm test)
 *
 * This is not exhaustive coverage of the heuristic's tuning — it's a
 * sanity net around the AI rewrite: legal moves only, wins get taken,
 * no exceptions on edge-case boards. Same hand-rolled style as
 * ChainReactionEngine.test.js — no framework, no dependencies.
 */

'use strict';

const { ChainReactionGame } = require('../src/ChainReactionEngine');
const { ChainReactionAI } = require('../src/ChainReactionAI');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 52 - title.length))}`);
}

function isLegalMove(game, move, playerId) {
  if (!move) return false;
  if (!Number.isInteger(move.row) || !Number.isInteger(move.col)) return false;
  const cell = game.getCell(move.row, move.col);
  return cell.owner === -1 || cell.owner === playerId;
}

// ─────────────────────────────────────────────
//  TEST 1 — Returns a legal move on a fresh board (all difficulties)
// ─────────────────────────────────────────────
section('Legal Move on Fresh Board');

for (const difficulty of ['easy', 'medium', 'hard']) {
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 2 });
  const move = ChainReactionAI.getBestMove(game, 1, difficulty);
  assert(isLegalMove(game, move, 1), `${difficulty}: getBestMove returns a legal move on a fresh 5x5 board`);
}

// ─────────────────────────────────────────────
//  TEST 2 — Default difficulty (no 3rd arg) still works
// ─────────────────────────────────────────────
section('Default Difficulty');

{
  const game = new ChainReactionGame({ rows: 4, cols: 4, totalPlayers: 2 });
  const move = ChainReactionAI.getBestMove(game, 0);
  assert(isLegalMove(game, move, 0), 'getBestMove works with difficulty omitted');
}

// ─────────────────────────────────────────────
//  TEST 3 — Hard difficulty takes an immediate win when available
// ─────────────────────────────────────────────
section('Hard Difficulty Takes The Win');

{
  // 2x2 board (all corners, capacity 2). Give P1 (the AI) a loaded corner
  // one orb from exploding, and P0 a single orb elsewhere. Exploding P1's
  // corner captures the whole board and wins immediately.
  const game = new ChainReactionGame({ rows: 2, cols: 2, totalPlayers: 2 });

  const c00 = game.getCell(0, 0); c00.owner = 1; c00.orbCount = 1; // AI, 1-away from exploding (cap 2)
  const c01 = game.getCell(0, 1); c01.owner = 1; c01.orbCount = 1;
  const c10 = game.getCell(1, 0); c10.owner = 1; c10.orbCount = 1;
  const c11 = game.getCell(1, 1); c11.owner = 0; c11.orbCount = 1; // last P0 orb on the board

  // Mark the first round complete so win detection is active, and make
  // both players "active" as the real engine would have them mid-game.
  game._firstRoundComplete = true;

  const move = ChainReactionAI.getBestMove(game, 1, 'hard');
  assert(isLegalMove(game, move, 1), 'move returned is legal');
  assert(move.row === 0 && move.col === 0, 'hard AI detonates the corner that wins outright');
}

// ─────────────────────────────────────────────
//  TEST 4 — No legal moves returns null
// ─────────────────────────────────────────────
section('No Legal Moves');

{
  // Fill every cell with an opponent's orbs so the AI has nothing to click.
  const game = new ChainReactionGame({ rows: 3, cols: 3, totalPlayers: 2 });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = game.getCell(r, c);
      cell.owner = 0;
      cell.orbCount = 1;
    }
  }
  const move = ChainReactionAI.getBestMove(game, 1, 'medium');
  assert(move === null, 'getBestMove returns null when the AI has no legal moves');
}

// ─────────────────────────────────────────────
//  TEST 5 — No exceptions on a minimal 2x2 board, all difficulties
// ─────────────────────────────────────────────
section('Minimal Board Stability');

for (const difficulty of ['easy', 'medium', 'hard']) {
  try {
    const game = new ChainReactionGame({ rows: 2, cols: 2, totalPlayers: 2 });
    const move = ChainReactionAI.getBestMove(game, 0, difficulty);
    assert(isLegalMove(game, move, 0), `${difficulty}: legal move returned on minimal 2x2 board`);
  } catch (err) {
    assert(false, `${difficulty}: getBestMove threw on minimal board — ${err.message}`);
  }
}

// ─────────────────────────────────────────────
//  Final report
// ─────────────────────────────────────────────
console.log('\n' + '═'.repeat(56));
console.log(`  RESULTS: ${passed} passed  |  ${failed} failed`);
console.log('═'.repeat(56));
process.exit(failed > 0 ? 1 : 0);
