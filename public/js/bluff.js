let bluffCountdownTimer = null;

// ── Afficher l'overlay d'accusation ─────────────────────
function showBluffOverlay(bs) {
  const overlay     = document.getElementById('bluff-overlay');
  const accusePhase = document.getElementById('bluff-accusation-phase');
  const revealPhase = document.getElementById('bluff-reveal-phase');
  const countdownEl = document.getElementById('bluff-countdown');

  document.getElementById('bluff-btn').classList.add('hidden');

  document.getElementById('bluff-accuser-text').textContent =
    `🎭 ${bs.callerName} accuse…`;

  const el = document.getElementById('bluff-accused-text');
  const cfg = DIE_CFG[bs.leadType] || {};

  const iconId1 = `ic-${bs.leadType.toLowerCase()}`;
  el.innerHTML  =
    `<span>${bs.accusedName} d'avoir bluffé sur </span>` +
    `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">` +
      `<svg style="display:inline-block;width:1.1em;height:1.1em;vertical-align:-.15em;fill:currentColor;" xmlns="http://www.w3.org/2000/svg"><use href="#${iconId1}"/></svg>` +
      `<span>${cfg.label ?? bs.leadType}</span>` +
    `</span>`;

  const dieEl        = document.getElementById('bluff-accused-die');
  dieEl.dataset.type = bs.accusedDie;
  const accusedCfg   = DIE_CFG[bs.accusedDie] ?? {};
  dieEl.innerHTML    = (accusedCfg.emoji ?? '') +
    `<div class="die-label">${accusedCfg.label ?? bs.accusedDie}</div>`;

  accusePhase.style.display = 'block';
  revealPhase.style.display = 'none';
  overlay.style.display     = 'flex';

  if (bluffCountdownTimer) clearInterval(bluffCountdownTimer);
  let count           = 3;
  countdownEl.textContent = count;

  bluffCountdownTimer = setInterval(() => {
    count--;
    if (count > 0) {
      countdownEl.textContent = count;
    } else {
      clearInterval(bluffCountdownTimer);
      revealBluff(bs, accusePhase, revealPhase);
    }
  }, 1000);
}

// ── Révélation du verdict ────────────────────────────────
function revealBluff(bs, accusePhase, revealPhase) {
  accusePhase.style.display = 'none';
  revealPhase.style.display = 'block';

  const icon    = document.getElementById('bluff-verdict-icon');
  const title   = document.getElementById('bluff-verdict-title');
  const detail  = document.getElementById('bluff-verdict-detail');
  const deltas  = document.getElementById('bluff-deltas');
  const contBtn = document.getElementById('bluff-continue-btn');
  const waitMsg = document.getElementById('bluff-wait-msg');

  if (bs.isBluff) {
    icon.textContent   = '💥';
    title.textContent  = 'BLUFF CONFIRMÉ !';
    title.style.color  = '#e8704a';
    detail.textContent = `${bs.accusedName} avait bien la couleur. Il doit rejouer.`;
  } else {
    icon.textContent   = '❌';
    title.textContent  = 'PAS UN BLUFF !';
    title.style.color  = '#4e9e6e';
    detail.textContent = `${bs.accusedName} n'avait pas la couleur. ${bs.callerName} perd des points.`;
  }

  const rows = bs.isBluff
    ? [
        { name: bs.callerName,  delta: bs.callerDelta,  icon: '🎯' },
        { name: bs.accusedName, delta: bs.accusedDelta, icon: '😅' },
      ]
    : [{ name: bs.callerName, delta: bs.callerDelta, icon: '😬' }];

  deltas.innerHTML = rows.map(r => `
    <div style="display:flex; justify-content:space-between; align-items:center;
                background:var(--surface); border-radius:8px; padding:8px 14px;">
      <span>${r.icon} ${r.name}</span>
      <span style="font-family:'Cinzel',serif; font-weight:700;
                   color:${r.delta > 0 ? '#6dd99a' : '#ff9090'};">
        ${r.delta > 0 ? '+' : ''}${r.delta} pts bluff
      </span>
    </div>`).join('');

  if (S.isHost) {
    contBtn.classList.remove('hidden');
    waitMsg.classList.add('hidden');
  } else {
    contBtn.classList.add('hidden');
    waitMsg.classList.remove('hidden');
  }
}
