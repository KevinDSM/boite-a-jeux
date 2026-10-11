"""Le Mot du jour : trois joueurs le même jour.
Kevin sèche (avec l'indice), Léa trouve en deux (au clavier du PC, prénom tapé sur la page), Tom du premier coup.
Vérifie aussi que le mot du jour et son indice ne sont jamais envoyés au navigateur trop tôt, puis le widget de l'accueil.
Usage : python tools/tests/motdujour_play.py [BASE]   (BASE = wrangler pages dev, par défaut http://127.0.0.1:8788)
Sur la vraie adresse ou une préversion, il écrit dans la vraie base : à éviter.
Les trois prénoms ne doivent pas avoir déjà joué ce jour-là dans la base locale (sinon : DELETE FROM motdujour_joueurs)."""
import sys, os, re, json, unicodedata
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8788"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "tools", "tests", "out", "motdujour"); os.makedirs(OUT, exist_ok=True)
DICO = {int(l): s for l, s in re.findall(r"^\s*(\d): '([A-Z]+)',", open(os.path.join(ROOT, "functions/api/motdujour/_dico.js"), encoding="utf-8").read(), re.M)}
words = lambda n, p: [DICO[n][i:i + n] for i in range(0, len(DICO[n]), n) if DICO[n][i] == p]
norm = lambda s: unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().upper()
res, errs = {}, []

with sync_playwright() as pw:
    b = pw.chromium.launch()

    def page(name, w, h, theme, emo, named=True):
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1, has_touch=w < 800)
        init = f"localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-emo', '{emo}');"
        if named: init += f"localStorage.setItem('dc-name', '{name}');"
        ctx.add_init_script(f"try {{ {init} }} catch {{}}")
        p = ctx.new_page(); p._name = name; p._bodies = []
        p.on("pageerror", lambda e: errs.append(f"{name}: {str(e)[:200]}"))
        p.on("response", lambda r: p._bodies.append(r) if "/api/motdujour/" in r.url else None)
        return p
    shot = lambda p, n, full=True: p.screenshot(path=f"{OUT}/{n}.png", full_page=full)
    rows = lambda p: p.evaluate("document.querySelectorAll('#md-board .md-row[role=img], #md-board .md-hintrow').length")

    def play_keys(p, w):
        """Tape le mot au clavier de l'écran (la première lettre est déjà posée), puis Valider."""
        k = rows(p)
        for ch in w[1:]: p.click(f'.md-key[data-k="{ch}"]')
        p.click('.md-key[data-k="Enter"]')
        p.wait_for_function("k => document.querySelectorAll('#md-board .md-row[role=img], #md-board .md-hintrow').length > k || document.querySelector('.toast.show')", arg=k)
        p.wait_for_timeout(1200)

    def play_typed(p, w):
        """Tape le mot entier au clavier du PC, première lettre comprise (elle est ignorée), puis Entrée."""
        k = rows(p)
        p.keyboard.type(w.lower()); p.keyboard.press("Enter")
        p.wait_for_function("k => document.querySelectorAll('#md-board .md-row[role=img], #md-board .md-hintrow').length > k", arg=k)
        p.wait_for_timeout(1200)

    # ---------------------------------------------------------------- Kevin : trois ratés, l'indice, deux ratés
    kev = page("Kevin", 390, 844, "dark", "🦊")
    kev.goto(BASE + "/motdujour"); kev.wait_for_selector("#md-kb .md-key")
    st = kev.evaluate("fetch('/api/motdujour/jour').then(r => r.json())")
    n, P = st["n"], st["premiere"]; res["jour"] = f"{st['jour']} : {n} lettres, {P}"
    shot(kev, "01-kevin-debut", False)
    pool = words(n, P); step = max(1, len(pool) // 7); tries = pool[::step][:6]
    # un mot qui n'existe pas : refusé, la ligne tremble, rien n'est compté
    for _ in range(n - 1): kev.click(f'.md-key[data-k="{"Z" if P != "Z" else "X"}"]')
    kev.click('.md-key[data-k="Enter"]'); kev.wait_for_selector(".toast.show"); res["refus"] = kev.inner_text("#toast")
    for _ in range(n - 1): kev.click('.md-key[data-k="Backspace"]')
    for w in tries[:3]: play_keys(kev, w)
    res["kevin-3"] = kev.inner_text("#md-say")
    res["indice-propose"] = kev.is_visible("#md-hintbtn")
    shot(kev, "02-kevin-3-essais", False)
    kev.click("#md-hintbtn"); res["indice-arme"] = kev.inner_text("#md-hintbtn"); kev.click("#md-hintbtn")
    kev.wait_for_selector(".md-hintrow"); kev.wait_for_timeout(500)
    res["indice"] = kev.inner_text(".md-hintrow")
    shot(kev, "03-kevin-indice", False)
    for w in tries[3:5]:
        if kev.locator("#md-end:not([hidden])").count(): break
        play_keys(kev, w)
    kev.wait_for_selector("#md-end:not([hidden])")
    sol = kev.inner_text(".md-sol b"); res["solution"] = sol; res["kevin-fin"] = kev.inner_text("#md-title")
    shot(kev, "04-kevin-fin")
    # le mot ne doit apparaître dans aucune réponse avant la dernière (celle qui clôt la partie)
    bodies = [r.text() for r in kev._bodies]
    early = [x for x in bodies if '"solution"' not in x]
    res["mot-cache-avant-la-fin"] = all(norm(sol) not in x and sol not in x for x in early)
    hint_txt = res["indice"].split("\n")[-1]
    before_hint = [x for x in early if '"indice":null' in x or '"moi":null' in x]
    res["indice-cache-avant"] = all(hint_txt not in x for x in before_hint)
    word = norm(sol)

    # ---------------------------------------------------------------- Léa : PC, thème clair, prénom tapé sur la page
    lea = page("Léa", 1280, 860, "light", "🐸", named=False)
    lea.goto(BASE + "/motdujour"); lea.wait_for_selector("#md-name:not([hidden])")
    shot(lea, "05-lea-prenom", False)
    lea.fill("#md-name input[name=nom]", "Léa"); lea.click("#md-name button[type=submit]")
    lea.wait_for_selector("#md-boardbox:not([hidden])")
    other = next(w for w in pool if w != word and w not in tries)
    play_typed(lea, other); play_typed(lea, word)
    lea.wait_for_selector("#md-end:not([hidden])"); res["lea-fin"] = lea.inner_text("#md-title")
    shot(lea, "06-lea-gagne", False)

    # ---------------------------------------------------------------- Tom : du premier coup, thème Lavande
    tom = page("Tom", 390, 844, "lavande", "🐼")
    tom.goto(BASE + "/motdujour"); tom.wait_for_selector("#md-kb .md-key")
    play_keys(tom, word); tom.wait_for_selector("#md-end:not([hidden])")
    res["tom-fin"] = tom.inner_text("#md-title") + " / " + tom.inner_text("#md-say")
    tom.wait_for_timeout(600)
    res["classement"] = [x.replace("\n", " ") for x in tom.locator(".md-r").all_inner_texts()]
    res["kevin-ampoule"] = tom.locator(".md-r.rate .md-bulb").count() == 1
    shot(tom, "07-tom-gagne")

    # ---------------------------------------------------------------- le widget de l'accueil
    tom.goto(BASE + "/"); tom.wait_for_selector("#ih-mdj:not([hidden])")
    res["widget"] = tom.inner_text("#ih-mdj").replace("\n", " | ")
    shot(tom, "08-accueil-tel")
    kev.goto(BASE + "/"); kev.wait_for_selector("#ih-mdj:not([hidden])"); res["widget-kevin"] = kev.inner_text("#ih-mdj-go")
    lea.goto(BASE + "/"); lea.wait_for_selector("#ih-mdj:not([hidden])")
    shot(lea, "09-accueil-pc", False)
    b.close()

print(json.dumps(res, ensure_ascii=False, indent=1))
print("erreurs JS :", errs or "aucune")
ok = res["mot-cache-avant-la-fin"] and res["indice-cache-avant"] and res["kevin-ampoule"] and res["classement"][0].find("Tom") >= 0 and not errs
print("OK" if ok else "ÉCHEC")
sys.exit(0 if ok else 1)
