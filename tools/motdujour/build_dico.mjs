// Le Mot du jour : construit functions/api/motdujour/_dico.js, le dictionnaire des propositions acceptées.
// Source : la liste « an-array-of-french-words » (licence MIT, https://github.com/words/an-array-of-french-words),
// environ 336 000 mots et formes (pluriels, conjugaisons). On garde les mots de 6 à 9 lettres, sans tiret ni
// apostrophe, accents retirés et en capitales, comme les cases du jeu. Les mots à trouver (_mots.js) y sont
// ajoutés s'il en manque un.
//   npm install an-array-of-french-words   (dans un dossier de travail, hors du dépôt)
//   node tools/motdujour/build_dico.mjs chemin/vers/node_modules/an-array-of-french-words/index.json
// Format : pour chaque longueur, une seule chaîne de mots de même taille, triés, mis bout à bout. Le serveur
// y cherche par dichotomie sans rien découper : rien à préparer au démarrage, aucune mémoire en plus.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = process.argv[2];
if (!src) { console.error('Usage : node tools/motdujour/build_dico.mjs .../an-array-of-french-words/index.json'); process.exit(1); }
const { MOTS } = await import(join(ROOT, 'functions/api/motdujour/_mots.js'));
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').toUpperCase();

const par = { 6: new Set(), 7: new Set(), 8: new Set(), 9: new Set() };
for (const w of JSON.parse(readFileSync(src, 'utf8'))) {
  if (!/^[a-zàâäçéèêëîïôöùûüÿœæ]+$/.test(w)) continue;    // ni nom propre, ni tiret, ni apostrophe
  const n = norm(w); if (par[n.length]) par[n.length].add(n);
}
let ajout = 0;
for (const [m] of MOTS) { const n = norm(m); if (!par[n.length]?.has(n)) { par[n.length].add(n); ajout++; } }
const lignes = Object.entries(par).map(([l, s]) => `  ${l}: '${[...s].sort().join('')}',`);
const total = Object.values(par).reduce((a, s) => a + s.size, 0);
writeFileSync(join(ROOT, 'functions/api/motdujour/_dico.js'),
  `// Le Mot du jour : les ${total} mots acceptés (6 à 9 lettres). Généré par tools/motdujour/build_dico.mjs, ne pas modifier à la main.\n` +
  `// Source : an-array-of-french-words (licence MIT). Chaque longueur : des mots de même taille, triés, mis bout à bout.\n` +
  `export const DICO = {\n${lignes.join('\n')}\n};\n`);
console.log(`${total} mots (${Object.entries(par).map(([l, s]) => `${l} lettres : ${s.size}`).join(', ')}), ${ajout} mot(s) du jour ajouté(s)`);
