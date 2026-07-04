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
  { line: "AMRAP 12", expect: "none" },                           // pure instruction
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
      const m = html.match(/(group-badge|subgroup-badge)/);
      return { line: c.line, expect: c.expect, actual: m ? m[1] : "none" };
    }), BADGE_CHECKS);
  for (const g of got) if (g.actual !== g.expect) badgeFails.push(g);
  await page.close();
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
      for (const row of data.rows)
        for (const cell of row.cells)
          timers.push({
            section: row.label, header: cell.header,
            timers: (window.extractTimerConfigs(cell.lines) || []).map((c) => ({ label: c.label, type: c.type })),
          });
      return { data, timers };
    }, fx.rows);

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

if (diff) console.log("\nReview each DIFF: if the change was intended, re-run with --update to accept it.");
process.exit(diff > 0 || badgeFails.length > 0 || results.some((r) => r.status === "ERROR") ? 1 : 0);
