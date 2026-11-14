'use strict';

const Counter = require('../models/Counter');

/**
 * BT-PRD-1411-001 : prefix - category - DDMM (local date) - 3+ digit sequence.
 * The sequence is a single atomic MongoDB counter per local day, so references are unique
 * even with several server instances. (Final format is "To be confirmed" by the client.)
 */
async function next({ prefix, code, now }) {
  const ddmm = now.toFormat('ddLL');
  const counter = await Counter.findOneAndUpdate(
    { _id: `ref:${prefix}:${now.toFormat('yyyyLLdd')}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return `${prefix}-${code}-${ddmm}-${String(counter.seq).padStart(3, '0')}`;
}

module.exports = { next };
