// Échecs : affichage et commandes. Les règles du jeu sont dans engines/echecs.js.

'use strict';

// ============================================================ écran
// Tout l'écran est la table (table.js, table.css) : l'adversaire assis en face, l'échiquier au milieu (tourné
// pour celui qui a les noirs), le meneur dans sa bulle, et le plateau de verre en bas : ta pendule, tes prises,
// et les gestes (nulle, abandon, reprendre son coup contre le robot). On touche une pièce, puis sa case d'arrivée.
// Les pièces sont dessinées en vectoriel (#ecx-sprite dans index.html) ; une image img/echecs/<w|b><k|q|r|b|n|p>.webp
// (rendu 3D) les remplace si elle existe.
let ecSel = -1, ecPromo = null, ecLastView = null, ecRecvAt = 0, ecArmResign = 0, ecLastN = 0;
const EC_NAME = { k: 'roi', q: 'dame', r: 'tour', b: 'fou', n: 'cavalier', p: 'pion' };

const EC_IMG = {};
function ecImg(name) {
  let s = EC_IMG[name];
  if (!s) { s = EC_IMG[name] = { ok: false }; const im = new Image(); im.onload = () => { s.ok = true; if (view?.ec) renderEchecs(view.ec); }; im.src = `img/echecs/${name}.webp?v=${ASSET_V}`; }
  return s.ok ? `<img class="ecx-img" src="img/echecs/${name}.webp?v=${ASSET_V}" alt="" decoding="async">` : '';
}
/** Une pièce : son dessin vectoriel (ivoire ou ébène), ou l'image 3D. */
function ecPiece(p, cls = '') {
  if (!p) return '';
  const w = p === p.toUpperCase(), t = p.toLowerCase(), img = ecImg((w ? 'w' : 'b') + t);
  return `<span class="ecx-pc ${w ? 'w' : 'b'} t-${t}${img ? ' has-img' : ''} ${cls}" aria-hidden="true">${img || `<svg viewBox="0 0 100 100"><use href="#ecx-${t}"/></svg>`}</span>`;
}
const ecClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ecWho = (v, s) => s && v.me >= 0 && s.id === v.seats[v.me].id ? 'Tu' : esc(tbSplit(s || {})[1] || '');

// la pendule tourne entre deux diffusions : on recalcule chaque demi-seconde à partir de l'heure de réception
setInterval(() => {
  const v = view?.ec; if (!v || !v.clock || v.phase !== 'play') return;
  const k = v.turn === 'w' ? 0 : 1, left = Math.max(0, v.left[k] - (Date.now() - ecRecvAt));
  document.querySelectorAll(`.ecx-clock[data-k="${k}"]`).forEach(n => { n.textContent = ecClock(left); n.classList.toggle('low', left < 30000); });
}, 500);

/** L'échiquier : 64 cases ; flip = vu des noirs. */
function ecBoard(v, flip) {
  const box = el('div', 'ecx-board' + (flip ? ' flip' : '') + (v.myTurn ? ' can' : ''));
  const mine = v.myTurn ? v.moves : [], targets = new Set(mine.filter(m => m.f === ecSel).map(m => m.t)), movable = new Set(mine.map(m => m.f));
  const fresh = v.last && v.last.n !== ecLastN;
  let html = '';
  for (let k = 0; k < 64; k++) {
    const i = flip ? 63 - k : k, r = i >> 3, c = i & 7, p = v.board[i];
    const cls = ['ecx-sq', (r + c) % 2 ? 'd' : 'l'];
    if (v.last && (i === v.last.f || i === v.last.t)) cls.push('last');
    if (i === v.check) cls.push('check');
    if (i === ecSel) cls.push('sel');
    if (targets.has(i)) cls.push(p ? 'hit' : 'to');
    if (movable.has(i)) cls.push('mov');
    const coord = (k % 8 === 0 ? `<b class="rk">${8 - r}</b>` : '') + (k >= 56 ? `<b class="fl">${Echecs.FILES[c]}</b>` : '');
    html += `<button type="button" class="${cls.join(' ')}" data-i="${i}" aria-label="${Echecs.sqName(i)}${p ? ', ' + EC_NAME[p.toLowerCase()] + (p === p.toUpperCase() ? ' blanc' : ' noir') : ''}">${coord}${ecPiece(p, fresh && v.last && i === v.last.t ? 'pop' : '')}</button>`;
  }
  box.innerHTML = html;
  box.onclick = e => {
    const b = e.target.closest('.ecx-sq'); if (!b || !v.myTurn) return;
    const i = +b.dataset.i;
    if (ecSel >= 0 && targets.has(i)) {
      const cands = mine.filter(m => m.f === ecSel && m.t === i);
      if (cands.some(m => m.p)) { ecPromo = { f: ecSel, t: i }; renderEchecs(view.ec); return; }
      const f = ecSel; ecSel = -1; act({ t: 'ec:move', from: f, to: i }); return;
    }
    if (movable.has(i)) { ecSel = ecSel === i ? -1 : i; ecPromo = null; renderEchecs(view.ec); return; }
    if (v.board[i] && Echecs.side(v.board[i]) === v.turn) toast(v.check >= 0 ? 'Ton roi est en échec : cette pièce ne peut pas le protéger.' : 'Cette pièce ne peut pas bouger.');
    ecSel = -1; ecPromo = null; renderEchecs(view.ec);
  };
  return box;
}

const ecPieces = list => list.map(p => ecPiece(p, 'mini')).join('');
function ecSheetBody() {
  const v = ecLastView; if (!v) return '';
  if (tbSheet.kind === 'ec-log') return tbLog(v.log.slice().reverse());
  return ecMovesHTML(v);
}
function ecMovesHTML(v) {
  if (!v.history.length) return '<p class="tb-sheet-say">Aucun coup joué.</p>';
  let out = '<ol class="ecx-moves">';
  for (let k = 0; k < v.history.length; k += 2) out += `<li><span>${k / 2 + 1}.</span><b>${esc(v.history[k])}</b><b>${esc(v.history[k + 1] || '')}</b></li>`;
  return out + '</ol>';
}
const ecOpenSheet = kind => tbSheet.open(kind, kind === 'ec-log' ? 'Ce qui s’est passé' : 'Les coups', ecSheetBody);

function renderEchecs(v) {
  if (!v) return;
  ecRecvAt = Date.now(); ecLastView = v;
  if (!v.myTurn) { ecSel = -1; ecPromo = null; }
  if (ecSel >= 0 && !v.moves.some(m => m.f === ecSel)) ecSel = -1;
  const root = $('#ec-main'); root.innerHTML = '';
  const me = v.me, mine = v.seats[me], foe = me >= 0 ? v.seats[1 - me] : null, host = v.isHost, desk = tbDesk();
  const flip = mine?.color === 'b', ti = v.turn === 'w' ? 0 : 1, T = v.seats[ti];
  const say = (list, j = 0) => list[(v.history.length + j) % list.length];
  const moveNo = Math.floor(v.history.length / 2) + 1;

  // ---------------------------------------------------------------- la ligne de partie
  const chips = [];
  if (v.history.length) chips.push(tbChip(`${TB_ICON.log}Coups`, () => ecOpenSheet('ec-moves')));
  const adv = v.material, advTxt = adv ? `${adv > 0 ? 'Blancs' : 'Noirs'} +${Math.abs(adv)}` : 'Égalité';
  if (v.history.length) chips.push(tbChip(`⚖️ ${advTxt}`, () => ecOpenSheet('ec-log'), `Matériel : ${advTxt}`));
  const left = v.phase === 'over' ? 'Partie terminée' : `Coup <b>${moveNo}</b> · ${v.turn === 'w' ? 'blancs' : 'noirs'}`;
  root.appendChild(tbBar(left, chips));

  // ---------------------------------------------------------------- l'adversaire en face (les spectateurs voient les deux)
  const seatList = v.seats.map((s, k) => ({ ...s, name: s.bot ? s.name.replace(/^Robot /, '🤖 ') : s.name, k }));
  const table = el('div', 'ecx-table' + (me >= 0 ? ' player' : ' watch'));
  const lostBy = s => v.captured[s.color === 'w' ? 'b' : 'w'];   // ce qu'il a pris = les pièces perdues par l'autre camp
  table.appendChild(tbSeats(seatList, {
    meId: me >= 0 ? mine.id : null, currentId: v.phase === 'play' ? T.id : null, since: null,
    under: s => (s.bot ? `<span class="tb-tag soft">${Echecs.LEVELS[v.level]}</span>` : '') + `<span class="ecx-under">${s.color === 'w' ? '<i class="ecx-dot w"></i>' : '<i class="ecx-dot b"></i>'}${v.clock ? `<b class="ecx-clock${v.left[s.k] < 30000 ? ' low' : ''}" data-k="${s.k}">${ecClock(v.left[s.k])}</b>` : ''}</span><span class="ecx-taken">${ecPieces(lostBy(s))}</span>`,
    cls: s => v.phase === 'over' && v.result?.winner && s.id !== v.result.winner ? 'out' : '',
  }));
  const board = ecBoard(v, flip);
  table.appendChild(el('div', 'ecx-wrap')).appendChild(board);
  root.appendChild(table);
  ecLastN = v.last?.n || 0;

  // ---------------------------------------------------------------- le meneur
  let title = '', line = '', pip = '', hot = false;
  const l = v.last, lastTxt = l ? `${ecWho(v, v.seats.find(s => s.id === l.by))} ${l.by === mine?.id ? 'as joué' : 'a joué'} ${esc(l.san)}.` : '';
  if (v.phase === 'play') {
    if (v.drawOffer >= 0 && me >= 0 && v.drawOffer !== me) { title = `${esc(tbSplit(foe)[1])} propose la nulle.`; line = 'Accepte, ou refuse et joue ton coup.'; pip = '🤝'; hot = true; }
    else if (me < 0) { title = `${esc(tbSplit(T)[1])} réfléchit.`; line = lastTxt || 'Les blancs ouvrent la partie.'; pip = '👀'; }
    else if (v.myTurn) {
      hot = true; pip = v.check >= 0 ? '⚠️' : '♟️';
      title = v.check >= 0 ? 'Échec ! Protège ton roi.' : say(['À toi de jouer.', 'À toi.', 'Ton coup.']);
      line = ecPromo ? 'Ton pion arrive au bout : choisis sa nouvelle pièce.' : ecSel >= 0 ? `Ton ${EC_NAME[v.board[ecSel].toLowerCase()]} en ${Echecs.sqName(ecSel)} : touche une case marquée.` : (lastTxt ? lastTxt + ' ' : '') + say(['Touche une pièce, puis sa case d’arrivée.', 'Choisis une pièce.'], 1);
    } else {
      title = T.bot ? say(['Le robot réfléchit.', 'Le robot calcule.']) : `${esc(tbSplit(T)[1])} réfléchit.`; pip = '⏳';
      line = (lastTxt || '') + (v.drawOffer === me ? ' Tu as proposé la nulle.' : '');
    }
  } else if (v.phase === 'over') {
    const r = v.result, won = mine && r.winner === mine.id, W = v.seats.find(s => s.id === r.winner);
    const why = { mat: 'Échec et mat.', temps: 'Temps écoulé.', abandon: 'Abandon.', pat: 'Pat.', repetition: 'Même position trois fois.', cinquante: '50 coups sans prise ni pion.', materiel: 'Plus assez de pièces pour mater.', accord: 'Nulle acceptée.' }[r.why];
    if (!r.winner) { title = 'Partie nulle.'; pip = '🤝'; line = `${why} Revanche ? Tout se passe au salon.`; }
    else { title = won ? 'Tu gagnes !' : me >= 0 ? `${esc(tbSplit(W)[1])} gagne.` : `${esc(tbSplit(W)[1])} gagne.`; pip = won ? '🏆' : '♚'; hot = won; line = `${why} ${v.history.length} demi-coups. Revanche ? Tout se passe au salon.`; }
  }
  root.appendChild(tbSay({ title, line, pip, hot }));

  // ---------------------------------------------------------------- le plateau : ta pendule, tes prises, tes gestes
  if (me >= 0) {
    const acts = [];
    let body = null;
    if (ecPromo) {
      body = el('div', 'ecx-promo');
      ['q', 'r', 'b', 'n'].forEach(t => {
        const b = el('button', 'ecx-promo-b', `${ecPiece(mine.color === 'w' ? t.toUpperCase() : t)}<small>${EC_NAME[t]}</small>`); b.type = 'button';
        b.onclick = () => { const p = ecPromo; ecPromo = null; ecSel = -1; act({ t: 'ec:move', from: p.f, to: p.t, promo: t }); };
        body.appendChild(b);
      });
      acts.push(tbBtn('glass', 'Annuler', () => { ecPromo = null; renderEchecs(view.ec); }));
    } else if (v.phase === 'play') {
      if (v.drawOffer >= 0 && v.drawOffer !== me) {
        acts.push(tbBtn('glass', 'Refuser', () => act({ t: 'ec:draw-no' })));
        acts.push(tbBtn('hero', 'Accepter la nulle', () => act({ t: 'ec:draw' })));
      } else {
        if (v.vsBot) { const u = tbBtn('glass', 'Reprendre mon coup', () => act({ t: 'ec:undo' })); u.disabled = !v.canUndo; acts.push(u); }
        const d = tbBtn('glass', v.drawOffer === me ? 'Nulle proposée' : 'Proposer nulle', () => act({ t: 'ec:draw' })); d.disabled = v.drawOffer === me || v.history.length < 2; acts.push(d);
        const armed = Date.now() - ecArmResign < 4000;
        acts.push(tbBtn('danger', armed ? 'Vraiment ?' : 'Abandonner', () => { if (Date.now() - ecArmResign < 4000) { ecArmResign = 0; act({ t: 'ec:resign' }); } else { ecArmResign = Date.now(); renderEchecs(view.ec); setTimeout(() => { if (view?.ec) renderEchecs(view.ec); }, 4100); } }));
      }
    }
    if (v.phase === 'over' && host) acts.push(tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })));
    const myClock = v.clock ? `<b class="ecx-clock${v.left[me] < 30000 ? ' low' : ''}" data-k="${me}">${ecClock(v.left[me])}</b>` : '';
    const tray = tbTray({ left: `<i class="ecx-dot ${mine.color}"></i>Toi · ${mine.color === 'w' ? 'les blancs' : 'les noirs'} ${myClock}`, right: `<span class="ecx-taken">${ecPieces(lostBy(mine))}</span>`, body, acts });
    tray.classList.add('ecx-tray');
    root.appendChild(tray);
  } else if (v.phase === 'over' && host) root.appendChild(tbTray({ acts: [tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' }))] }));

  // ---------------------------------------------------------------- colonne de droite (PC) : joueurs, coups, fil
  const side = el('div', 'ec-side');
  side.appendChild(el('p', 'mj-side-title', 'Les joueurs'));
  side.insertAdjacentHTML('beforeend', tbRows(v.seats.map((s, k) => { const [e, n] = tbSplit(s); return { e, name: n, sub: [k === me ? 'toi' : '', s.color === 'w' ? 'les blancs' : 'les noirs', s.online ? '' : 'absent'].filter(Boolean).join(' · '), score: v.clock ? ecClock(v.left[k]) : '', me: k === me }; })));
  if (v.watchers.length) side.insertAdjacentHTML('beforeend', `<p class="ecx-watch">Regardent : ${v.watchers.map(w => esc(tbSplit(w)[1])).join(', ')}</p>`);
  side.appendChild(el('p', 'mj-side-title ecx-side-t', 'Les coups'));
  side.insertAdjacentHTML('beforeend', ecMovesHTML(v));
  root.appendChild(side);
  if (v.log.length) {
    const lg = el('div', 'ec-log');
    lg.appendChild(el('p', 'mj-side-title', 'Ce qui s’est passé'));
    lg.insertAdjacentHTML('beforeend', tbLog(v.log.slice().reverse()));
    root.appendChild(lg);
  }
  if (tbSheet.kind === 'ec-log' || tbSheet.kind === 'ec-moves') tbSheet.refresh(true);
}
