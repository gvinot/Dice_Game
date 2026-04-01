'use strict';

const { DieType, TRUMP_TYPES, NORMAL_TYPES } = require('./DieType');

/**
 * Retourne les indices de dés jouables dans `hand` selon la règle de couleur.
 * En mode normal : si la couleur d'entame est en main, obligatoire (ou atout).
 * En mode bluff  : tout est libre SAUF si accusedMustFollow s'applique.
 */
function getValidIndices(hand, trick) {
  if (!trick || trick.length === 0) return hand.map((_, i) => i);

  const leadType = trick[0].dieType;
  if (!NORMAL_TYPES.has(leadType)) return hand.map((_, i) => i); // entame atout → libre

  const canFollow = hand.some(t => t === leadType);
  if (!canFollow) return hand.map((_, i) => i); // pas la couleur → défausse libre

  // A la couleur → couleur ou atout obligatoire
  return hand.reduce((acc, t, i) => {
    if (t === leadType || TRUMP_TYPES.has(t)) acc.push(i);
    return acc;
  }, []);
}

// ── Helpers internes ─────────────────────────────────────

function beats(a, b) {
  return (a === DieType.MINOTAURE && b === DieType.GRIFFON)
      || (a === DieType.SIRENE    && b === DieType.MINOTAURE)
      || (a === DieType.GRIFFON   && b === DieType.SIRENE);
}

function hasAllThree(trumps) {
  const types = new Set(trumps.map(t => t.roll.trumpType));
  return types.has(DieType.MINOTAURE)
      && types.has(DieType.SIRENE)
      && types.has(DieType.GRIFFON);
}

function lastPlayed(plays) {
  return [...plays].sort((a, b) => b.order - a.order)[0];
}

function bestTrump(trumps) {
  let winner = trumps[0].roll.trumpType;
  for (const t of trumps) {
    if (beats(t.roll.trumpType, winner)) winner = t.roll.trumpType;
  }
  return winner;
}

/**
 * Détermine le gagnant d'un pli.
 * @param {Array} plays — liste de { playerId, dieType, roll, order }
 * @returns {string} playerId du gagnant
 */
function resolveTrick(plays) {
  // 1. Tous inactifs → premier joué
  if (plays.every(p => !p.roll.active)) {
    return plays.reduce((a, b) => a.order < b.order ? a : b).playerId;
  }

  const trumps = plays.filter(p => p.roll.active && p.roll.trumpType);

  // 2. Les trois atouts présents → Sirène gagne
  if (hasAllThree(trumps)) {
    return lastPlayed(trumps.filter(p => p.roll.trumpType === DieType.SIRENE)).playerId;
  }

  // 3. Combat d'atouts
  if (trumps.length > 0) {
    const best = bestTrump(trumps);
    return lastPlayed(trumps.filter(p => p.roll.trumpType === best)).playerId;
  }

  // 4. Dés normaux actifs → valeur la plus haute
  const normals = plays.filter(p => p.roll.active && p.roll.value != null);
  if (normals.length > 0) {
    const max = Math.max(...normals.map(p => p.roll.value));
    return lastPlayed(normals.filter(p => p.roll.value === max)).playerId;
  }

  return plays[0].playerId;
}

module.exports = { resolveTrick, getValidIndices };
