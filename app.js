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

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS_NOT_ALLOWED'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Socket-Id', 'X-Setup-Key'],
    maxAge: 600,
  })
);

if (env.NODE_ENV !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));

app.use(express.json({ limit: '50kb' }));
app.use(sanitize);

// the welcome poster (WhatsApp downloads it from this address)
app.get('/assets/welcome.jpg', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/jpeg').send(require('./services/welcomeImage').welcomeJpg);
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
