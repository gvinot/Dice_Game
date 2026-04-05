'use strict';

const { calcScore } = require('../../src/engine/ScoreCalculator');

function player(bet, tricksWon, bonuses = []) {
  return { bet, tricksWon, bonuses };
}

describe('calcScore', () => {

  // ── Pari 0 ───────────────────────────────────────────────
  describe('pari = 0', () => {
    test('réussi (0 pli remporté) → roundNumber × 10', () => {
      expect(calcScore(player(0, 0), 3)).toBe(30);
      expect(calcScore(player(0, 0), 5)).toBe(50);
    });

    test('raté (plis remportés > 0) → -(roundNumber × 10)', () => {
      expect(calcScore(player(0, 1), 3)).toBe(-30);
      expect(calcScore(player(0, 2), 5)).toBe(-50);
    });
  });

  // ── Pari non-zéro ─────────────────────────────────────────
  describe('pari ≠ 0', () => {
    test('pari réussi → tricksWon × 20', () => {
      expect(calcScore(player(2, 2), 3)).toBe(40);
      expect(calcScore(player(1, 1), 1)).toBe(20);
    });

    test('pari raté → -(|bet - tricks| × 10)', () => {
      expect(calcScore(player(3, 1), 4)).toBe(-20); // diff = 2
      expect(calcScore(player(2, 4), 3)).toBe(-20); // diff = 2
      expect(calcScore(player(1, 0), 2)).toBe(-10); // diff = 1
    });
  });

  // ── Bonus ─────────────────────────────────────────────────
  describe('bonus', () => {
    test('bonus ajoutés même si pari raté', () => {
      const p = player(2, 0, [{ points: 30 }]);
      expect(calcScore(p, 3)).toBe(-20 + 30); // pari raté -20 + bonus 30
    });

    test('bonus cumulatifs', () => {
      const p = player(1, 1, [{ points: 20 }, { points: 50 }]);
      expect(calcScore(p, 3)).toBe(20 + 20 + 50); // pari ok + 2 bonus
    });

    test('sans bonus, pari réussi', () => {
      expect(calcScore(player(3, 3), 3)).toBe(60);
    });
  });

  // ── Cas limites ────────────────────────────────────────────
  describe('cas limites', () => {
    test('manche 1, pari 0 réussi', () => {
      expect(calcScore(player(0, 0), 1)).toBe(10);
    });

    test('manche 10, pari 0 réussi', () => {
      expect(calcScore(player(0, 0), 10)).toBe(100);
    });

    test('pari = tricks = 0 → équivalent pari 0 réussi', () => {
      expect(calcScore(player(0, 0), 4)).toBe(40);
    });
  });
});
