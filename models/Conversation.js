'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');
const { isValidTimezone } = require('../utils/time');

const conversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bot: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
    channel: { type: String, enum: ['web', 'whatsapp'], default: 'web' },
    status: { type: String, enum: ['active', 'ended', 'archived'], default: 'active' },
    // Serialised flow-engine state (current flow/step, captured answers, history ...).
    // Stored as Mixed because the shape is owned by services/flow/engine.js.
    state: { type: mongoose.Schema.Types.Mixed, default: null },
    currentFlow: { type: String, default: null }, // denormalised for filtering/admin
    preferences: {
      timezone: {
        type: String,
        default: () => env.DEFAULT_TIMEZONE,
        validate: { validator: isValidTimezone, message: 'Invalid IANA timezone' },
      },
      timeFormat: { type: String, enum: ['12h', '24h'], default: () => env.DEFAULT_TIME_FORMAT },
    },
    messageCount: { type: Number, default: 0, min: 0 },
    enquiryCount: { type: Number, default: 0, min: 0 },
    lastMessageAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ user: 1, status: 1, lastActivityAt: -1 });
conversationSchema.index({ bot: 1, createdAt: -1 });
conversationSchema.index({ status: 1, lastActivityAt: -1 });

conversationSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.state; // internal
    return ret;
  },
});

module.exports = mongoose.model('Conversation', conversationSchema);
