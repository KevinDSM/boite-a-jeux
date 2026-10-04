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
