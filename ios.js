/* Boîte à jeux · couche iOS 26 : ressorts, accueil façon écran d'iPhone, feuille d'un jeu.
   Chargé en dernier. Les ressorts suivent le modèle d'Apple (Designing Fluid Interfaces) : réglés par
   « réponse » (temps pour arriver) et « amortissement » (1 = sans rebond), ils partent toujours de la
   valeur affichée et gardent leur vitesse, donc on peut les interrompre et les renverser à tout moment. */
'use strict';

const REDUCE_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- ressorts
const springState = new WeakMap();
/** Anime une valeur vers « to » avec un ressort ; apply(v) l'écrit à chaque image. */
function springTo(el, key, to, { response = 0.35, damping = 0.85, velocity, from, apply }) {
  let all = springState.get(el); if (!all) springState.set(el, all = {});
  const st = all[key] || (all[key] = { x: from ?? to, v: 0, raf: 0 });
  if (from !== undefined) st.x = from;
  if (velocity !== undefined) st.v = velocity;
  st.to = to; cancelAnimationFrame(st.raf);
  if (REDUCE_MOTION.matches) { st.x = to; st.v = 0; apply(to); return Promise.resolve(); }
  const k = (2 * Math.PI / response) ** 2, c = 4 * Math.PI * damping / response;   // raideur et frottement, masse 1
  let last = performance.now();
  const eps = Math.max(0.0005, Math.abs(to - st.x) * 0.002);    // « arrivé » : à 0,2 % du trajet près
  return new Promise(done => {
    const step = now => {
      const dt = Math.min(0.034, (now - last) / 1000); last = now;
      for (let i = 0; i < 4; i++) { const h = dt / 4; st.v += (-k * (st.x - st.to) - c * st.v) * h; st.x += st.v * h; }
      apply(st.x);
      if (Math.abs(st.v) < eps * 4 && Math.abs(st.x - st.to) < eps) { st.x = st.to; apply(st.x); done(); return; }
      st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
  });
}
const springValue = (el, key) => springState.get(el)?.[key]?.x;

// l'appui : l'icône s'enfonce dès que le doigt se pose, et revient avec un léger rebond au lâcher
function pressable(root, sel, target = '.ih-ic') {
  const scaleOf = el => v => { el.style.transform = `scale(${v})`; };
  root.addEventListener('pointerdown', e => {
    const app = e.target.closest(sel); if (!app) return;
    const ic = app.querySelector(target) || app;
    springTo(ic, 's', 0.88, { response: 0.22, damping: 1, apply: scaleOf(ic) });
    const up = () => { springTo(ic, 's', 1, { response: 0.4, damping: 0.62, apply: scaleOf(ic) }); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
}

// ---------------------------------------------------------------- l'accueil
const IH_COLORS = {
  timeline: '#df6438', eclair: '#e3a619', sprint: '#2b9d6a', chromo: '#df453b', douze: '#1f9187', kems: '#7650cf', bataille: '#bf3a3a',
  poker: '#1e6c42', solitaire: '#2e7a4e', duel: '#8a683e', teldes: '#4a78dd', mirage: '#a964d6', memes: '#e0a000', limite: '#2a2a31',
  nomcode: '#b53327', sablier: '#c58d34', diapason: '#d4446c', petitbac: '#e0852b', geo: '#2b8bc5', undercover: '#3b4859',
  loupgarou: '#2c3166', naufrages: '#1592a3', camembert: '#d9a21b',
};
const IH_SHORT = { teldes: 'Téléphone', duel: 'Duel des Cités', memes: 'Mème pas vrai' };
const IH_3D = new Set(['timeline', 'bataille', 'sablier', 'poker']);   // icônes modélisées dans Blender (icons/web)
const IH_DOCK_DEFAULT = ['timeline', 'undercover', 'loupgarou', 'sablier'];
const ihStore = {
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
};

function ihGames() {
  return [...document.querySelectorAll('#s-lobby .gcard[data-game]')].map(c => ({
    key: c.dataset.game, cls: [...c.classList].find(x => x.startsWith('g-')) || '',
    name: c.querySelector('.gname')?.textContent.trim() || c.dataset.game,
    desc: c.querySelector('.gdesc')?.textContent.trim() || '',
    meta: [...c.querySelectorAll('.gmeta b, .gmeta i')].map(x => x.textContent.trim()).filter(Boolean).join(' · '),
    art: c.querySelector('.gart'),
  }));
}
function ihIcon(g, big) {
  const ic = el('span', 'ih-ic'); ic.style.setProperty('--c', IH_COLORS[g.key] || '#777');
  if (IH_3D.has(g.key)) { const im = new Image(); im.src = `icons/web/${g.key}.webp?v=${ASSET_V}`; im.alt = ''; im.decoding = 'async'; ic.appendChild(im); }
  else if (g.art) { const w = el('span', `ih-art ${g.cls}`); w.appendChild(g.art.cloneNode(true)); ic.appendChild(w); }   // la classe du jeu garde le dessin intact ; son fond est neutralisé
  return ic;
}
function ihApp(g, inDock) {
  const b = el('button', 'ih-app'); b.type = 'button'; b.dataset.game = g.key;
  b.setAttribute('aria-label', g.name);
  if (!inDock) b.setAttribute('role', 'listitem');
  b.appendChild(ihIcon(g));
  b.appendChild(el('span', 'ih-l', esc(IH_SHORT[g.key] || g.name)));
  b.onclick = () => ihOpenSheet(g);
  return b;
}
function ihBuild() {
  const games = ihGames(); if (!games.length) return;
  const grid = $('#ih-grid'), first = $('#btn-miroir');
  grid.querySelectorAll('.ih-app[data-game]').forEach(x => x.remove());
  games.forEach(g => grid.insertBefore(ihApp(g), first));
  // le dock : les jeux les plus lancés depuis ce téléphone, sinon quatre classiques
  const favs = ihStore.json('dc-favs', {});
  const order = Object.keys(favs).filter(k => games.some(g => g.key === k)).sort((a, b) => favs[b] - favs[a]);
  const pick = [...new Set([...order, ...IH_DOCK_DEFAULT])].slice(0, 4);
  const dock = $('#ih-dock'); dock.querySelectorAll('.ih-app').forEach(x => x.remove());
  pick.forEach(k => { const g = games.find(x => x.key === k); if (g) dock.appendChild(ihApp(g, true)); });
  // la date, comme en haut d'un écran d'accueil
  try { $('#ih-date').textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()); } catch { }
  ihResume();
}
function ihFav(key) { const f = ihStore.json('dc-favs', {}); f[key] = (f[key] || 0) + 1; ihStore.set('dc-favs', f); }

// reprendre le dernier salon (moins de six heures)
function ihResume() {
  const box = $('#ih-resume'), last = ihStore.json('dc-last', null);
  const fresh = last && /^[A-Z]{4}$/.test(last.code) && Date.now() - last.at < 6 * 3600e3 && !$('#f-home').classList.contains('invited');
  box.hidden = !fresh; if (!fresh) return;
  const min = Math.round((Date.now() - last.at) / 60000);
  box.innerHTML = `<span>Salon <b>${esc(last.code)}</b>, ${min < 1 ? 'à l’instant' : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`}</span>`;
  const b = el('button', 'btn small', 'Reprendre'); b.type = 'button';
  b.onclick = () => { $('#in-code').value = last.code; $('#f-home').requestSubmit($('#f-home button[data-act=join]')); };
  box.appendChild(b);
}

// ---------------------------------------------------------------- la feuille d'un jeu
let ihSheet = null, ihScrim = null, ihCur = null;
function ihMakeSheet() {
  ihScrim = el('div', 'ih-scrim'); ihScrim.hidden = true;
  ihSheet = el('div', 'ih-sheet glass glass-thick'); ihSheet.hidden = true;
  ihSheet.setAttribute('role', 'dialog'); ihSheet.setAttribute('aria-modal', 'true');
  document.body.append(ihScrim, ihSheet);
  ihScrim.onclick = () => ihCloseSheet();
  addEventListener('keydown', e => { if (e.key === 'Escape' && ihCur) ihCloseSheet(); });
  // le glisser : suit le doigt 1:1, résiste vers le haut, et décide à la lâche selon l'élan
  let start = 0, cur = 0, samples = [], dragging = false;
  const h = () => ihSheet.offsetHeight;
  const setY = y => { ihSheet.style.transform = `translateY(${y}px)`; ihScrim.style.opacity = String(Math.max(0, 1 - y / h())); };
  const rubber = (o, dim, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));
  const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);
  ihSheet.addEventListener('pointerdown', e => {
    if (e.target.closest('button, a, input')) return;
    dragging = true; ihSheet.setPointerCapture(e.pointerId);
    start = e.clientY - (springValue(ihSheet, 'y') || 0); samples = [{ y: 0, t: e.timeStamp }];
    cancelAnimationFrame(springState.get(ihSheet)?.y?.raf);
  });
  ihSheet.addEventListener('pointermove', e => {
    if (!dragging) return;
    let dy = e.clientY - start; if (dy < 0) dy = -rubber(-dy, h());
    cur = dy; setY(dy); const st = springState.get(ihSheet)?.y; if (st) st.x = dy;
    samples.push({ y: dy, t: e.timeStamp }); if (samples.length > 5) samples.shift();
  });
  const end = () => {
    if (!dragging) return; dragging = false;
    const a = samples[0], b = samples[samples.length - 1];
    const v = b && a && b.t > a.t ? (b.y - a.y) / ((b.t - a.t) / 1000) : 0;
    if (cur + project(v) > h() * 0.5 || v > 900) ihCloseSheet(v);
    else springTo(ihSheet, 'y', 0, { from: cur, velocity: v, response: 0.3, damping: 0.8, apply: setY });
  };
  ihSheet.addEventListener('pointerup', end); ihSheet.addEventListener('pointercancel', end);
  ihSheet._setY = setY;
}
function ihOpenSheet(g) {
  if (!ihSheet) ihMakeSheet();
  ihCur = g; ihSheet.innerHTML = '';
  ihSheet.setAttribute('aria-label', g.name);
  ihSheet.append(el('div', 'ih-grab'), ihIcon(g, true), el('h2', '', esc(g.name)), el('p', '', esc(g.desc)), el('div', 'ih-meta', esc(g.meta)));
  const acts = el('div', 'ih-acts');
  const go = el('button', 'btn primary lg', `Créer une partie de ${esc(g.name)}`); go.type = 'button';
  go.onclick = () => {
    const name = $('#in-name').value.trim();
    ihCloseSheet();
    if (!name) { $('#in-name').focus(); toast('Ton prénom d’abord, puis on lance la partie.'); return; }
    window.pendingPick = g.key; ihFav(g.key);
    $('#f-home').requestSubmit($('#f-home button[data-act=create]'));
  };
  const rules = el('button', 'btn lg', 'Les règles'); rules.type = 'button';
  rules.onclick = () => { ihCloseSheet(); openRules(); setTimeout(() => document.getElementById(`r-${g.key}`)?.scrollIntoView({ block: 'start' }), 60); };
  acts.append(go, rules); ihSheet.appendChild(acts);
  ihScrim.hidden = false; ihSheet.hidden = false;
  const H = ihSheet.offsetHeight;
  springTo(ihSheet, 'y', 0, { from: H, response: 0.34, damping: 0.86, apply: ihSheet._setY });
  go.focus({ preventScroll: true });
}
function ihCloseSheet(velocity = 0) {
  if (!ihSheet || ihSheet.hidden) return;
  const H = ihSheet.offsetHeight; ihCur = null;
  springTo(ihSheet, 'y', H + 20, { velocity, response: 0.3, damping: 1, apply: ihSheet._setY })
    .then(() => { if (!ihCur) { ihSheet.hidden = true; ihScrim.hidden = true; } });
}

// ---------------------------------------------------------------- branchements
pressable(document, '.ih-app');
ihBuild();
// le salon retient son code pour « Reprendre » à l'accueil, et chaque jeu lancé compte dans les favoris
setInterval(() => { if (net.code && view && !net.kicked) ihStore.set('dc-last', { code: net.code, at: Date.now() }); }, 20000);
document.addEventListener('click', e => { const c = e.target.closest('#s-lobby .gcard[data-game]'); if (c && isHostPlayer()) ihFav(c.dataset.game); });
