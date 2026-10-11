// Chromo : affichage et commandes. Les règles du jeu sont dans engines/chromo.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
// Tout l'écran est la table : les adversaires assis en arc en haut, la pioche et la défausse au centre,
// ta main tenue en éventail dans un plateau de verre en bas. Scores et fil s'ouvrent dans une feuille
// sur téléphone ; sur PC ils sont dans la colonne de droite (desk.js) et la table devient un ovale.
let chPendingWild = null, chLastSeq = -1, chLastRound = null, chTurnKey = null, chTurnSince = 0, chSkipTimer = null;
let chTops = [], chSheetKind = null, chLastView = null;
const CH_COLOR_WORD = { r: 'Rouge', y: 'Jaune', g: 'Vert', b: 'Bleu' };
const CH_COLOR_DU = { r: 'Du rouge', y: 'Du jaune', g: 'Du vert', b: 'Du bleu' };
const chSymbol = v => v === 'skip' ? '⊘' : v === 'rev' ? '⇄' : v === 'wild' ? '✦' : v;
const chSymbolWord = v => /^[0-9]$/.test(v) ? `un ${v}` : v === 'skip' ? 'un Passe' : v === 'rev' ? 'un Sens' : v === '+2' ? 'un +2' : 'un joker';
const chDot = t => /[.!?»]$/.test(t) ? t : t + '.';
// « 🦊 Kevin » → ['🦊', 'Kevin'] ; un robot n'a pas d'emoji, on lui en donne un
const chSplit = p => { const n = p.name || '', i = n.indexOf(' '); return i > 0 && i <= 8 ? [n.slice(0, i), n.slice(i + 1)] : [p.bot ? '🤖' : glyph0(n), n]; };
// un angle stable par carte, pour que la défausse ne « danse » pas à chaque diffusion
const chTilt = (id, span) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((Math.abs(h) % 1000) / 1000 - 0.5) * span; };

function chCardHTML(c) {
  const sym = chSymbol(c.v);
  const center = c.v === 'wild' ? '<i class="ch-wheel"></i>'
    : c.v === '+4' ? '<i class="ch-wheel small"></i><b>+4</b>'
      : `<b>${sym}</b>`;
  const u = c.v === '6' || c.v === '9' ? ' u' : '';   // 6 et 9 soulignés, comme sur les vraies cartes
  return `<span class="ch-corner${u}">${sym}</span><span class="ch-oval${u}">${center}</span><span class="ch-corner bottom${u}">${sym}</span>`;
}
const CH_BACK = '<span class="ch-oval"><b>Chromo</b></span>';

// la feuille des scores ou du fil (téléphone)
function chSheetBody(v) {
  if (chSheetKind === 'log') return `<ul class="chx-log">${v.log.slice().reverse().map(t => `<li>${esc(chDot(t))}</li>`).join('')}</ul>`;
  const rows = v.players.slice().sort((a, b) => b.score - a.score).map(p => {
    const [e, n] = chSplit(p);
    const sub = `${p.id === net.me ? 'toi · ' : ''}${p.count} carte${p.count > 1 ? 's' : ''}${p.count === 1 ? (p.called ? ' · Chromo !' : ' · rien crié') : ''}`;
    return `<li><span class="chx-e">${e}</span><span class="chx-n">${esc(n)}<small>${sub}</small></span><b class="chx-s">${p.score}</b></li>`;
  }).join('');
  const rules = [v.stack ? 'les +2 et +4 se cumulent' : '', v.zero ? 'un 0 fait tourner les mains' : ''].filter(Boolean).join(', ');
  return `<p class="chx-sheet-say">Manche ${v.round} sur ${v.rounds}. Le premier à vider sa main marque les cartes des autres.${rules ? ` Règles du salon : ${rules}.` : ''}</p><ul class="chx-rows">${rows}</ul>`;
}
function chOpenSheet(kind) {
  chSheetKind = kind;
  $('#ch-sheet-title').textContent = kind === 'log' ? 'Ce qui s’est passé' : 'Scores';
  if (chLastView) $('#ch-sheet-body').innerHTML = chSheetBody(chLastView);
  $('#ch-sheet').hidden = false;
}
$('#ch-sheet-close').onclick = () => { $('#ch-sheet').hidden = true; chSheetKind = null; };
$('#ch-sheet').onclick = e => { if (e.target.id === 'ch-sheet') $('#ch-sheet-close').click(); };

function renderChromo(v) {
  if (!v) return;
  chLastView = v;
  const root = $('#ch-main'); root.innerHTML = '';
  if (v.round !== chLastRound) { chLastRound = v.round; chPendingWild = null; chLastSeq = -1; chTops = []; }
  const me = v.me, host = v.isHost;
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const say = list => list[(v.round + v.playSeq) % list.length];      // une réplique stable pendant tout un tour
  const cur = v.players.find(p => p.id === v.currentId), C = esc(cur?.name || '');
  const vul = v.phase === 'play' && v.vulnerable && v.vulnerable.id !== net.me && me.inRound ? esc(v.vulnerable.name) : '';
  const mine = v.players.find(p => p.id === net.me);

  // la ligne de partie, et sur téléphone les deux puces qui ouvrent le fil et les scores
  const rulesTxt = [v.stack ? 'cumul des +2 et +4' : '', v.zero ? 'règle du zéro' : ''].filter(Boolean).join(' · ');
  const rules = rulesTxt ? `<span class="chx-rules"> · ${rulesTxt}</span>` : '';
  const bar = el('div', 'chx-bar');
  bar.appendChild(el('span', 'chx-chip', v.phase === 'play' ? `Manche <b>${v.round}</b> sur ${v.rounds}${rules}` : v.phase === 'result' ? `Fin de la manche <b>${v.round}</b> sur ${v.rounds}` : `Partie terminée · ${v.rounds} manche${v.rounds > 1 ? 's' : ''}`));
  if (v.phase === 'play') {
    const chips = el('span', 'chx-chips');
    if (v.log.length) { const f = el('button', 'chx-chip', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9"/></svg>Fil'); f.type = 'button'; f.onclick = () => chOpenSheet('log'); chips.appendChild(f); }
    const s = el('button', 'chx-chip', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6"/></svg><b>${mine ? mine.score : 0}</b> pts`);
    s.type = 'button'; s.setAttribute('aria-label', 'Scores'); s.onclick = () => chOpenSheet('scores'); chips.appendChild(s);
    bar.appendChild(chips);
  }
  root.appendChild(bar);

  // la table : les autres en arc, dans l'ordre du jeu (sens horaire) en partant de ta gauche ; pioche et défausse au centre
  if (v.phase === 'play') {
    const n = v.players.length, meIdx = v.players.findIndex(p => p.id === net.me);
    const others = meIdx < 0 ? v.players.slice() : [...v.players.slice(meIdx + 1), ...v.players.slice(0, meIdx)];
    const m = others.length;
    const table = el('div', 'chx-table col-' + v.color);
    const opps = el('div', 'chx-opps' + (m > 5 ? ' many' : ''));
    others.forEach((p, i) => {
      const [e, nm] = chSplit(p), t = (i + 0.5) / m;
      const now = p.id === v.currentId;
      const o = el('div', 'chx-opp' + (now ? ' now' : '') + (p.online ? '' : ' off') + (p.bot ? ' bot' : ''),
        `<span class="chx-av">${e}${now ? '<i class="chx-timer"></i>' : ''}</span>`
        + `<span class="chx-fan" aria-hidden="true"><i></i><i></i><i></i><b class="chx-count${p.count === 1 ? ' hot' : ''}">${p.count}</b></span>`
        + `<span class="chx-nm">${esc(nm)}</span>`
        + (p.count === 1 ? `<span class="chx-flag${p.called ? '' : ' warn'}">${p.called ? 'Chromo !' : '1 carte'}</span>` : ''));
      o.setAttribute('aria-label', `${p.name}, ${p.count} carte${p.count > 1 ? 's' : ''}${now ? ', joue' : ''}`);
      o.style.left = (m === 1 ? 50 : 9 + 82 * t).toFixed(2) + '%';
      o.style.top = ((1 - Math.sin(Math.PI * t)) * (m > 5 ? 30 : 34)).toFixed(1) + 'px';
      if (now && !p.bot) o.style.setProperty('--since', `${-Math.min(20, (Date.now() - chTurnSince) / 1000)}s`);
      opps.appendChild(o);
    });
    table.appendChild(opps);

    // les trois dernières cartes posées restent visibles, de travers, sous la carte du dessus
    if (v.playSeq !== chLastSeq && !chTops.some(c => c.id === v.top.id)) chTops = [...chTops, v.top].slice(-3);
    if (!chTops.length || chTops[chTops.length - 1].id !== v.top.id) chTops = [v.top];
    const fresh = v.playSeq !== chLastSeq && chLastSeq !== -1;
    chLastSeq = v.playSeq;

    const center = el('div', 'chx-center');
    center.appendChild(el('span', 'chx-halo', ''));
    center.appendChild(el('span', 'chx-orbit' + (v.dir === 1 ? '' : ' rev'), '<svg viewBox="0 0 270 270" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><circle cx="135" cy="135" r="128" stroke-width="2" stroke-dasharray="2 9"/><path d="M226 42 l13 4 -5 12" stroke-width="2.6"/><path d="M44 228 l-13 -4 5 -12" stroke-width="2.6"/></svg>'));
    const piles = el('div', 'chx-piles');
    const can = v.myTurn && !v.drewId;
    const deck = el('button', 'chx-deck' + (can ? ' can' : ''), `<span class="ch-card ch-back">${CH_BACK}</span><span class="ch-card ch-back">${CH_BACK}</span><span class="ch-card ch-back">${CH_BACK}</span><span class="chx-lbl">${can ? 'Piocher' : 'Pioche'}</span>`);
    deck.type = 'button'; deck.setAttribute('aria-label', 'Piocher'); deck.disabled = !can;
    deck.onclick = () => { if (v.myTurn && !v.drewId) act({ t: 'ch:draw' }); };
    const disc = el('div', 'chx-discard');
    chTops.forEach((c, i) => {
      const last = i === chTops.length - 1;
      const d = el('div', 'ch-card col-' + c.c + (last && fresh ? ' pop' : ''), chCardHTML(c));
      d.style.transform = `rotate(${chTilt(c.id, last ? 7 : 26).toFixed(1)}deg) translate(${last ? 0 : chTilt(c.id + 'x', 10).toFixed(1)}px, ${last ? 0 : 3}px)`;
      if (last) d.setAttribute('aria-label', `Carte du dessus : ${Chromo.cardLabel(c)}`);
      disc.appendChild(d);
    });
    disc.appendChild(el('span', 'chx-color', `<i></i>${CH_COLOR_WORD[v.color]}${v.pending ? ` <b class="ch-pending">+${v.pending}</b>` : ''}`));
    piles.append(deck, disc);
    center.appendChild(piles);
    table.appendChild(center);
    root.appendChild(table);
  }

  // ce qui se passe, dit par le meneur
  let title = '', line = '', hot = false, pip = '';
  if (v.phase === 'play') {
    const need = `${CH_COLOR_DU[v.color]}, ou ${chSymbolWord(v.top.v)}.`;
    pip = cur ? chSplit(cur)[0] : '';
    if (!me.inRound) { title = `${C} joue.`; line = 'Tu regardes cette manche, tu joueras à la suivante.'; }
    else if (v.myTurn) {
      title = 'À toi.'; hot = true; pip = '✋';
      if (v.pending) line = me.playable.length ? say([`Un +${v.pending} te tombe dessus. Contre, ou encaisse.`, `+${v.pending} pour toi, sauf si tu contres.`])
        : say([`+${v.pending} pour toi, et rien pour contrer.`, `${v.pending} cartes pour toi. Courage.`]);
      else if (v.drewId) line = say(['La carte piochée passe. Tu la poses, ou tu la gardes.', 'Bonne pioche. Tu la poses ?']);
      else if (!me.playable.length) line = say([`${need} Rien de tout ça en main, direction la pioche.`, `${need} Tu n’as rien, il faut piocher.`]);
      else line = `${need} ` + say(['Allège-toi.', 'Les autres comptent tes cartes.', 'Pas de pitié.', 'Vide ta main.']);
      if (me.hand.length <= 2 && !me.called && !v.pending) { line += ' Et pense à crier.'; pip = '📣'; }
    } else {
      title = `${C} joue.`;
      line = v.pending ? `${C} a un +${v.pending} sur le dos.`
        : cur?.bot ? say(['Le robot calcule. Enfin, il fait semblant.', 'Laisse-le réfléchir, il a des circuits.', 'Surveille ses cartes.'])
          : say(['Surveille ses cartes.', 'Croise les doigts, pas de +4 pour toi.', 'Prépare ta riposte.']);
    }
    if (vul) { line = `${vul} n’a plus qu’une carte et n’a rien crié. Vite, attrape.`; hot = true; pip = '👀'; }
    else if (v.vulnerable?.id === net.me) { line = 'Une carte et pas un mot ? Crie, vite.'; hot = true; pip = '📣'; }
  } else if (v.phase === 'result' && v.result) {
    const r = v.result, won = r.winnerId === net.me, W = esc(r.winnerName);
    title = won ? 'Tu gagnes la manche.' : `${W} gagne la manche.`; hot = won; pip = won ? '🎉' : '🃏';
    line = r.points ? `${r.points} point${r.points > 1 ? 's' : ''} pour ${won ? 'toi' : W}, la valeur des cartes restées chez les autres.` : 'Zéro point, les autres n’avaient que des 0 en main.';
  } else if (v.phase === 'over') {
    const w = v.scores[0], won = w?.id === net.me;
    title = won ? 'Tu gagnes la partie.' : `${esc(w?.name || '')} gagne la partie.`; hot = won; pip = '🏆';
    line = `${w?.score || 0} points au total. Revanche ? Tout se passe au salon.`;
  }
  root.appendChild(el('div', 'chx-say mj-status' + (hot ? ' ch-hot hot' : ''), `${pip ? `<span class="chx-pip" aria-hidden="true">${pip}</span>` : ''}<div><h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p></div>`));

  if (v.phase === 'play') {
    // attraper un oubli, débloquer un absent : au-dessus de la main, bien visibles
    const acts = el('div', 'ch-actions');
    if (vul) acts.appendChild(btn('danger', `Attraper ${vul} !`, () => act({ t: 'ch:catch' })));
    // l'hôte peut débloquer un joueur absent, mais seulement s'il ne joue pas depuis 20 secondes
    const turnKey = `${v.round}|${v.currentId}|${v.playSeq}|${v.log.length}|${v.drewId}`;
    if (turnKey !== chTurnKey) { chTurnKey = turnKey; chTurnSince = Date.now(); clearTimeout(chSkipTimer); if (host) chSkipTimer = setTimeout(() => { if (view?.chromo) renderChromo(view.chromo); }, 20500); }
    if (host && !v.myTurn && cur && !cur.bot && Date.now() - chTurnSince > 20000) acts.appendChild(btn('ghost small', `${C} traîne ? Passer son tour`, () => act({ t: 'ch:skip' })));
    if (acts.children.length) root.appendChild(acts);

    if (me.inRound) {
      const tray = el('section', 'chx-tray');
      const nOk = v.myTurn ? me.playable.length : 0;
      tray.appendChild(el('div', 'chx-tray-top', `<span>Ta main · <b>${me.hand.length} carte${me.hand.length > 1 ? 's' : ''}</b></span><span>${v.myTurn ? (nOk ? `${nOk} jouable${nOk > 1 ? 's' : ''}` : 'Rien à poser') : 'Attends ton tour'}</span>`));
      // l'éventail : à plat si la main est longue (on fait défiler), courbé sinon
      const desk = matchMedia('(min-width: 1100px)').matches, w = desk ? 96 : 70, H = Math.round(w * 1.48);
      // sur PC la main vit dans la colonne de gauche (desk.js retire 340 px de colonne + 28 px d'écart)
      const W = desk ? Math.max(420, Math.min(780, (root.clientWidth || 1100) - 410)) : Math.max(280, (root.clientWidth || 360) - 34);
      const k = me.hand.length, cap = desk ? 78 : (k <= 4 ? 64 : 46);
      const gap = k > 1 ? Math.min(cap, (W - w) / (k - 1)) : 0, flat = gap < (desk ? 40 : 28);
      const g = flat ? (desk ? 40 : 28) : gap;
      const span = (k - 1) * g + w;
      const fan = el('div', 'chx-fan-hand' + (flat ? ' flat' : ''));
      const inner = el('div', 'chx-fan-in'); inner.style.width = Math.max(W, span) + 'px'; inner.style.height = (H + 34) + 'px';
      me.hand.forEach((c, i) => {
        const ok = v.myTurn && me.playable.includes(c.id);
        const d = i - (k - 1) / 2;
        const slot = el('div', 'chx-slot' + (v.myTurn ? (ok ? ' ok' : ' no') : '') + (c.id === v.drewId ? ' drawn' : ''));
        const x = (Math.max(W, span) - span) / 2 + i * g;
        const y = (ok ? -16 : 0) + (flat ? 0 : d * d * 2.4) + 18;
        slot.style.cssText = `left:${x.toFixed(1)}px;width:${w}px;transform:translateY(${y.toFixed(1)}px) rotate(${flat ? 0 : (d * (desk ? 3.6 : 5)).toFixed(1)}deg);z-index:${i}`;
        const b = el('button', `ch-card col-${c.c}`, chCardHTML(c));
        b.type = 'button'; b.setAttribute('aria-label', Chromo.cardLabel(c) + (ok ? ', jouable' : ''));
        b.onclick = () => {
          if (!v.myTurn) { toast('Attends ton tour.'); return; }
          if (!ok) { toast(v.pending ? `Pioche ${v.pending} cartes${v.stack ? `, ou contre avec ${v.top.v === '+4' ? 'un +4' : 'un +2 ou un +4'}` : ''}.` : v.drewId ? 'Seule la carte piochée peut partir.' : 'Même couleur ou même symbole.'); return; }
          if (c.c === 'w') { chPendingWild = c.id; renderChromo(view.chromo); return; }
          act({ t: 'ch:play', card: c.id });
        };
        slot.appendChild(b); inner.appendChild(slot);
      });
      fan.appendChild(inner); tray.appendChild(fan);
      const ta = el('div', 'chx-acts');
      if (v.myTurn && !v.drewId) ta.appendChild(btn('chx-draw', v.pending ? `Piocher ${v.pending} cartes` : 'Piocher', () => act({ t: 'ch:draw' })));
      if (v.myTurn && v.drewId) ta.appendChild(btn('chx-draw', 'Garder et passer', () => act({ t: 'ch:pass' })));
      if (me.hand.length <= 2 && !me.called) ta.appendChild(btn('chx-cry', 'Crier « Chromo ! »', () => act({ t: 'ch:call' })));
      if (ta.children.length) tray.appendChild(ta);
      root.appendChild(tray);
    }

    if (chPendingWild && v.myTurn && me.hand.some(c => c.id === chPendingWild)) {
      const scrim = el('div', 'chx-scrim'); scrim.onclick = () => { chPendingWild = null; renderChromo(view.chromo); };
      const sheet = el('div', 'ch-picker', '<span class="ih-grab" aria-hidden="true"></span><p class="ch-picker-title">Quelle couleur ?</p><p class="chx-picker-say">Ton joker change la couleur. Prends celle que tu as le plus en main.</p>');
      const row = el('div', 'ch-picker-row');
      Chromo.COLORS.forEach(k => {
        const n = me.hand.filter(c => c.c === k).length;
        const s = el('button', 'ch-swatch col-' + k, `${CH_COLOR_WORD[k]}<small>${n ? `${n} en main` : 'aucune en main'}</small>`); s.type = 'button';
        s.onclick = () => { const id = chPendingWild; chPendingWild = null; act({ t: 'ch:play', card: id, color: k }); };
        row.appendChild(s);
      });
      sheet.appendChild(row);
      sheet.appendChild(btn('ghost small', 'Annuler', () => { chPendingWild = null; renderChromo(view.chromo); }));
      root.append(scrim, sheet);
    } else chPendingWild = null;
  }

  if (v.phase === 'result' || v.phase === 'over') {
    const r = v.result;
    const left = r ? r.hands.filter(h => h.id !== r.winnerId && h.cards.length).sort((a, b) => b.points - a.points) : [];
    if (left.length) {
      const box = el('div', 'ch-hands');
      box.appendChild(el('p', 'mj-side-title', 'Ce qui restait en main'));
      const list = el('div', 'mj-list');
      left.forEach(h => {
        const row = el('div', 'mj-row ch-hand-row', `<div class="ch-hand-row-head"><b>${esc(h.name)}</b><span>${h.points} pt${h.points > 1 ? 's' : ''}</span></div>`);
        const mini = el('div', 'ch-hand mini');
        h.cards.forEach(c => mini.appendChild(el('div', 'ch-card col-' + c.c, chCardHTML(c))));
        row.appendChild(mini); list.appendChild(row);
      });
      box.appendChild(list); root.appendChild(box);
    }
    if (host) root.appendChild(v.phase === 'over'
      ? btn('primary lg', 'Retour au salon', () => act({ t: 'restart' }))
      : btn('primary lg', v.round >= v.rounds ? 'Voir le classement' : 'Manche suivante', () => act({ t: 'ch:next' })));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));
  }

  // les joueurs et les scores (colonne de droite sur PC ; sur téléphone, la puce « pts » les ouvre pendant la manche)
  const side = el('div', 'ch-players' + (v.phase === 'play' ? ' in-play' : ''));
  side.appendChild(el('p', 'mj-side-title', v.phase === 'over' ? 'Classement final' : 'Scores'));
  const list = el('div', 'mj-list');
  if (v.phase === 'play') v.players.forEach(p => {
    const tag = p.id === v.currentId ? '<i class="now">joue</i>' : p.count === 1 ? `<i class="${p.called ? 'ok' : 'warn'}">${p.called ? 'Chromo !' : '1 carte'}</i>` : '';
    list.appendChild(el('div', 'mj-row ch-row' + (p.id === v.currentId ? ' now' : '') + (p.online ? '' : ' off') + (p.id === net.me ? ' me' : ''),
      `<span class="ch-row-name">${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.id === net.me ? ' <small>toi</small>' : ''}${tag}</span><span class="ch-row-sub">${p.count} carte${p.count > 1 ? 's' : ''}</span><b class="ch-row-score">${p.score}</b>`));
  });
  else v.scores.forEach((s, i) => {
    const gain = v.phase === 'result' && v.result?.winnerId === s.id && v.result.points ? ` <em>+${v.result.points}</em>` : '';
    list.appendChild(el('div', 'mj-row ch-row' + (i === 0 && v.phase === 'over' ? ' lead' : '') + (s.id === net.me ? ' me' : ''),
      `<span class="ch-row-name">${s.bot ? '🤖 ' : ''}${esc(s.name)}${s.id === net.me ? ' <small>toi</small>' : ''}</span><b class="ch-row-score">${s.score}${gain}</b>`));
  });
  side.appendChild(list);
  root.appendChild(side);

  // le fil de la partie (colonne de droite sur PC ; sur téléphone, la puce « Fil »)
  if (v.log.length) {
    const lg = el('ul', 'ch-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(chDot(t)))));
    root.appendChild(lg);
  }

  // la feuille ouverte suit la partie ; hors manche elle n'a plus lieu d'être
  if (!$('#ch-sheet').hidden) { if (v.phase === 'play') $('#ch-sheet-body').innerHTML = chSheetBody(v); else $('#ch-sheet-close').click(); }
}
