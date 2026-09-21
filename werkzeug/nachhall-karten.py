# -*- coding: utf-8 -*-
"""Baut die Ebenen von Nachhall aus Räumen und Gängen, prüft sie und gibt
   sie als JS-Zeichenketten aus, die in games/nachhall.html gehören.

   Von Hand gemalte Karten haben regelmässig ungleiche Zeilen oder einen
   Ausgang, zu dem kein Weg führt. Geprüft wird deshalb dreierlei: der
   Rand ist zu, der Ausgang ist erreichbar, und um jeden Horcher führt
   kein Weg herum, der ihm um mehr als sieben Schritte ausweicht — sonst
   stünde er nur herum.

       python3 werkzeug/nachhall-karten.py [ziel.js]
   """
from collections import deque

class Karte:
    def __init__(self, b, h):
        self.b, self.h = b, h
        self.g = [['#']*b for _ in range(h)]
    def raum(self, x0, y0, x1, y1):
        for y in range(y0, y1+1):
            for x in range(x0, x1+1):
                self.g[y][x] = '.'
        return self
    def gangH(self, y, x0, x1, dick=1):
        for d in range(dick): self.raum(x0, y+d, x1, y+d)
        return self
    def gangV(self, x, y0, y1, dick=1):
        for d in range(dick): self.raum(x+d, y0, x+d, y1)
        return self
    def block(self, x0, y0, x1, y1):
        for y in range(y0, y1+1):
            for x in range(x0, x1+1):
                self.g[y][x] = '#'
        return self
    def setz(self, x, y, z):
        assert self.g[y][x] == '.', 'Zeichen %r liegt in einer Wand (%d,%d)' % (z, x, y)
        self.g[y][x] = z
        return self
    def zeilen(self):
        return [''.join(r) for r in self.g]

def pruefe(name, z):
    b = len(z[0])
    assert all(len(r) == b for r in z), name + ': ungleiche Zeilenlängen'
    start = ziel = None
    zaehl = {}
    for y, r in enumerate(z):
        for x, c in enumerate(r):
            zaehl[c] = zaehl.get(c, 0) + 1
            if c == '@': start = (x, y)
            if c == 'X': ziel = (x, y)
    assert zaehl.get('@') == 1, name + ': genau ein Start'
    assert zaehl.get('X') == 1, name + ': genau ein Ausgang'
    # Rand muss zu sein
    for x in range(b):
        assert z[0][x] == '#' and z[-1][x] == '#', name + ': oben/unten offen'
    for y in range(len(z)):
        assert z[y][0] == '#' and z[y][-1] == '#', name + ': links/rechts offen'
    # begehbar?
    frei = lambda x, y: z[y][x] != '#'
    ges = {start}; q = deque([start]); weit = {start: 0}
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            n = (x+dx, y+dy)
            if n not in ges and 0 <= n[0] < b and 0 <= n[1] < len(z) and frei(*n):
                ges.add(n); weit[n] = weit[(x,y)]+1; q.append(n)
    assert ziel in ges, name + ': Ausgang nicht erreichbar'
    for y, r in enumerate(z):
        for x, c in enumerate(r):
            if c in 'hpos' and (x, y) not in ges:
                raise AssertionError('%s: %r bei (%d,%d) liegt abgeschnitten' % (name, c, x, y))
    return dict(name=name, breite=b, hoehe=len(z), weg=weit[ziel],
                horcher=zaehl.get('h',0)+zaehl.get('p',0), steine=zaehl.get('s',0),
                tropfen=zaehl.get('o',0))

EBENEN = []

# ── 1 · Erste Schritte ── ein Knick, sonst nichts. Laufen malt die Wände.
k = Karte(34, 16)
k.gangH(2, 2, 12, 2).gangV(11, 2, 12, 2).gangH(11, 11, 30, 2)
k.setz(2, 2, '@').setz(30, 12, 'X').setz(11, 7, 'o')
EBENEN.append(('ERSTE SCHRITTE', k.zeilen()))

# ── 2 · Enge ── mehrere Abzweige; ohne Klatschen sucht man lange.
k = Karte(34, 18)
k.gangH(2, 2, 31, 1).gangV(2, 2, 15, 1).gangV(31, 2, 15, 1).gangH(15, 2, 31, 1)
k.gangV(9, 2, 9, 1).gangH(9, 9, 24, 1).gangV(24, 9, 15, 1)
k.gangV(16, 4, 15, 1).gangH(6, 16, 28, 1).gangV(28, 6, 9, 1)
k.setz(2, 2, '@').setz(31, 15, 'X').setz(16, 12, 'o').setz(28, 8, 'o')
EBENEN.append(('ENGE', k.zeilen()))

# ── 3 · Der Erste ── ein Saal, einer darin. Schleichen oder gehört werden.
k = Karte(36, 18)
k.gangH(3, 2, 8, 2)
k.raum(8, 3, 27, 14)
k.gangH(14, 27, 33, 2).gangV(33, 8, 14, 2)
k.block(12, 3, 16, 10).block(20, 7, 25, 14)
k.setz(2, 3, '@').setz(33, 9, 'X').setz(26, 5, 'h').setz(10, 13, 'o')
EBENEN.append(('DER ERSTE', k.zeilen()))

# ── 4 · Tropfen ── Wasser zeigt den Weg, kostet aber nichts. Zwei Horcher.
k = Karte(38, 20)
k.gangH(2, 2, 35, 2).gangH(16, 2, 35, 2).gangV(2, 2, 17, 2).gangV(34, 2, 17, 2)
k.raum(10, 6, 16, 12).raum(21, 6, 27, 12)
k.gangV(13, 3, 6, 1).gangV(24, 12, 16, 1).gangH(9, 16, 21, 1)
# Der Ring wird zweimal durchtrennt: rechts oben und links unten. Wer aussen
# herumläuft, steht vor einer Wand und muss durch die beiden Säle.
k.block(28, 2, 33, 3).block(2, 16, 9, 17)
k.setz(2, 2, '@').setz(35, 17, 'X')
k.setz(13, 9, 'p').setz(24, 9, 'h')
k.setz(3, 9, 'o').setz(35, 9, 'o').setz(18, 3, 'o')
EBENEN.append(('TROPFEN', k.zeilen()))

# ── 5 · Steine ── ein Gang, zwei Horcher, zwei Steine. Erst locken.
k = Karte(40, 16)
k.gangH(2, 2, 37, 2)
k.raum(6, 5, 14, 11).raum(24, 5, 33, 11)
k.gangV(9, 3, 5, 1).gangV(28, 3, 5, 1)
k.gangH(8, 14, 24, 1)
k.gangV(37, 2, 13, 2).gangH(12, 30, 37, 2)
k.gangV(30, 11, 12, 1)
k.setz(2, 2, '@').setz(37, 13, 'X')
k.setz(10, 8, 'h').setz(28, 8, 'h')
k.setz(4, 3, 's').setz(5, 3, 's').setz(20, 8, 'o')
EBENEN.append(('STEINE', k.zeilen()))

# ── 6 · Kreuzung ── vier Arme, drei Horcher, einer davon wandert.
k = Karte(38, 22)
k.gangH(10, 2, 35, 2).gangV(18, 2, 19, 2)
k.raum(4, 3, 9, 8).raum(28, 3, 34, 8)
k.raum(4, 13, 12, 19).raum(26, 13, 34, 19)
k.gangV(6, 8, 10, 1).gangV(31, 8, 10, 1).gangV(8, 11, 13, 1).gangV(30, 11, 13, 1)
k.setz(2, 10, '@').setz(34, 19, 'X')
k.setz(6, 5, 'h').setz(31, 5, 'p').setz(8, 16, 'h')
k.setz(18, 4, 'o').setz(18, 17, 'o')
k.setz(3, 11, 's').setz(19, 10, 's')
EBENEN.append(('KREUZUNG', k.zeilen()))

# ── 7 · Stille ── weite Halle, vier Ruhende, kein Tropfen. Nur Steine.
k = Karte(40, 22)
k.raum(2, 2, 37, 19)
for bx in (8, 16, 24, 32):
    k.block(bx, 5, bx+2, 9).block(bx-2, 12, bx, 16)
k.setz(3, 3, '@').setz(37, 19, 'X')
k.setz(12, 7, 'h').setz(20, 14, 'h').setz(28, 7, 'h').setz(14, 18, 'p')
k.setz(3, 6, 's').setz(3, 7, 's').setz(3, 8, 's')
EBENEN.append(('STILLE', k.zeilen()))

# ── 8 · Nachhall ── alles zusammen, und der Ausgang ruft nur selten.
k = Karte(42, 24)
k.gangH(2, 2, 39, 2).gangV(2, 2, 21, 2).gangH(20, 2, 39, 2).gangV(38, 2, 21, 2)
k.raum(8, 6, 16, 12).raum(24, 6, 33, 12)
k.raum(10, 15, 31, 18)
k.gangV(12, 4, 6, 1).gangV(28, 4, 6, 1)
k.gangV(14, 12, 15, 1).gangV(27, 12, 15, 1)
k.gangH(9, 16, 24, 1)
k.gangV(20, 18, 20, 1)
# Der äussere Ring ist an zwei Stellen zu: rechts oben und links unten.
# Damit führt der einzige Weg durch die Säle und an ihnen vorbei.
k.block(38, 2, 39, 13).block(2, 20, 9, 21)
k.setz(2, 2, '@').setz(39, 21, 'X')
k.setz(12, 9, 'h').setz(28, 9, 'p').setz(16, 16, 'h').setz(26, 17, 'h').setz(20, 9, 'p')
k.setz(4, 3, 's').setz(5, 3, 's').setz(6, 3, 's').setz(20, 19, 'o')
EBENEN.append(('NACHHALL', k.zeilen()))

def hoerfeld(z):
    """Entfernung jedes Bodenfeldes zum nächsten Horcher — über begehbare
       Felder, nicht Luftlinie. Schall geht um Ecken, nicht durch Wände."""
    b, hh = len(z[0]), len(z)
    f = [[-1]*b for _ in range(hh)]
    q = deque()
    for y in range(hh):
        for x in range(b):
            if z[y][x] in 'hp': f[y][x] = 0; q.append((x,y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if 0<=nx<b and 0<=ny<hh and z[ny][nx] != '#' and f[ny][nx] < 0:
                f[ny][nx] = f[y][x]+1; q.append((nx,ny))
    return f

def umgehbar(z, r):
    """Gibt es einen Weg von @ nach X, auf dem kein Horcher je näher als
       r Schritte ist? Dann steht er nur herum."""
    if not any(c in 'hp' for row in z for c in row): return None
    f = hoerfeld(z)
    b, hh = len(z[0]), len(z)
    frei = lambda x, y: z[y][x] != '#' and (f[y][x] < 0 or f[y][x] > r)
    start = next((x,y) for y,row in enumerate(z) for x,c in enumerate(row) if c=='@')
    ziel  = next((x,y) for y,row in enumerate(z) for x,c in enumerate(row) if c=='X')
    if not frei(*start) or not frei(*ziel): return False
    ges = {start}; q = deque([start])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            nx, ny = x+dx, y+dy
            if (nx,ny) not in ges and 0<=nx<b and 0<=ny<hh and frei(nx,ny):
                ges.add((nx,ny)); q.append((nx,ny))
    return ziel in ges

for name, z in EBENEN:
    d = pruefe(name, z)
    u = umgehbar(z, 7)
    d['umgehbar'] = u'—' if u is None else ('JA — sie stehen umsonst' if u else 'nein')
    print('%-15s %2dx%-2d  Weg %3d  Horcher %d  Steine %d  Tropfen %d'
          % (d['name'], d['breite'], d['hoehe'], d['weg'], d['horcher'], d['steine'], d['tropfen']),
          '  weiter Bogen:', d['umgehbar'])

import os, sys
ziel = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nachhall-ebenen.js')
with open(ziel, 'w', encoding='utf-8') as f:
    f.write('const EBENEN = [\n')
    for name, z in EBENEN:
        f.write('  { name:%r, karte:[\n' % name)
        for r in z: f.write("    '%s',\n" % r)
        f.write('  ] },\n')
    f.write('];\n')
print('\ngeschrieben nach', ziel)
