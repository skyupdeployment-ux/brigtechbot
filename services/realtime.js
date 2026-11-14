'use strict';

const { Server } = require('socket.io');
const env = require('../config/env');
const tokenService = require('./tokenService');
const User = require('../models/User');
const logger = require('../utils/logger');

let io = null;

function init(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins.includes('*') ? true : env.corsOrigins },
    maxHttpBufferSize: 1e5,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('AUTH_REQUIRED'));
      const payload = tokenService.verifyAccess(token);
      const user = await User.findById(payload.sub).select('role isActive');
      if (!user || !user.isActive) return next(new Error('AUTH_INVALID'));
      socket.data.userId = user._id.toString();
      socket.data.role = user.role;
      return next();
    } catch (_e) {
      return next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`); // all tabs/devices of one customer
    if (socket.data.role === 'admin') socket.join('admins');
  });

  logger.info('Socket.IO ready');
  return io;
}

/** Push a conversation update to the owner's other tabs (the sender already has it via REST). */
function toUser(userId, event, payload, exceptSocketId) {
  if (!io) return;
  let target = io.to(`user:${userId}`);
  if (exceptSocketId) target = target.except(exceptSocketId);
  target.emit(event, payload);
}

function toAdmins(event, payload) {
  if (io) io.to('admins').emit(event, payload);
}

module.exports = { init, toUser, toAdmins };
