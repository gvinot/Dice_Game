'use strict';

const { resolveTrick, getValidIndices } = require('../../src/engine/TrickResolver');
const { DieType }                        = require('../../src/engine/DieType');

// ── Helpers ───────────────────────────────────────────────
function play(playerId, dieType, roll, order) {
  return { playerId, dieType, roll, order };
}
const active  = (trumpType) => ({ active: true, trumpType });
const value   = (v)         => ({ active: true, value: v });
const inactive = ()         => ({ active: false });

// ═══════════════════════════════════════════════════════════
//   resolveTrick
// ═══════════════════════════════════════════════════════════
describe('resolveTrick', () => {

  // ── Tous inactifs ────────────────────────────────────────
  test('tous inactifs → premier joué gagne', () => {
    const plays = [
      play('A', DieType.GRIS,   inactive(), 0),
      play('B', DieType.GRIS,   inactive(), 1),
      play('C', DieType.VIOLET, inactive(), 2),
    ];
    expect(resolveTrick(plays)).toBe('A');
  });

  // ── Dés normaux ──────────────────────────────────────────
  test('dés normaux → valeur la plus haute gagne', () => {
    const plays = [
      play('A', DieType.ROUGE,  value(5), 0),
      play('B', DieType.ROUGE,  value(7), 1),
      play('C', DieType.JAUNE,  value(3), 2),
    ];
    expect(resolveTrick(plays)).toBe('B');
  });

  test('dés normaux à égalité → dernier joué gagne', () => {
    const plays = [
      play('A', DieType.ROUGE, value(7), 0),
      play('B', DieType.ROUGE, value(7), 1),
    ];
    expect(resolveTrick(plays)).toBe('B');
  });

  // ── Atouts ───────────────────────────────────────────────
  test('Minotaure bat Griffon', () => {
    const plays = [
      play('A', DieType.GRIFFON,   active(DieType.GRIFFON),   0),
      play('B', DieType.MINOTAURE, active(DieType.MINOTAURE), 1),
    ];
    expect(resolveTrick(plays)).toBe('B');
  });

  test('Sirène bat Minotaure', () => {
    const plays = [
      play('A', DieType.MINOTAURE, active(DieType.MINOTAURE), 0),
      play('B', DieType.SIRENE,    active(DieType.SIRENE),    1),
    ];
    expect(resolveTrick(plays)).toBe('B');
  });

  test('Griffon bat Sirène', () => {
    const plays = [
      play('A', DieType.SIRENE,  active(DieType.SIRENE),  0),
      play('B', DieType.GRIFFON, active(DieType.GRIFFON), 1),
    ];
    expect(resolveTrick(plays)).toBe('B');
  });

  test('atout bat toujours les dés normaux', () => {
    const plays = [
      play('A', DieType.ROUGE,    value(7),                  0),
      play('B', DieType.GRIFFON,  active(DieType.GRIFFON),   1),
    ];
    expect(resolveTrick(plays)).toBe('B');
  });

  // ── Cas spécial : 3 atouts ───────────────────────────────
  test('3 atouts présents → Sirène gagne', () => {
    const plays = [
      play('A', DieType.MINOTAURE, active(DieType.MINOTAURE), 0),
      play('B', DieType.GRIFFON,   active(DieType.GRIFFON),   1),
      play('C', DieType.SIRENE,    active(DieType.SIRENE),    2),
    ];
    expect(resolveTrick(plays)).toBe('C');
  });

  test('3 atouts → Sirène dernière jouée gagne si plusieurs Sirènes', () => {
    const plays = [
      play('A', DieType.SIRENE,    active(DieType.SIRENE),    0),
      play('B', DieType.MINOTAURE, active(DieType.MINOTAURE), 1),
      play('C', DieType.GRIFFON,   active(DieType.GRIFFON),   2),
      play('D', DieType.SIRENE,    active(DieType.SIRENE),    3),
    ];
    expect(resolveTrick(plays)).toBe('D');
  });

  // ── Atout inactif ─────────────────────────────────────────
  test('atout inactif n\'est pas un atout', () => {
    const plays = [
      play('A', DieType.ROUGE,    value(6),    0),
      play('B', DieType.GRIFFON,  inactive(),  1), // Griffon inactif
    ];
    // Seul A a une valeur active
    expect(resolveTrick(plays)).toBe('A');
  });
});

// ═══════════════════════════════════════════════════════════
//   getValidIndices
// ═══════════════════════════════════════════════════════════
describe('getValidIndices', () => {

  const trickLead = (dieType) => [{ dieType }];

  test('pli vide → tout est valide', () => {
    const hand = [DieType.ROUGE, DieType.JAUNE, DieType.GRIFFON];
    expect(getValidIndices(hand, [])).toEqual([0, 1, 2]);
  });

  test('entame atout → tout est valide', () => {
    const hand = [DieType.ROUGE, DieType.JAUNE];
    expect(getValidIndices(hand, trickLead(DieType.GRIFFON))).toEqual([0, 1]);
  });

  test('entame couleur, j\'ai la couleur → couleur + atouts valides', () => {
    const hand = [DieType.ROUGE, DieType.JAUNE, DieType.GRIFFON];
    const valid = getValidIndices(hand, trickLead(DieType.ROUGE));
    expect(valid).toContain(0); // ROUGE
    expect(valid).toContain(2); // GRIFFON (atout)
    expect(valid).not.toContain(1); // JAUNE non valide
  });

  test('entame couleur, je n\'ai pas la couleur → tout valide', () => {
    const hand = [DieType.JAUNE, DieType.GRIFFON, DieType.SIRENE];
    const valid = getValidIndices(hand, trickLead(DieType.ROUGE));
    expect(valid).toEqual([0, 1, 2]);
  });

  test('j\'ai uniquement la couleur → seulement la couleur valide', () => {
    const hand = [DieType.ROUGE, DieType.JAUNE];
    const valid = getValidIndices(hand, trickLead(DieType.ROUGE));
    expect(valid).toContain(0);  // ROUGE ok
    expect(valid).not.toContain(1); // JAUNE non valide
  });
});
