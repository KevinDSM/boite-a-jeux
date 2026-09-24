/* Hors Limite — l'équivalent maison de Limite Limite : une phrase à trous, et chacun la complète avec
   la carte (ou les deux cartes) la plus drôle, la plus absurde ou la plus limite de sa main.

   Cartes originales dans limite-cartes.js (HL_QUESTIONS, HL_ANSWERS ; « ! » = épicée, retirée en mode soft).
   Main de 10. À chaque manche, un juge tournant lit les phrases complétées, mélangées et anonymes, et
   choisit sa préférée : 1 point. Variante : tout le monde vote (1 point par vote, jamais pour soi).
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.hl), actions « hl:… ».
   Chargé après app.js et limite-cartes.js : réutilise $, el, act, esc, toast, shuffle, net et view. */

'use strict';

const HorsLimite = (() => {
  const HAND = 10, SEEN_KEY = 'hl-seen';
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  const spicy = s => s[0] === '!';
  const clean = s => spicy(s) ? s.slice(1) : s;
  const blanks = q => Math.max(1, clean(q).split('_').length - 1);
  const pl = (room, id) => room.players.find(p => p.id === id);
  const judge = room => room.mode === 'judge' ? pl(room, room.order[room.judge]) : null;
  const players = room => room.order.map(id => pl(room, id)).filter(p => p.online && p.id !== judge(room)?.id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 30) room.log.splice(0, room.log.length - 30); };

  /** La phrase complétée, en morceaux : texte de la carte question et réponses mises en valeur. */
  function fill(q, answers) {
    const parts = clean(q).split('_'), out = [];
    // en milieu de phrase, « Un raton laveur » devient « un raton laveur » ; les noms propres gardent leur majuscule
    const lower = (a, before) => (before && !/[.!?]\s*$/.test(before) && /^(?:L[’']|(?:Un|Une|Le|La|Les|Des|Du|De|Mon|Ma|Mes|Ton|Ta|Tes|Son|Sa|Ses|Notre|Nos|Ce|Cet|Cette|Ces|Quelques|Deux|Trois|Toutes|Tout) )/.test(a)) ? a[0].toLowerCase() + a.slice(1) : a;
    parts.forEach((t, i) => { if (t) out.push({ t }); if (i < parts.length - 1) out.push({ a: lower(answers[i] || '…', t) }); });
    return out;
  }

  function ordered(n, key) {
    let seen = new Set(); try { seen = new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { }
    const ids = [...Array(n).keys()];
    const fresh = shuffle(ids.filter(i => !seen.has(key + i))), old = shuffle(ids.filter(i => seen.has(key + i)));
    return old.concat(fresh);
  }
  function remember(ids) { try { const s = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); ids.forEach(i => s.add(i)); localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-800))); } catch { } }

  function create({ hostId, players: ps, target, mode, soft }) {
    const q = HL_QUESTIONS.map((t, i) => i).filter(i => !(soft && spicy(HL_QUESTIONS[i])));
    const a = HL_ANSWERS.map((t, i) => i).filter(i => !(soft && spicy(HL_ANSWERS[i])));
    const room = {
      hostId, phase: 'play', round: 0, target: clamp(target, 3, 20, 7), mode: mode === 'vote' ? 'vote' : 'judge', soft: !!soft,
      players: ps.map(p => ({ id: p.id, name: p.name, online: p.online !== false, score: 0, hand: [] })),
      order: [], judge: -1,
      deck: ordered(HL_ANSWERS.length, 'a').filter(i => a.includes(i)), discard: [],
      questions: ordered(HL_QUESTIONS.length, 'q').filter(i => q.includes(i)), qUsed: [],
      question: null, plays: {}, table: [], votes: {}, result: null, log: [], seq: 0, turnAt: Date.now(), winnerId: null,
    };
    room.order = shuffle(room.players.filter(p => p.online).map(p => p.id));
    room.players.forEach(p => { if (p.online) refill(room, p); });
    nextRound(room);
    return room;
  }
  function refill(room, p) {
    while (p.hand.length < HAND) {
      if (!room.deck.length) { room.deck = shuffle(room.discard); room.discard = []; }
      if (!room.deck.length) break;
      p.hand.push(room.deck.pop());
    }
  }
  function nextRound(room) {
    room.round += 1;
    if (room.mode === 'judge') { const n = room.order.length; let g = 0; do { room.judge = (room.judge + 1) % n; } while (g++ < n && !pl(room, room.order[room.judge])?.online); }
    if (!room.questions.length) { room.questions = shuffle(room.qUsed); room.qUsed = []; }
    room.question = room.questions.pop(); room.qUsed.push(room.question); remember(['q' + room.question]);
    room.plays = {}; room.table = []; room.votes = {}; room.result = null;
    room.phase = 'play'; room.turnAt = Date.now(); room.seq += 1;
  }
  const need = room => blanks(HL_QUESTIONS[room.question]);

  function play(room, pid, cardsIn) {
    if (room.phase !== 'play') return null;
    const p = pl(room, pid); if (!p || p.id === judge(room)?.id) return null;
    const cards = (Array.isArray(cardsIn) ? cardsIn : [cardsIn]).map(Number);
    if (cards.length !== need(room) || new Set(cards).size !== cards.length || !cards.every(c => p.hand.includes(c))) return `Choisis ${need(room)} carte${need(room) > 1 ? 's' : ''}`;
    room.plays[pid] = cards; room.seq += 1;
    if (players(room).every(q => room.plays[q.id])) startPick(room);
    return null;
  }
  function startPick(room) {
    room.table = shuffle(Object.entries(room.plays).map(([owner, cards]) => ({ owner, cards, key: owner.slice(0, 4) + cards.join('-') })));
    if (!room.table.length) { nextRound(room); return; }
    room.phase = 'pick'; room.votes = {}; room.turnAt = Date.now(); room.seq += 1;
  }
  function choose(room, pid, key) {
    if (room.phase !== 'pick') return null;
    const slot = room.table.find(s => s.key === key); if (!slot) return null;
    if (room.mode === 'judge') { if (pid !== judge(room)?.id) return null; return finish(room, { [slot.owner]: 1 }); }
    const p = pl(room, pid); if (!p?.online) return null;
    if (slot.owner === pid) return 'C’est ta phrase : vote pour une autre';
    room.votes[pid] = key; room.seq += 1;
    const voters = room.order.map(id => pl(room, id)).filter(q => q.online && room.table.some(s => s.owner !== q.id));
    if (voters.every(q => room.votes[q.id])) return finish(room, tally(room));
    return null;
  }
  const tally = room => { const g = {}; Object.values(room.votes).forEach(k => { const o = room.table.find(s => s.key === k)?.owner; if (o) g[o] = (g[o] || 0) + 1; }); return g; };
  function finish(room, gains) {
    Object.entries(gains).forEach(([id, g]) => { const p = pl(room, id); if (p) p.score += g; });
    const best = Math.max(0, ...Object.values(gains));
    room.result = { gains, winners: Object.keys(gains).filter(id => gains[id] === best && best > 0).map(id => pl(room, id)?.name) };
    room.table.forEach(s => { const p = pl(room, s.owner); if (p) p.hand = p.hand.filter(c => !s.cards.includes(c)); room.discard.push(...s.cards); });
    room.phase = 'reveal'; room.turnAt = Date.now(); room.seq += 1;
    log(room, room.result.winners.length ? `${room.result.winners.join(' et ')} remporte${room.result.winners.length > 1 ? 'nt' : ''} la manche.` : 'Personne ne marque cette manche.');
    return null;
  }
  function next(room, pid) {
    if (room.phase !== 'reveal' || (pid !== room.hostId && pid !== judge(room)?.id)) return null;
    const best = [...room.players].sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= room.target) { room.phase = 'over'; room.winnerId = best.id; room.seq += 1; return null; }
    room.players.forEach(p => { if (p.online) refill(room, p); });
    nextRound(room); return null;
  }
  function swap(room, pid) {
    if (room.phase !== 'play') return null;
    const p = pl(room, pid); if (!p || room.plays[pid] || p.id === judge(room)?.id || p.swapped === room.round) return null;
    if (p.score < 1) return 'Il faut 1 point pour changer toute ta main';
    room.discard.push(...p.hand); p.hand = []; p.score -= 1; p.swapped = room.round; refill(room, p); room.seq += 1;
    log(room, `${p.name} change toute sa main (−1 point).`);
    return null;
  }
  function hostSkip(room, pid) {
    if (pid !== room.hostId) return null;
    if (room.phase === 'play') { players(room).forEach(q => { if (!room.plays[q.id] && q.hand.length >= need(room)) room.plays[q.id] = shuffle(q.hand.slice()).slice(0, need(room)); }); startPick(room); return null; }
    if (room.phase === 'pick') return room.mode === 'judge' ? finish(room, { [room.table[Math.random() * room.table.length | 0].owner]: 1 }) : finish(room, tally(room));
    return null;
  }
  function act(room, pid, m) {
    switch (m.t) {
      case 'hl:play': return play(room, pid, m.cards);
      case 'hl:choose': return choose(room, pid, m.key);
      case 'hl:next': return next(room, pid);
      case 'hl:swap': return swap(room, pid);
      case 'hl:skip': return hostSkip(room, pid);
    }
    return null;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    const q = { id, name, online: true, score: 0, hand: [] };
    room.players.push(q); room.order.push(id); refill(room, q);
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on; if (on) return;
    if (room.phase === 'play' && judge(room)?.id !== id && players(room).length && players(room).every(q => room.plays[q.id])) startPick(room);
    if (room.phase === 'pick' && room.mode === 'judge' && judge(room)?.id === id) hostSkip(room, room.hostId);
  }

  function view(room, pid) {
    const me = pl(room, pid), j = judge(room), q = HL_QUESTIONS[room.question];
    const shown = s => ({ key: s.key, parts: fill(q, s.cards.map(c => clean(HL_ANSWERS[c]))), mine: s.owner === pid });
    return {
      phase: room.phase, round: room.round, target: room.target, mode: room.mode, seq: room.seq, isHost: pid === room.hostId,
      question: clean(q), need: need(room), judgeName: j?.name || '', isJudge: j?.id === pid, seated: !!me,
      me: me ? { hand: me.hand.map(c => ({ id: c, text: clean(HL_ANSWERS[c]), spicy: spicy(HL_ANSWERS[c]) })), played: room.plays[pid] || null, voted: room.votes[pid] || null, score: me.score, canSwap: me.score >= 1 && me.swapped !== room.round } : { hand: [], played: null, voted: null, score: 0, canSwap: false },
      players: room.order.map(id => { const p = pl(room, id); return { id, name: p.name, online: p.online, score: p.score, me: id === pid, judge: id === j?.id, done: room.phase === 'play' ? !!room.plays[id] : room.phase === 'pick' && room.mode === 'vote' ? !!room.votes[id] : false, gain: room.result?.gains[id] || 0 }; }),
      waiting: room.phase === 'play' ? players(room).filter(x => !room.plays[x.id]).map(x => x.name) : room.phase === 'pick' && room.mode === 'vote' ? room.order.map(id => pl(room, id)).filter(x => x.online && !room.votes[x.id] && room.table.some(s => s.owner !== x.id)).map(x => x.name) : [],
      playedCount: Object.keys(room.plays).length, playersCount: players(room).length,
      table: room.phase === 'pick' ? room.table.map(shown) : room.phase === 'reveal' || room.phase === 'over' ? room.table.map(s => ({ ...shown(s), owner: pl(room, s.owner)?.name, gain: room.result?.gains[s.owner] || 0 })) : [],
      result: room.result, quiet: Date.now() - room.turnAt, winnerName: room.winnerId ? pl(room, room.winnerId)?.name : null,
      scores: [...room.players].filter(p => room.order.includes(p.id)).sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score, me: p.id === pid })),
      log: room.log.slice(-3),
    };
  }
  return { HAND, fill, blanks, create, act, join, setOnline, view, count: () => [HL_QUESTIONS.length, HL_ANSWERS.length] };
})();

// ============================================================ écran
let hlPicked = [], hlLastRound = null, hlSkipTimer = null;
const HL_SKIP_MS = 60000;
const hlSentence = parts => parts.map(x => x.a !== undefined ? `<b class="hl-fill">${esc(x.a)}</b>` : esc(x.t)).join('');

function renderHorsLimite(v) {
  if (!v) return;
  const root = $('#hl-main'); root.innerHTML = '';
  clearTimeout(hlSkipTimer);
  if (v.round !== hlLastRound) { hlLastRound = v.round; hlPicked = []; }
  hlPicked = hlPicked.filter(id => v.me.hand.some(c => c.id === id));
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const me = v.me, judgeMode = v.mode === 'judge';

  root.appendChild(el('div', 'hl-head', `<span class="eyebrow">Manche ${v.round} · ${v.target} points${judgeMode ? ` · juge : ${esc(v.judgeName)}` : ' · tout le monde vote'}</span>`));
  const black = el('div', 'hl-black', `<p>${esc(v.question).replace(/_/g, '<span class="hl-blank"></span>')}</p>${v.need > 1 ? `<span class="hl-pick">Pose ${v.need} cartes</span>` : ''}<span class="hl-brand">Hors Limite</span>`);
  root.appendChild(black);

  const strip = el('div', 'hl-players');
  v.players.forEach(p => {
    const d = el('div', `hl-player${p.judge ? ' judge' : ''}${p.done ? ' done' : ''}${p.online ? '' : ' off'}${p.me ? ' me' : ''}`);
    d.innerHTML = `<span class="hl-player-name">${esc(p.name)}</span><span class="hl-player-score">${p.score}${v.phase === 'reveal' && p.gain ? ` <b>+${p.gain}</b>` : ''}</span>${p.judge ? '<span class="hl-badge">juge</span>' : p.done ? '<span class="hl-badge ok">✓</span>' : ''}`;
    strip.appendChild(d);
  });
  root.appendChild(strip);

  const zone = el('div', 'hl-zone');
  if (v.phase === 'play') {
    if (v.isJudge) zone.appendChild(el('p', 'hl-hint', `Tu es le juge : les autres complètent la phrase… (${v.playedCount}/${v.playersCount})`));
    else if (me.played) zone.appendChild(el('p', 'hl-hint', `C’est posé. On attend ${v.waiting.map(esc).join(', ') || 'plus personne'}.`));
    else {
      zone.appendChild(el('p', 'hl-hint', v.need > 1 ? `Touche ${v.need} cartes dans l’ordre des trous.` : 'Touche la carte qui complète le mieux la phrase.'));
      if (hlPicked.length) zone.appendChild(el('div', 'hl-preview', hlSentence(HorsLimite.fill(v.question, hlPicked.map(id => me.hand.find(c => c.id === id).text)))));
    }
    if (v.seated && !v.isJudge) {
      const g = el('div', 'hl-hand');
      me.hand.forEach(c => {
        const k = hlPicked.indexOf(c.id), played = me.played?.includes(c.id);
        const b = el('button', 'hl-white' + (k >= 0 || played ? ' on' : '') + (c.spicy ? ' spicy' : ''), `${esc(c.text)}${k >= 0 && v.need > 1 ? `<span class="hl-num">${k + 1}</span>` : ''}`); b.type = 'button';
        b.disabled = !!me.played;
        b.onclick = () => { if (k >= 0) hlPicked.splice(k, 1); else if (hlPicked.length < v.need) hlPicked.push(c.id); else { hlPicked[v.need - 1] = c.id; } renderHorsLimite(view.hl); };
        g.appendChild(b);
      });
      zone.appendChild(g);
      if (!me.played) {
        const go = btn('primary lg', hlPicked.length === v.need ? 'Poser' : `Choisis ${v.need - hlPicked.length} carte${v.need - hlPicked.length > 1 ? 's' : ''}`, () => { if (hlPicked.length === v.need) act({ t: 'hl:play', cards: hlPicked.slice() }); });
        go.disabled = hlPicked.length !== v.need; zone.appendChild(go);
        if (me.canSwap) zone.appendChild(btn('ghost small', 'Rien ne va ? Changer toute ma main (−1 point)', () => act({ t: 'hl:swap' })));
      }
    }
  }
  if (v.phase === 'pick' || v.phase === 'reveal' || v.phase === 'over') {
    const canChoose = v.phase === 'pick' && (judgeMode ? v.isJudge : v.seated && !me.voted);
    if (v.phase === 'pick') zone.appendChild(el('p', 'hl-hint', judgeMode ? (v.isJudge ? 'Lis les phrases à voix haute, puis choisis ta préférée.' : `${esc(v.judgeName)} choisit sa phrase préférée…`) : me.voted ? `Vote enregistré. On attend ${v.waiting.map(esc).join(', ') || 'plus personne'}.` : 'Vote pour la meilleure phrase. Pas la tienne !'));
    if (v.phase === 'reveal') { const w = v.result?.winners || []; zone.appendChild(el('p', 'hl-verdict', w.length ? `${w.map(esc).join(' et ')} remporte${w.length > 1 ? 'nt' : ''} la manche` : 'Personne ne marque')); }
    const list = el('div', 'hl-answers');
    const best = Math.max(0, ...v.table.map(s => s.gain || 0));
    v.table.forEach(s => {
      const b = el(canChoose && !(s.mine && !judgeMode) ? 'button' : 'div', 'hl-answer' + (s.mine ? ' mine' : '') + (me.voted === s.key ? ' on' : '') + (s.gain && s.gain === best ? ' win' : ''),
        `<p>${hlSentence(s.parts)}</p>${s.owner ? `<span class="hl-owner">${esc(s.owner)}${s.gain ? ` · +${s.gain}` : ''}</span>` : s.mine ? '<span class="hl-owner">la tienne</span>' : ''}`);
      if (b.tagName === 'BUTTON') { b.type = 'button'; b.onclick = () => act({ t: 'hl:choose', key: s.key }); }
      list.appendChild(b);
    });
    zone.appendChild(list);
    if (v.phase === 'reveal') { if (v.isHost || v.isJudge) zone.appendChild(btn('primary lg', 'Manche suivante', () => act({ t: 'hl:next' }))); else zone.appendChild(el('p', 'note', 'L’hôte ou le juge lance la suite.')); }
    if (v.phase === 'over') {
      zone.appendChild(el('div', 'hl-final', `<span class="eyebrow">Partie terminée</span><p class="hl-verdict">${esc(v.winnerName || '')} gagne</p><ol class="hl-ranking">${v.scores.map(s => `<li${s.me ? ' class="me"' : ''}><span>${esc(s.name)}</span><b>${s.score}</b></li>`).join('')}</ol>`));
      if (v.isHost) zone.appendChild(btn('primary lg', 'Retour au salon', () => act({ t: 'restart' })));
    }
  }
  if (v.isHost && (v.phase === 'play' || v.phase === 'pick')) {
    if (v.quiet > HL_SKIP_MS) zone.appendChild(btn('ghost small', v.phase === 'play' ? 'Quelqu’un bloque ? Jouer pour les absents' : judgeMode ? 'Le juge ne répond pas ? Tirer au sort' : 'Clore le vote', () => act({ t: 'hl:skip' })));
    else hlSkipTimer = setTimeout(() => { if (view?.hl) renderHorsLimite(view.hl); }, HL_SKIP_MS - v.quiet + 200);
  }
  root.appendChild(zone);
  const lg = el('ul', 'hl-log'); v.log.slice().reverse().forEach(t => lg.appendChild(el('li', '', esc(t)))); root.appendChild(lg);
}
