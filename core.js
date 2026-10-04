/* Boîte à jeux : le cœur du salon, sans écran ni réseau.
   La partie (classe Game), les actions des joueurs, le tick des chronos et des robots.
   Chargé dans le navigateur avant app.js (quand l'hôte fait tourner la partie sur son téléphone),
   et repris tel quel par le serveur Cloudflare (server/), qui fournit alors broadcast, sendAll,
   toast et sabOnMessage, et des connexions qui imitent celles de PeerJS (send, close). */

'use strict';

const ASSET_V = '63';

const BET_SECONDS = 12;
const TOKEN_START = 2, TOKEN_MAX = 3;
const E_LEVELS = [0.5, 1, 2, 3, 5];   // secondes écoutables par palier
const E_POINTS = [5, 4, 3, 2, 1];     // points si trouvé à ce palier

const GAMES = {
  timeline: { key: 'timeline', theme: 'decennies', name: 'Décennies' },
  eclair: { key: 'eclair', theme: 'eclair', name: 'Éclair' },
  sprint: { key: 'sprint', theme: 'sprint', name: 'Sprint' },
  sablier: { key: 'sablier', theme: 'sablier', name: 'Sablier' },
  undercover: { key: 'undercover', theme: 'undercover', name: 'Undercover' },
  geo: { key: 'geo', theme: 'geo', name: 'Boussole' },
  chromo: { key: 'chromo', theme: 'chromo', name: 'Chromo' },
  kems: { key: 'kems', theme: 'kems', name: 'Kems' },
  camembert: { key: 'camembert', theme: 'camembert', name: 'Camembert' },
  mirage: { key: 'mirage', theme: 'mirage', name: 'Mirage' },
  douze: { key: 'douze', theme: 'douze', name: 'Douze' },
  petitbac: { key: 'petitbac', theme: 'petitbac', name: 'Petit Brevet' },
  loupgarou: { key: 'loupgarou', theme: 'loupgarou', name: 'Loup-Garou' },
  naufrages: { key: 'naufrages', theme: 'naufrages', name: 'Naufragés' },
  memes: { key: 'memes', theme: 'memes', name: 'Mème pas vrai' },
  limite: { key: 'limite', theme: 'limite', name: 'Hors Limite' },
  solitaire: { key: 'solitaire', theme: 'solitaire', name: 'Solitaire' },
  poker: { key: 'poker', theme: 'poker', name: 'Poker' },
  diapason: { key: 'diapason', theme: 'diapason', name: 'Diapason' },
  duel: { key: 'duel', theme: 'duel', name: 'Duel des Cités' },
  teldes: { key: 'teldes', theme: 'teldes', name: 'Téléphone dessiné' },
  nomcode: { key: 'nomcode', theme: 'nomcode', name: 'Nom de code' },
  bataille: { key: 'bataille', theme: 'bataille', name: 'Bataille' },
};
const SP_POINTS = [5, 3, 2, 1];       // points selon l'ordre d'arrivée
const SP_TRIES = 3;                   // essais par manche
const SP_ROUND_MS = 33000;            // durée d'une manche (l'extrait dure 30 s)

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const genCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c = ''; for (let i = 0; i < 4; i++) c += A[Math.random() * A.length | 0]; return c; };
// L'emoji de chaque joueur, choisi à l'accueil : il précède son prénom partout (salon, tables, podiums).
// Un seul caractère chacun (pas de séquences composées), pour qu'il tienne aussi dans une pastille.
const EMOJIS = ['🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🦁', '🐵', '🐧', '🦉', '🐢', '🐝', '🦋', '🐳', '🦀', '🐨', '🐷', '🦖', '🐬', '🐻', '🦔', '🐞', '🦒', '🍕', '🍩', '🍉', '🍒', '🥑', '🌵', '🌻', '🍄', '🍀', '🔥', '⚡', '🌈', '⭐', '🌙', '🎸', '🎲', '🚀', '👻', '👽', '💎', '🎩', '👑'];
const withEmoji = p => p.emoji ? p.emoji + '\u00a0' + p.base : p.base;

// ============================================================ robots
// Des joueurs robots pour compléter une table ou tester un jeu tout seul. Chaque jeu les fait jouer
// dans le tick de l'hôte ; ici on ne fait que les ajouter à la liste des joueurs.
const ROBOT_NAMES = ['Robot Pixel', 'Robot Zinc', 'Robot Mira', 'Robot Quartz', 'Robot Nova', 'Robot Écho', 'Robot Tilt', 'Robot Bip'];
const robots = n => Array.from({ length: Math.max(0, Math.min(ROBOT_NAMES.length, +n || 0)) }, (_, i) => ({ id: 'bot' + i, name: ROBOT_NAMES[i], online: true, bot: true }));
const withRobots = (s, n) => s.players.map(p => ({ id: p.id, name: p.name, online: p.online })).concat(robots(n));

// ============================================================ moteur (hôte)
class Game {
  constructor(code, songs, songsE, songsJV, songsAnime) {
    this.songs = songs; this.songsE = songsE; this.songsJV = songsJV || []; this.songsAnime = songsAnime || []; this.seq = 0;
    this.banned = new Set();          // joueurs retirés par l'hôte : ils ne peuvent plus revenir dans ce salon
    this.state = {
      code, phase: 'lobby', pick: null, mode: 'timeline', players: [],
      // Décennies
      turn: 0, target: 10, deck: [], current: null, placement: null,
      bet: null, passes: [], betEnds: 0, guess: null, result: null,
      cats: null, speakerId: null, soundAll: false,
      // Éclair
      rounds: 10, round: 0, eclair: {}, decades: null,
      // Sprint
      sprint: {}, order: [], roundEnds: 0,
      winner: null,
    };
  }
  get s() { return this.state; }
  player(id) { return this.s.players.find(p => p.id === id); }
  get active() { return this.s.players[this.s.turn % this.s.players.length]; }

  addPlayer(id, name, host = false, emoji = '') {
    let p = this.player(id);
    if (p) { p.online = true; p.offAt = 0; p.base = name || p.base; p.emoji = this.freeEmoji(emoji || p.emoji, id); p.name = withEmoji(p); if (this.uc) Undercover.join(this.uc, id, p.name); if (this.geo) Geo.join(this.geo, id, p.name); if (this.chromo) Chromo.join(this.chromo, id, p.name); if (this.kems) Kems.join(this.kems, id, p.name); if (this.cm) Camembert.join(this.cm, id, p.name); if (this.mi) Mirage.join(this.mi, id, p.name); if (this.dz) Douze.join(this.dz, id, p.name); if (this.pb) PetitBac.join(this.pb, id, p.name); if (this.lw) LoupGarou.join(this.lw, id, p.name); if (this.nf) Naufrages.join(this.nf, id, p.name); if (this.mm) Memes.join(this.mm, id, p.name); if (this.hl) HorsLimite.join(this.hl, id, p.name); if (this.so) Solitaire.join(this.so, id, p.name); if (this.pk) Poker.join(this.pk, id, p.name); if (this.dp) Diapason.join(this.dp, id, p.name); if (this.du) Duel.join(this.du, id, p.name); if (this.td) TelDes.join(this.td, id, p.name); if (this.nc) NomCode.join(this.nc, id, p.name); if (this.bt) Bataille.join(this.bt, id, p.name); if (this.sab) { const q = Sablier.findPlayer(this.sab, id); if (q) q.connected = true; } return p; }
    p = { id, base: name, emoji: this.freeEmoji(emoji, id), tokens: TOKEN_START, timeline: [], score: 0, online: true, host };
    p.name = name = withEmoji(p);
    this.s.players.push(p);
    if (this.s.phase !== 'lobby' && this.s.phase !== 'end' && this.s.mode === 'timeline') p.timeline = [this.card()];
    if (this.uc) Undercover.join(this.uc, id, name);
    if (this.geo) Geo.join(this.geo, id, name);
    if (this.chromo) Chromo.join(this.chromo, id, name);
    if (this.kems) Kems.join(this.kems, id, name);
    if (this.cm) Camembert.join(this.cm, id, name);
    if (this.mi) Mirage.join(this.mi, id, name);
    if (this.dz) Douze.join(this.dz, id, name);
    if (this.pb) PetitBac.join(this.pb, id, name);
    if (this.lw) LoupGarou.join(this.lw, id, name);
    if (this.nf) Naufrages.join(this.nf, id, name);
    if (this.mm) Memes.join(this.mm, id, name);
    if (this.hl) HorsLimite.join(this.hl, id, name);
    if (this.so) Solitaire.join(this.so, id, name);
    if (this.pk) Poker.join(this.pk, id, name);
    if (this.dp) Diapason.join(this.dp, id, name);
    if (this.du) Duel.join(this.du, id, name);
    if (this.td) TelDes.join(this.td, id, name);
    if (this.nc) NomCode.join(this.nc, id, name);
    if (this.bt) Bataille.join(this.bt, id, name);
    if (this.sab) { Sablier.addPlayer(this.sab, id, name); if (this.sab.phase === 'selection') { const q = Sablier.findPlayer(this.sab, id); Sablier.dealTo(this.sab, q, this.sabPool(), Sablier.history.set()); Sablier.history.add(q.hand); } }
    return p;
  }
  // deux joueurs n'ont jamais le même emoji : le second reçoit un emoji libre
  freeEmoji(want, id) {
    const taken = new Set(this.s.players.filter(p => p.id !== id && !p.kicked).map(p => p.emoji));
    if (EMOJIS.includes(want) && !taken.has(want)) return want;
    const free = EMOJIS.filter(e => !taken.has(e));
    return free.length ? free[Math.random() * free.length | 0] : (EMOJIS.includes(want) ? want : EMOJIS[0]);
  }
  setEmoji(pid, e) {
    const p = this.player(pid); if (!p || !EMOJIS.includes(e)) return 'silent';
    if (this.s.phase !== 'lobby') return 'L\u2019emoji se change au salon, entre deux parties.';
    if (this.s.players.some(q => q.id !== pid && !q.kicked && q.emoji === e)) return `${e} est déjà pris.`;
    p.emoji = e; p.name = withEmoji(p); return null;
  }
  setOffline(id) { const p = this.player(id); if (p) { p.online = false; p.offAt = Date.now(); } if (this.uc) Undercover.setOnline(this.uc, id, false); if (this.geo) Geo.setOnline(this.geo, id, false); if (this.chromo) Chromo.setOnline(this.chromo, id, false); if (this.kems) Kems.setOnline(this.kems, id, false); if (this.cm) Camembert.setOnline(this.cm, id, false); if (this.mi) Mirage.setOnline(this.mi, id, false); if (this.dz) Douze.setOnline(this.dz, id, false); if (this.pb) PetitBac.setOnline(this.pb, id, false); if (this.lw) LoupGarou.setOnline(this.lw, id, false); if (this.nf) Naufrages.setOnline(this.nf, id, false); if (this.mm) Memes.setOnline(this.mm, id, false); if (this.hl) HorsLimite.setOnline(this.hl, id, false); if (this.so) Solitaire.setOnline(this.so, id, false); if (this.pk) Poker.setOnline(this.pk, id, false); if (this.dp) Diapason.setOnline(this.dp, id, false); if (this.du) Duel.setOnline(this.du, id, false); if (this.td) TelDes.setOnline(this.td, id, false); if (this.nc) NomCode.setOnline(this.nc, id, false); if (this.bt) Bataille.setOnline(this.bt, id, false); }

  // --- pioche
  pool() { const c = this.s.cats; const p = this.songs.filter(s => !c || c.includes(s.cat)); return p.length ? p : this.songs; }
  poolE() {
    const d = this.s.decades;   // null = toutes les périodes ; [] = aucune (jeux vidéo seuls)
    const base = d === null ? this.songsE : this.songsE.filter(x => d.includes(Math.floor((+x.cat || x.year) / 10) * 10));
    const jv = this.s.jv ? this.songsJV.map(x => ({ ...x, jv: true, kind: 'jv', title: x.game, artist: x.title, sub: x.artist })) : [];
    const anime = this.s.anime ? this.songsAnime.map(x => ({ ...x, jv: true, kind: 'anime', title: x.game, artist: x.title, sub: x.artist })) : [];
    const p = base.concat(jv, anime);
    return p.length ? p : this.songsE;
  }
  draw() { if (!this.s.deck.length) this.s.deck = shuffle(this.s.mode === 'eclair' ? [...this.poolE()] : [...this.pool()]); return this.s.deck.pop(); }
  card() { return { ...this.draw(), at: ++this.seq }; }

  setPick(pid, key) { if (pid !== this.s.players[0]?.id) return null; if (GAMES[key] && this.s.pick !== key) { this.s.pick = key; this.s.pickOpts = null; } return null; }
  // résumé des réglages de l'hôte, affiché chez les invités
  setPickOpts(pid, key, items) {
    if (pid !== this.s.players[0]?.id || key !== this.s.pick || !Array.isArray(items)) return 'silent';
    this.s.pickOpts = items.slice(0, 40).map(x => ({ label: String(x.label || '').slice(0, 80), value: String(x.value || '').slice(0, 400) }));
    return null;
  }

  start(o) {
    const s = this.s;
    s.mode = o.mode || s.pick || 'timeline'; s.winner = null;
    if (s.mode === 'eclair') return this.startEclair(o);
    if (s.mode === 'sprint') return this.startSprint(o);
    if (s.mode === 'sablier') return this.startSablier(o);
    if (s.mode === 'undercover') return this.startUndercover(o);
    if (s.mode === 'geo') return this.startGeo(o);
    if (s.mode === 'chromo') return this.startChromo(o);
    if (s.mode === 'kems') return this.startKems(o);
    if (s.mode === 'camembert') return this.startCamembert(o);
    if (s.mode === 'mirage') return this.startMirage(o);
    if (s.mode === 'douze') return this.startDouze(o);
    if (s.mode === 'petitbac') return this.startPetitBac(o);
    if (s.mode === 'loupgarou') return this.startLoupGarou(o);
    if (s.mode === 'naufrages') return this.startNaufrages(o);
    if (s.mode === 'memes') return this.startMemes(o);
    if (s.mode === 'limite') return this.startLimite(o);
    if (s.mode === 'solitaire') return this.startSolitaire(o);
    if (s.mode === 'poker') return this.startPoker(o);
    if (s.mode === 'diapason') return this.startDiapason(o);
    if (s.mode === 'duel') return this.startDuel(o);
    if (s.mode === 'teldes') return this.startTelDes(o);
    if (s.mode === 'nomcode') return this.startNomCode(o);
    if (s.mode === 'bataille') return this.startBataille(o);
    s.target = o.target || 10; s.cats = o.cats?.length ? o.cats : null;
    s.speakerId = o.speakerId || null; s.soundAll = !!o.soundAll;
    s.deck = shuffle([...this.pool()]); s.turn = 0;
    s.players.forEach(p => { p.tokens = TOKEN_START; p.score = 0; p.timeline = [this.card()]; });
    this.nextSong(); s.phase = 'listen';
  }
  nextSong() { const s = this.s; s.current = this.draw(); s.placement = null; s.bet = null; s.passes = []; s.guess = null; s.result = null; s.betEnds = 0; }

  // --- Décennies : actions
  place(pid, idx) {
    const s = this.s;
    if (s.phase !== 'listen' || pid !== this.active.id) return 'Ce n\u2019est pas ton tour';
    s.placement = idx; s.phase = 'bet'; s.betEnds = Date.now() + BET_SECONDS * 1000;
    if (!s.players.some(p => p.id !== pid && p.online && p.tokens > 0)) this.reveal();
    return null;
  }
  claim(pid) {
    const s = this.s; const p = this.player(pid);
    if (s.phase !== 'bet' || pid === this.active.id) return 'Impossible maintenant';
    if (s.bet) return `${this.player(s.bet.pid)?.name || 'Quelqu\u2019un'} a déjà pris le pari`;
    if (p.tokens < 1) return 'Tu n\u2019as plus de jeton';
    p.tokens--; s.bet = { pid, idx: null }; s.betEnds = Date.now() + BET_SECONDS * 1000;
    return null;
  }
  betPlace(pid, idx) {
    const s = this.s;
    if (s.phase !== 'bet' || s.bet?.pid !== pid || s.bet.idx != null) return 'Impossible maintenant';
    if (idx === s.placement) return `C\u2019est déjà le choix de ${this.active.name}`;
    s.bet.idx = idx; this.reveal(); return null;
  }
  cancelBet(pid) {
    const s = this.s;
    if (s.phase !== 'bet' || s.bet?.pid !== pid || s.bet.idx != null) return null;
    this.player(pid).tokens = Math.min(TOKEN_MAX, this.player(pid).tokens + 1);
    s.bet = null; this.checkDone(); return null;
  }
  pass(pid) { const s = this.s; if (s.phase !== 'bet' || pid === this.active.id) return null; if (!s.passes.includes(pid)) s.passes.push(pid); this.checkDone(); return null; }
  checkDone() {
    const s = this.s; if (s.bet) return;
    const others = s.players.filter(p => p.id !== this.active.id && p.online);
    if (others.every(p => s.passes.includes(p.id) || p.tokens < 1)) this.reveal();
  }
  guess(pid, artist, title) {
    const s = this.s;
    if (pid !== this.active.id || !['listen', 'bet'].includes(s.phase)) return 'Impossible';
    s.guess = { artist, title }; return null;
  }
  soloSkip(pid) {
    const s = this.s;
    if (s.phase !== 'listen' || pid !== this.active.id) return null;
    if (s.players.filter(p => p.online).length > 1) return 'Réservé au jeu en solo';
    this.nextSong(); return null;
  }
  forceNext(pid) {
    const s = this.s; if (!['listen', 'bet'].includes(s.phase)) return 'Pas maintenant';
    if (this.active.online && pid !== this.active.id) return `${this.active.name} est encore connecté`;
    this.advance(); return null;
  }

  insert(p, song) { let i = 0; while (i < p.timeline.length && p.timeline[i].year <= song.year) i++; p.timeline.splice(i, 0, song); return i; }
  fits(tl, idx, year) { const b = idx === 0 ? -Infinity : tl[idx - 1].year; const a = idx === tl.length ? Infinity : tl[idx].year; return year >= b && year <= a; }

  reveal() {
    const s = this.s, a = this.active, song = s.current;
    const ok = this.fits(a.timeline, s.placement, song.year);
    const bp = s.bet && s.bet.idx != null ? this.player(s.bet.pid) : null;
    const betWon = !!bp && !ok && this.fits(a.timeline, s.bet.idx, song.year);

    let by = null, lost = null;
    if (ok) { a.timeline.splice(s.placement, 0, { ...song, at: ++this.seq }); by = a.id; }
    else if (betWon) { this.insert(bp, { ...song, at: ++this.seq }); by = bp.id; }
    if (bp && !betWon) {                       // pari perdu : le jeton est déjà parti, une carte s'en va
      if (bp.timeline.length > 1) { const i = bp.timeline.reduce((m, c, k) => c.at > bp.timeline[m].at ? k : m, 0); lost = bp.timeline.splice(i, 1)[0]; }
    }
    let tokenWon = false;
    if (s.guess) {
      const ga = norm(s.guess.artist), gt = norm(s.guess.title);
      const artistOk = ga && (norm(song.artist).includes(ga) || ga.includes(norm(song.artist).split(' ')[0]));
      const titleOk = gt && (norm(song.title).includes(gt) || gt.includes(norm(song.title)));
      if (artistOk && titleOk && a.tokens < TOKEN_MAX) { a.tokens++; tokenWon = true; }
      else if (artistOk && titleOk) tokenWon = 'max';
    }
    s.result = {
      ok, by, year: song.year, song, tokenWon, placement: s.placement, activeId: a.id,
      betPid: bp?.id || null, betIdx: bp ? s.bet.idx : null, betWon, lost: lost ? lost.year : null,
    };
    s.phase = 'reveal';
    const w = s.players.find(p => p.timeline.length >= s.target); if (w) s.winner = w.id;
  }
  advance() { const s = this.s; s.turn++; let g = 0; while (!this.active.online && g++ < s.players.length) s.turn++; this.nextSong(); s.phase = 'listen'; }
  next() { const s = this.s; if (s.phase !== 'reveal') return; if (s.winner) { s.phase = 'end'; return; } this.advance(); }
  tick() {
    const s = this.s;
    if (s.phase === 's-play' && Date.now() > s.roundEnds) { this.spEnd(); return; }
    if (s.phase === 'bet' && Date.now() > s.betEnds) {
      if (s.bet && s.bet.idx == null) { const p = this.player(s.bet.pid); if (p) p.tokens = Math.min(TOKEN_MAX, p.tokens + 1); s.bet = null; }
      this.reveal();
    }
  }

  // --- Éclair
  startEclair(o) {
    const s = this.s;
    s.rounds = o.rounds || 10; s.round = 0; s.decades = Array.isArray(o.decades) ? o.decades : null; s.jv = !!o.jv; s.anime = false;
    s.deck = shuffle([...this.poolE()]);
    s.players.forEach(p => { p.score = 0; });
    this.nextRound();
  }
  nextRound() {
    const s = this.s; s.round++;
    if (!s.deck.length) s.deck = shuffle([...this.poolE()]);
    s.current = s.deck.pop(); s.eclair = {}; s.result = null;
    s.players.forEach(p => { s.eclair[p.id] = { level: 0, done: false, points: 0, tries: [] }; });
    s.phase = 'e-play';
  }
  eSlot(pid) { const s = this.s; if (!s.eclair[pid]) s.eclair[pid] = { level: 0, done: false, points: 0, tries: [] }; return s.eclair[pid]; }
  eUnlock(pid) { const s = this.s; if (s.phase !== 'e-play') return 'Pas maintenant'; const e = this.eSlot(pid); if (e.done) return null; if (e.level < E_LEVELS.length - 1) e.level++; return null; }
  eGuess(pid, title) {
    const s = this.s; if (s.phase !== 'e-play') return 'Pas maintenant';
    const e = this.eSlot(pid); if (e.done) return null;
    let ok;
    if (s.current.jv) {                               // musique de jeu vidéo : on attend le nom du jeu
      const r = this.jvResolve(title);
      if (r.n > 1) return `${r.n} titres correspondent, précise un peu`;   // trop vague : n'use pas d'essai
      ok = r.n === 1 && norm(r.game) === norm(s.current.title);
    } else ok = norm(title) === norm(s.current.title) || (norm(title).length > 3 && norm(s.current.title).includes(norm(title)));
    e.tries.push({ title, ok });
    if (ok) { e.done = true; e.points = E_POINTS[e.level]; this.player(pid).score += e.points; }
    else if (e.level < E_LEVELS.length - 1) e.level++;
    else { e.done = true; e.points = 0; }
    this.eCheck(); return ok ? null : e.done ? 'Raté. Manche finie pour toi.' : 'Raté\u00a0! Le palier suivant s\u2019ouvre.';
  }
  eGiveUp(pid) { const s = this.s; if (s.phase !== 'e-play') return null; const e = this.eSlot(pid); if (e.done) return null; e.done = true; e.points = 0; this.eCheck(); return null; }
  eCheck() { const s = this.s; if (s.players.filter(p => p.online).every(p => this.eSlot(p.id).done)) s.phase = 'e-reveal'; }
  eNext() {
    const s = this.s; if (s.phase !== 'e-reveal') return;
    if (s.round >= s.rounds) { s.phase = 'end'; s.winner = [...s.players].sort((a, b) => b.score - a.score)[0]?.id || null; return; }
    this.nextRound();
  }

  // --- Sprint : tout le monde écoute, le premier qui nomme le morceau marque le plus
  startSprint(o) {
    const s = this.s;
    s.rounds = o.rounds || 10; s.round = 0; s.decades = Array.isArray(o.decades) ? o.decades : null;
    s.speakerId = o.speakerId || null; s.soundAll = !o.speakerId; s.jv = !!o.jv; s.anime = !!o.anime;
    s.deck = shuffle([...this.poolE()]);
    s.players.forEach(p => { p.score = 0; });
    this.nextSprintRound();
  }
  nextSprintRound() {
    const s = this.s; s.round++;
    if (!s.deck.length) s.deck = shuffle([...this.poolE()]);
    s.current = s.deck.pop(); s.order = []; s.result = null;
    s.sprint = {}; s.players.forEach(p => { s.sprint[p.id] = { tries: 0, done: false, points: 0, rank: 0 }; });
    s.roundEnds = Date.now() + SP_ROUND_MS; s.phase = 's-play';
  }
  jvNames() { const s = this.s, l = (s.anime && !s.jv ? [] : this.songsJV).concat(s.anime ? this.songsAnime : []); return [...new Set(l.map(x => x.game))]; }
  // « zelda » désigne plusieurs jeux : on demande de préciser au lieu de compter un raté
  jvResolve(text) {
    const t = norm(text); if (t.length < 2) return { n: 0 };
    const names = this.jvNames();
    const exact = names.filter(n => norm(n) === t);
    if (exact.length === 1) return { n: 1, game: exact[0] };
    const hits = names.filter(n => norm(n).includes(t) || t.includes(norm(n)));
    return hits.length === 1 ? { n: 1, game: hits[0] } : { n: hits.length, hits };
  }
  spSlot(pid) { const s = this.s; if (!s.sprint[pid]) s.sprint[pid] = { tries: 0, done: false, points: 0, rank: 0 }; return s.sprint[pid]; }
  spMatch(text, song) {
    const t = norm(text); if (!t) return false;
    const title = norm(song.title), artist = norm(song.artist);
    const a1 = artist.split(' ').filter(w => w.length > 2)[0] || artist;
    return t.includes(title) && (t.includes(artist) || t.includes(a1));
  }
  spGuess(pid, text) {
    const s = this.s; if (s.phase !== 's-play') return 'Manche terminée';
    const e = this.spSlot(pid); if (e.done) return null;
    let good;
    if (s.current.jv) {                               // musique de jeu vidéo : on attend le nom du jeu
      const rr = this.jvResolve(text);
      if (rr.n > 1) return `${rr.n} titres correspondent, précise un peu`;   // trop vague : n'use pas d'essai
      good = rr.n === 1 && norm(rr.game) === norm(s.current.title);
    } else good = this.spMatch(text, s.current);
    if (good) {
      e.done = true; s.order.push(pid); e.rank = s.order.length;
      e.points = SP_POINTS[Math.min(e.rank - 1, SP_POINTS.length - 1)];
      this.player(pid).score += e.points;
    } else {
      e.tries++;
      if (e.tries >= SP_TRIES) { e.done = true; e.points = 0; }
      this.spCheck(); return e.done ? 'Trois essais ratés. Manche finie pour toi.' : `Raté. Plus que ${SP_TRIES - e.tries} essai${SP_TRIES - e.tries > 1 ? 's' : ''}.`;
    }
    this.spCheck(); return null;
  }
  spGiveUp(pid) { const s = this.s; if (s.phase !== 's-play') return null; const e = this.spSlot(pid); if (e.done) return null; e.done = true; e.points = 0; this.spCheck(); return null; }
  spCheck() { const s = this.s; if (s.players.filter(p => p.online).every(p => this.spSlot(p.id).done)) s.phase = 's-reveal'; }
  spEnd() { const s = this.s; s.players.forEach(p => { const e = this.spSlot(p.id); if (!e.done) { e.done = true; e.points = 0; } }); s.phase = 's-reveal'; }
  spNext() {
    const s = this.s; if (s.phase !== 's-reveal') return;
    if (s.round >= s.rounds) { s.phase = 'end'; s.winner = [...s.players].sort((a, b) => b.score - a.score)[0]?.id || null; return; }
    this.nextSprintRound();
  }

  // ================= Sablier : la salle du moteur porté vit dans this.sab =================
  startSablier(o) {
    const s = this.s, host = s.players[0];
    const room = Sablier.createRoom({ code: s.code, hostId: host.id, hostName: host.name, decks: o.decks });
    s.players.slice(1).forEach(p => { const q = Sablier.addPlayer(room, p.id, p.name); q.connected = p.online; });
    robots(o.bots).forEach(b => { const q = Sablier.addPlayer(room, b.id, b.name); q.bot = true; });
    Sablier.updateSettings(room, o.settings || {}, Sablier.allCategories());
    if (room.settings.teamMode === 'random') Sablier.randomizeTeams(room); else Sablier.clearTeams(room);
    // en composition manuelle, les robots sont quand même rangés : dans l'équipe la moins remplie
    room.players.filter(p => p.bot && !p.teamId).forEach(p => { const t = room.teams.slice().sort((x, y) => Sablier.playersOfTeam(room, x.id).length - Sablier.playersOfTeam(room, y.id).length)[0]; if (t) p.teamId = t.id; });
    this.sab = room; s.phase = 'sab';
  }
  sabPool() { const st = this.sab.settings; return Sablier.pool(st.decks, st.difficulties, st.categories); }
  sabExtras() {
    const room = this.sab, pool = this.sabPool(), seen = Sablier.history.set();
    return { problems: room.phase === 'teams' ? Sablier.teamProblems(room, pool) : [], poolSize: pool.length, freshCount: pool.filter(c => !seen.has(c.id)).length };
  }
  // ================= Undercover : la salle vit dans this.uc, les mots ne sortent que vers leur joueur =================
  startUndercover(o) {
    const s = this.s;
    s.players.forEach(p => { p.score = 0; });
    this.uc = Undercover.create({ hostId: s.players[0].id, players: withRobots(s, o.bots), rounds: o.rounds, undercovers: o.undercovers, white: o.white });
    s.phase = 'uc';
  }
  // ================= Boussole : la salle vit dans this.geo, les coordonnées ne sortent qu'à la révélation =================
  startGeo(o) {
    const s = this.s;
    s.players.forEach(p => { p.score = 0; });
    this.geo = Geo.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), map: o.map, mode: o.geoMode, rounds: o.rounds, seconds: o.seconds });
    s.phase = 'geo';
  }
  // ================= Chromo : la salle vit dans this.chromo, chaque main ne sort que vers son joueur =================
  startChromo(o) {
    const s = this.s;
    this.chromo = Chromo.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), rounds: o.rounds, stack: o.stack, bots: o.bots, zero: o.zero });
    s.phase = 'ch';
  }
  // ================= Kems : la salle vit dans this.kems, les mains ne sont révélées qu'en fin de donne =================
  startKems(o) {
    const s = this.s;
    this.kems = Kems.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), target: o.target, teams: o.teams, bots: o.bots });
    s.phase = 'km';
  }
  // ================= Camembert : la salle vit dans this.cm, la bonne réponse ne sort qu'à la révélation =================
  startCamembert(o) {
    const s = this.s;
    this.cm = Camembert.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), target: o.target, diff: o.diff, replay: o.replay });
    s.phase = 'cm';
  }
  // ================= Mirage : la salle vit dans this.mi, chaque main ne sort que vers son joueur =================
  startMirage(o) {
    const s = this.s;
    this.mi = Mirage.create({ hostId: s.players[0].id, players: withRobots(s, o.bots), target: o.target, jokers: o.jokers, cardset: o.cardset });
    s.phase = 'mi';
  }
  // ================= Douze : la salle vit dans this.dz, les cartes cachées ne sortent jamais =================
  startDouze(o) {
    const s = this.s;
    this.dz = Douze.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), target: o.target, bots: o.bots });
    s.phase = 'dz';
  }
  // ================= Petit Brevet (ex-Petit Bac) : la salle vit dans this.pb, les réponses restent secrètes jusqu'à la vérification =================
  startPetitBac(o) {
    const s = this.s;
    this.pb = PetitBac.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), cats: o.cats, rounds: o.rounds, seconds: o.seconds, hard: o.hard, stopRule: o.stopRule });
    s.phase = 'pb';
  }
  // ================= Loup-Garou : la salle vit dans this.lw, chaque rôle ne sort que vers son joueur =================
  startLoupGarou(o) {
    const s = this.s;
    this.lw = LoupGarou.create({ hostId: s.players[0].id, players: withRobots(s, o.bots), wolves: o.wolves, roles: o.roles, deadSee: o.deadSee });
    s.phase = 'lw';
  }
  // ================= Naufragés : la salle vit dans this.nf, les objets ne sortent que vers leur propriétaire =================
  startNaufrages(o) {
    const s = this.s;
    this.nf = Naufrages.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), length: o.length, bots: o.bots });
    s.phase = 'nf';
  }
  // ================= Mème pas vrai : la salle vit dans this.mm, chaque main ne sort que vers son joueur =================
  startMemes(o) {
    const s = this.s;
    this.mm = Memes.create({ hostId: s.players[0].id, players: withRobots(s, o.bots), target: o.target, mode: o.judge, kinds: o.kinds });
    s.phase = 'mm';
  }
  // ================= Hors Limite : la salle vit dans this.hl, chaque main ne sort que vers son joueur =================
  startLimite(o) {
    const s = this.s;
    this.hl = HorsLimite.create({ hostId: s.players[0].id, players: withRobots(s, o.bots), target: o.target, mode: o.judge, soft: o.soft });
    s.phase = 'hl';
  }
  // ================= Solitaire : chacun joue la même donne chez lui, l'hôte tient la course =================
  startSolitaire(o) {
    const s = this.s;
    this.so = Solitaire.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), draw: o.draw, minutes: o.minutes });
    s.phase = 'so';
  }
  // ================= Poker : la salle vit dans this.pk, les cartes cachées ne sortent que vers leur joueur =================
  startPoker(o) {
    const s = this.s;
    this.pk = Poker.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), stack: o.stack, blindEvery: o.blindEvery, bots: o.bots });
    s.phase = 'pk';
  }
  // ================= Diapason : la salle vit dans this.dp, la cible ne sort que vers le médium =================
  startDiapason(o) {
    const s = this.s;
    this.dp = Diapason.create({ hostId: s.players[0].id, players: withRobots(s, o.bots), mode: o.dpMode, tours: o.tours, target: o.target });
    s.phase = 'dp';
  }
  // ================= Duel des Cités : à deux (ou contre le robot), les autres regardent =================
  // ================= Téléphone dessiné et Nom de code =================
  startTelDes(o) { const s = this.s; this.td = TelDes.create({ hostId: s.players[0].id, players: withRobots(s, o.bots), speed: o.speed, length: o.length }); s.phase = 'td'; }
  startNomCode(o) { const s = this.s; this.nc = NomCode.create({ hostId: s.players[0].id, players: withRobots(s, o.bots) }); s.phase = 'nc'; }
  startBataille(o) { const s = this.s; this.bt = Bataille.create({ hostId: s.players[0].id, players: withRobots(s, o.bots), length: o.length }); s.phase = 'bt'; }
  startDuel(o) {
    const s = this.s;
    this.du = Duel.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), rival: o.rival });
    s.phase = 'du';
  }
  viewFor(base, pid) { if (this.bt) return { ...base, bt: Bataille.view(this.bt, pid) }; if (this.td) return { ...base, td: TelDes.view(this.td, pid) }; if (this.nc) return { ...base, nc: NomCode.view(this.nc, pid) }; if (this.du) return { ...base, du: Duel.view(this.du, pid) }; if (this.dp) return { ...base, dp: Diapason.view(this.dp, pid) }; if (this.so) return { ...base, so: Solitaire.view(this.so, pid) }; if (this.pk) return { ...base, pk: Poker.view(this.pk, pid) }; if (this.hl) return { ...base, hl: HorsLimite.view(this.hl, pid) }; if (this.nf) return { ...base, nf: Naufrages.view(this.nf, pid) }; if (this.mm) return { ...base, mm: Memes.view(this.mm, pid) }; if (this.lw) return { ...base, lw: LoupGarou.view(this.lw, pid) }; if (this.pb) return { ...base, pb: PetitBac.view(this.pb, pid) }; if (this.dz) return { ...base, dz: Douze.view(this.dz, pid) }; if (this.mi) return { ...base, mi: Mirage.view(this.mi, pid) }; if (this.cm) return { ...base, cm: Camembert.view(this.cm, pid) }; if (this.kems) return { ...base, kems: Kems.view(this.kems, pid) }; if (this.chromo) return { ...base, chromo: Chromo.view(this.chromo, pid) }; if (this.geo) return { ...base, geo: Geo.view(this.geo, pid) }; if (this.uc) return { ...base, uc: Undercover.view(this.uc, pid) }; return this.sab ? { ...base, sab: Sablier.viewFor(this.sab, pid, this._sabExtras) } : base; }

  /** Résumé d'une partie terminée, pour les podiums du salon ; null si la partie n'est pas allée au bout. */
  summary() {
    const s = this.s, when = Date.now();
    const top = (list, key = 'score', asc = false) => [...list].sort((a, b) => asc ? a[key] - b[key] : b[key] - a[key]).map(p => ({ name: p.name, score: p[key] }));
    const pack = (key, podium, extra = {}) => ({ game: key, name: GAMES[key]?.name || key, when, podium: podium.slice(0, 3), total: podium.length, ...extra });
    if (s.phase === 'end') return pack(s.mode, s.mode === 'timeline' ? top(s.players.map(p => ({ name: p.name, score: p.timeline.length }))) : top(s.players), { unit: s.mode === 'timeline' ? 'cartes' : 'pts' });
    if (this.sab && this.sab.phase === 'game-end') { const v = Sablier.viewFor(this.sab, s.players[0].id, {}); return pack('sablier', top(v.teams.map(t => ({ name: `${t.name} (${t.players.map(p => p.name).join(', ')})`, score: t.total }))), { unit: 'cartes' }); }
    if (this.chromo?.phase === 'over') return pack('chromo', top(this.chromo.players.filter(p => p.inRound || p.score)), { unit: 'pts' });
    if (this.kems?.phase === 'over') return pack('kems', top(Kems.view(this.kems, s.players[0].id).teams.map(t => ({ name: `${t.sym} ${t.name} (${t.names.join(', ')})`, score: t.score }))), { unit: 'pts' });
    if (this.mi?.phase === 'over') return pack('mirage', top(this.mi.players.filter(p => this.mi.order.includes(p.id))), { unit: 'pts' });
    if (this.dz?.phase === 'over') return pack('douze', top(this.dz.players.filter(p => p.inRound || p.score), 'score', true), { unit: 'pts', low: true });
    if (this.pb?.phase === 'over') return pack('petitbac', top(this.pb.players.filter(p => p.inRound || p.score)), { unit: 'pts' });
    if (this.mm?.phase === 'over') return pack('memes', top(this.mm.players.filter(p => this.mm.order.includes(p.id))), { unit: 'pts' });
    if (this.hl?.phase === 'over') return pack('limite', top(this.hl.players.filter(p => this.hl.order.includes(p.id))), { unit: 'pts' });
    if (this.lw?.phase === 'over') { const w = this.lw.players.filter(p => this.lw.winners.includes(p.id)); return pack('loupgarou', w.map(p => ({ name: p.name })), { note: this.lw.winner === 'village' ? 'Le village a gagné' : this.lw.winner === 'wolves' ? 'Les loups ont gagné' : this.lw.winner === 'lovers' ? 'Les amoureux ont gagné' : 'Personne n\u2019a survécu', team: true }); }
    if (this.nf?.phase === 'over') { const w = this.nf.players.filter(p => this.nf.winners.includes(p.id)); return pack('naufrages', w.map(p => ({ name: p.name })), { note: w.length ? `${w.length} rescapé${w.length > 1 ? 's' : ''} sur ${this.nf.players.filter(p => p.inGame).length}` : 'Aucun rescapé', team: true }); }
    if (this.so?.phase === 'over') return pack('solitaire', Solitaire.ranking(this.so).map(r => ({ name: r.name, score: r.found })), { unit: 'cartes' });
    if (this.td?.phase === 'over') return pack('teldes', TelDes.ranking(this.td).map(r => ({ name: r.name, score: r.hearts })), { unit: 'cœurs' });
    if (this.nc?.phase === 'over' && this.nc.winner !== null) { const w = this.nc.players.filter(p => p.inGame && p.team === this.nc.winner); return pack('nomcode', w.map(p => ({ name: p.name })), { note: `L\u2019équipe ${NomCode.TEAM[this.nc.winner]} gagne`, team: true }); }
    if (this.du?.phase === 'over') {
      const f = this.du.final, seats = this.du.seats, order = this.du.winner === 1 ? [1, 0] : [0, 1];
      return pack('duel', order.map(k => ({ name: seats[k].name, score: f ? f[k].total : 0 })), { unit: 'pts', note: this.du.winner < 0 ? 'Égalité parfaite' : `Victoire ${this.du.winType}` });
    }
    if (this.dp?.phase === 'over') return this.dp.mode === 'teams'
      ? pack('diapason', top(Diapason.teamList(this.dp).map(t => ({ name: `${t.name} (${t.members.join(', ')})`, score: t.score }))), { unit: 'pts' })
      : pack('diapason', top(Diapason.ranking(this.dp)), { unit: 'pts' });
    if (this.bt?.phase === 'over') return pack('bataille', this.bt.ranking.map(r => ({ name: r.name, score: r.score })), { unit: 'cartes' });
    if (this.pk?.phase === 'over') return pack('poker', Poker.ranking(this.pk).map(r => ({ name: r.name, score: r.stack })), { unit: 'jetons' });
    return null;
  }
  record() {
    let sum = null; try { sum = this.summary(); } catch (e) { console.warn('résumé impossible', e); }
    if (sum) { this.s.history = [sum, ...(this.s.history || [])].slice(0, 12); }
  }
  restart() {
    this.record();
    this.sab = null; this.uc = null; this.geo = null; this.chromo = null; this.kems = null; this.cm = null; this.mi = null; this.dz = null; this.pb = null; this.lw = null; this.nf = null; this.mm = null; this.hl = null; this.so = null; this.pk = null; this.dp = null; this.du = null; this.td = null; this.nc = null; this.bt = null;
    const s = this.s;
    s.phase = 'lobby'; s.winner = null; s.result = null; s.current = null; s.round = 0;
    s.eclair = {}; s.bet = null; s.passes = []; s.placement = null; s.sprint = {}; s.order = [];
    s.players = s.players.filter(p => !p.kicked);     // les joueurs retirés pendant la partie quittent la liste
    s.players.forEach(p => { p.timeline = []; p.score = 0; p.tokens = TOKEN_START; });
  }

  // état diffusé : masque ce qui trahirait la chanson en cours
  publicState() {
    const s = this.s, hide = s.phase === 'listen' || s.phase === 'bet' || s.phase === 'e-play' || s.phase === 's-play';
    return {
      ...s, deck: undefined,
      current: s.current ? (hide ? { preview: s.current.preview, jv: !!s.current.jv, kind: s.current.kind || null } : s.current) : null,
      betLeft: s.phase === 'bet' ? Math.max(0, Math.ceil((s.betEnds - Date.now()) / 1000)) : 0,
      solo: s.players.filter(p => p.online).length <= 1,
      spLeft: s.phase === 's-play' ? Math.max(0, Math.ceil((s.roundEnds - Date.now()) / 1000)) : 0,
    };
  }
}

// ============================================================ état du salon
const net = { peer: null, conns: new Map(), hostConn: null, isHost: false, game: null, me: '', name: '', emoji: '', code: '', kicked: false };
let songsCache = null, songsECache = null, songsJVCache = null, songsAnimeCache = null;

async function loadSongs() { if (!songsCache) songsCache = await (await fetch('songs.json?v=' + ASSET_V)).json(); return songsCache; }
async function loadSongsE() { if (!songsECache) songsECache = await (await fetch('songs-eclair.json?v=' + ASSET_V)).json(); return songsECache; }
async function loadSongsAnime() { if (!songsAnimeCache) { try { songsAnimeCache = await (await fetch('songs-anime.json?v=' + ASSET_V)).json(); } catch { songsAnimeCache = []; } } return songsAnimeCache; }
async function loadSongsJV() { if (!songsJVCache) songsJVCache = await (await fetch('songs-jv.json?v=' + ASSET_V)).json(); return songsJVCache; }

// Le tick de l'hôte, toutes les 500 ms : chronos et robots de chaque jeu. Vrai s'il faut rediffuser.
function hostTick() {
  const g = net.game, before = g.s.phase; g.tick();
  const sabChanged = sabTick() || (g.geo ? Geo.tick(g.geo) : false) || (g.chromo ? Chromo.tick(g.chromo) : false) || (g.kems ? Kems.tick(g.kems) : false) || (g.cm ? Camembert.tick(g.cm) : false) || (g.dz ? Douze.tick(g.dz) : false) || (g.pb ? PetitBac.tick(g.pb) : false) || (g.lw ? LoupGarou.tick(g.lw) : false) || (g.nf ? Naufrages.tick(g.nf) : false) || (g.so ? Solitaire.tick(g.so) : false) || (g.pk ? Poker.tick(g.pk) : false) || (g.du ? Duel.tick(g.du) : false) || (g.td ? TelDes.tick(g.td) : false) || (g.nc ? NomCode.tick(g.nc) : false) || (g.bt ? Bataille.tick(g.bt) : false) || (g.hl ? HorsLimite.tick(g.hl) : false) || (g.mm ? Memes.tick(g.mm) : false) || (g.mi ? Mirage.tick(g.mi) : false) || (g.uc ? Undercover.tick(g.uc) : false) || (g.dp ? Diapason.tick(g.dp) : false);
  return !!(sabChanged || before !== g.s.phase || g.s.phase === 'bet' || g.s.phase === 's-play');
}

function handleClientMessage(conn, m) {
  if (net.game.banned.has(m.pid)) { if (m.t === 'hello') sendKicked(conn); return; }
  if (m.t === 'hello') { conn.metadata = { pid: m.pid }; net.conns.set(m.pid, conn); net.game.addPlayer(m.pid, m.name, false, m.emoji); if (net.game.sab) { try { conn.send({ t: 'sab-full', strokes: net.game.sab.strokes }); } catch { } } broadcast(); return; }
  const err = applyAction(m.pid, m);
  if (err === 'silent') return;
  if (err) { try { conn.send({ t: 'err', msg: err }); } catch { } }
  broadcast();
}
// L'hôte retire un joueur : il sort du salon (ou, en pleine partie, devient un joueur parti pour de bon)
// et ne peut plus revenir avec ce téléphone.
function sendKicked(conn) { try { conn.send({ t: 'kicked' }); } catch { } setTimeout(() => { try { conn.close(); } catch { } }, 400); }
function kickPlayer(pid, id) {
  const g = net.game, p = g.player(id);
  if (pid !== g.s.players[0]?.id || !p || p.host) return 'silent';
  g.banned.add(id);
  const c = net.conns.get(id); net.conns.delete(id); if (c) sendKicked(c);
  g.setOffline(id); sabOffline(id);
  if (g.s.phase === 'lobby') g.s.players = g.s.players.filter(q => q.id !== id); else p.kicked = true;
  toast(`${p.base} a quitté le salon.`);
  return null;
}
function applyAction(pid, m) {
  const g = net.game;
  if (typeof m.t === 'string' && m.t.startsWith('sab:')) return sabAction(pid, m);
  if (typeof m.t === 'string' && m.t.startsWith('uc:')) return ucAction(pid, m);
  if (typeof m.t === 'string' && m.t.startsWith('geo:')) return geoAction(pid, m);
  if (typeof m.t === 'string' && m.t.startsWith('ch:')) return net.game.chromo ? Chromo.act(net.game.chromo, pid, m) : 'Pas de partie de Chromo en cours';
  if (typeof m.t === 'string' && m.t.startsWith('km:')) return net.game.kems ? Kems.act(net.game.kems, pid, m) : 'Pas de partie de Kems en cours';
  if (typeof m.t === 'string' && m.t.startsWith('cm:')) return net.game.cm ? Camembert.act(net.game.cm, pid, m) : 'Pas de partie de Camembert en cours';
  if (typeof m.t === 'string' && m.t.startsWith('mi:')) return net.game.mi ? Mirage.act(net.game.mi, pid, m) : 'Pas de partie de Mirage en cours';
  if (typeof m.t === 'string' && m.t.startsWith('dz:')) return net.game.dz ? Douze.act(net.game.dz, pid, m) : 'Pas de partie de Douze en cours';
  if (typeof m.t === 'string' && m.t.startsWith('nf:')) return net.game.nf ? Naufrages.act(net.game.nf, pid, m) : 'Pas de partie de Naufragés en cours';
  if (typeof m.t === 'string' && m.t.startsWith('so:')) return net.game.so ? Solitaire.act(net.game.so, pid, m) : 'Pas de partie en cours';
  if (typeof m.t === 'string' && m.t.startsWith('td:')) return net.game.td ? TelDes.act(net.game.td, pid, m) : 'Pas de partie en cours';
  if (typeof m.t === 'string' && m.t.startsWith('bt:')) return net.game.bt ? Bataille.act(net.game.bt, pid, m) : 'Pas de partie en cours';
  if (typeof m.t === 'string' && m.t.startsWith('nc:')) return net.game.nc ? NomCode.act(net.game.nc, pid, m) : 'Pas de partie en cours';
  if (typeof m.t === 'string' && m.t.startsWith('du:')) return net.game.du ? Duel.act(net.game.du, pid, m) : 'Pas de partie en cours';
  if (typeof m.t === 'string' && m.t.startsWith('dp:')) return net.game.dp ? Diapason.act(net.game.dp, pid, m) : 'Pas de partie en cours';
  if (typeof m.t === 'string' && m.t.startsWith('pk:')) return net.game.pk ? Poker.act(net.game.pk, pid, m) : 'Pas de partie en cours';
  if (typeof m.t === 'string' && m.t.startsWith('hl:')) return net.game.hl ? HorsLimite.act(net.game.hl, pid, m) : 'Pas de partie en cours';
  if (typeof m.t === 'string' && m.t.startsWith('mm:')) return net.game.mm ? Memes.act(net.game.mm, pid, m) : 'Pas de partie en cours';
  if (m.t === 'lw:again' && net.game.lw?.phase === 'over' && pid === g.s.players[0]?.id) g.record();   // « Rejouer » garde la trace de la partie finie
  if (typeof m.t === 'string' && m.t.startsWith('lw:')) return net.game.lw ? LoupGarou.act(net.game.lw, pid, m) : 'Pas de partie de Loup-Garou en cours';
  if (typeof m.t === 'string' && m.t.startsWith('pb:')) return net.game.pb ? PetitBac.act(net.game.pb, pid, m) : 'silent';
  switch (m.t) {
    case 'pick': return g.setPick(pid, m.key);
    case 'opts': return g.setPickOpts(pid, m.key, m.items);
    case 'start': if (pid === g.s.players[0]?.id) g.start(m.opts); return null;
    case 'restart': if (pid === g.s.players[0]?.id) g.restart(); return null;
    case 'history-clear': if (pid === g.s.players[0]?.id) g.s.history = []; return null;
    case 'emoji': return g.setEmoji(pid, m.e);
    case 'kick': return kickPlayer(pid, m.id);
    case 'place': return g.place(pid, m.idx);
    case 'claim': return g.claim(pid);
    case 'bet-place': return g.betPlace(pid, m.idx);
    case 'cancel-bet': return g.cancelBet(pid);
    case 'pass': return g.pass(pid);
    case 'guess': return g.guess(pid, m.artist, m.title);
    case 'next': g.next(); return null;
    case 'force-next': return g.forceNext(pid);
    case 'solo-skip': return g.soloSkip(pid);
    case 'e-unlock': return g.eUnlock(pid);
    case 'e-guess': return g.eGuess(pid, m.title);
    case 'e-giveup': return g.eGiveUp(pid);
    case 'e-next': g.eNext(); return null;
    case 'sp-guess': return g.spGuess(pid, m.text);
    case 'sp-giveup': return g.spGiveUp(pid);
    case 'sp-next': g.spNext(); return null;
  }
  return null;
}

// ============================================================ Boussole : côté hôte
function geoAction(pid, m) {
  const g = net.game; if (!g.geo) return 'Pas de partie de Boussole en cours';
  const err = Geo.act(g.geo, pid, m);
  if (g.geo.phase === 'over') {          // fin de partie : les scores rejoignent le classement commun
    g.geo.players.forEach(q => { const p = g.player(q.id); if (p) p.score = q.score; });
    g.s.winner = [...g.s.players].sort((a, b) => b.score - a.score)[0]?.id || null;
    g.s.rounds = g.geo.rounds; g.geo = null; g.s.phase = 'end';
  }
  return err;
}

// ============================================================ Undercover : côté hôte
function ucAction(pid, m) {
  const g = net.game; if (!g.uc) return "Pas de partie d'Undercover en cours";
  const err = Undercover.act(g.uc, pid, m);
  if (g.uc.phase === 'over') {           // fin de partie : les scores rejoignent le classement commun
    g.uc.players.forEach(q => { const p = g.player(q.id); if (p) p.score = q.score; });
    g.s.winner = [...g.s.players].sort((a, b) => b.score - a.score)[0]?.id || null;
    g.s.rounds = g.uc.rounds; g.uc = null; g.s.phase = 'end';
  }
  return err;
}

// ============================================================ Sablier : orchestration côté hôte
function sabWipe() { const r = net.game.sab; if (!r) return; Sablier.clearStrokes(r); sendAll({ t: 'sab-full', strokes: [] }); sabOnMessage({ t: 'sab-full', strokes: [] }); }
function sabFinishTurn(reason) {
  const r = net.game.sab; if (!r) return;
  sabWipe();
  if (r.turn && ['turn-live', 'turn-idle'].includes(r.phase)) Sablier.endTurn(r, reason);
}
function sabAdvanceIfDone() { const r = net.game.sab; if (r && Sablier.selectionDone(r)) Sablier.buildDeckAndStart(r); }
/** Les robots de Sablier : ils valident leur sélection, lancent leur tour et « font deviner » au hasard. */
function sabBots() {
  const r = net.game.sab; if (!r || !r.players.some(p => p.bot)) return false;
  const now = Date.now();
  if (r.botWait && now < r.botWait) return false;
  if (r.phase === 'selection') { const b = r.players.find(p => p.bot && !p.ready); if (b) { Sablier.autoValidate(r, b); sabAdvanceIfDone(); return true; } }
  const d = r.turn && Sablier.findPlayer(r, r.turn.playerId);
  if (!d?.bot) return false;
  if (r.phase === 'turn-idle') { if (!r.botIdle) { r.botIdle = true; r.botWait = now + 2500; return false; } r.botIdle = false; Sablier.startTurn(r); sabWipe(); r.botWait = r.turn.startsAt + 2500 + Math.random() * 2500; return true; }
  if (r.phase === 'turn-live' && r.currentCardId && r.turn.startsAt && now > r.turn.startsAt) {
    r.botWait = now + 2500 + Math.random() * 3500;
    if (Math.random() < .7) { const res = Sablier.markGuessed(r, d.id); sabWipe(); if (res === 'round-over') sabFinishTurn('cleared'); }
    else { Sablier.markPassed(r, d.id); sabWipe(); }
    return true;
  }
  return false;
}
function sabTick() {
  if (sabBots()) return true;
  const r = net.game.sab; if (!r || r.phase !== 'turn-live' || !r.turn) return false;
  const now = Date.now();
  if (now >= r.turn.endsAt + 150) { sabFinishTurn('time'); return true; }
  if (r.turn.startsAt && now >= r.turn.startsAt + 60 && !r.turn.revealed) { r.turn.revealed = true; return true; }  // la carte arrive avec le chrono
  return false;
}
function sabOffline(pid) {
  const r = net.game.sab; if (!r) return;
  const p = Sablier.findPlayer(r, pid); if (p) p.connected = false;
  if (r.phase === 'turn-live' && r.turn && r.turn.playerId === pid) sabFinishTurn('disconnect');
  else sabAdvanceIfDone();
}
function sabAction(pid, m) {
  const g = net.game, r = g.sab; if (!r) return 'Pas de partie de Sablier en cours';
  const host = Sablier.isHost(r, pid);
  const inPhase = (...ph) => ph.includes(r.phase);
  switch (m.t) {
    case 'sab:settings': {
      if (!host || !inPhase('teams')) return null;
      const before = r.settings.teamMode;
      Sablier.updateSettings(r, m.patch || {}, Sablier.allCategories());
      if (before !== r.settings.teamMode) { if (r.settings.teamMode === 'random') Sablier.randomizeTeams(r); else Sablier.clearTeams(r); }
      return null;
    }
    case 'sab:team': if (!inPhase('teams')) return null; if (r.settings.teamMode !== 'manual' && !host) return null; Sablier.setTeam(r, pid, m.teamId ?? null); return null;
    case 'sab:team-add': if (host && inPhase('teams') && Sablier.addTeam(r) && r.settings.teamMode === 'random') Sablier.randomizeTeams(r); return null;
    case 'sab:team-rm': if (host && inPhase('teams') && Sablier.removeTeam(r) && r.settings.teamMode === 'random') Sablier.randomizeTeams(r); return null;
    case 'sab:randomize': if (host && inPhase('teams')) Sablier.randomizeTeams(r); return null;
    case 'sab:deal': {
      if (!host || !inPhase('teams')) return null;
      const pool = g.sabPool();
      const problems = Sablier.teamProblems(r, pool); if (problems.length) return problems[0];
      let seen = Sablier.history.set();
      const need = r.players.length * r.settings.dealPerPlayer;
      if (pool.filter(c => !seen.has(c.id)).length < need) { Sablier.history.clear(); seen = new Set(); }   // catalogue parcouru : nouveau cycle
      Sablier.deal(r, pool, seen);
      Sablier.history.add(r.players.flatMap(p => p.hand));
      return null;
    }
    case 'sab:toggle': Sablier.toggleDiscard(r, pid, m.cardId); return null;
    case 'sab:validate': if (Sablier.validateSelection(r, pid)) sabAdvanceIfDone(); return null;
    case 'sab:unvalidate': Sablier.unvalidateSelection(r, pid); return null;
    case 'sab:force': if (host && inPhase('selection')) Sablier.buildDeckAndStart(r); return null;
    case 'sab:start': if (!Sablier.canStartTurn(r, pid)) return null; Sablier.startTurn(r); sabWipe(); return null;
    case 'sab:guessed': {
      const wasDraw = r.phase === 'turn-live' && Sablier.isDrawingRound(r), cardId = r.currentCardId;
      const res = Sablier.markGuessed(r, pid); if (res === 'ignored') return null;
      if (wasDraw) Sablier.captureDrawing(r, cardId, pid);
      sabWipe();
      if (res === 'round-over') sabFinishTurn('cleared');
      return null;
    }
    case 'sab:passed': if (Sablier.markPassed(r, pid) !== 'ignored') sabWipe(); return null;
    case 'sab:abort': if (host) sabFinishTurn('abort'); return null;
    case 'sab:buzzer': if (host) Sablier.buzzerResolve(r, !!m.accept); return null;
    case 'sab:amend': if (host && Array.isArray(m.ids)) { const n = Sablier.amendGuesses(r, m.ids); if (n) toast(`${n} carte${n > 1 ? 's' : ''} retourne${n > 1 ? 'nt' : ''} dans le paquet.`); } return null;
    case 'sab:next': if (host) Sablier.nextRound(r); return null;
    case 'sab:reset': if (host) { Sablier.resetToLobby(r); sabWipe(); } return null;
    case 'sab:seg': {
      if (r.phase !== 'turn-live' || !r.turn || r.turn.playerId !== pid || !Sablier.isDrawingRound(r)) return null;
      if (!Sablier.appendStroke(r, m.seg)) return null;
      sendAll({ t: 'sab-seg', seg: m.seg }, pid);
      if (pid !== net.me) sabOnMessage({ t: 'sab-seg', seg: m.seg });
      return 'silent';
    }
    case 'sab:undo': case 'sab:clear': {
      if (r.phase !== 'turn-live' || !r.turn || r.turn.playerId !== pid) return null;
      if (m.t === 'sab:undo') Sablier.undoStroke(r); else Sablier.clearStrokes(r);
      const msg = { t: 'sab-full', strokes: r.strokes }; sendAll(msg); sabOnMessage(msg);
      return 'silent';
    }
    case 'sab:doodle': {
      // gribouillage latéral : seulement pendant un tour, par une équipe qui ne joue pas
      if (r.phase !== 'turn-live' || !r.turn || !m.id || !Array.isArray(m.p)) return 'silent';
      const p = Sablier.findPlayer(r, pid); if (!p || !p.teamId || p.teamId === r.turn.teamId) return 'silent';
      const team = r.teams.find(t => t.id === p.teamId);
      const msg = { t: 'sab-doodle', id: String(m.id).slice(0, 24), p: m.p.slice(0, 400).map(Number), c: team ? team.color : '#888888', e: !!m.e };
      sendAll(msg, pid); if (pid !== net.me) sabOnMessage(msg);
      return 'silent';
    }
    case 'sab:react': {
      if (r.phase !== 'turn-live') return 'silent';
      const e = Sablier.sanitizeReaction(m.e); if (!e) return 'silent';
      const who = (Sablier.findPlayer(r, pid) || {}).name || '';
      const msg = { t: 'sab-react', e, who }; sendAll(msg); sabOnMessage(msg);
      return 'silent';
    }
  }
  return null;
}
async function loadDecks() {
  if (Sablier.deckIds().length) return;
  const index = await (await fetch('decks/index.json?v=' + ASSET_V)).json();
  const all = await Promise.all(index.map(d => fetch(`decks/${d.id}.json?v=${ASSET_V}`).then(r => r.json())));
  Sablier.setDecks(all);
}
