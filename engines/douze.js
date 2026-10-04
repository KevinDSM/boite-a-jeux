/* Douze — l'équivalent maison du jeu des douze cartes : une grille de 3 × 4 cartes face cachée par
   joueur, on échange et on retourne pour finir avec le total le plus bas.

   150 cartes : -2 (× 5), -1 (× 10), 0 (× 15), 1 à 12 (× 10 chacune). À ton tour : pioche ou prends le
   dessus de la défausse ; une carte prise dans la défausse s'échange forcément avec une de tes cartes,
   une carte piochée peut aussi être défaussée, tu retournes alors une carte cachée. Trois cartes
   identiques face visible dans une colonne : la colonne disparaît. Quand un joueur a tout retourné,
   les autres jouent un dernier tour ; s'il n'a pas strictement le plus petit total, son score double.
   La partie s'arrête quand quelqu'un atteint 100 points : le plus bas gagne.
   Même modèle que Chromo : la salle vit chez l'hôte (net.game.dz), les actions arrivent en « dz:… »,
   les robots jouent dans le tick de l'hôte.
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, net et view. */

'use strict';

const Douze = (() => {
  const COLS = 4, ROWS = 3, N = 12;
  const BOT_NAMES = ['Robot Nuage', 'Robot Cumulus', 'Robot Cirrus', 'Robot Stratus'];
  const BOT_DELAY = 1000;
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

  function buildDeck() {
    const d = [];
    for (let k = 0; k < 5; k++) d.push(-2);
    for (let k = 0; k < 10; k++) d.push(-1);
    for (let k = 0; k < 15; k++) d.push(0);
    for (let v = 1; v <= 12; v++) for (let k = 0; k < 10; k++) d.push(v);
    return shuffle(d);
  }

  const pl = (room, id) => room.players.find(p => p.id === id);
  const current = room => pl(room, room.order[room.turn]);
  const cells = p => p.grid.filter(Boolean);
  const upSum = p => cells(p).filter(c => c.up).reduce((s, c) => s + c.v, 0);
  const fullSum = p => cells(p).reduce((s, c) => s + c.v, 0);
  const allUp = p => cells(p).every(c => c.up);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };

  function drawCard(room) {
    if (!room.draw.length) { const top = room.discard.pop(); room.draw = shuffle(room.discard); room.discard = top === undefined ? [] : [top]; }
    return room.draw.pop();
  }

  function create({ hostId, players, target, bots }) {
    const room = {
      hostId, phase: 'reveal', round: 0, target: clamp(target, 20, 500, 100),
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: false, score: 0, grid: [], inRound: false, lastRound: null })),
      order: [], turn: 0, draw: [], discard: [], taken: null, mustFlip: false, closerId: null, log: [], result: null, seq: 0, turnAt: Date.now(), botAt: 0,
    };
    const nb = clamp(bots, 0, 4, 0);
    for (let i = 0; i < nb; i++) room.players.push({ id: 'bot' + i, name: BOT_NAMES[i], online: true, bot: true, score: 0, grid: [], inRound: false, lastRound: null });
    startRound(room);
    return room;
  }

  function startRound(room) {
    room.round += 1;
    room.draw = buildDeck(); room.discard = [];
    room.order = room.players.filter(p => p.online).map(p => p.id);
    room.players.forEach(p => { p.inRound = room.order.includes(p.id); p.grid = p.inRound ? Array.from({ length: N }, () => ({ v: room.draw.pop(), up: false })) : []; p.lastRound = null; });
    room.discard.push(room.draw.pop());
    room.phase = 'reveal'; room.taken = null; room.mustFlip = false; room.closerId = null; room.result = null; room.turn = 0;
    room.turnAt = Date.now(); room.seq += 1;
    room.log = [`Manche ${room.round}. Chacun retourne deux cartes.`];
  }

  function beginPlay(room) {
    // le plus haut total visible commence
    let best = null, bestSum = -Infinity;
    room.order.forEach((id, i) => { const s = upSum(pl(room, id)); if (s > bestSum) { bestSum = s; best = i; } });
    room.turn = best ?? 0; room.phase = 'play'; room.turnAt = Date.now(); room.seq += 1;
    log(room, `${current(room).name} commence, avec le plus haut total visible.`);
  }

  function checkColumns(room, p) {
    let removed = 0;
    for (let c = 0; c < COLS; c++) {
      const col = [0, 1, 2].map(r => p.grid[r * COLS + c]);
      if (col.every(x => x && x.up) && col[0].v === col[1].v && col[0].v === col[2].v) {
        col.forEach(x => room.discard.push(x.v));
        [0, 1, 2].forEach(r => p.grid[r * COLS + c] = null);
        removed += 1;
        log(room, `${p.name} aligne trois ${col[0].v}, la colonne disparaît.`);
      }
    }
    return removed;
  }

  function flip(room, pid, i) {
    const p = pl(room, pid); if (!p || !p.inRound) return null;
    const cell = p.grid[i]; if (!cell || cell.up) return null;
    if (room.phase === 'reveal') {
      if (cells(p).filter(c => c.up).length >= 2) return null;
      cell.up = true; room.seq += 1;
      if (room.order.every(id => cells(pl(room, id)).filter(c => c.up).length >= 2 || !pl(room, id).online)) beginPlay(room);
      return null;
    }
    if (room.phase !== 'play' || current(room)?.id !== pid || !room.mustFlip) return null;
    cell.up = true; room.mustFlip = false;
    checkColumns(room, p);
    endTurn(room);
    return null;
  }

  function draw(room, pid) {
    if (room.phase !== 'play' || current(room)?.id !== pid || room.taken || room.mustFlip) return null;
    room.taken = { v: drawCard(room), from: 'draw' }; room.seq += 1; room.turnAt = Date.now();
    return null;
  }
  function take(room, pid) {
    if (room.phase !== 'play' || current(room)?.id !== pid || room.taken || room.mustFlip || !room.discard.length) return null;
    room.taken = { v: room.discard.pop(), from: 'discard' }; room.seq += 1; room.turnAt = Date.now();
    return null;
  }
  function swap(room, pid, i) {
    if (room.phase !== 'play' || current(room)?.id !== pid || !room.taken) return null;
    const p = current(room), cell = p.grid[i]; if (!cell) return null;
    room.discard.push(cell.v);
    p.grid[i] = { v: room.taken.v, up: true };
    log(room, `${p.name} pose un ${room.taken.v}${cell.up ? ` à la place d’un ${cell.v}` : ' sur une carte cachée'}.`);
    room.taken = null;
    checkColumns(room, p);
    endTurn(room);
    return null;
  }
  function discard(room, pid) {
    if (room.phase !== 'play' || current(room)?.id !== pid || !room.taken) return null;
    if (room.taken.from !== 'discard') { /* ok */ } else return 'Une carte prise dans la défausse doit être posée';
    const p = current(room);
    room.discard.push(room.taken.v); log(room, `${p.name} défausse un ${room.taken.v}.`); room.taken = null;
    if (cells(p).some(c => !c.up)) { room.mustFlip = true; room.seq += 1; room.turnAt = Date.now(); return null; }
    endTurn(room);
    return null;
  }

  function endTurn(room) {
    const p = current(room);
    if (!room.closerId && allUp(p)) { room.closerId = p.id; log(room, `${p.name} a tout retourné. Dernier tour pour les autres.`); }
    // au suivant, en sautant les absents ; la manche finit quand le tour revient à celui qui a fermé
    const n = room.order.length; let guard = 0;
    do { room.turn = (room.turn + 1) % n; guard++; } while (guard < n && !pl(room, current(room).id).online && current(room).id !== room.closerId);
    room.taken = null; room.mustFlip = false; room.turnAt = Date.now(); room.seq += 1;
    if (room.closerId && current(room).id === room.closerId) endRound(room);
  }

  function endRound(room) {
    const closer = pl(room, room.closerId);
    const rows = room.order.map(id => { const p = pl(room, id); cells(p).forEach(c => c.up = true); checkColumns(room, p); return { id, name: p.name, raw: fullSum(p) }; });
    const min = Math.min(...rows.filter(r => r.id !== closer.id).map(r => r.raw), Infinity);
    rows.forEach(r => {
      r.doubled = r.id === closer.id && r.raw > 0 && r.raw >= min && rows.length > 1;
      r.points = r.doubled ? r.raw * 2 : r.raw;
      const p = pl(room, r.id); p.score += r.points; p.lastRound = r.points;
    });
    const over = room.players.some(p => p.score >= room.target);
    room.result = { closerId: closer.id, closerName: closer.name, rows: rows.sort((a, b) => a.points - b.points), over };
    room.phase = over ? 'over' : 'result'; room.seq += 1;
    log(room, `Fin de la manche ${room.round}.`);
  }

  function hostSkip(room, pid) {
    if (pid !== room.hostId || room.phase !== 'play') return null;
    const p = current(room); if (!p || p.bot) return null;
    if (room.taken) { room.discard.push(room.taken.v); room.taken = null; }
    if (room.mustFlip) { const hidden = p.grid.findIndex(c => c && !c.up); if (hidden >= 0) p.grid[hidden].up = true; room.mustFlip = false; }
    log(room, `L’hôte passe le tour de ${p.name}.`);
    endTurn(room);
    return null;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'dz:flip': return flip(room, pid, m.i);
      case 'dz:draw': return draw(room, pid);
      case 'dz:take': return take(room, pid);
      case 'dz:swap': return swap(room, pid, m.i);
      case 'dz:discard': return discard(room, pid);
      case 'dz:skip': return hostSkip(room, pid);
      case 'dz:next':
        if (pid !== room.hostId || room.phase !== 'result') return null;
        if (room.players.filter(p => p.online).length < 2) return 'Il faut au moins deux joueurs ou robots';
        startRound(room); return null;
    }
    return null;
  }

  // ------------------------------------------------------------ robots
  function botTurn(room, bot) {
    const g = bot.grid;
    const hidden = g.map((c, i) => c && !c.up ? i : -1).filter(i => i >= 0);
    const upCells = g.map((c, i) => c && c.up ? { i, v: c.v } : null).filter(Boolean);
    const highest = upCells.sort((a, b) => b.v - a.v)[0];
    // une carte qui complète une colonne vaut toujours le coup
    const columnSlot = v => {
      for (let c = 0; c < COLS; c++) {
        const col = [0, 1, 2].map(r => ({ i: r * COLS + c, cell: g[r * COLS + c] }));
        if (col.some(x => !x.cell)) continue;
        const same = col.filter(x => x.cell.up && x.cell.v === v);
        if (same.length === 2) { const slot = col.find(x => !(x.cell.up && x.cell.v === v)); if (!slot.cell.up || slot.cell.v > v) return slot.i; }
      }
      return -1;
    };
    const place = v => {
      const cs = columnSlot(v); if (cs >= 0) return cs;
      if (highest && highest.v > v && highest.v - v >= 2) return highest.i;
      if (hidden.length && v <= 4) return hidden[Math.random() * hidden.length | 0];
      return -1;
    };
    if (room.mustFlip) { flip(room, bot.id, hidden[Math.random() * hidden.length | 0]); return; }
    if (!room.taken) {
      const top = room.discard[room.discard.length - 1];
      if (top !== undefined && place(top) >= 0 && top <= 5) take(room, bot.id); else draw(room, bot.id);
      return;
    }
    const slot = place(room.taken.v);
    if (slot >= 0) swap(room, bot.id, slot);
    else if (room.taken.from === 'discard') swap(room, bot.id, highest ? highest.i : hidden[0]);
    else discard(room, bot.id);
  }

  function tick(room) {
    const now = Date.now();
    if (room.phase === 'reveal') {
      let changed = false;
      room.players.filter(p => p.bot && p.inRound).forEach(b => { while (cells(b).filter(c => c.up).length < 2) { const hidden = b.grid.map((c, i) => c && !c.up ? i : -1).filter(i => i >= 0); flip(room, b.id, hidden[Math.random() * hidden.length | 0]); changed = true; } });
      return changed;
    }
    if (room.phase !== 'play') return false;
    const cur = current(room);
    if (!cur?.bot || now - room.turnAt < BOT_DELAY) return false;
    botTurn(room, cur); room.turnAt = now;
    return true;
  }

  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, bot: false, score: 0, grid: [], inRound: false, lastRound: null });   // jouera à la manche suivante
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p || p.bot) return;
    p.online = on;
    if (on) return;
    if (room.phase === 'reveal' && room.order.every(q => cells(pl(room, q)).filter(c => c.up).length >= 2 || !pl(room, q).online)) beginPlay(room);
    else if (room.phase === 'play' && current(room)?.id === id) { if (room.taken) { room.discard.push(room.taken.v); room.taken = null; } room.mustFlip = false; endTurn(room); }
  }

  /** Vue : toutes les cartes visibles le sont pour tout le monde, les cachées restent cachées. */
  function view(room, pid) {
    const me = pl(room, pid), cur = current(room), myTurn = room.phase === 'play' && cur?.id === pid;
    const gridOf = p => p.grid.map(c => c ? (c.up ? { v: c.v, up: true } : { up: false }) : null);
    return {
      phase: room.phase, round: room.round, target: room.target, seq: room.seq, isHost: pid === room.hostId,
      me: me && me.inRound ? { inRound: true, grid: gridOf(me), upCount: cells(me).filter(c => c.up).length, sum: upSum(me) } : { inRound: false, grid: [], upCount: 0, sum: 0 },
      players: room.order.map(id => { const p = pl(room, id); return { id, name: p.name, bot: p.bot, online: p.online, me: id === pid, current: id === cur?.id && room.phase === 'play', grid: gridOf(p), sum: upSum(p), upCount: cells(p).filter(c => c.up).length, total: cells(p).length, score: p.score, closer: id === room.closerId, revealed: cells(p).filter(c => c.up).length >= 2 }; }),
      waiting: room.players.filter(p => !p.inRound && p.online).map(p => p.name),
      currentId: cur?.id || null, currentName: cur?.name || '', myTurn,
      taken: room.taken, mustFlip: room.mustFlip, top: room.discard.length ? room.discard[room.discard.length - 1] : null, drawLeft: room.draw.length,
      closerName: room.closerId ? pl(room, room.closerId).name : null, quiet: Date.now() - room.turnAt,
      result: room.result, scores: [...room.players].filter(p => p.inRound || p.score).sort((a, b) => a.score - b.score).map(p => ({ id: p.id, name: p.name, score: p.score, last: p.lastRound, bot: p.bot })),
      log: room.log.slice(-4),
    };
  }

  return { COLS, ROWS, buildDeck, create, act, tick, join, setOnline, view };
})();
