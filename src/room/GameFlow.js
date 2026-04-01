'use strict';

const { buildDeck, rollDie }        = require('../engine/Die');
const { DieType, TRUMP_TYPES }      = require('../engine/DieType');
const { resolveTrick }              = require('../engine/TrickResolver');
const { calcScore }                 = require('../engine/ScoreCalculator');
const { publicRoom, makePlayer }    = require('./RoomFactory');

// ── Démarrage d'une manche ────────────────────────────────

function startRound(room, io) {
  const n           = room.players.length;
  const absoluteMax = Math.floor(36 / n);
  room.maxRounds    = Math.min(room.chosenMaxRounds ?? absoluteMax, absoluteMax);

  // Reset joueurs
  room.players.forEach(p => {
    p.bet       = null;
    p.tricksWon = 0;
    p.bonuses   = [];
    p.hand      = [];
  });

  // Distribution des dés
  const deck = buildDeck();
  for (let i = 0; i < room.roundNumber; i++) {
    room.players.forEach(p => {
      const idx = Math.floor(Math.random() * deck.length);
      p.hand.push(deck.splice(idx, 1)[0]);
    });
  }

  room.phase               = 'betting';
  room.currentTrick        = [];
  room.trickNumber         = 0;
  room.bluffCalledThisTrick = false;
  room.bluffWindowTimer    = false;
  room.accusedMustFollow   = null;
  room.bluffState          = null;

  // Envoyer les mains privées
  const hands = {};
  room.players.forEach(p => { hands[p.id] = [...p.hand]; });

  io.to(room.code).emit('round-started', {
    room  : publicRoom(room),
    hands,
  });
}

// ── Résolution d'un pli ───────────────────────────────────

function doResolveTrick(room, io) {
  const plays    = room.currentTrick;
  const winnerId = resolveTrick(plays);
  const winner   = room.players.find(p => p.id === winnerId);

  winner.tricksWon++;

  // Vérification des bonus
  const winnerPlay = plays.find(p => p.playerId === winnerId);
  const newBonuses = [];

  if (winnerPlay?.roll?.active) {
    // 🐂 Minotaure bat Griffon(s) → +30 pts par Griffon
    if (winnerPlay.dieType === DieType.MINOTAURE) {
      const griffons = plays.filter(p =>
        p.dieType === DieType.GRIFFON && p.roll.active && p.playerId !== winnerId
      );
      if (griffons.length > 0) {
        const b = { type: 'MINO_VS_GRIFFON', points: griffons.length * 30, count: griffons.length };
        winner.bonuses.push(b);
        newBonuses.push(b);
      }
    }
    // 🧜 Sirène bat Minotaure → +50 pts
    if (winnerPlay.dieType === DieType.SIRENE) {
      const hasMino = plays.some(p =>
        p.dieType === DieType.MINOTAURE && p.roll.active && p.playerId !== winnerId
      );
      if (hasMino) {
        const b = { type: 'SIRENE_VS_MINO', points: 50 };
        winner.bonuses.push(b);
        newBonuses.push(b);
      }
    }
  }

  room.phase               = 'trick-result';
  room.trickNumber++;
  room.currentStarterIndex = room.players.findIndex(p => p.id === winnerId);
  room.bluffCalledThisTrick = false;
  room.bluffWindowTimer    = false;
  room.accusedMustFollow   = null;

  io.to(room.code).emit('trick-resolved', {
    room       : publicRoom(room),
    winnerId,
    winnerName : winner.name,
    plays,
    newBonuses,
  });
}

// ── Fin de manche ─────────────────────────────────────────

function doEndRound(room, io) {
  const roundScores = {};
  const bluffScores = {};

  room.players.forEach(p => {
    const rs         = calcScore(p, room.roundNumber);
    bluffScores[p.id] = p.bluffScore ?? 0;
    p.score          += rs + (p.bluffScore ?? 0);
    p.bluffScore      = 0;
    roundScores[p.id] = rs;
  });

  const isLastRound = room.roundNumber >= room.maxRounds;
  room.phase        = isLastRound ? 'game-over' : 'round-score';

  io.to(room.code).emit('round-ended', {
    room : publicRoom(room),
    roundScores,
    bluffScores,
    isLastRound,
  });
}

module.exports = { startRound, doResolveTrick, doEndRound };
