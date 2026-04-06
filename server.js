'use strict';

const express = require('express');
const http    = require('http');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const { Server } = require('socket.io');
const helmet  = require('helmet');

const { registerLobbyHandlers }     = require('./src/socket/lobbyHandlers');
const { registerGameHandlers }      = require('./src/socket/gameHandlers');
const { registerBluffHandlers }     = require('./src/socket/bluffHandlers');
const { registerDisconnectHandler } = require('./src/socket/disconnectHandler');
const { registerReconnectHandler }  = require('./src/socket/reconnectHandler');
const { startRoomCleaner }          = require('./src/room/RoomCleaner');
const { secureSocket }              = require('./src/security/SocketMiddleware');
const { logger }                    = require('./src/monitoring/logger');
const { inc, set, get: getMetrics } = require('./src/monitoring/metrics');
const { initSentry, sentryErrorHandler, setupGlobalErrorHandlers, captureError } = require('./src/monitoring/sentry');

const app = express();

// ── Initialisation Sentry (avant les routes) ───────────────
initSentry(app);
setupGlobalErrorHandlers();

// ── Sécurité HTTP ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc    : ["'self'"],
      scriptSrc     : ["'self'"],
      scriptSrcAttr : ["'unsafe-inline'"],
      styleSrc      : ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc       : ["'self'", 'https://fonts.gstatic.com'],
      connectSrc    : ["'self'", 'wss:', 'ws:'],
      imgSrc        : ["'self'", 'data:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.disable('x-powered-by');

// ── CORS ─────────────────────────────────────────────────
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

// ── Fichiers statiques ───────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes de test et métriques ───────────────────────────
app.get('/test-sentry', (req, res) => {
  throw new Error('Test Sentry 🚀'); // Sentry captera cette erreur
});

app.get('/metrics', (req, res) => {
  res.json(getMetrics());
});

// ── Serveur HTTP / HTTPS ─────────────────────────────────
let server;
const HTTPS_KEY  = process.env.HTTPS_KEY;
const HTTPS_CERT = process.env.HTTPS_CERT;

if (HTTPS_KEY && HTTPS_CERT && fs.existsSync(HTTPS_KEY) && fs.existsSync(HTTPS_CERT)) {
  server = https.createServer(
    { key: fs.readFileSync(HTTPS_KEY), cert: fs.readFileSync(HTTPS_CERT) },
    app
  );
  console.log('[Security] Mode HTTPS activé');
} else {
  server = http.createServer(app);
  if (process.env.NODE_ENV === 'production') {
    console.warn('[Security] HTTPS non configuré — recommandé en production !');
  }
}

// ── Socket.io ─────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGIN, methods: ['GET','POST'] },
  maxHttpBufferSize: 1e4, // 10 Ko
});

// ── Stockage en mémoire ───────────────────────────────────
const rooms = new Map();
startRoomCleaner(rooms, io);

// ── Handlers Socket.io ───────────────────────────────────
io.on('connection', socket => {
  inc('connectionsTotal');
  inc('connectionsActive');
  logger.debug('Socket', 'Nouvelle connexion', { socketId: socket.id });

  socket.on('disconnect', () => set('roomsActive', rooms.size));

  secureSocket(socket);

  // Wrapper pour capturer les erreurs dans Socket.io
  const safeHandler = (fn) => (...args) => {
    try { fn(...args); }
    catch (err) { captureError(err, { socketId: socket.id }); }
  };

  registerReconnectHandler(socket, io, rooms);
  registerLobbyHandlers(socket, io, rooms, safeHandler);
  registerGameHandlers(socket, io, rooms, safeHandler);
  registerBluffHandlers(socket, io, rooms, safeHandler);
  registerDisconnectHandler(socket, io, rooms, safeHandler);
});

// ── Sentry errorHandler (DOIT être après toutes les routes) ─────────────────────────
// Capture les erreurs Express et les envoie à Sentry
sentryErrorHandler(app);

// Fallback error handler pour répondre au client
app.use((err, req, res, _next) => {
  captureError(err, { url: req.url, method: req.method });
  res.status(err.status ?? 500).json({ error: err.message ?? 'Erreur serveur' });
});

// ── Démarrage du serveur ─────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const proto = (HTTPS_KEY && HTTPS_CERT) ? 'https' : 'http';
  logger.info('Server', `🎲 Atouts Mythiques démarré`, { url: `${proto}://localhost:${PORT}`, env: process.env.NODE_ENV ?? 'development' });
});