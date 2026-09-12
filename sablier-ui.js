/* Sablier — écrans, canevas de dessin et réactions.
   Reçoit la vue par joueur calculée par l'hôte (view.sab) et n'envoie que des actions
   via act({ t: 'sab:…' }). Le canevas vit hors de la zone re-rendue : ses traits
   arrivent en messages séparés, pas dans l'état. */

'use strict';

let sabClockTimer = null, sabOffset = 0, sabLastPhaseKey = null;
const sabTeamOf = (v, id) => v.teams.find(t => t.id === id);
const initial = n => (n || '?').trim()[0].toUpperCase();
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const diffDots = d => `<span class="dots" title="Difficulté ${d}/3">${'●'.repeat(d)}${'○'.repeat(3 - d)}</span>`;

function renderSablier(v) {
  if (!v) return;
  sabOffset = v.serverNow - Date.now();          // décalage d'horloge avec l'hôte
  const me = v.you, host = !!me?.isHost;
  const root = $('#sab-main');
  const key = `${v.phase}|${v.round}|${v.turn?.playerId}|${v.turn?.endsAt}|${v.selection?.readyCount}|${me?.ready}|${me?.discardCount}|${v.players.length}|${v.teams.map(t => t.players.length + ':' + t.total).join(',')}|${v.turn?.guessedCount}|${v.turn?.passedCount}|${!!v.buzzer}|${(v.correctable || []).length}|${!!v.card}|${v.unassigned.length}|${v.settings.teamMode}|${v.lastTurn?.playerName}`;
  const rebuild = key !== sabLastPhaseKey; sabLastPhaseKey = key;

  // bandeau des équipes, toujours visible pendant la partie
  const strip = $('#sab-teams');
  const live = v.phase === 'turn-live' || v.phase === 'turn-idle';
  strip.innerHTML = v.teams.map(t => `
    <div class="tm" style="--tc:${t.color}${v.turn && v.turn.teamId === t.id && live ? ';box-shadow:0 0 0 2px var(--tc)' : ''}">
      <div class="tm-head"><b>${esc(t.name)}</b><span class="tm-score">${t.total}</span></div>
      <div class="tm-members">${t.players.map(p => `<span class="mem${v.turn && v.turn.playerId === p.id && live ? ' speaking' : ''}${p.connected ? '' : ' off'}">${esc(p.name)}</span>`).join('') || '<span class="mem empty">personne</span>'}</div>
    </div>`).join('');
  strip.hidden = v.phase === 'selection';

  // canevas et réactions : visibles seulement pendant un tour dessiné / un tour en cours
  const drawing = v.phase === 'turn-live' && v.roundDraw;
  $('#sab-draw').hidden = !drawing;
  $('#sab-tools').hidden = !(drawing && me?.isDescriber);
  if (drawing) { sabFitCanvas(); sabCanDraw = !!me?.isDescriber; }
  $('#sab-react').hidden = !(v.phase === 'turn-live' && !me?.isDescriber);

  if (rebuild) {
    root.innerHTML = '';
    ({ teams: sabTeams, selection: sabSelection, 'turn-idle': sabIdle, 'turn-live': sabLive, 'round-end': sabRoundEnd, 'game-end': sabGameEnd }[v.phase] || sabTeams)(v, root, me, host);
  }
  sabClock(v);
}

// ------------------------------------------------------------ équipes
function sabTeams(v, root, me, host) {
  const s = v.settings;
  root.appendChild(el('div', 'banner', `Les équipes<small>${s.teamMode === 'random' ? 'Tirage au sort équilibré. L\'hôte peut relancer.' : 'Chacun touche l\'équipe qu\'il rejoint.'}</small>`));
  const grid = el('div', 'teams-grid');
  v.teams.forEach(t => {
    const d = el('button', 'team', ''); d.type = 'button'; d.style.setProperty('--tc', t.color);
    d.innerHTML = `<span class="team-name">${esc(t.name)}</span><div class="team-list">${t.players.map(p => `<span class="mem${p.id === me?.id ? ' me' : ''}">${esc(p.name)}</span>`).join('') || '<span class="mem empty">—</span>'}</div>`;
    d.onclick = () => { if (s.teamMode === 'manual' || host) act({ t: 'sab:team', teamId: t.id }); };
    grid.appendChild(d);
  });
  root.appendChild(grid);
  if (v.unassigned.length) root.appendChild(el('div', 'note', `Sans équipe : ${v.unassigned.map(p => esc(p.name)).join(', ')}`));
  if (host) {
    const row = el('div', 'row');
    row.innerHTML = `<button class="btn" id="sab-reroll" ${s.teamMode === 'manual' ? 'hidden' : ''}>Retirer au sort</button>
      <button class="btn" id="sab-mode">${s.teamMode === 'random' ? 'Passer au choix libre' : 'Passer au tirage au sort'}</button>
      <button class="btn small" id="sab-team-add" ${v.teams.length >= 4 ? 'disabled' : ''}>+ équipe</button>
      <button class="btn small" id="sab-team-rm" ${v.teams.length <= 2 ? 'disabled' : ''}>− équipe</button>`;
    root.appendChild(row);
    $('#sab-reroll').onclick = () => act({ t: 'sab:randomize' });
    $('#sab-mode').onclick = () => act({ t: 'sab:settings', patch: { teamMode: s.teamMode === 'random' ? 'manual' : 'random' } });
    $('#sab-team-add').onclick = () => act({ t: 'sab:team-add' });
    $('#sab-team-rm').onclick = () => act({ t: 'sab:team-rm' });
    if (v.problems?.length) root.appendChild(el('div', 'note warn', v.problems.map(esc).join('<br>')));
    const go = el('button', 'btn primary lg', `Distribuer les cartes <span class="cost">${s.dealPerPlayer} chacun</span>`);
    go.disabled = !!v.problems?.length; go.onclick = () => act({ t: 'sab:deal' }); root.appendChild(go);
    root.appendChild(el('div', 'fine center', `${v.poolSize} cartes disponibles, ${v.freshCount} jamais vues`));
  } else root.appendChild(el('div', 'note', 'L\'hôte lance la distribution.'));
}

// ------------------------------------------------------------ défausse
function sabSelection(v, root, me, host) {
  const sel = v.selection, hand = v.hand || [];
  const left = sel.toDiscard - (me?.discardCount || 0);
  root.appendChild(el('div', 'banner', me?.ready ? `Main validée<small>On attend ${sel.waitingFor.length ? esc(sel.waitingFor.join(', ')) : 'les autres'}… ${sel.readyCount}/${sel.totalCount} prêts.</small>`
    : `Écarte ${sel.toDiscard} carte${sel.toDiscard > 1 ? 's' : ''}<small>Celles que tu ne te sens pas de faire deviner. Touche pour écarter.${left ? ` Encore ${left}.` : ''}</small>`));
  const grid = el('div', 'hand');
  hand.forEach(c => {
    const card = el('button', 'pcard' + (c.discarded ? ' out' : ''), `<span class="pc-cat">${esc(c.c)}</span><span class="pc-name">${esc(c.n)}</span>${diffDots(c.d)}`);
    card.type = 'button'; card.disabled = !!me?.ready;
    card.onclick = () => act({ t: 'sab:toggle', cardId: c.id });
    grid.appendChild(card);
  });
  root.appendChild(grid);
  const row = el('div', 'row');
  if (me?.ready) { const b = el('button', 'btn', 'Modifier ma sélection'); b.onclick = () => act({ t: 'sab:unvalidate' }); row.appendChild(b); }
  else { const b = el('button', 'btn primary lg', 'Valider ma main'); b.disabled = left !== 0; b.onclick = () => act({ t: 'sab:validate' }); row.appendChild(b); }
  root.appendChild(row);
  if (host && sel.readyCount < sel.totalCount) { const f = el('button', 'btn ghost small', 'Démarrer sans attendre les retardataires'); f.onclick = () => act({ t: 'sab:force' }); root.appendChild(f); }
}

// ------------------------------------------------------------ entre deux tours
function sabIdle(v, root, me, host) {
  const t = v.turn, isMe = t && t.playerId === me?.id;
  root.appendChild(el('div', 'roundtag', `Manche ${v.round}/${v.roundCount} · ${esc(v.roundTitle)}<small>${esc(v.roundRule)}</small>`));
  if (v.lastTurn) {
    const lt = v.lastTurn;
    root.appendChild(el('div', 'recap', `<span class="who" style="--tc:${lt.teamColor}">${esc(lt.playerName)}</span> a fait deviner <b>${lt.guessedNames.length}</b> carte${lt.guessedNames.length > 1 ? 's' : ''}${lt.passedCount ? `, ${lt.passedCount} passée${lt.passedCount > 1 ? 's' : ''}` : ''}${lt.guessedNames.length ? `<small>${lt.guessedNames.map(esc).join(' · ')}</small>` : ''}`));
  }
  if (host && v.buzzer) {
    const b = el('div', 'gong', `<b>Le gong</b><p>${esc(v.buzzer.playerName)} avait une carte en main quand le temps s'est écoulé. A-t-elle été devinée juste sur le gong ?</p>`);
    const row = el('div', 'row');
    const y = el('button', 'btn pos', 'Oui, on la compte'); y.onclick = () => act({ t: 'sab:buzzer', accept: true });
    const n = el('button', 'btn', 'Non'); n.onclick = () => act({ t: 'sab:buzzer', accept: false });
    row.append(y, n); b.appendChild(row); root.appendChild(b);
  }
  if (t) {
    const box = el('div', 'turnbox', ''); box.style.setProperty('--tc', t.teamColor);
    box.innerHTML = `<span class="eyebrow">Au tour de l'équipe ${esc(t.teamName)}</span><div class="turn-who">${esc(t.playerName)}</div><small>${v.cardsLeft} carte${v.cardsLeft > 1 ? 's' : ''} encore dans le paquet</small>`;
    if (isMe) { const go = el('button', 'btn primary lg', `C'est parti <span class="cost">${v.turnTotal} s</span>`); go.onclick = () => act({ t: 'sab:start' }); box.appendChild(go); }
    else box.appendChild(el('div', 'note', `${esc(t.playerName)} lance son tour quand il est prêt.`));
    root.appendChild(box);
    if (host && !isMe) { const sk = el('button', 'btn ghost small', 'Tour bloqué ? Passer ce tour'); sk.onclick = () => act({ t: 'sab:abort' }); root.appendChild(sk); }
  }
  root.appendChild(sabScores(v));
  if (host) sabAmend(v, root);
}

// ------------------------------------------------------------ le tour
function sabLive(v, root, me, host) {
  const t = v.turn, isMe = !!me?.isDescriber;
  const head = el('div', 'livehead', ''); head.style.setProperty('--tc', t.teamColor);
  head.innerHTML = `<div><span class="eyebrow">Équipe ${esc(t.teamName)} · ${esc(v.roundTitle)}</span><div class="turn-who">${isMe ? 'À toi' : esc(t.playerName)}</div></div><div class="clock" id="sab-clock">–</div>`;
  root.appendChild(head);
  if (isMe) {
    if (!v.card) root.appendChild(el('div', 'ready', 'Prépare-toi<small>La carte arrive avec le chrono.</small>'));
    else {
      root.appendChild(el('div', 'bigcard', `<span class="pc-cat">${esc(v.card.c)}</span><span class="pc-name">${esc(v.card.n)}</span>${diffDots(v.card.d)}`));
      const row = el('div', 'row');
      const ok = el('button', 'btn pos lg', 'Deviné ✓'); ok.onclick = () => act({ t: 'sab:guessed' });
      const pass = el('button', 'btn', 'Passer'); pass.onclick = () => act({ t: 'sab:passed' });
      row.append(ok, pass); root.appendChild(row);
    }
    root.appendChild(el('div', 'note', `${t.guessedCount} devinée${t.guessedCount > 1 ? 's' : ''} · ${t.passedCount} passée${t.passedCount > 1 ? 's' : ''} · ${v.cardsLeft} dans le paquet`));
  } else {
    root.appendChild(el('div', 'note', v.roundDraw ? `${esc(t.playerName)} dessine, son équipe devine à voix haute.` : `${esc(t.playerName)} fait deviner à son équipe.`));
    root.appendChild(el('div', 'guessed', t.guessedNames.length ? t.guessedNames.map(n => `<span>${esc(n)}</span>`).join('') : '<span class="fine">Rien de deviné pour l\'instant</span>'));
    root.appendChild(el('div', 'fine center', `${t.passedCount} passée${t.passedCount > 1 ? 's' : ''} · ${v.cardsLeft} dans le paquet`));
  }
}

// ------------------------------------------------------------ fin de manche / partie
function sabRoundEnd(v, root, me, host) {
  root.appendChild(el('div', 'banner', `Manche ${v.round} terminée<small>Le paquet est vide. Les mêmes cartes reviennent, mélangées.</small>`));
  root.appendChild(sabScores(v, true));
  sabGallery(v, root);
  if (v.nextRoundInfo) root.appendChild(el('div', 'roundtag next', `Manche suivante : ${esc(v.nextRoundInfo.title)}<small>${esc(v.nextRoundInfo.rule)}</small>`));
  if (host) { const b = el('button', 'btn primary lg', 'Manche suivante →'); b.onclick = () => act({ t: 'sab:next' }); root.appendChild(b); sabAmend(v, root); }
  else root.appendChild(el('div', 'note', 'L\'hôte lance la manche suivante.'));
}
function sabGameEnd(v, root, me, host) {
  const sorted = [...v.teams].sort((a, b) => b.total - a.total);
  const w = sorted[0], tie = sorted[1] && sorted[1].total === w.total;
  root.appendChild(el('div', 'banner', tie ? `Égalité !<small>Deux équipes à ${w.total} points.</small>` : `L'équipe ${esc(w.name)} gagne<small>${w.total} carte${w.total > 1 ? 's' : ''} devinées sur ${v.roundCount} manche${v.roundCount > 1 ? 's' : ''}.</small>`));
  root.appendChild(sabScores(v, true));
  sabGallery(v, root);
  if (host) { const b = el('button', 'btn primary lg', 'Rejouer avec les mêmes équipes'); b.onclick = () => act({ t: 'sab:reset' }); root.appendChild(b); sabAmend(v, root); }
}

// ------------------------------------------------------------ morceaux partagés
function sabScores(v, detail = false) {
  const box = el('div', 'scores', '');
  const rounds = v.round;
  box.innerHTML = `<table><thead><tr><th></th>${detail ? Array.from({ length: rounds }, (_, i) => `<th>M${i + 1}</th>`).join('') : ''}<th>Total</th></tr></thead><tbody>${[...v.teams].sort((a, b) => b.total - a.total).map(t => `<tr style="--tc:${t.color}"><td><i class="sw"></i>${esc(t.name)}</td>${detail ? Array.from({ length: rounds }, (_, i) => `<td>${t.scores[i] ?? '–'}</td>`).join('') : ''}<td><b>${t.total}</b></td></tr>`).join('')}</tbody></table>`;
  return box;
}
function sabAmend(v, root) {
  if (!v.correctable?.length) return;
  const det = el('details', 'amend', `<summary>Une carte a été comptée par erreur ?</summary>`);
  const list = el('div', 'amend-list', v.correctable.map(c => `<label><input type="checkbox" value="${c.id}"><span>${esc(c.n)}</span><small>${esc(c.teamName)} · ${esc(c.playerName)}</small></label>`).join(''));
  det.appendChild(list);
  const b = el('button', 'btn small', 'Retirer les cartes cochées');
  b.onclick = () => { const ids = [...list.querySelectorAll('input:checked')].map(i => i.value); if (ids.length) act({ t: 'sab:amend', ids }); };
  det.appendChild(b); root.appendChild(det);
}
function sabGallery(v, root) {
  const items = v.gallery || []; if (!items.length) return;
  const found = items.filter(i => !i.missed), missed = items.filter(i => i.missed);
  const wrap = el('div', 'gallery-wrap', `<h3>Les dessins</h3>`);
  const grid = (list, cls) => { const g = el('div', 'gallery ' + cls); list.forEach(it => { const fig = el('figure', '', ''); const c = document.createElement('canvas'); c.width = 400; c.height = 300; sabDrawStrokesTo(c, it.strokes); fig.appendChild(c); fig.appendChild(el('figcaption', '', `${cls === 'missed' ? '✗ ' : ''}${esc(it.n)}<small>${esc(it.playerName)}</small>`)); g.appendChild(fig); }); return g; };
  if (found.length) wrap.appendChild(grid(found, 'found'));
  if (missed.length) { wrap.appendChild(el('h4', '', 'Pas devinées à temps, carte révélée')); wrap.appendChild(grid(missed, 'missed')); }
  root.appendChild(wrap);
}

// chrono local, calé sur l'horloge de l'hôte
function sabClock(v) {
  clearInterval(sabClockTimer); sabClockTimer = null;
  const t = v.turn; if (v.phase !== 'turn-live' || !t?.endsAt) return;
  const tick = () => {
    const el_ = $('#sab-clock'); if (!el_) return;
    const now = Date.now() + sabOffset;
    if (t.startsAt && now < t.startsAt) { el_.textContent = Math.ceil((t.startsAt - now) / 1000); el_.className = 'clock pre'; return; }
    const left = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
    el_.textContent = left; el_.className = 'clock' + (left <= 5 ? ' hot' : '');
  };
  tick(); sabClockTimer = setInterval(tick, 200);
}

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
}
(function buildReactions() {
  const bar = $('#sab-react'); let last = 0;
  bar.innerHTML = Sablier.REACTIONS.map(e => `<button type="button" class="react-btn" data-e="${e}">${e}</button>`).join('');
  bar.addEventListener('click', e => {
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
