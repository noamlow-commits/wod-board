// test/equivalence.mjs — SAME MEANING ⇒ SAME RESULT (added 2026-10-01).
//
// Why this exists: on 2026-10-01 both suites were green while ~56 root causes
// made one meaning resolve differently depending on how it was written
// ("EMOM 1:30" → 1′, "AMRAP 150 sec" → 150′, "work: 40 sec" painted as a rep
// count). Goldens lock what was FIXED; nothing locked its SIBLINGS. This suite
// runs the real page functions over equivalence classes and asserts:
//
//   1. TIMERS   — every variant of a class yields the class's expected clock
//                 (signature subset of the PRIMARY config).
//   2. AGREE    — display ⇄ detection: every duration the fact channel reads in
//                 a line sits inside a red time-badge, and every red badge that
//                 carries a number is a duration the fact channel reads
//                 (TIMER_ROADMAP §4 cause #7, both directions).
//   3. CATEGORY — lines of one display group render in ONE category (parseLine
//                 type + leading marker badge).
//
// Today's divergences live in test/equivalence-known.mjs, each with a reason
// (audit id). The list is a RATCHET: an unlisted divergence fails the run
// (regression), and a listed one that now passes ALSO fails the run ("promote
// it: delete the entry") — so the list can only shrink, never silently rot.
// `--baseline` prints every current divergence as JSON (for curating the list).
//
// Run: node test/equivalence.mjs  (Playwright path as in verify-board.mjs)
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import { CLASSES, DISPLAY } from "./equivalence-classes.mjs";
import { KNOWN } from "./equivalence-known.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(path.join(os.homedir(), "claude-office-skills/node_modules/playwright"));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const INDEX = pathToFileURL(path.join(ROOT, "index.html")).href;
const BASELINE = process.argv.includes("--baseline");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("**/*", (r) => (r.request().url().startsWith("file:") ? r.continue() : r.abort()));
await page.goto(INDEX, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => typeof window.extractTimerConfigs === "function" && typeof window.parseLine === "function");

// ── 1. TIMERS ──────────────────────────────────────────────────────────────
const timerRuns = await page.evaluate((classes) => {
  const sig = (c) => {
    if (!c) return null;
    let total = 0;
    if (Array.isArray(c.phases) && c.phases.length) total = c.phases.reduce((t, p) => t + (p.seconds || 0), 0);
    else if (c.type === "tabata") {
      const r = c.rounds || 0, rest = c.restSeconds || 0;
      total = (c.workSeconds || 0) * r + rest * (c.skipLastRest ? Math.max(0, r - 1) : r);
    } else if (c.type === "fortime") total = c.capSeconds || 0;
    else total = c.totalSeconds || 0;
    return { type: c.type, total, interval: c.intervalSeconds || 0, work: c.workSeconds || 0,
             rest: c.restSeconds || 0, rounds: c.rounds || 0, cap: c.capSeconds || 0, label: c.label };
  };
  const out = [];
  for (const k of classes) {
    for (const text of k.variants) {
      const data = window.parseAppsScriptData([["", "WOD"], ["", text]]);
      const cell = data.rows[0] && data.rows[0].cells[0];
      const cfgs = cell ? (window.extractTimerConfigs(cell.lines, cell.header) || []) : [];
      const rep = window.timerParseReport(text, cfgs);
      const got = sig(cfgs[0]);
      const bad = [];
      for (const [f, want] of Object.entries(k.expect || {})) {
        if (f === "nconfigs") { if (cfgs.length !== want) bad.push(`${cfgs.length} clocks, want ${want}`); continue; }
        if (!got) { bad.push("no clock"); break; }
        if (got[f] !== want) bad.push(`${f} ${got[f]} ≠ ${want}`);
      }
      out.push({ cls: k.id, text, ok: bad.length === 0, bad, labels: cfgs.map((c) => c.label),
                 silent: bad.length > 0 && rep.unexplained.length === 0 });
    }
  }
  return out;
}, CLASSES);

// ── 2 & 3. DISPLAY ─────────────────────────────────────────────────────────
const dispRuns = await page.evaluate((groups) => {
  const num = (s) => { const m = String(s).match(/\d+(?:[.:,]\d+)?/); return m ? m[0] : null; };
  const capNum = (s) => {
    const m = String(s).match(/t\.?\s*c[\-\s:]*(\d+(?:[.:]\d+)?)/i) || String(s).match(/(\d+(?:[.:]\d+)?)\s*(?:min\w*\s*)?t\.?\s*c/i);
    return m ? m[1] : null;
  };
  const out = [];
  for (const g of groups) {
    for (const line of g.lines) {
      const p = window.parseLine(line) || {};
      const html = p.html || "";
      const badges = [...html.matchAll(/<span class="time-badge">([^<]*)<\/span>/g)].map((m) => m[1]);
      const facts = window.extractTimingFacts(line)
        .filter((f) => !f.ignored && f.seconds > 0 && (f.kind === "duration" || f.kind === "cap"));
      const factNums = facts.map((f) => (f.kind === "cap" ? capNum(f.token) : num(f.token))).filter(Boolean);
      const unbadged = factNums.filter((n) => !badges.some((b) => b.includes(n)));
      const orphan = badges.filter((b) => /\d/.test(b) && !factNums.some((n) => b.includes(n)));
      const lead = html.match(/^\s*<span class="([a-z-]+)"/);
      const category = `${p.type || "?"}|${lead ? lead[1] : "-"}`;
      out.push({ group: g.id, line, category, unbadged, orphan, badges });
    }
  }
  return out;
}, DISPLAY);
await browser.close();

// ── Compare with the ratchet ───────────────────────────────────────────────
const current = { timers: {}, agree: {}, category: {} };
for (const r of timerRuns) if (!r.ok) (current.timers[r.cls] ||= {})[r.text] =
  `${r.silent ? "SILENT " : ""}${r.bad.join("; ")} [${r.labels.join(" | ") || "—"}]`;
for (const r of dispRuns) {
  const why = [];
  if (r.unbadged.length) why.push(`read but not badged: ${r.unbadged.join(", ")}`);
  if (r.orphan.length) why.push(`badged but not read: ${r.orphan.join(", ")}`);
  if (why.length) (current.agree[r.group] ||= {})[r.line] = why.join("; ");
}
for (const g of DISPLAY) {
  const mode = g.check || "full";
  if (mode === "none") continue;
  const key = (c) => (mode === "type" ? c.split("|")[0] : c);
  const rows = dispRuns.filter((r) => r.group === g.id);
  const want = key(rows[0].category);
  for (const r of rows) if (key(r.category) !== want) (current.category[g.id] ||= {})[r.line] = `${key(r.category)} ≠ ${want}`;
}

if (BASELINE) { console.log(JSON.stringify(current, null, 2)); process.exit(0); }

const regressions = [], promoted = [];
for (const kind of ["timers", "agree", "category"]) {
  const cur = current[kind], known = KNOWN[kind] || {};
  for (const [grp, items] of Object.entries(cur))
    for (const [k, why] of Object.entries(items))
      if (!(known[grp] && k in known[grp])) regressions.push(`${kind} · ${grp} · "${k.replace(/\n/g, " / ")}" → ${why}`);
  for (const [grp, items] of Object.entries(known))
    for (const k of Object.keys(items))
      if (!(cur[grp] && k in cur[grp])) promoted.push(`${kind} · ${grp} · "${k.replace(/\n/g, " / ")}"`);
}

const count = (o) => Object.values(o).reduce((a, x) => a + Object.keys(x).length, 0);
const tOk = timerRuns.filter((r) => r.ok).length;
console.log("\nWOD equivalence — same meaning ⇒ same result\n" + "─".repeat(46));
console.log(`timers   ${tOk}/${timerRuns.length} variants match their class · ${count(current.timers)} known divergences (${timerRuns.filter((r) => !r.ok && r.silent).length} silent)`);
console.log(`agree    ${dispRuns.length - count(current.agree)}/${dispRuns.length} lines: display ⇄ detection agree · ${count(current.agree)} known`);
console.log(`category ${dispRuns.length - count(current.category)}/${dispRuns.length} lines in their group's category · ${count(current.category)} known`);
for (const s of regressions) console.log(`❌ NEW divergence  ${s}`);
for (const s of promoted) console.log(`🎉 now passes — delete it from test/equivalence-known.mjs: ${s}`);
if (!regressions.length && !promoted.length) console.log("✅ no new divergence; the known list is exact");
process.exit(regressions.length || promoted.length ? 1 : 0);
