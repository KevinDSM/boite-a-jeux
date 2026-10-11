// Un seul indice : construit unseulindice.json (mots mystères + associations, les indices des robots).
// Source : un fichier texte, une ligne par mot : « mot: association, association, … » (# pour un commentaire).
//   node tools/unseulindice/build_mots.js tools/unseulindice/mots.txt
// Contrôles : un mot par entrée, pas de doublon, associations d'un seul mot, jamais trop proches du mot
// (règles du moteur : même racine, pluriel, accents), au moins 5 associations gardées. 500 mots au plus.
const fs = require('fs'), path = require('path');
global.shuffle = a => a;
const U = require('../../engines/unseulindice.js');
const ROOT = path.join(__dirname, '..', '..'), MAX = 500;
const out = [], seen = new Set(), dropped = [];
for (const f of process.argv.slice(2)) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#') || !line.includes(':')) continue;
    const [w, rest] = line.split(':').map(s => s.trim());
    const key = U.fold(w);
    if (!w || /\s/.test(w) || seen.has(key)) { dropped.push(`${w} (doublon ou mot invalide)`); continue; }
    const assoc = [];
    for (const a of rest.split(',').map(s => s.trim()).filter(Boolean)) {
      if (/\s/.test(a) || U.tooNearWord(a, w) || assoc.some(b => U.close(a, b))) continue;
      assoc.push(a);
    }
    if (assoc.length < 5) { dropped.push(`${w} (${assoc.length} associations)`); continue; }
    seen.add(key); out.push([w, assoc]);
  }
}
const mots = out.slice(0, MAX);
fs.writeFileSync(path.join(ROOT, 'unseulindice.json'), JSON.stringify({ mots }, null, 0).replace(/\],\[/g, '],\n[') + '\n');
console.log(`${mots.length} mots écrits (${out.length} valides), écartés : ${dropped.length}`);
console.log(dropped.join(' · '));
