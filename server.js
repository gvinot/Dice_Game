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
  if (!NORMAL_TYPES.has(leadType)) return hand.map((_, i) => i); // entame atout : libre

  // Entame dé normal : le joueur a-t-il la couleur ?
  const canFollow = hand.some(t => t === leadType);
  if (!canFollow) return hand.map((_, i) => i); // pas la couleur → défausse libre

  // A la couleur → doit jouer cette couleur OU un atout
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
    bluffScore: 0,   // cumulatif sur toute la partie, jamais réinitialisé
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
    bluffMode            : room.bluffMode ?? false,
    bluffState           : room.bluffState ?? null,
    bluffCalledThisTrick : room.bluffCalledThisTrick ?? false,
    bluffWindowOpen      : room.bluffWindowTimer ?? false,
    accusedMustFollow    : room.accusedMustFollow ?? null, // { playerId, leadType }
    roundNumber     : room.roundNumber,
    maxRounds       : room.maxRounds,
    chosenMaxRounds : room.chosenMaxRounds,
    absoluteMax     : Math.floor(36 / room.players.length),
    trickNumber     : room.trickNumber,
    currentPlayerId : (room.phase === 'playing' && !room.bluffWindowTimer)
      ? room.players[room.currentPlayerIndex]?.id
      : null,
    playedThisTrick : room.currentTrick.map(p => p.playerId),
    currentTrick    : room.currentTrick,
    players         : room.players.map(p => ({
      id          : p.id,
      name        : p.name,
      score       : p.score,
      bluffScore  : p.bluffScore,
      bet         : p.bet,
      tricksWon   : p.tricksWon,
      bonuses     : p.bonuses,
      handSize    : p.hand.length,
      restartVote : room.restartVotes ? room.restartVotes[p.id] : undefined,
    })),
  };
}

// ═══════════════════════════════════════════════
//   FLUX DE JEU
// ═══════════════════════════════════════════════

function startRound(room) {
  const n = room.players.length;
  const absoluteMax = Math.floor(36 / n);
  // Respecte le choix du chef, plafonné par le max possible avec les joueurs actuels
  room.maxRounds = Math.min(room.chosenMaxRounds ?? absoluteMax, absoluteMax);

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
    // 🐂 Minotaure : +30 pts par Griffon actif vaincu
    if (winnerPlay.dieType === DieType.MINOTAURE) {
      const griffonsActifs = plays.filter(p =>
        p.dieType === DieType.GRIFFON && p.roll.active && p.playerId !== winnerId
      );
      if (griffonsActifs.length > 0) {
        const b = { type: 'MINO_VS_GRIFFON', points: griffonsActifs.length * 30, count: griffonsActifs.length };
        winner.bonuses.push(b);
        newBonuses.push(b);
      }
    }
    // 🧜 Sirène bat Minotaure : +50 pts
    if (winnerPlay.dieType === DieType.SIRENE) {
      const minotaureActif = plays.some(p =>
        p.dieType === DieType.MINOTAURE && p.roll.active && p.playerId !== winnerId
      );
      if (minotaureActif) {
        const b = { type: 'SIRENE_VS_MINO', points: 50 };
        winner.bonuses.push(b);
        newBonuses.push(b);
      }
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
  const bluffScores = {}; // capturés avant reset pour affichage côté client
  room.players.forEach(p => {
    const rs  = calcScore(p, room.roundNumber);
    bluffScores[p.id] = p.bluffScore ?? 0;
    p.score  += rs + (p.bluffScore ?? 0);
    p.bluffScore = 0;
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

// ═══════════════════════════════════════════════
//   SOCKET.IO — ÉVÉNEMENTS
// ═══════════════════════════════════════════════

io.on('connection', socket => {
  // ── Créer une salle ──────────────────────────
  socket.on('create-room', ({ name, maxRounds }) => {
    let code;
    do { code = genCode(); } while (rooms.has(code));

    const absoluteMax = Math.floor(36 / 1); // 1 joueur au départ → max théorique 36
    const chosen = (maxRounds && maxRounds >= 1) ? maxRounds : 10;

    const room = {
      code,
      hostId              : socket.id,
      players             : [makePlayer(socket.id, name)],
      phase               : 'waiting',
      roundNumber         : 1,
      maxRounds           : chosen,
      chosenMaxRounds     : chosen,
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
    if (!room) return socket.emit('error', 'Salle introuvable.');
    const joinablePhases = ['waiting', 'game-over', 'restart-vote'];
    if (!joinablePhases.includes(room.phase)) return socket.emit('error', 'Partie déjà commencée.');
    if (room.players.length >= 6)    return socket.emit('error', 'Salle pleine (6 max).');
    if (room.players.some(p => p.id === socket.id)) return;

    room.players.push(makePlayer(socket.id, name));

    // Si le nombre de manches choisies dépasse le nouveau max possible, on le réduit
    const newMax = Math.floor(36 / room.players.length);
    if ((room.chosenMaxRounds ?? room.maxRounds) > newMax) {
      room.chosenMaxRounds = newMax;
      room.maxRounds       = newMax;
    }

    socket.join(room.code);
    socket.emit('room-joined', { code: room.code, room: publicRoom(room) });
    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Modifier le nombre de manches (chef, phase waiting) ─
  socket.on('set-max-rounds', ({ code, maxRounds }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'waiting') return;
    const absoluteMax = Math.floor(36 / room.players.length);
    const validated   = Math.max(1, Math.min(absoluteMax, maxRounds));
    room.chosenMaxRounds = validated;
    room.maxRounds       = validated;
    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Lancer la partie ─────────────────────────
  socket.on('start-game', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'waiting') return;
    if (room.players.length < 2) return socket.emit('error', 'Minimum 2 joueurs.');
    startRound(room);
  });

  // ── Proposer une nouvelle partie (chef) ──────
  socket.on('request-restart', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'game-over') return;

    room.phase        = 'restart-vote';
    room.restartVotes = {};
    // Le chef vote oui automatiquement
    room.restartVotes[socket.id] = true;

    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Voter pour la nouvelle partie ────────────
  socket.on('vote-restart', ({ code, vote }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'restart-vote') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    room.restartVotes[socket.id] = vote; // true = oui, false = non

    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Lancer la nouvelle partie (chef) ─────────
  socket.on('launch-restart', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'restart-vote') return;
    if (room.players.length < 2) return socket.emit('error', 'Minimum 2 joueurs.');

    // Notifier et éjecter du channel socket les joueurs qui ont voté non
    room.players
      .filter(p => room.restartVotes[p.id] === false)
      .forEach(p => {
        io.to(p.id).emit('kicked-to-lobby', { reason: 'Vous avez refusé la nouvelle partie.' });
        // Forcer la sortie du channel socket.io — ils ne recevront plus rien
        const kickedSocket = io.sockets.sockets.get(p.id);
        if (kickedSocket) kickedSocket.leave(code);
      });

    // Retirer les joueurs qui ont voté non
    room.players = room.players.filter(p => room.restartVotes[p.id] !== false);

    if (room.players.length < 2) {
      return socket.emit('error', 'Pas assez de joueurs après les refus.');
    }

    // S'assurer que le chef est toujours dans la partie
    if (!room.players.find(p => p.id === room.hostId)) {
      room.hostId = room.players[0].id;
    }

    // Reset complet des scores pour une nouvelle partie
    room.players.forEach(p => { p.score = 0; });
    room.roundNumber        = 1;
    room.restartVotes       = {};
    room.currentStarterIndex = 0;
    room.currentPlayerIndex  = 0;

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

    // ── Validation règle de couleur (désactivée en mode bluff, sauf si accusé contraint) ──
    const mustFollow = room.accusedMustFollow;
    if (mustFollow && mustFollow.playerId === socket.id) {
      // L'accusé doit jouer la couleur d'entame ou un atout — toujours, même en mode bluff
      const validIndices = getValidIndices(currentPlayer.hand, room.currentTrick);
      if (!validIndices.includes(dieIndex)) {
        return socket.emit('error', 'Vous devez jouer la couleur ou un atout après un bluff confirmé !');
      }
      room.accusedMustFollow = null; // contrainte levée après ce coup
    } else if (!room.bluffMode) {
      const validIndices = getValidIndices(currentPlayer.hand, room.currentTrick);
      if (!validIndices.includes(dieIndex)) {
        return socket.emit('error', 'Vous devez suivre la couleur ou jouer un atout !');
      }
    }

    const dieType = currentPlayer.hand.splice(dieIndex, 1)[0];
    const roll    = rollDie(dieType);

    room.currentTrick.push({
      playerId      : socket.id,
      playerName    : currentPlayer.name,
      dieType,
      roll,
      order         : room.currentTrick.length,
      remainingHand : [...currentPlayer.hand], // main restante après avoir joué (pour vérif bluff)
      hadOnlyOneDie : currentPlayer.hand.length === 0 && room.currentTrick.length === room.currentTrick.length, // sera vrai si la main était d'1 dé
    });

    // Recalculer hadOnlyOneDie correctement (avant splice, main avait length+1)
    const justPushed = room.currentTrick[room.currentTrick.length - 1];
    justPushed.hadOnlyOneDie = (justPushed.remainingHand.length === 0
      && room.currentTrick.filter(p => p.playerId === socket.id).length === 1);

    const playersPlayed = new Set(room.currentTrick.map(p => p.playerId));
    const allPlayed = playersPlayed.size === room.players.length;

    if (allPlayed) {
      // FIX 4 : en mode bluff, délai de 4s avant résolution pour permettre l'accusation
      if (room.bluffMode) {
        room.phase = 'playing'; // reste en playing pendant le délai
        room.bluffCalledThisTrick = false;
        room.bluffWindowTimer = true;
        io.to(room.code).emit('room-updated', publicRoom(room));
        setTimeout(() => {
          // Vérifier que personne n'a appelé bluff pendant le délai
          if (room.bluffWindowTimer && room.phase === 'playing') {
            room.bluffWindowTimer = false;
            doResolveTrick(room);
          }
        }, 4000);
      } else {
        doResolveTrick(room);
      }
    } else {
      room.bluffCalledThisTrick = false; // reset pour le prochain joueur
      room.currentPlayerIndex =
        (room.currentPlayerIndex + 1) % room.players.length;
      io.to(room.code).emit('room-updated', publicRoom(room));
    }
  });

  // ── Activer / désactiver le mode bluff (chef, attente) ──
  socket.on('set-bluff-mode', ({ code, enabled }) => {
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id || room.phase !== 'waiting') return;
    room.bluffMode = !!enabled;
    io.to(room.code).emit('room-updated', publicRoom(room));
  });

  // ── Appeler un bluff ─────────────────────────────────────
  socket.on('call-bluff', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'playing' || !room.bluffMode) return;
    if (room.currentTrick.length === 0) return;

    // FIX 2 : un seul bluff par coup
    if (room.bluffCalledThisTrick) return;

    const trick    = room.currentTrick;
    const leadType = trick[0].dieType;
    if (!NORMAL_TYPES.has(leadType))
      return socket.emit('error', 'Bluff impossible : l\'entame est un atout.');

    const lastPlay = trick[trick.length - 1];
    const isSuspect = lastPlay.dieType !== leadType && !TRUMP_TYPES.has(lastPlay.dieType);
    if (!isSuspect)
      return socket.emit('error', 'Pas de bluff possible sur ce coup.');
    if (lastPlay.playerId === socket.id)
      return socket.emit('error', 'Vous ne pouvez pas vous accuser vous-même.');

    // FIX 5 : bluff impossible si le joueur n'avait qu'un seul dé
    if (lastPlay.hadOnlyOneDie)
      return socket.emit('error', 'Bluff impossible : il n\'avait qu\'un seul dé.');

    const caller  = room.players.find(p => p.id === socket.id);
    const accused = room.players.find(p => p.id === lastPlay.playerId);
    if (!caller || !accused) return;

    // FIX 2 : marquer le bluff comme appelé pour ce coup
    room.bluffCalledThisTrick = true;
    // Stopper le timer de résolution automatique
    room.bluffWindowTimer = false;

    const isBluff = lastPlay.remainingHand?.includes(leadType) ?? false;

    if (isBluff) {
      accused.bluffScore -= 20;
      caller.bluffScore  += 20;
      accused.hand.push(lastPlay.dieType);
      room.currentTrick = trick.filter(p => p.playerId !== accused.id);
    } else {
      caller.bluffScore -= 10;
    }

    room.phase      = 'bluff-check';
    room.bluffState = {
      callerId    : caller.id,
      callerName  : caller.name,
      accusedId   : accused.id,
      accusedName : accused.name,
      accusedDie  : lastPlay.dieType,
      leadType,
      isBluff,
      callerDelta : isBluff ? +20 : -10,
      accusedDelta: isBluff ? -20 : 0,
    };

    io.to(room.code).emit('bluff-resolved', {
      room       : publicRoom(room),
      bluffState : room.bluffState,
    });
  });

  // ── Continuer après résolution du bluff (chef) ───────────
  socket.on('continue-after-bluff', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.phase !== 'bluff-check' || room.hostId !== socket.id) return;

    const { isBluff, accusedId, leadType: bluffLeadType } = room.bluffState;
    room.bluffState          = null;
    room.bluffWindowTimer    = false;
    room.bluffCalledThisTrick = true;

    if (isBluff) {
      const idx = room.players.findIndex(p => p.id === accusedId);
      room.currentPlayerIndex = idx !== -1 ? idx : room.currentPlayerIndex;
      room.accusedMustFollow = {
        playerId : accusedId,
        leadType : bluffLeadType ?? room.currentTrick[0]?.dieType,
      };
      room.phase = 'playing';
      io.to(room.code).emit('room-updated', publicRoom(room));
      // Envoyer la main mise à jour à l'accusé (son dé lui a été rendu)
      const accusedPlayer = room.players.find(p => p.id === accusedId);
      if (accusedPlayer) {
        io.to(accusedId).emit('hand-updated', { hand: [...accusedPlayer.hand] });
      }
    } else {
      // Pas un bluff : le coup de l'accusé est toujours dans le pli
      // currentPlayerIndex est DÉJÀ sur le bon joueur (play-die l'a avancé avant l'accusation)
      const allPlayedNotBluff = new Set(room.currentTrick.map(p => p.playerId)).size >= room.players.length;
      if (allPlayedNotBluff) {
        doResolveTrick(room);
      } else {
        // Ne PAS avancer currentPlayerIndex — il pointe déjà sur le prochain joueur
        room.phase = 'playing';
        io.to(room.code).emit('room-updated', publicRoom(room));
      }
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
      room.phase                = 'playing';
      room.currentPlayerIndex   = room.currentStarterIndex;
      room.bluffCalledThisTrick = false;
      room.bluffWindowTimer     = false;
      room.accusedMustFollow    = null;
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

      // Salle vide → on supprime
      if (room.players.length === 0) {
        rooms.delete(code);
        return;
      }

      // Transfert du rôle de chef si nécessaire
      if (room.hostId === socket.id) {
        room.hostId = room.players[0].id;
      }

      // Ajuster les indices qui pointent après le joueur retiré
      if (room.currentStarterIndex >= room.players.length) {
        room.currentStarterIndex = 0;
      }
      if (room.currentPlayerIndex >= room.players.length) {
        room.currentPlayerIndex = room.currentPlayerIndex % room.players.length;
      }

      io.to(code).emit('player-left', { name: left.name, room: publicRoom(room) });

      // ── Récupération selon la phase en cours ───────────────
      const phase = room.phase;

      // Phase paris : si le joueur n'avait pas parié, on le retire et on vérifie si tout le monde a misé
      if (phase === 'betting') {
        if (room.players.every(p => p.bet !== null)) {
          room.phase              = 'playing';
          room.currentPlayerIndex = room.currentStarterIndex;
          io.to(code).emit('room-updated', publicRoom(room));
        }
      }

      // Phase jeu : si c'était son tour OU si le pli est maintenant complet sans lui
      if (phase === 'playing') {
        // Retirer son éventuel coup dans le pli en cours (sécurité)
        room.currentTrick = room.currentTrick.filter(p => p.playerId !== socket.id);

        const allPlayed = new Set(room.currentTrick.map(p => p.playerId)).size === room.players.length;
        if (allPlayed) {
          doResolveTrick(room);
        } else {
          // Recalculer qui doit jouer (en cas de désynchro d'index)
          if (room.currentPlayerIndex >= room.players.length) {
            room.currentPlayerIndex = 0;
          }
          io.to(code).emit('room-updated', publicRoom(room));
        }
      }

      // Phase résultat de pli : rien à faire, le chef avance manuellement
      // Phase scores de manche : rien à faire

      // Si plus qu'un joueur → fin de partie forcée
      if (room.players.length < 2 &&
          ['betting', 'playing', 'trick-result', 'round-score'].includes(phase)) {
        room.phase = 'game-over';
        io.to(code).emit('round-ended', {
          room        : publicRoom(room),
          roundScores : {},
          isLastRound : true,
        });
      }

      break;
    }
  });
});

// ═══════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎲 Atouts Mythiques — http://localhost:${PORT}`);
});
