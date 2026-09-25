#!/usr/bin/env python3
"""Pocketcraft Pixel — die Pixelschrift des Spiels.

Abgeleitet aus Monocraft (Copyright (c) 2022, Idrees Hassan,
https://github.com/IdreesInc/Monocraft, SIL Open Font License 1.1). Die
Pixel jedes Zeichens werden aus der fertigen Schriftdatei zurückgelesen und
als Proportionalschrift neu gesetzt, wie beim großen Vorbild: jedes Zeichen
so breit wie seine Pixel, dazu ein Pixel Abstand. i, l und t werden
schmaler (in Monocraft haben sie Füßchen, damit alle Zeichen gleich breit
sind). Die Ziffern bleiben, wie sie sind — gut zu unterscheiden.

Aufruf:   python3 werkzeug/schrift-bauen.py <pfad/zu/Monocraft.ttf>
Ergebnis: games/pocketcraft/schrift/pocketcraft-pixel.woff2
Braucht:  fonttools, brotli
"""
import math, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.pointInsidePen import PointInsidePen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.fontBuilder import FontBuilder

QUELLE_PX = 120            # ein Pixel in Monocraft (Einheiten der Quelle)
PX = 100                   # ein Pixel in der neuen Schrift; ein Geviert sind zehn Pixel
LEERZEICHEN = 3            # so breit wie beim Vorbild (plus Abstand)
UMFANG = [(0x20, 0x7E), (0xA0, 0x17F), (0x2010, 0x203A), (0x20AC, 0x20AC), (0x2122, 0x2122),
          (0x2190, 0x2193), (0x2212, 0x2212), (0x2264, 0x2265), (0x25CB, 0x25CB), (0x25CF, 0x25CF), (0x279C, 0x279C)]

# Schmale Formen wie beim Vorbild, von oben nach unten
SCHMAL = {
    'i': ['#', '.', '#', '#', '#', '#', '#'],
    'l': ['#.', '#.', '#.', '#.', '#.', '#.', '.#'],
    't': ['.#.', '.#.', '###', '.#.', '.#.', '.#.', '..#'],
}
# was Monocraft nicht hat: der Pfeil im Handwerksraster
EIGENE = {
    0x279C: ['.......', '....#..', '....##.', '#######', '....##.', '....#..', '.......'],
}

ZIEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'games', 'pocketcraft', 'schrift', 'pocketcraft-pixel.woff2')


def pixel_lesen(quelle, cp):
    """Pixel eines Zeichens als Menge (Spalte, Zeile); Zeile 0 liegt direkt auf der Grundlinie"""
    gs, glyf = quelle.getGlyphSet(), quelle['glyf']
    name = quelle.getBestCmap()[cp]
    g = glyf[name]
    if g.numberOfContours == 0:
        return set()
    g.recalcBounds(glyf)
    pixel = set()
    for j in range(math.floor(g.yMin/QUELLE_PX), math.ceil(g.yMax/QUELLE_PX)):
        for i in range(round((g.xMax - g.xMin)/QUELLE_PX)):
            stift = PointInsidePen(gs, (g.xMin + (i + .5)*QUELLE_PX, (j + .5)*QUELLE_PX))
            gs[name].draw(stift)
            if stift.getResult():
                pixel.add((i, j))
    return pixel


def aus_bild(zeilen):
    """Zeilen von oben nach unten, die unterste steht auf der Grundlinie"""
    h = len(zeilen)
    return {(x, h - 1 - y) for y, z in enumerate(zeilen) for x, c in enumerate(z) if c == '#'}


def umriss(pixel):
    """zusammenhängende Pixel einer Zeile als ein Rechteck (im Uhrzeigersinn, wie TrueType es will)"""
    stift = TTGlyphPen(None)
    zeilen = {}
    for x, y in pixel:
        zeilen.setdefault(y, []).append(x)
    for y, xs in sorted(zeilen.items()):
        xs.sort()
        start = xs[0]
        for a, b in zip(xs, xs[1:] + [None]):
            if b == a + 1:
                continue
            x0, x1, y0, y1 = start*PX, (a + 1)*PX, y*PX, (y + 1)*PX
            stift.moveTo((x0, y0)); stift.lineTo((x0, y1)); stift.lineTo((x1, y1)); stift.lineTo((x1, y0)); stift.closePath()
            start = b
    return stift.glyph()


def bauen(quellpfad):
    quelle = TTFont(quellpfad)
    cmap_q = quelle.getBestCmap()
    zeichen = [cp for a, b in UMFANG for cp in range(a, b + 1) if cp in cmap_q or cp in EIGENE]
    reihenfolge, glyphen, breiten, cmap = ['.notdef'], {}, {}, {}
    leer = TTGlyphPen(None)
    # .notdef: ein Rahmen
    notdef = aus_bild(['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'])
    glyphen['.notdef'] = umriss(notdef); breiten['.notdef'] = (6*PX, 0)
    for cp in zeichen:
        ch = chr(cp)
        name = 'uni%04X' % cp
        p = aus_bild(SCHMAL[ch]) if ch in SCHMAL else aus_bild(EIGENE[cp]) if cp in EIGENE else pixel_lesen(quelle, cp)
        if p:
            x0 = min(x for x, _ in p)
            p = {(x - x0, y) for x, y in p}
            breite = max(x for x, _ in p) + 1
            glyphen[name] = umriss(p)
        else:
            breite = LEERZEICHEN
            glyphen[name] = leer.glyph()
        breiten[name] = ((breite + 1)*PX, 0)
        reihenfolge.append(name); cmap[cp] = name
    fb = FontBuilder(10*PX, isTTF=True)
    fb.setupGlyphOrder(reihenfolge)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphen)
    fb.setupHorizontalMetrics(breiten)
    # 7 Pixel Großbuchstaben, 2 darüber für Umlaute, 1 Unterlänge, 1 Luft
    fb.setupHorizontalHeader(ascent=9*PX, descent=-2*PX)
    lizenz = 'This Font Software is licensed under the SIL Open Font License, Version 1.1.'
    fb.setupNameTable({
        'copyright': 'Copyright (c) 2022, Idrees Hassan (https://github.com/IdreesInc/Monocraft). Pocketcraft Pixel: proportional version made for Pocketcraft by AGG Games, 2026.',
        'familyName': 'Pocketcraft Pixel', 'styleName': 'Regular', 'uniqueFontIdentifier': 'PocketcraftPixel-Regular-1.0',
        'fullName': 'Pocketcraft Pixel Regular', 'psName': 'PocketcraftPixel-Regular', 'version': 'Version 1.0',
        'licenseDescription': lizenz, 'licenseInfoURL': 'https://openfontlicense.org',
    })
    fb.setupOS2(sTypoAscender=9*PX, sTypoDescender=-2*PX, sTypoLineGap=0, usWinAscent=10*PX, usWinDescent=3*PX,
                sxHeight=5*PX, sCapHeight=7*PX, fsType=0, achVendID='NONE')
    fb.setupPost()
    fb.font.flavor = 'woff2'
    os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
    fb.save(ZIEL)
    print(len(zeichen), 'Zeichen,', os.path.getsize(ZIEL), 'Bytes →', os.path.normpath(ZIEL))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    bauen(sys.argv[1])
