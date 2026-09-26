/* Duel des Cités — l'équivalent maison de 7 Wonders Duel, pour deux joueurs (ou un joueur contre le robot).

   Trois âges de 20 cartes posées en pyramide, en partie face cachée. À son tour, on prend une carte
   libre (rien ne la recouvre) et on la construit, on la défausse pour des pièces, ou on la glisse sous
   une de ses merveilles pour la bâtir. Les ressources qui manquent s'achètent à la banque : 2 pièces,
   plus 1 par exemplaire que l'adversaire produit lui-même.
   Trois façons de gagner : militaire (le pion atteint la capitale adverse), scientifique (6 symboles
   différents), ou civile (le plus de points à la fin de l'âge III).
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.du), actions « du:… ».
   Chargé après app.js et duel-cartes.js : réutilise $, el, act, esc, toast, shuffle, net et view. */

'use strict';

const DU_RES = { B: '🪵', A: '🧱', P: '🪨', V: '🧪', Y: '📜' };
const DU_RES_NAME = { B: 'bois', A: 'argile', P: 'pierre', V: 'verre', Y: 'papyrus' };
const DU_SCI = { roue: '☸️', compas: '📐', plume: '🪶', pilon: '⚗️', sablier: '⏳', globe: '🌐', balance: '⚖️' };
const DU_CHAIN = { masque: '🎭', lune: '🌙', goutte: '💧', fer: '🐎', epee: '🗡️', tour: '🗼', livre: '📖', engrenage: '🔧', jarre: '🏺', pilier: '🏛️', soleil: '☀️', fronton: '📯', lampe: '💡', harpe: '🎵', cible: '🎯', casque: '⛑️', baril: '🛢️' };
const DU_COLOR = { brun: 'matière première', gris: 'produit manufacturé', bleu: 'bâtiment civil', vert: 'bâtiment scientifique', rouge: 'bâtiment militaire', jaune: 'bâtiment commercial', violet: 'guilde' };
const DU_GUILD = {
  batisseurs: '2 points par merveille de la cité qui en a le plus.',
  preteurs: '1 point par tranche de 3 pièces de la cité la plus riche.',
  vert: '1 pièce et 1 point par bâtiment vert de la cité qui en a le plus.',
  brungris: '1 pièce et 1 point par carte marron et grise de la cité qui en a le plus.',
  jaune: '1 pièce et 1 point par bâtiment jaune de la cité qui en a le plus.',
  bleu: '1 pièce et 1 point par bâtiment bleu de la cité qui en a le plus.',
  rouge: '1 pièce et 1 point par bâtiment rouge de la cité qui en a le plus.',
};

const Duel = (() => {
  const RES = ['B', 'A', 'P', 'V', 'Y'];
  const SHAPES = { 1: [2, 3, 4, 5, 6], 2: [6, 5, 4, 3, 2], 3: [2, 3, 4, 'm', 4, 3, 2] };
  const CARD = i => DU_CARDS[i], WONDER = i => DU_WONDERS[i];
  const other = s => 1 - s;
  const parse = str => { const res = {}; const m = String(str || '').match(/\d+/); for (const ch of String(str || '').replace(/\d+/g, '')) res[ch] = (res[ch] || 0) + 1; return { coins: m ? +m[0] : 0, res }; };
  const count = (city, t) => city.cards.filter(i => CARD(i).t === t).length;
  const has = (city, k) => city.tokens.includes(k);
  const builtWonders = city => city.wonders.filter(w => w.built).length;
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };
  const bump = room => { room.seq += 1; room.turnAt = Date.now(); };

  function fixedProd(city) {
    const r = { B: 0, A: 0, P: 0, V: 0, Y: 0 };
    city.cards.forEach(i => { const c = CARD(i); if ((c.t === 'brun' || c.t === 'gris') && c.p) for (const ch of c.p) r[ch] += 1; });
    return r;
  }
  const choices = city => [...city.cards.map(i => CARD(i).ch), ...city.wonders.filter(w => w.built).map(w => WONDER(w.w).ch)].filter(Boolean);
  const tradeSet = city => new Set(city.cards.flatMap(i => (CARD(i).tr || '').split('')).filter(Boolean));
  const chains = city => new Set(city.cards.map(i => CARD(i).ct).filter(Boolean));
  function sciSymbols(city) {
    const m = {}; city.cards.forEach(i => { const s = CARD(i).sci; if (s) m[s] = (m[s] || 0) + 1; });
    if (has(city, 'loi')) m.balance = 1;
    return m;
  }

  /** Ce que coûte un coût donné pour la cité s : pièces fixes + achats à la banque, au mieux. */
  function price(room, s, costStr, kind) {
    const city = room.city[s], opp = room.city[other(s)], cost = parse(costStr), fx = fixedProd(city), ofx = fixedProd(opp);
    const need = { B: 0, A: 0, P: 0, V: 0, Y: 0 };
    RES.forEach(r => { need[r] = Math.max(0, (cost.res[r] || 0) - fx[r]); });
    const ch = choices(city), tr = tradeSet(city);
    const unit = r => tr.has(r) ? 1 : 2 + ofx[r];
    const reduce = (kind === 'wonder' && has(city, 'archi')) || (kind === 'bleu' && has(city, 'macon')) ? 2 : 0;
    let best = Infinity;
    const walk = (k, n) => {
      if (k === ch.length) {
        const prices = []; RES.forEach(r => { for (let i = 0; i < n[r]; i++) prices.push(unit(r)); });
        prices.sort((a, b) => b - a);
        const sum = prices.slice(reduce).reduce((a, b) => a + b, 0);
        if (sum < best) best = sum; return;
      }
      walk(k + 1, n);
      for (const r of new Set(ch[k])) if (n[r] > 0) { n[r] -= 1; walk(k + 1, n); n[r] += 1; }
    };
    walk(0, need);
    return { total: cost.coins + best, trade: best, base: cost.coins, chain: false };
  }
  function cardPrice(room, s, i) {
    const c = CARD(i);
    if (c.cf && chains(room.city[s]).has(c.cf)) return { total: 0, trade: 0, base: 0, chain: true };
    return price(room, s, c.c, c.t === 'bleu' ? 'bleu' : 'card');
  }

  // ------------------------------------------------ la pyramide
  function deal(room) {
    const age = room.age;
    let ids = shuffle(DU_CARDS.map((c, i) => i).filter(i => CARD(i).a === age));
    if (age === 3) ids = shuffle(ids.slice(0, 17).concat(shuffle(DU_CARDS.map((c, i) => i).filter(i => CARD(i).a === 4)).slice(0, 3)));
    else ids = ids.slice(0, 20);
    room.board = []; let k = 0;
    SHAPES[age].forEach((n, r) => {
      const xs = n === 'm' ? [-2, 2] : [...Array(n)].map((_, j) => -(n - 1) + 2 * j);
      xs.forEach(x => room.board.push({ card: ids[k++], r, x, up: r % 2 === 0, taken: false }));
    });
    flip(room);
  }
  const covered = (room, b) => room.board.some(o => !o.taken && o.r === b.r + 1 && Math.abs(o.x - b.x) === 1);
  const accessible = (room, b) => !b.taken && !covered(room, b);
  function flip(room) { room.board.forEach(b => { if (!b.taken && !b.up && !covered(room, b)) b.up = true; }); }

  // ------------------------------------------------ mise en place et repêchage des merveilles
  function create({ hostId, players, rival }) {
    const humans = players.filter(p => p.online !== false);
    const seats = [{ id: humans[0].id, name: humans[0].name, bot: false, online: true }];
    if (rival !== 'robot' && humans[1]) seats.push({ id: humans[1].id, name: humans[1].name, bot: false, online: true });
    else seats.push({ id: 'bot', name: 'Robot Hélios', bot: true, online: true });
    const room = {
      hostId, seats, phase: 'draft', age: 1, board: [], discard: [], military: 0, milTok: {},
      tokensBoard: [], tokensSpare: [], city: [0, 1].map(() => ({ coins: 7, cards: [], wonders: [], tokens: [] })),
      draft: null, cur: 0, first: 0, pending: [], replay: false, chooser: null, winner: null, winType: null, final: null,
      log: [], seq: 0, turnAt: Date.now(), lastSeat: 0,
    };
    const tk = shuffle(DU_TOKENS.map(t => t.k)); room.tokensBoard = tk.slice(0, 5); room.tokensSpare = tk.slice(5);
    const w = shuffle([...DU_WONDERS.keys()]).slice(0, 8);
    const f = Math.random() < .5 ? 0 : 1, g = other(f);
    room.first = f;
    room.draft = { pools: [w.slice(0, 4), w.slice(4)], pool: 0, order: [[f, g, g, f], [g, f, f, g]], step: 0 };
    room.cur = f;
    log(room, `Repêchage des merveilles. ${seats[f].name} choisit en premier.`);
    return room;
  }
  function draftPick(room, s, w) {
    const d = room.draft, pool = d.pools[d.pool];
    if (room.phase !== 'draft' || room.cur !== s || !pool.includes(w)) return null;
    pool.splice(pool.indexOf(w), 1);
    room.city[s].wonders.push({ w, built: false, lost: false, card: null });
    d.step += 1;
    if (pool.length === 1) { room.city[d.order[d.pool][3]].wonders.push({ w: pool.pop(), built: false, lost: false, card: null }); d.step = 4; }
    if (d.step >= 4) { d.pool += 1; d.step = 0; }
    if (d.pool >= 2) {
      room.phase = 'play'; room.age = 1; deal(room); room.cur = room.first;
      log(room, `Âge I. ${room.seats[room.first].name} commence.`);
    } else room.cur = d.order[d.pool][d.step];
    bump(room); return null;
  }

  // ------------------------------------------------ effets
  function win(room, s, type) {
    if (room.winner !== null) return;
    room.winner = s; room.winType = type; room.phase = 'over'; room.final = scores(room);
    log(room, `Victoire ${type} pour ${room.seats[s].name}.`);
  }
  function military(room, s, n) {
    if (!n) return;
    room.military = Math.max(-9, Math.min(9, room.military + (s === 0 ? n : -n)));
    [[3, 2], [6, 5]].forEach(([at, loss]) => {
      if (room.military >= at && !room.milTok['1-' + at]) { room.milTok['1-' + at] = true; const c = room.city[1]; const l = Math.min(loss, c.coins); c.coins -= l; log(room, `${room.seats[1].name} se fait piller ${l} pièce${l > 1 ? 's' : ''}.`); }
      if (room.military <= -at && !room.milTok['0-' + at]) { room.milTok['0-' + at] = true; const c = room.city[0]; const l = Math.min(loss, c.coins); c.coins -= l; log(room, `${room.seats[0].name} se fait piller ${l} pièce${l > 1 ? 's' : ''}.`); }
    });
    if (Math.abs(room.military) >= 9) win(room, room.military > 0 ? 0 : 1, 'militaire');
  }
  function checkScience(room, s) { if (Object.keys(sciSymbols(room.city[s])).length >= 6) win(room, s, 'scientifique'); }
  function guildCount(room, g) {
    const f = c => g === 'batisseurs' ? builtWonders(c) : g === 'preteurs' ? Math.floor(c.coins / 3) : g === 'brungris' ? count(c, 'brun') + count(c, 'gris') : count(c, g);
    return Math.max(f(room.city[0]), f(room.city[1]));
  }
  const guildVP = (room, g) => (g === 'batisseurs' ? 2 : 1) * guildCount(room, g);
  function pay(room, s, pr) {
    room.city[s].coins -= pr.total;
    if (pr.trade > 0 && has(room.city[other(s)], 'eco')) room.city[other(s)].coins += pr.trade;
  }
  function buildCard(room, s, i, free) {
    const city = room.city[s], c = CARD(i);
    if (!free) { const pr = cardPrice(room, s, i); pay(room, s, pr); if (pr.chain && has(city, 'urba')) city.coins += 4; }
    city.cards.push(i);
    if (c.co) city.coins += c.co;
    if (c.per) city.coins += c.pc * (c.per === 'merveille' ? builtWonders(city) : count(city, c.per));
    if (c.g && c.g !== 'batisseurs' && c.g !== 'preteurs') city.coins += guildCount(room, c.g);
    if (c.sh) military(room, s, c.sh + (has(city, 'strat') ? 1 : 0));
    if (c.sci) {
      if (sciSymbols(city)[c.sci] === 2 && room.tokensBoard.length) room.pending.push({ type: 'token', seat: s });
      checkScience(room, s);
    }
  }
  function buildWonder(room, s, wi, cardId) {
    const city = room.city[s], opp = room.city[other(s)], slot = city.wonders[wi], W = WONDER(slot.w);
    pay(room, s, price(room, s, W.c, 'wonder'));
    slot.built = true; slot.card = cardId;
    if (W.co) city.coins += W.co;
    if (W.lose) opp.coins = Math.max(0, opp.coins - W.lose);
    if (W.replay || has(city, 'theo')) room.replay = true;
    if (W.destroy && opp.cards.some(i => CARD(i).t === W.destroy)) room.pending.push({ type: 'destroy', seat: s, color: W.destroy });
    if (W.library && room.tokensSpare.length) room.pending.push({ type: 'library', seat: s, options: shuffle(room.tokensSpare.slice()).slice(0, 3) });
    if (W.revive && room.discard.length) room.pending.push({ type: 'revive', seat: s });
    if (builtWonders(room.city[0]) + builtWonders(room.city[1]) >= 7) room.city.forEach(c => c.wonders.forEach(w => { if (!w.built && !w.lost) { w.lost = true; log(room, `Septième merveille bâtie. ${WONDER(w.w).n} ne le sera jamais.`); } }));
    if (W.sh) military(room, s, W.sh);
  }
  function applyToken(room, s, k) {
    const city = room.city[s]; city.tokens.push(k);
    if (k === 'agri' || k === 'urba') city.coins += 6;
    if (k === 'loi') checkScience(room, s);
    log(room, `${room.seats[s].name} prend le jeton ${DU_TOKENS.find(t => t.k === k).n}.`);
  }

  // ------------------------------------------------ tours de jeu
  function take(room, s, m) {
    if (room.phase !== 'play' || room.pending.length || room.cur !== s) return null;
    const b = room.board[m.b]; if (!b || !accessible(room, b) || !b.up) return null;
    const city = room.city[s], c = CARD(b.card), name = room.seats[s].name;
    if (m.how === 'build') {
      const pr = cardPrice(room, s, b.card); if (pr.total > city.coins) return 'Pas assez de pièces';
      b.taken = true; room.lastSeat = s;
      log(room, `${name} construit ${c.n}${pr.chain ? ' gratuitement, par enchaînement' : pr.total ? ` pour ${pr.total} pièce${pr.total > 1 ? 's' : ''}` : ''}.`);
      buildCard(room, s, b.card, false);
    } else if (m.how === 'discard') {
      b.taken = true; room.lastSeat = s;
      const gain = 2 + count(city, 'jaune'); city.coins += gain; room.discard.push(b.card);
      log(room, `${name} défausse ${c.n} et prend ${gain} pièces.`);
    } else if (m.how === 'wonder') {
      const slot = city.wonders[m.w]; if (!slot || slot.built || slot.lost) return null;
      const pr = price(room, s, WONDER(slot.w).c, 'wonder'); if (pr.total > city.coins) return 'Pas assez de pièces';
      b.taken = true; room.lastSeat = s;
      log(room, `${name} bâtit la merveille ${WONDER(slot.w).n}${pr.total ? ` pour ${pr.total} pièce${pr.total > 1 ? 's' : ''}` : ''}.`);
      buildWonder(room, s, m.w, b.card);
    } else return null;
    flip(room);
    after(room);
    return null;
  }
  function after(room) {
    if (room.winner !== null) { bump(room); return; }
    if (room.pending.length) { bump(room); return; }
    endTurn(room);
  }
  function endTurn(room) {
    if (room.board.every(b => b.taken)) {
      room.replay = false;
      if (room.age === 3) return finishCivil(room);
      room.chooser = room.military > 0 ? 1 : room.military < 0 ? 0 : room.lastSeat;
      room.phase = 'start'; room.cur = room.chooser;
      log(room, `Fin de l’âge ${['', 'I', 'II'][room.age]}. ${room.seats[room.chooser].name} choisit qui commence le suivant.`);
      bump(room); return;
    }
    if (room.replay) log(room, `${room.seats[room.cur].name} rejoue.`);
    else room.cur = other(room.cur);
    room.replay = false; bump(room);
  }
  function resolve(room, s, pick) {
    const p = room.pending[0]; if (!p || p.seat !== s) return null;
    const city = room.city[s], opp = room.city[other(s)];
    if (p.type === 'token') { if (!room.tokensBoard.includes(pick)) return null; room.tokensBoard.splice(room.tokensBoard.indexOf(pick), 1); room.pending.shift(); applyToken(room, s, pick); }
    else if (p.type === 'library') { if (!p.options.includes(pick)) return null; room.tokensSpare.splice(room.tokensSpare.indexOf(pick), 1); room.pending.shift(); applyToken(room, s, pick); }
    else if (p.type === 'destroy') {
      const i = +pick; if (!opp.cards.includes(i) || CARD(i).t !== p.color) return null;
      opp.cards.splice(opp.cards.indexOf(i), 1); room.discard.push(i); room.pending.shift();
      log(room, `${room.seats[s].name} détruit ${CARD(i).n} chez ${room.seats[other(s)].name}.`);
    } else if (p.type === 'revive') {
      const i = +pick; if (!room.discard.includes(i)) return null;
      room.discard.splice(room.discard.indexOf(i), 1); room.pending.shift();
      log(room, `${room.seats[s].name} relève ${CARD(i).n} de la défausse, gratuitement.`);
      buildCard(room, s, i, true);
    }
    void city;
    after(room); return null;
  }
  function startAge(room, s, who) {
    if (room.phase !== 'start' || room.chooser !== s || (who !== 0 && who !== 1)) return null;
    room.age += 1; room.phase = 'play'; room.chooser = null; deal(room); room.cur = who;
    log(room, `Âge ${['', 'I', 'II', 'III'][room.age]}. ${room.seats[who].name} commence.`);
    bump(room); return null;
  }

  // ------------------------------------------------ décompte
  function scores(room) {
    return [0, 1].map(s => {
      const city = room.city[s], sc = { bleu: 0, vert: 0, jaune: 0, violet: 0, merveilles: 0, progres: 0, pieces: 0, militaire: 0 };
      city.cards.forEach(i => { const c = CARD(i); if (c.vp) sc[c.t === 'vert' ? 'vert' : c.t === 'jaune' ? 'jaune' : 'bleu'] += c.vp; if (c.g) sc.violet += guildVP(room, c.g); });
      city.wonders.forEach(w => { if (w.built) sc.merveilles += WONDER(w.w).vp || 0; });
      city.tokens.forEach(k => { if (k === 'agri') sc.progres += 4; if (k === 'philo') sc.progres += 7; if (k === 'math') sc.progres += 3 * city.tokens.length; });
      sc.pieces = Math.floor(city.coins / 3);
      const m = s === 0 ? room.military : -room.military;
      sc.militaire = m >= 6 ? 10 : m >= 3 ? 5 : m >= 1 ? 2 : 0;
      sc.total = Object.values(sc).reduce((a, b) => a + b, 0);
      return sc;
    });
  }
  function finishCivil(room) {
    const sc = scores(room);
    room.final = sc; room.phase = 'over'; room.winType = 'civile';
    room.winner = sc[0].total !== sc[1].total ? (sc[0].total > sc[1].total ? 0 : 1) : sc[0].bleu !== sc[1].bleu ? (sc[0].bleu > sc[1].bleu ? 0 : 1) : -1;
    log(room, room.winner >= 0 ? `Fin de l’âge III. ${room.seats[room.winner].name} gagne ${sc[room.winner].total} à ${sc[other(room.winner)].total}.` : `Fin de l’âge III. Égalité parfaite, ${sc[0].total} partout.`);
    bump(room);
  }

  // ------------------------------------------------ le robot
  const WVAL = W => (W.vp || 0) + (W.replay ? 4 : 0) + (W.co || 0) / 3 + (W.lose ? 1.2 : 0) + (W.sh || 0) * 1.8 + (W.library ? 3 : 0) + (W.revive ? 2.5 : 0) + (W.destroy ? 1.5 : 0) + (W.ch ? 3 : 0);
  const mil = (room, s) => s === 0 ? room.military : -room.military;
  function cardValue(room, s, i) {
    const c = CARD(i), city = room.city[s], age = room.age;
    let v = c.vp || 0;
    if (c.p) v += c.p.length * [0, 2.4, 1.6, 0.4][age];
    if (c.ch) v += [0, 2.6, 2.2, 0.6][age];
    if (c.tr) v += c.tr.length * [0, 1.4, 1.2, 0.3][age];
    if (c.co) v += c.co * 0.35;
    if (c.per) v += c.pc * (c.per === 'merveille' ? builtWonders(city) : count(city, c.per)) * 0.35;
    if (c.ct && age < 3) v += 1;
    if (c.g) v += guildVP(room, c.g) + (c.g !== 'batisseurs' && c.g !== 'preteurs' ? guildCount(room, c.g) * 0.35 : 0);
    if (c.sh) {
      const n = c.sh + (has(city, 'strat') ? 1 : 0), me = mil(room, s);
      if (me + n >= 9) v += 100;
      v += n * (1.5 + (me <= -4 ? 1.8 : 0) + (me < 3 && me + n >= 3 ? 1 : 0) + (me < 6 && me + n >= 6 ? 1.5 : 0));
    }
    if (c.sci) {
      const m = sciSymbols(city), d = Object.keys(m).length;
      if (!m[c.sci]) { v += 2 + d * 0.7; if (d + 1 >= 6) v += 100; } else if (m[c.sci] === 1) v += room.tokensBoard.length ? 4 : 0.5;
    }
    return v;
  }
  function threat(room, s, i) {
    const o = other(s), c = CARD(i), oc = room.city[o];
    if (cardPrice(room, o, i).total > oc.coins + 2) return 0;
    if (c.sh && mil(room, o) + c.sh + (has(oc, 'strat') ? 1 : 0) >= 9) return 60;
    if (c.sci) { const m = sciSymbols(oc); if (!m[c.sci] && Object.keys(m).length + 1 >= 6) return 60; }
    return cardValue(room, o, i) > 8 ? 1.5 : 0;
  }
  function botPlay(room, s) {
    const city = room.city[s]; let best = null;
    const consider = (score, a) => { score += Math.random() * 0.9; if (!best || score > best.score) best = { score, a }; };
    const open = new Set(room.board.map((b, k) => accessible(room, b) ? k : -1));
    room.board.forEach((b, bi) => {
      if (!accessible(room, b) || !b.up) return;
      const deny = threat(room, s, b.card);
      b.taken = true;
      let danger = 0;
      room.board.forEach((o, k) => { if (!open.has(k) && accessible(room, o) && o.up) danger = Math.max(danger, threat(room, s, o.card) * 0.8); });
      b.taken = false;
      const pr = cardPrice(room, s, b.card);
      if (pr.total <= city.coins) consider(cardValue(room, s, b.card) - pr.total * 0.45 + deny - danger, { how: 'build', b: bi });
      consider((2 + count(city, 'jaune')) * 0.4 + deny - danger - 0.6 + (city.coins < 3 ? 1.5 : 0), { how: 'discard', b: bi });
      if (builtWonders(room.city[0]) + builtWonders(room.city[1]) < 7) city.wonders.forEach((w, wi) => {
        if (w.built || w.lost) return;
        const wp = price(room, s, WONDER(w.w).c, 'wonder');
        if (wp.total <= city.coins) consider(WVAL(WONDER(w.w)) - wp.total * 0.45 + deny - danger + 1, { how: 'wonder', b: bi, w: wi });
      });
    });
    return best?.a;
  }
  function tokenValue(room, s, k) {
    const city = room.city[s], unbuilt = city.wonders.filter(w => !w.built && !w.lost).length, age = room.age;
    const d = Object.keys(sciSymbols(city)).length;
    return { agri: 5.5, philo: 7, urba: age < 3 ? 5 : 2.5, strat: age < 3 ? 3.5 : 2, eco: 2.5, math: 3 * (city.tokens.length + 1), archi: unbuilt * 1.3, macon: age < 3 ? 3 : 1.5, theo: unbuilt * 1.6, loi: d >= 5 ? 90 : 3 }[k] || 1;
  }
  function botChoice(room, s) {
    const p = room.pending[0], opp = room.city[other(s)];
    const bestBy = (list, f) => list.reduce((a, b) => f(b) > f(a) ? b : a, list[0]);
    if (p.type === 'token') return bestBy(room.tokensBoard, k => tokenValue(room, s, k));
    if (p.type === 'library') return bestBy(p.options, k => tokenValue(room, s, k));
    if (p.type === 'destroy') return bestBy(opp.cards.filter(i => CARD(i).t === p.color), i => (CARD(i).p || '').length);
    if (p.type === 'revive') return bestBy(room.discard, i => cardValue(room, s, i));
    return null;
  }
  function tick(room) {
    const bs = room.seats.findIndex(x => x.bot);
    if (bs < 0 || room.phase === 'over' || Date.now() - room.turnAt < 1200) return false;
    if (room.phase === 'draft' && room.cur === bs) { const pool = room.draft.pools[room.draft.pool]; draftPick(room, bs, pool.reduce((a, b) => WVAL(WONDER(b)) > WVAL(WONDER(a)) ? b : a, pool[0])); return true; }
    if (room.phase === 'start' && room.chooser === bs) { startAge(room, bs, bs); return true; }
    if (room.phase === 'play') {
      if (room.pending.length) { if (room.pending[0].seat === bs) { resolve(room, bs, botChoice(room, bs)); return true; } return false; }
      if (room.cur === bs) { const a = botPlay(room, bs); if (a) take(room, bs, a); return true; }
    }
    return false;
  }

  // ------------------------------------------------ plomberie
  const seatOf = (room, pid) => room.seats.findIndex(x => x.id === pid);
  function act(room, pid, m) {
    const s = seatOf(room, pid); if (s < 0) return 'Tu regardes la partie';
    switch (m.t) {
      case 'du:draft': return draftPick(room, s, +m.w);
      case 'du:take': return take(room, s, { b: +m.b, how: m.how, w: +m.w });
      case 'du:choose': return resolve(room, s, m.pick);
      case 'du:start': return startAge(room, s, +m.who);
    }
    return null;
  }
  function join(room, id, name) { const s = seatOf(room, id); if (s >= 0) { room.seats[s].online = true; room.seats[s].name = name || room.seats[s].name; } }
  function setOnline(room, id, on) { const s = seatOf(room, id); if (s >= 0) room.seats[s].online = on; }

  function view(room, pid) {
    const s = seatOf(room, pid), sc = room.final || scores(room);
    const myTurn = room.phase === 'play' && !room.pending.length && room.cur === s;
    const p = room.pending[0];
    return {
      phase: room.phase, age: room.age, mySeat: s, cur: room.cur, isHost: pid === room.hostId, seq: room.seq, myTurn,
      seats: room.seats.map(x => ({ name: x.name, bot: x.bot, online: x.online })),
      cities: room.city.map((c, k) => ({
        coins: c.coins, cards: c.cards, tokens: c.tokens, prod: fixedProd(c), choices: choices(c), trade: [...tradeSet(c)], chains: [...chains(c)],
        sci: sciSymbols(c), vp: sc[k].total, wonders: c.wonders.map(w => ({ w: w.w, built: w.built, lost: w.lost })),
      })),
      board: room.board.map((b, bi) => {
        const acc = accessible(room, b), mine = myTurn && acc && b.up;
        return { bi, r: b.r, x: b.x, taken: b.taken, up: b.up, card: b.up ? b.card : null, back: b.up ? null : (CARD(b.card).a === 4 ? 'G' : room.age), acc, price: mine ? cardPrice(room, s, b.card) : null };
      }),
      wonderPrices: s >= 0 ? room.city[s].wonders.map(w => w.built || w.lost ? null : price(room, s, WONDER(w.w).c, 'wonder')) : null,
      wondersLeft: 7 - builtWonders(room.city[0]) - builtWonders(room.city[1]),
      discardGain: s >= 0 ? 2 + count(room.city[s], 'jaune') : 0,
      military: room.military, milTok: room.milTok, tokensBoard: room.tokensBoard, discard: room.discard,
      pending: p ? { type: p.type, mine: p.seat === s, who: room.seats[p.seat].name, color: p.color, options: p.options, targets: p.type === 'destroy' ? room.city[other(p.seat)].cards.filter(i => CARD(i).t === p.color) : null } : null,
      draft: room.phase === 'draft' ? { pool: room.draft.pools[room.draft.pool], picker: room.cur } : null,
      chooser: room.chooser, winner: room.winner, winType: room.winType, final: room.final,
      log: room.log.slice(-5),
    };
  }
  return { create, act, tick, join, setOnline, view, scores, parse, price, cardPrice, sciSymbols, fixedProd, _test: { deal, accessible, covered, botPlay, botChoice, take, resolve, startAge, draftPick, endTurn, WVAL } };
})();

// ============================================================ écran
let duSel = null, duSelKey = null, duInfo = null;
const duCost = str => {
  const p = Duel.parse(str); let h = '';
  if (p.coins) h += `<span class="du-coin">${p.coins}</span>`;
  Object.entries(p.res).forEach(([r, n]) => { h += DU_RES[r].repeat(n); });
  return h || '<span class="du-free">gratuit</span>';
};
function duEffShort(c) {
  const out = [];
  if (c.p) out.push(c.p.split('').map(r => DU_RES[r]).join(''));
  if (c.ch) out.push(c.ch.split('').map(r => DU_RES[r]).join('/'));
  if (c.tr) out.push(c.tr.split('').map(r => DU_RES[r]).join('') + '=1');
  if (c.sci) out.push(DU_SCI[c.sci]);
  if (c.sh) out.push('⚔️'.repeat(c.sh));
  if (c.vp) out.push(`<b class="du-vp">${c.vp}</b>`);
  if (c.co) out.push(`<span class="du-coin">${c.co}</span>`);
  if (c.per) out.push(`<span class="du-coin">${c.pc}</span>/${c.per === 'merveille' ? '🏛' : `<i class="du-sq t-${c.per}"></i>`}`);
  if (c.g) out.push('👑');
  return out.join(' ');
}
function duEffLong(c) {
  const out = [];
  if (c.p) out.push(`Produit ${c.p.split('').map(r => DU_RES[r] + ' ' + DU_RES_NAME[r]).join(', ')} à chaque tour.`);
  if (c.ch) out.push(`Produit au choix ${c.ch.split('').map(r => DU_RES[r]).join(' ou ')} à chaque tour.`);
  if (c.tr) out.push(`Tu achètes ${c.tr.split('').map(r => DU_RES[r] + ' ' + DU_RES_NAME[r]).join(' et ')} à 1 pièce seulement.`);
  if (c.sci) out.push(`Symbole scientifique ${DU_SCI[c.sci]} : deux fois le même donne un jeton progrès, six différents font gagner.`);
  if (c.sh) out.push(`${c.sh} bouclier${c.sh > 1 ? 's' : ''} : le pion avance d’autant vers la capitale adverse.`);
  if (c.co) out.push(`+${c.co} pièces tout de suite.`);
  if (c.per) out.push(`+${c.pc} pièce${c.pc > 1 ? 's' : ''} par ${c.per === 'merveille' ? 'merveille bâtie' : `carte ${c.per === 'brun' ? 'marron' : c.per}`} de ta cité, tout de suite.`);
  if (c.g) out.push(DU_GUILD[c.g]);
  if (c.vp) out.push(`${c.vp} point${c.vp > 1 ? 's' : ''} de victoire.`);
  if (c.cf) out.push(`Gratuit si tu as ${DU_CHAIN[c.cf]}.`);
  if (c.ct) out.push(`Donne ${DU_CHAIN[c.ct]} : une carte d’un âge suivant sera gratuite.`);
  return out.join(' ');
}
function duWonderLong(W) {
  const out = [];
  if (W.co) out.push(`+${W.co} pièces`);
  if (W.lose) out.push(`l’adversaire perd ${W.lose} pièces`);
  if (W.sh) out.push(`${W.sh} bouclier${W.sh > 1 ? 's' : ''}`);
  if (W.destroy) out.push(`détruit une carte ${W.destroy === 'brun' ? 'marron' : 'grise'} adverse`);
  if (W.library) out.push('choisis un jeton progrès parmi 3 hors du jeu');
  if (W.revive) out.push('construis gratuitement une carte de la défausse');
  if (W.ch) out.push(`produit au choix ${W.ch.split('').map(r => DU_RES[r]).join(' ou ')}`);
  if (W.replay) out.push('tu rejoues');
  if (W.vp) out.push(`${W.vp} points`);
  const t = out.join(', ') + '.';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const duToken = k => DU_TOKENS.find(t => t.k === k);

function duCity(v, k) {
  const c = v.cities[k], seat = v.seats[k], me = k === v.mySeat, turn = v.cur === k && v.phase !== 'over';
  const d = el('div', `du-city${me ? ' mine' : ' opp'}${turn ? ' turn' : ''}`);
  const prod = Object.entries(c.prod).map(([r, n]) => `<span class="du-res${n ? '' : ' zero'}" title="${DU_RES_NAME[r]}">${DU_RES[r]}<b>${n}</b></span>`).join('');
  const extra = [...c.choices.map(ch => `<span class="du-res ch">${ch.split('').map(r => DU_RES[r]).join('/')}</span>`), ...c.trade.map(r => `<span class="du-res tr">${DU_RES[r]}=1</span>`)].join('');
  const groups = ['brun', 'gris', 'jaune', 'rouge', 'bleu', 'vert', 'violet'].map(t => c.cards.filter(i => DU_CARDS[i].t === t)
    .map(i => `<button type="button" class="du-pill t-${t}" data-info="c${i}">${esc(DU_CARDS[i].n)}</button>`).join('')).join('');
  const sci = Object.entries(c.sci).map(([s, n]) => `<span class="du-sci">${DU_SCI[s]}${n > 1 ? '×2' : ''}</span>`).join('');
  const wonders = c.wonders.map(w => { const W = DU_WONDERS[w.w]; return `<button type="button" class="du-w${w.built ? ' built' : ''}${w.lost ? ' lost' : ''}" data-info="w${w.w}"><b>${esc(W.n)}</b><span>${w.built ? 'bâtie' : w.lost ? 'perdue' : duCost(W.c)}</span></button>`; }).join('');
  const tokens = c.tokens.map(t => `<button type="button" class="du-tok small" data-info="t${t}" title="${esc(duToken(t).n)}">${duToken(t).i}</button>`).join('');
  const tag = turn ? `<span class="du-city-turn">${me ? 'à toi' : 'joue'}</span>` : '';
  d.innerHTML = `<div class="du-city-head"><span class="du-city-name">${seat.bot ? '🤖 ' : ''}${esc(seat.name)}${me ? ' <small>toi</small>' : ''}${seat.online ? '' : ' <small>hors ligne</small>'}</span>${tag}<span class="du-coins" title="pièces"><span class="du-coin">${c.coins}</span></span><span class="du-score">${c.vp} point${c.vp > 1 ? 's' : ''}</span></div>`
    + `<div class="du-city-row"><span class="du-lbl">Production</span><div class="du-prodrow">${prod}${extra}</div></div>`
    + (sci || tokens ? `<div class="du-city-row"><span class="du-lbl">Science et progrès</span><div class="du-scirow">${sci}${tokens}</div></div>` : '')
    + (wonders ? `<div class="du-city-row"><span class="du-lbl">Merveilles</span><div class="du-wonders">${wonders}</div></div>` : '')
    + (groups ? `<div class="du-city-row"><span class="du-lbl">Bâtiments</span><div class="du-pills">${groups}</div></div>` : '');
  return d;
}

function duTrack(v) {
  const flipSide = v.mySeat === 1, pos = flipSide ? -v.military : v.military;
  const left = v.seats[flipSide ? 1 : 0], right = v.seats[flipSide ? 0 : 1];
  let cells = '';
  for (let i = -9; i <= 9; i++) {
    const zone = Math.abs(i) >= 6 ? 'z3' : Math.abs(i) >= 3 ? 'z2' : Math.abs(i) >= 1 ? 'z1' : 'z0';
    // pillage : le jeton du côté droit (i > 0) frappe la cité de droite
    const seatHit = i > 0 ? (flipSide ? 0 : 1) : (flipSide ? 1 : 0);
    const tok = (Math.abs(i) === 3 || Math.abs(i) === 6) && !v.milTok[`${seatHit}-${Math.abs(i)}`] ? `<i class="du-loot">−${Math.abs(i) === 3 ? 2 : 5}</i>` : '';
    cells += `<span class="du-cell ${zone}${i === pos ? ' pawn' : ''}">${i === pos ? '<b class="du-pawn">⚔️</b>' : ''}${tok}</span>`;
  }
  return el('div', 'du-track', `<span class="du-cap l">🏰 ${esc(left.name)}</span><div class="du-cells">${cells}</div><span class="du-cap r">${esc(right.name)} 🏰</span>`);
}

function duCardTile(v, b, W) {
  const c = b.card !== null ? DU_CARDS[b.card] : null;
  const cls = ['du-card', c ? 't-' + c.t : 'back', b.acc ? 'acc' : 'cov', duSel === b.bi ? 'sel' : ''];
  if (!c) return `<button type="button" class="${cls.join(' ')} age${b.back}" data-bi="${b.bi}" disabled><span class="du-back">${b.back === 'G' ? '👑' : ['', 'I', 'II', 'III'][b.back]}</span></button>`;
  let tag = '';
  if (b.price) tag = b.price.chain ? '<span class="du-tag ok">🔗</span>' : `<span class="du-tag${b.price.total > v.cities[v.mySeat].coins ? ' no' : ''}">${b.price.total || '✓'}</span>`;
  return `<button type="button" class="${cls.join(' ')}" data-bi="${b.bi}"><span class="du-cc">${duCost(c.c).replace('<span class="du-free">gratuit</span>', '')}</span><span class="du-eff">${duEffShort(c)}</span>${W > 58 ? `<span class="du-nm">${esc(c.n)}</span>` : ''}${c.ct ? `<span class="du-ct">${DU_CHAIN[c.ct]}</span>` : ''}${tag}</button>`;
}

const DU_AGE = ['', 'I', 'II', 'III'];
const duPieces = n => `${n} pièce${n > 1 ? 's' : ''}`;

/** Ce que dit le meneur : [titre, réplique]. Les variantes suivent l'âge et le nombre de cartes prises : stables pendant un tour. */
function duVoice(v) {
  const me = v.mySeat, watch = me < 0, opp = me === 1 ? 0 : 1;
  const taken = v.board.filter(b => b.taken).length;
  const say = list => list[(v.age + taken) % list.length];
  const name = s => esc(v.seats[s]?.name || '');
  const cur = name(v.cur);
  if (v.phase === 'draft') {
    const k = v.draft.pool.length;
    if (v.draft.picker === me) return ['À toi de choisir.', ['Une merveille pour ta cité. Chacun en aura quatre.', 'Prends celle qui te fait envie. Chacun en aura quatre.'][k % 2]];
    return [`${cur} choisit.`, watch ? 'Tu regardes la partie.' : ['Croise les doigts pour ta préférée.', 'Il reste de belles merveilles. Pour l’instant.'][k % 2]];
  }
  if (v.phase === 'start') {
    const next = DU_AGE[v.age + 1];
    if (v.chooser === me) return ['Tu choisis qui commence.', v.military !== 0 ? `Ton armée traîne, alors tu décides qui ouvre l’âge ${next}.` : `Tu as pris la dernière carte, alors tu décides qui ouvre l’âge ${next}.`];
    return [`${name(v.chooser)} choisit qui commence.`, `L’âge ${next} se prépare.`];
  }
  if (v.phase === 'over') {
    const w = v.winner, f = v.final;
    if (w < 0) return ['Égalité parfaite.', `${f[0].total} points partout, et autant de bleu. Personne ne gagne.`];
    const title = w === me ? 'Tu gagnes.' : `${name(w)} gagne.`;
    const line = v.winType === 'militaire' ? 'Victoire militaire. Le pion a pris la capitale.'
      : v.winType === 'scientifique' ? 'Victoire scientifique. Six symboles, rien à ajouter.'
        : `Victoire civile, ${f[w].total} points à ${f[1 - w].total}.`;
    return [title, line];
  }
  const p = v.pending;
  if (p) {
    const color = p.color === 'brun' ? 'marron' : 'grise';
    if (p.mine) return {
      token: ['Deux symboles pareils.', 'Prends un jeton progrès.'],
      library: ['Grande Bibliothèque.', 'Un jeton parmi ces trois, tirés hors du jeu.'],
      destroy: ['Place à la démolition.', `Choisis la carte ${color} à raser chez ${name(opp)}.`],
      revive: ['Fouille la défausse.', 'La carte choisie se construit gratuitement.'],
    }[p.type];
    return [`${esc(p.who)} choisit.`, {
      token: 'Un jeton progrès à empocher.', library: 'Un jeton progrès, tiré hors du jeu.',
      destroy: watch ? `Une carte ${color} va y passer.` : `Une de tes cartes ${p.color === 'brun' ? 'marron' : 'grises'} va y passer.`, revive: 'La défausse se fait fouiller.',
    }[p.type]];
  }
  if (v.myTurn) return ['À toi.', say(['Ta cité attend ses ouvriers.', 'Choisis bien, ton rival lorgne peut-être la même carte.', 'Chaque carte que tu laisses, l’autre peut la prendre.'])];
  if (watch) return [`${cur} joue.`, 'Tu regardes la partie.'];
  return [`${cur} joue.`, say(['Touche une carte pour la lire en attendant.', 'Surveille ses pièces, et la piste militaire.', 'Prépare ta riposte.'])];
}

function renderDuel(v) {
  if (!v) return;
  const root = $('#du-main'); root.innerHTML = '';
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.mySeat, opp = me === 1 ? 0 : 1, watch = me < 0;
  const key = v.age + ':' + v.phase;
  if (key !== duSelKey) { duSelKey = key; duSel = null; }
  if (duSel !== null && (!v.board[duSel] || v.board[duSel].taken)) duSel = null;

  // ce qui se passe, dit par le meneur
  let meta = '';
  if (v.phase === 'draft') meta = 'Repêchage des merveilles';
  else if (v.phase === 'play') {
    const left = v.board.filter(b => !b.taken).length;
    meta = `Âge ${DU_AGE[v.age]} · ${left} carte${left > 1 ? 's' : ''} à prendre${v.discard.length ? ` · ${v.discard.length} à la défausse` : ''}`;
  } else if (v.phase === 'start') meta = `Fin de l’âge ${DU_AGE[v.age]}`;
  else meta = `Partie terminée${v.winType ? ` · victoire ${v.winType}` : ''}`;
  root.appendChild(el('p', 'mj-meta', meta));
  const [title, line] = duVoice(v);
  root.appendChild(el('div', 'mj-status du-status', `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`));

  root.appendChild(duCity(v, watch ? 1 : opp));
  root.appendChild(duTrack(v));
  if (v.tokensBoard.length) root.appendChild(el('div', 'du-tokens', v.tokensBoard.map(k => `<button type="button" class="du-tok" data-info="t${k}">${duToken(k).i}<small>${duToken(k).n}</small></button>`).join('')));

  // la pyramide
  if (v.phase === 'play' || v.phase === 'start') {
    const full = root.clientWidth || 360, desk = typeof DESK !== 'undefined' && DESK.matches;   // sur PC, les cités passent dans la colonne de droite
    const W0 = Math.max(280, Math.min(desk ? full - 368 : full, 720));
    const xs = v.board.map(b => b.x), minX = Math.min(...xs), maxX = Math.max(...xs), rows = Math.max(...v.board.map(b => b.r)) + 1;
    const unit = Math.min(W0 / (maxX - minX + 2), 46), W = Math.round(unit * 2 - 4), H = Math.round(W * 1.36), step = Math.round(H * 0.5);
    const pyr = el('div', 'du-pyr');
    pyr.style.width = Math.round(unit * (maxX - minX + 2)) + 'px'; pyr.style.height = ((rows - 1) * step + H) + 'px';
    pyr.style.setProperty('--w', W + 'px'); pyr.style.setProperty('--h', H + 'px');
    pyr.innerHTML = v.board.filter(b => !b.taken).map(b => duCardTile(v, b, W).replace('<button', `<button style="left:${Math.round((b.x - minX) * unit + 2)}px;top:${b.r * step}px;z-index:${b.r + 1}"`)).join('');
    pyr.onclick = e => { const t = e.target.closest('[data-bi]'); if (!t) return; const bi = +t.dataset.bi; duSel = duSel === bi ? null : bi; duInfo = null; renderDuel(view.du); };
    root.appendChild(el('div', 'du-pyr-wrap')).appendChild(pyr);
  }

  // le panneau d'action
  const sheet = el('div', 'du-sheet');
  if (v.phase === 'draft') {
    const mine = v.draft.picker === me;
    const list = el('div', 'mj-list du-wlist');
    v.draft.pool.forEach(w => {
      const W = DU_WONDERS[w];
      const b = el(mine ? 'button' : 'div', 'mj-row du-wcard', `<b>${esc(W.n)}</b><span class="du-wcost">${duCost(W.c)}</span><span class="du-wtxt">${duWonderLong(W)}</span>`);
      if (mine) { b.type = 'button'; b.onclick = () => act({ t: 'du:draft', w }); }
      list.appendChild(b);
    });
    sheet.appendChild(list);
  } else if (v.phase === 'start') {
    if (v.chooser === me) {
      const row = el('div', 'du-row'); row.append(btn('primary lg', 'Je commence', () => act({ t: 'du:start', who: me })), btn('lg', `${esc(v.seats[opp].name)} commence`, () => act({ t: 'du:start', who: opp }))); sheet.appendChild(row);
    }
  } else if (v.phase === 'play' && v.pending) {
    const p = v.pending;
    if (p.mine) {
      const list = el('div', 'mj-list du-choices');
      const opts = p.type === 'token' ? v.tokensBoard : p.type === 'library' ? p.options : p.type === 'destroy' ? p.targets : v.discard;
      opts.forEach(o => {
        let h;
        if (p.type === 'token' || p.type === 'library') { const t = duToken(o); h = `<b>${t.i} ${esc(t.n)}</b><span>${esc(t.d)}</span>`; }
        else { const c = DU_CARDS[o]; h = `<b><i class="du-sq t-${c.t}"></i> ${esc(c.n)}</b><span>${duEffLong(c)}</span>`; }
        const b = el('button', 'mj-row du-choice', h); b.type = 'button'; b.onclick = () => act({ t: 'du:choose', pick: o }); list.appendChild(b);
      });
      sheet.appendChild(list);
    }
  } else if (v.phase === 'play') {
    const b = duSel !== null ? v.board[duSel] : null;
    if (duInfo) sheet.appendChild(duInfoBox(duInfo));
    else if (b && b.card !== null) {
      const c = DU_CARDS[b.card];
      sheet.appendChild(el('div', 'du-detail', `<div class="du-dhead"><i class="du-sq t-${c.t}"></i><b>${esc(c.n)}</b><small>${DU_COLOR[c.t]} · âge ${['', 'I', 'II', 'III', 'III'][c.a]}</small></div><p>${duEffLong(c)}</p><p class="du-dcost">Coût : ${duCost(c.c)}</p>`));
      if (v.myTurn && b.acc && b.price) {
        const coins = v.cities[me].coins, pr = b.price;
        const row = el('div', 'du-actions');
        const bb = btn('primary', pr.chain ? 'Construire gratuitement, par enchaînement' : pr.total ? `Construire pour ${duPieces(pr.total)}${pr.trade ? ` (dont ${pr.trade} d’achat)` : ''}` : 'Construire gratuitement', () => act({ t: 'du:take', b: b.bi, how: 'build' }));
        bb.disabled = pr.total > coins; row.appendChild(bb);
        row.appendChild(btn('', `Défausser pour ${duPieces(v.discardGain)}`, () => act({ t: 'du:take', b: b.bi, how: 'discard' })));
        v.cities[me].wonders.forEach((w, wi) => {
          if (w.built || w.lost || v.wondersLeft <= 0) return;
          const wp = v.wonderPrices[wi], W = DU_WONDERS[w.w];
          const wb = btn('ghost wbtn', `Bâtir ${esc(W.n)} ${wp.total ? `pour ${duPieces(wp.total)}` : 'gratuitement'}`, () => act({ t: 'du:take', b: b.bi, how: 'wonder', w: wi }));
          wb.disabled = wp.total > coins; wb.title = duWonderLong(W); row.appendChild(wb);
        });
        sheet.appendChild(row);
        if (pr.total > coins) sheet.appendChild(el('p', 'note', `Il te manque ${duPieces(pr.total - coins)} pour la construire.`));
      } else if (v.myTurn && !b.acc) sheet.appendChild(el('p', 'note', 'Encore recouverte. Prends d’abord les cartes posées dessus.'));
    }
  }
  if (v.phase === 'over') {
    const f = v.final;
    const rows = [['Bâtiments bleus', 'bleu'], ['Bâtiments verts', 'vert'], ['Bâtiments jaunes', 'jaune'], ['Guildes', 'violet'], ['Merveilles', 'merveilles'], ['Jetons progrès', 'progres'], ['Pièces, 1 point pour 3', 'pieces'], ['Militaire', 'militaire'], ['Total', 'total']];
    const box = el('div', 'du-final');
    box.appendChild(el('span', 'mj-side-title', 'Décompte'));
    box.appendChild(el('div', 'mj-list', `<table class="du-table"><thead><tr><th></th><th>${esc(v.seats[0].name)}</th><th>${esc(v.seats[1].name)}</th></tr></thead><tbody>${rows.map(([l, k]) => `<tr${k === 'total' ? ' class="tot"' : ''}><td>${l}</td><td>${f[0][k]}</td><td>${f[1][k]}</td></tr>`).join('')}</tbody></table>`));
    sheet.appendChild(box);
    if (v.isHost) sheet.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
  }
  if (sheet.children.length) root.appendChild(sheet);
  root.appendChild(duCity(v, watch ? 0 : me));
  if (v.log.length) {
    const lg = el('ul', 'du-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }

  // fiches d'information : cartes des cités, merveilles, jetons
  root.querySelectorAll('[data-info]').forEach(n => n.onclick = e => { e.stopPropagation(); duInfo = duInfo === n.dataset.info ? null : n.dataset.info; if (duInfo) duSel = null; renderDuel(view.du); });
}
function duInfoBox(key) {
  const kind = key[0], id = key.slice(1);
  let h = '';
  if (kind === 'c') { const c = DU_CARDS[+id]; h = `<div class="du-dhead"><i class="du-sq t-${c.t}"></i><b>${esc(c.n)}</b><small>${DU_COLOR[c.t]}</small></div><p>${duEffLong(c)}</p>`; }
  if (kind === 'w') { const W = DU_WONDERS[+id]; h = `<div class="du-dhead"><b>${esc(W.n)}</b><small>merveille</small></div><p>${duWonderLong(W)}</p><p class="du-dcost">Coût : ${duCost(W.c)}</p>`; }
  if (kind === 't') { const t = duToken(id); h = `<div class="du-dhead"><b>${t.i} ${esc(t.n)}</b><small>jeton progrès</small></div><p>${esc(t.d)}</p>`; }
  return el('div', 'du-detail info', h + '<p class="fine">Touche à nouveau pour fermer.</p>');
}
