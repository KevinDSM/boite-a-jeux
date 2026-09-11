# Décennies — blind test chronologique entre téléphones

Équivalent maison de Hitster : on écoute un extrait, on le place dans sa frise d'années.
Premier à 10 cartes gagne. Chaque joueur joue sur son propre téléphone.

**En ligne : https://kevindsm.github.io/decennies/** (dépôt GitHub `KevinDSM/decennies`).
Toute modification poussée sur `main` est en ligne en une à deux minutes.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | l'appli, 100 % statique |
| `songs.json` | la base de chansons (extraits 30 s Apple, année, pochette) |
| `playlists.txt` | la liste `Artiste \| Titre` par playlist, à enrichir |
| `build_songs.py` | régénère `songs.json` depuis `playlists.txt` via l'API iTunes |

## Jouer maintenant, sur le Wi-Fi de la maison

Dans ce dossier :

```bash
python -m http.server 8766
```

Puis sur chaque téléphone connecté au même Wi-Fi : `http://IP-DU-PC:8766`
(l'IP du PC : `ipconfig`, ligne IPv4). Un joueur crée la partie, les autres tapent le code.

Le réseau entre téléphones passe par WebRTC (PeerJS, relais gratuit sans compte).
Il faut donc Internet pour la mise en relation et pour les extraits audio.

## Mettre en ligne gratuitement (GitHub Pages)

1. Créer un compte GitHub, puis un dépôt public nommé `decennies`.
2. Y déposer les 4 fichiers `index.html`, `style.css`, `app.js`, `songs.json`
   (bouton « Add file → Upload files » sur la page du dépôt).
3. Dans le dépôt : Settings → Pages → Source « Deploy from a branch » → branche `main` → Save.
4. Deux minutes plus tard l'appli est à `https://TON-PSEUDO.github.io/decennies/`.

Sur téléphone, « Ajouter à l'écran d'accueil » donne une vraie icône d'appli.
Un lien avec code pré-rempli : `https://…/decennies/?c=ABCD`.

## Règles implémentées

- 1 carte de départ et 2 jetons par joueur.
- À ton tour : écoute, touche un « + » dans ta frise. Bonne année → la carte est à toi.
- Les autres ont 12 secondes pour parier 1 jeton sur un autre emplacement.
  Si tu te trompes et qu'un parieur a raison, il récupère la carte.
- Bonus : artiste **et** titre exacts saisis avant de valider → +1 jeton.
- 1 jeton : passer la chanson. 3 jetons : acheter une carte directement.
- L'hôte peut activer « enceinte » : le son sort de son téléphone pour tous.

## Enrichir la base

Ajouter des lignes `Artiste | Titre` sous une rubrique `# Nom de playlist` dans
`playlists.txt`, puis :

```bash
python build_songs.py
```

Le script prend l'année la plus ancienne parmi toutes les éditions du titre (pour éviter les
dates de compilations) et ignore remixes, lives et karaokés. Vérifier à l'œil les lignes
affichées : 2 à 3 % d'années peuvent rester douteuses, corrigeables directement dans `songs.json`.
Un titre marqué `KO` n'existe pas sur iTunes France ou est mal orthographié.

## Limites connues

- L'hôte doit garder l'appli ouverte : c'est son téléphone qui tient la partie.
  Si l'hôte ferme la page, la partie est perdue.
- Un joueur qui perd le réseau est reconnecté automatiquement avec sa frise.
- Sur iPhone, le premier extrait peut demander un tap sur « Écouter » (règle Safari).
