// Accès aux statistiques : le mot de passe est un secret du projet Pages (STATS_MDP), jamais dans le code.
// Mise en place : wrangler pages secret put STATS_MDP --project-name boite-a-jeux
export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
});

// comparaison à durée constante, pour ne rien laisser deviner du mot de passe
function same(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

/** Renvoie une réponse d'erreur si l'accès est refusé, sinon null. */
export async function refuse(request, env) {
  if (!env.STATS_MDP) return json({ erreur: 'Le mot de passe des statistiques n’est pas encore configuré.' }, 503);
  if (!env.DB) return json({ erreur: 'La base des statistiques n’est pas branchée.' }, 503);
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!given || !same(given, env.STATS_MDP)) {
    await new Promise(r => setTimeout(r, 600));          // freine les essais à la chaîne
    return json({ erreur: 'Mot de passe incorrect.' }, 401);
  }
  return null;
}
