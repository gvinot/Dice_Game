'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const { registerLobbyHandlers }      = require('./src/socket/lobbyHandlers');
const { registerGameHandlers }       = require('./src/socket/gameHandlers');
const { registerBluffHandlers }      = require('./src/socket/bluffHandlers');
const { registerDisconnectHandler }  = require('./src/socket/disconnectHandler');
const { registerReconnectHandler }   = require('./src/socket/reconnectHandler');
const { startRoomCleaner }           = require('./src/room/RoomCleaner');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── Stockage en mémoire des salles ────────────────────────
const rooms = new Map();

// ── Nettoyage périodique des salles abandonnées ───────────
startRoomCleaner(rooms, io);

// ── Handlers Socket.io ────────────────────────────────────
io.on('connection', socket => {
  registerReconnectHandler(socket, io, rooms);   // en premier : tente la restauration
  registerLobbyHandlers(socket, io, rooms);
  registerGameHandlers(socket, io, rooms);
  registerBluffHandlers(socket, io, rooms);
  registerDisconnectHandler(socket, io, rooms);
});

// ── Démarrage ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎲 Atouts Mythiques — http://localhost:${PORT}`);
});
