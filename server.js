'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════
//   LOGIQUE DE JEU (adaptée de vos fichiers JS)
// ═══════════════════════════════════════════════

const DieType = {
  MINOTAURE : 'MINOTAURE',
  SIRENE    : 'SIRENE',
  GRIFFON   : 'GRIFFON',
  ROUGE     : 'ROUGE',
  JAUNE     : 'JAUNE',
  VIOLET    : 'VIOLET',
  GRIS      : 'GRIS',
};

const TRUMP_TYPES  = new Set([DieType.MINOTAURE, DieType.SIRENE, DieType.GRIFFON]);
const NORMAL_TYPES = new Set([DieType.ROUGE, DieType.JAUNE, DieType.VIOLET, DieType.GRIS]);

/**
 * Renvoie les indices jouables dans `hand` selon la règle de couleur.
 * Si le premier dé du pli est un dé normal, le joueur doit suivre la
 * même couleur ou jouer un atout — sauf s'il n'en a pas.
 */
function getValidIndices(hand, trick) {
  if (trick.length === 0) return hand.map((_, i) => i);
  const leadType = trick[0].dieType;
  if (!NORMAL_TYPES.has(leadType)) return hand.map((_, i) => i);

  const canFollow = hand.some(t => t === leadType);
  if (!canFollow) return hand.map((_, i) => i); // ← pas la couleur = TOUT est valide

  return hand.reduce((acc, t, i) => {
    if (t === leadType || TRUMP_TYPES.has(t)) acc.push(i);
    return acc;
  }, []);
}
function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollDie(type) {
  switch (type) {
    case DieType.MINOTAURE:
    case DieType.SIRENE:
    case DieType.GRIFFON:
      return Math.random() < 2 / 3
        ? { active: true, trumpType: type }
        : { active: false };
    case DieType.ROUGE:
      return { active: true, value: randomFrom([5, 6, 7]) };
    case DieType.JAUNE:
      return { active: true, value: randomFrom([3, 4, 5]) };
    case DieType.VIOLET:
      return { active: true, value: randomFrom([1, 2, 3]) };
    case DieType.GRIS:
      if (Math.random() < 0.5) return { active: false };
      return Math.random() < 2 / 3
        ? { active: true, value: 1 }
        : { active: true, value: 7 };
  }
}

function buildDeck() {
  const deck = [];
  const add  = (t, n) => { for (let i = 0; i < n; i++) deck.push(t); };
  add(DieType.MINOTAURE, 1);
  add(DieType.SIRENE,    2);
  add(DieType.GRIFFON,   3);
  add(DieType.ROUGE,     7);
  add(DieType.JAUNE,     7);
  add(DieType.VIOLET,    8);
  add(DieType.GRIS,      8);
  return deck; // 36 dés
}

function beats(a, b) {
  return (a === DieType.MINOTAURE && b === DieType.GRIFFON)
      || (a === DieType.SIRENE    && b === DieType.MINOTAURE)
      || (a === DieType.GRIFFON   && b === DieType.SIRENE);
}

function hasAllThree(trumps) {
  const types = new Set(trumps.map(t => t.roll.trumpType));
  return types.has(DieType.MINOTAURE) && types.has(DieType.SIRENE) && types.has(DieType.GRIFFON);
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

  // 4. Dés normaux actifs
  const normals = plays.filter(p => p.roll.active && p.roll.value != null);
  if (normals.length > 0) {
    const max = Math.max(...normals.map(p => p.roll.value));
    return lastPlayed(normals.filter(p => p.roll.value === max)).playerId;
  }

  return plays[0].playerId;
}

function calcScore(player, roundNumber) {
  let score = 0;
  const { bet, tricksWon, bonuses } = player;

  if (bet === 0) {
    score += tricksWon === 0 ? roundNumber * 10 : -(roundNumber * 10);
  } else {
    score += bet === tricksWon
      ? tricksWon * 20
      : -(Math.abs(bet - tricksWon) * 10);
  }

  for (const b of bonuses) score += b.points;
  return score;
}

// ═══════════════════════════════════════════════
//   GESTION DES SALLES
// ═══════════════════════════════════════════════

const rooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function makePlayer(socketId, name) {
  return {
    id        : socketId,
    name,
    score     : 0,
    bet       : null,
    tricksWon : 0,
    bonuses   : [],
    hand      : [],
  };
}

/** État public envoyé à tous (sans les mains privées) */
function publicRoom(room) {
  return {
    code            : room.code,
    hostId          : room.hostId,
    phase           : room.phase,
    roundNumber     : room.roundNumber,
    maxRounds       : room.maxRounds,
    trickNumber     : room.trickNumber,
    currentPlayerId : room.phase === 'playing'
      ? room.players[room.currentPlayerIndex]?.id
      : null,
    playedThisTrick : room.currentTrick.map(p => p.playerId),
    currentTrick    : room.currentTrick,
    players         : room.players.map(p => ({
      id        : p.id,
      name      : p.name,
      score     : p.score,
      bet       : p.bet,
      tricksWon : p.tricksWon,
      bonuses   : p.bonuses,
      handSize  : p.hand.length,
    })),
  };
}

// ═══════════════════════════════════════════════
//   FLUX DE JEU
// ═══════════════════════════════════════════════

function startRound(room) {
  const n = room.players.length;
  room.maxRounds = Math.min(10, Math.floor(36 / n));

  // Reset joueurs
  room.players.forEach(p => {
    p.bet       = null;
    p.tricksWon = 0;
    p.bonuses   = [];
    p.hand      = [];
  });

  // Distribution
  const deck = buildDeck();
  for (let i = 0; i < room.roundNumber; i++) {
    room.players.forEach(p => {
      const idx = Math.floor(Math.random() * deck.length);
      p.hand.push(deck.splice(idx, 1)[0]);
    });
  }

  room.phase        = 'betting';
  room.currentTrick = [];
  room.trickNumber  = 0;

  // Envoyer les mains privées
  const hands = {};
  room.players.forEach(p => { hands[p.id] = [...p.hand]; });

  io.to(room.code).emit('round-started', {
    room  : publicRoom(room),
    hands,
  });
}

function doResolveTrick(room) {
  const plays    = room.currentTrick;
  const winnerId = resolveTrick(plays);
  const winner   = room.players.find(p => p.id === winnerId);

  winner.tricksWon++;

  // Vérification des bonus
  const winnerPlay = plays.find(p => p.playerId === winnerId);
  const newBonuses = [];

  if (winnerPlay?.roll?.active) {
    if (winnerPlay.dieType === DieType.MINOTAURE &&
        plays.some(p => p.dieType === DieType.GRIFFON && p.roll.active)) {
      const b = { type: 'MINO_VS_GRIFFON', points: 20 };
      winner.bonuses.push(b);
      newBonuses.push(b);
    }
    if (winnerPlay.dieType === DieType.SIRENE &&
        plays.some(p => p.dieType === DieType.MINOTAURE && p.roll.active)) {
      const b = { type: 'SIRENE_VS_MINO', points: 30 };
      winner.bonuses.push(b);
      newBonuses.push(b);
    }
  }

  room.phase               = 'trick-result';
  room.trickNumber++;
  room.currentStarterIndex = room.players.findIndex(p => p.id === winnerId);

  io.to(room.code).emit('trick-resolved', {
    room        : publicRoom(room),
    winnerId,
    winnerName  : winner.name,
    plays,
    newBonuses,
  });
}

function doEndRound(room) {
  const roundScores = {};
  room.players.forEach(p => {
    const rs  = calcScore(p, room.roundNumber);
    p.score  += rs;
    roundScores[p.id] = rs;
  });

  const isLastRound = room.roundNumber >= room.maxRounds;
  room.phase        = isLastRound ? 'game-over' : 'round-score';

  io.to(room.code).emit('round-ended', {
    room : publicRoom(room),
    roundScores,
    isLastRound,
  });
}

// ═══════════════════════════════════════════════
//   SOCKET.IO — ÉVÉNEMENTS
// ═══════════════════════════════════════════════

io.on('connection', socket => {
  // ── Créer une salle ──────────────────────────
  socket.on('create-room', ({ name }) => {
    let code;
    do { code = genCode(); } while (rooms.has(code));

    const room = {
      code,
      hostId              : socket.id,
      players             : [makePlayer(socket.id, name)],
      phase               : 'waiting',
      roundNumber         : 1,
      maxRounds           : 10,
      currentTrick        : [],
      currentStarterIndex : 0,
      currentPlayerIndex  : 0,
      trickNumber         : 0,
    };

    rooms.set(code, room);
    socket.join(code);
    socket.emit('room-created', { code, room: publicRoom(room) });
  });

  // ── Rejoindre une salle ──────────────────────
  socket.on('join-room', ({ code, name }) => {
    const room = rooms.get(code?.toUpperCase());
    if (!room)                       return socket.emit('error', 'Salle introuvable.');
    if (room.phase !== 'waiting')    return socket.emit('error', 'Partie déjà commencée.');
    if (room.players.length >= 6)    return socket.emit('error', 'Salle pleine (6 max).');
    if (room.players.some(p => p.id === socket.id)) return;

    room.players.push(makePlayer(socket.id, name));
    socket.join(room.code);
    socket.emit('room-joined', { code: room.code, room: publicRoom(room) });
    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Lancer la partie ─────────────────────────
  socket.on('start-game', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'waiting') return;
    if (room.players.length < 2) return socket.emit('error', 'Minimum 2 joueurs.');
    startRound(room);
  });

  // ── Placer un pari ───────────────────────────
  socket.on('place-bet', ({ code, bet }) => {
    const room   = rooms.get(code);
    if (!room || room.phase !== 'betting') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.bet !== null)    return;
    if (bet < 0 || bet > room.roundNumber) return;

    player.bet = bet;

    if (room.players.every(p => p.bet !== null)) {
      room.phase             = 'playing';
      room.currentPlayerIndex = room.currentStarterIndex;
    }

    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Jouer un dé ──────────────────────────────
  socket.on('play-die', ({ code, dieIndex }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'playing') return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer?.id !== socket.id)           return;
    if (dieIndex < 0 || dieIndex >= currentPlayer.hand.length) return;

    // ── Validation règle de couleur ─────────────
    const validIndices = getValidIndices(currentPlayer.hand, room.currentTrick);
    if (!validIndices.includes(dieIndex)) {
      return socket.emit('error', 'Vous devez suivre la couleur ou jouer un atout !');
    }

    const dieType = currentPlayer.hand.splice(dieIndex, 1)[0];
    const roll    = rollDie(dieType);

    room.currentTrick.push({
      playerId   : socket.id,
      playerName : currentPlayer.name,
      dieType,
      roll,
      order      : room.currentTrick.length,
    });

    const allPlayed = room.currentTrick.length === room.players.length;

    if (allPlayed) {
      doResolveTrick(room);
    } else {
      room.currentPlayerIndex =
        (room.currentPlayerIndex + 1) % room.players.length;
      io.to(room.code).emit('room-updated', publicRoom(room));
    }
  });

  // ── Pli suivant (chef de salle uniquement) ───
  socket.on('next-trick', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'trick-result' || room.hostId !== socket.id) return;

    const roundOver = room.players.every(p => p.hand.length === 0);
    room.currentTrick = [];

    if (roundOver) {
      doEndRound(room);
    } else {
      room.phase              = 'playing';
      room.currentPlayerIndex = room.currentStarterIndex;
      io.to(room.code).emit('room-updated', publicRoom(room));
    }
  });

  // ── Manche suivante (chef de salle) ──────────
  socket.on('next-round', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'round-score' || room.hostId !== socket.id) return;

    room.roundNumber++;
    startRound(room);
  });

  // ── Déconnexion ───────────────────────────────
  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      const [left] = room.players.splice(idx, 1);

      if (room.players.length === 0) {
        rooms.delete(code);
        return;
      }

      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
      }

      io.to(code).emit('player-left', {
        name : left.name,
        room : publicRoom(room),
      });
      break;
    }
  });
});

// ═══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎲 Atouts Mythiques — http://localhost:${PORT}`);
});
