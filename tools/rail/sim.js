// Grandes Lignes : des parties entières entre robots, pour vérifier le moteur (cartes conservées, fin de partie, scores).
// Usage : node tools/rail/sim.js [parties]
global.RAIL_CARTE = require('../../rail-carte.js');
global.shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const Rail = require('../../engines/rail.js');
const N = +process.argv[2] || 200; let real = Date.now, t = 1e12; Date.now = () => t;
const stats = { games: 0, turns: 0, ends: {}, winners: [], maxTurns: 0, tunnels: 0, stations: 0, err: [] };
for (let g = 0; g < N; g++) {
  const np = 2 + (g % 4), players = Array.from({ length: np }, (_, i) => ({ id: 'b' + i, name: 'Robot ' + i, bot: true }));
  const room = Rail.create({ hostId: 'b0', players, short: g % 5 === 4, europe: g % 3 !== 2, stations: g % 2 === 1 });
  let k = 0;
  while (room.phase !== 'over' && k < 5000) {
    t += 3000; Rail.tick(room); k++;
    const tot = room.deck.length + room.discard.length + room.river.filter(Boolean).length + (room.tunnel ? room.tunnel.shown.length : 0)
      + room.players.reduce((a, p) => a + Rail.CARDS.reduce((b, c) => b + p.hand[c], 0), 0);
    const placed = Object.keys(room.claims).length;
    if (tot + 0 > 110 || room.players.some(p => Rail.CARDS.some(c => p.hand[c] < 0) || p.wagons < 0)) { stats.err.push(['cartes', g, tot]); break; }
    if (room.tunnel) stats.tunnels++;
  }
  if (room.phase !== 'over') stats.err.push(['bloquée', g, room.phase, k]);
  // cartes : celles posées sont en défausse ; total exact 110
  const tot = room.deck.length + room.discard.length + room.river.filter(Boolean).length + room.players.reduce((a, p) => a + Rail.CARDS.reduce((b, c) => b + p.hand[c], 0), 0);
  if (tot !== 110) stats.err.push(['total', g, tot]);
  const v = Rail.view(room, 'b0');
  if (JSON.stringify(Rail.view(room, 'b1')).includes('"hand":') && room.phase !== 'over') stats.err.push(['fuite', g]);
  stats.games++; stats.turns += k; stats.maxTurns = Math.max(stats.maxTurns, k);
  stats.winners.push(room.final?.[0]?.total);
  stats.stations += room.players.reduce((a, p) => a + p.stations.length, 0);
  const why = room.last ? 'wagons' : 'bloqué'; stats.ends[why] = (stats.ends[why] || 0) + 1;
  if (g === 0) console.log(JSON.stringify(room.final.map(r => ({ n: r.name, routes: r.routes, billets: r.ticketPts, fait: `${r.done}/${r.tickets.length}`, long: r.long, total: r.total }))));
}
const w = stats.winners.filter(x => x != null);
console.log({ ...stats, winners: undefined, err: stats.err.slice(0, 10), nErr: stats.err.length, moyenneGagnant: Math.round(w.reduce((a, b) => a + b, 0) / w.length), minG: Math.min(...w), maxG: Math.max(...w), ticksMoyens: Math.round(stats.turns / stats.games) });
