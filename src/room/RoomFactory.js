'use strict';

// ── Générateur de code de salle ──────────────────────────
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(existingCodes) {
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    ).join('');
  } while (existingCodes.has(code));
  return code;
}

// ── Constructeurs ─────────────────────────────────────────

function makePlayer(socketId, name) {
  return {
    id         : socketId,
    name,
    score      : 0,
    bluffScore : 0,
    bet        : null,
    tricksWon  : 0,
    bonuses    : [],
    hand       : [],
  };
}

function makeRoom(code, hostId, hostName, maxRounds = 10) {
  return {
    code,
    hostId,
    players             : [makePlayer(hostId, hostName)],
    phase               : 'waiting',
    roundNumber         : 1,
    maxRounds,
    chosenMaxRounds     : maxRounds,
    currentTrick        : [],
    currentStarterIndex : 0,
    currentPlayerIndex  : 0,
    trickNumber         : 0,
    bluffMode           : false,
    bluffState          : null,
    bluffCalledThisTrick: false,
    bluffWindowTimer    : false,
    accusedMustFollow   : null,
    restartVotes        : {},
  };
}

// ── Sérialisation publique (sans les mains privées) ───────

function publicRoom(room) {
  return {
    code                 : room.code,
    hostId               : room.hostId,
    phase                : room.phase,
    bluffMode            : room.bluffMode ?? false,
    bluffState           : room.bluffState ?? null,
    bluffCalledThisTrick : room.bluffCalledThisTrick ?? false,
    bluffWindowOpen      : room.bluffWindowTimer ?? false,
    accusedMustFollow    : room.accusedMustFollow ?? null,
    roundNumber          : room.roundNumber,
    maxRounds            : room.maxRounds,
    chosenMaxRounds      : room.chosenMaxRounds,
    absoluteMax          : Math.floor(36 / room.players.length),
    trickNumber          : room.trickNumber,
    currentPlayerId      : (room.phase === 'playing' && !room.bluffWindowTimer)
      ? room.players[room.currentPlayerIndex]?.id
      : null,
    playedThisTrick      : room.currentTrick.map(p => p.playerId),
    currentTrick         : room.currentTrick,
    players              : room.players.map(p => ({
      id          : p.id,
      name        : p.name,
      score       : p.score,
      bluffScore  : p.bluffScore,
      bet         : p.bet,
      tricksWon   : p.tricksWon,
      bonuses     : p.bonuses,
      handSize    : p.hand.length,
      restartVote : room.restartVotes?.[p.id],
    })),
  };
}

module.exports = { genCode, makePlayer, makeRoom, publicRoom };
