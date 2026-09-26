/* Petit Brevet (ex-Petit Bac) — une lettre, des catégories, et le premier qui a tout rempli crie « Stop ! ».
   Option « sans stop » : chacun touche « J'ai fini », la manche s'arrête quand tout le monde a fini.

   Déroulement d'une manche : une lettre est tirée, chacun remplit ses catégories sur son téléphone
   (réponses envoyées à l'hôte au fil de la frappe, en silence). Le chrono s'arrête à la fin du temps
   ou quand un joueur qui a tout rempli touche « Stop ! » : trois secondes de grâce, puis vérification.
   Chacun peut contester les réponses des autres ; une réponse contestée par au moins la moitié des
   autres joueurs est refusée, l'hôte peut trancher. Points : 10 pour une réponse unique, 5 si
   quelqu'un a la même, 0 si vide, fausse ou refusée.
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.pb), actions « pb:… ».
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, norm, net et view. */

'use strict';

const PetitBac = (() => {
  const CATEGORIES = [
    'Prénom', 'Pays', 'Ville', 'Animal', 'Métier', 'Fruit ou légume', 'Objet', 'Marque',
    'Célébrité', 'Film ou série', 'Sport ou loisir', 'Plat ou aliment', 'Chanteur ou groupe', 'Personnage de fiction',
    'Vêtement ou accessoire', 'Moyen de transport', 'Partie du corps', 'Instrument de musique', 'Couleur',
    'Mot anglais', 'Dans une cuisine', 'Dans une salle de bain', 'Excuse pour être en retard', 'Cadeau nul',
    'Chose qui fait peur', 'Chose qu’on emporte en vacances', 'Insulte gentille', 'Jeu ou jouet',
  ];
  const DEFAULT = ['Prénom', 'Pays', 'Ville', 'Animal', 'Métier', 'Fruit ou légume', 'Objet', 'Marque'];
  const EASY = 'ABCDEFGHIJLMNOPRSTUV', HARD = 'KQWXYZ';
  const GRACE_MS = 3000, MAX_CATS = 14, ANSWER_MAX = 40;
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  // les articles ne comptent pas : « La Rochelle » vaut pour R, « L'Oréal » pour O
  const core = s => norm(s).replace(/^(le|la|les|l|un|une|des|du|de|d)\s+/, '').trim();
  const same = s => core(s).replace(/\s+/g, '').replace(/(s|x)$/, '');

  const pl = (room, id) => room.players.find(p => p.id === id);
  const seated = room => room.players.filter(p => p.inRound);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };

  function create({ hostId, players, cats, rounds, seconds, hard, stopRule }) {
    const list = (Array.isArray(cats) ? cats : DEFAULT).map(c => String(c).trim().slice(0, 40)).filter(Boolean).slice(0, MAX_CATS);
    const room = {
      hostId, phase: 'write', round: 0, rounds: clamp(rounds, 1, 20, 5), seconds: clamp(seconds, 30, 600, 120), hard: !!hard, stopRule: stopRule !== false, done: {},
      cats: list.length ? list : DEFAULT.slice(),
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, score: 0, inRound: false, last: 0 })),
      letter: '', used: [], answers: {}, stopBy: null, endsAt: 0, contests: {}, force: {}, ready: {}, result: null, log: [], seq: 0,
    };
    startRound(room);
    return room;
  }

  function drawLetter(room) {
    const pool = (EASY + (room.hard ? HARD : '')).split('');
    let free = pool.filter(l => !room.used.includes(l));
    if (!free.length) { room.used = []; free = pool; }
    const l = free[Math.random() * free.length | 0];
    room.used.push(l);
    return l;
  }

  function startRound(room) {
    room.round += 1;
    room.letter = drawLetter(room);
    room.players.forEach(p => { p.inRound = p.online; });
    room.answers = {}; seated(room).forEach(p => room.answers[p.id] = room.cats.map(() => ''));
    room.stopBy = null; room.done = {}; room.contests = {}; room.force = {}; room.ready = {}; room.result = null;
    room.phase = 'write'; room.endsAt = Date.now() + room.seconds * 1000; room.seq += 1;
    log(room, `Manche ${room.round}, la lettre ${room.letter}.`);
  }

  function setAnswers(room, pid, list) {
    if (!['write', 'stop'].includes(room.phase) || !room.answers[pid] || !Array.isArray(list)) return 'silent';
    room.answers[pid] = room.cats.map((_, i) => String(list[i] ?? '').slice(0, ANSWER_MAX));
    return 'silent';
  }

  // sans la règle du stop : chacun dit qu'il a fini, la manche s'arrête quand tout le monde a fini
  function finish(room, pid) {
    if (room.phase !== 'write' || !room.answers[pid] || room.stopRule) return null;
    room.done[pid] = !room.done[pid]; room.seq += 1;
    const people = seated(room).filter(p => p.online);
    if (people.length && people.every(p => room.done[p.id])) { room.phase = 'stop'; room.endsAt = Date.now() + GRACE_MS; room.seq += 1; log(room, 'Tout le monde a fini.'); }
    return null;
  }

  function stop(room, pid) {
    if (room.phase !== 'write' || !room.answers[pid]) return null;
    if (!room.stopRule) return finish(room, pid);
    if (room.answers[pid].some(a => !a.trim())) return 'Remplis toutes les catégories pour dire stop';
    room.stopBy = pid; room.phase = 'stop'; room.endsAt = Date.now() + GRACE_MS; room.seq += 1;
    log(room, `${pl(room, pid).name} crie « Stop ! ».`);
    return null;
  }

  const key = (pid, i) => `${pid}|${i}`;
  const letterOk = (room, a) => { const c = core(a); return c.length >= 2 && c[0] === norm(room.letter); };

  /** Validité de chaque réponse et points qui en découlent, recalculés à la volée. */
  function evaluate(room) {
    const people = seated(room);
    const cells = {};
    room.cats.forEach((_, i) => {
      people.forEach(p => {
        const a = (room.answers[p.id]?.[i] || '').trim(), k = key(p.id, i);
        const voters = people.filter(q => q.id !== p.id && q.online).length;
        const against = (room.contests[k] || []).length;
        const auto = a ? letterOk(room, a) : false;
        let valid = auto && !(voters > 0 && against >= Math.ceil(voters / 2));
        if (a && room.force[k] !== undefined) valid = room.force[k];
        cells[k] = { a, auto, valid, against, forced: room.force[k] ?? null };   // null et non undefined : passe le réseau
      });
      const groups = {};
      people.forEach(p => { const c = cells[key(p.id, i)]; if (c.valid) (groups[same(c.a)] = groups[same(c.a)] || []).push(p.id); });
      people.forEach(p => { const c = cells[key(p.id, i)]; c.points = c.valid ? (groups[same(c.a)].length > 1 ? 5 : 10) : 0; c.dup = c.valid && groups[same(c.a)].length > 1; });
    });
    const totals = {}; people.forEach(p => totals[p.id] = room.cats.reduce((s, _, i) => s + cells[key(p.id, i)].points, 0));
    return { cells, totals };
  }

  function contest(room, pid, target, i) {
    if (room.phase !== 'vote' || pid === target || !pl(room, pid)?.inRound || !room.answers[target]) return null;
    const k = key(target, i), list = room.contests[k] || (room.contests[k] = []);
    const at = list.indexOf(pid);
    if (at >= 0) list.splice(at, 1); else list.push(pid);
    delete room.ready[pid]; room.seq += 1;
    return null;
  }
  function force(room, pid, target, i, value) {
    if (room.phase !== 'vote' || pid !== room.hostId) return null;
    const k = key(target, i);
    if (value === null || value === undefined) delete room.force[k]; else room.force[k] = !!value;
    room.seq += 1;
    return null;
  }
  function ready(room, pid) {
    if (room.phase !== 'vote' || !pl(room, pid)?.inRound) return null;
    room.ready[pid] = !room.ready[pid]; room.seq += 1;
    if (seated(room).filter(p => p.online).every(p => room.ready[p.id])) score(room);
    return null;
  }

  function score(room) {
    const { cells, totals } = evaluate(room);
    seated(room).forEach(p => { p.last = totals[p.id]; p.score += totals[p.id]; });
    room.result = { cells, totals, letter: room.letter };
    room.phase = room.round >= room.rounds ? 'over' : 'result'; room.seq += 1;
    const best = seated(room).sort((a, b) => totals[b.id] - totals[a.id])[0];
    if (best) log(room, `Manche ${room.round}, ${best.name} marque le plus avec ${totals[best.id]} points.`);
  }

  function act(room, pid, m) {
    switch (m.t) {
      case 'pb:ans': return setAnswers(room, pid, m.answers);
      case 'pb:stop': return stop(room, pid);
      case 'pb:done': return finish(room, pid);
      case 'pb:contest': return contest(room, pid, m.target, m.i);
      case 'pb:force': return force(room, pid, m.target, m.i, m.value);
      case 'pb:ready': return ready(room, pid);
      case 'pb:score': if (pid === room.hostId && room.phase === 'vote') score(room); return null;
      case 'pb:next': if (pid === room.hostId && room.phase === 'result') startRound(room); return null;
    }
    return null;
  }

  function tick(room) {
    const now = Date.now();
    if (room.phase === 'write' && now >= room.endsAt) { room.phase = 'stop'; room.endsAt = now + GRACE_MS; room.seq += 1; log(room, 'Temps écoulé !'); return true; }
    if (room.phase === 'stop' && now >= room.endsAt) { room.phase = 'vote'; room.seq += 1; return true; }
    return false;
  }

  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, score: 0, inRound: false, last: 0 });      // jouera à la manche suivante
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on;
    if (!on && room.phase === 'vote' && seated(room).filter(q => q.online).every(q => room.ready[q.id])) score(room);
    if (!on && room.phase === 'write' && !room.stopRule) { const people = seated(room).filter(q => q.online); if (people.length && people.every(q => room.done[q.id])) { room.phase = 'stop'; room.endsAt = Date.now() + GRACE_MS; room.seq += 1; } }
  }

  function view(room, pid) {
    const me = pl(room, pid), open = ['vote', 'result', 'over'].includes(room.phase);
    const ev = open ? (room.phase === 'vote' ? evaluate(room) : { cells: room.result.cells, totals: room.result.totals }) : null;
    const people = seated(room);
    return {
      phase: room.phase, round: room.round, rounds: room.rounds, letter: room.letter, cats: room.cats, seq: room.seq, seconds: room.seconds,
      isHost: pid === room.hostId, seated: !!me?.inRound, left: Math.max(0, room.endsAt - Date.now()),
      stopBy: room.stopBy ? pl(room, room.stopBy)?.name : null, stopRule: room.stopRule,
      meDone: !!room.done[pid], doneCount: people.filter(p => room.done[p.id]).length, doneNeeded: people.filter(p => p.online).length,
      mine: me?.inRound ? room.answers[pid] : null,
      grid: open ? people.map(p => ({ id: p.id, name: p.name, me: p.id === pid, cells: room.cats.map((_, i) => { const c = ev.cells[key(p.id, i)]; return { ...c, mine: (room.contests[key(p.id, i)] || []).includes(pid) }; }), total: ev.totals[p.id] })) : null,
      ready: people.filter(p => room.ready[p.id]).length, readyNeeded: people.filter(p => p.online).length, meReady: !!room.ready[pid],
      scores: [...room.players].filter(p => p.inRound || p.score).sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score, last: p.last, me: p.id === pid })),
      waiting: room.players.filter(p => !p.inRound && p.online).map(p => p.name),
      log: room.log.slice(-3),
    };
  }

  return { CATEGORIES, DEFAULT, MAX_CATS, core, same, create, act, tick, join, setOnline, view, evaluate };
})();

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
