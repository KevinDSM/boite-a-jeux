/* Boussole — une photo 360° de rue, chacun place son épingle sur la carte.

   Images : Mapillary (MapillaryJS), carte : Leaflet + OpenStreetMap, chargées à la demande
   pour ne rien alourdir quand on joue à autre chose. La salle vit chez l'hôte (net.game.geo),
   les lieux viennent de geo-places.json (préparé par build_geo.py). Pendant la manche,
   la vue ne contient que l'identifiant de l'image, jamais ses coordonnées.
   Chargé après app.js : réutilise $, el, act, esc, toast et view. */

'use strict';

const Geo = (() => {
  const MAPS = {
    monde: { name: 'Monde', size: 14917, center: [25, 10], zoom: 1 },
    europe: { name: 'Europe', size: 4500, center: [51, 12], zoom: 3 },
    france: { name: 'France', size: 1200, center: [46.6, 2.4], zoom: 5 },
  };
  const MODES = { move: 'Déplacement libre', nomove: 'Sans bouger', nmpz: 'Ni bouger ni zoomer' };
  const HIST_KEY = 'geo-vues';
  let places = null;

  async function loadPlaces() {
    if (!places) {
      try { places = (await (await fetch('geo-places.json?v=' + ASSET_V)).json()).maps || {}; }
      catch { places = {}; }
    }
    return places;
  }
  const count = map => (places?.[map] || []).length;

  const hist = {
    get() { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; } },
    add(id) { try { const h = hist.get().filter(x => x !== id); h.push(id); localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-900))); } catch { } },
  };

  function distKm(a, b) {
    const p = Math.PI / 180;
    const x = Math.sin((b.lat - a.lat) * p / 2) ** 2 + Math.cos(a.lat * p) * Math.cos(b.lat * p) * Math.sin((b.lon - a.lon) * p / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(x));
  }
  /** Barème de GeoGuessr : 5 000 à moins de 25 m, puis décroissance selon la taille de la carte. */
  const points = (d, size) => d < 0.025 ? 5000 : Math.round(5000 * Math.exp(-10 * d / size));
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

  function create({ hostId, players, map, mode, rounds, seconds }) {
    const room = {
      hostId, map: MAPS[map] ? map : 'monde', mode: MODES[mode] ? mode : 'move',
      rounds: clamp(rounds, 1, 10, 5), seconds: clamp(seconds, 20, 600, 120),
      round: 0, used: [], phase: 'play',
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, score: 0 })),
    };
    nextRound(room);
    return room;
  }

  function nextRound(room) {
    const list = places?.[room.map] || [];
    const seen = new Set(hist.get());
    let pool = list.filter(p => !room.used.includes(p[0]) && !seen.has(p[0]));
    if (!pool.length) pool = list.filter(p => !room.used.includes(p[0]));
    if (!pool.length) pool = list;
    const p = pool[Math.random() * pool.length | 0];
    hist.add(p[0]); room.used.push(p[0]);
    room.round += 1;
    room.place = { id: String(p[0]), lat: p[1], lon: p[2] };
    room.guesses = {}; room.results = null;
    room.endsAt = Date.now() + room.seconds * 1000;
    room.phase = 'play';
  }

  const active = room => room.players.filter(p => p.online);
  function maybeReveal(room) {
    const on = active(room);
    if (room.phase === 'play' && on.length && on.every(p => room.guesses[p.id])) reveal(room);
  }
  function reveal(room) {
    const size = MAPS[room.map].size;
    room.results = room.players.map(p => {
      const g = room.guesses[p.id];
      if (!g) return { id: p.id, name: p.name, d: null, points: 0, lat: null, lon: null };
      const d = distKm(g, room.place);
      return { id: p.id, name: p.name, d, points: points(d, size), lat: g.lat, lon: g.lon };
    });
    room.results.forEach(r => { const p = room.players.find(x => x.id === r.id); if (p) p.score += r.points; });
    room.results.sort((a, b) => b.points - a.points || (a.d ?? 1e9) - (b.d ?? 1e9));
    room.phase = 'reveal';
  }
  function tick(room) {
    if (room.phase === 'play' && Date.now() >= room.endsAt + 300) { reveal(room); return true; }
    return false;
  }

  function act(room, pid, m) {
    const host = pid === room.hostId;
    switch (m.t) {
      case 'geo:guess': {
        if (room.phase !== 'play' || !room.players.find(p => p.id === pid)) return null;
        if (room.guesses[pid]) return 'Réponse déjà envoyée';
        const lat = +m.lat, lon = +m.lon;
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90) return null;
        room.guesses[pid] = { lat, lon: ((lon + 540) % 360) - 180 };
        maybeReveal(room);
        return null;
      }
      case 'geo:force':
        if (host && room.phase === 'play') reveal(room);
        return null;
      case 'geo:next':
        if (!host || room.phase !== 'reveal') return null;
        if (room.round >= room.rounds) room.phase = 'over'; else nextRound(room);
        return null;
    }
    return null;
  }

  function join(room, id, name) {
    const p = room.players.find(x => x.id === id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, score: 0 });
  }
  function setOnline(room, id, on) {
    const p = room.players.find(x => x.id === id); if (!p) return;
    p.online = on;
    if (!on) maybeReveal(room);
  }

  function view(room, pid) {
    const shown = room.phase !== 'play';
    return {
      phase: room.phase, round: room.round, rounds: room.rounds,
      map: room.map, mapName: MAPS[room.map].name, mode: room.mode, modeName: MODES[room.mode],
      seconds: room.seconds, endsAt: room.endsAt, serverNow: Date.now(),
      isHost: pid === room.hostId,
      imageId: room.place.id,
      place: shown ? { lat: room.place.lat, lon: room.place.lon } : null,
      myGuess: room.guesses[pid] || null,
      guessed: room.players.filter(p => room.guesses[p.id]).map(p => p.name),
      playerCount: active(room).length,
      results: shown ? room.results : null,
      scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })).sort((a, b) => b.score - a.score),
    };
  }

  return { MAPS, MODES, loadPlaces, count, create, act, tick, join, setOnline, view, distKm, points };
})();

// ============================================================ écran
// couleurs des joueurs : jamais le blanc cerclé de sombre, réservé à la bonne réponse
const GEO_COLORS = ['#4cc38a', '#b084f5', '#f5c542', '#ff5ca8', '#5cb8ff', '#ff8a3d', '#e5484d', '#7ee0d0', '#c7a17a', '#a3e635'];
let geoViewer = null, geoViewerMode = null, geoViewerImage = null;
let geoMap = null, geoLayer = null, geoPin = null, geoRoundKey = null, geoRevealKey = null;
let geoClock = null, geoOffset = 0, geoLibsP = null;

function geoLibs() {
  if (geoLibsP) return geoLibsP;
  const css = href => new Promise(res => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = res; l.onerror = res; document.head.appendChild(l); });
  const js = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  geoLibsP = Promise.all([
    css('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'),
    css('https://cdn.jsdelivr.net/npm/mapillary-js@4.1.2/dist/mapillary.css'),
    js('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'),
    js('https://cdn.jsdelivr.net/npm/mapillary-js@4.1.2/dist/mapillary.js'),
  ]).catch(e => { geoLibsP = null; throw e; });
  return geoLibsP;
}

const geoFmtDist = d => d == null ? 'pas de réponse'
  : d < 1 ? `${Math.round(d * 1000)} m`
    : d < 100 ? `${d.toFixed(1).replace('.', ',')} km`
      : `${Math.round(d).toLocaleString('fr-FR')} km`;

function geoComponents(mode) {
  const move = mode === 'move';
  return {
    cover: false, attribution: true, bearing: true, image: true,
    cache: move, direction: move, keyboard: move,
    marker: false, popup: false, sequence: false, slider: false, spatial: false, tag: false,
    zoom: mode !== 'nmpz',
    pointer: mode === 'nmpz' ? { dragPan: false, scrollZoom: false, touchZoom: false, earthControl: false } : { earthControl: false },
  };
}

function geoShowImage(v) {
  const box = $('#geo-pano');
  if (!window.MAPILLARY_TOKEN) { box.innerHTML = '<p class="note geo-missing">Jeton Mapillary manquant : il faut le coller dans geo-config.js.</p>'; return; }
  if (geoViewer && geoViewerMode !== v.mode) { try { geoViewer.remove(); } catch { } geoViewer = null; }
  if (!geoViewer) {
    box.innerHTML = '';
    geoViewer = new mapillary.Viewer({ accessToken: window.MAPILLARY_TOKEN, container: box, imageId: v.imageId, component: geoComponents(v.mode) });
    geoViewerMode = v.mode; geoViewerImage = v.imageId;
  } else if (geoViewerImage !== v.imageId) {
    geoViewerImage = v.imageId;
    geoViewer.moveTo(v.imageId).catch(() => toast('Image indisponible, l\'hôte peut terminer la manche'));
  }
}

function geoEnsureMap(v) {
  if (geoMap) return;
  const m = Geo.MAPS[v.map];
  geoMap = L.map('geo-map', { worldCopyJump: true, minZoom: 1 }).setView(m.center, m.zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(geoMap);
  geoLayer = L.layerGroup().addTo(geoMap);
  geoMap.on('click', e => {
    const cur = view?.geo;
    if (!cur || cur.phase !== 'play' || cur.myGuess) return;
    if (geoPin) geoPin.setLatLng(e.latlng);
    else geoPin = L.marker(e.latlng, { icon: geoIcon('me') }).addTo(geoLayer);
    const b = $('#geo-validate'); if (b) b.disabled = false;
  });
  $('#geo-map').addEventListener('transitionend', () => geoMap.invalidateSize());
}
const geoIcon = kind => L.divIcon({ className: 'geo-icon', html: `<span class="geo-${kind}"></span>`, iconSize: [26, 26], iconAnchor: [13, 13] });

function geoDrawReveal(v) {
  const key = v.round + '|' + v.imageId;
  if (geoRevealKey === key) return;
  geoRevealKey = key;
  geoLayer.clearLayers(); geoPin = null;
  const truth = [v.place.lat, v.place.lon];
  const all = [truth];
  v.results.forEach((r, i) => {
    if (r.lat == null) return;
    let lon = r.lon;                                     // le trait prend le chemin le plus court
    if (lon - v.place.lon > 180) lon -= 360; else if (v.place.lon - lon > 180) lon += 360;
    const p = [r.lat, lon], c = GEO_COLORS[i % GEO_COLORS.length];
    L.polyline([p, truth], { color: c, weight: 3, dashArray: '6 7', opacity: 0.9 }).addTo(geoLayer);
    L.circleMarker(p, { radius: 8, color: '#ffffff', weight: 2, fillColor: c, fillOpacity: 1 })
      .bindTooltip(esc(r.name), { permanent: true, direction: 'top', offset: [0, -8], className: 'geo-tip' }).addTo(geoLayer);
    all.push(p);
  });
  L.marker(truth, { icon: geoIcon('truth'), zIndexOffset: 1000 }).addTo(geoLayer);
  geoMap.fitBounds(L.latLngBounds(all).pad(0.3), { maxZoom: 13 });
}

function geoResize() { setTimeout(() => { geoMap?.invalidateSize(); try { geoViewer?.resize(); } catch { } }, 60); }

function renderGeo(v) {
  if (!v) return;
  geoOffset = v.serverNow - Date.now();
  if (!window.L || !window.mapillary) {
    $('#geo-hud').innerHTML = '<p class="note">Chargement des images et de la carte…</p>';
    geoLibs().then(() => { if (view?.geo) renderGeo(view.geo); }).catch(() => toast('Impossible de charger la carte, vérifie ta connexion'));
    return;
  }
  const play = v.phase === 'play';
  const screen = $('#s-geo');
  screen.classList.toggle('revealing', !play);
  if (!play) screen.classList.remove('geo-bigmap');

  const me = v.scores.find(s => s.id === net.me);
  $('#geo-hud').innerHTML = `<div class="geo-hud-row"><span class="eyebrow">Manche ${v.round}/${v.rounds} · ${esc(v.mapName)} · ${esc(v.modeName)}</span><span class="geo-total">${(me?.score || 0).toLocaleString('fr-FR')} pts</span></div>`
    + (play ? '<div class="geo-timer" id="geo-timer">–</div>' : '');

  $('#geo-pano').hidden = !play;
  if (play) geoShowImage(v);

  const roundKey = v.round + '|' + v.imageId;
  geoEnsureMap(v);
  if (roundKey !== geoRoundKey) {
    geoRoundKey = roundKey;
    geoLayer.clearLayers(); geoPin = null;
    const m = Geo.MAPS[v.map]; geoMap.setView(m.center, m.zoom);
  }
  if (play && v.myGuess && !geoPin) geoPin = L.marker([v.myGuess.lat, v.myGuess.lon], { icon: geoIcon('me') }).addTo(geoLayer);
  if (!play) geoDrawReveal(v);
  geoResize();

  const bar = $('#geo-bar'); bar.innerHTML = '';
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  if (play) {
    if (v.myGuess) bar.appendChild(el('p', 'note', `Épingle posée. ${v.guessed.length} / ${v.playerCount} ont répondu.`));
    else {
      const row = el('div', 'geo-actions');
      const ok = btn('primary lg', 'Valider', () => { if (!geoPin) return; const ll = geoPin.getLatLng().wrap(); act({ t: 'geo:guess', lat: ll.lat, lon: ll.lng }); });
      ok.id = 'geo-validate'; ok.disabled = !geoPin;
      const big = btn('', screen.classList.contains('geo-bigmap') ? 'Réduire la carte' : 'Agrandir la carte', () => { screen.classList.toggle('geo-bigmap'); geoResize(); renderGeo(view.geo); });
      big.classList.add('geo-toggle');
      row.append(big, ok); bar.appendChild(row);
      bar.appendChild(el('p', 'note', 'Regarde autour de toi, puis touche la carte pour poser ton épingle.'));
    }
    if (v.isHost) bar.appendChild(btn('ghost', 'Terminer la manche maintenant', () => act({ t: 'geo:force' })));
  } else {
    const list = el('ol', 'geo-results');
    v.results.forEach((r, i) => {
      const li = el('li', r.d == null ? 'none' : '');
      li.innerHTML = `<i style="background:${GEO_COLORS[i % GEO_COLORS.length]}"></i><b>${esc(r.name)}</b><span>${geoFmtDist(r.d)}</span><em>+${r.points.toLocaleString('fr-FR')}</em>`;
      list.appendChild(li);
    });
    bar.appendChild(list);
    bar.appendChild(el('p', 'fine center', `<a href="https://www.mapillary.com/app/?pKey=${encodeURIComponent(v.imageId)}" target="_blank" rel="noopener">Voir le lieu sur Mapillary</a>`));
    bar.appendChild(el('div', 'geo-scores', '<span class="eyebrow">Scores</span>' + v.scores.map(s => `<span>${esc(s.name)} <b>${s.score.toLocaleString('fr-FR')}</b></span>`).join('')));
    if (v.isHost) bar.appendChild(btn('primary lg', v.round >= v.rounds ? 'Voir le classement' : 'Manche suivante', () => act({ t: 'geo:next' })));
    else bar.appendChild(el('p', 'note', 'L\'hôte lance la suite.'));
  }

  clearInterval(geoClock); geoClock = null;
  if (play) {
    const tick = () => {
      const t = $('#geo-timer'); if (!t) return;
      const left = Math.max(0, Math.ceil((v.endsAt - (Date.now() + geoOffset)) / 1000));
      t.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      t.classList.toggle('hot', left <= 10);
    };
    tick(); geoClock = setInterval(tick, 250);
  }
}
