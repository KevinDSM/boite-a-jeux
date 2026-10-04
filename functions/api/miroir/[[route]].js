// Miroir : l'API (Cloudflare Pages Functions + base D1 « boite-a-jeux-stats », tables miroir_*).
// Trois codes par partie : le code à partager (s'inscrire, répondre), le code hôte (fermer la liste,
// lancer le résultat) et le code des résultats (créé au lancement, à envoyer à tout le monde).
// Chaque téléphone a un secret « tok » : il prouve qui répond, sans compte ni mot de passe.
import { CATS, tirage } from './_banque.js';

const MAX_JOUEURS = 12, MAX_NOM = 14, N_QUESTIONS = 25;
const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', LN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rnd = (alpha, n) => { const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map(x => alpha[x % alpha.length]).join(''); };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (msg, status = 400) => json({ erreur: msg }, status);
const okTok = t => typeof t === 'string' && /^[a-z0-9]{12,40}$/i.test(t);
const okCode = c => typeof c === 'string' && /^[A-Z]{5}$/.test(c);
const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOM);
const cleanEmoji = s => [...String(s || '')].slice(0, 2).join('');
const parse = s => { try { return JSON.parse(s); } catch { return null; } };

async function body(request) { try { return await request.json(); } catch { return {}; } }
async function partieByCode(db, code) { return okCode(code) ? db.prepare('SELECT * FROM miroir_parties WHERE code = ?').bind(code).first() : null; }
async function partieByHost(db, h) { return typeof h === 'string' && /^[A-Z0-9]{8}$/.test(h) ? db.prepare('SELECT * FROM miroir_parties WHERE hote = ?').bind(h).first() : null; }
async function joueurs(db, code) {
  const r = await db.prepare(`SELECT j.pid, j.nom, j.emoji, j.arrive, j.fini, j.tok, (SELECT count(*) FROM miroir_reponses r WHERE r.partie = j.partie AND r.pid = j.pid) AS n
    FROM miroir_joueurs j WHERE j.partie = ? ORDER BY j.arrive`).bind(code).all();
  return r.results;
}
const publics = list => list.map(({ tok, ...p }) => ({ ...p, fini: !!p.fini }));

// ce que voit un participant : la liste, sa progression, ses propres réponses, jamais celles des autres
async function etat(db, p, tok) {
  const list = await joueurs(db, p.code);
  const moi = okTok(tok) ? list.find(j => j.tok === tok) : null;
  const out = {
    code: p.code, phase: p.phase, cree: p.cree, n: N_QUESTIONS,
    createur: list.find(j => j.pid === p.createur)?.nom || '', createurPid: p.createur,
    cats: (parse(p.cats) || []).map(id => CATS.find(c => c.id === id)?.nom).filter(Boolean),
    participants: publics(list), moi: moi ? moi.pid : null,
  };
  if (moi && p.phase !== 'inscriptions') {
    out.questions = parse(p.questions);
    const r = await db.prepare('SELECT q, v FROM miroir_reponses WHERE partie = ? AND pid = ?').bind(p.code, moi.pid).all();
    out.mesReponses = Object.fromEntries(r.results.map(x => [x.q, parse(x.v)]));
  }
  return out;
}

async function resultats(db, p) {
  const list = await joueurs(db, p.code);
  const r = await db.prepare('SELECT pid, q, v FROM miroir_reponses WHERE partie = ?').bind(p.code).all();
  return {
    code: p.code, phase: p.phase, cree: p.cree, createur: list.find(j => j.pid === p.createur)?.nom || '',
    questions: parse(p.questions), participants: publics(list),
    reponses: r.results.map(x => ({ pid: x.pid, q: x.q, v: parse(x.v) || {} })),
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
        if (p.phase !== 'resultats') return err('L’hôte n’a pas encore lancé le résultat.', 409);
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
              .bind(code, hote, now, now, 'inscriptions', pid, JSON.stringify(cats), JSON.stringify(questions)),
            db.prepare('INSERT INTO miroir_joueurs (partie, pid, tok, nom, emoji, arrive, fini) VALUES (?, ?, ?, ?, ?, ?, 0)').bind(code, pid, b.tok, nom, cleanEmoji(b.emoji), now),
          ]);
          return json({ code, hote, pid });
        } catch (e) { if (!/UNIQUE|constraint/i.test(String(e?.message))) throw e; }
      }
      return err('Création impossible, réessaie.', 500);
    }

    // -------------------------------------------------------------- participants
    if (route === 'inscrire' || route === 'repondre' || route === 'terminer') {
      const p = await partieByCode(db, b.c); if (!p) return err('Aucune partie Miroir avec ce code.', 404);
      if (!okTok(b.tok)) return err('Téléphone non reconnu, recharge la page.');
      const list = await joueurs(db, p.code), moi = list.find(j => j.tok === b.tok);
      if (route === 'inscrire') {
        const nom = cleanName(b.nom); if (!nom) return err('Il faut un prénom.');
        if (list.some(j => j.tok !== b.tok && j.nom.toLowerCase() === nom.toLowerCase())) return err(`Quelqu’un s’appelle déjà ${nom} dans cette partie. Ajoute une initiale.`);
        if (moi) { await db.prepare('UPDATE miroir_joueurs SET nom = ?, emoji = ? WHERE partie = ? AND pid = ?').bind(nom, cleanEmoji(b.emoji), p.code, moi.pid).run(); return json({ pid: moi.pid }); }
        if (p.phase !== 'inscriptions') return err('La liste est fermée : l’hôte a lancé les réponses.', 409);
        if (list.length >= MAX_JOUEURS) return err(`La partie est complète (${MAX_JOUEURS} joueurs).`, 409);
        const pid = rnd('abcdefghijkmnpqrstuvwxyz23456789', 8);
        await db.prepare('INSERT INTO miroir_joueurs (partie, pid, tok, nom, emoji, arrive, fini) VALUES (?, ?, ?, ?, ?, ?, 0)').bind(p.code, pid, b.tok, nom, cleanEmoji(b.emoji), now).run();
        return json({ pid });
      }
      if (!moi) return err('Tu n’es pas inscrit à cette partie.', 403);
      if (p.phase !== 'reponses') return err(p.phase === 'inscriptions' ? 'Les réponses ne sont pas encore ouvertes.' : 'Le résultat est lancé : les réponses sont closes.', 409);
      if (route === 'repondre') {
        const qi = +b.q; if (!Number.isInteger(qi) || qi < 0 || qi >= N_QUESTIONS) return err('Question inconnue.');
        const ids = new Set(list.map(j => j.pid)), v = {};
        for (const [pid, x] of Object.entries(b.v || {})) { if (ids.has(pid) && Number.isFinite(+x)) v[pid] = Math.max(0, Math.min(100, Math.round(+x))); }
        if (!(moi.pid in v)) return err('Place d’abord ta propre barre.');
        await db.prepare('INSERT INTO miroir_reponses (partie, pid, q, v, maj) VALUES (?, ?, ?, ?, ?) ON CONFLICT (partie, pid, q) DO UPDATE SET v = excluded.v, maj = excluded.maj')
          .bind(p.code, moi.pid, qi, JSON.stringify(v), now).run();
        return json({ ok: true });
      }
      await db.prepare('UPDATE miroir_joueurs SET fini = 1 WHERE partie = ? AND pid = ?').bind(p.code, moi.pid).run();
      return json({ ok: true });
    }

    // -------------------------------------------------------------- hôte
    if (route === 'hote') {
      const p = await partieByHost(db, b.h); if (!p) return err('Code hôte inconnu.', 404);
      const list = await joueurs(db, p.code);
      if (b.action === 'retirer') {
        if (p.phase !== 'inscriptions') return err('On ne retire quelqu’un que pendant les inscriptions.', 409);
        if (b.pid === p.createur) return err('L’hôte reste dans la partie.');
        await db.prepare('DELETE FROM miroir_joueurs WHERE partie = ? AND pid = ?').bind(p.code, String(b.pid || '')).run();
        return json({ ok: true });
      }
      if (b.action === 'fermer') {
        if (p.phase !== 'inscriptions') return err('La liste est déjà fermée.', 409);
        if (list.length < 2) return err('Il faut au moins deux inscrits.', 409);
        await db.prepare('UPDATE miroir_parties SET phase = ?, maj = ? WHERE code = ?').bind('reponses', now, p.code).run();
        return json({ ok: true });
      }
      if (b.action === 'reveler') {
        if (p.phase === 'resultats') return json({ resultat: p.resultat });
        if (p.phase !== 'reponses') return err('Ferme d’abord la liste et laisse chacun répondre.', 409);
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
