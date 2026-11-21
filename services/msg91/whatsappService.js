'use strict';

/**
 * WhatsApp channel (MSG91): inbound webhook -> same bot engine as the web chat -> outbound via MSG91.
 * One customer user + one conversation per WhatsApp number.
 */

const env = require('../../config/env');
const User = require('../../models/User');
const Conversation = require('../../models/Conversation');
const InboundEvent = require('../../models/InboundEvent');
const botService = require('../botService');
const conversationService = require('../conversationService');
const activityService = require('../activityService');
const fileService = require('../fileService');
const client = require('./client');
const formatter = require('./formatter');
const media = require('./media');
const { parseInbound } = require('./parser');
const BotEngine = require('../flow/engine');
const { GREET, WELCOME, WELCOME_INTRO } = require('../flow/flows');
const { norm } = require('../../utils/text');
const { withLock } = require('../../utils/lock');
const logger = require('../../utils/logger');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- Safety net for file steps -------------------------------------------------------------
 * If a customer sends a file and we cannot download it (unknown MSG91 format, host not allowed ...),
 * the chat must not get stuck. When the bot is at a file step we accept the file by NAME, log a
 * [FILE FALLBACK] warning with MSG91's raw message, and let the flow continue.
 */
const FILE_NAME_RE = /\.(pdf|docx?|xlsx?|jpe?g|png|webp|gif|heic|heif|bmp|mp4|mov|3gp|webm|dwg|dxf|txt)$/i;
const MIME_BY_EXT = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', bmp: 'image/bmp',
  mp4: 'video/mp4', mov: 'video/quicktime', '3gp': 'video/3gpp', webm: 'video/webm', dwg: 'application/octet-stream', dxf: 'application/octet-stream',
};

function atMediaStep(conv) {
  try {
    const e = BotEngine.fromStored(conv.state, {});
    const st = e.curStep();
    return !!(e.isActive() && st && st.k === 'media');
  } catch (_e) {
    return false;
  }
}

/** Gives a file a name and MIME type the bot's file step will accept. */
function fileIdentity(name, type) {
  let n = String(name || '').trim().slice(0, 200);
  if (!FILE_NAME_RE.test(n)) {
    const ext = type === 'image' ? '.jpg' : type === 'video' ? '.mp4' : '.pdf';
    n = (n || (type === 'image' ? 'photo' : type === 'video' ? 'video' : 'document')) + ext;
  }
  const ext = n.split('.').pop().toLowerCase();
  return { name: n, mime: MIME_BY_EXT[ext] || 'application/octet-stream' };
}

async function acceptWithoutFile(conv, user, number, name, type, why, payload) {
  const f = fileIdentity(name, type);
  logger.warn(`[FILE FALLBACK] ${why} - accepting "${f.name}" without storing the file. Raw message: ${JSON.stringify(payload).slice(0, 1500)}`);
  const result = await conversationService.sendFiles(conv._id, user, [{ originalname: f.name, mimetype: f.mime, size: 0, filename: null }], [], {});
  await deliver(number, result.botMessages);
  return { handled: true, kind: 'file-fallback', enquiry: result.enquiry };
}

/**
 * The welcome after "Hi": ONE message - the poster picture with the company text as its caption. The menu follows from
 * the bot as usual. If the picture cannot be sent, or WhatsApp refuses the caption, the customer still gets the text
 * (the reason is written to the log).
 */
// Pause between two messages. MSG91 / WhatsApp deliver messages one by one and a very short pause lets them overtake each other
// (they arrived in the wrong order). 1.2 seconds keeps them in order. Set MSG91_SEND_GAP_MS in Railway to change it.
const gapMs = () => (process.env.MSG91_SEND_GAP_MS === undefined || process.env.MSG91_SEND_GAP_MS === '' ? 1200 : env.MSG91_SEND_GAP_MS);

async function sendWelcome(number) {
  let captioned = false;
  if (!env.PUBLIC_BASE_URL) logger.warn('Welcome picture skipped: the bot does not know its public address yet');
  else {
    try {
      // WELCOME_CAPTION=false (Railway): send the picture alone and the text as a normal message right after it
      const url = `${env.PUBLIC_BASE_URL}/assets/welcome.jpg`;
      if (process.env.WELCOME_CAPTION === 'false') await client.sendImage(number, url, '');
      else ({ captioned } = await client.sendImageWithText(number, url, WELCOME_INTRO));
      await sleep(Math.max(gapMs(), Number(process.env.WELCOME_PICTURE_DELAY_MS || 1500))); // let the picture arrive before the menu
    } catch (e) {
      logger.warn(`MSG91 picture send failed (${e.message}) - sending the text without the picture`);
    }
  }
  if (!captioned) {
    try {
      await client.sendText(number, WELCOME_INTRO);
    } catch (e) {
      logger.warn(`MSG91 welcome text failed: ${e.message}`);
    }
    if (gapMs()) await sleep(gapMs());
  }
}

async function findOrCreateConversation(number) {
  const bot = await botService.getActiveBySlug(env.DEFAULT_BOT_SLUG);
  let user = await User.findOne({ waNumber: number, role: 'customer' });
  if (!user) {
    try {
      user = await User.create({ role: 'customer', waNumber: number, phone: `+${number}`.slice(0, 20), timezone: bot.timezone, timeFormat: bot.timeFormat, lastSeenAt: new Date() });
    } catch (e) {
      if (e.code !== 11000) throw e;
      user = await User.findOne({ waNumber: number, role: 'customer' });
    }
  }
  let conv = await Conversation.findOne({ user: user._id, bot: bot._id, channel: 'whatsapp', status: { $in: ['active', 'ended'] } }).sort({ lastActivityAt: -1 });
  if (!conv) {
    conv = await conversationService.createConversation(user, bot, { channel: 'whatsapp' });
    await activityService.log('conversation_started', { user: user._id, conversation: conv._id, meta: { channel: 'whatsapp' } });
  }
  await User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } });
  return { user, conv };
}

/** Sends the bot's replies in order. Interactive payload first; plain-text fallback if MSG91 rejects it. */
async function deliver(number, botMessages) {
  for (const msg of botMessages) {
    for (const part of formatter.build(msg)) {
      try {
        if (part.kind === 'text') await client.sendText(number, part.text);
        else if (!env.MSG91_INTERACTIVE) await client.sendText(number, part.fallbackText);
        else {
          try {
            await client.sendInteractive(number, part.interactive);
          } catch (e) {
            logger.warn(`MSG91 interactive send failed (${e.message}) - sending plain text instead`);
            await client.sendText(number, part.fallbackText);
          }
        }
      } catch (e) {
        logger.error(`MSG91 send failed for ${number}: ${e.message}`);
        return false; // no point sending the rest if the key/IP/number is wrong
      }
      if (gapMs()) await sleep(gapMs());
    }
  }
  return true;
}

async function handleOne(payload) {
  const ev = parseInbound(payload);
  if (env.MSG91_LOG_RAW) logger.info('[MSG91 parsed]', ev.kind, ev.text ? JSON.stringify(ev.text) : '', ev.reason || '');
  if (ev.kind === 'ignore') {
    logger.info('MSG91 webhook ignored:', ev.reason);
    if (ev.reason === 'empty interactive reply' && ev.number && ev.number !== env.MSG91_INTEGRATED_NUMBER) {
      // The customer tapped something we could not read - never leave them in silence.
      await client
        .sendText(ev.number, 'Sorry, I could not read that selection. Please type the option number (for example 6) or its name.')
        .catch((e) => logger.warn(`MSG91 send failed: ${e.message}`));
    }
    return { handled: false, reason: ev.reason };
  }
  if (ev.number === env.MSG91_INTEGRATED_NUMBER) return { handled: false, reason: 'own number' };

  if (ev.kind === 'text' && /^bot version$/i.test(ev.text.trim())) {
    // a quick way to see which code is live, straight from WhatsApp
    const calendar = !!(env.DATETIME_PICKER && env.PUBLIC_BASE_URL);
    await client
      .sendText(ev.number, `Bot version: ${env.VERSION}\nCalendar booking: ${calendar ? 'ON' : 'OFF'}${calendar ? `\nCalendar address: ${env.PUBLIC_BASE_URL}` : ''}`)
      .catch((e) => logger.warn(`MSG91 send failed: ${e.message}`));
    return { handled: true, kind: 'version' };
  }

  return withLock(`wa:${ev.number}`, async () => {
    try {
      await InboundEvent.create({ eventId: ev.eventId, number: ev.number });
    } catch (e) {
      if (e.code === 11000) return { handled: false, reason: 'duplicate' };
      throw e;
    }

    try {
      const { user, conv } = await findOrCreateConversation(ev.number);
      let result;

      if (ev.kind === 'text' && FILE_NAME_RE.test(ev.text.trim()) && atMediaStep(conv)) {
        return acceptWithoutFile(conv, user, ev.number, ev.text.trim(), '', 'file arrived as a text message', payload);
      }

      if (ev.kind === 'unsupported' && ev.media && atMediaStep(conv)) {
        return acceptWithoutFile(conv, user, ev.number, ev.media.filename, ev.media.type, ev.reason || 'file without a download link', payload);
      }

      if (ev.kind === 'unsupported') {
        await client.sendText(ev.number, 'Sorry, I can only read text, list/button selections, photos, documents and videos. Please reply in one of those ways.');
        return { handled: true, kind: 'unsupported' };
      }

      if (ev.kind === 'media') {
        let file;
        try {
          file = await media.download(ev.media);
        } catch (e) {
          logger.warn(`MSG91 media download failed: ${e.message}`);
          if (atMediaStep(conv)) return acceptWithoutFile(conv, user, ev.number, ev.media.filename, ev.media.type, `download failed (${e.message})`, payload);
          await client.sendText(ev.number, 'Sorry, we could not receive that file. Please try sending it again.');
          return { handled: true, kind: 'media-error' };
        }
        const stored = file.supported ? [file] : [];
        const rejected = file.supported ? [] : [{ originalName: file.originalname, mimeType: file.mimetype, size: 0 }];
        try {
          result = await conversationService.sendFiles(conv._id, user, stored, rejected, {});
        } catch (e) {
          await fileService.remove(stored.map((f) => f.filename));
          throw e;
        }
      } else {
        // A tapped list row can arrive as "Title\nDescription" - the option name is the first line.
        let text = (ev.kind === 'choice' ? ev.text.split('\n')[0].trim() || ev.text : ev.text).slice(0, 1000);
        // At a file step typed text is never a valid answer, so a greeting means "start over".
        if (ev.kind === 'text' && /^(hi+|hello|hey|hai|menu|start|restart)$/i.test(text.trim()) && atMediaStep(conv)) text = 'main menu';
        result = await conversationService.sendMessage(conv._id, user, { type: ev.kind === 'choice' ? 'choice' : 'text', text }, {});
      }

      // "Hi" (or a first message) that brings up the main menu: poster + company text come first
      if (ev.kind === 'text' && (GREET.includes(norm(ev.text)) || conv.messageCount === 0) && result.botMessages.some((m) => m.list && (m.text || '') === WELCOME)) {
        await sendWelcome(ev.number);
      }
      await deliver(ev.number, result.botMessages);
      return { handled: true, kind: ev.kind, enquiry: result.enquiry };
    } catch (e) {
      await InboundEvent.deleteOne({ eventId: ev.eventId }).catch(() => {}); // allow a manual replay
      throw e;
    }
  });
}

/** Accepts one event or an array of events. Never throws (errors are logged). */
async function handleWebhook(body) {
  if (Math.random() < 0.02) {
    // housekeeping: forget de-dup records older than 7 days
    InboundEvent.deleteMany({ createdAt: { $lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } }).catch(() => {});
  }
  if (env.MSG91_LOG_RAW) logger.info('[MSG91 raw inbound]', JSON.stringify(body));
  const events = Array.isArray(body) ? body : [body];
  const results = [];
  for (const ev of events) {
    try {
      results.push(await handleOne(ev));
    } catch (e) {
      logger.error('MSG91 inbound processing failed:', e.message);
      results.push({ handled: false, error: e.message });
    }
  }
  return results;
}

module.exports = { handleWebhook, handleOne, deliver };
