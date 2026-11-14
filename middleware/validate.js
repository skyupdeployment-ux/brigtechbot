'use strict';

const mongoose = require('mongoose');
const AppError = require('../utils/AppError');

/** validate(schema, 'body' | 'query' | 'params') - replaces the source with the cleaned value. */
const validate = (schema, source = 'body') => (req, _res, next) => {
  const { value, error } = schema.validate(req[source] || {}, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });
  if (error) {
    const details = error.details.map((d) => ({ field: d.path.join('.'), message: d.message.replace(/"/g, '') }));
    return next(AppError.unprocessable('Validation failed', 'VALIDATION_ERROR', details));
  }
  if (source === 'query') {
    // Express keeps req.query getter-only in some setups; mutate in place.
    Object.keys(req.query).forEach((k) => delete req.query[k]);
    Object.assign(req.query, value);
  } else {
    req[source] = value;
  }
  return next();
};

/** Rejects malformed ObjectIds before they reach Mongoose. */
const validateObjectId = (...names) => (req, _res, next) => {
  for (const n of names) {
    if (!mongoose.isValidObjectId(req.params[n])) return next(AppError.badRequest(`Invalid ${n}`, 'INVALID_ID'));
  }
  return next();
};

module.exports = { validate, validateObjectId };
