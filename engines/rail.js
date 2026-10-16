/* Grandes Lignes — notre jeu de trains façon « Aventuriers du Rail », sur une carte de France écrite pour la boîte
   (rail-carte.js : 41 villes, 91 voies, 58 billets). De 2 à 5 joueurs, robots compris.

   À son tour, on fait UNE chose : piocher deux cartes wagon (dans la rivière de cinq cartes visibles ou dans la pioche ;
   une locomotive visible compte pour deux), prendre une ligne en posant autant de cartes de sa couleur qu'elle a de
   cases (une grise accepte n'importe quelle couleur, la locomotive remplace tout), ou piocher trois billets et en garder
   au moins un. Version Europe (réglage, actif par défaut) : un tunnel retourne trois cartes de la pioche, chaque carte
   de la couleur jouée (ou locomotive) coûte une carte de plus ; un ferry exige des locomotives. Option « gares » : trois
   gares par joueur pour emprunter, en fin de partie, une ligne d'un autre qui part de la ville. Voies doublées : les deux
   voies ne s'ouvrent qu'à partir de quatre joueurs, et jamais deux au même joueur. Quand un joueur n'a plus que deux
   wagons ou moins, chacun (lui compris) joue un dernier tour. On ajoute alors les billets reliés, on retire les autres,
   10 points pour le plus long trajet continu et 4 points par gare gardée.

   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.gl), actions « gl:… ».
   LA MAIN ET LES BILLETS DE CHACUN NE SONT JAMAIS DANS LA VUE DES AUTRES avant la fin. Réutilise shuffle (core.js). */

'use strict';

const Rail = (() => {
  const K = RAIL_CARTE;                                   // rail-carte.js, chargé avant (navigateur, serveur, tools/rail/sim.js)
  const MIN = 2, MAX = 5, WAGONS = 45, SHORT = 30, STATIONS = 3, PTS = [0, 1, 2, 4, 7, 10, 15], LONGEST = 10, STATION_PTS = 4;
  const COLORS = ['rouge', 'bleu', 'jaune', 'vert', 'noir', 'blanc', 'orange', 'violet'], CARDS = [...COLORS, 'loco'];
  const PIECES = ['rouge', 'bleu', 'vert', 'jaune', 'noir'];
  const BOT_MS = [1100, 2200], BOT_NEXT_MS = 800, ABSENT_MS = 60000;
  const R = K.lignes.map(([id, a, b, n, c, t, f, voie]) => ({ id, a, b, n, c, tunnel: !!t, ferry: f, voie }));
  const T = K.billets.map(([id, a, b, p, long]) => ({ id, a, b, p, long: !!long }));
  const pair = r => r.a < r.b ? r.a + '-' + r.b : r.b + '-' + r.a;
  const TWIN = {}; R.forEach(r => { (TWIN[pair(r)] = TWIN[pair(r)] || []).push(r.id); });
  const twinOf = r => TWIN[pair(r)].find(id => id !== r.id) ?? null;
  const nameOf = k => K.villes[k]?.nom || k;
  const routeName = r => `${nameOf(r.a)} – ${nameOf(r.b)}`;

  const pl = (room, id) => room.players.find(p => p.id === id);
  const curId = room => room.order[room.turn];
  const between = ([a, b]) => a + Math.random() * (b - a);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 50) room.log.splice(0, room.log.length - 50); };
  const handSize = h => CARDS.reduce((a, c) => a + (h[c] || 0), 0);
  const emptyHand = () => Object.fromEntries(CARDS.map(c => [c, 0]));

  // ------------------------------------------------------------ les cartes
  function newDeck() { const d = []; COLORS.forEach(c => { for (let i = 0; i < 12; i++) d.push(c); }); for (let i = 0; i < 14; i++) d.push('loco'); return shuffle(d); }
  function drawCard(room) {
    if (!room.deck.length && room.discard.length) { room.deck = shuffle(room.discard); room.discard = []; }
    return room.deck.pop() || null;
  }
  /** Remplit la rivière ; trois locomotives visibles : on défausse les cinq et on recommence (trois fois au plus). */
  function fillRiver(room) {
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 5; i++) if (!room.river[i]) room.river[i] = drawCard(room);
      if (room.river.filter(c => c === 'loco').length < 3 || k === 3) break;
      room.river.forEach(c => c && room.discard.push(c)); room.river = [null, null, null, null, null];
      log(room, 'Trois locomotives visibles : la rivière est rebattue.');
    }
  }

  // ------------------------------------------------------------ prendre une ligne
  /** Comment payer la ligne r avec la main h, en couleur c (une grise : la couleur choisie ; 'loco' : que des locomotives).
      La couleur d'abord, puis des locomotives ; un ferry en exige r.ferry. null si la main ne suffit pas. */
  function payment(h, r, c) {
    if (r.c !== 'gris' && c !== 'loco') c = r.c;
    if (!CARDS.includes(c)) return null;
    if (c === 'loco') return h.loco >= r.n ? { c, col: 0, loco: r.n } : null;
    const col = Math.min(h[c], r.n - r.ferry), loco = r.n - col;
    return loco <= h.loco ? { c, col, loco } : null;
  }
  /** Les façons possibles de payer (une par couleur, la moins gourmande en locomotives d'abord). */
  function payments(h, r) {
    const cs = r.c === 'gris' ? COLORS : [r.c];
    const out = cs.map(c => payment(h, r, c)).filter(Boolean);
    const all = payment(h, r, 'loco'); if (all && !out.some(p => p.col === 0)) out.push(all);
    return out.sort((a, b) => a.loco - b.loco || b.col - a.col);
  }
  /** Pourquoi pid ne peut pas prendre r (ou '' s'il peut, cartes mises à part). */
  function blocked(room, pid, r) {
    if (!r) return 'Ligne inconnue';
    if (room.claims[r.id] != null) return 'Cette ligne est déjà prise';
    const tw = twinOf(r);
    if (tw != null && room.claims[tw] != null) {
      if (room.claims[tw] === pid) return 'Tu as déjà l’autre voie';
      if (room.order.length < 4) return 'À moins de quatre, une seule voie est ouverte';
    }
    if (pl(room, pid).wagons < r.n) return 'Plus assez de wagons';
    return '';
  }

  // ------------------------------------------------------------ la partie
  function create({ hostId, players, short, europe = true, stations = false }) {
    const room = {
      hostId, phase: 'setup', seq: 0, log: [], europe: europe !== false, stationsOn: !!stations,
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, inGame: p.online !== false,
        hand: emptyHand(), tickets: [], offer: null, keepMin: 2, wagons: short ? SHORT : WAGONS, score: 0, stations: [], piece: null })),
      order: [], turn: 0, draws: 0, claims: {}, deck: newDeck(), discard: [], river: [null, null, null, null, null],
      shorts: shuffle(T.filter(t => !t.long).map(t => t.id)), longs: shuffle(T.filter(t => t.long).map(t => t.id)),
      tunnel: null, last: null, final: null, winner: null, turnAt: Date.now(), botAt: 0, startAt: Date.now(), passes: 0, lastAct: null,
    };
    room.order = shuffle(room.players.filter(p => p.inGame).map(p => p.id));
    room.order.forEach((id, i) => { pl(room, id).piece = PIECES[i]; });
    room.order.forEach(id => {
      const p = pl(room, id);
      for (let i = 0; i < 4; i++) p.hand[drawCard(room)]++;
      p.offer = [room.longs.pop(), ...room.shorts.splice(-3)].filter(x => x != null); p.keepMin = 2;
    });
    fillRiver(room);
    room.botAt = Date.now() + between(BOT_MS);
    log(room, `${room.order.length} joueurs, ${pl(room, room.order[0]).wagons} wagons chacun. Choisissez vos billets.`);
    return room;
  }

  function startPlay(room) {
    room.phase = 'play'; room.turn = 0; room.draws = 0; room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS);
    log(room, `${pl(room, curId(room)).name} ouvre la partie.`);
  }

  function endTurn(room) {
    const p = pl(room, curId(room));
    room.draws = 0; room.tunnel = null; p.offer = null;
    if (room.last) { room.last.left -= 1; if (room.last.left <= 0) return finish(room); }
    else if (p.wagons <= 2) {
      room.last = { by: p.id, left: room.order.length };
      log(room, `${p.name} n’a plus que ${p.wagons} wagon${p.wagons > 1 ? 's' : ''}. Dernier tour pour tout le monde.`);
    }
    // personne ne peut plus rien faire depuis un tour complet : on arrête là
    if (room.passes >= room.order.length * 2) { log(room, 'Plus rien ne bouge : on compte.'); return finish(room); }
    room.turn = (room.turn + 1) % room.order.length;
    room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS); room.seq += 1;
  }

  function myTurn(room, pid) {
    if (room.phase !== 'play') return 'La partie n’est pas en cours';
    if (curId(room) !== pid) return 'Ce n’est pas ton tour';
    return '';
  }

  function draw(room, pid, i) {
    const e = myTurn(room, pid); if (e) return e;
    const p = pl(room, pid);
    if (p.offer || room.tunnel) return 'Termine d’abord ton choix';
    i = Math.round(+i);
    let c;
    if (i >= 0 && i < 5) {
      c = room.river[i]; if (!c) return 'Plus de carte ici';
      if (c === 'loco' && room.draws) return 'Une locomotive visible se prend en premier';
      room.river[i] = null; fillRiver(room);
    } else { c = drawCard(room); if (!c) return 'La pioche est vide'; }
    p.hand[c]++; room.passes = 0;
    const visible = i >= 0 && i < 5;
    room.lastAct = { by: pid, kind: 'draw', card: visible ? c : null, secret: visible ? null : c, at: Date.now() };   // la carte cachée : seulement pour lui
    room.draws += visible && c === 'loco' ? 2 : 1;
    // plus rien à piocher pour la deuxième carte : le tour s'arrête là
    const nothing = !room.deck.length && !room.discard.length && !room.river.some(x => x && x !== 'loco');
    if (room.draws >= 2 || nothing) {
      log(room, `${p.name} pioche ${visible && c === 'loco' && room.draws === 2 && !nothing ? 'une locomotive' : 'deux cartes'}.`);
      endTurn(room);
    } else { room.seq += 1; room.botAt = Date.now() + BOT_NEXT_MS; }
    return null;
  }

  function claim(room, pid, rid, c) {
    const e = myTurn(room, pid); if (e) return e;
    const p = pl(room, pid);
    if (room.draws) return 'Tu as commencé à piocher';
    if (p.offer || room.tunnel) return 'Termine d’abord ton choix';
    const r = R[Math.round(+rid)], b = blocked(room, pid, r); if (b) return b;
    const rr = room.europe ? r : { ...r, tunnel: false, ferry: 0 };
    const pay = payment(p.hand, rr, c ?? (r.c === 'gris' ? (payments(p.hand, rr)[0]?.c) : r.c));
    if (!pay) return rr.ferry ? `Il te faut ${r.n} cartes, dont ${rr.ferry} locomotive${rr.ferry > 1 ? 's' : ''}` : 'Pas assez de cartes pour cette ligne';
    if (rr.tunnel) {
      const shown = []; for (let k = 0; k < 3; k++) { const x = drawCard(room); if (x) shown.push(x); }
      const extra = shown.filter(x => x === 'loco' || (pay.c !== 'loco' && x === pay.c)).length;
      room.tunnel = { r: r.id, c: pay.c, pay, shown, extra, by: pid };
      log(room, `${p.name} tente le tunnel ${routeName(r)}.`);
      if (!extra) return payRoute(room, p, r, pay, 0);
      room.seq += 1; room.botAt = Date.now() + BOT_NEXT_MS + 600;
      return null;
    }
    return payRoute(room, p, r, pay, 0);
  }
  /** Les cartes en plus d'un tunnel : la couleur jouée d'abord, puis des locomotives. */
  function extraPay(h, pay, extra) {
    const left = { ...h }; left[pay.c === 'loco' ? 'loco' : pay.c] -= pay.col; left.loco -= pay.loco;
    if (pay.c === 'loco') return left.loco >= extra ? { col: 0, loco: extra } : null;
    const col = Math.min(left[pay.c], extra), loco = extra - col;
    return loco <= left.loco ? { col, loco } : null;
  }
  function payRoute(room, p, r, pay, extra) {
    const x = extra ? extraPay(p.hand, pay, extra) : { col: 0, loco: 0 };
    if (!x) return 'Pas assez de cartes pour le tunnel';
    const col = pay.col + x.col, loco = pay.loco + x.loco;
    if (pay.c !== 'loco') p.hand[pay.c] -= col;
    p.hand.loco -= loco;
    for (let k = 0; k < col; k++) room.discard.push(pay.c);
    for (let k = 0; k < loco; k++) room.discard.push('loco');
    if (room.tunnel) { room.tunnel.shown.forEach(c => room.discard.push(c)); }
    room.claims[r.id] = p.id; p.wagons -= r.n; p.score += PTS[r.n]; room.passes = 0;
    room.lastAct = { by: p.id, kind: 'claim', r: r.id, at: Date.now() };
    log(room, `${p.name} prend ${routeName(r)} : ${r.n} wagon${r.n > 1 ? 's' : ''}, ${PTS[r.n]} point${PTS[r.n] > 1 ? 's' : ''}.`);
    endTurn(room);
    return null;
  }
  function tunnelAnswer(room, pid, yes) {
    const t = room.tunnel; if (!t || t.by !== pid || curId(room) !== pid) return null;
    const p = pl(room, pid), r = R[t.r];
    if (yes && !payRoute(room, p, r, t.pay, t.extra)) return null;              // payé : la ligne est prise ; sinon on renonce
    t.shown.forEach(c => room.discard.push(c));
    log(room, `${p.name} renonce au tunnel ${routeName(r)}.`);
    room.lastAct = { by: pid, kind: 'tunnel-no', r: r.id, at: Date.now() };
    endTurn(room);
    return null;
  }

  function askTickets(room, pid) {
    const e = myTurn(room, pid); if (e) return e;
    const p = pl(room, pid);
    if (room.draws) return 'Tu as commencé à piocher';
    if (p.offer || room.tunnel) return 'Termine d’abord ton choix';
    if (!room.shorts.length) return 'Plus de billets dans la pile';
    p.offer = room.shorts.splice(-3).reverse(); p.keepMin = 1;
    room.seq += 1; room.botAt = Date.now() + BOT_NEXT_MS + 400;
    return null;
  }
  function keep(room, pid, ids) {
    const p = pl(room, pid); if (!p?.offer) return null;
    ids = [...new Set((Array.isArray(ids) ? ids : []).map(Number))].filter(id => p.offer.includes(id));
    if (ids.length < Math.min(p.keepMin, p.offer.length)) return p.keepMin > 1 ? 'Garde au moins deux billets' : 'Garde au moins un billet';
    p.tickets.push(...ids);
    room.shorts.unshift(...p.offer.filter(id => !ids.includes(id) && !T[id].long));       // les billets rendus repartent sous la pile
    p.offer = null;
    if (room.phase === 'setup') {
      room.seq += 1;
      if (room.order.every(id => !pl(room, id).offer)) startPlay(room);
      return null;
    }
    if (curId(room) !== pid) return null;
    room.passes = 0; room.lastAct = { by: pid, kind: 'tickets', n: ids.length, at: Date.now() };
    log(room, `${p.name} garde ${ids.length} billet${ids.length > 1 ? 's' : ''}.`);
    endTurn(room);
    return null;
  }

  function station(room, pid, city, c) {
    const e = myTurn(room, pid); if (e) return e;
    if (!room.stationsOn) return 'Les gares ne sont pas en jeu';
    const p = pl(room, pid);
    if (room.draws) return 'Tu as commencé à piocher';
    if (p.offer || room.tunnel) return 'Termine d’abord ton choix';
    if (!K.villes[city]) return 'Ville inconnue';
    if (p.stations.length >= STATIONS) return 'Tu n’as plus de gare';
    if (room.players.some(q => q.stations.includes(city))) return 'Il y a déjà une gare ici';
    const n = p.stations.length + 1, pay = payment(p.hand, { n, c: 'gris', ferry: 0 }, c ?? payments(p.hand, { n, c: 'gris', ferry: 0 })[0]?.c);
    if (!pay) return `Une gare coûte ${n} carte${n > 1 ? 's' : ''} de la même couleur`;
    if (pay.c !== 'loco') { p.hand[pay.c] -= pay.col; for (let k = 0; k < pay.col; k++) room.discard.push(pay.c); }
    p.hand.loco -= pay.loco; for (let k = 0; k < pay.loco; k++) room.discard.push('loco');
    p.stations.push(city); room.passes = 0;
    room.lastAct = { by: pid, kind: 'station', city, at: Date.now() };
    log(room, `${p.name} bâtit une gare à ${nameOf(city)}.`);
    endTurn(room);
    return null;
  }

  function pass(room, pid) {
    const e = myTurn(room, pid); if (e) return e;
    if (room.draws) return 'Termine ta pioche';
    if (canAct(room, pid)) return 'Tu peux encore jouer';
    room.passes += 1; log(room, `${pl(room, pid).name} passe son tour.`); endTurn(room); return null;
  }
  /** Le joueur peut-il faire quelque chose ? (piocher, une ligne, des billets) */
  function canAct(room, pid) {
    const p = pl(room, pid);
    if (room.deck.length || room.discard.length || room.river.some(Boolean)) return true;
    if (room.shorts.length) return true;
    return R.some(r => !blocked(room, pid, r) && payments(p.hand, room.europe ? r : { ...r, ferry: 0 }).length);
  }

  // ------------------------------------------------------------ fin de partie
  /** Les villes reliées par une liste de lignes : une fonction (a, b) → vrai. */
  function linker(rids) {
    const up = {}; const f = x => (up[x] == null || up[x] === x ? (up[x] = x) : (up[x] = f(up[x])));
    rids.forEach(id => { const r = R[id]; up[f(r.a)] = f(r.b); });
    return (a, b) => f(a) === f(b);
  }
  /** Le plus long trajet continu (chaque ligne une seule fois), en wagons. */
  function longest(rids) {
    const adj = {}; rids.forEach(id => { const r = R[id]; (adj[r.a] = adj[r.a] || []).push(r); (adj[r.b] = adj[r.b] || []).push(r); });
    let best = 0; const used = new Set();
    const dfs = (v, len) => { if (len > best) best = len; for (const r of adj[v] || []) if (!used.has(r.id)) { used.add(r.id); dfs(r.a === v ? r.b : r.a, len + r.n); used.delete(r.id); } };
    Object.keys(adj).forEach(v => dfs(v, 0));
    return best;
  }
  const mine = (room, pid) => Object.keys(room.claims).filter(id => room.claims[id] === pid).map(Number);
  /** Les gares : chacune emprunte au mieux UNE ligne d'un autre qui part de sa ville (on essaie toutes les combinaisons). */
  function bestBorrow(room, p) {
    const own = mine(room, p.id), opts = p.stations.map(city => [null, ...Object.keys(room.claims).map(Number).filter(id => room.claims[id] !== p.id && (R[id].a === city || R[id].b === city))]);
    let best = { pts: -1e9, borrow: [] };
    const go = (k, picked) => {
      if (k === opts.length) {
        const ln = linker([...own, ...picked.filter(x => x != null)]);
        const pts = p.tickets.reduce((a, id) => a + (ln(T[id].a, T[id].b) ? T[id].p : -T[id].p), 0);
        if (pts > best.pts) best = { pts, borrow: picked.slice() };
        return;
      }
      for (const o of opts[k]) { picked.push(o); go(k + 1, picked); picked.pop(); }
    };
    go(0, []);
    return best.borrow;
  }
  function finish(room) {
    room.phase = 'over'; room.tunnel = null;
    const rows = room.order.map(id => {
      const p = pl(room, id), own = mine(room, id), borrow = room.stationsOn ? bestBorrow(room, p) : [];
      const ln = linker([...own, ...borrow.filter(x => x != null)]);
      const tickets = p.tickets.map(t => ({ id: t, ok: ln(T[t].a, T[t].b), p: T[t].p }));
      return { id, name: p.name, piece: p.piece, routes: p.score, tickets, ticketPts: tickets.reduce((a, t) => a + (t.ok ? t.p : -t.p), 0),
        done: tickets.filter(t => t.ok).length, long: longest(own), stationsLeft: room.stationsOn ? STATIONS - p.stations.length : 0,
        borrowed: borrow.filter(x => x != null) };
    });
    const top = Math.max(0, ...rows.map(r => r.long));
    rows.forEach(r => { r.longest = top > 0 && r.long === top; r.total = r.routes + r.ticketPts + (r.longest ? LONGEST : 0) + r.stationsLeft * STATION_PTS; });
    rows.sort((a, b) => b.total - a.total || b.done - a.done || b.long - a.long);
    room.final = rows; room.winner = rows[0]?.id ?? null; room.seq += 1;
    log(room, `${rows[0]?.name} gagne avec ${rows[0]?.total} points.`);
  }

  // ------------------------------------------------------------ robots
  // Ils relient leurs billets par le plus court chemin libre (une ligne à eux ne coûte rien), prennent d'abord la plus
  // longue ligne utile qu'ils peuvent payer, piochent les couleurs qui leur manquent, et finissent par les longues lignes.
  function plan(room, p) {
    const own = new Set(mine(room, p.id)), ln = linker([...own]);
    const todo = p.tickets.map(id => T[id]).filter(t => !ln(t.a, t.b));
    const need = new Map();
    for (const t of todo) {
      const dist = { [t.a]: 0 }, prev = {}, q = [[0, t.a]], seen = new Set();
      while (q.length) {
        q.sort((a, b) => a[0] - b[0]); const [d, v] = q.shift(); if (seen.has(v)) continue; seen.add(v); if (v === t.b) break;
        for (const r of R) {
          if (r.a !== v && r.b !== v) continue;
          const w = r.a === v ? r.b : r.a;
          let cost;
          if (own.has(r.id)) cost = 0;
          else if (blocked(room, p.id, r)) continue;
          else cost = r.n + (room.europe && r.tunnel ? 0.7 : 0) + (room.europe ? r.ferry * 0.8 : 0) + 0.3;
          if (d + cost < (dist[w] ?? 1e9)) { dist[w] = d + cost; prev[w] = r.id; q.push([d + cost, w]); }
        }
      }
      if (dist[t.b] == null) continue;
      for (let v = t.b; v !== t.a; ) { const r = R[prev[v]]; if (!own.has(r.id)) need.set(r.id, (need.get(r.id) || 0) + t.p); v = r.a === v ? r.b : r.a; }
    }
    return { todo, need };
  }
  function botMove(room, p) {
    if (p.offer) {                                                         // garder des billets : les plus courts
      const o = p.offer.map(id => T[id]).sort((a, b) => a.p - b.p), long = o.find(t => t.long);
      if (room.phase === 'setup') return keep(room, p.id, (long && Math.random() < 0.3 ? [long, o.find(t => !t.long)] : o.filter(t => !t.long).slice(0, 2)).filter(Boolean).map(t => t.id));
      return keep(room, p.id, o.slice(0, o[1] && o[1].p <= 7 && p.wagons >= 20 ? 2 : 1).map(t => t.id));
    }
    if (room.tunnel) return tunnelAnswer(room, p.id, !!extraPay(p.hand, room.tunnel.pay, room.tunnel.extra));
    const { todo, need } = plan(room, p), eff = r => room.europe ? r : { ...r, tunnel: false, ferry: 0 };
    if (!room.draws) {
      // une ligne utile qu'il peut payer, la plus longue d'abord
      const useful = [...need.keys()].map(id => R[id]).filter(r => !blocked(room, p.id, r)).sort((a, b) => b.n - a.n);
      for (const r of useful) { const pay = payments(p.hand, eff(r))[0]; if (pay && (pay.loco <= 1 || r.n >= 4 || p.wagons < 12)) return claim(room, p.id, r.id, pay.c); }
      // plus de billet en cours : des billets en plus tant qu'il reste de quoi, sinon les longues lignes
      if (!todo.length && p.wagons >= 16 && room.shorts.length && !room.last && Math.random() < 0.7) return askTickets(room, p.id);
      if (!todo.length || p.wagons < 9 || room.last) {
        const any = R.filter(r => !blocked(room, p.id, r) && r.n <= p.wagons).map(r => ({ r, pay: payments(p.hand, eff(r))[0] })).filter(x => x.pay)
          .sort((a, b) => b.r.n - a.r.n || a.pay.loco - b.pay.loco);
        if (any.length && (any[0].r.n >= 3 || room.last || p.wagons < 6 || handSize(p.hand) > 14)) return claim(room, p.id, any[0].r.id, any[0].pay.c);
      }
    }
    // piocher : la couleur qui manque le plus aux lignes utiles
    const want = {};
    for (const [id, w] of need) { const r = R[id]; if (r.c === 'gris') continue; want[r.c] = (want[r.c] || 0) + Math.max(0, r.n - p.hand[r.c]) * (1 + w / 20); }
    let best = -1, bestW = 0;
    room.river.forEach((c, i) => {
      if (!c) return;
      const w = c === 'loco' ? (room.draws ? -1 : 2.2) : (want[c] || 0) + (need.size ? 0 : 0.3);
      if (w > bestW) { bestW = w; best = i; }
    });
    if (best >= 0 && bestW >= 1) return draw(room, p.id, best);
    if (room.deck.length || room.discard.length) return draw(room, p.id, -1);
    const any = room.river.findIndex(c => c && (c !== 'loco' || !room.draws));
    if (any >= 0) return draw(room, p.id, any);
    if (!room.draws && room.shorts.length) return askTickets(room, p.id);
    return room.draws ? (endTurn(room), null) : pass(room, p.id);
  }

  /** Un coup de robot qui ne bloque jamais la table : s'il est refusé, on pioche, sinon on passe. */
  function safeBot(room, p) {
    if (!botMove(room, p)) return;
    if (p.offer) return keep(room, p.id, p.offer.slice(0, Math.max(1, p.keepMin)));
    if (room.tunnel) return tunnelAnswer(room, p.id, false);
    if (draw(room, p.id, -1) === null) return;
    const i = room.river.findIndex(c => c && (c !== 'loco' || !room.draws)); if (i >= 0 && draw(room, p.id, i) === null) return;
    if (room.draws) { endTurn(room); return; }
    room.passes += 1; log(room, `${p.name} passe son tour.`); endTurn(room);
  }

  function tick(room) {
    const now = Date.now();
    if (room.phase === 'setup') {
      for (const id of room.order) {
        const p = pl(room, id);
        if (p.offer && (p.bot ? now >= room.botAt : !p.online && now - room.startAt > ABSENT_MS)) { if (!p.bot) log(room, `${p.name} est absent : le robot choisit ses billets.`); botMove(room, p); return true; }
      }
      return false;
    }
    if (room.phase !== 'play') return false;
    const p = pl(room, curId(room)); if (!p) return false;
    if (p.bot && now >= room.botAt) { safeBot(room, p); room.seq += 1; return true; }
    // absent une minute à son tour : le robot joue ce coup à sa place
    if (!p.bot && !p.online && now - room.turnAt > ABSENT_MS) {
      log(room, `${p.name} est absent : le robot joue ce coup.`);
      const turn = room.turn; let k = 0;
      while (room.phase === 'play' && room.turn === turn && curId(room) === p.id && k++ < 4) safeBot(room, p);
      room.seq += 1; return true;
    }
    return false;
  }

  function act(room, pid, m) {
    if (!pl(room, pid)) return null;
    switch (m.t) {
      case 'gl:draw': return draw(room, pid, m.i);
      case 'gl:claim': return claim(room, pid, m.r, m.c);
      case 'gl:tunnel': return tunnelAnswer(room, pid, !!m.yes);
      case 'gl:tickets': return askTickets(room, pid);
      case 'gl:keep': return keep(room, pid, m.ids);
      case 'gl:station': return station(room, pid, m.city, m.c);
      case 'gl:pass': return pass(room, pid);
    }
    return null;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; room.seq += 1; return; }
    room.players.push({ id, name, online: true, bot: false, inGame: false, hand: emptyHand(), tickets: [], offer: null, keepMin: 1, wagons: 0, score: 0, stations: [], piece: null });
    room.seq += 1;
  }
  function setOnline(room, id, on) { const p = pl(room, id); if (p) { p.online = on; room.seq += 1; } }

  // ------------------------------------------------------------ ce que voit chaque téléphone
  function view(room, pid) {
    const me = pl(room, pid), cur = room.phase === 'play' ? curId(room) : null, over = room.phase === 'over';
    const inGame = !!me && room.order.includes(pid);
    const ln = inGame ? linker(mine(room, pid)) : null;
    const t = room.tunnel;
    return {
      phase: room.phase, seq: room.seq, isHost: pid === room.hostId, europe: room.europe, stationsOn: room.stationsOn, since: room.turnAt,
      n: room.order.length, open2: room.order.length >= 4,
      players: room.order.map(id => pl(room, id)).map(p => ({
        id: p.id, name: p.name, bot: p.bot, online: p.online, piece: p.piece, wagons: p.wagons, cards: handSize(p.hand), tickets: p.tickets.length,
        score: p.score, stations: p.stations.slice(), turn: p.id === cur, me: p.id === pid, choosing: !!p.offer,
      })),
      claims: room.claims, river: room.river.slice(), deck: room.deck.length + room.discard.length, ticketsLeft: room.shorts.length,
      currentId: cur, draws: cur === pid ? room.draws : 0, myTurn: cur === pid && inGame,
      tunnel: t ? { r: t.r, c: t.c, shown: t.shown, extra: t.extra, by: t.by, canPay: t.by === pid ? !!extraPay(me.hand, t.pay, t.extra) : null } : null,
      last: room.last ? { by: room.last.by, left: room.last.left } : null,
      lastAct: room.lastAct ? { ...room.lastAct, secret: undefined, got: room.lastAct.by === pid ? room.lastAct.secret : undefined } : null,
      me: inGame ? {
        hand: { ...me.hand }, offer: me.offer ? me.offer.slice() : null, keepMin: me.keepMin, wagons: me.wagons,
        tickets: me.tickets.map(id => ({ id, ok: ln(T[id].a, T[id].b) })), stations: me.stations.slice(),
      } : null,
      final: over ? room.final : null, winner: room.winner,                // les billets de tous ne sortent qu'ici
      log: room.log.slice(-16),
    };
  }

  return { MIN, MAX, WAGONS, SHORT, STATIONS, PTS, LONGEST, STATION_PTS, COLORS, CARDS, PIECES, K, R, T, twinOf, routeName, nameOf, payment, payments, blocked, linker, longest,
    create, act, tick, join, setOnline, view };
})();
if (typeof module !== 'undefined') module.exports = Rail;
