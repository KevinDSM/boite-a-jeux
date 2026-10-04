// L'accueil. Un lien d'invitation (?c=CODE&de=Prénom) reçoit son propre aperçu dans les messageries :
// « Kevin vous invite à jouer » et l'image du salon. Les robots des messageries n'exécutent pas le
// JavaScript : les balises doivent être justes dans le HTML envoyé.
export async function onRequestGet({ request, env }) {
  const res = await env.ASSETS.fetch(request);
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  const url = new URL(request.url);
  const code = (url.searchParams.get('c') || '').toUpperCase();
  let title = 'Boîte à jeux', image = url.origin + '/og.jpg', desc = null;
  if (/^[A-Z]{4}$/.test(code)) {
    const from = (url.searchParams.get('de') || '').trim().slice(0, 14);
    title = from ? `${from} vous invite à jouer` : 'Une partie vous attend';
    desc = `Salon ${code}. 22 jeux pour la soirée, chacun sur son téléphone. Touchez le lien pour rejoindre la table.`;
    image = `${url.origin}/api/invite/${code}`;
  }
  const content = v => ({ element(e) { e.setAttribute('content', v); } });
  let rw = new HTMLRewriter()
    .on('meta[property="og:title"]', content(title))
    .on('meta[property="og:url"]', content(url.href))
    .on('meta[property="og:image"]', content(image));
  if (desc) rw = rw.on('meta[property="og:description"]', content(desc)).on('meta[name="description"]', content(desc));
  const out = rw.transform(res);
  const h = new Headers(out.headers); h.set('cache-control', 'no-cache'); h.delete('etag');
  return new Response(out.body, { status: out.status, headers: h });
}
