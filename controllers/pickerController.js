'use strict';

const { DateTime } = require('luxon');
const conversationService = require('../services/conversationService');
const env = require('../config/env');
const slotRules = require('../utils/slots');
const whatsappService = require('../services/msg91/whatsappService');
const tokenService = require('../services/tokenService');
const { HTML, JS } = require('../services/pickerPage');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { ok } = require('../utils/response');

const noStore = (res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer'); // the token is in the address
  res.set('X-Robots-Tag', 'noindex');
};

const linkOf = (token) => {
  try {
    return tokenService.verifyPicker(String(token));
  } catch (_e) {
    throw AppError.forbidden('This link is not valid or has expired. Please use the newest message in WhatsApp.', 'INVALID_LINK');
  }
};

exports.page = (_req, res) => {
  noStore(res);
  res.type('html').send(HTML);
};

exports.script = (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.type('application/javascript').send(JS);
};

/**
 * Free-time mode (BOOKING_SLOTS=false): the customer picks ANY start time (like 9:25) and nobody guesses how long
 * the meeting will take. So only closed days (Sunday, holidays) are greyed out, never "full" days, and today
 * stays available until the notice time would carry it past midnight.
 */
function freeTimeInfo(info) {
  const cfg = env.booking;
  const tz = info.timezone;
  const now = DateTime.fromMillis(info.epochMs, { zone: tz });
  const unavailable = [];
  for (let d = DateTime.fromISO(info.minDate, { zone: tz }); d.toISODate() <= info.maxDate; d = d.plus({ days: 1 })) {
    if (!slotRules.isOpenDay(d.toISODate(), tz, cfg)) unavailable.push(d.toISODate());
  }
  const tooLateToday = now.plus({ minutes: info.minLeadMinutes || 0 }).toISODate() !== info.minDate;
  if (tooLateToday && !unavailable.includes(info.minDate)) unavailable.push(info.minDate);
  return { freeTime: true, unavailable };
}

exports.info = asyncHandler(async (req, res) => {
  noStore(res);
  const link = linkOf(req.params.token);
  const info = await conversationService.pickerInfo(link.cid, link.n);
  ok(res, info.slotMode ? info : { ...info, ...freeTimeInfo(info) });
});

exports.slots = asyncHandler(async (req, res) => {
  noStore(res);
  const link = linkOf(req.params.token);
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw AppError.unprocessable('Please send ?date=YYYY-MM-DD.', 'INVALID_DATE');
  ok(res, await conversationService.pickerSlots(link.cid, link.n, date));
});

exports.submit = asyncHandler(async (req, res) => {
  noStore(res);
  const link = linkOf(req.params.token);
  const result = await conversationService.submitDateTime(link.cid, link.n, req.body, { req });
  const saved = result.userMessages[0];
  ok(res, { saved: true, label: saved ? `${saved.text}` : '' }, 'Date and time saved');

  // The bot continues in the customer's WhatsApp chat (after the page has already been answered).
  const d = result.delivery;
  if (d && d.channel === 'whatsapp' && d.waNumber) {
    whatsappService.deliver(d.waNumber, result.botMessages).catch((e) => logger.error(`Could not send the next WhatsApp message: ${e.message}`));
  }
});
