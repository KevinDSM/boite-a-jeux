// Undercover : affichage et commandes. Les règles du jeu sont dans engines/undercover.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md). Le dossier secret garde son look machine à écrire et ses tampons ;
// l'interface autour (état, votes, scores, boutons) suit l'ossature commune.
let ucPeek = false, ucPeekTimer = null, ucLastRound = null;
const ucNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
const ucProg = (done, total) => total > 0 ? el('div', 'mj-prog', `${Array.from({ length: total }, (_, i) => `<i${i < done ? ' class="f"' : ''}></i>`).join('')}<span>${done} sur ${total}</span>`) : null;

function renderUndercover(v) {
  if (!v) return;
  if (v.round !== ucLastRound) { ucLastRound = v.round; ucPeek = false; }
  const root = $('#uc-main'); root.innerHTML = '';
  const me = v.me, host = v.isHost, mid = myId();
  const stamp = r => `<span class="uc-stamp uc-${r}">${Undercover.ROLE_NAME[r]}</span>`;
  const btn = (cls, label, onclick) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = onclick; return b; };
  const say = list => list[(v.round + v.tour - 1) % list.length];          // une réplique stable pendant tout un tour
  const alive = v.players.filter(p => p.alive), e = v.lastElim;
  const names = list => esc(ucNames(list.map(p => p.name)));

  // la ligne d'info discrète
  const plan = `${v.plan.uc} undercover${v.plan.uc > 1 ? 's' : ''}${v.plan.white ? ' et Mister White' : ''}`;
  root.appendChild(el('p', 'mj-meta', `Manche ${v.round} sur ${v.rounds}${v.tour ? ` · tour ${v.tour}` : ''} · ${plan}`));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', prog = null;
  if (!me.inRound && v.phase !== 'result') { title = 'Tu entres à la prochaine manche.'; line = 'Une manche tourne déjà. Écoute bien, tu joues juste après.'; }
  else if (v.phase === 'reveal') {
    const online = v.players.filter(p => p.online), waiting = online.filter(p => !p.ready && p.id !== mid);
    prog = [online.filter(p => p.ready).length, online.length];
    if (!me.ready) { title = 'Découvre ton mot.'; line = say(['Cache ton écran, ton voisin a l’œil.', 'Ouvre ton dossier à l’abri des regards.', 'Lis, retiens, et fais comme si de rien n’était.']); }
    else { title = 'C’est noté.'; line = waiting.length ? `Plus que ${names(waiting)}.` : 'Tout le monde est prêt.'; }
  } else if (v.phase === 'clues') {
    const sp = v.order.find(o => o.id === v.speakerId);
    prog = [v.order.filter(o => o.done).length, v.order.length];
    if (v.speakerId === mid) { title = 'À toi.'; line = say(['Un indice à voix haute. Assez clair pour les tiens, assez flou pour les autres.', 'Un mot ou une courte expression. Surtout pas ton mot.', 'Pas trop précis, pas trop vague. Facile, non ?']); }
    else { title = `${esc(sp?.name || '')} parle.`; line = say(['Tends l’oreille. Un indice qui détonne, ça s’entend.', 'Écoute bien, et retiens ce qui sonne faux.', 'Regarde-le bien pendant qu’il parle.']); }
  } else if (v.phase === 'vote') {
    prog = [v.votedCount, v.voterCount];
    const waiting = alive.filter(p => p.online && !p.voted && p.id !== mid);
    const tie = v.tie ? `On revote entre ${names(v.players.filter(p => v.candidates?.includes(p.id)))}.` : '';
    if (!me.alive) { title = 'La table vote.'; line = 'Tu es éliminé, tu regardes sans voter. Garde tes soupçons pour toi.'; }
    else if (me.vote) { title = 'Vote enregistré.'; line = `${tie ? tie + ' ' : ''}${waiting.length ? `Plus que ${names(waiting)}. Tu peux encore changer d’avis.` : 'Dépouillement.'}`; }
    else if (v.tie) { title = 'Égalité.'; line = tie; }
    else { title = 'Qui est l’intrus ?'; line = say(['Relis les indices. Quelqu’un bluffe.', 'Un seul nom. Pas le tien.', 'Tu peux changer d’avis tant que le vote tourne.']); }
  } else if (v.phase === 'elim' && e) {
    title = `${esc(e.name)} est éliminé.`;
    const why = e.role === 'civil' ? say(['C’était un civil. Oups.', 'Un civil. La table s’est trompée de cible.', 'Raté, c’était un civil.'])
      : e.role === 'undercover' ? say(['Un undercover de moins. Bien flairé.', 'C’était bien un undercover.', 'Démasqué. Au suivant.'])
        : !v.whiteTry?.word ? 'Mister White n’a rien proposé.' : v.whiteTry.ok ?`Mister White a trouvé le mot des civils : +5 points pour ${esc(e.name)}.` : 'Mister White s’est trompé de mot.';
    line = `${why} Personne n’a encore gagné, on repart pour un tour à ${alive.length}.`;
  } else if (v.phase === 'white-guess' && e) {
    if (e.id === mid) { title = 'Dernière chance.'; line = 'Devine le mot des civils. Trouvé, c’est 5 points. Tu restes éliminé quoi qu’il arrive.'; }
    else { title = 'Mister White cherche le mot.'; line = `${esc(e.name)} est démasqué, mais marque encore 5 points s’il trouve le mot des civils.`; }
  } else if (v.phase === 'result') {
    const civ = v.result.winner === 'civils';
    title = civ ? 'Les civils gagnent la manche.' : 'Les intrus gagnent la manche.';
    line = civ ? say(['Bien flairé.', 'Les intrus n’ont pas tenu longtemps.', 'Le bluff n’a pas pris.']) : say(['Bien joué, les menteurs.', 'Le bluff a payé.', 'Personne n’a rien vu venir.']);
    if (v.whiteTry && v.whiteTry.word) line += ` Mister White a proposé « ${esc(v.whiteTry.word)} »${v.whiteTry.ok ? ', bien vu, +5 points' : ', raté'}.`;
  }
  const status = el('div', 'mj-status', `<h3 class="mj-title">${title}</h3>${line ? `<p class="mj-say">${line}</p>` : ''}`);
  const bar = prog && ucProg(prog[0], prog[1]); if (bar) status.appendChild(bar);
  root.appendChild(status);

  // la fiche secrète : masquée par défaut, pour qu'un voisin ne la lise pas par-dessus l'épaule
  const secretCard = big => {
    const card = el('button', 'uc-file uc-secret' + (ucPeek ? ' open' : '') + (big ? '' : ' small'));
    card.type = 'button';
    card.innerHTML = me.white
      ? `<p class="uc-label">Dossier ${ucPeek ? 'ouvert' : 'confidentiel'}</p>${ucPeek ? `<p class="uc-big">Mister White</p><p class="fine">Tu n’as pas de mot. Écoute, fonds-toi dans la masse. Démasqué, tu pourras encore deviner le mot des civils.</p>` : '<p class="uc-big">Touche pour ouvrir</p><p class="fine">À l’abri des regards.</p>'}`
      : `<p class="uc-label">Ton mot secret</p><p class="uc-big">${ucPeek ? esc(me.word) : '• • • • •'}</p><p class="fine">${ucPeek ? 'Civil ou undercover ? Tu ne le sais pas.' : 'Touche pour le voir, à l’abri des regards.'}</p>`;
    card.onclick = () => {
      ucPeek = !ucPeek; clearTimeout(ucPeekTimer);
      if (ucPeek) ucPeekTimer = setTimeout(() => { ucPeek = false; if (view?.uc) renderUndercover(view.uc); }, 6000);
      renderUndercover(view.uc);
    };
    return card;
  };

  // un bloc de liste (colonne de droite sur PC) : un intitulé discret, puis des lignes
  const block = (cls, label, rows) => {
    const b = el('div', cls + ' rl-block', `<span class="mj-side-title">${label}</span>`);
    const list = el('div', 'mj-list'); rows.forEach(r => list.appendChild(r)); b.appendChild(list);
    return b;
  };
  const row = (cls, html) => el('div', 'mj-row ' + cls, html);
  const who = p => `<span class="rl-name">${esc(p.name)}${p.id === mid ? ' <small>(toi)</small>' : ''}</span>`;

  // tout ce qui a été dit, rappelé au vote et en fin de manche
  const addRecap = () => {
    if (!v.players.some(p => p.clues && p.clues.length)) return;
    root.appendChild(block('uc-recap', 'Indices donnés', v.players.map(p => row('uc-recap-row' + (p.alive ? '' : ' out'),
      `${who(p)}<span class="uc-said">${p.clues.length ? p.clues.map(esc).join(' · ') : '<i>rien d’écrit</i>'}</span>`))));
  };

  if (v.phase === 'reveal' && me.inRound) {
    root.appendChild(secretCard(true));
    if (!me.ready) root.appendChild(btn('primary lg', 'Fermer le dossier', () => { ucPeek = false; act({ t: 'uc:ready' }); }));
    if (host) root.appendChild(btn('ghost small', 'Commencer sans attendre', () => act({ t: 'uc:force' })));
  }
  if (v.phase === 'reveal') root.appendChild(block('uc-roster', 'À table', v.players.map(p => row(p.online ? '' : 'off', `${who(p)}<span class="rl-tag${p.ready ? ' ok' : ''}">${p.ready ? 'prêt' : p.online ? 'lit son mot' : 'absent'}</span>`))));

  if (v.phase === 'clues') {
    const mine = me.inRound && v.speakerId === mid;
    if (me.inRound && me.alive) root.appendChild(secretCard(false));
    if (mine) {
      const f = el('form', 'uc-clue-form', '<input id="uc-clue-in" maxlength="40" autocomplete="off" placeholder="Ton indice"><button class="btn primary" type="submit">Noter l’indice</button>');
      f.onsubmit = ev => { ev.preventDefault(); const t = $('#uc-clue-in').value.trim(); if (!t) { toast('Écris ton indice, ou touche « Je l’ai dit, sans l’écrire »'); return; } act({ t: 'uc:clue', text: t }); };
      root.appendChild(f);
      root.appendChild(btn('ghost', 'Je l’ai dit, sans l’écrire', () => act({ t: 'uc:clue' })));
    }
    if (host && !mine) root.appendChild(btn('', 'Joueur suivant', () => act({ t: 'uc:clue' })));
    if (host) root.appendChild(btn('ghost small', 'Passer au vote', () => act({ t: 'uc:force' })));
    const ol = el('div', 'uc-order rl-block', '<span class="mj-side-title">Ordre de parole</span>');
    const list = el('ol', 'mj-list');
    v.order.forEach((o, i) => list.appendChild(el('li', 'mj-row' + (o.done ? ' done' : '') + (o.id === v.speakerId ? ' now' : ''),
      `<span class="rl-num">${i + 1}</span><span class="rl-name">${esc(o.name)}${o.id === mid ? ' <small>(toi)</small>' : ''}</span><span class="rl-tag">${o.id === v.speakerId ? 'parle' : o.done ? 'a parlé' : ''}</span>`)));
    ol.appendChild(list); root.appendChild(ol);
    addRecap();
  }

  if (v.phase === 'vote') {
    if (me.inRound && me.alive) {
      const list = el('div', 'mj-list rl-choices uc-vote');
      v.players.filter(p => p.alive && p.id !== mid && (!v.candidates || v.candidates.includes(p.id))).forEach(p => {
        const on = me.vote === p.id;
        const b = el('button', 'mj-row rl-opt uc-target' + (on ? ' on' : ''), `<span class="rl-main"><b>${esc(p.name)}</b><span class="uc-said">${p.clues.length ? p.clues.map(esc).join(' · ') : 'aucun indice écrit'}</span></span><span class="rl-tag">${on ? 'ton vote' : p.voted ? 'a voté' : ''}</span>`);
        b.type = 'button'; b.onclick = () => act({ t: 'uc:vote', target: p.id });
        list.appendChild(b);
      });
      root.appendChild(list);
    } else addRecap();
    if (host) root.appendChild(btn('ghost small', 'Dépouiller maintenant', () => act({ t: 'uc:force' })));
  }

  // le dossier de l'éliminé : son nom, son tampon, les voix
  const elimFile = () => {
    if (!e) return;
    root.appendChild(el('div', 'uc-file uc-elim', `<p class="uc-label">Éliminé</p><p class="uc-big">${esc(e.name)}</p>${stamp(e.role)}<p class="fine">${e.tally.map(t => `${esc(t.name)}, ${t.n} voix`).join(' · ')}</p>`));
  };

  if (v.phase === 'elim') {
    elimFile();
    if (host) root.appendChild(btn('primary lg', 'Nouveau tour d’indices', () => act({ t: 'uc:continue' })));
    else root.appendChild(el('p', 'note', 'L’hôte relance le tour.'));
    addRecap();
  }

  if (v.phase === 'white-guess') {
    elimFile();
    if (e && e.id === mid) {
      const f = el('form', 'uc-guess', `<input id="uc-guess-in" maxlength="40" autocomplete="off" placeholder="Le mot des civils"><button class="btn primary" type="submit">Tenter ce mot</button>`);
      f.onsubmit = ev => { ev.preventDefault(); const w = $('#uc-guess-in').value.trim(); if (w) act({ t: 'uc:white-guess', word: w }); };
      root.appendChild(f);
    } else if (host) root.appendChild(btn('ghost small', 'Il ne répond pas ? Continuer', () => act({ t: 'uc:force' })));
  }

  if (v.phase === 'result') {
    root.appendChild(el('div', 'uc-words', `<div><span class="uc-label">Mot des civils</span><b>${esc(v.pair.civil)}</b></div><div><span class="uc-label">Mot undercover</span><b>${esc(v.pair.undercover)}</b></div>`));
    if (host) root.appendChild(btn('primary lg', v.round >= v.rounds ? 'Voir le classement' : 'Manche suivante', () => act({ t: 'uc:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));
    root.appendChild(block('uc-roster', 'La manche', v.players.map(p => row((p.alive ? '' : 'out ') + 'uc-' + p.role,
      `${who(p)}<span class="uc-role">${Undercover.ROLE_NAME[p.role]}</span><b class="rl-score">${p.gain ? '+' + p.gain : '0'}</b>`))));
    addRecap();
  }

  if (['elim', 'result', 'white-guess'].includes(v.phase) || v.round > 1)
    root.appendChild(block('uc-scores', 'Scores', v.scores.map(s => row(s.id === mid ? 'me' : '', `<span class="rl-name">${esc(s.name)}${s.id === mid ? ' <small>(toi)</small>' : ''}</span><b class="rl-score">${s.score}</b>`))));
  if (v.waiting.length && me.inRound) root.appendChild(el('p', 'note', `${esc(ucNames(v.waiting))} ${v.waiting.length > 1 ? 'entrent' : 'entre'} à la prochaine manche.`));
}
const myId = () => net.me;
