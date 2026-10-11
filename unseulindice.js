// Un seul indice : affichage et commandes. Les règles sont dans engines/unseulindice.js.

'use strict';

// ============================================================ écran
// Même style que Chromo : tout l'écran est la table. Le devineur en haut, la carte mystère au milieu,
// les chevalets des autres autour, le meneur dans une bulle de verre, et la zone d'action dans un plateau
// de verre collé en bas. Le plateau n'est reconstruit que si ce qu'on peut y faire change : un indice en
// cours d'écriture ne s'efface jamais parce qu'un autre joueur vient de poser le sien.
// Le mot n'arrive jamais sur le téléphone du devineur avant la révélation (voir view() dans le moteur).
let usiSkel = null, usiFormKey = null, usiCardSeen = -1, usiStampSeen = '', usiLast = null, usiDraft = '', usiTimer = null;
const USI_NB = ' ';
const usiTouch = matchMedia('(hover: none)').matches;
// « 🦊 Kevin » → ['🦊', 'Kevin'] ; un robot n'a pas d'emoji, on lui en donne un
function usiSplit(p) {
  const n = p?.name || '';
  if (p?.bot) return ['🤖', n];
  const m = n.match(/^(\S+)[\s ]+(.+)$/u);
  return m && !/\p{L}/u.test(m[1]) ? [m[1], m[2]] : [glyph0(n), n];
}
const usiName = p => esc(usiSplit(p)[1]);
const usiPlural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const usiVerdict = n => n >= 13 ? 'Parfait. Rien à redire.' : n === 12 ? 'Incroyable, à un cheveu du sans-faute.' : n === 11 ? 'Génial. Cette table est connectée.'
  : n >= 9 ? 'Super. Vous vous comprenez.' : n >= 7 ? 'Pas mal. On peut faire mieux.' : n >= 4 ? 'Dans la moyenne. La revanche s’impose.' : `Aïe. Vous parlez la même langue, au moins${USI_NB}?`;
const USI_WHY = { double: 'en double', mot: 'trop proche du mot', main: 'rayé' };
const USI_PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';

function usiBuild(root) {
  root.innerHTML = '';
  const add = (tag, cls) => root.appendChild(el(tag, cls));
  usiSkel = { bar: add('div', 'usi-bar'), table: add('div', 'usi-table'), say: add('div', 'usi-say mj-status'), tray: add('section', 'usi-tray'), side: add('aside', 'usi-side') };
  usiSkel.tray.setAttribute('aria-label', 'À toi de jouer');
  usiSkel.trayTop = usiSkel.tray.appendChild(el('div', 'usi-tray-top'));
  usiSkel.form = usiSkel.tray.appendChild(el('div', 'usi-form'));
  usiSkel.trayFoot = usiSkel.tray.appendChild(el('div', 'usi-tray-foot'));
  usiFormKey = null;
}

// les cartes jouées : la feuille sur téléphone, la colonne de droite sur PC, et l'écran de fin
function usiHistHTML(v, full) {
  if (!v.history.length) return '<p class="usi-none">Aucune carte jouée pour l’instant.</p>';
  return `<ol class="usi-hist">${v.history.map((h, i) => {
    const mark = h.kind === 'ok' ? '<i class="ok" aria-label="trouvée">✓</i>' : h.kind === 'ko' ? '<i class="ko" aria-label="ratée">✗</i>' : '<i class="pass" aria-label="passée">–</i>';
    const lost = h.lostNext ? `<small>« ${esc(h.lostNext)} » perdue avec</small>` : h.lostNext === '' ? '<small>une carte gagnée rendue</small>' : '';
    const said = h.kind === 'ko' && full ? `<small>${esc(usiSplit({ name: h.guesser })[1])} a dit « ${esc(h.guess)} »</small>` : '';
    const clues = full && h.clues?.length ? `<small class="usi-hclues">${h.clues.map(c => c.out ? `<s>${esc(c.w)}</s>` : esc(c.w)).join(' · ')}</small>` : '';
    return `<li>${mark}<span><b>${esc(h.w)}</b>${said}${lost}${clues}</span><em>${i + 1}</em></li>`;
  }).join('')}</ol>`;
}
$('#usi-sheet-close').onclick = () => { $('#usi-sheet').hidden = true; };
$('#usi-sheet').onclick = e => { if (e.target.id === 'usi-sheet') $('#usi-sheet-close').click(); };

function renderUnSeulIndice(v) {
  if (!v) return;
  usiLast = v;
  const root = $('#usi-main');
  if (!usiSkel || !root.contains(usiSkel.bar)) usiBuild(root);
  const S = usiSkel, me = v.me || {}, G = v.guesser || {}, gn = usiName(G);
  const live = v.phase === 'clues' || v.phase === 'check' || v.phase === 'guess';
  const blind = !!me.guesser && live;
  const say = list => list[(v.cardNo + v.total) % list.length];          // une réplique stable pendant toute la carte
  const waiting = v.clues.filter(c => c.st === 'writing' && c.online);
  const shown = v.clues.filter(c => c.st === 'ok').length, out = v.clues.filter(c => c.st === 'out').length;
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };

  // ---------------------------------------------------------------- la ligne de partie
  S.bar.innerHTML = '';
  S.bar.appendChild(el('span', 'usi-chip', v.phase === 'over' ? 'Partie terminée' : `Carte <b>${v.cardNo}</b> sur ${v.total}`));
  const chip = el('button', 'usi-chip', `<span aria-hidden="true">✓</span><b>${v.score}</b> trouvée${v.score > 1 ? 's' : ''}${v.lost ? ` · ${v.lost} perdue${v.lost > 1 ? 's' : ''}` : ''}`);
  chip.type = 'button'; chip.setAttribute('aria-label', `${v.score} cartes trouvées, ${v.lost} perdues. Voir les cartes`);
  chip.onclick = () => { $('#usi-sheet-body').innerHTML = usiHistHTML(usiLast, usiLast.phase === 'over'); $('#usi-sheet').hidden = false; };
  S.bar.appendChild(chip);

  // ---------------------------------------------------------------- la table : le devineur, la carte, les chevalets
  const [ge] = usiSplit(G);
  const fresh = v.cardNo !== usiCardSeen && live; if (live) usiCardSeen = v.cardNo;
  let card;
  if (v.phase === 'over') card = `<div class="usi-card final"><small>Score de la table</small><b>${v.score}<span>/${v.total}</span></b></div>`;
  else if (blind) card = `<div class="usi-card back${fresh ? ' deal' : ''}" aria-label="Ton mot est caché"><b aria-hidden="true">?</b><small>Ton mot est caché</small></div>`;
  else {
    const r = v.phase === 'reveal' ? v.result : null, stampKey = r ? `${v.cardNo}|${v.played}` : '';
    const stamp = r ? `<span class="usi-stamp ${r.kind}${stampKey !== usiStampSeen ? ' pop' : ''}">${r.kind === 'ok' ? 'Trouvé' : r.kind === 'ko' ? 'Raté' : 'Passé'}</span>` : '';
    usiStampSeen = stampKey || usiStampSeen;
    card = `<div class="usi-card${fresh ? ' deal' : ''}"><small>Le mot mystère</small><b>${esc(v.word || '')}</b>${stamp}</div>`;
  }
  const easels = v.clues.map(c => {
    const [e, n] = usiSplit(c);
    let face;
    if (c.st === 'writing') face = `<span class="usi-pen">${USI_PEN}</span><span class="sr">écrit</span>`;
    else if (c.st === 'ready') face = c.w ? `<b>${esc(c.w)}</b>` : '<span class="usi-ready" aria-label="indice posé">✓</span>';
    else face = c.w ? `<b>${esc(c.w)}</b>` : '<b class="usi-hidden" aria-label="indice caché">?</b>';
    const why = c.st === 'out' ? `<span class="usi-why">${blind ? 'annulé' : USI_WHY[c.why] || 'annulé'}</span>` : '';
    return { c, html: `<span class="usi-board">${face}${why}</span><span class="usi-who"><i aria-hidden="true">${e}</i>${c.me ? 'Toi' : esc(n)}</span>` };
  });
  const canStrike = v.phase === 'check' && me.inGame && !me.guesser;
  const table = el('div', 'usi-table-in');
  if (v.phase === 'over') { table.innerHTML = card; S.table.replaceChildren(table); }
  else table.innerHTML = `<div class="usi-seat${me.guesser ? ' me' : ''}${G.online ? '' : ' off'}"><span class="usi-av">${ge}</span><span class="usi-nm">${me.guesser ? 'Toi' : gn}</span><span class="usi-role">devine</span></div>${card}`;
  const row = el('div', 'usi-easels' + (v.clues.length > 5 ? ' many' : ''));
  easels.forEach(({ c, html }, i) => {
    const node = el(canStrike && c.w ? 'button' : 'div', `usi-easel st-${c.st}${c.me ? ' me' : ''}${c.online ? '' : ' off'}`, html);
    node.style.setProperty('--tilt', `${((i * 37) % 7) - 3}deg`);
    if (canStrike && c.w) {
      node.type = 'button';
      node.setAttribute('aria-label', `${c.w}, de ${usiSplit(c)[1]}${c.st === 'out' ? `, ${USI_WHY[c.why] || 'annulé'}` : ''}. ${c.why === 'main' ? 'Rétablir' : c.st === 'out' ? '' : 'Rayer'}`);
      node.onclick = () => act({ t: 'usi:strike', id: c.id });
    }
    row.appendChild(node);
  });
  if (v.phase !== 'over') { table.appendChild(row); S.table.replaceChildren(table); }

  // ---------------------------------------------------------------- le meneur
  let title = '', line = '', pip = '', hot = false;
  if (v.phase === 'clues') {
    if (!me.inGame) { title = `${gn} devine.`; line = 'Tu regardes cette partie.'; pip = '👀'; }
    else if (me.guesser) { title = 'C’est toi qui devines.'; pip = '🙈'; line = say(['Les autres cherchent leurs indices. Ne regarde pas leurs écrans.', 'Patience, ils réfléchissent pour toi.', 'Ils écrivent. Pas de triche, pas de coup d’œil.']); }
    else if (!me.clue) { title = `${gn} devine.`; pip = '✍️'; hot = true; line = say(['Un mot, un seul. Et pas le plus évident.', 'Pense à ce que les autres n’écriront pas.', 'Original, mais pas trop.']); }
    else { title = `${gn} devine.`; pip = '⏳'; line = waiting.length ? `Plus que ${waiting.map(c => usiName(c)).join(', ')}.` : 'Tout le monde a écrit.'; }
  } else if (v.phase === 'check') {
    if (me.guesser) { title = 'On vérifie.'; pip = '🙈'; line = 'Les autres rayent les doublons. Encore un instant.'; }
    else { title = 'On vérifie.'; pip = '🔎'; hot = me.inGame; line = out ? `${usiPlural(out, 'indice')} tombe${out > 1 ? 'nt' : ''}. Un autre de trop${USI_NB}? Touche-le pour le rayer.` : `Aucun doublon. Rien de trop proche${USI_NB}?`; }
  } else if (v.phase === 'guess') {
    if (me.guesser) { title = 'À toi.'; pip = '💭'; hot = true; line = shown ? `${usiPlural(shown, 'indice')}${out ? `, ${out} tombé${out > 1 ? 's' : ''}` : ''}. Une seule proposition.` : 'Tous les indices sont tombés. Tente ta chance, ou passe.'; }
    else { title = `${gn} réfléchit.`; pip = '🤐'; line = say(['Pas un mot, pas une grimace.', 'Bouche cousue.', 'On ne souffle pas.']); }
  } else if (v.phase === 'reveal' && v.result) {
    const r = v.result, w = `« ${esc(r.word)} »`, who = r.guesserId === net.me ? 'Tu' : usiName({ name: r.guesser });
    if (r.kind === 'ok') { title = `Trouvé${USI_NB}!`; pip = '🎉'; hot = true; line = `${who} ${r.guesserId === net.me ? 'trouves' : 'trouve'} ${w}. Une carte de plus.`; }
    else if (r.kind === 'ko') { title = 'Raté.'; pip = '💥'; line = `« ${esc(r.guess)} », mais c’était ${w}.${r.lostNext ? ` « ${esc(r.lostNext)} » part avec.` : r.lostNext === '' ? ' Dernière carte, on en rend une gagnée.' : ''}`; }
    else { title = 'Passé.'; pip = '🤷'; line = `C’était ${w}. Rien de perdu de plus.`; }
  } else if (v.phase === 'over') { title = `${v.score} sur ${v.total}.`; pip = '🏁'; hot = v.score >= 9; line = usiVerdict(v.score); }
  S.say.className = 'usi-say mj-status' + (hot ? ' hot' : '');
  S.say.innerHTML = `<span class="usi-pip" aria-hidden="true">${pip}</span><div><h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p></div>`;

  // ---------------------------------------------------------------- le plateau : ce que je peux faire
  const role = !me.inGame ? 'watch' : me.guesser ? 'g' : 'c';
  const quietLong = v.phase === 'clues' && v.quiet > 20000;
  let key = `${v.phase}|${v.cardNo}|${v.played}|${role}`;
  if (v.phase === 'clues' && role === 'c') key += '|' + (me.clue ? 'posé:' + me.clue : 'à écrire');
  if (v.isHost) key += `|h${G.online ? '' : '-absent'}${quietLong && waiting.length && v.clues.some(c => c.st === 'ready') ? '-attente' : ''}`;
  // l'hôte voit « Ne plus attendre » au bout de 20 s sans nouvel indice
  clearTimeout(usiTimer);
  if (v.isHost && v.phase === 'clues' && !quietLong) usiTimer = setTimeout(() => { if (usiLast === v) renderUnSeulIndice({ ...v, quiet: 20001 }); }, 20500 - v.quiet);

  let top = '';
  if (v.phase === 'clues') top = role === 'c' ? (me.clue ? 'Ton indice est posé' : `Ton indice pour <b>${gn}</b>`) : role === 'g' ? 'Les indices arrivent' : '';
  else if (v.phase === 'check') top = role === 'c' ? `Les indices, avant de les montrer à <b>${gn}</b>` : 'Vérification des indices';
  else if (v.phase === 'guess') top = role === 'g' ? `${usiPlural(shown, 'indice')} pour toi` : `${gn} devine`;
  else if (v.phase === 'reveal') top = v.left ? `Encore ${usiPlural(v.left, 'carte')}` : 'C’était la dernière carte';
  else if (v.phase === 'over') top = 'Fin de la partie';
  S.trayTop.innerHTML = top ? `<span>${top}</span>` : '';
  S.trayFoot.innerHTML = v.phase === 'clues'
    ? `<span class="usi-bars" aria-label="${v.clues.length - waiting.length} indices sur ${v.clues.length}">${v.clues.map(c => `<i class="${c.st !== 'writing' ? 'on' : ''}${c.online ? '' : ' off'}"></i>`).join('')}</span>`
    : '';

  if (key !== usiFormKey) {
    usiFormKey = key;
    const F = S.form; F.innerHTML = '';
    const field = (ph, label, value, onGo, go) => {
      const f = el('form', 'usi-row');
      f.innerHTML = `<input class="usi-in" maxlength="${role === 'g' ? 40 : 24}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" placeholder="${ph}" aria-label="${label}"><button class="btn primary" type="submit">${go}</button>`;
      const inp = f.querySelector('input'); inp.value = value || '';
      inp.oninput = () => { if (role === 'c') usiDraft = inp.value; };
      f.onsubmit = e => { e.preventDefault(); const w = inp.value.trim(); if (!w) { inp.focus(); return; } onGo(w, inp); };
      F.appendChild(f);
      if (!usiTouch) setTimeout(() => inp.focus({ preventScroll: true }), 30);
      return f;
    };
    if (v.phase === 'clues' && role === 'c' && !me.clue) {
      field('Un seul mot', 'Ton indice', usiDraft, w => {
        if (/\s/.test(w)) { toast('Un seul mot, sans espace.'); return; }
        usiDraft = w; act({ t: 'usi:clue', word: w });
      }, 'Poser');
    } else if (v.phase === 'clues' && role === 'c') {
      const r = el('div', 'usi-mine', `<span>Ton indice<b>${esc(me.clue)}</b></span>`);
      r.appendChild(btn('ghost small', 'Changer', () => act({ t: 'usi:back' })));
      F.appendChild(r);
    } else if (v.phase === 'check' && role === 'c') {
      F.appendChild(btn('primary lg', `Montrer à ${gn}`, () => act({ t: 'usi:show' })));
    } else if (v.phase === 'guess' && role === 'g') {
      field('Ta réponse', 'Ta réponse', '', w => act({ t: 'usi:guess', word: w }), 'Proposer');
      F.appendChild(btn('ghost usi-pass', 'Passer cette carte', () => askConfirm('Passer cette carte\u00a0?', 'Elle est perdue, mais rien de plus.', 'Passer', () => act({ t: 'usi:pass' }))));
    } else if (v.phase === 'reveal') {
      usiDraft = '';
      if (v.isHost) F.appendChild(btn('primary lg', v.left ? 'Carte suivante' : 'Voir le score', () => act({ t: 'usi:next' })));
      else F.appendChild(el('p', 'usi-note', 'L’hôte retourne la carte suivante.'));
    } else if (v.phase === 'over') {
      if (v.isHost) F.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
      else F.appendChild(el('p', 'usi-note', 'L’hôte vous ramène au salon.'));
    }
    // l'hôte débloque la table : un devineur parti, des indices qui n'arrivent plus
    if (v.isHost && live && !G.online) F.appendChild(btn('ghost small', `${gn} est parti. Passer sa carte`, () => act({ t: 'usi:pass' })));
    if (v.isHost && key.endsWith('-attente')) F.appendChild(btn('ghost small', `Ne plus attendre ${waiting.map(c => usiSplit(c)[1]).join(', ')}`, () => act({ t: 'usi:hurry' })));
  }
  S.tray.hidden = !S.form.children.length && !top;

  // ---------------------------------------------------------------- la colonne : les cartes et la table (PC, et fin de partie)
  S.side.className = 'usi-side' + (v.phase === 'over' ? ' final' : '');
  S.side.innerHTML = `<p class="mj-side-title">Les cartes</p><div class="usi-score"><b>${v.score}</b><span>trouvée${v.score > 1 ? 's' : ''} sur ${v.total}${v.lost ? `, ${v.lost} perdue${v.lost > 1 ? 's' : ''}` : ''}</span></div>${usiHistHTML(v, v.phase === 'over' || v.phase === 'reveal')}`
    + `<p class="mj-side-title">À table</p><ul class="usi-people">${v.players.map(p => {
      const c = v.clues.find(x => x.id === p.id), [e, n] = usiSplit(p);
      const tag = !live ? '' : p.id === G.id ? 'devine' : c?.st === 'writing' ? 'écrit' : 'indice posé';
      return `<li class="${p.online ? '' : 'off'}${p.id === net.me ? ' me' : ''}"><i aria-hidden="true">${e}</i><span>${esc(n)}${p.id === net.me ? ' <small>toi</small>' : ''}</span><em>${p.online ? tag : 'absent'}</em></li>`;
    }).join('')}</ul>`;
  if (!$('#usi-sheet').hidden) $('#usi-sheet-body').innerHTML = usiHistHTML(v, v.phase === 'over');
}
