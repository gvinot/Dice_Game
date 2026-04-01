'use strict';

const { publicRoom } = require('../room/RoomFactory');
const { doResolveTrick, doEndRound } = require('../room/GameFlow');

function registerDisconnectHandler(socket, io, rooms) {

  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      const [left] = room.players.splice(idx, 1);

      // Salle vide → supprimer
      if (room.players.length === 0) {
        rooms.delete(code);
        return;
      }

      // Transfert du rôle de chef
      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
      }

      // Ajuster les indices pour qu'ils ne pointent pas hors limites
      if (room.currentStarterIndex >= room.players.length) {
        room.currentStarterIndex = 0;
      }
      if (room.currentPlayerIndex >= room.players.length) {
        room.currentPlayerIndex = room.currentPlayerIndex % room.players.length;
      }

      io.to(code).emit('player-left', { name: left.name, room: publicRoom(room) });

      const phase = room.phase;

      // Phase paris : vérifier si tous les parieurs restants ont misé
      if (phase === 'betting') {
        if (room.players.every(p => p.bet !== null)) {
          room.phase              = 'playing';
          room.currentPlayerIndex = room.currentStarterIndex;
          io.to(code).emit('room-updated', publicRoom(room));
        }
      }

      // Phase jeu : retirer l'éventuel coup du déconnecté et résoudre si complet
      if (phase === 'playing') {
        room.currentTrick = room.currentTrick.filter(p => p.playerId !== socket.id);

        const allPlayed = new Set(room.currentTrick.map(p => p.playerId)).size === room.players.length;
        if (allPlayed && room.currentTrick.length > 0) {
          doResolveTrick(room, io);
        } else {
          if (room.currentPlayerIndex >= room.players.length) {
            room.currentPlayerIndex = 0;
          }
          io.to(code).emit('room-updated', publicRoom(room));
        }
      }

      // Moins de 2 joueurs en pleine partie → fin forcée
      if (room.players.length < 2 &&
          ['betting', 'playing', 'trick-result', 'round-score'].includes(phase)) {
        room.phase = 'game-over';
        io.to(code).emit('round-ended', {
          room        : publicRoom(room),
          roundScores : {},
          bluffScores : {},
          isLastRound : true,
        });
      }

      break;
    }
  });
}

module.exports = { registerDisconnectHandler };
