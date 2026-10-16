// Grandes Lignes : affichage et commandes. Les règles du jeu sont dans engines/rail.js, la carte dans rail-carte.js.

'use strict';

// ============================================================ écran
// Tout l'écran est la table (table.js, table.css) : les autres assis en arc, le meneur dans sa bulle de verre, la carte
// de France en relief (img/rail/plateau.webp, rendue dans Blender) avec les lignes dessinées par-dessus, la rivière de
// cinq cartes, et dans le plateau de verre en bas ta main, puis ce que tu es en train de faire (billets, ligne, tunnel).
// La carte se déplace et se zoome au doigt ; elle n'est JAMAIS reconstruite : seules les lignes et les villes changent.
const GL = { sel: null, pay: null, gare: false, city: null, keep: null, keepKey: '', view: { x: 0, y: -12, w: 1035 }, desk: null, last: null, seen: null, flash: new Set(), routesKey: '', citiesKey: '' };
const GL_COL = { rouge: '#d8423a', bleu: '#2f6fd0', jaune: '#f0c22f', vert: '#3a9a52', noir: '#2f3138', blanc: '#f2f1ec', orange: '#ef7d2a', violet: '#8a4cc4', gris: '#b8b1a2' };
const GL_PIECE = { rouge: '#d8372f', bleu: '#2c6fd9', vert: '#2f9d58', jaune: '#f2c12e', noir: '#2b2d33' };
const GL_NOM = { rouge: 'Couvert', bleu: 'Citerne', jaune: 'Trémie', vert: 'Grumes', noir: 'Charbon', blanc: 'Frigo', orange: 'Conteneur', violet: 'Voyageurs', loco: 'Locomotive' };
const GL_MOT = { rouge: 'rouges', bleu: 'bleus', jaune: 'jaunes', vert: 'verts', noir: 'noirs', blanc: 'blancs', orange: 'orange', violet: 'violets', loco: 'locomotives', gris: 'd’une même couleur' };
const GL_PIECE_MOT = { rouge: 'rouges', bleu: 'bleus', vert: 'verts', jaune: 'jaunes', noir: 'noirs' };
const glV = k => Rail.K.villes[k];
const glPair = r => r.a < r.b ? r.a + '-' + r.b : r.b + '-' + r.a;
const glTwins = (() => { const m = {}; Rail.R.forEach(r => (m[glPair(r)] = (m[glPair(r)] || 0) + 1)); return m; })();
const glFR = 'M' + Rail.K.france.map(p => p.join(',')).join('L') + 'Z', glCO = 'M' + Rail.K.corse.map(p => p.join(',')).join('L') + 'Z';
const glYou = (id, name) => id === net.me ? 'Tu' : esc(tbSplit({ name })[1]);
const glNm = p => esc(tbSplit(p)[1]);
const glSeatP = p => p.bot ? { ...p, name: p.name.replace(/^Robot /, '') } : p;

// ---------------------------------------------------------------- géométrie des lignes
function glGeo(r) {
  const A = glV(r.a), B = glV(r.b), dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), off = glTwins[glPair(r)] > 1 ? (r.voie ? 7.5 : -7.5) : 0;
  const nx = -dy / L, ny = dx / L, trim = 12.5, gap = 2.6, cl = (L - 2 * trim - (r.n - 1) * gap) / r.n;
  return { ax: A.x + nx * off, ay: A.y + ny * off, ang: Math.atan2(dy, dx) * 180 / Math.PI, L, trim, gap, cl, ux: dx / L, uy: dy / L };
}
function glRouteSVG(r, v) {
  const g = glGeo(r), who = v.claims[r.id], p = who ? v.players.find(x => x.id === who) : null;
  const tun = v.europe && r.tunnel, fer = v.europe ? r.ferry : 0;
  let s = `<g class="glx-rt${tun ? ' tun' : ''}${GL.sel === r.id ? ' sel' : ''}${who ? ' taken' : ''}${who === net.me ? ' mine' : ''}${GL.flash.has(r.id) ? ' flash' : ''}" data-id="${r.id}" transform="translate(${g.ax.toFixed(1)} ${g.ay.toFixed(1)}) rotate(${g.ang.toFixed(2)})">`;
  if (p) {
    const h = Math.min(g.cl * 0.52, 24);
    s += `<rect class="base" x="${(g.trim - 3).toFixed(1)}" y="${(-h / 2 - 2.5).toFixed(1)}" width="${(g.L - 2 * g.trim + 6).toFixed(1)}" height="${(h + 5).toFixed(1)}" rx="${(h / 2 + 2.5).toFixed(1)}"/>`;
    for (let i = 0; i < r.n; i++) s += `<image href="img/rail/piece-${p.piece}.webp?v=${ASSET_V}" x="${(g.trim + i * (g.cl + g.gap)).toFixed(1)}" y="${(-h / 2).toFixed(1)}" width="${g.cl.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="none"/>`;
    return s + '</g>';
  }
  for (let i = 0; i < r.n; i++) {
    const x = g.trim + i * (g.cl + g.gap);
    s += `<rect class="k" x="${x.toFixed(1)}" y="-6.2" width="${g.cl.toFixed(1)}" height="12.4" rx="2.6" fill="${GL_COL[r.c]}"/><rect x="${(x + 1.5).toFixed(1)}" y="-4.8" width="${(g.cl - 3).toFixed(1)}" height="2.6" rx="1.3" fill="rgba(255,255,255,.28)"/>`;
    if (i < fer) s += `<circle cx="${(x + g.cl / 2).toFixed(1)}" cy="0" r="3.6" fill="#1d1a17" stroke="#fff" stroke-width="1.2"/>`;
  }
  return s + '</g>';
}
function glCitiesSVG(v) {
  const goals = new Set(), done = new Set(), gares = {}, offer = new Set();
  (v.me?.tickets || []).forEach(t => { const b = Rail.T[t.id]; [b.a, b.b].forEach(k => (t.ok ? done : goals).add(k)); });
  (v.me?.offer || []).forEach(id => { const b = Rail.T[id]; offer.add(b.a); offer.add(b.b); });
  v.players.forEach(p => p.stations.forEach(c => (gares[c] = p.piece)));
  return Object.entries(Rail.K.villes).map(([k, c]) => {
    const lx = c.et === 'e' ? 13 : c.et === 'w' ? -13 : 0, ly = c.et === 'n' ? -14 : c.et === 's' ? 26 : 7, an = c.et === 'e' ? 'start' : c.et === 'w' ? 'end' : 'middle';
    const gare = gares[k] ? `<path d="M-9 -3 L0 -12 L9 -3 L9 8 L-9 8 Z" fill="${GL_PIECE[gares[k]]}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>` : '<circle r="7.5"/>';
    return `<g class="glx-city${done.has(k) ? ' done' : goals.has(k) ? ' goal' : ''}${offer.has(k) ? ' offer' : ''}${GL.city === k ? ' sel' : ''}" transform="translate(${c.x} ${c.y})">${gare}<text x="${lx}" y="${ly}" text-anchor="${an}">${esc(c.nom)}</text></g>`;
  }).join('');
}

// ---------------------------------------------------------------- la carte : déplacer, zoomer, toucher une ligne ou une ville
function glMapBox() {
  const box = el('div', 'glx-map');
  box.innerHTML = `<svg viewBox="0 0 1035 1010" role="img" aria-label="Carte de France des lignes">
    <image href="img/rail/plateau.webp?v=${ASSET_V}" x="0" y="0" width="1035" height="1010" preserveAspectRatio="none"/>
    <path d="${glFR}" fill="none" stroke="rgba(255,250,235,.35)" stroke-width="1.4" stroke-linejoin="round"/><path d="${glCO}" fill="none" stroke="rgba(255,250,235,.35)" stroke-width="1.4"/>
    <g class="glx-routes"></g><g class="glx-cities"></g></svg>
    <div class="glx-zoom"><button type="button" class="zp" aria-label="Zoomer">+</button><button type="button" class="zm" aria-label="Dézoomer">−</button></div>`;
  const svg = box.querySelector('svg'), st = GL.view;
  const asp = () => (box.clientHeight || 1) / (box.clientWidth || 1);
  const apply = () => {
    const h = st.w * asp();
    st.w = Math.min(1035, Math.max(240, st.w));
    if (st.w >= 1035) { st.x = 0; st.y = (1010 - h) / 2; } else { st.x = Math.min(Math.max(st.x, -40), 1075 - st.w); st.y = Math.min(Math.max(st.y, -40), 1050 - h); }
    svg.setAttribute('viewBox', `${st.x.toFixed(1)} ${st.y.toFixed(1)} ${st.w.toFixed(1)} ${h.toFixed(1)}`);
    svg.querySelector('.glx-cities').style.fontSize = (21 * Math.pow(st.w / 1035, 0.55)).toFixed(1) + 'px';
  };
  const toMap = (cx, cy) => { const b = svg.getBoundingClientRect(); return [st.x + (cx - b.left) / b.width * st.w, st.y + (cy - b.top) / b.height * st.w * asp()]; };
  const zoomAt = (cx, cy, k) => { const [mx, my] = toMap(cx, cy), nw = Math.min(1035, Math.max(240, st.w / k)), r = nw / st.w; st.x = mx - (mx - st.x) * r; st.y = my - (my - st.y) * r; st.w = nw; apply(); };
  const pts = new Map(); let moved = 0, last = null, pinch = null, lastTap = 0;
  svg.addEventListener('pointerdown', e => {
    e.preventDefault(); svg.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; last = [e.clientX, e.clientY];
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, w: st.w }; }
  });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, st.w / (pinch.w * pinch.d / d)); moved = 99; return; }
    const b = svg.getBoundingClientRect(), dx = e.clientX - last[0], dy = e.clientY - last[1]; moved += Math.abs(dx) + Math.abs(dy); last = [e.clientX, e.clientY];
    if (moved > 6) { svg.classList.add('drag'); st.x -= dx / b.width * st.w; st.y -= dy / b.height * st.w * asp(); apply(); }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); svg.classList.remove('drag'); if (pts.size < 2) pinch = null;
    if (moved > 6 || pts.size || e.type === 'pointercancel') return;
    const now = Date.now(); if (now - lastTap < 280) { zoomAt(e.clientX, e.clientY, 1.8); lastTap = 0; return; } lastTap = now;
    const [mx, my] = toMap(e.clientX, e.clientY), b = svg.getBoundingClientRect(), tol = 22 / (b.width / st.w);
    if (GL.gare) {                                                         // une gare : la ville la plus proche
      let best = null, bd = 1e9; for (const [k, c] of Object.entries(Rail.K.villes)) { const d = Math.hypot(mx - c.x, my - c.y); if (d < bd) { bd = d; best = k; } }
      GL.city = bd < tol * 1.4 ? best : null; GL.pay = null; return glRedraw();
    }
    let best = null, bd = 1e9;
    for (const r of Rail.R) {
      const g = glGeo(r), sx = g.ax + g.ux * g.trim, sy = g.ay + g.uy * g.trim, L = g.L - 2 * g.trim;
      const t = Math.max(0, Math.min(L, (mx - sx) * g.ux + (my - sy) * g.uy)), d = Math.hypot(mx - sx - g.ux * t, my - sy - g.uy * t);
      if (d < bd) { bd = d; best = r; }
    }
    glPick(bd < tol ? best.id : null);
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  const mid = k => { const b = svg.getBoundingClientRect(); zoomAt(b.left + b.width / 2, b.top + b.height / 2, k); };
  box.querySelector('.zp').onclick = () => mid(1.6); box.querySelector('.zm').onclick = () => mid(1 / 1.6);
  new ResizeObserver(apply).observe(box);
  requestAnimationFrame(apply);
  return box;
}
function glPick(id) { if (GL.last?.tunnel) return; GL.sel = id === GL.sel ? null : id; GL.pay = null; glRedraw(); }
const glRedraw = () => { if (view?.gl) renderRail(view.gl); };

// ---------------------------------------------------------------- les morceaux
const glImg = c => `<img src="img/rail/wagon-${c}.webp?v=${ASSET_V}" alt="" decoding="async" draggable="false">`;
const glCard = (c, cls = '', attrs = '') => `<button type="button" class="glx-card${c === 'loco' ? ' loco' : ''}${cls}" style="--c:${GL_COL[c] || '#333'}" ${attrs}><span class="lb">${c === 'loco' ? 'Loco' : GL_NOM[c]}</span>${glImg(c)}</button>`;
function glMini(t) {
  const A = glV(t.a), B = glV(t.b);
  return `<svg viewBox="-20 -20 1075 1050" aria-hidden="true"><path d="${glFR}" class="f"/><path d="${glCO}" class="f"/>
    <line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="l"/><circle cx="${A.x}" cy="${A.y}" r="42" class="c"/><circle cx="${B.x}" cy="${B.y}" r="42" class="c"/></svg>`;
}
function glTicket(id, { ok = null, tag = 'div', attrs = '', fail = false } = {}) {
  const t = Rail.T[id];
  return `<${tag} class="glx-ticket${ok ? ' done' : ''}${fail ? ' fail' : ''}${t.long ? ' long' : ''}" ${tag === 'button' ? 'type="button" ' : ''}${attrs}>${glMini(t)}<span><span class="v">${esc(glV(t.a).nom)}<i>›</i>${esc(glV(t.b).nom)}</span><span class="m">${t.long ? 'Grande ligne · ' : ''}N° ${String(417 + t.id * 37).padStart(4, '0')}</span></span>
    <span class="p">${fail ? '−' : ''}${t.p}<small>points</small></span>${ok ? '<span class="stamp">Relié</span>' : fail ? '<span class="stamp no">Raté</span>' : ''}</${tag}>`;
}
function glRows(v) {
  return tbRows(v.players.map(p => { const [e, n] = tbSplit(p); return { e: `${e}<i class="glx-dot" style="background:${GL_PIECE[p.piece]}"></i>`, name: n, me: p.me,
    sub: `${p.wagons} wagons · ${p.cards} cartes · ${p.tickets} billet${p.tickets > 1 ? 's' : ''}${v.stationsOn ? ` · ${Rail.STATIONS - p.stations.length} gare${Rail.STATIONS - p.stations.length > 1 ? 's' : ''}` : ''}${p.online ? '' : ' · absent'}`, score: p.score }; }));
}
function glFinalRows(v) {
  return tbRows(v.final.map((r, i) => { const p = v.players.find(x => x.id === r.id) || r, [e, n] = tbSplit(p);
    const parts = [`lignes ${r.routes}`, `billets ${r.ticketPts >= 0 ? '+' : '−'}${Math.abs(r.ticketPts)} (${r.done}/${r.tickets.length})`, `trajet ${r.long}${r.longest ? ` +${Rail.LONGEST}` : ''}`];
    if (v.stationsOn) parts.push(`gares +${r.stationsLeft * Rail.STATION_PTS}`);
    return { e: `${e}<i class="glx-dot" style="background:${GL_PIECE[r.piece]}"></i>`, name: `${i + 1}. ${n}`, sub: parts.join(' · '), score: r.total, me: r.id === net.me }; }));
}
function glSheetBody() {
  const v = GL.last; if (!v) return '';
  if (tbSheet.kind === 'gl-log') return tbLog(v.log.slice().reverse());
  if (tbSheet.kind === 'gl-table') return glRows(v);
  if (tbSheet.kind === 'gl-lines') {
    const L = glClaimable(v);
    if (!L.length) return '<p class="tb-sheet-say">Aucune ligne à ta portée pour l’instant. Pioche des wagons.</p>';
    return `<p class="tb-sheet-say">Les lignes que ta main peut payer, les plus longues d’abord.</p><ul class="glx-lines">${L.map(({ r, pay }) => `<li><button type="button" data-gl-line="${r.id}"><span class="sw" style="background:${GL_COL[r.c]}"></span><span class="t"><b>${esc(Rail.routeName(r))}</b><small>${r.n} wagons ${GL_MOT[r.c]}${pay.loco ? ` · ${pay.loco} loco` : ''}${v.europe && r.tunnel ? ' · tunnel' : ''}</small></span><b class="pts">${Rail.PTS[r.n]}</b></button></li>`).join('')}</ul>`;
  }
  const me = v.me; if (!me) return '';
  return `<p class="tb-sheet-say">Relie les deux villes avant la fin. Un billet raté se retire de ton score.</p><div class="glx-tickets">${me.tickets.map(t => glTicket(t.id, { ok: t.ok })).join('') || '<p class="tb-sheet-say">Aucun billet.</p>'}</div>`;
}
const glOpenSheet = kind => tbSheet.open(kind, { 'gl-log': 'Ce qui s’est passé', 'gl-table': 'La table', 'gl-lines': 'Lignes possibles', 'gl-tickets': 'Tes billets' }[kind], glSheetBody);
$('#tb-sheet-body').addEventListener('click', e => {
  const b = e.target.closest('[data-gl-line]'); if (!b || tbSheet.kind !== 'gl-lines') return;
  tbSheet.close(); glPick(+b.dataset.glLine);
});
/** Les lignes que ma main peut payer maintenant. */
function glClaimable(v) {
  if (!v.me) return [];
  const eff = r => v.europe ? r : { ...r, tunnel: false, ferry: 0 };
  return Rail.R.filter(r => v.claims[r.id] == null && glBlocked(v, r) === '').map(r => ({ r, pay: Rail.payments(v.me.hand, eff(r))[0] })).filter(x => x.pay)
    .sort((a, b) => b.r.n - a.r.n || a.pay.loco - b.pay.loco);
}
function glBlocked(v, r) {
  if (v.claims[r.id] != null) { const p = v.players.find(x => x.id === v.claims[r.id]); return p?.me ? 'Elle est à toi' : `Prise par ${glNm(p || {})}`; }
  const tw = Rail.twinOf(r);
  if (tw != null && v.claims[tw] != null) { if (v.claims[tw] === net.me) return 'Tu as déjà l’autre voie'; if (!v.open2) return 'Une seule voie à moins de quatre'; }
  if (v.me && v.me.wagons < r.n) return 'Plus assez de wagons';
  return '';
}

// ---------------------------------------------------------------- le rendu
function renderRail(v) {
  if (!v) return;
  const root = $('#gl-main'), desk = tbDesk();
  if (!root.querySelector(':scope .glx-map') || GL.desk !== desk) {
    root.innerHTML = ''; root.classList.remove('desk-split'); GL.desk = desk; GL.routesKey = GL.citiesKey = '';
    ['glx-bar', 'glx-seats', 'glx-sayw', 'glx-offerw'].forEach(c => root.appendChild(el('div', c)));
    const mid = el('div', 'glx-mid'); mid.appendChild(glMapBox()); mid.appendChild(el('div', 'glx-river')); root.appendChild(mid);
    ['glx-trayw', 'glx-final', 'glx-side', 'glx-log'].forEach(c => root.appendChild(el('div', c)));
  }
  const $$ = c => root.querySelector('.' + c);
  // une nouvelle partie : on remet tout à zéro
  if (!GL.seen || v.phase === 'setup' && GL.last?.phase !== 'setup') { GL.seen = new Set(Object.keys(v.claims)); GL.sel = null; GL.gare = false; GL.city = null; }
  const fresh = Object.keys(v.claims).filter(id => !GL.seen.has(id));
  if (fresh.length) { fresh.forEach(id => { GL.seen.add(id); GL.flash.add(+id); }); setTimeout(() => { fresh.forEach(id => GL.flash.delete(+id)); GL.routesKey = ''; glRedraw(); }, 1600); }
  GL.last = v;
  const me = v.me, my = v.myTurn, mineBusy = !!(me?.offer) || (v.tunnel && v.tunnel.by === net.me);
  if (GL.sel != null && v.claims[GL.sel] != null) { GL.sel = null; GL.pay = null; }       // prise entre-temps
  if (!my || v.draws || mineBusy || !v.stationsOn) { GL.gare = false; GL.city = null; }
  const say = (list, j = 0) => list[(v.log.length + j) % list.length];
  const cur = v.players.find(p => p.id === v.currentId), C = cur ? glNm(glSeatP(cur)) : '';

  // ---------------------------------------------------------------- la ligne de partie
  const chips = [];
  if (me) chips.push(tbChip(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M9 7v10" stroke-dasharray="2 2"/></svg><b>${me.tickets.filter(t => t.ok).length}/${me.tickets.length}</b>`, () => glOpenSheet('gl-tickets'), 'Tes billets'));
  chips.push(tbChip(TB_ICON.trophy, () => glOpenSheet('gl-table'), 'La table'));
  if (v.log.length) chips.push(tbChip(TB_ICON.log, () => glOpenSheet('gl-log'), 'Ce qui s’est passé'));
  const lastTxt = v.last ? ` · <b>dernier tour</b>` : '';
  const barTxt = v.phase === 'over' ? 'Partie terminée' : me ? `<b>${v.players.find(p => p.me)?.score ?? 0}</b> pts · <b>${me.wagons}</b> wagons${lastTxt}` : `Tu regardes${lastTxt}`;
  const bar = $$('glx-bar'); bar.innerHTML = ''; bar.appendChild(tbBar(barTxt, chips));

  // ---------------------------------------------------------------- les autres, en arc
  const seats = $$('glx-seats'); seats.innerHTML = '';
  seats.appendChild(tbSeats(v.players.map(glSeatP), { currentId: v.currentId, since: v.since, badge: p => `${p.wagons}`, hot: p => p.wagons <= 8,
    cls: p => p.choosing && v.phase === 'setup' ? 'still' : '',
    under: p => `<span class="glx-sub"><i class="glx-dot" style="background:${GL_PIECE[p.piece]}"></i>${p.score} pts · ${p.cards} cartes</span>` }));

  // ---------------------------------------------------------------- le meneur
  let title = '', line = '', pip = '🚂', hot = false;
  const la = v.lastAct, laP = la ? v.players.find(p => p.id === la.by) : null, laName = laP ? glYou(laP.id, laP.name) : '';
  const laTxt = !la || !laP ? '' : la.kind === 'claim' ? `${laName} ${laP.me ? 'as pris' : 'a pris'} ${esc(Rail.routeName(Rail.R[la.r]))}.`
    : la.kind === 'tickets' ? `${laName} ${laP.me ? 'as gardé' : 'a gardé'} ${la.n} billet${la.n > 1 ? 's' : ''}.` : la.kind === 'station' ? `${laName} ${laP.me ? 'as bâti' : 'a bâti'} une gare à ${esc(Rail.nameOf(la.city))}.`
    : la.kind === 'tunnel-no' ? `${laName} ${laP.me ? 'as renoncé' : 'a renoncé'} au tunnel.` : la.card ? `${laName} ${laP.me ? 'as pris' : 'a pris'} ${la.card === 'loco' ? 'une locomotive' : 'un wagon ' + GL_NOM[la.card].toLowerCase()}.` : `${laName} ${laP.me ? 'as pioché' : 'a pioché'}.`;
  if (v.phase === 'setup') {
    if (me?.offer) { title = 'Tes billets.'; hot = true; pip = '🎟️'; line = say(['Garde-en au moins deux. Le grand rapporte gros, à condition de le finir.', 'Choisis tes destinations. Tu ne les montres à personne.']); }
    else { const w = v.players.filter(p => p.choosing).map(p => glNm(glSeatP(p))); title = !w.length ? 'C’est parti.' : w.length === 1 ? `On attend ${w[0]}.` : w.length === 2 ? `On attend ${w[0]} et ${w[1]}.` : `On attend ${w[0]} et ${w.length - 1} autres.`; line = 'Chacun choisit ses billets en secret.'; pip = '⏳'; }
  } else if (v.phase === 'play') {
    const t = v.tunnel;
    if (t) {
      const r = Rail.R[t.r], by = v.players.find(p => p.id === t.by), shown = t.shown.map(c => GL_NOM[c].toLowerCase()).join(', ');
      title = `Tunnel ${esc(Rail.routeName(r))}.`; pip = '⛰️'; hot = t.by === net.me;
      line = `Trois cartes retournées : ${shown}. ` + (t.extra ? `${t.by === net.me ? 'Il te faut' : `Il faut à ${glNm(glSeatP(by))}`} ${t.extra} carte${t.extra > 1 ? 's' : ''} de plus.` : 'Rien à ajouter.');
    } else if (my && me?.offer) { title = 'Trois billets.'; hot = true; pip = '🎟️'; line = 'Garde-en au moins un. Les autres repartent sous la pile.'; }
    else if (my && v.draws) { title = 'Encore une carte.'; hot = true; pip = '🃏'; line = (la?.by === net.me && la.kind === 'draw' && !la.card && la.got ? `Tu as tiré : ${GL_NOM[la.got].toLowerCase()}. ` : '') + 'Dans la rivière ou dans la pioche, mais pas de locomotive visible.'; }
    else if (my) { title = v.last ? 'Ton dernier tour.' : say(['À toi.', 'À toi de jouer.', 'Ton tour.']); hot = true; pip = '🚂'; line = (laTxt && la.by !== net.me ? laTxt + ' ' : '') + (v.last ? 'Fais-le compter.' : say(['Deux cartes, une ligne ou des billets.', 'Une ligne te tend les bras ?', 'Pioche, pose ou vise plus loin.'])); }
    else { title = `${C} ${cur?.bot ? 'calcule' : 'réfléchit'}.`; pip = '⏳'; line = laTxt || say(['La carte se remplit.', 'Tout le monde surveille sa ligne.']); if (v.last) line += ' Dernier tour.'; }
  } else if (v.phase === 'over' && v.final) {
    const w = v.final[0], won = w.id === net.me; title = won ? `Tu gagnes avec ${w.total} points.` : `${glNm(v.players.find(p => p.id === w.id) || w)} gagne avec ${w.total} points.`; pip = '🏆'; hot = won;
    const lg = v.final.filter(r => r.longest).map(r => glYou(r.id, r.name)); line = `Plus long trajet : ${lg.join(' et ')} (${v.final.find(r => r.longest)?.long || 0} wagons). Revanche ? Tout se passe au salon.`;
  }
  const sw = $$('glx-sayw'); sw.innerHTML = ''; sw.appendChild(tbSay({ title, line, pip, hot }));

  // ---------------------------------------------------------------- la carte : les lignes et les villes, seulement si elles ont changé
  const svg = root.querySelector('.glx-map svg');
  const rk = JSON.stringify([v.claims, GL.sel, [...GL.flash], v.europe]);
  if (rk !== GL.routesKey) { GL.routesKey = rk; svg.querySelector('.glx-routes').innerHTML = Rail.R.map(r => glRouteSVG(r, v)).join(''); }
  const ck = JSON.stringify([me?.tickets, me?.offer, v.players.map(p => p.stations), GL.city]);
  if (ck !== GL.citiesKey) { GL.citiesKey = ck; svg.querySelector('.glx-cities').innerHTML = glCitiesSVG(v); }
  svg.classList.toggle('picking', GL.sel != null); svg.classList.toggle('gare', GL.gare);

  // ---------------------------------------------------------------- la rivière, la pioche, les billets
  const canDraw = my && !mineBusy && GL.sel == null && !GL.gare && v.phase === 'play';
  const riv = $$('glx-river');
  riv.innerHTML = v.phase === 'over' ? '' : v.river.map((c, i) => c ? glCard(c, (!canDraw || (c === 'loco' && v.draws)) ? ' off' : '', `data-take="${i}" aria-label="Prendre : ${GL_NOM[c]}"${canDraw && !(c === 'loco' && v.draws) ? '' : ' aria-disabled="true"'}`) : '<span class="glx-card empty"></span>').join('')
    + `<button type="button" class="glx-card back${canDraw && v.deck ? '' : ' off'}" data-take="-1" aria-label="Piocher une carte cachée, ${v.deck} dans la pioche"><span>Pioche<small>${v.deck}</small></span></button>`;
  riv.querySelectorAll('[data-take]').forEach(b => b.onclick = () => { if (b.classList.contains('off')) return; act({ t: 'gl:draw', i: +b.dataset.take }); });

  // ---------------------------------------------------------------- le plateau de verre : ta main, puis ce que tu fais
  const trayW = $$('glx-trayw'); trayW.innerHTML = ''; const offerW = $$('glx-offerw'); offerW.innerHTML = '';
  if (me || (v.phase === 'over' && v.isHost)) {
    const body = el('div', 'glx-body'); const acts = [];
    let use = null;
    if (me && v.phase !== 'over') {
      const sel = GL.sel != null ? Rail.R[GL.sel] : null, eff = r => v.europe ? r : { ...r, tunnel: false, ferry: 0 };
      if (me.offer) {
        const key = me.offer.join(',');
        if (GL.keepKey !== key) { GL.keepKey = key; GL.keep = new Set(me.offer); }
        const box = el('div', 'glx-tickets');
        box.innerHTML = me.offer.map(id => glTicket(id, { tag: 'button', attrs: `data-tk="${id}" aria-pressed="${GL.keep.has(id)}"` })).join('');
        box.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => { const id = +b.dataset.tk; GL.keep.has(id) ? GL.keep.delete(id) : GL.keep.add(id); glRedraw(); });
        offerW.appendChild(el('p', 'glx-hint', me.keepMin > 1 ? 'Touche un billet pour le rendre. Garde-en au moins deux. Leurs villes clignotent sur la carte.' : 'Touche un billet pour le rendre. Garde-en au moins un.'));
        offerW.appendChild(box);
        const n = GL.keep.size, ok = n >= Math.min(me.keepMin, me.offer.length);
        const b = tbBtn('hero', ok ? `Garder ${n} billet${n > 1 ? 's' : ''}` : me.keepMin > 1 ? 'Garde-en au moins deux' : 'Garde-en au moins un', () => act({ t: 'gl:keep', ids: [...GL.keep] })); b.disabled = !ok; acts.push(b);
      } else if (v.tunnel && v.tunnel.by === net.me) {
        const t = v.tunnel, r = Rail.R[t.r];
        body.innerHTML = `<div class="glx-pick"><span class="sw" style="background:${GL_COL[r.c]}"></span><span class="t"><b>Tunnel ${esc(Rail.routeName(r))}</b><small>${t.extra ? `${t.extra} carte${t.extra > 1 ? 's' : ''} ${GL_MOT[t.c === 'loco' ? 'loco' : t.c]} ou locomotive${t.extra > 1 ? 's' : ''} de plus` : 'Rien à ajouter'}</small></span></div><div class="glx-shown">${t.shown.map(c => glCard(c, Rail.CARDS.includes(c) && (c === 'loco' || c === t.c) ? ' hit' : '', 'tabindex="-1"')).join('')}</div>`;
        acts.push(tbBtn('glass', 'Renoncer', () => act({ t: 'gl:tunnel', yes: false })));
        const b = tbBtn('hero', t.canPay ? (t.extra ? `Payer ${t.extra} de plus` : 'Passer le tunnel') : 'Pas assez de cartes', () => act({ t: 'gl:tunnel', yes: true })); b.disabled = !t.canPay; acts.push(b);
      } else if (sel) {
        const why = glBlocked(v, sel), pays = Rail.payments(me.hand, eff(sel));
        if (GL.pay && !pays.some(p => p.c === GL.pay)) GL.pay = null;
        const pay = pays.find(p => p.c === GL.pay) || pays[0];
        const kind = v.europe && sel.tunnel ? ' · tunnel' : v.europe && sel.ferry ? ` · ferry, ${sel.ferry} locomotive${sel.ferry > 1 ? 's' : ''}` : '';
        body.innerHTML = `<div class="glx-pick"><span class="sw" style="background:${GL_COL[sel.c]}"></span><span class="t"><b>${esc(Rail.routeName(sel))}</b><small>${sel.n} wagons ${GL_MOT[sel.c]}${kind} · ${Rail.PTS[sel.n]} points</small></span></div>`;
        if (pays.length > 1 && !why && my && !v.draws) {
          const row = el('div', 'glx-pays'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Avec quelles cartes');
          pays.slice(0, 8).forEach(p => { const b = el('button', 'glx-pay' + (p === pay ? ' on' : ''), `<span class="sw" style="background:${GL_COL[p.c === 'loco' ? 'gris' : p.c]}"></span>${p.col ? `${p.col} ${GL_NOM[p.c].toLowerCase()}` : ''}${p.col && p.loco ? ' + ' : ''}${p.loco ? `${p.loco} loco` : ''}`); b.type = 'button'; b.setAttribute('aria-pressed', String(p === pay)); b.onclick = () => { GL.pay = p.c; glRedraw(); }; row.appendChild(b); });
          body.appendChild(row);
        }
        use = pay && !why ? pay : null;
        acts.push(tbBtn('glass', 'Annuler', () => { GL.sel = null; GL.pay = null; glRedraw(); }));
        const label = why || (!my ? 'Attends ton tour' : v.draws ? 'Termine ta pioche' : !pay ? (v.europe && sel.ferry ? `Il faut ${sel.ferry} locomotive${sel.ferry > 1 ? 's' : ''}` : `Il te faut ${sel.n} cartes ${GL_MOT[sel.c]}`) : `Poser ${sel.n} wagons`);
        const b = tbBtn('hero', label, () => act({ t: 'gl:claim', r: sel.id, c: pay.c })); b.disabled = !!why || !my || !!v.draws || !pay; acts.push(b);
      } else if (GL.gare) {
        const n = me.stations.length + 1, pays = GL.city ? Rail.payments(me.hand, { n, c: 'gris', ferry: 0 }) : [];
        const taken = GL.city && v.players.some(p => p.stations.includes(GL.city));
        if (GL.pay && !pays.some(p => p.c === GL.pay)) GL.pay = null;
        const pay = pays.find(p => p.c === GL.pay) || pays[0];
        body.innerHTML = `<div class="glx-pick"><span class="sw gare"></span><span class="t"><b>${GL.city ? `Une gare à ${esc(Rail.nameOf(GL.city))}` : 'Touche une ville sur la carte'}</b><small>Elle coûte ${n} carte${n > 1 ? 's' : ''} de la même couleur. En fin de partie, elle emprunte une ligne d’un autre qui part de la ville.</small></span></div>`;
        if (pays.length > 1 && !taken) { const row = el('div', 'glx-pays'); pays.slice(0, 8).forEach(p => { const b = el('button', 'glx-pay' + (p === pay ? ' on' : ''), `<span class="sw" style="background:${GL_COL[p.c === 'loco' ? 'gris' : p.c]}"></span>${p.col ? `${p.col} ${GL_NOM[p.c].toLowerCase()}` : ''}${p.col && p.loco ? ' + ' : ''}${p.loco ? `${p.loco} loco` : ''}`); b.type = 'button'; b.onclick = () => { GL.pay = p.c; glRedraw(); }; row.appendChild(b); }); body.appendChild(row); }
        use = pay && GL.city && !taken ? pay : null;
        acts.push(tbBtn('glass', 'Annuler', () => { GL.gare = false; GL.city = null; GL.pay = null; glRedraw(); }));
        const b = tbBtn('hero', !GL.city ? 'Choisis une ville' : taken ? 'Il y a déjà une gare' : !pay ? `Il te faut ${n} cartes pareilles` : 'Bâtir la gare', () => act({ t: 'gl:station', city: GL.city, c: pay.c })); b.disabled = !use; acts.push(b);
      } else if (my && !v.draws) {
        const L = glClaimable(v);
        const lb = tbBtn('glass glx-lines-btn', L.length ? `Lignes possibles · ${L.length}` : 'Aucune ligne possible', () => glOpenSheet('gl-lines')); lb.disabled = !L.length; acts.push(lb);
        const tb = tbBtn('glass glx-tk-btn', v.ticketsLeft ? 'Piocher 3 billets' : 'Plus de billets', () => act({ t: 'gl:tickets' })); tb.disabled = !v.ticketsLeft; acts.push(tb);
        if (v.stationsOn && me.stations.length < Rail.STATIONS) acts.push(tbBtn('glass', `Une gare · ${Rail.STATIONS - me.stations.length}`, () => { GL.gare = true; GL.sel = null; GL.city = null; glRedraw(); }));
      }
      // la main : une pile par couleur ; les cartes à poser se soulèvent
      const h = me.hand, hand = el('div', 'glx-hand');
      hand.innerHTML = Rail.CARDS.filter(k => h[k] > 0).map(k => { const up = use && ((k === use.c && use.col > 0) || (k === 'loco' && use.loco > 0));
        return `<span class="glx-hc${up ? ' ok' : ''}${la?.by === net.me && (la.card || la.got) === k && Date.now() - la.at < 2500 ? ' new' : ''}">${glCard(k, '', `tabindex="-1" aria-label="${GL_NOM[k]} : ${h[k]}"`)}<b class="n">${h[k]}</b></span>`; }).join('') || '<p class="glx-hint">Pas encore de carte.</p>';
      body.prepend(hand);
    }
    if (v.phase === 'over' && v.isHost) acts.push(tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })));
    const n = me ? Rail.CARDS.reduce((a, k) => a + me.hand[k], 0) : 0;
    const tray = tbTray({ left: me && v.phase !== 'over' ? `Ta main · <b>${n}</b> carte${n > 1 ? 's' : ''}` : '', right: me && v.phase !== 'over' ? `<b>${me.wagons}</b> wagons${v.stationsOn ? ` · <b>${Rail.STATIONS - me.stations.length}</b> gares` : ''}` : '', body: me && v.phase !== 'over' ? body : null, acts });
    tray.classList.add('glx-tray');
    trayW.appendChild(tray);
  } else if (v.phase === 'over') trayW.appendChild(el('p', 'note', 'L’hôte vous ramène au salon.'));

  // ---------------------------------------------------------------- fin de partie : le classement et les billets de chacun
  const fin = $$('glx-final'); fin.innerHTML = '';
  if (v.phase === 'over' && v.final) {
    fin.appendChild(el('p', 'mj-side-title', 'Classement'));
    fin.insertAdjacentHTML('beforeend', glFinalRows(v));
    v.final.forEach(r => { const p = v.players.find(x => x.id === r.id) || r;
      fin.insertAdjacentHTML('beforeend', `<p class="mj-side-title">Les billets de ${glYou(r.id, p.name) === 'Tu' ? 'toi' : glNm(p)}</p><div class="glx-tickets small">${r.tickets.map(t => glTicket(t.id, { ok: t.ok, fail: !t.ok })).join('') || '<p class="glx-hint">Aucun billet.</p>'}</div>`); });
  }

  // ---------------------------------------------------------------- colonne de droite (PC) : la table, tes billets, le fil
  const side = $$('glx-side'); side.innerHTML = '';
  side.appendChild(el('p', 'mj-side-title', 'La table')); side.insertAdjacentHTML('beforeend', glRows(v));
  if (me && v.phase !== 'over') { side.appendChild(el('p', 'mj-side-title', 'Tes billets')); side.insertAdjacentHTML('beforeend', `<div class="glx-tickets small">${me.tickets.map(t => glTicket(t.id, { ok: t.ok })).join('') || '<p class="glx-hint">Tu choisis tes billets.</p>'}</div>`); }
  const lg = $$('glx-log'); lg.innerHTML = '';
  if (v.log.length) { lg.appendChild(el('p', 'mj-side-title', 'Ce qui s’est passé')); lg.insertAdjacentHTML('beforeend', tbLog(v.log.slice().reverse().slice(0, 12))); }
  if (tbSheet.kind?.startsWith('gl-')) tbSheet.refresh(v.phase !== 'over' || tbSheet.kind !== 'gl-lines');
  root.classList.toggle('glx-desk', desk);
}
