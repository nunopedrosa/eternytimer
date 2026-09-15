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
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 7h16"/>
        <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>
        <path d="M10 11v6"/>
        <path d="M14 11v6"/>
    </svg>
`;

function timerType(timer) {
    // Older records created before countdowns existed have no "type" field.
    return timer.type === 'countdown' ? 'countdown' : 'stopwatch';
}

const STORAGE_KEY = 'eternal-timer.timers';
const MAX_TIMERS_PER_TYPE = 50;
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
    return parsed.map(timer => ({
        id: typeof timer.id === 'string' ? timer.id : makeId(),
        name: sanitizeName(timer.name) ?? 'Timer',
        type: normalizeType(timer.type),
        initial_value: Math.max(0, Math.floor(Number(timer.initial_value) || 0)),
        created_at: Number.isNaN(Date.parse(timer.created_at)) ? new Date().toISOString() : timer.created_at
    }));
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
        created_at: new Date().toISOString()
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

// Returns the duration split into a "days" part and a "hh:mm:ss" part, so the
// caller can render them in separately-sized columns. This keeps the
// hh:mm:ss digits from shifting horizontally once a timer crosses the
// 1-day mark (or gains an extra day digit).
function formatDuration(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const d = Math.floor(totalSeconds / (3600 * 24));
    const h = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);

    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');

    return {
        days: d > 0 ? String(d) : '',
        time: `${hh}:${mm}:${ss}`
    };
}

function buildTimerCard(timer) {
    const card = document.createElement('div');
    card.className = 'timer-card';

    const info = document.createElement('div');
    info.className = 'timer-info';

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

    const timeEl = document.createElement('span');
    timeEl.className = 'timer-time';
    timeEl.textContent = '--';

    display.appendChild(daysEl);
    display.appendChild(timeEl);

    info.appendChild(nameInput);
    info.appendChild(display);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.dataset.id = timer.id;
    deleteBtn.setAttribute('aria-label', `Delete ${timer.name}`);
    deleteBtn.innerHTML = TRASH_ICON_SVG;

    card.appendChild(info);
    card.appendChild(deleteBtn);
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

// Delegation for delete buttons
mainEl.addEventListener('click', (e) => {
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
    const now = new Date();
    timers.forEach(timer => {
        const createdDate = new Date(timer.created_at);
        const elapsedSeconds = Math.floor((now - createdDate) / 1000);

        const isCountdown = timerType(timer) === 'countdown';
        const remaining = timer.initial_value - elapsedSeconds;
        const totalSeconds = isCountdown ? remaining : timer.initial_value + elapsedSeconds;

        const displayEl = document.getElementById(`display-${timer.id}`);
        if (displayEl) {
            const { days, time } = formatDuration(totalSeconds);
            displayEl.querySelector('.timer-days').textContent = days;
            displayEl.querySelector('.timer-time').textContent = time;
            displayEl.classList.toggle('finished', isCountdown && remaining <= 0);
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
        selectedValueDisplay.textContent = `${d} ${h}:${m}:${s}`;
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

// Update every second
setInterval(updateDisplays, 1000);
