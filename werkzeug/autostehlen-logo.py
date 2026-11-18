#!/usr/bin/env python3
# Zeichnet das Logo von Illegal Autostehlen neu (scharfe Kanten, saubere Konturen).
# Aufruf: python3 werkzeug/autostehlen-logo.py <pricedown.ttf> games/autostehlen/bilder/logo.png
# Logo neu gezeichnet: gleiche Komposition wie die Vorlage, aber als saubere Vektorformen.
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
S = 2                      # Überabtastung
W, H = 1240, 980
OX, OY = 60, 50            # Rand für Schatten
font_path = sys.argv[1]; out = sys.argv[2]

def P(pts): return [((x + OX)*S, (y + OY)*S) for x, y in pts]
V = [(0, 0), (286, 0), (456, 427), (626, 0), (911, 0), (563, 857), (341, 857)]
I = [(826, 0), (1091, 0), (1091, 857), (826, 857)]
def schrumpf(poly, d):
    # Polygon um d nach innen versetzen (einfach: über Maske und Erosion)
    return d

def maske(polys):
    m = Image.new('L', (W*S, H*S), 0); g = ImageDraw.Draw(m)
    for p in polys: g.polygon(P(p), fill=255)
    return m
def erodieren(m, px):
    # MinFilter braucht ungerade Größe; mehrfach anwenden für große Radien
    r = px*S
    while r > 0:
        k = min(r, 12); m = m.filter(ImageFilter.MinFilter(2*k + 1)); r -= k
    return m
def dilatieren(m, px):
    r = px*S
    while r > 0:
        k = min(r, 12); m = m.filter(ImageFilter.MaxFilter(2*k + 1)); r -= k
    return m
def verlauf(farben, w=W*S, h=H*S, senkrecht=True):
    img = Image.new('RGBA', (w, h)); px = img.load()
    n = len(farben) - 1
    for y in range(h):
        t = y/(h - 1); i = min(int(t*n), n - 1); f = t*n - i
        a, b = farben[i], farben[i + 1]
        c = tuple(int(a[k] + (b[k] - a[k])*f) for k in range(3)) + (255,)
        for x in range(w): px[x, y] = c
    return img
def verlaufSchnell(farben, w, h):
    # senkrechter Verlauf, eine Spalte gerechnet und gestreckt
    sp = Image.new('RGBA', (1, h)); px = sp.load(); n = len(farben) - 1
    for y in range(h):
        t = y/(h - 1); i = min(int(t*n), n - 1); f = t*n - i
        a, b = farben[i], farben[i + 1]
        px[0, y] = tuple(int(a[k] + (b[k] - a[k])*f) for k in range(3)) + (255,)
    return sp.resize((w, h))

bild = Image.new('RGBA', (W*S, H*S), (0, 0, 0, 0))
form = maske([V, I])
# Schatten unter beiden Buchstaben
sch = form.filter(ImageFilter.GaussianBlur(18*S))
schatten = Image.new('RGBA', bild.size, (40, 0, 70, 0)); schatten.putalpha(sch.point(lambda v: v*.55))
bild.alpha_composite(schatten, (10*S, 16*S))
glanzM = Image.new('L', bild.size, 0); gd = ImageDraw.Draw(glanzM)
for y in range(0, int(H*S*.42)): gd.line([(0, y), (W*S, y)], fill=int(46*(1 - y/(H*S*.42))))
randF = verlaufSchnell([(150, 96, 255), (128, 74, 245), (112, 60, 230)], W*S, H*S)
fuellF = verlaufSchnell([(176, 92, 244), (214, 90, 222), (244, 96, 196)], W*S, H*S)
def buchstabe(poly):
    m = maske([poly])
    # leichter Schlagschatten des I auf das V
    s2 = m.filter(ImageFilter.GaussianBlur(8*S)); sl = Image.new('RGBA', bild.size, (30, 0, 60, 0)); sl.putalpha(s2.point(lambda v: v*.35))
    bild.alpha_composite(sl, (-6*S, 6*S))
    r = randF.copy(); r.putalpha(m); bild.alpha_composite(r)
    innen = erodieren(m, 70)
    f = fuellF.copy(); f.putalpha(innen); bild.alpha_composite(f)
    kante = ImageChops.subtract(dilatieren(innen, 4), innen)
    h = Image.new('RGBA', bild.size, (255, 214, 250, 0)); h.putalpha(kante.point(lambda v: v*.55)); bild.alpha_composite(h)
    g = Image.new('RGBA', bild.size, (255, 255, 255, 0)); g.putalpha(ImageChops.multiply(glanzM, innen)); bild.alpha_composite(g)
buchstabe(V)
buchstabe(I)

# Schrift: Pricedown, weiß, schwarze Kontur, harter Versatzschatten
def wort(text, x, y, breite):
    f = ImageFont.truetype(font_path, 200*S)
    bb = f.getbbox(text)
    k = breite*S/(bb[2] - bb[0])
    f = ImageFont.truetype(font_path, int(200*S*k))
    bb = f.getbbox(text)
    return (text, f, (x + OX)*S - bb[0], (y + OY)*S - bb[1])
woerter = [wort('illegal', 205, 118, 640), wort('auto', 148, 322, 476), wort('stehlen', 276, 452, 790)]
lagen = []
for text, f, x, y in woerter:
    m = Image.new('L', bild.size, 0); ImageDraw.Draw(m).text((x, y), text, font=f, fill=255)
    lagen.append(m)
schrift = Image.new('L', bild.size, 0)
for m in lagen: schrift = ImageChops.lighter(schrift, m)
kontur = dilatieren(schrift, 9)
versatz = ImageChops.offset(kontur, 7*S, 8*S)
for maskeX, farbe in [(versatz, (0, 0, 0, 255)), (kontur, (0, 0, 0, 255))]:
    l = Image.new('RGBA', bild.size, farbe); l.putalpha(maskeX); bild.alpha_composite(l)
weiss = verlaufSchnell([(255, 255, 255), (250, 246, 252), (236, 228, 240)], W*S, H*S); weiss.putalpha(schrift)
bild.alpha_composite(weiss)
bild = bild.resize((W, H), Image.LANCZOS)
bild = bild.crop(bild.getbbox())
bild.save(out, optimize=True)
print(bild.size)
