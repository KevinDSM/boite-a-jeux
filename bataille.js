/* Bataille — le jeu de cartes de la cour de récré, de 2 à 6 joueurs.

   Le paquet de 52 cartes est distribué à tous. À chaque pli, chacun retourne la carte du dessus de
   son tas ; la plus forte (l'as en haut, le 2 en bas) rafle tout, et les cartes gagnées passent sous
   le tas, mélangées. En cas d'égalité : bataille. Les joueurs à égalité posent une carte face cachée,
   puis en retournent une autre, et ainsi de suite. Qui n'a plus de cartes est éliminé ; le dernier
   qui en a gagne. Comme une bataille peut durer des heures, l'hôte choisit une durée : à la fin du
   temps, le pli en cours se termine et on compte les cartes.
   Chaque joueur peut « retourner tout seul » ; un joueur qui traîne voit sa carte partir au bout de
   quelques secondes. Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.bt),
   actions « bt:… ».
   Chargé après app.js et kems.js : réutilise $, el, act, esc, shuffle, kmCardHTML, net et view. */

'use strict';

const Bataille = (() => {
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R', 'A'];
  const val = c => RANKS.indexOf(c.r) + 2;
  const LENGTHS = { fin: 0, court: 5, normal: 10, long: 20 };   // minutes, 0 = jusqu'au bout
  const CAP = 2000;                                             // plis au plus, pour les parties sans fin
  const BOT_MS = [650, 1300], IDLE_MS = 9000, AUTO_MS = 900, SHOW_MS = 1500, WAR_MS = 1100;
  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };
  const alive = room => room.players.filter(p => p.inGame && !p.out);
  const total = p => p.stack.length;

  function create({ hostId, players, length = 'normal' }) {
    const room = {
      hostId, length: length in LENGTHS ? length : 'normal', phase: 'flip',
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, inGame: p.online !== false, auto: false, stack: [], table: [], out: 0, won: 0 })),
      contest: [], need: [], war: 0, pli: 0, wars: 0, best: 0, result: null, endsAt: 0, showUntil: 0, dueAt: {}, outOrder: 0,
      reason: '', ranking: [], log: [], seq: 0, games: 0,
    };
    deal(room);
    return room;
  }
  function deal(room) {
    const d = []; ['S', 'H', 'D', 'C'].forEach(s => RANKS.forEach(r => d.push({ r, s })));
    const cards = shuffle(d), ps = room.players.filter(p => p.inGame);
    room.players.forEach(p => { p.stack = []; p.table = []; p.out = 0; p.won = 0; });
    cards.forEach((c, i) => ps[i % ps.length].stack.push(c));
    room.pli = 0; room.wars = 0; room.best = 0; room.outOrder = 0; room.reason = ''; room.ranking = []; room.log = [];
    room.endsAt = LENGTHS[room.length] ? Date.now() + LENGTHS[room.length] * 60000 : 0;
    room.games += 1;
    log(room, `${ps.length} joueurs, ${Math.floor(52 / ps.length)} cartes chacun${52 % ps.length ? ' ou presque' : ''}. Que le plus fort gagne.`);
    newPli(room);
  }
  function newPli(room) {
    room.pli += 1; room.war = 0; room.result = null; room.phase = 'flip';
    room.players.forEach(p => { p.table = []; });
    room.contest = alive(room).map(p => p.id);
    askFlip(room, room.contest);
  }
  function askFlip(room, ids) {
    const now = Date.now();
    room.need = ids.slice(); room.dueAt = {};
    ids.forEach(id => {
      const p = pl(room, id);
      room.dueAt[id] = now + (p.bot ? BOT_MS[0] + Math.random() * (BOT_MS[1] - BOT_MS[0]) : p.auto || !p.online ? AUTO_MS : IDLE_MS);
    });
    room.seq += 1;
  }
  function flip(room, pid) {
    if (room.phase !== 'flip' || !room.need.includes(pid)) return null;
    const p = pl(room, pid);
    const c = p.stack.shift();
    if (c) p.table.push({ c, up: true });
    room.need = room.need.filter(x => x !== pid); delete room.dueAt[pid];
    room.seq += 1;
    if (!room.need.length) resolve(room);
    return null;
  }
  const lastUp = p => { for (let i = p.table.length - 1; i >= 0; i--) if (p.table[i].up) return p.table[i].c; return null; };
  function resolve(room) {
    // ceux qui n'ont pas pu retourner (tas vide) sortent du pli
    const inPli = room.contest.map(id => pl(room, id)).filter(p => lastUp(p) && p.table[p.table.length - 1].up);
    const pot = room.players.reduce((n, p) => n + p.table.length, 0);
    if (!inPli.length) {
      // tous les prétendants sont à sec : le pot revient au joueur qui a le plus gros tas
      const w = alive(room).sort((a, b) => total(b) - total(a))[0] || room.contest.map(id => pl(room, id))[0];
      return win(room, w, pot);
    }
    const top = Math.max(...inPli.map(p => val(lastUp(p))));
    const tied = inPli.filter(p => val(lastUp(p)) === top);
    if (tied.length === 1) return win(room, tied[0], pot);
    // bataille
    room.war += 1; room.wars += 1; room.best = Math.max(room.best, room.war);
    room.contest = tied.map(p => p.id);
    log(room, `${room.war > 1 ? (room.war === 2 ? 'Double' : room.war === 3 ? 'Triple' : 'Encore une') + ' bataille' : 'Bataille'} entre ${names(tied)}.`);
    room.phase = 'war'; room.showUntil = Date.now() + WAR_MS; room.seq += 1;
  }
  const names = ps => { const n = ps.map(p => p.name); return n.length > 1 ? n.slice(0, -1).join(', ') + ' et ' + n[n.length - 1] : n[0]; };
  function startWarFlip(room) {
    // chacun pose une carte face cachée s'il en a au moins deux, puis doit en retourner une
    const ids = [];
    room.contest.forEach(id => {
      const p = pl(room, id);
      if (p.stack.length >= 2) p.table.push({ c: p.stack.shift(), up: false });
      if (p.stack.length) ids.push(id);
    });
    if (!ids.length) {
      // tous les prétendants sont à sec : le pot revient au plus gros tas encore en jeu
      const pot = room.players.reduce((n, p) => n + p.table.length, 0);
      const w = alive(room).filter(p => p.stack.length).sort((a, b) => total(b) - total(a))[0] || pl(room, room.contest[0]);
      return win(room, w, pot);
    }
    room.contest = ids; room.phase = 'flip';
    askFlip(room, ids);
  }
  function win(room, w, pot) {
    const cards = shuffle(room.players.flatMap(p => p.table.map(t => t.c)));
    w.stack.push(...cards); w.won += 1;
    room.result = { id: w.id, name: w.name, n: pot, war: room.war, card: lastUp(w) };
    if (room.war) log(room, `${w.name} remporte la bataille et ${pot} cartes.`);
    room.phase = 'show'; room.showUntil = Date.now() + SHOW_MS + (room.war ? 600 : 0); room.seq += 1;
  }
  function afterShow(room) {
    room.players.forEach(p => { p.table = []; });
    alive(room).forEach(p => { if (!p.stack.length) { p.out = ++room.outOrder; log(room, `${p.name} n’a plus de cartes. Éliminé.`); } });
    const left = alive(room);
    if (left.length <= 1) return finish(room, 'tout');
    if (room.endsAt && Date.now() >= room.endsAt) return finish(room, 'temps');
    if (room.pli >= CAP) return finish(room, 'cap');
    newPli(room);
  }
  function finish(room, reason) {
    room.phase = 'over'; room.reason = reason; room.need = []; room.result = null;
    const ps = room.players.filter(p => p.inGame);
    room.ranking = ps.slice().sort((a, b) => (b.out ? 0 : 1) - (a.out ? 0 : 1) || total(b) - total(a) || b.out - a.out)
      .map(p => ({ id: p.id, name: p.name, score: total(p), out: !!p.out }));
    const w = room.ranking[0];
    log(room, reason === 'tout' ? `${w.name} a raflé les 52 cartes.` : `Fin du temps. ${w.name} finit avec ${w.score} cartes.`);
    room.seq += 1;
  }

  function tick(room) {
    const now = Date.now();
    if (room.phase === 'war' && now >= room.showUntil) { startWarFlip(room); return true; }
    if (room.phase === 'show' && now >= room.showUntil) { afterShow(room); return true; }
    if (room.phase === 'flip') {
      const due = room.need.filter(id => now >= room.dueAt[id]);
      if (due.length) { due.forEach(id => flip(room, id)); return true; }
    }
    return false;
  }

  function act(room, pid, m) {
    const p = pl(room, pid), host = pid === room.hostId;
    switch (m.t) {
      case 'bt:flip': return flip(room, pid);
      case 'bt:auto':
        if (!p?.inGame) return null;
        p.auto = !p.auto;
        if (room.need.includes(pid)) room.dueAt[pid] = Date.now() + (p.auto ? AUTO_MS : IDLE_MS);
        room.seq += 1; return null;
      case 'bt:length': if (host && room.phase === 'over' && m.length in LENGTHS) { room.length = m.length; room.seq += 1; } return null;
      case 'bt:again':
        if (!host || room.phase !== 'over') return null;
        room.players.forEach(q => { if (q.online || q.bot) q.inGame = true; });
        if (room.players.filter(q => q.inGame).length < 2) return 'Il faut au moins deux joueurs';
        deal(room); return null;
    }
    return null;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; if (room.need.includes(id)) room.dueAt[id] = Date.now() + (p.auto ? AUTO_MS : IDLE_MS); return; }
    // un nouveau venu regarde la partie en cours et joue la suivante
    room.players.push({ id, name, online: true, bot: false, inGame: false, auto: false, stack: [], table: [], out: 0, won: 0 });
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on;
    if (!on && room.need.includes(id)) room.dueAt[id] = Math.min(room.dueAt[id], Date.now() + AUTO_MS);
  }

  function view(room, pid) {
    const me = pl(room, pid), now = Date.now();
    return {
      phase: room.phase, pli: room.pli, war: room.war, wars: room.wars, best: room.best, length: room.length, games: room.games,
      isHost: pid === room.hostId, seq: room.seq, reason: room.reason, ranking: room.ranking,
      timeLeft: room.endsAt ? Math.max(0, room.endsAt - now) : null,
      me: me ? { inGame: me.inGame, out: !!me.out, auto: me.auto, n: total(me), need: room.need.includes(pid), due: room.need.includes(pid) ? Math.max(0, room.dueAt[pid] - now) : 0 } : null,
      canFlip: room.phase === 'flip' && room.need.includes(pid),
      players: room.players.filter(p => p.inGame).map(p => ({
        id: p.id, name: p.name, bot: p.bot, online: p.online, me: p.id === pid, n: total(p), out: !!p.out, auto: p.auto, won: p.won,
        need: room.need.includes(p.id), contest: room.contest.includes(p.id),
        table: p.table.map(t => (t.up ? t.c : null)),
      })),
      waiting: room.need.map(id => pl(room, id)?.name).filter(Boolean),
      result: room.result, log: room.log.slice(-5),
    };
  }
  return { RANKS, LENGTHS, create, act, tick, join, setOnline, view };
})();

// ============================================================ écran
const btCard = (c, cls = '') => c ? `<div class="bt-card km-card ${cls}">${kmCardHTML(c)}</div>` : `<div class="bt-card back ${cls}"></div>`;
function btMinutes(ms) {
  const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min${r ? ' ' + String(r).padStart(2, '0') : ''}` : `${r} s`;
}
let btSeen = {};   // cartes déjà affichées par joueur, pour n'animer que les nouvelles
function renderBataille(v) {
  if (!v) return;
  const seen = {};
  const root = $('#bt-main');
  root.innerHTML = '';
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const say = list => list[(v.pli + v.games) % list.length];
  const me = v.me, mine = v.players.find(p => p.me);
  const res = v.result, winnerId = res?.id || (v.phase === 'over' ? v.ranking[0]?.id : null);

  // en-tête
  const time = v.timeLeft === null ? 'jusqu’au bout' : v.phase === 'over' ? 'temps écoulé' : v.timeLeft > 0 ? `encore ${btMinutes(v.timeLeft)}` : 'dernier pli';
  root.appendChild(el('p', 'mj-meta', v.phase === 'over' ? `${v.pli} plis · ${v.wars} bataille${v.wars > 1 ? 's' : ''}` : `Pli ${v.pli} · ${time}`));

  let title = '', line = '';
  if (v.phase === 'over') {
    const w = v.ranking[0];
    title = v.reason === 'tout' ? `${esc(w.name)} rafle tout.` : `${esc(w.name)} gagne, avec ${w.score} cartes.`;
    line = v.reason === 'tout'
      ? say(['Les 52 cartes, sans exception. Respect.', 'Plus personne en face. La guerre est finie.'])
      : say(['Le temps est écoulé, on a compté les tas.', 'Pas de vainqueur par K.-O., mais aux points.']);
    if (v.best > 1) line += ` Record du soir : une ${v.best === 2 ? 'double' : v.best === 3 ? 'triple' : 'quadruple'} bataille.`;
  } else if (v.phase === 'war') {
    title = v.war === 1 ? 'Bataille !' : v.war === 2 ? 'Double bataille !' : v.war === 3 ? 'Triple bataille !' : 'Encore une bataille !';
    line = say(['Une carte cachée, une carte visible. La plus forte rafle tout.', 'Égalité. On pose une carte à l’envers, et on recommence.', 'Personne ne lâche. Carte cachée, puis carte visible.']);
  } else if (v.phase === 'show' && res) {
    const self = res.id === mine?.id;
    title = self ? `Tu rafles ${res.n} cartes.` : `${esc(res.name)} rafle ${res.n} cartes.`;
    line = res.war
      ? (self ? say(['La bataille est pour toi. Savoure.', 'Tu as gagné la bataille. Et tout ce qui traînait.']) : say(['La bataille lui revient, avec le butin.', 'Bataille perdue. Ça arrive aux meilleurs.']))
      : res.card ? `${res.card.r === 'A' ? 'Un as' : res.card.r === 'R' ? 'Un roi' : res.card.r === 'D' ? 'Une dame' : res.card.r === 'V' ? 'Un valet' : 'Un ' + res.card.r}, et personne au-dessus.` : '';
  } else if (v.canFlip) {
    title = v.war ? 'Ta carte de bataille.' : 'À toi de retourner.';
    line = me.auto ? 'Elle part toute seule dans un instant.' : say(['Touche ton tas. Le hasard fait le reste.', 'Aucune stratégie possible. Juste du courage.', 'Retourne, et prie pour un as.']);
  } else if (me?.inGame && me.out) {
    title = 'Tu n’as plus de cartes.';
    line = say(['Éliminé, mais pas oublié. Regarde les autres s’écharper.', 'Fin de campagne pour toi. Place aux survivants.']);
  } else if (!me?.inGame) {
    title = 'Tu regardes cette bataille.';
    line = 'Tu joueras la prochaine partie.';
  } else {
    const w = v.waiting;
    title = w.length === 1 ? `Plus que ${esc(w[0])}.` : w.length ? `On attend ${w.length} joueurs.` : 'On retourne.';
    line = v.war ? 'Les autres se départagent. Toi, tu comptes les points.' : say(['Ta carte est posée. Tiens bon.', 'Les dés sont jetés. Enfin, les cartes.']);
  }
  root.appendChild(el('div', `mj-status bt-status${v.phase === 'war' ? ' war' : ''}`, `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`));

  if (mine && v.phase !== 'over') {
    const pct = Math.round(mine.n / 52 * 100);
    root.appendChild(el('div', 'mj-prog', `<i class="f" style="width:${pct}%"></i><span>${mine.n} carte${mine.n > 1 ? 's' : ''} sur 52</span>`));
  }

  // la table
  const table = el('div', `bt-table n${Math.min(v.players.length, 6)}`);
  const seats = v.players.slice().sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));
  seats.forEach(p => {
    const cls = ['bt-seat', p.me ? 'me' : '', p.out ? 'out' : '', p.id === winnerId ? 'win' : '', v.war && p.contest && v.phase !== 'show' ? 'fight' : '', p.need ? 'need' : ''].filter(Boolean).join(' ');
    const seat = el('div', cls);
    const pile = p.n ? `<div class="bt-pile${p.n > 12 ? ' thick' : p.n > 4 ? ' mid' : ''}">${btCard(null)}<b>${p.n}</b></div>` : `<div class="bt-pile empty"><b>0</b></div>`;
    const sk = `${v.games}:${v.pli}:${p.id}`, before = btSeen[sk] || 0; seen[sk] = p.table.length;
    const played = p.table.length ? `<div class="bt-played">${p.table.map((c, i) => btCard(c, (c ? 'up' : '') + (i >= before ? ' new' : ''))).join('')}</div>` : `<div class="bt-played none">${p.out ? '' : p.need ? '<span>à retourner</span>' : ''}</div>`;
    seat.innerHTML = `<div class="bt-name"><span>${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.me ? ' <em>toi</em>' : ''}</span>${p.out ? '<i>éliminé</i>' : p.auto && !p.bot ? '<i>tout seul</i>' : ''}</div><div class="bt-cards">${pile}${played}</div>`;
    if (p.me && v.canFlip) { seat.classList.add('tap'); seat.onclick = () => act({ t: 'bt:flip' }); }
    table.appendChild(seat);
  });
  root.appendChild(table);
  btSeen = seen;

  // actions
  const row = el('div', 'bt-row');
  if (v.phase === 'over') {
    if (v.isHost) {
      const sel = el('select'); sel.setAttribute('aria-label', 'Durée de la prochaine partie');
      sel.innerHTML = [['court', '5 minutes'], ['normal', '10 minutes'], ['long', '20 minutes'], ['fin', 'Jusqu’au bout']].map(([k, l]) => `<option value="${k}"${k === v.length ? ' selected' : ''}>${l}</option>`).join('');
      sel.onchange = () => act({ t: 'bt:length', length: sel.value });
      row.append(sel, btn('primary lg', 'Rejouer', () => act({ t: 'bt:again' })));
    } else row.appendChild(el('p', 'note', 'L’hôte peut relancer une partie.'));
  } else if (me?.inGame && !me.out) {
    const b = btn('primary lg bt-flip', v.war && v.canFlip ? 'Retourner ma carte de bataille' : 'Retourner', () => act({ t: 'bt:flip' }));
    b.disabled = !v.canFlip;
    row.appendChild(b);
    const auto = el('label', 'bt-auto', `<input type="checkbox"${me.auto ? ' checked' : ''}><span>Retourner tout seul</span>`);
    auto.querySelector('input').onchange = () => act({ t: 'bt:auto' });
    row.appendChild(auto);
  }
  root.appendChild(row);

  // classement et journal (colonne de droite sur PC)
  const side = el('div', 'bt-side');
  const list = v.phase === 'over' ? v.ranking : v.players.slice().sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.n - a.n).map(p => ({ ...p, score: p.n }));
  side.innerHTML = `<h4 class="mj-side-title">${v.phase === 'over' ? 'Classement' : 'Les tas'}</h4><ol class="mj-list">${list.map((p, i) => `<li class="mj-row${p.id === mine?.id ? ' me' : ''}${p.out ? ' out' : ''}"><span>${i + 1}. ${esc(p.name)}</span><i>${p.out && !p.score ? 'éliminé' : `${p.score} carte${p.score > 1 ? 's' : ''}`}</i></li>`).join('')}</ol>`;
  root.appendChild(side);
  if (v.log.length) {
    const lg = el('div', 'bt-log');
    lg.innerHTML = `<h4 class="mj-side-title">Au fil des plis</h4><ul class="mj-list">${v.log.slice().reverse().map(t => `<li class="mj-row"><span>${esc(t)}</span></li>`).join('')}</ul>`;
    root.appendChild(lg);
  }
}
