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
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
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

    return {
        id: (typeof raw.id === 'string' && raw.id !== '') ? raw.id : makeId(),
        name: sanitizeName(raw.name) ?? 'Timer',
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
    name = sanitizeName(name) ?? 'Timer';

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
            timer.started_at ?? '', timer.elapsed_ms, timer.laps.join(';')]
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

exportBtn.addEventListener('click', exportTimers);
importBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files[0];
    importFileInput.value = '';
    if (!file) return;
    try {
        importTimers(await file.text());
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

    card.appendChild(nameInput);
    card.appendChild(row);

    if (isStopwatch && timer.laps.length > 0) {
        const lapList = document.createElement('ol');
        lapList.className = 'lap-list';
        for (let i = timer.laps.length - 1; i >= 0; i--) {
            const row = document.createElement('li');
            row.className = 'lap-row';

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
        card.appendChild(lapList);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.dataset.id = timer.id;
    deleteBtn.setAttribute('aria-label', `Delete ${timer.name}`);
    deleteBtn.innerHTML = TRASH_ICON_SVG;

    const footer = document.createElement('div');
    footer.className = 'timer-footer';
    footer.appendChild(deleteBtn);
    card.appendChild(footer);
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

    updateDisplays();
}

// Delegation for name updates (blur doesn't bubble, so this needs capture)
mainEl.addEventListener('blur', (e) => {
    if (e.target.classList.contains('timer-name-input')) {
        const id = e.target.dataset.id;
        const newName = e.target.value.trim() || 'Timer';
        e.target.value = newName;
        updateTimerName(id, newName);
    }
}, true);

// Delegation for card buttons (delete / start-stop / lap)
mainEl.addEventListener('click', (e) => {
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
    timers.forEach(timer => {
        const isCountdown = timerType(timer) === 'countdown';
        const total = totalMs(timer, now);
        const finished = isCountdown && total <= 0;

        const card = document.getElementById(`display-${timer.id}`)?.closest('.timer-card');
        const displayEl = document.getElementById(`display-${timer.id}`);
        if (displayEl) {
            const { days, time } = formatDuration(total, !isCountdown);
            const daysEl = displayEl.querySelector('.timer-days');
            if (daysEl.dataset.days !== days) {
                daysEl.dataset.days = days;
                setDays(daysEl, days);
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
                const running = !!timer.started_at && !finished;
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
