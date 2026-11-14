'use strict';

/* Offline tests of the flow engine (no database needed):  npm test */
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const BotEngine = require('../services/flow/engine');

const tz = 'Asia/Kolkata';
const ctx = { tz, maxDaysAhead: 90, now: () => DateTime.now().setZone(tz) };
let state = null;
let last = null;

function run(fn) {
  const e = BotEngine.fromStored(state, ctx);
  const r = fn(e);
  state = e.toStored();
  last = { out: e.out, effects: e.effects, result: r, engine: e };
  return last;
}
const say = (t) => run((e) => e.onText(t));
const lastText = () => last.out[last.out.length - 1];
const reset = () => { state = null; };
const effect = (type) => last.effects.find((x) => x.type === type);

let passed = 0;
const test = (name, fn) => { reset(); fn(); passed += 1; console.log('  ✓', name); };

console.log('Engine tests');

test('Hi shows the main menu with 8 options', () => {
  say('Hi');
  const m = lastText();
  assert.match(m.text, /Welcome to Brightech Group/);
  assert.equal(m.list.rows.length, 8);
  assert.equal(m.list.nav.length, 0);
});

test('invalid option is rejected and the list re-sent', () => {
  say('Hi'); say('banana');
  assert.equal(last.out[0].text, 'Sorry, that option is not valid. Please select one of the available options.');
  assert.equal(last.out[1].list.rows.length, 8);
});

test('keyword PLC jumps to product step 2 with category preset', () => {
  say('plc');
  assert.equal(BotEngine.fromStored(state, ctx).S.data.Category, 'PLC');
  assert.match(last.out[0].text, /programmable industrial controller/);
  assert.match(lastText().text, /manufacturer/);
});

test('number validation + product flow end to end with calendar date and reference', () => {
  say('Hi'); say('1'); say('PLC');
  say('Siemens'); say('S7-1200');
  say('abc'); assert.match(last.out[0].text, /valid number/);
  say('0'); assert.match(last.out[0].text, /valid number/);
  say('5');
  say('hello'); assert.match(lastText().text, /product image/);
  const r = run((e) => e.onFiles([{ originalName: 'plate.png', mimeType: 'image/png', size: 10, storedName: 'x.png', supported: true }]));
  assert.equal(r.engine.acceptedFiles.length, 1);
  say('New product purchase');
  say('Asha'); say('Acme'); say('Pune');
  say('not-an-email'); assert.match(last.out[0].text, /valid email/);
  say('skip');
  // booking step: list of 7 days + calendar + no preference
  const dates = lastText();
  assert.equal(dates.list.rows.length, 9);
  assert.equal(dates.list.rows[0].d, 'Tomorrow');
  assert.equal(dates.list.rows[7].t, 'Pick another date');
  assert.equal(dates.list.rows[8].t, 'No preference');
  say('Pick another date');
  assert.ok(lastText().datePicker, 'calendar prompt shown');
  const today = ctx.now().startOf('day');
  const past = run((e) => e.selectDate(today.minus({ days: 1 }).toISODate()));
  assert.equal(past.result.error.code, 'DATE_IN_PAST');
  const far = run((e) => e.selectDate(today.plus({ days: 400 }).toISODate()));
  assert.equal(far.result.error.code, 'DATE_TOO_FAR');
  const bad = run((e) => e.selectDate('2026-02-31'));
  assert.equal(bad.result.error.code, 'INVALID_DATE');
  const key = today.plus({ days: 12 }).toISODate();
  const ok = run((e) => e.selectDate(key));
  assert.ok(ok.result.label);
  assert.equal(lastText().list.title, 'Preferred Time');
  say('Evening');
  assert.match(lastText().text, /Enquiry summary/);
  assert.match(lastText().text, new RegExp('Preferred date: ' + ok.result.label));
  say('Confirm Enquiry');
  assert.ok(effect('COMPLETE'));
  const snap = last.engine.snapshot();
  assert.equal(snap.category, 'product');
  assert.equal(snap.dateKey, key);
  assert.equal(snap.timeSlot, 'Evening');
  assert.equal(snap.submissionNo, 1);
  assert.equal(snap.attachments.length, 1);
  run((e) => e.completeWith('BT-PRD-0101-001'));
  assert.match(last.out[0].text, /Reference no\.:\* BT-PRD-0101-001/);
  assert.match(last.out[0].text, /Requested slot/);
  assert.equal(BotEngine.fromStored(state, ctx).S.flow, '__done');
});

test('7-day list option selection stores a dateKey', () => {
  say('Hi'); say('8'); say('Sales Department'); say('Ravi'); say('9876543210'); say('Need a quote');
  say('2');
  const eng = BotEngine.fromStored(state, ctx);
  assert.equal(eng.S.dateKey, DateTime.now().setZone(tz).startOf('day').plus({ days: 2 }).toISODate());
  say('No preference'); // time slot
  assert.equal(BotEngine.fromStored(state, ctx).S.timeSlot, 'No preference');
});

test('No preference date leaves dateKey null', () => {
  say('Hi'); say('8'); say('Sales Department'); say('Ravi'); say('9876543210'); say('Need a quote');
  say('No preference');
  assert.equal(BotEngine.fromStored(state, ctx).S.dateKey, null);
});

test('typed calendar date is accepted in DD/MM/YYYY', () => {
  say('Hi'); say('8'); say('Sales Department'); say('Ravi'); say('9876543210'); say('Need a quote');
  say('Pick another date');
  const d = ctx.now().startOf('day').plus({ days: 5 });
  say(d.toFormat('dd/MM/yyyy'));
  assert.equal(BotEngine.fromStored(state, ctx).S.dateKey, d.toISODate());
});

test('phone validation', () => {
  say('Hi'); say('8'); say('Sales Department'); say('Ravi');
  say('123'); assert.match(last.out[0].text, /valid contact number/);
  say('+91 98765-43210');
  assert.match(lastText().text, /requirement briefly/);
});

test('Go Back / Main Menu / End Conversation', () => {
  say('Hi'); say('8'); say('Sales Department');
  say('Go Back');
  assert.match(lastText().text, /select the department/);
  say('Main Menu');
  assert.match(lastText().text, /Welcome to Brightech Group/);
  say('End Conversation');
  assert.match(lastText().text, /Send \*Hi\* any time/);
  assert.equal(BotEngine.fromStored(state, ctx).S.ended, true);
  say('Hi');
  assert.match(lastText().text, /Welcome to Brightech Group/);
});

test('BMS "More options" sub-list', () => {
  say('Hi'); say('5');
  const first = lastText();
  assert.equal(first.list.rows.length, 6);
  say('6');
  assert.match(lastText().text, /More building solutions/);
  say('Go Back');
  assert.equal(lastText().list.rows.length, 6);
});

test('career routes to the job-seeker sub-flow and requires a PDF resume', () => {
  say('Hi'); say('6'); say('Looking for a Job');
  say('Engineering'); say('Ravi'); say('B.Tech'); say('3 years'); say('PLC engineer'); say('Pune'); say('9876543210');
  const r = run((e) => e.onFiles([{ originalName: 'cv.png', mimeType: 'image/png', size: 5, storedName: 'a.png', supported: true }]));
  assert.match(r.out[0].text, /not supported here/);
  assert.equal(r.engine.acceptedFiles.length, 0);
  const ok = run((e) => e.onFiles([{ originalName: 'cv.pdf', mimeType: 'application/pdf', size: 5, storedName: 'a.pdf', supported: true }]));
  assert.equal(ok.engine.acceptedFiles.length, 1);
  assert.match(lastText().text, /Book a time/);
});

test('idle prompt', () => {
  say('Hi');
  const r = run((e) => e.idle());
  assert.equal(r.result, true);
  assert.match(last.out[0].text, /still there/);
});

test('state survives a Mongo-safe serialise/deserialise round trip', () => {
  say('plc'); say('Siemens');
  const stored = JSON.parse(JSON.stringify(state));
  state = stored;
  say('S7');
  assert.equal(BotEngine.fromStored(state, ctx).S.data['Model / part number'], 'S7');
});

console.log(`\n${passed} tests passed`);
