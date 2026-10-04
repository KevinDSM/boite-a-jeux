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

const E_GRACE = 0.12;                 // marge pour la latence de sortie audio (iPhone)


const uid = () => { let u = null; try { u = localStorage.getItem('dc-uid'); } catch { } if (!u) { u = Math.random().toString(36).slice(2, 10); try { localStorage.setItem('dc-uid', u); } catch { } } return u; };
const fmtS = v => (v + '').replace('.', ',') + ' s';
const glyph0 = s => ([...(s || '')][0] || '?').toUpperCase();
const myEmoji = () => { let e = null; try { e = localStorage.getItem('dc-emo'); } catch { } if (!EMOJIS.includes(e)) { e = EMOJIS[Math.random() * EMOJIS.length | 0]; try { localStorage.setItem('dc-emo', e); } catch { } } return e; };

let toastTimer;
function toast(msg, ms = 2400) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }

let shownId = null;
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== id);
  if (id !== shownId) {
    const wasPlay = shownId === 's-game' || shownId === 's-eclair' || shownId === 's-sprint' || shownId === 's-sablier' || shownId === 's-undercover' || shownId === 's-geo' || shownId === 's-chromo' || shownId === 's-kems' || shownId === 's-camembert' || shownId === 's-mirage' || shownId === 's-douze' || shownId === 's-petitbac' || shownId === 's-loupgarou' || shownId === 's-naufrages' || shownId === 's-memes' || shownId === 's-limite' || shownId === 's-solitaire' || shownId === 's-poker' || shownId === 's-diapason' || shownId === 's-duel' || shownId === 's-teldes' || shownId === 's-nomcode' || shownId === 's-bataille';
    shownId = id; window.scrollTo(0, 0);
    // quitter un écran de jeu coupe le son : il ne doit pas continuer dans le salon
    if (wasPlay && id !== 's-game' && id !== 's-eclair' && id !== 's-sprint' && id !== 's-sablier' && id !== 's-undercover' && id !== 's-geo' && id !== 's-chromo' && id !== 's-kems' && id !== 's-camembert' && id !== 's-mirage' && id !== 's-douze' && id !== 's-petitbac' && id !== 's-loupgarou' && id !== 's-naufrages' && id !== 's-memes' && id !== 's-limite' && id !== 's-solitaire' && id !== 's-poker' && id !== 's-diapason' && id !== 's-duel' && id !== 's-teldes' && id !== 's-nomcode' && id !== 's-bataille') { stopSnippet(); audio.pause(); lastTurnKey = null; lastTlKey = null; eLastRound = null; spLastRound = null; }
  }
  const game = id === 's-game' ? 'decennies' : id === 's-eclair' ? 'eclair' : id === 's-sablier' ? 'sablier' : id === 's-undercover' ? 'undercover' : id === 's-geo' ? 'geo' : id === 's-chromo' ? 'chromo' : id === 's-kems' ? 'kems' : id === 's-camembert' ? 'camembert' : id === 's-mirage' ? 'mirage' : id === 's-douze' ? 'douze' : id === 's-petitbac' ? 'petitbac' : id === 's-loupgarou' ? 'loupgarou' : id === 's-naufrages' ? 'naufrages' : id === 's-memes' ? 'memes' : id === 's-limite' ? 'limite' : id === 's-solitaire' ? 'solitaire' : id === 's-poker' ? 'poker' : id === 's-diapason' ? 'diapason' : id === 's-duel' ? 'duel' : id === 's-teldes' ? 'teldes' : id === 's-nomcode' ? 'nomcode' : id === 's-bataille' ? 'bataille' : id === 's-sprint' ? GAMES[view?.mode]?.theme || 'sprint' : (id === 's-end' && view ? GAMES[view.mode]?.theme : '');
  if (game) document.documentElement.dataset.game = game; else delete document.documentElement.dataset.game;
  $('#btn-back').hidden = id === 's-home';
  $('#btn-help').hidden = id === 's-home' || id === 's-rules';
  $('#btn-vol').hidden = !(id === 's-game' || id === 's-eclair' || id === 's-sprint');
  $('#btn-players').hidden = !(isHostPlayer() && !['s-home', 's-rules', 's-lobby'].includes(id));
  if ($('#btn-vol').hidden) $('#vol-bar').hidden = true;
  $('#crumb').textContent = id === 's-home' ? 'Boîte à jeux' : id === 's-rules' ? 'Les règles'
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


// ============================================================ réseau
net.me = uid(); net.emoji = myEmoji();     // net est déclaré dans core.js
let view = null;

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
  if (net.server) { if (!net.ws) serverLost(0); }
  else if (net.isHost) reviveHost();
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

// ============================================================ salons sur le serveur (Cloudflare)
// Sur boite-a-jeux.pages.dev, la partie tourne sur un serveur Cloudflare (server/) et non plus sur le
// téléphone de l'hôte : tout le monde s'y connecte en WebSocket, l'hôte compris. S'il verrouille son
// écran, la partie continue sans lui. Ailleurs (GitHub Pages, tests), l'hôte fait tourner la partie.
// Pour les tests : localStorage 'dc-server' = adresse du serveur, ou 'off'.
const SALON_WS = (() => {
  try { const o = localStorage.getItem('dc-server'); if (o) return o === 'off' ? null : o; } catch { }
  return /(^|\.)boite-a-jeux\.pages\.dev$/.test(location.hostname) ? 'wss://boite-a-jeux-salons.musee-tuile.workers.dev' : null;
})();
const assets = new Map();          // grosses images reçues une seule fois (dessins), remises en place dans l'état
const unstrip = v => typeof v === 'string' ? (v.startsWith('\u0001asset:') ? assets.get(v.slice(7)) || '' : v)
  : Array.isArray(v) ? v.map(unstrip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unstrip(x)])) : v;

function serverOpen(code, create) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${SALON_WS}/salon/${code}${create ? '?create=1' : ''}`);
    let settled = false;
    const finish = e => { if (settled) return; settled = true; clearTimeout(timer); e ? reject(e) : resolve(); };
    const timer = setTimeout(() => { try { ws.close(); } catch { } finish(new Error('timeout')); }, 12000);
    const conn = { get open() { return ws.readyState === 1; }, send: m => { try { ws.send(JSON.stringify(m)); } catch { } } };
    ws.onopen = () => conn.send({ t: 'hello', pid: net.me, name: net.name, emoji: net.emoji });
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'no-room' || m.t === 'code-taken') { finish(new Error(m.t)); return; }
      if (m.t === 'kicked') { finish(new Error('kicked')); onKicked(); return; }
      if (m.t === 'state' && !settled) {
        net.ws = ws; net.hostConn = conn; net.server = true; net.code = code; setNet(true, 'connecté'); finish();
        $('#lobby-keep').textContent = 'Donne ce code à la table. Ton téléphone peut se mettre en veille, la partie continue sans lui.';
      }
      if (net.ws === ws || m.t === 'state') onServerMessage(m);
    };
    ws.onclose = () => { finish(new Error('no-room')); if (net.ws === ws) { net.ws = null; serverLost(); } };
  });
}
function onServerMessage(m) {
  if (m.t === 'asset') assets.set(m.id, m.data);
  else if (m.t === 'state') { view = unstrip(m.s); render(); }
  else if (m.t === 'err' || m.t === 'toast') toast(m.msg);
  else if (m.t === 'kicked') onKicked();
  else if (m.t === 'closed') { net.kicked = true; location.replace(location.pathname + '?ferme=1'); }
  else sabOnMessage(m);
}
// connexion coupée (écran verrouillé, réseau) : on revient dès que possible, le salon nous attend
let serverRetry = null;
function serverLost(delay = 1000) {
  if (net.kicked || !net.code) return;
  setNet(false, 'reconnexion');
  clearTimeout(serverRetry);
  serverRetry = setTimeout(() => {
    serverOpen(net.code, false).catch(e => {
      if (e.message === 'no-room' && navigator.onLine !== false && !net.ws) { net.kicked = true; location.replace(location.pathname + '?ferme=1'); return; }
      serverLost(Math.min(delay * 2, 15000));
    });
  }, delay);
}
async function serverHost() {
  // le téléphone de l'hôte garde les listes de chansons et de cartes pour ses réglages
  await Promise.all([loadSongs(), loadSongsE(), loadSongsJV(), loadDecks(), loadSongsAnime()]);
  for (let i = 0; i < 6; i++) {
    try { await serverOpen(genCode(), true); return; } catch (e) { if (e.message !== 'code-taken') throw e; }
  }
  throw new Error('Impossible de créer la salle');
}
async function serverJoin(code) { await serverOpen(code, false); }

async function hostGame() {
  const [songs, songsE, songsJV, , songsAnime] = await Promise.all([loadSongs(), loadSongsE(), loadSongsJV(), loadDecks(), loadSongsAnime()]);
  let code, peer;
  for (let i = 0; i < 5; i++) { code = genCode(); try { peer = await makePeer(ROOM_PREFIX + code); break; } catch (e) { if (e.message !== 'code-taken') throw e; } }
  if (!peer) throw new Error('Impossible de créer la salle');
  net.peer = peer; net.isHost = true; net.code = code; net.game = new Game(code, songs, songsE, songsJV, songsAnime);
  net.game.addPlayer(net.me, net.name, true, net.emoji);
  attachHost(peer);
  setNet(true, 'hôte');
  setInterval(() => { if (hostTick()) broadcast(); }, 500);
  broadcast();
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
        conn.on('open', () => { clearTimeout(timer); net.hostConn = conn; conn.send({ t: 'hello', pid: net.me, name: net.name, emoji: net.emoji }); setNet(true, 'connecté'); resolve(); });
        conn.on('data', m => { if (m.t === 'state') { view = m.s; render(); } else if (m.t === 'err') toast(m.msg); else if (m.t === 'kicked') onKicked(); else sabOnMessage(m); });
        conn.on('close', () => { if (net.kicked) return; setNet(false, 'reconnexion'); setTimeout(() => joinGame(code).catch(() => { }), 2500); });
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

// retiré par l'hôte : retour à l'accueil, sans tenter de se reconnecter
function onKicked() {
  if (net.kicked) return; net.kicked = true;
  try { net.peer?.destroy(); } catch { }
  location.replace(location.pathname + '?retire=1');
}

function act(m) {
  if (net.isHost) { const err = applyAction(net.me, m); if (err === 'silent') return; if (err) toast(err); broadcast(); }
  else if (net.hostConn?.open) net.hostConn.send({ ...m, pid: net.me });
  else toast('Pas connecté à l\'hôte');
}
const isHostPlayer = () => net.server ? view?.players?.[0]?.id === net.me : net.isHost;


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
  else if (s.phase === 'du') { show('s-duel'); renderDuel(s.du); }
  else if (s.phase === 'td') { show('s-teldes'); renderTelDes(s.td); }
  else if (s.phase === 'nc') { show('s-nomcode'); renderNomCode(s.nc); }
  else if (s.phase === 'bt') { show('s-bataille'); renderBataille(s.bt); }
  else { show('s-game'); renderGame(s); }
  if (keep) {
    const n = document.getElementById(keep.id);
    if (n && n !== ae) { n.value = keep.v; n.focus({ preventScroll: true }); try { n.setSelectionRange(keep.a, keep.b); } catch { } n.dispatchEvent(new Event('input')); }
  }
  salonAfterRender();
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
  box.innerHTML = `<div class="hist-head"><span class="mj-side-title">Parties de ce salon</span>${isHostPlayer() ? '<button class="btn ghost small" id="hist-clear" type="button">Effacer</button>' : ''}</div>`
    + '<div class="mj-list hist-rows">' + list.map(h => {
      const p = h.podium;
      const who = h.team
        ? `${esc(h.note || '')}${p.length ? `${h.note ? '\u00a0: ' : ''}<b>${p.map(x => esc(x.name)).join(', ')}</b>` : ''}`
        : p.map((x, i) => `<span class="hist-p${i === 0 ? ' first' : ''}">${i + 1}. ${esc(x.name)}${x.score !== undefined && x.score !== null ? ` <i>${x.score}${h.unit ? ' ' + esc(h.unit) : ''}</i>` : ''}</span>`).join('') + (h.low ? '<span class="hist-low">le plus bas gagne</span>' : '');
      return `<div class="hist-row"><div class="hist-top"><b>${esc(h.name)}</b><small>${ago(h.when)}</small></div><p class="hist-who">${who}</p></div>`;
    }).join('') + '</div>';
  const c = $('#hist-clear'); if (c) c.onclick = () => askConfirm('Effacer l\u2019historique', 'Les résultats des parties de ce salon disparaissent pour tout le monde.', 'Effacer', () => act({ t: 'history-clear' }));
}

// ------------------------------------------------ salon
function renderLobby(s) {
  $('#lobby-code').textContent = s.code;
  const wrap = $('#lobby-players'); wrap.innerHTML = '';
  wrap.appendChild(el('span', 'eyebrow players-title', 'À table'));
  s.players.forEach(p => {
    const me = p.id === net.me;
    const c = el('div', 'chip' + (p.host ? ' host' : '') + (p.online ? '' : ' off') + (me ? ' me' : ''));
    const tag = p.host ? '<i>hôte</i>' : !p.online ? '<i>hors ligne</i>' : me ? '<i>toi</i>' : '';
    c.innerHTML = `<span class="pemo" aria-hidden="true">${esc(p.emoji || glyph0(p.name))}</span><span class="pname">${esc(p.base || p.name)}</span>${tag}`;
    if (me) { c.tabIndex = 0; c.setAttribute('role', 'button'); c.title = 'Changer d\u2019emoji'; c.onclick = () => openEmojiPicker(); c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEmojiPicker(); } }; }
    if (isHostPlayer() && !p.host) { const x = el('button', 'chip-x', '×'); x.type = 'button'; x.setAttribute('aria-label', `Retirer ${p.base || p.name}`); x.onclick = e => { e.stopPropagation(); askKick(p); }; c.appendChild(x); }
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
  $('#opts-duel').hidden = s.pick !== 'duel';
  $('#opts-teldes').hidden = s.pick !== 'teldes';
  $('#opts-nomcode').hidden = s.pick !== 'nomcode';
  $('#opts-bataille').hidden = s.pick !== 'bataille';
  if (isHostPlayer() && s.pick === 'memes') Memes.load(ASSET_V).then(() => { const all = Memes.count(); $('#opt-mm-count').textContent = all ? `${all} mèmes et GIF de la bibliothèque publique d\u2019Imgflip, et ${Memes.PROMPTS.length} situations.` : 'Mèmes introuvables.'; });
  if (isHostPlayer() && s.pick === 'loupgarou') { const n = s.players.filter(p => p.online).length + botsOpt('lw'); $('#opt-lw-count').textContent = n < 5 ? `${n} joueur${n > 1 ? 's' : ''}, robots compris. Il en faut au moins 5.` : `${n} joueurs, dont ${LoupGarou.autoWolves(n)} loup${LoupGarou.autoWolves(n) > 1 ? 's' : ''} en automatique.`; }
  if (isHostPlayer() && s.pick === 'petitbac') renderPetitBacOpts();
  if (isHostPlayer() && s.pick === 'mirage') Mirage.load(ASSET_V).then(() => { const set = $('#opt-mi-cards').value, n = Mirage.count(set); $('#opt-mi-count').textContent = !n ? 'Cartes introuvables.' : set === 'art' ? `${n} cartes, des œuvres du domaine public (Met, Cleveland Museum of Art).` : set === 'memes' ? `${n} mèmes et GIF de la bibliothèque publique d\u2019Imgflip.` : `${n} cartes, tableaux, mèmes et GIF mélangés.`; });
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
  $('#lobby-wait').textContent = chosen ? `Ce sera ${GAMES[s.pick].name}. L\u2019hôte règle les derniers détails.` : 'L\u2019hôte hésite encore entre vingt-deux jeux.';
  $('#btn-start').textContent = chosen ? `Lancer ${GAMES[s.pick].name}` : 'Choisis un jeu';
  renderGuestOpts(s);
  if (isHostPlayer() && chosen) queueOptsShare();
}

// ------------------------------------------------ Décennies
let lastTurnKey = null, betArmed = false, lastTlKey = null;

// Voix du meneur, commune aux trois jeux musicaux (voir DESIGN.md) : une ligne d'info, un titre qui
// dit ce qui se passe à la table, une réplique. Les variantes sont tirées du numéro de tour ou de
// manche : l'écran se redessine sans cesse, la phrase ne doit pas changer à chaque fois.
const muPick = (list, n) => list[Math.max(0, (n || 1) - 1) % list.length];
const muNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
const muPts = n => `${n} point${n > 1 ? 's' : ''}`;
const muRank = n => n === 1 ? '1er' : `${n}e`;
function muVoice(box, meta, title, say, prog) {
  const bars = prog && prog[1] > 1 ? `<div class="mj-prog">${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]}</span></div>` : '';
  box.innerHTML = `<p class="mj-meta">${meta}</p><div class="mj-status"><h3 class="mj-title">${title}</h3>${say ? `<p class="mj-say">${say}</p>` : ''}${bars}</div>`;
}
// la liste des joueurs : nom, une ligne d'état, le score à droite (colonne de droite sur PC)
function muPlayers(box, rows) {
  box.innerHTML = `<span class="mj-side-title">Scores</span><div class="mj-list">${rows.map(r =>
    `<div class="mj-row mu-row${r.on ? ' on' : ''}${r.me ? ' me' : ''}${r.off ? ' off' : ''}"><span class="mu-who"><b>${esc(r.name)}${r.me ? ' <i>toi</i>' : ''}</b>${r.sub ? `<small>${r.sub}</small>` : ''}</span><span class="mu-score">${r.score}</span></div>`).join('')}</div>`;
}
// sur PC, les scores passent dans une colonne à droite (même mécanique que desk.js pour les autres jeux)
function muDesk(id) { if (typeof deskSplit === 'function') deskSplit($(id), '.scoreboard, .others'); }

function renderGame(s) {
  const me = s.players.find(p => p.id === net.me);
  const active = s.players[s.turn % s.players.length];
  const isMe = active.id === net.me;
  const r = s.result;
  if (s.phase !== 'bet') betArmed = false;
  const nameOf = id => esc(s.players.find(p => p.id === id)?.name || '');
  const A = esc(active.name), say = list => muPick(list, s.turn + 1);
  const iAmBettor = s.bet?.pid === net.me;

  // scores
  muPlayers($('#scoreboard'), s.players.map(p => {
    const state = s.phase === 'reveal' ? '' : p.id === active.id ? 'joue' : s.bet?.pid === p.id ? 'parie' : s.phase === 'bet' && s.passes.includes(p.id) ? 'passe' : '';
    const tok = s.solo ? '' : `${p.tokens} jeton${p.tokens > 1 ? 's' : ''}`;
    return { name: p.name, me: p.id === net.me, on: p.id === active.id && s.phase !== 'reveal', off: !p.online, sub: [state, tok].filter(Boolean).join(' · '), score: `${p.timeline.length}<small>/${s.target}</small>` };
  }));

  // le meneur
  const meta = s.solo ? `${me.timeline.length} carte${me.timeline.length > 1 ? 's' : ''} sur ${s.target}` : `Tour ${s.turn + 1} · premier à ${s.target} cartes`;
  const timer = `<span class="mu-timer">${s.betLeft} s</span>`;
  let title = '', line = '', prog = null;
  if (s.phase === 'listen') {
    if (!isMe) {
      title = `${A} écoute.`;
      line = me && me.tokens < 1 ? 'Plus de jeton pour toi. Profite du spectacle.' : say([`Si ${A} se trompe, tu pourras parier.`, 'Chut. Et garde un jeton sous le coude.', `Laisse ${A} réfléchir. Enfin, un peu.`]);
    } else {
      title = 'À toi.';
      line = s.solo ? say(['Écoute, puis glisse la chanson au bon endroit de ta frise.', 'Avant, après, entre les deux ? Ton oreille décide.', 'Fie-toi à ton oreille, pas à ta mémoire.'])
        : say(['Écoute, puis glisse la chanson au bon endroit de ta frise.', 'Trouve sa place. Les autres guettent ton erreur.', 'Prends ton temps. Enfin, pas trop.']);
    }
  } else if (s.phase === 'bet') {
    if (s.bet && s.bet.idx == null) {
      const B = nameOf(s.bet.pid);
      if (iAmBettor) { title = `Ton pari. ${timer}`; line = 'Place la chanson là où, toi, tu la vois.'; }
      else if (isMe) { title = `${B} parie contre toi. ${timer}`; line = 'Croise les doigts.'; }
      else { title = `${B} parie. ${timer}`; line = 'Un seul pari par tour. On attend son choix.'; }
    } else {
      const others = s.players.filter(p => p.id !== active.id && p.online);
      prog = [others.filter(p => s.passes.includes(p.id) || p.tokens < 1).length, others.length];
      if (isMe) { title = `C’est posé. ${timer}`; line = say(['Quelqu’un peut encore parier contre toi.', 'Les autres hésitent à parier contre toi.']); }
      else {
        title = `${A} a choisi. ${timer}`;
        line = s.passes.includes(net.me) ? 'Tu passes. On attend les autres.' : me && me.tokens < 1 ? 'Plus de jeton, pas de pari pour toi.'
          : say([`Ça sent l’erreur ? Parie contre ${A}.`, 'Tu flaires l’erreur ? Prends le pari.', 'Un jeton, et tu tentes le coup.']);
      }
    }
  } else if (s.phase === 'reveal') {
    const W = r.by ? nameOf(r.by) : '', RA = nameOf(r.activeId);
    const meA = r.activeId === net.me, meW = r.by === net.me;
    title = s.solo ? (r.ok ? 'Bien vu.' : 'Raté.') : r.ok ? (meA ? 'Tu tombes juste.' : `${RA} tombe juste.`)
      : r.betWon ? (meW ? 'Tu rafles la carte.' : meA ? `${W} te rafle la carte.` : `${W} rafle la carte.`) : meA ? 'Tu te trompes.' : `${RA} se trompe.`;
    const bits = [];
    if (r.betWon) bits.push(meA ? 'Le pari contre toi paie.' : `Le pari contre ${RA} paie.`);
    if (r.tokenWon === true) bits.push('Artiste et titre justes, +1 jeton.');
    else if (r.tokenWon === 'max') bits.push(`Artiste et titre justes, mais ${meA ? 'tu as' : RA + ' a'} déjà ${TOKEN_MAX} jetons.`);
    if (r.betPid && !r.betWon) bits.push(r.betPid === net.me ? `Pari perdu, tu laisses un jeton${r.lost ? ` et ta carte de ${r.lost}` : ''}.` : `Pari perdu, ${nameOf(r.betPid)} laisse un jeton${r.lost ? ` et sa carte de ${r.lost}` : ''}.`);
    if (s.winner) bits.push(s.solo ? 'Frise complète. Chapeau.' : s.winner === net.me ? 'Tu complètes ta frise. Partie terminée.' : `${nameOf(s.winner)} complète sa frise. Partie terminée.`);
    line = bits.join(' ') || (s.solo ? (r.ok ? say(['La carte rejoint ta frise.', 'Une de plus dans ta frise.']) : say(['Carte écartée. On enchaîne.', 'Celle-là file à la poubelle. Suivante.']))
      : r.ok ? say(['Joli coup d’oreille.', 'L’année ne ment pas.', 'Rien à redire.']) : say(['La carte est perdue.', 'Carte perdue. Ça arrive aux meilleurs.']));
  }
  muVoice($('#turn-banner'), meta, title, line, prog);

  // scène
  const speakerHere = s.soundAll || (s.speakerId ? s.speakerId === net.me : isMe);
  loadAudio(s.current?.preview);
  const vinyl = $('#vinyl'), info = $('#track-info');
  if (s.phase === 'reveal') {
    vinyl.classList.add('revealed'); $('#art').src = r.song.art;
    info.innerHTML = `<div class="big ${r.ok || r.betWon ? 'ok' : 'ko'}">${r.year}</div>${r.song.artist}<small>${r.song.title}</small>`;
  } else {
    vinyl.classList.remove('revealed'); $('#art').removeAttribute('src');
    info.innerHTML = speakerHere ? '' : `<small>Le son sort de chez ${s.speakerId ? nameOf(s.speakerId) : A}.</small>`;
  }
  $('#audio-row').hidden = !(speakerHere || s.phase === 'reveal');
  const key = s.turn + ':' + (s.current?.preview || '');
  if (s.phase === 'listen' && speakerHere && lastTurnKey !== key) { lastTurnKey = key; audio.currentTime = 0; audio.play().catch(() => { }); }

  // frise
  const owner = s.phase === 'reveal' && r.betWon ? s.players.find(p => p.id === r.by) : active;
  $('#tl-owner').textContent = owner.id === net.me ? 'Ta frise' : `La frise de ${owner.name}`;
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
      if (s.bet?.idx === i) { slot.classList.add('bet'); slot.dataset.bet = s.players.find(p => p.id === s.bet.pid)?.name || ''; }
      if (canBetPlace && i !== s.placement) slot.classList.add('arm');
      if (!(canPlace || canBetPlace)) slot.classList.add('disabled');
      slot.onclick = () => {
        if (canPlace) act({ t: 'place', idx: i });
        else if (canBetPlace) { if (i === s.placement) toast(`C’est déjà le choix de ${active.name}`); else act({ t: 'bet-place', idx: i }); }
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
    const sk = el('button', 'btn', 'Passer cette chanson');
    sk.onclick = () => act({ t: 'solo-skip' }); ac.appendChild(sk);
    ac.appendChild(el('div', 'note', 'Seul, tu passes autant de chansons que tu veux. Ni jetons, ni paris.'));
  }
  if (s.phase === 'listen' && isMe && !s.solo) {
    ac.appendChild(el('div', 'note', 'Tu la connais ? Artiste <b>et</b> titre justes, +1 jeton.'));
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
    } else if (!s.bet && !s.passes.includes(me.id) && me.tokens >= 1) {
      const row = el('div', 'row');
      const b1 = el('button', 'btn primary', `Parier <span class="cost">1 jeton</span>`);
      b1.onclick = () => act({ t: 'claim' });
      const b2 = el('button', 'btn', 'Je passe'); b2.onclick = () => act({ t: 'pass' });
      row.append(b1, b2); ac.appendChild(row);
      ac.appendChild(el('div', 'note', 'Premier qui parie, seul qui parie. Raté, tu perds le jeton <b>et</b> une carte.'));
    }
  }
  if (me && !s.solo && ['listen', 'bet'].includes(s.phase)) ac.appendChild(tokenLine(me.tokens));
  if (s.phase === 'reveal') {
    const btn = el('button', 'btn lg ' + (s.winner ? 'pos' : 'primary'), s.winner ? (s.solo ? 'Voir le résultat' : 'Voir le classement') : (s.solo ? 'Chanson suivante' : 'Tour suivant'));
    btn.onclick = () => act({ t: 'next' }); ac.appendChild(btn);
  }
  if (['listen', 'bet'].includes(s.phase) && !isMe && !active.online) {
    ac.appendChild(el('div', 'note', `${A} n’est plus connecté.`));
    const f = el('button', 'btn ghost small', `Passer le tour de ${A}`); f.onclick = () => act({ t: 'force-next' }); ac.appendChild(f);
  }
  muDesk('#s-game');
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
  d.innerHTML = Array.from({ length: TOKEN_MAX }, (_, i) => `<span class="pip${i < n ? '' : ' off'}"></span>`).join('') + `<span>${n} jeton${n > 1 ? 's' : ''} pour parier</span>`;
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
  const say = list => muPick(list, s.round);

  // le meneur
  const online = s.players.filter(p => p.online);
  const doneCount = online.filter(p => s.eclair[p.id]?.done).length;
  const waiting = online.filter(p => p.id !== net.me && !s.eclair[p.id]?.done).map(p => esc(p.name));
  let title = '', line = '', prog = null;
  if (!reveal && !e.done) {
    title = `${muPts(E_POINTS[e.level])} en jeu.`;
    line = say([
      ['Une demi-seconde. Les vrais la reconnaissent.', 'Une demi-seconde, pas plus. Bonne chance.'],
      ['Une seconde. Ça te dit quelque chose ?', 'Une seconde. Tu chauffes, ou pas du tout ?'],
      ['Deux secondes. Tu l’as sur le bout de la langue.', 'Deux secondes. Les fans n’ont plus d’excuse.'],
      ['Trois secondes. Là, ça devient gênant.', 'Trois secondes. Même ta tante l’aurait trouvée.'],
      ['Cinq secondes, dernier palier.', 'Dernier palier. C’est maintenant ou jamais.'],
    ][e.level]);
    if (s.current?.jv) line += ' Ici, on veut le nom du jeu.';
    if (!s.solo) prog = [doneCount, online.length];
  } else if (!reveal) {
    title = e.points ? `Trouvé, +${e.points}.` : 'Manche finie pour toi.';
    line = waiting.length ? `Plus que ${muNames(waiting)}.` : 'Tout le monde a fini.';
    prog = [doneCount, online.length];
  } else {
    const best = Math.max(0, ...s.players.map(p => s.eclair[p.id]?.points || 0));
    const topP = s.players.filter(p => best && (s.eclair[p.id]?.points || 0) === best), topMe = topP.some(p => p.id === net.me);
    const top = topP.filter(p => p.id !== net.me).map(p => esc(p.name)).concat(topMe ? ['toi'] : []);
    title = s.solo ? (e.points ? `Trouvé, +${e.points}.` : 'Pas trouvé.')
      : top.length ? `${top.length === 1 && topMe ? 'Tu empoches' : `${muNames(top)} ${top.length > 1 ? (topMe ? 'empochez' : 'empochent') : 'empoche'}`} ${muPts(best)}.` : 'Personne ne trouve.';
    line = s.round >= s.rounds ? 'Dernière manche. Place au classement.'
      : say(['Évidemment, maintenant elle paraît facile.', 'Tu la connaissais, avoue.', 'Réécoute-la en entier, ça soigne.']);
  }
  muVoice($('#e-banner'), `Manche ${s.round} sur ${s.rounds}`, title, line, prog);

  loadAudio(s.current?.preview);
  if (s.round !== eLastRound) { eLastRound = s.round; stopSnippet(); $('#e-vinyl').classList.remove('revealed'); }
  const stage = $('#e-vinyl'), info = $('#e-info');
  if (reveal) { stage.classList.add('revealed'); $('#e-art').src = s.current.art; info.innerHTML = `<div class="big ok">${s.current.title}</div>${s.current.artist}<small>${s.current.jv ? s.current.sub : s.current.year}</small>`; }
  else { $('#e-art').removeAttribute('src'); const miss = e.tries.filter(t => !t.ok); info.innerHTML = miss.length ? `<small>Pas ${miss.map(t => `« ${esc(t.title)} »`).join(', pas ')}.</small>` : ''; }

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
    ac.appendChild(makeGuessBox('e-input', jvNow ? 'Nom du jeu' : 'Titre de la chanson', submitE, q => {
      const games = (s.jv ? (jvCatalog || []).map(x => ({ label: x.game, sub: 'jeu vidéo', fill: x.game })) : []).concat(s.anime ? (animeCatalog || []).map(x => ({ label: x.game, sub: 'anime', fill: x.game })) : []).filter(x => norm(x.label).includes(q));
      const songs = (eCatalog || []).filter(x => norm(x.title).includes(q) || norm(x.artist).includes(q)).map(x => ({ label: x.title, sub: x.artist, fill: x.title }));
      return (jvNow ? games.concat(songs) : songs.concat(games)).slice(0, 6);
    }));
    const row = el('div', 'row');
    row.innerHTML = `<button class="btn primary" id="e-submit">Proposer</button>`
      + (e.level < E_LEVELS.length - 1 ? `<button class="btn" id="e-more">Écouter plus <span class="cost">${fmtS(E_LEVELS[e.level + 1])} · ${E_POINTS[e.level + 1]} pt${E_POINTS[e.level + 1] > 1 ? 's' : ''}</span></button>` : '')
      + `<button class="btn ghost small" id="e-giveup">Je passe</button>`;
    ac.appendChild(row);
    if (e.level < E_LEVELS.length - 1) ac.appendChild(el('div', 'note', 'Un titre faux ? Le palier suivant s’ouvre tout seul.'));
    $('#e-submit').onclick = () => submitE($('#e-input'));
    if ($('#e-more')) $('#e-more').onclick = () => act({ t: 'e-unlock' });
    $('#e-giveup').onclick = () => act({ t: 'e-giveup' });
  }
  if (reveal) {
    const btn = el('button', 'btn lg ' + (s.round >= s.rounds ? 'pos' : 'primary'), s.round >= s.rounds ? 'Voir le classement' : 'Manche suivante');
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
  const e = s.sprint[net.me] || { tries: 0, done: false, points: 0, rank: 0 };
  const reveal = s.phase === 's-reveal';
  const nameOf = id => esc(s.players.find(p => p.id === id)?.name || '');
  const say = list => muPick(list, s.round);

  // le meneur
  const online = s.players.filter(p => p.online);
  const doneCount = online.filter(p => s.sprint[p.id]?.done).length;
  const waiting = online.filter(p => p.id !== net.me && !s.sprint[p.id]?.done).map(p => esc(p.name));
  const kind = s.current?.kind === 'anime' ? 'anime' : s.current?.jv ? 'jv' : 'song';
  let title = '', line = '', prog = null;
  if (!reveal && !e.done) {
    const left = SP_TRIES - e.tries, tries = left < SP_TRIES ? ` Plus que ${left} essai${left > 1 ? 's' : ''}.` : '';
    if (s.order.length) {
      title = s.order.length === 1 ? `${nameOf(s.order[0])} a trouvé !` : `Déjà ${s.order.length} à avoir trouvé.`;
      line = `Le suivant prend ${muPts(SP_POINTS[Math.min(s.order.length, SP_POINTS.length - 1)])}.` + tries;
    } else {
      title = kind === 'anime' ? 'De quel anime ?' : kind === 'jv' ? 'De quel jeu ?' : 'Qui chante quoi ?';
      line = (s.solo ? say(['Seul en piste, 5 points si tu trouves.', 'Personne pour te doubler. Profites-en.'])
        : say([`Le premier qui trouve prend ${muPts(SP_POINTS[0])}.`, 'Chaque seconde compte. Surtout les premières.', 'Dégaine avant les autres.'])) + tries;
    }
    if (!s.solo) prog = [doneCount, online.length];
  } else if (!reveal) {
    title = e.points ? (e.rank === 1 ? 'Trouvé en premier !' : `Trouvé, ${muRank(e.rank)}.`) : 'Manche finie pour toi.';
    line = (e.points ? `+${muPts(e.points)}.` : e.tries >= SP_TRIES ? 'Trois essais, zéro miracle.' : 'Tu sèches.')
      + (waiting.length ? ` Plus que ${muNames(waiting)}.` : '');
    prog = [doneCount, online.length];
  } else {
    title = s.solo ? (e.points ? `Trouvé, +${e.points}.` : 'Pas trouvé.') : s.order.length ? (s.order[0] === net.me ? 'Tu gagnes le sprint.' : `${nameOf(s.order[0])} gagne le sprint.`) : 'Personne ne trouve.';
    line = s.round >= s.rounds ? 'Dernière manche. Place au classement.'
      : say(['Évidemment, maintenant ça paraît facile.', 'Tu la connaissais, avoue.', 'La prochaine, tu l’as.']);
  }
  muVoice($('#sp-banner'), `Manche ${s.round} sur ${s.rounds}`, title, line, prog);

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
    info.innerHTML = speakerHere ? '' : `<small>Le son sort de chez ${nameOf(s.speakerId) || 'l’hôte'}.</small>`;
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
      const songs = (eCatalog || []).filter(x => norm(x.title).includes(q) || norm(x.artist).includes(q)).map(x => ({ label: x.title, sub: x.artist, fill: `${x.title} · ${x.artist}` }));
      return (jvNow ? games.concat(songs) : songs.concat(games)).slice(0, 6);
    };
    ac.appendChild(makeGuessBox('sp-input', kind === 'anime' ? 'Nom de l’anime' : kind === 'jv' ? 'Nom du jeu' : 'Titre et artiste', submit, source));
    const row = el('div', 'row');
    row.innerHTML = `<button class="btn primary" id="sp-submit">Proposer</button><button class="btn ghost small" id="sp-pass">Je sèche</button>`;
    ac.appendChild(row);
    ac.appendChild(el('div', 'note', kind === 'anime' ? 'Tous les animés sont dans la liste.' : kind === 'jv' ? 'Tous les jeux sont dans la liste.' : 'La liste remplit titre <b>et</b> artiste d’un coup. Plus rapide que tes pouces.'));
    $('#sp-submit').onclick = () => submit($('#sp-input'));
    $('#sp-pass').onclick = () => act({ t: 'sp-giveup' });
  }
  if (reveal) {
    const btn = el('button', 'btn lg ' + (s.round >= s.rounds ? 'pos' : 'primary'), s.round >= s.rounds ? 'Voir le classement' : 'Manche suivante');
    btn.onclick = () => act({ t: 'sp-next' }); ac.appendChild(btn);
  }
  renderSPOthers(s, reveal);
}
// les joueurs et où ils en sont (ordre d'arrivée et points de la manche à la révélation)
function renderSPOthers(s, reveal) {
  $('#sp-others').hidden = true;
  muPlayers($('#sp-scoreboard'), s.players.map(p => {
    const x = s.sprint[p.id] || { tries: 0 };
    const sub = x.done || reveal ? (x.points ? `${muRank(x.rank)}, +${x.points}` : reveal ? 'pas trouvé' : 'sèche')
      : x.tries ? `${x.tries} raté${x.tries > 1 ? 's' : ''}` : 'cherche';
    return { name: p.name, me: p.id === net.me, off: !p.online, on: !!x.points, sub, score: p.score || 0 };
  }));
  muDesk('#s-sprint');
}

function renderEOthers(s, reveal) {
  $('#e-others').hidden = true;
  muPlayers($('#e-scoreboard'), s.players.map(p => {
    const x = s.eclair[p.id] || { level: 0 };
    const sub = x.done || reveal ? (x.points ? `+${x.points} à ${fmtS(E_LEVELS[x.level])}` : 'pas trouvé') : `écoute ${fmtS(E_LEVELS[x.level])}`;
    return { name: p.name, me: p.id === net.me, off: !p.online, on: !!x.points, sub, score: p.score || 0 };
  }));
  muDesk('#s-eclair');
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
  const score = n => `${n} point${n > 1 ? 's' : ''}`;
  $('#end-winner').textContent = solo
    ? (eclair ? `${score(w ? w.score : 0)} en ${s.rounds} manches.` : 'Frise complète.')
    : w ? (w.id === net.me ? 'Tu gagnes.' : `${w.name} gagne.`) : 'Partie terminée.';
  const host = isHostPlayer() ? ' Revanche ? Tout se passe au salon.' : ' L’hôte décide de la revanche.';
  $('#end-sub').textContent = solo
    ? (!eclair ? `${s.target} cartes bien placées. Chapeau.` : w?.score ? 'Pas mal, tout seul. La prochaine fois, invite du monde.' : 'Zéro pointé. Les oreilles, ça se travaille.')
    : (s.mode === 'sprint' ? 'La gâchette la plus rapide de la table.'
      : s.mode === 'undercover' ? 'L’agent le plus redoutable de la table.'
        : s.mode === 'geo' ? 'Le meilleur sens de l’orientation de la table.'
          : eclair ? 'L’oreille la plus fine de la table.' : 'Première frise complète de la table.') + host;
  const ol = $('#ranking'); ol.innerHTML = '';
  [...s.players]
    .sort((a, b) => eclair ? b.score - a.score : (b.timeline.length - a.timeline.length || b.tokens - a.tokens))
    .forEach(p => {
      const n = eclair ? p.score : p.timeline.length;
      const li = el('li', p.id === net.me ? 'me' : ''); li.innerHTML = `<span>${esc(p.name)}${p.id === net.me ? ' <i>toi</i>' : ''}</span><b>${n} ${eclair ? (n > 1 ? 'pts' : 'pt') : (n > 1 ? 'cartes' : 'carte')}</b>`; ol.appendChild(li);
    });
  $('#btn-again').hidden = !isHostPlayer();
}

// ============================================================ aide & feuilles
const HELP = {
  timeline: `<h3>Décennies</h3>
<p>Chacun construit sa frise de chansons rangées par année. Le premier qui la remplit gagne.</p>
<ul>
  <li>À ton tour, écoute l’extrait et touche le «&nbsp;+&nbsp;» où la chanson se place. Bonne année, la carte est à toi. Sinon, elle est perdue.</li>
  <li>Tu démarres avec 2 jetons, 3 au plus. Ils ne servent qu’à parier.</li>
  <li>Un joueur a posé sa carte&nbsp;? Le premier qui parie (1 jeton) choisit sa place à lui. Un seul pari par tour. S’il a raison et l’autre tort, la carte rejoint sa frise.</li>
  <li>Pari perdu, tu laisses le jeton et une carte de ta frise. Il t’en reste toujours au moins une.</li>
  <li>À ton tour, artiste et titre justes avant de placer, +1 jeton. Seul, ni jetons ni paris&nbsp;: tu passes les chansons que tu veux, jusqu’à la frise pleine.</li>
</ul>`,
  eclair: `<h3>Éclair</h3>
<p>Tout le monde écoute la même chanson en même temps, chacun sur son téléphone. Trouve le titre en écoutant le moins possible.</p>
<ul>
  <li>0,5 s vaut 5 points, 1 s en vaut 4, 2 s 3, 3 s 2, et 5 s 1.</li>
  <li>Un titre faux ouvre le palier suivant. «&nbsp;Écouter plus&nbsp;» l’ouvre sans tenter de réponse.</li>
  <li>Case Jeux vidéo cochée, des musiques de jeux se glissent parmi les chansons. Pour celles-là, donne le nom du jeu. Trop vague, comme «&nbsp;zelda&nbsp;»&nbsp;? Ça ne coûte pas d’essai, on te demande de préciser.</li>
  <li>Après la dernière manche, le plus gros total gagne.</li>
</ul>`,
  sprint: `<h3>Sprint</h3>
<p>La même chanson démarre chez tout le monde en même temps. Donne l’artiste et le titre avant les autres.</p>
<ul>
  <li>Le 1<sup>er</sup> prend 5 points, le 2<sup>e</sup> 3, le 3<sup>e</sup> 2, les suivants 1.</li>
  <li>Trois essais par manche. Après, c’est fini pour toi.</li>
  <li>La liste de suggestions remplit titre et artiste d’un coup. Sers-t’en, tes pouces te diront merci.</li>
  <li>La manche s’arrête à la fin de l’extrait, ou quand tout le monde a répondu.</li>
  <li>Jeux vidéo ou Animés cochés dans le salon&nbsp;? Pour ces musiques-là, donne le nom du jeu ou de l’anime, pas le titre du morceau. Un nom trop vague ne coûte pas d’essai.</li>
</ul>`,
  sablier: `<h3>Sablier</h3>
    <p>Par équipes, sur plusieurs manches, toujours avec les <b>mêmes cartes</b>. Chacun écarte quelques cartes de sa main, puis fait deviner le paquet qui reste à son équipe, chrono en main.</p>
    <ul>
      <li><b>Description libre&nbsp;:</b> tout sauf les mots de la carte. <b>Un seul mot&nbsp;:</b> un mot, dit une seule fois. Les cartes sont connues, ça suffit souvent.</li>
      <li><b>Mime&nbsp;:</b> si vous êtes dans la même pièce. Pas un mot, pas un son, ton équipe devine à voix haute. <b>Dessin&nbsp;:</b> tu dessines sur ton téléphone, ton équipe voit le dessin en direct.</li>
      <li>Trois secondes pour te préparer, puis la carte arrive avec le chrono. Passer est libre, la carte reviendra. Au gong, la carte en main reste secrète. Trouvée pile à temps&nbsp;? L’hôte peut la compter.</li>
      <li>Entre deux tours, l’hôte peut retirer une carte comptée par erreur. Les cartes vues les soirs d’avant ne reviennent pas tant qu’il en reste des neuves.</li>
      <li>Pendant un tour, le public envoie des emojis. Les équipes qui ne jouent pas gribouillent sur les bords de l’écran avec le crayon ✏️, dans leur couleur. Tout s’efface au tour suivant.</li>
    </ul>`,
  chromo: `<h3>Chromo</h3>
<p>Le premier qui vide sa main gagne la manche. Et il empoche tout ce qui traîne encore chez les autres.</p>
<ul>
  <li>À ton tour, pose une carte de la même couleur ou du même symbole. Rien ne va ? Pioche. Si la carte piochée va, tu peux la poser tout de suite.</li>
  <li>Passe fait sauter le suivant. Sens inverse le tour, et à deux, ça fait passer. Le +2 fait piocher deux cartes au suivant, qui passe.</li>
  <li>Le joker se pose sur tout et tu choisis la couleur. Le joker +4 aussi, et le suivant pioche quatre cartes. Avec le cumul, on répond à un +2 par un +2 ou un +4, à un +4 par un +4. Le premier qui ne peut pas contrer pioche le total.</li>
  <li>Plus qu’une ou deux cartes ? Crie « Chromo ! ». Tombé à une carte sans crier, n’importe qui peut t’attraper avant que le suivant joue. Deux cartes de pénalité.</li>
  <li>Le gagnant marque la valeur des cartes restées chez les autres. Le chiffre pour un nombre, 20 pour Passe, Sens et +2, 50 pour les jokers. Les robots, eux, attrapent ceux qui oublient de crier.</li>
</ul>`,
  kems: `<h3>Kems</h3>
<p>Deux équipes de deux, partenaires face à face. Réunis un carré, quatre cartes de même valeur, et fais-le savoir à ton partenaire sans que ceux d’en face s’en aperçoivent.</p>
<ul>
  <li>Avant de jouer, chaque équipe convient d’un signal discret. Un clin d’œil, une main dans les cheveux, un mot glissé dans la conversation. Il ne passe pas par l’application, Kems se joue autour d’une table ou en visio.</li>
  <li>Pas de tour de jeu. Tout le monde échange en même temps une carte de sa main contre une du milieu, autant de fois qu’il veut. Premier arrivé, premier servi.</li>
  <li>Plus rien ne te tente ? « Je passe ». Quand les quatre passent, le milieu change. L’hôte peut aussi le renouveler si plus rien ne bouge.</li>
  <li>Tu crois voir le signal de ton partenaire ? « Kems ! » S’il a bien un carré, 1 point pour vous, 2 si tu en as un aussi. Sinon, 1 point pour ceux d’en face. Tu flaires un carré chez un adversaire ? « Contre-Kems ! » Juste, 1 point pour vous. Faux, 1 point pour eux.</li>
  <li>Une erreur coûte un point, alors chaque annonce demande un second toucher. Partie en 5 points par défaut. Un robot qui tient un carré fait un signe que seul son partenaire voit à l’écran, et il finit par remarquer le tien.</li>
</ul>`,
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
<p>Le conteur choisit une image et lance un indice, ni trop clair ni trop obscur. Les autres glissent une carte qui colle, puis chacun cherche celle du conteur.</p>
<ul>
  <li>L’indice se tape dans l’app ou se dit à voix haute. Un mot, une phrase, une chanson, un bruit.</li>
  <li>Au vote, les cartes sont mélangées. Chacun, sauf le conteur, vote pour celle du conteur. Jamais la sienne.</li>
  <li>Tout le monde trouve, ou personne ? Le conteur marque 0, les autres 2. Sinon, le conteur et ceux qui ont trouvé marquent 3.</li>
  <li>Chaque vote attrapé par ta carte rapporte 1 point, 3 au maximum.</li>
  <li>Une carte ne te plaît pas ? Ouvre-la et sors un joker. 5 cartes te sont proposées, tu en gardes une. 3 jokers par partie, réglable.</li>
</ul>`,
  douze: `<h3>Douze</h3>
<p>Douze cartes face cachée devant toi, en trois lignes de quatre. À chaque manche, vise le total le plus bas.</p>
<ul>
  <li>Pour commencer, chacun retourne deux cartes. Le plus haut total visible ouvre le bal.</li>
  <li>À ton tour, pioche ou prends le dessus de la défausse. Une carte piochée remplace une de tes cartes, visible ou cachée, et l’ancienne part à la défausse. Ou tu la défausses et tu retournes une carte cachée. Une carte prise dans la défausse se pose, pas le choix.</li>
  <li>Trois cartes identiques face visible dans une colonne, et la colonne disparaît. Idéal avec des 12.</li>
  <li>Quand quelqu’un a tout retourné, les autres jouent un dernier tour, puis tout se révèle. Celui qui a fermé sans avoir strictement le plus petit total voit son score doubler.</li>
  <li>Les cartes vont de -2 à 12. Les négatifs sont précieux, les rouges à fuir. La partie s’arrête quand quelqu’un atteint le seuil choisi, 100 points par défaut. Le plus bas gagne. Les robots complètent la table, pratique pour tester seul.</li>
</ul>`,
  petitbac: `<h3>Petit Brevet</h3>
<p>Une lettre, des catégories. Pour chacune, trouve un mot qui commence par cette lettre.</p>
<ul>
  <li>Remplis tout avant la fin du chrono. Les articles ne comptent pas, « La Rochelle » vaut pour R.</li>
  <li>Tout rempli ? Crie « Stop ! ». Les autres ont encore trois secondes, puis tout le monde pose son stylo. Si l’hôte a coupé le stop, chacun touche « J’ai fini » et la manche s’arrête quand tout le monde a fini, ou à la fin du chrono.</li>
  <li>À la vérification, touche une réponse douteuse pour la contester. Elle saute si la moitié des autres la conteste. L’hôte peut trancher.</li>
  <li>10 points pour une réponse que personne d’autre n’a, 5 si quelqu’un a la même, 0 si elle est vide, refusée ou pas à la bonne lettre.</li>
</ul>`,
  loupgarou: `<h3>Loup-Garou</h3>
    <p>Le village contre les loups-garous cachés parmi vous. Pas besoin de meneur&nbsp;: l’application réveille chaque rôle, annonce les morts et compte les votes.</p>
    <ul>
      <li><b>Ton rôle.</b> Maintiens la carte appuyée pour le voir, relâche pour le cacher. Ne le montre à personne.</li>
      <li><b>La nuit.</b> Yeux fermés. Ton téléphone vibre quand ton rôle se réveille, les autres voient l’écran de nuit. Chaque étape dure un moment, même si le rôle est mort&nbsp;: sa durée ne trahit rien.</li>
      <li><b>Le jour.</b> Les morts de la nuit sont annoncés avec leur rôle. Débattez à voix haute, puis votez sur le téléphone. Le plus désigné est éliminé. Égalité&nbsp;? On revote entre les ex æquo, puis plus personne.</li>
      <li><b>Victoire.</b> Le village quand tous les loups sont morts, les loups quand il ne reste que des loups, deux amoureux de camps différents s’ils restent seuls.</li>
      <li>Les morts se taisent. Chaque rôle est détaillé dans les Règles des jeux.</li>
    </ul>`,
  limite: `<h3>Hors Limite</h3>
    <p>Une phrase à trous, dix cartes en main. Complète-la avec la carte la plus drôle, ou la plus limite. Premier au score fixé, gagné.</p>
    <ul>
      <li><b>Avec un juge :</b> chacun son tour, un joueur lit les phrases à voix haute et garde sa préférée. 1 point pour son auteur.</li>
      <li><b>Tout le monde vote :</b> chacun vote pour sa préférée. Jamais la sienne.</li>
      <li>Deux trous ? Touche tes cartes dans l’ordre.</li>
      <li>Main pourrie ? Change-la entière contre 1 point. La version soft retire les cartes épicées.</li>
    </ul>`,
  solitaire: `<h3>Solitaire</h3>
    <p>La patience classique, en course. Même donne pour tout le monde, chacun sur son écran. Le premier qui monte les 52 cartes sur les fondations gagne.</p>
    <ul>
      <li>Touche une carte, elle file au meilleur endroit, la fondation d’abord. Plusieurs colonnes possibles ? Elles s’allument, tu choisis.</li>
      <li>Tu préfères la main ? Fais glisser une carte, ou une suite de la colonne, là où tu veux.</li>
      <li>Dans les colonnes, on descend en alternant rouge et noir. Une colonne vide n’accepte qu’un roi.</li>
      <li>La pioche tourne une ou trois cartes. Vide, elle reprend le talon.</li>
      <li>Annuler ne coûte rien. Au bout du temps, on classe sur les cartes montées.</li>
    </ul>`,
  teldes: `<h3>Téléphone dessiné</h3>
    <p>Le téléphone arabe, en dessins. Chacun écrit une phrase, le voisin la dessine, le suivant devine le dessin, et ainsi de suite jusqu’au bout du carnet.</p>
    <ul>
      <li><b>Écrire :</b> une phrase à dessiner. Plus c’est absurde, mieux c’est. « Inspire-moi » en propose une.</li>
      <li><b>Dessiner :</b> crayon, gomme, seau, trois épaisseurs. Pas de lettres, c’est la règle.</li>
      <li><b>Deviner :</b> écris ce que tu vois, même si ça ne ressemble à rien.</li>
      <li><b>La lecture :</b> l’hôte déroule les carnets un par un. Donne un cœur aux meilleurs moments.</li>
    </ul>`,
  nomcode: `<h3>Nom de code</h3>
    <p>Deux équipes, 25 mots. Chaque espion connaît la couleur des mots et fait deviner les siens avec un seul mot et un nombre.</p>
    <ul>
      <li><b>L’espion</b> donne un indice qui relie plusieurs de ses mots, par exemple « Océan » pour 3.</li>
      <li><b>Les agents</b> pointent un mot, puis le retournent. Jusqu’au nombre annoncé, plus un.</li>
      <li>Un passant ou un mot adverse arrête le tour. L’assassin fait perdre la partie.</li>
      <li>La première équipe qui retrouve tous ses agents gagne.</li>
    </ul>`,
  duel: `<h3>Duel des Cités</h3>
    <p>À deux, bâtis la plus grande cité de l’Antiquité en trois âges. Les cartes forment une pyramide, et seules celles que rien ne recouvre se prennent.</p>
    <ul>
      <li>À ton tour, tu prends une carte libre. Tu la construis en payant son coût, tu la défausses pour des pièces, ou tu la glisses sous une merveille pour la bâtir.</li>
      <li>Une ressource que ta cité ne produit pas s’achète 2 pièces, plus 1 par exemplaire que produit ton rival.</li>
      <li>Certaines cartes sont gratuites si tu as déjà le symbole indiqué. C’est l’enchaînement.</li>
      <li>Le pion atteint la capitale adverse, victoire militaire. Six symboles scientifiques différents, victoire scientifique. Sinon, le plus de points à la fin de l’âge III.</li>
    </ul>`,
  diapason: `<h3>Diapason</h3>
<p>Se mettre sur la même longueur d’onde. Une carte donne deux extrêmes, « Froid ↔ Chaud » par exemple, et seul le médium voit où se cache la cible.</p>
<ul>
  <li>Le médium lance un indice qui la situe entre les deux. Un mot, un nom, un film. Pour « Froid ↔ Chaud », « une douche en été » tombe plutôt vers le milieu.</li>
  <li>Les autres placent l’aiguille au jugé. Plein centre 4 points, puis 3, puis 2.</li>
  <li>Chacun pour soi, chacun place sa propre aiguille et le médium gagne la moyenne des points des autres.</li>
  <li>En équipes, l’équipe bouge ensemble une aiguille commune. L’équipe adverse parie ensuite « plus à gauche » ou « plus à droite », pour 1 point.</li>
</ul>`,
  bataille: `<h3>Bataille</h3>
    <p>Le jeu de la cour de récré. Tout le paquet est distribué, et chacun retourne la carte du dessus de son tas.</p>
    <ul>
      <li>La plus forte carte rafle le pli. L’as bat le roi, le 2 ne bat personne.</li>
      <li>Égalité : bataille. Une carte cachée, puis une visible, jusqu’à ce que quelqu’un l’emporte.</li>
      <li>Qui n’a plus de cartes est éliminé. À la fin du temps, on compte les tas.</li>
    </ul>`,
  poker: `<h3>Poker</h3>
    <p>Texas Hold’em, avec des jetons pour de faux. Deux cartes cachées pour toi, cinq communes au milieu. La meilleure main de cinq cartes parmi les sept ramasse le pot.</p>
    <ul>
      <li>À ton tour, tu te couches, tu parles si personne n’a misé, tu suis, ou tu relances avec le curseur. Tapis, tu mises tout.</li>
      <li>Avant le flop, puis le flop (3 cartes), le turn (1) et la river (1). Les blindes tournent et montent au fil des mains.</li>
      <li>De la plus faible à la plus forte : carte haute, paire, double paire, brelan, quinte, couleur, full, carré, quinte flush.</li>
      <li>Plus de jetons, tu sors. Le dernier à table rafle tout.</li>
    </ul>`,
  naufrages: `<h3>Naufragés</h3>
    <p>Échoués sur une île, il faut construire un radeau et partir avant l’ouragan. Chaque soir, chacun mange un poisson et boit une ration d’eau.</p>
    <ul>
      <li><b>Chaque jour,</b> choisis en secret&nbsp;: pêcher, chercher de l’eau (selon la météo), couper du bois ou fouiller l’épave, qui cache des objets secrets.</li>
      <li><b>Le bois.</b> Tente ta chance pour en couper plus. Gare au serpent&nbsp;: mordu, tu ne rapportes rien et tu es malade deux jours.</li>
      <li><b>Le soir.</b> S’il manque de quoi manger ou boire, le camp vote pour sacrifier quelqu’un, jusqu’à ce que les réserves suffisent.</li>
      <li><b>Le radeau.</b> 4 morceaux de bois par place. Une place et des vivres pour chacun, et l’hôte peut lancer le départ. L’ouragan, lui, force le départ&nbsp;: ceux qui n’ont pas de place restent.</li>
      <li>Ceux qui embarquent gagnent. Dans l’épave&nbsp;: conserve, gourde, hache, pistolet, talisman, et d’autres surprises.</li>
    </ul>`,
  memes: `<h3>Mème pas vrai</h3>
<p>Une situation s’affiche. Chacun pose le mème ou le GIF de sa main qui y répond le mieux.</p>
<ul>
  <li>Avec un juge, un joueur différent à chaque manche ne joue pas et garde son préféré. 1 point pour son auteur.</li>
  <li>Tout le monde vote ? Chacun vote pour son préféré, jamais le sien. Chaque vote reçu vaut 1 point.</li>
  <li>Touche un mème pour le voir en grand, avec la phrase.</li>
  <li>Main pourrie ? Change-la entière contre 1 point.</li>
</ul>`,
  geo: `<h3>Boussole</h3>
    <p>Une photo à 360° prise dans une rue, quelque part. Regarde autour de toi, puis plante ton épingle sur la carte et valide.</p>
    <ul>
      <li>Tout est indice. Les panneaux, la langue, la végétation, le côté de circulation, les plaques.</li>
      <li><b>Déplacement libre&nbsp;:</b> tu avances le long de la rue avec les flèches de l’image.</li>
      <li><b>Sans bouger&nbsp;:</b> tu tournes et tu zoomes, mais tu n’avances pas. <b>Ni bouger ni zoomer&nbsp;:</b> une seule vue fixe, pour les experts.</li>
      <li>Jusqu’à 5&nbsp;000 points par manche selon la distance, rapportée à la taille de la carte.</li>
      <li>La manche s’arrête quand tout le monde a validé, ou au bout du chrono.</li>
    </ul>
    <p class="fine">Images Mapillary, prises par des contributeurs. Carte OpenStreetMap.</p>`,
  undercover: `<h3>Undercover</h3>
    <p>Tout le monde a le même mot secret, sauf les <b>undercovers</b>&nbsp;: leur mot est voisin, et ils ne le savent pas. Avec <b>Mister White</b>, un joueur n’a aucun mot, et lui le sait.</p>
    <ul>
      <li><b>Indices.</b> Chacun son tour, un mot ou une courte expression à voix haute. Jamais ton mot. Tu peux aussi l’écrire, tout est rappelé au vote.</li>
      <li><b>Vote.</b> Chacun vote sur son téléphone. Le plus désigné est éliminé et son rôle révélé. Égalité&nbsp;? On revote entre les ex æquo.</li>
      <li><b>Mister White démasqué</b> devine le mot des civils. Trouvé, c’est 5 points. Il reste éliminé, la manche continue.</li>
      <li>Les civils gagnent quand tous les intrus sont éliminés. Les intrus, quand il ne reste qu’un civil.</li>
      <li><b>Points.</b> Civil gagnant 2, undercover gagnant 10, Mister White gagnant 6. Nouveaux mots à chaque manche.</li>
    </ul>`,
  hub: `<h3>Boîte à jeux</h3>
    <p>Quelqu’un crée la partie et donne le code à la table. Les autres ouvrent la même adresse, tapent le code, et c’est parti.</p>
    <ul>
      <li>L’hôte choisit le jeu et ses réglages ; tout le monde les voit en direct.</li>
      <li>${SALON_WS ? 'Les téléphones peuvent se mettre en veille : la partie continue sans eux, et chacun la retrouve en revenant.' : 'Garde l’écran de l’hôte allumé : c’est lui qui fait tourner la soirée.'}</li>
      <li>Seul ? Ajoute des robots pour tester n’importe quel jeu.</li>
    </ul>`,
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

const botsOpt = key => +($('#opt-' + key + '-bots')?.value || 0);

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
  if (!SALON_WS && typeof Peer === 'undefined') { err.textContent = 'Le module réseau est bloqué. Sur iPhone : Réglages, Safari, désactive les bloqueurs de contenu pour ce site, ou passe par Chrome.'; return; }
  e.submitter.disabled = true;
  try {
    if (mode === 'create') { await (SALON_WS ? serverHost() : hostGame()); keepAwake(); }
    else { if (code.length !== 4) { err.textContent = 'Le code fait 4 lettres.'; return; } await (SALON_WS ? serverJoin(code) : joinGame(code)); keepAwake(); }
  } catch (ex) {
    err.textContent = ex.message === 'no-room' || ex.type === 'peer-unavailable'
      ? (SALON_WS ? 'Aucune partie avec ce code. Vérifie les 4 lettres.' : 'Aucune partie avec ce code. Vérifie les 4 lettres, et demande à l\'hôte de rouvrir la page du jeu sur son téléphone.')
      : 'Connexion impossible : ' + (ex.message || ex.type || ex);
  } finally { e.submitter.disabled = false; }
});
$('#btn-solo').onclick = async () => {
  net.name = $('#in-name').value.trim() || 'Moi';
  try { await (SALON_WS ? serverHost() : hostGame()); keepAwake(); } catch (ex) { $('#home-err').textContent = 'Connexion impossible : ' + (ex.message || ex); }
};
document.querySelectorAll('.gcard').forEach(b => b.onclick = () => act({ t: 'pick', key: b.dataset.game }));

// ============================================================ familles de jeux
// Les jeux sont rangés par famille, avec un intitulé, et des pastilles pour n'afficher qu'une famille.
const FAMILIES = [
  { id: 'musique', icon: '🎵', name: 'Musique', short: 'Musique', desc: 'On écoute un extrait : l’année, le titre, le plus vite possible.', games: ['timeline', 'eclair', 'sprint'] },
  { id: 'cartes', icon: '🃏', name: 'Jeux de cartes', short: 'Cartes', desc: 'Les grands classiques, entre amis ou contre des robots.', games: ['chromo', 'douze', 'kems', 'bataille', 'poker', 'solitaire', 'duel'] },
  { id: 'rire', icon: '😂', name: 'Humour et imagination', short: 'Humour', desc: 'Chacun pose sa carte, la plus drôle ou la plus juste marque.', games: ['teldes', 'mirage', 'memes', 'limite'] },
  { id: 'deviner', icon: '💡', name: 'Devinettes et culture', short: 'Devinettes', desc: 'Faire deviner, écrire vite, viser juste, situer une photo sur la carte.', games: ['nomcode', 'sablier', 'diapason', 'petitbac', 'geo'] },
  { id: 'roles', icon: '🕵️', name: 'Rôles cachés et bluff', short: 'Rôles cachés', desc: 'Qui ment ? On débat, on vote, on trahit parfois.', games: ['undercover', 'loupgarou', 'naufrages'] },
];
let famCur = 'all'; try { famCur = localStorage.getItem('dc-fam') || 'all'; } catch { }
function famApply() {
  if (!FAMILIES.some(f => f.id === famCur)) famCur = 'all';
  // une famille masquée reste visible si elle contient le jeu choisi par l'hôte
  const keep = new Set([...document.querySelectorAll('#games .gcard[aria-pressed="true"]')].map(c => c.dataset.fam));
  document.querySelectorAll('#games > [data-fam]').forEach(n => { n.hidden = famCur !== 'all' && n.dataset.fam !== famCur && !keep.has(n.dataset.fam); });
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
    chip(f.id, f.short || f.name, cards.length);
    const head = el('h3', 'gfam', f.name);
    head.dataset.fam = f.id;
    const box = el('div', 'glist'); box.dataset.fam = f.id;
    grid.insertBefore(head, soon); grid.insertBefore(box, soon);
    cards.forEach(c => { c.dataset.fam = f.id; box.appendChild(c); });
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
    if ((view?.players || []).filter(p => p.online).length + botsOpt('sab') < 2) { toast('Sablier se joue à deux minimum, par équipes. Ajoute des robots.'); return; }
    const roundTypes = [...$('#opt-sab-rounds').querySelectorAll('input:checked')].map(i => i.value);
    if (!roundTypes.length) { toast('Choisis au moins une manche'); return; }
    const decks = [...$('#opt-sab-decks').querySelectorAll('input:checked')].map(i => i.value);
    if (!decks.length) { toast('Choisis au moins un deck'); return; }
    const settings = { roundTypes, turnSeconds: +$('#opt-sab-turn').value, drawSeconds: +$('#opt-sab-draw').value, dealPerPlayer: +$('#opt-sab-deal').value, discardPerPlayer: +$('#opt-sab-discard').value, teamMode: $('#opt-sab-teammode').value, decks, difficulties: [...$('#opt-sab-diff').querySelectorAll('input:checked')].map(i => +i.value) };
    act({ t: 'start', opts: { mode: 'sablier', decks, settings, bots: botsOpt('sab') } });
  }
  if (pick === 'undercover') {
    if ((view?.players || []).filter(p => p.online).length + botsOpt('uc') < 3) { toast('Undercover se joue à trois minimum. Ajoute des robots.'); return; }
    act({ t: 'start', opts: { mode: 'undercover', rounds: +$('#opt-uc-rounds').value, undercovers: $('#opt-uc-count').value, white: $('#opt-uc-white').checked, bots: botsOpt('uc') } });
  }
  if (pick === 'chromo') {
    const humans = (view?.players || []).filter(p => p.online).length, bots = +$('#opt-ch-bots').value;
    if (humans + bots < 2) { toast('Chromo se joue à deux minimum. Ajoute un robot ou invite un ami.'); return; }
    if (humans + bots > 10) { toast('Dix joueurs au maximum, robots compris.'); return; }
    act({ t: 'start', opts: { mode: 'chromo', rounds: +$('#opt-ch-rounds').value, stack: $('#opt-ch-stack').checked, zero: $('#opt-ch-zero').checked, bots } });
  }
  if (pick === 'kems') {
    const online = (view?.players || []).filter(p => p.online), bots = $('#opt-km-bots').checked;
    const t = Kems.split(online, kmTeamPick);
    if (!bots && (t[0].length < 2 || t[1].length < 2)) { toast('Kems se joue à quatre, deux par équipe. Invite des amis ou complète avec des robots.'); return; }
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
      if ((view?.players || []).filter(p => p.online).length + botsOpt('mi') < 3) { toast('Mirage se joue à trois minimum : ajoute des robots'); return; }
      await Mirage.load(ASSET_V);
      const cardset = $('#opt-mi-cards').value;
      if (Mirage.count(cardset) < 40) { toast('Cartes introuvables'); return; }
      act({ t: 'start', opts: { mode: 'mirage', target: +$('#opt-mi-target').value, jokers: +$('#opt-mi-jokers').value, cardset, bots: botsOpt('mi') } });
    })();
  }
  if (pick === 'douze') {
    const humans = (view?.players || []).filter(p => p.online).length, bots = +$('#opt-dz-bots').value;
    if (humans + bots < 2) { toast('Douze se joue à deux minimum. Ajoute un robot ou invite un ami.'); return; }
    if (humans + bots > 8) { toast('Huit joueurs au maximum, robots compris.'); return; }
    act({ t: 'start', opts: { mode: 'douze', target: +$('#opt-dz-target').value, bots } });
  }
  if (pick === 'limite') {
    if ((view?.players || []).filter(p => p.online).length + botsOpt('hl') < 3) { toast('Hors Limite se joue à trois minimum : ajoute des robots'); return; }
    act({ t: 'start', opts: { mode: 'limite', target: +$('#opt-hl-target').value, judge: $('#opt-hl-mode').value, soft: $('#opt-hl-soft').checked, bots: botsOpt('hl') } });
  }
  if (pick === 'solitaire') act({ t: 'start', opts: { mode: 'solitaire', draw: +$('#opt-so-draw').value, minutes: +$('#opt-so-minutes').value } });
  if (pick === 'teldes') {
    const n = (view?.players || []).filter(p => p.online).length + botsOpt('td');
    if (n < 3) { toast('Le téléphone dessiné se joue à trois minimum : ajoute des robots'); return; }
    act({ t: 'start', opts: { mode: 'teldes', bots: botsOpt('td'), speed: $('#opt-td-speed').value, length: $('#opt-td-length').value } });
  }
  if (pick === 'bataille') {
    const n = (view?.players || []).filter(p => p.online).length + botsOpt('bt');
    if (n < 2) { toast('La bataille se joue à deux minimum : ajoute un robot'); return; }
    if (n > 6) { toast('Six joueurs au maximum, robots compris, sinon les tas sont trop maigres'); return; }
    act({ t: 'start', opts: { mode: 'bataille', bots: botsOpt('bt'), length: $('#opt-bt-length').value } });
  }
  if (pick === 'nomcode') {
    const n = (view?.players || []).filter(p => p.online).length + botsOpt('nc');
    if (n < 4) { toast('Nom de code se joue à quatre minimum, deux par équipe : ajoute des robots'); return; }
    act({ t: 'start', opts: { mode: 'nomcode', bots: botsOpt('nc') } });
  }
  if (pick === 'duel') {
    const n = (view?.players || []).filter(p => p.online).length, rival = $('#opt-du-rival').value;
    if (rival === 'ami' && n < 2) { toast('Il faut un ami connecté, ou choisis le robot'); return; }
    act({ t: 'start', opts: { mode: 'duel', rival } });
  }
  if (pick === 'diapason') {
    const n = (view?.players || []).filter(p => p.online).length + botsOpt('dp'), dpMode = $('#opt-dp-mode').value;
    if (n < 2) { toast('Diapason se joue à deux minimum : ajoute un robot'); return; }
    if (dpMode === 'teams' && n < 4) { toast('En équipes, il faut au moins quatre joueurs'); return; }
    act({ t: 'start', opts: { mode: 'diapason', dpMode, tours: +$('#opt-dp-tours').value, target: +$('#opt-dp-target').value, bots: botsOpt('dp') } });
  }
  if (pick === 'poker') {
    const bots = +$('#opt-pk-bots').value, humans = (view?.players || []).filter(p => p.online).length;
    if (humans + bots < 2) { toast('Le poker se joue à deux minimum : ajoute un robot'); return; }
    if (humans + bots > 9) { toast('Neuf joueurs au maximum autour de la table, robots compris'); return; }
    act({ t: 'start', opts: { mode: 'poker', stack: +$('#opt-pk-stack').value, blindEvery: +$('#opt-pk-blinds').value, bots } });
  }
  if (pick === 'naufrages') {
    const bots = +$('#opt-nf-bots').value;
    if ((view?.players || []).filter(p => p.online).length + bots < 3) { toast('Naufragés se joue à trois minimum. Ajoute des robots.'); return; }
    act({ t: 'start', opts: { mode: 'naufrages', length: $('#opt-nf-length').value, bots } });
  }
  if (pick === 'memes') {
    (async () => {
      if ((view?.players || []).filter(p => p.online).length + botsOpt('mm') < 3) { toast('Mème pas vrai se joue à trois minimum : ajoute des robots'); return; }
      await Memes.load(ASSET_V);
      if (Memes.count() < 60) { toast('Mèmes introuvables : memes.json manque'); return; }
      act({ t: 'start', opts: { mode: 'memes', target: +$('#opt-mm-target').value, judge: $('#opt-mm-mode').value, kinds: $('#opt-mm-kinds').value, bots: botsOpt('mm') } });
    })();
  }
  if (pick === 'loupgarou') {
    if ((view?.players || []).filter(p => p.online).length + botsOpt('lw') < 5) { toast('Loup-Garou se joue à cinq minimum. Ajoute des robots.'); return; }
    const roles = {}; LoupGarou.SPECIALS.forEach(r => { roles[r] = !!$('#opt-lw-' + r)?.checked; });
    try { localStorage.setItem('lw-voice', $('#opt-lw-voice').checked ? '1' : '0'); } catch { }
    if ($('#opt-lw-voice').checked && window.speechSynthesis) { try { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch { } }   // débloque la voix sur iPhone
    act({ t: 'start', opts: { mode: 'loupgarou', wolves: $('#opt-lw-wolves').value, roles, deadSee: $('#opt-lw-dead').checked, bots: botsOpt('lw') } });
  }
  if (pick === 'petitbac') {
    const cats = [...$('#opt-pb-cats').querySelectorAll('input:checked')].map(i => i.value);
    if (cats.length < 3) { toast('Choisis au moins trois catégories'); return; }
    if (cats.length > PetitBac.MAX_CATS) { toast(`${PetitBac.MAX_CATS} catégories au maximum`); return; }
    act({ t: 'start', opts: { mode: 'petitbac', cats, rounds: +$('#opt-pb-rounds').value, seconds: +$('#opt-pb-seconds').value, hard: $('#opt-pb-hard').checked, stopRule: $('#opt-pb-stop').checked } });
  }
  if (pick === 'geo') {
    (async () => {
      if (!window.MAPILLARY_TOKEN) { toast('Jeton Mapillary manquant. Colle-le dans geo-config.js.'); return; }
      const map = $('#opt-geo-map').value;
      await Geo.loadPlaces();
      if (!Geo.count(map)) { toast('Aucun lieu prêt pour cette carte. Choisis-en une autre.'); return; }
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
