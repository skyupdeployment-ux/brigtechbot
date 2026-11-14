'use strict';

const User = require('../models/User');
const tokenService = require('../services/tokenService');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const extractToken = (req) => {
  const h = req.headers.authorization || '';
  const [scheme, token] = h.split(' ');
  return scheme && scheme.toLowerCase() === 'bearer' && token ? token : null;
};

const loadUser = async (token) => {
  const payload = tokenService.verifyAccess(token);
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw AppError.unauthorized('Account not found or disabled', 'ACCOUNT_INVALID');
  return user;
};

const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw AppError.unauthorized();
  req.user = await loadUser(token);
  next();
});

/** Attaches req.user when a valid token is present; silently continues otherwise. */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = await loadUser(token);
    } catch (_e) {
      req.user = undefined;
    }
  }
  next();
});

const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) return next(AppError.forbidden());
  return next();
};

module.exports = { authenticate, optionalAuth, authorize };
