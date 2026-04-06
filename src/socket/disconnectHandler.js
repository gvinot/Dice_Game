'use strict';

const { logger } = require('../monitoring/logger');
const { inc }    = require('../monitoring/metrics');

const { publicRoom }         = require('../room/RoomFactory');
const { doResolveTrick }     = require('../room/GameFlow');
const { startGracePeriod }   = require('../room/ReconnectionManager');
const { clearTurnTimer }     = require('../room/TurnTimer');

function registerDisconnectHandler(socket, io, rooms) {

  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      const player = room.players[idx];
      const phase  = room.phase;

      // Phases actives : grace period de 30s avant retrait définitif
      const activePhases = new Set([
        'waiting', 'betting', 'playing', 'trick-result',
        'round-score', 'bluff-check', 'game-over', 'restart-vote',
      ]);

      if (activePhases.has(phase)) {
        player.connected = false;
        io.to(code).emit('player-disconnected', {
          playerId   : socket.id,
          playerName : player.name,
          room       : publicRoom(room),
        });

        // Démarrage de la grace period
        startGracePeriod(room, socket.id, () => {
          finalizeDisconnect(code, room, socket.id, rooms, io);
        });

        logger.info('Disconnect', `Grace 30s → ${player.name}`, { code });
        inc('connectionsActive', -1);
      } else {
        finalizeDisconnect(code, room, socket.id, rooms, io);
      }

      // Si c'était son tour en cours → skip auto après 5s
      if (phase === 'playing' &&
          room.players[room.currentPlayerIndex]?.id === socket.id) {
        scheduleAutoSkip(room, io, rooms, code);
      }

      break;
    }
  });
}

// ── Retrait définitif ─────────────────────────────────────
function finalizeDisconnect(code, room, socketId, rooms, io) {
  const idx = room.players.findIndex(p => p.id === socketId);
  if (idx === -1) return;

  const [left] = room.players.splice(idx, 1);

  if (room.players.length === 0) {
    clearTurnTimer(room);
    rooms.delete(code);
    return;
  }

  if (room.hostId === socketId) room.hostId = room.players[0].id;

  if (room.currentStarterIndex >= room.players.length)
    room.currentStarterIndex = 0;
  if (room.currentPlayerIndex >= room.players.length)
    room.currentPlayerIndex  = room.currentPlayerIndex % room.players.length;

  io.to(code).emit('player-left', { name: left.name, room: publicRoom(room) });

  const phase = room.phase;

  if (phase === 'betting') {
    // 1 joueur restant → fin de partie immédiate
    if (room.players.length < 2) {
      clearTurnTimer(room);
      room.phase = 'game-over';
      io.to(code).emit('round-ended', {
        room: publicRoom(room), roundScores: {}, bluffScores: {}, isLastRound: true,
      });
      return;
    }
    // Tous ont misé → passer en jeu
    if (room.players.every(p => p.bet !== null)) {
      room.phase              = 'playing';
      room.currentPlayerIndex = room.currentStarterIndex;
      io.to(code).emit('room-updated', publicRoom(room));
    }
    return;
  }

  if (phase === 'playing') {
    room.currentTrick = room.currentTrick.filter(p => p.playerId !== socketId);
    const allPlayed   = new Set(room.currentTrick.map(p => p.playerId)).size
                        === room.players.length;
    if (allPlayed && room.currentTrick.length > 0) {
      doResolveTrick(room, io);
    } else {
      if (room.currentPlayerIndex >= room.players.length)
        room.currentPlayerIndex = 0;
      io.to(code).emit('room-updated', publicRoom(room));
    }
    return;
  }

  if (room.players.length < 2 &&
      ['betting', 'playing', 'trick-result', 'round-score'].includes(phase)) {
    clearTurnTimer(room);
    room.phase = 'game-over';
    io.to(code).emit('round-ended', {
      room        : publicRoom(room),
      roundScores : {},
      bluffScores : {},
      isLastRound : true,
    });
  }
}

// ── Skip automatique si déconnecté pendant son tour ───────
function scheduleAutoSkip(room, io, rooms, code) {
  setTimeout(() => {
    const cur = room.players[room.currentPlayerIndex];
    if (!cur || cur.connected !== false || room.phase !== 'playing') return;
    if (cur.hand.length === 0) return;

    const { rollDie } = require('../engine/Die');
    const dieType     = cur.hand.splice(0, 1)[0];
    const roll        = rollDie(dieType);

    room.currentTrick.push({
      playerId      : cur.id,
      playerName    : `${cur.name} (auto)`,
      dieType, roll,
      order         : room.currentTrick.length,
      remainingHand : [...cur.hand],
      hadOnlyOneDie : cur.hand.length === 0,
    });

    const played = new Set(room.currentTrick.map(p => p.playerId));
    if (played.size === room.players.length) {
      doResolveTrick(room, io);
    } else {
      room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
      io.to(code).emit('room-updated', publicRoom(room));
    }
  }, 5000); // 5s après déconnexion pour laisser une chance à la reconnexion
}

module.exports = { registerDisconnectHandler, finalizeDisconnect };
