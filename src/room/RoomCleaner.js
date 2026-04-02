'use strict';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;   // toutes les 5 minutes
const ROOM_MAX_IDLE_MS    = 2 * 60 * 60 * 1000; // 2 heures d'inactivité → suppression
const ROOM_WAITING_MAX_MS = 30 * 60 * 1000;  // 30 min en attente sans lancement → suppression

/**
 * Lance le nettoyage périodique des salles abandonnées.
 * @param {Map} rooms — la Map globale des salles
 * @param {object} io  — l'instance Socket.io (pour notifier si besoin)
 */
function startRoomCleaner(rooms, io) {
  setInterval(() => {
    const now     = Date.now();
    let purged    = 0;

    for (const [code, room] of rooms) {
      const idle = now - (room.lastActivity ?? now);

      // Salle vide → supprimer immédiatement
      if (room.players.length === 0) {
        rooms.delete(code);
        purged++;
        continue;
      }

      // Salle en attente depuis trop longtemps (joueurs inactifs)
      if (room.phase === 'waiting' && idle > ROOM_WAITING_MAX_MS) {
        io.to(code).emit('error', 'La salle a expiré par inactivité.');
        io.in(code).socketsLeave(code);
        rooms.delete(code);
        purged++;
        continue;
      }

      // Salle en jeu depuis trop longtemps sans activité
      if (idle > ROOM_MAX_IDLE_MS) {
        io.to(code).emit('error', 'La partie a expiré par inactivité (2h).');
        io.in(code).socketsLeave(code);
        rooms.delete(code);
        purged++;
      }
    }

    if (purged > 0) {
      console.log(`[Cleaner] ${purged} salle(s) purgée(s) — ${rooms.size} active(s)`);
    }
  }, CLEANUP_INTERVAL_MS);

  console.log(`[Cleaner] Démarré — vérification toutes les ${CLEANUP_INTERVAL_MS / 60000} min`);
}

/**
 * Met à jour le timestamp d'activité d'une salle.
 * À appeler à chaque action de jeu.
 */
function touchRoom(room) {
  room.lastActivity = Date.now();
}

module.exports = { startRoomCleaner, touchRoom };
