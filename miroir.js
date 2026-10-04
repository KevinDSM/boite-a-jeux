/* Miroir : qui te connaît le mieux ?
   Un jeu à part de la Boîte à jeux, sans salon en direct : chacun joue de son côté, à son rythme.
   1. Quelqu'un crée la partie : il reçoit le code à partager et un code hôte, gardé pour lui.
   2. Chacun s'inscrit avec le code. Quand tout le monde est là, l'hôte ferme la liste.
   3. 25 questions à deux pôles. Pour chacune, on place sa propre barre, puis là où l'on pense que
      chaque autre a mis la sienne.
   4. Quand l'hôte le décide, il lance le résultat et reçoit un code des résultats à envoyer à tous :
      qui connaît le mieux qui, qui est le plus facile à deviner, et toutes les réponses.
   Les données vivent dans la base Cloudflare (functions/api/miroir/). Les questions sont tirées côté
   serveur ; un participant ne reçoit jamais les réponses des autres avant le résultat. */
'use strict';

const $ = (s, root = document) => root.querySelector(s);
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NB = ' ';
const EMOJIS = ['🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🦁', '🐵', '🐧', '🦉', '🐢', '🐝', '🦋', '🐳', '🦀', '🐨', '🐷', '🦖', '🐬', '🐻', '🦔', '🐞', '🦒', '🍕', '🍩', '🍉', '🍒', '🥑', '🌵', '🌻', '🍄', '🍀', '🔥', '⚡', '🌈', '⭐', '🌙', '🎸', '🎲', '🚀', '👻', '👽', '💎', '🎩', '👑'];
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
};
const tok = (() => { let t = store.get('mi-tok'); if (!/^[a-z0-9]{20}$/.test(t || '')) { t = [...crypto.getRandomValues(new Uint8Array(20))].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); store.set('mi-tok', t); } return t; })();
let myEmoji = EMOJIS.includes(store.get('dc-emo')) ? store.get('dc-emo') : EMOJIS[Math.random() * EMOJIS.length | 0];
const myName = () => store.get('dc-name', '');

// thème : celui de la Boîte à jeux (clair ou sombre)
(() => { const t = store.get('dc-theme'); document.documentElement.dataset.theme = t === 'light' || t === 'lavande' ? 'light' : 'dark'; })();

let toastTimer;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
function ask(title, text, ok = 'Confirmer') {
  return new Promise(res => {
    const d = $('#mr-confirm'); $('#mr-c-title').textContent = title; $('#mr-c-text').textContent = text; $('#mr-c-ok').textContent = ok;
    d.querySelectorAll('button').forEach(b => b.onclick = () => { d.close(); res(b.value === 'oui'); });
    d.showModal();
  });
}

// ---------------------------------------------------------------- réseau
async function api(path, data) {
  const r = await fetch('/api/miroir/' + path, data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : { cache: 'no-store' }).catch(() => null);
  if (!r) throw new Error('Pas de réseau. Vérifie ta connexion et réessaie.');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.erreur || 'Erreur ' + r.status); e.status = r.status; throw e; }
  return j;
}

// les parties de ce téléphone, pour y revenir depuis l'accueil de Miroir
const mine = () => store.json('mi-parties', []);
function remember(code, extra = {}) {
  const list = mine().filter(p => p.code !== code);
  const old = mine().find(p => p.code === code) || {};
  list.unshift({ ...old, code, quand: Date.now(), ...extra });
  store.set('mi-parties', JSON.stringify(list.slice(0, 12)));
}
const hostOf = code => mine().find(p => p.code === code)?.hote || null;

// ---------------------------------------------------------------- navigation
const params = new URLSearchParams(location.search);
let poll = null, cur = null;
function go(q) { history.pushState(null, '', q ? '?' + q : location.pathname); route(); }
window.addEventListener('popstate', () => route());
function stopPoll() { clearInterval(poll); poll = null; }
function route() {
  stopPoll(); cur = null;
  const p = new URLSearchParams(location.search);
  const h = (p.get('h') || '').toUpperCase(), c = (p.get('c') || '').toUpperCase(), r = (p.get('r') || '').toUpperCase();
  if (r) return showResults({ r });
  if (h) return openHost(h);
  if (c) return openGame(c);
  home();
}
const main = () => $('#mr-main');
const crumb = t => { $('#mr-crumb').textContent = t; document.title = t === 'Miroir' ? 'Miroir · Boîte à jeux' : `${t} · Miroir`; };

// ---------------------------------------------------------------- accueil de Miroir
async function home() {
  crumb('Miroir');
  const m = main(); m.innerHTML = '';
  m.appendChild(el('section', 'mr-hero', `
    <div class="mr-mark" aria-hidden="true"><span>🪞</span></div>
    <span class="eyebrow">Boîte à jeux</span>
    <h1>Miroir</h1>
    <p class="lede">Qui te connaît le mieux${NB}? Chacun répond pour soi, puis devine où chacun des autres a placé la barre.</p>
    <ol class="mr-steps">
      <li><b>Crée la partie</b> et envoie le code à tes amis.</li>
      <li><b>Chacun s’inscrit</b>, puis répond à 25 questions, de son côté, quand il veut.</li>
      <li><b>Tu lances le résultat</b> quand tout le monde a fini${NB}: qui connaît le mieux qui.</li>
    </ol>`));

  const themes = await api('themes').catch(() => ({ themes: [] }));
  const create = el('form', 'mr-card mr-create');
  create.innerHTML = `<h2>Créer une partie</h2>
    <div class="field"><span>Ton prénom et ton emoji</span><div class="name-row"><button class="emo-btn" type="button" aria-label="Choisir ton emoji">${myEmoji}</button><input name="nom" maxlength="14" placeholder="Prénom" autocomplete="off" required value="${esc(myName())}"></div></div>
    <fieldset class="mr-cats"><legend>Les thèmes des questions</legend>${themes.themes.map(t => `<label><input type="checkbox" value="${t.id}" checked>${esc(t.nom)}</label>`).join('')}</fieldset>
    <button class="btn primary lg" type="submit">Créer la partie</button>
    <p class="err" role="alert"></p>`;
  bindEmoji(create);
  create.onsubmit = async e => {
    e.preventDefault();
    const nom = create.nom.value.trim(), cats = [...create.querySelectorAll('.mr-cats input:checked')].map(i => i.value), errBox = create.querySelector('.err');
    if (!nom) { errBox.textContent = 'Il faut un prénom.'; return; }
    if (cats.length < 2) { errBox.textContent = 'Garde au moins deux thèmes.'; return; }
    store.set('dc-name', nom);
    const b = create.querySelector('button[type=submit]'); b.disabled = true;
    try {
      const r = await api('creer', { nom, emoji: myEmoji, cats, tok });
      remember(r.code, { hote: r.hote, nom });
      go('h=' + r.hote);
    } catch (ex) { errBox.textContent = ex.message; b.disabled = false; }
  };
  m.appendChild(create);

  const join = el('form', 'mr-card');
  join.innerHTML = `<h2>Rejoindre une partie</h2><p class="fine">Le code à cinq lettres que l’hôte t’a envoyé.</p>
    <div class="join-row"><input name="code" maxlength="5" placeholder="Code" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Code de la partie" class="mr-code-in"><button class="btn" type="submit">Rejoindre</button></div>`;
  join.code.oninput = () => { join.code.value = join.code.value.toUpperCase().replace(/[^A-Z]/g, ''); };
  join.onsubmit = e => { e.preventDefault(); const c = join.code.value; if (c.length === 5) go('c=' + c); else toast('Le code fait cinq lettres.'); };
  m.appendChild(join);

  const res = el('form', 'mr-card');
  res.innerHTML = `<h2>Voir des résultats</h2><p class="fine">Le code à six lettres envoyé par l’hôte quand il a lancé le résultat.</p>
    <div class="join-row"><input name="code" maxlength="6" placeholder="Code" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Code des résultats" class="mr-code-in"><button class="btn" type="submit">Voir</button></div>`;
  res.code.oninput = () => { res.code.value = res.code.value.toUpperCase().replace(/[^A-Z]/g, ''); };
  res.onsubmit = e => { e.preventDefault(); const c = res.code.value; if (c.length === 6) go('r=' + c); else toast('Le code des résultats fait six lettres.'); };
  m.appendChild(res);

  const list = mine();
  if (list.length) {
    const box = el('section', 'mr-card mr-mine', '<h2>Tes parties</h2><div class="mr-list"></div>');
    const ul = box.querySelector('.mr-list');
    list.forEach(p => {
      const row = el('button', 'mr-row-link'); row.type = 'button';
      row.innerHTML = `<span><b>${esc(p.code)}</b><small>${p.hote ? 'tu es l’hôte' : 'participant'} · ${new Date(p.quand).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small></span><span aria-hidden="true">›</span>`;
      row.onclick = () => go(p.hote ? 'h=' + p.hote : 'c=' + p.code);
      ul.appendChild(row);
    });
    m.appendChild(box);
  }
}

function bindEmoji(root) {
  const b = root.querySelector('.emo-btn'); if (!b) return;
  b.onclick = () => {
    const pop = el('div', 'mr-emo-pop'); pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Emojis');
    EMOJIS.forEach(e => { const x = el('button', 'emo' + (e === myEmoji ? ' on' : ''), e); x.type = 'button'; x.onclick = () => { myEmoji = e; store.set('dc-emo', e); b.textContent = e; pop.remove(); }; pop.appendChild(x); });
    const old = root.querySelector('.mr-emo-pop'); if (old) { old.remove(); return; }
    b.closest('.field').after(pop);
  };
}

// ---------------------------------------------------------------- une partie
async function openHost(h) {
  crumb('Miroir');
  try {
    const s = await api(`hote?h=${h}&tok=${tok}`);
    remember(s.code, { hote: h });
    cur = { code: s.code, hote: h, s };
    renderGame();
    startPoll();
  } catch (e) { fail(e.message); }
}
async function openGame(code) {
  crumb('Miroir');
  const h = hostOf(code);
  if (h) return openHost(h);
  try {
    const s = await api(`etat?c=${code}&tok=${tok}`);
    cur = { code, s };
    if (s.moi) remember(code);
    renderGame();
    startPoll();
  } catch (e) { fail(e.message); }
}
async function refresh() {
  if (!cur) return;
  try {
    const s = cur.hote ? await api(`hote?h=${cur.hote}&tok=${tok}`) : await api(`etat?c=${cur.code}&tok=${tok}`);
    const changed = JSON.stringify([s.phase, s.participants, s.moi, s.resultat]) !== JSON.stringify([cur.s.phase, cur.s.participants, cur.s.moi, cur.s.resultat]);
    cur.s = s;
    if (changed && !cur.answering) renderGame();
    else if (changed && cur.answering && s.phase !== 'reponses') renderGame();
  } catch { }
}
function startPoll() { stopPoll(); poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5000); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
function fail(msg) {
  const m = main(); m.innerHTML = '';
  m.appendChild(el('section', 'mr-card', `<h2>Partie introuvable</h2><p>${esc(msg)}</p><button class="btn primary" type="button">Retour à Miroir</button>`)).querySelector('button').onclick = () => go('');
}

const isHost = () => !!cur?.hote;
const meP = () => cur.s.participants.find(p => p.pid === cur.s.moi);
const who = p => `<span class="mr-emo" aria-hidden="true">${esc(p.emoji || '·')}</span>${esc(p.nom)}`;

function renderGame() {
  const s = cur.s, m = main(); m.innerHTML = ''; cur.answering = false;
  crumb(`Miroir · ${s.code}`);
  const head = el('section', 'mr-head', `<span class="eyebrow">Partie de ${esc(s.createur)}</span><h1>Miroir</h1>`);
  m.appendChild(head);
  if (s.phase === 'inscriptions') return renderSignup(m);
  if (s.phase === 'reponses') {
    const me = meP();
    if (me && !me.fini) return renderQuestion(m);
    return renderWaiting(m);
  }
  return renderResultsGate(m);
}

// --- inscriptions
function renderSignup(m) {
  const s = cur.s, me = meP();
  if (isHost()) m.appendChild(shareBox());
  if (!me) {
    const f = el('form', 'mr-card');
    f.innerHTML = `<h2>Inscris-toi</h2><p class="fine">Ton prénom, tel que tes amis te connaissent.</p>
      <div class="field"><div class="name-row"><button class="emo-btn" type="button" aria-label="Choisir ton emoji">${myEmoji}</button><input name="nom" maxlength="14" placeholder="Prénom" autocomplete="off" required value="${esc(myName())}"></div></div>
      <button class="btn primary lg" type="submit">Je m’inscris</button><p class="err" role="alert"></p>`;
    bindEmoji(f);
    f.onsubmit = async e => {
      e.preventDefault(); const nom = f.nom.value.trim(); if (!nom) return;
      store.set('dc-name', nom);
      try { await api('inscrire', { c: s.code, nom, emoji: myEmoji, tok }); remember(s.code); await refresh(); renderGame(); }
      catch (ex) { f.querySelector('.err').textContent = ex.message; }
    };
    m.appendChild(f);
  } else {
    m.appendChild(el('section', 'mr-status', `<h3 class="mr-title">${isHost() ? 'On attend les autres.' : 'Tu es inscrit.'}</h3>
      <p class="mr-say">${isHost() ? 'Envoie le code. Quand tout le monde est inscrit, ferme la liste pour ouvrir les questions.' : `L’hôte ouvrira les questions quand tout le monde sera là. Tu peux fermer cette page et revenir avec le code ${s.code}.`}</p>`));
  }
  const list = el('section', 'mr-card');
  list.innerHTML = `<h2>${s.participants.length} inscrit${s.participants.length > 1 ? 's' : ''}</h2><div class="mr-people"></div>`;
  const box = list.querySelector('.mr-people');
  s.participants.forEach(p => {
    const row = el('div', 'mr-person', `<span>${who(p)}${p.pid === s.moi ? ' <i>toi</i>' : ''}${p.pid === s.createurPid ? ' <i>hôte</i>' : ''}</span>`);
    if (isHost() && p.pid !== s.createurPid) {
      const x = el('button', 'btn ghost small', 'Retirer'); x.type = 'button';
      x.onclick = async () => { if (await ask(`Retirer ${p.nom}`, `${p.nom} disparaît de la liste. Il pourra se réinscrire tant que la liste est ouverte.`, 'Retirer')) { await hostAct('retirer', { pid: p.pid }); } };
      row.appendChild(x);
    }
    box.appendChild(row);
  });
  m.appendChild(list);
  if (isHost()) {
    const b = el('button', 'btn primary lg mr-cta', 'Fermer la liste et ouvrir les questions'); b.type = 'button';
    b.disabled = s.participants.length < 2;
    b.onclick = async () => {
      if (await ask('Fermer la liste', `${s.participants.map(p => p.nom).join(', ')} : personne ne pourra plus s’inscrire. Chacun pourra répondre aux 25 questions.`, 'Fermer et ouvrir')) await hostAct('fermer');
    };
    m.appendChild(b);
    if (b.disabled) m.appendChild(el('p', 'fine mr-center', 'Il faut au moins deux inscrits, toi compris.'));
    m.appendChild(hostCodeBox());
  }
}
async function hostAct(action, extra = {}) {
  try { const r = await api('hote', { h: cur.hote, action, ...extra }); await refresh(); renderGame(); return r; }
  catch (e) { toast(e.message, 3600); return null; }
}
function linkFor(q) { return `${location.origin}${location.pathname}?${q}`; }
function shareBox() {
  const s = cur.s, url = linkFor('c=' + s.code);
  const box = el('section', 'mr-card mr-share');
  box.innerHTML = `<h2>Le code à envoyer</h2><div class="mr-bigcode">${esc(s.code)}</div><p class="fine">${esc(url.replace(/^https?:\/\//, ''))}</p>
    <div class="mr-acts"><button class="btn primary" type="button" data-a="share">Envoyer le lien</button><button class="btn" type="button" data-a="copy">Copier le lien</button></div>`;
  const text = `${s.createur} t’invite à jouer à Miroir : qui te connaît le mieux${NB}? Code ${s.code} : ${url}`;
  box.querySelector('[data-a=share]').hidden = !navigator.share;
  box.querySelector('[data-a=share]').onclick = () => navigator.share({ title: 'Miroir', text, url }).catch(() => { });
  box.querySelector('[data-a=copy]').onclick = () => navigator.clipboard.writeText(url).then(() => toast('Lien copié'), () => toast('Copie impossible'));
  return box;
}
function hostCodeBox() {
  const box = el('section', 'mr-card mr-hostcode');
  box.innerHTML = `<h2>Ton code hôte</h2><div class="mr-bigcode small">${esc(cur.hote)}</div>
    <p class="fine">Garde-le pour toi${NB}: il sert à fermer la liste et à lancer le résultat. Ce téléphone s’en souvient. Pour gérer la partie ailleurs, ouvre Miroir avec ce lien.</p>
    <button class="btn small" type="button">Copier le lien hôte</button>`;
  box.querySelector('button').onclick = () => navigator.clipboard.writeText(linkFor('h=' + cur.hote)).then(() => toast('Lien hôte copié. Ne l’envoie à personne.'), () => toast('Copie impossible'));
  return box;
}

// --- le questionnaire
const draftKey = () => `mi-draft-${cur.code}`;
function renderQuestion(m, index) {
  const s = cur.s, qs = s.questions, me = meP();
  cur.answering = true;
  const answered = s.mesReponses || {};
  const draft = store.json(draftKey(), {});
  let i = index ?? qs.findIndex((_, k) => !answered[k]);
  if (i < 0) i = qs.length - 1;
  const q = qs[i];
  const order = [me, ...s.participants.filter(p => p.pid !== me.pid)];
  const vals = { ...(answered[i] || {}), ...(draft[i] || {}) };

  const wrap = el('section', 'mr-q');
  const done = Object.keys(answered).length;
  wrap.innerHTML = `<p class="mj-meta">Question ${i + 1} sur ${qs.length} · ${esc(q.cn)}</p>
    <div class="mr-prog" aria-hidden="true"><i style="width:${(done / qs.length) * 100}%"></i></div>
    <h2 class="mr-question">${esc(q.q)}</h2>
    <div class="mr-board">
      <div class="mr-poles"><span></span><span class="mr-pole l">${esc(q.l)}</span><span class="mr-pole r">${esc(q.r)}</span></div>
      <div class="mr-rows"></div>
    </div>
    <p class="mr-hint" aria-live="polite"></p>
    <div class="mr-nav"><button class="btn ghost" type="button" data-a="prev">Précédente</button><button class="btn primary lg" type="button" data-a="next"></button></div>`;
  const rows = wrap.querySelector('.mr-rows');
  order.forEach((p, k) => {
    const r = el('div', 'mr-row' + (k === 0 ? ' me' : '')); r.dataset.pid = p.pid; r.dataset.nom = p.nom;
    r.innerHTML = `<span class="mr-who">${who(p)}${k === 0 ? '<small>ta réponse</small>' : ''}</span>`;
    r.appendChild(slider(vals[p.pid], v => { vals[p.pid] = v; const d = store.json(draftKey(), {}); d[i] = { ...(d[i] || {}), [p.pid]: v }; store.set(draftKey(), JSON.stringify(d)); update(); },
      k === 0 ? `Ta réponse : ${q.q}` : `Où ${p.nom} a mis la barre : ${q.q}`));
    rows.appendChild(r);
  });
  const next = wrap.querySelector('[data-a=next]'), hint = wrap.querySelector('.mr-hint'), last = i === qs.length - 1;
  function update() {
    const missing = order.filter(p => vals[p.pid] === undefined).length;
    next.disabled = missing > 0;
    next.textContent = last ? 'Envoyer mes réponses' : 'Suivante';
    hint.textContent = missing ? (vals[me.pid] === undefined ? 'Place ta barre, puis celle de chacun.' : `Encore ${missing} barre${missing > 1 ? 's' : ''} à placer.`) : '';
  }
  update();
  const prev = wrap.querySelector('[data-a=prev]'); prev.disabled = i === 0;
  prev.onclick = () => { main().innerHTML = ''; main().appendChild(headFor()); renderQuestion(main(), i - 1); window.scrollTo(0, 0); };
  next.onclick = async () => {
    next.disabled = true;
    try {
      await api('repondre', { c: s.code, tok, q: i, v: vals });
      cur.s.mesReponses = { ...(cur.s.mesReponses || {}), [i]: { ...vals } };
      const d = store.json(draftKey(), {}); delete d[i]; store.set(draftKey(), JSON.stringify(d));
      const remaining = qs.findIndex((_, k) => !cur.s.mesReponses[k]);
      if (remaining < 0 || last) {
        if (remaining >= 0) { main().innerHTML = ''; main().appendChild(headFor()); renderQuestion(main(), remaining); toast('Il reste des questions sans réponse.'); return; }
        await api('terminer', { c: s.code, tok }); toast('Réponses envoyées');
        await refresh(); renderGame(); window.scrollTo(0, 0); return;
      }
      main().innerHTML = ''; main().appendChild(headFor()); renderQuestion(main(), i + 1); window.scrollTo(0, 0);
    } catch (e) { toast(e.message, 3600); next.disabled = false; }
  };
  m.appendChild(wrap);
  if (isHost()) { const b = el('button', 'btn ghost mr-center', 'Voir où en est chacun'); b.type = 'button'; b.onclick = () => { cur.answering = false; main().innerHTML = ''; main().appendChild(headFor()); renderWaiting(main()); }; m.appendChild(b); }
}
function headFor() { return el('section', 'mr-head', `<span class="eyebrow">Partie de ${esc(cur.s.createur)}</span><h1>Miroir</h1>`); }

// un curseur : on touche ou glisse sur la ligne ; vide tant qu'on n'a rien placé ; flèches au clavier
function slider(value, onChange, label) {
  const t = el('div', 'mr-track' + (value === undefined ? ' unset' : ''));
  t.tabIndex = 0; t.setAttribute('role', 'slider'); t.setAttribute('aria-label', label);
  t.setAttribute('aria-valuemin', '0'); t.setAttribute('aria-valuemax', '100');
  t.innerHTML = '<i class="mr-mid" aria-hidden="true"></i><span class="mr-thumb" aria-hidden="true"></span><span class="mr-tap" aria-hidden="true">Touche la ligne</span>';
  const thumb = t.querySelector('.mr-thumb');
  const set = (v, fire = true) => {
    v = Math.max(0, Math.min(100, Math.round(v)));
    t.classList.remove('unset'); thumb.style.left = `calc(var(--pad) + (100% - 2 * var(--pad)) * ${v / 100})`;
    t.setAttribute('aria-valuenow', String(v)); t.setAttribute('aria-valuetext', v < 20 ? 'tout à gauche' : v > 80 ? 'tout à droite' : v >= 45 && v <= 55 ? 'au milieu' : v < 50 ? 'plutôt à gauche' : 'plutôt à droite');
    if (fire) onChange(v);
  };
  if (value !== undefined) set(value, false);
  // une marge touchable de chaque côté : les deux bouts de la ligne s'atteignent d'un simple toucher
  const at = e => { const r = t.getBoundingClientRect(), pad = parseFloat(getComputedStyle(t).getPropertyValue('--pad')) || 14; return (e.clientX - r.left - pad) / (r.width - 2 * pad) * 100; };
  t.addEventListener('pointerdown', e => { t.setPointerCapture(e.pointerId); t.classList.add('drag'); set(at(e)); });
  t.addEventListener('pointermove', e => { if (t.hasPointerCapture(e.pointerId)) set(at(e)); });
  const end = () => t.classList.remove('drag');
  t.addEventListener('pointerup', end); t.addEventListener('pointercancel', end);
  t.addEventListener('keydown', e => {
    const v = +(t.getAttribute('aria-valuenow') ?? 50);
    const step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -20, PageUp: 20 }[e.key];
    if (step !== undefined) { e.preventDefault(); set((t.classList.contains('unset') ? 50 : v) + step); }
    else if (e.key === 'Home') { e.preventDefault(); set(0); } else if (e.key === 'End') { e.preventDefault(); set(100); }
  });
  return t;
}

// --- attente pendant les réponses
function renderWaiting(m) {
  const s = cur.s, me = meP(), total = s.n;
  const done = s.participants.filter(p => p.fini).length;
  if (me) m.appendChild(el('section', 'mr-status', `<h3 class="mr-title">${done === s.participants.length ? 'Tout le monde a fini.' : 'Tes réponses sont parties.'}</h3>
    <p class="mr-say">${isHost() ? (done === s.participants.length ? 'Tu peux lancer le résultat.' : 'Lance le résultat quand tu veux, même si quelqu’un n’a pas tout fini.') : 'L’hôte lancera le résultat et t’enverra un code pour le voir.'}</p>`));
  else m.appendChild(el('section', 'mr-status', `<h3 class="mr-title">La liste est fermée.</h3><p class="mr-say">${isHost() ? 'Tu gères la partie sans y jouer depuis ce téléphone.' : 'Les inscriptions sont terminées pour cette partie. Demande à l’hôte d’en créer une nouvelle.'}</p>`));
  const list = el('section', 'mr-card', `<h2>Où en est chacun</h2><div class="mr-people"></div>`);
  s.participants.forEach(p => {
    list.querySelector('.mr-people').appendChild(el('div', 'mr-person mr-progress', `<span>${who(p)}${p.pid === s.moi ? ' <i>toi</i>' : ''}</span>
      <span class="mr-bar" aria-hidden="true"><i style="width:${Math.min(100, p.n / total * 100)}%"></i></span><span class="mr-n">${p.fini ? 'fini' : `${p.n}/${total}`}</span>`));
  });
  m.appendChild(list);
  if (me && !isHost()) { const b = el('button', 'btn ghost', 'Revoir mes réponses'); b.type = 'button'; b.onclick = () => { cur.s.participants = cur.s.participants.map(p => p.pid === me.pid ? { ...p, fini: false } : p); main().innerHTML = ''; main().appendChild(headFor()); renderQuestion(main(), 0); }; m.appendChild(b); }
  if (isHost()) {
    const b = el('button', 'btn primary lg mr-cta', 'Lancer le résultat'); b.type = 'button';
    b.disabled = s.participants.filter(p => p.n > 0).length < 2;
    b.onclick = async () => {
      const late = s.participants.filter(p => !p.fini).map(p => p.nom);
      const ok = await ask('Lancer le résultat', late.length ? `${late.join(', ')} ${late.length > 1 ? 'n’ont' : 'n’a'} pas fini. Les réponses déjà données comptent, et plus personne ne pourra répondre.` : 'Plus personne ne pourra modifier ses réponses. Tu recevras un code à envoyer à tout le monde.', 'Lancer');
      if (ok) await hostAct('reveler');
    };
    m.appendChild(b);
    if (me && !me.fini) { const c = el('button', 'btn', 'Reprendre mes réponses'); c.type = 'button'; c.onclick = () => { main().innerHTML = ''; main().appendChild(headFor()); renderQuestion(main()); }; m.appendChild(c); }
    m.appendChild(hostCodeBox());
  }
}

// --- résultats
function renderResultsGate(m) {
  if (isHost()) { showResults({ h: cur.hote, into: m }); return; }
  const f = el('form', 'mr-card');
  f.innerHTML = `<h2>Le résultat est prêt</h2><p>L’hôte a lancé le résultat. Entre le code des résultats qu’il t’a envoyé.</p>
    <div class="join-row"><input name="code" maxlength="6" placeholder="Code" class="mr-code-in" autocapitalize="characters" aria-label="Code des résultats"><button class="btn primary" type="submit">Voir</button></div>`;
  f.code.oninput = () => { f.code.value = f.code.value.toUpperCase().replace(/[^A-Z]/g, ''); };
  f.onsubmit = e => { e.preventDefault(); if (f.code.value.length === 6) go('r=' + f.code.value); };
  m.appendChild(f);
}

async function showResults({ r, h, into }) {
  stopPoll();
  const m = into || main(); if (!into) { m.innerHTML = ''; crumb('Miroir · résultats'); }
  let d;
  try { d = await api(r ? `resultats?r=${r}` : `resultats?h=${h}`); }
  catch (e) { if (!into) fail(e.message); else m.appendChild(el('p', 'err', esc(e.message))); return; }
  if (!into) m.appendChild(el('section', 'mr-head', `<span class="eyebrow">Partie de ${esc(d.createur)}</span><h1>Le résultat</h1>`));
  if (h) {
    const url = linkFor('r=' + d.resultat);
    const box = el('section', 'mr-card mr-share');
    box.innerHTML = `<h2>Le code des résultats à envoyer</h2><div class="mr-bigcode">${esc(d.resultat)}</div><p class="fine">Tout le monde peut voir le résultat avec ce code, ou avec le lien.</p>
      <div class="mr-acts"><button class="btn primary" type="button" data-a="share">Envoyer le lien</button><button class="btn" type="button" data-a="copy">Copier le lien</button></div>`;
    box.querySelector('[data-a=share]').hidden = !navigator.share;
    box.querySelector('[data-a=share]').onclick = () => navigator.share({ title: 'Miroir · le résultat', text: `Le résultat de Miroir est là${NB}! Code ${d.resultat} : ${url}`, url }).catch(() => { });
    box.querySelector('[data-a=copy]').onclick = () => navigator.clipboard.writeText(url).then(() => toast('Lien copié'), () => toast('Copie impossible'));
    m.appendChild(box);
  }
  m.appendChild(resultsView(d));
}

function compute(d) {
  const P = d.participants, ids = P.map(p => p.pid), A = {};
  d.reponses.forEach(x => { (A[x.pid] = A[x.pid] || {})[x.q] = x.v; });
  const truth = (t, q) => A[t]?.[q]?.[t];
  const pair = {}, all = [];
  ids.forEach(g => { pair[g] = {}; ids.forEach(t => { if (g !== t) pair[g][t] = []; }); });
  d.questions.forEach((_, q) => ids.forEach(g => ids.forEach(t => {
    if (g === t) return;
    const guess = A[g]?.[q]?.[t], real = truth(t, q);
    if (guess === undefined || real === undefined) return;
    const e = { g, t, q, guess, real, err: Math.abs(guess - real) };
    pair[g][t].push(e); all.push(e);
  })));
  const mean = list => list.length ? list.reduce((a, e) => a + (100 - e.err), 0) / list.length : null;
  const K = {}; ids.forEach(g => { K[g] = {}; ids.forEach(t => { if (g !== t) K[g][t] = mean(pair[g][t]); }); });
  const by = (key) => ids.map(id => { const list = all.filter(e => e[key] === id); return { pid: id, score: mean(list), n: list.length, mille: list.filter(e => e.err <= 5).length }; }).filter(x => x.score !== null).sort((a, b) => b.score - a.score);
  const spread = d.questions.map((qq, q) => { const v = ids.map(t => truth(t, q)).filter(x => x !== undefined); const m = v.reduce((a, x) => a + x, 0) / (v.length || 1); return { q, n: v.length, sd: v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length) : null }; }).filter(x => x.sd !== null);
  let duo = null;
  ids.forEach((a, i) => ids.slice(i + 1).forEach(b => { if (K[a][b] == null || K[b][a] == null) return; const s = (K[a][b] + K[b][a]) / 2; if (!duo || s > duo.s) duo = { a, b, s }; }));
  return { A, truth, K, all, guessers: by('g'), targets: by('t'), spread: spread.sort((a, b) => b.sd - a.sd), duo, worst: [...all].sort((a, b) => b.err - a.err)[0] };
}

function resultsView(d) {
  const c = compute(d), P = Object.fromEntries(d.participants.map(p => [p.pid, p])), name = id => P[id]?.nom || '?', pw = id => who(P[id] || { nom: '?' });
  const pct = x => x == null ? '·' : Math.round(x) + ' %';
  const box = el('div', 'mr-results');
  if (!c.all.length) { box.appendChild(el('section', 'mr-card', '<h2>Pas assez de réponses</h2><p>Il faut au moins deux personnes ayant répondu aux mêmes questions.</p>')); return box; }

  // 1. qui connaît le mieux les autres
  const top = c.guessers[0];
  box.appendChild(el('section', 'mr-status mr-win', `<h3 class="mr-title">${esc(name(top.pid))} connaît le mieux la bande.</h3><p class="mr-say">${pct(top.score)} de justesse en moyenne, et ${top.mille} barre${top.mille > 1 ? 's' : ''} dans le mille, à 5 près.</p>`));
  box.appendChild(rankCard('Qui connaît le mieux les autres', 'Justesse moyenne de ses estimations sur les autres.', c.guessers, pw, x => `${x.mille} dans le mille`));
  box.appendChild(rankCard('Qui est le plus facile à deviner', 'Justesse moyenne des autres quand ils l’estiment. En haut, le livre ouvert. En bas, le mystère.', c.targets, pw, x => `${x.n} estimation${x.n > 1 ? 's' : ''}`));

  // 2. qui connaît qui : la grille
  const ids = d.participants.map(p => p.pid).filter(id => c.guessers.some(x => x.pid === id) || c.targets.some(x => x.pid === id));
  const grid = el('section', 'mr-card');
  grid.innerHTML = `<h2>Qui connaît qui</h2><p class="fine">Chaque ligne, celui qui devine. Chaque colonne, celui qui est deviné. Plus la case est foncée, plus il a visé juste.</p>`;
  const tbl = el('div', 'mr-grid-wrap');
  tbl.innerHTML = `<table class="mr-grid"><thead><tr><th scope="col"><span class="sr">Devine ↓, deviné →</span></th>${ids.map(t => `<th scope="col" title="${esc(name(t))}"><span class="mr-emo">${esc(P[t].emoji || '·')}</span><small>${esc(name(t))}</small></th>`).join('')}</tr></thead><tbody>${ids.map(g => `<tr><th scope="row">${pw(g)}</th>${ids.map(t => {
    if (g === t) return '<td class="self" aria-label="soi-même">·</td>';
    const v = c.K[g][t]; if (v == null) return '<td class="nil">·</td>';
    const k = Math.max(0, Math.min(1, (v - 40) / 55));
    return `<td style="--k:${(8 + k * 82).toFixed(0)}%" class="${k > .55 ? 'dark' : ''}" title="${esc(`${name(g)} sur ${name(t)} : ${pct(v)}`)}">${Math.round(v)}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
  grid.appendChild(tbl); box.appendChild(grid);

  // 3. pour chacun, qui l'a le mieux cerné
  const each = el('section', 'mr-card', '<h2>Pour chacun, qui a le mieux visé</h2><div class="mr-people"></div>');
  ids.forEach(t => {
    const list = ids.filter(g => g !== t && c.K[g]?.[t] != null).map(g => ({ g, v: c.K[g][t] })).sort((a, b) => b.v - a.v);
    if (!list.length) return;
    const best = list[0], worst = list[list.length - 1];
    each.querySelector('.mr-people').appendChild(el('div', 'mr-person mr-each', `<span>${pw(t)}</span><span class="mr-each-txt">le mieux cerné par <b>${esc(name(best.g))}</b> ${pct(best.v)}${list.length > 1 ? `<small>le moins bien par ${esc(name(worst.g))}, ${pct(worst.v)}</small>` : ''}</span>`));
  });
  box.appendChild(each);

  // 4. faits marquants
  const facts = [];
  if (c.duo) facts.push(['Le duo qui se connaît le mieux', `${esc(name(c.duo.a))} et ${esc(name(c.duo.b))}, ${pct(c.duo.s)} de justesse l’un sur l’autre.`]);
  if (c.spread[0]) { const q = d.questions[c.spread[0].q]; facts.push(['La question qui divise', `«${NB}${esc(q.q)}${NB}»${NB}: les barres vont d’un bout à l’autre de la ligne.`]); }
  if (c.spread.length > 1) { const s = c.spread[c.spread.length - 1], q = d.questions[s.q]; facts.push(['Celle où tout le monde est d’accord', `«${NB}${esc(q.q)}${NB}»${NB}: toutes les barres au même endroit, ou presque.`]); }
  if (c.worst && c.worst.err >= 40) { const w = c.worst, q = d.questions[w.q]; facts.push(['Le plus gros malentendu', `Pour «${NB}${esc(q.q)}${NB}», ${esc(name(w.g))} voyait ${esc(name(w.t))} ${side(w.guess, q)}. En vrai, ${side(w.real, q)}.`]); }
  if (facts.length) box.appendChild(el('section', 'mr-card mr-facts', `<h2>Faits marquants</h2>${facts.map(([t, x]) => `<div class="mr-fact"><b>${t}</b><p>${x}</p></div>`).join('')}`));

  // 5. toutes les réponses
  const allBox = el('section', 'mr-card', `<h2>Toutes les réponses</h2><p class="fine">Pour chaque question, la vraie réponse de chacun, en grand, et où les autres l’avaient placée, en petit.</p>`);
  d.questions.forEach((q, qi) => {
    const det = el('details', 'mr-ans');
    const rowsHtml = ids.map(t => {
      const real = c.truth(t, qi); if (real === undefined) return '';
      const guesses = ids.filter(g => g !== t && c.A[g]?.[qi]?.[t] !== undefined).map(g => ({ g, v: c.A[g][qi][t] }));
      return `<div class="mr-line"><span class="mr-who">${pw(t)}</span><div class="mr-axis">${guesses.map(x => `<span class="mr-dot guess" style="left:${x.v}%" title="${esc(`${name(x.g)} pensait ${x.v}`)}">${esc(P[x.g].emoji || '·')}</span>`).join('')}<span class="mr-dot real" style="left:${real}%" title="${esc(`${name(t)} : ${real}`)}">${esc(P[t].emoji || '·')}</span></div></div>`;
    }).join('');
    det.innerHTML = `<summary><span class="mr-qn">${qi + 1}</span><span>${esc(q.q)}<small>${esc(q.cn)}</small></span></summary>
      <div class="mr-poles"><span></span><span class="mr-pole l">${esc(q.l)}</span><span class="mr-pole r">${esc(q.r)}</span></div>${rowsHtml}`;
    allBox.appendChild(det);
  });
  box.appendChild(allBox);
  return box;
}
const side = (v, q) => v <= 20 ? `tout côté «${NB}${esc(q.l)}${NB}»` : v >= 80 ? `tout côté «${NB}${esc(q.r)}${NB}»` : v >= 40 && v <= 60 ? 'au milieu' : v < 50 ? `plutôt «${NB}${esc(q.l)}${NB}»` : `plutôt «${NB}${esc(q.r)}${NB}»`;
function rankCard(title, sub, list, pw, extra) {
  const s = el('section', 'mr-card');
  s.innerHTML = `<h2>${title}</h2><p class="fine">${sub}</p><div class="mr-rank">${list.map((x, i) => `<div class="mr-rank-row${i === 0 ? ' first' : ''}"><span class="mr-pos">${i + 1}</span><span class="mr-rank-who">${pw(x.pid)}<small>${esc(extra(x))}</small></span><span class="mr-bar" aria-hidden="true"><i style="width:${Math.max(2, x.score)}%"></i></span><span class="mr-n">${Math.round(x.score)} %</span></div>`).join('')}</div>`;
  return s;
}

route();
