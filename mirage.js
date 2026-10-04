// Mirage : affichage et commandes. Les règles du jeu sont dans engines/mirage.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
let miLight = null, miChosen = null, miClueDraft = '', miSkipTimer = null, miLastRound = null;
const MI_SKIP_MS = 60000;
const miNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];

/** Tableau (fichier du site), mème (image Imgflip) ou GIF (vidéo muette en boucle). */
function miMedia(c, big = false) {
  if (!c.kind) return `<img src="mirage/${esc(c.file)}" alt="" loading="lazy" decoding="async">`;
  return c.kind === 'gif' ? `<video src="${esc(c.url)}" poster="${esc(c.thumb)}" autoplay muted loop playsinline preload="${big ? 'auto' : 'metadata'}"></video>` : `<img src="${esc(c.url)}" alt="" loading="lazy" decoding="async">`;
}
function miCardHTML(c, extra = '') {
  return `<figure class="mi-card${extra}${c.kind ? ' meme' : ''}">${miMedia(c)}<figcaption>${esc(c.artist)}</figcaption></figure>`;
}

/** La carte en grand, avec l'action du moment (choisir, jouer, voter) et, s'il en reste, le joker. */
function miOpen(c, action, extra) {
  miLight = { id: c.id };
  let box = $('#mi-light');
  if (!box) { box = el('div', 'mi-light'); box.id = 'mi-light'; document.body.appendChild(box); }
  box.innerHTML = '';
  box.appendChild(el('div', 'mi-light-media', miMedia(c, true)));
  box.appendChild(el('p', 'mi-light-cap', `${esc(c.title)}<br><small>${esc(c.artist)}${c.date ? ' · ' + esc(c.date) : ''} · ${esc(c.credit)}</small>`));
  const row = el('div', 'mi-light-row');
  [action, extra].filter(Boolean).forEach((x, k) => { const b = el('button', 'btn ' + (k === 0 && action ? 'primary lg' : 'mi-joker-btn'), x.label); b.type = 'button'; b.onclick = () => { miClose(); x.fn(); }; if (x.disabled) b.disabled = true; row.appendChild(b); });
  const close = el('button', 'btn ghost', 'Fermer'); close.type = 'button'; close.onclick = miClose; row.appendChild(close);
  box.appendChild(row);
  box.hidden = false;
  box.onclick = e => { if (e.target === box) miClose(); };
}
function miClose() { miLight = null; const box = $('#mi-light'); if (box) box.hidden = true; }

function renderMirage(v) {
  if (!v) return;
  const root = $('#mi-main');
  const hadFocus = document.activeElement?.id === 'mi-clue-in';
  root.innerHTML = '';
  clearTimeout(miSkipTimer);
  if (v.round !== miLastRound) { miLastRound = v.round; miChosen = null; miClueDraft = ''; miClose(); }
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me, T = esc(v.tellerName);
  const say = list => list[(v.round - 1) % list.length];          // une réplique stable pendant toute la manche
  const plus = () => v.waiting.length ? `Plus que ${esc(miNames(v.waiting))}.` : 'Tout le monde a joué.';

  root.appendChild(el('p', 'mj-meta', `Manche ${v.round} · premier à ${v.target} · ${v.deckLeft} carte${v.deckLeft > 1 ? 's' : ''} dans la pioche`));
  // l'indice du conteur, une fois donné
  if (v.phase !== 'clue' && v.phase !== 'over') root.appendChild(el('p', 'mi-clue' + (v.clue ? '' : ' spoken'), v.clue ? `« ${esc(v.clue)} »` : `${T} a donné son indice à voix haute.`));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', prog = null;
  const done = v.players.filter(p => p.done).length;
  if (v.phase === 'clue') {
    if (v.isTeller) {
      title = miChosen ? 'Ton indice ?' : 'Tu racontes.';
      line = miChosen ? 'Un mot, une phrase, un titre, un bruit. Ou dis-le à voix haute.'
        : say(['Choisis une image. Ton indice doit perdre quelques joueurs en route, pas tous.', 'Une carte, un indice. Ni trop clair, ni trop obscur.', 'Trouve l’indice qui en égare certains. Pas tous.']);
    } else {
      title = `${T} raconte.`;
      line = say([`${T} cherche ses mots. Regarde ta main en attendant.`, 'Repère déjà la carte qui pourrait coller.', `Laisse ${T} rêver un peu.`]);
    }
  } else if (v.phase === 'pick') {
    prog = [done, done + v.waiting.length];
    if (v.isTeller) { title = 'Ils cherchent.'; line = say(['Chacun glisse une carte qui colle à ton indice.', 'Ils fouillent leur main. Garde ton sérieux.']); }
    else if (me.picked) { title = 'C’est joué.'; line = plus(); }
    else { title = 'Brouille les pistes.'; line = say(['Glisse la carte qui colle le mieux, pour tromper les autres.', 'Trouve un faux convaincant.', `Fais croire que c’est la carte de ${T}.`]); }
  } else if (v.phase === 'vote') {
    prog = [done, done + v.waiting.length];
    if (v.isTeller) { title = 'Ils votent.'; line = say(['Pas un mot, pas une grimace.', 'Garde ton sérieux.', 'Croise les doigts pour qu’ils ne trouvent pas tous.']); }
    else if (me.voted) { title = 'Vote enregistré.'; line = plus(); }
    else { title = `Où est la carte de ${T} ?`; line = say(['Pas la tienne, évidemment.', 'Fie-toi à ton instinct.', 'Méfie-toi des évidences.']); }
  } else if (v.phase === 'reveal' && v.result) {
    const r = v.result;
    title = r.none ? 'Personne n’a trouvé.' : r.all ? 'Tout le monde a trouvé.' : `${esc(miNames(r.found))} ${r.found.length > 1 ? 'ont' : 'a'} trouvé.`;
    line = r.allOrNone ? `Trop ${r.none ? 'obscur' : 'clair'}. Rien pour ${T}, 2 points pour les autres.` : `3 points pour ${T} et pour ${r.found.length > 1 ? 'ceux qui ont trouvé' : esc(r.found[0])}.`;
    line += ' Chaque vote attrapé rapporte 1 point.';
  } else if (v.phase === 'over') { title = `${esc(v.winnerName || '')} gagne la partie.`; line = 'Revanche ? Tout se passe au salon.'; }
  const status = el('div', 'mj-status', `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`);
  if (prog && prog[1] > 0) status.appendChild(el('div', 'mj-prog', `${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]}</span>`));
  root.appendChild(status);

  const zone = el('div', 'mi-zone');
  // le joker : proposé sur toute carte de ma main qui n'est pas déjà jouée cette manche
  const jokerFor = c => (!me.offer && me.jokers > 0 && !me.locked.includes(c.id) && v.phase !== 'over' && v.deckLeft > 0)
    ? { label: `Échanger avec un joker (${me.jokers} restant${me.jokers > 1 ? 's' : ''})`, fn: () => act({ t: 'mi:joker', card: c.id }) } : null;
  if (me.offer) {
    const box = el('div', 'mi-offer');
    box.appendChild(el('div', 'mi-offer-head', `<figure class="mi-offer-out">${miMedia(me.offer.out)}</figure><p class="mi-offer-title">Joker. Laquelle prend sa place ?</p>`));
    const g = el('div', 'mi-grid offer');
    me.offer.choices.forEach(c => {
      const f = el('button', 'mi-slot'); f.type = 'button'; f.innerHTML = miCardHTML(c);
      f.onclick = () => miOpen(c, { label: 'Prendre cette carte', fn: () => act({ t: 'mi:jokerpick', card: c.id }) });
      g.appendChild(f);
    });
    box.appendChild(g);
    box.appendChild(btn('ghost small', 'Garder ma carte (le joker reste en poche)', () => act({ t: 'mi:jokercancel' })));
    zone.appendChild(box);
  }
  const handGrid = (onTap, chosenId, label) => {
    const g = el('div', 'mi-grid hand');
    me.hand.forEach(c => {
      const f = el('button', 'mi-slot' + (c.id === chosenId ? ' chosen' : '')); f.type = 'button';
      f.innerHTML = miCardHTML(c);
      f.onclick = () => miOpen(c, onTap ? { label, fn: () => onTap(c) } : null, jokerFor(c));
      g.appendChild(f);
    });
    return g;
  };

  if (v.phase === 'clue') {
    if (v.isTeller) {
      zone.appendChild(handGrid(c => { miChosen = c.id; renderMirage(view.mi); setTimeout(() => $('#mi-clue-in')?.focus(), 50); }, miChosen, 'Choisir cette carte'));
      if (miChosen) {
        const form = el('form', 'mi-clue-form');
        const inp = el('input', 'mi-clue-in'); inp.id = 'mi-clue-in'; inp.type = 'text'; inp.maxLength = Mirage.CLUE_MAX; inp.placeholder = 'Ton indice, ou rien si tu le dis'; inp.autocomplete = 'off'; inp.value = miClueDraft;
        inp.oninput = () => { miClueDraft = inp.value; };
        const send = btn('primary lg', 'Donner l’indice', () => { }); send.type = 'submit';
        form.append(inp, send);
        form.onsubmit = e => { e.preventDefault(); act({ t: 'mi:clue', card: miChosen, text: inp.value }); };
        zone.appendChild(form);
        if (hadFocus) setTimeout(() => { const i = $('#mi-clue-in'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0);
      }
    } else zone.appendChild(handGrid(null, null, ''));
  }

  if (v.phase === 'pick') zone.appendChild(handGrid(v.isTeller || me.picked ? null : c => act({ t: 'mi:pick', card: c.id }), me.picked, 'Jouer cette carte'));

  if (v.phase === 'vote') {
    const g = el('div', 'mi-grid table');
    v.table.forEach(s => {
      const f = el('button', 'mi-slot' + (s.mine ? ' mine' : '') + (me.voted === s.card.id ? ' chosen' : '')); f.type = 'button';
      f.innerHTML = miCardHTML(s.card) + (s.mine ? '<span class="mi-tag">ta carte</span>' : '');
      f.onclick = () => miOpen(s.card, v.isTeller || me.voted ? null : { label: s.mine ? 'C’est ta carte' : 'Voter pour cette carte', disabled: s.mine, fn: () => act({ t: 'mi:vote', card: s.card.id }) });
      g.appendChild(f);
    });
    zone.appendChild(g);
  }

  if (v.phase === 'reveal') {
    const g = el('div', 'mi-grid table');
    v.table.forEach(s => {
      const f = el('button', 'mi-slot' + (s.teller ? ' teller' : '')); f.type = 'button';
      f.innerHTML = miCardHTML(s.card) + `<span class="mi-owner">${esc(s.owner)}${s.teller ? ' · conteur' : ''}</span>` + (s.votes.length ? `<span class="mi-votes">${s.votes.map(esc).join(', ')}</span>` : '');
      f.onclick = () => miOpen(s.card, null);
      g.appendChild(f);
    });
    zone.appendChild(g);
    if (v.isHost || v.isTeller) zone.appendChild(btn('primary lg', 'Manche suivante', () => act({ t: 'mi:next' })));
    else zone.appendChild(el('p', 'note', 'Le conteur ou l’hôte lance la suite.'));
  }
  if (v.phase === 'over') {
    zone.appendChild(el('ol', 'mj-list hm-rank', v.scores.map((s, i) => `<li class="mj-row${s.me ? ' me' : ''}"><span><i>${i + 1}</i>${esc(s.name)}</span><b>${s.score}</b></li>`).join('')));
    if (v.isHost) zone.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
  }
  // mes jokers, sous la main
  if (me.jokerStart > 0 && (v.phase === 'clue' || v.phase === 'pick') && !me.offer) zone.appendChild(el('p', 'mi-jokers', `<span class="mi-joker-dots" aria-hidden="true">${'<i class="on"></i>'.repeat(me.jokers)}${'<i></i>'.repeat(Math.max(0, me.jokerStart - me.jokers))}</span>${me.jokers ? `${me.jokers} joker${me.jokers > 1 ? 's' : ''} en poche. Ouvre une carte de ta main pour l’échanger.` : 'Plus de joker.'}`));

  // l'hôte peut débloquer une manche qui n'avance plus
  if (v.isHost && ['clue', 'pick', 'vote'].includes(v.phase)) {
    if (v.quiet > MI_SKIP_MS) zone.appendChild(btn('ghost small', v.phase === 'clue' ? 'Le conteur s’est endormi ? Passer son tour' : 'Quelqu’un traîne ? Jouer à sa place', () => act({ t: 'mi:skip' })));
    else miSkipTimer = setTimeout(() => { if (view?.mi && document.activeElement?.id !== 'mi-clue-in') renderMirage(view.mi); }, MI_SKIP_MS - v.quiet + 200);
  }
  root.appendChild(zone);

  // les joueurs (colonne de droite sur PC) et le fil de la partie
  const strip = el('div', 'mi-players hm-players');
  strip.appendChild(el('span', 'mj-side-title', 'Scores'));
  v.players.forEach(p => {
    const tag = p.teller ? '<i>conteur</i>' : p.done ? `<i class="ok">${v.phase === 'vote' ? 'a voté' : 'a joué'}</i>` : '';
    strip.appendChild(el('div', `hm-player${p.teller ? ' lead' : ''}${p.online ? '' : ' off'}${p.me ? ' me' : ''}`,
      `<span class="hm-name">${esc(p.name)}</span>${tag}<span class="hm-score">${p.score}${v.phase === 'reveal' && p.gain ? ` <b>+${p.gain}</b>` : ''}</span>`));
  });
  root.appendChild(strip);
  if (v.log.length) {
    const lg = el('ul', 'mi-log hm-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }
}
