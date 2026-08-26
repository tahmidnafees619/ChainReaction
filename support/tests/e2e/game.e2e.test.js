/**
 * CHAIN REACTION — BROWSER (E2E) TEST SUITE
 * Run with:  node support/tests/e2e/game.e2e.test.js   (or: npm run test:e2e)
 *
 * Requires Playwright (`npm install` first — this is the one part of the
 * project that isn't zero-dependency; see README). Drives the actual
 * main.html in a real headless Chromium instance, the same way
 * ChainReactionEngine.test.js / ChainReactionAI.test.js drive the engine
 * directly under Node — except here nothing about the frontend is
 * reachable any other way: layout, CSS stacking, and event-wiring bugs
 * only exist once a real browser lays the page out and dispatches real
 * clicks.
 *
 * Every scenario in this file is a regression test for a bug that was
 * actually found by manual end-to-end testing and would NOT have been
 * caught by the engine/AI unit suites alone — see PROJECT_REPORT.md §7
 * (bugs #7, #8, #9 map directly to the sections below).
 */

'use strict';

const path = require('path');
const { chromium } = require('playwright');

const MAIN_HTML = 'file:///' + path.resolve(__dirname, '../../../main.html').replace(/\\/g, '/');

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

/** Fresh browser + page, with all console/page errors collected. */
async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 950 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
  return { page, errors };
}

/** Sets rows/cols sliders and returns once applied. */
async function setGridSize(page, rows, cols) {
  await page.$eval('#rows-slider', (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, rows);
  await page.$eval('#cols-slider', (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, cols);
  await page.waitForTimeout(30);
}

/** Cycles operative slot `index` (0-based) to a given controller state. */
async function setOperative(page, index, { bot, difficulty }) {
  let row = (await page.$$('.op-row'))[index];
  const isCurrentlyBot = await row.$eval('[data-role="bot"]', el => el.classList.contains('active'));
  if (bot && !isCurrentlyBot) {
    await row.$eval('[data-role="bot"]', el => el.click());
    await page.waitForTimeout(30);
  } else if (!bot && isCurrentlyBot) {
    await row.$eval('[data-role="human"]', el => el.click());
    await page.waitForTimeout(30);
  }
  if (bot && difficulty) {
    row = (await page.$$('.op-row'))[index];
    await row.$eval(`.diff-btn[data-diff="${difficulty}"]`, el => el.click());
    await page.waitForTimeout(30);
  }
}

async function run() {
  const browser = await chromium.launch();

  // ─────────────────────────────────────────────
  //  1 — Fresh load, no console errors
  // ─────────────────────────────────────────────
  section('Fresh Load');
  {
    const { page, errors } = await newPage(browser);
    await page.goto(MAIN_HTML);
    await page.waitForSelector('#operatives-list');
    assert(errors.length === 0, `menu loads with zero console/page errors (got ${errors.length})`);

    const globals = await page.evaluate(() => ({
      engine: typeof window.ChainReactionGame,
      ai: typeof window.ChainReactionAI,
    }));
    assert(globals.engine === 'function', 'ChainReactionGame is exposed on window');
    assert(globals.ai === 'function', 'ChainReactionAI is exposed on window');
    await page.close();
  }

  // ─────────────────────────────────────────────
  //  2 — Bot in slot 0 must still move (regression: PROJECT_REPORT.md §7 bug #7)
  // ─────────────────────────────────────────────
  section('Bot-First-Player Regression (bug #7)');
  {
    const { page, errors } = await newPage(browser);
    await page.goto(MAIN_HTML);
    await page.waitForSelector('#operatives-list');
    await setGridSize(page, 3, 3);
    await setOperative(page, 0, { bot: true, difficulty: 'hard' });
    await setOperative(page, 1, { bot: true, difficulty: 'hard' });

    await page.click('#start-btn');
    await page.waitForSelector('#game-screen:not(.hidden)');

    // If bug #7 regressed, the board stays completely empty forever.
    // NOTE: `game` is a page-level `let`, not `window.game` — it's reached
    // here the same way main.html's own inline script reaches it, via the
    // shared top-level script scope (see PROJECT_REPORT.md §7 bug notes on
    // ChainReactionAI's export for the same distinction).
    const progressed = await page.waitForFunction(() => {
      /* eslint-disable no-undef */
      if (typeof game === 'undefined' || !game) return false;
      return game.getSnapshot().grid.flat().some(c => c.orbCount > 0);
      /* eslint-enable no-undef */
    }, { timeout: 5000 }).then(() => true).catch(() => false);

    assert(progressed, 'a bot-controlled player 0 places its first move without a human click');
    assert(errors.length === 0, 'no console/page errors while player 0 (bot) opens the game');
    await page.close();
  }

  // ─────────────────────────────────────────────
  //  3 — In-game Menu button must be reachable (regression: bug #8)
  // ─────────────────────────────────────────────
  section('HUD Menu Button Not Obscured (bug #8)');
  for (const width of [1000, 480, 375]) {
    const { page } = await newPage(browser);
    await page.setViewportSize({ width, height: 800 });
    await page.goto(MAIN_HTML);
    await page.waitForSelector('#operatives-list');
    await page.click('#start-btn');
    await page.waitForSelector('#game-screen:not(.hidden)');
    await page.waitForTimeout(200);

    const hit = await page.evaluate(() => {
      const menuBtn = document.getElementById('btn-menu');
      const r = menuBtn.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top === menuBtn;
    });
    assert(hit, `#btn-menu receives its own clicks at viewport width ${width}px (not covered by the mute button)`);
    await page.close();
  }

  // ─────────────────────────────────────────────
  //  4 — Rapid start/bail cycles must never throw (regression: bug #9)
  // ─────────────────────────────────────────────
  section('Rapid Start/Bail Stress (bug #9)');
  {
    const { page, errors } = await newPage(browser);
    await page.goto(MAIN_HTML);
    await page.waitForSelector('#operatives-list');
    await setGridSize(page, 5, 5);
    await setOperative(page, 0, { bot: true, difficulty: 'hard' });
    await setOperative(page, 1, { bot: true, difficulty: 'hard' });

    for (let i = 0; i < 6; i++) {
      await page.click('#start-btn');
      await page.waitForSelector('#game-screen:not(.hidden)');
      // Vary the bail timing so some runs catch a bot mid-"thinking" delay
      // and some catch it mid-cascade.
      await page.waitForTimeout(150 + (i % 4) * 150);
      await page.click('#btn-menu');
      await page.waitForSelector('#menu-screen:not(.hidden)');
      await page.waitForTimeout(80);
    }
    assert(errors.length === 0, `6 rapid start→bail-to-menu cycles produce zero console/page errors (got ${errors.length}: ${errors[0] || ''})`);
    await page.close();
  }

  // ─────────────────────────────────────────────
  //  5 — Full game to completion, rematch, and return to menu
  // ─────────────────────────────────────────────
  section('Full Game → Rematch → Menu');
  {
    const { page, errors } = await newPage(browser);
    await page.goto(MAIN_HTML);
    await page.waitForSelector('#operatives-list');
    await setGridSize(page, 3, 3);
    await setOperative(page, 0, { bot: true, difficulty: 'hard' });
    await setOperative(page, 1, { bot: true, difficulty: 'hard' });

    await page.click('#start-btn');
    await page.waitForSelector('#game-screen:not(.hidden)');

    const gameOver = await page.waitForSelector('#gameover-overlay:not(.hidden)', { timeout: 45000 })
      .then(() => true).catch(() => false);
    assert(gameOver, 'an auto-played 2-bot game reaches game_over within 45s');

    if (gameOver) {
      const winner = await page.textContent('#go-name');
      assert(typeof winner === 'string' && winner.length > 0, `game-over overlay shows a winner name ("${winner}")`);

      await page.click('#go-rematch');
      await page.waitForTimeout(200);
      const overlayHidden = await page.$eval('#gameover-overlay', el => el.classList.contains('hidden'));
      assert(overlayHidden, 'Rematch hides the game-over overlay and resets the board');

      await page.waitForTimeout(1000); // let the rematch actually start playing
      await page.click('#btn-menu');
      await page.waitForTimeout(200);
      const backAtMenu = await page.$eval('#menu-screen', el => !el.classList.contains('hidden'));
      assert(backAtMenu, 'leaving mid-rematch returns cleanly to the menu screen');
    }
    assert(errors.length === 0, 'no console/page errors across the full game→rematch→menu flow');
    await page.close();
  }

  // ─────────────────────────────────────────────
  //  6 — Operatives panel: add / remove / toggle / difficulty
  // ─────────────────────────────────────────────
  section('Operatives Panel');
  {
    const { page, errors } = await newPage(browser);
    await page.goto(MAIN_HTML);
    await page.waitForSelector('#operatives-list');

    const initialCount = (await page.$$('.op-row')).length;
    await page.click('#add-player-btn');
    await page.waitForTimeout(50);
    assert((await page.$$('.op-row')).length === initialCount + 1, 'Add Operative increases the roster by one');

    const rowsAfterAdd = await page.$$('.op-row');
    await rowsAfterAdd[rowsAfterAdd.length - 1].$eval('.op-remove', el => el.click());
    await page.waitForTimeout(50);
    assert((await page.$$('.op-row')).length === initialCount, 'the remove (✕) button actually removes the operative');

    await setOperative(page, 1, { bot: true, difficulty: 'hard' });
    let row1 = (await page.$$('.op-row'))[1];
    const hardActive = await row1.$eval('.diff-btn[data-diff="hard"]', el => el.classList.contains('active'));
    assert(hardActive, 'selecting Hard marks it active immediately (no cycling required)');

    await setOperative(page, 1, { bot: false });
    row1 = (await page.$$('.op-row'))[1];
    const diffHidden = await row1.$eval('.diff-group', el => el.classList.contains('is-hidden'));
    assert(diffHidden, 'switching a slot to Human hides its difficulty control');

    await setOperative(page, 1, { bot: true });
    row1 = (await page.$$('.op-row'))[1];
    const remembered = await row1.$eval('.diff-btn.active', el => el.dataset.diff);
    assert(remembered === 'hard', 'switching back to Bot remembers the last-picked difficulty (got "' + remembered + '")');

    // Minimum-2-operatives guard
    while ((await page.$$('.op-row')).length > 2) {
      const rows = await page.$$('.op-row');
      await rows[rows.length - 1].$eval('.op-remove', el => el.click());
      await page.waitForTimeout(30);
    }
    const rowsAtMin = await page.$$('.op-row');
    await rowsAtMin[0].$eval('.op-remove', el => el.click());
    await page.waitForTimeout(150);
    assert((await page.$$('.op-row')).length === 2, 'cannot remove below the 2-operative minimum');
    const warnToast = await page.$('.toast-warn');
    assert(warnToast !== null, 'a warning toast is shown when the minimum is hit');

    assert(errors.length === 0, 'no console/page errors while managing operatives');
    await page.close();
  }

  // ─────────────────────────────────────────────
  //  7 — Mute toggle + persistence across reload
  // ─────────────────────────────────────────────
  section('Mute Persistence');
  {
    const { page, errors } = await newPage(browser);
    await page.goto(MAIN_HTML);
    await page.waitForSelector('#btn-mute');

    const before = await page.textContent('#btn-mute');
    await page.click('#btn-mute');
    await page.waitForTimeout(50);
    const afterToggle = await page.textContent('#btn-mute');
    assert(afterToggle !== before, 'clicking mute changes the icon');

    await page.reload();
    await page.waitForSelector('#btn-mute');
    const afterReload = await page.textContent('#btn-mute');
    assert(afterReload === afterToggle, 'the mute preference survives a page reload');

    // leave it unmuted for cleanliness
    if (afterReload === '🔇') await page.click('#btn-mute');

    assert(errors.length === 0, 'no console/page errors while toggling mute');
    await page.close();
  }

  // ─────────────────────────────────────────────
  //  8 — How to Play panel
  // ─────────────────────────────────────────────
  section('How to Play Panel');
  {
    const { page, errors } = await newPage(browser);
    await page.goto(MAIN_HTML);
    await page.waitForSelector('#btn-howto');

    await page.click('#btn-howto');
    await page.waitForTimeout(400); // let the open transition settle
    const openVisible = await page.$eval('#howto-overlay', el => !el.classList.contains('hidden'));
    assert(openVisible, 'How to Play opens');

    await page.click('#howto-close');
    await page.waitForTimeout(400);
    const closedHidden = await page.$eval('#howto-overlay', el => el.classList.contains('hidden'));
    assert(closedHidden, 'the close button actually closes the panel');

    assert(errors.length === 0, 'no console/page errors around the How to Play panel');
    await page.close();
  }

  await browser.close();

  console.log('\n' + '═'.repeat(56));
  console.log(`  RESULTS: ${passed} passed  |  ${failed} failed`);
  console.log('═'.repeat(56));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\n  ❌  E2E SUITE CRASHED:', err);
  process.exit(1);
});
