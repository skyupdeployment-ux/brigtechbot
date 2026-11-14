'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const env = require('../../config/env');
const { isSupported } = require('../../middleware/upload');

const EXT_BY_MIME = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'application/pdf': '.pdf', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/3gpp': '.3gp', 'video/webm': '.webm',
  'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx', 'text/plain': '.txt',
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]));
MIME_BY_EXT['.jpeg'] = 'image/jpeg';

function hostAllowed(host) {
  const h = host.toLowerCase();
  return env.MSG91_MEDIA_HOSTS.some((a) => h === a || h.endsWith('.' + a));
}

/** Downloads one inbound media file into UPLOAD_DIR; returns a multer-shaped file object. */
async function download(media) {
  let url;
  try { url = new URL(media.url); } catch (_e) { throw new Error('invalid media URL'); }
  if (url.protocol !== 'https:' && !(env.MSG91_MEDIA_ALLOW_HTTP && url.protocol === 'http:')) throw new Error('media URL must be https');
  if (!hostAllowed(url.hostname)) throw new Error(`media host "${url.hostname}" is not in MSG91_MEDIA_HOSTS`);

  const maxBytes = env.MAX_FILE_SIZE_MB * 1024 * 1024;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 60000);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'error' });
    if (!res.ok || !res.body) throw new Error(`media download failed (${res.status})`);
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('media file too large');

    const headerMime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    let mimetype = media.mimeType || (headerMime !== 'application/octet-stream' ? headerMime : '') || '';
    let originalname = media.filename || decodeURIComponent(path.basename(url.pathname)) || '';
    let ext = path.extname(originalname).toLowerCase();
    if (!ext) {
      ext = EXT_BY_MIME[mimetype] || '';
      originalname = (originalname || `whatsapp-${media.type || 'file'}`) + ext;
    }
    if (!mimetype) mimetype = MIME_BY_EXT[ext] || 'application/octet-stream';

    const supported = isSupported(originalname, mimetype);
    if (!supported) {
      await res.body.cancel().catch(() => {});
      return { supported: false, originalname, mimetype, size: 0 };
    }

    const filename = `${Date.now()}-${crypto.randomBytes(10).toString('hex')}${ext.replace(/[^.a-z0-9]/g, '')}`;
    const full = path.join(env.UPLOAD_DIR, filename);
    let size = 0;
    const limiter = async function* limit(source) {
      for await (const chunk of source) {
        size += chunk.length;
        if (size > maxBytes) throw new Error('media file too large');
        yield chunk;
      }
    };
    try {
      await pipeline(Readable.fromWeb(res.body), limiter, fs.createWriteStream(full));
    } catch (e) {
      await fs.promises.unlink(full).catch(() => {});
      throw e;
    }
    return { supported: true, originalname: originalname.slice(0, 255), mimetype, size, filename };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { download };
