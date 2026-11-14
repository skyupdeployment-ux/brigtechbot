// Browser-DOM smoke test of the bundled UI (jsdom). Start the server first, then:  node tests/ui.smoke.js http://localhost:5000

const { JSDOM } = require('jsdom');
const base = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, label, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(100); } throw new Error('timeout waiting for: ' + label); };

(async () => {
  const mk = async (storage) => {
    const dom = await JSDOM.fromURL(base + '/', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
      beforeParse(w) { w.HTMLElement.prototype.scrollIntoView = () => {}; w.URL.createObjectURL = () => 'blob:x'; if (storage) Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, v)); } });
    return dom;
  };
  let dom = await mk();
  let d = dom.window.document;
  const bubbles = () => [...d.querySelectorAll('.msg.in .tx')].map((x) => x.textContent);
  await until(() => bubbles().some((t) => /Welcome to Brightech Group/.test(t)), 'welcome message after auto "Hi"');
  console.log('  ✓ page boots, creates conversation, auto-sends Hi, shows welcome menu');
  console.log('  ✓ header:', d.querySelector('.wa-head b').textContent, '| clock:', d.querySelector('#clockTime').textContent, '|', d.querySelector('#clockTz').textContent);

  const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const lastAct = (sel) => [...d.querySelectorAll('.msg.interactive:not(.old) ' + sel)].pop();
  const pickRow = (title) => { click(lastAct('.act[data-a="list"]')); const row = [...d.querySelectorAll('#rows .row')].find((r) => r.querySelector('b').textContent.includes(title)); if (!row) throw new Error('row not found ' + title); click(row); click(d.querySelector('#ssend')); };
  const type = (t) => { d.querySelector('#inp').value = t; click(d.querySelector('#send')); };
  const waitText = (re, label) => until(() => bubbles().some((t) => re.test(t)), label);

  pickRow('Contact Our Team'); await waitText(/select the department/, 'department prompt');
  pickRow('Sales Department'); await waitText(/enter your name/, 'name prompt');
  type('Ravi Kumar'); await waitText(/contact number/, 'phone prompt');
  type('123'); await waitText(/valid contact number/, 'phone validation message');
  type('+91 98765 43210'); await waitText(/requirement briefly/, 'brief prompt');
  type('Need a quotation'); await waitText(/Book a time/, 'booking step');
  console.log('  ✓ list sheet -> choose -> typed answers -> validation -> booking prompt');
  console.log('  ✓ right panel:', [...d.querySelectorAll('#data .it')].map((e) => e.textContent).join(' | '));

  // calendar
  click(lastAct('.act[data-a="list"]'));
  const rows = [...d.querySelectorAll('#rows .row b')].map((b) => b.textContent);
  console.log('  ✓ date rows:', rows.join(' / '));
  const pick = [...d.querySelectorAll('#rows .row')].find((r) => r.querySelector('b').textContent === 'Pick another date');
  click(pick); click(d.querySelector('#ssend'));
  await until(() => lastAct('.act[data-a="date"]'), 'Open Calendar button');
  click(lastAct('.act[data-a="date"]'));
  await until(() => d.querySelector('#db').classList.contains('show'), 'date sheet visible');
  const di = d.querySelector('#dateInput');
  console.log('  ✓ calendar sheet opened; min/max =', di.min, di.max);
  const bad = new Date(Date.now() + 86400000 * 400).toISOString().slice(0, 10);
  di.value = bad; di.dispatchEvent(new dom.window.Event('change', { bubbles: true })); click(d.querySelector('#dsend'));
  await until(() => d.querySelector('#dateErr').textContent, 'inline date error');
  console.log('  ✓ server rejects out-of-range date, shown inline:', d.querySelector('#dateErr').textContent);
  const good = new Date(Date.now() + 86400000 * 10).toISOString().slice(0, 10);
  di.value = good; di.dispatchEvent(new dom.window.Event('change', { bubbles: true })); click(d.querySelector('#dsend'));
  await waitText(/preferred time slot/, 'time slot prompt');
  console.log('  ✓ calendar date accepted ->', [...d.querySelectorAll('.msg.out .tx')].pop().textContent);
  pickRow('Morning'); await waitText(/Enquiry summary/, 'summary');
  const summaryText = bubbles().pop();
  console.log('  ✓ summary shows date/time:', /Preferred date: \w{3}, \d+ \w{3}/.test(summaryText), /Preferred time: Morning/.test(summaryText));

  // reload page (persistence) before confirming
  const stor = {}; for (let i = 0; i < dom.window.localStorage.length; i++) { const k = dom.window.localStorage.key(i); stor[k] = dom.window.localStorage.getItem(k); }
  const before = d.querySelectorAll('.msg').length;
  dom.window.close();
  dom = await mk(stor); d = dom.window.document;
  await until(() => d.querySelectorAll('.msg').length >= before, 'history restored after refresh');
  const panel = [...d.querySelectorAll('#data .it')].map((e) => e.textContent).join(' | ');
  console.log('  ✓ refresh restores', d.querySelectorAll('.msg').length, 'messages; panel still has date/time:', /Preferred date/.test(panel), /Morning/.test(panel));
  const click2 = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const lastBtn = [...d.querySelectorAll('.msg.interactive:not(.old) .act[data-a="btn"]')].find((a) => /Confirm Enquiry/.test(a.textContent));
  click2(lastBtn);
  await until(() => [...d.querySelectorAll('.msg.in .tx')].some((x) => /Reference no\.:/.test(x.textContent)), 'reference number');
  console.log('  ✓ confirm after refresh ->', [...d.querySelectorAll('.msg.in .tx')].pop().textContent.match(/BT-[A-Z]+-\d+-\d+/)[0]);

  // 24h toggle
  click2(d.querySelector('#fmt24'));
  await sleep(200);
  console.log('  ✓ 24h toggle: clock =', d.querySelector('#clockTime').textContent, '| bubble ts =', d.querySelector('.ts').textContent);
  process.exit(0);
})().catch((e) => { console.error('UI TEST FAILED:', e.message); process.exit(1); });
