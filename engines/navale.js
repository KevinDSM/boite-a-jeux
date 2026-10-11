/* Bataille navale — à deux (l'hôte et le premier ami arrivé), ou l'hôte contre le robot ; les autres regardent.

   Chacun place en secret sa flotte sur sa grille de 10 × 10 : porte-avions (5 cases), croiseur (4),
   contre-torpilleur (3), sous-marin (3) et torpilleur (2), à l'horizontale ou à la verticale, sans chevauchement.
   Puis on tire chacun son tour : « à l'eau », « touché », ou « coulé » quand toutes les cases d'un bateau
   sont touchées. En option, on rejoue tant qu'on touche. Le premier qui coule toute la flotte d'en face gagne.

   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.nv), actions « nv:… ».
   LA FLOTTE ADVERSE N'EST JAMAIS DANS TA VUE : seuls les tirs (publics) et les bateaux déjà coulés y sont,
   et les deux flottes ne se montrent qu'à la fin de la partie. */

'use strict';

const Navale = (() => {
  const N = 10, COLS = 'ABCDEFGHIJ';
  const SHIPS = [
    { k: 'pa', name: 'porte-avions', len: 5 }, { k: 'cr', name: 'croiseur', len: 4 }, { k: 'ct', name: 'contre-torpilleur', len: 3 },
    { k: 'sm', name: 'sous-marin', len: 3 }, { k: 'tp', name: 'torpilleur', len: 2 },
  ];
  const BOT_MS = [900, 1700], ABSENT_MS = 25000;
  const LEN = Object.fromEntries(SHIPS.map(s => [s.k, s.len])), NAME = Object.fromEntries(SHIPS.map(s => [s.k, s.name]));
  const label = (r, c) => `${COLS[c]}${r + 1}`;
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };
  const between = ([a, b]) => a + Math.random() * (b - a);
  const cellsOf = s => Array.from({ length: LEN[s.k] }, (_, i) => s.h ? [s.r, s.c + i] : [s.r + i, s.c]);
  const key = (r, c) => r * N + c;

  /** Une flotte valide : chaque bateau une fois, dans la grille, sans chevauchement. */
  function validFleet(ships) {
    if (!Array.isArray(ships) || ships.length !== SHIPS.length) return false;
    const seen = new Set(), taken = new Set();
    for (const s of ships) {
      if (!LEN[s?.k] || seen.has(s.k)) return false; seen.add(s.k);
      if (![s.r, s.c].every(x => Number.isInteger(x))) return false;
      for (const [r, c] of cellsOf(s)) { if (r < 0 || c < 0 || r >= N || c >= N || taken.has(key(r, c))) return false; taken.add(key(r, c)); }
    }
    return true;
  }
  /** Une flotte au hasard ; les bateaux ne se touchent pas (même en coin), pour une grille lisible. */
  function randomFleet() {
    for (let tries = 0; tries < 400; tries++) {
      const out = [], near = new Set(); let ok = true;
      for (const s of SHIPS) {
        let placed = false;
        for (let g = 0; g < 200 && !placed; g++) {
          const h = Math.random() < .5, r = Math.floor(Math.random() * (h ? N : N - s.len + 1)), c = Math.floor(Math.random() * (h ? N - s.len + 1 : N));
          const ship = { k: s.k, r, c, h }, cells = cellsOf(ship);
          if (cells.some(([a, b]) => near.has(key(a, b)))) continue;
          cells.forEach(([a, b]) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) near.add(key(a + i, b + j)); });
          out.push(ship); placed = true;
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) return out;
    }
    return SHIPS.map((s, i) => ({ k: s.k, r: i * 2, c: 0, h: true }));
  }

  function create({ hostId, players, rival, replay }) {
    const host = players.find(p => p.id === hostId) || players[0];
    const other = rival === 'robot' ? { id: 'bot0', name: 'Robot Amiral', bot: true, online: true } : players.find(p => p.id !== host.id && p.online !== false);
    const seat = p => ({ id: p.id, name: p.name, bot: !!p.bot, online: p.online !== false, fleet: null, ready: false, shots: {}, hits: 0 });
    const room = {
      hostId, phase: 'place', replay: replay !== false, seq: 0, log: [], turn: 0, turnAt: Date.now(), botAt: 0, winner: null, last: null, shotNo: 0,
      seats: [seat(host), seat(other)], watchers: players.filter(p => p.id !== host.id && p.id !== other.id).map(p => ({ id: p.id, name: p.name, online: p.online !== false })),
    };
    room.seats.forEach(s => { if (s.bot) { s.fleet = randomFleet().map(x => ({ ...x, hit: 0 })); s.ready = true; } });
    log(room, `${room.seats[0].name} contre ${room.seats[1].name}. Chacun place sa flotte.`);
    return room;
  }
  const seatOf = (room, pid) => room.seats.findIndex(s => s.id === pid);

  function setFleet(room, pid, ships) {
    const i = seatOf(room, pid);
    if (room.phase !== 'place' || i < 0) return null;
    const clean = Array.isArray(ships) ? ships.map(s => ({ k: String(s?.k || ''), r: +s?.r, c: +s?.c, h: !!s?.h })) : null;
    if (!validFleet(clean)) return 'Flotte incomplète ou mal placée';
    const s = room.seats[i]; s.fleet = clean.map(x => ({ ...x, hit: 0 })); s.ready = true; room.seq += 1;
    log(room, `${s.name} a placé sa flotte.`);
    if (room.seats.every(x => x.ready)) {
      room.phase = 'play'; room.turn = Math.random() < .5 ? 0 : 1; room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS);
      log(room, `Les flottes sont en place. ${room.seats[room.turn].name} tire le premier.`);
    }
    return null;
  }
  function unready(room, pid) {
    const i = seatOf(room, pid);
    if (room.phase !== 'place' || i < 0 || room.seats[i].bot) return null;
    room.seats[i].ready = false; room.seats[i].fleet = null; room.seq += 1; return null;
  }

  function shoot(room, pid, r, c) {
    if (room.phase !== 'play') return null;
    if (room.seats[room.turn].id !== pid) return 'Ce n’est pas ton tour';
    r = Math.round(+r); c = Math.round(+c);
    if (!(r >= 0 && r < N && c >= 0 && c < N)) return 'Case inconnue';
    const me = room.seats[room.turn], foe = room.seats[1 - room.turn], k = key(r, c);
    if (me.shots[k]) return 'Déjà visé';
    const ship = foe.fleet.find(s => cellsOf(s).some(([a, b]) => a === r && b === c));
    let res = 'm';
    if (ship) {
      ship.hit += 1; me.hits += 1; res = 'h';
      if (ship.hit >= LEN[ship.k]) { res = 's'; cellsOf(ship).forEach(([a, b]) => { me.shots[key(a, b)] = 's'; }); ship.sunk = true; }
    }
    if (res !== 's') me.shots[k] = res;
    room.shotNo += 1;
    room.last = { by: me.id, byName: me.name, r, c, at: label(r, c), res, ship: ship ? NAME[ship.k] : null, n: room.shotNo };
    log(room, `${me.name} tire en ${label(r, c)} : ${res === 'm' ? 'à l’eau' : res === 'h' ? 'touché' : `${NAME[ship.k]} coulé`}.`);
    if (foe.fleet.every(s => s.sunk)) {
      room.phase = 'over'; room.winner = me.id; log(room, `${me.name} coule toute la flotte de ${foe.name}.`);
    } else if (res === 'm' || !room.replay) room.turn = 1 - room.turn;
    room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS); room.seq += 1;
    return null;
  }

  // ------------------------------------------------------------ robots : chasse en damier, puis on suit les touchés
  function botShot(room) {
    const me = room.seats[room.turn], seen = k => !!me.shots[k];
    const hits = Object.keys(me.shots).filter(k => me.shots[k] === 'h').map(Number);
    const ok = (r, c) => r >= 0 && r < N && c >= 0 && c < N && !seen(key(r, c));
    let cand = [];
    if (hits.length) {
      const pts = hits.map(k => [Math.floor(k / N), k % N]);
      // deux touchés alignés : on prolonge la ligne
      for (const [r, c] of pts) for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (!pts.some(([a, b]) => a === r + dr && b === c + dc)) continue;
        let a = r, b = c; while (pts.some(([x, y]) => x === a && y === b)) { a -= dr; b -= dc; }
        if (ok(a, b)) cand.push([a, b]);
        a = r; b = c; while (pts.some(([x, y]) => x === a && y === b)) { a += dr; b += dc; }
        if (ok(a, b)) cand.push([a, b]);
      }
      if (!cand.length) pts.forEach(([r, c]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => { if (ok(r + dr, c + dc)) cand.push([r + dr, c + dc]); }));
    }
    if (!cand.length) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if ((r + c) % 2 === 0 && ok(r, c)) cand.push([r, c]);
    if (!cand.length) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (ok(r, c)) cand.push([r, c]);
    const [r, c] = cand[Math.floor(Math.random() * cand.length)];
    return shoot(room, me.id, r, c);
  }

  function tick(room) {
    if (room.phase !== 'play') return false;
    const s = room.seats[room.turn], now = Date.now();
    if (s.bot && now >= room.botAt) { botShot(room); return true; }
    if (!s.bot && !s.online && now - room.turnAt > ABSENT_MS) { log(room, `${s.name} est absent, le robot tire à sa place.`); botShot(room); return true; }
    return false;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'nv:fleet': return setFleet(room, pid, m.ships);
      case 'nv:edit': return unready(room, pid);
      case 'nv:shoot': return shoot(room, pid, m.r, m.c);
    }
    return null;
  }
  function join(room, id, name) {
    const s = room.seats.find(x => x.id === id), w = room.watchers.find(x => x.id === id);
    if (s) { s.online = true; s.name = name || s.name; } else if (w) { w.online = true; w.name = name || w.name; } else room.watchers.push({ id, name, online: true });
    room.seq += 1;
  }
  function setOnline(room, id, on) { const s = room.seats.find(x => x.id === id) || room.watchers.find(x => x.id === id); if (s) { s.online = on; room.seq += 1; } }

  // ------------------------------------------------------------ ce que voit chaque téléphone
  const grid = shots => Array.from({ length: N * N }, (_, k) => shots[k] || '');
  const sunkOf = seat => (seat.fleet || []).filter(s => s.sunk).map(({ k, r, c, h }) => ({ k, r, c, h }));
  function view(room, pid) {
    const i = seatOf(room, pid), over = room.phase === 'over';
    return {
      phase: room.phase, seq: room.seq, isHost: pid === room.hostId, replay: room.replay, shotNo: room.shotNo,
      me: i, turn: room.turn, myTurn: room.phase === 'play' && i === room.turn, since: room.turnAt,
      seats: room.seats.map((s, k) => ({
        id: s.id, name: s.name, bot: s.bot, online: s.online, ready: s.ready,
        shots: grid(s.shots),                                   // ses tirs sur l'autre : publics
        sunk: sunkOf(room.seats[1 - k]),                        // les bateaux qu'il a coulés chez l'autre : publics
        left: (s.fleet || []).filter(x => !x.sunk).length,
        fleet: (k === i || over) && s.fleet ? s.fleet.map(({ k: kk, r, c, h, hit, sunk }) => ({ k: kk, r, c, h, hit, sunk: !!sunk })) : null,   // SA flotte, à lui seul
      })),
      watchers: room.watchers.map(w => ({ id: w.id, name: w.name, online: w.online })),
      last: room.last, winner: room.winner, log: room.log.slice(-14),
    };
  }

  return { N, COLS, SHIPS, LEN, NAME, label, cellsOf, validFleet, randomFleet, create, act, tick, join, setOnline, view };
})();
if (typeof module !== 'undefined') module.exports = Navale;
