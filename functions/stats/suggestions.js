// GET /stats/suggestions : les suggestions des joueurs, les plus récentes d'abord. Même mot de passe que /stats.
// POST /stats/suggestions?id=12 : en efface une ; ?tout=1 : les efface toutes.
import { json, refuse } from './_auth.js';

export async function onRequestGet({ request, env }) {
  const no = await refuse(request, env); if (no) return no;
  const r = await env.DB.prepare('SELECT id, cree, nom, texte FROM suggestions ORDER BY cree DESC LIMIT 300').all();
  return json({ suggestions: r.results });
}

export async function onRequestPost({ request, env }) {
  const no = await refuse(request, env); if (no) return no;
  const q = new URL(request.url).searchParams;
  if (q.get('tout') === '1') { await env.DB.prepare('DELETE FROM suggestions').run(); return json({ ok: true }); }
  const id = +q.get('id');
  if (!Number.isInteger(id) || id <= 0) return json({ erreur: 'Suggestion inconnue.' }, 400);
  await env.DB.prepare('DELETE FROM suggestions WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
