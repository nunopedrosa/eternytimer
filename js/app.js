const errorMsg = document.getElementById('error-message');
const mainEl = document.querySelector('main');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.querySelector('.close-btn');
const addTimerBtn = document.getElementById('add-timer-btn');
const selectedValueDisplay = document.getElementById('selected-value-display');
const timerNameField = document.getElementById('timer-name-field');
const tabButtons = document.querySelectorAll('.tab-btn');
const toggleAllBtn = document.getElementById('toggle-all-btn');

// Maps the active UI tab to the timer "type" persisted in localStorage,
// and to the DOM elements that make up each tab's list + panel + count.
const TABS = {
    stopwatches: {
        type: 'stopwatch',
        panel: document.getElementById('stopwatches-panel'),
        list: document.getElementById('stopwatches-list'),
        countEl: document.getElementById('stopwatches-count'),
        modalTitle: 'New Stopwatch',
        addLabel: 'Add Stopwatch',
        defaultName: 'New Stopwatch'
    },
    countdowns: {
        type: 'countdown',
        panel: document.getElementById('countdowns-panel'),
        list: document.getElementById('countdowns-list'),
        countEl: document.getElementById('countdowns-count'),
        modalTitle: 'New Countdown',
        addLabel: 'Add Countdown',
        defaultName: 'New Countdown'
    }
};

let currentTab = 'stopwatches';
let timers = [];
let pickerValues = { days: 0, hours: 0, minutes: 0, seconds: 0 };

// Static, non-user-controlled markup, safe to inject via innerHTML.
const TRASH_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7h16"/>
        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>
        <path d="M10 11v6"/>
        <path d="M14 11v6"/>
    </svg>
`;

const LAP_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="13" r="8"/>
        <path d="M9 2h6"/>
        <path d="M12 2v2"/>
        <path d="M18.5 6.5l1.2-1.2"/>
        <path d="M12 13V5a8 8 0 0 1 8 8z" fill="currentColor" stroke="none"/>
    </svg>
`;

const PLAY_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 5.5v13l11-6.5z" fill="currentColor"/>
    </svg>
`;

const STOP_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>
    </svg>
`;

function timerType(timer) {
    // Older records created before countdowns existed have no "type" field.
    return timer.type === 'countdown' ? 'countdown' : 'stopwatch';
}

const STORAGE_KEY = 'eternal-timer.timers';
const MAX_TIMERS_PER_TYPE = 50;
const MAX_LAPS = 100;
const MAX_NAME_LENGTH = 100;
const MAX_INITIAL_VALUE_SECONDS = 100 * 365 * 24 * 3600; // 100 years

function normalizeType(type) {
    return type === 'countdown' ? 'countdown' : 'stopwatch';
}

function sanitizeName(name) {
    if (typeof name !== 'string') {
        return null;
    }
    name = name.replace(/[\x00-\x1F\x7F]/g, '').trim();
    if (name === '') {
        return null;
    }
    return name.slice(0, MAX_NAME_LENGTH);
}

function makeId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function normalizeTimer(raw) {
    const type = normalizeType(raw.type);
    const created_at = Number.isNaN(Date.parse(raw.created_at)) ? new Date().toISOString() : raw.created_at;

    let started_at;
    let elapsed_ms;
    if (raw.started_at === undefined && raw.elapsed_ms === undefined) {
        // Legacy record (pre pause/resume): behaves as running since creation.
        started_at = created_at;
        elapsed_ms = 0;
    } else {
        started_at = (raw.started_at === null || raw.started_at === '' || Number.isNaN(Date.parse(raw.started_at)))
            ? null
            : raw.started_at;
        elapsed_ms = Math.max(0, Math.floor(Number(raw.elapsed_ms) || 0));
    }

    let laps = [];
    if (type === 'stopwatch' && Array.isArray(raw.laps)) {
        laps = raw.laps
            .map(Number)
            .filter(n => Number.isFinite(n) && n >= 0)
            .map(Math.floor)
            .slice(0, MAX_LAPS);
    }

    const sanitizedName = sanitizeName(raw.name);
    return {
        id: (typeof raw.id === 'string' && raw.id !== '') ? raw.id : makeId(),
        name: sanitizedName === null ? 'Timer' : sanitizedName,
        type: type,
        initial_value: Math.min(MAX_INITIAL_VALUE_SECONDS, Math.max(0, Math.floor(Number(raw.initial_value) || 0))),
        created_at: created_at,
        started_at: started_at,
        elapsed_ms: elapsed_ms,
        laps: laps
    };
}

function loadTimers() {
    let parsed;
    try {
        parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) {
        return [];
    }
    return parsed.map(normalizeTimer);
}

function saveTimers() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
    } catch (err) {
        console.error(err);
        errorMsg.textContent = 'Unable to save timers (storage unavailable or full).';
    }
}

function loadAndRender() {
    timers = loadTimers();
    renderTimers();
}

function addTimer(initialValue, name, type) {
    initialValue = Math.floor(Number(initialValue));
    if (!Number.isFinite(initialValue) || initialValue < 0 || initialValue > MAX_INITIAL_VALUE_SECONDS) {
        errorMsg.textContent = 'initial_value out of range';
        return;
    }

    type = normalizeType(type);
    const sanitizedName = sanitizeName(name);
    name = sanitizedName === null ? 'Timer' : sanitizedName;

    const typeCount = timers.filter(t => timerType(t) === type).length;
    if (typeCount >= MAX_TIMERS_PER_TYPE) {
        errorMsg.textContent = `Maximum of ${MAX_TIMERS_PER_TYPE} ${type} timers allowed`;
        return;
    }

    timers.push({
        id: makeId(),
        name: name,
        type: type,
        initial_value: initialValue,
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        elapsed_ms: 0,
        laps: []
    });

    saveTimers();
    renderTimers();
    errorMsg.textContent = '';
    closeModal();
}

function updateTimerName(id, newName) {
    const timer = timers.find(t => t.id === id);
    if (!timer) return;
    const name = sanitizeName(newName);
    if (name === null) return;
    timer.name = name;
    saveTimers();
}

function deleteTimer(id) {
    timers = timers.filter(t => t.id !== id);
    saveTimers();
    renderTimers();
}

// Elapsed time is split into a persisted accumulated part (elapsed_ms, from
// previous run segments) plus the current running segment (now - started_at).
function elapsedMs(timer, nowMs) {
    return timer.elapsed_ms + (timer.started_at ? Math.max(0, nowMs - Date.parse(timer.started_at)) : 0);
}

// Total shown on the card: count-up for stopwatches, remaining for countdowns
// (may go negative; display clamps to 0).
function totalMs(timer, nowMs) {
    const elapsed = elapsedMs(timer, nowMs);
    return timerType(timer) === 'countdown'
        ? timer.initial_value * 1000 - elapsed
        : timer.initial_value * 1000 + elapsed;
}

function toggleTimer(id) {
    const timer = timers.find(t => t.id === id);
    if (!timer) return;
    const now = Date.now();
    if (timerType(timer) === 'countdown' && totalMs(timer, now) <= 0) {
        return;
    }
    if (timer.started_at) {
        timer.elapsed_ms += Math.max(0, now - Date.parse(timer.started_at));
        timer.started_at = null;
    } else {
        timer.started_at = new Date().toISOString();
    }
    saveTimers();
    renderTimers();
}

function addLap(id) {
    const timer = timers.find(t => t.id === id);
    if (!timer || timerType(timer) !== 'stopwatch') return;
    if (!timer.started_at || timer.laps.length >= MAX_LAPS) return;
    timer.laps.push(totalMs(timer, Date.now()));
    saveTimers();
    renderTimers();
}

// "Running" = has a live segment AND (for countdowns) hasn't hit zero.
function isRunning(timer, nowMs) {
    return !!timer.started_at && !(timerType(timer) === 'countdown' && totalMs(timer, nowMs) <= 0);
}

function updateToggleAllButton() {
    const type = TABS[currentTab].type;
    const scoped = timers.filter(t => timerType(t) === type);
    if (scoped.length === 0) {
        toggleAllBtn.hidden = true;
        return;
    }
    const now = Date.now();
    const anyRunning = scoped.some(t => isRunning(t, now));
    const state = anyRunning ? 'stop' : 'start';
    if (toggleAllBtn.dataset.state !== state) {
        toggleAllBtn.dataset.state = state;
        toggleAllBtn.classList.toggle('stop', state === 'stop');
        toggleAllBtn.classList.toggle('start', state === 'start');
        toggleAllBtn.innerHTML = (state === 'stop' ? STOP_ICON_SVG : PLAY_ICON_SVG) +
            `<span class="fab-label">${state === 'stop' ? 'Stop All' : 'Start All'}</span>`;
        toggleAllBtn.setAttribute('aria-label', state === 'stop' ? 'Stop all' : 'Start all');
    }
    // "Start" is a no-op when every paused scoped timer is a finished countdown.
    const startable = scoped.some(t => !t.started_at && !(timerType(t) === 'countdown' && totalMs(t, now) <= 0));
    toggleAllBtn.disabled = state === 'start' && !startable;
    toggleAllBtn.hidden = false;
}

toggleAllBtn.addEventListener('click', () => {
    const type = TABS[currentTab].type;
    const now = Date.now();
    let changed = false;
    timers.forEach(timer => {
        if (timerType(timer) !== type) return;
        if (toggleAllBtn.dataset.state === 'stop') {
            if (timer.started_at) {
                timer.elapsed_ms += Math.max(0, now - Date.parse(timer.started_at));
                timer.started_at = null;
                changed = true;
            }
        } else if (timer.started_at === null &&
                   !(timerType(timer) === 'countdown' && totalMs(timer, now) <= 0)) {
            timer.started_at = new Date().toISOString();
            changed = true;
        }
    });
    if (changed) {
        saveTimers();
        renderTimers();
    }
});

// CSV export/import (backup)

const statusMsg = document.getElementById('status-message');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file');

const CSV_HEADERS = ['id', 'name', 'type', 'initial_value', 'created_at', 'started_at', 'elapsed_ms', 'laps'];

function setStatus(text, isError) {
    statusMsg.textContent = text;
    statusMsg.classList.toggle('error', !!isError);
}

function csvEscape(value) {
    value = String(value);
    if (/[",\r\n]/.test(value)) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}

function exportTimers() {
    if (timers.length === 0) {
        setStatus('No timers to export');
        return;
    }
    const rows = [CSV_HEADERS.join(',')];
    timers.forEach(timer => {
        let name = timer.name;
        if (/^[=+\-@]/.test(name)) {
            name = "'" + name;
        }
        rows.push([timer.id, name, timerType(timer), timer.initial_value, timer.created_at,
            timer.started_at || '', timer.elapsed_ms, timer.laps.join(';')]
            .map(csvEscape).join(','));
    });
    const blob = new Blob([rows.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `eternal-timer-backup-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${timers.length} timers.`);
}

// Minimal RFC 4180 parser: quoted fields, doubled quotes, embedded
// newlines, CRLF/LF, trailing newline, BOM.
function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') {
                i++;
            }
            row.push(field);
            field = '';
            rows.push(row);
            row = [];
        } else {
            field += c;
        }
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

function importTimers(text) {
    const rows = parseCSV(text);
    if (rows.length === 0) {
        setStatus('Invalid CSV: missing required columns', true);
        return;
    }
    const header = rows[0].map(h => h.trim().toLowerCase());
    const colIndex = {};
    let missing = false;
    ['name', 'type', 'initial_value', 'created_at'].forEach(name => {
        const idx = header.indexOf(name);
        if (idx === -1) {
            missing = true;
        } else {
            colIndex[name] = idx;
        }
    });
    colIndex.id = header.indexOf('id');
    // Pause/lap columns are optional: legacy 5-column files must still import.
    ['started_at', 'elapsed_ms', 'laps'].forEach(name => {
        colIndex[name] = header.indexOf(name);
    });
    if (missing) {
        setStatus('Invalid CSV: missing required columns', true);
        return;
    }

    const dataRows = rows.slice(1).filter(r => r.length > 1 || r[0] !== '');
    if (dataRows.length === 0) {
        setStatus('No timers found in file');
        return;
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    dataRows.forEach(r => {
        const raw = {
            id: colIndex.id === -1 ? '' : r[colIndex.id],
            name: r[colIndex.name],
            type: r[colIndex.type],
            initial_value: r[colIndex.initial_value],
            created_at: r[colIndex.created_at]
        };
        if (colIndex.started_at !== -1) {
            raw.started_at = r[colIndex.started_at] === '' ? null : r[colIndex.started_at];
        }
        if (colIndex.elapsed_ms !== -1) {
            raw.elapsed_ms = r[colIndex.elapsed_ms];
        }
        if (colIndex.laps !== -1) {
            raw.laps = r[colIndex.laps].split(';').filter(s => s !== '');
        }
        if (Number.isNaN(Date.parse(raw.created_at))) {
            skipped++;
            return;
        }
        // Strip the formula-injection guard prefix added on export.
        if (typeof raw.name === 'string' && /^'[=+\-@]/.test(raw.name)) {
            raw.name = raw.name.slice(1);
        }
        const record = normalizeTimer(raw);
        const existingIndex = timers.findIndex(t => t.id === record.id);
        if (existingIndex !== -1) {
            timers[existingIndex] = record;
            updated++;
            return;
        }
        const typeCount = timers.filter(t => timerType(t) === record.type).length;
        if (typeCount >= MAX_TIMERS_PER_TYPE) {
            skipped++;
            return;
        }
        timers.push(record);
        added++;
    });

    saveTimers();
    renderTimers();
    let msg = `Imported ${added + updated} timers (${updated} updated, ${added} added).`;
    if (skipped > 0) {
        msg += ` Skipped ${skipped}.`;
    }
    setStatus(msg);
}

// File.text is Safari 14+; FileReader works everywhere this app targets.
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result));
        reader.addEventListener('error', () => reject(reader.error));
        reader.readAsText(file);
    });
}

exportBtn.addEventListener('click', exportTimers);
importBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files[0];
    importFileInput.value = '';
    if (!file) return;
    try {
        importTimers(await readFileAsText(file));
    } catch (err) {
        console.error(err);
        setStatus('Failed to read file', true);
    }
});

// Returns the duration split into a "days" part and a "hh:mm:ss" part, so the
// caller can render them in separately-sized columns. This keeps the
// hh:mm:ss digits from shifting horizontally once a timer crosses the
// 1-day mark (or gains an extra day digit).
function formatDuration(ms, showFraction) {
    ms = Math.max(0, Math.floor(ms));
    const totalSeconds = Math.floor(ms / 1000);
    const d = Math.floor(totalSeconds / (3600 * 24));
    const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    const cc = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');

    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');

    return {
        days: d > 0 ? String(d) : '',
        time: showFraction ? `${hh}:${mm}:${ss}.${cc}` : `${hh}:${mm}:${ss}`
    };
}

// The days span keeps a permanent child unit span ("d") so toggling between
// "has days" and "no days" only flips text/visibility, not structure.
function setDays(daysEl, days) {
    let unitEl = daysEl.querySelector('.timer-days-unit');
    if (!unitEl) {
        unitEl = document.createElement('span');
        unitEl.className = 'timer-days-unit';
        unitEl.textContent = 'd';
        daysEl.appendChild(unitEl);
    }
    daysEl.firstChild.textContent = days;
    unitEl.hidden = days === '';
    daysEl.classList.toggle('has-days', days !== '');
}

function buildTimerCard(timer) {
    const isStopwatch = timerType(timer) === 'stopwatch';
    const card = document.createElement('div');
    card.className = 'timer-card';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'timer-name-input';
    nameInput.maxLength = 100;
    nameInput.value = timer.name;
    nameInput.dataset.id = timer.id;

    const display = document.createElement('div');
    display.className = 'timer-display';
    display.id = `display-${timer.id}`;

    const daysEl = document.createElement('span');
    daysEl.className = 'timer-days';
    daysEl.appendChild(document.createTextNode(''));
    setDays(daysEl, '');

    const timeEl = document.createElement('span');
    timeEl.className = 'timer-time';
    timeEl.textContent = '--';

    display.appendChild(daysEl);
    display.appendChild(timeEl);

    const row = document.createElement('div');
    row.className = 'timer-row';
    row.appendChild(display);

    const controls = document.createElement('div');
    controls.className = 'timer-controls';

    if (isStopwatch) {
        const lapBtn = document.createElement('button');
        lapBtn.type = 'button';
        lapBtn.className = 'ctrl-btn lap-btn';
        lapBtn.dataset.id = timer.id;
        lapBtn.setAttribute('aria-label', 'Lap');
        lapBtn.innerHTML = LAP_ICON_SVG;
        lapBtn.disabled = !timer.started_at || timer.laps.length >= MAX_LAPS;
        controls.appendChild(lapBtn);
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'ctrl-btn toggle-btn';
    toggleBtn.dataset.id = timer.id;
    const running = !!timer.started_at;
    toggleBtn.innerHTML = running ? STOP_ICON_SVG : PLAY_ICON_SVG;
    toggleBtn.setAttribute('aria-label', running ? 'Stop' : 'Start');
    toggleBtn.classList.toggle('running', running);
    controls.appendChild(toggleBtn);

    row.appendChild(controls);

    const content = document.createElement('div');
    content.className = 'timer-card-content';
    content.appendChild(nameInput);
    content.appendChild(row);

    if (isStopwatch && timer.laps.length > 0) {
        const splits = timer.laps.map((lap, i) => lap - (i > 0 ? timer.laps[i - 1] : 0));
        let fastestIdx = -1, slowestIdx = -1;
        if (splits.length >= 2) {
            fastestIdx = splits.indexOf(Math.min(...splits));
            slowestIdx = splits.indexOf(Math.max(...splits));
            if (fastestIdx === slowestIdx) {
                fastestIdx = slowestIdx = -1; // all equal: nothing to colour
            }
        }
        const lapList = document.createElement('ol');
        lapList.className = 'lap-list';
        for (let i = timer.laps.length - 1; i >= 0; i--) {
            const row = document.createElement('li');
            row.className = 'lap-row';
            if (i === fastestIdx) row.classList.add('lap-fastest');
            if (i === slowestIdx) row.classList.add('lap-slowest');

            const indexEl = document.createElement('span');
            indexEl.className = 'lap-index';
            indexEl.textContent = `Lap ${i + 1}`;

            const prev = i > 0 ? timer.laps[i - 1] : 0;
            const split = formatDuration(timer.laps[i] - prev, true);
            const splitEl = document.createElement('span');
            splitEl.className = 'lap-split';
            splitEl.textContent = `${split.days ? split.days + 'd ' : ''}${split.time}`;

            const total = formatDuration(timer.laps[i], true);
            const totalEl = document.createElement('span');
            totalEl.className = 'lap-total';
            totalEl.textContent = `${total.days ? total.days + 'd ' : ''}${total.time}`;

            row.appendChild(indexEl);
            row.appendChild(splitEl);
            row.appendChild(totalEl);
            lapList.appendChild(row);
        }
        content.appendChild(lapList);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.dataset.id = timer.id;
    deleteBtn.setAttribute('aria-label', `Delete ${timer.name}`);
    deleteBtn.setAttribute('tabindex', '-1');
    deleteBtn.innerHTML = TRASH_ICON_SVG;
    const deleteLabel = document.createElement('span');
    deleteLabel.className = 'delete-label';
    deleteLabel.textContent = 'Delete';
    deleteBtn.appendChild(deleteLabel);

    const actions = document.createElement('div');
    actions.className = 'swipe-actions';
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    card.appendChild(content);
    return card;
}

function renderTimers() {
    Object.values(TABS).forEach(tab => {
        tab.list.innerHTML = '';
    });

    const counts = { stopwatch: 0, countdown: 0 };
    timers.forEach(timer => {
        counts[timerType(timer)]++;
    });
    TABS.stopwatches.countEl.textContent = counts.stopwatch;
    TABS.countdowns.countEl.textContent = counts.countdown;

    timers.forEach(timer => {
        const tab = timerType(timer) === 'countdown' ? TABS.countdowns : TABS.stopwatches;
        tab.list.appendChild(buildTimerCard(timer));
    });

    openCard = null; // cards were rebuilt; any open reference is stale
    updateDisplays();
    fitDisplays();
    updateToggleAllButton();
}

// Auto-fit: shrink all displays in each visible list to the largest size that
// lets the widest one fit its flex slot (capped at --display-max).
// justify-content:flex-end overflows to the left, which scrollWidth doesn't
// capture — measure the children (they keep content width as flex items).
function displayContentWidth(el) {
    return Array.from(el.children).reduce((sum, c) =>
        sum + c.getBoundingClientRect().width + parseFloat(getComputedStyle(c).marginRight), 0);
}

function fitDisplays() {
    const rootStyle = getComputedStyle(document.documentElement);
    const maxPx = parseFloat(rootStyle.getPropertyValue('--display-max')) * parseFloat(rootStyle.fontSize);
    Object.values(TABS).forEach(tab => {
        if (!tab.panel.classList.contains('active')) return; // hidden panels measure 0
        const displays = Array.from(tab.list.querySelectorAll('.timer-display'));
        if (displays.length === 0) return;
        let size = maxPx;
        displays.forEach(el => {
            el.style.fontSize = maxPx + 'px';
            const available = el.clientWidth; // flex:1 slot width, unaffected by content
            const needed = displayContentWidth(el);
            if (needed > available && needed > 0) size = Math.min(size, Math.floor(maxPx * available / needed));
        });
        size = Math.max(size, 20);
        // Glyph advance rounding makes the scaled estimate land a few px wide;
        // step down until the widest display actually fits.
        for (let guard = 0; guard < 10 && size > 20; guard++) {
            let over = 0;
            displays.forEach(el => {
                el.style.fontSize = size + 'px';
                over = Math.max(over, displayContentWidth(el) - el.clientWidth);
            });
            if (over <= 0) break;
            size--;
        }
        displays.forEach(el => { el.style.fontSize = size + 'px'; });
    });
}

let fitResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(fitResizeTimer);
    fitResizeTimer = setTimeout(fitDisplays, 100);
});

// Delegation for name updates (blur doesn't bubble, so this needs capture)
mainEl.addEventListener('blur', (e) => {
    if (e.target.classList.contains('timer-name-input')) {
        const id = e.target.dataset.id;
        const newName = e.target.value.trim() || 'Timer';
        e.target.value = newName;
        updateTimerName(id, newName);
    }
}, true);

// iOS-style swipe-to-delete: dragging a card's content left reveals the
// delete panel underneath. Delegated on mainEl since cards are rebuilt.
const SWIPE_OPEN_WIDTH = 88;
const SWIPE_COMMIT = 8;
const SWIPE_OPEN_THRESHOLD = SWIPE_OPEN_WIDTH / 2;
// Pointer Events need iOS 13+; fall back to Touch Events on iOS 12.
const HAS_POINTER = 'PointerEvent' in window;
let swipe = null;
let openCard = null;
let suppressClick = false;

function cardContent(card) {
    return card.querySelector('.timer-card-content');
}

function setDeleteTabIndex(card, value) {
    const btn = card.querySelector('.delete-btn');
    if (btn) btn.setAttribute('tabindex', value);
}

function openCardPanel(card) {
    card.classList.add('open');
    cardContent(card).style.transform = `translateX(${-SWIPE_OPEN_WIDTH}px)`;
    setDeleteTabIndex(card, '0');
    openCard = card;
}

function closeCardPanel(card) {
    if (!card) return;
    card.classList.remove('open');
    const content = cardContent(card);
    if (content) content.style.transform = 'translateX(0)';
    setDeleteTabIndex(card, '-1');
    if (openCard === card) openCard = null;
}

function startSwipe(target, clientX, clientY, button, pointerId) {
    suppressClick = false;
    if (button !== 0) return;
    const content = target.closest('.timer-card-content');
    if (!content || target.closest('button')) return;
    const card = content.closest('.timer-card');
    if (openCard && openCard !== card) {
        closeCardPanel(openCard);
    }
    swipe = {
        content: content,
        card: card,
        startX: clientX,
        startY: clientY,
        startOffset: card.classList.contains('open') ? -SWIPE_OPEN_WIDTH : 0,
        dragging: false,
        pointerId: pointerId
    };
}

function moveSwipe(clientX, clientY, e) {
    if (!swipe) return;
    const dx = clientX - swipe.startX;
    const dy = clientY - swipe.startY;
    if (!swipe.dragging) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_COMMIT) {
            swipe = null; // vertical scroll wins
            return;
        }
        if (Math.abs(dx) > SWIPE_COMMIT) {
            swipe.dragging = true;
            if (swipe.pointerId !== undefined && swipe.content.setPointerCapture) {
                swipe.content.setPointerCapture(swipe.pointerId);
            }
            swipe.content.classList.add('swiping');
            const active = document.activeElement;
            if (active && active.classList.contains('timer-name-input') && swipe.card.contains(active)) {
                active.blur();
            }
        } else {
            return;
        }
    }
    let offset = swipe.startOffset + dx;
    if (offset < -SWIPE_OPEN_WIDTH) {
        // small rubber-band over-drag past the open position
        offset = -SWIPE_OPEN_WIDTH - Math.min(24, (offset + SWIPE_OPEN_WIDTH) / 2 * -1);
    }
    offset = Math.min(0, offset);
    swipe.content.style.transform = `translateX(${offset}px)`;
    e.preventDefault();
}

function endSwipe() {
    if (!swipe) return;
    if (swipe.dragging) {
        // Read the settled position before re-enabling the transition, or an
        // unflushed final drag step reads back as the transition's start value.
        const transform = getComputedStyle(swipe.content).transform;
        const matrix = typeof DOMMatrixReadOnly === 'undefined'
            ? new WebKitCSSMatrix(transform)
            : new DOMMatrixReadOnly(transform);
        swipe.content.classList.remove('swiping');
        if (matrix.m41 <= -SWIPE_OPEN_THRESHOLD) {
            openCardPanel(swipe.card);
        } else {
            closeCardPanel(swipe.card);
        }
        suppressClick = true;
    }
    swipe = null;
}

if (HAS_POINTER) {
    mainEl.addEventListener('pointerdown', (e) => {
        startSwipe(e.target, e.clientX, e.clientY, e.button, e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
        moveSwipe(e.clientX, e.clientY, e);
    }, { passive: false });
    window.addEventListener('pointerup', endSwipe);
    window.addEventListener('pointercancel', endSwipe);
} else {
    mainEl.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) return;
        const t = e.touches[0];
        startSwipe(e.target, t.clientX, t.clientY, 0);
    });
    window.addEventListener('touchmove', (e) => {
        if (!swipe) return;
        if (e.touches.length > 1) {
            endSwipe();
            return;
        }
        const t = e.touches[0];
        moveSwipe(t.clientX, t.clientY, e);
    }, { passive: false });
    window.addEventListener('touchend', endSwipe);
    window.addEventListener('touchcancel', endSwipe);
}

// Clicking outside the open panel (or pressing Escape) closes it.
// Capture phase: must run before the bubbling mainEl click handler clears
// suppressClick, so the click ending a drag can't re-close a just-opened card.
document.addEventListener('click', (e) => {
    if (suppressClick || !openCard) return;
    if (!e.target.closest('.swipe-actions')) {
        closeCardPanel(openCard);
    }
}, true);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openCard) {
        closeCardPanel(openCard);
    }
});

// Delegation for card buttons (delete / start-stop / lap)
mainEl.addEventListener('click', (e) => {
    if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        return;
    }
    const toggleBtn = e.target.closest('.toggle-btn');
    if (toggleBtn) {
        toggleTimer(toggleBtn.dataset.id);
        return;
    }
    const lapBtn = e.target.closest('.lap-btn');
    if (lapBtn) {
        addLap(lapBtn.dataset.id);
        return;
    }
    const btn = e.target.closest('.delete-btn');
    if (!btn) return;

    const id = btn.dataset.id;
    const timer = timers.find(t => t.id === id);
    const label = timer ? timer.name : 'this timer';
    if (confirm(`Delete "${label}"? This cannot be undone.`)) {
        deleteTimer(id);
    }
});

function updateDisplays() {
    const now = Date.now();
    let daysChanged = false;
    timers.forEach(timer => {
        const isCountdown = timerType(timer) === 'countdown';
        const total = totalMs(timer, now);
        const finished = isCountdown && total <= 0;

        const displayEl = document.getElementById(`display-${timer.id}`);
        const card = displayEl ? displayEl.closest('.timer-card') : null;
        if (displayEl) {
            const { days, time } = formatDuration(total, !isCountdown);
            const daysEl = displayEl.querySelector('.timer-days');
            if (daysEl.dataset.days !== days) {
                daysEl.dataset.days = days;
                setDays(daysEl, days);
                daysChanged = true;
            }
            const timeEl = displayEl.querySelector('.timer-time');
            if (timeEl.textContent !== time) {
                timeEl.textContent = time;
            }
            displayEl.classList.toggle('finished', finished);
        }
        if (card) {
            const toggleBtn = card.querySelector('.toggle-btn');
            if (toggleBtn) {
                const running = isRunning(timer, now);
                if (toggleBtn.classList.contains('running') !== running) {
                    toggleBtn.innerHTML = running ? STOP_ICON_SVG : PLAY_ICON_SVG;
                    toggleBtn.setAttribute('aria-label', running ? 'Stop' : 'Start');
                    toggleBtn.classList.toggle('running', running);
                }
                toggleBtn.disabled = finished;
            }
            const lapBtn = card.querySelector('.lap-btn');
            if (lapBtn) {
                lapBtn.disabled = !timer.started_at || timer.laps.length >= MAX_LAPS;
            }
        }
    });
    if (daysChanged) {
        fitDisplays();
    }
    updateToggleAllButton();
}

// Tab switching
function switchTab(tabName) {
    if (!TABS[tabName] || tabName === currentTab) {
        currentTab = tabName;
        return;
    }
    currentTab = tabName;

    Object.entries(TABS).forEach(([name, tab]) => {
        tab.panel.classList.toggle('active', name === tabName);
    });
    tabButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    fitDisplays();
    updateToggleAllButton();
}

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Modal Logic
function openModal() {
    const tab = TABS[currentTab];
    modal.style.display = 'flex';
    pickerValues = { days: 0, hours: 0, minutes: 0, seconds: 0 };
    modalTitle.textContent = tab.modalTitle;
    addTimerBtn.textContent = tab.addLabel;
    timerNameField.value = tab.defaultName;
    errorMsg.textContent = '';
    resetWheels();
    updateSelectedDisplay();
    timerNameField.focus();
    timerNameField.select();
}

function closeModal() {
    modal.style.display = 'none';
    errorMsg.textContent = '';
}

function updateSelectedDisplay() {
    const d = pickerValues.days;
    const h = String(pickerValues.hours).padStart(2, '0');
    const m = String(pickerValues.minutes).padStart(2, '0');
    const s = String(pickerValues.seconds).padStart(2, '0');

    if (d > 0) {
        selectedValueDisplay.textContent = `${d}d ${h}:${m}:${s}`;
    } else {
        selectedValueDisplay.textContent = `${h}:${m}:${s}`;
    }
}

openModalBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
window.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

addTimerBtn.addEventListener('click', () => {
    const totalSeconds = (pickerValues.days * 86400) +
                         (pickerValues.hours * 3600) +
                         (pickerValues.minutes * 60) +
                         pickerValues.seconds;
    const name = timerNameField.value.trim() || TABS[currentTab].defaultName;
    addTimer(totalSeconds, name, TABS[currentTab].type);
});

// iOS-style wheel picker
const WHEEL_ITEM_HEIGHT = 36; // must match .picker-item height in CSS
const WHEEL_UNITS = [
    { key: 'days', max: 31, pad: false },
    { key: 'hours', max: 23, pad: true },
    { key: 'minutes', max: 59, pad: true },
    { key: 'seconds', max: 59, pad: true }
];

function buildWheels() {
    WHEEL_UNITS.forEach(({ key, max, pad }) => {
        const column = document.querySelector(`.wheel-col[data-unit="${key}"]`);
        const list = column.querySelector('.wheel-list');
        list.innerHTML = '';

        for (let i = 0; i <= max; i++) {
            const item = document.createElement('div');
            item.className = 'picker-item';
            item.textContent = pad ? String(i).padStart(2, '0') : String(i);
            list.appendChild(item);
        }

        let scrollTimeout;
        column.addEventListener('scroll', () => {
            const items = list.children;
            const rawIndex = column.scrollTop / WHEEL_ITEM_HEIGHT;
            const index = Math.max(0, Math.min(Math.round(rawIndex), items.length - 1));

            highlightActiveItem(items, index);
            if (pickerValues[key] !== index) {
                pickerValues[key] = index;
                updateSelectedDisplay();
            }

            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                // Ensure we land exactly on the item CSS scroll-snap settled on.
                const settledIndex = Math.max(0, Math.min(Math.round(column.scrollTop / WHEEL_ITEM_HEIGHT), items.length - 1));
                highlightActiveItem(items, settledIndex);
                pickerValues[key] = settledIndex;
                updateSelectedDisplay();
            }, 120);
        }, { passive: true });
    });
}

function highlightActiveItem(items, activeIndex) {
    for (let i = 0; i < items.length; i++) {
        items[i].classList.toggle('active', i === activeIndex);
    }
}

function resetWheels() {
    WHEEL_UNITS.forEach(({ key }) => {
        const column = document.querySelector(`.wheel-col[data-unit="${key}"]`);
        column.scrollTop = 0;
        highlightActiveItem(column.querySelector('.wheel-list').children, 0);
    });
}

buildWheels();

// Initial load
loadAndRender();

// Update every frame (hundredths display needs more than 1 Hz)
function tick() {
    updateDisplays();
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
