'use strict';

const { logger } = require('./logger');

/**
 * Métriques en mémoire — simples compteurs et jauges.
 * En production, ces valeurs peuvent être exposées via un endpoint /metrics
 * ou envoyées à un service externe (Datadog, Prometheus, etc.)
 */

const metrics = {
  // Connexions
  connectionsTotal    : 0,  // total depuis démarrage
  connectionsActive   : 0,  // actuellement connectés

  // Salles
  roomsCreated        : 0,
  roomsActive         : 0,  // mise à jour par le cleaner
  roomsPurged         : 0,

  // Parties
  gamesStarted        : 0,
  gamesCompleted      : 0,
  roundsPlayed        : 0,
  tricksResolved      : 0,

  // Bluff
  bluffsCalled        : 0,
  bluffsConfirmed     : 0,

  // Sécurité
  rateLimitHits       : 0,
  validationErrors    : 0,

  // Erreurs
  errorsTotal         : 0,

  // Reconnexions
  reconnectionsSuccess : 0,
  reconnectionsFailed  : 0,

  // Timestamp de démarrage
  startedAt           : new Date().toISOString(),
};

// ── Incrément ─────────────────────────────────────────────
function inc(key, amount = 1) {
  if (key in metrics) metrics[key] += amount;
}

function set(key, value) {
  if (key in metrics) metrics[key] = value;
}

function get() {
  return {
    ...metrics,
    uptimeSeconds: Math.floor((Date.now() - new Date(metrics.startedAt).getTime()) / 1000),
  };
}

// ── Log périodique des métriques (toutes les 30 min en prod) ──
const METRICS_LOG_INTERVAL = process.env.NODE_ENV === 'production'
  ? 30 * 60 * 1000
  : 0; // désactivé en dev

if (METRICS_LOG_INTERVAL > 0) {
  setInterval(() => {
    logger.info('Metrics', 'Snapshot périodique', get());
  }, METRICS_LOG_INTERVAL);
}

module.exports = { metrics, inc, set, get };
