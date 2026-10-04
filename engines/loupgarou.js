/* Loup-Garou — le village contre les loups, sans meneur : l'application mène la partie.

   Chacun découvre son rôle en secret. La nuit, les rôles se réveillent l'un après l'autre et agissent
   sur leur téléphone (Cupidon la première nuit, puis Salvateur, Loups-Garous, Voyante, Sorcière).
   Chaque étape de nuit dure un temps minimum tiré au hasard, même si le rôle est mort ou absent :
   la durée d'une étape ne trahit rien. Au matin, les morts sont annoncés et leur rôle révélé, le
   village débat de vive voix puis vote sur les téléphones. Le Chasseur qui meurt tire une dernière
   balle, un amoureux meurt de chagrin avec l'autre.
   Victoire : le village quand il n'y a plus de loups, les loups quand il n'y a plus que des loups,
   un couple mixte quand il reste seul en vie.
   Même modèle que les autres jeux : la salle vit chez l'hôte (net.game.lw), actions « lw:… ».
   Chargé après app.js : réutilise $, el, act, esc, toast, shuffle, net et view. */

'use strict';

const LoupGarou = (() => {
  const ROLES = {
    wolf: { name: 'Loup-Garou', camp: 'wolves', text: 'Chaque nuit, avec les autres loups, tu dévores un villageois. Le jour, fais-toi passer pour un innocent.' },
    villager: { name: 'Villageois', camp: 'village', text: 'Aucun pouvoir, seulement ton flair et ta voix. Démasque les loups et fais-les éliminer au vote.' },
    seer: { name: 'Voyante', camp: 'village', text: 'Chaque nuit, tu découvres le vrai rôle d’un joueur. Aide le village sans te faire repérer par les loups.' },
    witch: { name: 'Sorcière', camp: 'village', text: 'Deux potions, une seule fois chacune. L’une sauve la victime des loups, l’autre empoisonne le joueur de ton choix.' },
    hunter: { name: 'Chasseur', camp: 'village', text: 'Si tu meurs, de nuit comme de jour, tu tires une dernière balle sur le joueur de ton choix.' },
    cupid: { name: 'Cupidon', camp: 'village', text: 'La première nuit, tu désignes deux amoureux. Si l’un meurt, l’autre meurt de chagrin.' },
    guard: { name: 'Salvateur', camp: 'village', text: 'Chaque nuit, tu protèges un joueur des loups. Jamais le même deux nuits de suite, et tu peux te protéger toi-même.' },
  };
  const SPECIALS = ['seer', 'witch', 'hunter', 'cupid', 'guard'];
  const THE = { wolf: 'un loup-garou', villager: 'un villageois', seer: 'la Voyante', witch: 'la Sorcière', hunter: 'le Chasseur', cupid: 'Cupidon', guard: 'le Salvateur' };
  const STEP = {
    cupid: { label: 'Cupidon se réveille.', say: 'Cupidon se réveille, et désigne deux amoureux.', max: 60000 },
    lovers: { label: 'Les amoureux se reconnaissent.', say: 'Les amoureux se réveillent, et se reconnaissent.', max: 30000 },
    guard: { label: 'Le Salvateur se réveille.', say: 'Le salvateur se réveille, et choisit qui protéger cette nuit.', max: 45000 },
    wolves: { label: 'Les loups-garous se réveillent.', say: 'Les loups-garous se réveillent, et choisissent leur victime.', max: 90000 },
    seer: { label: 'La Voyante se réveille.', say: 'La voyante se réveille, et découvre le rôle d’un joueur.', max: 45000 },
    witch: { label: 'La Sorcière se réveille.', say: 'La sorcière se réveille.', max: 60000 },
  };
  const MIN_STEP = [6000, 9500], REVEAL_MS = 14000, HUNTER_MS = 60000, CLOSE_MS = 5000;
  const between = ([a, b]) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi, def) => { const n = +v; return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

  const pl = (room, id) => room.players.find(p => p.id === id);
  const inGame = room => room.players.filter(p => p.inGame);
  const alive = room => inGame(room).filter(p => p.alive);
  const withRole = (room, r) => inGame(room).filter(p => p.role === r);
  const aliveRole = (room, r) => alive(room).find(p => p.role === r);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 40) room.log.splice(0, room.log.length - 40); };
  const autoWolves = n => n <= 6 ? 1 : n <= 11 ? 2 : 3;

  function deal(room) {
    const people = shuffle(inGame(room).slice()), n = people.length, st = room.settings;
    const w = Math.min(st.wolves === 'auto' ? autoWolves(n) : clamp(st.wolves, 1, 4, 1), Math.max(1, Math.floor((n - 1) / 2)));
    const roles = Array(w).fill('wolf');
    SPECIALS.forEach(r => { if (st.roles[r] && roles.length < n - 1) roles.push(r); });   // au moins un simple villageois
    while (roles.length < n) roles.push('villager');
    shuffle(roles).forEach((r, i) => { people[i].role = r; people[i].alive = true; });
  }

  function create({ hostId, players, wolves, roles, deadSee }) {
    const room = {
      hostId, settings: { wolves: wolves === 'auto' || wolves === undefined ? 'auto' : +wolves, roles: { seer: true, witch: true, hunter: true, cupid: false, guard: false, ...(roles || {}) }, deadSee: deadSee !== false },
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, inGame: p.online !== false, role: null, alive: false })),
      log: [], seq: 0,
    };
    newGame(room);
    return room;
  }

  function newGame(room) {
    room.players.forEach(p => { p.inGame = p.online; });
    deal(room);
    Object.assign(room, {
      phase: 'roles', night: 0, day: 0, steps: [], stepIdx: -1, step: null, stepMin: 0, stepMax: 0, stepDone: false,
      seenRole: {}, lovers: null, loversAck: {}, lastGuard: null, witchUsed: { life: false, death: false }, seerLog: [],
      a: {}, reveal: null, revealEnds: 0, pendingHunters: [], hunter: null, hunterEnds: 0,
      votes: {}, tied: null, voteRound: 1, closeAt: 0, winner: null, winners: [], revealSeq: 0,
    });
    room.log = []; log(room, `Nouvelle partie à ${inGame(room).length}, dont ${withRole(room, 'wolf').length} loup${withRole(room, 'wolf').length > 1 ? 's' : ''}.`);
    room.seq += 1;
  }

  // ------------------------------------------------------------ nuit
  function startNight(room) {
    room.night += 1; room.phase = 'night';
    room.a = { wolfVotes: {}, wolfTarget: null, guardTarget: null, seerPick: null, seerOk: false, witchSave: false, witchKill: null, cupid: null };
    const has = r => withRole(room, r).length > 0;
    room.steps = [];
    if (room.night === 1 && has('cupid')) room.steps.push('cupid', 'lovers');
    if (has('guard')) room.steps.push('guard');
    room.steps.push('wolves');
    if (has('seer')) room.steps.push('seer');
    if (has('witch')) room.steps.push('witch');
    log(room, `Nuit ${room.night}, le village s’endort.`);
    startStep(room, 0);
  }

  function actorsDone(room) {
    const s = room.step, a = room.a;
    if (s === 'cupid') return !aliveRole(room, 'cupid') || !!room.lovers;
    if (s === 'lovers') return !room.lovers || room.lovers.every(id => !pl(room, id).alive || room.loversAck[id]);
    if (s === 'guard') return !aliveRole(room, 'guard') || a.guardTarget !== null;
    if (s === 'wolves') { const ws = alive(room).filter(p => p.role === 'wolf'); const v = ws.map(w => a.wolfVotes[w.id]); return !ws.length || (v.every(Boolean) && v.every(x => x === v[0])); }
    if (s === 'seer') return !aliveRole(room, 'seer') || a.seerOk;
    if (s === 'witch') return !aliveRole(room, 'witch') || !!a.witchDone;
    return true;
  }

  function startStep(room, i) {
    room.stepIdx = i; room.step = room.steps[i];
    const now = Date.now();
    room.stepMin = now + between(MIN_STEP); room.stepMax = now + STEP[room.step].max;
    room.seq += 1;
  }

  function endStep(room) {
    const s = room.step, a = room.a;
    if (s === 'cupid' && !room.lovers) {                       // Cupidon absent ou endormi : le hasard décide
      const c = aliveRole(room, 'cupid');
      if (c) { const pick = shuffle(alive(room).map(p => p.id)).slice(0, 2); if (pick.length === 2) room.lovers = pick; }
    }
    if (s === 'wolves') {
      const tally = {}; Object.values(a.wolfVotes).forEach(t => { if (pl(room, t)?.alive) tally[t] = (tally[t] || 0) + 1; });
      const max = Math.max(0, ...Object.values(tally)), top = Object.keys(tally).filter(t => tally[t] === max);
      a.wolfTarget = top.length ? top[Math.random() * top.length | 0] : null;
    }
    if (room.stepIdx + 1 < room.steps.length) startStep(room, room.stepIdx + 1);
    else dawn(room);
  }

  function dawn(room) {
    const a = room.a, dead = [];
    if (a.wolfTarget && a.wolfTarget !== a.guardTarget && !a.witchSave) dead.push({ id: a.wolfTarget, cause: 'wolves' });
    if (a.witchSave) room.witchUsed.life = true;
    if (a.witchKill) { room.witchUsed.death = true; if (!dead.some(d => d.id === a.witchKill)) dead.push({ id: a.witchKill, cause: 'poison' }); }
    room.lastGuard = a.guardTarget;
    room.day += 1; room.step = null;
    const deaths = kill(room, dead);
    showReveal(room, { kind: 'dawn', title: `Jour ${room.day}. Le village se réveille`, deaths, empty: 'Personne n’est mort cette nuit.', next: 'day' });
  }

  /** Morts en chaîne : amoureux qui meurt de chagrin, chasseur qui devra tirer. */
  function kill(room, list) {
    const out = [], queue = list.slice();
    while (queue.length) {
      const { id, cause } = queue.shift(), p = pl(room, id);
      if (!p || !p.alive) continue;
      p.alive = false; out.push({ id, name: p.name, role: p.role, cause });
      log(room, `${p.name} meurt${cause === 'love' ? ' de chagrin' : ''}. C’était ${THE[p.role]}.`);
      if (room.lovers?.includes(id)) { const other = room.lovers.find(x => x !== id); if (pl(room, other)?.alive) queue.push({ id: other, cause: 'love' }); }
      if (p.role === 'hunter') room.pendingHunters.push(id);
    }
    return out;
  }

  function showReveal(room, r) {
    room.reveal = r; room.phase = 'reveal'; room.revealEnds = Date.now() + REVEAL_MS; room.revealSeq += 1; room.seq += 1;
  }

  function afterReveal(room) {
    const next = room.reveal?.next;
    if (room.pendingHunters.length) { room.hunter = room.pendingHunters.shift(); room.phase = 'hunter'; room.hunterEnds = Date.now() + HUNTER_MS; room.hunterNext = next; room.seq += 1; return; }
    if (checkWin(room)) return;
    if (next === 'day') startDay(room); else startNight(room);
  }

  function checkWin(room) {
    const al = alive(room), wolves = al.filter(p => p.role === 'wolf').length, others = al.length - wolves;
    let w = null;
    const L = room.lovers && room.lovers.map(id => pl(room, id));
    const mixed = L && (L[0].role === 'wolf') !== (L[1].role === 'wolf');
    if (mixed && al.length === 2 && L.every(p => p.alive)) w = 'lovers';
    else if (!al.length) w = 'nobody';
    else if (wolves === 0) w = 'village';
    else if (others === 0) w = 'wolves';
    if (!w) return false;
    room.winner = w; room.phase = 'over'; room.seq += 1;
    room.winners = inGame(room).filter(p => w === 'lovers' ? room.lovers.includes(p.id) : w === 'wolves' ? p.role === 'wolf' : w === 'village' ? p.role !== 'wolf' : false).map(p => p.id);
    log(room, w === 'village' ? 'Le village gagne.' : w === 'wolves' ? 'Les loups-garous gagnent.' : w === 'lovers' ? 'Les amoureux gagnent.' : 'Il ne reste personne.');
    return true;
  }

  // ------------------------------------------------------------ jour
  function startDay(room) {
    room.phase = 'day'; room.votes = {}; room.tied = null; room.lastTally = null; room.voteRound = 1; room.closeAt = 0; room.seq += 1;
  }
  function vote(room, pid, t) {
    const p = pl(room, pid), q = pl(room, t);
    if (room.phase !== 'day' || !p?.alive || !q?.alive || t === pid) return null;
    if (room.tied && !room.tied.includes(t)) return 'Revote entre les ex æquo seulement';
    room.votes[pid] = t; room.seq += 1;
    if (!room.closeAt && alive(room).filter(x => x.online).every(x => room.votes[x.id])) room.closeAt = Date.now() + CLOSE_MS;
    return null;
  }
  function resolveVote(room) {
    const tally = {}; Object.entries(room.votes).forEach(([v, t]) => { if (pl(room, v)?.alive && pl(room, t)?.alive) tally[t] = (tally[t] || 0) + 1; });
    const max = Math.max(0, ...Object.values(tally)), top = Object.keys(tally).filter(t => tally[t] === max);
    const shown = Object.entries(room.votes).map(([v, t]) => ({ from: pl(room, v)?.name, to: pl(room, t)?.name })).filter(x => x.from && x.to);
    if (top.length > 1 && room.voteRound === 1) {
      room.tied = top; room.voteRound = 2; room.votes = {}; room.closeAt = 0; room.lastTally = shown; room.seq += 1;
      log(room, `Égalité entre ${top.map(t => pl(room, t).name).join(' et ')}, on revote.`);
      return;
    }
    const out = top.length === 1 ? top[0] : null;
    const deaths = out ? kill(room, [{ id: out, cause: 'vote' }]) : [];
    showReveal(room, { kind: 'vote', title: 'Le village a voté', deaths, votes: shown, empty: top.length > 1 ? 'Nouvelle égalité. Personne n’est éliminé.' : 'Personne n’a voté. Personne n’est éliminé.', next: 'night' });
  }

  function shoot(room, pid, t) {
    if (room.phase !== 'hunter' || room.hunter !== pid || !pl(room, t)?.alive || t === pid) return null;
    return hunterDone(room, t);
  }
  function hunterDone(room, t) {
    const h = pl(room, room.hunter), next = room.hunterNext;
    const deaths = t ? kill(room, [{ id: t, cause: 'hunter' }]) : [];
    room.hunter = null;
    showReveal(room, { kind: 'hunter', title: `${h.name}, le chasseur, tire sa dernière balle`, who: h.name, deaths, empty: 'Le Chasseur n’a pas tiré.', next });
    return null;
  }

  // ------------------------------------------------------------ actions
  function act(room, pid, m) {
    const p = pl(room, pid), a = room.a || {};
    const mine = r => room.phase === 'night' && room.step === r && p?.alive && p.role === (r === 'wolves' ? 'wolf' : r);
    switch (m.t) {
      case 'lw:seen':
        if (room.phase !== 'roles' || !p?.inGame) return null;
        room.seenRole[pid] = true; room.seq += 1;
        if (inGame(room).filter(q => q.online).every(q => room.seenRole[q.id])) startNight(room);
        return null;
      case 'lw:begin': if (pid === room.hostId && room.phase === 'roles') startNight(room); return null;
      case 'lw:cupid': {
        if (!mine('cupid') || room.lovers) return null;
        const x = pl(room, m.a), y = pl(room, m.b);
        if (!x?.alive || !y?.alive || m.a === m.b) return 'Choisis deux joueurs différents';
        room.lovers = [m.a, m.b]; room.seq += 1; return null;
      }
      case 'lw:ack': if (room.phase === 'night' && room.step === 'lovers' && room.lovers?.includes(pid)) { room.loversAck[pid] = true; room.seq += 1; } return null;
      case 'lw:guard':
        if (!mine('guard') || a.guardTarget !== null) return null;
        if (!pl(room, m.to)?.alive) return null;
        if (m.to === room.lastGuard) return 'Pas le même joueur deux nuits de suite';
        a.guardTarget = m.to; room.seq += 1; return null;
      case 'lw:wolf': {
        if (!mine('wolves')) return null;
        const q = pl(room, m.to); if (!q?.alive || q.role === 'wolf') return null;
        a.wolfVotes[pid] = m.to; room.seq += 1; return null;
      }
      case 'lw:seer': {
        if (!mine('seer') || a.seerPick) return null;
        const q = pl(room, m.to); if (!q?.alive || m.to === pid) return null;
        a.seerPick = m.to; room.seerLog.push({ id: q.id, name: q.name, role: q.role, night: room.night }); room.seq += 1; return null;
      }
      case 'lw:seerok': if (mine('seer') && a.seerPick) { a.seerOk = true; room.seq += 1; } return null;
      case 'lw:save': if (mine('witch') && !room.witchUsed.life && a.wolfTarget && !a.witchDone) { a.witchSave = !a.witchSave; room.seq += 1; } return null;
      case 'lw:poison': {
        if (!mine('witch') || room.witchUsed.death || a.witchDone) return null;
        if (m.to === null) { a.witchKill = null; room.seq += 1; return null; }
        const q = pl(room, m.to); if (!q?.alive || m.to === pid) return null;
        a.witchKill = a.witchKill === m.to ? null : m.to; room.seq += 1; return null;
      }
      case 'lw:witchdone': if (mine('witch')) { a.witchDone = true; room.seq += 1; } return null;
      case 'lw:shoot': return shoot(room, pid, m.to);
      case 'lw:vote': return vote(room, pid, m.to);
      case 'lw:close': if (pid === room.hostId && room.phase === 'day') resolveVote(room); return null;
      case 'lw:next': if (pid === room.hostId && room.phase === 'reveal') afterReveal(room); return null;
      case 'lw:again': if (pid === room.hostId && room.phase === 'over') newGame(room); return null;
    }
    return null;
  }

  // les robots jouent leur rôle au hasard : actions de nuit, vote du jour, dernière balle du Chasseur
  function botTick(room) {
    if (Math.random() < .6) return false;
    const bots = inGame(room).filter(p => p.bot); if (!bots.length) return false;
    const any = list => list[Math.random() * list.length | 0], al = alive(room), a = room.a || {};
    const others = p => al.filter(q => q.id !== p.id);
    if (room.phase === 'roles') { const b = bots.find(p => !room.seenRole[p.id]); if (b) { act(room, b.id, { t: 'lw:seen' }); return true; } }
    if (room.phase === 'night' && room.step) {
      const s = room.step;
      if (s === 'cupid') { const c = aliveRole(room, 'cupid'); if (c?.bot && !room.lovers) { const two = shuffle(al.map(p => p.id)).slice(0, 2); if (two.length === 2) { act(room, c.id, { t: 'lw:cupid', a: two[0], b: two[1] }); return true; } } }
      if (s === 'lovers' && room.lovers) { const b = room.lovers.map(id => pl(room, id)).find(p => p?.bot && p.alive && !room.loversAck[p.id]); if (b) { act(room, b.id, { t: 'lw:ack' }); return true; } }
      if (s === 'guard') { const g = aliveRole(room, 'guard'); if (g?.bot && a.guardTarget === null) { const t = any(al.filter(p => p.id !== room.lastGuard)); if (t) { act(room, g.id, { t: 'lw:guard', to: t.id }); return true; } } }
      if (s === 'wolves') {
        const ws = al.filter(p => p.role === 'wolf'), prey = al.filter(p => p.role !== 'wolf');
        const human = ws.find(w => !w.bot && a.wolfVotes[w.id]);
        const b = ws.find(w => w.bot && (!a.wolfVotes[w.id] || (human && a.wolfVotes[w.id] !== a.wolfVotes[human.id])));
        if (b && prey.length) { act(room, b.id, { t: 'lw:wolf', to: human ? a.wolfVotes[human.id] : (Object.values(a.wolfVotes)[0] || any(prey).id) }); return true; }
      }
      if (s === 'seer') { const se = aliveRole(room, 'seer'); if (se?.bot && !a.seerOk) { if (!a.seerPick) { const t = any(others(se)); if (t) act(room, se.id, { t: 'lw:seer', to: t.id }); } else act(room, se.id, { t: 'lw:seerok' }); return true; } }
      if (s === 'witch') {
        const w = aliveRole(room, 'witch');
        if (w?.bot && !a.witchDone) {
          if (!room.witchUsed.life && a.wolfTarget && !a.witchSave && Math.random() < .5) act(room, w.id, { t: 'lw:save' });
          else if (!room.witchUsed.death && !a.witchKill && Math.random() < .15) { const t = any(others(w)); if (t) act(room, w.id, { t: 'lw:poison', to: t.id }); }
          act(room, w.id, { t: 'lw:witchdone' }); return true;
        }
      }
    }
    if (room.phase === 'day') {
      const b = al.find(p => p.bot && !room.votes[p.id]);
      if (b && Math.random() < .35) { const opts = others(b).filter(p => !room.tied || room.tied.includes(p.id)); if (opts.length) { act(room, b.id, { t: 'lw:vote', to: any(opts).id }); return true; } }
    }
    if (room.phase === 'hunter') { const h = pl(room, room.hunter); if (h?.bot) { const t = any(al.filter(p => p.id !== h.id)); if (t) shoot(room, h.id, t.id); else hunterDone(room, null); return true; } }
    return false;
  }
  function tick(room) {
    const now = Date.now();
    if (botTick(room)) return true;
    if (room.phase === 'night' && room.step) {
      if ((actorsDone(room) && now >= room.stepMin) || now >= room.stepMax) { endStep(room); return true; }
      return false;
    }
    if (room.phase === 'reveal' && now >= room.revealEnds) { afterReveal(room); return true; }
    if (room.phase === 'hunter' && now >= room.hunterEnds) { hunterDone(room, null); return true; }
    if (room.phase === 'day' && room.closeAt && now >= room.closeAt) { resolveVote(room); return true; }
    return false;
  }

  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, inGame: false, role: null, alive: false });      // regarde, jouera à la prochaine partie
  }
  function setOnline(room, id, on) {
    const p = pl(room, id); if (!p) return;
    p.online = on;
    if (!on && room.phase === 'roles' && inGame(room).filter(q => q.online).every(q => room.seenRole[q.id])) startNight(room);
  }

  // ------------------------------------------------------------ vue
  function view(room, pid) {
    const me = pl(room, pid), a = room.a || {}, st = room.settings;
    const seeAll = room.phase === 'over' || (st.deadSee && me && (!me.inGame || !me.alive));
    const lover = me && room.lovers?.includes(pid) ? pl(room, room.lovers.find(x => x !== pid)) : null;
    const knowLovers = room.lovers && (seeAll || lover) ? room.lovers : [];
    const players = inGame(room).map(p => ({
      id: p.id, name: p.name, alive: p.alive, online: p.online, me: p.id === pid,
      role: !p.alive || seeAll || p.id === pid || (me?.role === 'wolf' && p.role === 'wolf') ? p.role : null,
      lover: knowLovers.includes(p.id), voted: room.phase === 'day' && !!room.votes[p.id], winner: room.winners.includes(p.id),
    }));
    let action = null;
    const alivePlayers = alive(room);
    if (room.phase === 'night' && me?.alive) {
      const s = room.step;
      if (s === 'cupid' && me.role === 'cupid' && !room.lovers) action = { type: 'cupid', options: alivePlayers.map(p => ({ id: p.id, name: p.name })) };
      if (s === 'cupid' && me.role === 'cupid' && room.lovers) action = { type: 'done', text: `Tu as uni ${room.lovers.map(id => pl(room, id).name).join(' et ')}.` };
      if (s === 'lovers' && lover) {
        const mixed = (me.role === 'wolf') !== (lover.role === 'wolf');
        action = { type: 'lovers', partner: lover.name, acked: !!room.loversAck[pid], mixed };
      }
      if (s === 'guard' && me.role === 'guard') action = a.guardTarget ? { type: 'done', text: `Tu protèges ${pl(room, a.guardTarget).name} cette nuit.` } : { type: 'guard', options: alivePlayers.map(p => ({ id: p.id, name: p.name, blocked: p.id === room.lastGuard })) };
      if (s === 'wolves' && me.role === 'wolf') action = { type: 'wolves', options: alivePlayers.filter(p => p.role !== 'wolf').map(p => ({ id: p.id, name: p.name })), mine: a.wolfVotes[pid] || null,
        pack: alivePlayers.filter(p => p.role === 'wolf').map(w => ({ name: w.name, me: w.id === pid, target: a.wolfVotes[w.id] ? pl(room, a.wolfVotes[w.id]).name : null })) };
      if (s === 'seer' && me.role === 'seer') action = a.seerPick ? { type: 'seerResult', name: pl(room, a.seerPick).name, role: pl(room, a.seerPick).role, ok: a.seerOk } : { type: 'seer', options: alivePlayers.filter(p => p.id !== pid).map(p => ({ id: p.id, name: p.name })) };
      if (s === 'witch' && me.role === 'witch') action = a.witchDone ? { type: 'done', text: 'Tes potions sont rangées.' } : {
        type: 'witch', victim: a.wolfTarget ? pl(room, a.wolfTarget).name : null, life: !room.witchUsed.life, death: !room.witchUsed.death,
        save: a.witchSave, kill: a.witchKill, options: alivePlayers.filter(p => p.id !== pid).map(p => ({ id: p.id, name: p.name })) };
    }
    return {
      phase: room.phase, night: room.night, day: room.day, isHost: pid === room.hostId, seq: room.seq, revealSeq: room.revealSeq,
      seated: !!me?.inGame, seeAll: !!seeAll,
      me: me?.inGame ? { role: me.role, alive: me.alive, seen: !!room.seenRole[pid], lover: lover?.name || null,
        pack: me.role === 'wolf' ? withRole(room, 'wolf').filter(w => w.id !== pid).map(w => w.name) : [],
        seerLog: me.role === 'seer' ? room.seerLog : [], witch: me.role === 'witch' ? room.witchUsed : null } : null,
      players, action,
      step: room.phase === 'night' ? room.step : null, stepLabel: room.phase === 'night' && room.step ? STEP[room.step].label : '',
      stepSay: room.phase === 'night' && room.step ? (room.stepIdx === 0 ? 'La nuit tombe sur le village. Tout le monde ferme les yeux. ' : '') + STEP[room.step].say : '',
      seenCount: Object.keys(room.seenRole).length, total: inGame(room).length,
      reveal: room.phase === 'reveal' ? room.reveal : null, revealLeft: room.phase === 'reveal' ? Math.max(0, room.revealEnds - Date.now()) : 0,
      hunter: room.phase === 'hunter' ? { name: pl(room, room.hunter)?.name, me: room.hunter === pid, options: alivePlayers.filter(p => p.id !== room.hunter).map(p => ({ id: p.id, name: p.name })) } : null,
      myVote: room.votes[pid] || null, votedCount: alivePlayers.filter(p => room.votes[p.id]).length, aliveCount: alivePlayers.length,
      tied: room.tied ? room.tied.map(id => pl(room, id)?.name) : null, tiedIds: room.tied, lastTally: room.tied ? room.lastTally : null,
      closeIn: room.phase === 'day' && room.closeAt ? Math.max(0, room.closeAt - Date.now()) : 0,
      winner: room.winner, log: room.log.slice(-4),
    };
  }

  return { ROLES, SPECIALS, autoWolves, create, act, tick, join, setOnline, view };
})();
