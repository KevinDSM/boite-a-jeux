// LoupGarou : affichage et commandes. Les règles du jeu sont dans engines/loupgarou.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md). La carte de rôle, le rôle qu'on maintient appuyé et l'écran de nuit gardent
// le dessin du jeu ; l'interface autour (état, choix, votes, village, journal) suit l'ossature commune.
// Le narrateur vocal (STEP.say, lwSay) parle à la table : des phrases entières, naturelles à l'oral.
let lwPeek = false, lwSpoken = null, lwBuzz = null, lwCupid = [], lwTimer = null;

const LW_ICON = {
  wolf: '<path d="M10 14 16 5l5 10h6l5-10 6 9-2 14-6 8-6 6-6-6-6-8z"/><circle cx="19" cy="24" r="1.8" fill="currentColor"/><circle cx="29" cy="24" r="1.8" fill="currentColor"/><path d="M21 33l3 2 3-2"/>',
  villager: '<path d="M7 23 24 8l17 15v18H7z"/><path d="M20 41V30h8v11"/>',
  seer: '<path d="M4 24q20-18 40 0-20 18-40 0z"/><circle cx="24" cy="24" r="6"/><circle cx="24" cy="24" r="2" fill="currentColor"/>',
  witch: '<path d="M19 6h10M21 6v10L10 36q-2 6 4 6h20q6 0 4-6L27 16V6"/><circle cx="20" cy="33" r="2"/><circle cx="27" cy="29" r="1.5"/>',
  hunter: '<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="4"/><path d="M24 4v10M24 34v10M4 24h10M34 24h10"/>',
  cupid: '<path d="M24 40 10 26q-6-8 0-14 7-5 14 3 7-8 14-3 6 6 0 14z"/><path d="M6 42 20 28M6 42h6M6 42v-6"/>',
  guard: '<path d="M24 6l16 6v12q0 12-16 18Q8 36 8 24V12z"/><path d="M17 24l5 5 9-10"/>',
};
const lwIcon = (r, cls = '') => `<svg class="lw-ico ${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LW_ICON[r] || LW_ICON.villager}</svg>`;
const lwRoleName = r => LoupGarou.ROLES[r]?.name || '';
/** Le rôle avec son article, pour le narrateur et le journal : « C'était la voyante. » */
const LW_THE = { wolf: 'un loup-garou', villager: 'un villageois', seer: 'la voyante', witch: 'la sorcière', hunter: 'le chasseur', cupid: 'Cupidon', guard: 'le salvateur' };
const lwNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
const lwProg = (done, total) => total > 0 ? el('div', 'mj-prog', `${Array.from({ length: total }, (_, i) => `<i${i < done ? ' class="f"' : ''}></i>`).join('')}<span>${done} sur ${total}</span>`) : null;

/** Le narrateur parle sur le téléphone de l'hôte, s'il l'a demandé dans le salon. */
function lwSay(text) {
  if (!net.isHost || !window.speechSynthesis || !lwVoiceOn()) return;
  text = String(text).replace(/\p{Extended_Pictographic}\uFE0F?\u00a0?/gu, '');   // la voix ne lit pas les emojis des joueurs
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = 0.95; u.pitch = 0.9; speechSynthesis.speak(u); } catch { }
}
function lwVoiceOn() { try { return localStorage.getItem('lw-voice') !== '0'; } catch { return true; } }

function renderLoupGarou(v) {
  if (!v) return;
  const root = $('#lw-main'); root.innerHTML = ''; clearInterval(lwTimer);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const night = v.phase === 'night' || v.phase === 'roles';
  root.className = 'stack lw ' + (night ? 'lw-night' : 'lw-day');
  const me = v.me, a = v.action;
  const say = list => list[(v.night + v.day) % list.length];              // une réplique stable pendant une nuit ou un jour
  const alive = v.players.filter(p => p.alive);
  const names = list => esc(lwNames(list));

  // narration et réveil discret du joueur concerné
  const sayKey = `${v.phase}|${v.night}|${v.day}|${v.step}|${v.revealSeq}|${v.tied ? 't' : ''}`;
  if (sayKey !== lwSpoken) {
    lwSpoken = sayKey;
    if (v.phase === 'night' && v.step) lwSay(v.stepSay || '');
    if (v.phase === 'reveal' && v.reveal) lwSay(v.reveal.deaths.length ? `${v.reveal.title}. ` + v.reveal.deaths.map(d => `${d.name} ${d.cause === 'love' ? 'meurt de chagrin' : 'est mort'}. C’était ${LW_THE[d.role] || lwRoleName(d.role)}.`).join(' ') : `${v.reveal.title}. ${v.reveal.empty}`);
    if (v.phase === 'day') lwSay(v.tied ? `Égalité. On revote entre ${v.tied.join(' et ')}.` : 'Le village débat, puis vote.');
    if (v.phase === 'hunter') lwSay(`${v.hunter?.name}, le chasseur, choisit sa cible.`);
    if (v.phase === 'over') lwSay(v.winner === 'village' ? 'Le village a gagné.' : v.winner === 'wolves' ? 'Les loups-garous ont gagné.' : v.winner === 'lovers' ? 'Les amoureux ont gagné.' : 'La partie est finie.');
  }
  const buzzKey = a && !['done'].includes(a.type) ? `${v.night}|${v.step}` : v.hunter?.me ? `h${v.revealSeq}` : null;
  if (buzzKey && buzzKey !== lwBuzz) { lwBuzz = buzzKey; try { navigator.vibrate?.([80, 60, 80]); } catch { } }

  // la ligne d'info discrète, avec la lune ou le soleil
  const when = v.phase === 'roles' ? `Distribution des rôles · ${v.total} joueurs` : v.phase === 'night' ? `Nuit ${v.night} · ${alive.length} en vie sur ${v.total}`
    : v.phase === 'over' ? 'Fin de la partie' : `Jour ${v.day} · ${alive.length} en vie sur ${v.total}`;
  root.appendChild(el('p', 'mj-meta lw-meta', `<span class="lw-moon${night ? '' : ' sun'}" aria-hidden="true"></span>${when}`));

  // mon rôle : on le maintient appuyé pour le voir, personne ne lit par-dessus l'épaule
  if (me && v.phase !== 'roles' && v.phase !== 'over') {
    const peek = el('button', 'lw-peek' + (lwPeek ? ' open' : ''), `<span class="lw-face back">Maintiens appuyé pour voir ton rôle</span><span class="lw-face front">${lwIcon(me.role)}<span><b>${lwRoleName(me.role)}</b>${me.lover ? `<small>amoureux de ${esc(me.lover)}</small>` : ''}${me.pack.length ? `<small>ta meute : ${me.pack.map(esc).join(', ')}</small>` : ''}</span></span>`);
    peek.type = 'button'; lwHold(peek);
    root.appendChild(peek);
  }

  // ce qui se passe, dit par le meneur
  const dead = me && !me.alive, ghost = v.seeAll ? 'Tu es mort et tu vois tous les rôles. Bouche cousue.' : 'Tu es mort. Garde le silence et profite du spectacle.';
  let title = '', line = '', prog = null;
  if (v.phase === 'roles') {
    prog = [v.seenCount, v.total];
    if (!me) { title = 'Distribution des rôles.'; line = 'Une partie est en cours. Tu regardes, tu joueras à la suivante.'; }
    else if (!me.seen) { title = 'Découvre ton rôle.'; line = 'Maintiens la carte appuyée, loin des regards. Ton voisin louche déjà dessus.'; }
    else { title = 'C’est vu.'; line = v.seenCount < v.total ? 'Garde ton sérieux, les autres découvrent le leur.' : 'Tout le monde a vu son rôle.'; }
  } else if (v.phase === 'night') {
    if (!a) {
      title = esc(v.stepLabel);
      line = !me ? 'Tu regardes la nuit passer.' : dead ? 'Tu es mort. Regarde la nuit passer, sans un bruit.' : say(['Ferme les yeux. Et arrête de sourire.', 'Yeux fermés, pas de triche.', 'Le village dort. Toi aussi, en principe.']);
    } else if (a.type === 'cupid') { title = 'À toi, Cupidon.'; line = 'Désigne deux amoureux. Tu peux te choisir.'; }
    else if (a.type === 'lovers') {
      title = 'Coup de foudre.';
      line = a.acked ? `Referme les yeux, et pense à ${esc(a.partner)}.` : `Toi et ${esc(a.partner)}, c’est pour la vie. Si l’un meurt, l’autre meurt de chagrin.${a.mixed ? ' Vous n’êtes pas du même camp : votre but, être les deux derniers en vie.' : ''}`;
    } else if (a.type === 'guard') { title = 'À toi, Salvateur.'; line = 'Qui protèges-tu des loups cette nuit ? Jamais le même deux nuits de suite.'; }
    else if (a.type === 'wolves') {
      const t = a.pack.map(w => w.target);
      title = 'À vous, les loups.';
      line = t.every(Boolean) && t.some(x => x !== t[0]) ? 'Pas d’accord ? Il faut la même victime pour toute la meute.' : 'Mettez-vous d’accord sur une victime.';
    } else if (a.type === 'seer') { title = 'À toi, Voyante.'; line = 'De qui veux-tu découvrir le rôle ?'; }
    else if (a.type === 'seerResult') {
      title = `${esc(a.name)} est ${LW_THE[a.role] || lwRoleName(a.role)}.`;
      line = a.ok ? 'Referme les yeux.' : a.role === 'wolf' ? 'Un loup ! À toi de convaincre le village sans te dévoiler.' : 'Garde-le pour toi, ou fais-le passer habilement.';
    } else if (a.type === 'witch') {
      title = 'À toi, Sorcière.';
      line = a.victim ? `Les loups ont choisi ${esc(a.victim)}.${a.save ? ' Tu le sauves.' : ''}` : 'Les loups n’ont désigné personne cette nuit.';
    } else if (a.type === 'done') { title = 'C’est fait.'; line = `${esc(a.text)} Referme les yeux.`; }
  } else if (v.phase === 'reveal' && v.reveal) {
    const r = v.reveal, d = r.deaths;
    if (r.kind === 'dawn') {
      title = d.length ? `${names(d.map(x => x.name))} ${d.length > 1 ? 'sont morts' : 'est mort'} cette nuit.` : 'Personne n’est mort cette nuit.';
      line = d.length ? say(['Le village se réveille, un peu moins nombreux.', 'Mauvaise nuit pour certains.', 'Le village se réveille. Pas tout le monde.']) : say(['Le village se réveille au complet. Louche, non ?', 'Tout le monde est là. Pour l’instant.']);
    } else if (r.kind === 'vote') {
      title = d.length ? `${esc(d[0].name)} est éliminé.` : 'Personne n’est éliminé.';
      line = d.length ? say(['Le village a tranché.', 'La démocratie a parlé.', 'Le village a voté, sans trembler.']) : r.votes?.length ? 'Nouvelle égalité. Le village hésite encore.' : 'Personne n’a voté.';
    } else {
      title = d.length ? `${esc(r.who || 'Le Chasseur')} emporte ${esc(d[0].name)}.` : 'Le Chasseur n’a pas tiré.';
      line = d.length ? 'Dernière balle, et pas perdue.' : 'Il est parti sans faire de bruit.';
    }
    if (dead) line += ' ' + ghost;
  } else if (v.phase === 'hunter' && v.hunter) {
    if (v.hunter.me) { title = 'Ton fusil est chargé.'; line = 'Tu es mort, mais tu choisis qui t’accompagne.'; }
    else { title = `${esc(v.hunter.name)} vise.`; line = 'Le Chasseur tombe, mais il lui reste une balle.'; }
  } else if (v.phase === 'day') {
    prog = [v.votedCount, v.aliveCount];
    const waiting = v.players.filter(p => p.alive && p.online && !p.voted && !p.me).map(p => p.name);
    const tie = v.tied ? `On revote entre ${names(v.tied)}.` : '';
    const close = v.closeIn ? `Tout le monde a voté. Fin du vote dans ${Math.ceil(v.closeIn / 1000)} s, on peut encore changer.` : '';
    if (!me) { title = 'Le village débat.'; line = 'Tu regardes, tu joueras à la prochaine partie.'; }
    else if (dead) { title = 'Le village débat.'; line = ghost; }
    else if (v.myVote) { title = 'Vote enregistré.'; line = close || `${tie ? tie + ' ' : ''}${waiting.length ? `Plus que ${names(waiting)}. ` : ''}Tu peux changer d’avis jusqu’à la fin.`; }
    else if (v.tied) { title = 'Égalité.'; line = tie; }
    else { title = 'Le village débat.'; line = close || say(['Qui a une tête de loup ? Débattez, puis votez.', 'Accusez, défendez-vous, puis votez.', 'Les loups sont parmi vous. Et ils ont l’air très innocents.']); }
  } else if (v.phase === 'over') {
    const w = v.winner;
    title = w === 'village' ? 'Le village gagne.' : w === 'wolves' ? 'Les loups-garous gagnent.' : w === 'lovers' ? 'Les amoureux gagnent.' : 'Personne n’a survécu.';
    line = w === 'village' ? say(['Les loups sont démasqués. Dormez tranquilles.', 'Le village respire enfin.']) : w === 'wolves' ? say(['Le village n’a rien vu venir.', 'Bon appétit, les loups.'])
      : w === 'lovers' ? 'L’amour, plus fort que tout.' : 'Village désert. Bravo à tous.';
    if (v.players.some(p => p.me && p.winner)) line += ' Tu fais partie des gagnants.';
  }
  const status = el('div', 'mj-status', `<h3 class="mj-title">${title}</h3>${line ? `<p class="mj-say">${line}</p>` : ''}`);
  const bar = prog && lwProg(prog[0], prog[1]); if (bar) status.appendChild(bar);
  root.appendChild(status);

  // une liste de choix : une ligne par joueur
  const pick = (opts, fn, isOn, tag) => {
    const g = el('div', 'mj-list rl-choices cols lw-pick');
    opts.forEach(o => {
      const on = isOn(o), b = el('button', 'mj-row rl-opt lw-opt' + (on ? ' on' : ''), `<span class="rl-name">${esc(o.name)}${o.id === net.me ? ' <small>(toi)</small>' : ''}</span><span class="rl-tag">${o.blocked ? 'protégé hier' : on ? tag : ''}</span>`);
      b.type = 'button'; b.onclick = () => fn(o); if (o.blocked) b.disabled = true;
      g.appendChild(b);
    });
    return g;
  };

  // distribution
  if (v.phase === 'roles' && me) {
    const card = el('button', 'lw-card' + (lwPeek ? ' open' : ''),
      `<span class="lw-face back"><span class="lw-card-back">${lwIcon('wolf', 'big')}</span><b class="lw-card-name">Ton rôle</b><span class="lw-card-text">Maintiens la carte appuyée pour la retourner.</span></span>`
      + `<span class="lw-face front">${lwIcon(me.role, 'big')}<b class="lw-card-name">${lwRoleName(me.role)}</b><span class="lw-card-text">${esc(LoupGarou.ROLES[me.role].text)}</span>${me.pack.length ? `<span class="lw-card-pack">Tes complices : ${me.pack.map(esc).join(', ')}</span>` : ''}</span>`);
    card.type = 'button'; lwHold(card);
    root.appendChild(card);
    if (!me.seen) root.appendChild(btn('primary lg', 'J’ai vu mon rôle', () => act({ t: 'lw:seen' })));
  }
  if (v.phase === 'roles' && v.isHost) root.appendChild(btn('ghost small', 'Lancer la nuit sans attendre', () => act({ t: 'lw:begin' })));

  // nuit
  if (v.phase === 'night') {
    if (!a || a.type === 'done') root.appendChild(el('div', 'lw-sleep', '<span class="lw-moon" aria-hidden="true"></span><span class="lw-zz">Chut.</span>'));
    if (a?.type === 'cupid') {
      lwCupid = lwCupid.filter(id => a.options.some(o => o.id === id));
      root.appendChild(pick(a.options, o => { const i = lwCupid.indexOf(o.id); if (i >= 0) lwCupid.splice(i, 1); else if (lwCupid.length < 2) lwCupid.push(o.id); renderLoupGarou(view.lw); }, o => lwCupid.includes(o.id), 'amoureux'));
      const ok = btn('primary lg', lwCupid.length === 2 ? 'Unir ces deux-là' : lwCupid.length ? 'Encore un joueur' : 'Choisis deux joueurs', () => { if (lwCupid.length === 2) act({ t: 'lw:cupid', a: lwCupid[0], b: lwCupid[1] }); });
      ok.disabled = lwCupid.length !== 2; root.appendChild(ok);
    }
    if (a?.type === 'lovers') {
      root.appendChild(el('div', 'lw-reveal-card love', `${lwIcon('cupid', 'big')}<b>${esc(a.partner)}</b><span>Votre destin est lié.</span>`));
      if (!a.acked) root.appendChild(btn('primary lg', 'Compris', () => act({ t: 'lw:ack' })));
    }
    if (a?.type === 'guard') root.appendChild(pick(a.options, o => act({ t: 'lw:guard', to: o.id }), () => false, ''));
    if (a?.type === 'wolves') {
      root.appendChild(pick(a.options, o => act({ t: 'lw:wolf', to: o.id }), o => a.mine === o.id, 'ton choix'));
      const pack = el('div', 'lw-meute rl-block', '<span class="mj-side-title">La meute</span>');
      const list = el('div', 'mj-list');
      a.pack.forEach(w => list.appendChild(el('div', 'mj-row' + (w.me ? ' me' : ''), `<span class="rl-name">${esc(w.name)}${w.me ? ' <small>(toi)</small>' : ''}</span><span class="rl-tag${w.target ? '' : ' wait'}">${w.target ? 'veut ' + esc(w.target) : 'n’a pas choisi'}</span>`)));
      pack.appendChild(list); root.appendChild(pack);
    }
    if (a?.type === 'seer') root.appendChild(pick(a.options, o => act({ t: 'lw:seer', to: o.id }), () => false, ''));
    if (a?.type === 'seerResult') {
      root.appendChild(el('div', 'lw-reveal-card', `${lwIcon(a.role, 'big')}<b>${esc(a.name)}</b><span>${lwRoleName(a.role)}</span>`));
      if (!a.ok) root.appendChild(btn('primary lg', 'Compris', () => act({ t: 'lw:seerok' })));
    }
    if (a?.type === 'witch') {
      const life = btn('lw-potion life' + (a.save ? ' on' : ''), !a.life ? 'Potion de vie déjà utilisée' : !a.victim ? 'Personne à sauver' : a.save ? `Annuler le sauvetage de ${esc(a.victim)}` : `Sauver ${esc(a.victim)} avec la potion de vie`, () => act({ t: 'lw:save' }));
      life.disabled = !a.life || !a.victim; root.appendChild(life);
      const death = el('div', 'lw-poison rl-block', '<span class="mj-side-title">Potion de mort</span>');
      if (a.death) {
        const k = a.options.find(o => o.id === a.kill);
        death.appendChild(el('p', 'lw-act', k ? `${esc(k.name)} sera empoisonné. Touche encore pour annuler.` : 'Un joueur à empoisonner, ou personne.'));
        death.appendChild(pick(a.options, o => act({ t: 'lw:poison', to: o.id }), o => a.kill === o.id, 'empoisonné'));
      } else death.appendChild(el('p', 'lw-act', 'Déjà utilisée.'));
      root.appendChild(death);
      root.appendChild(btn('primary lg', 'Me rendormir', () => act({ t: 'lw:witchdone' })));
    }
    if (me?.role === 'seer' && me.seerLog.length && a) root.appendChild(el('p', 'note lw-log-seer', 'Déjà sondés : ' + me.seerLog.map(s => `${esc(s.name)} (${lwRoleName(s.role)})`).join(' · ')));
  }

  // annonces du matin, du vote, du chasseur
  if (v.phase === 'reveal' && v.reveal) {
    const r = v.reveal;
    if (r.deaths.length) {
      const list = el('div', 'mj-list lw-deaths');
      r.deaths.forEach(d => list.appendChild(el('div', 'mj-row lw-death-row', `${lwIcon(d.role)}<span class="rl-name"><b>${esc(d.name)}</b><small>${d.cause === 'love' ? 'mort de chagrin' : d.cause === 'poison' ? 'empoisonné' : d.cause === 'vote' ? 'éliminé par le village' : d.cause === 'hunter' ? 'abattu' : 'dévoré'}</small></span><span class="rl-tag lw-death-role">${lwRoleName(d.role)}</span>`)));
      root.appendChild(list);
    }
    if (r.votes?.length) root.appendChild(el('p', 'note lw-votes', r.votes.map(x => `${esc(x.from)} → ${esc(x.to)}`).join(' · ')));
    const bar = el('div', 'lw-timer'); const i = el('i'); bar.appendChild(i); root.appendChild(bar);
    const t0 = Date.now(), left0 = v.revealLeft;
    const paint = () => { i.style.width = Math.max(0, 100 * (left0 - (Date.now() - t0)) / 14000) + '%'; };
    paint(); lwTimer = setInterval(paint, 200);
    if (v.isHost) root.appendChild(btn('ghost small', 'Passer à la suite', () => act({ t: 'lw:next' })));
  }

  if (v.phase === 'hunter' && v.hunter?.me) root.appendChild(pick(v.hunter.options, o => act({ t: 'lw:shoot', to: o.id }), () => false, ''));

  // jour : débat de vive voix, vote sur les téléphones
  if (v.phase === 'day') {
    if (v.lastTally) root.appendChild(el('p', 'note lw-votes', 'Premier tour : ' + v.lastTally.map(x => `${esc(x.from)} → ${esc(x.to)}`).join(' · ')));
    if (me?.alive) {
      const opts = v.players.filter(p => p.alive && !p.me && (!v.tiedIds || v.tiedIds.includes(p.id)));
      root.appendChild(pick(opts, o => act({ t: 'lw:vote', to: o.id }), o => v.myVote === o.id, 'ton vote'));
    }
    if (v.closeIn) setTimeout(() => { if (view?.lw?.phase === 'day') renderLoupGarou(view.lw); }, 1000);
    if (v.isHost) root.appendChild(btn('ghost small', 'Clore le vote maintenant', () => act({ t: 'lw:close' })));
  }

  if (v.phase === 'over') {
    if (v.isHost) { const r = el('div', 'lw-actions'); r.append(btn('primary lg', 'Rejouer avec de nouveaux rôles', () => act({ t: 'lw:again' })), btn('ghost', 'Retour au salon', () => act({ t: 'restart' }))); root.appendChild(r); }
    else root.appendChild(el('p', 'note', 'L’hôte relance une partie ou revient au salon.'));
  }

  // le village (colonne de droite sur PC)
  if (v.phase !== 'roles') {
    const box = el('div', 'lw-village rl-block', `<span class="mj-side-title">Le village</span>`);
    const list = el('div', 'mj-list');
    v.players.forEach(p => {
      const tag = [p.role ? lwRoleName(p.role) : '', p.alive ? '' : 'mort', v.phase === 'day' && p.voted ? 'a voté' : '', p.winner ? 'gagne' : ''].filter(Boolean).join(' · ');
      list.appendChild(el('div', `mj-row lw-p${p.alive ? '' : ' dead'}${p.me ? ' me' : ''}${p.winner ? ' win' : ''}${p.online ? '' : ' off'}`,
        `${p.role ? lwIcon(p.role) : '<span class="lw-ico q" aria-hidden="true">?</span>'}<span class="rl-name">${esc(p.name)}${p.me ? ' <small>(toi)</small>' : ''}${p.lover ? ' <i class="lw-heart" title="amoureux">♥</i>' : ''}</span><span class="rl-tag">${tag}</span>`));
    });
    box.appendChild(list); root.appendChild(box);
  }
  if (v.log.length) {
    const lg = el('div', 'lw-log rl-log', '<span class="mj-side-title">Ce qui s’est passé</span>');
    const ul = el('ul'); v.log.slice().reverse().forEach(t => ul.appendChild(el('li', '', esc(t)))); lg.appendChild(ul);
    root.appendChild(lg);
  }
}
/** Maintenir appuyé pour voir, relâcher pour cacher : on bascule une classe, sans reconstruire l'écran. */
function lwHold(node) {
  node.addEventListener('pointerdown', e => { e.preventDefault(); lwPeek = true; node.classList.add('open'); try { node.setPointerCapture(e.pointerId); } catch { } });
  node.addEventListener('contextmenu', e => e.preventDefault());
}
function lwRelease() { if (!lwPeek) return; lwPeek = false; document.querySelectorAll('.lw-peek.open,.lw-card.open').forEach(n => n.classList.remove('open')); }
['pointerup', 'pointercancel', 'touchend', 'blur'].forEach(ev => (ev === 'blur' ? window : document).addEventListener(ev, lwRelease));
