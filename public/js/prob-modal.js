/* prob-modal.js — Modale probabilites des des */

var PROB_DATA = {
  MINOTAURE: {
    name: 'Minotaure', sub: 'Atout — 1 de dans le jeu', icon: 'ic-minotaure',
    outcomes: [
      { label: 'Atout actif',    n: 2, d: 3 },
      { label: 'Inactif (rate)', n: 1, d: 3 }
    ]
  },
  SIRENE: {
    name: 'Sirene', sub: 'Atout — 2 des dans le jeu', icon: 'ic-sirene',
    outcomes: [
      { label: 'Atout actif',    n: 2, d: 3 },
      { label: 'Inactif (rate)', n: 1, d: 3 }
    ]
  },
  GRIFFON: {
    name: 'Griffon', sub: 'Atout — 3 des dans le jeu', icon: 'ic-griffon',
    outcomes: [
      { label: 'Atout actif',    n: 2, d: 3 },
      { label: 'Inactif (rate)', n: 1, d: 3 }
    ]
  },
  ROUGE: {
    name: 'De Rouge', sub: 'Valeurs hautes — 7 des dans le jeu', icon: 'ic-rouge',
    outcomes: [
      { label: 'Valeur 5', n: 1, d: 3 },
      { label: 'Valeur 6', n: 1, d: 3 },
      { label: 'Valeur 7', n: 1, d: 3 }
    ]
  },
  JAUNE: {
    name: 'De Jaune', sub: 'Valeurs moyennes — 7 des dans le jeu', icon: 'ic-jaune',
    outcomes: [
      { label: 'Valeur 3', n: 1, d: 3 },
      { label: 'Valeur 4', n: 1, d: 3 },
      { label: 'Valeur 5', n: 1, d: 3 }
    ]
  },
  VIOLET: {
    name: 'De Violet', sub: 'Valeurs basses — 8 des dans le jeu', icon: 'ic-violet',
    outcomes: [
      { label: 'Valeur 1', n: 1, d: 3 },
      { label: 'Valeur 2', n: 1, d: 3 },
      { label: 'Valeur 3', n: 1, d: 3 }
    ]
  },
  GRIS: {
    name: 'De Gris', sub: 'Aleatoire — 8 des dans le jeu', icon: 'ic-gris',
    outcomes: [
      { label: 'Inactif (rate)',    n: 1, d: 2 },
      { label: 'Valeur 1 (faible)', n: 1, d: 3 },
      { label: 'Valeur 7 (haute)',  n: 1, d: 6 }
    ]
  }
};

var PROB_COLOR = {
  MINOTAURE: 'var(--mino-c)',
  SIRENE:    'var(--sir-c)',
  GRIFFON:   'var(--grif-c)',
  ROUGE:     'var(--rouge-c)',
  JAUNE:     'var(--jaune-c)',
  VIOLET:    'var(--violet-c)',
  GRIS:      'var(--gris-c)'
};

function probPct(n, d) {
  var v = (n / d) * 100;
  return (v % 1 === 0) ? String(Math.round(v)) : v.toFixed(1);
}

function probFrac(n, d) {
  var a = n, b = d, t;
  while (b) { t = b; b = a % b; a = t; }
  return (n / a) + '/' + (d / a);
}

function openProbModal(dieType) {
  var data = PROB_DATA[dieType];
  if (!data) return;

  var color = PROB_COLOR[dieType] || 'var(--gold)';

  var tile = document.getElementById('prob-die-tile');
  if (!tile) return;
  tile.removeAttribute('data-type');
  tile.setAttribute('data-type', dieType);
  tile.innerHTML =
    '<svg style="display:block;width:1.6rem;height:1.6rem;">' +
      '<use href="#' + data.icon + '"/>' +
    '</svg>' +
    '<div class="die-label" style="font-size:.5rem;">' + data.name + '</div>';

  var nameEl = document.getElementById('prob-die-name');
  var subEl  = document.getElementById('prob-die-sub');
  if (nameEl) nameEl.textContent = data.name;
  if (subEl)  subEl.textContent  = data.sub;

  var html = '';
  for (var i = 0; i < data.outcomes.length; i++) {
    var o = data.outcomes[i];
    var barW = Math.round((o.n / o.d) * 100);
    html +=
      '<div class="prob-bar-row">' +
        '<div class="prob-outcome">' + o.label + '</div>' +
        '<div class="prob-bar-bg">' +
          '<div class="prob-bar-fill" style="width:' + barW + '%;background:' + color + ';opacity:.85;"></div>' +
        '</div>' +
        '<div class="prob-pct">' + probPct(o.n, o.d) + ' %</div>' +
        '<div class="prob-fraction">(' + probFrac(o.n, o.d) + ')</div>' +
      '</div>';
  }

  var barsEl = document.getElementById('prob-bars');
  if (barsEl) barsEl.innerHTML = html;

  var modal = document.getElementById('prob-modal');
  if (modal) modal.style.display = 'flex';
}

function closeProbModal() {
  var modal = document.getElementById('prob-modal');
  if (modal) modal.style.display = 'none';
}

function closeProbModalOutside(e) {
  if (e.target === document.getElementById('prob-modal')) {
    closeProbModal();
  }
}

/* Délégation d'événements sur les deck-rows (alternative aux onclick inline) */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.deck-row[data-die]').forEach(function (row) {
    row.addEventListener('click', function (e) {
      e.stopPropagation();
      openProbModal(row.getAttribute('data-die'));
    });
  });
});
