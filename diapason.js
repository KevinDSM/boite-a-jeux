// Diapason : affichage et commandes. Les règles du jeu sont dans engines/diapason.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
let dpKey = null, dpLocal = null, dpLocalUntil = 0, dpDragging = false, dpSendAt = 0, dpSendTimer = null, dpClue = '', dpSkipTimer = null;
const DP_SKIP_MS = 60000;
const dpNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
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
  (markers || []).forEach(m => { const [x, y] = dpPt(m.value, R - 26); s += `<g class="dp-mark${m.me ? ' me' : ''}"><circle cx="${x}" cy="${y}" r="6.5"/><text x="${x}" y="${(+y + 2.4).toFixed(2)}">${esc(glyph0(m.name))}</text></g>`; });
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
  const teams = v.mode === 'teams', left = v.card[0], right = v.card[1], P = esc(v.psychicName);
  const A = teams ? esc(v.teams[v.active].name) : '', B = teams ? esc(v.teams[1 - v.active].name) : '';
  const say = list => list[(v.round - 1) % list.length];          // une réplique stable pendant toute la manche

  // la ligne d'info, la carte et l'indice
  root.appendChild(el('p', 'mj-meta', teams ? `Manche ${v.round} · premier à ${v.target} · équipe ${A} au cadran` : `Manche ${v.round} sur ${v.rounds} · médium ${P}`));
  root.appendChild(el('div', 'dp-card', `<span class="dp-l">← ${esc(left)}</span><span class="dp-r">${esc(right)} →</span>`));
  if (v.phase !== 'clue' && v.phase !== 'over') root.appendChild(el('p', 'dp-clue-show' + (v.clue ? '' : ' spoken'), v.clue ? `« ${esc(v.clue)} »` : `${P} a donné l’indice à voix haute.`));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', prog = null;
  if (v.phase === 'clue') {
    if (v.isPsychic) {
      title = 'Tu es le médium.';
      line = say(['Seul ton écran montre la cible. Cache-le bien.', 'Toi seul vois la cible. Garde ton écran contre toi.']) + ' Un mot, un nom, un film. Pas de nombre.';
    } else {
      title = `${P} cherche un indice.`;
      line = say(['Pas touche à son écran.', 'Prépare ton meilleur regard de télépathe.', 'Laisse le médium se concentrer.']);
    }
  } else if (v.phase === 'guess') {
    if (!teams) {
      const done = v.players.filter(p => p.done).length;
      prog = [done, done + v.waiting.length];
      if (v.canGuess) { title = 'À toi de viser.'; line = say(['Place ton aiguille où l’indice te semble tomber.', 'Fie-toi au médium. Ou pas.', 'Vise le plein centre.']); }
      else if (v.isPsychic) { title = 'Ils cherchent.'; line = say(['Pas un mot, pas une grimace.', 'Garde ton air mystérieux.']); }
      else { title = 'Aiguille posée.'; line = v.waiting.length ? `Plus que ${esc(dpNames(v.waiting))}.` : 'Tout le monde a visé.'; }
    } else if (v.canDial) { title = `À vous, équipe ${A}.`; line = 'Discutez et bougez l’aiguille ensemble. Tout le monde la voit bouger.'; }
    else if (v.isPsychic) { title = 'Ton équipe cherche.'; line = say(['Pas un mot, pas une grimace.', 'Garde ton air mystérieux.']); }
    else { title = `L’équipe ${A} cherche.`; line = 'Préparez votre pari, plus à gauche ou plus à droite.'; }
  } else if (v.phase === 'side') {
    if (v.canSide) { title = 'À vous de parier.'; line = 'La cible, plus à gauche ou plus à droite de leur aiguille ? 1 point si vous avez raison.'; }
    else { title = `L’équipe ${B} parie.`; line = say(['Plus à gauche ou plus à droite. Suspense.', 'Ils hésitent. Normal.']); }
  } else if (v.phase === 'reveal' && v.result) {
    const r = v.result;
    if (teams) {
      title = r.pts === 4 ? 'Plein centre !' : r.pts ? `${r.pts} points pour l’équipe ${A}.` : `Raté pour l’équipe ${A}.`;
      const bits = [];
      if (r.pts === 4) bits.push(`4 points pour l’équipe ${A}.`);
      if (r.sideOk !== null && v.side) bits.push(`${esc(v.sideBy)} a parié plus à ${v.side === 'left' ? 'gauche' : 'droite'}. ${r.sideOk ? `Gagné, 1 point pour ${B}.` : `Perdu pour ${B}.`}`);
      if (r.again) bits.push('En retard et plein centre, l’équipe rejoue tout de suite.');
      line = bits.join(' ') || say(['Le cadran a parlé.', 'On se rapproche.']);
    } else {
      const bull = r.guesses.filter(g => g.pts === 4).map(g => g.name);
      title = !r.guesses.length ? 'Personne n’a visé.' : bull.length ? `Plein centre pour ${esc(dpNames(bull))} !` : r.guesses[0].pts ? `${esc(r.guesses[0].name)} vise le mieux.` : 'Personne dans la cible.';
      line = r.guesses.length ? `${P}, le médium, prend +${r.psyGain}, la moyenne des autres.` : 'Le médium repart bredouille.';
    }
  } else if (v.phase === 'over') { title = `${esc(v.winnerName)} gagne la partie.`; line = 'Revanche ? Tout se passe au salon.'; }
  const status = el('div', 'mj-status', `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`);
  if (prog && prog[1] > 0) status.appendChild(el('div', 'mj-prog', `${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]}</span>`));
  root.appendChild(status);

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
    const l = btn('ghost small', '◀', () => step(-1)), r = btn('ghost small', '▶', () => step(1));
    l.setAttribute('aria-label', 'Un cran vers la gauche'); r.setAttribute('aria-label', 'Un cran vers la droite');
    nudge.append(l, el('span', 'dp-nudge-hint', 'Fais glisser l’aiguille'), r);
    root.appendChild(nudge);
  }

  // les actions du moment
  const zone = el('div', 'dp-zone');
  if (v.phase === 'clue' && v.isPsychic) {
    const input = el('input'); input.id = 'dp-clue'; input.type = 'text'; input.maxLength = 80; input.placeholder = 'Ton indice, ou rien si tu le dis'; input.autocomplete = 'off'; input.value = dpClue;
    input.oninput = () => { dpClue = input.value; };
    input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); act({ t: 'dp:clue', text: input.value }); } };
    zone.appendChild(input);
    const row = el('div', 'dp-row');
    row.append(btn('primary lg', 'Donner l’indice', () => act({ t: 'dp:clue', text: $('#dp-clue').value })));
    if (v.rerolls > 0) row.append(btn('ghost', `Autre carte, encore ${v.rerolls}`, () => act({ t: 'dp:reroll' })));
    zone.appendChild(row);
    if (hadFocus) setTimeout(() => { const i = $('#dp-clue'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0);
  }
  if (v.phase === 'guess') {
    if (v.canGuess) zone.appendChild(btn('primary lg', 'Poser mon aiguille', () => act({ t: 'dp:guess', value: dpLocal ?? 50 })));
    if (v.canDial) zone.appendChild(btn('primary lg', 'On valide cette aiguille', () => act({ t: 'dp:lock', value: dpLocal !== null && Date.now() < dpLocalUntil ? dpLocal : v.dial })));
  }
  if (v.phase === 'side' && v.canSide) {
    const row = el('div', 'dp-row two');
    row.append(btn('primary lg', '◀ Plus à gauche', () => act({ t: 'dp:side', dir: 'left' })), btn('primary lg', 'Plus à droite ▶', () => act({ t: 'dp:side', dir: 'right' })));
    zone.appendChild(row);
  }
  if (v.phase === 'reveal' && v.result) {
    if (!teams && v.result.guesses.length) zone.appendChild(el('ol', 'mj-list dp-results', v.result.guesses.map(g => `<li class="mj-row${g.pts ? ' hit p' + g.pts : ''}"><span>${esc(g.name)}</span><b>+${g.pts}</b></li>`).join('')));
    if (v.isHost || v.isPsychic) zone.appendChild(btn('primary lg', v.mode === 'solo' && v.round >= v.rounds ? 'Voir le classement' : 'Manche suivante', () => act({ t: 'dp:next' })));
    else zone.appendChild(el('p', 'note', 'L’hôte ou le médium lance la suite.'));
  }
  if (v.phase === 'over') {
    const rows = teams ? v.teams.map(t => ({ name: t.name, sub: t.members.join(', '), score: t.score })).sort((a, b) => b.score - a.score) : v.players;
    zone.appendChild(el('ol', 'mj-list hm-rank', rows.map((p, i) => `<li class="mj-row${p.me ? ' me' : ''}"><span><i>${i + 1}</i>${esc(p.name)}${p.sub ? ` <small>${esc(p.sub)}</small>` : ''}</span><b>${p.score}</b></li>`).join('')));
    if (v.isHost) zone.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
  }
  if (v.isHost && ['clue', 'guess', 'side'].includes(v.phase)) {
    if (v.quiet > DP_SKIP_MS) zone.appendChild(btn('ghost small', v.phase === 'clue' ? 'Le médium s’est endormi ? Passer son tour' : v.phase === 'guess' ? 'Quelqu’un traîne ? Révéler maintenant' : 'Passer le pari', () => act({ t: 'dp:skip' })));
    else dpSkipTimer = setTimeout(() => { if (view?.dp && !dpDragging && document.activeElement?.id !== 'dp-clue') renderDiapason(view.dp); }, DP_SKIP_MS - v.quiet + 200);
  }
  root.appendChild(zone);

  // les scores (colonne de droite sur PC) et le fil de la partie
  const sc = el('div', 'dp-scores hm-players');
  sc.appendChild(el('span', 'mj-side-title', 'Scores'));
  const me = v.players.find(p => p.me)?.name;
  if (teams) v.teams.forEach((t, i) => sc.appendChild(el('div', `hm-player dp-tm t${i}${i === v.active ? ' lead' : ''}`,
    `<span class="hm-name">${esc(t.name)}</span>${i === v.active && v.phase !== 'over' ? '<i>au cadran</i>' : ''}<span class="hm-score">${t.score}</span><small class="hm-members">${t.members.map(n => esc(n) + (n === me ? ' (toi)' : '')).join(', ')}</small>`)));
  else v.players.forEach(p => sc.appendChild(el('div', `hm-player${p.psychic ? ' lead' : ''}${p.online ? '' : ' off'}${p.me ? ' me' : ''}`,
    `<span class="hm-name">${esc(p.name)}</span>${p.psychic ? '<i>médium</i>' : p.done ? '<i class="ok">a visé</i>' : ''}<span class="hm-score">${p.score}</span>`)));
  root.appendChild(sc);
  if (v.log.length) {
    const lg = el('ul', 'dp-log hm-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }
}
