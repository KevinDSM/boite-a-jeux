// NomCode : affichage et commandes. Les règles du jeu sont dans engines/nomcode.js.

'use strict';


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
