'use strict';

const service = require('../services/activityQueryService');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.user, req.query);
  ok(res, items, undefined, meta);
});
