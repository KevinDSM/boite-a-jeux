/* Huis clos — un escape game coopératif de 1 à 8 joueurs, chacun sur son téléphone, contre le chrono.

   Un scénario (huisclos.json) décrit des pièces, des endroits à fouiller (« spots »), des objets, des cadenas et
   des documents. Chaque endroit a plusieurs vues : la première dont les conditions (drapeaux posés ou non) sont
   remplies s'affiche. On agit de quatre façons : un bouton d'une vue (hc:act), un objet glissé sur un endroit ou
   sur un autre objet (hc:use), un code tapé sur un cadenas (hc:code), un indice demandé (hc:hint).
   L'inventaire est commun ; les documents de départ sont répartis entre les joueurs (seul : tous pour lui), et
   un document ne s'affiche QUE sur le téléphone de celui qui l'a. Un code faux coûte des minutes.

   LES SOLUTIONS NE QUITTENT JAMAIS LE SERVEUR : huisclos.json n'est chargé que par load() (le serveur des salons,
   ou le téléphone de l'hôte hors pages.dev), la vue ne donne que les textes visibles, les dessins révélés
   (« art ») qu'une fois découverts, et jamais les codes. Même modèle que les autres jeux : salle net.game.hc,
   actions « hc:… ». */

'use strict';

const HuisClos = (() => {
  const MIN = 1, MAX = 8, HAND_OVER_MS = 60000;
  const NOTHING = ['Ça ne donne rien.', 'Non, pas comme ça.', 'Rien ne se passe. Cherche ailleurs.'];

  // ------------------------------------------------------------ les scénarios
  let DATA = null;
  async function load(v) {
    if (DATA) return DATA;
    const j = await fetch(`huisclos.json?v=${v}`).then(r => r.ok ? r.json() : null).catch(() => null);
    DATA = Array.isArray(j?.scenarios) ? j : null;
    return DATA;
  }
  const count = () => DATA ? DATA.scenarios.length : 0;
  const scen = room => DATA?.scenarios.find(s => s.id === room.sid) || null;

  const pl = (room, id) => room.players.find(p => p.id === id);
  const log = (room, t) => { room.log.push(t); if (room.log.length > 60) room.log.splice(0, room.log.length - 60); };
  const short = p => { const n = p?.name || ''; const i = n.indexOf(' '); return i > 0 && i <= 8 ? n.slice(i + 1) : n; };
  // un message du meneur : à tous (to absent) ou à un seul joueur (une tentative ratée, une feuille à ouvrir)
  function event(room, text, extra = {}) {
    room.ev += 1;
    room.events.push({ n: room.ev, text, ...extra });
    if (room.events.length > 40) room.events.splice(0, room.events.length - 40);
    if (text && !extra.to) log(room, text);
  }
  const has = (room, f) => !!room.flags[f];
  const ok = (room, need, not) => (need || []).every(f => has(room, f)) && !(not || []).some(f => has(room, f));
  const roomOpen = (room, rid) => { const r = scen(room).rooms.find(x => x.id === rid); return !!r && (!r.open || has(room, r.open)); };
  // la vue courante d'un endroit : la première dont les conditions sont remplies
  const spotView = (room, sid) => { const s = scen(room).spots[sid]; return s ? s.views.find(v => ok(room, v.if, v.not)) || null : null; };
  const left = room => room.timeless ? null : Math.max(0, room.endAt - Date.now());

  function create({ hostId, players, scenario, minutes }) {
    const sc = DATA?.scenarios.find(s => s.id === scenario) || DATA?.scenarios[0];
    const room = {
      hostId, sid: sc?.id, phase: 'intro', seq: 0, log: [], events: [], ev: 0,
      players: players.filter(p => !p.bot).map(p => ({ id: p.id, name: p.name, online: p.online !== false, offAt: 0, inGame: p.online !== false, docs: [], where: sc?.rooms[0].id })),
      flags: {}, inv: [], hintLv: {}, hints: 0, wrong: 0,
      minutes: +minutes || sc?.minutes || 45, timeless: +minutes === 0, endAt: 0, startedAt: 0, result: null,
    };
    // les documents de départ, distribués à tour de rôle (seul : tous pour lui)
    const deal = room.players.filter(p => p.inGame);
    (sc?.docs || []).forEach((d, i) => deal[i % deal.length]?.docs.push(d.id));
    log(room, `${sc?.title || 'Huis clos'}. ${room.timeless ? 'Sans chrono.' : `${room.minutes} minutes pour sortir.`}`);
    return room;
  }

  // ------------------------------------------------------------ appliquer un effet (bouton, objet, cadenas)
  function apply(room, pid, fx) {
    (fx.set || []).forEach(f => { room.flags[f] = true; });
    (fx.take || []).forEach(id => { room.inv = room.inv.filter(x => x !== id); });
    (fx.give || []).forEach(id => { if (!room.inv.includes(id)) room.inv.push(id); });
    const who = short(pl(room, pid)) || 'Quelqu’un';
    if (fx.log) event(room, fx.log.replace('{who}', who), { by: pid, give: fx.give || [] });
    if (fx.open) event(room, '', { to: pid, open: fx.open });
    const sc = scen(room);
    if (sc.finish && has(room, sc.finish)) finish(room, true);
    room.seq += 1;
  }
  function finish(room, win) {
    if (room.phase === 'over') return;
    const l = left(room);
    room.phase = 'over'; room.seq += 1;
    let stars = 0;
    if (win) { stars = 3 - (room.hints >= 4 ? 1 : 0) - (room.wrong >= 3 ? 1 : 0) - (l != null && l < 5 * 60000 ? 1 : 0); stars = Math.max(1, stars); }
    room.result = { win, left: l, hints: room.hints, wrong: room.wrong, stars, time: Date.now() - room.startedAt };
    event(room, win ? 'Le confinement se lève. Vous êtes sortis !' : 'Le temps est écoulé.');
  }
  function penalty(room, pid, lock, sec) {
    room.wrong += 1;
    if (!room.timeless) room.endAt -= sec * 1000;
    const who = short(pl(room, pid)), p = sec >= 60 ? `${Math.round(sec / 60)} minute${sec >= 120 ? 's' : ''}` : `${sec} secondes`;
    const bad = (lock.bad || '{who} se trompe de code. Ça vous coûte {p}.').replace('{who}', who).replace('{p}', room.timeless ? 'une erreur' : p);
    event(room, bad, { by: pid, wrong: true, cost: room.timeless ? 0 : sec });
    room.seq += 1;
    if (!room.timeless && room.endAt <= Date.now()) finish(room, false);
  }

  // ------------------------------------------------------------ les gestes
  function doAct(room, pid, spot, a) {
    const s = scen(room).spots[spot], v = spotView(room, spot);
    if (!s || !v || !roomOpen(room, s.room) || !(v.acts || []).includes(a)) return null;
    apply(room, pid, scen(room).acts[a] || {});
    return null;
  }
  function doUse(room, pid, item, on) {
    const sc = scen(room);
    if (!room.inv.includes(item) || item === on) return null;
    const isSpot = !!sc.spots[on], isItem = room.inv.includes(on);
    if (!isItem && !(isSpot && roomOpen(room, sc.spots[on].room))) return null;
    const r = sc.uses.find(u => u.item === item && (u.on == null || u.on === on) && ok(room, u.need, u.not))
      || (isItem ? sc.uses.find(u => u.item === on && u.on === item && ok(room, u.need, u.not)) : null);
    if (r && (r.set || r.give || r.take)) { apply(room, pid, r); return null; }
    event(room, r?.say || NOTHING[Math.floor(Math.random() * NOTHING.length)], { to: pid });
    room.seq += 1;
    return null;
  }
  const norm = (lock, c) => {
    const s = String(c ?? '');
    if (lock.kind === 'letters') return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
    return s.replace(/[^0-9]/g, '');
  };
  function doCode(room, pid, spot, code) {
    const sc = scen(room), s = sc.spots[spot], v = spotView(room, spot);
    if (!s || !v?.lock || !roomOpen(room, s.room)) return null;
    const lock = sc.locks[v.lock], c = norm(lock, code);
    if (!lock || !c) return null;
    if (c === lock.code) { apply(room, pid, lock); return null; }
    penalty(room, pid, lock, lock.cost || 60);
    return null;
  }
  // les étapes ouvertes et pas encore faites : c'est là qu'on peut demander un indice
  const openSteps = room => scen(room).steps.filter(st => ok(room, st.avail) && !has(room, st.done));
  function doHint(room, pid, step) {
    const st = openSteps(room).find(x => x.id === step); if (!st) return null;
    const lv = room.hintLv[step] || 0; if (lv >= st.hints.length) return null;
    room.hintLv[step] = lv + 1; room.hints += 1;
    event(room, `${short(pl(room, pid))} prend un indice : ${st.label.charAt(0).toLowerCase() + st.label.slice(1)}.`, { by: pid, hint: step });
    room.seq += 1;
    return null;
  }

  // ------------------------------------------------------------ le temps, les absents
  function tick(room) {
    if (room.phase !== 'play') return false;
    const now = Date.now();
    if (!room.timeless && now >= room.endAt) { finish(room, false); return true; }
    // un joueur parti depuis une minute : ses documents passent à celui qui en a le moins
    let moved = false;
    for (const p of room.players) {
      if (p.online || !p.docs.length || now - p.offAt < HAND_OVER_MS) continue;
      const to = room.players.filter(q => q.online && q.inGame).sort((a, b) => a.docs.length - b.docs.length)[0];
      if (!to) continue;
      const names = p.docs.map(d => scen(room).docs.find(x => x.id === d)?.name).filter(Boolean);
      to.docs.push(...p.docs); p.docs = [];
      event(room, `${short(p)} est parti. ${names.join(', ')} passe${names.length > 1 ? 'nt' : ''} sur le téléphone de ${short(to)}.`);
      room.seq += 1; moved = true;
    }
    return moved;
  }

  function act(room, pid, m) {
    const p = pl(room, pid), host = pid === room.hostId;
    if (!scen(room)) return 'Scénario introuvable';
    if (m.t === 'hc:go') { if (host && room.phase === 'intro') { room.phase = 'play'; room.startedAt = Date.now(); room.endAt = room.startedAt + room.minutes * 60000; event(room, 'Le chrono est lancé.'); room.seq += 1; } return null; }
    if (m.t === 'hc:room') { if (p && roomOpen(room, m.room) && p.where !== m.room) { p.where = m.room; room.seq += 1; } return null; }
    if (room.phase !== 'play' || !p?.inGame) return null;
    switch (m.t) {
      case 'hc:act': return doAct(room, pid, String(m.spot), String(m.a));
      case 'hc:use': return doUse(room, pid, String(m.item), String(m.on));
      case 'hc:code': return doCode(room, pid, String(m.spot), m.code);
      case 'hc:hint': return doHint(room, pid, String(m.step));
    }
    return null;
  }
  function join(room, id, name) {
    const p = pl(room, id);
    if (p) { p.online = true; p.offAt = 0; p.name = name || p.name; room.seq += 1; return; }
    const inGame = room.players.filter(q => q.inGame).length < MAX;
    room.players.push({ id, name, online: true, offAt: 0, inGame, docs: [], where: scen(room)?.rooms[0].id });
    room.seq += 1;
  }
  function setOnline(room, id, on) { const p = pl(room, id); if (p) { p.online = on; p.offAt = on ? 0 : Date.now(); room.seq += 1; } }

  // ------------------------------------------------------------ ce que voit chaque téléphone
  function view(room, pid) {
    const sc = scen(room), me = pl(room, pid);
    if (!sc) return { phase: 'error', seq: room.seq };
    const art = {};
    for (const [f, a] of Object.entries(sc.art || {})) if (has(room, f)) Object.assign(art, a);
    const spots = {};
    for (const [id, s] of Object.entries(sc.spots)) {
      if (!roomOpen(room, s.room)) continue;
      const v = spotView(room, id); if (!v) continue;
      const lock = v.lock ? sc.locks[v.lock] : null;
      spots[id] = {
        room: s.room, name: s.name, title: v.title, kicker: v.kicker || '', text: v.text || '', art: v.art || '', goto: v.goto || '',
        acts: (v.acts || []).map(a => ({ id: a, label: sc.acts[a]?.label || a })),
        // le cadenas : sa forme, jamais son code
        lock: lock ? { kind: lock.kind, len: lock.len || (lock.kind === 'doses' ? lock.labels.length : 1), n: lock.n || 0, labels: lock.labels || [], cost: room.timeless ? 0 : lock.cost || 60 } : null,
      };
    }
    const doc = id => { const d = sc.docs.find(x => x.id === id); return d ? { id: d.id, name: d.name, kind: d.kind, title: d.title, html: d.html } : null; };
    const done = room.phase === 'over';
    return {
      phase: room.phase, seq: room.seq, isHost: pid === room.hostId, sid: sc.id,
      title: sc.title, place: sc.place, intro: sc.intro, outro: done ? (room.result?.win ? sc.win : sc.lose) : '',
      minutes: room.minutes, timeless: room.timeless, left: room.phase === 'intro' ? room.minutes * 60000 : left(room),
      rooms: sc.rooms.map(r => ({ id: r.id, name: r.name, open: roomOpen(room, r.id) })),
      flags: Object.keys(room.flags), art, spots,
      inv: room.inv.map(id => ({ id, name: sc.items[id]?.name || id, desc: sc.items[id]?.desc || '', doc: sc.items[id]?.doc || null })),
      docs: (me?.docs || []).map(doc).filter(Boolean),
      // qui a quoi : le nom du document seulement, jamais son contenu
      holders: room.players.filter(p => p.docs.length).map(p => ({ id: p.id, name: p.name, docs: p.docs.map(d => sc.docs.find(x => x.id === d)?.name).filter(Boolean) })),
      steps: room.phase === 'play' ? openSteps(room).map(st => ({ id: st.id, label: st.label, max: st.hints.length, hints: st.hints.slice(0, room.hintLv[st.id] || 0) })) : [],
      hints: room.hints, wrong: room.wrong, result: room.result,
      me: me ? { inGame: me.inGame, where: me.where } : null,
      players: room.players.filter(p => p.inGame).map(p => ({ id: p.id, name: p.name, online: p.online, where: p.where })),
      events: room.events.filter(e => !e.to || e.to === pid).slice(-10),
      log: room.log.slice(-20),
    };
  }

  return { MIN, MAX, load, count, create, act, tick, join, setOnline, view };
})();
if (typeof module !== 'undefined') module.exports = HuisClos;
