// Bataille : affichage et commandes. Les règles du jeu sont dans engines/bataille.js.

'use strict';


// ============================================================ écran
const btCard = (c, cls = '') => c ? `<div class="bt-card km-card ${cls}">${kmCardHTML(c)}</div>` : `<div class="bt-card back ${cls}"></div>`;
function btMinutes(ms) {
  const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min${r ? ' ' + String(r).padStart(2, '0') : ''}` : `${r} s`;
}
let btSeen = {};   // cartes déjà affichées par joueur, pour n'animer que les nouvelles
function renderBataille(v) {
  if (!v) return;
  const seen = {};
  const root = $('#bt-main');
  root.innerHTML = '';
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const say = list => list[(v.pli + v.games) % list.length];
  const me = v.me, mine = v.players.find(p => p.me);
  const res = v.result, winnerId = res?.id || (v.phase === 'over' ? v.ranking[0]?.id : null);

  // en-tête
  const time = v.timeLeft === null ? 'jusqu’au bout' : v.phase === 'over' ? 'temps écoulé' : v.timeLeft > 0 ? `encore ${btMinutes(v.timeLeft)}` : 'dernier pli';
  root.appendChild(el('p', 'mj-meta', v.phase === 'over' ? `${v.pli} plis · ${v.wars} bataille${v.wars > 1 ? 's' : ''}` : `Pli ${v.pli} · ${time}`));

  let title = '', line = '';
  if (v.phase === 'over') {
    const w = v.ranking[0];
    title = v.reason === 'tout' ? `${esc(w.name)} rafle tout.` : `${esc(w.name)} gagne, avec ${w.score} cartes.`;
    line = v.reason === 'tout'
      ? say(['Les 52 cartes, sans exception. Respect.', 'Plus personne en face. La guerre est finie.'])
      : say(['Le temps est écoulé, on a compté les tas.', 'Pas de vainqueur par K.-O., mais aux points.']);
    if (v.best > 1) line += ` Record du soir : une ${v.best === 2 ? 'double' : v.best === 3 ? 'triple' : 'quadruple'} bataille.`;
  } else if (v.phase === 'war') {
    title = v.war === 1 ? 'Bataille !' : v.war === 2 ? 'Double bataille !' : v.war === 3 ? 'Triple bataille !' : 'Encore une bataille !';
    line = say(['Une carte cachée, une carte visible. La plus forte rafle tout.', 'Égalité. On pose une carte à l’envers, et on recommence.', 'Personne ne lâche. Carte cachée, puis carte visible.']);
  } else if (v.phase === 'show' && res) {
    const self = res.id === mine?.id;
    title = self ? `Tu rafles ${res.n} cartes.` : `${esc(res.name)} rafle ${res.n} cartes.`;
    line = res.war
      ? (self ? say(['La bataille est pour toi. Savoure.', 'Tu as gagné la bataille. Et tout ce qui traînait.']) : say(['La bataille lui revient, avec le butin.', 'Bataille perdue. Ça arrive aux meilleurs.']))
      : res.card ? `${res.card.r === 'A' ? 'Un as' : res.card.r === 'R' ? 'Un roi' : res.card.r === 'D' ? 'Une dame' : res.card.r === 'V' ? 'Un valet' : 'Un ' + res.card.r}, et personne au-dessus.` : '';
  } else if (v.canFlip) {
    title = v.war ? 'Ta carte de bataille.' : 'À toi de retourner.';
    line = me.auto ? 'Elle part toute seule dans un instant.' : say(['Touche ton tas. Le hasard fait le reste.', 'Aucune stratégie possible. Juste du courage.', 'Retourne, et prie pour un as.']);
  } else if (me?.inGame && me.out) {
    title = 'Tu n’as plus de cartes.';
    line = say(['Éliminé, mais pas oublié. Regarde les autres s’écharper.', 'Fin de campagne pour toi. Place aux survivants.']);
  } else if (!me?.inGame) {
    title = 'Tu regardes cette bataille.';
    line = 'Tu joueras la prochaine partie.';
  } else {
    const w = v.waiting;
    title = w.length === 1 ? `Plus que ${esc(w[0])}.` : w.length ? `On attend ${w.length} joueurs.` : 'On retourne.';
    line = v.war ? 'Les autres se départagent. Toi, tu comptes les points.' : say(['Ta carte est posée. Tiens bon.', 'Les dés sont jetés. Enfin, les cartes.']);
  }
  root.appendChild(el('div', `mj-status bt-status${v.phase === 'war' ? ' war' : ''}`, `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`));

  if (mine && v.phase !== 'over') {
    const pct = Math.round(mine.n / 52 * 100);
    root.appendChild(el('div', 'mj-prog', `<i class="f" style="width:${pct}%"></i><span>${mine.n} carte${mine.n > 1 ? 's' : ''} sur 52</span>`));
  }

  // la table
  const table = el('div', `bt-table n${Math.min(v.players.length, 6)}`);
  const seats = v.players.slice().sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));
  seats.forEach(p => {
    const cls = ['bt-seat', p.me ? 'me' : '', p.out ? 'out' : '', p.id === winnerId ? 'win' : '', v.war && p.contest && v.phase !== 'show' ? 'fight' : '', p.need ? 'need' : ''].filter(Boolean).join(' ');
    const seat = el('div', cls);
    const pile = p.n ? `<div class="bt-pile${p.n > 12 ? ' thick' : p.n > 4 ? ' mid' : ''}">${btCard(null)}<b>${p.n}</b></div>` : `<div class="bt-pile empty"><b>0</b></div>`;
    const sk = `${v.games}:${v.pli}:${p.id}`, before = btSeen[sk] || 0; seen[sk] = p.table.length;
    const played = p.table.length ? `<div class="bt-played">${p.table.map((c, i) => btCard(c, (c ? 'up' : '') + (i >= before ? ' new' : ''))).join('')}</div>` : `<div class="bt-played none">${p.out ? '' : p.need ? '<span>à retourner</span>' : ''}</div>`;
    seat.innerHTML = `<div class="bt-name"><span>${p.bot ? '🤖 ' : ''}${esc(p.name)}${p.me ? ' <em>toi</em>' : ''}</span>${p.out ? '<i>éliminé</i>' : p.auto && !p.bot ? '<i>tout seul</i>' : ''}</div><div class="bt-cards">${pile}${played}</div>`;
    if (p.me && v.canFlip) { seat.classList.add('tap'); seat.onclick = () => act({ t: 'bt:flip' }); }
    table.appendChild(seat);
  });
  root.appendChild(table);
  btSeen = seen;

  // actions
  const row = el('div', 'bt-row');
  if (v.phase === 'over') {
    if (v.isHost) {
      const sel = el('select'); sel.setAttribute('aria-label', 'Durée de la prochaine partie');
      sel.innerHTML = [['court', '5 minutes'], ['normal', '10 minutes'], ['long', '20 minutes'], ['fin', 'Jusqu’au bout']].map(([k, l]) => `<option value="${k}"${k === v.length ? ' selected' : ''}>${l}</option>`).join('');
      sel.onchange = () => act({ t: 'bt:length', length: sel.value });
      row.append(sel, btn('primary lg', 'Rejouer', () => act({ t: 'bt:again' })));
    } else row.appendChild(el('p', 'note', 'L’hôte peut relancer une partie.'));
  } else if (me?.inGame && !me.out) {
    const b = btn('primary lg bt-flip', v.war && v.canFlip ? 'Retourner ma carte de bataille' : 'Retourner', () => act({ t: 'bt:flip' }));
    b.disabled = !v.canFlip;
    row.appendChild(b);
    const auto = el('label', 'bt-auto', `<input type="checkbox"${me.auto ? ' checked' : ''}><span>Retourner tout seul</span>`);
    auto.querySelector('input').onchange = () => act({ t: 'bt:auto' });
    row.appendChild(auto);
  }
  root.appendChild(row);

  // classement et journal (colonne de droite sur PC)
  const side = el('div', 'bt-side');
  const list = v.phase === 'over' ? v.ranking : v.players.slice().sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.n - a.n).map(p => ({ ...p, score: p.n }));
  side.innerHTML = `<h4 class="mj-side-title">${v.phase === 'over' ? 'Classement' : 'Les tas'}</h4><ol class="mj-list">${list.map((p, i) => `<li class="mj-row${p.id === mine?.id ? ' me' : ''}${p.out ? ' out' : ''}"><span>${i + 1}. ${esc(p.name)}</span><i>${p.out && !p.score ? 'éliminé' : `${p.score} carte${p.score > 1 ? 's' : ''}`}</i></li>`).join('')}</ol>`;
  root.appendChild(side);
  if (v.log.length) {
    const lg = el('div', 'bt-log');
    lg.innerHTML = `<h4 class="mj-side-title">Au fil des plis</h4><ul class="mj-list">${v.log.slice().reverse().map(t => `<li class="mj-row"><span>${esc(t)}</span></li>`).join('')}</ul>`;
    root.appendChild(lg);
  }
}
