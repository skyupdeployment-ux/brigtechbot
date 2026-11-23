'use strict';

/**
 * BotEngine - server-side port of the conversation engine from the front-end preview.
 * Pure and synchronous: it never touches the database. Given a stored state and one input
 * (text, option choice, files, a calendar date) it mutates its state and returns:
 *    engine.out      -> bot messages to deliver, in order
 *    engine.effects  -> things the service layer must persist (enquiry, activity ...)
 */

const { DateTime } = require('luxon');
const { norm, strip, clean } = require('../../utils/text');
const { validateBookingDate, DATE_KEY_RE, formatNowLine, formatPicked, slotOfHour, parseTypedDateTime } = require('../../utils/time');
const slotRules = require('../../utils/slots');
const { MAINOPTS, FL, KW, GREET, GLOBAL_OPTS, SCHED_TEXT, REF_CODES } = require('./flows');

const toPairs = (obj) => Object.keys(obj).map((k) => ({ k, v: obj[k] }));
const fromPairs = (arr) => (Array.isArray(arr) ? arr : []).reduce((o, p) => ((o[p.k] = p.v), o), {});

const rowView = (r) => ({ t: r.t, d: r.d || '' });

class BotEngine {
  /** ctx = { now: () => DateTime (in conversation tz), tz, maxDaysAhead } */
  constructor(state, ctx) {
    this.S = state || BotEngine.initialState();
    this.ctx = ctx;
    this.out = [];
    this.effects = [];
    this.acceptedFiles = [];
  }

  static initialState() {
    return {
      flow: null,
      idx: 0,
      data: {},
      files: {},
      hist: [],
      sub: null,
      started: false,
      ended: false,
      last: null,
      fname: '',
      pendingFlow: null,
      dateKey: null,
      timeSlot: null,
      timeLocal: null,
      submissions: 0,
    };
  }

  static fromStored(stored, ctx) {
    const s = BotEngine.initialState();
    if (stored) {
      Object.assign(s, stored, { data: fromPairs(stored.data), files: fromPairs(stored.files) });
      s.hist = Array.isArray(stored.hist) ? stored.hist.map((h) => ({ flow: h.flow, idx: h.idx, sub: h.sub || null })) : [];
    }
    return new BotEngine(s, ctx);
  }

  /** Mongo-safe representation (no dotted keys such as "Reference no."). */
  toStored() {
    const S = this.S;
    return { ...S, data: toPairs(S.data), files: toPairs(S.files), hist: S.hist.map((h) => ({ ...h })) };
  }

  /** What the UI's "Details captured" panel needs. */
  publicState() {
    const S = this.S;
    return {
      flow: S.flow,
      flowName: S.fname || '',
      completed: S.flow === '__done',
      started: S.started,
      ended: S.ended,
      data: toPairs(S.data).map((p) => ({ key: p.k, value: String(p.v) })),
      booking: { dateKey: S.dateKey, timeSlot: S.timeSlot },
    };
  }

  isActive() {
    return this.S.started && !this.S.ended;
  }

  curStep() {
    return this.S.flow && FL[this.S.flow] ? FL[this.S.flow].steps[this.S.idx] : null;
  }

  optsOf(st) {
    return typeof st.opts === 'function' ? st.opts(this) : st.opts;
  }

  bot(msg) {
    const m = { text: msg.text || '' };
    if (msg.head) m.head = msg.head;
    if (msg.list) m.list = msg.list;
    if (msg.btns) m.btns = msg.btns;
    if (msg.datePicker) m.datePicker = msg.datePicker;
    if (msg.picker) m.picker = true;
    if (msg.cta) m.cta = msg.cta; // a green button that opens a link
    this.out.push(m);
  }

  /* ---------------- Rendering a step ---------------- */
  sendStep(prefix, opts) {
    const S = this.S;
    const f = FL[S.flow];
    const st = f.steps[S.idx];

    if (S.sub === 'datepick' && st.key === 'Preferred date') return this.sendDatePicker(prefix);

    if (st.k === 'list') {
      let body = typeof st.body === 'function' ? st.body(this) : st.body;
      const head = st.head ? (f.icon ? f.icon + ' ' : '') + st.head : '';
      let rows;
      if (S.sub === 'more') {
        rows = st.more.opts.slice();
        body = st.more.body;
      } else {
        rows = this.optsOf(st).slice();
        if (st.more) rows.push({ t: st.more.label, d: st.more.desc, more: true });
      }
      const nav = !st.nonav && S.flow !== 'main' ? [{ t: '⬅️ Go Back' }, { t: '🏠 Main Menu' }] : [];
      this.bot({ head, text: body, list: { btn: st.btn, title: st.head || st.btn, rows: rows.map(rowView), nav: nav.map(rowView) } });
    } else if (st.k === 'dtpick') {
      // just the current date and time, then the "Pick date and time" button (nothing else)
      this.bot({ text: (prefix || '') + '🕒 *Now:* ' + formatNowLine(this.ctx.tz), picker: true });
    } else if (st.k === 'btns') {
      // cards sent before the buttons (e.g. Email / WhatsApp / Call), each with its own link button
      if (st.links && !(opts && opts.skipCards)) st.links(this).forEach((it) => this.bot({ text: it.text, cta: it.url ? { text: it.label, url: it.url } : undefined }));
      const b = st.opts.map((o) => o.t);
      if (!st.nonav && b.length === 2) b.push('Go Back');
      this.bot({ text: typeof st.body === 'function' ? st.body(this) : st.body, btns: b });
    } else if (st.k === 'text') {
      const b = [];
      if (st.opt) b.push('Skip');
      b.push('Go Back', 'Main Menu');
      this.bot({ text: (prefix || '') + st.body, btns: b });
    } else if (st.k === 'media') {
      const b = [];
      if (st.multi) b.push('Continue');
      else if (st.opt) b.push('Skip');
      b.push('Go Back', 'Main Menu');
      this.bot({ text: (prefix || '') + st.body, btns: b });
    }
  }

  sendDatePicker(prefix) {
    const today = this.ctx.now().startOf('day');
    this.bot({
      text: (prefix || '') + '📆 Please choose your preferred date from the calendar.\n\nTap *Open Calendar* to pick a date.',
      datePicker: {
        min: today.plus({ days: 1 }).toISODate(),
        max: today.plus({ days: this.ctx.maxDaysAhead }).toISODate(),
        btn: 'Open Calendar',
      },
      btns: ['Go Back', 'Main Menu'],
    });
  }

  /**
   * Something that is not an option of the current step (for example a tap on an old list): no complaint, the current
   * step is simply shown again. A step that has cards (Email / WhatsApp / Call) shows only its buttons, not the cards again.
   */
  resend() {
    this.sendStep(undefined, { skipCards: true });
  }

  err(msg) {
    const st = this.curStep();
    if (st && (st.k === 'list' || st.k === 'btns')) {
      this.bot({ text: msg });
      this.sendStep();
    } else {
      this.sendStep(msg + '\n\n');
    }
  }

  /* ---------------- Navigation ---------------- */
  showMain() {
    const S = this.S;
    S.flow = 'main';
    S.idx = 0;
    S.hist = [];
    S.sub = null;
    S.data = {};
    S.files = {};
    S.fname = '';
    S.dateKey = null;
    S.timeSlot = null;
    S.timeLocal = null;
    this.sendStep();
  }

  go(id, idx = 0, preset = null, intro = null) {
    const S = this.S;
    if (!S.flow || S.flow === '__done' || S.flow === '__confirm' || S.flow === 'main') S.hist = [{ flow: 'main', idx: 0, sub: null }];
    else S.hist.push({ flow: S.flow, idx: S.idx, sub: S.sub });
    S.flow = id;
    S.idx = idx;
    S.sub = null;
    const f = FL[id];
    if (f.topLevel) {
      S.data = preset ? Object.assign({}, preset) : {};
      S.files = {};
      S.fname = f.name;
      S.dateKey = null;
      S.timeSlot = null;
      S.timeLocal = null;
    } else if (f.top && FL[f.top]) S.fname = f.name;
    if (preset && !f.topLevel) Object.assign(S.data, preset);
    if (f.topLevel || f.top) this.effects.push({ type: 'FLOW_STARTED', flow: id, flowName: f.name });
    if (intro) this.bot({ text: intro });
    this.sendStep();
  }

  advance() {
    const S = this.S;
    const f = FL[S.flow];
    S.hist.push({ flow: S.flow, idx: S.idx, sub: S.sub });
    S.sub = null;
    S.idx += 1;
    if (S.idx >= f.steps.length) return this.finish();
    return this.sendStep();
  }

  schedText() {
    return '📅 *Book a time*\n' + (SCHED_TEXT[this.S.last] || 'When is a good time for our team to contact you?');
  }

  finish() {
    const S = this.S;
    if (S.flow !== '__sched' && S.flow !== '__sched2') {
      const f = FL[S.flow];
      S.pendingFlow = S.flow;
      S.last = f.top || S.flow;
      S.flow = this.ctx && this.ctx.picker ? '__sched2' : '__sched';
      S.idx = 0;
      S.sub = null;
    } else {
      S.flow = '__confirm';
      S.idx = 0;
      S.sub = null;
    }
    this.sendStep();
  }

  summaryText() {
    const S = this.S;
    const f = FL[S.pendingFlow];
    const lines = Object.keys(S.data).map((k) => '• ' + k + ': ' + S.data[k]).join('\n');
    return '📋 *Enquiry summary*\n*' + (S.fname || f.name) + '*\n\n' + lines + '\n\nPlease check your details. Tap *Confirm Enquiry* to submit.';
  }

  /* ---------------- Completion (reference number comes from the DB layer) ---------------- */
  requestComplete() {
    this.effects.push({ type: 'COMPLETE' });
  }

  refCode() {
    return REF_CODES[this.S.last] || 'ENQ';
  }

  /** Immutable snapshot of what is about to be submitted (taken before completeWith). */
  snapshot() {
    const S = this.S;
    const f = FL[S.pendingFlow];
    const attachments = [];
    Object.keys(S.files).forEach((key) => {
      (S.files[key] || []).forEach((file) => attachments.push({ fieldKey: key, ...file }));
    });
    return {
      flowId: S.pendingFlow,
      flowName: S.fname || f.name,
      category: S.last || S.pendingFlow,
      answers: Object.keys(S.data).map((key) => ({ key, value: String(S.data[key]) })),
      attachments,
      dateKey: S.dateKey || null,
      dateLabel: S.data['Preferred date'] || 'No preference',
      timeSlot: S.timeSlot || clean(String(S.data['Preferred time'] || 'No preference')),
      timeLocal: S.timeLocal || null,
      startsAt: S.dateKey && S.timeLocal && this.ctx && this.ctx.tz ? DateTime.fromISO(`${S.dateKey}T${S.timeLocal}`, { zone: this.ctx.tz }).toUTC().toJSDate() : null,
      submissionNo: (S.submissions || 0) + 1,
    };
  }

  completeWith(ref) {
    const S = this.S;
    const f = FL[S.pendingFlow];
    const txt = typeof f.done === 'function' ? f.done(S.data) : f.done;
    S.data['Reference no.'] = ref;
    const slot = this.ctx && this.ctx.slots && S.timeLocal
      ? '\n📅 *Your slot:* ' + S.data['Preferred date'] + ', ' + S.data['Preferred time'] + '\nThis time is reserved for you.'
      : S.data['Preferred date']
        ? '\n📅 *Requested slot:* ' + S.data['Preferred date'] + ', ' + S.data['Preferred time'] + '\nOur team will confirm the final time.'
        : '';
    this.bot({ text: txt + '\n\n🔖 *Reference no.:* ' + ref + slot + '\nPlease quote the reference when you contact us.' });
    S.flow = '__done';
    S.idx = 0;
    S.hist = [];
    S.sub = null;
    S.submissions = (S.submissions || 0) + 1;
    this.sendStep();
  }

  goBack() {
    const S = this.S;
    if (S.sub) {
      S.sub = null;
      return this.sendStep();
    }
    const h = S.hist.pop();
    if (!h) return this.showMain();
    S.flow = h.flow;
    S.idx = h.idx;
    S.sub = null;
    return this.sendStep();
  }

  endConv() {
    const S = this.S;
    this.bot({ text: 'Thank you for contacting Brightech Group. 😊\n\nSend *Hi* any time to start a new conversation.' });
    S.ended = true;
    S.flow = null;
    S.hist = [];
    S.sub = null;
    this.effects.push({ type: 'ENDED' });
  }

  act(r) {
    if (r === 'MAIN') return this.showMain();
    if (r === 'END') return this.endConv();
    if (r === 'AGAIN') return this.go(this.S.last || 'product');
    if (r === 'COMPLETE') return this.requestComplete();
    if (r === 'RESTART') return this.go(this.S.last);
    if (r === 'CANCEL') {
      this.effects.push({ type: 'CANCELLED' });
      this.bot({ text: 'Your enquiry has been cancelled. Nothing was submitted.' });
      return this.showMain();
    }
    if (r && typeof r === 'object') return this.go(r.go, r.idx || 0, r.preset || null, r.intro || null);
    return this.go(r);
  }

  /* ---------------- Input handling ---------------- */
  matchOpt(st, t) {
    let c;
    if (this.S.sub === 'more') c = st.more.opts.slice();
    else {
      c = this.optsOf(st).slice();
      if (st.more) c.push({ t: st.more.label, more: true });
    }
    if (/^\d+$/.test(t)) {
      const n = +t;
      if (n >= 1 && n <= c.length) return c[n - 1];
      return null;
    }
    const k = strip(t);
    return c.find((o) => strip(o.t) === k || (o.d && strip(o.d) === k)) || null;
  }

  validate(st, v) {
    if (!v) return 'Please enter a response.';
    if (st.v === 'num' && !/^[1-9]\d*$/.test(v)) return 'Please enter a valid number.';
    if (st.v === 'phone') {
      const dg = v.replace(/\D/g, '');
      if (!/^[+\d\s-]+$/.test(v) || dg.length < 8 || dg.length > 15) return 'Please enter a valid contact number.';
    }
    if (st.v === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Please enter a valid email address, or tap Skip.';
    return '';
  }

  mediaNext(st) {
    const S = this.S;
    const have = S.files[st.key] && S.files[st.key].length;
    if (st.req && !have) return this.err('Please send ' + st.what + ' using the attachment button.');
    if (!have) S.data[st.key] = 'No file added';
    return this.advance();
  }

  /** Accepts a typed date (YYYY-MM-DD, DD/MM/YYYY or DD-MM-YYYY) while the calendar prompt is open. */
  typedDate(raw) {
    const v = raw.trim();
    let key = null;
    if (DATE_KEY_RE.test(v)) key = v;
    else {
      const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (m) key = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    if (!key) return this.err('Please type a valid date as DD/MM/YYYY, or use the calendar.');
    const res = this.selectDate(key);
    if (res.error) return this.err(res.error.message);
    return res;
  }

  /**
   * Calendar selection. Returns { label, desc } on success or { error: {code,message} }.
   * On success the engine advances to the time-slot step.
   */
  selectDate(dateKey) {
    const S = this.S;
    const st = this.curStep();
    if (!this.isActive() || S.flow !== '__sched' || !st || st.key !== 'Preferred date') {
      return { error: { code: 'DATE_NOT_EXPECTED', message: 'No date is being requested right now.' } };
    }
    const v = validateBookingDate(dateKey, this.ctx.tz, { minOffsetDays: 1, maxDays: this.ctx.maxDaysAhead });
    if (v.error) return v;
    S.data['Preferred date'] = v.label;
    S.dateKey = v.dateKey;
    this.effects.push({ type: 'DATE_SELECTED', dateKey: v.dateKey, label: v.label });
    this.advance();
    return { label: v.label, desc: v.desc };
  }

  /**
   * Date + time chosen on the web picker (or typed). dateKey = YYYY-MM-DD, time24 = HH:mm (local time).
   * Returns { label, ... } on success or { error: { code, message } }.
   */
  /** Is this date + time acceptable? (no state change). Returns { ok: true } or { error: { code, message } }. */
  checkDateTime(dateKey, time24) {
    const S = this.S;
    if (!this.isActive() || S.flow !== '__sched2') {
      return { error: { code: 'DATE_NOT_EXPECTED', message: 'No date and time is being requested right now.' } };
    }
    const tz = this.ctx.tz;
    const dt = DATE_KEY_RE.test(String(dateKey)) && /^\d{2}:\d{2}$/.test(String(time24)) ? DateTime.fromISO(`${dateKey}T${time24}`, { zone: tz }) : null;
    if (!dt || !dt.isValid) return { error: { code: 'INVALID_DATETIME', message: 'That is not a valid date and time.' } };
    const now = this.ctx.now();
    const lead = this.ctx.minLeadMinutes != null ? this.ctx.minLeadMinutes : 30;
    if (dt < now.plus({ minutes: lead })) {
      return { error: { code: 'DATETIME_IN_PAST', message: `Please choose a time at least ${lead} minutes from now.` } };
    }
    if (dt > now.plus({ days: this.ctx.maxDaysAhead })) {
      return { error: { code: 'DATE_TOO_FAR', message: `Please choose a date within the next ${this.ctx.maxDaysAhead} days.` } };
    }
    if (this.ctx.slots && !slotRules.isValidStart(dateKey, time24, tz, this.ctx.slots)) {
      return { error: { code: 'SLOT_NOT_AVAILABLE', message: 'That time is not available. Please choose one of the available times.' } };
    }
    return { ok: true, dt };
  }

  /**
   * Date + time chosen on the web picker. dateKey = YYYY-MM-DD, time24 = HH:mm (local time).
   * Returns { label, desc } on success or { error: { code, message } }.
   */
  selectDateTime(dateKey, time24) {
    const check = this.checkDateTime(dateKey, time24);
    if (check.error) return check;
    const S = this.S;
    const tz = this.ctx.tz;
    const dt = check.dt;
    const p = formatPicked(dateKey, time24, tz);
    S.dateKey = dateKey;
    S.timeLocal = time24;
    S.timeSlot = slotOfHour(dt.hour);
    S.data['Preferred date'] = p.short;
    S.data['Preferred time'] = p.time12;
    this.effects.push({ type: 'DATE_SELECTED', dateKey, label: p.short });
    this.effects.push({ type: 'TIME_SELECTED', slot: S.timeSlot });
    this.bot({ text: '✅ *Date and time saved*\n\n📅 ' + p.date + '\n⏰ ' + p.time });
    this.advance();
    return { label: p.short + ', ' + p.time12, desc: p.date + ', ' + p.time };
  }

  /** The chosen slot was lost before the customer confirmed: ask again (no enquiry is created). */
  reopenBooking(message) {
    const S = this.S;
    this.effects = this.effects.filter((e) => e.type !== 'COMPLETE');
    S.flow = '__sched2';
    S.idx = 0;
    S.sub = null;
    S.dateKey = null;
    S.timeLocal = null;
    S.timeSlot = null;
    delete S.data['Preferred date'];
    delete S.data['Preferred time'];
    this.sendStep('⚠️ ' + message + '\n\n');
  }

  /** Typed answer at the picker step: "No preference" or "17/11/2026 5:30 PM". */
  typedDateTime(raw, t) {
    const S = this.S;
    if (t === 'no preference') {
      S.data['Preferred date'] = 'No preference';
      S.data['Preferred time'] = 'No preference';
      S.dateKey = null;
      S.timeLocal = null;
      S.timeSlot = 'No preference';
      this.effects.push({ type: 'DATE_SELECTED', dateKey: null, label: 'No preference' });
      return this.advance();
    }
    if (this.ctx.slots) return this.err('Please tap the button to choose a date and one of the available times. Or type No preference.');
    const parsed = parseTypedDateTime(raw);
    if (!parsed) return this.err('Please tap the button to pick your date and time, or type it like ' + this.ctx.now().plus({ days: 1 }).toFormat('dd/MM/yyyy') + ' 5:30 PM, or type No preference.');
    const res = this.selectDateTime(parsed.dateKey, parsed.time);
    if (res.error) return this.err(res.error.message);
    return res;
  }

  onText(raw) {
    const S = this.S;
    const t = norm(raw);
    const st = this.curStep();

    if (!S.started || S.ended) {
      S.started = true;
      S.ended = false;
      this.effects.push({ type: 'STARTED' });
      if (KW[t]) return this.act(KW[t]);
      return this.showMain();
    }
    if (t === 'go back' || t === 'back') return this.goBack();
    if (t === 'main menu' || t === 'menu' || t === 'help') return this.showMain();
    if (t === 'end conversation' && (!st || S.flow !== '__done')) return this.endConv();
    if (t === 'continue') {
      if (st && st.k === 'media') return this.mediaNext(st);
      return st ? this.sendStep() : this.showMain();
    }
    const free = st && (st.k === 'text' || st.k === 'media');
    if (!free) {
      if (GREET.includes(t)) return this.showMain();
      if (KW[t]) {
        // A real option on the current list wins over a keyword shortcut. Without this, picking "PLC"
        // in the Service equipment list was hijacked by the "plc" shortcut and sent to Product Enquiry.
        const listStep = st && (st.k === 'list' || st.k === 'btns') && S.sub !== 'datepick';
        const optionHit = listStep ? this.matchOpt(st, t) : null;
        if (!optionHit) return this.act(KW[t]);
      }
    }
    if (!st) return this.showMain();

    // A customer often taps an option of an OLD main menu that is still in the chat history. That option belongs
    // to the main menu, not to the step the bot is at now, so go straight to it instead of answering "not valid".
    // (An option of the CURRENT list always wins. At a typing step only the exact menu text, as WhatsApp sends it, counts.)
    const hereOpt = (st.k === 'list' || st.k === 'btns') && S.sub !== 'datepick' ? this.matchOpt(st, t) : null;
    if (!hereOpt) {
      const k = strip(t);
      const menuOpt = MAINOPTS.find((o) => (free ? raw.trim() === o.t : strip(o.t) === k || (o.d && strip(o.d) === k)));
      if (menuOpt) return this.act(menuOpt.go);
      // an option of an old list of Product Enquiry / PCB Repair / Automation / Robotics / BMS / Career: open that option
      // (never at a typing step: a typed answer is never taken for a menu option)
      const globalOpt = free ? null : GLOBAL_OPTS.find((o) => strip(o.t) === k);
      if (globalOpt) return this.act({ go: globalOpt.go, idx: globalOpt.idx, preset: globalOpt.preset });
    }

    if (st.k === 'dtpick') return this.typedDateTime(raw, t);

    if (st.k === 'list' || st.k === 'btns') {
      if (S.sub === 'datepick' && st.key === 'Preferred date') return this.typedDate(raw);
      const o = this.matchOpt(st, t);
      if (!o) return this.resend();
      if (o.more) {
        S.sub = 'more';
        return this.sendStep();
      }
      if (o.pick) {
        S.sub = 'datepick';
        return this.sendStep();
      }
      if (st.route) {
        const r = st.route[strip(o.t)];
        if (r) return this.act(r);
      }
      S.data[st.key] = clean(o.t);
      if (st.key === 'Preferred date' && S.flow === '__sched') {
        S.dateKey = o.dateKey || null;
        this.effects.push({ type: 'DATE_SELECTED', dateKey: S.dateKey, label: clean(o.t) });
      }
      if (st.key === 'Preferred time' && S.flow === '__sched') {
        S.timeSlot = clean(o.t);
        this.effects.push({ type: 'TIME_SELECTED', slot: S.timeSlot });
      }
      if (st.goto && st.goto[strip(o.t)]) return this.go(st.goto[strip(o.t)]);
      if (o.go) return this.go(o.go);
      if (o.info) this.bot({ text: o.info });
      if (st.info) this.bot({ text: '*' + (o.d && o.d.length > o.t.length ? o.d : o.t) + '*\n\nCompany-approved content: To be confirmed' });
      return this.advance();
    }
    if (st.k === 'text') {
      if (st.opt && t === 'skip') {
        S.data[st.key] = 'Skipped';
        return this.advance();
      }
      const v = raw.trim();
      const e = this.validate(st, v);
      if (e) return this.err(e);
      S.data[st.key] = v;
      return this.advance();
    }
    if (st.k === 'media') {
      if (st.opt && t === 'skip') {
        S.data[st.key] = 'Skipped';
        return this.advance();
      }
      return this.err('Please send ' + st.what + ' using the attachment (📎) button' + (st.multi ? ', or tap Continue.' : '.'));
    }
    return undefined;
  }

  accepts(st, f) {
    if (st.accept === 'image') return /^image\//.test(f.mimeType || '');
    if (st.accept === 'pdf') return f.mimeType === 'application/pdf' || /\.pdf$/i.test(f.originalName || '');
    return true;
  }

  /**
   * files: [{ originalName, mimeType, size, storedName, supported }]
   * `supported` is false for types the upload layer refused to store.
   * The accepted ones are available afterwards in engine.acceptedFiles.
   */
  onFiles(list) {
    const S = this.S;
    if (!S.started || S.ended) {
      S.started = true;
      S.ended = false;
      this.effects.push({ type: 'STARTED' });
      return this.showMain();
    }
    const st = this.curStep();
    if (!st || st.k !== 'media') {
      if (st && st.k === 'text') return this.err('Please type your answer for this question.');
      return st ? this.resend() : this.showMain();
    }

    const ok = list.filter((f) => f.supported && this.accepts(st, f));
    const bad = list.length - ok.length;
    if (!ok.length) return this.err('Sorry, that file type is not supported here. Please send ' + st.what + '.');

    this.acceptedFiles = ok;
    S.files[st.key] = (S.files[st.key] || []).concat(
      ok.map((f) => ({ originalName: f.originalName, storedName: f.storedName, mimeType: f.mimeType, size: f.size }))
    );
    S.data[st.key] = S.files[st.key].map((f) => f.originalName).join(', ');
    this.effects.push({ type: 'FILES_ACCEPTED', key: st.key, count: ok.length });

    if (st.multi) {
      this.bot({
        text:
          '✅ ' + ok.length + ' file' + (ok.length > 1 ? 's' : '') + ' received.' + (bad ? ' ' + bad + ' unsupported file skipped.' : '') +
          '\n\nSend more files, or tap *Continue* to proceed.',
        btns: ['Continue', 'Go Back', 'Main Menu'],
      });
    } else {
      this.bot({ text: '✅ File received.' });
      this.advance();
    }
    return undefined;
  }

  /** Inactivity rule ("Are you still there?"). Returns false when it should be treated as typed "Hi". */
  idle() {
    if (!this.isActive()) return false;
    this.bot({ text: 'Hi! 👋 Are you still there?\n\nWould you like to continue?', btns: ['Continue', 'Main Menu', 'End Conversation'] });
    return true;
  }
}

module.exports = BotEngine;
