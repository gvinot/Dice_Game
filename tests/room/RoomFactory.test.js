'use strict';

const { makePlayer, makeRoom, publicRoom, genCode } = require('../../src/room/RoomFactory');

describe('makePlayer', () => {
  test('crée un joueur avec les valeurs par défaut', () => {
    const p = makePlayer('socket-1', 'Alice');
    expect(p.id).toBe('socket-1');
    expect(p.name).toBe('Alice');
    expect(p.score).toBe(0);
    expect(p.bluffScore).toBe(0);
    expect(p.bet).toBeNull();
    expect(p.tricksWon).toBe(0);
    expect(p.bonuses).toEqual([]);
    expect(p.hand).toEqual([]);
  });
});

describe('makeRoom', () => {
  test('crée une salle avec les valeurs par défaut', () => {
    const room = makeRoom('ABCD', 'socket-1', 'Alice', 5);
    expect(room.code).toBe('ABCD');
    expect(room.hostId).toBe('socket-1');
    expect(room.phase).toBe('waiting');
    expect(room.maxRounds).toBe(5);
    expect(room.chosenMaxRounds).toBe(5);
    expect(room.players).toHaveLength(1);
    expect(room.players[0].name).toBe('Alice');
    expect(room.bluffMode).toBe(false);
    expect(room.lastActivity).toBeDefined();
  });

  test('maxRounds par défaut = 10', () => {
    const room = makeRoom('ABCD', 'socket-1', 'Alice');
    expect(room.maxRounds).toBe(10);
  });
});

describe('publicRoom', () => {
  let room;

  beforeEach(() => {
    room = makeRoom('ABCD', 'socket-1', 'Alice', 5);
  });

  test('expose les champs publics', () => {
    const pub = publicRoom(room);
    expect(pub.code).toBe('ABCD');
    expect(pub.hostId).toBe('socket-1');
    expect(pub.phase).toBe('waiting');
    expect(pub.players).toHaveLength(1);
  });

  test('n\'expose pas les mains privées', () => {
    const pub = publicRoom(room);
    pub.players.forEach(p => expect(p.hand).toBeUndefined());
  });

  test('expose handSize à la place de hand', () => {
    const pub = publicRoom(room);
    expect(pub.players[0].handSize).toBe(0);
  });

  test('currentPlayerId = null en phase waiting', () => {
    expect(publicRoom(room).currentPlayerId).toBeNull();
  });

  test('absoluteMax calculé selon le nombre de joueurs', () => {
    // 1 joueur → 36 max
    expect(publicRoom(room).absoluteMax).toBe(36);
  });
});

describe('genCode', () => {
  test('génère un code de 4 caractères', () => {
    const code = genCode(new Map());
    expect(code).toHaveLength(4);
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
  });

  test('ne génère pas un code déjà existant', () => {
    const existing = new Map();
    // Forcer un conflit en remplissant beaucoup de codes
    const seen = new Set();
    for (let i = 0; i < 50; i++) {
      const code = genCode(existing);
      existing.set(code, {});
      seen.add(code);
    }
    expect(seen.size).toBe(50);
  });
});
