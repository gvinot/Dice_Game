'use strict';

const { DieType } = require('./DieType');

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

    default:
      return { active: false };
  }
}

function buildDeck() {
  const deck = [];
  const add  = (type, count) => {
    for (let i = 0; i < count; i++) deck.push(type);
  };
  add(DieType.MINOTAURE, 1);
  add(DieType.SIRENE,    2);
  add(DieType.GRIFFON,   3);
  add(DieType.ROUGE,     7);
  add(DieType.JAUNE,     7);
  add(DieType.VIOLET,    8);
  add(DieType.GRIS,      8);
  return deck; // 36 dés
}

module.exports = { rollDie, buildDeck };
