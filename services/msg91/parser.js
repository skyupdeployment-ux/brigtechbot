'use strict';

/**
 * Tolerant parser for MSG91 inbound webhooks ("Webhook (New)" in the MSG91 panel).
 * MSG91 lets you design the JSON body with {{placeholders}}, and several values (content, messages,
 * interactive, button) arrive as *stringified JSON*, so this accepts several shapes.
 *
 * ★ If your payload looks different, turn on MSG91_LOG_RAW=true, send a WhatsApp message,
 *   read the logged body and adjust this file (and tests/msg91.test.js).
 *
 * Returns: { kind: 'text'|'choice'|'media'|'unsupported'|'ignore', number, eventId, text?, media?, reason? }
 */

const crypto = require('crypto');

const unfilled = (v) => typeof v === 'string' && /^\s*\{\{.*\}\}\s*$/.test(v);

const safeJson = (v) => {
  if (v === undefined || v === null || unfilled(v)) return undefined;
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return undefined;
  if (s[0] === '{' || s[0] === '[') {
    try { return JSON.parse(s); } catch (_e) { return s; }
  }
  return s;
};

const digits = (n) => String(n == null ? '' : n).replace(/\D/g, '').slice(0, 15);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Finds the human-readable reply inside text / interactive / button shapes. */
function pickReply(o) {
  if (o === undefined || o === null) return '';
  if (typeof o === 'string') return o.trim();
  if (typeof o !== 'object') return '';
  const i = o.interactive && typeof o.interactive === 'object' ? o.interactive : o;
  const lr = i.list_reply || o.list_reply;
  const br = i.button_reply || o.button_reply;
  if (lr) return str(lr.title) || str(lr.id);
  if (br) return str(br.title) || str(br.id);
  if (o.reply && typeof o.reply === 'object') return str(o.reply.title) || str(o.reply.id);
  if (o.button && typeof o.button === 'object') return str(o.button.text) || str(o.button.payload);
  // other field names gateways use for "what the customer tapped"
  for (const k of ['selectedTitle', 'selected_title', 'selectedRowTitle', 'selectedId', 'selected_id', 'selectedRowId', 'buttonText', 'button_text', 'payload']) {
    if (typeof o[k] === 'string' && o[k].trim()) return o[k].trim();
  }
  if (typeof o.title === 'string' && o.title) return o.title.trim();
  if (typeof o.text === 'string') return o.text.trim();
  if (o.text && typeof o.text === 'object') return str(o.text.body);
  if (typeof o.body === 'string') return o.body.trim();
  if (typeof o.message === 'string') return o.message.trim();
  return '';
}

/** Last resort: search any depth (and JSON hidden inside strings) for a list_reply / button_reply / selected option. */
function deepReply(node, depth = 0) {
  if (node === undefined || node === null || depth > 6) return '';
  if (typeof node === 'string') {
    const s = node.trim();
    if (s && (s[0] === '{' || s[0] === '[')) {
      try { return deepReply(JSON.parse(s), depth + 1); } catch (_e) { return ''; }
    }
    return '';
  }
  if (typeof node !== 'object') return '';
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = deepReply(item, depth + 1);
      if (r) return r;
    }
    return '';
  }
  for (const k of ['list_reply', 'button_reply', 'reply', 'selectedOption', 'selected_option']) {
    if (node[k] && typeof node[k] === 'object') {
      const r = str(node[k].title) || str(node[k].id) || str(node[k].text);
      if (r) return r;
    }
  }
  for (const k of ['selectedTitle', 'selected_title', 'selectedRowTitle', 'selectedId', 'selected_id', 'buttonText', 'button_text']) {
    if (typeof node[k] === 'string' && node[k].trim()) return node[k].trim();
  }
  for (const v of Object.values(node)) {
    const r = deepReply(v, depth + 1);
    if (r) return r;
  }
  return '';
}

const MEDIA_TYPES = ['image', 'document', 'video'];
const IGNORED_MEDIA = ['audio', 'voice', 'sticker'];

function pickMedia(type, content, m0) {
  const src = (content && typeof content === 'object' && content) || (m0 && m0[type]) || {};
  const nested = src[type] && typeof src[type] === 'object' ? src[type] : src;
  const url = str(nested.url) || str(nested.link) || str(nested.media_url) || str(nested.mediaUrl) || str(nested.file) || str(nested.fileUrl);
  return {
    url,
    filename: str(nested.filename) || str(nested.file_name) || str(nested.fileName) || str(nested.name),
    mimeType: str(nested.mime_type) || str(nested.mimeType) || str(nested.mimetype) || str(nested.contentType),
  };
}

const URL_KEYS = ['url', 'link', 'media_url', 'mediaUrl', 'fileUrl', 'file_url', 'downloadUrl', 'download_url', 'file', 'src'];

/** Searches any depth (and JSON hidden inside strings) for an object that carries a file download link. */
function findMedia(node, depth = 0) {
  if (node === undefined || node === null || depth > 6) return null;
  if (typeof node === 'string') {
    const s = node.trim();
    if (s && (s[0] === '{' || s[0] === '[')) {
      try { return findMedia(JSON.parse(s), depth + 1); } catch (_e) { return null; }
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = findMedia(item, depth + 1);
      if (r) return r;
    }
    return null;
  }
  for (const k of URL_KEYS) {
    const v = node[k];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
      return {
        url: v.trim(),
        filename: str(node.filename) || str(node.file_name) || str(node.fileName) || str(node.name),
        mimeType: str(node.mime_type) || str(node.mimeType) || str(node.mimetype) || str(node.contentType),
      };
    }
  }
  for (const v of Object.values(node)) {
    const r = findMedia(v, depth + 1);
    if (r) return r;
  }
  return null;
}

function parseInbound(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const direction = String(b.direction || '').toLowerCase();
  if (direction === 'outbound') return { kind: 'ignore', reason: 'outbound event' };

  const messages = safeJson(b.messages);
  const m0 = Array.isArray(messages) ? messages[0] : messages && typeof messages === 'object' ? messages : null;

  const number = digits(b.customerNumber || b.from || b.sender || b.waId || (m0 && (m0.from || m0.sender || m0.customerNumber || m0.waId)));
  if (!number) return { kind: 'ignore', reason: 'no sender number' };

  const eventId =
    str(b.uuid) || (m0 && str(m0.id || m0.messageId || m0.wamid)) || str(b.requestId) || str(b.messageId) ||
    'h_' + crypto.createHash('sha1').update(JSON.stringify([number, b.content, b.messages, b.requestedAt, b.timestamp])).digest('hex');

  const rawType = String(b.contentType || (m0 && (m0.type || m0.contentType)) || '').toLowerCase();
  let type = rawType.replace(/_message$/, '');
  // MSG91 can label a file as "text" at the top while the message itself says "document".
  const msgType = m0 ? String(m0.type || m0.contentType || '').toLowerCase().replace(/_message$/, '') : '';
  if (MEDIA_TYPES.includes(msgType) && !MEDIA_TYPES.includes(type)) type = msgType;

  const content = safeJson(b.content);
  const interactive = safeJson(b.interactive);
  const button = safeJson(b.button);
  const base = { number, eventId };

  if (MEDIA_TYPES.includes(type)) {
    const media = pickMedia(type, content, m0);
    return media.url ? { ...base, kind: 'media', media: { ...media, type } } : { ...base, kind: 'unsupported', media: { ...media, type }, reason: `${type} without a URL` };
  }
  if (IGNORED_MEDIA.includes(type) || ['location', 'contacts', 'reaction', 'order', 'system'].includes(type)) {
    return { ...base, kind: 'unsupported', reason: type };
  }

  // A file whose type name we do not know (e.g. "file", "attachment"): recognise it by its download link.
  if (!/interactive|list|button|reply|selection|quick/.test(rawType)) {
    const found = findMedia([content, messages, interactive, button]);
    if (found) {
      const mime = found.mimeType.toLowerCase();
      const kindOfFile = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document';
      return { ...base, kind: 'media', media: { ...found, type: kindOfFile } };
    }
  }

  const replyText = pickReply(interactive) || pickReply(button);
  // Any type name that mentions a list/button/reply selection counts as a tap (e.g. interactive, list_reply, button_reply).
  const looksInteractive = /interactive|list|button|reply|selection|quick/.test(rawType);
  if (type === 'interactive' || type === 'button' || looksInteractive || (replyText && (interactive || button))) {
    const t = replyText || pickReply(content) || (m0 ? pickReply(m0) : '') || deepReply([content, interactive, button, messages]);
    return t ? { ...base, kind: 'choice', text: t } : { ...base, kind: 'ignore', reason: 'empty interactive reply' };
  }

  const text = pickReply(content) || (m0 && pickReply(m0.text || m0)) || (typeof b.content === 'string' && !unfilled(b.content) ? b.content.trim() : '');
  if (text) return { ...base, kind: 'text', text };

  // Nothing readable at the usual places: look anywhere in the payload for a tapped option.
  const hidden = deepReply([content, interactive, button, messages]);
  if (hidden) return { ...base, kind: 'choice', text: hidden };

  return { ...base, kind: 'ignore', reason: 'no text/media in payload' };
}

module.exports = { parseInbound, pickReply, safeJson };
