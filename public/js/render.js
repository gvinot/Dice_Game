// ════════════════════════════════════════════════════════
//   RENDERS — mise à jour du DOM pour chaque écran
// ════════════════════════════════════════════════════════

function renderWaiting(room) {
  showScreen('screen-waiting');
  updateRulesFab('waiting');
  document.getElementById('room-code-display').textContent = room.code;

  document.getElementById('waiting-players-list').innerHTML =
    room.players.map(p => `
      <div class="player-item ${p.id === room.hostId ? 'host' : ''}">
        <svg class="icon" style="width:1.1em;height:1.1em; color:${p.id === room.hostId ? 'gold' : '#aaa'};">
          <use href="${p.id === room.hostId ? '#ic-crown' : '#ic-player'}"></use>
        </svg>
        <span>${p.name}</span>
        ${p.id === room.hostId ? '<span class="badge">Chef de salle</span>' : ''}
      </div>`).join('');

  // Toggle mode bluff (chef uniquement)
  const bluffWrap   = document.getElementById('bluff-toggle-wrap');
  const bluffToggle = document.getElementById('bluff-toggle');
  const bluffTrack  = document.getElementById('bluff-toggle-track');
  const bluffThumb  = document.getElementById('bluff-toggle-thumb');
  if (S.isHost) {
    bluffWrap.style.display     = 'flex';
    bluffToggle.checked         = room.bluffMode ?? false;
    bluffTrack.style.background = room.bluffMode ? '#e8704a' : 'var(--border)';
    bluffThumb.style.transform  = room.bluffMode ? 'translateX(22px)' : 'none';
    bluffThumb.style.background = room.bluffMode ? '#fff' : 'var(--muted)';
  } else {
    bluffWrap.style.display = 'none';
  }

  // Sélecteur de manches (chef uniquement)
  const selector   = document.getElementById('rounds-selector');
  const actual     = room.absoluteMax ?? room.maxRounds;
  const chosen     = room.chosenMaxRounds ?? room.maxRounds;
  const wasReduced = (room.chosenMaxRounds ?? 0) > actual;

  if (S.isHost) {
    selector.classList.remove('hidden');
    S_chosenRounds = chosen;
    document.getElementById('rounds-display').textContent = chosen;
    document.getElementById('rounds-hint').textContent    = wasReduced
      ? `⚠️ Réduit à ${actual} (trop de joueurs)`
      : `Max ${actual} avec ${room.players.length} joueur(s)`;
  } else {
    selector.classList.add('hidden');
  }

  // Info manches visible par tous
  const roundsInfo = document.getElementById('waiting-rounds-info');
  if (roundsInfo) {
    roundsInfo.innerHTML = `<span style="color:var(--gold-lt);">${chosen} manche${chosen > 1 ? 's' : ''}</span>${
      wasReduced ? ` <span class="small" style="font-style:italic;">(max ${actual} avec ${room.players.length} joueurs)</span>` : ''
    }`;
  }

  const startBtn   = document.getElementById('start-btn');
  const waitingMsg = document.getElementById('waiting-msg');
  if (S.isHost) {
    startBtn.classList.remove('hidden');
    waitingMsg.classList.add('hidden');
    startBtn.disabled    = room.players.length < 2;
    startBtn.textContent = room.players.length < 2
      ? '⌛ En attente de joueurs…'
      : `▶ Lancer (${room.players.length} joueurs)`;
  } else {
    startBtn.classList.add('hidden');
    waitingMsg.classList.remove('hidden');
  }
}

function renderBetting(room) {
  showScreen('screen-betting');
  updateRulesFab('betting');
  document.getElementById('bet-round-num').textContent  = room.roundNumber;
  document.getElementById('bet-max-rounds').textContent = room.maxRounds;
  document.getElementById('my-hand-betting').innerHTML  =
    S.myHand.map(t => dieTile(t, -1, false)).join('');

  const betDiv = document.getElementById('bet-buttons');
  betDiv.innerHTML = '';
  for (let i = 0; i <= room.roundNumber; i++) {
    const btn       = document.createElement('button');
    btn.className   = 'bet-btn';
    btn.textContent = i;
    btn.onclick     = () => placeBet(i);
    betDiv.appendChild(btn);
  }
  document.getElementById('bet-section').classList.remove('hidden');
  document.getElementById('bet-waiting-msg').classList.add('hidden');
  updateBettingStatus(room);
}

function updateBettingStatus(room) {
  document.getElementById('betting-players-status').innerHTML =
    room.players.map(p => `
      <div class="status-chip ${p.bet !== null ? 'played' : ''}">
        ${
          p.bet !== null
            ? `<svg class="icon" style="width:1em;height:1em;vertical-align:middle;color:#4caf50;">
                 <use href="#ic-check"></use>
               </svg>`
            : `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--muted);"><use href="#ic-hourglass"></use></svg>`
        }
        
        ${p.name}
      </div>`).join('');

  if (S.myBetPlaced) {
    const pending = room.players.filter(p => p.bet === null).map(p => p.name);
    document.getElementById('bet-pending-list').innerHTML = pending.length > 0
      ? `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--muted);"><use href="#ic-hourglass"></use></svg> En attente de : ${pending.join(', ')}`
      : `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--success);"><use href="#ic-check"></use></svg> Tous prêts !`;
  }
}

function renderPlaying(room) {
  showScreen('screen-playing');
  updateRulesFab('playing');

  const isMyTurn = room.currentPlayerId === S.myId;
  S.isMyTurn     = isMyTurn;

  document.getElementById('play-round-num').textContent   = room.roundNumber;
  document.getElementById('play-trick-num').textContent   = (room.trickNumber ?? 0) + 1;
  document.getElementById('play-round-total').textContent = room.roundNumber;

  // Bannière de tour
  const banner = document.getElementById('turn-banner');
  banner.style.background = '';
  banner.style.border     = '';
  banner.style.color      = '';
  if (room.bluffWindowOpen) {
    banner.innerHTML        = `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:#e8704a;"><use href="#ic-mask"></use></svg> Fenêtre bluff ouverte — 4 secondes pour accuser !`;
    banner.className        = 'turn-banner w-full';
    banner.style.background = 'rgba(232,112,74,.12)';
    banner.style.border     = '1px solid rgba(232,112,74,.4)';
    banner.style.color      = '#e8704a';
  } else if (isMyTurn) {
    banner.innerHTML   = `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:currentColor;"><use href="#ic-crossed-swords"></use></svg> C'est votre tour — choisissez un dé !`;
    banner.className   = 'turn-banner my-turn w-full';
  } else {
    const cur          = room.players.find(p => p.id === room.currentPlayerId);
    banner.innerHTML   = cur ? `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--muted);"><use href="#ic-hourglass"></use></svg> Tour de ${cur.name}…` : '…';
    banner.className   = 'turn-banner waiting w-full';
  }

  // Pli en cours
  const trickDiv = document.getElementById('current-trick-display');
  if (!room.currentTrick || room.currentTrick.length === 0) {
    trickDiv.innerHTML     = '<p class="text-muted">Aucun dé joué pour l\'instant</p>';
    trickDiv.style.cssText = 'min-height:100px;display:flex;align-items:center;justify-content:center;';
  } else {
    trickDiv.style.cssText = '';
    trickDiv.innerHTML     = `<div class="trick-plays">${
      room.currentTrick.map(play => `
        <div class="play-card">
          <div class="play-name">${play.playerName}</div>
          ${dieTile(play.dieType, -1, false)}
          ${rollResultHTML(play.roll)}
        </div>`).join('')
    }</div>`;
  }

  // Chips statut joueurs
  const played = new Set(room.playedThisTrick || []);
  document.getElementById('player-status-row').innerHTML =
    room.players.map(p => {
      const hasPl = played.has(p.id);
      const isCur = p.id === room.currentPlayerId;
      const icon  = hasPl ? `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--success);"><use href="#ic-check"></use></svg>` : isCur ? `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--gold);"><use href="#ic-dice"></use></svg>` : `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--muted);"><use href="#ic-hourglass"></use></svg>`;
      const cls   = hasPl ? 'played' : isCur ? 'active-player' : '';
      return `<div class="status-chip ${cls}">${icon} ${p.name}</div>`;
    }).join('');

  // Main + règle de couleur (priorité : accusé contraint > bluff > normal)
  const mustFollow = room.accusedMustFollow;
  const iAmAccused = mustFollow?.playerId === S.myId;
  const validSet   = new Set(
    iAmAccused || !room.bluffMode
      ? getValidIndices(S.myHand, room.currentTrick)
      : S.myHand.map((_, i) => i)
  );
  const leadType = room.currentTrick?.[0]?.dieType;
  const hintEl   = document.getElementById('color-constraint-hint');

 if (iAmAccused && isMyTurn) {
  const cfg     = DIE_CFG[mustFollow.leadType] || {};
  const iconId3 = `ic-${mustFollow.leadType.toLowerCase()}`;
  hintEl.innerHTML =
    `<span style="display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;">` +
      `<span><svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:#e8704a;"><use href="#ic-hand"></use></svg> Bluff confirmé — jouez</span>` +
      `<svg style="display:inline-block;width:1.2em;height:1.2em;vertical-align:-.15em;fill:currentColor;" xmlns="http://www.w3.org/2000/svg"><use href="#${iconId3}"/></svg>` +
      `<span>${cfg.label ?? mustFollow.leadType} ou un atout</span>` +
    `</span>`;
  hintEl.classList.remove('hidden');

} else if (!room.bluffMode && isMyTurn && room.currentTrick.length > 0 && NORMAL_TYPES.has(leadType)) {
  const cfg = DIE_CFG[leadType] || {};

  if (S.myHand.some(t => t === leadType)) {
    const iconId4 = `ic-${leadType.toLowerCase()}`;
    hintEl.innerHTML =
      `<span style="display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;">` +
        `<svg style="display:inline-block;width:1.2em;height:1.2em;vertical-align:-.15em;fill:currentColor;" xmlns="http://www.w3.org/2000/svg"><use href="#${iconId4}"/></svg>` +
        `<span>Vous devez jouer la couleur <strong>${cfg.label}</strong> ou un atout</span>` +
      `</span>`;
    hintEl.classList.remove('hidden');
  } else {
    hintEl.classList.add('hidden');
  }
} else {
  hintEl.classList.add('hidden');
}

  document.getElementById('hand-label').textContent = isMyTurn ? 'Choisissez un dé' : 'Votre main';
  document.getElementById('my-hand-playing').innerHTML =
    S.myHand.map((t, i) => dieTile(t, i, isMyTurn, validSet.has(i))).join('');

  // Bilan rapide
  document.getElementById('quick-scores').innerHTML =
    room.players.map(p => {
      const bluffTxt = (p.bluffScore && p.bluffScore !== 0)
        ? ` <span style="color:${p.bluffScore > 0 ? '#6dd99a' : '#ff9090'}; font-size:.78rem;">(bluff ${p.bluffScore > 0 ? '+' : ''}${p.bluffScore})</span>`
        : '';
      return `<div class="mini-score-row">
        <span>${p.name}${bluffTxt}</span>
        <span style="font-style:italic;">${p.tricksWon} / ${p.bet ?? '?'} pli${p.tricksWon !== 1 ? 's' : ''}</span>
        <span class="text-gold">${p.score} pts</span>
      </div>`;
    }).join('');

  // Bouton bluff
  const bluffBadge = document.getElementById('bluff-mode-badge');
  const bluffBtn   = document.getElementById('bluff-btn');
  if (room.bluffMode) {
    bluffBadge.classList.remove('hidden');
    const trick        = room.currentTrick ?? [];
    const lastPlay     = trick[trick.length - 1];
    const leadType2    = trick[0]?.dieType;
    const canCallBluff = !room.bluffCalledThisTrick
      && trick.length > 0
      && lastPlay?.playerId !== S.myId
      && NORMAL_TYPES.has(leadType2)
      && !TRUMP_TYPES.has(lastPlay?.dieType)
      && lastPlay?.dieType !== leadType2;

    bluffBtn.classList.remove('hidden');
    bluffBtn.disabled = !canCallBluff;
    canCallBluff ? bluffBtn.classList.add('glow') : bluffBtn.classList.remove('glow');
  } else {
    bluffBadge.classList.add('hidden');
    bluffBtn.classList.add('hidden');
    bluffBtn.classList.remove('glow');
  }
}

function renderTrickResult(room, plays, winnerId, winnerName, newBonuses) {
  showScreen('screen-trick-result');
  updateRulesFab('trick-result');

  const el = document.getElementById('trick-winner-announce');

  el.innerHTML = `
    <svg class="icon" style="width:1.1em;height:1.1em;margin-right:.2em;vertical-align:-.15em;">
      <use href="#ic-trophy"></use>
    </svg>
  `;

  el.append(` ${winnerName} remporte le pli !`);

  const container = document.getElementById('trick-plays-final');
  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'trick-plays';

  plays.forEach(p => {
    const card = document.createElement('div');
    card.className = `play-result-card ${p.playerId === winnerId ? 'winner' : ''}`;

    const name = document.createElement('div');
    name.className = 'play-name';

    // texte sécurisé
    name.append(p.playerName);

    if (p.playerId === winnerId) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon');
      svg.setAttribute('style', 'width:1.1em;height:1.1em;margin-right:.2em;vertical-align:-.15em;');

      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#ic-trophy');

      svg.appendChild(use);
      name.appendChild(svg);
    }

    card.appendChild(name);

    // ⚠️ à condition que ces fonctions soient safe
    card.insertAdjacentHTML('beforeend', dieTile(p.dieType, -1, false));
    card.insertAdjacentHTML('beforeend', rollResultHTML(p.roll));

    wrapper.appendChild(card);
  });

  container.appendChild(wrapper);

  document.getElementById('trick-bonuses').innerHTML =
    (newBonuses && newBonuses.length > 0)
      ? newBonuses.map(b => `<div class="bonus-badge">${
          b.type === 'MINO_VS_GRIFFON'
            ? `⭐ Minotaure bat ${b.count} Griffon${b.count > 1 ? 's' : ''} (+${b.points} pts)`
            : '⭐ Sirène bat Minotaure (+50 pts)'
        }</div>`).join('')
      : '';

  document.getElementById('trick-scores-so-far').innerHTML =
    room.players.map(p => `
      <div class="mini-score-row">
        <span>${p.name}</span>
        <span style="font-style:italic;">${p.tricksWon} / ${p.bet ?? '?'} pli${p.tricksWon !== 1 ? 's' : ''}</span>
        <span class="text-gold">${p.score} pts</span>
      </div>`).join('');

  const isRoundOver = room.players.every(p => (p.handSize ?? 0) === 0);
  const btnTrick    = document.getElementById('next-trick-btn');
  const btnRound    = document.getElementById('next-round-from-trick-btn');
  const waitMsg     = document.getElementById('wait-next-trick-msg');
  btnTrick.classList.add('hidden');
  btnRound.classList.add('hidden');
  waitMsg.classList.add('hidden');
  if (S.isHost) {
    (isRoundOver ? btnRound : btnTrick).classList.remove('hidden');
  } else {
    waitMsg.classList.remove('hidden');
  }
}

function renderRoundScore(room, roundScores, bluffScores = {}) {
  showScreen('screen-score');
  updateRulesFab('round-score');
  document.getElementById('score-round-label').textContent =
    `Manche ${room.roundNumber} / ${room.maxRounds}`;

  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  document.getElementById('round-scores-table').innerHTML =
    sorted.map(p => {
      const rs       = roundScores[p.id] ?? 0;
      const bs       = bluffScores[p.id] ?? 0;
      const total    = rs + bs;
      const sign     = total > 0 ? '+' : '';
      const cls      = total > 0 ? 'pos' : total < 0 ? 'neg' : 'zero';
      const bonusPts = p.bonuses.reduce((s, b) => s + b.points, 0);
      const details  = [`${p.tricksWon} pli${p.tricksWon !== 1 ? 's' : ''} / pari ${p.bet}`];
      if (bonusPts !== 0) details.push(`⭐ +${bonusPts}`);
      if (bs !== 0)       details.push(`<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:currentColor;"><use href="#ic-mask"></use></svg> ${bs > 0 ? '+' : ''}${bs}`);
      const baseOnly = rs - bonusPts;
      const parts    = [];
      if (baseOnly !== 0) parts.push(`${baseOnly > 0 ? '+' : ''}${baseOnly} paris`);
      if (bonusPts !== 0) parts.push(`+${bonusPts} bonus`);
      if (bs !== 0)       parts.push(`${bs > 0 ? '+' : ''}${bs} bluff`);
      const breakdown = parts.length > 1
        ? `<div style="font-size:.7rem; color:var(--muted); font-style:italic; margin-top:2px;">${parts.join(' · ')}</div>`
        : '';
      return `<div class="score-row">
        <div class="player-col">
          <span>${p.name}</span>
          <span class="text-muted small">${details.join(' · ')}</span>
        </div>
        <div class="detail-col">
          <span class="round-delta ${cls}">${sign}${total} pts</span>
          ${breakdown}
          <span class="total-pts">${p.score} total</span>
        </div>
      </div>`;
    }).join('');

  const nextBtn = document.getElementById('next-round-btn');
  const waitMsg = document.getElementById('next-round-wait');
  if (S.isHost) { nextBtn.classList.remove('hidden'); waitMsg.classList.add('hidden'); }
  else          { nextBtn.classList.add('hidden');    waitMsg.classList.remove('hidden'); }
}

function renderGameOver(room) {
  showScreen('screen-gameover');
  updateRulesFab('game-over');
  const sorted = [...room.players].sort((a, b) => b.score - a.score);
  const medals  = ['🥇', '🥈', '🥉'];
  document.getElementById('final-scores-table').innerHTML =
    sorted.map((p, i) => `
      <div class="score-row ${i === 0 ? 'winner-row' : ''}">
        <div class="player-col">
          <span>${medals[i] ?? `${i+1}.`} ${p.name}</span>
        </div>
        <div class="detail-col">
          <span class="round-delta pos" style="font-size:1.4rem;">${p.score}</span>
          <span class="total-pts">points</span>
        </div>
      </div>`).join('');

  document.getElementById('gameover-code').textContent = room.code;
  document.getElementById('gameover-players').innerHTML =
    room.players.map(p => `
      <div class="player-item ${p.id === room.hostId ? 'host' : ''}">
        <svg class="icon" style="width:1.1em;height:1.1em; color:${p.id === room.hostId ? 'gold' : '#aaa'};">
          <use href="${p.id === room.hostId ? '#ic-crown' : '#ic-player'}"></use>
        </svg>
        <span>${p.name}</span>
      </div>`).join('');

  const btn = document.getElementById('gameover-restart-btn');
  if (S.isHost) btn.classList.remove('hidden');
  else          btn.classList.add('hidden');
}

function renderRestartVote(room) {
  showScreen('screen-restart-vote');
  updateRulesFab('restart-vote');
  document.getElementById('vote-room-code').textContent = room.code;

  document.getElementById('vote-players-list').innerHTML =
    room.players.map(p => {
      const v     = p.restartVote;
      const icon  = v === true ? `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--success);"><use href="#ic-check"></use></svg>` : v === false ? `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--danger);"><use href="#ic-xmark"></use></svg>` : `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--muted);"><use href="#ic-hourglass"></use></svg>`;
      const label = v === true ? 'Oui' : v === false ? 'Non' : 'En attente…';
      const cls   = p.id === room.hostId ? 'host' : '';
      return `<div class="player-item ${cls}">
        <svg class="icon" style="width:1.1em;height:1.1em; color:${p.id === room.hostId ? 'gold' : '#aaa'};">
          <use href="${p.id === room.hostId ? '#ic-crown' : '#ic-player'}"></use>
        </svg>
        <span style="flex:1;">${p.name}</span>
        <span style="font-family:'Cinzel',serif; font-size:.85rem;">${icon} ${label}</span>
      </div>`;
    }).join('');

  const myVote   = room.players.find(p => p.id === S.myId)?.restartVote;
  const voteBtns = document.getElementById('vote-buttons');
  const doneMsg  = document.getElementById('vote-done-msg');
  const launchBtn = document.getElementById('launch-restart-btn');
  const launchWait = document.getElementById('launch-restart-wait');

  if (!S.isHost) {
    launchBtn.classList.add('hidden');
    launchWait.classList.remove('hidden');
    if (myVote === undefined || myVote === null) {
      voteBtns.classList.remove('hidden');
      doneMsg.classList.add('hidden');
    } else {
      voteBtns.classList.add('hidden');
      doneMsg.classList.remove('hidden');
      doneMsg.innerHTML   = myVote
        ? `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--success);"><use href="#ic-check"></use></svg> Vous avez voté Oui — en attente du chef…`
        : `<svg class="icon" style="width:1em;height:1em;vertical-align:-.12em;flex-shrink:0;color:var(--danger);"><use href="#ic-xmark"></use></svg> Vous avez voté Non — en attente du chef…`;
    }
  } else {
    voteBtns.classList.add('hidden');
    doneMsg.classList.add('hidden');
    launchWait.classList.add('hidden');
    launchBtn.classList.remove('hidden');
    const yes   = room.players.filter(p => p.restartVote === true).length;
    launchBtn.textContent = `▶ Lancer (${yes}/${room.players.length} oui)`;
  }
}
