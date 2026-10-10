"""Met en ligne la Boîte à jeux sur Cloudflare.

1. Le serveur des salons (server/, Worker « boite-a-jeux-salons ») : runtime.js est reconstruit à
   partir de core.js et engines/, puis `wrangler deploy`.
2. Le site (boite-a-jeux.pages.dev) : copie dans dist/ les seuls fichiers servis au navigateur
   (fichiers suivis par git, sans les scripts de construction ni les journaux), puis
   `wrangler pages deploy`. Les fonctions du site sont dans functions/.
Usage : python deploy.py [--site | --server] [--dry] [--preview NOM]
  --preview NOM : publie le site sur NOM.boite-a-jeux.pages.dev, sans toucher au site en ligne.
  --site / --server : ne publie que l'un des deux ; --dry : prépare sans publier.
Attention : publier le serveur redémarre les salons en cours.
"""
import os, shutil, subprocess, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, 'dist')
SKIP_EXT = ('.py', '.txt', '.log', '.md', '.jsonc')
SKIP_NAMES = {'.gitignore', 'mirage-rejected.json'}
SKIP_DIRS = ('functions/', 'dist/', 'server/')

wr = shutil.which('wrangler') or 'wrangler'
dry = '--dry' in sys.argv
if '--site' not in sys.argv:
    subprocess.run([sys.executable, os.path.join(ROOT, 'server', 'build.py')], check=True)
    if not dry:
        rc = subprocess.run([wr, 'deploy', '-c', os.path.join('server', 'wrangler.jsonc')], cwd=ROOT).returncode
        if rc: sys.exit(rc)
if '--server' in sys.argv: sys.exit(0)

files = subprocess.run(['git', 'ls-files'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split('\n')
keep = [f for f in files if f and not f.endswith(SKIP_EXT) and os.path.basename(f) not in SKIP_NAMES and not f.startswith(SKIP_DIRS)
        and not (f.startswith('icons/') and f.endswith('.png'))]     # rendus Blender en 512 px : seules les versions web partent
shutil.rmtree(DIST, ignore_errors=True)
for f in keep:
    dst = os.path.join(DIST, f); os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(os.path.join(ROOT, f), dst)
print(f'{len(keep)} fichiers dans dist/')
if not dry:
    branch = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else 'main'
    sys.exit(subprocess.run([wr, 'pages', 'deploy', 'dist', '--project-name', 'boite-a-jeux', '--branch', branch, '--commit-dirty=true'], cwd=ROOT).returncode)
