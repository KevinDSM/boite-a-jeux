/* Camembert — l'équivalent maison du jeu des six camemberts : un plateau en anneau, un dé, des questions
   à choix multiples dans six couleurs, et un fromage à compléter.

   Règles simplifiées pour téléphones : à ton tour tu lances le dé et tu choisis dans quel sens avancer
   (les deux cases possibles sont montrées), la case donne la couleur de la question. Bonne réponse : tu
   rejoues ; sur une case « camembert » (les six grosses cases) elle rapporte la part de cette couleur.
   Quand ton fromage est complet, à ton tour suivant les autres choisissent la couleur de la question
   finale : bonne réponse, tu gagnes. Les autres joueurs peuvent donner leur avis sur chaque question,
   pour rire, ça ne compte pas.
   Questions : quiz.json (récolte de quizzapi.fr, API française gratuite) + quiz-extra.json (maison),
   chargées par l'hôte, jamais redonnées d'une soirée à l'autre tant qu'il en reste (mémoire du téléphone).
   Même modèle que Chromo : la salle vit chez l'hôte (net.game.cm), les actions arrivent en « cm:… ».
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, net, view et ASSET_V. */

'use strict';

const Camembert = (() => {
  const COLORS = [
    { key: 'geo', name: 'Géographie', short: 'Géo' },
    { key: 'fun', name: 'Divertissement', short: 'Diver.' },
    { key: 'hist', name: 'Histoire', short: 'Histoire' },
    { key: 'art', name: 'Arts & Littérature', short: 'Arts' },
    { key: 'sci', name: 'Sciences & Nature', short: 'Sciences' },
    { key: 'sport', name: 'Sports & Loisirs', short: 'Sports' },
    { key: 'final', name: 'Culture générale', short: 'Culture G' },   // hors plateau : seulement pour la question finale
  ];
  const N = 42;                                   // cases de l'anneau : 6 camemberts, un toutes les 7 cases
  const QUESTION_MS = 30000, REVEAL_MS = 10000, VOTE_MS = 15000, SKIP_MS = 30000;
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

  /** Ce qu'il y a sur la case i : camembert (grosse case), relance, ou couleur simple. */
  function space(i) {
    const k = Math.floor(i / 7), j = i % 7;
    if (j === 0) return { hq: true, c: k };
    if (j === 3) return { again: true };
    return { c: (k + j) % 6 };
  }

  // ------------------------------------------------------------ questions
  let pool = null, used = new Set();
  const USED_KEY = 'cm-used';
  async function load(v) {
    if (pool) return pool;
    const files = ['quiz.json', 'quiz-extra.json'];
    const lists = await Promise.all(files.map(f => fetch(`${f}?v=${v}`).then(r => r.ok ? r.json() : []).catch(() => [])));
    pool = {}; COLORS.forEach(c => pool[c.key] = []);
    lists.flat().forEach(q => { if (pool[q.cat]) pool[q.cat].push(q); });
    try { used = new Set(JSON.parse(localStorage.getItem(USED_KEY) || '[]')); } catch { used = new Set(); }
    return pool;
  }
  const count = () => pool ? Object.values(pool).reduce((s, l) => s + l.length, 0) : 0;
  function remember(id) {
    used.add(id);
    try { const arr = [...used]; localStorage.setItem(USED_KEY, JSON.stringify(arr.slice(-3000))); } catch { }
  }
  function diffOk(room, q) { return room.diff === 'facile' ? q.d <= 2 : room.diff === 'dur' ? q.d >= 2 : true; }
  function draw(room, c, final) {
    const key = COLORS[c].key, all = pool?.[key] || [];
    if (!all.length) return null;
    const fresh = () => all.filter(q => !used.has(q.id) && !room.seen.has(q.id) && diffOk(room, q));
    let list = fresh();
    if (!list.length) { all.forEach(q => used.delete(q.id)); list = fresh(); }     // toute la couleur a été vue : on repart
    if (!list.length) list = all.filter(q => !room.seen.has(q.id)) ; if (!list.length) list = all;
    if (final) { const hard = list.filter(q => q.d === 3); if (hard.length) list = hard; }
    const q = list[Math.random() * list.length | 0];
    remember(q.id); room.seen.add(q.id);
    const choices = shuffle([q.a, ...q.bad]);
    return { id: q.id, c, text: q.q, choices, correct: choices.indexOf(q.a), d: q.d, src: q.src };
  }

  // ------------------------------------------------------------ salle
  const pl = (room, id) => room.players.find(p => p.id === id);
  const active = room => pl(room, room.order[room.turn]);
  const full = (room, p) => p.wedges.filter(Boolean).length >= room.target;
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };

  function create({ hostId, players, target, diff }) {
    const room = {
      hostId, phase: 'roll', target: clamp(target, 1, 6, 6), diff: ['facile', 'mix', 'dur'].includes(diff) ? diff : 'mix',
      players: players.map((p, i) => ({ id: p.id, name: p.name, online: p.online !== false, pos: (i % 6) * 7, wedges: [false, false, false, false, false, false], answered: 0, right: 0 })),
      order: [], turn: 0, die: null, options: null, q: null, answer: null, guesses: {}, votes: {}, ends: 0, turnAt: Date.now(),
      result: null, winnerId: null, log: [], seen: new Set(), seq: 0,
    };
    room.order = shuffle(room.players.filter(p => p.online).map(p => p.id));
    log(room, 'Chacun part de son camembert. Bonne réponse : tu rejoues.');
    beginTurn(room, false);
    return room;
  }

  function beginTurn(room, advance = true) {
    const n = room.order.length;
    if (advance) room.turn = (room.turn + 1) % n;
    let guard = 0;
    while (guard++ < n && !active(room)?.online) room.turn = (room.turn + 1) % n;
    const p = active(room);
    room.die = null; room.options = null; room.q = null; room.answer = null; room.guesses = {}; room.votes = {}; room.result = null;
    room.turnAt = Date.now(); room.seq += 1;
    if (p && full(room, p)) {                                     // fromage complet : question finale, couleur choisie par les autres
      room.phase = 'vote'; room.ends = Date.now() + VOTE_MS;
      if (room.order.filter(id => id !== p.id && pl(room, id).online).length === 0) resolveVote(room);
    } else room.phase = 'roll';
  }

  function roll(room, pid) {
    if (room.phase !== 'roll' || active(room)?.id !== pid) return null;
    const p = active(room);
    room.die = 1 + (Math.random() * 6 | 0);
    const cw = (p.pos + room.die) % N, ccw = (p.pos - room.die + N) % N;
    room.options = { cw: { pos: cw, ...space(cw) }, ccw: { pos: ccw, ...space(ccw) } };
    room.phase = 'choose'; room.turnAt = Date.now(); room.seq += 1;
    return null;
  }

  function go(room, pid, dir) {
    if (room.phase !== 'choose' || active(room)?.id !== pid || !room.options?.[dir]) return null;
    const p = active(room), o = room.options[dir];
    p.pos = o.pos; room.options = null;
    if (o.again) { log(room, `${p.name} tombe sur une case Relance.`); room.phase = 'roll'; room.turnAt = Date.now(); room.seq += 1; return null; }
    return ask(room, o.c, !!o.hq, false);
  }

  function ask(room, c, hq, final) {
    const q = draw(room, c, final);
    if (!q) return 'Aucune question dans cette couleur';
    room.q = { ...q, hq, final }; room.answer = null; room.guesses = {};
    room.phase = 'ask'; room.ends = Date.now() + QUESTION_MS; room.turnAt = Date.now(); room.seq += 1;
    return null;
  }

  function answer(room, pid, i) {
    if (room.phase !== 'ask' || active(room)?.id !== pid) return null;
    return reveal(room, Number.isInteger(i) ? i : -1);
  }
  function guess(room, pid, i) {
    if (room.phase !== 'ask' || active(room)?.id === pid || !pl(room, pid)) return null;
    if (room.guesses[pid] !== undefined) return 'silent';
    room.guesses[pid] = i; return 'silent';                        // l'avis des autres reste secret jusqu'à la réponse
  }

  function reveal(room, chosen) {
    const p = active(room), q = room.q, ok = chosen === q.correct;
    p.answered += 1; if (ok) p.right += 1;
    let wedge = false;
    if (ok && q.hq && !p.wedges[q.c]) { p.wedges[q.c] = true; wedge = true; }
    const right = Object.entries(room.guesses).filter(([, i]) => i === q.correct).map(([id]) => pl(room, id)?.name).filter(Boolean);
    const wrong = Object.entries(room.guesses).filter(([, i]) => i !== q.correct).map(([id]) => pl(room, id)?.name).filter(Boolean);
    room.answer = chosen;
    room.result = { ok, chosen, correct: q.correct, wedge, right, wrong, final: q.final, timeout: chosen === -1 };
    const col = COLORS[q.c].name;
    if (q.final) log(room, ok ? `${p.name} répond juste à la question finale (${col}) et gagne !` : `${p.name} rate la question finale (${col}).`);
    else log(room, ok ? `${p.name} : bonne réponse en ${col}${wedge ? ', part gagnée !' : ''}` : chosen === -1 ? `${p.name} n'a pas répondu à temps (${col}).` : `${p.name} se trompe en ${col}.`);
    if (ok && q.final) { room.phase = 'over'; room.winnerId = p.id; room.seq += 1; return null; }
    room.phase = 'reveal'; room.ends = Date.now() + REVEAL_MS; room.seq += 1;
    return null;
  }

  function next(room, pid) {
    if (room.phase !== 'reveal') return null;
    if (pid !== active(room)?.id && pid !== room.hostId) return null;
    beginTurn(room, !room.result.ok);                              // bonne réponse : le même joueur rejoue
    return null;
  }

  function override(room, pid) {
    if (room.phase !== 'reveal' || pid !== room.hostId || room.result.ok) return null;
    const p = active(room), q = room.q;
    room.result.ok = true; room.result.overridden = true;
    p.right += 1;
    if (q.hq && !p.wedges[q.c]) { p.wedges[q.c] = true; room.result.wedge = true; }
    log(room, `L'hôte compte la réponse de ${p.name} comme juste.`);
    if (q.final) { room.phase = 'over'; room.winnerId = p.id; }
    room.seq += 1;
    return null;
  }

  function vote(room, pid, c) {
    if (room.phase !== 'vote' || active(room)?.id === pid || !pl(room, pid) || !COLORS[c]) return null;
    room.votes[pid] = c;
    const others = room.order.filter(id => id !== active(room).id && pl(room, id).online);
    if (others.every(id => room.votes[id] !== undefined)) resolveVote(room);
    return null;
  }
  function resolveVote(room) {
    const tally = [0, 0, 0, 0, 0, 0, 0];
    Object.values(room.votes).forEach(c => tally[c] += 1);
    const max = Math.max(...tally);
    const best = max > 0 ? tally.map((v, i) => v === max ? i : -1).filter(i => i >= 0) : [0, 1, 2, 3, 4, 5, 6];
    const c = best[Math.random() * best.length | 0];
    log(room, `Question finale pour ${active(room).name} : ${COLORS[c].name}.`);
    ask(room, c, false, true);
  }

  function hostSkip(room, pid) {
    if (pid !== room.hostId || !['roll', 'choose', 'ask'].includes(room.phase)) return null;
    const p = active(room); if (!p) return null;
    log(room, `L'hôte passe le tour de ${p.name}.`);
    beginTurn(room, true);
    return null;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'cm:roll': return roll(room, pid);
      case 'cm:go': return go(room, pid, m.dir);
      case 'cm:answer': return answer(room, pid, m.i);
      case 'cm:guess': return guess(room, pid, m.i);
      case 'cm:next': return next(room, pid);
      case 'cm:override': return override(room, pid);
      case 'cm:vote': return vote(room, pid, m.c);
      case 'cm:skip': return hostSkip(room, pid);
    }
    return null;
  }

  /** Horloge de l'hôte : temps de réponse, fin de la révélation, fin du vote. */
  function tick(room) {
    const now = Date.now();
    if (room.phase === 'ask' && now >= room.ends) { reveal(room, -1); return true; }
    if (room.phase === 'reveal' && now >= room.ends) { beginTurn(room, !room.result.ok); return true; }
    if (room.phase === 'vote' && now >= room.ends) { resolveVote(room); return true; }
    return false;
  }

  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, pos: (room.players.length % 6) * 7, wedges: [false, false, false, false, false, false], answered: 0, right: 0 });
    room.order.push(id);
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on;
    if (!on && active(room)?.id === id && ['roll', 'choose'].includes(room.phase)) beginTurn(room, true);
  }

  function view(room, pid) {
    const a = active(room), now = Date.now(), me = pl(room, pid);
    const q = room.q, showQ = room.phase === 'ask' || room.phase === 'reveal' || (room.phase === 'over' && q);
    return {
      phase: room.phase, target: room.target, seq: room.seq, isHost: pid === room.hostId,
      activeId: a?.id || null, activeName: a?.name || '', isActive: a?.id === pid, seated: !!me,
      players: room.order.map(id => { const p = pl(room, id); return { id, name: p.name, online: p.online, pos: p.pos, wedges: p.wedges, count: p.wedges.filter(Boolean).length, me: id === pid, active: id === a?.id, answered: p.answered, right: p.right }; }),
      die: room.die, options: room.options,
      q: showQ ? { text: q.text, choices: q.choices, c: q.c, hq: q.hq, final: q.final, d: q.d, correct: room.phase === 'ask' ? null : q.correct } : null,
      left: room.phase === 'ask' || room.phase === 'vote' || room.phase === 'reveal' ? Math.max(0, room.ends - now) : 0,
      total: room.phase === 'ask' ? QUESTION_MS : room.phase === 'vote' ? VOTE_MS : REVEAL_MS,
      myGuess: room.guesses[pid] ?? null, guessCount: Object.keys(room.guesses).length,
      result: room.result, votes: Object.keys(room.votes).length, myVote: room.votes[pid] ?? null,
      voters: room.phase === 'vote' ? room.order.filter(id => id !== a?.id && pl(room, id).online).length : 0,
      quiet: now - room.turnAt, winnerName: room.winnerId ? pl(room, room.winnerId)?.name : null,
      log: room.log.slice(-4),
    };
  }

  return { COLORS, N, space, load, count, create, act, tick, join, setOnline, view };
})();

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
      s += `<g class="cm-token p${p.i % 8}${p.active ? ' active' : ''}${p.online ? '' : ' off'}"><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="10"/><text x="${px.toFixed(1)}" y="${(py + 4).toFixed(1)}" text-anchor="middle">${esc((p.name[0] || '?').toUpperCase())}</text></g>`;
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
    card.innerHTML = `<div class="cm-q-head"><span class="cm-q-cat">${esc(col.name)}</span><span class="cm-q-meta">${q.final ? 'Question finale' : q.hq ? 'Case camembert : la part est en jeu' : ''}${q.d === 3 ? ' · difficile' : q.d === 1 ? ' · facile' : ''}</span></div>`
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
        + `<p class="cm-verdict-sub">${r.ok ? `${esc(v.activeName)} rejoue.` : `La bonne réponse était « ${esc(q.choices[q.correct])} ». Au suivant.`}</p>`
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
