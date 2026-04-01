'use strict';

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

module.exports = { DieType, TRUMP_TYPES, NORMAL_TYPES };
