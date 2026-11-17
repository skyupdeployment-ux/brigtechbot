'use strict';

/**
 * Keeps meeting slots from being double-booked.
 * The database (unique index on {unit, cell}) is the referee: whichever customer saves first gets the slot,
 * the other one gets "SLOT_TAKEN" and is asked to choose again.
 */

const { DateTime } = require('luxon');
const SlotLock = require('../models/SlotLock');
const AppError = require('../utils/AppError');
const env = require('../config/env');
const slots = require('../utils/slots');

const cfg = () => env.booking;
const isDup = (e) => e && (e.code === 11000 || (e.writeErrors || []).some((w) => w.code === 11000 || (w.err && w.err.code === 11000)));

/** Forget "held" slots whose time ran out (customer never confirmed). */
async function purgeExpired(now = new Date()) {
  await SlotLock.deleteMany({ status: 'held', expiresAt: { $lt: now } });
}

/** Map of cellMs -> Set(unit) for every cell blocked between two instants. */
async function blockedCells(from, to) {
  const rows = await SlotLock.find({ cell: { $gte: from, $lte: to }, $or: [{ status: 'booked' }, { expiresAt: { $gte: new Date() } }] })
    .select('unit cell')
    .lean();
  const map = new Map();
  rows.forEach((r) => {
    const k = new Date(r.cell).getTime();
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(r.unit);
  });
  return map;
}

/** Is there a free lane (unit) for all cells of a meeting starting at `startsAt`? */
function freeUnit(startsAt, blocked, c = cfg()) {
  const cells = slots.cellsOf(startsAt, c);
  for (let u = 0; u < c.capacity; u += 1) {
    if (cells.every((cell) => !(blocked.get(cell.getTime()) || new Set()).has(u))) return u;
  }
  return -1;
}

/** Earliest moment a customer may book (now + lead time). */
const earliestMoment = (now, leadMinutes) => now.plus({ minutes: leadMinutes });

/**
 * The times of one date, each with available / reason.
 * reason: 'past' (too soon) | 'taken' (booked by someone else)
 */
async function dayAvailability(dateKey, tz, now, leadMinutes) {
  const c = cfg();
  const list = slots.slotsForDate(dateKey, tz, c);
  if (!list.length) return { open: false, slots: [] };
  const first = list[0].startsAt;
  const last = list[list.length - 1].startsAt;
  const blocked = await blockedCells(new Date(first.getTime() - slots.blockCells(c) * c.slot * 60000), new Date(last.getTime() + slots.blockCells(c) * c.slot * 60000));
  const min = earliestMoment(now, leadMinutes).toMillis();
  return {
    open: true,
    slots: list.map((s) => {
      if (s.startsAt.getTime() < min) return { time: s.time, label: slots.label12(s.time), available: false, reason: 'past' };
      const free = freeUnit(s.startsAt, blocked, c) >= 0;
      return { time: s.time, label: slots.label12(s.time), available: free, reason: free ? null : 'taken' };
    }),
  };
}

/** Dates between two keys that cannot be chosen at all (closed, or nothing left). */
async function unavailableDates(fromKey, toKey, tz, now, leadMinutes) {
  const c = cfg();
  const out = [];
  let d = DateTime.fromISO(fromKey, { zone: tz });
  const end = DateTime.fromISO(toKey, { zone: tz });
  const blocked = await blockedCells(d.startOf('day').toUTC().toJSDate(), end.endOf('day').plus({ hours: 4 }).toUTC().toJSDate());
  const min = earliestMoment(now, leadMinutes).toMillis();
  while (d <= end) {
    const key = d.toISODate();
    const list = slots.slotsForDate(key, tz, c);
    const any = list.some((s) => s.startsAt.getTime() >= min && freeUnit(s.startsAt, blocked, c) >= 0);
    if (!any) out.push(key);
    d = d.plus({ days: 1 });
  }
  return out;
}

async function releaseHeld(conversationId) {
  await SlotLock.deleteMany({ conversation: conversationId, status: 'held' });
}

/**
 * Keep a slot for this conversation (replaces any slot it held before).
 * Throws SLOT_TAKEN (409) when someone else already has it.
 */
async function reserve(conversationId, startsAt) {
  const c = cfg();
  await purgeExpired();
  await releaseHeld(conversationId);
  const cells = slots.cellsOf(startsAt, c);
  const expiresAt = new Date(Date.now() + c.holdMinutes * 60000);
  for (let unit = 0; unit < c.capacity; unit += 1) {
    const docs = cells.map((cell) => ({ unit, cell, startsAt, conversation: conversationId, status: 'held', expiresAt }));
    try {
      await SlotLock.insertMany(docs, { ordered: true });
      return { unit };
    } catch (e) {
      if (!isDup(e)) throw e;
      // roll back the cells of this attempt that did get in, then try the next lane
      await SlotLock.deleteMany({ unit, conversation: conversationId, status: 'held', cell: { $in: cells } });
    }
  }
  throw AppError.conflict('Sorry, that time was just booked by someone else. Please choose another time.', 'SLOT_TAKEN');
}

/** At confirmation: is this conversation still holding the slot? (also extends the hold a little) */
async function verifyHold(conversationId, startsAt) {
  const c = cfg();
  const need = slots.blockCells(c);
  const now = new Date();
  const rows = await SlotLock.find({ conversation: conversationId, status: 'held', startsAt, expiresAt: { $gte: now } }).select('_id');
  if (rows.length < need) return false;
  await SlotLock.updateMany({ conversation: conversationId, status: 'held', startsAt }, { $set: { expiresAt: new Date(Date.now() + 5 * 60000) } });
  return true;
}

/** The enquiry was confirmed: the held cells become permanent. */
async function bookHold(conversationId, startsAt, enquiryId) {
  await SlotLock.updateMany({ conversation: conversationId, status: 'held', startsAt }, { $set: { status: 'booked', enquiry: enquiryId, expiresAt: null } });
}

/** Admin cancelled the booking / enquiry: free its slot. */
async function releaseForEnquiry(enquiryId) {
  await SlotLock.deleteMany({ enquiry: enquiryId });
}

module.exports = { purgeExpired, dayAvailability, unavailableDates, reserve, releaseHeld, verifyHold, bookHold, releaseForEnquiry };
