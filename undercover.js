/* Undercover — chacun reçoit un mot secret, un ou plusieurs intrus ont un mot voisin,
   Mister White n'en a pas. Indices à voix haute, vote sur le téléphone.

   Même modèle que Sablier : la salle vit chez l'hôte (net.game.uc), chaque joueur reçoit
   une vue filtrée (Undercover.view) où seul SON mot apparaît. Les actions arrivent en
   messages « uc:… » et passent par Undercover.act. Chargé après app.js et sablier-ui.js :
   réutilise $, el, act, esc, norm et shuffle. */

'use strict';

const Undercover = (() => {
  // Paires de mots voisins : assez proches pour que l'intrus ne se doute de rien,
  // assez différents pour que ses indices finissent par détonner.
  const PAIRS = [
    ['Café', 'Thé'], ['Plage', 'Piscine'], ['Pizza', 'Quiche'], ['Chat', 'Lapin'], ['Train', 'Métro'],
    ['Avion', 'Hélicoptère'], ['Vélo', 'Trottinette'], ['Ski', 'Snowboard'], ['Football', 'Rugby'], ['Tennis', 'Badminton'],
    ['Guitare', 'Violon'], ['Piano', 'Accordéon'], ['Lune', 'Soleil'], ['Mer', 'Lac'], ['Montagne', 'Colline'],
    ['Forêt', 'Jungle'], ['Désert', 'Savane'], ['Neige', 'Grêle'], ['Orage', 'Tempête'], ['Pluie', 'Brouillard'],
    ['Pomme', 'Poire'], ['Orange', 'Mandarine'], ['Fraise', 'Framboise'], ['Citron', 'Pamplemousse'], ['Banane', 'Mangue'],
    ['Carotte', 'Radis'], ['Tomate', 'Poivron'], ['Pâtes', 'Riz'], ['Frites', 'Chips'], ['Burger', 'Kebab'],
    ['Sushi', 'Maki'], ['Croissant', 'Pain au chocolat'], ['Crêpe', 'Gaufre'], ['Glace', 'Sorbet'], ['Chocolat', 'Caramel'],
    ['Fromage', 'Beurre'], ['Vin', 'Champagne'], ['Bière', 'Cidre'], ['Jus d\'orange', 'Limonade'], ['Lait', 'Yaourt'],
    ['Médecin', 'Infirmier'], ['Pompier', 'Policier'], ['Boulanger', 'Pâtissier'], ['Professeur', 'Directeur'], ['Pilote', 'Hôtesse de l\'air'],
    ['Cuisinier', 'Serveur'], ['Coiffeur', 'Barbier'], ['Avocat', 'Juge'], ['Plombier', 'Électricien'], ['Facteur', 'Livreur'],
    ['Château', 'Palais'], ['Église', 'Cathédrale'], ['Hôpital', 'Clinique'], ['Musée', 'Galerie'], ['Cinéma', 'Théâtre'],
    ['Bibliothèque', 'Librairie'], ['Supermarché', 'Marché'], ['Restaurant', 'Cantine'], ['Hôtel', 'Camping'], ['Aéroport', 'Gare'],
    ['Stylo', 'Crayon'], ['Cahier', 'Carnet'], ['Ciseaux', 'Cutter'], ['Téléphone', 'Tablette'], ['Ordinateur', 'Télévision'],
    ['Clavier', 'Souris'], ['Montre', 'Réveil'], ['Lunettes', 'Lentilles'], ['Parapluie', 'Imperméable'], ['Chapeau', 'Casquette'],
    ['Écharpe', 'Cravate'], ['Chaussettes', 'Collants'], ['Baskets', 'Sandales'], ['Jean', 'Short'], ['Pull', 'Sweat'],
    ['Lit', 'Canapé'], ['Chaise', 'Tabouret'], ['Table', 'Bureau'], ['Lampe', 'Bougie'], ['Miroir', 'Fenêtre'],
    ['Douche', 'Baignoire'], ['Brosse à dents', 'Peigne'], ['Savon', 'Shampoing'], ['Four', 'Micro-ondes'], ['Frigo', 'Congélateur'],
    ['Fourchette', 'Cuillère'], ['Assiette', 'Bol'], ['Verre', 'Tasse'], ['Casserole', 'Poêle'], ['Couteau', 'Épée'],
    ['Lion', 'Tigre'], ['Loup', 'Renard'], ['Ours', 'Panda'], ['Dauphin', 'Requin'], ['Baleine', 'Orque'],
    ['Aigle', 'Faucon'], ['Pingouin', 'Manchot'], ['Abeille', 'Guêpe'], ['Papillon', 'Libellule'], ['Serpent', 'Lézard'],
    ['Cheval', 'Âne'], ['Vache', 'Mouton'], ['Poule', 'Canard'], ['Hamster', "Cochon d'Inde"], ['Grenouille', 'Crapaud'],
    ['Noël', 'Nouvel An'], ['Anniversaire', 'Mariage'], ['Halloween', 'Carnaval'], ['Pâques', 'Chandeleur'], ['Vacances', 'Week-end'],
    ['Harry Potter', 'Le Seigneur des anneaux'], ['Star Wars', 'Star Trek'], ['Batman', 'Superman'], ['Spider-Man', 'Iron Man'], ['Mario', 'Sonic'],
    ['Pokémon', 'Digimon'], ['Astérix', 'Tintin'], ['Blanche-Neige', 'Cendrillon'], ['Le Roi Lion', 'Le Livre de la jungle'], ['Titanic', 'Avatar'],
    ['Netflix', 'YouTube'], ['Instagram', 'TikTok'], ['WhatsApp', 'SMS'], ['Google', 'Wikipédia'], ['Spotify', 'Radio'],
    ['Paris', 'Londres'], ['New York', 'Los Angeles'], ['Rome', 'Venise'], ['Espagne', 'Portugal'], ['Japon', 'Chine'],
    ['Tour Eiffel', 'Arc de triomphe'], ['Pyramides', 'Sphinx'], ['Volcan', 'Geyser'], ['Île', 'Presqu\'île'], ['Rivière', 'Cascade'],
    ['Roi', 'Président'], ['Prince', 'Chevalier'], ['Pirate', 'Viking'], ['Sorcière', 'Fée'], ['Vampire', 'Zombie'],
    ['Fantôme', 'Squelette'], ['Dragon', 'Licorne'], ['Robot', 'Extraterrestre'], ['Ninja', 'Samouraï'], ['Cowboy', 'Shérif'],
    ['Échecs', 'Dames'], ['Cartes', 'Dés'], ['Puzzle', 'Lego'], ['Poupée', 'Peluche'], ['Ballon', 'Frisbee'],
    ['Bateau', 'Sous-marin'], ['Voiture', 'Camion'], ['Moto', 'Scooter'], ['Bus', 'Tramway'], ['Fusée', 'Satellite'],
    ['Réunion', 'Visio'], ['Tableur', 'Présentation'], ['Email', 'Courrier'], ['Imprimante', 'Scanner'], ['Pause café', 'Pause déjeuner'],
    ['Karaoké', 'Boîte de nuit'], ['Concert', 'Festival'], ['Pique-nique', 'Barbecue'], ['Zoo', 'Aquarium'], ['Parc d\'attractions', 'Fête foraine'],
    ['Yoga', 'Pilates'], ['Natation', 'Plongée'], ['Boxe', 'Judo'], ['Course à pied', 'Marche'], ['Escalade', 'Randonnée'],
    ['Miel', 'Confiture'], ['Sel', 'Poivre'], ['Ketchup', 'Moutarde'], ['Popcorn', 'Barbe à papa'], ['Bonbon', 'Chewing-gum'],
  ];
  const POINTS = { civil: 2, undercover: 10, white: 6 }, WHITE_BONUS = 5;   // bonus de Mister White qui devine le mot
  const ROLE_NAME = { civil: 'Civil', undercover: 'Undercover', white: 'Mister White' };
  const HIST_KEY = 'uc-vues';

  const hist = {
    get() { try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; } },
    add(i) { try { const h = hist.get().filter(x => x !== i); h.push(i); localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-Math.floor(PAIRS.length * 0.8)))); } catch { } },
  };
  const pick = a => a[Math.random() * a.length | 0];

  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  /** La réponse de Mister White : accents, majuscules, pluriel et une faute de frappe tolérés. */
  function sameWord(guess, word) {
    const g = norm(guess).replace(/s$/, ''), w = norm(word).replace(/s$/, '');
    if (!g) return false;
    return g === w || (w.length >= 6 && lev(g, w) <= 1);
  }

  /** Combien d'intrus au total : il faut toujours plus de civils que d'intrus. */
  function impostorPlan(n, wantUc, wantWhite) {
    const max = Math.max(1, Math.floor((n - 1) / 2));
    let uc = wantUc === 'auto' ? (n >= 9 ? 3 : n >= 6 ? 2 : 1) : Math.max(1, +wantUc || 1);
    let white = !!wantWhite;
    if (white && uc + 1 > max) { if (uc > 1) uc -= 1; else white = false; }
    uc = Math.min(uc, max - (white ? 1 : 0));
    return { uc: Math.max(1, uc), white };
  }

  function create({ hostId, players, rounds, undercovers, white }) {
    const room = {
      hostId, rounds: Math.max(1, Math.min(10, +rounds || 3)), round: 0,
      settings: { undercovers: undercovers || 'auto', white: !!white },
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, score: 0 })),
      phase: 'reveal',
    };
    startRound(room);
    return room;
  }

  function startRound(room) {
    const ids = shuffle(room.players.filter(p => p.online).map(p => p.id));
    const plan = impostorPlan(ids.length, room.settings.undercovers, room.settings.white);
    const seen = new Set(hist.get());
    const fresh = PAIRS.map((_, i) => i).filter(i => !seen.has(i));
    const idx = pick(fresh.length ? fresh : PAIRS.map((_, i) => i)); hist.add(idx);
    const pair = Math.random() < 0.5 ? PAIRS[idx] : [PAIRS[idx][1], PAIRS[idx][0]];
    room.round += 1;
    room.pair = { civil: pair[0], undercover: pair[1] };
    room.plan = plan;
    room.roles = {};
    ids.forEach((id, i) => {
      const role = i < plan.uc ? 'undercover' : (plan.white && i === plan.uc) ? 'white' : 'civil';
      room.roles[id] = { role, word: role === 'white' ? null : room.pair[role], alive: true, ready: false, gain: 0 };
    });
    room.inRound = shuffle(ids.slice());   // ordre d'affichage, sans trahir les rôles
    room.tour = 0; room.order = []; room.speaker = 0;
    room.votes = {}; room.candidates = null; room.tie = false;
    room.lastElim = null; room.whiteTry = null; room.result = null; room.clues = {};
    room.phase = 'reveal';
  }

  const alive = room => room.inRound.filter(id => room.roles[id].alive);
  const isOnline = (room, id) => !!room.players.find(p => p.id === id && p.online);
  const nameOf = (room, id) => (room.players.find(p => p.id === id) || {}).name || '?';

  function beginClues(room) {
    room.tour += 1;
    const order = shuffle(alive(room));
    // Mister White ne commence jamais : il n'aurait rien entendu.
    if (order.length > 1 && room.roles[order[0]].role === 'white') { const w = order.shift(); order.splice(1 + (Math.random() * (order.length - 1) | 0), 0, w); }
    room.order = order; room.speaker = 0; room.phase = 'clues';
    skipOffline(room);
  }
  function skipOffline(room) {
    while (room.speaker < room.order.length && !isOnline(room, room.order[room.speaker])) room.speaker += 1;
    if (room.speaker >= room.order.length) beginVote(room);
  }
  function beginVote(room) { room.phase = 'vote'; room.votes = {}; room.candidates = null; room.tie = false; }

  const voters = room => alive(room).filter(id => isOnline(room, id));
  function maybeResolve(room) { if (room.phase === 'vote' && voters(room).every(id => room.votes[id])) resolve(room); }

  function resolve(room) {
    const tally = {};
    Object.values(room.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
    const max = Math.max(0, ...Object.values(tally));
    if (!max) return 'Personne n\'a encore voté';
    const top = Object.keys(tally).filter(id => tally[id] === max);
    if (top.length > 1 && !room.candidates) {   // égalité : on revote entre les ex æquo
      room.candidates = top; room.votes = {}; room.tie = true;
      return null;
    }
    eliminate(room, top.length > 1 ? pick(top) : top[0], tally);
    return null;
  }

  function eliminate(room, id, tally) {
    const r = room.roles[id]; r.alive = false;
    room.lastElim = { id, name: nameOf(room, id), role: r.role, tally: Object.entries(tally).map(([t, n]) => ({ name: nameOf(room, t), n })).sort((a, b) => b.n - a.n) };
    room.candidates = null; room.tie = false; room.votes = {};
    if (r.role === 'white') { room.phase = 'white-guess'; return; }
    afterElimination(room);
  }

  function afterElimination(room) {
    const left = alive(room);
    const impostors = left.filter(id => room.roles[id].role !== 'civil').length;
    const civils = left.length - impostors;
    if (impostors === 0) return finishRound(room, 'civils');
    if (civils <= 1) return finishRound(room, 'impostors');
    room.phase = 'elim';
  }

  function finishRound(room, winner) {
    Object.entries(room.roles).forEach(([id, r]) => {
      let gain = 0;
      if (winner === 'civils' && r.role === 'civil') gain = POINTS.civil;
      if (winner === 'impostors' && r.role !== 'civil') gain = POINTS[r.role];
      const p = room.players.find(x => x.id === id); if (p) p.score += gain;
      r.gain = gain + (r.bonus || 0);                     // le bonus a déjà été compté au moment de la réponse
    });
    room.result = { winner };
    room.phase = 'result';
  }

  /** Toutes les actions du jeu. Renvoie un message d'erreur, ou null. */
  function act(room, pid, m) {
    const host = pid === room.hostId, me = room.roles[pid];
    switch (m.t) {
      case 'uc:ready':
        if (room.phase !== 'reveal' || !me) return null;
        me.ready = true;
        if (room.inRound.filter(id => isOnline(room, id)).every(id => room.roles[id].ready)) beginClues(room);
        return null;
      case 'uc:clue': {
        if (room.phase !== 'clues') return null;
        const speaker = room.order[room.speaker];
        if (speaker !== pid && !host) return null;
        const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (text && speaker === pid) (room.clues[pid] = room.clues[pid] || []).push({ tour: room.tour, text });
        room.speaker += 1; skipOffline(room);
        return null;
      }
      case 'uc:vote':
        if (room.phase !== 'vote' || !me || !me.alive) return null;
        if (m.target === pid) return 'Tu ne peux pas voter contre toi';
        if (!room.roles[m.target]?.alive) return null;
        if (room.candidates && !room.candidates.includes(m.target)) return 'Vote seulement entre les ex æquo';
        room.votes[pid] = m.target;
        maybeResolve(room);
        return null;
      case 'uc:white-guess': {
        if (room.phase !== 'white-guess' || room.lastElim?.id !== pid) return null;
        const guess = String(m.word || '').slice(0, 40);
        const ok = sameWord(guess, room.pair.civil);
        room.whiteTry = { word: guess, ok, name: nameOf(room, pid) };
        // trouvé : 5 points tout de suite, mais la manche continue (il reste éliminé)
        if (ok) { me.bonus = (me.bonus || 0) + WHITE_BONUS; const p = room.players.find(x => x.id === pid); if (p) p.score += WHITE_BONUS; }
        afterElimination(room);
        return null;
      }
      case 'uc:force':          // l'hôte débloque une étape qui attend un absent
        if (!host) return null;
        if (room.phase === 'reveal') beginClues(room);
        else if (room.phase === 'clues') beginVote(room);
        else if (room.phase === 'vote') return resolve(room);
        else if (room.phase === 'white-guess') { room.whiteTry = { word: '', ok: false }; afterElimination(room); }
        return null;
      case 'uc:continue':
        if (!host || room.phase !== 'elim') return null;
        beginClues(room); return null;
      case 'uc:next':
        if (!host || room.phase !== 'result') return null;
        if (room.round >= room.rounds) room.phase = 'over';
        else if (room.players.filter(p => p.online).length < 3) return 'Il faut au moins trois joueurs connectés';
        else startRound(room);
        return null;
    }
    return null;
  }

  function join(room, id, name) {
    const p = room.players.find(x => x.id === id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, score: 0 });   // jouera à la manche suivante
  }
  function setOnline(room, id, on) {
    const p = room.players.find(x => x.id === id); if (!p) return;
    p.online = on;
    if (on) return;
    if (room.phase === 'reveal' && room.inRound.filter(x => isOnline(room, x)).every(x => room.roles[x].ready)) beginClues(room);
    else if (room.phase === 'clues' && room.order[room.speaker] === id) skipOffline(room);
    else if (room.phase === 'vote') maybeResolve(room);
  }

  /** Vue d'un joueur : son mot à lui, jamais celui des autres avant la fin de la manche. */
  function view(room, pid) {
    const me = room.roles[pid];
    const over = room.phase === 'result' || room.phase === 'over';
    return {
      phase: room.phase, round: room.round, rounds: room.rounds, tour: room.tour,
      isHost: pid === room.hostId,
      plan: room.plan,
      me: me ? { inRound: true, alive: me.alive, ready: me.ready, word: me.word, white: me.role === 'white', vote: room.votes[pid] || null } : { inRound: false },
      players: room.inRound.map(id => {
        const r = room.roles[id];
        return {
          id, name: nameOf(room, id), online: isOnline(room, id), alive: r.alive, ready: r.ready,
          voted: room.phase === 'vote' && !!room.votes[id],
          role: over || !r.alive ? r.role : null,
          word: over ? r.word : null, gain: over ? r.gain : 0,
          clues: ((room.clues || {})[id] || []).map(c => c.text),
        };
      }),
      waiting: room.players.filter(p => !room.inRound.includes(p.id)).map(p => p.name),
      speakerId: room.phase === 'clues' ? room.order[room.speaker] : null,
      order: room.phase === 'clues' ? room.order.map((id, i) => ({ id, name: nameOf(room, id), done: i < room.speaker })) : [],
      candidates: room.candidates, tie: room.tie,
      votedCount: Object.keys(room.votes).length, voterCount: voters(room).length,
      lastElim: room.lastElim, whiteTry: room.whiteTry && (room.phase === 'result' ? room.whiteTry : { ok: room.whiteTry.ok, word: room.whiteTry.word ? '…' : '' }),
      result: room.result, pair: over ? room.pair : null,
      scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })).sort((a, b) => b.score - a.score),
    };
  }

  // les robots : un indice vague tiré d'une liste, des votes au hasard, et Mister White qui tente un mot
  const BOT_HINTS = ['Souvent', 'Pratique', 'Rond', 'Chez soi', 'En été', 'Coloré', 'Petit', 'Célèbre', 'Dehors', 'Ancien', 'Doux', 'Rapide', 'Bruyant', 'Cher', 'Utile', 'Populaire', 'Le matin', 'En famille', 'Classique', 'Moderne', 'Partout', 'Plaisir', 'Fragile', 'Grand', 'Simple', 'Enfance', 'Vacances'];
  const isBot = (room, id) => !!room.players.find(p => p.id === id && p.bot);
  function tick(room) {
    const now = Date.now();
    if (room.botWait && now < room.botWait) return false;
    const wait = () => { room.botWait = now + 1400 + Math.random() * 1800; };
    const any = list => list[Math.random() * list.length | 0];
    if (room.phase === 'reveal') { const b = room.inRound.find(id => isBot(room, id) && !room.roles[id].ready); if (b) { act(room, b, { t: 'uc:ready' }); return true; } }
    if (room.phase === 'clues') {
      const sp = room.order[room.speaker];
      if (sp && isBot(room, sp)) { if (!room.botWait) { wait(); return false; } act(room, sp, { t: 'uc:clue', text: any(BOT_HINTS) }); room.botWait = 0; return true; }
    }
    if (room.phase === 'vote') {
      const b = alive(room).find(id => isBot(room, id) && !room.votes[id]);
      if (b) {
        const opts = (room.candidates || alive(room)).filter(id => id !== b && room.roles[id].alive);
        if (opts.length) { act(room, b, { t: 'uc:vote', target: any(opts) }); wait(); return true; }
      }
    }
    if (room.phase === 'white-guess' && room.lastElim && isBot(room, room.lastElim.id)) { act(room, room.lastElim.id, { t: 'uc:white-guess', word: any(any(PAIRS)) }); return true; }
    return false;
  }
  return { PAIRS, POINTS, ROLE_NAME, create, act, tick, join, setOnline, view, sameWord, impostorPlan };
})();

// ============================================================ écran
let ucPeek = false, ucPeekTimer = null, ucLastRound = null;

function renderUndercover(v) {
  if (!v) return;
  if (v.round !== ucLastRound) { ucLastRound = v.round; ucPeek = false; }
  const root = $('#uc-main'); root.innerHTML = '';
  const me = v.me, host = v.isHost;
  const roleTag = r => `<span class="uc-stamp uc-${r}">${Undercover.ROLE_NAME[r]}</span>`;
  const btn = (cls, label, onclick) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = onclick; return b; };

  root.appendChild(el('div', 'uc-head', `<span class="eyebrow">Manche ${v.round}/${v.rounds}${v.tour ? ` · tour ${v.tour}` : ''}</span><span class="eyebrow">${v.plan.uc} undercover${v.plan.uc > 1 ? 's' : ''}${v.plan.white ? ' · Mister White' : ''}</span>`));

  if (!me.inRound) {
    root.appendChild(el('div', 'uc-file', `<p class="uc-label">En attente</p><p class="uc-big">Tu entres à la prochaine manche</p><p class="fine">Une manche est déjà lancée. Regarde et écoute, tu joueras juste après.</p>`));
  }

  // la fiche secrète : masquée par défaut, pour qu'un voisin ne la lise pas par-dessus l'épaule
  const secretCard = (big) => {
    const card = el('button', 'uc-file uc-secret' + (ucPeek ? ' open' : '') + (big ? '' : ' small'));
    card.type = 'button';
    card.innerHTML = me.white
      ? `<p class="uc-label">Dossier ${ucPeek ? 'ouvert' : 'confidentiel'}</p>${ucPeek ? `<p class="uc-big">Mister White</p><p class="fine">Tu n'as pas de mot. Écoute les indices, fonds-toi dans la masse, et si on te démasque tu pourras deviner le mot des civils.</p>` : '<p class="uc-big">Touche pour ouvrir</p>'}`
      : `<p class="uc-label">Ton mot secret</p><p class="uc-big">${ucPeek ? esc(me.word) : '• • • • •'}</p><p class="fine">${ucPeek ? 'Tu ne sais pas si tu es civil ou undercover.' : 'Touche pour le voir, cache ton écran.'}</p>`;
    card.onclick = () => {
      ucPeek = !ucPeek; clearTimeout(ucPeekTimer);
      if (ucPeek) ucPeekTimer = setTimeout(() => { ucPeek = false; if (view?.uc) renderUndercover(view.uc); }, 6000);
      renderUndercover(view.uc);
    };
    return card;
  };

  const roster = (fn) => {
    const ul = el('ul', 'uc-roster');
    v.players.forEach(p => { const li = el('li', (p.alive ? '' : 'out ') + (p.online ? '' : 'off'), ''); li.innerHTML = fn(p); ul.appendChild(li); });
    return ul;
  };

  // tout ce qui a été dit, rappelé au vote et en fin de manche
  const recap = () => {
    if (!v.players.some(p => p.clues && p.clues.length)) return null;
    const box = el('div', 'uc-recap', '<span class="uc-label">Indices donnés</span>');
    v.players.forEach(p => box.appendChild(el('div', 'uc-recap-row' + (p.alive ? '' : ' out'), `<b>${esc(p.name)}</b><span>${p.clues.length ? p.clues.map(esc).join(' · ') : '—'}</span>`)));
    return box;
  };
  const addRecap = () => { const rc = recap(); if (rc) root.appendChild(rc); };

  if (v.phase === 'reveal' && me.inRound) {
    root.appendChild(el('h2', 'uc-title', 'Découvre ton mot'));
    root.appendChild(secretCard(true));
    if (!me.ready) root.appendChild(btn('primary lg', 'C\'est noté', () => { ucPeek = false; act({ t: 'uc:ready' }); }));
    else root.appendChild(el('p', 'note', 'On attend les autres…'));
    root.appendChild(roster(p => `${esc(p.name)}<span>${p.ready ? '✓ prêt' : '…'}</span>`));
    if (host) root.appendChild(btn('ghost', 'Commencer sans attendre', () => act({ t: 'uc:force' })));
  } else if (v.phase === 'reveal') {
    root.appendChild(roster(p => `${esc(p.name)}<span>${p.ready ? '✓ prêt' : '…'}</span>`));
  }

  if (v.phase === 'clues') {
    const mine = me.inRound && v.speakerId === myId();
    root.appendChild(el('h2', 'uc-title', mine ? 'À toi de donner un indice' : `${esc(v.order.find(o => o.id === v.speakerId)?.name || '')} donne un indice`));
    root.appendChild(el('p', 'fine', 'À voix haute, un mot ou une courte expression. Jamais le mot lui-même. Les autres écoutent et repèrent l\'indice qui détonne.'));
    if (me.inRound && me.alive) root.appendChild(secretCard(false));
    const ol = el('ol', 'uc-order');
    v.order.forEach(o => ol.appendChild(el('li', (o.done ? 'done' : '') + (o.id === v.speakerId ? ' now' : ''), esc(o.name))));
    root.appendChild(ol);
    addRecap();
    if (mine) {
      const f = el('form', 'uc-clue-form', '<input id="uc-clue-in" maxlength="40" autocomplete="off" placeholder="Ton indice, tel que tu le dis"><button class="btn primary" type="submit">Envoyer</button>');
      f.onsubmit = e => { e.preventDefault(); const t = $('#uc-clue-in').value.trim(); if (!t) { toast("Écris ton indice, ou touche « Dit à voix haute »"); return; } act({ t: 'uc:clue', text: t }); };
      root.appendChild(f);
      root.appendChild(btn('ghost', "Dit à voix haute, sans l'écrire", () => act({ t: 'uc:clue' })));
    }
    if (host && !mine) root.appendChild(btn('', 'Joueur suivant', () => act({ t: 'uc:clue' })));
    if (host) root.appendChild(btn('ghost', 'Passer directement au vote', () => act({ t: 'uc:force' })));
  }

  if (v.phase === 'vote') {
    root.appendChild(el('h2', 'uc-title', v.tie ? 'Égalité : on revote' : 'Qui est l\'intrus ?'));
    root.appendChild(el('p', 'fine', v.tie ? 'Seulement entre les ex æquo.' : 'Touche la personne à éliminer. Tu peux changer d\'avis tant que tout le monde n\'a pas voté.'));
    if (me.inRound && me.alive) {
      const grid = el('div', 'uc-vote');
      v.players.filter(p => p.alive && p.id !== myId()).forEach(p => {
        const allowed = !v.candidates || v.candidates.includes(p.id);
        const b = el('button', 'uc-target' + (me.vote === p.id ? ' on' : ''), `<b>${esc(p.name)}</b><span class="uc-said">${p.clues.length ? p.clues.map(esc).join(' · ') : 'aucun indice écrit'}</span><small>${p.voted ? 'a voté' : ''}</small>`);
        b.type = 'button'; b.disabled = !allowed; b.onclick = () => act({ t: 'uc:vote', target: p.id });
        grid.appendChild(b);
      });
      root.appendChild(grid);
    } else root.appendChild(el('p', 'note', me.inRound ? 'Tu es éliminé : tu regardes sans voter.' : 'Vote en cours.'));
    root.appendChild(el('p', 'note', `${v.votedCount} / ${v.voterCount} votes`));
    if (!(me.inRound && me.alive)) addRecap();
    if (host) root.appendChild(btn('ghost', 'Dépouiller maintenant', () => act({ t: 'uc:force' })));
  }

  const elimBlock = () => {
    const e = v.lastElim; if (!e) return;
    root.appendChild(el('div', 'uc-file uc-elim', `<p class="uc-label">Éliminé</p><p class="uc-big">${esc(e.name)}</p>${roleTag(e.role)}<p class="fine">${e.tally.map(t => `${esc(t.name)} ${t.n}`).join(' · ')}</p>`));
    // Mister White a tenté sa chance : on le dit, la manche continue quoi qu'il arrive
    if (v.phase === 'elim' && e.role === 'white' && v.whiteTry && v.whiteTry.word) root.appendChild(el('p', 'note uc-white-try', v.whiteTry.ok ? `Mister White a trouvé le mot des civils : +5 points pour ${esc(e.name)}. La manche continue.` : 'Mister White s’est trompé. La manche continue.'));
  };

  if (v.phase === 'elim') {
    elimBlock();
    addRecap();
    root.appendChild(el('p', 'note', `Personne n'a encore gagné. Nouveau tour d'indices entre les ${v.players.filter(p => p.alive).length} survivants.`));
    if (host) root.appendChild(btn('primary lg', 'Tour suivant', () => act({ t: 'uc:continue' })));
    else root.appendChild(el('p', 'note', 'L\'hôte lance le tour suivant.'));
  }

  if (v.phase === 'white-guess') {
    elimBlock();
    if (v.lastElim.id === myId()) {
      root.appendChild(el('h2', 'uc-title', 'Dernière chance'));
      root.appendChild(el('p', 'fine', 'Devine le mot des civils. Si tu trouves, tu marques 5 points ; tu restes éliminé et la manche continue.'));
      const f = el('form', 'uc-guess', `<input id="uc-guess-in" maxlength="40" autocomplete="off" placeholder="Le mot des civils…"><button class="btn primary" type="submit">Valider</button>`);
      f.onsubmit = e => { e.preventDefault(); const w = $('#uc-guess-in').value.trim(); if (w) act({ t: 'uc:white-guess', word: w }); };
      root.appendChild(f);
    } else {
      root.appendChild(el('p', 'note', 'Mister White tente de deviner le mot des civils…'));
      if (host) root.appendChild(btn('ghost', 'Il ne répond pas : continuer', () => act({ t: 'uc:force' })));
    }
  }

  if (v.phase === 'result') {
    const r = v.result;
    const title = r.winner === 'civils' ? 'Les civils gagnent' : 'Les intrus gagnent';
    root.appendChild(el('div', 'uc-verdict ' + r.winner, `<p class="uc-label">Fin de la manche</p><p class="uc-big">${title}</p>${v.whiteTry && v.whiteTry.word ? `<p class="fine">Mister White a proposé « ${esc(v.whiteTry.word)} » : ${v.whiteTry.ok ? 'bien joué, +5 points' : 'raté'}.</p>` : ''}`));
    root.appendChild(el('div', 'uc-words', `<div><span class="uc-label">Civils</span><b>${esc(v.pair.civil)}</b></div><div><span class="uc-label">Undercover</span><b>${esc(v.pair.undercover)}</b></div>`));
    root.appendChild(roster(p => `<span class="uc-who">${esc(p.name)} ${roleTag(p.role)}</span><span>${p.gain ? '+' + p.gain : ''}</span>`));
    addRecap();
  }

  if (['elim', 'result', 'white-guess'].includes(v.phase) || v.round > 1) {
    const sc = el('div', 'uc-scores', `<span class="uc-label">Scores</span>` + v.scores.map(s => `<span>${esc(s.name)} <b>${s.score}</b></span>`).join(''));
    root.appendChild(sc);
  }
  if (v.phase === 'result') {
    if (host) root.appendChild(btn('primary lg', v.round >= v.rounds ? 'Voir le classement' : 'Manche suivante', () => act({ t: 'uc:next' })));
    else root.appendChild(el('p', 'note', 'L\'hôte lance la suite.'));
  }
  if (v.waiting.length && me.inRound) root.appendChild(el('p', 'fine center', `Entrent à la prochaine manche : ${v.waiting.map(esc).join(', ')}`));
}
const myId = () => net.me;
