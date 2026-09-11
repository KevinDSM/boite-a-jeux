/* Décennies — blind test chronologique entre téléphones.
   Architecture : l'hôte (celui qui crée la partie) fait autorité. Il possède la base de
   chansons, l'état de la partie, et diffuse un état "public" (sans l'année de la carte en
   cours) à tous les invités via WebRTC (PeerJS). Les invités n'envoient que des actions. */

'use strict';

// ------------------------------------------------------------ utilitaires
const $ = (s, el = document) => el.querySelector(s);
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const ROOM_PREFIX = 'decennies-v1-';
const BET_SECONDS = 12;
const E_LEVELS = [0.5, 1, 2, 3, 5];          // secondes écoutables par palier
const E_POINTS = [5, 4, 3, 2, 1];             // points si trouvé à ce palier
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const genCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c = ''; for (let i = 0; i < 4; i++) c += A[Math.random() * A.length | 0]; return c; };
const uid = () => { let u = localStorage.getItem('dc-uid'); if (!u) { u = Math.random().toString(36).slice(2, 10); localStorage.setItem('dc-uid', u); } return u; };

let toastTimer;
function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
function show(id) { document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id); window.scrollTo(0, 0); }

// ------------------------------------------------------------ audio
const audio = new Audio(); audio.preload = 'auto';
let audioUrl = null;
function loadAudio(url) { if (audioUrl === url) return; audioUrl = url; audio.src = url || ''; $('#prog').style.width = 0; }
function togglePlay() {
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(() => toast('Touche à nouveau pour lancer le son'));
  else audio.pause();
}
audio.addEventListener('play', () => { $('#vinyl').classList.add('spin'); $('#btn-play').textContent = '❚❚ Pause'; });
audio.addEventListener('pause', () => { $('#vinyl').classList.remove('spin'); $('#btn-play').textContent = audio.currentTime > 0 && audio.currentTime < audio.duration ? '▶ Reprendre' : '▶ Réécouter'; });
audio.addEventListener('timeupdate', () => { $('#prog').style.width = (audio.currentTime / (audio.duration || 30) * 100) + '%'; });
$('#btn-play').onclick = togglePlay;

// volume (utile sur ordinateur ; les iPhone ignorent audio.volume)
let savedVol = 100; try { savedVol = +(localStorage.getItem('dc-vol') ?? 100); } catch { }
audio.volume = savedVol / 100; $('#vol').value = savedVol;
$('#btn-vol').onclick = () => { $('#vol-bar').hidden = !$('#vol-bar').hidden; };
$('#vol').oninput = e => { audio.volume = e.target.value / 100; $('#btn-vol').textContent = e.target.value == 0 ? '🔇' : '🔊'; try { localStorage.setItem('dc-vol', e.target.value); } catch { } };
$('#btn-vol').textContent = savedVol == 0 ? '🔇' : '🔊';

let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !wakeLock) keepAwake(); });

// ------------------------------------------------------------ moteur de jeu (côté hôte)
/* Etat complet (hôte uniquement) :
   { code, phase: lobby|listen|bet|reveal|end, players:[{id,name,tokens,timeline:[song],online,host}],
     turn, target, deck:[song], current:song|null, placement:null|idx, bets:{pid:idx}, passes:[pid],
     betEnds:ts, guess:{artist,title}|null, result:{ok,by,year,song,tokenWon}|null, winner:pid|null, speakerId } */
class Game {
  constructor(code, songs, songsE) { this.songs = songs; this.songsE = songsE; this.state = { code, mode: 'timeline', rounds: 10, round: 0, eclair: {}, phase: 'lobby', players: [], turn: 0, target: 10, deck: [], current: null, placement: null, bets: {}, passes: [], betEnds: 0, guess: null, result: null, winner: null, cats: null, speakerId: null }; }
  get s() { return this.state; }
  player(id) { return this.s.players.find(p => p.id === id); }
  get active() { return this.s.players[this.s.turn % this.s.players.length]; }

  addPlayer(id, name, host = false) {
    let p = this.player(id);
    if (p) { p.online = true; p.name = name || p.name; return p; }
    p = { id, name, tokens: 2, timeline: [], online: true, host };
    this.s.players.push(p);
    if (this.s.phase !== 'lobby' && this.s.phase !== 'end') p.timeline = [this.draw()];  // arrivé en cours de partie
    return p;
  }
  setOffline(id) { const p = this.player(id); if (p) p.online = false; }

  draw() {
    if (!this.s.deck.length) this.s.deck = shuffle(this.pool());
    return this.s.deck.pop();
  }
  pool() { const cats = this.s.cats; return this.songs.filter(s => !cats || cats.includes(s.cat)); }

  start({ mode, rounds, target, cats, speakerId, soundAll }) {
    const s = this.s;
    s.mode = mode || 'timeline';
    if (s.mode === 'eclair') return this.startEclair(rounds || 10);
    s.target = target; s.cats = cats && cats.length ? cats : null; s.speakerId = speakerId; s.soundAll = !!soundAll;
    s.deck = shuffle(this.pool()); s.winner = null; s.turn = 0;
    s.players.forEach(p => { p.tokens = 2; p.timeline = [this.draw()]; });
    this.nextSong(); s.phase = 'listen';
  }
  nextSong() { const s = this.s; s.current = this.draw(); s.placement = null; s.bets = {}; s.passes = []; s.guess = null; s.result = null; s.betEnds = 0; }

  // -- actions (retournent un message d'erreur ou null)
  place(pid, idx) {
    const s = this.s; if (s.phase !== 'listen' || pid !== this.active.id) return 'Pas ton tour';
    s.placement = idx; s.phase = 'bet'; s.betEnds = Date.now() + BET_SECONDS * 1000;
    if (s.players.filter(p => p.id !== pid && p.online && p.tokens > 0).length === 0) this.reveal();
    return null;
  }
  bet(pid, idx) {
    const s = this.s; const p = this.player(pid);
    if (s.phase !== 'bet' || pid === this.active.id) return 'Impossible maintenant';
    if (p.tokens < 1) return 'Il te faut un jeton';
    if (idx === s.placement) return 'Choisis un autre emplacement que ' + this.active.name;
    if (s.bets[pid] != null) return 'Tu as déjà parié';
    p.tokens--; s.bets[pid] = idx; this.checkBetsDone(); return null;
  }
  pass(pid) { const s = this.s; if (s.phase !== 'bet' || pid === this.active.id) return null; if (!s.passes.includes(pid)) s.passes.push(pid); this.checkBetsDone(); return null; }
  checkBetsDone() {
    const s = this.s; const others = s.players.filter(p => p.id !== this.active.id && p.online);
    if (others.every(p => s.bets[p.id] != null || s.passes.includes(p.id) || p.tokens < 1 && s.passes.includes(p.id))) this.reveal();
  }
  guess(pid, artist, title) { const s = this.s; if (pid !== this.active.id || !['listen', 'bet'].includes(s.phase)) return 'Impossible'; s.guess = { artist, title }; return null; }
  skip(pid) {
    const s = this.s; const p = this.player(pid); if (s.phase !== 'listen' || pid !== this.active.id) return 'Pas ton tour';
    if (p.tokens < 1) return 'Il te faut un jeton'; p.tokens--; this.nextSong(); return null;
  }
  buy(pid) {
    const s = this.s; const p = this.player(pid); if (s.phase !== 'listen' || pid !== this.active.id) return 'Pas ton tour';
    if (p.tokens < 3) return 'Il te faut 3 jetons'; p.tokens -= 3;
    const c = this.draw(); this.insert(p, c); if (p.timeline.length >= s.target) { s.winner = p.id; s.phase = 'end'; }
    return null;
  }
  insert(p, song) { let i = 0; while (i < p.timeline.length && p.timeline[i].year <= song.year) i++; p.timeline.splice(i, 0, song); return i; }
  fits(timeline, idx, year) { const before = idx === 0 ? -Infinity : timeline[idx - 1].year; const after = idx === timeline.length ? Infinity : timeline[idx].year; return year >= before && year <= after; }

  reveal() {
    const s = this.s; const a = this.active; const song = s.current;
    const ok = this.fits(a.timeline, s.placement, song.year);
    let by = null, insertedAt = null;
    if (ok) { a.timeline.splice(s.placement, 0, song); by = a.id; insertedAt = s.placement; }
    else {
      for (const p of s.players) {   // premier parieur (ordre de table) qui a vu juste
        const idx = s.bets[p.id]; if (idx == null) continue;
        if (this.fits(a.timeline, idx, song.year)) { by = p.id; insertedAt = this.insert(p, song); break; }
      }
    }
    let tokenWon = false;
    if (s.guess) {
      const ga = norm(s.guess.artist), gt = norm(s.guess.title);
      const artistOk = ga && (norm(song.artist).includes(ga) || ga.includes(norm(song.artist).split(' ')[0]));
      const titleOk = gt && (norm(song.title).includes(gt) || gt.includes(norm(song.title)));
      if (artistOk && titleOk) { a.tokens++; tokenWon = true; }
    }
    s.result = { ok, by, year: song.year, song, tokenWon, insertedAt, placement: s.placement, bets: { ...s.bets }, activeId: a.id };
    s.phase = 'reveal';
    const w = s.players.find(p => p.timeline.length >= s.target); if (w) s.winner = w.id;
  }
  next() {
    const s = this.s; if (s.phase !== 'reveal') return;
    if (s.winner) { s.phase = 'end'; return; }
    s.turn++; let guard = 0; while (!this.active.online && guard++ < s.players.length) s.turn++;
    this.nextSong(); s.phase = 'listen';
  }
  tick() { const s = this.s; if (s.phase === 'bet' && Date.now() > s.betEnds) this.reveal(); }
  restart() { const s = this.s; s.phase = 'lobby'; s.winner = null; s.result = null; s.current = null; s.round = 0; s.eclair = {}; s.players.forEach(p => { p.timeline = []; p.score = 0; }); }

  // ================= mode Éclair =================
  startEclair(rounds) {
    const s = this.s; s.rounds = rounds; s.round = 0; s.winner = null;
    s.deck = shuffle([...this.songsE]);
    s.players.forEach(p => { p.score = 0; });
    this.nextRound();
  }
  nextRound() {
    const s = this.s; s.round++;
    if (!s.deck.length) s.deck = shuffle([...this.songsE]);
    s.current = s.deck.pop(); s.eclair = {}; s.result = null;
    s.players.forEach(p => { s.eclair[p.id] = { level: 0, done: false, points: 0, tries: [] }; });
    s.phase = 'e-play';
  }
  eSlot(pid) { const s = this.s; if (!s.eclair[pid]) s.eclair[pid] = { level: 0, done: false, points: 0, tries: [] }; return s.eclair[pid]; }
  eUnlock(pid) { const s = this.s; if (s.phase !== 'e-play') return 'Pas maintenant'; const e = this.eSlot(pid); if (e.done) return 'Tu as déjà terminé'; if (e.level < E_LEVELS.length - 1) e.level++; return null; }
  eGuess(pid, title) {
    const s = this.s; if (s.phase !== 'e-play') return 'Pas maintenant'; const e = this.eSlot(pid); if (e.done) return 'Tu as déjà terminé';
    const ok = norm(title) === norm(s.current.title) || (norm(title).length > 3 && norm(s.current.title).includes(norm(title)));
    e.tries.push({ title, ok });
    if (ok) { e.done = true; e.points = E_POINTS[e.level]; this.player(pid).score += e.points; }
    else if (e.level < E_LEVELS.length - 1) e.level++;
    else { e.done = true; e.points = 0; }
    this.eCheckDone(); return ok ? null : 'Raté !';
  }
  eGiveUp(pid) { const s = this.s; if (s.phase !== 'e-play') return null; const e = this.eSlot(pid); if (e.done) return null; e.done = true; e.points = 0; this.eCheckDone(); return null; }
  eCheckDone() { const s = this.s; if (s.players.filter(p => p.online).every(p => this.eSlot(p.id).done)) s.phase = 'e-reveal'; }
  eNext() {
    const s = this.s; if (s.phase !== 'e-reveal') return;
    if (s.round >= s.rounds) { s.phase = 'end'; const best = [...s.players].sort((a, b) => b.score - a.score)[0]; s.winner = best?.id || null; return; }
    this.nextRound();
  }

  // état diffusé aux invités : on masque tout ce qui trahit la chanson en cours
  publicState() {
    const s = this.s; const hide = s.phase === 'listen' || s.phase === 'bet' || s.phase === 'e-play';
    return { ...s, deck: undefined, deckLeft: s.deck.length, current: s.current ? (hide ? { preview: s.current.preview } : s.current) : null, betLeft: s.phase === 'bet' ? Math.max(0, Math.ceil((s.betEnds - Date.now()) / 1000)) : 0 };
  }
}

// ------------------------------------------------------------ réseau
const net = { peer: null, conns: new Map(), hostConn: null, isHost: false, game: null, me: uid(), name: '', code: '' };
let view = null;         // état public affiché
let songsCache = null, songsECache = null;

async function loadSongs() { if (!songsCache) songsCache = await (await fetch('songs.json?v=7')).json(); return songsCache; }
async function loadSongsE() { if (!songsECache) songsECache = await (await fetch('songs-eclair.json?v=7')).json(); return songsECache; }
function setNet(on, label) { const n = $('#net'); n.className = 'net-status ' + (on ? 'on' : 'off'); n.textContent = label; }

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
    conn.on('close', () => { const pid = conn.metadata?.pid; net.conns.delete(pid); if (pid) { net.game.setOffline(pid); broadcast(); } });
  });
  peer.on('disconnected', () => { setNet(false, 'reconnexion…'); peer.reconnect(); });
  peer.on('open', () => setNet(true, 'hôte'));
  setNet(true, 'hôte');
  setInterval(() => { const before = net.game.s.phase; net.game.tick(); if (before !== net.game.s.phase || net.game.s.phase === 'bet') broadcast(); }, 500);
  broadcast();
}

function handleClientMessage(conn, m) {
  const g = net.game;
  if (m.t === 'hello') { conn.metadata = { pid: m.pid }; net.conns.set(m.pid, conn); g.addPlayer(m.pid, m.name); broadcast(); return; }
  const err = applyAction(m.pid, m);
  if (err) conn.send({ t: 'err', msg: err });
  broadcast();
}
function applyAction(pid, m) {
  const g = net.game;
  switch (m.t) {
    case 'place': return g.place(pid, m.idx);
    case 'bet': return g.bet(pid, m.idx);
    case 'pass': return g.pass(pid);
    case 'guess': return g.guess(pid, m.artist, m.title);
    case 'skip': return g.skip(pid);
    case 'buy': return g.buy(pid);
    case 'next': g.next(); return null;
    case 'e-unlock': return g.eUnlock(pid);
    case 'e-guess': return g.eGuess(pid, m.title);
    case 'e-giveup': return g.eGiveUp(pid);
    case 'e-next': g.eNext(); return null;
    case 'start': if (pid === net.me) g.start(m.opts); return null;
    case 'restart': if (pid === net.me) g.restart(); return null;
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
    conn.on('close', () => { setNet(false, 'hôte perdu'); toast('Connexion perdue, nouvel essai…'); setTimeout(() => joinGame(code).catch(() => { }), 2500); });
    peer.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

// envoie une action : localement si hôte, sinon à l'hôte
function act(m) {
  if (net.isHost) { const err = applyAction(net.me, m); if (err) toast(err); broadcast(); }
  else if (net.hostConn?.open) net.hostConn.send({ ...m, pid: net.me });
  else toast('Pas connecté à l\'hôte');
}

// ------------------------------------------------------------ rendu
function render() {
  if (!view) return;
  const s = view;
  if (s.phase === 'lobby') { show('s-lobby'); renderLobby(s); return; }
  if (s.phase === 'end') { show('s-end'); renderEnd(s); audio.pause(); return; }
  if (s.phase === 'e-play' || s.phase === 'e-reveal') { show('s-eclair'); renderEclair(s); return; }
  show('s-game'); renderGame(s);
}

function renderLobby(s) {
  $('#lobby-code').textContent = s.code;
  const wrap = $('#lobby-players'); wrap.innerHTML = '';
  s.players.forEach(p => { const c = el('div', 'player-chip' + (p.host ? ' host' : '') + (p.online ? '' : ' off')); c.innerHTML = `<span class="dot">${p.name[0].toUpperCase()}</span>${p.name}${p.host ? ' · hôte' : ''}`; wrap.appendChild(c); });
  $('#lobby-opts').hidden = !net.isHost; $('#lobby-wait').hidden = net.isHost;
  if (net.isHost && !$('#opt-cats').querySelector('label')) {
    const cats = [...new Set(songsCache.map(x => x.cat))];
    cats.forEach(c => { const l = el('label'); l.innerHTML = `<input type="checkbox" value="${c}" checked>${c}`; $('#opt-cats').appendChild(l); });
  }
  $('#btn-start').disabled = s.players.length < 1;
  syncLobbyMode();
}
function syncLobbyMode() {
  const mode = document.querySelector('#opt-mode input:checked')?.value || 'timeline';
  const eclair = mode === 'eclair';
  $('#opt-cats').hidden = eclair; $('#opt-target').closest('label').hidden = eclair; $('#row-sound').hidden = eclair; $('#row-rounds').hidden = !eclair;
}
document.querySelectorAll('#opt-mode input').forEach(r => r.onchange = syncLobbyMode);

function renderGame(s) {
  const me = s.players.find(p => p.id === net.me);
  const active = s.players[s.turn % s.players.length];
  const isMe = active.id === net.me;
  const r = s.result;

  // --- tableau des scores
  const sb = $('#scoreboard'); sb.innerHTML = '';
  s.players.forEach(p => {
    const d = el('div', 'sb' + (p.id === active.id ? ' active' : '') + (p.id === net.me ? ' me' : ''));
    d.innerHTML = `<span class="name">${p.name}</span><span class="stats"><span><b>${p.timeline.length}</b>/${s.target}</span><span class="tok"><b>${p.tokens}</b> ●</span></span>`;
    if (!p.online) d.style.opacity = .45;
    sb.appendChild(d);
  });

  // --- bandeau de tour
  const banner = $('#turn-banner');
  if (s.phase === 'listen') banner.innerHTML = isMe ? `À toi de jouer<small>Écoute, puis touche un « + » dans ta frise.</small>` : `${active.name} écoute<small>Tu pourras parier un jeton s'il se trompe.</small>`;
  else if (s.phase === 'bet') banner.innerHTML = (isMe ? `Les autres peuvent parier` : `${active.name} a choisi`) + ` <span class="timer">${s.betLeft}s</span><small>${isMe ? 'Patiente, ou ils passent tous.' : (me && me.tokens > 0 && s.bets[me.id] == null ? 'Touche un autre « + » pour parier 1 jeton.' : 'Pari impossible.')}</small>`;
  else if (s.phase === 'reveal') {
    const by = r.by ? s.players.find(p => p.id === r.by) : null;
    let txt = r.ok ? `${by.name} a trouvé !` : (by ? `${active.name} s'est trompé, ${by.name} rafle la carte !` : `${active.name} s'est trompé`);
    let sub = r.tokenWon ? `Artiste et titre corrects : +1 jeton pour ${active.name}.` : (s.winner ? 'Frise complète, partie terminée !' : 'Touche « Tour suivant » quand tout le monde a vu.');
    banner.innerHTML = `${txt}<small>${sub}</small>`;
  }

  // --- carte en cours
  const vinyl = $('#vinyl'); const info = $('#track-info');
  const speakerHere = s.soundAll || (s.speakerId ? s.speakerId === net.me : isMe);
  loadAudio(s.current?.preview);
  if (s.phase === 'reveal') {
    vinyl.classList.add('revealed'); $('#art').src = r.song.art;
    info.innerHTML = `<div class="year ${r.ok ? 'ok' : 'ko'}">${r.year}</div>${r.song.artist}<small>${r.song.title}</small>`;
  } else { vinyl.classList.remove('revealed'); $('#art').removeAttribute('src'); info.innerHTML = speakerHere ? '' : `<small>Le son sort du téléphone de ${s.speakerId ? s.players.find(p => p.id === s.speakerId)?.name : active.name}.</small>`; }
  $('#audio-row').hidden = !(speakerHere || s.phase === 'reveal');
  if (s.phase === 'listen' && speakerHere && lastTurnKey !== s.turn + ':' + s.current?.preview) { lastTurnKey = s.turn + ':' + s.current?.preview; audio.currentTime = 0; audio.play().catch(() => { }); }

  // --- frise du joueur actif (ou du gagnant de la carte en révélation)
  const tlOwner = s.phase === 'reveal' && r.by && r.by !== active.id ? s.players.find(p => p.id === r.by) : active;
  $('#tl-owner').textContent = tlOwner.id === net.me ? 'Ta frise' : `Frise de ${tlOwner.name}`;
  const tl = $('#timeline'); tl.innerHTML = '';
  const cards = tlOwner.timeline;
  const canPlace = s.phase === 'listen' && isMe;
  const canBet = s.phase === 'bet' && !isMe && me && me.tokens > 0 && s.bets[me.id] == null && !s.passes.includes(me.id);
  const nameOf = id => s.players.find(p => p.id === id)?.name;
  for (let i = 0; i <= cards.length; i++) {
    // en révélation la carte a déjà été insérée : décale les indices pour marquer le bon slot
    if (i < cards.length) { }
    const slot = el('div', 'slot', '+');
    if (s.phase === 'bet' || s.phase === 'reveal' && tlOwner.id === active.id) {
      const placement = s.phase === 'reveal' ? r.placement : s.placement;
      const shift = s.phase === 'reveal' && r.ok && i > r.insertedAt ? 1 : 0;   // slot après la carte insérée
      if (i === placement + shift && !(s.phase === 'reveal' && r.ok && i === r.insertedAt + 1)) { slot.classList.add('pick'); slot.dataset.who = active.name; }
      Object.entries(s.phase === 'reveal' ? r.bets : s.bets).forEach(([pid, idx]) => { if (idx + shift === i) { slot.classList.add(pid === net.me ? 'mine' : 'bet'); slot.dataset.bet = nameOf(pid); } });
      if (s.phase === 'reveal' && !r.ok) { const ok = fitsView(cards, i, r.year); slot.classList.add(ok ? 'right' : (i === placement ? 'wrong' : '')); }
    }
    if (!(canPlace || canBet)) slot.classList.add('disabled');
    slot.onclick = () => { if (canPlace) act({ t: 'place', idx: i }); else if (canBet) { if (i === s.placement) toast(`C'est déjà le choix de ${active.name}`); else act({ t: 'bet', idx: i }); } };
    tl.appendChild(slot);
    if (i < cards.length) {
      const c = cards[i]; const card = el('div', 'tcard');
      card.innerHTML = `<img src="${c.art}" alt=""><b>${c.year}</b><small>${c.artist}<br>${c.title}</small>`;
      if (s.phase === 'reveal' && r.by === tlOwner.id && i === r.insertedAt) card.classList.add('new');
      tl.appendChild(card);
    }
  }
  if (s.phase === 'reveal' && !r.by) {   // carte perdue : fantôme à l'endroit choisi
    const ghost = el('div', 'tcard lost'); ghost.innerHTML = `<img src="${r.song.art}" alt=""><b>${r.year}</b><small>${r.song.artist}<br>${r.song.title}</small>`;
    tl.insertBefore(ghost, tl.children[r.placement * 2 + 1] || null);
  }
  requestAnimationFrame(() => { const pick = tl.querySelector('.pick,.new,.lost'); if (pick) pick.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); });

  // --- actions
  const ac = $('#actions'); ac.innerHTML = '';
  if (s.phase === 'listen' && isMe) {
    const g = el('div', 'guess'); g.innerHTML = `<input id="g-artist" placeholder="Artiste" autocomplete="off"><input id="g-title" placeholder="Titre" autocomplete="off">`;
    ac.appendChild(el('div', 'note', 'Bonus : artiste + titre exacts = 1 jeton'));
    ac.appendChild(g);
    const row = el('div', 'row');
    row.innerHTML = `<button class="btn" id="b-skip" ${me.tokens < 1 ? 'disabled' : ''}>Passer <span class="cost">1 ●</span></button><button class="btn" id="b-buy" ${me.tokens < 3 ? 'disabled' : ''}>Acheter une carte <span class="cost">3 ●</span></button>`;
    ac.appendChild(row);
    $('#b-skip').onclick = () => act({ t: 'skip' });
    $('#b-buy').onclick = () => act({ t: 'buy' });
    const sendGuess = () => { const a = $('#g-artist').value, t = $('#g-title').value; if (a || t) act({ t: 'guess', artist: a, title: t }); };
    $('#g-artist').onchange = sendGuess; $('#g-title').onchange = sendGuess;
    if (s.guess) { $('#g-artist').value = s.guess.artist; $('#g-title').value = s.guess.title; }
  }
  if (s.phase === 'bet' && !isMe && me) {
    if (s.bets[me.id] != null) ac.appendChild(el('div', 'note', 'Pari enregistré. On attend les autres.'));
    else if (s.passes.includes(me.id)) ac.appendChild(el('div', 'note', 'Tu as passé.'));
    else { const b = el('button', 'btn', 'Je ne parie pas'); b.onclick = () => act({ t: 'pass' }); ac.appendChild(b); }
  }
  if (s.phase === 'reveal') {
    const b = el('button', 'btn ' + (s.winner ? 'mint' : 'primary'), s.winner ? 'Voir le classement' : 'Tour suivant →'); b.onclick = () => act({ t: 'next' }); ac.appendChild(b);
  }
}
let lastTurnKey = null;
function fitsView(cards, idx, year) { const b = idx === 0 ? -Infinity : cards[idx - 1].year; const a = idx === cards.length ? Infinity : cards[idx].year; return year >= b && year <= a; }

// ================= rendu Éclair =================
let eSnippetLimit = 0, eLastRound = null, eCatalog = null, eTimer = null;
function playSnippet(sec) {
  if (!audio.src) return;
  clearTimeout(eTimer); eSnippetLimit = sec; audio.pause(); audio.currentTime = 0;
  audio.play().then(() => { eTimer = setTimeout(() => { audio.pause(); eSnippetLimit = 0; drawSegProgress(); }, sec * 1000); })
    .catch(() => toast('Touche à nouveau pour lancer le son'));
}
audio.addEventListener('timeupdate', () => { if (eSnippetLimit && audio.currentTime >= eSnippetLimit) { audio.pause(); eSnippetLimit = 0; } drawSegProgress(); });
function drawSegProgress() {
  const bar = $('#e-segbar'); if (!bar.children.length || $('#s-eclair').hidden) return;
  let start = 0;
  [...bar.children].forEach((seg, i) => { const end = E_LEVELS[i]; const b = seg.querySelector('b'); const t = audio.currentTime; b.style.width = (Math.max(0, Math.min(1, (t - start) / (end - start))) * 100) + '%'; start = end; });
}
const fmtS = v => (v + '').replace('.', ',') + ' s';

function renderEclair(s) {
  const e = s.eclair[net.me] || { level: 0, done: false, points: 0, tries: [] };
  const reveal = s.phase === 'e-reveal';

  // scores
  const sb = $('#e-scoreboard'); sb.innerHTML = '';
  s.players.forEach(p => { const d = el('div', 'sb' + (p.id === net.me ? ' me' : '')); d.innerHTML = `<span class="name">${p.name}</span><span class="stats"><span><b>${p.score || 0}</b> pts</span></span>`; if (!p.online) d.style.opacity = .45; sb.appendChild(d); });

  // bandeau
  const b = $('#e-banner');
  if (!reveal) b.innerHTML = e.done ? `Manche ${s.round}/${s.rounds} <span class="pts">${e.points ? '+' + e.points : '0'} pt${e.points > 1 ? 's' : ''}</span><small>On attend les autres…</small>`
    : `Manche ${s.round}/${s.rounds}<small>Écoute ${fmtS(E_LEVELS[e.level])}. Trouve le titre pour <b class="pts">${E_POINTS[e.level]} pt${E_POINTS[e.level] > 1 ? 's' : ''}</b>, ou écoute plus.</small>`;
  else b.innerHTML = `Manche ${s.round}/${s.rounds} terminée<small>${s.round >= s.rounds ? 'Dernière manche ! Voir le classement.' : 'Touche « Manche suivante » quand tout le monde a vu.'}</small>`;

  // carte + audio
  loadAudio(s.current?.preview);
  if (s.round !== eLastRound) { eLastRound = s.round; eSnippetLimit = 0; audio.pause(); $('#e-vinyl').classList.remove('revealed'); }
  const vinyl = $('#e-vinyl'), info = $('#e-info');
  if (reveal) { vinyl.classList.add('revealed'); $('#e-art').src = s.current.art; info.innerHTML = `<div class="year ok">${s.current.title}</div>${s.current.artist}<small>${s.current.year}</small>`; }
  else { $('#e-art').removeAttribute('src'); info.innerHTML = e.tries.length ? `<small>Raté : ${e.tries.map(t => t.title).join(' · ')}</small>` : ''; }

  // barre segmentée
  const bar = $('#e-segbar'); bar.innerHTML = '';
  let prev = 0;
  E_LEVELS.forEach((sec, i) => { const seg = el('i'); seg.style.setProperty('--w', sec - prev); seg.dataset.s = fmtS(sec); if (i <= e.level || reveal) seg.classList.add('open'); seg.innerHTML = '<b></b>'; bar.appendChild(seg); prev = sec; });
  const lim = reveal ? 30 : E_LEVELS[e.level];
  $('#e-len').textContent = reveal ? '30 s' : fmtS(lim);
  $('#e-play').onclick = () => { if (reveal) { eSnippetLimit = 0; audio.currentTime = 0; audio.play().catch(() => { }); } else playSnippet(lim); };

  // actions
  const ac = $('#e-actions'); ac.innerHTML = '';
  if (!reveal && !e.done) {
    const box = el('div', 'guess-box'); box.innerHTML = `<input id="e-input" placeholder="Titre de la chanson…" autocomplete="off" autocapitalize="off"><div class="suggest" id="e-suggest" hidden></div>`;
    ac.appendChild(box);
    const row = el('div', 'row');
    row.innerHTML = `<button class="btn primary" id="e-submit">Valider</button>` +
      (e.level < E_LEVELS.length - 1 ? `<button class="btn" id="e-more">Écouter plus <span class="cost">${fmtS(E_LEVELS[e.level + 1])} · ${E_POINTS[e.level + 1]} pt${E_POINTS[e.level + 1] > 1 ? 's' : ''}</span></button>` : '') +
      `<button class="btn ghost small" id="e-giveup">Je donne ma langue au chat</button>`;
    ac.appendChild(row);
    ac.appendChild(el('div', 'note', 'Un titre faux débloque automatiquement le palier suivant.'));
    const input = $('#e-input'), sug = $('#e-suggest');
    let hl = -1, items = [];
    const renderSug = () => { sug.innerHTML = ''; items.forEach((it, i) => { const d = el('div', i === hl ? 'hl' : ''); d.innerHTML = `${it.title} <small>· ${it.artist}</small>`; d.onmousedown = ev => { ev.preventDefault(); input.value = it.title; sug.hidden = true; }; sug.appendChild(d); }); sug.hidden = !items.length; };
    input.oninput = () => { const q = norm(input.value); hl = -1; items = q.length < 2 ? [] : (eCatalog || []).filter(x => norm(x.title).includes(q) || norm(x.artist).includes(q)).slice(0, 6); renderSug(); };
    input.onkeydown = ev => { if (ev.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); renderSug(); ev.preventDefault(); } else if (ev.key === 'ArrowUp') { hl = Math.max(0, hl - 1); renderSug(); ev.preventDefault(); } else if (ev.key === 'Enter') { if (hl >= 0) { input.value = items[hl].title; sug.hidden = true; } $('#e-submit').click(); ev.preventDefault(); } };
    input.onblur = () => setTimeout(() => sug.hidden = true, 150);
    $('#e-submit').onclick = () => { const t = input.value.trim(); if (!t) return; act({ t: 'e-guess', title: t }); input.value = ''; };
    if ($('#e-more')) $('#e-more').onclick = () => act({ t: 'e-unlock' });
    $('#e-giveup').onclick = () => act({ t: 'e-giveup' });
  }
  if (reveal) {
    const res = el('div', 'round-res');
    s.players.forEach(p => { const x = s.eclair[p.id] || {}; res.appendChild(el('div', '', `<span>${p.name}</span><span>${x.points ? `<b class="pts">+${x.points}</b> à ${fmtS(E_LEVELS[x.level])}` : '<span style="color:var(--rose)">pas trouvé</span>'}</span>`)); });
    ac.appendChild(res);
    const btn = el('button', 'btn ' + (s.round >= s.rounds ? 'mint' : 'primary'), s.round >= s.rounds ? 'Voir le classement' : 'Manche suivante →'); btn.onclick = () => act({ t: 'e-next' }); ac.appendChild(btn);
  }

  // les autres
  const ot = $('#e-others'); ot.innerHTML = '';
  if (!reveal) s.players.filter(p => p.id !== net.me).forEach(p => { const x = s.eclair[p.id] || { level: 0 }; const sp = el('span', x.done ? (x.points ? 'done' : 'out') : ''); sp.textContent = `${p.name} · ${x.done ? (x.points ? 'trouvé +' + x.points : 'abandon') : 'écoute ' + fmtS(E_LEVELS[x.level])}`; ot.appendChild(sp); });
}
loadSongsE().then(l => { eCatalog = l; }).catch(() => { });

function renderEnd(s) {
  const w = s.players.find(p => p.id === s.winner);
  $('#end-winner').textContent = w ? w.name : '—';
  const ol = $('#ranking'); ol.innerHTML = '';
  const eclair = s.mode === 'eclair';
  $('#s-end .tagline').textContent = eclair ? "a l'oreille la plus rapide." : 'a rempli sa frise le premier.';
  [...s.players].sort((a, b) => eclair ? b.score - a.score : (b.timeline.length - a.timeline.length || b.tokens - a.tokens))
    .forEach(p => { const li = el('li'); li.innerHTML = `<span>${p.name}</span><b>${eclair ? p.score + ' pts' : p.timeline.length + ' cartes'}</b>`; ol.appendChild(li); });
  $('#btn-again').hidden = !net.isHost;
}

// ------------------------------------------------------------ événements UI
$('#f-home').addEventListener('submit', async e => {
  e.preventDefault();
  const act_ = e.submitter?.dataset.act; const name = $('#in-name').value.trim(); const code = $('#in-code').value.trim().toUpperCase();
  const err = $('#home-err'); err.textContent = '';
  if (!name) { err.textContent = 'Il faut un prénom.'; return; }
  localStorage.setItem('dc-name', name); net.name = name;
  if (typeof Peer === 'undefined') { err.textContent = 'Le module réseau n\'a pas chargé. Vérifie ta connexion.'; return; }
  e.submitter.disabled = true;
  try {
    if (act_ === 'create') { await hostGame(); keepAwake(); }
    else { if (code.length !== 4) { err.textContent = 'Le code fait 4 lettres.'; return; } await joinGame(code); keepAwake(); }
  } catch (ex) {
    err.textContent = ex.message === 'no-room' ? 'Aucune partie avec ce code.' : 'Connexion impossible : ' + (ex.message || ex.type || ex);
  } finally { e.submitter.disabled = false; }
});
$('#btn-solo').onclick = async () => { net.name = $('#in-name').value.trim() || 'Moi'; await hostGame(); };
$('#btn-start').onclick = () => {
  const mode = document.querySelector('#opt-mode input:checked').value;
  const cats = [...$('#opt-cats').querySelectorAll('input:checked')].map(i => i.value);
  if (mode === 'timeline' && !cats.length) { toast('Choisis au moins une playlist'); return; }
  act({ t: 'start', opts: { mode, rounds: +$('#opt-rounds').value, target: +$('#opt-target').value, cats, speakerId: $('#opt-sound').value === 'host' ? net.me : null, soundAll: $('#opt-sound').value === 'all' } });
};
$('#btn-again').onclick = () => act({ t: 'restart' });
$('#btn-home').onclick = () => location.reload();
$('#btn-leave').onclick = () => location.reload();
$('#in-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });

// thème clair / sombre
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#btn-theme').textContent = t === 'light' ? '🌙' : '☀️';
  $('meta[name=theme-color]').content = t === 'light' ? '#f4ecdf' : '#16121f';
  try { localStorage.setItem('dc-theme', t); } catch { }
}
$('#btn-theme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
let savedTheme = null; try { savedTheme = localStorage.getItem('dc-theme'); } catch { }
applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

// pré-remplissage
$('#in-name').value = localStorage.getItem('dc-name') || '';
const urlCode = new URLSearchParams(location.search).get('c'); if (urlCode) $('#in-code').value = urlCode.toUpperCase();
