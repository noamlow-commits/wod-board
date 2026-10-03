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

`node test/verify-board.mjs` — parser/timer **detection** regression test (golden
snapshots of the real in-page parser against fixture sheets). Run after any
parser/timer change; `--update` to accept intended changes.

`node test/timer-nav.mjs` — timer **runtime** test (boots the page, drives real
timer state + the docked clock's DOM). Covers what the golden harness structurally
cannot: which clocks a stage change turns off, and the countdown-resurrection
guard. Run after any change to timer state, `navigatePart`, or the docked bar.

`node test/equivalence.mjs` — **same meaning ⇒ same result** (added 2026-10-01).
One meaning written many ways (318 timer variants, 178 display lines) must give
the same clock, display ⇄ detection must agree, and display siblings must share
a category. Today's divergences sit in `test/equivalence-known.mjs`, each with
a reason. That file is a **ratchet**: a new divergence fails the run, and so
does a fixed one still listed ("delete it"). **Never add an entry to make
something pass.** Run it after ANY parser, timer or display change.

See [`test/README.md`](test/README.md).

## Correction → Rule (keep this file learning)

When a mistake recurs — a parser edge case that broke twice, a timer format the
coach used that wasn't handled, a deploy step that was forgotten — **write it
down as a rule** instead of just fixing it again:
- **Parser / layout / timer** rules → [`PARSER.md`](PARSER.md) (the deep spec).
- **Open questions for the coach, known-but-unfixed timer defects, and the
  detection roadmap** → [`TIMER_ROADMAP.md`](TIMER_ROADMAP.md). Read its §1
  before changing timer semantics — those answers are hers, not ours.
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

### Auto-update — the TV picks up a deploy by itself (added 2026-09-09)

Two things refresh, on different clocks, and they are easy to confuse:

| what | how often | since |
|---|---|---|
| the **workout** (her sheet → the board) | `settings.refreshInterval`, default **30 s** | always |
| the **app** (a pushed parser/timer fix) | polls every **5 min**, reloads when idle | 2026-09-09 |

The app version is read from **`sw.js`'s `CACHE_NAME`** — the one place a deploy
already bumps. **Do not add a build constant to `index.html`**: two places to
bump is the three-parallel-places trap, and the copy that would silently stop
being bumped is the one that makes the board believe it is current forever.

**The gate is `boardIsIdle()`, and it is stricter than "safe" — it is
"invisible".** A self-reload wipes a running clock off the wall in front of a
class, and it *also* throws away the view she parked the board on
(`displayMode`, the section filter, the part focus are all in memory). So the
board updates only when a reload would change nothing anyone can see: clock
`idle`, no overlay open, the view still exactly what a fresh load produces, and
nobody on the remote for 60 s. Otherwise it waits and re-asks every 30 s.
Waiting indefinitely is a fine outcome — key `7` still reloads by hand.

The baseline view is **captured at the end of the first `startApp()`**, not
hardcoded: that moment *is* what a reload reproduces. No baseline ⇒ no reload,
so the gate fails closed.

Both directions are asserted in `node test/timer-nav.mjs` (12 negative states +
the positive + the reload-loop guard).

**2026-10-02: "the changes were not on the board this morning."** Three changes followed.

- **A finished clock no longer blocks forever.** A clock stays `finished` until someone resets it, so after the last class the gate read "busy" all night. Rule: once the clock has been finished for **15 min** (`STALE_FINISH_MS`) **and** nobody has touched the remote for as long, the reload may wipe it. It may also wipe the `timer` display mode a phone start switched to. Every other view difference still blocks (Noam's call).
- **A stale remote command is not replayed on load.** `lastTimerCommandTs` starts empty on every load, so the first poll applied the **last command ever stored** in TimerState. Yesterday's phone "start" switched the fresh board into timer mode and started a clock nobody asked for. After an auto-update reload, that also left the board busy, so it would never update again. Now the first poll applies a command only if it was issued within 2 min (`STALE_COMMAND_MS`). Later commands are applied as before.
- **The gate says WHY.** `idleBlocker()` returns the reason; `boardIsIdle()` is `idleBlocker() === null`. A small dim badge sits bottom-left: `v162`, or `v162 → v163 ⏳ section filter` while an update waits. The last reason is also stored in `localStorage['wodboard-update-state']`. **To check a deploy at the gym, read the badge.** Key `7` still reloads by hand.

All three are asserted in `timer-nav.mjs`:
- 6 stale-finish cases, positive and negative.
- The reason is recorded and the badge is visible.
- 3 cases for the stale command. ⚠️ **A gate that never fires looks
exactly like a gate that works**, which is why the positive case is tested too,
via the `_doReload` indirection.

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
| n | Skip to next phase (chained/EMOM clocks) — same as the ⏭ הבא button |
| 7 | Full page reload (loads the latest deployed version) |
| 🔄 button, top right | Same full reload, for the gym's basic remote with no number keys (2026-10-03). With a clock on the wall, the first press only arms it ("🔄 לחצי שוב", 4 s) and the second press reloads |
| PageUp/PageDown, ChannelUp/ChannelDown | ◄ ► part navigation (board views only). **A stage change cancels any active clock** (2026-09-30) |

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
