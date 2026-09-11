#!/usr/bin/env python3
"""
band.py — die Komplettdatei und die Ebenen-Ordner auseinanderhalten.

games/foundtape.html trägt alle drei Bänder in sich: Stil, Rumpf und Code
liegen dort als eingebettete Blöcke. Zum Lesen und Ändern taugt das nicht,
deshalb gibt es die Ebenen zusätzlich als gewöhnliche Ordner:

    games/poolrooms/   Ebene 1
    games/wiese/       Ebene 2

Dieses Werkzeug hält beides deckungsgleich.

    python3 werkzeug/band.py zerlegen   Komplettdatei  -> Ordner
    python3 werkzeug/band.py bauen      Ordner         -> Komplettdatei
    python3 werkzeug/band.py pruefen    meldet Unterschiede, ändert nichts

Ebene 0 lebt nur in der Komplettdatei und wird hier nicht angefasst.
"""
import json, re, sys, os

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEI  = os.path.join(WURZEL, 'games', 'foundtape.html')

# Zwei Fassungen derselben Ebene unterscheiden sich nur in den Pfaden:
# im Ordner liegen die Dateien daneben, in der Komplettdatei stecken sie
# als Datenadresse in window.FT_ASSETS.   (in der Datei, im Ordner)
BAENDER = {
    'b1': dict(ordner='games/poolrooms', block='spiel1', ersatz=[]),
    'b2': dict(ordner='games/wiese', block='spiel2', ersatz=[
        ("(window.FT_ASSETS['wiese/modelle/sirene.glb'])", "'./modelle/sirene.glb'"),
    ]),
}

# Was im Ordner unter dem Rumpf steht und in der Komplettdatei keinen Sinn
# ergäbe: die Importkarte und die beiden Skript-Zeilen.
SCHWANZ = {
 'b1': '''<script type="importmap">
{"imports":{"three":"../bloxrot/lib/three.module.js","three/addons/":"../bloxrot/lib/jsm/"}}
</script>
<script type="module" src="./spiel.js"></script>
<script src="../heim.js" data-ziel="../../index.html" data-ecke="ol" data-rand="8"></script>''',
 'b2': '''<script type="importmap">
{"imports":{"three":"../bloxrot/lib/three.module.js","three/addons/":"../bloxrot/lib/jsm/"}}
</script>
<script type="module" src="./spiel.js"></script>
<script src="../heim.js" data-ziel="../../index.html" data-ecke="ol" data-rand="8"></script>''',
}
MARKE = '<script type="importmap">'


# ---------- Komplettdatei lesen ----------
def datei():
    with open(DATEI, encoding='utf-8') as f: return f.read()

def jsonZeile(s, name):
    """Gibt (anfang, ende, wert) der Zeile 'window.<name> = {...};' zurück."""
    i = s.index('window.%s = ' % name)
    j = s.index('\n', i)
    zeile = s[i:j]
    a = i + zeile.index('{')
    b = i + zeile.rindex('}') + 1
    return a, b, json.loads(s[a:b])

def jsonText(wert):
    """So schreiben, wie es in der Datei steht: eng gesetzt, und '</' als
       '<\\/', damit kein </script> im Text die Seite zerreißt."""
    return json.dumps(wert, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')

def blockGrenzen(s, name):
    marke = '<script type="text/plain" data-ft="%s">' % name
    a = s.index(marke) + len(marke)
    b = s.index('</script>', a)
    return a, b


# ---------- Ordner lesen und schreiben ----------
def ordnerTeile(pfad):
    with open(pfad, encoding='utf-8') as f: h = f.read()
    sa = h.index('<style>') + len('<style>'); sb = h.index('</style>', sa)
    ba = h.index('<body>') + len('<body>'); bb = h.index(MARKE, ba)
    return h, (sa, sb), (ba, bb)

def ordnerSchreiben(pfad, stil, rumpf, schwanz):
    h, (sa, sb), (ba, bb) = ordnerTeile(pfad)
    neu = h[:ba] + '\n\n' + rumpf + '\n\n' + h[bb:]
    # Stilgrenzen verschieben sich nicht, der Stil steht vor dem Rumpf
    neu = neu[:sa] + stil + neu[sb:]
    with open(pfad, 'w', encoding='utf-8') as f: f.write(neu)


# ---------- die beiden Richtungen ----------
def ausDatei():
    """Liest alle Bänder aus der Komplettdatei: {b: (stil, rumpf, code)}"""
    s = datei()
    _, _, B = jsonZeile(s, 'FT_BAENDER')
    raus = {}
    for b, cfg in BAENDER.items():
        a, e = blockGrenzen(s, cfg['block'])
        raus[b] = (B[b]['stil'], B[b]['rumpf'], s[a:e])
    return raus

def ausOrdner():
    """Liest alle Bänder aus den Ordnern, in der Form der Komplettdatei."""
    raus = {}
    for b, cfg in BAENDER.items():
        ordner = os.path.join(WURZEL, cfg['ordner'])
        h, (sa, sb), (ba, bb) = ordnerTeile(os.path.join(ordner, 'index.html'))
        with open(os.path.join(ordner, 'spiel.js'), encoding='utf-8') as f: code = f.read()
        for inDatei, imOrdner in cfg['ersatz']:
            if imOrdner not in code:
                raise SystemExit('%s: %r nicht gefunden — Pfad geändert?' % (cfg['ordner'], imOrdner))
            code = code.replace(imOrdner, inDatei)
        raus[b] = (h[sa:sb], h[ba:bb].strip(), code)
    return raus

def zerlegen():
    for b, (stil, rumpf, code) in ausDatei().items():
        cfg = BAENDER[b]
        ordner = os.path.join(WURZEL, cfg['ordner'])
        for inDatei, imOrdner in cfg['ersatz']:
            code = code.replace(inDatei, imOrdner)
        with open(os.path.join(ordner, 'spiel.js'), 'w', encoding='utf-8') as f: f.write(code)
        ordnerSchreiben(os.path.join(ordner, 'index.html'), stil, rumpf, SCHWANZ[b])
        print('%-18s  Stil %6d  Rumpf %6d  Code %7d' % (cfg['ordner'], len(stil), len(rumpf), len(code)))

def bauen():
    s = datei()
    teile = ausOrdner()
    # erst die Codeblöcke, von hinten nach vorn, damit die Grenzen halten
    stellen = []
    for b, cfg in BAENDER.items():
        a, e = blockGrenzen(s, cfg['block'])
        stellen.append((a, e, teile[b][2]))
    ja, je, B = jsonZeile(s, 'FT_BAENDER')
    for b in BAENDER:
        B[b]['stil'], B[b]['rumpf'] = teile[b][0], teile[b][1]
    stellen.append((ja, je, jsonText(B)))
    for a, e, neu in sorted(stellen, reverse=True):
        s = s[:a] + neu + s[e:]
    with open(DATEI, 'w', encoding='utf-8') as f: f.write(s)
    print('games/foundtape.html neu geschrieben: %d Bytes' % len(s))

def pruefen():
    d, o = ausDatei(), ausOrdner()
    gleich = True
    for b in BAENDER:
        for i, was in enumerate(('Stil', 'Rumpf', 'Code')):
            if d[b][i] != o[b][i]:
                gleich = False
                print('%s %s weicht ab (%d Bytes in der Datei, %d im Ordner)'
                      % (b, was, len(d[b][i]), len(o[b][i])))
    print('deckungsgleich' if gleich else 'NICHT deckungsgleich')
    return 0 if gleich else 1

if __name__ == '__main__':
    was = sys.argv[1] if len(sys.argv) > 1 else 'pruefen'
    sys.exit({'zerlegen': zerlegen, 'bauen': bauen, 'pruefen': pruefen}[was]() or 0)
