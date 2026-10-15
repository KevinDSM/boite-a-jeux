// Le Morceau du jour : l'API (Cloudflare Pages Functions + base D1 « boite-a-jeux-stats », tables morceau_*).
// Trois chansons par jour (heure de Paris), les mêmes pour tout le monde, façon Heardle : on entend 1 seconde
// du début de l'extrait, puis 2, 4, 7, 11 et 16 secondes à chaque essai raté ou passé. Six essais par chanson.
// Chaque chanson a sa partie et son classement (moins de secondes d'écoute = mieux).
//
// La chanson ne quitte JAMAIS le serveur avant la fin de la partie du joueur : l'extrait passe par /audio
// (le navigateur ne voit pas son adresse, qui permettrait de le retrouver dans songs.json), chaque proposition
// est vérifiée ici, et le titre, l'artiste, l'année et la pochette ne sont renvoyés qu'à celui qui a fini.
// Chaque téléphone a un secret « tok » (le même que pour Miroir et le Mot du jour) : il prouve qui joue, sans compte.
//
// Les chansons viennent de _morceaux.js (généré par tools/morceau/build_morceaux.py), dans un ordre tiré au sort
// avec le secret MOT_SEL (s'il est posé), sans reprendre une chanson sortie ces derniers mois, puis figées dans
// morceau_jours à la première visite du jour. Clé en base : « AAAA-MM-JJ#1 », « #2 », « #3 ».
import { MORCEAUX } from './_morceaux.js';

const ECOUTES = [1, 2, 4, 7, 11, 16], ESSAIS = ECOUTES.length, MAX_NOM = 14, PAR_JOUR = 3;
const PAR_CLE = new Map(MORCEAUX.map(m => [m[0], m]));
const json = (data, status = 200, cache = 'no-store') => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });
const err = (msg, status = 400, code) => json({ erreur: msg, code }, status);
const okTok = t => typeof t === 'string' && /^[a-z0-9]{12,40}$/i.test(t);
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOM);
const cleanEmoji = s => [...String(s || '')].slice(0, 2).join('');
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const artisteDe = k => (k || '').split('|')[0];

// la date du jour à Paris, et son numéro (jours depuis 1970)
function aujourdhui(now) {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const [y, m, d] = jour.split('-').map(Number);
  return { jour, n: Math.round(Date.UTC(y, m - 1, d) / 864e5) };
}

// l'ordre des chansons pour un cycle (une liste entière) : trié sur l'empreinte SHA-256 de (secret, cycle, clé)
const ordres = new Map();
async function ordre(sel, cycle) {
  const k = sel + '|' + cycle; if (ordres.has(k)) return ordres.get(k);
  const enc = new TextEncoder();
  const cles = await Promise.all(MORCEAUX.map(async ([c], i) => {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`morceau|${sel}|${cycle}|${c}`)));
    return [[...h.slice(0, 8)].map(x => x.toString(16).padStart(2, '0')).join(''), i];
  }));
  const o = cles.sort((a, b) => a[0] < b[0] ? -1 : 1).map(x => x[1]);
  ordres.set(k, o); return o;
}

// les trois chansons du jour, figées en base à la première visite. La chanson k du jour n est la (3n + k)-ième de
// la suite tirée au sort ; si elle est déjà sortie récemment (ou plus tôt ce jour-là), on prend la suivante.
async function morceauxDuJour(db, env, now) {
  const { jour, n } = aujourdhui(now), cles = Array.from({ length: PAR_JOUR }, (_, i) => `${jour}#${i + 1}`);
  const lire = async () => (await db.prepare(`SELECT * FROM morceau_jours WHERE jour IN (${cles.map(() => '?').join(', ')})`).bind(...cles).all()).results;
  let rows = await lire();
  if (rows.length < PAR_JOUR) {
    const L = MORCEAUX.length, fenetre = Math.max(7, Math.floor(L / PAR_JOUR) - 10);
    const depuis = new Date((n - fenetre) * 864e5).toISOString().slice(0, 10);
    const sortis = new Set((await db.prepare('SELECT cle FROM morceau_jours WHERE jour >= ?').bind(depuis).all()).results.map(r => r.cle));
    for (let num = 1; num <= PAR_JOUR; num++) {
      if (rows.some(r => r.jour === cles[num - 1])) continue;
      let choix = null;
      for (let k = n * PAR_JOUR + num - 1, essai = 0; !choix; k++, essai++) {
        const m = MORCEAUX[(await ordre(env.MOT_SEL || 'boite-a-jeux', Math.floor(k / L)))[k % L]];
        if (!sortis.has(m[0]) || essai >= L) choix = m;
      }
      await db.prepare('INSERT OR IGNORE INTO morceau_jours (jour, cle, artiste, titre, annee, extrait, pochette) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(cles[num - 1], choix[0], choix[1], choix[2], choix[3] || null, choix[4], choix[5] || null).run();
      sortis.add(choix[0]);
    }
    rows = await lire();
  }
  return cles.map((k, i) => ({ ...rows.find(r => r.jour === k), cle_jour: k, jour, num: i + 1 }));
}

// le résultat d'un essai : passé, faux, bon artiste (mauvais titre), trouvé
function resultat(prop, j) {
  if (!prop) return 'passe';
  if (prop === j.cle) return 'ok';
  return artisteDe(prop) === artisteDe(j.cle) ? 'artiste' : 'faux';
}
const essaisDe = r => parse(r?.essais) || [];
const fini = r => !!r.trouve || essaisDe(r).length >= ESSAIS;
const secondes = r => ECOUTES[Math.max(0, essaisDe(r).length - 1)];

// le classement d'une chanson : ceux qui ont trouvé (moins d'essais, donc moins d'écoute, puis le plus tôt), puis ceux
// qui ont séché, puis ceux qui cherchent encore. Un même prénom ne compte qu'une fois, pareil pour tout le monde :
// sa première partie terminée (on ne rejoue pas pour améliorer son score) ; à défaut, sa première partie en cours.
async function classement(db, cle, tok) {
  const rows = (await db.prepare('SELECT tok, nom, emoji, essais, debut, fin, trouve FROM morceau_joueurs WHERE jour = ? ORDER BY debut').bind(cle).all()).results;
  const groupes = new Map();
  for (const r of rows) { const k = r.nom.toLowerCase(); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(r); }
  const out = [];
  for (const g of groupes.values()) {
    const r = g.find(fini) || g[0];
    out.push({ nom: r.nom, emoji: r.emoji, essais: essaisDe(r).length, secondes: secondes(r), trouve: !!r.trouve, fini: fini(r), fin: r.fin, moi: g.some(x => x.tok === tok) });
  }
  const rang = x => x.trouve ? 0 : x.fini ? 1 : 2;
  out.sort((a, b) => rang(a) - rang(b) || (rang(a) === 0 ? a.essais - b.essais : 0) || (a.fin || 9e15) - (b.fin || 9e15));
  return out;
}

// ce que voit un joueur d'une chanson : ses essais (avec leur titre) et leur résultat ; la chanson seulement à la fin
async function etat(db, j, tok) {
  const moi = okTok(tok) ? await db.prepare('SELECT * FROM morceau_joueurs WHERE jour = ? AND tok = ?').bind(j.cle_jour, tok).first() : null;
  const out = { jour: j.jour, num: j.num, ecoutes: ECOUTES, moi: null, classement: await classement(db, j.cle_jour, tok) };
  if (moi) {
    const e = essaisDe(moi);
    out.moi = {
      essais: e.map(k => { const m = k && PAR_CLE.get(k); return { r: resultat(k, j), titre: m ? m[2] : null, artiste: m ? m[1] : null }; }),
      trouve: !!moi.trouve, fini: fini(moi), secondes: secondes(moi), fin: moi.fin,
    };
    if (out.moi.fini) out.solution = { titre: j.titre, artiste: j.artiste, annee: j.annee, pochette: j.pochette };
  }
  return out;
}
async function journee(db, js, tok) {
  return { jour: js[0].jour, morceaux: await Promise.all(js.map(j => etat(db, j, tok))) };
}

export async function onRequest({ request, env, params }) {
  const db = env.DB; if (!db) return err('La base du Morceau du jour n’est pas branchée.', 503);
  const route = (params.route || []).join('/'), url = new URL(request.url), now = Date.now();
  try {
    // la liste de toutes les chansons, pour proposer les titres pendant la frappe (rien de secret : pas d'extrait)
    if (request.method === 'GET' && route === 'liste')
      return json({ n: MORCEAUX.length, l: MORCEAUX.map(m => [m[0], m[2], m[1]]) }, 200, 'public, max-age=3600');
    const js = await morceauxDuJour(db, env, now);
    if (request.method === 'GET') {
      if (route === 'jour') return json(await journee(db, js, url.searchParams.get('tok')));
      // l'extrait de la chanson n, relayé tel quel : le navigateur ne voit jamais son adresse
      if (route === 'audio') {
        const j = js[Math.min(PAR_JOUR, Math.max(1, Math.floor(+url.searchParams.get('n')) || 1)) - 1];
        const r = await fetch(j.extrait, { cf: { cacheTtl: 86400, cacheEverything: true } });
        if (!r.ok) return err('L’extrait ne répond pas.', 502, 'audio');
        return new Response(r.body, { headers: { 'content-type': 'audio/mp4', 'cache-control': 'private, max-age=3600' } });   // Apple dit « x-m4p », que certains navigateurs refusent
      }
      return err('Route inconnue.', 404);
    }
    if (request.method !== 'POST') return err('Méthode non prise en charge.', 405);
    if (route !== 'essai') return err('Route inconnue.', 404);
    const b = await request.json().catch(() => ({}));
    if (!okTok(b.tok)) return err('Téléphone non reconnu, recharge la page.');
    const nom = cleanName(b.nom); if (!nom) return err('Il faut un prénom.', 400, 'nom');
    if (b.jour && b.jour !== js[0].jour) return err('Minuit est passé : voici les morceaux du nouveau jour.', 409, 'jour');
    const j = js[Math.min(PAR_JOUR, Math.max(1, Math.floor(+b.num) || 1)) - 1];
    const moi = await db.prepare('SELECT * FROM morceau_joueurs WHERE jour = ? AND tok = ?').bind(j.cle_jour, b.tok).first();
    if (moi && fini(moi)) return err('Ta partie de ce morceau est finie.', 409, 'fini');
    const essais = essaisDe(moi);
    // b.cle = la chanson choisie dans la liste ; vide = « Passer » (on entend un peu plus, l'essai compte)
    const prop = b.cle ? String(b.cle) : null;
    if (prop && !PAR_CLE.has(prop)) return err('Choisis un titre dans la liste.', 400, 'inconnu');
    if (prop && essais.includes(prop)) return err('Tu l’as déjà proposé.', 400, 'deja');
    const apres = [...essais, prop], trouve = prop === j.cle ? 1 : 0, finit = trouve || apres.length >= ESSAIS;
    if (!moi) {
      const r = await db.prepare('INSERT OR IGNORE INTO morceau_joueurs (jour, tok, nom, emoji, essais, debut, fin, trouve) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(j.cle_jour, b.tok, nom, cleanEmoji(b.emoji), JSON.stringify(apres), now, finit ? now : null, trouve).run();
      if (!r.meta.changes) return err('Deux essais en même temps : recharge la page.', 409, 'course');
    } else {
      // la ligne n'est écrite que si personne n'a joué entre-temps depuis ce téléphone (deux onglets ouverts)
      const r = await db.prepare('UPDATE morceau_joueurs SET essais = ?, nom = ?, emoji = ?, fin = ?, trouve = ? WHERE jour = ? AND tok = ? AND essais = ?')
        .bind(JSON.stringify(apres), nom, cleanEmoji(b.emoji), finit ? now : null, trouve, j.cle_jour, b.tok, moi.essais).run();
      if (!r.meta.changes) return err('Deux essais en même temps : recharge la page.', 409, 'course');
    }
    return json(await journee(db, js, b.tok));
  } catch (e) {
    console.error('morceau', route, e?.stack || e);
    return err('Le serveur du Morceau du jour a eu un souci. Réessaie dans un instant.', 500);
  }
}
