/* Dans l'ordre — un jeu coopératif de 2 à 10 joueurs : tout le monde contre le jeu.

   À chaque manche, cinq cartes (ordre-cartes.js). Un joueur, le « classeur », les range en secret sur son téléphone
   de ce qu'il préfère (1) à ce qu'il aime le moins (5). Les autres voient les mêmes cartes et débattent : ils
   déplacent ensemble un classement commun (chaque geste se voit chez tous), puis chacun valide. Un geste annule les
   validations. À la révélation, chaque carte bien placée passe au vert.
   Classement exact (ou 4 sur 5 en mode doux) : l'équipe gagne la lettre suivante du mot ORDRE ; sinon, c'est le jeu.
   Le premier à cinq lettres gagne. Le classeur change à chaque manche.

   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.od), actions « od:… ».
   LE CLASSEMENT SECRET N'EST DANS LA VUE QUE DU CLASSEUR, jusqu'à la révélation. Réutilise shuffle (core.js). */

'use strict';

const Ordre = (() => {
  const MIN = 2, MAX = 10, N = 5, WORD = 'ORDRE';
  const BOT_RANK_MS = [2500, 5000], BOT_VOTE_MS = [900, 2200], BOT_ALONE_MS = [5000, 8000];
  const cards = () => (typeof ORDRE_CARTES !== 'undefined' ? ORDRE_CARTES : []);

  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };
  const between = ([a, b]) => a + Math.random() * (b - a);
  const rankerId = room => room.order[room.turn % room.order.length];
  const guessers = room => room.players.filter(p => p.inGame && p.id !== rankerId(room));
  // ceux dont on attend la validation : les présents (les robots valident seuls, après un humain)
  const voters = room => guessers(room).filter(p => p.online);

  function create({ hostId, players, soft }) {
    const room = {
      hostId, phase: 'rank', seq: 0, log: [], soft: !!soft,
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, inGame: p.online !== false })),
      deck: shuffle([...cards().keys()]), round: 0, us: 0, them: 0, history: [],
      order: [], turn: -1, hand: [], truth: null, guess: [], votes: [], moves: 0, lastMove: null, result: null, phaseAt: Date.now(), botAt: 0,
    };
    room.order = shuffle(room.players.filter(p => p.inGame).map(p => p.id));
    log(room, `Tout le monde contre le jeu. Premier à ${WORD.length} lettres.`);
    nextRound(room);
    return room;
  }

  function nextRound(room) {
    if (room.deck.length < N) room.deck = shuffle([...cards().keys()]);
    const n = room.order.length; let guard = 0;
    do { room.turn = (room.turn + 1) % n; } while (guard++ < n && !pl(room, rankerId(room))?.online);
    room.round += 1;
    room.hand = room.deck.splice(0, N);
    room.truth = null; room.guess = shuffle([...room.hand]); room.votes = []; room.moves = 0; room.lastMove = null; room.result = null;
    room.phase = 'rank'; room.phaseAt = Date.now(); room.seq += 1;
    const r = pl(room, rankerId(room));
    room.botAt = r?.bot ? Date.now() + between(BOT_RANK_MS) : 0;
    log(room, `Manche ${room.round}. ${r?.name} classe en secret.`);
  }

  // le classeur fige son classement : les cinq cartes de la main, chacune une fois
  function rank(room, pid, list) {
    if (room.phase !== 'rank' || pid !== rankerId(room)) return null;
    const ids = Array.isArray(list) ? list.map(Number) : [];
    if (ids.length !== N || new Set(ids).size !== N || !ids.every(c => room.hand.includes(c))) return 'Classe les cinq cartes';
    room.truth = ids; room.votes = []; room.seq += 1;
    room.phase = 'guess'; room.phaseAt = Date.now();
    log(room, `${pl(room, pid)?.name} a classé. À vous de deviner.`);
    room.botAt = 0;
    return null;
  }

  // déplacer une carte du classement commun : tout le monde la voit bouger, les validations repartent de zéro
  function move(room, pid, card, to) {
    const p = pl(room, pid);
    if (!['rank', 'guess'].includes(room.phase) || !p?.inGame || pid === rankerId(room)) return null;
    const c = Number(card), i = room.guess.indexOf(c), j = Math.max(0, Math.min(N - 1, Math.floor(+to)));
    if (i < 0 || !Number.isFinite(j) || i === j) return null;
    room.guess.splice(i, 1); room.guess.splice(j, 0, c);
    room.moves += 1; room.lastMove = { by: pid, card: c, n: room.moves };
    if (room.votes.length) room.votes = [];
    room.seq += 1; return null;
  }

  function vote(room, pid, on = true) {
    const p = pl(room, pid);
    if (room.phase !== 'guess' || !p?.inGame || pid === rankerId(room)) return null;
    room.votes = room.votes.filter(id => id !== pid);
    if (on) room.votes.push(pid);
    room.seq += 1;
    if (voters(room).every(q => room.votes.includes(q.id))) reveal(room);
    return null;
  }

  function reveal(room) {
    const ok = room.guess.map((c, i) => room.truth[i] === c), good = ok.filter(Boolean).length;
    const need = room.soft ? N - 1 : N, win = good >= need;
    if (win) room.us += 1; else room.them += 1;
    const r = pl(room, rankerId(room));
    room.result = { ok, good, win, letter: WORD[(win ? room.us : room.them) - 1], need };
    room.history.push({ round: room.round, ranker: r?.name, hand: room.hand.map(c => cards()[c]), truth: room.truth.map(c => cards()[c]), good, win });
    log(room, `${good} sur ${N}. ${win ? `L’équipe prend le ${room.result.letter}.` : `Le jeu prend le ${room.result.letter}.`}`);
    room.phase = room.us >= WORD.length || room.them >= WORD.length ? 'over' : 'reveal';
    room.phaseAt = Date.now(); room.seq += 1;
    if (room.phase === 'over') log(room, room.us >= WORD.length ? 'L’équipe gagne la partie !' : 'Le jeu gagne la partie.');
  }

  // ------------------------------------------------------------ robots
  // un robot qui classe : au hasard. Des robots seuls à deviner : un peu d'intuition (une ou deux cartes justes).
  function botGuess(room) {
    const keep = room.truth.map((c, i) => Math.random() < .35 ? c : null);
    const rest = shuffle(room.truth.filter(c => !keep.includes(c)));
    room.guess = keep.map(c => c ?? rest.shift());
  }
  function tick(room) {
    const now = Date.now();
    if (room.phase === 'rank') {
      const r = pl(room, rankerId(room));
      if (r?.bot && room.botAt && now >= room.botAt) { room.botAt = 0; rank(room, r.id, shuffle([...room.hand])); return true; }
      return false;
    }
    if (room.phase === 'guess') {
      const humans = voters(room).filter(p => !p.bot);
      if (!humans.length) {                           // plus aucun humain pour deviner : les robots (ou le jeu) devinent seuls
        if (!room.botAt) { room.botAt = now + between(BOT_ALONE_MS); return false; }
        if (now >= room.botAt) { room.botAt = 0; botGuess(room); room.votes = voters(room).map(p => p.id); reveal(room); return true; }
        return false;
      }
      // les robots valident une fois qu'un humain l'a fait, un instant après
      const bot = voters(room).find(p => p.bot && !room.votes.includes(p.id));
      if (bot && humans.some(h => room.votes.includes(h.id))) {
        if (!room.botAt) { room.botAt = now + between(BOT_VOTE_MS); return false; }
        if (now >= room.botAt) { room.botAt = 0; vote(room, bot.id, true); return true; }
      }
      // un votant parti ne bloque pas : s'il ne reste que des validations, on révèle
      if (voters(room).length && voters(room).every(q => room.votes.includes(q.id))) { reveal(room); return true; }
    }
    return false;
  }

  function act(room, pid, m) {
    const host = pid === room.hostId;
    switch (m.t) {
      case 'od:rank': return rank(room, pid, m.order);
      case 'od:move': return move(room, pid, m.card, m.to);
      case 'od:vote': return vote(room, pid, m.on !== false);
      case 'od:next': if (host && room.phase === 'reveal') nextRound(room); return null;
      // le classeur est parti : l'hôte passe la main au suivant (mêmes cartes remises dans la pioche)
      case 'od:skip': if (host && room.phase === 'rank' && !pl(room, rankerId(room))?.online) { room.deck.unshift(...room.hand); room.round -= 1; nextRound(room); } return null;
      case 'od:soft': if (host && room.phase !== 'over') { room.soft = !!m.on; room.seq += 1; } return null;
    }
    return null;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; room.seq += 1; return; }
    if (room.players.filter(q => q.inGame).length >= MAX) { room.players.push({ id, name, online: true, bot: false, inGame: false }); return; }
    room.players.push({ id, name, online: true, bot: false, inGame: true });
    room.order.push(id); room.seq += 1;
  }
  function setOnline(room, id, on) { const p = pl(room, id); if (p) { p.online = on; room.seq += 1; } }

  // ------------------------------------------------------------ ce que voit chaque téléphone
  function view(room, pid) {
    const rid = rankerId(room), me = pl(room, pid), done = room.phase === 'reveal' || room.phase === 'over';
    const R = pl(room, rid);
    return {
      phase: room.phase, seq: room.seq, isHost: pid === room.hostId, round: room.round, soft: room.soft,
      word: WORD, us: room.us, them: room.them, need: room.soft ? N - 1 : N,
      cards: room.hand.map(c => ({ id: c, e: cards()[c]?.[0] || '❓', t: cards()[c]?.[1] || '' })),
      guess: [...room.guess],
      // le vrai classement : au classeur seulement (une fois figé), à tous à la révélation
      truth: room.truth && (done || pid === rid) ? [...room.truth] : null,
      ranked: !!room.truth,
      ranker: R ? { id: R.id, name: R.name, bot: R.bot, online: R.online } : null,
      me: me ? { inGame: me.inGame, ranker: pid === rid, voted: room.votes.includes(pid) } : null,
      votes: [...room.votes], voters: voters(room).map(p => p.id),
      lastMove: room.lastMove, result: done ? room.result : null,
      history: done ? room.history : room.history.map(h => ({ round: h.round, ranker: h.ranker, good: h.good, win: h.win })),
      players: room.players.filter(p => p.inGame).map(p => ({ id: p.id, name: p.name, bot: p.bot, online: p.online })),
      log: room.log.slice(-12),
    };
  }

  return { MIN, MAX, N, WORD, create, act, tick, join, setOnline, view };
})();
if (typeof module !== 'undefined') module.exports = Ordre;
