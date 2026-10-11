// Jeu de dames : affichage et commandes. Les règles du jeu sont dans engines/dames.js.

'use strict';

// ============================================================ écran
// Tout l'écran est la table (table.js, table.css) : l'adversaire en face, le damier au milieu (tourné pour celui
// qui a les noirs), le meneur dans sa bulle, et le plateau de verre en bas : tes pièces et tes gestes.
// On touche un pion, puis sa case d'arrivée ; pour une rafle, chaque case d'arrêt, jusqu'à ce qu'il ne reste qu'un
// chemin possible. Les pions sont dessinés en CSS ; une image img/dames/<pion|dame>-<blanc|noir>.webp (rendu 3D)
// les remplace si elle existe.
let dmSel = [], dmLastView = null, dmArmResign = 0, dmLastN = 0;

const DM_IMG = {};
function dmImg(name) {
  let s = DM_IMG[name];
  if (!s) { s = DM_IMG[name] = { ok: false }; const im = new Image(); im.onload = () => { s.ok = true; if (view?.dm) renderDames(view.dm); }; im.src = `img/dames/${name}.webp?v=${ASSET_V}`; }
  return s.ok ? `<img class="dmx-img" src="img/dames/${name}.webp?v=${ASSET_V}" alt="" decoding="async">` : '';
}
function dmPiece(p, cls = '') {
  if (!p) return '';
  const w = p.toLowerCase() === 'w', king = p === 'W' || p === 'B', img = dmImg(`${king ? 'dame' : 'pion'}-${w ? 'blanc' : 'noir'}`);
  return `<span class="dmx-pc ${w ? 'w' : 'b'}${king ? ' king' : ''}${img ? ' has-img' : ''} ${cls}" aria-hidden="true">${img || '<i></i>'}</span>`;
}
const dmWho = (v, s) => s && v.me >= 0 && s.id === v.seats[v.me].id ? 'Tu' : esc(tbSplit(s || {})[1] || '');

/** Les coups qui commencent par le chemin déjà touché. */
const dmFits = (v, sel) => v.moves.filter(m => sel.every((x, k) => m.path[k] === x));

function dmBoard(v, flip) {
  const N = v.N, box = el('div', 'dmx-board' + (flip ? ' flip' : '') + (v.myTurn ? ' can' : ''));
  box.style.setProperty('--n', N);
  const fits = v.myTurn && dmSel.length ? dmFits(v, dmSel) : [];
  const next = new Set(fits.filter(m => m.path.length > dmSel.length).map(m => m.path[dmSel.length]));
  const ends = new Set(fits.map(m => m.path[m.path.length - 1]));
  const caps = new Set(fits.flatMap(m => m.caps.slice(0, Math.max(0, dmSel.length - 1))));   // déjà sautées dans le chemin touché
  const movable = new Set(v.myTurn ? v.moves.map(m => m.path[0]) : []);
  const lastPath = v.last ? new Set(v.last.path) : new Set(), lastCaps = v.last ? new Set(v.last.caps) : new Set();
  const fresh = v.last && v.last.n !== dmLastN;
  let html = '';
  for (let k = 0; k < N * N; k++) {
    const i = flip ? N * N - 1 - k : k, r = Math.floor(i / N), c = i % N, darkSq = (r + c) % 2 === 1, p = v.board[i];
    if (!darkSq) { html += '<span class="dmx-sq l"></span>'; continue; }
    const cls = ['dmx-sq', 'd'];
    if (lastPath.has(i)) cls.push('last');
    if (dmSel[0] === i) cls.push('sel');
    else if (dmSel.includes(i)) cls.push('step');
    if (next.has(i)) cls.push(ends.has(i) ? 'to' : 'via');
    else if (ends.has(i) && dmSel.length) cls.push('to');
    if (movable.has(i)) cls.push('mov');
    if (caps.has(i)) cls.push('taken');
    if (lastCaps.has(i) && fresh) cls.push('gone');
    const n = Dames.num(N, i);
    html += `<button type="button" class="${cls.join(' ')}" data-i="${i}" aria-label="case ${n}${p ? ', ' + (p === 'W' || p === 'B' ? 'dame' : 'pion') + (p.toLowerCase() === 'w' ? ' blanc' : ' noir') : ''}">${dmPiece(p, fresh && v.last && i === v.last.path[v.last.path.length - 1] ? 'pop' : '')}</button>`;
  }
  box.innerHTML = html;
  box.onclick = e => {
    const b = e.target.closest('.dmx-sq.d'); if (!b || !v.myTurn) return;
    const i = +b.dataset.i;
    if (dmSel.length && i !== dmSel[0]) {
      const fits = dmFits(v, dmSel), last = m => m.path[m.path.length - 1];
      // la case d'arrêt suivante : on avance d'un pas ; s'il ne reste qu'un chemin, le coup part
      if (fits.some(m => m.path[dmSel.length] === i)) {
        const sel = dmSel.concat(i), left = dmFits(v, sel);
        if (left.length === 1) { dmSel = []; act({ t: 'dm:move', path: left[0].path }); return; }
        dmSel = sel; renderDames(view.dm); return;
      }
      // directement l'arrivée d'une rafle : si un seul chemin y mène, on joue
      const toEnd = fits.filter(m => last(m) === i);
      if (toEnd.length === 1) { dmSel = []; act({ t: 'dm:move', path: toEnd[0].path }); return; }
      if (toEnd.length > 1) { toast('Plusieurs chemins mènent ici : touche d’abord la case d’arrêt suivante.'); return; }
    }
    if (movable.has(i)) { dmSel = dmSel[0] === i ? [] : [i]; renderDames(view.dm); return; }
    if (v.board[i] && v.board[i].toLowerCase() === v.turn) toast(v.mustTake ? `La prise est obligatoire : ${v.mustTake > 1 ? `il faut prendre ${v.mustTake} pièces` : 'il faut prendre'}.` : 'Ce pion est bloqué.');
    dmSel = []; renderDames(view.dm);
  };
  return box;
}

function dmSheetBody() {
  const v = dmLastView; if (!v) return '';
  if (tbSheet.kind === 'dm-log') return tbLog(v.log.slice().reverse());
  return dmMovesHTML(v);
}
function dmMovesHTML(v) {
  if (!v.notes.length) return '<p class="tb-sheet-say">Aucun coup joué.</p>';
  let out = '<ol class="ecx-moves dmx-moves">';
  for (let k = 0; k < v.notes.length; k += 2) out += `<li><span>${k / 2 + 1}.</span><b>${esc(v.notes[k])}</b><b>${esc(v.notes[k + 1] || '')}</b></li>`;
  return out + '</ol>';
}
const dmOpenSheet = kind => tbSheet.open(kind, kind === 'dm-log' ? 'Ce qui s’est passé' : 'Les coups', dmSheetBody);

function renderDames(v) {
  if (!v) return;
  dmLastView = v;
  if (!v.myTurn || (dmSel.length && !dmFits(v, dmSel).length)) dmSel = [];
  const root = $('#dm-main'); root.innerHTML = '';
  const me = v.me, mine = v.seats[me], foe = me >= 0 ? v.seats[1 - me] : null, host = v.isHost;
  const flip = mine?.color === 'b', ti = v.turn === 'w' ? 0 : 1, T = v.seats[ti];
  const say = (list, j = 0) => list[(v.notes.length + j) % list.length];
  const moveNo = Math.floor(v.notes.length / 2) + 1;

  // ---------------------------------------------------------------- la ligne de partie
  const chips = [];
  if (v.notes.length) chips.push(tbChip(`${TB_ICON.log}Coups`, () => dmOpenSheet('dm-moves')));
  chips.push(tbChip(`<i class="ecx-dot w"></i><b>${v.pieces.w}</b> · <i class="ecx-dot b"></i><b>${v.pieces.b}</b>`, () => dmOpenSheet('dm-log'), `Pièces : blancs ${v.pieces.w}, noirs ${v.pieces.b}`));
  const left = v.phase === 'over' ? 'Partie terminée' : `Coup <b>${moveNo}</b> · ${v.turn === 'w' ? 'blancs' : 'noirs'}`;
  root.appendChild(tbBar(left, chips));

  // ---------------------------------------------------------------- l'adversaire en face (les spectateurs voient les deux)
  const seatList = v.seats.map((s, k) => ({ ...s, name: s.bot ? s.name.replace(/^Robot /, '🤖 ') : s.name, k }));
  const table = el('div', 'dmx-table' + (me >= 0 ? ' player' : ' watch'));
  const lost = c => v.start - v.pieces[c];
  table.appendChild(tbSeats(seatList, {
    meId: me >= 0 ? mine.id : null, currentId: v.phase === 'play' ? T.id : null, since: null,
    badge: s => `${v.pieces[s.color]}`,
    under: s => (s.bot ? `<span class="tb-tag soft">${Dames.LEVELS[v.level]}</span>` : '') + `<span class="ecx-under"><i class="ecx-dot ${s.color}"></i>${v.kings[s.color] ? `<b class="dmx-kings">${v.kings[s.color]} dame${v.kings[s.color] > 1 ? 's' : ''}</b>` : ''}</span>`,
    cls: s => v.phase === 'over' && v.result?.winner && s.id !== v.result.winner ? 'out' : '',
  }));
  table.appendChild(el('div', 'dmx-wrap')).appendChild(dmBoard(v, flip));
  root.appendChild(table);
  dmLastN = v.last?.n || 0;

  // ---------------------------------------------------------------- le meneur
  let title = '', line = '', pip = '', hot = false;
  const l = v.last, by = l ? dmWho(v, v.seats.find(s => s.id === l.by)) : '';
  const lastTxt = l ? `${by} ${by === 'Tu' ? 'as joué' : 'a joué'} ${esc(v.notes[v.notes.length - 1] || '')}${l.caps.length > 1 ? `, ${l.caps.length} prises` : l.caps.length ? ', une prise' : ''}${l.promo ? ', et une nouvelle dame' : ''}.` : '';
  if (v.phase === 'play') {
    if (v.drawOffer >= 0 && me >= 0 && v.drawOffer !== me) { title = `${esc(tbSplit(foe)[1])} propose la nulle.`; line = 'Accepte, ou refuse et joue ton coup.'; pip = '🤝'; hot = true; }
    else if (me < 0) { title = `${esc(tbSplit(T)[1])} réfléchit.`; line = lastTxt || 'Les blancs ouvrent la partie.'; pip = '👀'; }
    else if (v.myTurn) {
      hot = true; pip = v.mustTake ? '⚡' : '⚪';
      title = v.mustTake ? (v.mustTake > 1 ? `Rafle obligatoire : ${v.mustTake} pièces.` : 'Prise obligatoire.') : say(['À toi de jouer.', 'À toi.', 'Ton coup.']);
      line = dmSel.length > 1 ? 'Continue : touche la case d’arrêt suivante.' : dmSel.length ? 'Touche la case d’arrivée.' : (lastTxt ? lastTxt + ' ' : '') + (v.mustTake ? 'Les pièces qui peuvent prendre sont marquées.' : say(['Touche un pion, puis sa case d’arrivée.', 'Choisis un pion.'], 1));
    } else {
      title = T.bot ? say(['Le robot réfléchit.', 'Le robot compte ses rafles.']) : `${esc(tbSplit(T)[1])} réfléchit.`; pip = '⏳';
      line = (lastTxt || '') + (v.drawOffer === me ? ' Tu as proposé la nulle.' : '');
    }
  } else if (v.phase === 'over') {
    const r = v.result, won = mine && r.winner === mine.id, W = v.seats.find(s => s.id === r.winner);
    const why = { bloque: v.pieces[v.turn] ? 'Plus aucun coup possible.' : 'Plus aucune pièce.', abandon: 'Abandon.', repetition: 'Même position trois fois.', dames: '25 coups de dames sans prise.', accord: 'Nulle acceptée.' }[r.why];
    if (!r.winner) { title = 'Partie nulle.'; pip = '🤝'; line = `${why} Revanche ? Tout se passe au salon.`; }
    else { title = won ? 'Tu gagnes !' : `${esc(tbSplit(W)[1])} gagne.`; pip = won ? '🏆' : '⚫'; hot = won; line = `${why} Revanche ? Tout se passe au salon.`; }
  }
  root.appendChild(tbSay({ title, line, pip, hot }));

  // ---------------------------------------------------------------- le plateau : tes pièces, tes gestes
  if (me >= 0) {
    const acts = [];
    if (v.phase === 'play') {
      if (v.drawOffer >= 0 && v.drawOffer !== me) {
        acts.push(tbBtn('glass', 'Refuser', () => act({ t: 'dm:draw-no' })));
        acts.push(tbBtn('hero', 'Accepter la nulle', () => act({ t: 'dm:draw' })));
      } else {
        if (dmSel.length > 1) acts.push(tbBtn('glass', 'Recommencer', () => { dmSel = []; renderDames(view.dm); }));
        else if (v.vsBot) { const u = tbBtn('glass', 'Reprendre mon coup', () => act({ t: 'dm:undo' })); u.disabled = !v.canUndo; acts.push(u); }
        const d = tbBtn('glass', v.drawOffer === me ? 'Nulle proposée' : 'Proposer nulle', () => act({ t: 'dm:draw' })); d.disabled = v.drawOffer === me || v.notes.length < 2; acts.push(d);
        const armed = Date.now() - dmArmResign < 4000;
        acts.push(tbBtn('danger', armed ? 'Vraiment ?' : 'Abandonner', () => { if (Date.now() - dmArmResign < 4000) { dmArmResign = 0; act({ t: 'dm:resign' }); } else { dmArmResign = Date.now(); renderDames(view.dm); setTimeout(() => { if (view?.dm) renderDames(view.dm); }, 4100); } }));
      }
    }
    if (v.phase === 'over' && host) acts.push(tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })));
    const c = mine.color, kings = v.kings[c];
    const tray = tbTray({ left: `<i class="ecx-dot ${c}"></i>Toi · <b>${v.pieces[c]} pièce${v.pieces[c] > 1 ? 's' : ''}</b>${kings ? ` dont ${kings} dame${kings > 1 ? 's' : ''}` : ''}`, right: `${lost(foe.color)} prise${lost(foe.color) > 1 ? 's' : ''}`, acts });
    tray.classList.add('dmx-tray');
    root.appendChild(tray);
  } else if (v.phase === 'over' && host) root.appendChild(tbTray({ acts: [tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' }))] }));

  // ---------------------------------------------------------------- colonne de droite (PC) : joueurs, coups, fil
  const side = el('div', 'dm-side');
  side.appendChild(el('p', 'mj-side-title', 'Les joueurs'));
  side.insertAdjacentHTML('beforeend', tbRows(v.seats.map((s, k) => { const [e, n] = tbSplit(s); return { e, name: n, sub: [k === me ? 'toi' : '', s.color === 'w' ? 'les blancs' : 'les noirs', v.kings[s.color] ? `${v.kings[s.color]} dame${v.kings[s.color] > 1 ? 's' : ''}` : '', s.online ? '' : 'absent'].filter(Boolean).join(' · '), score: `${v.pieces[s.color]}`, me: k === me }; })));
  if (v.watchers.length) side.insertAdjacentHTML('beforeend', `<p class="ecx-watch">Regardent : ${v.watchers.map(w => esc(tbSplit(w)[1])).join(', ')}</p>`);
  side.appendChild(el('p', 'mj-side-title ecx-side-t', 'Les coups'));
  side.insertAdjacentHTML('beforeend', dmMovesHTML(v));
  root.appendChild(side);
  if (v.log.length) {
    const lg = el('div', 'dm-log');
    lg.appendChild(el('p', 'mj-side-title', 'Ce qui s’est passé'));
    lg.insertAdjacentHTML('beforeend', tbLog(v.log.slice().reverse()));
    root.appendChild(lg);
  }
  if (tbSheet.kind === 'dm-log' || tbSheet.kind === 'dm-moves') tbSheet.refresh(true);
}
