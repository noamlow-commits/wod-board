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
 * The rule under test (index.html, navClearsTimer) — since 2026-09-30 (Noam):
 *   ANY clock on the board — running / paused / 3-2-1 lead-in / finished —
 *   is cleared by a stage change (◄ ► / WOD↔CARDIO / 🏠). The 08-11 exception
 *   for bounded clocks (AMRAP/EMOM/Tabata/capped FT survived ►) is withdrawn.
 *   `configured` (armed, never started) is untouched; ⊙ is not a stage change;
 *   and outside the board views (full timer mode) navigatePart is a no-op.
 *
 * Run:  node test/timer-nav.mjs
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);
// Per-user, so the same path works on every machine (was hardcoded to C:/Users/User).
const PW = path.join(os.homedir(), 'claude-office-skills/node_modules/playwright');
const { chromium } = require(PW);

const INDEX = pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));

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

console.log('\nA CLOSED clock is cleared too (Noam 2026-09-30 — a stage change cancels every clock)');
for (const [name, type, cfg] of [
  ['AMRAP 12′', 'amrap', { totalSeconds: 720 }],
  ['EMOM 10′', 'emom', { totalSeconds: 600, intervalSeconds: 60 }],
  ['Tabata 20/10 ×8', 'tabata', { workSeconds: 20, restSeconds: 10, rounds: 8 }],
  ['For Time WITH a 10′ cap', 'fortime', { capSeconds: 600 }],
]) {
  const { before, after } = await navWith(type, cfg, 'running');
  ok(`${name} (running) is cleared by ►`, before.state === 'running' && cleared(after), JSON.stringify(after));
}
for (const state of ['paused', 'countdown321']) {
  const { after } = await navWith('amrap', { totalSeconds: 720 }, state);
  ok(`AMRAP (${state}) is cleared by ►`, cleared(after), JSON.stringify(after));
}
{
  const { after } = await navWith('emom', { totalSeconds: 600, intervalSeconds: 60 }, 'running', 'navigatePart(-1)');
  ok('◄ clears a running EMOM too', cleared(after), JSON.stringify(after));
}
{
  // An ARMED clock (configured, never started) makes no sound and is left alone.
  const { after } = await navWith('amrap', { totalSeconds: 720 }, 'configured');
  ok('an armed (configured) clock is untouched by ►', after.state === 'configured', JSON.stringify(after));
}
{
  // Full timer mode = where a phone-started clock lands; the ◄ ► panel is not
  // shown there, so a ChannelDown on the remote must not tear the clock down.
  const { after } = await navWith('amrap', { totalSeconds: 720 }, 'running',
    "displayMode = 'timer'; navigatePart(1); displayMode = 'wod'");
  ok('navigatePart is a no-op in full timer mode (phone-started clock survives)',
    after.state === 'running' && after.barShown, JSON.stringify(after));
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

// ── ONE countdown rule for every interval clock (coach 2026-09-22: "it doesn't
// say ten seconds any more — that was great"; Noam 2026-09-27: an interval of
// ≤ 1 min COUNTS "five…one" out loud; coach 2026-09-29: "ten seconds before the
// set ends it doesn't say ten seconds" → every interval ≥ 30″ gets ONE "Ten
// seconds!" as well, so a ≤ 1 min interval gets both the call and the count).
// Same rule for EMOM, work/rest and MIX, before every change incl. rest→work.
// The last interval's call is the workout-end call, never a second copy of it.
// Drives timerTick over a fake clock in 100ms steps and records the voice,
// collapsed to "<second>:ten" / "<second>:count" (a count = the five words
// five…one on five consecutive seconds, checked in order).
{
  const voice = (type, cfg, mode) => page.evaluate(([type, cfg, mode]) => {
    const said = [], keep = { ...TimerAudio }, raf = window.requestAnimationFrame;
    TimerAudio.say = (k) => said.push(k);
    for (const f of ['beep', 'intervalBeep', 'warningBeep', 'finishSound', 'tabataWork', 'tabataRest']) TimerAudio[f] = () => {};
    window.requestAnimationFrame = () => 0;
    resetTimer(); configureTimer(type, cfg);
    const total = getTimerTotalMs();
    timerState = 'running'; timerElapsed = 0;
    const log = [];
    for (let ms = 0; ms <= total + 200 && timerState === 'running'; ms += 100) {
      timerStartedAt = performance.now() - ms;
      const n = said.length; timerTick();
      for (let i = n; i < said.length; i++) log.push([ms / 1000, said[i]]);
    }
    Object.assign(TimerAudio, keep); window.requestAnimationFrame = raf; resetTimer();
    if (mode === 'half') return log.filter(([, k]) => k === 'halfway').map(([t]) => `${t}:half`).join(' ');
    const out = [], W = ['five', 'four', 'three', 'two', 'one'];
    for (let i = 0; i < log.length; i++) {
      const [t, k] = log[i];
      if (k === 'ten_seconds') out.push(`${t}:ten`);
      else if (k === 'five') {
        const run = log.slice(i, i + 5);
        const good = run.length === 5 && run.every(([tt, kk], j) => kk === W[j] && tt === t + j);
        out.push(`${t}:${good ? 'count' : 'BROKEN-count'}`);
      } else if (W.includes(k) && !(i > 0 && W.includes(log[i - 1][1]))) out.push(`${t}:stray-${k}`);
    }
    return out.join(' ');
  }, [type, cfg, mode]);
  const cases = [
    ['1-min EMOM ×3: "ten" then a count from five, every minute incl. the last', 'emom', { intervalSeconds: 60, totalSeconds: 180 }, '50:ten 55:count 110:ten 115:count 170:ten 175:count'],
    ['2-min EMOM ×2: "ten" before every change, no count', 'emom', { intervalSeconds: 120, totalSeconds: 240 }, '110:ten 230:ten'],
    ['1:00 on / 1:00 off ×2: "ten" + count before every change (rest→work too)', 'tabata', { workSeconds: 60, restSeconds: 60, rounds: 2 }, '50:ten 55:count 110:ten 115:count 170:ten 175:count 230:ten 235:count'],
    ['2:00 work / 0:30 rest ×2: "ten" on both, count on the 30″ rest', 'tabata', { workSeconds: 120, restSeconds: 30, rounds: 2 }, '110:ten 140:ten 145:count 260:ten 290:ten 295:count'],
    ['Tabata 20/10 ×2: too short for "ten" — count only', 'tabata', { workSeconds: 20, restSeconds: 10, rounds: 2 }, '15:count 25:count 45:count 55:count'],
    ['MIX 1:30 + 0:30 ×2: "ten" on every interval, count on the short ones', 'mix', { intervals: [{ name: 'A', seconds: 90 }, { name: 'B', seconds: 30 }], rounds: 2 }, '80:ten 110:ten 115:count 200:ten 230:ten 235:count'],
  ];
  for (const [name, type, cfg, want] of cases) {
    const got = await voice(type, cfg);
    ok(name, got === want, `got "${got}"`);
  }

  // ── Halfway of EVERY work interval (coach 2026-09-30: "if I set 45 seconds,
  // halfway is half of 45; if I set a minute, half a minute" — no length
  // threshold). Work intervals only, never a rest; interval clocks get no
  // second, whole-workout halfway. Six of these fail on the pre-rule code.
  const halfCases = [
    ['45/15 ×6 (her workout): halfway at 22.5″ of every work', 'tabata', { workSeconds: 45, restSeconds: 15, rounds: 6 }, '22.5:half 82.5:half 142.5:half 202.5:half 262.5:half 322.5:half'],
    ['1-min EMOM ×3: halfway at 0:30 of every minute, once each', 'emom', { intervalSeconds: 60, totalSeconds: 180 }, '30:half 90:half 150:half'],
    ['2-min EMOM ×2: halfway at 1:00 of each interval, none at total 50%', 'emom', { intervalSeconds: 120, totalSeconds: 240 }, '60:half 180:half'],
    ['Tabata 20/10 ×2: halfway in work, never in rest', 'tabata', { workSeconds: 20, restSeconds: 10, rounds: 2 }, '10:half 40:half'],
    ['MIX עבודה 40 / מנוחה 20 ×2: halfway in work only', 'mix', { intervals: [{ name: 'עבודה', seconds: 40 }, { name: 'מנוחה', seconds: 20 }], rounds: 2 }, '20:half 80:half'],
    ['Adjacent work phases (every 3:00 ×2): each gets its own halfway', 'tabata', { phases: [{ type: 'work', seconds: 180 }, { type: 'work', seconds: 180 }] }, '90:half 270:half'],
    ['AMRAP 10: one halfway at 5:00 (the workout IS the interval)', 'amrap', { totalSeconds: 600 }, '300:half'],
  ];
  for (const [name, type, cfg, want] of halfCases) {
    const got = await voice(type, cfg, 'half');
    ok(name, got === want, `got "${got}"`);
  }
}

await browser.close();
console.log(`\n──────────────────────────────────────────────\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
