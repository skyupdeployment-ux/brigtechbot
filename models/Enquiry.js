'use strict';

const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  { key: { type: String, required: true, maxlength: 120 }, value: { type: String, maxlength: 2000 } },
  { _id: false }
);
const attachmentSchema = new mongoose.Schema(
  {
    fieldKey: { type: String, maxlength: 120 },
    originalName: { type: String, maxlength: 255 },
    storedName: { type: String, maxlength: 255 },
    mimeType: { type: String, maxlength: 150 },
    size: { type: Number, min: 0 },
  },
  { _id: false }
);

const enquirySchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, uppercase: true, trim: true }, // e.g. BT-PRD-1411-001
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    submissionNo: { type: Number, required: true, min: 1 }, // n-th enquiry inside the conversation
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bot: { type: mongoose.Schema.Types.ObjectId, ref: 'Bot', required: true },
    flowId: { type: String, required: true },
    flowName: { type: String, required: true },
    category: { type: String, required: true }, // product | service | auto | robo | bms | career | contact
    answers: { type: [answerSchema], default: [] }, // ordered, exactly as collected by the bot
    attachments: { type: [attachmentSchema], default: [] },
    contactName: { type: String, trim: true, maxlength: 120 },
    contactPhone: { type: String, trim: true, maxlength: 20 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    companyName: { type: String, trim: true, maxlength: 160 },
    channel: { type: String, enum: ['web', 'whatsapp'], default: 'web' },
    status: { type: String, enum: ['new', 'in_progress', 'contacted', 'closed', 'cancelled'], default: 'new' },
    adminNotes: { type: String, trim: true, maxlength: 2000 },
    timezone: { type: String, required: true },
  },
  { timestamps: true }
);

enquirySchema.index({ reference: 1 }, { unique: true });
// Guarantees a submission can never be stored twice.
enquirySchema.index({ conversation: 1, submissionNo: 1 }, { unique: true });
enquirySchema.index({ createdAt: -1 });
enquirySchema.index({ bot: 1, status: 1, createdAt: -1 });
enquirySchema.index({ user: 1, createdAt: -1 });
enquirySchema.index({ category: 1, createdAt: -1 });
enquirySchema.index({ contactPhone: 1 }, { sparse: true });

enquirySchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Enquiry', enquirySchema);
