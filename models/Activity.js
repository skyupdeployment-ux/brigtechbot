'use strict';

const mongoose = require('mongoose');

const TYPES = [
  'conversation_started',
  'conversation_resumed',
  'conversation_restarted',
  'conversation_ended',
  'conversation_deleted',
  'flow_started',
  'file_uploaded',
  'date_selected',
  'time_selected',
  'enquiry_submitted',
  'enquiry_cancelled',
  'enquiry_updated',
  'enquiry_deleted',
  'booking_updated',
  'booking_deleted',
  'preferences_updated',
  'user_updated',
  'user_deleted',
  'bot_created',
  'bot_updated',
  'bot_deleted',
  'admin_login',
  'admin_registered',
];

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who the activity belongs to
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who performed it (admin edits)
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry' },
    meta: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activitySchema.index({ createdAt: -1 });
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ conversation: 1, createdAt: -1 });
activitySchema.index({ type: 1, createdAt: -1 });
activitySchema.index({ enquiry: 1, createdAt: -1 }, { sparse: true });

activitySchema.statics.TYPES = TYPES;

activitySchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Activity', activitySchema);
