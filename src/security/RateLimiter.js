'use strict';

/**
 * Rate limiter par socket.
 * Chaque socket a un compteur glissant par type d'événement.
 * Si la limite est dépassée, l'événement est silencieusement ignoré
 * et un avertissement est envoyé au client.
 */

// Limites par événement (nb max d'appels par fenêtre de temps)
const LIMITS = {
  'create-room'        : { max: 5,  windowMs: 60_000 }, // 5 créations/min
  'join-room'          : { max: 10, windowMs: 60_000 }, // 10 tentatives/min
  'place-bet'          : { max: 5,  windowMs: 10_000 }, // 1 pari par coup suffit
  'play-die'           : { max: 20, windowMs: 10_000 }, // anti-double-clic
  'call-bluff'         : { max: 5,  windowMs: 10_000 },
  'continue-after-bluff': { max: 5, windowMs: 10_000 },
  'next-trick'         : { max: 5,  windowMs: 10_000 },
  'next-round'         : { max: 5,  windowMs: 10_000 },
  'set-max-rounds'     : { max: 20, windowMs: 10_000 },
  'set-bluff-mode'     : { max: 10, windowMs: 10_000 },
  'reconnect-session'  : { max: 5,  windowMs: 30_000 },
  'vote-restart'       : { max: 3,  windowMs: 10_000 },
  'launch-restart'     : { max: 5,  windowMs: 10_000 },
  'start-game'         : { max: 5,  windowMs: 10_000 },
  // Défaut pour tout autre événement
  '__default__'        : { max: 30, windowMs: 10_000 },
};

/**
 * Crée un rate limiter pour un socket donné.
 * @returns {Function} checkLimit(eventName) → true si autorisé, false si bloqué
 */
function createRateLimiter(socket) {
  // Map eventName → { count, resetAt }
  const counters = new Map();

  function checkLimit(eventName) {
    const cfg = LIMITS[eventName] ?? LIMITS['__default__'];
    const now = Date.now();

    let entry = counters.get(eventName);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + cfg.windowMs };
      counters.set(eventName, entry);
    }

    entry.count++;

    if (entry.count > cfg.max) {
      console.warn(`[RateLimit] ${socket.id} — ${eventName} (${entry.count}/${cfg.max})`);
      socket.emit('game-error', 'Trop de requêtes. Attendez un instant.');
      return false;
    }

    return true;
  }

  return checkLimit;
}

module.exports = { createRateLimiter };
