// POST /stats/effacer?salon=ID : efface un salon (ses joueurs et ses parties) ; ?tout=1 : efface tout.
import { json, refuse } from './_auth.js';

export async function onRequestPost({ request, env }) {
  const no = await refuse(request, env); if (no) return no;
  const q = new URL(request.url).searchParams;
  if (q.get('tout') === '1') {
    await env.DB.batch(['parties', 'joueurs', 'salons'].map(t => env.DB.prepare(`DELETE FROM ${t}`)));
    return json({ ok: true });
  }
  const id = q.get('salon') || '';
  if (!/^[A-Z]{4}-[a-z0-9]+$/.test(id)) return json({ erreur: 'Salon inconnu.' }, 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM parties WHERE salon = ?').bind(id),
    env.DB.prepare('DELETE FROM joueurs WHERE salon = ?').bind(id),
    env.DB.prepare('DELETE FROM salons WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}
