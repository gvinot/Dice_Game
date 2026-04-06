'use strict';

const { logger } = require('./logger');
const { get: getMetrics } = require('./metrics');

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
      tracesSampleRate : process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

      // Filtrer les erreurs réseau normales
      ignoreErrors: ['ECONNRESET', 'EPIPE', 'Transport closed'],

      // Enrichir chaque erreur avec un snapshot des métriques
      beforeSend(event) {
        event.extra = {
          ...(event.extra ?? {}),
          gameMetrics: getMetrics(),
        };
        return event;
      },
    });

    // requestHandler DOIT être le premier middleware Express
    if (app) {
      app.use(Sentry.Handlers.requestHandler());
    }

    logger.info('Sentry', 'Initialisé', {
      env    : process.env.NODE_ENV ?? 'development',
      release: process.env.npm_package_version ?? '3.0.0',
    });

  } catch (err) {
    logger.warn('Sentry', 'Impossible de charger @sentry/node', { error: err.message });
  }
}

// ── Error handler Express (après toutes les routes) ───────

function sentryErrorHandler(app) {
  if (Sentry && app) {
    app.use(Sentry.Handlers.errorHandler());
  }
}

// ── Contexte joueur ────────────────────────────────────────

function setUserContext(socketId, playerName, roomCode) {
  if (!Sentry) return;
  Sentry.setUser({ id: socketId, username: playerName ?? 'Inconnu' });
  if (roomCode) Sentry.setTag('room_code', roomCode);
}

function setRoomContext(roomCode, phase, playerCount) {
  if (!Sentry) return;
  Sentry.setContext('room', { code: roomCode, phase, playerCount });
  Sentry.setTag('game_phase', phase);
}

function clearUserContext() {
  if (!Sentry) return;
  Sentry.setUser(null);
}

// ── Breadcrumbs ────────────────────────────────────────────

function addBreadcrumb(category, message, data = {}, level = 'info') {
  if (!Sentry) return;
  Sentry.addBreadcrumb({
    category, message, data, level,
    timestamp: Date.now() / 1000,
  });
}

// ── Capture d'erreur enrichie ─────────────────────────────

function captureError(err, context = {}) {
  const message = err?.message ?? String(err);
  logger.error('Error', message, { stack: err?.stack, ...context });

  if (!Sentry) return;
  Sentry.withScope(scope => {
    if (context.socketId) scope.setTag('socket_id', context.socketId);
    if (context.roomCode) scope.setTag('room_code', context.roomCode);
    if (context.event)    scope.setTag('socket_event', context.event);
    Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
    Sentry.captureException(err instanceof Error ? err : new Error(message));
  });
}

// ── Événements custom → Sentry Issues ────────────────────
/**
 * Envoie un événement informatif vers Sentry (visible dans Issues avec level=info).
 * Remplace Sentry.metrics qui est déprécié dans les versions récentes.
 * Visible dans Sentry → Issues (filtrer par level: info).
 */
function captureGameEvent(title, data = {}) {
  if (!Sentry) return;
  Sentry.withScope(scope => {
    scope.setLevel('info');
    scope.setContext('gameEvent', data);
    Sentry.captureMessage(title);
  });
}

// ── Snapshot périodique des métriques → Sentry ────────────
/**
 * Envoie un résumé des métriques toutes les 30 min en production.
 * Visible dans Sentry → Issues, filtré par "Metrics Snapshot".
 */
function startMetricsReporting() {
  if (process.env.NODE_ENV !== 'production') return;

  setInterval(() => {
    const snap = getMetrics();
    logger.info('Metrics', 'Snapshot', snap);
    captureGameEvent('📊 Metrics Snapshot', snap);
  }, 30 * 60 * 1000);

  logger.info('Metrics', 'Reporting Sentry activé (30 min)');
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
  captureGameEvent,
  startMetricsReporting,
  setupGlobalErrorHandlers,
  setUserContext,
  setRoomContext,
  clearUserContext,
  addBreadcrumb,
};
