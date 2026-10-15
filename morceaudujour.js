/* Le Morceau du jour : trois chansons par jour, les mêmes pour tout le monde, façon Heardle.
   Un jeu à part de la Boîte à jeux, sans salon. Un onglet par chanson (Morceau 1, 2, 3), chacun avec son classement.
   On entend 1 seconde du début de l'extrait ; chaque essai raté (ou « Passer ») en fait entendre plus : 2, 4, 7, 11, 16 s.
   Six essais. Le titre se choisit dans la liste de toutes les chansons de la boîte (functions/api/morceau/ liste).
   La chanson ne vient jamais jusqu'ici avant la fin : l'extrait passe par le serveur (/api/morceau/audio, sans son
   adresse), chaque essai est vérifié là-bas, et le titre n'arrive qu'à la fin. Joueur reconnu comme dans Miroir. */
'use strict';

const $ = (s, root = document) => root.querySelector(s);
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NB = ' ';
const EMOJIS = ['🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🦁', '🐵', '🐧', '🦉', '🐢', '🐝', '🦋', '🐳', '🦀', '🐨', '🐷', '🦖', '🐬', '🐻', '🦔', '🐞', '🦒', '🍕', '🍩', '🍉', '🍒', '🥑', '🌵', '🌻', '🍄', '🍀', '🔥', '⚡', '🌈', '⭐', '🌙', '🎸', '🎲', '🚀', '👻', '👽', '💎', '🎩', '👑'];
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
};
// le secret de ce téléphone, partagé avec Miroir et le Mot du jour
const tok = (() => { let t = store.get('mi-tok'); if (!/^[a-z0-9]{20}$/.test(t || '')) { t = [...crypto.getRandomValues(new Uint8Array(20))].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); store.set('mi-tok', t); } return t; })();
let myEmoji = EMOJIS.includes(store.get('dc-emo')) ? store.get('dc-emo') : EMOJIS[Math.random() * EMOJIS.length | 0];
const myName = () => (store.get('dc-name', '') || '').trim();
const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const TOUCH = !!(window.matchMedia && matchMedia('(hover: none)').matches);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(() => { const t = store.get('dc-theme'); document.documentElement.dataset.theme = t === 'light' || t === 'lavande' ? 'light' : 'dark'; })();

let toastTimer;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }

async function api(path, data) {
  const opts = data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, tok, nom: myName(), emoji: myEmoji, jour: D?.jour, num: cur }) } : { cache: 'no-store' };
  const r = await fetch('/api/morceau/' + path, opts).catch(() => null);
  if (!r) throw new Error('Pas de réseau. Vérifie ta connexion et réessaie.');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.erreur || 'Erreur ' + r.status); e.code = j.code; e.status = r.status; throw e; }
  return j;
}

// ---------------------------------------------------------------- la voix du meneur
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; };
const pick = (key, list) => list[hash((D?.jour || '') + cur + key) % list.length];
const sec = s => `${s}${NB}s`;
const ecoute = () => S.ecoutes[Math.min(S.ecoutes.length - 1, S.moi?.essais?.length || 0)];   // ce qu'on entend maintenant
const reste = () => S.ecoutes.length - (S.moi?.essais?.length || 0);

function voice() {
  const m = S.moi;
  if (!myName()) return ['Le Morceau du jour', 'Trois chansons par jour, les mêmes pour tout le monde. Dis-nous qui joue.'];
  if (!m || !m.essais.length) return ['Une seconde pour commencer.', pick('debut', ['Appuie sur lecture, et monte le son.', 'Tout le monde a la même aujourd’hui.', 'Tu sèches ? Passe, tu en entendras plus.'])];
  if (m.trouve) {
    const k = m.essais.length, s = m.secondes;
    const say = k === 1 ? pick('t1', ['Une seule seconde. Respect.', 'Oreille absolue.']) : k <= 3 ? pick('t3', ['Bien joué.', 'Joli coup.', 'Propre.']) : pick('t6', ['Ouf, de justesse.', 'Sur le fil.', 'Il était temps.']);
    return [s === 1 ? `Trouvé en une seconde${NB}!` : `Trouvé en ${sec(s)}${NB}!`, say];
  }
  if (m.fini) {
    const nx = suivant(), t = `«${NB}${S.solution.titre}${NB}» de ${S.solution.artiste}`;
    return ['Raté pour celui-là.', nx ? `C’était ${t}. Il te reste le morceau ${nx}.` : `C’était ${t}. Revanche demain.`];
  }
  const last = m.essais[m.essais.length - 1].r, n = reste(), title = n === 1 ? 'Dernier essai.' : `Encore ${n} essais.`;
  if (last === 'artiste') return [title, pick('art' + n, ['Bon artiste, mauvaise chanson.', 'C’est le bon artiste. Mais pas ce titre.'])];
  if (last === 'passe') return [title, pick('pass' + n, [`Voilà ${sec(ecoute())}. Ça te dit quelque chose${NB}?`, `${sec(ecoute())} d’écoute, maintenant.`])];
  return [title, pick('faux' + n, [`Non. Écoute ${sec(ecoute())}, cette fois.`, `Raté. Voilà ${sec(ecoute())}.`, 'Pas celle-là.'])];
}

// ---------------------------------------------------------------- état
// D = la journée (les trois chansons), S = celle qu'on regarde (D.morceaux[cur - 1])
let D = null, S = null, cur = 1, busy = false, poll = null, liste = null, choisi = null, rowsKey = '', rowsAt = { k: '', n: 0 }, skipArmed = null;
const main = () => $('#mo-main');
const suivant = () => { const L = D?.morceaux || []; for (let i = 1; i < L.length; i++) { const x = L[(cur - 1 + i) % L.length]; if (!x.moi?.fini) return x.num; } return 0; };
function setDay(d) { D = d; if (cur > D.morceaux.length) cur = 1; S = D.morceaux[cur - 1]; }
function choose(n) {
  if (!D || n === cur || !D.morceaux[n - 1]) return;
  stop(); cur = n; S = D.morceaux[n - 1]; choisi = null; rowsKey = '';
  const i = $('#mo-q'); if (i) i.value = '';
  try { history.replaceState(null, '', n === 1 ? location.pathname : `?m=${n}`); } catch { }
  render(); prefetch();
}

async function load() {
  let d; try { d = await api('jour?tok=' + tok); }
  catch (e) { return fail(e.message); }
  const want = +new URLSearchParams(location.search).get('m');
  cur = want >= 1 && want <= d.morceaux.length ? want : (d.morceaux.find(x => !x.moi?.fini)?.num || 1);
  setDay(d); render(); startPoll(); prefetch();
  api('liste').then(l => { liste = l.l.map(([k, t, a]) => ({ k, t, a, q: norm(t + ' ' + a), qt: norm(t) })); }).catch(() => { });
}
function fail(msg) {
  const m = main(); m.innerHTML = ''; delete m.dataset.built;
  const box = el('section', 'mo-card glass', `<h2>Le Morceau du jour ne répond pas</h2><p>${esc(msg)}</p><button class="btn primary" type="button">Réessayer</button>`);
  box.querySelector('button').onclick = load;
  m.appendChild(box);
}

// ---------------------------------------------------------------- le son : l'extrait est chargé une fois (blob), puis joué par morceaux
const audio = () => $('#mo-audio');
const blobs = {};
let raf = 0, stopT = 0, limite = 0;
function prefetch(n = cur) {
  if (blobs[n]) return blobs[n];
  blobs[n] = fetch('/api/morceau/audio?n=' + n).then(r => { if (!r.ok) throw new Error(); return r.blob(); }).then(b => URL.createObjectURL(b));
  blobs[n].catch(() => { delete blobs[n]; });
  return blobs[n];
}
async function play(full = false) {
  const a = audio();
  if (!a.paused) { stop(); return; }
  let src; try { src = await prefetch(); } catch { toast('L’extrait ne se charge pas. Réessaie.'); return; }
  if (a.dataset.src !== src) { a.src = src; a.dataset.src = src; }
  limite = full ? 0 : ecoute();
  try { a.currentTime = 0; await a.play(); }
  catch { toast('Appuie encore sur lecture.'); return; }
  paintPlay(true);
  // l'arrêt suit la position réelle dans l'extrait (le son met parfois un instant à partir) ; la minuterie n'est qu'un filet
  clearTimeout(stopT); if (limite) stopT = setTimeout(stop, limite * 1000 + 2500);
  const tick = () => {
    const t = a.currentTime, max = full ? (a.duration || 30) : S.ecoutes[S.ecoutes.length - 1];
    const f = $(full ? '#mo-endbar i' : '#mo-fill'); if (f) f.style.width = Math.min(100, t / max * 100) + '%';
    if (limite && t >= limite) { stop(); return; }
    if (a.paused) { stop(); return; }
    raf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}
function stop() {
  const a = audio(); if (a && !a.paused) a.pause();
  cancelAnimationFrame(raf); clearTimeout(stopT);
  document.querySelectorAll('#mo-fill, #mo-endbar i').forEach(f => { f.style.width = '0'; });
  paintPlay(false);
}
function paintPlay(on) {
  document.querySelectorAll('.mo-play').forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-label', on ? 'Arrêter' : b.dataset.label); });
}

// ---------------------------------------------------------------- la page
const PLAY = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path class="pl" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/><g class="st" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></g></svg>';
function build() {
  const m = main(); m.innerHTML = ''; m.dataset.built = '1';
  m.innerHTML = `
    <div class="mo-play-col">
      <div class="mo-tabs" id="mo-tabs" role="tablist" aria-label="Les morceaux du jour"></div>
      <section class="mj-status mo-status" aria-live="polite"><h1 class="mj-title" id="mo-title"></h1><p class="mj-say" id="mo-say"></p></section>
      <form class="mo-card glass mo-namebox" id="mo-name" hidden>
        <div class="field"><span>Ton prénom et ton emoji</span><div class="name-row"><button class="emo-btn" type="button" aria-label="Choisir ton emoji">${myEmoji}</button><input name="nom" maxlength="14" placeholder="Prénom" autocomplete="off" required></div></div>
        <button class="btn primary lg" type="submit">C’est parti</button>
      </form>
      <section class="mo-player" id="mo-player" aria-label="L’extrait">
        <button class="mo-play" id="mo-playbtn" type="button" data-label="Écouter" aria-label="Écouter">${PLAY}</button>
        <div class="mo-barbox">
          <div class="mo-bar" id="mo-bar" aria-hidden="true"><b class="mo-unl" id="mo-unl"></b><i class="mo-fill" id="mo-fill"></i></div>
          <div class="mo-scale"><span id="mo-now"></span><span>16${NB}s</span></div>
        </div>
      </section>
      <ol class="mo-rows" id="mo-rows" aria-label="Tes essais"></ol>
      <div class="mo-guess" id="mo-guess">
        <div class="mo-search"><input id="mo-q" type="search" placeholder="Le titre ou l’artiste…" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" aria-label="Le titre ou l’artiste"><ul class="mo-sugg" id="mo-sugg" role="listbox" hidden></ul></div>
        <div class="mo-acts"><button class="btn mo-skip" type="button" id="mo-skip"></button><button class="btn primary" type="button" id="mo-ok" disabled>Valider</button></div>
      </div>
      <section class="mo-card glass mo-end" id="mo-end" hidden></section>
    </div>
    <aside class="mo-side"><section class="mo-card glass mo-rank" id="mo-rank" aria-label="Classement"></section></aside>`;
  const f = $('#mo-name');
  bindEmoji(f);
  f.onsubmit = e => {
    e.preventDefault();
    const nom = f.nom.value.trim(); if (!nom) { f.nom.focus(); return; }
    store.set('dc-name', nom); store.set('dc-emo', myEmoji); render();
  };
  $('#mo-tabs').addEventListener('click', e => { const b = e.target.closest('.mo-tab'); if (b) choose(+b.dataset.n); });
  $('#mo-playbtn').onclick = () => play(false);
  const q = $('#mo-q');
  q.addEventListener('input', () => { choisi = null; suggest(); paintOk(); });
  q.addEventListener('focus', () => { suggest(); if (TOUCH) setTimeout(() => q.scrollIntoView({ block: 'start', behavior: REDUCE ? 'auto' : 'smooth' }), 250); });
  q.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return; e.preventDefault();
    if (!choisi) { const first = $('#mo-sugg .mo-s:not([disabled])'); if (first) first.click(); }
    else submit(choisi.k);
  });
  $('#mo-sugg').addEventListener('click', e => {
    const b = e.target.closest('.mo-s'); if (!b || b.disabled) return;
    choisi = liste.find(x => x.k === b.dataset.k); q.value = `${choisi.t} — ${choisi.a}`;
    $('#mo-sugg').hidden = true; paintOk();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.mo-search')) $('#mo-sugg').hidden = true; });
  $('#mo-skip').onclick = () => submit(null);
  $('#mo-ok').onclick = () => { if (choisi) submit(choisi.k); };
}

function bindEmoji(root) {
  const b = root.querySelector('.emo-btn'); if (!b) return;
  b.onclick = () => {
    const old = root.querySelector('.mo-emo-pop'); if (old) { old.remove(); return; }
    const pop = el('div', 'mo-emo-pop'); pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Emojis');
    EMOJIS.forEach(e => { const x = el('button', 'emo' + (e === myEmoji ? ' on' : ''), e); x.type = 'button'; x.onclick = () => { myEmoji = e; store.set('dc-emo', e); b.textContent = e; pop.remove(); }; pop.appendChild(x); });
    b.closest('.field').after(pop);
  };
}

function render() {
  if (!main().dataset.built) build();
  const named = !!myName(), m = S.moi, fini = !!m?.fini;
  const [t, s] = voice(); $('#mo-title').textContent = t; $('#mo-say').textContent = s;
  $('#mo-name').hidden = named;
  if (!named) { const f = $('#mo-name'); if (!f.nom.value) setTimeout(() => f.nom.focus({ preventScroll: true }), 50); }
  $('#mo-player').hidden = !named || fini;
  $('#mo-rows').hidden = !named;
  $('#mo-guess').hidden = !named || fini;
  renderTabs(); renderPlayer(); renderRows(); renderEnd(); renderRank(); paintOk();
}

function renderTabs() {
  const box = $('#mo-tabs'), L = D.morceaux;
  box.hidden = !myName();
  box.innerHTML = L.map(x => {
    const m = x.moi, etat = m?.trouve ? `Trouvé en ${sec(m.secondes)}` : m?.fini ? 'Raté' : m?.essais?.length ? `${m.essais.length} sur ${x.ecoutes.length}` : 'À écouter';
    return `<button class="mo-tab${x.num === cur ? ' on' : ''}${m?.trouve ? ' ok' : m?.fini ? ' ko' : ''}" type="button" role="tab" data-n="${x.num}" aria-selected="${x.num === cur}">
      <b>${m?.trouve ? '<span class="mo-tab-ok" aria-hidden="true">✓</span>' : ''}Morceau ${x.num}</b><small>${etat}</small></button>`;
  }).join('');
}

// la barre : la partie qu'on a le droit d'entendre, et les crans 1, 2, 4, 7, 11 s
function renderPlayer() {
  if (S.moi?.fini) return;
  const max = S.ecoutes[S.ecoutes.length - 1], e = ecoute();
  $('#mo-unl').style.width = (e / max * 100) + '%';
  const bar = $('#mo-bar');
  bar.querySelectorAll('.mo-tick').forEach(x => x.remove());
  S.ecoutes.slice(0, -1).forEach(s => { const t = el('span', 'mo-tick' + (s <= e ? ' on' : '')); t.style.left = (s / max * 100) + '%'; bar.appendChild(t); });
  $('#mo-now').textContent = e === 1 ? '1 seconde' : `${e} secondes`;
  $('#mo-playbtn').dataset.label = `Écouter ${e === 1 ? '1 seconde' : e + ' secondes'}`;
  if (audio().paused) $('#mo-playbtn').setAttribute('aria-label', $('#mo-playbtn').dataset.label);
}

// les six essais : passé, faux, bon artiste, trouvé ; puis les lignes vides
const RES = { passe: ['⏭', 'Passé'], faux: ['✗', ''], artiste: ['◐', 'bon artiste'], ok: ['✓', ''] };
function renderRows() {
  const list = S.moi?.essais || [], at = D.jour + '#' + cur, key = JSON.stringify([at, list]);
  if (key === rowsKey) return;
  const before = rowsAt.k === at ? rowsAt.n : list.length;     // n'anime que les essais qui viennent d'arriver
  rowsKey = key; rowsAt = { k: at, n: list.length };
  const box = $('#mo-rows'); box.innerHTML = '';
  for (let i = 0; i < S.ecoutes.length; i++) {
    const r = list[i], li = el('li', 'mo-row' + (r ? ' mo-' + r.r : ' mo-vide'));
    if (r) {
      const [ic, tag] = RES[r.r];
      li.innerHTML = `<span class="mo-ic" aria-hidden="true">${ic}</span><span class="mo-tx">${r.r === 'passe' ? 'Passé' : `<b>${esc(r.titre)}</b> <small>${esc(r.artiste)}</small>`}</span>${tag && r.r !== 'passe' ? `<em>${tag}</em>` : ''}<span class="mo-s-sec">${sec(S.ecoutes[i])}</span>`;
      if (i >= before && !REDUCE) li.classList.add('mo-pop');
    } else li.innerHTML = `<span class="mo-ic" aria-hidden="true"></span><span class="mo-tx"></span><span class="mo-s-sec">${sec(S.ecoutes[i])}</span>`;
    box.appendChild(li);
  }
}

// la recherche du titre : dans le titre et l'artiste, sans accents, tous les mots tapés doivent y être
function suggest() {
  const ul = $('#mo-sugg'), q = norm($('#mo-q').value);
  if (!liste || q.length < 2 || choisi) { ul.hidden = true; return; }
  const words = q.split(' '), deja = new Set((S.moi?.essais || []).map(e => e.titre + '|' + e.artiste));
  const found = liste.filter(x => words.every(w => x.q.includes(w)))
    .sort((a, b) => (b.qt.startsWith(q) - a.qt.startsWith(q)) || a.t.localeCompare(b.t, 'fr')).slice(0, 7);
  ul.innerHTML = found.length ? found.map(x => `<li><button class="mo-s" type="button" role="option" data-k="${esc(x.k)}"${deja.has(x.t + '|' + x.a) ? ' disabled' : ''}><b>${esc(x.t)}</b><small>${esc(x.a)}</small></button></li>`).join('')
    : '<li class="mo-s-none">Pas dans la boîte. Essaie un autre mot.</li>';
  ul.hidden = false;
}
function paintOk() {
  const ok = $('#mo-ok'), skip = $('#mo-skip'); if (!ok || !S) return;
  ok.disabled = !choisi || busy;
  const n = S.moi?.essais?.length || 0, next = S.ecoutes[Math.min(S.ecoutes.length - 1, n + 1)];
  skip.disabled = busy;
  skip.innerHTML = reste() === 1 ? 'Abandonner' : `Passer <small>+${next - ecoute()}${NB}s</small>`;
}

async function submit(k) {
  if (busy || !S || S.moi?.fini) return;
  if (k === null && reste() === 1 && !skipArmed) { skipArmed = setTimeout(() => { skipArmed = null; }, 3000); toast('Encore une fois pour abandonner.'); return; }
  busy = true; paintOk(); stop();
  try {
    setDay(await api('essai', { cle: k }));
    choisi = null; $('#mo-q').value = ''; $('#mo-sugg').hidden = true;
    render();
    const r = S.moi?.essais?.at(-1)?.r;
    if (r && r !== 'ok' && !S.moi.fini && TOUCH) $('#mo-q').blur();
  } catch (e) {
    if (e.code === 'deja' || e.code === 'inconnu') toast(e.message);
    else if (e.code === 'jour') { toast('Minuit est passé. Nouveau jour, nouveaux morceaux.', 3600); load(); }
    else if (e.code === 'fini' || e.code === 'course') { toast(e.message); refresh(true); }
    else toast(e.message, 4000);
  } finally { busy = false; skipArmed = null; paintOk(); }
}

// ---------------------------------------------------------------- la fin
function avantMinuit() {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
    const s = 86400 - (+p.hour * 3600 + +p.minute * 60 + +p.second), h = Math.floor(s / 3600), mn = Math.ceil((s % 3600) / 60);
    return h ? `${h}${NB}h${NB}${String(mn === 60 ? 59 : mn).padStart(2, '0')}` : `${Math.max(1, mn)}${NB}min`;
  } catch { return 'quelques heures'; }
}
function renderEnd() {
  const box = $('#mo-end'), m = S.moi;
  box.hidden = !m?.fini; if (!m?.fini) { box.innerHTML = ''; return; }
  const so = S.solution, nx = suivant();
  if (box.dataset.k === D.jour + cur + JSON.stringify(m)) { const n = $('#mo-next'); if (n) n.textContent = avantMinuit(); return; }
  box.dataset.k = D.jour + cur + JSON.stringify(m);
  box.innerHTML = `
    <div class="mo-sol">
      ${so.pochette ? `<img class="mo-art" src="${esc(so.pochette)}" alt="" width="96" height="96">` : '<span class="mo-art"></span>'}
      <div><small>Le morceau ${cur}</small><b>${esc(so.titre)}</b><span>${esc(so.artiste)}${so.annee ? ` · ${so.annee}` : ''}</span></div>
    </div>
    <div class="mo-full"><button class="mo-play mo-play-sm" type="button" id="mo-fullbtn" data-label="Écouter en entier" aria-label="Écouter en entier">${PLAY}</button><div class="mo-endbar" id="mo-endbar"><i></i></div><span>En entier</span></div>
    <div class="mo-acts2">${nx ? `<button class="btn primary" type="button" id="mo-go">Au morceau ${nx}</button><button class="btn" type="button" id="mo-share">Partager ma grille</button>`
      : `<button class="btn primary" type="button" id="mo-share">Partager ma grille</button><a class="btn" href="./">Retour à la boîte</a>`}</div>
    ${nx ? '' : `<p class="mo-next">Prochains morceaux dans <b id="mo-next">${avantMinuit()}</b>.</p>`}`;
  $('#mo-fullbtn').onclick = () => play(true);
  $('#mo-share').onclick = share;
  if (nx) $('#mo-go').onclick = () => { choose(nx); scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' }); };
}
async function share() {
  const m = S.moi, d = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(D.jour + 'T12:00:00'));
  const cases = S.ecoutes.map((_, i) => { const r = m.essais[i]?.r; return r ? { passe: '⬛', faux: '🟥', artiste: '🟨', ok: '🟩' }[r] : '⬜'; }).join('');
  const text = `Le Morceau du jour, ${d}, morceau ${cur}\n🔊${cases}\n${m.trouve ? (m.secondes === 1 ? 'Trouvé en une seconde' : `Trouvé en ${m.secondes} s`) : 'Pas trouvé'}\n${location.origin}/morceaudujour${cur > 1 ? `?m=${cur}` : ''}`;
  if (navigator.share && TOUCH) { try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Copié. Colle-le où tu veux.'); }
  catch { toast('Copie impossible sur ce navigateur.'); }
}

// ---------------------------------------------------------------- le classement de la chanson
const heure = ms => { try { const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return `${+p.hour}${NB}h${NB}${p.minute}`; } catch { return ''; } };
function renderRank() {
  const box = $('#mo-rank'), list = S.classement || [];
  const done = list.filter(x => x.fini), wait = list.filter(x => !x.fini);
  let rang = 0;
  const li = done.map(x => {
    if (x.trouve) rang++;
    return `<li class="mo-r${x.moi ? ' moi' : ''}${x.trouve ? '' : ' rate'}">
      <span class="mo-pos">${x.trouve ? rang : '<span class="mo-x" role="img" aria-label="pas trouvé">✗</span>'}</span>
      <span class="mo-who"><span class="mo-emo" aria-hidden="true">${esc(x.emoji || '🙂')}</span><b>${esc(x.nom)}</b></span>
      <span class="mo-sc">${x.trouve ? sec(x.secondes) : 'Pas trouvé'}<small>${x.fin ? heure(x.fin) : ''}</small></span></li>`;
  }).join('');
  const names = wait.map(x => esc(x.nom));
  box.innerHTML = `<h2>Classement du morceau ${cur}</h2>` +
    (li ? `<ol class="mo-list">${li}</ol>` : `<p class="mo-none">${S.moi?.fini ? '' : 'Personne ne l’a encore trouvé.'}</p>`) +
    (names.length ? `<p class="mo-wait">${names.length > 1 ? 'Cherchent encore' : 'Cherche encore'}${NB}: ${names.join(', ')}</p>` : '');
}

// ---------------------------------------------------------------- suivre la journée
async function refresh(full = false) {
  if (!D) return;
  try {
    const s = await api('jour?tok=' + tok);
    if (s.jour !== D.jour) { toast('Minuit est passé. Nouveau jour, nouveaux morceaux.', 3600); stop(); cur = 1; for (const k in blobs) delete blobs[k]; setDay(s); rowsKey = ''; render(); prefetch(); return; }
    const old = JSON.stringify(D.morceaux.map(x => x.moi)), moved = JSON.stringify(S.moi) !== JSON.stringify(s.morceaux[cur - 1].moi);
    setDay(s);
    if (moved || full) render();
    else { renderRank(); if (old !== JSON.stringify(D.morceaux.map(x => x.moi))) { renderTabs(); renderEnd(); } }
  } catch { }
}
function startPoll() { clearInterval(poll); poll = setInterval(() => { if (document.visibilityState === 'visible' && !busy && audio().paused) refresh(); }, 30000); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); else stop(); });

load();
