# WOD Board — test harness

## `verify-board.mjs` — parser & timer regression test

Loads `index.html` in headless Chromium and feeds fixture "coach sheets" to the
**real in-page functions** (`parseAppsScriptData`, `extractTimerConfigs`) — no
code extraction, so the test can never drift from production. It snapshots the
parsed structure + detected timers as **golden baselines**; any later change
that alters them is flagged as a `DIFF`.

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
