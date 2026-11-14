'use strict';

const Bot = require('../models/Bot');
const Conversation = require('../models/Conversation');
const env = require('../config/env');
const AppError = require('../utils/AppError');

async function ensureDefaultBot() {
  return Bot.findOneAndUpdate(
    { slug: env.DEFAULT_BOT_SLUG },
    {
      $setOnInsert: {
        slug: env.DEFAULT_BOT_SLUG,
        name: 'Brightech WhatsApp Chatbot',
        displayName: 'Brightech Group',
        subtitle: 'Business account',
        description: 'Industrial automation, repair, robotics, BMS and recruitment enquiries.',
        timezone: env.DEFAULT_TIMEZONE,
        timeFormat: env.DEFAULT_TIME_FORMAT,
        bookingMaxDaysAhead: env.BOOKING_MAX_DAYS_AHEAD,
        referencePrefix: env.REFERENCE_PREFIX,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function getActiveBySlug(slug) {
  const bot = await Bot.findOne({ slug: slug || env.DEFAULT_BOT_SLUG, isActive: true });
  if (!bot) throw AppError.notFound('Bot not found or disabled', 'BOT_NOT_FOUND');
  return bot;
}

async function getById(id) {
  const bot = await Bot.findById(id);
  if (!bot) throw AppError.notFound('Bot not found', 'BOT_NOT_FOUND');
  return bot;
}

const publicView = (bot) => ({
  slug: bot.slug,
  displayName: bot.displayName,
  subtitle: bot.subtitle,
  timezone: bot.timezone,
  timeFormat: bot.timeFormat,
  bookingMaxDaysAhead: bot.bookingMaxDaysAhead,
  timeSlots: ['Morning', 'Afternoon', 'Evening', 'No preference'],
});

async function remove(id) {
  const bot = await getById(id);
  const inUse = await Conversation.exists({ bot: bot._id });
  if (inUse) throw AppError.conflict('This bot has conversations. Disable it (isActive=false) instead of deleting.', 'BOT_IN_USE');
  await bot.deleteOne();
  return bot;
}

module.exports = { ensureDefaultBot, getActiveBySlug, getById, publicView, remove };
