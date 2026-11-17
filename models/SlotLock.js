'use strict';

const mongoose = require('mongoose');

/**
 * One row per `slot`-minute cell that a booking blocks (a meeting + its buffer usually blocks 2 cells).
 * The unique index {unit, cell} is what makes double-booking impossible, even when two customers
 * tap the same time in the same second. `unit` = which parallel meeting lane (BOOKING_CAPACITY).
 *   held   - chosen on the page, kept until `expiresAt` unless the enquiry is confirmed
 *   booked - the enquiry was confirmed (no expiry); freed if the booking/enquiry is cancelled
 */
const slotLockSchema = new mongoose.Schema(
  {
    unit: { type: Number, required: true, min: 0 },
    cell: { type: Date, required: true },
    startsAt: { type: Date, required: true }, // start of the meeting this cell belongs to
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    enquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Enquiry', default: null },
    status: { type: String, enum: ['held', 'booked'], required: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

slotLockSchema.index({ unit: 1, cell: 1 }, { unique: true });
slotLockSchema.index({ conversation: 1, status: 1 });
slotLockSchema.index({ enquiry: 1 }, { sparse: true });
slotLockSchema.index({ status: 1, expiresAt: 1 });
slotLockSchema.index({ cell: 1 });

module.exports = mongoose.model('SlotLock', slotLockSchema);
