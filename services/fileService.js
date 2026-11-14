'use strict';

const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');
const tokenService = require('./tokenService');
const logger = require('../utils/logger');

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

const resolveStored = (storedName) => {
  if (!storedName || !SAFE_NAME.test(storedName)) return null;
  const full = path.join(env.UPLOAD_DIR, storedName);
  return full.startsWith(env.UPLOAD_DIR + path.sep) ? full : null;
};

const signedUrl = (storedName) => (storedName ? `/api/files/${encodeURIComponent(storedName)}?t=${tokenService.signFile(storedName)}` : null);

async function remove(storedNames) {
  await Promise.all(
    [...new Set((storedNames || []).filter(Boolean))].map(async (name) => {
      const full = resolveStored(name);
      if (!full) return;
      try {
        await fs.unlink(full);
      } catch (e) {
        if (e.code !== 'ENOENT') logger.warn('Could not delete file', name, e.message);
      }
    })
  );
}

module.exports = { resolveStored, signedUrl, remove };
