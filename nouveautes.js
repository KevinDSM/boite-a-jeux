/* Boîte à jeux · les nouveautés : une ligne par ajout, la plus récente en haut. Court : on ne saoule personne.
   Ajouter une ligne ici à chaque mise en ligne qui change quelque chose pour les joueurs (pas les corrections invisibles).
   Une pastille rouge s'allume sur l'icône de l'accueil tant que la ligne du haut n'a pas été vue (localStorage dc-news). */
'use strict';

const NEWS = [
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
