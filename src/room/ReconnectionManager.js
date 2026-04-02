'use strict';

const GRACE_PERIOD_MS = 30 * 1000; // 30s pour se reconnecter

function genToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Génère et stocke un token de session pour un joueur actif.
 * Appelé à la création/entrée en salle.
 */
function assignSessionToken(room, socketId) {
  if (!room.sessionTokens) room.sessionTokens = {};
  const token = genToken();
  room.sessionTokens[socketId] = token;
  return token;
}

/**
 * Démarre la grace period de 30s après déconnexion.
 * Le token existant est déplacé dans `disconnected`.
 */
function startGracePeriod(room, socketId, onExpired) {
  if (!room.disconnected)   room.disconnected   = {};
  if (!room.sessionTokens)  room.sessionTokens  = {};

  const token = room.sessionTokens[socketId] ?? genToken();
  // Conserver dans disconnected pour la recherche à la reconnexion
  room.disconnected[socketId] = {
    token,
    timer     : setTimeout(() => {
      delete room.disconnected[socketId];
      delete room.sessionTokens[socketId];
      onExpired();
    }, GRACE_PERIOD_MS),
    expiresAt : Date.now() + GRACE_PERIOD_MS,
  };

  return token;
}

/**
 * Tente de reconnecter via token.
 * @returns {{ player, room, code } | null}
 */
function tryReconnect(rooms, token, newSocketId) {
  for (const [code, room] of rooms) {
    if (!room.disconnected) continue;

    for (const [oldId, entry] of Object.entries(room.disconnected)) {
      if (entry.token !== token) continue;

      clearTimeout(entry.timer);
      delete room.disconnected[oldId];

      const player = room.players.find(p => p.id === oldId);
      if (!player) return null;

      // Mettre à jour l'ID socket partout
      player.id        = newSocketId;
      player.connected = true;
      if (!room.sessionTokens) room.sessionTokens = {};
      delete room.sessionTokens[oldId];
      room.sessionTokens[newSocketId] = token;

      if (room.hostId === oldId) room.hostId = newSocketId;

      // Mettre à jour currentPlayerIndex si c'était son tour
      const idx = room.players.findIndex(p => p.id === newSocketId);
      if (room.currentPlayerIndex === room.players.findIndex((_, i) =>
          room.players[i].id === oldId)) {
        // déjà mis à jour via player.id
      }

      return { player, room, code };
    }
  }
  return null;
}

module.exports = { assignSessionToken, startGracePeriod, tryReconnect, GRACE_PERIOD_MS };
