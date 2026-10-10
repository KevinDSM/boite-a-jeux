# Design

Direction iOS 26 / Liquid Glass, validée le 10/10/2026 (maquette n° 4), sur l'ossature épurée et la voix de meneur de jeu du 26/09/2026. Voir PRODUCT.md pour le pourquoi. Le code de cette couche vit dans `ios.css` et `ios.js`, chargés après `style.css` et `app.js`.

## Thème

Scène : des amis dans un salon le soir, lumière tamisée, téléphone en main. L'appli se comporte comme un objet physique sous verre : des surfaces translucides qui accrochent la lumière, posées sur un fond d'écran, et des mouvements qui suivent le doigt.

- Quatre thèmes, chacun avec son fond d'écran (dégradés radiaux, `--wall`) : Ambre (sombre, par défaut), Minuit (sombre), Crème et Lavande (clairs).
- Le fond d'écran est visible à l'accueil et au salon. En partie, chaque jeu repeint l'écran avec sa propre palette et ses dessins ; seul le cadre commun (barre du haut, boutons, feuilles, message éphémère) passe au verre, teinté depuis la palette du jeu.

## Le verre

- Recette complète, jamais le flou seul : teinte (`--glass-tint`) + `backdrop-filter: blur() saturate()` + reflet sur l'arête haute (`--glass-hi`) + liseré fin intérieur (`--glass-rim`) et extérieur (`--glass-edge`) + ombre douce (`--glass-shadow`). Classes `.glass` et `.glass-thick` (jamais `.lg`, déjà pris par `.btn.lg`).
- Deux épaisseurs : normale (widgets, listes, pastilles, dock) et épaisse (panneau du salon sur PC, feuilles). Les feuilles ajoutent un fond dense sous la teinte : du texte long se lit dessus, rien ne doit transparaître.
- La barre du haut reste UNIE (`--wall-base` hors jeu, `--bg` en jeu) : iOS 26 prélève sa couleur pour la barre d'état. Ses boutons sont des pastilles de verre rondes de 44 px.
- Texte posé directement sur le fond d'écran : `--icon-label` et son ombre portée `--icon-label-shadow`, comme les étiquettes de l'écran d'accueil d'un iPhone.
- Replis : « réduire la transparence » ou pas de `backdrop-filter` → fond opaque ; « contraste élevé » → fond opaque et liseré plein.

## Couleurs

- Jetons partagés : `--bg`, `--surface`, `--surface-2`, `--line`, `--ink`, `--ink-2`, `--mute`, `--acc` (action principale et sélection uniquement), `--on-acc`, `--pos`, `--neg`. Dans le salon et les feuilles, ils sont redirigés vers les jetons du verre (`--glass-ink`, `--glass-field`…).
- Stratégie : retenue. La couleur forte appartient aux jeux : leur tuile d'icône (`IH_COLORS` dans ios.js), leur écran de partie.
- Thèmes clairs : l'accent est foncé (66 % + noir) sous un texte blanc pour tenir l'AA.
- Contraste mesuré à travers le verre, au pire cas (5e centile des pixels derrière le texte) : ≥ 4,5 pour le texte courant, ≥ 3 pour le grand texte, dans les quatre thèmes.

## Icônes

- Chaque jeu a une icône modélisée dans Blender (`tools/icons/build_icons.py` + `more_icons.py`, Cycles, vue Standard), exportée en WebP 192 px (`tools/icons/export_web.py` → `icons/web/<jeu>.webp`). Miroir, Les règles et Jouer seul ont aussi la leur.
- L'objet est posé sur une tuile arrondie dégradée de la couleur du jeu (`.ih-ic`, rayon 14 px à 62 px, reflet en haut). Le dessin plat du jeu ne sert plus que de secours si l'image ne charge pas.
- Nouvelle icône : une fonction `icon_<jeu>()` qui construit l'objet face à -Y, `frame()` cadre tout seul ; aperçu rapide avec `ICON_PREVIEW=1`, planche avec `tools/icons/preview.py`.

## Typographie

- Une seule famille : la police du système.
- Échelle d'Apple : grand titre 34 px, titres 28 / 22 / 20, corps 17, sous-titre 15, note 13, légende 12. L'interlettrage se resserre quand la taille grandit (`--tracking-tight` sur les grands titres).
- Aucune étiquette en capitales espacées. Intitulés de section en minuscules, 13 px, semi-gras.
- Chiffres tabulaires pour les scores, compteurs, codes et durées.
- Les objets de jeu (carte noire de Hors Limite, cadran de Diapason…) peuvent avoir leur propre style ; l'interface autour, non.

## Mise en page

- Téléphone : une colonne, gouttière de 20 px.
- Accueil : grille d'icônes de 4 colonnes, widget « Ce soir » (prénom, emoji, créer, rejoindre, reprise du dernier salon), dock des favoris en bas (les jeux les plus lancés, `dc-favs`). Toucher une icône ouvre la feuille du jeu (« Créer une partie de X », « Les règles »).
- Salon : widget du code en verre, joueurs en pastilles, contrôle segmenté des familles, listes groupées en verre avec les icônes 3D, réglages en formulaire groupé.
- PC (≥ 1100 px) : deux colonnes. À gauche le contenu (icônes, jeux, partie), à droite un panneau en verre épais de 340 à 400 px avec code, joueurs, réglages, scores et fil de la partie ; le bouton principal reste collé en bas du panneau. À l'accueil, le dock devient la carte « Tes favoris » du panneau.

## Mouvement

- Tout ce qui se touche est sur ressort (`springTo` dans ios.js, modèle d'Apple : réponse et amortissement, masse 1). Un ressort part de la valeur affichée, garde sa vitesse, s'interrompt et se renverse à tout moment.
- Appui : retour dès que le doigt se pose. Icônes 0,88, boutons 0,96 ; retour avec un léger rebond (réponse 0,4, amortissement 0,62).
- Feuilles : montent sur un ressort sans rebond (0,38 / 0,88) ; se tirent vers le bas par la poignée ou l'en-tête, suivent le doigt, résistent vers le haut (élastique), partent si l'élan projeté dépasse 45 % de leur hauteur. Seule la vitesse des 100 dernières ms compte. Échap ferme la feuille du dessus. Sur PC (≥ 760 px) elles sont centrées et apparaissent par une légère mise à l'échelle.
- Contrôle segmenté : la pastille glisse d'une famille à l'autre (0,36 / 0,78).
- On n'anime que `transform` et `opacity`. « Réduire les animations » : les ressorts arrivent tout de suite, le glisser au doigt reste.
- Cibles tactiles ≥ 44 px partout.

## Composants

- Ligne de jeu : icône 3D (52 px), nom en semi-gras, accroche d'une ligne dans la voix du meneur, nombre de joueurs et durée à droite. Sélection : fond teinté et filet de la couleur d'accent.
- Bouton principal : capsule pleine largeur, 50 à 56 px, libellé qui nomme l'action (« Lancer Hors Limite »). Boutons secondaires : capsule en verre (`--glass-field`).
- Progression d'attente : petites barres, une par joueur attendu, plutôt que « (0/3) ».

## Voix du meneur

- Tutoie, phrases courtes, présent. Commente la table (« Kevin juge. », « Plus que Léa. »).
- Taquine sans méchanceté ; jamais d'humour sur une erreur technique (celles-ci restent claires et utiles).
- Varie ses répliques : 2 à 4 variantes par situation, choisies de façon stable pendant une manche.
- Interdits : capitales espacées, emojis décoratifs, deux-points dans chaque phrase, points de suspension d'attente, tirets cadratins, consignes qui décrivent l'évidence, slogans.
