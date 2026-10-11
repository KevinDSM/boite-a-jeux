// Le Mot du jour : l'API (Cloudflare Pages Functions + base D1 « boite-a-jeux-stats », tables motdujour_*).
// Un mot par jour (heure de Paris), le même pour tout le monde, de 6 à 9 lettres, la première donnée.
// Six lignes par joueur. Après trois essais ratés, il peut demander l'indice : il prend une ligne.
//
// Le mot ne quitte JAMAIS le serveur avant la fin de la partie du joueur : chaque proposition est vérifiée
// ici (dictionnaire, longueur, première lettre) et seules les couleurs repartent. Le mot et son indice
// complet ne sont renvoyés qu'à celui qui a fini (trouvé, ou ses six lignes prises).
// Chaque téléphone a un secret « tok » (le même que pour Miroir) : il prouve qui joue, sans compte.
//
// Le mot du jour est choisi dans _mots.js selon un ordre tiré au sort avec le secret MOT_SEL (s'il est posé),
// puis figé dans motdujour_jours dès la première visite du jour : modifier la liste ne change jamais le mot
// d'une journée déjà commencée.
import { MOTS } from './_mots.js';
import { DICO } from './_dico.js';

const LIGNES = 6, INDICE_APRES = 3, MAX_NOM = 14;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (msg, status = 400, code) => json({ erreur: msg, code }, status);
const okTok = t => typeof t === 'string' && /^[a-z0-9]{12,40}$/i.test(t);
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOM);
const cleanEmoji = s => [...String(s || '')].slice(0, 2).join('');
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toUpperCase();

// la date du jour à Paris, et son numéro (jours depuis 1970)
function aujourdhui(now) {
  const jour = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const [y, m, d] = jour.split('-').map(Number);
  return { jour, n: Math.round(Date.UTC(y, m - 1, d) / 864e5) };
}

// un mot existe-t-il ? recherche par dichotomie dans la chaîne de sa longueur
function existe(mot) {
  const s = DICO[mot.length], L = mot.length; if (!s) return false;
  let lo = 0, hi = s.length / L - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, w = s.substr(mid * L, L);
    if (w === mot) return true;
    if (w < mot) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

// les couleurs, façon Motus : b = bien placée, m = mal placée, a = absente (une lettre en double ne compte
// comme mal placée que s'il en reste une à placer dans le mot)
function couleurs(prop, mot) {
  const r = Array(mot.length).fill('a'), reste = {};
  for (let i = 0; i < mot.length; i++) { if (prop[i] === mot[i]) r[i] = 'b'; else reste[mot[i]] = (reste[mot[i]] || 0) + 1; }
  for (let i = 0; i < mot.length; i++) if (r[i] !== 'b' && reste[prop[i]] > 0) { r[i] = 'm'; reste[prop[i]]--; }
  return r.join('');
}

// l'ordre des mots pour un cycle (une liste entière) : trié sur l'empreinte SHA-256 de (secret, cycle, mot)
const ordres = new Map();
async function ordre(sel, cycle) {
  const k = sel + '|' + cycle; if (ordres.has(k)) return ordres.get(k);
  const enc = new TextEncoder();
  const cles = await Promise.all(MOTS.map(async ([m], i) => {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`${sel}|${cycle}|${norm(m)}`)));
    return [[...h.slice(0, 8)].map(x => x.toString(16).padStart(2, '0')).join(''), i];
  }));
  const o = cles.sort((a, b) => a[0] < b[0] ? -1 : 1).map(x => x[1]);
  ordres.set(k, o); return o;
}

// le mot du jour, figé en base à la première visite
async function motDuJour(db, env, now) {
  const { jour, n } = aujourdhui(now);
  let row = await db.prepare('SELECT * FROM motdujour_jours WHERE jour = ?').bind(jour).first();
  if (row) return row;
  const o = await ordre(env.MOT_SEL || 'boite-a-jeux', Math.floor(n / MOTS.length));
  const [affiche, indice] = MOTS[o[n % MOTS.length]];
  await db.prepare('INSERT OR IGNORE INTO motdujour_jours (jour, mot, affiche, indice) VALUES (?, ?, ?, ?)').bind(jour, norm(affiche), affiche, indice).run();
  return db.prepare('SELECT * FROM motdujour_jours WHERE jour = ?').bind(jour).first();
}

const lignes = r => (parse(r.essais) || []).length + (r.indice == null ? 0 : 1);
const fini = r => !!r.trouve || lignes(r) >= LIGNES;

// le classement du jour : ceux qui ont trouvé (moins de lignes, puis le plus tôt), puis ceux qui ont séché,
// puis ceux qui cherchent encore. Un même prénom ne compte qu'une fois, et pareil pour tout le monde : sa première
// partie TERMINÉE du jour (on ne rejoue pas pour améliorer son score) ; à défaut, sa première partie en cours.
async function classement(db, jour, tok) {
  const rows = (await db.prepare('SELECT tok, nom, emoji, essais, indice, debut, fin, trouve FROM motdujour_joueurs WHERE jour = ? ORDER BY debut').bind(jour).all()).results;
  const groupes = new Map();
  for (const r of rows) { const k = r.nom.toLowerCase(); if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(r); }
  const out = [];
  for (const g of groupes.values()) {
    const r = g.find(fini) || g[0];
    out.push({ nom: r.nom, emoji: r.emoji, lignes: lignes(r), indice: r.indice != null, trouve: !!r.trouve, fini: fini(r), fin: r.fin, moi: g.some(x => x.tok === tok) });
  }
  const rang = x => x.trouve ? 0 : x.fini ? 1 : 2;
  out.sort((a, b) => rang(a) - rang(b) || (rang(a) === 0 ? a.lignes - b.lignes : 0) || (a.fin || 9e15) - (b.fin || 9e15));
  return out;
}

// ce que voit un joueur : la longueur, la première lettre, ses essais et leurs couleurs ; le mot seulement à la fin
async function etat(db, j, tok) {
  const moi = okTok(tok) ? await db.prepare('SELECT * FROM motdujour_joueurs WHERE jour = ? AND tok = ?').bind(j.jour, tok).first() : null;
  const out = { jour: j.jour, n: j.mot.length, premiere: j.mot[0], lignes: LIGNES, indiceApres: INDICE_APRES, moi: null, classement: await classement(db, j.jour, tok) };
  if (moi) {
    const essais = parse(moi.essais) || [];
    out.moi = {
      essais: essais.map(m => ({ mot: m, c: couleurs(m, j.mot) })),
      indice: moi.indice == null ? null : { apres: moi.indice, texte: j.indice },
      trouve: !!moi.trouve, fini: fini(moi), lignes: lignes(moi), fin: moi.fin,
    };
    if (out.moi.fini) out.solution = { mot: j.mot, affiche: j.affiche, indice: j.indice };
  }
  return out;
}

export async function onRequest({ request, env, params }) {
  const db = env.DB; if (!db) return err('La base du Mot du jour n’est pas branchée.', 503);
  const route = (params.route || []).join('/'), url = new URL(request.url), now = Date.now();
  try {
    const j = await motDuJour(db, env, now);
    if (request.method === 'GET') {
      if (route === 'jour') return json(await etat(db, j, url.searchParams.get('tok')));
      return err('Route inconnue.', 404);
    }
    if (request.method !== 'POST') return err('Méthode non prise en charge.', 405);
    const b = await request.json().catch(() => ({}));
    if (route !== 'essai' && route !== 'indice') return err('Route inconnue.', 404);
    if (!okTok(b.tok)) return err('Téléphone non reconnu, recharge la page.');
    const nom = cleanName(b.nom); if (!nom) return err('Il faut un prénom.', 400, 'nom');
    if (b.jour && b.jour !== j.jour) return err('Minuit est passé : voici le mot du nouveau jour.', 409, 'jour');
    let moi = await db.prepare('SELECT * FROM motdujour_joueurs WHERE jour = ? AND tok = ?').bind(j.jour, b.tok).first();
    if (moi && fini(moi)) return err('Ta partie du jour est finie.', 409, 'fini');
    const essais = parse(moi?.essais) || [];

    if (route === 'essai') {
      const mot = norm(b.mot);
      if (!/^[A-Z]+$/.test(mot) || mot.length !== j.mot.length) return err(`Il faut un mot de ${j.mot.length} lettres.`, 400, 'longueur');
      if (mot[0] !== j.mot[0]) return err(`Le mot commence par ${j.mot[0]}.`, 400, 'lettre');
      if (essais.includes(mot)) return err('Déjà proposé.', 400, 'deja');
      if (!existe(mot)) return err('Ce mot n’est pas dans le dictionnaire.', 400, 'dico');
      const apres = [...essais, mot], trouve = mot === j.mot ? 1 : 0;
      const finit = trouve || apres.length + (moi?.indice == null ? 0 : 1) >= LIGNES;
      if (!moi) {
        const r = await db.prepare('INSERT OR IGNORE INTO motdujour_joueurs (jour, tok, nom, emoji, essais, debut, fin, trouve) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(j.jour, b.tok, nom, cleanEmoji(b.emoji), JSON.stringify(apres), now, finit ? now : null, trouve).run();
        if (!r.meta.changes) return err('Deux propositions en même temps : recharge la page.', 409, 'course');
      } else {
        // la ligne n'est écrite que si personne n'a joué entre-temps depuis ce téléphone (deux onglets ouverts)
        const r = await db.prepare('UPDATE motdujour_joueurs SET essais = ?, nom = ?, emoji = ?, fin = ?, trouve = ? WHERE jour = ? AND tok = ? AND essais = ?')
          .bind(JSON.stringify(apres), nom, cleanEmoji(b.emoji), finit ? now : null, trouve, j.jour, b.tok, moi.essais).run();
        if (!r.meta.changes) return err('Deux propositions en même temps : recharge la page.', 409, 'course');
      }
      return json(await etat(db, j, b.tok));
    }

    // l'indice : après trois essais ratés, une seule fois, et s'il reste au moins une ligne pour en profiter
    if (!moi || essais.length < INDICE_APRES) return err(`L’indice s’ouvre après ${INDICE_APRES} essais.`, 409, 'tot');
    if (moi.indice != null) return json(await etat(db, j, b.tok));
    if (lignes(moi) + 1 >= LIGNES) return err('Plus assez de lignes pour un indice.', 409, 'tard');
    await db.prepare('UPDATE motdujour_joueurs SET indice = ?, nom = ?, emoji = ? WHERE jour = ? AND tok = ? AND indice IS NULL')
      .bind(essais.length, nom, cleanEmoji(b.emoji), j.jour, b.tok).run();
    return json(await etat(db, j, b.tok));
  } catch (e) {
    console.error('motdujour', route, e?.stack || e);
    return err('Le serveur du Mot du jour a eu un souci. Réessaie dans un instant.', 500);
  }
}
