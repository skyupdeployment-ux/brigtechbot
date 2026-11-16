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

const zoneAbbr = (dt) => {
  const n = dt.setLocale('en-IN').offsetNameShort;
  if (n && !/^(GMT|UTC)[+-]/.test(n)) return n;
  return dt.zoneName === 'Asia/Kolkata' ? 'IST' : n || dt.zoneName;
};
/** "Mon 16 Nov 2026, 11:02 PM (IST)" */
const formatNowLine = (tz) => {
  const dt = nowIn(tz);
  return `${dt.setLocale('en').toFormat('ccc d LLL yyyy')}, ${dt.setLocale('en').toFormat('h:mm a')} (${zoneAbbr(dt)})`;
};
/** "Tuesday, 17 November 2026" and "5:58 PM (IST)" for a local date + HH:mm */
const formatPicked = (dateKey, time24, tz) => {
  const dt = DateTime.fromISO(`${dateKey}T${time24}`, { zone: tz });
  return { date: dt.setLocale('en').toFormat('cccc, d LLLL yyyy'), time: `${dt.setLocale('en').toFormat('h:mm a')} (${zoneAbbr(dt)})`, short: dt.setLocale('en').toFormat('ccc, d LLL yyyy'), time12: dt.setLocale('en').toFormat('h:mm a') };
};
const slotOfHour = (h) => (h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening');
/** "17/11/2026 5:30 PM", "17-11-2026 17:30" -> { dateKey, time } or null */
const parseTypedDateTime = (text) => {
  const m = String(text).trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[\s,T]+(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?$/i);
  if (!m) return null;
  let h = +m[4];
  const min = m[5] ? +m[5] : 0;
  if (m[6]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[6].toLowerCase() === 'p' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  const pad2 = (n) => String(n).padStart(2, '0');
  return { dateKey: `${m[3]}-${pad2(+m[2])}-${pad2(+m[1])}`, time: `${pad2(h)}:${pad2(min)}` };
};

module.exports = {
  zoneAbbr,
  formatNowLine,
  formatPicked,
  slotOfHour,
  parseTypedDateTime,
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
