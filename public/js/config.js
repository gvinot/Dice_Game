// ── Configuration des dés ────────────────────────────────
const DIE_CFG = {
  MINOTAURE : { emoji: '<svg class="die-icon"><use href="#ic-minotaure"/></svg>', label: 'Minotaure', values: 'Atout' },
  SIRENE    : { emoji: '<svg class="die-icon"><use href="#ic-sirene"/></svg>', label: 'Sirène',    values: 'Atout' },
  GRIFFON   : { emoji: '<svg class="die-icon"><use href="#ic-griffon"/></svg>', label: 'Griffon',   values: 'Atout' },
  ROUGE     : { emoji: '<svg class="die-icon"><use href="#ic-rouge"/></svg>', label: 'Rouge',     values: '5·6·7' },
  JAUNE     : { emoji: '<svg class="die-icon"><use href="#ic-jaune"/></svg>', label: 'Jaune',     values: '3·4·5' },
  VIOLET    : { emoji: '<svg class="die-icon"><use href="#ic-violet"/></svg>', label: 'Violet',    values: '1·2·3' },
  GRIS      : { emoji: '<svg class="die-icon"><use href="#ic-gris"/></svg>', label: 'Gris',      values: '0·1·7' },
};

const TRUMP_TYPES  = new Set(['MINOTAURE', 'SIRENE', 'GRIFFON']);
const NORMAL_TYPES = new Set(['ROUGE', 'JAUNE', 'VIOLET', 'GRIS']);

const IN_GAME_PHASES = new Set(['betting', 'playing', 'trick-result', 'round-score']);

// ── État global partagé ──────────────────────────────────
const S = {
  myId        : null,
  myName      : '',
  roomCode    : '',
  myHand      : [],
  isHost      : false,
  room        : null,
  myBetPlaced : false,
  isMyTurn    : false,
};

// ── Validation de couleur (miroir serveur) ───────────────
function getValidIndices(hand, trick) {
  if (!trick || trick.length === 0) return hand.map((_, i) => i);
  const leadType = trick[0].dieType;
  if (!NORMAL_TYPES.has(leadType)) return hand.map((_, i) => i);

  const canFollow = hand.some(t => t === leadType);
  if (!canFollow) return hand.map((_, i) => i);

  return hand.reduce((acc, t, i) => {
    if (t === leadType || TRUMP_TYPES.has(t)) acc.push(i);
    return acc;
  }, []);
}
