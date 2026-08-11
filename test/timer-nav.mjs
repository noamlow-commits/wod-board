#!/usr/bin/env node
/**
 * timer-nav.mjs — runtime guard for "a stage change turns the clock off".
 *
 * `verify-board.mjs` is parser-only: it snapshots what the DETECTION produces
 * from a sheet. It never boots the page, so it cannot see timer STATE or the
 * docked clock's DOM. This file covers exactly that gap for the nav-teardown
 * rule (Noam, 2026-08-11) and for the countdown-resurrection landmine that
 * rule made load-bearing.
 *
 * The rule under test (index.html, navClearsTimer):
 *   finished                        → cleared on any stage change
 *   uncapped For Time (open clock)  → cleared  (it never ends by itself)
 *   AMRAP/EMOM/Tabata/capped FT     → SURVIVES (bounded; ends on its own)
 *
 * Run:  node test/timer-nav.mjs
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const PW = 'C:/Users/User/claude-office-skills/node_modules/playwright';
const { chromium } = require(PW);

const INDEX = pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}${detail ? '  → ' + detail : ''}`); }
};

// Minimal board DOM: navigatePart early-returns when getMaxParts() === 0, so the
// teardown never runs without real .part-block elements to navigate between.
const SEED_PARTS = `
  const area = document.getElementById('wodArea');
  area.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'workout-row';
  for (let i = 0; i < 3; i++) {
    const p = document.createElement('div');
    p.className = 'part-block';
    p.dataset.partIdx = String(i);
    p.textContent = 'part ' + (i + 1);
    row.appendChild(p);
  }
  area.appendChild(row);
`;

// Put a clock on screen in a chosen state WITHOUT sitting through the real 10s
// lead-in — these cases test navClearsTimer's predicate, not the countdown.
const ARM = (type, cfg, state) => `
  configureTimer(${JSON.stringify(type)}, ${JSON.stringify(cfg)});
  timerState = ${JSON.stringify(state)};
  timerStartedAt = performance.now();
  showFloatingTimerBar();
  updateFloatingTimerBar();
`;

const snapshot = `({
  state: timerState,
  barShown: document.getElementById('floatingTimerBar').style.display !== 'none',
  docked: document.getElementById('mainContent').classList.contains('timer-docked'),
  overlayMode: document.getElementById('floatingTimerBar').classList.contains('overlay-mode'),
  clockReserve: document.getElementById('tvCenterOverlay').classList.contains('clock-reserve'),
  overlayRight: document.getElementById('tvCenterOverlay').style.right,
  controls: document.getElementById('tvTimerControls').classList.contains('visible'),
})`;

async function launch() {
  try { return await chromium.launch(); }
  catch { return await chromium.launch({ executablePath: CHROME }); }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
// Skip the PIN gate; the board's own data fetch is irrelevant here.
await page.addInitScript(() => localStorage.setItem('wodboard-gym-pin', '1986'));
// The board polls its Apps Script backend over JSONP; from file:// those
// callbacks never resolve. That noise is the harness, not the page.
page.on('pageerror', e => {
  if (/^_\w+Cb_\d+ is not defined$/.test(e.message)) return;
  fail++; console.log('❌ pageerror: ' + e.message);
});

await page.goto(INDEX);
await page.waitForFunction('typeof navigatePart === "function"');

/** Arm a clock, navigate, return the resulting state. */
async function navWith(type, cfg, state, action = 'navigatePart(1)') {
  await page.evaluate(`(() => { resetTimer(); hideFloatingTimerBar(); ${SEED_PARTS} })()`);
  await page.evaluate(`(() => { partFocusIndex = 0; ${ARM(type, cfg, state)} })()`);
  const before = await page.evaluate(snapshot);
  await page.evaluate(`(() => { ${action}; })()`);
  const after = await page.evaluate(snapshot);
  return { before, after };
}

// `overlayRight` is NOT asserted empty: applyCenterFocus sets its own `right:0`
// when it opens the overlay right after the teardown (index.html ~7356). The
// timer-owned value is the 14vw clock squeeze — that one must be gone.
const cleared = s => s.state === 'idle' && !s.barShown && !s.docked && !s.overlayMode
  && !s.clockReserve && s.overlayRight !== '14vw' && !s.controls;

console.log('\nStage change clears a FINISHED clock (the reported bug)');
{
  const { before, after } = await navWith('amrap', { totalSeconds: 720 }, 'finished');
  ok('finished clock is docked before ►', before.barShown && before.state === 'finished');
  ok('► clears it completely', cleared(after), JSON.stringify(after));

  // The 350ms timeout inside navigatePart re-asserts overlay-mode + display:flex.
  // If teardown didn't disarm it, the bar comes BACK a third of a second later.
  await page.waitForTimeout(600);
  ok('still gone 600ms later (no resurrection by the 350ms timeout)',
    cleared(await page.evaluate(snapshot)));
}

console.log('\nA CLOSED clock survives — it ends on its own');
for (const [name, type, cfg] of [
  ['AMRAP 12′', 'amrap', { totalSeconds: 720 }],
  ['EMOM 10′', 'emom', { totalSeconds: 600, intervalSeconds: 60 }],
  ['Tabata 20/10 ×8', 'tabata', { workSeconds: 20, restSeconds: 10, rounds: 8 }],
  ['For Time WITH a 10′ cap', 'fortime', { capSeconds: 600 }],
]) {
  const { after } = await navWith(type, cfg, 'running');
  ok(`${name} keeps running through ►`, after.state === 'running' && after.barShown,
    JSON.stringify(after));
}

console.log('\nAn OPEN clock is cleared — it never ends by itself');
for (const state of ['running', 'paused', 'countdown321']) {
  const { after } = await navWith('fortime', { capSeconds: 0 }, state);
  ok(`uncapped For Time (${state}) is cleared by ►`, cleared(after), JSON.stringify(after));
}

console.log('\nSame rule on the other stage-changing controls');
{
  const { after } = await navWith('amrap', { totalSeconds: 720 }, 'finished', 'setTvSection(null)');
  ok('WOD/CARDIO/הכל clears a finished clock', cleared(after), JSON.stringify(after));
}
{
  const { after } = await navWith('amrap', { totalSeconds: 720 }, 'finished',
    'document.querySelector(\'button[title="חזרה לכל הלוח"]\').click()');
  ok('🏠 clears a finished clock', cleared(after), JSON.stringify(after));
}
{
  // ⊙ only zooms the CURRENT stage — it is not a stage change, so the clock stays.
  const { after } = await navWith('amrap', { totalSeconds: 720 }, 'running', 'toggleCenterFocus()');
  ok('⊙ מרכוז does NOT touch a running clock', after.state === 'running' && after.barShown,
    JSON.stringify(after));
}

console.log('\nCountdown landmine (pre-existing; the nav rule made it reachable)');
{
  await page.evaluate(`(() => { resetTimer(); hideFloatingTimerBar(); ${SEED_PARTS}
    partFocusIndex = 0;
    configureTimer('fortime', { capSeconds: 0 });
    startTimer();               // → countdown321, 1s interval ticking
  })()`);
  await page.waitForTimeout(1200);
  const mid = await page.evaluate('timerState');
  ok('startTimer enters countdown321', mid === 'countdown321', mid);
  await page.evaluate('navigatePart(1)');       // teardown mid-countdown
  await page.waitForTimeout(2500);              // let the old interval try to finish
  const end = await page.evaluate(snapshot);
  ok('reset mid-countdown does NOT resurrect a ghost running clock',
    end.state === 'idle' && !end.barShown, JSON.stringify(end));
}

await browser.close();
console.log(`\n──────────────────────────────────────────────\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
