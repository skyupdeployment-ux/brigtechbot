'use strict';

const path = require('path');
const tokenService = require('../services/tokenService');
const fileService = require('../services/fileService');
const AppError = require('../utils/AppError');

const INLINE = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.pdf', '.mp4', '.webm', '.mov']);

exports.download = (req, res, next) => {
  try {
    const name = req.params.name;
    const payload = tokenService.verifyFile(String(req.query.t || ''));
    const full = fileService.resolveStored(name);
    if (!full || payload.fn !== name) throw AppError.forbidden('Invalid file link', 'INVALID_FILE_LINK');

    const ext = path.extname(name).toLowerCase();
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', INLINE.has(ext) ? 'inline' : 'attachment');
    res.sendFile(full, (err) => {
      if (err) next(err.code === 'ENOENT' ? AppError.notFound('File not found', 'FILE_NOT_FOUND') : err);
    });
  } catch (e) {
    next(e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError' ? AppError.forbidden('File link is invalid or expired', 'INVALID_FILE_LINK') : e);
  }
};
