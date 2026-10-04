// Geo : affichage et commandes. Les règles du jeu sont dans engines/geo.js.

'use strict';


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

const geoFmtDist = d => d == null ? 'pas d’épingle'
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
  if (!window.MAPILLARY_TOKEN) { box.innerHTML = '<p class="note geo-missing">Jeton Mapillary manquant. Colle-le dans geo-config.js.</p>'; return; }
  if (geoViewer && geoViewerMode !== v.mode) { try { geoViewer.remove(); } catch { } geoViewer = null; }
  if (!geoViewer) {
    box.innerHTML = '';
    geoViewer = new mapillary.Viewer({ accessToken: window.MAPILLARY_TOKEN, container: box, imageId: v.imageId, component: geoComponents(v.mode) });
    geoViewerMode = v.mode; geoViewerImage = v.imageId;
  } else if (geoViewerImage !== v.imageId) {
    geoViewerImage = v.imageId;
    geoViewer.moveTo(v.imageId).catch(() => toast('Cette photo ne charge pas. L’hôte peut clore la manche.'));
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
    geoValidateLabel($('#geo-validate'));
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

// voix du meneur (voir DESIGN.md) : ce qui se passe, en une phrase ; les répliques changent à chaque manche
const geoSay = (list, n) => list[(Math.max(1, n) - 1) % list.length];
const geoVerdict = d => d == null ? 'Zéro point, mais une belle photo.'
  : d < 1 ? 'Tu y habites, avoue.'
    : d < 25 ? 'Presque dans le mille.'
      : d < 300 ? 'Bonne région, mauvaise rue.'
        : d < 1500 ? 'Le bon coin du monde, en gros.'
          : 'Tu étais en vacances ailleurs.';
function geoValidateLabel(b) { if (b) { b.disabled = !geoPin; b.textContent = geoPin ? 'Valider mon épingle' : 'Pose ton épingle'; } }

function renderGeo(v) {
  if (!v) return;
  geoOffset = v.serverNow - Date.now();
  if (!window.L || !window.mapillary) {
    $('#geo-hud').innerHTML = '<p class="mj-meta">On déplie la carte.</p>';
    geoLibs().then(() => { if (view?.geo) renderGeo(view.geo); }).catch(() => toast('La carte ne charge pas. Vérifie ta connexion.'));
    return;
  }
  const play = v.phase === 'play';
  const screen = $('#s-geo');
  screen.classList.toggle('revealing', !play);
  if (!play) screen.classList.remove('geo-bigmap');

  const me = v.scores.find(s => s.id === net.me), solo = v.scores.length <= 1, fr = n => n.toLocaleString('fr-FR');
  let title, line, prog = null;
  if (play) {
    if (!v.myGuess) {
      title = geoSay(['Où sommes-nous ?', 'Devine où tu es.', 'Quelque part sur la carte.'], v.round);
      line = geoSay(['Panneaux, plaques, côté de la route.', 'Cherche une langue, une plaque.', 'Les panneaux ne mentent jamais.'], v.round);
    } else {
      title = 'Épingle plantée.';
      line = solo ? 'Plus moyen de changer d’avis.' : v.guessed.length >= v.playerCount ? 'Tout le monde a répondu.' : geoSay(['Les autres cherchent encore.', 'Trop tard pour changer d’avis.'], v.round);
    }
    if (!solo) prog = [v.guessed.length, v.playerCount];
  } else {
    const best = v.results[0], mine = v.results.find(r => r.id === net.me);
    if (solo || !best || best.d == null) {
      const r = solo ? mine : best;
      title = r && r.d != null ? `${fr(r.points)} point${r.points > 1 ? 's' : ''}.` : solo ? 'Pas d’épingle.' : 'Personne n’a répondu.';
      line = r && r.d != null ? `À ${geoFmtDist(r.d)} du bon endroit. ${geoVerdict(r.d)}` : geoVerdict(null);
    } else {
      title = best.id === net.me ? 'Tu étais le plus près.' : `${esc(best.name)} était le plus près.`;
      line = `À ${geoFmtDist(best.d)}. ${geoVerdict(best.d)}`;
    }
  }
  const meta = `Manche ${v.round} sur ${v.rounds} · ${esc(v.mapName)} · ${play ? esc(v.modeName) : `${fr(me?.score || 0)} point${(me?.score || 0) > 1 ? 's' : ''} au total`}`;
  $('#geo-hud').innerHTML = `<div class="geo-hud-top"><p class="mj-meta">${meta}</p>${play ? '<div class="geo-timer" id="geo-timer">–</div>' : ''}</div>`
    + `<div class="mj-status"><h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>${prog ? `<div class="mj-prog">${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]}</span></div>` : ''}</div>`;

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
    if (!v.myGuess) {
      const row = el('div', 'geo-actions');
      const ok = btn('primary lg', '', () => { if (!geoPin) return; const ll = geoPin.getLatLng().wrap(); act({ t: 'geo:guess', lat: ll.lat, lon: ll.lng }); });
      ok.id = 'geo-validate'; geoValidateLabel(ok);
      const big = btn('', screen.classList.contains('geo-bigmap') ? 'Réduire la carte' : 'Agrandir la carte', () => { screen.classList.toggle('geo-bigmap'); geoResize(); renderGeo(view.geo); });
      big.classList.add('geo-toggle');
      row.append(big, ok); bar.appendChild(row);
    }
    if (v.isHost) bar.appendChild(btn('ghost small', solo ? 'Je sèche, montre-moi' : 'Clore la manche', () => act({ t: 'geo:force' })));
  } else {
    const block = el('div', 'geo-block');
    block.appendChild(el('span', 'mj-side-title', 'La manche'));
    const list = el('div', 'mj-list geo-results');
    v.results.forEach((r, i) => list.appendChild(el('div', 'mj-row' + (r.d == null ? ' none' : '') + (r.id === net.me ? ' me' : ''),
      `<span class="geo-rk">${i + 1}</span><i style="background:${GEO_COLORS[i % GEO_COLORS.length]}"></i><b>${esc(r.name)}</b><span>${geoFmtDist(r.d)}</span><em>+${fr(r.points)}</em>`)));
    block.appendChild(list);
    bar.appendChild(block);
    if (!solo) {
      const sc = el('div', 'geo-block');
      sc.appendChild(el('span', 'mj-side-title', 'Classement'));
      sc.appendChild(el('div', 'mj-list geo-scores', v.scores.map(s => `<div class="mj-row${s.id === net.me ? ' me' : ''}"><span>${esc(s.name)}</span><b>${fr(s.score)}</b></div>`).join('')));
      bar.appendChild(sc);
    }
    if (v.isHost) bar.appendChild(btn('primary lg', v.round >= v.rounds ? 'Voir le classement final' : 'Manche suivante', () => act({ t: 'geo:next' })));
    else bar.appendChild(el('p', 'note', v.round >= v.rounds ? 'L’hôte ouvre le classement final.' : 'L’hôte lance la manche suivante.'));
    bar.appendChild(el('p', 'geo-link', `<a href="https://www.mapillary.com/app/?pKey=${encodeURIComponent(v.imageId)}" target="_blank" rel="noopener">Voir le lieu sur Mapillary</a>`));
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
