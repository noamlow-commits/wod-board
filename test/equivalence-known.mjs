// The RATCHET for test/equivalence.mjs — every divergence that exists today,
// each with its reason. Generated from `node test/equivalence.mjs --baseline`
// on 2026-10-01 and curated by hand against the audit
// (memory/project_audit_2026-10-01.md) and Noam's 8 decisions.
//
//   BUG(step N)  — a defect; step N of the audit plan fixes it (2b = the
//                  missing-clock half of step 2: 'every 90 sec', 'כל', cap units…). When a fix lands
//                  the suite fails with "now passes — delete it": delete it.
//   SPEC         — a deliberate, documented rule; the class's alternative
//                  reading is NOT wanted. Keep (and keep the reason current).
//   COACH(Qn)    — waits on the coach (TIMER_ROADMAP §1). Do not "fix".
//   DECIDE       — waits on Noam.
//
// ⛔ Never ADD an entry to make a new divergence pass — a new divergence is a
// regression until proven otherwise. Entries leave this file; the ONE way an
// entry may arrive is when a fix makes the MEASUREMENT see an older gap (the
// fact channel learning to read a duration the display never badged). Such an
// entry says "SURFACED by step N" and names the older gap it exposes.
export const KNOWN = {
  "timers": {
    "amrap12": {
      "AMRAP של 12 דקות\n10 burpees\n10 wall balls": "BUG(step 2b readDuration / step 8 binding): AMRAP length in this spelling — today: no clock [—]",
      "AMRAP (12 min)\n10 burpees\n10 wall balls": "BUG(step 2b readDuration / step 8 binding): AMRAP length in this spelling — today: no clock [—]",
      "AMRAP x 12 min\n10 burpees\n10 wall balls": "BUG(step 2b readDuration / step 8 binding): AMRAP length in this spelling — today: no clock [—]",
      "AMRAP12\n10 burpees\n10 wall balls": "SPEC: glued \"AMRAP12\" has no word boundary; deliberately not read — today: SILENT no clock [—]"
    },
    "tc14": {
      "For Time\n21-15-9\nthrusters\npull ups\nT.C. 14": "BUG: \"T.C.\" with a trailing dot is read as group letter T, the cap is lost — today: SILENT cap 0 ≠ 840 [For Time]",
      "For Time\n21-15-9\nthrusters\npull ups\ntime cap 14": "COACH(Q8): \"time cap N\"/\"cap N\" — Noam 1.10: keep today's behaviour, ask the coach — today: SILENT cap 0 ≠ 840 [For Time]",
      "For Time\n21-15-9\nthrusters\npull ups\nTIME CAP: 14 min": "COACH(Q8): \"time cap N\"/\"cap N\" — Noam 1.10: keep today's behaviour, ask the coach — today: cap 0 ≠ 840 [For Time]",
      "For Time\n21-15-9\nthrusters\npull ups\ncap 14": "COACH(Q8): \"time cap N\"/\"cap N\" — Noam 1.10: keep today's behaviour, ask the coach — today: SILENT cap 0 ≠ 840 [For Time]",
      "For Time\n21-15-9\nthrusters\npull ups\ncap: 14 min": "COACH(Q8): \"time cap N\"/\"cap N\" — Noam 1.10: keep today's behaviour, ask the coach — today: cap 0 ≠ 840 [For Time]",
      "For Time\n21-15-9\nthrusters\npull ups\n14 דקות tc": "BUG(step 2b readDuration): Hebrew unit in a cap — today: cap 0 ≠ 840 [For Time]",
      "For Time\n21-15-9\nthrusters\npull ups\n14' tc": "BUG(step 2b readDuration): prime ' as a minute unit in a cap — today: SILENT cap 0 ≠ 840 [For Time]"
    },
    "tc14_inline": {
      "For Time, 14 min cap\n21-15-9\nthrusters\npull ups": "COACH(Q8): \"time cap N\"/\"cap N\"/\"N min cap\" — keep today's behaviour, ask the coach — today: cap 0 ≠ 840 [For Time]",
      "For Time (14 min TC)\n21-15-9\nthrusters\npull ups": "BUG(step 2b): number-first cap inside parentheses after the format word — today: cap 0 ≠ 840 [For Time]",
      "For Time (time cap 14)\n21-15-9\nthrusters\npull ups": "COACH(Q8): \"time cap N\"/\"cap N\" — Noam 1.10: keep today's behaviour, ask the coach — today: SILENT cap 0 ≠ 840 [For Time]",
      "For Time (cap 14)\n21-15-9\nthrusters\npull ups": "COACH(Q8): \"time cap N\"/\"cap N\"/\"N min cap\" — keep today's behaviour, ask the coach — today: SILENT cap 0 ≠ 840 [For Time]"
    },
    "emom10": {
      "every minute x 10\n5 pull ups\n10 push ups": "BUG(step 2b/6): EMOM / every in this spelling — today: SILENT no clock [—]",
      "every minute for 10\n5 pull ups\n10 push ups": "BUG(step 2b/6): EMOM / every in this spelling — today: SILENT no clock [—]",
      "every minute for 10 min\n5 pull ups\n10 push ups": "BUG(step 2b/6): EMOM / every in this spelling — today: no clock [—]",
      "כל דקה x10\n5 pull ups\n10 push ups": "BUG(step 2b/6): EMOM / every in this spelling — today: SILENT no clock [—]",
      "כל דקה במשך 10 דקות\n5 pull ups\n10 push ups": "BUG(step 2b/6): EMOM / every in this spelling — today: no clock [—]",
      "every 60 sec x10\n5 pull ups\n10 push ups": "BUG(step 2b/6): EMOM / every in this spelling — today: no clock [—]",
      "every 1:00 for 10 min\n5 pull ups\n10 push ups": "BUG(step 2b/6): EMOM / every in this spelling — today: no clock [—]",
      "EMOTM 10\n5 pull ups\n10 push ups": "BUG(step 2b): another spelling of the SAME acronym (Every Minute On The Minute / On The Minute) — the 1′ interval is in the word, as with EMOM (Noam 1.10); added to the classes 1.10 as a recorded gap, not a regression — today: SILENT no clock [—]",
      "EMOTM x10\n5 pull ups\n10 push ups": "BUG(step 2b): another spelling of the SAME acronym (Every Minute On The Minute / On The Minute) — the 1′ interval is in the word, as with EMOM (Noam 1.10); added to the classes 1.10 as a recorded gap, not a regression — today: SILENT no clock [—]",
      "OTM x10\n5 pull ups\n10 push ups": "BUG(step 2b): another spelling of the SAME acronym (Every Minute On The Minute / On The Minute) — the 1′ interval is in the word, as with EMOM (Noam 1.10); added to the classes 1.10 as a recorded gap, not a regression — today: SILENT no clock [—]",
      "every minute on the minute x10\n5 pull ups\n10 push ups": "BUG(step 2b): another spelling of the SAME acronym (Every Minute On The Minute / On The Minute) — the 1′ interval is in the word, as with EMOM (Noam 1.10); added to the classes 1.10 as a recorded gap, not a regression — today: SILENT no clock [—]"
    },
    "e90x7": {
      "every 90 sec x7\n5 pull ups\n10 push ups": "BUG(step 2b): \"every\" reads only M:SS — seconds, decimal or Hebrew \"כל\" missed — today: no clock [—]",
      "every 90 seconds x 7\n5 pull ups\n10 push ups": "BUG(step 2b): \"every\" reads only M:SS — seconds, decimal or Hebrew \"כל\" missed — today: no clock [—]",
      "כל 1:30 x7\n5 pull ups\n10 push ups": "BUG(step 2b): \"every\" reads only M:SS — seconds, decimal or Hebrew \"כל\" missed — today: no clock [—]",
      "כל דקה וחצי x7\n5 pull ups\n10 push ups": "BUG(step 2b): \"every\" reads only M:SS — seconds, decimal or Hebrew \"כל\" missed — today: SILENT no clock [—]"
    },
    "e2mom6": {
      "E2MOM 6\n5 thrusters\n10 burpees": "SPEC: \"E2MOM N\" = N total minutes (PARSER rotation rule) → ×3; the class's ×6 reading is the alternative — today: SILENT total 360 ≠ 720 [E2MOM ×3 (6′)]",
      "every 2 min for 12 min\n5 thrusters\n10 burpees": "BUG(step 6): \"every N min for M min\" not read — today: no clock [—]"
    },
    "int30_10x8": {
      "30/10 x8\nburpees": "SPEC: \"30/10\" is also how she writes male/female reps (\"12/10 cal\") — never a clock by itself — today: SILENT no clock [—]",
      "30/10 x 8\nburpees": "SPEC: \"30/10\" is also how she writes male/female reps (\"12/10 cal\") — never a clock by itself — today: SILENT no clock [—]",
      "30:10 x8\nburpees": "SPEC: \"30/10\" is also how she writes male/female reps (\"12/10 cal\") — never a clock by itself — today: no clock [—]",
      "8 x 30 sec / 10 sec rest\nburpees": "BUG(steps 2/5): work/rest interval in this spelling — today: no clock [—]",
      "8 x 30 sec work 10 sec rest\nburpees": "BUG(steps 2/5): work/rest interval in this spelling — today: SILENT rounds 30 ≠ 8 [×30 · 30″ work / 10″ rest]",
      "work 30 sec rest 10 sec x8\nburpees": "BUG(steps 2/5): work/rest interval in this spelling — today: no clock [—]",
      "work: 30 sec\nrest: 10 sec\n8 rounds\nburpees": "BUG(steps 2/5): work/rest interval in this spelling — today: no clock [—]",
      "30″ work 10″ rest x8\nburpees": "BUG(steps 2/5): work/rest interval in this spelling — today: SILENT no clock [—]",
      "30\" on 10\" off x8\nburpees": "BUG(steps 2/5): work/rest interval in this spelling — today: SILENT no clock [—]"
    },
    "tabata": {
      "20/10 x8\nburpees": "SPEC: \"20/10\" is also how she writes male/female reps — never a clock by itself — today: SILENT no clock [—]",
      "טבטה\nburpees": "BUG(step 6 FORMAT): Hebrew \"טבטה\" is not a format word (tabata default kept, decision 6) — today: SILENT no clock [—]"
    },
    "int3_1x5": {
      "5 סבבים\n3 דקות ריצה\nדקה מנוחה": "BUG(steps 4/5): activity interval — Hebrew work line, or the one-line form — today: no clock [—]",
      "5 סטים\n3 דקות ריצה\n1 דקה מנוחה": "BUG(steps 4/5): activity interval — Hebrew work line, or the one-line form — today: no clock [—]",
      "5 x 3 min run / 1 min rest": "BUG(steps 4/5): activity interval — Hebrew work line, or the one-line form — today: no clock [—]",
      "3 min run / 1 min rest x5": "BUG(steps 4/5): activity interval — Hebrew work line, or the one-line form — today: no clock [—]",
      "3 min run, 1 min rest x 5": "BUG(steps 4/5): activity interval — Hebrew work line, or the one-line form — today: no clock [—]",
      "5 סבבים:\n3 דקות ריצה\n1 דקה מנוחה": "BUG(steps 4/5): activity interval — Hebrew work line, or the one-line form — today: no clock [—]"
    },
    "sets30x5": {
      "30 sec x 5\nplank hold": "BUG(step 5 readCount): sets interval — duration-first, or a rounds/סבבים count — today: no clock [—]",
      "30 שניות x 5\nplank hold": "BUG(step 5 readCount): sets interval — duration-first, or a rounds/סבבים count — today: no clock [—]",
      "5 rounds, 30 sec\nplank hold": "BUG(step 5 readCount): sets interval — duration-first, or a rounds/סבבים count — today: no clock [—]",
      "5 סבבים, 30 שניות\nplank hold": "BUG(step 5 readCount): sets interval — duration-first, or a rounds/סבבים count — today: no clock [—]"
    },
    "chain": {
      "AMRAP 10\n10 wall balls\n10 T2B\nREST: 2:00\nAMRAP 10\n10 wall balls\n10 T2B": "BUG(step 4 readRest): this rest spelling breaks the chain — today: type amrap ≠ tabata; work 0 ≠ 600; rest 0 ≠ 120; rounds 0 ≠ 2 [AMRAP 10′ | AMRAP 10′]",
      "AMRAP 10\n10 wall balls\n10 T2B\nrest 2'\nAMRAP 10\n10 wall balls\n10 T2B": "BUG(step 4 readRest): this rest spelling breaks the chain — today: SILENT type amrap ≠ tabata; work 0 ≠ 600; rest 0 ≠ 120; rounds 0 ≠ 2 [AMRAP 10′ | AMRAP 10′]",
      "AMRAP 10\n10 wall balls\n10 T2B\n2' rest\nAMRAP 10\n10 wall balls\n10 T2B": "BUG(step 4 readRest): this rest spelling breaks the chain — today: SILENT type amrap ≠ tabata; work 0 ≠ 600; rest 0 ≠ 120; rounds 0 ≠ 2 [AMRAP 10′ | AMRAP 10′]",
      "AMRAP 10\n10 wall balls\n10 T2B\n2 min\nAMRAP 10\n10 wall balls\n10 T2B": "SPEC: a bare \"N min\" between work blocks is a WORK continuation (buildWorkoutTimeline pass 3, CARDIO 2026-03-04), not a rest — today: type amrap ≠ tabata; work 0 ≠ 600; rest 0 ≠ 120; rounds 0 ≠ 2 [AMRAP 10′ | AMRAP 10′]",
      "AMRAP 10\n10 wall balls\n10 T2B\nrest 120 sec\nAMRAP 10\n10 wall balls\n10 T2B": "BUG(step 4 readRest): this rest spelling breaks the chain — today: type amrap ≠ tabata; work 0 ≠ 600; rest 0 ≠ 120; rounds 0 ≠ 2 [AMRAP 10′ | AMRAP 10′]",
      "AMRAP 10\n10 wall balls\n10 T2B\n120 sec rest\nAMRAP 10\n10 wall balls\n10 T2B": "BUG(step 4 readRest): this rest spelling breaks the chain — today: type amrap ≠ tabata; work 0 ≠ 600; rest 0 ≠ 120; rounds 0 ≠ 2 [AMRAP 10′ | AMRAP 10′]",
      "AMRAP 10\n10 wall balls\n10 T2B\nrest - 2:00\nAMRAP 10\n10 wall balls\n10 T2B": "BUG(step 4 readRest): this rest spelling breaks the chain — today: type amrap ≠ tabata; work 0 ≠ 600; rest 0 ≠ 120; rounds 0 ≠ 2 [AMRAP 10′ | AMRAP 10′]"
    },
    "parts_interval_inline": {
      "חלק א' 5 sets, 30 sec\nplank\nחלק ב' 5 sets, 45 sec\nhollow\nחלק ג' EMOM 5\n5 burpees": "SPEC(not yet): letter-numbered parts \"חלק א׳\" are listed as unsupported in PARSER.md — today: total 300 ≠ 675 [EMOM 5′]"
    },
    "parts_interval_next": {
      "חלק א'\n5 sets, 30 sec\nplank\nחלק ב'\n5 sets, 45 sec\nhollow\nחלק ג'\nEMOM 5\n5 burpees": "SPEC(not yet): letter-numbered parts \"חלק א׳\" are listed as unsupported in PARSER.md — today: total 300 ≠ 675 [EMOM 5′]"
    },
    "parts_fortime_inline": {
      "חלק א' For Time (tc 8)\n21-15-9\nthrusters\nחלק ב' For Time (tc 6)\n15-12-9\nburpees": "SPEC(not yet): letter-numbered parts \"חלק א׳\" are listed as unsupported in PARSER.md — today: 1 clocks, want 2 [TC 8′ · For Time]"
    },
    "parts_fortime_next": {
      "חלק א'\nFor Time\n21-15-9\nthrusters\nt.c 8\nחלק ב'\nFor Time\n15-12-9\nburpees\nt.c 6": "SPEC(not yet): letter-numbered parts \"חלק א׳\" are listed as unsupported in PARSER.md — today: 1 clocks, want 2 [TC 8′ · For Time]"
    },
    "dec_amrap": {
      "AMRAP 2 וחצי דקות\n10 burpees\n10 wall balls": "BUG(step 2b readDuration): AMRAP 2:30 written as sec / M:SS / comma / Hebrew half — today: SILENT total 120 ≠ 150 [AMRAP 2′]"
    },
    "dec_rest": {
      "5 sets\n3 min run\n1,5 min rest": "BUG(step 2b): comma decimal \"1,5 min\" turns the interval into a stray count-up — today: type amrap ≠ tabata; work 0 ≠ 180; rest 0 ≠ 90; rounds 0 ≠ 5 [3′ run]"
    },
    "dec_block": {
      "2,5 min row": "BUG(step 2b): leading block duration in this spelling — today: no clock [—]",
      "2:30 row": "BUG(step 2b): leading block duration in this spelling — today: no clock [—]",
      "150 sec row": "BUG(step 2b): leading block duration in this spelling — today: no clock [—]",
      "row 2.5 min": "COACH(Q6): trailing duration without the x is deliberately clockless — today: no clock [—]",
      "2.5 דקות חתירה": "BUG(step 2b): leading block duration in this spelling — today: no clock [—]",
      "2:30 min row": "BUG(step 2b): leading block duration in this spelling — today: no clock [—]"
    },
    "block10": {
      "10' row": "BUG(step 2b): leading block duration in this spelling — today: SILENT no clock [—]",
      "10:00 row": "BUG(step 2b): leading block duration in this spelling — today: no clock [—]",
      "Row 10 min": "COACH(Q6): trailing duration without the x is deliberately clockless — today: no clock [—]",
      "row for 10 min": "COACH(Q6): trailing duration without the x is deliberately clockless — today: no clock [—]",
      "10 דקות חתירה": "BUG(step 2b): leading block duration in this spelling — today: no clock [—]",
      "חתירה 10 דקות": "COACH(Q6): trailing duration without the x is deliberately clockless — today: no clock [—]",
      "row\n10 min": "SPEC: bare_block_duration_must_lead — a duration written after the work is not a block length — today: no clock [—]"
    },
    "warmup": {
      "WARM UP 6 min\n10 CAL Row": "COACH(Q6): a block duration written without the x — deliberately clockless until she answers — today: no clock [—]",
      "warm up - 6 min\n10 CAL Row": "COACH(Q6): a block duration written without the x — deliberately clockless until she answers — today: no clock [—]",
      "warm up (6 min)\n10 CAL Row": "COACH(Q6): a block duration written without the x — deliberately clockless until she answers — today: no clock [—]",
      "חימום 6 דקות\n10 CAL Row": "COACH(Q6): a block duration written without the x — deliberately clockless until she answers — today: no clock [—]",
      "6 דקות חימום\n10 CAL Row": "COACH(Q6): a block duration written without the x — deliberately clockless until she answers — today: no clock [—]",
      "WARM UP: 6:00\n10 CAL Row": "COACH(Q6): a block duration written without the x — deliberately clockless until she answers — today: no clock [—]",
      "Warm up 6'\n10 CAL Row": "COACH(Q6): a block duration written without the x — deliberately clockless until she answers — today: SILENT no clock [—]"
    }
  },
  "agree": {
    "station_kw": {
      "1 - amrap 2:": "BUG(step 3): the station's own AMRAP length is not badged — today: read but not badged: 2"
    },
    "subgroup": {
      "A1 amrap 4:": "BUG(step 3): the station's own AMRAP length is not badged — today: read but not badged: 4"
    },
    "durations_sec": {
      "30 rest": "BUG(decision 7, no guessing): the display assumes seconds for a bare \"30 rest\" — the detector reads no duration — today: badged but not read: 30 sec"
    },
    "format_header": {
      "AMRAP 12:": "BUG(step 3 badgeTokens): the format keyword is badged but its length is not — today: read but not badged: 12"
    },
    "parts_header": {
      "Part 1 - 8 min": "BUG(audit F24): the fact channel reads \"1 - 8 min\" as a RANGE and ignores it — the part header's 8 min is never audited — today: badged but not read: 8 min"
    }
  },
  "category": {
    "station_num": {
      "1 - 400 m run": "BUG(step 6, audit D9): a dash station number keeps the amber rep look. SURFACED by step 3 (2026-10-01): its siblings \"1#\"/\"1.\" got their own station colour; this spelling did not change. Not auto-converted because \"10 - 15 burpees\" is a rep RANGE, not station 10 — today: exercise|rep-number ≠ exercise|station-badge",
      "1- 400 m run": "BUG(step 6, audit D9): a dash station number keeps the amber rep look. SURFACED by step 3 (2026-10-01): its siblings got their own station colour; \"N-\" is ambiguous with a rep range, so it was not auto-converted — today: exercise|rep-number ≠ exercise|station-badge",
      "1: 400 m run": "BUG(decision 1 + audit D9): every station-number spelling must render in ONE category with its own colour — today: exercise|- ≠ exercise|station-badge",
      "(1) 400 m run": "BUG(step 6, audit D9): a parenthesised station number keeps the amber look. SURFACED by step 3 (2026-10-01): its siblings got their own station colour; \"(1)\" was not converted (a \"(4)\" clean-progression complex uses the same shape) — today: exercise|rep-number ≠ exercise|station-badge",
      "1.400 m run": "BUG(decision 1 + audit D9): every station-number spelling must render in ONE category with its own colour — today: exercise|- ≠ exercise|station-badge",
      "station 1: 400 m run": "BUG(decision 1 + audit D9): every station-number spelling must render in ONE category with its own colour — today: exercise|- ≠ exercise|station-badge",
      "תחנה 1: 400 m run": "BUG(decision 1 + audit D9): every station-number spelling must render in ONE category with its own colour — today: exercise|- ≠ exercise|station-badge"
    },
    "station_kw": {
      "1 - amrap 2:": "BUG(decision 1 + audit D9): every station-number spelling must render in ONE category with its own colour — today: sub-header|- ≠ exercise|station-badge",
      "1 - max hold:": "BUG(decision 1 + audit D9): every station-number spelling must render in ONE category with its own colour — today: sub-header|- ≠ exercise|station-badge"
    },
    "group": {
      "A: Bench press": "BUG(audit D9): group letter with this separator gets no group marker — today: exercise|- ≠ sub-header|group-badge",
      "A Bench press": "SPEC: a bare capital letter + space is too ambiguous (the English article \"A\") — today: exercise|- ≠ sub-header|group-badge",
      "(A) Bench press": "BUG(audit D9): group letter with this separator gets no group marker — today: exercise|- ≠ sub-header|group-badge",
      "א. Bench press": "SPEC(not yet): Hebrew group letters are not supported — today: exercise|- ≠ sub-header|group-badge"
    },
    "subgroup": {
      "A1: Bench press": "BUG(audit D9, d656ec4 class): sub-group label with this separator gets no badge — today: exercise|- ≠ exercise|subgroup-badge",
      "A1 amrap 4:": "BUG(audit D9, d656ec4 class): sub-group label with this separator gets no badge — today: sub-header|- ≠ exercise|subgroup-badge"
    },
    "setline": {
      "Set1: 5 reps": "BUG(step 6): SET header in this spelling is not a SET marker — today: exercise|- ≠ sub-header|group-badge",
      "סט 1: 5 חזרות": "BUG(step 6): SET header in this spelling is not a SET marker — today: exercise|- ≠ sub-header|group-badge",
      "סט ראשון: 5 חזרות": "BUG(step 6): SET header in this spelling is not a SET marker — today: exercise|- ≠ sub-header|group-badge",
      "1st set: 5 reps": "BUG(step 6): SET header in this spelling is not a SET marker — today: exercise|- ≠ sub-header|group-badge",
      "1.5 REPS": "SPEC: a wave set-number line (\"1.5 REPS\" = set 1 · 5 reps) is its own category (SET_NUM_TIGHT_RE) — today: exercise|rep-number ≠ sub-header|group-badge",
      "1- 5 REPS": "SPEC: a wave set-number line is its own category, not a SET header — today: exercise|rep-number ≠ sub-header|group-badge",
      "1. 5 reps": "SPEC: a numbered set line is its own category, not a SET header — today: exercise|station-badge ≠ sub-header|group-badge"
    },
    "rx": {
      "RX 22.5/15": "BUG(audit D13): \"rx: 22.5/15\" is a pill, this spelling a small badge — today: exercise|rx-badge ≠ exercise|-",
      "rx 22.5/15": "BUG(audit D13): \"rx: 22.5/15\" is a pill, this spelling a small badge — today: exercise|rx-badge ≠ exercise|-",
      "Rx+ 4000 m run": "BUG(audit D13): \"rx: 22.5/15\" is a pill, this spelling a small badge — today: exercise|rx-badge ≠ exercise|-",
      "RX+ 50/35": "BUG(audit D13): \"rx: 22.5/15\" is a pill, this spelling a small badge — today: exercise|rx-badge ≠ exercise|-",
      "20 wall ball (rx 9/6)": "SPEC: an exercise carrying an inline rx note is an exercise, not an Rx line — today: exercise|rep-number ≠ exercise|-"
    },
    "cashout": {
      "קאש אאוט": "BUG(step 6): Hebrew cashout spelling gets no CASHOUT marker — today: exercise|- ≠ sub-header|group-badge",
      "קאשאאוט:": "BUG(step 6): Hebrew cashout spelling gets no CASHOUT marker — today: sub-header|- ≠ sub-header|group-badge",
      "buy in:": "BUG(step 6): BUY-IN is a block marker exactly like CASHOUT — Noam 1.10: they are the opening and the closing of a workout — today: sub-header|- ≠ sub-header|group-badge",
      "buy-in -": "BUG(step 6): BUY-IN is a block marker exactly like CASHOUT — Noam 1.10: they are the opening and the closing of a workout — today: exercise|- ≠ sub-header|group-badge",
      "BUY IN: 20 cal row": "BUG(step 6): BUY-IN is a block marker exactly like CASHOUT — Noam 1.10: they are the opening and the closing of a workout — today: exercise|- ≠ sub-header|group-badge"
    },
    "emom_header": {
      "e 1:00 x 10": "BUG(step 6 FORMAT): this header spelling renders as an exercise — today: exercise ≠ sub-header",
      "every minute for 10": "BUG(step 6 FORMAT): this header spelling renders as an exercise — today: exercise ≠ sub-header",
      "כל דקה x10": "BUG(step 6 FORMAT): this header spelling renders as an exercise — today: exercise ≠ sub-header"
    },
    "interval_header": {
      "30 on 10 off x8": "BUG(step 6 FORMAT): this header spelling renders as an exercise — today: exercise ≠ sub-header",
      "30/10 x8": "SPEC: \"30/10\" is also male/female reps — not an interval header — today: exercise ≠ sub-header",
      "0:30 work / 0:10 rest x 8": "BUG(step 6 FORMAT): this header spelling renders as an exercise — today: exercise ≠ sub-header"
    },
    "sets_header": {
      "5 rounds": "BUG(decision 1, audit D12): counts render in several categories — one category, its own colour — today: sub-header|- ≠ sub-header|count-badge",
      "5 סטים": "BUG(decision 1, audit D12): counts render in several categories — one category, its own colour — today: exercise|rep-number ≠ sub-header|count-badge",
      "5 סבבים": "BUG(decision 1, audit D12): counts render in several categories — one category, its own colour — today: exercise|rep-number ≠ sub-header|count-badge",
      "5 Sets:": "BUG(decision 1, audit D12): counts render in several categories — one category, its own colour — today: sub-header|- ≠ sub-header|count-badge",
      "5 rounds:": "BUG(decision 1, audit D12): counts render in several categories — one category, its own colour — today: sub-header|- ≠ sub-header|count-badge",
      "5 RFT": "SPEC: RFT is a FORMAT (rounds for time), not a bare count — today: sub-header|- ≠ sub-header|count-badge",
      "5 rounds for time": "SPEC: rounds-for-time is a FORMAT, not a bare count — today: sub-header|- ≠ sub-header|count-badge",
      "x 5 sets": "BUG(decision 1, audit D12): counts render in several categories — one category, its own colour — today: exercise|- ≠ sub-header|count-badge"
    },
    "parts_header": {
      "חלק א'": "SPEC(not yet): letter-numbered parts are listed as unsupported — today: exercise|- ≠ sub-header|-"
    }
  }
};
