-- Statistiques de la Boîte à jeux (base D1 « boite-a-jeux-stats »), lues par la page /stats du site.
-- Écrites par le serveur des salons : un salon, ses joueurs, et chaque partie lancée depuis le salon.
-- Création ou mise à jour : wrangler d1 execute boite-a-jeux-stats --remote --file server/schema.sql
CREATE TABLE IF NOT EXISTS salons (
  id TEXT PRIMARY KEY,          -- code + instant de création (un code peut resservir plus tard)
  code TEXT NOT NULL,
  cree INTEGER NOT NULL,        -- ms depuis 1970
  ferme INTEGER,                -- vide si le salon a été coupé sans fermeture propre
  hote TEXT, hote_emoji TEXT
);
CREATE TABLE IF NOT EXISTS joueurs (
  salon TEXT NOT NULL, pid TEXT NOT NULL,   -- pid = identifiant du téléphone, stable d'un salon à l'autre
  nom TEXT, emoji TEXT, arrive INTEGER,
  PRIMARY KEY (salon, pid)
);
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY, salon TEXT NOT NULL,
  jeu TEXT NOT NULL, nom_jeu TEXT,
  debut INTEGER NOT NULL, fin INTEGER,      -- fin : fin de la dernière manche, ou retour au salon si abandon
  robots INTEGER DEFAULT 0,
  joueurs TEXT,                             -- JSON : [{ p: téléphone, n: prénom, e: emoji }]
  manches INTEGER DEFAULT 0,                -- manches menées au bout (« Rejouer » en ajoute)
  podium TEXT                               -- JSON : les trois premiers de la dernière manche
);
CREATE INDEX IF NOT EXISTS salons_cree ON salons (cree);
CREATE INDEX IF NOT EXISTS parties_salon ON parties (salon);
CREATE INDEX IF NOT EXISTS joueurs_salon ON joueurs (salon);

-- Miroir (jeu à part, chacun à son rythme) : lu et écrit par functions/api/miroir/.
CREATE TABLE IF NOT EXISTS miroir_parties (
  code TEXT PRIMARY KEY,            -- code à partager pour s'inscrire et répondre
  hote TEXT NOT NULL UNIQUE,        -- code hôte : fermer la liste, lancer le résultat
  resultat TEXT UNIQUE,             -- code des résultats, créé quand l'hôte lance le résultat
  cree INTEGER NOT NULL, maj INTEGER,
  phase TEXT NOT NULL,              -- inscriptions, reponses, resultats
  createur TEXT,                    -- pid du créateur
  cats TEXT,                        -- JSON : thèmes choisis
  questions TEXT NOT NULL           -- JSON : les 25 questions tirées [{ c, cn, q, l, r }]
);
CREATE TABLE IF NOT EXISTS miroir_joueurs (
  partie TEXT NOT NULL, pid TEXT NOT NULL,
  tok TEXT NOT NULL,                -- secret du téléphone (jamais renvoyé aux autres)
  nom TEXT NOT NULL, emoji TEXT, arrive INTEGER, fini INTEGER,
  PRIMARY KEY (partie, pid), UNIQUE (partie, tok)
);
CREATE TABLE IF NOT EXISTS miroir_reponses (
  partie TEXT NOT NULL, pid TEXT NOT NULL, q INTEGER NOT NULL,
  v TEXT NOT NULL,                  -- JSON : { pid visé : 0 à 100 } ; le sien = sa vraie réponse
  maj INTEGER,
  PRIMARY KEY (partie, pid, q)
);
CREATE INDEX IF NOT EXISTS miroir_parties_cree ON miroir_parties (cree);
