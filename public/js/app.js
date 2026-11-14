/* Brightech chat UI - talks to the Express/MongoDB backend.
 * The conversation logic now lives on the server (services/flow); this file only renders
 * messages, sends the user's actions to the API and keeps the clock/preferences. */
(() => {
  'use strict';

  /* ---------------- helpers ---------------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (s) => esc(s).replace(/\*(.+?)\*/g, '<b>$1</b>');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const API_BASE = (window.BRIGHTECH_API_BASE || '').replace(/\/$/, '');
  const TOKEN_KEY = 'bt_token';
  const PREF_KEY = 'bt_prefs';

  /* ---------------- preferences (timezone + 12/24h) ---------------- */
  const ZONES = ['Asia/Kolkata', 'UTC', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];
  let prefs = (() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY));
      if (p && p.timezone && p.timeFormat) return p;
    } catch (_e) { /* ignore */ }
    return { timezone: 'Asia/Kolkata', timeFormat: '12h' };
  })();
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (_e) { /* ignore */ } };

  /** '3:45 pm' or '15:45' for an ISO instant, in the selected timezone. */
  function clock(iso) {
    const d = new Date(iso || Date.now());
    if (prefs.timeFormat === '24h') {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: prefs.timezone }).format(d);
    }
    const parts = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: prefs.timezone }).formatToParts(d);
    const g = (t) => (parts.find((p) => p.type === t) || {}).value || '';
    return g('hour') + ':' + g('minute') + ' ' + g('dayPeriod').toLowerCase();
  }
  const refreshTimestamps = () => document.querySelectorAll('.ts[data-ts]').forEach((el) => { el.textContent = clock(el.dataset.ts); });

  /* ---------------- live clock (server-corrected) ---------------- */
  let skewMs = 0;
  async function syncTime() {
    try {
      const { data } = await api.get('/time', { params: { timezone: prefs.timezone, format: prefs.timeFormat } });
      skewMs = data.data.epochMs - Date.now();
    } catch (_e) { /* keep the device clock */ }
  }
  function tickClock() {
    const d = new Date(Date.now() + skewMs);
    const tz = prefs.timezone;
    let t;
    if (prefs.timeFormat === '24h') {
      t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: tz }).format(d);
    } else {
      const p = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: tz }).formatToParts(d);
      const g = (k) => (p.find((x) => x.type === k) || {}).value || '';
      t = g('hour') + ':' + g('minute') + ':' + g('second') + ' ' + g('dayPeriod').toLowerCase();
    }
    $('#clockTime').textContent = t;
    $('#clockDate').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(d);
    const off = (new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(d).find((x) => x.type === 'timeZoneName') || {}).value || '';
    $('#clockTz').textContent = tz + (off ? ' (' + off.replace('GMT', 'UTC') + ')' : '');
  }
  function renderPrefControls() {
    $('#fmt12').classList.toggle('on', prefs.timeFormat === '12h');
    $('#fmt24').classList.toggle('on', prefs.timeFormat === '24h');
    const sel = $('#tzSel');
    const zones = ZONES.includes(prefs.timezone) ? ZONES : [prefs.timezone].concat(ZONES);
    sel.innerHTML = zones.map((z) => '<option value="' + esc(z) + '"' + (z === prefs.timezone ? ' selected' : '') + '>' + esc(z) + '</option>').join('');
  }
  async function changePrefs(patch) {
    prefs = Object.assign({}, prefs, patch);
    savePrefs();
    renderPrefControls();
    tickClock();
    refreshTimestamps();
    if (conv) {
      try { await api.patch('/conversations/' + conv.id + '/preferences', patch); } catch (e) { showNotice(errMsg(e), true); }
    }
    syncTime();
  }

  /* ---------------- API client (axios) ---------------- */
  let token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (_e) { /* ignore */ }
  let socket = null;
  const api = axios.create({ baseURL: API_BASE + '/api', timeout: 30000 });
  api.interceptors.request.use((cfg) => {
    if (token) cfg.headers.Authorization = 'Bearer ' + token;
    if (socket && socket.id) cfg.headers['X-Socket-Id'] = socket.id;
    return cfg;
  });
  function errMsg(e) {
    if (e && e.response && e.response.data && e.response.data.error) return e.response.data.error.message;
    if (e && e.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
    if (e && !e.response) return 'Cannot reach the server. Please check your connection.';
    return 'Something went wrong. Please try again.';
  }
  const apiCode = (e) => (e && e.response && e.response.data && e.response.data.error && e.response.data.error.code) || '';

  /* ---------------- state ---------------- */
  let conv = null;
  let epoch = 0;
  let q = Promise.resolve();      // render queue (typing delays)
  let sendQ = Promise.resolve();  // network queue (one request at a time, in order)
  let busy = 0;
  const seen = new Set();         // message ids already on screen (de-dupes socket echoes)
  const chat = $('#chat');
  let typingEl = null;

  const scrollDown = () => { chat.scrollTop = chat.scrollHeight; };
  const append = (el) => { if (typingEl && typingEl.parentNode === chat) chat.insertBefore(el, typingEl); else chat.appendChild(el); scrollDown(); };
  function typing(on) {
    if (on && !typingEl) {
      typingEl = document.createElement('div');
      typingEl.className = 'typing';
      typingEl.innerHTML = '<i></i><i></i><i></i>';
      chat.appendChild(typingEl);
    }
    if (!on && typingEl) { typingEl.remove(); typingEl = null; }
    scrollDown();
  }
  function setBusy(delta) {
    busy = Math.max(0, busy + delta);
    $('#send').disabled = busy > 0 && !conv;
    $('#send').setAttribute('aria-busy', busy > 0 ? 'true' : 'false');
  }
  function showNotice(text, isError, retry) {
    const el = document.createElement('div');
    el.className = 'notice' + (isError ? ' err' : '');
    el.setAttribute('role', isError ? 'alert' : 'status');
    el.textContent = (isError ? '⚠️ ' : '') + text;
    if (retry) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = 'Try again';
      b.addEventListener('click', () => { el.remove(); retry(); });
      el.appendChild(document.createElement('br'));
      el.appendChild(b);
    } else if (isError) {
      setTimeout(() => el.remove(), 9000);
    }
    append(el);
  }

  /* ---------------- rendering ---------------- */
  const tickSvg = '<svg class="tick" viewBox="0 0 18 11"><path d="M1 6l3.2 3.2L10 2"/><path d="M7.5 7.7 8.7 9 15 2"/></svg>';
  const quoteOf = (m) => (m.head ? m.head + ' ' : '') + (m.text || '').replace(/\n+/g, ' ');

  function renderBot(msg) {
    const interactive = !!(msg.list || msg.buttons || msg.datePicker);
    if (interactive) chat.querySelectorAll('.interactive').forEach((x) => x.classList.add('old'));
    const el = document.createElement('div');
    el.className = 'msg in' + (interactive ? ' interactive' : '');
    el.dataset.id = msg.id;
    let h = '<div class="bub">';
    if (msg.head) h += '<div class="hd">' + esc(msg.head) + '</div>';
    h += '<div class="tx">' + fmt(msg.text || '') + '</div><div class="tm"><span class="ts" data-ts="' + esc(msg.createdAt) + '">' + esc(clock(msg.createdAt)) + '</span></div>';
    if (msg.list) h += '<div class="act" data-a="list"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>' + esc(msg.list.btn) + '</div>';
    if (msg.datePicker) h += '<div class="act" data-a="date"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' + esc(msg.datePicker.btn || 'Open Calendar') + '</div>';
    if (msg.buttons) msg.buttons.forEach((b, i) => { h += '<div class="act" data-a="btn" data-i="' + i + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/></svg>' + esc(b) + '</div>'; });
    h += '</div>';
    el.innerHTML = h;
    el.querySelectorAll('.act').forEach((a) => a.addEventListener('click', () => {
      if (el.classList.contains('old')) return;
      if (a.dataset.a === 'list') openSheet(msg);
      else if (a.dataset.a === 'date') openDateSheet(msg);
      else choose(msg, msg.buttons[+a.dataset.i], '');
    }));
    append(el);
    chat.querySelectorAll('.msg.out .tick:not(.read)').forEach((t) => t.classList.add('read'));
    return el;
  }

  /** o: server message, or { text, desc, quote, file (File) } for an optimistic bubble. */
  function renderUser(o) {
    const el = document.createElement('div');
    el.className = 'msg out';
    if (o.id) el.dataset.id = o.id;
    let h = '<div class="bub">';
    if (o.quote) h += '<div class="quote"><b>Brightech Group</b><span>' + esc(o.quote) + '</span></div>';
    if (o.file instanceof File) {
      const f = o.file;
      if (/^image\//.test(f.type)) h += '<img class="thumb" alt="Image sent" src="' + URL.createObjectURL(f) + '">';
      else h += '<div class="filechip"><span style="font-size:22px">' + (/^video\//.test(f.type) ? '🎞' : '📄') + '</span><div>' + esc(f.name) + '<small>' + Math.max(1, Math.round(f.size / 1024)) + ' KB</small></div></div>';
    } else if (o.file) {
      const f = o.file;
      if (f.url && /^image\//.test(f.mimeType || '')) h += '<img class="thumb" alt="Image sent" src="' + esc(API_BASE + f.url) + '">';
      else h += '<div class="filechip"><span style="font-size:22px">' + (/^video\//.test(f.mimeType || '') ? '🎞' : '📄') + '</span><div>' + esc(f.originalName) + '<small>' + Math.max(1, Math.round((f.size || 0) / 1024)) + ' KB</small></div></div>';
    } else {
      h += '<div class="tx">' + esc(o.text) + '</div>';
      if (o.desc) h += '<div class="sel-d">' + esc(o.desc) + '</div>';
    }
    h += '<div class="tm"><span class="ts" data-ts="' + esc(o.createdAt) + '">' + esc(clock(o.createdAt)) + '</span> ' + tickSvg + '</div></div>';
    el.innerHTML = h;
    const n = $('#notice');
    if (n) n.remove();
    append(el);
    return el;
  }
  function bindUser(el, m) {
    if (!el || !m) return;
    el.dataset.id = m.id;
    const ts = el.querySelector('.ts');
    if (ts) { ts.dataset.ts = m.createdAt; ts.textContent = clock(m.createdAt); }
  }

  /** Bot messages appear one by one with the typing indicator, like the original preview. */
  function queueBot(msg, e) {
    q = q.then(async () => {
      if (e !== epoch) return;
      typing(true);
      await sleep(450 + Math.min(900, (msg.text || '').length * 5));
      if (e !== epoch) return;
      typing(false);
      renderBot(msg);
    }).catch(() => {});
  }

  function renderPanel(state) {
    if (!state) return;
    $('#flowname').innerHTML = '<span class="flowtag">' + esc(state.completed ? 'Completed: ' + (state.flowName || '') : (state.flowName || 'No flow started')) + '</span>';
    $('#data').innerHTML = state.data && state.data.length
      ? state.data.map((d) => '<div class="it"><small>' + esc(d.key) + '</small><span>' + esc(d.value) + '</span></div>').join('')
      : '<p style="margin:0">Nothing captured yet.</p>';
  }

  function renderHistory(messages) {
    chat.innerHTML = '<div class="datechip">Today</div>';
    typingEl = null;
    if (!messages.length) {
      chat.insertAdjacentHTML('beforeend', '<div class="notice" id="notice">Demo chat. Type <b>Hi</b> to start.</div>');
    }
    messages.forEach((m) => {
      seen.add(m.id);
      if (m.role === 'bot') renderBot(m);
      else renderUser(m);
    });
    scrollDown();
  }

  /* ---------------- turn handling ---------------- */
  function handleTurn(data, e, userEls) {
    if (e !== epoch) return;
    const um = data.userMessages || [];
    if (userEls && userEls.length) userEls.forEach((el, i) => bindUser(el, um[i]));
    else um.forEach((m) => { seen.add(m.id); renderUser(m); });
    um.forEach((m) => seen.add(m.id));
    (data.botMessages || []).forEach((m) => seen.add(m.id));
    renderPanel(data.state);
    if (!(data.botMessages || []).length) q = q.then(() => typing(false));
    (data.botMessages || []).forEach((m) => queueBot(m, e));
  }

  async function handleFailure(err, e, els, restoreText) {
    if (e !== epoch) return;
    typing(false);
    (els || []).forEach((el) => el && el.remove());
    if (restoreText && !$('#inp').value) $('#inp').value = restoreText;
    const status = err && err.response && err.response.status;
    if (status === 401) {
      try { localStorage.removeItem(TOKEN_KEY); } catch (_e) { /* ignore */ }
      token = null;
      if (socket) { socket.disconnect(); socket = null; }
      showNotice('Your session expired. Starting a new chat…', true);
      return init();
    }
    if (apiCode(err) === 'STALE_OPTION') document.querySelectorAll('.interactive').forEach((x) => x.classList.add('old'));
    showNotice(errMsg(err), true);
  }

  function post(path, body, e, els, restoreText) {
    setBusy(1);
    sendQ = sendQ.then(async () => {
      if (e !== epoch) return;
      try {
        const res = await api.post('/conversations/' + conv.id + path, body);
        handleTurn(res.data.data, e, els);
      } catch (err) {
        await handleFailure(err, e, els, restoreText);
      } finally {
        setBusy(-1);
      }
    });
    return sendQ;
  }

  function sendTyped(txt) {
    const v = txt.trim();
    if (!v || !conv) return;
    const el = renderUser({ text: v, createdAt: new Date().toISOString() });
    typing(true);
    post('/messages', { type: 'text', text: v }, epoch, [el], v);
  }
  function choose(msg, title, desc) {
    if (!conv) return;
    const el = renderUser({ text: title, desc, quote: quoteOf(msg), createdAt: new Date().toISOString() });
    typing(true);
    post('/messages', { type: 'choice', text: title, desc: desc || undefined, messageId: msg.id }, epoch, [el], null);
  }

  /* ---------------- selection sheet (lists) ---------------- */
  let pend = null;
  function openSheet(msg) {
    pend = { msg, sel: null };
    $('#stitle').textContent = msg.list.title;
    const rows = $('#rows');
    rows.innerHTML = '';
    const add = (r) => {
      const d = document.createElement('div');
      d.className = 'row'; d.tabIndex = 0; d.setAttribute('role', 'radio');
      d.innerHTML = '<div class="rt"><b>' + esc(r.t) + '</b>' + (r.d ? '<small>' + esc(r.d) + '</small>' : '') + '</div><span class="radio"></span>';
      const pick = () => { rows.querySelectorAll('.row').forEach((x) => x.classList.remove('sel')); d.classList.add('sel'); pend.sel = r; $('#ssend').disabled = false; };
      d.addEventListener('click', pick);
      d.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
      rows.appendChild(d);
    };
    msg.list.rows.forEach(add);
    if (msg.list.nav.length) { const s = document.createElement('div'); s.className = 'sep'; rows.appendChild(s); msg.list.nav.forEach(add); }
    $('#ssend').disabled = true;
    $('#sb').classList.add('show');
  }
  const closeSheet = () => { $('#sb').classList.remove('show'); pend = null; };
  $('#sclose').addEventListener('click', closeSheet);
  $('#sb').addEventListener('click', (e) => { if (e.target.id === 'sb') closeSheet(); });
  $('#ssend').addEventListener('click', () => { if (!pend || !pend.sel) return; const { msg, sel } = pend; closeSheet(); choose(msg, sel.t, sel.d); });

  /* ---------------- calendar date sheet ---------------- */
  let pendDate = null;
  const dateInput = $('#dateInput');
  function openDateSheet(msg) {
    pendDate = { msg };
    dateInput.min = msg.datePicker.min;
    dateInput.max = msg.datePicker.max;
    dateInput.value = '';
    $('#dateErr').textContent = '';
    $('#dateHint').textContent = 'Choose a date between ' + msg.datePicker.min + ' and ' + msg.datePicker.max + '.';
    $('#dsend').disabled = true;
    $('#db').classList.add('show');
    setTimeout(() => { try { dateInput.focus(); if (dateInput.showPicker) dateInput.showPicker(); } catch (_e) { /* needs a user gesture on some browsers */ } }, 60);
  }
  const closeDateSheet = () => { $('#db').classList.remove('show'); pendDate = null; };
  dateInput.addEventListener('click', () => { try { if (dateInput.showPicker) dateInput.showPicker(); } catch (_e) { /* ignore */ } });
  dateInput.addEventListener('change', () => {
    $('#dateErr').textContent = '';
    $('#dsend').disabled = !dateInput.value;
  });
  $('#dclose').addEventListener('click', closeDateSheet);
  $('#db').addEventListener('click', (e) => { if (e.target.id === 'db') closeDateSheet(); });
  $('#dsend').addEventListener('click', async () => {
    if (!pendDate || !dateInput.value || !conv) return;
    const { msg } = pendDate;
    const date = dateInput.value;
    const e = epoch;
    $('#dsend').disabled = true;
    setBusy(1);
    sendQ = sendQ.then(async () => {
      try {
        const res = await api.post('/conversations/' + conv.id + '/date', { date, messageId: msg.id });
        closeDateSheet();
        typing(true);
        handleTurn(res.data.data, e, null);
      } catch (err) {
        const status = err.response && err.response.status;
        if (status === 422) { $('#dateErr').textContent = errMsg(err); $('#dsend').disabled = false; } // keep the sheet open
        else { closeDateSheet(); await handleFailure(err, e, [], null); }
      } finally {
        setBusy(-1);
      }
    });
  });

  /* ---------------- files ---------------- */
  async function onFiles(list) {
    if (!conv) return;
    const e = epoch;
    const els = list.map((f) => renderUser({ file: f, createdAt: new Date().toISOString() }));
    typing(true);
    const form = new FormData();
    list.forEach((f) => form.append('files', f, f.name));
    setBusy(1);
    sendQ = sendQ.then(async () => {
      if (e !== epoch) return;
      try {
        const res = await api.post('/conversations/' + conv.id + '/files', form, { timeout: 120000 });
        handleTurn(res.data.data, e, els);
      } catch (err) {
        await handleFailure(err, e, els, null);
      } finally {
        setBusy(-1);
      }
    });
  }

  /* ---------------- input wiring ---------------- */
  $('#send').addEventListener('click', () => { sendTyped($('#inp').value); $('#inp').value = ''; $('#inp').focus(); });
  $('#inp').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#send').click(); } });
  $('#clip').addEventListener('click', () => $('#attach').classList.toggle('show'));
  const ACC = { image: 'image/*', doc: '.pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.txt', video: 'video/*' };
  document.querySelectorAll('#attach button').forEach((b) => b.addEventListener('click', () => {
    $('#file').accept = ACC[b.dataset.t]; $('#attach').classList.remove('show'); $('#file').click();
  }));
  $('#file').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) onFiles(fs); });

  ['Hi', 'Product', 'Repair', 'PLC', 'VFD', 'Career', 'Contact', 'Menu', 'Help'].forEach((k) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = k;
    b.addEventListener('click', () => sendTyped(k));
    $('#chips').appendChild(b);
  });

  $('#idleBtn').addEventListener('click', () => {
    if (!conv) return;
    typing(true);
    post('/idle', undefined, epoch, null, null);
  });

  async function restart() {
    if (!conv) return;
    const old = conv;
    epoch += 1; q = Promise.resolve(); sendQ = Promise.resolve(); typing(false); closeSheet(); closeDateSheet();
    try {
      const res = await api.post('/conversations/' + old.id + '/restart');
      applyConversation(res.data.data);
      setTimeout(() => sendTyped('Hi'), 600);
    } catch (err) {
      showNotice(errMsg(err), true);
    }
  }
  $('#restart').addEventListener('click', restart);

  $('#fmt12').addEventListener('click', () => changePrefs({ timeFormat: '12h' }));
  $('#fmt24').addEventListener('click', () => changePrefs({ timeFormat: '24h' }));
  $('#tzSel').addEventListener('change', (e) => changePrefs({ timezone: e.target.value }));

  /* ---------------- boot / resume ---------------- */
  function connectSocket() {
    if (socket || typeof io !== 'function' || !token) return;
    try {
      socket = io(API_BASE || undefined, { auth: { token }, transports: ['websocket', 'polling'] });
      socket.on('conversation:update', (p) => {
        if (!conv || p.conversationId !== conv.id) return;
        const fresh = (p.messages || []).filter((m) => !seen.has(m.id));
        if (!fresh.length) return;
        fresh.forEach((m) => { seen.add(m.id); if (m.role === 'bot') queueBot(m, epoch); else renderUser(m); });
        renderPanel(p.state);
      });
      socket.on('connect_error', () => { /* REST keeps working without the socket */ });
    } catch (_e) { /* ignore */ }
  }

  function applyConversation(data) {
    conv = data.conversation;
    if (data.token) {
      token = data.token;
      try { localStorage.setItem(TOKEN_KEY, token); } catch (_e) { /* ignore */ }
    }
    if (conv.preferences) {
      prefs = { timezone: conv.preferences.timezone, timeFormat: conv.preferences.timeFormat };
      savePrefs();
      renderPrefControls();
    }
    seen.clear();
    renderHistory(data.messages || []);
    renderPanel(data.state);
    $('#send').disabled = false;
    connectSocket();
    syncTime();
  }

  async function init() {
    const e = epoch;
    renderPrefControls();
    tickClock();
    $('#send').disabled = true;
    chat.innerHTML = '<div class="datechip">Today</div><div class="notice" id="notice">Connecting…</div>';
    try {
      const res = await api.post('/conversations', { timezone: prefs.timezone, timeFormat: prefs.timeFormat });
      if (e !== epoch) return;
      const data = res.data.data;
      applyConversation(data);
      if (!data.messages.length) setTimeout(() => { if (e === epoch) sendTyped('Hi'); }, 700);
    } catch (err) {
      chat.innerHTML = '<div class="datechip">Today</div>';
      showNotice(errMsg(err), true, init);
    }
  }

  setInterval(tickClock, 1000);
  setInterval(syncTime, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncTime(); tickClock(); } });
  renderPrefControls();
  tickClock();
  init();
})();
