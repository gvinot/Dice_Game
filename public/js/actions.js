// ── Sélecteur nombre de manches ──────────────────────────
let S_chosenRounds = 10;

function changeRounds(delta) {
  const max      = S.room?.absoluteMax ?? 18;
  S_chosenRounds = Math.max(1, Math.min(max, S_chosenRounds + delta));
  document.getElementById('rounds-display').textContent = S_chosenRounds;
  document.getElementById('rounds-hint').textContent    =
    `Max ${max} avec ${S.room?.players?.length ?? '?'} joueur(s)`;
  socket.emit('set-max-rounds', { code: S.roomCode, maxRounds: S_chosenRounds });
}

// ── Lobby ─────────────────────────────────────────────────
function createRoom() {
  const name = document.getElementById('input-name').value.trim();
  if (!name) return showToast('Entrez votre prénom', 'error');
  S.myName = name;
  socket.emit('create-room', { name, maxRounds: 10 });
}

function joinRoom() {
  const name = document.getElementById('input-name').value.trim();
  const code = document.getElementById('input-code').value.trim().toUpperCase();
  if (!name)             return showToast('Entrez votre prénom', 'error');
  if (code.length !== 4) return showToast('Le code fait 4 caractères', 'error');
  S.myName = name;
  socket.emit('join-room', { code, name });
}

function startGame() {
  socket.emit('start-game', { code: S.roomCode });
}

// ── Paris ─────────────────────────────────────────────────
function placeBet(bet) {
  if (S.myBetPlaced) return;
  S.myBetPlaced = true;

  document.querySelectorAll('.bet-btn').forEach((b, i) => {
    b.disabled = true;
    if (i === bet) b.classList.add('selected');
  });
  document.getElementById('bet-section').classList.add('hidden');
  document.getElementById('bet-waiting-msg').classList.remove('hidden');
  document.getElementById('bet-chosen-label').textContent = `Pari de ${bet} enregistré !`;
  socket.emit('place-bet', { code: S.roomCode, bet });
}

// ── Jeu ───────────────────────────────────────────────────
function playDie(index) {
  if (!S.isMyTurn) return;
  S.isMyTurn = false;
  S.myHand.splice(index, 1);
  document.getElementById('my-hand-playing').innerHTML =
    S.myHand.map(t => dieTile(t, -1, false)).join('');
  socket.emit('play-die', { code: S.roomCode, dieIndex: index });
}

function nextTrick() { socket.emit('next-trick', { code: S.roomCode }); }
function nextRound()  { socket.emit('next-round',  { code: S.roomCode }); }

// ── Nouvelle partie ───────────────────────────────────────
function requestRestart() { socket.emit('request-restart', { code: S.roomCode }); }
function voteRestart(vote) { socket.emit('vote-restart',  { code: S.roomCode, vote }); }
function launchRestart()   { socket.emit('launch-restart', { code: S.roomCode }); }

// ── Bluff ─────────────────────────────────────────────────
function setBluffMode(enabled) {
  const track = document.getElementById('bluff-toggle-track');
  const thumb = document.getElementById('bluff-toggle-thumb');
  track.style.background = enabled ? '#e8704a' : 'var(--border)';
  thumb.style.transform  = enabled ? 'translateX(22px)' : 'none';
  thumb.style.background = enabled ? '#fff' : 'var(--muted)';
  socket.emit('set-bluff-mode', { code: S.roomCode, enabled });
}

function callBluff() {
  socket.emit('call-bluff', { code: S.roomCode });
}

function continueAfterBluff() {
  socket.emit('continue-after-bluff', { code: S.roomCode });
  document.getElementById('bluff-overlay').style.display = 'none';
}
