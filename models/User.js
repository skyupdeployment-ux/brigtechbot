'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { isValidTimezone } = require('../utils/time');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    // Anonymous chat visitors are identified by a random session id (no password).
    sessionId: { type: String, trim: true },
    name: { type: String, trim: true, maxlength: 120 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: { validator: (v) => !v || EMAIL_RE.test(v), message: 'Invalid email address' },
    },
    phone: { type: String, trim: true, maxlength: 20 },
    company: { type: String, trim: true, maxlength: 160 },
    // WhatsApp number (digits, with country code) for customers who chat through MSG91
    waNumber: { type: String, trim: true, maxlength: 20 },
    // Mirrors `email` for admins only, so a sparse unique index can enforce unique admin logins
    // while many anonymous customers may share an e-mail (works on every Mongo-compatible DB).
    adminEmail: { type: String, lowercase: true, trim: true, select: false },
    password: { type: String, select: false },
    timezone: {
      type: String,
      default: () => env.DEFAULT_TIMEZONE,
      validate: { validator: isValidTimezone, message: 'Invalid IANA timezone' },
    },
    timeFormat: { type: String, enum: ['12h', '24h'], default: () => env.DEFAULT_TIME_FORMAT },
    isActive: { type: Boolean, default: true },
    lastSeenAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ sessionId: 1 }, { unique: true, sparse: true });
userSchema.index({ adminEmail: 1 }, { unique: true, sparse: true });
userSchema.index({ email: 1 }, { sparse: true });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ waNumber: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, createdAt: -1 });

userSchema.pre('validate', function syncAdminEmail(next) {
  this.adminEmail = this.role === 'admin' && this.email ? this.email : undefined;
  next();
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(plain, this.password);
};

userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.password;
    delete ret.sessionId;
    delete ret.adminEmail;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
