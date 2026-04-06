'use strict';

const { logger }         = require('../monitoring/logger');
const { inc }            = require('../monitoring/metrics');
const { addBreadcrumb }  = require('../monitoring/sentry');
const { captureGameEvent }  = require('../monitoring/sentry');

const { buildDeck }                 = require('../engine/Die');
const { DieType }                   = require('../engine/DieType');
const { publicRoom }                = require('./RoomFactory');
const { resolveTrick }              = require('../engine/TrickResolver');
const { calcScore }                 = require('../engine/ScoreCalculator');
const { touchRoom }                 = require('./RoomCleaner');
const { clearTurnTimer }            = require('./TurnTimer');
// ── Démarrage d'une manche ────────────────────────────────

function startRound(room, io) {
  touchRoom(room);
  clearTurnTimer(room);
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
  touchRoom(room);
  clearTurnTimer(room);
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

  inc('tricksResolved');
  addBreadcrumb('game', 'Pli résolu', { code: room.code, winnerId, trickNumber: room.trickNumber });
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
  touchRoom(room);
  clearTurnTimer(room);
  const roundScores = {};
  const bluffScores = {};

  room.players.forEach(p => {
    const rs         = calcScore(p, room.roundNumber);
    bluffScores[p.id] = p.bluffScore ?? 0;
    p.score          += rs + (p.bluffScore ?? 0);
    p.bluffScore      = 0;
    roundScores[p.id] = rs;
  });

  inc('roundsPlayed');
  addBreadcrumb('game', 'Manche terminée', { code: room.code, round: room.roundNumber, isLast: room.roundNumber >= room.maxRounds });
  const isLastRound = room.roundNumber >= room.maxRounds;
  room.phase        = isLastRound ? 'game-over' : 'round-score';
  if (isLastRound) {
    inc('gamesCompleted');
    logger.info('Game', 'Partie terminée', { code: room.code });
    // Envoi vers Sentry Issues (level=info) — visible et filtrable
    captureGameEvent('🎲 Partie terminée', {
      code        : room.code,
      players     : room.players.map(p => ({ name: p.name, score: p.score })),
      rounds      : room.roundNumber,
      bluffMode   : room.bluffMode,
    });
  }

  io.to(room.code).emit('round-ended', {
    room : publicRoom(room),
    roundScores,
    bluffScores,
    isLastRound,
  });
}

module.exports = { startRound, doResolveTrick, doEndRound };
