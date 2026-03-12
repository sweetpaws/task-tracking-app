// ============================================================
//  COZY TIMER — app.js
// ============================================================

// ── State ────────────────────────────────────────────────────
const state = {
  isRunning:       false,
  currentTask:     '',       // name of the task currently running
  currentSession:  null,     // id of the live session
  sessionStart:    null,     // Date.now() when started
  timerInterval:   null,
  tasks:           {},       // { [name]: { name, sessions:[{id,start,end}] } }
  editCtx:         null,     // { type:'taskName'|'session', taskName, sessionId? }
};

// ── Persistence ──────────────────────────────────────────────
function load() {
  try {
    const raw = localStorage.getItem('cozyTimer_v2');
    if (raw) state.tasks = JSON.parse(raw).tasks ?? {};
  } catch (_) {}
}

function save() {
  try {
    localStorage.setItem('cozyTimer_v2', JSON.stringify({ tasks: state.tasks }));
  } catch (_) {}
}

// ── Helpers ──────────────────────────────────────────────────
let idCounter = 0;
function uid() { return `${Date.now()}-${++idCounter}`; }

/** Returns [hh, mm, ss] strings from milliseconds */
function splitTime(ms) {
  if (ms < 0) ms = 0;
  const tot = Math.floor(ms / 1000);
  return [
    String(Math.floor(tot / 3600)).padStart(2, '0'),
    String(Math.floor((tot % 3600) / 60)).padStart(2, '0'),
    String(tot % 60).padStart(2, '0'),
  ];
}

function humanDur(ms) {
  if (ms < 0) ms = 0;
  const tot = Math.floor(ms / 1000);
  const h = Math.floor(tot / 3600);
  const m = Math.floor((tot % 3600) / 60);
  const s = tot % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtTimeShort(ts) {
  if (!ts) return '?';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDateLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'today';
  if (d.toDateString() === yesterday.toDateString()) return 'yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtRange(start, end) {
  const dateLabel = fmtDateLabel(start);
  const startStr  = fmtTimeShort(start);
  const endStr    = end ? fmtTimeShort(end) : '…';
  return `${dateLabel} · ${startStr} → ${endStr}`;
}

function toDatetimeLocal(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Tag colours ───────────────────────────────────────────────
const TAG_COLORS = [
  { bg: '#EDE0F8', fg: '#6B3FA0' },  // lavender
  { bg: '#D8EEF8', fg: '#2A6A8A' },  // sky blue
  { bg: '#D8F4E8', fg: '#1E7A45' },  // mint
  { bg: '#FEF0CC', fg: '#8A6000' },  // honey
  { bg: '#FAD9D8', fg: '#8A2B24' },  // blush
  { bg: '#FDEBD0', fg: '#8A4A10' },  // peach
  { bg: '#F8D8EC', fg: '#8A2B6A' },  // rose
  { bg: '#D8F4F0', fg: '#177060' },  // teal
];

function tagColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

/** Safe text → escaped html string (for innerHTML where needed) */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/** Calc total ms for a task (includes live session time if isActive) */
function totalMs(task, isActive) {
  let acc = 0;
  for (const s of task.sessions) {
    if (s.end) {
      acc += s.end - s.start;
    } else if (isActive && s.id === state.currentSession) {
      acc += Date.now() - s.start;
    }
  }
  return acc;
}

// ── Timer core ───────────────────────────────────────────────
function startTimer() {
  const input = document.getElementById('taskNameInput');
  const name  = input.value.trim();
  if (!name) {
    input.classList.add('shake');
    input.focus();
    setTimeout(() => input.classList.remove('shake'), 400);
    return;
  }

  state.isRunning      = true;
  state.currentTask    = name;
  state.sessionStart   = Date.now();
  state.currentSession = uid();

  if (!state.tasks[name]) {
    state.tasks[name] = { name, sessions: [] };
  }
  state.tasks[name].sessions.push({ id: state.currentSession, start: state.sessionStart, end: null });

  save();
  hideSuggestions();
  document.getElementById('taskNameInput').disabled = true;

  renderTimerCard();
  renderTasks();
  startInterval();
}

function stopTimer() {
  if (!state.isRunning) return;

  const now = Date.now();
  const task = state.tasks[state.currentTask];
  if (task) {
    const sess = task.sessions.find(s => s.id === state.currentSession);
    if (sess) sess.end = now;
  }

  clearInterval(state.timerInterval);
  state.timerInterval  = null;
  state.isRunning      = false;
  state.sessionStart   = null;
  state.currentSession = null;

  save();
  document.getElementById('taskNameInput').disabled = false;
  renderTimerCard();
  renderTasks();
}

function startInterval() {
  state.timerInterval = setInterval(tickTimer, 1000);
  tickTimer();
}

function tickTimer() {
  // Update clock digits
  const elapsed = Date.now() - state.sessionStart;
  const [h, m, s] = splitTime(elapsed);
  document.getElementById('h').textContent = h;
  document.getElementById('m').textContent = m;
  document.getElementById('s').textContent = s;

  // Update live task total in list (without full re-render)
  if (state.currentTask) {
    const task = state.tasks[state.currentTask];
    if (task) {
      const card = document.querySelector(`.task-card[data-task-id]`);
      // find by name stored in dataset
      const allCards = document.querySelectorAll('.task-card');
      for (const c of allCards) {
        if (c.dataset.taskName === state.currentTask) {
          const el = c.querySelector('.task-total');
          if (el) el.textContent = humanDur(totalMs(task, true)) + ' total';
          break;
        }
      }
    }
  }
}

// ── UI: Timer card ───────────────────────────────────────────
function renderTimerCard() {
  const display  = document.getElementById('timerDisplay');
  const statusEl = document.getElementById('statusMsg');
  const btn      = document.getElementById('startStopBtn');
  const btnIcon  = document.getElementById('btnIcon');
  const btnLabel = document.getElementById('btnLabel');

  if (state.isRunning) {
    display.classList.add('running');
    btn.classList.add('running');
    btnIcon.textContent  = '⏸';
    btnLabel.textContent = 'stop';
    statusEl.textContent = `on the prowl: "${state.currentTask}" 🐾`;
  } else {
    display.classList.remove('running');
    btn.classList.remove('running');
    btnIcon.textContent  = '▶';
    btnLabel.textContent = 'start';
    statusEl.textContent = 'ready when you are~ 💚';
    // Reset digits
    ['h','m','s'].forEach(id => document.getElementById(id).textContent = '00');
  }
}

// ── UI: Tasks list ───────────────────────────────────────────
function renderTasks() {
  const section = document.getElementById('tasksSection');
  const list    = document.getElementById('tasksList');

  const names = Object.keys(state.tasks);
  if (!names.length) { section.hidden = true; return; }
  section.hidden = false;

  // Sort: running task first, then by most recent session start
  names.sort((a, b) => {
    if (a === state.currentTask && state.isRunning) return -1;
    if (b === state.currentTask && state.isRunning) return 1;
    const aT = state.tasks[a].sessions.at(-1)?.start ?? 0;
    const bT = state.tasks[b].sessions.at(-1)?.start ?? 0;
    return bT - aT;
  });

  // Preserve open/closed state of sessions panels
  const openTasks = new Set();
  list.querySelectorAll('.sessions-list.open').forEach(el => {
    openTasks.add(el.dataset.forTask);
  });

  list.innerHTML = '';
  for (const name of names) {
    const task     = state.tasks[name];
    const isActive = name === state.currentTask && state.isRunning;
    const card     = buildTaskCard(task, isActive, openTasks.has(name));
    list.appendChild(card);
  }
}

function buildTaskCard(task, isActive, sessionsOpen) {
  const card = document.createElement('div');
  card.className = `task-card${isActive ? ' is-active' : ''}`;
  card.dataset.taskName = task.name;

  // ── header row ──
  const head = document.createElement('div');
  head.className = 'task-card-head';

  const info = document.createElement('div');
  info.className = 'task-info';

  const nameEl = document.createElement('div');
  nameEl.className = `task-name-text${isActive ? ' active' : ''}`;
  nameEl.textContent = task.name;

  const totalEl = document.createElement('div');
  totalEl.className = 'task-total';
  totalEl.textContent = humanDur(totalMs(task, isActive)) + ' total';

  info.append(nameEl, totalEl);

  // actions
  const actions = document.createElement('div');
  actions.className = 'task-head-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'sessions-toggle';
  toggleBtn.innerHTML = `<span class="caret">${sessionsOpen ? '▴' : '▾'}</span> sessions`;

  // Quick-start play button (hidden while this task is already running)
  const playBtn = document.createElement('button');
  playBtn.className = 'task-play-btn';
  playBtn.title = `start "${task.name}"`;
  playBtn.textContent = '▶';
  if (isActive) playBtn.hidden = true;

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.title = 'rename task';
  editBtn.textContent = '✏️';

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn';
  delBtn.title = 'delete task';
  delBtn.textContent = '🗑️';

  actions.append(toggleBtn, playBtn, editBtn, delBtn);
  head.append(info, actions);

  // ── sessions panel ──
  const sessPanel = document.createElement('div');
  sessPanel.className = `sessions-list${sessionsOpen ? ' open' : ''}`;
  sessPanel.dataset.forTask = task.name;

  buildSessionRows(sessPanel, task, isActive);

  const tagsRow = buildTagsRow(task);

  card.append(head, tagsRow, sessPanel);

  // ── events ──
  toggleBtn.addEventListener('click', () => {
    const open = sessPanel.classList.toggle('open');
    toggleBtn.querySelector('.caret').textContent = open ? '▴' : '▾';
  });

  playBtn.addEventListener('click', () => {
    if (state.isRunning) stopTimer();
    document.getElementById('taskNameInput').value = task.name;
    startTimer();
  });

  editBtn.addEventListener('click', () => openEditTaskName(task.name));

  delBtn.addEventListener('click', () => {
    if (isActive) { alert('Please stop the timer before deleting this task.'); return; }
    if (confirm(`Delete "${task.name}" and all its sessions?`)) {
      delete state.tasks[task.name];
      save();
      renderTasks();
    }
  });

  return card;
}

// ── Tags ──────────────────────────────────────────────────────
function buildTagsRow(task) {
  const row = document.createElement('div');
  row.className = 'task-tags-row';

  (task.tags || []).forEach(tag => row.appendChild(buildTagPill(task, tag)));

  // "+ tag" button
  const addBtn = document.createElement('button');
  addBtn.className = 'tag-add-btn';
  addBtn.textContent = '＋ tag';
  addBtn.addEventListener('click', () => {
    addBtn.hidden = true;

    const inp = document.createElement('input');
    inp.className = 'task-input tag-inline-input';
    inp.placeholder = 'tag name…';
    inp.maxLength = 30;
    row.insertBefore(inp, addBtn);
    inp.focus();

    const commit = () => {
      const val = inp.value.trim().toLowerCase().replace(/\s+/g, '-');
      if (val && !(task.tags || []).includes(val)) {
        task.tags = [...(task.tags || []), val];
        save();
      }
      refreshTagsRow(task.name);
    };

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { refreshTagsRow(task.name); }
    });
    inp.addEventListener('blur', () => setTimeout(commit, 120));
  });

  row.appendChild(addBtn);
  return row;
}

function buildTagPill(task, tag) {
  const { bg, fg } = tagColor(tag);
  const pill = document.createElement('span');
  pill.className = 'tag-pill';
  pill.style.background = bg;
  pill.style.color = fg;

  const label = document.createElement('span');
  label.textContent = tag;

  const rm = document.createElement('button');
  rm.className = 'tag-remove';
  rm.title = `remove "${tag}"`;
  rm.textContent = '×';
  rm.addEventListener('click', e => {
    e.stopPropagation();
    task.tags = (task.tags || []).filter(t => t !== tag);
    save();
    pill.remove();
  });

  pill.append(label, rm);
  return pill;
}

function refreshTagsRow(taskName) {
  const card = [...document.querySelectorAll('.task-card')]
    .find(c => c.dataset.taskName === taskName);
  const task = state.tasks[taskName];
  if (!card || !task) return;
  const old = card.querySelector('.task-tags-row');
  if (old) old.replaceWith(buildTagsRow(task));
}

function buildSessionRows(container, task, isActive) {
  if (!task.sessions.length) {
    const empty = document.createElement('div');
    empty.className = 'session-row';
    empty.style.color = 'var(--muted)';
    empty.style.fontStyle = 'italic';
    empty.textContent = 'no sessions yet';
    container.appendChild(empty);
    return;
  }

  // Show newest first
  const sessions = [...task.sessions].reverse();

  for (const sess of sessions) {
    const liveSession = isActive && sess.id === state.currentSession;
    const row = document.createElement('div');
    row.className = 'session-row';

    const rangeEl = document.createElement('div');
    rangeEl.className = 'session-range';
    rangeEl.textContent = fmtRange(sess.start, sess.end);

    const durEl = document.createElement('div');
    durEl.className = 'session-dur';

    if (liveSession) {
      const badge = document.createElement('span');
      badge.className = 'live-badge';
      badge.innerHTML = '<span class="live-dot"></span>live';
      durEl.appendChild(badge);
    } else {
      const dur = sess.end ? humanDur(sess.end - sess.start) : '—';
      durEl.textContent = dur;
    }

    const actionsEl = document.createElement('div');
    actionsEl.className = 'session-actions';

    if (!liveSession) {
      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.title = 'edit times';
      editBtn.textContent = '✏️';
      editBtn.addEventListener('click', () => openEditSession(task.name, sess.id));

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.title = 'delete session';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => deleteSession(task.name, sess.id));

      actionsEl.append(editBtn, delBtn);
    }

    row.append(rangeEl, durEl, actionsEl);
    container.appendChild(row);
  }
}

// ── Suggestions ──────────────────────────────────────────────
function showSuggestions(query) {
  const box   = document.getElementById('suggestions');
  const names = Object.keys(state.tasks);
  const q     = query.toLowerCase();
  const matches = names.filter(n => n.toLowerCase().includes(q) && n !== query);

  if (!matches.length || !query) { hideSuggestions(); return; }

  box.innerHTML = '';
  matches.slice(0, 5).forEach(name => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = name;
    item.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent blur before click
      document.getElementById('taskNameInput').value = name;
      hideSuggestions();
    });
    box.appendChild(item);
  });
  box.style.display = 'block';
}

function hideSuggestions() {
  document.getElementById('suggestions').style.display = 'none';
}

// ── Edit modal ───────────────────────────────────────────────
function openEditTaskName(taskName) {
  state.editCtx = { type: 'taskName', taskName };

  document.getElementById('modalHeading').textContent       = 'rename task';
  document.getElementById('editTaskNameSection').hidden     = false;
  document.getElementById('editSessionSection').hidden      = true;
  document.getElementById('editTaskNameInput').value        = taskName;

  showModal();
  setTimeout(() => document.getElementById('editTaskNameInput').select(), 50);
}

function openEditSession(taskName, sessionId) {
  const task = state.tasks[taskName];
  const sess = task?.sessions.find(s => s.id === sessionId);
  if (!sess) return;

  state.editCtx = { type: 'session', taskName, sessionId };

  document.getElementById('modalHeading').textContent    = 'edit session';
  document.getElementById('editTaskNameSection').hidden  = true;
  document.getElementById('editSessionSection').hidden   = false;
  document.getElementById('editStartInput').value        = toDatetimeLocal(sess.start);
  document.getElementById('editEndInput').value          = toDatetimeLocal(sess.end);

  showModal();
}

function showModal() { document.getElementById('modal').hidden = false; }
function hideModal() {
  document.getElementById('modal').hidden = true;
  state.editCtx = null;
}

function saveEdit() {
  if (!state.editCtx) return;

  if (state.editCtx.type === 'taskName') {
    const newName = document.getElementById('editTaskNameInput').value.trim();
    if (!newName) return;
    const old = state.editCtx.taskName;
    if (newName === old) { hideModal(); return; }

    if (state.tasks[newName]) {
      // Merge into existing task (union tags, concat sessions)
      const mergedTags = [...new Set([...(state.tasks[newName].tags || []), ...(state.tasks[old].tags || [])])];
      state.tasks[newName].tags = mergedTags;
      state.tasks[newName].sessions.push(...state.tasks[old].sessions);
    } else {
      state.tasks[newName] = { name: newName, tags: state.tasks[old].tags || [], sessions: state.tasks[old].sessions };
    }
    delete state.tasks[old];
    if (state.currentTask === old) state.currentTask = newName;

  } else if (state.editCtx.type === 'session') {
    const { taskName, sessionId } = state.editCtx;
    const task = state.tasks[taskName];
    const sess = task?.sessions.find(s => s.id === sessionId);
    if (!sess) { hideModal(); return; }

    const newStart = new Date(document.getElementById('editStartInput').value).getTime();
    const newEndRaw = document.getElementById('editEndInput').value;
    const newEnd = newEndRaw ? new Date(newEndRaw).getTime() : null;

    if (isNaN(newStart)) { alert('Please enter a valid start time.'); return; }
    if (newEnd !== null && newEnd <= newStart) {
      alert('End time must be after start time.');
      return;
    }

    sess.start = newStart;
    sess.end   = newEnd !== null ? newEnd : sess.end;
  }

  save();
  hideModal();
  renderTasks();
}

function deleteSession(taskName, sessionId) {
  const task = state.tasks[taskName];
  if (!task) return;
  task.sessions = task.sessions.filter(s => s.id !== sessionId);
  if (!task.sessions.length) delete state.tasks[taskName];
  save();
  renderTasks();
}

// ── Cleanup on load (orphaned live sessions from crashes) ────
function cleanOrphanedSessions() {
  for (const task of Object.values(state.tasks)) {
    task.sessions = task.sessions.filter(s => s.end !== null);
  }
  // Remove tasks that now have no sessions
  for (const [name, task] of Object.entries(state.tasks)) {
    if (!task.sessions.length) delete state.tasks[name];
  }
  save();
}

// ── Wire events ──────────────────────────────────────────────
document.getElementById('startStopBtn').addEventListener('click', () => {
  state.isRunning ? stopTimer() : startTimer();
});

document.getElementById('taskNameInput').addEventListener('input', e => {
  showSuggestions(e.target.value);
});

document.getElementById('taskNameInput').addEventListener('blur', () => {
  // Small delay so mousedown on suggestion fires first
  setTimeout(hideSuggestions, 160);
});

document.getElementById('taskNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    state.isRunning ? stopTimer() : startTimer();
  }
  if (e.key === 'Escape') hideSuggestions();
});

document.getElementById('modalClose').addEventListener('click',  hideModal);
document.getElementById('modalCancel').addEventListener('click', hideModal);
document.getElementById('modalSave').addEventListener('click',   saveEdit);

document.getElementById('editTaskNameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveEdit();
  if (e.key === 'Escape') hideModal();
});

// Close modal on backdrop click
document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) hideModal();
});

// ── Init ─────────────────────────────────────────────────────
load();
cleanOrphanedSessions();
renderTimerCard();
renderTasks();
