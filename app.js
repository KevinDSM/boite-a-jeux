/* Platine — hub de jeux de musique jouables à plusieurs téléphones.
   Architecture : l'hôte (celui qui crée la partie) fait autorité. Il possède les bases de
   chansons et l'état de la partie, et diffuse un état "public" (sans l'année ni le titre de
   la chanson en cours) à tous les invités via WebRTC (PeerJS). Les invités n'envoient que
   des actions ; l'hôte les applique et rediffuse. */

'use strict';

// ============================================================ utilitaires
const $ = (s, root = document) => root.querySelector(s);
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const ROOM_PREFIX = 'decennies-v1-';
const ASSET_V = '15';

const BET_SECONDS = 12;
const TOKEN_START = 2, TOKEN_MAX = 3;
const E_LEVELS = [0.5, 1, 2, 3, 5];   // secondes écoutables par palier
const E_POINTS = [5, 4, 3, 2, 1];     // points si trouvé à ce palier
const E_GRACE = 0.12;                 // marge pour la latence de sortie audio (iPhone)

const GAMES = {
  timeline: { key: 'timeline', theme: 'decennies', name: 'Décennies' },
  eclair: { key: 'eclair', theme: 'eclair', name: 'Éclair' },
  sprint: { key: 'sprint', theme: 'sprint', name: 'Sprint' },
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
    const wasPlay = shownId === 's-game' || shownId === 's-eclair' || shownId === 's-sprint';
    shownId = id; window.scrollTo(0, 0);
    // quitter un écran de jeu coupe le son : il ne doit pas continuer dans le salon
    if (wasPlay && id !== 's-game' && id !== 's-eclair' && id !== 's-sprint') { stopSnippet(); audio.pause(); lastTurnKey = null; eLastRound = null; spLastRound = null; }
  }
  const game = id === 's-game' ? 'decennies' : id === 's-eclair' ? 'eclair' : id === 's-sprint' ? 'sprint' : (id === 's-end' && view ? GAMES[view.mode]?.theme : '');
  if (game) document.documentElement.dataset.game = game; else delete document.documentElement.dataset.game;
  $('#btn-back').hidden = id === 's-home';
  $('#btn-help').hidden = id === 's-home';
  $('#btn-vol').hidden = !(id === 's-game' || id === 's-eclair' || id === 's-sprint');
  if ($('#btn-vol').hidden) $('#vol-bar').hidden = true;
  $('#crumb').textContent = id === 's-home' ? 'Platine'
    : id === 's-lobby' ? 'Salon' + (net.code ? ' · ' + net.code : '')
      : id === 's-end' ? 'Classement' : (GAMES[view?.mode]?.name || 'Platine');
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
  constructor(code, songs, songsE) {
    this.songs = songs; this.songsE = songsE; this.seq = 0;
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
    if (p) { p.online = true; p.name = name || p.name; return p; }
    p = { id, name, tokens: TOKEN_START, timeline: [], score: 0, online: true, host };
    this.s.players.push(p);
    if (this.s.phase !== 'lobby' && this.s.phase !== 'end' && this.s.mode === 'timeline') p.timeline = [this.card()];
    return p;
  }
  setOffline(id) { const p = this.player(id); if (p) p.online = false; }

  // --- pioche
  pool() { const c = this.s.cats; const p = this.songs.filter(s => !c || c.includes(s.cat)); return p.length ? p : this.songs; }
  poolE() { const d = this.s.decades; const p = this.songsE.filter(x => !d || d.includes(Math.floor((+x.cat || x.year) / 10) * 10)); return p.length ? p : this.songsE; }
  draw() { if (!this.s.deck.length) this.s.deck = shuffle(this.s.mode === 'eclair' ? [...this.poolE()] : [...this.pool()]); return this.s.deck.pop(); }
  card() { return { ...this.draw(), at: ++this.seq }; }

  setPick(pid, key) { if (pid !== this.s.players[0]?.id) return null; if (GAMES[key]) this.s.pick = key; return null; }

  start(o) {
    const s = this.s;
    s.mode = o.mode || s.pick || 'timeline'; s.winner = null;
    if (s.mode === 'eclair') return this.startEclair(o);
    if (s.mode === 'sprint') return this.startSprint(o);
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
    s.rounds = o.rounds || 10; s.round = 0; s.decades = o.decades?.length ? o.decades : null;
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
    const ok = norm(title) === norm(s.current.title) || (norm(title).length > 3 && norm(s.current.title).includes(norm(title)));
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
    s.rounds = o.rounds || 10; s.round = 0; s.decades = o.decades?.length ? o.decades : null;
    s.speakerId = o.speakerId || null; s.soundAll = !o.speakerId;
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
    if (this.spMatch(text, s.current)) {
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

  restart() {
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
      current: s.current ? (hide ? { preview: s.current.preview } : s.current) : null,
      betLeft: s.phase === 'bet' ? Math.max(0, Math.ceil((s.betEnds - Date.now()) / 1000)) : 0,
      solo: s.players.filter(p => p.online).length <= 1,
      spLeft: s.phase === 's-play' ? Math.max(0, Math.ceil((s.roundEnds - Date.now()) / 1000)) : 0,
    };
  }
}

// ============================================================ réseau
const net = { peer: null, conns: new Map(), hostConn: null, isHost: false, game: null, me: uid(), name: '', code: '' };
let view = null, songsCache = null, songsECache = null;

async function loadSongs() { if (!songsCache) songsCache = await (await fetch('songs.json?v=' + ASSET_V)).json(); return songsCache; }
async function loadSongsE() { if (!songsECache) songsECache = await (await fetch('songs-eclair.json?v=' + ASSET_V)).json(); return songsECache; }
function setNet(on, label) { const n = $('#net'); n.className = 'net ' + (on ? 'on' : 'off'); n.textContent = label; }

function makePeer(id) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, { debug: 0 });
    peer.on('open', () => resolve(peer));
    peer.on('error', e => { if (e.type === 'unavailable-id') reject(new Error('code-taken')); else if (e.type === 'peer-unavailable') reject(new Error('no-room')); else reject(e); });
  });
}

async function hostGame() {
  const [songs, songsE] = await Promise.all([loadSongs(), loadSongsE()]);
  let code, peer;
  for (let i = 0; i < 5; i++) { code = genCode(); try { peer = await makePeer(ROOM_PREFIX + code); break; } catch (e) { if (e.message !== 'code-taken') throw e; } }
  if (!peer) throw new Error('Impossible de créer la salle');
  net.peer = peer; net.isHost = true; net.code = code; net.game = new Game(code, songs, songsE);
  net.game.addPlayer(net.me, net.name, true);
  peer.on('connection', conn => {
    conn.on('data', m => handleClientMessage(conn, m));
    conn.on('close', () => { const pid = conn.metadata?.pid; if (!pid || net.conns.get(pid) !== conn) return; net.conns.delete(pid); net.game.setOffline(pid); broadcast(); });
  });
  peer.on('disconnected', () => { setNet(false, 'reconnexion'); peer.reconnect(); });
  peer.on('open', () => setNet(true, 'hôte'));
  setNet(true, 'hôte');
  setInterval(() => { const before = net.game.s.phase; net.game.tick(); if (before !== net.game.s.phase || net.game.s.phase === 'bet' || net.game.s.phase === 's-play') broadcast(); }, 500);
  broadcast();
}

function handleClientMessage(conn, m) {
  if (m.t === 'hello') { conn.metadata = { pid: m.pid }; net.conns.set(m.pid, conn); net.game.addPlayer(m.pid, m.name); broadcast(); return; }
  const err = applyAction(m.pid, m);
  if (err) { try { conn.send({ t: 'err', msg: err }); } catch { } }
  broadcast();
}
function applyAction(pid, m) {
  const g = net.game;
  switch (m.t) {
    case 'pick': return g.setPick(pid, m.key);
    case 'start': if (pid === g.s.players[0]?.id) g.start(m.opts); return null;
    case 'restart': if (pid === g.s.players[0]?.id) g.restart(); return null;
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
  const pub = net.game.publicState();
  for (const c of net.conns.values()) { try { c.send({ t: 'state', s: pub }); } catch { } }
  view = pub; render();
}

async function joinGame(code) {
  const peer = await makePeer(undefined);
  net.peer = peer; net.isHost = false; net.code = code;
  await new Promise((resolve, reject) => {
    const conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
    const timer = setTimeout(() => reject(new Error('no-room')), 8000);
    conn.on('open', () => { clearTimeout(timer); net.hostConn = conn; conn.send({ t: 'hello', pid: net.me, name: net.name }); setNet(true, 'connecté'); resolve(); });
    conn.on('data', m => { if (m.t === 'state') { view = m.s; render(); } else if (m.t === 'err') toast(m.msg); });
    conn.on('close', () => { setNet(false, 'reconnexion'); setTimeout(() => joinGame(code).catch(() => { }), 2500); });
    peer.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

function act(m) {
  if (net.isHost) { const err = applyAction(net.me, m); if (err) toast(err); broadcast(); }
  else if (net.hostConn?.open) net.hostConn.send({ ...m, pid: net.me });
  else toast('Pas connecté à l\'hôte');
}
const isHostPlayer = () => net.isHost;

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
  else { show('s-game'); renderGame(s); }
  if (keep) {
    const n = document.getElementById(keep.id);
    if (n && n !== ae) { n.value = keep.v; n.focus({ preventScroll: true }); try { n.setSelectionRange(keep.a, keep.b); } catch { } n.dispatchEvent(new Event('input')); }
  }
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
  $('#lobby-wait').hidden = isHostPlayer();
  $('#lobby-wait').textContent = chosen ? `L'hôte prépare une partie de ${GAMES[s.pick].name}…` : 'L\'hôte choisit le jeu…';
}

// ------------------------------------------------ Décennies
let lastTurnKey = null, betArmed = false;

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
  const tl = $('#timeline'); tl.innerHTML = '';
  const cards = owner.timeline;
  const canPlace = s.phase === 'listen' && isMe;
  const canBetPlace = s.phase === 'bet' && iAmBettor && s.bet.idx == null;

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
  requestAnimationFrame(() => { const t = tl.querySelector('.pick,.new,.lost,.arm'); if (t) t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });

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
    : `Manche ${s.round}/${s.rounds}<small>Écoute ${fmtS(E_LEVELS[e.level])}. Le titre maintenant vaut <b class="pts">${E_POINTS[e.level]} pt${E_POINTS[e.level] > 1 ? 's' : ''}</b>.</small>`;
  else b.innerHTML = `Manche ${s.round}/${s.rounds} terminée<small>${s.round >= s.rounds ? 'Dernière manche. Place au classement.' : 'Touche « Manche suivante » quand tout le monde a vu.'}</small>`;

  loadAudio(s.current?.preview);
  if (s.round !== eLastRound) { eLastRound = s.round; stopSnippet(); $('#e-vinyl').classList.remove('revealed'); }
  const stage = $('#e-vinyl'), info = $('#e-info');
  if (reveal) { stage.classList.add('revealed'); $('#e-art').src = s.current.art; info.innerHTML = `<div class="big ok">${s.current.title}</div>${s.current.artist}<small>${s.current.year}</small>`; }
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
    const box = el('div', 'guess-box');
    box.innerHTML = `<input id="e-input" placeholder="Titre de la chanson…" autocomplete="off" autocapitalize="off"><div class="suggest" id="e-suggest" hidden></div>`;
    ac.appendChild(box);
    const row = el('div', 'row');
    row.innerHTML = `<button class="btn primary" id="e-submit">Valider</button>`
      + (e.level < E_LEVELS.length - 1 ? `<button class="btn" id="e-more">Écouter plus <span class="cost">${fmtS(E_LEVELS[e.level + 1])} · ${E_POINTS[e.level + 1]} pt${E_POINTS[e.level + 1] > 1 ? 's' : ''}</span></button>` : '')
      + `<button class="btn ghost small" id="e-giveup">Je passe</button>`;
    ac.appendChild(row);
    ac.appendChild(el('div', 'note', 'Un titre faux débloque automatiquement le palier suivant.'));
    const input = $('#e-input'), sug = $('#e-suggest');
    let hl = -1, items = [];
    const draw = () => {
      sug.innerHTML = '';
      items.forEach((it, i) => {
        const d = el('div', i === hl ? 'hl' : ''); d.innerHTML = `${it.title} <small>· ${it.artist}</small>`;
        d.onmousedown = ev => { ev.preventDefault(); input.value = it.title; sug.hidden = true; };
        sug.appendChild(d);
      });
      sug.hidden = !items.length;
    };
    input.oninput = () => { const q = norm(input.value); hl = -1; items = q.length < 2 ? [] : (eCatalog || []).filter(x => norm(x.title).includes(q) || norm(x.artist).includes(q)).slice(0, 6); draw(); };
    input.onkeydown = ev => {
      if (ev.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); draw(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { hl = Math.max(0, hl - 1); draw(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { if (hl >= 0) { input.value = items[hl].title; sug.hidden = true; } $('#e-submit').click(); ev.preventDefault(); }
    };
    input.onblur = () => setTimeout(() => sug.hidden = true, 150);
    $('#e-submit').onclick = () => { const t = input.value.trim(); if (!t) return; act({ t: 'e-guess', title: t }); input.value = ''; };
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
function makeGuessBox(inputId, placeholder, onSubmit, withArtist) {
  const box = el('div', 'guess-box');
  box.innerHTML = `<input id="${inputId}" placeholder="${placeholder}" autocomplete="off" autocapitalize="off"><div class="suggest" id="${inputId}-sug" hidden></div>`;
  setTimeout(() => {
    const input = document.getElementById(inputId), sug = document.getElementById(inputId + '-sug');
    if (!input) return;
    let hl = -1, items = [];
    const draw = () => {
      sug.innerHTML = '';
      items.forEach((it, i) => {
        const d = el('div', i === hl ? 'hl' : ''); d.innerHTML = `${it.title} <small>· ${it.artist}</small>`;
        d.onmousedown = ev => { ev.preventDefault(); input.value = withArtist ? `${it.title} — ${it.artist}` : it.title; sug.hidden = true; input.focus(); };
        sug.appendChild(d);
      });
      sug.hidden = !items.length;
    };
    input.oninput = () => {
      const q = norm(input.value); hl = -1;
      items = q.length < 2 ? [] : (eCatalog || []).filter(x => norm(x.title).includes(q) || norm(x.artist).includes(q)).slice(0, 6);
      draw();
    };
    input.onkeydown = ev => {
      if (ev.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); draw(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { hl = Math.max(0, hl - 1); draw(); ev.preventDefault(); }
      else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (hl >= 0) { input.value = withArtist ? `${items[hl].title} — ${items[hl].artist}` : items[hl].title; sug.hidden = true; hl = -1; items = []; draw(); return; }
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
      : `Manche ${s.round}/${s.rounds} <span class="timer">${s.spLeft}s</span><small>Artiste et titre, le plus vite possible. ${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}.</small>`;
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
    info.innerHTML = `<div class="big ok">${s.current.title}</div>${s.current.artist}<small>${s.current.year}</small>`;
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
  const key = `${s.phase}|${s.round}|${e.done}|${e.tries}`;
  if (key === spActionsKey && ac.children.length) { renderSPOthers(s, reveal); return; }
  spActionsKey = key; ac.innerHTML = '';

  if (!reveal && !e.done) {
    const submit = input => { const t = input.value.trim(); if (!t) return; act({ t: 'sp-guess', text: t }); input.value = ''; };
    const box = makeGuessBox('sp-input', 'Titre et artiste…', submit, true);
    ac.appendChild(box);
    const row = el('div', 'row');
    row.innerHTML = `<button class="btn primary" id="sp-submit">Valider</button><button class="btn ghost small" id="sp-pass">Je sèche</button>`;
    ac.appendChild(row);
    ac.appendChild(el('div', 'note', 'Choisis dans la liste : elle remplit le titre <b>et</b> l\'artiste d\'un coup.'));
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

// ------------------------------------------------ fin
function renderEnd(s) {
  const w = s.players.find(p => p.id === s.winner);
  const eclair = s.mode !== 'timeline';
  const solo = s.players.filter(p => p.online).length <= 1;
  $('#end-winner').textContent = solo ? 'Terminé' : (w ? w.name : '—');
  $('#end-sub').textContent = solo
    ? (eclair ? `${w ? w.score : 0} points sur ${s.rounds} manches.` : `Frise complète : ${s.target} cartes bien placées.`)
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
    </ul>
    <p>Le plus grand total après toutes les manches gagne.</p>`,
  sprint: `<h3>Sprint</h3>
    <p>La même chanson démarre chez tout le monde en même temps. Le but : donner <b>l'artiste et le titre</b> avant les autres.</p>
    <ul>
      <li>Le 1<sup>er</sup> marque 5 points, le 2<sup>e</sup> 3, le 3<sup>e</sup> 2, les suivants 1.</li>
      <li>Trois essais par manche, puis la manche est finie pour toi.</li>
      <li>La liste de suggestions remplit le titre et l'artiste d'un seul coup : sers-t'en, c'est plus rapide que de tout taper.</li>
      <li>La manche s'arrête quand l'extrait est fini ou que tout le monde a répondu.</li>
    </ul>`,
  hub: `<h3>Platine</h3><p>Une personne crée la partie et partage le code. Les autres ouvrent la même adresse et tapent ce code. L'hôte choisit ensuite le jeu.</p>
    <p>L'hôte garde son téléphone ouvert : c'est lui qui fait tourner la partie.</p>`,
};
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
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#btn-theme').textContent = t === 'light' ? '☾' : '☀';
  try { localStorage.setItem('dc-theme', t); } catch { }
  requestAnimationFrame(syncThemeColor);
}
$('#btn-theme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
let savedTheme = null; try { savedTheme = localStorage.getItem('dc-theme'); } catch { }
applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

// ============================================================ écrans d'entrée
$('#f-home').addEventListener('submit', async e => {
  e.preventDefault();
  const mode = e.submitter?.dataset.act;
  const name = $('#in-name').value.trim(), code = $('#in-code').value.trim().toUpperCase();
  const err = $('#home-err'); err.textContent = '';
  if (!name) { err.textContent = 'Il faut un prénom.'; return; }
  try { localStorage.setItem('dc-name', name); } catch { }
  net.name = name;
  if (typeof Peer === 'undefined') { err.textContent = 'Le module réseau n\'a pas chargé. Vérifie ta connexion.'; return; }
  e.submitter.disabled = true;
  try {
    if (mode === 'create') { await hostGame(); keepAwake(); }
    else { if (code.length !== 4) { err.textContent = 'Le code fait 4 lettres.'; return; } await joinGame(code); keepAwake(); }
  } catch (ex) {
    err.textContent = ex.message === 'no-room' ? 'Aucune partie avec ce code.' : 'Connexion impossible : ' + (ex.message || ex.type || ex);
  } finally { e.submitter.disabled = false; }
});
$('#btn-solo').onclick = async () => {
  net.name = $('#in-name').value.trim() || 'Moi';
  try { await hostGame(); keepAwake(); } catch (ex) { $('#home-err').textContent = 'Connexion impossible : ' + (ex.message || ex); }
};
document.querySelectorAll('.gcard').forEach(b => b.onclick = () => act({ t: 'pick', key: b.dataset.game }));
$('#btn-start').onclick = () => {
  const pick = view?.pick; if (!pick) { toast('Choisis un jeu'); return; }
  if (pick === 'timeline') {
    const cats = [...$('#opt-cats').querySelectorAll('input:checked')].map(i => i.value);
    if (!cats.length) { toast('Choisis au moins une playlist'); return; }
    const snd = $('#opt-sound').value;
    act({ t: 'start', opts: { mode: 'timeline', cats, target: +$('#opt-target').value, speakerId: snd === 'host' ? net.me : null, soundAll: snd === 'all' } });
  } else if (pick === 'eclair') {
    const decades = [...$('#opt-decades').querySelectorAll('input:checked')].map(i => +i.value);
    if (!decades.length) { toast('Choisis au moins une décennie'); return; }
    act({ t: 'start', opts: { mode: 'eclair', decades, rounds: +$('#opt-rounds').value } });
  } else {
    const decades = [...$('#opt-decades-s').querySelectorAll('input:checked')].map(i => +i.value);
    if (!decades.length) { toast('Choisis au moins une décennie'); return; }
    act({ t: 'start', opts: { mode: 'sprint', decades, rounds: +$('#opt-rounds-s').value, speakerId: $('#opt-sound-s').value === 'host' ? net.me : null } });
  }
};
$('#btn-again').onclick = () => act({ t: 'restart' });
$('#btn-home').onclick = () => location.reload();
$('#in-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });

try { $('#in-name').value = localStorage.getItem('dc-name') || ''; } catch { }
const urlCode = new URLSearchParams(location.search).get('c');
if (urlCode) $('#in-code').value = urlCode.toUpperCase().slice(0, 4);
show('s-home');
