'use strict';

/* The page opened from the WhatsApp "Pick date and time" button (HTML + its script, served by routes/pickerRoutes.js).
 *   1. "Pick date" button -> a calendar sheet with this month AND the next months (tap a day)
 *   2. the free time slots of that day (booked ones are greyed out)
 *   3. Save
 * The script is a separate file (/pick/app.js) because the site's security policy only allows scripts from itself.
 * NOTE: the script text below must not contain backticks, "${" or backslashes (it lives inside a template string). */

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Pick your date and time - Brightech Group</title>
<style>
:root{--navy:#0d2b45;--wa:#008069;--wa2:#dff5ec;--ink:#111b21;--mute:#5b6b75;--line:#d1d7db;--bg:#eef1f3;--err:#c0392b}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 "Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--navy);color:#fff;padding:16px 20px;font-weight:700;font-size:18px}
main{max-width:460px;margin:0 auto;padding:18px 14px 40px}
.card{background:#fff;border-radius:16px;padding:20px 16px;box-shadow:0 1px 3px rgba(11,20,26,.12)}
h1{margin:0 0 4px;font-size:21px;line-height:1.25;color:var(--navy)}
.now{margin:0 0 16px;color:var(--mute);font-size:15px}
.now b{color:var(--ink);font-variant-numeric:tabular-nums}
.lab{margin:16px 0 8px;font-weight:700;font-size:14px;color:var(--navy)}
.pick{width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:14px;border:1.5px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);font:inherit;font-size:17px;cursor:pointer}
.pick.set{border-color:var(--wa);background:var(--wa2);font-weight:600}
.pick .ic{font-size:22px}
.pick .tx{flex:1}
.pick .chev{color:var(--mute);font-size:24px;line-height:1}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{border:1.5px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);font:inherit;font-size:15px;padding:10px 15px;cursor:pointer;min-width:92px}
.chip:hover:not(:disabled){border-color:var(--wa)}
.chip:disabled{cursor:default;color:#9aa6ad;background:#f3f5f6}
.chip.taken{text-decoration:line-through}
.chip.sel{background:var(--wa);border-color:var(--wa);color:#fff;font-weight:700}
.note{margin:0 0 8px;color:var(--mute);font-size:14px}
.hint{margin:10px 0 0;font-size:13px;color:var(--mute)}
.sum{margin:16px 0 0;padding:10px 12px;border-radius:10px;background:var(--bg);font-size:15px;min-height:42px}
.sum b{color:var(--navy)}
.err{min-height:22px;margin-top:10px;color:var(--err);font-size:14px}
#save{width:100%;margin-top:12px;padding:15px;border:0;border-radius:12px;background:var(--wa);color:#fff;font:inherit;font-weight:700;font-size:17px;cursor:pointer}
#save:disabled{opacity:.5;cursor:default}
button:focus-visible{outline:3px solid #9ed8cc;outline-offset:2px}
.ok{text-align:center;padding:14px 8px}
.ok .tick{width:64px;height:64px;border-radius:50%;background:var(--wa2);color:var(--wa);display:grid;place-items:center;margin:0 auto 12px;font-size:34px;font-weight:700}
.ok h2{margin:0 0 6px;font-size:21px;color:var(--navy)}
.ok p{margin:4px 0;color:var(--mute)}
/* calendar sheet */
.sheet{position:fixed;inset:0;background:rgba(11,20,26,.5);display:flex;align-items:flex-end;justify-content:center;z-index:10}
.panel{background:#fff;width:100%;max-width:520px;height:88vh;border-radius:18px 18px 0 0;display:flex;flex-direction:column}
.ph{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #eceff1}
.ph h2{margin:0;font-size:18px;color:var(--navy)}
.ph button{border:0;background:none;font-size:28px;line-height:1;color:var(--mute);cursor:pointer;padding:0 6px}
.dow{display:grid;grid-template-columns:repeat(7,1fr);padding:8px 12px 4px;text-align:center;border-bottom:1px solid #eceff1}
.dow span{font-size:12px;font-weight:600;color:var(--mute)}
.months{overflow-y:auto;padding:4px 12px 24px;flex:1}
.mt{margin:18px 0 8px;font-weight:700;font-size:17px;color:var(--navy)}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center}
.e{display:block}
.day{aspect-ratio:1/1;min-height:40px;border:0;border-radius:50%;background:transparent;color:var(--ink);font:inherit;font-size:16px;cursor:pointer;padding:0}
.day:hover:not(:disabled){background:var(--wa2)}
.day:disabled{color:#c3cbd0;cursor:default}
.day.today{box-shadow:inset 0 0 0 2px var(--wa)}
.day.sel{background:var(--wa);color:#fff;font-weight:700}
.legend{margin:10px 0 0;font-size:13px;color:var(--mute)}
[hidden]{display:none!important}
</style>
</head>
<body>
<header>Brightech Group</header>
<main>
  <div class="card" id="form">
    <h1>Pick your date and time</h1>
    <p class="now" id="now">Loading...</p>

    <div class="lab">1. Date</div>
    <button type="button" class="pick" id="dateBtn" aria-haspopup="dialog">
      <span class="ic" aria-hidden="true">&#128197;</span><span class="tx" id="dateTxt">Pick date</span><span class="chev" aria-hidden="true">&#8250;</span>
    </button>

    <div id="timeStep" hidden>
      <div class="lab">2. Time</div>
      <p class="note" id="slotMsg"></p>
      <div class="chips" id="chips" role="group" aria-label="Choose a time"></div>
      <p class="hint" id="meet"></p>
    </div>

    <div class="sum" id="sum" aria-live="polite">Tap Pick date to start.</div>
    <div class="err" id="err" role="alert"></div>
    <button type="button" id="save" disabled>Save date and time</button>
  </div>

  <div class="card ok" id="done" hidden>
    <div class="tick" aria-hidden="true">&#10003;</div>
    <h2 id="doneTitle">Date and time saved</h2>
    <p id="doneText"></p>
    <p>You can close this page and go back to WhatsApp. Your enquiry continues there.</p>
  </div>
</main>

<div class="sheet" id="sheet" hidden>
  <div class="panel" role="dialog" aria-modal="true" aria-labelledby="sheetT">
    <div class="ph"><h2 id="sheetT">Select date</h2><button type="button" id="close" aria-label="Close calendar">&times;</button></div>
    <div class="dow" aria-hidden="true"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
    <div class="months" id="months"></div>
  </div>
</div>
<script src="/pick/app.js"></script>
</body>
</html>`;

const JS = `(function () {
  'use strict';
  var token = location.pathname.split('/')[2] || '';
  var $ = function (id) { return document.getElementById(id); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var info = null, skew = 0, tz = 'Asia/Kolkata', tzShort = 'IST';
  var sel = { date: null, time: null, label: null };
  var unavailable = {};
  var slotsToken = 0;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function parseKey(k) { var p = k.split('-'); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
  function dow(k) { var p = parseKey(k); return new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay(); }
  function longDate(k) { var p = parseKey(k); return DAYS[dow(k)].slice(0, 3) + ' ' + p.d + ' ' + MONTHS[p.m].slice(0, 3) + ' ' + p.y; }

  function clock() {
    var d = new Date(Date.now() + skew);
    var p = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz, timeZoneName: 'short' }).formatToParts(d);
    var g = function (t) { var x = p.filter(function (i) { return i.type === t; })[0]; return x ? x.value : ''; };
    tzShort = g('timeZoneName') || tzShort;
    $('now').innerHTML = 'Now: <b>' + g('weekday') + ' ' + g('day') + ' ' + g('month') + ' ' + g('year') + ', ' + g('hour') + ':' + g('minute') + ' ' + g('dayPeriod').toUpperCase() + ' (' + tzShort + ')</b>';
  }

  function show(msg) { $('err').textContent = msg || ''; }
  function stop(title, text) {
    $('sheet').hidden = true; $('form').hidden = true; $('done').hidden = false;
    $('doneTitle').textContent = title; $('doneText').textContent = text || '';
  }
  function msgOf(res, json) { return (json && json.error && json.error.message) || (res.status === 429 ? 'Too many tries. Please wait a moment.' : 'Something went wrong. Please try again.'); }
  function codeOf(json) { return json && json.error && json.error.code; }

  /* ---------- calendar sheet: this month and every month up to the booking limit ---------- */
  function renderMonths() {
    var a = parseKey(info.minDate), z = parseKey(info.maxDate);
    var y = a.y, m = a.m, html = '';
    while (y < z.y || (y === z.y && m <= z.m)) {
      var first = new Date(Date.UTC(y, m, 1)).getUTCDay();
      var count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      html += '<div class="mt">' + MONTHS[m] + ' ' + y + '</div><div class="grid">';
      for (var i = 0; i < first; i++) html += '<span class="e"></span>';
      for (var d = 1; d <= count; d++) {
        var k = key(y, m, d);
        var off = k < info.minDate || k > info.maxDate || unavailable[k] === true;
        html += '<button type="button" class="day' + (k === sel.date ? ' sel' : '') + (k === info.minDate ? ' today' : '') + '"' + (off ? ' disabled' : '') +
          ' data-k="' + k + '" aria-label="' + DAYS[dow(k)] + ' ' + d + ' ' + MONTHS[m] + ' ' + y + (off ? ', not available' : '') + '">' + d + '</button>';
      }
      html += '</div>';
      m += 1; if (m > 11) { m = 0; y += 1; }
    }
    html += '<p class="legend">Greyed days are closed or fully booked.</p>';
    $('months').innerHTML = html;
  }
  function openSheet() {
    renderMonths();
    $('sheet').hidden = false;
    var s = $('months').querySelector('.day.sel') || $('months').querySelector('.day:not(:disabled)');
    if (s && s.scrollIntoView) s.scrollIntoView({ block: 'center' });
    $('close').focus();
  }
  function closeSheet() { $('sheet').hidden = true; $('dateBtn').focus(); }

  /* ---------- times of the chosen day ---------- */
  function renderSlots(data) {
    var html = '', i, s;
    for (i = 0; i < data.slots.length; i++) {
      s = data.slots[i];
      html += '<button type="button" class="chip' + (s.available ? '' : ' taken') + (sel.time === s.time ? ' sel' : '') + '" data-t="' + s.time + '" data-l="' + s.label + '"' + (s.available ? '' : ' disabled') +
        ' aria-pressed="' + (sel.time === s.time ? 'true' : 'false') + '">' + s.label + '</button>';
    }
    $('chips').innerHTML = html;
    $('slotMsg').textContent = data.message || 'Tap a time. Booked times are crossed out.';
    $('meet').textContent = info.meetingMinutes ? 'Each meeting is about ' + info.meetingMinutes + ' minutes. Times are in ' + tz + '.' : '';
  }
  function loadSlots(k) {
    var mine = ++slotsToken;
    $('timeStep').hidden = false;
    $('slotMsg').textContent = 'Loading times...'; $('chips').innerHTML = '';
    fetch('/pick/' + encodeURIComponent(token) + '/slots?date=' + encodeURIComponent(k), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (o) {
        if (mine !== slotsToken) return;
        if (!o.r.ok) { if (o.r.status === 409 || o.r.status === 403) { stop('This link is no longer active', msgOf(o.r, o.j)); return; } $('slotMsg').textContent = msgOf(o.r, o.j); return; }
        renderSlots(o.j.data);
      })
      .catch(function () { if (mine === slotsToken) $('slotMsg').textContent = 'Could not load the times. Please check your connection.'; });
  }

  function summary() {
    if (sel.date && sel.time) $('sum').innerHTML = 'You chose: <b>' + longDate(sel.date) + ', ' + sel.label + ' (' + tzShort + ')</b>';
    else $('sum').textContent = sel.date ? 'Now tap a time.' : 'Tap Pick date to start.';
    $('save').disabled = !(sel.date && sel.time);
  }

  function chooseDate(k) {
    sel.date = k; sel.time = null; sel.label = null; show('');
    $('dateTxt').textContent = longDate(k); $('dateBtn').classList.add('set');
    closeSheet(); summary(); loadSlots(k);
  }

  $('dateBtn').addEventListener('click', function () { if (info) openSheet(); });
  $('close').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', function (ev) { if (ev.target === $('sheet')) closeSheet(); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !$('sheet').hidden) closeSheet(); });
  $('months').addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('button[data-k]') : null;
    if (b && !b.disabled) chooseDate(b.getAttribute('data-k'));
  });
  $('chips').addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('button[data-t]') : null;
    if (!b || b.disabled) return;
    sel.time = b.getAttribute('data-t'); sel.label = b.getAttribute('data-l'); show('');
    var all = $('chips').querySelectorAll('.chip'), i;
    for (i = 0; i < all.length; i++) { var on = all[i] === b; all[i].classList.toggle('sel', on); all[i].setAttribute('aria-pressed', on ? 'true' : 'false'); }
    summary();
  });

  /* ---------- start ---------- */
  fetch('/pick/' + encodeURIComponent(token) + '/info', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
    .then(function (o) {
      if (!o.r.ok) { stop('This link is not valid', msgOf(o.r, o.j)); return; }
      info = o.j.data;
      if (!info.active) {
        stop(info.reason === 'already_saved' ? 'Already saved' : 'This link has expired', info.reason === 'already_saved' ? 'Your date and time were already saved.' : 'Please use the newest message in WhatsApp.');
        return;
      }
      tz = info.timezone; skew = info.epochMs - Date.now();
      (info.unavailable || []).forEach(function (k) { unavailable[k] = true; });
      clock(); setInterval(clock, 30000);
    })
    .catch(function () { stop('Could not load', 'Please check your internet connection and open the link again.'); });

  $('save').addEventListener('click', function () {
    if (!sel.date || !sel.time) { show('Please choose a date and a time.'); return; }
    show(''); $('save').disabled = true;
    fetch('/pick/' + encodeURIComponent(token) + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ date: sel.date, time: sel.time }) })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (o) {
        if (o.r.ok) { stop('Date and time saved', longDate(sel.date) + ', ' + sel.label + ' (' + tzShort + ')'); return; }
        if (codeOf(o.j) === 'SLOT_TAKEN' || o.r.status === 422) {
          // someone else was first (or the time is not allowed): show the fresh list so the customer can pick again
          show(msgOf(o.r, o.j)); sel.time = null; sel.label = null; summary(); loadSlots(sel.date); return;
        }
        if (o.r.status === 409 || o.r.status === 403) { stop('This link is no longer active', msgOf(o.r, o.j)); return; }
        show(msgOf(o.r, o.j)); $('save').disabled = false;
      })
      .catch(function () { show('Could not save. Please check your connection and try again.'); $('save').disabled = false; });
  });
})();
`;

module.exports = { HTML, JS };
