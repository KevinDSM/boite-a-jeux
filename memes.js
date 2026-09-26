/* Mème pas vrai — une phrase, et chacun pose le mème ou le GIF de sa main qui y répond le mieux.

   Chaque joueur a une main de 7 cartes, des modèles de mèmes et de GIF de la bibliothèque publique
   d'Imgflip (memes.json, les images sont chargées chez Imgflip, les GIF en vidéo muette en boucle).
   À chaque manche une situation est tirée ; chacun pose une carte en secret ; les cartes sont
   révélées, mélangées et anonymes. Selon le réglage, un juge tournant choisit la meilleure (1 point),
   ou tout le monde vote (1 point par vote reçu, jamais pour la sienne). Premier au score fixé gagne.
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.mm), actions « mm:… ».
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, net, view et ASSET_V. */

'use strict';

const Memes = (() => {
  const HAND = 7, SEEN_KEY = 'mm-seen', PROMPT_KEY = 'mm-prompts';
  const PROMPTS = [
    'Quand tu entends ton prénom dans une conversation à côté de toi',
    'Moi le lundi matin à 7 h',
    'Quand le serveur dit « attention, l’assiette est chaude » et que tu la touches quand même',
    'Quand tu retrouves 20 € dans une vieille veste',
    'Ma tête quand quelqu’un dit « on peut faire un point rapide ? »',
    'Quand ta mère dit « on a de la nourriture à la maison »',
    'Moi en train d’expliquer un jeu de société à des gens qui n’écoutent pas',
    'Quand tu réalises que tu as envoyé le message à la mauvaise personne',
    'Quand le wifi coupe en pleine partie',
    'Quand quelqu’un mange ta part de pizza',
    'Moi qui fais semblant de comprendre ce que dit le mécanicien',
    'Quand le GPS dit « faites demi-tour dès que possible »',
    'Quand tu dis « je rentre tôt ce soir »',
    'Quand ton pote dit « j’arrive dans 5 minutes »',
    'Quand tu vois le prix de l’essence',
    'Quand le prof dit « prenez une feuille »',
    'Quand ton réveil sonne alors que tu viens de t’endormir',
    'Moi devant le frigo à minuit',
    'Quand quelqu’un met ta chanson préférée en soirée',
    'Quand tu marches sur une pièce de Lego',
    'Quand tu as gagné un débat sous la douche, trois jours trop tard',
    'Quand ton chef répond « tout à fait » à un mail que tu n’as pas lu',
    'Quand tu entends un bruit bizarre dans la maison à 3 h du matin',
    'Quand la pub dure plus longtemps que la vidéo',
    'Quand tu comprends enfin la blague, dix minutes après',
    'Quand le livreur sonne pile quand tu es sous la douche',
    'Moi qui gère mes finances à la fin du mois',
    'Quand quelqu’un dit « on se fait un restau, chacun paie sa part » et commande du homard',
    'Quand tu as encore oublié pourquoi tu es entré dans cette pièce',
    'Quand ton téléphone passe à 1 % de batterie',
    'Quand tu entends « il faut qu’on parle »',
    'Ma réaction quand quelqu’un spoile la fin de la série',
    'Quand tu fais un câlin à quelqu’un qui voulait juste te serrer la main',
    'Quand la photo de groupe est parfaite sauf toi',
    'Quand tu vois un chien dans la rue',
    'Quand tu mets un pied dans la mer en juin',
    'Quand le vendeur demande « je peux vous aider ? » et que tu regardes juste',
    'Moi après une seule séance de sport',
    'Quand la réunion aurait pu être un mail',
    'Quand ta commande arrive enfin après trois semaines',
    'Quand tu te rends compte que demain c’est lundi',
    'Quand ton pote te présente son nouveau copain ou sa nouvelle copine',
    'Quand ton ex like une photo de 2016',
    'Quand l’avion atterrit et que tout le monde se lève en même temps',
    'Quand tu gagnes enfin au Monopoly',
    'Quand tu entends ta propre voix enregistrée',
    'Quand tu fais tomber ta tartine côté beurre',
    'Quand ta grand-mère découvre les emojis',
    'Quand quelqu’un dit « c’est pas pour moi, c’est pour un ami »',
    'Moi quand on me demande ce que je veux faire plus tard',
    'Quand ton colis indique « livré » mais qu’il n’y a rien',
    'Quand on te demande ton avis et que tu n’écoutais pas',
    'Quand tu cries victoire trop tôt',
    'Quand le chat fait tomber un verre en te regardant droit dans les yeux',
    'Quand tu goûtes le plat que tu as cuisiné toi-même',
    'Quand ton ami raconte une histoire que tu as vécue… mais à sa sauce',
    'Quand tu vois la note au restaurant',
    'Quand quelqu’un tape sur ton épaule gauche et se cache à droite',
    'Quand le film fait 3 h 20',
    'Quand tu rates le bus de trois secondes',
    'Quand tu découvres que ta série préférée a été annulée',
    'Moi en train de lire les conditions générales',
    'Quand tu réponds « toi aussi » au serveur qui dit « bon appétit »',
    'Quand tu réussis à ouvrir un pot de cornichons du premier coup',
    'Quand tu crois que la marche est là et qu’il n’y en a pas',
    'Quand la maîtresse sort la télé à roulettes',
    'Quand quelqu’un applaudit à l’atterrissage',
    'Moi qui attends que tout le monde parte pour finir les chips',
    'Quand tu as « juste une dernière partie » à 2 h du matin',
    'Quand tes parents essaient d’utiliser l’argot des jeunes',
    'Quand tu reçois une note vocale de 6 minutes',
    'Quand on t’invite à un anniversaire surprise… qui est le tien',
    'Quand ton pote a « un plan infaillible »',
    'Quand tu vois quelqu’un avec le même t-shirt que toi',
    'Quand tu retrouves tes lunettes sur ta tête',
    'Quand le docteur dit « ça va piquer un peu »',
    'Quand quelqu’un met de l’ananas sur la pizza',
    'Quand le groupe WhatsApp de la famille s’enflamme',
    'Quand tu as dit que tu avais lu le livre du club de lecture',
    'Quand la batterie de la télécommande lâche',
    'Quand tu as enfin le temps de jouer et que le jeu se met à jour',
    'Quand tu apprends que c’est toi qui conduis ce soir',
    'Quand tout le monde rit et que tu ris aussi sans avoir compris',
    'Moi au buffet à volonté',
    'Quand tu entends « c’est le dernier verre, promis »',
    'Quand on se rend compte que personne n’a pris les clés',
    'Quand le jeu de société tourne au règlement de comptes familial',
    'Quand tu vois le bout du tunnel et que c’est un train',
    'Quand tu te fais doubler à la caisse',
    'Quand tu mets le chauffage en novembre et que tu vois la facture en janvier',
    'Quand la personne devant toi a 47 articles à la caisse express',
    'Quand ton pote prétend qu’il « gère » le barbecue',
    'Quand tu dois dire au revoir et que vous partez dans la même direction',
    'Quand tu gagnes à un jeu de hasard et que tu dis que c’était de la stratégie',
    'Quand on t’annonce qu’il reste encore une surprise',
    'Moi en train de rentrer le ventre sur une photo',
    'Quand ta commande Uber Eats arrive froide',
    'Quand le boss final a une deuxième phase',
    'Quand tu apprends qu’il n’y a pas cours demain',
    'Quand tu retrouves ton téléphone dans ta main en le cherchant',
    'Quand ton pote dit « t’inquiète, je connais un raccourci »',
    'Quand tu entends « tu as changé » à une soirée',
    'Quand ton équipe perd et que tu dis que l’arbitre est vendu',
    'Quand tu as mis trop de sauce piquante',
    'Quand le coiffeur demande « alors, ça vous plaît ? »',
    'Quand tu vois ton reflet dans la vitre du bus au réveil',
    'Quand le patron passe derrière ton écran',
    'Quand la voiture ne démarre pas le jour J',
    'Quand ton ami dit « je ne bois pas ce soir »',
    'Quand tu reçois un compliment et que tu ne sais pas quoi faire',
    'Quand tu fais semblant d’être au téléphone pour éviter quelqu’un',
    'Quand la personne en face de toi à table mâche la bouche ouverte',
    'Quand tu gagnes une partie de ce jeu',
    'Quand tu vois que l’hôte de cette partie a encore choisi son jeu préféré',
    'Quand tu te rends compte que tu parles tout seul dans la rue',
    'Quand les vacances se terminent demain',
    'Quand il fait 35 °C et que le bureau n’a pas la clim',
    'Quand tu entends la musique du camion de glaces',
    'Quand tu veux dormir mais que ton cerveau rejoue un moment gênant de 2012',
    'Quand le sèche-cheveux de l’hôtel souffle de l’air tiède',
    'Quand tu dis « ce sera rapide » au début d’une tâche',
    'Quand tu comprends que c’était un piège',
    'Quand quelqu’un met un vocal au milieu d’une conversation écrite',
    'Quand le mariage a un open bar',
    'Quand tu retrouves ton doudou d’enfance',
    'Quand tu es le seul à venir déguisé',
    'Quand tu gagnes enfin un argument contre ta mère',
    'Quand tu dis « on se capte » et que personne ne se capte jamais',
    'Moi quand le dessert arrive',
  ];

  let cards = null, byId = {};
  async function load(v) {
    if (cards) return cards;
    cards = await fetch(`memes.json?v=${v}`).then(r => r.ok ? r.json() : []).catch(() => []);
    byId = {}; cards.forEach(c => byId[c.id] = c);
    return cards;
  }
  const count = () => cards ? cards.length : 0;
  const card = id => byId[id];
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const pl = (room, id) => room.players.find(p => p.id === id);
  const judge = room => room.mode === 'judge' ? pl(room, room.order[room.judge]) : null;
  const players = room => room.order.map(id => pl(room, id)).filter(p => p.online && p.id !== judge(room)?.id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };

  // les cartes et les phrases vues lors des soirées précédentes sortent en dernier
  function ordered(list, key) {
    let seen = new Set(); try { seen = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { }
    const fresh = shuffle(list.filter(x => !seen.has(x))), old = shuffle(list.filter(x => seen.has(x)));
    if (!fresh.length) { try { localStorage.removeItem(key); } catch { } }
    return old.concat(fresh);
  }
  function remember(key, ids) { try { const s = new Set(JSON.parse(localStorage.getItem(key) || '[]')); ids.forEach(i => s.add(i)); localStorage.setItem(key, JSON.stringify([...s].slice(-1500))); } catch { } }

  function create({ hostId, players: ps, target, mode, kinds }) {
    const pool = cards.filter(c => kinds === 'img' ? c.kind === 'img' : kinds === 'gif' ? c.kind === 'gif' : true).map(c => c.id);
    const room = {
      hostId, phase: 'play', round: 0, target: clamp(target, 3, 20, 7), mode: mode === 'vote' ? 'vote' : 'judge',
      players: ps.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, score: 0, hand: [] })),
      order: [], judge: -1, deck: ordered(pool, SEEN_KEY), prompts: ordered(PROMPTS.map((_, i) => i), PROMPT_KEY),
      prompt: '', plays: {}, table: [], votes: {}, result: null, log: [], seq: 0, turnAt: Date.now(), winnerId: null,
    };
    room.order = shuffle(room.players.filter(p => p.online).map(p => p.id));
    room.players.forEach(p => { if (p.online) fill(room, p); });
    nextRound(room);
    return room;
  }

  function fill(room, p) {
    const got = [];
    while (p.hand.length < HAND) {
      if (!room.deck.length) { room.deck = shuffle(room.discard || []); room.discard = []; }
      if (!room.deck.length) break;
      const id = room.deck.pop(); p.hand.push(id); got.push(id);
    }
    if (got.length) remember(SEEN_KEY, got);
  }

  function nextRound(room) {
    room.round += 1;
    if (room.mode === 'judge') {
      const n = room.order.length; let g = 0;
      do { room.judge = (room.judge + 1) % n; } while (g++ < n && !pl(room, room.order[room.judge])?.online);
    }
    if (!room.prompts.length) room.prompts = shuffle(PROMPTS.map((_, i) => i));
    const pi = room.prompts.pop(); remember(PROMPT_KEY, [pi]);
    room.prompt = PROMPTS[pi]; room.plays = {}; room.table = []; room.votes = {}; room.result = null;
    room.phase = 'play'; room.turnAt = Date.now(); room.seq += 1;
  }

  function play(room, pid, cardId) {
    if (room.phase !== 'play') return null;
    const p = pl(room, pid); if (!p || p.id === judge(room)?.id || !p.hand.includes(cardId)) return null;
    room.plays[pid] = cardId; room.seq += 1;
    if (players(room).every(q => room.plays[q.id])) startPick(room);
    return null;
  }
  function startPick(room) {
    room.table = shuffle(Object.entries(room.plays).map(([owner, c]) => ({ owner, card: c })));
    if (!room.table.length) { nextRound(room); return; }
    room.phase = 'pick'; room.votes = {}; room.turnAt = Date.now(); room.seq += 1;
  }
  function choose(room, pid, cardId) {
    if (room.phase !== 'pick') return null;
    const slot = room.table.find(s => s.card === cardId); if (!slot) return null;
    if (room.mode === 'judge') {
      if (pid !== judge(room)?.id) return null;
      return finish(room, { [slot.owner]: 1 });
    }
    const p = pl(room, pid); if (!p || !p.online) return null;
    if (slot.owner === pid) return 'C’est ton mème, vote pour un autre';
    room.votes[pid] = cardId; room.seq += 1;
    const voters = room.order.map(id => pl(room, id)).filter(q => q.online);
    if (voters.every(q => room.votes[q.id] || !room.table.some(s => s.owner !== q.id))) {
      const gains = {}; Object.values(room.votes).forEach(c => { const o = room.table.find(s => s.card === c).owner; gains[o] = (gains[o] || 0) + 1; });
      return finish(room, gains);
    }
    return null;
  }
  function finish(room, gains) {
    Object.entries(gains).forEach(([id, g]) => { const p = pl(room, id); if (p) p.score += g; });
    const best = Math.max(0, ...Object.values(gains));
    room.result = { gains, winners: Object.keys(gains).filter(id => gains[id] === best && best > 0).map(id => pl(room, id)?.name) };
    // les cartes posées quittent les mains
    room.table.forEach(s => { const p = pl(room, s.owner); if (p) p.hand = p.hand.filter(c => c !== s.card); (room.discard = room.discard || []).push(s.card); });
    room.phase = 'reveal'; room.turnAt = Date.now(); room.seq += 1;
    const w = room.result.winners, many = w.length > 1;
    log(room, !w.length ? 'Personne ne marque cette manche.' : room.mode === 'judge' ? `${w.join(' et ')} empoche${many ? 'nt' : ''} le point.` : `${w.join(' et ')} rafle${many ? 'nt' : ''} le plus de voix.`);
    return null;
  }
  function next(room, pid) {
    if (room.phase !== 'reveal' || (pid !== room.hostId && pid !== judge(room)?.id)) return null;
    const best = [...room.players].sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= room.target) { room.phase = 'over'; room.winnerId = best.id; room.seq += 1; return null; }
    room.players.forEach(p => { if (p.online) fill(room, p); });
    nextRound(room); return null;
  }
  function swap(room, pid) {
    // défausser toute sa main, une fois par manche, contre un point (on n'aime vraiment rien)
    if (room.phase !== 'play') return null;
    const p = pl(room, pid); if (!p || room.plays[pid] || p.id === judge(room)?.id || p.swapped === room.round) return null;
    if (p.score < 1) return 'Il faut 1 point pour changer toute ta main';
    (room.discard = room.discard || []).push(...p.hand); p.hand = []; p.score -= 1; p.swapped = room.round; fill(room, p); room.seq += 1;
    log(room, `${p.name} jette toute sa main et perd 1 point.`);
    return null;
  }
  function hostSkip(room, pid) {
    if (pid !== room.hostId) return null;
    if (room.phase === 'play') { players(room).forEach(q => { if (!room.plays[q.id] && q.hand.length) room.plays[q.id] = q.hand[Math.random() * q.hand.length | 0]; }); startPick(room); return null; }
    if (room.phase === 'pick') {
      if (room.mode === 'judge') { const s = room.table[Math.random() * room.table.length | 0]; return finish(room, { [s.owner]: 1 }); }
      const gains = {}; Object.values(room.votes).forEach(c => { const o = room.table.find(s => s.card === c).owner; gains[o] = (gains[o] || 0) + 1; });
      return finish(room, gains);
    }
    return null;
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'mm:play': return play(room, pid, m.card);
      case 'mm:choose': return choose(room, pid, m.card);
      case 'mm:next': return next(room, pid);
      case 'mm:swap': return swap(room, pid);
      case 'mm:skip': return hostSkip(room, pid);
    }
    return null;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    const q = { id, name, online: true, score: 0, hand: [] };
    room.players.push(q); room.order.push(id); fill(room, q);
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on; if (on) return;
    if (room.phase === 'play' && judge(room)?.id !== id && players(room).length && players(room).every(q => room.plays[q.id])) startPick(room);
    if (room.phase === 'pick' && room.mode === 'judge' && judge(room)?.id === id) hostSkip(room, room.hostId);
  }

  function view(room, pid) {
    const me = pl(room, pid), j = judge(room);
    const waiting = room.phase === 'play' ? players(room).filter(q => !room.plays[q.id]).map(q => q.name)
      : room.phase === 'pick' && room.mode === 'vote' ? room.order.map(id => pl(room, id)).filter(q => q.online && !room.votes[q.id] && room.table.some(s => s.owner !== q.id)).map(q => q.name) : [];
    return {
      phase: room.phase, round: room.round, target: room.target, mode: room.mode, prompt: room.prompt, seq: room.seq, isHost: pid === room.hostId,
      judgeName: j?.name || '', isJudge: j?.id === pid, seated: !!me,
      me: me ? { hand: me.hand.map(card).filter(Boolean), played: room.plays[pid] || null, voted: room.votes[pid] || null, score: me.score, canSwap: me.score >= 1 && me.swapped !== room.round } : { hand: [], played: null, voted: null, score: 0, canSwap: false },
      players: room.order.map(id => { const p = pl(room, id); return { id, name: p.name, online: p.online, score: p.score, me: id === pid, judge: id === j?.id, done: room.phase === 'play' ? !!room.plays[id] : room.phase === 'pick' && room.mode === 'vote' ? !!room.votes[id] : false, gain: room.result?.gains[id] || 0 }; }),
      waiting, playedCount: Object.keys(room.plays).length, playersCount: players(room).length,
      table: room.phase === 'pick' ? room.table.map(s => ({ card: card(s.card), mine: s.owner === pid }))
        : room.phase === 'reveal' || room.phase === 'over' ? room.table.map(s => ({ card: card(s.card), owner: pl(room, s.owner)?.name, mine: s.owner === pid, gain: room.result?.gains[s.owner] || 0, votes: Object.entries(room.votes).filter(([, c]) => c === s.card).map(([id]) => pl(room, id)?.name) })) : [],
      result: room.result, quiet: Date.now() - room.turnAt, winnerName: room.winnerId ? pl(room, room.winnerId)?.name : null,
      scores: [...room.players].filter(p => room.order.includes(p.id)).sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score, me: p.id === pid })),
      log: room.log.slice(-3),
    };
  }

  // les robots posent un mème au hasard, votent ou jugent au hasard
  function tick(room) {
    if (Date.now() - room.turnAt < 1500 || Math.random() < .5) return false;
    const bots = room.order.map(id => pl(room, id)).filter(p => p?.bot && p.online), j = judge(room);
    if (!bots.length) return false;
    const any = list => list[Math.random() * list.length | 0];
    if (room.phase === 'play') {
      const b = bots.find(p => p.id !== j?.id && !room.plays[p.id] && p.hand.length);
      if (b) { play(room, b.id, any(b.hand)); return true; }
    }
    if (room.phase === 'pick' && room.table.length) {
      if (room.mode === 'judge') { if (j?.bot && Date.now() - room.turnAt > 3500) { choose(room, j.id, any(room.table).card); return true; } }
      else {
        const b = bots.find(p => !room.votes[p.id] && room.table.some(x => x.owner !== p.id));
        if (b) { choose(room, b.id, any(room.table.filter(x => x.owner !== b.id)).card); return true; }
      }
    }
    return false;
  }
  return { PROMPTS, HAND, load, count, card, create, act, tick, join, setOnline, view };
})();

// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
let mmSkipTimer = null, mmLastRound = null;
const MM_SKIP_MS = 60000;
const mmNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];

/** Une carte : image, ou GIF en vidéo muette qui tourne en boucle. */
function mmMedia(c, big = false) {
  if (!c) return '';
  return c.kind === 'gif'
    ? `<video src="${esc(c.url)}" poster="${esc(c.thumb)}" autoplay muted loop playsinline preload="${big ? 'auto' : 'metadata'}"></video>`
    : `<img src="${esc(c.url)}" alt="" loading="lazy" decoding="async">`;
}
function mmCardHTML(c) {
  return `<figure class="mm-card${c.kind === 'gif' ? ' gif' : ''}">${mmMedia(c)}${c.kind === 'gif' ? '<span class="mm-gif">GIF</span>' : ''}</figure>`;
}
function mmOpen(c, action) {
  let box = $('#mm-light');
  if (!box) { box = el('div', 'mm-light'); box.id = 'mm-light'; document.body.appendChild(box); }
  box.innerHTML = '';
  const prompt = view?.mm?.prompt;
  if (prompt) box.appendChild(el('p', 'mm-light-prompt', esc(prompt)));
  box.appendChild(el('div', 'mm-light-media', mmMedia(c, true)));
  box.appendChild(el('p', 'mm-light-cap', esc(c.name)));
  const row = el('div', 'mm-light-row');
  if (action) { const b = el('button', 'btn primary lg', action.label); b.type = 'button'; if (action.disabled) b.disabled = true; b.onclick = () => { mmClose(); action.fn(); }; row.appendChild(b); }
  const close = el('button', 'btn ghost', 'Fermer'); close.type = 'button'; close.onclick = mmClose; row.appendChild(close);
  box.appendChild(row); box.hidden = false;
  box.onclick = e => { if (e.target === box) mmClose(); };
}
function mmClose() { const box = $('#mm-light'); if (box) { box.hidden = true; box.innerHTML = ''; } }

function renderMemes(v) {
  if (!v) return;
  const root = $('#mm-main'); root.innerHTML = '';
  clearTimeout(mmSkipTimer);
  if (v.round !== mmLastRound) { mmLastRound = v.round; mmClose(); }
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me, judgeMode = v.mode === 'judge', J = esc(v.judgeName);
  const say = list => list[(v.round - 1) % list.length];          // une réplique stable pendant toute la manche

  root.appendChild(el('p', 'mj-meta', `Manche ${v.round} · premier à ${v.target} · ${judgeMode ? 'le juge tourne' : 'tout le monde vote'}`));
  root.appendChild(el('p', 'mm-prompt', esc(v.prompt)));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', prog = null;
  if (v.phase === 'play') {
    prog = [v.playedCount, v.playersCount];
    if (v.isJudge) {
      title = 'Tu juges.';
      line = say(['Ils fouillent leurs mèmes. Ta main, elle, attend la manche suivante.', 'Pendant qu’ils cherchent, entraîne-toi à rester de marbre.', 'Ta seule mission : ne pas rire avant d’avoir tout vu.']);
    } else if (!v.seated) { title = judgeMode ? `${J} juge.` : 'Tout le monde cherche.'; line = 'Tu regardes cette manche, tu joueras à la suivante.'; }
    else if (me.played) { title = 'C’est posé.'; line = v.waiting.length ? `Plus que ${esc(mmNames(v.waiting))}.` : 'Tout le monde a posé.'; }
    else {
      title = judgeMode ? `${J} juge.` : 'À toi de poser.';
      line = judgeMode ? say([`Trouve le mème qui fera craquer ${J}.`, `Pense à ce qui fera rire ${J}. Pas toi.`, 'Le plus juste, ou le plus absurde. À toi de voir.'])
        : say(['Le plus juste, ou le plus absurde. À toi de voir.', 'Vise le fou rire général.']);
    }
  } else if (v.phase === 'pick') {
    if (judgeMode) {
      if (v.isJudge) { title = 'À toi de trancher.'; line = 'Ouvre-les en grand, puis garde ton préféré.'; }
      else { title = `${J} tranche.`; line = say(['Croise les doigts.', 'Fais comme si tu n’avais rien posé.', 'Surtout, garde ton sérieux.']); }
    } else {
      const done = v.players.filter(p => p.done).length;
      prog = [done, done + v.waiting.length];
      title = me.voted ? 'Vote enregistré.' : 'Votez.';
      line = me.voted ? (v.waiting.length ? `Plus que ${esc(mmNames(v.waiting))}.` : 'Dépouillement.') : 'Ton préféré. Pas le tien.';
    }
  } else if (v.phase === 'reveal') {
    const w = v.result?.winners || [];
    title = !w.length ? 'Personne ne marque.' : judgeMode ? `${esc(mmNames(w))} ${w.length > 1 ? 'marquent' : 'marque'} le point.` : `${esc(mmNames(w))} ${w.length > 1 ? 'raflent' : 'rafle'} le plus de voix.`;
    line = w.length ? (judgeMode ? say(['Le juge a parlé.', 'On ne discute pas les goûts du juge.', 'Applaudissements, ou huées.']) : say(['La table a parlé.', 'Applaudissements, ou huées.'])) : 'Pas une seule voix. Dur.';
  } else if (v.phase === 'over') { title = `${esc(v.winnerName || '')} gagne la partie.`; line = 'Revanche ? Tout se passe au salon.'; }
  const status = el('div', 'mj-status', `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`);
  if (prog && prog[1] > 0) status.appendChild(el('div', 'mj-prog', `${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]}</span>`));
  root.appendChild(status);

  const zone = el('div', 'mm-zone');
  const grid = (list, onTap, label, cls = '') => {
    const g = el('div', 'mm-grid ' + cls);
    list.forEach(item => {
      const c = item.card || item;
      const f = el('button', 'mm-slot' + (item.chosen ? ' chosen' : '') + (item.mine ? ' mine' : '') + (item.win ? ' win' : '')); f.type = 'button';
      f.innerHTML = mmCardHTML(c) + (item.tag ? `<span class="mm-tag">${item.tag}</span>` : '');
      f.onclick = () => mmOpen(c, onTap ? { label: typeof label === 'function' ? label(item) : label, disabled: item.disabled, fn: () => onTap(c) } : null);
      g.appendChild(f);
    });
    return g;
  };

  if (v.phase === 'play' && v.seated) {
    zone.appendChild(grid(me.hand.map(c => ({ card: c, chosen: c.id === me.played })), v.isJudge || me.played ? null : c => act({ t: 'mm:play', card: c.id }), 'Poser ce mème', 'hand'));
    if (!v.isJudge && !me.played && me.canSwap) zone.appendChild(btn('ghost small', 'Main pourrie ? Tout changer (−1 point)', () => act({ t: 'mm:swap' })));
  }
  if (v.phase === 'pick') {
    const canChoose = judgeMode ? v.isJudge : v.seated && !me.voted;
    zone.appendChild(grid(v.table.map(s => ({ card: s.card, mine: s.mine, chosen: me.voted === s.card.id, tag: s.mine ? 'le tien' : '', disabled: !judgeMode && s.mine })),
      canChoose ? c => act({ t: 'mm:choose', card: c.id }) : null, it => (it.disabled ? 'C’est ton mème' : judgeMode ? 'Ce mème gagne' : 'Voter pour ce mème'), 'table'));
  }
  if (v.phase === 'reveal') {
    const best = Math.max(0, ...v.table.map(t => t.gain || 0));
    zone.appendChild(grid(v.table.map(s => ({ card: s.card, win: s.gain && s.gain === best, tag: `${esc(s.owner)}${s.gain ? ` · +${s.gain}` : ''}` })), null, '', 'table'));
    if (v.isHost || v.isJudge) zone.appendChild(btn('primary lg', 'Manche suivante', () => act({ t: 'mm:next' })));
    else zone.appendChild(el('p', 'note', 'L’hôte ou le juge lance la suite.'));
  }
  if (v.phase === 'over') {
    zone.appendChild(el('ol', 'mj-list hm-rank', v.scores.map((s, i) => `<li class="mj-row${s.me ? ' me' : ''}"><span><i>${i + 1}</i>${esc(s.name)}</span><b>${s.score}</b></li>`).join('')));
    if (v.isHost) zone.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
  }
  if (v.isHost && (v.phase === 'play' || v.phase === 'pick')) {
    if (v.quiet > MM_SKIP_MS) zone.appendChild(btn('ghost small', v.phase === 'play' ? 'Quelqu’un traîne ? Jouer à sa place' : judgeMode ? 'Le juge s’est endormi ? Tirer au sort' : 'Clore le vote', () => act({ t: 'mm:skip' })));
    else mmSkipTimer = setTimeout(() => { if (view?.mm) renderMemes(view.mm); }, MM_SKIP_MS - v.quiet + 200);
  }
  root.appendChild(zone);

  // les joueurs (colonne de droite sur PC) et le fil de la partie
  const strip = el('div', 'mm-players hm-players');
  strip.appendChild(el('span', 'mj-side-title', 'Scores'));
  v.players.forEach(p => {
    const tag = p.judge ? '<i>juge</i>' : p.done ? `<i class="ok">${v.phase === 'pick' ? 'a voté' : 'a posé'}</i>` : '';
    strip.appendChild(el('div', `hm-player${p.judge ? ' lead' : ''}${p.online ? '' : ' off'}${p.me ? ' me' : ''}`,
      `<span class="hm-name">${esc(p.name)}</span>${tag}<span class="hm-score">${p.score}${v.phase === 'reveal' && p.gain ? ` <b>+${p.gain}</b>` : ''}</span>`));
  });
  root.appendChild(strip);
  if (v.log.length) {
    const lg = el('ul', 'mm-log hm-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }
}
