'use strict';

const { genCode, makePlayer, makeRoom, publicRoom } = require('../room/RoomFactory');
const { startRound }           = require('../room/GameFlow');
const { touchRoom }            = require('../room/RoomCleaner');
const { assignSessionToken }   = require('../room/ReconnectionManager');

const { setUserContext, addBreadcrumb } = require('../monitoring/sentry');

const JOINABLE_PHASES = new Set(['waiting', 'game-over', 'restart-vote']);

function registerLobbyHandlers(socket, io, rooms) {

  // ── Créer une salle ──────────────────────────────────────
  socket.on('create-room', ({ name, maxRounds }) => {
    const code   = genCode(rooms);
    const chosen = (maxRounds && maxRounds >= 1) ? maxRounds : 10;
    const room   = makeRoom(code, socket.id, name, chosen);

    rooms.set(code, room);
    socket.join(code);
    touchRoom(room);

    const token = assignSessionToken(room, socket.id);
    setUserContext(socket.id, name, code);
    addBreadcrumb('socket', 'Salle créée', { code, maxRounds: chosen });
    socket.emit('room-created', { code, room: publicRoom(room), reconnectToken: token });
  });

  // ── Rejoindre une salle ──────────────────────────────────
  socket.on('join-room', ({ code, name }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room)                                      return socket.emit('error', 'Salle introuvable.');
    if (!JOINABLE_PHASES.has(room.phase))           return socket.emit('error', 'Partie déjà commencée.');
    if (room.players.length >= 6)                   return socket.emit('error', 'Salle pleine (6 max).');
    if (room.players.some(p => p.id === socket.id)) return;

    room.players.push(makePlayer(socket.id, name));
    touchRoom(room);

    // Réduire les manches si nécessaire
    const newMax = Math.floor(36 / room.players.length);
    if ((room.chosenMaxRounds ?? room.maxRounds) > newMax) {
      room.chosenMaxRounds = newMax;
      room.maxRounds       = newMax;
    }

    socket.join(room.code);
    const token = assignSessionToken(room, socket.id);
    setUserContext(socket.id, name, room.code);
    addBreadcrumb('socket', 'Joueur rejoint', { code: room.code, name, playerCount: room.players.length });
    socket.emit('room-joined', { code: room.code, room: publicRoom(room), reconnectToken: token });
    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Modifier le nombre de manches (chef, attente) ────────
  socket.on('set-max-rounds', ({ code, maxRounds }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'waiting') return;
    const absoluteMax    = Math.floor(36 / room.players.length);
    const validated      = Math.max(1, Math.min(absoluteMax, maxRounds));
    room.chosenMaxRounds = validated;
    room.maxRounds       = validated;
    touchRoom(room);
    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Activer / désactiver le mode bluff (chef, attente) ───
  socket.on('set-bluff-mode', ({ code, enabled }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'waiting') return;
    room.bluffMode = !!enabled;
    touchRoom(room);
    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Lancer la partie ─────────────────────────────────────
  socket.on('start-game', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'waiting') return;
    if (room.players.length < 2) return socket.emit('error', 'Minimum 2 joueurs.');
    startRound(room, io);
  });

  // ── Proposer une nouvelle partie ─────────────────────────
  socket.on('request-restart', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'game-over') return;
    room.phase                   = 'restart-vote';
    room.restartVotes            = {};
    room.restartVotes[socket.id] = true;
    touchRoom(room);
    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Voter pour la nouvelle partie ────────────────────────
  socket.on('vote-restart', ({ code, vote }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'restart-vote') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    room.restartVotes[socket.id] = vote;
    touchRoom(room);
    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Lancer la nouvelle partie ────────────────────────────
  socket.on('launch-restart', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'restart-vote') return;
    if (room.players.length < 2) return socket.emit('error', 'Minimum 2 joueurs.');

    room.players
      .filter(p => room.restartVotes[p.id] === false)
      .forEach(p => {
        io.to(p.id).emit('kicked-to-lobby', { reason: 'Vous avez refusé la nouvelle partie.' });
        const s = io.sockets.sockets.get(p.id);
        if (s) s.leave(code);
      });

    room.players = room.players.filter(p => room.restartVotes[p.id] !== false);

    if (room.players.length < 2)
      return socket.emit('error', 'Pas assez de joueurs après les refus.');
    if (!room.players.find(p => p.id === room.hostId))
      room.hostId = room.players[0].id;

    room.players.forEach(p => { p.score = 0; });
    room.roundNumber         = 1;
    room.restartVotes        = {};
    room.currentStarterIndex = 0;
    room.currentPlayerIndex  = 0;
    touchRoom(room);
    startRound(room, io);
  });
}

module.exports = { registerLobbyHandlers };
