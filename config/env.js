'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};
const toBool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

// Railway tells every service its own public address; with it the calendar needs no extra setting.
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
  (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL.replace(/^https?:\/\//, '')}` : '')
).replace(/\/$/, '');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

const env = {
  NODE_ENV,
  isProd,
  PORT: toInt(process.env.PORT, 5000),
  // Railway's MongoDB service exposes MONGO_URL; Atlas users set MONGODB_URI.
  MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URL,
  // Used when the URI has no database name (Railway's URL has none).
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || '',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  FILE_URL_TTL_SECONDS: toInt(process.env.FILE_URL_TTL_SECONDS, 3600),
  ADMIN_SETUP_KEY: process.env.ADMIN_SETUP_KEY || '',
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  TRUST_PROXY: toInt(process.env.TRUST_PROXY, 0),
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  DEFAULT_TIME_FORMAT: process.env.DEFAULT_TIME_FORMAT === '24h' ? '24h' : '12h',
  BOOKING_MAX_DAYS_AHEAD: toInt(process.env.BOOKING_MAX_DAYS_AHEAD, 90),
  DEFAULT_BOT_SLUG: process.env.DEFAULT_BOT_SLUG || 'brightech',
  REFERENCE_PREFIX: (process.env.REFERENCE_PREFIX || 'BT').toUpperCase(),
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')),
  MAX_FILE_SIZE_MB: toInt(process.env.MAX_FILE_SIZE_MB, 25),
  MAX_FILES_PER_REQUEST: toInt(process.env.MAX_FILES_PER_REQUEST, 10),
  RATE_LIMIT_WINDOW_MS: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  RATE_LIMIT_MAX: toInt(process.env.RATE_LIMIT_MAX, 600),
  AUTH_RATE_LIMIT_MAX: toInt(process.env.AUTH_RATE_LIMIT_MAX, 20),
  CHAT_RATE_LIMIT_MAX: toInt(process.env.CHAT_RATE_LIMIT_MAX, 60),
  UPLOAD_RATE_LIMIT_MAX: toInt(process.env.UPLOAD_RATE_LIMIT_MAX, 30),
  SERVE_FRONTEND: toBool(process.env.SERVE_FRONTEND, false),

  // ---- "Pick date and time" web picker (opened from a WhatsApp button) ----
  // ON by itself whenever the server knows its public address (set DATETIME_PICKER=false to turn the calendar off).
  DATETIME_PICKER: toBool(process.env.DATETIME_PICKER, !!PUBLIC_BASE_URL),
  PICKER_MIN_LEAD_MINUTES: toInt(process.env.PICKER_MIN_LEAD_MINUTES, 30),
  PICKER_LINK_HOURS: toInt(process.env.PICKER_LINK_HOURS, 24),
  // Public https address of this server (PUBLIC_BASE_URL, or detected from Railway).
  PUBLIC_BASE_URL,

  // ---- Meeting slots (used by the "Pick date and time" page) ----
  // A meeting of BOOKING_MEETING_MINUTES blocks that time PLUS BOOKING_BUFFER_MINUTES, so a meeting that
  // runs over (10:00-10:30 going on to 10:40) never collides with the next customer.
  BOOKING_SLOTS: toBool(process.env.BOOKING_SLOTS, true), // false = any exact time is accepted (old behaviour)
  BOOKING_DAY_START: (process.env.BOOKING_DAY_START || '10:00').trim(), // first meeting starts at
  BOOKING_DAY_END: (process.env.BOOKING_DAY_END || '18:00').trim(), // every meeting must END by
  BOOKING_SLOT_MINUTES: toInt(process.env.BOOKING_SLOT_MINUTES, 30), // distance between start times
  BOOKING_MEETING_MINUTES: toInt(process.env.BOOKING_MEETING_MINUTES, toInt(process.env.BOOKING_SLOT_MINUTES, 30)),
  BOOKING_BUFFER_MINUTES: toInt(process.env.BOOKING_BUFFER_MINUTES, 15),
  BOOKING_WORKDAYS: (process.env.BOOKING_WORKDAYS || '1,2,3,4,5,6') // 0 = Sunday ... 6 = Saturday
    .split(',')
    .map((x) => parseInt(x, 10))
    .filter((n) => n >= 0 && n <= 6),
  BOOKING_CLOSED_DATES: (process.env.BOOKING_CLOSED_DATES || '') // holidays, e.g. 2026-11-19,2026-12-25
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
  BOOKING_CAPACITY: Math.max(1, toInt(process.env.BOOKING_CAPACITY, 1)), // meetings at the same time
  BOOKING_HOLD_MINUTES: Math.max(5, toInt(process.env.BOOKING_HOLD_MINUTES, 30)), // a chosen slot is kept this long until confirmed

  // ---- MSG91 WhatsApp channel ----
  MSG91_ENABLED: toBool(process.env.MSG91_ENABLED, false),
  MSG91_AUTH_KEY: process.env.MSG91_AUTH_KEY || '',
  MSG91_INTEGRATED_NUMBER: (process.env.MSG91_INTEGRATED_NUMBER || '').replace(/\D/g, ''),
  MSG91_WEBHOOK_SECRET: process.env.MSG91_WEBHOOK_SECRET || '',
  MSG91_BASE_URL: (process.env.MSG91_BASE_URL || 'https://control.msg91.com').replace(/\/$/, ''),
  MSG91_SEND_PATH: process.env.MSG91_SEND_PATH || '/api/v5/whatsapp/whatsapp-outbound-message/',
  MSG91_INTERACTIVE: toBool(process.env.MSG91_INTERACTIVE, true), // false = always plain-text menus
  MSG91_DRY_RUN: toBool(process.env.MSG91_DRY_RUN, false), // log instead of sending
  MSG91_LOG_RAW: toBool(process.env.MSG91_LOG_RAW, false), // log every raw inbound webhook body
  MSG91_TIMEOUT_MS: toInt(process.env.MSG91_TIMEOUT_MS, 15000),
  MSG91_SEND_GAP_MS: toInt(process.env.MSG91_SEND_GAP_MS, 300),
  MSG91_MEDIA_HOSTS: (process.env.MSG91_MEDIA_HOSTS || 'files.msg91.com,msg91.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  MSG91_MEDIA_ALLOW_HTTP: toBool(process.env.MSG91_MEDIA_ALLOW_HTTP, false),
};

env.VERSION = 'wa-slots-v6';
env.PUBLIC_BASE_URL_EXPLICIT = !!process.env.PUBLIC_BASE_URL; // typed in by hand (never overridden)
env.DATETIME_PICKER_EXPLICIT = process.env.DATETIME_PICKER !== undefined && process.env.DATETIME_PICKER !== '';

/**
 * The bot learns its own public address from a message MSG91 sends it (the request is authenticated by the
 * webhook secret, so the address it arrived on is the live one). That switches the calendar on with no settings.
 * Returns true when the address changed.
 */
env.learnPublicAddress = (host) => {
  if (env.PUBLIC_BASE_URL_EXPLICIT) return false;
  const h = String(host || '').split(',')[0].trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d+)?$/.test(h) || /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.)/.test(h)) return false;
  const url = `https://${h}`;
  if (env.PUBLIC_BASE_URL === url) return false;
  env.PUBLIC_BASE_URL = url;
  if (!env.DATETIME_PICKER_EXPLICIT) env.DATETIME_PICKER = true;
  return true;
};

env.booking = {
  enabled: env.BOOKING_SLOTS,
  start: env.BOOKING_DAY_START,
  end: env.BOOKING_DAY_END,
  slot: env.BOOKING_SLOT_MINUTES,
  meeting: env.BOOKING_MEETING_MINUTES,
  buffer: env.BOOKING_BUFFER_MINUTES,
  workdays: env.BOOKING_WORKDAYS,
  closed: env.BOOKING_CLOSED_DATES,
  capacity: env.BOOKING_CAPACITY,
  holdMinutes: env.BOOKING_HOLD_MINUTES,
};

env.validate = () => {
  const problems = [];
  if (!env.MONGODB_URI) problems.push('MONGODB_URI (or MONGO_URL) is required.');
  if (!env.JWT_SECRET) problems.push('JWT_SECRET is required.');
  else if (env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters.');
  if (env.MSG91_ENABLED) {
    if (!env.MSG91_AUTH_KEY && !env.MSG91_DRY_RUN) problems.push('MSG91_AUTH_KEY is required when MSG91_ENABLED=true.');
    if (!env.MSG91_INTEGRATED_NUMBER) problems.push('MSG91_INTEGRATED_NUMBER is required when MSG91_ENABLED=true (digits with country code, no +).');
    if (isProd && env.MSG91_WEBHOOK_SECRET.length < 16) problems.push('MSG91_WEBHOOK_SECRET (16+ chars) is required in production.');
  }
  if (env.BOOKING_SLOTS) {
    const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!hm.test(env.BOOKING_DAY_START) || !hm.test(env.BOOKING_DAY_END)) problems.push('BOOKING_DAY_START / BOOKING_DAY_END must look like 10:00 and 18:00 (24-hour HH:MM).');
    else if (env.BOOKING_DAY_END <= env.BOOKING_DAY_START) problems.push('BOOKING_DAY_END must be later than BOOKING_DAY_START.');
    if (env.BOOKING_SLOT_MINUTES < 5 || env.BOOKING_MEETING_MINUTES < 5) problems.push('BOOKING_SLOT_MINUTES and BOOKING_MEETING_MINUTES must be at least 5.');
    if (env.BOOKING_BUFFER_MINUTES < 0) problems.push('BOOKING_BUFFER_MINUTES cannot be negative.');
    if (!env.BOOKING_WORKDAYS.length) problems.push('BOOKING_WORKDAYS needs at least one day, e.g. 1,2,3,4,5,6 (0 = Sunday).');
    if (env.BOOKING_CLOSED_DATES.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) problems.push('BOOKING_CLOSED_DATES must be YYYY-MM-DD dates separated by commas.');
  }
  if (env.DATETIME_PICKER && !env.PUBLIC_BASE_URL) problems.push('DATETIME_PICKER=true needs PUBLIC_BASE_URL (your https address), e.g. https://your-app.up.railway.app');
  if (isProd && env.corsOrigins.includes('*')) problems.push('CORS_ORIGINS must not be "*" in production.');
  if (problems.length) {
    throw new Error('Invalid environment configuration:\n - ' + problems.join('\n - '));
  }
};

module.exports = env;
