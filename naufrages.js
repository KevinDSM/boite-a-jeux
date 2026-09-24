/* Naufragés — l'équivalent maison de Galèrapagos : échoués sur une île, il faut construire un radeau
   et partir avant l'ouragan. Tout le monde coopère… tant qu'il y a assez à manger.

   Chaque jour, une carte météo annonce combien d'eau on récolte. Chaque survivant choisit en secret
   une action : pêcher, chercher de l'eau, couper du bois (en tentant sa chance pour en couper plus,
   au risque d'être mordu par un serpent), ou fouiller l'épave (un objet caché, que l'on garde pour soi).
   Le soir, chacun doit manger un poisson et boire une ration d'eau. S'il en manque, le camp vote pour
   sacrifier quelqu'un, jusqu'à ce que les réserves suffisent. Quand le radeau a une place pour chacun
   et que les réserves suffisent pour la traversée, on peut partir ; l'ouragan, lui, force le départ.
   Ceux qui embarquent gagnent. Même modèle que les autres jeux : la salle vit chez l'hôte
   (net.game.nf), les objets ne sortent que vers leur propriétaire, actions « nf:… ».
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, net et view. */

'use strict';

const Naufrages = (() => {
  const WOOD_PER_SEAT = 4;                  // bois pour une place sur le radeau
  const FISH = [1, 1, 2, 2, 3, 3, 3, 4];   // prise d'une pêche
  const SNAKE = 1 / 6;                      // risque par morceau de bois tenté en plus
  const VOTE_MS = 45000, REVEAL_MS = 9000;
  const ITEMS = {
    conserve: { name: 'Conserve', text: '+3 poissons dans la réserve.', n: 5 },
    gourde: { name: 'Gourde', text: '+3 rations d’eau dans la réserve.', n: 5 },
    hache: { name: 'Hache', text: 'Ta prochaine coupe de bois rapporte 3 morceaux de plus.', n: 4 },
    canne: { name: 'Canne à pêche', text: 'Ta prochaine pêche rapporte 2 poissons de plus.', n: 3 },
    antidote: { name: 'Antidote', text: 'Soigne un malade, toi compris : il rejoue dès aujourd’hui.', n: 3 },
    longuevue: { name: 'Longue-vue', text: 'Regarde en secret la météo des trois prochains jours.', n: 3 },
    corde: { name: 'Corde', text: '+1 place sur le radeau.', n: 3 },
    pistolet: { name: 'Pistolet', text: 'Pendant un vote, abat directement le joueur de ton choix. Une seule balle.', n: 2 },
    talisman: { name: 'Talisman', text: 'Si tu es désigné au vote, tu survis et le vote recommence sans toi. Une fois.', n: 2 },
  };
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

  const pl = (room, id) => room.players.find(p => p.id === id);
  const alive = room => room.players.filter(p => p.inGame && p.alive);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 50) room.log.splice(0, room.log.length - 50); };
  const seats = room => Math.floor(room.wood / WOOD_PER_SEAT) + room.bonusSeats;
  const pick = a => a[Math.random() * a.length | 0];

  function buildWreck() {
    const d = []; Object.entries(ITEMS).forEach(([k, it]) => { for (let i = 0; i < it.n; i++) d.push(k); });
    // l'épave contient aussi des débris sans intérêt
    for (let i = 0; i < 8; i++) d.push('rien');
    return shuffle(d);
  }
  /** La météo : de 1 à 4 rations d'eau par récolte selon le jour, et l'ouragan vers le jour 8 à 11 (6 à 8 en partie courte, 10 à 14 en longue). */
  function buildWeather(hurricaneMin, hurricaneMax) {
    const h = hurricaneMin + (Math.random() * (hurricaneMax - hurricaneMin + 1) | 0);
    const days = [];
    for (let d = 1; d < h; d++) days.push(pick([0, 1, 1, 2, 2, 2, 3, 3]));
    days.push('ouragan');
    return days;
  }

  const BOT_NAMES = ['Robot Crusoé', 'Robot Vendredi', 'Robot Nemo', 'Robot Wilson', 'Robot Moana', 'Robot Popeye'];
  function create({ hostId, players, length, bots }) {
    const [hmin, hmax] = length === 'court' ? [6, 8] : length === 'long' ? [10, 14] : [8, 11];
    const room = {
      hostId, phase: 'day', day: 0, length: length || 'normal',
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, inGame: p.online !== false, alive: true, sick: 0, items: [], boost: {}, fate: null })),
      food: 0, water: 0, wood: 0, bonusSeats: 0, weather: buildWeather(hmin, hmax), wreck: buildWreck(),
      choices: {}, report: [], vote: null, need: 0, winners: [], outcome: null, log: [], seq: 0, turnAt: Date.now(), peeks: {},
    };
    for (let i = 0; i < clamp(bots, 0, 6, 0); i++) room.players.push({ id: 'bot' + i, name: BOT_NAMES[i], online: true, inGame: true, alive: true, sick: 0, items: [], boost: {}, fate: null, bot: true });
    const n = alive(room).length;
    room.food = Math.max(4, Math.round(n * 1.5)); room.water = Math.max(4, Math.round(n * 1.5));
    log(room, `Le bateau a coulé. ${n} survivants sur la plage, quelques vivres rescapés.`);
    startDay(room);
    return room;
  }

  const todayWeather = room => room.weather[room.day - 1];

  function startDay(room) {
    room.day += 1;
    room.choices = {}; room.report = []; room.vote = null;
    alive(room).forEach(p => { if (p.sick > 0) p.sick -= 1; });
    const w = todayWeather(room);
    room.phase = 'day'; room.turnAt = Date.now(); room.seq += 1;
    log(room, w === 'ouragan' ? `Jour ${room.day} : le ciel se déchire, l’ouragan arrive ce soir !` : `Jour ${room.day} : ${w === 0 ? 'grand soleil, l’eau se fait rare' : w === 1 ? 'quelques nuages' : w === 2 ? 'des averses' : 'une pluie battante'}.`);
  }
  const canAct = p => p.alive && p.inGame && p.sick === 0;

  function choose(room, pid, m) {
    const p = pl(room, pid);
    if (room.phase !== 'day' || !p || !canAct(p)) return null;
    if (!['fish', 'water', 'wood', 'wreck'].includes(m.action)) return null;
    room.choices[pid] = { action: m.action, risk: m.action === 'wood' ? clamp(m.risk, 0, 5, 0) : 0 };
    room.seq += 1;
    if (alive(room).filter(q => canAct(q) && q.online).every(q => room.choices[q.id])) resolveDay(room);
    return null;
  }

  function resolveDay(room) {
    const w = todayWeather(room), water = (w === 'ouragan' ? 2 : w) + 1;   // noix de coco : jamais moins d'une ration
    const lines = []; room.flash = null;
    alive(room).forEach(p => {
      const c = room.choices[p.id]; if (!c) { if (p.sick === 0) lines.push({ name: p.name, text: 'reste à l’ombre sans rien faire' }); else lines.push({ name: p.name, text: 'est malade et se repose' }); return; }
      if (c.action === 'fish') { let n = pick(FISH); if (p.boost.canne) { n += 2; delete p.boost.canne; } room.food += n; lines.push({ name: p.name, text: n ? `pêche ${n} poisson${n > 1 ? 's' : ''}` : 'rentre bredouille de la pêche' }); }
      if (c.action === 'water') { room.water += water; lines.push({ name: p.name, text: `récolte ${water} ration${water > 1 ? 's' : ''} d’eau` }); }
      if (c.action === 'wood') {
        let n = 1, bitten = false;
        for (let i = 0; i < c.risk; i++) { if (Math.random() < SNAKE) { bitten = true; break; } n += 1; }
        if (bitten) { n = 0; p.sick = 2; }
        if (!bitten && p.boost.hache) { n += 3; delete p.boost.hache; }
        room.wood += n;
        lines.push({ name: p.name, text: bitten ? 'se fait mordre par un serpent : malade deux jours, pas de bois' : `coupe ${n} morceau${n > 1 ? 'x' : ''} de bois` });
      }
      if (c.action === 'wreck') {
        const it = room.wreck.length ? room.wreck.pop() : 'rien';
        if (it !== 'rien') p.items.push(it);
        lines.push({ name: p.name, text: 'fouille l’épave', secret: it });
      }
    });
    room.report = lines;
    room.phase = 'dusk'; room.turnAt = Date.now(); room.seq += 1;
  }

  /** Le soir : on mange, on boit, on vote s'il en manque. */
  function evening(room) {
    const n = alive(room).length;
    const shortage = Math.max(0, n - room.food, n - room.water);
    if (todayWeather(room) === 'ouragan') return hurricane(room);
    if (shortage > 0) { startVote(room, 'food', shortage); return; }
    eat(room);
    if (canLeave(room)) { room.phase = 'ready'; room.seq += 1; return; }
    startDay(room);
  }
  function eat(room) {
    const n = alive(room).length;
    room.food -= n; room.water -= n;
    log(room, `Le soir, chacun mange un poisson et boit une ration. Il reste ${room.food} poisson${room.food > 1 ? 's' : ''} et ${room.water} ration${room.water > 1 ? 's' : ''}.`);
  }
  const canLeave = room => { const n = alive(room).length; return n > 0 && seats(room) >= n && room.food >= n && room.water >= n; };

  function hurricane(room) {
    const n = alive(room).length, fit = Math.min(seats(room), room.food, room.water);
    if (fit >= n) return depart(room, 'ouragan');
    if (fit <= 0) return end(room, [], 'L’ouragan balaie l’île : sans radeau ni vivres, personne ne s’en sort.');
    startVote(room, 'raft', n - fit);
  }

  function startVote(room, reason, count) {
    room.vote = { reason, count, votes: {}, ends: Date.now() + VOTE_MS, protected: [] }; room.flash = null;
    room.phase = 'vote'; room.turnAt = Date.now(); room.seq += 1;
    log(room, reason === 'food'
      ? `Il n’y a pas assez à manger pour tout le monde : il faut désigner ${count > 1 ? `${count} personnes` : 'quelqu’un'}.`
      : `Le radeau ne peut pas emporter tout le monde : ${count > 1 ? `${count} personnes restent` : 'une personne reste'} sur l’île.`);
  }
  function castVote(room, pid, target) {
    const p = pl(room, pid), t = pl(room, target), v = room.vote;
    if (room.phase !== 'vote' || !p?.alive || !t?.alive || v.protected.includes(target)) return null;
    v.votes[pid] = target; room.seq += 1;
    if (alive(room).filter(q => q.online).every(q => v.votes[q.id])) resolveVote(room);
    return null;
  }
  function resolveVote(room) {
    const v = room.vote, tally = {};
    Object.entries(v.votes).forEach(([from, to]) => { if (pl(room, from)?.alive && pl(room, to)?.alive) tally[to] = (tally[to] || 0) + 1; });
    let cands = alive(room).filter(p => !v.protected.includes(p.id));
    if (!cands.length) { v.protected = []; cands = alive(room); }            // tout le monde protégé : les talismans ne suffisent plus
    if (!cands.length) return end(room, [], 'Il ne reste plus personne sur l’île.');
    Object.keys(tally).forEach(id => { if (!cands.some(p => p.id === id)) delete tally[id]; });
    let max = Math.max(0, ...Object.values(tally)), top = Object.keys(tally).filter(id => tally[id] === max);
    if (!top.length) top = cands.map(p => p.id);
    const out = pick(top), victim = pl(room, out);
    const shown = Object.entries(v.votes).map(([f, t]) => `${pl(room, f)?.name} → ${pl(room, t)?.name}`);
    const ti = victim.items.indexOf('talisman');
    if (ti >= 0) {
      victim.items.splice(ti, 1); v.protected.push(out); v.votes = {};
      if (!alive(room).some(p => !v.protected.includes(p.id))) v.protected = [out];   // il reste au moins un candidat v.ends = Date.now() + VOTE_MS; room.seq += 1;
      log(room, `${victim.name} brandit un talisman et échappe au vote ! On revote sans lui.`);
      room.flash = { text: `${victim.name} brandit un talisman : on revote sans lui.`, votes: shown };
      return;
    }
    kill(room, out, v.reason === 'food' ? 'sacrifié par le camp' : 'laissé sur l’île');
    room.flash = { text: `${victim.name} est ${v.reason === 'food' ? 'sacrifié par le camp' : 'laissé sur l’île'}.`, votes: shown };
    afterLoss(room);
  }
  function kill(room, id, why) {
    const p = pl(room, id); if (!p || !p.alive) return;
    p.alive = false; p.fate = why;
    room.wreck.unshift(...p.items.filter(i => i !== 'rien')); p.items = [];     // ses affaires retournent à l'épave
    log(room, `${p.name} : ${why}.`);
  }
  function afterLoss(room) {
    const v = room.vote; v.count -= 1;
    if (!alive(room).length) return end(room, [], 'Il ne reste plus personne sur l’île.');
    if (v.reason === 'food') {
      const n = alive(room).length;
      if (n - room.food > 0 || n - room.water > 0) { v.votes = {}; v.ends = Date.now() + VOTE_MS; room.seq += 1; return; }
      room.vote = null; eat(room);
      if (canLeave(room)) { room.phase = 'ready'; room.seq += 1; return; }
      startDay(room); return;
    }
    const fit = Math.min(seats(room), room.food, room.water);
    if (alive(room).length > fit) { v.votes = {}; v.ends = Date.now() + VOTE_MS; room.seq += 1; return; }
    depart(room, 'ouragan');
  }

  function depart(room, why) {
    const survivors = alive(room);
    survivors.forEach(p => { p.fate = 'embarque sur le radeau'; });
    end(room, survivors.map(p => p.id), why === 'ouragan'
      ? `L’ouragan se lève : ${survivors.map(p => p.name).join(', ')} embarque${survivors.length > 1 ? 'nt' : ''} sur le radeau et quitte${survivors.length > 1 ? 'nt' : ''} l’île !`
      : `Le radeau est prêt : ${survivors.map(p => p.name).join(', ')} prend${survivors.length > 1 ? 'nent' : ''} la mer et s’en sort${survivors.length > 1 ? 'ent' : ''} !`);
  }
  function end(room, winners, text) {
    room.winners = winners; room.outcome = text; room.phase = 'over'; room.vote = null; room.seq += 1;
    log(room, text);
  }

  // ------------------------------------------------------------ objets
  function useItem(room, pid, m) {
    const p = pl(room, pid); if (!p?.alive) return null;
    const i = p.items.indexOf(m.item); if (i < 0) return null;
    const it = m.item;
    if (it === 'pistolet') {
      if (room.phase !== 'vote') return 'Le pistolet ne sert que pendant un vote';
      const t = pl(room, m.target); if (!t?.alive || t.id === pid) return 'Choisis une cible';
      p.items.splice(i, 1);
      kill(room, t.id, `abattu par ${p.name}`);
      room.flash = { text: `${p.name} sort un pistolet et abat ${t.name} !`, votes: [] };
      afterLoss(room); room.seq += 1; return null;
    }
    if (it === 'talisman') return 'Le talisman agit tout seul si tu es désigné';
    if (room.phase === 'over') return null;
    p.items.splice(i, 1);
    if (it === 'conserve') { room.food += 3; log(room, `${p.name} ouvre une conserve : +3 poissons.`); }
    if (it === 'gourde') { room.water += 3; log(room, `${p.name} partage une gourde : +3 rations d’eau.`); }
    if (it === 'corde') { room.bonusSeats += 1; log(room, `${p.name} consolide le radeau avec une corde : +1 place.`); }
    if (it === 'hache') { p.boost.hache = true; log(room, `${p.name} aiguise une hache.`); }
    if (it === 'canne') { p.boost.canne = true; log(room, `${p.name} prépare une canne à pêche.`); }
    if (it === 'antidote') {
      const t = pl(room, m.target) || p; t.sick = 0; log(room, `${p.name} soigne ${t.id === p.id ? 'sa morsure' : t.name}.`);
    }
    if (it === 'longuevue') { room.peeks[pid] = room.weather.slice(room.day, room.day + 3); log(room, `${p.name} scrute l’horizon avec une longue-vue.`); }
    // une ressource en plus peut régler une pénurie en plein vote
    if (room.phase === 'vote' && room.vote?.reason === 'food') { const n = alive(room).length; if (n <= room.food && n <= room.water) { room.vote = null; eat(room); if (canLeave(room)) room.phase = 'ready'; else startDay(room); } }
    if (room.phase === 'vote' && room.vote?.reason === 'raft') { if (alive(room).length <= Math.min(seats(room), room.food, room.water)) depart(room, 'ouragan'); }
    room.seq += 1;
    return null;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'nf:choose': return choose(room, pid, m);
      case 'nf:vote': return castVote(room, pid, m.target);
      case 'nf:use': return useItem(room, pid, m);
      case 'nf:next':
        if (pid !== room.hostId) return null;
        if (room.phase === 'dusk') { room.flash = null; evening(room); }
        return null;
      case 'nf:leave': if (room.phase === 'ready' && pid === room.hostId) depart(room, 'choix'); return null;
      case 'nf:stay': if (room.phase === 'ready' && pid === room.hostId) startDay(room); return null;
      case 'nf:skip':
        if (pid !== room.hostId) return null;
        if (room.phase === 'day') resolveDay(room);
        else if (room.phase === 'vote') resolveVote(room);
        return null;
    }
    return null;
  }

  // ------------------------------------------------------------ robots : ils font leur part, votent, et gardent parfois un objet pour eux
  function botDay(room, b) {
    ['conserve', 'gourde', 'corde'].forEach(k => { if (b.items.includes(k)) useItem(room, b.id, { item: k }); });
    if (b.items.includes('antidote')) { const sick = alive(room).find(p => p.sick); if (sick) useItem(room, b.id, { item: 'antidote', target: sick.id }); }
    const n = alive(room).length, w = todayWeather(room), water = (w === 'ouragan' ? 2 : w) + 1;
    const planned = Object.values(room.choices);
    const food = room.food + planned.filter(c => c.action === 'fish').length * 2.4, drink = room.water + planned.filter(c => c.action === 'water').length * water;
    const wood = room.wood + planned.filter(c => c.action === 'wood').length * 1.5, seatsLeft = n * WOOD_PER_SEAT - wood - room.bonusSeats * WOOD_PER_SEAT;
    let action = 'wood';
    if (food < n + 1 && food <= drink) action = 'fish'; else if (drink < n + 1) action = 'water'; else if (seatsLeft <= 0) action = Math.random() < .5 ? 'fish' : 'water'; else if (Math.random() < .12) action = 'wreck';
    choose(room, b.id, { action, risk: action === 'wood' ? (Math.random() < .5 ? 1 : 0) : 0 });
  }
  function botVote(room, b) {
    const v = room.vote; if (!v || v.votes[b.id]) return;
    if (b.items.includes('pistolet') && Math.random() < .15) {                  // rarement, un robot sort son arme
      const t = shuffle(alive(room).filter(p => p.id !== b.id && !v.protected.includes(p.id)))[0];
      if (t) { useItem(room, b.id, { item: 'pistolet', target: t.id }); return; }
    }
    // il vote comme la majorité s'il y en a une, sinon pour un autre au hasard
    const counts = {}; Object.values(v.votes).forEach(t => counts[t] = (counts[t] || 0) + 1);
    const lead = Object.keys(counts).sort((a, c) => counts[c] - counts[a])[0];
    const pool = alive(room).filter(p => p.id !== b.id && !v.protected.includes(p.id));
    const target = lead && lead !== b.id && pool.some(p => p.id === lead) ? lead : shuffle(pool)[0]?.id;
    if (target) castVote(room, b.id, target);
  }

  function tick(room) {
    const now = Date.now();
    const bots = alive(room).filter(p => p.bot);
    if (bots.length && now - room.turnAt > 1800) {
      if (room.phase === 'day') { const b = bots.find(p => canAct(p) && !room.choices[p.id]); if (b) { botDay(room, b); return true; } }
      if (room.phase === 'vote') { const b = bots.find(p => !room.vote.votes[p.id]); if (b) { botVote(room, b); return true; } }
    }
    if (room.phase === 'vote' && room.vote && now >= room.vote.ends) { resolveVote(room); return true; }
    if (room.phase === 'dusk' && now - room.turnAt >= REVEAL_MS * 3) { room.flash = null; evening(room); return true; }
    return false;
  }

  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, inGame: false, alive: false, sick: 0, items: [], boost: {}, fate: null });
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on; if (on) return;
    if (room.phase === 'day' && alive(room).filter(q => canAct(q) && q.online).every(q => room.choices[q.id])) resolveDay(room);
    if (room.phase === 'vote' && alive(room).filter(q => q.online).every(q => room.vote.votes[q.id])) resolveVote(room);
  }

  function view(room, pid) {
    const me = pl(room, pid), n = alive(room).length;
    const w = room.day ? todayWeather(room) : null;
    return {
      phase: room.phase, day: room.day, seq: room.seq, isHost: pid === room.hostId,
      weather: w, history: room.weather.slice(0, room.day), food: room.food, water: room.water, wood: room.wood, seats: seats(room), woodPerSeat: WOOD_PER_SEAT, woodToNext: WOOD_PER_SEAT - room.wood % WOOD_PER_SEAT,
      alive: n, canLeave: canLeave(room),
      me: me?.inGame ? { alive: me.alive, sick: me.sick, canAct: canAct(me), choice: room.choices[pid] || null, items: me.items.map(k => ({ key: k, ...ITEMS[k] })), boost: me.boost, peek: room.peeks[pid] || null, fate: me.fate, won: room.winners.includes(pid) } : null,
      players: room.players.filter(p => p.inGame).map(p => ({ id: p.id, name: p.name, bot: !!p.bot, alive: p.alive, sick: p.sick, online: p.online, me: p.id === pid, done: room.phase === 'day' ? !!room.choices[p.id] : room.phase === 'vote' ? !!room.vote?.votes[p.id] : false, items: p.items.length, fate: p.fate, winner: room.winners.includes(p.id), canAct: canAct(p) })),
      report: room.phase === 'dusk' ? room.report.map(l => ({ name: l.name, text: l.text, item: l.secret && l.name === me?.name ? (l.secret === 'rien' ? 'rien' : ITEMS[l.secret].name) : null })) : [],
      vote: room.phase === 'vote' ? { reason: room.vote.reason, count: room.vote.count, mine: room.vote.votes[pid] || null, done: Object.keys(room.vote.votes).length, left: Math.max(0, room.vote.ends - Date.now()), protected: room.vote.protected } : null,
      flash: room.flash || null, outcome: room.outcome, quiet: Date.now() - room.turnAt,
      log: room.log.slice(-5), wreckLeft: room.wreck.length,
    };
  }

  return { ITEMS, WOOD_PER_SEAT, create, act, tick, join, setOnline, view };
})();

// ============================================================ écran
let nfRisk = 0, nfUsing = null, nfTimer = null;
const NF_ACTIONS = [
  { key: 'fish', icon: '🐟', name: 'Pêcher', text: 'De 1 à 4 poissons.' },
  { key: 'water', icon: '💧', name: 'Chercher de l’eau', text: 'Selon la météo du jour.' },
  { key: 'wood', icon: '🪵', name: 'Couper du bois', text: '1 morceau, plus si tu tentes ta chance.' },
  { key: 'wreck', icon: '⚓', name: 'Fouiller l’épave', text: 'Un objet caché, gardé pour toi.' },
];
const NF_WEATHER = w => w === 'ouragan' ? { icon: '🌀', text: 'Ouragan ce soir' } : [{ icon: '☀️', text: 'Grand soleil : 1 ration d’eau par récolte' }, { icon: '⛅', text: 'Nuageux : 2 rations par récolte' }, { icon: '🌦️', text: 'Averses : 3 rations par récolte' }, { icon: '🌧️', text: 'Pluie battante : 4 rations par récolte' }][w] || { icon: '', text: '' };

/** L'île : la mer, la plage, le feu de camp, les réserves et le radeau en construction. */
function nfScene(v) {
  const W = 400, H = 210, per = v.woodPerSeat;
  const slots = Math.max(v.alive, v.seats, 1), woodSeats = Math.floor(v.wood / per), partial = v.wood % per;
  const storm = v.weather === 'ouragan';
  let g = `<svg class="nf-scene${storm ? ' storm' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Le camp : ${v.wood} bois, ${v.seats} places sur ${v.alive}">`;
  g += `<defs><linearGradient id="nfSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${storm ? '#3b4658' : '#8fd3f0'}"/><stop offset="1" stop-color="${storm ? '#6b7788' : '#d9f1f7'}"/></linearGradient>`
    + `<linearGradient id="nfSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${storm ? '#2c5a6e' : '#2aa6c4'}"/><stop offset="1" stop-color="${storm ? '#16384a' : '#127a9a'}"/></linearGradient></defs>`;
  g += `<rect width="${W}" height="96" fill="url(#nfSky)"/>`;
  g += storm ? `<g class="nf-clouds" fill="#2a303b" opacity=".85"><ellipse cx="80" cy="30" rx="60" ry="18"/><ellipse cx="200" cy="22" rx="80" ry="20"/><ellipse cx="330" cy="34" rx="70" ry="18"/></g>`
    : `<circle cx="340" cy="30" r="16" fill="#ffe27a"/>` + (v.weather >= 2 ? `<g fill="#ffffff" opacity=".9"><ellipse cx="120" cy="30" rx="34" ry="11"/><ellipse cx="150" cy="24" rx="24" ry="10"/></g>` : '');
  if (!storm && v.weather >= 2) { g += '<g class="nf-rain" stroke="#5aa9d6" stroke-width="1.6" stroke-linecap="round">'; for (let i = 0; i < 14; i++) g += `<line x1="${100 + i * 5}" y1="${40 + (i % 3) * 4}" x2="${96 + i * 5}" y2="${52 + (i % 3) * 4}"/>`; g += '</g>'; }
  g += `<rect y="92" width="${W}" height="${H - 92}" fill="url(#nfSea)"/>`;
  g += `<path class="nf-wave" d="M0 100 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="2"/>`;
  // la plage et le feu de camp
  g += `<path d="M-10 210 L-10 132 Q60 104 170 118 Q250 128 300 158 Q320 176 320 210 Z" fill="#f0d99b"/><path d="M-10 136 Q60 110 168 122" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="3"/>`;
  g += `<g transform="translate(46 118)"><path d="M0 60 q4 -34 -2 -58" stroke="#8a5a2b" stroke-width="5" fill="none" stroke-linecap="round"/><g fill="#2f8a4a"><path d="M-2 2 q-26 -8 -40 8 q18 -4 40 -8"/><path d="M-2 2 q26 -10 40 6 q-18 -2 -40 -6"/><path d="M-2 2 q-10 -24 -30 -26 q14 10 30 26"/><path d="M-2 2 q14 -22 32 -22 q-16 8 -32 22"/></g><circle cx="3" cy="6" r="3.5" fill="#6b4520"/><circle cx="-5" cy="7" r="3.5" fill="#6b4520"/></g>`;
  g += `<g transform="translate(112 168)"><path d="M-14 12 L14 12 M-12 14 L12 8 M-12 8 L12 14" stroke="#6b4520" stroke-width="4" stroke-linecap="round"/><path class="nf-fire" d="M0 10 C-10 0 -4 -8 0 -16 C4 -8 10 0 0 10 Z" fill="#ff8a2a"/><path class="nf-fire" d="M0 9 C-5 3 -2 -2 0 -7 C2 -2 5 3 0 9 Z" fill="#ffd34a"/></g>`;
  // les réserves : un poisson et une jarre par ration, empilés
  const stack = (n, x, y, draw) => { let o = ''; const shown = Math.min(n, 12); for (let i = 0; i < shown; i++) o += draw(x + (i % 4) * 11, y - Math.floor(i / 4) * 9); return o + (n > 12 ? `<text x="${x + 46}" y="${y + 3}" class="nf-more">+${n - 12}</text>` : ''); };
  g += stack(v.food, 150, 176, (x, y) => `<path d="M${x} ${y} q5 -5 10 0 q-5 5 -10 0 Z M${x + 10} ${y} l4 -3 v6 Z" fill="#ff9c6b" stroke="#b5552c" stroke-width=".8"/>`);
  g += stack(v.water, 150, 198, (x, y) => `<path d="M${x + 1} ${y - 7} h7 v2 q3 2 3 6 v4 h-13 v-4 q0 -4 3 -6 Z" fill="#7cc6e8" stroke="#2c7fa6" stroke-width=".8"/>`);
  // le radeau : une place = ${per} bûches ; les places terminées, la place en cours, les places manquantes en pointillés
  const cols = Math.min(slots, 6), rows = Math.ceil(slots / 6), sw = 26, sh = 22, gap = 3;
  const rx = 385 - cols * (sw + gap), ry = 196 - rows * (sh + gap);
  g += `<g class="nf-raft">`;
  for (let k = 0; k < slots; k++) {
    const x = rx + (k % 6) * (sw + gap), y = ry + Math.floor(k / 6) * (sh + gap);
    const full = k < woodSeats, bonus = !full && k < v.seats;
    if (full || bonus) {
      for (let i = 0; i < per; i++) g += `<rect x="${x + i * (sw / per)}" y="${y}" width="${sw / per - 1}" height="${sh}" rx="2" fill="${bonus ? '#c9a15c' : '#a86b34'}" stroke="#6b4520" stroke-width=".8"/>`;
      g += `<path d="M${x} ${y + 6} h${sw} M${x} ${y + sh - 6} h${sw}" stroke="#e8d3a0" stroke-width="1.4"/>`;
    } else if (k === Math.max(woodSeats, v.seats) && partial > 0) {
      for (let i = 0; i < partial; i++) g += `<rect class="nf-log-new" x="${x + i * (sw / per)}" y="${y}" width="${sw / per - 1}" height="${sh}" rx="2" fill="#a86b34" stroke="#6b4520" stroke-width=".8"/>`;
      g += `<rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="3" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-dasharray="3 3"/>`;
    } else g += `<rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="3" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".55" stroke-dasharray="3 3"/>`;
  }
  if (v.seats >= v.alive && v.alive > 0) {                                      // assez de places : on hisse la voile
    const mx = rx + (cols * (sw + gap)) / 2;
    g += `<path d="M${mx} ${ry - 2} V${ry - 62}" stroke="#6b4520" stroke-width="3"/><path class="nf-sail" d="M${mx + 2} ${ry - 60} Q${mx + 34} ${ry - 36} ${mx + 2} ${ry - 12} Z" fill="#fbf4e2" stroke="#c9b58a"/>`;
  }
  g += `</g>`;
  g += `<text x="${rx + (cols * (sw + gap)) / 2 - gap}" y="${ry - (v.seats >= v.alive && v.alive ? 66 : 6)}" text-anchor="middle" class="nf-raft-label">${v.seats}/${v.alive} places</text>`;
  return g + '</svg>';
}

/** Le calendrier : chaque jour passé avec sa météo ; l'ouragan, lui, ne prévient pas. */
function nfCalendar(v) {
  const icon = w => w === 'ouragan' ? '🌀' : ['☀️', '⛅', '🌦️', '🌧️'][w] || '';
  let h = '<div class="nf-cal">';
  (v.history || []).forEach((w, i) => { h += `<span class="nf-cal-day${i === v.history.length - 1 ? ' today' : ''}${w === 'ouragan' ? ' storm' : ''}"><small>J${i + 1}</small>${icon(w)}</span>`; });
  for (let i = 0; i < 3; i++) h += `<span class="nf-cal-day future"><small>J${v.day + i + 1}</small>?</span>`;
  return h + '</div>';
}

/** La carte d'un naufragé : initiale, nom, état, objets (dos de cartes, jamais leur contenu). */
function nfPersonCard(p, v) {
  const state = p.winner ? { k: 'win', t: '⛵ sur le radeau' } : !p.alive ? { k: 'dead', t: '✝ ' + (p.fate || 'hors jeu') } : p.sick ? { k: 'sick', t: `🤒 malade ${p.sick} j` } : v.phase === 'day' ? { k: p.done ? 'done' : 'wait', t: p.done ? '✓ a choisi' : '… réfléchit' } : v.phase === 'vote' ? { k: p.done ? 'done' : 'wait', t: p.done ? '✓ a voté' : '… hésite' } : { k: 'ok', t: 'en forme' };
  const hue = [...p.name].reduce((a, c) => a + c.charCodeAt(0), 0) * 47 % 360;
  return `<div class="nf-card ${state.k}${p.me ? ' me' : ''}${p.online ? '' : ' off'}"><span class="nf-avatar" style="--h:${hue}">${esc((p.name[0] || '?').toUpperCase())}</span>`
    + `<span class="nf-card-name">${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.me ? ' <small>(toi)</small>' : ''}</span><span class="nf-card-state">${esc(state.t)}</span>`
    + `<span class="nf-card-items">${'<i></i>'.repeat(Math.min(p.items, 5))}${p.items ? `<small>${p.items} objet${p.items > 1 ? 's' : ''}</small>` : ''}</span></div>`;
}

function renderNaufrages(v) {
  if (!v) return;
  const root = $('#nf-main'); root.innerHTML = ''; clearInterval(nfTimer);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me;

  // la réserve du camp : toujours visible
  const w = NF_WEATHER(v.weather);
  root.appendChild(el('div', 'nf-camp', `<div class="nf-day"><span class="nf-daynum">Jour <b>${v.day}</b></span><span class="nf-weather">${w.icon} ${w.text}</span></div>${nfScene(v)}${nfCalendar(v)}
    <div class="nf-stock"><span title="Poissons"><b>${v.food}</b>🐟</span><span title="Eau"><b>${v.water}</b>💧</span><span title="Bois"><b>${v.wood}</b>🪵</span><span class="nf-raft" title="Places sur le radeau"><b>${v.seats}</b>/${v.alive} places</span></div>
    <div class="nf-need">${v.alive} survivant${v.alive > 1 ? 's' : ''} : il faut ${v.alive} 🐟 et ${v.alive} 💧 chaque soir · encore ${v.woodToNext} 🪵 pour la prochaine place</div>`));

  if (me && !me.alive && v.phase !== 'over') root.appendChild(el('p', 'nf-ghost', `Tu es hors jeu (${esc(me.fate || '')}). Regarde la suite en silence.`));

  if (v.phase === 'day') {
    if (me?.canAct) {
      if (me.choice) root.appendChild(el('p', 'nf-hint', `Choix fait : ${NF_ACTIONS.find(a => a.key === me.choice.action).name}${me.choice.action === 'wood' && me.choice.risk ? `, en tentant ${me.choice.risk} de plus` : ''}. Tu peux encore changer. On attend les autres…`));
      else root.appendChild(el('p', 'nf-hint', 'Que fais-tu aujourd’hui ? Personne ne voit ton choix avant le soir.'));
      const g = el('div', 'nf-actions');
      NF_ACTIONS.forEach(a => {
        const b = el('button', 'nf-action' + (me.choice?.action === a.key ? ' on' : ''), `<span class="nf-action-icon">${a.icon}</span><b>${a.name}</b><small>${a.text}${a.key === 'fish' && me.boost.canne ? ' Canne prête : +2.' : ''}${a.key === 'wood' && me.boost.hache ? ' Hache prête : +3.' : ''}</small>`);
        b.type = 'button';
        b.onclick = () => act({ t: 'nf:choose', action: a.key, risk: a.key === 'wood' ? nfRisk : 0 });
        g.appendChild(b);
      });
      root.appendChild(g);
      const risk = el('div', 'nf-risk', `<span>Tenter de couper plus de bois :</span>`);
      [0, 1, 2, 3, 4, 5].forEach(r => {
        const b = btn('small' + (nfRisk === r ? ' on' : ' ghost'), r ? `+${r}` : 'non', () => { nfRisk = r; if (me.choice?.action === 'wood') act({ t: 'nf:choose', action: 'wood', risk: r }); else renderNaufrages(view.nf); });
        risk.appendChild(b);
      });
      risk.appendChild(el('small', 'nf-risk-note', nfRisk ? `Environ ${Math.round((1 - Math.pow(5 / 6, nfRisk)) * 100)} % de risque de morsure : malade deux jours, et pas de bois.` : 'Sans risque : 1 morceau.'));
      root.appendChild(risk);
    } else if (me?.alive && me.sick) root.appendChild(el('p', 'nf-hint', `Mordu par un serpent : tu te reposes encore ${me.sick} jour${me.sick > 1 ? 's' : ''}.`));
    const waiting = v.players.filter(p => p.alive && p.canAct && p.online && !p.done).map(p => p.name);
    root.appendChild(el('p', 'fine nf-wait', waiting.length ? `On attend : ${waiting.map(esc).join(', ')}` : ''));
  }

  if (v.phase === 'dusk') {
    const box = el('div', 'nf-report', '<p class="nf-report-title">La journée</p>');
    v.report.forEach(l => box.appendChild(el('p', 'nf-line', `<b>${esc(l.name)}</b> ${esc(l.text)}${l.item ? ` <span class="nf-secret">(tu trouves : ${esc(l.item)})</span>` : ''}`)));
    root.appendChild(box);
    root.appendChild(el('p', 'nf-hint', 'Le soir tombe : place au repas.'));
    if (v.isHost) root.appendChild(btn('primary lg', 'Passer au soir', () => act({ t: 'nf:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte passe au soir.'));
  }

  if (v.phase === 'vote' && v.vote) {
    if (v.flash) root.appendChild(el('div', 'nf-flash', `<p>${esc(v.flash.text)}</p>${v.flash.votes?.length ? `<small>${v.flash.votes.map(esc).join(' · ')}</small>` : ''}`));
    root.appendChild(el('div', 'nf-alarm', v.vote.reason === 'food' ? `<b>Pas assez de vivres</b><span>Il faut désigner ${v.vote.count > 1 ? `${v.vote.count} personnes` : 'quelqu’un'}. Discutez, puis votez.</span>` : `<b>Le radeau est trop petit</b><span>${v.vote.count > 1 ? `${v.vote.count} personnes restent` : 'Une personne reste'} sur l’île. Discutez, puis votez.</span>`));
    if (me?.alive) {
      const g = el('div', 'nf-pick');
      v.players.filter(p => p.alive).forEach(p => {
        const b = btn('nf-opt' + (v.vote.mine === p.id ? ' on' : '') + (v.vote.protected.includes(p.id) ? ' safe' : ''), esc(p.name) + (p.me ? ' (toi)' : ''), () => act({ t: 'nf:vote', target: p.id }));
        if (v.vote.protected.includes(p.id)) b.disabled = true;
        g.appendChild(b);
      });
      root.appendChild(g);
    }
    const bar = el('div', 'nf-timer'), i = el('i'); bar.appendChild(i); root.appendChild(bar);
    const t0 = Date.now(), left0 = v.vote.left; const paint = () => { i.style.width = Math.max(0, 100 * (left0 - (Date.now() - t0)) / 45000) + '%'; }; paint(); nfTimer = setInterval(paint, 250);
    root.appendChild(el('p', 'fine nf-wait', `${v.vote.done}/${v.alive} ont voté. Le plus désigné part ; à égalité, le hasard tranche.`));
    if (v.isHost) root.appendChild(btn('ghost small', 'Clore le vote maintenant', () => act({ t: 'nf:skip' })));
  } else if (v.flash && v.phase === 'day') root.appendChild(el('div', 'nf-flash', `<p>${esc(v.flash.text)}</p>${v.flash.votes?.length ? `<small>${v.flash.votes.map(esc).join(' · ')}</small>` : ''}`));

  if (v.phase === 'ready') {
    root.appendChild(el('div', 'nf-ready', '<b>Le radeau est prêt !</b><span>Assez de places et de vivres pour tout le monde. Partir maintenant, ou rester pour faire des réserves ?</span>'));
    if (v.isHost) { const r = el('div', 'nf-row'); r.append(btn('primary lg', 'Prendre la mer', () => act({ t: 'nf:leave' })), btn('ghost', 'Rester un jour de plus', () => act({ t: 'nf:stay' }))); root.appendChild(r); }
    else root.appendChild(el('p', 'note', 'L’hôte décide, après en avoir parlé avec tout le monde.'));
  }

  if (v.phase === 'over') {
    root.appendChild(el('div', 'nf-over' + (me?.won ? ' won' : ''), `<p class="nf-over-big">${me?.won ? 'Tu t’en sors !' : me ? 'Tu restes sur l’île…' : 'Fin de la partie'}</p><p>${esc(v.outcome || '')}</p>`));
    if (v.isHost) root.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
  }

  // mes objets
  if (me?.alive && me.items.length && v.phase !== 'over') {
    const box = el('div', 'nf-items', '<p class="eyebrow">Tes objets, secrets</p>');
    me.items.forEach((it, idx) => {
      const needTarget = it.key === 'pistolet' || it.key === 'antidote';
      const row = el('div', 'nf-item', `<b>${esc(it.name)}</b><span>${esc(it.text)}</span>`);
      if (it.key !== 'talisman') {
        if (nfUsing === idx && needTarget) {
          const g = el('div', 'nf-pick small');
          v.players.filter(p => p.alive && (it.key === 'antidote' || !p.me)).forEach(p => g.appendChild(btn('nf-opt', esc(p.name), () => { nfUsing = null; act({ t: 'nf:use', item: it.key, target: p.id }); })));
          g.appendChild(btn('ghost small', 'Annuler', () => { nfUsing = null; renderNaufrages(view.nf); }));
          row.appendChild(g);
        } else row.appendChild(btn('small', it.key === 'pistolet' ? 'Tirer' : 'Utiliser', () => { if (needTarget) { nfUsing = idx; renderNaufrages(view.nf); } else act({ t: 'nf:use', item: it.key }); }));
      }
      box.appendChild(row);
    });
    root.appendChild(box);
  }
  if (me?.peek?.length) root.appendChild(el('p', 'nf-peek', `Longue-vue : ${me.peek.map(x => NF_WEATHER(x).icon).join(' ')} les prochains jours`));

  // le camp
  const grid = el('div', 'nf-people');
  v.players.forEach(p => grid.insertAdjacentHTML('beforeend', nfPersonCard(p, v)));
  root.appendChild(grid);
  const lg = el('ul', 'nf-log'); v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t)))); root.appendChild(lg);
}
