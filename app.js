'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const sanitize = require('./middleware/sanitize');
const limiters = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const contact = require('./utils/contact');

const app = express();

app.set('trust proxy', env.TRUST_PROXY); // set TRUST_PROXY=1 behind nginx / a load balancer
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'media-src': ["'self'", 'blob:'],
        'connect-src': ["'self'", 'ws:', 'wss:', ...env.corsOrigins.filter((o) => o !== '*')],
        'object-src': ["'none'"],
        'frame-ancestors': ["'self'"],
        'upgrade-insecure-requests': env.isProd ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const CORS_HEADERS = ['Content-Type', 'Authorization', 'X-Socket-Id', 'X-Setup-Key'];
app.use(
  cors((req, cb) => {
    // A page served by this bot (like the Pick date page) sends its own address as the Origin when it saves:
    // that is always allowed. Other websites must be listed in CORS_ORIGINS.
    const origin = req.header('Origin');
    const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim().toLowerCase();
    let ownPage = false;
    try {
      ownPage = !!origin && new URL(origin).host.toLowerCase() === host;
    } catch (_e) {
      ownPage = false; // not a real address
    }
    const allowed = !origin || ownPage || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin);
    cb(allowed ? null : new Error('CORS_NOT_ALLOWED'), { origin: allowed, methods: CORS_METHODS, allowedHeaders: CORS_HEADERS, maxAge: 600 });
  })
);

if (env.NODE_ENV !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));

// Delivery reports from MSG91 (3 or 4 per message). MSG91 PAUSES a webhook that gets a 4xx answer, so this route is read
// before everything else, is not rate limited, and answers 200 even when the body is not valid JSON.
app.post('/api/webhooks/msg91/report', express.json({ limit: '50kb' }), (_err, _req, res, _next) => res.status(200).json({ success: true }), require('./controllers/msg91Controller').report);

app.use(express.json({ limit: '50kb' }));
app.use(sanitize);

// the welcome poster (WhatsApp downloads it from this address)
app.get('/assets/welcome.jpg', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/jpeg').send(require('./services/welcomeImage').welcomeJpg);
});
// "Email your Enquiry" / "Call us for support" links from the WhatsApp bot: WhatsApp cannot open mailto: / tel: by itself,
// so these two small pages open the email app / the phone dialer.
app.get('/go/email', limiters.chat, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(contact.openPage('Email your Enquiry', `Opening your email app to write to ${contact.emailFor(req.query.t)}...`, contact.mailto(contact.clip(req.query.p), req.query.t), 'Open email'));
});
app.get('/go/call', limiters.chat, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.type('html').send(contact.openPage('Call us for support', `Calling ${contact.PHONE_SHOW}...`, contact.tel(), `Call ${contact.PHONE_SHOW}`));
});
app.use('/pick', limiters.chat, require('./routes/pickerRoutes')); // page opened from the WhatsApp "Pick date and time" button
app.use('/api', limiters.global, routes);
app.use('/api', notFound);

const publicDir = path.join(__dirname, 'public');
if (env.SERVE_FRONTEND && require('fs').existsSync(publicDir)) {
  app.use(express.static(publicDir, { maxAge: env.isProd ? '1h' : 0, index: 'index.html' }));
} else {
  app.get('/', (_req, res) => res.json({ success: true, data: { service: 'brightech-bot-backend', status: 'running', health: '/api/health' } }));
}

app.use(errorHandler);

module.exports = app;
