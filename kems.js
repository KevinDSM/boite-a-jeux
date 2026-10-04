// Kems : affichage et commandes. Les règles du jeu sont dans engines/kems.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
let kmSel = null, kmSelTable = null, kmLastSeq = -1, kmLastDeal = null, kmArm = null, kmArmTimer = null, kmQuietTimer = null, kmTeamsKey = null;
const kmTeamPick = {};                     // choix des équipes par l'hôte dans le salon, par identifiant de joueur
const KM_SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const kmNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];

function kmCardHTML(c) {
  const red = c.s === 'H' || c.s === 'D';
  return `<span class="km-corner${red ? ' red' : ''}"><b>${c.r}</b><i>${KM_SUIT[c.s]}</i></span><span class="km-pip${red ? ' red' : ''}">${KM_SUIT[c.s]}</span><span class="km-corner bottom${red ? ' red' : ''}"><b>${c.r}</b><i>${KM_SUIT[c.s]}</i></span>`;
}

/** Options du salon : l'hôte range chaque joueur dans une équipe, ou tire au sort. */
function renderKemsOpts(s) {
  const box = $('#opt-km-teams'); if (!box) return;
  const online = s.players.filter(p => p.online);
  const key = online.map(p => p.id + ':' + p.name).join('|') + '#' + online.map(p => kmTeamPick[p.id] ?? '-').join('');
  if (key === kmTeamsKey) return;
  kmTeamsKey = key; box.innerHTML = '';
  const list = el('div', 'km-picklist');
  online.forEach(p => {
    const row = el('div', 'km-pickrow', `<span class="km-pickname">${esc(p.name)}</span>`);
    const seg = el('div', 'km-seg');
    Kems.TEAMS.forEach((t, k) => {
      const b = el('button', 'km-segbtn t' + k + (kmTeamPick[p.id] === k ? ' on' : ''), `${t.sym} ${t.name}`); b.type = 'button';
      b.setAttribute('aria-pressed', String(kmTeamPick[p.id] === k));
      b.onclick = () => { kmTeamPick[p.id] = kmTeamPick[p.id] === k ? undefined : k; renderKemsOpts(view); };
      seg.appendChild(b);
    });
    row.appendChild(seg); list.appendChild(row);
  });
  box.appendChild(list);
  const t = Kems.split(online, kmTeamPick);
  const line = el('p', 'fine km-pickline',
    Kems.TEAMS.map((tm, k) => `<b class="t${k}">${tm.sym} ${esc(tm.name)}</b> ${t[k].length ? esc(kmNames(t[k].map(p => p.name))) : 'personne pour l’instant'}`).join('<br>')
    + (t.extra.length ? `<br>${esc(kmNames(t.extra.map(p => p.name)))} regarde${t.extra.length > 1 ? 'nt' : ''}` : ''));
  box.appendChild(line);
  const rnd = el('button', 'btn ghost small', 'Tirer les équipes au sort'); rnd.type = 'button';
  rnd.onclick = () => { const ids = shuffle(online.map(p => p.id)); ids.forEach((id, i) => kmTeamPick[id] = i < 2 ? 0 : i < 4 ? 1 : undefined); renderKemsOpts(view); };
  box.appendChild(rnd);
}

function renderKems(v) {
  if (!v) return;
  const root = $('#km-main'); root.innerHTML = '';
  if (v.deal !== kmLastDeal) { kmLastDeal = v.deal; kmSel = null; kmSelTable = null; kmArm = null; kmLastSeq = -1; }
  const me = v.me, host = v.isHost;
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const say = list => list[(v.deal - 1) % list.length];              // une réplique stable pendant toute la donne
  const team = k => `<b class="km-team t${k}">${Kems.TEAMS[k].sym}</b>`;
  const les = k => `les ${Kems.TEAMS[k].name}`;
  const M = esc(me.mateName || '');
  const [s0, s1] = [v.teams[0].score, v.teams[1].score];

  root.appendChild(el('p', 'mj-meta', v.phase === 'over' ? `Partie terminée · ${Kems.TEAMS[0].name} ${s0}, ${Kems.TEAMS[1].name} ${s1}`
    : `Donne ${v.deal} · ${Kems.TEAMS[0].name} ${s0}, ${Kems.TEAMS[1].name} ${s1} · premier à ${v.target}`));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', hot = false, prog = null;
  if (v.phase === 'play') {
    if (!me.seated) { title = 'Tu regardes.'; line = 'La table est complète. Tu joueras à la prochaine partie.'; }
    else if (me.signal) { title = `${M} te fait un signe.`; line = say(['Un carré en vue ? À toi de crier.', 'Ça ressemble fort à un carré. Tu cries, ou tu doutes.']); hot = true; }
    else if (me.carre) { title = 'Tu as un carré.'; line = say([`Fais ton signe à ${M}. Discrètement.`, 'Maintenant, le signe. Sans te faire griller.', `${M} doit comprendre. Les autres, non.`]); hot = true; }
    else if (kmSel) { title = 'Tu échanges.'; line = 'Contre quelle carte du milieu ?'; }
    else if (kmSelTable) { title = 'Tu échanges.'; line = 'Tu donnes quelle carte de ta main ?'; }
    else if (me.pass) { title = 'Tu passes.'; line = say(['Le milieu change quand tout le monde passe.', 'Rien ne te plaît. Patience.']); }
    else { title = 'Tout le monde échange.'; line = say(['Premier arrivé, premier servi.', 'Vise un carré. Et surveille les visages.', 'Ça échange dans tous les sens. Garde un œil sur ceux d’en face.']); }
    if (me.seated && (v.passCount || me.pass)) prog = [v.passCount, v.liveCount];
  } else if (v.result && v.phase === 'result') {
    const r = v.result, C = esc(r.callerName), win = r.winnerTeam, meCalled = r.callerId === net.me;
    const mate = r.hands.find(h => h.team === r.callerTeam && h.id !== r.callerId);
    const hit = r.hands.find(h => h.team !== r.callerTeam && h.carre);
    const pts = `${r.points > 1 ? 'Deux points' : 'Un point'} pour ${les(win)}.`;
    if (r.kind === 'kems') {
      if (r.double) { title = 'Double Kems !'; line = `${meCalled ? `Toi et ${esc(mate?.name || '')}, vous aviez` : `${C} et ${esc(mate?.name || '')} avaient`} chacun un carré. ${pts}`; }
      else if (r.ok) { title = meCalled ? 'Tu as vu juste.' : `${C} a vu juste.`; line = `${esc(mate?.name || '')} tenait un carré ${Kems.ofRank(mate.cards[0].r)}. ${pts}`; }
      else { title = meCalled ? 'Tu as rêvé.' : `${C} a rêvé.`; line = `${esc(mate?.name || '')} n’avait pas de carré. ${pts}`; }
    } else {
      if (r.ok && hit) { title = 'Contre-Kems réussi.'; line = `${meCalled ? 'Tu as' : `${C} a`} flairé le carré ${Kems.ofRank(hit.cards[0].r)} de ${esc(hit.name)}. ${pts}`; }
      else { title = meCalled ? 'Tu as crié trop vite.' : `${C} a crié trop vite.`; line = `Personne en face n’avait de carré. ${pts}`; }
    }
    hot = me.seated && me.team === win;
  } else if (v.phase === 'over') {
    const w = s0 >= s1 ? 0 : 1, mine = me.seated && me.team === w;
    title = mine ? 'Ton équipe gagne la partie.' : `Les ${Kems.TEAMS[w].name} gagnent la partie.`;
    line = `${esc(kmNames(v.teams[w].names))}, ${Math.max(s0, s1)} à ${Math.min(s0, s1)}. Revanche ? Tout se passe au salon.`;
    hot = mine;
  }
  const status = el('div', 'mj-status' + (hot ? ' km-hot' : ''), `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`);
  if (prog) status.appendChild(el('div', 'mj-prog', `${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]} ${prog[0] > 1 ? 'passent' : 'passe'}</span>`));
  root.appendChild(status);

  if (v.phase === 'play') {
    // le milieu, puis ta main
    root.appendChild(el('p', 'mj-side-title km-zone-title', 'Le milieu'));
    const table = el('div', 'km-table');
    v.table.forEach(c => {
      const b = el('button', 'km-card' + (kmSelTable === c.id ? ' sel' : '') + (kmSel ? ' can' : '') + (v.seq !== kmLastSeq ? ' pop' : ''), kmCardHTML(c));
      b.type = 'button';
      b.onclick = () => {
        if (!me.seated) { toast('Tu regardes cette partie. Tu joueras à la prochaine.'); return; }
        if (kmSel) { const h = kmSel; kmSel = null; act({ t: 'km:swap', hand: h, table: c.id }); return; }
        kmSelTable = kmSelTable === c.id ? null : c.id; renderKems(view.kems);
      };
      table.appendChild(b);
    });
    kmLastSeq = v.seq;
    root.appendChild(table);

    if (me.seated) {
      root.appendChild(el('p', 'mj-side-title km-zone-title', me.carre ? 'Ta main · un carré !' : 'Ta main'));
      const hand = el('div', 'km-hand' + (me.carre ? ' carre' : ''));
      me.hand.forEach(c => {
        const b = el('button', 'km-card' + (kmSel === c.id ? ' sel' : '') + (kmSelTable ? ' can' : ''), kmCardHTML(c));
        b.type = 'button';
        b.onclick = () => {
          if (kmSelTable) { const t = kmSelTable; kmSelTable = null; act({ t: 'km:swap', hand: c.id, table: t }); return; }
          kmSel = kmSel === c.id ? null : c.id; renderKems(view.kems);
        };
        hand.appendChild(b);
      });
      root.appendChild(hand);

      // Kems et Contre-Kems : un premier toucher arme le bouton, un second confirme (une erreur coûte un point)
      const calls = el('div', 'km-calls');
      const armBtn = (key, cls, label, armed, m) => btn(cls + (kmArm === key ? ' armed' : ''), kmArm === key ? armed : label, () => {
        if (kmArm === key) { kmArm = null; clearTimeout(kmArmTimer); act(m); return; }
        kmArm = key; clearTimeout(kmArmTimer); kmArmTimer = setTimeout(() => { kmArm = null; if (view?.kems) renderKems(view.kems); }, 2500);
        renderKems(view.kems);
      });
      calls.appendChild(armBtn('kems', 'primary lg km-kems', 'Kems !', `Sûr ? ${M} a un carré`, { t: 'km:kems' }));
      calls.appendChild(armBtn('contre', 'danger lg km-contre', 'Contre-Kems !', 'Sûr ? Un adversaire a un carré', { t: 'km:contre' }));
      root.appendChild(calls);

      const acts = el('div', 'km-actions');
      const pass = btn(me.pass ? 'on' : '', me.pass ? 'Je ne passe plus' : 'Je passe', () => act({ t: 'km:pass' }));
      pass.setAttribute('aria-pressed', String(!!me.pass));
      acts.appendChild(pass);
      // l'hôte fait office de donneur : il peut renouveler le milieu si plus rien ne bouge
      clearTimeout(kmQuietTimer);
      if (host && v.quiet > 10000) acts.appendChild(btn('ghost small', 'Plus rien ne bouge ? Renouveler le milieu', () => act({ t: 'km:refresh' })));
      else if (host) kmQuietTimer = setTimeout(() => { if (view?.kems) renderKems(view.kems); }, 10200 - v.quiet);
      root.appendChild(acts);
    }

    // la table : partenaires en diagonale, comme autour d'une vraie table (colonne de droite sur PC)
    const seats = el('div', 'km-seats');
    seats.appendChild(el('p', 'mj-side-title', 'La table'));
    const grid = el('div', 'km-seat-grid');
    [v.seats[0], v.seats[1], v.seats[3], v.seats[2]].filter(Boolean).forEach(q => {
      grid.appendChild(el('div', `km-seat${q.me ? ' me' : ''}${q.mate ? ' mate' : ''}${q.online ? '' : ' off'}${q.pass ? ' pass' : ''}`,
        `<span class="km-seat-name">${team(q.team)} ${q.bot ? '🤖 ' : ''}${esc(q.name)}</span><span class="km-seat-sub">${q.me ? 'toi' : q.mate ? 'partenaire' : 'adversaire'}${q.pass ? ' · <i>passe</i>' : ''}</span>`));
    });
    seats.appendChild(grid);
    root.appendChild(seats);
  }

  if (v.phase === 'result' || v.phase === 'over') {
    const r = v.result;
    if (r) {
      const box = el('div', 'km-reveal');
      box.appendChild(el('p', 'mj-side-title', v.phase === 'over' ? 'La dernière donne' : 'Les mains'));
      const list = el('div', 'mj-list');
      r.hands.forEach(h => {
        const row = el('div', 'mj-row km-reveal-row' + (h.carre ? ' carre' : ''),
          `<div class="km-reveal-head"><b>${team(h.team)} ${esc(h.name)}</b><span>${h.carre ? `carré ${Kems.ofRank(h.cards[0].r)}` : 'pas de carré'}</span></div>`);
        const mini = el('div', 'km-hand mini');
        h.cards.forEach(c => mini.appendChild(el('div', 'km-card', kmCardHTML(c))));
        row.appendChild(mini); list.appendChild(row);
      });
      box.appendChild(list); root.appendChild(box);
    }
    if (host) root.appendChild(v.phase === 'over'
      ? btn('primary lg', 'Retour au salon', () => act({ t: 'restart' }))
      : btn('primary lg', Math.max(s0, s1) >= v.target ? 'Voir le résultat' : 'Donne suivante', () => act({ t: 'km:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));
  }

  // les scores (colonne de droite sur PC ; sur téléphone, la ligne du haut suffit pendant la donne)
  const score = el('div', 'km-score' + (v.phase === 'play' ? ' in-play' : ''));
  score.appendChild(el('p', 'mj-side-title', v.phase === 'over' ? 'Score final' : `Scores · premier à ${v.target}`));
  const sl = el('div', 'mj-list');
  v.teams.forEach((t, k) => {
    const gain = v.phase === 'result' && v.result?.winnerTeam === k ? ` <em>+${v.result.points}</em>` : '';
    sl.appendChild(el('div', 'mj-row km-score-row' + (me.seated && me.team === k ? ' mine' : ''),
      `<span class="km-score-name"><b>${team(k)} ${esc(t.name)}</b><small>${esc(kmNames(t.names))}${me.seated && me.team === k ? ' · ton équipe' : ''}</small></span><b class="km-score-pts">${t.score}${gain}</b>`));
  });
  score.appendChild(sl);
  root.appendChild(score);

  if (v.log.length) {
    const lg = el('ul', 'km-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }
}
