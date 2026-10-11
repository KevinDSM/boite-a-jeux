// Kems : affichage et commandes. Les règles du jeu sont dans engines/kems.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
// Tout l'écran est la table (table.js, table.css) : ton partenaire assis en face, les deux adversaires à
// gauche et à droite, les quatre cartes du milieu sur le tapis, ta main en éventail dans le plateau de verre
// en bas avec Kems et Contre-Kems. Scores et fil dans la feuille sur téléphone, dans la colonne de droite sur PC.
let kmSel = null, kmSelTable = null, kmLastSeq = -1, kmLastDeal = null, kmArm = null, kmArmTimer = null, kmQuietTimer = null, kmTeamsKey = null;
let kmLastView = null, kmPrevTable = [];
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

// « 🦊 Kevin » → ['🦊', 'Kevin'] ; un robot n'a pas d'emoji dans son nom (« Robot Trèfle »), on lui en donne un
const kmSplit = q => {
  const n = q?.name || '', m = n.match(/^(\S+)\s+(.+)$/);
  return m && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(m[1]) ? [m[1], m[2]] : [q?.bot ? '🤖' : glyph0(n), n];
};
const kmSym = k => `<span class="kmx-sym t${k}" aria-hidden="true">${Kems.TEAMS[k].sym}</span>`;

// la feuille des scores ou du fil (téléphone)
function kmSheetBody() {
  const v = kmLastView; if (!v) return '';
  if (tbSheet.kind === 'km-log') return tbLog(v.log.slice().reverse());
  const me = v.me;
  const teams = tbRows(v.teams.map((t, k) => ({ e: kmSym(k), name: t.name, sub: esc(kmNames(t.names)) + (me.seated && me.team === k ? ' · ton équipe' : ''), score: t.score, me: me.seated && me.team === k })));
  const seats = tbRows([v.seats[0], v.seats[1], v.seats[3], v.seats[2]].filter(Boolean).map(q => {
    const [e, n] = kmSplit(q);
    return { e, name: n, sub: (q.me ? 'toi' : q.mate ? 'partenaire' : 'adversaire') + (q.pass ? ' · passe' : '') + (q.online ? '' : ' · absent'), score: kmSym(q.team), me: q.me };
  }));
  return `<p class="tb-sheet-say">Donne ${v.deal}. La première équipe à ${v.target} points gagne.</p>${teams}<p class="mj-side-title kmx-sheet-title">La table</p>${seats}`;
}
const kmOpenSheet = kind => tbSheet.open(kind, kind === 'km-log' ? 'Ce qui s’est passé' : 'Scores', kmSheetBody);

function renderKems(v) {
  if (!v) return;
  kmLastView = v;
  const root = $('#km-main'); root.innerHTML = '';
  if (v.deal !== kmLastDeal) { kmLastDeal = v.deal; kmSel = null; kmSelTable = null; kmArm = null; kmLastSeq = -1; kmPrevTable = []; }
  const me = v.me, host = v.isHost, desk = tbDesk();
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const say = list => list[(v.deal - 1) % list.length];              // une réplique stable pendant toute la donne
  const team = k => `<b class="km-team t${k}">${Kems.TEAMS[k].sym}</b>`;
  const les = k => `les ${Kems.TEAMS[k].name}`;
  const M = esc(me.mateName || '');
  const [s0, s1] = [v.teams[0].score, v.teams[1].score];

  // la ligne de partie, et sur téléphone les deux puces qui ouvrent le fil et les scores
  const left = v.phase === 'over' ? `Partie terminée · ${Kems.TEAMS[0].name} <b>${s0}</b>, ${Kems.TEAMS[1].name} <b>${s1}</b>`
    : v.phase === 'result' ? `Fin de la donne <b>${v.deal}</b> · premier à ${v.target}`
      : `Donne <b>${v.deal}</b> · premier à ${v.target}`;
  const chips = [];
  if (v.phase === 'play') {
    if (v.log.length) chips.push(tbChip(TB_ICON.log + 'Fil', () => kmOpenSheet('km-log')));
    chips.push(tbChip(`${TB_ICON.trophy}${kmSym(0)}<b>${s0}</b>${kmSym(1)}<b>${s1}</b>`, () => kmOpenSheet('km-scores'), `Scores : ${Kems.TEAMS[0].name} ${s0}, ${Kems.TEAMS[1].name} ${s1}`));
  }
  root.appendChild(tbBar(left, chips));

  // ce qui se passe, dit par le meneur
  let title = '', line = '', hot = false, pip = '';
  if (v.phase === 'play') {
    if (!me.seated) { title = 'Tu regardes.'; line = 'La table est complète. Tu joueras à la prochaine partie.'; pip = '👀'; }
    else if (me.signal) { title = `${M} te fait un signe.`; line = say(['Un carré en vue ? À toi de crier.', 'Ça ressemble fort à un carré. Tu cries, ou tu doutes.']); hot = true; pip = '👀'; }
    else if (me.carre) { title = 'Tu as un carré.'; line = say([`Fais ton signe à ${M}. Discrètement.`, 'Maintenant, le signe. Sans te faire griller.', `${M} doit comprendre. Les autres, non.`]); hot = true; pip = '🤫'; }
    else if (kmSel) { title = 'Tu échanges.'; line = 'Contre quelle carte du milieu ?'; pip = '👉'; }
    else if (kmSelTable) { title = 'Tu échanges.'; line = 'Tu donnes quelle carte de ta main ?'; pip = '👉'; }
    else if (me.pass) { title = 'Tu passes.'; line = say(['Le milieu change quand tout le monde passe.', 'Rien ne te plaît. Patience.']); pip = '✋'; }
    else { title = 'Tout le monde échange.'; line = say(['Premier arrivé, premier servi.', 'Vise un carré. Et surveille les visages.', 'Ça échange dans tous les sens. Garde un œil sur ceux d’en face.']); pip = '🔁'; }
  } else if (v.result && v.phase === 'result') {
    const r = v.result, C = esc(r.callerName), win = r.winnerTeam, meCalled = r.callerId === net.me;
    const mate = r.hands.find(h => h.team === r.callerTeam && h.id !== r.callerId);
    const hit = r.hands.find(h => h.team !== r.callerTeam && h.carre);
    const pts = `${r.points > 1 ? 'Deux points' : 'Un point'} pour ${les(win)}.`;
    if (r.kind === 'kems') {
      if (r.double) { title = 'Double Kems !'; line = `${meCalled ? `Toi et ${esc(mate?.name || '')}, vous aviez` : `${C} et ${esc(mate?.name || '')} avaient`} chacun un carré. ${pts}`; }
      else if (r.ok) { title = meCalled ? 'Tu as vu juste.' : `${C} a vu juste.`; line = `${esc(mate?.name || '')} tenait un carré ${Kems.ofRank(mate.cards[0].r)}. ${pts}`; }
      else { title = meCalled ? 'Tu as rêvé.' : `${C} a rêvé.`; line = `${esc(mate?.name || '')} n’avait pas de carré. ${pts}`; }
    } else {
      if (r.ok && hit) { title = 'Contre-Kems réussi.'; line = `${meCalled ? 'Tu as' : `${C} a`} flairé le carré ${Kems.ofRank(hit.cards[0].r)} de ${esc(hit.name)}. ${pts}`; }
      else { title = meCalled ? 'Tu as crié trop vite.' : `${C} a crié trop vite.`; line = `Personne en face n’avait de carré. ${pts}`; }
    }
    hot = me.seated && me.team === win; pip = hot ? '🎉' : Kems.TEAMS[win].sym;
  } else if (v.phase === 'over') {
    const w = s0 >= s1 ? 0 : 1, mine = me.seated && me.team === w;
    title = mine ? 'Ton équipe gagne la partie.' : `Les ${Kems.TEAMS[w].name} gagnent la partie.`;
    line = `${esc(kmNames(v.teams[w].names))}, ${Math.max(s0, s1)} à ${Math.min(s0, s1)}. Revanche ? Tout se passe au salon.`;
    hot = mine; pip = '🏆';
  }
  const status = tbSay({ title, line, pip, hot });
  if (hot) status.classList.add('km-hot');

  if (v.phase === 'play') {
    // la table : ton partenaire en face, les adversaires à gauche et à droite, le milieu sur le tapis
    const myIdx = v.seats.findIndex(q => q.me);
    const pos = q => { if (myIdx < 0) return ''; const k = (v.seats.findIndex(s => s.id === q.id) - myIdx + 4) % 4; return k === 1 ? ' kmx-l' : k === 2 ? ' kmx-top' : k === 3 ? ' kmx-r' : ''; };
    const table = el('div', 'kmx-table' + (myIdx < 0 ? ' kmx-watch' : ''));
    // même forme que les prénoms du salon : emoji, espace insécable, prénom (les robots de Kems n'ont pas d'emoji)
    const people = v.seats.map(q => { const [e, n] = kmSplit(q); return { ...q, name: `${e} ${n}` }; });
    table.appendChild(tbSeats(people, {
      meId: myIdx < 0 ? null : v.seats[myIdx].id,
      badge: q => Kems.TEAMS[q.team]?.sym ?? '',
      cls: q => `kmx-t${q.team}${pos(q)}${q.mate ? ' kmx-mate' : ''}${q.mate && me.signal ? ' kmx-sig' : ''}${q.pass ? ' kmx-pass' : ''}`,
      under: q => (q.mate ? `<span class="tb-tag ${me.signal ? 'warn' : 'soft kmx-tag-mate'}">${me.signal ? 'un signe !' : 'partenaire'}</span>` : '')
        + (q.pass ? '<span class="tb-tag soft kmx-ptag">passe</span>' : ''),
    }));

    const mid = el('div', 'kmx-mid' + (kmSel ? ' can' : ''));
    mid.appendChild(el('p', 'kmx-mid-title', 'Le milieu'));
    const row = el('div', 'kmx-mid-row');
    v.table.forEach(c => {
      const fresh = kmLastSeq !== -1 && !kmPrevTable.includes(c.id);
      const spot = el('div', 'tb-slot kmx-spot' + (kmSelTable === c.id ? ' sel' : '') + (kmSel ? ' ok' : '') + (kmSelTable && kmSelTable !== c.id ? ' no' : ''));
      spot.style.setProperty('--tilt', `${tbTilt(c.id, 7).toFixed(1)}deg`);
      const b = el('button', 'km-card' + (kmSelTable === c.id ? ' sel' : '') + (kmSel ? ' can' : '') + (fresh ? ' pop' : ''), kmCardHTML(c));
      b.type = 'button';
      b.onclick = () => {
        if (!me.seated) { toast('Tu regardes cette partie. Tu joueras à la prochaine.'); return; }
        if (kmSel) { const h = kmSel; kmSel = null; act({ t: 'km:swap', hand: h, table: c.id }); return; }
        kmSelTable = kmSelTable === c.id ? null : c.id; renderKems(view.kems);
      };
      spot.appendChild(b); row.appendChild(spot);
    });
    kmLastSeq = v.seq; kmPrevTable = v.table.map(c => c.id);
    mid.appendChild(row);
    // l'hôte fait office de donneur : il peut renouveler le milieu si plus rien ne bouge
    clearTimeout(kmQuietTimer);
    if (me.seated && host && v.quiet > 10000) mid.appendChild(btn('kmx-refresh', 'Plus rien ne bouge ? Renouveler le milieu', () => act({ t: 'km:refresh' })));
    else if (me.seated && host) kmQuietTimer = setTimeout(() => { if (view?.kems) renderKems(view.kems); }, 10200 - v.quiet);
    table.appendChild(mid);
    root.appendChild(table);
    root.appendChild(status);

    if (me.seated) {
      // ta main, en éventail : la carte choisie se soulève ; si tu as pris une carte du milieu, toute ta main s'offre
      const items = me.hand.map(c => ({
        html: `<button type="button" class="km-card${kmSel === c.id ? ' sel' : ''}${kmSelTable ? ' can' : ''}">${kmCardHTML(c)}</button>`,
        cls: (kmSel === c.id ? 'sel' : '') + (me.carre ? ' kmx-carre' : ''), lift: kmSel === c.id || me.carre,
        ok: !!kmSelTable, no: !!kmSel && kmSel !== c.id,
        onclick: () => {
          if (kmSelTable) { const t = kmSelTable; kmSelTable = null; act({ t: 'km:swap', hand: c.id, table: t }); return; }
          kmSel = kmSel === c.id ? null : c.id; renderKems(view.kems);
        },
      }));
      const W = desk ? Math.max(420, Math.min(640, (root.clientWidth || 1100) - 396)) : Math.max(300, (root.clientWidth || 350) + 12);
      const fan = tbFan(items, { w: desk ? 78 : 76, cap: desk ? 84 : 72, width: W });

      // Kems et Contre-Kems : un premier toucher arme le bouton, un second confirme (une erreur coûte un point)
      const armBtn = (key, kind, label, armed, m) => {
        const b = tbBtn(kind, kmArm === key ? armed : label, () => {
          if (kmArm === key) { kmArm = null; clearTimeout(kmArmTimer); act(m); return; }
          kmArm = key; clearTimeout(kmArmTimer); kmArmTimer = setTimeout(() => { kmArm = null; if (view?.kems) renderKems(view.kems); }, 2500);
          renderKems(view.kems);
        });
        b.classList.add('kmx-call', key === 'kems' ? 'km-kems' : 'km-contre');
        if (kmArm === key) b.classList.add('armed');
        return b;
      };
      const kemsBtn = armBtn('kems', 'hero', 'Kems !', `Sûr ? ${M} a un carré`, { t: 'km:kems' });
      if (me.signal && kmArm !== 'kems') kemsBtn.classList.add('pulse');
      const contreBtn = armBtn('contre', 'danger', 'Contre-Kems !', 'Sûr ? Un adversaire a un carré', { t: 'km:contre' });
      const pass = tbBtn('glass', me.pass ? 'Je ne passe plus' : 'Je passe', () => act({ t: 'km:pass' }));
      pass.classList.add('kmx-passbtn'); if (me.pass) pass.classList.add('on');
      pass.setAttribute('aria-pressed', String(!!me.pass));

      const n = v.passCount, all = v.liveCount;
      const passInfo = `<span class="kmx-passes" aria-label="${n} sur ${all} ${n > 1 ? 'passent' : 'passe'}">${Array.from({ length: all }, (_, i) => `<i${i < n ? ' class="f"' : ''}></i>`).join('')}<em>${n ? `${n} sur ${all} ${n > 1 ? 'passent' : 'passe'}` : 'Personne ne passe'}</em></span>`;
      const tray = tbTray({ left: me.carre ? 'Ta main · <b>un carré !</b>' : `Ta main · <b>${me.hand.length} cartes</b>`, right: passInfo, body: fan, acts: desk ? [pass, kemsBtn, contreBtn] : [kemsBtn, contreBtn] });
      tray.classList.add('kmx-tray');
      if (!desk) { const r2 = el('div', 'tb-acts kmx-acts2'); r2.appendChild(pass); tray.appendChild(r2); }
      root.appendChild(tray);
    }
  } else root.appendChild(status);

  if (v.phase === 'result' || v.phase === 'over') {
    const r = v.result;
    if (r) {
      // les quatre mains retournées, assises comme à la table : partenaires en diagonale
      const box = el('div', 'km-reveal kmx-reveal');
      box.appendChild(el('p', 'mj-side-title', v.phase === 'over' ? 'La dernière donne' : 'Les mains'));
      const list = el('div', 'mj-list kmx-reveal-list');
      r.hands.slice().sort((a, b) => a.team - b.team).forEach(h => {
        const [e, n] = kmSplit({ name: h.name, bot: !!v.seats.find(q => q.id === h.id)?.bot });
        const caller = h.id === r.callerId;
        const rw = el('div', `mj-row km-reveal-row kmx-t${h.team}${h.carre ? ' carre' : ''}${h.id === net.me ? ' me' : ''}`,
          `<div class="km-reveal-head"><span class="kmx-rv-e">${e}</span><b>${team(h.team)} ${esc(n)}</b><span>${h.carre ? `carré ${Kems.ofRank(h.cards[0].r)}` : 'pas de carré'}${caller ? ` · ${r.kind === 'kems' ? 'crie Kems' : 'crie Contre-Kems'}` : ''}</span></div>`);
        const mini = el('div', 'km-hand mini');
        h.cards.forEach(c => mini.appendChild(el('div', 'km-card', kmCardHTML(c))));
        rw.appendChild(mini); list.appendChild(rw);
      });
      box.appendChild(list); root.appendChild(box);
    }
    if (host) root.appendChild(v.phase === 'over'
      ? btn('primary lg', 'Retour au salon', () => act({ t: 'restart' }))
      : btn('primary lg', Math.max(s0, s1) >= v.target ? 'Voir le résultat' : 'Donne suivante', () => act({ t: 'km:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));
  }

  // les scores (colonne de droite sur PC ; sur téléphone, la puce des scores pendant la donne)
  const score = el('div', 'km-score' + (v.phase === 'play' ? ' in-play' : ''));
  score.appendChild(el('p', 'mj-side-title', v.phase === 'over' ? 'Score final' : `Scores · premier à ${v.target}`));
  score.insertAdjacentHTML('beforeend', tbRows(v.teams.map((t, k) => {
    const gain = v.phase === 'result' && v.result?.winnerTeam === k ? ` <em class="kmx-gain">+${v.result.points}</em>` : '';
    return { e: kmSym(k), name: t.name, sub: esc(kmNames(t.names)) + (me.seated && me.team === k ? ' · ton équipe' : ''), score: t.score + gain, me: me.seated && me.team === k };
  })));
  root.appendChild(score);

  // la table en liste (colonne de droite sur PC)
  if (v.phase === 'play') {
    const seats = el('div', 'km-seats');
    seats.appendChild(el('p', 'mj-side-title', 'La table'));
    seats.insertAdjacentHTML('beforeend', tbRows([v.seats[0], v.seats[1], v.seats[3], v.seats[2]].filter(Boolean).map(q => {
      const [e, n] = kmSplit(q);
      return { e, name: n, sub: (q.me ? 'toi' : q.mate ? 'partenaire' : 'adversaire') + (q.pass ? ' · passe' : '') + (q.online ? '' : ' · absent'), score: kmSym(q.team), me: q.me };
    })));
    root.appendChild(seats);
  }

  if (v.log.length) {
    const lg = el('div', 'km-log');
    lg.appendChild(el('p', 'mj-side-title', 'Ce qui s’est passé'));
    lg.insertAdjacentHTML('beforeend', tbLog(v.log.slice().reverse()));
    root.appendChild(lg);
  }

  // la feuille ouverte suit la partie ; hors donne elle n'a plus lieu d'être
  if (tbSheet.kind === 'km-scores' || tbSheet.kind === 'km-log') tbSheet.refresh(v.phase === 'play');
}
