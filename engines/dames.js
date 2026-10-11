/* Jeu de dames — à deux (l'hôte et le premier ami arrivé), ou l'hôte contre le robot ; les autres regardent.

   Règles françaises (dames internationales) : damier de 10 × 10 (ou 8 × 8 en option, mêmes règles), 20 pions
   chacun (12 en 8 × 8) sur les cases foncées, les blancs commencent. Un pion avance d'une case en diagonale ;
   il prend en avant comme en arrière, en sautant une pièce adverse. LA PRISE EST OBLIGATOIRE, et il faut
   prendre le plus grand nombre de pièces possible (rafle) ; les pièces prises ne sont retirées qu'à la fin
   du coup et ne peuvent pas être sautées deux fois. Un pion qui TERMINE son coup sur la dernière rangée devient
   dame. La dame vole : elle se déplace et prend à n'importe quelle distance sur sa diagonale.
   On perd quand on ne peut plus jouer (plus de pièces, ou toutes bloquées). Nulle : même position trois fois,
   ou 25 coups de dames de chaque côté sans prise ni mouvement de pion.

   Même modèle que les autres jeux : la salle vit chez l'hôte (ou sur le serveur des salons, net.game.dm),
   actions « dm:… ». Rien n'est secret : chacun voit le damier ; seuls les coups possibles n'arrivent qu'au
   joueur dont c'est le tour. */

'use strict';

const Dames = (() => {
  // ------------------------------------------------------------ le damier
  // index = rangée × N + colonne, rangée 0 en haut (côté noirs). Cases jouables : (rangée + colonne) impaire.
  // Pièces : 'w' pion blanc, 'W' dame blanche, 'b' pion noir, 'B' dame noire, '' vide.
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const colorOf = p => !p ? null : p.toLowerCase();
  const isKing = p => p === 'W' || p === 'B';
  const dark = (N, i) => ((Math.floor(i / N) + i % N) & 1) === 1;

  function startBoard(N) {
    const rows = N === 8 ? 3 : 4, b = Array(N * N).fill('');
    for (let i = 0; i < N * N; i++) {
      if (!dark(N, i)) continue;
      const r = Math.floor(i / N);
      if (r < rows) b[i] = 'b'; else if (r >= N - rows) b[i] = 'w';
    }
    return b;
  }
  /** Numéro officiel d'une case foncée (1 à 50 en 10 × 10), pour la notation : 32-28, 19x30. */
  const num = (N, i) => Math.floor(i / N) * (N / 2) + Math.floor((i % N) / 2) + 1;

  /**
   * Tous les coups permis pour le camp « me ». Un coup = { path: [départ, arrêt1, …, arrivée], caps: [cases prises] }.
   * Prise obligatoire du plus grand nombre : si une rafle existe, seuls les coups au maximum de prises sont rendus.
   */
  function moves(b, N, me) {
    const caps = [], simple = [];
    const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
    for (let i = 0; i < N * N; i++) {
      const p = b[i]; if (colorOf(p) !== me) continue;
      const r0 = Math.floor(i / N), c0 = i % N, king = isKing(p), fwd = me === 'w' ? -1 : 1;
      // les rafles : on cherche en profondeur ; la pièce qui joue a quitté sa case (sa case de départ est libre)
      const dfs = (r, c, path, taken) => {
        let more = false;
        for (const [dr, dc] of DIRS) {
          if (!king) {
            const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
            if (!inside(lr, lc)) continue;
            const mid = mr * N + mc, land = lr * N + lc;
            if (colorOf(b[mid]) !== me && b[mid] && !taken.includes(mid) && (!b[land] || land === i)) {
              more = true; dfs(lr, lc, path.concat(land), taken.concat(mid));
            }
          } else {
            let k = 1, mr = r + dr, mc = c + dc;
            while (inside(mr, mc) && (!b[mr * N + mc] || mr * N + mc === i)) { k++; mr += dr; mc += dc; }
            if (!inside(mr, mc)) continue;
            const mid = mr * N + mc;
            if (colorOf(b[mid]) === me || taken.includes(mid)) continue;   // une pièce déjà prise bloque (coup turc)
            let lr = mr + dr, lc = mc + dc;
            while (inside(lr, lc) && (!b[lr * N + lc] || lr * N + lc === i)) {
              more = true; dfs(lr, lc, path.concat(lr * N + lc), taken.concat(mid));
              lr += dr; lc += dc;
            }
          }
        }
        if (!more && taken.length) caps.push({ path, caps: taken });
      };
      dfs(r0, c0, [i], []);
      if (caps.length) continue;                       // on ne cherche des coups simples que s'il n'y a aucune prise
      for (const [dr, dc] of DIRS) {
        if (!king) {
          if (dr !== fwd) continue;
          const r = r0 + dr, c = c0 + dc;
          if (inside(r, c) && !b[r * N + c]) simple.push({ path: [i, r * N + c], caps: [] });
        } else for (let r = r0 + dr, c = c0 + dc; inside(r, c) && !b[r * N + c]; r += dr, c += dc) simple.push({ path: [i, r * N + c], caps: [] });
      }
    }
    if (caps.length) {
      const most = Math.max(...caps.map(m => m.caps.length));
      // deux chemins différents vers la même arrivée en prenant les mêmes pièces : un seul coup
      const seen = new Set();
      return caps.filter(m => m.caps.length === most).filter(m => { const k = m.path[0] + '>' + m.path[m.path.length - 1] + ':' + m.caps.slice().sort((a, b) => a - b).join(','); if (seen.has(k)) return false; seen.add(k); return true; });
    }
    return simple;
  }

  /** Joue le coup sur une copie du damier (promotion seulement si le pion TERMINE sur la dernière rangée). */
  function apply(b, N, m) {
    const nb = b.slice(), from = m.path[0], to = m.path[m.path.length - 1], p = nb[from];
    nb[from] = ''; m.caps.forEach(x => { nb[x] = ''; });
    const r = Math.floor(to / N);
    nb[to] = p === 'w' && r === 0 ? 'W' : p === 'b' && r === N - 1 ? 'B' : p;
    return nb;
  }
  const note = (N, m) => m.caps.length ? m.path.map(i => num(N, i)).join('x') : `${num(N, m.path[0])}-${num(N, m.path[1])}`;

  // ------------------------------------------------------------ le robot : alpha-bêta
  function evaluate(b, N, me) {
    let s = 0;
    for (let i = 0; i < N * N; i++) {
      const p = b[i]; if (!p) continue;
      const r = Math.floor(i / N), c = i % N, w = colorOf(p) === 'w';
      let v;
      if (isKing(p)) v = N === 10 ? 330 : 260;
      else {
        const adv = w ? N - 1 - r : r;                          // rangées gagnées vers la promotion
        v = 100 + adv * 4 + (adv >= N - 3 ? 8 : 0);
        if (c > 1 && c < N - 2 && r > 1 && r < N - 2) v += 4;    // le centre
        if ((w && r === N - 1) || (!w && r === 0)) v += 6;       // la dernière ligne garde la promotion adverse
      }
      s += w ? v : -v;
    }
    return me === 'w' ? s : -s;
  }
  const WIN = 100000;
  function think(b, N, me, level = 2) {
    const LV = [null, { depth: 2, noise: 60, blunder: .2 }, { depth: 4, noise: 10 }, { depth: 7, noise: 0, ms: 1400 }][Math.max(1, Math.min(3, level))];
    const deadline = Date.now() + (LV.ms || 3000);
    let nodes = 0, stop = false;
    const opp = c => c === 'w' ? 'b' : 'w';
    const search = (bd, turn, depth, alpha, beta, ply) => {
      if ((++nodes & 511) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const ms = moves(bd, N, turn);
      if (!ms.length) return -WIN + ply;
      if (depth <= 0 && !ms[0].caps.length) return evaluate(bd, N, turn);   // on ne s'arrête pas au milieu d'un échange
      if (depth <= -6) return evaluate(bd, N, turn);
      let best = -WIN * 2;
      for (const m of ms) {
        const sc = -search(apply(bd, N, m), opp(turn), depth - 1, -beta, -alpha, ply + 1);
        if (sc > best) best = sc;
        if (sc > alpha) alpha = sc;
        if (alpha >= beta) break;
      }
      return best;
    };
    const all = moves(b, N, me);
    if (!all.length) return null;
    if (all.length === 1) return all[0];
    if (LV.blunder && Math.random() < LV.blunder) return all[Math.floor(Math.random() * all.length)];
    let best = all[0], scores = new Map();
    for (let d = 1; d <= LV.depth; d++) {
      let alpha = -WIN * 2, bestD = null, done = true;
      const sorted = all.slice().sort((x, y) => (scores.get(y) ?? 0) - (scores.get(x) ?? 0));
      for (const m of sorted) {
        const sc = -search(apply(b, N, m), opp(me), d - 1, -WIN * 2, -alpha + LV.noise * 2, 1) + (LV.noise ? (Math.random() - .5) * 2 * LV.noise : 0);
        if (stop) { done = false; break; }
        scores.set(m, sc);
        if (sc > alpha) { alpha = sc; bestD = m; }
      }
      if (done && bestD) best = bestD;
      if (stop) break;
    }
    return best;
  }

  // ------------------------------------------------------------ la partie
  const BOT_MS = [700, 1300], ABSENT_MS = 60000;
  const between = ([a, z]) => a + Math.random() * (z - a);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };
  const LEVELS = ['', 'Débutant', 'Moyen', 'Fort'];
  const key = (b, turn) => b.map(x => x || '.').join('') + turn;

  function create({ hostId, players, rival, level, color, size }) {
    const host = players.find(p => p.id === hostId) || players[0];
    const lv = Math.max(1, Math.min(3, +level || 2)), N = +size === 8 ? 8 : 10;
    const foe = rival === 'robot' ? { id: 'bot0', name: `Robot ${['', 'Pion', 'Rafle', 'Dame'][lv]}`, bot: true, online: true } : players.find(p => p.id !== host.id && p.online !== false);
    const hostWhite = color === 'blanc' ? true : color === 'noir' ? false : Math.random() < .5;
    const seat = (p, c) => ({ id: p.id, name: p.name, bot: !!p.bot, online: p.online !== false, color: c });
    const b = startBoard(N);
    const room = {
      hostId, phase: 'play', N, level: lv, seq: 0, log: [], b, turn: 'w', notes: [], keys: { [key(b, 'w')]: 1 }, quiet: 0, last: null, result: null,
      seats: hostWhite ? [seat(host, 'w'), seat(foe, 'b')] : [seat(foe, 'w'), seat(host, 'b')],
      watchers: players.filter(p => p.id !== host.id && p.id !== foe.id).map(p => ({ id: p.id, name: p.name, online: p.online !== false })),
      turnAt: Date.now(), botAt: 0, drawOffer: -1, past: [], vsBot: !!foe.bot,
    };
    room.botAt = room.turnAt + between(BOT_MS);
    log(room, `${room.seats[0].name} a les blancs, ${room.seats[1].name} les noirs. Damier de ${N} × ${N}.`);
    return room;
  }
  const seatOf = (room, pid) => room.seats.findIndex(s => s.id === pid);
  const turnIdx = room => room.turn === 'w' ? 0 : 1;
  function finish(room, winnerIdx, why) {
    room.phase = 'over'; room.drawOffer = -1;
    room.result = { winner: winnerIdx >= 0 ? room.seats[winnerIdx].id : null, why };
    const W = winnerIdx >= 0 ? room.seats[winnerIdx].name : '';
    log(room, { bloque: `Plus aucun coup possible. ${W} gagne.`, abandon: `Abandon. ${W} gagne.`, repetition: 'Même position trois fois : partie nulle.', dames: '25 coups de dames sans prise : partie nulle.', accord: 'Nulle d’un commun accord.' }[why]);
  }

  /** m.path : les cases du chemin (au moins départ et arrivée). Le coup doit correspondre à un coup permis, en entier. */
  function play(room, pid, m) {
    if (room.phase !== 'play') return null;
    const i = turnIdx(room);
    if (room.seats[i].id !== pid) return 'Ce n’est pas ton tour';
    const path = Array.isArray(m.path) ? m.path.map(Number) : [];
    const all = moves(room.b, room.N, room.turn);
    const same = x => x.path.length === path.length && x.path.every((v, k) => v === path[k]);
    const ends = x => x.path[0] === path[0] && x.path[x.path.length - 1] === path[path.length - 1];
    const mv = all.find(same) || (path.length === 2 ? all.filter(ends).length === 1 && all.find(ends) : null);
    if (!mv) return all.some(x => x.caps.length) ? `La prise est obligatoire : ${all[0].caps.length > 1 ? `prends ${all[0].caps.length} pièces` : 'prends'}.` : 'Ce coup n’est pas permis';
    if (room.vsBot && !room.seats[i].bot) room.past.push({ b: room.b, turn: room.turn, notes: room.notes.length, keys: { ...room.keys }, quiet: room.quiet, last: room.last });
    const piece = room.b[mv.path[0]];
    room.b = apply(room.b, room.N, mv);
    const n = note(room.N, mv);
    room.notes.push(n);
    room.last = { path: mv.path, caps: mv.caps, by: room.seats[i].id, n: room.notes.length, promo: !isKing(piece) && isKing(room.b[mv.path[mv.path.length - 1]]) };
    room.quiet = isKing(piece) && !mv.caps.length ? room.quiet + 1 : 0;
    room.turn = room.turn === 'w' ? 'b' : 'w';
    const k = key(room.b, room.turn); room.keys[k] = (room.keys[k] || 0) + 1;
    room.drawOffer = -1;
    log(room, `${room.seats[i].name} : ${n}${mv.caps.length > 1 ? ` (${mv.caps.length} prises)` : ''}${room.last.promo ? ', dame !' : ''}`);
    if (!moves(room.b, room.N, room.turn).length) finish(room, i, 'bloque');
    else if (room.keys[k] >= 3) finish(room, -1, 'repetition');
    else if (room.quiet >= 50) finish(room, -1, 'dames');
    room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS); room.seq += 1;
    return null;
  }
  function botMove(room, level) {
    const m = think(room.b, room.N, room.turn, level); if (!m) return false;
    play(room, room.seats[turnIdx(room)].id, { path: m.path }); return true;
  }
  function tick(room) {
    if (room.phase !== 'play') return false;
    const i = turnIdx(room), s = room.seats[i], now = Date.now();
    if (s.bot && now >= room.botAt) return botMove(room, room.level);
    if (!s.bot && !s.online && now - room.turnAt > ABSENT_MS) { log(room, `${s.name} est absent, le robot joue à sa place.`); return botMove(room, 2); }
    if (room.drawOffer >= 0 && room.seats[1 - room.drawOffer].bot && now >= room.botAt) {
      const meIdx = 1 - room.drawOffer;
      if (evaluate(room.b, room.N, room.seats[meIdx].color) <= -150) finish(room, -1, 'accord'); else { room.drawOffer = -1; log(room, `${room.seats[meIdx].name} refuse la nulle.`); }
      room.seq += 1; return true;
    }
    return false;
  }
  function act(room, pid, m) {
    const i = seatOf(room, pid);
    switch (m.t) {
      case 'dm:move': return play(room, pid, m);
      case 'dm:resign':
        if (room.phase !== 'play' || i < 0) return null;
        finish(room, 1 - i, 'abandon'); room.seq += 1; return null;
      case 'dm:draw':
        if (room.phase !== 'play' || i < 0) return null;
        if (room.drawOffer === 1 - i) { finish(room, -1, 'accord'); room.seq += 1; return null; }
        if (room.drawOffer === i) return null;
        room.drawOffer = i; room.botAt = Date.now() + between(BOT_MS); log(room, `${room.seats[i].name} propose la nulle.`); room.seq += 1; return null;
      case 'dm:draw-no':
        if (room.phase !== 'play' || i < 0 || room.drawOffer !== 1 - i) return null;
        room.drawOffer = -1; log(room, `${room.seats[i].name} refuse la nulle.`); room.seq += 1; return null;
      case 'dm:undo': {
        if (room.phase !== 'play' || i < 0 || !room.vsBot || !room.past.length) return null;
        const p = room.past.pop();
        room.b = p.b; room.turn = p.turn; room.notes.length = p.notes; room.keys = p.keys; room.quiet = p.quiet; room.last = p.last;
        room.drawOffer = -1; room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS) + 600;
        log(room, `${room.seats[i].name} reprend son coup.`); room.seq += 1; return null;
      }
    }
    return null;
  }
  function join(room, id, name) {
    const s = room.seats.find(x => x.id === id), w = room.watchers.find(x => x.id === id);
    if (s) { s.online = true; s.name = name || s.name; } else if (w) { w.online = true; w.name = name || w.name; } else room.watchers.push({ id, name, online: true });
    room.seq += 1;
  }
  function setOnline(room, id, on) { const s = room.seats.find(x => x.id === id) || room.watchers.find(x => x.id === id); if (s) { s.online = on; room.seq += 1; } }

  function view(room, pid) {
    const i = seatOf(room, pid), myTurn = room.phase === 'play' && i === turnIdx(room);
    const count = c => room.b.filter(p => colorOf(p) === c).length, kings = c => room.b.filter(p => p === c.toUpperCase()).length;
    const all = room.phase === 'play' ? moves(room.b, room.N, room.turn) : [];
    return {
      phase: room.phase, seq: room.seq, isHost: pid === room.hostId, me: i, turn: room.turn, myTurn, since: room.turnAt, N: room.N,
      board: room.b, moves: myTurn ? all.map(m => ({ path: m.path, caps: m.caps })) : [], mustTake: all.length ? all[0].caps.length : 0,
      last: room.last, notes: room.notes, pieces: { w: count('w'), b: count('b') }, kings: { w: kings('w'), b: kings('b') }, start: room.N === 8 ? 12 : 20,
      seats: room.seats.map(s => ({ id: s.id, name: s.name, bot: s.bot, online: s.online, color: s.color })),
      drawOffer: room.drawOffer, canUndo: room.vsBot && i >= 0 && room.past.length > 0 && room.phase === 'play',
      level: room.level, vsBot: room.vsBot, result: room.result, quiet: room.quiet,
      watchers: room.watchers.map(w => ({ id: w.id, name: w.name, online: w.online })), log: room.log.slice(-16),
    };
  }

  return { LEVELS, startBoard, moves, apply, num, note, evaluate, think, create, act, tick, join, setOnline, view };
})();
if (typeof module !== 'undefined') module.exports = Dames;
