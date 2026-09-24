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

  function create({ hostId, players, rounds, stack, bots }) {
    const room = {
      hostId, round: 0, phase: 'play',
      settings: { rounds: clamp(rounds, 1, 10, 3), stack: !!stack },
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
    room.log = [`Manche ${room.round} : ${cardLabel(first)} pour commencer.`];
    room.result = null; room.phase = 'play';
    skipOfflineTurn(room);
  }

  // un joueur qui agit à son tour met fin à la fenêtre pour attraper le précédent
  function closeCatchWindow(room, pid) {
    if (room.vulnerable && room.vulnerable !== pid && currentId(room) === pid) room.vulnerable = null;
  }

  function play(room, pid, cardId, color) {
    if (room.phase !== 'play') return null;
    if (currentId(room) !== pid) return "Ce n'est pas ton tour";
    const p = pl(room, pid), idx = p.hand.findIndex(c => c.id === cardId);
    if (idx < 0) return null;
    const card = p.hand[idx];
    if (room.drew && room.drew !== cardId) return 'Tu ne peux jouer que la carte piochée, ou passer';
    if (!canPlay(room, card)) return room.pending > 0 ? `Tu dois piocher ${room.pending} cartes${room.settings.stack ? ' ou contrer' : ''}` : 'Même couleur ou même symbole';
    if (card.c === 'w' && !COLORS.includes(color)) return 'Choisis une couleur';
    closeCatchWindow(room, pid);
    p.hand.splice(idx, 1);
    room.discard.push(card); room.color = card.c === 'w' ? color : card.c; room.playSeq += 1;
    let text = `${p.name} joue ${cardLabel(card)}` + (card.c === 'w' ? `, couleur ${COLOR_NAME[color]}` : '');
    if (p.hand.length === 1 && !room.called[pid]) { room.vulnerable = pid; room.vulnerableAt = Date.now(); }

    if (p.hand.length === 0) {                          // manche gagnée : les pioches dues s'appliquent d'abord
      if (card.v === '+2' || card.v === '+4') {
        const victim = peekNext(room, 1), n = room.pending + (card.v === '+2' ? 2 : 4);
        if (victim && victim !== pid) { drawCards(room, victim, n); text += `, ${pl(room, victim).name} pioche ${n}`; }
        room.pending = 0;
      }
      room.log.push(text + ' et gagne la manche !'); trimLog(room);
      return endRound(room, pid);
    }

    if (card.v === 'skip') {
      text += `, ${pl(room, peekNext(room, 1)).name} passe son tour`; advance(room, 2);
    } else if (card.v === 'rev') {
      room.dir *= -1;
      if (activeCount(room) === 2) { text += `, ${pl(room, peekNext(room, 1)).name} passe son tour`; advance(room, 2); }
      else { text += ', le sens change'; advance(room, 1); }
    } else if (card.v === '+2' || card.v === '+4') {
      const add = card.v === '+2' ? 2 : 4;
      if (room.settings.stack) { room.pending += add; text += ` : +${room.pending} en jeu`; advance(room, 1); }
      else { const victim = peekNext(room, 1); drawCards(room, victim, add); text += `, ${pl(room, victim).name} pioche ${add} et passe son tour`; advance(room, 2); }
    } else advance(room, 1);
    room.log.push(text); trimLog(room);
    return null;
  }

  function draw(room, pid) {
    if (room.phase !== 'play') return null;
    if (currentId(room) !== pid) return "Ce n'est pas ton tour";
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
    room.log.push(`${p.name} crie « Chromo ! »`); trimLog(room);
    return null;
  }

  function catchPlayer(room, pid) {
    const v = room.vulnerable, me = pl(room, pid);
    if (room.phase !== 'play' || !v || v === pid || !me?.inRound) return null;
    room.vulnerable = null; drawCards(room, v, 2);
    room.log.push(`${me.name} attrape ${pl(room, v).name}, qui n'a pas crié « Chromo ! » : 2 cartes de pénalité`); trimLog(room);
    return null;
  }

  function hostSkip(room, pid) {
    if (pid !== room.hostId || room.phase !== 'play') return null;
    const cur = pl(room, currentId(room)); if (!cur || cur.bot) return null;
    const n = room.pending || 1; room.pending = 0; room.drew = null;
    drawCards(room, cur.id, n);
    room.log.push(`L'hôte fait passer ${cur.name}, qui pioche ${n}`); trimLog(room); advance(room, 1);
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
      phase: room.phase, round: room.round, rounds: room.settings.rounds, stack: room.settings.stack,
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

// ============================================================ écran
let chPendingWild = null, chLastSeq = -1, chLastRound = null, chTurnKey = null, chTurnSince = 0, chSkipTimer = null;
const CH_COLOR_WORD = { r: 'Rouge', y: 'Jaune', g: 'Vert', b: 'Bleu' };
const chSymbol = v => v === 'skip' ? '⊘' : v === 'rev' ? '⇄' : v === 'wild' ? '✦' : v;

function chCardHTML(c) {
  const sym = chSymbol(c.v);
  const center = c.v === 'wild' ? '<i class="ch-wheel"></i>'
    : c.v === '+4' ? '<i class="ch-wheel small"></i><b>+4</b>'
      : `<b>${sym}</b>`;
  const u = c.v === '6' || c.v === '9' ? ' u' : '';   // 6 et 9 soulignés, comme sur les vraies cartes
  return `<span class="ch-corner${u}">${sym}</span><span class="ch-oval${u}">${center}</span><span class="ch-corner bottom${u}">${sym}</span>`;
}

function renderChromo(v) {
  if (!v) return;
  const root = $('#ch-main'); root.innerHTML = '';
  if (v.round !== chLastRound) { chLastRound = v.round; chPendingWild = null; chLastSeq = -1; }
  const me = v.me, host = v.isHost;
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };

  root.appendChild(el('div', 'ch-head', `<span class="eyebrow">Manche ${v.round}/${v.rounds}${v.stack ? ' · cumul des +2 et +4' : ''}</span>`));

  const seatHTML = p => `<span class="ch-seat-name">${p.bot && v.phase === 'play' ? '🤖 ' : ''}${esc(p.name)}${p.bot && v.phase !== 'play' ? ' <small>robot</small>' : ''}</span><span class="ch-seat-count"><i class="ch-mini"></i>${p.count} carte${p.count > 1 ? 's' : ''}</span>`
    + (p.count === 1 && v.phase === 'play' ? `<span class="ch-flag${p.called ? '' : ' warn'}">${p.called ? 'Chromo !' : '1 carte'}</span>` : '');
  const seats = el('div', 'ch-players');
  if (v.phase !== 'play') v.players.forEach(p => {
    const d = el('div', 'ch-seat' + (p.id === v.currentId && v.phase === 'play' ? ' now' : '') + (p.online ? '' : ' off') + (p.id === net.me ? ' me' : ''));
    d.innerHTML = `<span class="ch-seat-name">${esc(p.name)}${p.bot ? ' <small>robot</small>' : ''}</span><span class="ch-seat-count"><i class="ch-mini"></i>${p.count} carte${p.count > 1 ? 's' : ''}</span>`
      + (p.count === 1 && v.phase === 'play' ? `<span class="ch-flag${p.called ? '' : ' warn'}">${p.called ? 'Chromo !' : '1 carte'}</span>` : '');
    seats.appendChild(d);
  });
  if (seats.children.length) root.appendChild(seats);

  if (v.phase === 'play') {
    const cur = v.players.find(p => p.id === v.currentId);
    const table = el('div', 'ch-table col-' + v.color);
    const pile = el('button', 'ch-card ch-back big' + (v.myTurn && !v.drewId ? ' can' : ''), '<span class="ch-oval"><b>Chromo</b></span>');
    pile.type = 'button'; pile.title = 'Piocher';
    pile.onclick = () => { if (v.myTurn && !v.drewId) act({ t: 'ch:draw' }); };
    const topEl = el('div', 'ch-card big col-' + v.top.c + (v.playSeq !== chLastSeq ? ' pop' : ''), chCardHTML(v.top));
    chLastSeq = v.playSeq;
    table.append(pile, topEl);
    table.appendChild(el('div', 'ch-color', `<i class="ch-dot col-${v.color}"></i>${CH_COLOR_WORD[v.color]}${v.pending ? ` <b class="ch-pending">+${v.pending}</b>` : ''}`));
    // la table : les joueurs assis dans l'ordre du jeu, toi en bas, la flèche montre le sens
    const ring = el('div', 'ch-ring n' + Math.min(v.players.length, 10));
    const n = v.players.length, meIdx = Math.max(0, v.players.findIndex(p => p.id === net.me));
    v.players.forEach((p, i) => {
      const k = (i - meIdx + n) % n, ang = Math.PI / 2 + k * 2 * Math.PI / n;       // 90° = en bas, puis sens horaire
      const d = el('div', 'ch-seat ring' + (p.id === v.currentId ? ' now' : '') + (p.online ? '' : ' off') + (p.id === net.me ? ' me' : ''), seatHTML(p));
      d.style.left = Math.min(84, Math.max(16, 50 + 40 * Math.cos(ang))).toFixed(2) + '%';
      d.style.top = (50 + 43 * Math.sin(ang)).toFixed(2) + '%';
      ring.appendChild(d);
    });
    const felt = el('div', 'ch-felt');
    felt.appendChild(el('span', 'ch-felt-dir' + (v.dir === 1 ? '' : ' rev'), v.dir === 1 ? '↻' : '↺'));
    felt.appendChild(table);
    ring.appendChild(felt);
    root.appendChild(ring);

    root.appendChild(el('p', 'ch-status' + (v.myTurn ? ' mine' : ''),
      v.myTurn ? (v.pending ? `À toi : pioche ${v.pending}${v.stack ? ' ou contre' : ''}` : v.drewId ? 'Joue la carte piochée ou passe' : 'À toi de jouer')
        : `${esc(cur?.name || '')} joue…`));

    const acts = el('div', 'ch-actions');
    if (v.vulnerable && v.vulnerable.id !== net.me && me.inRound) acts.appendChild(btn('danger', `Attraper ${esc(v.vulnerable.name)} !`, () => act({ t: 'ch:catch' })));
    if (me.inRound && me.hand.length <= 2 && !me.called) acts.appendChild(btn('primary', 'Chromo !', () => act({ t: 'ch:call' })));
    if (v.myTurn && !v.drewId) acts.appendChild(btn('', v.pending ? `Piocher ${v.pending}` : 'Piocher', () => act({ t: 'ch:draw' })));
    if (v.myTurn && v.drewId) acts.appendChild(btn('', 'Garder et passer', () => act({ t: 'ch:pass' })));
    // l'hôte peut débloquer un joueur absent, mais seulement s'il ne joue pas depuis 20 secondes
    const turnKey = `${v.round}|${v.currentId}|${v.playSeq}|${v.log.length}|${v.drewId}`;
    if (turnKey !== chTurnKey) { chTurnKey = turnKey; chTurnSince = Date.now(); clearTimeout(chSkipTimer); if (host) chSkipTimer = setTimeout(() => { if (view?.chromo) renderChromo(view.chromo); }, 20500); }
    if (host && !v.myTurn && cur && !cur.bot && Date.now() - chTurnSince > 20000) acts.appendChild(btn('ghost small', `${esc(cur.name)} ne joue pas ? Passer son tour`, () => act({ t: 'ch:skip' })));
    if (acts.children.length) root.appendChild(acts);

    if (me.inRound) {
      root.appendChild(el('p', 'fine ch-hand-title', `Ta main · ${me.hand.length} carte${me.hand.length > 1 ? 's' : ''}`));
      const hand = el('div', 'ch-hand');
      me.hand.forEach(c => {
        const ok = v.myTurn && me.playable.includes(c.id);
        const b = el('button', `ch-card col-${c.c}` + (v.myTurn ? (ok ? ' ok' : ' no') : '') + (c.id === v.drewId ? ' drawn' : ''), chCardHTML(c));
        b.type = 'button';
        b.onclick = () => {
          if (!v.myTurn) { toast("Ce n'est pas ton tour"); return; }
          if (!ok) { toast(v.pending ? `Pioche ${v.pending} cartes${v.stack ? ' ou contre avec un +2 ou un +4' : ''}` : 'Même couleur ou même symbole'); return; }
          if (c.c === 'w') { chPendingWild = c.id; renderChromo(view.chromo); return; }
          act({ t: 'ch:play', card: c.id });
        };
        hand.appendChild(b);
      });
      root.appendChild(hand);
    } else root.appendChild(el('p', 'note', 'Une manche est en cours : tu entres à la suivante.'));

    const log = el('ul', 'ch-log');
    v.log.slice().reverse().forEach(t => log.appendChild(el('li', '', esc(t))));
    root.appendChild(log);

    if (chPendingWild && v.myTurn && me.hand.some(c => c.id === chPendingWild)) {
      const sheet = el('div', 'ch-picker', '<p class="ch-picker-title">Quelle couleur ?</p>');
      const row = el('div', 'ch-picker-row');
      Chromo.COLORS.forEach(k => {
        const s = el('button', 'ch-swatch col-' + k, CH_COLOR_WORD[k]); s.type = 'button';
        s.onclick = () => { const id = chPendingWild; chPendingWild = null; act({ t: 'ch:play', card: id, color: k }); };
        row.appendChild(s);
      });
      sheet.appendChild(row);
      sheet.appendChild(btn('ghost small', 'Annuler', () => { chPendingWild = null; renderChromo(view.chromo); }));
      root.appendChild(sheet);
    } else chPendingWild = null;
  }

  if (v.phase === 'result' || v.phase === 'over') {
    const r = v.result;
    if (r) {
      root.appendChild(el('div', 'ch-verdict', `<span class="eyebrow">Fin de la manche ${v.round}</span><p class="ch-big">${esc(r.winnerName)} gagne</p><p class="fine">+${r.points} points : la valeur des cartes restées chez les autres</p>`));
      const list = el('div', 'ch-hands');
      r.hands.filter(h => h.id !== r.winnerId).sort((a, b) => b.points - a.points).forEach(h => {
        const row = el('div', 'ch-hand-row', `<div class="ch-hand-row-head"><b>${esc(h.name)}</b><span>${h.points} pts</span></div>`);
        const mini = el('div', 'ch-hand mini');
        h.cards.forEach(c => mini.appendChild(el('div', 'ch-card col-' + c.c, chCardHTML(c))));
        row.appendChild(mini); list.appendChild(row);
      });
      root.appendChild(list);
    }
    root.appendChild(el('div', 'ch-scores', `<span class="eyebrow">${v.phase === 'over' ? 'Classement final' : 'Scores'}</span>`
      + v.scores.map((s, i) => `<span class="${i === 0 && v.phase === 'over' ? 'lead' : ''}">${esc(s.name)} <b>${s.score}</b></span>`).join('')));
    if (host) root.appendChild(v.phase === 'over'
      ? btn('primary lg', 'Retour au salon', () => act({ t: 'restart' }))
      : btn('primary lg', v.round >= v.rounds ? 'Voir le classement' : 'Manche suivante', () => act({ t: 'ch:next' })));
    else root.appendChild(el('p', 'note', "L'hôte lance la suite."));
  }
}
