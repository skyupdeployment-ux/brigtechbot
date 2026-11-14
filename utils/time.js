'use strict';

const { DateTime, IANAZone } = require('luxon');

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');

const isValidTimezone = (tz) => typeof tz === 'string' && tz.length > 0 && IANAZone.isValidZone(tz);

const nowIn = (tz) => DateTime.now().setZone(tz);

const toDateTime = (value, tz) => {
  const dt = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(String(value));
  return dt.setZone(tz);
};

/** '3:45 pm' (12h) or '15:45' (24h). Input is any Date/ISO instant; output is in `tz`. */
const formatClock = (value, tz, format = '12h') => {
  const dt = toDateTime(value, tz);
  if (!dt.isValid) return '';
  if (format === '24h') return `${pad(dt.hour)}:${pad(dt.minute)}`;
  const h = dt.hour % 12 || 12;
  return `${h}:${pad(dt.minute)} ${dt.hour < 12 ? 'am' : 'pm'}`;
};

const formatDateShort = (dt) => dt.setLocale('en').toFormat('ccc, d LLL'); // Mon, 17 Nov
const formatDateLong = (dt) => dt.setLocale('en').toFormat('cccc, d LLLL'); // Monday, 17 November
const formatDateFull = (dt) => dt.setLocale('en').toFormat('cccc, d LLLL yyyy');

/** Everything a client needs to show a correct, live clock. */
const timeInfo = (tz, format = '12h') => {
  const dt = nowIn(tz);
  return {
    utc: dt.toUTC().toISO(),
    epochMs: dt.toMillis(),
    timezone: tz,
    utcOffset: dt.toFormat('ZZ'),
    timeFormat: format,
    displayTime: format === '24h' ? dt.toFormat('HH:mm:ss') : `${dt.hour % 12 || 12}:${pad(dt.minute)}:${pad(dt.second)} ${dt.hour < 12 ? 'am' : 'pm'}`,
    displayDate: formatDateFull(dt),
    dateKey: dt.toISODate(),
  };
};

/**
 * Validate a YYYY-MM-DD booking date in a timezone.
 * minOffsetDays = 1 means "from tomorrow"; 0 means "from today".
 */
const validateBookingDate = (key, tz, { minOffsetDays = 1, maxDays = 90 } = {}) => {
  const bad = (code, message) => ({ error: { code, message } });
  if (typeof key !== 'string' || !DATE_KEY_RE.test(key)) {
    return bad('INVALID_DATE', 'Date must be in YYYY-MM-DD format.');
  }
  const dt = DateTime.fromISO(key, { zone: tz });
  if (!dt.isValid) return bad('INVALID_DATE', 'That is not a real calendar date.');

  const today = nowIn(tz).startOf('day');
  const min = today.plus({ days: minOffsetDays });
  const max = today.plus({ days: maxDays });
  if (dt < min) {
    return bad(
      'DATE_IN_PAST',
      minOffsetDays >= 1 ? 'Please choose a date from tomorrow onwards.' : 'The date cannot be in the past.'
    );
  }
  if (dt > max) return bad('DATE_TOO_FAR', `Please choose a date within the next ${maxDays} days.`);

  return {
    ok: true,
    dateKey: key,
    label: formatDateShort(dt),
    desc: formatDateLong(dt),
    utc: dt.startOf('day').toUTC().toJSDate(), // local midnight stored as a UTC instant
    min: min.toISODate(),
    max: max.toISODate(),
  };
};

module.exports = {
  DATE_KEY_RE,
  isValidTimezone,
  nowIn,
  formatClock,
  formatDateShort,
  formatDateLong,
  formatDateFull,
  timeInfo,
  validateBookingDate,
};
