/* Sablier — moteur de règles, porté tel quel depuis le projet d'origine (src/game.js).
   Aucune dépendance réseau ni DOM : le téléphone hôte l'exécute, app.js relaie.

   Enchaînement des phases :
     teams → selection → turn-idle ⇄ turn-live → round-end → game-end

   Différences avec l'original : plus de serveur Node (le hasard vient de Math.random),
   les joueurs gardent l'identifiant que Platine leur donne, le mode Skribble est laissé
   de côté (il fera une carte à part), et le tirage stratifié regroupe les catégories
   de même nom entre les decks. */

'use strict';

window.Sablier = (() => {

  const TEAM_PRESETS = [
    { name: 'Rouge', color: '#e5484d' },
    { name: 'Bleue', color: '#3e63dd' },
    { name: 'Verte', color: '#30a46c' },
    { name: 'Jaune', color: '#f5a524' },
  ];

  const ROUND_TYPES = {
    free: { title: 'Description libre', rule: "Tout est permis sauf prononcer un mot de la carte, sa traduction ou sa racine. Tu peux passer autant que tu veux." },
    word: { title: 'Un seul mot', rule: "Un seul mot par carte, prononcé une seule fois. Aucun geste, aucun bruit, aucune reformulation." },
    mime: { title: 'Mime', rule: "Tu mimes, ils devinent à voix haute. Aucun mot, aucun son, aucune lettre tracée en l'air. Tu peux passer autant que tu veux.", mime: true },
    draw: { title: 'Dessin', rule: "Tu dessines, ils devinent à voix haute. Aucune lettre, aucun chiffre, aucun geste vers l'écran.", draw: true },
  };

  const DRAW_COLORS = [
    '#1f2430', '#6b7280', '#ffffff', '#e5484d', '#f97316', '#fbbf24',
    '#8b5a2b', '#2fa96b', '#38bdf8', '#3e63dd', '#8e4ec6', '#ec4899',
    '#7f1d1d', '#f1c27d', '#84cc16', '#166534', '#2dd4bf', '#c4b5fd',
  ];
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const DRAW_WIDTHS = [0.005, 0.012, 0.028];
  const MAX_STROKES = 600;
  const MAX_POINTS_PER_STROKE = 4000;
  const REACTIONS = ['😂', '👏', '🔥', '😮', '❤️', '👍', '🤔', '😱', '🎉', '💩'];
  const COUNTDOWN_MS = 3000;

  const DEFAULT_SETTINGS = {
    roundTypes: ['free', 'word'],
    turnSeconds: 30,
    drawSeconds: 60,
    dealPerPlayer: 12,
    discardPerPlayer: 2,
    teamMode: 'random',
    decks: [],
    categories: null,
    difficulties: [1, 2, 3],
  };
  const SETTINGS_BOUNDS = { turnSeconds: [15, 120], drawSeconds: [15, 180], dealPerPlayer: [4, 20], discardPerPlayer: [0, 10] };

  // ------------------------------------------------------------ utilitaires
  const randomInt = max => Math.floor(Math.random() * max);
  function shuffle(arr) { const out = arr.slice(); for (let i = out.length - 1; i > 0; i--) { const j = randomInt(i + 1);[out[i], out[j]] = [out[j], out[i]]; } return out; }
  function clamp(value, [min, max], fallback) { const n = Number(value); if (!Number.isFinite(n)) return fallback; return Math.min(max, Math.max(min, Math.round(n))); }
  function sanitizeName(raw, fallback = 'Joueur') { const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 20); return name || fallback; }
  function sanitizeReaction(raw) { const e = String(raw ?? ''); return REACTIONS.includes(e) ? e : null; }

  // ------------------------------------------------------------ decks
  let decks = [];
  /** list : [{id, name, description, cards:[{n,c,d}]}] tel que servi par decks/*.json */
  function setDecks(list) {
    decks = (list || []).map(raw => {
      const id = raw.id;
      const cards = (raw.cards || [])
        .filter(c => c && typeof c.n === 'string' && c.n.trim())
        .map((c, i) => ({ id: `${id}:${i}`, n: c.n.trim(), c: (c.c || 'Divers').trim(), d: [1, 2, 3].includes(Number(c.d)) ? Number(c.d) : 2, deck: id }));
      return { id, name: raw.name || id, description: raw.description || '', cards };
    }).filter(d => d.cards.length);
  }
  const deckIds = () => decks.map(d => d.id);
  function summary() {
    return decks.map(d => ({
      id: d.id, name: d.name, description: d.description, count: d.cards.length,
      cats: [...d.cards.reduce((m, c) => m.set(c.c, (m.get(c.c) || 0) + 1), new Map())].map(([n, count]) => ({ n, count })),
    }));
  }
  function pool(ids, difficulties, categories) {
    const wanted = new Set(ids), levels = new Set((difficulties || [1, 2, 3]).map(Number));
    const cats = Array.isArray(categories) && categories.length ? new Set(categories) : null;
    return decks.filter(d => wanted.has(d.id)).flatMap(d => d.cards).filter(c => levels.has(c.d) && (!cats || cats.has(c.c)));
  }
  function allCategories() { const s = new Set(); decks.forEach(d => d.cards.forEach(c => s.add(c.c))); return [...s]; }
  function cardByGlobalId(id) { for (const d of decks) { const c = d.cards.find(x => x.id === id); if (c) return c; } return null; }

  // ------------------------------------------------------------ historique (cartes déjà vues)
  // Dans la mémoire du téléphone hôte : une soirée s'arrête et reprend le lendemain.
  const HIST_KEY = 'sab-vues';
  function histRead() { try { const v = JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
  function histWrite(v) { try { localStorage.setItem(HIST_KEY, JSON.stringify(v)); } catch { } }
  const history = {
    set() { return new Set(histRead()); },
    size() { return histRead().length; },
    add(ids) { const v = histRead(), known = new Set(v); ids.forEach(id => { if (!known.has(id)) { v.push(id); known.add(id); } }); histWrite(v.slice(-4000)); },
    clear() { histWrite([]); },
  };

  // ------------------------------------------------------------ salon
  function createRoom({ code, hostId, hostName, decks: ids }) {
    const host = { id: hostId, name: sanitizeName(hostName, 'Hôte'), teamId: null, connected: true, hand: [], discard: [], ready: false };
    return {
      code, createdAt: Date.now(), hostId,
      phase: 'teams',
      settings: { ...DEFAULT_SETTINGS, decks: (ids || deckIds()).slice() },
      players: [host],
      teams: TEAM_PRESETS.slice(0, 2).map((t, i) => ({ id: `team-${i + 1}`, ...t })),
      scores: { 'team-1': [], 'team-2': [] },
      dealtCards: {}, strokes: [], set: [], pile: [], currentCardId: null,
      round: 0, turn: null, lastTurn: null, roundGuesses: {}, gallery: [], galleryArchive: [], buzzer: null,
      rotation: { teamIdx: 0, nextPlayer: {} },
    };
  }
  const playersOfTeam = (room, teamId) => room.players.filter(p => p.teamId === teamId);
  const findPlayer = (room, id) => room.players.find(p => p.id === id) || null;
  const isHost = (room, id) => room.hostId === id;
  const smallestTeam = room => room.teams.slice().sort((a, b) => playersOfTeam(room, a.id).length - playersOfTeam(room, b.id).length)[0];

  function addPlayer(room, id, name) {
    const existing = findPlayer(room, id);
    if (existing) { existing.connected = true; if (name) existing.name = sanitizeName(name, existing.name); return existing; }
    const player = { id, name: sanitizeName(name), teamId: null, connected: true, hand: [], discard: [], ready: false };
    // Arrivée après la composition : on le glisse dans la plus petite équipe pour qu'il joue tout de suite.
    const manualPick = room.phase === 'teams' && room.settings.teamMode === 'manual';
    if (!manualPick) { const t = smallestTeam(room); if (t) player.teamId = t.id; }
    room.players.push(player);
    return player;
  }
  function dealTo(room, player, availableCards, seenIds = new Set()) {
    const per = room.settings.dealPerPlayer;
    const alreadyDealt = new Set(Object.keys(room.dealtCards));
    const fresh = drawForGame(availableCards.filter(c => !alreadyDealt.has(c.id)), per, seenIds);
    if (fresh.length < per) { player.hand = []; player.discard = []; player.ready = true; return false; }
    fresh.forEach(c => { room.dealtCards[c.id] = c; });
    player.hand = fresh.map(c => c.id); player.discard = []; player.ready = false;
    return true;
  }
  function setTeam(room, playerId, teamId) {
    const p = findPlayer(room, playerId); if (!p) return false;
    if (teamId !== null && !room.teams.some(t => t.id === teamId)) return false;
    p.teamId = teamId; return true;
  }
  function addTeam(room) {
    if (room.teams.length >= TEAM_PRESETS.length) return false;
    const preset = TEAM_PRESETS[room.teams.length], id = `team-${room.teams.length + 1}`;
    room.teams.push({ id, ...preset }); room.scores[id] = []; return true;
  }
  function removeTeam(room) {
    if (room.teams.length <= 2) return false;
    const removed = room.teams.pop(); delete room.scores[removed.id];
    room.players.forEach(p => { if (p.teamId === removed.id) p.teamId = null; });
    return true;
  }
  function updateSettings(room, patch, availableCategories = null) {
    const s = room.settings;
    if (Array.isArray(patch.roundTypes)) { const picked = []; patch.roundTypes.forEach(t => { if (ROUND_TYPES[t] && !picked.includes(t)) picked.push(t); }); if (picked.length >= 1 && picked.length <= Object.keys(ROUND_TYPES).length) s.roundTypes = picked; }
    if ('turnSeconds' in patch) s.turnSeconds = clamp(patch.turnSeconds, SETTINGS_BOUNDS.turnSeconds, s.turnSeconds);
    if ('drawSeconds' in patch) s.drawSeconds = clamp(patch.drawSeconds, SETTINGS_BOUNDS.drawSeconds, s.drawSeconds);
    if ('dealPerPlayer' in patch) s.dealPerPlayer = clamp(patch.dealPerPlayer, SETTINGS_BOUNDS.dealPerPlayer, s.dealPerPlayer);
    if ('discardPerPlayer' in patch) s.discardPerPlayer = clamp(patch.discardPerPlayer, SETTINGS_BOUNDS.discardPerPlayer, s.discardPerPlayer);
    if (s.discardPerPlayer >= s.dealPerPlayer) s.discardPerPlayer = s.dealPerPlayer - 1;
    if (patch.teamMode === 'random' || patch.teamMode === 'manual') s.teamMode = patch.teamMode;
    if (Array.isArray(patch.decks)) { const picked = patch.decks.filter(id => deckIds().includes(id)); if (picked.length) s.decks = picked; }
    if (Array.isArray(patch.categories) && Array.isArray(availableCategories)) {
      const picked = patch.categories.filter(c => availableCategories.includes(c));
      if (picked.length) s.categories = picked.length === availableCategories.length ? null : picked;
    }
    if (Array.isArray(patch.difficulties)) { const picked = patch.difficulties.map(Number).filter(d => [1, 2, 3].includes(d)); if (picked.length) s.difficulties = [...new Set(picked)].sort(); }
  }

  // ------------------------------------------------------------ équipes
  function randomizeTeams(room) { shuffle(room.players.slice()).forEach((p, i) => { p.teamId = room.teams[i % room.teams.length].id; }); }
  function clearTeams(room) { room.players.forEach(p => { p.teamId = null; }); }
  function teamProblems(room, availableCards) {
    const problems = [];
    if (room.teams.filter(t => playersOfTeam(room, t.id).length > 0).length < 2) problems.push('Il faut au moins deux équipes avec un joueur chacune.');
    const orphans = room.players.filter(p => !p.teamId);
    if (orphans.length) problems.push(orphans.length === 1 ? `${orphans[0].name} n'a pas d'équipe.` : `${orphans.length} joueurs n'ont pas d'équipe.`);
    const need = room.players.length * room.settings.dealPerPlayer;
    if (availableCards.length < need) problems.push(`Il faut ${need} cartes pour distribuer, seulement ${availableCards.length} disponibles. Ajoute un deck ou une difficulté.`);
    return problems;
  }

  // ------------------------------------------------------------ distribution
  /** Tirage stratifié par thème : une carte de chaque catégorie à tour de rôle, pour la variété. */
  function stratifiedDraw(cards, count) {
    const byTheme = new Map();
    cards.forEach(c => { if (!byTheme.has(c.c)) byTheme.set(c.c, []); byTheme.get(c.c).push(c); });
    const buckets = [...byTheme.values()].map(l => shuffle(l));
    const out = []; let round = 0;
    while (out.length < count) {
      const available = shuffle(buckets.filter(b => b.length > round));
      if (!available.length) break;
      for (const b of available) { out.push(b[round]); if (out.length === count) return out; }
      round += 1;
    }
    return out;
  }
  function drawForGame(availableCards, need, seenIds = new Set()) {
    const drawn = stratifiedDraw(availableCards.filter(c => !seenIds.has(c.id)), need);
    if (drawn.length < need) {
      const taken = new Set(drawn.map(c => c.id));
      return drawn.concat(stratifiedDraw(availableCards.filter(c => !taken.has(c.id)), need - drawn.length));
    }
    return drawn;
  }
  function deal(room, availableCards, seenIds = new Set()) {
    const per = room.settings.dealPerPlayer;
    const drawn = drawForGame(availableCards, room.players.length * per, seenIds);
    room.dealtCards = {};
    room.players.forEach(p => { p.hand = []; p.discard = []; p.ready = false; });
    drawn.forEach((c, i) => { room.dealtCards[c.id] = c; room.players[i % room.players.length].hand.push(c.id); });
    room.players.forEach(p => { p.hand = shuffle(p.hand); });
    room.phase = 'selection';
  }
  function toggleDiscard(room, playerId, cardId) {
    if (room.phase !== 'selection') return false;
    const p = findPlayer(room, playerId); if (!p || p.ready || !p.hand.includes(cardId)) return false;
    const at = p.discard.indexOf(cardId);
    if (at >= 0) p.discard.splice(at, 1);
    else { if (p.discard.length >= room.settings.discardPerPlayer) return false; p.discard.push(cardId); }
    return true;
  }
  function validateSelection(room, playerId) {
    if (room.phase !== 'selection') return false;
    const p = findPlayer(room, playerId); if (!p || p.ready || p.discard.length !== room.settings.discardPerPlayer) return false;
    p.ready = true; return true;
  }
  function unvalidateSelection(room, playerId) {
    if (room.phase !== 'selection') return false;
    const p = findPlayer(room, playerId); if (!p || !p.ready) return false;
    p.ready = false; return true;
  }
  function autoValidate(room, player) {
    const need = room.settings.discardPerPlayer, rest = player.hand.filter(id => !player.discard.includes(id));
    while (player.discard.length < need && rest.length > 1) player.discard.push(rest.pop());
    player.ready = true;
  }
  const pendingPlayers = room => room.players.filter(p => p.connected && !p.ready);
  const selectionDone = room => room.phase === 'selection' && pendingPlayers(room).length === 0;

  function buildDeckAndStart(room) {
    room.players.forEach(p => { if (!p.ready) autoValidate(room, p); });
    const kept = [];
    room.players.forEach(p => { (p.hand || []).forEach(id => { if (!p.discard.includes(id) && room.dealtCards[id]) kept.push(room.dealtCards[id]); }); });
    room.set = shuffle(kept); room.round = 0;
    room.teams.forEach(t => { room.scores[t.id] = []; });
    room.rotation = { teamIdx: randomInt(room.teams.length), nextPlayer: {} };
    room.teams.forEach(t => { const n = playersOfTeam(room, t.id).length; if (n) room.rotation.nextPlayer[t.id] = randomInt(n); });
    room.lastTurn = null;
    beginRound(room);
  }

  // ------------------------------------------------------------ manches et tours
  function roundInfo(room, index = room.round - 1) { return ROUND_TYPES[(room.settings.roundTypes || [])[index]] || ROUND_TYPES.free; }
  const isDrawingRound = room => !!roundInfo(room).draw;

  function beginRound(room) {
    room.round += 1;
    room.pile = shuffle(room.set.map(c => c.id));
    room.currentCardId = null; room.strokes = []; room.roundGuesses = {};
    if (room.gallery && room.gallery.length) room.galleryArchive = (room.galleryArchive || []).concat(room.gallery);
    room.gallery = []; room.buzzer = null;
    room.teams.forEach(t => { room.scores[t.id][room.round - 1] = 0; });
    room.turn = null; room.phase = 'turn-idle';
    prepareTurn(room);
  }
  function prepareTurn(room) {
    const teams = room.teams.filter(t => playersOfTeam(room, t.id).length > 0);
    if (!teams.length) { room.turn = null; return; }
    let guard = 0, team = room.teams[room.rotation.teamIdx % room.teams.length];
    while (playersOfTeam(room, team.id).length === 0 && guard < room.teams.length) { room.rotation.teamIdx = (room.rotation.teamIdx + 1) % room.teams.length; team = room.teams[room.rotation.teamIdx]; guard += 1; }
    const members = playersOfTeam(room, team.id), connected = members.filter(p => p.connected), poolP = connected.length ? connected : members;
    const cursor = room.rotation.nextPlayer[team.id] ?? 0;
    const describer = poolP[cursor % poolP.length];
    room.rotation.nextPlayer[team.id] = (cursor + 1) % poolP.length;
    room.turn = { teamId: team.id, playerId: describer.id, endsAt: null, startsAt: null, guessed: [], passed: [] };
    room.phase = 'turn-idle';
  }
  const advanceRotation = room => { room.rotation.teamIdx = (room.rotation.teamIdx + 1) % room.teams.length; };
  const canStartTurn = (room, playerId) => room.phase === 'turn-idle' && room.turn && room.turn.playerId === playerId;
  const turnSecondsFor = room => isDrawingRound(room) ? room.settings.drawSeconds : room.settings.turnSeconds;

  function startTurn(room, now = Date.now()) {
    room.phase = 'turn-live';
    room.turn.startsAt = now + COUNTDOWN_MS;
    room.turn.endsAt = room.turn.startsAt + turnSecondsFor(room) * 1000;
    room.turn.guessed = []; room.turn.passed = []; room.turn.revealed = false;
    room.lastTurn = null; room.buzzer = null;
    drawCard(room);
    return room.turn.endsAt;
  }
  function drawCard(room) { room.currentCardId = room.pile.length ? room.pile.shift() : null; }
  const cardById = (room, id) => room.set.find(c => c.id === id) || room.dealtCards[id] || null;

  function markGuessed(room, playerId) {
    if (room.phase !== 'turn-live' || !room.turn || room.turn.playerId !== playerId || !room.currentCardId) return 'ignored';
    if (room.turn.startsAt && Date.now() < room.turn.startsAt) return 'ignored';
    room.turn.guessed.push(room.currentCardId);
    room.roundGuesses[room.currentCardId] = { teamId: room.turn.teamId, playerId };
    room.scores[room.turn.teamId][room.round - 1] += 1;
    drawCard(room);
    return room.currentCardId ? 'ok' : 'round-over';
  }
  function markPassed(room, playerId) {
    if (room.phase !== 'turn-live' || !room.turn || room.turn.playerId !== playerId || !room.currentCardId) return 'ignored';
    if (room.turn.startsAt && Date.now() < room.turn.startsAt) return 'ignored';
    const card = room.currentCardId;
    if (isDrawingRound(room)) captureDrawing(room, card, playerId, true);
    room.turn.passed.push(card); room.pile.push(card); drawCard(room);
    return 'ok';
  }
  function endTurn(room, reason = 'time') {
    if (isDrawingRound(room) && room.currentCardId) captureDrawing(room, room.currentCardId, room.turn.playerId, true);
    const team = room.teams.find(t => t.id === room.turn.teamId), describer = findPlayer(room, room.turn.playerId);
    room.lastTurn = {
      round: room.round, reason, teamId: team ? team.id : null, teamName: team ? team.name : '?', teamColor: team ? team.color : '#888',
      playerName: describer ? describer.name : '?',
      guessedNames: room.turn.guessed.map(id => (cardById(room, id) || {}).n).filter(Boolean),
      passedCount: room.turn.passed.length,
    };
    // Carte en main au gong : jamais révélée, l'hôte pourra arbitrer.
    room.buzzer = reason === 'time' && room.currentCardId ? { cardId: room.currentCardId, teamId: room.turn.teamId, playerId: room.turn.playerId } : null;
    if (room.currentCardId) { room.pile.push(room.currentCardId); room.currentCardId = null; }
    room.pile = shuffle(room.pile);
    room.turn.endsAt = null;
    if (room.pile.length === 0) { room.phase = room.round >= room.settings.roundTypes.length ? 'game-end' : 'round-end'; return room.phase; }
    advanceRotation(room); prepareTurn(room);
    return 'next-turn';
  }
  function amendGuesses(room, cardIds) {
    if (!['turn-idle', 'round-end', 'game-end'].includes(room.phase)) return 0;
    const wasBetweenTurns = room.phase === 'turn-idle';
    let n = 0;
    cardIds.forEach(id => {
      const g = room.roundGuesses[id]; if (!g || room.pile.includes(id)) return;
      const arr = room.scores[g.teamId]; if (arr && arr[room.round - 1] > 0) arr[room.round - 1] -= 1;
      if (room.lastTurn && Array.isArray(room.lastTurn.guessedNames)) { const nm = (cardById(room, id) || {}).n; const at = room.lastTurn.guessedNames.indexOf(nm); if (at >= 0) room.lastTurn.guessedNames.splice(at, 1); }
      delete room.roundGuesses[id]; room.pile.push(id); n += 1;
    });
    if (n) { room.pile = shuffle(room.pile); if (!wasBetweenTurns) { room.lastTurn = null; advanceRotation(room); prepareTurn(room); } }
    return n;
  }
  function buzzerResolve(room, accept) {
    const b = room.buzzer; if (!b || room.phase !== 'turn-idle') return false;
    room.buzzer = null; if (!accept) return true;
    const at = room.pile.indexOf(b.cardId); if (at < 0) return true;
    room.pile.splice(at, 1);
    room.scores[b.teamId][room.round - 1] += 1;
    room.roundGuesses[b.cardId] = { teamId: b.teamId, playerId: b.playerId };
    const gal = (room.gallery || []).find(it => it.cardId === b.cardId && it.missed); if (gal) gal.missed = false;
    if (room.lastTurn && Array.isArray(room.lastTurn.guessedNames)) { const nm = (cardById(room, b.cardId) || {}).n; if (nm) room.lastTurn.guessedNames.push(nm); }
    if (room.pile.length === 0) {
      room.rotation.teamIdx = (room.rotation.teamIdx + room.teams.length - 1) % room.teams.length;
      room.turn = null; room.phase = room.round >= room.settings.roundTypes.length ? 'game-end' : 'round-end';
    }
    return true;
  }
  function nextRound(room) { if (room.phase !== 'round-end') return false; advanceRotation(room); beginRound(room); return true; }

  // ------------------------------------------------------------ dessin
  function appendStroke(room, seg) {
    if (!seg || typeof seg.id !== 'string' || seg.id.length > 24) return false;
    const pts = Array.isArray(seg.p) ? seg.p : [];
    if (!pts.length || pts.length % 2 !== 0 || pts.length > 512) return false;
    if (!pts.every(n => typeof n === 'number' && Number.isFinite(n) && n >= -0.1 && n <= 1.1)) return false;
    let stroke = room.strokes.find(s => s.id === seg.id);
    if (!stroke) {
      if (room.strokes.length >= MAX_STROKES) return false;
      stroke = { id: seg.id, c: HEX_COLOR.test(String(seg.c)) ? String(seg.c).toLowerCase() : DRAW_COLORS[0], w: DRAW_WIDTHS.includes(seg.w) ? seg.w : DRAW_WIDTHS[1], e: !!seg.e, p: [] };
      if (seg.t === 'fill') stroke.t = 'fill';
      room.strokes.push(stroke);
    }
    if (stroke.p.length + pts.length > MAX_POINTS_PER_STROKE) return false;
    stroke.p.push(...pts);
    return true;
  }
  function captureDrawing(room, cardId, playerId, missed = false) {
    if (!room.strokes.length) return;
    room.gallery = room.gallery || []; if (room.gallery.length >= 100) return;
    const card = cardById(room, cardId), p = findPlayer(room, playerId);
    room.gallery.push({ cardId, n: card ? card.n : '?', playerName: p ? p.name : '?', missed: !!missed, strokes: room.strokes.map(s => ({ ...s, p: s.p.slice() })) });
  }
  const undoStroke = room => !!room.strokes.pop();
  const clearStrokes = room => { room.strokes = []; };

  function resetToLobby(room) {
    room.phase = 'teams'; room.round = 0; room.set = []; room.pile = []; room.dealtCards = {}; room.strokes = [];
    room.roundGuesses = {}; room.gallery = []; room.galleryArchive = []; room.buzzer = null; room.currentCardId = null;
    room.turn = null; room.lastTurn = null;
    room.players.forEach(p => { p.hand = []; p.discard = []; p.ready = false; });
    room.teams.forEach(t => { room.scores[t.id] = []; });
    if (room.settings.teamMode === 'random') randomizeTeams(room);
  }

  // ------------------------------------------------------------ vue par joueur
  const teamTotal = (room, teamId) => (room.scores[teamId] || []).reduce((a, b) => a + (b || 0), 0);
  const publicPlayer = (room, p) => ({ id: p.id, name: p.name, connected: p.connected, isHost: room.hostId === p.id, ready: !!p.ready });
  function galleryView(room, rinfo) {
    let list = null;
    if (room.phase === 'game-end') list = (room.galleryArchive || []).concat(rinfo.draw ? (room.gallery || []) : []);
    else if (room.phase === 'round-end' && rinfo.draw) list = room.gallery || [];
    if (!list || !list.length) return null;
    return list.slice().sort((a, b) => (a.missed ? 1 : 0) - (b.missed ? 1 : 0)).map(({ cardId, ...rest }) => rest);
  }
  /** Projection filtrée : la main et la carte en cours ne sortent que vers leur destinataire. */
  function viewFor(room, playerId, extras = {}) {
    const me = findPlayer(room, playerId);
    const iDescribe = !!(room.turn && room.turn.playerId === playerId);
    const rinfo = roundInfo(room);
    const countdownOver = !room.turn || !room.turn.startsAt || Date.now() >= room.turn.startsAt;
    const card = iDescribe && room.phase === 'turn-live' && countdownOver ? cardById(room, room.currentCardId) : null;
    const hand = me && room.phase === 'selection'
      ? me.hand.map(id => { const c = room.dealtCards[id]; return c ? { id, n: c.n, c: c.c, d: c.d, discarded: me.discard.includes(id) } : null; }).filter(Boolean)
      : null;
    return {
      phase: room.phase, round: room.round, roundCount: room.settings.roundTypes.length,
      roundTitle: rinfo.title, roundRule: rinfo.rule, roundDraw: !!rinfo.draw, roundMime: !!rinfo.mime,
      turnTotal: turnSecondsFor(room),
      nextRoundInfo: room.phase === 'round-end' ? { title: roundInfo(room, room.round).title, rule: roundInfo(room, room.round).rule, draw: !!roundInfo(room, room.round).draw } : null,
      settings: { ...room.settings }, hostId: room.hostId,
      you: me ? { id: me.id, name: me.name, teamId: me.teamId, isHost: room.hostId === me.id, isDescriber: iDescribe, ready: !!me.ready, discardCount: (me.discard || []).length } : null,
      players: room.players.map(p => publicPlayer(room, p)),
      teams: room.teams.map(t => ({ id: t.id, name: t.name, color: t.color, scores: (room.scores[t.id] || []).slice(), total: teamTotal(room, t.id), players: playersOfTeam(room, t.id).map(p => publicPlayer(room, p)) })),
      unassigned: room.players.filter(p => !p.teamId).map(p => publicPlayer(room, p)),
      hand,
      selection: room.phase === 'selection' ? { dealt: room.settings.dealPerPlayer, toDiscard: room.settings.discardPerPlayer, readyCount: room.players.filter(p => p.connected && p.ready).length, totalCount: room.players.filter(p => p.connected).length, waitingFor: pendingPlayers(room).map(p => p.name) } : null,
      cardsTotal: room.set.length, cardsLeft: room.pile.length + (room.currentCardId ? 1 : 0),
      turn: room.turn ? {
        teamId: room.turn.teamId, teamName: (room.teams.find(t => t.id === room.turn.teamId) || {}).name || '?', teamColor: (room.teams.find(t => t.id === room.turn.teamId) || {}).color || '#888',
        playerId: room.turn.playerId, playerName: (findPlayer(room, room.turn.playerId) || {}).name || '?',
        endsAt: room.turn.endsAt, startsAt: room.turn.startsAt || null,
        guessedCount: room.turn.guessed.length, passedCount: room.turn.passed.length,
        guessedNames: room.turn.guessed.map(id => (cardById(room, id) || {}).n).filter(Boolean),
      } : null,
      card: card ? { n: card.n, c: card.c, d: card.d } : null,
      buzzer: room.buzzer && room.hostId === playerId ? { teamName: (room.teams.find(t => t.id === room.buzzer.teamId) || {}).name || '?', playerName: (findPlayer(room, room.buzzer.playerId) || {}).name || '?' } : null,
      gallery: galleryView(room, rinfo),
      correctable: ['turn-idle', 'round-end', 'game-end'].includes(room.phase)
        ? Object.entries(room.roundGuesses || {}).map(([id, g]) => ({ id, n: (cardById(room, id) || {}).n, teamName: (room.teams.find(t => t.id === g.teamId) || {}).name || '?', playerName: (findPlayer(room, g.playerId) || {}).name || '?' })).filter(x => x.n)
        : null,
      lastTurn: room.lastTurn,
      serverNow: Date.now(),
      ...extras,
    };
  }

  return {
    ROUND_TYPES, DEFAULT_SETTINGS, TEAM_PRESETS, DRAW_COLORS, DRAW_WIDTHS, REACTIONS, COUNTDOWN_MS,
    setDecks, deckIds, summary, pool, allCategories, history,
    createRoom, addPlayer, dealTo, findPlayer, isHost, playersOfTeam, setTeam, addTeam, removeTeam, updateSettings,
    randomizeTeams, clearTeams, teamProblems, deal, toggleDiscard, validateSelection, unvalidateSelection, autoValidate,
    pendingPlayers, selectionDone, buildDeckAndStart, prepareTurn, canStartTurn, turnSecondsFor, startTurn,
    markGuessed, markPassed, endTurn, amendGuesses, buzzerResolve, nextRound, isDrawingRound,
    appendStroke, captureDrawing, undoStroke, clearStrokes, sanitizeReaction, resetToLobby, viewFor,
  };
})();
