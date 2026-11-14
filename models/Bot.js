'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');
const { isValidTimezone } = require('../utils/time');

const botSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, trim: true, lowercase: true, match: /^[a-z0-9-]{2,40}$/ },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    displayName: { type: String, required: true, trim: true, maxlength: 120 }, // shown in the chat header
    subtitle: { type: String, trim: true, maxlength: 120, default: 'Business account' },
    description: { type: String, trim: true, maxlength: 500 },
    timezone: {
      type: String,
      default: () => env.DEFAULT_TIMEZONE,
      validate: { validator: isValidTimezone, message: 'Invalid IANA timezone' },
    },
    timeFormat: { type: String, enum: ['12h', '24h'], default: () => env.DEFAULT_TIME_FORMAT },
    bookingMaxDaysAhead: { type: Number, min: 7, max: 365, default: () => env.BOOKING_MAX_DAYS_AHEAD },
    referencePrefix: { type: String, uppercase: true, trim: true, match: /^[A-Z]{2,6}$/, default: () => env.REFERENCE_PREFIX },
    flowVersion: { type: String, default: '1.0.0' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

botSchema.index({ slug: 1 }, { unique: true });
botSchema.index({ isActive: 1 });

botSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Bot', botSchema);
