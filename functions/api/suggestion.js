// POST /api/suggestion {nom, texte, tok} : une suggestion d'un joueur (bouton « Vos suggestions » de l'accueil).
// Elle arrive dans la base D1 (table suggestions) ; Kevin la lit et l'efface depuis /stats.
// Pas de compte : on freine seulement les envois à la chaîne (un par minute et par téléphone, 300 par jour en tout).
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const clean = (s, max) => String(s || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ erreur: 'Les suggestions ne sont pas branchées.' }, 503);
  let b = null; try { b = await request.json(); } catch { }
  if (!b) return json({ erreur: 'Message illisible.' }, 400);
  if (b.site) return json({ ok: true });                 // champ piège : seuls les robots le remplissent
  const nom = clean(b.nom, 30), texte = clean(b.texte, 800).replace(/\n{3,}/g, '\n\n');
  const tok = /^[a-z0-9]{12,40}$/i.test(b.tok || '') ? b.tok : null;
  if (!nom) return json({ erreur: 'Mets ton prénom.' }, 400);
  if (texte.length < 3) return json({ erreur: 'Écris ta suggestion.' }, 400);
  const now = Date.now();
  const [recent, day] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE tok = ? AND cree > ?').bind(tok || '-', now - 60e3),
    env.DB.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE cree > ?').bind(now - 864e5),
  ]);
  if (tok && recent.results[0].n > 0) return json({ erreur: 'Une à la fois : réessaie dans une minute.' }, 429);
  if (day.results[0].n >= 300) return json({ erreur: 'Beaucoup de suggestions aujourd’hui. Réessaie demain.' }, 429);
  await env.DB.prepare('INSERT INTO suggestions (cree, nom, texte, tok) VALUES (?, ?, ?, ?)').bind(now, nom, texte, tok).run();
  return json({ ok: true });
}
