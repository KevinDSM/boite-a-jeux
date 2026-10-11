// Bataille navale : affichage et commandes. Les règles du jeu sont dans engines/navale.js.

'use strict';

// ============================================================ écran
// Tout l'écran est la table (table.js, table.css) : l'adversaire assis en face, ta grille de tirs en grand sur
// l'océan, le meneur dans sa bulle de verre, et dans le plateau de verre en bas ta flotte en petit avec les tirs
// reçus. Pendant le placement, la grande grille est la tienne : on touche un bateau pour le tourner, on le fait
// glisser pour le déplacer, ou on laisse le hasard faire. La flotte d'en face n'arrive jamais sur ton téléphone.
// Les bateaux sont dessinés en CSS ; une image img/navale/<bateau>.webp (rendu 3D) les remplace si elle existe.
let nvPlace = null, nvPhase = null, nvAim = null, nvDrag = null, nvDown = false, nvPending = null, nvLastShot = 0, nvLastView = null;
const NV_NAME = { pa: 'Porte-avions', cr: 'Croiseur', ct: 'Contre-torpilleur', sm: 'Sous-marin', tp: 'Torpilleur' };
const nvYou = (s, me) => s && me ? 'Tu' : esc(tbSplit(s || {})[1] || '');

// les images 3D, si elles existent : chargées une fois, le dessin CSS reste en secours
const NV_IMG = {};
function nvImg(name) {
  let s = NV_IMG[name];
  if (!s) { s = NV_IMG[name] = { ok: false }; const im = new Image(); im.onload = () => { s.ok = true; if (view?.nv && !nvDrag) renderNavale(view.nv); }; im.src = `img/navale/${name}.webp?v=${ASSET_V}`; }
  return s.ok ? `<img class="nvx-img" src="img/navale/${name}.webp?v=${ASSET_V}" alt="" decoding="async">` : '';
}
const nvShipHTML = (s, cls = '') => `<span class="nvx-ship ${s.k} ${s.h ? 'h' : 'v'} ${cls}" style="--r:${s.r};--c:${s.c};--l:${Navale.LEN[s.k]}" aria-hidden="true">${nvImg(s.k)}<i></i></span>`;

/**
 * Une grille de 10 × 10 avec ses repères A à J et 1 à 10.
 * marks : tableau de 100 ('' rien, 'm' à l'eau, 'h' touché, 's' coulé) ; ships : bateaux à dessiner ;
 * aim : case visée ; fresh : case du dernier tir (animation) ; cls : 'big' ou 'small'.
 */
function nvBoard({ marks, ships = [], aim = null, fresh = null, cls = '', label = '' }) {
  const b = el('div', 'nvx-board ' + cls);
  b.innerHTML = `<span class="nvx-cols" aria-hidden="true">${[...Navale.COLS].map(x => `<i>${x}</i>`).join('')}</span><span class="nvx-rows" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i>${i + 1}</i>`).join('')}</span>`;
  const sea = el('div', 'nvx-sea');
  sea.setAttribute('role', 'img'); if (label) sea.setAttribute('aria-label', label);
  sea.innerHTML = ships.map(s => nvShipHTML(s, s.cls || '')).join('')
    + (marks || Array(100).fill('')).map((m, k) => `<i class="nvx-c${m ? ' ' + m : ''}${k === aim ? ' aim' : ''}${k === fresh ? ' fresh' : ''}"></i>`).join('');
  b.appendChild(sea);
  return b;
}
const nvCellAt = (sea, e) => { const r = sea.getBoundingClientRect(); const c = Math.floor((e.clientX - r.left) / r.width * 10), rr = Math.floor((e.clientY - r.top) / r.height * 10); return c >= 0 && c < 10 && rr >= 0 && rr < 10 ? [rr, c] : null; };

// ta flotte, avec les tirs reçus : en petit dans le plateau (téléphone) ou à côté de la grande grille (PC)
const nvMyFleet = (v, mine, foe, fresh) => nvBoard({ marks: foe.shots, ships: mine.fleet.map(s => ({ ...s, cls: s.sunk ? 'sunk' : s.hit ? 'hurt' : '' })), fresh: v.last?.by === foe.id ? fresh : null, cls: 'small', label: 'Ta flotte et les tirs reçus' });

// ---------------------------------------------------------------- placement (sur ce téléphone seulement, jusqu'à « Prêt »)
const nvPlaced = () => Navale.SHIPS.map(s => nvPlace.ships[s.k] ? { k: s.k, ...nvPlace.ships[s.k] } : null).filter(Boolean);
function nvFits(k, r, c, h, skip = null) {
  const ship = { k, r, c, h };
  const cells = Navale.cellsOf(ship);
  if (cells.some(([a, b]) => a < 0 || b < 0 || a > 9 || b > 9)) return false;
  return !nvPlaced().filter(s => s.k !== k && s.k !== skip).some(s => Navale.cellsOf(s).some(([a, b]) => cells.some(([x, y]) => x === a && y === b)));
}
const nvClamp = (k, r, c, h) => { const L = Navale.LEN[k]; return h ? [r, Math.min(c, 10 - L)] : [Math.min(r, 10 - L), c]; };
function nvNextSel() { nvPlace.sel = Navale.SHIPS.find(s => !nvPlace.ships[s.k])?.k || null; }
function nvShipAt(r, c) { return nvPlaced().find(s => Navale.cellsOf(s).some(([a, b]) => a === r && b === c)); }

/** Le glisser au doigt : on soulève le bateau touché, il suit le doigt, on le pose où on le lâche (sinon il revient). */
function nvBindPlacement(sea) {
  sea.classList.add('placing');
  const ghost = el('span', 'nvx-ghost'); sea.appendChild(ghost);
  const showGhost = (k, r, c, h) => {
    if (!k || r == null) { ghost.hidden = true; return; }
    const [rr, cc] = nvClamp(k, r, c, h);
    ghost.hidden = false; ghost.className = `nvx-ghost nvx-ship ${k} ${h ? 'h' : 'v'}${nvFits(k, rr, cc, h, nvDrag?.k) ? '' : ' bad'}`;
    ghost.style.cssText = `--r:${rr};--c:${cc};--l:${Navale.LEN[k]}`;
  };
  ghost.hidden = true;
  sea.addEventListener('pointerdown', e => {
    const at = nvCellAt(sea, e); if (!at) return;
    e.preventDefault();                                   // sinon une sélection de texte lance un glisser-déposer natif
    nvDown = true;                                        // une diffusion qui arrive maintenant attendra le lever du doigt
    const [r, c] = at, s = nvShipAt(r, c);
    if (s) {
      const off = s.h ? c - s.c : r - s.r;
      nvDrag = { k: s.k, back: { ...nvPlace.ships[s.k] }, off, h: s.h, from: [r, c], moved: false, at: [r, c] };
      try { sea.setPointerCapture(e.pointerId); } catch { }
      sea.querySelector(`.nvx-ship.${s.k}:not(.nvx-ghost)`)?.classList.add('lifted');
      showGhost(s.k, s.h ? r : r - off, s.h ? c - off : c, s.h);
    }
  });
  sea.addEventListener('pointermove', e => {
    const at = nvCellAt(sea, e);
    if (nvDrag) {
      if (!at) return;
      if (at[0] !== nvDrag.from[0] || at[1] !== nvDrag.from[1]) nvDrag.moved = true;
      nvDrag.at = at;
      showGhost(nvDrag.k, nvDrag.h ? at[0] : at[0] - nvDrag.off, nvDrag.h ? at[1] - nvDrag.off : at[1], nvDrag.h);
    } else if (e.pointerType === 'mouse' && nvPlace.sel && at) showGhost(nvPlace.sel, at[0], at[1], nvPlace.h);
  });
  sea.addEventListener('pointerleave', () => { if (!nvDrag) ghost.hidden = true; });
  const end = e => {
    const d = nvDrag; nvDrag = null; nvDown = false;
    if (d) {
      if (!d.moved && e.type === 'pointerup') {
        // un simple toucher : le bateau tourne sur place (s'il a la place), sinon il est soulevé pour être reposé ailleurs
        const s = nvPlace.ships[d.k], h = !s.h, [r, c] = nvClamp(d.k, s.r, s.c, h);
        if (nvFits(d.k, r, c, h)) nvPlace.ships[d.k] = { r, c, h };
        else { nvPlace.ships[d.k] = null; nvPlace.sel = d.k; nvPlace.h = s.h; toast('Pas la place de le tourner ici. Touche une case pour le reposer.'); }
      } else {
        const [ar, ac] = d.at, [r, c] = nvClamp(d.k, d.h ? ar : ar - d.off, d.h ? ac - d.off : ac, d.h);
        if (e.type === 'pointerup' && nvFits(d.k, r, c, d.h)) nvPlace.ships[d.k] = { r, c, h: d.h };
        else nvPlace.ships[d.k] = d.back;
      }
    } else if (e.type === 'pointerup' && nvPlace.sel) {
      const at = nvCellAt(sea, e);
      if (at) {
        const [r, c] = nvClamp(nvPlace.sel, at[0], at[1], nvPlace.h);
        if (nvFits(nvPlace.sel, r, c, nvPlace.h)) { nvPlace.ships[nvPlace.sel] = { r, c, h: nvPlace.h }; nvNextSel(); }
        else toast('Il chevauche un autre bateau. Essaie une autre case.');
      }
    }
    const v = nvPending || view?.nv; nvPending = null; if (v) renderNavale(v);
  };
  sea.addEventListener('pointerup', end);
  sea.addEventListener('pointercancel', end);
}

function nvSheetBody() {
  const v = nvLastView; if (!v) return '';
  if (tbSheet.kind === 'nv-log') return tbLog(v.log.slice().reverse());
  return tbRows(v.seats.map((s, k) => { const [e, n] = tbSplit(s); return { e, name: n, sub: `${k === v.me ? 'toi · ' : ''}${s.sunk.length} coulé${s.sunk.length > 1 ? 's' : ''} chez l’autre`, score: `${s.left} ⚓`, me: k === v.me }; }));
}
const nvOpenSheet = kind => tbSheet.open(kind, kind === 'nv-log' ? 'Ce qui s’est passé' : 'Les flottes', nvSheetBody);

function renderNavale(v) {
  if (!v) return;
  if (nvDrag || nvDown) { nvPending = v; return; }       // on ne reconstruit pas la grille sous le doigt
  nvLastView = v;
  if (v.phase === 'place' && nvPhase !== 'place') { nvPlace = { ships: {}, sel: 'pa', h: true }; nvAim = null; }
  if (v.phase !== nvPhase) nvAim = null;
  nvPhase = v.phase;
  const root = $('#nv-main'); root.innerHTML = '';
  const me = v.me, mine = v.seats[me], foeK = me < 0 ? -1 : 1 - me, foe = v.seats[foeK], host = v.isHost, desk = tbDesk();
  const say = (list, j = 0) => list[(v.shotNo + j) % list.length];
  const turnSeat = v.seats[v.turn], T = esc(tbSplit(turnSeat)[1]);
  const fresh = v.last && v.last.n !== nvLastShot ? v.last.r * 10 + v.last.c : null; nvLastShot = v.last?.n || 0;

  // ---------------------------------------------------------------- la ligne de partie
  const chips = [];
  if (v.phase === 'play') {
    if (v.log.length) chips.push(tbChip(TB_ICON.log + 'Fil', () => nvOpenSheet('nv-log')));
    if (me >= 0) chips.push(tbChip(`⚓ <b>${foe.sunk.length}</b> à <b>${mine.sunk.length}</b>`, () => nvOpenSheet('nv-fleets'), `Bateaux coulés : toi ${mine.sunk.length}, ${tbSplit(foe)[1]} ${foe.sunk.length}`));
  }
  const left = v.phase === 'place' ? 'Placement des flottes' : v.phase === 'over' ? 'Partie terminée' : `Tir <b>${v.shotNo + 1}</b>${v.replay && desk ? ' · on rejoue si on touche' : ''}`;
  root.appendChild(tbBar(left, chips));

  // ---------------------------------------------------------------- l'adversaire assis en face (les spectateurs voient les deux)
  const seatList = v.seats.map((s, k) => ({ ...s, name: s.bot ? s.name.replace(/^Robot /, '🤖 ') : s.name, k }));
  const table = el('div', 'nvx-table ph-' + v.phase + (me >= 0 ? ' player' : ''));
  table.appendChild(tbSeats(seatList, {
    meId: me >= 0 ? mine.id : null, currentId: v.phase === 'play' ? turnSeat.id : null, since: v.since,
    badge: s => v.phase === 'place' ? '' : `${s.left}`,
    under: s => v.phase === 'place' ? `<span class="tb-tag ${s.ready ? '' : 'soft'}">${s.ready ? 'flotte prête' : 'place sa flotte'}</span>` : '',
    cls: s => v.phase === 'over' && s.id !== v.winner ? 'out' : '',
  }));

  // ---------------------------------------------------------------- la grande grille
  if (v.phase === 'place' && me >= 0 && !mine.ready) {
    const board = nvBoard({ ships: nvPlaced(), cls: 'big mine', label: 'Ta grille : place ta flotte' });
    nvBindPlacement(board.querySelector('.nvx-sea'));
    table.appendChild(board);
  } else if (v.phase === 'place') {
    table.appendChild(nvBoard({ ships: me >= 0 && mine.fleet ? mine.fleet : [], cls: 'big mine' + (me >= 0 ? '' : ' empty'), label: 'Ta flotte' }));
  } else if (me >= 0) {
    // tes tirs chez l'adversaire ; ses bateaux coulés apparaissent, et toute sa flotte à la fin
    const ships = v.phase === 'over' && foe.fleet ? foe.fleet.map(s => ({ ...s, cls: s.sunk ? 'sunk' : 'found' })) : mine.sunk.map(s => ({ ...s, cls: 'sunk' }));
    const board = nvBoard({ marks: mine.shots, ships, aim: v.myTurn ? nvAim : null, fresh: v.last?.by === mine.id ? fresh : null, cls: 'big foe' + (v.myTurn ? ' can' : ''), label: `Tes tirs chez ${tbSplit(foe)[1]}` });
    const sea = board.querySelector('.nvx-sea');
    if (v.myTurn) sea.addEventListener('click', e => {
      const at = nvCellAt(sea, e); if (!at) return;
      const k = at[0] * 10 + at[1];
      if (mine.shots[k]) { toast('Déjà visé. Choisis une autre case.'); return; }
      if (nvAim === k) { nvAim = null; act({ t: 'nv:shoot', r: at[0], c: at[1] }); return; }   // deuxième toucher : feu
      nvAim = k; renderNavale(view.nv);
    });
    board.insertAdjacentHTML('afterbegin', `<p class="nvx-cap">Chez ${esc(tbSplit(foe)[1])}</p>`);
    if (desk) {
      const pair = el('div', 'nvx-pair'), small = nvMyFleet(v, mine, foe, fresh);
      small.insertAdjacentHTML('afterbegin', '<p class="nvx-cap">Ta flotte</p>');
      pair.append(board, small); table.appendChild(pair);
    } else table.appendChild(board);
  } else {
    // les spectateurs : les tirs de chacun, côte à côte
    const duo = el('div', 'nvx-duo');
    v.seats.forEach((s, k) => {
      const ships = v.phase === 'over' && v.seats[1 - k].fleet ? v.seats[1 - k].fleet.map(x => ({ ...x, cls: x.sunk ? 'sunk' : 'found' })) : s.sunk.map(x => ({ ...x, cls: 'sunk' }));
      const b = nvBoard({ marks: s.shots, ships, fresh: v.last?.by === s.id ? fresh : null, cls: 'mid', label: `Les tirs de ${tbSplit(s)[1]}` });
      b.insertAdjacentHTML('afterbegin', `<p class="nvx-cap">Les tirs de ${esc(tbSplit(s)[1])}</p>`);
      duo.appendChild(b);
    });
    table.appendChild(duo);
  }
  root.appendChild(table);

  // ---------------------------------------------------------------- le meneur
  let title = '', line = '', pip = '', hot = false;
  const lastTxt = l => l.res === 'm' ? `${l.at}, à l’eau.` : l.res === 'h' ? `${l.at}, touché !` : `${l.at}, ${l.ship} coulé !`;
  if (v.phase === 'place') {
    if (me < 0) { title = 'Les amiraux placent leur flotte.'; line = 'Tu regardes. La bataille commence dès que les deux sont prêts.'; pip = '👀'; }
    else if (!mine.ready) { title = 'Place ta flotte.'; hot = true; pip = '⚓'; line = desk ? 'Choisis un bateau, puis clique sa première case. Clique un bateau pour le tourner, glisse-le pour le déplacer.' : 'Choisis un bateau, puis touche sa première case. Touche un bateau pour le tourner, glisse-le pour le déplacer.'; }
    else { title = 'Ta flotte est prête.'; pip = '⏳'; line = foe.ready ? 'Ça commence.' : `On attend ${esc(tbSplit(foe)[1])}${foe.bot ? '' : ', qui place la sienne'}.`; }
  } else if (v.phase === 'play') {
    const l = v.last, by = l ? (l.by === mine?.id ? 'Tu' : esc(tbSplit(v.seats.find(s => s.id === l.by))[1])) : '';
    if (me < 0) { title = `${T} tire.`; pip = '👀'; line = l ? `${by} vise ${lastTxt(l)}` : 'Premier tir de la partie.'; }
    else if (v.myTurn) {
      title = 'À toi de tirer.'; hot = true; pip = '🎯';
      line = l && l.by === mine.id && l.res !== 'm' ? `${lastTxt(l)} Tu rejoues.` : l ? `${by === 'Tu' ? 'Tu' : by} ${by === 'Tu' ? 'vises' : 'vise'} ${lastTxt(l)} ` + say(['Touche une case, puis confirme.', 'Vise, puis feu.']) : say(['Premier tir. Touche une case, puis confirme.', 'À toi d’ouvrir le feu.']);
      if (nvAim != null) line = `Tu vises ${Navale.label(Math.floor(nvAim / 10), nvAim % 10)}. Touche-la encore, ou appuie sur Feu.`;
    } else {
      title = `${T} tire.`; pip = '⏳';
      line = l ? `${by} ${by === 'Tu' ? 'vises' : 'vise'} ${lastTxt(l)}` : say(['Croise les doigts.', 'Tes bateaux retiennent leur souffle.']);
      if (turnSeat.bot) line += ' ' + say(['Le robot calcule ses coordonnées.', 'Le robot vise. Il ne tremble jamais.'], 1);
    }
  } else if (v.phase === 'over') {
    const won = mine && v.winner === mine.id, W = v.seats.find(s => s.id === v.winner);
    title = won ? 'Tu as coulé toute sa flotte.' : me >= 0 ? `${esc(tbSplit(W)[1])} a coulé ta flotte.` : `${esc(tbSplit(W)[1])} gagne.`; pip = won ? '🏆' : '🌊'; hot = won;
    line = `${Object.values(W.shots).filter(x => x).length} tirs pour couler les cinq bateaux. Les deux flottes sont dévoilées. Revanche ? Tout se passe au salon.`;
  }
  root.appendChild(tbSay({ title, line, pip, hot }));

  // ---------------------------------------------------------------- le plateau : ta flotte en petit, et ce que tu peux faire
  if (me >= 0) {
    const acts = [];
    let body = null, leftT = '', rightT = '';
    if (v.phase === 'place' && !mine.ready) {
      const cur = Navale.SHIPS.find(x => x.k === nvPlace.sel);
      leftT = cur ? `<b>${NV_NAME[cur.k]}</b> · ${cur.len} cases` : 'Ta flotte'; rightT = `${nvPlaced().length} sur 5 placés`;
      body = el('div', 'nvx-picks');
      Navale.SHIPS.forEach(s => {
        const on = nvPlace.sel === s.k, done = !!nvPlace.ships[s.k];
        const b = el('button', `nvx-pick${on ? ' on' : ''}${done ? ' done' : ''}`, `<span class="nvx-hull ${s.k}" style="--l:${s.len}">${nvImg(s.k)}<i></i></span><span class="nvx-pick-t">${NV_NAME[s.k]}<small>${s.len} cases${done ? ' · placé' : ''}</small></span><b class="nvx-pick-n">${s.len}</b>`);
        b.setAttribute('aria-label', `${NV_NAME[s.k]}, ${s.len} cases${done ? ', placé' : ''}`);
        b.type = 'button'; b.setAttribute('aria-pressed', String(on));
        b.onclick = () => { if (done) { nvPlace.h = nvPlace.ships[s.k].h; nvPlace.ships[s.k] = null; } nvPlace.sel = s.k; renderNavale(view.nv); };
        body.appendChild(b);
      });
      acts.push(tbBtn('glass', nvPlace.h ? 'Tourner ↕' : 'Tourner ↔', () => { nvPlace.h = !nvPlace.h; renderNavale(view.nv); }));
      acts.push(tbBtn('glass', 'Au hasard', () => { Navale.randomFleet().forEach(s => { nvPlace.ships[s.k] = { r: s.r, c: s.c, h: s.h }; }); nvPlace.sel = null; renderNavale(view.nv); }));
      const ready = tbBtn('hero', 'Prêt', () => act({ t: 'nv:fleet', ships: nvPlaced() }));
      ready.disabled = nvPlaced().length < 5; acts.push(ready);
    } else if (v.phase === 'place') {
      leftT = 'Ta flotte est prête'; rightT = foe.ready ? '' : 'en attente';
      if (!foe.ready) acts.push(tbBtn('glass', 'Modifier ma flotte', () => { nvPlace = { ships: Object.fromEntries(mine.fleet.map(s => [s.k, { r: s.r, c: s.c, h: s.h }])), sel: null, h: true }; act({ t: 'nv:edit' }); }));
    } else {
      // ta flotte en petit, avec les tirs reçus
      const afloat = mine.fleet.filter(s => !s.sunk).length;
      leftT = `Ta flotte · <b>${afloat} bateau${afloat > 1 ? 'x' : ''} à flot</b>`;
      rightT = v.last && v.last.by !== mine.id ? `${esc(tbSplit(foe)[1])} : ${lastTxt(v.last)}` : '';
      if (!desk) body = nvMyFleet(v, mine, foe, fresh);
      if (v.myTurn) { const f = tbBtn('hero', nvAim != null ? `Feu sur ${Navale.label(Math.floor(nvAim / 10), nvAim % 10)}` : 'Choisis une case', () => { if (nvAim == null) return; const k = nvAim; nvAim = null; act({ t: 'nv:shoot', r: Math.floor(k / 10), c: k % 10 }); }); f.disabled = nvAim == null; acts.push(f); }
      if (v.phase === 'over' && host) acts.push(tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })));
    }
    const tray = tbTray({ left: leftT, right: rightT, body, acts });
    tray.classList.add('nvx-tray', 'ph-' + v.phase);
    root.appendChild(tray);
  } else if (v.phase === 'over' && host) root.appendChild(tbTray({ acts: [tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' }))] }));

  // ---------------------------------------------------------------- colonne de droite (PC) : les flottes et le fil
  const side = el('div', 'nv-side');
  side.appendChild(el('p', 'mj-side-title', 'Les amiraux'));
  side.insertAdjacentHTML('beforeend', tbRows(v.seats.map((s, k) => { const [e, n] = tbSplit(s); return { e, name: n, sub: [k === me ? 'toi' : '', v.phase === 'place' ? (s.ready ? 'flotte prête' : 'place sa flotte') : `${s.sunk.length} coulé${s.sunk.length > 1 ? 's' : ''} chez l’autre`, s.online ? '' : 'absent'].filter(Boolean).join(' · '), score: v.phase === 'place' ? '' : `${s.left} ⚓`, me: k === me }; })));
  if (v.watchers.length) side.insertAdjacentHTML('beforeend', `<p class="nvx-watch">Regardent : ${v.watchers.map(w => esc(tbSplit(w)[1])).join(', ')}</p>`);
  root.appendChild(side);
  if (v.log.length) {
    const lg = el('div', 'nv-log');
    lg.appendChild(el('p', 'mj-side-title', 'Ce qui s’est passé'));
    lg.insertAdjacentHTML('beforeend', tbLog(v.log.slice().reverse()));
    root.appendChild(lg);
  }
  if (tbSheet.kind === 'nv-log' || tbSheet.kind === 'nv-fleets') tbSheet.refresh(v.phase === 'play');
}
