'use strict';

const env = require('../config/env');
const { timeInfo, formatClock } = require('../utils/time');

module.exports = {
  now: (timezone = env.DEFAULT_TIMEZONE, format = env.DEFAULT_TIME_FORMAT) => timeInfo(timezone, format),
  clock: formatClock,
};
