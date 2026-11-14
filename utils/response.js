'use strict';

const ok = (res, data = null, message, meta, status = 200) => {
  const body = { success: true, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
};

const created = (res, data, message, meta) => ok(res, data, message, meta, 201);

const fail = (res, status, code, message, details) => {
  const error = { code, message };
  if (details) error.details = details;
  return res.status(status).json({ success: false, error });
};

module.exports = { ok, created, fail };
