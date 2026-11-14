'use strict';

const router = require('express').Router();
const c = require('../controllers/msg91Controller');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/msg91', c.inbound);                                   // MSG91 -> us (secret protected)
router.get('/msg91/status', authenticate, authorize('admin'), c.status); // admin: is the channel configured?

module.exports = router;
