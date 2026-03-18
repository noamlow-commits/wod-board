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
| ←→ | Cycle display modes (WOD/SPLIT/BOARD/PR) — always resets section filter |
| 1-4 | Direct mode select — always resets section filter |
| ↑↓ | Cycle section filter |
| 5/6 | WOD/CARDIO filter (double-press = show all) |
| 0 | Show all sections |
| 8 | Refresh |
| 9 | Toggle QR |
| Enter | Fullscreen |

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

## Open Questions (as of 2026-03-18)
- Does coach prefer WOD + CARDIO on one screen or separate pages?
- Remove debug `[WORKOUT-FETCH]` console.log lines when stable
- Test font sizes on actual gym TV
