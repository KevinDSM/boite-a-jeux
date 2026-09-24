/* Règles détaillées de tous les jeux, sur une page à part ouverte depuis l'accueil.
   Chaque jeu reprend l'icône, le nom et la couleur de sa carte d'accueil, puis ses règles complètes.
   Chargé après app.js : réutilise $, el et show. */

'use strict';

const RULES = [
  { key: 'timeline', parts: [
    ['Le principe', `<p>Des extraits de chansons à ranger dans l'ordre chronologique. Chacun construit sa propre frise d'années : le premier qui atteint le nombre de cartes fixé gagne.</p>`],
    ['Mise en place', `<p>Chaque joueur reçoit une première chanson, déjà placée et datée. L'hôte choisit les playlists, le nombre de cartes pour gagner (5, 7, 10 ou 15) et d'où sort le son : le téléphone du joueur actif, le sien branché sur une enceinte, ou tous les téléphones.</p>`],
    ['À ton tour', `<ul>
      <li>Un extrait se lance. Écoute, puis touche le « + » à l'endroit de ta frise où la chanson se place : avant, entre ou après tes cartes.</li>
      <li>Bonne place : la carte rejoint ta frise avec son année. Mauvaise place : elle est perdue.</li>
      <li>Avant de placer, tu peux écrire l'artiste et le titre. Les deux justes : +1 jeton.</li></ul>`],
    ['Les jetons et le pari', `<p>Tu commences avec 2 jetons, 3 au maximum. Ils ne servent qu'à parier.</p><ul>
      <li>Quand le joueur actif a posé sa carte, le premier autre joueur qui se lance prend le pari du tour, pour 1 jeton. Un seul pari par tour.</li>
      <li>Le parieur choisit l'emplacement qu'il croit juste dans la frise du joueur actif.</li>
      <li><b>Gagné</b> (le joueur actif s'est trompé et le parieur avait raison) : la carte part dans la frise du parieur.</li>
      <li><b>Perdu</b> : le parieur perd son jeton et une carte de sa frise, sans jamais descendre sous une carte.</li></ul>`],
    ['Fin de partie', `<p>Le premier joueur dont la frise atteint le nombre de cartes fixé gagne.</p>`],
    ['Tout seul', `<p>Sans autre joueur, pas de jetons ni de pari : tu enchaînes les chansons, tu passes celles que tu ne connais pas, et tu t'arrêtes quand ta frise est pleine.</p>`],
    ['Astuce', `<p>Les tubes ressortis en remix ou en reprise piègent souvent : c'est l'année de la version originale qui compte.</p>`],
  ] },
  { key: 'eclair', parts: [
    ['Le principe', `<p>Tout le monde écoute le même extrait en même temps, chacun sur son téléphone. Il faut trouver le titre en écoutant le moins possible.</p>`],
    ['Déroulement d’une manche', `<ul>
      <li>L'extrait se débloque par paliers : 0,5 s, 1 s, 2 s, 3 s, puis 5 s.</li>
      <li>Tu tapes un titre quand tu penses l'avoir. Une mauvaise réponse débloque automatiquement le palier suivant.</li>
      <li>« Écouter plus » passe au palier suivant sans tenter de réponse.</li>
      <li>La manche finit quand tout le monde a trouvé ou épuisé les paliers ; la chanson est alors révélée.</li></ul>`],
    ['Points', `<p>Trouvé à 0,5 s : 5 points. À 1 s : 4. À 2 s : 3. À 3 s : 2. À 5 s : 1. Pas trouvé : 0.</p>`],
    ['Fin de partie', `<p>Après le nombre de manches choisi (5, 10 ou 15), le plus grand total gagne.</p>`],
    ['Réglages dans le salon', `<ul>
      <li><b>Décennies :</b> années 80, 90, 2000, 2010 et 2020, à cocher ou décocher.</li>
      <li><b>Jeux vidéo :</b> des musiques de jeux se glissent parmi les chansons. Pour celles-là, c'est le nom du jeu qu'il faut donner. Un nom trop vague, comme « Zelda », ne coûte pas d'essai : on te demande de préciser.</li></ul>`],
  ] },
  { key: 'sprint', parts: [
    ['Le principe', `<p>La même chanson démarre chez tout le monde au même instant. Le premier à donner l'artiste et le titre gagne le plus de points.</p>`],
    ['Déroulement d’une manche', `<ul>
      <li>L'extrait dure 30 secondes. Tu as trois essais par manche.</li>
      <li>La liste de suggestions remplit l'artiste et le titre d'un coup : c'est bien plus rapide que de tout taper.</li>
      <li>La manche s'arrête à la fin de l'extrait ou quand tout le monde a répondu.</li></ul>`],
    ['Points', `<p>Selon l'ordre d'arrivée : 5 points pour le premier, 3 pour le deuxième, 2 pour le troisième, 1 pour les suivants.</p>`],
    ['Fin de partie', `<p>Après 5, 10 ou 15 manches, le plus grand total gagne.</p>`],
    ['Réglages dans le salon', `<ul>
      <li><b>Décennies</b> à cocher, et d'où sort le son.</li>
      <li><b>Jeux vidéo :</b> pour une musique de jeu, on donne le nom du jeu.</li>
      <li><b>Animés :</b> génériques et musiques d'anime, facultatifs. On donne le nom de l'anime, pas le titre du morceau.</li></ul>`],
  ] },
  { key: 'sablier', parts: [
    ['Le principe', `<p>Un jeu d'équipes en plusieurs manches, toujours avec les <b>mêmes cartes</b> : chaque manche rend le jeu plus difficile, mais les cartes sont de mieux en mieux connues.</p>`],
    ['Mise en place', `<ul>
      <li>Les équipes sont tirées au sort ou choisies par l'hôte.</li>
      <li>Chaque joueur reçoit des cartes (12 par défaut) et en écarte quelques-unes (2 par défaut). Toutes les cartes gardées forment le paquet commun.</li>
      <li>L'hôte choisit les decks de cartes, leur difficulté (facile, moyenne, velue) et les manches jouées.</li></ul>`],
    ['À ton tour', `<ul>
      <li>Trois secondes de préparation, puis la première carte arrive avec le chrono (30 s par défaut, 60 s en manche dessin).</li>
      <li>Tu fais deviner la carte à ton équipe, qui répond à voix haute. Trouvée : « Deviné », la carte suivante arrive.</li>
      <li>Tu peux passer librement : la carte retourne dans le paquet.</li>
      <li>Au gong, la carte en cours n'est jamais révélée. Si elle a été trouvée pile à la fin, l'hôte peut la compter.</li></ul>`],
    ['Les manches', `<ul>
      <li><b>Description libre :</b> tout est permis sauf prononcer un mot de la carte, sa traduction ou sa racine.</li>
      <li><b>Un seul mot :</b> un seul mot par carte, dit une seule fois. Ni geste, ni bruit, ni reformulation.</li>
      <li><b>Mime :</b> pour jouer dans la même pièce. Aucun mot, aucun son, aucune lettre tracée en l'air.</li>
      <li><b>Dessin :</b> tu dessines sur ton téléphone, ton équipe voit le dessin en direct. Ni lettre, ni chiffre.</li></ul>
      <p>Une manche se termine quand le paquet est vide. On le mélange et la manche suivante repart avec les mêmes cartes.</p>`],
    ['Points', `<p>Chaque carte trouvée rapporte 1 point à l'équipe. L'équipe qui a le plus de points après toutes les manches gagne.</p>`],
    ['Pour s’amuser', `<p>Pendant un tour, le public envoie des réactions, et les équipes qui ne jouent pas peuvent gribouiller sur les bords de l'écran avec le crayon, dans leur couleur. Les dessins s'effacent au tour suivant.</p>`],
    ['Bon à savoir', `<p>L'hôte peut corriger une carte comptée par erreur entre deux tours. Les cartes vues lors des soirées précédentes ne reviennent pas tant qu'il en reste des neuves.</p>`],
  ] },
  { key: 'undercover', parts: [
    ['Le principe', `<p>Tout le monde reçoit le même mot secret, sauf un ou plusieurs <b>undercovers</b> qui ont un mot voisin et ne le savent pas. Avec l'option <b>Mister White</b>, un joueur n'a aucun mot, et lui le sait.</p>`],
    ['Un tour d’indices', `<ul>
      <li>Chacun à son tour donne un indice sur son mot : un mot ou une courte expression, à voix haute, sans jamais dire le mot.</li>
      <li>Tu peux aussi l'écrire dans l'application : tous les indices sont rappelés au moment du vote.</li>
      <li>Trop précis, tu aides les intrus. Trop vague, tu passes pour l'un d'eux.</li></ul>`],
    ['Le vote', `<ul>
      <li>Tout le monde vote sur son téléphone pour éliminer un joueur. Le plus désigné est éliminé et son rôle révélé.</li>
      <li>En cas d'égalité, on revote entre les ex æquo.</li>
      <li>Mister White éliminé tente de deviner le mot des civils : s'il trouve, il marque 5 points tout de suite. Dans tous les cas il reste éliminé, et la manche continue.</li></ul>`],
    ['Fin de manche', `<p>Les civils gagnent quand tous les intrus sont éliminés. Les intrus gagnent s'il ne reste plus qu'un civil.</p>`],
    ['Points', `<p>Civil gagnant : 2 points. Undercover gagnant : 10 points. Mister White gagnant (avec les intrus) : 6 points, plus 5 s'il a deviné le mot des civils. On joue 3, 5 ou 8 manches, avec de nouveaux mots à chaque fois.</p>`],
    ['Réglages dans le salon', `<p>Nombre d'undercovers (automatique selon la table, ou 1 à 3) et Mister White. Il reste toujours plus de civils que d'intrus : sur une petite table, un rôle est retiré automatiquement.</p>`],
  ] },
  { key: 'geo', parts: [
    ['Le principe', `<p>Une photo à 360° prise dans une rue, quelque part. À toi de deviner où, le plus précisément possible.</p>`],
    ['Déroulement d’une manche', `<ul>
      <li>Regarde autour de toi : panneaux, langue, plaques, côté de circulation, végétation, architecture.</li>
      <li>Pose ton épingle sur la carte, puis valide. Tu peux la déplacer tant que tu n'as pas validé.</li>
      <li>La manche se termine quand tout le monde a validé ou à la fin du chrono. On voit alors le vrai lieu et les épingles de chacun.</li></ul>`],
    ['Les modes', `<ul>
      <li><b>Déplacement libre :</b> tu avances le long de la rue avec les flèches.</li>
      <li><b>Sans bouger :</b> tu tournes et tu zoomes, mais tu n'avances pas.</li>
      <li><b>Ni bouger ni zoomer :</b> une seule vue fixe, pour les experts.</li></ul>`],
    ['Points', `<p>Jusqu'à 5 000 points par manche. Ils baissent avec la distance, rapportée à la taille de la carte : se tromper de 200 km coûte beaucoup plus sur la carte France que sur la carte Monde.</p>`],
    ['Réglages dans le salon', `<p>Carte Monde, Europe ou France ; 3, 5 ou 10 manches ; chrono de 1 à 5 minutes.</p>`],
    ['Bon à savoir', `<p>Les images viennent de Mapillary, prises par des contributeurs : leur qualité varie d'un lieu à l'autre.</p>`],
  ] },
  { key: 'chromo', parts: [
    ['Le principe', `<p>Être le premier à se débarrasser de toutes ses cartes. 108 cartes en quatre couleurs, avec des cartes spéciales pour piéger les autres.</p>`],
    ['Mise en place', `<p>Chacun reçoit 7 cartes. Une carte chiffrée est retournée pour lancer la défausse.</p>`],
    ['À ton tour', `<ul>
      <li>Pose une carte de la même couleur ou du même symbole que celle du dessus.</li>
      <li>Si tu ne peux pas ou ne veux pas, pioche. Si la carte piochée va, tu peux la jouer tout de suite, sinon ton tour passe.</li></ul>`],
    ['Les cartes spéciales', `<ul>
      <li><b>Passe :</b> le joueur suivant saute son tour.</li>
      <li><b>Sens :</b> le sens du jeu s'inverse. À deux joueurs, elle fait passer le tour de l'autre.</li>
      <li><b>+2 :</b> le suivant pioche deux cartes et passe son tour.</li>
      <li><b>Joker :</b> se pose sur tout, tu choisis la nouvelle couleur.</li>
      <li><b>Joker +4 :</b> pareil, et le suivant pioche quatre cartes.</li>
      <li><b>Cumul</b> (option) : on répond à un +2 par un +2 ou un +4, à un +4 par un +4. Le premier qui ne peut pas contrer pioche le total.</li></ul>`],
    ['« Chromo ! »', `<p>Quand il ne te reste qu'une ou deux cartes, touche le bouton « Chromo ! ». Si tu tombes à une carte sans l'avoir crié, n'importe qui peut t'attraper jusqu'à ce que le joueur suivant joue : deux cartes de pénalité.</p>`],
    ['Points', `<p>Le gagnant d'une manche marque la valeur des cartes restées chez les autres : le chiffre pour une carte numérotée, 20 pour Passe, Sens et +2, 50 pour les jokers. Le plus grand total après 1, 3 ou 5 manches gagne.</p>`],
    ['Robots', `<p>Jusqu'à trois robots peuvent compléter la table. Ils jouent seuls et attrapent ceux qui oublient de crier.</p>`],
  ] },
  { key: 'kems', parts: [
    ['Le principe', `<p>Quatre joueurs, deux équipes de deux, partenaires face à face. Il faut réunir un carré (quatre cartes de même valeur) et le faire savoir à son partenaire par un signal secret, sans que les adversaires le remarquent.</p>`],
    ['Avant de jouer', `<p>Chaque équipe convient en cachette d'un signal discret : un clin d'œil, une main dans les cheveux, un mot glissé dans la conversation. Les signaux ne passent pas par l'application : Kems se joue autour d'une table ou en visio.</p>`],
    ['Déroulement', `<ul>
      <li>Chacun a quatre cartes en main, quatre sont posées au milieu. Il n'y a pas de tour : tout le monde joue en même temps.</li>
      <li>Touche une carte de ta main puis une carte du milieu pour les échanger. Si quelqu'un l'a prise avant toi, tu es prévenu. Tu peux échanger autant que tu veux.</li>
      <li>Quand tu ne veux plus rien, touche « Je passe ». Dès que les quatre ont passé, le milieu est remplacé. L'hôte peut aussi le renouveler si plus rien ne bouge.</li></ul>`],
    ['Les annonces', `<ul>
      <li><b>« Kems ! »</b> quand tu crois avoir vu le signal de ton partenaire. S'il a bien un carré, 1 point pour vous, 2 si tu en avais un aussi. Sinon, 1 point pour les adversaires.</li>
      <li><b>« Contre-Kems ! »</b> quand tu penses qu'un adversaire a un carré. Vrai : 1 point pour vous. Faux : 1 point pour eux.</li>
      <li>Une erreur coûte un point : les deux boutons demandent un second toucher pour confirmer.</li></ul>`],
    ['Fin de partie', `<p>Après chaque annonce, les quatre mains sont révélées et une nouvelle donne commence. La première équipe à atteindre le score fixé (5 points par défaut) gagne.</p>`],
    ['Équipes et robots', `<p>L'hôte range chaque joueur dans une équipe ou tire au sort. Des robots peuvent compléter la table : un robot qui tient un carré fait un signe visible seulement sur l'écran de son partenaire.</p>`],
  ] },
  { key: 'camembert', parts: [
    ['Le principe', `<p>Un plateau en anneau, un dé, et des questions à choix multiples dans six couleurs. Il faut gagner une part de fromage de chaque couleur, puis réussir la question finale.</p>`],
    ['Les couleurs', `<p>Géographie, Divertissement (cinéma, séries, musique, jeux vidéo), Histoire, Arts &amp; Littérature, Sciences &amp; Nature, Sports &amp; Loisirs.</p>`],
    ['À ton tour', `<ul>
      <li>Lance le dé, puis choisis de quel côté avancer : les deux cases possibles s'allument sur le plateau.</li>
      <li>La couleur de la case donne celle de la question : quatre réponses, 30 secondes.</li>
      <li>Bonne réponse : tu rejoues, jusqu'à 3 questions d'affilée par tour, puis la main passe. Mauvaise réponse ou temps écoulé : au suivant.</li>
      <li>Seules les grosses cases rapportent une part : quand tu rejoues, vise-les.</li>
      <li>Les cases ↻ font relancer le dé.</li></ul>`],
    ['Les parts', `<p>Les six grosses cases du plateau sont les camemberts. Une bonne réponse sur l'une d'elles rapporte la part de sa couleur, si tu ne l'as pas déjà.</p>`],
    ['La question finale', `<p>Fromage complet : à ton tour suivant, les autres joueurs votent la couleur de ta question finale, ou une question de culture générale. Elle est plus difficile. Bonne réponse, tu gagnes ; sinon tu retentes au tour d'après.</p>`],
    ['Les autres jouent aussi', `<p>Pendant chaque question, chacun peut donner son avis en secret. Ça ne rapporte rien, mais la révélation montre qui aurait trouvé.</p>`],
    ['Réglages dans le salon', `<p>Nombre de parts à réunir (6, 4 ou 3 pour une partie courte), difficulté des questions, et ce qui se passe après une bonne réponse : rejouer jusqu'à 3 fois, rejouer sans limite comme dans le jeu d'origine, ou passer la main à chaque question. Si une question est fausse, l'hôte peut compter la réponse comme juste. Une question déjà posée ne revient pas d'une soirée à l'autre tant qu'il en reste.</p>`],
  ] },
  { key: 'mirage', parts: [
    ['Le principe', `<p>Des images évocatrices et des indices. Le conteur doit faire deviner sa carte à certains joueurs, mais pas à tous : son indice ne doit être ni trop clair, ni trop obscur.</p>`],
    ['Mise en place', `<p>Chacun reçoit six cartes, des tableaux, gravures et estampes du domaine public. Touche une carte pour la voir en grand. Le rôle de conteur tourne à chaque manche.</p>`],
    ['Déroulement d’une manche', `<ul>
      <li><b>Le conteur</b> choisit une carte de sa main et donne un indice : un mot, une phrase, un titre de chanson, un bruit… tapé dans l'application ou dit à voix haute.</li>
      <li><b>Les autres</b> choisissent dans leur main la carte qui colle le mieux à cet indice, pour faire croire que c'est celle du conteur.</li>
      <li><b>Le vote :</b> toutes les cartes jouées sont mélangées. Chacun, sauf le conteur, vote pour celle qu'il pense être la sienne. Impossible de voter pour sa propre carte.</li>
      <li>La révélation montre à qui était chaque carte et qui a voté pour quoi. Chacun complète ensuite sa main à six cartes.</li></ul>`],
    ['Points', `<ul>
      <li>Si tout le monde a trouvé, ou si personne n'a trouvé : le conteur marque 0, les autres 2.</li>
      <li>Sinon : le conteur et ceux qui ont trouvé marquent 3.</li>
      <li>En plus, chaque joueur (sauf le conteur) marque 1 point par vote reçu sur sa carte, 3 au maximum.</li></ul>`],
    ['Fin de partie', `<p>Dès qu'un joueur atteint le score fixé (15, 30 ou 45 points), ou quand la pioche est épuisée. Il faut au moins trois joueurs, le jeu est meilleur à cinq ou six.</p>`],
  ] },
  { key: 'douze', parts: [
    ['Le principe', `<p>Finir chaque manche avec le total le plus bas. Tu as douze cartes face cachée devant toi, en trois lignes de quatre, avec des valeurs de -2 à 12.</p>`],
    ['Mise en place', `<p>Chacun retourne deux cartes de son choix. Le joueur qui a le plus haut total visible commence.</p>`],
    ['À ton tour', `<ul>
      <li><b>Pioche</b> une carte : pose-la sur une de tes cartes, visible ou cachée, et l'ancienne part à la défausse. Ou défausse-la, et retourne alors une de tes cartes cachées.</li>
      <li>Ou <b>prends la carte du dessus de la défausse</b> : elle se pose obligatoirement sur une de tes cartes.</li></ul>`],
    ['Les colonnes', `<p>Trois cartes identiques face visible dans une même colonne : la colonne disparaît et ne compte plus. Idéal pour se débarrasser de trois 12.</p>`],
    ['Fin de manche', `<ul>
      <li>Quand un joueur a retourné toutes ses cartes, chacun des autres joue un dernier tour.</li>
      <li>Toutes les cartes sont alors révélées et chacun marque la somme de sa grille.</li>
      <li>Si celui qui a fermé la manche n'a pas strictement le plus petit total, son score de la manche double.</li></ul>`],
    ['Fin de partie', `<p>Dès qu'un joueur atteint le seuil fixé (50, 100 ou 150 points), la partie s'arrête : le plus petit total gagne.</p>`],
    ['Astuces', `<p>Les négatifs sont précieux, les cartes rouges (9 à 12) à fuir. Fermer vite met la pression, mais un score doublé fait mal. Jusqu'à trois robots peuvent compléter la table.</p>`],
  ] },
  { key: 'petitbac', parts: [
    ['Le principe', `<p>Une lettre est tirée au sort. Pour chaque catégorie (un prénom, un pays, un animal…), il faut trouver un mot qui commence par cette lettre, plus vite et plus original que les autres.</p>`],
    ['Mise en place', `<p>L'hôte choisit les catégories dans une liste ou en invente, jusqu'à 14. Il règle aussi le nombre de manches, le temps d'écriture et les lettres difficiles (K, Q, W, X, Y, Z), exclues par défaut. Une lettre ne revient pas tant que les autres n'ont pas été tirées.</p>`],
    ['Écrire', `<ul>
      <li>Chacun remplit ses catégories sur son téléphone, sans voir celles des autres.</li>
      <li>Les articles ne comptent pas : « La Rochelle » vaut pour R, « L'Oréal » pour O. Une réponse qui ne commence pas par la bonne lettre s'affiche en rouge.</li>
      <li>La touche Entrée passe à la catégorie suivante.</li></ul>`],
    ['« Stop ! »', `<p>Le bouton Stop s'active quand toutes tes catégories sont remplies. Dès qu'un joueur le touche, les autres ont encore trois secondes, puis tout le monde pose son stylo. Sans Stop, la manche s'arrête à la fin du chrono.</p><p>L'hôte peut désactiver cette règle dans le salon : chacun touche alors « J'ai fini » quand il a terminé (et peut reprendre sa feuille tant que la manche continue). La manche s'arrête quand tout le monde a fini, ou à la fin du chrono.</p>`],
    ['La vérification', `<ul>
      <li>Toutes les réponses s'affichent, catégorie par catégorie, avec les points provisoires.</li>
      <li>Touche une réponse douteuse pour la contester, touche-la encore pour annuler. Elle est refusée si au moins la moitié des autres joueurs la conteste.</li>
      <li>L'hôte peut trancher une réponse, dans un sens ou dans l'autre, même si elle ne commence pas par la bonne lettre.</li>
      <li>Quand tout le monde a touché « J'ai vérifié », ou quand l'hôte le décide, les points sont comptés.</li></ul>`],
    ['Points', `<p>10 points pour une réponse que personne d'autre n'a donnée, 5 si au moins un autre joueur a la même, 0 pour une case vide, refusée ou qui ne commence pas par la bonne lettre. Les pluriels et les accents ne comptent pas pour repérer les doublons.</p>`],
    ['Fin de partie', `<p>Après le nombre de manches choisi, le plus grand total gagne.</p>`],
    ['Astuce', `<p>Les réponses évidentes rapportent souvent 5 : un mot un peu moins attendu, mais incontestable, vaut le double.</p>`],
  ] },
  { key: 'loupgarou', parts: [
    ['Le principe', `<p>Des loups-garous se cachent parmi les villageois. Chaque nuit ils dévorent quelqu'un ; chaque jour le village vote pour éliminer un suspect. Pas besoin de meneur : l'application réveille les rôles, annonce les morts et compte les votes. Le téléphone de l'hôte peut même faire la voix du narrateur.</p>`],
    ['Mise en place', `<ul>
      <li>De 5 à 20 joueurs. Le nombre de loups est automatique (1 jusqu'à 6 joueurs, 2 jusqu'à 11, 3 au-delà) ou choisi par l'hôte, et les rôles spéciaux se cochent dans le salon.</li>
      <li>Chacun découvre son rôle en maintenant sa carte appuyée, à l'abri des regards, puis touche « J'ai vu mon rôle ». Les loups voient qui sont leurs complices.</li></ul>`],
    ['Les rôles', `<ul>
      <li><b>Loup-Garou :</b> chaque nuit, les loups se mettent d'accord sur une victime. Le jour, ils se font passer pour des villageois.</li>
      <li><b>Villageois :</b> aucun pouvoir, seulement son flair et sa voix.</li>
      <li><b>Voyante :</b> chaque nuit, elle découvre le vrai rôle d'un joueur.</li>
      <li><b>Sorcière :</b> elle apprend qui les loups ont choisi. Elle a une potion de vie pour le sauver et une potion de mort pour empoisonner n'importe qui, une seule fois chacune pour toute la partie.</li>
      <li><b>Chasseur :</b> quand il meurt, de nuit comme de jour, il tire une dernière balle sur le joueur de son choix.</li>
      <li><b>Cupidon :</b> la première nuit, il désigne deux amoureux, qui se reconnaissent. Si l'un meurt, l'autre meurt de chagrin.</li>
      <li><b>Salvateur :</b> chaque nuit, il protège un joueur des loups, jamais le même deux nuits de suite. Il peut se protéger lui-même.</li></ul>`],
    ['La nuit', `<ul>
      <li>Tout le monde ferme les yeux. Les rôles se réveillent dans l'ordre : Cupidon et les amoureux (première nuit), Salvateur, Loups-Garous, Voyante, Sorcière.</li>
      <li>Quand c'est ton tour, ton téléphone vibre (sur Android) et affiche ton action. Les autres voient un écran de nuit.</li>
      <li>Chaque étape dure un moment, même si le rôle est mort ou absent de la partie : personne ne peut deviner qui agit.</li>
      <li>Les loups doivent être d'accord sur leur victime. À défaut, à la fin du temps, c'est la victime la plus choisie.</li></ul>`],
    ['Le jour', `<ul>
      <li>Les morts de la nuit sont annoncés et leur rôle révélé.</li>
      <li>Le village débat de vive voix, puis chacun vote sur son téléphone pour un suspect. On peut changer d'avis jusqu'à la fin : quand tout le monde a voté, il reste 5 secondes. L'hôte peut aussi clore le vote.</li>
      <li>Le plus désigné est éliminé et son rôle révélé. En cas d'égalité, on revote entre les ex æquo ; nouvelle égalité, personne n'est éliminé.</li></ul>`],
    ['Les morts', `<p>Un joueur mort garde le silence jusqu'à la fin. Avec l'option du salon, il voit tous les rôles et profite du spectacle.</p>`],
    ['Fin de partie', `<ul>
      <li>Le village gagne quand tous les loups sont morts.</li>
      <li>Les loups gagnent quand il ne reste plus que des loups.</li>
      <li>Deux amoureux de camps différents (un loup et un villageois) gagnent ensemble s'ils sont les deux derniers en vie.</li></ul>
      <p>À la fin, tous les rôles sont révélés ; l'hôte peut relancer une partie avec de nouveaux rôles.</p>`],
  ] },
];

let rulesBuilt = false;
function buildRules() {
  if (rulesBuilt) return;
  const root = $('#rules-main');
  const toc = el('nav', 'rules-toc'); toc.setAttribute('aria-label', 'Sommaire des jeux');
  const list = el('div', 'rules-list');
  RULES.forEach(g => {
    const card = document.querySelector(`.gcard[data-game="${g.key}"]`);
    if (!card) return;
    const art = card.querySelector('.gart')?.innerHTML || '';
    const name = card.querySelector('.gname')?.textContent || g.key;
    const desc = card.querySelector('.gdesc')?.textContent || '';
    const meta = card.querySelector('.gmeta')?.textContent || '';
    const link = el('a', `rules-chip g-${card.className.match(/g-(\S+)/)?.[1] || g.key}`, `<span class="gart" aria-hidden="true">${art}</span><span class="gname">${name}</span>`);
    link.href = `#r-${g.key}`;
    link.onclick = e => { e.preventDefault(); $(`#r-${g.key}`).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    toc.appendChild(link);
    const sec = el('section', 'rules-game'); sec.id = `r-${g.key}`;
    sec.innerHTML = `<header class="rules-head gcard ${card.className.match(/g-\S+/)?.[0] || ''}"><span class="gart" aria-hidden="true">${art}</span><span class="gname">${name}</span><span class="gdesc">${desc}</span><span class="gmeta">${meta}</span></header>`
      + g.parts.map(([title, html]) => `<div class="rules-part"><h3>${title}</h3>${html}</div>`).join('')
      + `<button class="rules-top" type="button">↑ Retour au sommaire</button>`;
    sec.querySelector('.rules-top').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    list.appendChild(sec);
  });
  root.append(toc, list);
  rulesBuilt = true;
}

function openRules(push = true) {
  buildRules();
  show('s-rules');
  if (push) { try { history.pushState({ rules: 1 }, '', '#regles'); } catch { } }
}
function closeRules() {
  if (history.state?.rules) history.back();          // le popstate ramène à l'accueil
  else { try { history.replaceState(null, '', location.pathname + location.search); } catch { } show('s-home'); }
}
window.addEventListener('popstate', () => { if (shownId === 's-rules') show('s-home'); });
$('#btn-rules').onclick = () => openRules();
if (location.hash === '#regles') openRules(false);
