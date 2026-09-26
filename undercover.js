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
    if (!max) return 'Personne n’a encore voté';
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
// Voix du meneur (voir DESIGN.md). Le dossier secret garde son look machine à écrire et ses tampons ;
// l'interface autour (état, votes, scores, boutons) suit l'ossature commune.
let ucPeek = false, ucPeekTimer = null, ucLastRound = null;
const ucNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
const ucProg = (done, total) => total > 0 ? el('div', 'mj-prog', `${Array.from({ length: total }, (_, i) => `<i${i < done ? ' class="f"' : ''}></i>`).join('')}<span>${done} sur ${total}</span>`) : null;

function renderUndercover(v) {
  if (!v) return;
  if (v.round !== ucLastRound) { ucLastRound = v.round; ucPeek = false; }
  const root = $('#uc-main'); root.innerHTML = '';
  const me = v.me, host = v.isHost, mid = myId();
  const stamp = r => `<span class="uc-stamp uc-${r}">${Undercover.ROLE_NAME[r]}</span>`;
  const btn = (cls, label, onclick) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = onclick; return b; };
  const say = list => list[(v.round + v.tour - 1) % list.length];          // une réplique stable pendant tout un tour
  const alive = v.players.filter(p => p.alive), e = v.lastElim;
  const names = list => esc(ucNames(list.map(p => p.name)));

  // la ligne d'info discrète
  const plan = `${v.plan.uc} undercover${v.plan.uc > 1 ? 's' : ''}${v.plan.white ? ' et Mister White' : ''}`;
  root.appendChild(el('p', 'mj-meta', `Manche ${v.round} sur ${v.rounds}${v.tour ? ` · tour ${v.tour}` : ''} · ${plan}`));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', prog = null;
  if (!me.inRound && v.phase !== 'result') { title = 'Tu entres à la prochaine manche.'; line = 'Une manche tourne déjà. Écoute bien, tu joues juste après.'; }
  else if (v.phase === 'reveal') {
    const online = v.players.filter(p => p.online), waiting = online.filter(p => !p.ready && p.id !== mid);
    prog = [online.filter(p => p.ready).length, online.length];
    if (!me.ready) { title = 'Découvre ton mot.'; line = say(['Cache ton écran, ton voisin a l’œil.', 'Ouvre ton dossier à l’abri des regards.', 'Lis, retiens, et fais comme si de rien n’était.']); }
    else { title = 'C’est noté.'; line = waiting.length ? `Plus que ${names(waiting)}.` : 'Tout le monde est prêt.'; }
  } else if (v.phase === 'clues') {
    const sp = v.order.find(o => o.id === v.speakerId);
    prog = [v.order.filter(o => o.done).length, v.order.length];
    if (v.speakerId === mid) { title = 'À toi.'; line = say(['Un indice à voix haute. Assez clair pour les tiens, assez flou pour les autres.', 'Un mot ou une courte expression. Surtout pas ton mot.', 'Pas trop précis, pas trop vague. Facile, non ?']); }
    else { title = `${esc(sp?.name || '')} parle.`; line = say(['Tends l’oreille. Un indice qui détonne, ça s’entend.', 'Écoute bien, et retiens ce qui sonne faux.', 'Regarde-le bien pendant qu’il parle.']); }
  } else if (v.phase === 'vote') {
    prog = [v.votedCount, v.voterCount];
    const waiting = alive.filter(p => p.online && !p.voted && p.id !== mid);
    const tie = v.tie ? `On revote entre ${names(v.players.filter(p => v.candidates?.includes(p.id)))}.` : '';
    if (!me.alive) { title = 'La table vote.'; line = 'Tu es éliminé, tu regardes sans voter. Garde tes soupçons pour toi.'; }
    else if (me.vote) { title = 'Vote enregistré.'; line = `${tie ? tie + ' ' : ''}${waiting.length ? `Plus que ${names(waiting)}. Tu peux encore changer d’avis.` : 'Dépouillement.'}`; }
    else if (v.tie) { title = 'Égalité.'; line = tie; }
    else { title = 'Qui est l’intrus ?'; line = say(['Relis les indices. Quelqu’un bluffe.', 'Un seul nom. Pas le tien.', 'Tu peux changer d’avis tant que le vote tourne.']); }
  } else if (v.phase === 'elim' && e) {
    title = `${esc(e.name)} est éliminé.`;
    const why = e.role === 'civil' ? say(['C’était un civil. Oups.', 'Un civil. La table s’est trompée de cible.', 'Raté, c’était un civil.'])
      : e.role === 'undercover' ? say(['Un undercover de moins. Bien flairé.', 'C’était bien un undercover.', 'Démasqué. Au suivant.'])
        : !v.whiteTry?.word ? 'Mister White n’a rien proposé.' : v.whiteTry.ok ?`Mister White a trouvé le mot des civils : +5 points pour ${esc(e.name)}.` : 'Mister White s’est trompé de mot.';
    line = `${why} Personne n’a encore gagné, on repart pour un tour à ${alive.length}.`;
  } else if (v.phase === 'white-guess' && e) {
    if (e.id === mid) { title = 'Dernière chance.'; line = 'Devine le mot des civils. Trouvé, c’est 5 points. Tu restes éliminé quoi qu’il arrive.'; }
    else { title = 'Mister White cherche le mot.'; line = `${esc(e.name)} est démasqué, mais marque encore 5 points s’il trouve le mot des civils.`; }
  } else if (v.phase === 'result') {
    const civ = v.result.winner === 'civils';
    title = civ ? 'Les civils gagnent la manche.' : 'Les intrus gagnent la manche.';
    line = civ ? say(['Bien flairé.', 'Les intrus n’ont pas tenu longtemps.', 'Le bluff n’a pas pris.']) : say(['Bien joué, les menteurs.', 'Le bluff a payé.', 'Personne n’a rien vu venir.']);
    if (v.whiteTry && v.whiteTry.word) line += ` Mister White a proposé « ${esc(v.whiteTry.word)} »${v.whiteTry.ok ? ', bien vu, +5 points' : ', raté'}.`;
  }
  const status = el('div', 'mj-status', `<h3 class="mj-title">${title}</h3>${line ? `<p class="mj-say">${line}</p>` : ''}`);
  const bar = prog && ucProg(prog[0], prog[1]); if (bar) status.appendChild(bar);
  root.appendChild(status);

  // la fiche secrète : masquée par défaut, pour qu'un voisin ne la lise pas par-dessus l'épaule
  const secretCard = big => {
    const card = el('button', 'uc-file uc-secret' + (ucPeek ? ' open' : '') + (big ? '' : ' small'));
    card.type = 'button';
    card.innerHTML = me.white
      ? `<p class="uc-label">Dossier ${ucPeek ? 'ouvert' : 'confidentiel'}</p>${ucPeek ? `<p class="uc-big">Mister White</p><p class="fine">Tu n’as pas de mot. Écoute, fonds-toi dans la masse. Démasqué, tu pourras encore deviner le mot des civils.</p>` : '<p class="uc-big">Touche pour ouvrir</p><p class="fine">À l’abri des regards.</p>'}`
      : `<p class="uc-label">Ton mot secret</p><p class="uc-big">${ucPeek ? esc(me.word) : '• • • • •'}</p><p class="fine">${ucPeek ? 'Civil ou undercover ? Tu ne le sais pas.' : 'Touche pour le voir, à l’abri des regards.'}</p>`;
    card.onclick = () => {
      ucPeek = !ucPeek; clearTimeout(ucPeekTimer);
      if (ucPeek) ucPeekTimer = setTimeout(() => { ucPeek = false; if (view?.uc) renderUndercover(view.uc); }, 6000);
      renderUndercover(view.uc);
    };
    return card;
  };

  // un bloc de liste (colonne de droite sur PC) : un intitulé discret, puis des lignes
  const block = (cls, label, rows) => {
    const b = el('div', cls + ' rl-block', `<span class="mj-side-title">${label}</span>`);
    const list = el('div', 'mj-list'); rows.forEach(r => list.appendChild(r)); b.appendChild(list);
    return b;
  };
  const row = (cls, html) => el('div', 'mj-row ' + cls, html);
  const who = p => `<span class="rl-name">${esc(p.name)}${p.id === mid ? ' <small>(toi)</small>' : ''}</span>`;

  // tout ce qui a été dit, rappelé au vote et en fin de manche
  const addRecap = () => {
    if (!v.players.some(p => p.clues && p.clues.length)) return;
    root.appendChild(block('uc-recap', 'Indices donnés', v.players.map(p => row('uc-recap-row' + (p.alive ? '' : ' out'),
      `${who(p)}<span class="uc-said">${p.clues.length ? p.clues.map(esc).join(' · ') : '<i>rien d’écrit</i>'}</span>`))));
  };

  if (v.phase === 'reveal' && me.inRound) {
    root.appendChild(secretCard(true));
    if (!me.ready) root.appendChild(btn('primary lg', 'Fermer le dossier', () => { ucPeek = false; act({ t: 'uc:ready' }); }));
    if (host) root.appendChild(btn('ghost small', 'Commencer sans attendre', () => act({ t: 'uc:force' })));
  }
  if (v.phase === 'reveal') root.appendChild(block('uc-roster', 'À table', v.players.map(p => row(p.online ? '' : 'off', `${who(p)}<span class="rl-tag${p.ready ? ' ok' : ''}">${p.ready ? 'prêt' : p.online ? 'lit son mot' : 'absent'}</span>`))));

  if (v.phase === 'clues') {
    const mine = me.inRound && v.speakerId === mid;
    if (me.inRound && me.alive) root.appendChild(secretCard(false));
    if (mine) {
      const f = el('form', 'uc-clue-form', '<input id="uc-clue-in" maxlength="40" autocomplete="off" placeholder="Ton indice"><button class="btn primary" type="submit">Noter l’indice</button>');
      f.onsubmit = ev => { ev.preventDefault(); const t = $('#uc-clue-in').value.trim(); if (!t) { toast('Écris ton indice, ou touche « Je l’ai dit, sans l’écrire »'); return; } act({ t: 'uc:clue', text: t }); };
      root.appendChild(f);
      root.appendChild(btn('ghost', 'Je l’ai dit, sans l’écrire', () => act({ t: 'uc:clue' })));
    }
    if (host && !mine) root.appendChild(btn('', 'Joueur suivant', () => act({ t: 'uc:clue' })));
    if (host) root.appendChild(btn('ghost small', 'Passer au vote', () => act({ t: 'uc:force' })));
    const ol = el('div', 'uc-order rl-block', '<span class="mj-side-title">Ordre de parole</span>');
    const list = el('ol', 'mj-list');
    v.order.forEach((o, i) => list.appendChild(el('li', 'mj-row' + (o.done ? ' done' : '') + (o.id === v.speakerId ? ' now' : ''),
      `<span class="rl-num">${i + 1}</span><span class="rl-name">${esc(o.name)}${o.id === mid ? ' <small>(toi)</small>' : ''}</span><span class="rl-tag">${o.id === v.speakerId ? 'parle' : o.done ? 'a parlé' : ''}</span>`)));
    ol.appendChild(list); root.appendChild(ol);
    addRecap();
  }

  if (v.phase === 'vote') {
    if (me.inRound && me.alive) {
      const list = el('div', 'mj-list rl-choices uc-vote');
      v.players.filter(p => p.alive && p.id !== mid && (!v.candidates || v.candidates.includes(p.id))).forEach(p => {
        const on = me.vote === p.id;
        const b = el('button', 'mj-row rl-opt uc-target' + (on ? ' on' : ''), `<span class="rl-main"><b>${esc(p.name)}</b><span class="uc-said">${p.clues.length ? p.clues.map(esc).join(' · ') : 'aucun indice écrit'}</span></span><span class="rl-tag">${on ? 'ton vote' : p.voted ? 'a voté' : ''}</span>`);
        b.type = 'button'; b.onclick = () => act({ t: 'uc:vote', target: p.id });
        list.appendChild(b);
      });
      root.appendChild(list);
    } else addRecap();
    if (host) root.appendChild(btn('ghost small', 'Dépouiller maintenant', () => act({ t: 'uc:force' })));
  }

  // le dossier de l'éliminé : son nom, son tampon, les voix
  const elimFile = () => {
    if (!e) return;
    root.appendChild(el('div', 'uc-file uc-elim', `<p class="uc-label">Éliminé</p><p class="uc-big">${esc(e.name)}</p>${stamp(e.role)}<p class="fine">${e.tally.map(t => `${esc(t.name)}, ${t.n} voix`).join(' · ')}</p>`));
  };

  if (v.phase === 'elim') {
    elimFile();
    if (host) root.appendChild(btn('primary lg', 'Nouveau tour d’indices', () => act({ t: 'uc:continue' })));
    else root.appendChild(el('p', 'note', 'L’hôte relance le tour.'));
    addRecap();
  }

  if (v.phase === 'white-guess') {
    elimFile();
    if (e && e.id === mid) {
      const f = el('form', 'uc-guess', `<input id="uc-guess-in" maxlength="40" autocomplete="off" placeholder="Le mot des civils"><button class="btn primary" type="submit">Tenter ce mot</button>`);
      f.onsubmit = ev => { ev.preventDefault(); const w = $('#uc-guess-in').value.trim(); if (w) act({ t: 'uc:white-guess', word: w }); };
      root.appendChild(f);
    } else if (host) root.appendChild(btn('ghost small', 'Il ne répond pas ? Continuer', () => act({ t: 'uc:force' })));
  }

  if (v.phase === 'result') {
    root.appendChild(el('div', 'uc-words', `<div><span class="uc-label">Mot des civils</span><b>${esc(v.pair.civil)}</b></div><div><span class="uc-label">Mot undercover</span><b>${esc(v.pair.undercover)}</b></div>`));
    if (host) root.appendChild(btn('primary lg', v.round >= v.rounds ? 'Voir le classement' : 'Manche suivante', () => act({ t: 'uc:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));
    root.appendChild(block('uc-roster', 'La manche', v.players.map(p => row((p.alive ? '' : 'out ') + 'uc-' + p.role,
      `${who(p)}<span class="uc-role">${Undercover.ROLE_NAME[p.role]}</span><b class="rl-score">${p.gain ? '+' + p.gain : '0'}</b>`))));
    addRecap();
  }

  if (['elim', 'result', 'white-guess'].includes(v.phase) || v.round > 1)
    root.appendChild(block('uc-scores', 'Scores', v.scores.map(s => row(s.id === mid ? 'me' : '', `<span class="rl-name">${esc(s.name)}${s.id === mid ? ' <small>(toi)</small>' : ''}</span><b class="rl-score">${s.score}</b>`))));
  if (v.waiting.length && me.inRound) root.appendChild(el('p', 'note', `${esc(ucNames(v.waiting))} ${v.waiting.length > 1 ? 'entrent' : 'entre'} à la prochaine manche.`));
}
const myId = () => net.me;
