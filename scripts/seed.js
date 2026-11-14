'use strict';

/* npm run seed  - creates the default bot and (optionally) the first admin from ADMIN_EMAIL / ADMIN_PASSWORD. */
const env = require('../config/env');
env.validate();
const { connectDB, disconnectDB } = require('../config/db');
const botService = require('../services/botService');
const User = require('../models/User');

(async () => {
  await connectDB();
  const bot = await botService.ensureDefaultBot();
  console.log(`Bot ready: ${bot.slug}`);

  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    const exists = await User.findOne({ role: 'admin', email: env.ADMIN_EMAIL });
    if (exists) console.log(`Admin already exists: ${env.ADMIN_EMAIL}`);
    else {
      await User.create({ role: 'admin', name: 'Administrator', email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
      console.log(`Admin created: ${env.ADMIN_EMAIL}`);
    }
  } else {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set - skipping admin creation.');
  }
  await disconnectDB();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
