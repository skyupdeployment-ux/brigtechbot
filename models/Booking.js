'use strict';

const mongoose = require('mongoose');
const { DATE_KEY_RE, isValidTimezone } = require('../utils/time');

// The "Book a time" step of every enquiry: preferred date + preferred time slot.
const bookingSchema = new mongoose.Schema(
  {
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', required: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bot: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
    // null = "No preference"
    dateKey: {
      type: String,
      default: null,
      validate: { validator: (v) => v === null || DATE_KEY_RE.test(v), message: 'dateKey must be YYYY-MM-DD' },
    },
    // Start of that calendar day in `timezone`, stored as a UTC instant.
    date: { type: Date, default: null },
    dateLabel: { type: String, maxlength: 60 }, // "Mon, 17 Nov" or "No preference"
    // Exact time picked on the web picker (local time in `timezone`) and the same moment as a UTC instant.
    timeLocal: { type: String, default: null, match: /^\d{2}:\d{2}$/ },
    startsAt: { type: Date, default: null },
    timeSlot: { type: String, enum: ['Morning', 'Afternoon', 'Evening', 'No preference'], required: true },
    timezone: { type: String, required: true, validate: { validator: isValidTimezone, message: 'Invalid timezone' } },
    status: { type: String, enum: ['requested', 'confirmed', 'completed', 'cancelled'], default: 'requested' },
  },
  { timestamps: true }
);

bookingSchema.index({ enquiry: 1 }, { unique: true }); // exactly one booking per enquiry
bookingSchema.index({ date: 1, status: 1 });
bookingSchema.index({ user: 1, date: -1 });
bookingSchema.index({ bot: 1, status: 1, date: 1 });
bookingSchema.index({ conversation: 1 });

bookingSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Booking', bookingSchema);
