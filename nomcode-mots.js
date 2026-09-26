/* Nom de code — les mots de la grille, chacun rangé dans un ou plusieurs thèmes.
   Les thèmes servent aux robots : un robot espion cherche un thème qui relie plusieurs de ses mots sans
   toucher l'assassin, et donne le nom du thème comme indice ; un robot agent retourne les mots du thème
   annoncé. Le nom d'un thème n'est jamais un mot de la grille. */

'use strict';

const NC_THEMES = {
  mer: 'Océan', espace: 'Cosmos', cuisine: 'Gourmandise', sport: 'Stade', musique: 'Mélodie', cinema: 'Écran', ecole: 'Cartable',
  maison: 'Foyer', nature: 'Verdure', meteo: 'Climat', transport: 'Trajet', metier: 'Boulot', corps: 'Anatomie', vetement: 'Garde-robe',
  fete: 'Célébration', histoire: 'Passé', magie: 'Sortilège', techno: 'Numérique', jeu: 'Divertissement', argent: 'Richesse',
  voyage: 'Évasion', ferme: 'Campagne', montagne: 'Altitude', ville: 'Urbain', science: 'Laboratoire', guerre: 'Bataille',
  amour: 'Romance', nuit: 'Obscurité', royaume: 'Couronne', eau: 'Liquide', feu: 'Flamme', animal: 'Faune', danger: 'Péril', froid: 'Glacial',
};

const NC_WORDS = [
  ['Baleine', 'mer animal'], ['Requin', 'mer animal danger'], ['Corail', 'mer nature'], ['Pirate', 'mer histoire'], ['Sirène', 'mer magie'],
  ['Ancre', 'mer transport'], ['Phare', 'mer'], ['Vague', 'mer eau'], ['Plage', 'mer voyage'], ['Sable', 'mer'], ['Crabe', 'mer animal cuisine'],
  ['Perle', 'mer argent'], ['Épave', 'mer histoire'], ['Fusée', 'espace transport techno'], ['Étoile', 'espace nuit'], ['Lune', 'espace nuit'],
  ['Planète', 'espace science'], ['Comète', 'espace'], ['Astronaute', 'espace metier'], ['Satellite', 'espace techno'], ['Martien', 'espace magie'],
  ['Galaxie', 'espace'], ['Télescope', 'espace science'], ['Gâteau', 'cuisine fete'], ['Chocolat', 'cuisine'], ['Fromage', 'cuisine ferme'],
  ['Baguette', 'cuisine magie'], ['Crêpe', 'cuisine fete'], ['Soupe', 'cuisine'], ['Poivre', 'cuisine'], ['Miel', 'cuisine animal nature'],
  ['Pomme', 'cuisine nature'], ['Carotte', 'cuisine ferme'], ['Œuf', 'cuisine ferme'], ['Four', 'cuisine maison feu'], ['Chef', 'cuisine metier'],
  ['Sucre', 'cuisine'], ['Ballon', 'sport jeu fete'], ['Arbitre', 'sport metier'], ['Médaille', 'sport argent'], ['Raquette', 'sport'],
  ['Piscine', 'sport eau'], ['Marathon', 'sport'], ['Filet', 'sport mer'], ['Vélo', 'sport transport'], ['Ski', 'sport montagne froid'],
  ['Guitare', 'musique'], ['Piano', 'musique maison'], ['Tambour', 'musique guerre'], ['Concert', 'musique fete'], ['Opéra', 'musique'],
  ['Trompette', 'musique'], ['Disque', 'musique techno'], ['Chorale', 'musique'], ['Acteur', 'cinema metier'], ['Oscar', 'cinema'],
  ['Popcorn', 'cinema cuisine'], ['Caméra', 'cinema techno'], ['Zombie', 'cinema danger nuit'], ['Vampire', 'cinema nuit magie'], ['Vedette', 'cinema'],
  ['Craie', 'ecole'], ['Règle', 'ecole jeu'], ['Cahier', 'ecole'], ['Récré', 'ecole jeu'], ['Dictée', 'ecole'], ['Maîtresse', 'ecole metier amour'],
  ['Gomme', 'ecole'], ['Canapé', 'maison'], ['Clé', 'maison argent'], ['Fenêtre', 'maison'], ['Cheminée', 'maison feu fete'], ['Lit', 'maison nuit'],
  ['Miroir', 'maison magie'], ['Aspirateur', 'maison techno'], ['Toit', 'maison ville'], ['Arbre', 'nature'], ['Fleur', 'nature amour'],
  ['Champignon', 'nature cuisine magie'], ['Rivière', 'nature eau'], ['Volcan', 'nature feu danger'], ['Grotte', 'nature montagne nuit'],
  ['Feuille', 'nature ecole'], ['Rocher', 'nature montagne mer'], ['Nuage', 'meteo'], ['Orage', 'meteo danger'], ['Neige', 'meteo froid montagne'],
  ['Arc-en-ciel', 'meteo magie'], ['Tornade', 'meteo danger'], ['Soleil', 'meteo espace feu'], ['Grêle', 'meteo froid'], ['Train', 'transport voyage'],
  ['Avion', 'transport voyage'], ['Métro', 'transport ville'], ['Taxi', 'transport ville metier'], ['Bateau', 'transport mer'], ['Tracteur', 'transport ferme'],
  ['Pneu', 'transport'], ['Pompier', 'metier feu danger'], ['Policier', 'metier ville'], ['Médecin', 'metier corps'], ['Boulanger', 'metier cuisine'],
  ['Facteur', 'metier'], ['Espion', 'metier danger histoire'], ['Juge', 'metier'], ['Cœur', 'corps amour'], ['Dent', 'corps'], ['Os', 'corps histoire'],
  ['Nez', 'corps'], ['Main', 'corps'], ['Cerveau', 'corps science'], ['Sang', 'corps danger'], ['Chapeau', 'vetement magie'], ['Écharpe', 'vetement froid'],
  ['Botte', 'vetement ferme'], ['Cravate', 'vetement metier'], ['Pyjama', 'vetement nuit'], ['Masque', 'vetement fete cinema'], ['Gant', 'vetement froid'],
  ['Bougie', 'fete feu nuit'], ['Cadeau', 'fete amour'], ['Guirlande', 'fete'], ['Confetti', 'fete'], ['Champagne', 'fete cuisine argent'],
  ['Château', 'histoire royaume'], ['Chevalier', 'histoire royaume guerre'], ['Pyramide', 'histoire voyage'], ['Momie', 'histoire danger cinema'],
  ['Dinosaure', 'histoire animal'], ['Gladiateur', 'histoire guerre sport'], ['Viking', 'histoire mer guerre'], ['Sorcière', 'magie nuit'],
  ['Dragon', 'magie royaume feu'], ['Fée', 'magie nature'], ['Potion', 'magie science'], ['Licorne', 'magie animal'], ['Grimoire', 'magie ecole'],
  ['Fantôme', 'magie nuit'], ['Robot', 'techno science'], ['Clavier', 'techno musique'], ['Souris', 'techno animal maison'], ['Antenne', 'techno espace'],
  ['Pile', 'techno'], ['Dé', 'jeu'], ['Carte', 'jeu voyage'], ['Puzzle', 'jeu'], ['Poupée', 'jeu maison'], ['Échecs', 'jeu royaume guerre'],
  ['Toupie', 'jeu'], ['Banque', 'argent ville'], ['Coffre', 'argent mer'], ['Or', 'argent royaume'], ['Trésor', 'argent mer histoire'],
  ['Pièce', 'argent maison jeu'], ['Diamant', 'argent royaume'], ['Valise', 'voyage'], ['Passeport', 'voyage'], ['Boussole', 'voyage science mer'],
  ['Tente', 'voyage nature montagne'], ['Hôtel', 'voyage ville'], ['Cochon', 'ferme animal cuisine'], ['Vache', 'ferme animal'], ['Poule', 'ferme animal'],
  ['Foin', 'ferme'], ['Grange', 'ferme maison'], ['Sommet', 'montagne'], ['Chalet', 'montagne maison froid'], ['Marmotte', 'montagne animal froid'],
  ['Alpiniste', 'montagne sport'], ['Immeuble', 'ville maison'], ['Parc', 'ville nature jeu'], ['Pont', 'ville eau transport'], ['Musée', 'ville histoire'],
  ['Microscope', 'science'], ['Atome', 'science'], ['Aimant', 'science'], ['Formule', 'science ecole magie'], ['Canon', 'guerre mer histoire'],
  ['Bouclier', 'guerre royaume'], ['Armure', 'guerre royaume histoire'], ['Flèche', 'guerre sport'], ['Bisou', 'amour'], ['Mariage', 'amour fete'],
  ['Rose', 'amour nature'], ['Lettre', 'amour ecole'], ['Hibou', 'nuit animal magie'], ['Rêve', 'nuit'], ['Loup', 'nuit animal danger'],
  ['Cauchemar', 'nuit danger'], ['Roi', 'royaume'], ['Reine', 'royaume jeu'], ['Princesse', 'royaume magie'], ['Trône', 'royaume'],
  ['Glaçon', 'eau froid cuisine'], ['Pingouin', 'froid animal mer'], ['Igloo', 'froid maison'], ['Allumette', 'feu'], ['Lave', 'feu danger'],
  ['Lion', 'animal danger royaume'], ['Singe', 'animal'], ['Serpent', 'animal danger'], ['Abeille', 'animal nature'], ['Kangourou', 'animal voyage'],
  ['Papillon', 'animal nature'], ['Poison', 'danger magie'], ['Bombe', 'danger guerre'], ['Piège', 'danger jeu'], ['Cascade', 'eau nature montagne'],
  ['Pluie', 'meteo eau'], ['Glacier', 'froid montagne eau'], ['Sauna', 'eau feu maison'], ['Radeau', 'mer transport'], ['Gondole', 'eau voyage transport'],
];
