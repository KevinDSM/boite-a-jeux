// Naufrages : affichage et commandes. Les règles du jeu sont dans engines/naufrages.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md). L'île est en 3D (naufrages3d.js : Three.js + modèles Blender) ; sans WebGL,
// on garde le dessin d'avant (nfScene). L'interface suit la table commune (table.js) : le meneur en bulle de verre,
// les choix dans un plateau de verre collé en bas, les naufragés et le fil dans une feuille sur téléphone.
let nfRisk = 0, nfUsing = null, nfTimer = null;
const NF_ACTIONS = [
  { key: 'fish', icon: '🎣', short: 'Pêcher', tip: '1 à 4 poissons', name: 'Pêcher', text: 'De 1 à 4 poissons.', doing: 'Tu vas pêcher.' },
  { key: 'water', icon: '💧', short: 'De l’eau', tip: 'selon la météo', name: 'Chercher de l’eau', text: 'Selon la météo du jour.', doing: 'Tu cherches de l’eau.' },
  { key: 'wood', icon: '🪓', short: 'Du bois', tip: '1 morceau, ou plus', name: 'Couper du bois', text: '1 morceau, plus si tu tentes ta chance.', doing: 'Tu coupes du bois.' },
  { key: 'wreck', icon: '📦', short: 'L’épave', tip: 'un objet caché', name: 'Fouiller l’épave', text: 'Un objet caché, gardé pour toi.', doing: 'Tu fouilles l’épave.' },
];
// la météo en court, pour la puce posée sur l'île
const NF_SKY = w => w === 'ouragan' ? '🌀 Ouragan ce soir' : ['☀️ Grand soleil · 1 ration', '⛅ Nuageux · 2 rations', '🌦️ Averses · 3 rations', '🌧️ Pluie battante · 4 rations'][w] || '';
const NF_WEATHER = w => w === 'ouragan' ? { icon: '🌀', text: 'Ouragan ce soir, 3 rations d’eau par récolte' } : [{ icon: '☀️', text: 'Grand soleil, 1 ration d’eau par récolte' }, { icon: '⛅', text: 'Nuageux, 2 rations d’eau par récolte' }, { icon: '🌦️', text: 'Averses, 3 rations d’eau par récolte' }, { icon: '🌧️', text: 'Pluie battante, 4 rations d’eau par récolte' }][w] || { icon: '', text: '' };
const nfNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
const nfProg = (done, total) => total > 0 ? el('div', 'mj-prog', `${Array.from({ length: total }, (_, i) => `<i${i < done ? ' class="f"' : ''}></i>`).join('')}<span>${done} sur ${total}</span>`) : null;
const nfPlural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

/** L'île : la mer, la plage, le feu de camp, les réserves et le radeau en construction. */
function nfScene(v) {
  const W = 400, H = 210, per = v.woodPerSeat;
  const slots = Math.max(v.alive, v.seats, 1), woodSeats = Math.floor(v.wood / per), partial = v.wood % per;
  const storm = v.weather === 'ouragan';
  let g = `<svg class="nf-scene${storm ? ' storm' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Le camp : ${v.wood} bois, ${v.seats} places sur ${v.alive}">`;
  g += `<defs><linearGradient id="nfSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${storm ? '#3b4658' : '#8fd3f0'}"/><stop offset="1" stop-color="${storm ? '#6b7788' : '#d9f1f7'}"/></linearGradient>`
    + `<linearGradient id="nfSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${storm ? '#2c5a6e' : '#2aa6c4'}"/><stop offset="1" stop-color="${storm ? '#16384a' : '#127a9a'}"/></linearGradient></defs>`;
  g += `<rect width="${W}" height="96" fill="url(#nfSky)"/>`;
  g += storm ? `<g class="nf-clouds" fill="#2a303b" opacity=".85"><ellipse cx="80" cy="30" rx="60" ry="18"/><ellipse cx="200" cy="22" rx="80" ry="20"/><ellipse cx="330" cy="34" rx="70" ry="18"/></g>`
    : `<circle cx="340" cy="30" r="16" fill="#ffe27a"/>` + (v.weather >= 2 ? `<g fill="#ffffff" opacity=".9"><ellipse cx="120" cy="30" rx="34" ry="11"/><ellipse cx="150" cy="24" rx="24" ry="10"/></g>` : '');
  if (!storm && v.weather >= 2) { g += '<g class="nf-rain" stroke="#5aa9d6" stroke-width="1.6" stroke-linecap="round">'; for (let i = 0; i < 14; i++) g += `<line x1="${100 + i * 5}" y1="${40 + (i % 3) * 4}" x2="${96 + i * 5}" y2="${52 + (i % 3) * 4}"/>`; g += '</g>'; }
  g += `<rect y="92" width="${W}" height="${H - 92}" fill="url(#nfSea)"/>`;
  g += `<path class="nf-wave" d="M0 100 q20 -6 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="2"/>`;
  // la plage et le feu de camp
  g += `<path d="M-10 210 L-10 132 Q60 104 170 118 Q250 128 300 158 Q320 176 320 210 Z" fill="#f0d99b"/><path d="M-10 136 Q60 110 168 122" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="3"/>`;
  g += `<g transform="translate(46 118)"><path d="M0 60 q4 -34 -2 -58" stroke="#8a5a2b" stroke-width="5" fill="none" stroke-linecap="round"/><g fill="#2f8a4a"><path d="M-2 2 q-26 -8 -40 8 q18 -4 40 -8"/><path d="M-2 2 q26 -10 40 6 q-18 -2 -40 -6"/><path d="M-2 2 q-10 -24 -30 -26 q14 10 30 26"/><path d="M-2 2 q14 -22 32 -22 q-16 8 -32 22"/></g><circle cx="3" cy="6" r="3.5" fill="#6b4520"/><circle cx="-5" cy="7" r="3.5" fill="#6b4520"/></g>`;
  g += `<g transform="translate(112 168)"><path d="M-14 12 L14 12 M-12 14 L12 8 M-12 8 L12 14" stroke="#6b4520" stroke-width="4" stroke-linecap="round"/><path class="nf-fire" d="M0 10 C-10 0 -4 -8 0 -16 C4 -8 10 0 0 10 Z" fill="#ff8a2a"/><path class="nf-fire" d="M0 9 C-5 3 -2 -2 0 -7 C2 -2 5 3 0 9 Z" fill="#ffd34a"/></g>`;
  // les réserves : un poisson et une jarre par ration, empilés
  const stack = (n, x, y, draw) => { let o = ''; const shown = Math.min(n, 12); for (let i = 0; i < shown; i++) o += draw(x + (i % 4) * 11, y - Math.floor(i / 4) * 9); return o + (n > 12 ? `<text x="${x + 46}" y="${y + 3}" class="nf-more">+${n - 12}</text>` : ''); };
  g += stack(v.food, 150, 176, (x, y) => `<path d="M${x} ${y} q5 -5 10 0 q-5 5 -10 0 Z M${x + 10} ${y} l4 -3 v6 Z" fill="#ff9c6b" stroke="#b5552c" stroke-width=".8"/>`);
  g += stack(v.water, 150, 198, (x, y) => `<path d="M${x + 1} ${y - 7} h7 v2 q3 2 3 6 v4 h-13 v-4 q0 -4 3 -6 Z" fill="#7cc6e8" stroke="#2c7fa6" stroke-width=".8"/>`);
  // le radeau : une place = ${per} bûches ; les places terminées, la place en cours, les places manquantes en pointillés
  const cols = Math.min(slots, 6), rows = Math.ceil(slots / 6), sw = 26, sh = 22, gap = 3;
  const rx = 385 - cols * (sw + gap), ry = 196 - rows * (sh + gap);
  g += `<g class="nf-raft">`;
  for (let k = 0; k < slots; k++) {
    const x = rx + (k % 6) * (sw + gap), y = ry + Math.floor(k / 6) * (sh + gap);
    const full = k < woodSeats, bonus = !full && k < v.seats;
    if (full || bonus) {
      for (let i = 0; i < per; i++) g += `<rect x="${x + i * (sw / per)}" y="${y}" width="${sw / per - 1}" height="${sh}" rx="2" fill="${bonus ? '#c9a15c' : '#a86b34'}" stroke="#6b4520" stroke-width=".8"/>`;
      g += `<path d="M${x} ${y + 6} h${sw} M${x} ${y + sh - 6} h${sw}" stroke="#e8d3a0" stroke-width="1.4"/>`;
    } else if (k === Math.max(woodSeats, v.seats) && partial > 0) {
      for (let i = 0; i < partial; i++) g += `<rect class="nf-log-new" x="${x + i * (sw / per)}" y="${y}" width="${sw / per - 1}" height="${sh}" rx="2" fill="#a86b34" stroke="#6b4520" stroke-width=".8"/>`;
      g += `<rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="3" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-dasharray="3 3"/>`;
    } else g += `<rect x="${x}" y="${y}" width="${sw}" height="${sh}" rx="3" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".55" stroke-dasharray="3 3"/>`;
  }
  if (v.seats >= v.alive && v.alive > 0) {                                      // assez de places : on hisse la voile
    const mx = rx + (cols * (sw + gap)) / 2;
    g += `<path d="M${mx} ${ry - 2} V${ry - 62}" stroke="#6b4520" stroke-width="3"/><path class="nf-sail" d="M${mx + 2} ${ry - 60} Q${mx + 34} ${ry - 36} ${mx + 2} ${ry - 12} Z" fill="#fbf4e2" stroke="#c9b58a"/>`;
  }
  g += `</g>`;
  g += `<text x="${rx + (cols * (sw + gap)) / 2 - gap}" y="${ry - (v.seats >= v.alive && v.alive ? 66 : 6)}" text-anchor="middle" class="nf-raft-label">${v.seats}/${v.alive} places</text>`;
  return g + '</svg>';
}

/** Le calendrier : chaque jour passé avec sa météo ; l'ouragan, lui, ne prévient pas. */
function nfCalendar(v) {
  const icon = w => w === 'ouragan' ? '🌀' : ['☀️', '⛅', '🌦️', '🌧️'][w] || '';
  let h = '<div class="nf-cal">';
  (v.history || []).forEach((w, i) => { h += `<span class="nf-cal-day${i === v.history.length - 1 ? ' today' : ''}${w === 'ouragan' ? ' storm' : ''}"><small>J${i + 1}</small>${icon(w)}</span>`; });
  for (let i = 0; i < 3; i++) h += `<span class="nf-cal-day future"><small>J${v.day + i + 1}</small>?</span>`;
  return h + '</div>';
}

/** La carte d'un naufragé : initiale, nom, état, objets (dos de cartes, jamais leur contenu). */
function nfPersonCard(p, v) {
  const state = p.winner ? { k: 'win', t: '⛵ sur le radeau' } : !p.alive ? { k: 'dead', t: '✝ ' + (p.fate || 'hors jeu') } : p.sick ? { k: 'sick', t: `🤒 malade, ${p.sick} j` }
    : v.phase === 'day' ? { k: p.done ? 'done' : 'wait', t: p.done ? 'a choisi' : 'hésite' } : v.phase === 'vote' ? { k: p.done ? 'done' : 'wait', t: p.done ? 'a voté' : 'hésite' } : { k: 'ok', t: 'en forme' };
  const hue = [...p.name].reduce((a, c) => a + c.charCodeAt(0), 0) * 47 % 360;
  return `<div class="nf-card ${state.k}${p.me ? ' me' : ''}${p.online ? '' : ' off'}"><span class="nf-avatar" style="--h:${hue}">${esc(glyph0(p.name))}</span>`
    + `<span class="nf-card-name">${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.me ? ' <small>(toi)</small>' : ''}</span><span class="nf-card-state">${esc(state.t)}</span>`
    + `<span class="nf-card-items">${'<i></i>'.repeat(Math.min(p.items, 5))}${p.items ? `<small>${p.items} objet${p.items > 1 ? 's' : ''}</small>` : ''}</span></div>`;
}

function renderNaufrages(v) {
  if (!v) return;
  const root = $('#nf-main'); root.innerHTML = ''; clearInterval(nfTimer);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me, n = v.alive;
  const say = list => list[Math.max(0, v.day - 1) % list.length];              // une réplique stable pendant toute la journée
  const names = list => esc(nfNames(list));
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
  const w = NF_WEATHER(v.weather);
  const three = typeof NF3D !== 'undefined' && !NF3D.off();

  // la ligne de partie ; sur téléphone, les puces ouvrent les naufragés et le fil dans la feuille commune
  const chips = [tbChip(`${TB_ICON.people}<b>${n}</b>`, () => tbSheet.open('nf-people', 'Les naufragés', () => nfSheet('people')), 'Les naufragés')];
  if (v.log.length) chips.unshift(tbChip(`${TB_ICON.log}Fil`, () => tbSheet.open('nf-log', 'Ce qui s’est passé', () => nfSheet('log'))));
  root.appendChild(tbBar(`Jour <b>${v.day}</b> · ${nfPlural(n, 'survivant', 'survivants')}`, chips));

  // l'île : en 3D (naufrages3d.js) dans l'emplacement réservé, sinon le dessin d'avant
  if (three && NF3D.ready()) {
    root.appendChild(el('div', 'nf-stage', `<div class="nfx-sky"><span class="tb-chip" title="${esc(w.text)}">${NF_SKY(v.weather)}</span>${nfCalendar(v)}</div>`));
  } else {
    root.appendChild(el('div', 'nf-island', `${nfScene(v)}<p class="nf-weather">${w.icon ? `<span aria-hidden="true">${w.icon}</span> ` : ''}${w.text}</p>${nfCalendar(v)}`));
  }
  if (three) NF3D.update(v, $('#s-naufrages'));

  // ce qui se passe, dit par le meneur
  if (v.flash && (v.phase === 'vote' || v.phase === 'day')) root.appendChild(el('div', 'nf-flash tb-say', `<span class="tb-pip" aria-hidden="true">📣</span><div><p>${esc(v.flash.text)}</p>${v.flash.votes?.length ? `<small>${v.flash.votes.map(esc).join(' · ')}</small>` : ''}</div>`));
  let title = '', line = '', prog = null, pip = '🏝️', hot = false;
  const lacks = [v.food < n ? 'du poisson' : '', v.water < n ? 'de l’eau' : ''].filter(Boolean);
  if (v.phase === 'day') {
    const actors = v.players.filter(p => p.alive && p.canAct && p.online);
    const waiting = actors.filter(p => !p.done && !p.me).map(p => p.name);
    prog = [actors.filter(p => p.done).length, actors.length];
    if (!me) { title = 'Le camp s’organise.'; line = 'Tu regardes, tu joueras à la prochaine partie.'; pip = '👀'; }
    else if (!me.alive) { title = 'Tu es hors jeu.'; line = `${esc(cap(me.fate || ''))}. Regarde la suite en silence.`; pip = '🪦'; }
    else if (me.sick) { title = 'Tu te reposes.'; line = `Morsure de serpent. Encore ${nfPlural(me.sick, 'jour', 'jours')} au lit.`; pip = '🤒'; }
    else if (me.choice) {
      const c = NF_ACTIONS.find(x => x.key === me.choice.action);
      title = me.choice.action === 'wood' && me.choice.risk ? `Tu coupes du bois, et tu tentes ${me.choice.risk} de plus.` : c.doing;
      line = waiting.length ? `Plus que ${names(waiting)}. Tu peux encore changer d’avis.` : 'Tout le monde a choisi.';
      pip = c.icon;
    } else {
      title = 'Que fais-tu aujourd’hui ?'; hot = true; pip = '✋';
      line = lacks.length ? `Il manque ${lacks.join(' et ')} pour ce soir. Personne ne verra ton choix avant le soir.`
        : v.seats < n ? say(['Les vivres tiennent. Le radeau, lui, attend son bois.', 'De quoi manger ce soir. Reste à construire ce radeau.', 'Ton choix reste secret jusqu’au soir. Le radeau, lui, n’attend pas.'])
          : say(['Une place pour chacun. Encore un effort pour les réserves ?', 'Le radeau est là. Il ne manque plus que de quoi tenir la traversée.']);
    }
  } else if (v.phase === 'dusk') {
    title = 'Le soir tombe.'; pip = '🔥';
    line = say(['Voilà ce que la journée a rapporté.', 'On fait les comptes autour du feu.', 'Chacun vide ses poches. Enfin, presque.']);
  } else if (v.phase === 'vote' && v.vote) {
    const vt = v.vote, c = vt.count;
    prog = [vt.done, n]; pip = '🗳️'; hot = !!me?.alive && !vt.mine;
    title = vt.reason === 'food' ? 'Pas assez pour tout le monde.' : v.seats < n ? 'Le radeau est trop petit.' : 'Pas assez de vivres pour la traversée.';
    line = vt.reason === 'food' ? `Il faut désigner ${c > 1 ? `${c} personnes` : 'quelqu’un'}.` : `${c > 1 ? `${c} personnes restent` : 'Une personne reste'} sur l’île.`;
    const waiting = v.players.filter(p => p.alive && p.online && !p.done && !p.me).map(p => p.name);
    if (!me?.alive) line += ' Tu ne votes pas, tu regardes.';
    else if (vt.mine) line += ` Tu désignes ${esc(v.players.find(p => p.id === vt.mine)?.name || '')}.${waiting.length ? ` Plus que ${names(waiting)}.` : ''}`;
    else line += ' Discutez vite, puis votez.';
  } else if (v.phase === 'ready') {
    title = 'Le radeau est prêt.'; pip = '⛵'; hot = true;
    line = 'Assez de places et de vivres pour tout le monde. On part, ou on reste faire des réserves ?';
  } else if (v.phase === 'over') {
    title = me?.won ? 'Tu t’en sors.' : me ? 'Tu restes sur l’île.' : 'Fin de la partie.'; pip = me?.won ? '⛵' : '🏝️'; hot = !!me?.won;
    line = esc(v.outcome || '');
  }
  const status = tbSay({ title, line, pip, hot });
  const bar = prog && nfProg(prog[0], prog[1]); if (bar) status.querySelector('div').appendChild(bar);
  root.appendChild(status);

  // le soir : le compte rendu de la journée
  if (v.phase === 'dusk') {
    const box = el('div', 'nf-report rl-block', '<span class="mj-side-title">La journée</span>');
    const list = el('div', 'mj-list');
    v.report.forEach(l => list.appendChild(el('div', 'mj-row', `<span class="rl-name"><b>${esc(l.name)}</b> ${esc(l.text)}</span>${l.item ? `<span class="rl-tag nf-secret">${l.item === 'rien' ? 'rien trouvé' : `trouvé : ${esc(l.item)}`}</span>` : ''}`)));
    box.appendChild(list); root.appendChild(box);
  }

  // mes objets, secrets
  if (me?.alive && me.items.length && v.phase !== 'over') {
    const box = el('div', 'nf-items rl-block', '<span class="mj-side-title">Tes objets, rien qu’à toi</span>');
    const list = el('div', 'mj-list');
    me.items.forEach((it, idx) => {
      const needTarget = it.key === 'pistolet' || it.key === 'antidote';
      const row = el('div', 'mj-row nf-thing', `<span class="rl-main"><b>${esc(it.name)}</b><small>${esc(it.text)}</small></span>`);
      if (it.key === 'talisman') row.appendChild(el('span', 'rl-tag', 'agit tout seul'));
      else if (nfUsing === idx && needTarget) {
        const g = el('div', 'mj-list rl-choices nf-choices nf-target');
        v.players.filter(p => p.alive && (it.key === 'antidote' || !p.me)).forEach(p => { const b = el('button', 'mj-row rl-opt', `<span class="rl-name">${esc(p.name)}${p.me ? ' <small>(toi)</small>' : ''}</span>`); b.type = 'button'; b.onclick = () => { nfUsing = null; act({ t: 'nf:use', item: it.key, target: p.id }); }; g.appendChild(b); });
        row.classList.add('open'); row.appendChild(g);
        row.appendChild(btn('ghost small', 'Annuler', () => { nfUsing = null; renderNaufrages(view.nf); }));
      } else row.appendChild(btn('small', it.key === 'pistolet' ? 'Tirer' : 'Utiliser', () => { if (needTarget) { nfUsing = idx; renderNaufrages(view.nf); } else act({ t: 'nf:use', item: it.key }); }));
      list.appendChild(row);
    });
    box.appendChild(list); root.appendChild(box);
  }
  if (me?.peek?.length) root.appendChild(el('p', 'nf-peek', `Longue-vue : ${me.peek.map(x => NF_WEATHER(x).icon).join(' ')} ${me.peek.length > 1 ? `les ${me.peek.length} prochains jours` : 'demain'}.`));

  // le plateau de verre, collé en bas : les réserves en tête, puis ce que l'on peut faire maintenant
  const stockLine = `🐟 <b>${v.food}</b> · 💧 <b>${v.water}</b> · 🪵 <b>${v.wood}</b> · radeau <b>${v.seats}/${n}</b>`;
  const body = el('div', 'nfx-body'), acts = [];
  let right = v.food < n || v.water < n ? '<span class="nfx-bad">il manque des vivres</span>' : v.seats < n ? `encore ${v.woodToNext} bois pour une place` : 'une place pour chacun';
  if (v.phase === 'day' && me?.canAct) {
    const grid = el('div', 'nfx-acts');
    NF_ACTIONS.forEach(a => {
      const on = me.choice?.action === a.key;
      const extra = a.key === 'fish' && me.boost.canne ? ' Canne prête : +2.' : a.key === 'wood' && me.boost.hache ? ' Hache prête : +3.' : '';
      const b = el('button', 'nfx-act' + (on ? ' on' : ''), `<i aria-hidden="true">${a.icon}</i><span><b>${a.short}</b><small>${a.tip}${extra ? ',' + extra.replace(' prête :', '') : ''}</small></span>`);
      b.type = 'button'; b.setAttribute('aria-pressed', String(on));
      b.onclick = () => act({ t: 'nf:choose', action: a.key, risk: a.key === 'wood' ? nfRisk : 0 });
      grid.appendChild(b);
    });
    body.appendChild(grid);
    const seg = el('div', 'nfx-risk'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Tenter plus de bois');
    [0, 1, 2, 3, 4, 5].forEach(r => {
      const b = el('button', 'nfx-risk-opt', r ? `+${r}` : 'Sans risque'); b.type = 'button';
      b.setAttribute('aria-pressed', nfRisk === r ? 'true' : 'false');
      b.onclick = () => { nfRisk = r; if (me.choice?.action === 'wood') act({ t: 'nf:choose', action: 'wood', risk: r }); else renderNaufrages(view.nf); };
      seg.appendChild(b);
    });
    body.appendChild(el('p', 'nfx-risk-t', 'Pour le bois, tenter plus'));
    body.appendChild(seg);
    body.appendChild(el('p', 'nfx-note', nfRisk ? `${Math.round((1 - Math.pow(5 / 6, nfRisk)) * 100)} % de risque de morsure : deux jours malade, et rien rapporté.` : 'Sans risque : 1 morceau de bois.'));
    right = me.choice ? 'ton choix est fait' : 'touche ton choix';
  }
  if (v.phase === 'vote' && v.vote) {
    if (me?.alive) {
      const list = el('div', 'nfx-votes');
      v.players.filter(p => p.alive).forEach(p => {
        const safe = v.vote.protected.includes(p.id), on = v.vote.mine === p.id, [e, nm] = tbSplit(p);
        const b = el('button', 'nfx-vote' + (on ? ' on' : ''), `<span class="nfx-vote-e">${esc(e)}</span><span><b>${esc(nm)}${p.me ? ' <small>toi</small>' : ''}</b><small>${safe ? 'talisman' : on ? 'ton vote' : p.done ? 'a voté' : ''}</small></span>`);
        b.type = 'button'; b.disabled = safe; b.onclick = () => act({ t: 'nf:vote', target: p.id });
        list.appendChild(b);
      });
      body.appendChild(list);
    }
    const tb = el('div', 'nf-timer'), i = el('i'); tb.appendChild(i); body.appendChild(tb);
    const t0 = Date.now(), left0 = v.vote.left; const paintT = () => { i.style.width = Math.max(0, 100 * (left0 - (Date.now() - t0)) / 45000) + '%'; }; paintT(); nfTimer = setInterval(paintT, 250);
    body.appendChild(el('p', 'nfx-note', 'Le plus désigné part. À égalité, le hasard tranche.'));
    if (v.isHost) acts.push(tbBtn('glass', 'Clore le vote maintenant', () => act({ t: 'nf:skip' })));
    right = `${v.vote.done} sur ${n} ont voté`;
  }
  if (v.phase === 'dusk') { if (v.isHost) acts.push(tbBtn('hero', 'Passer au repas du soir', () => act({ t: 'nf:next' }))); else body.appendChild(el('p', 'nfx-note', 'L’hôte lance le repas du soir.')); }
  if (v.phase === 'ready') {
    if (v.isHost) acts.push(tbBtn('hero', 'Prendre la mer', () => act({ t: 'nf:leave' })), tbBtn('glass', 'Rester un jour de plus', () => act({ t: 'nf:stay' })));
    else body.appendChild(el('p', 'nfx-note', 'L’hôte décide. Donne-lui ton avis, et fort.'));
  }
  if (v.phase === 'over' && v.isHost) acts.push(tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })));
  root.appendChild(tbTray({ left: v.phase === 'over' ? 'Fin de la partie' : stockLine, right, body: body.children.length ? body : null, acts }));

  // les réserves du camp, les naufragés et le fil : colonne de droite sur PC (desk.js), feuille sur téléphone
  const stock = el('div', 'nf-camp rl-block', '<span class="mj-side-title">Les réserves</span>');
  const sl = el('div', 'mj-list');
  const res = (name, value, tag, bad) => sl.appendChild(el('div', 'mj-row', `<span class="rl-name">${name}</span>${v.phase === 'over' ? '' : `<span class="rl-tag${bad ? ' bad' : ''}">${tag}</span>`}<b class="rl-score">${value}</b>`));
  res('Poissons', v.food, `il en faut ${n} ce soir`, v.food < n);
  res('Eau', v.water, `il en faut ${n} ce soir`, v.water < n);
  res('Bois', v.wood, `encore ${v.woodToNext} pour une place`, false);
  res('Radeau', `${v.seats}/${n}`, v.seats >= n ? 'une place pour chacun' : `il manque ${nfPlural(n - v.seats, 'place', 'places')}`, v.seats < n);
  stock.appendChild(sl); root.appendChild(stock);
  const people = el('div', 'nf-people rl-block', '<span class="mj-side-title">Les naufragés</span>');
  const cards = el('div', 'nf-cards'); v.players.forEach(p => cards.insertAdjacentHTML('beforeend', nfPersonCard(p, v)));
  people.appendChild(cards); root.appendChild(people);
  if (v.log.length) {
    const lg = el('div', 'nf-log rl-log', '<span class="mj-side-title">Ce qui s’est passé</span>');
    const ul = el('ul'); v.log.slice().reverse().forEach(t => ul.appendChild(el('li', '', esc(t)))); lg.appendChild(ul);
    root.appendChild(lg);
  }
  nfLast = v;
  tbSheet.refresh(String(tbSheet.kind || '').startsWith('nf-'));
}

// la feuille du téléphone : les naufragés (état, objets) ou le fil de la partie
let nfLast = null;
function nfSheet(kind) {
  const v = nfLast; if (!v) return '';
  if (kind === 'log') return tbLog(v.log.slice().reverse());
  return tbRows(v.players.map(p => {
    const [e, nm] = tbSplit(p);
    const st = p.winner ? 'sur le radeau' : !p.alive ? (p.fate || 'hors jeu') : p.sick ? `malade, ${p.sick} j` : v.phase === 'day' ? (p.done ? 'a choisi' : 'hésite') : v.phase === 'vote' ? (p.done ? 'a voté' : 'hésite') : 'en forme';
    return { e, name: nm, sub: [p.me ? 'toi' : '', st, p.items ? `${p.items} objet${p.items > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '), me: p.me };
  }));
}
