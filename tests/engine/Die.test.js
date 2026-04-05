'use strict';

const { rollDie, buildDeck } = require('../../src/engine/Die');
const { DieType }             = require('../../src/engine/DieType');

// ── Helpers ───────────────────────────────────────────────
function rollMany(type, n = 1000) {
  const results = [];
  for (let i = 0; i < n; i++) results.push(rollDie(type));
  return results;
}

describe('rollDie', () => {

  // ── Atouts ───────────────────────────────────────────────
  describe('dés atouts (Minotaure, Sirène, Griffon)', () => {
    [DieType.MINOTAURE, DieType.SIRENE, DieType.GRIFFON].forEach(type => {
      test(`${type} : actif environ 2/3 du temps`, () => {
        const rolls   = rollMany(type);
        const actifs  = rolls.filter(r => r.active).length;
        const ratio   = actifs / rolls.length;
        // Tolérance ±10% autour de 0.667
        expect(ratio).toBeGreaterThan(0.55);
        expect(ratio).toBeLessThan(0.78);
      });

      test(`${type} actif → trumpType correct`, () => {
        const actifs = rollMany(type).filter(r => r.active);
        actifs.forEach(r => expect(r.trumpType).toBe(type));
      });

      test(`${type} inactif → pas de trumpType`, () => {
        const inactifs = rollMany(type).filter(r => !r.active);
        if (inactifs.length > 0) {
          inactifs.forEach(r => expect(r.trumpType).toBeUndefined());
        }
      });
    });
  });

  // ── Dés normaux ──────────────────────────────────────────
  test('ROUGE : valeurs uniquement 5, 6, 7', () => {
    rollMany(DieType.ROUGE).forEach(r => {
      expect(r.active).toBe(true);
      expect([5, 6, 7]).toContain(r.value);
    });
  });

  test('JAUNE : valeurs uniquement 3, 4, 5', () => {
    rollMany(DieType.JAUNE).forEach(r => {
      expect(r.active).toBe(true);
      expect([3, 4, 5]).toContain(r.value);
    });
  });

  test('VIOLET : valeurs uniquement 1, 2, 3', () => {
    rollMany(DieType.VIOLET).forEach(r => {
      expect(r.active).toBe(true);
      expect([1, 2, 3]).toContain(r.value);
    });
  });

  // ── Gris ─────────────────────────────────────────────────
  describe('GRIS', () => {
    test('inactif environ 50% du temps', () => {
      const rolls    = rollMany(DieType.GRIS);
      const inactifs = rolls.filter(r => !r.active).length;
      const ratio    = inactifs / rolls.length;
      expect(ratio).toBeGreaterThan(0.40);
      expect(ratio).toBeLessThan(0.60);
    });

    test('quand actif : valeur 1 ou 7 uniquement', () => {
      rollMany(DieType.GRIS)
        .filter(r => r.active)
        .forEach(r => expect([1, 7]).toContain(r.value));
    });

    test('pas de trumpType', () => {
      rollMany(DieType.GRIS).forEach(r => expect(r.trumpType).toBeUndefined());
    });
  });
});

// ═══════════════════════════════════════════════════════════
//   buildDeck
// ═══════════════════════════════════════════════════════════
describe('buildDeck', () => {
  let deck;

  beforeEach(() => { deck = buildDeck(); });

  test('36 dés au total', () => {
    expect(deck).toHaveLength(36);
  });

  const expectedCounts = {
    [DieType.MINOTAURE]: 1,
    [DieType.SIRENE]:    2,
    [DieType.GRIFFON]:   3,
    [DieType.ROUGE]:     7,
    [DieType.JAUNE]:     7,
    [DieType.VIOLET]:    8,
    [DieType.GRIS]:      8,
  };

  Object.entries(expectedCounts).forEach(([type, count]) => {
    test(`${count} dé(s) ${type}`, () => {
      expect(deck.filter(d => d === type)).toHaveLength(count);
    });
  });

  test('chaque appel produit un nouveau tableau', () => {
    expect(buildDeck()).not.toBe(deck);
  });
});
