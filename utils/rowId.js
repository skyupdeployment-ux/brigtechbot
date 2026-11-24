'use strict';

/**
 * Row ids that remember WHERE a list was.
 *
 * Why: customers tap options of OLD lists that are still in the chat (for example "HMI" of an older Select Product list,
 * or "Building Segment" of an older PCB Repair list). The same names exist in several lists, so the bot cannot tell which
 * list the tap came from. Every row of a list now carries its own context in its id, WhatsApp sends the id back unchanged,
 * and the bot puts the conversation back exactly where that list was and carries on from there.
 *
 *   id = "§" + {"f": flow, "i": step number, "d": the earlier list answers, "o": the option}
 *
 * Only answers of earlier LIST steps are in it (never anything a customer typed), and an id is at most 200 characters
 * (a WhatsApp limit): if it would be longer, the row simply keeps its plain text as id.
 */

const MARK = '§';
const MAX = 190;

/** ctx = a JSON string {f, i, d} stored on the list message. Returns the row id, or null. */
function encode(ctx, option) {
  if (!ctx || option === undefined || option === null) return null;
  let c;
  try {
    c = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
  } catch (_e) {
    return null;
  }
  if (!c || typeof c.f !== 'string') return null;
  const id = MARK + JSON.stringify({ f: c.f, i: c.i, d: c.d || {}, o: String(option) });
  return id.length <= MAX ? id : null;
}

/** raw text -> { f, i, d, o } or null (not one of our ids). */
function decode(raw) {
  if (typeof raw !== 'string' || raw[0] !== MARK) return null;
  try {
    const x = JSON.parse(raw.slice(1));
    if (!x || typeof x.f !== 'string' || !Number.isInteger(x.i) || typeof x.o !== 'string') return null;
    return { f: x.f, i: x.i, d: x.d && typeof x.d === 'object' && !Array.isArray(x.d) ? x.d : {}, o: x.o };
  } catch (_e) {
    return null;
  }
}

/** What to show / store for a tap: the option's own text. */
const optionOf = (raw) => {
  const d = decode(raw);
  return d ? d.o : raw;
};

const isRowId = (raw) => typeof raw === 'string' && raw[0] === MARK;

module.exports = { MARK, encode, decode, optionOf, isRowId };
