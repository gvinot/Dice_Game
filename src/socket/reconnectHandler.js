'use strict';

const { logger } = require('../monitoring/logger');
const { inc }    = require('../monitoring/metrics');

const { publicRoom }    = require('../room/RoomFactory');
const { tryReconnect }  = require('../room/ReconnectionManager');

function registerReconnectHandler(socket, io, rooms) {

  socket.on('reconnect-session', ({ token }) => {
    if (!token) return socket.emit('reconnect-failed', { reason: 'Token manquant.' });

    const result = tryReconnect(rooms, token, socket.id);
    if (!result) return socket.emit('reconnect-failed', { reason: 'Session expirée ou introuvable.' });

    const { player, room, code } = result;
    socket.join(code);

    io.to(code).emit('player-reconnected', {
      playerName : player.name,
      room       : publicRoom(room),
    });

    // Données de base communes à tous les états
    const base = {
      code,
      room   : publicRoom(room),
      hand   : [...player.hand],
      isHost : room.hostId === socket.id,
    };

    // Données supplémentaires selon la phase — pour restaurer le bon écran
    const phase = room.phase;
    let extra   = {};

    if (phase === 'trick-result' && room.lastTrickData) {
      extra = { lastTrickData: room.lastTrickData };
    }
    if ((phase === 'round-score' || phase === 'game-over') && room.lastRoundData) {
      extra = { lastRoundData: room.lastRoundData };
    }
    if (phase === 'betting') {
      // Renvoyer les mains privées (le round-started ne sera pas réémis)
      extra = { handForBetting: [...player.hand] };
    }

    socket.emit('reconnect-ok', { ...base, ...extra });

    logger.info('Reconnect', `${player.name} de retour`, { code, phase });
    inc('reconnectionsSuccess');
  });
}

module.exports = { registerReconnectHandler };
