'use strict';

/* The page opened from the WhatsApp "Pick date and time" button (HTML + its script, served by routes/pickerRoutes.js).
 *   - an inline month calendar (round < > buttons, tap a day)
 *   - "Selected date" and a time row: Hour / Minute / AM-PM dropdowns that list ONLY the free times, plus "Earliest"
 *   - "Confirm date and time"
 * The script is a separate file (/pick/app.js) because the site's security policy only allows scripts from itself.
 * NOTE: the script text below must not contain backticks, "${" or backslashes (it lives inside a template string). */

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Pick date and time - Brightech Group</title>
<style>
:root{--navy:#0d2b45;--wa:#008069;--tint:#e6f0eb;--ink:#17211c;--mute:#5f6b65;--line:#d3dad6;--bg:#f1f3f2;--err:#c0392b}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 "Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--navy);color:#fff;padding:14px 20px;font-weight:700;font-size:17px}
main{max-width:460px;margin:0 auto;padding:16px 12px 40px}
.card{background:#fff;border:1px solid #e3e7e5;border-radius:18px;padding:20px 16px}
h1{margin:0 0 2px;font-size:21px;line-height:1.25;color:var(--ink)}
.now{margin:0 0 14px;color:var(--mute);font-size:14.5px}
.ch{display:flex;align-items:center;justify-content:space-between;margin:6px 0 8px}
.mt{font-weight:700;font-size:17px}
.nv{width:46px;height:46px;border:0;border-radius:50%;background:var(--tint);color:var(--ink);font:inherit;font-size:28px;line-height:1;padding:0 0 4px;cursor:pointer}
.nv:disabled{background:#f1f3f2;color:#c3c9c5;cursor:default}
.dow{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;text-align:center;margin-bottom:4px}
.dow span{font-size:13px;color:var(--mute)}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.e{display:block}
.day{height:44px;border:0;border-radius:12px;background:var(--tint);color:var(--ink);font:inherit;font-size:16px;font-weight:500;cursor:pointer;padding:0}
.day:hover:not(:disabled){background:#d4e6dd}
.day:disabled{background:transparent;color:#b9c0bc;font-weight:400;cursor:default}
.day.today{box-shadow:inset 0 0 0 2px var(--ink)}
.day.sel{background:var(--wa);color:#fff;font-weight:700}
.sep{height:1px;background:#e6eae8;margin:16px 0 12px}
.lab{font-size:14px;color:var(--mute)}
.val{font-size:19px;font-weight:700;margin-top:2px}
.trow{display:flex;gap:8px;margin-top:8px}
select{flex:1;min-width:0;height:48px;border:1.5px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);font:inherit;font-size:17px;padding:0 8px}
select:disabled{background:#f4f6f5;color:#a2aaa6}
select:focus-visible,button:focus-visible{outline:3px solid #9ed8cc;outline-offset:2px}
.early{flex:0 0 auto;height:48px;padding:0 14px;border:1.5px solid var(--line);border-radius:12px;background:#f4f6f5;color:var(--ink);font:inherit;font-size:15px;cursor:pointer}
.early:disabled{color:#a2aaa6;cursor:default}
.note{margin:8px 0 0;color:var(--mute);font-size:13.5px}
.sum{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:var(--bg);font-size:15px}
.err{min-height:22px;margin-top:10px;color:var(--err);font-size:14px}
#save{width:100%;margin-top:6px;padding:15px;border:0;border-radius:14px;background:var(--wa);color:#fff;font:inherit;font-weight:700;font-size:17px;cursor:pointer}
#save:disabled{background:#9dbdb2;cursor:default}
.ok{text-align:center;padding:16px 8px}
.ok .tick{width:64px;height:64px;border-radius:50%;background:var(--tint);color:var(--wa);display:grid;place-items:center;margin:0 auto 12px;font-size:34px;font-weight:700}
.ok h2{margin:0 0 6px;font-size:21px}
.ok p{margin:4px 0;color:var(--mute)}
[hidden]{display:none!important}
</style>
</head>
<body>
<header>Brightech Group</header>
<main>
  <div class="card" id="form">
    <h1>Pick date and time</h1>
    <p class="now" id="now">Loading...</p>

    <div class="ch">
      <button type="button" class="nv" id="prevM" aria-label="Previous month">&#8249;</button>
      <div class="mt" id="mTitle" aria-live="polite"></div>
      <button type="button" class="nv" id="nextM" aria-label="Next month">&#8250;</button>
    </div>
    <div class="dow" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>
    <div class="grid" id="cal" role="group" aria-label="Choose a date"></div>

    <div class="sep"></div>
    <div class="lab">Selected date</div>
    <div class="val" id="selDate">Tap a date</div>

    <div class="sep"></div>
    <div class="lab" id="timeLab">Meeting time</div>
    <div class="trow">
      <select id="selH" aria-label="Hour" disabled><option value="">Hr</option></select>
      <select id="selM" aria-label="Minute" disabled><option value="">Min</option></select>
      <select id="selP" aria-label="AM or PM" disabled><option value="">AM/PM</option></select>
      <button type="button" class="early" id="early" disabled>Earliest</button>
    </div>
    <p class="note" id="slotMsg">Choose a date first. Only free times are listed.</p>

    <div class="sum" id="sum" hidden></div>
    <div class="err" id="err" role="alert"></div>
    <button type="button" id="save" disabled>Confirm date and time</button>
  </div>

  <div class="card ok" id="done" hidden>
    <div class="tick" aria-hidden="true">&#10003;</div>
    <h2 id="doneTitle">Date and time saved</h2>
    <p id="doneText"></p>
    <p>You can close this page and go back to WhatsApp. Your enquiry continues there.</p>
  </div>
</main>
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
  var view = { y: 0, m: 0 };
  var unavailable = {};
  var slots = [];
  var pick = { h: '', m: '', p: '' };
  var slotsToken = 0;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function key(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
  function parseKey(k) { var p = k.split('-'); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; }
  function dow(k) { var p = parseKey(k); return new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay(); }
  function longDate(k) { var p = parseKey(k); return DAYS[dow(k)].slice(0, 3) + ' ' + p.d + ' ' + MONTHS[p.m].slice(0, 3) + ' ' + p.y; }

  function clock() {
    var d = new Date(Date.now() + skew);
    var p = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz, timeZoneName: 'short' }).formatToParts(d);
    var g = function (t) { var x = p.filter(function (i) { return i.type === t; })[0]; return x ? x.value : ''; };
    tzShort = g('timeZoneName') || tzShort;
    $('now').textContent = 'Now: ' + g('weekday') + ', ' + g('day') + ' ' + g('month') + ' ' + g('year') + ', ' + g('hour') + ':' + g('minute') + ' ' + g('dayPeriod').toUpperCase() + ' (' + tzShort + ')';
  }

  function show(msg) { $('err').textContent = msg || ''; }
  function stop(title, text) {
    $('form').hidden = true; $('done').hidden = false;
    $('doneTitle').textContent = title; $('doneText').textContent = text || '';
  }
  function msgOf(res, json) { return (json && json.error && json.error.message) || (res.status === 429 ? 'Too many tries. Please wait a moment.' : 'Something went wrong. Please try again.'); }
  function codeOf(json) { return json && json.error && json.error.code; }

  /* ---------- calendar: this month, round < > buttons, tap a day, swipe left / right ---------- */
  function monthList() {
    var a = parseKey(info.minDate), z = parseKey(info.maxDate), out = [], y = a.y, m = a.m;
    while (y < z.y || (y === z.y && m <= z.m)) { out.push({ y: y, m: m }); m += 1; if (m > 11) { m = 0; y += 1; } }
    return out;
  }
  function renderCal() {
    var y = view.y, m = view.m, html = '', i, d, k, off;
    var first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    var count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    $('mTitle').textContent = MONTHS[m] + ' ' + y;
    for (i = 0; i < first; i++) html += '<span class="e"></span>';
    for (d = 1; d <= count; d++) {
      k = key(y, m, d);
      off = k < info.minDate || k > info.maxDate || unavailable[k] === true;
      html += '<button type="button" class="day' + (k === sel.date ? ' sel' : '') + (k === info.minDate ? ' today' : '') + '"' + (off ? ' disabled' : '') +
        ' data-k="' + k + '" aria-label="' + DAYS[dow(k)] + ' ' + d + ' ' + MONTHS[m] + ' ' + y + (off ? ', not available' : '') + '">' + d + '</button>';
    }
    $('cal').innerHTML = html;
    var list = monthList();
    $('prevM').disabled = list.length === 0 || (list[0].y === view.y && list[0].m === view.m);
    $('nextM').disabled = list.length === 0 || (list[list.length - 1].y === view.y && list[list.length - 1].m === view.m);
  }
  function shiftMonth(delta) {
    var list = monthList(), idx = -1, i;
    for (i = 0; i < list.length; i++) if (list[i].y === view.y && list[i].m === view.m) idx = i;
    var n = idx + delta;
    if (idx < 0 || n < 0 || n >= list.length) return;
    view.y = list[n].y; view.m = list[n].m; renderCal();
  }

  /* ---------- time: Hour / Minute / AM-PM dropdowns that list ONLY free times ---------- */
  function free() {
    return slots.filter(function (s) { return s.available; }).map(function (s) {
      var h = +s.time.slice(0, 2);
      return { time: s.time, label: s.label, h: String((h % 12) || 12), m: s.time.slice(3), p: h < 12 ? 'AM' : 'PM' };
    });
  }
  function uniq(arr) { var out = [], i; for (i = 0; i < arr.length; i++) if (out.indexOf(arr[i]) < 0) out.push(arr[i]); return out; }
  function fits(x, h, m, p) { return (!h || x.h === h) && (!m || x.m === m) && (!p || x.p === p); }
  function fill(id, values, current, placeholder) {
    var html = '<option value="">' + placeholder + '</option>', i;
    for (i = 0; i < values.length; i++) html += '<option value="' + values[i] + '">' + values[i] + '</option>';
    $(id).innerHTML = html;
    $(id).value = values.indexOf(current) >= 0 ? current : '';
    return $(id).value;
  }
  function refreshTime() {
    var a = free(), on = a.length > 0;
    // hours: every hour that still has a free time; minutes / AM-PM: only what fits the hour (and minute) already chosen
    pick.h = fill('selH', uniq(a.map(function (x) { return x.h; })), pick.h, 'Hr');
    pick.m = fill('selM', uniq(a.filter(function (x) { return fits(x, pick.h, '', ''); }).map(function (x) { return x.m; })).sort(), pick.m, 'Min');
    pick.p = fill('selP', uniq(a.filter(function (x) { return fits(x, pick.h, pick.m, ''); }).map(function (x) { return x.p; })), pick.p, 'AM/PM');
    ['selH', 'selM', 'selP', 'early'].forEach(function (id) { $(id).disabled = !on; });
    var hit = (pick.h && pick.m && pick.p) ? a.filter(function (x) { return fits(x, pick.h, pick.m, pick.p); })[0] : null;
    sel.time = hit ? hit.time : null; sel.label = hit ? hit.label : null;
    summary();
  }
  function onSelect(which) {
    var a = free(), v = { h: $('selH').value, m: $('selM').value, p: $('selP').value }, f;
    pick[which] = v[which];
    // the dropdown the customer just changed wins: any other choice that no longer fits it is cleared
    ['h', 'm', 'p'].forEach(function (k) {
      if (k === which || !pick[k]) return;
      var t = { h: '', m: '', p: '' }; t[which] = pick[which]; t[k] = pick[k];
      if (!a.some(function (x) { return fits(x, t.h, t.m, t.p); })) pick[k] = '';
    });
    if (pick.h && pick.m && pick.p && !a.some(function (x) { return fits(x, pick.h, pick.m, pick.p); })) {
      ['h', 'm', 'p'].forEach(function (k) { if (k !== which) pick[k] = ''; });
    }
    // when only one choice is left for an empty dropdown, fill it in (hour 10 -> 00 AM)
    ['m', 'p', 'h'].forEach(function (k) {
      if (pick[k]) return;
      var c = uniq(a.filter(function (x) { return fits(x, pick.h, pick.m, pick.p); }).map(function (x) { return x[k]; }));
      if (c.length === 1) pick[k] = c[0];
    });
    show(''); refreshTime();
  }
  function summary() {
    $('selDate').textContent = sel.date ? longDate(sel.date) : 'Tap a date';
    if (sel.date && sel.time) { $('sum').hidden = false; $('sum').textContent = 'You chose: ' + longDate(sel.date) + ', ' + sel.label + ' (' + tzShort + ')'; }
    else $('sum').hidden = true;
    $('save').disabled = !(sel.date && sel.time);
  }

  function loadSlots(k) {
    var mine = ++slotsToken;
    slots = []; pick = { h: '', m: '', p: '' }; sel.time = null; sel.label = null; refreshTime();
    $('slotMsg').textContent = 'Loading times...';
    fetch('/pick/' + encodeURIComponent(token) + '/slots?date=' + encodeURIComponent(k), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (o) {
        if (mine !== slotsToken) return;
        if (!o.r.ok) { if (o.r.status === 409 || o.r.status === 403) { stop('This link is no longer active', msgOf(o.r, o.j)); return; } $('slotMsg').textContent = msgOf(o.r, o.j); return; }
        slots = o.j.data.slots || [];
        refreshTime();
        $('slotMsg').textContent = o.j.data.message || ('Only free times are listed. Each meeting is about ' + (info.meetingMinutes || 30) + ' minutes.');
      })
      .catch(function () { if (mine === slotsToken) $('slotMsg').textContent = 'Could not load the times. Please check your connection.'; });
  }

  function chooseDate(k) {
    sel.date = k; show(''); renderCal(); loadSlots(k);
  }

  $('cal').addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('button[data-k]') : null;
    if (b && !b.disabled) chooseDate(b.getAttribute('data-k'));
  });
  $('prevM').addEventListener('click', function () { shiftMonth(-1); });
  $('nextM').addEventListener('click', function () { shiftMonth(1); });
  var touchX = null;
  $('cal').addEventListener('touchstart', function (ev) { touchX = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0].clientX : null; }, { passive: true });
  $('cal').addEventListener('touchend', function (ev) {
    if (touchX === null || !ev.changedTouches || !ev.changedTouches[0]) return;
    var dx = ev.changedTouches[0].clientX - touchX; touchX = null;
    if (dx < -60) shiftMonth(1); else if (dx > 60) shiftMonth(-1);
  }, { passive: true });
  $('selH').addEventListener('change', function () { onSelect('h'); });
  $('selM').addEventListener('change', function () { onSelect('m'); });
  $('selP').addEventListener('change', function () { onSelect('p'); });
  $('early').addEventListener('click', function () {
    var a = free();
    if (!a.length) return;
    pick = { h: a[0].h, m: a[0].m, p: a[0].p }; show(''); refreshTime();
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
      $('timeLab').textContent = 'Meeting time (' + (tz === 'Asia/Kolkata' ? 'India time' : tz) + ')';
      var t = parseKey(info.minDate); view.y = t.y; view.m = t.m;
      clock(); setInterval(clock, 30000);
      renderCal(); summary();
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
          show(msgOf(o.r, o.j)); loadSlots(sel.date); return;
        }
        if (o.r.status === 409 || o.r.status === 403) { stop('This link is no longer active', msgOf(o.r, o.j)); return; }
        show(msgOf(o.r, o.j)); $('save').disabled = false;
      })
      .catch(function () { show('Could not save. Please check your connection and try again.'); $('save').disabled = false; });
  });
})();
`;

module.exports = { HTML, JS };
