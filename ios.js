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
// la vitesse au moment de lâcher : seulement les 100 dernières ms (un doigt qui s'est arrêté avant de lâcher n'a plus d'élan)
function releaseVelocity(samples, now) {
  const recent = samples.filter(p => now - p.t < 100);
  if (recent.length < 2) return 0;
  const a = recent[0], b = recent[recent.length - 1];
  return b.t > a.t ? (b.y - a.y) / ((b.t - a.t) / 1000) : 0;
}

// l'appui : l'icône s'enfonce dès que le doigt se pose, et revient avec un léger rebond au lâcher
function pressable(root, sel, target = '.ih-ic', depth = 0.88) {
  const scaleOf = el => v => { el.style.transform = v === 1 ? '' : `scale(${v})`; };
  root.addEventListener('pointerdown', e => {
    const app = e.target.closest(sel); if (!app || app.disabled) return;
    const ic = (target && app.querySelector(target)) || app;
    springTo(ic, 's', depth, { response: 0.22, damping: 1, apply: scaleOf(ic) });
    const up = () => { springTo(ic, 's', 1, { response: 0.4, damping: 0.62, apply: scaleOf(ic) }); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
}

// ---------------------------------------------------------------- l'accueil
const IH_COLORS = {
  timeline: '#df6438', eclair: '#e3a619', sprint: '#2b9d6a', chromo: '#df453b', douze: '#1f9187', kems: '#7650cf', bataille: '#bf3a3a',
  poker: '#1e6c42', solitaire: '#2e7a4e', duel: '#8a683e', teldes: '#4a78dd', mirage: '#a964d6', memes: '#e0a000', limite: '#55555f',
  nomcode: '#b53327', sablier: '#c58d34', diapason: '#d4446c', petitbac: '#e0852b', geo: '#2b8bc5', undercover: '#3b4859',
  loupgarou: '#2c3166', naufrages: '#1592a3', camembert: '#d9a21b', unseulindice: '#8a3576', menteur: '#9a5a2c',
};
const ihStore = {
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
};

function ihIcon(g, big) {
  const ic = el('span', 'ih-ic'); ic.style.setProperty('--c', IH_COLORS[g.key] || '#777');
  const flat = () => { if (!g.art) return; const w = el('span', `ih-art ${g.cls}`); w.appendChild(g.art.cloneNode(true)); ic.appendChild(w); };   // la classe du jeu garde le dessin intact ; son fond est neutralisé
  const im = new Image(); im.alt = ''; im.decoding = 'async';
  im.onerror = () => { im.remove(); flat(); };
  im.src = `icons/web/${g.key}.webp?v=${ASSET_V}`; ic.appendChild(im);
  return ic;
}
function ihBuild() {
  // la date, comme en haut d'un écran d'accueil
  try { $('#ih-date').textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()); } catch { }
  ihResume();
  ihMotDuJour();
}

// le Mot du jour : la longueur, la première lettre, les premiers du classement (le jeu vit sur motdujour.html)
async function ihMotDuJour() {
  const box = $('#ih-mdj'); if (!box) return;
  let tok = null; try { tok = localStorage.getItem('mi-tok'); } catch { }
  let s = null;
  try { const r = await fetch('/api/motdujour/jour' + (tok ? '?tok=' + tok : ''), { cache: 'no-store' }); if (r.ok) s = await r.json(); } catch { }
  if (!s || !s.n) { box.hidden = true; return; }      // pas de fonctions (serveur de test) : pas de widget
  const nb = ' ', moi = s.moi, top = (s.classement || []).filter(x => x.trouve).slice(0, 3);
  $('#ih-mdj-meta').textContent = moi?.trouve ? `Trouvé en ${moi.lignes}` : moi?.fini ? 'Raté aujourd’hui' : `${s.n} lettres`;
  $('#ih-mdj-tiles').innerHTML = Array.from({ length: s.n }, (_, i) => `<i${i ? '' : ' class="on"'}>${i ? '' : esc(s.premiere)}</i>`).join('');
  $('#ih-mdj-list').innerHTML = top.length
    ? `<ol class="ih-mdj-list">${top.map((x, i) => `<li><span>${i + 1}</span><span><b>${esc(x.emoji || '')} ${esc(x.nom)}</b>${x.indice ? ' 💡' : ''}</span><span>${x.lignes} essai${x.lignes > 1 ? 's' : ''}</span></li>`).join('')}</ol>`
    : `<p class="ih-mdj-none">${s.classement?.length ? 'Personne ne l’a encore trouvé.' : `Personne n’a encore joué. À toi${nb}?`}</p>`;
  $('#ih-mdj-go').textContent = moi?.fini ? 'Voir le classement' : moi?.essais?.length ? 'Reprendre' : 'Jouer';
  box.hidden = false;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#s-home').hidden) ihMotDuJour(); });

// l'entrée en deux temps : choisir « rejoindre » ou « créer », puis seulement les champs de ce choix
function ihStep(step) {
  const f = $('#f-home'); f.dataset.step = step; $('#home-err').textContent = '';
  if (step === 'join') ($('#in-code').value.length === 4 ? $('#in-name') : $('#in-code')).focus({ preventScroll: true });
  if (step === 'create') ($('#in-name').value.trim() ? f.querySelector('button[data-act=create]') : $('#in-name')).focus({ preventScroll: true });
  if (step === 'choice') f.querySelector('.ih-pick')?.focus({ preventScroll: true });
}
document.querySelectorAll('#f-home .ih-pick').forEach(b => b.onclick = () => ihStep(b.dataset.go));
$('#ih-back').onclick = () => { if ($('#f-home').classList.contains('invited')) $('#btn-own').click(); ihStep('choice'); };
// une erreur (prénom manquant, code faux) doit rester visible : on montre l'étape « rejoindre » si on était au choix
new MutationObserver(() => { const f = $('#f-home'); if ($('#home-err').textContent && f.dataset.step === 'choice') f.dataset.step = 'join'; })
  .observe($('#home-err'), { childList: true, characterData: true, subtree: true });

// reprendre le dernier salon (moins de six heures)
function ihResume() {
  const box = $('#ih-resume'), last = ihStore.json('dc-last', null);
  const fresh = last && /^[A-Z]{4}$/.test(last.code) && Date.now() - last.at < 6 * 3600e3 && !$('#f-home').classList.contains('invited');
  box.hidden = !fresh; if (!fresh) return;
  const min = Math.round((Date.now() - last.at) / 60000);
  box.innerHTML = `<span>Salon <b>${esc(last.code)}</b>, ${min < 1 ? 'à l’instant' : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`}</span>`;
  const b = el('button', 'btn small', 'Reprendre'); b.type = 'button';
  b.onclick = () => { $('#in-code').value = last.code; $('#f-home').dataset.step = 'join'; $('#f-home').requestSubmit($('#f-home button[data-act=join]')); };
  box.appendChild(b);
}

// ---------------------------------------------------------------- branchements
pressable(document, '.ih-app');
ihBuild();
// le salon retient son code pour « Reprendre » à l'accueil
setInterval(() => { if (net.code && view && !net.kicked) ihStore.set('dc-last', { code: net.code, at: Date.now() }); }, 20000);

// ---------------------------------------------------------------- le salon
// un seul fond d'écran pour l'accueil et le salon
document.body.prepend(el('div', 'ios-wall'));
// la liste des jeux prend les icônes 3D (le dessin plat reste en secours)
document.querySelectorAll('#games .gcard[data-game]').forEach(c => {
  const g = { key: c.dataset.game, cls: [...c.classList].find(x => x.startsWith('g-')) || '', art: c.querySelector('.gart') };
  c.prepend(ihIcon(g));
});
pressable(document, '#games .gcard');
// les cartes des mains en éventail (table.js) s'enfoncent un peu sous le doigt
pressable(document, '.tb-slot > *', null, 0.94);
// les boutons de l'appli s'enfoncent à peine (4 %), comme les boutons d'iOS
pressable(document, '#s-lobby .btn, .screen.play .btn, #s-end .btn, .modal .btn, .ih-widget .btn, .ih-pick', null, 0.97);

// le contrôle segmenté des familles : la pastille glisse d'une famille à l'autre sur un ressort
(function segmented() {
  const bar = document.getElementById('gfilters'); if (!bar) return;
  const pill = el('span', 'gf-pill'); pill.setAttribute('aria-hidden', 'true'); bar.prepend(pill);
  let x = 0, w = 0;
  const paint = () => { pill.style.transform = `translateX(${x}px)`; pill.style.width = `${w}px`; };
  const place = (animate = true) => {
    const b = bar.querySelector('.gfilter[aria-pressed="true"]'); if (!b || !b.offsetWidth) return;
    const tx = b.offsetLeft, tw = b.offsetWidth;
    if (!animate || !pill.dataset.ok) { x = tx; w = tw; pill.dataset.ok = '1'; paint(); return; }
    springTo(pill, 'x', tx, { from: x, response: 0.36, damping: 0.78, apply: v => { x = v; paint(); } });
    springTo(pill, 'w', tw, { from: w, response: 0.36, damping: 0.78, apply: v => { w = v; paint(); } });
  };
  bar.addEventListener('click', e => { if (e.target.closest('.gfilter')) requestAnimationFrame(() => place(true)); });
  new ResizeObserver(() => place(false)).observe(bar);
})();

// ---------------------------------------------------------------- les feuilles de l'appli (.modal > .sheet)
// app.js ne fait que basculer « hidden ». On l'observe : à l'ouverture, la feuille monte sur un ressort ;
// à la fermeture, la fenêtre reste affichée le temps qu'elle redescende (classe ios-closing), puis disparaît.
// On peut la tirer vers le bas par sa poignée : elle suit le doigt, résiste vers le haut, et part avec l'élan.
const SHEET_WIDE = matchMedia('(min-width: 760px)');
let sheetVel = 0;
function sheetPaint(m, p) {
  const s = m.querySelector('.sheet'), H = s.offsetHeight || 400;
  m.style.setProperty('--so', String(Math.max(0, Math.min(1, p))));
  if (SHEET_WIDE.matches) { s.style.transform = `translateY(${(1 - p) * 26}px) scale(${0.95 + 0.05 * p})`; s.style.opacity = String(Math.max(0, Math.min(1, p * 1.4))); }
  else { s.style.transform = `translateY(${(1 - p) * (H + 24)}px)`; s.style.opacity = ''; }
}
const closeBtnOf = m => m.querySelector('.sheet-top button');
function sheetSetup(m) {
  const s = m.querySelector('.sheet'); if (!s || m._ios) return; m._ios = true;
  const grab = el('div', 'ih-grab'); grab.setAttribute('aria-hidden', 'true'); s.prepend(grab);
  let opened = !m.hidden;
  new MutationObserver(() => {
    if (!m.hidden && !opened) {                      // ouverture
      opened = true; m.classList.remove('ios-closing');
      springTo(m, 'p', 1, { from: springValue(m, 'p') ?? 0, response: SHEET_WIDE.matches ? 0.3 : 0.38, damping: SHEET_WIDE.matches ? 0.82 : 0.88, apply: p => sheetPaint(m, p) });
    } else if (m.hidden && opened) {                 // fermeture : on la laisse redescendre
      opened = false; m.classList.add('ios-closing');
      const H = s.offsetHeight || 400, v = -sheetVel / H; sheetVel = 0;
      springTo(m, 'p', 0, { velocity: v, response: 0.3, damping: 1, apply: p => sheetPaint(m, p) })
        .then(() => { if (!opened) m.classList.remove('ios-closing'); });
    }
  }).observe(m, { attributes: true, attributeFilter: ['hidden'] });
  // le glisser, depuis la poignée ou l'en-tête
  let start = 0, cur = 0, samples = [], dragging = false;
  const rubber = (o, dim, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));
  const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);
  s.addEventListener('pointerdown', e => {
    if (SHEET_WIDE.matches || !e.target.closest('.sheet-top, .ih-grab') || e.target.closest('button, a, input, select')) return;
    e.preventDefault();                             // pas de sélection de texte : elle déclencherait un glisser-déposer natif
    dragging = true; s.setPointerCapture(e.pointerId); start = e.clientY; cur = 0; samples = [{ y: 0, t: e.timeStamp }];
    cancelAnimationFrame(springState.get(m)?.p?.raf);
  });
  s.addEventListener('pointermove', e => {
    if (!dragging) return;
    const H = s.offsetHeight; let dy = e.clientY - start; if (dy < 0) dy = -rubber(-dy, H);
    cur = dy; const p = 1 - dy / (H + 24); sheetPaint(m, p); const st = springState.get(m)?.p; if (st) st.x = p;
    samples.push({ y: dy, t: e.timeStamp }); if (samples.length > 5) samples.shift();
  });
  const end = e => {
    if (!dragging) return; dragging = false;
    const H = s.offsetHeight, v = e.type === 'pointercancel' ? 0 : releaseVelocity(samples, e.timeStamp);   // geste annulé : elle revient
    if (e.type !== 'pointercancel' && (cur + project(v) > H * 0.45 || v > 900)) { sheetVel = v; closeBtnOf(m)?.click(); }
    else springTo(m, 'p', 1, { from: 1 - cur / (H + 24), velocity: -v / (H + 24), response: 0.3, damping: 0.8, apply: p => sheetPaint(m, p) });
  };
  s.addEventListener('pointerup', end); s.addEventListener('pointercancel', end);
  if (opened) sheetPaint(m, 1);
}
document.querySelectorAll('.modal').forEach(sheetSetup);
// Échap ferme la feuille du dessus, comme son bouton
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal:not([hidden])')].pop();
  if (open) { e.preventDefault(); closeBtnOf(open)?.click(); return; }
  if (!$('#s-home').hidden && $('#f-home').dataset.step !== 'choice' && !$('#f-home').classList.contains('invited')) ihStep('choice');
});
