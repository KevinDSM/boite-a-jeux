/* Coinche — la belote coinchée, à quatre en deux équipes (partenaires en face), robots pour compléter.

   32 cartes, 8 chacun. Enchères à tour de rôle : un contrat de 80 à 160 (de dix en dix) ou capot, dans une
   couleur d'atout, toujours plus haut ; un adversaire peut coincher (×2) le contrat en cours, et l'équipe
   preneuse peut alors surcoincher (×4). Trois passes après un contrat le ferment ; quatre passes sans contrat,
   on redonne. Au jeu : il faut fournir à la couleur demandée ; sinon couper, sauf si le partenaire est maître ;
   à l'atout, il faut monter si on peut. Belote-rebelote (roi et dame d'atout) : 20 points. Dix de der : 10.
   Annonces simples en option (tierce 20, cinquante 50, cent 100, carrés). Partie en 1000 ou 2000 points.

   Décompte (affiché dans les règles) : contrat réussi si les preneurs atteignent le contrat ET font plus que la
   défense (capot : les huit plis). Réussi : contrat + points faits pour les preneurs, la défense garde ses points.
   Chuté : 160 + contrat pour la défense. Coinché ou surcoinché : le camp gagnant marque 160 + contrat × 2 ou × 4.
   La belote reste toujours à l'équipe qui l'a.

   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.co), actions « co:… ».
   LES MAINS DES AUTRES NE SONT JAMAIS DANS TA VUE. Réutilise shuffle (core.js). */

'use strict';

const Coinche = (() => {
  const SUITS = ['S', 'H', 'D', 'C'], RANKS = ['7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  const SUIT_NAME = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' }, SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANK_NAME = { '7': 'sept', '8': 'huit', '9': 'neuf', '10': 'dix', V: 'valet', D: 'dame', R: 'roi', A: 'as' };
  const TRUMP_ORDER = ['7', '8', 'D', 'R', '10', 'A', '9', 'V'], PLAIN_ORDER = ['7', '8', '9', 'V', 'D', 'R', '10', 'A'];
  const TRUMP_PTS = { V: 20, '9': 14, A: 11, '10': 10, R: 4, D: 3, '8': 0, '7': 0 }, PLAIN_PTS = { A: 11, '10': 10, R: 4, D: 3, V: 2, '9': 0, '8': 0, '7': 0 };
  const BIDS = [80, 90, 100, 110, 120, 130, 140, 150, 160], CAPOT = 250;
  const BOT_MS = [900, 1600], ABSENT_MS = 20000;
  const between = ([a, b]) => a + Math.random() * (b - a);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 50) room.log.splice(0, room.log.length - 50); };
  const cardName = c => `${RANK_NAME[c.r]} de ${SUIT_NAME[c.s]}`;
  const bidName = b => b.capot ? `capot à ${SUIT_NAME[b.suit]}` : `${b.value} à ${SUIT_NAME[b.suit]}`;
  const teamOf = seat => seat % 2;
  const pts = (c, trump) => c.s === trump ? TRUMP_PTS[c.r] : PLAIN_PTS[c.r];
  /** La force d'une carte dans un pli : atout au-dessus de tout, puis la couleur demandée, le reste ne compte pas. */
  const power = (c, trump, led) => c.s === trump ? 100 + TRUMP_ORDER.indexOf(c.r) : c.s === led ? PLAIN_ORDER.indexOf(c.r) : -1;
  const winnerOf = (trick, trump) => { const led = trick[0].card.s; return trick.reduce((b, x) => power(x.card, trump, led) > power(b.card, trump, led) ? x : b).seat; };
  const nameOf = (room, seat) => room.players.find(p => p.id === room.seats[seat])?.name || '?';

  function buildDeck() { const d = []; SUITS.forEach(s => RANKS.forEach(r => d.push({ id: s + r, s, r }))); return shuffle(d); }

  function create({ hostId, players, target, annonces, random }) {
    const humans = players.filter(p => !p.bot && p.online !== false), bots = players.filter(p => p.bot);
    let seated = [...humans.slice(0, 4), ...bots].slice(0, 4);
    if (random) seated = shuffle(seated);
    const room = {
      hostId, phase: 'bid', deal: 0, dealer: Math.floor(Math.random() * 4), target: +target === 2000 ? 2000 : 1000, annoncesOn: !!annonces, annonces: null,
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot })),
      seats: seated.map(p => p.id), scores: [0, 0], history: [], log: [], seq: 0, result: null, winnerTeam: null,
    };
    log(room, `${nameOf(room, 0)} et ${nameOf(room, 2)} contre ${nameOf(room, 1)} et ${nameOf(room, 3)}. Partie en ${room.target}.`);
    startDeal(room);
    return room;
  }

  function startDeal(room) {
    room.deal += 1; room.dealer = (room.dealer + 1) % 4;
    const deck = buildDeck();
    room.hands = [0, 1, 2, 3].map(k => deck.slice(k * 8, k * 8 + 8));
    room.phase = 'bid'; room.turn = (room.dealer + 1) % 4; room.bids = []; room.contract = null; room.passes = 0; room.window = null;
    room.trick = []; room.lastTrick = null; room.tricks = [0, 0]; room.cardPts = [0, 0]; room.played = []; room.trump = null;
    room.belote = null; room.annonces = null; room.result = null;
    room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS); room.seq += 1;
    log(room, `Donne ${room.deal}. ${nameOf(room, room.dealer)} distribue, ${nameOf(room, room.turn)} parle en premier.`);
  }
  const next = seat => (seat + 1) % 4;
  function advance(room, seat) { room.turn = seat; room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS); room.seq += 1; }

  // ------------------------------------------------------------ enchères
  function canBid(room, seat) { return room.phase === 'bid' && !room.window && room.turn === seat && !(room.contract?.capot) && !(room.contract?.coinche); }
  function minBid(room) { return room.contract ? room.contract.value + 10 : 80; }
  function bid(room, seat, value, suit, capot) {
    if (!canBid(room, seat)) return 'Ce n’est pas à toi de parler';
    if (!SUITS.includes(suit)) return 'Choisis une couleur';
    const v = capot ? CAPOT : +value;
    if (!capot && (!BIDS.includes(v) || v < minBid(room))) return `Annonce au moins ${minBid(room)}`;
    room.contract = { seat, team: teamOf(seat), value: v, suit, capot: !!capot, coinche: 0 };
    room.bids.push({ seat, kind: 'bid', value: v, suit, capot: !!capot });
    room.passes = 0;
    log(room, `${nameOf(room, seat)} : ${bidName(room.contract)}.`);
    advance(room, next(seat));
    return null;
  }
  function pass(room, seat) {
    if (room.phase !== 'bid' || room.turn !== seat) return 'Ce n’est pas à toi de parler';
    room.bids.push({ seat, kind: 'pass' });
    if (room.window) {                                   // après une coinche, les preneurs passent ou surcoinchent
      room.window.shift();
      if (!room.window.length) return closeBidding(room);
      advance(room, room.window[0]); return null;
    }
    room.passes += 1;
    if (room.contract && room.passes >= 3) return closeBidding(room);
    if (!room.contract && room.passes >= 4) { log(room, 'Tout le monde passe. On redonne.'); startDeal(room); return null; }
    advance(room, next(seat));
    return null;
  }
  function coinche(room, seat) {
    const c = room.contract;
    if (room.phase !== 'bid' || room.turn !== seat || room.window || !c || c.coinche || teamOf(seat) === c.team) return 'Tu ne peux pas coincher maintenant';
    c.coinche = 1; room.bids.push({ seat, kind: 'coinche' });
    log(room, `${nameOf(room, seat)} coinche !`);
    // les deux preneurs, dans l'ordre du jeu, peuvent surcoincher
    room.window = [next(seat), next(next(next(seat)))].filter(k => teamOf(k) === c.team);
    advance(room, room.window[0]);
    return null;
  }
  function surcoinche(room, seat) {
    const c = room.contract;
    if (room.phase !== 'bid' || room.turn !== seat || !room.window || !c || c.coinche !== 1) return 'Tu ne peux pas surcoincher maintenant';
    c.coinche = 2; room.bids.push({ seat, kind: 'surcoinche' });
    log(room, `${nameOf(room, seat)} surcoinche !`);
    return closeBidding(room);
  }
  function closeBidding(room) {
    const c = room.contract;
    room.phase = 'play'; room.trump = c.suit; room.window = null;
    room.leader = next(room.dealer);
    log(room, `Contrat : ${nameOf(room, c.seat)}, ${bidName(c)}${c.coinche === 2 ? ', surcoinché' : c.coinche ? ', coinché' : ''}.`);
    // belote : le roi et la dame d'atout dans la même main
    const holder = room.hands.findIndex(h => h.some(x => x.s === c.suit && x.r === 'R') && h.some(x => x.s === c.suit && x.r === 'D'));
    room.belote = holder >= 0 ? { seat: holder, said: 0 } : null;
    room.annonces = room.annoncesOn ? findAnnonces(room) : null;
    advance(room, room.leader);
    return null;
  }

  // ------------------------------------------------------------ annonces simples (option) : suites et carrés
  const SEQ = ['7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  function annoncesOf(hand) {
    const out = [];
    SUITS.forEach(s => {
      const idx = hand.filter(c => c.s === s).map(c => SEQ.indexOf(c.r)).sort((a, b) => a - b);
      let run = [];
      const flush = () => { if (run.length >= 3) out.push({ kind: run.length >= 5 ? 'cent' : run.length === 4 ? 'cinquante' : 'tierce', value: run.length >= 5 ? 100 : run.length === 4 ? 50 : 20, high: run[run.length - 1], s }); };
      idx.forEach(i => { if (run.length && i === run[run.length - 1] + 1) run.push(i); else { flush(); run = [i]; } });
      flush();
    });
    ['V', '9', 'A', '10', 'R', 'D'].forEach(r => { if (hand.filter(c => c.r === r).length === 4) out.push({ kind: 'carré', r, value: r === 'V' ? 200 : r === '9' ? 150 : 100, high: 10 + SEQ.indexOf(r) }); });
    return out;
  }
  function findAnnonces(room) {
    const all = [];
    for (let k = 0; k < 4; k++) { const seat = (room.leader + k) % 4; annoncesOf(room.hands[seat]).forEach(a => all.push({ ...a, seat, order: k })); }
    if (!all.length) return { list: [], team: null, points: 0 };
    const best = all.slice().sort((a, b) => b.value - a.value || b.high - a.high || a.order - b.order)[0];
    const team = teamOf(best.seat), list = all.filter(a => teamOf(a.seat) === team);
    const points = list.reduce((x, a) => x + a.value, 0);
    log(room, `Annonces : ${list.map(a => `${nameOf(room, a.seat)}, ${a.kind === 'carré' ? `un carré de ${RANK_NAME[a.r]}s` : `un${a.kind === 'tierce' ? 'e' : ''} ${a.kind}`}`).join(' ; ')}. ${points} points pour l’équipe.`);
    return { list: list.map(a => ({ seat: a.seat, kind: a.kind, value: a.value, r: a.r || null, s: a.s || null })), team, points };
  }

  // ------------------------------------------------------------ le jeu de la carte
  /** Les cartes que ce joueur a le droit de jouer. */
  function legal(room, seat) {
    const hand = room.hands[seat], trick = room.trick, trump = room.trump;
    if (!trick.length) return hand.slice();
    const led = trick[0].card.s, follow = hand.filter(c => c.s === led);
    const trumps = hand.filter(c => c.s === trump);
    const topTrump = Math.max(-1, ...trick.filter(x => x.card.s === trump).map(x => TRUMP_ORDER.indexOf(x.card.r)));
    const over = trumps.filter(c => TRUMP_ORDER.indexOf(c.r) > topTrump);
    if (led === trump) return follow.length ? (over.length ? over : follow) : hand.slice();     // à l'atout : monter si on peut
    if (follow.length) return follow;                                                             // fournir
    const partnerMaster = teamOf(winnerOf(trick, trump)) === teamOf(seat);
    if (partnerMaster || !trumps.length) return hand.slice();                                     // partenaire maître : on joue ce qu'on veut
    return over.length ? over : trumps;                                                           // couper, et surcouper si possible
  }
  function play(room, seat, id) {
    if (room.phase !== 'play') return null;
    if (room.turn !== seat) return 'Ce n’est pas ton tour';
    const hand = room.hands[seat], card = hand.find(c => c.id === id); if (!card) return null;
    if (!legal(room, seat).some(c => c.id === id)) {
      const led = room.trick[0]?.card.s;
      return led && hand.some(c => c.s === led) ? (led === room.trump ? 'À l’atout, il faut monter si tu peux' : `Il faut fournir à ${SUIT_NAME[led]}`) : 'Il faut couper, et monter sur l’atout si tu peux';
    }
    hand.splice(hand.indexOf(card), 1);
    room.trick.push({ seat, card }); room.played.push(card.id);
    if (room.belote && room.belote.seat === seat && card.s === room.trump && (card.r === 'R' || card.r === 'D')) {
      room.belote.said += 1; log(room, `${nameOf(room, seat)} : « ${room.belote.said === 1 ? 'Belote' : 'Rebelote'} ! »`);
    }
    if (room.trick.length < 4) { advance(room, next(seat)); return null; }
    // le pli est complet
    const w = winnerOf(room.trick, room.trump), t = teamOf(w);
    const p = room.trick.reduce((a, x) => a + pts(x.card, room.trump), 0);
    room.tricks[t] += 1; room.cardPts[t] += p;
    room.lastTrick = { cards: room.trick.slice(), winner: w, points: p };
    room.trick = [];
    if (room.tricks[0] + room.tricks[1] === 8) { room.cardPts[t] += 10; return endDeal(room, w); }
    advance(room, w);
    return null;
  }

  function endDeal(room, lastWinner) {
    const c = room.contract, att = c.team, def = 1 - att;
    const card = room.cardPts.slice();
    [0, 1].forEach(t => { if (room.tricks[t] === 8) { card[t] = CAPOT; card[1 - t] = 0; } });
    const bel = [0, 0]; if (room.belote) bel[teamOf(room.belote.seat)] = 20;
    const ann = [0, 0]; if (room.annonces?.team != null) ann[room.annonces.team] = room.annonces.points;
    const total = t => card[t] + bel[t] + ann[t];
    const made = c.capot ? room.tricks[att] === 8 : total(att) >= c.value && total(att) > total(def);
    const mult = [1, 2, 4][c.coinche], add = [0, 0];
    if (mult === 1) {
      if (made) { add[att] = c.value + total(att); add[def] = total(def); }
      else { add[def] = 160 + c.value + bel[def] + ann[def]; add[att] = bel[att]; }
    } else if (made) { add[att] = 160 + c.value * mult + bel[att] + ann[att]; add[def] = bel[def]; }
    else { add[def] = 160 + c.value * mult + bel[def] + ann[def]; add[att] = bel[att]; }
    room.scores = room.scores.map((s, t) => s + add[t]);
    room.result = { contract: { ...c }, made, card, bel, ann, tricks: room.tricks.slice(), total: [total(0), total(1)], add, scores: room.scores.slice(), capot: room.tricks.indexOf(8), lastWinner };
    room.history.push({ deal: room.deal, contract: bidName(c), coinche: c.coinche, team: att, made, add: add.slice() });
    log(room, `${made ? 'Contrat réussi' : 'Contrat chuté'} : ${total(att)} points pour les preneurs. ${add[0]} et ${add[1]} au compteur.`);
    room.phase = 'result';
    if (Math.max(...room.scores) >= room.target) {
      room.winnerTeam = room.scores[0] === room.scores[1] ? att : room.scores[0] > room.scores[1] ? 0 : 1;
      room.phase = 'over'; log(room, `${nameOf(room, room.winnerTeam)} et ${nameOf(room, room.winnerTeam + 2)} gagnent la partie.`);
    }
    room.turnAt = Date.now(); room.seq += 1;
    return null;
  }

  // ------------------------------------------------------------ robots
  // la valeur d'une main pour un atout donné, à peu près les points que l'équipe peut espérer
  function handValue(hand, s) {
    const tr = hand.filter(c => c.s === s), side = hand.filter(c => c.s !== s);
    let v = tr.reduce((a, c) => a + { V: 30, '9': 22, A: 14, '10': 11, R: 7, D: 6, '8': 5, '7': 5 }[c.r], 0);
    side.forEach(c => { if (c.r === 'A') v += 13; else if (c.r === '10' && side.some(x => x.s === c.s && x.r === 'A')) v += 7; });
    v += Math.max(0, tr.length - 3) * 8;
    if (tr.length >= 3) SUITS.filter(x => x !== s).forEach(x => { if (!hand.some(c => c.s === x)) v += 8; });   // une coupe franche
    if (!tr.some(c => c.r === 'V')) v -= 12;
    return v;
  }
  function botBid(room, seat) {
    const hand = room.hands[seat], c = room.contract;
    if (room.window) return handValue(hand, c.suit) >= c.value + 25 ? surcoinche(room, seat) : pass(room, seat);
    if (c && teamOf(seat) !== c.team && !c.coinche && !c.capot && c.value >= 100) {
      const tr = hand.filter(x => x.s === c.suit), high = tr.filter(x => ['V', '9', 'A'].includes(x.r)).length, aces = hand.filter(x => x.r === 'A' && x.s !== c.suit).length;
      if ((tr.length >= 3 && high >= 2 && c.value >= 110) || (high >= 1 && tr.length >= 2 && aces >= 2 && c.value >= 120) || (high >= 2 && c.value >= 130)) return coinche(room, seat);
    }
    if (!canBid(room, seat)) return pass(room, seat);
    let best = null;
    SUITS.forEach(s => {
      let v = handValue(hand, s);
      if (c && teamOf(c.seat) === teamOf(seat) && c.suit === s) v += 18;               // soutenir le partenaire
      else if (c && teamOf(c.seat) === teamOf(seat)) v -= 10;                           // ne pas lui couper l'herbe sous le pied
      if (!best || v > best.v) best = { s, v };
    });
    // une équipe fait en général 25 à 30 points de plus que la main seule du preneur : on vise la main + 20
    const target = Math.min(160, Math.floor((best.v + 20) / 10) * 10), min = minBid(room);
    if (target < 80 || target < min) return pass(room, seat);
    const value = !c ? Math.max(80, target - (Math.random() < .5 ? 10 : 0)) : teamOf(c.seat) === teamOf(seat) ? Math.max(min, target - 10) : min;
    if (value >= min) return bid(room, seat, Math.min(value, 160), best.s);
    return pass(room, seat);
  }
  function botCard(room, seat) {
    const ok = legal(room, seat), trump = room.trump, trick = room.trick, c = room.contract;
    const byPow = (a, b, led) => power(a, trump, led) - power(b, trump, led);
    const low = list => list.slice().sort((a, b) => pts(a, trump) - pts(b, trump) || PLAIN_ORDER.indexOf(a.r) - PLAIN_ORDER.indexOf(b.r))[0];
    if (!trick.length) {
      const trumps = ok.filter(x => x.s === trump), out = 8 - room.played.filter(id => id[0] === trump).length - room.hands[seat].filter(x => x.s === trump).length;
      if (teamOf(seat) === c.team && trumps.length && out > 0) return trumps.sort((a, b) => TRUMP_ORDER.indexOf(b.r) - TRUMP_ORDER.indexOf(a.r))[0];
      const aces = ok.filter(x => x.s !== trump && x.r === 'A'); if (aces.length) return aces[0];
      const tens = ok.filter(x => x.s !== trump && x.r === '10' && room.played.includes(x.s + 'A')); if (tens.length) return tens[0];
      const side = ok.filter(x => x.s !== trump && x.r !== '10'); return low(side.length ? side : ok);
    }
    const led = trick[0].card.s, w = winnerOf(trick, trump), last = trick.length === 3;
    const wins = ok.filter(x => power(x, trump, led) > power(trick.find(t => t.seat === w).card, trump, led));
    if (teamOf(w) === teamOf(seat)) {
      // le partenaire est maître : dernier à jouer, on charge ; sinon on reste prudent
      const charge = ok.filter(x => x.s !== trump).sort((a, b) => pts(b, trump) - pts(a, trump));
      if (last && charge.length) return charge[0];
      return low(ok);
    }
    if (wins.length) return wins.sort((a, b) => byPow(a, b, led))[last ? 0 : wins.length > 1 && trick.reduce((a, t) => a + pts(t.card, trump), 0) >= 10 ? wins.length - 1 : 0];
    return low(ok);
  }

  function tick(room) {
    if (room.phase !== 'bid' && room.phase !== 'play') return false;
    const id = room.seats[room.turn], p = room.players.find(x => x.id === id), now = Date.now();
    const absent = p && !p.bot && !p.online && now - room.turnAt > ABSENT_MS;
    if (!(p?.bot && now >= room.botAt) && !absent) return false;
    if (absent) log(room, `${p.name} est absent, le robot joue à sa place.`);
    if (room.phase === 'bid') botBid(room, room.turn); else play(room, room.turn, botCard(room, room.turn).id);
    return true;
  }

  function act(room, pid, m) {
    const seat = room.seats.indexOf(pid);
    switch (m.t) {
      case 'co:bid': return seat < 0 ? null : bid(room, seat, m.value, m.suit, !!m.capot);
      case 'co:pass': return seat < 0 ? null : pass(room, seat);
      case 'co:coinche': return seat < 0 ? null : coinche(room, seat);
      case 'co:surcoinche': return seat < 0 ? null : surcoinche(room, seat);
      case 'co:play': return seat < 0 ? null : play(room, seat, String(m.card || ''));
      case 'co:next': if (pid === room.hostId && room.phase === 'result') startDeal(room); return null;
    }
    return null;
  }
  function join(room, id, name) {
    const p = room.players.find(x => x.id === id);
    if (p) { p.online = true; p.name = name || p.name; } else room.players.push({ id, name, online: true, bot: false });   // il regarde
    room.seq += 1;
  }
  function setOnline(room, id, on) { const p = room.players.find(x => x.id === id); if (p) { p.online = on; room.seq += 1; } }

  // ------------------------------------------------------------ ce que voit chaque téléphone
  function view(room, pid) {
    const me = room.seats.indexOf(pid), c = room.contract;
    const lastBid = seat => { for (let i = room.bids.length - 1; i >= 0; i--) if (room.bids[i].seat === seat) return room.bids[i]; return null; };
    const myTurn = me >= 0 && room.turn === me && (room.phase === 'bid' || room.phase === 'play');
    return {
      phase: room.phase, deal: room.deal, dealer: room.dealer, target: room.target, annoncesOn: !!room.annoncesOn, isHost: pid === room.hostId, seq: room.seq,
      turn: room.turn, since: room.turnAt, myTurn,
      seats: room.seats.map((id, k) => { const p = room.players.find(x => x.id === id) || {}; return { id, name: p.name, bot: p.bot, online: p.online, team: teamOf(k), count: room.hands[k].length, dealer: k === room.dealer, bid: room.phase === 'bid' ? lastBid(k) : null }; }),
      watchers: room.players.filter(p => !room.seats.includes(p.id)).map(p => ({ id: p.id, name: p.name, online: p.online })),
      me: me >= 0 ? { seat: me, team: teamOf(me), hand: room.hands[me].slice(), playable: myTurn && room.phase === 'play' ? legal(room, me).map(x => x.id) : [] } : null,
      scores: room.scores.slice(), tricks: room.tricks.slice(), cardPts: room.cardPts.slice(),
      contract: c ? { ...c } : null, trump: room.trump, bids: room.bids.slice(-16),
      minBid: room.phase === 'bid' ? minBid(room) : null,
      canBid: myTurn && room.phase === 'bid' && canBid(room, me),
      canCoinche: myTurn && room.phase === 'bid' && !room.window && !!c && !c.coinche && teamOf(me) !== c.team,
      canSurcoinche: myTurn && room.phase === 'bid' && !!room.window,
      trick: room.trick.slice(), lastTrick: room.lastTrick,
      belote: room.belote && room.belote.said ? { seat: room.belote.seat, said: room.belote.said } : null,
      annonces: room.phase !== 'bid' ? room.annonces : null,
      result: room.result, history: room.history.slice(-10), winnerTeam: room.winnerTeam,
      log: room.log.slice(-16),
    };
  }

  return { SUITS, RANKS, SUIT_NAME, SYM, RANK_NAME, TRUMP_ORDER, PLAIN_ORDER, BIDS, CAPOT, cardName, bidName, pts, legal, annoncesOf, create, act, tick, join, setOnline, view, handValue };
})();
if (typeof module !== 'undefined') module.exports = Coinche;
