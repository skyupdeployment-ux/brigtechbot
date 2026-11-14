'use strict';

const mongoose = require('mongoose');
const multer = require('multer');
const AppError = require('../utils/AppError');
const { fail } = require('../utils/response');
const logger = require('../utils/logger');
const env = require('../config/env');

const notFound = (req, _res, next) => next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  if (res.headersSent) return undefined;

  if (err instanceof AppError) return fail(res, err.statusCode, err.code, err.message, err.details);

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return fail(res, 422, 'VALIDATION_ERROR', 'Validation failed', details);
  }
  if (err instanceof mongoose.Error.CastError) return fail(res, 400, 'INVALID_ID', `Invalid value for ${err.path}`);
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    return fail(res, 409, 'DUPLICATE', `A record with this ${field} already exists`);
  }
  if (err instanceof multer.MulterError) {
    const map = {
      LIMIT_FILE_SIZE: [413, `File is too large (max ${env.MAX_FILE_SIZE_MB} MB).`],
      LIMIT_FILE_COUNT: [400, `Too many files (max ${env.MAX_FILES_PER_REQUEST} per request).`],
      LIMIT_UNEXPECTED_FILE: [400, 'Unexpected upload field. Use the "files" field.'],
    };
    const [status, message] = map[err.code] || [400, err.message];
    return fail(res, status, err.code, message);
  }
  if (err && err.name === 'JsonWebTokenError') return fail(res, 401, 'INVALID_TOKEN', 'Invalid authentication token');
  if (err && err.name === 'TokenExpiredError') return fail(res, 401, 'TOKEN_EXPIRED', 'Authentication token expired');
  if (err && err.type === 'entity.parse.failed') return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
  if (err && err.type === 'entity.too.large') return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
  if (err && err.message === 'CORS_NOT_ALLOWED') return fail(res, 403, 'CORS_NOT_ALLOWED', 'Origin not allowed');

  logger.error(`${req.method} ${req.originalUrl}`, err);
  return fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
};

module.exports = { notFound, errorHandler };
