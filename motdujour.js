/* Le Mot du jour : trois mots par jour, les mêmes pour tout le monde, façon Motus.
   Un jeu à part de la Boîte à jeux, sans salon. Un onglet par mot (Mot 1, 2, 3), chacun avec sa grille et son
   classement. La première lettre est donnée, six lignes pour trouver ; toute suite de lettres est acceptée.
   Après trois essais ratés, on peut demander l'indice (un thème ou une courte définition) : il prend une
   ligne et met une 💡 à côté du prénom dans le classement du jour.
   Le mot ne vient jamais jusqu'ici avant la fin : chaque proposition part au serveur (functions/api/motdujour/),
   qui renvoie seulement les couleurs. Le téléphone est reconnu comme dans Miroir (prénom et emoji de l'accueil). */
'use strict';

const $ = (s, root = document) => root.querySelector(s);
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NB = ' ';
const EMOJIS = ['🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🦁', '🐵', '🐧', '🦉', '🐢', '🐝', '🦋', '🐳', '🦀', '🐨', '🐷', '🦖', '🐬', '🐻', '🦔', '🐞', '🦒', '🍕', '🍩', '🍉', '🍒', '🥑', '🌵', '🌻', '🍄', '🍀', '🔥', '⚡', '🌈', '⭐', '🌙', '🎸', '🎲', '🚀', '👻', '👽', '💎', '🎩', '👑'];
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
};
// le secret de ce téléphone, partagé avec Miroir
const tok = (() => { let t = store.get('mi-tok'); if (!/^[a-z0-9]{20}$/.test(t || '')) { t = [...crypto.getRandomValues(new Uint8Array(20))].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); store.set('mi-tok', t); } return t; })();
let myEmoji = EMOJIS.includes(store.get('dc-emo')) ? store.get('dc-emo') : EMOJIS[Math.random() * EMOJIS.length | 0];
const myName = () => (store.get('dc-name', '') || '').trim();
const REDUCE = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const TOUCH = !!(window.matchMedia && matchMedia('(hover: none)').matches);
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toUpperCase();

// thème : celui de la Boîte à jeux (clair ou sombre)
(() => { const t = store.get('dc-theme'); document.documentElement.dataset.theme = t === 'light' || t === 'lavande' ? 'light' : 'dark'; })();

let toastTimer;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }

async function api(path, data) {
  const opts = data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...data, tok, nom: myName(), emoji: myEmoji, jour: S?.jour, num: cur }) } : { cache: 'no-store' };
  const r = await fetch('/api/motdujour/' + path, opts).catch(() => null);
  if (!r) throw new Error('Pas de réseau. Vérifie ta connexion et réessaie.');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.erreur || 'Erreur ' + r.status); e.code = j.code; e.status = r.status; throw e; }
  return j;
}

// ---------------------------------------------------------------- la voix du meneur
// plusieurs répliques par situation, choisies de façon stable pour la journée
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619); return h >>> 0; };
const pick = (key, list) => list[hash((S?.jour || '') + cur + key) % list.length];
const plur = (k, mot) => `${k} ${mot}${k > 1 ? 's' : ''}`;
const affiche = m => (m || '').toLocaleUpperCase('fr-FR');

function voice() {
  const m = S.moi, n = S.n, P = S.premiere;
  if (!myName()) return ['Le Mot du jour', 'Trois mots par jour, les mêmes pour tout le monde. Dis-nous qui joue.'];
  if (!m || !m.essais.length) return [`${n} lettres, il commence par ${P}.`, pick('debut', ['Tout le monde a le même aujourd’hui.', 'Six lignes pour le trouver.', 'À toi de jouer.', 'Teste les lettres que tu veux, même sans vrai mot.'])];
  if (m.trouve) {
    const k = m.lignes;
    const say = k <= 1 ? pick('t1', [`On ne t’a rien soufflé, au moins${NB}?`, 'Chapeau bas.'])
      : k === 2 ? pick('t2', ['Du grand art.', 'Rapide comme l’éclair.'])
      : k <= 4 ? pick('t4', ['Bien joué.', 'Joli coup.', 'Propre.'])
      : pick('t6', ['Ouf, de justesse.', 'Sur le fil.', 'Il était temps.']);
    return [k <= 1 ? `Trouvé du premier coup${NB}!` : `Trouvé en ${k} essais${NB}!`, m.indice ? say + ' Avec l’indice, mais ça compte.' : say];
  }
  if (m.fini) {
    const nx = suivant();
    return ['Raté pour celui-là.', nx ? pick('perdu', [`C’était ${affiche(S.solution.affiche)}. Il te reste le mot ${nx}.`, `Le mot était ${affiche(S.solution.affiche)}. Revanche au mot ${nx}.`])
      : pick('perdu', [`Le mot était ${affiche(S.solution.affiche)}. Revanche demain.`, `C’était ${affiche(S.solution.affiche)}. Demain, tu l’auras.`])];
  }
  const reste = S.lignes - m.lignes, last = m.essais[m.essais.length - 1].c;
  const bien = [...last].filter(c => c === 'b').length, mal = [...last].filter(c => c === 'm').length;
  const title = reste === 1 ? 'Dernière ligne.' : `Encore ${reste} lignes.`;
  if (indiceDispo()) return [title, pick('pouce' + m.essais.length, [`Besoin d’un coup de pouce${NB}? L’indice te coûte une ligne.`, `Tu sèches${NB}? Il y a un indice, contre une ligne.`])];
  if (m.indice && m.indice.apres === m.essais.length) return [title, pick('ind', ['Voilà l’indice. Il t’a coûté une ligne.', 'L’indice est sur la grille. À toi.'])];
  if (bien >= n - 2) return [title, pick('brule' + m.essais.length, ['Ça brûle.', 'Tout près.', 'Il ne manque presque rien.'])];
  if (bien === 1 && !mal) return [title, pick('froid' + m.essais.length, ['Froid. Très froid.', 'Rien à garder, à part la première.'])];
  return [title, pick('suite' + m.essais.length, ['Ça se précise.', 'On avance.', 'Pas encore.', 'Ça chauffe doucement.'])];
}

// ---------------------------------------------------------------- état
// D = la journée (les trois mots), S = le mot affiché (D.mots[cur - 1])
let D = null, S = null, cur = 1, buf = [], busy = false, shown = -1, boardKey = '', armed = null, poll = null;
const main = () => $('#md-main');
// le premier mot pas encore fini après le mot affiché (puis avant), ou 0 s'ils sont tous finis
const suivant = () => { const L = D?.mots || []; for (let i = 1; i < L.length; i++) { const x = L[(cur - 1 + i) % L.length]; if (!x.moi?.fini) return x.num; } return 0; };
function setDay(d) {
  // une page en cache plus ancienne que l'API, ou l'inverse : un seul mot, alors on fait comme avant
  D = d.mots?.length ? d : { ...d, mots: [{ ...d, num: 1 }] };
  if (cur > D.mots.length) cur = 1;
  S = D.mots[cur - 1];
}
function choose(n) {
  if (!D || n === cur || !D.mots[n - 1]) return;
  cur = n; S = D.mots[n - 1]; buf = [S.premiere]; boardKey = ''; shown = -1;
  if (armed) { clearTimeout(armed); armed = null; }
  try { history.replaceState(null, '', n === 1 ? location.pathname : `?m=${n}`); } catch { }
  render();
}
const indiceDispo = () => { const m = S?.moi; return !!m && !m.fini && !m.indice && m.essais.length >= S.indiceApres && m.lignes + 1 < S.lignes; };

async function load() {
  let d; try { d = await api('jour?tok=' + tok); }
  catch (e) { return fail(e.message); }
  // le mot demandé par le lien (?m=2), sinon le premier qu'on n'a pas fini
  const want = +new URLSearchParams(location.search).get('m');
  const L = d.mots?.length ? d.mots : [d];
  cur = want >= 1 && want <= L.length ? want : (L.find(x => !x.moi?.fini)?.num || 1);
  setDay(d); buf = [S.premiere]; render(); startPoll();
}
function fail(msg) {
  const m = main(); m.innerHTML = ''; delete m.dataset.built; shown = -1; boardKey = '';
  const box = el('section', 'md-card glass', `<h2>Le Mot du jour ne répond pas</h2><p>${esc(msg)}</p><button class="btn primary" type="button">Réessayer</button>`);
  box.querySelector('button').onclick = load;
  m.appendChild(box);
}

// ---------------------------------------------------------------- la page
function build() {
  const m = main(); m.innerHTML = ''; m.dataset.built = '1';
  m.innerHTML = `
    <div class="md-play">
      <div class="md-tabs" id="md-tabs" role="tablist" aria-label="Les mots du jour"></div>
      <section class="mj-status md-status" aria-live="polite"><h1 class="mj-title" id="md-title"></h1><p class="mj-say" id="md-say"></p></section>
      <form class="md-card glass md-namebox" id="md-name" hidden>
        <div class="field"><span>Ton prénom et ton emoji</span><div class="name-row"><button class="emo-btn" type="button" aria-label="Choisir ton emoji">${myEmoji}</button><input name="nom" maxlength="14" placeholder="Prénom" autocomplete="off" required></div></div>
        <button class="btn primary lg" type="submit">C’est parti</button>
      </form>
      <div class="md-boardbox" id="md-boardbox"><div class="md-board" id="md-board"></div></div>
      <div class="md-hintbar" id="md-hintbar" hidden><button class="btn md-hintbtn" type="button" id="md-hintbtn"></button></div>
      <div class="md-kb" id="md-kb" role="group" aria-label="Clavier"></div>
      <section class="md-card glass md-end" id="md-end" hidden></section>
    </div>
    <aside class="md-side"><section class="md-card glass md-rank" id="md-rank" aria-label="Classement du jour"></section></aside>`;
  // le prénom, s'il n'est pas déjà enregistré à l'accueil
  const f = $('#md-name');
  bindEmoji(f);
  f.onsubmit = e => {
    e.preventDefault();
    const nom = f.nom.value.trim(); if (!nom) { f.nom.focus(); return; }
    store.set('dc-name', nom); store.set('dc-emo', myEmoji); render();
  };
  // le clavier, construit une fois : seules ses couleurs changent ensuite
  const kb = $('#md-kb');
  ['AZERTYUIOP', 'QSDFGHJKLM', '+WXCVBN-'].forEach(row => {
    const r = el('div', 'md-kbrow');
    [...row].forEach(k => {
      const b = el('button', 'md-key'); b.type = 'button';
      if (k === '+') { b.dataset.k = 'Enter'; b.className = 'md-key md-wide md-enter'; b.textContent = 'Valider'; }
      else if (k === '-') { b.dataset.k = 'Backspace'; b.className = 'md-key md-wide'; b.setAttribute('aria-label', 'Effacer'); b.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m16 9-6 6M10 9l6 6"/></svg>'; }
      else { b.dataset.k = k; b.textContent = k; }
      r.appendChild(b);
    });
    kb.appendChild(r);
  });
  kb.addEventListener('click', e => { const b = e.target.closest('.md-key'); if (b) press(b.dataset.k); });
  $('#md-tabs').addEventListener('click', e => { const b = e.target.closest('.md-tab'); if (b) choose(+b.dataset.n); });
  $('#md-hintbtn').onclick = askHint;
}

function bindEmoji(root) {
  const b = root.querySelector('.emo-btn'); if (!b) return;
  b.onclick = () => {
    const old = root.querySelector('.md-emo-pop'); if (old) { old.remove(); return; }
    const pop = el('div', 'md-emo-pop'); pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Emojis');
    EMOJIS.forEach(e => { const x = el('button', 'emo' + (e === myEmoji ? ' on' : ''), e); x.type = 'button'; x.onclick = () => { myEmoji = e; store.set('dc-emo', e); b.textContent = e; pop.remove(); }; pop.appendChild(x); });
    b.closest('.field').after(pop);
  };
}

function render() {
  if (!main().dataset.built) build();
  const named = !!myName(), m = S.moi, fini = !!m?.fini;
  document.documentElement.style.setProperty('--md-n', S.n);
  const [t, s] = voice(); $('#md-title').textContent = t; $('#md-say').textContent = s;
  $('#md-name').hidden = named;
  if (!named) { const f = $('#md-name'); if (!f.nom.value) setTimeout(() => f.nom.focus({ preventScroll: true }), 50); }
  $('#md-boardbox').hidden = !named;
  $('#md-kb').hidden = !named || fini;
  renderTabs(); renderBoard(); paintKeys(); renderHint(); renderEnd(); renderRank();
}

// les onglets des trois mots : où on en est sur chacun
function renderTabs() {
  const box = $('#md-tabs'), L = D.mots;
  box.hidden = L.length < 2 || !myName();
  box.innerHTML = L.map(x => {
    const m = x.moi, etat = m?.trouve ? `Trouvé en ${m.lignes}` : m?.fini ? 'Raté' : m?.essais?.length ? `${m.lignes} sur ${x.lignes}` : `${x.n} lettres`;
    const ic = m?.trouve ? '<span class="md-tab-ok" aria-hidden="true">✓</span>' : '';
    return `<button class="md-tab${x.num === cur ? ' on' : ''}${m?.trouve ? ' ok' : m?.fini ? ' ko' : ''}" type="button" role="tab" data-n="${x.num}" aria-selected="${x.num === cur}">
      <b>${ic}Mot ${x.num}</b><small>${etat}</small></button>`;
  }).join('');
}

// les lignes de la grille : les essais, l'indice à sa place, la ligne en cours, puis les lignes vides
function rows() {
  const m = S.moi, list = (m?.essais || []).map(e => ({ t: 'mot', ...e }));
  if (m?.indice) list.splice(m.indice.apres, 0, { t: 'indice', texte: m.indice.texte });
  if (!m?.fini) list.push({ t: 'saisie' });
  while (list.length < S.lignes) list.push({ t: 'vide' });
  return list.slice(0, S.lignes);
}
const ETAT = { b: 'bien placée', m: 'mal placée', a: 'absente' };
function renderBoard() {
  const list = rows(), key = JSON.stringify([S.jour, S.n, list]);
  if (key === boardKey) { paintInput(); return; }
  boardKey = key;
  const board = $('#md-board'), done = list.filter(r => r.t === 'mot' || r.t === 'indice').length;
  board.innerHTML = '';
  list.forEach((r, i) => {
    const row = el('div', 'md-row');
    const isNew = shown >= 0 && i >= shown && (r.t === 'mot' || r.t === 'indice') && !REDUCE;
    if (r.t === 'mot') {
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', `${r.mot} : ` + [...r.mot].map((L, j) => `${L} ${ETAT[r.c[j]]}`).join(', '));
      [...r.mot].forEach((L, j) => {
        const c = el('span', 'md-t md-' + r.c[j], `<i>${L}</i>`); c.setAttribute('aria-hidden', 'true');
        if (isNew) { c.classList.add('md-flip'); c.style.animationDelay = `${j * 90}ms`; }
        row.appendChild(c);
      });
    } else if (r.t === 'indice') {
      row.className = 'md-row md-hintrow' + (isNew ? ' md-pop' : '');
      row.innerHTML = `<span class="md-hint-ic" aria-hidden="true">💡</span><span class="md-hint-tx"><small>Indice</small>${esc(r.texte)}</span>`;
    } else {
      row.classList.add(r.t === 'saisie' ? 'md-input' : 'md-empty');
      for (let j = 0; j < S.n; j++) row.appendChild(el('span', 'md-t md-blank', '<i></i>'));
      if (r.t === 'saisie') { row.id = 'md-input'; row.setAttribute('aria-live', 'polite'); }
    }
    board.appendChild(row);
  });
  shown = done;
  paintInput();
}
// la ligne en cours : ce qui est tapé, sinon les lettres déjà trouvées en pâle (comme à Motus)
function paintInput() {
  const row = $('#md-input'); if (!row) return;
  const known = Array(S.n).fill(''); known[0] = S.premiere;
  (S.moi?.essais || []).forEach(e => [...e.c].forEach((c, j) => { if (c === 'b') known[j] = e.mot[j]; }));
  [...row.children].forEach((c, j) => {
    const typed = buf[j];
    c.className = 'md-t ' + (typed ? 'md-typed' : known[j] ? 'md-ghost' : 'md-blank') + (j === buf.length && !busy ? ' md-cursor' : '');
    c.firstChild.textContent = typed || known[j] || '';
  });
  row.setAttribute('aria-label', `Ta proposition : ${buf.join('')}, ${buf.length} lettres sur ${S.n}`);
}
function shake() {
  const row = $('#md-input'); if (!row || REDUCE) return;
  row.classList.remove('md-shake'); void row.offsetWidth; row.classList.add('md-shake');
}

function paintKeys() {
  const best = {}, rank = { b: 3, m: 2, a: 1 };
  (S.moi?.essais || []).forEach(e => [...e.mot].forEach((L, j) => { const c = e.c[j]; if ((rank[c] || 0) > (rank[best[L]] || 0)) best[L] = c; }));
  document.querySelectorAll('.md-key').forEach(b => {
    const k = b.dataset.k; if (k.length !== 1) return;
    b.classList.remove('md-kb-b', 'md-kb-m', 'md-kb-a');
    if (best[k]) b.classList.add('md-kb-' + best[k]);
    b.setAttribute('aria-label', best[k] ? `${k}, ${ETAT[best[k]]}` : k);
  });
}

// ---------------------------------------------------------------- jouer
function press(k) {
  if (!S || busy || !myName() || S.moi?.fini) return;
  if (k === 'Enter') return submit();
  if (k === 'Backspace') { if (buf.length > 1) buf.pop(); paintInput(); return; }
  if (!/^[A-Z]$/.test(k) || buf.length >= S.n) return;
  if (buf.length === 1 && k === S.premiere) { paintInput(); return; }   // la première lettre est déjà là : on ne la retape pas
  buf.push(k); paintInput();
}
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea')) return;
  if (e.key === 'Enter' || e.key === 'Backspace') { e.preventDefault(); press(e.key); return; }
  const k = norm(e.key); if (/^[A-Z]$/.test(k)) { e.preventDefault(); press(k); }
});

async function submit() {
  const mot = buf.join('');
  if (buf.length < S.n) { shake(); toast(`Il faut ${S.n} lettres.`); return; }
  busy = true; paintInput();
  try {
    setDay(await api('essai', { mot })); buf = [S.premiere];
    render();
  } catch (e) { onError(e, mot); }
  finally { busy = false; paintInput(); }
}
function onError(e, mot) {
  if (e.code === 'deja') { shake(); toast('Tu l’as déjà proposé.'); return; }
  if (e.code === 'lettre' || e.code === 'longueur') { shake(); toast(e.message); return; }
  if (e.code === 'jour') { toast('Minuit est passé. Nouveau jour, nouveaux mots.', 3600); boardKey = ''; shown = -1; load(); return; }
  if (e.code === 'fini' || e.code === 'course' || e.code === 'tot' || e.code === 'tard') { toast(e.message); refresh(true); return; }
  toast(e.message, 4000);
}

// l'indice : deux appuis, car il prend une ligne
function renderHint() {
  const bar = $('#md-hintbar'), b = $('#md-hintbtn'), on = !!myName() && indiceDispo();
  bar.hidden = !on; if (!on) { armed = null; return; }
  b.classList.toggle('armed', !!armed);
  b.innerHTML = armed ? 'Oui, je prends l’indice' : '<span aria-hidden="true">💡</span> Un indice<small>il compte comme un essai</small>';
}
async function askHint() {
  if (busy || !indiceDispo()) return;
  if (!armed) { armed = setTimeout(() => { armed = null; renderHint(); }, 4000); renderHint(); return; }
  clearTimeout(armed); armed = null; busy = true;
  try { setDay(await api('indice', {})); render(); }
  catch (e) { onError(e, ''); }
  finally { busy = false; renderHint(); }
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
  const box = $('#md-end'), m = S.moi;
  box.hidden = !m?.fini; if (!m?.fini) return;
  const nx = suivant(), plusieurs = D.mots.length > 1;
  box.innerHTML = `
    <div class="md-sol"><small>${plusieurs ? `Le mot ${cur}` : 'Le mot du jour'}</small><b>${esc(affiche(S.solution.affiche))}</b><span>${esc(S.solution.indice)}</span></div>
    <div class="md-acts">${nx ? `<button class="btn primary" type="button" id="md-go">Au mot ${nx}</button><button class="btn" type="button" id="md-share">Partager ma grille</button>`
      : `<button class="btn primary" type="button" id="md-share">Partager ma grille</button><a class="btn" href="./">Retour à la boîte</a>`}</div>
    ${nx ? '' : `<p class="md-next">${plusieurs ? 'Prochains mots' : 'Prochain mot'} dans <b id="md-next">${avantMinuit()}</b>.</p>`}`;
  $('#md-share').onclick = share;
  if (nx) $('#md-go').onclick = () => { choose(nx); scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' }); };
}
async function share() {
  const m = S.moi, d = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(S.jour + 'T12:00:00'));
  const lines = rows().filter(r => r.t === 'mot' || r.t === 'indice').map(r => r.t === 'indice' ? '💡' : [...r.c].map(c => ({ b: '🟥', m: '🟡', a: '🟦' }[c])).join(''));
  const text = `Le Mot du jour, ${d}${D.mots.length > 1 ? `, mot ${cur}` : ''}\n${m.trouve ? `Trouvé en ${m.lignes}` : 'Pas trouvé'}${m.indice ? ' 💡' : ''}\n${lines.join('\n')}\n${location.origin}/motdujour${cur > 1 ? `?m=${cur}` : ''}`;
  if (navigator.share && TOUCH) { try { await navigator.share({ text }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Copié. Colle-le où tu veux.'); }
  catch { toast('Copie impossible sur ce navigateur.'); }
}

// ---------------------------------------------------------------- le classement du jour
const heure = ms => { try { const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return `${+p.hour}${NB}h${NB}${p.minute}`; } catch { return ''; } };
function renderRank() {
  const box = $('#md-rank'), list = S.classement || [];
  const done = list.filter(x => x.fini), wait = list.filter(x => !x.fini);
  let rang = 0;
  const li = done.map(x => {
    if (x.trouve) rang++;
    return `<li class="md-r${x.moi ? ' moi' : ''}${x.trouve ? '' : ' rate'}">
      <span class="md-pos">${x.trouve ? rang : ''}</span>
      <span class="md-who"><span class="md-emo" aria-hidden="true">${esc(x.emoji || '🙂')}</span><b>${esc(x.nom)}</b>${x.indice ? '<span class="md-bulb" role="img" aria-label="avec l’indice">💡</span>' : ''}</span>
      <span class="md-sc">${x.trouve ? plur(x.lignes, 'essai') : 'pas trouvé'}<small>${x.fin ? heure(x.fin) : ''}</small></span></li>`;
  }).join('');
  const names = wait.map(x => esc(x.nom) + (x.indice ? ' 💡' : ''));
  box.innerHTML = `<h2>${D.mots.length > 1 ? `Classement du mot ${cur}` : 'Classement du jour'}</h2>` +
    (li ? `<ol class="md-list">${li}</ol>` : `<p class="md-none">${S.moi?.fini ? '' : 'Personne ne l’a encore trouvé.'}</p>`) +
    (names.length ? `<p class="md-wait">${names.length > 1 ? 'Cherchent encore' : 'Cherche encore'}${NB}: ${names.join(', ')}</p>` : '');
}

// ---------------------------------------------------------------- suivre la journée
async function refresh(full = false) {
  if (!S) return;
  try {
    const s = await api('jour?tok=' + tok);
    if (s.jour !== S.jour) { toast('Minuit est passé. Nouveau jour, nouveaux mots.', 3600); cur = 1; setDay(s); buf = [S.premiere]; boardKey = ''; shown = -1; render(); return; }
    const old = JSON.stringify(D.mots.map(x => x.moi)), moved = JSON.stringify(S.moi) !== JSON.stringify((s.mots?.[cur - 1] || s).moi);
    setDay(s);
    if (moved || full) { if (moved) buf = [S.premiere]; render(); }
    else { renderRank(); if (old !== JSON.stringify(D.mots.map(x => x.moi))) { renderTabs(); renderEnd(); } }
    const n = $('#md-next'); if (n) n.textContent = avantMinuit();
  } catch { }
}
function startPoll() { clearInterval(poll); poll = setInterval(() => { if (document.visibilityState === 'visible' && !busy) refresh(); }, 30000); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

load();
