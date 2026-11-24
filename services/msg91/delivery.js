'use strict';

/**
 * Delivery reports from MSG91 (the "On Outbound Report Received" webhook -> POST /api/webhooks/msg91/report).
 *
 * Why: the bot sends several messages in a row (Email card, WhatsApp card, Call card, buttons). MSG91 queues every
 * message separately, so with a fixed pause one of them can still overtake the others. A "sent" report means MSG91
 * has handed that message to WhatsApp; the bot sends the next message only after it, so the order cannot change.
 *
 * If the report webhook is not set up (or stops arriving) `healthy()` is false and the bot uses a fixed pause instead.
 */

const waiters = new Map(); // customer number -> set of messages that are waiting for their "sent" report
let lastReportAt = 0;
let received = 0;

const digits = (s) => String(s || '').replace(/\D/g, '');

/** A report arrived. A "sent" (handed to WhatsApp) or "failed" report ends the wait of the oldest waiting message. */
function report(number, status) {
  const n = digits(number);
  const st = String(status || '').toLowerCase();
  lastReportAt = Date.now();
  received += 1;
  if (st !== 'sent' && st !== 'failed') return; // delivered / read reports only prove that the webhook works
  const set = waiters.get(n);
  if (!set || !set.size) return;
  const [oldest] = set;
  set.delete(oldest);
  if (!set.size) waiters.delete(n);
  oldest.done();
}

/**
 * Call BEFORE sending a message to `number`; then `await handle.wait(ms)` after it was sent.
 * (Registering first means a very fast report can never be missed.)
 */
function expect(number) {
  const n = digits(number);
  let finish;
  const promise = new Promise((resolve) => {
    finish = resolve;
  });
  const entry = { done: () => finish(true) };
  if (!waiters.has(n)) waiters.set(n, new Set());
  waiters.get(n).add(entry);
  const remove = () => {
    const set = waiters.get(n);
    if (set) {
      set.delete(entry);
      if (!set.size) waiters.delete(n);
    }
  };
  return {
    /** true = MSG91 confirmed, false = nothing came in time */
    async wait(ms) {
      let timer;
      const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      });
      const result = await Promise.race([promise, timeout]);
      clearTimeout(timer);
      remove();
      return result;
    },
    cancel: remove,
  };
}

/** Reports have been arriving lately: the webhook in MSG91 is set up. */
const healthy = () => lastReportAt > 0 && Date.now() - lastReportAt < 10 * 60 * 1000;

const stats = () => ({ received, secondsSinceLast: lastReportAt ? Math.round((Date.now() - lastReportAt) / 1000) : null, healthy: healthy() });

const _reset = () => {
  waiters.clear();
  lastReportAt = 0;
  received = 0;
}; // for tests

module.exports = { report, expect, healthy, stats, _reset };
