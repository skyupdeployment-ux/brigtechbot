'use strict';

/**
 * MSG91 WhatsApp channel test - uses a FAKE MSG91 server, so no account/number is needed.
 *   MONGODB_URI=mongodb://127.0.0.1:27017/brightech_msg91_test npm run test:msg91
 */
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const sent = [];
const fake = { failInteractive: false };

const fakeServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.method === 'POST' && req.url.startsWith('/api/v5/whatsapp/whatsapp-outbound-message')) {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (req.headers.authkey !== 'test-authkey') { res.writeHead(401).end('{"type":"error"}'); return; }
      if (fake.failInteractive && body.content_type === 'interactive') { res.writeHead(400, { 'content-type': 'application/json' }).end('{"type":"error","message":"bad interactive"}'); return; }
      sent.push(body);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"type":"success"}');
    } else if (req.url === '/media/plate.png') res.writeHead(200, { 'content-type': 'image/png' }).end(PNG);
    else if (req.url === '/media/cv.pdf') res.writeHead(200, { 'content-type': 'application/pdf' }).end('%PDF-1.4 x');
    else res.writeHead(404).end();
  });
});

(async () => {
  await new Promise((r) => fakeServer.listen(0, '127.0.0.1', r));
  const fakeBase = `http://127.0.0.1:${fakeServer.address().port}`;

  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/brightech_msg91_test';
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
  process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-wa-'));
  process.env.MSG91_ENABLED = 'true';
  process.env.MSG91_AUTH_KEY = 'test-authkey';
  process.env.MSG91_INTEGRATED_NUMBER = '919000000000';
  process.env.MSG91_WEBHOOK_SECRET = 'hook-secret-1234567890';
  process.env.MSG91_BASE_URL = fakeBase;
  process.env.MSG91_MEDIA_HOSTS = '127.0.0.1';
  process.env.MSG91_MEDIA_ALLOW_HTTP = 'true';
  process.env.MSG91_SEND_GAP_MS = '0';
  process.env.RATE_LIMIT_MAX = '50000';

  const mongoose = require('mongoose');
  const { DateTime } = require('luxon');
  const app = require('../app');
  const { connectDB } = require('../config/db');
  const botService = require('../services/botService');
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  await botService.ensureDefaultBot();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const HOOK = '/api/webhooks/msg91?secret=hook-secret-1234567890';

  let passed = 0;
  const step = (n) => { passed += 1; console.log('  ✓', n); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const settle = async () => { let last = -1; const t = Date.now(); while (Date.now() - t < 10000) { if (sent.length === last) return; last = sent.length; await sleep(350); } };
  const hook = async (payload, url = HOOK) => { const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); return r.status; };
  let uid = 0;
  const NUM = '919876543210';
  const text = (t, number = NUM) => ({ uuid: `u${++uid}`, customerNumber: number, direction: 'inbound', contentType: 'text', content: JSON.stringify({ text: t }) });
  const listReply = (title, number = NUM) => ({ uuid: `u${++uid}`, customerNumber: number, direction: 'inbound', contentType: 'interactive', content: JSON.stringify({ interactive: { type: 'list_reply', list_reply: { id: title, title } } }) });
  const say = async (payload) => { const before = sent.length; assert.equal(await hook(payload), 200); await settle(); return sent.slice(before); };
  const last = (arr) => arr[arr.length - 1];

  console.log('MSG91 channel tests (fake MSG91 at', fakeBase + ')');

  /* ---- security ---- */
  assert.equal(await hook(text('Hi'), '/api/webhooks/msg91?secret=wrong'), 401);
  assert.equal(await hook(text('Hi'), '/api/webhooks/msg91'), 401);
  await sleep(300); assert.equal(sent.length, 0); step('wrong / missing webhook secret -> 401, nothing sent');

  /* ---- ignored events ---- */
  let out = await say({ uuid: 'o1', customerNumber: NUM, direction: 'outbound', contentType: 'text', content: '{"text":"x"}' });
  assert.equal(out.length, 0);
  out = await say({ ...text('Hi', '919000000000'), uuid: 'own1' }); assert.equal(out.length, 0); step('outbound events and our own number are ignored');

  /* ---- menu ---- */
  const hiPayload = text('Hi');
  out = await say(hiPayload);
  assert.equal(out.length, 1);
  let m = out[0];
  assert.equal(m.integrated_number, '919000000000'); assert.equal(m.recipient_number, NUM); assert.equal(m.content_type, 'interactive');
  assert.equal(m.interactive.type, 'list'); assert.match(m.interactive.body.text, /Welcome to Brightech Group/);
  assert.equal(m.interactive.action.sections[0].rows.length, 8);
  assert.ok(m.interactive.action.sections[0].rows.every((r) => Array.from(r.title).length <= 24 && Array.from(r.description || '').length <= 72));
  assert.ok(Array.from(m.interactive.action.button).length <= 20); step('"Hi" -> interactive list menu (limits respected), auth key + numbers correct');

  /* ---- duplicate delivery ---- */
  out = await say(hiPayload); assert.equal(out.length, 0); step('duplicate webhook (same uuid) processed once');

  /* ---- reply shapes: nested content, top-level interactive string, top-level button string ---- */
  out = await say(listReply('8️⃣ Contact Our Team'));
  assert.match(last(out).interactive.body.text, /select the department/);
  out = await say({ uuid: `u${++uid}`, customerNumber: NUM, direction: 'inbound', contentType: 'interactive', content: '', interactive: JSON.stringify({ list_reply: { id: 'x', title: 'Sales Department' } }) });
  assert.match(last(out).interactive.body.text, /enter your name/);
  assert.deepEqual(last(out).interactive.action.buttons.map((b) => b.reply.title), ['Go Back', 'Main Menu']); step('list_reply in 2 payload shapes understood; text prompt gets reply buttons');

  out = await say({ uuid: `u${++uid}`, customerNumber: NUM, direction: 'inbound', contentType: 'button', content: '', button: JSON.stringify({ payload: 'Go Back', text: 'Go Back' }) });
  assert.match(last(out).interactive.body.text, /select the department/); step('button reply understood (Go Back)');
  await say(listReply('Sales Department'));

  /* ---- typed answers + validation ---- */
  await say(text('Ravi Kumar'));
  out = await say(text('123')); assert.match(out[0].interactive.body.text, /valid contact number/);
  await say(text('+91 98765 43210'));
  out = await say(text('Need a quotation for 5 PLCs'));
  const dateList = last(out);
  assert.equal(dateList.interactive.type, 'list');
  const rows = dateList.interactive.action.sections[0].rows;
  assert.ok(rows.length <= 10, 'rows <= 10: ' + rows.length); assert.match(dateList.interactive.body.text, /Go Back.*Main Menu/s);
  assert.equal(rows[7].title, 'Pick another date'); step('date list fits WhatsApp\'s 10-row limit (Go Back/Main Menu moved to a hint)');

  /* ---- calendar by typing a date ---- */
  out = await say(listReply('Pick another date'));
  assert.match(last(out).interactive.body.text, /DD\/MM\/YYYY/);
  out = await say(text('01/01/2020')); assert.match(out[0].text, /from tomorrow/);
  const target = DateTime.now().setZone('Asia/Kolkata').startOf('day').plus({ days: 9 });
  out = await say(text(target.toFormat('dd/MM/yyyy')));
  assert.equal(last(out).interactive.action.sections[0].rows[0].title, 'Morning'); step('typed DD/MM/YYYY date validated and accepted');

  out = await say(listReply('Evening'));
  const summary = last(out); assert.match(summary.interactive.body.text, /Enquiry summary/);
  assert.deepEqual(summary.interactive.action.buttons.map((b) => b.reply.title), ['Confirm Enquiry', 'Start Again', 'Cancel']);
  out = await say({ uuid: `u${++uid}`, customerNumber: NUM, direction: 'inbound', contentType: 'button', content: '', button: JSON.stringify({ payload: 'Confirm Enquiry', text: 'Confirm Enquiry' }) });
  const joined = out.map((o) => o.text || o.interactive.body.text).join('\n');
  assert.match(joined, /Reference no\.:\* BT-CNT-\d{4}-001/); step('confirm -> reference number delivered over WhatsApp');

  const Enquiry = mongoose.model('Enquiry'); const Booking = mongoose.model('Booking'); const User = mongoose.model('User');
  const enq = await Enquiry.findOne({}); assert.equal(enq.channel, 'whatsapp'); assert.equal(enq.contactName, 'Ravi Kumar'); assert.equal(enq.category, 'contact');
  const bk = await Booking.findOne({}); assert.equal(bk.dateKey, target.toISODate()); assert.equal(bk.timeSlot, 'Evening'); assert.equal(bk.timezone, 'Asia/Kolkata');
  const u = await User.findOne({ waNumber: NUM }); assert.equal(u.phone.startsWith('+91'), true);
  assert.equal(await Enquiry.countDocuments(), 1); assert.equal(await mongoose.model('Conversation').countDocuments({ channel: 'whatsapp' }), 1); step('enquiry + booking saved (channel=whatsapp, IST date), 1 user / 1 conversation per number');

  /* ---- numbers & plain text ---- */
  out = await say(text('menu')); assert.match(last(out).interactive.body.text, /Welcome/);
  out = await say(text('2')); assert.match(last(out).interactive.body.text, /type of equipment/); step('typed numbers work as menu choices');
  await say(text('main menu'));

  /* ---- media on a second customer ---- */
  const N2 = '919811111111';
  await say(text('plc', N2)); await say(text('Siemens', N2)); await say(text('S7-1200', N2));
  out = await say(text('5', N2)); assert.match(last(out).interactive.body.text, /product image/);
  out = await say({ uuid: `u${++uid}`, customerNumber: N2, direction: 'inbound', contentType: 'document', content: JSON.stringify({ url: fakeBase + '/media/cv.pdf', filename: 'cv.pdf', mime_type: 'application/pdf' }) });
  assert.match(last(out).interactive.body.text, /not supported here/); assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, 0); step('wrong file type at image step rejected, nothing kept');
  out = await say({ uuid: `u${++uid}`, customerNumber: N2, direction: 'inbound', contentType: 'image', content: JSON.stringify({ url: fakeBase + '/media/plate.png', mime_type: 'image/png' }) });
  assert.match(out.map((o) => o.text || '').join(' '), /File received/);
  assert.match(last(out).interactive.body.text, /requirement/i);
  assert.equal(fs.readdirSync(process.env.UPLOAD_DIR).length, 1); step('inbound image downloaded, stored and accepted; flow continues');

  out = await say({ uuid: `u${++uid}`, customerNumber: N2, direction: 'inbound', contentType: 'image', content: JSON.stringify({ url: 'http://169.254.169.254/x.png' }) });
  assert.match(out[0].text, /could not receive that file/); step('media URL outside MSG91_MEDIA_HOSTS is refused (SSRF guard)');

  out = await say({ uuid: `u${++uid}`, customerNumber: N2, direction: 'inbound', contentType: 'audio', content: '{}' });
  assert.match(out[0].text, /can only read text/); step('unsupported message types get a polite reply');

  /* ---- array payload + MSG91 rejecting interactive -> text fallback ---- */
  fake.failInteractive = true;
  out = await say([{ ...text('menu', '919822222222'), uuid: 'arr1' }]);
  assert.equal(out[0].content_type, 'text'); assert.match(out[0].text, /1\. Product Enquiry/); assert.match(out[0].text, /Reply with the \*number\*/);
  fake.failInteractive = false; step('array payloads accepted; interactive rejected by MSG91 -> numbered plain-text menu');

  /* ---- admin status ---- */
  assert.equal((await fetch(base + '/api/webhooks/msg91/status')).status, 401);
  step('status endpoint requires admin');

  console.log(`\n${passed} MSG91 checks passed`);
  server.close(); fakeServer.close(); await mongoose.disconnect(); fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error('\nFAILED:', e); process.exit(1); });
