'use strict';

const timeService = require('../services/timeService');
const { ok } = require('../utils/response');
const env = require('../config/env');

// Live server clock. The UI uses epochMs to correct for a wrong device clock.
exports.now = (req, res) => {
  const timezone = req.query.timezone || (req.user && req.user.timezone) || env.DEFAULT_TIMEZONE;
  const format = req.query.format || (req.user && req.user.timeFormat) || env.DEFAULT_TIME_FORMAT;
  ok(res, timeService.now(timezone, format));
};
