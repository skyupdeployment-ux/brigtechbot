'use strict';

// Same normalisation rules as the original front-end bot.
const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&\/,()+.\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const strip = (s) => norm(s).replace(/^\d+\s+/, '');

// 'Title|Description' strings -> { t, d }
const P = (arr) =>
  arr.map((x) => {
    const [t, d] = x.split('|');
    return { t, d: d || '' };
  });

// Removes the leading keycap emoji (1️⃣ ...) from a title.
const clean = (t) => t.replace(/^\d[\uFE0F]?\u20E3\s*/, '');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { norm, strip, P, clean, escapeRegex };
