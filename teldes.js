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

// ============================================================ écran
// Les éléments de saisie (champ de texte, feuille de dessin) sont gardés d'un rendu à l'autre : l'écran
// se redessine à chaque envoi d'un autre joueur, mais ton brouillon et ton dessin restent en place.
let tdKey = null, tdInput = null, tdPad = null, tdSent = false, tdClock = null, tdSeenItems = 0;
const tdNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];

function renderTelDes(v) {
  if (!v) return;
  const root = $('#td-main');
  const stepKey = v.phase + ':' + v.step;
  if (stepKey !== tdKey) {
    tdKey = stepKey; tdSent = false;
    tdInput = null; tdPad = null;
    if (v.phase === 'write' || v.phase === 'guess') { tdInput = el('input'); tdInput.type = 'text'; tdInput.maxLength = 90; tdInput.autocomplete = 'off'; tdInput.className = 'td-input'; tdInput.placeholder = v.phase === 'write' ? 'Une phrase à dessiner' : 'Ce que tu vois'; tdInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); tdSend(); } }; }
    if (v.phase === 'draw') tdPad = toilePad();
  }
  const hadFocus = tdInput && document.activeElement === tdInput;
  root.innerHTML = ''; clearInterval(tdClock);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const say = list => list[v.step % list.length];
  const playing = ['write', 'draw', 'guess'].includes(v.phase), t = v.task;

  // ligne d'info, avec le chrono qui tourne
  const meta = el('p', 'mj-meta');
  root.appendChild(meta);
  const t0 = Date.now();
  const paint = () => {
    if (!playing) { meta.textContent = v.phase === 'reveal' ? `Carnet ${v.reveal.c + 1} sur ${v.reveal.n}` : 'Partie terminée'; return; }
    const s = Math.max(0, Math.ceil((v.left - (Date.now() - t0)) / 1000));
    meta.textContent = `Étape ${v.step + 1} sur ${v.steps} · ${v.lastCall ? 'on ramasse' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}`;
  };
  paint(); if (playing) tdClock = setInterval(paint, 1000);

  // dernière chance : le temps est écoulé, on envoie ce qu'on a
  if (playing && t && !t.submitted && v.lastCall && !tdSent) tdSend(true);

  let title = '', line = '';
  if (playing && !v.inGame) { title = 'La partie tourne.'; line = 'Tu regardes celle-ci, tu joueras à la prochaine.'; }
  else if (playing && t?.submitted) { title = 'C’est envoyé.'; line = v.waiting.length ? `Plus que ${esc(tdNames(v.waiting))}.` : 'On passe les carnets.'; }
  else if (v.phase === 'write') { title = 'Écris une phrase.'; line = say(['Un truc à dessiner. Plus c’est absurde, mieux c’est.', 'Pense au pauvre voisin qui devra la dessiner. Ou pas.']); }
  else if (v.phase === 'draw') { title = 'Dessine ça.'; line = say(['Pas de lettres, pas de chiffres. Juste ton talent.', 'Personne ne juge. Enfin, un peu.', 'Fais simple, fais gros.']); }
  else if (v.phase === 'guess') { title = 'Qu’est-ce que c’est ?'; line = say(['Décris ce dessin en une phrase.', 'Écris ce que tu vois. Même si ça ne ressemble à rien.']); }
  else if (v.phase === 'reveal') { title = `Le carnet de ${esc(v.reveal.owner)}.`; line = v.isHost ? 'Fais défiler, et lis à voix haute.' : 'L’hôte fait défiler. Un cœur pour les meilleurs moments.'; }
  else if (v.phase === 'over') { const r = v.ranking || []; title = r[0]?.hearts ? `${esc(r[0].name)} rafle les cœurs.` : 'Tous les carnets sont lus.'; line = r[0]?.hearts ? 'Le public a tranché.' : 'Personne n’a donné de cœur. Dur public.'; }
  if (playing && v.lastCall && !t?.submitted) line = 'Le temps est écoulé, on ramasse les copies.';
  const status = el('div', 'mj-status', `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`);
  if (playing) { const done = v.players.filter(p => p.done).length, tot = v.players.filter(p => p.online).length; status.appendChild(el('div', 'mj-prog', `${v.players.filter(p => p.online).map(p => `<i${p.done ? ' class="f"' : ''}></i>`).join('')}<span>${done} sur ${tot}</span>`)); }
  root.appendChild(status);

  const zone = el('div', 'td-zone');
  if (playing && t && !t.submitted && v.inGame) {
    if (t.prompt) {
      if (t.prompt.kind === 'text') zone.appendChild(el('p', 'td-prompt', t.prompt.data ? `« ${esc(t.prompt.data)} »` : '<i>Une page vide. Invente !</i>'));
      else zone.appendChild(el('div', 'td-imgbox', t.prompt.data ? `<img src="${t.prompt.data}" alt="Le dessin à décrire">` : '<p>Une feuille blanche. Invente !</p>'));
    }
    if (tdInput) {
      zone.appendChild(tdInput);
      const row = el('div', 'td-row');
      if (v.phase === 'write') row.appendChild(btn('ghost', 'Inspire-moi', () => { tdInput.value = TD_PHRASES[Math.floor(Math.random() * TD_PHRASES.length)]; tdInput.focus(); }));
      row.appendChild(btn('primary', 'Envoyer', () => tdSend()));
      zone.appendChild(row);
      if (hadFocus) setTimeout(() => { tdInput.focus(); }, 0);
    }
    if (tdPad) {
      zone.appendChild(tdPad.el);
      zone.appendChild(btn('primary lg', 'Envoyer mon dessin', () => tdSend()));
    }
  }

  if (v.phase === 'reveal' && v.reveal) {
    const list = el('div', 'td-book');
    v.reveal.items.forEach(it => {
      const row = el('div', 'td-page' + (it.kind === 'img' ? ' img' : ''));
      const who = it.kind === 'img' ? `${esc(it.by)} a dessiné` : it.i === 0 ? `${esc(it.by)} a écrit` : `${esc(it.by)} a compris`;
      const body = it.kind === 'img'
        ? (it.data ? `<img src="${it.data}" alt="Dessin de ${esc(it.by)}">` : '<p class="td-blank">Une feuille blanche.</p>')
        : `<p class="td-text">${it.data ? esc(it.data) : '<i>Rien écrit.</i>'}</p>`;
      row.innerHTML = `<span class="td-who">${who}</span>${body}`;
      const h = el(it.mine ? 'span' : 'button', 'td-heart' + (it.hearted ? ' on' : ''), `<span aria-hidden="true">♥</span> ${it.hearts || ''}`);
      if (!it.mine) { h.type = 'button'; h.setAttribute('aria-label', it.hearted ? 'Retirer mon cœur' : 'Donner un cœur'); h.onclick = () => act({ t: 'td:heart', c: it.c, i: it.i }); }
      else h.setAttribute('aria-label', `${it.hearts} cœur${it.hearts > 1 ? 's' : ''}`);
      row.appendChild(h);
      list.appendChild(row);
    });
    zone.appendChild(list);
    if (v.isHost) zone.appendChild(btn('primary lg', !v.reveal.last ? 'Page suivante' : !v.reveal.lastChain ? 'Carnet suivant' : 'Voir les cœurs', () => act({ t: 'td:next' })));
    const count = v.reveal.c * 100 + v.reveal.items.length;
    if (count !== tdSeenItems) { tdSeenItems = count; setTimeout(() => list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60); }
  }
  if (v.phase === 'over') {
    zone.appendChild(el('ol', 'mj-list td-rank', (v.ranking || []).map(r => `<li class="mj-row"><span>${esc(r.name)}</span><b>♥ ${r.hearts}</b></li>`).join('')));
    if (v.isHost) { const row = el('div', 'td-row'); row.append(btn('primary', 'Rejouer', () => act({ t: 'td:again' })), btn('', 'Retour au salon', () => act({ t: 'restart' }))); zone.appendChild(row); }
  }
  if (v.isHost && playing && !v.lastCall) zone.appendChild(btn('ghost small', 'Quelqu’un traîne ? Ramasser les copies', () => act({ t: 'td:skip' })));
  root.appendChild(zone);

  // la table (colonne de droite sur PC)
  const side = el('div', 'td-players');
  side.appendChild(el('span', 'mj-side-title', v.phase === 'over' || v.phase === 'reveal' ? 'Les cœurs' : 'À la table'));
  v.players.forEach(p => side.appendChild(el('div', 'td-player' + (p.me ? ' me' : '') + (p.online ? '' : ' off'),
    `<span>${p.bot ? '🤖 ' : ''}${esc(p.name)}</span><i>${playing ? (p.done ? 'a fini' : '') : `♥ ${p.hearts}`}</i>`)));
  root.appendChild(side);
  if (v.log.length) { const lg = el('ul', 'td-log'); v.log.slice().reverse().forEach(x => lg.appendChild(el('li', '', esc(x)))); root.appendChild(lg); }
}

function tdSend(auto) {
  const v = view?.td; if (!v || !v.task || v.task.submitted || tdSent) return;
  let data;
  if (v.phase === 'draw') {
    if (!tdPad) return;
    if (tdPad.isEmpty() && !auto) { toast('Dessine quelque chose avant d’envoyer'); return; }
    data = tdPad.isEmpty() ? null : tdPad.toJPEG();
  } else {
    data = (tdInput?.value || '').trim();
    if (!data && !auto) { toast(v.phase === 'write' ? 'Écris une phrase, ou touche « Inspire-moi »' : 'Écris ce que tu vois'); return; }
  }
  tdSent = true;
  act({ t: 'td:submit', data });
}
