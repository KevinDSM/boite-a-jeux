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
  const MODES = { move: 'déplacement libre', nomove: 'sans bouger', nmpz: 'ni bouger ni zoomer' };
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
        if (room.guesses[pid]) return 'Ton épingle est déjà plantée.';
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
