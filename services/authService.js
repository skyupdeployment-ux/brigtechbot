'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const env = require('../config/env');
const tokenService = require('./tokenService');
const activityService = require('./activityService');
const AppError = require('../utils/AppError');

// Used to keep login timing similar whether or not the e-mail exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

async function registerAdmin({ name, email, password }, setupKey, req) {
  if (!env.ADMIN_SETUP_KEY) throw AppError.forbidden('Admin registration is disabled (ADMIN_SETUP_KEY is not set).', 'REGISTRATION_DISABLED');
  if (!setupKey || !safeEqual(setupKey, env.ADMIN_SETUP_KEY)) throw AppError.forbidden('Invalid setup key', 'INVALID_SETUP_KEY');

  const exists = await User.exists({ role: 'admin', email });
  if (exists) throw AppError.conflict('An admin with this email already exists', 'DUPLICATE');

  const user = await User.create({ role: 'admin', name, email, password });
  await activityService.log('admin_registered', { user: user._id, req });
  return { user, token: tokenService.signAccess(user) };
}

async function login({ email, password }, req) {
  const user = await User.findOne({ role: 'admin', email }).select('+password');
  const ok = user ? await user.comparePassword(password) : await bcrypt.compare(password, DUMMY_HASH).then(() => false);
  if (!user || !ok || !user.isActive) throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

  await User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } });
  await activityService.log('admin_login', { user: user._id, req });
  return { user, token: tokenService.signAccess(user) };
}

module.exports = { registerAdmin, login };
