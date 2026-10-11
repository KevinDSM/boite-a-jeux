/* Un seul indice — l'équivalent maison de Just One, un jeu coopératif de 3 à 8 joueurs.

   13 cartes. À chaque manche, un joueur devine un mot mystère que tous les autres voient. Chacun écrit en
   secret un indice d'un seul mot. Les indices identiques ou trop proches (même racine, pluriel, accents),
   et ceux trop proches du mot lui-même, s'annulent avant d'être montrés au devineur ; les autres joueurs
   peuvent encore en rayer un à la main. Le devineur a une seule proposition :
   bonne réponse, +1 ; mauvaise réponse, la carte suivante est perdue aussi ; il peut passer sans pénalité.

   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.usi), actions « usi:… ».
   LE MOT N'EST JAMAIS DANS LA VUE DU DEVINEUR avant la révélation, ni dans le fil de la partie.
   Les mots et leurs associations (indices des robots) sont dans unseulindice.json, chargé par load() :
   sur le serveur des salons seulement, ou par le téléphone de l'hôte quand c'est lui qui fait tourner la
   partie (hors pages.dev). Réutilise shuffle (core.js). */

'use strict';

const UnSeulIndice = (() => {
  const CARDS = 13, MIN = 3, MAX = 8, MAX_LEN = 24;
  const BOT_CLUE_MS = [1500, 4500], BOT_GUESS_MS = 2600, AUTO_SHOW_MS = 1600;

  // ------------------------------------------------------------ les mots
  let WORDS = null;
  async function load(v) {
    if (WORDS) return WORDS;
    const j = await fetch(`unseulindice.json?v=${v}`).then(r => r.ok ? r.json() : null).catch(() => null);
    WORDS = Array.isArray(j?.mots) ? j.mots : null;
    return WORDS;
  }
  const count = () => WORDS ? WORDS.length : 0;

  // « Chevaux », « cheval » et « chevâl » se valent ; « chanteur » et « chanter » ont la même racine.
  const fold = w => String(w || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z]/g, '');
  const SUFFIXES = ['issement', 'ement', 'ation', 'ition', 'atrice', 'ateur', 'ienne', 'euse', 'eur', 'ette', 'iere', 'ier', 'ien', 'ique', 'isme', 'iste', 'ment', 'elle', 'esse', 'ee', 'er', 'ir', 'es', 'e'];
  function stem(w) {
    let s = fold(w);
    if (s.length > 5 && s.endsWith('aux')) s = s.slice(0, -3) + 'al';
    else if (s.length > 3 && /[sx]$/.test(s)) s = s.slice(0, -1);
    for (const suf of SUFFIXES) if (s.endsWith(suf) && s.length - suf.length >= 4) { s = s.slice(0, -suf.length); break; }
    return s;
  }
  /** Deux mots trop proches : identiques sans accents ni pluriel, même racine, ou l'un commence comme l'autre (5 lettres au moins). */
  function close(a, b) {
    const fa = fold(a), fb = fold(b); if (!fa || !fb) return false;
    if (fa === fb) return true;
    const sa = stem(a), sb = stem(b); if (sa === sb) return true;
    const [s, l] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
    return s.length >= 5 && l.startsWith(s);
  }
  /** Un indice ne peut pas être le mot, ni le contenir (« arc-en-ciel » pour « ciel »). */
  const tooNearWord = (clue, word) => close(clue, word) || (fold(word).length >= 4 && fold(clue).includes(fold(word)));
  /** La proposition du devineur est juste au pluriel ou aux accents près. */
  const same = (guess, word) => { const g = fold(guess), w = fold(word); return !!g && (g === w || stem(guess) === stem(word)); };

  // ------------------------------------------------------------ la salle
  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };
  const guesserId = room => room.order[room.turn % room.order.length];
  const givers = room => room.order.filter(id => id !== guesserId(room)).map(id => pl(room, id)).filter(p => p?.inGame);
  const waitingFor = room => givers(room).filter(p => p.online && !room.clues[p.id]);
  const between = ([a, b]) => a + Math.random() * (b - a);

  function create({ hostId, players }) {
    const pool = WORDS || [];
    const room = {
      hostId, phase: 'clues', seq: 0, log: [],
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, inGame: p.online !== false })),
      deck: shuffle([...pool.keys()]).slice(0, CARDS), total: CARDS, played: 0, score: 0, lost: 0, history: [],
      order: [], turn: -1, card: null, clues: {}, cancel: {}, guess: null, result: null, phaseAt: Date.now(), botAt: {},
    };
    room.order = shuffle(room.players.filter(p => p.inGame).map(p => p.id));
    log(room, `${room.total} cartes, une seule équipe. On les trouve ensemble.`);
    nextCard(room);
    return room;
  }

  function nextCard(room) {
    if (!room.deck.length) { over(room); return; }
    const n = room.order.length; let guard = 0;
    do { room.turn = (room.turn + 1) % n; } while (guard++ < n && !pl(room, guesserId(room))?.online);
    const [w, assoc] = WORDS[room.deck.pop()];
    room.card = { w, assoc };
    room.clues = {}; room.cancel = {}; room.guess = null; room.result = null;
    room.phase = 'clues'; room.phaseAt = Date.now(); room.seq += 1;
    room.botAt = {};
    givers(room).filter(p => p.bot).forEach(p => { room.botAt[p.id] = Date.now() + between(BOT_CLUE_MS); });
    log(room, `Carte ${room.played + 1}. ${pl(room, guesserId(room))?.name} devine.`);
  }

  // les indices trop proches du mot, puis les doublons (tous ceux du groupe tombent)
  function autoCancel(room) {
    const ids = Object.keys(room.clues);
    room.cancel = {};
    ids.forEach(id => { if (tooNearWord(room.clues[id], room.card.w)) room.cancel[id] = 'mot'; });
    ids.forEach((a, i) => ids.slice(i + 1).forEach(b => {
      if (close(room.clues[a], room.clues[b])) { if (!room.cancel[a]) room.cancel[a] = 'double'; if (!room.cancel[b]) room.cancel[b] = 'double'; }
    }));
  }
  function toCheck(room) {
    autoCancel(room);
    const n = Object.keys(room.clues).length, out = Object.keys(room.cancel).length;
    log(room, n ? `${n} indice${n > 1 ? 's' : ''}${out ? `, dont ${out} annulé${out > 1 ? 's' : ''}` : ''}.` : 'Aucun indice.');
    room.phase = 'check'; room.phaseAt = Date.now(); room.seq += 1;
  }
  function toGuess(room) { room.phase = 'guess'; room.phaseAt = Date.now(); room.seq += 1; }

  function giveClue(room, pid, word) {
    const p = pl(room, pid);
    if (room.phase !== 'clues' || !p?.inGame || pid === guesserId(room)) return null;
    const w = String(word || '').trim();
    if (!w) return 'Écris un indice';
    if (/\s/.test(w)) return 'Un seul mot, sans espace';
    if (w.length > MAX_LEN) return 'Un mot plus court';
    if (!/^[\p{L}][\p{L}'’-]*$/u.test(w)) return 'Des lettres seulement';
    room.clues[pid] = w; room.seq += 1;
    if (!waitingFor(room).length) toCheck(room);
    return null;
  }
  function takeBack(room, pid) {
    if (room.phase !== 'clues' || !room.clues[pid]) return null;
    delete room.clues[pid]; room.seq += 1; return null;
  }
  // rayer à la main un indice trop proche que la machine a laissé passer (ou le rétablir)
  function strike(room, pid, target) {
    const p = pl(room, pid);
    if (room.phase !== 'check' || !p?.inGame || pid === guesserId(room) || !room.clues[target]) return null;
    if (room.cancel[target] === 'main') delete room.cancel[target];
    else if (!room.cancel[target]) room.cancel[target] = 'main';
    else return 'Celui-là est annulé d’office';
    room.seq += 1; return null;
  }
  function show(room, pid) {
    const p = pl(room, pid);
    if (room.phase !== 'check' || !p?.inGame || pid === guesserId(room)) return null;
    toGuess(room); return null;
  }

  function resolve(room, kind, text) {
    const g = pl(room, guesserId(room)), w = room.card.w;
    room.played += 1;
    let lostNext = null;
    if (kind === 'ok') { room.score += 1; log(room, `${g.name} trouve « ${w} ».`); }
    else if (kind === 'pass') { room.lost += 1; log(room, `${g.name} passe. C’était « ${w} ».`); }
    else {
      room.lost += 1;
      if (room.deck.length) { const [nw] = WORDS[room.deck.pop()]; lostNext = nw; room.lost += 1; room.played += 1; }
      else if (room.score > 0) { room.score -= 1; lostNext = ''; }
      log(room, `${g.name} dit « ${text} ». C’était « ${w} »${lostNext ? `, et « ${lostNext} » part avec` : lostNext === '' ? ', et on rend une carte gagnée' : ''}.`);
    }
    const clues = Object.entries(room.clues).map(([id, c]) => ({ name: pl(room, id)?.name || '?', w: c, out: room.cancel[id] || null }));
    room.result = { kind, guess: text || '', word: w, lostNext, guesser: g.name, guesserId: g.id };
    room.history.push({ w, kind, guess: text || '', guesser: g.name, lostNext, clues });
    room.phase = 'reveal'; room.phaseAt = Date.now(); room.seq += 1;
  }
  function guess(room, pid, text) {
    if (room.phase !== 'guess' || pid !== guesserId(room)) return null;
    const t = String(text || '').trim().replace(/\s+/g, ' ');
    if (!t) return 'Écris ta réponse, ou passe';
    if (t.length > 40) return 'Une réponse plus courte';
    resolve(room, same(t, room.card.w) ? 'ok' : 'ko', t); return null;
  }
  function pass(room, pid) {
    const gid = guesserId(room);
    if (room.phase === 'guess' && pid === gid) { resolve(room, 'pass'); return null; }
    // l'hôte peut passer la carte d'un devineur parti, à tout moment de la manche
    if (pid === room.hostId && !pl(room, gid)?.online && ['clues', 'check', 'guess'].includes(room.phase)) { resolve(room, 'pass'); return null; }
    return null;
  }
  function over(room) {
    room.phase = 'over'; room.card = null; room.phaseAt = Date.now(); room.seq += 1;
    log(room, `Partie finie : ${room.score} sur ${room.total}.`);
  }

  // ------------------------------------------------------------ robots
  // un indice : une association du mot, au hasard (deux robots peuvent tomber sur la même et s'annuler)
  function botClue(room) {
    const taken = Object.values(room.clues);
    const list = shuffle(room.card.assoc.filter(a => !tooNearWord(a, room.card.w)));
    return list.find(a => !taken.some(t => close(t, a)) || Math.random() < .25) || list[0] || 'euh';
  }
  // deviner : le mot dont les associations recoupent le plus d'indices visibles
  function botGuess(room) {
    const shown = Object.keys(room.clues).filter(id => !room.cancel[id]).map(id => room.clues[id]);
    if (!shown.length) return null;
    let best = null;
    WORDS.forEach(([w, assoc]) => {
      if (room.history.some(h => h.w === w)) return;
      const hit = shown.filter(c => assoc.some(a => close(a, c)) || close(c, w)).length;
      if (hit && (!best || hit > best.hit || (hit === best.hit && Math.random() < .5))) best = { w, hit };
    });
    if (!best) return null;
    if (best.hit < 2 && shown.length > 2 && Math.random() < .5) return null;   // trop maigre : il passe
    return best.w;
  }

  function tick(room) {
    const now = Date.now();
    if (room.phase === 'clues') {
      const bot = givers(room).find(p => p.bot && !room.clues[p.id] && now >= (room.botAt[p.id] || 0));
      if (bot) { giveClue(room, bot.id, botClue(room)); return true; }
      if (!waitingFor(room).length && givers(room).length) { toCheck(room); return true; }   // les absents ne bloquent pas
      return false;
    }
    if (room.phase === 'check' && now - room.phaseAt > AUTO_SHOW_MS && !givers(room).some(p => p.online && !p.bot)) { toGuess(room); return true; }
    if (room.phase === 'guess' && pl(room, guesserId(room))?.bot && now - room.phaseAt > BOT_GUESS_MS) {
      const g = botGuess(room);
      if (g) resolve(room, same(g, room.card.w) ? 'ok' : 'ko', g); else resolve(room, 'pass');
      return true;
    }
    return false;
  }

  function act(room, pid, m) {
    const host = pid === room.hostId;
    switch (m.t) {
      case 'usi:clue': return giveClue(room, pid, m.word);
      case 'usi:back': return takeBack(room, pid);
      case 'usi:strike': return strike(room, pid, String(m.id || ''));
      case 'usi:show': return show(room, pid);
      case 'usi:guess': return guess(room, pid, m.word);
      case 'usi:pass': return pass(room, pid);
      // l'hôte n'attend plus les retardataires : on vérifie les indices déjà posés
      case 'usi:hurry': if (host && room.phase === 'clues' && Object.keys(room.clues).length) toCheck(room); return null;
      case 'usi:next': if (host && room.phase === 'reveal') nextCard(room); return null;
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
    const gid = guesserId(room), me = pl(room, pid);
    const live = room.phase !== 'reveal' && room.phase !== 'over';
    const blind = pid === gid && live;                 // le devineur : ni le mot, ni les indices avant la vérification
    const clues = room.order.filter(id => id !== gid).map(id => pl(room, id)).filter(p => p?.inGame).map(p => {
      const has = !!room.clues[p.id], out = room.cancel[p.id] || null;
      let w = null, st = has ? 'ready' : 'writing';
      if (room.phase === 'clues') { if (p.id === pid) w = room.clues[p.id] || null; }
      else if (has) {
        st = out ? 'out' : 'ok';
        if (!blind) w = room.clues[p.id];
        else if (room.phase === 'guess' && !out) w = room.clues[p.id];
      }
      return { id: p.id, name: p.name, bot: p.bot, online: p.online, w, st, why: blind ? null : out, me: p.id === pid };
    });
    const g = pl(room, gid);
    return {
      phase: room.phase, seq: room.seq, isHost: pid === room.hostId,
      total: room.total, played: room.played, score: room.score, lost: room.lost, left: room.deck.length + (live && room.card ? 1 : 0),
      cardNo: Math.min(room.total, room.played + 1),
      word: blind || !room.card ? null : room.card.w,
      guesser: g ? { id: g.id, name: g.name, bot: g.bot, online: g.online } : null,
      me: me ? { inGame: me.inGame, guesser: pid === gid, clue: room.clues[pid] || null } : null,
      clues, quiet: Date.now() - room.phaseAt,
      result: room.result, history: room.phase === 'over' || room.phase === 'reveal' ? room.history : room.history.map(h => ({ w: h.w, kind: h.kind, lostNext: h.lostNext })),
      players: room.players.filter(p => p.inGame).map(p => ({ id: p.id, name: p.name, bot: p.bot, online: p.online })),
      log: room.log.slice(-12),
    };
  }

  return { CARDS, MIN, MAX, load, count, create, act, tick, join, setOnline, view, close, same, tooNearWord, fold, stem };
})();
if (typeof module !== 'undefined') module.exports = UnSeulIndice;
