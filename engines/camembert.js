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

  const MAX_STREAK = 3;                          // bonnes réponses d'affilée avant de passer la main, en mode « limite »
  function create({ hostId, players, target, diff, replay }) {
    const room = {
      hostId, phase: 'roll', target: clamp(target, 1, 6, 6), diff: ['facile', 'mix', 'dur'].includes(diff) ? diff : 'mix', replay: ['limit', 'always', 'never'].includes(replay) ? replay : 'limit', streak: 0,
      players: players.map((p, i) => ({ id: p.id, name: p.name, online: p.online !== false, pos: (i % 6) * 7, wedges: [false, false, false, false, false, false], answered: 0, right: 0 })),
      order: [], turn: 0, die: null, options: null, q: null, answer: null, guesses: {}, votes: {}, ends: 0, turnAt: Date.now(),
      result: null, winnerId: null, log: [], seen: new Set(), seq: 0,
    };
    room.order = shuffle(room.players.filter(p => p.online).map(p => p.id));
    log(room, room.replay === 'never' ? 'Chacun part de son camembert. Un seul essai par tour.' : room.replay === 'limit' ? `Chacun part de son camembert. Bonne réponse : tu rejoues, ${MAX_STREAK} questions par tour au maximum.` : 'Chacun part de son camembert. Bonne réponse : tu rejoues.');
    beginTurn(room, false);
    return room;
  }

  function beginTurn(room, advance = true) {
    const n = room.order.length;
    if (advance) { room.turn = (room.turn + 1) % n; room.streak = 0; }
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
    if (ok) room.streak += 1;
    room.result = { ok, chosen, correct: q.correct, wedge, right, wrong, final: q.final, timeout: chosen === -1, again: ok && canReplay(room), streak: room.streak, max: room.replay === 'limit' ? MAX_STREAK : null };
    const col = COLORS[q.c].name;
    if (q.final) log(room, ok ? `${p.name} répond juste à la question finale (${col}) et gagne !` : `${p.name} rate la question finale (${col}).`);
    else log(room, ok ? `${p.name} : bonne réponse en ${col}${wedge ? ', part gagnée !' : ''}` : chosen === -1 ? `${p.name} n'a pas répondu à temps (${col}).` : `${p.name} se trompe en ${col}.`);
    if (ok && q.final) { room.phase = 'over'; room.winnerId = p.id; room.seq += 1; return null; }
    room.phase = 'reveal'; room.ends = Date.now() + REVEAL_MS; room.seq += 1;
    return null;
  }

  // rejouer après une bonne réponse, selon la règle choisie dans le salon
  const canReplay = room => room.replay === 'always' || (room.replay === 'limit' && room.streak < MAX_STREAK);

  function next(room, pid) {
    if (room.phase !== 'reveal') return null;
    if (pid !== active(room)?.id && pid !== room.hostId) return null;
    beginTurn(room, !room.result.again);                           // bonne réponse : le même joueur rejoue, dans la limite fixée
    return null;
  }

  function override(room, pid) {
    if (room.phase !== 'reveal' || pid !== room.hostId || room.result.ok) return null;
    const p = active(room), q = room.q;
    room.result.ok = true; room.result.overridden = true;
    p.right += 1; room.streak += 1;
    room.result.again = canReplay(room); room.result.streak = room.streak;
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
    if (room.phase === 'reveal' && now >= room.ends) { beginTurn(room, !room.result.again); return true; }
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
      q: showQ ? { text: q.text, choices: q.choices, c: q.c, hq: q.hq, owned: !!(q.hq && a?.wedges[q.c]), final: q.final, d: q.d, correct: room.phase === 'ask' ? null : q.correct } : null,
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
