'use strict';

const Activity = require('../models/Activity');
const logger = require('../utils/logger');

/** Best effort: an audit-log failure must never break the user's request. */
async function log(type, { user, actor, conversation, enquiry, meta, req } = {}) {
  try {
    await Activity.create({
      type,
      user,
      actor,
      conversation,
      enquiry,
      meta,
      ip: req ? req.ip : undefined,
      userAgent: req ? (req.get('user-agent') || '').slice(0, 300) : undefined,
    });
  } catch (e) {
    logger.warn('Activity log failed', type, e.message);
  }
}

module.exports = { log };
