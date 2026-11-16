'use strict';

/* The page opened from the WhatsApp "Pick date and time" button (HTML + its script, served by routes/pickerRoutes.js).
 * The script is a separate file (/pick/app.js) because the site's security policy only allows scripts from itself. */

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Pick your date and time - Brightech Group</title>
<style>
:root{--navy:#0d2b45;--wa:#008069;--ink:#111b21;--mute:#5b6b75;--line:#d1d7db;--bg:#eef1f3;--err:#c0392b}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 "Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--navy);color:#fff;padding:16px 20px;font-weight:700;font-size:18px}
main{max-width:460px;margin:0 auto;padding:22px 18px 40px}
.card{background:#fff;border-radius:16px;padding:22px 20px;box-shadow:0 1px 3px rgba(11,20,26,.12)}
h1{margin:0 0 6px;font-size:22px;line-height:1.25;color:var(--navy)}
.now{margin:0 0 18px;color:var(--mute);font-size:15px}
.now b{color:var(--ink);font-variant-numeric:tabular-nums}
label{display:block;margin:14px 0 6px;font-weight:600;font-size:14px}
input{width:100%;font:inherit;font-size:18px;padding:13px 14px;border:1.5px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}
input:focus{outline:3px solid #9ed8cc;border-color:var(--wa)}
button{width:100%;margin-top:20px;padding:15px;border:0;border-radius:12px;background:var(--wa);color:#fff;font:inherit;font-weight:700;font-size:17px;cursor:pointer}
button:disabled{opacity:.55;cursor:wait}
button:focus-visible{outline:3px solid #9ed8cc;outline-offset:2px}
.hint{margin:6px 0 0;font-size:13px;color:var(--mute)}
.err{min-height:22px;margin-top:12px;color:var(--err);font-size:14px}
.ok{text-align:center;padding:8px 0}
.ok .tick{width:64px;height:64px;border-radius:50%;background:#dff5ec;color:var(--wa);display:grid;place-items:center;margin:0 auto 12px;font-size:34px;font-weight:700}
.ok h2{margin:0 0 6px;color:var(--navy)}
.ok p{margin:4px 0;color:var(--mute)}
[hidden]{display:none!important}
</style>
</head>
<body>
<header>Brightech Group</header>
<main>
  <div class="card" id="form">
    <h1>Pick your date and time</h1>
    <p class="now" id="now">Loading...</p>
    <label for="d">Date</label>
    <input type="date" id="d" required>
    <label for="t">Time</label>
    <input type="time" id="t" required>
    <p class="hint" id="hint"></p>
    <div class="err" id="err" role="alert"></div>
    <button type="button" id="save">Save date and time</button>
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
  var skew = 0, tz = 'Asia/Kolkata';

  function clock() {
    var d = new Date(Date.now() + skew);
    var p = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz, timeZoneName: 'short' }).formatToParts(d);
    var g = function (t) { var x = p.filter(function (i) { return i.type === t; })[0]; return x ? x.value : ''; };
    $('now').innerHTML = 'Now: <b>' + g('weekday') + ' ' + g('day') + ' ' + g('month') + ' ' + g('year') + ', ' + g('hour') + ':' + g('minute') + ' ' + g('dayPeriod').toUpperCase() + ' (' + g('timeZoneName') + ')</b>';
  }
  function show(msg) { $('err').textContent = msg || ''; }
  function stop(title, text) {
    $('form').hidden = true; $('done').hidden = false;
    $('doneTitle').textContent = title; $('doneText').textContent = text || '';
  }
  function msgOf(res, json) { return (json && json.error && json.error.message) || (res.status === 429 ? 'Too many tries. Please wait a moment.' : 'Something went wrong. Please try again.'); }

  fetch('/pick/' + encodeURIComponent(token) + '/info', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
    .then(function (o) {
      if (!o.r.ok) { stop('This link is not valid', msgOf(o.r, o.j)); return; }
      var i = o.j.data;
      if (!i.active) {
        stop(i.reason === 'already_saved' ? 'Already saved' : 'This link has expired', i.reason === 'already_saved' ? 'Your date and time were already saved.' : 'Please use the newest message in WhatsApp.');
        return;
      }
      tz = i.timezone; skew = i.epochMs - Date.now(); clock(); setInterval(clock, 15000);
      $('d').min = i.minDate; $('d').max = i.maxDate;
      var t = new Date(i.epochMs + (i.minLeadMinutes + 30) * 60000);
      var local = new Date(t.getTime() + i.utcOffsetMinutes * 60000);
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      $('d').value = local.getUTCFullYear() + '-' + pad(local.getUTCMonth() + 1) + '-' + pad(local.getUTCDate());
      $('t').value = pad(local.getUTCHours()) + ':' + pad(local.getUTCMinutes());
      $('hint').textContent = 'Choose a time at least ' + i.minLeadMinutes + ' minutes from now (' + tz + ').';
    })
    .catch(function () { stop('Could not load', 'Please check your internet connection and open the link again.'); });

  $('save').addEventListener('click', function () {
    var date = $('d').value, time = $('t').value;
    if (!date || !time) { show('Please choose both a date and a time.'); return; }
    show(''); $('save').disabled = true;
    fetch('/pick/' + encodeURIComponent(token) + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ date: date, time: time }) })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (o) {
        if (o.r.ok) { stop('Date and time saved', o.j.data && o.j.data.label ? o.j.data.label : ''); return; }
        if (o.r.status === 409 || o.r.status === 403) { stop('This link is no longer active', msgOf(o.r, o.j)); return; }
        show(msgOf(o.r, o.j)); $('save').disabled = false;
      })
      .catch(function () { show('Could not save. Please check your connection and try again.'); $('save').disabled = false; });
  });
})();
`;

module.exports = { HTML, JS };
