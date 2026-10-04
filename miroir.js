/* Miroir : qui te connaît le mieux ?
   Un jeu à part de la Boîte à jeux, sans salon en direct. Comme dans Prisme, chacun avance à son rythme :
   1. Quelqu'un crée la partie : il reçoit le code à partager et un code hôte, gardé pour lui.
   2. Chacun s'inscrit avec le code et répond tout de suite pour lui : c'est son miroir, 25 questions à
      deux pôles, une par écran, avec le curseur et les graduations de Prisme.
   3. Il devine ensuite les autres, un par un, quand il veut : où chacun a-t-il placé la barre ? Ceux qui
      arrivent plus tard s'ajoutent à la liste ; on revient les deviner.
   4. Quand l'hôte le décide, il lance le résultat et reçoit un code des résultats à envoyer à tous :
      qui connaît le mieux qui, qui est le plus facile à deviner, et toutes les réponses.
   Les données vivent dans la base Cloudflare (functions/api/miroir/). Les questions sont tirées côté
   serveur ; un participant ne reçoit jamais les réponses des autres avant le résultat. */
'use strict';

const $ = (s, root = document) => root.querySelector(s);
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NB = ' ';
const PASSE = -1;
const EMOJIS = ['🦊', '🐼', '🐸', '🐙', '🦄', '🐯', '🦁', '🐵', '🐧', '🦉', '🐢', '🐝', '🦋', '🐳', '🦀', '🐨', '🐷', '🦖', '🐬', '🐻', '🦔', '🐞', '🦒', '🍕', '🍩', '🍉', '🍒', '🥑', '🌵', '🌻', '🍄', '🍀', '🔥', '⚡', '🌈', '⭐', '🌙', '🎸', '🎲', '🚀', '👻', '👽', '💎', '🎩', '👑'];
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
};
const tok = (() => { let t = store.get('mi-tok'); if (!/^[a-z0-9]{20}$/.test(t || '')) { t = [...crypto.getRandomValues(new Uint8Array(20))].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); store.set('mi-tok', t); } return t; })();
let myEmoji = EMOJIS.includes(store.get('dc-emo')) ? store.get('dc-emo') : EMOJIS[Math.random() * EMOJIS.length | 0];
const myName = () => store.get('dc-name', '');
const TOUCH = !!(window.matchMedia && matchMedia('(hover: none)').matches);

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
let poll = null, cur = null;
function go(q) { history.pushState(null, '', q ? '?' + q : location.pathname); route(); }
window.addEventListener('popstate', () => route());
function stopPoll() { clearInterval(poll); poll = null; }
function route() {
  stopPoll(); cur = null; window.scrollTo(0, 0);
  const p = new URLSearchParams(location.search);
  const h = (p.get('h') || '').toUpperCase(), c = (p.get('c') || '').toUpperCase(), r = (p.get('r') || '').toUpperCase();
  if (r) return showResults({ r });
  if (h) return openHost(h);
  if (c) return openGame(c);
  home();
}
const main = () => $('#mr-main');
const crumb = t => { $('#mr-crumb').textContent = t; document.title = t === 'Miroir' ? 'Miroir · Boîte à jeux' : `${t} · Boîte à jeux`; };
const fresh = () => { const m = main(); m.innerHTML = ''; window.scrollTo(0, 0); return m; };

// ---------------------------------------------------------------- accueil de Miroir
async function home() {
  crumb('Miroir');
  const m = fresh();
  m.appendChild(el('section', 'mr-hero', `
    <div class="mr-mark" aria-hidden="true"><span>🪞</span></div>
    <span class="eyebrow">Boîte à jeux</span>
    <h1>Miroir</h1>
    <p class="lede">Qui te connaît le mieux${NB}? Chacun répond pour soi, puis devine où les autres ont placé la barre.</p>
    <ol class="mr-steps">
      <li><span><b>Crée la partie</b> et envoie le code à tes amis.</span></li>
      <li><span><b>Chacun répond pour lui</b>, tout de suite, à son rythme${NB}: 25 questions, cinq minutes.</span></li>
      <li><span><b>Puis devine les autres</b>, un par un, quand il veut, même des jours plus tard.</span></li>
      <li><span><b>Tu lances le résultat</b>${NB}: qui connaît le mieux qui.</span></li>
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

  const codeForm = (title, sub, len, label, onGo) => {
    const f = el('form', 'mr-card');
    f.innerHTML = `<h2>${title}</h2><p class="fine">${sub}</p>
      <div class="join-row"><input name="code" maxlength="${len}" placeholder="Code" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="${label}" class="mr-code-in"><button class="btn" type="submit">${len === 5 ? 'Rejoindre' : 'Voir'}</button></div>`;
    f.code.oninput = () => { f.code.value = f.code.value.toUpperCase().replace(/[^A-Z]/g, ''); };
    f.onsubmit = e => { e.preventDefault(); if (f.code.value.length === len) onGo(f.code.value); else toast(`Le code fait ${len === 5 ? 'cinq' : 'six'} lettres.`); };
    return f;
  };
  m.appendChild(codeForm('Rejoindre une partie', 'Le code à cinq lettres que l’hôte t’a envoyé.', 5, 'Code de la partie', c => go('c=' + c)));
  m.appendChild(codeForm('Voir des résultats', 'Le code à six lettres envoyé par l’hôte quand il a lancé le résultat.', 6, 'Code des résultats', c => go('r=' + c)));

  const list = mine();
  if (list.length) {
    const box = el('section', 'mr-card mr-mine', '<h2>Tes parties</h2><div class="mr-list"></div>');
    list.forEach(p => {
      const row = el('button', 'mr-row-link'); row.type = 'button';
      row.innerHTML = `<span><b>${esc(p.code)}</b><small>${p.hote ? 'tu es l’hôte' : 'participant'} · ${new Date(p.quand).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small></span><span aria-hidden="true">›</span>`;
      row.onclick = () => go(p.hote ? 'h=' + p.hote : 'c=' + p.code);
      box.querySelector('.mr-list').appendChild(row);
    });
    m.appendChild(box);
  }
}

function bindEmoji(root) {
  const b = root.querySelector('.emo-btn'); if (!b) return;
  b.onclick = () => {
    const old = root.querySelector('.mr-emo-pop'); if (old) { old.remove(); return; }
    const pop = el('div', 'mr-emo-pop'); pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Emojis');
    EMOJIS.forEach(e => { const x = el('button', 'emo' + (e === myEmoji ? ' on' : ''), e); x.type = 'button'; x.onclick = () => { myEmoji = e; store.set('dc-emo', e); b.textContent = e; pop.remove(); }; pop.appendChild(x); });
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
    renderHub(); startPoll();
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
    renderHub(); startPoll();
  } catch (e) { fail(e.message); }
}
async function refresh(redraw = true) {
  if (!cur) return;
  try {
    const s = cur.hote ? await api(`hote?h=${cur.hote}&tok=${tok}`) : await api(`etat?c=${cur.code}&tok=${tok}`);
    const before = JSON.stringify([cur.s.phase, cur.s.participants, cur.s.moi, cur.s.resultat]);
    // les réponses en attente d'envoi restent prioritaires sur celles du serveur
    s.mesReponses = mergeLocal(s.mesReponses || {});
    cur.s = s;
    if (cur.run && s.phase === 'resultats') { cur.run = null; renderHub(); return; }
    if (redraw && !cur.run && before !== JSON.stringify([s.phase, s.participants, s.moi, s.resultat])) renderHub();
  } catch { }
}
function startPoll() { stopPoll(); poll = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 6000); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { flush(); refresh(); } });
function fail(msg) {
  const m = fresh();
  m.appendChild(el('section', 'mr-card', `<h2>Partie introuvable</h2><p>${esc(msg)}</p><button class="btn primary" type="button">Retour à Miroir</button>`)).querySelector('button').onclick = () => go('');
}

const isHost = () => !!cur?.hote;
const meP = () => cur.s.participants.find(p => p.pid === cur.s.moi);
const others = () => cur.s.participants.filter(p => p.pid !== cur.s.moi);
const who = p => `<span class="mr-emo" aria-hidden="true">${esc(p.emoji || '·')}</span>${esc(p.nom)}`;
// combien de questions j'ai faites sur une personne (moi compris), d'après mes propres réponses
const doneOn = pid => cur.s.questions ? cur.s.questions.filter((_, q) => cur.s.mesReponses?.[q]?.[pid] !== undefined).length : 0;

// ---------------------------------------------------------------- envoi des réponses
// Chaque réponse part tout de suite, sans faire attendre : si le réseau flanche, elle reste sur le
// téléphone et repart à la prochaine occasion.
const pendKey = () => `mi-draft-${cur.code}`;
function mergeLocal(server) {
  const pend = store.json(pendKey(), []);
  const out = JSON.parse(JSON.stringify(server));
  pend.forEach(x => { (out[x.q] = out[x.q] || {})[x.cible] = x.val; });
  return out;
}
function saveAnswer(cible, q, val) {
  (cur.s.mesReponses[q] = cur.s.mesReponses[q] || {})[cible] = val;
  const pend = store.json(pendKey(), []).filter(x => !(x.cible === cible && x.q === q));
  pend.push({ cible, q, val });
  store.set(pendKey(), JSON.stringify(pend));
  flush();
}
let flushing = false;
async function flush() {
  if (flushing || !cur) return; flushing = true;
  try {
    let pend = store.json(pendKey(), []);
    while (pend.length) {
      const x = pend[0];
      try { await api('repondre', { c: cur.code, tok, ...x }); }
      catch (e) { if (e.status >= 400 && e.status < 500) { if (e.status === 409) toast(e.message, 3600); } else break; }
      pend = store.json(pendKey(), []).filter(y => !(y.cible === x.cible && y.q === x.q && y.val === x.val));
      store.set(pendKey(), JSON.stringify(pend));
    }
  } finally { flushing = false; }
}

// ---------------------------------------------------------------- la page de la partie
function renderHub() {
  const s = cur.s, m = fresh(); cur.run = null;
  crumb(`Miroir · ${s.code}`);
  m.appendChild(el('section', 'mr-head', `<span class="eyebrow">Partie de ${esc(s.createur)}</span><h1>Miroir</h1>`));
  if (s.phase === 'resultats') return renderResultsGate(m);
  const me = meP();
  if (!me) { m.appendChild(signupForm()); if (isHost()) m.appendChild(shareBox()); m.appendChild(progressCard()); return; }

  const selfDone = doneOn(me.pid), N = s.n, todo = others().filter(p => doneOn(p.pid) < N);
  const title = selfDone < N ? (selfDone ? 'Reprends ton miroir.' : 'Commence par ton miroir.')
    : !others().length ? 'Ton miroir est prêt.' : todo.length ? `Ton miroir est prêt. ${todo.length > 1 ? `Il reste ${todo.length} personnes à deviner.` : `Il reste ${todo[0].nom} à deviner.`}` : 'Tu as tout fait.';
  const say = selfDone < N ? '25 questions, une par écran, environ cinq minutes. Tu peux t’arrêter et revenir quand tu veux.'
    : !others().length ? 'Personne d’autre n’est encore inscrit. Envoie le code, puis reviens deviner ceux qui arrivent.'
    : todo.length ? 'Devine où chacun a placé la barre. Ceux qui s’inscrivent plus tard apparaîtront ici.'
    : isHost() ? 'Lance le résultat quand tout le monde a joué. Si quelqu’un s’inscrit encore, tu pourras le deviner.' : 'L’hôte lancera le résultat et t’enverra un code pour le voir. Si quelqu’un s’inscrit encore, reviens le deviner.';
  m.appendChild(el('section', 'mr-status', `<h3 class="mr-title">${esc(title)}</h3><p class="mr-say">${esc(say)}</p>`));

  // ton miroir
  const mirror = el('section', 'mr-card mr-task' + (selfDone >= N ? ' done' : ''));
  mirror.innerHTML = `<div class="mr-task-head"><span class="mr-task-ic" aria-hidden="true">🪞</span><span><b>Ton miroir</b><small>${selfDone >= N ? 'Fait. Tu peux revoir tes réponses.' : `Tes propres réponses · ${selfDone} sur ${N}`}</small></span></div>
    <span class="mr-bar" aria-hidden="true"><i style="width:${selfDone / N * 100}%"></i></span>`;
  const mb = el('button', 'btn ' + (selfDone >= N ? '' : 'primary lg'), selfDone >= N ? 'Revoir mes réponses' : selfDone ? 'Reprendre' : 'Commencer'); mb.type = 'button';
  mb.onclick = () => startRun(me.pid);
  mirror.appendChild(mb);
  m.appendChild(mirror);

  // les autres à deviner
  const guess = el('section', 'mr-card');
  guess.innerHTML = `<h2>Devine les autres</h2>${others().length ? '' : '<p class="fine">Personne d’autre pour l’instant. Dès que quelqu’un s’inscrit, il apparaît ici.</p>'}<div class="mr-people"></div>`;
  others().forEach(p => {
    const d = doneOn(p.pid);
    const row = el('div', 'mr-person mr-guess-row' + (d >= N ? ' done' : ''), `<span class="mr-gwho">${who(p)}<small>${d >= N ? 'deviné' : d ? `${d} sur ${N}` : 'à deviner'}</small></span>`);
    const b = el('button', 'btn small' + (d < N && selfDone >= N ? ' primary' : ''), d >= N ? 'Revoir' : d ? 'Reprendre' : 'Deviner'); b.type = 'button';
    b.onclick = () => startRun(p.pid);
    row.appendChild(b);
    guess.querySelector('.mr-people').appendChild(row);
  });
  m.appendChild(guess);

  if (isHost()) m.appendChild(shareBox());
  m.appendChild(progressCard());
  if (isHost()) {
    const ready = s.participants.filter(p => p.n > 0).length >= 2 && s.participants.some(p => Object.keys(p.g || {}).length);
    const b = el('button', 'btn primary lg mr-cta', 'Lancer le résultat'); b.type = 'button'; b.disabled = !ready;
    b.onclick = async () => {
      const late = s.participants.filter(p => p.n < N || Object.values(p.g || {}).filter(x => x >= N).length < s.participants.length - 1).map(p => p.nom);
      const ok = await ask('Lancer le résultat', late.length ? `${late.join(', ')} ${late.length > 1 ? 'n’ont' : 'n’a'} pas tout fait. Ce qui est déjà répondu compte, et personne ne pourra plus répondre.` : 'Tout le monde a tout fait. Personne ne pourra plus répondre, et tu recevras un code à envoyer à tous.', 'Lancer');
      if (ok) { try { await api('hote', { h: cur.hote, action: 'reveler' }); await refresh(false); renderHub(); } catch (e) { toast(e.message, 3600); } }
    };
    m.appendChild(b);
    if (!ready) m.appendChild(el('p', 'fine mr-center', 'Il faut au moins deux joueurs qui ont répondu pour eux, et quelqu’un qui en a deviné un autre.'));
    m.appendChild(hostCodeBox());
  }
}

function signupForm() {
  const s = cur.s, f = el('form', 'mr-card');
  f.innerHTML = `<h2>Inscris-toi</h2><p class="fine">Ton prénom, tel que tes amis te connaissent. Tu réponds ensuite tout de suite pour toi.</p>
    <div class="field"><div class="name-row"><button class="emo-btn" type="button" aria-label="Choisir ton emoji">${myEmoji}</button><input name="nom" maxlength="14" placeholder="Prénom" autocomplete="off" required value="${esc(myName())}"></div></div>
    <button class="btn primary lg" type="submit">Je m’inscris</button><p class="err" role="alert"></p>`;
  bindEmoji(f);
  f.onsubmit = async e => {
    e.preventDefault(); const nom = f.nom.value.trim(); if (!nom) return;
    store.set('dc-name', nom);
    try { await api('inscrire', { c: s.code, nom, emoji: myEmoji, tok }); remember(s.code); await refresh(false); renderHub(); }
    catch (ex) { f.querySelector('.err').textContent = ex.message; }
  };
  return f;
}

function progressCard() {
  const s = cur.s, N = s.n, total = s.participants.length;
  const box = el('section', 'mr-card', `<h2>Où en est chacun · ${total} inscrit${total > 1 ? 's' : ''}</h2><div class="mr-people"></div>`);
  s.participants.forEach(p => {
    const guessed = Object.values(p.g || {}).filter(x => x >= N).length;
    const sub = `${p.n >= N ? 'miroir fait' : `miroir ${p.n} sur ${N}`} · ${total > 1 ? `a deviné ${guessed} sur ${total - 1}` : 'personne à deviner'}`;
    const row = el('div', 'mr-person mr-progress', `<span class="mr-gwho">${who(p)}${p.pid === s.moi ? ' <i>toi</i>' : ''}${p.pid === s.createurPid ? ' <i>hôte</i>' : ''}<small>${esc(sub)}</small></span>`);
    if (isHost() && p.pid !== s.createurPid) {
      const x = el('button', 'btn ghost small', 'Retirer'); x.type = 'button';
      x.onclick = async () => { if (await ask(`Retirer ${p.nom}`, `${p.nom} et ses réponses disparaissent de la partie.`, 'Retirer')) { try { await api('hote', { h: cur.hote, action: 'retirer', pid: p.pid }); await refresh(false); renderHub(); } catch (e) { toast(e.message, 3600); } } };
      row.appendChild(x);
    }
    box.querySelector('.mr-people').appendChild(row);
  });
  return box;
}
function linkFor(q) { return `${location.origin}${location.pathname}?${q}`; }
function shareBox() {
  const s = cur.s, url = linkFor('c=' + s.code);
  const box = el('section', 'mr-card mr-share');
  box.innerHTML = `<h2>Le code à envoyer</h2><div class="mr-bigcode">${esc(s.code)}</div><p class="fine">${esc(url.replace(/^https?:\/\//, ''))}</p>
    <div class="mr-acts"><button class="btn primary" type="button" data-a="share">Envoyer le lien</button><button class="btn" type="button" data-a="copy">Copier le lien</button></div>`;
  const text = `${s.createur} t’invite à jouer à Miroir${NB}: qui te connaît le mieux${NB}? Code ${s.code}${NB}: ${url}`;
  box.querySelector('[data-a=share]').hidden = !navigator.share;
  box.querySelector('[data-a=share]').onclick = () => navigator.share({ title: 'Miroir', text, url }).catch(() => { });
  box.querySelector('[data-a=copy]').onclick = () => navigator.clipboard.writeText(url).then(() => toast('Lien copié'), () => toast('Copie impossible'));
  return box;
}
function hostCodeBox() {
  const box = el('section', 'mr-card mr-hostcode');
  box.innerHTML = `<h2>Ton code hôte</h2><div class="mr-bigcode small">${esc(cur.hote)}</div>
    <p class="fine">Garde-le pour toi${NB}: il sert à lancer le résultat. Ce téléphone s’en souvient. Pour gérer la partie ailleurs, ouvre Miroir avec ce lien.</p>
    <button class="btn small" type="button">Copier le lien hôte</button>`;
  box.querySelector('button').onclick = () => navigator.clipboard.writeText(linkFor('h=' + cur.hote)).then(() => toast('Lien hôte copié. Ne l’envoie à personne.'), () => toast('Copie impossible'));
  return box;
}

// ---------------------------------------------------------------- le questionnaire, façon Prisme
// Une question par écran. Le curseur part du milieu ; une graduation touchée répond d'un coup et passe
// à la suite. Trois parties, avec une pause entre chacune.
const partsFor = n => { const a = Math.ceil(n / 3), b = Math.ceil((n - a) / 2); return [[0, a], [a, a + b], [a + b, n]]; };
const lower = s => s && /^[A-ZÀ-Ý][a-zà-ÿ’' ]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
function labelFor(v, q) {
  if (v === undefined || v === null) return 'Entre les deux';
  if (v <= 12) return `${q.l}, sans hésiter`;
  if (v < 40) return `Plutôt ${lower(q.l)}`;
  if (v <= 60) return 'Entre les deux';
  if (v < 88) return `Plutôt ${lower(q.r)}`;
  return `${q.r}, sans hésiter`;
}

function startRun(target, at) {
  const qs = cur.s.questions, N = qs.length;
  const first = qs.findIndex((_, q) => cur.s.mesReponses?.[q]?.[target] === undefined);
  cur.run = { target, i: at ?? (first < 0 ? 0 : first), review: first < 0 };
  renderRun();
}
function renderRun(dir) {
  const s = cur.s, run = cur.run, qs = s.questions, N = qs.length, q = qs[run.i];
  const me = meP(), self = run.target === me.pid, t = s.participants.find(p => p.pid === run.target);
  if (!t) { toast('Ce joueur n’est plus dans la partie.'); renderHub(); return; }
  crumb(self ? 'Ton miroir' : `Deviner ${t.nom}`);
  const m = fresh();
  const parts = partsFor(N), pi = parts.findIndex(([a, b]) => run.i >= a && run.i < b);
  const saved = s.mesReponses?.[run.i]?.[run.target];
  let value = saved !== undefined && saved !== PASSE ? saved : 50, touched = saved !== undefined && saved !== PASSE;

  const wrap = el('section', 'mr-run');
  wrap.innerHTML = `
    <div class="mr-run-top"><span class="mr-run-who">${self ? '<span class="mr-emo" aria-hidden="true">🪞</span>Ton miroir' : `${who(t)}`}</span><span class="mr-count"><b>${run.i + 1}</b>${NB}/${NB}${N}</span></div>
    <div class="mr-parts" aria-hidden="true">${parts.map(([a, b], k) => `<i><b style="width:${k < pi ? 100 : k === pi ? (run.i - a) / (b - a) * 100 : 0}%"></b></i>`).join('')}</div>
    <p class="mr-part">Partie ${pi + 1} sur ${parts.length} · ${esc(q.cn)}</p>
    <article class="mr-qcard${dir === 'back' ? ' back' : ''}">
      <p class="mr-kicker">${self ? 'Et toi, où places-tu la barre ?' : `D’après toi, où ${esc(t.nom)} place la barre ?`}</p>
      <h2 class="mr-qtext">${esc(q.q)}</h2>
      <div class="mr-slider">
        <div class="mr-bubble" aria-hidden="true"></div>
        <div class="mr-rail" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(self ? `Ta réponse : ${q.q}` : `${t.nom} : ${q.q}`)}"><span class="mr-knob"></span></div>
        <div class="mr-ticks">${[0, 25, 50, 75, 100].map(v => `<button type="button" class="mr-tick${v === 50 ? ' mid' : ''}" data-v="${v}" aria-label="${esc(labelFor(v, q))}"></button>`).join('')}</div>
        <div class="mr-ends" aria-hidden="true"><span>${esc(q.l)}</span><span>${esc(q.r)}</span></div>
      </div>
    </article>
    <div class="mr-actions"><button class="btn ghost" type="button" data-a="prev">Précédent</button><button class="btn ghost" type="button" data-a="skip">${self ? 'Passer' : 'Je ne sais pas'}</button><button class="btn primary" type="button" data-a="next">${run.i === N - 1 ? 'Terminer' : 'Suivant'}</button></div>
    <p class="mr-hint">${TOUCH ? 'Touche une graduation pour répondre d’un coup, ou fais glisser le curseur.' : 'Clic sur une graduation pour répondre d’un coup · flèches ← → pour ajuster · Entrée pour valider'}</p>
    <button class="btn ghost small mr-center mr-quit" type="button">Revenir à la partie</button>`;
  const rail = wrap.querySelector('.mr-rail'), knob = wrap.querySelector('.mr-knob'), bubble = wrap.querySelector('.mr-bubble');
  const paint = () => {
    const pos = `calc(var(--pad) + (100% - 2 * var(--pad)) * ${value / 100})`;
    knob.style.left = pos; bubble.style.left = pos;
    bubble.textContent = labelFor(touched ? value : 50, q);
    rail.setAttribute('aria-valuenow', String(value)); rail.setAttribute('aria-valuetext', bubble.textContent);
    wrap.querySelector('.mr-slider').classList.toggle('touched', touched);
  };
  const at = e => { const r = rail.getBoundingClientRect(), pad = parseFloat(getComputedStyle(rail).getPropertyValue('--pad')) || 15; return Math.max(0, Math.min(100, Math.round((e.clientX - r.left - pad) / (r.width - 2 * pad) * 100))); };
  rail.addEventListener('pointerdown', e => { rail.setPointerCapture(e.pointerId); rail.classList.add('drag'); value = at(e); touched = true; paint(); });
  rail.addEventListener('pointermove', e => { if (rail.hasPointerCapture(e.pointerId)) { value = at(e); paint(); } });
  const end = () => rail.classList.remove('drag');
  rail.addEventListener('pointerup', end); rail.addEventListener('pointercancel', end);
  const commit = (val, d = 1) => {
    saveAnswer(run.target, run.i, val);
    const nx = run.i + d;
    if (d > 0 && parts.some(([a]) => a === nx) && nx < N && !run.review) { run.i = nx; renderBreak(parts, parts.findIndex(([a]) => a === nx)); return; }
    if (nx >= N) { finishRun(); return; }
    run.i = Math.max(0, nx); renderRun(d < 0 ? 'back' : undefined);
  };
  wrap.querySelectorAll('.mr-tick').forEach(b => b.onclick = () => { value = +b.dataset.v; touched = true; paint(); setTimeout(() => commit(value), 180); });
  wrap.querySelector('[data-a=next]').onclick = () => commit(value);
  wrap.querySelector('[data-a=skip]').onclick = () => commit(PASSE);
  const prev = wrap.querySelector('[data-a=prev]'); prev.disabled = run.i === 0;
  prev.onclick = () => { run.i -= 1; renderRun('back'); };
  wrap.querySelector('.mr-quit').onclick = () => { cur.run = null; renderHub(); refresh(false); };
  const keys = e => {
    if (cur?.run !== run || document.querySelector('dialog[open]')) { document.removeEventListener('keydown', keys); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); value = Math.max(0, Math.min(100, value + (e.key === 'ArrowLeft' ? -5 : 5))); touched = true; paint(); }
    else if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); document.removeEventListener('keydown', keys); commit(value); }
  };
  document.addEventListener('keydown', keys);
  m.appendChild(wrap); paint();
  rail.focus({ preventScroll: true });
}
function renderBreak(parts, k) {
  const run = cur.run, N = cur.s.questions.length, t = cur.s.participants.find(p => p.pid === run.target), self = run.target === cur.s.moi;
  const m = fresh();
  const [a, b] = parts[k], left = N - a;
  const card = el('article', 'mr-qcard mr-break', `<p class="mr-break-k">Partie ${k} sur ${parts.length} terminée</p>
    <h2 class="mr-break-t">${k === parts.length - 1 ? 'Dernière ligne droite.' : ['Première étape franchie.', 'Beau rythme, continue.'][Math.min(k - 1, 1)]}</h2>
    <p class="mr-break-next"><b>Ensuite${NB}: ${b - a} questions</b>, environ ${Math.max(1, Math.round((b - a) * 12 / 60))} min.${self ? '' : ` Toujours sur ${esc(t.nom)}.`}<br><span>Il en reste ${left} en tout.</span></p>`);
  const go2 = el('button', 'btn primary lg', 'Continuer'); go2.type = 'button'; go2.onclick = () => renderRun();
  card.appendChild(go2); m.appendChild(card); go2.focus({ preventScroll: true });
}
function finishRun() {
  const run = cur.run, s = cur.s, self = run.target === s.moi, t = s.participants.find(p => p.pid === run.target);
  cur.run = null; flush();
  const m = fresh(); crumb(`Miroir · ${s.code}`);
  const next = others().find(p => p.pid !== run.target && doneOn(p.pid) < s.n);
  const card = el('article', 'mr-qcard mr-break', `<p class="mr-break-k">${self ? 'Ton miroir' : `Deviner ${esc(t.nom)}`}</p>
    <h2 class="mr-break-t">${self ? 'Ton miroir est prêt.' : `C’est fait pour ${esc(t.nom)}${NB}!`}</h2>
    <p class="mr-break-next">${next ? `À toi de deviner les autres. On commence par ${esc(next.nom)}${NB}?` : others().length ? 'Tu as deviné tout le monde. Reviens si quelqu’un d’autre s’inscrit.' : 'Personne d’autre n’est encore inscrit. Envoie le code, et reviens deviner ceux qui arrivent.'}</p>`);
  if (next) { const b = el('button', 'btn primary lg', `Deviner ${esc(next.nom)}`); b.type = 'button'; b.onclick = () => startRun(next.pid); card.appendChild(b); }
  const back = el('button', 'btn' + (next ? ' ghost' : ' primary lg'), 'Revenir à la partie'); back.type = 'button'; back.onclick = () => { renderHub(); refresh(false); };
  card.appendChild(back); m.appendChild(card);
}

// ---------------------------------------------------------------- résultats
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
  const m = into || fresh(); if (!into) crumb('Miroir · résultats');
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
    box.querySelector('[data-a=share]').onclick = () => navigator.share({ title: 'Miroir · le résultat', text: `Le résultat de Miroir est là${NB}! Code ${d.resultat}${NB}: ${url}`, url }).catch(() => { });
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
  const by = key => ids.map(id => { const list = all.filter(e => e[key] === id); return { pid: id, score: mean(list), n: list.length, mille: list.filter(e => e.err <= 5).length }; }).filter(x => x.score !== null).sort((a, b) => b.score - a.score);
  const spread = d.questions.map((qq, q) => { const v = ids.map(t => truth(t, q)).filter(x => x !== undefined); const m = v.reduce((a, x) => a + x, 0) / (v.length || 1); return { q, n: v.length, sd: v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length) : null }; }).filter(x => x.sd !== null);
  let duo = null;
  ids.forEach((a, i) => ids.slice(i + 1).forEach(b => { if (K[a][b] == null || K[b][a] == null) return; const s = (K[a][b] + K[b][a]) / 2; if (!duo || s > duo.s) duo = { a, b, s }; }));
  return { A, truth, K, all, guessers: by('g'), targets: by('t'), spread: spread.sort((a, b) => b.sd - a.sd), duo, worst: [...all].sort((a, b) => b.err - a.err)[0] };
}

// des étiquettes « emoji + prénom » posées sur une ligne, réparties sur plusieurs rangs pour ne pas se chevaucher
function axisLabels(items, cls) {
  const rows = [];
  [...items].sort((a, b) => a.x - b.x).forEach(it => {
    let r = rows.findIndex(last => it.x - last >= 22); if (r < 0) { r = rows.length; rows.push(-100); }
    rows[r] = it.x; it.row = r;
  });
  const h = Math.max(1, rows.length);
  return { h, html: items.map(it => `<span class="mr-pill ${cls}${it.extra ? ' ' + it.extra : ''}" style="left:${it.x}%;--x:${it.x};--row:${it.row}" title="${esc(it.title || '')}">${it.html}</span><i class="mr-mark-x ${cls}" style="left:${it.x}%"></i>`).join('') };
}

function resultsView(d) {
  const c = compute(d), P = Object.fromEntries(d.participants.map(p => [p.pid, p])), name = id => P[id]?.nom || '?', pw = id => who(P[id] || { nom: '?' });
  const pct = x => x == null ? '·' : Math.round(x) + ' %';
  const box = el('div', 'mr-results');
  if (!c.all.length) { box.appendChild(el('section', 'mr-card', '<h2>Pas assez de réponses</h2><p>Il faut au moins une personne qui a répondu pour elle et une autre qui l’a devinée.</p>')); return box; }

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
  tbl.innerHTML = `<table class="mr-grid"><thead><tr><th scope="col"><span class="sr">Devine ↓, deviné →</span></th>${ids.map(t => `<th scope="col"><span class="mr-emo">${esc(P[t].emoji || '·')}</span><span class="mr-gname">${esc(name(t))}</span></th>`).join('')}</tr></thead><tbody>${ids.map(g => `<tr><th scope="row">${pw(g)}</th>${ids.map(t => {
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
    each.querySelector('.mr-people').appendChild(el('div', 'mr-person mr-each', `<span>${pw(t)}</span><span class="mr-each-txt">le mieux cerné par <b>${esc(name(best.g))}</b>, ${pct(best.v)}${list.length > 1 ? `<small>le moins bien par ${esc(name(worst.g))}, ${pct(worst.v)}</small>` : ''}</span>`));
  });
  box.appendChild(each);

  // 4. faits marquants
  const facts = [];
  if (c.duo) facts.push(['Le duo qui se connaît le mieux', `${esc(name(c.duo.a))} et ${esc(name(c.duo.b))}, ${pct(c.duo.s)} de justesse l’un sur l’autre.`]);
  if (c.spread[0]) { const q = d.questions[c.spread[0].q]; facts.push(['La question qui divise', `«${NB}${esc(q.q)}${NB}»${NB}: les barres vont d’un bout à l’autre de la ligne.`]); }
  if (c.spread.length > 1) { const s = c.spread[c.spread.length - 1], q = d.questions[s.q]; facts.push(['Celle où tout le monde est d’accord', `«${NB}${esc(q.q)}${NB}»${NB}: toutes les barres au même endroit, ou presque.`]); }
  if (c.worst && c.worst.err >= 40) { const w = c.worst, q = d.questions[w.q]; facts.push(['Le plus gros malentendu', `Pour «${NB}${esc(q.q)}${NB}», ${esc(name(w.g))} voyait ${esc(name(w.t))} ${side(w.guess, q)}. En vrai, ${side(w.real, q)}.`]); }
  if (facts.length) box.appendChild(el('section', 'mr-card mr-facts', `<h2>Faits marquants</h2>${facts.map(([t, x]) => `<div class="mr-fact"><b>${t}</b><p>${x}</p></div>`).join('')}`));

  // 5. toutes les réponses, avec les prénoms
  const allBox = el('section', 'mr-card', `<h2>Toutes les réponses</h2><p class="fine">Pour chaque question, d’abord la vraie réponse de chacun. Puis, personne par personne, où les autres l’avaient placée.</p>`);
  d.questions.forEach((q, qi) => {
    const det = el('details', 'mr-ans');
    const reals = ids.filter(t => c.truth(t, qi) !== undefined).map(t => ({ x: c.truth(t, qi), html: who(P[t]), title: `${name(t)} : ${labelFor(c.truth(t, qi), q)}` }));
    const top = axisLabels(reals, 'real');
    const per = ids.map(t => {
      const real = c.truth(t, qi); if (real === undefined) return '';
      const guesses = ids.filter(g => g !== t && c.A[g]?.[qi]?.[t] !== undefined).map(g => ({ x: c.A[g][qi][t], html: who(P[g]), title: `${name(g)} pensait : ${labelFor(c.A[g][qi][t], q)}`, extra: Math.abs(c.A[g][qi][t] - real) <= 10 ? 'near' : '' }));
      if (!guesses.length) return '';
      const lab = axisLabels([{ x: real, html: `${esc(P[t].emoji || '')} ${esc(name(t))}`, title: `${name(t)} : ${labelFor(real, q)}`, extra: 'self' }, ...guesses], 'guess');
      return `<div class="mr-line"><p class="mr-line-t">Sur ${esc(name(t))}${NB}:</p><div class="mr-axis" style="--rows:${lab.h}">${lab.html}</div></div>`;
    }).join('');
    det.innerHTML = `<summary><span class="mr-qn">${qi + 1}</span><span>${esc(q.q)}<small>${esc(q.cn)}</small></span></summary>
      <div class="mr-ends top" aria-hidden="true"><span>${esc(q.l)}</span><span>${esc(q.r)}</span></div>
      <div class="mr-line"><p class="mr-line-t">Les vraies réponses${NB}:</p><div class="mr-axis" style="--rows:${top.h}">${top.html}</div></div>${per}`;
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
