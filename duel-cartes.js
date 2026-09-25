/* Duel des Cités — le contenu : cartes des trois âges, guildes, merveilles et jetons progrès.
   Noms et réglages écrits pour la Boîte à jeux.

   Ressources : B bois, A argile, P pierre, V verre, Y papyrus. Un coût s'écrit en lettres, plus un
   nombre de pièces (« PPA2 » = deux pierres, une argile et deux pièces).
   Champs d'une carte : n nom, a âge (4 = guilde), t couleur, c coût, p production fixe, ch production au
   choix, tr ressources achetées à 1 pièce, vp points, sh boucliers, sci symbole, co pièces, per/pc pièces
   par carte d'une couleur, cf enchaînement depuis, ct enchaînement vers, g guilde. */

'use strict';

const DU_CARDS = [
  // ------------------------------------------------ âge I
  { n: 'Scierie', a: 1, t: 'brun', c: '', p: 'B' },
  { n: 'Camp de bûcherons', a: 1, t: 'brun', c: '1', p: 'B' },
  { n: 'Bassin d’argile', a: 1, t: 'brun', c: '', p: 'A' },
  { n: 'Glaisière', a: 1, t: 'brun', c: '1', p: 'A' },
  { n: 'Carrière', a: 1, t: 'brun', c: '', p: 'P' },
  { n: 'Taille de pierre', a: 1, t: 'brun', c: '1', p: 'P' },
  { n: 'Verrerie', a: 1, t: 'gris', c: '1', p: 'V' },
  { n: 'Presse à papyrus', a: 1, t: 'gris', c: '1', p: 'Y' },
  { n: 'Théâtre', a: 1, t: 'bleu', c: '', vp: 3, ct: 'masque' },
  { n: 'Autel', a: 1, t: 'bleu', c: '', vp: 3, ct: 'lune' },
  { n: 'Bains', a: 1, t: 'bleu', c: 'P', vp: 3, ct: 'goutte' },
  { n: 'Apothicaire', a: 1, t: 'vert', c: 'V', vp: 1, sci: 'roue' },
  { n: 'Atelier', a: 1, t: 'vert', c: 'Y', vp: 1, sci: 'compas' },
  { n: 'Scriptorium', a: 1, t: 'vert', c: '2', sci: 'plume', ct: 'livre' },
  { n: 'Officine', a: 1, t: 'vert', c: '2', sci: 'pilon', ct: 'engrenage' },
  { n: 'Écurie', a: 1, t: 'rouge', c: 'B', sh: 1, ct: 'fer' },
  { n: 'Garnison', a: 1, t: 'rouge', c: 'A', sh: 1, ct: 'epee' },
  { n: 'Palissade', a: 1, t: 'rouge', c: '2', sh: 1, ct: 'tour' },
  { n: 'Tour de guet', a: 1, t: 'rouge', c: '', sh: 1 },
  { n: 'Taverne', a: 1, t: 'jaune', c: '', co: 4, ct: 'jarre' },
  { n: 'Dépôt de pierre', a: 1, t: 'jaune', c: '3', tr: 'P' },
  { n: 'Dépôt d’argile', a: 1, t: 'jaune', c: '3', tr: 'A' },
  { n: 'Dépôt de bois', a: 1, t: 'jaune', c: '3', tr: 'B' },
  // ------------------------------------------------ âge II
  { n: 'Grande scierie', a: 2, t: 'brun', c: '2', p: 'BB' },
  { n: 'Briqueterie', a: 2, t: 'brun', c: '2', p: 'AA' },
  { n: 'Carrière profonde', a: 2, t: 'brun', c: '2', p: 'PP' },
  { n: 'Soufflerie', a: 2, t: 'gris', c: '', p: 'V' },
  { n: 'Séchoir à papyrus', a: 2, t: 'gris', c: '', p: 'Y' },
  { n: 'Tribunal', a: 2, t: 'bleu', c: 'BBV', vp: 5 },
  { n: 'Statue', a: 2, t: 'bleu', c: 'AA', vp: 4, cf: 'masque', ct: 'pilier' },
  { n: 'Temple', a: 2, t: 'bleu', c: 'BY', vp: 4, cf: 'lune', ct: 'soleil' },
  { n: 'Aqueduc', a: 2, t: 'bleu', c: 'PPP', vp: 5, cf: 'goutte' },
  { n: 'Tribune', a: 2, t: 'bleu', c: 'PB', vp: 4, ct: 'fronton' },
  { n: 'Dispensaire', a: 2, t: 'vert', c: 'AAP', vp: 2, sci: 'pilon', cf: 'engrenage' },
  { n: 'Laboratoire', a: 2, t: 'vert', c: 'BVV', vp: 1, sci: 'compas', ct: 'lampe' },
  { n: 'École', a: 2, t: 'vert', c: 'BYY', vp: 1, sci: 'roue', ct: 'harpe' },
  { n: 'Bibliothèque', a: 2, t: 'vert', c: 'PBV', vp: 2, sci: 'plume', cf: 'livre' },
  { n: 'Haras', a: 2, t: 'rouge', c: 'AB', sh: 1, cf: 'fer' },
  { n: 'Caserne', a: 2, t: 'rouge', c: '3', sh: 1, cf: 'epee' },
  { n: 'Champ de tir', a: 2, t: 'rouge', c: 'PBY', sh: 2, ct: 'cible' },
  { n: 'Place d’armes', a: 2, t: 'rouge', c: 'AAV', sh: 2, ct: 'casque' },
  { n: 'Muraille', a: 2, t: 'rouge', c: 'PP', sh: 2 },
  { n: 'Forum', a: 2, t: 'jaune', c: 'A3', ch: 'VY' },
  { n: 'Caravansérail', a: 2, t: 'jaune', c: 'VY2', ch: 'BAP' },
  { n: 'Douane', a: 2, t: 'jaune', c: '4', tr: 'VY' },
  { n: 'Brasserie', a: 2, t: 'jaune', c: '', co: 6, ct: 'baril' },
  // ------------------------------------------------ âge III
  { n: 'Sénat', a: 3, t: 'bleu', c: 'AAPY', vp: 5, cf: 'fronton' },
  { n: 'Obélisque', a: 3, t: 'bleu', c: 'PPV', vp: 5 },
  { n: 'Jardins', a: 3, t: 'bleu', c: 'AABB', vp: 6, cf: 'pilier' },
  { n: 'Panthéon', a: 3, t: 'bleu', c: 'ABYY', vp: 6, cf: 'soleil' },
  { n: 'Hôtel de ville', a: 3, t: 'bleu', c: 'PPPBB', vp: 7 },
  { n: 'Palais', a: 3, t: 'bleu', c: 'APBVV', vp: 7 },
  { n: 'Académie', a: 3, t: 'vert', c: 'PBVV', vp: 3, sci: 'sablier' },
  { n: 'Cabinet d’étude', a: 3, t: 'vert', c: 'BBVY', vp: 3, sci: 'sablier' },
  { n: 'Université', a: 3, t: 'vert', c: 'AVY', vp: 2, sci: 'globe', cf: 'harpe' },
  { n: 'Observatoire', a: 3, t: 'vert', c: 'PYY', vp: 2, sci: 'globe', cf: 'lampe' },
  { n: 'Fortifications', a: 3, t: 'rouge', c: 'PPAY', sh: 2, cf: 'tour' },
  { n: 'Atelier de siège', a: 3, t: 'rouge', c: 'BBBV', sh: 2, cf: 'cible' },
  { n: 'Cirque', a: 3, t: 'rouge', c: 'AAPP', sh: 2, cf: 'casque' },
  { n: 'Arsenal', a: 3, t: 'rouge', c: 'AAABB', sh: 3 },
  { n: 'Prétoire', a: 3, t: 'rouge', c: '8', sh: 3 },
  { n: 'Chambre de commerce', a: 3, t: 'jaune', c: 'YY', vp: 3, per: 'gris', pc: 3 },
  { n: 'Port', a: 3, t: 'jaune', c: 'BVY', vp: 3, per: 'brun', pc: 2 },
  { n: 'Armurerie', a: 3, t: 'jaune', c: 'PPV', vp: 3, per: 'rouge', pc: 1 },
  { n: 'Phare', a: 3, t: 'jaune', c: 'AAV', vp: 3, per: 'jaune', pc: 1, cf: 'jarre' },
  { n: 'Arène', a: 3, t: 'jaune', c: 'APB', vp: 3, per: 'merveille', pc: 2, cf: 'baril' },
  // ------------------------------------------------ guildes (3 tirées au hasard à l'âge III)
  { n: 'Guilde des bâtisseurs', a: 4, t: 'violet', c: 'PPAYV', g: 'batisseurs' },
  { n: 'Guilde des prêteurs', a: 4, t: 'violet', c: 'PPBB', g: 'preteurs' },
  { n: 'Guilde des savants', a: 4, t: 'violet', c: 'AABB', g: 'vert' },
  { n: 'Guilde des armateurs', a: 4, t: 'violet', c: 'APVY', g: 'brungris' },
  { n: 'Guilde des marchands', a: 4, t: 'violet', c: 'ABVY', g: 'jaune' },
  { n: 'Guilde des magistrats', a: 4, t: 'violet', c: 'BBAY', g: 'bleu' },
  { n: 'Guilde des tacticiens', a: 4, t: 'violet', c: 'PPAY', g: 'rouge' },
];

const DU_WONDERS = [
  { n: 'Voie royale', c: 'PPAAY', vp: 3, co: 3, lose: 3, replay: true },
  { n: 'Grand Cirque', c: 'PPBV', vp: 3, sh: 1, destroy: 'gris' },
  { n: 'Colosse', c: 'AAAV', vp: 3, sh: 2 },
  { n: 'Grande Bibliothèque', c: 'BBBVY', vp: 4, library: true },
  { n: 'Grand Phare', c: 'BPYY', vp: 4, ch: 'BAP' },
  { n: 'Jardins suspendus', c: 'BBVY', vp: 3, co: 6, replay: true },
  { n: 'Mausolée', c: 'AAVVY', vp: 2, revive: true },
  { n: 'Port d’Athènes', c: 'BBPA', vp: 2, ch: 'VY', replay: true },
  { n: 'Pyramides', c: 'PPPY', vp: 9 },
  { n: 'Sphinx', c: 'PAVV', vp: 6, replay: true },
  { n: 'Statue colossale', c: 'PBAYY', vp: 3, sh: 1, destroy: 'brun' },
  { n: 'Temple de la Lune', c: 'BPVY', co: 12, replay: true },
];

const DU_TOKENS = [
  { k: 'agri', n: 'Agriculture', i: '🌾', d: '+6 pièces tout de suite et 4 points.' },
  { k: 'archi', n: 'Architecture', i: '📏', d: 'Tes merveilles coûtent 2 ressources de moins.' },
  { k: 'eco', n: 'Économie', i: '💰', d: 'L’argent que ton adversaire dépense en achats de ressources te revient.' },
  { k: 'loi', n: 'Loi', i: '⚖️', d: 'Compte comme un symbole scientifique de plus.' },
  { k: 'macon', n: 'Maçonnerie', i: '🧱', d: 'Tes bâtiments bleus coûtent 2 ressources de moins.' },
  { k: 'math', n: 'Mathématiques', i: '➗', d: '3 points par jeton progrès que tu possèdes, celui-ci compris.' },
  { k: 'philo', n: 'Philosophie', i: '🦉', d: '7 points.' },
  { k: 'strat', n: 'Stratégie', i: '♟️', d: 'Chaque bâtiment rouge construit ensuite donne 1 bouclier de plus.' },
  { k: 'theo', n: 'Théologie', i: '🕊️', d: 'Tes prochaines merveilles te font toutes rejouer.' },
  { k: 'urba', n: 'Urbanisme', i: '🏙️', d: '+6 pièces tout de suite, puis +4 à chaque construction gratuite par enchaînement.' },
];
