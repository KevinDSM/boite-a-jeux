/* Boîte à jeux (ex-Platine) — hub de jeux jouables à plusieurs téléphones.
   Architecture : l'hôte (celui qui crée la partie) fait autorité. Il possède les bases de
   chansons et l'état de la partie, et diffuse un état "public" (sans l'année ni le titre de
   la chanson en cours) à tous les invités via WebRTC (PeerJS). Les invités n'envoient que
   des actions ; l'hôte les applique et rediffuse. */

'use strict';

// ============================================================ utilitaires
const $ = (s, root = document) => root.querySelector(s);
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const ROOM_PREFIX = 'decennies-v1-';
const ASSET_V = '48';

const BET_SECONDS = 12;
const TOKEN_START = 2, TOKEN_MAX = 3;
const E_LEVELS = [0.5, 1, 2, 3, 5];   // secondes écoutables par palier
const E_POINTS = [5, 4, 3, 2, 1];     // points si trouvé à ce palier
const E_GRACE = 0.12;                 // marge pour la latence de sortie audio (iPhone)

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
};
const SP_POINTS = [5, 3, 2, 1];       // points selon l'ordre d'arrivée
const SP_TRIES = 3;                   // essais par manche
const SP_ROUND_MS = 33000;            // durée d'une manche (l'extrait dure 30 s)

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const genCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c = ''; for (let i = 0; i < 4; i++) c += A[Math.random() * A.length | 0]; return c; };
const uid = () => { let u = null; try { u = localStorage.getItem('dc-uid'); } catch { } if (!u) { u = Math.random().toString(36).slice(2, 10); try { localStorage.setItem('dc-uid', u); } catch { } } return u; };
const fmtS = v => (v + '').replace('.', ',') + ' s';

let toastTimer;
function toast(msg, ms = 2400) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }

let shownId = null;
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id);
  if (id !== shownId) {
    const wasPlay = shownId === 's-game' || shownId === 's-eclair' || shownId === 's-sprint' || shownId === 's-sablier' || shownId === 's-undercover' || shownId === 's-geo' || shownId === 's-chromo' || shownId === 's-kems' || shownId === 's-camembert' || shownId === 's-mirage' || shownId === 's-douze' || shownId === 's-petitbac' || shownId === 's-loupgarou' || shownId === 's-naufrages' || shownId === 's-memes' || shownId === 's-limite' || shownId === 's-solitaire' || shownId === 's-poker' || shownId === 's-diapason';
    shownId = id; window.scrollTo(0, 0);
    // quitter un écran de jeu coupe le son : il ne doit pas continuer dans le salon
    if (wasPlay && id !== 's-game' && id !== 's-eclair' && id !== 's-sprint' && id !== 's-sablier' && id !== 's-undercover' && id !== 's-geo' && id !== 's-chromo' && id !== 's-kems' && id !== 's-camembert' && id !== 's-mirage' && id !== 's-douze' && id !== 's-petitbac' && id !== 's-loupgarou' && id !== 's-naufrages' && id !== 's-memes' && id !== 's-limite' && id !== 's-solitaire' && id !== 's-poker' && id !== 's-diapason') { stopSnippet(); audio.pause(); lastTurnKey = null; lastTlKey = null; eLastRound = null; spLastRound = null; }
  }
  const game = id === 's-game' ? 'decennies' : id === 's-eclair' ? 'eclair' : id === 's-sablier' ? 'sablier' : id === 's-undercover' ? 'undercover' : id === 's-geo' ? 'geo' : id === 's-chromo' ? 'chromo' : id === 's-kems' ? 'kems' : id === 's-camembert' ? 'camembert' : id === 's-mirage' ? 'mirage' : id === 's-douze' ? 'douze' : id === 's-petitbac' ? 'petitbac' : id === 's-loupgarou' ? 'loupgarou' : id === 's-naufrages' ? 'naufrages' : id === 's-memes' ? 'memes' : id === 's-limite' ? 'limite' : id === 's-solitaire' ? 'solitaire' : id === 's-poker' ? 'poker' : id === 's-diapason' ? 'diapason' : id === 's-sprint' ? GAMES[view?.mode]?.theme || 'sprint' : (id === 's-end' && view ? GAMES[view.mode]?.theme : '');
  if (game) document.documentElement.dataset.game = game; else delete document.documentElement.dataset.game;
  $('#btn-back').hidden = id === 's-home';
  $('#btn-help').hidden = id === 's-home' || id === 's-rules';
  $('#btn-vol').hidden = !(id === 's-game' || id === 's-eclair' || id === 's-sprint');
  if ($('#btn-vol').hidden) $('#vol-bar').hidden = true;
  $('#crumb').textContent = id === 's-home' ? 'Boîte à jeux' : id === 's-rules' ? 'Règles des jeux'
    : id === 's-lobby' ? 'Salon' + (net.code ? ' · ' + net.code : '')
      : id === 's-end' ? 'Classement' : (GAMES[view?.mode]?.name || 'Boîte à jeux');
  syncThemeColor();
}

// ============================================================ audio
const audio = new Audio(); audio.preload = 'auto';
let audioUrl = null;
function loadAudio(url) { if (audioUrl === url) return; audioUrl = url; audio.src = url || ''; const p = $('#prog'); if (p) p.style.width = 0; }
function togglePlay() {
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(() => toast('Touche à nouveau pour lancer le son'));
  else audio.pause();
}
audio.addEventListener('play', () => { $('#vinyl').classList.add('spin'); $('#btn-play').textContent = '❚❚ Pause'; });
audio.addEventListener('pause', () => { $('#vinyl').classList.remove('spin'); $('#btn-play').textContent = audio.currentTime > 0 && audio.currentTime < audio.duration ? '▶ Reprendre' : '▶ Réécouter'; });
audio.addEventListener('timeupdate', () => { const p = $('#prog'); if (p) p.style.width = (audio.currentTime / (audio.duration || 30) * 100) + '%'; });
$('#btn-play').onclick = togglePlay;

let savedVol = 100; try { savedVol = +(localStorage.getItem('dc-vol') ?? 100); } catch { }
audio.volume = savedVol / 100; $('#vol').value = savedVol;
$('#btn-vol').onclick = () => { $('#vol-bar').hidden = !$('#vol-bar').hidden; };
$('#vol').oninput = e => { audio.volume = e.target.value / 100; $('#btn-vol').textContent = e.target.value == 0 ? '🔇' : '🔊'; try { localStorage.setItem('dc-vol', e.target.value); } catch { } };
$('#btn-vol').textContent = savedVol == 0 ? '🔇' : '🔊';

let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !wakeLock) keepAwake(); });

// ============================================================ moteur (hôte)
class Game {
  constructor(code, songs, songsE, songsJV, songsAnime) {
    this.songs = songs; this.songsE = songsE; this.songsJV = songsJV || []; this.songsAnime = songsAnime || []; this.seq = 0;
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

  addPlayer(id, name, host = false) {
    let p = this.player(id);
    if (p) { p.online = true; p.name = name || p.name; if (this.uc) Undercover.join(this.uc, id, p.name); if (this.geo) Geo.join(this.geo, id, p.name); if (this.chromo) Chromo.join(this.chromo, id, p.name); if (this.kems) Kems.join(this.kems, id, p.name); if (this.cm) Camembert.join(this.cm, id, p.name); if (this.mi) Mirage.join(this.mi, id, p.name); if (this.dz) Douze.join(this.dz, id, p.name); if (this.pb) PetitBac.join(this.pb, id, p.name); if (this.lw) LoupGarou.join(this.lw, id, p.name); if (this.nf) Naufrages.join(this.nf, id, p.name); if (this.mm) Memes.join(this.mm, id, p.name); if (this.hl) HorsLimite.join(this.hl, id, p.name); if (this.so) Solitaire.join(this.so, id, p.name); if (this.pk) Poker.join(this.pk, id, p.name); if (this.dp) Diapason.join(this.dp, id, p.name); if (this.sab) { const q = Sablier.findPlayer(this.sab, id); if (q) q.connected = true; } return p; }
    p = { id, name, tokens: TOKEN_START, timeline: [], score: 0, online: true, host };
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
    if (this.sab) { Sablier.addPlayer(this.sab, id, name); if (this.sab.phase === 'selection') { const q = Sablier.findPlayer(this.sab, id); Sablier.dealTo(this.sab, q, this.sabPool(), Sablier.history.set()); Sablier.history.add(q.hand); } }
    return p;
  }
  setOffline(id) { const p = this.player(id); if (p) p.online = false; if (this.uc) Undercover.setOnline(this.uc, id, false); if (this.geo) Geo.setOnline(this.geo, id, false); if (this.chromo) Chromo.setOnline(this.chromo, id, false); if (this.kems) Kems.setOnline(this.kems, id, false); if (this.cm) Camembert.setOnline(this.cm, id, false); if (this.mi) Mirage.setOnline(this.mi, id, false); if (this.dz) Douze.setOnline(this.dz, id, false); if (this.pb) PetitBac.setOnline(this.pb, id, false); if (this.lw) LoupGarou.setOnline(this.lw, id, false); if (this.nf) Naufrages.setOnline(this.nf, id, false); if (this.mm) Memes.setOnline(this.mm, id, false); if (this.hl) HorsLimite.setOnline(this.hl, id, false); if (this.so) Solitaire.setOnline(this.so, id, false); if (this.pk) Poker.setOnline(this.pk, id, false); if (this.dp) Diapason.setOnline(this.dp, id, false); }

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
    if (s.phase !== 'listen' || pid !== this.active.id) return 'Ce n\'est pas ton tour';
    s.placement = idx; s.phase = 'bet'; s.betEnds = Date.now() + BET_SECONDS * 1000;
    if (!s.players.some(p => p.id !== pid && p.online && p.tokens > 0)) this.reveal();
    return null;
  }
  claim(pid) {
    const s = this.s; const p = this.player(pid);
    if (s.phase !== 'bet' || pid === this.active.id) return 'Impossible maintenant';
    if (s.bet) return `${this.player(s.bet.pid)?.name || 'Quelqu\'un'} a déjà pris le pari`;
    if (p.tokens < 1) return 'Tu n\'as plus de jeton';
    p.tokens--; s.bet = { pid, idx: null }; s.betEnds = Date.now() + BET_SECONDS * 1000;
    return null;
  }
  betPlace(pid, idx) {
    const s = this.s;
    if (s.phase !== 'bet' || s.bet?.pid !== pid || s.bet.idx != null) return 'Impossible maintenant';
    if (idx === s.placement) return `C'est déjà le choix de ${this.active.name}`;
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
      if (r.n > 1) return `${r.n} titres correspondent, précise`;   // trop vague : n'use pas d'essai
      ok = r.n === 1 && norm(r.game) === norm(s.current.title);
    } else ok = norm(title) === norm(s.current.title) || (norm(title).length > 3 && norm(s.current.title).includes(norm(title)));
    e.tries.push({ title, ok });
    if (ok) { e.done = true; e.points = E_POINTS[e.level]; this.player(pid).score += e.points; }
    else if (e.level < E_LEVELS.length - 1) e.level++;
    else { e.done = true; e.points = 0; }
    this.eCheck(); return ok ? null : 'Raté !';
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
      if (rr.n > 1) return `${rr.n} titres correspondent, précise`;   // trop vague : n'use pas d'essai
      good = rr.n === 1 && norm(rr.game) === norm(s.current.title);
    } else good = this.spMatch(text, s.current);
    if (good) {
      e.done = true; s.order.push(pid); e.rank = s.order.length;
      e.points = SP_POINTS[Math.min(e.rank - 1, SP_POINTS.length - 1)];
      this.player(pid).score += e.points;
    } else {
      e.tries++;
      if (e.tries >= SP_TRIES) { e.done = true; e.points = 0; }
      this.spCheck(); return e.done ? 'Trois essais ratés, manche finie pour toi' : `Raté · ${SP_TRIES - e.tries} essai${SP_TRIES - e.tries > 1 ? 's' : ''} restant${SP_TRIES - e.tries > 1 ? 's' : ''}`;
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
    Sablier.updateSettings(room, o.settings || {}, Sablier.allCategories());
    if (room.settings.teamMode === 'random') Sablier.randomizeTeams(room); else Sablier.clearTeams(room);
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
    this.uc = Undercover.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), rounds: o.rounds, undercovers: o.undercovers, white: o.white });
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
    this.mi = Mirage.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), target: o.target, jokers: o.jokers, cardset: o.cardset });
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
    this.lw = LoupGarou.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), wolves: o.wolves, roles: o.roles, deadSee: o.deadSee });
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
    this.mm = Memes.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), target: o.target, mode: o.judge, kinds: o.kinds });
    s.phase = 'mm';
  }
  // ================= Hors Limite : la salle vit dans this.hl, chaque main ne sort que vers son joueur =================
  startLimite(o) {
    const s = this.s;
    this.hl = HorsLimite.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), target: o.target, mode: o.judge, soft: o.soft });
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
    this.dp = Diapason.create({ hostId: s.players[0].id, players: s.players.map(p => ({ id: p.id, name: p.name, online: p.online })), mode: o.dpMode, tours: o.tours, target: o.target });
    s.phase = 'dp';
  }
  viewFor(base, pid) { if (this.dp) return { ...base, dp: Diapason.view(this.dp, pid) }; if (this.so) return { ...base, so: Solitaire.view(this.so, pid) }; if (this.pk) return { ...base, pk: Poker.view(this.pk, pid) }; if (this.hl) return { ...base, hl: HorsLimite.view(this.hl, pid) }; if (this.nf) return { ...base, nf: Naufrages.view(this.nf, pid) }; if (this.mm) return { ...base, mm: Memes.view(this.mm, pid) }; if (this.lw) return { ...base, lw: LoupGarou.view(this.lw, pid) }; if (this.pb) return { ...base, pb: PetitBac.view(this.pb, pid) }; if (this.dz) return { ...base, dz: Douze.view(this.dz, pid) }; if (this.mi) return { ...base, mi: Mirage.view(this.mi, pid) }; if (this.cm) return { ...base, cm: Camembert.view(this.cm, pid) }; if (this.kems) return { ...base, kems: Kems.view(this.kems, pid) }; if (this.chromo) return { ...base, chromo: Chromo.view(this.chromo, pid) }; if (this.geo) return { ...base, geo: Geo.view(this.geo, pid) }; if (this.uc) return { ...base, uc: Undercover.view(this.uc, pid) }; return this.sab ? { ...base, sab: Sablier.viewFor(this.sab, pid, this._sabExtras) } : base; }

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
    if (this.dp?.phase === 'over') return this.dp.mode === 'teams'
      ? pack('diapason', top(Diapason.teamList(this.dp).map(t => ({ name: `${t.name} (${t.members.join(', ')})`, score: t.score }))), { unit: 'pts' })
      : pack('diapason', top(Diapason.ranking(this.dp)), { unit: 'pts' });
    if (this.pk?.phase === 'over') return pack('poker', Poker.ranking(this.pk).map(r => ({ name: r.name, score: r.stack })), { unit: 'jetons' });
    return null;
  }
  record() {
    let sum = null; try { sum = this.summary(); } catch (e) { console.warn('résumé impossible', e); }
    if (sum) { this.s.history = [sum, ...(this.s.history || [])].slice(0, 12); }
  }
  restart() {
    this.record();
    this.sab = null; this.uc = null; this.geo = null; this.chromo = null; this.kems = null; this.cm = null; this.mi = null; this.dz = null; this.pb = null; this.lw = null; this.nf = null; this.mm = null; this.hl = null; this.so = null; this.pk = null; this.dp = null;
    const s = this.s;
    s.phase = 'lobby'; s.winner = null; s.result = null; s.current = null; s.round = 0;
    s.eclair = {}; s.bet = null; s.passes = []; s.placement = null; s.sprint = {}; s.order = [];
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

// ============================================================ réseau
const net = { peer: null, conns: new Map(), hostConn: null, isHost: false, game: null, me: uid(), name: '', code: '' };
let view = null, songsCache = null, songsECache = null, songsJVCache = null, songsAnimeCache = null;

async function loadSongs() { if (!songsCache) songsCache = await (await fetch('songs.json?v=' + ASSET_V)).json(); return songsCache; }
async function loadSongsE() { if (!songsECache) songsECache = await (await fetch('songs-eclair.json?v=' + ASSET_V)).json(); return songsECache; }
async function loadSongsAnime() { if (!songsAnimeCache) { try { songsAnimeCache = await (await fetch('songs-anime.json?v=' + ASSET_V)).json(); } catch { songsAnimeCache = []; } } return songsAnimeCache; }
async function loadSongsJV() { if (!songsJVCache) songsJVCache = await (await fetch('songs-jv.json?v=' + ASSET_V)).json(); return songsJVCache; }
function setNet(on, label) { const n = $('#net'); n.className = 'net ' + (on ? 'on' : 'off'); n.textContent = label; }

// L'hôte garde son code même après une coupure : sur iPhone, verrouiller l'écran ou changer
// d'application ferme la connexion et libérait le code, plus personne ne pouvait rejoindre.
function attachHost(peer) {
  peer.on('connection', conn => {
    conn.on('data', m => handleClientMessage(conn, m));
    conn.on('close', () => { const pid = conn.metadata?.pid; if (!pid || net.conns.get(pid) !== conn) return; net.conns.delete(pid); net.game.setOffline(pid); sabOffline(pid); broadcast(); });
  });
  peer.on('open', () => setNet(true, 'hôte'));
  peer.on('disconnected', () => { setNet(false, 'reconnexion'); try { peer.reconnect(); } catch { reviveHost(); } });
  peer.on('close', () => reviveHost());
  peer.on('error', e => { if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) reviveHost(); });
}

let reviving = false;
const waitOpen = (peer, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  peer.once('open', () => { clearTimeout(t); resolve(peer); });
  peer.once('error', e => { clearTimeout(t); reject(e); });
});

async function reviveHost() {
  if (!net.isHost || !net.code || reviving) return;
  const first = net.peer;
  if (first && !first.destroyed && !first.disconnected) return;     // toujours vivant : rien à faire
  reviving = true;
  try {
    // 1. simple pause (écran verrouillé, autre application) : on reprend la même connexion
    if (first && !first.destroyed && first.disconnected) {
      setNet(false, 'reconnexion');
      try { first.reconnect(); await waitOpen(first, 8000); setNet(true, 'hôte'); broadcast(); return; } catch { }
    }
    // 2. connexion perdue : on reprend le même code dès que le serveur le libère
    try { net.peer?.destroy(); } catch { }
    net.conns.clear();
    net.game.s.players.forEach(p => { if (p.id !== net.me) { net.game.setOffline(p.id); sabOffline(p.id); } });
    const waits = [1500, 3000, 5000, 8000, 12000];
    for (let i = 0; i < waits.length; i++) {
      setNet(false, `reconnexion ${i + 1}`);
      try {
        const peer = await makePeer(ROOM_PREFIX + net.code, 9000);
        net.peer = peer; attachHost(peer); setNet(true, 'hôte'); broadcast();
        return;
      } catch { await new Promise(r => setTimeout(r, waits[i])); }
    }
    // le serveur garde l'ancien code réservé un long moment : la partie repart sous un nouveau code,
    // avec les mêmes joueurs, les mêmes scores et la même manche en cours
    for (let i = 0; i < 5; i++) {
      const fresh = genCode();
      try {
        const peer = await makePeer(ROOM_PREFIX + fresh, 9000);
        net.peer = peer; net.code = fresh; net.game.s.code = fresh;
        attachHost(peer); setNet(true, 'hôte'); broadcast();
        toast(`Connexion rétablie sous un nouveau code : ${fresh} — repartage-le`, 8000);
        return;
      } catch { await new Promise(r => setTimeout(r, 2000)); }
    }
    setNet(false, 'hors ligne');
    toast('Pas de réseau : la partie reprendra quand la connexion reviendra', 6000);
    setTimeout(() => { reviving = false; reviveHost(); }, 10000);
  } finally { reviving = false; }
}
// retour sur la page : on vérifie tout de suite que la partie est encore joignable
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (net.isHost) reviveHost();
  else if (net.code && !net.hostConn?.open) joinGame(net.code).catch(() => { });
});

function makePeer(id, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, { debug: 0 });
    const timer = setTimeout(() => { try { peer.destroy(); } catch { } reject(new Error('timeout')); }, timeoutMs);
    peer.on('open', () => { clearTimeout(timer); resolve(peer); });
    peer.on('error', e => {
      clearTimeout(timer);
      if (e.type === 'unavailable-id') reject(new Error('code-taken'));
      else if (e.type === 'peer-unavailable') reject(new Error('no-room'));
      else reject(e);
    });
  });
}

async function hostGame() {
  const [songs, songsE, songsJV, , songsAnime] = await Promise.all([loadSongs(), loadSongsE(), loadSongsJV(), loadDecks(), loadSongsAnime()]);
  let code, peer;
  for (let i = 0; i < 5; i++) { code = genCode(); try { peer = await makePeer(ROOM_PREFIX + code); break; } catch (e) { if (e.message !== 'code-taken') throw e; } }
  if (!peer) throw new Error('Impossible de créer la salle');
  net.peer = peer; net.isHost = true; net.code = code; net.game = new Game(code, songs, songsE, songsJV, songsAnime);
  net.game.addPlayer(net.me, net.name, true);
  attachHost(peer);
  setNet(true, 'hôte');
  setInterval(() => { const g = net.game, before = g.s.phase; g.tick(); const sabChanged = sabTick() || (g.geo ? Geo.tick(g.geo) : false) || (g.chromo ? Chromo.tick(g.chromo) : false) || (g.kems ? Kems.tick(g.kems) : false) || (g.cm ? Camembert.tick(g.cm) : false) || (g.dz ? Douze.tick(g.dz) : false) || (g.pb ? PetitBac.tick(g.pb) : false) || (g.lw ? LoupGarou.tick(g.lw) : false) || (g.nf ? Naufrages.tick(g.nf) : false) || (g.so ? Solitaire.tick(g.so) : false) || (g.pk ? Poker.tick(g.pk) : false); if (sabChanged || before !== g.s.phase || g.s.phase === 'bet' || g.s.phase === 's-play') broadcast(); }, 500);
  broadcast();
}

function handleClientMessage(conn, m) {
  if (m.t === 'hello') { conn.metadata = { pid: m.pid }; net.conns.set(m.pid, conn); net.game.addPlayer(m.pid, m.name); if (net.game.sab) { try { conn.send({ t: 'sab-full', strokes: net.game.sab.strokes }); } catch { } } broadcast(); return; }
  const err = applyAction(m.pid, m);
  if (err === 'silent') return;
  if (err) { try { conn.send({ t: 'err', msg: err }); } catch { } }
  broadcast();
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
function broadcast() {
  const g = net.game, pub = g.publicState();
  if (g.sab) g._sabExtras = g.sabExtras();          // calculé une fois par diffusion
  for (const [pid, c] of net.conns) { try { c.send({ t: 'state', s: g.viewFor(pub, pid) }); } catch { } }
  view = g.viewFor(pub, net.me); render();
}
function sendAll(m, exceptPid = null) {
  for (const [pid, c] of net.conns) { if (pid !== exceptPid) { try { c.send(m); } catch { } } }
}

async function joinGame(code, tries = 3) {
  try { if (net.peer && !net.isHost) net.peer.destroy(); } catch { }
  const peer = await makePeer(undefined);
  net.peer = peer; net.isHost = false; net.code = code;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      await new Promise((resolve, reject) => {
        const conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
        const timer = setTimeout(() => reject(new Error('no-room')), 9000);
        conn.on('open', () => { clearTimeout(timer); net.hostConn = conn; conn.send({ t: 'hello', pid: net.me, name: net.name }); setNet(true, 'connecté'); resolve(); });
        conn.on('data', m => { if (m.t === 'state') { view = m.s; render(); } else if (m.t === 'err') toast(m.msg); else sabOnMessage(m); });
        conn.on('close', () => { setNet(false, 'reconnexion'); setTimeout(() => joinGame(code).catch(() => { }), 2500); });
        peer.on('error', e => { clearTimeout(timer); reject(e.type === 'peer-unavailable' ? new Error('no-room') : e); });
      });
      return;
    } catch (e) {
      // l'hôte est peut-être en train de revenir (téléphone déverrouillé) : on laisse une chance
      if (attempt >= tries) { try { peer.destroy(); } catch { } throw new Error('no-room'); }
      setNet(false, `tentative ${attempt + 1}/${tries}`);
      await new Promise(r => setTimeout(r, 2500));
    }
  }
}

function act(m) {
  if (net.isHost) { const err = applyAction(net.me, m); if (err === 'silent') return; if (err) toast(err); broadcast(); }
  else if (net.hostConn?.open) net.hostConn.send({ ...m, pid: net.me });
  else toast('Pas connecté à l\'hôte');
}
const isHostPlayer = () => net.isHost;

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
function sabTick() {
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
    case 'sab:amend': if (host && Array.isArray(m.ids)) { const n = Sablier.amendGuesses(r, m.ids); if (n) toast(`${n} carte${n > 1 ? 's' : ''} remise${n > 1 ? 's' : ''} dans la pile`); } return null;
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

// ============================================================ rendu
function render() {
  if (!view) return;
  // préserve la saisie en cours : un état reçu du réseau ne doit pas effacer ce qu'on tape
  const ae = document.activeElement;
  const keep = ae && ae.tagName === 'INPUT' && ae.id ? { id: ae.id, v: ae.value, a: ae.selectionStart, b: ae.selectionEnd } : null;
  const s = view;
  if (s.phase === 'lobby') { show('s-lobby'); renderLobby(s); }
  else if (s.phase === 'end') { show('s-end'); renderEnd(s); audio.pause(); }
  else if (s.phase === 'e-play' || s.phase === 'e-reveal') { show('s-eclair'); renderEclair(s); }
  else if (s.phase === 's-play' || s.phase === 's-reveal') { show('s-sprint'); renderSprint(s); }
  else if (s.phase === 'sab') { show('s-sablier'); renderSablier(s.sab); }
  else if (s.phase === 'uc') { show('s-undercover'); renderUndercover(s.uc); }
  else if (s.phase === 'geo') { show('s-geo'); renderGeo(s.geo); }
  else if (s.phase === 'ch') { show('s-chromo'); renderChromo(s.chromo); }
  else if (s.phase === 'km') { show('s-kems'); renderKems(s.kems); }
  else if (s.phase === 'cm') { show('s-camembert'); renderCamembert(s.cm); }
  else if (s.phase === 'mi') { show('s-mirage'); renderMirage(s.mi); }
  else if (s.phase === 'dz') { show('s-douze'); renderDouze(s.dz); }
  else if (s.phase === 'pb') { show('s-petitbac'); renderPetitBac(s.pb); }
  else if (s.phase === 'lw') { show('s-loupgarou'); renderLoupGarou(s.lw); }
  else if (s.phase === 'nf') { show('s-naufrages'); renderNaufrages(s.nf); }
  else if (s.phase === 'mm') { show('s-memes'); renderMemes(s.mm); }
  else if (s.phase === 'hl') { show('s-limite'); renderHorsLimite(s.hl); }
  else if (s.phase === 'so') { show('s-solitaire'); renderSolitaire(s.so); }
  else if (s.phase === 'pk') { show('s-poker'); renderPoker(s.pk); }
  else if (s.phase === 'dp') { show('s-diapason'); renderDiapason(s.dp); }
  else { show('s-game'); renderGame(s); }
  if (keep) {
    const n = document.getElementById(keep.id);
    if (n && n !== ae) { n.value = keep.v; n.focus({ preventScroll: true }); try { n.setSelectionRange(keep.a, keep.b); } catch { } n.dispatchEvent(new Event('input')); }
  }
}

// ------------------------------------------------ réglages partagés
// L'hôte résume son panneau d'options ; les invités voient les mêmes réglages en même temps que lui.
function readOpts(pick) {
  const box = document.getElementById('opts-' + pick); if (!box) return [];
  const items = [], clean = n => { const c = n.cloneNode(true); c.querySelectorAll('small, input, select').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
  box.querySelectorAll('fieldset, label.field.row').forEach(n => {
    if (n.closest('.km-pick') && n !== n.closest('.km-pick')) return;
    if (n.matches('fieldset.km-pick')) {                                   // Kems : la ligne qui récapitule les équipes
      const line = n.querySelector('.km-pickline'); if (line) items.push({ label: 'Équipes', value: line.textContent.replace(/\s+/g, ' ').replace(' Regardent', ' · Regardent').trim() });
      return;
    }
    if (n.matches('fieldset')) {
      const on = [...n.querySelectorAll('label')].filter(l => l.querySelector('input:checked')).map(clean);
      items.push({ label: (n.querySelector('legend')?.textContent || '').trim(), value: on.length ? on.join(', ') : 'aucun' });
      return;
    }
    const title = (n.querySelector('span')?.textContent || '').trim();
    const sel = n.querySelector('select'), chk = n.querySelector('input[type=checkbox]'), inp = n.querySelector('input:not([type=checkbox])');
    let value = '';
    if (sel) value = sel.selectedOptions[0]?.textContent.trim() || '';
    else if (chk) value = chk.checked ? 'Oui' : 'Non';
    else if (inp) { const unit = [...n.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent.trim()).filter(Boolean).join(' '); value = inp.value + (unit ? ' ' + unit : ''); }
    if (title) items.push({ label: title.replace('sur ce téléphone', 'sur le téléphone de l’hôte'), value });
  });
  return items;
}
let optsTimer = null, optsSent = '';
function queueOptsShare() {
  clearTimeout(optsTimer);
  optsTimer = setTimeout(() => {
    const pick = view?.pick; if (!pick || !isHostPlayer() || view.phase !== 'lobby') return;
    const items = readOpts(pick), key = pick + JSON.stringify(items);
    if (key === optsSent) return;                                          // rien de neuf : pas de diffusion
    optsSent = key; act({ t: 'opts', key: pick, items });
  }, 250);
}
// toute modification du panneau (clic, saisie, options construites à la volée) déclenche l'envoi
['input', 'change', 'click'].forEach(ev => document.getElementById('lobby-opts').addEventListener(ev, () => queueOptsShare()));
new MutationObserver(() => queueOptsShare()).observe(document.getElementById('lobby-opts'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });

function renderGuestOpts(s) {
  const box = $('#lobby-guest-opts');
  const show = !isHostPlayer() && !!s.pick && !!s.pickOpts?.length;
  box.hidden = !show; if (!show) return;
  box.innerHTML = `<p class="eyebrow">Réglages de l'hôte · ${esc(GAMES[s.pick].name)}</p>`
    + `<dl>${s.pickOpts.map(o => `<div><dt>${esc(o.label)}</dt><dd>${esc(o.value)}</dd></div>`).join('')}</dl>`
    + `<p class="fine">Mis à jour en direct : l'hôte lance la partie quand tout le monde est prêt.</p>`;
}

// ------------------------------------------------ podiums des parties du salon
function renderHistory(s) {
  const box = $('#lobby-history'), list = s.history || [];
  box.hidden = !list.length; if (!list.length) { box.innerHTML = ''; return; }
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'à l\u2019instant' : m < 60 ? `il y a ${m} min` : `il y a ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  const medal = ['🥇', '🥈', '🥉'];
  box.innerHTML = `<div class="hist-head"><h2 class="section-title">Parties de ce salon</h2>${isHostPlayer() ? '<button class="btn ghost small" id="hist-clear" type="button">Effacer</button>' : ''}</div>`
    + '<div class="hist-list">' + list.map(h => {
      const p = h.podium;
      const pod = h.team
        ? `<p class="hist-note">${esc(h.note || '')}</p>${p.length ? `<p class="hist-winners">🏆 ${p.map(x => esc(x.name)).join(', ')}</p>` : ''}`
        : `<div class="podium">${[1, 0, 2].filter(i => p[i]).map(i => `<div class="pod pod${i + 1}"><span class="pod-name">${esc(p[i].name)}</span><span class="pod-score">${p[i].score ?? ''} ${esc(h.unit || '')}</span><span class="pod-step">${medal[i]}</span></div>`).join('')}</div>${h.low ? '<p class="hist-note">le plus bas gagne</p>' : ''}`;
      return `<article class="hist-card g-${esc(h.game)}"><div class="hist-top"><b class="gname">${esc(h.name)}</b><small>${ago(h.when)}</small></div>${pod}</article>`;
    }).join('') + '</div>';
  const c = $('#hist-clear'); if (c) c.onclick = () => askConfirm('Effacer l\u2019historique', 'Les podiums des parties de ce salon disparaissent pour tout le monde.', 'Effacer', () => act({ t: 'history-clear' }));
}

// ------------------------------------------------ salon
function renderLobby(s) {
  $('#lobby-code').textContent = s.code;
  const wrap = $('#lobby-players'); wrap.innerHTML = '';
  s.players.forEach(p => {
    const c = el('div', 'chip' + (p.host ? ' host' : '') + (p.online ? '' : ' off'));
    c.innerHTML = `<span class="dot">${(p.name[0] || '?').toUpperCase()}</span>${p.name}${p.host ? ' · hôte' : ''}`;
    wrap.appendChild(c);
  });
  document.querySelectorAll('.gcard').forEach(b => {
    b.setAttribute('aria-pressed', String(s.pick === b.dataset.game));
    b.disabled = !isHostPlayer();
    b.style.opacity = !isHostPlayer() && s.pick && s.pick !== b.dataset.game ? '.5' : '';
  });
  famApply();
  if (isHostPlayer() && !$('#opt-cats').querySelector('label') && songsCache) {
    [...new Set(songsCache.map(x => x.cat))].forEach(c => {
      const l = el('label'); l.innerHTML = `<input type="checkbox" value="${c}" checked>${c}`; $('#opt-cats').appendChild(l);
    });
  }
  const chosen = !!s.pick;
  $('#lobby-opts').hidden = !(isHostPlayer() && chosen);
  $('#opts-timeline').hidden = s.pick !== 'timeline';
  $('#opts-eclair').hidden = s.pick !== 'eclair';
  $('#opts-sprint').hidden = s.pick !== 'sprint';
  $('#opts-sablier').hidden = s.pick !== 'sablier';
  $('#opts-undercover').hidden = s.pick !== 'undercover';
  $('#opts-geo').hidden = s.pick !== 'geo';
  $('#opts-chromo').hidden = s.pick !== 'chromo';
  $('#opts-kems').hidden = s.pick !== 'kems';
  $('#opts-mirage').hidden = s.pick !== 'mirage';
  $('#opts-douze').hidden = s.pick !== 'douze';
  $('#opts-petitbac').hidden = s.pick !== 'petitbac';
  $('#opts-loupgarou').hidden = s.pick !== 'loupgarou';
  $('#opts-naufrages').hidden = s.pick !== 'naufrages';
  $('#opts-memes').hidden = s.pick !== 'memes';
  $('#opts-limite').hidden = s.pick !== 'limite';
  $('#opts-solitaire').hidden = s.pick !== 'solitaire';
  $('#opts-poker').hidden = s.pick !== 'poker';
  $('#opts-diapason').hidden = s.pick !== 'diapason';
  if (isHostPlayer() && s.pick === 'memes') Memes.load(ASSET_V).then(() => { const all = Memes.count(); $('#opt-mm-count').textContent = all ? `${all} mèmes et GIF de la bibliothèque publique d\u2019Imgflip, et ${Memes.PROMPTS.length} situations.` : 'Mèmes introuvables.'; });
  if (isHostPlayer() && s.pick === 'loupgarou') { const n = s.players.filter(p => p.online).length; $('#opt-lw-count').textContent = n < 5 ? `${n} joueur${n > 1 ? 's' : ''} : il en faut au moins 5.` : `${n} joueurs : ${LoupGarou.autoWolves(n)} loup${LoupGarou.autoWolves(n) > 1 ? 's' : ''} en automatique.`; }
  if (isHostPlayer() && s.pick === 'petitbac') renderPetitBacOpts();
  if (isHostPlayer() && s.pick === 'mirage') Mirage.load(ASSET_V).then(() => { const set = $('#opt-mi-cards').value, n = Mirage.count(set); $('#opt-mi-count').textContent = !n ? 'Cartes introuvables.' : set === 'art' ? `${n} cartes, des œuvres du domaine public (Met, Cleveland Museum of Art).` : set === 'memes' ? `${n} mèmes et GIF de la bibliothèque publique d\u2019Imgflip.` : `${n} cartes : tableaux, mèmes et GIF mélangés.`; });
  if (isHostPlayer() && s.pick === 'camembert') Camembert.load(ASSET_V).then(() => { const n = Camembert.count(); $('#opt-cm-count').textContent = n ? `${n} questions dans la boîte, réparties en six couleurs.` : 'Questions introuvables.'; });
  if (isHostPlayer() && s.pick === 'kems') renderKemsOpts(s);
  if (isHostPlayer() && s.pick === 'sablier' && !$('#opt-sab-decks').querySelector('label') && Sablier.deckIds().length) {
    Sablier.summary().forEach(d => { const l = el('label'); l.innerHTML = `<input type="checkbox" value="${d.id}" checked>${d.name} <small>${d.count}</small>`; $('#opt-sab-decks').appendChild(l); });
    const refresh = () => {
      const decks = [...$('#opt-sab-decks').querySelectorAll('input:checked')].map(i => i.value);
      const diff = [...$('#opt-sab-diff').querySelectorAll('input:checked')].map(i => +i.value);
      const n = Sablier.pool(decks, diff, null).length, need = s.players.length * (+$('#opt-sab-deal').value || 12);
      $('#opt-sab-count').textContent = `${n} cartes disponibles, ${need} nécessaires pour ${s.players.length} joueur${s.players.length > 1 ? 's' : ''}.`;
    };
    $('#opts-sablier').addEventListener('input', refresh); refresh();
  }
  renderHistory(s);
  $('#lobby-wait').hidden = isHostPlayer();
  $('#lobby-wait').textContent = chosen ? `L'hôte prépare une partie de ${GAMES[s.pick].name}…` : 'L\'hôte choisit le jeu…';
  renderGuestOpts(s);
  if (isHostPlayer() && chosen) queueOptsShare();
}

// ------------------------------------------------ Décennies
let lastTurnKey = null, betArmed = false, lastTlKey = null;

function renderGame(s) {
  const me = s.players.find(p => p.id === net.me);
  const active = s.players[s.turn % s.players.length];
  const isMe = active.id === net.me;
  const r = s.result;
  if (s.phase !== 'bet') betArmed = false;

  // scores
  const sb = $('#scoreboard'); sb.innerHTML = '';
  s.players.forEach(p => {
    const d = el('div', 'sb' + (p.id === active.id ? ' active' : '') + (p.id === net.me ? ' me' : ''));
    d.innerHTML = `<span class="name">${p.name}</span><span class="stats"><span><b>${p.timeline.length}</b>/${s.target}</span>${s.solo ? '' : `<span class="tok"><b>${p.tokens}</b> ●</span>`}</span>`;
    if (!p.online) d.style.opacity = .45;
    sb.appendChild(d);
  });

  // bandeau
  const nameOf = id => s.players.find(p => p.id === id)?.name;
  const b = $('#turn-banner');
  const iAmBettor = s.bet?.pid === net.me;
  if (s.phase === 'listen') {
    b.innerHTML = !isMe ? `${active.name} écoute<small>Prépare-toi : tu pourras parier qu'il se trompe.</small>`
      : s.solo ? `Carte ${me.timeline.length + 1}<small>Écoute, puis touche le « + » où la chanson se place. Objectif : ${s.target} cartes.</small>`
        : `À toi de jouer<small>Écoute, puis touche le « + » où la chanson se place dans ta frise.</small>`;
  } else if (s.phase === 'bet') {
    const t = `<span class="timer">${s.betLeft}s</span>`;
    if (s.bet && s.bet.idx == null) b.innerHTML = iAmBettor ? `Ton pari ${t}<small>Touche le « + » où TOI tu placerais la chanson.</small>` : `${nameOf(s.bet.pid)} a pris le pari ${t}<small>Un seul pari par tour. On attend son choix.</small>`;
    else b.innerHTML = isMe ? `Ton choix est posé ${t}<small>Quelqu'un peut encore parier contre toi.</small>` : `${active.name} a choisi ${t}<small>Tu penses qu'il se trompe ? Prends le pari.</small>`;
  } else if (s.phase === 'reveal') {
    const win = r.by ? nameOf(r.by) : null;
    const head = s.solo ? (r.ok ? 'Bien vu' : 'Raté') : (r.ok ? `${nameOf(r.activeId)} a trouvé` : (r.betWon ? `Raté ! ${win} rafle la carte` : `${nameOf(r.activeId)} s'est trompé`));
    const bits = [];
    if (r.tokenWon === true) bits.push(`Artiste et titre justes : +1 jeton.`);
    if (r.betPid && !r.betWon) bits.push(`Pari perdu pour ${nameOf(r.betPid)} : 1 jeton${r.lost ? ` et la carte ${r.lost}` : ''} en moins.`);
    if (s.winner) bits.push('Frise complète, partie terminée.');
    const fallback = s.solo ? (r.ok ? 'La carte rejoint ta frise.' : 'Cette carte est écartée, on enchaîne.') : 'Touche « Tour suivant » quand tout le monde a vu.';
    b.innerHTML = `${head}<small>${bits.join(' ') || fallback}</small>`;
  }

  // scène
  const speakerHere = s.soundAll || (s.speakerId ? s.speakerId === net.me : isMe);
  loadAudio(s.current?.preview);
  const vinyl = $('#vinyl'), info = $('#track-info');
  if (s.phase === 'reveal') {
    vinyl.classList.add('revealed'); $('#art').src = r.song.art;
    info.innerHTML = `<div class="big ${r.ok || r.betWon ? 'ok' : 'ko'}">${r.year}</div>${r.song.artist}<small>${r.song.title}</small>`;
  } else {
    vinyl.classList.remove('revealed'); $('#art').removeAttribute('src');
    info.innerHTML = speakerHere ? '' : `<small>Le son sort du téléphone de ${s.speakerId ? nameOf(s.speakerId) : active.name}.</small>`;
  }
  $('#audio-row').hidden = !(speakerHere || s.phase === 'reveal');
  const key = s.turn + ':' + (s.current?.preview || '');
  if (s.phase === 'listen' && speakerHere && lastTurnKey !== key) { lastTurnKey = key; audio.currentTime = 0; audio.play().catch(() => { }); }

  // frise
  const owner = s.phase === 'reveal' && r.betWon ? s.players.find(p => p.id === r.by) : active;
  $('#tl-owner').textContent = owner.id === net.me ? 'Ta frise' : `Frise de ${owner.name}`;
  const tl = $('#timeline');
  const cards = owner.timeline;
  const canPlace = s.phase === 'listen' && isMe;
  const canBetPlace = s.phase === 'bet' && iAmBettor && s.bet.idx == null;
  // La frise n'est reconstruite que si elle change. Avant, chaque diffusion (chrono du pari,
  // saisie d'un autre joueur) la vidait : elle revenait au début et le « + » de droite fuyait.
  const tlKey = [s.turn, owner.id, s.phase, cards.map(c => c.at).join('.'), s.placement, s.bet?.idx, canPlace, canBetPlace, r?.placement, r?.ok, r?.betWon].join('|');
  if (tlKey !== lastTlKey) {
  const sameTurn = !!lastTlKey && lastTlKey.split('|').slice(0, 2).join('|') === tlKey.split('|').slice(0, 2).join('|');
  const keepScroll = tl.scrollLeft;
  lastTlKey = tlKey; tl.innerHTML = '';

  if (s.phase === 'reveal') {                       // révélation : cartes seules, plus de « + »
    const ghostAt = r.ok || r.betWon ? -1 : r.placement;
    cards.forEach((c, i) => {
      if (i === ghostAt) tl.appendChild(ghostCard(r));
      const card = el('div', 'tcard' + (r.by === owner.id && c.year === r.year && c.at === maxAt(cards) ? ' new' : ''));
      card.innerHTML = cardHTML(c); tl.appendChild(card);
    });
    if (ghostAt >= cards.length) tl.appendChild(ghostCard(r));
  } else {
    for (let i = 0; i <= cards.length; i++) {
      const slot = el('div', 'slot', '+');
      if (s.placement != null && i === s.placement) { slot.classList.add('pick'); slot.dataset.who = active.name; }
      if (s.bet?.idx === i) { slot.classList.add('bet'); slot.dataset.bet = nameOf(s.bet.pid); }
      if (canBetPlace && i !== s.placement) slot.classList.add('arm');
      if (!(canPlace || canBetPlace)) slot.classList.add('disabled');
      slot.onclick = () => {
        if (canPlace) act({ t: 'place', idx: i });
        else if (canBetPlace) { if (i === s.placement) toast(`C'est déjà le choix de ${active.name}`); else act({ t: 'bet-place', idx: i }); }
      };
      tl.appendChild(slot);
      if (i < cards.length) { const c = el('div', 'tcard'); c.innerHTML = cardHTML(cards[i]); tl.appendChild(c); }
    }
  }
  if (sameTurn) tl.scrollLeft = keepScroll;
  requestAnimationFrame(() => { const t = tl.querySelector('.pick,.new,.lost,.arm'); if (t) t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });
  }

  // actions
  const ac = $('#actions'); ac.innerHTML = '';
  if (s.phase === 'listen' && isMe && s.solo) {
    const sk = el('button', 'btn', 'Je ne connais pas · chanson suivante');
    sk.onclick = () => act({ t: 'solo-skip' }); ac.appendChild(sk);
    ac.appendChild(el('div', 'note', 'Seul, tu passes autant de chansons que tu veux : ni jetons, ni paris.'));
  }
  if (s.phase === 'listen' && isMe && !s.solo) {
    ac.appendChild(el('div', 'note', 'Tu connais la chanson ? Écris artiste <b>et</b> titre : +1 jeton si les deux sont justes.'));
    const g = el('div', 'guess');
    g.innerHTML = `<input id="g-artist" placeholder="Artiste" autocomplete="off"><input id="g-title" placeholder="Titre" autocomplete="off">`;
    ac.appendChild(g);
    const send = () => { const a = $('#g-artist').value, t = $('#g-title').value; if (a || t) act({ t: 'guess', artist: a, title: t }); };
    $('#g-artist').onchange = send; $('#g-title').onchange = send;
    if (s.guess) { $('#g-artist').value = s.guess.artist; $('#g-title').value = s.guess.title; }
  }
  if (s.phase === 'bet' && !isMe && me) {
    if (iAmBettor && s.bet.idx == null) {
      const c = el('button', 'btn ghost', 'Annuler mon pari'); c.onclick = () => act({ t: 'cancel-bet' }); ac.appendChild(c);
    } else if (s.bet) {
      ac.appendChild(el('div', 'note', `${nameOf(s.bet.pid)} a pris le pari de ce tour.`));
    } else if (s.passes.includes(me.id)) {
      ac.appendChild(el('div', 'note', 'Tu ne paries pas. On attend les autres.'));
    } else if (me.tokens < 1) {
      ac.appendChild(el('div', 'note', 'Plus de jeton : tu ne peux pas parier ce tour.'));
    } else {
      const row = el('div', 'row');
      const b1 = el('button', 'btn primary', `Je prends le pari <span class="cost">1 ●</span>`);
      b1.onclick = () => act({ t: 'claim' });
      const b2 = el('button', 'btn', 'Je passe'); b2.onclick = () => act({ t: 'pass' });
      row.append(b1, b2); ac.appendChild(row);
      ac.appendChild(el('div', 'note', `Un seul joueur peut parier par tour, le premier qui se lance. S'il se trompe, tu perds le jeton <b>et</b> une carte.`));
    }
  }
  if (me && !s.solo && ['listen', 'bet'].includes(s.phase)) ac.appendChild(tokenLine(me.tokens));
  if (s.phase === 'reveal') {
    const btn = el('button', 'btn lg ' + (s.winner ? 'pos' : 'primary'), s.winner ? (s.solo ? 'Voir le résultat' : 'Voir le classement') : (s.solo ? 'Chanson suivante →' : 'Tour suivant →'));
    btn.onclick = () => act({ t: 'next' }); ac.appendChild(btn);
  }
  if (['listen', 'bet'].includes(s.phase) && !isMe && !active.online) {
    const f = el('button', 'btn ghost small', `${active.name} est déconnecté · passer son tour`); f.onclick = () => act({ t: 'force-next' }); ac.appendChild(f);
  }
}
const maxAt = cards => Math.max(...cards.map(c => c.at || 0));
const cardHTML = c => `<img src="${c.art}" alt=""><b>${c.year}</b><small>${c.artist}<br>${c.title}</small>`;
// Frise : la molette défile à l'horizontale et on peut la tirer à la souris,
// sans que le glisser ne déclenche un « + » par erreur.
(function timelineScroll() {
  const tl = $('#timeline'); if (!tl) return;
  tl.addEventListener('wheel', e => {
    if (tl.scrollWidth <= tl.clientWidth + 2) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { tl.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });
  let down = null, dragged = false;
  tl.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && tl.scrollWidth > tl.clientWidth + 2) { down = { x: e.clientX, left: tl.scrollLeft }; dragged = false; } });
  window.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - down.x; if (Math.abs(dx) > 6) dragged = true; if (dragged) tl.scrollLeft = down.left - dx; });
  window.addEventListener('pointerup', () => { down = null; });
  tl.addEventListener('click', e => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
})();
function ghostCard(r) { const g = el('div', 'tcard lost'); g.innerHTML = cardHTML({ ...r.song, year: r.year }); return g; }
function tokenLine(n) {
  const d = el('div', 'tokline');
  d.innerHTML = Array.from({ length: TOKEN_MAX }, (_, i) => `<span class="pip${i < n ? '' : ' off'}"></span>`).join('') + `<span>${n} jeton${n > 1 ? 's' : ''} · sert à parier</span>`;
  return d;
}

// ------------------------------------------------ Éclair
let eSnippetLimit = 0, eLastRound = null, eCatalog = null, ePoll = null, eSeen = false, eSafety = null, eActionsKey = null, eReveal = false;
// en révélation l'extrait complet se met en pause comme un lecteur normal ; pendant les
// paliers le bouton relance toujours depuis le début, donc son libellé ne change pas.
function syncELabel() {
  const l = document.getElementById('e-label'); if (!l) return;
  l.textContent = !eReveal ? '▶ Écouter'
    : !audio.paused ? '❚❚ Pause'
      : audio.currentTime > 0.05 && audio.currentTime < (audio.duration || 30) - 0.15 ? '▶ Reprendre' : '▶ Écouter';
}
audio.addEventListener('play', syncELabel);
audio.addEventListener('pause', syncELabel);
audio.addEventListener('ended', syncELabel);

function stopSnippet() { clearInterval(ePoll); ePoll = null; clearTimeout(eSafety); eSnippetLimit = 0; eSeen = false; audio.pause(); $('#e-vinyl').classList.remove('pulse'); drawSeg(); }
function playSnippet(sec) {
  if (!audio.src) return;
  clearInterval(ePoll); clearTimeout(eSafety); eSnippetLimit = sec; eSeen = false;
  audio.pause(); try { audio.currentTime = 0; } catch { }
  $('#e-vinyl').classList.add('pulse');
  audio.play().catch(() => toast('Touche à nouveau pour lancer le son'));
  // Surveillance fine : Safari iOS ignore parfois le retour à zéro tant que le son n'est pas
  // chargé, et sa position avance avant que le son ne sorte. On ne coupe qu'après avoir vu
  // la lecture repartir du début, avec une marge pour la latence.
  ePoll = setInterval(() => {
    if (!eSnippetLimit) { clearInterval(ePoll); return; }
    const t = audio.currentTime;
    if (t < eSnippetLimit) eSeen = true;
    else if (eSeen) { if (t >= eSnippetLimit + E_GRACE) stopSnippet(); }
    else if (!audio.paused && t > eSnippetLimit + 0.3) { try { audio.currentTime = 0; } catch { } }
    drawSeg();
  }, 20);
  eSafety = setTimeout(stopSnippet, (sec + 4) * 1000);
}
audio.addEventListener('timeupdate', drawSeg);
function drawSeg() {
  const bar = $('#e-segbar'); if (!bar.children.length || $('#s-eclair').hidden) return;
  let start = 0;
  [...bar.children].forEach((seg, i) => {
    const end = E_LEVELS[i], b = seg.querySelector('b');
    const t = eSnippetLimit ? Math.min(audio.currentTime, eSnippetLimit) : audio.currentTime;
    b.style.width = (Math.max(0, Math.min(1, (t - start) / (end - start))) * 100) + '%';
    start = end;
  });
}

function renderEclair(s) {
  const e = s.eclair[net.me] || { level: 0, done: false, points: 0, tries: [] };
  const reveal = s.phase === 'e-reveal';

  const sb = $('#e-scoreboard'); sb.innerHTML = '';
  [...s.players].forEach(p => {
    const d = el('div', 'sb' + (p.id === net.me ? ' me' : ''));
    d.innerHTML = `<span class="name">${p.name}</span><span class="stats"><span><b>${p.score || 0}</b> pts</span></span>`;
    if (!p.online) d.style.opacity = .45;
    sb.appendChild(d);
  });

  const b = $('#e-banner');
  if (!reveal) b.innerHTML = e.done
    ? `Manche ${s.round}/${s.rounds} <span class="pts">${e.points ? '+' + e.points : '0'} pt${e.points > 1 ? 's' : ''}</span><small>On attend les autres…</small>`
    : `Manche ${s.round}/${s.rounds}<small>Écoute ${fmtS(E_LEVELS[e.level])}. ${s.current?.jv ? 'Le nom du jeu' : 'Le titre'} maintenant vaut <b class="pts">${E_POINTS[e.level]} pt${E_POINTS[e.level] > 1 ? 's' : ''}</b>.</small>`;
  else b.innerHTML = `Manche ${s.round}/${s.rounds} terminée<small>${s.round >= s.rounds ? 'Dernière manche. Place au classement.' : 'Touche « Manche suivante » quand tout le monde a vu.'}</small>`;

  loadAudio(s.current?.preview);
  if (s.round !== eLastRound) { eLastRound = s.round; stopSnippet(); $('#e-vinyl').classList.remove('revealed'); }
  const stage = $('#e-vinyl'), info = $('#e-info');
  if (reveal) { stage.classList.add('revealed'); $('#e-art').src = s.current.art; info.innerHTML = `<div class="big ok">${s.current.title}</div>${s.current.artist}<small>${s.current.jv ? s.current.sub : s.current.year}</small>`; }
  else { $('#e-art').removeAttribute('src'); info.innerHTML = e.tries.length ? `<small>Raté : ${e.tries.map(t => t.title).join(' · ')}</small>` : ''; }

  const bar = $('#e-segbar'); bar.innerHTML = ''; let prev = 0;
  E_LEVELS.forEach((sec, i) => {
    const seg = el('i'); seg.style.setProperty('--w', sec - prev); seg.dataset.s = fmtS(sec);
    if (i <= e.level || reveal) seg.classList.add('open');
    seg.innerHTML = '<b></b>'; bar.appendChild(seg); prev = sec;
  });
  const lim = reveal ? 30 : E_LEVELS[e.level];
  eReveal = reveal;
  if (reveal && eSnippetLimit) stopSnippet();      // un palier en cours ne survit pas à la révélation
  $('#e-len').textContent = reveal ? '30 s' : fmtS(lim);
  $('#e-play').onclick = () => {
    if (!reveal) { playSnippet(lim); return; }
    if (!audio.paused) { audio.pause(); return; }
    if (audio.ended || audio.currentTime >= (audio.duration || 30) - 0.15) { try { audio.currentTime = 0; } catch { } }
    audio.play().catch(() => toast('Touche à nouveau pour lancer le son'));
  };
  syncELabel();

  const ac = $('#e-actions');
  const key = `${s.phase}|${s.round}|${e.level}|${e.done}|${e.tries.length}`;
  if (key === eActionsKey && ac.children.length) { renderEOthers(s, reveal); return; }
  eActionsKey = key; ac.innerHTML = '';

  if (!reveal && !e.done) {
    const submitE = input => { const t = input.value.trim(); if (!t) return; act({ t: 'e-guess', title: t }); input.value = ''; };
    const jvNow = !!s.current?.jv;
    ac.appendChild(makeGuessBox('e-input', jvNow ? 'Nom du jeu…' : 'Titre de la chanson…', submitE, q => {
      const games = (s.jv ? (jvCatalog || []).map(x => ({ label: x.game, sub: 'jeu vidéo', fill: x.game })) : []).concat(s.anime ? (animeCatalog || []).map(x => ({ label: x.game, sub: 'anime', fill: x.game })) : []).filter(x => norm(x.label).includes(q));
      const songs = (eCatalog || []).filter(x => norm(x.title).includes(q) || norm(x.artist).includes(q)).map(x => ({ label: x.title, sub: x.artist, fill: x.title }));
      return (jvNow ? games.concat(songs) : songs.concat(games)).slice(0, 6);
    }));
    const row = el('div', 'row');
    row.innerHTML = `<button class="btn primary" id="e-submit">Valider</button>`
      + (e.level < E_LEVELS.length - 1 ? `<button class="btn" id="e-more">Écouter plus <span class="cost">${fmtS(E_LEVELS[e.level + 1])} · ${E_POINTS[e.level + 1]} pt${E_POINTS[e.level + 1] > 1 ? 's' : ''}</span></button>` : '')
      + `<button class="btn ghost small" id="e-giveup">Je passe</button>`;
    ac.appendChild(row);
    ac.appendChild(el('div', 'note', 'Un titre faux débloque automatiquement le palier suivant.'));
    $('#e-submit').onclick = () => submitE($('#e-input'));
    if ($('#e-more')) $('#e-more').onclick = () => act({ t: 'e-unlock' });
    $('#e-giveup').onclick = () => act({ t: 'e-giveup' });
  }
  if (reveal) {
    const res = el('div', 'round-res');
    s.players.forEach(p => {
      const x = s.eclair[p.id] || {};
      res.appendChild(el('div', '', `<span>${p.name}</span><span>${x.points ? `<b class="pts">+${x.points}</b> à ${fmtS(E_LEVELS[x.level])}` : '<span style="color:var(--neg)">pas trouvé</span>'}</span>`));
    });
    ac.appendChild(res);
    const btn = el('button', 'btn lg ' + (s.round >= s.rounds ? 'pos' : 'primary'), s.round >= s.rounds ? 'Voir le classement' : 'Manche suivante →');
    btn.onclick = () => act({ t: 'e-next' }); ac.appendChild(btn);
  }
  renderEOthers(s, reveal);
}
// champ de saisie avec suggestions issues du catalogue, partagé par Éclair et Sprint
function makeGuessBox(inputId, placeholder, onSubmit, source) {
  const box = el('div', 'guess-box');
  box.innerHTML = `<input id="${inputId}" placeholder="${placeholder}" autocomplete="off" autocapitalize="off"><div class="suggest" id="${inputId}-sug" hidden></div>`;
  setTimeout(() => {
    const input = document.getElementById(inputId), sug = document.getElementById(inputId + '-sug');
    if (!input) return;
    let hl = -1, items = [];
    const draw = () => {
      sug.innerHTML = '';
      items.forEach((it, i) => {
        const d = el('div', i === hl ? 'hl' : ''); d.innerHTML = `${it.label}${it.sub ? ` <small>· ${it.sub}</small>` : ''}`;
        d.onmousedown = ev => { ev.preventDefault(); input.value = it.fill; sug.hidden = true; input.focus(); };
        sug.appendChild(d);
      });
      sug.hidden = !items.length;
    };
    input.oninput = () => {
      const q = norm(input.value); hl = -1;
      items = q.length < 2 ? [] : source(q);
      draw();
    };
    input.onkeydown = ev => {
      if (ev.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); draw(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { hl = Math.max(0, hl - 1); draw(); ev.preventDefault(); }
      else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (hl >= 0) { input.value = items[hl].fill; sug.hidden = true; hl = -1; items = []; draw(); return; }
        onSubmit(input);
      }
    };
    input.onblur = () => setTimeout(() => { if (sug) sug.hidden = true; }, 150);
  }, 0);
  return box;
}

// ------------------------------------------------ Sprint
let spLastRound = null, spActionsKey = null, spRevealKey = null;
function syncSPLabel() {
  const b = document.getElementById('sp-play'); if (!b || $('#s-sprint').hidden) return;
  b.textContent = audio.paused ? '▶ Lancer le son' : '❚❚ Pause';
}
audio.addEventListener('play', syncSPLabel);
audio.addEventListener('pause', syncSPLabel);
audio.addEventListener('ended', syncSPLabel);
function renderSprint(s) {
  const me = s.players.find(p => p.id === net.me);
  const e = s.sprint[net.me] || { tries: 0, done: false, points: 0, rank: 0 };
  const reveal = s.phase === 's-reveal';
  const nameOf = id => s.players.find(p => p.id === id)?.name;

  const sb = $('#sp-scoreboard'); sb.innerHTML = '';
  s.players.forEach(p => {
    const d = el('div', 'sb' + (p.id === net.me ? ' me' : ''));
    d.innerHTML = `<span class="name">${p.name}</span><span class="stats"><span><b>${p.score || 0}</b> pts</span></span>`;
    if (!p.online) d.style.opacity = .45;
    sb.appendChild(d);
  });

  const b = $('#sp-banner');
  if (!reveal) {
    const left = SP_TRIES - e.tries;
    b.innerHTML = e.done
      ? `Manche ${s.round}/${s.rounds}${e.points ? ` · <span class="pts">+${e.points}</span>` : ''}<small>${e.points ? `${e.rank}${e.rank === 1 ? 'er' : 'e'} à trouver. On attend les autres.` : 'Manche finie pour toi, on attend les autres.'}</small>`
      : `Manche ${s.round}/${s.rounds} <span class="timer">${s.spLeft}s</span><small>${s.current?.kind === 'anime' ? 'De quel anime vient cette musique ?' : s.current?.jv ? 'De quel jeu vient cette musique ?' : 'Artiste et titre, le plus vite possible.'} ${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.</small>`;
  } else b.innerHTML = `Manche ${s.round}/${s.rounds} terminée<small>${s.round >= s.rounds ? 'Dernière manche. Place au classement.' : 'Touche « Manche suivante » quand tout le monde a vu.'}</small>`;

  // audio : tout le monde en même temps, sauf si l'hôte fait enceinte
  loadAudio(s.current?.preview);
  const speakerHere = s.soundAll || s.speakerId === net.me;
  const stage = $('#sp-stage'), info = $('#sp-info');
  if (s.round !== spLastRound) {
    spLastRound = s.round; stage.classList.remove('revealed');
    if (speakerHere && !reveal) { try { audio.currentTime = 0; } catch { } audio.play().catch(() => { }); }
  }
  $('#sp-clock').textContent = reveal ? '' : s.spLeft;
  stage.classList.toggle('hot', !reveal && s.spLeft <= 5);
  if (reveal) {
    stage.classList.add('revealed'); $('#sp-art').src = s.current.art;
    info.innerHTML = `<div class="big ok">${s.current.title}</div>${s.current.artist}<small>${s.current.jv ? s.current.sub : s.current.year}</small>`;
    // couper une seule fois à l'entrée en révélation, sinon on empêcherait la réécoute
    if (spRevealKey !== s.round) { spRevealKey = s.round; audio.pause(); }
  } else {
    $('#sp-art').removeAttribute('src');
    info.innerHTML = speakerHere ? '' : `<small>Le son sort du téléphone de ${nameOf(s.speakerId) || 'l\'hôte'}.</small>`;
  }
  $('#sp-audio').hidden = !speakerHere && !reveal;
  syncSPLabel();
  $('#sp-play').onclick = () => { if (audio.paused) audio.play().catch(() => toast('Touche à nouveau pour lancer le son')); else audio.pause(); };
  const pr = $('#sp-prog'); if (pr) pr.style.width = reveal ? '100%' : (100 - (s.spLeft / (SP_ROUND_MS / 1000)) * 100) + '%';

  const ac = $('#sp-actions');
  const key = `${s.phase}|${s.round}|${e.done}|${e.tries}|${s.current?.kind || !!s.current?.jv}`;
  if (key === spActionsKey && ac.children.length) { renderSPOthers(s, reveal); return; }
  spActionsKey = key; ac.innerHTML = '';

  if (!reveal && !e.done) {
    const submit = input => { const t = input.value.trim(); if (!t) return; act({ t: 'sp-guess', text: t }); input.value = ''; };
    const jvNow = !!s.current?.jv;
    const source = q => {
      const games = (s.jv ? (jvCatalog || []).map(x => ({ label: x.game, sub: 'jeu vidéo', fill: x.game })) : []).concat(s.anime ? (animeCatalog || []).map(x => ({ label: x.game, sub: 'anime', fill: x.game })) : []).filter(x => norm(x.label).includes(q));
      const songs = (eCatalog || []).filter(x => norm(x.title).includes(q) || norm(x.artist).includes(q)).map(x => ({ label: x.title, sub: x.artist, fill: `${x.title} — ${x.artist}` }));
      return (jvNow ? games.concat(songs) : songs.concat(games)).slice(0, 6);
    };
    ac.appendChild(makeGuessBox('sp-input', jvNow ? (s.current?.kind === 'anime' ? "Nom de l'anime…" : 'Nom du jeu…') : 'Titre et artiste…', submit, source));
    const row = el('div', 'row');
    row.innerHTML = `<button class="btn primary" id="sp-submit">Valider</button><button class="btn ghost small" id="sp-pass">Je sèche</button>`;
    ac.appendChild(row);
    ac.appendChild(el('div', 'note', jvNow ? (s.current?.kind === 'anime' ? 'Choisis dans la liste : les animés y sont tous.' : 'Choisis dans la liste : les jeux y sont tous.') : 'Choisis dans la liste : elle remplit le titre <b>et</b> l\'artiste d\'un coup.'));
    $('#sp-submit').onclick = () => submit($('#sp-input'));
    $('#sp-pass').onclick = () => act({ t: 'sp-giveup' });
  }
  if (reveal) {
    const pod = el('div', 'podium');
    s.order.forEach((pid, i) => {
      const x = s.sprint[pid] || {};
      pod.appendChild(el('div', '', `<span class="pos">${i + 1}</span><span class="who">${nameOf(pid)}</span><span class="gain">+${x.points}</span>`));
    });
    s.players.filter(p => !s.order.includes(p.id)).forEach(p => {
      pod.appendChild(el('div', '', `<span class="pos">–</span><span class="who">${p.name}</span><span class="miss">pas trouvé</span>`));
    });
    ac.appendChild(pod);
    const btn = el('button', 'btn lg ' + (s.round >= s.rounds ? 'pos' : 'primary'), s.round >= s.rounds ? 'Voir le classement' : 'Manche suivante →');
    btn.onclick = () => act({ t: 'sp-next' }); ac.appendChild(btn);
  }
  renderSPOthers(s, reveal);
}
function renderSPOthers(s, reveal) {
  const ot = $('#sp-others'); ot.innerHTML = '';
  if (reveal) return;
  s.players.filter(p => p.id !== net.me).forEach(p => {
    const x = s.sprint[p.id] || { tries: 0 };
    const sp = el('span', x.done ? (x.points ? 'done' : 'out') : '');
    sp.textContent = `${p.name} · ${x.done ? (x.points ? `${x.rank}${x.rank === 1 ? 'er' : 'e'} +${x.points}` : 'sèche') : `${x.tries} essai${x.tries > 1 ? 's' : ''}`}`;
    ot.appendChild(sp);
  });
}

function renderEOthers(s, reveal) {
  const ot = $('#e-others'); ot.innerHTML = '';
  if (reveal) return;
  s.players.filter(p => p.id !== net.me).forEach(p => {
    const x = s.eclair[p.id] || { level: 0 };
    const sp = el('span', x.done ? (x.points ? 'done' : 'out') : '');
    sp.textContent = `${p.name} · ${x.done ? (x.points ? 'trouvé +' + x.points : 'abandon') : 'écoute ' + fmtS(E_LEVELS[x.level])}`;
    ot.appendChild(sp);
  });
}
loadSongsE().then(l => { eCatalog = l; }).catch(() => { });
let jvCatalog = null;
loadSongsJV().then(l => { jvCatalog = l; }).catch(() => { });
let animeCatalog = null;
loadSongsAnime().then(l => { animeCatalog = l; }).catch(() => { });

// ------------------------------------------------ fin
function renderEnd(s) {
  const w = s.players.find(p => p.id === s.winner);
  const eclair = s.mode !== 'timeline';
  const solo = s.players.filter(p => p.online).length <= 1;
  $('#end-winner').textContent = solo ? 'Terminé' : (w ? w.name : '—');
  $('#end-sub').textContent = solo
    ? (eclair ? `${w ? w.score : 0} points sur ${s.rounds} manches.` : `Frise complète : ${s.target} cartes bien placées.`)
    : s.mode === 'sprint' ? 'a été le plus rapide sur la gâchette.'
      : s.mode === 'undercover' ? "a été l'agent le plus redoutable."
      : s.mode === 'geo' ? 'a le meilleur sens de l\'orientation.'
        : (eclair ? 'a l\'oreille la plus rapide.' : 'a rempli sa frise le premier.');
  const ol = $('#ranking'); ol.innerHTML = '';
  [...s.players]
    .sort((a, b) => eclair ? b.score - a.score : (b.timeline.length - a.timeline.length || b.tokens - a.tokens))
    .forEach(p => { const li = el('li'); li.innerHTML = `<span>${p.name}</span><b>${eclair ? p.score + ' pts' : p.timeline.length + ' cartes'}</b>`; ol.appendChild(li); });
  $('#btn-again').hidden = !isHostPlayer();
}

// ============================================================ aide & feuilles
const HELP = {
  timeline: `<h3>Décennies</h3>
    <p><b>But :</b> être le premier à remplir sa frise de chansons rangées par année.</p>
    <p><b>À ton tour :</b> écoute l'extrait, touche le « + » où la chanson se place dans ta frise. Bonne année, la carte est à toi. Sinon elle est perdue.</p>
    <h3>Les jetons ●</h3>
    <p>Tu commences avec 2 jetons, 3 au maximum. Ils servent à une seule chose : <b>parier</b>.</p>
    <ul>
      <li><b>Prendre le pari, 1 jeton.</b> Quand un joueur a posé son choix, le premier qui se lance prend le pari du tour. Un seul pari par tour.</li>
      <li><b>Gagné :</b> le joueur actif s'est trompé et ton emplacement était le bon. La carte rejoint ta frise.</li>
      <li><b>Perdu :</b> tu perds le jeton et une carte de ta frise. Tu gardes toujours au moins une carte.</li>
      <li><b>Regagner un jeton :</b> à ton tour, écris l'artiste et le titre avant de placer. Les deux justes, +1 jeton.</li>
    </ul>
    <h3>Tout seul</h3>
    <p>Si tu es le seul joueur, les jetons et les paris disparaissent. Tu enchaînes les chansons, tu passes librement celles que tu ne connais pas, et tu t'arrêtes quand ta frise est pleine.</p>`,
  eclair: `<h3>Éclair</h3>
    <p>Tout le monde écoute la même chanson en même temps, chacun sur son téléphone.</p>
    <p><b>But :</b> trouver le titre avec le moins de secondes d'écoute possible.</p>
    <ul>
      <li>0,5 s vaut 5 points, puis 1 s vaut 4, 2 s vaut 3, 3 s vaut 2, 5 s vaut 1.</li>
      <li>Un titre faux débloque automatiquement le palier suivant.</li>
      <li>« Écouter plus » débloque le palier sans tenter de réponse.</li>
      <li>Avec la case <b>Jeux vidéo</b> cochée, des musiques de jeux se glissent parmi les chansons : pour celles-là, c'est le nom du jeu qu'il faut donner. Un nom trop vague comme « zelda » ne coûte pas d'essai, on te demande de préciser.</li>
    </ul>
    <p>Le plus grand total après toutes les manches gagne.</p>`,
  sprint: `<h3>Sprint</h3>
    <p>La même chanson démarre chez tout le monde en même temps. Le but : donner <b>l'artiste et le titre</b> avant les autres.</p>
    <ul>
      <li>Le 1<sup>er</sup> marque 5 points, le 2<sup>e</sup> 3, le 3<sup>e</sup> 2, les suivants 1.</li>
      <li>Trois essais par manche, puis la manche est finie pour toi.</li>
      <li>La liste de suggestions remplit le titre et l'artiste d'un seul coup : sers-t'en, c'est plus rapide que de tout taper.</li>
      <li>La manche s'arrête quand l'extrait est fini ou que tout le monde a répondu.</li>
      <li>Avec la case <b>Jeux vidéo</b> cochée, des musiques de jeux se glissent parmi les chansons : pour celles-là, c'est le nom du jeu qu'il faut donner. Un nom trop vague ne coûte pas d'essai.</li>
    </ul>
    <p><b>Animés :</b> case facultative dans les options. Pour une musique d'anime, on donne le nom de l'anime, pas le titre du morceau.</p>`,
  sablier: `<h3>Sablier</h3>
    <p>Par équipes. Chacun reçoit des cartes et en écarte quelques-unes ; le reste forme le paquet commun. Le but : faire deviner le plus de cartes à son équipe, en un temps limité, sur plusieurs manches avec les <b>mêmes cartes</b>.</p>
    <ul>
      <li><b>Description libre :</b> tout est permis sauf les mots de la carte.</li>
      <li><b>Un seul mot :</b> un mot, une seule fois. Comme les cartes sont déjà connues, ça suffit souvent.</li>
      <li><b>Mime :</b> si vous êtes dans la même pièce. Aucun mot, aucun son, ton équipe devine à voix haute.</li>
      <li><b>Dessin :</b> tu dessines sur ton téléphone, ton équipe voit le dessin en direct.</li>
    </ul>
    <p>Chaque tour commence par trois secondes de préparation, la carte arrive avec le chrono. Passer est libre, la carte reviendra. Au gong, la carte en main n'est jamais révélée : l'hôte peut la compter si elle a été trouvée pile à la fin.</p>
    <p>Pendant un tour, le public envoie des réactions emoji, et les équipes qui ne jouent pas peuvent gribouiller sur les bords de l'écran avec le crayon ✏️ (couleur de leur équipe, effacé au tour suivant).</p>
    <p>L'hôte peut corriger une carte comptée par erreur entre deux tours. Les cartes déjà vues lors des soirées précédentes ne reviennent pas tant qu'il en reste des neuves.</p>`,
  chromo: `<h3>Chromo</h3>
    <p><b>But :</b> être le premier à ne plus avoir de cartes.</p>
    <ul>
      <li><b>À ton tour :</b> pose une carte de la même couleur ou du même symbole que celle du dessus. Sinon, pioche : si la carte piochée va, tu peux la jouer tout de suite.</li>
      <li><b>Passe :</b> le suivant saute son tour. <b>Sens :</b> on tourne dans l'autre sens, et à deux joueurs ça fait passer. <b>+2 :</b> le suivant pioche deux cartes et passe.</li>
      <li><b>Joker :</b> se pose sur tout, tu choisis la couleur. <b>Joker +4 :</b> pareil, et le suivant pioche quatre cartes.</li>
      <li><b>Cumul :</b> avec l'option, on répond à un +2 par un +2 ou un +4, et à un +4 par un +4. Le premier qui ne peut pas contrer pioche le total.</li>
      <li><b>« Chromo ! » :</b> quand il ne te reste qu'une ou deux cartes, touche le bouton. Si tu tombes à une carte sans l'avoir crié, n'importe qui peut t'attraper avant que le suivant ne joue : deux cartes de pénalité.</li>
    </ul>
    <p><b>Points :</b> le gagnant d'une manche marque la valeur des cartes restées chez les autres : le chiffre pour un nombre, 20 pour Passe, Sens et +2, 50 pour les jokers.</p>
    <p class="fine">Les robots jouent tout seuls et attrapent ceux qui oublient de crier.</p>`,
  kems: `<h3>Kems</h3>
    <p><b>But :</b> réunir quatre cartes de même valeur, un carré, et le faire savoir à ton partenaire sans que les adversaires s'en aperçoivent.</p>
    <ul>
      <li><b>Deux équipes de deux</b>, partenaires face à face. Avant de commencer, chaque équipe convient d'un signal discret : un clin d'œil, une main dans les cheveux, un mot glissé dans la conversation.</li>
      <li><b>Pas de tour de jeu :</b> tout le monde échange en même temps. Touche une carte de ta main puis une carte du milieu, elle est à toi si personne ne l'a prise avant. Tu peux échanger autant de fois que tu veux.</li>
      <li><b>Je passe :</b> quand tu ne veux plus rien. Dès que les quatre passent, les cartes du milieu sont remplacées. L'hôte peut aussi renouveler le milieu si plus rien ne bouge.</li>
      <li><b>« Kems ! » :</b> quand tu crois avoir vu le signal de ton partenaire. S'il a bien un carré, <b>1 point</b> pour vous, 2 si tu en avais un aussi. Sinon, 1 point pour les adversaires.</li>
      <li><b>« Contre-Kems ! » :</b> quand tu penses qu'un adversaire a un carré. Vrai : 1 point pour vous. Faux : 1 point pour eux.</li>
    </ul>
    <p>Une erreur coûte un point, alors les deux boutons demandent un second toucher pour confirmer. La partie se joue en 5 points par défaut. Les signaux ne passent pas par l'application : Kems se joue autour d'une table, ou en visio.</p>
    <p class="fine">Les robots complètent une table. Un robot avec un carré fait un signal que seul son partenaire voit apparaître sur son écran ; il remarque aussi le tien au bout d'un moment.</p>`,
  camembert: `<h3>Camembert</h3>
    <p><b>But :</b> compléter ton fromage avec les six parts de couleur, puis réussir la question finale.</p>
    <ul>
      <li><b>À ton tour :</b> lance le dé, puis choisis de quel côté avancer : les deux cases possibles s'allument sur le plateau. La couleur de la case donne la couleur de la question, à choix multiples, 30 secondes.</li>
      <li><b>Bonne réponse :</b> tu rejoues, jusqu'à 3 questions par tour (réglable dans le salon). Mauvaise réponse, ou temps écoulé : au suivant.</li>
      <li><b>Les six grosses cases</b> sont les camemberts : une bonne réponse dessus rapporte la part de cette couleur. Les cases ↻ font relancer le dé.</li>
      <li><b>Fromage complet :</b> à ton tour suivant, les autres joueurs choisissent la couleur de ta question finale, ou une question de culture générale. Bonne réponse, tu gagnes ; sinon tu retentes au tour d'après.</li>
      <li><b>Les autres jouent aussi :</b> pendant chaque question, chacun peut donner son avis. Ça ne rapporte rien, mais on voit qui aurait trouvé.</li>
    </ul>
    <p>Les six couleurs : Géographie, Divertissement (ciné, séries, musique, jeux vidéo), Histoire, Arts &amp; Littérature, Sciences &amp; Nature, Sports &amp; Loisirs. Une question déjà posée ne revient pas d'une soirée à l'autre tant qu'il en reste. Si une question est fausse, l'hôte peut compter la réponse comme juste.</p>
    <p class="fine">Partie courte : dans le salon, choisis 3 ou 4 parts au lieu de 6.</p>`,
  mirage: `<h3>Mirage</h3>
    <p><b>But :</b> donner des indices ni trop clairs ni trop obscurs, et deviner la carte des autres.</p>
    <ul>
      <li><b>Le conteur</b> choisit une carte de sa main et donne un indice : un mot, une phrase, une chanson, un bruit… tapé dans l'app ou dit à voix haute.</li>
      <li><b>Les autres</b> choisissent dans leur main la carte qui colle le mieux à l'indice, pour faire croire que c'est la leur.</li>
      <li><b>Le vote :</b> toutes les cartes sont mélangées, chacun (sauf le conteur) vote pour celle qu'il pense être celle du conteur. Pas pour la sienne.</li>
      <li><b>Jokers :</b> chacun en a 3 pour la partie. Touche une carte de ta main, puis « Joker » : 5 cartes te sont proposées, tu en gardes une à la place.</li>
      <li><b>Points :</b> si tout le monde trouve, ou si personne ne trouve, le conteur marque 0 et les autres 2. Sinon le conteur et ceux qui ont trouvé marquent 3. Chaque vote reçu sur sa carte rapporte 1 point, 3 au maximum.</li>
    </ul>
    <p>Touche une carte pour la voir en grand. Les cartes sont des tableaux, gravures et estampes du domaine public : Redon, Goya, Blake, Doré, Hokusai et d'autres. Celles déjà vues lors des soirées précédentes sortent en dernier.</p>
    <p class="fine">À trois joueurs ça marche, à cinq ou six c'est le meilleur. Partie en 30 points, réglable.</p>`,
  douze: `<h3>Douze</h3>
    <p><b>But :</b> finir chaque manche avec le total le plus bas. Douze cartes face cachée devant toi, en trois lignes de quatre.</p>
    <ul>
      <li><b>Début de manche :</b> chacun retourne deux cartes. Le plus haut total visible commence.</li>
      <li><b>À ton tour :</b> pioche une carte, ou prends le dessus de la défausse. Une carte piochée se pose sur une de tes cartes (visible ou cachée, l'ancienne part à la défausse), ou se défausse : tu retournes alors une carte cachée. Une carte prise dans la défausse se pose obligatoirement.</li>
      <li><b>Colonnes :</b> trois cartes identiques face visible dans une même colonne, et la colonne disparaît. Idéal avec des 12.</li>
      <li><b>Fin de manche :</b> quand un joueur a tout retourné, les autres jouent un dernier tour, puis tout est révélé. Celui qui a fermé sans avoir strictement le plus petit total voit son score doubler.</li>
    </ul>
    <p><b>Cartes :</b> de -2 à 12. Les négatifs sont précieux, les rouges à fuir. La partie s'arrête quand quelqu'un atteint 100 points : le plus bas gagne.</p>
    <p class="fine">Les robots complètent une table : pratique pour tester seul.</p>`,
  petitbac: `<h3>Petit Brevet</h3>
    <p><b>But :</b> trouver, pour chaque catégorie, un mot qui commence par la lettre tirée.</p>
    <ul>
      <li><b>Écrire :</b> remplis tes catégories avant la fin du chrono. Les articles ne comptent pas : « La Rochelle » vaut pour R.</li>
      <li><b>Stop :</b> quand tu as tout rempli, touche « Stop ! ». Les autres ont encore trois secondes, puis tout le monde pose son stylo. Si l'hôte a désactivé le stop, chacun touche « J'ai fini » et la manche s'arrête quand tout le monde a fini, ou à la fin du chrono.</li>
      <li><b>Vérifier :</b> toutes les réponses s'affichent. Touche une réponse douteuse pour la contester : elle est refusée si la moitié des autres joueurs la conteste. L'hôte peut trancher.</li>
      <li><b>Points :</b> 10 pour une réponse que personne d'autre n'a, 5 si quelqu'un a la même, 0 si elle est vide, refusée ou ne commence pas par la bonne lettre.</li>
    </ul>`,
  loupgarou: `<h3>Loup-Garou</h3>
    <p>Le village contre les loups-garous cachés parmi vous. L'application fait le meneur : elle réveille chaque rôle à son tour, annonce les morts et compte les votes.</p>
    <ul>
      <li><b>Ton rôle :</b> maintiens la carte appuyée pour le voir, relâche pour le cacher. Ne le montre à personne.</li>
      <li><b>La nuit :</b> tout le monde ferme les yeux. Ton téléphone vibre quand c'est à ton rôle d'agir ; les autres voient un écran de nuit. Chaque étape dure un moment, même si le rôle est mort : sa durée ne trahit rien.</li>
      <li><b>Le jour :</b> les morts de la nuit sont annoncés avec leur rôle. Débattez de vive voix, puis votez sur votre téléphone. Le plus désigné est éliminé ; en cas d'égalité, on revote entre les ex æquo, puis personne.</li>
      <li><b>Victoire :</b> le village quand tous les loups sont morts, les loups quand il ne reste que des loups, un couple d'amoureux de camps différents s'il reste seul.</li>
    </ul>
    <p class="fine">Les morts gardent le silence. Les rôles de chacun sont détaillés dans la page Règles des jeux.</p>`,
  limite: `<h3>Hors Limite</h3>
    <p>Une phrase à trous s'affiche. Chacun la complète avec la carte de sa main la plus drôle, la plus absurde ou la plus limite. Certaines phrases demandent deux cartes : touche-les dans l'ordre des trous.</p>
    <ul>
      <li><b>Avec un juge :</b> à tour de rôle, un joueur lit les phrases complétées à voix haute et choisit sa préférée, qui marque 1 point.</li>
      <li><b>Tout le monde vote :</b> chacun vote pour la meilleure phrase, jamais la sienne.</li>
      <li>Rien ne va dans ta main ? Échange-la toute entière contre 1 point. Le mode soft retire les cartes les plus épicées.</li>
    </ul>`,
  solitaire: `<h3>Solitaire</h3>
    <p>La patience classique, en course : tout le monde reçoit exactement la même donne et joue sur son écran. Le premier qui monte les 52 cartes sur les fondations gagne.</p>
    <ul>
      <li><b>Toucher une carte</b> l'envoie au meilleur endroit, la fondation d'abord. S'il y a plusieurs colonnes possibles, elles s'allument : touche celle que tu veux.</li>
      <li><b>Ou fais-la glisser</b> toi-même : prends une carte (ou une suite de la colonne) et lâche-la sur la colonne ou la fondation de ton choix.</li>
      <li>Dans les colonnes, on descend en alternant rouge et noir. Seul un roi va sur une colonne vide.</li>
      <li>La pioche en haut à gauche : touche-la pour tourner une ou trois cartes. Vide, elle se recharge avec le talon.</li>
      <li>Annuler est illimité ou presque. Au bout du temps, le classement se fait sur les cartes montées.</li>
    </ul>`,
  diapason: `<h3>Diapason</h3>
    <p>Se mettre sur la même longueur d'onde. Une carte donne deux extrêmes, par exemple « Froid ↔ Chaud ». Seul le médium voit où se cache la cible sur le cadran.</p>
    <ul>
      <li><b>Le médium</b> donne un indice qui situe la cible entre les deux : un mot, un nom, un film… Pour « Froid ↔ Chaud », « une douche en été » tombe plutôt vers le milieu.</li>
      <li><b>Les autres</b> placent l'aiguille au jugé. Plein centre : 4 points, puis 3, puis 2.</li>
      <li><b>Chacun pour soi :</b> chacun place sa propre aiguille, et le médium gagne la moyenne des points des autres.</li>
      <li><b>En équipes :</b> l'équipe déplace ensemble une aiguille commune, puis l'équipe adverse parie « plus à gauche » ou « plus à droite » pour 1 point.</li>
    </ul>`,
  poker: `<h3>Poker</h3>
    <p>Texas Hold'em avec des jetons fictifs. Tu reçois deux cartes cachées, cinq cartes communes arrivent au milieu : la meilleure main de cinq cartes parmi les sept gagne le pot.</p>
    <ul>
      <li><b>À ton tour :</b> te coucher, parler (si personne n'a misé), suivre, ou relancer avec le curseur. Tapis quand tu mises tout.</li>
      <li><b>Les tours :</b> avant le flop, puis flop (3 cartes), turn (1) et river (1). Les blindes tournent et montent au fil des mains.</li>
      <li><b>Mains, de la plus faible à la plus forte :</b> carte haute, paire, double paire, brelan, quinte, couleur, full, carré, quinte flush.</li>
    </ul>
    <p>Sans jetons, tu es éliminé. Le dernier en jeu rafle tout.</p>`,
  naufrages: `<h3>Naufragés</h3>
    <p>Échoués sur une île, il faut construire un radeau et partir avant l'ouragan. Chaque soir, chacun mange un poisson et boit une ration d'eau.</p>
    <ul>
      <li><b>Chaque jour :</b> choisis en secret pêcher, chercher de l'eau (selon la météo), couper du bois (et tenter ta chance pour en couper plus, au risque d'une morsure de serpent), ou fouiller l'épave (un objet secret).</li>
      <li><b>Le soir :</b> s'il manque de quoi manger ou boire, le camp vote pour sacrifier quelqu'un, jusqu'à ce que les réserves suffisent.</li>
      <li><b>Le radeau :</b> 4 morceaux de bois par place. Quand il y a une place et des vivres pour chacun, l'hôte peut lancer le départ. L'ouragan force le départ : ceux qui n'ont pas de place restent.</li>
    </ul>
    <p>Ceux qui embarquent gagnent. Les objets de l'épave sont secrets : conserve, gourde, hache, pistolet, talisman…</p>`,
  memes: `<h3>Mème pas vrai</h3>
    <p>Une situation s'affiche. Chacun pose le mème ou le GIF de sa main qui y répond le mieux.</p>
    <ul>
      <li><b>Avec un juge :</b> à tour de rôle, un joueur ne joue pas et choisit son mème préféré, qui marque 1 point.</li>
      <li><b>Tout le monde vote :</b> chacun vote pour le meilleur mème, jamais le sien ; chaque vote reçu vaut 1 point.</li>
      <li>Touche un mème pour le voir en grand avec la phrase. Rien ne va dans ta main ? Échange-la toute entière contre 1 point.</li>
    </ul>`,
  geo: `<h3>Boussole</h3>
    <p>Une photo 360° prise dans une rue, quelque part. Regarde autour de toi : panneaux, langue, végétation, côté de circulation, plaques. Puis pose ton épingle sur la carte et valide.</p>
    <ul>
      <li><b>Déplacement libre :</b> avance le long de la rue avec les flèches de l'image.</li>
      <li><b>Sans bouger :</b> tu peux tourner et zoomer, mais pas avancer.</li>
      <li><b>Ni bouger ni zoomer :</b> une seule vue fixe, pour les experts.</li>
    </ul>
    <p><b>Points :</b> jusqu'à 5 000 par manche selon la distance, rapportée à la taille de la carte. La manche se termine quand tout le monde a validé ou à la fin du chrono.</p>
    <p class="fine">Images Mapillary, prises par des contributeurs. Carte OpenStreetMap.</p>`,
  undercover: `<h3>Undercover</h3>
    <p>Tout le monde reçoit le même mot secret, sauf les <b>undercovers</b> qui ont un mot voisin, sans le savoir. Avec l'option <b>Mister White</b>, un joueur n'a aucun mot et le sait.</p>
    <ul>
      <li><b>Indices :</b> chacun à son tour dit un mot ou une courte expression à voix haute, sans jamais dire son mot. Tu peux aussi l'écrire : tout ce qui a été dit est rappelé au moment du vote.</li>
      <li><b>Vote :</b> tout le monde vote sur son téléphone. Le plus désigné est éliminé et son rôle est révélé. En cas d'égalité, on revote entre les ex æquo.</li>
      <li><b>Mister White éliminé</b> tente de deviner le mot des civils. S'il trouve, il marque 5 points ; il reste éliminé et la manche continue.</li>
    </ul>
    <p><b>Fin de manche :</b> les civils gagnent quand tous les intrus sont éliminés. Les intrus gagnent s'il ne reste plus qu'un civil.</p>
    <p><b>Points :</b> civil gagnant 2, undercover gagnant 10, Mister White gagnant 6. On joue plusieurs manches avec de nouveaux mots.</p>`,
  hub: `<h3>Boîte à jeux</h3><p>Une personne crée la partie et partage le code. Les autres ouvrent la même adresse et tapent ce code. L'hôte choisit ensuite le jeu.</p>
    <p>L'hôte garde son téléphone ouvert : c'est lui qui fait tourner la partie.</p>`,
};

// ============================================================ diagnostic réseau
// Sert quand ça marche sur un téléphone et pas sur un autre : dit ce qui est bloqué.
async function runDiag() {
  const body = $('#help-body');
  const lines = [];
  const draw = () => { body.innerHTML = '<h3>Diagnostic réseau</h3>' + lines.map(l => `<p class="diag-line">${l}</p>`).join('') + '<p class="fine">Touche « Copier » puis envoie-moi le texte.</p>'; };
  const add = (label, ok, detail) => { lines.push(`${ok === null ? '⏳' : ok ? '✅' : '❌'} <b>${label}</b>${detail ? ` : ${esc(String(detail)).slice(0, 120)}` : ''}`); draw(); };
  lines.push(`Navigateur : ${esc(navigator.userAgent).slice(0, 110)}`);
  lines.push(`Page sécurisée : ${window.isSecureContext ? 'oui' : 'non'} · en ligne : ${navigator.onLine ? 'oui' : 'non'} · version ${ASSET_V}`);
  draw();

  add('Bibliothèque réseau chargée', typeof Peer !== 'undefined', typeof Peer === 'undefined' ? 'bloquée par un bloqueur de contenu ?' : 'ok');

  try {
    const r = await fetch('https://0.peerjs.com/peerjs/id?ts=' + Date.now(), { cache: 'no-store' });
    add('Serveur de mise en relation joignable', r.ok, 'réponse ' + r.status);
  } catch (e) { add('Serveur de mise en relation joignable', false, e.message || e); }

  await new Promise(res => {
    let done = false;
    try {
      const ws = new WebSocket('wss://0.peerjs.com/peerjs?key=peerjs&id=diag' + Math.random().toString(36).slice(2, 8) + '&token=' + Math.random().toString(36).slice(2, 8) + '&version=1.5.4');
      const fin = (ok, d) => { if (done) return; done = true; try { ws.close(); } catch { } add('Connexion permanente au serveur', ok, d); res(); };
      ws.onopen = () => fin(true, 'ouverte');
      ws.onerror = () => fin(false, 'refusée (réseau, VPN ou bloqueur)');
      setTimeout(() => fin(false, 'aucune réponse en 8 s'), 8000);
    } catch (e) { add('Connexion permanente au serveur', false, e.message || e); res(); }
  });

  add('Connexion directe entre téléphones possible', typeof RTCPeerConnection !== 'undefined', typeof RTCPeerConnection === 'undefined' ? 'non supportée' : 'supportée');
  if (typeof RTCPeerConnection !== 'undefined') {
    await new Promise(res => {
      const types = new Set();
      let pc;
      const fin = () => { try { pc.close(); } catch { } add('Adresses de connexion trouvées', types.size > 0, [...types].join(', ') || 'aucune : relais privé iCloud ou VPN ?'); res(); };
      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.createDataChannel('diag');
        pc.onicecandidate = e => { if (e.candidate) types.add(e.candidate.type || 'inconnu'); };
        pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => { });
        setTimeout(fin, 6000);
      } catch (e) { add('Adresses de connexion trouvées', false, e.message || e); res(); }
    });
  }

  await new Promise(res => {
    if (typeof Peer === 'undefined') { add('Création d\'une partie de test', false, 'bibliothèque absente'); return res(); }
    let done = false;
    const p = new Peer(undefined, { debug: 0 });
    const fin = (ok, d) => { if (done) return; done = true; try { p.destroy(); } catch { } add('Création d\'une partie de test', ok, d); res(); };
    p.on('open', id => fin(true, 'identifiant obtenu'));
    p.on('error', e => fin(false, e.type + ' · ' + (e.message || '').slice(0, 60)));
    setTimeout(() => fin(false, 'aucune réponse en 12 s'), 12000);
  });

  let stockage = 'ok';
  try { localStorage.setItem('diag', '1'); localStorage.removeItem('diag'); } catch (e) { stockage = 'bloqué (navigation privée ?)'; }
  add('Mémoire du téléphone', stockage === 'ok', stockage);

  const texte = lines.map(l => l.replace(/<[^>]+>/g, '')).join('\n');
  const copier = el('button', 'btn small', 'Copier le résultat');
  copier.onclick = async () => {
    try { await navigator.clipboard.writeText(texte); toast('Résultat copié'); }
    catch { const t = document.createElement('textarea'); t.value = texte; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Résultat copié'); }
  };
  body.appendChild(copier);
}
$('#btn-diag').onclick = () => { $('#help').hidden = false; runDiag(); };
$('#btn-diag-home').onclick = () => { $('#help').hidden = false; runDiag(); };

$('#btn-help').onclick = () => { $('#help-body').innerHTML = HELP[view?.mode && view.phase !== 'lobby' ? view.mode : (view?.pick || 'hub')] || HELP.hub; $('#help').hidden = false; };
$('#help-close').onclick = () => $('#help').hidden = true;
$('#help').onclick = e => { if (e.target.id === 'help') $('#help').hidden = true; };

let confirmFn = null;
function askConfirm(title, text, label, fn) {
  $('#confirm-title').textContent = title; $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = label; confirmFn = fn; $('#confirm').hidden = false;
}
$('#confirm-close').onclick = () => { $('#confirm').hidden = true; confirmFn = null; };
$('#confirm').onclick = e => { if (e.target.id === 'confirm') $('#confirm-close').click(); };
$('#confirm-ok').onclick = () => { const f = confirmFn; $('#confirm').hidden = true; confirmFn = null; f?.(); };

$('#btn-back').onclick = () => {
  if (shownId === 's-rules') { closeRules(); return; }
  const inGame = view && !['lobby'].includes(view.phase);
  if (!inGame) { askConfirm('Quitter', 'Tu quittes la partie et reviens à l\'accueil.', 'Quitter', () => location.reload()); return; }
  if (isHostPlayer()) askConfirm('Retour au salon', 'La partie en cours s\'arrête pour tout le monde et vous revenez au choix du jeu.', 'Revenir au salon', () => act({ t: 'restart' }));
  else askConfirm('Quitter', 'Seul l\'hôte peut ramener tout le monde au salon. Tu peux quitter la partie de ton côté.', 'Quitter la partie', () => location.reload());
};

// ============================================================ thème
function syncThemeColor() {
  const bg = getComputedStyle(document.body).backgroundColor;
  const m = $('meta[name=theme-color]'); if (m && bg) m.content = bg;
}
// Quatre thèmes : deux sombres, deux clairs. Le thème habille l'accueil, le salon et les règles ;
// chaque jeu garde ses propres couleurs, dans sa version sombre ou claire selon le thème choisi.
const THEMES = [
  { id: 'dark', name: 'Ambre', desc: 'sombre et chaleureux', mode: 'dark', skin: '', sw: ['oklch(0.17 0.018 62)', 'oklch(0.78 0.155 68)'] },
  { id: 'nuit', name: 'Minuit', desc: 'bleu nuit et menthe', mode: 'dark', skin: 'nuit', sw: ['oklch(0.17 0.035 255)', 'oklch(0.82 0.13 175)'] },
  { id: 'light', name: 'Crème', desc: 'clair et chaleureux', mode: 'light', skin: '', sw: ['oklch(0.96 0.014 78)', 'oklch(0.62 0.170 52)'] },
  { id: 'lavande', name: 'Lavande', desc: 'clair et pastel', mode: 'light', skin: 'lavande', sw: ['oklch(0.955 0.022 300)', 'oklch(0.56 0.19 320)'] },
];
let themeCur = 'dark';
function applyTheme(id) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  themeCur = t.id;
  document.documentElement.dataset.theme = t.mode;
  if (t.skin) document.documentElement.dataset.skin = t.skin; else delete document.documentElement.dataset.skin;
  $('#btn-theme').textContent = t.mode === 'light' ? '☀' : '☾';
  try { localStorage.setItem('dc-theme', t.id); } catch { }
  document.querySelectorAll('#theme-pop button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.theme === t.id)));
  requestAnimationFrame(syncThemeColor);
}
(function buildThemePop() {
  const pop = el('div', 'theme-pop'); pop.id = 'theme-pop'; pop.hidden = true; pop.setAttribute('role', 'menu');
  pop.appendChild(el('p', 'theme-pop-title', 'Thème'));
  THEMES.forEach(t => {
    const b = el('button', 'theme-opt', `<span class="theme-sw" style="background:${t.sw[0]}"><i style="background:${t.sw[1]}"></i></span><span><b>${t.name}</b><small>${t.desc}</small></span>`);
    b.type = 'button'; b.dataset.theme = t.id; b.setAttribute('role', 'menuitemradio');
    b.onclick = () => { applyTheme(t.id); pop.hidden = true; };
    pop.appendChild(b);
  });
  document.body.appendChild(pop);
  $('#btn-theme').onclick = e => { e.stopPropagation(); pop.hidden = !pop.hidden; };
  document.addEventListener('click', e => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') pop.hidden = true; });
})();
let savedTheme = null; try { savedTheme = localStorage.getItem('dc-theme'); } catch { }
applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

// ============================================================ écrans d'entrée
// Entrée : avec un code tapé, on rejoint la partie de l'ami ; sans code, on en crée une
['#in-name', '#in-code'].forEach(sel => $(sel).addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const code = $('#in-code').value.trim();
  $(code ? 'button[data-act=join]' : 'button[data-act=create]').click();
}));
$('#f-home').addEventListener('submit', async e => {
  e.preventDefault();
  const mode = e.submitter?.dataset.act;
  const name = $('#in-name').value.trim(), code = $('#in-code').value.trim().toUpperCase();
  const err = $('#home-err'); err.textContent = '';
  if (!name) { err.textContent = 'Il faut un prénom.'; return; }
  try { localStorage.setItem('dc-name', name); } catch { }
  net.name = name;
  if (typeof Peer === 'undefined') { err.textContent = 'Le module réseau est bloqué. Sur iPhone : Réglages, Safari, désactive les bloqueurs de contenu pour ce site, ou passe par Chrome.'; return; }
  e.submitter.disabled = true;
  try {
    if (mode === 'create') { await hostGame(); keepAwake(); }
    else { if (code.length !== 4) { err.textContent = 'Le code fait 4 lettres.'; return; } await joinGame(code); keepAwake(); }
  } catch (ex) {
    err.textContent = ex.message === 'no-room' || ex.type === 'peer-unavailable'
      ? 'Aucune partie avec ce code. Vérifie les 4 lettres, et demande à l\'hôte de rouvrir la page du jeu sur son téléphone.'
      : 'Connexion impossible : ' + (ex.message || ex.type || ex);
  } finally { e.submitter.disabled = false; }
});
$('#btn-solo').onclick = async () => {
  net.name = $('#in-name').value.trim() || 'Moi';
  try { await hostGame(); keepAwake(); } catch (ex) { $('#home-err').textContent = 'Connexion impossible : ' + (ex.message || ex); }
};
document.querySelectorAll('.gcard').forEach(b => b.onclick = () => act({ t: 'pick', key: b.dataset.game }));

// ============================================================ familles de jeux
// Les jeux sont rangés par famille, avec un intitulé, et des pastilles pour n'afficher qu'une famille.
const FAMILIES = [
  { id: 'musique', icon: '🎵', name: 'Musique', desc: 'On écoute un extrait : l’année, le titre, le plus vite possible.', games: ['timeline', 'eclair', 'sprint'] },
  { id: 'cartes', icon: '🃏', name: 'Jeux de cartes', desc: 'Les grands classiques, entre amis ou contre des robots.', games: ['chromo', 'douze', 'kems', 'poker', 'solitaire'] },
  { id: 'rire', icon: '😂', name: 'Humour et imagination', desc: 'Chacun pose sa carte, la plus drôle ou la plus juste marque.', games: ['mirage', 'memes', 'limite'] },
  { id: 'deviner', icon: '💡', name: 'Devinettes et culture', desc: 'Faire deviner, écrire vite, viser juste, situer une photo sur la carte.', games: ['sablier', 'diapason', 'petitbac', 'geo'] },
  { id: 'roles', icon: '🕵️', name: 'Rôles cachés et bluff', desc: 'Qui ment ? On débat, on vote, on trahit parfois.', games: ['undercover', 'loupgarou', 'naufrages'] },
];
let famCur = 'all'; try { famCur = localStorage.getItem('dc-fam') || 'all'; } catch { }
function famApply() {
  if (!FAMILIES.some(f => f.id === famCur)) famCur = 'all';
  document.querySelectorAll('#games > [data-fam]').forEach(n => { n.hidden = famCur !== 'all' && n.dataset.fam !== famCur && n.getAttribute('aria-pressed') !== 'true'; });
  document.querySelectorAll('#gfilters button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fam === famCur)));
}
(function buildFamilies() {
  const grid = $('#games'), soon = grid.querySelector('.gsoon');
  const bar = el('div', 'gfilters'); bar.id = 'gfilters'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Familles de jeux');
  const chip = (id, label, n) => { const b = el('button', 'gfilter', `${label}${n ? ` <small>${n}</small>` : ''}`); b.type = 'button'; b.dataset.fam = id; b.onclick = () => { famCur = id; try { localStorage.setItem('dc-fam', id); } catch { } famApply(); }; bar.appendChild(b); };
  chip('all', 'Tous', grid.querySelectorAll('.gcard').length);
  FAMILIES.forEach(f => {
    const cards = f.games.map(g => grid.querySelector(`.gcard[data-game="${g}"]`)).filter(Boolean);
    if (!cards.length) return;
    chip(f.id, `${f.icon} ${f.name}`, cards.length);
    const head = el('div', 'gfam', `<span class="gfam-name"><span aria-hidden="true">${f.icon}</span> ${f.name}</span><span class="gfam-desc">${f.desc}</span>`);
    head.dataset.fam = f.id;
    grid.insertBefore(head, soon);
    cards.forEach(c => { c.dataset.fam = f.id; grid.insertBefore(c, soon); });
  });
  grid.parentNode.insertBefore(bar, grid);
  famApply();
})();
$('#btn-start').onclick = () => {
  const pick = view?.pick; if (!pick) { toast('Choisis un jeu'); return; }
  if (pick === 'timeline') {
    const cats = [...$('#opt-cats').querySelectorAll('input:checked')].map(i => i.value);
    if (!cats.length) { toast('Choisis au moins une playlist'); return; }
    const snd = $('#opt-sound').value;
    act({ t: 'start', opts: { mode: 'timeline', cats, target: +$('#opt-target').value, speakerId: snd === 'host' ? net.me : null, soundAll: snd === 'all' } });
  } else if (pick === 'eclair') {
    const checked = [...$('#opt-decades').querySelectorAll('input:checked')].map(i => i.value);
    const decades = checked.filter(v => v !== 'jv').map(Number), jv = checked.includes('jv');
    if (!decades.length && !jv) { toast('Choisis au moins une période ou les jeux vidéo'); return; }
    act({ t: 'start', opts: { mode: 'eclair', decades, jv, rounds: +$('#opt-rounds').value } });
  } else if (pick === 'sprint') {
    const checked = [...$('#opt-decades-s').querySelectorAll('input:checked')].map(i => i.value);
    const decades = checked.filter(v => v !== 'jv' && v !== 'anime').map(Number), jv = checked.includes('jv'), anime = checked.includes('anime');
    if (!decades.length && !jv && !anime) { toast('Choisis au moins une période, les jeux vidéo ou les animés'); return; }
    act({ t: 'start', opts: { mode: 'sprint', decades, jv, anime, rounds: +$('#opt-rounds-s').value, speakerId: $('#opt-sound-s').value === 'host' ? net.me : null } });
  }
  if (pick === 'sablier') {
    if ((view?.players || []).filter(p => p.online).length < 2) { toast('Sablier se joue à deux minimum, par équipes'); return; }
    const roundTypes = [...$('#opt-sab-rounds').querySelectorAll('input:checked')].map(i => i.value);
    if (!roundTypes.length) { toast('Choisis au moins une manche'); return; }
    const decks = [...$('#opt-sab-decks').querySelectorAll('input:checked')].map(i => i.value);
    if (!decks.length) { toast('Choisis au moins un deck'); return; }
    const settings = { roundTypes, turnSeconds: +$('#opt-sab-turn').value, drawSeconds: +$('#opt-sab-draw').value, dealPerPlayer: +$('#opt-sab-deal').value, discardPerPlayer: +$('#opt-sab-discard').value, teamMode: $('#opt-sab-teammode').value, decks, difficulties: [...$('#opt-sab-diff').querySelectorAll('input:checked')].map(i => +i.value) };
    act({ t: 'start', opts: { mode: 'sablier', decks, settings } });
  }
  if (pick === 'undercover') {
    if ((view?.players || []).filter(p => p.online).length < 3) { toast('Undercover se joue à trois minimum'); return; }
    act({ t: 'start', opts: { mode: 'undercover', rounds: +$('#opt-uc-rounds').value, undercovers: $('#opt-uc-count').value, white: $('#opt-uc-white').checked } });
  }
  if (pick === 'chromo') {
    const humans = (view?.players || []).filter(p => p.online).length, bots = +$('#opt-ch-bots').value;
    if (humans + bots < 2) { toast('Chromo se joue à deux minimum : ajoute un robot ou invite un ami'); return; }
    if (humans + bots > 10) { toast('Dix joueurs au maximum, robots compris'); return; }
    act({ t: 'start', opts: { mode: 'chromo', rounds: +$('#opt-ch-rounds').value, stack: $('#opt-ch-stack').checked, zero: $('#opt-ch-zero').checked, bots } });
  }
  if (pick === 'kems') {
    const online = (view?.players || []).filter(p => p.online), bots = $('#opt-km-bots').checked;
    const t = Kems.split(online, kmTeamPick);
    if (!bots && (t[0].length < 2 || t[1].length < 2)) { toast('Kems se joue à quatre, deux par équipe : invite des amis ou complète avec des robots'); return; }
    if (t.extra.length) toast(`${t.extra.map(p => p.name).join(', ')} regarder${t.extra.length > 1 ? 'ont' : 'a'} cette partie`);
    const teams = {}; online.forEach(p => { if (kmTeamPick[p.id] === 0 || kmTeamPick[p.id] === 1) teams[p.id] = kmTeamPick[p.id]; });
    act({ t: 'start', opts: { mode: 'kems', target: +$('#opt-km-target').value, teams, bots } });
  }
  if (pick === 'camembert') {
    (async () => {
      await Camembert.load(ASSET_V);
      if (!Camembert.count()) { toast('Questions introuvables : quiz.json manque'); return; }
      act({ t: 'start', opts: { mode: 'camembert', target: +$('#opt-cm-target').value, diff: $('#opt-cm-diff').value, replay: $('#opt-cm-replay').value } });
    })();
  }
  if (pick === 'mirage') {
    (async () => {
      if ((view?.players || []).filter(p => p.online).length < 3) { toast('Mirage se joue à trois minimum'); return; }
      await Mirage.load(ASSET_V);
      const cardset = $('#opt-mi-cards').value;
      if (Mirage.count(cardset) < 40) { toast('Cartes introuvables'); return; }
      act({ t: 'start', opts: { mode: 'mirage', target: +$('#opt-mi-target').value, jokers: +$('#opt-mi-jokers').value, cardset } });
    })();
  }
  if (pick === 'douze') {
    const humans = (view?.players || []).filter(p => p.online).length, bots = +$('#opt-dz-bots').value;
    if (humans + bots < 2) { toast('Douze se joue à deux minimum : ajoute un robot ou invite un ami'); return; }
    if (humans + bots > 8) { toast('Huit joueurs au maximum, robots compris'); return; }
    act({ t: 'start', opts: { mode: 'douze', target: +$('#opt-dz-target').value, bots } });
  }
  if (pick === 'limite') {
    if ((view?.players || []).filter(p => p.online).length < 3) { toast('Hors Limite se joue à trois minimum'); return; }
    act({ t: 'start', opts: { mode: 'limite', target: +$('#opt-hl-target').value, judge: $('#opt-hl-mode').value, soft: $('#opt-hl-soft').checked } });
  }
  if (pick === 'solitaire') act({ t: 'start', opts: { mode: 'solitaire', draw: +$('#opt-so-draw').value, minutes: +$('#opt-so-minutes').value } });
  if (pick === 'diapason') {
    const n = (view?.players || []).filter(p => p.online).length, dpMode = $('#opt-dp-mode').value;
    if (n < 2) { toast('Diapason se joue à deux minimum'); return; }
    if (dpMode === 'teams' && n < 4) { toast('En équipes, il faut au moins quatre joueurs'); return; }
    act({ t: 'start', opts: { mode: 'diapason', dpMode, tours: +$('#opt-dp-tours').value, target: +$('#opt-dp-target').value } });
  }
  if (pick === 'poker') {
    const bots = +$('#opt-pk-bots').value, humans = (view?.players || []).filter(p => p.online).length;
    if (humans + bots < 2) { toast('Le poker se joue à deux minimum : ajoute un robot'); return; }
    if (humans + bots > 9) { toast('Neuf joueurs au maximum autour de la table, robots compris'); return; }
    act({ t: 'start', opts: { mode: 'poker', stack: +$('#opt-pk-stack').value, blindEvery: +$('#opt-pk-blinds').value, bots } });
  }
  if (pick === 'naufrages') {
    const bots = +$('#opt-nf-bots').value;
    if ((view?.players || []).filter(p => p.online).length + bots < 3) { toast('Naufragés se joue à trois minimum : ajoute des robots'); return; }
    act({ t: 'start', opts: { mode: 'naufrages', length: $('#opt-nf-length').value, bots } });
  }
  if (pick === 'memes') {
    (async () => {
      if ((view?.players || []).filter(p => p.online).length < 3) { toast('Mème pas vrai se joue à trois minimum'); return; }
      await Memes.load(ASSET_V);
      if (Memes.count() < 60) { toast('Mèmes introuvables : memes.json manque'); return; }
      act({ t: 'start', opts: { mode: 'memes', target: +$('#opt-mm-target').value, judge: $('#opt-mm-mode').value, kinds: $('#opt-mm-kinds').value } });
    })();
  }
  if (pick === 'loupgarou') {
    if ((view?.players || []).filter(p => p.online).length < 5) { toast('Loup-Garou se joue à cinq minimum'); return; }
    const roles = {}; LoupGarou.SPECIALS.forEach(r => { roles[r] = !!$('#opt-lw-' + r)?.checked; });
    try { localStorage.setItem('lw-voice', $('#opt-lw-voice').checked ? '1' : '0'); } catch { }
    if ($('#opt-lw-voice').checked && window.speechSynthesis) { try { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch { } }   // débloque la voix sur iPhone
    act({ t: 'start', opts: { mode: 'loupgarou', wolves: $('#opt-lw-wolves').value, roles, deadSee: $('#opt-lw-dead').checked } });
  }
  if (pick === 'petitbac') {
    const cats = [...$('#opt-pb-cats').querySelectorAll('input:checked')].map(i => i.value);
    if (cats.length < 3) { toast('Choisis au moins trois catégories'); return; }
    if (cats.length > PetitBac.MAX_CATS) { toast(`${PetitBac.MAX_CATS} catégories au maximum`); return; }
    act({ t: 'start', opts: { mode: 'petitbac', cats, rounds: +$('#opt-pb-rounds').value, seconds: +$('#opt-pb-seconds').value, hard: $('#opt-pb-hard').checked, stopRule: $('#opt-pb-stop').checked } });
  }
  if (pick === 'geo') {
    (async () => {
      if (!window.MAPILLARY_TOKEN) { toast('Jeton Mapillary manquant : il faut le coller dans geo-config.js'); return; }
      const map = $('#opt-geo-map').value;
      await Geo.loadPlaces();
      if (!Geo.count(map)) { toast('Aucun lieu prêt pour cette carte'); return; }
      act({ t: 'start', opts: { mode: 'geo', map, geoMode: $('#opt-geo-mode').value, rounds: +$('#opt-geo-rounds').value, seconds: +$('#opt-geo-seconds').value } });
    })();
  }
};
$('#btn-again').onclick = () => act({ t: 'restart' });
$('#btn-home').onclick = () => location.reload();
$('#in-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });

try { $('#in-name').value = localStorage.getItem('dc-name') || ''; } catch { }
const urlCode = new URLSearchParams(location.search).get('c');
if (urlCode) $('#in-code').value = urlCode.toUpperCase().slice(0, 4);
show('s-home');
