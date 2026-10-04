// Camembert : affichage et commandes. Les règles du jeu sont dans engines/camembert.js.

'use strict';


// ============================================================ écran
let cmLastSeq = -1, cmTimer = null, cmSkipTimer = null, cmDieShown = null;
const CM_COL = ['geo', 'fun', 'hist', 'art', 'sci', 'sport', 'final'];

/** Le fromage d'un joueur : six parts, colorées quand elles sont gagnées. */
function cmCheese(wedges, size = 34) {
  const r = size / 2, cx = r, cy = r;
  let s = `<svg class="cm-cheese" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">`;
  for (let i = 0; i < 6; i++) {
    const a0 = (-90 + i * 60) * Math.PI / 180, a1 = (-90 + (i + 1) * 60) * Math.PI / 180;
    const x0 = cx + (r - 1) * Math.cos(a0), y0 = cy + (r - 1) * Math.sin(a0), x1 = cx + (r - 1) * Math.cos(a1), y1 = cy + (r - 1) * Math.sin(a1);
    s += `<path d="M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} A${r - 1} ${r - 1} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" class="${wedges[i] ? 'on c-' + CM_COL[i] : 'off'}"/>`;
  }
  return s + '</svg>';
}

/** Le plateau : un anneau de 42 cases, les pions dessus, les deux destinations possibles en surbrillance. */
function cmBoard(v) {
  const S = 340, cx = S / 2, cy = S / 2, R = 140;
  const at = i => { const a = (-90 + i * 360 / Camembert.N) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
  let s = `<svg class="cm-board" viewBox="0 0 ${S} ${S}" aria-hidden="true">`;
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" class="cm-ring"/>`;
  const targets = v.options ? { [v.options.cw.pos]: 'cw', [v.options.ccw.pos]: 'ccw' } : {};
  for (let i = 0; i < Camembert.N; i++) {
    const sp = Camembert.space(i), [x, y] = at(i);
    const cls = sp.hq ? `cm-sp hq c-${CM_COL[sp.c]}` : sp.again ? 'cm-sp again' : `cm-sp c-${CM_COL[sp.c]}`;
    const dir = targets[i];
    s += `<g class="${cls}${dir ? ' target' : ''}" data-dir="${dir || ''}">`;
    if (sp.hq) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" class="cm-sp-in"/>`;
    else if (sp.again) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"/><text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle">↻</text>`;
    else s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8"/>`;
    if (dir) s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${sp.hq ? 19 : 13}" class="cm-halo"/>`;
    s += '</g>';
  }
  // les pions, décalés quand plusieurs partagent une case
  const bySpace = {};
  v.players.forEach((p, i) => { (bySpace[p.pos] = bySpace[p.pos] || []).push({ ...p, i }); });
  Object.entries(bySpace).forEach(([pos, list]) => {
    const [x, y] = at(+pos);
    list.forEach((p, k) => {
      const ang = (k / list.length) * Math.PI * 2, off = list.length > 1 ? 9 : 0;
      const px = x + off * Math.cos(ang), py = y + off * Math.sin(ang);
      s += `<g class="cm-token p${p.i % 8}${p.active ? ' active' : ''}${p.online ? '' : ' off'}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="10"/><text x="${px.toFixed(1)}" y="${(py + 4).toFixed(1)}" text-anchor="middle">${esc(glyph0(p.name))}</text></g>`;
    });
  });
  // le centre : le dé, ou le nom du jeu
  if (v.phase === 'choose' && v.die) s += `<g class="cm-die-g"><rect x="${cx - 30}" y="${cy - 30}" width="60" height="60" rx="14" class="cm-die"/><text x="${cx}" y="${cy + 15}" text-anchor="middle" class="cm-die-n">${v.die}</text></g>`;
  else s += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="cm-center">Camembert</text><text x="${cx}" y="${cy + 18}" text-anchor="middle" class="cm-center-sub">${esc(v.activeName)}${v.phase === 'roll' ? ' lance le dé' : ''}</text>`;
  return s + '</svg>';
}

function renderCamembert(v) {
  if (!v) return;
  const root = $('#cm-main'); root.innerHTML = '';
  clearInterval(cmTimer); clearTimeout(cmSkipTimer);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const C = Camembert.COLORS;
  const inQuestion = v.phase === 'ask' || v.phase === 'reveal';

  // joueurs et fromages
  const strip = el('div', 'cm-players');
  v.players.forEach((p, i) => {
    const d = el('div', `cm-player p${i % 8}${p.active ? ' active' : ''}${p.online ? '' : ' off'}${p.me ? ' me' : ''}`);
    d.innerHTML = cmCheese(p.wedges, 36) + `<span class="cm-player-name">${esc(p.name)}</span><span class="cm-player-count">${p.count}/${v.target}</span>`;
    strip.appendChild(d);
  });
  root.appendChild(strip);

  if (!inQuestion && v.phase !== 'over') {
    const board = el('div', 'cm-board-wrap', cmBoard(v));
    board.querySelectorAll('.cm-sp.target').forEach(g => { g.style.cursor = 'pointer'; g.addEventListener('click', () => { if (v.isActive) act({ t: 'cm:go', dir: g.dataset.dir }); }); });
    root.appendChild(board);
  }

  const zone = el('div', 'cm-zone');
  const describe = o => o.again ? 'Relance' : (o.hq ? 'Camembert ' : '') + C[o.c].name;
  if (v.phase === 'roll') {
    if (v.isActive) zone.appendChild(btn('primary lg cm-roll', 'Lancer le dé', () => act({ t: 'cm:roll' })));
    else zone.appendChild(el('p', 'cm-wait', `${esc(v.activeName)} lance le dé…`));
  }
  if (v.phase === 'choose' && v.options) {
    if (v.isActive) {
      zone.appendChild(el('p', 'cm-wait', `Tu avances de ${v.die} : de quel côté ?`));
      const row = el('div', 'cm-dirs');
      const o1 = v.options.ccw, o2 = v.options.cw;
      const mk = (o, dir, arrow) => { const b = btn(`cm-dir ${o.again ? 'again' : 'c-' + CM_COL[o.c]}${o.hq ? ' hq' : ''}`, `${dir === 'ccw' ? arrow + ' ' : ''}${esc(describe(o))}${dir === 'cw' ? ' ' + arrow : ''}`, () => act({ t: 'cm:go', dir })); return b; };
      row.append(mk(o1, 'ccw', '◀'), mk(o2, 'cw', '▶'));
      zone.appendChild(row);
    } else zone.appendChild(el('p', 'cm-wait', `${esc(v.activeName)} a fait ${v.die} et choisit son côté…`));
  }
  if (v.phase === 'vote') {
    if (v.isActive) zone.appendChild(el('p', 'cm-wait', `Ton fromage est complet ! Les autres choisissent la couleur de ta question finale… (${v.votes}/${v.voters})`));
    else {
      zone.appendChild(el('p', 'cm-wait', `${esc(v.activeName)} joue la question finale : choisis la couleur qui lui fera le plus mal (${v.votes}/${v.voters}).`));
      const grid = el('div', 'cm-votes');
      C.forEach((c, i) => grid.appendChild(btn(`cm-vote c-${c.key}${v.myVote === i ? ' on' : ''}`, esc(c.name), () => act({ t: 'cm:vote', c: i }))));
      zone.appendChild(grid);
    }
    zone.appendChild(cmTimerBar(v));
  }
  if (inQuestion && v.q) {
    const q = v.q, col = C[q.c];
    const card = el('div', `cm-q c-${col.key}`);
    card.innerHTML = `<div class="cm-q-head"><span class="cm-q-cat">${esc(col.name)}</span><span class="cm-q-meta">${q.final ? 'Question finale' : q.hq ? (q.owned ? 'Case camembert : part déjà gagnée' : 'Case camembert : la part est en jeu') : 'Case simple : pas de part en jeu'}${q.d === 3 ? ' · difficile' : q.d === 1 ? ' · facile' : ''}</span></div>`
      + `<p class="cm-q-text">${esc(q.text)}</p>`;
    zone.appendChild(card);
    if (v.phase === 'ask') zone.appendChild(cmTimerBar(v));
    zone.appendChild(el('p', 'cm-who', v.phase === 'ask'
      ? (v.isActive ? 'À toi de répondre' : `${esc(v.activeName)} répond… donne ton avis, pour voir`)
      : ''));
    const list = el('div', 'cm-choices');
    q.choices.forEach((ch, i) => {
      let cls = 'cm-choice';
      if (v.phase === 'reveal' || v.phase === 'over') {
        if (i === q.correct) cls += ' good';
        else if (i === v.result?.chosen) cls += ' bad';
        else cls += ' dim';
        if (v.myGuess === i && !v.isActive) cls += ' mine';
      } else if (!v.isActive && v.myGuess === i) cls += ' mine';
      const b = btn(cls, `<span class="cm-letter">${'ABCD'[i]}</span><span>${esc(ch)}</span>`, () => {
        if (v.phase !== 'ask') return;
        if (v.isActive) act({ t: 'cm:answer', i });
        else if (v.myGuess === null && v.seated) { act({ t: 'cm:guess', i }); view.cm.myGuess = i; renderCamembert(view.cm); }
      });
      b.disabled = v.phase !== 'ask' || (!v.isActive && (v.myGuess !== null || !v.seated));
      list.appendChild(b);
    });
    zone.appendChild(list);
    if (v.phase === 'reveal' && v.result) {
      const r = v.result;
      const verdict = el('div', 'cm-verdict' + (r.ok ? ' ok' : ' ko'));
      verdict.innerHTML = `<p class="cm-verdict-big">${r.ok ? (r.wedge ? 'Bonne réponse, part gagnée !' : 'Bonne réponse !') : r.timeout ? 'Temps écoulé' : 'Raté !'}</p>`
        + `<p class="cm-verdict-sub">${r.ok ? (r.again ? `${esc(v.activeName)} rejoue${r.max ? ` (question ${r.streak + 1} sur ${r.max} maximum)` : ''} : vise une grosse case pour gagner une part.` : r.max && r.streak >= r.max ? `${r.max} bonnes réponses d’affilée : au tour du suivant.` : 'Au tour du suivant.') : `La bonne réponse était « ${esc(q.choices[q.correct])} ». Au suivant.`}</p>`
        + (r.right.length || r.wrong.length ? `<p class="cm-verdict-guess">${r.right.length ? `Avaient trouvé : ${r.right.map(esc).join(', ')}.` : ''} ${r.wrong.length ? `À côté : ${r.wrong.map(esc).join(', ')}.` : ''}</p>` : '');
      zone.appendChild(verdict);
      const row = el('div', 'cm-actions');
      if (v.isActive || v.isHost) row.appendChild(btn('primary', 'Continuer', () => act({ t: 'cm:next' })));
      if (v.isHost && !r.ok && !r.overridden) row.appendChild(btn('ghost small', 'La question était fausse ? Compter juste', () => act({ t: 'cm:override' })));
      zone.appendChild(row);
      zone.appendChild(cmTimerBar(v));
    }
  }
  if (v.phase === 'over') {
    const w = v.players.find(p => p.name === v.winnerName) || v.players[0];
    const fin = el('div', 'cm-final');
    fin.innerHTML = `<span class="eyebrow">Partie terminée</span>${cmCheese(w ? w.wedges : [], 96)}<p class="cm-final-name">${esc(v.winnerName || '')} gagne !</p>`
      + `<div class="cm-stats">${v.players.map(p => `<span>${esc(p.name)} <b>${p.right}/${p.answered}</b> bonnes réponses</span>`).join('')}</div>`;
    zone.appendChild(fin);
    if (v.isHost) zone.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
    else zone.appendChild(el('p', 'note', "L'hôte relance quand vous voulez."));
  }
  // l'hôte peut débloquer un joueur qui ne joue pas depuis 30 s
  if (v.isHost && !v.isActive && ['roll', 'choose', 'ask'].includes(v.phase)) {
    if (v.quiet > SKIP_SHOW_MS) zone.appendChild(btn('ghost small', `${esc(v.activeName)} ne joue pas ? Passer son tour`, () => act({ t: 'cm:skip' })));
    else cmSkipTimer = setTimeout(() => { if (view?.cm) renderCamembert(view.cm); }, SKIP_SHOW_MS - v.quiet + 200);
  }
  root.appendChild(zone);

  const lg = el('ul', 'cm-log');
  v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
  root.appendChild(lg);
}
const SKIP_SHOW_MS = 30000;

/** Barre de temps qui descend toute seule entre deux diffusions. */
function cmTimerBar(v) {
  const wrap = el('div', 'cm-timer');
  const bar = el('i'); wrap.appendChild(bar);
  const start = Date.now(), left0 = v.left, total = v.total || 1;
  const paint = () => { const left = Math.max(0, left0 - (Date.now() - start)); bar.style.width = (100 * left / total) + '%'; wrap.classList.toggle('low', left < 6000); };
  paint();
  cmTimer = setInterval(paint, 200);
  return wrap;
}
