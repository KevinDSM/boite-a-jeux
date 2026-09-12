# Platine — hub de jeux de musique entre amis

Chacun joue sur son téléphone, tout le monde se connecte avec un code à 4 lettres.
Le salon permet de choisir le jeu, et chaque jeu a sa propre identité visuelle.

**En ligne : https://kevindsm.github.io/decennies/** (dépôt GitHub `KevinDSM/decennies`).
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
qu'Éclair, choix des décennies.

### Manette
Des musiques de jeux vidéo, il faut nommer le jeu. Même barème et même déroulé que Sprint.
Base dédiée `songs-jv.json` (83 jeux, 7 familles) avec sa propre liste de suggestions, qui ne
contient que des noms de jeux. Une réponse trop vague comme « zelda » ne coûte pas d'essai :
le jeu demande de préciser. Beaucoup de musiques Nintendo ou Sega n'existent sur iTunes que
sous forme de reprises orchestrales, c'est la mélodie qui compte.

```bash
python build_jv.py            # playlists-jv.txt -> songs-jv.json
```

### Éclair
Tout le monde écoute la même chanson, il faut trouver le titre en un minimum de secondes.
Paliers 0,5 / 1 / 2 / 3 / 5 s valant 5 / 4 / 3 / 2 / 1 points. Un titre faux débloque le
palier suivant. Choix des décennies de 1980 à aujourd'hui.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | l'appli, 100 % statique |
| `songs.json` | base de Décennies (180 titres, playlists par époque) |
| `songs-eclair.json` | base d'Éclair et de Sprint (450 tubes, 10 par année de 1980 à 2025) |
| `playlists.txt`, `playlists-eclair.txt` | les listes `Artiste \| Titre` à enrichir |
| `songs-jv.json`, `playlists-jv.txt`, `build_jv.py` | base des musiques de jeux vidéo, format `Jeu \| recherche iTunes` |
| `build_songs.py` | régénère une base depuis une liste via l'API iTunes |

## Ajouter un jeu

Un jeu se déclare dans `GAMES` (app.js), reçoit une carte dans le salon (`.gcard` dans
index.html), un bloc d'options `#opts-<clé>`, une palette `[data-game="<thème>"]` dans
style.css, un écran `.screen`, et ses phases dans le moteur `Game`.

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
