'use strict';

const { createRateLimiter } = require('./RateLimiter');
const { validate }          = require('./Validator');

/**
 * Applique le rate limiting et la validation sur tous les événements d'un socket.
 * Remplace socket.on par une version sécurisée.
 *
 * Usage : au début de io.on('connection'), appeler secureSocket(socket).
 * Ensuite les handlers s'enregistrent normalement avec socket.on(…).
 */
function secureSocket(socket) {
  const checkLimit  = createRateLimiter(socket);
  const originalOn  = socket.on.bind(socket);

  // Événements internes Socket.io à ne pas intercepter
  const BYPASS = new Set(['connect', 'disconnect', 'error', 'connect_error']);

  socket.on = function securedOn(eventName, handler) {
    if (BYPASS.has(eventName)) {
      return originalOn(eventName, handler);
    }

    return originalOn(eventName, (rawPayload) => {
      // 1. Rate limiting
      if (!checkLimit(eventName)) return;

      // 2. Validation et sanitisation
      const result = validate(eventName, rawPayload);
      if (!result.ok) {
        console.warn(`[Validation] ${socket.id} — ${eventName}: ${result.reason}`);
        socket.emit('error', result.reason);
        return;
      }

      // 3. Appel du handler avec le payload nettoyé
      handler(result.data);
    });
  };
}

module.exports = { secureSocket };
