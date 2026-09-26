/* Règles détaillées de tous les jeux, sur une page à part ouverte depuis l'accueil.
   Chaque jeu reprend l'icône, le nom et la couleur de sa carte d'accueil, puis ses règles complètes.
   Chargé après app.js : réutilise $, el et show. */

'use strict';

const RULES = [
  { key: 'timeline', parts: [
      ['Le principe', `<p>Des extraits de chansons à ranger par année. Chacun construit sa propre frise, et le premier qui atteint le nombre de cartes fixé gagne.</p>`],
      ['Mise en place', `<p>Chacun reçoit une première chanson, déjà placée et datée. L’hôte choisit les playlists, le nombre de cartes pour gagner (5, 7, 10 ou 15) et d’où sort le son. Au choix, le téléphone du joueur actif, le sien branché sur une enceinte, ou tous les téléphones.</p>`],
      ['À ton tour', `<ul>
        <li>Un extrait se lance. Écoute, puis touche le «&nbsp;+&nbsp;» à sa place dans ta frise. Avant, entre ou après tes cartes.</li>
        <li>Bonne place, la carte rejoint ta frise avec son année. Mauvaise place, elle est perdue.</li>
        <li>Avant de placer, tu peux écrire l’artiste et le titre. Les deux justes, +1 jeton.</li></ul>`],
      ['Les jetons et le pari', `<p>Tu commences avec 2 jetons, 3 au maximum. Ils ne servent qu’à parier.</p><ul>
        <li>Quand le joueur actif a posé sa carte, le premier autre joueur qui se lance prend le pari du tour, pour 1 jeton. Un seul pari par tour, et 12 secondes pour se décider.</li>
        <li>Le parieur choisit la place qu’il croit juste dans la frise du joueur actif.</li>
        <li><b>Pari gagné</b> quand le joueur actif s’est trompé et que le parieur avait raison. La carte part dans la frise du parieur.</li>
        <li><b>Pari perdu</b>, le parieur laisse son jeton et une carte de sa frise. Il ne descend jamais sous une carte.</li></ul>`],
      ['Fin de partie', `<p>Le premier dont la frise atteint le nombre de cartes fixé gagne.</p>`],
      ['Tout seul', `<p>Sans autre joueur, ni jetons ni pari. Tu enchaînes les chansons, tu passes celles que tu ne connais pas, et tu t’arrêtes quand ta frise est pleine.</p>`],
      ['Astuce', `<p>Les tubes ressortis en remix ou en reprise piègent souvent. C’est l’année de la version originale qui compte.</p>`],
    ] },
  { key: 'eclair', parts: [
      ['Le principe', `<p>Tout le monde écoute le même extrait en même temps, chacun sur son téléphone. Il faut trouver le titre en écoutant le moins possible.</p>`],
      ['Déroulement d’une manche', `<ul>
        <li>L’extrait se débloque par paliers, de 0,5 s, 1 s, 2 s, 3 s, puis 5 s.</li>
        <li>Tu tapes un titre quand tu crois l’avoir. Une mauvaise réponse ouvre le palier suivant.</li>
        <li>«&nbsp;Écouter plus&nbsp;» passe au palier suivant sans tenter de réponse. «&nbsp;Je passe&nbsp;» abandonne la manche, sans point.</li>
        <li>La manche finit quand tout le monde a trouvé ou épuisé les paliers. La chanson est alors révélée.</li></ul>`],
      ['Points', `<p>Trouvé à 0,5 s, 5 points. À 1 s, 4. À 2 s, 3. À 3 s, 2. À 5 s, 1. Pas trouvé, 0.</p>`],
      ['Fin de partie', `<p>Après le nombre de manches choisi (5, 10 ou 15), le plus gros total gagne.</p>`],
      ['Réglages dans le salon', `<ul>
        <li><b>Décennies</b>, les années 80, 90, 2000, 2010 et 2020, à cocher ou décocher.</li>
        <li><b>Jeux vidéo</b>, des musiques de jeux qui se glissent parmi les chansons. Pour celles-là, donne le nom du jeu. Un nom trop vague, comme «&nbsp;Zelda&nbsp;», ne coûte pas d’essai&nbsp;: on te demande de préciser.</li></ul>`],
    ] },
  { key: 'sprint', parts: [
      ['Le principe', `<p>La même chanson démarre chez tout le monde au même instant. Le premier à donner l’artiste et le titre prend le plus de points.</p>`],
      ['Déroulement d’une manche', `<ul>
        <li>L’extrait dure 30 secondes. Tu as trois essais par manche.</li>
        <li>La liste de suggestions remplit l’artiste et le titre d’un coup. Bien plus rapide que de tout taper.</li>
        <li>«&nbsp;Je sèche&nbsp;» te retire de la manche, sans point.</li>
        <li>La manche s’arrête à la fin de l’extrait, ou quand tout le monde a répondu.</li></ul>`],
      ['Points', `<p>Selon l’ordre d’arrivée. 5 points pour le premier, 3 pour le deuxième, 2 pour le troisième, 1 pour les suivants.</p>`],
      ['Fin de partie', `<p>Après 5, 10 ou 15 manches, le plus gros total gagne.</p>`],
      ['Réglages dans le salon', `<ul>
        <li><b>Décennies</b> à cocher, et d’où sort le son (tous les téléphones, ou celui de l’hôte en enceinte).</li>
        <li><b>Jeux vidéo</b>. Pour une musique de jeu, donne le nom du jeu.</li>
        <li><b>Animés</b>, génériques et musiques d’anime, facultatifs. Donne le nom de l’anime, pas le titre du morceau.</li></ul>`],
    ] },
  { key: 'sablier', parts: [
      ['Le principe', `<p>Un jeu d’équipes en plusieurs manches, toujours avec les <b>mêmes cartes</b>. Chaque manche est plus dure que la précédente, mais les cartes sont de mieux en mieux connues.</p>`],
      ['Mise en place', `<ul>
        <li>Les équipes sont tirées au sort, ou au choix&nbsp;: chacun rejoint celle qu’il veut. L’hôte peut en ajouter ou en enlever, de deux à quatre.</li>
        <li>Chacun reçoit des cartes (12 par défaut) et en écarte quelques-unes (2 par défaut). Toutes les cartes gardées forment le paquet commun.</li>
        <li>L’hôte choisit les decks, leur difficulté (facile, moyenne, velue) et les manches jouées.</li></ul>`],
      ['À ton tour', `<ul>
        <li>Trois secondes pour te préparer, puis la première carte arrive avec le chrono. 30 secondes par défaut, 60 en manche dessin.</li>
        <li>Tu fais deviner la carte à ton équipe, qui répond à voix haute. Trouvée&nbsp;? Touche «&nbsp;Trouvé&nbsp;», la suivante arrive.</li>
        <li>Tu peux passer autant que tu veux. La carte retourne dans le paquet.</li>
        <li>Au gong, la carte en cours n’est jamais révélée. Si elle a été trouvée pile à la fin, l’hôte peut la compter.</li></ul>`],
      ['Les manches', `<ul>
        <li><b>Description libre&nbsp;:</b> tout est permis, sauf dire un mot de la carte, sa traduction ou sa racine.</li>
        <li><b>Un seul mot&nbsp;:</b> un seul mot par carte, dit une seule fois. Pas de geste, pas de bruit, pas de reformulation.</li>
        <li><b>Mime&nbsp;:</b> pour jouer dans la même pièce. Pas un mot, pas un son, pas de lettre tracée en l’air.</li>
        <li><b>Dessin&nbsp;:</b> tu dessines sur ton téléphone, ton équipe voit le dessin en direct. Pas de lettre, pas de chiffre.</li></ul>
        <p>Une manche s’arrête quand le paquet est vide. On le mélange, et la manche suivante repart avec les mêmes cartes.</p>`],
      ['Points', `<p>Chaque carte trouvée rapporte 1 point à l’équipe. Après la dernière manche, l’équipe qui a le plus de points gagne.</p>`],
      ['Pour s’amuser', `<p>Pendant un tour, le public envoie des réactions. Les équipes qui ne jouent pas peuvent gribouiller sur les bords de l’écran avec le crayon, dans leur couleur. Tout s’efface au tour suivant.</p>`],
      ['Bon à savoir', `<p>Entre deux tours, l’hôte peut retirer une carte comptée par erreur. Les cartes vues les soirs d’avant ne reviennent pas tant qu’il en reste des neuves.</p>`],
    ] },
  { key: 'undercover', parts: [
      ['Le principe', `<p>Tout le monde reçoit le même mot secret, sauf un ou plusieurs <b>undercovers</b>. Leur mot est voisin, et ils ne le savent pas. Avec l’option <b>Mister White</b>, un joueur n’a aucun mot, et lui le sait.</p>`],
      ['Un tour d’indices', `<ul>
        <li>Chacun son tour donne un indice sur son mot, à voix haute. Un mot ou une courte expression, jamais le mot lui-même.</li>
        <li>Tu peux aussi l’écrire dans l’application. Tous les indices sont rappelés au moment du vote.</li>
        <li>Trop précis, tu aides les intrus. Trop vague, tu passes pour l’un d’eux.</li></ul>`],
      ['Le vote', `<ul>
        <li>Chacun vote sur son téléphone pour éliminer un joueur. Le plus désigné est éliminé, et son rôle révélé.</li>
        <li>Égalité&nbsp;? On revote entre les ex æquo.</li>
        <li>Mister White éliminé tente de deviner le mot des civils. S’il trouve, il marque 5 points tout de suite. Dans tous les cas, il reste éliminé et la manche continue.</li></ul>`],
      ['Fin de manche', `<p>Les civils gagnent quand tous les intrus sont éliminés. Les intrus gagnent quand il ne reste plus qu’un civil.</p>`],
      ['Points', `<p>Un civil gagnant marque 2 points, un undercover gagnant 10. Mister White gagne avec les intrus et marque 6 points, plus 5 s’il a deviné le mot des civils. On joue 3, 5 ou 8 manches, avec de nouveaux mots à chaque fois.</p>`],
      ['Réglages dans le salon', `<p>Le nombre d’undercovers (selon la table, ou de 1 à 3) et Mister White. Il reste toujours plus de civils que d’intrus. Sur une petite table, un rôle est retiré d’office.</p>`],
    ] },
  { key: 'geo', parts: [
      ['Le principe', `<p>Une photo à 360° prise dans une rue, quelque part. À toi de deviner où, le plus précisément possible.</p>`],
      ['Déroulement d’une manche', `<ul>
        <li>Regarde autour de toi. Panneaux, langue, plaques, côté de circulation, végétation, architecture, tout est indice.</li>
        <li>Pose ton épingle sur la carte, puis valide. Tant que tu n’as pas validé, tu peux la déplacer.</li>
        <li>La manche s’arrête quand tout le monde a validé, ou au bout du chrono. On découvre alors le vrai lieu et les épingles de chacun.</li></ul>`],
      ['Les modes', `<ul>
        <li><b>Déplacement libre&nbsp;:</b> tu avances le long de la rue avec les flèches.</li>
        <li><b>Sans bouger&nbsp;:</b> tu tournes et tu zoomes, mais tu n’avances pas.</li>
        <li><b>Ni bouger ni zoomer&nbsp;:</b> une seule vue fixe, pour les experts.</li></ul>`],
      ['Points', `<p>Jusqu’à 5&nbsp;000 points par manche. Ils baissent avec la distance, rapportée à la taille de la carte. Se tromper de 200 km coûte bien plus cher sur la carte France que sur la carte Monde.</p>`],
      ['Réglages dans le salon', `<p>Carte Monde, Europe ou France. 3, 5 ou 10 manches. Un chrono de 1 à 5 minutes.</p>`],
      ['Bon à savoir', `<p>Les photos viennent de Mapillary, prises par des contributeurs. Leur qualité varie d’un lieu à l’autre.</p>`],
    ] },
  { key: 'chromo', parts: [
      ['Le principe', `<p>Vider sa main avant les autres. 108 cartes en quatre couleurs, et des cartes spéciales pour piéger les voisins.</p>`],
      ['Mise en place', `<p>Chacun reçoit 7 cartes. Une carte chiffrée est retournée pour ouvrir la défausse.</p>`],
      ['À ton tour', `<ul>
        <li>Pose une carte de la même couleur ou du même symbole que celle du dessus.</li>
        <li>Tu ne peux pas, ou tu ne veux pas ? Pioche. Si la carte piochée va, tu peux la poser tout de suite ou la garder. Sinon, ton tour passe.</li></ul>`],
      ['Les cartes spéciales', `<ul>
        <li><b>Passe.</b> Le joueur suivant saute son tour.</li>
        <li><b>Sens.</b> Le sens du jeu s’inverse. À deux joueurs, elle fait sauter le tour de l’autre.</li>
        <li><b>+2.</b> Le suivant pioche deux cartes et passe son tour.</li>
        <li><b>Joker.</b> Il se pose sur tout, et tu choisis la nouvelle couleur.</li>
        <li><b>Joker +4.</b> Pareil, et le suivant pioche quatre cartes.</li>
        <li><b>Règle du zéro</b>, en option. Quand un 0 est posé, chacun passe toute sa main à son voisin, dans le sens du jeu.</li>
        <li><b>Cumul</b>, en option. On répond à un +2 par un +2 ou un +4, à un +4 par un +4. Le premier qui ne peut pas contrer pioche le total.</li></ul>`],
      ['« Chromo ! »', `<p>Plus qu’une ou deux cartes en main ? Touche « Chromo ! ». Si tu tombes à une carte sans l’avoir crié, n’importe qui peut t’attraper tant que le joueur suivant n’a pas joué. Deux cartes de pénalité.</p>`],
      ['Points', `<p>Le gagnant d’une manche marque la valeur des cartes restées chez les autres. Le chiffre pour une carte numérotée, 20 pour Passe, Sens et +2, 50 pour les jokers. Après 1, 3 ou 5 manches, le plus gros total gagne.</p>`],
      ['Robots', `<p>Jusqu’à trois robots peuvent compléter la table. Ils jouent seuls et attrapent ceux qui oublient de crier.</p>`],
    ] },
  { key: 'kems', parts: [
      ['Le principe', `<p>Quatre joueurs, deux équipes de deux, partenaires face à face. Il faut réunir un carré, quatre cartes de même valeur, et le faire savoir à son partenaire par un signal secret. Sans que ceux d’en face le remarquent.</p>`],
      ['Avant de jouer', `<p>Chaque équipe convient en cachette d’un signal discret. Un clin d’œil, une main dans les cheveux, un mot glissé dans la conversation. Les signaux ne passent pas par l’application, Kems se joue autour d’une table ou en visio.</p>`],
      ['Déroulement', `<ul>
        <li>Chacun a quatre cartes en main, quatre sont posées au milieu. Pas de tour de jeu, tout le monde joue en même temps.</li>
        <li>Touche une carte de ta main puis une carte du milieu pour les échanger. Si quelqu’un l’a prise avant toi, tu es prévenu. Échange autant que tu veux.</li>
        <li>Plus rien ne te tente ? Touche « Je passe ». Dès que les quatre ont passé, le milieu est remplacé. L’hôte peut aussi le renouveler si plus rien ne bouge.</li></ul>`],
      ['Les annonces', `<ul>
        <li><b>« Kems ! »</b> quand tu crois avoir vu le signal de ton partenaire. S’il a bien un carré, 1 point pour vous, 2 si tu en avais un aussi. Sinon, 1 point pour les adversaires.</li>
        <li><b>« Contre-Kems ! »</b> quand tu penses qu’un adversaire tient un carré. Vrai, 1 point pour vous. Faux, 1 point pour eux.</li>
        <li>Une erreur coûte un point, alors les deux boutons demandent un second toucher pour confirmer.</li></ul>`],
      ['Fin de partie', `<p>Après chaque annonce, les quatre mains sont révélées et une nouvelle donne commence. La première équipe qui atteint le score fixé gagne, 5 points par défaut.</p>`],
      ['Équipes et robots', `<p>L’hôte range chaque joueur dans une équipe, ou tire au sort. Au-delà de quatre, les autres regardent. Des robots peuvent compléter la table. Un robot qui tient un carré fait un signe visible seulement sur l’écran de son partenaire, et il finit par remarquer le tien.</p>`],
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
      ['Le principe', `<p>Des images qui font rêver, et des indices. Le conteur doit faire trouver sa carte à certains joueurs, pas à tous. Son indice ne doit être ni trop clair, ni trop obscur.</p>`],
      ['Mise en place', `<p>Chacun reçoit six cartes. Dans le salon, l’hôte choisit le paquet. Des tableaux, gravures et estampes du domaine public, les mèmes et GIF de Mème pas vrai, ou les deux mélangés. Les GIF tournent en boucle, sans le son.</p><p>Touche une carte pour la voir en grand. Les cartes déjà vues lors des soirées précédentes sortent en dernier. Le rôle de conteur tourne à chaque manche.</p>`],
      ['Déroulement d’une manche', `<ul>
        <li><b>Le conteur</b> choisit une carte de sa main et lance un indice. Un mot, une phrase, un titre de chanson, un bruit. Il le tape dans l’application ou le dit à voix haute.</li>
        <li><b>Les autres</b> choisissent dans leur main la carte qui colle le mieux à l’indice, pour faire croire que c’est celle du conteur.</li>
        <li><b>Le vote.</b> Les cartes jouées sont mélangées. Chacun, sauf le conteur, vote pour celle qu’il croit être la sienne. Pas le droit de voter pour sa propre carte.</li>
        <li>La révélation montre à qui était chaque carte et qui a voté pour quoi. Chacun complète ensuite sa main à six cartes.</li></ul>`],
      ['Les jokers', `<p>Chacun a 3 jokers pour toute la partie, réglable dans le salon. Quand tu veux, ouvre une carte de ta main et sors un joker. 5 cartes de la pioche te sont proposées, tu en gardes une à la place de la tienne, les autres repartent sous la pioche. Tu peux annuler sans perdre ton joker. Une carte déjà jouée pendant la manche ne s’échange pas.</p>`],
      ['Points', `<ul>
        <li>Tout le monde a trouvé, ou personne ? Le conteur marque 0, les autres 2.</li>
        <li>Sinon, le conteur et ceux qui ont trouvé marquent 3.</li>
        <li>En plus, chaque joueur sauf le conteur marque 1 point par vote reçu sur sa carte, 3 au maximum.</li></ul>`],
      ['Fin de partie', `<p>La partie s’arrête dès qu’un joueur atteint le score fixé, 15, 30 ou 45 points, ou quand la pioche est épuisée. Il faut au moins trois joueurs. Le jeu est meilleur à cinq ou six.</p>`],
    ] },
  { key: 'douze', parts: [
      ['Le principe', `<p>Finir chaque manche avec le total le plus bas. Tu as douze cartes face cachée devant toi, en trois lignes de quatre, avec des valeurs de -2 à 12.</p>`],
      ['Mise en place', `<p>Chacun retourne deux cartes de son choix. Le joueur qui a le plus haut total visible commence.</p>`],
      ['À ton tour', `<ul>
        <li><b>Pioche</b> une carte. Pose-la sur une de tes cartes, visible ou cachée, et l’ancienne part à la défausse. Ou défausse-la, et retourne alors une de tes cartes cachées.</li>
        <li>Ou <b>prends la carte du dessus de la défausse</b>. Celle-là se pose forcément sur une de tes cartes.</li></ul>`],
      ['Les colonnes', `<p>Trois cartes identiques face visible dans une même colonne, et la colonne disparaît. Elle ne compte plus. Idéal pour se débarrasser de trois 12.</p>`],
      ['Fin de manche', `<ul>
        <li>Quand un joueur a retourné toutes ses cartes, chacun des autres joue un dernier tour.</li>
        <li>Toutes les cartes sont alors révélées et chacun marque la somme de sa grille.</li>
        <li>Si celui qui a fermé la manche n’a pas strictement le plus petit total, son score de la manche double. Sauf s’il est nul ou négatif.</li></ul>`],
      ['Fin de partie', `<p>Dès qu’un joueur atteint le seuil fixé, 50, 100 ou 150 points, la partie s’arrête. Le plus petit total gagne.</p>`],
      ['Astuces', `<p>Les négatifs sont précieux, les cartes rouges (9 à 12) à fuir. Fermer vite met la pression, mais un score doublé fait mal. Jusqu’à trois robots peuvent compléter la table.</p>`],
    ] },
  { key: 'petitbac', parts: [
      ['Le principe', `<p>Une lettre est tirée au sort. Pour chaque catégorie, un prénom, un pays, un animal, il faut trouver un mot qui commence par cette lettre. Plus vite et plus original que les autres.</p>`],
      ['Mise en place', `<p>L’hôte choisit les catégories dans une liste ou en invente, jusqu’à 14. Il règle aussi le nombre de manches, le temps d’écriture et les lettres difficiles (K, Q, W, X, Y, Z), exclues par défaut. Une lettre ne revient pas tant que les autres n’ont pas été tirées.</p>`],
      ['Écrire', `<ul>
        <li>Chacun remplit ses catégories sur son téléphone, sans voir celles des autres.</li>
        <li>Les articles ne comptent pas. « La Rochelle » vaut pour R, « L’Oréal » pour O. Une réponse qui ne commence pas par la bonne lettre s’affiche en rouge.</li>
        <li>La touche Entrée passe à la catégorie suivante.</li></ul>`],
      ['« Stop ! »', `<p>Le bouton Stop s’active quand toutes tes catégories sont remplies. Dès qu’un joueur le touche, les autres ont encore trois secondes, puis tout le monde pose son stylo. Si personne ne crie stop, la manche s’arrête à la fin du chrono.</p><p>L’hôte peut couper cette règle dans le salon. Chacun touche alors « J’ai fini » quand il a terminé, et peut reprendre sa feuille tant que la manche continue. La manche s’arrête quand tout le monde a fini, ou à la fin du chrono.</p>`],
      ['La vérification', `<ul>
        <li>Toutes les réponses s’affichent, catégorie par catégorie, avec les points provisoires.</li>
        <li>Touche une réponse douteuse pour la contester, touche-la encore pour annuler. Elle est refusée si au moins la moitié des autres joueurs la conteste.</li>
        <li>L’hôte peut trancher une réponse, dans un sens ou dans l’autre, même si elle ne commence pas par la bonne lettre.</li>
        <li>Les points sont comptés quand tout le monde a touché « J’ai vérifié », ou quand l’hôte le décide.</li></ul>`],
      ['Points', `<p>10 points pour une réponse que personne d’autre n’a donnée, 5 si au moins un autre joueur a la même, 0 pour une case vide, refusée ou qui ne commence pas par la bonne lettre. Les pluriels et les accents ne comptent pas pour repérer les doublons.</p>`],
      ['Fin de partie', `<p>Après le nombre de manches choisi, le plus gros total gagne.</p>`],
      ['Astuce', `<p>Les réponses évidentes rapportent souvent 5. Un mot moins attendu, mais incontestable, vaut le double.</p>`],
    ] },
  { key: 'loupgarou', parts: [
      ['Le principe', `<p>Des loups-garous se cachent parmi les villageois. Chaque nuit, ils dévorent quelqu’un. Chaque jour, le village vote pour éliminer un suspect. Pas besoin de meneur&nbsp;: l’application réveille les rôles, annonce les morts et compte les votes. Le téléphone de l’hôte peut même faire la voix du narrateur.</p>`],
      ['Mise en place', `<ul>
        <li>De 5 à 20 joueurs. Le nombre de loups se règle tout seul (1 jusqu’à 6 joueurs, 2 jusqu’à 11, 3 au-delà) ou l’hôte le choisit. Les rôles spéciaux se cochent dans le salon.</li>
        <li>Chacun découvre son rôle en maintenant sa carte appuyée, à l’abri des regards, puis touche «&nbsp;J’ai vu mon rôle&nbsp;». Les loups voient qui sont leurs complices.</li></ul>`],
      ['Les rôles', `<ul>
        <li><b>Loup-Garou.</b> Chaque nuit, les loups se mettent d’accord sur une victime. Le jour, ils se font passer pour des villageois.</li>
        <li><b>Villageois.</b> Aucun pouvoir, seulement son flair et sa voix.</li>
        <li><b>Voyante.</b> Chaque nuit, elle découvre le vrai rôle d’un joueur.</li>
        <li><b>Sorcière.</b> Elle apprend qui les loups ont choisi. Elle a une potion de vie pour le sauver et une potion de mort pour empoisonner qui elle veut. Une seule fois chacune, pour toute la partie.</li>
        <li><b>Chasseur.</b> Quand il meurt, de nuit comme de jour, il tire une dernière balle sur le joueur de son choix.</li>
        <li><b>Cupidon.</b> La première nuit, il désigne deux amoureux, qui se reconnaissent. Si l’un meurt, l’autre meurt de chagrin.</li>
        <li><b>Salvateur.</b> Chaque nuit, il protège un joueur des loups, jamais le même deux nuits de suite. Il peut se protéger lui-même.</li></ul>`],
      ['La nuit', `<ul>
        <li>Tout le monde ferme les yeux. Les rôles se réveillent dans l’ordre&nbsp;: Cupidon et les amoureux (la première nuit), Salvateur, Loups-Garous, Voyante, Sorcière.</li>
        <li>Quand c’est ton tour, ton téléphone vibre (sur Android) et affiche ton action. Les autres voient l’écran de nuit.</li>
        <li>Chaque étape dure un moment, même si le rôle est mort ou absent de la partie. Personne ne peut deviner qui agit.</li>
        <li>Les loups doivent être d’accord sur leur victime. Sinon, à la fin du temps, c’est la plus choisie qui y passe.</li></ul>`],
      ['Le jour', `<ul>
        <li>Les morts de la nuit sont annoncés, et leur rôle révélé.</li>
        <li>Le village débat à voix haute, puis chacun vote sur son téléphone pour un suspect. On peut changer d’avis jusqu’au bout. Quand tout le monde a voté, il reste 5 secondes. L’hôte peut aussi clore le vote.</li>
        <li>Le plus désigné est éliminé, et son rôle révélé. Égalité&nbsp;? On revote entre les ex æquo. Nouvelle égalité, personne n’est éliminé.</li></ul>`],
      ['Les morts', `<p>Un joueur mort garde le silence jusqu’à la fin. Avec l’option du salon, il voit tous les rôles et profite du spectacle.</p>`],
      ['Fin de partie', `<ul>
        <li>Le village gagne quand tous les loups sont morts.</li>
        <li>Les loups gagnent quand il ne reste plus que des loups.</li>
        <li>Deux amoureux de camps différents (un loup et un villageois) gagnent ensemble s’ils sont les deux derniers en vie.</li></ul>
        <p>À la fin, tous les rôles sont révélés. L’hôte peut relancer une partie avec de nouveaux rôles.</p>`],
    ] },
  { key: 'naufrages', parts: [
      ['Le principe', `<p>Le bateau a coulé, vous voilà échoués sur une île. Pour vous en sortir, construisez un radeau et partez avant l’ouragan, sans mourir de faim ni de soif. Tout le monde coopère, tant qu’il y en a assez pour tous. Ceux qui embarquent gagnent, les autres restent sur l’île.</p>`],
      ['La réserve du camp', `<p>Poissons, eau et bois sont mis en commun et affichés à l’écran, avec le nombre de places sur le radeau&nbsp;: 4 morceaux de bois par place. On démarre avec quelques vivres rescapés du naufrage.</p>`],
      ['Chaque jour', `<ul>
        <li>La météo du jour fixe l’eau récoltée, de 1 ration (grand soleil) à 4 (pluie battante).</li>
        <li>Chacun choisit une action en secret, et peut en changer tant que tout le monde n’a pas choisi.</li>
        <li><b>Pêcher</b> rapporte de 1 à 4 poissons. <b>Chercher de l’eau</b> dépend de la météo.</li>
        <li><b>Couper du bois</b> rapporte 1 morceau. Tu peux tenter jusqu’à 5 morceaux de plus&nbsp;: à chaque morceau tenté, une chance sur six d’être mordu par un serpent. Mordu, tu ne rapportes rien et tu es malade deux jours.</li>
        <li><b>Fouiller l’épave</b> rapporte un objet que toi seul connais.</li>
        <li>Le compte rendu de la journée s’affiche ensuite pour tout le monde.</li></ul>`],
      ['Le soir', `<ul>
        <li>Chaque survivant mange un poisson et boit une ration d’eau.</li>
        <li>Pas assez pour tout le monde&nbsp;? Le camp vote. Le plus désigné est sacrifié, et on recommence jusqu’à ce que les réserves suffisent. À égalité, le hasard tranche. Le vote dure 45 secondes au plus, alors discutez vite.</li>
        <li>Les affaires d’un disparu retournent dans l’épave.</li></ul>`],
      ['Le départ', `<ul>
        <li>Dès qu’il y a une place et de quoi manger et boire pour chacun pendant la traversée, l’hôte peut lancer le départ. Il peut aussi rester un jour de plus pour faire des réserves.</li>
        <li>L’ouragan arrive un soir, sans prévenir (vers le jour 8 à 11 en partie normale). Il force le départ. S’il manque des places ou des vivres, le camp vote pour savoir qui reste sur l’île.</li></ul>`],
      ['Les objets de l’épave', `<ul>
        <li><b>Conserve</b> et <b>gourde</b>&nbsp;: +3 poissons ou +3 rations dans la réserve.</li>
        <li><b>Hache</b>&nbsp;: ta prochaine coupe rapporte 3 morceaux de plus. <b>Canne à pêche</b>&nbsp;: ta prochaine pêche rapporte 2 poissons de plus.</li>
        <li><b>Corde</b>&nbsp;: +1 place sur le radeau. <b>Antidote</b>&nbsp;: soigne un malade. <b>Longue-vue</b>&nbsp;: tu vois en secret la météo des 3 prochains jours.</li>
        <li><b>Pistolet</b>&nbsp;: pendant un vote, abat directement le joueur de ton choix. <b>Talisman</b>&nbsp;: si tu es désigné au vote, tu survis et on revote sans toi.</li>
        <li>Personne ne sait ce que tu as trouvé. À toi de choisir quand t’en servir, ou de le garder pour toi.</li></ul>`],
      ['Réglages', `<p>Partie courte, normale ou longue&nbsp;: l’ouragan arrive plus ou moins tôt. De 3 à 12 joueurs, robots compris. Jusqu’à 6 robots peuvent compléter le camp. Ils font leur part du travail, votent souvent avec la majorité, et il arrive qu’un robot armé sorte son pistolet.</p>`],
    ] },
  { key: 'memes', parts: [
      ['Le principe', `<p>Une situation s’affiche, par exemple « Quand le wifi coupe en pleine partie ». Chacun pose en secret le mème ou le GIF de sa main qui y répond le mieux. Le plus drôle marque.</p>`],
      ['Les cartes', `<p>Chacun a 7 cartes en main, des modèles de mèmes et de GIF de la bibliothèque publique d’Imgflip. Les GIF tournent en boucle, sans le son. Touche une carte pour la voir en grand, avec la phrase.</p><p>Après chaque manche, les mains sont complétées. Les cartes et les phrases déjà vues lors des soirées précédentes sortent en dernier.</p>`],
      ['Qui décide', `<ul>
        <li><b>Avec un juge</b>, le réglage par défaut. À chaque manche, un joueur différent ne pose pas de carte. Il voit les mèmes, mélangés et anonymes, et garde son préféré. 1 point pour son auteur.</li>
        <li><b>Tout le monde vote.</b> Chacun vote pour le meilleur mème, jamais pour le sien. Chaque vote reçu vaut 1 point.</li></ul>`],
      ['Changer sa main', `<p>Rien ne colle ? Une fois par manche, tu peux échanger toute ta main contre 1 point.</p>`],
      ['Fin de partie', `<p>Le premier qui atteint le score fixé, 5, 7 ou 10 points, gagne. On joue avec des images seulement, des GIF seulement, ou les deux.</p>`],
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
      ['Le principe', `<p>La patience classique (Klondike), en course. Tout le monde reçoit exactement la même donne et joue sur son écran. Une barre montre en direct combien de cartes chacun a montées.</p>`],
      ['Le but', `<p>Monter les 52 cartes sur les quatre fondations, une par couleur, de l’as au roi.</p>`],
      ['Déplacer les cartes', `<ul>
        <li>Dans les sept colonnes, une carte se pose sur la valeur juste au-dessus, de couleur opposée. Un 6 noir va sur un 7 rouge.</li>
        <li>Une suite entière de cartes visibles se déplace d’un coup. Une colonne vide n’accepte qu’un roi, ou une suite qui commence par un roi.</li>
        <li>Une carte cachée se retourne dès qu’elle est découverte.</li>
        <li>Touche une carte, elle file au meilleur endroit, la fondation d’abord. Plusieurs colonnes possibles ? Elles s’allument, et tu touches celle que tu veux.</li>
        <li>Tu préfères faire toi-même ? Fais glisser la carte, ou la suite à partir d’elle, jusqu’à la colonne ou la fondation voulue. Lâchée au mauvais endroit, elle revient à sa place.</li></ul>`],
      ['La pioche', `<p>Touche la pioche pour retourner une carte sur le talon, ou trois selon le réglage. Seule la carte du dessus du talon se joue. Pioche vide ? Touche-la pour recycler le talon, autant de fois que tu veux.</p>`],
      ['Fin de partie', `<p>Le premier qui termine gagne. Au bout du temps choisi, ou quand l’hôte arrête la course, on classe au nombre de cartes montées, puis au nombre de coups. Quand toutes les cartes sont visibles, un bouton finit la patience tout seul.</p>`],
      ['Réglages dans le salon', `<p>Pioche d’une ou de trois cartes, et durée de la course : 5, 10, 15 minutes ou sans limite.</p>`],
    ] },
  { key: 'poker', parts: [
      ['Le principe', `<p>Texas Hold’em, avec des jetons pour de faux. Chacun reçoit deux cartes cachées, cinq cartes communes arrivent au milieu de la table. La meilleure main de cinq cartes, prises parmi tes deux cartes et les cinq communes, ramasse le pot.</p>`],
      ['Une main', `<ul>
        <li>Le bouton D tourne à chaque main. Les deux joueurs suivants posent la petite et la grosse blinde, des mises forcées.</li>
        <li><b>Avant le flop</b>, on parle chacun son tour, en commençant par le joueur après la grosse blinde.</li>
        <li><b>Le flop</b> pose trois cartes communes, puis nouveau tour d’enchères. <b>Le turn</b> ajoute une quatrième carte, <b>la river</b> la cinquième.</li>
        <li>À l’abattage, les mains encore en jeu se montrent et la meilleure ramasse le pot. Si tout le monde se couche, le dernier debout ramasse sans rien montrer.</li></ul>`],
      ['À ton tour', `<ul>
        <li><b>Se coucher.</b> Tu abandonnes la main, et ce que tu as déjà misé.</li>
        <li><b>Parler.</b> Tu ne mises rien. Possible seulement si personne n’a misé.</li>
        <li><b>Suivre.</b> Tu égalises la mise en cours.</li>
        <li><b>Relancer.</b> Au moins le montant de la dernière relance en plus. Le curseur et les boutons ½ pot, pot et tapis règlent la somme.</li>
        <li><b>Tapis.</b> Tu mises tout. Tu ne peux alors gagner que ce que tu as pu couvrir chez chacun, le reste forme un pot annexe entre les autres.</li></ul>`],
      ['Les mains', `<p>De la plus faible à la plus forte : carte haute, paire, double paire, brelan, quinte (cinq cartes qui se suivent, l’as compte aussi pour 1), couleur (cinq cartes de la même couleur), full (un brelan et une paire), carré, quinte flush. À combinaison égale, les cartes les plus hautes départagent. Sinon, on partage le pot.</p>`],
      ['Fin de partie', `<p>Plus de jetons, tu es éliminé. Le dernier à en avoir gagne. Les blindes doublent régulièrement, pour que la partie finisse un jour.</p>`],
      ['Réglages dans le salon', `<p>Robots à la table (jusqu’à 5), jetons au départ (500, 1 000 ou 2 000) et rythme des blindes (doublées toutes les 5 ou 10 mains, ou jamais). Un joueur ne répond plus ? Au bout de 30 secondes, l’hôte peut passer son tour. Un joueur déconnecté parle ou se couche tout seul.</p>`],
    ] },
  { key: 'diapason', parts: [
      ['Le principe', `<p>L’équivalent maison de Wavelength. Le but, se mettre sur la même longueur d’onde. À chaque manche, une carte donne deux extrêmes, par exemple « Froid ↔ Chaud » ou « Film nul ↔ Chef-d’œuvre du cinéma ». Une cible se cache quelque part sur le cadran, entre les deux, et seul le médium la voit.</p>`],
      ['Le médium', `<ul>
        <li>Il cherche un indice qui place la cible au bon endroit. Un mot, un nom, un film, un plat, une expression. Pour « Froid ↔ Chaud », « une douche en été » tombe plutôt vers le milieu, « le soleil » tout à droite.</li>
        <li>Il l’écrit sur son téléphone, ou le dit à voix haute. Pas de nombre, pas de pourcentage.</li>
        <li>La carte ne l’inspire pas ? Il peut en changer deux fois par manche. La cible ne bouge pas.</li></ul>`],
      ['Placer l’aiguille', `<p>Les autres font glisser l’aiguille du cadran là où l’indice leur semble tomber. Les boutons ◀ ▶ affinent au millimètre. Puis la cible se dévoile. Plein centre 4 points, les zones voisines 3, puis 2, et rien au-delà.</p>`],
      ['Chacun pour soi', `<p>Le rôle de médium tourne. Chacun place sa propre aiguille sur son téléphone et marque selon sa précision. Le médium gagne la moyenne des points des autres, alors un indice clair profite à tout le monde. Chacun est médium une, deux ou trois fois, puis le plus gros total gagne.</p>`],
      ['En équipes', `<ul>
        <li>Deux équipes tirées au sort, Corail et Lagon, jouent à tour de rôle. Le médium change à chaque tour de l’équipe.</li>
        <li>L’équipe du médium discute et bouge une aiguille commune, que tout le monde voit bouger en direct. Un membre valide quand l’équipe est d’accord.</li>
        <li>L’équipe adverse parie alors que la cible est plus à gauche ou plus à droite de l’aiguille. 1 point si elle a raison, sauf si l’aiguille est en plein centre.</li>
        <li>Une équipe en retard qui fait un plein centre rejoue aussitôt.</li>
        <li>La première équipe qui atteint le score fixé, 7, 10 ou 15 points, gagne. À égalité, on continue.</li></ul>`],
      ['Réglages dans le salon', `<p>Chacun pour soi dès 2 joueurs, ou en équipes dès 4. Le nombre de tours de médium, et le score à atteindre en équipes. Si le médium ne répond plus, l’hôte peut passer son tour au bout d’une minute.</p>`],
    ] },
  { key: 'duel', parts: [
      ['Le principe', `<p>L’équivalent maison de 7 Wonders Duel, à deux joueurs, ou toi contre le robot. Chacun développe sa cité pendant trois âges. Toutes les cartes et merveilles ont été renommées et écrites pour la Boîte à jeux.</p>`],
      ['Mise en place', `<p>Chaque cité commence avec 7 pièces. Huit merveilles sont tirées et se repêchent quatre par quatre. L’un en prend une, l’autre deux, le premier la dernière, si bien que chacun en a quatre. Cinq jetons progrès attendent à côté de la piste militaire.</p>`],
      ['La pyramide', `<p>À chaque âge, 20 cartes forment une pyramide, une rangée sur deux face cachée. On ne prend qu’une carte libre, que rien ne recouvre. Une carte cachée se retourne dès qu’elle est dégagée. L’âge III glisse 3 guildes dans le lot, reconnaissables à leur dos 👑.</p>`],
      ['À ton tour', `<ul>
        <li><b>Construire</b> la carte. Tu paies son coût en pièces et en ressources, elle rejoint ta cité.</li>
        <li><b>La défausser.</b> Tu prends 2 pièces, plus 1 par bâtiment jaune de ta cité.</li>
        <li><b>Bâtir une merveille.</b> Tu glisses la carte sous une de tes merveilles et tu paies le coût de la merveille. Il n’y aura que 7 merveilles en tout. Dès la septième, la dernière est perdue.</li></ul>`],
      ['Ressources et achats', `<ul>
        <li>Les cartes marron (🪵 bois, 🧱 argile, 🪨 pierre) et grises (🧪 verre, 📜 papyrus) produisent à chaque tour, sans jamais s’épuiser.</li>
        <li>Ce qui manque s’achète à la banque. 2 pièces par ressource, plus 1 par exemplaire que ton rival produit avec ses cartes marron et grises. Les dépôts et la douane fixent le prix à 1.</li>
        <li>Certaines cartes jaunes et certaines merveilles produisent une ressource au choix à chaque tour.</li>
        <li><b>Enchaînements.</b> Une carte marquée d’un symbole (🎭, 🌙, 📖…) rend gratuite la carte d’un âge suivant qui le demande.</li></ul>`],
      ['Les couleurs', `<ul>
        <li><b>Bleu.</b> Des points de victoire.</li>
        <li><b>Vert.</b> Un symbole scientifique. Deux fois le même, et tu prends un jeton progrès.</li>
        <li><b>Rouge.</b> Des boucliers. Le pion militaire avance d’autant vers la capitale adverse. En passant les cases 3 et 6, il pille 2 puis 5 pièces à l’adversaire.</li>
        <li><b>Jaune.</b> Des pièces, des achats moins chers, des productions au choix, et à l’âge III des points.</li>
        <li><b>Violet, les guildes.</b> Des pièces et des points selon la cité la mieux fournie dans un domaine.</li></ul>`],
      ['Victoire', `<ul>
        <li><b>Militaire.</b> Le pion atteint la capitale adverse. Victoire immédiate.</li>
        <li><b>Scientifique.</b> 6 symboles scientifiques différents, la Loi en compte un. Victoire immédiate.</li>
        <li><b>Civile.</b> Sinon, à la fin de l’âge III, on additionne bleus, verts, jaunes, guildes, merveilles, jetons progrès, 1 point par tranche de 3 pièces, et la piste militaire (2, 5 ou 10 points). À égalité, le plus de points bleus l’emporte.</li></ul>`],
      ['Entre deux âges', `<p>Le joueur le plus faible militairement choisit qui ouvre l’âge suivant. À égalité, c’est celui qui a pris la dernière carte.</p>`],
    ] },
  { key: 'teldes', parts: [
    ['Le principe', `<p>Le téléphone arabe, mais en dessins. Chaque joueur commence un carnet avec une phrase. Le carnet passe au voisin, qui dessine la phrase ; le suivant ne voit que le dessin et écrit ce qu’il croit y voir ; le suivant dessine cette nouvelle phrase, et ainsi de suite. À la fin, on lit les carnets et on mesure les dégâts.</p>`],
    ['Les étapes', `<ul>
      <li><b>Écrire :</b> une phrase à dessiner. « Inspire-moi » en propose une si l’inspiration manque.</li>
      <li><b>Dessiner :</b> tu vois la phrase du carnet que tu tiens. Crayon, gomme, seau de peinture, trois épaisseurs, douze couleurs, Annuler. Pas de lettres ni de chiffres.</li>
      <li><b>Deviner :</b> tu vois seulement le dernier dessin, et tu écris ce qu’il représente.</li>
      <li>Écriture et devinettes alternent jusqu’à ce que chaque carnet ait fait le tour de la table (ou 5 étapes en version courte).</li></ul>`],
    ['Le temps', `<p>Chaque étape a un chrono (détendu, normal ou rapide). Quand tout le monde a envoyé, on passe tout de suite à la suite. Au gong, ce que tu as commencé part tel quel ; une page vide devient « rien écrit » ou une feuille blanche.</p>`],
    ['La lecture', `<p>L’hôte déroule les carnets page par page, sur tous les écrans à la fois. Lis à voix haute ! Pendant la lecture, touche le cœur des meilleurs moments (jamais les tiens). À la fin, on voit qui a récolté le plus de cœurs.</p>`],
    ['Réglages dans le salon', `<p>Robots (ils écrivent et devinent au hasard, et gribouillent), rythme des étapes, longueur des carnets. De 3 à 12 joueurs.</p>`],
  ] },
  { key: 'nomcode', parts: [
    ['Le principe', `<p>L’équivalent maison de Codenames. Deux équipes, la Rouge et la Bleue, s’affrontent sur une grille de 25 mots. Chaque équipe a un espion : lui seul sait quels mots cachent ses agents.</p>`],
    ['La grille', `<ul>
      <li>9 agents pour l’équipe qui commence, 8 pour l’autre, 7 passants, et 1 assassin.</li>
      <li>Les espions voient les couleurs sur leur écran, les autres joueurs ne voient que les mots.</li></ul>`],
    ['L’indice', `<p>À son tour, l’espion donne un indice d’un seul mot et un nombre : le nombre de mots de la grille qui s’y rapportent. Par exemple « Océan » pour 3 pour Baleine, Vague et Pirate. L’indice ne peut pas être un mot de la grille. « Sans limite » permet de rattraper des mots d’indices précédents.</p>`],
    ['Deviner', `<ul>
      <li>Les agents discutent, pointent un mot (les coéquipiers voient qui pointe quoi), puis le retournent.</li>
      <li>Un de leurs agents : ils peuvent continuer, jusqu’au nombre annoncé plus un.</li>
      <li>Un passant ou un agent adverse : le tour s’arrête, et un agent adverse est offert à l’autre équipe.</li>
      <li>L’assassin : la partie est perdue sur-le-champ.</li>
      <li>Après au moins un mot, on peut s’arrêter là.</li></ul>`],
    ['Victoire', `<p>La première équipe dont tous les agents sont retournés gagne, même si c’est l’adversaire qui a retourné le dernier. Entre deux grilles, les espions changent et l’équipe perdante commence.</p>`],
    ['Réglages et robots', `<p>Les équipes sont tirées au sort ; avant de lancer, chacun peut changer d’équipe ou se proposer comme espion. Les robots savent jouer les deux rôles : un robot espion donne un thème en indice, un robot agent retourne les mots de ce thème. De 4 à 12 joueurs, robots compris.</p>`],
  ] },
];

let rulesBuilt = false;
function buildRules() {
  if (rulesBuilt) return;
  const root = $('#rules-main');
  const toc = el('nav', 'rules-toc'); toc.setAttribute('aria-label', 'Sommaire des jeux');
  const list = el('div', 'rules-list');
  const byKey = Object.fromEntries(RULES.map(g => [g.key, g]));
  FAMILIES.forEach(f => {
    const games = f.games.filter(k => byKey[k] && document.querySelector(`.gcard[data-game="${k}"]`));
    if (!games.length) return;
    toc.appendChild(el('h2', 'rules-fam', f.name));
    const box = el('div', 'rules-toc-list');
    games.forEach(k => {
      const g = byKey[k], card = document.querySelector(`.gcard[data-game="${k}"]`);
      const art = card.querySelector('.gart')?.innerHTML || '';
      const name = card.querySelector('.gname')?.textContent || k;
      const desc = card.querySelector('.gdesc')?.textContent || '';
      const m = card.querySelector('.gmeta');
      const meta = m ? `${m.querySelector('b')?.textContent || ''} joueurs · ${m.querySelector('i')?.textContent || ''}`.replace('joueurs joueurs', 'joueurs') : '';
      const link = el('a', 'rules-chip', `<span class="gart" aria-hidden="true">${art}</span><span class="gname">${name}</span>`);
      link.href = `#r-${k}`;
      link.onclick = e => { e.preventDefault(); $(`#r-${k}`).scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      box.appendChild(link);
      const sec = el('section', 'rules-game'); sec.id = `r-${k}`;
      sec.innerHTML = `<header class="rules-head"><span class="gart" aria-hidden="true">${art}</span><div><h2>${name}</h2><p class="rules-hook">${desc}</p><p class="rules-meta">${meta}</p></div></header>`
        + g.parts.map(([title, html]) => `<div class="rules-part"><h3>${title}</h3>${html}</div>`).join('')
        + '<button class="rules-top" type="button">Retour au sommaire</button>';
      sec.querySelector('.rules-top').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
      list.appendChild(sec);
    });
    toc.appendChild(box);
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
