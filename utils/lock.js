'use strict';

// Serialises async work per key inside one Node process, so two requests for the same
// conversation can never interleave. (For multi-instance deployments see README.)
const tails = new Map();

async function withLock(key, fn) {
  const prev = tails.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((r) => (release = r));
  const tail = prev.then(() => gate);
  tails.set(key, tail);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

module.exports = { withLock };
