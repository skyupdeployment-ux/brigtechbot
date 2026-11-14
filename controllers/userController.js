'use strict';

const service = require('../services/userService');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.query);
  ok(res, items, undefined, meta);
});
exports.me = asyncHandler(async (req, res) => ok(res, req.user.toJSON()));
exports.updateMe = asyncHandler(async (req, res) => ok(res, await service.update(req.user._id, req.body, req.user, req), 'Profile updated'));
exports.getOne = asyncHandler(async (req, res) => ok(res, (await service.getById(req.params.id)).toJSON()));
exports.update = asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body, req.user, req), 'User updated'));
exports.remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user, req);
  ok(res, null, 'User and related records deleted');
});
