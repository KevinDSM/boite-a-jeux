/* Sablier : écrans, canevas de dessin, gribouillages latéraux et réactions.
   Reçoit la vue par joueur calculée par l'hôte (view.sab) et n'envoie que des actions
   via act({ t: 'sab:…' }). Charte 2026 (voir DESIGN.md) : en haut la ligne d'info et la voix
   du meneur (.mj-meta, .mj-status), au centre l'objet du tour (carte, chrono, toile), à droite
   sur PC les équipes et leurs scores (#sab-side). Le canevas vit hors de la zone re-rendue :
   ses traits arrivent en messages séparés, pas dans l'état. */

'use strict';

let sabClockTimer = null, sabOffset = 0, sabLastPhaseKey = null, sabView = null, sabWasMyTurn = false, sabLastPassed = 0;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const diffDots = d => `<span class="dots" title="Difficulté ${d} sur 3">${'●'.repeat(d)}${'○'.repeat(3 - d)}</span>`;
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const SAB_STEP = { teams: 1, selection: 2 };
const SAB_DESK = matchMedia('(min-width: 1100px)');
const sabNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
// une réplique stable : même graine pendant tout un tour (ou toute une phase), jamais tirée au hasard au rendu
const sabSeed = s => Math.abs([...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7));
const sabSay = (list, seed) => list[sabSeed(seed) % list.length];
const sabBtn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
const sabStatus = (title, line, prog) => {
  const s = el('div', 'mj-status', `<h3 class="mj-title">${title}</h3>${line ? `<p class="mj-say">${line}</p>` : ''}`);
  if (prog && prog[1] > 1) s.appendChild(el('div', 'mj-prog', `${Array.from({ length: prog[1] }, (_, i) => `<i${i < prog[0] ? ' class="f"' : ''}></i>`).join('')}<span>${prog[0]} sur ${prog[1]}</span>`));
  return s;
};
const sabTeamOf = (v, id) => v.teams.find(t => t.id === id);

// ossature : le jeu à gauche, les équipes à droite sur PC (même grille que desk.js)
const sabBody = (() => {
  const screen = $('#s-sablier'), body = el('div', 'sab-body'), col = el('div', 'sab-col desk-main'), side = el('aside', 'sab-side desk-side');
  side.id = 'sab-side';
  [...screen.children].forEach(n => col.appendChild(n));
  body.append(col, side); screen.appendChild(body);
  return body;
})();
function sabLayout() { const side = $('#sab-side'); side.hidden = !side.childElementCount; sabBody.classList.toggle('desk-split', SAB_DESK.matches && !side.hidden); }
SAB_DESK.addEventListener('change', sabLayout);

function renderSablier(v) {
  if (!v) return;
  sabView = v;
  sabOffset = v.serverNow - Date.now();          // décalage d'horloge avec l'hôte
  const me = v.you, host = !!me?.isHost;
  const root = $('#sab-main'), after = $('#sab-after'), side = $('#sab-side');
  const key = `${v.phase}|${v.round}|${v.turn?.playerId}|${v.turn?.endsAt}|${v.turn?.startsAt}|${v.selection?.readyCount}|${me?.ready}|${me?.discardCount}|${v.players.length}|${v.teams.map(t => t.players.map(p => p.id + (p.connected ? '' : '-') + (p.ready ? 'r' : '')).join('+') + ':' + t.total).join(',')}|${v.turn?.guessedCount}|${v.turn?.passedCount}|${!!v.buzzer}|${(v.correctable || []).length}|${v.card?.n}|${v.unassigned.length}|${v.settings.teamMode}|${v.lastTurn?.playerName}|${v.cardsLeft}|${me?.teamId}`;
  const rebuild = key !== sabLastPhaseKey; sabLastPhaseKey = key;

  // fil d'étapes : Équipes → Cartes → Partie (caché pendant la partie, la ligne d'info prend le relais)
  $('#sab-steps').dataset.step = SAB_STEP[v.phase] || 3;
  $('#sab-teams').hidden = true;                  // l'ancien bandeau : les équipes vivent dans #sab-side

  // canevas et outils : seulement pendant un tour dessiné
  const drawing = v.phase === 'turn-live' && v.roundDraw;
  $('#sab-draw').hidden = !drawing;
  $('#sab-tools').hidden = !(drawing && me?.isDescriber);
  $('#sab-draw').classList.toggle('readonly', !me?.isDescriber);
  if (drawing) { sabFitCanvas(); sabCanDraw = !!me?.isDescriber; } else sabCanDraw = false;

  // réactions pour le public, gribouillages pour les équipes qui ne jouent pas
  const liveAudience = v.phase === 'turn-live' && !me?.isDescriber;
  $('#sab-react').hidden = !liveAudience;
  const canDoodle = liveAudience && !!me?.teamId && me.teamId !== v.turn?.teamId;
  sabDoodleAllowed(canDoodle);
  if (v.phase !== 'turn-live') sabDoodleClear();

  // signal « c'est à toi » : vibration quand ton tour arrive
  const myTurn = v.phase === 'turn-idle' && v.turn?.playerId === me?.id;
  if (myTurn && !sabWasMyTurn && navigator.vibrate) navigator.vibrate([150, 80, 150]);
  sabWasMyTurn = myTurn;

  if (rebuild) {
    root.innerHTML = ''; after.innerHTML = ''; side.innerHTML = '';
    ({ teams: sabTeams, selection: sabSelection, 'turn-idle': sabIdle, 'turn-live': sabLive, 'round-end': sabRoundEnd, 'game-end': sabGameEnd }[v.phase] || sabTeams)(v, root, after, me, host, side);
  }
  sabLayout();
  sabClock(v);
}

// ------------------------------------------------------------ équipes
function sabTeams(v, root, after, me, host) {
  const s = v.settings, manual = s.teamMode === 'manual', mine = sabTeamOf(v, me?.teamId), n = v.players.length;
  root.appendChild(el('p', 'mj-meta', `Préparation · ${plural(v.teams.length, 'équipe')} · ${plural(n, 'joueur')}`));
  let title, line;
  if (host) {
    title = 'Formez les équipes.';
    line = manual ? sabSay(['Chacun choisit son camp. Les amitiés vont souffrir.', 'Chacun rejoint qui il veut. Tu verras qui te suit.'], n)
      : sabSay(['Le hasard a tranché. Tu peux encore le contrarier.', 'Équipes tirées au sort. Pas contentes ? Relance.'], n);
  } else if (manual) {
    title = mine ? `Tu joues dans l’équipe ${esc(mine.name)}.` : 'Choisis ton équipe.';
    line = mine ? 'Tu peux encore changer d’avis tant que l’hôte n’a rien distribué.' : 'Choisis bien, tu passes la soirée avec eux.';
  } else {
    title = mine ? `Tu joues dans l’équipe ${esc(mine.name)}.` : 'L’hôte tire les équipes.';
    line = 'L’hôte peut encore tout mélanger avant de distribuer.';
  }
  root.appendChild(sabStatus(title, line));

  if (host) {
    const seg = el('div', 'sab-seg', `<button type="button" data-mode="random" aria-pressed="${!manual}">Tirage au sort</button><button type="button" data-mode="manual" aria-pressed="${manual}">Au choix</button>`);
    seg.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.mode !== s.teamMode) act({ t: 'sab:settings', patch: { teamMode: b.dataset.mode } }); });
    root.appendChild(seg);
  }

  const canPick = manual || host;
  const list = el('div', 'mj-list sab-teamlist');
  v.teams.forEach(t => {
    const isMine = t.id === me?.teamId;
    const players = t.players.length ? t.players.map(p => `<span class="sab-p${p.id === me?.id ? ' me' : ''}${p.connected ? '' : ' off'}">${esc(p.name)}${p.isHost ? ' <small>hôte</small>' : ''}</span>`).join('') : '<span class="sab-p none">Personne</span>';
    const row = el(canPick ? 'button' : 'div', 'mj-row sab-team' + (isMine ? ' mine' : ''),
      `<span class="sab-team-main"><span class="sab-team-name"><i class="sab-dot"></i>${esc(t.name)}${isMine ? ' <em>ton équipe</em>' : ''}</span><span class="sab-team-players">${players}</span></span><span class="sab-team-count">${plural(t.players.length, 'joueur')}</span>`);
    row.style.setProperty('--tc', t.color);
    if (canPick) { row.type = 'button'; row.onclick = () => act({ t: 'sab:team', teamId: t.id }); if (isMine) row.setAttribute('aria-pressed', 'true'); }
    list.appendChild(row);
  });
  if (v.unassigned.length) list.appendChild(el('div', 'mj-row sab-team sab-orphans', `<span class="sab-team-main"><span class="sab-team-name">Sans équipe</span><span class="sab-team-players">${v.unassigned.map(p => `<span class="sab-p${p.id === me?.id ? ' me' : ''}">${esc(p.name)}</span>`).join('')}</span></span><span class="sab-team-count">${v.unassigned.length}</span>`));
  root.appendChild(list);

  if (host) {
    const tools = el('div', 'sab-tools-row');
    if (!manual) tools.appendChild(sabBtn('small', 'Retirer au sort', () => act({ t: 'sab:randomize' })));
    const add = sabBtn('small', 'Ajouter une équipe', () => act({ t: 'sab:team-add' })); add.disabled = v.teams.length >= 4;
    const rm = sabBtn('small', 'Enlever une équipe', () => act({ t: 'sab:team-rm' })); rm.disabled = v.teams.length <= 2;
    tools.append(add, rm); root.appendChild(tools);
  }

  const actions = el('div', 'sticky-actions');
  if (host) {
    if (v.problems?.length) actions.appendChild(el('p', 'error', v.problems.map(esc).join('<br>')));
    const go = sabBtn('primary lg', 'Distribuer les cartes', () => act({ t: 'sab:deal' })); go.disabled = !!v.problems?.length; actions.appendChild(go);
    actions.appendChild(el('p', 'note', `${plural(s.dealPerPlayer, 'carte')} chacun, ${s.discardPerPlayer} à écarter. ${v.poolSize} en réserve, dont ${v.freshCount} jamais vues.`));
  }
  root.appendChild(actions);
}

// ------------------------------------------------------------ défausse
function sabSelection(v, root, after, me, host, side) {
  const sel = v.selection, hand = v.hand || [], mine = me?.discardCount || 0, left = sel.toDiscard - mine;
  root.appendChild(el('p', 'mj-meta', `Préparation · ${plural(sel.dealt, 'carte')} en main · ${sel.toDiscard} à écarter`));
  let title, line;
  if (me?.ready) {
    title = 'Main validée.';
    line = sel.waitingFor.length ? `Plus que ${esc(sabNames(sel.waitingFor))}.` : 'Tout le monde est prêt.';
  } else {
    title = sel.toDiscard ? `Écarte ${plural(sel.toDiscard, 'carte')}.` : 'Garde tout.';
    line = sabSay(['Garde celles que tu sauras faire deviner. Tout ce que vous gardez forme le paquet.', 'Vire celles qui te font peur. Le reste part dans le paquet commun.'], sel.dealt + sel.toDiscard);
  }
  root.appendChild(sabStatus(title, line, [sel.readyCount, sel.totalCount]));

  const grid = el('div', 'hand' + (me?.ready ? ' locked' : ''));
  hand.forEach(c => {
    const card = el('button', 'hand-card' + (c.discarded ? ' discarded' : ''), `<span class="hc-cat">${esc(c.c)}</span><span class="hc-name">${esc(c.n)}</span>${diffDots(c.d)}`);
    card.type = 'button'; card.disabled = !!me?.ready;
    if (c.discarded) card.setAttribute('aria-pressed', 'true');
    card.onclick = () => act({ t: 'sab:toggle', cardId: c.id });
    grid.appendChild(card);
  });
  root.appendChild(grid);

  const actions = el('div', 'sticky-actions');
  if (me?.ready) actions.appendChild(sabBtn('', 'Modifier ma main', () => act({ t: 'sab:unvalidate' })));
  else { const b = sabBtn('primary lg', left > 0 ? `Encore ${plural(left, 'carte')} à écarter` : 'Valider ma main', () => act({ t: 'sab:validate' })); b.disabled = left !== 0; actions.appendChild(b); }
  if (host && sel.readyCount < sel.totalCount) actions.appendChild(sabBtn('ghost small', 'Quelqu’un traîne ? Lancer sans attendre', () => act({ t: 'sab:force' })));
  after.appendChild(actions);

  // qui a fini de trier (colonne de droite sur PC)
  side.appendChild(el('span', 'mj-side-title', 'Le tri'));
  const list = el('div', 'mj-list sab-roster');
  v.teams.forEach(t => t.players.forEach(p => list.appendChild(el('div', `mj-row${p.connected ? '' : ' off'}${p.id === me?.id ? ' me' : ''}`, `<span class="sab-rname"><i class="sab-dot" style="--tc:${t.color}"></i>${esc(p.name)}</span><i class="sab-tag${p.ready ? ' ok' : ''}">${p.ready ? 'prêt' : p.connected ? 'trie' : 'absent'}</i>`))));
  v.unassigned.forEach(p => list.appendChild(el('div', 'mj-row', `<span class="sab-rname">${esc(p.name)}</span><i class="sab-tag${p.ready ? ' ok' : ''}">${p.ready ? 'prêt' : 'trie'}</i>`)));
  side.appendChild(list);
}

// ------------------------------------------------------------ entre deux tours
const SAB_READY = {
  free: ['Fais-leur deviner un max de cartes. Sans les mots de la carte.', 'Respire. {s} secondes, c’est long quand on bafouille.', 'Parle vite, passe sans remords.'],
  word: ['Un seul mot par carte. Choisis-le bien.', 'Un mot, pas un de plus. Ni geste, ni bruitage.', 'Ils connaissent les cartes. Un mot suffit.'],
  mime: ['Pas un mot, pas un son. Ton corps fait tout.', 'Échauffe-toi, ça va gesticuler.', 'Tu vas le regretter. Eux vont adorer.'],
  draw: ['Prends le crayon. Personne ne te juge. Enfin, un peu.', 'Pas de lettres, pas de chiffres. Juste ton talent.', 'Un bonhomme bâton peut sauver la manche.'],
};
const sabKind = v => v.roundDraw ? 'draw' : v.roundMime ? 'mime' : (v.settings.roundTypes || [])[v.round - 1] === 'word' ? 'word' : 'free';

function sabIdle(v, root, after, me, host, side) {
  const t = v.turn, isMe = t && t.playerId === me?.id, seed = `${v.round}|${t?.playerId}|${v.cardsLeft}`;
  root.appendChild(el('p', 'mj-meta', `Manche ${v.round} sur ${v.roundCount} · ${esc(v.roundTitle)} · ${plural(v.cardsLeft, 'carte')} dans le paquet`));

  if (host && v.buzzer) {
    const b = el('div', 'sab-ask', `<h3>Trouvée sur le gong ?</h3><p>${esc(v.buzzer.playerName)} avait encore une carte en main quand le temps a sonné. Si l’équipe l’a trouvée pile à temps, compte-la.</p>`);
    const row = el('div', 'row split');
    row.append(sabBtn('', 'Non, pas trouvée', () => act({ t: 'sab:buzzer', accept: false })), sabBtn('primary', 'Oui, on la compte', () => act({ t: 'sab:buzzer', accept: true })));
    b.appendChild(row); root.appendChild(b);
  }

  if (t) {
    let title, line;
    if (isMe) { title = 'À toi.'; line = `Équipe ${esc(t.teamName)}. ` + sabSay(SAB_READY[sabKind(v)], seed).replace('{s}', v.turnTotal); }
    else {
      title = `Au tour de ${esc(t.playerName)}.`;
      const same = me?.teamId && me.teamId === t.teamId;
      line = `Équipe ${esc(t.teamName)}. ` + (same ? sabSay(['C’est ton équipe, ouvre grand les oreilles.', 'Ton équipe joue. Prépare ta voix.'], seed)
        : me?.teamId ? sabSay(['Pas ton équipe. Tu as le droit de ricaner.', 'Pas ton équipe. Profite du spectacle.'], seed) : 'Tu regardes ce tour.');
    }
    root.appendChild(sabStatus(title, line));
    root.appendChild(el('p', 'sab-rule', `<b>${esc(v.roundTitle)}.</b> ${esc(v.roundRule)}`));
    if (isMe) root.appendChild(sabBtn('primary lg', `Lancer mon tour <span class="cost">${v.turnTotal} s</span>`, () => act({ t: 'sab:start' })));
    else if (host) root.appendChild(sabBtn('ghost small', `Sauter le tour de ${esc(t.playerName)}`, () => act({ t: 'sab:abort' })));
  }

  sabSide(v, side);
  if (v.lastTurn) side.appendChild(sabRecap(v.lastTurn));
  if (host) sabAmend(v, side);
}

// ------------------------------------------------------------ le tour
function sabLive(v, root, after, me, host, side) {
  const t = v.turn, isMe = !!me?.isDescriber, mini = v.roundDraw ? ' mini' : '', seed = `${v.round}|${t.playerId}`;
  root.appendChild(el('p', 'mj-meta', `Manche ${v.round} sur ${v.roundCount} · ${esc(v.roundTitle)} · équipe ${esc(t.teamName)}`));
  root.appendChild(el('div', 'timer-wrap', `<div class="timer" id="sab-clock">–</div><div class="timer-bar"><div class="timer-bar-fill" id="sab-clock-bar"></div></div>`));
  const tally = cls => el('p', 'sab-tally' + (cls || ''), `<span class="ok"><b>${t.guessedCount}</b> trouvée${t.guessedCount > 1 ? 's' : ''}</span><span class="pass${t.passedCount > sabLastPassed ? ' bump' : ''}"><b>${t.passedCount}</b> passée${t.passedCount > 1 ? 's' : ''}</span><span><b>${v.cardsLeft}</b> dans le paquet</span>`);

  if (isMe) {
    if (!v.card) root.appendChild(el('div', 'game-card' + mini, `<span class="game-card-cat">Prépare-toi</span><span class="game-card-name">La carte arrive avec le chrono</span>`));
    else {
      root.appendChild(el('div', 'game-card flash' + mini, `<span class="game-card-cat">${esc(v.card.c)}</span><span class="game-card-name">${esc(v.card.n)}</span><span class="game-card-diff">${diffDots(v.card.d)}</span>`));
      const acts = el('div', 'play-actions');
      acts.append(sabBtn('pass', 'Passer', () => act({ t: 'sab:passed' })), sabBtn('guess', 'Trouvé !', () => act({ t: 'sab:guessed' })));
      after.appendChild(acts);
    }
    after.appendChild(tally());
  } else {
    const verb = v.roundDraw ? 'dessine' : v.roundMime ? 'mime' : 'fait deviner';
    const same = me?.teamId && me.teamId === t.teamId;
    const line = same ? sabSay(v.roundDraw ? ['Ton équipe joue. Devine avant la fin du dessin.', 'Crie tout ce que tu vois, même les bêtises.'] : v.roundMime ? ['Ton équipe joue. Crie tout ce que tu vois.', 'Regarde bien, et réponds fort.'] : ['C’est ton équipe. Réponds à voix haute, et vite.', 'Ton équipe joue. Tout ce qui te passe par la tête, dis-le.'], seed)
      : me?.teamId ? sabSay(['Pas ton équipe. Le crayon est à toi, sur les côtés.', 'Pas ton équipe. Tu as le droit de te moquer.', 'Pas ton équipe. Ne souffle rien.'], seed) : 'Tu regardes ce tour.';
    root.appendChild(sabStatus(`${esc(t.playerName)} ${verb}.`, line));
    if (!v.roundDraw) root.appendChild(el('p', 'sab-rule', `<b>${esc(v.roundTitle)}.</b> ${esc(v.roundRule)}`));
    after.appendChild(tally(' audience'));
    if (t.guessedNames.length) after.appendChild(el('p', 'sab-found', `<span class="mj-side-title">Déjà trouvées</span>${t.guessedNames.map(n => `<span>${esc(n)}</span>`).join('')}`));
  }
  sabLastPassed = t.passedCount;
  sabSide(v, side);
}

// ------------------------------------------------------------ fin de manche / partie
function sabRoundEnd(v, root, after, me, host) {
  const sorted = [...v.teams].sort((a, b) => (b.scores[v.round - 1] || 0) - (a.scores[v.round - 1] || 0));
  const best = sorted[0], bs = best?.scores[v.round - 1] || 0, tie = sorted[1] && (sorted[1].scores[v.round - 1] || 0) === bs;
  root.appendChild(el('p', 'mj-meta', `Manche ${v.round} sur ${v.roundCount} · ${esc(v.roundTitle)} · terminée`));
  root.appendChild(sabStatus('Paquet vide.', (tie ? 'Égalité sur cette manche. ' : `L’équipe ${esc(best.name)} en a trouvé le plus, ${plural(bs, 'carte')}. `) + 'Les mêmes cartes reviennent, mélangées.'));
  if (v.nextRoundInfo) root.appendChild(el('p', 'sab-rule', `<b>Ensuite, ${esc(v.nextRoundInfo.title.toLowerCase())}.</b> ${esc(v.nextRoundInfo.rule)}`));
  if (host) root.appendChild(sabBtn('primary lg', 'Manche suivante', () => act({ t: 'sab:next' })));
  else root.appendChild(el('p', 'note', 'L’hôte lance la manche suivante.'));
  root.appendChild(el('span', 'mj-side-title', 'Scores'));
  root.appendChild(sabScores(v, true));
  sabGallery(v, root);
  if (host) sabAmend(v, root);
}
function sabGameEnd(v, root, after, me, host) {
  const sorted = [...v.teams].sort((a, b) => b.total - a.total);
  const w = sorted[0], tie = sorted[1] && sorted[1].total === w.total;
  const mine = me?.teamId === w.id;
  root.appendChild(el('p', 'mj-meta', `Partie terminée · ${plural(v.roundCount, 'manche')}`));
  root.appendChild(sabStatus(tie ? 'Égalité.' : `L’équipe ${esc(w.name)} gagne.`,
    tie ? `${plural(w.total, 'carte')} chacune. Il va falloir une revanche.` : `${plural(w.total, 'carte')} trouvée${w.total > 1 ? 's' : ''} en ${plural(v.roundCount, 'manche')}. ${mine ? 'Bravo, c’est ton équipe.' : 'Les autres, on se console comme on peut.'}`));
  root.appendChild(sabScores(v, true));
  sabGallery(v, root);
  if (host) root.appendChild(sabBtn('primary lg', 'Rejouer avec les mêmes équipes', () => act({ t: 'sab:reset' })));
  else root.appendChild(el('p', 'note', 'L’hôte décide de la revanche.'));
  if (host) sabAmend(v, root);
}

// ------------------------------------------------------------ morceaux partagés
/** La liste des équipes : nom, joueurs (celui qui parle en évidence), total, détail par manche. */
function sabScores(v, detail = false) {
  const box = el('div', 'mj-list sab-scores');
  const sorted = [...v.teams].sort((a, b) => b.total - a.total);
  const playing = v.phase === 'turn-idle' || v.phase === 'turn-live';
  sorted.forEach(t => {
    const active = playing && v.turn && v.turn.teamId === t.id;
    const per = t.scores.slice(0, v.round).map(s => s ?? 0);
    const players = t.players.map(p => `<span class="sab-p${p.id === v.you?.id ? ' me' : ''}${p.connected ? '' : ' off'}${playing && v.turn?.playerId === p.id ? ' speaks' : ''}">${esc(p.name)}</span>`).join('') || '<span class="sab-p none">Personne</span>';
    const row = el('div', 'mj-row sab-team' + (active ? ' active' : ''),
      `<span class="sab-team-main"><span class="sab-team-name"><i class="sab-dot"></i>${esc(t.name)}${active ? ' <em>joue</em>' : ''}</span><span class="sab-team-players">${players}</span>${(detail || v.round > 1) && per.length > 1 ? `<span class="sab-team-detail">${per.join(' · ')} par manche</span>` : ''}</span><b class="sab-team-total">${t.total}</b>`);
    row.style.setProperty('--tc', t.color);
    box.appendChild(row);
  });
  return box;
}
function sabSide(v, side) {
  side.appendChild(el('span', 'mj-side-title', 'Scores'));
  side.appendChild(sabScores(v));
}
function sabRecap(lt) {
  const n = lt.guessedNames.length, box = el('div', 'sab-recap');
  box.appendChild(el('span', 'mj-side-title', `Le tour de ${esc(lt.playerName)} · ${n ? plural(n, 'carte') : 'rien trouvé'}`));
  const list = el('div', 'mj-list');
  lt.guessedNames.forEach(x => list.appendChild(el('div', 'mj-row', `<span>${esc(x)}</span><i class="sab-tag ok">trouvée</i>`)));
  if (lt.passedCount) list.appendChild(el('div', 'mj-row', `<span>${plural(lt.passedCount, 'carte')} passée${lt.passedCount > 1 ? 's' : ''}</span><i class="sab-tag">au paquet</i>`));
  if (!n && !lt.passedCount) list.appendChild(el('div', 'mj-row', '<span class="sab-none">Pas une seule carte. Ça arrive aux meilleurs.</span>'));
  box.appendChild(list);
  return box;
}
function sabAmend(v, root) {
  if (!v.correctable?.length) return;
  const det = el('details', 'amend', `<summary>Une carte comptée par erreur ?</summary>`);
  const list = el('div', 'amend-list', v.correctable.map(c => `<label><input type="checkbox" value="${c.id}"><span>${esc(c.n)}</span><small>${esc(c.teamName)} · ${esc(c.playerName)}</small></label>`).join(''));
  det.appendChild(list);
  det.appendChild(sabBtn('small', 'Retirer les cartes cochées', () => { const ids = [...list.querySelectorAll('input:checked')].map(i => i.value); if (ids.length) act({ t: 'sab:amend', ids }); }));
  root.appendChild(det);
}
function sabGallery(v, root) {
  const items = v.gallery || []; if (!items.length) return;
  const found = items.filter(i => !i.missed), missed = items.filter(i => i.missed);
  const wrap = el('div', 'gallery-wrap');
  const grid = (list, cls) => { const g = el('div', 'gallery ' + cls); list.forEach(it => { const fig = el('figure', '', ''); const c = document.createElement('canvas'); c.width = 400; c.height = 300; sabDrawStrokesTo(c, it.strokes); fig.appendChild(c); fig.appendChild(el('figcaption', '', `${esc(it.n)}<small>${esc(it.playerName)}</small>`)); g.appendChild(fig); }); return g; };
  if (found.length) { wrap.appendChild(el('span', 'mj-side-title', 'Les dessins')); wrap.appendChild(grid(found, 'found')); }
  if (missed.length) { wrap.appendChild(el('span', 'mj-side-title', 'Pas trouvés à temps')); wrap.appendChild(grid(missed, 'missed')); }
  root.appendChild(wrap);
}

// chrono local, calé sur l'horloge de l'hôte : chiffre + barre qui se vide
function sabClock(v) {
  clearInterval(sabClockTimer); sabClockTimer = null;
  const t = v.turn; if (v.phase !== 'turn-live' || !t?.endsAt) return;
  const total = Math.max(1, (v.turnTotal || 30) * 1000);
  const tick = () => {
    const num = $('#sab-clock'), bar = $('#sab-clock-bar'); if (!num) return;
    const now = Date.now() + sabOffset;
    if (t.startsAt && now < t.startsAt) { num.textContent = Math.ceil((t.startsAt - now) / 1000); num.className = 'timer pre'; if (bar) { bar.style.width = '100%'; bar.className = 'timer-bar-fill pre'; } return; }
    const leftMs = Math.max(0, t.endsAt - now), left = Math.ceil(leftMs / 1000);
    const cls = left <= 5 ? 'crit' : left <= 10 ? 'warn' : '';
    num.textContent = left; num.className = 'timer ' + cls;
    if (bar) { bar.style.width = `${Math.min(100, (leftMs / total) * 100)}%`; bar.className = 'timer-bar-fill ' + cls; }
  };
  tick(); sabClockTimer = setInterval(tick, 200);
}

// ------------------------------------------------------------ gribouillages latéraux
// Pendant un tour, les équipes qui ne jouent pas griffonnent dans les bandes de chaque
// côté de l'écran (25 % à gauche, 25 % à droite). Éphémère, relayé par l'hôte, couleur
// de l'équipe. Le centre reste à ceux qui jouent.
const sabDcv = $('#sab-doodle'), sabDg = sabDcv.getContext('2d');
const sabDoodles = new Map(); // id -> { p, c, e }
let sabDoodleMode = false, sabDoodleErase = false, sabDoodleOk = false, sabDoodleCur = null, sabDoodleCurErase = false, sabDoodlePending = [], sabDoodleFlush = null, sabDoodleSeq = 0, sabDoodleLoop = null;

function sabFitDoodle() { const dpr = Math.min(2, devicePixelRatio || 1); const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr); if (w !== sabDcv.width || h !== sabDcv.height) { sabDcv.width = w; sabDcv.height = h; } }
window.addEventListener('resize', () => { sabFitDoodle(); sabDrawDoodles(); });
const sabInBand = x => x <= 0.25 || x >= 0.75;
function sabDoodleAdd(id, pts, c, erase) {
  let d = sabDoodles.get(id);
  if (!d) { d = { p: [], c, e: !!erase }; sabDoodles.set(id, d); if (sabDoodles.size > 400) sabDoodles.delete(sabDoodles.keys().next().value); }
  d.p.push(...pts);
  if (!sabDoodleLoop) sabDoodleLoop = requestAnimationFrame(sabDrawDoodles);
}
function sabDrawDoodles() {
  sabDoodleLoop = null; sabFitDoodle();
  const W = sabDcv.width, H = sabDcv.height;
  sabDg.clearRect(0, 0, W, H); sabDg.lineCap = 'round'; sabDg.lineJoin = 'round';
  sabDoodles.forEach(d => {
    if (d.p.length < 2) return;
    sabDg.globalCompositeOperation = d.e ? 'destination-out' : 'source-over';
    sabDg.lineWidth = Math.max(2, W * (d.e ? 0.02 : 0.006)); sabDg.strokeStyle = d.c;
    sabDg.beginPath(); sabDg.moveTo(d.p[0] * W, d.p[1] * H);
    if (d.p.length === 2) sabDg.lineTo(d.p[0] * W + 0.01, d.p[1] * H);
    for (let i = 2; i + 1 < d.p.length; i += 2) sabDg.lineTo(d.p[i] * W, d.p[i + 1] * H);
    sabDg.stroke();
  });
  sabDg.globalCompositeOperation = 'source-over';
}
function sabDoodleClear() { if (!sabDoodles.size) return; sabDoodles.clear(); sabDg.clearRect(0, 0, sabDcv.width, sabDcv.height); }
function sabMyTeamColor() { const t = sabView?.teams.find(x => x.id === sabView.you?.teamId); return t ? t.color : '#888888'; }
function sabDoodleAllowed(ok) {
  sabDoodleOk = ok;
  const b = $('#sab-doodle-btn'), g = $('#sab-doodle-erase');
  if (b) b.hidden = !ok; if (g) g.hidden = !ok;
  if (!ok && sabDoodleMode) sabSetDoodleMode(false);
}
function sabSetDoodleMode(on, erase = false) {
  sabDoodleMode = !!on; sabDoodleErase = sabDoodleMode && !!erase;
  document.body.classList.toggle('doodling', sabDoodleMode);
  $('#sab-doodle-btn')?.classList.toggle('on', sabDoodleMode && !sabDoodleErase);
  $('#sab-doodle-erase')?.classList.toggle('on', sabDoodleErase);
  if (!sabDoodleMode) sabDoodleEnd();
}
const sabDoodlePos = e => [Math.round((e.clientX / innerWidth) * 1000) / 1000, Math.round((e.clientY / innerHeight) * 1000) / 1000];
function sabDoodleSend() { sabDoodleFlush = null; if (!sabDoodleCur || !sabDoodlePending.length) return; act({ t: 'sab:doodle', id: sabDoodleCur, p: sabDoodlePending, e: sabDoodleCurErase }); sabDoodlePending = []; }
function sabDoodleEnd() { if (sabDoodleFlush) { clearTimeout(sabDoodleFlush); sabDoodleFlush = null; } sabDoodleSend(); sabDoodleCur = null; }
sabDcv.addEventListener('pointerdown', e => {
  if (!sabDoodleMode) return;
  const [x, y] = sabDoodlePos(e); if (!sabInBand(x)) return;
  e.preventDefault();
  sabDoodleCur = `${++sabDoodleSeq}-${Math.random().toString(36).slice(2, 7)}`; sabDoodleCurErase = sabDoodleErase;
  sabDoodleAdd(sabDoodleCur, [x, y], sabMyTeamColor(), sabDoodleCurErase); sabDoodlePending.push(x, y);
  if (!sabDoodleFlush) sabDoodleFlush = setTimeout(sabDoodleSend, 40);
});
sabDcv.addEventListener('pointermove', e => {
  if (!sabDoodleCur) return;
  const [x, y] = sabDoodlePos(e); if (!sabInBand(x)) { sabDoodleEnd(); return; }
  sabDoodleAdd(sabDoodleCur, [x, y], sabMyTeamColor(), sabDoodleCurErase); sabDoodlePending.push(x, y);
  if (!sabDoodleFlush) sabDoodleFlush = setTimeout(sabDoodleSend, 40);
});
['pointerup', 'pointercancel'].forEach(ev => window.addEventListener(ev, () => { if (sabDoodleCur) sabDoodleEnd(); }));

// ------------------------------------------------------------ canevas (repris de l'original)
const sabCv = $('#sab-canvas'), sabG2 = sabCv.getContext('2d');
const SAB_W = 1000, SAB_H = 750;
const sabOff = document.createElement('canvas'); sabOff.width = SAB_W; sabOff.height = SAB_H;
const sabOg = sabOff.getContext('2d', { willReadFrequently: true });
let sabStrokes = [], sabCur = null, sabPending = [], sabFlush = null, sabColor = '#1f2430', sabWidth = 0.012, sabErase = false, sabFill = false, sabSeq = 0, sabCanDraw = false;

function sabBlit() { if (!sabCv.width) return; sabG2.setTransform(1, 0, 0, 1, 0, 0); sabG2.clearRect(0, 0, sabCv.width, sabCv.height); sabG2.drawImage(sabOff, 0, 0, sabCv.width, sabCv.height); }
function sabFitCanvas() { const r = sabCv.getBoundingClientRect(); if (!r.width) return; const dpr = Math.min(2, devicePixelRatio || 1); const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr); if (w !== sabCv.width || h !== sabCv.height) { sabCv.width = w; sabCv.height = h; sabBlit(); } }
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function sabFloodFill(ctx, x, y, hex) {
  const W = ctx.canvas.width, H = ctx.canvas.height; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const img = ctx.getImageData(0, 0, W, H), d = img.data, i0 = (y * W + x) * 4;
  const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2], ta = d[i0 + 3], [fr, fg, fb] = hexToRgb(hex), TOL2 = 64 * 64;
  if ((tr - fr) ** 2 + (tg - fg) ** 2 + (tb - fb) ** 2 + (ta - 255) ** 2 <= TOL2) return;
  const match = i => (d[i] - tr) ** 2 + (d[i + 1] - tg) ** 2 + (d[i + 2] - tb) ** 2 + (d[i + 3] - ta) ** 2 <= TOL2;
  const stack = [x, y];
  while (stack.length) {
    const py = stack.pop(); let px = stack.pop();
    while (px >= 0 && match((py * W + px) * 4)) px -= 1; px += 1;
    let up = false, down = false;
    while (px < W && match((py * W + px) * 4)) {
      const i = (py * W + px) * 4; d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
      if (py > 0) { const m = match(((py - 1) * W + px) * 4); if (m && !up) { stack.push(px, py - 1); up = true; } else if (!m) up = false; }
      if (py < H - 1) { const m = match(((py + 1) * W + px) * 4); if (m && !down) { stack.push(px, py + 1); down = true; } else if (!m) down = false; }
      px += 1;
    }
  }
  ctx.putImageData(img, 0, 0);
}
function sabRenderStroke(ctx, W, H, s, from) {
  if (s.t === 'fill') { sabFloodFill(ctx, Math.round(s.p[0] * W), Math.round(s.p[1] * H), s.c); return; }
  if (s.p.length < 2) return;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, s.w * W); ctx.strokeStyle = s.c;
  ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
  ctx.beginPath(); ctx.moveTo(s.p[from] * W, s.p[from + 1] * H);
  if (s.p.length === 2 && from === 0) ctx.lineTo(s.p[0] * W + 0.01, s.p[1] * H);
  else for (let i = from + 2; i + 1 < s.p.length; i += 2) ctx.lineTo(s.p[i] * W, s.p[i + 1] * H);
  ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
}
function sabPaint(s, from) { sabRenderStroke(sabOg, SAB_W, SAB_H, s, from); sabBlit(); }
function sabRedrawAll() { sabOg.setTransform(1, 0, 0, 1, 0, 0); sabOg.clearRect(0, 0, SAB_W, SAB_H); sabStrokes.forEach(s => sabRenderStroke(sabOg, SAB_W, SAB_H, s, 0)); sabBlit(); }
function sabApplySeg(seg) {
  let s = sabStrokes.find(x => x.id === seg.id);
  if (!s) { s = { id: seg.id, c: seg.c, w: seg.w, e: !!seg.e, t: seg.t, p: [] }; sabStrokes.push(s); }
  else if (seg.t === 'fill') return;
  const from = Math.max(0, s.p.length - 2); s.p.push(...seg.p); sabPaint(s, from);
}
function sabDrawStrokesTo(canvas, arr) { const ctx = canvas.getContext('2d', { willReadFrequently: true }); (arr || []).forEach(st => sabRenderStroke(ctx, canvas.width, canvas.height, st, 0)); }
const sabRel = e => { const r = sabCv.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000]; };
function sabAddPoint(x, y) { const from = Math.max(0, sabCur.p.length - 2); sabCur.p.push(x, y); sabPending.push(x, y); sabPaint(sabCur, from); if (!sabFlush) sabFlush = setTimeout(sabFlushSeg, 50); }
function sabFlushSeg() { sabFlush = null; if (!sabCur || !sabPending.length) return; act({ t: 'sab:seg', seg: { id: sabCur.id, c: sabCur.c, w: sabCur.w, e: sabCur.e, p: sabPending } }); sabPending = []; }
sabCv.addEventListener('pointerdown', e => {
  if (!sabCanDraw) return; e.preventDefault();
  if (sabFill) { const pos = sabRel(e); const seg = { id: `${++sabSeq}-${Math.random().toString(36).slice(2, 7)}`, c: sabColor, w: sabWidth, e: false, t: 'fill', p: pos }; sabStrokes.push({ ...seg, p: pos.slice() }); sabPaint(sabStrokes[sabStrokes.length - 1], 0); act({ t: 'sab:seg', seg }); return; }
  try { sabCv.setPointerCapture(e.pointerId); } catch { }
  sabCur = { id: `${++sabSeq}-${Math.random().toString(36).slice(2, 7)}`, c: sabColor, w: sabWidth, e: sabErase, p: [] };
  sabStrokes.push(sabCur); sabAddPoint(...sabRel(e));
});
sabCv.addEventListener('pointermove', e => { if (!sabCur) return; e.preventDefault(); sabAddPoint(...sabRel(e)); });
['pointerup', 'pointercancel'].forEach(ev => window.addEventListener(ev, () => { if (!sabCur) return; if (sabFlush) { clearTimeout(sabFlush); sabFlush = null; } sabFlushSeg(); sabCur = null; }));
if (window.ResizeObserver) new ResizeObserver(() => { if (!$('#sab-draw').hidden) sabFitCanvas(); }).observe(sabCv);

// palette et outils
(function buildTools() {
  const t = $('#sab-tools');
  t.innerHTML = `<div class="swatches">${Sablier.DRAW_COLORS.map(c => `<button type="button" class="sw${c === '#1f2430' ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}<input type="color" id="sab-picker" value="#1f2430" aria-label="Autre couleur"></div>
    <div class="row tools"><button type="button" class="btn small" data-w="0.005">Fin</button><button type="button" class="btn small on" data-w="0.012">Moyen</button><button type="button" class="btn small" data-w="0.028">Gros</button>
    <button type="button" class="btn small" id="sab-fill">Seau</button><button type="button" class="btn small" id="sab-eraser">Gomme</button><button type="button" class="btn small" id="sab-undo">Annuler</button><button type="button" class="btn small" id="sab-clear">Tout effacer</button></div>`;
  t.querySelectorAll('.sw').forEach(b => b.onclick = () => { sabColor = b.dataset.c; sabErase = false; t.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); $('#sab-eraser').classList.remove('on'); });
  $('#sab-picker').oninput = e => { sabColor = e.target.value; sabErase = false; t.querySelectorAll('.sw').forEach(x => x.classList.remove('on')); };
  t.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { sabWidth = +b.dataset.w; t.querySelectorAll('[data-w]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#sab-fill').onclick = () => { sabFill = !sabFill; sabErase = false; $('#sab-fill').classList.toggle('on', sabFill); $('#sab-eraser').classList.remove('on'); };
  $('#sab-eraser').onclick = () => { sabErase = !sabErase; sabFill = false; $('#sab-eraser').classList.toggle('on', sabErase); $('#sab-fill').classList.remove('on'); };
  $('#sab-undo').onclick = () => act({ t: 'sab:undo' });
  $('#sab-clear').onclick = () => act({ t: 'sab:clear' });
})();

// messages hors état : traits, canevas complet, réactions
function sabOnMessage(m) {
  if (m.t === 'sab-seg') sabApplySeg(m.seg);
  else if (m.t === 'sab-full') { sabStrokes = (m.strokes || []).map(s => ({ ...s, p: s.p.slice() })); sabRedrawAll(); }
  else if (m.t === 'sab-react') sabSpawnReaction(m.e, m.who);
  else if (m.t === 'sab-doodle' && m.id && Array.isArray(m.p)) sabDoodleAdd(m.id, m.p, m.c || '#888888', m.e);
}
(function buildReactions() {
  const bar = $('#sab-react'); let last = 0;
  bar.innerHTML = Sablier.REACTIONS.map(e => `<button type="button" class="react-btn" data-e="${e}" aria-label="Réagir ${e}">${e}</button>`).join('')
    + '<button type="button" class="react-btn pencil" id="sab-doodle-btn" title="Gribouiller sur les côtés" aria-label="Gribouiller sur les côtés" hidden>✏️</button>'
    + '<button type="button" class="react-btn pencil" id="sab-doodle-erase" title="Gommer les gribouillages" aria-label="Gommer les gribouillages" hidden>🧽</button>';
  bar.addEventListener('click', e => {
    if (e.target.closest('#sab-doodle-btn')) { sabSetDoodleMode(!(sabDoodleMode && !sabDoodleErase), false); return; }
    if (e.target.closest('#sab-doodle-erase')) { sabSetDoodleMode(!(sabDoodleMode && sabDoodleErase), true); return; }
    const b = e.target.closest('.react-btn'); if (!b) return;
    const now = Date.now(); if (now - last < 250) return; last = now;
    act({ t: 'sab:react', e: b.dataset.e });
    b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' });
    if (navigator.vibrate) navigator.vibrate(10);
  });
})();
function sabSpawnReaction(e, who) {
  const layer = $('#sab-react-layer'); if (layer.childElementCount > 40) layer.firstElementChild.remove();
  const d = el('div', 'react-float', `${e}${who ? `<span class="who">${esc(who)}</span>` : ''}`);
  d.style[Math.random() < 0.5 ? 'left' : 'right'] = `${6 + Math.random() * 16}%`;
  layer.appendChild(d);
  const drift = (Math.random() - 0.5) * 70;
  d.animate([
    { transform: 'translate(0,0) scale(.6)', opacity: 0 },
    { transform: `translate(${drift * .3}px,-12vh) scale(1.15)`, opacity: 1, offset: .15 },
    { transform: `translate(${drift}px,-52vh) scale(1)`, opacity: 1, offset: .72 },
    { transform: `translate(${drift * 1.2}px,-68vh) scale(.9)`, opacity: 0 },
  ], { duration: 3800 + Math.random() * 900, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' }).onfinish = () => d.remove();
}
