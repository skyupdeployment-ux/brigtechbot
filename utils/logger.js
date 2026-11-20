'use strict';

const stamp = () => new Date().toISOString();
const write = (level, args) => {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${stamp()}] ${level.toUpperCase()}`, ...args);
  if (level === 'warn' || level === 'error') {
    try {
      require('./diagnostics').problem(level, args.map((a) => (a && a.message) || String(a)).join(' ')); // shown on /api/status
    } catch (_e) {
      /* never let diagnostics break logging */
    }
  }
};

module.exports = {
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  debug: (...a) => {
    if (process.env.NODE_ENV !== 'production') write('debug', a);
  },
};
