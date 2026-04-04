'use strict';
const { TRUMP_TYPES, NORMAL_TYPES }          = require('../engine/DieType');
const { publicRoom }                         = require('../room/RoomFactory');
const { doResolveTrick }                     = require('../room/GameFlow');

function registerBluffHandlers(socket, io, rooms) {

  // ── Appeler un bluff ─────────────────────────────────────
  socket.on('call-bluff', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'playing' || !room.bluffMode) return;
    if (room.currentTrick.length === 0)  return;
    if (room.bluffCalledThisTrick)       return; // un seul bluff par coup

    const trick    = room.currentTrick;
    const leadType = trick[0].dieType;
    if (!NORMAL_TYPES.has(leadType))
      return socket.emit('game-error', 'Bluff impossible : l\'entame est un atout.');

    const lastPlay  = trick[trick.length - 1];
    const isSuspect = lastPlay.dieType !== leadType && !TRUMP_TYPES.has(lastPlay.dieType);
    if (!isSuspect)
      return socket.emit('game-error', 'Pas de bluff possible sur ce coup.');
    if (lastPlay.playerId === socket.id)
      return socket.emit('game-error', 'Vous ne pouvez pas vous accuser vous-même.');
    if (lastPlay.hadOnlyOneDie)
      return socket.emit('game-error', 'Bluff impossible : il n\'avait qu\'un seul dé.');

    const caller  = room.players.find(p => p.id === socket.id);
    const accused = room.players.find(p => p.id === lastPlay.playerId);
    if (!caller || !accused) return;

    room.bluffCalledThisTrick = true;
    room.bluffWindowTimer     = false; // stopper le timer de résolution

    const isBluff = lastPlay.remainingHand?.includes(leadType) ?? false;

    if (isBluff) {
      accused.bluffScore -= 20;
      caller.bluffScore  += 20;
      accused.hand.push(lastPlay.dieType);
      room.currentTrick = trick.filter(p => p.playerId !== accused.id);
    } else {
      caller.bluffScore -= 10;
    }

    room.phase      = 'bluff-check';
    room.bluffState = {
      callerId    : caller.id,
      callerName  : caller.name,
      accusedId   : accused.id,
      accusedName : accused.name,
      accusedDie  : lastPlay.dieType,
      leadType,
      isBluff,
      callerDelta : isBluff ? +20 : -10,
      accusedDelta: isBluff ? -20 : 0,
    };

    io.to(room.code).emit('bluff-resolved', {
      room       : publicRoom(room),
      bluffState : room.bluffState,
    });
  });

  // ── Continuer après résolution du bluff (chef) ───────────
  socket.on('continue-after-bluff', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'bluff-check' || room.hostId !== socket.id) return;

    const { isBluff, accusedId, leadType: bluffLeadType } = room.bluffState;
    room.bluffState           = null;
    room.bluffWindowTimer     = false;
    room.bluffCalledThisTrick = true;

    if (isBluff) {
      const idx = room.players.findIndex(p => p.id === accusedId);
      room.currentPlayerIndex = idx !== -1 ? idx : room.currentPlayerIndex;
      room.accusedMustFollow  = {
        playerId : accusedId,
        leadType : bluffLeadType ?? room.currentTrick[0]?.dieType,
      };
      room.phase = 'playing';
      io.to(room.code).emit('room-updated', publicRoom(room));

      const accusedPlayer = room.players.find(p => p.id === accusedId);
      if (accusedPlayer) {
        io.to(accusedId).emit('hand-updated', { hand: [...accusedPlayer.hand] });
      }
    } else {
      const allPlayed = new Set(room.currentTrick.map(p => p.playerId)).size >= room.players.length;
      if (allPlayed) {
        doResolveTrick(room, io);
      } else {
        room.phase = 'playing';
        io.to(room.code).emit('room-updated', publicRoom(room));
      }
    }
  });
}

module.exports = { registerBluffHandlers };
