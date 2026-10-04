// TelDes : affichage et commandes. Les règles du jeu sont dans engines/teldes.js.
'use strict';

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
