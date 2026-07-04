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

## Testing

`node test/verify-board.mjs` — parser/timer regression test (golden snapshots of
the real in-page parser against fixture sheets). Run after any parser/timer
change; `--update` to accept intended changes. See [`test/README.md`](test/README.md).

## Correction → Rule (keep this file learning)

When a mistake recurs — a parser edge case that broke twice, a timer format the
coach used that wasn't handled, a deploy step that was forgotten — **write it
down as a rule** instead of just fixing it again:
- **Parser / layout / timer** rules → [`PARSER.md`](PARSER.md) (the deep spec).
- **Architecture / workflow / deploy** rules → this file, below.
- **A parser regression a test would have caught** → also add a fixture to
  `test/verify-board.mjs` and `--update` the golden, so it can't silently return.

A correction made only in chat is lost next session; a rule here (or a fixture
in the test) is permanent. Prefer the smallest durable guard over re-fixing.

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

→ Full spec moved to [`PARSER.md`](PARSER.md) (Layout System). Keep new layout detail there.

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

## Timer System

→ Full spec moved to [`PARSER.md`](PARSER.md) (Timer System). Keep new timer detail there.

## Open Questions (as of 2026-04-13)
- Remove debug `[WORKOUT-FETCH]` console.log lines when stable
- Test font sizes on actual gym TV
- Deploy updated Apps Script for timer sync
- Ask coach: WOD + CARDIO on one screen, or split into separate tabs?
