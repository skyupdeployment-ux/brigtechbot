'use strict';

const Activity = require('../models/Activity');
const { parsePagination, buildMeta } = require('../utils/pagination');

async function list(actor, query) {
  const p = parsePagination(query);
  const filter = {};
  if (actor.role !== 'admin') filter.user = actor._id;
  else if (query.user) filter.user = query.user;
  if (query.type) filter.type = query.type;
  if (query.conversation) filter.conversation = query.conversation;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  const [items, total] = await Promise.all([
    Activity.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    Activity.countDocuments(filter),
  ]);
  return { items: items.map((a) => a.toJSON()), meta: buildMeta(p, total) };
}

module.exports = { list };
