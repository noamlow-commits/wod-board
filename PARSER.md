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

Fixtures: `e2mom_rotation`, `every_rotation_stations`, `evey_typo_explicit_rounds`, `hashfirst_stations_rounds`.

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

**Three-column multi-block sheet (added 2026-07-26, fixture `three_column_block_timers`).** The coach's "Strength: 8 min leg and lat activation | 16 min tc + front squat | B Accsesories: E2MOM X 9" sheet surfaced only the E2MOM; she wants each time-defined block as its own ⏱↻-cyclable timer (8′ → TC 16′ → E2MOM 18′). Two additions:
- **Leading standalone block duration** — a block whose **first content line** leads with `N min <activity>` (no AMRAP/EMOM/"work" keyword) is a count-up (amrap-style) N-minute timer. Fires only inside the last-resort `results.length === 0` fallback of `detectTimers` (so it can never double-count), requires the explicit `min` unit at line start, and excludes caps (`N min tc`), rest lines, and pace/warm-up descriptors (`easy`/`recovery`/`warm up`/`cool down` — "20 min easy row" stays timer-less, locked by the `set_wave_lift` golden; same over-fire class as the `min_standalone` Pass-3 guard). A duration **range** ("40-60 sec Plank") deliberately yields no timer — picking an end would be an invented value.
- **Header time-cap** — the coach sometimes writes the cap as the column HEADER itself ("16 min tc"), which `extractTimerConfigs(cell.lines)` never saw. `extractTimerConfigs(lines, header)` now takes the cell header and scans it for the cap only (never AMRAP/EMOM/etc.), with the **same two cap regexes** `detectTimers` uses on content lines (keep the three sites in sync). A header cap is **always** offered as its own fortime config — even when the cell has other timers — deduped against a fortime already carrying the same `capSeconds`. Both callers pass the header: `renderWorkout` (~4880) and the harness. Content-line caps keep their existing `results.length === 0` guard.

**Part-level cross-cell time cap + no-invented `×N` for a bare "every X:XX" (added 2026-07-27, fixtures `fortime_pacing_cap_columns`, `cap_no_leak_two_work_blocks`, `cap_local_fortime_plus_amrap`).** The coach writes the `t.c N` of a workout unit at its **END** — sometimes in the same column as the work, sometimes in a **separate column** of the same part. Her "for time: | 3000 m run / every 4:00 / 5 burpee / 8 push up / 20 d.u | rx+ 4000 m run / t.c 35" sheet parsed as `Every 4:00 ×4 (16′)` — the ×4 was **invented** by the exercise-line fallback reading the for-time list (including the 3000 m run) as 4 stations — while the `TC 35′` sat disconnected in the other column. Three rules:
- **Canonical cap matcher** — the two cap regexes now live ONCE in `capSecondsFromLine(line)`; `detectTimers` (content lines), `extractTimerConfigs` (cell header) and `partCapHints` (whole part) all call it, so the 3-parallel-places rule is enforced by construction.
- **Per-cell cap hints — a cap binds to its OWN block, never leaks (refined SAME DAY 2026-07-27 after a coach flag).** The first version threaded one part-wide cap into **every** cell (`scanPartCapSeconds` → all cells), so "Strength: front squat / 10 min tc / 4 sets…" next to a separate "B Accessories: for time" leaked → Accessories wrongly read `For Time (TC 10′)`. Replaced by **`partCapHints(row.cells)`**, which returns a **PER-CELL array** (indexed by `row.cells`): a cap propagates to a *sibling* cell ONLY when BOTH hold — (1) the cap sits alone in a **pure-notes cell** (after dropping the cap line and annotation lines — `rx`/`rx+` scaling markers, `*`-prefixed notes, `goal`/`מטרה` lines — nothing substantive remains → an "orphan cap"), and (2) **exactly one** capless work block (`for time` keyword or a bare `every X:XX`) is in the part to receive it. Otherwise the cap stays **local to its own block** (via that cell's own written cap). The result is threaded per cell: `renderWorkout` uses `capHints[row.cells.indexOf(cell)]`, the harness uses `capHints[i]` (goldens match production). Guarded by `forbidTimers` in the two new fixtures.
- **Effective cap** — inside `detectTimers`, `effCapSeconds = local cap || part cap`. It applies where a cap is meaningful: the For Time config/label (`For Time (TC 35′)` even when the `t.c` is in another cell) and the bare-every pacing path below. It must **NOT** clone a standalone `TC N′` timer into every capless sibling cell — that push stays local-cap-only.
- **Bare `every X:XX` never counts exercise lines** — `rotationRounds(iv, writtenOnly=true)`: with no written count, no `(N Rounds)`/total, no `N sets` and **no `1#`/`#1` stations**, the line-count fallback is OFF (it mis-reads an all-exercises-per-interval EMOM or a for-time list as a station rotation). Nothing written + a part cap → the "every" is **pacing under the cap**: one `emom` config with `totalSeconds = cap` and the written interval kept for the beeps (`Every 4:00 (TC 35′)`, final partial interval expected). Nothing written + no cap → **no timer**. Anything WRITTEN resolves exactly as before — the header-`×N`-vs-`N sets`×stations asymmetry (`evey_typo_explicit_rounds` / `hashfirst_stations_rounds`) and the E#MOM line fallback are untouched.

**Inline Rx/Rx+ scaling badge (added 2026-07-27).** `rx+ 4000 m run` rendered as plain text — only the colon/paren whole-line forms (`rx: 22.5/15`) had the 💊 badge. `parseLine` now wraps a **standalone** `rx`/`rx+` word in a blue `.rx-badge` span: `\brx\b\+?` (both `\b`s around `rx`, the `+` tacked on outside), so `prx`/`rxy` can never match mid-word. Highlight-only — no timer/layout logic reads the marker — so the 3-parallel-places rule doesn't apply. Guarded by the `rx`-expectation rows in BADGE_CHECKS.

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
**Critical:** bump `CACHE_NAME` in `sw.js` on every code change (`sw.js` is the source of truth — currently **v127**). **The SW is NETWORK-FIRST for the app shell** (navigations + `.html`/`.js`) since 2026-07-26 — a deploy shows up on the next normal F5, no cache-clearing needed. (It was cache-first, which served the STALE app for a load after every push and cost hours of "my fix isn't showing" debugging.) Static assets (images/MP3s) stay stale-while-revalidate. To break a client already stuck on the OLD cache-first SW, run once in its console: `navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(()=>caches.keys()).then(ks=>Promise.all(ks.map(k=>caches.delete(k)))).then(()=>location.reload())`.

**Status:** Chained interval display and per-phase voice cues implemented. **Apps Script must be redeployed** to coach's sheet for timer sync to work (console `_timerCb_` / `_scoreCb_` errors until deployed).
