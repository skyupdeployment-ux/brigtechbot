'use strict';

const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Enquiry = require('../models/Enquiry');
const Booking = require('../models/Booking');
const Activity = require('../models/Activity');
const activityService = require('./activityService');
const fileService = require('./fileService');
const AppError = require('../utils/AppError');
const { escapeRegex } = require('../utils/text');
const { parsePagination, buildMeta } = require('../utils/pagination');

async function list(query) {
  const p = parsePagination(query);
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }, { company: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
    User.countDocuments(filter),
  ]);
  return { items: items.map((u) => u.toJSON()), meta: buildMeta(p, total) };
}

async function getById(id) {
  const user = await User.findById(id);
  if (!user) throw AppError.notFound('User not found', 'USER_NOT_FOUND');
  return user;
}

async function update(id, body, actor, req) {
  const user = await getById(id);
  const self = user._id.toString() === actor._id.toString();
  if (!self && actor.role !== 'admin') throw AppError.forbidden();

  if (actor.role !== 'admin') {
    ['isActive', 'role', 'password'].forEach((k) => delete body[k]);
  } else if (self && (body.isActive === false || (body.role && body.role !== 'admin'))) {
    throw AppError.badRequest('You cannot disable or demote your own account.', 'SELF_LOCKOUT');
  }
  if (body.password && user.role !== 'admin' && body.role !== 'admin') delete body.password; // customers have no password

  Object.keys(body).forEach((k) => {
    user[k] = body[k] === '' ? undefined : body[k];
  });
  await user.save();
  await activityService.log('user_updated', { user: user._id, actor: actor._id, meta: { fields: Object.keys(body).filter((k) => k !== 'password') }, req });
  return user.toJSON();
}

/** Admin erasure: removes the user and everything they created, including uploaded files. */
async function remove(id, actor, req) {
  const user = await getById(id);
  if (user._id.toString() === actor._id.toString()) throw AppError.badRequest('You cannot delete your own account.', 'SELF_DELETE');

  const convIds = (await Conversation.find({ user: user._id }).select('_id').lean()).map((c) => c._id);
  const fileNames = [
    ...(await Message.distinct('file.storedName', { conversation: { $in: convIds }, 'file.storedName': { $ne: null } })),
    ...(await Enquiry.distinct('attachments.storedName', { user: user._id })),
  ];
  await Promise.all([
    Message.deleteMany({ conversation: { $in: convIds } }),
    Booking.deleteMany({ user: user._id }),
    Enquiry.deleteMany({ user: user._id }),
    Conversation.deleteMany({ user: user._id }),
    Activity.deleteMany({ user: user._id }),
  ]);
  await user.deleteOne();
  await fileService.remove(fileNames);
  await activityService.log('user_deleted', { actor: actor._id, meta: { userId: id, role: user.role }, req });
}

module.exports = { list, getById, update, remove };
