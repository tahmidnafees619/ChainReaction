/**
 * CHAIN REACTION ENGINE — TEST SUITE
 * Run with:  node ChainReactionEngine.test.js
 *
 * Uses only Node.js built-ins. No test framework required.
 */

'use strict';

const { ChainReactionGame, EMPTY } = require('./ChainReactionEngine');

// ─────────────────────────────────────────────
//  Async test queue — must be declared first
// ─────────────────────────────────────────────

const asyncTests = [];
function await_test(fn, label) {
  asyncTests.push({ fn, label });
}

// ─────────────────────────────────────────────
//  Minimal assertion helpers
// ─────────────────────────────────────────────

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

function assertEqual(a, b, label) {
  assert(a === b, `${label} — expected ${b}, got ${a}`);
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 52 - title.length))}`);
}

// ─────────────────────────────────────────────
//  Helper: collect events during an async op
// ─────────────────────────────────────────────
function collectEvents(game, eventName) {
  const events = [];
  const unsub = game.on(eventName, payload => events.push(payload));
  return { events, unsub };
}

// ─────────────────────────────────────────────
//  TEST 1 — Construction & Config Validation
// ─────────────────────────────────────────────
section('Construction & Config Validation');

{
  const game = new ChainReactionGame({ rows: 9, cols: 6, totalPlayers: 2 });
  assertEqual(game.rows, 9, 'rows stored');
  assertEqual(game.cols, 6, 'cols stored');
  assertEqual(game.totalPlayers, 2, 'totalPlayers stored');
  assertEqual(game.currentPlayer, 0, 'starts at player 0');
  assertEqual(game.activePlayers.size, 2, '2 active players');
  assert(!game._gameOver, 'game not over at start');
  assert(game.winner === null, 'no winner at start');
}

// Bad config should throw
{
  let threw = false;
  try { new ChainReactionGame({ rows: 1, cols: 5, totalPlayers: 2 }); }
  catch { threw = true; }
  assert(threw, 'throws on rows < 2');
}
{
  let threw = false;
  try { new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 11 }); }
  catch { threw = true; }
  assert(threw, 'throws on totalPlayers > 10');
}
{
  let threw = false;
  try { new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 1 }); }
  catch { threw = true; }
  assert(threw, 'throws on totalPlayers < 2');
}

// ─────────────────────────────────────────────
//  TEST 2 — Capacity Calculation
// ─────────────────────────────────────────────
section('Critical-Mass Capacity Calculation');

{
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 2 });

  // Corners (4 corners on a 5×5 grid)
  for (const [r, c] of [[0,0],[0,4],[4,0],[4,4]]) {
    assertEqual(game.getCell(r,c).capacity, 2, `corner (${r},${c}) capacity=2`);
  }

  // Edge (non-corner) — top row middle
  assertEqual(game.getCell(0, 2).capacity, 3, 'top-edge capacity=3');
  assertEqual(game.getCell(2, 0).capacity, 3, 'left-edge capacity=3');
  assertEqual(game.getCell(4, 2).capacity, 3, 'bottom-edge capacity=3');
  assertEqual(game.getCell(2, 4).capacity, 3, 'right-edge capacity=3');

  // Interior
  assertEqual(game.getCell(2, 2).capacity, 4, 'center capacity=4');
  assertEqual(game.getCell(1, 1).capacity, 4, 'inner (1,1) capacity=4');
}

// ─────────────────────────────────────────────
//  TEST 3 — Basic Orb Placement
// ─────────────────────────────────────────────
section('Basic Orb Placement');

{
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 2 });

  // Player 0 places on empty cell
  await_test(async () => {
    await game.handlePlayerClick(2, 2);
    const cell = game.getCell(2, 2);
    assertEqual(cell.orbCount, 1, 'cell has 1 orb after first click');
    assertEqual(cell.owner, 0, 'cell owned by player 0');
    assertEqual(game.currentPlayer, 1, 'turn advanced to player 1');
  }, 'player 0 places orb');

  // Player 1 places on different empty cell
  await_test(async () => {
    await game.handlePlayerClick(0, 0);
    const cell = game.getCell(0, 0);
    assertEqual(cell.orbCount, 1, 'corner has 1 orb');
    assertEqual(cell.owner, 1, 'corner owned by player 1');
    assertEqual(game.currentPlayer, 0, 'turn back to player 0');
  }, 'player 1 places orb');
}

// ─────────────────────────────────────────────
//  TEST 4 — Invalid Moves
// ─────────────────────────────────────────────
section('Invalid Move Rejection');

{
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 2 });

  await_test(async () => {
    // P0 places
    await game.handlePlayerClick(0, 0);
    // P1 places
    await game.handlePlayerClick(4, 4);
    // P0 tries to click P1's cell → error
    const { events, unsub } = collectEvents(game, 'error');
    await game.handlePlayerClick(4, 4);
    unsub();
    assert(events.length > 0, 'error emitted when clicking opponent cell');
    assertEqual(game.currentPlayer, 0, 'turn NOT advanced on invalid move');
  }, 'clicking opponent cell fires error');
}

// ─────────────────────────────────────────────
//  TEST 5 — Simple Explosion
// ─────────────────────────────────────────────
section('Simple Single-Cell Explosion');

{
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 2 });

  await_test(async () => {
    // Load corner (0,0) capacity=2 with 1 orb from P0
    await game.handlePlayerClick(0, 0); // P0 → corner, orbCount=1
    await game.handlePlayerClick(4, 4); // P1 → away

    // P0 clicks (0,0) again → orbCount=2 = capacity → should explode
    const explosionEvents = [];
    const unsub = game.on('explosion', e => explosionEvents.push(e));
    await game.handlePlayerClick(0, 0);
    unsub();

    assert(explosionEvents.length >= 1, 'explosion event emitted');
    assert(explosionEvents[0].row === 0 && explosionEvents[0].col === 0, 'explosion at (0,0)');

    // After explosion, corner (0,0) should have 0 orbs (2 went to 2 neighbours)
    const corner = game.getCell(0, 0);
    assertEqual(corner.orbCount, 0, 'corner emptied after explosion');
    assertEqual(corner.owner, EMPTY, 'corner ownership cleared');

    // Neighbours (0,1) and (1,0) should each have 1 orb owned by P0
    const right  = game.getCell(0, 1);
    const below  = game.getCell(1, 0);
    assert(right.orbCount >= 1, '(0,1) received orb');
    assertEqual(right.owner, 0, '(0,1) now owned by P0');
    assert(below.orbCount >= 1, '(1,0) received orb');
    assertEqual(below.owner, 0, '(1,0) now owned by P0');
  }, 'corner explosion distributes to 2 neighbours');
}

// ─────────────────────────────────────────────
//  TEST 6 — Ownership Transfer via Explosion
// ─────────────────────────────────────────────
section('Ownership Transfer Through Explosion');

{
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 2 });

  await_test(async () => {
    // P0 places on (0,1) — an edge cell with capacity 3
    await game.handlePlayerClick(0, 1); // P0, orbCount=1
    // P1 places on (0,0) — corner, capacity 2
    await game.handlePlayerClick(0, 0); // P1, orbCount=1
    // P0 adds to (0,1) again
    await game.handlePlayerClick(0, 1); // P0, orbCount=2
    // P1 adds to (0,0) — now orbCount=2 = capacity=2 → EXPLODES
    // Explosion spreads to (0,1) and (1,0)
    // (0,1) is currently P0's but blast converts it to P1
    await game.handlePlayerClick(0, 0); // P1, triggers explosion

    const edgeCell = game.getCell(0, 1);
    // After P1's corner explodes into (0,1), (0,1) should be owned by P1
    assertEqual(edgeCell.owner, 1, '(0,1) captured by P1 explosion');
  }, 'explosion converts opponent-owned neighbour');
}

// ─────────────────────────────────────────────
//  TEST 7 — Chain Reaction Cascade
// ─────────────────────────────────────────────
section('Multi-Step Chain Reaction Cascade');

{
  // Use a small 3×1 grid to force a simple chain
  // Cells: (0,0)[cap2] (0,1)[cap2-edge, actually it's 1 col so both are corners]
  // Wait — minimum 2 rows AND cols. Use 2×3 grid.
  // (0,0)[cap2] (0,1)[cap3] (0,2)[cap2]
  //
  // Strategy:
  //   Fill (0,1) to 2 orbs (P0), (0,0) to 1 orb (P0)
  //   Then add to (0,0) → (0,0) explodes → pushes orb to (0,1)
  //   (0,1) now at 3 = capacity → chain explosion →
  //   pushes into (0,0) [back] and (0,2) and (1,1)

  const game = new ChainReactionGame({ rows: 2, cols: 3, totalPlayers: 2 });
  // Capacities: corners (0,0),(0,2),(1,0),(1,2) = 2; edges (0,1),(1,1) = 3

  await_test(async () => {
    // Load (0,1) up: P0 places twice, P1 plays elsewhere
    await game.handlePlayerClick(0, 1); // P0: (0,1)=1
    await game.handlePlayerClick(1, 2); // P1: away
    await game.handlePlayerClick(0, 1); // P0: (0,1)=2
    await game.handlePlayerClick(1, 2); // P1: (1,2)=2 → may chain on P1

    // P0 adds to (0,0) once
    await game.handlePlayerClick(0, 0); // P0: (0,0)=1
    await game.handlePlayerClick(1, 0); // P1: away

    // P0 adds to (0,0) again → (0,0) orbCount=2=capacity → EXPLODES
    // → (0,1) gets +1 (now 3 = capacity) → CHAIN EXPLODES
    const chainExplosions = [];
    const unsub = game.on('explosion', e => chainExplosions.push(e));
    await game.handlePlayerClick(0, 0); // P0: triggers chain
    unsub();

    assert(chainExplosions.length >= 2, `chain produced ≥2 explosions (got ${chainExplosions.length})`);
  }, 'chain reaction cascade fires multiple explosions');
}

// ─────────────────────────────────────────────
//  TEST 8 — Turn Rotation
// ─────────────────────────────────────────────
section('Turn Rotation (3 Players)');

{
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 3 });

  await_test(async () => {
    assertEqual(game.currentPlayer, 0, 'starts at P0');
    await game.handlePlayerClick(0, 0);
    assertEqual(game.currentPlayer, 1, 'advances to P1');
    await game.handlePlayerClick(0, 4);
    assertEqual(game.currentPlayer, 2, 'advances to P2');
    await game.handlePlayerClick(4, 0);
    assertEqual(game.currentPlayer, 0, 'wraps back to P0');
  }, '3-player rotation wraps correctly');
}

// ─────────────────────────────────────────────
//  TEST 9 — First-Round Elimination Guard
// ─────────────────────────────────────────────
section('First-Round Elimination Guard');

{
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 2 });

  await_test(async () => {
    // Only P0 has placed. P1 hasn't. No one should be eliminated.
    await game.handlePlayerClick(0, 0); // P0 places (now P1's turn)

    // Even if somehow P0 had 0 orbs (they don't here), elimination
    // must not trigger until _firstRoundComplete is true.
    assert(!game._firstRoundComplete, 'first round not complete after only P0 places');
    assertEqual(game.activePlayers.size, 2, 'still 2 active players after round 1 incomplete');
  }, 'no elimination before first round completes');
}

// ─────────────────────────────────────────────
//  TEST 10 — State Snapshot Shape
// ─────────────────────────────────────────────
section('Snapshot / Frontend Data Contract');

{
  const game = new ChainReactionGame({ rows: 3, cols: 3, totalPlayers: 2 });

  await_test(async () => {
    let lastSnapshot = null;
    const unsub = game.on('state_change', snap => { lastSnapshot = snap; });
    await game.handlePlayerClick(1, 1);
    unsub();

    assert(lastSnapshot !== null, 'state_change emitted');
    assert('grid' in lastSnapshot, 'snapshot has grid');
    assert('currentPlayer' in lastSnapshot, 'snapshot has currentPlayer');
    assert('activePlayers' in lastSnapshot, 'snapshot has activePlayers');
    assert('gameOver' in lastSnapshot, 'snapshot has gameOver');
    assert('winner' in lastSnapshot, 'snapshot has winner');
    assert('firstRoundComplete' in lastSnapshot, 'snapshot has firstRoundComplete');
    assert('isProcessing' in lastSnapshot, 'snapshot has isProcessing');

    // Grid dimensions
    assertEqual(lastSnapshot.grid.length, 3, 'grid rows = 3');
    assertEqual(lastSnapshot.grid[0].length, 3, 'grid cols = 3');

    // Cell shape
    const cell = lastSnapshot.grid[1][1];
    assert('row'      in cell, 'cell has row');
    assert('col'      in cell, 'cell has col');
    assert('orbCount' in cell, 'cell has orbCount');
    assert('owner'    in cell, 'cell has owner');
    assert('capacity' in cell, 'cell has capacity');
  }, 'state_change snapshot has correct shape');
}

// ─────────────────────────────────────────────
//  TEST 11 — Restart Resets All State
// ─────────────────────────────────────────────
section('Restart / New Game');

{
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 2 });

  await_test(async () => {
    await game.handlePlayerClick(0, 0);
    await game.handlePlayerClick(0, 4);
    assertEqual(game.currentPlayer, 0, 'after 2 moves, back to P0');

    game.restart();
    assertEqual(game.currentPlayer, 0, 'after restart, currentPlayer = 0');
    assert(!game._gameOver, 'gameOver reset');
    assert(game.winner === null, 'winner reset');
    assertEqual(game.activePlayers.size, 2, 'active players restored');

    // Grid should be empty
    let totalOrbs = 0;
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++)
        totalOrbs += game.getCell(r, c).orbCount;
    assertEqual(totalOrbs, 0, 'all orbs cleared on restart');
  }, 'restart clears board and resets state');
}

// ─────────────────────────────────────────────
//  TEST 12 — 2×2 Full Game (Win Detection)
// ─────────────────────────────────────────────
section('Full 2×2 Game — Win Detection');

{
  // 2×2 grid: all cells are corners, capacity = 2.
  // Strategy (2 players):
  //   P0 loads (0,0) → at 2, it explodes into (0,1) and (1,0).
  //   With careful play P0 can capture all cells.

  const game = new ChainReactionGame({ rows: 2, cols: 2, totalPlayers: 2 });

  await_test(async () => {
    const gameOverEvents = [];
    const unsub = game.on('game_over', e => gameOverEvents.push(e));

    // Round 1: P0 → (0,0), P1 → (1,1)
    await game.handlePlayerClick(0, 0);
    await game.handlePlayerClick(1, 1);

    // Round 2: P0 → (0,0) again (orbCount=2 → EXPLODE → spreads to (0,1) & (1,0))
    await game.handlePlayerClick(0, 0);

    // After P0's explosion:
    //   (0,0) = 0 orbs | (0,1) = 1 orb P0 | (1,0) = 1 orb P0 | (1,1) = 1 orb P1
    // First round complete (both placed). Check if game continues.
    // P1 still has (1,1) so game continues. P1's turn.

    if (!game._gameOver) {
      // P1 plays (1,1) → (1,1) goes to 2 → EXPLODE → spreads to (0,1) & (1,0)
      // Now all cells owned by P1 or game might end differently.
      // Let's just check game eventually ends by playing it out.
      // Both P0 and P1 still alive after last move.
      await game.handlePlayerClick(1, 1); // P1's (1,1) = 2 → explodes

      // Play continues until someone wins — just run a few more rounds
      let moves = 0;
      while (!game._gameOver && moves < 40) {
        const snap = game.getSnapshot();
        // Find a cell the current player owns or any empty cell
        let placed = false;
        outer: for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 2; c++) {
            const cell = snap.grid[r][c];
            if (cell.owner === snap.currentPlayer || cell.owner === EMPTY) {
              await game.handlePlayerClick(r, c);
              placed = true;
              moves++;
              break outer;
            }
          }
        }
        if (!placed) break;
      }
    }

    unsub();
    // We may or may not reach game_over in this short test depending on moves,
    // but validate the game_over payload shape if it fires.
    if (gameOverEvents.length > 0) {
      assert(typeof gameOverEvents[0].winner === 'number', 'game_over has numeric winner');
      assert(game._gameOver, 'gameOver flag set true');
      assert(game.winner !== null, 'winner stored on game object');
    }

    // At minimum, ensure the game has not crashed and snapshot is coherent
    const snap = game.getSnapshot();
    assert(Array.isArray(snap.grid), 'grid still valid after multi-turn play');
  }, '2×2 game plays without error; game_over fires with correct payload');
}

// ─────────────────────────────────────────────
//  TEST 13 — Blocking Mid-Cascade Input
// ─────────────────────────────────────────────
section('Mid-Cascade Input Blocking');

{
  const game = new ChainReactionGame({ rows: 5, cols: 5, totalPlayers: 2 });

  await_test(async () => {
    // Load a cell that will definitely cascade
    await game.handlePlayerClick(0, 0); // P0
    await game.handlePlayerClick(4, 4); // P1

    const errors = [];
    game.on('error', e => errors.push(e));

    // Start an explosion but try to click before it resolves
    const cascadePromise = game.handlePlayerClick(0, 0); // Will explode corner

    // Immediately try another click while cascade is running
    // (this is a race but the flag is set synchronously at the start)
    await game.handlePlayerClick(0, 0); // Should be blocked

    await cascadePromise;

    assert(errors.length > 0, 'error emitted during mid-cascade click');
  }, 'mid-cascade clicks are rejected with error event');
}

// ─────────────────────────────────────────────
//  TEST 14 — getNeighbours correctness
// ─────────────────────────────────────────────
section('Neighbour Calculation');

{
  const game = new ChainReactionGame({ rows: 4, cols: 4, totalPlayers: 2 });

  // Corner has 2 neighbours
  const cornerNeighbours = game._getNeighbours(0, 0);
  assertEqual(cornerNeighbours.length, 2, 'corner has 2 neighbours');
  assert(cornerNeighbours.some(c => c.row === 0 && c.col === 1), 'right of corner is neighbour');
  assert(cornerNeighbours.some(c => c.row === 1 && c.col === 0), 'below corner is neighbour');

  // Edge cell has 3 neighbours
  const edgeNeighbours = game._getNeighbours(0, 2);
  assertEqual(edgeNeighbours.length, 3, 'top-edge has 3 neighbours');

  // Interior has 4 neighbours
  const interiorNeighbours = game._getNeighbours(2, 2);
  assertEqual(interiorNeighbours.length, 4, 'interior has 4 neighbours');

  // Diagonals should NOT be included
  const coords = interiorNeighbours.map(c => `${c.row},${c.col}`);
  assert(!coords.includes('1,1'), 'diagonal (1,1) NOT a neighbour of (2,2)');
  assert(!coords.includes('3,3'), 'diagonal (3,3) NOT a neighbour of (2,2)');
  assert(!coords.includes('1,3'), 'diagonal (1,3) NOT a neighbour of (2,2)');
  assert(!coords.includes('3,1'), 'diagonal (3,1) NOT a neighbour of (2,2)');
}

// ─────────────────────────────────────────────
//  Async test runner
// ─────────────────────────────────────────────

async function runAllAsync() {
  for (const { fn, label } of asyncTests) {
    try {
      await fn();
    } catch (err) {
      console.error(`  ❌  [THREW] ${label}:`, err.message);
      failed++;
    }
  }

  // ── Final report ──────────────────────────
  console.log('\n' + '═'.repeat(56));
  console.log(`  RESULTS: ${passed} passed  |  ${failed} failed`);
  console.log('═'.repeat(56));
  process.exit(failed > 0 ? 1 : 0);
}

runAllAsync();
