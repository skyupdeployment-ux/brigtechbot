'use strict';

const Joi = require('joi');
const env = require('../config/env');
const { isValidTimezone, DATE_KEY_RE } = require('../utils/time');

const tz = Joi.string().max(64).custom((v, h) => (isValidTimezone(v) ? v : h.message('must be a valid IANA timezone (e.g. Asia/Kolkata)')));
const timeFormat = Joi.string().valid('12h', '24h');
const dateKey = Joi.string().pattern(DATE_KEY_RE).message('must be in YYYY-MM-DD format');
const objectId = Joi.string().hex().length(24);
const password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/[A-Za-z]/)
  .pattern(/\d/)
  .message('must be 8-72 characters and contain at least one letter and one number');
const page = { page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(20) };
const isoDate = Joi.date().iso();

/* ---------------- auth ---------------- */
const registerAdmin = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).required(),
  password: password.required(),
});
const login = Joi.object({
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(1).max(72).required(),
});

/* ---------------- conversations ---------------- */
const startConversation = Joi.object({
  timezone: tz,
  timeFormat,
  botSlug: Joi.string().trim().lowercase().max(40),
});
const sendMessage = Joi.object({
  type: Joi.string().valid('text', 'choice').default('text'),
  text: Joi.string().trim().min(1).max(1000).required(),
  desc: Joi.string().trim().allow('').max(300),
  messageId: objectId, // the bot message a "choice" answers
});
const selectDate = Joi.object({ date: dateKey.required(), messageId: objectId });
const preferences = Joi.object({ timezone: tz, timeFormat }).min(1);
const listMessages = Joi.object({
  afterSeq: Joi.number().integer().min(-1).default(-1),
  limit: Joi.number().integer().min(1).max(500).default(500),
});
const listConversations = Joi.object({
  ...page,
  status: Joi.string().valid('active', 'ended', 'archived'),
  user: objectId,
});

/* ---------------- time ---------------- */
const timeQuery = Joi.object({ timezone: tz, format: timeFormat });

/* ---------------- enquiries / bookings ---------------- */
const listEnquiries = Joi.object({
  ...page,
  status: Joi.string().valid('new', 'in_progress', 'contacted', 'closed', 'cancelled'),
  category: Joi.string().valid('product', 'service', 'auto', 'robo', 'bms', 'career', 'contact'),
  channel: Joi.string().valid('web', 'whatsapp'),
  q: Joi.string().trim().max(100),
  from: isoDate,
  to: isoDate,
  sort: Joi.string().valid('createdAt', '-createdAt').default('-createdAt'),
});
const updateEnquiry = Joi.object({
  status: Joi.string().valid('new', 'in_progress', 'contacted', 'closed', 'cancelled'),
  adminNotes: Joi.string().trim().allow('').max(2000),
}).min(1);

const listBookings = Joi.object({
  ...page,
  status: Joi.string().valid('requested', 'confirmed', 'completed', 'cancelled'),
  timeSlot: Joi.string().valid('Morning', 'Afternoon', 'Evening', 'No preference'),
  from: dateKey,
  to: dateKey,
  sort: Joi.string().valid('date', '-date', 'createdAt', '-createdAt').default('-createdAt'),
  timezone: tz,
  timeFormat,
});
const updateBooking = Joi.object({
  dateKey: dateKey.allow(null),
  timeSlot: Joi.string().valid('Morning', 'Afternoon', 'Evening', 'No preference'),
  status: Joi.string().valid('requested', 'confirmed', 'completed', 'cancelled'),
}).min(1);

/* ---------------- activities ---------------- */
const listActivities = Joi.object({
  ...page,
  type: Joi.string(),
  user: objectId,
  conversation: objectId,
  from: isoDate,
  to: isoDate,
});

/* ---------------- users ---------------- */
const listUsers = Joi.object({
  ...page,
  role: Joi.string().valid('customer', 'admin'),
  q: Joi.string().trim().max(100),
});
const updateUser = Joi.object({
  name: Joi.string().trim().allow('').max(120),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).allow(''),
  phone: Joi.string().trim().pattern(/^[+\d\s-]{8,20}$/).allow('').message('must be a valid phone number'),
  company: Joi.string().trim().allow('').max(160),
  timezone: tz,
  timeFormat,
}).min(1);
const adminUpdateUser = updateUser.keys({
  isActive: Joi.boolean(),
  role: Joi.string().valid('customer', 'admin'),
  password: password,
});

/* ---------------- bots ---------------- */
const botBase = {
  name: Joi.string().trim().min(2).max(120),
  displayName: Joi.string().trim().min(2).max(120),
  subtitle: Joi.string().trim().max(120),
  description: Joi.string().trim().allow('').max(500),
  timezone: tz,
  timeFormat,
  bookingMaxDaysAhead: Joi.number().integer().min(7).max(365).default(env.BOOKING_MAX_DAYS_AHEAD),
  referencePrefix: Joi.string().trim().uppercase().pattern(/^[A-Z]{2,6}$/),
  isActive: Joi.boolean(),
};
const createBot = Joi.object({
  ...botBase,
  slug: Joi.string().trim().lowercase().pattern(/^[a-z0-9-]{2,40}$/).required(),
  name: botBase.name.required(),
  displayName: botBase.displayName.required(),
});
const updateBot = Joi.object({ ...botBase, bookingMaxDaysAhead: Joi.number().integer().min(7).max(365) }).min(1);

module.exports = {
  registerAdmin, login, startConversation, sendMessage, selectDate, preferences, listMessages, listConversations,
  timeQuery, listEnquiries, updateEnquiry, listBookings, updateBooking, listActivities,
  listUsers, updateUser, adminUpdateUser, createBot, updateBot,
};
