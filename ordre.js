// Dans l'ordre : affichage et commandes. Les règles sont dans engines/ordre.js, les cartes dans ordre-cartes.js.

'use strict';

// ============================================================ écran
// Tout l'écran est la table (table.js, table.css) : la course aux lettres en haut (l'équipe contre le jeu), les
// joueurs, le meneur, puis les cinq cartes à glisser du doigt dans la colonne « 1 j'adore … 5 j'aime pas », et le
// plateau de verre en bas. Le classeur range ses cartes sur son seul téléphone ; les autres déplacent ensemble un
// classement commun. La liste des cartes n'est JAMAIS reconstruite pendant qu'un doigt est posé dessus : seules leurs
// positions changent, et un geste en cours n'est pas dérangé par ceux des autres.
let odSk = null, odRound = -1, odDraft = null, odDrag = null, odLast = null, odMoveSeen = 0;
let odRev = { key: '', n: 0, done: true, timers: [] }, odTrayKey = '';
const OD_NB = ' ';
const odName = p => esc(tbSplit(p)[1]);
const odRanks = [['1', 'j’adore'], ['2', ''], ['3', ''], ['4', ''], ['5', 'j’aime pas']];

function odBuild(root) {
  root.innerHTML = '';
  const add = (tag, cls) => root.appendChild(el(tag, cls));
  odSk = { bar: add('div', 'odx-barbox'), race: add('section', 'odx-race'), seats: add('div', 'odx-seats'), say: add('div', 'odx-saybox'), board: add('div', 'odx-board'), tray: add('div', 'odx-traybox'), side: add('aside', 'odx-side') };
  odSk.race.setAttribute('aria-label', 'Les lettres gagnées');
  odSk.board.innerHTML = `<div class="odx-ranks" aria-hidden="true">${odRanks.map(([n, w]) => `<div class="odx-rank">${n}${w ? `<small>${w}</small>` : ''}</div>`).join('')}</div><ol class="odx-list" aria-label="Les cinq cartes, de la préférée à la moins aimée"></ol>`;
  odSk.list = odSk.board.querySelector('.odx-list');
  odSk.cardsKey = ''; odTrayKey = '';
  odBindDrag(odSk.list);
}

// ---------------------------------------------------------------- l'ordre affiché : le brouillon du classeur, ou le classement commun
const odMine = v => v.me?.ranker && v.phase === 'rank' && !v.ranked;
const odOrder = v => odMine(v) ? odDraft : v.guess;
const odCanDrag = v => !!v.me?.inGame && (odMine(v) || (!v.me.ranker && (v.phase === 'rank' || v.phase === 'guess')));
const odStep = () => { const c = odSk.list.querySelector('.odx-card'); return c ? c.offsetHeight + 8 : 72; };

function odPlace(order, skip) {
  const step = odStep();
  order.forEach((id, i) => {
    const c = odSk.list.querySelector(`.odx-card[data-id="${id}"]`);
    if (!c) return;
    c.style.setProperty('--y', `${i * step}px`);
    if (c !== skip) c.style.transform = `translateY(${i * step}px)`;
    c.setAttribute('aria-label', `${i + 1} : ${c.dataset.t}`);
  });
}

// ---------------------------------------------------------------- glisser une carte (doigt ou souris)
function odBindDrag(list) {
  list.addEventListener('pointerdown', e => {
    const c = e.target.closest('.odx-card'), v = odLast;
    if (!c || !v || !odCanDrag(v)) return;
    e.preventDefault(); c.setPointerCapture(e.pointerId);
    const order = [...odOrder(v)], id = +c.dataset.id, from = order.indexOf(id);
    odDrag = { c, id, y0: e.clientY, base: from * odStep(), idx: from, from, order };
    c.classList.add('drag'); c.querySelector('.odx-who')?.remove();
  });
  list.addEventListener('pointermove', e => {
    const d = odDrag; if (!d) return;
    const step = odStep(), y = Math.max(-12, Math.min(4 * step + 12, d.base + e.clientY - d.y0));
    d.c.style.transform = `translateY(${y}px) scale(1.03)`;
    const idx = Math.max(0, Math.min(4, Math.round(y / step)));
    if (idx !== d.idx) { d.order.splice(d.order.indexOf(d.id), 1); d.order.splice(idx, 0, d.id); d.idx = idx; odPlace(d.order, d.c); navigator.vibrate?.(6); }
  });
  const drop = () => {
    const d = odDrag; if (!d) return;
    odDrag = null; d.c.classList.remove('drag');
    const v = odLast;
    if (odMine(v)) odDraft = d.order;
    else if (d.idx !== d.from) { v.guess = d.order; act({ t: 'od:move', card: d.id, to: d.idx }); }
    odPlace(odOrder(v));
  };
  list.addEventListener('pointerup', drop); list.addEventListener('pointercancel', drop);
  // au clavier : une carte prise en main monte ou descend avec les flèches
  list.addEventListener('keydown', e => {
    const c = e.target.closest('.odx-card'), v = odLast;
    if (!c || !v || !odCanDrag(v) || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const order = [...odOrder(v)], id = +c.dataset.id, from = order.indexOf(id), to = Math.max(0, Math.min(4, from + (e.key === 'ArrowUp' ? -1 : 1)));
    if (to === from) return;
    order.splice(from, 1); order.splice(to, 0, id);
    if (odMine(v)) odDraft = order; else { v.guess = order; act({ t: 'od:move', card: id, to }); }
    odPlace(order);
  });
}

// ---------------------------------------------------------------- la révélation, carte après carte
function odRevealRun(v) {
  const key = String(v.round);                              // une seule révélation par manche (la fin de partie la prolonge)
  if (odRev.key === key) return;
  odRev.timers.forEach(clearTimeout);
  odRev = { key, n: 0, done: false, timers: [] };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, gap = reduce ? 120 : 700;
  for (let i = 0; i < 5; i++) odRev.timers.push(setTimeout(() => { odRev.n = i + 1; navigator.vibrate?.(v.result?.ok[i] ? 10 : [8, 30, 8]); if (odLast) renderOrdre(odLast); }, 500 + i * gap));
  odRev.timers.push(setTimeout(() => { odRev.done = true; if (odLast) renderOrdre(odLast); }, 900 + 5 * gap));
}

function odSheetBody() {
  const v = odLast; if (!v) return '';
  // les manches jouées (avec le vrai classement de chacune), puis le fil
  const hist = v.history.length ? `<ol class="odx-hist">${v.history.slice().reverse().map(h => `<li class="${h.win ? 'win' : 'lose'}"><b>Manche ${h.round}</b> · ${esc(tbSplit({ name: h.ranker })[1])} · ${h.good}/5${h.truth ? `<small>${h.truth.map((c, i) => `${i + 1}. ${esc(c[0])} ${esc(c[1])}`).join('<br>')}</small>` : ''}</li>`).join('')}</ol>` : '';
  return `<p class="tb-sheet-say">${odRule(v)}</p>${hist}${tbLog(v.log.slice().reverse())}`;
}
const odRule = v => v.soft ? 'Règle douce : quatre cartes bien placées sur cinq suffisent.' : 'Règle normale : il faut les cinq cartes bien placées.';
const odOpenSheet = () => tbSheet.open('od-log', 'La partie', odSheetBody);

function renderOrdre(v) {
  if (!v) return;
  odLast = v;
  const root = $('#od-main');
  if (!odSk || !root.contains(odSk.list)) odBuild(root);
  const S = odSk, me = v.me || {}, R = v.ranker || {}, rn = odName(R), host = v.isHost;
  const done = v.phase === 'reveal' || v.phase === 'over';
  if (v.round !== odRound) { odRound = v.round; odDraft = v.cards.map(c => c.id); }
  if (done) odRevealRun(v); else if (odRev.key) { odRev.timers.forEach(clearTimeout); odRev = { key: '', n: 0, done: true, timers: [] }; }
  const shown = done && odRev.done;                        // la révélation est allée au bout
  const say = (list, j = 0) => list[(v.round + j) % list.length];

  // ---------------------------------------------------------------- la ligne de partie
  const chips = [];
  if (v.log.length) chips.push(tbChip(TB_ICON.log + 'Fil', odOpenSheet));
  const mode = tbChip(`Mode <b>${v.soft ? 'doux' : 'normal'}</b>`, host && v.phase !== 'over' ? () => act({ t: 'od:soft', on: !v.soft }) : null, host ? (v.soft ? 'Mode doux : 4 cartes sur 5 suffisent. Passer en mode normal' : 'Mode normal : il faut les 5 cartes. Passer en mode doux') : null);
  chips.unshift(mode);
  S.bar.replaceChildren(tbBar(v.phase === 'over' ? 'Partie terminée' : `Manche <b>${v.round}</b>`, chips));

  // ---------------------------------------------------------------- la course aux lettres (le score ne bouge qu'après la révélation)
  const pend = done && !shown && v.result ? (v.result.win ? [1, 0] : [0, 1]) : [0, 0];
  const us = v.us - pend[0], them = v.them - pend[1];
  const word = (n, cls) => `<div class="odx-word ${cls}">${[...v.word].map((L, i) => `<i class="${i < n ? 'on' : ''}${shown && v.result && i === n - 1 && ((cls === 'us') === v.result.win) ? ' new' : ''}">${L}</i>`).join('')}</div>`;
  S.race.innerHTML = `<span>Vous</span>${word(us, 'us')}<span>Le jeu</span>${word(them, 'them')}`;

  // ---------------------------------------------------------------- les joueurs
  S.seats.innerHTML = v.players.map(p => {
    const [e, n] = tbSplit(p), isR = p.id === R.id, voted = v.votes.includes(p.id);
    const st = isR ? (v.phase === 'rank' ? 'classe' : 'se tait') : voted ? 'd’accord' : p.online ? '' : 'absent';
    return `<div class="odx-seat${isR ? ' ranker' : ''}${voted ? ' voted' : ''}${p.online ? '' : ' off'}"><span class="odx-av">${e}${isR ? '<em aria-hidden="true">🤫</em>' : voted ? '<em class="ok" aria-hidden="true">✓</em>' : ''}</span><b>${p.id === net.me ? 'Toi' : esc(n)}</b><small>${st}</small></div>`;
  }).join('');

  // ---------------------------------------------------------------- le meneur
  let title = '', line = '', pip = '', hot = false;
  const voters = v.voters.length, agreed = v.votes.filter(id => v.voters.includes(id)).length;
  if (v.phase === 'rank') {
    if (odMine(v)) { title = 'À toi de classer, en secret.'; line = 'Glisse les cartes : en haut ce que tu préfères, en bas ce que tu aimes le moins.'; pip = '🤫'; hot = true; }
    else if (!me.inGame) { title = `${rn} classe en secret.`; line = 'Tu regardes cette partie.'; pip = '👀'; }
    else { title = `${rn} classe en secret.`; pip = '⏳'; line = say(['Vous pouvez déjà en parler, et placer les cartes.', 'Regardez-le bien : il a l’air de quoi ?', 'Commencez à ranger, il ne voit rien.']); }
  } else if (v.phase === 'guess') {
    if (me.ranker) { title = 'Les autres débattent.'; line = say(['Pas un mot. Pas une grimace.', 'Tu regardes, et tu te tais.', 'Garde ton air innocent.']); pip = '🤐'; }
    else if (!me.inGame) { title = `Ils cherchent l’ordre de ${rn}.`; line = 'Tu regardes cette partie.'; pip = '👀'; }
    else { title = `Retrouvez l’ordre de ${rn} !`; pip = '🗣️'; hot = !me.voted; line = agreed ? `${agreed} sur ${voters} d’accord. Un geste, et on repart de zéro.` : say(['Discutez, déplacez les cartes, puis validez tous ensemble.', 'Débattez ! Chaque carte déplacée se voit chez tous.', 'Mettez-vous d’accord, puis validez.']); }
  } else if (done && !shown) { title = me.ranker ? 'On compare avec ton classement.' : `Le classement de ${rn}, enfin.`; line = 'Carte après carte.'; pip = '🥁'; }
  else if (v.phase === 'reveal' && v.result) {
    const r = v.result;
    title = r.good === 5 ? 'Parfait, les cinq !' : r.win ? `${r.good} sur 5, ça passe !` : `${r.good} sur 5. Raté.`;
    line = r.win ? `Vous prenez le ${r.letter}.` : `Le jeu prend le ${r.letter}.${v.soft ? '' : ' Il fallait les cinq.'}`;
    pip = r.win ? '🎉' : '😬';
  } else if (v.phase === 'over') {
    const win = v.us >= v.word.length;
    title = win ? 'Vous avez gagné !' : 'Le jeu a gagné.'; line = win ? 'Vous vous connaissez vraiment bien.' : 'Il va falloir mieux vous écouter.'; pip = win ? '🏆' : '🤖';
  }
  S.say.replaceChildren(tbSay({ title, line, pip, hot }));

  // ---------------------------------------------------------------- les cinq cartes
  const ck = `${v.round}|${v.cards.map(c => c.id).join(',')}`;
  if (S.cardsKey !== ck) {
    S.cardsKey = ck; S.list.innerHTML = '';
    v.cards.forEach(c => {
      const li = el('li', 'odx-card', `<span class="odx-e" aria-hidden="true">${esc(c.e)}</span><span class="odx-t">${esc(c.t)}</span><span class="odx-grip" aria-hidden="true"><i></i><i></i><i></i></span><span class="odx-truth"></span>`);
      li.dataset.id = c.id; li.dataset.t = c.t; li.tabIndex = 0;
      S.list.appendChild(li);
    });
  }
  const order = odOrder(v), can = odCanDrag(v);
  S.list.querySelectorAll('.odx-card').forEach(c => {
    const id = +c.dataset.id, i = v.guess.indexOf(id);
    c.classList.toggle('locked', !can);
    // à la révélation : la carte à la place i passe au vert si elle est bien placée
    const showIt = done && v.result && i < odRev.n;
    c.classList.toggle('ok', !!(showIt && v.result.ok[i])); c.classList.toggle('ko', !!(showIt && !v.result.ok[i]));
    const tr = c.querySelector('.odx-truth');
    if (showIt) tr.textContent = v.result.ok[i] ? '✓ Bien vu' : `✗ C’était la n°${OD_NB}${v.truth.indexOf(id) + 1}`;
    // le classeur, pendant le débat, voit sa propre place pour chaque carte
    else if (me.ranker && v.truth && v.phase === 'guess') { tr.textContent = `ta n°${OD_NB}${v.truth.indexOf(id) + 1}`; c.classList.add('mine'); }
    else { tr.textContent = ''; c.classList.remove('mine'); }
  });
  if (!odDrag) odPlace(order);
  // qui vient de bouger une carte
  const lm = v.lastMove;
  if (lm && lm.n > odMoveSeen) {
    if (lm.by !== net.me && odMoveSeen) {
      const c = S.list.querySelector(`.odx-card[data-id="${lm.card}"]`), who = v.players.find(p => p.id === lm.by);
      if (c && who && c !== odDrag?.c) { c.querySelector('.odx-who')?.remove(); const b = el('span', 'odx-who', `${tbSplit(who)[0]} ${esc(tbSplit(who)[1])}`); c.appendChild(b); setTimeout(() => b.remove(), 1700); }
    }
    odMoveSeen = lm.n;
  } else if (!lm) odMoveSeen = 0;

  // ---------------------------------------------------------------- le plateau
  const tk = [v.phase, v.round, me.ranker, me.voted, me.inGame, v.ranked, shown, host, R.online, agreed, voters].join('|');
  if (tk !== odTrayKey) {
    odTrayKey = tk;
    const acts = [], hostName = odName(v.players.find(p => p.id !== R.id && !p.bot) || {});
    let body = null;
    const votesRow = () => el('div', 'odx-votes', `${v.voters.map(id => { const p = v.players.find(q => q.id === id); return `<span class="${v.votes.includes(id) ? 'on' : ''}" title="${p ? odName(p) : ''}">${p ? tbSplit(p)[0] : '•'}</span>`; }).join('')}<b>${agreed}/${voters} d’accord</b>`);
    if (v.phase === 'rank') {
      if (odMine(v)) { acts.push(tbBtn('hero', 'Je valide mon classement', () => act({ t: 'od:rank', order: odDraft }))); body = el('p', 'odx-note', 'Les autres ne voient pas ton ordre.'); }
      else {
        body = el('p', 'odx-note', R.online === false ? `${rn} n’est plus là.` : `On attend que ${rn} ait classé pour valider.`);
        if (host && R.online === false) acts.push(tbBtn('glass', 'Passer son tour', () => act({ t: 'od:skip' })));
      }
    } else if (v.phase === 'guess') {
      body = votesRow();
      if (me.inGame && !me.ranker) acts.push(me.voted ? tbBtn('glass', 'Je change d’avis', () => act({ t: 'od:vote', on: false })) : tbBtn('hero', 'On valide', () => act({ t: 'od:vote' })));
    } else if (v.phase === 'reveal' && shown) {
      if (host) acts.push(tbBtn('hero', 'Manche suivante', () => act({ t: 'od:next' })));
      else body = el('p', 'odx-note', 'La manche suivante arrive.');
    } else if (v.phase === 'over' && shown) {
      if (host) acts.push(tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })));
      else body = el('p', 'odx-note', 'Bien joué. L’hôte vous ramène au salon.');
    }
    S.tray.replaceChildren(body || acts.length ? tbTray({ body, acts }) : '');
  }

  // ---------------------------------------------------------------- PC : la colonne de droite (le fil, les manches)
  S.side.innerHTML = `<div class="rl-block"><h4 class="mj-side-title">La règle</h4><p class="odx-note odx-rule">${odRule(v)}</p>${host && v.phase !== 'over' ? `<button class="btn tb-btn glass odx-soft" type="button">${v.soft ? 'Passer en règle normale' : 'Passer en règle douce'}</button>` : ''}</div><div class="rl-block"><h4 class="mj-side-title">Les manches</h4>${v.history.length ? odHistShort(v) : '<p class="odx-note">Aucune manche jouée.</p>'}</div><div class="odx-log"><h4 class="mj-side-title">Le fil</h4>${tbLog(v.log.slice().reverse())}</div>`;
  const sb = S.side.querySelector('.odx-soft'); if (sb) sb.onclick = () => act({ t: 'od:soft', on: !v.soft });
  tbSheet.refresh();
}
const odHistShort = v => `<ol class="odx-hist">${v.history.slice().reverse().map(h => `<li class="${h.win ? 'win' : 'lose'}"><b>Manche ${h.round}</b> · ${esc(tbSplit({ name: h.ranker })[1])} · ${h.good}/5</li>`).join('')}</ol>`;
