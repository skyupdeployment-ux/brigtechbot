'use strict';

const router = require('express').Router();
const mongoose = require('mongoose');
const timeController = require('../controllers/timeController');
const activityController = require('../controllers/activityController');
const fileController = require('../controllers/fileController');
const { optionalAuth, authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators');
const { ok } = require('../utils/response');
const env = require('../config/env');
const diagnostics = require('../utils/diagnostics');
const delivery = require('../services/msg91/delivery');

// "version" changes whenever the WhatsApp code changes, so you can see which build is really running.
router.get('/health', (_req, res) =>
  ok(res, {
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    version: env.VERSION,
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    calendar: !!(env.DATETIME_PICKER && env.PUBLIC_BASE_URL), // true = customers get the Pick date calendar
  })
);
/**
 * A page anyone can open to see what is happening with WhatsApp: is MSG91 reaching the bot, is the channel on,
 * and the latest warnings. It shows no secrets and phone numbers are cut down to their last 2 digits.
 */
router.get('/status', (_req, res) => {
  const d = diagnostics.snapshot();
  let summary;
  if (!env.MSG91_ENABLED) summary = 'The WhatsApp channel is OFF. In Railway Variables set MSG91_ENABLED = true, then Deploy.';
  else if (env.MSG91_DRY_RUN) summary = 'DRY RUN is ON: the bot only writes its replies to the log and sends nothing. Delete the variable MSG91_DRY_RUN in Railway, then Deploy.';
  else if (!d.lastAt) summary = `No call from MSG91 has reached the bot in the ${d.minutesRunning} minutes since it started. Check the MSG91 webhook: it must be Enabled, with the event On Inbound Request Received and the address ${env.PUBLIC_BASE_URL || 'https://<your-bot>'}/api/webhooks/msg91`;
  else if (d.lastResult !== 'accepted') summary = `MSG91 is calling the bot but the bot refused the call (${d.lastResult}). The last call was ${d.secondsSinceLast} seconds ago. ${d.lastResult.includes('secret') ? 'In MSG91 the header X-Webhook-Secret must be exactly the value of MSG91_WEBHOOK_SECRET in Railway.' : ''}`.trim();
  else summary = `OK: the last call from MSG91 was accepted ${d.secondsSinceLast} seconds ago. If the bot still did not answer, read recentProblems below: it says why.`;
  ok(res, {
    summary,
    bot: { version: env.VERSION, database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', minutesRunning: d.minutesRunning },
    whatsappChannel: {
      enabled: env.MSG91_ENABLED,
      dryRun: env.MSG91_DRY_RUN,
      interactiveMessages: env.MSG91_INTERACTIVE,
      integratedNumber: env.MSG91_INTEGRATED_NUMBER ? `…${env.MSG91_INTEGRATED_NUMBER.slice(-4)}` : null,
      webhookSecretSet: !!env.MSG91_WEBHOOK_SECRET,
      publicAddress: env.PUBLIC_BASE_URL || null,
    },
    enquiryStyle: require('../utils/contact').singleStyle() ? 'single (one message per enquiry)' : 'cards (one message per card)',
    webhook: { accepted: d.accepted, rejected: d.rejected, lastResult: d.lastResult, secondsSinceLast: d.secondsSinceLast },
    // MSG91's delivery reports (second webhook): when they arrive, every message waits for the one before it
    deliveryReports: { ...delivery.stats(), ordering: delivery.healthy() ? 'each message waits until MSG91 confirms the one before it' : 'fixed pause between messages (the report webhook is not set up in MSG91, or no report arrived in the last 10 minutes)' },
    recentProblems: d.problems,
  });
});
router.get('/time', optionalAuth, validate(v.timeQuery, 'query'), timeController.now);
router.get('/activities', authenticate, validate(v.listActivities, 'query'), activityController.list);
router.get('/files/:name', fileController.download);

router.use('/auth', require('./authRoutes'));
router.use('/bots', require('./botRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/conversations', require('./conversationRoutes'));
router.use('/enquiries', require('./enquiryRoutes'));
router.use('/bookings', require('./bookingRoutes'));
router.use('/webhooks', require('./webhookRoutes'));

module.exports = router;
