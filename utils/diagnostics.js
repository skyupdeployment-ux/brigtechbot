'use strict';

/**
 * What the status page (/api/status) shows: is MSG91 reaching the bot, and what went wrong lately.
 * Everything is kept in memory (it starts again from zero whenever the bot restarts) and holds no secrets:
 * long numbers (phone numbers) are cut down to their last 2 digits before they are stored.
 */

const MAX_PROBLEMS = 8;
const state = { startedAt: Date.now(), accepted: 0, rejected: 0, lastAt: null, lastResult: null, problems: [] };

const mask = (s) => String(s).replace(/\d{6,}/g, (m) => `…${m.slice(-2)}`).replace(/\s+/g, ' ').trim().slice(0, 240);

/** A call from MSG91 reached the bot: accepted, or refused (and why). */
function inbound(accepted, why) {
  if (accepted) state.accepted += 1;
  else state.rejected += 1;
  state.lastAt = Date.now();
  state.lastResult = accepted ? 'accepted' : `rejected - ${why}`;
}

/** Called by the logger for every warning / error. */
function problem(level, text) {
  state.problems.unshift({ at: new Date().toISOString(), level, text: mask(text) });
  if (state.problems.length > MAX_PROBLEMS) state.problems.length = MAX_PROBLEMS;
}

const snapshot = () => ({
  minutesRunning: Math.round((Date.now() - state.startedAt) / 60000),
  accepted: state.accepted,
  rejected: state.rejected,
  lastAt: state.lastAt,
  secondsSinceLast: state.lastAt ? Math.round((Date.now() - state.lastAt) / 1000) : null,
  lastResult: state.lastResult,
  problems: state.problems.slice(),
});

module.exports = { inbound, problem, snapshot };
