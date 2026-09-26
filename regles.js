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
      <li><b>Règle du zéro</b> (option) : quand un 0 est posé, chacun passe toute sa main à son voisin, dans le sens du jeu.</li>
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
    ['Mise en place', `<p>Chacun reçoit six cartes. Dans le salon, l'hôte choisit le paquet : des tableaux, gravures et estampes du domaine public, les mèmes et GIF de Mème pas vrai, ou les deux mélangés (les GIF tournent en boucle, sans le son). Touche une carte pour la voir en grand. Le rôle de conteur tourne à chaque manche.</p>`],
    ['Déroulement d’une manche', `<ul>
      <li><b>Le conteur</b> choisit une carte de sa main et donne un indice : un mot, une phrase, un titre de chanson, un bruit… tapé dans l'application ou dit à voix haute.</li>
      <li><b>Les autres</b> choisissent dans leur main la carte qui colle le mieux à cet indice, pour faire croire que c'est celle du conteur.</li>
      <li><b>Le vote :</b> toutes les cartes jouées sont mélangées. Chacun, sauf le conteur, vote pour celle qu'il pense être la sienne. Impossible de voter pour sa propre carte.</li>
      <li>La révélation montre à qui était chaque carte et qui a voté pour quoi. Chacun complète ensuite sa main à six cartes.</li></ul>`],
    ['Les jokers', `<p>Chacun a 3 jokers pour toute la partie (réglable dans le salon). Quand tu veux, touche une carte de ta main puis « Joker » : 5 cartes de la pioche te sont proposées, tu en gardes une à la place de la tienne, les autres retournent sous la pioche. Tu peux annuler sans perdre ton joker. Une carte déjà jouée pendant la manche ne s'échange pas.</p>`],
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
  { key: 'naufrages', parts: [
    ['Le principe', `<p>Le bateau a coulé, vous êtes échoués sur une île. Pour vous en sortir, il faut construire un radeau et partir avant l'ouragan, sans mourir de faim ni de soif. Tout le monde coopère… tant qu'il y a assez pour tout le monde. Ceux qui embarquent gagnent, les autres restent sur l'île.</p>`],
    ['La réserve du camp', `<p>Poissons, eau et bois sont mis en commun et affichés en haut de l'écran, avec le nombre de places sur le radeau : 4 morceaux de bois par place. On commence avec un peu de vivres rescapés du naufrage.</p>`],
    ['Chaque jour', `<ul>
      <li>La météo du jour s'affiche : elle fixe la quantité d'eau récoltée, de 1 ration (grand soleil) à 4 (pluie battante).</li>
      <li>Chacun choisit en secret une action, qu'il peut changer jusqu'à ce que tout le monde ait choisi :
        <b>pêcher</b> (1 à 4 poissons), <b>chercher de l'eau</b> (selon la météo), <b>couper du bois</b> (1 morceau, et tu peux tenter jusqu'à 5 morceaux de plus : à chaque morceau tenté, une chance sur six d'être mordu par un serpent, auquel cas tu ne rapportes rien et tu es malade deux jours), ou <b>fouiller l'épave</b> (un objet, que toi seul connais).</li>
      <li>Le compte rendu de la journée s'affiche ensuite pour tout le monde.</li></ul>`],
    ['Le soir', `<ul>
      <li>Chaque survivant mange un poisson et boit une ration d'eau.</li>
      <li>S'il n'y a pas assez pour tout le monde, le camp vote : le plus désigné est sacrifié, et on recommence jusqu'à ce que les réserves suffisent. À égalité, le hasard tranche. Le vote dure 45 secondes au plus, discutez vite !</li>
      <li>Les affaires d'un disparu retournent dans l'épave.</li></ul>`],
    ['Le départ', `<ul>
      <li>Dès qu'il y a une place et de quoi manger et boire pour chacun pendant la traversée, l'hôte peut lancer le départ, ou décider de rester un jour de plus pour faire des réserves.</li>
      <li>L'ouragan arrive un soir, sans prévenir (vers le jour 8 à 11 en partie normale). Il force le départ : s'il manque des places ou des vivres, le camp vote pour savoir qui reste sur l'île.</li></ul>`],
    ['Les objets de l\u2019épave', `<ul>
      <li><b>Conserve</b> et <b>gourde</b> : +3 poissons ou +3 rations dans la réserve.</li>
      <li><b>Hache</b> : ta prochaine coupe rapporte 3 morceaux de plus. <b>Canne à pêche</b> : ta prochaine pêche rapporte 2 poissons de plus.</li>
      <li><b>Corde</b> : +1 place sur le radeau. <b>Antidote</b> : soigne un malade. <b>Longue-vue</b> : tu vois en secret la météo des 3 prochains jours.</li>
      <li><b>Pistolet</b> : pendant un vote, abat directement le joueur de ton choix. <b>Talisman</b> : si tu es désigné au vote, tu survis et on revote sans toi.</li>
      <li>Personne ne sait ce que tu as trouvé : à toi de décider quand t'en servir… ou de le garder pour toi.</li></ul>`],
    ['Réglages', `<p>Partie courte, normale ou longue : l'ouragan arrive plus ou moins tôt. De 3 à 12 joueurs, robots compris : jusqu'à 6 robots peuvent compléter le camp. Ils font leur part du travail, votent souvent avec la majorité, et il arrive qu'un robot armé sorte son pistolet.</p>`],
  ] },
  { key: 'memes', parts: [
    ['Le principe', `<p>Une situation s'affiche, par exemple « Quand le wifi coupe en pleine partie ». Chacun pose en secret le mème ou le GIF de sa main qui y répond le mieux. Le plus drôle marque.</p>`],
    ['Les cartes', `<p>Chacun a 7 cartes en main : des modèles de mèmes et de GIF de la bibliothèque publique d'Imgflip (les GIF tournent en boucle, sans le son). Touche une carte pour la voir en grand avec la phrase. Après chaque manche, les mains sont complétées. Les cartes et les phrases déjà vues lors des soirées précédentes sortent en dernier.</p>`],
    ['Qui décide', `<ul>
      <li><b>Avec un juge</b> (par défaut) : à chaque manche, un joueur différent ne pose pas de carte. Il voit les mèmes, mélangés et anonymes, et choisit son préféré : 1 point pour son auteur.</li>
      <li><b>Tout le monde vote</b> : chacun vote pour le meilleur mème, jamais pour le sien. Chaque vote reçu vaut 1 point.</li></ul>`],
    ['Changer sa main', `<p>Rien ne colle ? Une fois par manche, tu peux échanger toute ta main contre 1 point.</p>`],
    ['Fin de partie', `<p>Le premier qui atteint le score fixé (5, 7 ou 10 points) gagne. On peut jouer avec des images seulement, des GIF seulement, ou les deux.</p>`],
  ] },
  { key: 'limite', parts: [
    ['Le principe', `<p>Une carte noire affiche une phrase à trous, par exemple « Mon psy dit que tous mes problèmes viennent de ___ ». Chacun la complète avec une carte blanche de sa main. La phrase la plus drôle, la plus absurde ou la plus limite marque le point. L'humour est volontairement grinçant : c'est un jeu pour adultes entre amis.</p>`],
    ['Les cartes', `<p>Chacun a 10 cartes blanches en main, complétées après chaque manche. Certaines cartes noires ont deux trous : il faut alors poser deux cartes, dans l'ordre, et un aperçu de la phrase s'affiche avant de valider. Toutes les cartes ont été écrites pour la Boîte à jeux.</p>`],
    ['Qui décide', `<ul>
      <li><b>Avec un juge</b> (par défaut) : à chaque manche, un joueur différent ne joue pas. Il lit les phrases, mélangées et anonymes, de préférence à voix haute, et choisit sa préférée : 1 point pour son auteur.</li>
      <li><b>Tout le monde vote</b> : chacun vote pour la meilleure phrase, jamais pour la sienne. Chaque vote reçu vaut 1 point.</li></ul>`],
    ['Changer sa main', `<p>Une fois par manche, tu peux échanger toute ta main contre 1 point.</p>`],
    ['Réglages', `<p>Partie en 5, 7 ou 10 points. Le mode soft retire les cartes les plus crues, pour jouer en famille élargie.</p>`],
  ] },
  { key: 'solitaire', parts: [
    ['Le principe', `<p>La patience classique (Klondike), jouée en course. Tout le monde reçoit exactement la même donne et joue sur son propre écran ; une barre montre en direct combien de cartes chacun a monté.</p>`],
    ['Le but', `<p>Monter les 52 cartes sur les quatre fondations, une par couleur, de l'as au roi.</p>`],
    ['Déplacer les cartes', `<ul>
      <li>Dans les sept colonnes, on pose une carte sur une carte de valeur juste au-dessus et de couleur opposée : un 6 noir sur un 7 rouge.</li>
      <li>On peut déplacer une suite entière de cartes visibles. Seul un roi (ou une suite qui commence par un roi) va sur une colonne vide.</li>
      <li>Une carte cachée se retourne dès qu'elle est découverte.</li>
      <li>Touche une carte : elle part au meilleur endroit, la fondation d'abord. S'il y a plusieurs colonnes possibles, elles s'allument et tu touches celle que tu veux.</li>
      <li>Tu préfères faire toi-même ? Fais glisser la carte, ou la suite à partir de cette carte, jusqu'à la colonne ou la fondation voulue. Lâchée à un endroit interdit, elle revient à sa place.</li></ul>`],
    ['La pioche', `<p>Touche la pioche pour retourner une carte (ou trois, selon le réglage) sur le talon. Seule la carte du dessus du talon se joue. Pioche vide : touche-la pour recycler le talon, sans limite.</p>`],
    ['Fin de partie', `<p>Le premier qui termine gagne. Au bout du temps choisi, ou quand l'hôte arrête la course, le classement se fait au nombre de cartes montées, puis au nombre de coups. Quand toutes les cartes sont visibles, un bouton termine la patience automatiquement.</p>`],
    ['Réglages dans le salon', `<p>Pioche d'une ou trois cartes, et durée de la course : 5, 10, 15 minutes ou sans limite.</p>`],
  ] },
  { key: 'poker', parts: [
    ['Le principe', `<p>Texas Hold'em avec des jetons fictifs. Chacun reçoit deux cartes cachées ; cinq cartes communes arrivent au milieu de la table. La meilleure main de cinq cartes, prises parmi tes deux cartes et les cinq communes, gagne le pot.</p>`],
    ['Une main', `<ul>
      <li>Le bouton D tourne à chaque main. Les deux joueurs suivants posent la petite et la grosse blinde, des mises forcées.</li>
      <li><b>Avant le flop</b>, chacun parle à son tour à partir du joueur après la grosse blinde.</li>
      <li><b>Flop</b> : trois cartes communes, nouveau tour d'enchères. <b>Turn</b> : une quatrième carte. <b>River</b> : la cinquième.</li>
      <li>À l'abattage, les mains encore en jeu sont montrées et la meilleure ramasse le pot. Si tout le monde se couche, le dernier restant ramasse sans montrer.</li></ul>`],
    ['À ton tour', `<ul>
      <li><b>Se coucher</b> : tu abandonnes la main et ce que tu as misé.</li>
      <li><b>Parole</b> : tu ne mises rien, possible seulement si personne n'a misé.</li>
      <li><b>Suivre</b> : tu égalises la mise en cours.</li>
      <li><b>Relancer</b> : au moins le montant de la dernière relance en plus. Le curseur et les boutons ½ pot, pot et tapis règlent la somme.</li>
      <li><b>Tapis</b> : tu mises tout. Tu ne peux alors gagner que ce que tu as pu couvrir chez chacun ; le reste forme un pot annexe entre les autres.</li></ul>`],
    ['Les mains', `<p>De la plus faible à la plus forte : carte haute, paire, double paire, brelan, quinte (cinq cartes qui se suivent, l'as compte aussi pour 1), couleur (cinq cartes de la même couleur), full (brelan et paire), carré, quinte flush. À égalité de combinaison, les cartes les plus hautes départagent ; sinon le pot est partagé.</p>`],
    ['Fin de partie', `<p>Un joueur sans jetons est éliminé. Le dernier à en avoir gagne. Les blindes doublent régulièrement pour que la partie finisse.</p>`],
    ['Réglages dans le salon', `<p>Robots à la table (jusqu'à 5), jetons au départ (500, 1 000 ou 2 000) et rythme des blindes (doublées toutes les 5 ou 10 mains, ou jamais). Si un joueur ne répond plus, l'hôte peut passer sa main au bout de 30 secondes ; un joueur déconnecté parle ou se couche automatiquement.</p>`],
  ] },
  { key: 'diapason', parts: [
    ['Le principe', `<p>L'équivalent maison de Wavelength : se mettre sur la même longueur d'onde. Chaque manche, une carte donne deux extrêmes, par exemple « Froid ↔ Chaud » ou « Film nul ↔ Chef-d’œuvre du cinéma ». Une cible est cachée quelque part sur le cadran, entre les deux, et seul le médium la voit.</p>`],
    ['Le médium', `<ul>
      <li>Il cherche un indice qui place la cible au bon endroit : un mot, un nom, un film, un plat, une expression… Pour « Froid ↔ Chaud », « une douche en été » tombe plutôt vers le milieu, « le soleil » tout à droite.</li>
      <li>Il l'écrit sur son téléphone, ou le dit à voix haute. Pas de nombre, pas de pourcentage.</li>
      <li>La carte ne l'inspire pas ? Il peut en changer deux fois par manche, la cible reste au même endroit.</li></ul>`],
    ['Placer l’aiguille', `<p>Les autres font glisser l'aiguille du cadran là où l'indice leur semble tomber. Les boutons ◀ ▶ affinent au millimètre. Puis la cible est dévoilée : plein centre 4 points, les zones voisines 3, puis 2, et rien au-delà.</p>`],
    ['Chacun pour soi', `<p>Le rôle de médium tourne. Chacun place sa propre aiguille sur son téléphone et marque selon sa précision ; le médium gagne la moyenne des points des autres : un indice clair profite à tout le monde. Chacun est médium une, deux ou trois fois, puis le plus gros total gagne.</p>`],
    ['En équipes', `<ul>
      <li>Deux équipes tirées au sort, Corail et Lagon, jouent à tour de rôle ; le médium change à chaque tour de l'équipe.</li>
      <li>L'équipe du médium discute et déplace une aiguille commune : tout le monde la voit bouger en direct. Un membre valide quand l'équipe est d'accord.</li>
      <li>L'équipe adverse parie alors que la cible est plus à gauche ou plus à droite de l'aiguille : 1 point si elle a raison, sauf si l'aiguille est en plein centre.</li>
      <li>Une équipe en retard qui fait un plein centre rejoue aussitôt.</li>
      <li>La première équipe qui atteint le score fixé (7, 10 ou 15) gagne ; à égalité, on continue.</li></ul>`],
    ['Réglages dans le salon', `<p>Chacun pour soi (dès 2 joueurs) ou en équipes (dès 4), nombre de tours de médium, score à atteindre en équipes. Si le médium ne répond plus, l'hôte peut passer son tour au bout d'une minute.</p>`],
  ] },
  { key: 'duel', parts: [
    ['Le principe', `<p>L'équivalent maison de 7 Wonders Duel, pour deux joueurs, ou toi contre le robot. Chacun développe sa cité pendant trois âges. Toutes les cartes et merveilles ont été renommées et écrites pour la Boîte à jeux.</p>`],
    ['Mise en place', `<p>Chaque cité commence avec 7 pièces. Huit merveilles sont tirées : on les repêche quatre par quatre (l'un en prend une, l'autre deux, le premier la dernière), si bien que chacun en a quatre. Cinq jetons progrès sont posés à côté de la piste militaire.</p>`],
    ['La pyramide', `<p>À chaque âge, 20 cartes sont posées en pyramide, une rangée sur deux face cachée. On ne peut prendre qu'une carte libre, que rien ne recouvre. Une carte cachée se retourne dès qu'elle est dégagée. L'âge III mélange 3 guildes, reconnaissables à leur dos 👑.</p>`],
    ['À ton tour', `<ul>
      <li><b>Construire</b> la carte : paye son coût en pièces et en ressources. Elle rejoint ta cité.</li>
      <li><b>La défausser</b> : +2 pièces, plus 1 par bâtiment jaune de ta cité.</li>
      <li><b>Bâtir une merveille</b> : glisse la carte sous une de tes merveilles et paye le coût de la merveille. Il n'y aura que 7 merveilles en tout : dès la septième, la dernière est perdue.</li></ul>`],
    ['Ressources et achats', `<ul>
      <li>Les cartes marron (🪵 bois, 🧱 argile, 🪨 pierre) et grises (🧪 verre, 📜 papyrus) produisent à chaque tour, sans s'épuiser.</li>
      <li>Ce qui manque s'achète à la banque : 2 pièces par ressource, plus 1 par exemplaire que ton adversaire produit avec ses cartes marron et grises. Les dépôts et la douane fixent le prix à 1.</li>
      <li>Certaines cartes jaunes et merveilles produisent une ressource au choix à chaque tour.</li>
      <li><b>Enchaînements :</b> une carte marquée d'un symbole (🎭, 🌙, 📖…) rend gratuite la carte d'un âge suivant qui le demande.</li></ul>`],
    ['Les couleurs', `<ul>
      <li><b>Bleu :</b> des points de victoire.</li>
      <li><b>Vert :</b> un symbole scientifique. Deux fois le même symbole : tu prends un jeton progrès.</li>
      <li><b>Rouge :</b> des boucliers ; le pion militaire avance d'autant vers la capitale adverse. En passant les cases 3 et 6, il pille 2 puis 5 pièces à l'adversaire.</li>
      <li><b>Jaune :</b> des pièces, des achats moins chers, des productions au choix, et à l'âge III des points.</li>
      <li><b>Violet (guildes) :</b> des pièces et des points selon la cité la mieux fournie dans un domaine.</li></ul>`],
    ['Victoire', `<ul>
      <li><b>Militaire :</b> le pion atteint ta capitale adverse, victoire immédiate.</li>
      <li><b>Scientifique :</b> 6 symboles scientifiques différents (la Loi en compte un), victoire immédiate.</li>
      <li><b>Civile :</b> sinon, à la fin de l'âge III, on additionne bleus, verts, jaunes, guildes, merveilles, jetons progrès, 1 point par 3 pièces, et la piste militaire (2, 5 ou 10 points). À égalité, le plus de points bleus l'emporte.</li></ul>`],
    ['Entre deux âges', `<p>Le joueur le plus faible militairement choisit qui commence l'âge suivant ; à égalité, c'est celui qui a pris la dernière carte.</p>`],
  ] },
];

let rulesBuilt = false;
function buildRules() {
  if (rulesBuilt) return;
  const root = $('#rules-main');
  const toc = el('nav', 'rules-toc'); toc.setAttribute('aria-label', 'Sommaire des jeux');
  const list = el('div', 'rules-list');
  const famOrder = FAMILIES.flatMap(f => f.games);
  const ordered = [...RULES].sort((x, y) => (famOrder.indexOf(x.key) + 1 || 99) - (famOrder.indexOf(y.key) + 1 || 99));
  ordered.forEach(g => {
    const card = document.querySelector(`.gcard[data-game="${g.key}"]`);
    if (!card) return;
    const art = card.querySelector('.gart')?.innerHTML || '';
    const name = card.querySelector('.gname')?.textContent || g.key;
    const desc = card.querySelector('.gdesc')?.textContent || '';
    const m = card.querySelector('.gmeta'), meta = m ? `${m.querySelector('b')?.textContent || ''} joueurs · ${m.querySelector('i')?.textContent || ''}`.replace('joueurs joueurs', 'joueurs') : '';
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
