// Poker : affichage et commandes. Les règles du jeu sont dans engines/poker.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : la bulle du meneur dit qui a la parole, la table et les cartes gardent leur dessin.
// Tout l'écran est la table (nouveau style, briques de table.js) : les adversaires assis en arc avec leurs jetons
// et leur mise devant eux, les cinq cartes communes et le pot au milieu du tapis, le meneur dans sa bulle de verre,
// tes deux cartes, ton tas et tes choix dans le plateau de verre collé en bas. Sur téléphone, les jetons de la table
// et le fil s'ouvrent dans la feuille commune ; sur PC ils sont dans la colonne de droite (desk.js) et la table devient un ovale.
let pkRaise = null, pkLastHand = null, pkLastView = null, pkTurnKey = null, pkTurnAt = 0;
const pkCard = (c, cls = '') => c ? `<div class="pk-card km-card ${cls}">${kmCardHTML(c)}</div>` : `<div class="pk-card back ${cls}"></div>`;
const PK_STREET = { preflop: 'avant le flop', flop: 'flop', turn: 'turn', river: 'river' };
const pkHandWith = h => ({ Brelan: 'un', Full: 'un', Carré: 'un' }[h] || 'une') + ' ' + h.toLowerCase();   // « avec un brelan »
const pkNum = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');   // 1 000, avec une espace fine insécable
const pkNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
const pkDot = t => /[.!?»]$/.test(t) ? t : t + '.';
// à la table, un robot garde son 🤖 et perd son « Robot » (place comptée sous l'avatar)
const pkSeatP = p => p.bot ? { ...p, name: p.name.replace(/^Robot /, '') } : p;
const PK_RANK = { V: 'Valet', D: 'Dame', R: 'Roi', A: 'As' }, PK_SUIT = { S: 'pique', H: 'cœur', D: 'carreau', C: 'trèfle' };
const pkCardLabel = c => c ? `${PK_RANK[c.r] || c.r} de ${PK_SUIT[c.s]}` : 'carte cachée';
const pkRole = p => p.dealer ? 'donneur' : p.sb ? 'petite blinde' : p.bb ? 'grosse blinde' : '';

// les jetons dessinés : une pile par montant, du plus gros jeton (en bas) au plus petit
const PK_CHIPS = [[1000, 'g'], [500, 'v'], [100, 'k'], [25, 'e'], [5, 'r'], [1, 'w']];
// big : pour un gros tas (le tien, le pot), on part d'un jeton dont on peut empiler trois exemplaires, et pas plus de trois par couleur
function pkChipList(n, max, big) {
  const out = [], from = big ? Math.max(0, PK_CHIPS.findIndex(([d]) => n >= 3 * d)) : 0;
  for (const [d, c] of PK_CHIPS.slice(from)) { let k = 0; while (n >= d && out.length < max && (!big || k < 3)) { out.push(c); n -= d; k++; } }
  return out;
}
const pkPileHTML = list => `<span class="pkx-pile" aria-hidden="true">${list.map(c => `<i class="c-${c}"></i>`).join('')}</span>`;
const pkPile = (n, max = 5, big = false) => n > 0 ? pkPileHTML(pkChipList(n, max, big)) : '';
// le pot : jusqu'à trois piles côte à côte
function pkPot(n) { const l = pkChipList(n, 12, true), cols = []; for (let i = 0; i < l.length; i += 4) cols.push(l.slice(i, i + 4)); return `<span class="pkx-piles">${cols.map(pkPileHTML).join('')}</span>`; }

/** Ce que dit le meneur : [titre, réplique]. Les variantes suivent le numéro de main et le tour d'enchères. */
function pkVoice(v) {
  const me = v.me, k = ['preflop', 'flop', 'turn', 'river'].indexOf(v.street);
  const say = (list, j = 0) => list[(v.hand + j) % list.length];
  const mine = v.players.find(p => p.me);
  if (v.phase === 'over') {
    const won = v.ranking?.[0] && mine && v.ranking[0].id === mine.id;
    return [won ? 'Tu rafles tous les jetons.' : `${esc(v.winnerName || '')} rafle tous les jetons.`,
      won ? 'La table est à toi. Revanche ? Tout se passe au salon.' : say(['Revanche ? Tout se passe au salon.', 'Les poches sont vides. Revanche ? Tout se passe au salon.'])];
  }
  if (v.phase === 'show' && v.result) {
    const r = v.result, ids = Object.keys(r.won), names = ids.map(id => (v.players.find(p => p.id === id)?.me ? 'Tu' : esc(v.players.find(p => p.id === id)?.name || '')));
    const solo = ids.length === 1, meWins = solo && names[0] === 'Tu', total = pkNum(r.total);
    if (r.uncontested) return [meWins ? `Tu ramasses ${total}.` : `${pkNames(names)} ${solo ? 'ramasse' : 'ramassent'} ${total}.`,
      say(['Tout le monde s’est couché. Bluff ou pas, on ne saura jamais.', 'Personne n’a suivi. Les cartes restent secrètes.'])];
    const best = r.hands.find(h => h.id === ids[0]);
    const others = names.filter(n => n !== 'Tu');
    const who = meWins ? `Tu gagnes ${total}.` : solo ? `${names[0]} gagne ${total}.` : others.length < names.length ? `Tu partages ${total} avec ${pkNames(others)}.` : `${pkNames(names)} se partagent ${total}.`;
    return [who, `Avec ${pkHandWith(best?.hand || 'Carte haute')}. ${say(['Rien à redire.', 'Les autres rangent leurs jetons.', 'Le pot change de camp.'], k)}`];
  }
  const N = esc(v.toActName), cur = v.players.find(p => p.turn);
  const turnTitle = `${N} a la parole.`;
  if (!me) return [turnTitle, 'Tu regardes, tu joueras à la prochaine partie.'];
  if (me.out) return [turnTitle, say(['Plus un jeton pour toi. Profite du spectacle.', 'Tu as tout perdu. Reste pour les commentaires.'])];
  if (v.myTurn) {
    if (v.toCall) return ['À toi.', `${pkNum(v.toCall)} à suivre, ${pkNum(v.pot)} au pot. ${say(['Garde ton visage de joueur.', 'Ça sent le bluff, non ?', 'Respire, personne ne voit tes cartes.'], k)}`];
    return ['À toi.', say(['Personne n’a misé. Tu parles ou tu attaques.', 'Rien à suivre. Tente le coup, ou fais le mort.', 'La voie est libre. Profites-en, ou pas.'], k)];
  }
  if (me.folded) return [turnTitle, say(['Tu t’es couché. Regarde les autres transpirer.', 'Couché. Au moins, tu ne perds plus rien.'], k)];
  if (me.allin) return [turnTitle, say(['Tu es à tapis. Plus qu’à croiser les doigts.', 'Tapis. La suite ne dépend plus de toi.'], k)];
  if (cur?.bot) return [turnTitle, say(['Le robot calcule. Ou il fait semblant.', 'Les robots aussi savent bluffer.', 'Aucun tic à surveiller chez un robot. Dommage.'], k)];
  return [turnTitle, say([`Observe bien ${N}.`, 'Compte tes jetons en attendant.', 'Pas un regard sur les cartes du voisin.'], k)];
}

// les jetons de la table (feuille sur téléphone, colonne de droite sur PC), dans l'ordre des sièges
function pkStackRows(v) {
  return tbRows(v.players.map(p => {
    const [e, n] = tbSplit(pkSeatP(p));
    const sub = [p.me ? 'toi' : '', pkRole(p), p.out ? 'éliminé' : p.allin ? 'tapis' : p.folded ? 'couché' : p.turn ? 'parle' : '', p.bet && !p.out ? `mise ${pkNum(p.bet)}` : ''].filter(Boolean).join(' · ');
    return { e, name: n, sub, score: p.out ? '0' : pkNum(p.stack), me: p.me };
  }));
}
function pkSheetBody() {
  const v = pkLastView; if (!v) return '';
  if (tbSheet.kind === 'pk-log') return tbLog(v.log.slice().reverse().map(pkDot));
  return `<p class="tb-sheet-say">Main ${v.hand}, blindes ${pkNum(v.sb)} / ${pkNum(v.bb)}. ${pkNum(v.pot)} au pot.</p>${pkStackRows(v)}`;
}

function renderPoker(v) {
  if (!v) return;
  pkLastView = v;
  const root = $('#pk-main'); root.innerHTML = '';
  if (v.hand !== pkLastHand) { pkLastHand = v.hand; pkRaise = null; }
  const tk = `${v.hand}|${v.seq}|${v.toActId}`;
  if (tk !== pkTurnKey) { pkTurnKey = tk; pkTurnAt = Date.now() - (v.quiet || 0); }
  const me = v.me, mine = v.players.find(p => p.me), cur = v.players.find(p => p.turn);
  const desk = tbDesk();

  // la ligne de partie, et sur téléphone les deux puces qui ouvrent le fil et les jetons de la table
  const street = v.phase === 'hand' ? PK_STREET[v.street] : v.phase === 'show' && v.result && !v.result.uncontested ? 'abattage' : v.phase === 'show' ? 'fin de la main' : '';
  const left = v.phase === 'over' ? `Partie terminée · <b>${v.hand}</b> main${v.hand > 1 ? 's' : ''}`
    : `Main <b>${v.hand}</b> · blindes ${pkNum(v.sb)} / ${pkNum(v.bb)}${desk && street ? ` · ${street}` : ''}`;
  const chips = [];
  if (v.log.length) chips.push(tbChip(`${TB_ICON.log}Fil`, () => tbSheet.open('pk-log', 'Ce qui s’est passé', pkSheetBody), 'Ce qui s’est passé'));
  if (v.phase !== 'over') chips.push(tbChip(`<i class="pkx-coin" aria-hidden="true"></i><b>${mine && !mine.out ? pkNum(mine.stack) : 'Jetons'}</b>`, () => tbSheet.open('pk-stacks', 'Les jetons', pkSheetBody), 'Les jetons de la table'));
  root.appendChild(tbBar(left, chips));

  // la table : les autres en arc (jetons, mise du tour devant eux, donneur et blindes), le tapis avec les cartes communes et le pot
  const table = el('div', 'pkx-table');
  const seats = tbSeats(v.players.map(pkSeatP), {
    meId: mine?.id, currentId: v.phase === 'hand' ? v.toActId : null, since: v.phase === 'hand' ? pkTurnAt : null, fan: true,
    badge: p => p.dealer ? 'D' : p.sb ? 'PB' : p.bb ? 'GB' : null,
    cls: p => [p.dealer ? 'pkx-d' : p.sb || p.bb ? 'pkx-bl' : '', p.out ? 'out' : p.folded ? 'pkx-fold' : '', p.hole.length && p.hole[0] ? 'pkx-open' : '', !p.hole.length ? 'pkx-nocards' : '', p.won ? 'pkx-won' : ''].filter(Boolean).join(' '),
    under: p => {
      // une seule pastille sous le tas, pour tenir dans la largeur d'un siège : le gain, l'état, ou la mise du tour
      const pill = p.won ? `<span class="tb-tag">+${pkNum(p.won)}</span>` : p.out ? '<span class="tb-tag soft">éliminé</span>' : p.folded ? '<span class="tb-tag soft">couché</span>'
        : p.bet ? `<span class="pkx-bet">${pkPile(p.bet, 3)}<b>${pkNum(p.bet)}</b></span>` : p.turn && v.phase === 'hand' ? '<span class="tb-tag">parle</span>' : '';
      const stack = p.out ? '' : p.allin && !p.stack ? '<b class="pkx-allin">tapis</b>' : `<i class="pkx-coin" aria-hidden="true"></i>${pkNum(p.stack)}`;
      const shown = p.hole.length && p.hole[0] ? `<span class="pkx-shown">${p.hole.map(c => pkCard(c, 'mini')).join('')}</span>` : '';
      return `${stack ? `<span class="pkx-stk">${stack}</span>` : ''}${shown}${pill ? `<span class="pkx-under">${pill}</span>` : ''}`;
    },
  });
  // le temps de parole court sur 30 s (après quoi l'hôte peut passer le tour d'un absent)
  const nowSeat = seats.querySelector('.tb-opp.now:not(.bot)');
  if (nowSeat) nowSeat.style.setProperty('--since', `${-Math.min(30, (Date.now() - pkTurnAt) / 1000)}s`);
  // beaucoup d'adversaires sur un téléphone : un sur deux recule d'un rang, pour que les prénoms ne se chevauchent pas
  const opps = [...seats.children], zig = !desk && opps.length > 5;
  if (zig) seats.classList.add('pkx-zig');
  if (!desk) opps.forEach((o, i) => { o.style.top = (zig ? (i % 2 ? 78 : 0) : parseFloat(o.style.top) * 0.5).toFixed(1) + 'px'; });
  // même ordre que tbSeats : en partant de ta gauche
  const mi = v.players.findIndex(p => p.me), others = mi < 0 ? v.players : [...v.players.slice(mi + 1), ...v.players.slice(0, mi)];
  opps.forEach((o, i) => { const p = others[i]; if (p) o.setAttribute('aria-label', `${p.name}, ${p.out ? 'éliminé' : pkNum(p.stack) + ' jetons'}${p.bet ? `, mise ${pkNum(p.bet)}` : ''}${p.folded && !p.out ? ', couché' : p.allin ? ', tapis' : ''}${pkRole(p) ? ', ' + pkRole(p) : ''}`); });
  table.appendChild(seats);

  const felt = el('div', 'pkx-felt');
  const board = [...v.board]; while (board.length < 5) board.push(undefined);
  felt.innerHTML = (street && !desk && !zig ? `<span class="pkx-street">${street}</span>` : '')
    + `<div class="pkx-board">${board.map(c => c ? pkCard(c).replace('class="pk-card', `aria-label="${pkCardLabel(c)}" class="pk-card`) : '<div class="pk-card pk-empty" aria-hidden="true"></div>').join('')}</div>`
    + `<div class="pkx-pot">${v.pot ? pkPot(v.pot) : ''}<span class="pkx-pot-n">Pot <b>${pkNum(v.pot)}</b></span></div>`;
  table.appendChild(felt);
  root.appendChild(table);

  // ce qui se passe, dit par le meneur
  const [title, line] = pkVoice(v);
  const wonMe = !!(mine && mine.won), overWon = v.phase === 'over' && v.ranking?.[0]?.id === mine?.id;
  const pip = v.phase === 'over' ? '🏆' : v.phase === 'show' ? (wonMe ? '🎉' : v.result?.uncontested ? '🤫' : '🃏') : v.myTurn ? '✋' : cur ? tbSplit(pkSeatP(cur))[0] : '';
  root.appendChild(tbSay({ title, line, pip, hot: v.myTurn || wonMe || overWon }));

  // l'hôte peut passer le tour d'un joueur qui traîne
  if (v.phase === 'hand') {
    if (v.isHost && !v.myTurn && v.quiet > 30000) { if (cur && !cur.bot) root.appendChild(tbBtn('glass pkx-skip', `${esc(cur.name)} traîne ? Passer son tour`, () => act({ t: 'pk:skip' }))); }
    else if (v.isHost && !v.myTurn) setTimeout(() => { if (view?.pk?.hand === v.hand && view.pk.phase === 'hand') renderPoker(view.pk); }, Math.max(1000, 30200 - v.quiet));
  }

  // l'abattage, ou le classement final
  if (v.phase === 'show' && v.result && !v.result.uncontested) {
    const r = v.result, box = el('div', 'pk-result pkx-result');
    box.appendChild(el('span', 'mj-side-title', 'Abattage'));
    box.appendChild(el('div', 'mj-list', r.hands.slice().sort((a, b) => b.won - a.won).map(h => `<div class="mj-row pk-show${h.won ? ' win' : ''}"><span class="pk-show-name">${esc(h.name)}</span><span class="pk-show-hand">${esc(h.hand)}${h.won ? ` · <b>+${pkNum(h.won)}</b>` : ''}</span><span class="pk-show-cards">${h.hole.map(c => pkCard(c, 'mini')).join('')}</span></div>`).join('')));
    root.appendChild(box);
  }
  if (v.phase === 'over') {
    const box = el('div', 'pk-result pkx-result');
    box.appendChild(el('span', 'mj-side-title', 'Classement'));
    box.appendChild(el('div', 'mj-list', (v.ranking || []).map((r, i) => `<div class="mj-row pk-rank${r.id === mine?.id ? ' me' : ''}"><span class="pk-rank-n">${i + 1}</span><span class="pk-rank-name">${esc(r.name)}</span><b>${r.out ? 'éliminé' : pkNum(r.stack)}</b></div>`).join('')));
    root.appendChild(box);
  }

  // le plateau de verre : tes deux cartes, ton tas, et tes choix
  const acts = [];
  let size = null, note = '';
  if (v.phase === 'hand' && v.myTurn && me) {
    acts.push(tbBtn('glass', 'Se coucher', () => act({ t: 'pk:act', a: 'fold' })));
    if (v.toCall) { const c = tbBtn('glass', `<b>Suivre</b><small>${pkNum(Math.min(v.toCall, me.stack))}</small>`, () => act({ t: 'pk:act', a: 'call' })); c.setAttribute('aria-label', `Suivre ${pkNum(Math.min(v.toCall, me.stack))}`); acts.push(c); }
    else acts.push(tbBtn('glass', 'Parler', () => act({ t: 'pk:act', a: 'check' })));
    const canRaise = v.maxTo > v.curBet + v.toCall;
    if (canRaise) {
      const lo = Math.min(v.minTo, v.maxTo), hi = v.maxTo;
      if (pkRaise === null || pkRaise < lo || pkRaise > hi) pkRaise = lo;
      const verb = () => pkRaise >= hi ? 'Faire tapis' : v.curBet ? 'Relancer' : 'Miser';
      const go = tbBtn('hero', '', () => act({ t: 'pk:act', a: pkRaise >= hi ? 'allin' : 'raise', to: pkRaise }));
      const label = () => { go.innerHTML = `<b>${verb()}</b><small>à ${pkNum(pkRaise)}</small>`; go.setAttribute('aria-label', `${verb()} à ${pkNum(pkRaise)}`); };
      label(); acts.push(go);
      size = el('div', 'pkx-size');
      const head = el('div', 'pkx-size-top', `<span>${v.curBet ? 'Ta relance' : 'Ta mise'}</span><b class="pkx-amt">${pkNum(pkRaise)}</b>`);
      const input = el('input'); input.type = 'range'; input.min = lo; input.max = hi; input.step = v.bb / 2 || 1; input.value = pkRaise;
      input.setAttribute('aria-label', 'Montant de la mise');
      const fill = () => input.style.setProperty('--p', `${hi > lo ? ((pkRaise - lo) / (hi - lo)) * 100 : 100}%`);
      const quick = el('div', 'pkx-quick');
      const marks = () => [...quick.children].forEach(b => b.classList.toggle('on', +b.dataset.to === pkRaise));
      input.oninput = () => { pkRaise = +input.value; label(); fill(); head.querySelector('.pkx-amt').textContent = pkNum(pkRaise); marks(); };
      fill();
      [['Minimum', lo], ['½ pot', v.curBet + Math.round(v.pot / 2)], ['Pot', v.curBet + v.pot], ['Tapis', hi]].forEach(([l, x]) => {
        const to = Math.max(lo, Math.min(hi, x)), q = tbBtn('glass', l, () => { pkRaise = to; renderPoker(view.pk); });
        q.dataset.to = to; quick.appendChild(q);
      });
      marks();
      size.append(head, input, quick);
    }
  }
  if (v.phase === 'show') { if (v.isHost) acts.push(tbBtn('hero', 'Main suivante', () => act({ t: 'pk:next' }))); else note = 'La main suivante part toute seule.'; }
  if (v.phase === 'over' && v.isHost) acts.push(tbBtn('hero', 'Retour au salon', () => act({ t: 'restart' })));

  // sur téléphone, à l'abattage, tes cartes sont déjà dans la liste : le plateau ne garde que la suite
  const listed = !desk && v.phase === 'show' && v.result && !v.result.uncontested && v.result.hands.some(h => h.id === mine?.id);
  const hold = me && !me.out && v.phase !== 'over' && me.hole.length && !listed;
  if (hold || acts.length || note) {
    let body = null;
    if (hold) {
      body = el('div', 'pkx-mine' + (me.folded ? ' folded' : '') + (!desk && v.phase === 'show' ? ' small' : ''));
      const w = desk ? 96 : v.phase === 'show' ? 62 : 76;
      const cap = desk ? 70 : 54, fan = tbFan(me.hole.map(c => ({ html: pkCard(c, 'big'), label: pkCardLabel(c), no: me.folded, cls: wonMe ? 'pkx-win' : '' })), { w, cap, width: 240 });
      // tbFan prend au moins 240 px de large : pour deux cartes, on recadre l'éventail sur les cartes elles-mêmes
      const span = w + (me.hole.length > 1 ? cap : 0), inner = fan.firstElementChild, full = parseFloat(inner.style.width) || 240;
      fan.classList.add('pkx-fan'); fan.style.width = (span + 24) + 'px'; inner.style.marginLeft = (-(full - span) / 2 + 12) + 'px';
      body.appendChild(fan);
      const role = mine?.dealer ? '<i class="pkx-role d">D</i>' : mine?.sb ? '<i class="pkx-role">PB</i>' : mine?.bb ? '<i class="pkx-role">GB</i>' : '';
      body.appendChild(el('div', 'pkx-bank', `${pkPile(me.stack, 6, true)}<span class="pkx-bank-n"><b>${pkNum(me.stack)}</b><small>jetons${role}</small></span>`));
    }
    const leftTop = hold ? (me.folded ? 'Ta main · <b>couché</b>' : `Ta main${me.handName ? ` · <b>${esc(me.handName)}</b>` : ''}`) : '';
    const rightTop = hold ? (me.allin ? '<b>Tapis</b>' : me.bet ? `Ta mise <b>${pkNum(me.bet)}</b>` : v.phase === 'hand' && !v.myTurn && !me.folded ? 'Attends ton tour' : '') : '';
    const tray = tbTray({ left: leftTop, right: rightTop, body, acts });
    tray.classList.add('pkx-tray');
    if (size) tray.insertBefore(size, tray.querySelector('.tb-acts'));
    if (acts.length) tray.querySelector('.tb-acts').classList.add('pkx-acts', 'n' + acts.length);
    if (note) tray.appendChild(el('p', 'pkx-note', note));
    root.appendChild(tray);
  }

  // les jetons de la table et le fil (colonne de droite sur PC ; sur téléphone, les puces du haut)
  if (v.phase !== 'over') {
    const st = el('div', 'pk-log pkx-stacks');
    st.appendChild(el('p', 'mj-side-title', 'Les jetons'));
    st.insertAdjacentHTML('beforeend', pkStackRows(v));
    root.appendChild(st);
  }
  if (v.log.length) {
    const lg = el('ul', 'pk-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(pkDot(t)))));
    root.appendChild(lg);
  }

  // la feuille ouverte suit la partie ; en fin de partie, celle des jetons n'a plus lieu d'être
  if (tbSheet.kind === 'pk-log' || tbSheet.kind === 'pk-stacks') tbSheet.refresh(!(tbSheet.kind === 'pk-stacks' && v.phase === 'over'));
}
