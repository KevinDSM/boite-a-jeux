/* Boîte à jeux · les nouveautés et les suggestions de l'accueil.
   Les nouveautés : une ligne par ajout, la plus récente en haut. Court : on ne saoule personne.
   Ajouter une ligne ici à chaque mise en ligne qui change quelque chose pour les joueurs (pas les corrections invisibles).
   Une pastille rouge s'allume sur l'icône de l'accueil tant que la ligne du haut n'a pas été vue (localStorage dc-news). */
'use strict';

const NEWS = [
  ['2026-10-16', 'La boîte a un nouveau logo, en 3D.'],
  ['2026-10-15', 'Nouveau : le Morceau du jour. Trois chansons par jour, une seconde pour les reconnaître.'],
  ['2026-10-15', 'Le Mot du jour passe à trois mots par jour, chacun son classement. Et tu peux taper n’importe quelles lettres.'],
  ['2026-10-11', 'Deux nouveaux jeux : les Échecs et les Dames, contre un ami ou contre le robot.'],
  ['2026-10-11', 'Sur téléphone, les réglages d’un jeu s’ouvrent juste sous sa carte.'],
  ['2026-10-11', 'Plus de chansons, plus de mots à l’Undercover, et presque plus de répétitions.'],
  ['2026-10-11', 'Les Naufragés passent en 3D : une vraie île, la météo, le radeau, et vous autour du feu.'],
  ['2026-10-11', 'Une idée, un bug ? Le bouton « Vos suggestions », juste là sur l’accueil.'],
  ['2026-10-11', 'Quatre nouveaux jeux : Un seul indice, Menteur, Bataille navale et Coinche.'],
  ['2026-10-11', 'Chromo, Kems, Poker, Bataille, Douze et Solitaire changent de table. Plus beaux, plus lisibles.'],
  ['2026-10-11', 'Le Mot du jour : un mot par jour, façon Motus, le même pour tout le monde.'],
  ['2026-10-10', 'L’accueil se simplifie : rejoindre ou créer, sans se tromper.'],
  ['2026-10-10', 'Nouveau look, et une vraie icône pour chaque jeu.'],
  ['2026-10-04', 'Miroir : qui te connaît le mieux ? Chacun répond quand il veut.'],
  ['2026-10-04', 'La partie tient même si l’hôte coupe son téléphone.'],
  ['2026-10-04', 'Un emoji par joueur, et les invitations par lien.'],
];

(function nouveautes() {
  const btn = $('#btn-news'), sheet = $('#news'); if (!btn || !sheet) return;
  const latest = NEWS[0][0] + '|' + NEWS[0][1].length;
  let seen = null; try { seen = localStorage.getItem('dc-news'); } catch { }
  const dot = btn.querySelector('.ih-dot');
  if (dot) dot.hidden = seen === latest;
  const day = d => { try { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(d + 'T12:00:00')); } catch { return d; } };
  // les lignes groupées par jour
  const groups = []; NEWS.forEach(([d, t]) => { const g = groups[groups.length - 1]; if (g && g.d === d) g.t.push(t); else groups.push({ d, t: [t] }); });
  $('#news-body').innerHTML = groups.map(g => `<section class="news-day"><h4>${day(g.d)}</h4><ul>${g.t.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('');
  btn.onclick = () => {
    sheet.hidden = false;
    try { localStorage.setItem('dc-news', latest); } catch { }
    if (dot) dot.hidden = true;
  };
  $('#news-close').onclick = () => { sheet.hidden = true; };
  sheet.onclick = e => { if (e.target === sheet) sheet.hidden = true; };
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
