/* Mirage — le jeu des images et des indices : un conteur choisit une carte de sa main et donne un indice,
   les autres glissent la carte de leur main qui colle le mieux, on mélange, on vote, et il faut que
   l'indice soit ni trop clair ni trop obscur.

   Les cartes sont des œuvres du domaine public (Met, Cleveland Museum of Art) réduites pour téléphone,
   listées dans mirage.json et rangées dans mirage/ ; chaque téléphone charge ses images directement.
   Points : si tout le monde ou personne trouve la carte du conteur, il marque 0 et les autres 2 ;
   sinon le conteur et ceux qui ont trouvé marquent 3. Chaque vote reçu sur sa carte rapporte 1 (3 max).
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.mi), actions « mi:… ».
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, net, view et ASSET_V. */

'use strict';

const Mirage = (() => {
  const HAND = 6, CLUE_MAX = 80, SEEN_KEY = 'mi-seen', OFFER = 5;       // un joker montre 5 cartes au choix
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  let cards = null, byId = {};

  async function load(v) {
    if (cards) return cards;
    const [art, memes] = await Promise.all(['mirage.json', 'memes.json'].map(f => fetch(`${f}?v=${v}`).then(r => r.ok ? r.json() : []).catch(() => [])));
    // les mèmes de Mème pas vrai, rangés comme des cartes de Mirage (préfixe « m_ » : pas de collision d'identifiants)
    cards = art.map(c => ({ ...c, set: 'art' })).concat(memes.map(m => ({ id: 'm_' + m.id, set: 'memes', kind: m.kind, url: m.url, thumb: m.thumb, title: m.name, artist: m.kind === 'gif' ? 'GIF' : 'Mème', date: '', credit: 'bibliothèque publique d\u2019Imgflip' })));
    byId = {}; cards.forEach(c => byId[c.id] = c);
    return cards;
  }
  const count = (set = 'art') => cards ? cards.filter(c => set === 'mix' || c.set === set).length : 0;
  const card = id => byId[id];

  /** Le paquet : les cartes jamais vues lors des soirées précédentes d'abord, le reste ensuite. */
  function buildDeck(set) {
    let seen = new Set();
    try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { }
    const pool = cards.filter(c => set === 'mix' || c.set === set);
    const fresh = shuffle(pool.filter(c => !seen.has(c.id)).map(c => c.id)), old = shuffle(pool.filter(c => seen.has(c.id)).map(c => c.id));
    if (!fresh.length) { try { localStorage.removeItem(SEEN_KEY); } catch { } return old; }
    return old.concat(fresh);                                    // on pioche par la fin : les neuves sortent en premier
  }
  function markSeen(ids) {
    try { const s = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); ids.forEach(id => s.add(id)); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-2000))); } catch { }
  }

  const pl = (room, id) => room.players.find(p => p.id === id);
  const teller = room => pl(room, room.order[room.teller]);
  const others = room => room.order.map(id => pl(room, id)).filter(p => p.id !== teller(room)?.id && p.online && p.hand.length);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };

  function drawTo(room, p) {
    const got = [];
    while (p.hand.length < HAND && room.deck.length) { const id = room.deck.pop(); p.hand.push(id); got.push(id); }
    if (got.length) markSeen(got);
  }

  function create({ hostId, players, target, jokers, cardset }) {
    const set = ['art', 'memes', 'mix'].includes(cardset) ? cardset : 'art';
    const room = {
      hostId, phase: 'clue', round: 0, target: clamp(target, 5, 60, 30), jokerStart: clamp(jokers, 0, 9, 3), offers: {},
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, score: 0, hand: [], jokers: 0 })),
      order: [], teller: -1, deck: buildDeck(set), cardset: set, clue: '', tellerCard: null, picks: {}, table: [], votes: {}, result: null,
      log: [], turnAt: Date.now(), seq: 0, winnerId: null,
    };
    room.order = shuffle(room.players.filter(p => p.online).map(p => p.id));
    room.players.forEach(p => { p.jokers = room.jokerStart; });
    room.players.forEach(p => { if (p.online) drawTo(room, p); });
    nextRound(room);
    return room;
  }

  function nextRound(room) {
    const n = room.order.length;
    room.teller = (room.teller + 1) % n;
    let guard = 0;
    while (guard++ < n && !(teller(room)?.online && teller(room)?.hand.length)) room.teller = (room.teller + 1) % n;
    room.round += 1; room.phase = 'clue'; room.clue = ''; room.tellerCard = null; room.picks = {}; room.table = []; room.votes = {}; room.result = null;
    room.turnAt = Date.now(); room.seq += 1;
  }

  function setClue(room, pid, cardId, text) {
    if (room.phase !== 'clue' || teller(room)?.id !== pid) return null;
    const p = teller(room);
    if (!p.hand.includes(cardId)) return 'Choisis une carte de ta main';
    const t = String(text || '').trim().slice(0, CLUE_MAX);
    room.tellerCard = cardId; room.clue = t;
    room.picks = {}; room.phase = 'pick'; room.turnAt = Date.now(); room.seq += 1;
    log(room, t ? `${p.name} lance « ${t} ».` : `${p.name} donne son indice à voix haute.`);
    if (!others(room).length) return 'Il faut au moins un autre joueur';
    return null;
  }

  function pick(room, pid, cardId) {
    if (room.phase !== 'pick' || teller(room)?.id === pid) return null;
    const p = pl(room, pid); if (!p || !p.hand.includes(cardId)) return null;
    room.picks[pid] = cardId; room.seq += 1;
    if (others(room).every(q => room.picks[q.id])) startVote(room);
    return null;
  }

  function startVote(room) {
    const t = teller(room);
    room.table = shuffle([{ card: room.tellerCard, owner: t.id }, ...Object.entries(room.picks).map(([owner, c]) => ({ card: c, owner }))]);
    room.votes = {}; room.phase = 'vote'; room.turnAt = Date.now(); room.seq += 1;
  }

  function vote(room, pid, cardId) {
    if (room.phase !== 'vote' || teller(room)?.id === pid) return null;
    const p = pl(room, pid); if (!p) return null;
    const slot = room.table.find(s => s.card === cardId); if (!slot) return null;
    if (slot.owner === pid) return 'C’est ta carte, vote pour une autre';
    room.votes[pid] = cardId; room.seq += 1;
    if (others(room).every(q => room.votes[q.id])) reveal(room);
    return null;
  }

  function reveal(room) {
    const t = teller(room), voters = Object.keys(room.votes);
    const found = voters.filter(id => room.votes[id] === room.tellerCard);
    const gains = {}; room.order.forEach(id => gains[id] = 0);
    const allOrNone = found.length === 0 || found.length === voters.length;
    if (allOrNone) voters.forEach(id => gains[id] += 2);
    else { gains[t.id] += 3; found.forEach(id => gains[id] += 3); }
    room.table.forEach(s => { if (s.owner === t.id) return; const n = voters.filter(id => room.votes[id] === s.card).length; gains[s.owner] += Math.min(3, n); });
    Object.entries(gains).forEach(([id, g]) => { const p = pl(room, id); if (p) p.score += g; });
    room.result = { gains, found: found.map(id => pl(room, id).name), allOrNone, none: found.length === 0, all: found.length === voters.length && voters.length > 0 };
    const names = found.map(id => pl(room, id).name), who = names.length > 1 ? names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1] : names[0];
    log(room, allOrNone ? (found.length === 0 ? `Personne ne trouve la carte de ${t.name}. 2 points pour les autres.` : `Tout le monde trouve la carte de ${t.name}. 2 points pour les autres.`) : `${who} ${found.length > 1 ? 'trouvent' : 'trouve'} la carte de ${t.name}. 3 points chacun.`);
    room.phase = 'reveal'; room.turnAt = Date.now(); room.seq += 1;
  }

  function next(room, pid) {
    if (room.phase !== 'reveal' || (pid !== room.hostId && pid !== teller(room)?.id)) return null;
    // on se sépare des cartes jouées, chacun complète sa main
    room.table.forEach(s => { const p = pl(room, s.owner); if (p) p.hand = p.hand.filter(c => c !== s.card); });
    room.players.forEach(p => { if (p.online) drawTo(room, p); });
    const best = [...room.players].sort((a, b) => b.score - a.score)[0];
    const short = room.players.filter(p => p.online && p.hand.length < HAND).length > 0 && room.deck.length === 0;
    if (best.score >= room.target || short) { room.phase = 'over'; room.winnerId = best.id; room.seq += 1; return null; }
    nextRound(room);
    return null;
  }

  function hostSkip(room, pid) {
    if (pid !== room.hostId || !['clue', 'pick', 'vote'].includes(room.phase)) return null;
    if (room.phase === 'clue') { log(room, `L’hôte passe le tour de ${teller(room).name}.`); nextRound(room); return null; }
    if (room.phase === 'pick') { others(room).forEach(q => { if (!room.picks[q.id]) room.picks[q.id] = q.hand[Math.random() * q.hand.length | 0]; }); startVote(room); return null; }
    others(room).forEach(q => { if (!room.votes[q.id]) { const opts = room.table.filter(s => s.owner !== q.id); room.votes[q.id] = opts[Math.random() * opts.length | 0].card; } });
    reveal(room); return null;
  }

  // ------------------------------------------------------------ jokers
  /** Une carte engagée dans la manche (jouée, choisie par le conteur, posée sur la table) ne s'échange pas. */
  const committed = (room, pid, cardId) => room.picks[pid] === cardId || (teller(room)?.id === pid && room.tellerCard === cardId) || room.table.some(s => s.card === cardId);

  function jokerStart(room, pid, cardId) {
    const p = pl(room, pid);
    if (!p || room.phase === 'over' || room.offers[pid]) return null;
    if (p.jokers <= 0) return 'Plus de joker';
    if (!p.hand.includes(cardId)) return null;
    if (committed(room, pid, cardId)) return 'Cette carte est déjà jouée cette manche';
    if (!room.deck.length) return 'La pioche est vide';
    const choices = [];
    while (choices.length < OFFER && room.deck.length) choices.push(room.deck.pop());
    room.offers[pid] = { out: cardId, choices }; room.seq += 1;
    return null;
  }
  function jokerPick(room, pid, cardId) {
    const p = pl(room, pid), o = room.offers[pid];
    if (!p || !o || !o.choices.includes(cardId)) return null;
    const i = p.hand.indexOf(o.out);
    if (i < 0 || committed(room, pid, o.out)) { jokerCancel(room, pid); return 'Cette carte n\u2019est plus échangeable'; }
    p.hand[i] = cardId; p.jokers -= 1;
    room.deck.unshift(o.out, ...o.choices.filter(c => c !== cardId));   // sous la pioche : pas de retour immédiat
    markSeen([cardId]);
    delete room.offers[pid]; room.seq += 1;
    log(room, `${p.name} utilise un joker.`);
    return null;
  }
  function jokerCancel(room, pid) {
    const o = room.offers[pid]; if (!o) return null;
    room.deck.unshift(...o.choices); delete room.offers[pid]; room.seq += 1;
    return null;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'mi:joker': return jokerStart(room, pid, m.card);
      case 'mi:jokerpick': return jokerPick(room, pid, m.card);
      case 'mi:jokercancel': return jokerCancel(room, pid);
      case 'mi:clue': return setClue(room, pid, m.card, m.text);
      case 'mi:pick': return pick(room, pid, m.card);
      case 'mi:vote': return vote(room, pid, m.card);
      case 'mi:next': return next(room, pid);
      case 'mi:skip': return hostSkip(room, pid);
    }
    return null;
  }

  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; if (!p.hand.length) drawTo(room, p); return; }
    const q = { id, name, online: true, score: 0, hand: [], jokers: room.jokerStart };
    room.players.push(q); room.order.push(id); drawTo(room, q);
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on;
    if (on) return;
    jokerCancel(room, id);                                    // les cartes proposées retournent à la pioche
    if (room.phase === 'clue' && teller(room)?.id === id) nextRound(room);
    else if (room.phase === 'pick' && others(room).length && others(room).every(q => room.picks[q.id])) startVote(room);
    else if (room.phase === 'vote' && others(room).length && others(room).every(q => room.votes[q.id])) reveal(room);
  }

  function view(room, pid) {
    const t = teller(room), me = pl(room, pid), isTeller = t?.id === pid;
    const waitingOn = room.phase === 'pick' ? others(room).filter(q => !room.picks[q.id]) : room.phase === 'vote' ? others(room).filter(q => !room.votes[q.id]) : [];
    return {
      phase: room.phase, round: room.round, target: room.target, seq: room.seq, isHost: pid === room.hostId,
      tellerId: t?.id || null, tellerName: t?.name || '', isTeller, clue: room.phase === 'clue' ? '' : room.clue,
      me: me ? { hand: me.hand.map(card).filter(Boolean), picked: room.picks[pid] || (isTeller ? room.tellerCard : null), voted: room.votes[pid] || null, score: me.score,
        jokers: me.jokers, jokerStart: room.jokerStart, locked: me.hand.filter(c => committed(room, pid, c)),
        offer: room.offers[pid] ? { out: card(room.offers[pid].out), choices: room.offers[pid].choices.map(card).filter(Boolean) } : null }
        : { hand: [], picked: null, voted: null, score: 0, jokers: 0, jokerStart: 0, locked: [], offer: null },
      players: room.order.map(id => { const p = pl(room, id); return { id, name: p.name, online: p.online, score: p.score, me: id === pid, teller: id === t?.id, done: room.phase === 'pick' ? !!room.picks[id] : room.phase === 'vote' ? !!room.votes[id] : false, gain: room.result ? room.result.gains[id] || 0 : 0 }; }),
      waiting: waitingOn.map(q => q.name),
      table: room.phase === 'vote' ? room.table.map(s => ({ card: card(s.card), mine: s.owner === pid }))
        : room.phase === 'reveal' || room.phase === 'over' ? room.table.map(s => ({ card: card(s.card), owner: pl(room, s.owner)?.name, mine: s.owner === pid, teller: s.owner === t?.id, votes: Object.entries(room.votes).filter(([, c]) => c === s.card).map(([id]) => pl(room, id)?.name).filter(Boolean) })) : [],
      result: room.result, deckLeft: room.deck.length, quiet: Date.now() - room.turnAt,
      winnerName: room.winnerId ? pl(room, room.winnerId)?.name : null,
      scores: [...room.players].filter(p => room.order.includes(p.id)).sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score, me: p.id === pid })),
      log: room.log.slice(-3),
    };
  }

  // les robots : un indice tiré d'une liste de mots évocateurs, des cartes et des votes au hasard
  const BOT_CLUES = ['Rêverie', 'Solitude', 'Voyage', 'Mystère', 'Enfance', 'Silence', 'Tempête', 'Nostalgie', 'Liberté', 'Danger', 'Fête', 'Secret', 'Lumière', 'La nuit', 'Attente', 'Colère', 'Douceur', 'Vertige', 'Promesse', 'Illusion', 'Départ', 'Racines', 'Équilibre', 'Chaos', 'Espoir', 'Mélancolie', 'Victoire', 'Fragile', 'Éternité', 'Refuge', 'Le dimanche', 'Premier amour', 'Trop tard', 'Sans retour'];
  function tick(room) {
    if (Date.now() - room.turnAt < 1800 || Math.random() < .5) return false;
    const any = list => list[Math.random() * list.length | 0], t = teller(room);
    if (room.phase === 'clue' && t?.bot && t.hand.length && Date.now() - room.turnAt > 2500) { setClue(room, t.id, any(t.hand), any(BOT_CLUES)); return true; }
    if (room.phase === 'pick') { const b = others(room).find(p => p.bot && !room.picks[p.id]); if (b) { pick(room, b.id, any(b.hand)); return true; } }
    if (room.phase === 'vote') {
      const b = others(room).find(p => p.bot && !room.votes[p.id]);
      if (b) { const opts = room.table.filter(x => x.owner !== b.id); if (opts.length) { vote(room, b.id, any(opts).card); return true; } }
    }
    return false;
  }
  return { HAND, CLUE_MAX, load, count, card, create, act, tick, join, setOnline, view };
})();
