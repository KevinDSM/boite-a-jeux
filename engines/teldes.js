/* Téléphone dessiné — le téléphone arabe, en dessins.

   Chacun écrit une phrase. Elle passe au voisin, qui la dessine ; le suivant regarde le dessin et
   écrit ce qu'il croit y voir ; le suivant dessine cette phrase-là, et ainsi de suite. Chaque carnet
   fait le tour de la table. À la fin, on déroule les carnets un par un et on donne des cœurs aux
   meilleurs moments.
   Carnet c (commencé par order[c]) : à l'étape s, il est entre les mains de order[(c + s) % n].
   Les dessins voyagent en JPEG (toilePad), les textes tels quels. Seul le carnet en cours de lecture
   est envoyé à tout le monde.
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.td), actions « td:… ».
   Chargé après app.js et toile.js : réutilise $, el, act, esc, toast, shuffle, net et view. */

'use strict';



const TD_PHRASES = [
  'Un chat qui fait du ski', 'Un pingouin en réunion', 'Une pizza qui a peur du four', 'Mamie en skateboard', 'Un dragon allergique au feu',
  'Un fantôme qui fait sa lessive', 'Une vache sur la Lune', 'Le Père Noël en vacances à la plage', 'Un robot qui pleure devant un film', 'Un escargot très pressé',
  'Une girafe dans un ascenseur', 'Un requin végétarien', 'Napoléon au karaoké', 'Un cactus qui fait des câlins', 'Une licorne coincée dans les bouchons',
  'Un poulet qui passe son permis', 'Un vampire chez le dentiste', 'La tour Eiffel qui danse', 'Un hamster à la salle de sport', 'Un bébé qui dirige une réunion',
  'Un ours qui fait du yoga', 'Une banane en costume', 'Un pirate qui a le mal de mer', 'Un chien qui promène son maître', 'Une sirène dans une baignoire',
  'Un astronaute qui a oublié ses clés', 'Une tortue qui gagne le marathon', 'Un zombie au buffet à volonté', 'Un sandwich qui se cache', 'Un nuage qui pleure sur une seule personne',
  'Un koala qui ne veut pas se lever', 'Une sorcière en trottinette', 'Un gâteau d’anniversaire qui explose', 'Un poisson qui fait du vélo', 'Un chevalier qui a peur d’une souris',
  'Un volcan qui éternue', 'Une grand-mère qui fait du parkour', 'Un dinosaure au supermarché', 'Un selfie avec un yéti', 'Un mouton qui compte les humains',
  'Une baleine dans un aquarium trop petit', 'Un magicien qui rate son tour', 'Un cowboy sur un canard', 'Une plante qui arrose son jardinier', 'Un facteur poursuivi par des lettres',
  'Un roi qui a perdu sa couronne', 'Un lapin qui sort d’un chapeau et s’enfuit', 'Un éléphant sur un fil', 'Une fourmi qui porte une pastèque', 'Un pompier qui a peur du feu',
  'Un extraterrestre qui demande son chemin', 'Un crocodile chez le coiffeur', 'Une chaussette orpheline', 'Un frigo plein de secrets', 'Un tracteur à la plage',
  'Un chat qui juge son humain', 'Un croissant qui fait du surf', 'Un clown triste un lundi matin', 'Une momie qui se déroule', 'Un paresseux qui fait du sprint',
  'Un bonhomme de neige en plein été', 'Un canapé qui mange les télécommandes', 'Un pigeon qui vole un sandwich', 'Une poule qui pond un œuf de Pâques', 'Un ninja maladroit',
  'Un hérisson qui fait des câlins', 'Un avion en papier géant', 'Un gorille qui fait la vaisselle', 'Une chauve-souris qui a peur du noir', 'Un pingouin qui prend le soleil',
  'Une famille de patates', 'Un loup déguisé en mouton', 'Un chef cuisinier qui brûle l’eau', 'Une abeille qui fait grève', 'Un château de sable envahi par des crabes',
  'Un super-héros qui a oublié sa cape', 'Un mammouth dans le métro', 'Une tasse de café qui court', 'Un perroquet qui répète un secret', 'Un vélo à dix roues',
];
const TD_GUESSES = ['Un truc qui court après un autre truc', 'Une maison qui a faim', 'Un animal en colère', 'Un monsieur content', 'Une fête qui tourne mal',
  'Un chat, je crois', 'Quelqu’un qui tombe', 'Un gâteau très moche', 'Une voiture qui vole', 'Deux amis au soleil', 'Un monstre gentil', 'Un poisson perdu'];

const TelDes = (() => {
  const TIMES = { relax: { write: 90, draw: 150, guess: 70 }, normal: { write: 60, draw: 100, guess: 45 }, rapide: { write: 40, draw: 60, guess: 30 } };
  const GRACE = 4000;
  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };
  const kindOf = s => s === 0 ? 'write' : s % 2 ? 'draw' : 'guess';
  const idx = (room, id) => room.order.indexOf(id);
  const chainFor = (room, id, s = room.step) => (idx(room, id) - s + room.order.length * 4) % room.order.length;
  const expected = room => room.order.filter(id => pl(room, id)?.online);

  function create({ hostId, players, speed, length }) {
    const room = {
      hostId, speed: TIMES[speed] ? speed : 'normal', length: length === 'court' ? 'court' : 'complet',
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot })),
      log: [], seq: 0,
    };
    newGame(room);
    return room;
  }
  function newGame(room) {
    room.order = shuffle(room.players.filter(p => p.online).map(p => p.id));
    const n = room.order.length;
    room.steps = Math.max(2, room.length === 'court' ? Math.min(n, 5) : n);
    room.chains = room.order.map(id => ({ owner: id, items: [] }));
    room.hearts = {}; room.rv = { c: 0, i: 0 };
    room.log = []; log(room, `Nouvelle partie : ${n} carnets, ${room.steps} étapes.`);
    startStep(room, 0);
  }
  function startStep(room, s) {
    room.step = s; room.phase = kindOf(s); room.subs = {}; room.lastCall = false; room.lastCallAt = 0;
    room.deadline = Date.now() + TIMES[room.speed][room.phase] * 1000;
    room.botDue = {}; room.order.forEach(id => { if (pl(room, id)?.bot) room.botDue[id] = Date.now() + 2500 + Math.random() * (room.phase === 'draw' ? 7000 : 4500); });
    room.turnAt = Date.now(); room.seq += 1;
  }
  function finishStep(room) {
    const kind = room.phase === 'draw' ? 'img' : 'text';
    room.order.forEach(id => {
      const c = chainFor(room, id), d = room.subs[id];
      room.chains[c].items.push({ by: id, kind, data: d === undefined ? null : d });
    });
    if (room.step + 1 >= room.steps) {
      room.phase = 'reveal'; room.rv = { c: 0, i: 0 }; room.turnAt = Date.now(); room.seq += 1;
      log(room, 'Tous les carnets sont pleins. On les ouvre.');
      return;
    }
    startStep(room, room.step + 1);
  }
  function checkDone(room) {
    if (!['write', 'draw', 'guess'].includes(room.phase)) return;
    if (expected(room).every(id => room.subs[id] !== undefined)) finishStep(room);
  }
  function submit(room, pid, data) {
    if (!['write', 'draw', 'guess'].includes(room.phase) || idx(room, pid) < 0 || room.subs[pid] !== undefined) return null;
    if (room.phase === 'draw') {
      if (data !== null && (typeof data !== 'string' || !data.startsWith('data:image/') || data.length > 700000)) return 'Ce dessin ne passe pas, réessaie';
    } else data = String(data || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    room.subs[pid] = data; room.seq += 1;
    checkDone(room);
    return null;
  }
  function next(room, pid) {
    if (pid !== room.hostId || room.phase !== 'reveal') return null;
    const ch = room.chains[room.rv.c];
    if (room.rv.i < ch.items.length - 1) room.rv.i += 1;
    else if (room.rv.c < room.chains.length - 1) room.rv = { c: room.rv.c + 1, i: 0 };
    else { room.phase = 'over'; log(room, 'Tous les carnets sont lus.'); }
    room.seq += 1; return null;
  }
  function heart(room, pid, c, i) {
    if (room.phase !== 'reveal' && room.phase !== 'over') return null;
    const it = room.chains[c]?.items[i]; if (!it || it.by === pid || !pl(room, pid)) return null;
    if (room.phase === 'reveal' && (c > room.rv.c || (c === room.rv.c && i > room.rv.i))) return null;
    const k = `${c}-${i}`, list = room.hearts[k] || (room.hearts[k] = []);
    const at = list.indexOf(pid); if (at >= 0) list.splice(at, 1); else list.push(pid);
    room.seq += 1; return null;
  }
  const heartsOf = (room, id) => room.chains.reduce((a, ch, c) => a + ch.items.reduce((b, it, i) => b + (it.by === id ? (room.hearts[`${c}-${i}`] || []).length : 0), 0), 0);
  const ranking = room => room.order.map(id => ({ id, name: pl(room, id)?.name || '?', hearts: heartsOf(room, id) })).sort((a, b) => b.hearts - a.hearts);

  // ------------------------------------------------------------ robots
  function botDrawing(text) {
    const W = 800, H = 600, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    let seed = [...String(text || 'x')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const cols = ['#1f2430', '#e5484d', '#3e63dd', '#2fa96b', '#f97316', '#8e4ec6'];
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.fillStyle = cols[1 + Math.floor(rnd() * 5)]; g.beginPath(); g.arc(250 + rnd() * 300, 220 + rnd() * 160, 60 + rnd() * 90, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = cols[Math.floor(rnd() * cols.length)]; g.lineWidth = 6 + rnd() * 14; g.beginPath();
      let x = 100 + rnd() * 600, y = 100 + rnd() * 400; g.moveTo(x, y);
      for (let j = 0; j < 14; j++) { x = Math.max(20, Math.min(W - 20, x + (rnd() - .5) * 140)); y = Math.max(20, Math.min(H - 20, y + (rnd() - .5) * 120)); g.lineTo(x, y); }
      g.stroke();
    }
    return cv.toDataURL('image/jpeg', 0.6);
  }
  function tick(room) {
    const now = Date.now();
    if (!['write', 'draw', 'guess'].includes(room.phase)) return false;
    for (const id of room.order) {
      const p = pl(room, id);
      if (p?.bot && room.subs[id] === undefined && room.botDue[id] && now >= room.botDue[id]) {
        const c = chainFor(room, id), prev = room.chains[c].items[room.step - 1];
        const pickFrom = list => list[Math.floor(Math.random() * list.length)];
        const data = room.phase === 'draw' ? botDrawing(prev?.data) : room.phase === 'write' ? pickFrom(TD_PHRASES) : pickFrom(Math.random() < .5 ? TD_GUESSES : TD_PHRASES);
        submit(room, id, data); return true;
      }
    }
    if (!room.lastCall && now >= room.deadline) { room.lastCall = true; room.lastCallAt = now; room.seq += 1; return true; }
    if (room.lastCall && now >= room.lastCallAt + GRACE) { finishStep(room); return true; }
    return false;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'td:submit': return submit(room, pid, m.data);
      case 'td:next': return next(room, pid);
      case 'td:heart': return heart(room, pid, +m.c, +m.i);
      case 'td:skip': if (pid === room.hostId && ['write', 'draw', 'guess'].includes(room.phase)) { room.lastCall = true; room.lastCallAt = Date.now(); room.seq += 1; } return null;
      case 'td:again': if (pid === room.hostId && room.phase === 'over') newGame(room); return null;
    }
    return null;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, bot: false });           // regarde, jouera à la prochaine partie
  }
  function setOnline(room, id, on) { const p = pl(room, id); if (!p) return; p.online = on; if (!on) checkDone(room); }

  function view(room, pid) {
    const inGame = idx(room, pid) >= 0, playing = ['write', 'draw', 'guess'].includes(room.phase);
    const name = id => pl(room, id)?.name || '?';
    let task = null;
    if (playing && inGame) {
      const c = chainFor(room, pid), prev = room.chains[c].items[room.step - 1];
      task = { prompt: prev ? { kind: prev.kind, data: prev.data, by: name(prev.by) } : null, submitted: room.subs[pid] !== undefined };
    }
    let reveal = null;
    if (room.phase === 'reveal') {
      const c = room.rv.c, ch = room.chains[c];
      reveal = { c, n: room.chains.length, owner: name(ch.owner), last: room.rv.i >= ch.items.length - 1, lastChain: c >= room.chains.length - 1,
        items: ch.items.slice(0, room.rv.i + 1).map((it, i) => ({ c, i, by: name(it.by), mine: it.by === pid, kind: it.kind, data: it.data, hearts: (room.hearts[`${c}-${i}`] || []).length, hearted: (room.hearts[`${c}-${i}`] || []).includes(pid) })) };
    }
    return {
      phase: room.phase, step: room.step, steps: room.steps, isHost: pid === room.hostId, seq: room.seq, inGame,
      left: playing ? Math.max(0, room.deadline - Date.now()) : 0, lastCall: room.lastCall, task,
      players: room.order.map(id => ({ id, name: name(id), bot: !!pl(room, id)?.bot, online: !!pl(room, id)?.online, me: id === pid, done: playing && room.subs[id] !== undefined, hearts: heartsOf(room, id) })),
      waiting: playing ? expected(room).filter(id => room.subs[id] === undefined).map(name) : [],
      reveal, ranking: room.phase === 'over' ? ranking(room) : null,
      log: room.log.slice(-3),
    };
  }
  return { create, act, tick, join, setOnline, view, ranking };
})();
