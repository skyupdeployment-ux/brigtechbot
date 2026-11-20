'use strict';

/**
 * MSG91 WhatsApp sender.
 * Endpoint + auth header per MSG91 docs:
 *   POST https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/
 *   header  Authkey: <your authkey>
 *   body    { integrated_number, recipient_number, content_type: 'text' | 'interactive' | 'image', text | interactive | image }
 * NOTE: MSG91 only allows free-form messages inside the 24h customer-service window (after the customer
 * has messaged you). Business-initiated messages need an approved template.
 */

const env = require('../../config/env');
const logger = require('../../utils/logger');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function looksLikeError(json) {
  if (!json || typeof json !== 'object') return false;
  const t = String(json.type || json.status || '').toLowerCase();
  return t === 'error' || t === 'fail' || t === 'failed' || json.hasError === true;
}

async function post(payload) {
  if (env.MSG91_DRY_RUN) {
    logger.info('[MSG91 dry-run]', JSON.stringify(payload));
    return { dryRun: true };
  }
  const url = env.MSG91_BASE_URL + env.MSG91_SEND_PATH;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), env.MSG91_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authkey: env.MSG91_AUTH_KEY, accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      const raw = await res.text();
      let json = null;
      try { json = raw ? JSON.parse(raw) : null; } catch (_e) { /* non-JSON body */ }
      if (res.ok && !looksLikeError(json)) return json || {};
      const err = new Error(`MSG91 ${res.status}: ${raw.slice(0, 300)}`);
      err.permanent = res.status < 500 && res.status !== 429; // 4xx (bad key, IP not whitelisted, bad payload) won't fix itself
      err.status = res.status;
      throw err;
    } catch (e) {
      lastErr = e;
      if (e.permanent) break;
      await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

const base = (to) => ({ integrated_number: env.MSG91_INTEGRATED_NUMBER, recipient_number: to });

/**
 * Picture message. MSG91 answered our first guesses with 400 {"errors": "attachment_url not found in request"}:
 * it wants the picture address in a field called `attachment_url`. MSG91 does not say how it names the caption, so the
 * first format sends the caption under both likely names (caption and text); if MSG91 refuses that, the next formats
 * try one name at a time, and the one that works is remembered. Without a caption only the picture address is sent.
 * If nothing works, the picture is skipped for 10 minutes (the text and the menu still go out) and the reason is logged.
 */
const withCaption = (o, caption, keys) => (caption ? { ...o, ...Object.fromEntries(keys.map((k) => [k, caption])) } : o);
const IMAGE_SHAPES = [
  (to, link, caption) => withCaption({ ...base(to), content_type: 'image', attachment_url: link }, caption, ['caption', 'text']),
  (to, link, caption) => withCaption({ ...base(to), content_type: 'image', attachment_url: link }, caption, ['caption']),
  (to, link, caption) => withCaption({ ...base(to), content_type: 'image', attachment_url: link }, caption, ['text']),
];
let imageShape = 0;
let imageOffUntil = 0;

/** One try of every message format, no pause. Returns the MSG91 answer or throws the last error. */
async function tryShapes(to, link, caption) {
  let last;
  for (let i = imageShape; i < IMAGE_SHAPES.length; i += 1) {
    try {
      const r = await post(IMAGE_SHAPES[i](to, link, caption));
      if (i !== imageShape || i > 0) logger.info(`MSG91 accepted the picture message format #${i + 1}`);
      imageShape = i;
      return r;
    } catch (e) {
      last = e;
      if (!e.permanent) throw e; // network / server trouble: not a format problem
      logger.warn(`MSG91 refused picture format #${i + 1}: ${e.message}`);
    }
  }
  throw last;
}

const pause = () => { imageOffUntil = Date.now() + 10 * 60 * 1000; };
const paused = () => Date.now() < imageOffUntil;

async function sendImage(to, link, caption) {
  if (paused()) throw new Error('picture sending is paused after repeated MSG91 errors');
  try {
    return await tryShapes(to, link, caption);
  } catch (e) {
    if (e.permanent) pause();
    throw e;
  }
}

/**
 * The welcome: the picture WITH the text as its caption, in ONE message.
 * If MSG91 / WhatsApp refuses the caption (for example it is too long), the picture is sent alone and the caller
 * sends the text as a normal message. Returns { captioned: true | false }. Throws only if the picture itself fails.
 */
async function sendImageWithText(to, link, text) {
  if (paused()) throw new Error('picture sending is paused after repeated MSG91 errors');
  try {
    await tryShapes(to, link, text);
    return { captioned: true };
  } catch (e) {
    if (!e.permanent) throw e;
    logger.warn('MSG91 refused the picture with its caption - sending the picture alone');
  }
  try {
    await tryShapes(to, link, '');
    return { captioned: false };
  } catch (e) {
    if (e.permanent) pause();
    throw e;
  }
}

module.exports = {
  _resetImageState: () => { imageShape = 0; imageOffUntil = 0; }, // for tests
  sendImage,
  sendImageWithText,
  sendText: (to, text) => post({ ...base(to), content_type: 'text', text }),
  sendInteractive: (to, interactive) => post({ ...base(to), content_type: 'interactive', interactive }),
};
