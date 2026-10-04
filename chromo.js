// Chromo : affichage et commandes. Les règles du jeu sont dans engines/chromo.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
// La table ronde (sièges, tapis, pioche et défausse) reste l'objet du jeu ; tout le reste est sobre.
let chPendingWild = null, chLastSeq = -1, chLastRound = null, chTurnKey = null, chTurnSince = 0, chSkipTimer = null;
const CH_COLOR_WORD = { r: 'Rouge', y: 'Jaune', g: 'Vert', b: 'Bleu' };
const CH_COLOR_DU = { r: 'Du rouge', y: 'Du jaune', g: 'Du vert', b: 'Du bleu' };
const chSymbol = v => v === 'skip' ? '⊘' : v === 'rev' ? '⇄' : v === 'wild' ? '✦' : v;
const chSymbolWord = v => /^[0-9]$/.test(v) ? `un ${v}` : v === 'skip' ? 'un Passe' : v === 'rev' ? 'un Sens' : v === '+2' ? 'un +2' : 'un joker';
const chDot = t => /[.!?»]$/.test(t) ? t : t + '.';

function chCardHTML(c) {
  const sym = chSymbol(c.v);
  const center = c.v === 'wild' ? '<i class="ch-wheel"></i>'
    : c.v === '+4' ? '<i class="ch-wheel small"></i><b>+4</b>'
      : `<b>${sym}</b>`;
  const u = c.v === '6' || c.v === '9' ? ' u' : '';   // 6 et 9 soulignés, comme sur les vraies cartes
  return `<span class="ch-corner${u}">${sym}</span><span class="ch-oval${u}">${center}</span><span class="ch-corner bottom${u}">${sym}</span>`;
}

function renderChromo(v) {
  if (!v) return;
  const root = $('#ch-main'); root.innerHTML = '';
  if (v.round !== chLastRound) { chLastRound = v.round; chPendingWild = null; chLastSeq = -1; }
  const me = v.me, host = v.isHost;
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const say = list => list[(v.round + v.playSeq) % list.length];      // une réplique stable pendant tout un tour
  const cur = v.players.find(p => p.id === v.currentId), C = esc(cur?.name || '');
  const vul = v.phase === 'play' && v.vulnerable && v.vulnerable.id !== net.me && me.inRound ? esc(v.vulnerable.name) : '';

  const rules = (v.stack ? ' · cumul des +2 et +4' : '') + (v.zero ? ' · règle du zéro' : '');
  root.appendChild(el('p', 'mj-meta', v.phase === 'play' ? `Manche ${v.round} sur ${v.rounds}${rules}` : v.phase === 'result' ? `Fin de la manche ${v.round} sur ${v.rounds}` : `Partie terminée · ${v.rounds} manche${v.rounds > 1 ? 's' : ''}`));

  // la table : les joueurs assis dans l'ordre du jeu, toi en bas, la flèche montre le sens
  if (v.phase === 'play') {
    const seatHTML = p => `<span class="ch-seat-name">${p.bot ? '🤖 ' : ''}${esc(p.name)}</span><span class="ch-seat-count"><i class="ch-mini"></i>${p.count} carte${p.count > 1 ? 's' : ''}</span>`
      + (p.count === 1 ? `<span class="ch-flag${p.called ? '' : ' warn'}">${p.called ? 'Chromo !' : '1 carte'}</span>` : '');
    const table = el('div', 'ch-table col-' + v.color);
    const pile = el('button', 'ch-card ch-back big' + (v.myTurn && !v.drewId ? ' can' : ''), '<span class="ch-oval"><b>Chromo</b></span>');
    pile.type = 'button'; pile.title = 'Piocher'; pile.setAttribute('aria-label', 'Piocher');
    pile.onclick = () => { if (v.myTurn && !v.drewId) act({ t: 'ch:draw' }); };
    const topEl = el('div', 'ch-card big col-' + v.top.c + (v.playSeq !== chLastSeq ? ' pop' : ''), chCardHTML(v.top));
    chLastSeq = v.playSeq;
    table.append(pile, topEl);
    table.appendChild(el('div', 'ch-color', `<i class="ch-dot col-${v.color}"></i>${CH_COLOR_WORD[v.color]}${v.pending ? ` <b class="ch-pending">+${v.pending}</b>` : ''}`));
    const ring = el('div', 'ch-ring n' + Math.min(v.players.length, 10));
    const n = v.players.length, meIdx = Math.max(0, v.players.findIndex(p => p.id === net.me));
    v.players.forEach((p, i) => {
      const k = (i - meIdx + n) % n, ang = Math.PI / 2 + k * 2 * Math.PI / n;       // 90° = en bas, puis sens horaire
      const d = el('div', 'ch-seat ring' + (p.id === v.currentId ? ' now' : '') + (p.online ? '' : ' off') + (p.id === net.me ? ' me' : ''), seatHTML(p));
      d.style.left = Math.min(84, Math.max(16, 50 + 40 * Math.cos(ang))).toFixed(2) + '%';
      d.style.top = (50 + 43 * Math.sin(ang)).toFixed(2) + '%';
      ring.appendChild(d);
    });
    const felt = el('div', 'ch-felt');
    felt.appendChild(el('span', 'ch-felt-dir' + (v.dir === 1 ? '' : ' rev'), v.dir === 1 ? '↻' : '↺'));
    felt.appendChild(table);
    ring.appendChild(felt);
    root.appendChild(ring);
  }

  // ce qui se passe, dit par le meneur
  let title = '', line = '', hot = false;
  if (v.phase === 'play') {
    const need = `${CH_COLOR_DU[v.color]}, ou ${chSymbolWord(v.top.v)}.`;
    if (!me.inRound) { title = `${C} joue.`; line = 'Tu regardes cette manche, tu joueras à la suivante.'; }
    else if (v.myTurn) {
      title = 'À toi.'; hot = true;
      if (v.pending) line = me.playable.length ? say([`Un +${v.pending} te tombe dessus. Contre, ou encaisse.`, `+${v.pending} pour toi, sauf si tu contres.`])
        : say([`+${v.pending} pour toi, et rien pour contrer.`, `${v.pending} cartes pour toi. Courage.`]);
      else if (v.drewId) line = say(['La carte piochée passe. Tu la poses, ou tu la gardes.', 'Bonne pioche. Tu la poses ?']);
      else if (!me.playable.length) line = say([`${need} Rien de tout ça en main, direction la pioche.`, `${need} Tu n’as rien, il faut piocher.`]);
      else line = `${need} ` + say(['Allège-toi.', 'Les autres comptent tes cartes.', 'Pas de pitié.', 'Vide ta main.']);
      if (me.hand.length <= 2 && !me.called && !v.pending) line += ' Et pense à crier.';
    } else {
      title = `${C} joue.`;
      line = v.pending ? `${C} a un +${v.pending} sur le dos.`
        : cur?.bot ? say(['Le robot calcule. Enfin, il fait semblant.', 'Laisse-le réfléchir, il a des circuits.', 'Surveille ses cartes.'])
          : say(['Surveille ses cartes.', 'Croise les doigts, pas de +4 pour toi.', 'Prépare ta riposte.']);
    }
    if (vul) { line = `${vul} n’a plus qu’une carte et n’a rien crié. Vite, attrape.`; hot = true; }
    else if (v.vulnerable?.id === net.me) line = 'Une carte et pas un mot ? Crie, vite.';
  } else if (v.phase === 'result' && v.result) {
    const r = v.result, mine = r.winnerId === net.me, W = esc(r.winnerName);
    title = mine ? 'Tu gagnes la manche.' : `${W} gagne la manche.`;
    line = r.points ? `${r.points} point${r.points > 1 ? 's' : ''} pour ${mine ? 'toi' : W}, la valeur des cartes restées chez les autres.` : 'Zéro point, les autres n’avaient que des 0 en main.';
  } else if (v.phase === 'over') {
    const w = v.scores[0], mine = w?.id === net.me;
    title = mine ? 'Tu gagnes la partie.' : `${esc(w?.name || '')} gagne la partie.`;
    line = `${w?.score || 0} points au total. Revanche ? Tout se passe au salon.`;
  }
  root.appendChild(el('div', 'mj-status' + (hot ? ' ch-hot' : ''), `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`));

  if (v.phase === 'play') {
    const acts = el('div', 'ch-actions');
    if (vul) acts.appendChild(btn('danger', `Attraper ${vul} !`, () => act({ t: 'ch:catch' })));
    if (me.inRound && me.hand.length <= 2 && !me.called) acts.appendChild(btn('primary', 'Crier « Chromo ! »', () => act({ t: 'ch:call' })));
    if (v.myTurn && !v.drewId) acts.appendChild(btn('', v.pending ? `Piocher ${v.pending} cartes` : 'Piocher', () => act({ t: 'ch:draw' })));
    if (v.myTurn && v.drewId) acts.appendChild(btn('', 'Garder et passer', () => act({ t: 'ch:pass' })));
    // l'hôte peut débloquer un joueur absent, mais seulement s'il ne joue pas depuis 20 secondes
    const turnKey = `${v.round}|${v.currentId}|${v.playSeq}|${v.log.length}|${v.drewId}`;
    if (turnKey !== chTurnKey) { chTurnKey = turnKey; chTurnSince = Date.now(); clearTimeout(chSkipTimer); if (host) chSkipTimer = setTimeout(() => { if (view?.chromo) renderChromo(view.chromo); }, 20500); }
    if (host && !v.myTurn && cur && !cur.bot && Date.now() - chTurnSince > 20000) acts.appendChild(btn('ghost small', `${C} traîne ? Passer son tour`, () => act({ t: 'ch:skip' })));
    if (acts.children.length) root.appendChild(acts);

    if (me.inRound) {
      root.appendChild(el('p', 'mj-side-title ch-hand-title', `Ta main · ${me.hand.length} carte${me.hand.length > 1 ? 's' : ''}`));
      const hand = el('div', 'ch-hand');
      me.hand.forEach(c => {
        const ok = v.myTurn && me.playable.includes(c.id);
        const b = el('button', `ch-card col-${c.c}` + (v.myTurn ? (ok ? ' ok' : ' no') : '') + (c.id === v.drewId ? ' drawn' : ''), chCardHTML(c));
        b.type = 'button'; b.setAttribute('aria-label', Chromo.cardLabel(c));
        b.onclick = () => {
          if (!v.myTurn) { toast('Attends ton tour.'); return; }
          if (!ok) { toast(v.pending ? `Pioche ${v.pending} cartes${v.stack ? `, ou contre avec ${v.top.v === '+4' ? 'un +4' : 'un +2 ou un +4'}` : ''}.` : v.drewId ? 'Seule la carte piochée peut partir.' : 'Même couleur ou même symbole.'); return; }
          if (c.c === 'w') { chPendingWild = c.id; renderChromo(view.chromo); return; }
          act({ t: 'ch:play', card: c.id });
        };
        hand.appendChild(b);
      });
      root.appendChild(hand);
    }

    if (chPendingWild && v.myTurn && me.hand.some(c => c.id === chPendingWild)) {
      const sheet = el('div', 'ch-picker', '<p class="ch-picker-title">Quelle couleur ?</p>');
      const row = el('div', 'ch-picker-row');
      Chromo.COLORS.forEach(k => {
        const s = el('button', 'ch-swatch col-' + k, CH_COLOR_WORD[k]); s.type = 'button';
        s.onclick = () => { const id = chPendingWild; chPendingWild = null; act({ t: 'ch:play', card: id, color: k }); };
        row.appendChild(s);
      });
      sheet.appendChild(row);
      sheet.appendChild(btn('ghost small', 'Annuler', () => { chPendingWild = null; renderChromo(view.chromo); }));
      root.appendChild(sheet);
    } else chPendingWild = null;
  }

  if (v.phase === 'result' || v.phase === 'over') {
    const r = v.result;
    const left = r ? r.hands.filter(h => h.id !== r.winnerId && h.cards.length).sort((a, b) => b.points - a.points) : [];
    if (left.length) {
      const box = el('div', 'ch-hands');
      box.appendChild(el('p', 'mj-side-title', 'Ce qui restait en main'));
      const list = el('div', 'mj-list');
      left.forEach(h => {
        const row = el('div', 'mj-row ch-hand-row', `<div class="ch-hand-row-head"><b>${esc(h.name)}</b><span>${h.points} pt${h.points > 1 ? 's' : ''}</span></div>`);
        const mini = el('div', 'ch-hand mini');
        h.cards.forEach(c => mini.appendChild(el('div', 'ch-card col-' + c.c, chCardHTML(c))));
        row.appendChild(mini); list.appendChild(row);
      });
      box.appendChild(list); root.appendChild(box);
    }
    if (host) root.appendChild(v.phase === 'over'
      ? btn('primary lg', 'Retour au salon', () => act({ t: 'restart' }))
      : btn('primary lg', v.round >= v.rounds ? 'Voir le classement' : 'Manche suivante', () => act({ t: 'ch:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));
  }

  // les joueurs et les scores (colonne de droite sur PC ; sur téléphone, la table les montre déjà pendant la manche)
  const side = el('div', 'ch-players' + (v.phase === 'play' ? ' in-play' : ''));
  side.appendChild(el('p', 'mj-side-title', v.phase === 'over' ? 'Classement final' : 'Scores'));
  const list = el('div', 'mj-list');
  if (v.phase === 'play') v.players.forEach(p => {
    const tag = p.id === v.currentId ? '<i class="now">joue</i>' : p.count === 1 ? `<i class="${p.called ? 'ok' : 'warn'}">${p.called ? 'Chromo !' : '1 carte'}</i>` : '';
    list.appendChild(el('div', 'mj-row ch-row' + (p.id === v.currentId ? ' now' : '') + (p.online ? '' : ' off') + (p.id === net.me ? ' me' : ''),
      `<span class="ch-row-name">${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.id === net.me ? ' <small>toi</small>' : ''}${tag}</span><span class="ch-row-sub">${p.count} carte${p.count > 1 ? 's' : ''}</span><b class="ch-row-score">${p.score}</b>`));
  });
  else v.scores.forEach((s, i) => {
    const gain = v.phase === 'result' && v.result?.winnerId === s.id && v.result.points ? ` <em>+${v.result.points}</em>` : '';
    list.appendChild(el('div', 'mj-row ch-row' + (i === 0 && v.phase === 'over' ? ' lead' : '') + (s.id === net.me ? ' me' : ''),
      `<span class="ch-row-name">${s.bot ? '🤖 ' : ''}${esc(s.name)}${s.id === net.me ? ' <small>toi</small>' : ''}</span><b class="ch-row-score">${s.score}${gain}</b>`));
  });
  side.appendChild(list);
  root.appendChild(side);

  // le fil de la partie
  if (v.log.length) {
    const lg = el('ul', 'ch-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(chDot(t)))));
    root.appendChild(lg);
  }
}
