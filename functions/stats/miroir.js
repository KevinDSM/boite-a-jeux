// GET /stats/miroir : les parties Miroir (les plus récentes d'abord), leurs participants et toutes les
// réponses, pour suivre une partie en direct depuis la page /stats. Même mot de passe que /stats.
import { json, refuse } from './_auth.js';

export async function onRequestGet({ request, env }) {
  const no = await refuse(request, env); if (no) return no;
  const parse = s => { try { return JSON.parse(s); } catch { return null; } };
  const [parties, joueurs, reponses] = await env.DB.batch([
    env.DB.prepare('SELECT code, hote, resultat, cree, maj, phase, createur, cats, questions FROM miroir_parties ORDER BY cree DESC LIMIT 60'),
    env.DB.prepare('SELECT partie, pid, nom, emoji, arrive, fini FROM miroir_joueurs WHERE partie IN (SELECT code FROM miroir_parties ORDER BY cree DESC LIMIT 60) ORDER BY arrive'),
    env.DB.prepare('SELECT partie, pid, q, v, maj FROM miroir_reponses WHERE partie IN (SELECT code FROM miroir_parties ORDER BY cree DESC LIMIT 60)'),
  ]);
  return json({
    maintenant: Date.now(),
    parties: parties.results.map(p => ({
      ...p, cats: parse(p.cats) || [], questions: parse(p.questions) || [],
      joueurs: joueurs.results.filter(j => j.partie === p.code).map(j => ({ ...j, fini: !!j.fini })),
      reponses: reponses.results.filter(r => r.partie === p.code).map(r => ({ pid: r.pid, q: r.q, v: parse(r.v) || {}, maj: r.maj })),
    })),
  });
}
