'use strict';

const mongoose = require('mongoose');

// De-duplicates webhook deliveries (MSG91 may retry). Old entries are pruned in code (whatsappService),
// not with a TTL index, so this works on every MongoDB-compatible database.
const inboundEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, maxlength: 200 },
    number: { type: String, maxlength: 20 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

inboundEventSchema.index({ eventId: 1 }, { unique: true });
inboundEventSchema.index({ createdAt: 1 });

module.exports = mongoose.model('InboundEvent', inboundEventSchema);
