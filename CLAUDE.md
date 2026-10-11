# Boîte à jeux — consignes pour Claude

Hub de 22 jeux de soirée (+ Miroir et Le Mot du jour, à part) joués sur les téléphones des amis de Kevin. Site vivant : **https://boite-a-jeux.pages.dev** (Cloudflare Pages). `kevindsm.github.io/boite-a-jeux` n'est qu'une page de redirection (branche orpheline `gh-pages`, ne pas la toucher).

## Règles de travail

- **Toujours répondre en français**, récapitulatif final compris. Kevin n'est pas développeur : expliquer simplement, sans jargon.
- Fin de chaque message de commit : `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Le dépôt est PUBLIC.** Jamais de secret dans un fichier ni dans un commit : ni le mot de passe de /stats (`STATS_MDP`, secret Pages posé par Kevin lui-même), ni un jeton Cloudflare, ni le « client secret » Mapillary. `geo-config.js` ne contient que le jeton CLIENT public de Mapillary (ne pas le recopier ailleurs).
- `PRODUCT.md` (le pourquoi) et `DESIGN.md` (la charte) font foi pour toute modification visible. Kevin valide sur une préversion avant toute mise en production.
- Pour un portage ou une refonte, garder la mise en page que les amis connaissent et ne changer que la peau, sauf demande contraire.

## Publier

- `python deploy.py --site` publie le site ; `python deploy.py --site --preview NOM` publie une préversion sur `https://NOM.boite-a-jeux.pages.dev` (à faire valider par Kevin) ; `python deploy.py --server` publie le Worker des salons ; sans option : serveur puis site. `--dry` prépare `dist/` sans publier.
- **Publier le serveur REDÉMARRE les salons en cours** : ne le faire que si `core.js`, `engines/` ou les données des jeux ont changé, et le dire à Kevin.
- **À chaque mise en ligne, monter la version** : `ASSET_V` dans `core.js` ET tous les `?v=` de `index.html` ET de `miroir.html` (même numéro), sinon les téléphones gardent l'ancienne version.
- `deploy.py` utilise la connexion Wrangler du PC de Kevin. **Depuis une session cloud, il n'y a pas d'accès Cloudflare** : pousser une branche, et Kevin publie depuis son PC (`git pull` puis `python deploy.py …`). Ne jamais demander de jeton dans le chat.
- `dist/` = fichiers suivis par git, sans `.py .txt .log .md .jsonc`, sans `functions/ server/ dist/` (les fonctions partent à part).

## Architecture

- Page unique `index.html` + `style.css` (charte 2026 en fin de fichier) + `ios.css` / `ios.js` (couche iOS 26 / Liquid Glass, chargés en DERNIER) + `app.js` (affichage, entrée, salon) + `salon.js` (emojis, retrait, invitations ; chargé après `regles.js`).
- **`core.js`** : `GAMES`, `Game` (état du salon), `applyAction`, `handleClientMessage`, `hostTick()`, `net`, chargeurs de données, `ASSET_V`.
- **`engines/<jeu>.js`** : règles pures, sans DOM (IIFE). L'affichage du jeu est dans `<jeu>.js` à la racine. Données : `*-cartes.js`, `*.json`, `decks/`, `mirage/`.
- **Deux modes réseau** : sur pages.dev, le salon tourne côté serveur (Worker `boite-a-jeux-salons`, Durable Object `Salon`, dossier `server/` ; `server/build.py` emballe core.js + engines + données dans `server/src/runtime.js`, généré) ; ailleurs, l'hôte est le téléphone qui crée la partie (PeerJS). Côté client : `SALON_WS`, `isHostPlayer()` = premier joueur en mode serveur (**ne jamais tester `net.isHost` dans l'affichage**). `localStorage['dc-server']` = URL ws ou `off` pour forcer un mode en test.
- `functions/` (Pages Functions) : aperçu des liens d'invitation (KV `INVITES`), `/stats` (D1 `boite-a-jeux-stats`, schéma `server/schema.sql`), API de Miroir (`functions/api/miroir/`, questions cachées dans `_banque.js`).
- **Miroir** : page à part `/miroir` (`miroir.html/.js/.css`), asynchrone, préfixe CSS `mr-` (**`mi-` est pris par Mirage**).
- **Le Mot du jour** : page à part `/motdujour` (`motdujour.html/.js/.css`, préfixe CSS `md-`), façon Motus, un mot par jour (heure de Paris) pour tout le monde, + widget `#ih-mdj` sur l'accueil (ios.js). API `functions/api/motdujour/` (tables D1 `motdujour_*`) : **le mot ne part jamais vers le navigateur avant la fin de la partie du joueur**, le serveur vérifie chaque proposition et renvoie les couleurs. Mots + indices : `_mots.js` (365) ; dictionnaire `_dico.js` GÉNÉRÉ par `tools/motdujour/build_dico.mjs` (à relancer si on ajoute des mots). Ordre des jours tiré avec le secret Pages `MOT_SEL` (posé par Kevin, jamais dans le dépôt), puis le mot du jour est figé en base à la première visite. Joueur = `mi-tok` (même secret que Miroir) + `dc-name`/`dc-emo`.

### Ajouter un jeu (liste à cocher)

Entrée dans `GAMES` (core.js) ; moteur `engines/<jeu>.js` + affichage `<jeu>.js` ; carte `.gcard[data-game]` dans `#games` (index.html) ; bloc `#opts-<jeu>` (réglages en `label.field.row` / `fieldset.chips` : partagés automatiquement avec les invités) ; écran `.screen.play#s-<jeu>` ; palette `[data-game=<jeu>]` ; une famille dans `FAMILIES` (app.js) ; un cas dans `Game.summary()` (podiums et /stats) ; une entrée `RULES` (regles.js) et `HELP` ; robots si on ne peut pas jouer seul (`botsOpt`) ; couleur de tuile dans `IH_COLORS` (ios.js) ; icône 3D (voir plus bas) ; ajouter le jeu à `tools/tests/all_games.py`. Composants communs à réutiliser : `.mj-meta`, `.mj-status` (`.mj-title` + `.mj-say`), `.mj-prog`, `.mj-list`/`.mj-row`.

## Design (résumé, détail dans DESIGN.md)

- Police du système uniquement ; aucune étiquette en capitales espacées ; voix du « meneur de jeu » (tutoie, phrases courtes, 2 à 4 variantes par situation).
- 4 thèmes : Ambre (défaut), Minuit, Crème, Lavande ; chaque jeu garde sa palette en partie.
- Verre : classes `.glass` / `.glass-thick` (**jamais `.lg`**, déjà pris par `.btn.lg`). La barre du haut reste UNIE (iOS 26 prélève sa couleur pour la barre d'état).
- Fond d'écran : `.ios-wall` fixe en z-index -1 → `body` transparent et `html` en `--wall-base` sur l'accueil et le salon, sinon il est masqué.
- Feuilles `.modal` : app.js ne fait que basculer `hidden` ; ios.js observe et anime (classe `ios-closing` pendant la sortie). La poignée `.ih-grab` a son style dans ios.css. `preventDefault` au pointerdown du glisser (sinon une sélection de texte lance un glisser-déposer natif).
- **Accueil en deux temps** : aucun jeu à l'accueil (ils sont dans le salon). `#f-home[data-step=choice|join|create]`, éléments `[data-show]`. Entrée fait l'action de l'étape affichée, jamais l'autre. Un lien `?c=CODE&de=Prénom` ouvre directement l'étape « rejoindre ».
- Contraste AA mesuré à travers le verre dans les 4 thèmes ; cibles tactiles ≥ 44 px ; replis « réduire la transparence / les animations ».
- **Icônes 3D** : Blender (`tools/icons/build_icons.py` + `more_icons.py`, puis `export_web.py` → `icons/web/<jeu>.webp`). Blender n'est installé que sur le PC de Kevin : une nouvelle icône se fait là-bas.

## Tester

- Serveur local : `python -m http.server 8767 --bind 127.0.0.1` à la racine, puis les scripts Playwright de `tools/tests/` (captures dans `tools/tests/out/`, ignoré par git). Sans serveur de salons, le mode local passe par PeerJS (il faut Internet).
- Mode serveur en local : `npx wrangler dev -c server/wrangler.jsonc --port 8787`, puis par exemple `SRV=ws://127.0.0.1:8787 python tools/tests/all_games.py`. Site + fonctions : `npx wrangler pages dev --port 8788 --ip 127.0.0.1 --live-reload=false` (ne pas partager `--persist-to` avec le Worker : verrou SQLite).
- Scripts : `all_games.py [url] [largeur] [thème] [jeux]` (lance les 22 jeux), `ios_accueil.py` (accueil en deux temps), `ios_salon.py`, `ios_motion.py` (ressorts, glisser), `ios_contrast.py [url] [salon|etapes]` (contraste réel), `salon_play.py` (emojis, invitation, retrait), `server_play.py`, `sab_server.py`, `new2_play.py`, `accueil_reel.py URL` (créer + rejoindre par code + par lien), `miroir_play2.py BASE MDP`, `stats_shot.py BASE MDP`, `motdujour_play.py [BASE]` (trois joueurs, vérifie que le mot reste caché ; base locale vide pour ces prénoms ce jour-là), `ios_contrast.py URL motdujour` (widget + page du jeu).
- Les scripts remplissent l'accueil en posant d'abord l'étape : `page.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create')`.
- Deux joueurs sur la même machine : l'identifiant est en localStorage, donc un contexte de navigateur par joueur (ou `127.0.0.1` pour l'un et `localhost` pour l'autre).
- **Les tests sur la vraie adresse (ou une préversion) écrivent dans la vraie base /stats** : éviter, ou effacer ensuite.
- Kems démarre seulement à 4 joueurs : `all_games.py` le laisse au salon (sa case robots est une case à cocher), ce n'est pas un bug.

## Pièges connus

- Rendu : ne jamais reconstruire un formulaire ou un objet que le joueur est en train de manipuler (Petit Brevet, cadran de Diapason, cartes de Loup-Garou, frise de Décennies) ; comparer une clé de rendu avant de vider un conteneur.
- Une animation d'entrée ne doit se jouer que sur les éléments NOUVEAUX (chaque diffusion relance le rendu).
- Les `.gcard` portent `data-game` : elles héritent sinon de la palette de leur jeu (`.gcard[data-game]{--ink-2:inherit…}`).
- Classes déjà prises : `.slot` (frise Décennies), `.lg` (`.btn.lg`), préfixe `mi-` (Mirage).
- Loup-Garou : la cible d'une action voyage dans `to` (`t` est le type d'action).
- Emojis : initiales via `glyph0()`, jamais `name[0]`.
- Mobile : `overflow-x:hidden` sur `html` (pas `body`), `min-height:100dvh` sur `body`.
- Scripts : un script Python/JS avec apostrophes ou accents dans un heredoc Bash casse → l'écrire dans un fichier puis l'exécuter. Sous Windows, `PYTHONIOENCODING=utf-8` pour imprimer des emojis.
- Constructions de données (`build_songs.py`, `build_jv.py`…) : reprenables grâce à `<destination>.cache.json` ; années iTunes souvent fausses (rééditions, compilations) → table `FIXES` dans build_songs.py, relire les correspondances avant de publier.
- `wrangler d1 execute --remote --file` peut échouer (erreur 10000) alors que `--command` marche. Un secret Pages ne s'applique qu'au déploiement suivant.
