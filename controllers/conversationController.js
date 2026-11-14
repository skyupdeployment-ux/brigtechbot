'use strict';

const service = require('../services/conversationService');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

// X-Socket-Id lets the server skip echoing an update back to the tab that caused it.
const ctxOf = (req) => ({ req, socketId: req.get('x-socket-id') || undefined });

exports.start = asyncHandler(async (req, res) => {
  const data = await service.startOrResume({ actor: req.user, body: req.body, req });
  (data.resumed ? ok : created)(res, data, data.resumed ? 'Conversation resumed' : 'Conversation started');
});

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.user, req.query);
  ok(res, items, undefined, meta);
});

exports.getOne = asyncHandler(async (req, res) => ok(res, await service.getOne(req.params.id, req.user)));

exports.listMessages = asyncHandler(async (req, res) => ok(res, await service.listMessages(req.params.id, req.user, req.query)));

exports.sendMessage = asyncHandler(async (req, res) => ok(res, await service.sendMessage(req.params.id, req.user, req.body, ctxOf(req))));

exports.sendFiles = asyncHandler(async (req, res) =>
  ok(res, await service.sendFiles(req.params.id, req.user, req.files || [], req.rejectedFiles || [], ctxOf(req)))
);

exports.selectDate = asyncHandler(async (req, res) => ok(res, await service.selectDate(req.params.id, req.user, req.body, ctxOf(req))));

exports.idle = asyncHandler(async (req, res) => ok(res, await service.idle(req.params.id, req.user, ctxOf(req))));

exports.restart = asyncHandler(async (req, res) => created(res, await service.restart(req.params.id, req.user, req), 'Conversation restarted'));

exports.updatePreferences = asyncHandler(async (req, res) =>
  ok(res, await service.updatePreferences(req.params.id, req.user, req.body, req), 'Preferences saved')
);

exports.remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user, req);
  ok(res, null, 'Conversation deleted');
});
