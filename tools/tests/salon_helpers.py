"""Outils communs des tests de jeux de table : ouvrir un salon à plusieurs, relever les messages reçus.
Mode serveur (comme sur pages.dev) : SRV=ws://127.0.0.1:8787 (wrangler dev -c server/wrangler.jsonc --port 8787).
Sans SRV, l'hôte fait tourner la partie (PeerJS, il faut Internet), et les messages ne sont pas relevés."""
import os, time, json

SRV = os.environ.get("SRV", "")


class Table:
    def __init__(self, pw, base, out):
        self.b = pw.chromium.launch(); self.base = base; self.out = out; self.errs = []; self.frames = {}; self.shots = set()
        os.makedirs(out, exist_ok=True)

    def page(self, name, w, h, theme, emo):
        """Un joueur dans son propre navigateur : 390×844 = téléphone, 1440×900 = PC."""
        ctx = self.b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1, has_touch=w < 800)
        init = f"localStorage.setItem('dc-theme', '{theme}'); localStorage.setItem('dc-emo', '{emo}');"
        if SRV: init += f"localStorage.setItem('dc-server', '{SRV}');"
        ctx.add_init_script(f"try {{ {init} }} catch {{}}")
        p = ctx.new_page(); p._name = name; self.frames[name] = []
        p.on("pageerror", lambda e: self.errs.append(f"{name}: {str(e)[:200]}"))
        p.on("websocket", lambda ws: ws.on("framereceived", lambda f: self.frames[name].append(f if isinstance(f, str) else "")))
        return p

    def create(self, p):
        p.goto(self.base + "?t=" + str(time.time())); p.wait_for_timeout(600)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'create'); p.fill("#in-name", p._name); p.press("#in-name", "Enter")
        p.wait_for_function("() => /[A-Z]{4}/.test(document.getElementById('lobby-code').textContent)", timeout=40000)
        return p.inner_text("#lobby-code").strip()

    def join(self, p, code):
        p.goto(self.base + "?t=" + str(time.time())); p.wait_for_timeout(500)
        p.evaluate("s => document.getElementById('f-home').dataset.step = s", 'join')
        p.fill("#in-code", code); p.fill("#in-name", p._name); p.click("button[data-act=join]")
        p.wait_for_selector("#s-lobby:not([hidden])", timeout=20000)

    def shot(self, p, name, full=False):
        if name in self.shots: return
        self.shots.add(name); p.screenshot(path=f"{self.out}/{name}.png", full_page=full)

    def states(self, name, key):
        """Les états reçus par ce joueur pour un jeu (clé de la vue : 'mt', 'nv', 'co'…), texte brut et objet."""
        for f in self.frames[name]:
            try: m = json.loads(f)
            except Exception: continue
            if m.get("t") == "state" and (m.get("s") or {}).get(key): yield f, m["s"][key]

    def close(self): self.b.close()
