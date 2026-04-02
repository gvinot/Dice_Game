'use strict';

const TURN_TIMEOUT_MS  = 45 * 1000; // 45 secondes par tour
const BET_TIMEOUT_MS   = 60 * 1000; // 60 secondes pour parier

/**
 * Démarre un timer de tour.
 * Si le joueur n'agit pas dans le délai, son dé est joué automatiquement
 * (premier dé valide) ou son pari est fixé à 0.
 */
function startTurnTimer(room, io, onTimeout) {
  clearTurnTimer(room);

  room.turnTimer = setTimeout(() => {
    room.turnTimer = null;
    onTimeout();
  }, TURN_TIMEOUT_MS);

  // Communiquer le deadline aux clients
  room.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
}

function startBetTimer(room, io, onTimeout) {
  clearTurnTimer(room);

  room.turnTimer = setTimeout(() => {
    room.turnTimer = null;
    onTimeout();
  }, BET_TIMEOUT_MS);

  room.turnDeadline = Date.now() + BET_TIMEOUT_MS;
}

function clearTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer   = null;
    room.turnDeadline = null;
  }
}

module.exports = { startTurnTimer, startBetTimer, clearTurnTimer, TURN_TIMEOUT_MS, BET_TIMEOUT_MS };
