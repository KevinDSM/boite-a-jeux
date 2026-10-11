/* Menteur — l'équivalent maison de Perudo, de 2 à 6 joueurs (robots compris).

   Chacun a 5 dés cachés sous son gobelet. À tour de rôle, on annonce « au moins N dés de valeur X » sur
   toute la table, en montant chaque fois : plus de dés, ou autant de dés d'une valeur plus forte.
   Les 1 (les Paco) sont des jokers : ils comptent pour toutes les valeurs. Pour passer aux Paco, il suffit
   de la moitié des dés annoncés (arrondie au-dessus) ; pour en revenir, il en faut le double plus un.
   On n'ouvre pas une manche sur les Paco. Le suivant peut dire « Menteur ! » au lieu de monter : on lève les
   gobelets, et celui qui a tort perd un dé. Il ouvre la manche suivante. Le dernier avec des dés gagne.

   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.mt), actions « mt:… ».
   LES DÉS DES AUTRES NE SONT JAMAIS DANS TA VUE avant la levée des gobelets. Réutilise shuffle (core.js). */

'use strict';

const Menteur = (() => {
  const START = 5, MIN = 2, MAX = 6;
  const BOT_MS = [1300, 2600], ABSENT_MS = 15000, AUTO_NEXT_MS = 16000;
  const FACE = ['', 'Paco', 'deux', 'trois', 'quatre', 'cinq', 'six'];
  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };
  const roll = n => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => a - b);
  const alive = room => room.order.filter(id => pl(room, id)?.n > 0);
  const total = room => alive(room).reduce((a, id) => a + pl(room, id).n, 0);
  const curId = room => room.order[room.turn];
  const between = ([a, b]) => a + Math.random() * (b - a);
  /** « 4 cinq », « 3 Paco » */
  const bidText = b => `${b.q} ${b.f === 1 ? 'Paco' : FACE[b.f]}`;

  /** La plus petite annonce permise sur la valeur f après prev ; null si interdit (ouvrir sur les Paco). */
  function minQ(prev, f) {
    if (!prev) return f === 1 ? null : 1;
    if (prev.f === 1) return f === 1 ? prev.q + 1 : prev.q * 2 + 1;
    if (f === 1) return Math.ceil(prev.q / 2);
    return f > prev.f ? prev.q : prev.q + 1;
  }
  const legal = (prev, q, f) => { const m = minQ(prev, f); return m != null && q >= m; };
  /** Les dés qui comptent pour la valeur f : les f, et les Paco si f n'est pas Paco. */
  const counts = (dice, f) => dice.filter(d => d === f || (f !== 1 && d === 1)).length;

  function create({ hostId, players }) {
    const room = {
      hostId, phase: 'bid', round: 0, seq: 0, log: [], outOrder: [], winner: null,
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, n: START, dice: [], inGame: p.online !== false })),
      order: [], turn: 0, bid: null, bids: [], reveal: null, turnAt: Date.now(), botAt: 0,
    };
    room.order = shuffle(room.players.filter(p => p.inGame).map(p => p.id));
    startRound(room, room.order[0]);
    return room;
  }

  function startRound(room, starter) {
    room.round += 1;
    alive(room).forEach(id => { const p = pl(room, id); p.dice = roll(p.n); });
    room.bid = null; room.bids = []; room.reveal = null; room.phase = 'bid';
    room.turn = Math.max(0, room.order.indexOf(starter));
    if (!(pl(room, curId(room))?.n > 0)) nextTurn(room);
    room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS); room.seq += 1;
    log(room, `Manche ${room.round}. ${total(room)} dés sur la table, ${pl(room, curId(room)).name} ouvre.`);
  }
  function nextTurn(room) {
    const n = room.order.length; let g = 0;
    do { room.turn = (room.turn + 1) % n; } while (g++ < n && !(pl(room, curId(room))?.n > 0));
    room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS);
  }

  function bid(room, pid, q, f) {
    if (room.phase !== 'bid') return null;
    if (curId(room) !== pid) return 'Ce n’est pas ton tour';
    q = Math.round(+q); f = Math.round(+f);
    if (!(f >= 1 && f <= 6) || !(q >= 1)) return 'Annonce invalide';
    if (!room.bid && f === 1) return 'On n’ouvre pas sur les Paco';
    if (q > total(room)) return `Il n’y a que ${total(room)} dés sur la table`;
    if (!legal(room.bid, q, f)) return `Il faut au moins ${minQ(room.bid, f)} ${f === 1 ? 'Paco' : FACE[f]}`;
    const p = pl(room, pid);
    room.bid = { q, f, by: pid }; room.bids.push({ q, f, by: pid, name: p.name });
    log(room, `${p.name} : au moins ${bidText(room.bid)}.`);
    nextTurn(room); room.seq += 1;
    return null;
  }

  function call(room, pid) {
    if (room.phase !== 'bid') return null;
    if (curId(room) !== pid) return 'Ce n’est pas ton tour';
    if (!room.bid) return 'Personne n’a encore rien annoncé';
    const b = room.bid, caller = pl(room, pid), bidder = pl(room, b.by);
    const hands = alive(room).map(id => { const p = pl(room, id); return { id, name: p.name, dice: p.dice.slice() }; });
    const count = hands.reduce((a, h) => a + counts(h.dice, b.f), 0);
    const loser = count >= b.q ? caller : bidder;
    loser.n -= 1;
    log(room, `${caller.name} : « Menteur ! » Il y avait ${count} ${b.f === 1 ? 'Paco' : FACE[b.f]}. ${loser.name} perd un dé.`);
    let starter = loser.id;
    if (loser.n === 0) {
      room.outOrder.push(loser.id);
      log(room, `${loser.name} n’a plus de dé.`);
      const i = room.order.indexOf(loser.id), n = room.order.length;
      starter = null; for (let k = 1; k <= n; k++) { const id = room.order[(i + k) % n]; if (pl(room, id).n > 0) { starter = id; break; } }
    }
    room.reveal = { q: b.q, f: b.f, by: b.by, byName: bidder.name, caller: pid, callerName: caller.name, count, loser: loser.id, loserName: loser.name, out: loser.n === 0, hands, starter };
    room.phase = 'reveal'; room.turnAt = Date.now(); room.seq += 1;
    if (alive(room).length <= 1) { room.winner = alive(room)[0] || null; room.phase = 'over'; log(room, `${pl(room, room.winner)?.name} gagne la partie.`); }
    return null;
  }

  // ------------------------------------------------------------ robots
  // Ils estiment combien de dés montrent une valeur : les leurs, plus un tiers des dés cachés (un sixième pour les Paco).
  function botMove(room, p) {
    const prev = room.bid, T = total(room), unknown = T - p.dice.length;
    const expect = f => counts(p.dice, f) + unknown * (f === 1 ? 1 / 6 : 1 / 3);
    if (prev && prev.q > expect(prev.f) + 0.6 + Math.random() * 0.9) return call(room, p.id);
    let best = null;
    for (let f = 1; f <= 6; f++) {
      const m = minQ(prev, f); if (m == null || m > T) continue;
      let q = m; const e = expect(f);
      if (!prev) q = Math.max(1, Math.round(e - 1 - Math.random()));          // une ouverture prudente
      else if (e - m > 1.6 && Math.random() < .4) q = m + 1;                 // un peu de pression
      const score = e - q + counts(p.dice, f) * 0.25 + Math.random() * 0.5;
      if (!best || score > best.score) best = { q, f, score };
    }
    if (!best || (prev && best.score < -0.9)) return prev ? call(room, p.id) : bid(room, p.id, 1, 2);
    return bid(room, p.id, best.q, best.f);
  }

  function tick(room) {
    const now = Date.now();
    if (room.phase === 'bid') {
      const p = pl(room, curId(room)); if (!p) return false;
      if (p.bot && now >= room.botAt) { botMove(room, p); return true; }
      // un joueur parti depuis 15 s : le robot joue sa place, pour que la table ne reste pas bloquée
      if (!p.bot && !p.online && now - room.turnAt > ABSENT_MS) { log(room, `${p.name} est absent, le robot joue à sa place.`); botMove(room, p); return true; }
    }
    if (room.phase === 'reveal' && now - room.turnAt > AUTO_NEXT_MS && !pl(room, room.hostId)?.online) { startRound(room, room.reveal.starter); return true; }
    return false;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'mt:bid': return bid(room, pid, m.q, m.f);
      case 'mt:call': return call(room, pid);
      case 'mt:next': if (pid === room.hostId && room.phase === 'reveal') startRound(room, room.reveal.starter); return null;
    }
    return null;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; room.seq += 1; return; }
    room.players.push({ id, name, online: true, bot: false, n: 0, dice: [], inGame: false });   // il regarde, il jouera à la prochaine partie
    room.seq += 1;
  }
  function setOnline(room, id, on) { const p = pl(room, id); if (p) { p.online = on; room.seq += 1; } }

  // ------------------------------------------------------------ ce que voit chaque téléphone
  function view(room, pid) {
    const me = pl(room, pid), cur = curId(room), T = total(room);
    const myTurn = room.phase === 'bid' && cur === pid && me?.n > 0;
    const shown = room.phase === 'reveal' || room.phase === 'over';
    return {
      phase: room.phase, round: room.round, seq: room.seq, isHost: pid === room.hostId, total: T, since: room.turnAt,
      players: room.order.map(id => pl(room, id)).map(p => ({ id: p.id, name: p.name, bot: p.bot, online: p.online, n: p.n, out: p.n === 0, turn: room.phase === 'bid' && p.id === cur, me: p.id === pid })),
      me: me ? { inGame: me.inGame && me.n > 0, n: me.n, dice: me.n > 0 && (room.phase === 'bid' || shown) ? me.dice.slice() : [] } : null,
      currentId: room.phase === 'bid' ? cur : null, currentName: pl(room, cur)?.name || '',
      bid: room.bid ? { ...room.bid, name: pl(room, room.bid.by)?.name || '' } : null, bids: room.bids.slice(-8),
      myTurn, canCall: myTurn && !!room.bid,
      min: myTurn ? [1, 2, 3, 4, 5, 6].map(f => { const m = minQ(room.bid, f); return m != null && m <= T ? m : null; }) : null,
      reveal: shown ? room.reveal : null,                                 // les gobelets ne se lèvent qu'ici
      winner: room.winner, winnerName: pl(room, room.winner)?.name || '',
      ranking: room.phase === 'over' ? [room.winner, ...room.outOrder.slice().reverse()].map(id => ({ id, name: pl(room, id)?.name || '', n: pl(room, id)?.n || 0 })) : null,
      log: room.log.slice(-14),
    };
  }

  return { START, MIN, MAX, FACE, minQ, legal, counts, bidText, create, act, tick, join, setOnline, view };
})();
if (typeof module !== 'undefined') module.exports = Menteur;
