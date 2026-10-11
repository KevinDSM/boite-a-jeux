/* Boîte à jeux · la table de jeu commune (nouveau style des jeux, d'après le pilote Chromo).
   Petites briques d'affichage partagées par les jeux de table : les adversaires assis en arc, le meneur
   dans sa bulle de verre, les puces, le plateau de verre collé en bas avec une main en éventail, et une
   feuille (#tb-sheet) pour les scores ou le fil sur téléphone. Le style est dans table.css.
   Un écran qui s'en sert porte la classe « tb » (index.html) : il passe alors sur le tapis plein écran. */
'use strict';

// « 🦊 Kevin » → ['🦊', 'Kevin'] ; un robot n'a pas d'emoji, on lui en donne un
const tbSplit = p => { const n = p?.name || '', i = n.indexOf('\u00a0'), e = i > 0 && i <= 8 ? n.slice(0, i) : ''; return e && /\p{Extended_Pictographic}/u.test(e) ? [e, n.slice(i + 1)] : [p?.bot ? '🤖' : glyph0(n), n]; };
// un angle stable par identifiant, pour que les cartes posées ne « dansent » pas à chaque diffusion
const tbTilt = (id, span) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((Math.abs(h) % 1000) / 1000 - 0.5) * span; };
const tbDesk = () => matchMedia('(min-width: 1100px)').matches;

/** Une puce de verre ; avec onclick, c'est un bouton. */
function tbChip(html, onclick, label) {
  const c = el(onclick ? 'button' : 'span', 'tb-chip', html);
  if (onclick) { c.type = 'button'; c.onclick = onclick; }
  if (label) c.setAttribute('aria-label', label);
  return c;
}
const TB_ICON = {
  log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.5c.7-3.4 3.2-5.3 6.2-5.3s5.5 1.9 6.2 5.3"/><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2"/><path d="M17.6 14.6c1.9.7 3.2 2.4 3.6 4.9"/></svg>',
};

/** La ligne du haut : une puce d'information à gauche, des puces-boutons à droite (cachées sur PC). */
function tbBar(leftHtml, chips = []) {
  const bar = el('div', 'tb-bar');
  bar.appendChild(tbChip(leftHtml));
  if (chips.length) { const r = el('span', 'tb-chips'); chips.forEach(c => r.appendChild(c)); bar.appendChild(r); }
  return bar;
}

/**
 * Les adversaires assis en arc, dans l'ordre du jeu en partant de ta gauche.
 * players : [{id, name, bot, online}] dans l'ordre du jeu ; opts.currentId : qui joue ;
 * opts.since : instant (ms) où son tour a commencé, pour l'anneau de 20 s (null = pas d'anneau qui file) ;
 * opts.badge(p) : petit nombre sur la pastille (cartes, jetons…) ; opts.under(p) : html sous le prénom ;
 * opts.fan : true pour dessiner trois dos de cartes à côté de l'avatar ; opts.cls(p) : classes en plus.
 */
function tbSeats(players, opts = {}) {
  const me = opts.meId ?? net.me, idx = players.findIndex(p => p.id === me);
  const others = idx < 0 ? players.slice() : [...players.slice(idx + 1), ...players.slice(0, idx)];
  const m = others.length, box = el('div', 'tb-opps' + (m > 4 ? ' many' : '') + (m === 0 ? ' none' : ''));
  others.forEach((p, i) => {
    const [e, nm] = tbSplit(p), t = (i + 0.5) / Math.max(1, m), now = p.id === opts.currentId;
    const badge = opts.badge ? opts.badge(p) : null;
    const o = el('div', 'tb-opp' + (now ? ' now' : '') + (p.online === false ? ' off' : '') + (p.bot ? ' bot' : '') + (opts.cls ? ' ' + opts.cls(p) : ''),
      `<span class="tb-av">${e}${now ? '<i class="tb-timer"></i>' : ''}</span>`
      + (opts.fan ? `<span class="tb-fan" aria-hidden="true"><i></i><i></i><i></i></span>` : '')
      + (badge != null && badge !== '' ? `<b class="tb-badge${opts.hot && opts.hot(p) ? ' hot' : ''}">${badge}</b>` : '')
      + `<span class="tb-nm">${esc(nm)}</span>` + (opts.under ? opts.under(p) || '' : ''));
    o.style.left = (m === 1 ? 50 : 9 + 82 * t).toFixed(2) + '%';
    o.style.top = ((1 - Math.sin(Math.PI * t)) * (m > 4 ? 30 : 34)).toFixed(1) + 'px';
    if (now && !p.bot && opts.since != null) o.style.setProperty('--since', `${-Math.min(20, (Date.now() - opts.since) / 1000)}s`);
    else if (now) o.classList.add('still');
    box.appendChild(o);
  });
  return box;
}

/** Le meneur : une bulle de verre avec une pastille (emoji), un titre et une phrase. hot = c'est à toi. */
function tbSay({ title = '', line = '', pip = '', hot = false } = {}) {
  return el('div', 'tb-say mj-status' + (hot ? ' hot' : ''), `${pip ? `<span class="tb-pip" aria-hidden="true">${pip}</span>` : ''}<div><h3 class="mj-title">${title}</h3>${line ? `<p class="mj-say">${line}</p>` : ''}</div>`);
}

/** Le plateau de verre collé en bas : un en-tête (gauche / droite), un contenu, des actions. */
function tbTray({ left = '', right = '', body = null, acts = [] } = {}) {
  const tray = el('section', 'tb-tray');
  if (left || right) tray.appendChild(el('div', 'tb-tray-top', `<span>${left}</span><span>${right}</span>`));
  if (body) tray.appendChild(body);
  const a = acts.filter(Boolean);
  if (a.length) { const row = el('div', 'tb-acts'); a.forEach(b => row.appendChild(b)); tray.appendChild(row); }
  return tray;
}
/** Un bouton du plateau : 'glass' (secondaire), 'hero' (le geste fort, doré), 'danger'. */
function tbBtn(kind, label, fn) { const b = el('button', 'btn tb-btn ' + kind, label); b.type = 'button'; b.onclick = fn; return b; }

/**
 * Une main en éventail. items : [{html, cls, ok, no, onclick, label}] ; html = la carte elle-même (un élément
 * avec sa classe de carte). Les cartes sont posées dans des .tb-slot (position, rotation, soulèvement) pour que
 * l'appui (ressort d'ios.js) reste libre sur la carte. Main longue : à plat, et on fait défiler.
 * opts.w : largeur d'une carte (px), opts.ratio : hauteur / largeur, opts.width : largeur disponible.
 */
function tbFan(items, opts = {}) {
  const desk = tbDesk(), w = opts.w || (desk ? 92 : 68), H = Math.round(w * (opts.ratio || 1.44));
  const W = Math.max(240, opts.width || 340), k = items.length;
  const cap = opts.cap || (desk ? 76 : (k <= 4 ? 62 : 46)), minGap = desk ? 38 : 26;
  const gap = k > 1 ? Math.min(cap, (W - w) / (k - 1)) : 0, flat = gap < minGap, g = flat ? minGap : gap;
  const span = (k - 1) * g + w, full = Math.max(W, span);
  const fan = el('div', 'tb-fan-hand' + (flat ? ' flat' : ''));
  const inner = el('div', 'tb-fan-in'); inner.style.width = full + 'px'; inner.style.height = (H + 34) + 'px';
  items.forEach((it, i) => {
    const d = i - (k - 1) / 2;
    const slot = el('div', 'tb-slot' + (it.ok ? ' ok' : '') + (it.no ? ' no' : '') + (it.cls ? ' ' + it.cls : ''), it.html);
    const y = (it.ok || it.lift ? -16 : 0) + (flat ? 0 : d * d * 2.2) + 18;
    slot.style.cssText = `left:${((full - span) / 2 + i * g).toFixed(1)}px;width:${w}px;transform:translateY(${y.toFixed(1)}px) rotate(${flat ? 0 : (d * (desk ? 3.4 : 4.6)).toFixed(1)}deg);z-index:${i}`;
    const card = slot.firstElementChild;
    if (card && it.onclick) { card.addEventListener('click', it.onclick); card.setAttribute('role', 'button'); card.tabIndex = 0; }
    if (card && it.label) card.setAttribute('aria-label', it.label);
    inner.appendChild(slot);
  });
  // la hauteur suit la carte la plus basse de l'éventail (les bords descendent et tournent) : rien ne dépasse du plateau
  const edge = (k - 1) / 2, rot = flat ? 0 : edge * (desk ? 3.4 : 4.6) * Math.PI / 180;
  const low = 18 + (flat ? 0 : edge * edge * 2.2) + H * Math.cos(rot) + w * Math.abs(Math.sin(rot)) / 2;
  inner.style.height = Math.ceil(Math.max(H + 34, low + 6)) + 'px';
  fan.appendChild(inner);
  return fan;
}

/** La feuille commune (#tb-sheet) : scores, fil, règles du salon… body() est rappelé à chaque diffusion. */
const tbSheet = {
  kind: null, body: null,
  open(kind, title, body) { this.kind = kind; this.body = body; $('#tb-sheet-title').textContent = title; $('#tb-sheet-body').innerHTML = body(); $('#tb-sheet').hidden = false; },
  refresh(stillValid = true) { if ($('#tb-sheet').hidden || !this.body) return; if (!stillValid) { this.close(); return; } $('#tb-sheet-body').innerHTML = this.body(); },
  close() { $('#tb-sheet').hidden = true; this.kind = null; this.body = null; },
};
$('#tb-sheet-close').onclick = () => tbSheet.close();
$('#tb-sheet').onclick = e => { if (e.target.id === 'tb-sheet') tbSheet.close(); };

/** Une liste de joueurs pour la feuille ou la colonne de droite : [{e, name, sub, score, me}] */
const tbRows = rows => `<ul class="tb-rows">${rows.map(r => `<li${r.me ? ' class="me"' : ''}><span class="tb-e">${r.e || ''}</span><span class="tb-n">${esc(r.name)}${r.sub ? `<small>${r.sub}</small>` : ''}</span>${r.score != null ? `<b class="tb-s">${r.score}</b>` : ''}</li>`).join('')}</ul>`;
const tbLog = lines => `<ul class="tb-log">${lines.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
