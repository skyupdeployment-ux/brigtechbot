'use strict';

/**
 * Meeting-slot rules (pure functions, no database).
 *
 *  - Start times are fixed: day start, then every `slot` minutes, as long as the meeting still ENDS by the day end.
 *  - A booking blocks the meeting PLUS the buffer, in whole `slot` cells. With 30-minute slots, a 30-minute meeting
 *    and a 15-minute buffer, a booking at 10:00 blocks 10:00 and 10:30, so the next start is 11:00.
 */

const { DateTime } = require('luxon');

const pad = (n) => String(n).padStart(2, '0');
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** How many `slot` cells one booking blocks (meeting + buffer, rounded up). */
const blockCells = (cfg) => Math.max(1, Math.ceil((cfg.meeting + cfg.buffer) / cfg.slot));

const isOpenDay = (dateKey, tz, cfg) => {
  const dt = DateTime.fromISO(String(dateKey), { zone: tz });
  if (!dt.isValid) return false;
  if (cfg.closed.includes(dt.toISODate())) return false;
  return cfg.workdays.includes(dt.weekday % 7); // luxon: Monday = 1 ... Sunday = 7 -> Sunday = 0
};

/** Every start time of a normal day, as "HH:mm" (24h). */
const startTimes = (cfg) => {
  const out = [];
  const last = toMinutes(cfg.end) - cfg.meeting;
  for (let t = toMinutes(cfg.start); t <= last; t += cfg.slot) out.push(toHHMM(t));
  return out;
};

/** [{ time: '10:00', startsAt: Date(UTC) }] for a date; [] when closed. */
const slotsForDate = (dateKey, tz, cfg) => {
  if (!isOpenDay(dateKey, tz, cfg)) return [];
  return startTimes(cfg).map((time) => ({ time, startsAt: DateTime.fromISO(`${dateKey}T${time}`, { zone: tz }).toUTC().toJSDate() }));
};

/** The `slot`-minute cells (start instants) a booking starting at `startsAt` blocks. */
const cellsOf = (startsAt, cfg) =>
  Array.from({ length: blockCells(cfg) }, (_v, i) => new Date(new Date(startsAt).getTime() + i * cfg.slot * 60000));

const isValidStart = (dateKey, time24, tz, cfg) => isOpenDay(dateKey, tz, cfg) && startTimes(cfg).includes(String(time24));

/** "5:00 PM" */
const label12 = (time24) => {
  const [h, m] = time24.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};

module.exports = { blockCells, isOpenDay, startTimes, slotsForDate, cellsOf, isValidStart, label12, toMinutes };
