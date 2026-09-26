/* Nom de code — l'équivalent maison de Codenames, en deux équipes.

   25 mots sur la grille. Chaque équipe a un espion qui connaît la couleur de chaque mot : 9 ou 8 agents
   de son équipe, 7 passants, 1 assassin. À son tour, l'espion donne un indice d'un seul mot et un
   nombre ; ses agents pointent les mots qu'ils pensent reliés, puis les retournent, un par un
   (au plus nombre + 1). Un mot de l'autre couleur ou un passant arrête le tour ; l'assassin fait perdre
   la partie. La première équipe qui retrouve tous ses agents gagne.
   Les robots s'appuient sur les thèmes de nomcode-mots.js (un robot espion annonce un thème).
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.nc), actions « nc:… ».
   Chargé après app.js et nomcode-mots.js : réutilise $, el, act, esc, toast, shuffle, norm, net et view. */

'use strict';

const NomCode = (() => {
  const TEAM = ['Rouge', 'Bleue'];
  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };
  const members = (room, t) => room.players.filter(p => p.inGame && p.team === t);
  const spyOf = (room, t) => members(room, t).find(p => p.spy);
  const left = (room, t) => room.board.filter(c => c.k === t && !c.rev).length;
  const themeKey = clue => Object.keys(NC_THEMES).find(k => norm(NC_THEMES[k]) === norm(clue));

  function create({ hostId, players }) {
    const room = {
      hostId, phase: 'setup', players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, inGame: p.online !== false, team: 0, spy: false })),
      board: [], starter: 0, active: 0, clue: null, points: {}, winner: null, reason: '', wins: [0, 0], round: 0, log: [], seq: 0, turnAt: Date.now(),
    };
    shuffleTeams(room);
    log(room, 'Deux équipes, deux espions. Chacun à sa place, et on lance.');
    return room;
  }
  function shuffleTeams(room) {
    const list = shuffle(room.players.filter(p => p.inGame));
    list.forEach((p, i) => { p.team = i % 2; p.spy = false; });
    [0, 1].forEach(t => { const m = members(room, t), human = m.filter(p => !p.bot); const s = (human.length ? human : m)[0]; if (s) s.spy = true; });
    room.seq += 1;
  }
  function fixSpies(room) { [0, 1].forEach(t => { if (!spyOf(room, t)) { const m = members(room, t); if (m[0]) m[0].spy = true; } }); }
  function deal(room) {
    const idx = shuffle([...NC_WORDS.keys()]).slice(0, 25);
    room.starter = room.round === 0 ? (Math.random() < .5 ? 0 : 1) : (room.winner === 0 ? 1 : 0);
    const keys = shuffle([...Array(room.starter === 0 ? 9 : 8).fill(0), ...Array(room.starter === 1 ? 9 : 8).fill(1), ...Array(7).fill(2), 3]);
    room.board = idx.map((w, i) => ({ w: NC_WORDS[w][0], th: NC_WORDS[w][1].split(' '), k: keys[i], rev: false }));
    room.active = room.starter; room.phase = 'clue'; room.clue = null; room.points = {}; room.winner = null; room.reason = ''; room.round += 1;
    log(room, `Grille ${room.round}. L’équipe ${TEAM[room.starter]} commence, avec 9 agents à retrouver.`);
    room.turnAt = Date.now(); room.seq += 1;
  }
  function endTurn(room, why) {
    if (why) log(room, why);
    room.active = 1 - room.active; room.phase = 'clue'; room.clue = null; room.points = {};
    room.turnAt = Date.now(); room.seq += 1;
  }
  function over(room, winner, reason) {
    room.phase = 'over'; room.winner = winner; room.reason = reason; room.wins[winner] += 1; room.points = {};
    log(room, `L’équipe ${TEAM[winner]} gagne la grille.`);
    room.turnAt = Date.now(); room.seq += 1;
  }

  function giveClue(room, pid, word, n) {
    const p = pl(room, pid);
    if (room.phase !== 'clue' || !p?.spy || p.team !== room.active) return null;
    const w = String(word || '').trim().replace(/\s+/g, ' ');
    if (!w) return 'Écris un indice';
    if (/\s/.test(w)) return 'Un seul mot, sans espace';
    if (w.length > 24) return 'Un mot plus court';
    if (room.board.some(c => norm(c.w) === norm(w))) return 'Ce mot est sur la grille, trouve autre chose';
    const num = +n === -1 ? -1 : Math.max(1, Math.min(9, Math.round(+n) || 1));
    room.clue = { word: w, n: num, left: num === -1 ? 99 : num + 1, made: 0 };
    room.phase = 'guess'; room.points = {}; room.turnAt = Date.now(); room.seq += 1;
    log(room, `${p.name} : « ${w} », ${num === -1 ? 'sans limite' : num}.`);
    return null;
  }
  const isAgent = (room, pid) => { const p = pl(room, pid); return !!p && p.inGame && !p.spy && p.team === room.active; };
  function point(room, pid, i) {
    if (room.phase !== 'guess' || !isAgent(room, pid) || !room.board[i] || room.board[i].rev) return null;
    const had = (room.points[i] || []).includes(pid);
    Object.keys(room.points).forEach(k => { room.points[k] = room.points[k].filter(x => x !== pid); if (!room.points[k].length) delete room.points[k]; });
    if (!had) (room.points[i] = room.points[i] || []).push(pid);
    room.seq += 1; return null;
  }
  function reveal(room, pid, i) {
    if (room.phase !== 'guess' || !isAgent(room, pid)) return null;
    const c = room.board[i]; if (!c || c.rev) return null;
    const p = pl(room, pid), t = room.active;
    c.rev = true; delete room.points[i]; room.clue.made += 1; room.turnAt = Date.now(); room.seq += 1;
    if (c.k === 3) { log(room, `${p.name} retourne ${c.w} : l’assassin.`); return over(room, 1 - t, 'assassin'); }
    if (c.k === t) {
      log(room, `${p.name} retourne ${c.w} : un agent ${TEAM[t] === 'Rouge' ? 'rouge' : 'bleu'}.`);
      if (!left(room, t)) return over(room, t, 'agents');
      room.clue.left -= 1;
      if (room.clue.left <= 0) endTurn(room, 'Plus d’essai, la main passe.');
      return null;
    }
    if (c.k === 1 - t) {
      if (!left(room, 1 - t)) { log(room, `${p.name} retourne ${c.w} : le dernier agent adverse.`); return over(room, 1 - t, 'offert'); }
      return endTurn(room, `${p.name} retourne ${c.w} : un agent adverse. La main passe.`);
    }
    return endTurn(room, `${p.name} retourne ${c.w} : un passant. La main passe.`);
  }
  function pass(room, pid) {
    if (room.phase !== 'guess' || !isAgent(room, pid) || !room.clue.made) return null;
    endTurn(room, `${pl(room, pid).name} s’arrête là.`); return null;
  }

  // ------------------------------------------------------------ robots
  function botClue(room) {
    const t = room.active, open = room.board.filter(c => !c.rev);
    const own = open.filter(c => c.k === t), foe = open.filter(c => c.k === 1 - t), mid = open.filter(c => c.k === 2), ass = open.find(c => c.k === 3);
    let best = null;
    Object.keys(NC_THEMES).forEach(k => {
      if (ass && ass.th.includes(k)) return;
      const a = own.filter(c => c.th.includes(k)).length; if (!a) return;
      const score = a - 1.3 * foe.filter(c => c.th.includes(k)).length - 0.6 * mid.filter(c => c.th.includes(k)).length + Math.random() * 0.3;
      if (!best || score > best.score) best = { k, a: Math.min(4, a), score };
    });
    if (!best) { const c = own[0]; best = { k: c.th[0], a: 1 }; }
    return { word: NC_THEMES[best.k], n: best.a };
  }
  function botGuess(room) {
    const k = themeKey(room.clue.word), open = room.board.map((c, i) => ({ c, i })).filter(x => !x.c.rev);
    const fits = k ? open.filter(x => x.c.th.includes(k)) : [];
    const limit = room.clue.n === -1 ? 9 : room.clue.n;
    if (room.clue.made >= limit) return { pass: true };
    if (fits.length) return { i: fits[Math.floor(Math.random() * fits.length)].i };
    if (room.clue.made) return { pass: true };
    return { i: open[Math.floor(Math.random() * open.length)].i };
  }
  function tick(room) {
    const now = Date.now();
    if (room.phase === 'clue') {
      const s = spyOf(room, room.active);
      if (s?.bot && now - room.turnAt > 2600) { const c = botClue(room); giveClue(room, s.id, c.word, c.n); return true; }
    }
    if (room.phase === 'guess' && now - room.turnAt > 2400) {
      const agents = members(room, room.active).filter(p => !p.spy);
      if (agents.length && !agents.some(p => !p.bot && p.online)) {
        const b = agents[0], g = botGuess(room);
        if (g.pass) pass(room, b.id); else reveal(room, b.id, g.i);
        return true;
      }
    }
    return false;
  }

  function act(room, pid, m) {
    const p = pl(room, pid), host = pid === room.hostId;
    switch (m.t) {
      case 'nc:team':
        if (room.phase !== 'setup' || !p?.inGame || (m.team !== 0 && m.team !== 1) || p.team === m.team) return null;
        p.team = m.team; p.spy = false; fixSpies(room); room.seq += 1; return null;
      case 'nc:spy':
        if (room.phase !== 'setup' || !p?.inGame) return null;
        members(room, p.team).forEach(q => { q.spy = q === p; }); room.seq += 1; return null;
      case 'nc:shuffle': if (host && room.phase === 'setup') shuffleTeams(room); return null;
      case 'nc:go':
        if (!host || (room.phase !== 'setup' && room.phase !== 'over')) return null;
        if ([0, 1].some(t => members(room, t).length < 2)) return 'Il faut au moins deux joueurs par équipe';
        fixSpies(room); deal(room); return null;
      case 'nc:again':
        if (!host || room.phase !== 'over') return null;
        [0, 1].forEach(t => { const m2 = members(room, t), i = m2.findIndex(q => q.spy); m2.forEach(q => { q.spy = false; }); if (m2.length) m2[(i + 1) % m2.length].spy = true; });
        deal(room); return null;
      case 'nc:setup': if (host && room.phase === 'over') { room.phase = 'setup'; room.seq += 1; } return null;
      case 'nc:clue': return giveClue(room, pid, m.word, m.n);
      case 'nc:point': return point(room, pid, +m.i);
      case 'nc:reveal': return reveal(room, pid, +m.i);
      case 'nc:pass': return pass(room, pid);
    }
    return null;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    const q = { id, name, online: true, bot: false, inGame: room.phase === 'setup', team: members(room, 0).length <= members(room, 1).length ? 0 : 1, spy: false };
    room.players.push(q); if (q.inGame) fixSpies(room);
  }
  function setOnline(room, id, on) { const p = pl(room, id); if (p) p.online = on; }

  function view(room, pid) {
    const me = pl(room, pid), seeKey = (me?.inGame && me.spy) || room.phase === 'over';
    const name = id => pl(room, id)?.name || '?';
    return {
      phase: room.phase, active: room.active, starter: room.starter, round: room.round, isHost: pid === room.hostId, seq: room.seq,
      me: me ? { team: me.team, spy: me.spy, inGame: me.inGame } : null,
      board: room.board.map((c, i) => ({ i, w: c.w, rev: c.rev, k: c.rev || seeKey ? c.k : null, points: (room.points[i] || []).map(name), mine: (room.points[i] || []).includes(pid) })),
      teams: [0, 1].map(t => ({ name: TEAM[t], left: room.board.length ? left(room, t) : 0, wins: room.wins[t],
        members: members(room, t).map(p => ({ id: p.id, name: p.name, spy: p.spy, bot: p.bot, online: p.online, me: p.id === pid })) })),
      clue: room.clue, canClue: room.phase === 'clue' && !!me?.spy && me.team === room.active && me.inGame,
      canGuess: room.phase === 'guess' && isAgent(room, pid),
      spyName: spyOf(room, room.active)?.name || '', winner: room.winner, reason: room.reason, quiet: Date.now() - room.turnAt,
      log: room.log.slice(-4),
    };
  }
  return { TEAM, create, act, tick, join, setOnline, view };
})();

// ============================================================ écran
let ncClue = '', ncNum = 2, ncKey = null;
function renderNomCode(v) {
  if (!v) return;
  const root = $('#nc-main');
  const hadFocus = document.activeElement?.id === 'nc-clue';
  root.innerHTML = '';
  const key = v.round + ':' + v.phase + ':' + v.active;
  if (key !== ncKey) { ncKey = key; if (v.phase === 'clue') ncClue = ''; }
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me, T = v.teams, A = T[v.active], teamWord = t => `l’équipe ${T[t].name}`;
  const say = list => list[(v.round + (v.clue?.made || 0)) % list.length];

  if (v.phase === 'setup') {
    root.appendChild(el('p', 'mj-meta', 'Avant la grille'));
    root.appendChild(el('div', 'mj-status', `<h3 class="mj-title">Formez les équipes.</h3><p class="mj-say">Deux équipes, un espion chacune. L’espion voit les couleurs, les autres devinent.</p>`));
    const box = el('div', 'nc-setup');
    [0, 1].forEach(t => {
      const col = el('div', `nc-team t${t}`);
      col.innerHTML = `<h4>L’équipe ${T[t].name}</h4><ul class="mj-list">${T[t].members.map(p => `<li class="mj-row${p.me ? ' me' : ''}"><span>${p.bot ? '🤖 ' : ''}${esc(p.name)}</span><i>${p.spy ? 'espion' : 'agent'}</i></li>`).join('')}</ul>`;
      if (me?.inGame && me.team !== t) col.appendChild(btn('small', `Passer chez les ${t ? 'Bleus' : 'Rouges'}`, () => act({ t: 'nc:team', team: t })));
      if (me?.inGame && me.team === t && !me.spy) col.appendChild(btn('small', 'Je serai l’espion', () => act({ t: 'nc:spy' })));
      box.appendChild(col);
    });
    root.appendChild(box);
    if (v.isHost) { const row = el('div', 'nc-row'); row.append(btn('ghost', 'Rebattre les équipes', () => act({ t: 'nc:shuffle' })), btn('primary lg', 'C’est parti', () => act({ t: 'nc:go' }))); root.appendChild(row); }
    else root.appendChild(el('p', 'note', 'L’hôte lance la grille quand tout le monde est placé.'));
    return;
  }

  root.appendChild(el('p', 'mj-meta', `Rouges : ${T[0].left} à trouver · Bleus : ${T[1].left} à trouver${v.round > 1 ? ` · grilles ${T[0].wins} à ${T[1].wins}` : ''}`));
  let title = '', line = '';
  const myTeam = me?.inGame ? me.team : null;
  if (v.phase === 'clue') {
    if (v.canClue) { title = 'À toi, espion.'; line = say(['Un mot, un nombre. Relie un maximum de tes agents, et évite l’assassin.', 'Tes agents comptent sur toi. L’assassin aussi.']); }
    else if (myTeam === v.active) { title = `${esc(v.spyName)} cherche un indice.`; line = say(['Patience. Un bon indice vaut trois mauvais.', 'Pendant ce temps, repère les mots qui se ressemblent.']); }
    else { title = `L’espion ${A.name === 'Rouge' ? 'rouge' : 'bleu'} réfléchit.`; line = say(['Profites-en pour espionner leur espion.', 'Croise les doigts pour qu’il se plante.']); }
  } else if (v.phase === 'guess') {
    const c = v.clue, n = c.n === -1 ? 'sans limite' : `pour ${c.n}`;
    title = `« ${esc(c.word)} » ${n}.`;
    const essais = c.left >= 99 ? 'Autant d’essais que tu veux.' : `Encore ${c.left} essai${c.left > 1 ? 's' : ''}.`;
    if (v.canGuess) line = `Pointe un mot, puis retourne-le. ${essais}`;
    else if (me?.spy && myTeam === v.active) line = say(['Ton équipe cherche. Pas un mot, pas une grimace.', 'Reste de marbre. Même s’ils partent dans le décor.']);
    else line = `${teamWord(v.active).replace(/^l/, 'L')} cherche. ${essais}`;
  } else if (v.phase === 'over') {
    title = `${teamWord(v.winner).replace(/^l/, 'L')} gagne.`;
    line = v.reason === 'assassin' ? `${teamWord(1 - v.winner).replace(/^l/, 'L')} a réveillé l’assassin. Aïe.` : v.reason === 'offert' ? 'Le dernier agent lui a été offert par l’adversaire.' : 'Tous ses agents sont retrouvés.';
  }
  root.appendChild(el('div', `mj-status nc-status t${v.phase === 'over' ? v.winner : v.active}`, `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`));

  // l'indice de l'espion
  if (v.canClue) {
    const form = el('div', 'nc-clue');
    const input = el('input'); input.id = 'nc-clue'; input.type = 'text'; input.maxLength = 24; input.placeholder = 'Ton indice, en un mot'; input.autocomplete = 'off'; input.value = ncClue;
    input.oninput = () => { ncClue = input.value; };
    const sel = el('select'); sel.setAttribute('aria-label', 'Combien de mots');
    sel.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<option value="${k}"${k === ncNum ? ' selected' : ''}>${k}</option>`).join('') + `<option value="-1"${ncNum === -1 ? ' selected' : ''}>sans limite</option>`;
    sel.onchange = () => { ncNum = +sel.value; };
    const send = () => act({ t: 'nc:clue', word: input.value, n: +sel.value });
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); send(); } };
    form.append(input, sel, btn('primary', 'Donner l’indice', send));
    root.appendChild(form);
    if (hadFocus) setTimeout(() => { const i = $('#nc-clue'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0);
  }

  // la grille
  const grid = el('div', 'nc-grid' + (me?.spy && v.phase !== 'over' ? ' spy' : ''));
  const mine = v.board.find(c => c.mine);
  v.board.forEach(c => {
    const cls = ['nc-card', c.k !== null ? 'k' + c.k : '', c.rev ? 'rev' : '', c.mine ? 'pointed' : '', c.points.length ? 'has-points' : ''].filter(Boolean).join(' ');
    const b = el(v.canGuess && !c.rev ? 'button' : 'div', cls, `<span class="nc-w">${esc(c.w)}</span>${c.points.length ? `<span class="nc-pts">${c.points.map(esc).join(', ')}</span>` : ''}`);
    if (b.tagName === 'BUTTON') { b.type = 'button'; b.onclick = () => act({ t: 'nc:point', i: c.i }); }
    grid.appendChild(b);
  });
  root.appendChild(grid);

  const actions = el('div', 'nc-row');
  if (v.canGuess) {
    if (mine) actions.appendChild(btn('primary lg', `Retourner « ${esc(mine.w)} »`, () => act({ t: 'nc:reveal', i: mine.i })));
    if (v.clue?.made) actions.appendChild(btn('ghost', 'On s’arrête là', () => act({ t: 'nc:pass' })));
  }
  if (v.phase === 'over' && v.isHost) actions.append(btn('primary lg', 'Nouvelle grille', () => act({ t: 'nc:again' })), btn('ghost', 'Refaire les équipes', () => act({ t: 'nc:setup' })), btn('ghost', 'Retour au salon', () => act({ t: 'restart' })));
  if (actions.children.length) root.appendChild(actions);

  // les équipes et le fil (colonne de droite sur PC)
  const side = el('div', 'nc-side');
  [0, 1].forEach(t => side.appendChild(el('div', `nc-team t${t}${t === v.active && v.phase !== 'over' ? ' on' : ''}`,
    `<h4>L’équipe ${T[t].name} <b>${T[t].left}</b></h4><ul class="mj-list">${T[t].members.map(p => `<li class="mj-row${p.me ? ' me' : ''}${p.online ? '' : ' off'}"><span>${p.bot ? '🤖 ' : ''}${esc(p.name)}</span><i>${p.spy ? 'espion' : 'agent'}</i></li>`).join('')}</ul>`)));
  root.appendChild(side);
  if (v.log.length) { const lg = el('ul', 'nc-log'); lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé')); v.log.slice().reverse().forEach(x => lg.appendChild(el('li', '', esc(x)))); root.appendChild(lg); }
}
