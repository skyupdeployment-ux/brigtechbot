'use strict';

const mongoose = require('mongoose');

const rowSchema = new mongoose.Schema({ t: String, d: String }, { _id: false });

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    seq: { type: Number, required: true, min: 0 }, // strict per-conversation ordering
    role: { type: String, enum: ['user', 'bot'], required: true },
    kind: { type: String, enum: ['text', 'choice', 'file', 'interactive'], required: true },
    head: { type: String, maxlength: 200 },
    text: { type: String, maxlength: 30000 },
    desc: { type: String, maxlength: 300 }, // selected-row description shown under a user's choice
    quote: { type: String, maxlength: 600 }, // the bot message a user choice replied to
    list: {
      type: new mongoose.Schema(
        { btn: String, title: String, rows: [rowSchema], nav: [rowSchema] },
        { _id: false }
      ),
      default: undefined,
    },
    buttons: { type: [String], default: undefined },
    cta: {
      type: new mongoose.Schema({ text: String, url: { type: String, maxlength: 1000 } }, { _id: false }),
      default: undefined,
    },
    datePicker: {
      type: new mongoose.Schema({ min: String, max: String, btn: String }, { _id: false }),
      default: undefined,
    },
    file: {
      type: new mongoose.Schema(
        {
          originalName: { type: String, maxlength: 255 },
          storedName: { type: String, maxlength: 255 }, // null when the file was rejected
          mimeType: { type: String, maxlength: 150 },
          size: { type: Number, min: 0 },
          accepted: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ conversation: 1, seq: 1 }, { unique: true });
messageSchema.index({ conversation: 1, role: 1, kind: 1, seq: -1 });
messageSchema.index({ 'file.storedName': 1 }, { sparse: true });

module.exports = mongoose.model('Message', messageSchema);
