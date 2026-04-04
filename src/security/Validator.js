'use strict';

// ── Constantes ────────────────────────────────────────────
const NAME_MAX_LEN   = 20;
const CODE_REGEX     = /^[A-Z0-9]{4}$/;
const NAME_REGEX     = /^[^\x00-\x1F<>"'`\\]{1,20}$/; // pas de caractères de contrôle ni HTML
const TOKEN_REGEX    = /^[a-z0-9]{10,40}$/i;

// ── Sanitisation ──────────────────────────────────────────

/**
 * Supprime les caractères potentiellement dangereux et tronque.
 */
function sanitizeName(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/[<>"'`\\]/g, '')   // caractères HTML/injection
    .replace(/[\x00-\x1F]/g, '') // caractères de contrôle
    .slice(0, NAME_MAX_LEN);
}

function sanitizeCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().slice(0, 4);
}

// ── Validateurs ───────────────────────────────────────────

const Validators = {

  'create-room': ({ name, maxRounds }) => {
    const n = sanitizeName(name);
    if (!NAME_REGEX.test(n)) return { ok: false, reason: 'Prénom invalide.' };
    const r = parseInt(maxRounds, 10);
    if (isNaN(r) || r < 1 || r > 18) return { ok: false, reason: 'Nombre de manches invalide.' };
    return { ok: true, data: { name: n, maxRounds: r } };
  },

  'join-room': ({ code, name }) => {
    const c = sanitizeCode(code);
    const n = sanitizeName(name);
    if (!CODE_REGEX.test(c)) return { ok: false, reason: 'Code de salle invalide.' };
    if (!NAME_REGEX.test(n)) return { ok: false, reason: 'Prénom invalide.' };
    return { ok: true, data: { code: c, name: n } };
  },

  'set-max-rounds': ({ code, maxRounds }) => {
    const c = sanitizeCode(code);
    if (!CODE_REGEX.test(c)) return { ok: false, reason: 'Code invalide.' };
    const r = parseInt(maxRounds, 10);
    if (isNaN(r) || r < 1 || r > 18) return { ok: false, reason: 'Valeur invalide.' };
    return { ok: true, data: { code: c, maxRounds: r } };
  },

  'set-bluff-mode': ({ code, enabled }) => {
    const c = sanitizeCode(code);
    if (!CODE_REGEX.test(c)) return { ok: false, reason: 'Code invalide.' };
    return { ok: true, data: { code: c, enabled: !!enabled } };
  },

  'start-game': ({ code }) => {
    const c = sanitizeCode(code);
    if (!CODE_REGEX.test(c)) return { ok: false, reason: 'Code invalide.' };
    return { ok: true, data: { code: c } };
  },

  'place-bet': ({ code, bet }) => {
    const c = sanitizeCode(code);
    if (!CODE_REGEX.test(c)) return { ok: false, reason: 'Code invalide.' };
    const b = parseInt(bet, 10);
    if (isNaN(b) || b < 0 || b > 18) return { ok: false, reason: 'Pari invalide.' };
    return { ok: true, data: { code: c, bet: b } };
  },

  'play-die': ({ code, dieIndex }) => {
    const c = sanitizeCode(code);
    if (!CODE_REGEX.test(c)) return { ok: false, reason: 'Code invalide.' };
    const i = parseInt(dieIndex, 10);
    if (isNaN(i) || i < 0 || i > 17) return { ok: false, reason: 'Index invalide.' };
    return { ok: true, data: { code: c, dieIndex: i } };
  },

  'call-bluff':            ({ code }) => validateCodeOnly(code),
  'continue-after-bluff':  ({ code }) => validateCodeOnly(code),
  'next-trick':            ({ code }) => validateCodeOnly(code),
  'next-round':            ({ code }) => validateCodeOnly(code),
  'request-restart':       ({ code }) => validateCodeOnly(code),
  'launch-restart':        ({ code }) => validateCodeOnly(code),

  'vote-restart': ({ code, vote }) => {
    const c = sanitizeCode(code);
    if (!CODE_REGEX.test(c)) return { ok: false, reason: 'Code invalide.' };
    if (typeof vote !== 'boolean') return { ok: false, reason: 'Vote invalide.' };
    return { ok: true, data: { code: c, vote } };
  },

  'reconnect-session': ({ token }) => {
    if (typeof token !== 'string' || !TOKEN_REGEX.test(token))
      return { ok: false, reason: 'Token invalide.' };
    return { ok: true, data: { token } };
  },
};

function validateCodeOnly(code) {
  const c = sanitizeCode(code);
  if (!CODE_REGEX.test(c)) return { ok: false, reason: 'Code invalide.' };
  return { ok: true, data: { code: c } };
}

/**
 * Valide et sanitise un payload entrant.
 * Si l'événement n'a pas de validateur dédié, on passe.
 * @returns {{ ok: boolean, data?: object, reason?: string }}
 */
function validate(eventName, payload) {
  const validator = Validators[eventName];
  if (!validator) return { ok: true, data: payload ?? {} }; // pas de règle = accepté tel quel
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'Payload manquant.' };
  return validator(payload);
}

module.exports = { validate, sanitizeName };
