// WOD Board — parser & timer regression harness (golden snapshots).
//
// WHAT IT DOES
//   Feeds fixture "coach sheets" to the REAL in-page parser (parseAppsScriptData)
//   and timer detector (extractTimerConfigs) by loading index.html in headless
//   Chromium and calling the actual page functions — no code extraction, no
//   drift from production. It snapshots the output as golden baselines; any
//   future change that alters the parsed structure or a detected timer is
//   flagged as a DIFF. Golden = current behaviour baseline (not a hand-written
//   "correct answer"); the point is to catch SILENT regressions in the fragile
//   parser/timer logic documented in PARSER.md (widow guards, part detection,
//   chained-interval detection, activity-interval detection, etc.).
//
//   Fully OFFLINE and DETERMINISTIC: all network is aborted (no live sheet, no
//   Apps Script, no PIN) and fixtures are fixed, so a run is reproducible.
//
// RUN
//   node test/verify-board.mjs            # compare against golden (exit 1 on any DIFF)
//   node test/verify-board.mjs --update   # (re)write golden baselines after an intended change
//
// Playwright is resolved from claude-office-skills (the board itself has no npm).
//
// SCREENSHOTS — known limitation (see test/README.md):
//   A screenshot pass was prototyped but headless Chromium does not paint the
//   #wodArea workout content on this page (the content renders in the DOM with
//   correct geometry — verified — but the gradient-clipped text layer stays
//   blank in headless capture). Until that's resolved, this harness verifies the
//   PARSER/TIMER logic only; visual layout is still checked on the real gym TV.

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/User/claude-office-skills/node_modules/playwright");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const INDEX = pathToFileURL(path.join(ROOT, "index.html")).href;
const GOLDEN_DIR = path.join(ROOT, "test", "golden");
const UPDATE = process.argv.includes("--update");
fs.mkdirSync(GOLDEN_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────
// Fixtures — each is a 2-D "sheet": row[0] = headers, rest = data rows.
// Crafted to exercise the fragile paths in PARSER.md. A `\n` inside a cell is a
// line break exactly as the coach types multi-line cells in the Google Sheet.
// To add a case: append here and run with --update to capture its baseline.
// ─────────────────────────────────────────────────────────────────────────
const FIXTURES = [
  { name: "amrap_simple", note: "single AMRAP → one countdown timer",
    rows: [["", "אימון"], ["מטקון", "AMRAP 12\n10 Cal Row\n10 Burpees\n15 Wall Balls"]] },
  { name: "emom_fortime_columns", note: "two columns (WOD/CARDIO), each its own timer",
    rows: [["", "WOD", "CARDIO"], ["גוף", "EMOM 10\n15 KB Swings", "For Time\n21-15-9\nThrusters\nPull-ups"]] },
  { name: "multipart_parts", note: "part-column layout → per-part timer buttons",
    rows: [["", "part 1", "part 2", "part 3"], ["סבב", "3 sets\n10 Deadlift\n10 Box Jump", "AMRAP 8\n5 Pull-ups\n10 Push-ups", "Tabata\n20/10 ×8\nHollow Hold"]] },
  { name: "chained_amrap", note: "chained AMRAPs+rest → interval/tabata chained timer",
    rows: [["", "WOD"], ["מטקון", "AMRAP 10\n10 Wall Balls\n10 T2B\nrest 2:00\nAMRAP 10\n10 Wall Balls\n10 T2B\nrest 2:00\nAMRAP 10\n10 Wall Balls\n10 T2B"]] },
  { name: "activity_interval", note: "coach interval style '3 min run / 1 min rest ×5'. ⚠️ Until 2026-08-08 this fixture's golden was an EMPTY timer list — detectActivityInterval was reachable only from inside extractTimerConfigs' part-split loop, so a plain cell with no 'part N' headers never reached it. The fixture named after the detector was silently asserting that the detector does nothing, because a golden captures whatever the code does, not what the fixture MEANS. The unexplained-facts property test flagged it on its first run ('3 min, 1 min written, no timer'). expectTimers now states the intent directly so a golden can never quietly re-empty it.",
    expectTimers: ["3′/1′ ×5"],
    rows: [["", "CARDIO"], ["ריצה", "5 sets\n3 min run\n1 min rest"]] },
  { name: "long_section_widows", note: "long single section → newspaper column split + widow guards",
    rows: [["", "WOD"], ["חימום", "Warm up\n1. 10 Hip 90-90\n2. 10 Arm Circles\n3. 10 Air Squats\n4. 10 Inchworm\n5. 10 Scap Pull-ups\nA. 3 sets of:\n10 Goblet Squat\n10 Ring Row\n10 Push-up\nB. 3 sets of:\n8 Deadlift\n8 Strict Press\nAMRAP 15\n5 Pull-ups\n10 Push-ups\n15 Air Squats"]] },
  { name: "station_labels_with_keywords", note: "A. group + A1/A2. stations keep teal badge even when the line mentions Metcon/For Time",
    // "A. Deadlift Prog-8 min" names a strength PROGRESSION, not a timed block:
    // the 8 min is how long the coach expects the progression to take, not a
    // clock she wants on the TV (the leading-standalone-duration rule requires
    // the line to LEAD with "N min" precisely to stay out of cases like this).
    // Declared intentionally-unconsumed so the property test stays quiet here
    // without going quiet everywhere.
    ignoreFacts: ["8 min"],
    rows: [["", "WOD"], ["כוח", "A. Deadlift Prog-8 min\n2 sets of 4 reps\nA1 Lift Drop Reset (For Strength)\n80%\nA2. T&GO (For Metcon)\n85%\ntempo deadlift\n(31x1)\n2 sets of 5 reps\n70%"]] },
  { name: "superset_group_cohesion", note: "A. group + A1/A2 superset + inline @load: '@75%' stays on its line (not split), and the group is not torn across columns (see LAYOUT pass)",
    rows: [[" b", "", "1", "2", "3", "בטיחות/דגשים"],
           ["", "WOD", "warm up : 2 sets\n30 sec work, 10 rest\n1# pull apart\n2# push up to down dog\n3# מקל", "A. Bench press\nA1 - Teach Bar Movment\n\nA2 Benchpress -\n4 sets\nx 6 reps @75%\nrest 1:30-2 min", "", ""]] },
  { name: "set_wave_lift", note: "per-set lift wave ('Set 1: 5 Reps' + '70% 1RM' …) → each Set gets the cyan SET badge (see BADGE_CHECKS); the wave text must NOT trigger a false timer",
    rows: [["", "כוח", "CARDIO"],
           ["", "Back squat:\nSet 1: 5 Reps\n70% 1RM\nSet 2: 3 Reps\n80% 1RM\nSet 3: 1 Rep\n90%+ 1RM (Heavy single for the day)\nSet 4: 3 Reps\n75% 1RM (Back-off set)\nSet 5: 5 Reps\n85% 1RM (Back-off set)", "20 min easy row"]] },
  { name: "partner_team_wod", note: "team-WOD partner stations written mixed ('1 partner: …' number-first + 'partner 2:/3:' word-first) → all get the cyan PARTNER badge (see BADGE_CHECKS); must NOT trigger a false timer",
    rows: [["", "CARDIO", "כוח"],
           ["", "Warm up- skill row:\nand then teams of 3:\n1 partner: 12 cal\npartner 2: max reps:\n10 push up\n20 air squat\n30 bicycel crunch\npartner 3: plank hold", "rest as needed"]] },
  { name: "e2mom_rotation", note: "coach's 'e2momx' (dangling x) + '3 sets (18 min total)' over 3 stations → E2MOM ×9 (18′): 2-min interval, total from the written 18, NOT the 10-min default",
    rows: [["", "WOD"],
           ["", "e2momx\n3 sets (18 min total)\n1# 24 db's Alternating Lunges in Place\n2# 15 db's push press\n3# 18/14 Calorie Row"]] },
  { name: "every_rotation_stations", note: "'EVERY 2:30' + '3 sets - 30 min total' over 4 stations → Every 2:30 ×12 (30′). One interval = ONE STATION, so 3 sets × 4 stations = 12 intervals — NOT the 3 the old code read straight off '3 sets'",
    rows: [["", "CARDIO"],
           ["", "EVERY 2:30:\n1# 400 run\n2# amrap:\n2-4-6-8-10.....\nhalf burpee\npush up\n3# 400-500 row\n4# 2-4-6-8-10.....\njumping lunge\nburpee box jump\n3 sets - 30 min total"]] },
  { name: "evey_typo_explicit_rounds", note: "the coach's real sheet (2026-07-14, verbatim): 'PART1: EVEY 2:00 X3' — 'EVEY' is a typo for EVERY (missing r) and used to match nothing at all → NO timer button on the TV. Also locks the deliberate asymmetry the coach confirmed: an explicit ×N in the header is the LITERAL interval count and is NOT multiplied by the 1#/2# stations → Every 2:00 ×3 (6′). (Only a separate 'N sets' line multiplies by stations — see every_rotation_stations.) Unifying the two paths made this a 12′ clock and was wrong.",
    rows: [["", "כוח", "WOD"],
           ["", "Strength:\nskill- 6-7 min", "PART1: EVEY 2:00 X3\n1# 10-8 strict pull up- Can Use band /Ring Rows\n2#. 10-8 St Dips / ring dips"]] },
  { name: "emom_merged_station", note: "coach merges two stations into one line — 'E2MOM\\n3 sets' over stations 1#, 2+3#, 4#. A merged '2+3#' is TWO stations, so 3 sets × 4 stations = 12 intervals (E2MOM ×12, 24′), NOT the ×6 the old line-counting read (it missed '2+3#' entirely). Guards: stationCount() counts digit-groups not lines (~2567) + the merged label gets the orange rep highlight (~4628) + counts as a clean-break station (~4764). Bug from the 2026-07-15 EMOM 25 board where '2+3# 200-150 M RUN' stayed white.",
    rows: [["", "WOD"],
           ["", "E2MOM\n3 sets\n1# 24 db's Alternating Lunges in Place\n2+3# 15 db's push press\n4# 18/14 Calorie Row"]] },
  { name: "hashfirst_stations_rounds", note: "coach's real sheet (2026-07-19, verbatim): 'Every 1:30 x 3 sets (6 Rounds)' over HASH-FIRST stations '#1'/'#2'. Two bugs: (1) '#1'/'#2' (hash-first) were invisible to every station regex — only number-first '1#'/'2#' matched — so they got no orange badge and weren't clean break points (see BADGE_CHECKS '#1'/'#2'). (2) The header ×3 is a literal EMOM count, but the coach also spelled out '(6 Rounds)' = 3 sets × 2 stations, so the clock must be 1:30 ×6 (9′), not the 4:30 the literal ×3 gave. Fix: an explicit parenthetical '(N Rounds)' is a written total that overrides the derived count (like '(N min total)' already did), WITHOUT touching the ×N/stations asymmetry the evey_typo fixture locks.",
    rows: [["", "WOD"],
           ["", "Every 1:30 x 3 sets (6 Rounds)\n#1\n5-7 Strict HSPU\nThen Max Handstand Hold in the remaining time\n#2\n12 Pike Leg Lifts\nThen Max Tuck Hold / L-Hold in the remaining time"]] },
  { name: "three_column_block_timers", note: "coach's real sheet (2026-07-26): a part with THREE columns, each its own time-defined block → THREE cyclable timers (⏱↻ runs them 8′ → TC 16′ → E2MOM 18′). (1) 'Strength:' column LEADS with a bare '8 min leg and lat activation' — no AMRAP/EMOM/'work' keyword → leading standalone block duration = 8′ count-up. (2) the middle column's time cap is its HEADER ('16 min tc'), which cell.lines never saw → extractTimerConfigs now scans the header for the cap → TC 16′ fortime. (3) 'B Accsesories:' E2MOM X 9 → E2MOM ×9 (18′) — already worked, must keep working ('(3 rounds from each)' must NOT be read as a written '(3 Rounds)' total — text after the number blocks that regex). The '40-60 sec Plank' RANGE deliberately yields no timer (picking 40 or 60 would be an invented value).",
    expectTimers: ["8′ leg and lat activation", "TC 16′", "E2MOM ×9 (18′)"],
    rows: [["", "Strength:", "16 min tc", "B Accsesories:"],
           ["", "8 min leg and lat activation", "5 sets of 4 reps of 1.5 front squat\n65-70%", "E2MOM X 9 (3 rounds from each)\n1- 10-12 Weighted GHD Sit ups\n2- 10-12 Back Extension\n3- 40-60 sec Plank"]] },
  { name: "fortime_pacing_cap_columns", note: "coach's real sheet (2026-07-27): ONE part in TWO columns. Col 1 (header 'for time:') is the work — '3000 m run' + a bare 'every 4:00' pacing line + 3 exercises; col 2 is the scaling ('rx+ 4000 m run') and the cap ('t.c 35'). Locks two fixes: (1) the bare 'every 4:00' has NO written count/total/sets and NO 1#/#1 stations — the old exercise-line fallback invented 'Every 4:00 ×4 (16′)' by reading the for-time list (incl. the 3000m run) as 4 stations; now nothing-written + a part cap = pacing UNDER the cap → Every 4:00 (TC 35′): emom iv=240 with totalSeconds=2100 (the 35′ cap), final partial interval expected. (2) the 't.c 35' lives in the OTHER column, alone in a pure-notes cell (rx+ line, *goal line, cap) — partCapHints recognizes it as an ORPHAN cap and, since col 1 is the single capless work block, threads it into col 1 ONLY (not a blanket every-cell spray). Col 2 still yields its own local TC 35′ fortime from that same written cap (same clock, still cycle-reachable). The ×N-vs-'N sets'×stations asymmetry (evey_typo_explicit_rounds / hashfirst_stations_rounds) is deliberately untouched by this: anything WRITTEN still resolves exactly as before.",
    expectTimers: ["Every 4:00 (TC 35′)", "TC 35′"],
    rows: [["", "for time:", ""],
           ["", "3000 m run\nevery 4:00\n5 burpee\n8 push up\n20 d.u", "rx+ 4000 m run\n*המטרה לסיים במינימום סטים\nt.c 35"]] },
  { name: "cap_no_leak_two_work_blocks", note: "cap-LEAK guard (2026-07-27, coach-flagged): a part with TWO independent work blocks, each with its OWN timing. 'Strength:' carries its own 'front squat / 10 min tc / 4 sets…' — the cap belongs to Strength ONLY. 'B Accessories: for time' is a SEPARATE block with NO cap. The old scan applied the first cap it found to EVERY cell → Accessories wrongly read 'For Time (TC 10′)'. partCapHints fixes this: the 10-min cap's own cell ('Strength') has real work content (not a pure-notes cell) → it is NOT an orphan cap → it never propagates. Strength keeps its local TC 10′; Accessories stays a bare 'For Time'. forbidTimers locks the leak shut. ── 2026-08-11: the leaked label is now spelled 'TC 10′ · For Time' (the cap LEADS the label — see the time-first note in detectTimers). The forbid entry was updated with it. This matters more than it looks: a forbidTimers string the code can no longer emit passes vacuously, so the guard would have gone dead the moment the label format changed while still reading like it guards.",
    expectTimers: ["TC 10′", "For Time"],
    forbidTimers: ["TC 10′ · For Time", "For Time (TC 10′)"],
    rows: [["", "Strength:", "B Accessories:"],
           ["", "front squat\n10 min tc\n4 sets of 4 reps of 1.5 front squat", "for time:\n50 burpees\n50 pull ups"]] },
  { name: "cap_local_fortime_plus_amrap", note: "cap-LEAK guard, sibling case (2026-07-27): a For-Time block writes its OWN cap IN ITS OWN cell ('for time: / 21-15-9 thrusters / t.c 8') next to a separate 'amrap 5:' block. The t.c 8 sits in a cell with real work content → not an orphan → stays local ('TC 8′ · For Time'); it must NOT bleed onto the AMRAP. AMRAP keeps its own 5′. Confirms the fix leaves same-cell caps untouched while blocking cross-cell leaks. ── 2026-08-11: label re-spelled cap-first (time-first note in detectTimers); the old '(TC 8′)' parenthetical is kept in forbidTimers so a revert to the truncation-prone wording fails loudly.",
    expectTimers: ["TC 8′ · For Time", "AMRAP 5′"],
    forbidTimers: ["AMRAP 5′ (TC 8′)", "AMRAP (TC 8′)", "For Time (TC 8′)"],
    rows: [["", "Metcon:", "Finisher:"],
           ["", "for time:\n21-15-9 thrusters\nt.c 8", "amrap 5:\nmax cal bike"]] },
  { name: "minutes_on_off_intervals", note: "coach's real sheet (2026-08-03, VERBATIM from getWorkoutSheet — 3 columns, headers '1'/'2'/'3'): the Metcon cell leads with 'Metcon:' and then '4 min on 1 min off x 4' over 4 numbered stations → NO timer at all on the gym TV. Two work/rest patterns already existed and the coach wrote the gap between them: the timeline pattern (~2620) accepts MINUTE units but only the literal words work/rest; the regex fallback (~2944) accepts on/off but only SECONDS ('30 sec on 10 sec off'). 'min' + 'on/off' matched neither. Nor did anything else fire: no AMRAP/EMOM/every/tabata/for-time keyword, no t.c cap, and the 'leading standalone block duration' fallback needs the FIRST content line to lead with 'N min' — here it is 'Metcon:', so even the (wrong) 4-minute count-up never appeared. Total silent loss of the clock, same shape as the EVEY typo. Fix: the fallback's unit group now accepts min/minutes/m as well as sec/seconds/s INDEPENDENTLY on each side, converts to seconds, and labels via fmtDur → '4′/1′ ×4'. The written 'x 4' is the round count: 4×(4+1) = 20′. Col 1 locks the SECOND bug on the same board: it reads 'warm up tabata' + '3 sets of 30 seconds on 10 seconds off pause squat'. The bare 'tabata' keyword used to fire FIRST with the classic 20/10 ×8 default, and the custom-interval block was then skipped by the `!results.some(type==='tabata')` guard — so the GUESSED 20/10 ×8 replaced her WRITTEN 30/10 ×3 (a live no-invented-timer-values violation). The keyword default is now a LAST resort, after the custom/single-line/chained paths; when she did write values the keyword only NAMES the block → 'Tabata 30″/10″ ×3'. `forbidTimers: ['Tabata']` locks the bare default out of this sheet. The ×3 comes from a narrow 'N sets OF <the work/rest spec>' rule that only fires when the count sits on the SAME LINE as the interval — a bare 'N sets' on its own line above a station list stays ROTATION semantics (sets × stations), untouched: superset_group_cohesion still yields 30″/10″ ×3 from its station count, not ×2 from its 'warm up : 2 sets' line. THIRD fix on the same cell: '6 min leg mobility' got no clock either, because the leading-standalone-duration rule (a) read the LITERAL first line ('warm up tabata', a zone label) and (b) sat inside the `!chained && results.length === 0` last-resort block, which the pause-squat interval had already filled. Both are positional accidents — '8 min leg and lat activation', the identical shape written on line 1 of its own cell, DOES get its clock (three_column_block_timers). The rule now skips label-only lines (ending ':' or starting 'warm up') and lives OUTSIDE the last-resort guard, so a stage can carry BOTH clocks (⏱↻ cycles 6′ → Tabata 30″/10″ ×3). Its new anti-double-count is the `forbidTimers` entry here: the Metcon line '4 min on 1 min off x 4' ALSO leads with 'N min', and without the interval-spec test (format word / on-off / ×N / a SECOND duration in the remainder) it produced a ghost 4′ count-up beside its correct 4′/1′ ×4.",
    expectTimers: ["4′/1′ ×4", "Tabata 30″/10″ ×3", "6′ leg mobility"],
    forbidTimers: ["Tabata", "4′ on 1 min off x 4"],
    rows: [[" b", "", "1", "2", "3", "בטיחות/דגשים"],
           ["", "WOD",
            "warm up tabata\nwarmup:\n6 min leg mobility \n3 sets of 30 seconds on 10 seconds off pause squat\n\n",
            "Strength: \nback squat \n5 sets of 5 reps @75%\n\n         \n",
            "Metcon:\n4 min on 1 min off x 4\n1. 400 meter run +  max wallballs\n2. 30 t2b+ max sit ups\n3. 20 alternating dumbell snatch + max box jump in remaining time \n4. 30.20 cal row - max burpees in remaining time \n",
            ""]] },
  { name: "cardio_written_total_beats_xN", note: "coach's real CARDIO cell (2026-08-04, VERBATIM from the sheet's column '2'): '4 min work, 1 min rest x2 sets of all (40 min)' over 4 numbered stations. The TV showed '4′/1′ ×2' = a TEN-minute clock on a FORTY-minute block. (Mechanically: parseAppsScriptData splits the coach's line into '…rest x' | '2 sets of all (40 min)', so the single-line-interval block found no ×N on its own line and bailed; the custom work/rest fallback then scanned the whole cell text, found the 'x2' and stopped there — neither path ever looked at the written total.) Her written total is the authority: 40 ÷ (4+1) = 8 rounds (and 'x2 sets of ALL' × 4 stations = 8 too — both readings agree). The rotation paths already implemented 'a written total overrides a written ×N' via the shared writtenTotalMin()/rotationRounds() helpers; those helpers are now hoisted to the top of detectTimers and the single-line block calls the SAME writtenTotalMin() instead of re-deriving the total inline (the two shapes of the same workout must not drift apart). writtenTotalMin() also had to learn the BARE parenthetical '(40 min)' — it previously required the word 'total'. The closing ')' is required immediately after the unit, so the '4 min'/'1 min' of the work/rest pair itself can never be swallowed. forbidTimers locks the old ×2 out. If NO total is written the behaviour is unchanged (×2) — see single_line_interval_no_total.",
    expectTimers: ["×8 · 4′ work / 1′ rest"],
    forbidTimers: ["×2 · 4′ work / 1′ rest"],
    rows: [["", "CARDIO"],
           ["", "4 min work, 1 min rest x2 sets of all (40 min)\n1. 600 m row+\nmax burpee over row machine\n\n2. amrap :\n5 pull up/ring row\n10 push up\n15 air squat\n\n3. 600 run+\nburpee board jump\n\n4. 20 v-ups\n20 alt lunge jump\nmax plank hold"]] },
  { name: "single_line_interval_no_total", note: "the OTHER half of the written-total rule (no-invented-timer-values): the SAME interval line with the '(40 min)' REMOVED must resolve to exactly the written ×2, byte-for-byte as before the fix — a missing value means 'no change', never a guessed default. Locks that widening writtenTotalMin() to the bare '(N min)' form did not turn the absence of a total into an invented one. ⚠️ The label here is the custom work/rest fallback's '4′/1′ ×2', NOT the single-line block's '×2 · …' — because parseAppsScriptData SPLITS the coach's line ('…rest x' | '2 sets of all', via the (?<=letter)(?=\\d+\\s+letter) rule at ~4746), so the single-line block sees no ×N on its own line and bails; the fallback, which scans the whole cell text, is what produced the ×2 on the gym TV. That is precisely why the written-total lookup must ALSO scan the whole cell (writtenTotalMin does) rather than the interval line alone.",
    expectTimers: ["4′/1′ ×2"],
    forbidTimers: ["×2 · 4′ work / 1′ rest", "×8 · 4′ work / 1′ rest"],
    rows: [["", "CARDIO"],
           ["", "4 min work, 1 min rest x2 sets of all\n1. 600 m row+\n2. 600 run+"]] },
  { name: "on_off_written_total_beats_xN", note: "the SIBLING path of cardio_written_total_beats_xN (2026-08-04). The coach writes the identical workout either way — 'work'/'rest' or 'on'/'off' — and the two wordings are parsed by two DIFFERENT blocks: the single-line interval loop (~2680, literal work/rest only) and the custom work/rest fallback (~3007, on/off + work/rest, whole-text scan). The 2026-08-04 fix taught only the single-line block that a WRITTEN TOTAL overrides a written ×N, so '4 min on 1 min off x2 sets of all (40 min)' still resolved to ×2 — a TEN-minute clock on a FORTY-minute block, the exact defect that was just closed for the other wording. PARSER.md carried it as a known sibling gap; this fixture closes it. The fallback now calls the SAME hoisted writtenTotalMin() helper (it does NOT re-derive the total inline — that is the whole point of hoisting it): 40 ÷ (4+1) = 8 → '4′/1′ ×8'. The derived count is subject to the same sanity guards as the single-line path (work ≥5″, rest ≥1″, 2 ≤ rounds ≤ 30, total ≤ 90′); if it fails them the written ×N stands, unchanged. forbidTimers locks the old ×2 out.",
    expectTimers: ["4′/1′ ×8"],
    forbidTimers: ["4′/1′ ×2"],
    rows: [["", "CARDIO"],
           ["", "4 min on 1 min off x2 sets of all (40 min)\n1. 600 m row+\n2. 600 run+"]] },
  { name: "on_off_no_total_unchanged", note: "the no-invented-timer-values half of on_off_written_total_beats_xN: the SAME on/off line with '(40 min)' REMOVED must resolve to exactly the written ×2, byte-for-byte as before the fix. Mirrors single_line_interval_no_total for the on/off wording. This is what locks that consulting writtenTotalMin() in the custom work/rest fallback cannot INVENT a total where the coach wrote none — with no total the derived count is 0, fails the sanity window, and the existing ×N chain (explicit ×N → same-line 'N sets of' → exercise-line heuristic) runs untouched. forbidTimers keeps the ×8 of the positive fixture out.",
    expectTimers: ["4′/1′ ×2"],
    forbidTimers: ["4′/1′ ×8"],
    rows: [["", "CARDIO"],
           ["", "4 min on 1 min off x2 sets of all\n1. 600 m row+\n2. 600 run+"]] },
  { name: "seconds_on_off_unchanged", note: "regression guard for the minutes_on_off fix: the classic seconds form '30 sec on 10 sec off x 8' must keep parsing exactly as before (30″/10″ ×8). Locks that widening the unit group to minutes did not change the seconds path — the old label hardcoded ″, the new one goes through fmtDur, which must still render ″ for sub-minute values.",
    expectTimers: ["30″/10″ ×8"],
    rows: [["", "WOD"],
           ["", "30 sec on 10 sec off x 8\nmax cal bike"]] },
  { name: "invented_rounds_fallback", note: "MEASUREMENT fixture (2026-08-08), not a correctness claim: this is the exact shape that reaches `rounds = exerciseLines.length || 5` — a work/rest interval with NO ×N, NO written total, NO same-line 'N sets of', and NO numbered exercise lines to count. The '5' is a pure guess: nothing the coach wrote says 5. It is the LAST surviving invented value in the pipeline and it violates the no-invented-timer-values rule every other path now obeys. It is NOT deleted, because deleting it blind turns this shape from a ×5 clock into NO clock and nobody knows how many real sheets look like this. This fixture makes the cost of deletion concrete (the harness prints which fixtures depend on the guess) while the live board records real firings to localStorage['wodboard-invented']. When the record says it is unused — or the coach confirms blocks like this should be clockless — delete the `|| 5`, and this fixture's expectTimers becomes forbidTimers. See TIMER_ROADMAP.md §5.",
    expectTimers: ["30″/10″ ×5"],
    rows: [["", "WOD"],
           ["", "30 sec on 10 sec off\nmax cal bike"]] },
  { name: "plural_mins_alias", note: "ALIAS-DRIFT guard (2026-08-08, vocabulary consolidation): the time-unit alias was written two ways across the file — 'min(?:utes?)?' (min · minute · minutes) at 18 sites and 'min(?:ute)?s?' (which ALSO accepts the coach's 'mins') at 11. So '4 mins on 1 min off' parsed in some paths and not others, purely by which spelling that path happened to be copied from — the exact half-applied-alias shape that cost the whole clock for 'EVEY' and 'e2momx'. All sites normalized to the permissive union (same for sec(?:onds?)? → sec(?:ond)?s?), so every path now accepts every form she writes. This fixture is the proof the widening is REAL and not just green: the plural 'mins' must produce the same clock the singular does. The 26 pre-existing goldens were byte-for-byte unchanged by the normalization, which is what proves it widened without shifting anything.",
    expectTimers: ["4′/1′ ×4"],
    rows: [["", "CARDIO"],
           ["", "Metcon:\n4 mins on 1 min off x 4\n1. 400 meter run\n2. 30 t2b"]] },
  { name: "exercise_line_filter_drift", note: "DRIFT guard (2026-08-08, vocabulary consolidation): the 'count the exercise lines' heuristic existed TWICE and the copies had already diverged — rotationRounds (~2913) excluded lines leading with 'set'/'round', the custom work/rest fallback's copy (~3286) did NOT. So a bare 'N sets' line counted as an EXERCISE in one path and not the other, inflating the fallback's round count by one per such line. Here '30 sec on 10 sec off' carries no ×N, no same-line 'N sets of' and no written total, so the fallback reaches the exercise-line count. Verified counterfactually on the two filters, not assumed: the drifted one counts ['3 sets','1# wall balls','2# row','3# burpee'] = 4 → 30″/10″ ×4 (a 20-minute clock on a 15-minute block); the unified isExerciseLine counts only the 3 stations → ×3, which is also exactly what the same cell WITHOUT the '3 sets' line resolves to (probed) — the two shapes of one workout now agree. Distinct from superset_group_cohesion, whose 'warm up : 2 sets' does not start with a digit and so never reached this filter at all. forbidTimers locks the old ×4 out.",
    expectTimers: ["30″/10″ ×3"],
    forbidTimers: ["30″/10″ ×4"],
    rows: [["", "WOD"],
           ["", "30 sec on 10 sec off\n3 sets\n1# wall balls\n2# row\n3# burpee"]] },
  { name: "inline_part_header_timing", note: "coach's real CARDIO cell (2026-08-08, VERBATIM from getWorkoutSheet, column '2'): TWO 'part N' blocks inside ONE cell, each with its timing written INLINE on the part header line — 'part 1: t.c 14' and 'part 2: amrap 14'. The TV showed a bare 'For Time' and 'P1 · 12 RFT': BOTH written 14s were gone, and part 2 had no clock at all. Cause: extractTimerConfigs splits the cell on part headers and built each segment as lines.slice(start + 1, end) (~3283) — the part-header LINE ITSELF was excluded, so its inline spec never reached detectTimers. capSecondsFromLine('part 1: t.c 14') returns 840 perfectly well; nothing ever asked it. This is the no-invented-timer-values rule in its mirror form — a value the coach DID write must reach the clock. No fixture covered the in-cell part-split path at all (multipart_parts uses part-named COLUMNS; evey_typo_explicit_rounds has a single 'PART1:' line and takes the partIdx.length < 2 whole-cell branch), which is why it survived. Fix: the remainder after the 'part N:' prefix is prepended to its own segment. The literal 'part N' words are STRIPPED, not passed through, so no regex can read the part NUMBER as minutes/rounds — 'part 2: amrap 14' resolves to AMRAP 14′, never AMRAP 2′. forbidTimers locks both wrong outputs out. ── STAGED, 2026-08-10 (coach): the compound clock added the same day is WRONG for this exact cell, and the reason is inside part 2. 'part 2: amrap 14 / 1000 m run / and then: amrap: / …' is internally STAGED — the 1000 m run carries no clock, so the AMRAP she declared on the header does not begin when part 2 begins; the athletes decide that moment. A whole-cell chain auto-advances rest → AMRAP at a FIXED offset and would start the AMRAP while people are still running. Per-part clocks, started by hand, are the correct answer, so the chain is now suppressed for a staged part and forbidTimers locks it out. The suppression is deliberately narrow — a written sequence-transition marker ('and then' / 'then:' / 'after that' / 'ואז' / 'לאחר מכן') on a line inside a NUMBERED part's own body — not a revert of the compound feature and not a blanket disable: continuous_parts_compound_chain (the same cell minus the two staged lines) still chains byte-for-byte. Both per-part clocks MUST survive: losing a clock is worse than a wrong one, which is why expectTimers still names them. And the capless 'For Time' preamble must NOT come back as the ⏱↻ default now that the compound clock is gone — its suppression trigger widened from 'the compound clock exists' to 'that OR ≥2 numbered parts produced their own clocks' (Noam's call). Verified counterfactually, not assumed: detectTimers(['for time:']) does return {fortime, capSeconds:0, 'For Time'}, so without the widening it would be back at the head of the cycle.",
    // ── 2026-08-11, Noam: the part duration is the part's TOTAL BUDGET ──
    // Third reading of this one cell in four days, and the first that the coach's
    // own objection does not contradict. Additively it is 14 + 2 + 14 = 30′
    // (2026-08-08); un-chained it was two hand-started clocks (2026-08-10); it is
    // actually TWO 14-MINUTE PARTS — part 1 being 12′ of work plus the 2:00 rest
    // written inside it, part 2 being 14′ that covers the 1000 m run AND the
    // AMRAP that follows it. Session = 12 + 2 + 14 = 28′.
    //
    // This RESOLVES the coach's objection rather than reverting it: her complaint
    // was that a chain would start the AMRAP while people were still running.
    // Under this reading the AMRAP is not a phase at all — it is simply what is
    // left of part 2's 14′ once the run is done, so nothing auto-starts mid-part.
    // Her words ("1000 מטר ללא זמן") mean the run has no cap OF ITS OWN, not that
    // it sits outside the clock.
    //
    // Two consequences the assertions below lock:
    //  • The 12 is DERIVED (14 − 2). Both operands are written, same family as
    //    the long-standing "written total ÷ (work+rest)" — see partBudget. The
    //    additive 14′ work phase is now the WRONG answer and is forbidden.
    //  • The staged-part suppression no longer fires here, because part 2's
    //    length IS written on its header and therefore bounds the whole part,
    //    run included. It still fires when a staged part's length is unwritten —
    //    that case moved to `staged_unbounded_part_no_chain`, which is now the
    //    only holder of the `staged-part` branch.
    //
    // `ignoreFacts: ["2:00"]` is GONE, and its absence is the point: the rest is
    // a real phase of the compound clock again, so the unexplained-facts
    // assertion passes on its own. Every written number in the cell now reaches
    // a clock — the state this whole fixture family exists to reach.
    expectTimers: ["TC 12′ → AMRAP 14′ · 2′ rest", "P1 · TC 12′ · 12 RFT", "P2 · AMRAP 14′"],
    forbidTimers: ["TC 14′ → AMRAP 14′ · 2′ rest", "P1 · TC 14′ · 12 RFT",
                   "P1 · 12 RFT (TC 14′)", "P1 · 12 RFT", "AMRAP 2′", "TC 2′", "TC 1′", "For Time"],
    rows: [["", "1", "2"],
           ["CARDIO", "Warm up: \nskill: d.u\n tabata- coach choice",
            "for time:\npart 1: t.c 14\n12 rft:\n6 box jump over\n9 ring row\n12/10 cal row\n\n2:00 rest\n\npart 2: amrap 14\n1000 m run\nand then: amrap:\n20 squat jump\n40 d.u\n20 burpee"]] },
  { name: "continuous_parts_compound_chain", note: "THE CONTROL for inline_part_header_timing (2026-08-10). Byte-for-byte the SAME sheet with exactly TWO lines removed — the untimed '1000 m run' and the 'and then: amrap:' transition. That is the whole difference between the two fixtures, so the pair proves the staging suppression keys on the staged work and on nothing else (not on the part count, not on the preamble, not on the 't.c 14'/'amrap 14' pairing). Here the written schedule IS the running order — cap → 2:00 rest → AMRAP, back to back — so the compound clock is correct and must keep firing exactly as it did on 2026-08-08: one 30:00 start, phases WORK 14:00 → REST 2:00 → WORK 14:00, per-part buttons still behind it in the ⏱↻ cycle. This fixture is also the only remaining holder of the `compound-chain` branch: when the staged cell stopped chaining, that branch's hit count went to ZERO and the coverage assertion would have failed — correctly, because a suppression with no surviving positive case is indistinguishable from a revert. The capless 'For Time' preamble stays suppressed here too (the compound clock exists), unchanged from 2026-08-08.",
    // ── 2026-08-11: what this fixture proves has CHANGED, and honestly so ──
    // It was the A/B control showing the staging suppression keyed on the two
    // staged lines. Under the budget reading those lines no longer change the
    // schedule at all, so this cell and its staged sibling now resolve to the
    // SAME timers — which is precisely the new claim: staging INSIDE a part
    // whose length is written does not affect the session's running order.
    // Its job is now to lock that equivalence (remove the run + "and then" and
    // nothing moves). The staging suppression's own positive case lives in
    // `staged_unbounded_part_no_chain`.
    // Part 1 is 12′ + its 2:00 rest here too — the same text, the same reading.
    expectTimers: ["TC 12′ → AMRAP 14′ · 2′ rest", "P1 · TC 12′ · 12 RFT", "P2 · AMRAP 14′"],
    forbidTimers: ["TC 14′ → AMRAP 14′ · 2′ rest", "P1 · TC 14′ · 12 RFT",
                   "P1 · 12 RFT (TC 14′)", "For Time", "P1 · 12 RFT", "AMRAP 2′", "TC 2′", "TC 1′"],
    rows: [["", "1", "2"],
           ["CARDIO", "Warm up: \nskill: d.u\n tabata- coach choice",
            "for time:\npart 1: t.c 14\n12 rft:\n6 box jump over\n9 ring row\n12/10 cal row\n\n2:00 rest\n\npart 2: amrap 14\n20 squat jump\n40 d.u\n20 burpee"]] },
  { name: "staged_unbounded_part_no_chain", note: "THE surviving positive case for the staged-part suppression (2026-08-11), and the only holder of the `staged-part` branch after the budget reading un-suppressed the coach's real cell. The 2026-08-10 rule blocked the whole-cell chain for ANY part carrying a sequence marker; it is now narrowed to a part whose OWN LENGTH IS NOT WRITTEN. Here part 2's header is a bare 'part 2:' — no duration — and the only duration inside it ('amrap 14') sits AFTER the 'and then:' marker, so it is the length of the SECOND STAGE only. Part 2's true length is run (unknown) + 14, i.e. unknown, and a chain that auto-advances at fixed offsets would start part 2's AMRAP while people are still running — exactly the coach's 2026-08-10 objection, in the shape where it is still valid. The suppression is genuinely LOAD-BEARING here and not incidentally null: without it chainFromTimeline(lines) finds work 840 (t.c 14) / rest 120 / work 840 (amrap 14) — uniform, in range, a perfectly well-formed 'TC 14′ → AMRAP 14′ · 2′ rest' — which forbidTimers now locks out. Contrast with inline_part_header_timing, where the SAME marker does NOT suppress because 'part 2: amrap 14' writes the length on the header and so bounds the whole part, run included. Both per-part clocks must survive (losing a clock is worse than a wrong one), and part 1 still gets the budget treatment — its written 14 contains its own 2:00 rest → TC 12′. The 2:00 is a deliberate non-detection here for the same reason it was in the staged cell before: un-chained, nothing auto-advances through it, and emitting a standalone 2′ rest clock to quiet the assertion would be an invented control surface.",
    expectTimers: ["P1 · TC 12′ · 12 RFT", "P2 · AMRAP 14′"],
    forbidTimers: ["TC 14′ → AMRAP 14′ · 2′ rest", "TC 12′ → AMRAP 14′ · 2′ rest",
                   "P1 · TC 14′ · 12 RFT", "For Time"],
    ignoreFacts: ["2:00"],
    rows: [["", "1", "2"],
           ["CARDIO", "Warm up: \nskill: d.u\n tabata- coach choice",
            "for time:\npart 1: t.c 14\n12 rft:\n6 box jump over\n9 ring row\n12/10 cal row\n\n2:00 rest\n\npart 2:\n1000 m run\nand then: amrap 14\n20 squat jump\n40 d.u\n20 burpee"]] },
  { name: "untimed_lead_then_block_duration", note: "coach's real warm-up cell (2026-08-10, from the gym TV): 'warmup -' / '600 run x 1' / '7 min lat and quad mobilit for front squat' produced NO clock. The 7 min was not missed by the duration lexer — the board PAINTED it, red time-badge and all, because parseLine's isInstruction owns the same `^\\d+\\s*(min|sec|rounds|sets)` pattern. The DETECTOR simply never looked at that line: the leading-block-duration rule read the first content line only, and the untimed '600 run x 1' had taken that slot. Two layers, one pattern, disagreeing about POSITION — the exact silent-loss shape this suite exists to catch, and a fixture of this shape would have caught it years earlier via the unexplained-timing-facts assertion. Widened 2026-08-10 (Noam's call): the slot goes to the first content line that CARRIES a duration, provided every content line before it carries no timing at all. The original intent — 'a leading duration NAMES the block; a mid-list 3 min bike does not' — survives in its honest form, 'nothing timed came first': a block that opens with untimed work is still a block that this duration names. Same family as the staged-part narrowing shipped the same day (untimed work preceding timed work); there it removed a wrong clock, here it restores a missing one. ── THE NEGATIVE CONTROL IS `activity_interval`, and it is not decorative: it FAILED on this change's first run. With untimed lines no longer consuming the slot, her '5 sets / 3 min run / 1 min rest' reached this rule for the first time and emitted a ghost '3′ run' count-up INSTEAD of detectActivityInterval's correct 3′/1′ ×5 — strictly worse than the missing clock the widening set out to fix, and the `activity-fallback` branch went to zero hits. Hence the second anti-double-count: a standalone REST line carrying its own duration means this line is the WORK half of an interval, not a block duration. Deliberately narrow — an on/off spec carrying its OWN durations ('3 sets of 30 sec on 10 sec off') does not claim the line, so leading_duration_behind_labels keeps its 6′ clock. The harness caught this; nothing else would have.",
    expectTimers: ["7′ lat and quad mobilit for front squat"],
    forbidTimers: ["600′ run x 1", "1′ lat and quad mobilit for front squat"],
    rows: [["", "WOD"],
           ["", "warmup -\n600 run x 1\n7 min lat and quad mobilit for front squat"]] },
];

// ─────────────────────────────────────────────────────────────────────────
// Badge assertions — a TRUE correctness guard (not just change-detection).
// parseLine() is the per-line classifier that decides the teal station badge.
// Regression fixed 2026-07-04: a station line ("A2.") that mentions a format
// keyword ("Metcon") was mis-classified as an instruction and lost its badge.
//   group-badge    = A/B/C group letters (e.g. "A.")
//   subgroup-badge = A1/B2 sub-stations  (e.g. "A1", "A2.")
//   none           = plain line / instruction (must NOT get a station badge)
// ─────────────────────────────────────────────────────────────────────────
const BADGE_CHECKS = [
  { line: "A. Deadlift Prog-8 min", expect: "group-badge" },
  { line: "A1 Lift Drop Reset (For Strength)", expect: "subgroup-badge" },
  { line: "A2. T&GO (For Metcon)", expect: "subgroup-badge" },   // the fixed case
  { line: "B2. AMRAP style set", expect: "subgroup-badge" },      // station + keyword
  { line: "E2MOM x 6", expect: "none" },                          // instruction, NOT a station
  { line: "e2momx", expect: "none" },                             // dangling-x shorthand → still an instruction
  { line: "AMRAP 12", expect: "none" },                           // pure instruction
  { line: "Set 1: 5 Reps", expect: "group-badge" },               // per-set lift wave → SET badge
  { line: "Set 3: 1 Rep", expect: "group-badge" },                // singular "Rep" too
  { line: "Set up the platform", expect: "none" },                // prose, not a set (no digit after "set")
  { line: "partner 2: max reps:", expect: "group-badge" },        // team-WOD partner → PARTNER badge
  { line: "1 partner: 12 cal", expect: "group-badge" },           // number-first form, same badge
  { line: "partner 3: plank hold", expect: "group-badge" },       // no colon, still a partner
  { line: "partnership drill", expect: "none" },                  // prose, not a partner (\\b guard)
  { line: "#1", expect: "station" },                              // hash-first station marker (coach's 2026-07-19 sheet)
  { line: "#2", expect: "station" },                              // hash-first station marker
  { line: "1#", expect: "station" },                              // number-first still works
  { line: "2+3#", expect: "station" },                            // merged station still works
  { line: "12 Pike Leg Lifts", expect: "none" },                  // a leading rep count is NOT a station (no #)
  { line: "rx+ 4000 m run", expect: "rx" },                       // inline RX+ scaling marker → blue rx-badge (coach's 2026-07-27 sheet)
  { line: "800 m run rx", expect: "rx" },                         // bare "rx" as a standalone word, any position
  { line: "prx machine work", expect: "none" },                   // "rx" inside a word must NOT badge (\brx\b guard)
];

// ─────────────────────────────────────────────────────────────────────────
// Station-number category consistency — a WITHIN-category correctness guard.
// The red/orange/cyan badge split is intentional and must never be flattened
// (see memory: badge colours are semantic). What IS a bug is four SIBLING
// station markers rendering in different categories. On the coach's 2026-08-04
// CARDIO cell, "1.", "3.", "4." were red time-badges on white exercise lines
// while "2. amrap :" became an all-orange sub-header — the trailing ":" (and
// the AMRAP keyword) hijacked the line before it got its number badge, exactly
// like the "A1. 4 Sets Of:" bug fixed in d656ec4.
// Every line in a group must resolve to the SAME parseLine type AND carry the
// leading red "N." badge.
// ─────────────────────────────────────────────────────────────────────────
const STATION_CATEGORY_GROUPS = [
  { name: "cardio 1./2./3./4. (coach 2026-08-04)",
    lines: ["1. 600 m row+", "2. amrap :", "3. 600 run+", "4. 20 v-ups"] },
  { name: "numbered station + trailing colon / format keyword",
    lines: ["1. 400 meter run", "2. for time:", "3) tabata", "4. 30 cal row"] },
];

const stable = (o) => JSON.stringify(o, null, 2);
function firstDiff(a, b) {
  const la = a.split("\n"), lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++)
    if (la[i] !== lb[i]) return `  line ${i + 1}:\n    golden: ${la[i] ?? "(none)"}\n    actual: ${lb[i] ?? "(none)"}`;
  return "  (whitespace-only difference)";
}

const browser = await chromium.launch();
const context = await browser.newContext();
await context.route("**/*", (r) => (r.request().url().startsWith("file:") ? r.continue() : r.abort()));

// ── Badge assertion pass (correctness guard) ──
const badgeFails = [];
const stationCatFails = [];
{
  const page = await context.newPage();
  await page.goto(INDEX, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.parseLine === "function", { timeout: 8000 });
  const got = await page.evaluate((checks) =>
    checks.map((c) => {
      const html = (window.parseLine(c.line) || {}).html || "";
      // A station marker ("1#", "#1", "2+3#") gets the orange rep-number badge;
      // it's distinguished from a plain leading rep count ("12 reps", also
      // rep-number) by the "#" inside the span.
      if (/rep-number">[^<]*#/.test(html)) return { line: c.line, expect: c.expect, actual: "station" };
      // The inline Rx/Rx+ scaling marker gets its own blue rx-badge span.
      if (/rx-badge/.test(html)) return { line: c.line, expect: c.expect, actual: "rx" };
      const m = html.match(/(group-badge|subgroup-badge)/);
      return { line: c.line, expect: c.expect, actual: m ? m[1] : "none" };
    }), BADGE_CHECKS);
  for (const g of got) if (g.actual !== g.expect) badgeFails.push(g);

  // ── Station-number category consistency (within-category guard) ──
  const catGot = await page.evaluate((groups) =>
    groups.map((g) => ({
      name: g.name,
      rows: g.lines.map((line) => {
        const p = window.parseLine(line) || {};
        return {
          line,
          type: p.type,
          // the leading red "N." badge every sibling must carry
          numBadge: /^<span class="time-badge">\d+\.<\/span>/.test(p.html || ""),
        };
      }),
    })), STATION_CATEGORY_GROUPS);
  for (const g of catGot) {
    const types = [...new Set(g.rows.map((r) => r.type))];
    if (types.length > 1)
      stationCatFails.push(`${g.name}: siblings landed in different categories → ` +
        g.rows.map((r) => `"${r.line}"=${r.type}`).join(", "));
    const noBadge = g.rows.filter((r) => !r.numBadge).map((r) => `"${r.line}"`);
    if (noBadge.length)
      stationCatFails.push(`${g.name}: missing the leading red "N." badge → ${noBadge.join(", ")}`);
  }
  await page.close();
}

// ── Layout assertion pass (group cohesion — a TRUE correctness guard) ──
// The parse/timer goldens don't see the newspaper-column split, so this pass
// renders a fixture and inspects the actual columns. Guards the 2026-07-08 bug:
// a single A. group (A1/A2 sub-stations + detail lines) must stay ONE atomic
// column — never torn A1|A2 across two columns — and an inline `@75%` load must
// stay on its line.
const layoutFails = [];
{
  const benchRows = FIXTURES.find((f) => f.name === "superset_group_cohesion").rows;
  const page = await context.newPage();
  await page.goto(INDEX, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => typeof window.parseAppsScriptData === "function" && typeof window.renderWorkout === "function",
    { timeout: 8000 }
  );
  const blocks = await page.evaluate((rows) => {
    window.renderWorkout(window.parseAppsScriptData(rows));
    const area = document.getElementById("wodArea");
    const txt = (el) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const out = [];
    area.querySelectorAll(".flow-span, .flow-col.part-block").forEach((block) => {
      const hdr = block.querySelector(".flow-section-header");
      const cols = block.querySelectorAll(".flow-col");
      const rec = { header: hdr ? txt(hdr) : null, cols: [] };
      if (cols.length) cols.forEach((c) => rec.cols.push([...c.querySelectorAll(".exercise-line")].map(txt)));
      else rec.cols.push([...block.querySelectorAll(".exercise-line")].map(txt));
      out.push(rec);
    });
    return out;
  }, benchRows);
  await page.close();

  const p2 = blocks.find((b) => b.header === "2");
  if (!p2) layoutFails.push("part '2' block not rendered");
  else {
    if (p2.cols.length !== 1) layoutFails.push(`part '2' split into ${p2.cols.length} columns — superset torn`);
    const a1col = p2.cols.find((c) => c.some((l) => /A1\b/.test(l)));
    if (a1col && !a1col.some((l) => /A2\b/.test(l))) layoutFails.push("A1 and A2 landed in different columns");
    const flat = p2.cols.flat();
    if (flat.some((l) => l.trim() === "75%")) layoutFails.push("'75%' split onto its own line — inline @load torn");
    if (!flat.some((l) => /6 reps @?75%/.test(l))) layoutFails.push("'x 6 reps @75%' not kept as one line");
  }
}

// Detection-branch coverage, accumulated across every fixture.
const PATH_IDS = new Set();
const INVENTED = [];
const PATH_HITS = {};

const results = [];
for (const fx of FIXTURES) {
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).split("\n")[0]));
  try {
    await page.goto(INDEX, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => typeof window.parseAppsScriptData === "function" && typeof window.extractTimerConfigs === "function",
      { timeout: 8000 }
    );
    const parsed = await page.evaluate((rows) => {
      const data = window.parseAppsScriptData(rows);
      const timers = [];
      for (const row of data.rows) {
        // Part-level cap — the SAME scan production does (renderWorkout): a
        // "t.c N" the coach writes for one block. partCapHints returns a
        // PER-CELL array — a cap propagates to a sibling cell ONLY when it sits
        // alone in a pure-notes cell AND exactly one capless work block can
        // receive it; otherwise it stays local to its own block. Indexed by
        // row.cells, so cell i gets capHints[i].
        const capHints = window.partCapHints(row.cells);
        for (let i = 0; i < row.cells.length; i++) {
          const cell = row.cells[i];
          timers.push({
            section: row.label, header: cell.header,
            // header passed too — production (renderWorkout ~4823) scans the
            // cell header for a time-cap the coach wrote as the header itself
            timers: (window.extractTimerConfigs(cell.lines, cell.header, capHints[i]) || []).map((c) => ({ label: c.label, type: c.type })),
          });
        }
      }
      // ── Parse report (shadow channel) ──
      // Built from the RAW cell text, BEFORE parseAppsScriptData's splits, so
      // it audits preprocessing too — today's bug destroyed the information in
      // the part-splitter, downstream of any line-level check.
      // Map parsed-cell index → RAW spreadsheet column. The fixture rows carry
      // label/notes columns that parseAppsScriptData drops, so cell i is NOT
      // raw column i+1 — walk the header row and match data.headers in order.
      const colOf = [];
      {
        let hi = 0;
        for (let c = 0; c < (rows[0] || []).length && hi < data.headers.length; c++) {
          if (String(rows[0][c] ?? "").trim() === String(data.headers[hi] ?? "").trim()) { colOf[hi] = c; hi++; }
        }
      }
      const reports = [];
      for (let ri = 0; ri < data.rows.length; ri++) {
        const row = data.rows[ri];
        const capHints = window.partCapHints(row.cells);
        for (let i = 0; i < row.cells.length; i++) {
          const col = colOf[i];
          const raw = col === undefined ? null : (rows[ri + 1] || [])[col];
          if (!raw || !String(raw).trim()) continue;
          const cfgs = window.extractTimerConfigs(row.cells[i].lines, row.cells[i].header, capHints[i]) || [];
          const rep = window.timerParseReport(raw, cfgs);
          if (rep.unexplained.length || rep.dark || rep.invented.length) {
            reports.push({ cell: `row${ri + 1}/${row.cells[i].header}`, dark: rep.dark,
                           got: cfgs.map((c) => c.label),
                           invented: rep.invented,
                           unexplained: rep.unexplained.map((f) => f.token.trim()) });
          }
        }
      }
      return { data, timers, reports,
               pathHits: window.timerPathHits ? window.timerPathHits() : null,
               pathIds:  window.timerPathIds  ? window.timerPathIds()  : null };
    }, fx.rows);

    // Accumulate detection-branch coverage across fixtures (each fixture runs
    // in a fresh page, so the counters reset per fixture).
    if (parsed.pathIds) {
      for (const id of parsed.pathIds) PATH_IDS.add(id);
      for (const [id, n] of Object.entries(parsed.pathHits || {})) {
        PATH_HITS[id] = (PATH_HITS[id] || 0) + n;
      }
    }
    // Which fixtures still depend on the `|| 5` GUESS. Reported, not failed:
    // the point is to measure before deleting it, not to force the issue.
    for (const r of parsed.reports || []) {
      for (const label of r.invented || []) INVENTED.push(`${fx.name} · ${r.cell} → ${label}`);
    }

    // ── Unexplained-facts assertion ──
    // Every duration/cap the coach WROTE must reach some clock, or be listed in
    // the fixture's `ignoreFacts` as a deliberate non-detection. This is the
    // property that makes a silent parse failure impossible to ship: `[]` is
    // still the right output when she wrote nothing, but it is now an ERROR
    // when she wrote a number nothing consumed.
    {
      const allow = new Set(fx.ignoreFacts || []);
      // `dark` is an ANNOTATION on the failure, not a trigger of its own: with
      // no configs every fact is unexplained, so a genuinely dark cell always
      // has entries left after the allow-list. Triggering on `dark` separately
      // would make ignoreFacts unable to silence the very case it describes.
      const bad = (parsed.reports || [])
        .map((r) => ({ ...r, unexplained: r.unexplained.filter((t) => !allow.has(t)) }))
        .filter((r) => r.unexplained.length);
      if (bad.length) {
        results.push({ name: fx.name, status: "ERROR",
          error: `unexplained written timing — ${bad.map((r) =>
            `${r.cell}${r.dark ? " [DARK: duration written, NO timer]" : ""}: ${r.unexplained.join(", ")}`
            + ` {got: ${r.got.join(" | ") || "—"}}`).join(" ; ")}`
            + ` (add to fixture.ignoreFacts only if the miss is INTENDED)` });
        continue;
      }
    }

    // Optional TRUE correctness assertion (beyond golden change-detection):
    // fixture.expectTimers = labels that MUST be among the detected timers.
    // Guards against --update silently baking a wrong result into the golden.
    if (fx.expectTimers || fx.forbidTimers) {
      const allLabels = parsed.timers.flatMap((t) => t.timers.map((x) => x.label));
      const missing = (fx.expectTimers || []).filter((l) => !allLabels.includes(l));
      // forbidTimers = labels that MUST NOT appear (the cross-cell cap-LEAK
      // guard: a cap written for one block must not spawn "(TC N′)" on a sibling).
      const leaked = (fx.forbidTimers || []).filter((l) => allLabels.includes(l));
      if (missing.length || leaked.length) {
        const parts = [];
        if (missing.length) parts.push(`missing: ${missing.join(" | ")}`);
        if (leaked.length) parts.push(`FORBIDDEN present: ${leaked.join(" | ")}`);
        results.push({ name: fx.name, status: "ERROR",
                       error: `${parts.join("; ")} — detected: [${allLabels.join(" | ")}]` });
        continue; // finally still closes the page
      }
    }

    const goldenPath = path.join(GOLDEN_DIR, `${fx.name}.json`);
    // `reports` is the shadow audit channel, NOT part of the parsed contract —
    // keep it out of the golden so it can never be silently `--update`d into a
    // baseline (its whole job is to be asserted on, above).
    const { reports: _rep, pathHits: _ph, pathIds: _pi, ...snapshot } = parsed;
    const actual = stable(snapshot);
    if (UPDATE || !fs.existsSync(goldenPath)) {
      fs.writeFileSync(goldenPath, actual, "utf8");
      results.push({ name: fx.name, status: UPDATE ? "UPDATED" : "NEW" });
    } else {
      const golden = fs.readFileSync(goldenPath, "utf8");
      if (golden === actual) results.push({ name: fx.name, status: "PASS" });
      else {
        const ap = path.join(GOLDEN_DIR, `${fx.name}.actual.json`);
        fs.writeFileSync(ap, actual, "utf8");
        results.push({ name: fx.name, status: "DIFF", diff: firstDiff(golden, actual), actualPath: ap });
      }
    }
    if (errs.length) results[results.length - 1].pageErrors = errs.slice(0, 2);
  } catch (err) {
    results.push({ name: fx.name, status: "ERROR", error: String(err).split("\n")[0] });
  } finally {
    await page.close();
  }
}
await browser.close();

console.log("\nWOD parser/timer verify\n" + "─".repeat(46));
let pass = 0, diff = 0, other = 0;
for (const r of results) {
  const icon = { PASS: "✅", DIFF: "🔶", ERROR: "❌" }[r.status] || "🆕";
  console.log(`${icon} ${r.name.padEnd(24)} ${r.status}`);
  if (r.diff) console.log(r.diff);
  if (r.error) console.log("    " + r.error);
  if (r.actualPath) console.log("    actual → " + path.relative(ROOT, r.actualPath));
  if (r.pageErrors) console.log("    ⚠ " + r.pageErrors.join(" | "));
  r.status === "PASS" ? pass++ : r.status === "DIFF" ? diff++ : other++;
}
console.log("─".repeat(46));
console.log(`${pass} pass · ${diff} diff · ${other} new/updated/error`);

console.log("\nStation-badge assertions");
if (badgeFails.length === 0) {
  console.log(`✅ all ${BADGE_CHECKS.length} badge checks pass`);
} else {
  for (const f of badgeFails)
    console.log(`❌ "${f.line}"  expected ${f.expect}, got ${f.actual}`);
}

console.log("\nStation-number category consistency");
if (stationCatFails.length === 0) {
  console.log(`✅ all ${STATION_CATEGORY_GROUPS.length} sibling groups render in one category with the red "N." badge`);
} else {
  for (const f of stationCatFails) console.log(`❌ ${f}`);
}

console.log("\nLayout assertions (group cohesion)");
if (layoutFails.length === 0) {
  console.log("✅ superset stays one atomic column; inline @load intact");
} else {
  for (const f of layoutFails) console.log(`❌ ${f}`);
}

// ── Detection-branch coverage ──
// An unexercised branch is indistinguishable from a working one; the in-cell
// part split was dark for months and cost the coach two clocks. A branch with
// 0 hits is a FAILURE, not a note: either write a fixture for it or delete it.
console.log("\nDetection-branch coverage");
const darkPaths = [...PATH_IDS].filter((id) => !PATH_HITS[id]);
if (darkPaths.length === 0) {
  console.log(`✅ all ${PATH_IDS.size} branches exercised — ` +
    [...PATH_IDS].map((id) => `${id}:${PATH_HITS[id]}`).join("  "));
} else {
  console.log(`❌ NO fixture exercises: ${darkPaths.join(", ")} — add one, or remove the dead branch`);
}

// ── Invented values still in the pipeline ──
// Reported, never failed. `rounds = … || 5` is the last guess left, and it
// cannot be deleted blind — that would silently turn working clocks into NO
// clock. This line says which fixtures depend on it; the live board records
// real firings to localStorage['wodboard-invented']. Decide from the data.
console.log("\nInvented values (measure before deleting — see TIMER_ROADMAP.md §5)");
if (INVENTED.length === 0) {
  console.log("✅ no fixture depends on the `|| 5` round guess");
} else {
  for (const s of INVENTED) console.log(`⚠️  ${s}`);
}

if (diff) console.log("\nReview each DIFF: if the change was intended, re-run with --update to accept it.");
process.exit(diff > 0 || badgeFails.length > 0 || stationCatFails.length > 0 || layoutFails.length > 0 || darkPaths.length > 0 || results.some((r) => r.status === "ERROR") ? 1 : 0);
