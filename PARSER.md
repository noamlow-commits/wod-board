# WOD Board — Parser & Layout / Timer Spec

Deep specification for the sheet parser, newspaper-column layout, and timer
detection/display. Extracted from CLAUDE.md so that file stays a lean project
overview and this accumulating detail lives here. **Put new parser/layout/
timer detail in THIS file**, not CLAUDE.md.

Regression-tested by `test/verify-board.mjs` (see `test/README.md`).

## Layout System (index.html)

### Newspaper Flow
Content flows in flex columns. Smart column breaks prefer section headers at top of columns.
Spanning headers: when a section spills into multiple columns, its header spans all those columns.
`part N` headers force a column break — every `part 1/2/3` block starts at the top of its own column (the section header spans them all). **Softening:** a part too small to fill a column on its own (fewer than 3 lines) is merged into the column it follows, so the board never shows a near-empty lonely column.

**Count-split widow guard + balanced fallback:** when a long section is split into newspaper columns by line count, the break is first pulled to the nearest sub-header. If that sub-header sits near the very top/bottom (leaving <3 lines on one side — the "first row alone left, rest right" bug), the break is **not** abandoned: it falls back to the most *balanced* break point that keeps ≥3 lines on both sides, preferring a clean boundary (sub-header / `A.`/`B.` group / `N#` station) so column 2 starts on a fresh line. A section with no balanced break (genuinely short) stays one column. The guard is "no empty gaps," **not** "never split short sections" — a 10-line block becomes two even columns, never one line beside nine.

**Group cohesion — a superset (A1/A2) is ONE atomic column (added 2026-07-08).** A *letter-group* is an `A.`/`B.` header **plus** its `A1`/`A2` sub-stations **plus** their detail lines (sets / reps / `@75%` load / tempo / rest) — and a cosmetic blank line the coach puts between siblings stays inside the group. Every item is tagged with a `groupLetter` in the item-build loop; the group ends only at a real new block (new group letter, `part N`, a format header AMRAP/EMOM/For Time/Tabata/Every, a `N#` station, or a warm-up line). Two consequences in the column splitter:
- **Never force-split a single group.** The wide-TV "divide a structured section into two columns even when it fits" behaviour now fires only when the segment holds **≥2 independent blocks** (distinct group letters + runs of non-group content), not merely "≥1 group header." A part that is one `A.` group with A1/A2 (the classic bench superset) stays one column instead of being torn A1|A2. This was the reported bug: the coach's blank line between A1 and A2 was even ranked as the *best* break point ("start of a new block").
- **Never break inside a group.** In the balanced newspaper split, a candidate break where `groupLetter[i] === groupLetter[i-1]` is rejected, so a column may only start at a group boundary (new letter / independent block), never between two members of the same letter-group. Genuine overflow (a group taller than a column) falls back to one tall column that auto-fit shrinks, rather than a mid-superset tear.

Regression-guarded by the `superset_group_cohesion` fixture **and the LAYOUT assertion pass** in `verify-board.mjs` (the parse/timer goldens don't see column geometry, so a dedicated render-and-inspect pass asserts part "2" is one column with A1+A2 together).

**Inline `@load` stays on its line (added 2026-07-08).** `parseAppsScriptData` splits a cell on `@` **only** when the `@` is not introducing a load — the split regex is `/\s*@\s*(?!\d|bw\b|rpe\b)/i`. So `x 6 reps @75%`, `Deadlift @100kg`, `@BW`, `@RPE8` stay intact; a bare `75%` no longer widows onto its own giant line. (Both parse paths — the two `rawLines`/`rawLines2` sites — carry the same regex; keep them in sync.)

**Lead-in anti-widow (never strand a header from its content):** a column must never *end* on a line that introduces the lines beneath it. The pull-back covers all "lead-in" lines, not just single-letter group headers: `A.`/`B.` group headers, **sub-group headers (`B4. 4 sets of:`, `A1.`)**, `N#` stations, instruction sub-headers (AMRAP / `×3 sets`), and `part N`. Each item is flagged (`isGroupHeader` / `isSubGroupHeader` / `isStation` / `isSubHeaderLine` / `isPartHeader`) and `isLeadIn()` pulls the break back until the closing column ends on a real content line — so e.g. `B4` travels to the next column **with its sets**, instead of being stranded at the bottom while its rows flow into the next column. The balanced fallback also prefers landing the break *before* a sub-group header.

### Per-set lift wave — "Set N" headers (added 2026-07-09)
A coach's strength wave written one set per line — `Set 1: 5 Reps` / `70% 1RM` / `Set 2: 3 Reps` / `80% 1RM` … — now renders each `Set N` line as a **workout part divider**, since each set *is* a part. `parseLine` detects `^\s*set\s+(\d+)\s*[:.\-)]?\s*(.*)$` and returns a `sub-header` with `isGroupTitle:true`, emitting the cyan **`SET N` group-badge** + `group-line` styling (the same "this is a PART" language as `A.`/`B.` group headers — see Section Colors). The remainder's leading rep count (`5 Reps`) is bolded via `rep-number`; the `%/1RM` line beneath flows under the header as its content. Because the header is a `sub-header`, the lead-in anti-widow guard keeps `SET N` glued to its load line, and balanced column breaks prefer landing *before* a `SET` header (so a wave splits cleanly, e.g. Sets 1–2 | Sets 3–5). **Prose safety:** the rule requires `set` + whitespace + a digit, so `Set up the rig` / `Settle in` never match. Guarded by the `set_wave_lift` fixture (no false timer on the wave) + three `BADGE_CHECKS` in `verify-board.mjs`.

### A leading station NUMBER keeps its badge and its category (added 2026-08-04)
The coach's CARDIO rotation numbers its stations `1.` `2.` `3.` `4.`. Three of
them rendered as red `time-badge` markers on white exercise lines; **`2. amrap :`
rendered as an all-orange sub-header** — the number never got its badge and the
whole line changed category. Four siblings, three looking one way and one
another: a **within-category** inconsistency, which is the only kind of badge
inconsistency that is ever a bug (the red/orange/cyan split itself is semantic
and must never be flattened — 🔴 times + generic labels, 🟡 rep counts, 🟦 A/B/C
part structure).

Two rules were hijacking the line before it reached the numbered-list badge
(`html.replace(/^(\d+)\s*[\.\)]\s+/, …)`, ~4979): the generic **colon/all-caps
sub-header** rule (`/^.{2,}:$/` — the line ends in `:`) and the **instruction**
rule (it names `AMRAP`). Exactly the shape of the `A1. 4 Sets Of:` bug fixed in
`d656ec4`, and of `feedback_station_label_beats_instruction` — station label
beats instruction keyword.

Fix: one shared predicate in `parseLine`, `isNumberedStation` =
`/^\s*\d+\s*[\.\)]\s+/` — **the same pattern that earns the badge** — now guards
**both** rules, alongside the existing `A1.`/`A2.` guard `^[A-Z]\d+\s*[\.\-\)]`.
Digits + `.`/`)` + whitespace is required, so genuine instruction lines (`3 sets`,
`2 rounds`, `18 min amrap`) are untouched, and `1-`/`2-` dash separators (which
never got the badge either) stay as they were.

Guarded by the **station-number category consistency pass** in
`verify-board.mjs` — it asserts every line of a sibling group resolves to the
same `parseLine` type **and** carries the leading red `N.` badge. A golden
snapshot could not catch this (the goldens hold the parse tree, not the badge
HTML).

⚠️ **Deliberately NOT changed:** a numbered station is still **not** an
`isStation` clean-break point in the item-build loop (~5145) — that predicate
stays `#`-marker-only. Adding numbered lines there would re-rank column breaks
across every numbered warm-up list in the repo, which is a layout change, not a
colour one.

### Section Colors
- WOD sections: orange gradient `#ea580c → #f97316`
- CARDIO sections: purple gradient (default theme)

### Warm-up Detection
Tracks zone from "warm up" line until next sub-header (AMRAP/EMOM/FOR TIME/EVERY).
Numbered items (`1. 10 Hip 90-90`) do NOT reset `inWarmup` — only sub-headers do.
Warm-up zone gets amber tint + side border (`.warmup-part`).

### TV Navigation Panel
Fixed bottom-center panel: ◄/► cycle parts, section filter (WOD/CARDIO/הכל), 🏠 reset.
- Active section button: red highlight
- Panel hidden in BOARD and PR modes
- **Stable ◄ ► position (option B, 2026-07-09):** the nav is center-anchored (`left:50%; translateX(-50%)`), so anything that changed its width slid ◄ ► sideways. The per-part timer buttons (`#tvTimerBtn`, `#tvTimerCycleBtn`) toggle as the coach navigates parts (some parts have a timer, some don't), which used to resize the nav and force her to re-aim the remote each time. Fix: those buttons now hide via **`visibility:hidden` (reserved box), not `display:none`**, and `#tvTimerBtn` has a **fixed 11rem width + ellipsis** so a longer timer label can't change the width either. Result: nav width is constant → ◄ ► never move. Verified headless (nav width + ◄ x-pos identical across no-timer / short-label / long-label+cycle states). Trade-off: ~11rem of the nav is always reserved even when no timer is present.
- `setTvSection()` triggers autoFit retries
- **`setTvSection()` preserves `partFocusIndex`** across section switches (clamped to the new section's max part count). Re-runs `applyCenterFocus()` so the center overlay retargets the new section's part instead of staying frozen on the previous section. Drops out of focus entirely only if the new section has zero parts. Fixes the "stuck overlay when switching WOD ↔ CARDIO" bug (v24).

### Center Focus Overlay (⊙)
Full-screen overlay for focused part. Starts at `top: 80px` (top bar stays visible).
Font auto-fit: binary search (14 iterations), 8% safety margin.
Close: press ⊙ again or 🏠.

### Docked timer clock position — TOP-CENTER (rewritten 2026-07-27)
The docked timer clock (`#floatingTimerBar.timer-dock`) is a **big fixed box at the TOP-CENTER** of the board (`position:fixed; top:2px; left:50%; translateX(-50%)`, orange border, blurred dark bg). History: it was top-right (2026-07-09), then the coach asked for bigger + top-center. Three `:root` tuning knobs:
- `--timer-clock-size` (12vw→**10vw**) — the digit size.
- `--timer-dock-h` — the TOP space `#wodArea` reserves so the workout sits BELOW the clock, **never covered**. **`syncTimerTopReserve()` measures the clock box's real height every state change (throttled ~4×/sec, change-guarded) and writes it to `--timer-dock-h` (+12px)** — so the reserve always exactly matches the box (any size, any state: countdown vs running, phase line present or not). A reserve change debounces a re-fit (autoFit / applyCenterFocus). The static 30vh is only a first-paint fallback. **Do NOT hard-code the reserve; a static value that's smaller than the box lets the clock override the workout text** (the CARDIO-purple-bar bug, 2026-07-27).
- `--timer-dock-w` — only used by legacy split fallbacks now.
`#ftbRound` (round number, e.g. "R1/9 · tot …") enlarged to **2.3vw bold** (coach: read it "within" the stage). **Center-focus:** the same reserve applies to the `#tvCenterOverlay` via the `.clock-reserve` class (`padding-top: calc(--timer-dock-h - 80px)`, since the overlay sits at `top:80px`) — replaced the old top-right flow-around-corner spacer. **Split mode** resets `left/transform` to keep its in-flow column between `#wodArea` and `#scoreboardArea`.

### QR Code Positioning
`repositionQR()` picks a **bottom corner only** (bottom-right → bottom-left) via `_findBestCorner(w, h, null, /*onlyBottom*/ true)` — the top corners are reserved for the docked timer clock (2026-07-09). `_findBestCorner`'s 4-corner list (top-right → top-left → bottom-right → bottom-left) is still available when `onlyBottom` is falsy.
Overlap detection uses **line-level elements only** (`.exercise-line`, `.flow-section-header`, `.scoreboard-table td`) — NOT large containers (false positives).
Call `repositionQR()` 900ms after render and 350ms after mode switches.

## Timer System (added 2026-03-19, phase-display added 2026-04-13)

5th display mode (`mode-timer`). Timer engine runs client-side via `requestAnimationFrame`. Coach controls via Apps Script.

**6 types:** AMRAP (countdown), For Time (count up + cap), EMOM (interval beeps), Tabata (work/rest), Custom intervals (30/10 etc.), MIX (custom intervals)

**State machine:** `idle → configured → countdown321 → running → paused → finished`

**Audio:** Web Audio API + 25 pre-rendered Harry voice MP3s (ElevenLabs; round calls 2–15) loaded as AudioBuffers for zero-latency playback.

**Sync:** Coach POSTs `timerCommand` to Apps Script. Board polls `getTimerState` every 2s via JSONP. Timer runs locally (no network latency). `getTimerState` is exempt from PIN (like `getWorkoutSheet`).

**Coach panel:** "⏱ טיימר" tab in coach.html. Type selector → config form → START/PAUSE/RESUME/RESET.

### ⭐ Shared vocabulary — one source per thing the coach can write (added 2026-08-08)

The **3-parallel-places rule kept being half-applied** because it relied on
someone remembering to grep. It cost the whole clock three times (`EVEY`,
`e2momx`, `tbata`) and cost the station badge once (`#1` hash-first matched only
some of five regexes). The fix is structural: every alias is now **one const**,
and each site builds its regex from it — a half-applied alias becomes impossible
rather than merely discouraged.

| Const | Covers | Consumers |
|---|---|---|
| `EVERY_WORD` / `everyRe` | `EVERY · EVEY · EVRY · EVREY` | rotation paths, format-header, warm-up reset |
| `STATION_HASH_FIRST` / `STATION_NUM_FIRST` / `STATION_BODY` | `#1` · `1#` · merged `2+3#`/`2-3#`/`2,3#`/`2 & 3#` | `stationCount`, the orange highlight, the clean-break `isStation` |
| `STATION_MERGE_SEP` | splits `2+3` into two stations | `stationCount` |
| `UNIT_STRICT` / `UNIT_LOOSE` / `MIN_WORD` | `min·mins·minute·minutes` / `sec·secs·second·seconds` (+ bare `m`/`s` in LOOSE only) | duration lexing everywhere |
| `PACE_DESCRIPTOR` | `easy · recovery` — a word that makes a nearby duration deliberately clockless | the leading-block-duration exclusion **and** `extractTimingFacts`' ignored list (added 2026-08-13; they were two drifted copies — see below) |
| `isExerciseLine` | "a line that prescribes an exercise" | `rotationRounds`, the custom work/rest fallback |
| `lineSplitRe()` | the concat-repair + mid-line-station split rules | **both** parse paths (was duplicated verbatim as `rawLines`/`rawLines2`) |

**⚠️ `UNIT_STRICT` and `UNIT_LOOSE` must NOT be merged.** Bare `m` is *metres*
(`3000 m run`, `400 m on the rower`), so it is only safe where the pattern is
already anchored by a literal `work`/`rest` keyword. That distinction is
semantic, not accidental — see the on/off note above.

**Two real drifts were found and closed by doing this, both silent until now:**

1. **The unit alias was written two ways** — `min(?:utes?)?` (min · minute ·
   minutes) at **18** sites and `min(?:ute)?s?` (which also accepts the coach's
   **`mins`**) at **11**. So `4 mins on 1 min off` parsed in some paths and not
   others, purely by which spelling that path had been copied from. All
   normalized to the permissive union (same for `sec`). Fixture:
   `plural_mins_alias`.
2. **The exercise-line filter had two copies that disagreed** — `rotationRounds`
   excluded lines leading with `set`/`round`, the custom work/rest fallback's
   copy did **not**. A bare `3 sets` line therefore counted as an *exercise* in
   one path and not the other, inflating the fallback's round count by one per
   such line (`30″/10″ ×4` where the stations say ×3 — a 20-minute clock on a
   15-minute block). Verified counterfactually on both filters, not assumed.
   Fixture: `exercise_line_filter_drift`.

**All 26 pre-existing goldens were byte-for-byte unchanged** by the whole
consolidation — that is what proves it unified without shifting behaviour.

### ⚠️ The last invented value — `rounds = exerciseLines.length || 5`

One guess remains in the pipeline, and it is a live violation of the
no-invented-values rule: with no `×N`, no written total, no same-line
`N sets of` and no countable exercise lines, the custom work/rest fallback
guesses **5 rounds**. Nothing the coach wrote says 5.

**It is deliberately NOT deleted.** Deleting it blind turns every sheet of that
shape from a working clock into **no clock**, and nobody knows how many there
are — which is the same silent-loss failure this whole section exists to
prevent. **Measure first:**

- Every firing is recorded by `recordInventedValue()` to
  `localStorage['wodboard-invented']` on the real board (rolling 40, deduped
  against re-parses, never shown on screen). Read it off the gym TV with
  `JSON.parse(localStorage['wodboard-invented'])`.
- The config carries `roundsInvented: true`, which surfaces in
  `timerParseReport().invented`; the harness prints **which fixtures depend on
  the guess** (today: only `invented_rounds_fallback`, the fixture that exists
  to make the cost of deletion concrete).
- A written total still overrides it, and clears the flag.

**Delete it when** the record shows it unused, or the coach confirms blocks of
that shape should be clockless. Then `invented_rounds_fallback`'s
`expectTimers` becomes `forbidTimers`.

### ⭐ Making SILENCE measurable — timing facts + branch coverage (added 2026-08-08)

Every incident in this file has one shape: the coach writes a workout, **one token doesn't match**, and detection returns `[]` — on the gym TV, in front of a class. `EVEY`, `e2momx`, `min`+`on/off`, the `(40 min)` total, today's `part N:` header. The reason they all shipped is structural, and it is worth stating plainly:

> **`[]` is also the CORRECT answer when she genuinely wrote no timing.** The no-invented-values rule is right — and it makes a parse *failure* indistinguishable from correct behaviour. Nothing in the pipeline could tell the two apart, so these bugs were only ever found by someone noticing a wrong clock in the gym.

Two guards now close that gap. Neither changes a single config — they are pure audit channels.

**1. Timing facts + the unexplained-facts assertion (`extractTimingFacts` / `timerParseReport`).** A **timing fact** is a number that lexes *with timing context bound to it*: a real unit word, an `M:SS` colon form, or a format keyword carrying its own length (`AMRAP 14`). That binding is what keeps rep counts, loads and calories out — `21-15-9`, `10 push up`, `@75%`, `30 cal` carry no unit, so the false-positive problem is solved **at the lexer**, not by thresholds.

- ⚠️ **Bare `m`/`s` are NOT units here** — `3000 m run` is metres. Same reason the on/off parser rejects them.
- Facts are extracted from the **RAW cell text, before `parseAppsScriptData`'s splits**, so the audit covers preprocessing too. This is essential: today's bug destroyed the information *in the part splitter*, downstream of any line-level check.
- Ranges (`40-60 sec Plank`) and pace descriptors (`20 min easy row`) are claimed FIRST and recorded as **intentionally ignored**, so their numbers can't be re-read as durations. Intentional non-detection becomes an assertion instead of an absence.
- Counts (`×N`, `N sets`, `N rft`) are recorded for context but **never asserted** — a count can legitimately be folded into a total the config never stores as its own field. They are also kept out of the `seconds` field: letting `3 sets` land there made a counts-only cell look "dark".
- The harness asserts, per fixture: **every written duration/cap reached some clock, or is listed in `fixture.ignoreFacts` as a deliberate miss.** `fixture.ignoreFacts` is the escape hatch — use it only when the miss is intended, and say why.

**2. Detection-branch coverage (`TIMER_PATHS` / `tpHit`).** A branch no fixture exercises is indistinguishable from a branch that works. The in-cell part-split branch had **zero** coverage for months. The harness now counts hits on each structural branch of `extractTimerConfigs` and **fails** on any at 0 — either write a fixture or delete the dead branch. Deliberately at BRANCH granularity, not per-regex: that is where the structural bugs have actually been.

**These paid for themselves on the first run.** The property test immediately flagged `activity_interval` — a fixture *named after* `detectActivityInterval`, whose golden was an **empty timer list**. The detector was reachable only from inside the part-split loop, so the coach's plain interval style (`5 sets / 3 min run / 1 min rest`, no part headers) produced no timer at all. The fixture had been silently asserting that the detector does nothing, because **a golden captures whatever the code does, not what the fixture means.** Now fixed (`3′/1′ ×5`) and locked with `expectTimers`.

**The lesson for anyone extending this file:** a golden is change-detection, not correctness. Give every fixture an `expectTimers`/`forbidTimers` claim, and let the property test decide whether silence is intent or failure.

> ⚠️ **THE BLIND SPOT IN THIS ASSERTION, found 2026-08-13 — read it before trusting a green property test.** The channel measures only what its own ignore-list does not already excuse, and that list held a **second, drifted copy** of a detector exclusion (`warm up`/`cool down`, alongside `easy`/`recovery`). So the coach's `8 min WARM UP :` — a written duration that reached no clock — was recorded as `ignored: "pace"` and the assertion agreed it was deliberate. **A fixture of that exact cell would have passed with an empty timer list, for months.** Verified by reverting the fix: the new fixture fails on `expectTimers` alone while the property test stays silent.
>
> Stated generally: **every entry in `ignoreFacts`, and every ignore const shared with the detector, is a hole in the property test by construction.** The audit cannot contradict a rule it contains a copy of. Two consequences for anyone extending this: (a) an exclusion lives in **one** const consumed by both sides (`PACE_DESCRIPTOR`), never copied — a drifted copy is worse than a shared one because it silently *widens* the hole; (b) an exclusion needs a fixture asserting its **positive** case (`set_wave_lift`'s "20 min easy row" stays clockless), the same "a suppression needs a surviving positive case" rule that `TIMER_ROADMAP` §2b learned from the compound clock.

### Chained interval detection (`buildWorkoutTimeline`)
Two-layer detection. Layer 1 sequential timeline parser scans lines top→bottom, classifies phases (WORK/REST/TIME_STANDALONE). If 2+ uniform WORK phases + REST found → one chained Tabata-style timer with `skipLastRest: true`. Layer 2 regex fallback (AMRAP N, EMOM N, every X:XX ×N, Tabata 20/10, custom on/off, For Time, t.c N) runs if no chain detected.

Sanity limits for chains: total ≤ 90 min, work ≥ 30s, rest ≤ 10 min, uniform durations only.

Chained timer button label: `${timerName} ×${rounds} · ${workMins}' work / ${restShort} rest` → e.g. `AMRAP ×3 · 10' work / 2' rest`.

**Custom work/rest units — `min` as well as `sec` on BOTH keyword pairs (fixed 2026-08-03, fixture `minutes_on_off_intervals`).** The coach wrote `4 min on 1 min off x 4` and the block produced **no timer at all** on the gym TV. Two work/rest patterns existed and she wrote the gap between them:

| pattern | keywords | units |
|---|---|---|
| timeline single-line (~2620) | `work` / `rest` only | min **and** sec |
| Layer-2 regex fallback (~2944) | `work`/`on` and `rest`/`off` | **sec only** |

`min` + `on/off` matched neither. Nothing else caught it either — no AMRAP/EMOM/`every`/tabata/for-time keyword, no `t.c` cap, and the *leading standalone block duration* fallback requires the **first content line** to lead with `N min` (here it is `Metcon:`), so not even a wrong 4-minute count-up appeared. Same silent-total-loss shape as the `EVEY` typo: one unrecognised token costs the whole clock.

Fix: the fallback's unit group is now `(min(?:ute)?s?|sec(?:ond)?s?)?`, read **independently on each side**, defaulting to **seconds** when omitted (so `30 on / 10 off` still means 30″/10″). The label goes through `fmtDur` → `4′/1′ ×4` instead of the old hardcoded `240″/60″`. A total-duration sanity check (`(work+rest)×rounds ≤ 90 min`) guards the newly-reachable large values; it is unreachable from a seconds-only interval, so no existing behaviour changed (all 19 prior goldens unchanged).

**A written TOTAL overrides a written `×N` — in the single-line interval path too (fixed 2026-08-04, fixtures `cardio_written_total_beats_xN`, `single_line_interval_no_total`).** The coach's CARDIO cell reads `4 min work, 1 min rest x2 sets of all (40 min)` over 4 numbered stations. The board showed `4′/1′ ×2` — a **10-minute clock on a 40-minute block**. 40 ÷ (4+1) = **8** rounds; `x2 sets of ALL` × 4 stations = 8 as well, so both readings agree and the ×2 was simply wrong.

The rotation paths had implemented "written total beats written ×N" since 2026-07-13, but the **single-line interval block owned its own inline round-count math** and never consulted a total. Fix: `writtenTotalMin()` / `writtenTotalRounds()` / `stationCount()` / `rotationRounds()` are **hoisted to the top of `detectTimers`** (they were declared inside the `if (!chained)` rotation block) and the single-line block calls the **same** `writtenTotalMin()`. The whole point of the helper is that the several shapes the coach writes one workout in can't drift apart — **do not re-derive a total inline.**

- Priority in the single-line path: **written total ÷ (work+rest) → written `×N` → nothing.** Nothing written ⇒ no timer, never a guessed default.
- The **same** sanity guards (`workSec ≥ 5`, `restSec ≥ 1`, `2 ≤ rounds ≤ 30`, total ≤ 90 min) apply to whichever source supplies the count; a derived count outside them **falls back to the written ×N** instead of emitting garbage.
- `writtenTotalMin()` learned the **bare parenthetical `(40 min)`** (it previously required the literal word `total`). The closing `)` is **required immediately after the unit**, so the `4 min` / `1 min` of the work/rest pair itself can never be swallowed. Because the helper is shared, the rotation paths gained the same form — consistent with the already-documented "a written total still wins".
- ⚠️ **`writtenTotalMin()` scans the whole cell, and it must.** `parseAppsScriptData` **splits that very line** into `…rest x` | `2 sets of all (40 min)` (the `(?<=letter)(?=\d+\s+letter)` rule, ~4746), so neither the `×N` nor the total is reliably on the same line as the work/rest pair. That split is also why the wrong `×2` actually came from the *custom work/rest fallback* (~3007, whole-text scan) rather than from the single-line block, which had bailed for want of a `×N`. Reading the interval line alone would have fixed nothing.
- The no-total case is **byte-for-byte unchanged** (`4′/1′ ×2` from the fallback) and locked by `single_line_interval_no_total` + `forbidTimers`.

✅ **Sibling gap CLOSED — the `on`/`off` wording obeys the same rule (2026-08-04, fixtures `on_off_written_total_beats_xN`, `on_off_no_total_unchanged`).** The custom work/rest fallback (~3007) used to read its `×N` inline without ever consulting `writtenTotalMin()`, so the identical workout written `4 min on 1 min off x2 sets of all (40 min)` still resolved to **×2** (a 10-minute clock on a 40-minute block) while the `work`/`rest` wording of the same cell resolved to ×8. **The coach writes one workout in several shapes; the shapes must not drift apart** — that is the whole reason `writtenTotalMin()` is hoisted to the top of `detectTimers`, and it is why the fallback now **calls the shared helper instead of re-deriving a total inline.**

- **The rule, uniform across these three work/rest paths (rotation / single-line interval / on-off fallback):** priority is **written total ÷ (work+rest) → written `×N` → nothing.** A written total is the one number that cannot be mis-derived, so it beats every `×N` form. ⚠️ **"All three" was an undercount** — `mmssXmRe` is a fourth consumer of the same rule and went unwired until 2026-08-20; see the `(N Rounds)` section below. When claiming a rule is uniform, enumerate the callers by grepping the helper, not from memory of the paths you just touched.
- In this path "written `×N`" means the whole existing chain — explicit `×N`/`N rounds` → same-line `N sets of` → exercise-line heuristic → 5 — and that chain is **untouched**. The total override is applied *after* it, so with no total (or an insane one) every existing form resolves **byte-for-byte** as before: `4′/1′ ×2` stays ×2, the coach's real Metcon `4 min on 1 min off x 4` stays ×4 (1200 s), `30 sec on 10 sec off x 8` stays 30″/10″ ×8.
- The **same sanity window** as the single-line path guards the derived count (`work ≥ 5″`, `rest ≥ 1″`, `2 ≤ rounds ≤ 30`, `(work+rest)×rounds ≤ 90 min`). A derived count outside it is discarded and the written `×N` stands — never garbage, and **never an invented value**: no total written ⇒ the derived count is 0 ⇒ it contributes nothing.
- Verified on the resolved config, not on a green suite: `240″ work / 60″ rest × 8 = 2400 s`. `forbidTimers: ["4′/1′ ×2"]` on the positive fixture and `forbidTimers: ["4′/1′ ×8"]` on the negative one lock both directions — the second is what proves the change cannot invent a total where none is written (its golden was captured **before** the code change and still passes after).

⚠️ **Bare `m`/`s` aliases are deliberately NOT accepted here**, though the timeline pattern accepts them. That pattern is anchored by the literal words `work`/`rest`; with `on`/`off` a line like `400 m on the rower` would false-positive.

**The bare `tabata` keyword is now a LAST resort, not a pre-emption (fixed 2026-08-03, same fixture).** The same sheet's warm-up cell reads `warm up tabata` + `3 sets of 30 seconds on 10 seconds off pause squat`. The keyword used to fire **first** with the classic 20/10 ×8, after which the custom-interval block was skipped by its own `!results.some(r => r.type === 'tabata')` guard — so a **guessed** 20/10 ×8 replaced her **written** 30/10 ×3. A live violation of the no-invented-timer-values rule, and the clock on the gym TV was simply wrong.

The keyword push now sits **after** the custom block and fires only when nothing else produced a work/rest clock (custom interval, single-line interval, or a chained timeline) — i.e. only when she named the format but wrote no durations. When she *did* write values the keyword merely **names** them: `Tabata 30″/10″ ×3`. `forbidTimers: ["Tabata"]` in the fixture locks the bare default out.

**Round count from `N sets OF <spec>` — same line only.** To get that ×3, a written count is read from `^\s*(\d+)\s*sets?\s+of\b` **on the line carrying the work/rest spec itself**. Deliberately narrow: a bare `N sets` on its **own** line above a station list stays ROTATION semantics (sets × stations — see the `EVERY`/`E2MOM` section and `feedback_rotation_interval_equals_station`), so `superset_group_cohesion` still resolves `warm up : 2 sets` + `30 sec work, 10 rest` + 3 stations to **×3 from the station count**, not ×2. Precedence: explicit `×N` / `N rounds` → same-line `N sets of` → exercise-line heuristic → 5.

### Rotation blocks — `E2MOM` and `every X:XX` (rewritten 2026-07-13)
**ONE INTERVAL = ONE STATION.** The block cycles through the `1#/2#/3#` stations for the written number of sets. This is the rule the parser kept getting wrong, in both of its rotation paths, and each time it put a wrong clock on the gym TV:
- `e2momx / 3 sets (18 min total) / 1# 2# 3#` → **9** intervals of 2:00, not 3.
- `EVERY 2:30 / 1#..4# / 3 sets - 30 min total` → **12** intervals of 2:30, not 3. (The old `every` path read `N sets` straight off as the interval count and otherwise fell back to a hard-coded 5 — it displayed `Every 2:30 ×3`, a 7:30 clock, on a 30-minute WOD.)

Both paths now go through **one shared helper**, `rotationRounds(iv)` / `writtenTotalMin()` — the two ways the coach writes the same thing must not drift apart. Interval count, from written values only: written total (`(30 min total)`, `total: 30 min`) ÷ interval → `N sets` × stations → `N sets` → exercise-line count → **0 = no timer**. Labels carry the total: `Every 2:30 ×12 (30′)`.

**The rule does NOT extend to an explicit `×N` — and that asymmetry is deliberate (settled with the coach, 2026-07-14).** How she writes it *is* the distinction:

| Written | Means | Example |
|---|---|---|
| `×N` **in the header itself** | N intervals, **literally**. Not multiplied by the stations — each interval covers the whole rotation. | `EVEY 2:00 X3` + `1#`/`2#` → `Every 2:00 ×3` = **6 min** |
| `N sets` **on its own line** | N sets **of** the rotation → × the stations. | `EVERY 2:30` + `1#`..`4#` + `3 sets` → `×12` = **30 min** |

A written total (`(30 min total)`) still overrides both.

**Bare `e` — "every", abbreviated (widened 2026-08-13, fixture `emom_bare_e_shorthand`).** She wrote `e 1:30 x 7` above a snatch complex and the block got **no clock**: the shorthand regex demanded the literal `mom` (`e 1:30 mom x 8`), and `mmssXmRe` could not take it either because that path requires a trailing `sets`/`rounds` to keep `5:00 x 3 burpees` out. One absent token, the whole 10:30 lost — the same silent-total-loss shape as the `EVEY` typo, and again the display layer had painted the `1:30` with its red time badge, so the board *looked* like it understood. The `mom` is now optional: `e M:SS [mom] ×N` → `EMOM M:SS ×N`.

> ⚠️ **The bare `e` deliberately does NOT join `EVERY_WORD`, even though it is the same word** — the one place the "single shared alias const" rule is knowingly not applied, so don't "fix" it. `EVERY_WORD` has a consumer *outside* detection: the layout layer's `isFormatHeader` (~5900) splices it into `\b(amrap|emom|…|EVERY_WORD|…)\b`, where an `e` alternative matches any stray letter (`e.g.`, a lone `e`) and would turn it into a block boundary — tearing a superset across columns. A bare `e` is only her *every* when a clock time **and** a round count follow it; that anchor is part of the token, which is exactly what the position-free `EVERY_WORD` cannot express. Horizontal-whitespace classes only, since `text` is `lines.join('\n')` and a `\s*` would let a line ending in `e` bind to a time on the next line.

**AMRAP `×N` (added 2026-07-16).** A trailing multiplier on an AMRAP header is a back-to-back rotation of AMRAP intervals — same literal-`×N` rule as above (N intervals, one per station, **not** × stations). Modeled as an EMOM-style timer (interval = the AMRAP length) so each station change beeps. Before this, the AMRAP regex captured only `AMRAP 10` and **silently dropped the `×3`**, putting a 10′ clock on a 30′ WOD.

| Written | Means | Timer |
|---|---|---|
| `every 10 amrap ×3` (or `amrapx3`) + `1#`/`2#`/`3#` | 3 × 10′ AMRAPs, one per station | `AMRAP ×3 · 10′ (30′)`, EMOM 10′ interval |
| `AMRAP 12` (no multiplier) | single AMRAP, unchanged | `AMRAP 12′` |

I unified the two paths first — making `×N` multiply by the stations as well — and it was **wrong**: it turned her 6-minute block into a 12-minute clock. The asymmetry looks like a bug and reads like a bug. It isn't. **Don't "fix" it again without asking her.**

**`EVERY` is matched through one shared fragment, `EVERY_WORD` = `ev(?:er|re|e|r)y`** — `EVERY · EVEY · EVRY · EVREY`. The coach typed **`EVEY`** (dropped `r`) and `\bevery\b` matched nothing, so the block produced **no timer at all** on the gym TV. Same failure shape as the dangling-`x` `e2momx` bug: a one-character slip silently costs the whole clock.

The middle group is **mandatory**, not `?`. Each spelling keeps exactly one of `er`/`re`/`e`/`r` between the `ev` and the `y`. Making it optional (`ev(?:er|re|r)?y`) matches `EVY`, which nobody types, while still missing `EVEY`, which is what the coach actually typed — the fix looks right, passes review, and changes nothing. The `evey_typo_explicit_rounds` golden is what caught it: the timer list came back `[]` on the first attempt. **Assert on the resolved timer, never on "the test went green".**

**Station markers come in BOTH orders — `1#` AND `#1` (added 2026-07-19).** The coach writes a rotation station either number-first (`1#`, `2#`, merged `2+3#`) or **hash-first** (`#1`, `#2`). Every station regex historically matched only the number-first order, so a `#1`/`#2` sheet got **no orange station badge**, wasn't a clean column-break point, and counted **0 stations** for rotation math. All five sites now accept both orders — keep them in sync (the 3-parallel-places rule applies here too):
- `stationCount()` — `/^\s*(?:#\s*(\d+)|(\d+(?:\s*[+\-,&]\s*\d+)*)\s*#)/`
- the orange highlight (`parseLine`, ~4650) — `/^(#\s*\d+|\d+(?:\s*[+\-,&]\s*\d+)*#)/`
- the clean-break `isStation` (~4785) — `/^\s*(?:#\s*\d+|\d+(?:\s*[+\-,&]\s*\d+)*\s*#)/`
- the two line-split regexes (~4366, ~6258) — `(?=[1-9]#|#[1-9])`

Guarded by the `hashfirst_stations_rounds` fixture + `#1`/`#2`/`1#`/`2+3#` BADGE_CHECKS (a station badge is a `rep-number` span containing `#` — that `#` is what distinguishes it from a plain leading rep count like `12 reps`).

**An explicit `(N Rounds)` is a written total that overrides the derived count (added 2026-07-19).** The coach's `Every 1:30 x 3 sets (6 Rounds)` over `#1`/`#2` put a `1:30 ×3` (4:30) clock on the TV — the header `×N` is the literal count, and `mmssXmRe` read the `3` straight off. But she *also* spelled out `(6 Rounds)` = 3 sets × 2 stations. A **parenthetical `(N Rounds)` or `N rounds total`** is now a written value (like `(N min total)`) that wins over both the header `×N` and the sets×stations math → `1:30 ×6` (9′). `writtenTotalRounds()` sits beside `writtenTotalMin()` and feeds `rotationRounds()` + the two literal paths (`mmssXmRe`, `everyExpRe`). **This does NOT touch the ×N/stations asymmetry** the `evey_typo_explicit_rounds` fixture locks — it's a new, more-explicit tier above it. Deliberately **parenthetical/`…total` only**: a bare `6 rounds` line stays "N sets OF the rotation" (× stations), so the two concepts don't collide. Guarded by `hashfirst_stations_rounds`.

⚠️ **…and `writtenTotalMin()` was NOT wired here, for another thirteen months (fixed 2026-08-20, fixture `xsets_written_total_beats_xN`, sw v141).** Read the sentence above closely: `writtenTotalRounds()` fed `mmssXmRe`, so `(6 Rounds)` won there — but the *minutes* helper sitting one line beside it did not, so `every 2:30 x 4 sets (30 min total)` resolved to `2:30 ×4`, **a ten-minute clock on a thirty-minute block**. The two tiers were one line apart in the same expression and only one of them was complete.

The reason it hid is **matcher order, not the regex**. `mmssXmRe` runs *before* both `every` matchers and calls `consume()` on the span, so the moment the coach writes the `x`, `everyExpRe` — which has honoured a written total since the day it was written — never sees the line at all. `mmssXmRe` is therefore a **fourth** consumer of the written-total rule, and the "uniform across all three paths" claim above (rotation / single-line interval / on-off fallback) never counted it. Priority here now mirrors `everyExpRe` exactly: **written total ÷ interval → `(N Rounds)` → header `×N`**, with the path's existing `2 ≤ rounds ≤ 20` window unchanged.

> **A shared helper prevents drift only in the paths that call it.** Hoisting a rule into one function (2026-08-04) is half the job; the other half is checking that every path reaching the same decision consults it. Three separate incidents — the single-line interval, the on/off fallback, and now `mmssXmRe` — are the same omission, and each was found only when a coach's real cell hit it.

🔴 **And `mmssXmRe` was not the last one.** Acting on the grep-don't-remember rule immediately after writing it turned up **three more emit sites that never consult `writtenTotalMin()`**, all confirmed by measurement (same cell with and without a written total → byte-identical output):

| Path | Written | Clock | Should be |
|---|---|---|---|
| `amrapRe` (`AMRAP N ×M`, ~3154) | `AMRAP 10 x3 (20 min total)` | `AMRAP ×3 · 10′` = **30′** | 20′ |
| `emomShortRe` (`e M:SS ×N`, ~3269) | `e 1:30 x 7 (15 min total)` | `EMOM 1:30 ×7` = **10.5′** | 15′ |
| `minXmRe` (`N min x M`, ~3284) | `4 Min x2 (12 min total)` | `4′ ×2` = **8′** | 12′ |

`minXmRe` is the sharpest of the three: **its own comment gives `"4 Min x2 (8 total)"` as the worked example** — a written total the code has never read. It went unnoticed because in that example the arithmetic coincides (4 × 2 = 8), so the wrong path and the right one print the same number. `emomShortRe` is newer than the rule itself (shipped 2026-08-13, sw v140) and was written without it.

These are **documented, not fixed** — Noam's call on 2026-08-20 was the one confirmed defect only, and each of these changes a live clock and needs its own fixture + counterfactual. Tracked in TIMER_ROADMAP §5.

**This deliberately does not decide what `x N sets` MEANS with no total written.** That still resolves to the literal `×N`, byte-for-byte — the live cell `every 2:30 x 4 sets (10 min each)` over three stations still yields `2:30 ×4` (10′), even though her own note in the cell reads *"נשארים בכל תחנה ארבע סטים ואז עוברים"*. Whether that should be 30′ is a **semantics question for the coach** (TIMER_ROADMAP §1 / §2e), not a code-consistency one — the `evey_typo_explicit_rounds` asymmetry stands until she answers. Note also that **`(10 min each)` has no pattern anywhere in the parser** — "each" is unparseable — so the board currently cannot express "N minutes per station" at all.

Fixtures: `e2mom_rotation`, `every_rotation_stations`, `evey_typo_explicit_rounds`, `hashfirst_stations_rounds`, `xsets_written_total_beats_xN`.

- The coach writes a **dangling `x`** (`e2momx`). That trailing letter kills the `\b` in `\bE\d*MOM\b`, so before this fix the line matched *nothing*: no timer, no time-badge, not a format header. All four sites now accept an optional `[x×]` tail (`E\d*MOM[x×]?`) — `extractTimerConfigs`, `parseLine.isInstruction`, the two time-badge replacements, and `isFormatHeader` (see the 3-parallel-places rule).
- The 3-parallel-places rule keeps getting **half-applied**. `tbata` was in `isInstruction` and the time-badge list but **not** in `isFormatHeader`, so a `TBATA` line got a timer and a badge yet could still be torn from its own exercises across a column break. Fixed 2026-07-14 alongside `EVERY_WORD`, which is now threaded through every site from one source fragment rather than copied. **When adding a keyword alias, grep the bare keyword repo-wide and fix every hit — a partially-recognised format is worse than an unrecognised one, because it looks like it worked.**
- The **total is never guessed** (no-invented-timer-values). Resolution order, all from written values: explicit `×N` → same-line total minutes (`E2MOM 18`) → an explicit total anywhere in the block (`(18 min total)` / `(6 Rounds)`) → `N sets` × the number of `1#/2#/3#` stations. Nothing written → **no timer** (the old code fell back to a 10-min default).
- Every optional tail in `eXmomRe` owns its own leading `[^\S\r\n]*`. A shared one right after `MOM` swallows the space and then silently skips the total-minutes group — an optional group never forces a backtrack. That bug ate `E2MOM 18`; `e2mom_rotation` + the existing goldens guard it.
- Horizontal-whitespace classes keep every part on the header's own line, so `E2MOM\n3 sets` can't read the `3` as minutes.

### On-board timer setup + control — TV remote (added 2026-06-15)
The board itself can configure/start/stop the timer via the TV remote (previously only `coach.html` could). All client-side, **local start only** (no backend POST).
- **Setup overlay** `#timerSetupOverlay` — the **always-available manual timer**, and the escape hatch for any block the parser doesn't recognise (it seeds AMRAP 12:00 when nothing is detected). Three ways in: **`⏱＋ טיימר`** (`#tvTimerSetupBtn`, orange, in the TV nav bar) · **`⏱＋ הגדר טיימר ידנית`** (top of the Settings modal) · key `g` / `↑` in timer mode. Until 2026-07-13 the nav button was a bare **⚙** — the same glyph as the main settings gear — so the coach never found it and reported that a timer *couldn't* be set. It always could. **Never label an action button with the same glyph as a different, better-known control.** `TimerSetup` object (items-based focus model). Edits all 5 types (amrap/fortime/emom/tabata/mix); MIX builds arbitrary work/rest sequences via add/remove "מקטע" rows. Remote-operable with arrows+OK; digits type MM:SS (shift-in); a focusable `▶ התחל` row starts and a `✖ יציאה` row exits. **Every row is also pointer-clickable** (`clickItem`) so the form works the same with a D-pad remote or a pointer — not keyboard-only.
- **Switching timer type** (`TimerSetup.type`): with the remote, focus the top **"סוג"** row and press **Left/Right** (`nudge()` cycles `TSU_TYPES = amrap → fortime → emom → tabata → mix`, reseeding that type's defaults). For pointer/touch — where there's no Left/Right — the סוג row shows explicit **`‹` `›` arrow buttons** (`.tsu-step-type`, amber, larger glyph) that call `cycleType(±1)` (which just focuses row 0 and reuses `nudge`). Clicking the סוג row itself only focuses it (does **not** cycle) — the arrows are the switch. Added 2026-07-09 because clicking the type row on the TV did nothing visible. Exit: `✖ יציאה` row / `Esc` / remote Back (`Backspace` erases a digit mid-entry else exits, `BrowserBack`/`GoBack`). Every key is captured while open (guard at the top of the keydown listener: `if (TimerSetup.open) {...return;}`).
- **Key diagnostic (hidden, debug the remote)**: `KeyDiag` silently logs every keydown (key/code/keyCode) to a rolling buffer + `localStorage['wodboard-keylog']`, even with nothing open (capture-phase, never intercepts). Hidden viewer (bottom-left) toggled by `Ctrl+Shift+K` or the "🔑 אבחון מקשים" Settings checkbox (`settings.keyDiag`). `KeyDiag.dump()` returns readable text. Use it to map which codes a specific TV remote emits before assigning keys.
- **Seed priority** (`openFromDetected`): (1) the **live floating-bar clock** if one is docked (so edits are a quick correction of the deployed clock), (2) the part's auto-detected timer (`getSelectedPartTimer`), (3) amrap defaults.
- **Start docks, doesn't take over the screen**: `TimerSetup.start()` shows the floating bar over the board (does NOT force full timer mode). The existing coach-driven `processTimerCommand('start')` path is unchanged (still goes full-screen).
- **Stop = one red `⏹ עצור` button** on the floating bar (`#ftbStopBtn`); while a timer runs, `OK/Enter` / `g` / `Backspace` all stop too (`stopActiveTimer()`). No pause menu (Space still pauses as a low-key shortcut).
- **Segment-transition cues are simple sine beeps** (`tabataWork` = `beep(900,0.15,×2)`, `tabataRest` = `beep(500,0.3,×1)`). These were briefly a loud ascending/descending **sawtooth fanfare**, but the coach disliked the rising "whoosh" — reverted 2026-07-09 to the original non-rising beeps (Noam: "bring back the previous sound"). The Harry `say('work')`/`say('rest')` voice still plays alongside. The 3-2-1 countdown ticks were left unchanged.
- **`intervalBeep` (round/interval change) = `beep(1046, 0.5, ×2, gap .05, 'square', vol 0.9)`** — two firm SQUARE-wave hits (2026-07-25, coach: "sharper + stronger"; was one soft 880Hz sine, was two weak blips before that). Square = rich harmonics that cut through gym music; still deliberately NON-RISING. `beep()` takes an optional `vol` (sustain, default **0.28**); peak = 1.4×sustain, clamped to 0.92. **To make a cue carry further, raise `vol`/`duration` — never the pitch across the tone.**
- **Spoken announcements — "the clock should talk more" (2026-07-27).** `EMOM/intervals` was the poorest set (only the interval beep + `last_round`). Now it **voices the round every interval** (`round_two`…`round_fifteen`, delayed ~1.2s after the beep) + `last_round` on the final + `halfway` (halfway was amrap/fortime-only before). See `feedback_timer_audio.md` for the full per-type policy. **Round-call voice files now cover 2–15** (25 MP3s in `sounds/voice/`, up from 18/round≤8) — regenerate/extend via `generate_timer_voices.js` (idempotent: skips existing unless `--force`; needs `node --use-system-ca`), then add the key to the preload list (~2261) AND both `roundKeys` arrays.

### Per-part timer detection (added 2026-05-21)
`extractTimerConfigs` is a **part-aware wrapper** around the core `detectTimers`. When a cell holds a multi-part workout (≥2 `part 1:` / `part 2:` / `part 3:` lines), each part is scanned independently and yields **its own timer button** — a series of timers.

`detectActivityInterval` recognizes the coach's interval style: a work line written as `<duration> <activity>` (`3 min run`, `45 sec sprint`) instead of the literal word "work", paired with a `<duration> rest` line and a separate `×N` / `N sets` multiplier. A time unit is **required** on the work line so a bare rep line (`20 ring row`) is never read as a duration.

`part N` recognition is one shared literal — `PART_HEADER_RE` — reused by the line parser, the warm-up reset, the column-break logic, and the timer splitter (keep them in sync — see the 3-place-pattern note above).

**Timer detection surfaces only explicitly-written values.** Work, rest, and round counts must all be parsed from the coach's text; a block missing a value (e.g. no `×N`) yields **no timer**, never a guessed default. Do not invent times or offer timing variants.

**The part header line carries the part's own timing — feed it to the detectors (fixed 2026-08-08, fixture `inline_part_header_timing`).** The coach writes each part's clock **inline on the `part N:` line itself**: `part 1: t.c 14` / `part 2: amrap 14`. The splitter built each segment as `lines.slice(start + 1, end)` — **the header line was excluded from its own segment** — so both written 14s were discarded before `detectTimers` ever ran. The gym TV showed a bare `For Time` + `P1 · 12 RFT`, and **part 2 had no clock at all** on a 14-minute AMRAP. `capSecondsFromLine('part 1: t.c 14')` returns 840 perfectly well; nothing ever asked it.

This is the no-invented-timer-values rule **in its mirror form**: as bad as inventing a value the coach didn't write is dropping one she did. The two halves are the same rule — *the clock is exactly what she wrote.*

- Fix: the remainder after the `part N:` prefix (`PART_HEADER_PREFIX_RE`) is **prepended to its own segment's lines**. The literal `part N` words are **stripped, not passed through**, so no regex can read the part NUMBER as minutes or rounds — `part 2: amrap 14` resolves to `AMRAP 14′`, never `AMRAP 2′`. `forbidTimers` locks that out.
- ⚠️ **The in-cell part-split path had NO fixture at all** — which is why this survived every prior timer session. `multipart_parts` uses part-named **columns** (a different path); `evey_typo_explicit_rounds` has a single `PART1:` line and takes the `partIdx.length < 2` whole-cell branch. A path with zero coverage looks exactly like a path that works.
- ✅ **Preamble suppression (added same day, on Noam's call; trigger widened 2026-08-10).** A preamble format line above the parts (`for time:` on line 1) is the umbrella header for those parts, not a block of its own. Its capless `For Time` is dropped when the preamble carries **no written value of its own** AND either the compound clock exists **or ≥2 numbered parts produced their own clocks**. (It was compound-clock-only until the staged-part suppression made a chainless multi-part cell reachable — see the ⛔ note in the compound-clock section.) A preamble with a real cap/total stays a legitimate separate clock, so a wrongly-dropped clock is still impossible.

**The COMPOUND clock — one start for the whole session (added 2026-08-08, same fixture).** The parts of one cell are usually one continuous workout: `t.c 14` → `2:00 rest` → `amrap 14` is a 30-minute session the coach had to start as three separate clocks. `detectTimers` can never see it — the part splitter hands it one part at a time, so **no segment ever holds two work phases plus the rest**, and the `tlWork.length >= 2 && tlRest.length >= 1` gate can never pass.

Fix: `extractTimerConfigs` runs the SAME chain check over the **whole cell** and offers the result **first**, with the per-part clocks kept behind it in the ⏱↻ cycle so a single part can still be run alone.

- **Vehicle: the existing chained-`tabata` engine, NOT `mix`.** `mix` has no `displayMs` branch in `getTimerDisplayData`, so its big clock is one 30:00 total countdown instead of a per-phase clock; it gets no `halfway`/`ten_seconds` voices; and its editor clamped a segment to 600 s. The chain path already has the switching per-phase clock, WORK/REST colour, `Round 1/2`, and the full voice suite. **The change was detection-only** — the layer the harness actually guards.
- **`chainFromTimeline(lines)` is the shared helper** (extracted from `detectTimers`, whose behaviour is byte-for-byte unchanged — `chained_amrap` is the canary). Copying the block instead would have been exactly the drift the shared-helper rule exists to prevent.
- **`buildWorkoutTimeline` now classifies a cap via `capSecondsFromLine`**, so BOTH written directions become work phases — `16 min tc` (number-first, the only one it used to accept) and `t.c 14` / `part 1: t.c 14` (TC-first). Without this the two parts could never chain.
- **Heterogeneous label.** Naming a chain after its first phase (`TC ×2 · 14′ work / 2′ rest`) would hide that phase 2 is an AMRAP. When the work formats differ the label spells the sequence — `TC 14′ → AMRAP 14′ · 2′ rest`. When they match, the established `AMRAP ×3 · 10′ work / 2′ rest` wording stands byte-for-byte.
- **Partial values → no compound clock, per no-invented-values.** The chain needs two written work durations AND a written rest. No rest written → per-part buttons only (auto-advancing through an unwritten rest would invent a 0:00 phase). No cap on part 1 → part 1 is unbounded and the chain cannot know when to advance. ~~Non-uniform parts (14′ vs 12′) → the uniform-durations sanity rule already refuses; **don't "fix" that** — the tabata runtime's arithmetic is built on a fixed `work+rest` cycle.~~ **← SUPERSEDED 2026-08-11** (see *The part BUDGET reading* below): the runtime now walks an explicit `phases` schedule when one is present, so non-uniform chains are expressible. `chainFromTimeline`'s own uniformity rule is unchanged — it is the *fallback*, and the fixed-cycle warning still applies to anything built on `workSeconds`/`restSeconds`. Verified end-to-end on the resolved config of the day: `840 work / 120 rest / ×2 / skipLastRest` = **30:00**, phases `WORK 14:00 → REST 2:00 → WORK 14:00` (that total is itself superseded — it is **28:00** under the budget reading).

**⛔ A STAGED part gets NO compound clock — the schedule is not the running order (added 2026-08-10, coach-reported).** Two days after the compound clock shipped, the coach flagged it as wrong for the very cell it was built on, and the reason is inside part 2:

> ״ההוראות הם 1000 מטר ללא זמן ואז AMRAP ולכן עדיף שזה יהיה שני שעונים ולא שעון אחד רציף״

```
part 2: amrap 14
1000 m run          ← untimed
and then: amrap:    ← the declared AMRAP starts HERE
20 squat jump …
```

Part 2 is **internally staged**: the 1000 m run carries no clock, so the AMRAP the header declares does **not** begin when part 2 begins — the athletes decide that moment. The compound chain's whole premise is that *the written schedule IS the running order* (cap → rest → AMRAP, back to back, auto-advancing at fixed offsets). Here that premise is simply false, and the chain would start the AMRAP while people are still running. **Per-part clocks, each started by hand, are the correct answer for this shape.**

- **THE PREDICATE (`STAGE_MARKER_RE`), stated exactly:** a written **sequence-transition marker** — `and then` · `then:` · `after that` · `ואז` · `לאחר מכן` — on any line inside a **numbered** part's own body (the preamble segment is excluded; it introduces the parts, it isn't one). Nothing is inferred: the marker is the coach's own word for *"and only after that"*. One marker anywhere in one part suppresses the whole-cell chain.
- **A bare leading `then` is deliberately excluded.** She writes `Then Max Handstand Hold in the remaining time` *inside* an interval (the `hashfirst_stations_rounds` sheet), where it sequences reps, not clocks.
- **The wider predicate was considered and rejected:** "an untimed work line sitting between the part header and the format line" requires guessing which lines are work and which are notes, *and* it fires on `part 1: t.c 14 / 12 rft:` — where a cap and its rep scheme describe **one** block, not two stages — which would kill the continuous case this narrowing must leave alone. Narrowest predicate that suppresses the staged cell and leaves the continuous one byte-for-byte.
- ⚠️ **This is a narrowing, NOT a revert and NOT a blanket disable.** `continuous_parts_compound_chain` — the same sheet with exactly the two staged lines removed — still produces `TC 14′ → AMRAP 14′ · 2′ rest`. The pair is a strict A/B: the only textual difference between the two fixtures is those two lines, which is what proves the suppression keys on the staging and not on the part count, the preamble, or the `t.c`/`amrap` pairing.
- **The per-part clocks are the thing being protected — losing a clock is worse than a wrong one.** `P1 · 12 RFT (TC 14′)` and `P2 · AMRAP 14′` are untouched and still ⏱↻-cyclable; `expectTimers` names both so no future `--update` can quietly drop one.
- ✅ **The `2:00 rest` becomes a deliberate non-detection, and that is the honest outcome.** Un-chained, nothing auto-advances through it, so no config carries a 120 s phase and the unexplained-facts assertion fires — correctly. It is silenced with `ignoreFacts: ["2:00"]` **in the staged fixture only**; the continuous sibling consumes the same `2:00` through the chain's `restSeconds` and needs no escape hatch. Emitting a standalone 2′ rest clock to quiet the assertion would be an invented control surface.
- **Branch coverage forced the control fixture into existence.** Suppressing the staged cell dropped `compound-chain` to **zero** hits, which the coverage assertion fails on — correctly, because *a suppression with no surviving positive case is indistinguishable from a revert*. The suppression itself is its own branch id (`staged-part`), so it can never go dark either.

**↳ Preamble suppression had to widen with it (same day).** The capless `For Time` preamble was dropped **only when the compound clock exists**. Kill the chain and that useless value-less clock returns as the ⏱↻ *default* — the exact annoyance the suppression was added to remove. Trigger is now **"the compound clock exists **OR** ≥2 numbered parts produced their own clocks"** (Noam's call). Everything else about it is unchanged: still only for a preamble with **no written value of its own** (no cap, no total), so a preamble carrying real timing remains a legitimate separate clock and a wrongly-dropped clock is still impossible. **Verified counterfactually, not assumed** — `detectTimers(['for time:'])` really does return `{fortime, capSeconds: 0, label: 'For Time'}`, so without the widening it would be back at the head of the cycle. Locked by `forbidTimers: ["For Time"]` on both fixtures.

**⭐ The part BUDGET reading — a written part duration is its TOTAL (2026-08-11, Noam).** Third reading of the same cell in four days, and the first that nothing contradicts. The three readings, in order:

| Date | Reading | Session |
|---|---|---|
| 08-08 | additive — `t.c 14` + `2:00` + `amrap 14` back to back | 30′, one chain |
| 08-10 | staged — part 2's AMRAP starts when the athletes decide | no chain, 2 hand-started clocks |
| **08-11** | **budget — each part header states that part's TOTAL length** | **28′, one chain: 12′ → 2′ → 14′** |

Part 1's written 14 **contains** the `2:00 rest` written inside it → 12′ work + 2′ rest. Part 2's written 14 covers the 1000 m run **and** the AMRAP that follows → the AMRAP is simply what is left of the 14 once the run is done.

- **It RESOLVES the coach's 08-10 objection instead of reverting it.** Her complaint was that a chain would start the AMRAP while people were still running. Under this reading the AMRAP is not a phase at all, so nothing auto-starts mid-part. Her ״1000 מטר ללא זמן״ means the run has no cap *of its own*, not that it sits outside the clock. ⚠️ The *reason* she gave still differs from this reading — worth confirming with her directly.
- **The 12 is DERIVED (14 − 2), and that is allowed.** Both operands are written; this is the same family as the long-standing "written total ÷ (work+rest)". A part with **no** written duration gets no budget treatment at all (`partBudget` returns null) — nothing is invented.
- **Several rests inside one part are SUMMED into one trailing rest.** The part contributes a single work phase (its budget), so there is no way to know where a second rest would sit. One trailing rest is the only coherent reading.
- **Applies to the per-part clock too** (Noam's call): running part 1 alone is `TC 12′ · 12 RFT`, not 14′. Keyed **exactly** — only the config whose duration *equals* the part's written budget is adjusted, so a second clock in the same part is never touched.

**The runtime needed an explicit schedule — `tabataPhaseAt` (same day).** 12′ → 2′ → 14′ cannot be expressed as `totalElapsed % (work + rest)`, which is why the compound clock could previously only chain parts of equal length. A config may now carry `phases: [{type,seconds,label}, …]`; `getTimerTotalMs` sums it and the runtime walks it cumulatively.

- ⚠️ **Three sites owned that cycle arithmetic independently** — the tick (phase sounds + per-phase voice cues), `getTimerDisplayData` (the switching clock) and `skipTimerPhase` (⏭ הבא). Adding `phases` to each separately is precisely the drift this file documents over and over, so all three now call **one resolver**. Without `phases` it returns the original modulo results byte-for-byte (locked by `chained_amrap` and re-verified on a live `600/120 ×3` config: phases 1/5…5/5, 34:00).
- Verified on the resolved config, not on a green suite: `WORK 12:00 → REST 2:00 → WORK 14:00`, total **28:00**, ⏭ הבא landing on 720 / 840 / 1680.
- **`mix` is still not the vehicle** — the reasons from 08-08 stand (no per-phase `displayMs`, no `halfway`/`ten_seconds` voices). The chain path keeps the switching clock, WORK/REST colour, round line and full voice suite.

**⛔→⚠️ The staged-part suppression NARROWED, not reverted.** It now fires only when a staged part's **own length is unwritten**. When the header carries the duration (`part 2: amrap 14`) that number bounds the whole part, run included, so the chain still knows exactly when the part starts and ends; what floats is only the internal run→AMRAP handoff, which the chain never modelled. `staged_unbounded_part_no_chain` is the surviving positive case and the **only** holder of the `staged-part` branch — and the suppression is genuinely load-bearing there, not incidentally null: without it `chainFromTimeline` finds a perfectly well-formed uniform `TC 14′ → AMRAP 14′ · 2′ rest`, which `forbidTimers` locks out.

**↳ `ignoreFacts: ["2:00"]` is GONE from the coach's cell, and its absence is the point.** The rest is a real phase again, so the unexplained-facts assertion passes on its own. Every written number in that cell now reaches a clock.

**↳ TIME-FIRST labels (same day, Noam).** `#tvTimerBtn` is a fixed 11rem box with an ellipsis (so ◄ ► never shift — 2026-07-09), and `12 RFT (TC 14′)` truncated on the gym TV to **`12 RFT (T…`** — hiding the one number that says how long the block runs and leaving a rep COUNT looking like the clock. It misread as a 12-minute cap. The cap now **leads**: `TC 14′ · 12 RFT`, `TC 35′ · For Time`. ⚠️ When a label format changes, **re-check every `forbidTimers` string that encodes it** — a forbid entry the code can no longer emit passes vacuously, so `cap_no_leak_two_work_blocks`'s leak guard would have gone dead while still reading like it guards.

**↳ The setup overlay had to learn `phases` (same day).** `seedFromConfig` copies only non-object fields, so a `phases` config kept the seeded **20″/10″ tabata defaults** — opening ⏱＋ over the docked 28-minute session and pressing ▶ started a 20″/10″ ×2 clock. Same failure class as the 300/600 clamp below: a wrong clock with no error. A `phases` config now seeds as **`mix`**, one segment per phase, every duration exact (verified round-trip: 720/120/840 = 1680). ⚠️ Known and **visible** trade-off: a manually re-started schedule shows one total countdown instead of the switching clock, because `mix` still has no per-phase `displayMs`. Durations correct, display downgraded — not a silent corruption.

**⏭ הבא — skip to the next phase (added 2026-08-08).** The compound clock advances on the WRITTEN schedule: the rest starts at the cap even when the whole class finished at 12:00 of a 14:00 cap. Every running-timer key STOPS (`OK`/`Enter`/`g`/`Backspace`), so without a skip the coach's only options were an idle room or losing the rest of the sequence — the compound clock would have been **worse** than three manual starts on exactly the day it matters.

- Pure arithmetic on the existing cycle math: `skipTimerPhase()` jumps `timerElapsed` to the current phase's end boundary. The phases and their lengths are still exactly what she wrote; only the moment of transition moves, and only when she asks.
- **Primary control is the amber `⏭ הבא` button** on the docked clock, beside `⏹ עצור` — pointer-and-remote reachable, the same parity rule the setup overlay follows. Key `n` is a secondary shortcut, deliberately **not** one of the remote's big buttons: a mis-press that skips a phase mid-WOD is nearly as bad as one that stops it.
- Shown only for phase-based types (`tabata`/`emom`); a single-phase AMRAP/For Time has nothing to advance to. Resets the per-phase one-shot flags, or the new phase inherits "already announced" and runs silent. Skipping the last phase lands on the total, so the tick finishes normally (finish sound + "time") instead of inventing a state.

**⚠️ A clamp tighter than its own field's max silently rewrites the coach's number (fixed 2026-08-08).** `TimerSetup.buildConfig` clamped `tabata` work/rest to **300 s** and `mix` segments to **600 s**. Seeding the overlay from a live clock and pressing ▶ therefore **crushed a chained AMRAP 10 (600 s) to 5:00** — `seedFromConfig` copies the real value in, `buildConfig` cut it on start, no error anywhere. Today's compound clock (840 s) made it a live path. Both ceilings are now **5999** (99:59), matching the amrap/emom fields, in `tsuFieldsFor` **and** `buildConfig` — **keep the two in sync; a ceiling below what detection legitimately produces is a wrong clock with no error.**

**Three-column multi-block sheet (added 2026-07-26, fixture `three_column_block_timers`).** The coach's "Strength: 8 min leg and lat activation | 16 min tc + front squat | B Accsesories: E2MOM X 9" sheet surfaced only the E2MOM; she wants each time-defined block as its own ⏱↻-cyclable timer (8′ → TC 16′ → E2MOM 18′). Two additions:
- **Leading standalone block duration** — a block whose **leading content line** leads with `N min <activity>` (no AMRAP/EMOM/"work" keyword) is a count-up (amrap-style) N-minute timer. Requires the explicit `min` unit at line start, and excludes caps (`N min tc`), rest lines, and **pace** descriptors (`PACE_DESCRIPTOR` = `easy`/`recovery` — "20 min easy row" stays timer-less, locked by the `set_wave_lift` golden; same over-fire class as the `min_standalone` Pass-3 guard). A duration **range** ("40-60 sec Plank") deliberately yields no timer — picking an end would be an invented value.

  **Rewritten 2026-08-03 (fixture `minutes_on_off_intervals`, col 1).** It used to read the *literal* first line and to live inside the `!chained && results.length === 0` last-resort block. Both were positional accidents that cost the coach a clock: her warm-up cell reads `warm up tabata` / `warmup:` / `6 min leg mobility` / `3 sets of 30 sec on 10 sec off…`, so (a) the "first line" was a zone label and (b) the pause-squat interval had already filled `results`. Yet `8 min leg and lat activation` — the identical shape, merely written on line 1 of its own cell — always got its clock. Same intent, opposite outcome.
  - **Label-only lines are skipped** when locating the leading line: anything ending in `:` or starting with `warm up` — **provided it carries no timing of its own** (`!hasTiming`, added 2026-08-13; see the warm-up-header entry below).
  - **The rule now sits OUTSIDE the last-resort guard** (only `!chained` remains), because a stage may legitimately carry this clock *alongside* another — ⏱↻ now cycles `6′ leg mobility` → `Tabata 30″/10″ ×3` on that one stage.
  - ⚠️ **Its replacement anti-double-count is the load-bearing part.** A block duration is followed by *prose*; if the remainder reads like an interval **spec** — a format word, `on`/`off`/`work`/`rest`, a `×N`, or a **second duration** — another detector already owns that line. Without the second-duration test the Metcon line `4 min on 1 min off x 4` (which also leads with `N min`) produced a **ghost 4′ count-up** beside its correct `4′/1′ ×4`. Locked by `forbidTimers: ["4′ on 1 min off x 4"]`. The harness caught this; nothing else would have.

  **Widened 2026-08-10 — UNTIMED work may precede the block duration (fixture `untimed_lead_then_block_duration`).** The coach's warm-up read `warmup -` / `600 run x 1` / `7 min lat and quad mobilit for front squat` and produced **no clock**. The 7 min was not missed by the duration lexer — the board **painted it**, red time-badge and all, because `parseLine`'s `isInstruction` (~5343) owns the *same* `^\d+\s*(min|sec|rounds|sets)` pattern. The detector simply never looked at that line: the untimed `600 run x 1` had taken the "first content line" slot.

  > **Two layers own one pattern and disagree only about POSITION.** The display layer says "there is a time here" while the detection layer never examines the line. This is a distinct failure shape from the alias drifts above — nothing is misspelled, nothing is unrecognised, and the board *looks* like it understood. Whenever a new positional guard is added to one layer, ask what the other layer does with the same line.

  **Fixed 2026-08-13 — a header line may carry BOTH the label and the duration (fixture `warmup_header_carries_its_duration`).** The coach's part 1 opens with `8 min WARM UP :` and produced **no clock**. Two independent guards had to be crossed, and each is a lesson of its own:

  1. **`isLabelOnly` tested the two shapes independently.** The trailing `:` is a *proxy* for "this line has no content of its own" — the guard exists so the scan can walk past `warmup:` and reach `6 min leg mobility` beneath it. But "is a label" and "carries a duration" were never checked *together*, so a line that is **both** was skipped as if it were empty. A line that carries timing is now never label-only (`!hasTiming(l) && (…)`). Same family as the positional bug above: a guard written for one shape silently swallowing a different one.
  2. **`warm up`/`cool down` were in the pace-descriptor blacklist.** A block **name** is not a pace descriptor: `easy` modifies *how* the work is done, `WARM UP` says *which block this is*. They are out; `easy`/`recovery` stay, and `set_wave_lift`'s "20 min easy row" is still timer-less by them — the surviving positive case that makes this a narrowing rather than a deletion.

  > ⚠️ **THE PART WORTH REMEMBERING: the exclusion was also inside its own audit channel.** The same blacklist existed a second time — drifted (`warm[\s-]?up` vs `warm\s*up|warmup`) — inside `extractTimingFacts`, the shadow channel whose entire purpose is the unexplained-facts assertion, i.e. *proving* no written duration was dropped. It recorded `8 min WARM UP` as `ignored: "pace"`. So a fixture of this exact cell, written any time in the preceding months, **would have passed with an empty timer list**: the measurement carried the very exclusion it was meant to audit and could not contradict it. Verified, not assumed — with the fix reverted, the new fixture fails on `expectTimers` alone, and the property test stays silent.
  >
  > Generalised: **§"Making SILENCE measurable" only measures what the ignore-list does not already excuse.** Any entry added to `ignoreFacts`, or to a shared ignore const, is a hole in the property test by construction. Both sites now build from `PACE_DESCRIPTOR`, so rule and audit cannot disagree again — but the structural point stands for every future exclusion: *put the exclusion in one place, and give it a fixture that asserts the positive case.*

  - **The slot now goes to the first content line that CARRIES a duration**, provided every content line before it carries no timing at all. The original intent — "a leading duration NAMES the block; a mid-list `3 min bike` does not" — survives in its honest form, **"nothing timed came first"**: a block that opens with untimed work is still a block that this duration names.
  - Scanning **stops at the first timed line even when that line yields no config** (a rest line, an interval spec). Once timing has appeared, another detector owns the block and a count-up here would be a ghost.
  - ⚠️ **A second anti-double-count was forced by the widening, and the harness found it on the first run.** With untimed lines no longer consuming the slot, `5 sets` / `3 min run` / `1 min rest` reached this rule for the first time and emitted a ghost `3′ run` count-up **instead of** `detectActivityInterval`'s correct `3′/1′ ×5` (the `activity-fallback` branch dropped to **zero** hits) — strictly worse than the missing clock the widening set out to fix. Rule: **a standalone `rest` line carrying its own duration means this line is the WORK half of an interval**, not a block duration. Deliberately narrow — an on/off spec carrying its OWN durations (`3 sets of 30 sec on 10 sec off`) does not claim the line, so `leading_duration_behind_labels` keeps its 6′ clock. `activity_interval` is the negative control and is not decorative.
  - Same family as the **staged-part** narrowing shipped the same day (untimed work preceding timed work). There it removed a wrong clock; here it restores a missing one.

  **Widened 2026-08-21 — the duration may TRAIL the block name (fixture `warmup_trailing_x_duration`).** The coach's warm-up column read `WARM UP x 6 min` and produced **no clock**. This is the *same block, same coach, same column of the same sheet* as `warmup_header_carries_its_duration` (`8 min WARM UP :`), which works — the only difference is that she put the number **after** the name. The rule's anchor (`^(\d+)\s*min\s+…`) was chosen to keep `20 ring rows`, `rest 3 min` and numbered items `1. 10 Hip 90-90` out; **word order was never the thing it meant to test**, and it became a load-bearing accident.
  - The block duration now has **two accepted shapes sharing ONE set of guards** — leading (`8 min leg and lat activation`) and trailing behind an explicit multiplier (`WARM UP x 6 min`). Both *name* the block and carry its length; only word order differs, and word order is hers to choose. A second shape must never arrive with a second, weaker set of guards, so `actIsIntervalSpec`, the rest-pair test, and the cap/pace exclusions are shared verbatim.
  - The trailing form is deliberately **narrower**: the `x` is **required** and must be preceded by whitespace, and the activity must end in a **non-digit**. Drop the `x` and `A. Deadlift Prog-8 min` claims a clock — that 8 is how long she expects a progression to *take* (`station_labels_with_keywords`, `ignoreFacts`). Drop the non-digit and the sets×duration spec `3 x 6 min`, a line the interval detectors own, claims one too. Verified counterfactually against the built page, not assumed: `A. Deadlift Prog-8 min` → `[]`, `3 x 6 min` → `[]`, `4 sets x 6 min` → `[]`, `20 min easy row` → `[]`, `Row x 6 min` → `6′ Row`.

  > **The recurring shape: a guard's ANCHOR outliving its reason.** Three of the last four misses in this rule were anchors — first line (positional), trailing `:` (label proxy), now line-start (word order) — each written to exclude something real, each later excluding a legitimate case it was never aimed at. When adding a positional anchor here, write down *what it excludes*; the next coach shape that breaks is the one the anchor catches by accident.
  > **Note (cosmetic, unfixed):** the display layer disagrees in the opposite direction now. `parseLine`'s `isInstruction` still owns only `^\d+\s*(min|…)`, so `WARM UP x 6 min` gets its clock but **no red time-badge**. Harmless — the reverse of the 2026-08-10 case, where the board painted a time nothing detected.
- **Header time-cap** — the coach sometimes writes the cap as the column HEADER itself ("16 min tc"), which `extractTimerConfigs(cell.lines)` never saw. `extractTimerConfigs(lines, header)` now takes the cell header and scans it for the cap only (never AMRAP/EMOM/etc.), with the **same two cap regexes** `detectTimers` uses on content lines (keep the three sites in sync). A header cap is **always** offered as its own fortime config — even when the cell has other timers — deduped against a fortime already carrying the same `capSeconds`. Both callers pass the header: `renderWorkout` (~4880) and the harness. Content-line caps keep their existing `results.length === 0` guard.

**Part-level cross-cell time cap + no-invented `×N` for a bare "every X:XX" (added 2026-07-27, fixtures `fortime_pacing_cap_columns`, `cap_no_leak_two_work_blocks`, `cap_local_fortime_plus_amrap`).** The coach writes the `t.c N` of a workout unit at its **END** — sometimes in the same column as the work, sometimes in a **separate column** of the same part. Her "for time: | 3000 m run / every 4:00 / 5 burpee / 8 push up / 20 d.u | rx+ 4000 m run / t.c 35" sheet parsed as `Every 4:00 ×4 (16′)` — the ×4 was **invented** by the exercise-line fallback reading the for-time list (including the 3000 m run) as 4 stations — while the `TC 35′` sat disconnected in the other column. Three rules:
- **Canonical cap matcher** — the two cap regexes now live ONCE in `capSecondsFromLine(line)`; `detectTimers` (content lines), `extractTimerConfigs` (cell header) and `partCapHints` (whole part) all call it, so the 3-parallel-places rule is enforced by construction.
- **Per-cell cap hints — a cap binds to its OWN block, never leaks (refined SAME DAY 2026-07-27 after a coach flag).** The first version threaded one part-wide cap into **every** cell (`scanPartCapSeconds` → all cells), so "Strength: front squat / 10 min tc / 4 sets…" next to a separate "B Accessories: for time" leaked → Accessories wrongly read `For Time (TC 10′)`. Replaced by **`partCapHints(row.cells)`**, which returns a **PER-CELL array** (indexed by `row.cells`): a cap propagates to a *sibling* cell ONLY when BOTH hold — (1) the cap sits alone in a **pure-notes cell** (after dropping the cap line and annotation lines — `rx`/`rx+` scaling markers, `*`-prefixed notes, `goal`/`מטרה` lines — nothing substantive remains → an "orphan cap"), and (2) **exactly one** capless work block (`for time` keyword or a bare `every X:XX`) is in the part to receive it. Otherwise the cap stays **local to its own block** (via that cell's own written cap). The result is threaded per cell: `renderWorkout` uses `capHints[row.cells.indexOf(cell)]`, the harness uses `capHints[i]` (goldens match production). Guarded by `forbidTimers` in the two new fixtures.
- **Effective cap** — inside `detectTimers`, `effCapSeconds = local cap || part cap`. It applies where a cap is meaningful: the For Time config/label (`For Time (TC 35′)` even when the `t.c` is in another cell) and the bare-every pacing path below. It must **NOT** clone a standalone `TC N′` timer into every capless sibling cell — that push stays local-cap-only.
- **Bare `every X:XX` never counts exercise lines** — `rotationRounds(iv, writtenOnly=true)`: with no written count, no `(N Rounds)`/total, no `N sets` and **no `1#`/`#1` stations**, the line-count fallback is OFF (it mis-reads an all-exercises-per-interval EMOM or a for-time list as a station rotation). Nothing written + a part cap → the "every" is **pacing under the cap**: one `emom` config with `totalSeconds = cap` and the written interval kept for the beeps (`Every 4:00 (TC 35′)`, final partial interval expected). Nothing written + no cap → **no timer**. Anything WRITTEN resolves exactly as before — the header-`×N`-vs-`N sets`×stations asymmetry (`evey_typo_explicit_rounds` / `hashfirst_stations_rounds`) and the E#MOM line fallback are untouched.

**Inline Rx/Rx+ scaling badge (added 2026-07-27).** `rx+ 4000 m run` rendered as plain text — only the colon/paren whole-line forms (`rx: 22.5/15`) had the 💊 badge. `parseLine` now wraps a **standalone** `rx`/`rx+` word in a blue `.rx-badge` span: `\brx\b\+?` (both `\b`s around `rx`, the `+` tacked on outside), so `prx`/`rxy` can never match mid-word. Highlight-only — no timer/layout logic reads the marker — so the 3-parallel-places rule doesn't apply. Guarded by the `rx`-expectation rows in BADGE_CHECKS.

### ⭐ A station's clock is NESTED inside the block's — ORDER is part of the contract (added 2026-08-21)
`blockClocksFirst`, fixture `station_amrap_nested_in_rotation`. The coach's CARDIO cell reads `every 2:30 x4 sets (10 min each)` over three stations, one of which is `2# amrap 2`. Both clocks were detected, both correctly labelled, both correctly timed — **and the board still gave the wrong instruction**, because the AMRAP came first: ⏱↻ opened on `AMRAP 2′ (1/2)` and the docked bar offered the nested station clock as the block's default. The 2:30 is what starts; the AMRAP begins only when the athletes reach station 2.

- **Cause: source order, nothing else.** The AMRAP scan is written *above* the rotation scan inside `detectTimers`, so a clock declared on a station line always outran the block's. Index 0 of the config array is the board's default clock, which made a scan-order accident into a coaching instruction.
- **Rule:** a clock declared on a **station line** (`STATION_LINE_RE` — `1#`, `#2`, built from the shared station bodies) is *nested inside* the block that cycles those stations, so the **block-scoped clock leads the cycle**. Implemented as a **stable partition** at `detectTimers`' single exit, which is also where the internal `_stationScoped` marker is stripped so it can never reach a caller or a golden.
- **A REORDER, never a drop** — losing a clock is worse than a wrong one (the standing rule); the AMRAP is still one ⏱↻ press away. The partition is a **no-op unless the cell holds both kinds**, so a cell of purely station clocks keeps its written order. Same family as the preamble suppression above: *what leads the cycle is a semantic decision and must not be a scan-order accident.*

> ⚠️ **This bug is invisible to presence assertions BY CONSTRUCTION**, which is why `expectTimerOrder` had to be added to the harness. `expectTimers` passed on the broken code and `forbidTimers` had nothing to forbid — every label was right. Order lived only in the golden, where `--update` would have baked the wrong order in without a word. **When a contract has a privileged position (index 0 = the default clock), assert the position, not just the membership.**

**⏱↻ timer SELECTION is PER-STAGE (`getPartTimerConfigs`, rewritten 2026-07-27).** Each stage (part-block/column) carries an array of timer configs in `data-timer-configs`; a stage can hold MULTIPLE clocks (e.g. two AMRAPs, or EMOM+AMRAP — verified: they're all detected, attached, and cycled). Selection scopes by **`partFocusIndex`** (the authoritative stage index, set by `navigatePart`, which resets `partTimerCycleIdx=0`): a focused stage returns ONLY its own configs → navigating to a stage in center-focus **auto-shows its clock with no manual cycling**, and a multi-clock stage cycles just its own. `partFocusIndex === null` (all-parts) aggregates every stage's timers, deduped, and does NOT skip `display:none` part-blocks (in the spread/merged layout a part-block can be display:none while its column's content is fully visible). **Scope keys on `partFocusIndex`, NEVER on `centerFocus`/overlay `.open`** — those linger stuck (proven via the gym-TV console; keying on them silently hid a clock). Known gaps left as-is (coach's call): a clock in the single column-HEADER position is only detected as a TC (not AMRAP/EMOM); bare durations ("1 min single leg") aren't clocks; a single-column workout makes no part-blocks (all-parts fallback still surfaces them).

### Switching clock display (phase-based, not total-based)
For `timerType === 'tabata'` (real Tabata AND chained AMRAPs), the big clock shows the **current phase's remaining time**, not a single long countdown. A chained `AMRAP 10 × 3 + 2:00 rest` displays 10:00 → 0:00 → 2:00 → 0:00 → 10:00... matching real CrossFit interval timers.

Set in `getTimerDisplayData()`:
```js
if (timerType === 'tabata' && timerState !== 'finished') {
  displayMs = tabataPhaseRemaining;  // ← phase time, not total
} else if (timerType === 'emom' && timerState !== 'finished') {
  displayMs = emomIntervalRemaining;  // ← same concept for EMOM
}
```

Additional fields returned for tabata: `tabataPhaseIndex`, `tabataTotalPhases` (= `skipLast ? rounds*2-1 : rounds*2`), `tabataWorkRound`, `tabataNextWorkRound`, `phaseProgress`, `overallRemainingMs`, `isChainedIntervals`.

Additional fields returned for EMOM: `emomIntervalRemaining`, `emomIntervalTotal`, `emomCurrentRound`, `emomTotalRoundsDisplay`. `phaseProgress` is computed from whichever type applies (tabata phase or emom interval).

Helper: `fmtMMSS(ms)` formats a duration as `mm:ss`.

**EMOM vs tabata visual differences:**
- EMOM uses a single orange tint `rgba(249,115,22,0.15)` — no WORK/REST split (intervals are continuous)
- EMOM has no big phase label above the clock (unlike tabata's `WORK`/`REST`)
- Progress bar is orange gradient `#f97316 → #ea580c` (vs green/red for tabata)
- Secondary line reads `INTERVAL N/M · TOTAL mm:ss` (vs `PHASE N/M · TOTAL mm:ss`)
- Floating bar: orange border/shadow + `R1/4 · tot 05:57`

### Display layout (fullscreen timer mode)
- Type badge: `INTERVALS` when `skipLastRest === true` (chained AMRAPs), otherwise `TABATA` or raw type
- Big phase label (6vw): `WORK` green `#22c55e` / `REST` red `#ef4444`, with text-shadow glow
- Main clock (22vw): phase-remaining time
- Round line (3vw): `Round 1/3` in WORK, `→ Round 2/3` in REST (what's coming up next)
- Subline (1.6vw): `PHASE N/5 · TOTAL 33:54` — gives the overall context without stealing focus
- Progress bar (10px): **per-phase**, green in WORK / red in REST
- Background tint (alpha 0.18): green WORK / red REST
- Paused overlay: `box-shadow: inset 0 0 0 2000px rgba(0,0,0,0.35)`; tint drops to alpha 0.08

### Floating timer bar (over WOD content)
Same logic adapted for compact horizontal bar. `borderColor` and `boxShadow` flip green/red by phase. Background uses a vertical gradient tinted by phase color (or solid dark `rgba(0,0,0,0.95)` when paused). Round line: `R1/3 · tot 33:54` or `→R2/3 · tot 23:54`.

### ⭐ A stage change turns the clock off — closed vs. open clocks (added 2026-08-11)

**The bug:** a finished clock (🏁 TIME!) survived ◄ ► in center-focus mode and had to be stopped by hand. `updateFloatingTimerBar` only auto-hides on `timerState === 'idle'` (`'finished'` renders the banner forever), and `navigatePart` never touched timer state at all.

**The rule (Noam's distinction — not a code-consistency choice):** a stage change turns off only a clock that *cannot end by itself*.

| Clock | On ◄ ► / WOD↔CARDIO / 🏠 | Why |
|---|---|---|
| `finished` | **cleared** | nothing left to measure |
| uncapped `For Time` (`capSeconds` 0) | **cleared** | counts UP forever; the coach moving on IS the end of that unit — *"מעבר חלק מבטא למעשה מעבר יחידה"* |
| AMRAP / EMOM / Tabata / MIX / **capped** For Time | **survives** | bounded — runs to a written end. The coach legitimately browses the next stage while one runs, and a stray ► on the remote must never cost a live WOD clock (the same fear that keeps `n`/skip off the remote's big buttons) |
| `idle` / `configured` | untouched | nothing docked over the board; `configured` only persists via the remote `configure` command, in full timer mode |

**`getTimerTotalMs()` already IS the closed/open test** — `>0` = bounded, `0` = uncapped For Time. Do **not** add a second classifier. The predicate is `navClearsTimer()`; the teardown is `navClearTimer()`, both just above `navigatePart`.

- **Keyed on timer state only.** Never on `centerFocus` / overlay `.open` — they linger stuck (same reason `getPartTimerConfigs` scopes by `partFocusIndex`).
- **`resetTimer() + hideFloatingTimerBar()`, never `coachStopTimer()`.** The "Time!" call-out belongs to a deliberate ⏹/Backspace stop; navigation is a view change and must be **silent**. Both calls are required and neither is sufficient: `resetTimer` alone strands a visible bar (the `idle → hide` path at ~7118 only runs when something *calls* `updateFloatingTimerBar`, and the RAF is already dead); `hideFloatingTimerBar` alone leaves state `'finished'`, where Space → `toggleTimerPause()` → `startTimer()` restarts a dead clock.
- **⊙ מרכוז is deliberately NOT in the list** — it zooms the current stage, it doesn't change it.
- **The 350ms timeout in `navigatePart`** re-asserts `overlay-mode` + `display:flex`. It is disarmed by the teardown removing `.timer-docked` (which its own precondition tests), plus a `timerState !== 'idle'` term. No cancel-token — that would add mutable state for nothing.
- ⚠️ **Countdown landmine, fixed here because this rule made it reachable:** `startTimer`'s `cdInterval` had no state guard. Resetting during the 10s lead-in left the closure alive; it decremented past 0, fell into the else branch and **resurrected `timerState='running'` with `timerType` null** — an invisible ghost clock that barks GO! and never finishes (`getTimerTotalMs()` → 0). Pre-existing on ⏹/Backspace-during-countdown; **measured** both ways (`test/timer-nav.mjs` reports `state:"running"` with the guard removed). The guard is the first line of the interval callback.
- Covered by **`node test/timer-nav.mjs`** — `verify-board.mjs` is parser-only and cannot see timer state or the docked DOM.

### Per-phase voice cues (chained timers only)
Flags `_tabataPhaseHalfwayDone` / `_tabataPhaseOneMinDone` / `_tabataPhaseTenSecDone` reset on every phase transition (not just timer start). Triggers only during WORK phase:
- `halfway` at 50% of a WORK phase ≥ 4 min (e.g. 5:00 into each AMRAP 10)
- `one_minute_remaining` at T-60 of a WORK phase ≥ 3 min (e.g. 9:00 into each AMRAP 10)
- `ten_seconds` at T-10 of a WORK phase ≥ 45s

**IMPORTANT:** The total-time-based mid-workout cue block (line ~2320) is gated with `timerType !== 'tabata'` to prevent double-firing. Final 5-4-3-2-1 tick beeps still run off total remaining (no voice, just beeps).

### Other audio cues (preserved from earlier)
- Phase transition: `tabataWork()` high beep + `say('work')` at WORK start, `tabataRest()` low beep + `say('rest')` at REST start
- Round announcements: `round_two`..`round_eight` spoken 0.6s after WORK start (to avoid overlap)
- 3-2-1 warning ticks (660Hz) before every phase transition
- **Start countdown + GO (`TimerAudio.countdown`)** — 3/2/1 ticks lengthened to 0.30s (660Hz) each; **GO** is the original bright 990Hz sine `beep`, lengthened 0.5s → **1.3s** so it carries across the gym (plus the Harry `say('go')` voice). (A sawtooth-fanfare `goSound()` was tried 2026-07-09 and reverted — Noam preferred the original tone, just longer.)
- EMOM interval warning ticks (added 2026-04-13)

### SW Cache Versioning
**Critical:** bump `CACHE_NAME` in `sw.js` on every code change (`sw.js` is the source of truth — currently **v139**; this number drifts, always read `sw.js`). **The SW is NETWORK-FIRST for the app shell** (navigations + `.html`/`.js`) since 2026-07-26 — a deploy shows up on the next normal F5, no cache-clearing needed. (It was cache-first, which served the STALE app for a load after every push and cost hours of "my fix isn't showing" debugging.) Static assets (images/MP3s) stay stale-while-revalidate. To break a client already stuck on the OLD cache-first SW, run once in its console: `navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(()=>caches.keys()).then(ks=>Promise.all(ks.map(k=>caches.delete(k)))).then(()=>location.reload())`.

**Status:** Chained interval display and per-phase voice cues implemented. **Apps Script must be redeployed** to coach's sheet for timer sync to work (console `_timerCb_` / `_scoreCb_` errors until deployed).
