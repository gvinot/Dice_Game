'use strict';

/**
 * Logger centralisé — remplace tous les console.log/warn/error éparpillés.
 *
 * En développement : sortie lisible avec couleurs et timestamps.
 * En production    : sortie JSON une ligne par événement (compatible Render, Datadog, etc.)
 */

const IS_PROD = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';

// Niveaux de log (du moins important au plus important)
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = IS_PROD ? LEVELS.info : LEVELS.debug;

// Couleurs ANSI pour le mode développement
const COLORS = {
  debug : '\x1b[90m',   // gris
  info  : '\x1b[36m',   // cyan
  warn  : '\x1b[33m',   // jaune
  error : '\x1b[31m',   // rouge
  reset : '\x1b[0m',
};

function timestamp() {
  return new Date().toISOString();
}

function formatDev(level, context, message, data) {
  const color = COLORS[level] ?? '';
  const ctx   = context ? `[${context}] ` : '';
  const extra = data ? ' ' + JSON.stringify(data) : '';
  return `${color}${timestamp()} ${level.toUpperCase().padEnd(5)} ${ctx}${message}${extra}${COLORS.reset}`;
}

function formatProd(level, context, message, data) {
  return JSON.stringify({
    ts      : timestamp(),
    level,
    context : context ?? null,
    message,
    ...(data ?? {}),
  });
}

function write(level, context, message, data) {
  if (IS_TEST) return; // silence pendant les tests automatisés
  if (LEVELS[level] < MIN_LEVEL) return;

  const line = IS_PROD
    ? formatProd(level, context, message, data)
    : formatDev(level, context, message, data);

  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

// ── API publique ──────────────────────────────────────────

const logger = {
  debug : (ctx, msg, data) => write('debug', ctx, msg, data),
  info  : (ctx, msg, data) => write('info',  ctx, msg, data),
  warn  : (ctx, msg, data) => write('warn',  ctx, msg, data),
  error : (ctx, msg, data) => write('error', ctx, msg, data),
};

module.exports = { logger };
