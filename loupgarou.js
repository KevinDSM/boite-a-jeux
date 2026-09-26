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

// ============================================================ écran
// Voix du meneur (voir DESIGN.md). La carte de rôle, le rôle qu'on maintient appuyé et l'écran de nuit gardent
// le dessin du jeu ; l'interface autour (état, choix, votes, village, journal) suit l'ossature commune.
// Le narrateur vocal (STEP.say, lwSay) parle à la table : des phrases entières, naturelles à l'oral.
let lwPeek = false, lwSpoken = null, lwBuzz = null, lwCupid = [], lwTimer = null;

const LW_ICON = {
  wolf: '<path d="M10 14 16 5l5 10h6l5-10 6 9-2 14-6 8-6 6-6-6-6-8z"/><circle cx="19" cy="24" r="1.8" fill="currentColor"/><circle cx="29" cy="24" r="1.8" fill="currentColor"/><path d="M21 33l3 2 3-2"/>',
  villager: '<path d="M7 23 24 8l17 15v18H7z"/><path d="M20 41V30h8v11"/>',
  seer: '<path d="M4 24q20-18 40 0-20 18-40 0z"/><circle cx="24" cy="24" r="6"/><circle cx="24" cy="24" r="2" fill="currentColor"/>',
  witch: '<path d="M19 6h10M21 6v10L10 36q-2 6 4 6h20q6 0 4-6L27 16V6"/><circle cx="20" cy="33" r="2"/><circle cx="27" cy="29" r="1.5"/>',
  hunter: '<circle cx="24" cy="24" r="14"/><circle cx="24" cy="24" r="4"/><path d="M24 4v10M24 34v10M4 24h10M34 24h10"/>',
  cupid: '<path d="M24 40 10 26q-6-8 0-14 7-5 14 3 7-8 14-3 6 6 0 14z"/><path d="M6 42 20 28M6 42h6M6 42v-6"/>',
  guard: '<path d="M24 6l16 6v12q0 12-16 18Q8 36 8 24V12z"/><path d="M17 24l5 5 9-10"/>',
};
const lwIcon = (r, cls = '') => `<svg class="lw-ico ${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LW_ICON[r] || LW_ICON.villager}</svg>`;
const lwRoleName = r => LoupGarou.ROLES[r]?.name || '';
/** Le rôle avec son article, pour le narrateur et le journal : « C'était la voyante. » */
const LW_THE = { wolf: 'un loup-garou', villager: 'un villageois', seer: 'la voyante', witch: 'la sorcière', hunter: 'le chasseur', cupid: 'Cupidon', guard: 'le salvateur' };
const lwNames = list => list.length <= 1 ? (list[0] || '') : list.slice(0, -1).join(', ') + ' et ' + list[list.length - 1];
const lwProg = (done, total) => total > 0 ? el('div', 'mj-prog', `${Array.from({ length: total }, (_, i) => `<i${i < done ? ' class="f"' : ''}></i>`).join('')}<span>${done} sur ${total}</span>`) : null;

/** Le narrateur parle sur le téléphone de l'hôte, s'il l'a demandé dans le salon. */
function lwSay(text) {
  if (!net.isHost || !window.speechSynthesis || !lwVoiceOn()) return;
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = 0.95; u.pitch = 0.9; speechSynthesis.speak(u); } catch { }
}
function lwVoiceOn() { try { return localStorage.getItem('lw-voice') !== '0'; } catch { return true; } }

function renderLoupGarou(v) {
  if (!v) return;
  const root = $('#lw-main'); root.innerHTML = ''; clearInterval(lwTimer);
  const btn = (cls, label, fn) => { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const night = v.phase === 'night' || v.phase === 'roles';
  root.className = 'stack lw ' + (night ? 'lw-night' : 'lw-day');
  const me = v.me, a = v.action;
  const say = list => list[(v.night + v.day) % list.length];              // une réplique stable pendant une nuit ou un jour
  const alive = v.players.filter(p => p.alive);
  const names = list => esc(lwNames(list));

  // narration et réveil discret du joueur concerné
  const sayKey = `${v.phase}|${v.night}|${v.day}|${v.step}|${v.revealSeq}|${v.tied ? 't' : ''}`;
  if (sayKey !== lwSpoken) {
    lwSpoken = sayKey;
    if (v.phase === 'night' && v.step) lwSay(v.stepSay || '');
    if (v.phase === 'reveal' && v.reveal) lwSay(v.reveal.deaths.length ? `${v.reveal.title}. ` + v.reveal.deaths.map(d => `${d.name} ${d.cause === 'love' ? 'meurt de chagrin' : 'est mort'}. C’était ${LW_THE[d.role] || lwRoleName(d.role)}.`).join(' ') : `${v.reveal.title}. ${v.reveal.empty}`);
    if (v.phase === 'day') lwSay(v.tied ? `Égalité. On revote entre ${v.tied.join(' et ')}.` : 'Le village débat, puis vote.');
    if (v.phase === 'hunter') lwSay(`${v.hunter?.name}, le chasseur, choisit sa cible.`);
    if (v.phase === 'over') lwSay(v.winner === 'village' ? 'Le village a gagné.' : v.winner === 'wolves' ? 'Les loups-garous ont gagné.' : v.winner === 'lovers' ? 'Les amoureux ont gagné.' : 'La partie est finie.');
  }
  const buzzKey = a && !['done'].includes(a.type) ? `${v.night}|${v.step}` : v.hunter?.me ? `h${v.revealSeq}` : null;
  if (buzzKey && buzzKey !== lwBuzz) { lwBuzz = buzzKey; try { navigator.vibrate?.([80, 60, 80]); } catch { } }

  // la ligne d'info discrète, avec la lune ou le soleil
  const when = v.phase === 'roles' ? `Distribution des rôles · ${v.total} joueurs` : v.phase === 'night' ? `Nuit ${v.night} · ${alive.length} en vie sur ${v.total}`
    : v.phase === 'over' ? 'Fin de la partie' : `Jour ${v.day} · ${alive.length} en vie sur ${v.total}`;
  root.appendChild(el('p', 'mj-meta lw-meta', `<span class="lw-moon${night ? '' : ' sun'}" aria-hidden="true"></span>${when}`));

  // mon rôle : on le maintient appuyé pour le voir, personne ne lit par-dessus l'épaule
  if (me && v.phase !== 'roles' && v.phase !== 'over') {
    const peek = el('button', 'lw-peek' + (lwPeek ? ' open' : ''), `<span class="lw-face back">Maintiens appuyé pour voir ton rôle</span><span class="lw-face front">${lwIcon(me.role)}<span><b>${lwRoleName(me.role)}</b>${me.lover ? `<small>amoureux de ${esc(me.lover)}</small>` : ''}${me.pack.length ? `<small>ta meute : ${me.pack.map(esc).join(', ')}</small>` : ''}</span></span>`);
    peek.type = 'button'; lwHold(peek);
    root.appendChild(peek);
  }

  // ce qui se passe, dit par le meneur
  const dead = me && !me.alive, ghost = v.seeAll ? 'Tu es mort et tu vois tous les rôles. Bouche cousue.' : 'Tu es mort. Garde le silence et profite du spectacle.';
  let title = '', line = '', prog = null;
  if (v.phase === 'roles') {
    prog = [v.seenCount, v.total];
    if (!me) { title = 'Distribution des rôles.'; line = 'Une partie est en cours. Tu regardes, tu joueras à la suivante.'; }
    else if (!me.seen) { title = 'Découvre ton rôle.'; line = 'Maintiens la carte appuyée, loin des regards. Ton voisin louche déjà dessus.'; }
    else { title = 'C’est vu.'; line = v.seenCount < v.total ? 'Garde ton sérieux, les autres découvrent le leur.' : 'Tout le monde a vu son rôle.'; }
  } else if (v.phase === 'night') {
    if (!a) {
      title = esc(v.stepLabel);
      line = !me ? 'Tu regardes la nuit passer.' : dead ? 'Tu es mort. Regarde la nuit passer, sans un bruit.' : say(['Ferme les yeux. Et arrête de sourire.', 'Yeux fermés, pas de triche.', 'Le village dort. Toi aussi, en principe.']);
    } else if (a.type === 'cupid') { title = 'À toi, Cupidon.'; line = 'Désigne deux amoureux. Tu peux te choisir.'; }
    else if (a.type === 'lovers') {
      title = 'Coup de foudre.';
      line = a.acked ? `Referme les yeux, et pense à ${esc(a.partner)}.` : `Toi et ${esc(a.partner)}, c’est pour la vie. Si l’un meurt, l’autre meurt de chagrin.${a.mixed ? ' Vous n’êtes pas du même camp : votre but, être les deux derniers en vie.' : ''}`;
    } else if (a.type === 'guard') { title = 'À toi, Salvateur.'; line = 'Qui protèges-tu des loups cette nuit ? Jamais le même deux nuits de suite.'; }
    else if (a.type === 'wolves') {
      const t = a.pack.map(w => w.target);
      title = 'À vous, les loups.';
      line = t.every(Boolean) && t.some(x => x !== t[0]) ? 'Pas d’accord ? Il faut la même victime pour toute la meute.' : 'Mettez-vous d’accord sur une victime.';
    } else if (a.type === 'seer') { title = 'À toi, Voyante.'; line = 'De qui veux-tu découvrir le rôle ?'; }
    else if (a.type === 'seerResult') {
      title = `${esc(a.name)} est ${LW_THE[a.role] || lwRoleName(a.role)}.`;
      line = a.ok ? 'Referme les yeux.' : a.role === 'wolf' ? 'Un loup ! À toi de convaincre le village sans te dévoiler.' : 'Garde-le pour toi, ou fais-le passer habilement.';
    } else if (a.type === 'witch') {
      title = 'À toi, Sorcière.';
      line = a.victim ? `Les loups ont choisi ${esc(a.victim)}.${a.save ? ' Tu le sauves.' : ''}` : 'Les loups n’ont désigné personne cette nuit.';
    } else if (a.type === 'done') { title = 'C’est fait.'; line = `${esc(a.text)} Referme les yeux.`; }
  } else if (v.phase === 'reveal' && v.reveal) {
    const r = v.reveal, d = r.deaths;
    if (r.kind === 'dawn') {
      title = d.length ? `${names(d.map(x => x.name))} ${d.length > 1 ? 'sont morts' : 'est mort'} cette nuit.` : 'Personne n’est mort cette nuit.';
      line = d.length ? say(['Le village se réveille, un peu moins nombreux.', 'Mauvaise nuit pour certains.', 'Le village se réveille. Pas tout le monde.']) : say(['Le village se réveille au complet. Louche, non ?', 'Tout le monde est là. Pour l’instant.']);
    } else if (r.kind === 'vote') {
      title = d.length ? `${esc(d[0].name)} est éliminé.` : 'Personne n’est éliminé.';
      line = d.length ? say(['Le village a tranché.', 'La démocratie a parlé.', 'Le village a voté, sans trembler.']) : r.votes?.length ? 'Nouvelle égalité. Le village hésite encore.' : 'Personne n’a voté.';
    } else {
      title = d.length ? `${esc(r.who || 'Le Chasseur')} emporte ${esc(d[0].name)}.` : 'Le Chasseur n’a pas tiré.';
      line = d.length ? 'Dernière balle, et pas perdue.' : 'Il est parti sans faire de bruit.';
    }
    if (dead) line += ' ' + ghost;
  } else if (v.phase === 'hunter' && v.hunter) {
    if (v.hunter.me) { title = 'Ton fusil est chargé.'; line = 'Tu es mort, mais tu choisis qui t’accompagne.'; }
    else { title = `${esc(v.hunter.name)} vise.`; line = 'Le Chasseur tombe, mais il lui reste une balle.'; }
  } else if (v.phase === 'day') {
    prog = [v.votedCount, v.aliveCount];
    const waiting = v.players.filter(p => p.alive && p.online && !p.voted && !p.me).map(p => p.name);
    const tie = v.tied ? `On revote entre ${names(v.tied)}.` : '';
    const close = v.closeIn ? `Tout le monde a voté. Fin du vote dans ${Math.ceil(v.closeIn / 1000)} s, on peut encore changer.` : '';
    if (!me) { title = 'Le village débat.'; line = 'Tu regardes, tu joueras à la prochaine partie.'; }
    else if (dead) { title = 'Le village débat.'; line = ghost; }
    else if (v.myVote) { title = 'Vote enregistré.'; line = close || `${tie ? tie + ' ' : ''}${waiting.length ? `Plus que ${names(waiting)}. ` : ''}Tu peux changer d’avis jusqu’à la fin.`; }
    else if (v.tied) { title = 'Égalité.'; line = tie; }
    else { title = 'Le village débat.'; line = close || say(['Qui a une tête de loup ? Débattez, puis votez.', 'Accusez, défendez-vous, puis votez.', 'Les loups sont parmi vous. Et ils ont l’air très innocents.']); }
  } else if (v.phase === 'over') {
    const w = v.winner;
    title = w === 'village' ? 'Le village gagne.' : w === 'wolves' ? 'Les loups-garous gagnent.' : w === 'lovers' ? 'Les amoureux gagnent.' : 'Personne n’a survécu.';
    line = w === 'village' ? say(['Les loups sont démasqués. Dormez tranquilles.', 'Le village respire enfin.']) : w === 'wolves' ? say(['Le village n’a rien vu venir.', 'Bon appétit, les loups.'])
      : w === 'lovers' ? 'L’amour, plus fort que tout.' : 'Village désert. Bravo à tous.';
    if (v.players.some(p => p.me && p.winner)) line += ' Tu fais partie des gagnants.';
  }
  const status = el('div', 'mj-status', `<h3 class="mj-title">${title}</h3>${line ? `<p class="mj-say">${line}</p>` : ''}`);
  const bar = prog && lwProg(prog[0], prog[1]); if (bar) status.appendChild(bar);
  root.appendChild(status);

  // une liste de choix : une ligne par joueur
  const pick = (opts, fn, isOn, tag) => {
    const g = el('div', 'mj-list rl-choices cols lw-pick');
    opts.forEach(o => {
      const on = isOn(o), b = el('button', 'mj-row rl-opt lw-opt' + (on ? ' on' : ''), `<span class="rl-name">${esc(o.name)}${o.id === net.me ? ' <small>(toi)</small>' : ''}</span><span class="rl-tag">${o.blocked ? 'protégé hier' : on ? tag : ''}</span>`);
      b.type = 'button'; b.onclick = () => fn(o); if (o.blocked) b.disabled = true;
      g.appendChild(b);
    });
    return g;
  };

  // distribution
  if (v.phase === 'roles' && me) {
    const card = el('button', 'lw-card' + (lwPeek ? ' open' : ''),
      `<span class="lw-face back"><span class="lw-card-back">${lwIcon('wolf', 'big')}</span><b class="lw-card-name">Ton rôle</b><span class="lw-card-text">Maintiens la carte appuyée pour la retourner.</span></span>`
      + `<span class="lw-face front">${lwIcon(me.role, 'big')}<b class="lw-card-name">${lwRoleName(me.role)}</b><span class="lw-card-text">${esc(LoupGarou.ROLES[me.role].text)}</span>${me.pack.length ? `<span class="lw-card-pack">Tes complices : ${me.pack.map(esc).join(', ')}</span>` : ''}</span>`);
    card.type = 'button'; lwHold(card);
    root.appendChild(card);
    if (!me.seen) root.appendChild(btn('primary lg', 'J’ai vu mon rôle', () => act({ t: 'lw:seen' })));
  }
  if (v.phase === 'roles' && v.isHost) root.appendChild(btn('ghost small', 'Lancer la nuit sans attendre', () => act({ t: 'lw:begin' })));

  // nuit
  if (v.phase === 'night') {
    if (!a || a.type === 'done') root.appendChild(el('div', 'lw-sleep', '<span class="lw-moon" aria-hidden="true"></span><span class="lw-zz">Chut.</span>'));
    if (a?.type === 'cupid') {
      lwCupid = lwCupid.filter(id => a.options.some(o => o.id === id));
      root.appendChild(pick(a.options, o => { const i = lwCupid.indexOf(o.id); if (i >= 0) lwCupid.splice(i, 1); else if (lwCupid.length < 2) lwCupid.push(o.id); renderLoupGarou(view.lw); }, o => lwCupid.includes(o.id), 'amoureux'));
      const ok = btn('primary lg', lwCupid.length === 2 ? 'Unir ces deux-là' : lwCupid.length ? 'Encore un joueur' : 'Choisis deux joueurs', () => { if (lwCupid.length === 2) act({ t: 'lw:cupid', a: lwCupid[0], b: lwCupid[1] }); });
      ok.disabled = lwCupid.length !== 2; root.appendChild(ok);
    }
    if (a?.type === 'lovers') {
      root.appendChild(el('div', 'lw-reveal-card love', `${lwIcon('cupid', 'big')}<b>${esc(a.partner)}</b><span>Votre destin est lié.</span>`));
      if (!a.acked) root.appendChild(btn('primary lg', 'Compris', () => act({ t: 'lw:ack' })));
    }
    if (a?.type === 'guard') root.appendChild(pick(a.options, o => act({ t: 'lw:guard', to: o.id }), () => false, ''));
    if (a?.type === 'wolves') {
      root.appendChild(pick(a.options, o => act({ t: 'lw:wolf', to: o.id }), o => a.mine === o.id, 'ton choix'));
      const pack = el('div', 'lw-meute rl-block', '<span class="mj-side-title">La meute</span>');
      const list = el('div', 'mj-list');
      a.pack.forEach(w => list.appendChild(el('div', 'mj-row' + (w.me ? ' me' : ''), `<span class="rl-name">${esc(w.name)}${w.me ? ' <small>(toi)</small>' : ''}</span><span class="rl-tag${w.target ? '' : ' wait'}">${w.target ? 'veut ' + esc(w.target) : 'n’a pas choisi'}</span>`)));
      pack.appendChild(list); root.appendChild(pack);
    }
    if (a?.type === 'seer') root.appendChild(pick(a.options, o => act({ t: 'lw:seer', to: o.id }), () => false, ''));
    if (a?.type === 'seerResult') {
      root.appendChild(el('div', 'lw-reveal-card', `${lwIcon(a.role, 'big')}<b>${esc(a.name)}</b><span>${lwRoleName(a.role)}</span>`));
      if (!a.ok) root.appendChild(btn('primary lg', 'Compris', () => act({ t: 'lw:seerok' })));
    }
    if (a?.type === 'witch') {
      const life = btn('lw-potion life' + (a.save ? ' on' : ''), !a.life ? 'Potion de vie déjà utilisée' : !a.victim ? 'Personne à sauver' : a.save ? `Annuler le sauvetage de ${esc(a.victim)}` : `Sauver ${esc(a.victim)} avec la potion de vie`, () => act({ t: 'lw:save' }));
      life.disabled = !a.life || !a.victim; root.appendChild(life);
      const death = el('div', 'lw-poison rl-block', '<span class="mj-side-title">Potion de mort</span>');
      if (a.death) {
        const k = a.options.find(o => o.id === a.kill);
        death.appendChild(el('p', 'lw-act', k ? `${esc(k.name)} sera empoisonné. Touche encore pour annuler.` : 'Un joueur à empoisonner, ou personne.'));
        death.appendChild(pick(a.options, o => act({ t: 'lw:poison', to: o.id }), o => a.kill === o.id, 'empoisonné'));
      } else death.appendChild(el('p', 'lw-act', 'Déjà utilisée.'));
      root.appendChild(death);
      root.appendChild(btn('primary lg', 'Me rendormir', () => act({ t: 'lw:witchdone' })));
    }
    if (me?.role === 'seer' && me.seerLog.length && a) root.appendChild(el('p', 'note lw-log-seer', 'Déjà sondés : ' + me.seerLog.map(s => `${esc(s.name)} (${lwRoleName(s.role)})`).join(' · ')));
  }

  // annonces du matin, du vote, du chasseur
  if (v.phase === 'reveal' && v.reveal) {
    const r = v.reveal;
    if (r.deaths.length) {
      const list = el('div', 'mj-list lw-deaths');
      r.deaths.forEach(d => list.appendChild(el('div', 'mj-row lw-death-row', `${lwIcon(d.role)}<span class="rl-name"><b>${esc(d.name)}</b><small>${d.cause === 'love' ? 'mort de chagrin' : d.cause === 'poison' ? 'empoisonné' : d.cause === 'vote' ? 'éliminé par le village' : d.cause === 'hunter' ? 'abattu' : 'dévoré'}</small></span><span class="rl-tag lw-death-role">${lwRoleName(d.role)}</span>`)));
      root.appendChild(list);
    }
    if (r.votes?.length) root.appendChild(el('p', 'note lw-votes', r.votes.map(x => `${esc(x.from)} → ${esc(x.to)}`).join(' · ')));
    const bar = el('div', 'lw-timer'); const i = el('i'); bar.appendChild(i); root.appendChild(bar);
    const t0 = Date.now(), left0 = v.revealLeft;
    const paint = () => { i.style.width = Math.max(0, 100 * (left0 - (Date.now() - t0)) / 14000) + '%'; };
    paint(); lwTimer = setInterval(paint, 200);
    if (v.isHost) root.appendChild(btn('ghost small', 'Passer à la suite', () => act({ t: 'lw:next' })));
  }

  if (v.phase === 'hunter' && v.hunter?.me) root.appendChild(pick(v.hunter.options, o => act({ t: 'lw:shoot', to: o.id }), () => false, ''));

  // jour : débat de vive voix, vote sur les téléphones
  if (v.phase === 'day') {
    if (v.lastTally) root.appendChild(el('p', 'note lw-votes', 'Premier tour : ' + v.lastTally.map(x => `${esc(x.from)} → ${esc(x.to)}`).join(' · ')));
    if (me?.alive) {
      const opts = v.players.filter(p => p.alive && !p.me && (!v.tiedIds || v.tiedIds.includes(p.id)));
      root.appendChild(pick(opts, o => act({ t: 'lw:vote', to: o.id }), o => v.myVote === o.id, 'ton vote'));
    }
    if (v.closeIn) setTimeout(() => { if (view?.lw?.phase === 'day') renderLoupGarou(view.lw); }, 1000);
    if (v.isHost) root.appendChild(btn('ghost small', 'Clore le vote maintenant', () => act({ t: 'lw:close' })));
  }

  if (v.phase === 'over') {
    if (v.isHost) { const r = el('div', 'lw-actions'); r.append(btn('primary lg', 'Rejouer avec de nouveaux rôles', () => act({ t: 'lw:again' })), btn('ghost', 'Retour au salon', () => act({ t: 'restart' }))); root.appendChild(r); }
    else root.appendChild(el('p', 'note', 'L’hôte relance une partie ou revient au salon.'));
  }

  // le village (colonne de droite sur PC)
  if (v.phase !== 'roles') {
    const box = el('div', 'lw-village rl-block', `<span class="mj-side-title">Le village</span>`);
    const list = el('div', 'mj-list');
    v.players.forEach(p => {
      const tag = [p.role ? lwRoleName(p.role) : '', p.alive ? '' : 'mort', v.phase === 'day' && p.voted ? 'a voté' : '', p.winner ? 'gagne' : ''].filter(Boolean).join(' · ');
      list.appendChild(el('div', `mj-row lw-p${p.alive ? '' : ' dead'}${p.me ? ' me' : ''}${p.winner ? ' win' : ''}${p.online ? '' : ' off'}`,
        `${p.role ? lwIcon(p.role) : '<span class="lw-ico q" aria-hidden="true">?</span>'}<span class="rl-name">${esc(p.name)}${p.me ? ' <small>(toi)</small>' : ''}${p.lover ? ' <i class="lw-heart" title="amoureux">♥</i>' : ''}</span><span class="rl-tag">${tag}</span>`));
    });
    box.appendChild(list); root.appendChild(box);
  }
  if (v.log.length) {
    const lg = el('div', 'lw-log rl-log', '<span class="mj-side-title">Ce qui s’est passé</span>');
    const ul = el('ul'); v.log.slice().reverse().forEach(t => ul.appendChild(el('li', '', esc(t)))); lg.appendChild(ul);
    root.appendChild(lg);
  }
}
/** Maintenir appuyé pour voir, relâcher pour cacher : on bascule une classe, sans reconstruire l'écran. */
function lwHold(node) {
  node.addEventListener('pointerdown', e => { e.preventDefault(); lwPeek = true; node.classList.add('open'); try { node.setPointerCapture(e.pointerId); } catch { } });
  node.addEventListener('contextmenu', e => e.preventDefault());
}
function lwRelease() { if (!lwPeek) return; lwPeek = false; document.querySelectorAll('.lw-peek.open,.lw-card.open').forEach(n => n.classList.remove('open')); }
['pointerup', 'pointercancel', 'touchend', 'blur'].forEach(ev => (ev === 'blur' ? window : document).addEventListener(ev, lwRelease));
