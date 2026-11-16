'use strict';

const { formatClock } = require('./time');
const fileService = require('../services/fileService');

const stringId = (v) => (v && v._id ? v._id.toString() : v ? v.toString() : v);

/** prefs = { timezone, timeFormat } of the viewer. Timestamps stay UTC; displayTime is converted. */
function message(m, prefs) {
  const o = m.toObject ? m.toObject() : m;
  const out = {
    id: stringId(o._id),
    seq: o.seq,
    role: o.role,
    kind: o.kind,
    createdAt: new Date(o.createdAt).toISOString(),
    displayTime: formatClock(o.createdAt, prefs.timezone, prefs.timeFormat),
  };
  ['head', 'text', 'desc', 'quote'].forEach((k) => {
    if (o[k]) out[k] = o[k];
  });
  if (o.list) out.list = o.list;
  if (o.buttons) out.buttons = o.buttons;
  if (o.cta) out.cta = o.cta;
  if (o.datePicker) out.datePicker = o.datePicker;
  if (o.file) {
    out.file = {
      originalName: o.file.originalName,
      mimeType: o.file.mimeType,
      size: o.file.size,
      accepted: !!o.file.accepted,
      url: o.file.accepted ? fileService.signedUrl(o.file.storedName) : null,
    };
  }
  return out;
}

function enquiry(e, booking, prefs) {
  const o = e.toObject ? e.toObject() : e;
  const out = {
    id: stringId(o._id),
    reference: o.reference,
    conversation: stringId(o.conversation),
    user: stringId(o.user),
    bot: stringId(o.bot),
    flowId: o.flowId,
    flowName: o.flowName,
    category: o.category,
    channel: o.channel || 'web',
    status: o.status,
    adminNotes: o.adminNotes || '',
    contactName: o.contactName,
    contactPhone: o.contactPhone,
    contactEmail: o.contactEmail,
    companyName: o.companyName,
    timezone: o.timezone,
    answers: o.answers,
    attachments: (o.attachments || []).map((a) => ({
      fieldKey: a.fieldKey,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      url: fileService.signedUrl(a.storedName),
    })),
    createdAt: new Date(o.createdAt).toISOString(),
    updatedAt: new Date(o.updatedAt).toISOString(),
  };
  if (prefs) out.displayTime = formatClock(o.createdAt, prefs.timezone, prefs.timeFormat);
  if (booking !== undefined) out.booking = booking ? bookingView(booking, prefs) : null;
  return out;
}

function bookingView(b, prefs) {
  const o = b.toObject ? b.toObject() : b;
  const out = {
    id: stringId(o._id),
    enquiry: stringId(o.enquiry),
    conversation: stringId(o.conversation),
    user: stringId(o.user),
    dateKey: o.dateKey,
    date: o.date ? new Date(o.date).toISOString() : null, // UTC instant of local midnight
    dateLabel: o.dateLabel,
    timeLocal: o.timeLocal || null,
    startsAt: o.startsAt ? new Date(o.startsAt).toISOString() : null,
    timeSlot: o.timeSlot,
    timezone: o.timezone,
    status: o.status,
    createdAt: new Date(o.createdAt).toISOString(),
    updatedAt: new Date(o.updatedAt).toISOString(),
  };
  if (prefs) {
    out.displayTime = formatClock(o.createdAt, prefs.timezone, prefs.timeFormat);
  }
  return out;
}

module.exports = { message, enquiry, booking: bookingView, stringId };
