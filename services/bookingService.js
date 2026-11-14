'use strict';

const { DateTime } = require('luxon');
const Booking = require('../models/Booking');
const Bot = require('../models/Bot');
const Enquiry = require('../models/Enquiry');
const activityService = require('./activityService');
const serializers = require('../utils/serializers');
const AppError = require('../utils/AppError');
const { validateBookingDate } = require('../utils/time');
const { parsePagination, buildMeta } = require('../utils/pagination');

const isAdmin = (actor) => actor.role === 'admin';

async function list(actor, query) {
  const p = parsePagination(query);
  const filter = {};
  if (!isAdmin(actor)) filter.user = actor._id;
  if (query.status) filter.status = query.status;
  if (query.timeSlot) filter.timeSlot = query.timeSlot;
  if (query.from || query.to) {
    filter.dateKey = {};
    if (query.from) filter.dateKey.$gte = query.from;
    if (query.to) filter.dateKey.$lte = query.to;
  }
  const sortMap = { date: { date: 1 }, '-date': { date: -1 }, createdAt: { createdAt: 1 }, '-createdAt': { createdAt: -1 } };
  const [items, total] = await Promise.all([
    Booking.find(filter).sort(sortMap[query.sort] || sortMap['-createdAt']).skip(p.skip).limit(p.limit),
    Booking.countDocuments(filter),
  ]);
  const prefs = { timezone: query.timezone || actor.timezone, timeFormat: query.timeFormat || actor.timeFormat };
  return { items: items.map((b) => serializers.booking(b, prefs)), meta: { ...buildMeta(p, total), displayTimezone: prefs.timezone, displayTimeFormat: prefs.timeFormat } };
}

async function load(id, actor) {
  const booking = await Booking.findById(id);
  if (!booking) throw AppError.notFound('Booking not found', 'BOOKING_NOT_FOUND');
  if (!isAdmin(actor) && booking.user.toString() !== actor._id.toString()) throw AppError.forbidden();
  return booking;
}

async function getOne(id, actor) {
  const booking = await load(id, actor);
  return serializers.booking(booking, { timezone: actor.timezone, timeFormat: actor.timeFormat });
}

async function update(id, body, actor, req) {
  const booking = await load(id, actor);
  const admin = isAdmin(actor);

  if (!admin) {
    if (booking.status !== 'requested') throw AppError.conflict('This booking can no longer be changed.', 'BOOKING_LOCKED');
    if (body.status !== undefined && body.status !== 'cancelled') throw AppError.forbidden('You can only cancel a booking.');
  }

  if (body.dateKey !== undefined) {
    if (body.dateKey === null) {
      booking.dateKey = null;
      booking.date = null;
      booking.dateLabel = 'No preference';
    } else {
      const bot = await Bot.findById(booking.bot).select('bookingMaxDaysAhead');
      const v = validateBookingDate(body.dateKey, booking.timezone, {
        minOffsetDays: admin ? 0 : 1,
        maxDays: (bot && bot.bookingMaxDaysAhead) || 90,
      });
      if (v.error) throw AppError.unprocessable(v.error.message, v.error.code);
      booking.dateKey = v.dateKey;
      booking.date = DateTime.fromISO(v.dateKey, { zone: booking.timezone }).startOf('day').toUTC().toJSDate();
      booking.dateLabel = v.label;
    }
  }
  if (body.timeSlot !== undefined) booking.timeSlot = body.timeSlot;
  if (body.status !== undefined) booking.status = body.status;
  await booking.save();

  await activityService.log('booking_updated', { user: booking.user, actor: actor._id, conversation: booking.conversation, enquiry: booking.enquiry, meta: body, req });
  return serializers.booking(booking, { timezone: actor.timezone, timeFormat: actor.timeFormat });
}

async function remove(id, actor, req) {
  const booking = await load(id, actor);
  if (!isAdmin(actor) && booking.status !== 'requested') throw AppError.conflict('This booking can no longer be deleted.', 'BOOKING_LOCKED');
  await booking.deleteOne();
  await Enquiry.updateOne({ _id: booking.enquiry }, { $set: { updatedAt: new Date() } });
  await activityService.log('booking_deleted', { user: booking.user, actor: actor._id, conversation: booking.conversation, enquiry: booking.enquiry, req });
}

module.exports = { list, getOne, update, remove };
