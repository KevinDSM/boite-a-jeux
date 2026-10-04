/* Kems — le jeu du carré et des signaux, à quatre, en deux équipes.

   52 cartes classiques. Chacun a quatre cartes en main, quatre sont posées au milieu. Pas de tour
   de jeu : tout le monde échange en même temps une carte de sa main contre une du milieu, l'hôte
   arbitre (le premier arrivé prend la carte). Quand les quatre ont passé, le milieu est renouvelé.
   Le but est d'avoir un carré et de le faire savoir à son partenaire par un signal convenu, hors
   de l'application ; le partenaire crie « Kems ! ». Un adversaire qui flaire le carré crie
   « Contre-Kems ! ». Même modèle que Chromo : la salle vit chez l'hôte (net.game.kems), chaque
   joueur ne reçoit que SA main, les actions arrivent en messages « km:… ». Les robots jouent dans
   le tick de l'hôte et servent à tester ou à compléter une table.
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, net et view. */

'use strict';

const Kems = (() => {
  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
  const RANK_WORD = { A: 'as', V: 'valets', D: 'dames', R: 'rois' };
  const TEAMS = [{ name: 'Cœurs', sym: '♥' }, { name: 'Piques', sym: '♠' }];
  const BOT_NAMES = ['Robot Trèfle', 'Robot Carreau', 'Robot Pique', 'Robot Cœur'];
  const BOT_THINK = [900, 1900];        // délai entre deux gestes d'un robot
  const BOT_SIGNAL = [2500, 5500];      // délai avant que le signal d'un robot ne soit « visible » de son partenaire
  const BOT_NOTICE = [4000, 9000];      // délai avant qu'un robot ne remarque le carré de son partenaire humain
  const BOT_SNIFF = 7500;               // un carré tenu trop longtemps finit par se voir : le robot contre
  const between = ([a, b]) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

  function buildDeck() {
    const d = []; let n = 0;
    SUITS.forEach(s => RANKS.forEach(r => d.push({ id: 'c' + n++, r, s })));
    return shuffle(d);
  }
  const rankWord = r => RANK_WORD[r] || r;
  const ofRank = r => r === 'A' ? 'd’as' : 'de ' + rankWord(r);          // « un carré d’as », « un carré de rois »
  const hasCarre = hand => hand.length === 4 && hand.every(c => c.r === hand[0].r);

  const pl = (room, id) => room.players.find(p => p.id === id);
  const seated = room => room.order.map(id => pl(room, id));
  const partnerOf = (room, p) => seated(room).find(q => q.team === p.team && q.id !== p.id);
  const trimLog = room => { if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };
  const log = (room, t) => { room.log.push(t); trimLog(room); };

  /** Répartit les joueurs en ligne selon le choix de l'hôte : { 0: [...], 1: [...], extra: [...] }.
      Ceux sans équipe rejoignent celle qui a de la place. Au-delà de deux par équipe : spectateurs. */
  function split(players, pick = {}) {
    const t = { 0: [], 1: [], extra: [] };
    players.forEach(p => { const k = pick[p.id]; if (k === 0 || k === 1) (t[k].length < 2 ? t[k] : t.extra).push(p); else t.extra.push(p); });
    const free = t.extra.splice(0);
    free.forEach(p => { const k = t[0].length <= t[1].length ? 0 : 1; if (t[k].length < 2) t[k].push(p); else if (t[1 - k].length < 2) t[1 - k].push(p); else t.extra.push(p); });
    return t;
  }

  function create({ hostId, players, target, teams, bots }) {
    const room = {
      hostId, phase: 'play', deal: 0, target: clamp(target, 1, 20, 5),
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: false, team: null, hand: [], pass: false })),
      order: [], draw: [], discard: [], table: [], seq: 0, log: [], scores: [0, 0], result: null,
      lastMoveAt: Date.now(), signals: {}, carreSince: {}, bots: {},
    };
    const t = split(room.players.filter(p => p.online), teams || {});
    t[0].forEach(p => p.team = 0); t[1].forEach(p => p.team = 1);
    if (bots) {
      let b = 0;
      [0, 1].forEach(k => { while (t[k].length < 2) { const bot = { id: 'bot' + b, name: BOT_NAMES[b++], online: true, bot: true, team: k, hand: [], pass: false }; room.players.push(bot); t[k].push(bot); } });
    }
    // assis en croix : partenaires face à face
    room.order = [t[0][0], t[1][0], t[0][1], t[1][1]].filter(Boolean).map(p => p.id);
    dealCards(room);
    return room;
  }

  function takeCard(room) {
    if (!room.draw.length) { room.draw = shuffle(room.discard); room.discard = []; }
    return room.draw.pop();
  }
  function dealCards(room) {
    room.deal += 1;
    room.draw = buildDeck(); room.discard = []; room.table = [];
    seated(room).forEach(p => { p.hand = []; p.pass = false; });
    for (let k = 0; k < 4; k++) seated(room).forEach(p => p.hand.push(takeCard(room)));
    for (let k = 0; k < 4; k++) room.table.push(takeCard(room));
    room.seq += 1; room.result = null; room.phase = 'play'; room.lastMoveAt = Date.now();
    room.signals = {}; room.carreSince = {}; room.bots = {}; room.log = [];
    log(room, `Donne ${room.deal}. Quatre cartes chacun, quatre au milieu.`);
  }

  function refresh(room, why) {
    room.discard.push(...room.table); room.table = [];
    for (let k = 0; k < 4; k++) room.table.push(takeCard(room));
    seated(room).forEach(p => p.pass = false);
    room.seq += 1; room.lastMoveAt = Date.now();
    log(room, why || 'Quatre nouvelles cartes au milieu.');
  }

  function swap(room, pid, handId, tableId) {
    if (room.phase !== 'play') return null;
    const p = pl(room, pid); if (!p || p.team === null) return null;
    const hi = p.hand.findIndex(c => c.id === handId), ti = room.table.findIndex(c => c.id === tableId);
    if (hi < 0) return null;
    if (ti < 0) return 'Trop tard, quelqu’un l’a prise avant toi';
    const mine = p.hand[hi], theirs = room.table[ti];
    p.hand[hi] = theirs; room.table[ti] = mine;                  // la carte prise garde la place de celle donnée
    seated(room).forEach(q => q.pass = false);                  // le milieu a changé : chacun revoit son avis
    room.seq += 1; room.lastMoveAt = Date.now();
    log(room, `${p.name} prend une carte.`);
    return null;
  }

  function pass(room, pid) {
    if (room.phase !== 'play') return null;
    const p = pl(room, pid); if (!p || p.team === null) return null;
    p.pass = !p.pass;
    const live = seated(room).filter(q => q.online);
    if (live.length && live.every(q => q.pass)) refresh(room, 'Personne ne veut rien. Quatre nouvelles cartes au milieu.');
    return null;
  }

  function hostRefresh(room, pid) {
    if (pid !== room.hostId || room.phase !== 'play') return null;
    refresh(room, 'L’hôte renouvelle le milieu.');
    return null;
  }

  function endDeal(room, r) {
    const hands = seated(room).map(p => ({ id: p.id, name: p.name, team: p.team, cards: p.hand.slice(), carre: hasCarre(p.hand) }));
    room.scores[r.winnerTeam] += r.points;
    room.result = { ...r, hands, scores: room.scores.slice() };
    room.phase = 'result';
    log(room, r.text);
    return null;
  }

  function kems(room, pid) {
    if (room.phase !== 'play') return null;
    const p = pl(room, pid); if (!p || p.team === null) return null;
    const mate = partnerOf(room, p); if (!mate) return null;
    const ok = hasCarre(mate.hand), double = ok && hasCarre(p.hand);
    const base = { kind: 'kems', callerId: pid, callerName: p.name, callerTeam: p.team, mateName: mate.name, ok, double };
    if (ok) return endDeal(room, { ...base, winnerTeam: p.team, points: double ? 2 : 1, text: `${p.name} crie « Kems ! » et ${mate.name} a bien un carré ${ofRank(mate.hand[0].r)}${double ? `. ${p.name} aussi, double Kems` : ''}.` });
    return endDeal(room, { ...base, winnerTeam: 1 - p.team, points: 1, text: `${p.name} crie « Kems ! » mais ${mate.name} n’a pas de carré.` });
  }

  function contre(room, pid) {
    if (room.phase !== 'play') return null;
    const p = pl(room, pid); if (!p || p.team === null) return null;
    const hit = seated(room).find(q => q.team !== p.team && hasCarre(q.hand));
    const base = { kind: 'contre', callerId: pid, callerName: p.name, callerTeam: p.team, ok: !!hit, double: false };
    if (hit) return endDeal(room, { ...base, winnerTeam: p.team, points: 1, text: `${p.name} crie « Contre-Kems ! » et ${hit.name} avait bien un carré ${ofRank(hit.hand[0].r)}.` });
    return endDeal(room, { ...base, winnerTeam: 1 - p.team, points: 1, text: `${p.name} crie « Contre-Kems ! » mais personne en face n’a de carré.` });
  }

  function next(room, pid) {
    if (pid !== room.hostId || room.phase !== 'result') return null;
    if (Math.max(...room.scores) >= room.target) { room.phase = 'over'; return null; }
    dealCards(room);
    return null;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'km:swap': return swap(room, pid, m.hand, m.table);
      case 'km:pass': return pass(room, pid);
      case 'km:refresh': return hostRefresh(room, pid);
      case 'km:kems': return kems(room, pid);
      case 'km:contre': return contre(room, pid);
      case 'km:next': return next(room, pid);
    }
    return null;
  }

  // ------------------------------------------------------------ robots
  function botSwap(room, bot) {
    const counts = {}; bot.hand.forEach(c => counts[c.r] = (counts[c.r] || 0) + 1);
    // la carte du milieu qui renforce le mieux la main, contre la carte la moins utile
    let best = null, bestGain = 0;
    room.table.forEach(t => { const g = counts[t.r] || 0; if (g > bestGain) { bestGain = g; best = t; } });
    if (!best) return false;
    const give = bot.hand.filter(c => c.r !== best.r).sort((a, b) => counts[a.r] - counts[b.r])[0];
    if (!give || counts[give.r] > bestGain) return false;
    return swap(room, bot.id, give.id, best.id) === null;
  }

  function tick(room) {
    if (room.phase !== 'play') return false;
    const now = Date.now(); let changed = false;
    const all = seated(room);
    all.forEach(p => { if (hasCarre(p.hand)) { if (!room.carreSince[p.id]) room.carreSince[p.id] = now; } else { delete room.carreSince[p.id]; delete room.signals[p.id]; } });

    for (const bot of all) {
      if (!bot.bot) continue;
      const st = room.bots[bot.id] || (room.bots[bot.id] = { nextAt: now + between(BOT_THINK), noticeAt: 0, seq: -1 });
      const mate = partnerOf(room, bot);
      // 1. un robot avec un carré fait son signal après un moment ; son partenaire le « voit »
      if (hasCarre(bot.hand) && !room.signals[bot.id]) { room.signals[bot.id] = { at: now + between(BOT_SIGNAL), shown: false }; }
      // 2. il crie Kems quand il a repéré le signal ou remarqué le carré de son partenaire humain
      if (mate && hasCarre(mate.hand)) {
        if (mate.bot) { const sg = room.signals[mate.id]; if (sg && now >= sg.at + 800) { kems(room, bot.id); return true; } }
        else { if (!st.noticeAt) st.noticeAt = now + between(BOT_NOTICE); if (now >= st.noticeAt) { kems(room, bot.id); return true; } }
      } else st.noticeAt = 0;
      // 3. un carré adverse tenu trop longtemps se remarque
      const leak = all.find(q => q.team !== bot.team && room.carreSince[q.id] && now - room.carreSince[q.id] > BOT_SNIFF);
      if (leak && Math.random() < 0.35) { contre(room, bot.id); return true; }
      if (now < st.nextAt) continue;
      st.nextAt = now + between(BOT_THINK);
      if (hasCarre(bot.hand)) continue;                        // il attend son partenaire, sans bouger
      if (botSwap(room, bot)) { changed = true; continue; }
      if (!bot.pass && st.seq !== room.seq) { st.seq = room.seq; pass(room, bot.id); changed = true; }
    }
    // le signal d'un robot devient visible de son partenaire : on prévient une fois
    Object.values(room.signals).forEach(sg => { if (!sg.shown && now >= sg.at) { sg.shown = true; changed = true; } });
    return changed;
  }

  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, bot: false, team: null, hand: [], pass: false });   // spectateur jusqu'à la prochaine partie
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p || p.bot) return;
    p.online = on;
    if (!on && room.phase === 'play') { const live = seated(room).filter(q => q.online); if (live.length && live.every(q => q.pass)) refresh(room, 'Personne ne veut rien. Quatre nouvelles cartes au milieu.'); }
  }

  /** Vue d'un joueur : sa main à lui, jamais celles des autres tant que la donne n'est pas finie. */
  function view(room, pid) {
    const me = pl(room, pid), mate = me && me.team !== null ? partnerOf(room, me) : null;
    const sg = mate ? room.signals[mate.id] : null;
    const live = seated(room).filter(q => q.online);
    return {
      phase: room.phase, deal: room.deal, target: room.target, seq: room.seq, isHost: pid === room.hostId,
      teams: TEAMS.map((t, k) => ({ ...t, score: room.scores[k], names: seated(room).filter(q => q.team === k).map(q => q.name) })),
      me: me && me.team !== null
        ? { seated: true, team: me.team, hand: me.hand, carre: hasCarre(me.hand), pass: me.pass, mateId: mate?.id, mateName: mate?.name, mateBot: !!mate?.bot, signal: !!(sg && sg.shown) }
        : { seated: false, hand: [] },
      seats: room.order.map(id => { const q = pl(room, id); return { id, name: q.name, bot: q.bot, online: q.online, team: q.team, pass: q.pass, me: id === pid, mate: !!me && me.team === q.team && id !== pid }; }),
      table: room.table, passCount: live.filter(q => q.pass).length, liveCount: live.length,
      quiet: Date.now() - room.lastMoveAt,
      waiting: room.players.filter(p => p.team === null && p.online).map(p => p.name),
      log: room.log.slice(-4), result: room.result,
    };
  }

  return { TEAMS, RANKS, SUITS, buildDeck, hasCarre, rankWord, ofRank, split, create, act, tick, join, setOnline, view };
})();
