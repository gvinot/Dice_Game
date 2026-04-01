'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const { registerLobbyHandlers }      = require('./src/socket/lobbyHandlers');
const { registerGameHandlers }       = require('./src/socket/gameHandlers');
const { registerBluffHandlers }      = require('./src/socket/bluffHandlers');
const { registerDisconnectHandler }  = require('./src/socket/disconnectHandler');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// Stockage en mémoire des salles (Map code → room)
const rooms = new Map();

// ── Enregistrement des handlers Socket.io ────────────────
io.on('connection', socket => {
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
