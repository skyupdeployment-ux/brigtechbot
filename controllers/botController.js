'use strict';

const Bot = require('../models/Bot');
const botService = require('../services/botService');
const activityService = require('../services/activityService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { parsePagination, buildMeta } = require('../utils/pagination');
const env = require('../config/env');

exports.publicConfig = asyncHandler(async (req, res) => {
  const bot = await botService.getActiveBySlug(req.query.slug || env.DEFAULT_BOT_SLUG);
  ok(res, botService.publicView(bot));
});

exports.list = asyncHandler(async (req, res) => {
  const p = parsePagination(req.query);
  const [items, total] = await Promise.all([Bot.find().sort({ createdAt: -1 }).skip(p.skip).limit(p.limit), Bot.countDocuments()]);
  ok(res, items, undefined, buildMeta(p, total));
});

exports.getOne = asyncHandler(async (req, res) => ok(res, await botService.getById(req.params.id)));

exports.create = asyncHandler(async (req, res) => {
  const bot = await Bot.create(req.body);
  await activityService.log('bot_created', { actor: req.user._id, meta: { slug: bot.slug }, req });
  created(res, bot, 'Bot created');
});

exports.update = asyncHandler(async (req, res) => {
  const bot = await botService.getById(req.params.id);
  Object.assign(bot, req.body);
  await bot.save();
  await activityService.log('bot_updated', { actor: req.user._id, meta: { slug: bot.slug, fields: Object.keys(req.body) }, req });
  ok(res, bot, 'Bot updated');
});

exports.remove = asyncHandler(async (req, res) => {
  const bot = await botService.remove(req.params.id);
  await activityService.log('bot_deleted', { actor: req.user._id, meta: { slug: bot.slug }, req });
  ok(res, null, 'Bot deleted');
});
