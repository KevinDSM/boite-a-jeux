/* Diapason — l'équivalent maison de Wavelength : se mettre sur la même longueur d'onde.

   Une carte donne deux extrêmes (« Froid ↔ Chaud »). Le médium est seul à voir où se cache la cible
   sur le cadran ; il donne un indice (un mot, un nom, n'importe quoi) qui la situe entre les deux.
   Les autres placent l'aiguille au jugé : plein centre 4 points, puis 3, puis 2.

   Deux façons de jouer :
   - Chacun pour soi : le médium tourne, chacun place sa propre aiguille sur son téléphone ; le médium
     gagne la moyenne des points des autres (un bon indice profite à tout le monde).
   - En équipes (la règle d'origine) : l'équipe du médium déplace une aiguille commune, en direct sur
     tous les écrans, puis l'équipe adverse parie que la cible est plus à gauche ou plus à droite
     (1 point, sauf en plein centre). Une équipe en retard qui fait un 4 rejoue aussitôt.
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.dp), actions « dp:… ».
   Chargé après app.js et diapason-cartes.js : réutilise $, el, act, esc, toast, shuffle, net et view. */

'use strict';

const Diapason = (() => {
  const BANDS = [[2.5, 4], [7.5, 3], [12.5, 2]];               // demi-largeur de chaque zone, en % du cadran
  const TEAMS = ['Corail', 'Lagon'], SEEN_KEY = 'dp-seen';
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const points = d => { for (const [w, p] of BANDS) if (d <= w) return p; return 0; };
  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };
  const members = (room, t) => room.order.map(id => pl(room, id)).filter(p => p && p.team === t);
  const online = list => list.filter(p => p.online);
  const guessers = room => room.order.map(id => pl(room, id)).filter(p => p.online && p.id !== room.psychicId);

  function deck() {
    let seen = new Set(); try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { }
    const ids = [...DP_CARDS.keys()];
    return shuffle(ids.filter(i => seen.has(i))).concat(shuffle(ids.filter(i => !seen.has(i))));   // pop() : les cartes jamais vues d'abord
  }
  function remember(i) { try { const s = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); s.add(i); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-150))); } catch { } }
  function draw(room) {
    if (!room.deck.length) room.deck = deck();
    room.card = room.deck.pop(); remember(room.card);
  }

  function create({ hostId, players, mode, tours, target }) {
    const room = {
      hostId, mode: mode === 'teams' ? 'teams' : 'solo', tours: clamp(tours, 1, 5, 1), target: clamp(target, 5, 30, 10),
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, score: 0, team: 0 })),
      order: [], deck: deck(), card: 0, pos: 50, clue: '', rerolls: 2, psychicId: null,
      phase: 'clue', round: 0, rounds: 0, guesses: {}, dial: 50, side: null, sideBy: null, result: null,
      teams: TEAMS.map(name => ({ name, score: 0, psy: -1 })), active: Math.random() < .5 ? 0 : 1, again: false,
      log: [], seq: 0, turnAt: Date.now(), winner: null,
    };
    room.order = shuffle(room.players.filter(p => p.online).map(p => p.id));
    room.order.forEach((id, i) => { pl(room, id).team = i % 2; });
    room.rounds = room.mode === 'solo' ? room.tours * room.order.length : 0;
    nextRound(room, true);
    return room;
  }

  function nextRound(room, first) {
    if (!first && room.mode === 'solo' && room.round >= room.rounds) return over(room);   // tour sauté à la dernière manche
    room.round += 1;
    if (room.mode === 'solo') {
      const n = room.order.length; let k = (room.round - 1) % n, g = 0;
      while (g++ < n && !pl(room, room.order[k])?.online) k = (k + 1) % n;
      room.psychicId = room.order[k];
    } else {
      if (!first && !room.again) room.active = 1 - room.active;
      room.again = false;
      const t = room.teams[room.active], mem = online(members(room, room.active));
      if (!mem.length) { room.active = 1 - room.active; }
      const m2 = online(members(room, room.active)), t2 = room.teams[room.active];
      t2.psy = (t2.psy + 1) % Math.max(1, m2.length);
      room.psychicId = m2[t2.psy]?.id || null;
      void t;
    }
    draw(room);
    room.pos = Math.round((4 + Math.random() * 92) * 2) / 2;
    room.clue = ''; room.rerolls = 2; room.guesses = {}; room.dial = 50; room.side = null; room.sideBy = null; room.result = null;
    room.phase = 'clue'; room.turnAt = Date.now(); room.seq += 1;
  }

  function reveal(room) {
    const d = v => Math.abs(v - room.pos);
    if (room.mode === 'solo') {
      const list = Object.entries(room.guesses).map(([id, value]) => { const p = pl(room, id); const pts = points(d(value)); if (p) p.score += pts; return { id, name: p?.name || '?', value, pts }; });
      const psyGain = list.length ? Math.round(list.reduce((a, g) => a + g.pts, 0) / list.length) : 0;
      const psy = pl(room, room.psychicId); if (psy) psy.score += psyGain;
      room.result = { guesses: list.sort((a, b) => b.pts - a.pts || d(a.value) - d(b.value)), psyGain };
      const best = list.filter(g => g.pts === 4).map(g => g.name);
      log(room, best.length ? `Plein centre pour ${best.join(', ')} !` : `Manche ${room.round} : ${list.length ? 'meilleur score ' + (list[0]?.pts || 0) : 'personne n’a joué'}.`);
    } else {
      const pts = points(d(room.dial)), act = room.teams[room.active], other = room.teams[1 - room.active];
      act.score += pts;
      let sideOk = null;
      if (room.side) { sideOk = pts < 4 && ((room.side === 'left' && room.pos < room.dial) || (room.side === 'right' && room.pos > room.dial)); if (sideOk) other.score += 1; }
      if (pts === 4 && act.score < other.score) room.again = true;
      room.result = { pts, sideOk, again: room.again, dial: room.dial };
      log(room, `Équipe ${act.name} : ${pts} point${pts > 1 ? 's' : ''}${sideOk ? `, et 1 point pour ${other.name}` : ''}.`);
    }
    room.phase = 'reveal'; room.turnAt = Date.now(); room.seq += 1;
    return null;
  }
  function checkGuesses(room) {
    if (room.phase === 'guess' && room.mode === 'solo' && guessers(room).every(p => room.guesses[p.id] !== undefined)) reveal(room);
  }
  function lock(room) {
    const others = online(members(room, 1 - room.active));
    if (others.length) { room.phase = 'side'; room.turnAt = Date.now(); room.seq += 1; return null; }
    return reveal(room);
  }
  function next(room, pid) {
    if (room.phase !== 'reveal' || (pid !== room.hostId && pid !== room.psychicId)) return null;
    if (room.mode === 'solo' && room.round >= room.rounds) return over(room);
    if (room.mode === 'teams') {
      const [a, b] = room.teams.map(t => t.score);
      if (Math.max(a, b) >= room.target && a !== b) return over(room);
    }
    nextRound(room); return null;
  }
  function over(room) {
    room.phase = 'over'; room.seq += 1;
    if (room.mode === 'teams') room.winner = room.teams[0].score > room.teams[1].score ? 0 : 1;
    else room.winner = [...room.players].sort((a, b) => b.score - a.score)[0]?.id || null;
    return null;
  }

  function act(room, pid, m) {
    const me = pl(room, pid), isPsy = pid === room.psychicId;
    switch (m.t) {
      case 'dp:reroll':
        if (room.phase !== 'clue' || !isPsy || room.rerolls <= 0) return null;
        room.rerolls -= 1; draw(room); room.seq += 1; return null;
      case 'dp:clue':
        if (room.phase !== 'clue' || !isPsy) return null;
        room.clue = String(m.text || '').trim().slice(0, 80);
        room.phase = 'guess'; room.turnAt = Date.now(); room.seq += 1;
        log(room, room.clue ? `Indice de ${me.name} : « ${room.clue} »` : `${me.name} donne son indice à voix haute.`);
        if (room.mode === 'solo') checkGuesses(room);
        return null;
      case 'dp:guess':
        if (room.phase !== 'guess' || room.mode !== 'solo' || !me || isPsy || room.guesses[pid] !== undefined) return null;
        room.guesses[pid] = clamp(m.value, 0, 100, 50); room.seq += 1; checkGuesses(room); return null;
      case 'dp:dial':
        if (room.phase !== 'guess' || room.mode !== 'teams' || !me || isPsy || me.team !== room.active) return null;
        room.dial = clamp(m.value, 0, 100, room.dial); room.seq += 1; return null;
      case 'dp:lock':
        if (room.phase !== 'guess' || room.mode !== 'teams' || !me || isPsy || me.team !== room.active) return null;
        if (m.value !== undefined) room.dial = clamp(m.value, 0, 100, room.dial);
        log(room, `${me.name} valide l’aiguille pour l’équipe ${room.teams[room.active].name}.`);
        return lock(room);
      case 'dp:side':
        if (room.phase !== 'side' || !me || me.team === room.active || (m.dir !== 'left' && m.dir !== 'right')) return null;
        room.side = m.dir; room.sideBy = me.name; return reveal(room);
      case 'dp:next': return next(room, pid);
      case 'dp:skip':
        if (pid !== room.hostId) return null;
        if (room.phase === 'clue') { log(room, 'Le médium passe son tour.'); room.again = true; nextRound(room); if (room.mode === 'solo') { /* le tour sauté compte quand même */ } return null; }
        if (room.phase === 'guess') return room.mode === 'solo' ? reveal(room) : lock(room);
        if (room.phase === 'side') return reveal(room);
        return null;
    }
    return null;
  }
  function tick() { return false; }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    const sizes = [0, 1].map(t => online(members(room, t)).length);
    room.players.push({ id, name, online: true, score: 0, team: sizes[0] <= sizes[1] ? 0 : 1 });
    room.order.push(id);
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on; if (on) return;
    if (id === room.psychicId && room.phase === 'clue') { room.again = true; nextRound(room); return; }
    checkGuesses(room);
  }
  const teamList = room => room.teams.map((t, i) => ({ name: t.name, score: t.score, members: members(room, i).map(p => p.name) }));
  const ranking = room => [...room.players].filter(p => room.order.includes(p.id)).sort((a, b) => b.score - a.score);

  function view(room, pid) {
    const me = pl(room, pid), isPsy = pid === room.psychicId, open = room.phase === 'reveal' || room.phase === 'over';
    const psy = pl(room, room.psychicId);
    return {
      phase: room.phase, mode: room.mode, round: room.round, rounds: room.rounds, target: room.target, seq: room.seq, isHost: pid === room.hostId,
      card: DP_CARDS[room.card], pos: isPsy || open ? room.pos : null, clue: room.clue, psychicName: psy?.name || '', isPsychic: isPsy, rerolls: isPsy ? room.rerolls : 0,
      seated: !!me, myTeam: me ? me.team : null, active: room.active, teams: room.mode === 'teams' ? teamList(room) : null,
      canDial: room.mode === 'teams' && room.phase === 'guess' && !!me && me.team === room.active && !isPsy,
      canSide: room.mode === 'teams' && room.phase === 'side' && !!me && me.team !== room.active,
      canGuess: room.mode === 'solo' && room.phase === 'guess' && !!me && !isPsy && room.guesses[pid] === undefined,
      dial: room.dial, myGuess: room.guesses[pid] ?? null, side: room.side, sideBy: room.sideBy,
      waiting: room.mode === 'solo' && room.phase === 'guess' ? guessers(room).filter(p => room.guesses[p.id] === undefined).map(p => p.name) : [],
      result: open ? room.result : null, quiet: Date.now() - room.turnAt,
      players: ranking(room).map(p => ({ id: p.id, name: p.name, score: p.score, online: p.online, me: p.id === pid, psychic: p.id === room.psychicId, team: p.team, done: room.phase === 'guess' && room.guesses[p.id] !== undefined })),
      winnerName: room.phase === 'over' ? (room.mode === 'teams' ? 'L’équipe ' + room.teams[room.winner].name : pl(room, room.winner)?.name || '') : '',
      log: room.log.slice(-3),
    };
  }
  return { BANDS, points, create, act, tick, join, setOnline, view, teamList, ranking };
})();

// ============================================================ écran
let dpKey = null, dpLocal = null, dpLocalUntil = 0, dpDragging = false, dpSendAt = 0, dpSendTimer = null, dpClue = '', dpSkipTimer = null;
const DP_SKIP_MS = 60000;
const dpAngle = v => Math.PI * (1 - v / 100);
const dpPt = (v, r) => [100 + r * Math.cos(dpAngle(v)), 100 - r * Math.sin(dpAngle(v))].map(n => n.toFixed(2));
function dpWedge(a, b, r) {
  a = Math.max(0, a); b = Math.min(100, b); if (b <= a) return '';
  const [x1, y1] = dpPt(a, r), [x2, y2] = dpPt(b, r);
  return `M100 100 L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2} Z`;
}

/** Le cadran : demi-disque, zones de la cible (si visibles), repères des joueurs, aiguille. */
function dpDialSVG(v, needle, markers) {
  const R = 90;
  let s = `<svg class="dp-dial" viewBox="0 0 200 112" role="img" aria-label="Cadran de ${esc(v.card[0])} à ${esc(v.card[1])}">`;
  s += `<path class="dp-rim" d="M4 100 A96 96 0 0 1 196 100 Z"/><path class="dp-face" d="M10 100 A${R} ${R} 0 0 1 190 100 Z"/>`;
  if (v.pos !== null) {
    const t = v.pos, [w4, w3, w2] = Diapason.BANDS.map(b => b[0]);
    s += `<g class="dp-target${v.phase === 'reveal' ? ' pop' : ''}"><path class="dp-b2" d="${dpWedge(t - w2, t + w2, R)}"/><path class="dp-b3" d="${dpWedge(t - w3, t + w3, R)}"/><path class="dp-b4" d="${dpWedge(t - w4, t + w4, R)}"/>`;
    [[t - w3, t - w2, '2'], [t - w4, t - w3, '3'], [t - w4, t + w4, '4'], [t + w4, t + w3, '3'], [t + w3, t + w2, '2']].forEach(([a, b, n]) => {
      const m = (Math.max(0, a) + Math.min(100, b)) / 2; if (Math.min(100, b) - Math.max(0, a) < 2.5) return;
      const [x, y] = dpPt(m, R - 11); s += `<text class="dp-bn" x="${x}" y="${y}">${n}</text>`;
    });
    s += '</g>';
  }
  for (let k = 0; k <= 20; k++) { const [x1, y1] = dpPt(k * 5, R + 1), [x2, y2] = dpPt(k * 5, R - (k % 5 ? 3 : 6)); s += `<line class="dp-tick" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; }
  (markers || []).forEach(m => { const [x, y] = dpPt(m.value, R - 26); s += `<g class="dp-mark${m.me ? ' me' : ''}"><circle cx="${x}" cy="${y}" r="6.5"/><text x="${x}" y="${(+y + 2.4).toFixed(2)}">${esc((m.name[0] || '?').toUpperCase())}</text></g>`; });
  if (needle !== null && needle !== undefined) s += `<g class="dp-needle" style="transform:rotate(${(-180 * (1 - needle / 100)).toFixed(2)}deg)"><line x1="100" y1="100" x2="186" y2="100"/><circle cx="186" cy="100" r="3.2"/></g>`;
  s += `<circle class="dp-hub" cx="100" cy="100" r="9"/></svg>`;
  return s;
}

function dpValueAt(svg, e) {
  const r = svg.getBoundingClientRect();
  const x = (e.clientX - r.left) * 200 / r.width - 100, y = 100 - (e.clientY - r.top) * 112 / r.height;
  let a = Math.atan2(y, x); if (y < 0) a = x < 0 ? Math.PI : 0;
  return Math.round(100 * (1 - a / Math.PI) * 2) / 2;
}
function dpSetNeedle(val) {
  const n = document.querySelector('#dp-main .dp-needle');
  if (n) n.style.transform = `rotate(${(-180 * (1 - val / 100)).toFixed(2)}deg)`;
}
function dpSendDial(val, now) {
  clearTimeout(dpSendTimer);
  const go = () => { dpSendAt = Date.now(); act({ t: 'dp:dial', value: val }); };
  if (now || Date.now() - dpSendAt > 120) go(); else dpSendTimer = setTimeout(go, 120);
}

function renderDiapason(v) {
  if (!v) return;
  const key = v.round + ':' + v.phase;
  if (key !== dpKey) { dpKey = key; dpLocal = null; dpDragging = false; if (v.phase === 'clue') dpClue = ''; }
  if (dpDragging) return;                                        // on ne reconstruit pas le cadran sous le doigt
  const root = $('#dp-main');
  const hadFocus = document.activeElement?.id === 'dp-clue';
  root.innerHTML = ''; clearTimeout(dpSkipTimer);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const teams = v.mode === 'teams', left = v.card[0], right = v.card[1];

  // en-tête et scores
  const head = teams ? `Équipe ${esc(v.teams[v.active].name)} joue · ${v.target} points pour gagner` : `Manche ${v.round} / ${v.rounds}`;
  root.appendChild(el('div', 'dp-head', `<span class="eyebrow">${head}</span><span class="dp-psy">${v.isPsychic ? 'Tu es le médium' : `Médium : <b>${esc(v.psychicName)}</b>`}</span>`));
  if (teams) {
    const sc = el('div', 'dp-teams dp-scores');
    v.teams.forEach((t, i) => sc.appendChild(el('div', `dp-team t${i}${i === v.active ? ' on' : ''}${v.myTeam === i ? ' mine' : ''}`, `<span class="dp-team-name">${esc(t.name)}${v.myTeam === i ? ' · toi' : ''}</span><b>${t.score}</b><small>${t.members.map(esc).join(', ')}</small>`)));
    root.appendChild(sc);
  } else {
    const sc = el('div', 'dp-players dp-scores');
    v.players.forEach(p => sc.appendChild(el('div', `dp-player${p.me ? ' me' : ''}${p.psychic ? ' psy' : ''}${p.done ? ' done' : ''}${p.online ? '' : ' off'}`, `<span>${esc(p.name)}</span><b>${p.score}</b>${p.psychic ? '<i>médium</i>' : p.done ? '<i>✓</i>' : ''}`)));
    root.appendChild(sc);
  }

  // la carte et l'indice
  root.appendChild(el('div', 'dp-card', `<span class="dp-l">← ${esc(left)}</span><span class="dp-r">${esc(right)} →</span>`));
  if (v.phase === 'clue') root.appendChild(el('p', 'dp-clue-show wait', v.isPsychic ? 'Seul ton écran montre la cible : cache-le bien !' : `${esc(v.psychicName)} cherche un indice…`));
  else root.appendChild(el('p', 'dp-clue-show', v.clue ? `« ${esc(v.clue)} »` : `${esc(v.psychicName)} a donné l’indice à voix haute`));

  // le cadran
  const interactive = v.canGuess || v.canDial;
  let needle = null;
  if (v.phase === 'guess' || v.phase === 'side' || v.phase === 'reveal' || v.phase === 'over') {
    if (teams) needle = v.canDial && dpLocal !== null && Date.now() < dpLocalUntil ? dpLocal : v.dial;
    else needle = v.canGuess ? (dpLocal ?? 50) : v.myGuess;
  }
  if (v.phase === 'guess' && v.isPsychic && !teams) needle = null;
  const markers = !teams && v.result ? v.result.guesses.map(g => ({ name: g.name, value: g.value, me: v.players.find(p => p.me)?.name === g.name })) : [];
  const wrap = el('div', 'dp-dial-wrap' + (interactive ? ' live' : ''), dpDialSVG(v, needle, markers) + `<span class="dp-end l">${esc(left)}</span><span class="dp-end r">${esc(right)}</span>`);
  root.appendChild(wrap);
  if (interactive) {
    const svg = wrap.querySelector('svg');
    const set = val => { dpLocal = val; dpLocalUntil = Date.now() + 800; dpSetNeedle(val); if (v.canDial) dpSendDial(val); };
    svg.onpointerdown = e => { e.preventDefault(); svg.setPointerCapture(e.pointerId); dpDragging = true; set(dpValueAt(svg, e)); };
    svg.onpointermove = e => { if (dpDragging) set(dpValueAt(svg, e)); };
    const end = () => { if (!dpDragging) return; dpDragging = false; if (v.canDial) dpSendDial(dpLocal, true); setTimeout(() => { if (view?.dp) renderDiapason(view.dp); }, 0); };
    svg.onpointerup = end; svg.onpointercancel = end;
    const nudge = el('div', 'dp-nudge');
    const step = d => { const cur = dpLocal ?? (teams ? v.dial : 50); set(Math.max(0, Math.min(100, cur + d))); if (!dpDragging) renderDiapason(view.dp); };
    nudge.append(btn('ghost small', '◀', () => step(-1)), el('span', 'dp-nudge-hint', 'Fais glisser l’aiguille'), btn('ghost small', '▶', () => step(1)));
    root.appendChild(nudge);
  }

  // ce que chacun doit faire
  const zone = el('div', 'dp-zone');
  if (v.phase === 'clue') {
    if (v.isPsychic) {
      zone.appendChild(el('p', 'dp-hint', `Trouve un indice qui place la cible entre « ${esc(left)} » et « ${esc(right)} ». Un mot, un nom, un film, ce que tu veux… mais pas un nombre !`));
      const input = el('input'); input.id = 'dp-clue'; input.type = 'text'; input.maxLength = 80; input.placeholder = 'Ton indice (ou dis-le à voix haute)'; input.autocomplete = 'off'; input.value = dpClue;
      input.oninput = () => { dpClue = input.value; };
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); act({ t: 'dp:clue', text: input.value }); } };
      zone.appendChild(input);
      const row = el('div', 'dp-row');
      row.append(btn('primary lg', 'Donner l’indice', () => act({ t: 'dp:clue', text: $('#dp-clue').value })));
      if (v.rerolls > 0) row.append(btn('ghost', `Autre carte (${v.rerolls})`, () => act({ t: 'dp:reroll' })));
      zone.appendChild(row);
      if (hadFocus) setTimeout(() => { const i = $('#dp-clue'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0);
    }
  }
  if (v.phase === 'guess') {
    if (v.canGuess) {
      zone.appendChild(el('p', 'dp-hint', 'Place ton aiguille où l’indice te semble tomber, puis valide.'));
      zone.appendChild(btn('primary lg', 'Valider ma position', () => act({ t: 'dp:guess', value: dpLocal ?? 50 })));
    } else if (!teams) zone.appendChild(el('p', 'dp-hint', v.isPsychic ? `Les autres cherchent… on attend ${v.waiting.map(esc).join(', ') || 'plus personne'}.` : `Position validée. On attend ${v.waiting.map(esc).join(', ') || 'plus personne'}.`));
    if (v.canDial) {
      zone.appendChild(el('p', 'dp-hint', 'Discutez et déplacez l’aiguille ensemble : chacun la voit bouger en direct. Validez quand vous êtes d’accord.'));
      zone.appendChild(btn('primary lg', 'On valide cette position', () => act({ t: 'dp:lock', value: dpLocal !== null && Date.now() < dpLocalUntil ? dpLocal : v.dial })));
    } else if (teams) zone.appendChild(el('p', 'dp-hint', v.isPsychic ? 'Ton équipe place l’aiguille… pas un mot, pas une grimace !' : `L’équipe ${esc(v.teams[v.active].name)} place son aiguille. Préparez votre pari : plus à gauche ou plus à droite ?`));
  }
  if (v.phase === 'side') {
    if (v.canSide) {
      zone.appendChild(el('p', 'dp-hint', 'La cible est-elle plus à gauche ou plus à droite de leur aiguille ? 1 point si vous avez raison.'));
      const row = el('div', 'dp-row two');
      row.append(btn('primary lg', '◀ Plus à gauche', () => act({ t: 'dp:side', dir: 'left' })), btn('primary lg', 'Plus à droite ▶', () => act({ t: 'dp:side', dir: 'right' })));
      zone.appendChild(row);
    } else zone.appendChild(el('p', 'dp-hint', `L’équipe ${esc(v.teams[1 - v.active].name)} parie : plus à gauche ou plus à droite ?`));
  }
  if (v.phase === 'reveal' && v.result) {
    const r = v.result;
    if (teams) {
      const ok = r.sideOk === null ? '' : r.sideOk ? ` · pari gagné pour ${esc(v.teams[1 - v.active].name)} (+1)` : ` · pari perdu pour ${esc(v.teams[1 - v.active].name)}`;
      zone.appendChild(el('p', 'dp-verdict', `${r.pts === 4 ? 'Plein centre ! ' : ''}Équipe ${esc(v.teams[v.active].name)} : +${r.pts}${ok}`));
      if (v.side) zone.appendChild(el('p', 'note', `${esc(v.sideBy)} a parié « plus à ${v.side === 'left' ? 'gauche' : 'droite'} ».`));
      if (r.again) zone.appendChild(el('p', 'dp-again', 'En retard et plein centre : l’équipe rejoue tout de suite !'));
    } else {
      const bull = r.guesses.filter(g => g.pts === 4).map(g => esc(g.name));
      zone.appendChild(el('p', 'dp-verdict', !r.guesses.length ? 'Personne n’a placé d’aiguille' : bull.length ? `Plein centre pour ${bull.join(' et ')} !` : r.guesses[0].pts ? `Meilleure aiguille : ${esc(r.guesses[0].name)}, +${r.guesses[0].pts}` : 'Personne dans la cible !'));
      if (r.guesses.length) zone.appendChild(el('p', 'dp-psygain', `${esc(v.psychicName)}, le médium, gagne +${r.psyGain} (la moyenne des autres)`));
      const list = el('ol', 'dp-results');
      r.guesses.forEach(g => list.appendChild(el('li', g.pts ? 'hit p' + g.pts : '', `<span>${esc(g.name)}</span><b>+${g.pts}</b>`)));
      zone.appendChild(list);
    }
    if (v.isHost || v.isPsychic) zone.appendChild(btn('primary lg', v.mode === 'solo' && v.round >= v.rounds ? 'Voir le classement' : 'Manche suivante', () => act({ t: 'dp:next' })));
    else zone.appendChild(el('p', 'note', 'L’hôte ou le médium lance la suite.'));
  }
  if (v.phase === 'over') {
    const rows = teams ? v.teams.map(t => ({ name: `${t.name} (${t.members.join(', ')})`, score: t.score })).sort((a, b) => b.score - a.score) : v.players;
    zone.appendChild(el('div', 'dp-final', `<span class="eyebrow">Partie terminée</span><p class="dp-verdict">${esc(v.winnerName)} gagne</p><ol class="dp-ranking">${rows.map(p => `<li${p.me ? ' class="me"' : ''}><span>${esc(p.name)}</span><b>${p.score}</b></li>`).join('')}</ol>`));
    if (v.isHost) zone.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
  }
  if (v.isHost && ['clue', 'guess', 'side'].includes(v.phase)) {
    if (v.quiet > DP_SKIP_MS) zone.appendChild(btn('ghost small', v.phase === 'clue' ? 'Le médium ne répond pas ? Passer son tour' : v.phase === 'guess' ? 'Quelqu’un bloque ? Révéler maintenant' : 'Passer le pari', () => act({ t: 'dp:skip' })));
    else dpSkipTimer = setTimeout(() => { if (view?.dp && !dpDragging && document.activeElement?.id !== 'dp-clue') renderDiapason(view.dp); }, DP_SKIP_MS - v.quiet + 200);
  }
  root.appendChild(zone);
  const lg = el('ul', 'dp-log'); v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t)))); root.appendChild(lg);
}
