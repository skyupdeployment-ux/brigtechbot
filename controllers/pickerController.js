'use strict';

const conversationService = require('../services/conversationService');
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

exports.info = asyncHandler(async (req, res) => {
  noStore(res);
  const link = linkOf(req.params.token);
  ok(res, await conversationService.pickerInfo(link.cid, link.n));
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
