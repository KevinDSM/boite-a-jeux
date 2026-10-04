// PetitBac : affichage et commandes. Les règles du jeu sont dans engines/petitbac.js.

'use strict';


// ============================================================ écran
// Voix du meneur (voir DESIGN.md) : une phrase courte qui dit ce qui se passe à la table.
let pbDraft = null, pbKey = null, pbSendTimer = null, pbTimer = null, pbSentStop = null;
const pbNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
const pbBars = (done, all) => `${Array.from({ length: all }, (_, i) => `<i${i < done ? ' class="f"' : ''}></i>`).join('')}<span>${done} sur ${all}</span>`;

function pbSend() {
  clearTimeout(pbSendTimer);
  pbSendTimer = setTimeout(() => act({ t: 'pb:ans', answers: pbDraft }), 250);
}

/** Options du salon : catégories à cocher, et catégories maison. */
function renderPetitBacOpts() {
  const box = $('#opt-pb-cats'); if (!box || box.dataset.built) return;
  box.dataset.built = '1';
  PetitBac.CATEGORIES.forEach(c => { const l = el('label'); l.innerHTML = `<input type="checkbox" value="${esc(c)}"${PetitBac.DEFAULT.includes(c) ? ' checked' : ''}>${esc(c)}`; box.appendChild(l); });
  const count = () => { const n = box.querySelectorAll('input:checked').length; $('#opt-pb-count').textContent = `${n} catégorie${n > 1 ? 's' : ''} choisie${n > 1 ? 's' : ''}${n > PetitBac.MAX_CATS ? `, ${PetitBac.MAX_CATS} au maximum` : ''}.`; };
  box.addEventListener('change', count);
  $('#opt-pb-add').onclick = () => {
    const inp = $('#opt-pb-custom'), v = inp.value.trim().slice(0, 40);
    if (!v) return;
    const l = el('label'); l.innerHTML = `<input type="checkbox" value="${esc(v)}" checked>${esc(v)}`; box.appendChild(l);
    inp.value = ''; count();
  };
  $('#opt-pb-custom').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#opt-pb-add').click(); } });
  count();
}

function pbTimerBar(v, total) {
  const wrap = el('div', 'pb-timer'), bar = el('i'), txt = el('span');
  wrap.append(bar, txt);
  const start = Date.now(), left0 = v.left;
  const paint = () => {
    const left = Math.max(0, left0 - (Date.now() - start));
    bar.style.width = (100 * left / total) + '%';
    txt.textContent = Math.ceil(left / 1000) + ' s';
    wrap.classList.toggle('low', left < 10000);
  };
  paint(); clearInterval(pbTimer); pbTimer = setInterval(paint, 250);
  return wrap;
}

/** Ce que dit le meneur pendant l'écriture (recalculé sans toucher aux champs, voir pbRefreshWrite). */
function pbWriteVoice(v) {
  const say = list => list[(v.round - 1) % list.length];
  if (!v.stopRule && v.meDone) return ['Feuille rendue.', 'Tu peux la reprendre tant que les autres écrivent.'];
  return [say(['À vos stylos.', 'Top chrono.', 'Écris vite.']),
    v.stopRule ? say(['Tout rempli ? Crie stop.', 'Le premier qui a tout rempli arrête tout le monde.', 'Vite, et original. Un doublon ne vaut que 5.'])
      : 'Pas de stop cette fois. On s’arrête quand tout le monde a fini.'];
}

/** Écriture en cours, mode sans stop : qui a fini, et mes champs verrouillés tant que j'ai fini. */
function pbRefreshWrite(v) {
  if (v.stopRule) return;
  const info = $('#pb-main .pb-done'), b = $('#pb-main .pb-donebtn');
  if (info) info.innerHTML = pbBars(v.doneCount, v.doneNeeded);
  const [title, line] = pbWriteVoice(v), t = $('#pb-main .mj-title'), s = $('#pb-main .mj-say');
  if (t) t.textContent = title;
  if (s) s.textContent = line;
  if (b) b.textContent = v.meDone ? 'Je reprends ma feuille' : 'J’ai fini';
  if (b) b.classList.toggle('ghost', v.meDone);
  document.querySelectorAll('#pb-main .pb-in').forEach(i => { i.disabled = v.meDone; });
}

function renderPetitBac(v) {
  if (!v) return;
  const root = $('#pb-main');
  const k = `${v.round}|${v.phase}`;
  // pendant l'écriture, on ne reconstruit jamais les champs : une diffusion ne doit pas voler la saisie,
  // on met seulement à jour ce qui bouge (qui a fini, champs verrouillés)
  if (v.phase === 'write' && k === pbKey && root.querySelector('.pb-form')) { pbRefreshWrite(v); return; }
  if (v.round !== (pbKey || '').split('|')[0] * 1) { pbDraft = null; pbSentStop = null; }
  pbKey = k;
  root.innerHTML = ''; clearInterval(pbTimer);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const say = list => list[(v.round - 1) % list.length];          // une réplique stable pendant toute la manche

  root.appendChild(el('p', 'mj-meta', `Manche ${v.round} sur ${v.rounds} · ${v.cats.length} catégories`));

  // la lettre, et ce qui se passe, dit par le meneur
  let title = '', line = '', prog = null, halt = false;
  const writing = v.phase === 'write' || v.phase === 'stop';
  if (writing && !v.seated) { title = 'Manche en cours.'; line = 'Tu joues à la suivante.'; }
  else if (v.phase === 'write') { [title, line] = pbWriteVoice(v); if (!v.stopRule) prog = [v.doneCount, v.doneNeeded]; }
  else if (v.phase === 'stop') {
    halt = true;
    title = v.stopBy ? `${esc(v.stopBy)} crie stop !` : !v.stopRule && v.doneNeeded && v.doneCount >= v.doneNeeded ? 'Tout le monde a fini.' : 'Temps écoulé !';
    line = say(['Pose ton stylo.', 'Stylos en l’air.', 'On lâche tout.']);
  } else if (v.phase === 'vote') {
    prog = [v.ready, v.readyNeeded];
    if (!v.seated) { title = 'On vérifie.'; line = 'Tu regardes, tu joues à la manche suivante.'; }
    else if (v.meReady) { title = 'Vérifié.'; line = say(['Les autres relisent encore.', 'Il reste des yeux de lynx à la table.']); }
    else { title = 'On vérifie.'; line = 'Une réponse douteuse ? Touche-la pour la contester. Si la moitié des autres la conteste, elle saute.'; }
  } else if (v.phase === 'result') {
    const best = Math.max(0, ...v.grid.map(p => p.total)), tops = v.grid.filter(p => p.total === best).map(p => p.name);
    title = `${esc(pbNames(tops))} ${tops.length > 1 ? 'marquent' : 'marque'} ${best} points.`;
    line = say(['Nouvelle lettre, nouvelles chances.', 'Relis les réponses des autres, il y a des pépites.', 'Un doublon ne vaut que 5. Sois original.']);
  } else if (v.phase === 'over') { title = `${esc(v.scores[0]?.name || '')} gagne la partie.`; line = 'Revanche ? Tout se passe au salon.'; }
  const status = el('div', 'mj-status' + (halt ? ' pb-halt' : ''), `<h3 class="mj-title">${title}</h3><p class="mj-say">${line}</p>`);
  if (prog && prog[1] > 0) status.appendChild(el('div', 'mj-prog' + (v.phase === 'write' ? ' pb-done' : ''), pbBars(prog[0], prog[1])));
  const head = el('div', 'pb-head');
  head.appendChild(el('div', 'pb-letter', v.letter)); head.firstChild.setAttribute('aria-label', `Lettre ${v.letter}`);
  head.appendChild(status);
  root.appendChild(head);

  if (writing) {
    if (!v.seated) return;
    if (!pbDraft) pbDraft = (v.mine || v.cats.map(() => '')).slice();
    if (v.phase === 'stop') {
      if (pbSentStop !== v.round) { pbSentStop = v.round; clearTimeout(pbSendTimer); act({ t: 'pb:ans', answers: pbDraft }); }
    } else root.appendChild(pbTimerBar(v, v.seconds * 1000));
    const form = el('form', 'pb-form'); form.onsubmit = e => e.preventDefault();
    v.cats.forEach((c, i) => {
      const row = el('label', 'pb-row');
      row.innerHTML = `<span class="pb-cat">${esc(c)}</span>`;
      const inp = el('input', 'pb-in'); inp.id = `pb-in-${i}`; inp.type = 'text'; inp.maxLength = 40; inp.autocomplete = 'off'; inp.autocapitalize = 'words'; inp.spellcheck = false;
      inp.placeholder = v.letter; inp.value = pbDraft[i] || '';
      inp.disabled = v.phase === 'stop' || (!v.stopRule && v.meDone);
      const mark = () => row.classList.toggle('bad', !!inp.value.trim() && PetitBac.core(inp.value)[0] !== norm(v.letter));
      inp.oninput = () => { pbDraft[i] = inp.value; mark(); pbSend(); refreshStop(); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const nx = $(`#pb-in-${i + 1}`); if (nx) nx.focus(); else inp.blur(); } };
      mark();
      row.appendChild(inp); form.appendChild(row);
    });
    root.appendChild(form);
    const stopBtn = v.stopRule
      ? btn('danger lg pb-stopbtn', 'Stop !', () => { clearTimeout(pbSendTimer); act({ t: 'pb:ans', answers: pbDraft }); act({ t: 'pb:stop' }); })
      : btn('primary lg pb-donebtn', 'J’ai fini', () => { clearTimeout(pbSendTimer); act({ t: 'pb:ans', answers: pbDraft }); act({ t: 'pb:done' }); });
    const refreshStop = () => {
      if (!v.stopRule) return;
      const n = v.cats.length - pbDraft.filter(a => a.trim()).length; stopBtn.disabled = n > 0; stopBtn.textContent = n > 0 ? `Encore ${n} case${n > 1 ? 's' : ''}` : 'Stop !';
    };
    if (v.phase === 'write') {
      refreshStop(); root.appendChild(stopBtn);
      root.appendChild(el('p', 'fine pb-hint', 'Les articles ne comptent pas, « La Rochelle » vaut pour R.'));
      pbRefreshWrite(v);
    }
  }

  if (v.phase === 'vote' || v.phase === 'result' || v.phase === 'over') {
    const voting = v.phase === 'vote';
    const board = el('div', 'pb-board');
    v.cats.forEach((c, i) => {
      const block = el('section', 'pb-block');
      block.appendChild(el('h3', 'pb-block-cat', esc(c)));
      const list = el('div', 'pb-lines');
      v.grid.forEach(p => {
        const cell = p.cells[i];
        const cls = `pb-ans${cell.a ? '' : ' empty'}${cell.valid ? (cell.dup ? ' dup' : ' ok') : ' ko'}${cell.mine ? ' contested' : ''}${p.me ? ' me' : ''}`;
        const b = el(voting && cell.a && !p.me && v.seated ? 'button' : 'div', cls);
        if (b.tagName === 'BUTTON') { b.type = 'button'; b.onclick = () => act({ t: 'pb:contest', target: p.id, i }); }
        const why = !cell.a ? '' : !cell.auto && cell.forced === null ? 'mauvaise lettre' : cell.forced === false ? 'refusée par l’hôte' : cell.forced === true ? 'acceptée par l’hôte' : cell.against ? `${cell.against} contestation${cell.against > 1 ? 's' : ''}` : cell.dup ? 'en double' : '';
        const whyAll = [why, cell.mine ? 'tu contestes' : ''].filter(Boolean).join(' · ');
        b.innerHTML = `<span class="pb-who">${esc(p.name)}</span><span class="pb-word">${cell.a ? esc(cell.a) : 'vide'}</span><span class="pb-pts">${cell.points}</span>${whyAll ? `<span class="pb-why">${whyAll}</span>` : ''}`;
        const wrap = el('div', 'pb-line'); wrap.appendChild(b);
        if (voting && v.isHost && cell.a) {
          const f = el('button', 'pb-force', cell.forced === null ? '⚖' : '↺'); f.type = 'button';
          f.title = cell.forced === null ? 'Trancher' : 'Annuler la décision'; f.setAttribute('aria-label', f.title);
          f.onclick = () => act({ t: 'pb:force', target: p.id, i, value: cell.forced === null ? !cell.valid : null });
          wrap.appendChild(f);
        }
        list.appendChild(wrap);
      });
      block.appendChild(list);
      board.appendChild(block);
    });
    root.appendChild(board);
    const totals = el('div', 'pb-totals hm-players');
    totals.appendChild(el('span', 'mj-side-title', voting ? 'Points provisoires' : `Cette manche, lettre ${v.letter}`));
    [...v.grid].sort((a, b) => b.total - a.total).forEach(p => totals.appendChild(el('div', `hm-player${p.me ? ' me' : ''}`, `<span class="hm-name">${esc(p.name)}</span><span class="hm-score">${p.total}</span>`)));
    root.appendChild(totals);
    if (voting) {
      const row = el('div', 'pb-actions');
      if (v.seated) row.appendChild(btn(v.meReady ? 'ghost' : 'primary lg', v.meReady ? 'Finalement, je relis' : 'J’ai vérifié', () => act({ t: 'pb:ready' })));
      if (v.isHost) row.appendChild(btn('ghost small', 'Compter les points maintenant', () => act({ t: 'pb:score' })));
      if (v.isHost) row.appendChild(el('p', 'fine', 'Tu es l’hôte. ⚖ tranche une réponse, dans un sens ou dans l’autre, ↺ annule ta décision.'));
      root.appendChild(row);
    } else {
      if (v.phase === 'over') root.appendChild(el('ol', 'mj-list hm-rank', v.scores.map((s, i) => `<li class="mj-row${s.me ? ' me' : ''}"><span><i>${i + 1}</i>${esc(s.name)}</span><b>${s.score}</b></li>`).join('')));
      const sc = el('div', 'pb-scores hm-players');
      sc.appendChild(el('span', 'mj-side-title', v.phase === 'over' ? 'Classement final' : 'Total'));
      v.scores.forEach((s, i) => sc.appendChild(el('div', `hm-player${i === 0 && v.phase === 'over' ? ' lead' : ''}${s.me ? ' me' : ''}`, `<span class="hm-name">${esc(s.name)}</span><span class="hm-score">${s.score}</span>`)));
      root.appendChild(sc);
      if (v.isHost) root.appendChild(v.phase === 'over' ? btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })) : btn('primary lg', 'Manche suivante', () => act({ t: 'pb:next' })));
      else root.appendChild(el('p', 'note', 'L’hôte lance la suite.'));
    }
  }
  if (v.log.length) {
    const lg = el('ul', 'pb-log hm-log');
    lg.appendChild(el('li', 'mj-side-title', 'Ce qui s’est passé'));
    v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t))));
    root.appendChild(lg);
  }
}
