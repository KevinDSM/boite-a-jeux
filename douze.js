// Douze : affichage et commandes. Les règles du jeu sont dans engines/douze.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
let dzLastRound = null, dzSkipTimer = null, dzLastSeq = -1;
const DZ_SKIP_MS = 30000;
const dzTone = v => v <= -1 ? 'n' : v === 0 ? 'z' : v <= 4 ? 'g' : v <= 8 ? 'y' : 'r';
const dzNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];

function dzCardHTML(c, mini = false) {
  if (!c) return `<span class="dz-card gone${mini ? ' mini' : ''}"></span>`;
  if (!c.up) return `<span class="dz-card back${mini ? ' mini' : ''}"><i></i></span>`;
  return `<span class="dz-card up t-${dzTone(c.v)}${mini ? ' mini' : ''}"><b>${c.v}</b></span>`;
}
const dzMini = grid => `<span class="dz-mini-grid">${grid.map(c => dzCardHTML(c, true)).join('')}</span>`;

function renderDouze(v) {
  if (!v) return;
  const root = $('#dz-main'); root.innerHTML = '';
  clearTimeout(dzSkipTimer);
  if (v.round !== dzLastRound) { dzLastRound = v.round; dzLastSeq = -1; }
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me, C = esc(v.currentName);
  const say = list => list[(v.round - 1) % list.length];              // une réplique stable pendant toute la manche
  const playing = v.phase === 'reveal' || v.phase === 'play';

  root.appendChild(el('p', 'mj-meta', v.phase === 'over' ? `Partie terminée · manche ${v.round}` : v.phase === 'result' ? `Fin de la manche ${v.round} · fin à ${v.target} points`
    : `Manche ${v.round} · fin à ${v.target} points${v.closerName && v.phase === 'play' ? ' · dernier tour' : ''}`));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', hot = false, prog = null;
  if (v.phase === 'reveal') {
    const live = v.players.filter(p => p.online), done = live.filter(p => p.revealed);
    prog = [done.length, live.length];
    if (!me.inRound) { title = 'Chacun retourne deux cartes.'; line = 'Tu regardes cette manche, tu joueras à la suivante.'; }
    else if (me.upCount < 2) {
      title = me.upCount ? 'Encore une.' : 'Retourne deux cartes.'; hot = true;
      line = say(['Deux au choix. Prie pour des négatifs.', 'Au hasard, ou au flair.', 'Le plus haut total visible commence.']);
    } else {
      const wait = live.filter(p => !p.revealed).map(p => p.name);
      title = 'Chacun retourne deux cartes.'; line = wait.length ? `Plus que ${esc(dzNames(wait))}.` : 'C’est parti.';
    }
  } else if (v.phase === 'play') {
    const last = !v.closerName ? '' : v.players.some(p => p.closer && p.me) ? 'Dernier tour, tu as tout retourné. ' : `Dernier tour, ${esc(v.closerName)} a tout retourné. `;
    if (!me.inRound) { title = `${C} joue.`; line = 'Tu regardes cette manche, tu joueras à la suivante.'; }
    else if (!v.myTurn) { title = `${C} joue.`; line = last || say(['Surveille la défausse.', 'Compte ses cartes rouges.', 'Pendant ce temps, fais tes calculs.']); }
    else {
      hot = true;
      if (v.mustFlip) { title = 'À toi.'; line = last + 'Retourne une carte cachée, et croise les doigts.'; }
      else if (v.taken) {
        const t = v.taken.v;
        title = `Un ${t} en main.`;
        line = last + (v.taken.from === 'discard' ? 'Pris dans la défausse, il doit trouver sa place.'
          : t >= 9 ? 'Aïe. Case-le quelque part, ou défausse-le.' : t <= 0 ? 'Une aubaine. Trouve-lui une place.' : 'Pose-le sur une de tes cartes, ou défausse-le.');
      } else { title = 'À toi.'; line = last + (v.top !== null ? `Pioche, ou prends le ${v.top} de la défausse.` : 'Pioche.'); }
    }
  } else if (v.result) {
    const r = v.result, best = r.rows[0], doubled = r.rows.find(x => x.doubled), meClosed = r.closerId === net.me;
    if (v.phase === 'result') {
      title = best.id === net.me ? 'Tu fais le plus petit score.' : `${esc(best.name)} fait le plus petit score.`;
      line = doubled ? (meClosed ? 'Tu as fermé sans avoir le plus petit total. Ton score double.' : `${esc(r.closerName)} a fermé sans avoir le plus petit total. Son score double.`)
        : best.id === r.closerId ? (meClosed ? 'Tu as fermé la manche, et ça paie.' : `${esc(r.closerName)} a fermé la manche, et ça paie.`)
          : (meClosed ? 'Tu as fermé la manche.' : `${esc(r.closerName)} a fermé la manche.`);
    } else {
      const w = v.scores[0];
      title = w?.id === net.me ? 'Tu gagnes la partie.' : `${esc(w?.name || '')} gagne la partie.`;
      line = `${w?.score ?? 0} points, le plus bas de la table. Revanche ? Tout se passe au salon.`;
    }
  }
  const status = el('div', 'mj-status' + (hot ? ' dz-hot' : ''), `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`);
  if (prog && prog[1] > 0) status.appendChild(el('div', 'mj-prog', `${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]}</span>`));
  root.appendChild(status);

  if (playing) {
    // pioche, carte en main, défausse
    if (v.phase === 'play') {
      const table = el('div', 'dz-table');
      const pile = el('button', 'dz-pile' + (v.myTurn && !v.taken && !v.mustFlip ? ' can' : ''), `<span class="dz-card back big"><i></i></span><span class="dz-pile-label">Pioche · ${v.drawLeft}</span>`); pile.type = 'button';
      pile.onclick = () => { if (v.myTurn && !v.taken && !v.mustFlip) act({ t: 'dz:draw' }); };
      const disc = el('button', 'dz-pile' + (v.myTurn && !v.taken && !v.mustFlip && v.top !== null ? ' can' : ''), (v.top === null ? '<span class="dz-card gone big"></span>' : `<span class="dz-card up big t-${dzTone(v.top)}"><b>${v.top}</b></span>`) + '<span class="dz-pile-label">Défausse</span>'); disc.type = 'button';
      disc.onclick = () => { if (v.myTurn && !v.taken && !v.mustFlip && v.top !== null) act({ t: 'dz:take' }); };
      const hand = el('div', 'dz-taken' + (v.taken ? ' has' : ''), v.taken ? `<span class="dz-card up big t-${dzTone(v.taken.v)} pop"><b>${v.taken.v}</b></span><span class="dz-pile-label">${v.taken.from === 'draw' ? 'Piochée' : 'Prise'}</span>` : '<span class="dz-card slot big"></span><span class="dz-pile-label">En main</span>');
      table.append(pile, hand, disc);
      root.appendChild(table);
    }

    if (me.inRound) {
      const grid = el('div', 'dz-grid');
      const canFlip = (v.phase === 'reveal' && me.upCount < 2) || (v.myTurn && v.mustFlip);
      const canSwap = v.myTurn && !!v.taken;
      me.grid.forEach((c, i) => {
        const b = el('button', 'dz-cell' + (c && ((canFlip && !c.up) || canSwap) ? ' ok' : ''), dzCardHTML(c)); b.type = 'button';
        b.onclick = () => {
          if (!c) return;
          if (canSwap) act({ t: 'dz:swap', i });
          else if (canFlip) { if (c.up) toast('Celle-là est déjà visible.'); else act({ t: 'dz:flip', i }); }
          else if (v.myTurn) toast('Pioche ou prends la défausse d’abord.');
        };
        grid.appendChild(b);
      });
      root.appendChild(grid);
      const n = me.grid.filter(Boolean).length;
      root.appendChild(el('p', 'dz-sum', `${me.sum} point${Math.abs(me.sum) > 1 ? 's' : ''} en vue · ${me.upCount} carte${me.upCount > 1 ? 's' : ''} retournée${me.upCount > 1 ? 's' : ''} sur ${n}`));
      const acts = el('div', 'dz-actions');
      if (v.myTurn && v.taken && v.taken.from === 'draw') acts.appendChild(btn('', 'Défausser et retourner une carte', () => act({ t: 'dz:discard' })));
      if (acts.children.length) root.appendChild(acts);
    }
    // l'hôte peut débloquer un joueur absent
    if (v.isHost && v.phase === 'play' && !v.myTurn) {
      const cur = v.players.find(p => p.id === v.currentId);
      if (cur && !cur.bot) {
        if (v.quiet > DZ_SKIP_MS) root.appendChild(btn('ghost small', `${esc(cur.name)} traîne ? Passer son tour`, () => act({ t: 'dz:skip' })));
        else dzSkipTimer = setTimeout(() => { if (view?.dz) renderDouze(view.dz); }, DZ_SKIP_MS - v.quiet + 200);
      }
    }

    // les grilles de tout le monde, en petit (colonne de droite sur PC)
    const strip = el('div', 'dz-players');
    strip.appendChild(el('p', 'mj-side-title', 'Les grilles'));
    const list = el('div', 'mj-list');
    v.players.forEach(p => {
      const tag = p.current ? '<i class="now">joue</i>' : p.closer ? '<i>a fermé</i>' : v.phase === 'reveal' && !p.revealed && p.online ? '<i>retourne</i>' : '';
      list.appendChild(el('div', 'mj-row dz-row' + (p.current ? ' now' : '') + (p.online ? '' : ' off') + (p.me ? ' me' : ''),
        `<div class="dz-row-head"><b>${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.me ? ' <small>toi</small>' : ''}${tag}</b><span>${p.sum} en vue · ${p.score} au total</span></div>${dzMini(p.grid)}`));
    });
    strip.appendChild(list);
    root.appendChild(strip);
  }

  if (v.phase === 'result' || v.phase === 'over') {
    const r = v.result;
    if (r) {
      const box = el('div', 'dz-verdict');
      box.appendChild(el('p', 'mj-side-title', `Manche ${v.round}`));
      const list = el('div', 'mj-list');
      r.rows.forEach(row => {
        const p = v.players.find(q => q.id === row.id);
        list.appendChild(el('div', 'mj-row dz-row' + (row.doubled ? ' doubled' : '') + (row.id === net.me ? ' me' : ''),
          `<div class="dz-row-head"><b>${esc(row.name)}${row.id === r.closerId ? '<i>a fermé</i>' : ''}</b>${row.doubled ? `<span class="neg">${row.raw} × 2, score doublé</span>` : ''}</div><strong class="dz-row-pts">${row.points}</strong>${dzMini(p?.grid || [])}`));
      });
      box.appendChild(list); root.appendChild(box);
    }
    if (v.isHost) root.appendChild(v.phase === 'over' ? btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })) : btn('primary lg', 'Manche suivante', () => act({ t: 'dz:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));

    const sc = el('div', 'dz-scores');
    sc.appendChild(el('p', 'mj-side-title', v.phase === 'over' ? 'Classement final · le plus bas gagne' : `Totaux · fin à ${v.target} points`));
    const sl = el('div', 'mj-list');
    v.scores.forEach((s, i) => sl.appendChild(el('div', 'mj-row dz-score-row' + (i === 0 && v.phase === 'over' ? ' lead' : '') + (s.id === net.me ? ' me' : ''),
      `<span class="dz-score-name">${s.bot ? '🤖 ' : ''}${esc(s.name)}${s.id === net.me ? ' <small>toi</small>' : ''}</span>${s.last !== null && s.last !== undefined ? `<span class="dz-score-last">${s.last > 0 ? '+' : ''}${s.last}</span>` : ''}<b class="dz-score-total">${s.score}</b>`)));
    sc.appendChild(sl);
    root.appendChild(sc);
  }

  if (v.log.length) {
    const lg = el('ul', 'dz-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }
}
