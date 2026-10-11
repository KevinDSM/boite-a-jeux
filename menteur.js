// Menteur : affichage et commandes. Les règles du jeu sont dans engines/menteur.js.

'use strict';

// ============================================================ écran
// Tout l'écran est la table (table.js, table.css) : les autres assis en arc, chacun derrière son gobelet, l'annonce
// en cours au milieu du tapis, le meneur dans sa bulle de verre, et dans le plateau de verre en bas tes dés sous ton
// gobelet soulevé, avec le choix de l'annonce. À la levée des gobelets, les dés de chacun apparaissent sous son nom.
// Les dés et le gobelet sont dessinés en CSS ; une image img/menteur/<objet>.webp (rendu 3D) les remplace si elle existe.
let mtSel = null, mtSelKey = null, mtLastView = null, mtLastRound = null;
const MT_PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const MT_WORD = ['', 'Paco', 'deux', 'trois', 'quatre', 'cinq', 'six'];
const mtFace = (f, q = 2) => f === 1 ? 'Paco' : MT_WORD[f];
const mtBid = b => `${b.q} ${mtFace(b.f, b.q)}`;
const mtYou = (id, name) => id === net.me ? 'Tu' : esc(name);
// sous l'avatar, un robot garde son 🤖 et perd son « Robot »
const mtSeatP = p => p.bot ? { ...p, name: p.name.replace(/^Robot /, '') } : p;

// les images 3D, si elles existent : chargées une fois, le dessin CSS reste en secours
const MT_IMG = {};
function mtImg(name, cls = 'mtx-img') {
  let s = MT_IMG[name];
  if (!s) {
    s = MT_IMG[name] = { ok: false }; const im = new Image();
    im.onload = () => { s.ok = true; if (view?.mt) renderMenteur(view.mt); };
    im.src = `img/menteur/${name}.webp?v=${ASSET_V}`;
  }
  return s.ok ? `<img class="${cls}" src="img/menteur/${name}.webp?v=${ASSET_V}" alt="" decoding="async">` : '';
}
/** Un dé : six faces dessinées (les Paco en or), ou l'image 3D. */
const mtDie = (f, cls = '') => `<span class="mtx-die f${f} ${cls}" role="img" aria-label="${f === 1 ? 'Paco' : f}">${mtImg('de-' + f)}${MT_PIPS[f].map(i => `<i class="p${i}"></i>`).join('')}</span>`;
const mtCup = (cls = '') => `<span class="mtx-cup ${cls}" aria-hidden="true">${mtImg('gobelet')}<i></i></span>`;

function mtSheetBody() {
  const v = mtLastView; if (!v) return '';
  if (tbSheet.kind === 'mt-log') return tbLog(v.log.slice().reverse());
  return `<p class="tb-sheet-say">${v.total} dés sur la table. Les Paco (les 1) comptent pour toutes les valeurs.</p>`
    + tbRows(v.players.map(p => { const [e, n] = tbSplit(p); return { e, name: n, sub: [p.me ? 'toi' : '', p.out ? 'éliminé' : p.turn ? 'annonce' : '', p.online ? '' : 'absent'].filter(Boolean).join(' · '), score: p.out ? '0' : `${p.n} 🎲`, me: p.me }; }));
}
const mtOpenSheet = kind => tbSheet.open(kind, kind === 'mt-log' ? 'Ce qui s’est passé' : 'Les gobelets', mtSheetBody);

function renderMenteur(v) {
  if (!v) return;
  mtLastView = v;
  const root = $('#mt-main'); root.innerHTML = '';
  if (v.round !== mtLastRound) { mtLastRound = v.round; mtSel = null; }
  const me = v.me || {}, desk = tbDesk(), host = v.isHost;
  const say = (list, j = 0) => list[(v.round + j) % list.length];
  const r = v.reveal;

  // ---------------------------------------------------------------- la ligne de partie
  const chips = [];
  if (v.phase === 'bid') {
    if (v.log.length) chips.push(tbChip(TB_ICON.log + 'Fil', () => mtOpenSheet('mt-log')));
    chips.push(tbChip(`${TB_ICON.people}<b>${v.players.filter(p => !p.out).length}</b> en jeu`, () => mtOpenSheet('mt-cups'), 'Les gobelets'));
  }
  root.appendChild(tbBar(v.phase === 'over' ? 'Partie terminée' : desk ? `Manche <b>${v.round}</b> · <b>${v.total}</b> dés sur la table` : `Manche <b>${v.round}</b> · <b>${v.total}</b> dés`, chips));

  // ---------------------------------------------------------------- la table : les autres derrière leur gobelet, l'annonce au milieu
  const table = el('div', 'mtx-table');
  table.appendChild(tbSeats(v.players.map(mtSeatP), {
    currentId: v.currentId, since: v.since,
    badge: p => p.out ? '' : `${p.n}`,
    cls: p => (p.out ? 'out' : '') + (v.bid?.by === p.id && v.phase === 'bid' ? ' mtx-last' : ''),
    under: p => {
      if (r && r.hands.some(h => h.id === p.id)) {
        const h = r.hands.find(x => x.id === p.id);
        return `<span class="mtx-mini">${h.dice.map(d => mtDie(d, Menteur.counts([d], r.f) ? 'hit' : '')).join('')}</span>`;
      }
      if (p.out) return '<span class="tb-tag soft">plus de dé</span>';
      return v.bid?.by === p.id && v.phase === 'bid' ? `<span class="tb-tag">${mtBid(v.bid)}</span>` : mtCup('mini');
    },
  }));
  const center = el('div', 'mtx-center');
  if (r) {
    const ok = r.count >= r.q;
    center.innerHTML = `<div class="mtx-plate reveal ${ok ? 'true' : 'false'}"><small>${mtYou(r.by, r.byName)} ${r.by === net.me ? 'annonçais' : 'annonçait'} au moins</small>`
      + `<span class="mtx-bid"><b>${r.q}</b><span class="mtx-x">×</span>${mtDie(r.f, 'big')}</span>`
      + `<span class="mtx-verdict">Il y en avait <b>${r.count}</b>${ok ? ', c’était vrai' : ', c’était du bluff'}</span></div>`;
  } else if (v.bid) {
    center.innerHTML = `<div class="mtx-plate"><small>${mtYou(v.bid.by, v.bid.name)} ${v.bid.by === net.me ? 'annonces' : 'annonce'} au moins</small><span class="mtx-bid"><b>${v.bid.q}</b><span class="mtx-x">×</span>${mtDie(v.bid.f, 'big')}</span><span class="mtx-of">sur ${v.total} dés</span></div>`;
  } else center.innerHTML = `<div class="mtx-plate empty"><small>Personne n’a encore parlé</small><span class="mtx-cups">${mtCup()}${mtCup()}${mtCup()}</span><span class="mtx-of">${v.total} dés cachés sur la table</span></div>`;
  if (v.bids.length > 1 && v.phase === 'bid') center.insertAdjacentHTML('beforeend', `<p class="mtx-trail">${v.bids.slice(0, -1).slice(-4).map(b => `<span>${esc(tbSplit(mtSeatP({ name: b.name }))[1])} · ${mtBid(b)}</span>`).join('')}</p>`);
  table.appendChild(center);
  root.appendChild(table);

  // ---------------------------------------------------------------- le meneur
  let title = '', line = '', pip = '', hot = false;
  const B = v.bid ? `au moins ${mtBid(v.bid)}` : '', C = esc(tbSplit(mtSeatP({ name: v.currentName }))[1]);
  if (v.phase === 'bid') {
    if (!me.inGame) { title = `${C} annonce.`; line = me.n === 0 && v.players.some(p => p.me) ? 'Plus de dé pour toi. Profite du spectacle.' : 'Tu regardes, tu joueras à la prochaine partie.'; pip = '👀'; }
    else if (v.myTurn && !v.bid) { title = 'À toi d’ouvrir.'; hot = true; pip = '🎲'; line = say(['Annonce ce que tu crois voir sous tous les gobelets. Pas de Paco pour ouvrir.', 'Regarde tes dés, et parie sur toute la table.']); }
    else if (v.myTurn) { title = 'À toi.'; hot = true; pip = '🤔'; line = `${mtYou(v.bid.by, v.bid.name)} ${v.bid.by === net.me ? 'annonces' : 'annonce'} ${B}. ` + say(['Tu montes, ou tu cries au menteur.', 'Vrai ou bluff ? Monte, ou démasque.', 'Ça sent le bluff, non ?'], v.bids.length); }
    else { title = `${C} réfléchit.`; pip = '⏳'; line = v.bid ? `Sur la table : ${B}.` : say(['Les gobelets sont posés.', 'Personne n’a encore parlé.']); if (v.players.find(p => p.turn)?.bot) line += ' ' + say(['Le robot compte. Enfin, il fait semblant.', 'Les robots aussi savent bluffer.'], v.bids.length); }
  } else if (r && v.phase === 'reveal') {
    const L = mtYou(r.loser, r.loserName);
    title = `Il y en avait ${r.count}.`; pip = r.loser === net.me ? '😬' : '🎲'; hot = r.loser !== net.me && me.inGame;
    line = `${mtYou(r.caller, r.callerName)} ${r.caller === net.me ? 'cries' : 'crie'} au menteur sur ${mtBid(r)}. ${L} ${r.loser === net.me ? 'perds' : 'perd'} un dé${r.out ? (r.loser === net.me ? ', et tu sors de la partie' : ' et sort de la partie') : ''}.`;
  } else if (v.phase === 'over') {
    const won = v.winner === net.me; title = won ? 'Tu gagnes la partie.' : `${esc(v.winnerName)} gagne la partie.`; pip = '🏆'; hot = won;
    line = r ? `Dernière levée : il y avait ${r.count} ${mtFace(r.f)} pour ${mtBid(r)}. Revanche ? Tout se passe au salon.` : 'Revanche ? Tout se passe au salon.';
  }
  root.appendChild(tbSay({ title, line, pip, hot }));

  // ---------------------------------------------------------------- le plateau : tes dés sous ton gobelet, l'annonce
  if (me.inGame || (r && me.dice?.length)) {
    const dice = el('div', 'mtx-mine' + (v.myTurn ? ' turn' : ''));
    dice.innerHTML = `${mtCup('lifted')}<span class="mtx-row">${me.dice.map(d => mtDie(d, r ? (Menteur.counts([d], r.f) ? 'hit' : 'dim') : '')).join('')}</span>`;
    const acts = [];
    let body = dice;
    if (v.myTurn) {
      // le choix de l'annonce : une valeur, puis un nombre (au moins le minimum permis) ; la sélection tient pendant le tour
      const key = `${v.round}|${v.bids.length}`;
      if (mtSelKey !== key || !mtSel) {
        mtSelKey = key;
        const own = f => me.dice.filter(d => d === f || (f !== 1 && d === 1)).length;
        const faces = [2, 3, 4, 5, 6, 1].filter(f => v.min[f - 1] != null);
        const f = v.bid && v.min[v.bid.f - 1] != null ? v.bid.f : faces.sort((a, b) => own(b) - own(a))[0] || 2;
        mtSel = { f, q: v.min[f - 1] ?? 1 };
      }
      const wrap = el('div', 'mtx-pick');
      wrap.appendChild(dice);
      const faces = el('div', 'mtx-faces'); faces.setAttribute('role', 'group'); faces.setAttribute('aria-label', 'Valeur annoncée');
      [2, 3, 4, 5, 6, 1].forEach(f => {
        const m = v.min[f - 1], b = el('button', 'mtx-face' + (mtSel.f === f ? ' on' : ''), `${mtDie(f)}<small>${m == null ? '' : f === 1 ? `Paco · ${m}+` : `${m}+`}</small>`);
        b.type = 'button'; b.disabled = m == null; b.setAttribute('aria-pressed', String(mtSel.f === f));
        b.setAttribute('aria-label', m == null ? `${mtFace(f)}, pas maintenant` : `${mtFace(f)}, au moins ${m}`);
        b.onclick = () => { mtSel = { f, q: Math.max(v.min[f - 1], mtSel.f === f ? mtSel.q : 0) }; renderMenteur(view.mt); };
        faces.appendChild(b);
      });
      wrap.appendChild(faces);
      const minq = v.min[mtSel.f - 1] ?? 1;
      const step = el('div', 'mtx-step');
      const minus = el('button', 'mtx-stepbtn', '−'), plus = el('button', 'mtx-stepbtn', '+');
      minus.type = plus.type = 'button'; minus.setAttribute('aria-label', 'Un dé de moins'); plus.setAttribute('aria-label', 'Un dé de plus');
      minus.disabled = mtSel.q <= minq; plus.disabled = mtSel.q >= v.total;
      minus.onclick = () => { mtSel.q = Math.max(minq, mtSel.q - 1); renderMenteur(view.mt); };
      plus.onclick = () => { mtSel.q = Math.min(v.total, mtSel.q + 1); renderMenteur(view.mt); };
      step.append(minus, el('span', 'mtx-q', `au moins <b>${mtSel.q}</b> ${mtFace(mtSel.f, mtSel.q)}`), plus);
      wrap.appendChild(step);
      body = wrap;
      acts.push(tbBtn('hero', `Annoncer ${mtSel.q} ${mtFace(mtSel.f, mtSel.q)}`, () => act({ t: 'mt:bid', q: mtSel.q, f: mtSel.f })));
      if (v.canCall) acts.push(tbBtn('danger mtx-liar', 'Menteur !', () => act({ t: 'mt:call' })));
    }
    if (v.phase === 'reveal' && host) acts.push(tbBtn('hero', 'Manche suivante', () => act({ t: 'mt:next' })));
    if (v.phase === 'over' && host) acts.push(tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })));
    const tray = tbTray({
      left: `Tes dés · <b>${me.n} dé${me.n > 1 ? 's' : ''}</b>`,
      right: v.myTurn ? (v.bid ? `à battre : ${mtBid(v.bid)}` : 'tu ouvres') : v.phase === 'bid' ? 'sous ton gobelet' : r ? `${r.count} ${mtFace(r.f)} au total` : '',
      body, acts,
    });
    tray.classList.add('mtx-tray');
    root.appendChild(tray);
  } else if ((v.phase === 'reveal' || v.phase === 'over') && host) {
    root.appendChild(tbTray({ acts: [v.phase === 'over' ? tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })) : tbBtn('hero', 'Manche suivante', () => act({ t: 'mt:next' }))] }));
  } else if (v.phase !== 'bid') root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));

  // ---------------------------------------------------------------- fin de partie : le classement
  if (v.phase === 'over' && v.ranking) {
    const box = el('div', 'mtx-rank');
    box.appendChild(el('p', 'mj-side-title', 'Classement'));
    box.insertAdjacentHTML('beforeend', tbRows(v.ranking.map((x, i) => { const [e, n] = tbSplit(v.players.find(p => p.id === x.id) || x); return { e, name: `${i + 1}. ${n}`, sub: i === 0 ? `${x.n} dé${x.n > 1 ? 's' : ''} sous son gobelet` : i === 1 ? 'dernier éliminé' : 'éliminé', me: x.id === net.me }; })));
    root.appendChild(box);
  }

  // ---------------------------------------------------------------- colonne de droite (PC) : les gobelets et le fil
  const side = el('div', 'mt-side' + (v.phase === 'bid' ? ' in-play' : ''));
  side.appendChild(el('p', 'mj-side-title', 'Les gobelets'));
  side.insertAdjacentHTML('beforeend', tbRows(v.players.map(p => { const [e, n] = tbSplit(p); return { e, name: n, sub: [p.me ? 'toi' : '', p.out ? 'éliminé' : p.turn ? 'annonce' : '', p.online ? '' : 'absent'].filter(Boolean).join(' · '), score: p.out ? '0' : `${p.n} 🎲`, me: p.me }; })));
  root.appendChild(side);
  if (v.log.length) {
    const lg = el('div', 'mt-log');
    lg.appendChild(el('p', 'mj-side-title', 'Ce qui s’est passé'));
    lg.insertAdjacentHTML('beforeend', tbLog(v.log.slice().reverse()));
    root.appendChild(lg);
  }
  if (tbSheet.kind === 'mt-log' || tbSheet.kind === 'mt-cups') tbSheet.refresh(v.phase === 'bid');
  if (desk) root.classList.add('mtx-desk'); else root.classList.remove('mtx-desk');
}
