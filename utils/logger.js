'use strict';

const stamp = () => new Date().toISOString();
const write = (level, args) => {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${stamp()}] ${level.toUpperCase()}`, ...args);
};

module.exports = {
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  debug: (...a) => {
    if (process.env.NODE_ENV !== 'production') write('debug', a);
  },
};
