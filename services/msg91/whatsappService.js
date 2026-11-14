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
const { withLock } = require('../../utils/lock');
const logger = require('../../utils/logger');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      if (env.MSG91_SEND_GAP_MS) await sleep(env.MSG91_SEND_GAP_MS);
    }
  }
  return true;
}

async function handleOne(payload) {
  const ev = parseInbound(payload);
  if (ev.kind === 'ignore') {
    logger.debug('MSG91 webhook ignored:', ev.reason);
    return { handled: false, reason: ev.reason };
  }
  if (ev.number === env.MSG91_INTEGRATED_NUMBER) return { handled: false, reason: 'own number' };

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
        const text = ev.text.slice(0, 1000);
        result = await conversationService.sendMessage(conv._id, user, { type: ev.kind === 'choice' ? 'choice' : 'text', text }, {});
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
