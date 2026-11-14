'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const whatsappService = require('../services/msg91/whatsappService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

/** POST /api/webhooks/msg91?secret=...   (or header X-Webhook-Secret) */
exports.inbound = (req, res, next) => {
  if (!env.MSG91_ENABLED) return next(AppError.notFound('MSG91 channel is disabled', 'CHANNEL_DISABLED'));

  if (env.MSG91_WEBHOOK_SECRET) {
    const given = req.query.secret || req.get('x-webhook-secret') || '';
    if (!given || !safeEqual(given, env.MSG91_WEBHOOK_SECRET)) return next(AppError.unauthorized('Invalid webhook secret', 'INVALID_WEBHOOK_SECRET'));
  }

  // Acknowledge immediately so MSG91 never times out / retries; process in the background.
  res.status(200).json({ success: true });
  whatsappService.handleWebhook(req.body).catch((e) => logger.error('MSG91 webhook crashed', e));
  return undefined;
};

exports.status = (_req, res) =>
  res.json({
    success: true,
    data: { enabled: env.MSG91_ENABLED, integratedNumber: env.MSG91_INTEGRATED_NUMBER ? `…${env.MSG91_INTEGRATED_NUMBER.slice(-4)}` : null, interactive: env.MSG91_INTERACTIVE, dryRun: env.MSG91_DRY_RUN },
  });
