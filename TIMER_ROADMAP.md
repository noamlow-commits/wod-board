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

### ✅ ANSWERED 2026-08-27 — a CASHOUT runs INSIDE the cap

**The question:** the coach's board showed `FOR TIME: / 30 -20 -10 / … / 13 min tc
/ cashout - / 40 hanging leg raises / 20 biceps curl`. Does the cashout sit inside
the 13-minute cap, or after it?

**Noam:** *"כל התרגיל אמור להיות 13 דקות, כאשר בהתחלה יש חזרות, ואחר כך כשמסיימים
את החזרות יש את הקאשאאוט של התרגילים האחרים, וה-TC אמור לכלול את הכל."*

⇒ **One cap over both stages. One clock.** `TC 13′ · For Time` was correct all
along; only the visual boundary was missing (see `PARSER.md`, the CASHOUT rule).

⭐ **Worth recording as a near-miss.** The reported symptom was *"the cashout is
not marked, and therefore not included in the running timer"* — which reads like
a timer defect, and the obvious fix would have been a second clock for the
cashout. That would have been a whole feature, and **wrong**. Asking the one
semantic question instead of building turned a feature into a badge.

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

### Q6 — Does she ever write a block duration with NO multiplier? 🔴 NEW 2026-08-21

`WARM UP x 6 min` now gets its clock, and `8 min WARM UP :` always did. What
still does **not** is the bare trailing form with no `x`:

```
WARM UP 6 min
10 CAL Row/Bike
```

This is deliberate, not an oversight. Dropping the `x` requirement would also
claim `A. Deadlift Prog-8 min` (fixture `station_labels_with_keywords`), where
the 8 is how long she expects a progression to *take* — a note, not a clock she
wants on the TV. The two shapes are indistinguishable by pattern; only she knows
which she means.

**Ask her:** *when a block runs for a set time, do you always write the `x`
("WARM UP x 6 min") or sometimes just the number ("WARM UP 6 min")?* If the `x`
is habitual, this closes and the guard is already correct. If not, the answer is
a **convention** ("write the x when you want a clock") rather than a cleverer
regex — because no regex can separate her two meanings here.

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

## 2d. What shipped 2026-08-13 (sw v140) — two missing clocks, one new failure class

Both reported by Noam off the gym TV, same board, same morning.

| # | Change | Why it mattered |
|---|---|---|
| 1 | **`isLabelOnly` no longer swallows a line that carries timing** | `8 min WARM UP :` — a label AND a duration on one line. The `:` guard exists to walk *past* labels to the duration beneath; the two shapes were tested independently, so a line that is both was skipped as empty |
| 2 | **`warm up`/`cool down` out of the pace blacklist**, and the list single-sourced as `PACE_DESCRIPTOR` | a block NAME is not a pace descriptor. `easy`/`recovery` stay — `set_wave_lift`'s "20 min easy row" is the surviving positive case |
| 3 | **`mom` optional in the bare-`e` EMOM shorthand** | `e 1:30 x 7` over a snatch complex → no clock. A 10:30 EMOM lost to one absent token |
| 4 | Fixtures `warmup_header_carries_its_duration`, `emom_bare_e_shorthand` | both verified to FAIL with their fix reverted — not decorative goldens |

**#2 is the one to remember, and it is a new entry for §4.** The same blacklist existed a second time — *drifted* (`warm[\s-]?up` vs `warm\s*up|warmup`) — inside `extractTimingFacts`, i.e. inside the **audit channel built in §2 #7 to make exactly this class of silent miss impossible to ship**. It recorded the 8 min as `ignored: "pace"`. A fixture of that cell would have passed with an empty timer list. Confirmed by reverting: the fixture fails on `expectTimers` only; the property test never speaks.

> **A measurement channel that contains a copy of the rule it audits cannot contradict it.** The unexplained-facts assertion is still the right guard — it caught #3's shape instantly (`1:30` written, no clock) — but its coverage is exactly *"all written durations, minus whatever the ignore-list already excuses."* Every `ignoreFacts` entry and every shared ignore const is a hole in it, by construction. Keep such exclusions in ONE const consumed by both sides, and give each one a fixture asserting its positive case.

**Also worth noting:** #1 and #3 are both the §4 cause-7 shape again (two layers, one pattern) — the display layer painted red time badges on `8 min` and `1:30` while no detector examined either line. That is now three separate incidents from one cause, and it remains open.

---

## 2e. What shipped 2026-08-20 (sw v141) — the written total, on the other interval path

Found while answering a question that was not about this at all: Noam asked why
the bottom bar reads `חלק 2 / 2` beside a timer chip reading `(1/2)`. It does not
conflict — those are two different collections (parts vs. the focused part's
timer array), and there is no bug there. But measuring the cell to answer it
surfaced one.

| # | Change | Why it mattered |
|---|---|---|
| 1 | **`mmssXmRe` now consults `writtenTotalMin()`**, with the same three-tier precedence `everyExpRe` has always had (written total → `(N Rounds)` → header ×N) | `every 2:30 x 4 sets (30 min total)` shipped a **ten-minute clock on a thirty-minute block**. The coach's own written total reached no clock at all |
| 2 | Fixture `xsets_written_total_beats_xN` | verified to FAIL with the fix reverted — and it failed via the **unexplained-facts property test**, not merely the golden |

**Why this survived so long is the part worth keeping.** `mmssXmRe` is matcher 7;
the every-matchers are 8 and 9. When the coach writes the `x`, matcher 7 claims
the line and calls `consume()` — so `everyExpRe`, *the path that has honoured a
written total since the day it was written*, never sees it. The two matchers are
two spellings of one workout, and only one of them knew the rule. This is the
`cardio_written_total_beats_xN` incident (2026-08-04) again, one matcher over:
that fix hoisted `writtenTotalMin()` to the top of `detectTimers` **precisely so
the shapes could not drift** — and then a third consumer was left not calling it.

> **A shared helper prevents drift only in the paths that call it.** Hoisting a
> rule into one function is half the job; the other half is an assertion that
> every path reaching the same decision consults it. `writtenTotalRounds()` had
> exactly the same shape and *was* wired here — the two tiers sat one line apart,
> and nobody noticed one was missing.

⚠️ **What this deliberately does NOT decide.** `every M:SS x N sets` with **no**
written total still resolves to the literal ×N, byte-for-byte
(`evey_typo_explicit_rounds` and `hashfirst_stations_rounds` both pass unchanged,
and the live gym-TV cell that started this — `every 2:30 x 4 sets (10 min each)`
over three stations — still yields `2:30 ×4` = 10′). Whether *that* is what she
means, when her own note in the same cell reads *"נשארים בכל תחנה ארבע סטים ואז
עוברים"*, is a **semantics question for the coach**, not a code-consistency one —
the standing rule applies: do not guess it. `(10 min each)` also has no pattern
anywhere in the parser ("each" is unparseable), so nothing the board reads can
currently express "10 minutes per station".

> ✅ **ANSWERED 2026-08-21 (Noam): 2:30 per turn at a station — the current
> reading is correct and stays.** `intervalSeconds: 150` × 4 = 600 s: she starts
> the clock once per station and it beeps every 2:30 through the four sets. The
> question closes with **no code change**; see §2f. Worth noting that the
> guess-refusal was the right call *and* cost nothing — the value it declined to
> invent turned out to be the value already on the board.

Tests: verify-board **35/0** (all 34 pre-existing goldens byte-for-byte
unchanged), timer-nav **15/0**. sw v141.

---

## 2f. What shipped 2026-08-21 (sw v142) — a missing clock, and a clock in the wrong seat

Both reported by Noam off the gym TV, from the same live sheet, minutes apart.

| # | Change | Why it mattered |
|---|---|---|
| 1 | **The block duration may TRAIL its name**: `WARM UP x 6 min` now yields `6′ WARM UP` (fixture `warmup_trailing_x_duration`) | the whole warm-up column had **no clock at all** |
| 2 | **`blockClocksFirst`** — a clock declared on a station line is nested inside the block that cycles the stations, so the block's clock leads ⏱↻ (fixture `station_amrap_nested_in_rotation`) | `every 2:30 …` + `2# amrap 2` opened on **`AMRAP 2′ (1/2)`** — the TV told the room to start the wrong clock |
| 3 | **`expectTimerOrder`** added to the harness | see below — no existing assertion could fail on #2 |

**#1 is the third anchor in this rule to outlive its reason.** `8 min WARM UP :`
(2026-08-13) works; `WARM UP x 6 min` did not — *same block, same coach, same
column of the same sheet*, differing only in whether the number came before or
after the name. The `^(\d+)\s*min` anchor was chosen to keep `20 ring rows` and
`rest 3 min` out; **word order was never what it meant to test**. Counting the
previous two — "first line" (positional, widened 2026-08-10) and trailing `:`
(label proxy, fixed 2026-08-13) — the pattern is now hard to miss: *every guard
here has eventually excluded a legitimate case it was never aimed at.* When
adding a positional anchor to this rule, write down what it excludes.

**#2 is a failure class the harness could not previously express.** Every clock
in that cell was detected, correctly labelled, and correctly timed. Nothing was
missing and nothing was wrong — the *order* was, and index 0 is the board's
default clock. `expectTimers` passed on the broken code and `forbidTimers` had
nothing to forbid; order lived only in the golden, where `--update` would have
frozen it silently. Hence `expectTimerOrder`.

> **When a contract has a privileged position, assert the position, not just the
> membership.** This is the ordering twin of "Making SILENCE measurable": that
> assertion catches a value that reached *no* clock, this one catches values that
> all reached clocks in the wrong sequence.

✅ **§2e's open question is ANSWERED (Noam, 2026-08-21): the interval is 2:30 per
turn at a station, and the warm-up is 6 minutes.** Both were already what the
board produces — verified by value, not by label: the rotation config carries
`intervalSeconds: 150` (2:30) × 4 = `totalSeconds: 600`, i.e. she starts it once
per station and it beeps every 2:30 for the four sets her own note describes
(*"נשארים בכל תחנה ארבע סטים ואז עוברים"*); the warm-up carries
`totalSeconds: 360`. So **no value changed today — only the ORDER did**, and the
`(10 min each)` reading flagged in §2e stands rather than being replaced.

> The reason to write this down even though nothing changed: §2e left a live
> question about a number on the gym TV, and "the answer confirmed the current
> behaviour" is a *result*, not a non-event. An open question that is quietly
> dropped looks identical to one nobody ever asked.

Both fixtures verified to FAIL with the fix reverted (`warmup_trailing_x_duration`
via the unexplained-facts property test — *"DARK: duration written, NO timer: 6
min"* — and `station_amrap_nested_in_rotation` via the new order assertion).
Tests: verify-board **37/0** (all 35 pre-existing goldens byte-for-byte
unchanged), timer-nav **15/0**. sw v142.

---

## 2g. What shipped 2026-08-31 (sw v143) — the chain that never fired, and the beat it would have eaten

Noam, off the live board: *"the timer in part 2 is built of two parts — it can be
one continuous clock with a three-minute rest in the middle. Five times three
minutes, three minutes rest, then five times three minutes again."*

Her cell (`Endurance Day`, WOD column `2`): `every 3:00 x5 sets` · `3:00 rest` ·
`every 3:00x5 sets`. The board showed **two `3:00 ×5` clocks and nothing on the
written rest**.

| # | Change | Why it mattered |
|---|---|---|
| 1 | **`stitchSplitSpecs`** — `buildWorkoutTimeline` rejoins a spec `lineSplitRe` cut in half (`every 3:00 x` \| `5 sets`) | the timeline held **zero** work phases, so the chain could never fire on any `every X:XX ×N` block the coach writes with `N sets` after it |
| 2 | **A work phase carries the interval the coach wrote** (`intervalSeconds`), and the chain expands it into that many phases | the uniform chain would have flattened `every 3:00 ×5` into one 15′ slab — **ten written interval starts gone** |
| 3 | **The tick's phase-transition test moved from phase TYPE to phase INDEX** | back-to-back WORK phases were **silent**; detection can be perfect and nine of ten starts still announce nothing |

Result: one clock, `Every 3:00 ×5 · 3′ rest · ×5 (33′)` — 11 phases of 3:00, the
rest sixth, rounds 1..10, 33:00 total. Full write-up in PARSER.md
("An interval block inside a chain KEEPS its intervals").

⭐ **Both defects were found by measurement, not by reading.** Defect 1: the
identical lines fed in UNSPLIT chained immediately — so the matcher was never
wrong and no amount of staring at the regex would have shown it. Defect 3: the
real `timerTick` driven across all 33:00 with `TimerAudio` stubbed fires **10**
boundary cues under the index test and **2** under the type test.

⭐⭐ **This is §2c's blind spot for the third time.** Fixing only detection here
would have *replaced* a wrong-shaped clock with a silent one, and all 39 goldens
would have passed on it — the harness has no channel for "the clock made no
sound". Defect 3 was reachable only by driving the tick.

⚠️ **Answers Q3 for this cell, in the opposite direction to the last one.** On
2026-08-10 a staged part was ruled *"two clocks, Noam's call"*; here he ruled
*one continuous clock*. The difference is real and is the predicate already in
the code: a **staged** part has an unclocked segment whose end the athletes
decide, so a fixed offset would start the next block while people are still
running. This cell has no staged segment — every phase is a written duration, so
the schedule is knowable in advance. **The rule is not "chain" or "don't chain";
it is whether every transition moment is written.**

⏸ Left open on purpose, one grep away from here:
- The cell now yields exactly **one** config — `!chained` (~3212) still suppresses
  the per-block clocks. Long-standing and locked by `chained_amrap`; if she ever
  needs block 2 alone, that is a decision about the gate, not about this fix.
- **The tabata branch never plays `last_round`.** ~4457 sets `_lastRoundAnnounced`
  and stops; the EMOM branch at ~4405 says it. Pre-existing, now visible because
  a 10-round chain reaches it — round ten announces nothing. Not batched in.

Tests: verify-board **39/0** (all 38 pre-existing goldens byte-for-byte
unchanged), timer-nav **15/0**. sw v143.

---

## 2h. What shipped 2026-09-03 (sw v144, `7cee54f` + `bd270aa`) — the number the decimal point hid

Noam, off the live board: *"בלוח 2 במצב ממורכז בקטגוריות ווד יש מספור; הספרה 1
בשורה שאחרי ההוראות אינה ממורקרת בצהוב, כנראה בגלל שיש אחריה נקודה."*

Her cell (WOD column `2`, 3.9): `EVERY 2:30X 4 sets` · `1.5 REPS- 70-75%` ·
`2- 4 REPS- 77-80%` · `3- 3 REPS- 82-85%` · `4- MAX REPS 70 %`. One reported
symptom; pulling the thread found **the same decimal point breaking three
different layers.**

| # | Change | Why it mattered |
|---|---|---|
| 1 | `SET_NUM_TIGHT_RE` — a set number written tight against its period | `1.5 REPS` (= set 1 · 5 reps) matched no leading-number rule at all and rendered white between three amber siblings. Amber, not the red `N.` of a station list: **the colour is chosen by the siblings the line sits with.** |
| 2 | `DUR_NUM` through all 7 duration-badge sites | `2.5 min rest` painted a red **`5 min`** badge — the `\b` in `\b(\d+)` sits between the `.` and the `5`. A **wrong duration on the TV**, not a missing badge. Also `0.5 min` → `5 min`, `t.c 7.5` → `7`. |
| 3 | `minsToSec`/`secsToSec` + `DUR_NUM` through ~19 detector lexers | Three failures, three severities: `AMRAP 2.5 min` measured **2′** (wrong value), `3 min run / 2.5 min rest ×5` lost its interval clock **entirely**, and `7.5 min tc` produced **no cap at all** — a block running uncapped with nothing on screen looking wrong. |

⭐ **The interval one needed TWO blind spots to line up.** `parseDur` could not
read `2.5 min`, *and* `restPairRe` — the guard that tells the
leading-block-duration rule "this cell is the WORK half of an interval, stand
down" — could not see a decimal rest either, so a ghost `3′ run` count-up won
the slot `detectActivityInterval` should have had. **Fixing only the first
would have left the clock missing.** The half-applied-rule failure mode again.

⭐ **Labels moved to `fmtDur`** (from `${mins}′` and `Math.floor(cap/60)`).
`fmtDur` is byte-identical for whole minutes — `fmtDur(720)` → `12′` — which is
why **all 40 pre-existing goldens passed with 0 diff**: the change is invisible
to every integer workout. It also fixed a latent truncation: a `t.c 1:30` cap
had always printed `TC 1′`.

⭐ **The guard is Noam's, and it is the whole safety argument:** *"רק תשים לב
שמדובר בציון דקות ולא 2 נקודה וסעיף 5."* A decimal becomes a duration **only
where a time unit or a format keyword is bound to it** — min · sec · AMRAP ·
EMOM · t.c · work · rest · on · off · M:SS. That binding is what keeps her set
numbering out of the clock. **Never widen one of these to accept a bare
number.** Non-vacuously locked by `set_numbering_is_not_a_duration`: her whole
wave, not one timing word, golden = an **empty timer list**.

📌 **A correction worth keeping.** The session first reported `7.5 min tc` as
producing a visible **`TC NaN′`** on the gym TV. False — and false because of
the PROBE, not the board: an ad-hoc script passed the row's section label where
`extractTimerConfigs` expects `partCapSeconds` (a number), so
`Math.floor("מטקון"/60)` made the NaN. The real defect was quieter and worse to
ship — a cap that silently vanished. **A throwaway probe has no argument
checking; the harness does. Reproduce in a fixture before believing a
symptom**, especially a dramatic one.

New guards: `TIME_BADGE_CHECKS` (16 cases on the badged **text** — no golden
and no `BADGE_CHECKS` can see it; reverting `DUR_NUM` fails 7 of 16), 6 new
`BADGE_CHECKS`, a third `STATION_CATEGORY_GROUPS` group (with `badge: "rep"`,
so a group declares which colour it expects), and 5 fixtures —
`set_wave_bare_numbers`, `decimal_amrap`, `decimal_interval_rest`,
`decimal_time_cap`, `set_numbering_is_not_a_duration`.

Tests: verify-board **44/0** (all 40 pre-existing goldens byte-for-byte
unchanged), timer-nav **15/0**. Verified against the LIVE board after deploy.
sw v144.

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
   until the layers actually share a predicate. **Two more instances 2026-08-13**
   (`8 min WARM UP :`, `e 1:30 x 7`): three incidents, one cause, still open.
8. **An audit channel that contains a copy of the rule it audits.** *(added
   2026-08-13, the `8 min WARM UP :` warm-up.)* `extractTimingFacts` carried its
   own drifted copy of the detector's pace/warm-up blacklist, so the
   unexplained-facts assertion — cause 4's closure — classified the missing 8′
   clock as a deliberate omission. **This is the failure mode of the safety net
   itself, and it is invisible from inside:** the assertion is green, the fixture
   passes, and the only signal is a human watching the TV. Distinct from cause 2
   (duplicated fragments) because the duplication crosses the boundary between
   the code and its own test oracle — a drifted copy there doesn't produce a
   wrong clock, it produces a *wrong proof*. Mitigation shipped: one shared
   `PACE_DESCRIPTOR`. Mitigation NOT shipped: nothing prevents the next
   exclusion from being written twice, and `ignoreFacts` entries remain
   unaudited holes by design. **Before trusting a green property test on a
   missing-clock report, check whether the fact channel ignores that shape.**

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
- 🟡 **Two duration readers are still integer-only** (2026-09-03, the deliberate
  remainder of the decimal fix). Both are *safe* misses, which is why they were
  left — but they are misses:

  | Reader | Written | Today | Should be |
  |---|---|---|---|
  | `writtenTotalMin()` (`(N min total)` override) | `(7.5 min total)` | reads **7** | 7:30 |
  | `isInstruction` (`^\d+\s*(rounds?\|min\|sec\|sets?)`) | `1.5 min work` | not classified as a timed line at all | a timed line |

  `writtenTotalMin()` returns **minutes** to six call sites that each multiply
  by 60, so widening it means auditing all six for fractional seconds — and a
  coach writing a decimal *total* has never been seen. `isInstruction` is
  missed by the display **and** the detector, so the two agree; widening only
  the display half would re-create the disagreement documented in PARSER.md
  ("UNTIMED work may precede the block duration") where the board paints a time
  nothing detected. **If either is fixed, fix the pair in one commit with its
  own fixture** — a decimal that reaches a badge but no clock is worse than one
  that reaches neither.

- 🔴 **Three emit paths still ignore `writtenTotalMin()`** (found 2026-08-20 by
  grepping the helper right after fixing `mmssXmRe`; all three confirmed by
  measurement — the same cell with and without a written total produces
  byte-identical output):

  | Path | Written | Clock | Should be |
  |---|---|---|---|
  | `amrapRe` (`AMRAP N ×M`, ~3154) | `AMRAP 10 x3 (20 min total)` | `AMRAP ×3 · 10′` = **30′** | 20′ |
  | `emomShortRe` (`e M:SS ×N`, ~3269) | `e 1:30 x 7 (15 min total)` | `EMOM 1:30 ×7` = **10.5′** | 15′ |
  | `minXmRe` (`N min x M`, ~3284) | `4 Min x2 (12 min total)` | `4′ ×2` = **8′** | 12′ |

  Each is the same omission as the three already-closed ones (single-line
  interval 08-04, on/off fallback 08-04, `mmssXmRe` 08-20), so the class is now
  **six incidents from one cause** and counting. `minXmRe` is the sharpest:
  its own comment names `"4 Min x2 (8 total)"` as the worked example and the
  code has never read that total — invisible only because 4 × 2 = 8 makes the
  wrong path print the right number. `emomShortRe` is *newer than the rule*
  (shipped 08-13, sw v140) and was written without it.

  **Deliberately not fixed on 2026-08-20** — Noam's call was the one confirmed
  defect only, and each of these moves a live clock on the gym TV, so each needs
  its own fixture plus a reverted-fix counterfactual. **Do not batch them into
  one commit**: they have different sanity windows (`amrapRe` 2–60,
  `minXmRe` 2–10, `mmssXmRe` 2–20) and `amrapRe` also owns the
  amrap-vs-emom fork, so a shared "just call the helper" patch would silently
  re-tier three different decisions at once. ⚠️ Before fixing, settle the
  ordering question too: these matchers run *before* the `every` paths and
  `consume()` their spans, which is the mechanism that hid `mmssXmRe` for
  thirteen months — the real fix may be an assertion that every emit site
  consults the helper, not four more call sites.

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
