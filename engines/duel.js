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
