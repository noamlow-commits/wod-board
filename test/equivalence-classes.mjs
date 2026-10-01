// Equivalence classes for test/equivalence.mjs — one MEANING, written many ways.
// Seeded 2026-10-01 from the audit's sweep (memory/project_audit_2026-10-01.md).
// Each variant is a FULL cell (one cell in a one-row sheet). `expect` is the
// subset of the PRIMARY clock's signature every variant must match.
// To add a shape: add its variants here, ALSO alone in a cell where it makes
// sense (test/README.md), and run `node test/equivalence.mjs`.
// Equivalence classes. Each variant is a FULL cell text (one cell in a one-row sheet).
// expect: subset of the normalized clock signature that the PRIMARY (first) config must match.
//   null  = the meaning has no clock (display-only class)
const EX = "\n10 burpees\n10 wall balls";
const FT = (cap) => `For Time\n21-15-9\nthrusters\npull ups\n${cap}`;

export const CLASSES = [];
const add = (id, title, expect, variants, opts = {}) => CLASSES.push({ id, title, expect, variants, ...opts });

// ── AMRAP 12 ──
add("amrap12", "AMRAP 12 minutes", { type: "amrap", total: 720 },
  ["AMRAP 12", "amrap 12", "AMRAP 12 min", "AMRAP 12 mins", "AMRAP 12 minutes", "12 min AMRAP", "12' AMRAP", "12′ AMRAP",
   "AMRAP 12:", "AMRAP: 12", "AMRAP - 12", "AMRAP 12:00", "AMRAP 12 min:", "amrap 12 דקות", "12 דקות AMRAP",
   "AMRAP 12 דק׳", "AMRAP של 12 דקות", "12 minute AMRAP", "AMRAP (12 min)", "AMRAP x 12 min", "AMRAP12"
  ].map(v => v + EX));
add("amrap12_5", "AMRAP 12.5 minutes (12:30)", { type: "amrap", total: 750 },
  ["AMRAP 12.5", "AMRAP 12.5 min", "AMRAP 12,5 min", "AMRAP 12:30", "12.5 min AMRAP", "12:30 AMRAP", "amrap 12.5 דקות"].map(v => v + EX));

// ── Time cap 14 on a For Time ──
add("tc14", "For Time, time cap 14 min", { type: "fortime", cap: 840 },
  ["t.c 14", "tc 14", "TC: 14", "TC 14", "T.C. 14", "14 min tc", "14 min TC", "time cap 14", "TIME CAP: 14 min", "cap 14", "cap: 14 min",
   "T.C 14:00", "tc 14 min", "14 דקות tc", "tc 14 דקות", "(tc 14)", "TC-14", "14' tc", "14:00 tc"].map(v => FT(v)));
add("tc14_inline", "For Time with the cap on the header line", { type: "fortime", cap: 840 },
  ["For Time (tc 14)\n21-15-9\nthrusters\npull ups", "For Time - TC 14\n21-15-9\nthrusters\npull ups",
   "For Time, 14 min cap\n21-15-9\nthrusters\npull ups", "For Time (14 min TC)\n21-15-9\nthrusters\npull ups",
   "For Time: t.c 14\n21-15-9\nthrusters\npull ups", "For Time (time cap 14)\n21-15-9\nthrusters\npull ups",
   "For Time (cap 14)\n21-15-9\nthrusters\npull ups", "21-15-9 for time (tc 14)\nthrusters\npull ups"]);

// ── EMOM 10 ──
add("emom10", "EMOM 10 (1:00 x 10)", { type: "emom", interval: 60, total: 600 },
  ["EMOM 10", "emom 10 min", "EMOM 10 mins", "EMOM x10", "EMOM 10:", "EMOM: 10", "10 min EMOM", "every 1:00 x10", "every 1:00 x 10", "Every 1:00 x10 rounds",
   "every 1 min x 10", "every minute x 10", "E1MOM 10", "E1MOM x10", "evey 1:00 x10", "e 1:00 x 10", "e1:00 x10", "every minute for 10", "every minute for 10 min",
   "EMOM 10 דקות", "10 דקות EMOM", "כל דקה x10", "כל דקה במשך 10 דקות", "EMOM 10 rounds", "10 rounds EMOM", "every 60 sec x10", "every 1:00 for 10 min"
  ].map(v => v + "\n5 pull ups\n10 push ups"));
add("e90x7", "Every 1:30 x 7 (10:30)", { type: "emom", interval: 90, total: 630 },
  ["every 1:30 x 7", "every 1:30 x7", "Every 1:30 x 7 rounds", "e 1:30 x 7", "E1:30MOM x7", "e1:30mom x 7", "every 90 sec x7", "every 90 seconds x 7",
   "every 1.5 min x 7", "every 1:30 for 7 rounds", "every 1:30 x 7 sets", "כל 1:30 x7", "כל דקה וחצי x7", "every 1:30 (7 rounds)"
  ].map(v => v + "\n5 pull ups\n10 push ups"));
add("e2mom6", "E2MOM x 6 (12:00)", { type: "emom", interval: 120, total: 720 },
  ["E2MOM x6", "E2MOM 6", "E2MOM x 6 rounds", "E2MOM 12", "E2MOM 12 min", "every 2:00 x6", "every 2 min x 6", "every 2 minutes x 6", "e 2:00 x 6", "evry 2:00 x6", "EVERY 2:00 X 6", "e2mom x 6", "every 2 min for 12 min"
  ].map(v => v + "\n5 thrusters\n10 burpees"));

// ── Work/rest intervals 30/10 x8 ──
add("int30_10x8", "Interval 30 work / 10 rest x 8", { type: "tabata", work: 30, rest: 10, rounds: 8 },
  ["30 sec work 10 sec rest x8\nburpees", "30 sec work / 10 sec rest x 8\nburpees", "30 sec on 10 sec off x8\nburpees", "30 on 10 off x8\nburpees",
   "30/10 x8\nburpees", "30/10 x 8\nburpees", "30:10 x8\nburpees", "8 rounds: 30 sec on 10 sec off\nburpees", "8 rounds\n30 sec work\n10 sec rest\nburpees",
   "8 x 30 sec / 10 sec rest\nburpees", "8 x 30 sec work 10 sec rest\nburpees", "0:30 work / 0:10 rest x 8\nburpees", "0:30 on 0:10 off x8\nburpees",
   "30 sec work\n10 sec rest\nx8\nburpees", "work 30 sec rest 10 sec x8\nburpees", "work: 30 sec\nrest: 10 sec\n8 rounds\nburpees",
   "30 seconds work 10 seconds rest x 8\nburpees", "30s work 10s rest x8\nburpees", "30″ work 10″ rest x8\nburpees", "30\" on 10\" off x8\nburpees",
   "8 סבבים: 30 שניות עבודה, 10 שניות מנוחה\nburpees", "30 שניות עבודה 10 שניות מנוחה x8\nburpees", "30 שניות עבודה\n10 שניות מנוחה\nx8\nburpees",
   "עבודה 30 שניות\nמנוחה 10 שניות\n8 סבבים\nburpees", "8 rounds of 30 sec work, 10 sec rest\nburpees", "8 sets of 30 sec on 10 sec off\nburpees",
   "x8\n30 sec work\n10 sec rest\nburpees", "30 sec work, 10 rest x8\nburpees"]);
add("tabata", "Tabata (20/10 x 8)", { type: "tabata", work: 20, rest: 10, rounds: 8 },
  ["tabata\nburpees", "Tabata\nburpees", "TABATA\nburpees", "tabata 8 rounds\nburpees", "Tabata x8\nburpees", "tbata\nburpees", "tabata burpees",
   "20/10 x8\nburpees", "20 sec work 10 sec rest x8\nburpees", "Tabata 20/10 x8\nburpees", "Tabata 4 min\nburpees", "טבטה\nburpees"]);
add("int3_1x5", "3 min run / 1 min rest x 5", { type: "tabata", work: 180, rest: 60, rounds: 5 },
  ["5 sets\n3 min run\n1 min rest", "5 סבבים\n3 דקות ריצה\nדקה מנוחה", "5 סטים\n3 דקות ריצה\n1 דקה מנוחה", "x5\n3 min run\n1 min rest",
   "5 rounds\n3 min run\n1 min rest", "5 sets:\n3 min run\n1 min rest", "5 x 3 min run / 1 min rest", "3 min run / 1 min rest x5",
   "3 min run, 1 min rest x 5", "5 sets\n3:00 run\n1:00 rest", "5 sets\n3 min run\nrest 1 min", "5 sets\n3 mins run\n1 min rest",
   "3 min on 1 min off x5\nrun", "5 rounds:\n3 min run\n1:00 rest", "3 min work 1 min rest x5\nrun", "5 סבבים:\n3 דקות ריצה\n1 דקה מנוחה"]);

// ── Sets-interval 30" x5 ──
add("sets30x5", "Sets interval 30 sec x 5 (no rest)", { type: "emom", interval: 30, total: 150 },
  ["5 sets, 30 sec", "5 סטים, 30 שניות", "5x30 sec", "5 x 30 sec", "5 x 30 שניות", "5x30 שניות", "30 sec x 5", "30 שניות x 5", "5 sets of 0:30",
   "5 sets of 30 sec", "5 sets\n30 sec", "5 סטים\n30 שניות", "5 rounds, 30 sec", "5 סבבים, 30 שניות", "5 sets of 30 seconds", "5 x 0:30"
  ].map(v => v + "\nplank hold"));

// ── A station's own AMRAP — the station NUMBER is never the AMRAP length ──
// Found 2026-10-01 while curating this suite: "#1 amrap 2:" read as AMRAP 1′
// (hash-first marker), silently — the fact channel lexes the same "1 amrap".
add("station_amrap", "Station AMRAP 2 (the station number is not the length)", { type: "amrap", total: 120 },
  ["1# amrap 2:", "#1 amrap 2:", "1. amrap 2:", "3# amrap 2", "#3 amrap 2", "2+3# amrap 2:", "1# AMRAP 2 min:"].map(v => v + "\n10 burpees\n10 air squats"));

// ── Chains: AMRAP 10 / rest 2:00 / AMRAP 10 ──
const chain = (r) => `AMRAP 10\n10 wall balls\n10 T2B\n${r}\nAMRAP 10\n10 wall balls\n10 T2B`;
add("chain", "AMRAP 10 / rest 2:00 / AMRAP 10", { type: "tabata", work: 600, rest: 120, rounds: 2 },
  ["rest 2:00", "2:00 rest", "2 min rest", "rest 2 min", "Rest 2 mins", "REST: 2:00", "rest 2'", "2' rest", "2:00", "2 min", "2 דקות מנוחה", "מנוחה 2:00",
   "מנוחה 2 דקות", "דקתיים מנוחה", "מנוחה: 2 דקות", "2:00 מנוחה", "rest 120 sec", "120 sec rest", "*rest 2:00", "(rest 2:00)", "rest - 2:00", "then rest 2 min", "ואז 2 דקות מנוחה"
  ].map(chain));

// ── Parts ──
const partsA = (p1, p2, inline) => inline
  ? `${p1} AMRAP 8\n10 burpees\n10 pull ups\n${p2} AMRAP 8\n10 thrusters\n10 box jumps`
  : `${p1}\nAMRAP 8\n10 burpees\n10 pull ups\n${p2}\nAMRAP 8\n10 thrusters\n10 box jumps`;
const PL = [["part 1:", "part 2:"], ["Part 1 -", "Part 2 -"], ["PART1", "PART2"], ["PART 1:", "PART 2:"], ["part 1)", "part 2)"], ["חלק 1", "חלק 2"], ["חלק 1:", "חלק 2:"],
  ["חלק ראשון", "חלק שני"], ["חלק א'", "חלק ב'"], ["חלק א׳", "חלק ב׳"], ["Part One:", "Part Two:"], ["1st part:", "2nd part:"], ["P1:", "P2:"], ["A.", "B."]];
add("parts_amrap_next", "Two AMRAP 8 parts (timing on NEXT line) → two AMRAP 8 clocks", { type: "amrap", total: 480, nconfigs: 2 },
  PL.map(([a, b]) => partsA(a, b, false)));
add("parts_amrap_inline", "Two AMRAP 8 parts (timing INLINE) → two AMRAP 8 clocks", { type: "amrap", total: 480, nconfigs: 2 },
  PL.map(([a, b]) => partsA(a, b, true)));
const partsI = (p1, p2, p3, inline) => inline
  ? `${p1} 5 sets, 30 sec\nplank\n${p2} 5 sets, 45 sec\nhollow\n${p3} EMOM 5\n5 burpees`
  : `${p1}\n5 sets, 30 sec\nplank\n${p2}\n5 sets, 45 sec\nhollow\n${p3}\nEMOM 5\n5 burpees`;
const PL3 = [["part 1:", "part 2:", "part 3:"], ["Part 1 -", "Part 2 -", "Part 3 -"], ["PART1", "PART2", "PART3"], ["חלק 1:", "חלק 2:", "חלק 3:"],
  ["חלק ראשון:", "חלק שני:", "חלק שלישי:"], ["חלק א'", "חלק ב'", "חלק ג'"]];
add("parts_interval_inline", "Interval parts (inline) → one seamless 11:15 clock", { total: 675 },
  PL3.map(([a, b, c]) => partsI(a, b, c, true)));
add("parts_interval_next", "Interval parts (next line) → one seamless 11:15 clock", { total: 675 },
  PL3.map(([a, b, c]) => partsI(a, b, c, false)));
const partsF = (p1, p2, inline) => inline
  ? `${p1} For Time (tc 8)\n21-15-9\nthrusters\n${p2} For Time (tc 6)\n15-12-9\nburpees`
  : `${p1}\nFor Time\n21-15-9\nthrusters\nt.c 8\n${p2}\nFor Time\n15-12-9\nburpees\nt.c 6`;
add("parts_fortime_inline", "For Time parts TC 8 + TC 6 (inline)", { type: "fortime", cap: 480, nconfigs: 2 },
  PL.slice(0, 9).map(([a, b]) => partsF(a, b, true)));
add("parts_fortime_next", "For Time parts TC 8 + TC 6 (next line)", { type: "fortime", cap: 480, nconfigs: 2 },
  PL.slice(0, 9).map(([a, b]) => partsF(a, b, false)));

// ── Decimals and units in three seats: AMRAP length, activity rest, standalone block ──
add("dec_amrap", "AMRAP of 2:30", { type: "amrap", total: 150 },
  ["AMRAP 2.5 min", "AMRAP 2,5 min", "AMRAP 2:30", "AMRAP 150 sec", "AMRAP 2.5", "2.5 min AMRAP", "AMRAP 2.5 דקות", "AMRAP 2 וחצי דקות", "AMRAP 2:30 min"].map(v => v + EX));
add("dec_rest", "3 min run / 1:30 rest x5", { type: "tabata", work: 180, rest: 90, rounds: 5 },
  ["1.5 min rest", "1,5 min rest", "90 sec rest", "1:30 rest", "rest 1:30", "1.5 דקות מנוחה", "דקה וחצי מנוחה", "90 שניות מנוחה", "מנוחה 1:30", "rest 90 sec", "rest 1.5 min"
  ].map(v => `5 sets\n3 min run\n${v}`));
add("dec_block", "Standalone 2:30 count-up block", { total: 150 },
  ["2.5 min row", "2,5 min row", "2:30 row", "150 sec row", "row 2.5 min", "row x 2.5 min", "2.5 דקות חתירה", "2:30 min row"].map(v => v));
add("block10", "Standalone 10 min block", { total: 600 },
  ["10 min row", "10 mins row", "10 minutes row", "10' row", "10:00 row", "row x 10 min", "Row 10 min", "row for 10 min", "10 דקות חתירה", "חתירה 10 דקות", "10 min:\nrow", "row\n10 min"
  ].map(v => v));
add("warmup", "Warm up block of 6 min", { total: 360 },
  ["WARM UP x 6 min\n10 CAL Row", "6 min WARM UP:\n10 CAL Row", "WARM UP 6 min\n10 CAL Row", "warm up - 6 min\n10 CAL Row", "warm up (6 min)\n10 CAL Row",
   "חימום 6 דקות\n10 CAL Row", "6 דקות חימום\n10 CAL Row", "WARM UP: 6:00\n10 CAL Row", "Warm up 6'\n10 CAL Row"]);


// `check`: "full" (default) = parseLine type + leading marker badge must match the
// group's first line; "type" = only the line type (header vs exercise);
// "none" = the group exists only for the display ⇄ detection check.
export const DISPLAY = [
  { id: "station_num", title: "Station markers (same meaning: station 1)",
    lines: ["1# 400 m run", "#1 400 m run", "1. 400 m run", "1) 400 m run", "1 - 400 m run", "1- 400 m run", "1: 400 m run", "(1) 400 m run", "1.400 m run", "#1: 400 m run", "1#: 400 m run", "station 1: 400 m run", "תחנה 1: 400 m run"] },
  { id: "station_merged", title: "Merged station marker",
    lines: ["2+3# 200 m run", "2-3# 200 m run", "2,3# 200 m run", "2 & 3# 200 m run", "#2+3 200 m run", "#2-3 200 m run"] },
  { id: "station_kw", title: "Station line with keyword / colon",
    lines: ["1# amrap 2:", "#1 amrap 2:", "1. amrap 2:", "1) amrap 2:", "1 - amrap 2:", "1# max hold:", "1. max hold:", "1 - max hold:"] },
  { id: "group", title: "Group letters (same meaning: group A)",
    lines: ["A. Bench press", "A - Bench press", "A) Bench press", "a. Bench press", "A: Bench press", "A Bench press", "A- Bench press", "A.Bench press", "(A) Bench press", "א. Bench press"] },
  { id: "subgroup", title: "Sub-group labels (same meaning: A1)",
    lines: ["A1. Bench press", "A1 - Bench press", "A1 Bench press", "a1. Bench press", "A1) Bench press", "A1: Bench press", "A1- Bench press", "A1.Bench press", "A1. 4 sets of:", "A1 amrap 4:"] },
  { id: "setline", title: "Set N prescription",
    lines: ["Set 1: 5 reps", "SET 1 - 5 reps", "set 1. 5 reps", "Set 1 5 reps", "Set1: 5 reps", "סט 1: 5 חזרות", "סט ראשון: 5 חזרות", "1st set: 5 reps", "1.5 REPS", "1- 5 REPS", "1. 5 reps"] },
  { id: "notes", title: "Notes",
    lines: ["*note: keep moving", "* scale to ring rows", "מטרה: לא לעצור", "*המטרה לצבור כמה שיותר", "goal: unbroken", "Goal - unbroken", "note: keep moving", "הערה: לשמור על קצב", "(scale as needed)"] },
  { id: "rx", title: "Rx / scaling",
    lines: ["rx: 22.5/15", "Rx: 22.5/15", "RX 22.5/15", "rx 22.5/15", "Rx+ 4000 m run", "rx+: 4000 m run", "RX+ 50/35", "Rx (22.5/15)", "rx - 22.5/15", "scaled: 15/10", "scaled 15/10", "22.5/15 kb", "20 wall ball (rx 9/6)"] },
  { id: "cashout", title: "Cashout divider",
    lines: ["cashout -", "CASH OUT:", "cash-out", "Cashout: 40 hanging leg raises", "cash out 40 hanging leg raises", "קאש אאוט", "קאשאאוט:", "buy in:", "buy-in -", "BUY IN: 20 cal row"] },
  { id: "durations_badge", check: "none", title: "Duration badge across spellings (2 minutes)",
    lines: ["2 min rest", "2 mins rest", "2 minutes rest", "rest 2 min", "2:00 rest", "2' rest", "2 דקות מנוחה", "מנוחה 2 דקות", "דקתיים מנוחה", "rest 120 sec", "2 min plank", "plank 2 min", "plank 2:00", "plank 120 sec", "plank 2 דקות", "2 דקות פלאנק"] },
  { id: "durations_sec", check: "none", title: "Duration badge (30 seconds)",
    lines: ["30 sec plank", "30 secs plank", "30 seconds plank", "30s plank", "30\" plank", "30″ plank", "plank 30 sec", "plank 0:30", "30 שניות פלאנק", "פלאנק 30 שניות", "30 rest", "30 sec rest", "rest 30 sec"] },
  { id: "tc_badge", check: "none", title: "Time cap badge",
    lines: ["t.c 14", "tc 14", "TC: 14", "14 min tc", "time cap 14", "cap 14", "T.C 14:00", "14 דקות tc", "TC-14", "(tc 14)"] },
  { id: "format_header", check: "type", title: "Format header (AMRAP 12)",
    lines: ["AMRAP 12", "amrap 12", "AMRAP 12 min", "12 min AMRAP", "12' AMRAP", "AMRAP 12:", "AMRAP: 12", "amrap 12 דקות", "12 דקות AMRAP", "AMRAP 12.5"] },
  { id: "emom_header", check: "type", title: "Format header (EMOM 10)",
    lines: ["EMOM 10", "emom 10 min", "every 1:00 x10", "every 1 min x 10", "E1MOM 10", "evey 1:00 x10", "e 1:00 x 10", "every minute for 10", "EMOM 10 דקות", "כל דקה x10"] },
  { id: "interval_header", check: "type", title: "Interval spec header (30/10 x8)",
    lines: ["30 sec work 10 sec rest x8", "30 on 10 off x8", "30/10 x8", "8 rounds: 30 sec on 10 sec off", "8 x 30 sec / 10 sec rest", "0:30 work / 0:10 rest x 8", "8 סבבים: 30 שניות עבודה, 10 שניות מנוחה", "30 שניות עבודה 10 שניות מנוחה x8"] },
  { id: "sets_header", title: "Sets/rounds count line",
    lines: ["5 sets", "5 rounds", "x5", "5 סטים", "5 סבבים", "5 Sets:", "5 rounds:", "5 RFT", "5 rounds for time", "x 5 sets"] },
  { id: "parts_header", title: "Part headers",
    lines: ["part 1:", "Part 1 -", "PART1", "PART 1", "חלק 1", "חלק ראשון", "חלק א'", "part 1: AMRAP 8", "חלק 1: AMRAP 8", "Part 1 - 8 min", "חלק 1: 8 דקות"] },
];
