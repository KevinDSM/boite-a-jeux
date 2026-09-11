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

let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !wakeLock) keepAwake(); });

// ------------------------------------------------------------ moteur de jeu (côté hôte)
/* Etat complet (hôte uniquement) :
   { code, phase: lobby|listen|bet|reveal|end, players:[{id,name,tokens,timeline:[song],online,host}],
     turn, target, deck:[song], current:song|null, placement:null|idx, bets:{pid:idx}, passes:[pid],
     betEnds:ts, guess:{artist,title}|null, result:{ok,by,year,song,tokenWon}|null, winner:pid|null, speakerId } */
class Game {
  constructor(code, songs) { this.songs = songs; this.state = { code, phase: 'lobby', players: [], turn: 0, target: 10, deck: [], current: null, placement: null, bets: {}, passes: [], betEnds: 0, guess: null, result: null, winner: null, cats: null, speakerId: null }; }
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

  start({ target, cats, speakerId, soundAll }) {
    const s = this.s;
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
  restart() { const s = this.s; s.phase = 'lobby'; s.winner = null; s.result = null; s.current = null; }

  // état diffusé aux invités : on masque tout ce qui trahit la chanson en cours
  publicState() {
    const s = this.s; const hide = s.phase === 'listen' || s.phase === 'bet';
    return { ...s, deck: undefined, deckLeft: s.deck.length, current: s.current ? (hide ? { preview: s.current.preview } : s.current) : null, betLeft: s.phase === 'bet' ? Math.max(0, Math.ceil((s.betEnds - Date.now()) / 1000)) : 0 };
  }
}

// ------------------------------------------------------------ réseau
const net = { peer: null, conns: new Map(), hostConn: null, isHost: false, game: null, me: uid(), name: '', code: '' };
let view = null;         // état public affiché
let songsCache = null;

async function loadSongs() { if (!songsCache) songsCache = await (await fetch('songs.json')).json(); return songsCache; }
function setNet(on, label) { const n = $('#net'); n.className = 'net-status ' + (on ? 'on' : 'off'); n.textContent = label; }

function makePeer(id) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(id, { debug: 0 });
    peer.on('open', () => resolve(peer));
    peer.on('error', e => { if (e.type === 'unavailable-id') reject(new Error('code-taken')); else if (e.type === 'peer-unavailable') reject(new Error('no-room')); else reject(e); });
  });
}

async function hostGame() {
  const songs = await loadSongs();
  let code, peer;
  for (let i = 0; i < 5; i++) { code = genCode(); try { peer = await makePeer(ROOM_PREFIX + code); break; } catch (e) { if (e.message !== 'code-taken') throw e; } }
  if (!peer) throw new Error('Impossible de créer la salle');
  net.peer = peer; net.isHost = true; net.code = code; net.game = new Game(code, songs);
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
}

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

function renderEnd(s) {
  const w = s.players.find(p => p.id === s.winner);
  $('#end-winner').textContent = w ? w.name : '—';
  const ol = $('#ranking'); ol.innerHTML = '';
  [...s.players].sort((a, b) => b.timeline.length - a.timeline.length || b.tokens - a.tokens).forEach(p => { const li = el('li'); li.innerHTML = `<span>${p.name}</span><b>${p.timeline.length} cartes</b>`; ol.appendChild(li); });
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
  const cats = [...$('#opt-cats').querySelectorAll('input:checked')].map(i => i.value);
  if (!cats.length) { toast('Choisis au moins une playlist'); return; }
  act({ t: 'start', opts: { target: +$('#opt-target').value, cats, speakerId: $('#opt-sound').value === 'host' ? net.me : null, soundAll: $('#opt-sound').value === 'all' } });
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
