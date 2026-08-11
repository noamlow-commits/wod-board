# Timer detection — open questions, pipeline map, and roadmap

**Companion to [`PARSER.md`](PARSER.md).** PARSER.md is the spec: what the code
does and the rule behind each behaviour. This file is the *forward-looking* half
— what we still don't know, what we deliberately haven't built, and the
structural diagnosis behind both. Written 2026-08-08 after the `part N:` /
compound-clock session; keep it current or delete it, a stale roadmap is worse
than none.

---

## 1. ⚠️ OPEN QUESTIONS FOR THE COACH — do not guess these

These are workout *semantics*. The standing rule (`PARSER.md`, the ×N/stations
asymmetry) applies: **the coach decides semantics, not code consistency.**

> ⚠️ **2026-08-10 — the compound clock's scope narrowed before most of these got
> answered.** The coach reported that the very cell it was built on is **staged**
> — `part 2: amrap 14 / 1000 m run / and then: amrap:` — so part 2's clock starts
> when the athletes finish an untimed run, not at a fixed offset. A whole-cell
> chain is now **suppressed for a staged part** (predicate + reasoning in
> `PARSER.md`, the ⛔ note in the compound-clock section). Read Q1/Q3/Q4 with that
> in mind: the compound clock now fires on **fewer** cells than the day they were
> written, and this week's live sheet is no longer one of them.

### Q1 — The compound clock counts part 1 DOWN. Is that acceptable? 🟡 LIVE, but narrower

**Status 2026-08-10:** still unanswered, and now **lower-stakes**. The cell that
made it urgent (`t.c 14` + `amrap 14`) is staged and no longer chains at all, so
the coach is on the per-part buttons there — and `P1 · 12 RFT (TC 14′)` **does**
count up. The question below still decides whether a *genuinely continuous*
For-Time-then-AMRAP cell should chain, but it is no longer blocking this week.


The compound clock (`TC 14′ → AMRAP 14′ · 2′ rest`) runs on the chained-`tabata`
engine, which represents both work phases identically: **a countdown**. So a
For-Time part with a 14:00 cap displays `14:00 → 0:00`, not a count-up. An
athlete finishing at 11:32 sees `02:28` and must subtract to log a score.

- Competition cap-clocks do run this way, so it is defensible on a gym TV.
- **If she insists on count-up for anything scored For Time, the compound clock
  as built is wrong for her** — and the fix is not small: `fortime` is the only
  count-up type, and mixing directions inside one sequence needs a real
  queue/mix engine (see §5, deliberately not built). That would be a project,
  not a patch.
- Until answered: the per-part buttons are still there behind the compound one,
  and `P1 · 12 RFT (TC 14′)` **does** count up. So nothing is lost either way.

### Q2 — Does `⏭ הבא` actually match how she runs the room?

The compound clock starts the 2:00 rest exactly at the cap. `⏭ הבא` (amber
button on the docked clock, key `n`) exists so she can advance early when the
whole class finished at 12:00. Worth confirming: is a button press the right
interaction, or does she want the rest to start when *the last athlete* is done
(which the board cannot know)?

### Q3 — The compound clock only appears sometimes. 🔴 SHARPER after 2026-08-10

`t.c 14` + `amrap 14` chains. Next week's `t.c 14` + `amrap 12` will not (the
uniform-durations sanity rule), and she gets the per-part buttons instead. Is
sometimes-compound acceptable, or is the inconsistency more annoying than the
extra presses? **Do not relax the uniform rule to "fix" this** — the tabata
runtime's arithmetic is built on a fixed `work+rest` cycle; non-uniform phases
belong to a sequence engine.

**This is now the sharpest open question of the three,** because there are two
independent reasons a cell won't chain (non-uniform durations, and a staged
part) and she cannot see either from the board. The honest framing for her:
*"sometimes one button, sometimes two — is that fine, or would you rather it were
always two?"* If the answer is "always two", the compound clock should be deleted
outright rather than accumulating suppressions.

### Q5 — Staging without the marker. 🔴 NEW 2026-08-10

The staged-part suppression fires on a **written** sequence-transition marker
(`and then` / `then:` / `after that` / `ואז` / `לאחר מכן`) — the coach's own
words, so nothing is guessed. But the same workout written **without** the
marker —

```
part 2: amrap 14
1000 m run
amrap:
20 squat jump
```

— still chains, and would again start the AMRAP mid-run. **Do not "fix" this by
inference.** The obvious wider rule ("untimed work before the declared format")
requires guessing which lines are work and which are notes, *and* it misfires on
`part 1: t.c 14 / 12 rft:`, where a cap and its rep scheme are one block. The
right move is to ask her: **does she always write the transition, or is the
marker just how she happened to write it this week?** If it's habitual, the
predicate is already correct and this closes. If not, the answer is probably a
convention ("write *and then* when a part has an untimed lead-in") rather than a
cleverer regex.

### Q4 — The redundant `For Time` preamble button (answered 2026-08-08: suppress; trigger widened 2026-08-10).

A bare format line above the parts (`for time:`) is dropped when the preamble
carries no written value of its own **and** either the compound clock exists or
**≥2 numbered parts produced their own clocks**. The second half was added on
2026-08-10: killing the chain for a staged cell would otherwise have handed that
useless capless `For Time` back as the ⏱↻ *default* — the exact annoyance the
suppression exists to remove. Verified counterfactually
(`detectTimers(['for time:'])` → `{fortime, capSeconds: 0}`), not assumed.
Flagging it here because the reasoning was a judgement call: a preamble with
real work content under it would be a legitimate separate block. If she ever
reports a missing clock on a cell shaped like that, this is the first suspect.

---

## 2. What shipped 2026-08-08 (commit `100bda8`, sw v134)

| # | Change | Why it mattered |
|---|---|---|
| 1 | `part N:` header line feeds its own segment | `part 1: t.c 14` / `part 2: amrap 14` were both discarded — **part 2 had no clock at all** |
| 2 | Compound clock via whole-cell `chainFromTimeline` | one start for `14′ → 2′ → 14′` (30:00) instead of three |
| 3 | `capSecondsFromLine` as a timeline WORK classifier | `t.c 14` (TC-first) never became a work phase, so the parts could not chain |
| 4 | Preamble suppression | the useless capless `For Time` was the ⏱↻ default |
| 5 | `skipTimerPhase()` + `⏭ הבא` + key `n` | without it the compound clock is *worse* than three manual starts |
| 6 | `TimerSetup` clamps 300/600 → 5999 | a chained AMRAP 10 was silently crushed to 5:00 on start |
| 7 | Timing facts + unexplained-facts assertion | makes a silent parse failure impossible to ship |
| 8 | Detection-branch coverage | a branch at 0 hits now fails the run |
| 9 | `detectActivityInterval` reachable outside the part loop | found by #7 on its first run — see below |

## 2b. What shipped 2026-08-10 (sw v136) — the compound clock's first narrowing

| # | Change | Why it mattered |
|---|---|---|
| 1 | **Staged part → no compound chain** (`STAGE_MARKER_RE`) | the coach's live cell has an untimed `1000 m run` inside part 2; the chain would have started her AMRAP mid-run |
| 2 | Preamble suppression trigger widened to `chain ‖ ≥2 parts with clocks` | otherwise #1 resurrects the capless `For Time` as the ⏱↻ default |
| 3 | New branch id `staged-part` + control fixture `continuous_parts_compound_chain` | #1 dropped `compound-chain` to **0** hits — the coverage assertion caught it |

**The lesson from #3 is worth keeping.** Suppressing the only cell that exercised
the compound clock made a *narrowing* look identical to a *revert*, and the only
thing that said so was the branch counter going to zero. **A suppression needs a
surviving positive case, or it isn't a suppression.** The control fixture is the
same sheet minus exactly the two staged lines, so the pair is a strict A/B — the
diff between the fixtures *is* the predicate.

Second lesson, from #2: **a suppression written as "only when X exists" silently
depends on X.** Removing X in one place un-removed something in another, three
lines away. The compound clock and the preamble drop looked independent; they
were one conditional.

**#9 is the lesson.** `activity_interval` — a fixture *named after* that detector
— had a golden of an **empty timer list**. The detector was only reachable from
inside the part-split loop, so the coach's plain interval style produced no
clock. The fixture had been asserting that the detector does nothing, because
**a golden captures what the code does, not what the fixture means.**

---

## 2c. What shipped 2026-08-11 (sw v139, `5fcad5a`) — and the blind spot it exposed

| # | Change | Why it mattered |
|---|---|---|
| 1 | **A stage change turns off a clock that can't end by itself** (`navClearsTimer`/`navClearTimer`) | a finished clock survived ◄ ► in center-focus and had to be stopped by hand |
| 2 | State guard on `startTimer`'s countdown interval | resetting during the 10s lead-in resurrected an **invisible** `running` clock with `timerType` null |
| 3 | **`test/timer-nav.mjs`** — a second harness, for timer *runtime* | see below |

**⚠️ This file has a blind spot, and so did the test suite: everything above is
about the timer's RUNTIME, and nothing here or in `verify-board.mjs` covers that
class at all.** §3-§5 map `detectTimers`/`extractTimerConfigs` — *which clock is
detected from what the coach wrote*. But a clock that is detected perfectly can
still be shown at the wrong time, survive a view change, or resurrect itself.
Both defects fixed on 2026-08-11 were of that second kind, and the 32 goldens
passed cleanly through both of them — **not because the code was right, but
because the harness could not see that far.** "The goldens pass" is a statement
about detection only. Say so when reporting it.

**Runtime defects, currently open** (now testable — `timer-nav.mjs` boots the page
and drives real state, so these no longer need a manual TV session to reproduce):

- 🟡 **`centerFocus` and `tvCenterOverlay.open` linger stuck `true`** after a
  center-focus session while the board shows the normal spread. Known since
  2026-07-26. No longer blocks the timer (scoping moved to `partFocusIndex`, and
  the nav teardown keys on timer state only), so it is latent — but it is a real
  state-management bug and the *reason* two subsystems must avoid an otherwise
  obvious flag. Worth an actual fix now that a runtime harness exists.
- **Nothing asserts the docked clock's teardown is complete.** `hideFloatingTimerBar`
  clears seven things (`display`, `.timer-docked`, `.overlay-mode`,
  `.clock-reserve`, `overlay.style.right`, `#tvTimerControls.visible`, and the
  RAF via `resetTimer`). `timer-nav.mjs` checks them for the nav path; any *other*
  path that hides the bar is still unguarded. Miss one and the clock's reserved
  top space stays subtracted from the workout with no clock in it.

**The lesson to carry:** when a bug report is about *when* or *whether* a clock
shows — not about which clock was read off the sheet — this file and the golden
harness are the wrong tools, and their silence means nothing.

---

## 3. The detection pipeline, in execution order

Nothing else in the repo shows the whole pipeline at once; every past incident
was debugged by rediscovering a slice of it. Line numbers are anchors as of
`100bda8` — **function names are the stable reference.**

### Preprocessing (before any detector runs)

| Stage | Where | Information it can destroy |
|---|---|---|
| Line split | `parseAppsScriptData` ~7046 | The concat-repair rule `(?<=letter)(?=\d+\s+letter)` split `…rest x` \| `2 sets of all (40 min)` — the mechanical cause of the ×2-on-a-40-minute-block incident. **Duplicated verbatim as `rawLines2`** further down; keep in sync. |
| Cap hints | `partCapHints` ~2742 | — |
| Part split | `extractTimerConfigs` ~3464 | Until 2026-08-08 the `part N:` line's own inline spec. |

### Inside `detectTimers` ~2789

| Block | ~line | Emits | Guard / ordering assumption |
|---|---|---|---|
| Cap scan | 2790s | `capSeconds`; `effCapSeconds = local ‖ part hint` | — |
| Hoisted helpers | 2821+ | `writtenTotalMin` / `writtenTotalRounds` / `stationCount` / `rotationRounds` | shared — **do not re-derive a total inline** |
| A · single-line interval | ~2900 | one `tabata` | **`return results` at 2922 — a hard early-out.** Everything below, incl. For Time and the cap, is skipped |
| B · chained timeline | `chainFromTimeline` 2543 | one chained `tabata` | sets `chained` — the master flag for C/D/H/I |
| C · AMRAP regex | 2940 | `amrap`, or emom-modeled `×N` rotation | `!chained` |
| D · EMOM / rotation family | 2961+ | `emom` configs | `!chained`; **`consumedRanges` overlap tracking exists only inside this block** |
| E · custom work/rest fallback | 3179 | `tabata` | `!results.some(type === 'tabata')` |
| F · bare `tabata` keyword | 3266 | 20/10 ×8 default | same guard; moved below E on 2026-08-03 |
| G · For Time / RFT | 3276 | `fortime`; else-arm standalone `TC N′` | else-arm needs `results.length === 0` |
| H · bare "N min work" | 3289 | `amrap` count-up | `!chained && results.length === 0` |
| I · leading standalone duration | ~3337 | `amrap` count-up | `!chained` only |

### `extractTimerConfigs` ~3464 — branch coverage ids

`whole-cell` · `activity-fallback` · `part-split` · `part-inline-spec` ·
`compound-chain` · `staged-part` · `header-cap`. All **seven** are asserted to be
hit by ≥1 fixture. (`staged-part` added 2026-08-10 — the compound chain's
*suppression* is a branch too, and giving it an id is what keeps a future edit
from quietly disabling the chain everywhere.)

---

## 4. Structural diagnosis (confirmed against code)

Why the same failure shape kept recurring — these are causes, not bugs:

1. **Order-dependence.** Four different guard idioms coexist: `return results`
   (A), `chained` (C/D/H/I), `!results.some(type==='tabata')` (E/F),
   `results.length === 0` (G-else/H). Three documented incidents were literally
   *fixed by moving a block*. The `!results.some(tabata)` guard works only
   because chain, A and E coincidentally share an emitted type string.
2. **Duplicated fragments.** `EVERY_WORD`, `capSecondsFromLine`,
   `PART_HEADER_RE` were each centralized *after* an incident. Still duplicated:
   station markers ×5 sites, work/rest/on-off keyword sets across ~6 functions,
   the preprocessing split rules (`rawLines`/`rawLines2`).
3. **Inline re-derivation.** Totals are genuinely solved (`writtenTotalMin` is
   hoisted and shared). **Round counts are not** — see §5.
4. **Silence ambiguity.** `[]` is both "she wrote nothing" and every parse
   failure. **Closed 2026-08-08** by the timing-facts assertion.
5. **Preprocessing lossiness.** A lossy split → `text = lines.join('\n')`
   re-join sandwich, so line-anchored rules and whole-text rules disagree about
   what "same line" means.
6. **No coverage signal.** **Closed 2026-08-08** by branch counters.
7. **Two layers own one pattern and disagree about POSITION.** *(added
   2026-08-10, the `7 min lat and quad mobility` warm-up.)* `parseLine`'s
   `isInstruction` and the leading-block-duration detector both recognise
   `^\d+\s*(min|sec|rounds|sets)`, but only the detector carries a positional
   guard ("first content line"). An untimed `600 run x 1` above it meant the
   board **painted a red time-badge on a line no detector ever examined** —
   nothing misspelled, nothing unrecognised, and the display *looks* like it
   understood. Distinct from causes 1–6, and not closed: the two layers are
   still independent. **When adding a positional guard to one layer, ask what
   the other does with the same line.** A fixture of the shape would have caught
   it via the unexplained-timing-facts assertion — which is the cheap mitigation
   until the layers actually share a predicate.

---

## 5. Known open defects — real, currently unguarded

Not fixed in the 2026-08-08 session on purpose: each is a behaviour change with
no covering golden, i.e. exactly the kind that needs its own fixture and, for
some, the coach. **These are all *detection* defects — for the runtime ones
(state, the docked clock, teardown) see §2c.**

- ✅ ~~**Two drifted exercise-line filters.**~~ **CLOSED 2026-08-08** — unified
  behind `isExerciseLine`; the drift was real (`3 sets` counted as an exercise
  in one path only → `×4` where the stations say `×3`). Fixture
  `exercise_line_filter_drift`.
- ✅ ~~**The unit alias written two ways**~~ — **CLOSED 2026-08-08**. 18 sites
  rejected the coach's `mins`, 11 accepted it. Normalized. Fixture
  `plural_mins_alias`.
- 🟡 **`rounds = exerciseLines.length || 5` — the last surviving invented
  value.** **Instrumented 2026-08-08, deliberately not deleted.** Every firing
  is recorded to `localStorage['wodboard-invented']` on the live board and the
  config carries `roundsInvented: true`; the harness prints which fixtures
  depend on it. **Read the record off the gym TV in a few weeks, then decide** —
  deleting it blind turns working clocks into no-clock. No fixture except the
  deliberate `invented_rounds_fallback` depends on it today, which is
  encouraging but is *fixture* evidence, not *real-sheet* evidence.
- **Six different round sanity windows**, none of them chosen as a policy:
  2–30 (A, 2911), 2–60 (amrap ×N, 2945), 2–10 (`minXmRe`, 3056), 2–20
  (`mmssXmRe`, 3076), 2–30 (E derived, 3219), 2–20 (`detectActivityInterval`,
  3413). Fold into one `resolveRounds(facts, window)` with the windows passed in
  unchanged, then argue about the numbers separately.
- **Block A's `return` at 2922.** A cell whose first matching line is a
  work/rest interval can never surface a For Time, a cap, or a leading-duration
  clock written below it. Latent, uncovered by any fixture — the same shape as
  the bug just fixed.

---

## 6. Roadmap, ranked by (failure-class eliminated) ÷ (risk × effort)

| # | Item | Status |
|---|---|---|
| 1 | Timing facts + unexplained-facts assertion | ✅ **done** 2026-08-08 |
| 2 | Detection-branch coverage counters | ✅ **done** 2026-08-08 |
| 3 | Vocabulary consolidation — station markers, unit aliases, exercise-line filter, split rules to single consts | ✅ **done** 2026-08-08. All 26 pre-existing goldens byte-for-byte unchanged; closed two live drifts (see §5). ⬜ **Remaining:** ~15 duration regexes are still *literals* that merely happen to spell the alias identically to `MIN_WORD`/`UNIT_STRICT`. Converting them to `new RegExp` template strings built from the consts is the last mile — deferred as churn in the most fragile function for marginal gain, but it is why a new site can still be written wrong |
| 4 | One shared `resolveRounds()` | ⬜ **next.** Moderate effort, fully harness-guarded; folds the six sanity windows (§5) into one place |
| 5 | Full candidate/arbitration model (all detectors run, one conflict-resolution stage with stated precedence, replacing first-match-wins-with-guards) | 🚫 **deliberately not doing now** |
| 6 | `?diag=1` panel / coach-facing parse report in `coach.html` at posting time | ⬜ nice-to-have; the harness assertion already covers the regression case |
| 7 | Corpus fixtures from the coach's historical sheets, property-tested only (no goldens) | ⬜ the only measure that catches shapes nobody imagined |

**Why #5 is parked, not abandoned:** it is the highest-effort, highest-risk item,
and after #1–#2 order-dependence no longer produces *silent* failures — a
mis-ordered detector now trips the property test or a fixture instead of blanking
the TV. Revisit only if incidents persist after #3–#4.

**Explicitly not worth doing:** rewriting the preprocessing splits (they are
load-bearing for layout and duplicated in a second parse path — extracting facts
from *raw* text sidesteps their lossiness without touching layout); and any
"cleanup" of the ×N-vs-`N sets`×stations asymmetry or the bare-`m`/`s` rejection
— both are coach-confirmed semantics that only look like bugs.
