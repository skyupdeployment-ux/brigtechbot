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

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

const env = {
  NODE_ENV,
  isProd,
  PORT: toInt(process.env.PORT, 5000),
  MONGODB_URI: process.env.MONGODB_URI,
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
  SERVE_FRONTEND: toBool(process.env.SERVE_FRONTEND, true),

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

env.validate = () => {
  const problems = [];
  if (!env.MONGODB_URI) problems.push('MONGODB_URI is required.');
  if (!env.JWT_SECRET) problems.push('JWT_SECRET is required.');
  else if (env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters.');
  if (env.MSG91_ENABLED) {
    if (!env.MSG91_AUTH_KEY && !env.MSG91_DRY_RUN) problems.push('MSG91_AUTH_KEY is required when MSG91_ENABLED=true.');
    if (!env.MSG91_INTEGRATED_NUMBER) problems.push('MSG91_INTEGRATED_NUMBER is required when MSG91_ENABLED=true (digits with country code, no +).');
    if (isProd && env.MSG91_WEBHOOK_SECRET.length < 16) problems.push('MSG91_WEBHOOK_SECRET (16+ chars) is required in production.');
  }
  if (isProd && env.corsOrigins.includes('*')) problems.push('CORS_ORIGINS must not be "*" in production.');
  if (problems.length) {
    throw new Error('Invalid environment configuration:\n - ' + problems.join('\n - '));
  }
};

module.exports = env;
