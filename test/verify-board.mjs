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
  { name: "activity_interval", note: "coach interval style '3 min run / 1 min rest ×5'",
    rows: [["", "CARDIO"], ["ריצה", "5 sets\n3 min run\n1 min rest"]] },
  { name: "long_section_widows", note: "long single section → newspaper column split + widow guards",
    rows: [["", "WOD"], ["חימום", "Warm up\n1. 10 Hip 90-90\n2. 10 Arm Circles\n3. 10 Air Squats\n4. 10 Inchworm\n5. 10 Scap Pull-ups\nA. 3 sets of:\n10 Goblet Squat\n10 Ring Row\n10 Push-up\nB. 3 sets of:\n8 Deadlift\n8 Strict Press\nAMRAP 15\n5 Pull-ups\n10 Push-ups\n15 Air Squats"]] },
  { name: "station_labels_with_keywords", note: "A. group + A1/A2. stations keep teal badge even when the line mentions Metcon/For Time",
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
  { name: "cap_no_leak_two_work_blocks", note: "cap-LEAK guard (2026-07-27, coach-flagged): a part with TWO independent work blocks, each with its OWN timing. 'Strength:' carries its own 'front squat / 10 min tc / 4 sets…' — the cap belongs to Strength ONLY. 'B Accessories: for time' is a SEPARATE block with NO cap. The old scan applied the first cap it found to EVERY cell → Accessories wrongly read 'For Time (TC 10′)'. partCapHints fixes this: the 10-min cap's own cell ('Strength') has real work content (not a pure-notes cell) → it is NOT an orphan cap → it never propagates. Strength keeps its local TC 10′; Accessories stays a bare 'For Time'. forbidTimers locks the leak shut.",
    expectTimers: ["TC 10′", "For Time"],
    forbidTimers: ["For Time (TC 10′)"],
    rows: [["", "Strength:", "B Accessories:"],
           ["", "front squat\n10 min tc\n4 sets of 4 reps of 1.5 front squat", "for time:\n50 burpees\n50 pull ups"]] },
  { name: "cap_local_fortime_plus_amrap", note: "cap-LEAK guard, sibling case (2026-07-27): a For-Time block writes its OWN cap IN ITS OWN cell ('for time: / 21-15-9 thrusters / t.c 8') next to a separate 'amrap 5:' block. The t.c 8 sits in a cell with real work content → not an orphan → stays local (For Time (TC 8′)); it must NOT bleed onto the AMRAP. AMRAP keeps its own 5′. Confirms the fix leaves same-cell caps untouched while blocking cross-cell leaks.",
    expectTimers: ["For Time (TC 8′)", "AMRAP 5′"],
    forbidTimers: ["AMRAP 5′ (TC 8′)", "AMRAP (TC 8′)"],
    rows: [["", "Metcon:", "Finisher:"],
           ["", "for time:\n21-15-9 thrusters\nt.c 8", "amrap 5:\nmax cal bike"]] },
  { name: "minutes_on_off_intervals", note: "coach's real sheet (2026-08-03, VERBATIM from getWorkoutSheet — 3 columns, headers '1'/'2'/'3'): the Metcon cell leads with 'Metcon:' and then '4 min on 1 min off x 4' over 4 numbered stations → NO timer at all on the gym TV. Two work/rest patterns already existed and the coach wrote the gap between them: the timeline pattern (~2620) accepts MINUTE units but only the literal words work/rest; the regex fallback (~2944) accepts on/off but only SECONDS ('30 sec on 10 sec off'). 'min' + 'on/off' matched neither. Nor did anything else fire: no AMRAP/EMOM/every/tabata/for-time keyword, no t.c cap, and the 'leading standalone block duration' fallback needs the FIRST content line to lead with 'N min' — here it is 'Metcon:', so even the (wrong) 4-minute count-up never appeared. Total silent loss of the clock, same shape as the EVEY typo. Fix: the fallback's unit group now accepts min/minutes/m as well as sec/seconds/s INDEPENDENTLY on each side, converts to seconds, and labels via fmtDur → '4′/1′ ×4'. The written 'x 4' is the round count: 4×(4+1) = 20′. Col 1 locks the SECOND bug on the same board: it reads 'warm up tabata' + '3 sets of 30 seconds on 10 seconds off pause squat'. The bare 'tabata' keyword used to fire FIRST with the classic 20/10 ×8 default, and the custom-interval block was then skipped by the `!results.some(type==='tabata')` guard — so the GUESSED 20/10 ×8 replaced her WRITTEN 30/10 ×3 (a live no-invented-timer-values violation). The keyword default is now a LAST resort, after the custom/single-line/chained paths; when she did write values the keyword only NAMES the block → 'Tabata 30″/10″ ×3'. `forbidTimers: ['Tabata']` locks the bare default out of this sheet. The ×3 comes from a narrow 'N sets OF <the work/rest spec>' rule that only fires when the count sits on the SAME LINE as the interval — a bare 'N sets' on its own line above a station list stays ROTATION semantics (sets × stations), untouched: superset_group_cohesion still yields 30″/10″ ×3 from its station count, not ×2 from its 'warm up : 2 sets' line.",
    expectTimers: ["4′/1′ ×4", "Tabata 30″/10″ ×3"],
    forbidTimers: ["Tabata"],
    rows: [[" b", "", "1", "2", "3", "בטיחות/דגשים"],
           ["", "WOD",
            "warm up tabata\nwarmup:\n6 min leg mobility \n3 sets of 30 seconds on 10 seconds off pause squat\n\n",
            "Strength: \nback squat \n5 sets of 5 reps @75%\n\n         \n",
            "Metcon:\n4 min on 1 min off x 4\n1. 400 meter run +  max wallballs\n2. 30 t2b+ max sit ups\n3. 20 alternating dumbell snatch + max box jump in remaining time \n4. 30.20 cal row - max burpees in remaining time \n",
            ""]] },
  { name: "seconds_on_off_unchanged", note: "regression guard for the minutes_on_off fix: the classic seconds form '30 sec on 10 sec off x 8' must keep parsing exactly as before (30″/10″ ×8). Locks that widening the unit group to minutes did not change the seconds path — the old label hardcoded ″, the new one goes through fmtDur, which must still render ″ for sub-minute values.",
    expectTimers: ["30″/10″ ×8"],
    rows: [["", "WOD"],
           ["", "30 sec on 10 sec off x 8\nmax cal bike"]] },
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
      return { data, timers };
    }, fx.rows);

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
    const actual = stable(parsed);
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

console.log("\nLayout assertions (group cohesion)");
if (layoutFails.length === 0) {
  console.log("✅ superset stays one atomic column; inline @load intact");
} else {
  for (const f of layoutFails) console.log(`❌ ${f}`);
}

if (diff) console.log("\nReview each DIFF: if the change was intended, re-run with --update to accept it.");
process.exit(diff > 0 || badgeFails.length > 0 || layoutFails.length > 0 || results.some((r) => r.status === "ERROR") ? 1 : 0);
