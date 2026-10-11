// Bataille : affichage et commandes. Les règles du jeu sont dans engines/bataille.js.

'use strict';


// ============================================================ écran
// Nouveau style de table (d'après Chromo, briques communes de table.js) : tout l'écran est le tapis.
// Les adversaires sont assis en arc en haut avec leur tas ; au centre, les cartes du pli posées devant
// chacun (cachée + visible pendant une bataille) ; le meneur dans sa bulle ; en bas, dans le plateau
// de verre, ton tas, le bouton « Retourner » et l'interrupteur « Retourner tout seul ».
// Les tas et le fil s'ouvrent dans la feuille commune sur téléphone ; sur PC ils sont à droite (desk.js).
const btCard = (c, cls = '', style = '') => c
  ? `<div class="bt-card km-card ${cls}"${style ? ` style="${style}"` : ''}>${kmCardHTML(c)}</div>`
  : `<div class="bt-card back ${cls}"${style ? ` style="${style}"` : ''}></div>`;
function btMinutes(ms) {
  const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min${r ? ' ' + String(r).padStart(2, '0') : ''}` : `${r} s`;
}
const BT_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/></svg>';
const BT_DECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 6.5v12a2 2 0 0 0 2 2h9"/></svg>';
// l'épaisseur d'un tas : de 1 à 5 cartes dessinées selon ce qu'il contient
const btLayers = n => n <= 0 ? 0 : Math.min(5, Math.ceil(n / 8));
const btRank = r => r === 'A' ? 'Un as' : r === 'R' ? 'Un roi' : r === 'D' ? 'Une dame' : r === 'V' ? 'Un valet' : 'Un ' + r;

let btSeen = {};   // cartes déjà affichées par joueur, pour n'animer que les nouvelles
let btLastView = null;

// la feuille des tas ou du fil (téléphone)
function btSheetBody(kind) {
  const v = btLastView; if (!v) return '';
  if (kind === 'bt-log') return tbLog(v.log.slice().reverse());
  const rows = v.players.slice().sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.n - a.n).map(p => {
    const [e, n] = tbSplit(p);
    const sub = [p.me ? 'toi' : '', p.out ? 'éliminé' : p.need ? 'doit retourner' : '', p.auto && !p.bot && !p.out ? 'tout seul' : ''].filter(Boolean).join(' · ');
    return { e, name: n, sub, score: p.n, me: p.me };
  });
  const time = v.timeLeft === null ? 'On joue jusqu’au bout.' : v.timeLeft > 0 ? `Encore ${btMinutes(v.timeLeft)} de jeu.` : 'Le temps est écoulé, c’est le dernier pli.';
  return `<p class="tb-sheet-say">Pli ${v.pli}. Le dernier qui a des cartes gagne. ${time}</p>${tbRows(rows)}`;
}
const btOpenSheet = kind => tbSheet.open(kind, kind === 'bt-log' ? 'Au fil des plis' : 'Les tas', () => btSheetBody(kind));

function renderBataille(v) {
  if (!v) return;
  btLastView = v;
  const seen = {};
  const root = $('#bt-main');
  root.innerHTML = '';
  const say = list => list[(v.pli + v.games) % list.length];
  const me = v.me, mine = v.players.find(p => p.me);
  const res = v.result, winnerId = res?.id || (v.phase === 'over' ? v.ranking[0]?.id : null);
  const over = v.phase === 'over', playing = !!(me?.inGame && !me.out);

  // la ligne de partie, et sur téléphone les puces qui ouvrent le fil et les tas
  const chips = [];
  if (!over) {
    if (v.log.length) chips.push(tbChip(`${TB_ICON.log}Fil`, () => btOpenSheet('bt-log'), 'Au fil des plis'));
    chips.push(tbChip(`${TB_ICON.people}Les tas`, () => btOpenSheet('bt-tas'), 'Les tas'));
  }
  root.appendChild(tbBar(over ? `<b>${v.pli}</b> plis · ${v.wars} bataille${v.wars > 1 ? 's' : ''}` : `Pli <b>${v.pli}</b>${v.wars ? ` · ${v.wars} bataille${v.wars > 1 ? 's' : ''}` : ''}`, chips));

  // la table : les adversaires en arc avec leur tas (dans l'ordre de tbSeats), et au centre les cartes du pli
  const idx = v.players.findIndex(p => p.id === net.me);
  const others = idx < 0 ? v.players.slice() : [...v.players.slice(idx + 1), ...v.players.slice(0, idx)];
  const table = el('div', 'btx-table' + (over ? ' over' : ''));
  const pc = p => ['btx-seat', p.need && !over ? 'btx-need' : '', v.war && p.contest && v.phase !== 'show' && !over ? 'btx-fight' : '', p.id === winnerId ? 'btx-win' : '', p.out ? 'out' : ''].filter(Boolean).join(' ');
  table.appendChild(tbSeats(v.players, {
    badge: p => p.n,
    hot: p => p.n > 0 && p.n <= 3 && !over,
    cls: pc,
    under: p => {
      const k = btLayers(p.n);
      const pile = `<span class="btx-opile${k ? '' : ' empty'}" aria-hidden="true">${'<i></i>'.repeat(k)}</span>`;
      const tag = p.out ? '<span class="tb-tag soft">éliminé</span>' : over ? '' : p.id === winnerId ? `<span class="tb-tag">+${res?.n || 0}</span>`
        : v.war && p.contest && v.phase !== 'show' ? '<span class="tb-tag warn">bataille</span>' : p.auto && !p.bot ? '<span class="tb-tag soft">tout seul</span>' : '';
      return pile + tag;
    },
  }));
  // une étiquette lisible pour chaque siège (nom, tas, état)
  table.querySelectorAll('.tb-opp').forEach((o, i) => {
    const p = others[i]; if (!p) return;
    o.setAttribute('aria-label', `${p.name}, ${p.n} carte${p.n > 1 ? 's' : ''}${p.out ? ', éliminé' : p.need ? ', doit retourner' : ''}`);
  });

  if (!over) {
    const m = others.length, pot = v.players.reduce((n, p) => n + p.table.length, 0);
    const pli = el('div', 'btx-pli' + (m > 4 ? ' many' : m > 3 ? ' four' : '') + (v.phase === 'show' ? ' show' : '') + (v.war && v.phase !== 'show' ? ' war' : ''));
    const spot = (p, mineSpot, t) => {
      const sk = `${v.games}:${v.pli}:${p.id}`, before = btSeen[sk] || 0; seen[sk] = p.table.length;
      const k = p.table.length;
      const cls = ['btx-spot', mineSpot ? 'mine' : '', p.id === winnerId ? 'win' : '', v.phase === 'show' && p.id !== winnerId && k ? 'lose' : '',
        v.war && p.contest && v.phase !== 'show' ? 'fight' : '', p.need ? 'need' : ''].filter(Boolean).join(' ');
      const s = el('div', cls);
      s.style.setProperty('--k', String(Math.max(1, k)));
      if (!mineSpot) { s.style.left = (m === 1 ? 50 : 9 + 82 * t).toFixed(2) + '%'; s.style.setProperty('--arc', (1 - Math.sin(Math.PI * t)).toFixed(3)); }
      if (k) {
        // la plus récente devant, décalée pour qu'on lise le coin des cartes d'en dessous (bataille)
        s.innerHTML = p.table.map((c, i) => btCard(c, (c ? 'up' : '') + (i >= before ? ' new' : '') + (i === k - 1 ? ' top' : ''),
          `--i:${i};z-index:${i + 1};rotate:${tbTilt(`${sk}:${i}`, c ? 8 : 12).toFixed(1)}deg`)).join('');
      } else if (!p.out) s.innerHTML = `<div class="btx-ghost${p.need ? ' need' : ''}"></div>`;
      if (mineSpot && v.canFlip) { s.classList.add('tap'); s.setAttribute('role', 'button'); s.setAttribute('aria-label', 'Retourner ta carte'); s.tabIndex = 0; s.onclick = () => act({ t: 'bt:flip' }); }
      return s;
    };
    pli.style.setProperty('--mk', String(Math.max(1, mine?.table.length || 0)));
    others.forEach((p, i) => pli.appendChild(spot(p, false, (i + 0.5) / Math.max(1, m))));
    if (mine) pli.appendChild(spot(mine, true, 0));
    // au milieu, ce qui est en jeu
    if (v.phase === 'show' && res) pli.appendChild(el('span', 'btx-pot win', `<b>${res.n}</b> carte${res.n > 1 ? 's' : ''} pour ${res.id === mine?.id ? 'toi' : esc(tbSplit(v.players.find(p => p.id === res.id) || res)[1])}`));
    else if (pot) pli.appendChild(el('span', 'btx-pot' + (v.war ? ' war' : ''), `<b>${pot}</b> carte${pot > 1 ? 's' : ''} en jeu`));
    table.appendChild(pli);
  }
  root.appendChild(table);
  btSeen = seen;

  // ce qui se passe, dit par le meneur
  let title = '', line = '', pip = '', hot = false;
  if (over) {
    const w = v.ranking[0];
    const W = esc(tbSplit(w)[1]);
    title = v.reason === 'tout' ? `${W} rafle tout.` : `${W} gagne, avec ${w.score} cartes.`;
    line = v.reason === 'tout'
      ? say(['Les 52 cartes, sans exception. Respect.', 'Plus personne en face. La guerre est finie.'])
      : say(['Le temps est écoulé, on a compté les tas.', 'Pas de vainqueur par K.-O., mais aux points.']);
    if (v.best > 1) line += ` Record du soir : une ${v.best === 2 ? 'double' : v.best === 3 ? 'triple' : 'quadruple'} bataille.`;
    pip = '🏆'; hot = w?.id === mine?.id;
  } else if (v.phase === 'war') {
    title = v.war === 1 ? 'Bataille !' : v.war === 2 ? 'Double bataille !' : v.war === 3 ? 'Triple bataille !' : 'Encore une bataille !';
    line = say(['Une carte cachée, une carte visible. La plus forte rafle tout.', 'Égalité. On pose une carte à l’envers, et on recommence.', 'Personne ne lâche. Carte cachée, puis carte visible.']);
    pip = '⚔️'; hot = !!mine?.contest;
  } else if (v.phase === 'show' && res) {
    const self = res.id === mine?.id, [we, wn] = tbSplit(v.players.find(p => p.id === res.id) || res);
    title = self ? `Tu rafles ${res.n} cartes.` : `${esc(wn)} rafle ${res.n} cartes.`;
    line = res.war
      ? (self ? say(['La bataille est pour toi. Savoure.', 'Tu as gagné la bataille. Et tout ce qui traînait.']) : say(['La bataille lui revient, avec le butin.', 'Bataille perdue. Ça arrive aux meilleurs.']))
      : res.card ? `${btRank(res.card.r)}, et personne au-dessus.` : '';
    pip = self ? '🎉' : we; hot = self;
  } else if (v.canFlip) {
    title = v.war ? 'Ta carte de bataille.' : 'À toi de retourner.';
    line = me.auto ? 'Elle part toute seule dans un instant.' : say(['Touche ton tas. Le hasard fait le reste.', 'Aucune stratégie possible. Juste du courage.', 'Retourne, et prie pour un as.']);
    pip = '✋'; hot = true;
  } else if (me?.inGame && me.out) {
    title = 'Tu n’as plus de cartes.';
    line = say(['Éliminé, mais pas oublié. Regarde les autres s’écharper.', 'Fin de campagne pour toi. Place aux survivants.']);
    pip = '🪦';
  } else if (!me?.inGame) {
    title = 'Tu regardes cette bataille.';
    line = 'Tu joueras la prochaine partie.';
    pip = '👀';
  } else {
    const w = v.waiting, wp = w.length === 1 ? v.players.find(p => p.name === w[0]) : null;
    title = w.length === 1 ? `Plus que ${esc(wp ? tbSplit(wp)[1] : w[0])}.` : w.length ? `On attend ${w.length} joueurs.` : 'On retourne.';
    line = v.war ? 'Les autres se départagent. Toi, tu comptes les points.' : say(['Ta carte est posée. Tiens bon.', 'Les dés sont jetés. Enfin, les cartes.']);
    pip = wp ? tbSplit(wp)[0] : '🃏';
  }
  root.appendChild(tbSay({ title, line, pip, hot }));

  // le plateau de verre : ton tas, le compteur, le chrono, l'interrupteur et le gros bouton
  if (!over && playing && mine) {
    const body = el('div', 'btx-mine');
    const k = btLayers(mine.n);
    const pile = el('button', 'btx-pile' + (v.canFlip ? ' can' : '') + (k ? '' : ' empty'),
      `${Array.from({ length: k }, (_, i) => `<span class="bt-card back" style="--l:${k - 1 - i}"></span>`).join('')}${k ? '' : '<span class="btx-ghost"></span>'}<b class="btx-n">${mine.n}</b>`);
    pile.type = 'button'; pile.disabled = !v.canFlip;
    pile.setAttribute('aria-label', v.canFlip ? `Retourner ta carte, il t’en reste ${mine.n}` : `Ton tas, ${mine.n} carte${mine.n > 1 ? 's' : ''}`);
    pile.onclick = () => act({ t: 'bt:flip' });
    const col = el('div', 'btx-col');
    const pct = Math.round(mine.n / 52 * 100);
    const row = el('div', 'btx-chips');
    row.appendChild(tbChip(`${BT_DECK}<b>${mine.n}</b> sur 52`, null, `${mine.n} cartes sur 52`));
    row.appendChild(tbChip(`${BT_CLOCK}${v.timeLeft === null ? 'jusqu’au bout' : v.timeLeft > 0 ? btMinutes(v.timeLeft) : 'dernier pli'}`, null, 'Temps restant'));
    col.appendChild(row);
    col.appendChild(el('span', 'btx-meter', `<i style="width:${pct}%"></i>`));
    const auto = el('label', 'btx-auto', `<input type="checkbox" role="switch"${me.auto ? ' checked' : ''}><span class="btx-sw" aria-hidden="true"></span><span>Retourner tout seul</span>`);
    auto.querySelector('input').onchange = () => act({ t: 'bt:auto' });
    col.appendChild(auto);
    body.append(pile, col);
    const flip = tbBtn(v.canFlip ? 'hero pulse' : 'glass', v.war && v.canFlip ? 'Retourner ma carte de bataille' : 'Retourner', () => act({ t: 'bt:flip' }));
    flip.classList.add('bt-flip'); flip.disabled = !v.canFlip;
    root.appendChild(tbTray({ body, acts: [flip] }));
  }

  // classement et journal (colonne de droite sur PC ; sur téléphone, dans la feuille pendant la partie)
  const side = el('div', 'bt-side' + (over ? '' : ' in-play'));
  const list = over ? v.ranking : v.players.slice().sort((a, b) => (a.out ? 1 : 0) - (b.out ? 1 : 0) || b.n - a.n).map(p => ({ ...p, score: p.n }));
  side.innerHTML = `<h4 class="mj-side-title">${over ? 'Classement' : 'Les tas'}</h4>` + tbRows(list.map((p, i) => {
    const q = v.players.find(x => x.id === p.id) || p, [e, n] = tbSplit(q);
    return { e: over && i < 3 ? ['🥇', '🥈', '🥉'][i] : e, name: n, me: p.id === mine?.id,
      sub: [p.id === mine?.id ? 'toi' : '', p.out ? 'éliminé' : !over && q.need ? 'doit retourner' : ''].filter(Boolean).join(' · '),
      score: `${p.score}<small> carte${p.score > 1 ? 's' : ''}</small>` };
  }));
  root.appendChild(side);
  if (v.log.length) {
    const lg = el('div', 'bt-log' + (over ? '' : ' in-play'));
    lg.innerHTML = `<h4 class="mj-side-title">Au fil des plis</h4>${tbLog(v.log.slice().reverse())}`;
    root.appendChild(lg);
  }

  // fin de partie : l'hôte choisit la durée et relance
  if (over) {
    if (v.isHost) {
      const body = el('label', 'btx-len', '<span>Durée de la prochaine partie</span>');
      const sel = el('select'); sel.setAttribute('aria-label', 'Durée de la prochaine partie');
      sel.innerHTML = [['court', '5 minutes'], ['normal', '10 minutes'], ['long', '20 minutes'], ['fin', 'Jusqu’au bout']].map(([k, l]) => `<option value="${k}"${k === v.length ? ' selected' : ''}>${l}</option>`).join('');
      sel.onchange = () => act({ t: 'bt:length', length: sel.value });
      body.appendChild(sel);
      root.appendChild(tbTray({ body, acts: [tbBtn('hero', 'Rejouer', () => act({ t: 'bt:again' }))] }));
    } else root.appendChild(el('p', 'note btx-note', 'L’hôte peut relancer une partie.'));
  }

  // la feuille ouverte suit la partie ; à la fin elle n'a plus lieu d'être
  if (tbSheet.kind === 'bt-log' || tbSheet.kind === 'bt-tas') tbSheet.refresh(!over);
}
