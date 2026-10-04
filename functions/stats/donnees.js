// GET /stats/donnees?jours=30 : salons, joueurs et parties de la période (0 = depuis le début).
// La page /stats fait les totaux elle-même : les volumes restent petits (quelques salons par soirée).
import { json, refuse } from './_auth.js';

export async function onRequestGet({ request, env }) {
  const no = await refuse(request, env); if (no) return no;
  const jours = Math.max(0, Math.min(3650, +new URL(request.url).searchParams.get('jours') || 0));
  const depuis = jours ? Date.now() - jours * 86400000 : 0;
  const dans = 'salon IN (SELECT id FROM salons WHERE cree >= ?1)';
  const [salons, joueurs, parties] = await env.DB.batch([
    env.DB.prepare('SELECT id, code, cree, ferme, hote, hote_emoji FROM salons WHERE cree >= ?1 ORDER BY cree DESC LIMIT 5000').bind(depuis),
    env.DB.prepare(`SELECT salon, pid, nom, emoji, arrive FROM joueurs WHERE ${dans}`).bind(depuis),
    env.DB.prepare(`SELECT id, salon, jeu, nom_jeu, debut, fin, robots, joueurs, manches, podium FROM parties WHERE ${dans} ORDER BY debut`).bind(depuis),
  ]);
  const parse = s => { try { return JSON.parse(s); } catch { return null; } };
  return json({
    maintenant: Date.now(), jours,
    salons: salons.results,
    joueurs: joueurs.results,
    parties: parties.results.map(p => ({ ...p, joueurs: parse(p.joueurs) || [], podium: parse(p.podium) })),
  });
}
