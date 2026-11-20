'use strict';

const crypto = require('crypto');
const env = require('../config/env');
const whatsappService = require('../services/msg91/whatsappService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const diagnostics = require('../utils/diagnostics');

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

/** POST /api/webhooks/msg91?secret=...   (or header X-Webhook-Secret) */
exports.inbound = (req, res, next) => {
  if (!env.MSG91_ENABLED) {
    diagnostics.inbound(false, 'the WhatsApp channel is OFF (MSG91_ENABLED is not true)');
    return next(AppError.notFound('MSG91 channel is disabled', 'CHANNEL_DISABLED'));
  }

  let trusted = false;
  if (env.MSG91_WEBHOOK_SECRET) {
    const viaQuery = typeof req.query.secret === 'string' ? req.query.secret : '';
    const viaHeader = req.get('x-webhook-secret') || '';
    const given = (viaQuery || viaHeader).trim();
    if (!given || !safeEqual(given, env.MSG91_WEBHOOK_SECRET.trim())) {
      // Diagnostics only: lengths and header NAMES, never the secret itself.
      logger.warn(
        `MSG91 webhook 401: secret via ${viaQuery ? 'url' : viaHeader ? 'header' : 'NOTHING'}, ` +
          `received length ${given.length}, expected length ${env.MSG91_WEBHOOK_SECRET.trim().length}, ` +
          `headers received: ${Object.keys(req.headers).join(',')}`
      );
      diagnostics.inbound(false, 'the webhook secret is missing or wrong');
      return next(AppError.unauthorized('Invalid webhook secret', 'INVALID_WEBHOOK_SECRET'));
    }
    trusted = true;
  }

  // Only a request that proved the secret may tell us our public address (the Pick date calendar needs it).
  if (trusted && env.learnPublicAddress(req.get('x-forwarded-host') || req.get('host'))) {
    logger.info(`Public address learned from MSG91: ${env.PUBLIC_BASE_URL} (calendar ${env.DATETIME_PICKER ? 'ON' : 'OFF'})`);
  }

  diagnostics.inbound(true);
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
