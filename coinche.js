// Coinche : affichage et commandes. Les règles du jeu sont dans engines/coinche.js.

'use strict';

// ============================================================ écran
// Tout l'écran est la table (table.js, table.css) : ton partenaire assis en face, les adversaires à gauche et à
// droite, le pli en croix au milieu du tapis avec le contrat et l'atout, le meneur dans sa bulle de verre, et dans
// le plateau de verre en bas ta main en éventail, avec le choix des enchères quand c'est à toi de parler.
// Les cartes sont celles de Kems et du Poker (.km-card, kmCardHTML de kems.js). Scores et fil : feuille sur
// téléphone, colonne de droite sur PC.
let coSel = null, coSelKey = null, coLastView = null, coLastPlayed = '';
const CO_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' }, CO_SUIT = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' };
const coRed = s => s === 'H' || s === 'D';
const coSuit = s => `<b class="cox-suit${coRed(s) ? ' red' : ''}">${CO_SYM[s]}</b>`;
const coBidTxt = b => b.kind === 'pass' ? 'passe' : b.kind === 'coinche' ? 'coinche !' : b.kind === 'surcoinche' ? 'surcoinche !' : `${b.capot ? 'capot' : b.value} ${coSuit(b.suit)}`;
const coFirst = n => tbSplit({ name: n })[1];
const coSeatP = p => p.bot ? { ...p, name: p.name.replace(/^Robot /, '🤖 ') } : p;
const coTeamRaw = (v, t) => `${coFirst(v.seats[t].name)} et ${coFirst(v.seats[t + 2].name)}`;
const coTeamNames = (v, t) => esc(coTeamRaw(v, t));
const coCard = (c, cls = '') => `<div class="km-card cox-card ${cls}">${kmCardHTML(c)}</div>`;
const coNum = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// la main triée : l'atout d'abord, les couleurs en alternant rouge et noir, du plus faible au plus fort
function coSort(hand, trump) {
  const suits = ['S', 'H', 'C', 'D'], order = trump ? [trump, ...suits.filter(s => s !== trump)] : suits;
  const rank = c => (c.s === trump ? Coinche.TRUMP_ORDER : Coinche.PLAIN_ORDER).indexOf(c.r);
  return hand.slice().sort((a, b) => order.indexOf(a.s) - order.indexOf(b.s) || rank(a) - rank(b));
}

// la feuille (téléphone) : scores et donnes, ou le fil
function coSheetBody() {
  const v = coLastView; if (!v) return '';
  if (tbSheet.kind === 'co-log') return tbLog(v.log.slice().reverse());
  return coScoresHTML(v);
}
function coScoresHTML(v) {
  const me = v.me, rows = tbRows([0, 1].map(t => ({ e: t === 0 ? '🔷' : '🔶', name: coTeamRaw(v, t), sub: (me && me.team === t ? 'ton équipe · ' : '') + `${v.phase === 'play' ? `${v.tricks[t]} pli${v.tricks[t] > 1 ? 's' : ''}` : ''}`, score: coNum(v.scores[t]), me: me && me.team === t })));
  const hist = v.history.length ? `<p class="mj-side-title cox-sheet-title">Les donnes</p><ul class="cox-hist">${v.history.slice().reverse().map(h => `<li><span>${h.deal}. ${esc(h.contract)}${h.coinche ? (h.coinche === 2 ? ', surcoinché' : ', coinché') : ''}</span><b class="${h.made ? 'ok' : 'ko'}">${h.made ? 'réussi' : 'chuté'}</b><em>${h.add[0]} · ${h.add[1]}</em></li>`).join('')}</ul>` : '';
  return `<p class="tb-sheet-say">Partie en ${coNum(v.target)} points.${v.contract && v.phase === 'play' ? ` Contrat : ${Coinche.bidName(v.contract)}.` : ''}</p>${rows}${hist}`;
}
const coOpenSheet = kind => tbSheet.open(kind, kind === 'co-log' ? 'Ce qui s’est passé' : 'Scores', coSheetBody);

function renderCoinche(v) {
  if (!v) return;
  coLastView = v;
  const root = $('#co-main'); root.innerHTML = '';
  const me = v.me, my = me ? me.seat : 0, host = v.isHost, desk = tbDesk(), c = v.contract;
  const say = (list, j = 0) => list[(v.deal + j) % list.length];
  const rel = seat => (seat - my + 4) % 4;                                        // 0 toi, 1 à gauche, 2 en face, 3 à droite
  const N = seat => esc(coFirst(v.seats[seat].name));
  const us = me ? me.team : 0;

  // ---------------------------------------------------------------- la ligne de partie
  const chips = [];
  if (v.phase === 'bid' || v.phase === 'play') {
    if (v.log.length) chips.push(tbChip(TB_ICON.log + 'Fil', () => coOpenSheet('co-log')));
    chips.push(tbChip(`${TB_ICON.trophy}<b>${coNum(v.scores[us])}</b>·<b>${coNum(v.scores[1 - us])}</b>`, () => coOpenSheet('co-scores'), `Scores : ${me ? 'vous' : coTeamNames(v, 0)} ${v.scores[us]}, ${me ? 'eux' : coTeamNames(v, 1)} ${v.scores[1 - us]}`));
  }
  const left = v.phase === 'over' ? 'Partie terminée' : v.phase === 'bid' ? `Donne <b>${v.deal}</b> · les enchères` : c ? `<b>${c.capot ? 'Capot' : c.value}</b> ${coSuit(c.suit)} · ${N(c.seat)}${c.coinche ? (c.coinche === 2 ? ' · surcoinché' : ' · coinché') : ''}` : `Donne <b>${v.deal}</b>`;
  root.appendChild(tbBar(left, chips));

  // ---------------------------------------------------------------- la table : partenaire en face, adversaires sur les côtés
  const table = el('div', 'cox-table ph-' + v.phase + (me ? '' : ' watch'));
  const people = v.seats.map((s, k) => ({ ...coSeatP(s), k }));
  table.appendChild(tbSeats(people, {
    meId: me ? v.seats[my].id : null, currentId: (v.phase === 'bid' || v.phase === 'play') ? v.seats[v.turn].id : null, since: v.since,
    badge: s => v.phase === 'play' || v.phase === 'bid' ? `${s.count}` : '',
    cls: s => `cox-t${s.team} cox-r${rel(s.k)}${me && s.team === us ? ' cox-mate' : ''}`,
    under: s => {
      const tags = [];
      if (v.phase === 'bid' && s.bid) tags.push(`<span class="tb-tag ${s.bid.kind === 'pass' ? 'soft' : s.bid.kind === 'bid' ? '' : 'warn'}">${coBidTxt(s.bid)}</span>`);
      if (v.phase === 'play' && c?.seat === s.k) tags.push(`<span class="tb-tag">prend</span>`);
      if (v.belote?.seat === s.k && v.phase === 'play') tags.push(`<span class="tb-tag soft">${v.belote.said === 1 ? 'belote' : 'rebelote'}</span>`);
      if (s.dealer && v.phase === 'bid') tags.push('<span class="tb-tag soft">donne</span>');
      return tags.join('');
    },
  }));

  // le milieu : le contrat pendant les enchères, le pli en croix pendant le jeu
  const mid = el('div', 'cox-mid');
  if (v.phase === 'bid') {
    mid.innerHTML = c
      ? `<div class="cox-plate"><small>Meilleure annonce · ${me && c.seat === my ? 'toi' : N(c.seat)}</small><span class="cox-big">${c.capot ? 'Capot' : c.value}${coSuit(c.suit)}</span>${c.coinche ? `<span class="cox-coinche">${c.coinche === 2 ? 'surcoinché ×4' : 'coinché ×2'}</span>` : ''}</div>`
      : `<div class="cox-plate empty"><small>Personne n’a encore parlé</small><span class="cox-suits">${['S', 'H', 'C', 'D'].map(coSuit).join('')}</span></div>`;
  } else if (v.phase === 'play') {
    const shown = v.trick.length ? v.trick : v.lastTrick ? v.lastTrick.cards : [];
    const faded = !v.trick.length && v.lastTrick;
    const key = shown.map(x => x.card.id).join('');
    mid.innerHTML = `<div class="cox-trump">Atout ${coSuit(c.suit)}</div><div class="cox-trick${faded ? ' done' : ''}">${shown.map(x => coCard(x.card, `p${rel(x.seat)}${!faded && !coLastPlayed.includes(x.card.id) ? ' pop' : ''}${faded && x.seat === v.lastTrick.winner ? ' win' : ''}`)).join('')}</div>`
      + (faded ? `<p class="cox-trick-cap">Pli pour ${me && rel(v.lastTrick.winner) === 0 ? 'toi' : N(v.lastTrick.winner)} · ${v.lastTrick.points} pts</p>` : '')
      + `<p class="cox-tricks">Plis · ${me ? 'vous' : coTeamNames(v, 0)} <b>${v.tricks[us]}</b> · ${me ? 'eux' : coTeamNames(v, 1)} <b>${v.tricks[1 - us]}</b></p>`;
    coLastPlayed = key;
  }
  if (mid.innerHTML) table.appendChild(mid);
  root.appendChild(table);

  // ---------------------------------------------------------------- le meneur
  let title = '', line = '', pip = '', hot = false;
  const cur = v.seats[v.turn], C = N(v.turn);
  if (v.phase === 'bid') {
    if (v.myTurn && v.canSurcoinche) { title = 'On vous coinche.'; hot = true; pip = '😤'; line = `Surcoinche si vous tenez votre ${c.value} à ${CO_SUIT[c.suit]}. Sinon, passe.`; }
    else if (v.myTurn) {
      title = 'À toi de parler.'; hot = true; pip = '🗣️';
      line = c ? `${c.seat === (my + 2) % 4 ? 'Ton partenaire' : N(c.seat)} annonce ${Coinche.bidName(c)}. ${v.canCoinche ? 'Monte, passe, ou coinche.' : 'Monte, ou passe.'}`
        : say(['Personne n’a encore parlé. Annonce une couleur, ou passe.', 'À toi d’ouvrir. Regarde tes atouts possibles.']);
    } else { title = `${cur.bot ? '🤖 ' : ''}${C} parle.`; pip = '⏳'; line = c ? `Meilleure annonce : ${Coinche.bidName(c)}, par ${c.seat === my && me ? 'toi' : N(c.seat)}.` : say(['Les enchères commencent.', 'On écoute les annonces.']); }
  } else if (v.phase === 'play') {
    const led = v.trick[0]?.card.s;
    if (v.myTurn) {
      title = 'À toi.'; hot = true; pip = '🃏';
      const ok = me.hand.filter(x => me.playable.includes(x.id));
      if (!v.trick.length) line = say(['Tu ouvres le pli.', 'À toi d’entamer.', 'Tu mènes.'], v.tricks[0] + v.tricks[1]) + ` Atout ${CO_SUIT[c.suit]}.`;
      else if (ok.every(x => x.s === led) && ok.length < me.hand.length) line = led === c.suit ? 'Atout demandé : monte si tu peux.' : `Il faut fournir à ${CO_SUIT[led]}.`;
      else if (ok.every(x => x.s === c.suit) && ok.length < me.hand.length) line = `Pas de ${CO_SUIT[led]} : il faut couper${ok.length < me.hand.filter(x => x.s === c.suit).length ? ', et monter' : ''}.`;
      else line = me.hand.some(x => x.s === led) ? `Fournis à ${CO_SUIT[led]}.` : 'Ton partenaire est maître, ou tu n’as plus d’atout : joue ce que tu veux.';
    } else {
      title = `${cur.bot ? '🤖 ' : ''}${C} joue.`; pip = '⏳';
      line = `${c.seat === my && me ? 'Tu prends' : `${N(c.seat)} prend`} à ${c.capot ? 'capot' : c.value} ${CO_SUIT[c.suit]}. ` + (cur.bot ? say(['Le robot compte les atouts.', 'Le robot réfléchit, en principe.'], v.tricks[0] + v.tricks[1]) : say(['Surveille ce qui tombe.', 'Compte les atouts.'], v.tricks[0] + v.tricks[1]));
    }
  } else if (v.result) {
    const r = v.result, att = r.contract.team, ours = me && att === us;
    title = r.made ? (r.contract.coinche ? 'Coinche perdue pour la défense.' : 'Contrat réussi.') : (r.contract.coinche ? 'La coinche paie.' : 'Contrat chuté !');
    if (v.phase === 'over') title = me && v.winnerTeam === us ? 'Vous gagnez la partie.' : `${coTeamNames(v, v.winnerTeam)} gagnent la partie.`;
    pip = v.phase === 'over' ? '🏆' : r.made ? (ours ? '🎉' : '😮') : (ours ? '😬' : '🎉'); hot = me && ((r.made && ours) || (!r.made && !ours));
    line = `${coTeamNames(v, att)} font ${r.total[att]} pour un contrat de ${r.contract.capot ? 'capot' : r.contract.value}${r.capot >= 0 ? `, et ${r.capot === att ? 'un capot' : 'se font capoter'}` : ''}. ${v.phase === 'over' ? `${coNum(v.scores[v.winnerTeam])} à ${coNum(v.scores[1 - v.winnerTeam])}. Revanche ? Tout se passe au salon.` : ''}`;
  }
  root.appendChild(tbSay({ title, line, pip, hot }));

  // ---------------------------------------------------------------- le plateau : ta main, et les enchères
  if (me && (v.phase === 'bid' || v.phase === 'play')) {
    const hand = coSort(me.hand, v.trump);
    const items = hand.map(x => {
      const ok = v.phase === 'play' && v.myTurn && me.playable.includes(x.id);
      return {
        html: `<button type="button" class="km-card cox-card${x.s === v.trump ? ' trump' : ''}">${kmCardHTML(x)}</button>`,
        ok, no: v.phase === 'play' && v.myTurn && !ok, label: Coinche.cardName(x) + (ok ? ', jouable' : ''),
        onclick: () => {
          if (v.phase !== 'play') return;
          if (!v.myTurn) { toast('Attends ton tour.'); return; }
          if (!ok) { toast(line.replace(/<[^>]+>/g, '') || 'Cette carte ne peut pas partir.'); return; }
          act({ t: 'co:play', card: x.id });
        },
      };
    });
    const W = desk ? Math.max(420, Math.min(640, (root.clientWidth || 1100) - 396)) : Math.max(300, (root.clientWidth || 350) + 12);
    const fan = tbFan(items, { w: desk ? 68 : 62, cap: desk ? 64 : 46, width: W });
    const acts = [];
    let body = fan;
    if (v.phase === 'bid' && v.myTurn) {
      const wrap = el('div', 'cox-bidbox');
      if (v.canBid) {
        const key = `${v.deal}|${v.bids.length}`;
        if (coSelKey !== key || !coSel) {
          coSelKey = key;
          const best = ['S', 'H', 'D', 'C'].map(s => ({ s, v: Coinche.handValue(me.hand, s) })).sort((a, b) => b.v - a.v)[0];
          coSel = { v: Math.min(160, v.minBid), s: c && c.team === us ? c.suit : best.s, capot: v.minBid > 160 };
        }
        if (v.minBid > 160) coSel.capot = true;        // déjà 160 : il ne reste que le capot
        const suits = el('div', 'cox-suitpick'); suits.setAttribute('role', 'group'); suits.setAttribute('aria-label', 'Atout');
        ['S', 'H', 'D', 'C'].forEach(s => {
          const b = el('button', 'cox-sbtn' + (coSel.s === s ? ' on' : '') + (coRed(s) ? ' red' : ''), `${CO_SYM[s]}<small>${CO_SUIT[s]}</small>`); b.type = 'button';
          b.setAttribute('aria-pressed', String(coSel.s === s)); b.onclick = () => { coSel.s = s; renderCoinche(view.co); }; suits.appendChild(b);
        });
        wrap.appendChild(suits);
        const step = el('div', 'cox-step');
        const minus = el('button', 'cox-stepbtn', '−'), plus = el('button', 'cox-stepbtn', '+'), cap = el('button', 'cox-capot' + (coSel.capot ? ' on' : ''), 'Capot');
        [minus, plus, cap].forEach(b => { b.type = 'button'; });
        minus.setAttribute('aria-label', '10 de moins'); plus.setAttribute('aria-label', '10 de plus');
        minus.disabled = coSel.capot || coSel.v <= v.minBid; plus.disabled = coSel.capot || coSel.v >= 160;
        minus.onclick = () => { coSel.v = Math.max(v.minBid, coSel.v - 10); renderCoinche(view.co); };
        plus.onclick = () => { coSel.v = Math.min(160, coSel.v + 10); renderCoinche(view.co); };
        cap.onclick = () => { if (v.minBid <= 160) coSel.capot = !coSel.capot; renderCoinche(view.co); }; cap.setAttribute('aria-pressed', String(coSel.capot));
        step.append(minus, el('span', 'cox-val', coSel.capot ? '<b>Capot</b>' : `<b>${coSel.v}</b>`), plus, cap);
        wrap.appendChild(step);
        acts.push(tbBtn('hero', `Annoncer ${coSel.capot ? 'capot' : coSel.v} ${CO_SYM[coSel.s]}`, () => act({ t: 'co:bid', value: coSel.v, suit: coSel.s, capot: coSel.capot })));
      }
      if (v.canCoinche) acts.push(tbBtn('danger cox-cry', 'Coinche !', () => act({ t: 'co:coinche' })));
      if (v.canSurcoinche) acts.push(tbBtn('danger cox-cry', 'Surcoinche !', () => act({ t: 'co:surcoinche' })));
      acts.push(tbBtn('glass', 'Passer', () => act({ t: 'co:pass' })));
      if (wrap.children.length) { const b2 = el('div', 'cox-bidwrap'); b2.append(fan, wrap); body = b2; }
    }
    const nOk = me.playable.length;
    const tray = tbTray({
      left: `Ta main · <b>${me.hand.length} carte${me.hand.length > 1 ? 's' : ''}</b>`,
      right: v.phase === 'play' ? (v.myTurn ? `${nOk} jouable${nOk > 1 ? 's' : ''}` : 'Attends ton tour') : v.myTurn ? 'à toi de parler' : 'les enchères',
      body, acts,
    });
    tray.classList.add('cox-tray', 'ph-' + v.phase);
    root.appendChild(tray);
  }

  // ---------------------------------------------------------------- fin de donne : le décompte
  if (v.result && (v.phase === 'result' || v.phase === 'over')) {
    const r = v.result, att = r.contract.team;
    const box = el('div', 'cox-result');
    const row = (label, a, b, cls = '') => `<tr class="${cls}"><th>${label}</th><td>${a}</td><td>${b}</td></tr>`;
    const tn = t => `${t === att ? 'Preneurs' : 'Défense'}<small>${coTeamNames(v, t)}</small>`;
    box.innerHTML = `<p class="mj-side-title">Donne ${v.deal} · ${esc(Coinche.bidName(r.contract))}${r.contract.coinche ? (r.contract.coinche === 2 ? ', surcoinché' : ', coinché') : ''} · <b class="${r.made ? 'ok' : 'ko'}">${r.made ? 'réussi' : 'chuté'}</b></p>`
      + `<table class="cox-tab"><thead><tr><th></th><th>${tn(0)}</th><th>${tn(1)}</th></tr></thead><tbody>`
      + row('Plis', r.tricks[0], r.tricks[1])
      + row('Points des cartes', r.card[0], r.card[1])
      + (r.bel[0] || r.bel[1] ? row('Belote', r.bel[0] || '–', r.bel[1] || '–') : '')
      + (r.ann[0] || r.ann[1] ? row('Annonces', r.ann[0] || '–', r.ann[1] || '–') : '')
      + row('Marqués', `+${r.add[0]}`, `+${r.add[1]}`, 'add')
      + row('Total', coNum(r.scores[0]), coNum(r.scores[1]), 'tot') + '</tbody></table>';
    root.appendChild(box);
    if (host) root.appendChild(tbTray({ acts: [v.phase === 'over' ? tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })) : tbBtn('hero', 'Donne suivante', () => act({ t: 'co:next' }))] }));
    else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));
  }

  // ---------------------------------------------------------------- colonne de droite (PC) : scores, dernier pli, fil
  const side = el('div', 'co-side');
  side.appendChild(el('p', 'mj-side-title', `Scores · partie en ${coNum(v.target)}`));
  side.insertAdjacentHTML('beforeend', coScoresHTML(v).replace(/^<p class="tb-sheet-say">.*?<\/p>/, ''));
  if (v.lastTrick && v.phase === 'play') side.insertAdjacentHTML('beforeend', `<p class="mj-side-title cox-sheet-title">Dernier pli · ${me && rel(v.lastTrick.winner) === 0 ? 'toi' : N(v.lastTrick.winner)}</p><div class="cox-last">${v.lastTrick.cards.map(x => coCard(x.card)).join('')}</div>`);
  if (v.annonces?.list?.length && v.phase === 'play') side.insertAdjacentHTML('beforeend', `<p class="cox-ann">Annonces : ${v.annonces.points} points pour ${coTeamNames(v, v.annonces.team)}.</p>`);
  root.appendChild(side);
  if (v.log.length) {
    const lg = el('div', 'co-log');
    lg.appendChild(el('p', 'mj-side-title', 'Ce qui s’est passé'));
    lg.insertAdjacentHTML('beforeend', tbLog(v.log.slice().reverse()));
    root.appendChild(lg);
  }
  if (tbSheet.kind === 'co-log' || tbSheet.kind === 'co-scores') tbSheet.refresh(v.phase === 'bid' || v.phase === 'play');
}
