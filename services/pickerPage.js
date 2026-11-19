'use strict';

/* The page opened from the WhatsApp "Pick date and time" button (HTML + its script, served by routes/pickerRoutes.js).
 *   - an inline month calendar (round < > buttons, tap a day)
 *   - "Selected date" and a time row: Hour / Minute / AM-PM dropdowns that list ONLY the free times, plus "Earliest"
 *   - "Confirm date and time"
 * The script is a separate file (/pick/app.js) because the site's security policy only allows scripts from itself.
 * NOTE: the script text below must not contain backticks, "${" or backslashes (it lives inside a template string). */

// Brightech logo (96x96 PNG) embedded in the page, so it needs no extra file or route.
const LOGO = 'data:image/png;base64,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';

const env = require('../config/env');
// "Back to WhatsApp" opens the chat with the bot's own number
const WA = env.MSG91_INTEGRATED_NUMBER ? 'https://wa.me/' + env.MSG91_INTEGRATED_NUMBER : '';

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
header{display:flex;align-items:center;gap:10px;background:#fff;border-bottom:1px solid #e3e7e5;color:var(--navy);padding:8px 16px;font-weight:700;font-size:18px}
.logo{width:46px;height:46px;display:block;flex:none}
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
.ok .tick.warn{background:#fdecea;color:var(--err)}
.ok p{margin:4px 0;color:var(--mute)}
.back{display:block;margin-top:18px;padding:15px;border-radius:14px;background:var(--wa);color:#fff;font-weight:700;font-size:17px;text-decoration:none}
.redir{margin:14px 0 0;color:var(--wa);font-weight:600}
.calnote{margin:10px 0 0;color:var(--mute);font-size:13.5px}
[hidden]{display:none!important}
</style>
</head>
<body>
<header><img class="logo" src="${LOGO}" width="46" height="46" alt=""><span>Brightech Group</span></header>
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
    <p class="calnote" id="calNote"></p>

    <div class="sep"></div>
    <div class="lab">Selected date</div>
    <div class="val" id="selDate">Tap a date</div>

    <div class="sep"></div>
    <div class="lab" id="timeLab">Time</div>
    <div class="trow">
      <select id="selH" aria-label="Hour" disabled><option value="">Hr</option></select>
      <select id="selM" aria-label="Minute" disabled><option value="">Min</option></select>
      <select id="selP" aria-label="AM or PM" disabled><option value="">AM/PM</option></select>
      <button type="button" class="early" id="early" disabled>Earliest</button>
    </div>
    <p class="note" id="slotMsg">Choose a date first.</p>

    <div class="sum" id="sum" hidden></div>
    <div class="err" id="err" role="alert"></div>
    <button type="button" id="save" disabled>Confirm date and time</button>
  </div>

  <div class="card ok" id="done" hidden>
    <div class="tick" id="tick" aria-hidden="true">&#10003;</div>
    <h2 id="doneTitle">Date and time saved</h2>
    <p id="doneText"></p>
    <p>You can close this page and go back to WhatsApp. Your enquiry continues there.</p>
    ${WA ? '<p class="redir" id="redir" hidden>Going back to WhatsApp in <b id="cnt">3</b>...</p><a class="back" href="' + WA + '">Back to WhatsApp</a>' : ''}
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
  function fullDate(k) { var p = parseKey(k); return DAYS[dow(k)] + ', ' + p.d + ' ' + MONTHS[p.m] + ' ' + p.y; }
  function longDate(k) { var p = parseKey(k); return DAYS[dow(k)].slice(0, 3) + ' ' + p.d + ' ' + MONTHS[p.m].slice(0, 3) + ' ' + p.y; }

  function clock() {
    var d = new Date(Date.now() + skew);
    var p = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz, timeZoneName: 'short' }).formatToParts(d);
    var g = function (t) { var x = p.filter(function (i) { return i.type === t; })[0]; return x ? x.value : ''; };
    tzShort = g('timeZoneName') || tzShort;
    $('now').textContent = 'Now: ' + g('weekday') + ', ' + g('day') + ' ' + g('month') + ' ' + g('year') + ', ' + g('hour') + ':' + g('minute') + ' ' + g('dayPeriod').toUpperCase() + ' (' + tzShort + ')';
  }

  function show(msg) { $('err').textContent = msg || ''; }
  function stop(title, text, bad) {
    $('form').hidden = true; $('done').hidden = false;
    $('doneTitle').textContent = title; $('doneText').textContent = text || '';
    $('tick').textContent = bad ? '!' : String.fromCharCode(10003);
    $('tick').className = 'tick' + (bad ? ' warn' : '');
  }
  function goBackSoon() {
    // after "Date and time saved": open the WhatsApp chat by itself after 3 seconds (the button below stays as a backup)
    var b = document.querySelector('.back'), r = $('redir'), n = 3;
    if (!b || !r) return;
    r.hidden = false; $('cnt').textContent = n;
    var t = setInterval(function () {
      n -= 1;
      if (n <= 0) { clearInterval(t); location.href = b.getAttribute('href'); } else $('cnt').textContent = n;
    }, 1000);
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
    $('calNote').textContent = unavailable[info.minDate] === true ? 'No free times are left today. Please choose another day.' : 'Greyed days are past, closed or fully booked.';
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
    $('selDate').textContent = sel.date ? fullDate(sel.date) : 'Tap a date';
    if (sel.date && sel.time) { $('sum').hidden = false; $('sum').textContent = 'You chose: ' + longDate(sel.date) + ', ' + sel.label + ' (' + tzShort + ')'; }
    else $('sum').hidden = true;
    $('save').disabled = !(sel.date && sel.time);
  }

  /* ---------- free-time mode: the customer picks ANY start time (like 9:25); nobody guesses how long the meeting lasts ---------- */
  var FREE_NOTE = 'Choose the time you would like us to start.';
  function toMin(hhmm) { var p = hhmm.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function clock12(hhmm) { var t = toMin(hhmm), h = Math.floor(t / 60); return ((h % 12) || 12) + ':' + pad(t % 60) + ' ' + (h < 12 ? 'AM' : 'PM'); }
  function h24Of(h, p) { return (+h % 12) + (p === 'PM' ? 12 : 0); }
  function nowMinutes() {
    var d = new Date(Date.now() + skew);
    var p = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: tz }).formatToParts(d);
    var g = function (t) { var x = p.filter(function (i) { return i.type === t; })[0]; return x ? +x.value : 0; };
    return g('hour') * 60 + g('minute');
  }
  function freeHours() {
    var a = Math.floor(toMin(info.dayStart) / 60), z = Math.floor(toMin(info.dayEnd) / 60), out = [], h, l;
    for (h = a; h <= z; h++) { l = String((h % 12) || 12); if (out.indexOf(l) < 0) out.push(l); }
    return out;
  }
  function minuteList() { var out = [], i; for (i = 0; i < 60; i++) out.push(pad(i)); return out; }
  function checkFree(h24, mm) {
    var t = h24 * 60 + mm, lead = info.minLeadMinutes || 0;
    if (t < toMin(info.dayStart) || t > toMin(info.dayEnd)) return { error: 'Please choose a time between ' + clock12(info.dayStart) + ' and ' + clock12(info.dayEnd) + '.' };
    if (sel.date === info.minDate && t < nowMinutes() + lead) return { error: lead ? 'Please choose a time at least ' + lead + ' minutes from now.' : 'That time has already passed. Please choose a later time.' };
    return { time: pad(h24) + ':' + pad(mm) };
  }
  function refreshFree() {
    pick.h = fill('selH', freeHours(), pick.h, 'Hr');
    pick.m = fill('selM', minuteList(), pick.m, 'Min');
    pick.p = fill('selP', ['AM', 'PM'], pick.p, 'AM/PM');
    ['selH', 'selM', 'selP', 'early'].forEach(function (id) { $(id).disabled = false; });
    var r = (pick.h && pick.m && pick.p) ? checkFree(h24Of(pick.h, pick.p), +pick.m) : null;
    if (r && r.time) { sel.time = r.time; sel.label = pick.h + ':' + pick.m + ' ' + pick.p; $('slotMsg').textContent = FREE_NOTE; }
    else { sel.time = null; sel.label = null; $('slotMsg').textContent = r ? r.error : FREE_NOTE; }
    summary();
  }
  function onFree(which) {
    pick[which] = $(which === 'h' ? 'selH' : which === 'm' ? 'selM' : 'selP').value;
    if (which === 'h' && pick.h) {
      var a = Math.floor(toMin(info.dayStart) / 60), z = Math.floor(toMin(info.dayEnd) / 60);
      var fitting = ['AM', 'PM'].filter(function (p) { var x = h24Of(pick.h, p); return x >= a && x <= z; });
      if (pick.p && fitting.indexOf(pick.p) < 0) pick.p = '';
      if (!pick.p && fitting.length === 1) pick.p = fitting[0];
    }
    if (pick.h && pick.p && !pick.m) pick.m = '00'; // hour + AM/PM chosen: start at :00, the customer can change the minutes
    show(''); refreshFree();
  }
  function earliestFree() {
    // the time starts at the CURRENT time, rounded up to the next 5 minutes (today: after the notice time, if any)
    var s = toMin(info.dayStart), e = toMin(info.dayEnd);
    var t = Math.ceil((nowMinutes() + (sel.date === info.minDate ? (info.minLeadMinutes || 0) : 0)) / 5) * 5;
    if (t < s) t = s;
    if (t > e) t = (sel.date === info.minDate) ? e : s;
    var h = Math.floor(t / 60);
    pick = { h: String((h % 12) || 12), m: pad(t % 60), p: h < 12 ? 'AM' : 'PM' };
    show(''); refreshFree();
  }

  function loadSlots(k) {
    var mine = ++slotsToken;
    slots = []; pick = { h: '', m: '', p: '' }; sel.time = null; sel.label = null; refreshTime();
    $('slotMsg').textContent = 'Loading times...';
    fetch('/pick/' + encodeURIComponent(token) + '/slots?date=' + encodeURIComponent(k), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (o) {
        if (mine !== slotsToken) return;
        if (!o.r.ok) { if (o.r.status === 409 || o.r.status === 403) { stop('This link is no longer active', msgOf(o.r, o.j), true); return; } $('slotMsg').textContent = msgOf(o.r, o.j); return; }
        slots = o.j.data.slots || [];
        refreshTime();
        if (k === info.minDate) { // today: start with the current time (the next free time from now)
          var a0 = free();
          if (a0.length) { pick = { h: a0[0].h, m: a0[0].m, p: a0[0].p }; refreshTime(); }
        }
        $('slotMsg').textContent = o.j.data.message || ('Only free times are listed. Each meeting is about ' + (info.meetingMinutes || 30) + ' minutes.');
      })
      .catch(function () { if (mine === slotsToken) $('slotMsg').textContent = 'Could not load the times. Please check your connection.'; });
  }

  function chooseDate(k) {
    sel.date = k; show(''); renderCal();
    if (info.freeTime) {
      $('early').textContent = 'Now';
      pick = { h: '', m: '', p: '' }; sel.time = null; sel.label = null; refreshFree();
      earliestFree(); // start with the current time, like the Now button
    } else {
      $('early').textContent = (k === info.minDate) ? 'Now' : 'Earliest';
      loadSlots(k);
    }
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
  $('selH').addEventListener('change', function () { if (info.freeTime) onFree('h'); else onSelect('h'); });
  $('selM').addEventListener('change', function () { if (info.freeTime) onFree('m'); else onSelect('m'); });
  $('selP').addEventListener('change', function () { if (info.freeTime) onFree('p'); else onSelect('p'); });
  $('early').addEventListener('click', function () {
    if (info.freeTime) { earliestFree(); return; }
    var a = free();
    if (!a.length) return;
    pick = { h: a[0].h, m: a[0].m, p: a[0].p }; show(''); refreshTime();
  });

  /* ---------- start ---------- */
  fetch('/pick/' + encodeURIComponent(token) + '/info', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
    .then(function (o) {
      if (!o.r.ok) { stop('This link is not valid', msgOf(o.r, o.j), true); return; }
      info = o.j.data;
      if (!info.active) {
        stop(info.reason === 'already_saved' ? 'Already saved' : 'This link has expired', info.reason === 'already_saved' ? 'Your date and time were already saved.' : 'Please use the newest message in WhatsApp.', info.reason !== 'already_saved');
        return;
      }
      tz = info.timezone; skew = info.epochMs - Date.now();
      (info.unavailable || []).forEach(function (k) { unavailable[k] = true; });
      $('timeLab').textContent = 'Time (' + (tz === 'Asia/Kolkata' ? 'India time' : tz) + ')';
      var t = parseKey(info.minDate); view.y = t.y; view.m = t.m;
      clock(); setInterval(clock, 30000);
      renderCal(); summary();
    })
    .catch(function () { stop('Could not load', 'Please check your internet connection and open the link again.', true); });

  $('save').addEventListener('click', function () {
    if (!sel.date || !sel.time) { show('Please choose a date and a time.'); return; }
    show(''); $('save').disabled = true;
    fetch('/pick/' + encodeURIComponent(token) + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ date: sel.date, time: sel.time }) })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (o) {
        if (o.r.ok) { stop('Date and time saved', longDate(sel.date) + ', ' + sel.label + ' (' + tzShort + ')'); goBackSoon(); return; }
        if (codeOf(o.j) === 'SLOT_TAKEN' || o.r.status === 422) {
          // someone else was first (or the time is not allowed): show the fresh list so the customer can pick again
          show(codeOf(o.j) === 'DATETIME_IN_PAST' && !info.minLeadMinutes ? 'That time has just passed. Please choose a later time.' : msgOf(o.r, o.j)); if (info.freeTime) $('save').disabled = false; else loadSlots(sel.date); return;
        }
        if (o.r.status === 409 || o.r.status === 403) { stop('This link is no longer active', msgOf(o.r, o.j), true); return; }
        show(msgOf(o.r, o.j)); $('save').disabled = false;
      })
      .catch(function () { show('Could not save. Please check your connection and try again.'); $('save').disabled = false; });
  });
})();
`;

module.exports = { HTML, JS };
