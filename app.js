/* ─────────────────────────────────────────
   APP.JS — Main application logic
   ───────────────────────────────────────── */

// ── State ────────────────────────────────
let currentTab        = 'home';
let historyFilter     = 'all';
let historySearchTerm = '';
let historyData       = [];
let allExercises      = [];
let statsAllExercises = [];
let historyDebounceTimer;
let currentSheetResolve = null;

// ── Init ─────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setGreeting();
  renderUnitsToggle();
  if (!isConfigured()) {
    showSetupBanner();
    return;
  }
  await renderHome();
  await renderWorkout();
});

function showSetupBanner() {
  const wrap = document.getElementById('last-workout-wrap');
  if (wrap) wrap.innerHTML = `
    <div style="margin:0 20px;padding:20px;background:var(--primary-light);border:1.5px solid var(--primary);border-radius:var(--radius-md);">
      <div style="font-size:15px;font-weight:700;color:var(--primary);margin-bottom:8px;">&#9889; Supabase not connected</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">
        Add your Supabase credentials to <strong>config.js</strong> to start logging workouts.
      </div>
    </div>`;
}

// ── Greeting ─────────────────────────────
function setGreeting() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const el = document.getElementById('home-greeting');
  if (el) el.textContent = greet;
}

// ── Toast ─────────────────────────────────
let _toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  clearTimeout(_toastTimer);
  t.textContent = msg;
  t.className = `toast${type ? ' ' + type : ''}`;
  requestAnimationFrame(() => t.classList.add('show'));
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Tab Switching ─────────────────────────
function switchTab(tab) {
  if (tab === currentTab) return;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));

  document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');
  document.querySelector(`.tab-content[data-tab="${tab}"]`)?.classList.add('active');

  currentTab = tab;

  // Trigger tab-specific renders
  if (tab === 'home')     renderHome();
  if (tab === 'workout')  renderWorkout();
  if (tab === 'history')  renderHistory();
  if (tab === 'stats')    renderStats();
  if (tab === 'settings') renderSettings();
}

// ═══════════════════════════════════
// HOME TAB
// ═══════════════════════════════════
async function renderHome() {
  // Skeleton loaders
  ['stat-week','stat-month','stat-year'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '–';
  });

  const [counts, { data: lastSession }] = await Promise.all([
    getHomeCounts(),
    getLastSession(),
  ]);

  document.getElementById('stat-week').textContent  = counts.week;
  document.getElementById('stat-month').textContent = counts.month;
  document.getElementById('stat-year').textContent  = counts.year;

  const wrap = document.getElementById('last-workout-wrap');
  if (!wrap) return;

  if (!lastSession) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏋️</div>
        <div class="empty-state-title">No workouts yet</div>
        <div class="empty-state-text">Tap "New Workout" to log your first session!</div>
      </div>`;
    return;
  }

  const dateStr = formatDate(lastSession.date);
  const exercises = (lastSession.entries || []).map(e => e.exercises?.name).filter(Boolean);
  const summary = exercises.length
    ? exercises.slice(0, 3).join(', ') + (exercises.length > 3 ? ` +${exercises.length - 3}` : '')
    : 'No exercises logged';

  wrap.innerHTML = `
    <div class="last-workout-card card" style="margin:0 20px;" onclick="switchTab('history')">
      <div class="last-workout-label">Last Workout</div>
      <div class="last-workout-date">${dateStr}</div>
      <div class="last-workout-exercises">${escHtml(summary)}</div>
    </div>`;
}

function handleNewWorkout() {
  switchTab('workout');
}

// ═══════════════════════════════════
// WORKOUT TAB
// ═══════════════════════════════════
async function renderWorkout() {
  const container = document.getElementById('workout-inner');
  if (!container) return;

  if (!isConfigured()) {
    container.innerHTML = `
      <div class="workout-header"><div class="page-title">Workout</div></div>
      <div class="empty-state"><div class="empty-state-icon">🔌</div><div class="empty-state-title">Not connected</div><div class="empty-state-text">Add your Supabase credentials to config.js to start logging.</div></div>`;
    return;
  }

  container.innerHTML = '<div class="empty-state"><div class="empty-state-icon" style="font-size:28px">⏳</div></div>';

  const { data: session } = await getActiveSession();

  if (!session) {
    renderWorkoutEmpty(container);
    return;
  }

  const { data: entries } = await getSessionEntries(session.id);
  renderWorkoutActive(container, session, entries);
}

function renderWorkoutEmpty(container) {
  container.innerHTML = `
    <div class="workout-header">
      <div class="page-title">Workout</div>
    </div>
    <div class="empty-state">
      <div class="empty-state-icon">💪</div>
      <div class="empty-state-title">Ready to train?</div>
      <div class="empty-state-text">Start a session to log your exercises.</div>
    </div>
    <div class="workout-actions" style="margin-top:0;">
      <button class="btn btn-primary btn-full" onclick="startWorkout()">Start Workout</button>
      <button class="btn btn-secondary btn-full" onclick="openLogPastWorkout()">Log Past Workout</button>
    </div>`;
}

function renderWorkoutActive(container, session, entries) {
  const units = getUnits();
  const entriesHTML = entries.map(e => {
    const ex = e.exercises;
    const displayVal = ex.type === 'cardio'
      ? `${e.value} min`
      : `${e.value} ${units === 'kg' ? 'kg' : ex.unit}`;
    return `
      <div class="exercise-entry" id="entry-${e.id}">
        <div class="exercise-entry-info">
          <div class="exercise-entry-name">${escHtml(ex.name)}</div>
          <div class="exercise-entry-value">${displayVal}</div>
        </div>
        <div class="entry-actions">
          <button class="icon-btn" onclick="openEditEntrySheet('${e.id}', '${ex.id}', '${escAttr(ex.name)}', '${ex.type}', '${ex.unit}', ${e.value})" title="Edit">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn danger" onclick="confirmDeleteEntry('${e.id}')" title="Delete">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');

  const dateStr = formatDate(session.date);
  const count = entries.length;

  container.innerHTML = `
    <div class="workout-header">
      <div class="page-title">Today's Workout</div>
      <div class="workout-date">${dateStr} · ${count} exercise${count !== 1 ? 's' : ''}</div>
    </div>
    <div class="exercise-list" id="exercise-list">
      ${entriesHTML || '<div style="padding:8px 0;color:var(--text-tertiary);font-size:14px;">No exercises yet. Add your first one!</div>'}
    </div>
    <div class="workout-actions">
      <button class="btn btn-primary btn-full" onclick="openAddEntrySheet('${session.id}')">
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.5" fill="none"><path d="M12 5v14M5 12h14"/></svg>
        Add Exercise
      </button>
      <button class="btn btn-secondary btn-full" onclick="endWorkout()">End Workout</button>
    </div>`;
}

async function startWorkout() {
  const { data: session, error } = await createSession();
  if (error) { showToast('Could not start session', 'error'); return; }
  setActiveSession(session.id);
  renderWorkout();
}

async function endWorkout() {
  setActiveSession(null);
  showToast('Workout saved! Great work 💪', 'success');
  renderWorkout();
  // Refresh home counts if on home (will refresh when switching tabs)
}

// ── Add / Edit Entry Bottom Sheet ─────────

async function openAddEntrySheet(sessionId) {
  const { data: exercises } = await getAllExercises();
  allExercises = exercises;
  _openEntrySheet({ sessionId, exercises, mode: 'add' });
}

async function openEditEntrySheet(entryId, exerciseId, name, type, unit, value) {
  const { data: exercises } = await getAllExercises();
  allExercises = exercises;
  _openEntrySheet({ entryId, exerciseId, exercises, mode: 'edit', name, type, unit, value });
}

function _openEntrySheet({ sessionId, entryId, exerciseId, exercises, mode, name, type, unit, value }) {
  const opts = exercises.map(ex =>
    `<option value="${ex.id}" data-type="${ex.type}" data-unit="${ex.unit}" ${exerciseId === ex.id ? 'selected' : ''}>${escHtml(ex.name)}</option>`
  );

  const selectedEx = exercises.find(e => e.id === exerciseId) || exercises[0];
  const initType   = type || selectedEx?.type || 'strength';
  const initUnit   = unit || selectedEx?.unit || 'lbs';
  const inputLabel = initType === 'cardio' ? 'Duration (min)' : `Weight (${getUnits() === 'kg' ? 'kg' : initUnit})`;

  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${mode === 'add' ? 'Add Exercise' : 'Edit Exercise'}</div>
    <div class="form-group">
      <label class="form-label">Exercise</label>
      <select class="form-input form-select" id="sheet-exercise" onchange="onExerciseChange(this)" ${mode === 'edit' ? 'disabled' : ''}>
        ${opts.join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label" id="sheet-value-label">${inputLabel}</label>
      <input class="form-input" type="number" id="sheet-value" placeholder="0" step="0.5" min="0" value="${value !== undefined ? value : ''}">
    </div>
    <div style="display:flex;gap:10px;margin-top:4px;">
      <button class="btn btn-secondary" style="flex:1;" onclick="hideBottomSheet()">Cancel</button>
      <button class="btn btn-primary" style="flex:2;" onclick="${mode === 'add' ? `saveEntry('${sessionId}')` : `updateEntrySubmit('${entryId}')`}">
        ${mode === 'add' ? 'Add' : 'Save Changes'}
      </button>
    </div>`;

  showBottomSheet(html);

  // Focus value if editing
  setTimeout(() => {
    if (mode === 'edit') document.getElementById('sheet-value')?.focus();
    else document.getElementById('sheet-exercise')?.focus();
  }, 350);
}

function onExerciseChange(select) {
  const opt  = select.selectedOptions[0];
  const type = opt?.dataset?.type || 'strength';
  const unit = opt?.dataset?.unit || 'lbs';
  const label = document.getElementById('sheet-value-label');
  if (label) label.textContent = type === 'cardio' ? 'Duration (min)' : `Weight (${getUnits() === 'kg' ? 'kg' : unit})`;
  document.getElementById('sheet-value')?.focus();
}

async function saveEntry(sessionId) {
  const exerciseId = document.getElementById('sheet-exercise')?.value;
  const value = parseFloat(document.getElementById('sheet-value')?.value);
  if (!exerciseId || isNaN(value) || value <= 0) {
    showToast('Please enter a valid value', 'error');
    return;
  }
  hideBottomSheet();
  const { data, error } = await addEntry(sessionId, exerciseId, value);
  if (error) { showToast('Could not save exercise', 'error'); return; }

  // Animate new entry into list
  const list = document.getElementById('exercise-list');
  if (list) {
    const ex = data.exercises;
    const units = getUnits();
    const displayVal = ex.type === 'cardio' ? `${data.value} min` : `${data.value} ${units === 'kg' ? 'kg' : ex.unit}`;
    const div = document.createElement('div');
    div.className = 'exercise-entry';
    div.id = `entry-${data.id}`;
    div.style.opacity = '0';
    div.innerHTML = `
      <div class="exercise-entry-info">
        <div class="exercise-entry-name">${escHtml(ex.name)}</div>
        <div class="exercise-entry-value">${displayVal}</div>
      </div>
      <div class="entry-actions">
        <button class="icon-btn" onclick="openEditEntrySheet('${data.id}','${ex.id}','${escAttr(ex.name)}','${ex.type}','${ex.unit}',${data.value})" title="Edit">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" onclick="confirmDeleteEntry('${data.id}')" title="Delete">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`;

    // Remove empty state placeholder if present
    list.querySelectorAll('div[style]').forEach(el => {
      if (el.textContent.includes('No exercises')) el.remove();
    });

    list.appendChild(div);
    requestAnimationFrame(() => {
      div.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      div.style.transform = 'translateY(10px)';
      requestAnimationFrame(() => {
        div.style.opacity = '1';
        div.style.transform = 'translateY(0)';
      });
    });

    // Update count in header
    updateWorkoutCount(list.querySelectorAll('.exercise-entry').length, null);
  }
}

async function updateEntrySubmit(entryId) {
  const value = parseFloat(document.getElementById('sheet-value')?.value);
  if (isNaN(value) || value <= 0) {
    showToast('Please enter a valid value', 'error');
    return;
  }
  hideBottomSheet();
  const { data, error } = await updateEntry(entryId, value);
  if (error) { showToast('Could not update exercise', 'error'); return; }

  // Update in DOM
  const el = document.getElementById(`entry-${entryId}`);
  if (el && data) {
    const ex = data.exercises;
    const displayVal = ex.type === 'cardio' ? `${data.value} min` : `${data.value} ${getUnits() === 'kg' ? 'kg' : ex.unit}`;
    el.querySelector('.exercise-entry-value').textContent = displayVal;
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = 'fadeInUp 0.3s ease';
  }
  showToast('Updated!', 'success');
}

function confirmDeleteEntry(entryId) {
  const html = `
    <div class="sheet-handle"></div>
    <div class="confirm-title">Delete exercise?</div>
    <div class="confirm-text">This entry will be permanently removed from this session.</div>
    <div class="confirm-actions">
      <button class="btn btn-danger btn-full" onclick="deleteEntryConfirmed('${entryId}')">Delete</button>
      <button class="btn btn-secondary btn-full" onclick="hideBottomSheet()">Cancel</button>
    </div>`;
  showBottomSheet(html);
}

async function deleteEntryConfirmed(entryId) {
  hideBottomSheet();
  const { error } = await deleteEntry(entryId);
  if (error) { showToast('Could not delete', 'error'); return; }
  const el = document.getElementById(`entry-${entryId}`);
  if (el) {
    el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    el.style.opacity = '0';
    el.style.transform = 'scale(0.95)';
    setTimeout(() => el.remove(), 200);
  }
}

function updateWorkoutCount(count, date) {
  const header = document.querySelector('[data-tab="workout"] .workout-date');
  if (header) {
    const d = date || header.textContent.split('·')[0].trim();
    header.textContent = `${d} · ${count} exercise${count !== 1 ? 's' : ''}`;
  }
}

// ── Log Past Workout ──────────────────────
function openLogPastWorkout() {
  const today = todayISO ? todayISO() : new Date().toISOString().split('T')[0];
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Log Past Workout</div>
    <div class="form-group">
      <label class="form-label">Workout Date</label>
      <input class="form-input" type="date" id="past-date" value="${today}" max="${today}">
    </div>
    <div style="display:flex;gap:10px;margin-top:4px;">
      <button class="btn btn-secondary" style="flex:1;" onclick="hideBottomSheet()">Cancel</button>
      <button class="btn btn-primary" style="flex:2;" onclick="startPastWorkout()">Start</button>
    </div>`;
  showBottomSheet(html);
}

async function startPastWorkout() {
  const dateInput = document.getElementById('past-date');
  const date = dateInput?.value;
  if (!date) return;
  hideBottomSheet();
  const { data: session, error } = await createSession(date);
  if (error) { showToast('Could not create session', 'error'); return; }
  setActiveSession(session.id);
  switchTab('workout');
  renderWorkout();
}

// ═══════════════════════════════════
// BOTTOM SHEET
// ═══════════════════════════════════
function showBottomSheet(html) {
  // Remove any existing sheet
  hideBottomSheet(true);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'sheet-overlay';
  overlay.onclick = hideBottomSheet;

  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  sheet.id = 'bottom-sheet';
  sheet.innerHTML = html;

  // Swipe to dismiss
  let startY = 0;
  sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateX(-50%) translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 100) hideBottomSheet();
    else sheet.style.transform = '';
  });

  document.getElementById('app').append(overlay, sheet);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => sheet.classList.add('open'));
  });
}

function hideBottomSheet(immediate) {
  const sheet = document.getElementById('bottom-sheet');
  const overlay = document.getElementById('sheet-overlay');
  if (!sheet) return;

  if (immediate) {
    sheet.remove();
    overlay?.remove();
    return;
  }

  sheet.classList.remove('open');
  overlay?.style.setProperty('animation', 'none');
  overlay && (overlay.style.opacity = '0');
  setTimeout(() => {
    sheet.remove();
    overlay?.remove();
  }, 320);
}

// ═══════════════════════════════════
// HISTORY TAB
// ═══════════════════════════════════
async function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;

  if (!isConfigured()) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔌</div><div class="empty-state-title">Not connected</div><div class="empty-state-text">Add your Supabase credentials to config.js to view history.</div></div>`;
    return;
  }

  list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);">Loading…</div>';

  const { data, error } = await getAllSessions(historyFilter === 'all' ? null : historyFilter);
  historyData = data || [];

  if (error) {
    list.innerHTML = '<div style="padding:20px;color:var(--danger);">Could not load history.</div>';
    return;
  }

  renderHistoryList(historyData);
}

function renderHistoryList(sessions) {
  const list = document.getElementById('history-list');
  if (!list) return;

  let filtered = sessions;
  if (historySearchTerm) {
    const term = historySearchTerm.toLowerCase();
    filtered = sessions.filter(s =>
      (s.entries || []).some(e => e.exercises?.name?.toLowerCase().includes(term))
    );
  }

  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No sessions found</div>
        <div class="empty-state-text">Try a different filter or log your first workout!</div>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map(session => {
    const entries = session.entries || [];
    const count   = entries.length;
    const names   = entries.map(e => e.exercises?.name).filter(Boolean);
    const preview = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
    const units   = getUnits();

    const entriesHTML = entries.map(e => {
      const ex  = e.exercises;
      const val = ex.type === 'cardio' ? `${e.value} min` : `${e.value} ${units === 'kg' ? 'kg' : ex.unit}`;
      return `
        <div class="session-entry-row">
          <div>
            <div class="session-entry-name">${escHtml(ex.name)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="session-entry-value">${val}</span>
            <button class="icon-btn" style="width:28px;height:28px;" onclick="openHistoryEditSheet('${e.id}','${escAttr(ex.name)}','${ex.type}','${ex.unit}',${e.value})" title="Edit">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="icon-btn danger" style="width:28px;height:28px;" onclick="confirmDeleteEntry('${e.id}');currentHistorySessionRefresh='${session.id}'" title="Delete">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="session-card" id="hist-${session.id}">
        <div class="session-card-header" onclick="toggleSession('${session.id}')">
          <div>
            <div class="session-date">${formatDate(session.date)}</div>
            <div class="session-summary">${count} exercise${count !== 1 ? 's' : ''}${preview ? ' · ' + escHtml(preview) : ''}</div>
          </div>
          <svg class="session-chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="session-detail">
          ${entriesHTML}
          <div class="session-detail-actions">
            <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="openHistoryAddExercise('${session.id}')">+ Add</button>
            <button class="btn btn-danger btn-sm" style="flex:1;" onclick="confirmDeleteSession('${session.id}')">Delete Session</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function toggleSession(sessionId) {
  const card = document.getElementById(`hist-${sessionId}`);
  if (card) card.classList.toggle('expanded');
}

function setHistoryFilter(el, filter) {
  historyFilter = filter;
  document.querySelectorAll('.history-filters .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderHistory();
}

function debounceHistorySearch(val) {
  clearTimeout(historyDebounceTimer);
  historySearchTerm = val;
  historyDebounceTimer = setTimeout(() => renderHistoryList(historyData), 300);
}

function openHistoryEditSheet(entryId, name, type, unit, value) {
  const inputLabel = type === 'cardio' ? 'Duration (min)' : `Weight (${getUnits() === 'kg' ? 'kg' : unit})`;
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">Edit ${escHtml(name)}</div>
    <div class="form-group">
      <label class="form-label">${inputLabel}</label>
      <input class="form-input" type="number" id="sheet-value" value="${value}" step="0.5" min="0">
    </div>
    <div style="display:flex;gap:10px;margin-top:4px;">
      <button class="btn btn-secondary" style="flex:1;" onclick="hideBottomSheet()">Cancel</button>
      <button class="btn btn-primary" style="flex:2;" onclick="historyUpdateEntry('${entryId}')">Save</button>
    </div>`;
  showBottomSheet(html);
  setTimeout(() => document.getElementById('sheet-value')?.focus(), 350);
}

async function historyUpdateEntry(entryId) {
  const value = parseFloat(document.getElementById('sheet-value')?.value);
  if (isNaN(value) || value <= 0) { showToast('Enter a valid value', 'error'); return; }
  hideBottomSheet();
  const { error } = await updateEntry(entryId, value);
  if (error) { showToast('Could not update', 'error'); return; }
  showToast('Updated!', 'success');
  renderHistory();
}

async function openHistoryAddExercise(sessionId) {
  const { data: exercises } = await getAllExercises();
  allExercises = exercises;
  _openEntrySheet({ sessionId, exercises, mode: 'add' });
  // After save, re-render history
  const origSave = window.saveEntry;
  window.saveEntry = async function(sid) {
    await origSave(sid);
    window.saveEntry = origSave;
    renderHistory();
  };
}

function confirmDeleteSession(sessionId) {
  const html = `
    <div class="sheet-handle"></div>
    <div class="confirm-title">Delete session?</div>
    <div class="confirm-text">This will permanently delete the workout session and all its exercises.</div>
    <div class="confirm-actions">
      <button class="btn btn-danger btn-full" onclick="deleteSessionConfirmed('${sessionId}')">Delete Session</button>
      <button class="btn btn-secondary btn-full" onclick="hideBottomSheet()">Cancel</button>
    </div>`;
  showBottomSheet(html);
}

async function deleteSessionConfirmed(sessionId) {
  hideBottomSheet();
  const { error } = await deleteSession(sessionId);
  if (error) { showToast('Could not delete session', 'error'); return; }
  showToast('Session deleted', '');
  renderHistory();
}

// ═══════════════════════════════════
// STATS TAB
// ═══════════════════════════════════
async function renderStats() {
  showStatsList();
  const listEl = document.getElementById('stats-exercise-list');
  if (!listEl) return;
  if (!isConfigured()) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔌</div><div class="empty-state-title">Not connected</div><div class="empty-state-text">Add your Supabase credentials to config.js to view stats.</div></div>`;
    return;
  }
  listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-tertiary);">Loading…</div>';

  const { data } = await getExerciseStats();
  statsAllExercises = data || [];
  renderStatsExerciseList(statsAllExercises);
}

function renderStatsExerciseList(exercises) {
  const listEl = document.getElementById('stats-exercise-list');
  if (!listEl) return;

  if (!exercises.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <div class="empty-state-title">No data yet</div>
        <div class="empty-state-text">Log some workouts to see your stats here.</div>
      </div>`;
    return;
  }

  const cardio   = exercises.filter(e => e.type === 'cardio');
  const strength = exercises.filter(e => e.type === 'strength');

  function exerciseRow(ex) {
    const bestStr = ex.count ? `Best: ${ex.best} ${ex.unit}` : 'No data yet';
    const sessions = ex.count === 1 ? '1 session' : `${ex.count} sessions`;
    return `
      <div class="exercise-stat-row" onclick="showStatsDetail('${ex.id}')">
        <div class="exercise-stat-info">
          <div class="exercise-stat-name">${escHtml(ex.name)}</div>
          <div class="exercise-stat-meta">${sessions}${ex.count ? ' · ' + bestStr : ''}</div>
        </div>
        <svg class="exercise-stat-chevron" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
      </div>`;
  }

  let html = '';
  if (cardio.length) {
    html += `<div class="section-label" style="margin-top:8px;">Cardio</div>`;
    html += cardio.map(exerciseRow).join('');
  }
  if (strength.length) {
    html += `<div class="section-label" style="margin-top:${cardio.length ? '16' : '8'}px;">Strength</div>`;
    html += strength.map(exerciseRow).join('');
  }

  listEl.innerHTML = html;
}

function filterStatsSearch(val) {
  const term = val.toLowerCase();
  const filtered = term
    ? statsAllExercises.filter(e => e.name.toLowerCase().includes(term))
    : statsAllExercises;
  renderStatsExerciseList(filtered);
}

function showStatsList() {
  document.getElementById('stats-list-view')?.classList.remove('hidden');
  document.getElementById('stats-detail')?.classList.remove('active');
  destroyChart();
}

async function showStatsDetail(exerciseId) {
  const ex = statsAllExercises.find(e => e.id === exerciseId);
  if (!ex) return;

  document.getElementById('stats-list-view')?.classList.add('hidden');
  const detail = document.getElementById('stats-detail');
  detail?.classList.add('active');

  document.getElementById('stats-detail-title').textContent = ex.name;
  document.getElementById('stats-detail-badge').innerHTML =
    `<span class="badge badge-${ex.type}">${ex.type === 'cardio' ? 'Cardio' : 'Strength'}</span>`;

  const units = getUnits();
  const displayUnit = ex.type === 'cardio' ? 'min' : (units === 'kg' ? 'kg' : ex.unit);

  document.getElementById('stats-best').textContent = ex.count ? `${ex.best} ${displayUnit}` : '–';
  document.getElementById('stats-avg').textContent  = ex.count ? `${Math.round(ex.avg * 10) / 10} ${displayUnit}` : '–';

  const { data: history } = await getExerciseHistory(exerciseId);
  const recent = document.getElementById('stats-recent');

  if (!history.length) {
    recent.innerHTML = '<div style="padding:8px 0;color:var(--text-tertiary);font-size:14px;text-align:center;">No sessions logged yet.</div>';
    destroyChart();
    return;
  }

  createProgressionChart('stats-chart', history, displayUnit);

  recent.innerHTML = history.slice(-10).reverse().map(p => `
    <div class="recent-session-item">
      <span class="recent-session-date">${formatDate(p.date)}</span>
      <span class="recent-session-value">${p.value} ${displayUnit}</span>
    </div>`).join('');
}

// ═══════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════
function renderSettings() {
  renderUnitsToggle();
}

function getUnits() {
  return localStorage.getItem('units') || 'lbs';
}

function setUnits(unit) {
  localStorage.setItem('units', unit);
  renderUnitsToggle();
}

function renderUnitsToggle() {
  const units = getUnits();
  document.getElementById('units-lbs')?.classList.toggle('active', units === 'lbs');
  document.getElementById('units-kg')?.classList.toggle('active', units === 'kg');
}

// ── Exercise Library ──────────────────────
function showExerciseLibrary() {
  document.getElementById('settings-main-view')?.classList.add('hidden');
  document.getElementById('exercise-library-view')?.classList.remove('hidden');
  renderExerciseLib();
}

function hideExerciseLibrary() {
  document.getElementById('settings-main-view')?.classList.remove('hidden');
  document.getElementById('exercise-library-view')?.classList.add('hidden');
}

async function renderExerciseLib() {
  const listEl = document.getElementById('exercise-lib-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-tertiary);">Loading…</div>';

  const { data: exercises } = await getAllExercises();

  if (!exercises.length) {
    listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-tertiary);">No exercises. Add one above.</div>';
    return;
  }

  listEl.innerHTML = exercises.map(ex => `
    <div class="exercise-lib-row">
      <div class="exercise-lib-info">
        <div class="exercise-lib-name">${escHtml(ex.name)}</div>
        <span class="badge badge-${ex.type}" style="margin-top:2px;">${ex.type === 'cardio' ? 'Cardio' : 'Strength'}</span>
      </div>
      <div style="display:flex;gap:4px;">
        <button class="icon-btn" onclick="openEditExerciseForm('${ex.id}','${escAttr(ex.name)}','${ex.type}')" title="Edit">
          <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger" onclick="confirmDeleteExercise('${ex.id}','${escAttr(ex.name)}')" title="Delete">
          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`).join('');
}

function openAddExerciseForm() {
  _openExerciseForm({ mode: 'add' });
}

function openEditExerciseForm(id, name, type) {
  _openExerciseForm({ mode: 'edit', id, name, type });
}

function _openExerciseForm({ mode, id, name, type }) {
  const html = `
    <div class="sheet-handle"></div>
    <div class="sheet-title">${mode === 'add' ? 'Add Exercise' : 'Edit Exercise'}</div>
    <div class="form-group">
      <label class="form-label">Name</label>
      <input class="form-input" type="text" id="ex-name" placeholder="e.g. Lat Pulldown" value="${name || ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Type</label>
      <div style="display:flex;gap:10px;">
        <button class="btn ${type === 'cardio' ? 'btn-primary' : 'btn-secondary'}" id="type-cardio" style="flex:1;" onclick="setExType('cardio')">Cardio</button>
        <button class="btn ${type !== 'cardio' ? 'btn-primary' : 'btn-secondary'}" id="type-strength" style="flex:1;" onclick="setExType('strength')">Strength</button>
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:4px;">
      <button class="btn btn-secondary" style="flex:1;" onclick="hideBottomSheet()">Cancel</button>
      <button class="btn btn-primary" style="flex:2;" onclick="${mode === 'add' ? 'submitAddExercise()' : `submitEditExercise('${id}')`}">
        ${mode === 'add' ? 'Add' : 'Save'}
      </button>
    </div>`;
  showBottomSheet(html);
  setTimeout(() => document.getElementById('ex-name')?.focus(), 350);
}

function setExType(type) {
  document.getElementById('type-cardio')?.classList.toggle('btn-primary',   type === 'cardio');
  document.getElementById('type-cardio')?.classList.toggle('btn-secondary', type !== 'cardio');
  document.getElementById('type-strength')?.classList.toggle('btn-primary',   type === 'strength');
  document.getElementById('type-strength')?.classList.toggle('btn-secondary', type !== 'strength');
}

function getSelectedExType() {
  return document.getElementById('type-cardio')?.classList.contains('btn-primary') ? 'cardio' : 'strength';
}

async function submitAddExercise() {
  const name = document.getElementById('ex-name')?.value?.trim();
  const type = getSelectedExType();
  if (!name) { showToast('Please enter a name', 'error'); return; }
  hideBottomSheet();
  const { error } = await addExercise(name, type);
  if (error) { showToast('Could not add exercise', 'error'); return; }
  showToast('Exercise added!', 'success');
  renderExerciseLib();
}

async function submitEditExercise(id) {
  const name = document.getElementById('ex-name')?.value?.trim();
  const type = getSelectedExType();
  if (!name) { showToast('Please enter a name', 'error'); return; }
  hideBottomSheet();
  const { error } = await updateExercise(id, name, type);
  if (error) { showToast('Could not update exercise', 'error'); return; }
  showToast('Exercise updated!', 'success');
  renderExerciseLib();
}

function confirmDeleteExercise(id, name) {
  const html = `
    <div class="sheet-handle"></div>
    <div class="confirm-title">Delete "${escHtml(name)}"?</div>
    <div class="confirm-text">You can only delete exercises with no logged sessions.</div>
    <div class="confirm-actions">
      <button class="btn btn-danger btn-full" onclick="deleteExerciseConfirmed('${id}')">Delete</button>
      <button class="btn btn-secondary btn-full" onclick="hideBottomSheet()">Cancel</button>
    </div>`;
  showBottomSheet(html);
}

async function deleteExerciseConfirmed(id) {
  hideBottomSheet();
  const { error } = await deleteExercise(id);
  if (error) { showToast(error.message || 'Could not delete', 'error'); return; }
  showToast('Exercise deleted', '');
  renderExerciseLib();
}

// ── Export ────────────────────────────────
async function exportData() {
  showToast('Preparing export…');
  const csv = await exportAllData();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `workouts-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded!', 'success');
}

// ── Clear All Data ────────────────────────
function confirmClearAll() {
  const html = `
    <div class="sheet-handle"></div>
    <div class="confirm-title">Clear all data?</div>
    <div class="confirm-text">This will permanently delete all workout sessions and entries. Your exercise library will be kept. This cannot be undone.</div>
    <div class="form-group" style="margin-top:4px;">
      <label class="form-label">Type DELETE to confirm</label>
      <input class="form-input" type="text" id="clear-confirm-input" placeholder="DELETE">
    </div>
    <div class="confirm-actions">
      <button class="btn btn-danger btn-full" onclick="submitClearAll()">Clear All Data</button>
      <button class="btn btn-secondary btn-full" onclick="hideBottomSheet()">Cancel</button>
    </div>`;
  showBottomSheet(html);
}

async function submitClearAll() {
  const val = document.getElementById('clear-confirm-input')?.value;
  if (val !== 'DELETE') { showToast('Type DELETE to confirm', 'error'); return; }
  hideBottomSheet();
  await clearAllData();
  showToast('All data cleared', '');
  renderHome();
  renderHistory();
}

// ═══════════════════════════════════
// UTILITIES
// ═══════════════════════════════════
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}
