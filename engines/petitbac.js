/* Petit Brevet (ex-Petit Bac) — une lettre, des catégories, et le premier qui a tout rempli crie « Stop ! ».
   Option « sans stop » : chacun touche « J'ai fini », la manche s'arrête quand tout le monde a fini.

   Déroulement d'une manche : une lettre est tirée, chacun remplit ses catégories sur son téléphone
   (réponses envoyées à l'hôte au fil de la frappe, en silence). Le chrono s'arrête à la fin du temps
   ou quand un joueur qui a tout rempli touche « Stop ! » : trois secondes de grâce, puis vérification.
   Chacun peut contester les réponses des autres ; une réponse contestée par au moins la moitié des
   autres joueurs est refusée, l'hôte peut trancher. Points : 10 pour une réponse unique, 5 si
   quelqu'un a la même, 0 si vide, fausse ou refusée.
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.pb), actions « pb:… ».
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, norm, net et view. */

'use strict';

const PetitBac = (() => {
  const CATEGORIES = [
    'Prénom', 'Pays', 'Ville', 'Animal', 'Métier', 'Fruit ou légume', 'Objet', 'Marque',
    'Célébrité', 'Film ou série', 'Sport ou loisir', 'Plat ou aliment', 'Chanteur ou groupe', 'Personnage de fiction',
    'Vêtement ou accessoire', 'Moyen de transport', 'Partie du corps', 'Instrument de musique', 'Couleur',
    'Mot anglais', 'Dans une cuisine', 'Dans une salle de bain', 'Excuse pour être en retard', 'Cadeau nul',
    'Chose qui fait peur', 'Chose qu’on emporte en vacances', 'Insulte gentille', 'Jeu ou jouet',
  ];
  const DEFAULT = ['Prénom', 'Pays', 'Ville', 'Animal', 'Métier', 'Fruit ou légume', 'Objet', 'Marque'];
  const EASY = 'ABCDEFGHIJLMNOPRSTUV', HARD = 'KQWXYZ';
  const GRACE_MS = 3000, MAX_CATS = 14, ANSWER_MAX = 40;
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  // les articles ne comptent pas : « La Rochelle » vaut pour R, « L'Oréal » pour O
  const core = s => norm(s).replace(/^(le|la|les|l|un|une|des|du|de|d)\s+/, '').trim();
  const same = s => core(s).replace(/\s+/g, '').replace(/(s|x)$/, '');

  const pl = (room, id) => room.players.find(p => p.id === id);
  const seated = room => room.players.filter(p => p.inRound);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };

  function create({ hostId, players, cats, rounds, seconds, hard, stopRule }) {
    const list = (Array.isArray(cats) ? cats : DEFAULT).map(c => String(c).trim().slice(0, 40)).filter(Boolean).slice(0, MAX_CATS);
    const room = {
      hostId, phase: 'write', round: 0, rounds: clamp(rounds, 1, 20, 5), seconds: clamp(seconds, 30, 600, 120), hard: !!hard, stopRule: stopRule !== false, done: {},
      cats: list.length ? list : DEFAULT.slice(),
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, score: 0, inRound: false, last: 0 })),
      letter: '', used: [], answers: {}, stopBy: null, endsAt: 0, contests: {}, force: {}, ready: {}, result: null, log: [], seq: 0,
    };
    startRound(room);
    return room;
  }

  function drawLetter(room) {
    const pool = (EASY + (room.hard ? HARD : '')).split('');
    let free = pool.filter(l => !room.used.includes(l));
    if (!free.length) { room.used = []; free = pool; }
    const l = free[Math.random() * free.length | 0];
    room.used.push(l);
    return l;
  }

  function startRound(room) {
    room.round += 1;
    room.letter = drawLetter(room);
    room.players.forEach(p => { p.inRound = p.online; });
    room.answers = {}; seated(room).forEach(p => room.answers[p.id] = room.cats.map(() => ''));
    room.stopBy = null; room.done = {}; room.contests = {}; room.force = {}; room.ready = {}; room.result = null;
    room.phase = 'write'; room.endsAt = Date.now() + room.seconds * 1000; room.seq += 1;
    log(room, `Manche ${room.round}, la lettre ${room.letter}.`);
  }

  function setAnswers(room, pid, list) {
    if (!['write', 'stop'].includes(room.phase) || !room.answers[pid] || !Array.isArray(list)) return 'silent';
    room.answers[pid] = room.cats.map((_, i) => String(list[i] ?? '').slice(0, ANSWER_MAX));
    return 'silent';
  }

  // sans la règle du stop : chacun dit qu'il a fini, la manche s'arrête quand tout le monde a fini
  function finish(room, pid) {
    if (room.phase !== 'write' || !room.answers[pid] || room.stopRule) return null;
    room.done[pid] = !room.done[pid]; room.seq += 1;
    const people = seated(room).filter(p => p.online);
    if (people.length && people.every(p => room.done[p.id])) { room.phase = 'stop'; room.endsAt = Date.now() + GRACE_MS; room.seq += 1; log(room, 'Tout le monde a fini.'); }
    return null;
  }

  function stop(room, pid) {
    if (room.phase !== 'write' || !room.answers[pid]) return null;
    if (!room.stopRule) return finish(room, pid);
    if (room.answers[pid].some(a => !a.trim())) return 'Remplis toutes les catégories pour dire stop';
    room.stopBy = pid; room.phase = 'stop'; room.endsAt = Date.now() + GRACE_MS; room.seq += 1;
    log(room, `${pl(room, pid).name} crie « Stop ! ».`);
    return null;
  }

  const key = (pid, i) => `${pid}|${i}`;
  const letterOk = (room, a) => { const c = core(a); return c.length >= 2 && c[0] === norm(room.letter); };

  /** Validité de chaque réponse et points qui en découlent, recalculés à la volée. */
  function evaluate(room) {
    const people = seated(room);
    const cells = {};
    room.cats.forEach((_, i) => {
      people.forEach(p => {
        const a = (room.answers[p.id]?.[i] || '').trim(), k = key(p.id, i);
        const voters = people.filter(q => q.id !== p.id && q.online).length;
        const against = (room.contests[k] || []).length;
        const auto = a ? letterOk(room, a) : false;
        let valid = auto && !(voters > 0 && against >= Math.ceil(voters / 2));
        if (a && room.force[k] !== undefined) valid = room.force[k];
        cells[k] = { a, auto, valid, against, forced: room.force[k] ?? null };   // null et non undefined : passe le réseau
      });
      const groups = {};
      people.forEach(p => { const c = cells[key(p.id, i)]; if (c.valid) (groups[same(c.a)] = groups[same(c.a)] || []).push(p.id); });
      people.forEach(p => { const c = cells[key(p.id, i)]; c.points = c.valid ? (groups[same(c.a)].length > 1 ? 5 : 10) : 0; c.dup = c.valid && groups[same(c.a)].length > 1; });
    });
    const totals = {}; people.forEach(p => totals[p.id] = room.cats.reduce((s, _, i) => s + cells[key(p.id, i)].points, 0));
    return { cells, totals };
  }

  function contest(room, pid, target, i) {
    if (room.phase !== 'vote' || pid === target || !pl(room, pid)?.inRound || !room.answers[target]) return null;
    const k = key(target, i), list = room.contests[k] || (room.contests[k] = []);
    const at = list.indexOf(pid);
    if (at >= 0) list.splice(at, 1); else list.push(pid);
    delete room.ready[pid]; room.seq += 1;
    return null;
  }
  function force(room, pid, target, i, value) {
    if (room.phase !== 'vote' || pid !== room.hostId) return null;
    const k = key(target, i);
    if (value === null || value === undefined) delete room.force[k]; else room.force[k] = !!value;
    room.seq += 1;
    return null;
  }
  function ready(room, pid) {
    if (room.phase !== 'vote' || !pl(room, pid)?.inRound) return null;
    room.ready[pid] = !room.ready[pid]; room.seq += 1;
    if (seated(room).filter(p => p.online).every(p => room.ready[p.id])) score(room);
    return null;
  }

  function score(room) {
    const { cells, totals } = evaluate(room);
    seated(room).forEach(p => { p.last = totals[p.id]; p.score += totals[p.id]; });
    room.result = { cells, totals, letter: room.letter };
    room.phase = room.round >= room.rounds ? 'over' : 'result'; room.seq += 1;
    const best = seated(room).sort((a, b) => totals[b.id] - totals[a.id])[0];
    if (best) log(room, `Manche ${room.round}, ${best.name} marque le plus avec ${totals[best.id]} points.`);
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'pb:ans': return setAnswers(room, pid, m.answers);
      case 'pb:stop': return stop(room, pid);
      case 'pb:done': return finish(room, pid);
      case 'pb:contest': return contest(room, pid, m.target, m.i);
      case 'pb:force': return force(room, pid, m.target, m.i, m.value);
      case 'pb:ready': return ready(room, pid);
      case 'pb:score': if (pid === room.hostId && room.phase === 'vote') score(room); return null;
      case 'pb:next': if (pid === room.hostId && room.phase === 'result') startRound(room); return null;
    }
    return null;
  }

  function tick(room) {
    const now = Date.now();
    if (room.phase === 'write' && now >= room.endsAt) { room.phase = 'stop'; room.endsAt = now + GRACE_MS; room.seq += 1; log(room, 'Temps écoulé !'); return true; }
    if (room.phase === 'stop' && now >= room.endsAt) { room.phase = 'vote'; room.seq += 1; return true; }
    return false;
  }

  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, score: 0, inRound: false, last: 0 });      // jouera à la manche suivante
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on;
    if (!on && room.phase === 'vote' && seated(room).filter(q => q.online).every(q => room.ready[q.id])) score(room);
    if (!on && room.phase === 'write' && !room.stopRule) { const people = seated(room).filter(q => q.online); if (people.length && people.every(q => room.done[q.id])) { room.phase = 'stop'; room.endsAt = Date.now() + GRACE_MS; room.seq += 1; } }
  }

  function view(room, pid) {
    const me = pl(room, pid), open = ['vote', 'result', 'over'].includes(room.phase);
    const ev = open ? (room.phase === 'vote' ? evaluate(room) : { cells: room.result.cells, totals: room.result.totals }) : null;
    const people = seated(room);
    return {
      phase: room.phase, round: room.round, rounds: room.rounds, letter: room.letter, cats: room.cats, seq: room.seq, seconds: room.seconds,
      isHost: pid === room.hostId, seated: !!me?.inRound, left: Math.max(0, room.endsAt - Date.now()),
      stopBy: room.stopBy ? pl(room, room.stopBy)?.name : null, stopRule: room.stopRule,
      meDone: !!room.done[pid], doneCount: people.filter(p => room.done[p.id]).length, doneNeeded: people.filter(p => p.online).length,
      mine: me?.inRound ? room.answers[pid] : null,
      grid: open ? people.map(p => ({ id: p.id, name: p.name, me: p.id === pid, cells: room.cats.map((_, i) => { const c = ev.cells[key(p.id, i)]; return { ...c, mine: (room.contests[key(p.id, i)] || []).includes(pid) }; }), total: ev.totals[p.id] })) : null,
      ready: people.filter(p => room.ready[p.id]).length, readyNeeded: people.filter(p => p.online).length, meReady: !!room.ready[pid],
      scores: [...room.players].filter(p => p.inRound || p.score).sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score, last: p.last, me: p.id === pid })),
      waiting: room.players.filter(p => !p.inRound && p.online).map(p => p.name),
      log: room.log.slice(-3),
    };
  }

  return { CATEGORIES, DEFAULT, MAX_CATS, core, same, create, act, tick, join, setOnline, view, evaluate };
})();
