// Solitaire : affichage et commandes. Les règles du jeu sont dans engines/solitaire.js.

'use strict';


// ============================================================ la partie, sur chaque téléphone
const SO_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
const soVal = c => SO_RANKS.indexOf(c.r) + 1, soRed = c => c.s === 'H' || c.s === 'D';
let so = null, soSel = null, soTimer = null, soSent = '';

function soRandom(seed) {                           // mulberry32 : la même graine donne la même donne partout
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function soDeal(seed, draw) {
  const rnd = soRandom(seed), deck = [];
  ['S', 'H', 'D', 'C'].forEach(s => SO_RANKS.forEach(r => deck.push({ r, s, up: false })));
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const tab = [];
  for (let c = 0; c < 7; c++) { tab.push([]); for (let k = 0; k <= c; k++) tab[c].push(deck.pop()); tab[c][c].up = true; }
  return { seed, draw, tab, stock: deck, waste: [], found: [[], [], [], []], moves: 0, undo: [], won: false };
}
const soFoundCount = () => so.found.reduce((n, f) => n + f.length, 0);
const soSnapshot = () => JSON.stringify({ tab: so.tab, stock: so.stock, waste: so.waste, found: so.found, moves: so.moves });
function soPush() { so.undo.push(soSnapshot()); if (so.undo.length > 60) so.undo.shift(); }
function soUndo() { const s = so.undo.pop(); if (!s) return; Object.assign(so, JSON.parse(s)); soSel = null; soChanged(); }

const soCanFound = (c, f) => f.length ? f[f.length - 1].s === c.s && soVal(c) === soVal(f[f.length - 1]) + 1 : soVal(c) === 1;
const soCanTab = (c, col) => col.length ? (col[col.length - 1].up && soRed(col[col.length - 1]) !== soRed(c) && soVal(c) === soVal(col[col.length - 1]) - 1) : soVal(c) === 13;

function soFlip() { so.tab.forEach(col => { if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true; }); }
function soStock() {
  soPush();
  if (!so.stock.length) { so.stock = so.waste.reverse().map(c => ({ ...c, up: false })); so.waste = []; }
  else for (let i = 0; i < so.draw && so.stock.length; i++) { const c = so.stock.pop(); c.up = true; so.waste.push(c); }
  so.moves += 1; soSel = null; soChanged();
}
/** D'où vient la carte touchée : { from: 'waste' | 'found' | 'tab', i, k } ; la pile déplacée = la carte et celles posées dessus. */
function soPile(src) {
  if (src.from === 'waste') return so.waste.length ? [so.waste[so.waste.length - 1]] : [];
  if (src.from === 'found') return so.found[src.i].length ? [so.found[src.i][so.found[src.i].length - 1]] : [];
  return so.tab[src.i].slice(src.k);
}
function soTargets(src) {
  const pile = soPile(src); if (!pile.length || !pile[0].up) return [];
  const t = [];
  if (pile.length === 1 && src.from !== 'found') so.found.forEach((f, i) => { if (soCanFound(pile[0], f)) t.push({ to: 'found', i }); });
  so.tab.forEach((col, i) => { if (!(src.from === 'tab' && src.i === i) && soCanTab(pile[0], col)) t.push({ to: 'tab', i }); });
  return t;
}
function soMove(src, dst) {
  soPush();
  const pile = soPile(src);
  if (src.from === 'waste') so.waste.pop(); else if (src.from === 'found') so.found[src.i].pop(); else so.tab[src.i].splice(src.k);
  (dst.to === 'found' ? so.found[dst.i] : so.tab[dst.i]).push(...pile);
  so.moves += 1; soFlip(); soSel = null; soChanged();
}
function soTap(src) {
  if (soSel) {                                                   // une colonne proposée était allumée
    const pick = soSel.targets.find(t => (src.from === 'tab' && t.to === 'tab' && t.i === src.i) || (src.from === 'found' && t.to === 'found' && t.i === src.i));
    if (pick) { soMove(soSel.src, pick); return; }
    soSel = null;
  }
  const t = soTargets(src);
  if (!t.length) { soSel = null; soRender(); return; }
  const f = t.find(x => x.to === 'found');
  if (f) { soMove(src, f); return; }
  if (t.length === 1) { soMove(src, t[0]); return; }
  soSel = { src, targets: t }; soRender();
}
const soCanAuto = () => !so.stock.length && !so.waste.length && so.tab.every(col => col.every(c => c.up));
function soAutoFinish() {
  let guard = 0;
  const step = () => {
    if (soFoundCount() >= 52 || guard++ > 200) return;
    for (let i = 0; i < 7; i++) { const col = so.tab[i]; if (!col.length) continue; const c = col[col.length - 1], f = so.found.findIndex(x => soCanFound(c, x)); if (f >= 0) { soMove({ from: 'tab', i, k: col.length - 1 }, { to: 'found', i: f }); setTimeout(step, 70); return; } }
  };
  step();
}
function soChanged() {
  const n = soFoundCount();
  if (n >= 52 && !so.won) { so.won = true; toast('Patience réussie !'); }
  const key = n + '|' + so.moves;
  if (key !== soSent) { soSent = key; clearTimeout(soTimer); soTimer = setTimeout(() => act({ t: 'so:progress', found: n, moves: so.moves }), n >= 52 ? 0 : 400); }
  soRender();
}

// ============================================================ l'affichage : tout l'écran est la table
// Tapis bleu canard plein écran, emplacements dessinés finement sur le feutre, cartes vernies.
// En haut : une puce (pioche, chrono) et, à plusieurs, la puce « Course » qui ouvre la progression des autres
// dans la feuille (#tb-sheet) ; sur PC la course est dans la colonne de droite (desk.js range .so-race et .so-end).
// Le meneur dans sa bulle de verre ; en bas, un plateau de verre avec Annuler, Abandonner et le nombre de coups.
const SO_SUITS = ['♠', '♥', '♦', '♣'];
const SO_RANK_WORD = { A: 'As', V: 'Valet', D: 'Dame', R: 'Roi' }, SO_SUIT_WORD = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' };
const SO_ICON = {
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h12l-2.5 4.5L17 13H5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/></svg>',
  recycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v4.5H15"/></svg>',
};
const soId = c => c.r + c.s;
const soName = c => `${SO_RANK_WORD[c.r] || c.r} de ${SO_SUIT_WORD[c.s]}`;

function soCard(c, attrs = '', cls = '') {
  const id = c.r ? ` data-c="${soId(c)}"` : '';
  if (!c.up) return `<div class="so-card back ${cls}"${id} ${attrs}></div>`;
  return `<div class="so-card km-card ${soRed(c) ? 'red' : ''}${/[VDR]/.test(c.r) ? ' fig' : ''} ${cls}"${id} ${attrs} aria-label="${soName(c)}">${kmCardHTML(c)}</div>`;
}
const soFmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function renderSolitaire(v) {
  if (!v) return;
  if (!so || so.seed !== v.seed) { so = soDeal(v.seed, v.draw); soSel = null; soSent = ''; }
  soV = v;
  soRender();
}
let soV = null, soClock = null, soGen = 0, soFlySeed = null;

/** Ce que dit le meneur : [titre, réplique]. Les variantes suivent la graine de la donne : stables pendant toute la partie. */
function soVoice(v, me) {
  const say = list => list[v.seed % list.length];
  const solo = v.players.length === 1, lead = v.players[0], n = me?.found ?? soFoundCount();
  const cartes = k => `${k} carte${k > 1 ? 's' : ''}`;
  if (v.phase === 'over') {
    if (solo) {
      if (lead?.done) return ['Patience réussie.', `En ${soFmt(lead.time)} et ${lead.moves} coups. ${say(['Propre.', 'Les cartes n’ont rien pu faire.', 'Joli travail.'])}`];
      if (lead?.gaveUp) return ['Partie abandonnée.', `${cartes(lead.found)} montées sur 52. ${say(['La prochaine sera la bonne.', 'Les cartes gagnent cette fois.'])}`];
      if (v.minutes && !v.left) return ['Temps écoulé.', `${cartes(lead?.found || 0)} montées sur 52. ${say(['La prochaine sera la bonne.', 'Le chrono gagne cette fois.'])}`];
      return ['Partie arrêtée.', `${cartes(lead?.found || 0)} montées sur 52. ${say(['La prochaine sera la bonne.', 'Tu reprends quand tu veux.'])}`];
    }
    const who = lead?.me ? 'Tu gagnes.' : `${esc(tbSplit(lead)[1])} gagne.`;
    return [who, lead?.done ? `Patience terminée en ${soFmt(lead.time)}. ${say(['Chapeau.', 'Les autres peuvent ranger leurs cartes.'])}`
      : `${cartes(lead?.found || 0)} montées, personne n’a fini. ${say(['Ça suffit pour gagner.', 'Victoire aux points.'])}`];
  }
  if (so.won) return ['Patience réussie.', `${so.moves} coups.${solo ? ' Joli travail.' : ' Les autres rament encore.'}`];
  if (me?.gaveUp) return ['Tu as abandonné.', 'Tes cartes montées comptent quand même. Regarde les autres suer.'];
  const pick = soSel ? 'Plusieurs places possibles. Choisis la tienne.' : null;
  if (solo) return [n ? `${cartes(n)} montée${n > 1 ? 's' : ''}.` : 'La donne est servie.',
    pick || (v.minutes ? say(['Le chrono tourne. Pas le temps de rêvasser.', 'Chaque seconde compte, chaque as aussi.']) : say(['Personne ne regarde. Annuler est ton ami.', 'Prends ton temps, rien ne presse.', 'Une patience, ça se mérite.']))];
  if (!lead || !lead.found) return ['Même donne pour tous.', pick || say(['Pas d’excuse, tout le monde a les mêmes cartes.', 'Que le plus patient gagne.', 'Tout le monde part de zéro. Ça ne va pas durer.'])];
  if (lead.me) return ['Tu mènes.', pick || say(['Ne te retourne pas.', 'Garde le rythme.', 'Les autres surveillent ta barre.'])];
  if (lead.found === n) return ['Égalité en tête.', pick || say(['Ça se joue à une carte.', 'Personne ne lâche rien.'])];
  return [`${esc(tbSplit(lead)[1])} mène.`, pick || `${cartes(lead.found - n)} d’avance sur toi. ${say(['Accélère.', 'Rien n’est joué.', 'Respire, et remonte.'])}`];
}
/** La pastille du meneur, qui suit la même situation que sa phrase ; quand un autre mène ou gagne, c'est son emoji. */
function soPip(v, me) {
  const solo = v.players.length === 1, lead = v.players[0], n = me?.found ?? soFoundCount();
  if (v.phase === 'over') return solo ? (lead?.done ? '🏆' : lead?.gaveUp ? '🏳️' : '⏱️') : lead?.me ? '🏆' : tbSplit(lead)[0];
  if (so.won) return '🎉';
  if (me?.gaveUp) return '🏳️';
  if (soSel) return '👆';
  if (solo || !lead?.found) return '♥️';
  return lead.me ? '🥇' : lead.found === n ? '🤝' : tbSplit(lead)[0];
}

/** La course : une ligne par joueur, sa barre de progression vers les 52 cartes. */
function soRaceList(v) {
  return `<ul class="sox-race">${v.players.map((p, i) => {
    const [e, nm] = tbSplit(p), pct = (p.found / 52 * 100).toFixed(1);
    const ct = p.done ? `fini en ${soFmt(p.time)}` : p.gaveUp ? `abandon · ${p.found} sur 52` : `${p.found} sur 52`;
    return `<li class="${p.me ? 'me' : ''}${p.done ? ' done' : ''}${p.gaveUp ? ' quit' : ''}${p.online ? '' : ' off'}"><span class="sox-rk">${i + 1}</span><span class="tb-e">${e}</span>`
      + `<span class="sox-nm">${esc(nm)}${p.me ? ' <small>toi</small>' : ''}</span><span class="sox-ct">${ct}</span><span class="sox-bar"><i style="width:${pct}%"></i></span></li>`;
  }).join('')}</ul>`;
}
function soRaceSheet() {
  const v = soV; if (!v) return '';
  const lim = v.minutes ? `, sinon le plus avancé au bout de ${v.minutes} minutes` : '';
  return `<p class="tb-sheet-say">Même donne pour tous. Le premier qui monte ses 52 cartes gagne${lim}.</p>${soRaceList(v)}`
    + (v.isHost && v.phase === 'play' ? '<button class="btn tb-btn glass sox-stop" type="button" data-so-stop>Arrêter la course et classer</button>' : '');
}
function soAskStop() {
  const solo = soV?.players.length === 1;
  askConfirm(solo ? 'Arrêter la partie' : 'Arrêter la course', solo ? 'Tu t’arrêtes sur les cartes montées à cet instant.' : 'Le classement se fait sur les cartes montées à cet instant.', 'Arrêter', () => act({ t: 'so:end' }));
}
$('#tb-sheet-body').addEventListener('click', e => {
  if (tbSheet.kind !== 'so-race' || !e.target.closest('[data-so-stop]')) return;
  tbSheet.close(); soAskStop();
});

function soRender() {
  const v = soV; if (!v) return;
  if (soDrag?.on) { soDirty = true; return; }                  // pas de reconstruction pendant qu'une carte est tenue
  const root = $('#so-main');
  const before = soRects(root);                                  // où étaient les cartes, pour les faire glisser à leur nouvelle place
  root.innerHTML = ''; clearInterval(soClock);
  const gen = ++soGen;
  const me = v.players.find(p => p.me), solo = v.players.length === 1, play = v.phase === 'play', over = v.phase === 'over';
  const n = soFoundCount();

  // la ligne du haut : la pioche et le chrono qui tourne ; à plusieurs, la puce de la course (téléphone)
  const chips = [];
  if (!solo && play) {
    const rank = v.players.findIndex(p => p.me) + 1;
    chips.push(tbChip(`${TB_ICON.people}Course${rank ? ` · <b>${rank === 1 ? '1er' : rank + 'e'}</b>` : ''}`, () => tbSheet.open('so-race', 'La course', soRaceSheet), 'La course'));
  }
  const bar = tbBar(`Pioche ${v.draw === 3 ? '3' : '1'} · <span class="sox-clock">${SO_ICON.clock}<span></span></span>`, chips);
  root.appendChild(bar);
  const chip = bar.firstElementChild, clock = chip.querySelector('.sox-clock > span');
  const paint = () => {
    const t0 = Date.now() - (soV._at || Date.now());
    if (!play) { clock.textContent = 'partie terminée'; return; }
    if (v.left !== null) { const left = v.left - t0; clock.innerHTML = `il reste <b>${soFmt(left)}</b>`; chip.classList.toggle('sox-hurry', left < 60000); }
    else clock.innerHTML = `<b>${soFmt(v.elapsed + t0)}</b>`;
  };
  soV._at = soV._at || Date.now(); paint(); soClock = setInterval(paint, 1000);

  // le meneur
  const [title, line] = soVoice(v, me);
  const status = tbSay({ title, line, pip: soPip(v, me), hot: play ? !!(so.won || soSel) : !!me && v.players[0]?.me });
  status.classList.add('so-status');
  if (!solo && play && (so.won || me?.gaveUp)) {
    const on = v.players.filter(p => p.online), done = on.filter(p => p.done || p.gaveUp).length;
    status.lastElementChild.appendChild(el('div', 'mj-prog', `${on.map((p, i) => `<i${i < done ? ' class="f"' : ''}></i>`).join('')}<span>${done} sur ${on.length}</span>`));
  }
  root.appendChild(status);

  // la fin : le classement dans un panneau de verre, la suite pour l'hôte
  if (over) {
    const box = el('section', 'sox-over');
    box.appendChild(el('h4', 'sox-over-title', solo ? 'Ta partie' : 'Classement'));
    box.insertAdjacentHTML('beforeend', soRaceList(v));
    if (v.isHost) {
      const row = el('div', 'tb-acts');
      row.append(tbBtn('hero', 'Nouvelle donne', () => act({ t: 'so:again' })), tbBtn('glass', 'Retour au salon', () => act({ t: 'restart' })));
      box.appendChild(row);
    } else box.appendChild(el('p', 'sox-note', 'L’hôte choisit la suite.'));
    root.appendChild(box);
  }

  if (play || over) {
    // la table ; à la fin, figée (et toute dorée si la patience est réussie)
    const board = el('div', 'so-board' + (over ? (so.won ? ' won' : ' frozen') : ''));
    const top = el('div', 'so-top');
    // pioche et défausse
    const deep = so.stock.length > 1 ? (so.stock.length > 8 ? ' deep deeper' : ' deep') : '';
    const stock = el('button', 'so-slot so-stock' + deep + (so.stock.length ? '' : ' empty') + (!so.stock.length && !so.waste.length ? ' spent' : ''),
      so.stock.length ? soCard({ up: false }) + `<span class="so-left">${so.stock.length}</span>` : `<span class="so-recycle">${SO_ICON.recycle}</span>`);
    stock.type = 'button'; stock.dataset.n = so.stock.length;
    stock.setAttribute('aria-label', so.stock.length ? `Pioche, ${so.stock.length} cartes` : 'Recycler la défausse');
    stock.onclick = () => { if (v.phase === 'play') soStock(); };
    const waste = el('div', 'so-slot so-waste');
    const shown = so.waste.slice(-Math.min(so.draw, 3));
    shown.forEach((c, k) => { const last = k === shown.length - 1; waste.insertAdjacentHTML('beforeend', soCard(c, last ? 'data-src="waste"' : '', 'fan' + k + (last && soSel?.src.from === 'waste' ? ' sel' : ''))); });
    top.append(stock, waste, el('div', 'so-gap'));
    so.found.forEach((f, i) => {
      const hot = soSel?.targets.some(t => t.to === 'found' && t.i === i);
      const slot = el('div', 'so-slot so-found' + (hot ? ' hot' : '') + (f.length === 13 ? ' full' : '') + (i === 1 || i === 2 ? ' red' : ''),
        f.length ? soCard(f[f.length - 1], `data-src="found" data-i="${i}"`) : `<span class="so-suit"><i>${SO_SUITS[i]}</i></span>`);
      slot.dataset.drop = 'found'; slot.dataset.i = i;
      top.appendChild(slot);
    });
    board.appendChild(top);
    const tab = el('div', 'so-tab');
    so.tab.forEach((col, i) => {
      const hot = soSel?.targets.some(t => t.to === 'tab' && t.i === i);
      const c = el('div', 'so-col' + (hot ? ' hot' : ''));
      c.dataset.drop = 'tab'; c.dataset.i = i;
      if (!col.length) c.innerHTML = '<span class="so-empty"><i>R</i></span>';
      col.forEach((card, k) => c.insertAdjacentHTML('beforeend', soCard(card, card.up ? `data-src="tab" data-i="${i}" data-k="${k}"` : '', (soSel?.src.from === 'tab' && soSel.src.i === i && k >= soSel.src.k ? 'sel' : '') + (card.up ? '' : ' down'))));
      tab.appendChild(c);
    });
    board.appendChild(tab);
    board.onclick = e => {
      if (soSwallow) { soSwallow = false; return; }              // fin d'un glisser : ce n'est pas un toucher
      if (v.phase !== 'play') return;
      const card = e.target.closest('[data-src]'), drop = e.target.closest('[data-drop]');
      if (card) { const src = { from: card.dataset.src, i: +card.dataset.i, k: +card.dataset.k }; soTap(src); return; }
      if (drop && soSel) { soTap({ from: drop.dataset.drop, i: +drop.dataset.i }); return; }
      if (soSel) { soSel = null; soRender(); }
    };
    board.onpointerdown = e => { if (v.phase === 'play') soDragStart(e); };
    root.appendChild(board);
  }

  if (play) {
    // le plateau de verre : annuler, finir tout seul quand tout est découvert, abandonner
    const u = tbBtn('glass', `${SO_ICON.undo}Annuler`, soUndo); u.disabled = !so.undo.length; u.setAttribute('aria-label', 'Annuler le coup');
    const acts = [u];
    if (soCanAuto() && !so.won) acts.push(tbBtn('hero pulse', 'Finir la patience', soAutoFinish));
    if (!me?.done && !me?.gaveUp) acts.push(tbBtn('glass sox-quit', `${SO_ICON.flag}Abandonner`, () => askConfirm('Abandonner', 'Tes cartes montées comptent pour le classement, mais tu ne joues plus.', 'Abandonner', () => act({ t: 'so:giveup' }))));
    const tray = tbTray({ left: `<b>${so.moves}</b> coup${so.moves > 1 ? 's' : ''}`, right: `Montées · <b>${n}</b> sur 52`, acts });
    tray.classList.add('sox-tray');
    root.appendChild(tray);

    // la course (colonne de droite sur PC ; sur téléphone, la puce « Course » l'ouvre dans la feuille)
    const race = el('div', 'so-race');
    race.appendChild(el('span', 'mj-side-title', solo ? 'Ta partie' : 'La course'));
    race.insertAdjacentHTML('beforeend', soRaceList(v));
    root.appendChild(race);
    if (v.isHost) root.appendChild(tbBtn('glass so-end', solo ? 'Arrêter la partie' : 'Arrêter la course et classer', soAskStop));
  }

  // la feuille ouverte suit la course ; hors partie elle n'a plus lieu d'être
  if (tbSheet.kind === 'so-race') tbSheet.refresh(play);
  queueMicrotask(() => soLayout(root, gen, before));            // après le rangement en colonnes de desk.js
}

// les colonnes se resserrent si elles ne tiennent pas au-dessus du plateau ; puis les cartes déplacées glissent
function soLayout(root, gen, before) {
  if (gen !== soGen) return;
  const tab = root.querySelector('.so-tab');
  if (tab) {
    // les mesures de la page sont à l'échelle de l'écran (zoom des écrans de jeu sur PC) : on les ramène en px CSS
    const tray = root.querySelector('.tb-tray'), tr = tab.getBoundingClientRect(), z = tr.width / tab.offsetWidth || 1;
    const room = (innerHeight - (tr.top + scrollY) - (tray ? tray.getBoundingClientRect().height : 0)) / z - 16;
    tab.querySelectorAll('.so-col').forEach(col => {
      const cards = [...col.children].filter(x => x.classList.contains('so-card'));
      col.style.removeProperty('--sox-up'); col.style.removeProperty('--sox-dn');
      if (cards.length < 2) return;
      const w = col.clientWidth, h = w * 1.4, down = cards.filter(x => x.classList.contains('down')).length, up = cards.length - down;
      let u = Math.min(w * 0.5, 34), dn = w * 0.2;
      const need = () => h + down * dn + Math.max(0, up - 1) * u, lim = Math.max(room, h * 2.6);
      if (need() <= lim) return;
      if (up > 1) u = Math.max(w * 0.36, Math.min(u, (lim - h - down * dn) / (up - 1)));
      if (need() > lim && down) dn = Math.max(w * 0.1, (lim - h - Math.max(0, up - 1) * u) / down);
      col.style.setProperty('--sox-up', u.toFixed(1) + 'px'); col.style.setProperty('--sox-dn', dn.toFixed(1) + 'px');
    });
  }
  soFly(root, before);
}
/** Les positions des cartes affichées (et le nombre de cartes dans la pioche), avant de reconstruire. */
function soRects(root) {
  if (!so || soFlySeed !== so.seed) { soFlySeed = so?.seed ?? null; return null; }   // nouvelle donne : rien ne glisse
  const m = new Map();
  root.querySelectorAll('[data-c]').forEach(x => m.set(x.dataset.c, { r: x.getBoundingClientRect(), up: !x.classList.contains('back') }));
  const st = root.querySelector('.so-stock');
  if (st) m.set('#stock', { r: st.getBoundingClientRect(), n: +st.dataset.n });
  return m;
}
/** Chaque carte qui a changé de place part de l'ancienne et glisse jusqu'à la nouvelle ; une carte découverte se retourne. */
function soFly(root, before) {
  if (!before || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const st = before.get('#stock'), drawn = st && so.stock.length < st.n;
  root.querySelectorAll('[data-c]').forEach(x => {
    let p = before.get(x.dataset.c), fromStock = false;
    if (!p && drawn && x.closest('.so-waste')) { p = st; fromStock = true; }
    if (!p) return;
    const r = x.getBoundingClientRect(), z = r.width / x.offsetWidth || 1, dx = (p.r.left - r.left) / z, dy = (p.r.top - r.top) / z;
    const flip = (fromStock || p.up === false) && !x.classList.contains('back'), moved = Math.abs(dx) + Math.abs(dy) > 2;
    if (!moved && !flip) return;
    const from = { translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px` }, to = { translate: '0 0' };
    if (flip) { from.scale = moved ? '0.2 1' : '0 1'; to.scale = '1 1'; }
    x.style.zIndex = 30;
    const a = x.animate([from, to], { duration: moved ? 300 : 220, easing: 'cubic-bezier(.2, .85, .25, 1)' });
    a.onfinish = a.oncancel = () => { x.style.zIndex = ''; };
  });
}

// ============================================================ glisser-déposer
// On peut aussi prendre une carte (ou une suite de la colonne) et la lâcher où l'on veut. Un petit
// déplacement reste un toucher ; au-delà de 8 px, la pile suit le doigt et la cible s'allume si le coup est permis.
let soDrag = null, soDirty = false, soSwallow = false;
function soDragStart(e) {
  soSwallow = false;                                          // un nouvel appui : le clic d'un glisser précédent est passé
  if (e.button > 0) return;
  const card = e.target.closest('[data-src]'); if (!card) return;
  const src = { from: card.dataset.src, i: +card.dataset.i, k: +card.dataset.k };
  const pile = soPile(src); if (!pile.length || !pile[0].up) return;
  const els = src.from === 'tab' ? [...card.parentElement.querySelectorAll('[data-src]')].filter(n => +n.dataset.k >= src.k) : [card];
  const z = card.getBoundingClientRect().width / card.offsetWidth || 1;   // zoom des écrans de jeu sur PC : la carte suit le pointeur au pixel près
  soDrag = { src, els, x0: e.clientX, y0: e.clientY, on: false, id: e.pointerId, over: null, z };
}
function soDropAt(x, y) {
  const drop = document.elementFromPoint(x, y)?.closest('#so-main [data-drop]');
  if (!drop) return null;
  const to = drop.dataset.drop, i = +drop.dataset.i;
  const ok = soTargets(soDrag.src).find(t => t.to === to && t.i === i);
  return ok ? { el: drop, t: ok } : null;
}
function soDragEnd(cancel) {
  const d = soDrag; soDrag = null;
  if (!d) return;
  soSwallow = true;                                            // le clic éventuel qui suit est déjà traité ici
  if (!d.on) { if (!cancel) soTap(d.src); return; }            // simple toucher : on n'attend pas le clic (pas toujours émis au doigt)
  if (!cancel && d.over) { soMove(d.src, d.over.t); soDirty = false; return; }
  soDirty = false; soRender();                                    // lâchée ailleurs : la pile revient à sa place
}
document.addEventListener('pointermove', e => {
  const d = soDrag; if (!d || e.pointerId !== d.id) return;
  const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
  if (!d.on) {
    if (Math.hypot(dx, dy) < 8) return;
    d.on = true; soSel = null;
    document.querySelectorAll('#so-main .hot, #so-main .sel').forEach(n => n.classList.remove('hot', 'sel'));
    d.els.forEach(n => n.classList.add('dragging'));
  }
  e.preventDefault();
  d.els.forEach(n => { n.style.transform = `translate(${dx / d.z}px, ${dy / d.z}px)`; });
  const over = soDropAt(e.clientX, e.clientY);
  if (d.over?.el !== over?.el) { d.over?.el.classList.remove('hot'); over?.el.classList.add('hot'); }
  d.over = over;
}, { passive: false });
document.addEventListener('pointerup', e => { if (soDrag && e.pointerId === soDrag.id) soDragEnd(false); });
document.addEventListener('pointercancel', e => { if (soDrag && e.pointerId === soDrag.id) soDragEnd(true); });
