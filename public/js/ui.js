// ── Génération HTML d'une tuile de dé ───────────────────
function dieTile(type, index, clickable, valid = true) {
  const cfg        = DIE_CFG[type] || {};
  const isDisabled = clickable && !valid;
  const cl  = 'die-tile'
    + (clickable && valid ? ' clickable' : '')
    + (isDisabled ? ' disabled' : '');
  const oc  = (clickable && valid) ? `onclick="playDie(${index})"` : '';
  return `<div class="${cl}" data-type="${type}" ${oc}>
    <div class="die-emoji">${cfg.emoji}</div>
    <div class="die-label">${cfg.label}</div>
    <div class="die-values">${cfg.values}</div>
  </div>`;
}

// ── Résultat de lancer ───────────────────────────────────
function rollResultHTML(roll) {
  if (!roll.active)   return `<div class="roll-result inactive"> Inactif</div>`;
  if (roll.trumpType) return `<div class="roll-result trump"> Atout</div>`;
  return `<div class="roll-result value">${roll.value}</div>`;
}

// ── Navigation entre écrans ──────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  el.classList.add('active');
  el.scrollTop = 0;
}

// ── Toast notifications ───────────────────────────────────
function showToast(msg, type = 'info') {
  const el       = document.createElement('div');
  el.className   = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Bouton règles flottant ────────────────────────────────
function updateRulesFab(phase) {
  const fab = document.getElementById('rules-fab');
  fab.style.display = IN_GAME_PHASES.has(phase) ? 'flex' : 'none';
}

function openRules() {
  document.getElementById('rules-modal').style.display = 'flex';
}

function closeRules() {
  document.getElementById('rules-modal').style.display = 'none';
}

function closeRulesIfOutside(e) {
  if (e.target === document.getElementById('rules-modal')) closeRules();
}
