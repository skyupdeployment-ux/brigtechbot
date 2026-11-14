'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { fail } = require('../utils/response');

const make = (max, windowMs, message) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => fail(res, 429, 'RATE_LIMITED', message),
  });

module.exports = {
  global: make(env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS, 'Too many requests. Please slow down.'),
  auth: make(env.AUTH_RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS, 'Too many authentication attempts. Try again later.'),
  chat: make(env.CHAT_RATE_LIMIT_MAX, 60 * 1000, 'You are sending messages too quickly.'),
  upload: make(env.UPLOAD_RATE_LIMIT_MAX, 60 * 1000, 'Too many uploads. Please wait a moment.'),
};
