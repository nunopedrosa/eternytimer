# Eternal Timer

A PWA (Progressive Web App) application to manage multiple "eternal" stopwatches and countdown timers.

## Features
- Two tabs: **Stopwatches** (count up forever) and **Countdowns** (count down to zero and stop).
- Create up to 50 timers per tab.
- Set an initial value for each timer using an iOS-style scrolling wheel picker (days/hours/minutes/seconds).
- Stopwatches count up (elapsed time + initial value); countdowns count down (initial value - elapsed time), stopping at zero.
- Human-readable time format (days, hours, minutes, seconds).
- On-device persistent storage via `localStorage` — timers live in the browser, per browser/device, with no sync between devices.
- PWA support for offline use.

## Tech Stack
- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Storage**: Browser `localStorage`
- No backend — fully static site.

## Setup
Serve the directory with any static file server, e.g.:

```bash
python3 -m http.server 8000
# or
npx serve
```

Then open `http://localhost:8000` in your browser. In production, HTTPS is required for the service worker to register.

## Deployment (DreamHost)
The site is fully static — no PHP or server-side storage needed.

1. Clone the repo into the domain's web directory (the web directory must be the repo root):
   ```bash
   cd ~ && git clone https://github.com/nunopedrosa/eternytimer.git timers.trekm.com
   ```
2. To update later:
   ```bash
   cd ~/timers.trekm.com && git pull
   ```

## Backup (export/import)
Use the icon buttons in the header to export/import all timers as CSV (`eternal-timer-backup-YYYY-MM-DD.csv`). Columns: `id,name,type,initial_value,created_at`. Import merges by `id`: an existing timer with the same id is replaced, otherwise the row is added; rows with an unparseable `created_at` (or that would exceed the 50-per-type limit) are skipped. Names starting with `=`, `+`, `-` or `@` are `'`-prefixed on export and un-prefixed on import (spreadsheet formula-injection guard).

## Implementation Details
- Timers are stored in `localStorage` under the key `eternal-timer.timers`, each with a `type` of `stopwatch` or `countdown` (records created before countdowns existed are treated as `stopwatch`).
- Time is handled using UTC to ensure consistency across timezones.
- The "eternal" nature is achieved by storing the creation timestamp and calculating the elapsed time since then; stopwatches add it to the initial value, countdowns subtract it (clamped at zero).
- Timer names and durations are validated and length/range limited client-side; names are rendered via safe DOM APIs (never `innerHTML`) to prevent stored XSS.

## Security Notes
- All data lives in the browser's `localStorage`. Clearing site data (or using a different browser/device) removes the timers.
