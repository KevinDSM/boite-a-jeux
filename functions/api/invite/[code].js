// Image d'invitation d'un salon. Le téléphone qui invite la dessine et l'envoie ici (PUT) ;
// les messageries la lisent (GET) pour l'aperçu du lien. Sans image, on renvoie l'aperçu du site.
const ok = c => /^[A-Z]{4}$/.test(c);
const MAX = 400000;

export async function onRequestGet({ params, env, request }) {
  const code = String(params.code || '').toUpperCase();
  const img = ok(code) ? await env.INVITES.get('inv:' + code, 'arrayBuffer') : null;
  if (!img) return Response.redirect(new URL('/og.jpg', request.url).href, 302);
  return new Response(img, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=300' } });
}

export async function onRequestPut({ params, env, request }) {
  const code = String(params.code || '').toUpperCase();
  if (!ok(code)) return new Response('Code invalide', { status: 400 });
  if (+(request.headers.get('content-length') || 0) > MAX) return new Response('Image trop lourde', { status: 413 });
  const buf = await request.arrayBuffer(), b = new Uint8Array(buf);
  if (buf.byteLength > MAX || b[0] !== 0xFF || b[1] !== 0xD8) return new Response('JPEG attendu', { status: 415 });
  await env.INVITES.put('inv:' + code, buf, { expirationTtl: 2 * 86400 });
  return new Response(null, { status: 204 });
}
