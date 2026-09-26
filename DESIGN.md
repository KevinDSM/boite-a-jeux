# Design

Ossature épurée (piste A) et voix de meneur de jeu (piste B), validées le 26/09/2026. Voir PRODUCT.md pour le pourquoi.

## Thème

Scène : des amis dans un salon le soir, lumière tamisée, téléphone en main. Le thème par défaut est sombre et chaud (Ambre) ; trois autres restent au choix : Minuit (sombre), Crème et Lavande (clairs). Chaque jeu repeint l'écran avec sa propre palette, en version sombre ou claire selon le thème choisi.

## Couleurs

- Jetons partagés : `--bg`, `--surface` (listes, champs), `--surface-2` (panneau de droite sur PC, barre de filtres), `--line`, `--ink`, `--ink-2`, `--mute`, `--acc` (action principale et sélection uniquement), `--on-acc`, `--pos`, `--neg`.
- Stratégie : retenue. Neutres teintés, un accent ; la couleur forte appartient aux jeux (leur dessin, leur écran de partie).
- Jamais de noir ou de blanc purs, OKLCH partout.

## Typographie

- Une seule famille : la police du système (`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, sans-serif`).
- Hiérarchie par la taille et le gras, échelle serrée (≈1,2) : 13 / 15 / 17 / 21 / 26 / 32 px.
- Aucune étiquette en capitales espacées. Les intitulés de section sont en minuscules, 13 px, semi-gras, couleur `--mute`.
- Chiffres tabulaires pour les scores et compteurs.
- Les objets de jeu (carte noire de Hors Limite, cadran de Diapason…) peuvent avoir leur propre style ; l'interface autour, non.

## Mise en page

- Téléphone : une colonne, gouttière de 20 px.
- PC (≥ 1100 px) : deux colonnes. À gauche le contenu (jeux, partie), à droite un panneau `--surface-2` de 340 à 380 px avec code, joueurs, réglages, scores et fil de la partie ; le bouton principal reste collé en bas du panneau.
- Listes groupées plutôt que cartes : un conteneur arrondi par groupe, lignes séparées par un filet, deux lignes par rangée sur PC.
- Réglages en formulaire groupé : libellé à gauche, valeur à droite, lignes jointives.

## Composants

- Ligne de jeu : dessin du jeu (52 px), nom en semi-gras, accroche d'une ligne dans la voix du meneur, nombre de joueurs et durée à droite. Sélection : fond teinté et filet de la couleur d'accent.
- Bouton principal : pleine largeur, 50 à 56 px, rayon 13 px, libellé qui nomme l'action (« Lancer Hors Limite »).
- Filtres : contrôle segmenté (fond `--surface-2`, segment actif en `--surface`).
- Progression d'attente : petites barres, une par joueur attendu, plutôt que « (0/3) ».

## Voix du meneur

- Tutoie, phrases courtes, présent. Commente la table (« Kevin juge. », « Plus que Léa. »).
- Taquine sans méchanceté ; jamais d'humour sur une erreur technique (celles-ci restent claires et utiles).
- Varie ses répliques : 2 à 4 variantes par situation, choisies de façon stable pendant une manche.
- Interdits : capitales espacées, emojis décoratifs, deux-points dans chaque phrase, points de suspension d'attente, tirets cadratins, consignes qui décrivent l'évidence, slogans.
