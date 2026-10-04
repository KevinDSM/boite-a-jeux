// Miroir : l'API (Cloudflare Pages Functions + base D1 « boite-a-jeux-stats », tables miroir_*).
// Trois codes par partie : le code à partager (s'inscrire, répondre), le code hôte (retirer quelqu'un,
// lancer le résultat) et le code des résultats (créé au lancement, à envoyer à tout le monde).
// Chaque téléphone a un secret « tok » : il prouve qui répond, sans compte ni mot de passe.
//
// Comme dans Prisme, chacun avance à son rythme : il répond pour lui dès qu'il s'inscrit, puis devine
// les autres, un par un, quand il veut. Ceux qui arrivent plus tard s'ajoutent à la liste à deviner.
// Une réponse par (auteur, question) : { pid visé : 0 à 100 }, la sienne comprise ; -1 = « passé ».
import { CATS, tirage } from './_banque.js';

const MAX_JOUEURS = 12, MAX_NOM = 14, N_QUESTIONS = 25, PASSE = -1;
const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', LN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rnd = (alpha, n) => { const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map(x => alpha[x % alpha.length]).join(''); };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (msg, status = 400) => json({ erreur: msg }, status);
const okTok = t => typeof t === 'string' && /^[a-z0-9]{12,40}$/i.test(t);
const okCode = c => typeof c === 'string' && /^[A-Z]{5}$/.test(c);
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOM);
const cleanEmoji = s => [...String(s || '')].slice(0, 2).join('');
const parse = s => { try { return JSON.parse(s); } catch { return null; } };
const ouverte = p => p.phase !== 'resultats';      // « inscriptions » et « reponses » : anciennes parties, toujours ouvertes

async function body(request) { try { return await request.json(); } catch { return {}; } }
async function partieByCode(db, code) { return okCode(code) ? db.prepare('SELECT * FROM miroir_parties WHERE code = ?').bind(code).first() : null; }
async function partieByHost(db, h) { return typeof h === 'string' && /^[A-Z0-9]{8}$/.test(h) ? db.prepare('SELECT * FROM miroir_parties WHERE hote = ?').bind(h).first() : null; }

// la liste, avec pour chacun : combien de questions il a faites pour lui, et combien sur chaque autre
async function joueurs(db, code) {
  const [j, r] = await db.batch([
    db.prepare('SELECT pid, nom, emoji, arrive, tok FROM miroir_joueurs WHERE partie = ? ORDER BY arrive').bind(code),
    db.prepare('SELECT pid, v FROM miroir_reponses WHERE partie = ?').bind(code),
  ]);
  const list = j.results.map(x => ({ ...x, n: 0, g: {} }));
  const by = Object.fromEntries(list.map(x => [x.pid, x]));
  r.results.forEach(x => {
    const a = by[x.pid]; if (!a) return;
    for (const t of Object.keys(parse(x.v) || {})) { if (t === a.pid) a.n += 1; else if (by[t]) a.g[t] = (a.g[t] || 0) + 1; }
  });
  return list;
}
const publics = list => list.map(({ tok, ...p }) => p);

// ce que voit un participant : la liste et l'avancement de chacun, ses propres réponses, jamais celles des autres
async function etat(db, p, tok) {
  const list = await joueurs(db, p.code);
  const moi = okTok(tok) ? list.find(j => j.tok === tok) : null;
  const out = {
    code: p.code, phase: ouverte(p) ? 'ouverte' : 'resultats', cree: p.cree, n: N_QUESTIONS,
    createur: list.find(j => j.pid === p.createur)?.nom || '', createurPid: p.createur,
    cats: (parse(p.cats) || []).map(id => CATS.find(c => c.id === id)?.nom).filter(Boolean),
    participants: publics(list), moi: moi ? moi.pid : null,
  };
  if (moi) {
    out.questions = parse(p.questions);
    const r = await db.prepare('SELECT q, v FROM miroir_reponses WHERE partie = ? AND pid = ?').bind(p.code, moi.pid).all();
    out.mesReponses = Object.fromEntries(r.results.map(x => [x.q, parse(x.v)]));
  }
  return out;
}

async function resultats(db, p) {
  const list = await joueurs(db, p.code);
  const r = await db.prepare('SELECT pid, q, v FROM miroir_reponses WHERE partie = ?').bind(p.code).all();
  const keep = v => Object.fromEntries(Object.entries(v || {}).filter(([, x]) => x !== PASSE));
  return {
    code: p.code, phase: 'resultats', cree: p.cree, createur: list.find(j => j.pid === p.createur)?.nom || '',
    questions: parse(p.questions), participants: publics(list),
    reponses: r.results.map(x => ({ pid: x.pid, q: x.q, v: keep(parse(x.v)) })),
  };
}

export async function onRequest({ request, env, params }) {
  const db = env.DB; if (!db) return err('La base de Miroir n’est pas branchée.', 503);
  const route = (params.route || []).join('/'), url = new URL(request.url), q = url.searchParams;
  const now = Date.now();
  try {
    // -------------------------------------------------------------- lecture
    if (request.method === 'GET') {
      if (route === 'themes') return json({ themes: CATS, n: N_QUESTIONS });
      if (route === 'etat') {
        const p = await partieByCode(db, q.get('c')); if (!p) return err('Aucune partie Miroir avec ce code.', 404);
        return json(await etat(db, p, q.get('tok')));
      }
      if (route === 'hote') {
        const p = await partieByHost(db, q.get('h')); if (!p) return err('Code hôte inconnu.', 404);
        return json({ ...(await etat(db, p, q.get('tok'))), hote: p.hote, resultat: p.resultat });
      }
      if (route === 'resultats') {
        const r = q.get('r');
        const p = r && /^[A-Z]{6}$/.test(r) ? await db.prepare('SELECT * FROM miroir_parties WHERE resultat = ?').bind(r).first() : await partieByHost(db, q.get('h'));
        if (!p) return err('Code de résultats inconnu.', 404);
        if (ouverte(p)) return err('L’hôte n’a pas encore lancé le résultat.', 409);
        return json({ ...(await resultats(db, p)), resultat: p.resultat });
      }
      return err('Route inconnue.', 404);
    }
    if (request.method !== 'POST') return err('Méthode non prise en charge.', 405);
    const b = await body(request);

    // -------------------------------------------------------------- créer une partie
    if (route === 'creer') {
      const nom = cleanName(b.nom); if (!nom) return err('Il faut un prénom.');
      if (!okTok(b.tok)) return err('Téléphone non reconnu, recharge la page.');
      const cats = Array.isArray(b.cats) ? b.cats.filter(id => CATS.some(c => c.id === id)) : [];
      if (cats.length && cats.length < 2) return err('Choisis au moins deux thèmes.');
      const questions = tirage(cats, N_QUESTIONS);
      const pid = rnd('abcdefghijkmnpqrstuvwxyz23456789', 8);
      for (let i = 0; i < 6; i++) {
        const code = rnd(L, 5), hote = rnd(LN, 8);
        try {
          await db.batch([
            db.prepare('INSERT INTO miroir_parties (code, hote, cree, maj, phase, createur, cats, questions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(code, hote, now, now, 'ouverte', pid, JSON.stringify(cats), JSON.stringify(questions)),
            db.prepare('INSERT INTO miroir_joueurs (partie, pid, tok, nom, emoji, arrive, fini) VALUES (?, ?, ?, ?, ?, ?, 0)').bind(code, pid, b.tok, nom, cleanEmoji(b.emoji), now),
          ]);
          return json({ code, hote, pid });
        } catch (e) { if (!/UNIQUE|constraint/i.test(String(e?.message))) throw e; }
      }
      return err('Création impossible, réessaie.', 500);
    }

    // -------------------------------------------------------------- participants
    if (route === 'inscrire' || route === 'repondre') {
      const p = await partieByCode(db, b.c); if (!p) return err('Aucune partie Miroir avec ce code.', 404);
      if (!okTok(b.tok)) return err('Téléphone non reconnu, recharge la page.');
      const list = await joueurs(db, p.code), moi = list.find(j => j.tok === b.tok);
      if (!ouverte(p)) return err('Le résultat est lancé : la partie est close.', 409);
      if (route === 'inscrire') {
        const nom = cleanName(b.nom); if (!nom) return err('Il faut un prénom.');
        const twin = list.find(j => j.tok !== b.tok && j.nom.toLowerCase() === nom.toLowerCase());
        if (twin) return err(`Quelqu’un s’appelle déjà ${twin.nom} dans cette partie. Ajoute une initiale.`);
        if (moi) { await db.prepare('UPDATE miroir_joueurs SET nom = ?, emoji = ? WHERE partie = ? AND pid = ?').bind(nom, cleanEmoji(b.emoji), p.code, moi.pid).run(); return json({ pid: moi.pid }); }
        if (list.length >= MAX_JOUEURS) return err(`La partie est complète (${MAX_JOUEURS} joueurs).`, 409);
        const pid = rnd('abcdefghijkmnpqrstuvwxyz23456789', 8);
        await db.prepare('INSERT INTO miroir_joueurs (partie, pid, tok, nom, emoji, arrive, fini) VALUES (?, ?, ?, ?, ?, ?, 0)').bind(p.code, pid, b.tok, nom, cleanEmoji(b.emoji), now).run();
        return json({ pid });
      }
      // une réponse : pour soi (cible = soi) ou sur un autre ; val = 0 à 100, ou -1 pour « passé »
      if (!moi) return err('Tu n’es pas inscrit à cette partie.', 403);
      const qi = +b.q; if (!Number.isInteger(qi) || qi < 0 || qi >= N_QUESTIONS) return err('Question inconnue.');
      const cible = String(b.cible || ''); if (!list.some(j => j.pid === cible)) return err('Ce joueur n’est plus dans la partie.', 409);
      const val = +b.val === PASSE ? PASSE : Math.max(0, Math.min(100, Math.round(+b.val)));
      if (!Number.isFinite(val)) return err('Valeur invalide.');
      const row = await db.prepare('SELECT v FROM miroir_reponses WHERE partie = ? AND pid = ? AND q = ?').bind(p.code, moi.pid, qi).first();
      const v = { ...(parse(row?.v) || {}), [cible]: val };
      await db.prepare('INSERT INTO miroir_reponses (partie, pid, q, v, maj) VALUES (?, ?, ?, ?, ?) ON CONFLICT (partie, pid, q) DO UPDATE SET v = excluded.v, maj = excluded.maj')
        .bind(p.code, moi.pid, qi, JSON.stringify(v), now).run();
      return json({ ok: true });
    }

    // -------------------------------------------------------------- hôte
    if (route === 'hote') {
      const p = await partieByHost(db, b.h); if (!p) return err('Code hôte inconnu.', 404);
      if (b.action === 'retirer') {
        if (!ouverte(p)) return err('Le résultat est lancé : la partie est close.', 409);
        if (b.pid === p.createur) return err('L’hôte reste dans la partie.');
        await db.batch([
          db.prepare('DELETE FROM miroir_joueurs WHERE partie = ? AND pid = ?').bind(p.code, String(b.pid || '')),
          db.prepare('DELETE FROM miroir_reponses WHERE partie = ? AND pid = ?').bind(p.code, String(b.pid || '')),
        ]);
        return json({ ok: true });
      }
      if (b.action === 'reveler') {
        if (!ouverte(p)) return json({ resultat: p.resultat });
        const list = await joueurs(db, p.code);
        if (list.filter(j => j.n > 0).length < 2 || !list.some(j => Object.keys(j.g).length)) return err('Il faut au moins deux joueurs qui ont répondu, et quelqu’un qui en a deviné un autre.', 409);
        for (let i = 0; i < 6; i++) {
          const r = rnd(L, 6);
          try { await db.prepare('UPDATE miroir_parties SET phase = ?, resultat = ?, maj = ? WHERE code = ?').bind('resultats', r, now, p.code).run(); return json({ resultat: r }); }
          catch (e) { if (!/UNIQUE|constraint/i.test(String(e?.message))) throw e; }
        }
        return err('Lancement impossible, réessaie.', 500);
      }
      return err('Action inconnue.');
    }
    return err('Route inconnue.', 404);
  } catch (e) {
    console.error('miroir', route, e?.stack || e);
    return err('Le serveur de Miroir a eu un souci. Réessaie dans un instant.', 500);
  }
}
