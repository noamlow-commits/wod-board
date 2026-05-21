# CLAUDE.md — WOD Board (CrossFit Gush Etzion)

## Project Overview
CrossFit gym display app. Three surfaces:
- `index.html` — Main board projected on gym TV (1080p)
- `score.html` — Mobile score entry (athletes scan QR code)
- `my.html` — Personal athlete profile
- `coach.html` — Coach management page
- `apps-script-code.js` — Google Apps Script backend (reference file — deployed manually via Google)
- `gym-pin.js` — Shared PIN lock screen component (included in all pages)

## Stack
- Static HTML/JS/CSS — no build step, no bundler, no npm
- Hosted on GitHub Pages (`noamlow-commits.github.io/wod-board/`)
- Backend: Google Apps Script (serverless, deployed on coach's Google Sheet)
- Database: Google Sheets tabs (Results, Lifts, Benchmarks, PRs, Athletes, etc.)

## Production Credentials (do not hardcode — stored in board settings UI)
- Coach's Sheet ID: `1EgwRwRJ6vyPOYAQ5wxtVZ4RB4AH2usr-jalNpPDt8hQ`
- Tab name: "גיליון 1"
- Apps Script URL: stored in localStorage, changes on every new deployment
- GYM PIN: `1986` | Coach password: `cfgush2026`

## Critical Architecture Rules

### Apps Script URL
**Never hardcode the Apps Script URL.** It changes every time a new version is deployed.
The URL is stored in the board's settings UI and saved to localStorage.

### Sheet Parser — content-based only
The sheet parser must stay **content-based, not position-based.**
Coach freely reorders, adds, and removes columns. Never assume column index.
- Short single-line cells (≤30 chars) without a named header → section label
- Long/multi-line cells or cells under named headers → workout content

### Data Source — Apps Script, not gviz
**Do not use the gviz API for workout content.** It returns NULL for some columns (known bug, cause unknown).
Use the `getWorkoutSheet` Apps Script endpoint which reads via `getDataRange().getValues()`.
`getWorkoutSheet` is exempt from PIN check (public data, fetch() doesn't forward PIN).

### JSONP / fetch
- Score writes and auth: use JSONP (form+iframe POST to bypass 302 redirect)
- Workout content fetch: use `fetch()` — JSONP callback didn't fire for this endpoint
- All JSONP calls must include `pin` parameter from `localStorage['wodboard-gym-pin']`

### PIN Handling
PIN must **NOT** be deleted on network timeout or API error.
Only delete PIN on an explicit `{ status: "invalid" }` response from the server.

### Emoji and Hebrew via JSONP
Emoji and Hebrew text corrupt through the JSONP pipeline.
Fix: define data client-side in a JS map (e.g., `BADGE_DATA`) keyed by ID, not returned from API.

## Target Environment

### TV (index.html)
- 1080p display, viewed from across the room
- Font sizes must be large and readable at distance
- `autoFit` binary search (0.4–2.5x scale) runs on every render
- autoFit needs **two retries** (150ms + 400ms) — flex layout takes time to stabilize
- `overflow: hidden` on `.card-body` — never `overflow: auto`

### Mobile (score.html, my.html)
- Athletes use on their phones after a WOD
- Touch-friendly, fast, minimal UI

## Layout System (index.html)

### Newspaper Flow
Content flows in flex columns. Smart column breaks prefer section headers at top of columns.
Spanning headers: when a section spills into multiple columns, its header spans all those columns.
`part N` headers force a column break — every `part 1/2/3` block starts at the top of its own column (the section header spans them all). **Softening:** a part too small to fill a column on its own (fewer than 3 lines) is merged into the column it follows, so the board never shows a near-empty lonely column.

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
- `setTvSection()` triggers autoFit retries
- **`setTvSection()` preserves `partFocusIndex`** across section switches (clamped to the new section's max part count). Re-runs `applyCenterFocus()` so the center overlay retargets the new section's part instead of staying frozen on the previous section. Drops out of focus entirely only if the new section has zero parts. Fixes the "stuck overlay when switching WOD ↔ CARDIO" bug (v24).

### Center Focus Overlay (⊙)
Full-screen overlay for focused part. Starts at `top: 80px` (top bar stays visible).
Font auto-fit: binary search (14 iterations), 8% safety margin.
Close: press ⊙ again or 🏠.

### QR Code Positioning
`repositionQR()` tries corners: bottom-right → bottom-left → top-right → top-left.
Overlap detection uses **line-level elements only** (`.exercise-line`, `.flow-section-header`, `.scoreboard-table td`) — NOT large containers (false positives).
Call `repositionQR()` 900ms after render and 350ms after mode switches.

## Keyboard / Remote Shortcuts

| Key | Action |
|-----|--------|
| ←→ | Cycle display modes (WOD/SPLIT/BOARD/PR/TIMER) — always resets section filter |
| 1-4 | Direct mode select — always resets section filter |
| ↑↓ | Cycle section filter |
| 5/6 | WOD/CARDIO filter (double-press = show all) |
| 0 | Show all sections |
| 8 | Refresh |
| 9 | Toggle QR |
| Enter | Fullscreen |
| t | Timer mode |
| Space | Start/pause/resume timer (timer mode only) |
| Backspace | Reset timer (timer mode only) |

## Security
- Two-layer auth: Gym PIN (all members) + Coach Password (admin)
- PIN gate at top of `doGet()` — all GET endpoints require PIN except `verifyPin` and `coachLogin`
- Passwords stored in `PropertiesService.getScriptProperties()` server-side

## Google Sheets Tabs
| Tab | Cleanup policy |
|-----|---------------|
| Results | Auto-purge >30 days + manual clear |
| Lifts | Never delete |
| Benchmarks | Never delete |
| PRs | Never delete, only update |
| Athletes, Badges, Challenges, Reactions, WODs, Announcements | Permanent |
| TimerState | Single row, overwritten each command |

## Timer System (added 2026-03-19, phase-display added 2026-04-13)

5th display mode (`mode-timer`). Timer engine runs client-side via `requestAnimationFrame`. Coach controls via Apps Script.

**6 types:** AMRAP (countdown), For Time (count up + cap), EMOM (interval beeps), Tabata (work/rest), Custom intervals (30/10 etc.), MIX (custom intervals)

**State machine:** `idle → configured → countdown321 → running → paused → finished`

**Audio:** Web Audio API + 18 pre-rendered Harry voice MP3s (ElevenLabs) loaded as AudioBuffers for zero-latency playback.

**Sync:** Coach POSTs `timerCommand` to Apps Script. Board polls `getTimerState` every 2s via JSONP. Timer runs locally (no network latency). `getTimerState` is exempt from PIN (like `getWorkoutSheet`).

**Coach panel:** "⏱ טיימר" tab in coach.html. Type selector → config form → START/PAUSE/RESUME/RESET.

### Chained interval detection (`buildWorkoutTimeline`)
Two-layer detection. Layer 1 sequential timeline parser scans lines top→bottom, classifies phases (WORK/REST/TIME_STANDALONE). If 2+ uniform WORK phases + REST found → one chained Tabata-style timer with `skipLastRest: true`. Layer 2 regex fallback (AMRAP N, EMOM N, every X:XX ×N, Tabata 20/10, custom on/off, For Time, t.c N) runs if no chain detected.

Sanity limits for chains: total ≤ 90 min, work ≥ 30s, rest ≤ 10 min, uniform durations only.

Chained timer button label: `${timerName} ×${rounds} · ${workMins}' work / ${restShort} rest` → e.g. `AMRAP ×3 · 10' work / 2' rest`.

### Per-part timer detection (added 2026-05-21)
`extractTimerConfigs` is a **part-aware wrapper** around the core `detectTimers`. When a cell holds a multi-part workout (≥2 `part 1:` / `part 2:` / `part 3:` lines), each part is scanned independently and yields **its own timer button** — a series of timers.

`detectActivityInterval` recognizes the coach's interval style: a work line written as `<duration> <activity>` (`3 min run`, `45 sec sprint`) instead of the literal word "work", paired with a `<duration> rest` line and a separate `×N` / `N sets` multiplier. A time unit is **required** on the work line so a bare rep line (`20 ring row`) is never read as a duration.

`part N` recognition is one shared literal — `PART_HEADER_RE` — reused by the line parser, the warm-up reset, the column-break logic, and the timer splitter (keep them in sync — see the 3-place-pattern note above).

**Timer detection surfaces only explicitly-written values.** Work, rest, and round counts must all be parsed from the coach's text; a block missing a value (e.g. no `×N`) yields **no timer**, never a guessed default. Do not invent times or offer timing variants.

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
- EMOM interval warning ticks (added 2026-04-13)

### SW Cache Versioning
**Critical:** bump `CACHE_NAME` in `sw.js` on every code change (`sw.js` is the source of truth — currently **v79**). Cache-first strategy means old clients serve stale code otherwise.

**Status:** Chained interval display and per-phase voice cues implemented. **Apps Script must be redeployed** to coach's sheet for timer sync to work (console `_timerCb_` / `_scoreCb_` errors until deployed).

## Open Questions (as of 2026-04-13)
- Remove debug `[WORKOUT-FETCH]` console.log lines when stable
- Test font sizes on actual gym TV
- Deploy updated Apps Script for timer sync
- Ask coach: WOD + CARDIO on one screen, or split into separate tabs?
