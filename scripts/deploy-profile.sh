# App-owned publication contract; common engine: BaseCentral deploy 1.0.0.
APP_ID=eternytimer
SOURCE_SUBDIR=.
DEFAULT_DESTINATION="${DEPLOY_SITE:-$HOME/timers.basecentral.link}"
DEPLOY_URL=https://timers.basecentral.link
PUBLIC_FILES=$(cat <<'PUBLIC_FILES'
css/style.css
favicon.ico
icons/apple-touch-icon.png
icons/icon-192.png
icons/icon-512.png
icons/icon.svg
index.html
js/app.js
manifest.json
shared-chevron.svg
shared-controls.css
shared-icons.svg
sw.js
PUBLIC_FILES
)
