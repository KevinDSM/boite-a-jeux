// Poker : affichage et commandes. Les règles du jeu sont dans engines/poker.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : le bloc d'état dit qui a la parole, la table et les cartes gardent leur dessin.
let pkRaise = null, pkLastHand = null;
const pkCard = (c, cls = '') => c ? `<div class="pk-card km-card ${cls}">${kmCardHTML(c)}</div>` : `<div class="pk-card back ${cls}"></div>`;
const PK_STREET = { preflop: 'avant le flop', flop: 'flop', turn: 'turn', river: 'river' };
const pkHandWith = h => ({ Brelan: 'un', Full: 'un', Carré: 'un' }[h] || 'une') + ' ' + h.toLowerCase();   // « avec un brelan »
const pkNum = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');   // 1 000, avec une espace fine insécable
const pkNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];

/** Ce que dit le meneur : [titre, réplique]. Les variantes suivent le numéro de main et le tour d'enchères. */
function pkVoice(v) {
  const me = v.me, k = ['preflop', 'flop', 'turn', 'river'].indexOf(v.street);
  const say = (list, j = 0) => list[(v.hand + j) % list.length];
  const mine = v.players.find(p => p.me);
  if (v.phase === 'over') {
    const won = v.ranking?.[0] && mine && v.ranking[0].id === mine.id;
    return [won ? 'Tu rafles tous les jetons.' : `${esc(v.winnerName || '')} rafle tous les jetons.`,
      won ? 'La table est à toi. Revanche ? Tout se passe au salon.' : say(['Revanche ? Tout se passe au salon.', 'Les poches sont vides. Revanche ? Tout se passe au salon.'])];
  }
  if (v.phase === 'show' && v.result) {
    const r = v.result, ids = Object.keys(r.won), names = ids.map(id => (v.players.find(p => p.id === id)?.me ? 'Tu' : esc(v.players.find(p => p.id === id)?.name || '')));
    const solo = ids.length === 1, meWins = solo && names[0] === 'Tu', total = pkNum(r.total);
    if (r.uncontested) return [meWins ? `Tu ramasses ${total}.` : `${pkNames(names)} ${solo ? 'ramasse' : 'ramassent'} ${total}.`,
      say(['Tout le monde s’est couché. Bluff ou pas, on ne saura jamais.', 'Personne n’a suivi. Les cartes restent secrètes.'])];
    const best = r.hands.find(h => h.id === ids[0]);
    const who = meWins ? `Tu gagnes ${total}.` : solo ? `${names[0]} gagne ${total}.` : `${pkNames(names)} se partagent ${total}.`;
    return [who, `Avec ${pkHandWith(best?.hand || 'Carte haute')}. ${say(['Rien à redire.', 'Les autres rangent leurs jetons.', 'Le pot change de camp.'], k)}`];
  }
  const N = esc(v.toActName), cur = v.players.find(p => p.turn);
  const turnTitle = `${N} a la parole.`;
  if (!me) return [turnTitle, 'Tu regardes, tu joueras à la prochaine partie.'];
  if (me.out) return [turnTitle, say(['Plus un jeton pour toi. Profite du spectacle.', 'Tu as tout perdu. Reste pour les commentaires.'])];
  if (v.myTurn) {
    if (v.toCall) return ['À toi.', `${pkNum(v.toCall)} à suivre, ${pkNum(v.pot)} au pot. ${say(['Garde ton visage de joueur.', 'Ça sent le bluff, non ?', 'Respire, personne ne voit tes cartes.'], k)}`];
    return ['À toi.', say(['Personne n’a misé. Tu parles ou tu attaques.', 'Rien à suivre. Tente le coup, ou fais le mort.', 'La voie est libre. Profites-en, ou pas.'], k)];
  }
  if (me.folded) return [turnTitle, say(['Tu t’es couché. Regarde les autres transpirer.', 'Couché. Au moins, tu ne perds plus rien.'], k)];
  if (me.allin) return [turnTitle, say(['Tu es à tapis. Plus qu’à croiser les doigts.', 'Tapis. La suite ne dépend plus de toi.'], k)];
  if (cur?.bot) return [turnTitle, say(['Le robot calcule. Ou il fait semblant.', 'Les robots aussi savent bluffer.', 'Aucun tic à surveiller chez un robot. Dommage.'], k)];
  return [turnTitle, say([`Observe bien ${N}.`, 'Compte tes jetons en attendant.', 'Pas un regard sur les cartes du voisin.'], k)];
}

function renderPoker(v) {
  if (!v) return;
  const root = $('#pk-main'); root.innerHTML = '';
  if (v.hand !== pkLastHand) { pkLastHand = v.hand; pkRaise = null; }
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me;

  // ce qui se passe, dit par le meneur
  const meta = [`Main ${v.hand}`, `blindes ${v.sb} / ${v.bb}`];
  if (v.phase === 'hand') meta.push(PK_STREET[v.street]);
  else if (v.phase === 'show' && v.result && !v.result.uncontested) meta.push('abattage');
  else if (v.phase === 'over') meta.splice(1, 1, 'partie terminée');
  root.appendChild(el('p', 'mj-meta', meta.join(' · ')));
  const [title, line] = pkVoice(v);
  root.appendChild(el('div', 'mj-status pk-status', `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`));

  // la table
  const ring = el('div', 'pk-ring' + (v.players.length >= 6 ? ' many' : ''));
  const list = v.players, n = list.length, meIdx = Math.max(0, list.findIndex(p => p.me));
  list.forEach((p, i) => {
    // les sièges suivent la table dans le sens horaire, mais évitent la bande du milieu où sont les cartes
    // communes : on saute ±25° autour de la gauche et de la droite (arcs utiles 25-155° et 205-335°)
    const k = (i - meIdx + n) % n, t = k * 260 / n;
    const deg = t < 65 ? 90 + t : t < 195 ? 205 + (t - 65) : 25 + (t - 195), ang = deg * Math.PI / 180;
    const d = el('div', `pk-seat${p.turn ? ' turn' : ''}${p.folded ? ' folded' : ''}${p.out ? ' out' : ''}${p.me ? ' me' : ''}${p.won ? ' won' : ''}${p.online ? '' : ' off'}`,
      `<span class="pk-name">${p.bot ? '🤖 ' + esc(p.name.replace(/^Robot /, '')) : esc(p.name)}</span><span class="pk-stack">${p.out ? 'éliminé' : pkNum(p.stack)}</span>`
      + (p.hole.length && !p.me ? `<span class="pk-hole">${p.hole.map(c => pkCard(c, 'mini')).join('')}</span>` : '')
      + (p.bet ? `<span class="pk-bet">${p.bet}</span>` : '') + (p.dealer ? '<span class="pk-btn" title="donneur">D</span>' : '')
      + (p.allin && !p.out ? '<span class="pk-tag">tapis</span>' : p.folded && !p.out ? '<span class="pk-tag">couché</span>' : '') + (p.won ? `<span class="pk-tag win">+${pkNum(p.won)}</span>` : ''));
    d.style.left = Math.min(85, Math.max(15, 50 + 41 * Math.cos(ang))).toFixed(2) + '%';
    d.style.top = (50 + 45 * Math.sin(ang)).toFixed(2) + '%';
    ring.appendChild(d);
  });
  const felt = el('div', 'pk-felt');
  const board = [...v.board]; while (board.length < 5) board.push(undefined);
  felt.innerHTML = `<div class="pk-board">${board.map(c => c ? pkCard(c) : '<div class="pk-card pk-empty"></div>').join('')}</div><div class="pk-pot">Pot <b>${pkNum(v.pot)}</b></div>`;
  ring.appendChild(felt);
  root.appendChild(ring);

  // mes cartes et mes choix
  if (me && !me.out) root.appendChild(el('div', 'pk-mine' + (me.folded ? ' folded' : ''), `<div class="pk-myhole">${me.hole.map(c => pkCard(c, 'big')).join('')}</div><div class="pk-myinfo"><b>${pkNum(me.stack)} jetons</b>${me.folded ? '<span>couché</span>' : me.handName ? `<span>${esc(me.handName)}</span>` : ''}</div>`));

  if (v.phase === 'hand') {
    if (v.myTurn) {
      const bar = el('div', 'pk-actions');
      bar.appendChild(btn('ghost', 'Se coucher', () => act({ t: 'pk:act', a: 'fold' })));
      bar.appendChild(v.toCall ? btn('', `Suivre ${pkNum(Math.min(v.toCall, me.stack))}`, () => act({ t: 'pk:act', a: 'call' })) : btn('', 'Parler', () => act({ t: 'pk:act', a: 'check' })));
      const canRaise = v.maxTo > v.curBet + v.toCall;
      if (canRaise) {
        const lo = Math.min(v.minTo, v.maxTo), hi = v.maxTo;
        if (pkRaise === null || pkRaise < lo || pkRaise > hi) pkRaise = lo;
        const label = () => pkRaise >= hi ? `Faire tapis à ${pkNum(hi)}` : `${v.curBet ? 'Relancer' : 'Miser'} à ${pkNum(pkRaise)}`;
        const go = btn('primary', label(), () => act({ t: 'pk:act', a: pkRaise >= hi ? 'allin' : 'raise', to: pkRaise }));
        bar.appendChild(go);
        root.appendChild(bar);
        const size = el('div', 'pk-size');
        const input = el('input'); input.type = 'range'; input.min = lo; input.max = hi; input.step = v.bb / 2 || 1; input.value = pkRaise;
        input.setAttribute('aria-label', 'Montant de la mise');
        input.oninput = () => { pkRaise = +input.value; go.textContent = label(); };
        size.appendChild(input);
        const quick = el('div', 'pk-quick');
        [['Minimum', lo], ['½ pot', v.curBet + Math.round(v.pot / 2)], ['Pot', v.curBet + v.pot], ['Tapis', hi]].forEach(([l, x]) => quick.appendChild(btn('ghost small', l, () => { pkRaise = Math.max(lo, Math.min(hi, x)); renderPoker(view.pk); })));
        size.appendChild(quick);
        root.appendChild(size);
      } else root.appendChild(bar);
    }
    if (v.isHost && !v.myTurn && v.quiet > 30000) { const cur = v.players.find(p => p.turn); if (cur && !cur.bot) root.appendChild(btn('ghost small', `${esc(cur.name)} traîne ? Passer son tour`, () => act({ t: 'pk:skip' }))); }
    else if (v.isHost && !v.myTurn) setTimeout(() => { if (view?.pk?.hand === v.hand && view.pk.phase === 'hand') renderPoker(view.pk); }, Math.max(1000, 30200 - v.quiet));
  }

  if (v.phase === 'show' && v.result) {
    const r = v.result;
    if (!r.uncontested) {
      const box = el('div', 'pk-result');
      box.appendChild(el('span', 'mj-side-title', 'Abattage'));
      box.appendChild(el('div', 'mj-list', r.hands.slice().sort((a, b) => b.won - a.won).map(h => `<div class="mj-row pk-show${h.won ? ' win' : ''}"><span class="pk-show-name">${esc(h.name)}</span><span class="pk-show-hand">${esc(h.hand)}${h.won ? ` · +${pkNum(h.won)}` : ''}</span><span class="pk-show-cards">${h.hole.map(c => pkCard(c, 'mini')).join('')}</span></div>`).join('')));
      root.appendChild(box);
    }
    root.appendChild(v.isHost ? btn('primary lg', 'Main suivante', () => act({ t: 'pk:next' })) : el('p', 'note', 'La main suivante part toute seule.'));
  }
  if (v.phase === 'over') {
    const box = el('div', 'pk-result');
    box.appendChild(el('span', 'mj-side-title', 'Classement'));
    box.appendChild(el('div', 'mj-list', (v.ranking || []).map((r, i) => `<div class="mj-row pk-rank${r.id === v.players.find(p => p.me)?.id ? ' me' : ''}"><span class="pk-rank-n">${i + 1}</span><span class="pk-rank-name">${esc(r.name)}</span><b>${r.out ? 'éliminé' : pkNum(r.stack)}</b></div>`).join('')));
    root.appendChild(box);
    if (v.isHost) root.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
  }
  if (v.log.length) {
    const lg = el('ul', 'pk-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }
}
