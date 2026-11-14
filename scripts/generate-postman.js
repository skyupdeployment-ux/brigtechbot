'use strict';

/* npm run postman  ->  docs/Brightech-Bot.postman_collection.json (import it into Postman) */
const fs = require('fs');
const path = require('path');

const T = (...lines) => ({ listen: 'test', script: { type: 'text/javascript', exec: lines } });
const saveBotId = [
  'const d = pm.response.json().data || {};',
  'const msgs = (d.botMessages || []).filter(m => m.kind === "interactive");',
  'if (msgs.length) pm.collectionVariables.set("botMessageId", msgs[msgs.length - 1].id);',
];
const status = (code) => `pm.test("status ${code}", () => pm.response.to.have.status(${code}));`;

const req = (name, method, url, { body, auth, tests, headers, formdata } = {}) => {
  const r = {
    name,
    request: {
      method,
      header: [...(body ? [{ key: 'Content-Type', value: 'application/json' }] : []), ...(headers || [])],
      url: { raw: '{{baseUrl}}' + url, host: ['{{baseUrl}}'], path: url.split('?')[0].split('/').filter(Boolean), query: (url.split('?')[1] || '').split('&').filter(Boolean).map((q) => ({ key: q.split('=')[0], value: q.split('=')[1] })) },
    },
  };
  if (body) r.request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2) };
  if (formdata) r.request.body = { mode: 'formdata', formdata };
  if (auth === 'customer') r.request.auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] };
  if (auth === 'admin') r.request.auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{adminToken}}', type: 'string' }] };
  if (auth === 'none') r.request.auth = { type: 'noauth' };
  if (tests) r.event = [tests];
  return r;
};
const C = (p) => `/api/conversations/{{conversationId}}${p}`;
const choice = (text, desc = '') => ({ type: 'choice', text, desc, messageId: '{{botMessageId}}' });

const collection = {
  info: {
    name: 'Brightech WhatsApp Bot API',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Run folders 1 -> 2 -> 3 in order. Test scripts store token, conversationId and botMessageId automatically.',
  },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        // always a valid future date (today + 10 days, IST) - never goes stale
        exec: ['pm.collectionVariables.set("bookingDate", new Date(Date.now() + 10 * 86400000 + 19800000).toISOString().slice(0, 10));'],
      },
    },
  ],
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5000' },
    { key: 'token', value: '' }, { key: 'adminToken', value: '' },
    { key: 'conversationId', value: '' }, { key: 'botMessageId', value: '' },
    { key: 'enquiryId', value: '' }, { key: 'bookingId', value: '' }, { key: 'userId', value: '' }, { key: 'botId', value: '' },
    { key: 'setupKey', value: 'my-setup-key-123' }, { key: 'webhookSecret', value: 'your-MSG91_WEBHOOK_SECRET' }, { key: 'adminEmail', value: 'admin@brightech.example' }, { key: 'adminPassword', value: 'Str0ngPass99' },
    { key: 'bookingDate', value: '2026-12-01' },
  ],
  item: [
    {
      name: '0. Public',
      item: [
        req('Health', 'GET', '/api/health', { auth: 'none', tests: T(status(200)) }),
        req('Server time (IST, 12h)', 'GET', '/api/time?timezone=Asia/Kolkata&format=12h', { auth: 'none', tests: T(status(200)) }),
        req('Server time (UTC, 24h)', 'GET', '/api/time?timezone=UTC&format=24h', { auth: 'none' }),
        req('Public bot config', 'GET', '/api/bots/public', { auth: 'none' }),
      ],
    },
    {
      name: '1. Customer chat (run in order)',
      item: [
        req('Start / resume conversation', 'POST', '/api/conversations', {
          auth: 'none',
          body: { timezone: 'Asia/Kolkata', timeFormat: '12h' },
          tests: T('const d = pm.response.json().data;', 'if (d.token) pm.collectionVariables.set("token", d.token);', 'pm.collectionVariables.set("conversationId", d.conversation.id);', 'pm.test("has conversation", () => pm.expect(d.conversation.id).to.be.a("string"));'),
        }),
        req('Send "Hi"', 'POST', C('/messages'), { auth: 'customer', body: { type: 'text', text: 'Hi' }, tests: T(status(200), ...saveBotId) }),
        req('Choose: Contact Our Team', 'POST', C('/messages'), { auth: 'customer', body: choice('8️⃣ Contact Our Team', 'Reach the right department'), tests: T(status(200), ...saveBotId) }),
        req('Choose: Sales Department', 'POST', C('/messages'), { auth: 'customer', body: choice('Sales Department'), tests: T(status(200), ...saveBotId) }),
        req('Type: name', 'POST', C('/messages'), { auth: 'customer', body: { type: 'text', text: 'Ravi Kumar' }, tests: T(status(200)) }),
        req('Type: phone', 'POST', C('/messages'), { auth: 'customer', body: { type: 'text', text: '+91 98765 43210' }, tests: T(status(200)) }),
        req('Type: requirement (-> date list)', 'POST', C('/messages'), { auth: 'customer', body: { type: 'text', text: 'Need a quotation for 5 PLCs' }, tests: T(status(200), ...saveBotId) }),
        req('Choose: Pick another date (-> calendar)', 'POST', C('/messages'), { auth: 'customer', body: choice('Pick another date', 'Choose from a calendar'), tests: T(status(200), ...saveBotId) }),
        req('Select calendar date', 'POST', C('/date'), { auth: 'customer', body: { date: '{{bookingDate}}', messageId: '{{botMessageId}}' }, tests: T('pm.test("accepted or validation error", () => pm.expect([200, 422]).to.include(pm.response.code));', ...saveBotId) }),
        req('Choose: Evening', 'POST', C('/messages'), { auth: 'customer', body: choice('Evening', 'Exact hours: To be confirmed'), tests: T(status(200), ...saveBotId) }),
        req('Choose: Confirm Enquiry', 'POST', C('/messages'), { auth: 'customer', body: choice('Confirm Enquiry'), tests: T(status(200), 'pm.test("reference issued", () => pm.expect(pm.response.json().data.enquiry.reference).to.match(/^BT-/));') }),
        req('Upload file(s) (multipart, field "files")', 'POST', C('/files'), { auth: 'customer', formdata: [{ key: 'files', type: 'file', src: [] }] }),
        req('Inactivity prompt', 'POST', C('/idle'), { auth: 'customer' }),
        req('Get conversation (history + state)', 'GET', C(''), { auth: 'customer' }),
        req('List messages', 'GET', C('/messages?afterSeq=-1&limit=50'), { auth: 'customer' }),
        req('Save preferences (UTC, 24h)', 'PATCH', C('/preferences'), { auth: 'customer', body: { timezone: 'UTC', timeFormat: '24h' } }),
        req('Save preferences (IST, 12h)', 'PATCH', C('/preferences'), { auth: 'customer', body: { timezone: 'Asia/Kolkata', timeFormat: '12h' } }),
        req('My conversations', 'GET', '/api/conversations', { auth: 'customer' }),
        req('My enquiries', 'GET', '/api/enquiries/mine', { auth: 'customer' }),
        req('My bookings', 'GET', '/api/bookings', { auth: 'customer', tests: T('const d = pm.response.json().data; if (d.length) pm.collectionVariables.set("bookingId", d[0].id);') }),
        req('Reschedule my booking', 'PATCH', '/api/bookings/{{bookingId}}', { auth: 'customer', body: { dateKey: '{{bookingDate}}', timeSlot: 'Morning' } }),
        req('My profile', 'GET', '/api/users/me', { auth: 'customer' }),
        req('Update my profile', 'PATCH', '/api/users/me', { auth: 'customer', body: { name: 'Ravi Kumar', company: 'Acme Pvt Ltd' } }),
        req('Restart conversation', 'POST', C('/restart'), { auth: 'customer', tests: T('pm.collectionVariables.set("conversationId", pm.response.json().data.conversation.id);') }),
      ],
    },
    {
      name: '2. Admin',
      item: [
        req('Register admin (needs ADMIN_SETUP_KEY)', 'POST', '/api/auth/register-admin', { auth: 'none', headers: [{ key: 'X-Setup-Key', value: '{{setupKey}}' }], body: { name: 'Admin', email: '{{adminEmail}}', password: '{{adminPassword}}' } }),
        req('Login', 'POST', '/api/auth/login', { auth: 'none', body: { email: '{{adminEmail}}', password: '{{adminPassword}}' }, tests: T(status(200), 'pm.collectionVariables.set("adminToken", pm.response.json().data.token);') }),
        req('Me', 'GET', '/api/auth/me', { auth: 'admin' }),
        req('List enquiries', 'GET', '/api/enquiries?page=1&limit=20&sort=-createdAt', { auth: 'admin', tests: T('const d = pm.response.json().data; if (d.length) pm.collectionVariables.set("enquiryId", d[0].id);') }),
        req('Search enquiries', 'GET', '/api/enquiries?q=ravi&category=contact&status=new', { auth: 'admin' }),
        req('Get enquiry', 'GET', '/api/enquiries/{{enquiryId}}', { auth: 'admin' }),
        req('Update enquiry', 'PATCH', '/api/enquiries/{{enquiryId}}', { auth: 'admin', body: { status: 'contacted', adminNotes: 'Called the customer' } }),
        req('List bookings (IST, 24h)', 'GET', '/api/bookings?timezone=Asia/Kolkata&timeFormat=24h&sort=date', { auth: 'admin', tests: T('const d = pm.response.json().data; if (d.length) pm.collectionVariables.set("bookingId", d[0].id);') }),
        req('Update booking', 'PATCH', '/api/bookings/{{bookingId}}', { auth: 'admin', body: { dateKey: '{{bookingDate}}', timeSlot: 'Afternoon', status: 'confirmed' } }),
        req('Activity history', 'GET', '/api/activities?page=1&limit=20', { auth: 'admin' }),
        req('List users', 'GET', '/api/users?role=customer', { auth: 'admin', tests: T('const d = pm.response.json().data; if (d.length) pm.collectionVariables.set("userId", d[0].id);') }),
        req('Update user', 'PATCH', '/api/users/{{userId}}', { auth: 'admin', body: { company: 'Updated Co' } }),
        req('List conversations (all)', 'GET', '/api/conversations?status=active', { auth: 'admin' }),
        req('List bots', 'GET', '/api/bots', { auth: 'admin' }),
        req('Create bot', 'POST', '/api/bots', { auth: 'admin', body: { slug: 'demo-bot', name: 'Demo bot', displayName: 'Demo' }, tests: T('pm.collectionVariables.set("botId", pm.response.json().data.id);') }),
        req('Update bot', 'PUT', '/api/bots/{{botId}}', { auth: 'admin', body: { subtitle: 'Updated subtitle' } }),
        req('Delete bot', 'DELETE', '/api/bots/{{botId}}', { auth: 'admin' }),
      ],
    },
    {
      name: '2b. MSG91 WhatsApp (needs MSG91_ENABLED=true)',
      item: [
        req('Simulate inbound "Hi" from MSG91', 'POST', '/api/webhooks/msg91?secret={{webhookSecret}}', {
          auth: 'none',
          body: { uuid: 'test-{{$timestamp}}', customerNumber: '919876543210', direction: 'inbound', contentType: 'text', content: '{"text":"Hi"}' },
        }),
        req('Simulate list reply', 'POST', '/api/webhooks/msg91?secret={{webhookSecret}}', {
          auth: 'none',
          body: { uuid: 'test-{{$timestamp}}-b', customerNumber: '919876543210', direction: 'inbound', contentType: 'interactive', content: '{"interactive":{"type":"list_reply","list_reply":{"id":"x","title":"8️⃣ Contact Our Team"}}}' },
        }),
        req('Channel status (admin)', 'GET', '/api/webhooks/msg91/status', { auth: 'admin' }),
      ],
    },
    {
      name: '3. Cleanup (destructive)',
      item: [
        req('Delete booking', 'DELETE', '/api/bookings/{{bookingId}}', { auth: 'admin' }),
        req('Delete enquiry', 'DELETE', '/api/enquiries/{{enquiryId}}', { auth: 'admin' }),
        req('Delete conversation', 'DELETE', C(''), { auth: 'customer' }),
        req('Delete user (cascade)', 'DELETE', '/api/users/{{userId}}', { auth: 'admin' }),
      ],
    },
  ],
};

const out = path.join(__dirname, '..', 'docs', 'Brightech-Bot.postman_collection.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(collection, null, 2));
console.log('Wrote', out);
