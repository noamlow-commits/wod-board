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

// ⚠️⚠️ CUT THE NETWORK — this is what the "countdown321 → idle" flake was.
// The board polls its Apps Script backend for remote timer commands and OBEYS
// them, and nothing here stubbed the URL, so every run of this suite was
// talking to PRODUCTION. `handleGetTimerState_` synthesises
// {command:'reset', ts:'0'} whenever the TimerState tab is empty — which it is
// — and `processTimerCommand` duly called resetTimer() at whatever moment the
// JSONP response happened to land. Land it inside the countdown block's 1200ms
// window and `startTimer enters countdown321` reads 'idle'. Network jitter
// decided, which is why it was ~1 run in 3 and why it never reproduced in
// isolation (there the response arrives long before that block).
//
// Verified, not reasoned: the live row really does return
// {"command":"reset","type":"","config":{},"ts":"0"} today.
//
// A suite that reads live production state is not a suite — a coach starting a
// clock at the gym mid-run would have configured and STARTED one in here, which
// does not even look like a flake. Everything but the local files is cut; every
// test in this file is about LOCAL timer state.
await page.route('**/*', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));

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

// ✅ The flake that used to live here is SOLVED, and it was not this block:
// the suite was polling the PRODUCTION backend and obeying a synthesised
// {command:'reset', ts:'0'}, which landed at a random moment. See the
// page.route note at the top, and TIMER_ROADMAP §2k. If this line ever goes
// red again, it is real — do not re-run and shrug.
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

// ── Auto-update gate (added 2026-09-09) ──────────────────────────────────
// The board reloads ITSELF when a newer build is deployed. Everything that
// makes that acceptable lives in ONE predicate, `boardIsIdle()` — and a gate
// that never fires and a gate that fires at the wrong moment both look like a
// working board until the day they don't. So the predicate is driven directly,
// with `_doReload` stubbed so a positive case cannot navigate this page away.
//
// The negative cases are the ones that matter: each is a state where a reload
// would wipe something off a screen on a wall in front of a class.
console.log('\nAuto-update reloads only when a reload would be INVISIBLE');
{
  // Reset to the state a fresh load produces, then take that as the baseline —
  // the same thing startAutoUpdate() does at the end of the first startApp().
  // ⚠️ Stop the live polling first. The 30s "is it invisible yet?" tick fires on
  // its own, and `arm` deliberately leaves the board idle — so between arm and
  // a case's setup the real interval could legitimately reload, and the case
  // then read `__reloads === 1` and failed. Once, in nine runs. Exactly the
  // shape of the production-poll flake these tests shipped alongside: measure
  // the gate by CALLING it, never by racing it.
  await page.evaluate('_autoUpdateTimers.forEach(clearInterval)');

  const arm = `(() => {
    resetTimer(); hideFloatingTimerBar();
    displayMode = 'wod'; sectionFilter = 'WOD'; partFocusIndex = null; centerFocus = false;
    document.getElementById('settingsModal').classList.remove('open');
    document.getElementById('timerSetupOverlay')?.classList.remove('open');
    _bootView = { displayMode, sectionFilter, partFocusIndex, centerFocus };
    _lastInteractionAt = 0;
    _bootBuild = '1'; _pendingBuild = '2';
    window.__reloads = 0; _doReload = () => { window.__reloads++; };
    try { sessionStorage.removeItem('wodboard-build-tried'); } catch (e) {}
  })()`;

  await page.evaluate(arm);
  ok('a resting board IS idle', await page.evaluate('boardIsIdle()'));

  // POSITIVE: a pending build on a resting board reloads exactly once.
  ok('pending build reloads the resting board',
    (await page.evaluate('applyPendingBuild()')) === true
    && (await page.evaluate('window.__reloads')) === 1);

  // …and only once, even if the check runs again before the page goes away.
  ok('a second attempt for the SAME build stands down (no reload loop)',
    (await page.evaluate('applyPendingBuild()')) === false
    && (await page.evaluate('window.__reloads')) === 1);

  // NEGATIVES — every state where the reload would be visible.
  for (const [name, setup] of [
    ['a RUNNING clock', `configureTimer('amrap',{totalSeconds:720}); timerState='running'`],
    ['a PAUSED clock', `configureTimer('amrap',{totalSeconds:720}); timerState='paused'`],
    ['the 3-2-1 countdown', `configureTimer('amrap',{totalSeconds:720}); timerState='countdown321'`],
    ['an ARMED clock (configured, not started)', `configureTimer('amrap',{totalSeconds:720})`],
    ['a FINISHED clock still on screen', `configureTimer('amrap',{totalSeconds:720}); timerState='finished'`],
    ['the settings modal open', `document.getElementById('settingsModal').classList.add('open')`],
    ['the timer-setup overlay open', `document.getElementById('timerSetupOverlay').classList.add('open')`],
    ['a non-default display mode', `displayMode = 'pr'`],
    ['a section filter applied', `sectionFilter = null`],
    ['a part focused', `partFocusIndex = 1`],
    ['center-focus on', `centerFocus = true`],
    ['someone touching the remote', `_lastInteractionAt = Date.now()`],
  ]) {
    await page.evaluate(arm);
    await page.evaluate(`(() => { ${setup}; })()`);
    const idle = await page.evaluate('boardIsIdle()');
    const fired = await page.evaluate('applyPendingBuild()');
    const reloads = await page.evaluate('window.__reloads');
    ok(`does NOT reload with ${name}`, idle === false && fired === false && reloads === 0);
  }

  // No baseline ⇒ no reload. The gate fails CLOSED, which is what makes it safe
  // to leave the capture inside startApp rather than hardcode the defaults.
  await page.evaluate(arm);
  await page.evaluate('_bootView = null');
  ok('no captured baseline ⇒ never reloads',
    (await page.evaluate('boardIsIdle()')) === false
    && (await page.evaluate('applyPendingBuild()')) === false);

  // And with nothing pending, a resting board sits still.
  await page.evaluate(arm);
  await page.evaluate('_pendingBuild = null');
  ok('no pending build ⇒ no reload',
    (await page.evaluate('applyPendingBuild()')) === false
    && (await page.evaluate('window.__reloads')) === 0);

  await page.evaluate(`(() => { _pendingBuild = null; _doReload = () => location.reload(); })()`);
}

await browser.close();
console.log(`\n──────────────────────────────────────────────\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
