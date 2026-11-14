'use strict';

const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

exports.registerAdmin = asyncHandler(async (req, res) => {
  const { user, token } = await authService.registerAdmin(req.body, req.get('x-setup-key'), req);
  created(res, { user, token }, 'Admin account created');
});

exports.login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.body, req);
  ok(res, { user, token }, 'Logged in');
});

exports.me = asyncHandler(async (req, res) => ok(res, { user: req.user }));
