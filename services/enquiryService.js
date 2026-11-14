'use strict';

const Enquiry = require('../models/Enquiry');
const Booking = require('../models/Booking');
const activityService = require('./activityService');
const fileService = require('./fileService');
const serializers = require('../utils/serializers');
const AppError = require('../utils/AppError');
const { escapeRegex } = require('../utils/text');
const { parsePagination, buildMeta } = require('../utils/pagination');

const prefsFor = (actor) => ({ timezone: actor.timezone, timeFormat: actor.timeFormat });
const isAdmin = (actor) => actor.role === 'admin';

async function list(actor, query, { onlyMine = false } = {}) {
  const p = parsePagination(query);
  const filter = {};
  if (onlyMine || !isAdmin(actor)) filter.user = actor._id;
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.channel) filter.channel = query.channel;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ reference: rx }, { contactName: rx }, { contactPhone: rx }, { companyName: rx }, { flowName: rx }];
  }
  const sort = query.sort === 'createdAt' ? { createdAt: 1 } : { createdAt: -1 };
  const [items, total] = await Promise.all([
    Enquiry.find(filter).sort(sort).skip(p.skip).limit(p.limit),
    Enquiry.countDocuments(filter),
  ]);
  const bookings = await Booking.find({ enquiry: { $in: items.map((e) => e._id) } });
  const byEnquiry = new Map(bookings.map((b) => [b.enquiry.toString(), b]));
  const prefs = prefsFor(actor);
  return {
    items: items.map((e) => serializers.enquiry(e, byEnquiry.get(e._id.toString()) || null, prefs)),
    meta: buildMeta(p, total),
  };
}

async function load(id, actor) {
  const enquiry = await Enquiry.findById(id);
  if (!enquiry) throw AppError.notFound('Enquiry not found', 'ENQUIRY_NOT_FOUND');
  if (!isAdmin(actor) && enquiry.user.toString() !== actor._id.toString()) throw AppError.forbidden();
  return enquiry;
}

async function getOne(id, actor) {
  const enquiry = await load(id, actor);
  const booking = await Booking.findOne({ enquiry: enquiry._id });
  return serializers.enquiry(enquiry, booking, prefsFor(actor));
}

async function update(id, body, actor, req) {
  const enquiry = await load(id, actor);
  if (body.status !== undefined) enquiry.status = body.status;
  if (body.adminNotes !== undefined) enquiry.adminNotes = body.adminNotes;
  await enquiry.save();
  if (body.status === 'cancelled') await Booking.updateOne({ enquiry: enquiry._id }, { $set: { status: 'cancelled' } });
  await activityService.log('enquiry_updated', { user: enquiry.user, actor: actor._id, enquiry: enquiry._id, conversation: enquiry.conversation, meta: body, req });
  const booking = await Booking.findOne({ enquiry: enquiry._id });
  return serializers.enquiry(enquiry, booking, prefsFor(actor));
}

async function remove(id, actor, req) {
  const enquiry = await load(id, actor);
  await Booking.deleteMany({ enquiry: enquiry._id });
  await enquiry.deleteOne();
  await fileService.remove((enquiry.attachments || []).map((a) => a.storedName));
  await activityService.log('enquiry_deleted', { user: enquiry.user, actor: actor._id, conversation: enquiry.conversation, meta: { reference: enquiry.reference }, req });
}

module.exports = { list, getOne, update, remove };
