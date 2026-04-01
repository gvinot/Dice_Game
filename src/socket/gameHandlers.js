'use strict';

const { DieType, TRUMP_TYPES, NORMAL_TYPES } = require('../engine/DieType');
const { rollDie }                            = require('../engine/Die');
const { getValidIndices }                    = require('../engine/TrickResolver');
const { publicRoom }                         = require('../room/RoomFactory');
const { startRound, doResolveTrick, doEndRound } = require('../room/GameFlow');

function registerGameHandlers(socket, io, rooms) {

  // ── Placer un pari ───────────────────────────────────────
  socket.on('place-bet', ({ code, bet }) => {
    const room   = rooms.get(code);
    if (!room || room.phase !== 'betting') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.bet !== null)    return;
    if (bet < 0 || bet > room.roundNumber) return;

    player.bet = bet;

    if (room.players.every(p => p.bet !== null)) {
      room.phase              = 'playing';
      room.currentPlayerIndex = room.currentStarterIndex;
    }

    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Jouer un dé ──────────────────────────────────────────
  socket.on('play-die', ({ code, dieIndex }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'playing') return;
    if (room.bluffWindowTimer) return; // fenêtre bluff ouverte, pas de jeu

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer?.id !== socket.id)                       return;
    if (dieIndex < 0 || dieIndex >= currentPlayer.hand.length) return;

    // Validation règle de couleur
    const mustFollow = room.accusedMustFollow;
    if (mustFollow && mustFollow.playerId === socket.id) {
      // Accusé contraint : couleur ou atout obligatoire même en mode bluff
      const validIndices = getValidIndices(currentPlayer.hand, room.currentTrick);
      if (!validIndices.includes(dieIndex)) {
        return socket.emit('error', 'Vous devez jouer la couleur ou un atout après un bluff confirmé !');
      }
      room.accusedMustFollow = null; // contrainte levée après ce coup
    } else if (!room.bluffMode) {
      const validIndices = getValidIndices(currentPlayer.hand, room.currentTrick);
      if (!validIndices.includes(dieIndex)) {
        return socket.emit('error', 'Vous devez suivre la couleur ou jouer un atout !');
      }
    }

    const dieType = currentPlayer.hand.splice(dieIndex, 1)[0];
    const roll    = rollDie(dieType);

    room.currentTrick.push({
      playerId      : socket.id,
      playerName    : currentPlayer.name,
      dieType,
      roll,
      order         : room.currentTrick.length,
      remainingHand : [...currentPlayer.hand],
      hadOnlyOneDie : currentPlayer.hand.length === 0,
    });

    const playersPlayed = new Set(room.currentTrick.map(p => p.playerId));
    const allPlayed     = playersPlayed.size === room.players.length;

    if (allPlayed) {
      if (room.bluffMode) {
        // Fenêtre de 4s pour accuser avant résolution
        room.bluffCalledThisTrick = false;
        room.bluffWindowTimer     = true;
        io.to(room.code).emit('room-updated', publicRoom(room));

        setTimeout(() => {
          if (room.bluffWindowTimer && room.phase === 'playing') {
            room.bluffWindowTimer = false;
            doResolveTrick(room, io);
          }
        }, 4000);
      } else {
        doResolveTrick(room, io);
      }
    } else {
      room.bluffCalledThisTrick = false;
      room.currentPlayerIndex   = (room.currentPlayerIndex + 1) % room.players.length;
      io.to(room.code).emit('room-updated', publicRoom(room));
    }
  });

  // ── Pli suivant (chef uniquement) ────────────────────────
  socket.on('next-trick', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'trick-result' || room.hostId !== socket.id) return;

    const roundOver   = room.players.every(p => p.hand.length === 0);
    room.currentTrick = [];

    if (roundOver) {
      doEndRound(room, io);
    } else {
      room.phase                = 'playing';
      room.currentPlayerIndex   = room.currentStarterIndex;
      room.bluffCalledThisTrick = false;
      room.bluffWindowTimer     = false;
      room.accusedMustFollow    = null;
      io.to(room.code).emit('room-updated', publicRoom(room));
    }
  });

  // ── Manche suivante (chef uniquement) ────────────────────
  socket.on('next-round', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'round-score' || room.hostId !== socket.id) return;
    room.roundNumber++;
    startRound(room, io);
  });
}

module.exports = { registerGameHandlers };
