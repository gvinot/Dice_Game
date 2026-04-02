'use strict';

const { publicRoom }              = require('../room/RoomFactory');
const { tryReconnect }            = require('../room/ReconnectionManager');

function registerReconnectHandler(socket, io, rooms) {

  socket.on('reconnect-session', ({ token }) => {
    if (!token) return socket.emit('reconnect-failed', { reason: 'Token manquant.' });

    const result = tryReconnect(rooms, token, socket.id);

    if (!result) {
      return socket.emit('reconnect-failed', { reason: 'Session expirée ou introuvable.' });
    }

    const { player, room, code } = result;

    // Rejoindre le channel socket.io
    socket.join(code);

    // Notifier tout le monde
    io.to(code).emit('player-reconnected', {
      playerName : player.name,
      room       : publicRoom(room),
    });

    // Renvoyer l'état complet au joueur reconnecté
    socket.emit('reconnect-ok', {
      code,
      room  : publicRoom(room),
      hand  : [...player.hand],         // sa main actuelle
      isHost: room.hostId === socket.id,
    });

    console.log(`[Reconnect] ${player.name} de retour [${code}]`);
  });
}

module.exports = { registerReconnectHandler };
