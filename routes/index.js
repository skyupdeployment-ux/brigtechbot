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

// "version" changes whenever the WhatsApp code changes, so you can see which build is really running.
router.get('/health', (_req, res) =>
  ok(res, {
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    version: 'wa-file-fallback-v3',
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7) || null,
  })
);
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
