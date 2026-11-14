'use strict';

const router = require('express').Router();
const c = require('../controllers/authController');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const limiters = require('../middleware/rateLimiters');
const v = require('../validators');

router.post('/register-admin', limiters.auth, validate(v.registerAdmin), c.registerAdmin);
router.post('/login', limiters.auth, validate(v.login), c.login);
router.get('/me', authenticate, c.me);

module.exports = router;
