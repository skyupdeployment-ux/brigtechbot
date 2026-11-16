'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

const signAccess = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role, typ: 'access' }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'brightech-bot',
  });

const verifyAccess = (token) => {
  const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'brightech-bot' });
  if (payload.typ !== 'access') throw new jwt.JsonWebTokenError('wrong token type');
  return payload;
};

// Short-lived signed token so <img src> / download links work without an Authorization header.
const signFile = (storedName) =>
  jwt.sign({ fn: storedName, typ: 'file' }, env.JWT_SECRET, { expiresIn: env.FILE_URL_TTL_SECONDS, issuer: 'brightech-bot' });

const verifyFile = (token) => {
  const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'brightech-bot' });
  if (payload.typ !== 'file') throw new jwt.JsonWebTokenError('wrong token type');
  return payload;
};

// Link sent to the customer on WhatsApp: opens the "Pick date and time" page for ONE conversation.
const signPicker = (payload, hours) =>
  jwt.sign({ ...payload, typ: 'picker' }, env.JWT_SECRET, { expiresIn: `${hours}h`, issuer: 'brightech-bot' });

const verifyPicker = (token) => {
  const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'brightech-bot' });
  if (payload.typ !== 'picker') throw new jwt.JsonWebTokenError('wrong token type');
  return payload;
};

module.exports = { signAccess, verifyAccess, signFile, verifyFile, signPicker, verifyPicker };
