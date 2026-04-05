'use strict';

const { validate, sanitizeName } = require('../../src/security/Validator');

// ── sanitizeName ──────────────────────────────────────────
describe('sanitizeName', () => {
  test('supprime les balises HTML', () => {
    expect(sanitizeName('<script>alert(1)</script>')).not.toContain('<');
  });

  test('tronque à 20 caractères', () => {
    expect(sanitizeName('A'.repeat(30))).toHaveLength(20);
  });

  test('supprime les espaces en début/fin', () => {
    expect(sanitizeName('  Alice  ')).toBe('Alice');
  });

  test('prénom valide passe intact', () => {
    expect(sanitizeName('Guillaume')).toBe('Guillaume');
  });
});

// ── validate ──────────────────────────────────────────────
describe('validate', () => {

  describe('create-room', () => {
    test('valide avec nom et manches corrects', () => {
      const r = validate('create-room', { name: 'Alice', maxRounds: 5 });
      expect(r.ok).toBe(true);
      expect(r.data.name).toBe('Alice');
      expect(r.data.maxRounds).toBe(5);
    });

    test('rejette un nom vide', () => {
      expect(validate('create-room', { name: '', maxRounds: 5 }).ok).toBe(false);
    });

    test('rejette maxRounds hors limite', () => {
      expect(validate('create-room', { name: 'Alice', maxRounds: 0 }).ok).toBe(false);
      expect(validate('create-room', { name: 'Alice', maxRounds: 19 }).ok).toBe(false);
    });

    test('rejette un payload null', () => {
      expect(validate('create-room', null).ok).toBe(false);
    });
  });

  describe('join-room', () => {
    test('valide avec code et nom corrects', () => {
      const r = validate('join-room', { code: 'AB12', name: 'Bob' });
      expect(r.ok).toBe(true);
      expect(r.data.code).toBe('AB12');
    });

    test('rejette un code avec des caractères interdits', () => {
      expect(validate('join-room', { code: '<script>', name: 'Bob' }).ok).toBe(false);
    });

    test('rejette un code trop court', () => {
      expect(validate('join-room', { code: 'AB1', name: 'Bob' }).ok).toBe(false);
    });

    test('normalise le code en majuscules', () => {
      const r = validate('join-room', { code: 'ab12', name: 'Bob' });
      expect(r.ok).toBe(true);
      expect(r.data.code).toBe('AB12');
    });
  });

  describe('place-bet', () => {
    test('valide un pari de 0', () => {
      expect(validate('place-bet', { code: 'AB12', bet: 0 }).ok).toBe(true);
    });

    test('valide un pari max de 18', () => {
      expect(validate('place-bet', { code: 'AB12', bet: 18 }).ok).toBe(true);
    });

    test('rejette un pari négatif', () => {
      expect(validate('place-bet', { code: 'AB12', bet: -1 }).ok).toBe(false);
    });

    test('rejette un pari > 18', () => {
      expect(validate('place-bet', { code: 'AB12', bet: 19 }).ok).toBe(false);
    });
  });

  describe('play-die', () => {
    test('valide un index entre 0 et 17', () => {
      expect(validate('play-die', { code: 'AB12', dieIndex: 0 }).ok).toBe(true);
      expect(validate('play-die', { code: 'AB12', dieIndex: 17 }).ok).toBe(true);
    });

    test('rejette un index négatif', () => {
      expect(validate('play-die', { code: 'AB12', dieIndex: -1 }).ok).toBe(false);
    });
  });

  describe('vote-restart', () => {
    test('valide true et false', () => {
      expect(validate('vote-restart', { code: 'AB12', vote: true }).ok).toBe(true);
      expect(validate('vote-restart', { code: 'AB12', vote: false }).ok).toBe(true);
    });

    test('rejette une chaîne à la place d\'un booléen', () => {
      expect(validate('vote-restart', { code: 'AB12', vote: 'oui' }).ok).toBe(false);
    });
  });

  describe('événement sans validateur', () => {
    test('accepte et retourne le payload tel quel', () => {
      const r = validate('unknown-event', { foo: 'bar' });
      expect(r.ok).toBe(true);
      expect(r.data.foo).toBe('bar');
    });
  });
});
