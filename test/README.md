# WOD Board — test harness

## `verify-board.mjs` — parser & timer regression test

Loads `index.html` in headless Chromium and feeds fixture "coach sheets" to the
**real in-page functions** (`parseAppsScriptData`, `extractTimerConfigs`) — no
code extraction, so the test can never drift from production. It snapshots the
parsed structure + detected timers as **golden baselines**; any later change
that alters them is flagged as a `DIFF`.

### Beyond goldens — two assertions that catch what a snapshot can't

A golden captures whatever the code **does**, not what the fixture **means**. On
2026-08-08 that gap was live: `activity_interval`'s golden was an *empty timer
list*, quietly asserting that the detector it is named after does nothing.

- **`expectTimers` / `forbidTimers`** — labels that MUST / MUST NOT appear.
  Give every new fixture one; without it `--update` can bake a wrong result in.
- **Unexplained-facts property test** — every duration/cap the coach *wrote*
  must reach some clock, or be listed in the fixture's **`ignoreFacts`** as a
  deliberate miss. This is what makes a silent parse failure impossible to ship:
  `[]` is still correct when she wrote nothing, but it is an ERROR when she
  wrote a number nothing consumed. See PARSER.md "Making SILENCE measurable".
- **Detection-branch coverage** — every structural branch of
  `extractTimerConfigs` must be exercised by ≥1 fixture; a branch at 0 hits
  fails the run. Write a fixture for it, or delete the dead branch.

Golden files are the *current-behaviour baseline*, not hand-written "right
answers". The value is catching **silent regressions** in the fragile logic
documented in [`../PARSER.md`](../PARSER.md): widow guards, part detection,
chained-interval detection, activity-interval detection, column splits.

Fully offline and deterministic — all network is aborted (no live sheet, no
Apps Script, no PIN), fixtures are fixed.

### Run

```bash
node test/verify-board.mjs            # compare vs golden; exit 1 on any DIFF
node test/verify-board.mjs --update   # accept intended changes → rewrite baselines
```

Playwright is resolved from `claude-office-skills/node_modules` (the board has
no npm of its own). Chromium is already installed there.

### Workflow

1. After touching any parser/timer code in `index.html`, run the test.
2. A `DIFF` means the parsed output changed. Read the diff:
   - **Unintended** → you introduced a regression; fix it.
   - **Intended** (you improved the parser) → re-run with `--update` and commit
     the new golden so the improvement becomes the baseline.
3. Add a fixture whenever a new coach-sheet pattern or a fixed bug should be
   guarded — append to `FIXTURES` in `verify-board.mjs` and `--update`.

### Golden files

`test/golden/<fixture>.json` — committed baselines (text, diff-friendly).
`test/golden/<fixture>.actual.json` — written only on a DIFF, git-ignored.

## Visual screenshots — use LIVE data, not offline fixtures

Headless Chromium **does** render and paint the board correctly — but only when
the page runs its own natural data flow (`fetchAndRender` → `renderWorkout` →
`requestAnimationFrame` → `autoFitFontSize` retries). Loading the deployed board
headless and screenshotting it produces a perfect image (full content, teal
station badges, colours, RTL).

What does NOT work: injecting a fixture by calling `renderWorkout(data)` directly
and screenshotting. That path skips the rAF/autoFit reveal sequence, so the
content lands in the DOM (correct geometry — verified) but never paints. (This
was a red herring earlier misdiagnosed as a gradient-text / headless issue — it
is neither.) It is fine for the **parser/timer golden test** above (which reads
the DOM, not pixels), just not for screenshots.

## `timer-nav.mjs` — timer runtime test (added 2026-08-11)

`verify-board.mjs` snapshots what **detection** produces from a sheet. It never
exercises the running clock, so a whole class of timer bugs is structurally
invisible to it — including the one it was written for: a finished clock that
survived ◄ ► and had to be stopped by hand.

This file boots the page, seeds a minimal `.part-block` DOM (`navigatePart`
early-returns when `getMaxParts() === 0`), drives real timer state, and asserts
on the docked bar's actual DOM — `display`, `.timer-docked`, `.overlay-mode`,
`.clock-reserve`, `#tvTimerControls.visible`.

What it locks down (see PARSER.md "A stage change turns the clock off"):

- a **finished** clock is cleared by ◄ ► / WOD↔CARDIO / 🏠 — and is **still gone
  600ms later**, past the 350ms timeout inside `navigatePart` that re-asserts
  `overlay-mode`. That delay is the resurrection window; assert after it.
- an **uncapped For Time** is cleared in `running` / `paused` / `countdown321`.
- **control cases that must NOT change:** AMRAP, EMOM, Tabata and a *capped* For
  Time all keep running through ►, and ⊙ מרכוז never touches a clock. These pass
  on the unfixed code too — that is the point. They are what makes the diff a
  *rule* rather than "clear the timer on navigate", which is a different feature.
- the **countdown-resurrection guard** in `startTimer`.

Verified honest: against the pre-fix `index.html` it reports **8 fail**; with the
countdown guard alone removed, the ghost clock shows up as `state:"running"` with
the bar hidden. A guard nobody has watched fail is not yet a guard.

Two harness facts, not product bugs: the board's JSONP callbacks (`_timerCb_…`)
can't resolve from `file://` and are filtered; and `applyCenterFocus` sets its own
`overlay.style.right = '0'` after the teardown, so only the timer-owned `14vw`
squeeze is asserted gone.

## Visual checks

So for a visual check, render the **live deployed board**:

```js
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } });
await ctx.addInitScript(() => localStorage.setItem("wodboard-gym-pin", "1986"));
const page = await ctx.newPage();
await page.goto("https://noamlow-commits.github.io/wod-board/", { waitUntil: "networkidle" });
await page.waitForTimeout(4000);           // PIN verify + fetch + render + autoFit
await page.screenshot({ path: "board.png" });
```

This is the approach to eyeball layout/overflow/RTL and to confirm a fix on the
live board (e.g. the A2 station-badge fix). A fully-offline deterministic
screenshot would need Playwright route-mocking of the `getWorkoutSheet` response
so the page's own flow renders fixture data — a tracked follow-up.
