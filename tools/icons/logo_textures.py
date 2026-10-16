"""Les images posées sur le logo 3D (faces des cartes, dessus des jetons), dessinées ici puis plaquées dans Blender.
Usage : python tools/icons/logo_textures.py  ->  tools/icons/logo_tex/*.png"""
import os
from PIL import Image, ImageDraw, ImageFont
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logo_tex"); os.makedirs(OUT, exist_ok=True)
BOLD, SYM = "C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/seguisym.ttf"
RED, INK, PAPER = (214, 30, 52), (28, 28, 38), (252, 247, 237)

def carte(nom, lettre, couleur, enseigne):
    W, H, R = 600, 840, 56
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W - 1, H - 1), R, fill=PAPER)
    d.rounded_rectangle((26, 26, W - 27, H - 27), R - 20, outline=(*couleur, 60), width=4)
    f, fs, fb = ImageFont.truetype(BOLD, 132), ImageFont.truetype(SYM, 96), ImageFont.truetype(SYM, 380)
    for flip in (False, True):
        c = Image.new("RGBA", (W, H), (0, 0, 0, 0)); cd = ImageDraw.Draw(c)
        cd.text((92, 120), lettre, font=f, fill=couleur, anchor="mm"); cd.text((92, 238), enseigne, font=fs, fill=couleur, anchor="mm")
        im.alpha_composite(c.rotate(180) if flip else c)
    d.text((W / 2, H / 2 + 10), enseigne, font=fb, fill=couleur, anchor="mm")
    im.save(os.path.join(OUT, nom + ".png"))

def jeton(nom, fond, liseret):
    S = 512; im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse((0, 0, S - 1, S - 1), fill=fond)
    import math
    for k in range(8):                                   # les huit encoches du bord
        a0 = k * 45 - 9; d.pieslice((0, 0, S - 1, S - 1), a0, a0 + 18, fill=liseret)
    d.ellipse((56, 56, S - 57, S - 57), fill=fond)
    d.ellipse((92, 92, S - 93, S - 93), outline=liseret, width=10)
    d.text((S / 2, S / 2 + 6), "★", font=ImageFont.truetype(SYM, 170), fill=liseret, anchor="mm")
    im.save(os.path.join(OUT, nom + ".png"))

carte("carte_as_coeur", "A", RED, "♥")
carte("carte_roi_pique", "R", INK, "♠")
carte("carte_dame_carreau", "D", RED, "♦")
jeton("jeton_rouge", (210, 36, 52), (255, 246, 232))
jeton("jeton_bleu", (40, 98, 214), (255, 246, 232))
jeton("jeton_noir", (34, 30, 40), (240, 178, 58))
print(sorted(os.listdir(OUT)))
