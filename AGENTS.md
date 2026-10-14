# Eternal Timer development baseline

These instructions apply to all development in this repository. Preserve them in
new features, fixes, refactors and dependency changes. They describe required
behaviour, not a claim that every existing implementation already meets it.

Before making changes, read [`../pwa/AGENTS.md`](../pwa/AGENTS.md) as the shared
trekm PWA baseline. This file adds Eternal Timer’s domain rules, compatibility
floor and storage/backup requirements. If the central `pwa` project is not
available locally, use a reviewed copy of that baseline and record its source
date; do not silently skip it.

Start here for code layout, then verify pointers against the implementation and
update this section when entry points or data flows move.

## Code map

| Area | Location |
|------|----------|
| App shell, tabs, modal markup | `index.html` |
| Styles | `css/style.css` |
| Timer logic, UI, CSV import/export | `js/app.js` |
| PWA manifest | `manifest.json` |
| Offline cache | `sw.js` (`CACHE_NAME`, `ASSETS`) |
| Icons (source + build script) | `icons/icon.svg`, `scripts/build-icons.sh` |
| User-facing overview | `README.md` |

All application behaviour lives in a single vanilla JS module (`js/app.js`). There
is no build step and no test runner in CI yet.

## Compatibility

- The minimum supported device is **iPhone 6 running iOS 12.5.7 / Safari 12**.
  Core flows must work in Safari and when launched from the Home Screen as an
  installed PWA.
- Check JavaScript syntax, browser APIs, CSS, touch interaction, viewport layout,
  memory use and download size against that minimum. Node syntax checks or a
  modern browser do not establish Safari 12 compatibility.
- Do not introduce optional chaining, nullish coalescing or unsupported APIs into
  browser code. Examples include `Array.prototype.at`, `String.prototype.replaceAll`,
  `Object.fromEntries` and `File.text()`. Use compatible alternatives; feature
  detection cannot protect a browser from unsupported syntax.
- Preserve existing fallbacks: `FileReader` for CSV import (not `File.text()`),
  Touch Events when `PointerEvent` is missing, `WebKitCSSMatrix` when
  `DOMMatrixReadOnly` is missing, and a non-UUID id generator when
  `crypto.randomUUID` is unavailable.
- New optional browser capabilities need feature detection and a usable fallback.
- Keep processing bounded: respect `MAX_TIMERS_PER_TYPE`, `MAX_LAPS`,
  `MAX_NAME_LENGTH` and `MAX_INITIAL_VALUE_SECONDS`; do not load large external
  datasets at startup.

## Architecture and privacy

- Core timer operation, editing and backup remain local-first. Timers persist in
  **`localStorage`** under the key `eternal-timer.timers`. There is no backend,
  accounts, analytics, telemetry or sync unless project requirements change
  explicitly.
- Keep the static PWA and no-build-step architecture. Justify any new runtime
  dependency by benefit, payload, memory, compatibility, offline use and privacy.
- When adding runtime files or changing cached assets, bump the release id in
  `sw.js` (`CACHE_NAME`), `js/app.js` (`APP_BUILD_ID`), and `index.html`
  (`data-app-version` and versioned CSS/JS URLs). Keep `ASSETS` complete and run
  `node scripts/check-sw-assets.js`. Deploy `sw.js` after other assets. See
  [docs/UPDATES.md](docs/UPDATES.md).
- Timer displays update only while the page is visible; accuracy while the app
  is backgrounded or closed comes from stored timestamps, not a background loop.
- Countdown timers that reach zero while running must be persisted as paused at
  zero (`started_at` null, `elapsed_ms` at full duration).
- Do not upload timer names, lap data or CSV backups by default.

## Data integrity and portability

- **CSV** is the canonical portable backup format documented in `README.md`.
  Columns: `id`, `name`, `type`, `initial_value`, `created_at`, `started_at`,
  `elapsed_ms`, `laps`. Legacy five-column files must still import.
- Import merges by `id`: replace existing timers, append new ones, skip invalid
  rows and rows that would exceed per-type limits. Failed or cancelled import
  must not partially replace stored timers.
- `normalizeTimer()` is the single schema gate for load and import. Preserve
  unknown fields only when explicitly extending the model; do not drop supported
  metadata through edit or export paths.
- Preserve compatibility with existing backups when changing stored fields; document
  migration behaviour in `README.md` when the on-disk shape changes.
- Explain that storage is per device, browser and origin and can be cleared with
  site data. Export/import is the practical recovery path.

## Timer domain rules

- **Types**: `stopwatch` (count up) and `countdown` (count down to zero). Records
  without `type` are treated as stopwatches.
- **Elapsed time**: persisted `elapsed_ms` plus the current segment when
  `started_at` is set. Pause/resume accumulates segments; do not double-count.
- **Display total**: stopwatch = `initial_value` + elapsed; countdown =
  `initial_value` − elapsed (display clamps at zero; finished countdowns do not
  restart from the toggle alone).
- **Stopwatches**: hundredths on the main display; up to `MAX_LAPS` lap totals
  stored in ms; lap list shows split and cumulative times. Lap is available only
  while running. When paused, reset clears `elapsed_ms`, `initial_value` and
  `laps` (display returns to zero).
- **Countdowns**: no lap/reset secondary control; start/stop follows remaining
  time rules above.
- **Time semantics**: timestamps are ISO strings; calculations use UTC parsing
  (`Date.parse` / `Date.now`) for consistency across timezones.
- **Limits**: enforce client-side caps on name length, timer count, initial value
  range and lap count consistently in create, import and normalize paths.

## External data and security

- Treat imported CSV and timer names as untrusted data. Validate structure and
  ranges before write.
- Render user-controlled names via safe DOM APIs (`textContent`, input values).
  Static icon markup may use `innerHTML`; never inject stored names or CSV fields
  into HTML strings.
- Apply the CSV formula-injection guard on export (`'`-prefix for names starting
  with `=`, `+`, `-`, `@`) and strip it on import.
- Avoid unrelated third-party requests in the app shell.

## Verification and documentation

- Read relevant code and `README.md` before changing behaviour. Keep user
  documentation aligned with actual import/export columns and timer semantics.
- Baseline checks for JS changes: `node --check js/app.js` and
  `node scripts/check-sw-assets.js` (also run in CI).
- For runtime changes, verify in browser: create/edit/delete timers, start/stop,
  stopwatch laps and reset while paused, countdown finish, tab switching,
  export/import round trip, swipe-to-delete, modal wheel picker, narrow viewport,
  keyboard focus on controls, and offline reload after a cached visit.
- Report what was verified and what was not. Do not claim Safari 12 or installed-PWA
  compatibility from modern-browser checks alone.

## Deployment

Production hosting is static files on DreamHost (see `README.md`). `git pull` in
the site directory is the documented update path. Do not claim live deployment
from a local preview alone.

See also [`README.md`](README.md) and the shared baseline at
[`../pwa/AGENTS.md`](../pwa/AGENTS.md).
