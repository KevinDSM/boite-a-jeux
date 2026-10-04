/* Solitaire — la patience classique (Klondike), en course : tout le monde reçoit exactement la même donne
   et joue sur son téléphone. On voit en direct combien de cartes chacun a monté sur les fondations.
   Le premier qui termine gagne ; au bout du temps, le classement se fait au nombre de cartes montées.

   L'hôte ne fait que tirer la donne (une graine), tenir le chrono et classer : la partie de chacun se
   joue sur son propre téléphone et n'envoie que sa progression (« so:progress »).
   Toucher une carte la déplace au meilleur endroit (fondation d'abord) ; s'il y a plusieurs colonnes
   possibles, elles s'allument et on touche celle qu'on veut. Annuler et fin automatique inclus.
   Chargé après app.js et kems.js : réutilise $, el, act, esc, toast, net, view et kmCardHTML. */

'use strict';

const Solitaire = (() => {
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const pl = (room, id) => room.players.find(p => p.id === id);

  function create({ hostId, players, draw, minutes }) {
    const room = {
      hostId, phase: 'play', seed: (Math.random() * 2 ** 31) >>> 0, draw: draw === 3 ? 3 : 1, minutes: clamp(minutes, 0, 60, 10),
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, found: 0, moves: 0, done: false, time: null, gaveUp: false })),
      start: Date.now(), endsAt: 0, seq: 0,
    };
    if (room.minutes) room.endsAt = room.start + room.minutes * 60000;
    return room;
  }
  function progress(room, pid, m) {
    const p = pl(room, pid); if (!p || room.phase !== 'play' || p.done) return 'silent';
    p.found = clamp(m.found, 0, 52, p.found); p.moves = clamp(m.moves, 0, 99999, p.moves);
    if (p.found >= 52) { p.done = true; p.time = Date.now() - room.start; }
    room.seq += 1;
    if (room.players.filter(q => q.online).every(q => q.done || q.gaveUp)) room.phase = 'over';
    return null;
  }
  function ranking(room) {
    return [...room.players].sort((a, b) => (b.done - a.done) || (a.done ? a.time - b.time : 0) || (b.found - a.found) || (a.moves - b.moves));
  }
  function act(room, pid, m) {
    switch (m.t) {
      case 'so:progress': return progress(room, pid, m);
      case 'so:giveup': { const p = pl(room, pid); if (p && room.phase === 'play') { p.gaveUp = true; room.seq += 1; if (room.players.filter(q => q.online).every(q => q.done || q.gaveUp)) room.phase = 'over'; } return null; }
      case 'so:end': if (pid === room.hostId && room.phase === 'play') { room.phase = 'over'; room.seq += 1; } return null;
      case 'so:again': if (pid === room.hostId && room.phase === 'over') { const r = create({ hostId: room.hostId, players: room.players, draw: room.draw, minutes: room.minutes }); Object.assign(room, r); } return null;
    }
    return null;
  }
  function tick(room) {
    if (room.phase === 'play' && room.endsAt && Date.now() >= room.endsAt) { room.phase = 'over'; room.seq += 1; return true; }
    return false;
  }
  function join(room, id, name) { const p = pl(room, id); if (p) { p.online = true; p.name = name || p.name; return; } room.players.push({ id, name, online: true, found: 0, moves: 0, done: false, time: null, gaveUp: false }); }
  function setOnline(room, id, on) { const p = pl(room, id); if (p) p.online = on; }
  function view(room, pid) {
    return {
      phase: room.phase, seed: room.seed, draw: room.draw, minutes: room.minutes, isHost: pid === room.hostId, seq: room.seq,
      left: room.endsAt ? Math.max(0, room.endsAt - Date.now()) : null, elapsed: Date.now() - room.start,
      players: ranking(room).map(p => ({ id: p.id, name: p.name, found: p.found, moves: p.moves, done: p.done, time: p.time, gaveUp: p.gaveUp, online: p.online, me: p.id === pid })),
    };
  }
  return { create, act, tick, join, setOnline, view, ranking };
})();
