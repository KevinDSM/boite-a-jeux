# Boîte à jeux — des jeux entre amis, chacun sur son téléphone

(Anciennement « Platine », rebaptisé le 13/09/2026 : depuis Sablier, tout ne tourne plus autour de la musique.)

Chacun joue sur son téléphone, tout le monde se connecte avec un code à 4 lettres.
Le salon permet de choisir le jeu, et chaque jeu a sa propre identité visuelle.

**En ligne : https://kevindsm.github.io/boite-a-jeux/** (dépôt GitHub `KevinDSM/boite-a-jeux`).
Les anciennes adresses `…/platine/` et `…/decennies/` redirigent, chacune via un dépôt séparé
qui ne contient qu'une page de redirection : GitHub Pages ne redirige pas tout seul après un renommage.
Toute modification poussée sur `main` est en ligne en une à deux minutes.

## Les jeux

### Décennies
On écoute un extrait, on le place dans sa frise d'années. Premier à remplir sa frise, gagné.

- 1 carte de départ, 2 jetons, 3 jetons au maximum.
- À ton tour : écoute, touche le « + » où la chanson se place. Bonne année, la carte est à toi.
- **Les jetons servent uniquement à parier.** Quand un joueur a posé son choix, le premier
  qui se lance prend le pari du tour, pour 1 jeton. Un seul pari par tour.
  Pari gagné : la carte rejoint sa frise. Pari perdu : il perd le jeton **et** une carte
  (jamais sa dernière).
- Regagner un jeton : écrire l'artiste et le titre avant de placer, les deux justes.
- **En solo**, jetons et paris disparaissent. On enchaîne les chansons, on passe librement
  celles qu'on ne connaît pas, et la partie s'arrête quand la frise est pleine.

### Sprint
La même chanson démarre chez tout le monde. Le premier à donner l'artiste et le titre marque
le plus. 1er 5 points, 2e 3, 3e 2, ensuite 1. Trois essais par manche, la manche s'arrête quand
l'extrait est fini ou que tout le monde a répondu. Même base et même liste de suggestions
qu'Éclair, choix des décennies, et la même case **Jeux vidéo** facultative.

### Sablier
Sans musique : un Time's Up par équipes, porté depuis le projet d'origine
(le moteur de règles `src/game.js` est repris tel quel dans `sablier-engine.js`, le salon 3D
et le mode Skribble sont laissés de côté). Chacun reçoit 12 cartes, en écarte 2, le reste forme
le paquet commun rejoué à chaque manche : description libre, un seul mot, mime (facultatif,
pour jouer dans la même pièce), dessin. Trois secondes
de préparation avant la carte, passer est libre, la carte en main au gong n'est jamais révélée et
l'hôte peut la compter. Correction d'une carte comptée à tort entre deux tours. Manche dessin
avec canevas partagé en direct, seau, gomme, galerie de fin. Réactions emoji pour le public,
et les équipes qui ne jouent pas peuvent gribouiller sur les bords de l'écran de tout le monde
(crayon ✏️ dans la barre des réactions, couleur de l'équipe, effacé au tour suivant).
L'interface reprend celle du projet d'origine : fil d'étapes, chrono avec barre, grande carte,
boutons Passer / Deviné, bandeau des trouvées, scores par équipe.
Les cartes déjà vues ne reviennent pas d'une soirée à l'autre (mémoire du téléphone hôte).

Cartes : 953 dans `decks/*.json`, 5 decks, format `{ "n": nom, "c": catégorie, "d": 1|2|3 }`.
Le deck privé « Entre nous » de l'original n'est volontairement pas publié.

### Undercover
Tout le monde reçoit le même mot secret, sauf un ou plusieurs undercovers qui ont un mot voisin
sans le savoir. Option Mister White : un joueur sans mot, qui le sait. Indices à voix haute dans
l'ordre affiché, vote sur le téléphone, revote entre ex æquo, rôle révélé à l'élimination.
Mister White éliminé peut deviner le mot des civils et gagner seul. Les civils gagnent quand
tous les intrus sont sortis, les intrus quand il ne reste qu'un civil. Points : civil 2,
undercover 10, Mister White 6, sur 3, 5 ou 8 manches. Il reste toujours plus de civils que
d'intrus. 175 paires de mots dans `undercover.js`, les paires déjà jouées sur le téléphone hôte
ne reviennent pas tout de suite. Comme Sablier, chaque joueur reçoit une vue filtrée : son mot
et rien d'autre.

### Éclair
Tout le monde écoute la même chanson, il faut trouver le titre en un minimum de secondes.
Paliers 0,5 / 1 / 2 / 3 / 5 s valant 5 / 4 / 3 / 2 / 1 points. Un titre faux débloque le
palier suivant. Choix des décennies de 1980 à aujourd'hui, plus une case **Jeux vidéo** qui
mêle 83 musiques de jeux (base `songs-jv.json`, générée par `build_jv.py`) : pour celles-là il
faut donner le nom du jeu, et une réponse trop vague ne coûte pas d'essai.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | l'appli, 100 % statique |
| `songs.json` | base de Décennies (180 titres, playlists par époque) |
| `songs-eclair.json` | base d'Éclair et de Sprint (450 tubes, 10 par année de 1980 à 2025) |
| `playlists.txt`, `playlists-eclair.txt` | les listes `Artiste \| Titre` à enrichir |
| `songs-jv.json`, `playlists-jv.txt`, `build_jv.py` | musiques de jeux vidéo pour l'option d'Éclair, format `Jeu \| recherche iTunes` |
| `build_songs.py` | régénère une base depuis une liste via l'API iTunes |
| `sablier-engine.js`, `sablier-ui.js`, `decks/` | le jeu Sablier : règles pures, écrans et canevas, cartes |
| `undercover.js` | le jeu Undercover : paires de mots, règles, écran |

## Ajouter un jeu

Un jeu se déclare dans `GAMES` (app.js), reçoit une carte dans le salon (`.gcard` dans
index.html), un bloc d'options `#opts-<clé>`, une palette `[data-game="<thème>"]` dans
style.css, un écran `.screen`, et ses phases dans le moteur `Game`.

Sablier montre le second modèle possible : un moteur séparé qui produit une **vue par joueur**
(`viewFor`), diffusée par `broadcast()` destinataire par destinataire, et des messages hors état
(`sab-seg`, `sab-full`, `sab-react`) relayés par l'hôte pour le dessin et les réactions.

## Enrichir une base

```bash
python build_songs.py playlists.txt songs.json
python build_songs.py playlists-eclair.txt songs-eclair.json
```

Le script prend l'année la plus ancienne parmi les éditions d'un titre (pour éviter les dates
de compilations) et ignore remixes, lives et karaokés. Un titre marqué `KO` est absent du
catalogue iTunes France.

## Limites connues

- L'hôte doit garder l'appli ouverte : c'est son téléphone qui fait tourner la partie.
- Sur iPhone, le premier extrait peut demander un tap sur « Écouter » (règle Safari).
- Les fichiers sont versionnés par `?v=` : penser à incrémenter `ASSET_V` et les balises
  dans `index.html` à chaque mise en ligne.
