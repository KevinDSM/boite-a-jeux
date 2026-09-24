/* Mirage — le jeu des images et des indices : un conteur choisit une carte de sa main et donne un indice,
   les autres glissent la carte de leur main qui colle le mieux, on mélange, on vote, et il faut que
   l'indice soit ni trop clair ni trop obscur.

   Les cartes sont des œuvres du domaine public (Met, Cleveland Museum of Art) réduites pour téléphone,
   listées dans mirage.json et rangées dans mirage/ ; chaque téléphone charge ses images directement.
   Points : si tout le monde ou personne trouve la carte du conteur, il marque 0 et les autres 2 ;
   sinon le conteur et ceux qui ont trouvé marquent 3. Chaque vote reçu sur sa carte rapporte 1 (3 max).
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.mi), actions « mi:… ».
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, net, view et ASSET_V. */

'use strict';

const Mirage = (() => {
  const HAND = 6, CLUE_MAX = 80, SEEN_KEY = 'mi-seen', OFFER = 5;       // un joker montre 5 cartes au choix
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  let cards = null, byId = {};

  async function load(v) {
    if (cards) return cards;
    cards = await fetch(`mirage.json?v=${v}`).then(r => r.ok ? r.json() : []).catch(() => []);
    byId = {}; cards.forEach(c => byId[c.id] = c);
    return cards;
  }
  const count = () => cards ? cards.length : 0;
  const card = id => byId[id];

  /** Le paquet : les cartes jamais vues lors des soirées précédentes d'abord, le reste ensuite. */
  function buildDeck() {
    let seen = new Set();
    try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { }
    const fresh = shuffle(cards.filter(c => !seen.has(c.id)).map(c => c.id)), old = shuffle(cards.filter(c => seen.has(c.id)).map(c => c.id));
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

  function create({ hostId, players, target, jokers }) {
    const room = {
      hostId, phase: 'clue', round: 0, target: clamp(target, 5, 60, 30), jokerStart: clamp(jokers, 0, 9, 3), offers: {},
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, score: 0, hand: [], jokers: 0 })),
      order: [], teller: -1, deck: buildDeck(), clue: '', tellerCard: null, picks: {}, table: [], votes: {}, result: null,
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
    log(room, `${p.name} donne son indice${t ? ` : « ${t} »` : ' à voix haute'}.`);
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
    if (slot.owner === pid) return 'C’est ta carte : vote pour une autre';
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
    log(room, allOrNone ? (found.length === 0 ? `Personne n'a trouvé la carte de ${t.name} : 2 points pour les autres.` : `Tout le monde a trouvé la carte de ${t.name} : 2 points pour les autres.`) : `${found.map(id => pl(room, id).name).join(', ')} ${found.length > 1 ? 'ont' : 'a'} trouvé : 3 points, et 3 pour ${t.name}.`);
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
    if (room.phase === 'clue') { log(room, `L'hôte passe le tour de ${teller(room).name}.`); nextRound(room); return null; }
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

  return { HAND, CLUE_MAX, load, count, card, create, act, join, setOnline, view };
})();

// ============================================================ écran
let miLight = null, miChosen = null, miClueDraft = '', miSkipTimer = null, miLastRound = null;
const MI_SKIP_MS = 60000;

function miCardHTML(c, extra = '') {
  return `<figure class="mi-card${extra}"><img src="mirage/${esc(c.file)}" alt="" loading="lazy" decoding="async"><figcaption>${esc(c.artist)}</figcaption></figure>`;
}

/** La carte en grand, avec l'action du moment (choisir, jouer, voter) et, s'il en reste, le joker. */
function miOpen(c, action, extra) {
  miLight = { id: c.id };
  let box = $('#mi-light');
  if (!box) { box = el('div', 'mi-light'); box.id = 'mi-light'; document.body.appendChild(box); }
  box.innerHTML = '';
  const img = el('img'); img.src = `mirage/${c.file}`; img.alt = '';
  box.appendChild(img);
  box.appendChild(el('p', 'mi-light-cap', `${esc(c.title)}<br><small>${esc(c.artist)}${c.date ? ' · ' + esc(c.date) : ''} · ${esc(c.credit)}</small>`));
  const row = el('div', 'mi-light-row');
  [action, extra].filter(Boolean).forEach((x, k) => { const b = el('button', 'btn ' + (k === 0 && action ? 'primary lg' : 'mi-joker-btn'), x.label); b.type = 'button'; b.onclick = () => { miClose(); x.fn(); }; if (x.disabled) b.disabled = true; row.appendChild(b); });
  const close = el('button', 'btn ghost', 'Fermer'); close.type = 'button'; close.onclick = miClose; row.appendChild(close);
  box.appendChild(row);
  box.hidden = false;
  box.onclick = e => { if (e.target === box) miClose(); };
}
function miClose() { miLight = null; const box = $('#mi-light'); if (box) box.hidden = true; }

function renderMirage(v) {
  if (!v) return;
  const root = $('#mi-main'); root.innerHTML = '';
  clearTimeout(miSkipTimer);
  if (v.round !== miLastRound) { miLastRound = v.round; miChosen = null; miClueDraft = ''; miClose(); }
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me;

  // en-tête : manche, conteur, indice
  const head = el('div', 'mi-head');
  head.innerHTML = `<span class="eyebrow">Manche ${v.round} · ${v.target} points pour gagner</span>`
    + `<p class="mi-teller">${v.isTeller ? 'Tu es le conteur' : `${esc(v.tellerName)} raconte`}</p>`
    + (v.phase !== 'clue' ? `<p class="mi-clue">${v.clue ? `« ${esc(v.clue)} »` : '<i>indice donné à voix haute</i>'}</p>` : '');
  root.appendChild(head);

  // les joueurs : score, et qui a fini
  const strip = el('div', 'mi-players');
  v.players.forEach(p => {
    const d = el('div', `mi-player${p.teller ? ' teller' : ''}${p.done ? ' done' : ''}${p.online ? '' : ' off'}${p.me ? ' me' : ''}`);
    d.innerHTML = `<span class="mi-player-name">${esc(p.name)}</span><span class="mi-player-score">${p.score}${v.phase === 'reveal' && p.gain ? ` <b>+${p.gain}</b>` : ''}</span>${p.teller ? '<span class="mi-badge">conteur</span>' : p.done ? '<span class="mi-badge ok">✓</span>' : ''}`;
    strip.appendChild(d);
  });
  root.appendChild(strip);

  const zone = el('div', 'mi-zone');
  // le joker : proposé sur toute carte de ma main qui n'est pas déjà jouée cette manche
  const jokerFor = c => (!me.offer && me.jokers > 0 && !me.locked.includes(c.id) && v.phase !== 'over' && v.deckLeft > 0)
    ? { label: `Joker : échanger cette carte (${me.jokers} restant${me.jokers > 1 ? 's' : ''})`, fn: () => act({ t: 'mi:joker', card: c.id }) } : null;
  if (me.offer) {
    const box = el('div', 'mi-offer');
    box.appendChild(el('div', 'mi-offer-head', `<figure class="mi-offer-out"><img src="mirage/${esc(me.offer.out.file)}" alt=""></figure><p class="mi-offer-title">Joker : choisis la carte qui remplacera celle-ci</p>`));
    const g = el('div', 'mi-grid offer');
    me.offer.choices.forEach(c => {
      const f = el('button', 'mi-slot'); f.type = 'button'; f.innerHTML = miCardHTML(c);
      f.onclick = () => miOpen(c, { label: 'Prendre cette carte', fn: () => act({ t: 'mi:jokerpick', card: c.id }) });
      g.appendChild(f);
    });
    box.appendChild(g);
    box.appendChild(btn('ghost small', 'Annuler, garder ma carte (le joker n\u2019est pas utilisé)', () => act({ t: 'mi:jokercancel' })));
    zone.appendChild(box);
  }
  if (me.jokerStart > 0 && v.phase !== 'over') zone.appendChild(el('p', 'mi-jokers', `<span class="mi-joker-dots">${'<i class="on"></i>'.repeat(me.jokers)}${'<i></i>'.repeat(Math.max(0, me.jokerStart - me.jokers))}</span>${me.jokers ? `${me.jokers} joker${me.jokers > 1 ? 's' : ''} : touche une de tes cartes pour l\u2019échanger` : 'Plus de joker'}`));
  const handGrid = (onTap, chosenId, label) => {
    const g = el('div', 'mi-grid hand');
    me.hand.forEach(c => {
      const f = el('button', 'mi-slot' + (c.id === chosenId ? ' chosen' : '')); f.type = 'button';
      f.innerHTML = miCardHTML(c);
      f.onclick = () => miOpen(c, onTap ? { label, fn: () => onTap(c) } : null, jokerFor(c));
      g.appendChild(f);
    });
    return g;
  };

  if (v.phase === 'clue') {
    if (v.isTeller) {
      zone.appendChild(el('p', 'mi-hint', miChosen ? 'Maintenant, ton indice : un mot, une phrase, un titre de film, un son…' : 'Choisis une carte de ta main, puis trouve un indice ni trop clair ni trop obscur.'));
      zone.appendChild(handGrid(c => { miChosen = c.id; renderMirage(view.mi); setTimeout(() => $('#mi-clue-in')?.focus(), 50); }, miChosen, 'Choisir cette carte'));
      if (miChosen) {
        const form = el('form', 'mi-clue-form');
        const inp = el('input', 'mi-clue-in'); inp.id = 'mi-clue-in'; inp.type = 'text'; inp.maxLength = Mirage.CLUE_MAX; inp.placeholder = 'Ton indice (ou dis-le à voix haute)'; inp.autocomplete = 'off'; inp.value = miClueDraft;
        inp.oninput = () => { miClueDraft = inp.value; };
        const send = btn('primary', 'Envoyer l’indice', () => { }); send.type = 'submit';
        form.append(inp, send);
        form.onsubmit = e => { e.preventDefault(); act({ t: 'mi:clue', card: miChosen, text: inp.value }); };
        zone.appendChild(form);
      }
    } else {
      zone.appendChild(el('p', 'mi-hint', `${esc(v.tellerName)} choisit une carte et cherche un indice… Regarde ta main en attendant.`));
      zone.appendChild(handGrid(null, null, ''));
    }
  }

  if (v.phase === 'pick') {
    if (v.isTeller) zone.appendChild(el('p', 'mi-hint', `Les autres cherchent une carte qui colle à ton indice… On attend ${v.waiting.map(esc).join(', ') || 'plus personne'}.`));
    else if (me.picked) zone.appendChild(el('p', 'mi-hint', `Carte jouée. On attend ${v.waiting.map(esc).join(', ') || 'plus personne'}.`));
    else zone.appendChild(el('p', 'mi-hint', 'Glisse la carte de ta main qui colle le mieux à l’indice, pour tromper les autres.'));
    zone.appendChild(handGrid(v.isTeller || me.picked ? null : c => act({ t: 'mi:pick', card: c.id }), me.picked, 'Jouer cette carte'));
  }

  if (v.phase === 'vote') {
    zone.appendChild(el('p', 'mi-hint', v.isTeller ? `Ils votent… On attend ${v.waiting.map(esc).join(', ') || 'plus personne'}.` : me.voted ? `Vote enregistré. On attend ${v.waiting.map(esc).join(', ') || 'plus personne'}.` : `Quelle carte est celle de ${esc(v.tellerName)} ?`));
    const g = el('div', 'mi-grid table');
    v.table.forEach(s => {
      const f = el('button', 'mi-slot' + (s.mine ? ' mine' : '') + (me.voted === s.card.id ? ' chosen' : '')); f.type = 'button';
      f.innerHTML = miCardHTML(s.card) + (s.mine ? '<span class="mi-tag">ta carte</span>' : '');
      f.onclick = () => miOpen(s.card, v.isTeller || me.voted ? null : { label: s.mine ? 'C’est ta carte' : 'Voter pour cette carte', disabled: s.mine, fn: () => act({ t: 'mi:vote', card: s.card.id }) });
      g.appendChild(f);
    });
    zone.appendChild(g);
  }

  if (v.phase === 'reveal' || v.phase === 'over') {
    if (v.result && v.phase === 'reveal') {
      const r = v.result;
      zone.appendChild(el('div', 'mi-verdict' + (r.allOrNone ? ' flat' : ''), `<p class="mi-verdict-big">${r.none ? 'Personne n’a trouvé' : r.all ? 'Tout le monde a trouvé' : `${r.found.map(esc).join(', ')} ${r.found.length > 1 ? 'ont' : 'a'} trouvé`}</p><p class="mi-verdict-sub">${r.allOrNone ? `Indice ${r.none ? 'trop obscur' : 'trop clair'} : 0 pour ${esc(v.tellerName)}, 2 pour les autres.` : `3 points pour ${esc(v.tellerName)} et pour ceux qui ont trouvé.`} Chaque vote reçu rapporte 1.</p>`));
    }
    if (v.phase === 'reveal') {
      const g = el('div', 'mi-grid table');
      v.table.forEach(s => {
        const f = el('button', 'mi-slot' + (s.teller ? ' teller' : '')); f.type = 'button';
        f.innerHTML = miCardHTML(s.card) + `<span class="mi-owner">${s.teller ? '★ ' : ''}${esc(s.owner)}</span>` + (s.votes.length ? `<span class="mi-votes">${s.votes.map(esc).join(', ')}</span>` : '');
        f.onclick = () => miOpen(s.card, null);
        g.appendChild(f);
      });
      zone.appendChild(g);
      if (v.isHost || v.isTeller) zone.appendChild(btn('primary lg', 'Manche suivante', () => act({ t: 'mi:next' })));
      else zone.appendChild(el('p', 'note', 'Le conteur ou l’hôte lance la suite.'));
    } else {
      const fin = el('div', 'mi-final');
      fin.innerHTML = `<span class="eyebrow">Partie terminée</span><p class="mi-final-name">${esc(v.winnerName || '')} gagne</p>`
        + `<ol class="mi-ranking">${v.scores.map(s => `<li${s.me ? ' class="me"' : ''}><span>${esc(s.name)}</span><b>${s.score}</b></li>`).join('')}</ol>`;
      zone.appendChild(fin);
      if (v.isHost) zone.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
    }
  }

  // l'hôte peut débloquer une manche qui n'avance plus
  if (v.isHost && ['clue', 'pick', 'vote'].includes(v.phase)) {
    if (v.quiet > MI_SKIP_MS) zone.appendChild(btn('ghost small', v.phase === 'clue' ? `${esc(v.tellerName)} ne joue pas ? Passer son tour` : 'Quelqu’un bloque ? Jouer pour les absents', () => act({ t: 'mi:skip' })));
    else miSkipTimer = setTimeout(() => { if (view?.mi) renderMirage(view.mi); }, MI_SKIP_MS - v.quiet + 200);
  }
  root.appendChild(zone);

  const lg = el('ul', 'mi-log');
  v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
  lg.appendChild(el('li', 'fine', `${v.deckLeft} cartes dans la pioche`));
  root.appendChild(lg);
}
