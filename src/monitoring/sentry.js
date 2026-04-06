'use strict';

const { logger } = require('./logger');

/**
 * Intégration Sentry — capture les erreurs non gérées en production.
 *
 * Pour activer :
 * 1. npm install @sentry/node
 * 2. Définir SENTRY_DSN dans les variables d'environnement Render
 *
 * Sans SENTRY_DSN, le module se désactive silencieusement.
 */

let Sentry = null;

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
      environment        : process.env.NODE_ENV ?? 'development',
      tracesSampleRate   : 0.1,  // 10% des transactions tracées
      release            : process.env.npm_package_version,
    });

    // requestHandler doit être LE PREMIER middleware (avant toutes les routes)
    if (app) {
      app.use(Sentry.Handlers.requestHandler());
    }
    // ⚠️  errorHandler doit être appelé séparément APRÈS toutes les routes
    // via sentryErrorHandler(app) dans server.js

    logger.info('Sentry', 'Sentry initialisé', { dsn: dsn.slice(0, 20) + '…' });
  } catch (err) {
    logger.warn('Sentry', '@sentry/node non installé — faire: npm install @sentry/node');
  }
}

/**
 * Capture manuelle d'une erreur (ex: dans un catch ou un handler socket).
 */
function captureError(err, context = {}) {
  logger.error('Error', err.message ?? String(err), {
    stack   : err.stack,
    ...context,
  });

  if (Sentry) {
    Sentry.withScope(scope => {
      Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
      Sentry.captureException(err);
    });
  }
}

/**
 * Gestionnaire global des erreurs non capturées.
 * À appeler une seule fois au démarrage du serveur.
 */
function setupGlobalErrorHandlers() {
  process.on('uncaughtException', (err) => {
    captureError(err, { type: 'uncaughtException' });
    // Laisser le processus mourir — un process manager (PM2, Render) le relancera
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    captureError(err, { type: 'unhandledRejection' });
  });

  logger.info('ErrorHandler', 'Gestionnaires d\'erreurs globaux enregistrés');
}

/**
 * À appeler APRÈS toutes les routes Express.
 * Permet à Sentry de capturer les erreurs HTTP.
 */
function sentryErrorHandler(app) {
  if (Sentry && app) {
    app.use(Sentry.Handlers.errorHandler());
  }
}

module.exports = { initSentry, sentryErrorHandler, captureError, setupGlobalErrorHandlers };
