/* Sablier — écrans, canevas de dessin, gribouillages latéraux et réactions.
   Reçoit la vue par joueur calculée par l'hôte (view.sab) et n'envoie que des actions
   via act({ t: 'sab:…' }). La mise en page reprend celle du Sablier d'origine :
   fil d'étapes, chrono avec barre, grande carte, boutons Passer / Deviné, bandeau des
   trouvées, tableau des scores par équipe. Le canevas vit hors de la zone re-rendue :
   ses traits arrivent en messages séparés, pas dans l'état. */

'use strict';

let sabClockTimer = null, sabOffset = 0, sabLastPhaseKey = null, sabView = null, sabWasMyTurn = false, sabLastPassed = 0;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const diffDots = d => `<span class="dots" title="Difficulté ${d}/3">${'●'.repeat(d)}${'○'.repeat(3 - d)}</span>`;
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const SAB_STEP = { teams: 1, selection: 2 };

function renderSablier(v) {
  if (!v) return;
  sabView = v;
  sabOffset = v.serverNow - Date.now();          // décalage d'horloge avec l'hôte
  const me = v.you, host = !!me?.isHost;
  const root = $('#sab-main'), after = $('#sab-after');
  const key = `${v.phase}|${v.round}|${v.turn?.playerId}|${v.turn?.endsAt}|${v.turn?.startsAt}|${v.selection?.readyCount}|${me?.ready}|${me?.discardCount}|${v.players.length}|${v.teams.map(t => t.players.map(p => p.id + (p.connected ? '' : '-')).join('+') + ':' + t.total).join(',')}|${v.turn?.guessedCount}|${v.turn?.passedCount}|${!!v.buzzer}|${(v.correctable || []).length}|${v.card?.n}|${v.unassigned.length}|${v.settings.teamMode}|${v.lastTurn?.playerName}|${v.cardsLeft}`;
  const rebuild = key !== sabLastPhaseKey; sabLastPhaseKey = key;

  // fil d'étapes : Équipes → Cartes → Partie
  $('#sab-steps').dataset.step = SAB_STEP[v.phase] || 3;

  // bandeau des équipes : pendant la défausse (qui est prêt) et pendant un tour (qui parle)
  const strip = $('#sab-teams');
  const showStrip = v.phase === 'selection' || v.phase === 'turn-live';
  strip.hidden = !showStrip;
  if (showStrip) strip.innerHTML = v.teams.map(t => `
    <div class="team-strip-row" style="--tc:${t.color}"><span class="ts-name">${esc(t.name)}</span>${t.players.map(p => {
      const cls = ['ts-p']; if (p.id === me?.id) cls.push('me'); if (!p.connected) cls.push('off');
      if (v.phase === 'selection' && p.ready) cls.push('ready');
      if (v.phase === 'turn-live' && v.turn?.playerId === p.id) cls.push('speaks');
      return `<span class="${cls.join(' ')}">${esc(p.name)}</span>`;
    }).join('') || '<span class="ts-p empty">personne</span>'}</div>`).join('');

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
    root.innerHTML = ''; after.innerHTML = '';
    ({ teams: sabTeams, selection: sabSelection, 'turn-idle': sabIdle, 'turn-live': sabLive, 'round-end': sabRoundEnd, 'game-end': sabGameEnd }[v.phase] || sabTeams)(v, root, after, me, host);
  }
  sabClock(v);
}

// ------------------------------------------------------------ équipes
function sabTeams(v, root, after, me, host) {
  const s = v.settings;
  if (host) {
    const panel = el('div', 'panel', '<h2>Comment former les équipes ?</h2>');
    const sw = el('div', 'mode-switch', `
      <button type="button" class="mode${s.teamMode === 'random' ? ' on' : ''}" data-mode="random"><strong>Aléatoire</strong><small>Réparti au hasard, équipes équilibrées</small></button>
      <button type="button" class="mode${s.teamMode === 'manual' ? ' on' : ''}" data-mode="manual"><strong>Au choix</strong><small>Chacun rejoint l'équipe qu'il veut</small></button>`);
    sw.querySelectorAll('.mode').forEach(b => b.onclick = () => { if (b.dataset.mode !== s.teamMode) act({ t: 'sab:settings', patch: { teamMode: b.dataset.mode } }); });
    panel.appendChild(sw);
    const row = el('div', 'row', `
      <button type="button" class="btn small" id="sab-reroll" ${s.teamMode === 'manual' ? 'hidden' : ''}>Retirer au sort</button>
      <button type="button" class="btn small" id="sab-team-add" ${v.teams.length >= 4 ? 'disabled' : ''}>+ Une équipe</button>
      <button type="button" class="btn small" id="sab-team-rm" ${v.teams.length <= 2 ? 'disabled' : ''}>− Une équipe</button>`);
    panel.appendChild(row); root.appendChild(panel);
    $('#sab-reroll').onclick = () => act({ t: 'sab:randomize' });
    $('#sab-team-add').onclick = () => act({ t: 'sab:team-add' });
    $('#sab-team-rm').onclick = () => act({ t: 'sab:team-rm' });
  }

  const panel = el('div', 'panel', `<h2>Équipes</h2><p class="hint">${s.teamMode === 'manual' ? 'Touche une équipe pour la rejoindre.' : host ? 'Tirage au sort équilibré. Touche une équipe pour y déplacer quelqu\'un, ou relance.' : 'L\'hôte tire les équipes au sort.'}</p>`);
  const list = el('div', 'teams');
  v.teams.forEach(t => {
    const mine = t.id === me?.teamId;
    const d = el('button', 'team' + (mine ? ' mine' : ''), `
      <div class="team-head"><span class="team-name">${esc(t.name)}</span><span class="team-count">${plural(t.players.length, 'joueur')}</span></div>
      ${t.players.length ? `<div class="team-players">${t.players.map(p => `<span class="pill${p.id === me?.id ? ' me' : ''}${p.isHost ? ' host' : ''}${p.connected ? '' : ' off'}">${esc(p.name)}</span>`).join('')}</div>` : '<p class="team-empty">Personne pour l\'instant</p>'}`);
    d.type = 'button'; d.style.setProperty('--tc', t.color);
    d.disabled = !(s.teamMode === 'manual' || host);
    d.onclick = () => act({ t: 'sab:team', teamId: t.id });
    list.appendChild(d);
  });
  panel.appendChild(list); root.appendChild(panel);

  if (v.unassigned.length) root.appendChild(el('div', 'panel', `<div class="panel-head"><h2>Sans équipe</h2><span class="counter">${v.unassigned.length}</span></div><div class="team-players">${v.unassigned.map(p => `<span class="pill${p.id === me?.id ? ' me' : ''}">${esc(p.name)}</span>`).join('')}</div>`));

  const actions = el('div', 'sticky-actions');
  if (host) {
    if (v.problems?.length) actions.appendChild(el('p', 'error', v.problems.map(esc).join('<br>')));
    const go = el('button', 'btn primary lg', 'Distribuer les cartes');
    go.type = 'button'; go.disabled = !!v.problems?.length; go.onclick = () => act({ t: 'sab:deal' }); actions.appendChild(go);
    actions.appendChild(el('p', 'hint center', `${s.dealPerPlayer} cartes chacun, ${s.discardPerPlayer} à écarter · ${v.poolSize} disponibles, ${v.freshCount} jamais vues`));
  } else actions.appendChild(el('p', 'hint center', 'En attente de l\'hôte…'));
  root.appendChild(actions);
}

// ------------------------------------------------------------ défausse
function sabSelection(v, root, after, me, host) {
  const sel = v.selection, hand = v.hand || [], mine = me?.discardCount || 0;
  const head = el('div', 'selection-head', me?.ready
    ? `<h2>Main validée</h2><p class="hint">On attend ${sel.waitingFor.length ? esc(sel.waitingFor.join(', ')) : 'les autres'}.</p>`
    : `<h2>Écarte ${plural(sel.toDiscard, 'carte')}</h2><p class="hint">Garde celles que tu penses faire deviner. Les cartes gardées par tout le monde formeront le paquet de la partie.</p>`);
  head.appendChild(el('div', 'sel-progress', `<span class="counter big">${mine} / ${sel.toDiscard}</span><span class="hint">${sel.readyCount} / ${sel.totalCount} prêts</span>`));
  root.appendChild(head);

  const grid = el('div', 'hand' + (me?.ready ? ' locked' : ''));
  hand.forEach(c => {
    const card = el('button', 'hand-card' + (c.discarded ? ' discarded' : ''), `<span class="hc-cat">${esc(c.c)}</span><span class="hc-name">${esc(c.n)}</span>${diffDots(c.d)}`);
    card.type = 'button'; card.disabled = !!me?.ready;
    card.onclick = () => act({ t: 'sab:toggle', cardId: c.id });
    grid.appendChild(card);
  });
  root.appendChild(grid);

  const actions = el('div', 'sticky-actions');
  if (me?.ready) { const b = el('button', 'btn', 'Modifier ma sélection'); b.type = 'button'; b.onclick = () => act({ t: 'sab:unvalidate' }); actions.appendChild(b); }
  else {
    const left = sel.toDiscard - mine;
    const b = el('button', 'btn primary lg', 'Valider ma sélection'); b.type = 'button'; b.disabled = left !== 0; b.onclick = () => act({ t: 'sab:validate' }); actions.appendChild(b);
    if (left > 0) actions.appendChild(el('p', 'hint center', `Encore ${plural(left, 'carte')} à écarter.`));
  }
  if (host && sel.readyCount < sel.totalCount) { const f = el('button', 'btn ghost', 'Démarrer sans attendre les retardataires'); f.type = 'button'; f.onclick = () => act({ t: 'sab:force' }); actions.appendChild(f); }
  after.appendChild(actions);
}

// ------------------------------------------------------------ entre deux tours
function sabIdle(v, root, after, me, host) {
  const t = v.turn, isMe = t && t.playerId === me?.id;
  root.appendChild(el('div', 'round-banner', `<span>Manche ${v.round}/${v.roundCount}</span><span class="dot"></span><span>${esc(v.roundTitle)}</span><span class="dot"></span><span>${plural(v.cardsLeft, 'carte')}</span>`));

  if (v.lastTurn) {
    const lt = v.lastTurn, n = lt.guessedNames.length;
    root.appendChild(el('div', 'recap', `<h3>Tour précédent — <span style="color:${lt.teamColor}">${esc(lt.playerName)}</span></h3>
      <ul class="recap-list">${n ? lt.guessedNames.map(x => `<li>${esc(x)}</li>`).join('') : '<li class="none">Aucune carte devinée</li>'}</ul>
      ${lt.passedCount ? `<p class="recap-passed">${lt.passedCount} carte${lt.passedCount > 1 ? 's' : ''} passée${lt.passedCount > 1 ? 's' : ''}</p>` : ''}`));
  }

  if (host && v.buzzer) {
    const b = el('div', 'panel gong', `<h2>⏰ Sur le gong</h2><p class="hint">${esc(v.buzzer.playerName)} avait une carte en main quand le temps s'est écoulé. A-t-elle été devinée juste sur le gong ?</p>`);
    const row = el('div', 'row split');
    const n = el('button', 'btn', 'Non, pas devinée'); n.type = 'button'; n.onclick = () => act({ t: 'sab:buzzer', accept: false });
    const y = el('button', 'btn guess', 'Oui, on la compte'); y.type = 'button'; y.onclick = () => act({ t: 'sab:buzzer', accept: true });
    row.append(n, y); b.appendChild(row); root.appendChild(b);
  }

  if (t) {
    const box = el('div', 'panel spotlight', `<p class="up-next-label">Au tour de</p><p class="up-next-name">${isMe ? 'Toi !' : esc(t.playerName)}</p><p class="up-next-team" style="color:${t.teamColor}">Équipe ${esc(t.teamName)}</p>
      <div class="rule-box"><strong>${esc(v.roundTitle)}</strong><p>${esc(v.roundRule)}</p></div>`);
    if (isMe) { const go = el('button', 'btn primary lg', `C'est à moi — démarrer <span class="cost">${v.turnTotal} s</span>`); go.type = 'button'; go.onclick = () => act({ t: 'sab:start' }); box.appendChild(go); }
    else box.appendChild(el('p', 'hint center', `${esc(t.playerName)} démarre quand tout le monde est prêt.`));
    root.appendChild(box);
  }

  root.appendChild(sabScores(v));
  if (host) sabAmend(v, root);
  if (host && t && !isMe) { const sk = el('button', 'btn ghost', 'Passer ce tour'); sk.type = 'button'; sk.onclick = () => act({ t: 'sab:abort' }); root.appendChild(sk); }
}

// ------------------------------------------------------------ le tour
function sabLive(v, root, after, me, host) {
  const t = v.turn, isMe = !!me?.isDescriber, mini = v.roundDraw ? ' mini' : '';
  root.appendChild(el('div', 'timer-wrap', `<div class="timer" id="sab-clock">–</div><div class="timer-bar"><div class="timer-bar-fill" id="sab-clock-bar"></div></div>`));

  if (isMe) {
    if (!v.card) root.appendChild(el('div', 'game-card' + mini, `<span class="game-card-cat">Prépare-toi</span><span class="game-card-name">La carte arrive avec le chrono</span>`));
    else {
      const card = el('div', 'game-card flash' + mini, `<span class="game-card-cat">${esc(v.card.c)}</span><span class="game-card-name">${esc(v.card.n)}</span><span class="game-card-diff">${diffDots(v.card.d)}</span>`);
      root.appendChild(card);
      const acts = el('div', 'play-actions');
      const pass = el('button', 'btn pass', 'Passer'); pass.type = 'button'; pass.onclick = () => act({ t: 'sab:passed' });
      const ok = el('button', 'btn guess', 'Deviné !'); ok.type = 'button'; ok.onclick = () => act({ t: 'sab:guessed' });
      acts.append(pass, ok); after.appendChild(acts);
    }
    after.appendChild(el('div', 'found-strip', `<span class="tally ok"><strong>${t.guessedCount}</strong> trouvée${t.guessedCount > 1 ? 's' : ''}</span><span class="tally pass"><strong>${t.passedCount}</strong> passée${t.passedCount > 1 ? 's' : ''}</span><span class="tally"><strong>${v.cardsLeft}</strong> dans le paquet</span>`));
  } else {
    root.appendChild(el('div', 'listen-card' + mini, `<p class="listen-who"><strong>${esc(t.playerName)}</strong> ${v.roundDraw ? 'dessine' : v.roundMime ? 'mime' : 'fait deviner'}</p><p class="listen-team" style="color:${t.teamColor}">Équipe ${esc(t.teamName)}</p><div class="pulse"></div><p class="listen-rule">${esc(v.roundRule)}</p>`));
    const foot = el('div', 'audience-foot', `<div class="found-strip"><span class="tally ok"><strong>${t.guessedCount}</strong> trouvée${t.guessedCount > 1 ? 's' : ''}</span><span class="tally pass${t.passedCount > sabLastPassed ? ' bump' : ''}"><strong>${t.passedCount}</strong> passée${t.passedCount > 1 ? 's' : ''}</span><span class="tally"><strong>${v.cardsLeft}</strong> dans le paquet</span></div>
      <ul class="found-list">${t.guessedNames.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`);
    after.appendChild(foot);
  }
  sabLastPassed = t.passedCount;
}

// ------------------------------------------------------------ fin de manche / partie
function sabRoundEnd(v, root, after, me, host) {
  root.appendChild(el('header', 'hero', `<div class="hero-mark">🏁</div><h1>Manche ${v.round} terminée</h1><p class="hero-sub">Le paquet est vide. Les mêmes cartes reviennent, mélangées.</p>`));
  root.appendChild(sabScores(v, true));
  sabGallery(v, root);
  const panel = el('div', 'panel');
  if (v.nextRoundInfo) panel.appendChild(el('div', 'rule-box', `<strong>Manche suivante : ${esc(v.nextRoundInfo.title)}</strong><p>${esc(v.nextRoundInfo.rule)}</p>`));
  if (host) { const b = el('button', 'btn primary lg', 'Manche suivante'); b.type = 'button'; b.onclick = () => act({ t: 'sab:next' }); panel.appendChild(b); }
  else panel.appendChild(el('p', 'hint center', 'En attente de l\'hôte…'));
  root.appendChild(panel);
  if (host) sabAmend(v, root);
}
function sabGameEnd(v, root, after, me, host) {
  const sorted = [...v.teams].sort((a, b) => b.total - a.total);
  const w = sorted[0], tie = sorted[1] && sorted[1].total === w.total;
  root.appendChild(el('header', 'hero', `<div class="hero-mark">🏆</div><h1>Partie terminée</h1><p class="hero-sub">${tie ? `Égalité à ${plural(w.total, 'point')} !` : `L'équipe <b style="color:${w.color}">${esc(w.name)}</b> gagne avec ${plural(w.total, 'carte')} sur ${plural(v.roundCount, 'manche')}.`}</p>`));
  root.appendChild(sabScores(v, true));
  sabGallery(v, root);
  const panel = el('div', 'panel');
  if (host) { const b = el('button', 'btn primary lg', 'Rejouer avec les mêmes équipes'); b.type = 'button'; b.onclick = () => act({ t: 'sab:reset' }); panel.appendChild(b); }
  else panel.appendChild(el('p', 'hint center', 'En attente de l\'hôte…'));
  root.appendChild(panel);
  if (host) sabAmend(v, root);
}

// ------------------------------------------------------------ morceaux partagés
function sabScores(v, detail = false) {
  const box = el('div', 'scores');
  const sorted = [...v.teams].sort((a, b) => b.total - a.total);
  const top = sorted[0]?.total || 0;
  sorted.forEach(t => {
    const row = el('div', 'score-row' + (t.total === top && top > 0 ? ' leader' : '') + (v.turn && v.turn.teamId === t.id && (v.phase === 'turn-idle' || v.phase === 'turn-live') ? ' active' : ''));
    row.style.setProperty('--tc', t.color);
    const perRound = detail ? t.scores.slice(0, v.round).map((s, i) => `M${i + 1} ${s ?? 0}`).join(' · ') : t.scores.slice(0, v.round).map((s, i) => `M${i + 1} ${s ?? 0}`).join(' · ');
    row.innerHTML = `<span class="score-name">${esc(t.name)}</span><span class="score-detail">${perRound}</span><span class="score-total">${t.total}</span>
      <div class="score-players">${t.players.map(p => `<span class="ts-p${p.id === v.you?.id ? ' me' : ''}${p.connected ? '' : ' off'}${v.turn && v.turn.playerId === p.id && (v.phase === 'turn-idle' || v.phase === 'turn-live') ? ' speaks' : ''}">${esc(p.name)}</span>`).join('')}</div>`;
    box.appendChild(row);
  });
  return box;
}
function sabAmend(v, root) {
  if (!v.correctable?.length) return;
  const det = el('details', 'amend', `<summary>Une carte a été comptée par erreur ?</summary>`);
  const list = el('div', 'amend-list', v.correctable.map(c => `<label><input type="checkbox" value="${c.id}"><span>${esc(c.n)}</span><small>${esc(c.teamName)} · ${esc(c.playerName)}</small></label>`).join(''));
  det.appendChild(list);
  const b = el('button', 'btn small', 'Retirer les cartes cochées'); b.type = 'button';
  b.onclick = () => { const ids = [...list.querySelectorAll('input:checked')].map(i => i.value); if (ids.length) act({ t: 'sab:amend', ids }); };
  det.appendChild(b); root.appendChild(det);
}
function sabGallery(v, root) {
  const items = v.gallery || []; if (!items.length) return;
  const found = items.filter(i => !i.missed), missed = items.filter(i => i.missed);
  const wrap = el('div', 'panel gallery-wrap', `<h2>Les dessins</h2>`);
  const grid = (list, cls) => { const g = el('div', 'gallery ' + cls); list.forEach(it => { const fig = el('figure', '', ''); const c = document.createElement('canvas'); c.width = 400; c.height = 300; sabDrawStrokesTo(c, it.strokes); fig.appendChild(c); fig.appendChild(el('figcaption', '', `${cls === 'missed' ? '✗ ' : ''}${esc(it.n)}<small>${esc(it.playerName)}</small>`)); g.appendChild(fig); }); return g; };
  if (found.length) wrap.appendChild(grid(found, 'found'));
  if (missed.length) { wrap.appendChild(el('h3', '', 'Pas devinées à temps')); wrap.appendChild(grid(missed, 'missed')); }
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
  bar.innerHTML = Sablier.REACTIONS.map(e => `<button type="button" class="react-btn" data-e="${e}">${e}</button>`).join('')
    + '<button type="button" class="react-btn pencil" id="sab-doodle-btn" title="Gribouiller sur les côtés" hidden>✏️</button>'
    + '<button type="button" class="react-btn pencil" id="sab-doodle-erase" title="Gommer les gribouillages" hidden>🧽</button>';
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
