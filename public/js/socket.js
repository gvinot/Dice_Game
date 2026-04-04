// ════════════════════════════════════════════════════════
//   SOCKET — gestionnaires d'événements serveur → client
// ════════════════════════════════════════════════════════

const socket = io();

// ── Connexion : tenter restauration de session ───────────
socket.on('connect', () => {
  S.myId = socket.id;
  const token = sessionStorage.getItem('am_reconnect_token');
  if (token) {
    socket.emit('reconnect-session', { token });
  }
});

// ── Lobby ─────────────────────────────────────────────────
socket.on('room-created', ({ code, room, reconnectToken }) => {
  S.roomCode = code; S.room = room; S.isHost = true;
  if (reconnectToken) sessionStorage.setItem('am_reconnect_token', reconnectToken);
  renderWaiting(room);
});

socket.on('room-joined', ({ code, room, reconnectToken }) => {
  S.roomCode = code; S.room = room;
  S.isHost   = room.hostId === S.myId;
  if (reconnectToken) sessionStorage.setItem('am_reconnect_token', reconnectToken);
  renderWaiting(room);
});

// ── Reconnexion ───────────────────────────────────────────
socket.on('reconnect-ok', ({ code, room, hand, isHost, lastTrickData, lastRoundData, handForBetting }) => {
  S.roomCode = code;
  S.room     = room;
  S.isHost   = isHost;
  S.myHand   = hand;
  S.isMyTurn = room.currentPlayerId === S.myId;
  showToast('✅ Reconnexion réussie !', 'success');

  switch (room.phase) {
    case 'waiting':
      renderWaiting(room);
      break;
    case 'betting':
      // Restaurer la main si fournie par le serveur
      if (handForBetting) S.myHand = handForBetting;
      renderBetting(room);
      break;
    case 'playing':
      renderPlaying(room);
      break;
    case 'trick-result':
      // Restaurer l'écran de résultat du pli avec les vraies données
      if (lastTrickData) {
        renderTrickResult(room,
          lastTrickData.plays,
          lastTrickData.winnerId,
          lastTrickData.winnerName,
          lastTrickData.newBonuses
        );
      }
      break;
    case 'round-score':
      if (lastRoundData) {
        renderRoundScore(room, lastRoundData.roundScores, lastRoundData.bluffScores);
      }
      break;
    case 'game-over':
      renderGameOver(room);
      break;
    case 'restart-vote':
      renderRestartVote(room);
      break;
    default: break;
  }
});

socket.on('reconnect-failed', ({ reason }) => {
  sessionStorage.removeItem('am_reconnect_token');
  // Pas de toast d'erreur : l'utilisateur voit simplement le lobby
});

// ── Déconnexion temporaire d'un joueur (grace period) ────
socket.on('player-disconnected', ({ playerName, room }) => {
  S.room   = room;
  S.isHost = room.hostId === S.myId;
  showToast(`\u23F3 ${playerName} a perdu la connexion… (30s)`, 'info');
  if (room.phase === 'playing')  renderPlaying(room);
  if (room.phase === 'waiting')  renderWaiting(room);
});

socket.on('player-reconnected', ({ playerName, room }) => {
  S.room   = room;
  S.isHost = room.hostId === S.myId;
  showToast(`\u2705 ${playerName} est de retour !`, 'success');
  if (room.phase === 'playing')  renderPlaying(room);
  if (room.phase === 'waiting')  renderWaiting(room);
});

// ── Jeu ───────────────────────────────────────────────────
socket.on('bluff-resolved', ({ room, bluffState }) => {
  S.room   = room;
  S.isHost = room.hostId === S.myId;
  showBluffOverlay(bluffState);
});

socket.on('hand-updated', ({ hand }) => {
  S.myHand = hand;
  if (S.room) renderPlaying(S.room);
});

socket.on('room-updated', (room) => {
  S.room   = room;
  S.isHost = room.hostId === S.myId;
  if (room.phase === 'playing') {
    document.getElementById('bluff-overlay').style.display = 'none';
  }
  if (room.phase === 'waiting')       renderWaiting(room);
  if (room.phase === 'betting')       updateBettingStatus(room);
  if (room.phase === 'playing')       renderPlaying(room);
  if (room.phase === 'game-over')     renderGameOver(room);
  if (room.phase === 'restart-vote')  renderRestartVote(room);
});

socket.on('round-started', ({ room, hands }) => {
  S.room        = room;
  S.isHost      = room.hostId === S.myId;
  S.myHand      = hands[S.myId] || [];
  S.myBetPlaced = false;
  S.isMyTurn    = false;
  renderBetting(room);
});

socket.on('trick-resolved', ({ room, winnerId, winnerName, plays, newBonuses }) => {
  S.room     = room;
  S.isMyTurn = false;
  renderTrickResult(room, plays, winnerId, winnerName, newBonuses);
});

socket.on('round-ended', ({ room, roundScores, bluffScores, isLastRound }) => {
  S.room     = room;
  S.isMyTurn = false;
  if (isLastRound) renderGameOver(room);
  else             renderRoundScore(room, roundScores, bluffScores ?? {});
});

socket.on('player-left', ({ name, room }) => {
  S.room   = room;
  S.isHost = room.hostId === S.myId;
  showToast(`${name} a quitté la partie`, 'info');
  switch (room.phase) {
    case 'waiting':   renderWaiting(room);      break;
    case 'betting':   updateBettingStatus(room); break;
    case 'playing':   renderPlaying(room);       break;
    case 'game-over': renderGameOver(room);      break;
    default: break;
  }
});

socket.on('kicked-to-lobby', ({ reason }) => {
  sessionStorage.removeItem('am_reconnect_token');
  socket.disconnect();
  alert(reason);
  location.reload();
});

// Quitter proprement depuis game-over (bouton "Quitter")
function quitToLobby() {
  sessionStorage.removeItem('am_reconnect_token');
  location.reload();
}

socket.on('error', msg => showToast(msg, 'error'));
