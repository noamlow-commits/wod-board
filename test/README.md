# WOD Board — test harness

## `verify-board.mjs` — parser & timer regression test

Loads `index.html` in headless Chromium and feeds fixture "coach sheets" to the
**real in-page functions** (`parseAppsScriptData`, `extractTimerConfigs`) — no
code extraction, so the test can never drift from production. It snapshots the
parsed structure + detected timers as **golden baselines**; any later change
that alters them is flagged as a `DIFF`.

## `equivalence.mjs` — same meaning ⇒ same result (added 2026-10-01)

**Why it exists.** On 2026-10-01 both suites above were green, yet an audit
found ~56 root causes of one meaning resolving differently by wording:
- `EMOM 1:30` → 1′, `AMRAP 150 sec` → 150′
- `work: 40 sec` painted as an amber rep count
- Hebrew group headers moved below their exercises as notes

38 of the wrong clocks are **silent**: the fact channel misreads them the same
way. Goldens lock what was fixed; nothing locked its siblings.

**What it asserts**, running the real page functions:
1. **timers.** Every variant in `equivalence-classes.mjs` matches its class's
   expected clock signature.
2. **agree.** Every duration the fact channel reads in a line sits inside a red
   time badge, and every numbered red badge is a duration it reads.
3. **category.** Lines of one display group share a category. The `check`
   field sets the level: `full`, `type` or `none`.

**The ratchet** (`equivalence-known.mjs`). It lists every divergence that
exists today, each tagged with a reason:
- `BUG(step N)`: a defect that step N of the audit plan fixes.
- `SPEC`: a deliberate, documented rule.
- `COACH(Qn)`: waiting on the coach.
- `DECIDE`: waiting on Noam.

An unlisted divergence fails the run. A listed one that now passes fails it
too, with "delete it", so the list can only shrink. **Never add an entry to
make something pass.**

Curating: `node test/equivalence.mjs --baseline` prints every current
divergence as JSON.

Adding a shape: add a class or variants in `equivalence-classes.mjs`,
including the shape alone in its cell.

### ⭐ A new shape is ALSO tested alone in its cell (rule since 2026-10-01)

Every fixture for a new written shape gets a variant where that shape is the
**only** line in its cell. On 2026-10-01 four Hebrew work/rest fixtures passed
while the one-line spec alone in a cell got **no clock**. The detector
demanded ≥2 lines, and every fixture happened to carry an extra exercise line.
PARSER.md then claimed support the board did not have. A context line makes a
fixture realistic, and it can also be the only reason the fixture passes.
Fixture: `hebrew_work_rest_alone_in_cell`.

### Beyond goldens — two assertions that catch what a snapshot can't

A golden captures whatever the code **does**, not what the fixture **means**. On
2026-08-08 that gap was live: `activity_interval`'s golden was an *empty timer
list*, quietly asserting that the detector it is named after does nothing.

- **`expectTimers` / `forbidTimers`** — labels that MUST / MUST NOT appear.
  Give every new fixture one; without it `--update` can bake a wrong result in.
- **`expectTimerOrder`** — a list of label sequences that must appear **in that
  relative order within one cell**. Added 2026-08-21 for a bug both assertions
  above are blind to by construction: every clock in the coach's cell was
  detected, correctly labelled and correctly timed, and the **wrong one came
  first**, so ⏱↻ opened on a station's nested clock instead of the block's.
  `expectTimers` passed on the broken code; `forbidTimers` had nothing to
  forbid. Index 0 of a cell's config array is the board's default clock, so
  order is part of the contract — and left to the golden alone, `--update`
  would have baked the wrong order in silently. **When a contract has a
  privileged position, assert the position, not just the membership.**
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
no npm of its own): `~/claude-office-skills` — `npm i playwright` there once per
machine (behind this network's SSL interception: `NODE_OPTIONS=--use-system-ca`).
If Playwright's Chromium isn't downloaded, both tests fall back to the system Chrome/Edge.

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

## `timer-nav.mjs` also guards the AUTO-UPDATE gate (added 2026-09-09)

The board reloads itself when a newer build is deployed, and everything that
makes that acceptable is one predicate — `boardIsIdle()`. Both directions are
asserted: twelve states where a reload would be visible (a running/paused/armed/
finished clock, the 3-2-1 lead-in, either overlay, a non-default view, a section
filter, a focused part, center-focus, a hand on the remote), the positive case,
and the reload-loop guard. **The positive case is tested on purpose** — a gate
that never fires is indistinguishable from a gate that works, and this one would
simply mean the TV silently never updates. `_doReload` is an indirection so the
positive case cannot navigate the harness page away.

⚠️ **This file cuts the network, and that is load-bearing.** `index.html`
carries the production Apps Script URL as a baked-in default, and the board
polls it for remote timer commands and **obeys** them. Unstubbed, the suite was
reading live gym state: the backend synthesises `{command:'reset', ts:'0'}` for
an empty `TimerState` tab, the board ran `resetTimer()` for it, and whichever
assertion happened to be mid-flight lost — `startTimer enters countdown321`
failed about one run in three. Every request but `file:` is now aborted. Do not
remove that route to "test it more realistically": a coach starting a clock at
the gym mid-run would configure and start one in here, and that does not even
look like a flake. See TIMER_ROADMAP §2k.

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
