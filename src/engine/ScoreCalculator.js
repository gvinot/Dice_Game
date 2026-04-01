'use strict';

/**
 * Calcule le score d'un joueur pour une manche.
 * Note : bluffScore est géré séparément dans RoomManager.
 * @param {object} player — { bet, tricksWon, bonuses }
 * @param {number} roundNumber
 * @returns {number} score de la manche (sans bluffScore)
 */
function calcScore(player, roundNumber) {
  let score = 0;
  const { bet, tricksWon, bonuses } = player;

  if (bet === 0) {
    // Pari zéro
    score += tricksWon === 0 ? roundNumber * 10 : -(roundNumber * 10);
  } else {
    // Pari non-zéro
    score += bet === tricksWon
      ? tricksWon * 20
      : -(Math.abs(bet - tricksWon) * 10);
  }

  // Bonus de pli (Minotaure vs Griffon, Sirène vs Minotaure)
  for (const bonus of bonuses) {
    score += bonus.points;
  }

  return score;
}

module.exports = { calcScore };
