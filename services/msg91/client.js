'use strict';

/**
 * MSG91 WhatsApp sender.
 * Endpoint + auth header per MSG91 docs:
 *   POST https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/
 *   header  Authkey: <your authkey>
 *   body    { integrated_number, recipient_number, content_type: 'text' | 'interactive', text | interactive }
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

module.exports = {
  sendText: (to, text) => post({ ...base(to), content_type: 'text', text }),
  sendInteractive: (to, interactive) => post({ ...base(to), content_type: 'interactive', interactive }),
};
