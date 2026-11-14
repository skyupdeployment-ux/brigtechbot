'use strict';

const router = require('express').Router();
const c = require('../controllers/conversationController');
const { validate, validateObjectId } = require('../middleware/validate');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { uploadFiles } = require('../middleware/upload');
const limiters = require('../middleware/rateLimiters');
const v = require('../validators');

router.post('/', limiters.chat, optionalAuth, validate(v.startConversation), c.start);
router.get('/', authenticate, validate(v.listConversations, 'query'), c.list);

router.use('/:id', validateObjectId('id'));
router.get('/:id', authenticate, c.getOne);
router.delete('/:id', authenticate, c.remove);

router.get('/:id/messages', authenticate, validate(v.listMessages, 'query'), c.listMessages);
router.post('/:id/messages', limiters.chat, authenticate, validate(v.sendMessage), c.sendMessage);
router.post('/:id/files', limiters.upload, authenticate, uploadFiles, c.sendFiles);
router.post('/:id/date', limiters.chat, authenticate, validate(v.selectDate), c.selectDate);
router.post('/:id/idle', limiters.chat, authenticate, c.idle);
router.post('/:id/restart', limiters.chat, authenticate, c.restart);
router.patch('/:id/preferences', authenticate, validate(v.preferences), c.updatePreferences);

module.exports = router;
