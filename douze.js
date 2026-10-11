// Douze : affichage et commandes. Les règles du jeu sont dans engines/douze.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
// Tout l'écran est la table (table.js / table.css) : les autres assis en arc en haut, chacun avec sa petite
// grille, la pioche, la carte en main et la défausse au milieu du tapis, ta grille en grand dans le plateau
// de verre en bas. Scores et fil s'ouvrent dans la feuille sur téléphone ; sur PC ils sont à droite (desk.js).
let dzLastRound = null, dzSkipTimer = null;
let dzLastView = null, dzTurnKey = null, dzTurnSince = 0, dzPrevMine = [], dzPrevTop = null, dzTakenKey = null;
const DZ_SKIP_MS = 30000;
const dzTone = v => v <= -1 ? 'n' : v === 0 ? 'z' : v <= 4 ? 'g' : v <= 8 ? 'y' : 'r';
const dzNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
const dzNum = n => String(n).replace('-', '−');                      // un vrai signe moins, comme sur les cartes
const dzPts = n => `${dzNum(n)} point${Math.abs(n) > 1 ? 's' : ''}`;

// une carte : face (couleur selon la valeur, coins sur les grandes), dos à motif, ou case vide (colonne retirée)
function dzCardHTML(c, mini = false, extra = '') {
  const m = mini ? ' mini' : '', x = extra ? ' ' + extra : '';
  if (!c) return `<span class="dzx-card gone${m}${x}"></span>`;
  if (!c.up) return `<span class="dzx-card back${m}${x}"><b></b></span>`;
  const n = String(c.v).replace('-', '−');
  return `<span class="dzx-card t-${dzTone(c.v)}${n.length > 1 ? ' two' : ''}${m}${x}">${mini ? '' : `<i class="dzx-c">${n}</i><i class="dzx-c end">${n}</i>`}<b>${n}</b></span>`;
}
const dzMini = grid => `<span class="dzx-mini" aria-hidden="true">${grid.map(c => dzCardHTML(c, true)).join('')}</span>`;

// la feuille des scores ou du fil (téléphone)
function dzSheetBody(kind) {
  const v = dzLastView;
  if (!v) return '';
  if (kind === 'dz-log') return tbLog(v.log.slice().reverse());
  const rows = v.players.slice().sort((a, b) => a.score - b.score).map(p => {
    const [e, n] = tbSplit(p);
    const tag = p.current ? ' · joue' : p.closer ? ' · a fermé' : '';
    return { e, name: n, me: p.me, score: p.score, sub: `${p.me ? 'toi · ' : ''}${p.sum} en vue · ${p.upCount} sur ${p.total} retournée${p.upCount > 1 ? 's' : ''}${tag}` };
  });
  return `<p class="tb-sheet-say">Manche ${v.round}, fin à ${v.target} points. Le plus petit total gagne.</p>${tbRows(rows)}`;
}
const dzOpenSheet = kind => tbSheet.open(kind, kind === 'dz-log' ? 'Ce qui s’est passé' : 'Scores', () => dzSheetBody(kind));

function renderDouze(v) {
  if (!v) return;
  dzLastView = v;
  const root = $('#dz-main'); root.innerHTML = '';
  clearTimeout(dzSkipTimer);
  if (v.round !== dzLastRound) { dzLastRound = v.round; dzPrevMine = []; dzPrevTop = null; dzTakenKey = null; }
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me, C = esc(v.currentName), Cn = esc(tbSplit({ name: v.currentName })[1]);
  const say = list => list[(v.round - 1) % list.length];              // une réplique stable pendant toute la manche
  const playing = v.phase === 'reveal' || v.phase === 'play';
  const mine = v.players.find(p => p.me);

  // la ligne de partie, et sur téléphone les deux puces qui ouvrent le fil et les scores
  const left = v.phase === 'over' ? `Partie terminée · manche <b>${v.round}</b>` : v.phase === 'result' ? `Fin de la manche <b>${v.round}</b><span class="dzx-wide"> · fin à ${v.target} points</span>`
    : `Manche <b>${v.round}</b><span class="dzx-wide"> · fin à ${v.target} points</span>${v.closerName && v.phase === 'play' ? ' · dernier tour' : ''}`;
  const chips = [];
  if (playing) {
    if (v.log.length) chips.push(tbChip(TB_ICON.log + 'Fil', () => dzOpenSheet('dz-log')));
    chips.push(tbChip(`${TB_ICON.trophy}<b>${mine ? mine.score : 0}</b> pts`, () => dzOpenSheet('dz-scores'), 'Scores'));
  }
  root.appendChild(tbBar(left, chips));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', hot = false, prog = null, pip = '';
  const curP = v.players.find(p => p.id === v.currentId);
  if (v.phase === 'reveal') {
    const live = v.players.filter(p => p.online), done = live.filter(p => p.revealed);
    prog = [done.length, live.length]; pip = '👀';
    if (!me.inRound) { title = 'Chacun retourne deux cartes.'; line = 'Tu regardes cette manche, tu joueras à la suivante.'; }
    else if (me.upCount < 2) {
      title = me.upCount ? 'Encore une.' : 'Retourne deux cartes.'; hot = true; pip = '✋';
      line = say(['Deux au choix. Prie pour des négatifs.', 'Au hasard, ou au flair.', 'Le plus haut total visible commence.']);
    } else {
      const wait = live.filter(p => !p.revealed).map(p => p.name);
      title = 'Chacun retourne deux cartes.'; line = wait.length ? `Plus que ${esc(dzNames(wait))}.` : 'C’est parti.';
    }
  } else if (v.phase === 'play') {
    const last = !v.closerName ? '' : v.players.some(p => p.closer && p.me) ? 'Dernier tour, tu as tout retourné. ' : `Dernier tour, ${esc(v.closerName)} a tout retourné. `;
    pip = curP ? tbSplit(curP)[0] : '';
    if (!me.inRound) { title = `${Cn} joue.`; line = 'Tu regardes cette manche, tu joueras à la suivante.'; }
    else if (!v.myTurn) { title = `${Cn} joue.`; line = last || say(['Surveille la défausse.', 'Compte ses cartes rouges.', 'Pendant ce temps, fais tes calculs.']); }
    else {
      hot = true; pip = '✋';
      if (v.mustFlip) { title = 'À toi.'; line = last + 'Retourne une carte cachée, et croise les doigts.'; pip = '🤞'; }
      else if (v.taken) {
        const t = v.taken.v;
        title = `Un ${t} en main.`; pip = '🃏';
        line = last + (v.taken.from === 'discard' ? 'Pris dans la défausse, il doit trouver sa place.'
          : t >= 9 ? 'Aïe. Case-le quelque part, ou défausse-le.' : t <= 0 ? 'Une aubaine. Trouve-lui une place.' : 'Pose-le sur une de tes cartes, ou défausse-le.');
      } else { title = 'À toi.'; line = last + (v.top !== null ? `Pioche, ou prends le ${v.top} de la défausse.` : 'Pioche.'); }
    }
  } else if (v.result) {
    const r = v.result, best = r.rows[0], doubled = r.rows.find(x => x.doubled), meClosed = r.closerId === net.me;
    if (v.phase === 'result') {
      title = best.id === net.me ? 'Tu fais le plus petit score.' : `${esc(best.name)} fait le plus petit score.`;
      hot = best.id === net.me; pip = hot ? '🎉' : '🏁';
      line = doubled ? (meClosed ? 'Tu as fermé sans avoir le plus petit total. Ton score double.' : `${esc(r.closerName)} a fermé sans avoir le plus petit total. Son score double.`)
        : best.id === r.closerId ? (meClosed ? 'Tu as fermé la manche, et ça paie.' : `${esc(r.closerName)} a fermé la manche, et ça paie.`)
          : (meClosed ? 'Tu as fermé la manche.' : `${esc(r.closerName)} a fermé la manche.`);
    } else {
      const w = v.scores[0];
      title = w?.id === net.me ? 'Tu gagnes la partie.' : `${esc(w?.name || '')} gagne la partie.`;
      hot = w?.id === net.me; pip = '🏆';
      line = `${w?.score ?? 0} points, le plus bas de la table. Revanche ? Tout se passe au salon.`;
    }
  }
  const status = tbSay({ title, line, pip, hot });
  if (prog && prog[1] > 0) status.lastElementChild.appendChild(el('div', 'mj-prog', `${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]}</span>`));

  if (playing) {
    // le temps qui file autour de celui qui joue (30 s, après quoi l'hôte peut passer son tour)
    const turnKey = `${v.round}|${v.phase}|${v.currentId}|${v.seq}`;
    if (turnKey !== dzTurnKey) { dzTurnKey = turnKey; dzTurnSince = Date.now() - (v.quiet || 0); }

    // les autres, assis en arc, chacun avec sa petite grille et son total visible
    const seats = tbSeats(v.players, {
      currentId: v.phase === 'play' ? v.currentId : null, since: dzTurnSince,
      badge: p => dzNum(p.sum),
      cls: p => v.phase === 'reveal' && !p.revealed && p.online ? 'dzx-wait' : '',
      under: p => dzMini(p.grid) + (p.closer ? '<span class="tb-tag dzx-flag">a fermé</span>' : v.phase === 'reveal' && !p.revealed && p.online ? '<span class="tb-tag soft dzx-flag">retourne</span>' : ''),
    });
    // selon le nombre d'adversaires : jusqu'à 3, sur PC, la grille à côté de l'avatar ; 5 et plus, sur téléphone, une rangée qui défile
    const m = seats.children.length;
    seats.classList.add('dzx-opps', 'dzx-n' + Math.min(m, 6), m <= 3 ? 'dzx-few' : m <= 5 ? 'dzx-mid' : 'dzx-lots');
    if (m >= 5) seats.classList.add('dzx-strip');
    const nowSeat = seats.querySelector('.tb-opp.now:not(.bot)');            // tbSeats compte sur 20 s, Douze en laisse 30
    if (nowSeat) nowSeat.style.setProperty('--since', `${-Math.min(30, (Date.now() - dzTurnSince) / 1000).toFixed(2)}s`);
    root.appendChild(seats);
    // dans la rangée qui défile, celui qui joue reste en vue
    const nowOpp = seats.classList.contains('dzx-strip') && seats.scrollWidth > seats.clientWidth ? seats.querySelector('.tb-opp.now') : null;
    if (nowOpp) seats.scrollLeft = nowOpp.offsetLeft - (seats.clientWidth - nowOpp.offsetWidth) / 2;

    // le centre du tapis : la pioche, la carte en main, la défausse
    const canPick = v.phase === 'play' && v.myTurn && !v.taken && !v.mustFlip;
    const center = el('div', 'dzx-center');
    center.appendChild(el('span', 'dzx-halo', ''));
    const deck = el('button', 'dzx-pile dzx-deck' + (canPick ? ' can' : ''), `<span class="dzx-stack">${dzCardHTML({ up: false })}${dzCardHTML({ up: false })}${dzCardHTML({ up: false })}<b class="dzx-count">${v.drawLeft}</b></span><span class="dzx-lbl">${canPick ? 'Piocher' : 'Pioche'}</span>`);
    deck.type = 'button'; deck.setAttribute('aria-label', `Pioche, ${v.drawLeft} cartes`); deck.disabled = !canPick;
    deck.onclick = () => { if (v.myTurn && !v.taken && !v.mustFlip) act({ t: 'dz:draw' }); };
    // la carte en main n'arrive en sautant que lorsqu'elle est nouvelle
    const takenKey = v.taken ? `${v.round}|${v.currentId}|${v.taken.from}|${v.taken.v}` : null;
    const freshTaken = takenKey && takenKey !== dzTakenKey; dzTakenKey = takenKey;
    const hand = el('div', 'dzx-hand' + (v.taken ? ' has' : '') + (v.taken && v.myTurn ? ' mine' : ''),
      v.taken ? `${dzCardHTML({ up: true, v: v.taken.v }, false, freshTaken ? 'pop' : '')}<span class="dzx-lbl">${v.myTurn ? (v.taken.from === 'draw' ? 'Ta pioche' : 'Ta prise') : (v.taken.from === 'draw' ? 'Piochée' : 'Prise')}</span>`
        : `<span class="dzx-card slot"></span><span class="dzx-lbl">En main</span>`);
    const freshTop = v.top !== null && dzPrevTop !== null && `${v.top}|${v.drawLeft}` !== dzPrevTop;
    dzPrevTop = v.top === null ? null : `${v.top}|${v.drawLeft}`;
    const disc = el('button', 'dzx-pile dzx-discard' + (canPick && v.top !== null ? ' can' : ''),
      (v.top === null ? '<span class="dzx-card gone"></span>' : dzCardHTML({ up: true, v: v.top }, false, freshTop ? 'pop' : '')) + `<span class="dzx-lbl">${canPick && v.top !== null ? 'Prendre' : 'Défausse'}</span>`);
    disc.type = 'button'; disc.setAttribute('aria-label', v.top === null ? 'Défausse vide' : `Défausse, un ${v.top}`); disc.disabled = !(canPick && v.top !== null);
    if (v.top !== null) disc.firstElementChild.style.rotate = `${tbTilt(`${v.round}-${v.drawLeft}-${v.top}`, 8).toFixed(1)}deg`;
    disc.onclick = () => { if (v.myTurn && !v.taken && !v.mustFlip && v.top !== null) act({ t: 'dz:take' }); };
    center.append(deck, hand, disc);
    root.appendChild(center);
    root.appendChild(status);

    // ta grille, en grand, dans le plateau de verre
    const acts = [];
    if (canPick) {
      acts.push(tbBtn('hero', 'Piocher', () => act({ t: 'dz:draw' })));
      if (v.top !== null) acts.push(tbBtn('glass', `Prendre le ${String(v.top).replace('-', '−')}`, () => act({ t: 'dz:take' })));
    }
    if (v.myTurn && v.taken && v.taken.from === 'draw') acts.push(tbBtn('glass', '<span>Défausser <span class="dzx-sub">et retourner une carte</span></span>', () => act({ t: 'dz:discard' })));
    // l'hôte peut débloquer un joueur absent
    if (v.isHost && v.phase === 'play' && !v.myTurn) {
      const cur = v.players.find(p => p.id === v.currentId);
      if (cur && !cur.bot) {
        // le temps écoulé se compte depuis le début du tour (dzTurnSince), pas depuis la dernière diffusion
        const quiet = Date.now() - dzTurnSince;
        if (quiet > DZ_SKIP_MS) acts.push(tbBtn('glass', `${esc(cur.name)} traîne ? Passer son tour`, () => act({ t: 'dz:skip' })));
        else dzSkipTimer = setTimeout(() => { if (view?.dz) renderDouze(view.dz); }, DZ_SKIP_MS - quiet + 200);
      }
    }

    if (me.inRound) {
      const canFlip = (v.phase === 'reveal' && me.upCount < 2) || (v.myTurn && v.mustFlip);
      const canSwap = v.myTurn && !!v.taken;
      const grid = el('div', 'dzx-grid' + (canSwap ? ' swap' : canFlip ? ' flip' : ''));
      me.grid.forEach((c, i) => {
        const was = dzPrevMine[i], now = c ? (c.up ? 'u' + c.v : 'h') : null;
        const ok = c && ((canFlip && !c.up) || canSwap), no = c && canFlip && c.up;
        const b = el('button', 'dzx-cell' + (ok ? ' ok' : '') + (no ? ' no' : ''), dzCardHTML(c, false, was !== undefined && was !== now && c?.up ? 'flip' : ''));
        b.type = 'button';
        b.setAttribute('aria-label', !c ? 'Colonne retirée' : c.up ? `Ta carte ${c.v}` : 'Carte cachée');
        if (!c) b.disabled = true;
        b.onclick = () => {
          if (!c) return;
          if (canSwap) act({ t: 'dz:swap', i });
          else if (canFlip) { if (c.up) toast('Celle-là est déjà visible.'); else act({ t: 'dz:flip', i }); }
          else if (v.myTurn) toast('Pioche ou prends la défausse d’abord.');
        };
        grid.appendChild(b);
      });
      dzPrevMine = me.grid.map(c => c ? (c.up ? 'u' + c.v : 'h') : null);
      const n = me.grid.filter(Boolean).length;
      const hint = canSwap ? 'Touche la case à remplacer' : canFlip ? (v.phase === 'reveal' ? (me.upCount ? 'Encore une carte' : 'Touche deux cartes') : 'Touche une carte cachée')
        : `${me.upCount} sur ${n} retournée${me.upCount > 1 ? 's' : ''}`;
      root.appendChild(tbTray({ left: `Ta grille · <b>${dzPts(me.sum)}</b> en vue`, right: hint, body: grid, acts }));
    } else if (acts.length) root.appendChild(tbTray({ acts }));

    // les joueurs et le fil (colonne de droite sur PC ; sur téléphone, les puces ouvrent la feuille)
    const side = el('div', 'dz-players');
    side.appendChild(el('p', 'mj-side-title', `Manche ${v.round} · fin à ${v.target} points${v.closerName && v.phase === 'play' ? ' · dernier tour' : ''}`));
    side.insertAdjacentHTML('beforeend', tbRows(v.players.slice().sort((a, b) => a.score - b.score).map(p => {
      const [e, n] = tbSplit(p);
      const tag = p.current ? ' · joue' : p.closer ? ' · a fermé' : v.phase === 'reveal' && !p.revealed && p.online ? ' · retourne' : '';
      return { e, name: n, me: p.me, score: p.score, sub: `${p.me ? 'toi · ' : ''}${p.sum} en vue · ${p.upCount} sur ${p.total}${tag}` };
    })));
    root.appendChild(side);
  } else root.appendChild(status);

  if (v.phase === 'result' || v.phase === 'over') {
    const r = v.result;
    if (r) {
      const box = el('div', 'dz-verdict');
      box.appendChild(el('p', 'mj-side-title', `Manche ${v.round}`));
      const list = el('div', 'mj-list');
      r.rows.forEach(row => {
        const p = v.players.find(q => q.id === row.id);
        list.appendChild(el('div', 'mj-row dzx-row' + (row.doubled ? ' doubled' : '') + (row.id === net.me ? ' me' : ''),
          `<div class="dzx-row-head"><b>${esc(row.name)}${row.id === r.closerId ? '<i>a fermé</i>' : ''}</b>${row.doubled ? `<span class="neg">${row.raw} × 2, score doublé</span>` : ''}</div><strong class="dzx-row-pts">${row.points}</strong>${dzMini(p?.grid || [])}`));
      });
      box.appendChild(list); root.appendChild(box);
    }
    if (v.isHost) root.appendChild(v.phase === 'over' ? btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })) : btn('primary lg', 'Manche suivante', () => act({ t: 'dz:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));

    const sc = el('div', 'dz-scores');
    sc.appendChild(el('p', 'mj-side-title', v.phase === 'over' ? 'Classement final · le plus bas gagne' : `Totaux · fin à ${v.target} points`));
    const sl = el('div', 'mj-list');
    v.scores.forEach((s, i) => sl.appendChild(el('div', 'mj-row dzx-score-row' + (i === 0 && v.phase === 'over' ? ' lead' : '') + (s.id === net.me ? ' me' : ''),
      `<span class="dzx-score-name">${s.bot ? '🤖 ' : ''}${esc(s.name)}${s.id === net.me ? ' <small>toi</small>' : ''}</span>${s.last !== null && s.last !== undefined ? `<span class="dzx-score-last">${s.last > 0 ? '+' : ''}${s.last}</span>` : ''}<b class="dzx-score-total">${s.score}</b>`)));
    sc.appendChild(sl);
    root.appendChild(sc);
  }

  if (v.log.length) {
    const lg = el('div', 'dz-log');
    lg.appendChild(el('p', 'mj-side-title', 'Ce qui s’est passé'));
    lg.insertAdjacentHTML('beforeend', tbLog(v.log.slice().reverse()));
    root.appendChild(lg);
  }

  // la feuille ouverte suit la partie ; hors manche elle n'a plus lieu d'être
  if (tbSheet.kind && tbSheet.kind.startsWith('dz-')) tbSheet.refresh(playing);
}
