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

router.get('/health', (_req, res) => ok(res, { status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', uptime: process.uptime() }));
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
