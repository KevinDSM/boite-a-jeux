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
    log(room, `Donne ${room.deal} : quatre cartes chacun, quatre au milieu.`);
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
    if (ti < 0) return 'Trop tard : quelqu’un a déjà pris cette carte';
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
    if (live.length && live.every(q => q.pass)) refresh(room, 'Personne ne veut rien : quatre nouvelles cartes.');
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
    if (ok) return endDeal(room, { ...base, winnerTeam: p.team, points: double ? 2 : 1, text: `${p.name} crie « Kems ! » : ${mate.name} a bien un carré de ${rankWord(mate.hand[0].r)}${double ? `, et ${p.name} aussi : double Kems` : ''}.` });
    return endDeal(room, { ...base, winnerTeam: 1 - p.team, points: 1, text: `${p.name} crie « Kems ! » mais ${mate.name} n’a pas de carré.` });
  }

  function contre(room, pid) {
    if (room.phase !== 'play') return null;
    const p = pl(room, pid); if (!p || p.team === null) return null;
    const hit = seated(room).find(q => q.team !== p.team && hasCarre(q.hand));
    const base = { kind: 'contre', callerId: pid, callerName: p.name, callerTeam: p.team, ok: !!hit, double: false };
    if (hit) return endDeal(room, { ...base, winnerTeam: p.team, points: 1, text: `${p.name} crie « Contre-Kems ! » : ${hit.name} avait un carré de ${rankWord(hit.hand[0].r)}.` });
    return endDeal(room, { ...base, winnerTeam: 1 - p.team, points: 1, text: `${p.name} crie « Contre-Kems ! » mais personne en face n’a de carré.` });
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
    if (!on && room.phase === 'play') { const live = seated(room).filter(q => q.online); if (live.length && live.every(q => q.pass)) refresh(room, 'Personne ne veut rien : quatre nouvelles cartes.'); }
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

  return { TEAMS, RANKS, SUITS, buildDeck, hasCarre, split, create, act, tick, join, setOnline, view };
})();

// ============================================================ écran
let kmSel = null, kmSelTable = null, kmLastSeq = -1, kmLastDeal = null, kmArm = null, kmArmTimer = null, kmQuietTimer = null, kmTeamsKey = null;
const kmTeamPick = {};                     // choix des équipes par l'hôte dans le salon, par identifiant de joueur
const KM_SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };

function kmCardHTML(c) {
  const red = c.s === 'H' || c.s === 'D';
  return `<span class="km-corner${red ? ' red' : ''}"><b>${c.r}</b><i>${KM_SUIT[c.s]}</i></span><span class="km-pip${red ? ' red' : ''}">${KM_SUIT[c.s]}</span><span class="km-corner bottom${red ? ' red' : ''}"><b>${c.r}</b><i>${KM_SUIT[c.s]}</i></span>`;
}

/** Options du salon : l'hôte range chaque joueur dans une équipe, ou tire au sort. */
function renderKemsOpts(s) {
  const box = $('#opt-km-teams'); if (!box) return;
  const online = s.players.filter(p => p.online);
  const key = online.map(p => p.id + ':' + p.name).join('|') + '#' + online.map(p => kmTeamPick[p.id] ?? '-').join('');
  if (key === kmTeamsKey) return;
  kmTeamsKey = key; box.innerHTML = '';
  online.forEach(p => {
    const row = el('div', 'km-pickrow', `<span class="km-pickname">${esc(p.name)}</span>`);
    const seg = el('div', 'km-seg');
    Kems.TEAMS.forEach((t, k) => {
      const b = el('button', 'km-segbtn t' + k + (kmTeamPick[p.id] === k ? ' on' : ''), `${t.sym} ${t.name}`); b.type = 'button';
      b.onclick = () => { kmTeamPick[p.id] = kmTeamPick[p.id] === k ? undefined : k; renderKemsOpts(view); };
      seg.appendChild(b);
    });
    row.appendChild(seg); box.appendChild(row);
  });
  const t = Kems.split(online, kmTeamPick);
  const line = el('p', 'fine km-pickline',
    Kems.TEAMS.map((tm, k) => `<b class="t${k}">${tm.sym} ${esc(tm.name)}</b> : ${t[k].map(p => esc(p.name)).join(', ') || '—'}`).join(' · ')
    + (t.extra.length ? `<br>Regardent : ${t.extra.map(p => esc(p.name)).join(', ')}` : ''));
  box.appendChild(line);
  const rnd = el('button', 'btn ghost small', 'Tirer les équipes au sort'); rnd.type = 'button';
  rnd.onclick = () => { const ids = shuffle(online.map(p => p.id)); ids.forEach((id, i) => kmTeamPick[id] = i < 2 ? 0 : i < 4 ? 1 : undefined); renderKemsOpts(view); };
  box.appendChild(rnd);
}

function renderKems(v) {
  if (!v) return;
  const root = $('#km-main'); root.innerHTML = '';
  if (v.deal !== kmLastDeal) { kmLastDeal = v.deal; kmSel = null; kmSelTable = null; kmArm = null; kmLastSeq = -1; }
  const me = v.me, host = v.isHost;
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const teamTag = k => `<b class="km-team t${k}">${Kems.TEAMS[k].sym} ${esc(Kems.TEAMS[k].name)}</b>`;

  // tableau des scores, toujours visible
  const score = el('div', 'km-score');
  score.innerHTML = v.teams.map((t, k) => `<div class="km-score-team t${k}${me.seated && me.team === k ? ' mine' : ''}"><span class="km-score-name">${t.sym} ${esc(t.name)}</span><span class="km-score-pts">${t.score}</span><span class="km-score-who">${t.names.map(esc).join(' & ')}</span></div>`).join(`<span class="km-score-mid">${v.target}<small>pts</small></span>`);
  root.appendChild(score);

  if (v.phase === 'play') {
    // la table : les quatre partenaires, puis les quatre cartes du milieu
    // deux rangées, partenaires en diagonale : comme autour d'une vraie table
    const seats = el('div', 'km-seats');
    [v.seats[0], v.seats[1], v.seats[3], v.seats[2]].filter(Boolean).forEach(q => {
      const d = el('div', `km-seat t${q.team}${q.me ? ' me' : ''}${q.mate ? ' mate' : ''}${q.online ? '' : ' off'}${q.pass ? ' pass' : ''}`);
      d.innerHTML = `<span class="km-seat-name">${esc(q.name)}</span><span class="km-seat-sub">${q.me ? 'toi' : q.mate ? 'ton partenaire' : 'adversaire'}${q.bot ? ' · robot' : ''}</span>` + (q.pass ? '<span class="km-seat-pass">passe</span>' : '');
      seats.appendChild(d);
    });
    root.appendChild(seats);

    const table = el('div', 'km-table');
    v.table.forEach(c => {
      const b = el('button', 'km-card' + (kmSelTable === c.id ? ' sel' : '') + (kmSel ? ' can' : '') + (v.seq !== kmLastSeq ? ' pop' : ''), kmCardHTML(c));
      b.type = 'button';
      b.onclick = () => {
        if (!me.seated) { toast('Tu regardes cette partie : tu joueras à la prochaine'); return; }
        if (kmSel) { const h = kmSel; kmSel = null; act({ t: 'km:swap', hand: h, table: c.id }); return; }
        kmSelTable = kmSelTable === c.id ? null : c.id; renderKems(view.kems);
      };
      table.appendChild(b);
    });
    kmLastSeq = v.seq;
    root.appendChild(table);

    if (me.seated) {
      root.appendChild(el('p', 'km-status', kmSel || kmSelTable
        ? (kmSel ? 'Touche la carte du milieu que tu veux' : 'Touche la carte de ta main que tu donnes')
        : me.carre ? 'Tu as un carré : fais ton signal…' : 'Touche une carte de ta main, puis une du milieu'));

      const hand = el('div', 'km-hand' + (me.carre ? ' carre' : ''));
      me.hand.forEach(c => {
        const b = el('button', 'km-card' + (kmSel === c.id ? ' sel' : '') + (kmSelTable ? ' can' : ''), kmCardHTML(c));
        b.type = 'button';
        b.onclick = () => {
          if (kmSelTable) { const t = kmSelTable; kmSelTable = null; act({ t: 'km:swap', hand: c.id, table: t }); return; }
          kmSel = kmSel === c.id ? null : c.id; renderKems(view.kems);
        };
        hand.appendChild(b);
      });
      root.appendChild(hand);

      if (me.signal) root.appendChild(el('p', 'km-signal', `${esc(me.mateName)} te fait un signe…`));

      // Kems et Contre-Kems : un premier toucher arme le bouton, un second confirme (une erreur coûte un point)
      const calls = el('div', 'km-calls');
      const armBtn = (key, cls, label, armed, m) => {
        const b = btn(cls + (kmArm === key ? ' armed' : ''), kmArm === key ? armed : label, () => {
          if (kmArm === key) { kmArm = null; clearTimeout(kmArmTimer); act(m); return; }
          kmArm = key; clearTimeout(kmArmTimer); kmArmTimer = setTimeout(() => { kmArm = null; if (view?.kems) renderKems(view.kems); }, 2500);
          renderKems(view.kems);
        });
        return b;
      };
      calls.appendChild(armBtn('kems', 'primary lg km-kems', 'Kems !', `Sûr ? ${esc(me.mateName)} a un carré`, { t: 'km:kems' }));
      calls.appendChild(armBtn('contre', 'danger lg km-contre', 'Contre-Kems !', 'Sûr ? Un adversaire a un carré', { t: 'km:contre' }));
      root.appendChild(calls);

      const acts = el('div', 'km-actions');
      acts.appendChild(btn(me.pass ? 'small on' : 'ghost small', me.pass ? `Je passe · ${v.passCount}/${v.liveCount}` : `Je passe${v.passCount ? ` · ${v.passCount}/${v.liveCount}` : ''}`, () => act({ t: 'km:pass' })));
      // l'hôte fait office de donneur : il peut renouveler le milieu si plus rien ne bouge
      clearTimeout(kmQuietTimer);
      if (host && v.quiet > 10000) acts.appendChild(btn('ghost small', 'Renouveler le milieu', () => act({ t: 'km:refresh' })));
      else if (host) kmQuietTimer = setTimeout(() => { if (view?.kems) renderKems(view.kems); }, 10200 - v.quiet);
      root.appendChild(acts);
    } else {
      root.appendChild(el('p', 'note', 'Tu regardes : la table est complète, tu joueras à la prochaine partie.'));
    }

    const lg = el('ul', 'km-log');
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }

  if (v.phase === 'result' || v.phase === 'over') {
    const r = v.result;
    if (r) {
      const won = r.winnerTeam === r.callerTeam;
      root.appendChild(el('div', 'km-verdict t' + r.winnerTeam,
        `<span class="eyebrow">${r.kind === 'kems' ? 'Kems' : 'Contre-Kems'} · donne ${v.deal}</span>`
        + `<p class="km-big">${r.double ? 'Double Kems !' : won ? (r.kind === 'kems' ? 'Kems !' : 'Contre-Kems !') : 'Raté !'}</p>`
        + `<p class="km-verdict-text">${esc(r.text)}</p>`
        + `<p class="km-verdict-pts">+${r.points} point${r.points > 1 ? 's' : ''} pour ${teamTag(r.winnerTeam)}</p>`));
      const hands = el('div', 'km-reveal');
      r.hands.forEach(h => {
        const row = el('div', 'km-reveal-row t' + h.team + (h.carre ? ' carre' : ''), `<div class="km-reveal-head"><b>${esc(h.name)}</b><span>${Kems.TEAMS[h.team].sym} ${esc(Kems.TEAMS[h.team].name)}${h.carre ? ' · carré !' : ''}</span></div>`);
        const mini = el('div', 'km-hand mini');
        h.cards.forEach(c => mini.appendChild(el('div', 'km-card', kmCardHTML(c))));
        row.appendChild(mini); hands.appendChild(row);
      });
      root.appendChild(hands);
    }
    if (v.phase === 'over') {
      const w = v.teams[0].score >= v.teams[1].score ? 0 : 1;
      root.appendChild(el('div', 'km-final t' + w, `<span class="eyebrow">Partie terminée</span><p class="km-big">${Kems.TEAMS[w].sym} ${esc(Kems.TEAMS[w].name)} gagnent</p><p class="fine">${esc(v.teams[w].names.join(' & '))} · ${v.teams[0].score} à ${v.teams[1].score}</p>`));
    }
    if (host) root.appendChild(v.phase === 'over'
      ? btn('primary lg', 'Retour au salon', () => act({ t: 'restart' }))
      : btn('primary lg', Math.max(v.teams[0].score, v.teams[1].score) >= v.target ? 'Voir le résultat' : 'Donne suivante', () => act({ t: 'km:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));
  }
}
