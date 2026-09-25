/* Mise en page PC : sur un grand écran, les jeux conçus pour le téléphone passent sur deux colonnes.
   Le cœur du jeu (plateau, cartes, question) reste à gauche ; les joueurs, les scores et le journal
   passent dans une colonne à droite. Moins de défilement, et l'écran large sert enfin à quelque chose.
   Rien ne change sur téléphone. Chargé en dernier : enveloppe les fonctions d'affichage des jeux. */

'use strict';

const DESK = matchMedia('(min-width: 1100px)');

/** Range les enfants directs de root : ceux qui correspondent à side vont à droite, le reste à gauche. */
function deskSplit(root, side, needs) {
  if (!root || root.querySelector(':scope > .desk-main')) return;      // déjà rangé (écran non reconstruit)
  root.classList.remove('desk-split');
  if (!DESK.matches || (needs && !root.querySelector(needs))) return;
  const kids = [...root.children], right = kids.filter(n => n.matches(side));
  if (!right.length || right.length === kids.length) return;
  const main = el('div', 'desk-main'), aside = el('div', 'desk-side');
  kids.forEach(n => (right.includes(n) ? aside : main).appendChild(n));
  root.append(main, aside);
  root.classList.add('desk-split');
}

[
  ['renderChromo', '#ch-main', '.ch-players, .ch-log'],
  ['renderKems', '#km-main', '.km-score, .km-seats, .km-log'],
  ['renderCamembert', '#cm-main', '.cm-players, .cm-zone, .cm-log', '.cm-board-wrap'],
  ['renderMirage', '#mi-main', '.mi-players, .mi-log'],
  ['renderDouze', '#dz-main', '.dz-players, .dz-log, .dz-scores'],
  ['renderLoupGarou', '#lw-main', '.lw-village, .lw-log'],
  ['renderPetitBac', '#pb-main', '.pb-totals, .pb-scores, .pb-actions, .pb-log, .pb-winner', '.pb-board'],
  ['renderUndercover', '#uc-main', '.uc-roster, .uc-order, .uc-scores, .uc-recap'],
  ['renderNaufrages', '#nf-main', '.nf-camp, .nf-people, .nf-log, .nf-items, .nf-peek'],
  ['renderMemes', '#mm-main', '.mm-players, .mm-log'],
  ['renderHorsLimite', '#hl-main', '.hl-players, .hl-log'],
  ['renderDiapason', '#dp-main', '.dp-scores, .dp-log'],
  ['renderPoker', '#pk-main', '.pk-mine, .pk-actions, .pk-size, .pk-hint, .pk-result, .pk-log, .note, .btn'],
  ['soRender', '#so-main', '.so-race, .so-clock, .so-win, .so-end'],
].forEach(([name, rootSel, side, needs]) => {
  const orig = window[name];
  if (typeof orig !== 'function') return;
  window[name] = function (...args) { const r = orig.apply(this, args); deskSplit($(rootSel), side, needs); return r; };
});

// passer d'une petite à une grande fenêtre (ou l'inverse) réorganise l'écran en cours
DESK.addEventListener('change', () => { if (view) render(); });
