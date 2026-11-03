'use strict';

/* ============================================================
   Annual Function Soundboard
   Local-first soundboard + run of show.
   ============================================================ */

/* ---------- helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 || value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function hasFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files');
}

function cueShortcutKey(index, eventId) {
  if (index === 9) return '0';

  const post10 = eventId ? Boolean(state.cueKeyMode[eventId]) : false;
  if (post10) {
    if (index >= 10 && index < 19) return String(index - 9);
    return '';
  }

  if (index >= 0 && index < 9) return String(index + 1);
  return '';
}

function cueIndexForKey(key, event) {
  const normalized = String(key).toLowerCase();
  if (normalized === '0') return 9;
  if (!/^[1-9]$/.test(normalized)) return -1;

  const number = Number(normalized);
  const post10 = event ? Boolean(state.cueKeyMode[event.id]) : false;
  return post10 ? 9 + number : number - 1;
}

/* ---------- IndexedDB ---------- */

const DB_NAME = 'annual-function-soundboard';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('events')) d.createObjectStore('events', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('audio')) d.createObjectStore('audio', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(store, key) {
  const d = await openDB();
  return reqToPromise(d.transaction(store, 'readonly').objectStore(store).get(key));
}

async function dbGetAll(store) {
  const d = await openDB();
  return reqToPromise(d.transaction(store, 'readonly').objectStore(store).getAll());
}

async function dbPut(store, value) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function dbDelete(store, key) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/* ---------- state ---------- */

const state = {
  events: [],
  selectedId: null,
  filter: '',
  settings: { masterVolume: 0.9, autoAdvance: true },
  clock: { running: false, startedAt: null, accumulated: 0 },
  playback: { eventId: null, cueId: null, playing: false, loading: false },
  cueKeyMode: {},
  checklist: [],
  checklistEdit: false,
  checklistVisible: true,
  urls: new Map(),
};

/* ---------- DOM ---------- */

const els = {
  eventList: document.getElementById('event-list'),
  eventCount: document.getElementById('event-count'),
  search: document.getElementById('search'),
  detail: document.getElementById('detail'),
  modal: document.getElementById('modal'),
  toasts: document.getElementById('toasts'),
  printSheet: document.getElementById('print-sheet'),
  npTitle: document.getElementById('np-title'),
  npSub: document.getElementById('np-sub'),
  playBtn: document.getElementById('btn-play'),
  prevBtn: document.getElementById('btn-prev'),
  nextBtn: document.getElementById('btn-next'),
  stopBtn: document.getElementById('btn-stop'),
  seek: document.getElementById('seek'),
  timeCurrent: document.getElementById('time-current'),
  timeTotal: document.getElementById('time-total'),
  masterVolume: document.getElementById('master-volume'),
  autoAdvance: document.getElementById('auto-advance'),
  clockNow: document.getElementById('clock-now'),
  showTimer: document.getElementById('show-timer'),
  clockToggle: document.getElementById('clock-toggle'),
  clockReset: document.getElementById('clock-reset'),
  btnAddEvent: document.getElementById('btn-add-event'),
  btnPrint: document.getElementById('btn-print'),
  btnHelp: document.getElementById('btn-help'),
  layout: document.getElementById('layout'),
  checklistPanel: document.getElementById('checklist-panel'),
  checklist: document.getElementById('checklist'),
  checklistProgressBar: document.getElementById('checklist-progress-bar'),
  checklistProgressText: document.getElementById('checklist-progress-text'),
  checklistEditBtn: document.getElementById('btn-checklist-edit'),
  checklistResetBtn: document.getElementById('btn-checklist-reset'),
  checklistAddWrap: document.getElementById('checklist-add-wrap'),
  checklistAddBtn: document.getElementById('btn-checklist-add'),
  btnChecklist: document.getElementById('btn-checklist'),
  videoStage: document.getElementById('video-stage'),
  video: document.getElementById('video-el'),
  videoHint: document.getElementById('video-hint'),
  videoHintTitle: document.getElementById('video-hint-title'),
  videoHintSub: document.getElementById('video-hint-sub'),
};

/* ---------- cue kind (audio vs video) ---------- */

const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|ogv|mkv)$/i;

function kindForName(name) {
  return VIDEO_EXT_RE.test(String(name || '')) ? 'video' : 'audio';
}

/* ---------- icons ---------- */

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6L18 18V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>',
};

/* ---------- audio + video ---------- */

const audio = new Audio();
audio.preload = 'auto';
audio.style.display = 'none';
audio.setAttribute('aria-hidden', 'true');
document.body.appendChild(audio);

const video = els.video;
video.preload = 'auto';
video.playsInline = true;

/* The media element currently driving playback — `audio` for audio-mode
   cues, `video` (full-screen takeover) for video-mode cues. */
let player = audio;

function mediaKindOf(cue) {
  return cue?.kind === 'video' ? 'video' : 'audio';
}

function playerFor(cue) {
  return mediaKindOf(cue) === 'video' ? video : audio;
}

function setActivePlayer(next) {
  if (player === next) return;
  const prev = player;
  prev.pause();
  try { prev.removeAttribute('src'); prev.load(); } catch (err) { /* ignore */ }
  player = next;
}

/* ---------- selectors ---------- */

function currentEvent() {
  return state.events.find((e) => e.id === state.playback.eventId) || null;
}

function currentCue() {
  const ev = currentEvent();
  return ev ? ev.cues.find((c) => c.id === state.playback.cueId) || null : null;
}

function currentCueIndex() {
  const ev = currentEvent();
  return ev ? ev.cues.findIndex((c) => c.id === state.playback.cueId) : -1;
}

function selectedEvent() {
  return state.events.find((e) => e.id === state.selectedId) || null;
}

function filteredEvents() {
  const q = state.filter.trim().toLowerCase();
  if (!q) return state.events;
  return state.events.filter((ev) =>
    ev.name.toLowerCase().includes(q) ||
    (ev.notes || '').toLowerCase().includes(q) ||
    (ev.time || '').includes(q)
  );
}

/* ---------- rendering ---------- */

function renderAll() {
  renderEventList();
  renderDetail();
  renderChecklist();
  updateTransport();
}

function renderEventList() {
  const events = filteredEvents();
  const scrollTop = els.eventList.scrollTop;
  els.eventCount.textContent = String(state.events.length);

  if (!events.length) {
    els.eventList.innerHTML = `<li class="list-empty">${state.events.length
      ? 'No events match your search.'
      : 'No events yet. Create one to get started.'}</li>`;
    return;
  }

  els.eventList.innerHTML = events.map((ev) => {
    const total = ev.cues.reduce((sum, cue) => sum + (cue.duration || 0), 0);
    const isCurrent = state.playback.eventId === ev.id;
    return `
      <li class="event-item ${ev.id === state.selectedId ? 'selected' : ''} ${ev.status === 'live' ? 'live' : ''} ${isCurrent ? 'current' : ''}"
          data-event-id="${ev.id}" draggable="true" tabindex="0" role="button"
          aria-label="${escapeHtml(ev.name)}${ev.time ? ', ' + escapeHtml(ev.time) : ''}">
        <div class="event-time">${escapeHtml(ev.time || '—')}</div>
        <div class="event-main">
          <div class="event-name">${escapeHtml(ev.name)}</div>
          <div class="event-meta">${ev.cues.length} cue${ev.cues.length === 1 ? '' : 's'}${total ? ' · ' + fmtTime(total) : ''}</div>
        </div>
        <span class="status-dot ${escapeHtml(ev.status)}" title="${escapeHtml(ev.status)}"></span>
      </li>`;
  }).join('');

  els.eventList.scrollTop = scrollTop;
}

function cueRow(ev, cue, i, currentCueId) {
  const isCurrent = cue.id === currentCueId;
  const shortcut = cueShortcutKey(i, ev.id);
  return `
    <li class="cue ${isCurrent ? 'current' : ''}" data-cue-id="${cue.id}" draggable="true">
      <div class="cue-index" ${shortcut ? `title="Press ${shortcut.toUpperCase()} to start"` : ''}>${i + 1}</div>
      <div class="cue-body">
        <div class="cue-label">${escapeHtml(cue.label)}</div>
        <div class="cue-meta">
          ${fmtTime(cue.duration)} · ${Math.round((cue.volume ?? 1) * 100)}%${cue.fadeIn ? ' · fade ' + cue.fadeIn + 's' : ''}
          <span class="cue-source ${cue.src ? 'folder' : 'imported'}">${cue.src ? 'folder' : 'imported'}</span>
          ${mediaKindOf(cue) === 'video' ? '<span class="cue-source video">video</span>' : ''}
        </div>
      </div>
      <div class="cue-actions">
        <button class="icon-btn" data-act="play-cue" type="button" title="Play this cue">${ICON.play}</button>
        <button class="icon-btn" data-act="cue-up" type="button" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn" data-act="cue-down" type="button" title="Move down" ${i === ev.cues.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon-btn" data-act="edit-cue" type="button" title="Edit cue">✎</button>
        <button class="icon-btn danger" data-act="delete-cue" type="button" title="Remove cue">✕</button>
      </div>
      <div class="cue-progress"><span></span></div>
    </li>`;
}

function renderDetail() {
  const ev = selectedEvent();

  if (!ev) {
    els.detail.innerHTML = state.events.length
      ? `<div class="empty">
           <div class="empty-icon">👈</div>
           <h2>Select an event</h2>
           <p>Pick an event from the list to see its cues and notes.</p>
         </div>`
      : `<div class="empty">
           <div class="empty-icon">🎚️</div>
           <h2>Build your run of show</h2>
           <p>Create an event for each item in the programme. Add one audio file, or several cues that play in order.</p>
           <button class="btn btn-accent btn-lg" data-act="new-event" type="button">+ Create first event</button>
         </div>`;
    return;
  }

  const total = ev.cues.reduce((sum, cue) => sum + (cue.duration || 0), 0);
  const index = state.events.findIndex((e) => e.id === ev.id);
  const isCurrentEvent = state.playback.eventId === ev.id;
  const currentCueId = isCurrentEvent ? state.playback.cueId : null;
  const statusLabel = { pending: 'Upcoming', live: 'Live', done: 'Done' }[ev.status] || ev.status;
  const keyHint = state.cueKeyMode[ev.id]
    ? 'Cue keys: <strong>1</strong> = 11, <strong>2</strong> = 12, <strong>3</strong> = 13, <strong>4</strong> = 14, <strong>5</strong> = 15, <strong>0</strong> = 10. <button class="link-btn" data-act="reset-cue-keys" type="button">Reset keys</button>'
    : 'Cue keys: <strong>1–9</strong>, <strong>0</strong> = cue 10.';

  els.detail.innerHTML = `
    <div class="detail-head">
      <div class="detail-title-row">
        <div class="detail-title">
          <div class="detail-kicker">Event ${index + 1} of ${state.events.length}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}</div>
          <h2>${escapeHtml(ev.name)}</h2>
        </div>
        <div class="detail-actions">
          <span class="pill pill-${escapeHtml(ev.status)}">${escapeHtml(statusLabel)}</span>
          <button class="btn" data-act="edit-event" type="button">Edit</button>
          <button class="btn btn-ghost-danger" data-act="delete-event" type="button">Delete</button>
        </div>
      </div>
      ${ev.notes ? `<p class="detail-notes">${escapeHtml(ev.notes)}</p>` : ''}
      <div class="detail-bar">
        <button class="btn btn-accent btn-lg" data-act="start-event" type="button" ${ev.cues.length ? '' : 'disabled'}>
          ${ICON.play} Start event
        </button>
        <button class="btn" data-act="add-audio" type="button">+ Add audio</button>
        <button class="btn" data-act="folder-library" type="button">Audio folder</button>
        <span class="detail-meta">${ev.cues.length} cue${ev.cues.length === 1 ? '' : 's'}${total ? ' · ' + fmtTime(total) : ''}</span>
        <div class="spacer"></div>
        <button class="icon-btn" data-act="move-event-up" type="button" title="Move event up" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn" data-act="move-event-down" type="button" title="Move event down" ${index === state.events.length - 1 ? 'disabled' : ''}>↓</button>
      </div>
    </div>
    <ul class="cue-list" id="cue-list">
      ${ev.cues.map((cue, i) => cueRow(ev, cue, i, currentCueId)).join('')}
    </ul>
    ${ev.cues.length ? '' : `<div class="dropzone" data-act="add-audio" role="button" tabindex="0">
        <div class="dropzone-icon">＋</div>
        <strong>Add audio cues</strong>
        <span>Click to choose files, drop audio here, or use the audio folder. Multiple files are added in order.</span>
      </div>`}
    <div class="drop-hint">
      Press <strong>→</strong> for the next act, then <strong>1</strong> to start its first cue. <strong>Shift + →</strong> does both.
      <br>${keyHint}
      <br><strong>B</strong> = blackout (cut audio immediately). <strong>A</strong> = tick off the next anchoring/narration checklist item.
      <br>Drop audio files anywhere on this panel to add them as cues.
    </div>
  `;
}

function updateTransport() {
  const ev = currentEvent();
  const cue = currentCue();
  const index = currentCueIndex();

  if (ev && cue) {
    els.npTitle.textContent = ev.name;
    els.npSub.textContent = `Cue ${index + 1} of ${ev.cues.length} · ${cue.label}`;
  } else {
    const selected = selectedEvent();
    if (selected) {
      els.npTitle.textContent = selected.name;
      els.npSub.textContent = selected.cues.length
        ? 'Press 1 to start the first cue'
        : 'No audio cues in this act';
    } else {
      els.npTitle.textContent = 'Nothing queued';
      els.npSub.textContent = 'Select an event and press play';
    }
  }

  els.playBtn.innerHTML = state.playback.playing ? ICON.pause : ICON.play;
  els.playBtn.setAttribute('aria-label', state.playback.playing ? 'Pause' : 'Play');
  els.playBtn.classList.toggle('is-playing', state.playback.playing);

  const hasCue = Boolean(cue);
  els.prevBtn.disabled = !hasCue;
  els.nextBtn.disabled = !hasCue;
  els.stopBtn.disabled = !hasCue;
  els.seek.disabled = !hasCue;

  if (!hasCue) {
    els.seek.value = '0';
    els.timeCurrent.textContent = '0:00';
    els.timeTotal.textContent = '0:00';
  } else {
    updateProgress();
  }

  els.autoAdvance.checked = state.settings.autoAdvance;
  els.masterVolume.value = String(Math.round(state.settings.masterVolume * 100));

  updateVideoStage();
}

function updateVideoStage() {
  const cue = currentCue();
  const isVideo = Boolean(cue) && mediaKindOf(cue) === 'video';
  els.videoStage.hidden = !isVideo;
  if (!isVideo) {
    els.videoHint.hidden = true;
    return;
  }

  if (state.playback.playing) {
    els.videoHint.hidden = true;
    return;
  }

  els.videoHint.hidden = false;
  if (video.ended && !hasNextCue()) {
    els.videoHintTitle.textContent = 'End of act';
    els.videoHintSub.textContent = 'No more cues queued.';
  } else if (video.currentTime > 0.1 && !video.ended) {
    els.videoHintTitle.textContent = 'Paused';
    els.videoHintSub.textContent = 'Press Space to resume';
  } else {
    els.videoHintTitle.textContent = cue.label;
    els.videoHintSub.textContent = 'Press Space to play';
  }
}

function hasNextCue() {
  const ev = currentEvent();
  if (!ev) return false;
  return currentCueIndex() < ev.cues.length - 1;
}

let isSeeking = false;

function scrollCurrentCueIntoView() {
  const row = els.detail.querySelector('.cue.current');
  if (!row) return;

  const detail = els.detail;
  const detailRect = detail.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();

  const margin = 20;
  if (rowRect.top >= detailRect.top + margin && rowRect.bottom <= detailRect.bottom - margin) {
    return;
  }

  const target = detail.scrollTop
    + (rowRect.top - detailRect.top)
    - (detail.clientHeight - rowRect.height) / 2;

  detail.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
}

function updateProgress() {
  const cue = currentCue();
  const duration = Number.isFinite(player.duration) && player.duration > 0
    ? player.duration
    : (cue?.duration || 0);
  const current = Number.isFinite(player.currentTime) ? player.currentTime : 0;
  const pct = duration > 0 ? clamp(current / duration, 0, 1) : 0;

  if (!isSeeking) els.seek.value = String(Math.round(pct * 1000));
  els.timeCurrent.textContent = fmtTime(current);
  els.timeTotal.textContent = fmtTime(duration);

  const bar = els.detail.querySelector('.cue.current .cue-progress span');
  if (bar) bar.style.width = (pct * 100) + '%';
}

/* ---------- run-of-show checklist ---------- */

function normalizeChecklist(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const songs = Array.isArray(item.songs) ? item.songs.map(String) : [];
    const songsDone = Array.isArray(item.songsDone) && item.songsDone.length === songs.length
      ? item.songsDone.map(Boolean)
      : songs.map(() => false);
    return {
      id: uid(),
      label: String(item.label || 'Untitled'),
      checked: Boolean(item.checked),
      eventId: item.eventId || null,
      cueId: item.cueId || null,
      songs,
      songsDone,
      children: normalizeChecklist(item.children),
    };
  });
}

function flattenChecklist(items) {
  const out = [];
  for (const item of items) {
    out.push(item);
    if (Array.isArray(item.children)) out.push(...flattenChecklist(item.children));
  }
  return out;
}

function findChecklistItem(id, items = state.checklist) {
  for (const item of items) {
    if (item.id === id) return item;
    if (Array.isArray(item.children)) {
      const found = findChecklistItem(id, item.children);
      if (found) return found;
    }
  }
  return null;
}

function removeChecklistItem(id, items = state.checklist) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) {
      items.splice(i, 1);
      return true;
    }
    if (Array.isArray(items[i].children) && removeChecklistItem(id, items[i].children)) {
      return true;
    }
  }
  return false;
}

function checklistItemHtml(item, depth) {
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  return `
    <li class="checklist-item" data-checklist-id="${item.id}">
      <div class="checklist-row">
        <input type="checkbox" class="checklist-check" ${item.checked ? 'checked' : ''} aria-label="${escapeHtml(item.label)}">
        <span class="checklist-label ${item.checked ? 'done' : ''}">${escapeHtml(item.label)}</span>
        ${item.eventId ? '<span class="checklist-link-dot" title="Linked to audio"></span>' : ''}
        ${state.checklistEdit ? `
          <button class="icon-btn checklist-action" data-checklist-act="link" type="button" title="Link to audio">🔗</button>
          <button class="icon-btn checklist-action" data-checklist-act="rename" type="button" title="Rename">✎</button>
          ${depth === 0 ? `<button class="icon-btn checklist-action" data-checklist-act="add-child" type="button" title="Add sub-item">＋</button>` : ''}
          <button class="icon-btn danger checklist-action" data-checklist-act="delete" type="button" title="Delete">✕</button>
        ` : ''}
      </div>
      ${hasChildren ? `<ul class="checklist-children">${item.children.map((child) => checklistItemHtml(child, depth + 1)).join('')}</ul>` : ''}
    </li>
  `;
}

function renderChecklist() {
  if (!els.checklist) return;

  if (!state.checklist.length) {
    els.checklist.innerHTML = `<li class="checklist-empty">No checklist items yet.</li>`;
  } else {
    els.checklist.innerHTML = state.checklist.map((item) => checklistItemHtml(item, 0)).join('');
  }

  updateChecklistProgress();
  els.checklistAddWrap.hidden = !state.checklistEdit;
  els.checklistEditBtn.textContent = state.checklistEdit ? 'Done' : 'Edit';
  els.checklistEditBtn.classList.toggle('active', state.checklistEdit);
}

function updateChecklistProgress() {
  if (!els.checklistProgressBar || !els.checklistProgressText) return;
  const all = flattenChecklist(state.checklist);
  const done = all.filter((item) => item.checked).length;
  const pct = all.length ? (done / all.length) * 100 : 0;
  els.checklistProgressBar.style.width = pct + '%';
  els.checklistProgressText.textContent = `${done} / ${all.length} done`;
}

function saveChecklist() {
  saveMeta('checklist', state.checklist).catch(console.error);
}

function cascadeChecklistParents(items = state.checklist) {
  let changed = false;
  const visit = (list) => {
    for (const item of list) {
      if (Array.isArray(item.children) && item.children.length) {
        visit(item.children);
        if (item.children.every((child) => child.checked) && !item.checked) {
          item.checked = true;
          changed = true;
        }
      }
    }
  };
  visit(items);
  return changed;
}

function autoCheckChecklistForCue(eventId, cueId) {
  if (!eventId || !cueId) return;

  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return;
  const firstCueId = ev.cues[0]?.id;
  let changed = false;

  const visit = (items) => {
    for (const item of items) {
      if (item.eventId === eventId) {
        if (item.cueId === cueId || (!item.cueId && cueId === firstCueId)) {
          if (!item.checked) {
            item.checked = true;
            changed = true;
          }
        }
      }
      if (Array.isArray(item.children)) visit(item.children);
    }
  };
  visit(state.checklist);

  if (cascadeChecklistParents()) changed = true;

  if (changed) {
    saveChecklist();
    renderChecklist();
  }
}

function cueFileName(cue) {
  if (!cue || typeof cue.src !== 'string') return null;
  const prefix = 'media/';
  if (!cue.src.startsWith(prefix)) return null;
  try {
    return decodeURIComponent(cue.src.slice(prefix.length));
  } catch (err) {
    return null;
  }
}

/* Ticks the checklist off a finished *song*, not an event/cue id — this is for
   items (like Shakuntala's "Act 2") that need several specific files to finish,
   possibly reusing the same filename across several items in a row. Only the
   first still-open item needing this filename consumes the play; later repeats
   of the same file move on to the next item in list order. */
function onSongPlayed(filename) {
  if (!filename) return;

  const items = flattenChecklist(state.checklist);
  let matched = null;

  for (const item of items) {
    if (item.checked || !Array.isArray(item.songs) || !item.songs.length) continue;
    if (!Array.isArray(item.songsDone) || item.songsDone.length !== item.songs.length) {
      item.songsDone = item.songs.map(() => false);
    }
    const idx = item.songs.findIndex((s, i) => s === filename && !item.songsDone[i]);
    if (idx === -1) continue;
    item.songsDone[idx] = true;
    if (item.songsDone.every(Boolean)) item.checked = true;
    matched = item;
    break;
  }

  if (!matched) return;

  cascadeChecklistParents();
  saveChecklist();
  renderChecklist();
}

async function loadOrSeedChecklist() {
  try {
    const record = await dbGet('meta', 'checklist');
    if (record && Array.isArray(record.value)) {
      state.checklist = normalizeChecklist(record.value);
      return;
    }
  } catch (err) {
    console.error(err);
  }

  try {
    const response = await fetch('show.json', { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (Array.isArray(data.checklist)) {
      state.checklist = normalizeChecklist(data.checklist);
      saveChecklist();
    }
  } catch (err) {
    console.error(err);
  }
}

async function resetChecklist() {
  const ok = await confirmDialog(
    'Reset checklist?',
    'This reloads the tentative checklist from show.json and clears the check marks and any edits.',
    'Reset checklist'
  );
  if (!ok) return;

  try {
    const response = await fetch('show.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data.checklist)) throw new Error('No checklist in show.json');
    state.checklist = normalizeChecklist(data.checklist);
    state.checklistEdit = false;
    saveChecklist();
    renderChecklist();
    toast('Checklist reset.');
  } catch (err) {
    console.error(err);
    toast('Could not reload the checklist.', 'error');
  }
}

function openChecklistItemModal({ title, label, onSave }) {
  openModal(`
    <form id="checklist-item-form" class="modal-form">
      <h3>${escapeHtml(title)}</h3>
      <label>Item name
        <input name="label" required maxlength="160" value="${escapeHtml(label || '')}">
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn btn-accent">Save</button>
      </div>
    </form>
  `);

  const form = $('#checklist-item-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = String(new FormData(form).get('label') || '').trim();
    if (!value) return;
    onSave(value);
    els.modal.close();
  });
}

function openChecklistLinkModal(item) {
  const eventOptions = state.events.map((ev) =>
    `<option value="${ev.id}" ${item.eventId === ev.id ? 'selected' : ''}>${escapeHtml(ev.name)}</option>`
  ).join('');

  openModal(`
    <form id="checklist-link-form" class="modal-form">
      <h3>Link checklist item</h3>
      <p class="modal-text">“${escapeHtml(item.label)}” will check automatically when the linked audio plays.</p>
      <label>Event
        <select name="eventId">
          <option value="">— No event —</option>
          ${eventOptions}
        </select>
      </label>
      <label>Cue
        <select name="cueId">
          <option value="">Whole act / first cue</option>
        </select>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn btn-accent">Save link</button>
      </div>
    </form>
  `);

  const form = $('#checklist-link-form');
  const eventSelect = form.elements.eventId;
  const cueSelect = form.elements.cueId;

  const fillCues = () => {
    const ev = state.events.find((e) => e.id === eventSelect.value);
    const options = ev
      ? ev.cues.map((cue, index) =>
          `<option value="${cue.id}" ${item.cueId === cue.id ? 'selected' : ''}>${index + 1}. ${escapeHtml(cue.label)}</option>`
        ).join('')
      : '';
    cueSelect.innerHTML = `<option value="">Whole act / first cue</option>${options}`;
  };

  eventSelect.addEventListener('change', fillCues);
  fillCues();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    item.eventId = eventSelect.value || null;
    item.cueId = cueSelect.value || null;
    saveChecklist();
    renderChecklist();
    els.modal.close();
    toast('Checklist link saved.');
  });
}

function setChecklistVisible(visible) {
  state.checklistVisible = visible;
  els.layout.classList.toggle('with-checklist', visible);
  els.checklistPanel.classList.toggle('hidden', !visible);
  els.btnChecklist.classList.toggle('active', visible);
  els.btnChecklist.setAttribute('aria-pressed', String(visible));
  saveMeta('checklistVisible', visible).catch(console.error);
}

const NARRATION_RE = /anchoring|narration/i;

function tickNextNarrationItem() {
  const next = flattenChecklist(state.checklist).find((item) => !item.checked && NARRATION_RE.test(item.label));
  if (!next) {
    toast('No anchoring/narration items left to tick.');
    return;
  }
  next.checked = true;
  saveChecklist();
  renderChecklist();
  toast(`Ticked: ${next.label}`);
}

/* ---------- playback ---------- */

function targetVolume(cue) {
  return clamp((cue?.volume ?? 1) * state.settings.masterVolume, 0, 1);
}

async function getAudioURL(cue) {
  if (cue.src) return cue.src;
  if (!cue.audioId) return null;
  if (state.urls.has(cue.audioId)) return state.urls.get(cue.audioId);
  const record = await dbGet('audio', cue.audioId);
  if (!record || !record.blob) return null;
  const url = URL.createObjectURL(record.blob);
  state.urls.set(cue.audioId, url);
  return url;
}

let loadToken = 0;

async function loadCue(eventId, cueId, { play = false } = {}) {
  const ev = state.events.find((e) => e.id === eventId);
  const cue = ev?.cues.find((c) => c.id === cueId);
  if (!ev || !cue) return;

  const token = ++loadToken;
  cancelFade();
  stopTicker();
  setActivePlayer(playerFor(cue));
  player.pause();
  state.playback.eventId = eventId;
  state.playback.cueId = cueId;
  state.playback.playing = false;
  state.playback.loading = true;
  updateTransport();

  const url = await getAudioURL(cue);
  if (token !== loadToken) return;

  if (!url) {
    state.playback.loading = false;
    toast(`${mediaKindOf(cue) === 'video' ? 'Video' : 'Audio'} file is missing for this cue.`, 'error');
    updateTransport();
    return;
  }

  player.src = url;
  player.load();
  player.volume = 0;
  state.playback.loading = false;

  if (play) {
    await startPlayback();
  } else {
    updateTransport();
    renderDetail();
    scrollCurrentCueIntoView();
  }
}

async function startPlayback() {
  const cue = currentCue();
  if (!cue) return;

  if (player.ended || (Number.isFinite(player.duration) && player.currentTime >= player.duration - 0.05)) {
    try { player.currentTime = 0; } catch (err) { /* ignore */ }
  }

  try {
    await player.play();
  } catch (err) {
    toast('Could not start playback: ' + err.message, 'error');
    state.playback.playing = false;
    updateTransport();
    return;
  }

  state.playback.playing = true;

  const cueIndex = currentCueIndex();
  if (cueIndex >= 9 && state.playback.eventId) {
    state.cueKeyMode[state.playback.eventId] = true;
  }

  fadeTo(targetVolume(cue), cue.fadeIn ?? 0.3);
  markEventLive(state.playback.eventId);
  startTicker();
  updateTransport();
  renderEventList();
  renderDetail();
  scrollCurrentCueIntoView();
}

function togglePlay() {
  if (state.playback.playing) {
    player.pause();
    state.playback.playing = false;
    cancelFade();
    stopTicker();
    updateTransport();
    renderDetail();
    return;
  }

  const selected = selectedEvent();
  const atStart = !player.src || !state.playback.cueId || !(player.currentTime > 0.05);

  if (selected && selected.cues.length && atStart && selected.id !== state.playback.eventId) {
    startSelectedEvent();
    return;
  }

  if (player.src && state.playback.cueId) {
    startPlayback();
    return;
  }

  if (selected && selected.cues.length) {
    startSelectedEvent();
  } else {
    toast('Select an event with audio first.', 'error');
  }
}

function stopPlayback() {
  if (!player.src) return;
  const cue = currentCue();
  const fade = cue?.fadeOut ?? 0.5;

  const finish = () => {
    player.pause();
    try { player.currentTime = 0; } catch (err) { /* ignore */ }
    player.volume = 0;
    state.playback.playing = false;
    cancelFade();
    stopTicker();
    updateTransport();
    renderDetail();
  };

  if (state.playback.playing && fade > 0) {
    fadeTo(0, fade, finish);
  } else {
    finish();
  }
}

function blackout() {
  if (!player.src) return;

  cancelFade();
  stopTicker();
  player.pause();
  try { player.currentTime = 0; } catch (err) { /* ignore */ }
  player.volume = 0;
  state.playback.playing = false;
  updateTransport();
  renderDetail();
  toast('Blackout');
}

function clearLoadedCue() {
  player.pause();
  player.removeAttribute('src');
  player.load();
  state.playback.eventId = null;
  state.playback.cueId = null;
  state.playback.playing = false;
  state.playback.loading = false;
  cancelFade();
  stopTicker();
}

function nextCue() {
  const ev = currentEvent();
  if (!ev) {
    const selected = selectedEvent();
    if (selected && selected.cues.length) {
      loadCue(selected.id, selected.cues[0].id, { play: true });
    }
    return;
  }

  const index = currentCueIndex();
  const next = ev.cues[index + 1];
  if (next) {
    loadCue(ev.id, next.id, { play: state.playback.playing });
  } else {
    toast('This is the last cue of the event.');
  }
}

function prevCue() {
  const ev = currentEvent();
  if (!ev) return;
  const index = currentCueIndex();

  if (player.currentTime > 3 || index <= 0) {
    try { player.currentTime = 0; } catch (err) { /* ignore */ }
    updateProgress();
    return;
  }

  const prev = ev.cues[index - 1];
  if (prev) loadCue(ev.id, prev.id, { play: state.playback.playing });
}

function jumpToCue(index) {
  const ev = selectedEvent() || currentEvent();
  if (!ev) return;

  if (!ev.cues[index]) {
    toast(ev.cues.length ? `No cue ${index + 1} in this act.` : 'This act has no audio cues.');
    return;
  }

  loadCue(ev.id, ev.cues[index].id, { play: true });
}

function startSelectedEvent() {
  const ev = selectedEvent();
  if (!ev) return;
  if (!ev.cues.length) {
    toast('This event has no audio cues yet.', 'error');
    return;
  }
  delete state.cueKeyMode[ev.id];
  loadCue(ev.id, ev.cues[0].id, { play: true });
}

function selectRelative(dir, { withAudio = false, play = false } = {}) {
  if (!state.events.length) return;

  const start = state.events.findIndex((e) => e.id === state.selectedId);
  for (let i = start + dir; i >= 0 && i < state.events.length; i += dir) {
    const ev = state.events[i];
    if (withAudio && !ev.cues.length) continue;

    selectEvent(ev.id);
    if (play && ev.cues.length) {
      loadCue(ev.id, ev.cues[0].id, { play: true });
    }
    return;
  }

  toast(withAudio ? 'No more acts with audio.' : 'No more acts.');
}

function markEventLive(eventId) {
  let changed = false;
  for (const ev of state.events) {
    if (ev.id === eventId) {
      if (ev.status !== 'live') {
        ev.status = 'live';
        changed = true;
        dbPut('events', ev).catch(console.error);
      }
    } else if (ev.status === 'live') {
      ev.status = 'pending';
      changed = true;
      dbPut('events', ev).catch(console.error);
    }
  }
  if (changed) {
    renderEventList();
    renderDetail();
  }
}

function markEventDone(eventId) {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev || ev.status === 'done') return;
  ev.status = 'done';
  dbPut('events', ev).catch(console.error);
  renderEventList();
  renderDetail();
}

/* ---------- fades + ticker ---------- */

let fadeRaf = null;

function cancelFade() {
  if (fadeRaf) cancelAnimationFrame(fadeRaf);
  fadeRaf = null;
}

function fadeTo(target, seconds, done) {
  cancelFade();
  target = clamp(target, 0, 1);
  const start = player.volume;
  const duration = Math.max(0, Number(seconds) || 0) * 1000;

  if (duration === 0 || Math.abs(target - start) < 0.001) {
    player.volume = target;
    if (done) done();
    return;
  }

  const t0 = performance.now();
  const step = (now) => {
    const p = clamp((now - t0) / duration, 0, 1);
    player.volume = start + (target - start) * p;
    if (p < 1) {
      fadeRaf = requestAnimationFrame(step);
    } else {
      fadeRaf = null;
      if (done) done();
    }
  };
  fadeRaf = requestAnimationFrame(step);
}

let tickRaf = null;

function startTicker() {
  stopTicker();
  const tick = () => {
    updateProgress();
    if (state.playback.playing) tickRaf = requestAnimationFrame(tick);
  };
  tickRaf = requestAnimationFrame(tick);
}

function stopTicker() {
  if (tickRaf) cancelAnimationFrame(tickRaf);
  tickRaf = null;
}

/* ---------- audio events ---------- */

function onMediaEnded() {
  const ev = currentEvent();
  if (!ev) return;
  const index = currentCueIndex();
  const next = ev.cues[index + 1];
  const endedCue = ev.cues.find((c) => c.id === state.playback.cueId);

  autoCheckChecklistForCue(state.playback.eventId, state.playback.cueId);
  onSongPlayed(cueFileName(endedCue));

  if (state.settings.autoAdvance && next) {
    /* Cue up the next cue so it's ready to go, but wait for the operator
       to press Space — auto-advance moves the cue, it doesn't auto-play it. */
    loadCue(ev.id, next.id, { play: false });
    return;
  }

  state.playback.playing = false;
  stopTicker();
  if (index === ev.cues.length - 1) markEventDone(ev.id);
  updateTransport();
  renderDetail();
  renderEventList();
}

/* ---------- CRUD ---------- */

async function createEvent(data) {
  const ev = {
    id: uid(),
    name: data.name,
    time: data.time,
    notes: data.notes,
    status: data.status,
    order: state.events.length,
    cues: [],
  };
  state.events.push(ev);
  await dbPut('events', ev);
  state.selectedId = ev.id;
  saveMeta('selectedId', ev.id).catch(console.error);
  renderAll();
  els.detail.scrollTop = 0;
  toast('Event created');
}

async function updateEvent(id, data) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;
  ev.name = data.name;
  ev.time = data.time;
  ev.notes = data.notes;
  ev.status = data.status;
  await dbPut('events', ev);
  renderAll();
  toast('Event updated');
}

async function deleteEvent(id) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;

  const ok = await confirmDialog(
    'Delete event?',
    `“${ev.name}” and its ${ev.cues.length} cue${ev.cues.length === 1 ? '' : 's'} will be removed. This cannot be undone.`,
    'Delete event'
  );
  if (!ok) return;

  if (state.playback.eventId === id) {
    player.pause();
    player.removeAttribute('src');
    player.load();
    state.playback = { eventId: null, cueId: null, playing: false, loading: false };
    cancelFade();
    stopTicker();
  }

  for (const cue of ev.cues) {
    if (cue.audioId) await deleteAudio(cue.audioId);
  }

  state.events = state.events.filter((e) => e.id !== id);
  state.events.forEach((e, i) => { e.order = i; });
  await dbDelete('events', id);
  await Promise.all(state.events.map((e) => dbPut('events', e)));

  if (state.selectedId === id) {
    state.selectedId = state.events[0]?.id || null;
    saveMeta('selectedId', state.selectedId).catch(console.error);
  }

  renderAll();
  toast('Event deleted');
}

async function moveEvent(id, dir) {
  const from = state.events.findIndex((e) => e.id === id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= state.events.length) return;
  [state.events[from], state.events[to]] = [state.events[to], state.events[from]];
  state.events.forEach((e, i) => { e.order = i; });
  await Promise.all(state.events.map((e) => dbPut('events', e)));
  renderAll();
}

async function reorderEvent(draggedId, targetId, after) {
  if (draggedId === targetId) return;
  const from = state.events.findIndex((e) => e.id === draggedId);
  if (from < 0) return;
  const [ev] = state.events.splice(from, 1);
  let to = state.events.findIndex((e) => e.id === targetId);
  if (to < 0) to = state.events.length;
  if (after) to++;
  state.events.splice(to, 0, ev);
  state.events.forEach((e, i) => { e.order = i; });
  await Promise.all(state.events.map((e) => dbPut('events', e)));
  renderAll();
}

function selectEvent(id) {
  const previousId = state.selectedId;
  state.selectedId = id;

  if (
    id !== previousId &&
    !state.playback.playing &&
    state.playback.eventId &&
    state.playback.eventId !== id
  ) {
    clearLoadedCue();
  }

  renderEventList();
  renderDetail();
  updateTransport();
  els.detail.scrollTop = 0;
  saveMeta('selectedId', id).catch(console.error);
}

async function addAudioFiles(fileList) {
  const ev = selectedEvent();
  if (!ev) {
    toast('Select an event first.', 'error');
    return;
  }

  const files = Array.from(fileList).filter((file) =>
    file.type.startsWith('audio/') ||
    file.type.startsWith('video/') ||
    /\.(mp3|mpeg|mpg|wav|ogg|oga|m4a|aac|flac|opus|webm|aiff?|wma|mp4|m4v|mov|mkv|ogv)$/i.test(file.name)
  );

  if (!files.length) {
    toast('No supported audio or video files found.', 'error');
    return;
  }

  toast(`Adding ${files.length} file${files.length === 1 ? '' : 's'}…`);

  let added = 0;
  for (const file of files) {
    try {
      const audioId = uid();
      await dbPut('audio', { id: audioId, blob: file, name: file.name, type: file.type });
      const duration = await probeDuration(file);
      ev.cues.push({
        id: uid(),
        label: file.name.replace(/\.[^.]+$/, '') || file.name,
        src: null,
        audioId,
        kind: kindForName(file.name),
        duration,
        volume: 1,
        fadeIn: 0.3,
        fadeOut: 0.5,
      });
      added++;
    } catch (err) {
      console.error(err);
      toast(`Could not save “${file.name}”. Storage may be full.`, 'error');
    }
  }

  if (added) {
    try {
      await dbPut('events', ev);
      renderAll();
      toast(`${added} cue${added === 1 ? '' : 's'} added`);
    } catch (err) {
      console.error(err);
      toast('Could not save the event. Storage may be full.', 'error');
    }
  }
}

function probeDuration(source) {
  return new Promise((resolve) => {
    const isBlob = source instanceof Blob;
    const url = isBlob ? URL.createObjectURL(source) : String(source);
    const probe = new Audio();
    let settled = false;

    const finish = (duration) => {
      if (settled) return;
      settled = true;
      if (isBlob) URL.revokeObjectURL(url);
      probe.removeAttribute('src');
      probe.load();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
    };

    probe.preload = 'metadata';
    probe.onloadedmetadata = () => finish(probe.duration);
    probe.onerror = () => finish(0);
    setTimeout(() => finish(0), 8000);
    probe.src = url;
  });
}

async function addFolderCue(file) {
  const ev = selectedEvent();
  if (!ev) {
    toast('Select an event first.', 'error');
    return false;
  }

  try {
    const duration = await probeDuration(file.path);
    ev.cues.push({
      id: uid(),
      label: file.name.replace(/\.[^.]+$/, '') || file.name,
      src: file.path,
      audioId: null,
      kind: kindForName(file.name),
      duration,
      volume: 1,
      fadeIn: 0.3,
      fadeOut: 0.5,
    });
    await dbPut('events', ev);
    renderAll();
    return true;
  } catch (err) {
    console.error(err);
    toast(`Could not add “${file.name}”.`, 'error');
    return false;
  }
}

async function openFolderLibrary() {
  const ev = selectedEvent();
  if (!ev) {
    toast('Select an event first.', 'error');
    return;
  }

  openModal(`
    <div class="modal-form folder-modal">
      <h3>Audio folder</h3>
      <p class="modal-text" id="folder-path">Files in the configured audio folder. Add them to <strong>${escapeHtml(ev.name)}</strong>.</p>
      <div id="folder-list" class="folder-list"><div class="folder-loading">Reading folder…</div></div>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Close</button>
        <button type="button" class="btn" id="folder-refresh">Refresh</button>
        <button type="button" class="btn btn-accent" id="folder-add" disabled>Add selected</button>
      </div>
    </div>
  `);

  const listEl = $('#folder-list');
  const addBtn = $('#folder-add');
  let files = [];

  const selectedFiles = () =>
    $$('input[data-folder-index]:checked', listEl)
      .map((el) => files[Number(el.dataset.folderIndex)])
      .filter(Boolean);

  const updateAddButton = () => {
    const count = selectedFiles().length;
    addBtn.disabled = count === 0;
    addBtn.textContent = count ? `Add ${count} cue${count === 1 ? '' : 's'}` : 'Add selected';
  };

  const renderFiles = () => {
    if (!files.length) {
      listEl.innerHTML = `<div class="folder-empty">No audio files found in the configured folder. Add files there, then press Refresh.</div>`;
      updateAddButton();
      return;
    }

    listEl.innerHTML = files.map((file, index) => `
      <label class="folder-item">
        <input type="checkbox" data-folder-index="${index}" checked>
        <span class="folder-name">${escapeHtml(file.name)}</span>
        <span class="folder-size">${fmtBytes(file.size)}</span>
      </label>
    `).join('');
    updateAddButton();
  };

  const load = async () => {
    listEl.innerHTML = `<div class="folder-loading">Reading folder…</div>`;
    addBtn.disabled = true;
    try {
      const response = await fetch('api/audio', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      files = Array.isArray(data.files) ? data.files : [];
      if (data.folder) {
        const pathEl = $('#folder-path');
        if (pathEl) {
          pathEl.innerHTML = `Files in <code>${escapeHtml(data.folder)}</code>. Add them to <strong>${escapeHtml(ev.name)}</strong>.`;
        }
      }
      renderFiles();
    } catch (err) {
      console.error(err);
      files = [];
      listEl.innerHTML = `<div class="folder-empty">Could not read the audio folder. Start the app with <code>start.bat</code> so the local server can list the folder, or use <strong>+ Add audio</strong> to import files.</div>`;
      updateAddButton();
    }
  };

  listEl.addEventListener('change', updateAddButton);
  $('#folder-refresh').addEventListener('click', load);

  addBtn.addEventListener('click', async () => {
    const chosen = selectedFiles();
    if (!chosen.length) return;

    addBtn.disabled = true;
    addBtn.textContent = 'Adding…';

    let added = 0;
    for (const file of chosen) {
      if (await addFolderCue(file)) added++;
    }

    els.modal.close();
    if (added) {
      toast(`${added} cue${added === 1 ? '' : 's'} added from the folder`);
    }
  });

  await load();
}

async function deleteAudio(audioId) {
  const url = state.urls.get(audioId);
  if (url) {
    URL.revokeObjectURL(url);
    state.urls.delete(audioId);
  }
  await dbDelete('audio', audioId);
}

async function moveCue(cueId, dir) {
  const ev = selectedEvent();
  if (!ev) return;
  const from = ev.cues.findIndex((c) => c.id === cueId);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= ev.cues.length) return;
  [ev.cues[from], ev.cues[to]] = [ev.cues[to], ev.cues[from]];
  await dbPut('events', ev);
  renderDetail();
  renderEventList();
}

async function reorderCue(draggedId, targetId, after) {
  const ev = selectedEvent();
  if (!ev || draggedId === targetId) return;
  const from = ev.cues.findIndex((c) => c.id === draggedId);
  if (from < 0) return;
  const [cue] = ev.cues.splice(from, 1);
  let to = ev.cues.findIndex((c) => c.id === targetId);
  if (to < 0) to = ev.cues.length;
  if (after) to++;
  ev.cues.splice(to, 0, cue);
  await dbPut('events', ev);
  renderDetail();
  renderEventList();
}

async function deleteCue(cueId) {
  const ev = selectedEvent();
  if (!ev) return;
  const cue = ev.cues.find((c) => c.id === cueId);
  if (!cue) return;

  const ok = await confirmDialog(
    'Remove cue?',
    `“${cue.label}” will be removed from this event.`,
    'Remove cue'
  );
  if (!ok) return;

  if (state.playback.cueId === cueId) {
    player.pause();
    player.removeAttribute('src');
    player.load();
    state.playback.eventId = null;
    state.playback.cueId = null;
    state.playback.playing = false;
    cancelFade();
    stopTicker();
  }

  ev.cues = ev.cues.filter((c) => c.id !== cueId);
  await dbPut('events', ev);
  if (cue.audioId) await deleteAudio(cue.audioId);
  renderAll();
  toast('Cue removed');
}

/* ---------- modals ---------- */

function openModal(html) {
  els.modal.innerHTML = html;
  if (!els.modal.open) els.modal.showModal();
  const first = els.modal.querySelector('input, textarea, select, button');
  if (first) setTimeout(() => first.focus(), 30);
}

function openEventModal(ev = null) {
  const isNew = !ev;
  openModal(`
    <form id="event-form" class="modal-form">
      <h3>${isNew ? 'New event' : 'Edit event'}</h3>
      <label>Event name
        <input name="name" required maxlength="120" placeholder="e.g. Welcome &amp; lamp lighting" value="${escapeHtml(ev?.name || '')}">
      </label>
      <div class="row">
        <label>Start time
          <input name="time" type="time" value="${escapeHtml(ev?.time || '')}">
        </label>
        <label>Status
          <select name="status">
            <option value="pending" ${!ev || ev.status === 'pending' ? 'selected' : ''}>Upcoming</option>
            <option value="live" ${ev?.status === 'live' ? 'selected' : ''}>Live</option>
            <option value="done" ${ev?.status === 'done' ? 'selected' : ''}>Done</option>
          </select>
        </label>
      </div>
      <label>Notes
        <textarea name="notes" rows="3" placeholder="Stage directions, announcements, contacts…">${escapeHtml(ev?.notes || '')}</textarea>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn btn-accent">${isNew ? 'Create event' : 'Save changes'}</button>
      </div>
    </form>
  `);

  const form = $('#event-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const data = {
      name: String(fd.get('name') || '').trim(),
      time: String(fd.get('time') || ''),
      notes: String(fd.get('notes') || '').trim(),
      status: String(fd.get('status') || 'pending'),
    };
    if (!data.name) return;

    try {
      if (isNew) await createEvent(data);
      else await updateEvent(ev.id, data);
      els.modal.close();
    } catch (err) {
      console.error(err);
      toast('Could not save the event. Storage may be full.', 'error');
    }
  });
}

function openCueModal(ev, cue) {
  openModal(`
    <form id="cue-form" class="modal-form">
      <h3>Edit cue</h3>
      <label>Cue label
        <input name="label" required maxlength="120" value="${escapeHtml(cue.label)}">
      </label>
      <div class="row-3">
        <label>Volume <span class="range-val" data-for="volume">${Math.round((cue.volume ?? 1) * 100)}%</span>
          <input name="volume" type="range" min="0" max="100" value="${Math.round((cue.volume ?? 1) * 100)}">
        </label>
        <label>Fade in (s)
          <input name="fadeIn" type="number" min="0" max="10" step="0.1" value="${cue.fadeIn ?? 0.3}">
        </label>
        <label>Fade out (s)
          <input name="fadeOut" type="number" min="0" max="10" step="0.1" value="${cue.fadeOut ?? 0.5}">
        </label>
      </div>
      <label>Replace audio/video file (optional)
        <input name="file" type="file" accept="audio/*,video/*">
      </label>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn btn-accent">Save cue</button>
      </div>
    </form>
  `);

  const form = $('#cue-form');
  const volume = form.elements.volume;
  const volumeLabel = form.querySelector('[data-for="volume"]');
  volume.addEventListener('input', () => {
    volumeLabel.textContent = volume.value + '%';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);

    cue.label = String(fd.get('label') || '').trim() || cue.label;
    cue.volume = clamp(Number(fd.get('volume')) / 100, 0, 1);
    cue.fadeIn = clamp(Number(fd.get('fadeIn')) || 0, 0, 10);
    cue.fadeOut = clamp(Number(fd.get('fadeOut')) || 0, 0, 10);

    const file = form.elements.file.files[0];
    if (file) {
      const wasCurrent = state.playback.cueId === cue.id;
      const wasPlaying = state.playback.playing;

      if (wasCurrent) {
        player.pause();
        state.playback.playing = false;
        cancelFade();
        stopTicker();
      }

      try {
        const audioId = uid();
        await dbPut('audio', { id: audioId, blob: file, name: file.name, type: file.type });
        if (cue.audioId) await deleteAudio(cue.audioId);
        cue.src = null;
        cue.audioId = audioId;
        cue.kind = kindForName(file.name);
        cue.duration = await probeDuration(file);
      } catch (err) {
        console.error(err);
        toast('Could not replace the audio file. Storage may be full.', 'error');
      }

      if (wasCurrent) {
        const current = currentEvent();
        if (current) await loadCue(current.id, cue.id, { play: wasPlaying });
      }
    }

    try {
      await dbPut('events', ev);

      if (state.playback.cueId === cue.id && state.playback.playing) {
        fadeTo(targetVolume(cue), 0.15);
      }

      els.modal.close();
      renderAll();
      toast('Cue updated');
    } catch (err) {
      console.error(err);
      toast('Could not save the cue. Storage may be full.', 'error');
    }
  });
}

function openHelp() {
  openModal(`
    <div class="modal-form">
      <h3>Keyboard shortcuts</h3>
      <div class="shortcut-grid">
        <kbd>Space</kbd><span>Play / pause</span>
        <kbd>Enter</kbd><span>Start the selected event</span>
        <kbd>→ / ←</kbd><span>Select next / previous event</span>
        <kbd>1–9</kbd><span>Start cues 1–9. After cue 10 plays, 1–9 become cues 11–19</span>
        <kbd>0</kbd><span>Start cue 10</span>
        <kbd>Shift + →</kbd><span>Next act with audio + start its first cue</span>
        <kbd>Shift + ←</kbd><span>Previous act with audio + start its first cue</span>
        <kbd>N</kbd><span>Next cue</span>
        <kbd>P</kbd><span>Previous cue / restart</span>
        <kbd>B</kbd><span>Blackout — cut audio immediately</span>
        <kbd>A</kbd><span>Tick off the next anchoring/narration checklist item</span>
        <kbd>Esc</kbd><span>Stop with fade</span>
        <kbd>↑ / ↓</kbd><span>Select previous / next event</span>
        <kbd>?</kbd><span>Show this help</span>
      </div>
      <p class="modal-text">In the checklist, use <strong>Edit → 🔗</strong> to link an item to an event or cue. Linked items check themselves when that audio plays, and clicking a linked item jumps to it.</p>
      <p class="modal-text">Audio files and the run of show are stored locally in this browser. Use the same browser and the same folder to keep your show.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-accent" data-close>Got it</button>
      </div>
    </div>
  `);
}

function confirmDialog(title, message, confirmLabel = 'Delete') {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal-form">
        <h3>${escapeHtml(title)}</h3>
        <p class="modal-text">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-result="0">Cancel</button>
          <button type="button" class="btn btn-danger" data-result="1">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `);

    const onClick = (e) => {
      const btn = e.target.closest('[data-result]');
      if (!btn) return;
      cleanup();
      els.modal.close();
      resolve(btn.dataset.result === '1');
    };

    const onClose = () => {
      cleanup();
      resolve(false);
    };

    function cleanup() {
      els.modal.removeEventListener('click', onClick);
      els.modal.removeEventListener('close', onClose);
    }

    els.modal.addEventListener('click', onClick);
    els.modal.addEventListener('close', onClose);
  });
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
  el.textContent = message;
  els.toasts.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ---------- meta ---------- */

async function saveMeta(key, value) {
  await dbPut('meta', { key, value });
}

let settingsTimer = null;

function saveSettingsSoon() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    saveMeta('settings', state.settings).catch(console.error);
  }, 250);
}

/* ---------- clock ---------- */

async function toggleClock() {
  if (state.clock.running) {
    state.clock.accumulated += Date.now() - state.clock.startedAt;
    state.clock.running = false;
    state.clock.startedAt = null;
  } else {
    state.clock.running = true;
    state.clock.startedAt = Date.now();
  }
  updateClock();
  try {
    await saveMeta('clock', state.clock);
  } catch (err) {
    console.error(err);
  }
}

async function resetClock() {
  state.clock = { running: false, startedAt: null, accumulated: 0 };
  updateClock();
  try {
    await saveMeta('clock', state.clock);
  } catch (err) {
    console.error(err);
  }
}

function updateClock() {
  els.clockNow.textContent = new Date().toLocaleTimeString([], { hour12: false });
  const elapsed = state.clock.accumulated +
    (state.clock.running && state.clock.startedAt ? Date.now() - state.clock.startedAt : 0);
  els.showTimer.textContent = fmtClock(elapsed);
  els.clockToggle.textContent = state.clock.running
    ? 'Pause'
    : (state.clock.accumulated > 0 ? 'Resume' : 'Start');
  els.clockToggle.classList.toggle('running', state.clock.running);
}

/* ---------- print ---------- */

function buildPrintSheet() {
  const now = new Date();
  els.printSheet.innerHTML = `
    <header class="print-head">
      <h1>Annual Function — Run of Show</h1>
      <p>${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </header>
    ${state.events.map((ev, i) => `
      <section class="print-event">
        <h2>
          <span class="print-num">${i + 1}</span>
          <span>${escapeHtml(ev.name)}</span>
          <span class="print-time">${escapeHtml(ev.time || '')}</span>
        </h2>
        ${ev.notes ? `<p class="print-notes">${escapeHtml(ev.notes)}</p>` : ''}
        ${ev.cues.length
          ? `<ol class="print-cues">${ev.cues.map((cue) => `<li><span>${escapeHtml(cue.label)}</span><span>${fmtTime(cue.duration)}</span></li>`).join('')}</ol>`
          : '<p class="print-notes">No audio cues.</p>'}
      </section>
    `).join('')}
  `;
}

/* ---------- detail actions ---------- */

async function onDetailClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const ev = selectedEvent();
  const cueEl = btn.closest('[data-cue-id]');
  const cueId = cueEl?.dataset.cueId;

  switch (act) {
    case 'new-event':
      openEventModal();
      break;
    case 'edit-event':
      if (ev) openEventModal(ev);
      break;
    case 'delete-event':
      if (ev) await deleteEvent(ev.id);
      break;
    case 'start-event':
      if (ev && ev.cues.length) loadCue(ev.id, ev.cues[0].id, { play: true });
      break;
    case 'add-audio':
      pickAudioFiles();
      break;
    case 'folder-library':
      openFolderLibrary();
      break;
    case 'reset-cue-keys':
      if (ev) {
        delete state.cueKeyMode[ev.id];
        renderDetail();
        toast('Cue keys reset.');
      }
      break;
    case 'move-event-up':
      if (ev) await moveEvent(ev.id, -1);
      break;
    case 'move-event-down':
      if (ev) await moveEvent(ev.id, 1);
      break;
    case 'play-cue':
      if (ev && cueId) loadCue(ev.id, cueId, { play: true });
      break;
    case 'cue-up':
      if (cueId) await moveCue(cueId, -1);
      break;
    case 'cue-down':
      if (cueId) await moveCue(cueId, 1);
      break;
    case 'edit-cue': {
      const cue = ev?.cues.find((c) => c.id === cueId);
      if (ev && cue) openCueModal(ev, cue);
      break;
    }
    case 'delete-cue':
      if (cueId) await deleteCue(cueId);
      break;
  }
}

function pickAudioFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,video/*';
  input.multiple = true;
  input.style.display = 'none';
  document.body.appendChild(input);

  const cleanup = () => input.remove();
  input.addEventListener('change', () => {
    if (input.files && input.files.length) addAudioFiles(input.files);
    cleanup();
  });
  input.addEventListener('cancel', cleanup);
  input.click();
}

/* ---------- keyboard ---------- */

function onGlobalKeydown(e) {
  if (els.modal.open) return;
  const target = e.target;
  if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (e.key === 'Enter' && target.closest('button, a, [role="button"]')) return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlay();
      break;
    case 'Enter':
      e.preventDefault();
      startSelectedEvent();
      break;
    case 'n':
    case 'N':
      e.preventDefault();
      nextCue();
      break;
    case 'b':
    case 'B':
      e.preventDefault();
      blackout();
      break;
    case 'p':
    case 'P':
      e.preventDefault();
      prevCue();
      break;
    case 'a':
    case 'A':
      e.preventDefault();
      tickNextNarrationItem();
      break;
    case 'Escape':
      e.preventDefault();
      stopPlayback();
      break;
    case 'ArrowDown':
      e.preventDefault();
      selectRelative(1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectRelative(-1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (e.shiftKey) {
        selectRelative(1, { withAudio: true, play: true });
      } else {
        selectRelative(1);
      }
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (e.shiftKey) {
        selectRelative(-1, { withAudio: true, play: true });
      } else {
        selectRelative(-1);
      }
      break;
    case '?':
      e.preventDefault();
      openHelp();
      break;
    default: {
      const cueIndex = cueIndexForKey(e.key, selectedEvent());
      if (cueIndex >= 0) {
        e.preventDefault();
        jumpToCue(cueIndex);
      }
    }
  }
}

/* ---------- drag and drop ---------- */

function bindDragAndDrop() {
  let dragEventId = null;
  let dragCueId = null;
  let dragDepth = 0;

  /* event list reorder */
  els.eventList.addEventListener('dragstart', (e) => {
    const item = e.target.closest('[data-event-id]');
    if (!item) return;
    dragEventId = item.dataset.eventId;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragEventId);
  });

  els.eventList.addEventListener('dragend', () => {
    dragEventId = null;
    $$('.event-item', els.eventList).forEach((el) => el.classList.remove('dragging', 'drop-before', 'drop-after'));
  });

  els.eventList.addEventListener('dragover', (e) => {
    if (!dragEventId) return;
    const item = e.target.closest('[data-event-id]');
    if (!item) return;
    e.preventDefault();
    $$('.event-item', els.eventList).forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    const rect = item.getBoundingClientRect();
    item.classList.add(e.clientY > rect.top + rect.height / 2 ? 'drop-after' : 'drop-before');
  });

  els.eventList.addEventListener('drop', async (e) => {
    if (!dragEventId) return;
    const item = e.target.closest('[data-event-id]');
    if (!item) return;
    e.preventDefault();
    const after = item.classList.contains('drop-after');
    const dragged = dragEventId;
    const target = item.dataset.eventId;
    dragEventId = null;
    await reorderEvent(dragged, target, after);
  });

  /* cue reorder */
  els.detail.addEventListener('dragstart', (e) => {
    const item = e.target.closest('[data-cue-id]');
    if (!item) return;
    dragCueId = item.dataset.cueId;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragCueId);
  });

  els.detail.addEventListener('dragend', () => {
    dragCueId = null;
    $$('.cue', els.detail).forEach((el) => el.classList.remove('dragging', 'drop-before', 'drop-after'));
  });

  els.detail.addEventListener('dragover', (e) => {
    if (!dragCueId) return;
    const item = e.target.closest('[data-cue-id]');
    if (!item) return;
    e.preventDefault();
    $$('.cue', els.detail).forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    const rect = item.getBoundingClientRect();
    item.classList.add(e.clientY > rect.top + rect.height / 2 ? 'drop-after' : 'drop-before');
  });

  els.detail.addEventListener('drop', async (e) => {
    if (!dragCueId) return;
    const item = e.target.closest('[data-cue-id]');
    if (!item) return;
    e.preventDefault();
    const after = item.classList.contains('drop-after');
    const dragged = dragCueId;
    const target = item.dataset.cueId;
    dragCueId = null;
    await reorderCue(dragged, target, after);
  });

  /* file drop */
  els.detail.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    els.detail.classList.add('dragging-files');
  });

  els.detail.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });

  els.detail.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) els.detail.classList.remove('dragging-files');
  });

  els.detail.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    dragDepth = 0;
    els.detail.classList.remove('dragging-files');
    addAudioFiles(e.dataTransfer.files);
  });
}

/* ---------- bind ---------- */

function bindEvents() {
  els.prevBtn.innerHTML = ICON.prev;
  els.nextBtn.innerHTML = ICON.next;
  els.stopBtn.innerHTML = ICON.stop;
  els.playBtn.innerHTML = ICON.play;

  els.btnAddEvent.addEventListener('click', () => openEventModal());
  els.btnHelp.addEventListener('click', openHelp);
  els.btnPrint.addEventListener('click', () => {
    buildPrintSheet();
    window.print();
  });

  els.btnChecklist.addEventListener('click', () => setChecklistVisible(!state.checklistVisible));

  els.checklistEditBtn.addEventListener('click', () => {
    state.checklistEdit = !state.checklistEdit;
    renderChecklist();
  });

  els.checklistResetBtn.addEventListener('click', resetChecklist);

  els.checklistAddBtn.addEventListener('click', () => {
    openChecklistItemModal({
      title: 'Add checklist item',
      label: '',
      onSave: (label) => {
        state.checklist.push({ id: uid(), label, checked: false, children: [] });
        saveChecklist();
        renderChecklist();
      },
    });
  });

  els.checklist.addEventListener('change', (e) => {
    if (!e.target.classList.contains('checklist-check')) return;
    const li = e.target.closest('[data-checklist-id]');
    if (!li) return;
    const item = findChecklistItem(li.dataset.checklistId);
    if (!item) return;
    item.checked = e.target.checked;
    saveChecklist();
    renderChecklist();
  });

  els.checklist.addEventListener('click', (e) => {
    const action = e.target.closest('[data-checklist-act]');
    if (action) {
      const li = action.closest('[data-checklist-id]');
      if (!li) return;
      const item = findChecklistItem(li.dataset.checklistId);
      if (!item) return;

      if (action.dataset.checklistAct === 'link') {
        openChecklistLinkModal(item);
      } else if (action.dataset.checklistAct === 'rename') {
        openChecklistItemModal({
          title: 'Rename item',
          label: item.label,
          onSave: (label) => {
            item.label = label;
            saveChecklist();
            renderChecklist();
          },
        });
      } else if (action.dataset.checklistAct === 'add-child') {
        openChecklistItemModal({
          title: 'Add sub-item',
          label: '',
          onSave: (label) => {
            if (!Array.isArray(item.children)) item.children = [];
            item.children.push({ id: uid(), label, checked: false, children: [] });
            saveChecklist();
            renderChecklist();
          },
        });
      } else if (action.dataset.checklistAct === 'delete') {
        confirmDialog('Delete checklist item?', `“${item.label}” will be removed.`, 'Delete item').then((ok) => {
          if (!ok) return;
          removeChecklistItem(item.id);
          saveChecklist();
          renderChecklist();
        });
      }
      return;
    }

    if (state.checklistEdit) return;

    const label = e.target.closest('.checklist-label');
    if (!label) return;
    const li = label.closest('[data-checklist-id]');
    if (!li) return;
    const item = findChecklistItem(li.dataset.checklistId);
    if (!item || !item.eventId) return;

    selectEvent(item.eventId);
    if (item.cueId) {
      const cueRow = els.detail.querySelector(`[data-cue-id="${item.cueId}"]`);
      if (cueRow) cueRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  els.search.addEventListener('input', () => {
    state.filter = els.search.value;
    renderEventList();
  });

  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      els.search.value = '';
      state.filter = '';
      renderEventList();
      els.search.blur();
    }
  });

  els.eventList.addEventListener('click', (e) => {
    const item = e.target.closest('[data-event-id]');
    if (!item) return;
    selectEvent(item.dataset.eventId);
  });

  els.eventList.addEventListener('dblclick', (e) => {
    const item = e.target.closest('[data-event-id]');
    if (!item) return;
    const ev = state.events.find((x) => x.id === item.dataset.eventId);
    if (ev && ev.cues.length) loadCue(ev.id, ev.cues[0].id, { play: true });
  });

  els.eventList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('[data-event-id]');
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    selectEvent(item.dataset.eventId);
  });

  els.detail.addEventListener('click', onDetailClick);

  els.detail.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-act]');
    if (!el || el.tagName === 'BUTTON') return;
    e.preventDefault();
    e.stopPropagation();
    el.click();
  });

  els.playBtn.addEventListener('click', togglePlay);
  els.prevBtn.addEventListener('click', prevCue);
  els.nextBtn.addEventListener('click', nextCue);
  els.stopBtn.addEventListener('click', stopPlayback);

  els.seek.addEventListener('pointerdown', () => { isSeeking = true; });
  els.seek.addEventListener('pointerup', () => { isSeeking = false; });
  els.seek.addEventListener('change', () => { isSeeking = false; });
  window.addEventListener('pointerup', () => { isSeeking = false; });

  els.seek.addEventListener('input', () => {
    const duration = Number.isFinite(player.duration) && player.duration > 0
      ? player.duration
      : (currentCue()?.duration || 0);
    if (duration <= 0) return;
    try {
      player.currentTime = (Number(els.seek.value) / 1000) * duration;
    } catch (err) { /* ignore */ }
    updateProgress();
  });

  els.masterVolume.addEventListener('input', () => {
    state.settings.masterVolume = Number(els.masterVolume.value) / 100;
    cancelFade();
    const cue = currentCue();
    if (cue) player.volume = targetVolume(cue);
    saveSettingsSoon();
  });

  els.autoAdvance.addEventListener('change', () => {
    state.settings.autoAdvance = els.autoAdvance.checked;
    saveSettingsSoon();
  });

  els.clockToggle.addEventListener('click', toggleClock);
  els.clockReset.addEventListener('click', resetClock);

  els.modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) {
      els.modal.close();
      return;
    }
    if (e.target === els.modal) els.modal.close();
  });

  for (const el of [audio, video]) {
    el.addEventListener('ended', (e) => {
      if (e.target !== player) return;
      onMediaEnded();
    });
    el.addEventListener('timeupdate', (e) => {
      if (e.target !== player) return;
      updateProgress();
    });
    el.addEventListener('loadedmetadata', (e) => {
      if (e.target !== player) return;
      updateProgress();
    });
    el.addEventListener('durationchange', (e) => {
      if (e.target !== player) return;
      updateProgress();
    });

    el.addEventListener('pause', (e) => {
      if (e.target !== player) return;
      if (state.playback.playing) {
        state.playback.playing = false;
        cancelFade();
        stopTicker();
        updateTransport();
        renderDetail();
      }
    });

    el.addEventListener('error', (e) => {
      if (e.target !== player || !player.src) return;
      toast(`${mediaKindOf(currentCue()) === 'video' ? 'Video' : 'Audio'} could not be loaded. The file may be missing or unsupported.`, 'error');
      state.playback.playing = false;
      stopTicker();
      updateTransport();
    });
  }

  document.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('beforeprint', buildPrintSheet);

  bindDragAndDrop();
}

/* ---------- show file seed ---------- */

async function seedFromShowFile() {
  try {
    const response = await fetch('show.json', { cache: 'no-store' });
    if (!response.ok) return false;
    const data = await response.json();
    if (!Array.isArray(data.events) || !data.events.length) return false;

    const events = data.events.map((item, index) => ({
      id: uid(),
      name: String(item.name || 'Untitled event'),
      time: String(item.time || ''),
      notes: String(item.notes || ''),
      status: ['pending', 'live', 'done'].includes(item.status) ? item.status : 'pending',
      order: index,
      cues: (Array.isArray(item.cues) ? item.cues : []).map((cue) => ({
        id: uid(),
        label: String(cue.label || cue.file || 'Cue'),
        src: cue.file ? 'media/' + encodeURIComponent(cue.file) : (cue.src || null),
        audioId: null,
        kind: kindForName(cue.file || cue.src || ''),
        duration: Number(cue.duration) > 0 ? Number(cue.duration) : 0,
        volume: Number.isFinite(Number(cue.volume)) ? clamp(Number(cue.volume), 0, 1) : 1,
        fadeIn: Number.isFinite(Number(cue.fadeIn)) ? clamp(Number(cue.fadeIn), 0, 10) : 0.3,
        fadeOut: Number.isFinite(Number(cue.fadeOut)) ? clamp(Number(cue.fadeOut), 0, 10) : 0.5,
      })),
    }));

    for (const ev of events) {
      await dbPut('events', ev);
    }

    state.events = events;
    state.selectedId = events[0]?.id || null;
    await saveMeta('selectedId', state.selectedId);
    await saveMeta('seeded', true);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

/* ---------- init ---------- */

async function init() {
  bindEvents();

  try {
    const [events, settingsRecord, clockRecord, selectedRecord, seededRecord, checklistVisibleRecord] = await Promise.all([
      dbGetAll('events'),
      dbGet('meta', 'settings'),
      dbGet('meta', 'clock'),
      dbGet('meta', 'selectedId'),
      dbGet('meta', 'seeded'),
      dbGet('meta', 'checklistVisible'),
    ]);

    state.events = (events || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (settingsRecord?.value) Object.assign(state.settings, settingsRecord.value);
    if (clockRecord?.value) Object.assign(state.clock, clockRecord.value);

    state.selectedId = selectedRecord?.value || state.events[0]?.id || null;
    if (state.selectedId && !state.events.some((e) => e.id === state.selectedId)) {
      state.selectedId = state.events[0]?.id || null;
    }

    if (!state.events.length && !seededRecord?.value) {
      await seedFromShowFile();
    }

    await loadOrSeedChecklist();

    const savedChecklistVisible = checklistVisibleRecord?.value;
    setChecklistVisible(
      typeof savedChecklistVisible === 'boolean'
        ? savedChecklistVisible
        : window.innerWidth > 1200
    );
  } catch (err) {
    console.error(err);
    toast('Could not load saved data. IndexedDB may be unavailable in this browser.', 'error');
  }

  renderAll();
  updateClock();
  setInterval(updateClock, 1000);
}

init();
