/* Diapason — l'équivalent maison de Wavelength : se mettre sur la même longueur d'onde.

   Une carte donne deux extrêmes (« Froid ↔ Chaud »). Le médium est seul à voir où se cache la cible
   sur le cadran ; il donne un indice (un mot, un nom, n'importe quoi) qui la situe entre les deux.
   Les autres placent l'aiguille au jugé : plein centre 4 points, puis 3, puis 2.

   Deux façons de jouer :
   - Chacun pour soi : le médium tourne, chacun place sa propre aiguille sur son téléphone ; le médium
     gagne la moyenne des points des autres (un bon indice profite à tout le monde).
   - En équipes (la règle d'origine) : l'équipe du médium déplace une aiguille commune, en direct sur
     tous les écrans, puis l'équipe adverse parie que la cible est plus à gauche ou plus à droite
     (1 point, sauf en plein centre). Une équipe en retard qui fait un 4 rejoue aussitôt.
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.dp), actions « dp:… ».
   Chargé après app.js et diapason-cartes.js : réutilise $, el, act, esc, toast, shuffle, net et view. */

'use strict';

const Diapason = (() => {
  const BANDS = [[2.5, 4], [7.5, 3], [12.5, 2]];               // demi-largeur de chaque zone, en % du cadran
  const TEAMS = ['Corail', 'Lagon'], SEEN_KEY = 'dp-seen';
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const points = d => { for (const [w, p] of BANDS) if (d <= w) return p; return 0; };
  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };
  const members = (room, t) => room.order.map(id => pl(room, id)).filter(p => p && p.team === t);
  const online = list => list.filter(p => p.online);
  const guessers = room => room.order.map(id => pl(room, id)).filter(p => p.online && p.id !== room.psychicId);

  function deck() {
    let seen = new Set(); try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { }
    const ids = [...DP_CARDS.keys()];
    return shuffle(ids.filter(i => seen.has(i))).concat(shuffle(ids.filter(i => !seen.has(i))));   // pop() : les cartes jamais vues d'abord
  }
  function remember(i) { try { const s = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); s.add(i); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-150))); } catch { } }
  function draw(room) {
    if (!room.deck.length) room.deck = deck();
    room.card = room.deck.pop(); remember(room.card);
  }

  function create({ hostId, players, mode, tours, target }) {
    const room = {
      hostId, mode: mode === 'teams' ? 'teams' : 'solo', tours: clamp(tours, 1, 5, 1), target: clamp(target, 5, 30, 10),
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, score: 0, team: 0 })),
      order: [], deck: deck(), card: 0, pos: 50, clue: '', rerolls: 2, psychicId: null,
      phase: 'clue', round: 0, rounds: 0, guesses: {}, dial: 50, side: null, sideBy: null, result: null,
      teams: TEAMS.map(name => ({ name, score: 0, psy: -1 })), active: Math.random() < .5 ? 0 : 1, again: false,
      log: [], seq: 0, turnAt: Date.now(), winner: null,
    };
    room.order = shuffle(room.players.filter(p => p.online).map(p => p.id));
    room.order.forEach((id, i) => { pl(room, id).team = i % 2; });
    room.rounds = room.mode === 'solo' ? room.tours * room.order.length : 0;
    nextRound(room, true);
    return room;
  }

  function nextRound(room, first) {
    if (!first && room.mode === 'solo' && room.round >= room.rounds) return over(room);   // tour sauté à la dernière manche
    room.round += 1;
    if (room.mode === 'solo') {
      const n = room.order.length; let k = (room.round - 1) % n, g = 0;
      while (g++ < n && !pl(room, room.order[k])?.online) k = (k + 1) % n;
      room.psychicId = room.order[k];
    } else {
      if (!first && !room.again) room.active = 1 - room.active;
      room.again = false;
      const t = room.teams[room.active], mem = online(members(room, room.active));
      if (!mem.length) { room.active = 1 - room.active; }
      const m2 = online(members(room, room.active)), t2 = room.teams[room.active];
      t2.psy = (t2.psy + 1) % Math.max(1, m2.length);
      room.psychicId = m2[t2.psy]?.id || null;
      void t;
    }
    draw(room);
    room.pos = Math.round((4 + Math.random() * 92) * 2) / 2;
    room.clue = ''; room.rerolls = 2; room.guesses = {}; room.dial = 50; room.side = null; room.sideBy = null; room.result = null;
    room.phase = 'clue'; room.turnAt = Date.now(); room.seq += 1;
  }

  function reveal(room) {
    const d = v => Math.abs(v - room.pos);
    if (room.mode === 'solo') {
      const list = Object.entries(room.guesses).map(([id, value]) => { const p = pl(room, id); const pts = points(d(value)); if (p) p.score += pts; return { id, name: p?.name || '?', value, pts }; });
      const psyGain = list.length ? Math.round(list.reduce((a, g) => a + g.pts, 0) / list.length) : 0;
      const psy = pl(room, room.psychicId); if (psy) psy.score += psyGain;
      room.result = { guesses: list.sort((a, b) => b.pts - a.pts || d(a.value) - d(b.value)), psyGain };
      const best = list.filter(g => g.pts === 4).map(g => g.name);
      const who = best.length > 1 ? best.slice(0, -1).join(', ') + ' et ' + best[best.length - 1] : best[0];
      log(room, best.length ? `Plein centre pour ${who}.` : `Manche ${room.round}, ${list.length ? 'meilleur score ' + (list[0]?.pts || 0) : 'personne n’a joué'}.`);
    } else {
      const pts = points(d(room.dial)), act = room.teams[room.active], other = room.teams[1 - room.active];
      act.score += pts;
      let sideOk = null;
      if (room.side) { sideOk = pts < 4 && ((room.side === 'left' && room.pos < room.dial) || (room.side === 'right' && room.pos > room.dial)); if (sideOk) other.score += 1; }
      if (pts === 4 && act.score < other.score) room.again = true;
      room.result = { pts, sideOk, again: room.again, dial: room.dial };
      log(room, `Équipe ${act.name}, ${pts} point${pts > 1 ? 's' : ''}.${sideOk ? ` 1 point pour ${other.name}.` : ''}`);
    }
    room.phase = 'reveal'; room.turnAt = Date.now(); room.seq += 1;
    return null;
  }
  function checkGuesses(room) {
    if (room.phase === 'guess' && room.mode === 'solo' && guessers(room).every(p => room.guesses[p.id] !== undefined)) reveal(room);
  }
  function lock(room) {
    const others = online(members(room, 1 - room.active));
    if (others.length) { room.phase = 'side'; room.turnAt = Date.now(); room.seq += 1; return null; }
    return reveal(room);
  }
  function next(room, pid) {
    if (room.phase !== 'reveal' || (pid !== room.hostId && pid !== room.psychicId)) return null;
    if (room.mode === 'solo' && room.round >= room.rounds) return over(room);
    if (room.mode === 'teams') {
      const [a, b] = room.teams.map(t => t.score);
      if (Math.max(a, b) >= room.target && a !== b) return over(room);
    }
    nextRound(room); return null;
  }
  function over(room) {
    room.phase = 'over'; room.seq += 1;
    if (room.mode === 'teams') room.winner = room.teams[0].score > room.teams[1].score ? 0 : 1;
    else room.winner = [...room.players].sort((a, b) => b.score - a.score)[0]?.id || null;
    return null;
  }

  function act(room, pid, m) {
    const me = pl(room, pid), isPsy = pid === room.psychicId;
    switch (m.t) {
      case 'dp:reroll':
        if (room.phase !== 'clue' || !isPsy || room.rerolls <= 0) return null;
        room.rerolls -= 1; draw(room); room.seq += 1; return null;
      case 'dp:clue':
        if (room.phase !== 'clue' || !isPsy) return null;
        room.clue = String(m.text || '').trim().slice(0, 80);
        room.phase = 'guess'; room.turnAt = Date.now(); room.seq += 1;
        log(room, room.clue ? `${me.name} lance « ${room.clue} ».` : `${me.name} donne son indice à voix haute.`);
        if (room.mode === 'solo') checkGuesses(room);
        return null;
      case 'dp:guess':
        if (room.phase !== 'guess' || room.mode !== 'solo' || !me || isPsy || room.guesses[pid] !== undefined) return null;
        room.guesses[pid] = clamp(m.value, 0, 100, 50); room.seq += 1; checkGuesses(room); return null;
      case 'dp:dial':
        if (room.phase !== 'guess' || room.mode !== 'teams' || !me || isPsy || me.team !== room.active) return null;
        room.dial = clamp(m.value, 0, 100, room.dial); room.seq += 1; return null;
      case 'dp:lock':
        if (room.phase !== 'guess' || room.mode !== 'teams' || !me || isPsy || me.team !== room.active) return null;
        if (m.value !== undefined) room.dial = clamp(m.value, 0, 100, room.dial);
        log(room, `${me.name} valide l’aiguille pour l’équipe ${room.teams[room.active].name}.`);
        return lock(room);
      case 'dp:side':
        if (room.phase !== 'side' || !me || me.team === room.active || (m.dir !== 'left' && m.dir !== 'right')) return null;
        room.side = m.dir; room.sideBy = me.name; return reveal(room);
      case 'dp:next': return next(room, pid);
      case 'dp:skip':
        if (pid !== room.hostId) return null;
        if (room.phase === 'clue') { log(room, 'Le médium passe son tour.'); room.again = true; nextRound(room); if (room.mode === 'solo') { /* le tour sauté compte quand même */ } return null; }
        if (room.phase === 'guess') return room.mode === 'solo' ? reveal(room) : lock(room);
        if (room.phase === 'side') return reveal(room);
        return null;
    }
    return null;
  }
  // les robots : un indice qui dit à peu près où est la cible, et des aiguilles posées au jugé autour
  function botClue(room) {
    const low = t => /^\p{Lu}\p{Ll}/u.test(t) ? t[0].toLowerCase() + t.slice(1) : t;    // « Mal payé » devient « plutôt mal payé »
    const [l, r] = DP_CARDS[room.card].map(low), p = room.pos;
    return p < 15 ? `Complètement ${l}` : p < 33 ? `Plutôt ${l}` : p < 45 ? `Un peu ${l}` : p <= 55 ? 'Pile entre les deux' : p <= 67 ? `Un peu ${r}` : p <= 85 ? `Plutôt ${r}` : `Complètement ${r}`;
  }
  function botGuess(room) {
    const noise = (Math.random() + Math.random() + Math.random() - 1.5) * 16;
    return Math.round(Math.max(0, Math.min(100, room.pos + noise)) * 2) / 2;
  }
  function tick(room) {
    if (Date.now() - room.turnAt < 1800 || Math.random() < .4) return false;
    const psy = pl(room, room.psychicId);
    if (room.phase === 'clue' && psy?.bot) { act(room, psy.id, { t: 'dp:clue', text: botClue(room) }); return true; }
    if (room.phase === 'guess') {
      if (room.mode === 'solo') { const b = guessers(room).find(p => p.bot && room.guesses[p.id] === undefined); if (b) { act(room, b.id, { t: 'dp:guess', value: botGuess(room) }); return true; } }
      else {
        const team = online(members(room, room.active)).filter(p => p.id !== room.psychicId);
        if (team.length && team.every(p => p.bot) && Date.now() - room.turnAt > 3500) { act(room, team[0].id, { t: 'dp:lock', value: botGuess(room) }); return true; }
      }
    }
    if (room.phase === 'side') {
      const opp = online(members(room, 1 - room.active));
      if (opp.length && opp.every(p => p.bot)) { act(room, opp[0].id, { t: 'dp:side', dir: Math.random() < .5 ? 'left' : 'right' }); return true; }
    }
    return false;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    const sizes = [0, 1].map(t => online(members(room, t)).length);
    room.players.push({ id, name, online: true, score: 0, team: sizes[0] <= sizes[1] ? 0 : 1 });
    room.order.push(id);
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on; if (on) return;
    if (id === room.psychicId && room.phase === 'clue') { room.again = true; nextRound(room); return; }
    checkGuesses(room);
  }
  const teamList = room => room.teams.map((t, i) => ({ name: t.name, score: t.score, members: members(room, i).map(p => p.name) }));
  const ranking = room => [...room.players].filter(p => room.order.includes(p.id)).sort((a, b) => b.score - a.score);

  function view(room, pid) {
    const me = pl(room, pid), isPsy = pid === room.psychicId, open = room.phase === 'reveal' || room.phase === 'over';
    const psy = pl(room, room.psychicId);
    return {
      phase: room.phase, mode: room.mode, round: room.round, rounds: room.rounds, target: room.target, seq: room.seq, isHost: pid === room.hostId,
      card: DP_CARDS[room.card], pos: isPsy || open ? room.pos : null, clue: room.clue, psychicName: psy?.name || '', isPsychic: isPsy, rerolls: isPsy ? room.rerolls : 0,
      seated: !!me, myTeam: me ? me.team : null, active: room.active, teams: room.mode === 'teams' ? teamList(room) : null,
      canDial: room.mode === 'teams' && room.phase === 'guess' && !!me && me.team === room.active && !isPsy,
      canSide: room.mode === 'teams' && room.phase === 'side' && !!me && me.team !== room.active,
      canGuess: room.mode === 'solo' && room.phase === 'guess' && !!me && !isPsy && room.guesses[pid] === undefined,
      dial: room.dial, myGuess: room.guesses[pid] ?? null, side: room.side, sideBy: room.sideBy,
      waiting: room.mode === 'solo' && room.phase === 'guess' ? guessers(room).filter(p => room.guesses[p.id] === undefined).map(p => p.name) : [],
      result: open ? room.result : null, quiet: Date.now() - room.turnAt,
      players: ranking(room).map(p => ({ id: p.id, name: p.name, score: p.score, online: p.online, me: p.id === pid, psychic: p.id === room.psychicId, team: p.team, done: room.phase === 'guess' && room.guesses[p.id] !== undefined })),
      winnerName: room.phase === 'over' ? (room.mode === 'teams' ? 'L’équipe ' + room.teams[room.winner].name : pl(room, room.winner)?.name || '') : '',
      log: room.log.slice(-3),
    };
  }
  return { BANDS, points, create, act, tick, join, setOnline, view, teamList, ranking };
})();
