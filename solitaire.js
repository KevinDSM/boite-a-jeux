/* Solitaire — la patience classique (Klondike), en course : tout le monde reçoit exactement la même donne
   et joue sur son téléphone. On voit en direct combien de cartes chacun a monté sur les fondations.
   Le premier qui termine gagne ; au bout du temps, le classement se fait au nombre de cartes montées.

   L'hôte ne fait que tirer la donne (une graine), tenir le chrono et classer : la partie de chacun se
   joue sur son propre téléphone et n'envoie que sa progression (« so:progress »).
   Toucher une carte la déplace au meilleur endroit (fondation d'abord) ; s'il y a plusieurs colonnes
   possibles, elles s'allument et on touche celle qu'on veut. Annuler et fin automatique inclus.
   Chargé après app.js et kems.js : réutilise $, el, act, esc, toast, net, view et kmCardHTML. */

'use strict';

const Solitaire = (() => {
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const pl = (room, id) => room.players.find(p => p.id === id);

  function create({ hostId, players, draw, minutes }) {
    const room = {
      hostId, phase: 'play', seed: (Math.random() * 2 ** 31) >>> 0, draw: draw === 3 ? 3 : 1, minutes: clamp(minutes, 0, 60, 10),
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, found: 0, moves: 0, done: false, time: null, gaveUp: false })),
      start: Date.now(), endsAt: 0, seq: 0,
    };
    if (room.minutes) room.endsAt = room.start + room.minutes * 60000;
    return room;
  }
  function progress(room, pid, m) {
    const p = pl(room, pid); if (!p || room.phase !== 'play' || p.done) return 'silent';
    p.found = clamp(m.found, 0, 52, p.found); p.moves = clamp(m.moves, 0, 99999, p.moves);
    if (p.found >= 52) { p.done = true; p.time = Date.now() - room.start; }
    room.seq += 1;
    if (room.players.filter(q => q.online).every(q => q.done || q.gaveUp)) room.phase = 'over';
    return null;
  }
  function ranking(room) {
    return [...room.players].sort((a, b) => (b.done - a.done) || (a.done ? a.time - b.time : 0) || (b.found - a.found) || (a.moves - b.moves));
  }
  function act(room, pid, m) {
    switch (m.t) {
      case 'so:progress': return progress(room, pid, m);
      case 'so:giveup': { const p = pl(room, pid); if (p && room.phase === 'play') { p.gaveUp = true; room.seq += 1; if (room.players.filter(q => q.online).every(q => q.done || q.gaveUp)) room.phase = 'over'; } return null; }
      case 'so:end': if (pid === room.hostId && room.phase === 'play') { room.phase = 'over'; room.seq += 1; } return null;
      case 'so:again': if (pid === room.hostId && room.phase === 'over') { const r = create({ hostId: room.hostId, players: room.players, draw: room.draw, minutes: room.minutes }); Object.assign(room, r); } return null;
    }
    return null;
  }
  function tick(room) {
    if (room.phase === 'play' && room.endsAt && Date.now() >= room.endsAt) { room.phase = 'over'; room.seq += 1; return true; }
    return false;
  }
  function join(room, id, name) { const p = pl(room, id); if (p) { p.online = true; p.name = name || p.name; return; } room.players.push({ id, name, online: true, found: 0, moves: 0, done: false, time: null, gaveUp: false }); }
  function setOnline(room, id, on) { const p = pl(room, id); if (p) p.online = on; }
  function view(room, pid) {
    return {
      phase: room.phase, seed: room.seed, draw: room.draw, minutes: room.minutes, isHost: pid === room.hostId, seq: room.seq,
      left: room.endsAt ? Math.max(0, room.endsAt - Date.now()) : null, elapsed: Date.now() - room.start,
      players: ranking(room).map(p => ({ id: p.id, name: p.name, found: p.found, moves: p.moves, done: p.done, time: p.time, gaveUp: p.gaveUp, online: p.online, me: p.id === pid })),
    };
  }
  return { create, act, tick, join, setOnline, view, ranking };
})();

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
  if (n >= 52 && !so.won) { so.won = true; toast('Bravo, patience réussie !'); }
  const key = n + '|' + so.moves;
  if (key !== soSent) { soSent = key; clearTimeout(soTimer); soTimer = setTimeout(() => act({ t: 'so:progress', found: n, moves: so.moves }), n >= 52 ? 0 : 400); }
  soRender();
}

function soCard(c, attrs = '', cls = '') {
  if (!c.up) return `<div class="so-card back ${cls}" ${attrs}></div>`;
  return `<div class="so-card km-card ${soRed(c) ? 'red' : ''} ${cls}" ${attrs}>${kmCardHTML(c)}</div>`;
}
const soFmt = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function renderSolitaire(v) {
  if (!v) return;
  if (!so || so.seed !== v.seed) { so = soDeal(v.seed, v.draw); soSel = null; soSent = ''; }
  soV = v;
  soRender();
}
let soV = null, soClock = null;
function soRender() {
  const v = soV; if (!v) return;
  if (soDrag?.on) { soDirty = true; return; }                  // pas de reconstruction pendant qu'une carte est tenue
  const root = $('#so-main'); root.innerHTML = ''; clearInterval(soClock);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.players.find(p => p.me);

  // la course
  const race = el('div', 'so-race');
  v.players.forEach((p, i) => race.appendChild(el('div', 'so-runner' + (p.me ? ' me' : '') + (p.done ? ' done' : '') + (p.online ? '' : ' off'),
    `<span class="so-rank">${i + 1}</span><span class="so-name">${esc(p.name)}</span><span class="so-bar"><i style="width:${(p.found / 52 * 100).toFixed(1)}%"></i></span><span class="so-count">${p.done ? '✓ ' + soFmt(p.time) : p.gaveUp ? 'abandon' : p.found + '/52'}</span>`)));
  root.appendChild(race);
  const clock = el('p', 'so-clock'); root.appendChild(clock);
  const paint = () => { const t0 = Date.now() - (soV._at || Date.now()); clock.textContent = v.phase === 'over' ? 'Partie terminée' : v.left !== null ? `Temps restant ${soFmt(v.left - t0)}` : `Temps ${soFmt(v.elapsed + t0)}`; };
  soV._at = soV._at || Date.now(); paint(); soClock = setInterval(paint, 1000);

  if (v.phase === 'play' || (v.phase === 'over' && !so.won)) {
    const board = el('div', 'so-board' + (v.phase === 'over' ? ' frozen' : ''));
    const top = el('div', 'so-top');
    // pioche et talon
    const stock = el('button', 'so-slot so-stock', so.stock.length ? soCard({ up: false }) + `<span class="so-left">${so.stock.length}</span>` : '<span class="so-recycle">↻</span>'); stock.type = 'button';
    stock.onclick = () => { if (v.phase === 'play') soStock(); };
    const waste = el('div', 'so-slot so-waste');
    const shown = so.waste.slice(-Math.min(so.draw, 3));
    shown.forEach((c, k) => { const last = k === shown.length - 1; waste.insertAdjacentHTML('beforeend', soCard(c, last ? 'data-src="waste"' : '', 'fan' + k + (last && soSel?.src.from === 'waste' ? ' sel' : ''))); });
    top.append(stock, waste, el('div', 'so-gap'));
    so.found.forEach((f, i) => {
      const hot = soSel?.targets.some(t => t.to === 'found' && t.i === i);
      const slot = el('div', 'so-slot so-found' + (hot ? ' hot' : ''), f.length ? soCard(f[f.length - 1], `data-src="found" data-i="${i}"`) : `<span class="so-suit">${['♠', '♥', '♦', '♣'][i]}</span>`);
      slot.dataset.drop = 'found'; slot.dataset.i = i;
      top.appendChild(slot);
    });
    board.appendChild(top);
    const tab = el('div', 'so-tab');
    so.tab.forEach((col, i) => {
      const hot = soSel?.targets.some(t => t.to === 'tab' && t.i === i);
      const c = el('div', 'so-col' + (hot ? ' hot' : ''));
      c.dataset.drop = 'tab'; c.dataset.i = i;
      if (!col.length) c.innerHTML = '<span class="so-empty">R</span>';
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
    const tools = el('div', 'so-tools');
    if (v.phase === 'play') {
      const u = btn('ghost small', '↶ Annuler', soUndo); u.disabled = !so.undo.length; tools.appendChild(u);
      if (soCanAuto() && !so.won) tools.appendChild(btn('primary', 'Finir automatiquement', soAutoFinish));
      if (!me?.done && !me?.gaveUp) tools.appendChild(btn('ghost small', 'Abandonner', () => askConfirm('Abandonner', 'Tu gardes tes cartes montées pour le classement, mais tu ne joues plus.', 'Abandonner', () => act({ t: 'so:giveup' }))));
      tools.appendChild(el('span', 'so-moves', `${so.moves} coup${so.moves > 1 ? 's' : ''}`));
    }
    root.appendChild(tools);
    if (soSel) root.appendChild(el('p', 'so-hint', 'Plusieurs colonnes possibles : touche celle que tu veux.'));
  }
  if (so.won && v.phase === 'play') root.appendChild(el('div', 'so-win', `<b>Patience réussie !</b><span>${so.moves} coups. On attend les autres…</span>`));
  if (v.phase === 'over') {
    const w = v.players[0];
    root.appendChild(el('div', 'so-win', `<b>${esc(w?.name || '')} gagne</b><span>${w?.done ? `patience terminée en ${soFmt(w.time)}` : `${w?.found || 0} cartes montées`}</span>`));
    if (v.isHost) { const r = el('div', 'so-tools'); r.append(btn('primary', 'Nouvelle donne', () => act({ t: 'so:again' })), btn('ghost', 'Retour au salon', () => act({ t: 'restart' }))); root.appendChild(r); }
  } else if (v.isHost) root.appendChild(btn('ghost small so-end', 'Arrêter la course et classer', () => askConfirm('Arrêter la course', 'Le classement se fait sur les cartes montées à cet instant.', 'Arrêter', () => act({ t: 'so:end' }))));
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
  soDrag = { src, els, x0: e.clientX, y0: e.clientY, on: false, id: e.pointerId, over: null };
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
  d.els.forEach(n => { n.style.transform = `translate(${dx}px, ${dy}px)`; });
  const over = soDropAt(e.clientX, e.clientY);
  if (d.over?.el !== over?.el) { d.over?.el.classList.remove('hot'); over?.el.classList.add('hot'); }
  d.over = over;
}, { passive: false });
document.addEventListener('pointerup', e => { if (soDrag && e.pointerId === soDrag.id) soDragEnd(false); });
document.addEventListener('pointercancel', e => { if (soDrag && e.pointerId === soDrag.id) soDragEnd(true); });
