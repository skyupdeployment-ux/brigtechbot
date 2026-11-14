'use strict';

const service = require('../services/bookingService');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.user, req.query);
  ok(res, items, undefined, meta);
});
exports.getOne = asyncHandler(async (req, res) => ok(res, await service.getOne(req.params.id, req.user)));
exports.update = asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body, req.user, req), 'Booking updated'));
exports.remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user, req);
  ok(res, null, 'Booking deleted');
});
