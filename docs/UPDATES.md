# App-shell updates

## Release identifier

The running app, HTML shell and service worker must identify the same release:

- `js/app.js`: `APP_BUILD_ID`
- `index.html`: `data-app-version` and the `v` query on linked CSS/JS
- `sw.js`: `CACHE_NAME` and matching versioned CSS/JS entries in `ASSETS`

Run `node scripts/check-sw-assets.js` after changing any of these.

When bumping a release, replace the full identifier (for example `eternal-timer-v10`) in all of those places.

## Update behaviour

- A new service worker downloads in the background and waits until the user chooses **Reload** on the update banner (or applies an already-waiting worker the same way).
- Timers keep running while the app is closed: elapsed time is derived from `started_at`, `elapsed_ms` and wall clock when the UI is shown again. The display loop runs only while the page is visible.
- Countdown timers that reach zero while running are persisted as paused at zero (`started_at` cleared, `elapsed_ms` set to the full duration).

## Deploying

1. Upload changed runtime assets and `index.html`.
2. Upload **`sw.js` last** so the new cache name is not advertised before its files exist.
3. Ask users to open the app online once; when the banner appears, tap **Reload**.

Documentation-only edits do not require a release bump.
