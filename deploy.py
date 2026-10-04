"""Met en ligne la Boîte à jeux sur Cloudflare Pages (boite-a-jeux.pages.dev).

Copie dans dist/ les seuls fichiers servis au navigateur (fichiers suivis par git, sans les scripts
de construction ni les journaux), puis lance `wrangler pages deploy`. Les fonctions serveur sont
dans functions/. Usage : python deploy.py  (ou  python deploy.py --dry  pour préparer dist/ seulement)
"""
import os, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, 'dist')
SKIP_EXT = ('.py', '.txt', '.log', '.md', '.jsonc')
SKIP_NAMES = {'.gitignore', 'mirage-rejected.json'}
SKIP_DIRS = ('functions/', 'dist/')

files = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split('\n')
keep = [f for f in files if f and not f.endswith(SKIP_EXT) and os.path.basename(f) not in SKIP_NAMES and not f.startswith(SKIP_DIRS)]
shutil.rmtree(DIST, ignore_errors=True)
for f in keep:
    dst = os.path.join(DIST, f); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(os.path.join(ROOT, f), dst)
print(f'{len(keep)} fichiers dans dist/')
if '--dry' not in sys.argv:
    wr = shutil.which('wrangler') or 'wrangler'
    sys.exit(subprocess.run([wr, 'pages', 'deploy', 'dist', '--project-name', 'boite-a-jeux', '--branch', 'main', '--commit-dirty=true'], cwd=ROOT).returncode)
