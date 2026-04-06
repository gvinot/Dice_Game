'use strict';

const { logger } = require('./logger');
const { get: getMetrics } = require('./metrics');

/**
 * Intégration Sentry complète.
 *
 * Fonctionnalités :
 *  - Capture d'erreurs (HTTP + Socket.io + globales)
 *  - Performance tracing (parties, manches, plis)
 *  - Breadcrumbs (fil d'Ariane des actions)
 *  - Contexte joueur/salle sur chaque erreur
 *  - Envoi périodique des métriques custom vers Sentry
 */

let Sentry = null;

// ── Initialisation ────────────────────────────────────────

function initSentry(app) {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.info('Sentry', 'SENTRY_DSN non défini — monitoring Sentry désactivé');
    return;
  }

  try {
    Sentry = require('@sentry/node');

    Sentry.init({
      dsn,
      environment      : process.env.NODE_ENV ?? 'development',
      release          : process.env.npm_package_version ?? '3.0.0',

      // Performance : capturer 100% en dev, 20% en prod
      tracesSampleRate : process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

      // Intégrations utiles pour Node.js
      integrations: [
        // Capture les requêtes HTTP sortantes
        new Sentry.Integrations.Http({ tracing: true }),
        // Contexte système (OS, mémoire, etc.)
        new Sentry.Integrations.Context(),
      ],

      // Filtrer les erreurs non pertinentes
      ignoreErrors: [
        'ECONNRESET',
        'EPIPE',
        'Transport closed',
      ],

      // Avant d'envoyer : enrichir avec nos métriques
      beforeSend(event) {
        // Ajouter un snapshot des métriques à chaque erreur
        event.extra = {
          ...(event.extra ?? {}),
          gameMetrics: getMetrics(),
        };
        return event;
      },
    });

    // requestHandler DOIT être le premier middleware Express
    if (app) {
      app.use(Sentry.Handlers.requestHandler({
        user: ['id', 'username'], // champs à capturer dans le contexte user
      }));
    }

    logger.info('Sentry', 'Initialisé avec succès', {
      env     : process.env.NODE_ENV ?? 'development',
      release : process.env.npm_package_version ?? '3.0.0',
    });

  } catch (err) {
    logger.warn('Sentry', '@sentry/node non installé. Faire : npm install @sentry/node', {
      error: err.message,
    });
  }
}

// ── Error handler Express (après toutes les routes) ───────

function sentryErrorHandler(app) {
  if (Sentry && app) {
    app.use(Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        // Capturer les erreurs 4xx et 5xx
        return !error.status || error.status >= 400;
      },
    }));
  }
}

// ── Contexte joueur (associer erreurs à un joueur) ────────

/**
 * Définit le contexte utilisateur Sentry pour ce scope.
 * À appeler à la connexion d'un joueur.
 */
function setUserContext(socketId, playerName, roomCode) {
  if (!Sentry) return;
  Sentry.setUser({
    id       : socketId,
    username : playerName ?? 'Inconnu',
  });
  if (roomCode) {
    Sentry.setTag('room_code', roomCode);
  }
}

/**
 * Définit le contexte de la salle en cours.
 */
function setRoomContext(roomCode, phase, playerCount) {
  if (!Sentry) return;
  Sentry.setContext('room', {
    code        : roomCode,
    phase       : phase,
    playerCount : playerCount,
  });
  Sentry.setTag('game_phase', phase);
}

/**
 * Efface le contexte utilisateur (déconnexion).
 */
function clearUserContext() {
  if (!Sentry) return;
  Sentry.setUser(null);
}

// ── Breadcrumbs (fil d'Ariane) ────────────────────────────

/**
 * Ajoute une action au fil d'Ariane Sentry.
 * Les breadcrumbs sont visibles dans Sentry quand une erreur survient.
 *
 * @param {string} category  — ex: 'game', 'socket', 'security'
 * @param {string} message   — description de l'action
 * @param {object} data      — données supplémentaires
 * @param {string} level     — 'info' | 'warning' | 'error'
 */
function addBreadcrumb(category, message, data = {}, level = 'info') {
  if (!Sentry) return;
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level,
    timestamp: Date.now() / 1000,
  });
}

// ── Performance tracing ───────────────────────────────────

/**
 * Démarre une transaction de performance Sentry.
 * Retourne un objet { finish() } à appeler quand l'opération se termine.
 *
 * @param {string} name  — ex: 'game.trick', 'game.round'
 * @param {string} op    — ex: 'game', 'socket', 'db'
 * @param {object} tags  — tags additionnels
 */
function startTrace(name, op, tags = {}) {
  if (!Sentry) return { finish: () => {}, setData: () => {} };

  const transaction = Sentry.startTransaction({ name, op });
  Object.entries(tags).forEach(([k, v]) => transaction.setTag(k, String(v)));

  return {
    finish : (status = 'ok') => {
      transaction.setStatus(status);
      transaction.finish();
    },
    setData: (key, value) => transaction.setData(key, value),
  };
}

// ── Capture d'erreur enrichie ─────────────────────────────

function captureError(err, context = {}) {
  const message = err?.message ?? String(err);

  logger.error('Error', message, {
    stack   : err?.stack,
    ...context,
  });

  if (!Sentry) return;

  Sentry.withScope(scope => {
    // Contexte socket si disponible
    if (context.socketId) scope.setTag('socket_id', context.socketId);
    if (context.roomCode) scope.setTag('room_code', context.roomCode);
    if (context.phase)    scope.setTag('game_phase', context.phase);
    if (context.event)    scope.setTag('socket_event', context.event);

    // Toutes les données supplémentaires en extra
    Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));

    scope.setLevel(context.level ?? 'error');
    Sentry.captureException(err instanceof Error ? err : new Error(message));
  });
}

// ── Métriques custom → Sentry ─────────────────────────────

/**
 * Envoie un snapshot de nos métriques vers Sentry.
 * Visible dans Sentry sous "Performance > Custom Metrics".
 */
function flushMetricsToSentry() {
  if (!Sentry) return;

  const snap = getMetrics();

  // Sentry.metrics est disponible depuis @sentry/node v7.x
  if (!Sentry.metrics) return;

  const gauges = [
    ['connections.active',   snap.connectionsActive],
    ['rooms.active',         snap.roomsActive],
    ['games.started',        snap.gamesStarted],
    ['games.completed',      snap.gamesCompleted],
    ['tricks.resolved',      snap.tricksResolved],
    ['bluffs.called',        snap.bluffsCalled],
    ['bluffs.confirmed',     snap.bluffsConfirmed],
    ['security.ratelimit',   snap.rateLimitHits],
    ['security.validation',  snap.validationErrors],
    ['reconnections.success',snap.reconnectionsSuccess],
  ];

  gauges.forEach(([key, value]) => {
    try {
      Sentry.metrics.gauge(`game.${key}`, value, {
        unit: 'none',
        tags: { env: process.env.NODE_ENV ?? 'development' },
      });
    } catch (_) {
      // metrics API peut ne pas être disponible selon la version
    }
  });
}

// Envoi automatique toutes les 5 min en production
if (process.env.NODE_ENV === 'production') {
  setInterval(flushMetricsToSentry, 5 * 60 * 1000);
}

// ── Erreurs globales ──────────────────────────────────────

function setupGlobalErrorHandlers() {
  process.on('uncaughtException', (err) => {
    captureError(err, { type: 'uncaughtException', level: 'fatal' });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    captureError(err, { type: 'unhandledRejection' });
  });

  logger.info('ErrorHandler', 'Gestionnaires globaux enregistrés');
}

module.exports = {
  initSentry,
  sentryErrorHandler,
  captureError,
  setupGlobalErrorHandlers,
  setUserContext,
  setRoomContext,
  clearUserContext,
  addBreadcrumb,
  startTrace,
  flushMetricsToSentry,
};
