/* Échecs — à deux (l'hôte et le premier ami arrivé), ou l'hôte contre le robot ; les autres regardent.

   Toutes les règles : roque (petit et grand), prise en passant, promotion au choix, échec, échec et mat, pat,
   nulle par répétition (trois fois la même position), par la règle des 50 coups et par matériel insuffisant,
   abandon et nulle proposée. Pendule en option (chacun son temps, le temps écoulé fait perdre).
   Le robot cherche ses coups par alpha-bêta (Débutant, Moyen, Fort) ; il ne joue qu'au tour de son camp.

   Même modèle que les autres jeux : la salle vit chez l'hôte (ou sur le serveur des salons, net.game.ec),
   actions « ec:… ». Rien n'est secret aux échecs : chacun voit l'échiquier ; seuls les coups possibles
   n'arrivent qu'au joueur dont c'est le tour. */

'use strict';

const Echecs = (() => {
  // ------------------------------------------------------------ l'échiquier
  // 64 cases, index = rangée × 8 + colonne ; rangée 0 = la 8e (en haut côté blancs), colonne 0 = a.
  // Pièces : 'P N B R Q K' pour les blancs, 'p n b r q k' pour les noirs, '' pour une case vide.
  const FILES = 'abcdefgh';
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const sqName = i => FILES[i & 7] + (8 - (i >> 3));
  const sqIndex = s => (typeof s === 'string' && /^[a-h][1-8]$/.test(s)) ? (8 - +s[1]) * 8 + FILES.indexOf(s[0]) : -1;
  const side = p => !p ? null : p === p.toUpperCase() ? 'w' : 'b';
  const other = c => c === 'w' ? 'b' : 'w';
  const NAME_FR = { P: 'pion', N: 'cavalier', B: 'fou', R: 'tour', Q: 'dame', K: 'roi' };
  const LETTER_FR = { N: 'C', B: 'F', R: 'T', Q: 'D', K: 'R' };   // notation française : Cavalier, Fou, Tour, Dame, Roi

  function fromFEN(fen) {
    const [rows, turn, castle, ep, half, full] = fen.split(' ');
    const b = [];
    for (const ch of rows.replace(/\//g, '')) { if (/\d/.test(ch)) for (let i = 0; i < +ch; i++) b.push(''); else b.push(ch); }
    return { b, turn: turn || 'w', castle: castle === '-' ? '' : castle || '', ep: ep && ep !== '-' ? sqIndex(ep) : -1, half: +half || 0, full: +full || 1 };
  }
  function toFEN(pos) {
    let out = '';
    for (let r = 0; r < 8; r++) {
      let n = 0;
      for (let c = 0; c < 8; c++) { const p = pos.b[r * 8 + c]; if (!p) n++; else { if (n) out += n; n = 0; out += p; } }
      if (n) out += n; if (r < 7) out += '/';
    }
    return `${out} ${pos.turn} ${pos.castle || '-'} ${pos.ep >= 0 ? sqName(pos.ep) : '-'} ${pos.half} ${pos.full}`;
  }

  // ------------------------------------------------------------ attaques et coups
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const at = (b, r, c) => (r < 0 || r > 7 || c < 0 || c > 7) ? undefined : b[r * 8 + c];

  /** La case sq est-elle attaquée par le camp by ? */
  function attacked(b, sq, by) {
    const r = sq >> 3, c = sq & 7, up = by === 'w';
    const P = up ? 'P' : 'p', N = up ? 'N' : 'n', B = up ? 'B' : 'b', R = up ? 'R' : 'r', Q = up ? 'Q' : 'q', K = up ? 'K' : 'k';
    const pr = up ? r + 1 : r - 1;                       // un pion blanc attaque vers le haut : il se trouve en dessous
    if (at(b, pr, c - 1) === P || at(b, pr, c + 1) === P) return true;
    for (const [dr, dc] of KN) if (at(b, r + dr, c + dc) === N) return true;
    for (const [dr, dc] of KG) if (at(b, r + dr, c + dc) === K) return true;
    for (const [dr, dc] of DIAG) for (let k = 1; ; k++) { const p = at(b, r + dr * k, c + dc * k); if (p === undefined) break; if (p) { if (p === B || p === Q) return true; break; } }
    for (const [dr, dc] of ORTH) for (let k = 1; ; k++) { const p = at(b, r + dr * k, c + dc * k); if (p === undefined) break; if (p) { if (p === R || p === Q) return true; break; } }
    return false;
  }
  const kingSq = (b, color) => b.indexOf(color === 'w' ? 'K' : 'k');
  const inCheck = (pos, color) => { const k = kingSq(pos.b, color); return k >= 0 && attacked(pos.b, k, other(color)); };

  /** Les coups « pseudo-légaux » (le roi peut rester en échec : on filtre après). m = {f, t, p (promotion), x (prise), k ('ep' | 'oo' | 'ooo' | 'dbl')} */
  function pseudo(pos, capturesOnly = false) {
    const out = [], b = pos.b, me = pos.turn;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p || side(p) !== me) continue;
      const r = i >> 3, c = i & 7, T = p.toUpperCase();
      const add = (t, extra = {}) => out.push({ f: i, t, x: b[t] || '', ...extra });
      if (T === 'P') {
        const dir = me === 'w' ? -1 : 1, last = me === 'w' ? 0 : 7, home = me === 'w' ? 6 : 1;
        const push = (t, x, extra = {}) => { if ((t >> 3) === last) for (const q of 'QRBN') out.push({ f: i, t, x, p: me === 'w' ? q : q.toLowerCase(), ...extra }); else out.push({ f: i, t, x, ...extra }); };
        const one = at(b, r + dir, c);
        if (!capturesOnly && one === '') {
          push((r + dir) * 8 + c, '');
          if (r === home && at(b, r + 2 * dir, c) === '') out.push({ f: i, t: (r + 2 * dir) * 8 + c, x: '', k: 'dbl' });
        } else if (capturesOnly && one === '' && (r + dir) === last) push((r + dir) * 8 + c, '');   // une promotion compte comme coup « violent »
        for (const dc of [-1, 1]) {
          const q = at(b, r + dir, c + dc), t = (r + dir) * 8 + c + dc;
          if (q === undefined) continue;
          if (q && side(q) !== me) push(t, q);
          else if (!q && t === pos.ep) out.push({ f: i, t, x: me === 'w' ? 'p' : 'P', k: 'ep' });
        }
      } else if (T === 'N' || T === 'K') {
        for (const [dr, dc] of (T === 'N' ? KN : KG)) {
          const q = at(b, r + dr, c + dc); if (q === undefined) continue;
          if (!q) { if (!capturesOnly) add((r + dr) * 8 + c + dc); } else if (side(q) !== me) add((r + dr) * 8 + c + dc);
        }
        if (T === 'K' && !capturesOnly) {
          const rights = pos.castle, row = me === 'w' ? 7 : 0, kk = me === 'w' ? 'K' : 'k', qq = me === 'w' ? 'Q' : 'q', R = me === 'w' ? 'R' : 'r';
          if (i === row * 8 + 4 && !attacked(b, i, other(me))) {
            if (rights.includes(kk) && b[row * 8 + 7] === R && !b[row * 8 + 5] && !b[row * 8 + 6] && !attacked(b, row * 8 + 5, other(me)) && !attacked(b, row * 8 + 6, other(me)))
              out.push({ f: i, t: row * 8 + 6, x: '', k: 'oo' });
            if (rights.includes(qq) && b[row * 8] === R && !b[row * 8 + 1] && !b[row * 8 + 2] && !b[row * 8 + 3] && !attacked(b, row * 8 + 3, other(me)) && !attacked(b, row * 8 + 2, other(me)))
              out.push({ f: i, t: row * 8 + 2, x: '', k: 'ooo' });
          }
        }
      } else {
        const dirs = T === 'B' ? DIAG : T === 'R' ? ORTH : DIAG.concat(ORTH);
        for (const [dr, dc] of dirs) for (let k = 1; ; k++) {
          const q = at(b, r + dr * k, c + dc * k); if (q === undefined) break;
          if (!q) { if (!capturesOnly) add((r + dr * k) * 8 + c + dc * k); continue; }
          if (side(q) !== me) add((r + dr * k) * 8 + c + dc * k);
          break;
        }
      }
    }
    return out;
  }

  /** Joue le coup m sur une copie de la position. */
  function make(pos, m) {
    const b = pos.b.slice(), me = pos.turn, p = b[m.f];
    b[m.t] = m.p || p; b[m.f] = '';
    if (m.k === 'ep') b[m.t + (me === 'w' ? 8 : -8)] = '';
    if (m.k === 'oo') { b[m.t - 1] = b[m.t + 1]; b[m.t + 1] = ''; }
    if (m.k === 'ooo') { b[m.t + 1] = b[m.t - 2]; b[m.t - 2] = ''; }
    let castle = pos.castle;
    if (castle) {
      if (p === 'K') castle = castle.replace(/[KQ]/g, ''); if (p === 'k') castle = castle.replace(/[kq]/g, '');
      const off = sq => { if (sq === 63) castle = castle.replace('K', ''); if (sq === 56) castle = castle.replace('Q', ''); if (sq === 7) castle = castle.replace('k', ''); if (sq === 0) castle = castle.replace('q', ''); };
      off(m.f); off(m.t);
    }
    const pawn = p === 'P' || p === 'p';
    return { b, turn: other(me), castle, ep: m.k === 'dbl' ? (m.f + m.t) >> 1 : -1, half: pawn || m.x ? 0 : pos.half + 1, full: pos.full + (me === 'b' ? 1 : 0) };
  }

  function legal(pos) { return pseudo(pos).filter(m => !inCheck(make(pos, m), pos.turn)); }

  /** La clé d'une position pour la répétition : pièces, trait, roques, et la case en passant seulement si une prise est possible. */
  function posKey(pos) {
    let ep = '-';
    if (pos.ep >= 0) { const pawn = pos.turn === 'w' ? 'P' : 'p', r = pos.ep >> 3, c = pos.ep & 7, fr = pos.turn === 'w' ? r + 1 : r - 1; if (at(pos.b, fr, c - 1) === pawn || at(pos.b, fr, c + 1) === pawn) ep = sqName(pos.ep); }
    return pos.b.map(x => x || '.').join('') + pos.turn + (pos.castle || '-') + ep;
  }
  /** Matériel insuffisant pour mater : roi seul, roi + fou, roi + cavalier, ou fous de même couleur de cases. */
  function insufficient(b) {
    const rest = [];
    for (let i = 0; i < 64; i++) { const p = b[i]; if (p && p.toUpperCase() !== 'K') rest.push([p.toUpperCase(), i]); }
    if (!rest.length) return true;
    if (rest.some(([p]) => p === 'P' || p === 'R' || p === 'Q')) return false;
    if (rest.length === 1) return true;
    if (rest.every(([p]) => p === 'B')) { const col = i => ((i >> 3) + (i & 7)) % 2; return rest.every(([, i]) => col(i) === col(rest[0][1])); }
    return false;
  }

  /** Notation française : Cf3, Dxe5+, exd6, O-O, e8=D#. */
  function san(pos, m, all) {
    const p = pos.b[m.f], T = p.toUpperCase();
    let s;
    if (m.k === 'oo') s = 'O-O'; else if (m.k === 'ooo') s = 'O-O-O';
    else if (T === 'P') s = (m.x ? FILES[m.f & 7] + 'x' : '') + sqName(m.t) + (m.p ? '=' + LETTER_FR[m.p.toUpperCase()] : '');
    else {
      const twins = all.filter(o => o !== m && o.t === m.t && pos.b[o.f] === p && o.f !== m.f);
      let dis = '';
      if (twins.length) {
        const sameFile = twins.some(o => (o.f & 7) === (m.f & 7)), sameRank = twins.some(o => (o.f >> 3) === (m.f >> 3));
        dis = !sameFile ? FILES[m.f & 7] : !sameRank ? String(8 - (m.f >> 3)) : sqName(m.f);
      }
      s = LETTER_FR[T] + dis + (m.x ? 'x' : '') + sqName(m.t);
    }
    const next = make(pos, m);
    if (inCheck(next, next.turn)) s += legal(next).length ? '+' : '#';
    return s;
  }

  // ------------------------------------------------------------ le robot : alpha-bêta, avec un peu de hasard selon le niveau
  const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  // tables de placement, vues du côté des blancs (rangée 0 = la 8e)
  const PST = {
    P: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    N: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    B: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    R: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    Q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    K: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    KE: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };
  /** Évaluation statique, du point de vue du camp qui a le trait (en centièmes de pion). */
  function evaluate(pos) {
    let s = 0, mat = 0;
    for (let i = 0; i < 64; i++) { const p = pos.b[i]; if (p && p.toUpperCase() !== 'K' && p.toUpperCase() !== 'P') mat += VAL[p.toUpperCase()]; }
    const endgame = mat <= 1300;
    for (let i = 0; i < 64; i++) {
      const p = pos.b[i]; if (!p) continue;
      const T = p.toUpperCase(), w = p === T, idx = w ? i : (7 - (i >> 3)) * 8 + (i & 7);
      const v = VAL[T] + PST[T === 'K' && endgame ? 'KE' : T][idx];
      s += w ? v : -v;
    }
    return pos.turn === 'w' ? s : -s;
  }
  const MATE = 100000;
  const order = ms => ms.sort((a, b) => ((b.x ? 10 * VAL[b.x.toUpperCase()] : 0) + (b.p ? 800 : 0)) - ((a.x ? 10 * VAL[a.x.toUpperCase()] : 0) + (a.p ? 800 : 0)));

  function think(pos, level = 2) {
    const LV = [null, { depth: 1, noise: 90, blunder: .22, q: false }, { depth: 2, noise: 18, blunder: 0, q: true }, { depth: 4, noise: 0, blunder: 0, q: true, ms: 1400 }][Math.max(1, Math.min(3, level))];
    const deadline = Date.now() + (LV.ms || 4000);
    let nodes = 0, stop = false;
    const quiesce = (p, alpha, beta, qd) => {
      nodes++;
      const stand = evaluate(p);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (qd > 6) return alpha;
      for (const m of order(pseudo(p, true))) {
        const n = make(p, m); if (inCheck(n, p.turn)) continue;
        const sc = -quiesce(n, -beta, -alpha, qd + 1);
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    };
    const search = (p, depth, alpha, beta, ply) => {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      if (depth <= 0) return LV.q ? quiesce(p, alpha, beta, 0) : evaluate(p);
      let any = false, best = -MATE * 2;
      for (const m of order(pseudo(p))) {
        const n = make(p, m); if (inCheck(n, p.turn)) continue;
        any = true;
        const sc = -search(n, depth - 1, -beta, -alpha, ply + 1);
        if (sc > best) best = sc;
        if (sc > alpha) alpha = sc;
        if (alpha >= beta) break;
      }
      if (!any) return inCheck(p, p.turn) ? -MATE + ply : 0;
      return best;
    };
    const moves = order(legal(pos));
    if (!moves.length) return null;
    if (LV.blunder && Math.random() < LV.blunder) return moves[Math.floor(Math.random() * moves.length)];
    let best = moves[0], scores = new Map();
    for (let d = 1; d <= LV.depth; d++) {
      let alpha = -MATE * 2, bestD = null, done = true;
      const sorted = d > 1 ? moves.slice().sort((a, b) => (scores.get(b) ?? -1e9) - (scores.get(a) ?? -1e9)) : moves;
      for (const m of sorted) {
        const sc = -search(make(pos, m), d - 1, -MATE * 2, -alpha + LV.noise * 2, 1) + (LV.noise ? (Math.random() - .5) * 2 * LV.noise : 0);
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
  const between = ([a, b]) => a + Math.random() * (b - a);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };
  const LEVELS = ['', 'Débutant', 'Moyen', 'Fort'];

  function create({ hostId, players, rival, level, color, clock }) {
    const host = players.find(p => p.id === hostId) || players[0];
    const lv = Math.max(1, Math.min(3, +level || 2));
    const foe = rival === 'robot' ? { id: 'bot0', name: `Robot ${['', 'Pion', 'Fou', 'Dame'][lv]}`, bot: true, online: true } : players.find(p => p.id !== host.id && p.online !== false);
    const hostWhite = color === 'blanc' ? true : color === 'noir' ? false : Math.random() < .5;
    const seat = (p, c) => ({ id: p.id, name: p.name, bot: !!p.bot, online: p.online !== false, color: c });
    const pos = fromFEN(START), ms = Math.max(0, Math.min(60, +clock || 0)) * 60000;
    const room = {
      hostId, phase: 'play', level: lv, seq: 0, log: [], pos, moves: [], keys: { [posKey(pos)]: 1 }, last: null, result: null,
      seats: hostWhite ? [seat(host, 'w'), seat(foe, 'b')] : [seat(foe, 'w'), seat(host, 'b')],
      watchers: players.filter(p => p.id !== host.id && p.id !== foe.id).map(p => ({ id: p.id, name: p.name, online: p.online !== false })),
      clock: ms, left: [ms, ms], turnAt: Date.now(), botAt: 0, drawOffer: -1, past: [], vsBot: !!foe.bot,
    };
    room.botAt = room.turnAt + between(BOT_MS);
    log(room, `${room.seats[0].name} a les blancs, ${room.seats[1].name} les noirs.${ms ? ` ${ms / 60000} minutes chacun.` : ''}`);
    return room;
  }
  const seatOf = (room, pid) => room.seats.findIndex(s => s.id === pid);
  const turnIdx = room => room.pos.turn === 'w' ? 0 : 1;

  function finish(room, winnerIdx, why) {
    room.phase = 'over'; room.drawOffer = -1;
    room.result = { winner: winnerIdx >= 0 ? room.seats[winnerIdx].id : null, why };
    const W = winnerIdx >= 0 ? room.seats[winnerIdx].name : '';
    const txt = { mat: `Échec et mat. ${W} gagne.`, temps: `Temps écoulé. ${W} gagne.`, abandon: `Abandon. ${W} gagne.`, pat: 'Pat : partie nulle.', repetition: 'Même position trois fois : partie nulle.',
      cinquante: '50 coups sans prise ni pion avancé : partie nulle.', materiel: 'Plus assez de pièces pour mater : partie nulle.', accord: 'Nulle d’un commun accord.' }[why];
    log(room, txt);
  }
  function spend(room) {
    if (!room.clock) return;
    const i = turnIdx(room); room.left[i] = Math.max(0, room.left[i] - (Date.now() - room.turnAt));
  }

  function play(room, pid, m) {
    if (room.phase !== 'play') return null;
    const i = turnIdx(room);
    if (room.seats[i].id !== pid) return 'Ce n’est pas ton tour';
    const f = typeof m.from === 'number' ? m.from : sqIndex(m.from), t = typeof m.to === 'number' ? m.to : sqIndex(m.to);
    const all = legal(room.pos);
    const cand = all.filter(x => x.f === f && x.t === t);
    if (!cand.length) return inCheck(room.pos, room.pos.turn) ? 'Ton roi est en échec : pare l’échec.' : 'Ce coup n’est pas permis';
    let mv = cand[0];
    if (cand.length > 1) {                                     // promotion : la pièce choisie (dame par défaut)
      const want = String(m.promo || 'q').toLowerCase();
      mv = cand.find(x => x.p && x.p.toLowerCase() === want) || cand.find(x => x.p && x.p.toLowerCase() === 'q');
    }
    spend(room);
    if (room.vsBot && !room.seats[i].bot) room.past.push({ pos: room.pos, moves: room.moves.length, keys: { ...room.keys }, last: room.last, left: room.left.slice() });
    const note = san(room.pos, mv, all);
    const piece = room.pos.b[mv.f];
    room.pos = make(room.pos, mv);
    room.moves.push(note);
    room.last = { f: mv.f, t: mv.t, san: note, by: room.seats[i].id, x: mv.x || '', k: mv.k || '', piece, n: room.moves.length };
    const key = posKey(room.pos); room.keys[key] = (room.keys[key] || 0) + 1;
    room.drawOffer = -1;
    log(room, `${room.seats[i].name} : ${note}`);
    const replies = legal(room.pos);
    if (!replies.length) { if (inCheck(room.pos, room.pos.turn)) finish(room, i, 'mat'); else finish(room, -1, 'pat'); }
    else if (room.keys[key] >= 3) finish(room, -1, 'repetition');
    else if (room.pos.half >= 100) finish(room, -1, 'cinquante');
    else if (insufficient(room.pos.b)) finish(room, -1, 'materiel');
    room.turnAt = Date.now(); room.botAt = room.turnAt + between(BOT_MS); room.seq += 1;
    return null;
  }

  function botMove(room, level) {
    const m = think(room.pos, level); if (!m) return false;
    const promo = m.p ? m.p.toLowerCase() : 'q';
    play(room, room.seats[turnIdx(room)].id, { from: m.f, to: m.t, promo });
    return true;
  }

  function tick(room) {
    if (room.phase !== 'play') return false;
    const i = turnIdx(room), s = room.seats[i], now = Date.now();
    if (room.clock && room.left[i] - (now - room.turnAt) <= 0) {
      room.left[i] = 0;
      if (insufficient(room.pos.b.map(p => p && side(p) === s.color ? (p.toUpperCase() === 'K' ? p : '') : p))) finish(room, -1, 'materiel');   // l'autre ne peut plus mater
      else finish(room, 1 - i, 'temps');
      room.seq += 1; return true;
    }
    if (s.bot && now >= room.botAt) return botMove(room, room.level);
    if (!s.bot && !s.online && now - room.turnAt > ABSENT_MS) { log(room, `${s.name} est absent, le robot joue à sa place.`); return botMove(room, 2); }
    if (room.drawOffer >= 0 && room.seats[1 - room.drawOffer].bot && now >= room.botAt) {   // le robot répond à une proposition de nulle
      const meIdx = 1 - room.drawOffer, score = evaluate({ ...room.pos, turn: room.seats[meIdx].color });
      if (score <= -250) finish(room, -1, 'accord'); else { room.drawOffer = -1; log(room, `${room.seats[meIdx].name} refuse la nulle.`); }
      room.seq += 1; return true;
    }
    return false;
  }

  function act(room, pid, m) {
    const i = seatOf(room, pid);
    switch (m.t) {
      case 'ec:move': return play(room, pid, m);
      case 'ec:resign':
        if (room.phase !== 'play' || i < 0) return null;
        spend(room); finish(room, 1 - i, 'abandon'); room.seq += 1; return null;
      case 'ec:draw':                                           // proposer la nulle (ou accepter celle de l'autre)
        if (room.phase !== 'play' || i < 0) return null;
        if (room.drawOffer === 1 - i) { finish(room, -1, 'accord'); room.seq += 1; return null; }
        if (room.drawOffer === i) return null;
        room.drawOffer = i; room.botAt = Date.now() + between(BOT_MS); log(room, `${room.seats[i].name} propose la nulle.`); room.seq += 1; return null;
      case 'ec:draw-no':
        if (room.phase !== 'play' || i < 0 || room.drawOffer !== 1 - i) return null;
        room.drawOffer = -1; log(room, `${room.seats[i].name} refuse la nulle.`); room.seq += 1; return null;
      case 'ec:undo': {                                         // contre le robot seulement : on reprend son dernier coup
        if (room.phase !== 'play' || i < 0 || !room.vsBot || !room.past.length) return null;
        const p = room.past.pop();
        room.pos = p.pos; room.moves.length = p.moves; room.keys = p.keys; room.last = p.last; room.left = p.left;
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

  // ------------------------------------------------------------ ce que voit chaque téléphone
  function captured(b) {
    const full = { P: 8, N: 2, B: 2, R: 2, Q: 1 }, out = { w: [], b: [] };   // pièces perdues par chaque camp
    for (const T of 'QRBNP') {
      for (const c of ['w', 'b']) {
        const p = c === 'w' ? T : T.toLowerCase(), n = b.filter(x => x === p).length;
        for (let k = n; k < full[T]; k++) out[c].push(p);
      }
    }
    return out;
  }
  function view(room, pid) {
    const i = seatOf(room, pid), t = turnIdx(room), myTurn = room.phase === 'play' && i === t;
    const now = Date.now(), left = room.left.map((ms, k) => room.clock && room.phase === 'play' && k === t ? Math.max(0, ms - (now - room.turnAt)) : ms);
    let mat = 0; for (const p of room.pos.b) if (p) mat += (side(p) === 'w' ? 1 : -1) * VAL[p.toUpperCase()];
    return {
      phase: room.phase, seq: room.seq, isHost: pid === room.hostId, me: i, turn: room.pos.turn, myTurn, since: room.turnAt,
      board: room.pos.b, check: inCheck(room.pos, room.pos.turn) ? kingSq(room.pos.b, room.pos.turn) : -1,
      moves: myTurn ? legal(room.pos).map(m => ({ f: m.f, t: m.t, p: m.p ? m.p.toLowerCase() : '' })) : [],
      last: room.last, history: room.moves, captured: captured(room.pos.b), material: mat / 100,
      seats: room.seats.map(s => ({ id: s.id, name: s.name, bot: s.bot, online: s.online, color: s.color })),
      clock: room.clock, left, drawOffer: room.drawOffer, canUndo: room.vsBot && i >= 0 && room.past.length > 0 && room.phase === 'play',
      level: room.level, vsBot: room.vsBot, result: room.result,
      watchers: room.watchers.map(w => ({ id: w.id, name: w.name, online: w.online })), log: room.log.slice(-16),
    };
  }

  return { START, FILES, NAME_FR, LETTER_FR, LEVELS, sqName, sqIndex, side, fromFEN, toFEN, pseudo, legal, make, inCheck, attacked, san, posKey, insufficient, evaluate, think, create, act, tick, join, setOnline, view };
})();
if (typeof module !== 'undefined') module.exports = Echecs;
