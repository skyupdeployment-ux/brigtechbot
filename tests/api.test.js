'use strict';

/**
 * End-to-end API test (needs a running MongoDB):
 *   MONGODB_URI=mongodb://127.0.0.1:27017/brightech_bot_test npm run test:api
 * Walks the whole product-enquiry flow through the real HTTP API, then exercises admin endpoints.
 */
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/brightech_bot_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-123456';
process.env.ADMIN_SETUP_KEY = 'setup-key-for-tests';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-uploads-'));
process.env.CHAT_RATE_LIMIT_MAX = '5000';
process.env.AUTH_RATE_LIMIT_MAX = '5000';
process.env.RATE_LIMIT_MAX = '50000';

const http = require('http');
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const app = require('../app');
const { connectDB } = require('../config/db');
const botService = require('../services/botService');
const realtime = require('../services/realtime');

let base;
let passed = 0;
const step = (name) => { passed += 1; console.log('  ✓', name); };

async function call(method, url, { token, body, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + url, { method, headers: h, body: payload });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await botService.ensureDefaultBot();
  const server = http.createServer(app);
  realtime.init(server);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  console.log('API tests against', base);

  /* ---- public ---- */
  let r = await call('GET', '/api/health');
  assert.equal(r.status, 200); assert.equal(r.body.data.db, 'connected'); step('health');

  r = await call('GET', '/api/time?timezone=Asia/Kolkata&format=24h');
  assert.equal(r.body.data.timezone, 'Asia/Kolkata'); assert.equal(r.body.data.utcOffset, '+05:30');
  assert.match(r.body.data.displayTime, /^\d{2}:\d{2}:\d{2}$/);
  assert.ok(Math.abs(r.body.data.epochMs - Date.now()) < 5000); step('server time (Asia/Kolkata, 24h)');

  r = await call('GET', '/api/time?timezone=Mars/Base');
  assert.equal(r.status, 422); step('invalid timezone rejected');

  r = await call('GET', '/api/bots/public');
  assert.equal(r.body.data.displayName, 'Brightech Group'); step('public bot config');

  /* ---- start conversation ---- */
  r = await call('POST', '/api/conversations', { body: {} });
  assert.equal(r.status, 201);
  const token = r.body.data.token; const convId = r.body.data.conversation.id;
  assert.ok(token); assert.equal(r.body.data.messages.length, 0);
  assert.equal(r.body.data.conversation.preferences.timezone, 'Asia/Kolkata'); step('conversation started (anonymous customer + JWT)');

  r = await call('POST', '/api/conversations', { token, body: {} });
  assert.equal(r.status, 200); assert.equal(r.body.data.resumed, true);
  assert.equal(r.body.data.conversation.id, convId); step('second start resumes the same conversation (no duplicates)');

  const send = (text, extra = {}) => call('POST', `/api/conversations/${convId}/messages`, { token, body: { type: 'text', text, ...extra } });
  const choose = async (prev, title, desc) => {
    const m = prev.body.data.botMessages.filter((x) => x.kind === 'interactive').pop();
    return call('POST', `/api/conversations/${convId}/messages`, { token, body: { type: 'choice', text: title, desc, messageId: m.id } });
  };

  /* ---- product flow ---- */
  r = await send('Hi');
  assert.equal(r.status, 200); assert.equal(r.body.data.userMessages[0].text, 'Hi');
  let menu = r.body.data.botMessages[0];
  assert.match(menu.text, /Welcome to Brightech Group/); assert.equal(menu.list.rows.length, 8);
  assert.ok(menu.displayTime.match(/^\d{1,2}:\d{2} (am|pm)$/)); step('"Hi" -> main menu with live 12h timestamp');

  r = await choose(r, '1️⃣ Product Enquiry', 'PLC, HMI, drives, sensors and more');
  assert.match(r.body.data.userMessages[0].quote, /Welcome to Brightech Group/);
  r = await choose(r, 'PLC', '');
  assert.match(r.body.data.botMessages[0].text, /programmable industrial controller/);
  r = await send('Siemens'); r = await send('S7-1200');
  r = await send('abc'); assert.match(r.body.data.botMessages[0].text, /valid number/);
  r = await send('5'); assert.match(r.body.data.botMessages[0].text, /product image/); step('flow progresses with validation');

  /* ---- file upload: wrong type then right type ---- */
  const pdf = new FormData(); pdf.append('files', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'doc.pdf');
  r = await call('POST', `/api/conversations/${convId}/files`, { token, form: pdf });
  assert.equal(r.status, 200); assert.match(r.body.data.botMessages[0].text, /not supported here/);
  assert.equal(r.body.data.userMessages[0].file.accepted, false);
  assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, 0); step('PDF refused at image step and not kept on disk');

  const exe = new FormData(); exe.append('files', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'evil.exe');
  r = await call('POST', `/api/conversations/${convId}/files`, { token, form: exe });
  assert.match(r.body.data.botMessages[0].text, /not supported here/);
  assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, 0); step('.exe refused by the upload filter');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const img = new FormData(); img.append('files', new Blob([png], { type: 'image/png' }), 'nameplate.png');
  r = await call('POST', `/api/conversations/${convId}/files`, { token, form: img });
  assert.equal(r.body.data.userMessages[0].file.accepted, true);
  const fileUrl = r.body.data.userMessages[0].file.url; assert.match(fileUrl, /^\/api\/files\//);
  assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, 1);
  const fr = await fetch(base + fileUrl); assert.equal(fr.status, 200); assert.equal(fr.headers.get('content-type'), 'image/png');
  const bad = await fetch(base + fileUrl.replace(/t=.*/, 't=garbage')); assert.equal(bad.status, 403); step('PNG accepted, stored, served via signed URL; bad token -> 403');

  r = await choose(r, 'New product purchase', '');
  r = await send('Asha Rao'); r = await send('Acme Pvt Ltd'); r = await send('Pune'); r = await send('asha@acme.in');

  /* ---- date & time ---- */
  const dateMsg = r.body.data.botMessages[0];
  assert.equal(dateMsg.list.title, 'Preferred Date'); assert.equal(dateMsg.list.rows.length, 9);
  const tomorrow = DateTime.now().setZone('Asia/Kolkata').startOf('day').plus({ days: 1 });
  assert.equal(dateMsg.list.rows[0].t, tomorrow.setLocale('en').toFormat('ccc, d LLL')); assert.equal(dateMsg.list.rows[0].d, 'Tomorrow');
  step('date list is built from the real current date (IST)');

  r = await choose(r, 'Pick another date', 'Choose from a calendar');
  const picker = r.body.data.botMessages[0]; assert.ok(picker.datePicker);
  assert.equal(picker.datePicker.min, tomorrow.toISODate()); step('"Pick another date" opens the calendar prompt with min/max');

  const today = DateTime.now().setZone('Asia/Kolkata').toISODate();
  const dpost = (date, extra = {}) => call('POST', `/api/conversations/${convId}/date`, { token, body: { date, ...extra } });
  assert.equal((await dpost(today, { messageId: picker.id })).body.error.code, 'DATE_IN_PAST');
  assert.equal((await dpost(tomorrow.plus({ days: 400 }).toISODate())).body.error.code, 'DATE_TOO_FAR');
  assert.equal((await dpost('2026-02-31')).body.error.code, 'INVALID_DATE');
  assert.equal((await dpost('31/12/2026')).status, 422);
  assert.equal((await dpost(tomorrow.plus({ days: 3 }).toISODate(), { messageId: '0'.repeat(24) })).status, 409); step('backend validates dates (past / too far / impossible / format / stale)');

  const chosen = tomorrow.plus({ days: 12 });
  r = await dpost(chosen.toISODate(), { messageId: picker.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.userMessages[0].text, chosen.setLocale('en').toFormat('ccc, d LLL'));
  assert.equal(r.body.data.state.booking.dateKey, chosen.toISODate());
  assert.equal(r.body.data.botMessages[0].list.title, 'Preferred Time'); step('calendar date saved and bot moves to time slots');

  r = await choose(r, 'Evening', 'Exact hours: To be confirmed');
  const summary = r.body.data.botMessages[0];
  assert.match(summary.text, /Enquiry summary/); assert.match(summary.text, /Preferred time: Evening/);
  assert.match(summary.text, /Product image: nameplate\.png/);

  /* ---- confirm ---- */
  r = await choose(r, 'Confirm Enquiry', '');
  assert.ok(r.body.data.enquiry.reference);
  const ref = r.body.data.enquiry.reference;
  assert.match(ref, /^BT-PRD-\d{4}-001$/);
  assert.match(r.body.data.botMessages[0].text, new RegExp('Reference no\\.:\\* ' + ref));
  assert.equal(r.body.data.state.completed, true); step(`enquiry confirmed -> ${ref}`);

  // double confirm on the (now stale) message must not create a second enquiry
  const stale = await call('POST', `/api/conversations/${convId}/messages`, { token, body: { type: 'choice', text: 'Confirm Enquiry', messageId: summary.id } });
  assert.equal(stale.status, 409); assert.equal(stale.body.error.code, 'STALE_OPTION'); step('stale option rejected (no duplicate enquiry)');
  assert.equal(await mongoose.model('Enquiry').countDocuments(), 1);

  /* ---- persistence after "refresh" ---- */
  r = await call('GET', `/api/conversations/${convId}`, { token });
  assert.ok(r.body.data.messages.length > 20); assert.equal(r.body.data.state.booking.dateKey, chosen.toISODate());
  assert.equal(r.body.data.state.booking.timeSlot, 'Evening');
  assert.ok(r.body.data.messages.every((m, i, a) => i === 0 || m.seq > a[i - 1].seq)); step('history + selected date/time persist after refresh');

  /* ---- second enquiry in the same conversation (Make Another Enquiry) ---- */
  r = await send('Make Another Enquiry');
  assert.match(r.body.data.botMessages[r.body.data.botMessages.length - 1].text, /product category/); step('"Make Another Enquiry" works');

  /* ---- preferences: 24h + timezone ---- */
  r = await call('PATCH', `/api/conversations/${convId}/preferences`, { token, body: { timezone: 'UTC', timeFormat: '24h' } });
  assert.equal(r.body.data.preferences.timeFormat, '24h');
  r = await call('GET', `/api/conversations/${convId}`, { token });
  assert.match(r.body.data.messages[0].displayTime, /^\d{2}:\d{2}$/); assert.equal(r.body.data.conversation.preferences.timezone, 'UTC');
  await call('PATCH', `/api/conversations/${convId}/preferences`, { token, body: { timezone: 'Asia/Kolkata', timeFormat: '12h' } });
  step('12h/24h + timezone preferences persist and change displayTime');

  /* ---- idle + restart ---- */
  r = await call('POST', `/api/conversations/${convId}/idle`, { token });
  assert.match(r.body.data.botMessages[0].text, /still there/); step('inactivity prompt');
  r = await call('POST', `/api/conversations/${convId}/restart`, { token });
  assert.equal(r.status, 201); assert.notEqual(r.body.data.conversation.id, convId); assert.equal(r.body.data.messages.length, 0); step('restart creates a fresh conversation (old one archived)');
  const old = await call('GET', '/api/conversations', { token });
  assert.equal(old.body.data.length, 2); step('customer can retrieve previous conversations');

  /* ---- authorization ---- */
  assert.equal((await call('GET', '/api/enquiries', { token })).status, 403);
  assert.equal((await call('GET', '/api/enquiries')).status, 401);
  assert.equal((await call('GET', '/api/users', { token })).status, 403);
  const other = await call('POST', '/api/conversations', { body: {} });
  assert.equal((await call('GET', `/api/conversations/${convId}`, { token: other.body.data.token })).status, 403); step('RBAC + ownership enforced');

  const mine = await call('GET', '/api/enquiries/mine', { token });
  assert.equal(mine.body.data.length, 1); assert.equal(mine.body.data[0].booking.timeSlot, 'Evening');
  assert.equal(mine.body.data[0].contactName, 'Asha Rao'); step('customer sees own enquiry + booking');

  /* ---- admin ---- */
  r = await call('POST', '/api/auth/register-admin', { body: { name: 'Boss', email: 'boss@brightech.test', password: 'Passw0rd123' } });
  assert.equal(r.status, 403);
  r = await call('POST', '/api/auth/register-admin', { headers: { 'X-Setup-Key': process.env.ADMIN_SETUP_KEY }, body: { name: 'Boss', email: 'boss@brightech.test', password: 'weak' } });
  assert.equal(r.status, 422);
  r = await call('POST', '/api/auth/register-admin', { headers: { 'X-Setup-Key': process.env.ADMIN_SETUP_KEY }, body: { name: 'Boss', email: 'boss@brightech.test', password: 'Passw0rd123' } });
  assert.equal(r.status, 201); assert.equal(r.body.data.user.password, undefined);
  r = await call('POST', '/api/auth/login', { body: { email: 'boss@brightech.test', password: 'wrong-pass1' } });
  assert.equal(r.status, 401);
  r = await call('POST', '/api/auth/login', { body: { email: 'boss@brightech.test', password: 'Passw0rd123' } });
  assert.equal(r.status, 200); const admin = r.body.data.token; step('admin registration (setup key), password policy, login');

  r = await call('GET', '/api/enquiries?category=product&q=asha', { token: admin });
  assert.equal(r.body.meta.total, 1); const enqId = r.body.data[0].id;
  assert.equal(r.body.data[0].booking.dateKey, chosen.toISODate());
  assert.equal(r.body.data[0].attachments[0].originalName, 'nameplate.png'); step('admin lists/searches enquiries');

  r = await call('PATCH', `/api/enquiries/${enqId}`, { token: admin, body: { status: 'contacted', adminNotes: 'Called back' } });
  assert.equal(r.body.data.status, 'contacted'); step('admin updates enquiry');

  r = await call('GET', '/api/bookings?timezone=Asia/Kolkata&timeFormat=24h&sort=date', { token: admin });
  assert.equal(r.body.meta.total, 1); const bookingId = r.body.data[0].id;
  assert.equal(r.body.data[0].date, DateTime.fromISO(chosen.toISODate(), { zone: 'Asia/Kolkata' }).startOf('day').toUTC().toISO({ suppressMilliseconds: false }));
  step('booking date stored as UTC instant of IST midnight');

  r = await call('PATCH', `/api/bookings/${bookingId}`, { token: admin, body: { dateKey: tomorrow.plus({ days: 20 }).toISODate(), timeSlot: 'Morning', status: 'confirmed' } });
  assert.equal(r.body.data.timeSlot, 'Morning'); assert.equal(r.body.data.status, 'confirmed'); step('admin reschedules booking');
  r = await call('PATCH', `/api/bookings/${bookingId}`, { token, body: { timeSlot: 'Afternoon' } });
  assert.equal(r.status, 409); assert.equal(r.body.error.code, 'BOOKING_LOCKED'); step('customer cannot change a confirmed booking');

  r = await call('GET', '/api/activities?type=enquiry_submitted', { token: admin });
  assert.equal(r.body.meta.total, 1);
  r = await call('GET', '/api/activities', { token: admin });
  const types = new Set(r.body.data.map((a) => a.type));
  for (const t of ['conversation_started', 'flow_started', 'file_uploaded', 'date_selected', 'time_selected', 'enquiry_submitted', 'enquiry_updated', 'booking_updated', 'admin_login']) assert.ok(types.has(t), 'missing activity ' + t);
  step('activity history recorded');

  r = await call('GET', '/api/users?role=customer&q=asha', { token: admin });
  assert.equal(r.body.data[0].name, 'Asha Rao'); assert.equal(r.body.data[0].company, 'Acme Pvt Ltd'); step('customer profile filled from the enquiry');

  r = await call('POST', '/api/bots', { token: admin, body: { slug: 'second-bot', name: 'Second', displayName: 'Second Bot' } });
  assert.equal(r.status, 201); const botId = r.body.data.id;
  r = await call('PUT', `/api/bots/${botId}`, { token: admin, body: { subtitle: 'Hello' } }); assert.equal(r.body.data.subtitle, 'Hello');
  r = await call('DELETE', `/api/bots/${botId}`, { token: admin }); assert.equal(r.status, 200); step('bot CRUD');

  r = await call('DELETE', `/api/enquiries/${enqId}`, { token: admin });
  assert.equal(r.status, 200);
  assert.equal(await mongoose.model('Booking').countDocuments(), 0);
  assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, 0); step('deleting an enquiry removes its booking and files');

  r = await call('DELETE', `/api/conversations/${convId}`, { token });
  assert.equal(r.status, 200); assert.equal(await mongoose.model('Message').countDocuments({ conversation: convId }), 0); step('customer deletes a conversation');

  const uid = (await call('GET', '/api/users/me', { token: other.body.data.token })).body.data.id;
  r = await call('DELETE', `/api/users/${uid}`, { token: admin }); assert.equal(r.status, 200); step('admin deletes a user (cascade)');

  /* ---- hardening ---- */
  r = await call('POST', '/api/conversations/not-an-id/messages', { token, body: { text: 'x' } });
  assert.equal(r.status, 400);
  r = await call('POST', '/api/conversations', { body: { timezone: 'Nope/Zone' } }); assert.equal(r.status, 422);
  r = await call('POST', '/api/conversations', { body: { $where: '1' } }); assert.equal(r.status, 201);
  r = await call('GET', '/api/nope'); assert.equal(r.status, 404); assert.equal(r.body.error.code, 'ROUTE_NOT_FOUND');
  const helm = await fetch(base + '/api/health'); assert.ok(helm.headers.get('content-security-policy')); assert.equal(helm.headers.get('x-powered-by'), null); step('validation, sanitising, 404 JSON, Helmet headers');

  console.log(`\n${passed} API checks passed`);
  server.close(); await mongoose.disconnect(); fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error('\nFAILED:', e); process.exit(1); });
