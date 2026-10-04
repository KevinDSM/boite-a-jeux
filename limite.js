// HorsLimite : affichage et commandes. Les règles du jeu sont dans engines/limite.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
let hlPicked = [], hlLastRound = null, hlSkipTimer = null;
const HL_SKIP_MS = 60000;
const hlSentence = parts => parts.map(x => x.a !== undefined ? `<b class="hl-fill">${esc(x.a)}</b>` : esc(x.t)).join('');
const hlNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];

function renderHorsLimite(v) {
  if (!v) return;
  const root = $('#hl-main'); root.innerHTML = '';
  clearTimeout(hlSkipTimer);
  if (v.round !== hlLastRound) { hlLastRound = v.round; hlPicked = []; }
  hlPicked = hlPicked.filter(id => v.me.hand.some(c => c.id === id));
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me, judgeMode = v.mode === 'judge', J = esc(v.judgeName);
  const say = list => list[(v.round - 1) % list.length];          // une réplique stable pendant toute la manche

  root.appendChild(el('p', 'hl-meta', `Manche ${v.round} · premier à ${v.target} · ${judgeMode ? 'le juge tourne' : 'tout le monde vote'}`));
  root.appendChild(el('div', 'hl-black', `<p>${esc(v.question).replace(/_/g, '<span class="hl-blank"></span>')}</p>${v.need > 1 ? `<span class="hl-pick">${v.need} cartes</span>` : ''}<span class="hl-brand">Hors Limite</span>`));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', prog = null;
  if (v.phase === 'play') {
    prog = [v.playedCount, v.playersCount];
    if (v.isJudge) {
      title = 'Tu juges.';
      line = say(['Ils fouillent leur main. Toi, prépare ta tête de juge.', 'Pendant qu’ils cherchent, entraîne-toi à rester de marbre.', 'Ta seule mission : ne pas rire avant d’avoir tout lu.']);
    } else if (!v.seated) { title = judgeMode ? `${J} juge.` : 'Tout le monde cherche.'; line = 'Tu regardes cette manche, tu joueras à la suivante.'; }
    else if (me.played) { title = 'C’est posé.'; line = v.waiting.length ? `Plus que ${esc(hlNames(v.waiting))}.` : 'Tout le monde a posé.'; }
    else {
      title = judgeMode ? `${J} juge.` : 'À toi de compléter.';
      line = v.need > 1 ? 'Deux trous : touche tes cartes dans l’ordre.'
        : judgeMode ? say([`Choisis la carte qui fera craquer ${J}.`, `Pense à ce qui fera rire ${J}. Pas toi.`, 'La plus drôle, ou la plus limite. À toi de voir.'])
          : say(['La plus drôle, ou la plus limite. À toi de voir.', 'Vise le fou rire général.']);
    }
  } else if (v.phase === 'pick') {
    if (judgeMode) {
      if (v.isJudge) { title = 'À toi de trancher.'; line = 'Lis-les à voix haute, puis garde ta préférée.'; }
      else { title = `${J} tranche.`; line = say(['Croise les doigts.', 'Fais comme si tu n’avais rien posé.', 'Surtout, garde ton sérieux.']); }
    } else {
      const done = v.players.filter(p => p.done).length;
      prog = [done, done + v.waiting.length];
      title = me.voted ? 'Vote enregistré.' : 'Votez.';
      line = me.voted ? (v.waiting.length ? `Plus que ${esc(hlNames(v.waiting))}.` : 'Dépouillement.') : 'Ta préférée. Pas la tienne.';
    }
  } else if (v.phase === 'reveal') {
    const w = v.result?.winners || [];
    title = w.length ? `${esc(hlNames(w))} ${w.length > 1 ? 'marquent' : 'marque'} le point.` : 'Personne ne marque.';
    line = w.length ? (judgeMode ? say(['Le juge a parlé.', 'On ne discute pas les goûts du juge.', 'Applaudissements, ou huées.']) : say(['La table a parlé.', 'Applaudissements, ou huées.'])) : 'Pas une seule voix. Dur.';
  } else if (v.phase === 'over') { title = `${esc(v.winnerName || '')} gagne la partie.`; line = 'Revanche ? Tout se passe au salon.'; }
  const status = el('div', 'hl-status', `<h3>${title}</h3><p class="hl-say">${line}</p>`);
  if (prog && prog[1] > 0) status.appendChild(el('div', 'hl-prog', `${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]}</span>`));
  root.appendChild(status);

  const zone = el('div', 'hl-zone');
  if (v.phase === 'play' && v.seated && !v.isJudge) {
    if (hlPicked.length && !me.played) zone.appendChild(el('div', 'hl-preview', hlSentence(HorsLimite.fill(v.question, hlPicked.map(id => me.hand.find(c => c.id === id).text)))));
    const g = el('div', 'hl-hand');
    me.hand.forEach(c => {
      const k = hlPicked.indexOf(c.id), played = me.played?.includes(c.id);
      const b = el('button', 'hl-white' + (k >= 0 || played ? ' on' : '') + (c.spicy ? ' spicy' : ''), `${esc(c.text)}${k >= 0 && v.need > 1 ? `<span class="hl-num">${k + 1}</span>` : ''}`); b.type = 'button';
      b.disabled = !!me.played;
      b.onclick = () => { if (k >= 0) hlPicked.splice(k, 1); else if (hlPicked.length < v.need) hlPicked.push(c.id); else { hlPicked[v.need - 1] = c.id; } renderHorsLimite(view.hl); };
      g.appendChild(b);
    });
    zone.appendChild(g);
    if (!me.played) {
      const left = v.need - hlPicked.length;
      const go = btn('primary lg', left ? `Choisis ${left} carte${left > 1 ? 's' : ''}` : v.need > 1 ? 'Poser ces cartes' : 'Poser cette carte', () => { if (hlPicked.length === v.need) act({ t: 'hl:play', cards: hlPicked.slice() }); });
      go.disabled = !!left; zone.appendChild(go);
      if (me.canSwap) zone.appendChild(btn('ghost small', 'Main pourrie ? Tout changer (−1 point)', () => act({ t: 'hl:swap' })));
    }
  }
  if (v.phase === 'pick' || v.phase === 'reveal' || v.phase === 'over') {
    const canChoose = v.phase === 'pick' && (judgeMode ? v.isJudge : v.seated && !me.voted);
    const list = el('div', 'hl-answers');
    const best = Math.max(0, ...v.table.map(s => s.gain || 0));
    v.table.forEach(s => {
      const b = el(canChoose && !(s.mine && !judgeMode) ? 'button' : 'div', 'hl-answer' + (s.mine && v.phase === 'pick' ? ' mine' : '') + (me.voted === s.key ? ' on' : '') + (s.gain && s.gain === best ? ' win' : ''),
        `<p>${hlSentence(s.parts)}</p>${s.owner ? `<span class="hl-owner">${esc(s.owner)}${s.gain ? ` · +${s.gain}` : ''}</span>` : s.mine ? '<span class="hl-owner">la tienne</span>' : ''}`);
      if (b.tagName === 'BUTTON') { b.type = 'button'; b.onclick = () => act({ t: 'hl:choose', key: s.key }); }
      list.appendChild(b);
    });
    zone.appendChild(list);
    if (v.phase === 'reveal') { if (v.isHost || v.isJudge) zone.appendChild(btn('primary lg', 'Manche suivante', () => act({ t: 'hl:next' }))); else zone.appendChild(el('p', 'note', 'L’hôte ou le juge lance la suite.')); }
    if (v.phase === 'over') {
      zone.appendChild(el('ol', 'hl-ranking', v.scores.map(s => `<li${s.me ? ' class="me"' : ''}><span>${esc(s.name)}</span><b>${s.score}</b></li>`).join('')));
      if (v.isHost) zone.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
    }
  }
  if (v.isHost && (v.phase === 'play' || v.phase === 'pick')) {
    if (v.quiet > HL_SKIP_MS) zone.appendChild(btn('ghost small', v.phase === 'play' ? 'Quelqu’un traîne ? Jouer à sa place' : judgeMode ? 'Le juge s’est endormi ? Tirer au sort' : 'Clore le vote', () => act({ t: 'hl:skip' })));
    else hlSkipTimer = setTimeout(() => { if (view?.hl) renderHorsLimite(view.hl); }, HL_SKIP_MS - v.quiet + 200);
  }
  root.appendChild(zone);

  // les joueurs (colonne de droite sur PC) et le fil de la partie
  const strip = el('div', 'hl-players');
  strip.appendChild(el('span', 'eyebrow hl-side-title', 'Scores'));
  v.players.forEach(p => {
    const tag = p.judge ? '<i>juge</i>' : p.done ? '<i class="ok">a posé</i>' : '';
    strip.appendChild(el('div', `hl-player${p.judge ? ' judge' : ''}${p.done ? ' done' : ''}${p.online ? '' : ' off'}${p.me ? ' me' : ''}`,
      `<span class="hl-player-name">${esc(p.name)}</span>${tag}<span class="hl-player-score">${p.score}${v.phase === 'reveal' && p.gain ? ` <b>+${p.gain}</b>` : ''}</span>`));
  });
  root.appendChild(strip);
  if (v.log.length) {
    const lg = el('ul', 'hl-log');
    lg.appendChild(el('li', 'eyebrow hl-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }
}
