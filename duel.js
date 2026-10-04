// Duel : affichage et commandes. Les règles du jeu sont dans engines/duel.js.

'use strict';

const DU_RES = { B: '🪵', A: '🧱', P: '🪨', V: '🧪', Y: '📜' };
const DU_RES_NAME = { B: 'bois', A: 'argile', P: 'pierre', V: 'verre', Y: 'papyrus' };
const DU_SCI = { roue: '☸️', compas: '📐', plume: '🪶', pilon: '⚗️', sablier: '⏳', globe: '🌐', balance: '⚖️' };
const DU_CHAIN = { masque: '🎭', lune: '🌙', goutte: '💧', fer: '🐎', epee: '🗡️', tour: '🗼', livre: '📖', engrenage: '🔧', jarre: '🏺', pilier: '🏛️', soleil: '☀️', fronton: '📯', lampe: '💡', harpe: '🎵', cible: '🎯', casque: '⛑️', baril: '🛢️' };
const DU_COLOR = { brun: 'matière première', gris: 'produit manufacturé', bleu: 'bâtiment civil', vert: 'bâtiment scientifique', rouge: 'bâtiment militaire', jaune: 'bâtiment commercial', violet: 'guilde' };
const DU_GUILD = {
  batisseurs: '2 points par merveille de la cité qui en a le plus.',
  preteurs: '1 point par tranche de 3 pièces de la cité la plus riche.',
  vert: '1 pièce et 1 point par bâtiment vert de la cité qui en a le plus.',
  brungris: '1 pièce et 1 point par carte marron et grise de la cité qui en a le plus.',
  jaune: '1 pièce et 1 point par bâtiment jaune de la cité qui en a le plus.',
  bleu: '1 pièce et 1 point par bâtiment bleu de la cité qui en a le plus.',
  rouge: '1 pièce et 1 point par bâtiment rouge de la cité qui en a le plus.',
};


// ============================================================ écran
let duSel = null, duSelKey = null, duInfo = null;
const duCost = str => {
  const p = Duel.parse(str); let h = '';
  if (p.coins) h += `<span class="du-coin">${p.coins}</span>`;
  Object.entries(p.res).forEach(([r, n]) => { h += DU_RES[r].repeat(n); });
  return h || '<span class="du-free">gratuit</span>';
};
function duEffShort(c) {
  const out = [];
  if (c.p) out.push(c.p.split('').map(r => DU_RES[r]).join(''));
  if (c.ch) out.push(c.ch.split('').map(r => DU_RES[r]).join('/'));
  if (c.tr) out.push(c.tr.split('').map(r => DU_RES[r]).join('') + '=1');
  if (c.sci) out.push(DU_SCI[c.sci]);
  if (c.sh) out.push('⚔️'.repeat(c.sh));
  if (c.vp) out.push(`<b class="du-vp">${c.vp}</b>`);
  if (c.co) out.push(`<span class="du-coin">${c.co}</span>`);
  if (c.per) out.push(`<span class="du-coin">${c.pc}</span>/${c.per === 'merveille' ? '🏛' : `<i class="du-sq t-${c.per}"></i>`}`);
  if (c.g) out.push('👑');
  return out.join(' ');
}
function duEffLong(c) {
  const out = [];
  if (c.p) out.push(`Produit ${c.p.split('').map(r => DU_RES[r] + ' ' + DU_RES_NAME[r]).join(', ')} à chaque tour.`);
  if (c.ch) out.push(`Produit au choix ${c.ch.split('').map(r => DU_RES[r]).join(' ou ')} à chaque tour.`);
  if (c.tr) out.push(`Tu achètes ${c.tr.split('').map(r => DU_RES[r] + ' ' + DU_RES_NAME[r]).join(' et ')} à 1 pièce seulement.`);
  if (c.sci) out.push(`Symbole scientifique ${DU_SCI[c.sci]} : deux fois le même donne un jeton progrès, six différents font gagner.`);
  if (c.sh) out.push(`${c.sh} bouclier${c.sh > 1 ? 's' : ''} : le pion avance d’autant vers la capitale adverse.`);
  if (c.co) out.push(`+${c.co} pièces tout de suite.`);
  if (c.per) out.push(`+${c.pc} pièce${c.pc > 1 ? 's' : ''} par ${c.per === 'merveille' ? 'merveille bâtie' : `carte ${c.per === 'brun' ? 'marron' : c.per}`} de ta cité, tout de suite.`);
  if (c.g) out.push(DU_GUILD[c.g]);
  if (c.vp) out.push(`${c.vp} point${c.vp > 1 ? 's' : ''} de victoire.`);
  if (c.cf) out.push(`Gratuit si tu as ${DU_CHAIN[c.cf]}.`);
  if (c.ct) out.push(`Donne ${DU_CHAIN[c.ct]} : une carte d’un âge suivant sera gratuite.`);
  return out.join(' ');
}
function duWonderLong(W) {
  const out = [];
  if (W.co) out.push(`+${W.co} pièces`);
  if (W.lose) out.push(`l’adversaire perd ${W.lose} pièces`);
  if (W.sh) out.push(`${W.sh} bouclier${W.sh > 1 ? 's' : ''}`);
  if (W.destroy) out.push(`détruit une carte ${W.destroy === 'brun' ? 'marron' : 'grise'} adverse`);
  if (W.library) out.push('choisis un jeton progrès parmi 3 hors du jeu');
  if (W.revive) out.push('construis gratuitement une carte de la défausse');
  if (W.ch) out.push(`produit au choix ${W.ch.split('').map(r => DU_RES[r]).join(' ou ')}`);
  if (W.replay) out.push('tu rejoues');
  if (W.vp) out.push(`${W.vp} points`);
  const t = out.join(', ') + '.';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const duToken = k => DU_TOKENS.find(t => t.k === k);

function duCity(v, k) {
  const c = v.cities[k], seat = v.seats[k], me = k === v.mySeat, turn = v.cur === k && v.phase !== 'over';
  const d = el('div', `du-city${me ? ' mine' : ' opp'}${turn ? ' turn' : ''}`);
  const prod = Object.entries(c.prod).map(([r, n]) => `<span class="du-res${n ? '' : ' zero'}" title="${DU_RES_NAME[r]}">${DU_RES[r]}<b>${n}</b></span>`).join('');
  const extra = [...c.choices.map(ch => `<span class="du-res ch">${ch.split('').map(r => DU_RES[r]).join('/')}</span>`), ...c.trade.map(r => `<span class="du-res tr">${DU_RES[r]}=1</span>`)].join('');
  const groups = ['brun', 'gris', 'jaune', 'rouge', 'bleu', 'vert', 'violet'].map(t => c.cards.filter(i => DU_CARDS[i].t === t)
    .map(i => `<button type="button" class="du-pill t-${t}" data-info="c${i}">${esc(DU_CARDS[i].n)}</button>`).join('')).join('');
  const sci = Object.entries(c.sci).map(([s, n]) => `<span class="du-sci">${DU_SCI[s]}${n > 1 ? '×2' : ''}</span>`).join('');
  const wonders = c.wonders.map(w => { const W = DU_WONDERS[w.w]; return `<button type="button" class="du-w${w.built ? ' built' : ''}${w.lost ? ' lost' : ''}" data-info="w${w.w}"><b>${esc(W.n)}</b><span>${w.built ? 'bâtie' : w.lost ? 'perdue' : duCost(W.c)}</span></button>`; }).join('');
  const tokens = c.tokens.map(t => `<button type="button" class="du-tok small" data-info="t${t}" title="${esc(duToken(t).n)}">${duToken(t).i}</button>`).join('');
  const tag = turn ? `<span class="du-city-turn">${me ? 'à toi' : 'joue'}</span>` : '';
  d.innerHTML = `<div class="du-city-head"><span class="du-city-name">${seat.bot ? '🤖 ' : ''}${esc(seat.name)}${me ? ' <small>toi</small>' : ''}${seat.online ? '' : ' <small>hors ligne</small>'}</span>${tag}<span class="du-coins" title="pièces"><span class="du-coin">${c.coins}</span></span><span class="du-score">${c.vp} point${c.vp > 1 ? 's' : ''}</span></div>`
    + `<div class="du-city-row"><span class="du-lbl">Production</span><div class="du-prodrow">${prod}${extra}</div></div>`
    + (sci || tokens ? `<div class="du-city-row"><span class="du-lbl">Science et progrès</span><div class="du-scirow">${sci}${tokens}</div></div>` : '')
    + (wonders ? `<div class="du-city-row"><span class="du-lbl">Merveilles</span><div class="du-wonders">${wonders}</div></div>` : '')
    + (groups ? `<div class="du-city-row"><span class="du-lbl">Bâtiments</span><div class="du-pills">${groups}</div></div>` : '');
  return d;
}

function duTrack(v) {
  const flipSide = v.mySeat === 1, pos = flipSide ? -v.military : v.military;
  const left = v.seats[flipSide ? 1 : 0], right = v.seats[flipSide ? 0 : 1];
  let cells = '';
  for (let i = -9; i <= 9; i++) {
    const zone = Math.abs(i) >= 6 ? 'z3' : Math.abs(i) >= 3 ? 'z2' : Math.abs(i) >= 1 ? 'z1' : 'z0';
    // pillage : le jeton du côté droit (i > 0) frappe la cité de droite
    const seatHit = i > 0 ? (flipSide ? 0 : 1) : (flipSide ? 1 : 0);
    const tok = (Math.abs(i) === 3 || Math.abs(i) === 6) && !v.milTok[`${seatHit}-${Math.abs(i)}`] ? `<i class="du-loot">−${Math.abs(i) === 3 ? 2 : 5}</i>` : '';
    cells += `<span class="du-cell ${zone}${i === pos ? ' pawn' : ''}">${i === pos ? '<b class="du-pawn">⚔️</b>' : ''}${tok}</span>`;
  }
  return el('div', 'du-track', `<span class="du-cap l">🏰 ${esc(left.name)}</span><div class="du-cells">${cells}</div><span class="du-cap r">${esc(right.name)} 🏰</span>`);
}

function duCardTile(v, b, W) {
  const c = b.card !== null ? DU_CARDS[b.card] : null;
  const cls = ['du-card', c ? 't-' + c.t : 'back', b.acc ? 'acc' : 'cov', duSel === b.bi ? 'sel' : ''];
  if (!c) return `<button type="button" class="${cls.join(' ')} age${b.back}" data-bi="${b.bi}" disabled><span class="du-back">${b.back === 'G' ? '👑' : ['', 'I', 'II', 'III'][b.back]}</span></button>`;
  let tag = '';
  if (b.price) tag = b.price.chain ? '<span class="du-tag ok">🔗</span>' : `<span class="du-tag${b.price.total > v.cities[v.mySeat].coins ? ' no' : ''}">${b.price.total || '✓'}</span>`;
  return `<button type="button" class="${cls.join(' ')}" data-bi="${b.bi}"><span class="du-cc">${duCost(c.c).replace('<span class="du-free">gratuit</span>', '')}</span><span class="du-eff">${duEffShort(c)}</span>${W > 58 ? `<span class="du-nm">${esc(c.n)}</span>` : ''}${c.ct ? `<span class="du-ct">${DU_CHAIN[c.ct]}</span>` : ''}${tag}</button>`;
}

const DU_AGE = ['', 'I', 'II', 'III'];
const duPieces = n => `${n} pièce${n > 1 ? 's' : ''}`;

/** Ce que dit le meneur : [titre, réplique]. Les variantes suivent l'âge et le nombre de cartes prises : stables pendant un tour. */
function duVoice(v) {
  const me = v.mySeat, watch = me < 0, opp = me === 1 ? 0 : 1;
  const taken = v.board.filter(b => b.taken).length;
  const say = list => list[(v.age + taken) % list.length];
  const name = s => esc(v.seats[s]?.name || '');
  const cur = name(v.cur);
  if (v.phase === 'draft') {
    const k = v.draft.pool.length;
    if (v.draft.picker === me) return ['À toi de choisir.', ['Une merveille pour ta cité. Chacun en aura quatre.', 'Prends celle qui te fait envie. Chacun en aura quatre.'][k % 2]];
    return [`${cur} choisit.`, watch ? 'Tu regardes la partie.' : ['Croise les doigts pour ta préférée.', 'Il reste de belles merveilles. Pour l’instant.'][k % 2]];
  }
  if (v.phase === 'start') {
    const next = DU_AGE[v.age + 1];
    if (v.chooser === me) return ['Tu choisis qui commence.', v.military !== 0 ? `Ton armée traîne, alors tu décides qui ouvre l’âge ${next}.` : `Tu as pris la dernière carte, alors tu décides qui ouvre l’âge ${next}.`];
    return [`${name(v.chooser)} choisit qui commence.`, `L’âge ${next} se prépare.`];
  }
  if (v.phase === 'over') {
    const w = v.winner, f = v.final;
    if (w < 0) return ['Égalité parfaite.', `${f[0].total} points partout, et autant de bleu. Personne ne gagne.`];
    const title = w === me ? 'Tu gagnes.' : `${name(w)} gagne.`;
    const line = v.winType === 'militaire' ? 'Victoire militaire. Le pion a pris la capitale.'
      : v.winType === 'scientifique' ? 'Victoire scientifique. Six symboles, rien à ajouter.'
        : `Victoire civile, ${f[w].total} points à ${f[1 - w].total}.`;
    return [title, line];
  }
  const p = v.pending;
  if (p) {
    const color = p.color === 'brun' ? 'marron' : 'grise';
    if (p.mine) return {
      token: ['Deux symboles pareils.', 'Prends un jeton progrès.'],
      library: ['Grande Bibliothèque.', 'Un jeton parmi ces trois, tirés hors du jeu.'],
      destroy: ['Place à la démolition.', `Choisis la carte ${color} à raser chez ${name(opp)}.`],
      revive: ['Fouille la défausse.', 'La carte choisie se construit gratuitement.'],
    }[p.type];
    return [`${esc(p.who)} choisit.`, {
      token: 'Un jeton progrès à empocher.', library: 'Un jeton progrès, tiré hors du jeu.',
      destroy: watch ? `Une carte ${color} va y passer.` : `Une de tes cartes ${p.color === 'brun' ? 'marron' : 'grises'} va y passer.`, revive: 'La défausse se fait fouiller.',
    }[p.type]];
  }
  if (v.myTurn) return ['À toi.', say(['Ta cité attend ses ouvriers.', 'Choisis bien, ton rival lorgne peut-être la même carte.', 'Chaque carte que tu laisses, l’autre peut la prendre.'])];
  if (watch) return [`${cur} joue.`, 'Tu regardes la partie.'];
  return [`${cur} joue.`, say(['Touche une carte pour la lire en attendant.', 'Surveille ses pièces, et la piste militaire.', 'Prépare ta riposte.'])];
}

function renderDuel(v) {
  if (!v) return;
  const root = $('#du-main'); root.innerHTML = '';
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.mySeat, opp = me === 1 ? 0 : 1, watch = me < 0;
  const key = v.age + ':' + v.phase;
  if (key !== duSelKey) { duSelKey = key; duSel = null; }
  if (duSel !== null && (!v.board[duSel] || v.board[duSel].taken)) duSel = null;

  // ce qui se passe, dit par le meneur
  let meta = '';
  if (v.phase === 'draft') meta = 'Repêchage des merveilles';
  else if (v.phase === 'play') {
    const left = v.board.filter(b => !b.taken).length;
    meta = `Âge ${DU_AGE[v.age]} · ${left} carte${left > 1 ? 's' : ''} à prendre${v.discard.length ? ` · ${v.discard.length} à la défausse` : ''}`;
  } else if (v.phase === 'start') meta = `Fin de l’âge ${DU_AGE[v.age]}`;
  else meta = `Partie terminée${v.winType ? ` · victoire ${v.winType}` : ''}`;
  root.appendChild(el('p', 'mj-meta', meta));
  const [title, line] = duVoice(v);
  root.appendChild(el('div', 'mj-status du-status', `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`));

  root.appendChild(duCity(v, watch ? 1 : opp));
  root.appendChild(duTrack(v));
  if (v.tokensBoard.length) root.appendChild(el('div', 'du-tokens', v.tokensBoard.map(k => `<button type="button" class="du-tok" data-info="t${k}">${duToken(k).i}<small>${duToken(k).n}</small></button>`).join('')));

  // la pyramide
  if (v.phase === 'play' || v.phase === 'start') {
    const full = root.clientWidth || 360, desk = typeof DESK !== 'undefined' && DESK.matches;   // sur PC, les cités passent dans la colonne de droite
    const W0 = Math.max(280, Math.min(desk ? full - 368 : full, 720));
    const xs = v.board.map(b => b.x), minX = Math.min(...xs), maxX = Math.max(...xs), rows = Math.max(...v.board.map(b => b.r)) + 1;
    const unit = Math.min(W0 / (maxX - minX + 2), 46), W = Math.round(unit * 2 - 4), H = Math.round(W * 1.36), step = Math.round(H * 0.5);
    const pyr = el('div', 'du-pyr');
    pyr.style.width = Math.round(unit * (maxX - minX + 2)) + 'px'; pyr.style.height = ((rows - 1) * step + H) + 'px';
    pyr.style.setProperty('--w', W + 'px'); pyr.style.setProperty('--h', H + 'px');
    pyr.innerHTML = v.board.filter(b => !b.taken).map(b => duCardTile(v, b, W).replace('<button', `<button style="left:${Math.round((b.x - minX) * unit + 2)}px;top:${b.r * step}px;z-index:${b.r + 1}"`)).join('');
    pyr.onclick = e => { const t = e.target.closest('[data-bi]'); if (!t) return; const bi = +t.dataset.bi; duSel = duSel === bi ? null : bi; duInfo = null; renderDuel(view.du); };
    root.appendChild(el('div', 'du-pyr-wrap')).appendChild(pyr);
  }

  // le panneau d'action
  const sheet = el('div', 'du-sheet');
  if (v.phase === 'draft') {
    const mine = v.draft.picker === me;
    const list = el('div', 'mj-list du-wlist');
    v.draft.pool.forEach(w => {
      const W = DU_WONDERS[w];
      const b = el(mine ? 'button' : 'div', 'mj-row du-wcard', `<b>${esc(W.n)}</b><span class="du-wcost">${duCost(W.c)}</span><span class="du-wtxt">${duWonderLong(W)}</span>`);
      if (mine) { b.type = 'button'; b.onclick = () => act({ t: 'du:draft', w }); }
      list.appendChild(b);
    });
    sheet.appendChild(list);
  } else if (v.phase === 'start') {
    if (v.chooser === me) {
      const row = el('div', 'du-row'); row.append(btn('primary lg', 'Je commence', () => act({ t: 'du:start', who: me })), btn('lg', `${esc(v.seats[opp].name)} commence`, () => act({ t: 'du:start', who: opp }))); sheet.appendChild(row);
    }
  } else if (v.phase === 'play' && v.pending) {
    const p = v.pending;
    if (p.mine) {
      const list = el('div', 'mj-list du-choices');
      const opts = p.type === 'token' ? v.tokensBoard : p.type === 'library' ? p.options : p.type === 'destroy' ? p.targets : v.discard;
      opts.forEach(o => {
        let h;
        if (p.type === 'token' || p.type === 'library') { const t = duToken(o); h = `<b>${t.i} ${esc(t.n)}</b><span>${esc(t.d)}</span>`; }
        else { const c = DU_CARDS[o]; h = `<b><i class="du-sq t-${c.t}"></i> ${esc(c.n)}</b><span>${duEffLong(c)}</span>`; }
        const b = el('button', 'mj-row du-choice', h); b.type = 'button'; b.onclick = () => act({ t: 'du:choose', pick: o }); list.appendChild(b);
      });
      sheet.appendChild(list);
    }
  } else if (v.phase === 'play') {
    const b = duSel !== null ? v.board[duSel] : null;
    if (duInfo) sheet.appendChild(duInfoBox(duInfo));
    else if (b && b.card !== null) {
      const c = DU_CARDS[b.card];
      sheet.appendChild(el('div', 'du-detail', `<div class="du-dhead"><i class="du-sq t-${c.t}"></i><b>${esc(c.n)}</b><small>${DU_COLOR[c.t]} · âge ${['', 'I', 'II', 'III', 'III'][c.a]}</small></div><p>${duEffLong(c)}</p><p class="du-dcost">Coût : ${duCost(c.c)}</p>`));
      if (v.myTurn && b.acc && b.price) {
        const coins = v.cities[me].coins, pr = b.price;
        const row = el('div', 'du-actions');
        const bb = btn('primary', pr.chain ? 'Construire gratuitement, par enchaînement' : pr.total ? `Construire pour ${duPieces(pr.total)}${pr.trade ? ` (dont ${pr.trade} d’achat)` : ''}` : 'Construire gratuitement', () => act({ t: 'du:take', b: b.bi, how: 'build' }));
        bb.disabled = pr.total > coins; row.appendChild(bb);
        row.appendChild(btn('', `Défausser pour ${duPieces(v.discardGain)}`, () => act({ t: 'du:take', b: b.bi, how: 'discard' })));
        v.cities[me].wonders.forEach((w, wi) => {
          if (w.built || w.lost || v.wondersLeft <= 0) return;
          const wp = v.wonderPrices[wi], W = DU_WONDERS[w.w];
          const wb = btn('ghost wbtn', `Bâtir ${esc(W.n)} ${wp.total ? `pour ${duPieces(wp.total)}` : 'gratuitement'}`, () => act({ t: 'du:take', b: b.bi, how: 'wonder', w: wi }));
          wb.disabled = wp.total > coins; wb.title = duWonderLong(W); row.appendChild(wb);
        });
        sheet.appendChild(row);
        if (pr.total > coins) sheet.appendChild(el('p', 'note', `Il te manque ${duPieces(pr.total - coins)} pour la construire.`));
      } else if (v.myTurn && !b.acc) sheet.appendChild(el('p', 'note', 'Encore recouverte. Prends d’abord les cartes posées dessus.'));
    }
  }
  if (v.phase === 'over') {
    const f = v.final;
    const rows = [['Bâtiments bleus', 'bleu'], ['Bâtiments verts', 'vert'], ['Bâtiments jaunes', 'jaune'], ['Guildes', 'violet'], ['Merveilles', 'merveilles'], ['Jetons progrès', 'progres'], ['Pièces, 1 point pour 3', 'pieces'], ['Militaire', 'militaire'], ['Total', 'total']];
    const box = el('div', 'du-final');
    box.appendChild(el('span', 'mj-side-title', 'Décompte'));
    box.appendChild(el('div', 'mj-list', `<table class="du-table"><thead><tr><th></th><th>${esc(v.seats[0].name)}</th><th>${esc(v.seats[1].name)}</th></tr></thead><tbody>${rows.map(([l, k]) => `<tr${k === 'total' ? ' class="tot"' : ''}><td>${l}</td><td>${f[0][k]}</td><td>${f[1][k]}</td></tr>`).join('')}</tbody></table>`));
    sheet.appendChild(box);
    if (v.isHost) sheet.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
  }
  if (sheet.children.length) root.appendChild(sheet);
  root.appendChild(duCity(v, watch ? 0 : me));
  if (v.log.length) {
    const lg = el('ul', 'du-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }

  // fiches d'information : cartes des cités, merveilles, jetons
  root.querySelectorAll('[data-info]').forEach(n => n.onclick = e => { e.stopPropagation(); duInfo = duInfo === n.dataset.info ? null : n.dataset.info; if (duInfo) duSel = null; renderDuel(view.du); });
}
function duInfoBox(key) {
  const kind = key[0], id = key.slice(1);
  let h = '';
  if (kind === 'c') { const c = DU_CARDS[+id]; h = `<div class="du-dhead"><i class="du-sq t-${c.t}"></i><b>${esc(c.n)}</b><small>${DU_COLOR[c.t]}</small></div><p>${duEffLong(c)}</p>`; }
  if (kind === 'w') { const W = DU_WONDERS[+id]; h = `<div class="du-dhead"><b>${esc(W.n)}</b><small>merveille</small></div><p>${duWonderLong(W)}</p><p class="du-dcost">Coût : ${duCost(W.c)}</p>`; }
  if (kind === 't') { const t = duToken(id); h = `<div class="du-dhead"><b>${t.i} ${esc(t.n)}</b><small>jeton progrès</small></div><p>${esc(t.d)}</p>`; }
  return el('div', 'du-detail info', h + '<p class="fine">Touche à nouveau pour fermer.</p>');
}
