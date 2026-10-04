// Memes : affichage et commandes. Les règles du jeu sont dans engines/memes.js.

'use strict';


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
