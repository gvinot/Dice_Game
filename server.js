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

const app = express();

// ── Sécurité HTTP ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc    : ["'self'"],
      scriptSrc     : ["'self'"],
      // Les handlers onclick="..." dans le HTML nécessitent unsafe-hashes ou unsafe-inline.
      // On désactive la directive stricte sur les attributs pour rester compatible
      // avec le HTML actuel. À remplacer par des écouteurs JS dans feat/design.
      scriptSrcAttr : ["'unsafe-inline'"],
      styleSrc      : ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc       : ["'self'", 'https://fonts.gstatic.com'],
      connectSrc    : ["'self'", 'wss:', 'ws:'],
      imgSrc        : ["'self'", 'data:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Pas de header X-Powered-By
app.disable('x-powered-by');

// ── CORS : restreindre l'origine autorisée ────────────────
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*'; // en prod : mettre votre domaine

// ── Fichiers statiques ────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Serveur HTTP ou HTTPS ─────────────────────────────────
let server;
const HTTPS_KEY  = process.env.HTTPS_KEY;   // chemin vers la clé privée
const HTTPS_CERT = process.env.HTTPS_CERT;  // chemin vers le certificat

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
  cors: {
    origin : ALLOWED_ORIGIN,
    methods : ['GET', 'POST'],
  },
  // Limites de taille pour éviter les payloads géants
  maxHttpBufferSize: 1e4, // 10 Ko max par message
});

// ── Stockage en mémoire ───────────────────────────────────
const rooms = new Map();

startRoomCleaner(rooms, io);

// ── Handlers ─────────────────────────────────────────────
io.on('connection', socket => {
  // Sécuriser toutes les socket.on() de ce socket (rate limit + validation)
  secureSocket(socket);

  registerReconnectHandler(socket, io, rooms);
  registerLobbyHandlers(socket, io, rooms);
  registerGameHandlers(socket, io, rooms);
  registerBluffHandlers(socket, io, rooms);
  registerDisconnectHandler(socket, io, rooms);
});

// ── Démarrage ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const proto = (HTTPS_KEY && HTTPS_CERT) ? 'https' : 'http';
  console.log(`🎲 Atouts Mythiques — ${proto}://localhost:${PORT}`);
});
