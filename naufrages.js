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

  function create({ hostId, players, length }) {
    const [hmin, hmax] = length === 'court' ? [6, 8] : length === 'long' ? [10, 14] : [8, 11];
    const room = {
      hostId, phase: 'day', day: 0, length: length || 'normal',
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, inGame: p.online !== false, alive: true, sick: 0, items: [], boost: {}, fate: null })),
      food: 0, water: 0, wood: 0, bonusSeats: 0, weather: buildWeather(hmin, hmax), wreck: buildWreck(),
      choices: {}, report: [], vote: null, need: 0, winners: [], outcome: null, log: [], seq: 0, turnAt: Date.now(), peeks: {},
    };
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

  function tick(room) {
    const now = Date.now();
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
      weather: w, food: room.food, water: room.water, wood: room.wood, seats: seats(room), woodPerSeat: WOOD_PER_SEAT, woodToNext: WOOD_PER_SEAT - room.wood % WOOD_PER_SEAT,
      alive: n, canLeave: canLeave(room),
      me: me?.inGame ? { alive: me.alive, sick: me.sick, canAct: canAct(me), choice: room.choices[pid] || null, items: me.items.map(k => ({ key: k, ...ITEMS[k] })), boost: me.boost, peek: room.peeks[pid] || null, fate: me.fate, won: room.winners.includes(pid) } : null,
      players: room.players.filter(p => p.inGame).map(p => ({ id: p.id, name: p.name, alive: p.alive, sick: p.sick, online: p.online, me: p.id === pid, done: room.phase === 'day' ? !!room.choices[p.id] : room.phase === 'vote' ? !!room.vote?.votes[p.id] : false, items: p.items.length, fate: p.fate, winner: room.winners.includes(p.id), canAct: canAct(p) })),
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

function renderNaufrages(v) {
  if (!v) return;
  const root = $('#nf-main'); root.innerHTML = ''; clearInterval(nfTimer);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me;

  // la réserve du camp : toujours visible
  const w = NF_WEATHER(v.weather);
  root.appendChild(el('div', 'nf-camp', `<div class="nf-day"><span class="eyebrow">Jour ${v.day}</span><span class="nf-weather">${w.icon} ${w.text}</span></div>
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
  v.players.forEach(p => grid.appendChild(el('div', `nf-p${p.alive ? '' : ' dead'}${p.me ? ' me' : ''}${p.winner ? ' win' : ''}${p.online ? '' : ' off'}`, `<span class="nf-p-name">${esc(p.name)}</span><span class="nf-p-sub">${p.winner ? 'sur le radeau' : !p.alive ? esc(p.fate || 'hors jeu') : p.sick ? 'malade' : v.phase === 'day' ? (p.done ? 'a choisi' : '…') : v.phase === 'vote' ? (p.done ? 'a voté' : '…') : ''}${p.items ? ` · ${p.items} objet${p.items > 1 ? 's' : ''}` : ''}</span>`)));
  root.appendChild(grid);
  const lg = el('ul', 'nf-log'); v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t)))); root.appendChild(lg);
}
