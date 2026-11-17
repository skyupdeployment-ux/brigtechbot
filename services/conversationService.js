'use strict';

const crypto = require('crypto');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Enquiry = require('../models/Enquiry');
const Booking = require('../models/Booking');
const BotEngine = require('./flow/engine');
const botService = require('./botService');
const tokenService = require('./tokenService');
const slotService = require('./slotService');
const slotRules = require('../utils/slots');
const referenceService = require('./referenceService');
const activityService = require('./activityService');
const fileService = require('./fileService');
const realtime = require('./realtime');
const serializers = require('../utils/serializers');
const AppError = require('../utils/AppError');
const { withLock } = require('../utils/lock');
const { nowIn, timeInfo } = require('../utils/time');
const { DateTime } = require('luxon');
const { parsePagination, buildMeta } = require('../utils/pagination');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------------- helpers ---------------- */
const prefsOf = (conv, bot) => ({
  timezone: (conv.preferences && conv.preferences.timezone) || bot.timezone,
  timeFormat: (conv.preferences && conv.preferences.timeFormat) || bot.timeFormat,
});

const env = require('../config/env');

const makeCtx = (prefs, bot) => ({
  tz: prefs.timezone,
  maxDaysAhead: bot.bookingMaxDaysAhead,
  minLeadMinutes: env.PICKER_MIN_LEAD_MINUTES,
  picker: !!(env.DATETIME_PICKER && env.PUBLIC_BASE_URL),
  slots: env.DATETIME_PICKER && env.PUBLIC_BASE_URL && env.booking.enabled ? env.booking : null,
  now: () => nowIn(prefs.timezone),
});

const isAdmin = (actor) => actor && actor.role === 'admin';

async function loadConversation(id, actor) {
  const conv = await Conversation.findById(id);
  if (!conv) throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
  if (!isAdmin(actor) && conv.user.toString() !== actor._id.toString()) throw AppError.forbidden();
  return conv;
}

async function withConversation(id, actor, fn) {
  return withLock(`conv:${id}`, async () => {
    const conv = await loadConversation(id, actor);
    const bot = await botService.getById(conv.bot);
    const prefs = prefsOf(conv, bot);
    const ctx = makeCtx(prefs, bot);
    const engine = BotEngine.fromStored(conv.state, ctx);
    return fn({ conv, bot, prefs, ctx, engine, actor });
  });
}

const quoteOf = (m) => ((m.head ? m.head + ' ' : '') + (m.text || '').replace(/\n+/g, ' ')).slice(0, 600);

/** The bot message a user's tap answers. Old (superseded) options are rejected, like the UI disables them. */
async function resolveQuoteTarget(conv, messageId) {
  const last = await Message.findOne({ conversation: conv._id, role: 'bot', kind: 'interactive' }).sort({ seq: -1 });
  if (messageId && (!last || last._id.toString() !== messageId)) {
    throw AppError.conflict('That option is no longer active. Please use the latest message.', 'STALE_OPTION');
  }
  return last;
}

const botDoc = (m) => ({
  role: 'bot',
  kind: m.list || m.btns || m.datePicker || m.cta ? 'interactive' : 'text',
  head: m.head,
  text: m.text,
  list: m.list,
  buttons: m.btns,
  datePicker: m.datePicker,
  cta: m.cta,
});

/** One-conversation link to the "Pick date and time" page (valid for PICKER_LINK_HOURS). */
const pickerUrl = (conv, engine) =>
  `${env.PUBLIC_BASE_URL}/pick/${tokenService.signPicker({ cid: conv._id.toString(), n: engine.S.submissions || 0 }, env.PICKER_LINK_HOURS)}`;

function extractContact(answers) {
  const get = (...keys) => {
    for (const k of keys) {
      const a = answers.find((x) => x.key === k);
      if (a && a.value && a.value !== 'Skipped') return a.value;
    }
    return undefined;
  };
  const email = get('Email address');
  return {
    contactName: (get('Full name', 'Customer name', 'Name', 'Contact person') || '').slice(0, 120) || undefined,
    contactPhone: (get('Contact number') || '').replace(/[^+\d\s-]/g, '').slice(0, 20) || undefined,
    contactEmail: email && EMAIL_RE.test(email) ? email.toLowerCase().slice(0, 254) : undefined,
    companyName: (get('Company name') || '').slice(0, 160) || undefined,
  };
}

/* ---------------- enquiry creation (idempotent) ---------------- */
async function createEnquiry(c) {
  const { conv, bot, engine, ctx, prefs } = c;
  const snap = engine.snapshot();

  let enquiry = await Enquiry.findOne({ conversation: conv._id, submissionNo: snap.submissionNo });
  let isNew = false;
  if (!enquiry) {
    const reference = await referenceService.next({ prefix: bot.referencePrefix, code: engine.refCode(), now: ctx.now() });
    try {
      enquiry = await Enquiry.create({
        reference,
        conversation: conv._id,
        submissionNo: snap.submissionNo,
        user: conv.user,
        bot: bot._id,
        flowId: snap.flowId,
        flowName: snap.flowName,
        category: snap.category,
        channel: conv.channel || 'web',
        answers: snap.answers,
        attachments: snap.attachments,
        timezone: prefs.timezone,
        ...extractContact(snap.answers),
      });
      isNew = true;
    } catch (e) {
      if (e.code !== 11000) throw e;
      enquiry = await Enquiry.findOne({ conversation: conv._id, submissionNo: snap.submissionNo });
      if (!enquiry) throw e;
    }
  }

  const dateUtc = snap.dateKey ? DateTime.fromISO(snap.dateKey, { zone: prefs.timezone }).startOf('day').toUTC().toJSDate() : null;
  const booking = await Booking.findOneAndUpdate(
    { enquiry: enquiry._id },
    {
      $setOnInsert: {
        enquiry: enquiry._id,
        conversation: conv._id,
        user: conv.user,
        bot: bot._id,
        dateKey: snap.dateKey,
        date: dateUtc,
        dateLabel: snap.dateLabel,
        timeLocal: snap.timeLocal,
        startsAt: snap.startsAt,
        timeSlot: snap.timeSlot,
        timezone: prefs.timezone,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (isNew) {
    const profile = extractContact(snap.answers);
    const $set = {};
    if (profile.contactName) $set.name = profile.contactName;
    if (profile.contactPhone) $set.phone = profile.contactPhone;
    if (profile.contactEmail) $set.email = profile.contactEmail;
    if (profile.companyName) $set.company = profile.companyName;
    if (Object.keys($set).length) {
      // Never overwrite an admin account's identity from chat answers.
      await User.updateOne({ _id: conv.user, role: 'customer' }, { $set }).catch(() => {});
    }
  }
  return { enquiry, booking, isNew };
}

/* ---------------- persist one turn ---------------- */
async function commit(c, userDocs, { req, socketId } = {}) {
  const { conv, bot, prefs, engine, ctx } = c;
  const hadSlot = !!(conv.state && conv.state.timeLocal); // did the customer hold a slot before this turn?

  // 1) effects that need the database (only COMPLETE does)
  let created = null;
  for (const eff of engine.effects.slice()) {
    if (eff.type === 'COMPLETE') {
      const snap = engine.snapshot();
      const slotted = !!(ctx.slots && snap.startsAt);
      if (slotted && !(await slotService.verifyHold(conv._id, snap.startsAt))) {
        // the slot was released (held too long) and may be gone: no enquiry yet, ask for another time
        engine.reopenBooking('Sorry, that time is no longer available. Please choose another time.');
        continue;
      }
      created = await createEnquiry(c);
      engine.completeWith(created.enquiry.reference);
      if (slotted) await slotService.bookHold(conv._id, snap.startsAt, created.enquiry._id);
    }
  }

  // 2) messages, strictly ordered by seq
  const last = await Message.findOne({ conversation: conv._id }).sort({ seq: -1 }).select('seq').lean();
  const startSeq = last ? last.seq + 1 : 0;
  engine.out.forEach((m) => {
    if (m.picker) m.cta = { text: 'Pick date and time', url: pickerUrl(conv, engine) };
  });
  const docs = [...userDocs, ...engine.out.map(botDoc)].map((d, i) => ({ ...d, conversation: conv._id, seq: startSeq + i }));
  const saved = docs.length ? await Message.insertMany(docs) : [];

  // 3) conversation state
  conv.state = engine.toStored();
  conv.markModified('state');
  conv.currentFlow = engine.S.flow;
  conv.status = engine.S.ended ? 'ended' : 'active';
  conv.messageCount = startSeq + docs.length;
  if (created && created.isNew) conv.enquiryCount += 1;
  if (docs.length) conv.lastMessageAt = new Date();
  conv.lastActivityAt = new Date();
  await conv.save();
  // the customer started again / cancelled / went back: give their held slot back
  if (ctx.slots && hadSlot && !engine.S.timeLocal) await slotService.releaseHeld(conv._id);

  // 4) audit trail (best effort)
  const base = { user: conv.user, actor: c.actor && c.actor._id, conversation: conv._id, req };
  for (const eff of engine.effects) {
    if (eff.type === 'FLOW_STARTED') await activityService.log('flow_started', { ...base, meta: { flow: eff.flow, flowName: eff.flowName } });
    if (eff.type === 'DATE_SELECTED') await activityService.log('date_selected', { ...base, meta: { dateKey: eff.dateKey, label: eff.label } });
    if (eff.type === 'TIME_SELECTED') await activityService.log('time_selected', { ...base, meta: { slot: eff.slot } });
    if (eff.type === 'FILES_ACCEPTED') await activityService.log('file_uploaded', { ...base, meta: { field: eff.key, count: eff.count } });
    if (eff.type === 'CANCELLED') await activityService.log('enquiry_cancelled', base);
    if (eff.type === 'ENDED') await activityService.log('conversation_ended', base);
  }
  if (created && created.isNew) {
    await activityService.log('enquiry_submitted', { ...base, enquiry: created.enquiry._id, meta: { reference: created.enquiry.reference, category: created.enquiry.category } });
    realtime.toAdmins('enquiry:created', {
      id: created.enquiry._id.toString(),
      reference: created.enquiry.reference,
      flowName: created.enquiry.flowName,
      category: created.enquiry.category,
      contactName: created.enquiry.contactName,
      createdAt: created.enquiry.createdAt.toISOString(),
    });
  }

  // 5) response
  const views = saved.map((m) => serializers.message(m, prefs));
  const result = {
    userMessages: views.filter((m) => m.role === 'user'),
    botMessages: views.filter((m) => m.role === 'bot'),
    state: engine.publicState(),
    enquiry: created ? { id: created.enquiry._id.toString(), reference: created.enquiry.reference } : null,
  };
  realtime.toUser(conv.user.toString(), 'conversation:update', { conversationId: conv._id.toString(), messages: views, state: result.state }, socketId);
  return result;
}

/* ---------------- public operations ---------------- */
async function createConversation(user, bot, body = {}) {
  const timezone = body.timezone || user.timezone || bot.timezone;
  const timeFormat = body.timeFormat || user.timeFormat || bot.timeFormat;
  return Conversation.create({
    user: user._id,
    bot: bot._id,
    channel: body.channel || 'web',
    state: BotEngine.initialState(),
    preferences: { timezone, timeFormat },
  });
}

async function view(conv, bot, { afterSeq = -1, limit = 500 } = {}) {
  const prefs = prefsOf(conv, bot);
  const messages = await Message.find({ conversation: conv._id, seq: { $gt: afterSeq } }).sort({ seq: 1 }).limit(limit);
  const engine = BotEngine.fromStored(conv.state, makeCtx(prefs, bot));
  return {
    conversation: { ...conv.toJSON(), preferences: prefs },
    messages: messages.map((m) => serializers.message(m, prefs)),
    state: engine.publicState(),
    time: timeInfo(prefs.timezone, prefs.timeFormat),
  };
}

async function startOrResume({ actor, body, req }) {
  const bot = await botService.getActiveBySlug(body.botSlug);
  let user = actor;
  let token = null;

  if (!user) {
    user = await User.create({
      role: 'customer',
      sessionId: crypto.randomUUID(),
      timezone: body.timezone || bot.timezone,
      timeFormat: body.timeFormat || bot.timeFormat,
      lastSeenAt: new Date(),
    });
    token = tokenService.signAccess(user);
  }

  const { conv, resumed } = await withLock(`start:${user._id}`, async () => {
    let existing = await Conversation.findOne({ user: user._id, bot: bot._id, status: { $in: ['active', 'ended'] } }).sort({ lastActivityAt: -1 });
    if (existing) return { conv: existing, resumed: true };
    existing = await createConversation(user, bot, body);
    return { conv: existing, resumed: false };
  });

  await User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } });
  await activityService.log(resumed ? 'conversation_resumed' : 'conversation_started', { user: user._id, conversation: conv._id, req });

  const payload = await view(conv, bot);
  return { token, resumed, bot: botService.publicView(bot), ...payload };
}

async function getOne(id, actor, query = {}) {
  const conv = await loadConversation(id, actor);
  const bot = await botService.getById(conv.bot);
  return view(conv, bot, query);
}

async function listMessages(id, actor, query) {
  const conv = await loadConversation(id, actor);
  const bot = await botService.getById(conv.bot);
  const prefs = prefsOf(conv, bot);
  const messages = await Message.find({ conversation: conv._id, seq: { $gt: query.afterSeq } }).sort({ seq: 1 }).limit(query.limit);
  return messages.map((m) => serializers.message(m, prefs));
}

async function list(actor, query) {
  const p = parsePagination(query);
  const filter = {};
  if (!isAdmin(actor)) filter.user = actor._id;
  else if (query.user) filter.user = query.user;
  if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    Conversation.find(filter).sort({ lastActivityAt: -1 }).skip(p.skip).limit(p.limit),
    Conversation.countDocuments(filter),
  ]);
  return { items: items.map((c) => c.toJSON()), meta: buildMeta(p, total) };
}

async function sendMessage(id, actor, body, ctx) {
  return withConversation(id, actor, async (c) => {
    const userDoc = { role: 'user', kind: body.type === 'choice' ? 'choice' : 'text', text: body.text };
    if (body.type === 'choice') {
      if (body.desc) userDoc.desc = body.desc;
      const target = await resolveQuoteTarget(c.conv, body.messageId);
      if (target) userDoc.quote = quoteOf(target);
    }
    c.engine.onText(body.text);
    return commit(c, [userDoc], ctx);
  });
}

async function sendFiles(id, actor, files, rejected, ctx) {
  const stored = files.map((f) => f.filename);
  try {
    return await withConversation(id, actor, async (c) => {
      const list = [
        ...files.map((f) => ({ originalName: f.originalname.slice(0, 255), mimeType: f.mimetype, size: f.size, storedName: f.filename, supported: true })),
        ...rejected.map((r) => ({ ...r, storedName: null, supported: false })),
      ];
      if (!list.length) throw AppError.badRequest('No files received. Send them in the "files" field.', 'NO_FILES');

      c.engine.onFiles(list);
      const keep = new Set(c.engine.acceptedFiles.map((f) => f.storedName));
      const userDocs = list.map((f) => ({
        role: 'user',
        kind: 'file',
        file: {
          originalName: f.originalName,
          storedName: keep.has(f.storedName) ? f.storedName : null,
          mimeType: f.mimeType,
          size: f.size,
          accepted: keep.has(f.storedName),
        },
      }));
      const result = await commit(c, userDocs, ctx);
      await fileService.remove(stored.filter((n) => !keep.has(n))); // wrong type for this step -> not kept
      return result;
    });
  } catch (e) {
    await fileService.remove(stored);
    throw e;
  }
}

async function selectDate(id, actor, body, ctx) {
  return withConversation(id, actor, async (c) => {
    const res = c.engine.selectDate(body.date);
    if (res.error) throw AppError.unprocessable(res.error.message, res.error.code);
    const target = await resolveQuoteTarget(c.conv, body.messageId);
    const userDoc = { role: 'user', kind: 'choice', text: res.label, desc: res.desc };
    if (target) userDoc.quote = quoteOf(target);
    return commit(c, [userDoc], ctx);
  });
}

/**
 * Called by the web picker page. The signed link is the authorisation (no login).
 * Returns the bot's next messages plus how to deliver them (WhatsApp number or web).
 */
async function submitDateTime(id, linkCount, body, ctx) {
  const conv0 = await Conversation.findById(id);
  if (!conv0) throw AppError.notFound('This link is no longer valid.', 'CONVERSATION_NOT_FOUND');
  const owner = await User.findById(conv0.user);
  if (!owner) throw AppError.notFound('This link is no longer valid.', 'USER_NOT_FOUND');
  return withConversation(id, owner, async (c) => {
    if ((c.engine.S.submissions || 0) !== linkCount) throw AppError.conflict('This link has expired. Please use the newest message in WhatsApp.', 'LINK_EXPIRED');
    const check = c.engine.checkDateTime(body.date, body.time);
    if (check.error) {
      const status = check.error.code === 'DATE_NOT_EXPECTED' ? 409 : 422;
      throw new AppError(status, check.error.code, check.error.message);
    }
    if (c.ctx.slots) await slotService.reserve(c.conv._id, check.dt.toUTC().toJSDate()); // SLOT_TAKEN if someone was first
    const res = c.engine.selectDateTime(body.date, body.time);
    const result = await commit(c, [{ role: 'user', kind: 'choice', text: res.label, desc: res.desc }], ctx);
    result.delivery = { channel: c.conv.channel, waNumber: owner.waNumber || null };
    return result;
  });
}

/** Loads what the picker page needs about a conversation (shared by info + slots). */
async function pickerContext(id, linkCount) {
  const conv = await Conversation.findById(id);
  if (!conv) throw AppError.notFound('This link is no longer valid.', 'CONVERSATION_NOT_FOUND');
  const bot = await botService.getById(conv.bot);
  const prefs = prefsOf(conv, bot);
  const ctx = makeCtx(prefs, bot);
  const engine = BotEngine.fromStored(conv.state, ctx);
  const active = engine.isActive() && engine.S.flow === '__sched2' && (engine.S.submissions || 0) === linkCount;
  return { conv, bot, prefs, ctx, engine, active, now: ctx.now() };
}

/** What the picker page needs to show: server time, the calendar range, closed / full days, and whether the link is usable. */
async function pickerInfo(id, linkCount) {
  const { bot, prefs, ctx, engine, active, now } = await pickerContext(id, linkCount);
  const maxDate = now.plus({ days: bot.bookingMaxDaysAhead }).toISODate();
  const cfg = env.booking;
  return {
    active,
    reason: active ? null : engine.S.flow === '__confirm' || (engine.S.submissions || 0) > linkCount ? 'already_saved' : 'expired',
    timezone: prefs.timezone,
    epochMs: now.toMillis(),
    nowLine: require('../utils/time').formatNowLine(prefs.timezone),
    minDate: now.toISODate(),
    maxDate,
    minLeadMinutes: ctx.minLeadMinutes,
    utcOffsetMinutes: now.offset,
    slotMode: !!ctx.slots,
    meetingMinutes: cfg.meeting,
    unavailable: active ? await slotService.unavailableDates(now.toISODate(), maxDate, prefs.timezone, now, ctx.minLeadMinutes) : [],
  };
}

/** The times of ONE date, each marked available or not. */
async function pickerSlots(id, linkCount, dateKey) {
  const { bot, prefs, ctx, active, now } = await pickerContext(id, linkCount);
  if (!active) throw AppError.conflict('This link is no longer active.', 'LINK_EXPIRED');
  const dt = DateTime.fromISO(String(dateKey), { zone: prefs.timezone });
  if (!dt.isValid) throw AppError.unprocessable('That is not a valid date.', 'INVALID_DATE');
  if (dt.toISODate() < now.toISODate() || dt.toISODate() > now.plus({ days: bot.bookingMaxDaysAhead }).toISODate()) {
    return { date: dt.toISODate(), open: false, slots: [], message: 'Please choose a date inside the calendar.' };
  }
  await slotService.purgeExpired();
  const day = await slotService.dayAvailability(dt.toISODate(), prefs.timezone, now, ctx.minLeadMinutes);
  const anyFree = day.slots.some((x) => x.available);
  return {
    date: dt.toISODate(),
    open: day.open,
    slots: day.slots,
    message: !day.open ? 'We are closed on this day.' : anyFree ? null : 'No times are left on this day. Please choose another date.',
  };
}

async function idle(id, actor, ctx) {
  return withConversation(id, actor, async (c) => {
    if (!c.engine.isActive()) {
      c.engine.onText('Hi');
      return commit(c, [{ role: 'user', kind: 'text', text: 'Hi' }], ctx);
    }
    c.engine.idle();
    return commit(c, [], ctx);
  });
}

async function restart(id, actor, req) {
  const conv = await withLock(`conv:${id}`, async () => {
    const old = await loadConversation(id, actor);
    old.status = 'archived';
    await old.save();
    return old;
  });
  const bot = await botService.getById(conv.bot);
  const owner = await User.findById(conv.user);
  const fresh = await createConversation(owner, bot, prefsOf(conv, bot));
  await activityService.log('conversation_restarted', { user: conv.user, actor: actor._id, conversation: fresh._id, meta: { previous: conv._id.toString() }, req });
  return { bot: botService.publicView(bot), ...(await view(fresh, bot)) };
}

async function updatePreferences(id, actor, body, req) {
  return withLock(`conv:${id}`, async () => {
    const conv = await loadConversation(id, actor);
    if (body.timezone) conv.preferences.timezone = body.timezone;
    if (body.timeFormat) conv.preferences.timeFormat = body.timeFormat;
    await conv.save();
    await User.updateOne({ _id: conv.user }, { $set: { ...(body.timezone && { timezone: body.timezone }), ...(body.timeFormat && { timeFormat: body.timeFormat }) } });
    await activityService.log('preferences_updated', { user: conv.user, actor: actor._id, conversation: conv._id, meta: body, req });
    const bot = await botService.getById(conv.bot);
    const prefs = prefsOf(conv, bot);
    return { preferences: prefs, time: timeInfo(prefs.timezone, prefs.timeFormat) };
  });
}

async function remove(id, actor, req) {
  return withLock(`conv:${id}`, async () => {
    const conv = await loadConversation(id, actor);
    const keepNames = new Set(await Enquiry.distinct('attachments.storedName', { conversation: conv._id }));
    const names = await Message.distinct('file.storedName', { conversation: conv._id, 'file.storedName': { $ne: null } });
    await Message.deleteMany({ conversation: conv._id });
    await slotService.releaseHeld(conv._id);
    await conv.deleteOne();
    await fileService.remove(names.filter((n) => !keepNames.has(n))); // files attached to submitted enquiries stay
    await activityService.log('conversation_deleted', { user: conv.user, actor: actor._id, meta: { conversation: id }, req });
  });
}

module.exports = { submitDateTime, pickerInfo, pickerSlots, createConversation, startOrResume, getOne, listMessages, list, sendMessage, sendFiles, selectDate, idle, restart, updatePreferences, remove };
