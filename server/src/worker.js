// Boîte à jeux : les salons côté serveur.
// Une salle (Durable Object « Salon ») par code de salon. Elle fait tourner la partie avec le même code
// que le téléphone de l'hôte (core.js + engines/, assemblés dans runtime.js par build.py). Tous les
// téléphones s'y connectent en WebSocket, l'hôte compris : s'il verrouille son écran, la partie continue.
import { createRuntime } from './runtime.js';

// seuls les sites de la Boîte à jeux (et les tests en local) peuvent ouvrir un salon
const ORIGINS = [/^https:\/\/([a-z0-9-]+\.)?boite-a-jeux\.pages\.dev$/, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/salon\/([A-Z]{4})$/);
    if (!m) return new Response('Boîte à jeux', { status: 404 });
    if (!ORIGINS.some(r => r.test(req.headers.get('Origin') || ''))) return new Response('Origine refusée', { status: 403 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
    return env.SALONS.get(env.SALONS.idFromName(m[1])).fetch(req);
  },
};

const TICK_MS = 500;
const EMPTY_MS = 10 * 60 * 1000;      // salon sans personne : fermé au bout de 10 min
const IDLE_MS = 60 * 60 * 1000;       // personne n'a rien fait depuis une heure : fermé
const MAX_MSG = 900 * 1024;           // un message WebSocket ne dépasse pas 1 Mo chez Cloudflare
const BIG = 4000;                     // au-delà, une image est envoyée à part, une seule fois

export class Salon {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.rt = null; this.ready = null; this.code = null;
    this.timer = null; this.emptySince = 0; this.lastAct = Date.now();
  }

  async fetch(req) {
    const url = new URL(req.url);
    const code = url.pathname.slice(-4), create = url.searchParams.get('create') === '1';
    const [client, ws] = Object.values(new WebSocketPair());
    ws.accept();
    if (create && this.rt) { this.refuse(ws, 'code-taken'); return new Response(null, { status: 101, webSocket: client }); }
    if (!create && !this.rt) { this.refuse(ws, 'no-room'); return new Response(null, { status: 101, webSocket: client }); }
    if (create) { this.code = code; this.ready = this.boot(code); }
    const conn = this.wrap(ws);
    ws.addEventListener('message', e => { this.onMessage(conn, e.data).catch(err => console.error('message', err?.stack || err)); });
    ws.addEventListener('close', () => this.onClose(conn));
    ws.addEventListener('error', () => this.onClose(conn));
    return new Response(null, { status: 101, webSocket: client });
  }

  refuse(ws, t) { try { ws.send(JSON.stringify({ t })); ws.close(1000, t); } catch { } }

  // une connexion qui ressemble à celles de PeerJS : core.js l'utilise sans savoir qu'il est sur un serveur
  wrap(ws) {
    const self = this;
    return {
      ws, pid: null, metadata: {}, assets: new Set(), dead: false,
      get open() { return !this.dead; },
      send(m) { self.sendTo(this, m); },
      close() { this.dead = true; try { ws.close(1000, 'bye'); } catch { } },
    };
  }

  async boot(code) {
    const rt = createRuntime({
      broadcast: () => this.broadcast(),
      sendAll: (m, except = null) => { for (const [pid, c] of rt.net.conns) if (pid !== except) c.send(m); },
      toast: msg => { const host = rt.net.game?.s.players[0]; const c = host && rt.net.conns.get(host.id); if (c) c.send({ t: 'toast', msg }); },
      sabOnMessage: () => { },
    });
    const [songs, songsE, songsJV, , songsAnime] = await Promise.all([rt.loadSongs(), rt.loadSongsE(), rt.loadSongsJV(), rt.loadDecks(), rt.loadSongsAnime()]);
    rt.net.isHost = true; rt.net.code = code;
    rt.net.game = new rt.Game(code, songs, songsE, songsJV, songsAnime);
    this.rt = rt;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    const rt = this.rt; if (!rt) return;
    try { if (rt.hostTick()) this.broadcast(); } catch (err) { console.error('tick', err?.stack || err); }
    const now = Date.now();
    if (rt.net.conns.size) this.emptySince = 0; else if (!this.emptySince) this.emptySince = now;
    if (this.emptySince && now - this.emptySince > EMPTY_MS) this.shutdown(null);
    else if (now - this.lastAct > IDLE_MS) this.shutdown('Le salon s’est fermé après une heure sans activité.');
  }

  shutdown(reason) {
    clearInterval(this.timer); this.timer = null;
    const rt = this.rt; this.rt = null; this.ready = null;
    if (!rt) return;
    for (const c of rt.net.conns.values()) { if (reason) c.send({ t: 'closed', msg: reason }); c.close(); }
  }

  async onMessage(conn, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    await this.ready;
    const rt = this.rt; if (!rt) { this.refuse(conn.ws, 'no-room'); return; }
    if (m.t === 'hello') {
      if (typeof m.pid !== 'string' || !/^[a-z0-9]{4,20}$/.test(m.pid)) { conn.close(); return; }
      const old = rt.net.conns.get(m.pid);
      if (old && old !== conn) old.close();            // le même téléphone revient : l'ancienne connexion s'efface
      conn.pid = m.pid;
      m.name = String(m.name || '').trim().slice(0, 14) || 'Joueur';
      if (!rt.net.game.s.players.length) rt.net.game.addPlayer(m.pid, m.name, true, m.emoji);   // le créateur est l'hôte
    } else {
      if (!conn.pid || rt.net.conns.get(conn.pid) !== conn) return;
      m.pid = conn.pid;                                 // l'identité vient de la connexion, pas du message
      if (m.t === 'start') await this.loadFor(m.opts?.mode);
    }
    this.lastAct = Date.now();
    try { rt.handleClientMessage(conn, m); } catch (err) { console.error('action', m.t, err?.stack || err); conn.send({ t: 'err', msg: 'Le serveur n’a pas compris cette action.' }); }
  }

  // données à charger avant certains jeux (le téléphone de l'hôte le faisait avant de lancer)
  async loadFor(mode) {
    const rt = this.rt;
    if (mode === 'memes') await rt.Memes.load(rt.ASSET_V);
    if (mode === 'mirage') await rt.Mirage.load(rt.ASSET_V);
    if (mode === 'geo') await rt.Geo.loadPlaces();
  }

  onClose(conn) {
    const rt = this.rt; conn.dead = true;
    if (!rt || !conn.pid || rt.net.conns.get(conn.pid) !== conn) return;
    rt.net.conns.delete(conn.pid);
    rt.net.game.setOffline(conn.pid); rt.sabOffline(conn.pid);
    this.broadcast();
  }

  broadcast() {
    const rt = this.rt; if (!rt) return;
    const g = rt.net.game, pub = g.publicState();
    if (g.sab) g._sabExtras = g.sabExtras();
    for (const [pid, c] of rt.net.conns) c.send({ t: 'state', s: g.viewFor(pub, pid) });
  }

  // Les grosses images (dessins du Téléphone dessiné) partent à part, une seule fois par téléphone ;
  // l'état n'en garde qu'une référence. Sinon chaque diffusion renverrait des centaines de Ko.
  sendTo(conn, m) {
    if (conn.dead) return;
    let out = m;
    if (m.t === 'state') {
      const pending = [];
      out = { t: 'state', s: strip(m.s, conn.assets, pending) };
      for (const a of pending) this.raw(conn, JSON.stringify({ t: 'asset', id: a.id, data: a.data }));
    }
    this.raw(conn, JSON.stringify(out));
  }
  raw(conn, text) {
    if (text.length > MAX_MSG) { console.error('message trop gros', text.length); return; }
    try { conn.ws.send(text); } catch { conn.dead = true; }
  }
}

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i += 7) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + s.length.toString(36); }
function strip(v, have, pending) {
  if (typeof v === 'string') {
    if (v.length > BIG && v.startsWith('data:image/')) {
      const id = hash(v);
      if (!have.has(id)) { have.add(id); pending.push({ id, data: v }); }
      return '\u0001asset:' + id;
    }
    return v;
  }
  if (Array.isArray(v)) return v.map(x => strip(x, have, pending));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = strip(v[k], have, pending); return o; }
  return v;
}
