// Joue chaque scénario de Huis clos jusqu'au bout, sans téléphone, pour vérifier qu'il se termine
// et que les vues ne laissent jamais fuir un code. Usage : node tools/huisclos/sim.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, 'huisclos.json'), 'utf8')) });
const HC = require(path.join(ROOT, 'engines', 'huisclos.js'));

// la solution, pas à pas : [geste, ...arguments]
const SOLUTION = {
  ambre: [
    ['act', 'bureau', 'tiroir'], ['act', 'minuteur', 'pile'], ['use', 'pile', 'lampe'], ['use', 'lampeOn', 'tableau'],
    ['code', 'armoire', '1111', 'faux'], ['code', 'armoire', '2479'], ['use', 'grattoir', 'frigo'], ['use', 'lame', 'micro'],
    ['code', 'porteB', '1987'], ['code', 'pc', 'curie'], ['act', 'pc', 'badge'], ['act', 'blouse', 'cle'], ['use', 'cle', 'bureau'],
    ['use', 'tournevis', 'caisse'], ['use', 'fusible', 'fusibles'], ['code', 'fusibles', '2', 'faux'], ['code', 'fusibles', '4'],
    ['use', 'lampeOn', 'affiche'], ['code', 'classeur', '6854'], ['use', 'badge', 'porteC'], ['use', 'seringue', 'doseur'],
    ['code', 'doseur', '324'], ['use', 'stabilisateur', 'chambre', 'refus'], ['use', 'tube', 'chambre'], ['use', 'stabilisateur', 'chambre'],
  ],
};

(async () => {
  const data = await HC.load(0);
  let fail = 0;
  const check = (c, msg) => { if (!c) { fail++; console.log('  ÉCHEC :', msg); } };
  for (const sc of data.scenarios) {
    for (const n of [1, 2, 3, 6]) {
      const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'J' + i, online: true }));
      const room = HC.create({ hostId: 'p0', players, scenario: sc.id });
      const docs = room.players.map(p => p.docs.length);
      check(docs.reduce((a, b) => a + b, 0) === sc.docs.length, `${n} joueurs : tous les documents distribués`);
      HC.act(room, 'p0', { t: 'hc:go' });
      const codes = Object.values(sc.locks).map(l => l.code).filter(c => c.length > 1);
      for (const [i, [g, a, b, c, want]] of SOLUTION[sc.id].entries()) {
        const pid = 'p' + (i % n), before = room.seq, wrong = room.wrong, flags = Object.keys(room.flags).length;
        if (g === 'act') HC.act(room, pid, { t: 'hc:act', spot: a, a: b });
        if (g === 'use') HC.act(room, pid, { t: 'hc:use', item: a, on: b });
        if (g === 'code') HC.act(room, pid, { t: 'hc:code', spot: a, code: b });
        const tag = `${sc.id} à ${n}, étape ${i + 1} (${g} ${a} ${b})`;
        if ((g === 'code' && c === 'faux')) check(room.wrong === wrong + 1, tag + ' : erreur comptée');
        else if (g === 'use' && c === 'refus') check(Object.keys(room.flags).length === flags, tag + ' : refusé');
        else check(Object.keys(room.flags).length > flags, tag + ' : aucun effet');
        // aucun code dans aucune vue
        for (const p of room.players) { const v = JSON.stringify(HC.view(room, p.id)); for (const k of codes) check(!v.includes(`"${k}"`) && !v.includes(`:${k}`), `${tag} : le code ${k} fuit`); }
      }
      check(room.phase === 'over' && room.result.win, `${sc.id} à ${n} : partie gagnée`);
      // un indice et une vue de fin
      console.log(`${sc.id}, ${n} joueur${n > 1 ? 's' : ''} : ${room.phase}, ${room.result?.stars} étoile(s), ${room.wrong} erreurs, documents ${docs.join('/')}`);
    }
    // les indices : une étape ouverte, deux niveaux
    const room = HC.create({ hostId: 'p0', players: [{ id: 'p0', name: 'A' }], scenario: sc.id });
    HC.act(room, 'p0', { t: 'hc:go' });
    const st = HC.view(room, 'p0').steps[0];
    HC.act(room, 'p0', { t: 'hc:hint', step: st.id }); HC.act(room, 'p0', { t: 'hc:hint', step: st.id }); HC.act(room, 'p0', { t: 'hc:hint', step: st.id });
    check(room.hints === st.max, 'indices plafonnés');
    // le temps : une partie qui expire
    room.endAt = Date.now() - 1; HC.tick(room);
    check(room.phase === 'over' && !room.result.win, 'chrono écoulé');
  }
  console.log(fail ? `${fail} échec(s)` : 'OK');
  process.exit(fail ? 1 : 0);
})();
