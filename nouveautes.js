/* Boîte à jeux · les nouveautés et les suggestions de l'accueil.
   Les nouveautés : une entrée par ajout (titre court, une phrase, icône du jeu, vidéo en option), la plus récente en haut.
   Ajouter une ligne ici à chaque mise en ligne qui change quelque chose pour les joueurs (pas les corrections invisibles).
   Une pastille rouge s'allume sur l'icône de l'accueil tant que la ligne du haut n'a pas été vue (localStorage dc-news). */
'use strict';

// Une entrée : la date, le genre (jeu = nouveau jeu, new = nouveauté, mieux = amélioration, look = nouveau look),
// les icônes (clés de icons/web/<clé>.webp, ou un pictogramme de NEWS_GLYPH), un titre court, une phrase,
// et en option une vidéo verticale (nouveautes/<nom>.mp4, et <nom>.jpg pour l'image d'attente).
const NEWS = [
  { d: '2026-10-17', k: 'jeu', ic: ['huisclos'], t: 'Huis clos', s: 'Notre escape game : enfermés dans un labo, 45 minutes pour sortir, chacun ses indices.' },
  { d: '2026-10-16', k: 'jeu', ic: ['rail'], t: 'Grandes Lignes', s: 'Pose tes wagons à travers la France et relie tes villes.', video: 'nouveautes/grandes-lignes' },
  { d: '2026-10-16', k: 'jeu', ic: ['ordre'], t: 'Dans l’ordre', s: 'Retrouvez ensemble ce qu’un ami préfère, du meilleur au pire.', video: 'nouveautes/dans-l-ordre' },
  { d: '2026-10-16', k: 'look', ic: ['logo'], t: 'Un nouveau logo', s: 'La boîte passe en 3D.' },
  { d: '2026-10-15', k: 'new', ic: ['morceaudujour'], t: 'Le Morceau du jour', s: 'Trois chansons par jour, une seconde pour les reconnaître.' },
  { d: '2026-10-15', k: 'mieux', ic: ['motdujour'], t: 'Le Mot du jour', s: 'Trois mots par jour, chacun son classement. Toutes les lettres sont permises.' },
  { d: '2026-10-11', k: 'jeu', ic: ['echecs', 'dames'], t: 'Échecs et Dames', s: 'Contre un ami ou contre le robot.' },
  { d: '2026-10-11', k: 'jeu', ic: ['unseulindice', 'menteur', 'navale', 'coinche'], t: 'Quatre nouveaux jeux', s: 'Un seul indice, Menteur, Bataille navale et Coinche.' },
  { d: '2026-10-11', k: 'mieux', ic: ['naufrages'], t: 'Les Naufragés en 3D', s: 'Une vraie île, la météo, le radeau, et vous autour du feu.' },
  { d: '2026-10-11', k: 'mieux', ic: ['chromo', 'kems', 'poker'], t: 'Les jeux de cartes changent de table', s: 'Chromo, Kems, Poker, Bataille, Douze et Solitaire : plus beaux, plus lisibles.' },
  { d: '2026-10-11', k: 'new', ic: ['motdujour'], t: 'Le Mot du jour', s: 'Un mot par jour, façon Motus, le même pour tout le monde.' },
  { d: '2026-10-11', k: 'mieux', ic: ['undercover'], t: 'Moins de répétitions', s: 'Plus de chansons, plus de mots à l’Undercover.' },
  { d: '2026-10-11', k: 'mieux', ic: ['reglages'], t: 'Les réglages au bon endroit', s: 'Sur téléphone, ils s’ouvrent juste sous la carte du jeu.' },
  { d: '2026-10-11', k: 'new', ic: ['idee'], t: 'Vos suggestions', s: 'Une idée, un bug ? Le bouton est sur l’accueil.' },
  { d: '2026-10-10', k: 'mieux', ic: ['porte'], t: 'Un accueil plus simple', s: 'Rejoindre ou créer, sans se tromper.' },
  { d: '2026-10-10', k: 'look', ic: ['nouveautes'], t: 'Nouveau look', s: 'Et une vraie icône pour chaque jeu.' },
  { d: '2026-10-04', k: 'new', ic: ['miroir'], t: 'Miroir', s: 'Qui te connaît le mieux ? Chacun répond quand il veut.' },
  { d: '2026-10-04', k: 'mieux', ic: ['lien'], t: 'Des parties plus solides', s: 'La partie tient même si l’hôte coupe son téléphone.' },
  { d: '2026-10-04', k: 'new', ic: ['lien'], t: 'Emojis et invitations', s: 'Un emoji par joueur, et les invitations par lien.' },
];
const NEWS_KIND = { jeu: 'Nouveau jeu', new: 'Nouveau', mieux: 'Amélioré', look: 'Nouveau look' };
const NEWS_TILE = { motdujour: '#2f8f6b', morceaudujour: '#d0457e', miroir: '#6f9bd1', nouveautes: '#c0485a', logo: '#b9673a', reglages: '#56657a', idee: '#c9962a', porte: '#3f7f8f', lien: '#5d6fb0' };
// les pictogrammes des nouveautés qui ne sont pas un jeu (traits blancs sur la tuile)
const NEWS_GLYPH = {
  reglages: '<path d="M5 7h9M18 7h1M5 17h3M12 17h7"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  idee: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  porte: '<path d="M6 21V4h9l3 2v15"/><path d="M4 21h16"/><path d="M13 13h.01"/>',
  lien: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};

(function nouveautes() {
  const btn = $('#btn-news'), sheet = $('#news'); if (!btn || !sheet) return;
  const latest = NEWS[0].d + '|' + NEWS[0].t;
  let seen = null; try { seen = localStorage.getItem('dc-news'); } catch { }
  const dot = btn.querySelector('.ih-dot');
  if (dot) dot.hidden = seen === latest;
  // ce qui est nouveau pour ce téléphone : le jour de la dernière visite et après (première visite : le dernier jour)
  const seenDate = /^\d{4}-\d\d-\d\d/.test(seen || '') ? seen.slice(0, 10) : null;
  const fresh = n => seen !== latest && (seenDate ? n.d >= seenDate : n.d === NEWS[0].d);
  const dayName = d => {
    const one = new Date(d + 'T12:00:00'), now = new Date(); now.setHours(12, 0, 0, 0);
    const diff = Math.round((now - one) / 864e5);
    let full = d; try { full = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(one); } catch { }
    return { big: diff === 0 ? 'Aujourd’hui' : diff === 1 ? 'Hier' : full.charAt(0).toUpperCase() + full.slice(1), small: diff === 0 || diff === 1 ? full : '' };
  };
  const tile = k => {
    const c = (typeof IH_COLORS !== 'undefined' && IH_COLORS[k]) || NEWS_TILE[k] || '#6b6b75';
    if (NEWS_GLYPH[k]) return `<span class="nw-ic" style="--c:${c}"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NEWS_GLYPH[k]}</svg></span>`;
    const src = k === 'logo' ? `icon-192.png?v=${ASSET_V}` : `icons/web/${k}.webp?v=${ASSET_V}`;
    return `<span class="nw-ic" style="--c:${c}"><img src="${src}" alt="" loading="lazy" decoding="async"></span>`;
  };
  const icons = ic => `<span class="nw-ics n${Math.min(ic.length, 4)}" aria-hidden="true">${ic.slice(0, 4).map(tile).join('')}</span>`;
  const text = n => `<div class="nw-txt"><div class="nw-head"><span class="nw-kind k-${n.k}">${NEWS_KIND[n.k]}</span>${fresh(n) ? '<span class="nw-fresh">Nouveau pour toi</span>' : ''}</div><b>${esc(n.t)}</b><span>${esc(n.s)}</span></div>`;
  const item = n => n.video
    ? `<li class="nw-item nw-hero"><div class="nw-row">${icons(n.ic)}${text(n)}</div>
      <figure class="nw-video"><video src="${n.video}.mp4?v=${ASSET_V}" poster="${n.video}.jpg?v=${ASSET_V}" playsinline muted loop preload="none" aria-label="Bande-annonce : ${esc(n.t)}"></video>
        <button class="nw-play" type="button" aria-label="Lire la bande-annonce"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></button>
        <button class="nw-sound" type="button" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="on" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="off" d="M17 9.5l5 5M22 9.5l-5 5"/></svg><span>Le son</span></button></figure></li>`
    : `<li class="nw-item"><div class="nw-row">${icons(n.ic)}${text(n)}</div></li>`;
  let built = false;
  const body = () => $('#news-body');
  function build() {
    const groups = []; NEWS.forEach(n => { const g = groups[groups.length - 1]; if (g && g.d === n.d) g.n.push(n); else groups.push({ d: n.d, n: [n] }); });
    body().innerHTML = groups.map(g => { const h = dayName(g.d);
      return `<section class="nw-day"><h4><span class="nw-date">${h.big}</span>${h.small ? `<span class="nw-date-s">${h.small}</span>` : ''}</h4><ul class="nw-list">${g.n.map(item).join('')}</ul></section>`; }).join('');
    body().querySelectorAll('.nw-video').forEach(f => {
      const v = f.querySelector('video'), snd = f.querySelector('.nw-sound');
      const go = () => v.play().then(() => f.classList.add('playing')).catch(() => f.classList.remove('playing'));
      f.querySelector('.nw-play').onclick = go;
      v.onclick = () => { if (v.paused) go(); else { v.pause(); f.classList.remove('playing'); } };
      snd.onclick = () => { v.muted = !v.muted; snd.setAttribute('aria-pressed', String(!v.muted)); snd.querySelector('span').textContent = v.muted ? 'Le son' : 'Couper'; if (v.paused) go(); };
    });
    built = true;
  }
  const stopAll = () => body().querySelectorAll('.nw-video').forEach(f => { f.querySelector('video').pause(); f.classList.remove('playing'); });
  btn.onclick = () => {
    if (!built) build();
    sheet.hidden = false;
    // la bande-annonce du haut se lance toute seule, en silence ; « Le son » pour l'entendre
    const f = body().querySelector('.nw-video');
    if (f && !matchMedia('(prefers-reduced-motion: reduce)').matches) f.querySelector('video').play().then(() => f.classList.add('playing')).catch(() => { });
    try { localStorage.setItem('dc-news', latest); } catch { }
    if (dot) dot.hidden = true;
  };
  $('#news-close').onclick = () => { sheet.hidden = true; };
  sheet.onclick = e => { if (e.target === sheet) sheet.hidden = true; };
  // fermée par n'importe quel moyen (bouton, fond, Échap, glisser vers le bas d'ios.js) : la vidéo s'arrête
  new MutationObserver(() => { if (sheet.hidden) stopAll(); }).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
})();

// les suggestions : un prénom, un texte, envoyés à /api/suggestion ; Kevin les lit (et les efface) dans /stats
(function suggestions() {
  const sheet = $('#sugg'); if (!sheet) return;
  const form = $('#f-sugg'), err = $('#sugg-err'), send = $('#sugg-send');
  const tok = () => { let t = ''; try { t = localStorage.getItem('mi-tok') || ''; } catch { }
    if (!/^[a-z0-9]{20}$/.test(t)) { t = [...crypto.getRandomValues(new Uint8Array(20))].map(x => 'abcdefghijklmnopqrstuvwxyz0123456789'[x % 36]).join(''); try { localStorage.setItem('mi-tok', t); } catch { } }
    return t; };
  const reset = () => { form.hidden = false; $('#sugg-done').hidden = true; err.textContent = ''; $('#sugg-texte').value = ''; };
  $('#btn-sugg').onclick = () => {
    reset(); sheet.hidden = false;
    const nom = $('#sugg-nom'); if (!nom.value) nom.value = $('#in-name').value.trim() || (() => { try { return localStorage.getItem('dc-name') || ''; } catch { return ''; } })();
    setTimeout(() => (nom.value ? $('#sugg-texte') : nom).focus({ preventScroll: true }), 250);
  };
  $('#sugg-close').onclick = () => { sheet.hidden = true; };
  sheet.onclick = e => { if (e.target === sheet) sheet.hidden = true; };
  $('#sugg-again').onclick = () => { reset(); $('#sugg-texte').focus(); };
  form.addEventListener('input', () => { err.textContent = ''; });      // le message d'erreur s'efface dès qu'on corrige
  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = '';
    const nom = $('#sugg-nom').value.trim(), texte = $('#sugg-texte').value.trim();
    if (!nom) { err.textContent = 'Mets ton prénom.'; $('#sugg-nom').focus(); return; }
    if (texte.length < 3) { err.textContent = 'Écris ta suggestion.'; $('#sugg-texte').focus(); return; }
    send.disabled = true; send.textContent = 'Envoi';
    try {
      const r = await fetch('/api/suggestion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nom, texte, tok: tok(), site: $('#sugg-site').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { err.textContent = j.erreur || 'Envoi impossible. Réessaie dans un moment.'; return; }
      form.hidden = true; $('#sugg-done').hidden = false;
    } catch { err.textContent = 'Pas de réseau. Réessaie dans un moment.'; }
    finally { send.disabled = false; send.textContent = 'Envoyer'; }
  });
})();
