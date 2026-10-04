/* Chromo — l'équivalent maison d'un jeu de cartes de couleurs : se débarrasser de toutes ses cartes.

   108 cartes : 4 couleurs (0 une fois, 1 à 9 deux fois, Passe, Sens et +2 deux fois chacune),
   4 Jokers et 4 Jokers +4. Même modèle que Sablier et Undercover : la salle vit chez l'hôte
   (net.game.chromo), chaque joueur reçoit une vue où seule SA main apparaît, les actions arrivent
   en messages « ch:… ». Les robots jouent dans le tick de l'hôte.
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle et view. */

'use strict';

const Chromo = (() => {
  const COLORS = ['r', 'y', 'g', 'b'];
  const COLOR_NAME = { r: 'rouge', y: 'jaune', g: 'vert', b: 'bleu' };
  const BOT_NAMES = ['Robot Pixel', 'Robot Zinc', 'Robot Mira', 'Robot Quartz'];
  const BOT_DELAY = 1100;           // un robot « réfléchit » un peu avant de jouer
  const CATCH_DELAY = 2600;         // un robot attrape l'oubli de « Chromo ! » après ce délai
  const isNumber = v => /^[0-9]$/.test(v);
  const points = v => isNumber(v) ? +v : (v === 'wild' || v === '+4') ? 50 : 20;
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

  function buildDeck() {
    const d = []; let n = 0;
    COLORS.forEach(c => {
      d.push({ id: 'k' + n++, c, v: '0' });
      for (let k = 0; k < 2; k++) ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', '+2'].forEach(v => d.push({ id: 'k' + n++, c, v }));
    });
    for (let k = 0; k < 4; k++) { d.push({ id: 'k' + n++, c: 'w', v: 'wild' }); d.push({ id: 'k' + n++, c: 'w', v: '+4' }); }
    return shuffle(d);
  }

  const pl = (room, id) => room.players.find(p => p.id === id);
  const top = room => room.discard[room.discard.length - 1];
  const currentId = room => room.order[room.turn];
  const activeCount = room => room.order.filter(id => pl(room, id)?.online).length;
  const trimLog = room => { if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };

  function cardLabel(c) {
    const v = c.v === 'skip' ? 'Passe' : c.v === 'rev' ? 'Sens' : c.v === 'wild' ? 'Joker' : c.v === '+4' ? 'Joker +4' : c.v;
    return c.c === 'w' ? v : `${v} ${COLOR_NAME[c.c]}`;
  }

  function canPlay(room, card) {
    const t = top(room);
    if (room.pending > 0) {                               // un +2 ou un +4 attend : on contre ou on pioche
      if (!room.settings.stack) return false;
      return card.v === '+4' || (card.v === '+2' && t.v === '+2');
    }
    return card.c === 'w' || card.c === room.color || card.v === t.v;
  }

  /** Le joueur situé k places plus loin dans le sens du jeu, en sautant les absents. */
  function peekNext(room, k = 1) {
    const n = room.order.length; let t = room.turn, got = 0, guard = 0;
    while (got < k && guard++ < n * 4) { t = ((t + room.dir) % n + n) % n; if (pl(room, room.order[t])?.online) got++; }
    return room.order[t];
  }
  function advance(room, steps = 1) {
    room.turn = room.order.indexOf(peekNext(room, steps));
    room.drew = null; room.turnAt = Date.now();
  }
  function skipOfflineTurn(room) {
    const n = room.order.length; let guard = 0;
    while (guard++ < n && !pl(room, currentId(room))?.online) room.turn = ((room.turn + room.dir) % n + n) % n;
    room.turnAt = Date.now();
  }

  function drawCards(room, id, n) {
    const p = pl(room, id), got = [];
    for (let i = 0; i < n; i++) {
      if (!room.draw.length && room.discard.length > 1) {   // pioche vide : on rebat la défausse, sauf la carte du dessus
        const t = room.discard.pop(); room.draw = shuffle(room.discard); room.discard = [t];
      }
      if (!room.draw.length) break;
      const c = room.draw.pop(); p.hand.push(c); got.push(c);
    }
    if (p.hand.length > 1) { delete room.called[id]; if (room.vulnerable === id) room.vulnerable = null; }
    return got;
  }

  function create({ hostId, players, rounds, stack, bots, zero }) {
    const room = {
      hostId, round: 0, phase: 'play',
      settings: { rounds: clamp(rounds, 1, 10, 3), stack: !!stack, zero: !!zero },
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: false, score: 0, hand: [], inRound: false })),
    };
    const nb = clamp(bots, 0, 4, 0);
    for (let i = 0; i < nb; i++) room.players.push({ id: 'bot' + i, name: BOT_NAMES[i], online: true, bot: true, score: 0, hand: [], inRound: false });
    startRound(room);
    return room;
  }

  function startRound(room) {
    room.round += 1;
    room.draw = buildDeck(); room.discard = [];
    room.order = shuffle(room.players.filter(p => p.online).map(p => p.id));
    room.players.forEach(p => { p.hand = []; p.inRound = room.order.includes(p.id); });
    for (let k = 0; k < 7; k++) room.order.forEach(id => pl(room, id).hand.push(room.draw.pop()));
    const back = []; let first;
    while ((first = room.draw.pop()) && !isNumber(first.v)) back.push(first);   // on retourne un chiffre pour commencer
    room.draw = shuffle(room.draw.concat(back));
    room.discard.push(first); room.color = first.c;
    room.dir = 1; room.turn = 0; room.pending = 0; room.drew = null;
    room.called = {}; room.vulnerable = null; room.vulnerableAt = 0; room.playSeq = 0;
    room.log = [`Manche ${room.round}. On ouvre sur un ${cardLabel(first)}.`];
    room.result = null; room.phase = 'play';
    skipOfflineTurn(room);
  }

  // un joueur qui agit à son tour met fin à la fenêtre pour attraper le précédent
  function closeCatchWindow(room, pid) {
    if (room.vulnerable && room.vulnerable !== pid && currentId(room) === pid) room.vulnerable = null;
  }

  function play(room, pid, cardId, color) {
    if (room.phase !== 'play') return null;
    if (currentId(room) !== pid) return 'Ce n’est pas ton tour';
    const p = pl(room, pid), idx = p.hand.findIndex(c => c.id === cardId);
    if (idx < 0) return null;
    const card = p.hand[idx];
    if (room.drew && room.drew !== cardId) return 'Tu ne peux jouer que la carte piochée, ou passer';
    if (!canPlay(room, card)) return room.pending > 0 ? `Tu dois piocher ${room.pending} cartes${room.settings.stack ? ' ou contrer' : ''}` : 'Même couleur ou même symbole';
    if (card.c === 'w' && !COLORS.includes(color)) return 'Choisis une couleur';
    closeCatchWindow(room, pid);
    p.hand.splice(idx, 1);
    room.discard.push(card); room.color = card.c === 'w' ? color : card.c; room.playSeq += 1;
    let text = `${p.name} pose un ${cardLabel(card)}` + (card.c === 'w' ? ` et choisit le ${COLOR_NAME[color]}` : '');
    if (p.hand.length === 1 && !room.called[pid]) { room.vulnerable = pid; room.vulnerableAt = Date.now(); }

    if (p.hand.length === 0) {                          // manche gagnée : les pioches dues s'appliquent d'abord
      if (card.v === '+2' || card.v === '+4') {
        const victim = peekNext(room, 1), n = room.pending + (card.v === '+2' ? 2 : 4);
        if (victim && victim !== pid) { drawCards(room, victim, n); text += `, ${pl(room, victim).name} pioche ${n}`; }
        room.pending = 0;
      }
      room.log.push(`${text}. ${p.name} gagne la manche !`); trimLog(room);
      return endRound(room, pid);
    }

    // règle du zéro : chacun passe sa main à son voisin, dans le sens du jeu
    if (card.v === '0' && room.settings.zero) {
      const seats = room.order.filter(id => pl(room, id)?.inRound), hands = seats.map(id => pl(room, id).hand);
      const n = seats.length, step = room.dir === 1 ? 1 : -1;
      seats.forEach((id, i) => { pl(room, seats[((i + step) % n + n) % n]).hand = hands[i]; });
      room.called = {}; room.vulnerable = null;
      text += ', les mains tournent d’un cran (règle du zéro)';
    }
    if (card.v === 'skip') {
      text += `, ${pl(room, peekNext(room, 1)).name} passe son tour`; advance(room, 2);
    } else if (card.v === 'rev') {
      room.dir *= -1;
      if (activeCount(room) === 2) { text += `, ${pl(room, peekNext(room, 1)).name} passe son tour`; advance(room, 2); }
      else { text += ', le sens change'; advance(room, 1); }
    } else if (card.v === '+2' || card.v === '+4') {
      const add = card.v === '+2' ? 2 : 4;
      if (room.settings.stack) { room.pending += add; text += `, +${room.pending} en jeu`; advance(room, 1); }
      else { const victim = peekNext(room, 1); drawCards(room, victim, add); text += `, ${pl(room, victim).name} pioche ${add} et passe son tour`; advance(room, 2); }
    } else advance(room, 1);
    room.log.push(text); trimLog(room);
    return null;
  }

  function draw(room, pid) {
    if (room.phase !== 'play') return null;
    if (currentId(room) !== pid) return 'Ce n’est pas ton tour';
    if (room.drew) return 'Joue la carte piochée ou passe';
    closeCatchWindow(room, pid);
    const p = pl(room, pid);
    if (room.pending > 0) {
      const n = room.pending; room.pending = 0; drawCards(room, pid, n);
      room.log.push(`${p.name} pioche ${n} cartes`); trimLog(room); advance(room, 1); return null;
    }
    const [c] = drawCards(room, pid, 1);
    if (c && canPlay(room, c)) { room.drew = c.id; room.log.push(`${p.name} pioche une carte`); }
    else { room.log.push(`${p.name} pioche une carte et passe`); advance(room, 1); }
    trimLog(room); return null;
  }

  function pass(room, pid) {
    if (room.phase !== 'play' || currentId(room) !== pid || !room.drew) return null;
    room.log.push(`${pl(room, pid).name} garde sa carte et passe`); trimLog(room); advance(room, 1);
    return null;
  }

  function call(room, pid) {
    const p = pl(room, pid);
    if (room.phase !== 'play' || !p || !p.inRound || p.hand.length > 2 || room.called[pid]) return null;
    room.called[pid] = true;
    if (room.vulnerable === pid) room.vulnerable = null;
    room.log.push(`${p.name} crie « Chromo ! »`); trimLog(room);
    return null;
  }

  function catchPlayer(room, pid) {
    const v = room.vulnerable, me = pl(room, pid);
    if (room.phase !== 'play' || !v || v === pid || !me?.inRound) return null;
    room.vulnerable = null; drawCards(room, v, 2);
    room.log.push(`${me.name} attrape ${pl(room, v).name}, qui a oublié de crier. Deux cartes de pénalité`); trimLog(room);
    return null;
  }

  function hostSkip(room, pid) {
    if (pid !== room.hostId || room.phase !== 'play') return null;
    const cur = pl(room, currentId(room)); if (!cur || cur.bot) return null;
    const n = room.pending || 1; room.pending = 0; room.drew = null;
    drawCards(room, cur.id, n);
    room.log.push(`L’hôte fait passer ${cur.name}, qui pioche ${n}`); trimLog(room); advance(room, 1);
    return null;
  }

  function endRound(room, winnerId) {
    const w = pl(room, winnerId); let gain = 0; const hands = [];
    room.order.forEach(id => {
      const p = pl(room, id), value = p.hand.reduce((s, c) => s + points(c.v), 0);
      if (id !== winnerId) gain += value;
      hands.push({ id, name: p.name, cards: p.hand.slice(), points: value });
    });
    w.score += gain;
    room.result = { winnerId, winnerName: w.name, points: gain, hands };
    room.phase = 'result'; room.vulnerable = null; room.pending = 0; room.drew = null;
    return null;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'ch:play': return play(room, pid, m.card, m.color);
      case 'ch:draw': return draw(room, pid);
      case 'ch:pass': return pass(room, pid);
      case 'ch:call': return call(room, pid);
      case 'ch:catch': return catchPlayer(room, pid);
      case 'ch:skip': return hostSkip(room, pid);
      case 'ch:next':
        if (pid !== room.hostId || room.phase !== 'result') return null;
        if (room.round >= room.settings.rounds) { room.phase = 'over'; return null; }
        if (room.players.filter(p => p.online).length < 2) return 'Il faut au moins deux joueurs ou robots';
        startRound(room); return null;
    }
    return null;
  }

  // ------------------------------------------------------------ robots
  function bestColor(p, excludeId) {
    const n = { r: 0, y: 0, g: 0, b: 0 };
    p.hand.forEach(c => { if (c.c !== 'w' && c.id !== excludeId) n[c.c]++; });
    const max = Math.max(...Object.values(n));
    const best = COLORS.filter(c => n[c] === max);
    return best[Math.random() * best.length | 0];
  }
  function botMove(room, bot) {
    if (bot.hand.length === 2 && !room.called[bot.id]) call(room, bot.id);
    if (room.drew) {
      const c = bot.hand.find(x => x.id === room.drew);
      return c && canPlay(room, c) ? play(room, bot.id, c.id, bestColor(bot, c.id)) : pass(room, bot.id);
    }
    const options = bot.hand.filter(c => canPlay(room, c));
    if (!options.length) { draw(room, bot.id); if (room.drew) room.turnAt = Date.now() - BOT_DELAY + 700; return null; }
    // garde les jokers pour la fin, se débarrasse d'abord des cartes d'action de la couleur
    const rank = c => c.v === '+4' ? 5 : c.c === 'w' ? 4 : isNumber(c.v) ? (c.c === room.color ? 2 : 3) : 1;
    options.sort((a, b) => rank(a) - rank(b));
    return play(room, bot.id, options[0].id, bestColor(bot, options[0].id));
  }
  function tick(room) {
    if (room.phase !== 'play') return false;
    const now = Date.now();
    if (room.vulnerable && !pl(room, room.vulnerable)?.bot && now - room.vulnerableAt > CATCH_DELAY) {
      const bot = room.order.map(id => pl(room, id)).find(p => p.bot && p.online && p.id !== room.vulnerable);
      if (bot) { catchPlayer(room, bot.id); return true; }
    }
    const cur = pl(room, currentId(room));
    if (!cur || !cur.bot || now - room.turnAt < BOT_DELAY) return false;
    botMove(room, cur);
    return true;
  }

  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, bot: false, score: 0, hand: [], inRound: false });   // jouera à la manche suivante
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p || p.bot) return;
    p.online = on;
    if (!on && room.phase === 'play' && currentId(room) === id) { room.drew = null; skipOfflineTurn(room); }
  }

  function sortHand(h) {
    const co = { r: 0, y: 1, g: 2, b: 3, w: 4 }, vo = v => isNumber(v) ? +v : { skip: 10, rev: 11, '+2': 12, wild: 13, '+4': 14 }[v];
    return h.slice().sort((a, b) => co[a.c] - co[b.c] || vo(a.v) - vo(b.v));
  }

  /** Vue d'un joueur : sa main à lui, le nombre de cartes des autres. */
  function view(room, pid) {
    const me = pl(room, pid), cur = currentId(room), myTurn = room.phase === 'play' && cur === pid;
    return {
      phase: room.phase, round: room.round, rounds: room.settings.rounds, stack: room.settings.stack, zero: room.settings.zero,
      isHost: pid === room.hostId,
      me: me && me.inRound
        ? { inRound: true, hand: sortHand(me.hand), called: !!room.called[pid],
            playable: myTurn ? me.hand.filter(c => (!room.drew || c.id === room.drew) && canPlay(room, c)).map(c => c.id) : [] }
        : { inRound: false, hand: [], called: false, playable: [] },
      players: room.order.map(id => { const p = pl(room, id); return { id, name: p.name, bot: p.bot, online: p.online, count: p.hand.length, score: p.score, called: !!room.called[id] }; }),
      waiting: room.players.filter(p => !p.inRound && p.online).map(p => p.name),
      top: top(room), color: room.color, dir: room.dir, pending: room.pending,
      currentId: cur, myTurn, drewId: myTurn ? room.drew : null,
      drawLeft: room.draw.length, playSeq: room.playSeq,
      vulnerable: room.vulnerable ? { id: room.vulnerable, name: pl(room, room.vulnerable).name } : null,
      log: room.log.slice(-5), result: room.result,
      scores: room.players.filter(p => p.inRound || p.score).map(p => ({ id: p.id, name: p.name, score: p.score, bot: p.bot })).sort((a, b) => b.score - a.score),
    };
  }

  return { COLORS, COLOR_NAME, buildDeck, points, canPlay, create, act, tick, join, setOnline, view, cardLabel };
})();
