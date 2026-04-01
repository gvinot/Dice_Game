// ════════════════════════════════════════════════════════
//   SOCKET — gestionnaires d'événements serveur → client
// ════════════════════════════════════════════════════════

const socket = io();

socket.on('connect', () => { S.myId = socket.id; });

socket.on('room-created', ({ code, room }) => {
  S.roomCode = code; S.room = room; S.isHost = true;
  renderWaiting(room);
});

socket.on('room-joined', ({ code, room }) => {
  S.roomCode = code; S.room = room;
  S.isHost   = room.hostId === S.myId;
  renderWaiting(room);
});

socket.on('bluff-resolved', ({ room, bluffState }) => {
  S.room   = room;
  S.isHost = room.hostId === S.myId;
  showBluffOverlay(bluffState);
});

// Main mise à jour après bluff confirmé (dé rendu à l'accusé)
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
    case 'waiting':     renderWaiting(room);       break;
    case 'betting':     updateBettingStatus(room);  break;
    case 'playing':     renderPlaying(room);        break;
    case 'game-over':   renderGameOver(room);       break;
    default: break;
  }
});

socket.on('kicked-to-lobby', ({ reason }) => {
  socket.disconnect();
  alert(reason);
  location.reload();
});

socket.on('error', msg => showToast(msg, 'error'));
