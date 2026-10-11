/* Undercover — chacun reçoit un mot secret, un ou plusieurs intrus ont un mot voisin,
   Mister White n'en a pas. Indices à voix haute, vote sur le téléphone.

   Même modèle que Sablier : la salle vit chez l'hôte (net.game.uc), chaque joueur reçoit
   une vue filtrée (Undercover.view) où seul SON mot apparaît. Les actions arrivent en
   messages « uc:… » et passent par Undercover.act. Chargé après app.js et sablier-ui.js :
   réutilise $, el, act, esc, norm et shuffle. */

'use strict';

const Undercover = (() => {
  // Paires de mots voisins : assez proches pour que l'intrus ne se doute de rien,
  // assez différents pour que ses indices finissent par détonner.
  const PAIRS = [
    ['Café', 'Thé'], ['Plage', 'Piscine'], ['Pizza', 'Quiche'], ['Chat', 'Lapin'], ['Train', 'Métro'],
    ['Avion', 'Hélicoptère'], ['Vélo', 'Trottinette'], ['Ski', 'Snowboard'], ['Football', 'Rugby'], ['Tennis', 'Badminton'],
    ['Guitare', 'Violon'], ['Piano', 'Accordéon'], ['Lune', 'Soleil'], ['Mer', 'Lac'], ['Montagne', 'Colline'],
    ['Forêt', 'Jungle'], ['Désert', 'Savane'], ['Neige', 'Grêle'], ['Orage', 'Tempête'], ['Pluie', 'Brouillard'],
    ['Pomme', 'Poire'], ['Orange', 'Mandarine'], ['Fraise', 'Framboise'], ['Citron', 'Pamplemousse'], ['Banane', 'Mangue'],
    ['Carotte', 'Radis'], ['Tomate', 'Poivron'], ['Pâtes', 'Riz'], ['Frites', 'Chips'], ['Burger', 'Kebab'],
    ['Sushi', 'Maki'], ['Croissant', 'Pain au chocolat'], ['Crêpe', 'Gaufre'], ['Glace', 'Sorbet'], ['Chocolat', 'Caramel'],
    ['Fromage', 'Beurre'], ['Vin', 'Champagne'], ['Bière', 'Cidre'], ['Jus d\'orange', 'Limonade'], ['Lait', 'Yaourt'],
    ['Médecin', 'Infirmier'], ['Pompier', 'Policier'], ['Boulanger', 'Pâtissier'], ['Professeur', 'Directeur'], ['Pilote', 'Hôtesse de l\'air'],
    ['Cuisinier', 'Serveur'], ['Coiffeur', 'Barbier'], ['Avocat', 'Juge'], ['Plombier', 'Électricien'], ['Facteur', 'Livreur'],
    ['Château', 'Palais'], ['Église', 'Cathédrale'], ['Hôpital', 'Clinique'], ['Musée', 'Galerie'], ['Cinéma', 'Théâtre'],
    ['Bibliothèque', 'Librairie'], ['Supermarché', 'Marché'], ['Restaurant', 'Cantine'], ['Hôtel', 'Camping'], ['Aéroport', 'Gare'],
    ['Stylo', 'Crayon'], ['Cahier', 'Carnet'], ['Ciseaux', 'Cutter'], ['Téléphone', 'Tablette'], ['Ordinateur', 'Télévision'],
    ['Clavier', 'Souris'], ['Montre', 'Réveil'], ['Lunettes', 'Lentilles'], ['Parapluie', 'Imperméable'], ['Chapeau', 'Casquette'],
    ['Écharpe', 'Cravate'], ['Chaussettes', 'Collants'], ['Baskets', 'Sandales'], ['Jean', 'Short'], ['Pull', 'Sweat'],
    ['Lit', 'Canapé'], ['Chaise', 'Tabouret'], ['Table', 'Bureau'], ['Lampe', 'Bougie'], ['Miroir', 'Fenêtre'],
    ['Douche', 'Baignoire'], ['Brosse à dents', 'Peigne'], ['Savon', 'Shampoing'], ['Four', 'Micro-ondes'], ['Frigo', 'Congélateur'],
    ['Fourchette', 'Cuillère'], ['Assiette', 'Bol'], ['Verre', 'Tasse'], ['Casserole', 'Poêle'], ['Couteau', 'Épée'],
    ['Lion', 'Tigre'], ['Loup', 'Renard'], ['Ours', 'Panda'], ['Dauphin', 'Requin'], ['Baleine', 'Orque'],
    ['Aigle', 'Faucon'], ['Pingouin', 'Manchot'], ['Abeille', 'Guêpe'], ['Papillon', 'Libellule'], ['Serpent', 'Lézard'],
    ['Cheval', 'Âne'], ['Vache', 'Mouton'], ['Poule', 'Canard'], ['Hamster', "Cochon d'Inde"], ['Grenouille', 'Crapaud'],
    ['Noël', 'Nouvel An'], ['Anniversaire', 'Mariage'], ['Halloween', 'Carnaval'], ['Pâques', 'Chandeleur'], ['Vacances', 'Week-end'],
    ['Harry Potter', 'Le Seigneur des anneaux'], ['Star Wars', 'Star Trek'], ['Batman', 'Superman'], ['Spider-Man', 'Iron Man'], ['Mario', 'Sonic'],
    ['Pokémon', 'Digimon'], ['Astérix', 'Tintin'], ['Blanche-Neige', 'Cendrillon'], ['Le Roi Lion', 'Le Livre de la jungle'], ['Titanic', 'Avatar'],
    ['Netflix', 'YouTube'], ['Instagram', 'TikTok'], ['WhatsApp', 'SMS'], ['Google', 'Wikipédia'], ['Spotify', 'Radio'],
    ['Paris', 'Londres'], ['New York', 'Los Angeles'], ['Rome', 'Venise'], ['Espagne', 'Portugal'], ['Japon', 'Chine'],
    ['Tour Eiffel', 'Arc de triomphe'], ['Pyramides', 'Sphinx'], ['Volcan', 'Geyser'], ['Île', 'Presqu\'île'], ['Rivière', 'Cascade'],
    ['Roi', 'Président'], ['Prince', 'Chevalier'], ['Pirate', 'Viking'], ['Sorcière', 'Fée'], ['Vampire', 'Zombie'],
    ['Fantôme', 'Squelette'], ['Dragon', 'Licorne'], ['Robot', 'Extraterrestre'], ['Ninja', 'Samouraï'], ['Cowboy', 'Shérif'],
    ['Échecs', 'Dames'], ['Cartes', 'Dés'], ['Puzzle', 'Lego'], ['Poupée', 'Peluche'], ['Ballon', 'Frisbee'],
    ['Bateau', 'Sous-marin'], ['Voiture', 'Camion'], ['Moto', 'Scooter'], ['Bus', 'Tramway'], ['Fusée', 'Satellite'],
    ['Réunion', 'Visio'], ['Tableur', 'Présentation'], ['Email', 'Courrier'], ['Imprimante', 'Scanner'], ['Pause café', 'Pause déjeuner'],
    ['Karaoké', 'Boîte de nuit'], ['Concert', 'Festival'], ['Pique-nique', 'Barbecue'], ['Zoo', 'Aquarium'], ['Parc d\'attractions', 'Fête foraine'],
    ['Yoga', 'Pilates'], ['Natation', 'Plongée'], ['Boxe', 'Judo'], ['Course à pied', 'Marche'], ['Escalade', 'Randonnée'],
    ['Miel', 'Confiture'], ['Sel', 'Poivre'], ['Ketchup', 'Moutarde'], ['Popcorn', 'Barbe à papa'], ['Bonbon', 'Chewing-gum'],
    // octobre 2026 : 583 paires de plus. Toujours ajouter à la fin : l'ancienne mémoire des téléphones (numéros de paires) est convertie au premier lancement.
    ['Raclette', 'Fondue'], ['Tartiflette', 'Gratin dauphinois'], ['Couscous', 'Paella'], ['Lasagnes', 'Cannellonis'], ['Ravioli', 'Gnocchi'],
    ['Spaghetti', 'Tagliatelles'], ['Hot-dog', 'Sandwich'], ['Tacos', 'Burrito'], ['Nems', 'Rouleaux de printemps'], ['Soupe', 'Velouté'],
    ['Omelette', 'Œuf au plat'], ['Steak', 'Côtelette'], ['Saucisson', 'Jambon'], ['Poulet rôti', 'Dinde'], ['Saumon', 'Thon'],
    ['Moules', 'Huîtres'], ['Crevette', 'Homard'], ['Camembert', 'Brie'], ['Comté', 'Emmental'], ['Baguette', 'Pain de mie'],
    ['Brioche', 'Pain au lait'], ['Éclair', 'Religieuse'], ['Macaron', 'Meringue'], ['Tarte aux pommes', 'Clafoutis'], ['Mousse au chocolat', 'Crème brûlée'],
    ['Tiramisu', 'Panna cotta'], ['Cookie', 'Brownie'], ['Muffin', 'Cupcake'], ['Donut', 'Beignet'], ['Chantilly', 'Crème fraîche'],
    ['Nutella', 'Spéculoos'], ['Céréales', 'Muesli'], ['Biscotte', 'Pain grillé'], ['Mayonnaise', 'Aïoli'], ['Vinaigrette', 'Sauce soja'],
    ['Cornichon', 'Oignon grelot'], ['Olive', 'Câpre'], ['Avocat', 'Concombre'], ['Courgette', 'Aubergine'], ['Brocoli', 'Chou-fleur'],
    ['Petits pois', 'Haricots verts'], ['Champignon', 'Truffe'], ['Ail', 'Oignon'], ['Persil', 'Basilic'], ['Cannelle', 'Vanille'],
    ['Sucre', 'Édulcorant'], ['Farine', 'Levure'], ['Pastèque', 'Melon'], ['Ananas', 'Noix de coco'], ['Kiwi', 'Citron vert'],
    ['Cerise', 'Prune'], ['Abricot', 'Pêche'], ['Raisin', 'Myrtille'], ['Noisette', 'Amande'], ['Cacahuète', 'Pistache'],
    ['Châtaigne', 'Marron'], ['Café crème', 'Cappuccino'], ['Expresso', 'Café allongé'], ['Chocolat chaud', 'Lait fraise'], ['Smoothie', 'Milkshake'],
    ['Coca', 'Orangina'], ['Eau gazeuse', 'Eau plate'], ['Mojito', 'Piña colada'], ['Sangria', 'Punch'], ['Rosé', 'Vin blanc'],
    ['Whisky', 'Rhum'], ['Apéro', 'Goûter'], ['Petit-déjeuner', 'Brunch'], ['Dîner', 'Déjeuner'], ['Buffet', 'Self-service'],
    ['Food truck', 'Friterie'], ['Boulangerie', 'Épicerie'], ['Pizzeria', 'Crêperie'], ['Salon', 'Salle à manger'], ['Chambre', 'Bureau'],
    ['Cave', 'Grenier'], ['Garage', 'Abri de jardin'], ['Balcon', 'Terrasse'], ['Jardin', 'Potager'], ['Couloir', 'Escalier'],
    ['Ascenseur', 'Escalator'], ['Porte', 'Portail'], ['Volet', 'Rideau'], ['Tapis', 'Moquette'], ['Coussin', 'Oreiller'],
    ['Couette', 'Plaid'], ['Armoire', 'Commode'], ['Étagère', 'Placard'], ['Lavabo', 'Évier'], ['Robinet', 'Pommeau de douche'],
    ['Lave-linge', 'Sèche-linge'], ['Lave-vaisselle', 'Égouttoir'], ['Aspirateur', 'Balai'], ['Serpillière', 'Éponge'], ['Poubelle', 'Composteur'],
    ['Fer à repasser', 'Défroisseur'], ['Grille-pain', 'Gaufrier'], ['Bouilloire', 'Cafetière'], ['Mixeur', 'Robot pâtissier'], ['Cocotte-minute', 'Faitout'],
    ['Saladier', 'Plat à gratin'], ['Louche', 'Spatule'], ['Passoire', 'Tamis'], ['Ouvre-boîte', 'Tire-bouchon'], ['Radiateur', 'Cheminée'],
    ['Ventilateur', 'Climatisation'], ['Ampoule', 'Lampe de poche'], ['Interrupteur', 'Prise électrique'], ['Sonnette', 'Interphone'], ['Clé', 'Badge'],
    ['Boîte aux lettres', 'Colis'], ['Paillasson', 'Tapis de bain'], ['Cintre', 'Porte-manteau'], ['Alarme', 'Détecteur de fumée'], ['Hamac', 'Transat'],
    ['Piscine gonflable', 'Pataugeoire'], ['Tondeuse', 'Débroussailleuse'], ['Arrosoir', 'Tuyau d\'arrosage'], ['Brouette', 'Chariot'], ['Robe', 'Jupe'],
    ['Chemise', 'Polo'], ['T-shirt', 'Débardeur'], ['Manteau', 'Doudoune'], ['Veste', 'Blazer'], ['Pyjama', 'Peignoir'],
    ['Maillot de bain', 'Bikini'], ['Bottes', 'Bottines'], ['Talons', 'Ballerines'], ['Tongs', 'Claquettes'], ['Pantoufles', 'Chaussons'],
    ['Gants', 'Moufles'], ['Bonnet', 'Béret'], ['Ceinture', 'Bretelles'], ['Nœud papillon', 'Cravate'], ['Sac à dos', 'Valise'],
    ['Sac à main', 'Pochette'], ['Portefeuille', 'Porte-monnaie'], ['Bague', 'Bracelet'], ['Collier', 'Pendentif'], ['Boucles d\'oreilles', 'Piercing'],
    ['Montre connectée', 'Bracelet de sport'], ['Parfum', 'Déodorant'], ['Rouge à lèvres', 'Mascara'], ['Vernis à ongles', 'Faux ongles'], ['Crème solaire', 'Après-soleil'],
    ['Rasoir', 'Tondeuse à barbe'], ['Sèche-cheveux', 'Lisseur'], ['Dentifrice', 'Bain de bouche'], ['Mouchoir', 'Serviette'], ['Écouteurs', 'Casque audio'],
    ['Enceinte', 'Radio-réveil'], ['Chargeur', 'Batterie externe'], ['Clé USB', 'Disque dur'], ['Appareil photo', 'Caméra'], ['Selfie', 'Photo de groupe'],
    ['Console', 'Arcade'], ['Manette', 'Joystick'], ['Télécommande', 'Clavier sans fil'], ['Agenda', 'Calendrier'], ['Post-it', 'Bloc-notes'],
    ['Trombone', 'Agrafe'], ['Colle', 'Scotch'], ['Gomme', 'Correcteur'], ['Règle', 'Équerre'], ['Compas', 'Rapporteur'],
    ['Cartable', 'Trousse'], ['Tableau noir', 'Tableau blanc'], ['Feutre', 'Surligneur'], ['Pinceau', 'Rouleau de peinture'], ['Marteau', 'Tournevis'],
    ['Perceuse', 'Visseuse'], ['Clou', 'Vis'], ['Scie', 'Hache'], ['Échelle', 'Escabeau'], ['Corde', 'Ficelle'],
    ['Cadenas', 'Antivol'], ['Boussole', 'GPS'], ['Jumelles', 'Longue-vue'], ['Loupe', 'Microscope'], ['Thermomètre', 'Baromètre'],
    ['Plage de sable', 'Plage de galets'], ['Mer Méditerranée', 'Océan Atlantique'], ['Phare', 'Port'], ['Bateau-mouche', 'Péniche'], ['Voilier', 'Catamaran'],
    ['Kayak', 'Canoë'], ['Paddle', 'Planche de surf'], ['Croisière', 'Ferry'], ['Aéroport', 'Héliport'], ['Hôtel', 'Auberge de jeunesse'],
    ['Gîte', 'Chambre d\'hôtes'], ['Tente', 'Camping-car'], ['Caravane', 'Mobile-home'], ['Refuge', 'Chalet'], ['Station de ski', 'Station balnéaire'],
    ['Télésiège', 'Téléphérique'], ['Luge', 'Raquettes'], ['Igloo', 'Cabane'], ['Grotte', 'Tunnel'], ['Pont', 'Viaduc'],
    ['Autoroute', 'Nationale'], ['Rond-point', 'Carrefour'], ['Feu rouge', 'Stop'], ['Parking', 'Garage souterrain'], ['Station-service', 'Borne de recharge'],
    ['Péage', 'Douane'], ['Passeport', 'Carte d\'identité'], ['Billet de train', 'Ticket de métro'], ['Valise cabine', 'Bagage en soute'], ['Carte postale', 'Souvenir'],
    ['Musée du Louvre', 'Musée d\'Orsay'], ['Mont-Saint-Michel', 'Château de Versailles'], ['Marseille', 'Nice'], ['Lyon', 'Bordeaux'], ['Lille', 'Strasbourg'],
    ['Bretagne', 'Normandie'], ['Alpes', 'Pyrénées'], ['Corse', 'Sardaigne'], ['Belgique', 'Suisse'], ['Allemagne', 'Autriche'],
    ['Italie', 'Grèce'], ['Maroc', 'Tunisie'], ['Canada', 'Québec'], ['États-Unis', 'Mexique'], ['Brésil', 'Argentine'],
    ['Australie', 'Nouvelle-Zélande'], ['Égypte', 'Turquie'], ['Inde', 'Thaïlande'], ['Islande', 'Norvège'], ['Londres', 'Dublin'],
    ['Barcelone', 'Madrid'], ['Berlin', 'Amsterdam'], ['Tokyo', 'Séoul'], ['Miami', 'Hawaï'], ['Disneyland', 'Parc Astérix'],
    ['Big Ben', 'Statue de la Liberté'], ['Colisée', 'Tour de Pise'], ['Muraille de Chine', 'Machu Picchu'], ['Village', 'Hameau'], ['Ville', 'Capitale'],
    ['Banlieue', 'Campagne'], ['Ferme', 'Moulin'], ['Mairie', 'Préfecture'], ['Poste', 'Banque'], ['Pharmacie', 'Laboratoire'],
    ['Commissariat', 'Caserne de pompiers'], ['École', 'Collège'], ['Lycée', 'Université'], ['Crèche', 'Garderie'], ['Stade', 'Gymnase'],
    ['Patinoire', 'Piscine municipale'], ['Salle de sport', 'Dojo'], ['Casino', 'Salle de jeux'], ['Escape game', 'Laser game'], ['Bar', 'Pub'],
    ['Discothèque', 'Bar à karaoké'], ['Cirque', 'Spectacle de magie'], ['Jardin public', 'Square'], ['Fontaine', 'Statue'], ['Chien', 'Loup'],
    ['Chiot', 'Chaton'], ['Souris', 'Rat'], ['Écureuil', 'Hérisson'], ['Lapin de garenne', 'Lièvre'], ['Cerf', 'Chevreuil'],
    ['Sanglier', 'Cochon'], ['Taureau', 'Bison'], ['Chèvre', 'Brebis'], ['Poney', 'Zèbre'], ['Chameau', 'Dromadaire'],
    ['Girafe', 'Okapi'], ['Éléphant', 'Rhinocéros'], ['Hippopotame', 'Crocodile'], ['Gorille', 'Chimpanzé'], ['Singe', 'Lémurien'],
    ['Kangourou', 'Koala'], ['Paresseux', 'Tatou'], ['Panthère', 'Léopard'], ['Guépard', 'Lynx'], ['Ours polaire', 'Phoque'],
    ['Morse', 'Otarie'], ['Pieuvre', 'Calamar'], ['Méduse', 'Étoile de mer'], ['Crabe', 'Langouste'], ['Tortue', 'Iguane'],
    ['Poisson rouge', 'Carpe'], ['Truite', 'Brochet'], ['Hibou', 'Chouette'], ['Corbeau', 'Pie'], ['Pigeon', 'Colombe'],
    ['Moineau', 'Mésange'], ['Perroquet', 'Perruche'], ['Flamant rose', 'Cigogne'], ['Cygne', 'Oie'], ['Paon', 'Faisan'],
    ['Autruche', 'Émeu'], ['Coq', 'Poussin'], ['Coccinelle', 'Scarabée'], ['Fourmi', 'Termite'], ['Moustique', 'Mouche'],
    ['Araignée', 'Scorpion'], ['Escargot', 'Limace'], ['Ver de terre', 'Chenille'], ['Chauve-souris', 'Papillon de nuit'], ['Dinosaure', 'Dragon de Komodo'],
    ['T-Rex', 'Vélociraptor'], ['Mammouth', 'Éléphant d\'Asie'], ['Dentiste', 'Orthodontiste'], ['Vétérinaire', 'Éleveur'], ['Pharmacien', 'Laborantin'],
    ['Chirurgien', 'Anesthésiste'], ['Kiné', 'Ostéopathe'], ['Psychologue', 'Coach'], ['Agriculteur', 'Jardinier'], ['Boucher', 'Charcutier'],
    ['Fromager', 'Crémier'], ['Fleuriste', 'Paysagiste'], ['Architecte', 'Ingénieur'], ['Maçon', 'Charpentier'], ['Menuisier', 'Ébéniste'],
    ['Peintre en bâtiment', 'Tapissier'], ['Mécanicien', 'Garagiste'], ['Chauffeur de taxi', 'Chauffeur VTC'], ['Conducteur de bus', 'Conducteur de train'], ['Capitaine', 'Matelot'],
    ['Astronaute', 'Pilote de chasse'], ['Soldat', 'Gendarme'], ['Détective', 'Espion'], ['Journaliste', 'Photographe'], ['Présentateur télé', 'Animateur radio'],
    ['Acteur', 'Cascadeur'], ['Chanteur', 'Rappeur'], ['DJ', 'Musicien'], ['Danseur', 'Chorégraphe'], ['Écrivain', 'Poète'],
    ['Youtubeur', 'Influenceur'], ['Streamer', 'Joueur pro'], ['Footballeur', 'Arbitre'], ['Entraîneur', 'Capitaine d\'équipe'], ['Maître-nageur', 'Sauveteur'],
    ['Moniteur de ski', 'Guide de montagne'], ['Banquier', 'Comptable'], ['Secrétaire', 'Assistant'], ['Patron', 'Directeur général'], ['Stagiaire', 'Apprenti'],
    ['Vendeur', 'Caissier'], ['Serveur de café', 'Barman'], ['Sommelier', 'Caviste'], ['Chef étoilé', 'Commis'], ['Nounou', 'Baby-sitter'],
    ['Grand-mère', 'Grand-père'], ['Oncle', 'Parrain'], ['Cousin', 'Voisin'], ['Collègue', 'Camarade'], ['Meilleur ami', 'Confident'],
    ['Bébé', 'Enfant'], ['Ado', 'Étudiant'], ['Mariée', 'Témoin'], ['Cinéma en plein air', 'Drive-in'], ['Série', 'Film'],
    ['Dessin animé', 'Film d\'animation'], ['Documentaire', 'Reportage'], ['Téléréalité', 'Jeu télévisé'], ['Podcast', 'Livre audio'], ['Roman', 'Bande dessinée'],
    ['Manga', 'Comics'], ['Magazine', 'Journal'], ['Dictionnaire', 'Encyclopédie'], ['Conte', 'Fable'], ['Poème', 'Chanson'],
    ['Opéra', 'Comédie musicale'], ['Ballet', 'Danse contemporaine'], ['Salsa', 'Tango'], ['Valse', 'Rock\'n\'roll'], ['Hip-hop', 'Breakdance'],
    ['Jazz', 'Blues'], ['Rock', 'Métal'], ['Rap', 'Slam'], ['Techno', 'House'], ['Reggae', 'Ska'],
    ['Batterie', 'Percussions'], ['Trompette', 'Saxophone'], ['Flûte', 'Clarinette'], ['Harpe', 'Lyre'], ['Ukulélé', 'Banjo'],
    ['Guitare électrique', 'Basse'], ['Micro', 'Mégaphone'], ['Peinture', 'Dessin'], ['Sculpture', 'Poterie'], ['Tricot', 'Crochet'],
    ['Couture', 'Broderie'], ['Scrapbooking', 'Collage'], ['Photographie', 'Vidéo'], ['Jardinage', 'Bricolage'], ['Pêche', 'Chasse'],
    ['Camping', 'Bivouac'], ['Jeu de société', 'Jeu de cartes'], ['Monopoly', 'Cluedo'], ['Uno', 'Dobble'], ['Scrabble', 'Boggle'],
    ['Tarot', 'Belote'], ['Poker', 'Blackjack'], ['Loto', 'Bingo'], ['Pétanque', 'Mölkky'], ['Fléchettes', 'Tir à l\'arc'],
    ['Billard', 'Baby-foot'], ['Ping-pong', 'Squash'], ['Toboggan', 'Balançoire'], ['Trampoline', 'Château gonflable'], ['Cerf-volant', 'Drone'],
    ['Bulles de savon', 'Confettis'], ['Handball', 'Volley-ball'], ['Basket', 'Netball'], ['Golf', 'Mini-golf'], ['Hockey', 'Curling'],
    ['Patin à glace', 'Roller'], ['Skateboard', 'Longboard'], ['BMX', 'VTT'], ['Tour de France', 'Marathon'], ['Formule 1', 'Rallye'],
    ['Karting', 'Auto-tamponneuse'], ['Escrime', 'Kendo'], ['Karaté', 'Taekwondo'], ['Lutte', 'Sumo'], ['Aviron', 'Kayak de mer'],
    ['Voile', 'Planche à voile'], ['Surf', 'Bodyboard'], ['Parapente', 'Deltaplane'], ['Saut à l\'élastique', 'Saut en parachute'], ['Plongeon', 'Water-polo'],
    ['Équitation', 'Polo'], ['Gymnastique', 'Danse classique'], ['Musculation', 'CrossFit'], ['Zumba', 'Aérobic'], ['Jeux olympiques', 'Coupe du monde'],
    ['Médaille d\'or', 'Trophée'], ['But', 'Panier'], ['Penalty', 'Coup franc'], ['Carton rouge', 'Carton jaune'], ['Supporter', 'Mascotte'],
    ['Saint-Valentin', 'Fête des mères'], ['Fête de la musique', '14 Juillet'], ['Feu d\'artifice', 'Pétards'], ['Bal', 'Gala'], ['Baptême', 'Communion'],
    ['Fiançailles', 'Enterrement de vie de garçon'], ['Pendaison de crémaillère', 'Soirée pyjama'], ['Surprise-party', 'Boum'], ['Sapin', 'Couronne de l\'Avent'], ['Père Noël', 'Saint Nicolas'],
    ['Bûche', 'Galette des rois'], ['Chocolats de Pâques', 'Œufs peints'], ['Citrouille', 'Courge'], ['Déguisement', 'Masque'], ['Cadeau', 'Surprise'],
    ['Bougie d\'anniversaire', 'Gâteau'], ['Lune de miel', 'Voyage de noces'], ['Rentrée', 'Fin des vacances'], ['Lundi', 'Vendredi'], ['Matin', 'Soir'],
    ['Midi', 'Minuit'], ['Printemps', 'Automne'], ['Été', 'Hiver'], ['Canicule', 'Sécheresse'], ['Arc-en-ciel', 'Aurore boréale'],
    ['Étoile filante', 'Comète'], ['Planète', 'Étoile'], ['Mars', 'Jupiter'], ['Soleil couchant', 'Soleil levant'], ['Nuage', 'Fumée'],
    ['Vent', 'Brise'], ['Tornade', 'Ouragan'], ['Tremblement de terre', 'Tsunami'], ['Foudre', 'Tonnerre'], ['Rosée', 'Givre'],
    ['Flaque', 'Mare'], ['Sorcier', 'Magicien'], ['Elfe', 'Lutin'], ['Géant', 'Ogre'], ['Troll', 'Gobelin'],
    ['Sirène', 'Nymphe'], ['Fée Clochette', 'Peter Pan'], ['Capitaine Crochet', 'Barbe Noire'], ['Robin des Bois', 'Zorro'], ['Cendrillon', 'Raiponce'],
    ['La Belle au bois dormant', 'Blanche-Neige'], ['Aladdin', 'Le Génie'], ['Shrek', 'Fiona'], ['Les Simpson', 'Les Griffin'], ['Bob l\'éponge', 'Patrick'],
    ['Mickey', 'Donald'], ['Tom et Jerry', 'Titi et Grosminet'], ['Scooby-Doo', 'Snoopy'], ['Garfield', 'Le Chat Botté'], ['Pikachu', 'Évoli'],
    ['Zelda', 'Link'], ['Luigi', 'Wario'], ['Pac-Man', 'Tetris'], ['Minecraft', 'Roblox'], ['Fortnite', 'Call of Duty'],
    ['Dark Vador', 'Voldemort'], ['Gandalf', 'Dumbledore'], ['Yoda', 'Obi-Wan Kenobi'], ['Hulk', 'La Chose'], ['Thor', 'Hercule'],
    ['Wonder Woman', 'Catwoman'], ['Joker', 'Harley Quinn'], ['Wolverine', 'Black Panther'], ['James Bond', 'Mission impossible'], ['Sherlock Holmes', 'Hercule Poirot'],
    ['Indiana Jones', 'Lara Croft'], ['Jurassic Park', 'King Kong'], ['Le Petit Prince', 'Le Petit Nicolas'], ['Les Schtroumpfs', 'Les Minions'], ['Kirikou', 'Mowgli'],
    ['Nemo', 'Dory'], ['Woody', 'Buzz l\'Éclair'], ['Elsa', 'Anna'], ['Vaiana', 'Pocahontas'], ['Poudlard', 'Narnia'],
    ['Wi-Fi', 'Bluetooth'], ['Mot de passe', 'Code PIN'], ['Ordinateur portable', 'Ordinateur fixe'], ['Imprimante 3D', 'Découpeuse laser'], ['Smartphone', 'Téléphone fixe'],
    ['Appel vidéo', 'Message vocal'], ['Snapchat', 'Instagram story'], ['Facebook', 'Twitter'], ['LinkedIn', 'CV'], ['Emoji', 'Sticker'],
    ['Hashtag', 'Arobase'], ['Like', 'Partage'], ['Selfie stick', 'Trépied'], ['Jeu vidéo', 'Jeu mobile'], ['Réalité virtuelle', 'Hologramme'],
    ['Intelligence artificielle', 'Assistant vocal'], ['GPS de voiture', 'Plan papier'], ['Montre à aiguilles', 'Montre digitale'], ['Code-barres', 'QR code'], ['Carte bancaire', 'Chèque'],
    ['Billet de banque', 'Pièce de monnaie'], ['Tirelire', 'Coffre-fort'], ['Bitcoin', 'Euro'], ['Distributeur', 'Guichet'], ['Douche froide', 'Bain chaud'],
    ['Sieste', 'Grasse matinée'], ['Rêve', 'Cauchemar'], ['Rire', 'Sourire'], ['Bisou', 'Câlin'], ['Poignée de main', 'Check'],
    ['Clin d\'œil', 'Pouce levé'], ['Applaudissements', 'Ovation'], ['Dispute', 'Malentendu'], ['Mensonge', 'Secret'], ['Promesse', 'Pari'],
    ['Rendez-vous', 'Réunion de famille'], ['Embouteillage', 'Grève'], ['Retard', 'Panne'], ['Rhume', 'Grippe'], ['Pansement', 'Plâtre'],
    ['Piqûre', 'Vaccin'], ['Sirop', 'Comprimé'], ['Ambulance', 'Hélicoptère du SAMU'], ['Urgences', 'Cabinet médical'], ['Lunettes de soleil', 'Masque de ski'],
    ['Ombre', 'Reflet'], ['Écho', 'Silence'], ['Bougie parfumée', 'Encens'], ['Fleur', 'Bouquet'], ['Rose', 'Tulipe'],
    ['Tournesol', 'Marguerite'], ['Cactus', 'Plante grasse'], ['Palmier', 'Cocotier'], ['Chêne', 'Hêtre'], ['Herbe', 'Mousse'],
    ['Feuille morte', 'Gland'], ['Bûche de bois', 'Charbon'], ['Feu de camp', 'Feu de cheminée'], ['Allumette', 'Briquet'], ['Ballon de baudruche', 'Ballon de foot'],
    ['Bateau en papier', 'Avion en papier'], ['Sablier', 'Chronomètre'], ['Horloge', 'Pendule'],
  ];
  const POINTS = { civil: 2, undercover: 10, white: 6 }, WHITE_BONUS = 5;   // bonus de Mister White qui devine le mot
  const ROLE_NAME = { civil: 'Civil', undercover: 'Undercover', white: 'Mister White' };
  // Paires déjà jouées : une clé courte par paire (les mots ne voyagent pas). La liste vient du salon
  // (mémoire d'une partie à l'autre) et du téléphone de l'hôte (mémoire d'une soirée à l'autre, voir app.js).
  // Elle vit côté hôte ou serveur, jamais dans la vue des joueurs.
  const SEEN_MAX = 2000;
  function pairKey(p) {
    const t = [p[0], p[1]].map(w => String(w).toLowerCase()).sort().join('|');
    let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
  }
  /** D'abord une paire jamais jouée ; sinon une des plus anciennement jouées. */
  function choosePair(seen) {
    const at = new Map(seen.map((k, i) => [k, i])), all = PAIRS.map((_, i) => i);
    const fresh = all.filter(i => !at.has(pairKey(PAIRS[i])));
    if (fresh.length) return pick(fresh);
    const oldest = all.sort((a, b) => at.get(pairKey(PAIRS[a])) - at.get(pairKey(PAIRS[b])));
    return pick(oldest.slice(0, Math.max(1, oldest.length >> 2)));
  }
  function markSeen(seen, idx) {
    const k = pairKey(PAIRS[idx]), j = seen.indexOf(k);
    if (j >= 0) seen.splice(j, 1);
    seen.push(k);
    if (seen.length > SEEN_MAX) seen.splice(0, seen.length - SEEN_MAX);
  }
  const pick = a => a[Math.random() * a.length | 0];

  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  /** La réponse de Mister White : accents, majuscules, pluriel et une faute de frappe tolérés. */
  function sameWord(guess, word) {
    const g = norm(guess).replace(/s$/, ''), w = norm(word).replace(/s$/, '');
    if (!g) return false;
    return g === w || (w.length >= 6 && lev(g, w) <= 1);
  }

  /** Combien d'intrus au total : il faut toujours plus de civils que d'intrus. */
  function impostorPlan(n, wantUc, wantWhite) {
    const max = Math.max(1, Math.floor((n - 1) / 2));
    let uc = wantUc === 'auto' ? (n >= 9 ? 3 : n >= 6 ? 2 : 1) : Math.max(1, +wantUc || 1);
    let white = !!wantWhite;
    if (white && uc + 1 > max) { if (uc > 1) uc -= 1; else white = false; }
    uc = Math.min(uc, max - (white ? 1 : 0));
    return { uc: Math.max(1, uc), white };
  }

  function create({ hostId, players, rounds, undercovers, white, seen }) {
    const room = {
      seen: Array.isArray(seen) ? seen : [],
      hostId, rounds: Math.max(1, Math.min(10, +rounds || 3)), round: 0,
      settings: { undercovers: undercovers || 'auto', white: !!white },
      players: players.map(p => ({ id: p.id, name: p.name, online: p.online !== false, bot: !!p.bot, score: 0 })),
      phase: 'reveal',
    };
    startRound(room);
    return room;
  }

  function startRound(room) {
    const ids = shuffle(room.players.filter(p => p.online).map(p => p.id));
    const plan = impostorPlan(ids.length, room.settings.undercovers, room.settings.white);
    const idx = choosePair(room.seen); markSeen(room.seen, idx);
    const pair = Math.random() < 0.5 ? PAIRS[idx] : [PAIRS[idx][1], PAIRS[idx][0]];
    room.round += 1;
    room.pair = { civil: pair[0], undercover: pair[1] };
    room.plan = plan;
    room.roles = {};
    ids.forEach((id, i) => {
      const role = i < plan.uc ? 'undercover' : (plan.white && i === plan.uc) ? 'white' : 'civil';
      room.roles[id] = { role, word: role === 'white' ? null : room.pair[role], alive: true, ready: false, gain: 0 };
    });
    room.inRound = shuffle(ids.slice());   // ordre d'affichage, sans trahir les rôles
    room.tour = 0; room.order = []; room.speaker = 0;
    room.votes = {}; room.candidates = null; room.tie = false;
    room.lastElim = null; room.whiteTry = null; room.result = null; room.clues = {};
    room.phase = 'reveal';
  }

  const alive = room => room.inRound.filter(id => room.roles[id].alive);
  const isOnline = (room, id) => !!room.players.find(p => p.id === id && p.online);
  const nameOf = (room, id) => (room.players.find(p => p.id === id) || {}).name || '?';

  function beginClues(room) {
    room.tour += 1;
    const order = shuffle(alive(room));
    // Mister White ne commence jamais : il n'aurait rien entendu.
    if (order.length > 1 && room.roles[order[0]].role === 'white') { const w = order.shift(); order.splice(1 + (Math.random() * (order.length - 1) | 0), 0, w); }
    room.order = order; room.speaker = 0; room.phase = 'clues';
    skipOffline(room);
  }
  function skipOffline(room) {
    while (room.speaker < room.order.length && !isOnline(room, room.order[room.speaker])) room.speaker += 1;
    if (room.speaker >= room.order.length) beginVote(room);
  }
  function beginVote(room) { room.phase = 'vote'; room.votes = {}; room.candidates = null; room.tie = false; }

  const voters = room => alive(room).filter(id => isOnline(room, id));
  function maybeResolve(room) { if (room.phase === 'vote' && voters(room).every(id => room.votes[id])) resolve(room); }

  function resolve(room) {
    const tally = {};
    Object.values(room.votes).forEach(t => { tally[t] = (tally[t] || 0) + 1; });
    const max = Math.max(0, ...Object.values(tally));
    if (!max) return 'Personne n’a encore voté';
    const top = Object.keys(tally).filter(id => tally[id] === max);
    if (top.length > 1 && !room.candidates) {   // égalité : on revote entre les ex æquo
      room.candidates = top; room.votes = {}; room.tie = true;
      return null;
    }
    eliminate(room, top.length > 1 ? pick(top) : top[0], tally);
    return null;
  }

  function eliminate(room, id, tally) {
    const r = room.roles[id]; r.alive = false;
    room.lastElim = { id, name: nameOf(room, id), role: r.role, tally: Object.entries(tally).map(([t, n]) => ({ name: nameOf(room, t), n })).sort((a, b) => b.n - a.n) };
    room.candidates = null; room.tie = false; room.votes = {};
    if (r.role === 'white') { room.phase = 'white-guess'; return; }
    afterElimination(room);
  }

  function afterElimination(room) {
    const left = alive(room);
    const impostors = left.filter(id => room.roles[id].role !== 'civil').length;
    const civils = left.length - impostors;
    if (impostors === 0) return finishRound(room, 'civils');
    if (civils <= 1) return finishRound(room, 'impostors');
    room.phase = 'elim';
  }

  function finishRound(room, winner) {
    Object.entries(room.roles).forEach(([id, r]) => {
      let gain = 0;
      if (winner === 'civils' && r.role === 'civil') gain = POINTS.civil;
      if (winner === 'impostors' && r.role !== 'civil') gain = POINTS[r.role];
      const p = room.players.find(x => x.id === id); if (p) p.score += gain;
      r.gain = gain + (r.bonus || 0);                     // le bonus a déjà été compté au moment de la réponse
    });
    room.result = { winner };
    room.phase = 'result';
  }

  /** Toutes les actions du jeu. Renvoie un message d'erreur, ou null. */
  function act(room, pid, m) {
    const host = pid === room.hostId, me = room.roles[pid];
    switch (m.t) {
      case 'uc:ready':
        if (room.phase !== 'reveal' || !me) return null;
        me.ready = true;
        if (room.inRound.filter(id => isOnline(room, id)).every(id => room.roles[id].ready)) beginClues(room);
        return null;
      case 'uc:clue': {
        if (room.phase !== 'clues') return null;
        const speaker = room.order[room.speaker];
        if (speaker !== pid && !host) return null;
        const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (text && speaker === pid) (room.clues[pid] = room.clues[pid] || []).push({ tour: room.tour, text });
        room.speaker += 1; skipOffline(room);
        return null;
      }
      case 'uc:vote':
        if (room.phase !== 'vote' || !me || !me.alive) return null;
        if (m.target === pid) return 'Tu ne peux pas voter contre toi';
        if (!room.roles[m.target]?.alive) return null;
        if (room.candidates && !room.candidates.includes(m.target)) return 'Vote seulement entre les ex æquo';
        room.votes[pid] = m.target;
        maybeResolve(room);
        return null;
      case 'uc:white-guess': {
        if (room.phase !== 'white-guess' || room.lastElim?.id !== pid) return null;
        const guess = String(m.word || '').slice(0, 40);
        const ok = sameWord(guess, room.pair.civil);
        room.whiteTry = { word: guess, ok, name: nameOf(room, pid) };
        // trouvé : 5 points tout de suite, mais la manche continue (il reste éliminé)
        if (ok) { me.bonus = (me.bonus || 0) + WHITE_BONUS; const p = room.players.find(x => x.id === pid); if (p) p.score += WHITE_BONUS; }
        afterElimination(room);
        return null;
      }
      case 'uc:force':          // l'hôte débloque une étape qui attend un absent
        if (!host) return null;
        if (room.phase === 'reveal') beginClues(room);
        else if (room.phase === 'clues') beginVote(room);
        else if (room.phase === 'vote') return resolve(room);
        else if (room.phase === 'white-guess') { room.whiteTry = { word: '', ok: false }; afterElimination(room); }
        return null;
      case 'uc:continue':
        if (!host || room.phase !== 'elim') return null;
        beginClues(room); return null;
      case 'uc:next':
        if (!host || room.phase !== 'result') return null;
        if (room.round >= room.rounds) room.phase = 'over';
        else if (room.players.filter(p => p.online).length < 3) return 'Il faut au moins trois joueurs connectés';
        else startRound(room);
        return null;
    }
    return null;
  }

  function join(room, id, name) {
    const p = room.players.find(x => x.id === id);
    if (p) { p.online = true; p.name = name || p.name; return; }
    room.players.push({ id, name, online: true, score: 0 });   // jouera à la manche suivante
  }
  function setOnline(room, id, on) {
    const p = room.players.find(x => x.id === id); if (!p) return;
    p.online = on;
    if (on) return;
    if (room.phase === 'reveal' && room.inRound.filter(x => isOnline(room, x)).every(x => room.roles[x].ready)) beginClues(room);
    else if (room.phase === 'clues' && room.order[room.speaker] === id) skipOffline(room);
    else if (room.phase === 'vote') maybeResolve(room);
  }

  /** Vue d'un joueur : son mot à lui, jamais celui des autres avant la fin de la manche. */
  function view(room, pid) {
    const me = room.roles[pid];
    const over = room.phase === 'result' || room.phase === 'over';
    return {
      phase: room.phase, round: room.round, rounds: room.rounds, tour: room.tour,
      isHost: pid === room.hostId,
      plan: room.plan,
      me: me ? { inRound: true, alive: me.alive, ready: me.ready, word: me.word, white: me.role === 'white', vote: room.votes[pid] || null } : { inRound: false },
      players: room.inRound.map(id => {
        const r = room.roles[id];
        return {
          id, name: nameOf(room, id), online: isOnline(room, id), alive: r.alive, ready: r.ready,
          voted: room.phase === 'vote' && !!room.votes[id],
          role: over || !r.alive ? r.role : null,
          word: over ? r.word : null, gain: over ? r.gain : 0,
          clues: ((room.clues || {})[id] || []).map(c => c.text),
        };
      }),
      waiting: room.players.filter(p => !room.inRound.includes(p.id)).map(p => p.name),
      speakerId: room.phase === 'clues' ? room.order[room.speaker] : null,
      order: room.phase === 'clues' ? room.order.map((id, i) => ({ id, name: nameOf(room, id), done: i < room.speaker })) : [],
      candidates: room.candidates, tie: room.tie,
      votedCount: Object.keys(room.votes).length, voterCount: voters(room).length,
      lastElim: room.lastElim, whiteTry: room.whiteTry && (room.phase === 'result' ? room.whiteTry : { ok: room.whiteTry.ok, word: room.whiteTry.word ? '…' : '' }),
      result: room.result, pair: over ? room.pair : null,
      scores: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })).sort((a, b) => b.score - a.score),
    };
  }

  // les robots : un indice vague tiré d'une liste, des votes au hasard, et Mister White qui tente un mot
  const BOT_HINTS = ['Souvent', 'Pratique', 'Rond', 'Chez soi', 'En été', 'Coloré', 'Petit', 'Célèbre', 'Dehors', 'Ancien', 'Doux', 'Rapide', 'Bruyant', 'Cher', 'Utile', 'Populaire', 'Le matin', 'En famille', 'Classique', 'Moderne', 'Partout', 'Plaisir', 'Fragile', 'Grand', 'Simple', 'Enfance', 'Vacances'];
  const isBot = (room, id) => !!room.players.find(p => p.id === id && p.bot);
  function tick(room) {
    const now = Date.now();
    if (room.botWait && now < room.botWait) return false;
    const wait = () => { room.botWait = now + 1400 + Math.random() * 1800; };
    const any = list => list[Math.random() * list.length | 0];
    if (room.phase === 'reveal') { const b = room.inRound.find(id => isBot(room, id) && !room.roles[id].ready); if (b) { act(room, b, { t: 'uc:ready' }); return true; } }
    if (room.phase === 'clues') {
      const sp = room.order[room.speaker];
      if (sp && isBot(room, sp)) { if (!room.botWait) { wait(); return false; } act(room, sp, { t: 'uc:clue', text: any(BOT_HINTS) }); room.botWait = 0; return true; }
    }
    if (room.phase === 'vote') {
      const b = alive(room).find(id => isBot(room, id) && !room.votes[id]);
      if (b) {
        const opts = (room.candidates || alive(room)).filter(id => id !== b && room.roles[id].alive);
        if (opts.length) { act(room, b, { t: 'uc:vote', target: any(opts) }); wait(); return true; }
      }
    }
    if (room.phase === 'white-guess' && room.lastElim && isBot(room, room.lastElim.id)) { act(room, room.lastElim.id, { t: 'uc:white-guess', word: any(any(PAIRS)) }); return true; }
    return false;
  }
  return { PAIRS, POINTS, ROLE_NAME, create, act, tick, join, setOnline, view, sameWord, impostorPlan, pairKey };
})();
